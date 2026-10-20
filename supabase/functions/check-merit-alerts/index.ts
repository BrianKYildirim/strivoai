/**
 * check-merit-alerts: Cron-triggered alert evaluator for merit system.
 * REQ-IDs: NFR-11
 *
 * Design decisions:
 * - T-13-AL1: alert_state debounce table enforces 60-minute minimum between same-key emails
 * - T-13-AL2: Upsert of alert_state happens BEFORE email dispatch (Pitfall 7)
 * - T-13-AL3: last_value jsonb stores the snapshot that triggered each alert
 * - T-13-AL4: Non-fatal handling of DB errors — function returns 200 so pg_cron does not backlog
 * - T-13-CRON1: authMode 'internal' validates INTERNAL_JOB_SECRET
 * - Email dispatched via send-strivo-email forward (no direct Resend integration)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from '../_shared/auth.ts';
import { handleOptionsRequest } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { createLogger } from '../_shared/logger.ts';

const log = createLogger('check-merit-alerts');

export const AI_FAILURE_THRESHOLD = 0.05;   // D-16, ROADMAP SC-6
export const SHOP_FAILURE_THRESHOLD = 0.02; // D-16, ROADMAP SC-6
export const DEBOUNCE_MINUTES = 60;

export type AlertKey = 'negative_balance' | 'ai_failure_rate_high' | 'shop_failure_rate_high';

// ── Dependency injection for testability ─────────────────────────────────────

export interface AlertDeps {
  getServiceClient: () => unknown;
  /**
   * `typeof requireAuth` rather than a re-declared shape: the hand-written
   * `(req, opts: { type: string }) => Promise<unknown>` was lossy in two ways — `string`
   * is not assignable to `AuthType` (so the real requireAuth did not satisfy this seam),
   * and `Promise<unknown>` discarded the per-auth-type return contract. Referencing the
   * real signature keeps the seam honest as auth.ts evolves. Matches the precedent in
   * admin-merit-metrics/index.ts. Tests run under --no-check and are unaffected.
   */
  requireAuth: typeof requireAuth;
  fetchFn: typeof fetch;
  nowFn: () => number;
}

const defaultDeps: AlertDeps = {
  getServiceClient,
  requireAuth,
  fetchFn: fetch,
  nowFn: () => Date.now(),
};

// ── tryFireAlert: debounce check + upsert BEFORE email (Pitfall 7) ──────────

export async function tryFireAlert(
  svc: { from: (t: string) => unknown },
  key: AlertKey,
  payload: Record<string, unknown>,
  nowFn: () => number = Date.now,
): Promise<'fired' | 'debounced' | 'db-error'> {
  // deno-lint-ignore no-explicit-any
  const svcAny = svc as any;

  // Check debounce state
  const { data: prior, error: selErr } = await svcAny
    .from('alert_state')
    .select('last_fired_at')
    .eq('alert_key', key)
    .maybeSingle();

  if (selErr) {
    log.warn('alert-state-select-error', { key, error: selErr.message });
    return 'db-error';
  }

  if (prior?.last_fired_at) {
    const ageMs = nowFn() - new Date(prior.last_fired_at).getTime();
    if (ageMs < DEBOUNCE_MINUTES * 60_000) return 'debounced';
  }

  // Upsert FIRST (Pitfall 7): debounce state must persist even if email later fails
  const { error: upErr } = await svcAny
    .from('alert_state')
    .upsert({
      alert_key: key,
      last_fired_at: new Date(nowFn()).toISOString(),
      last_value: payload,
    });

  if (upErr) {
    log.warn('alert-state-upsert-error', { key, error: upErr.message });
    return 'db-error';
  }

  return 'fired';
}

// ── dispatchEmail: forward through send-strivo-email ─────────────────────────

export async function dispatchEmail(
  subject: string,
  body: string,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-strivo-email`;
  const admins = (Deno.env.get('ADMIN_EMAILS') ?? '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);

  if (admins.length === 0) {
    log.warn('no-admin-emails-configured');
    return false;
  }

  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-job-secret': Deno.env.get('INTERNAL_JOB_SECRET') ?? '',
      },
      body: JSON.stringify({
        to: admins[0],
        emailType: 'credits_exhausted',
        userName: 'Admin',
        metadata: { subject, body: body },
      }),
    });
    return res.ok;
  } catch (e) {
    log.error('email-dispatch-error', { message: (e as Error).message });
    return false;
  }
}

// ── Handler factory (exported for testing) ───────────────────────────────────

export function createHandler(deps: AlertDeps = defaultDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') {
      return handleOptionsRequest({ type: 'internal' });
    }

    // Auth gate (T-13-CRON1: internal secret required)
    await deps.requireAuth(req, { type: 'internal' });

    // deno-lint-ignore no-explicit-any
    const svc = deps.getServiceClient() as any;
    let evaluated = 0;
    let dispatched = 0;
    let emailErrors = 0;

    // ── Evaluator 1: negative balance ────────────────────────────────────────
    evaluated++;
    try {
      const { data: neg, error: negErr } = await svc
        .from('user_merits')
        .select('user_id,subscription_balance,shop_balance')
        .or('subscription_balance.lt.0,shop_balance.lt.0')
        .limit(10);

      if (!negErr && neg && neg.length > 0) {
        const state = await tryFireAlert(svc, 'negative_balance', { count: neg.length, sample: neg }, deps.nowFn);
        if (state === 'fired') {
          const ok = await dispatchEmail(
            '[Strivo] Negative merit balance detected',
            `Users with negative balance: ${neg.length}`,
            deps.fetchFn,
          );
          if (ok) dispatched++;
          else emailErrors++;
        }
      }
    } catch (e) {
      log.warn('evaluator-error', { evaluator: 'negative_balance', message: (e as Error).message });
    }

    // ── Evaluator 2: AI failure rate ─────────────────────────────────────────
    evaluated++;
    try {
      const { data: aiRate, error: aiErr } = await svc.rpc('get_ai_failure_rate_1h');
      if (!aiErr && typeof aiRate === 'number' && aiRate >= AI_FAILURE_THRESHOLD) {
        const state = await tryFireAlert(
          svc,
          'ai_failure_rate_high',
          { rate: aiRate, threshold: AI_FAILURE_THRESHOLD },
          deps.nowFn,
        );
        if (state === 'fired') {
          const ok = await dispatchEmail(
            '[Strivo] AI failure rate elevated',
            `1h failure rate: ${(aiRate * 100).toFixed(1)}%`,
            deps.fetchFn,
          );
          if (ok) dispatched++;
          else emailErrors++;
        }
      }
    } catch (e) {
      log.warn('evaluator-error', { evaluator: 'ai_failure_rate', message: (e as Error).message });
    }

    // ── Evaluator 3: Shop failure rate ───────────────────────────────────────
    evaluated++;
    try {
      const { data: shopRate, error: shopErr } = await svc.rpc('get_shop_failure_rate_1h');
      if (!shopErr && typeof shopRate === 'number' && shopRate >= SHOP_FAILURE_THRESHOLD) {
        const state = await tryFireAlert(
          svc,
          'shop_failure_rate_high',
          { rate: shopRate, threshold: SHOP_FAILURE_THRESHOLD },
          deps.nowFn,
        );
        if (state === 'fired') {
          const ok = await dispatchEmail(
            '[Strivo] Shop failure rate elevated',
            `1h failure rate: ${(shopRate * 100).toFixed(1)}%`,
            deps.fetchFn,
          );
          if (ok) dispatched++;
          else emailErrors++;
        }
      }
    } catch (e) {
      log.warn('evaluator-error', { evaluator: 'shop_failure_rate', message: (e as Error).message });
    }

    return new Response(JSON.stringify({ evaluated, dispatched, email_errors: emailErrors }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

// ── Production entry point ───────────────────────────────────────────────────

serve(createHandler(defaultDeps));

/**
 * admin-merit-metrics: Admin-only read endpoint for merit system observability.
 * REQ-IDs: NFR-10
 *
 * Design decisions:
 * - T-13-AUTH1: Dual admin gate — ADMIN_EMAILS env (fast path) + user_roles fallback
 * - T-13-AUTH2: authMode 'user' rejects unauthenticated before admin check
 * - T-13-ADM1: Views expose tier-aggregated counts only (no per-user rows)
 * - Uses serve() pattern (not handleRequest) since this is a read-only GET with no body
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from '../_shared/auth.ts';
import { corsHeaders, handleOptionsRequest } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { createLogger } from '../_shared/logger.ts';

const log = createLogger('admin-merit-metrics');

// ── Dependency injection for testability ─────────────────────────────────────

interface Deps {
  getServiceClient: () => ReturnType<typeof getServiceClient>;
  requireAuth: typeof requireAuth;
}

const defaultDeps: Deps = {
  getServiceClient,
  requireAuth,
};

// ── Admin check (T-13-AUTH1: dual gate) ──────────────────────────────────────

async function isAdmin(
  userId: string,
  email: string | null,
  svc: ReturnType<typeof getServiceClient>,
): Promise<boolean> {
  // Primary: env-based fast path
  const envList = (Deno.env.get('ADMIN_EMAILS') ?? '')
    .split(',')
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);
  if (email && envList.includes(email.toLowerCase())) return true;

  // Fallback: user_roles table
  const { data, error } = await svc
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();

  if (error) {
    log.warn('admin-check-fallback-error', { userId, error: error.message });
    return false;
  }
  return !!data;
}

// ── Handler factory (exported for testing) ───────────────────────────────────

export function createHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') {
      return handleOptionsRequest({ type: 'internal' });
    }

    // Auth gate (T-13-AUTH2: anon rejected here)
    const userContext = await deps.requireAuth(req, { type: 'user' });
    if (!userContext) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders({ type: 'internal' }), 'Content-Type': 'application/json' },
      });
    }

    const svc = deps.getServiceClient();

    // Pull email from profile (auth.ts already provides it, but belt+suspenders)
    const email = userContext.email || null;

    // Admin gate (T-13-AUTH1: dual check)
    if (!(await isAdmin(userContext.userId, email, svc))) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders({ type: 'internal' }), 'Content-Type': 'application/json' },
      });
    }

    try {
      const [circ, feat, shop, funnel] = await Promise.all([
        svc.from('v_merits_in_circulation').select('*'),
        svc.from('v_feature_consumption_daily').select('*'),
        svc.from('v_shop_purchases_daily').select('*'),
        svc.from('v_conversion_funnel').select('*'),
      ]);

      if (circ.error || feat.error || shop.error || funnel.error) {
        log.error('view-read-error', {
          circ: circ.error?.message,
          feat: feat.error?.message,
          shop: shop.error?.message,
          funnel: funnel.error?.message,
        });
        return new Response(JSON.stringify({ error: 'metrics-unavailable' }), {
          status: 500,
          headers: { ...corsHeaders({ type: 'internal' }), 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        merits_in_circulation: circ.data ?? [],
        feature_consumption: feat.data ?? [],
        shop_purchases: shop.data ?? [],
        conversion_funnel: funnel.data ?? [],
      }), {
        status: 200,
        headers: { ...corsHeaders({ type: 'internal' }), 'Content-Type': 'application/json' },
      });
    } catch (e) {
      log.error('admin-metrics-exception', { message: (e as Error).message });
      return new Response(JSON.stringify({ error: 'metrics-unavailable' }), {
        status: 500,
        headers: { ...corsHeaders({ type: 'internal' }), 'Content-Type': 'application/json' },
      });
    }
  };
}

// ── Production entry point ───────────────────────────────────────────────────

serve(createHandler(defaultDeps));

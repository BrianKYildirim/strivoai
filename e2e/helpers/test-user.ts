/**
 * Phase 09 - 09-09 - shared NODE-side admin helpers for the E2E test user (D9-04).
 *
 * SECURITY (threat T-03-01, the e2e/global-setup.ts precedent): SUPABASE_TEST_SERVICE_ROLE_KEY
 * is read from process.env in the NODE process ONLY. It is NEVER passed to page.evaluate /
 * page.addInitScript / any browser-visible surface. The browser contexts hold only the
 * anon-key session from storageState.
 *
 * WHY THIS FILE EXISTS: 09-06 discovered (D9-04) that any E2E driving a REAL analysis spends
 * REAL Merits and consumes a REAL rate-limit budget, and it fixed that inside ONE spec. Once
 * `verify:baseline` runs the E2E lane on every deploy AND `resume-analysis.spec.ts` drives a
 * genuine analysis again (D9-03), the resource-exhaustion flake stops being one spec's problem:
 *
 *   - Merits: resume analysis costs 3 on free tier; the seeded user starts with 10 lifetime
 *     Merits. After a few gate runs `canAfford()` goes false, Upload's submit button goes
 *     `disabled`, and every merit-spending spec fails with "element is not enabled" instead of
 *     a real assertion.
 *   - Rate limit: analyze-resume allows a free user 5 analyses per HOUR (a fixed 3600s window
 *     in rate_limit_counters). The 6th gate run in an hour - across PRs, retries, local
 *     verify:baseline invocations and deploy.ps1 - gets 429'd: the row is created, the analysis
 *     never completes, and the spec fails on a TIMEOUT rather than on its assertion.
 *
 * Both are time-bomb flakes in a BLOCKING gate, and a flaky gate is a bypassed gate. So the
 * reset is hoisted HERE and invoked once per run from global-setup, where every spec inherits
 * it. Resetting a TEST-project counter/balance is test-environment seeding, not a product
 * change: the rate limiter and the merit system are untouched and still enforce their real
 * limits for every real user.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Node-side admin client. Never reaches the browser. */
export function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_TEST_URL;
  const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      '[e2e/helpers] Missing SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_ROLE_KEY ' +
        '(.env.test.local locally, CI secrets in CI). Refusing to run with a partial config.',
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Page the admin user list to find a user id by email (the admin API has no direct lookup). */
export async function findUserIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const match = data.users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) return null; // last page
  }
  return null;
}

/** Resolve the seeded test user id, or THROW (a spec must never run against a guessed user). */
export async function requireTestUserId(admin: SupabaseClient, email: string): Promise<string> {
  const userId = await findUserIdByEmail(admin, email);
  if (!userId) throw new Error(`[e2e/helpers] Could not resolve the seeded test user ${email}.`);
  return userId;
}

/**
 * Reset the seeded user's Merit balance so every merit-spending submit is affordable.
 *
 * Mirrors global-setup's existing determinism-reset of the user's Stripe billing state, and
 * uses the same direct service-role table write. (The `admin_set_user_merits` RPC is NOT usable
 * here: it enforces "Access denied. Admin role required." against the CALLER's role, which the
 * service-role key does not satisfy - the seeded E2E user is a plain free-tier user.)
 */
export async function seedMerits(
  admin: SupabaseClient,
  userId: string,
  merits = 30,
): Promise<void> {
  const { error } = await admin
    .from('user_merits')
    .update({ subscription_balance: merits })
    .eq('user_id', userId);
  if (error) throw new Error(`[e2e/helpers] merit seed failed: ${error.message}`);
}

/**
 * Clear the seeded user's `analyze-resume` rate-limit counter for the current window.
 *
 * The counter key + fixed 3600s window are the limiter's own contract
 * (_shared/rate-limiter.ts: `user:${userId}:${config.key}`, windowStart(3600)).
 */
export async function resetAnalyzeResumeRateLimit(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await admin
    .from('rate_limit_counters')
    .delete()
    .eq('rate_key', `user:${userId}:analyze-resume`);
  if (error) throw new Error(`[e2e/helpers] rate-limit reset failed: ${error.message}`);
}

/** Count of COMPLETED analyses (a run that charged is a run that saved). */
export async function analyzedResumeCount(
  admin: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await admin
    .from('resumes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('grading_data', 'is', null);
  if (error) throw new Error(`[e2e/helpers] resumes count failed: ${error.message}`);
  return count ?? 0;
}

/**
 * Count of COMPLETED analyses for ONE SPECIFIC uploaded document (09-09).
 *
 * WHY THIS EXISTS, and why it is STRICTLY STRONGER than the user-wide count above: the seeded
 * E2E user is a SHARED MUTABLE RESOURCE. `resume-analysis.spec.ts` and
 * `two-tab-concurrency.spec.ts` both drive a real analysis for that ONE user, so a user-wide
 * row-count delta is not isolated from whatever another spec (or a retry, or a concurrently
 * running gate) is doing to the same user at the same moment: each spec sees the other's row
 * and its "exactly one" invariant reads 2.
 *
 * Scoping the count to the spec's OWN per-run unique `file_name` fixes that by construction --
 * and it asserts something sharper into the bargain. "Exactly one new row appeared for this
 * user" is a weaker claim than "exactly one completed analysis exists for THE DOCUMENT I JUST
 * SUBMITTED", which is the invariant both specs actually mean.
 */
export async function analyzedResumeCountForFile(
  admin: SupabaseClient,
  userId: string,
  fileName: string,
): Promise<number> {
  const { count, error } = await admin
    .from('resumes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('file_name', fileName)
    .not('grading_data', 'is', null);
  if (error) throw new Error(`[e2e/helpers] scoped resumes count failed: ${error.message}`);
  return count ?? 0;
}

/**
 * D9-09 fail-loud precondition probe. The E2E gate assumes AI is stubbed SERVER-SIDE via
 * AI_TEST_MODE on the TEST project. When that secret is OFF - e.g. a real-analysis soak (09-10)
 * turned it off and did not restore it - the "deterministic" analyses make LIVE Anthropic calls
 * and flake on MODEL_TIMEOUT, surfacing as a mystery 90s heading-timeout that reads like a code
 * regression. (That exact confusion cost real investigation once; this converts it into a named
 * cause.)
 *
 * A server-side stub returns INSTANTLY and can NEVER time out or be rate-limited, so a
 * MODEL_TIMEOUT / MODEL_RATE_LIMITED on the TEST project is a definitive signal that AI_TEST_MODE
 * is off. This helper inspects the user's most recent analysis run since `sinceIso` and, if it
 * died on one of those live-only codes, returns a clear operator message; otherwise null. It is
 * called ONLY from a spec's failure path, and its own query failure returns null - a diagnostic
 * must never mask (or invent) the original assertion failure.
 */
const LIVE_ANTHROPIC_FAILURE_CODES = new Set(['MODEL_TIMEOUT', 'MODEL_RATE_LIMITED']);

export async function diagnoseLiveAnthropic(
  admin: SupabaseClient,
  userId: string,
  sinceIso: string,
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('analysis_jobs')
      .select('state, failure_code, failure_stage')
      .eq('user_id', userId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) return null;
    const run = (data ?? [])[0] as
      | { state: string | null; failure_code: string | null; failure_stage: string | null }
      | undefined;
    if (!run?.failure_code || !LIVE_ANTHROPIC_FAILURE_CODES.has(run.failure_code)) return null;
    return (
      `E2E analysis run ended in ${run.failure_code} at stage "${run.failure_stage}" ` +
      `(state=${run.state}). A server-side AI stub returns instantly and can never time out or ` +
      `rate-limit, so this run made a LIVE Anthropic call: AI_TEST_MODE is OFF on the TEST ` +
      `project and the blocking gate is non-deterministic (D9-09). A real-analysis soak (e.g. the ` +
      `09-10 staging activation) turns it off and MUST restore it. Fix before re-running:\n` +
      `  supabase secrets set AI_TEST_MODE=true --project-ref <test-project-ref>`
    );
  } catch {
    return null;
  }
}

/** Count of merit DEBIT rows (negative amounts) - the financial ledger. */
export async function meritDebitCount(admin: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await admin
    .from('merit_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .lt('amount', 0);
  if (error) throw new Error(`[e2e/helpers] merit_transactions count failed: ${error.message}`);
  return count ?? 0;
}

/**
 * The merit DEBIT rows written since `sinceIso`, grouped by idempotency_key (09-09).
 *
 * WHY THE GROUPING IS THE POINT. "One submit must never be charged twice" cannot be asserted
 * with a user-wide debit COUNT: the seeded E2E user is shared, specs run in parallel workers,
 * and merits are LIVE on the TEST project (a free-tier resume analysis really writes a -3
 * `feature-deduct` row). A second spec analysing in parallel moves the user-wide delta to 2,
 * which says nothing about whether either submit was double-charged.
 *
 * The ledger already carries the right key: `idempotency_key` is derived from the INPUT
 * IDENTITY, so every distinct document gets its own key, and a re-fire of the SAME submit
 * (the cross-tab double-charge this guards) reuses it. So the invariant that is both parallel-
 * safe and exactly what S-20 means is: NO key may carry more than one debit row. Other specs
 * contribute their own keys and cannot perturb it.
 */
export async function meritDebitKeyMultiplicity(
  admin: SupabaseClient,
  userId: string,
  sinceIso: string,
): Promise<Map<string, number>> {
  const { data, error } = await admin
    .from('merit_transactions')
    .select('idempotency_key')
    .eq('user_id', userId)
    .lt('amount', 0)
    .gte('created_at', sinceIso)
    .not('idempotency_key', 'is', null);
  if (error) throw new Error(`[e2e/helpers] merit debit key query failed: ${error.message}`);

  const multiplicity = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ idempotency_key: string }>) {
    multiplicity.set(row.idempotency_key, (multiplicity.get(row.idempotency_key) ?? 0) + 1);
  }
  return multiplicity;
}

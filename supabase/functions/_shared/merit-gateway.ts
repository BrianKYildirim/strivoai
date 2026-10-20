/**
 * supabase/functions/_shared/merit-gateway.ts
 *
 * Single authoritative Merit deduction + refund + rate-limit surface for every
 * AI feature on the new path (D-01). BACK-01 is realized here as an in-process
 * helper rather than an HTTP hop — the NFR-01 <100 ms budget does not tolerate
 * a cross-function round-trip.
 *
 * Design contract (Phase 13 D-01..D-12):
 * - MERIT_SYSTEM_ENABLED is module-scope env read at cold start (D-05)
 * - Pooled 60/hr abuse limiter at key 'ai-analyses-all' (D-08, D-09)
 * - Rate limit runs BEFORE deduction; fail-open on rate-limit DB error only
 * - Merit RPC calls go through getServiceClient() only (NFR-03)
 * - Refund taxonomy is NARROW (D-02): 5xx, 529, 408, AbortError, network/timeout
 * - Gateway OWNS refund control flow — features never call refund_merits directly (D-03)
 * - Transaction log emitted ONLY after RPC success (D-12)
 * - refundMeritsForJob exported for async processors (Research O-3 resolution)
 */
import { getServiceClient } from './supabase-client.ts';
import type { Database } from './database.types.ts';
import { checkRateLimit, createRateLimitResponse, type RateLimitConfig } from './rate-limiter.ts';
import { createLogger } from './logger.ts';
import { corsHeaders, type CorsType } from './cors.ts';

const log = createLogger('merit-gateway');

/**
 * The set of features that can be billed / recorded. Derived from the live
 * `ai_action_type` Postgres enum rather than hand-written, so adding a feature
 * in SQL and regenerating database.types.ts fails compilation here until every
 * call site is updated. Previously typed `string`, which let any value flow
 * into `record_ai_usage(p_action_type)` and fail only at runtime on INSERT.
 */
export type MeritFeature = Database['public']['Enums']['ai_action_type'];

// D-05: module-scope env read, cached for the life of the worker
export const MERIT_SYSTEM_ENABLED =
  (Deno.env.get('MERIT_SYSTEM_ENABLED') ?? '').toLowerCase() === 'true';

/** Convenience reader for callers that need the flag as a function call. */
export function readMeritFlag(): boolean {
  return MERIT_SYSTEM_ENABLED;
}

// D-08: pooled 60/hr limiter, identical cap for all tiers
const AI_POOL_LIMIT: RateLimitConfig = {
  key: 'ai-analyses-all',
  limits: { free: 60, pro: 60, elite: 60 },
};

// ── Refund classification (D-02) ─────────────────────────────────────────────

/**
 * D-02: the ONLY errors that auto-refund. Anchored to _shared/anthropic.ts
 * classification (line 684: AbortError → 408, lines 650-658: HTTP status).
 *
 * Refundable: any 5xx, 529, 408, AbortError name, network/timeout keywords.
 * NOT refundable: 4xx client errors (400, 401, 403, 422), parse failures,
 * prompt-sanitizer rejections, Zod validation errors.
 */
export function isRefundableAnthropicError(status: number, errText: string): boolean {
  if (typeof status === 'number') {
    if (status >= 500) return true; // Covers 5xx including 529 (overloaded)
    if (status === 408) return true;
  }
  if (typeof errText === 'string' && /overload|overloaded|timeout|ECONNRESET|network|AbortError/i.test(errText)) {
    return true;
  }
  return false;
}

// ── MeritRefundable error class ──────────────────────────────────────────────

/**
 * Thrown by feature callbacks inside `withMerits` to signal that the Anthropic
 * call failed with a refundable error. The gateway catches it, fires
 * `refund_merits`, and re-throws.
 *
 * Usage:
 *   const r = await invokeAnthropicText(...);
 *   if (!r.ok) throw new MeritRefundable(r.status, r.error);
 */
export class MeritRefundable extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'MeritRefundable';
    this.status = status;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface MeritGatewayContext {
  userId: string;
  tier: 'free' | 'pro' | 'elite';
  corsType: CorsType;
  /**
   * Optional per-request idempotency key (Phase 2 Fix 1 / SEC-13). When set, it is
   * forwarded to the 4-arg `check_and_deduct_merits` RPC so a repeated key (double-click
   * / two-tab / refresh-resubmit) deducts EXACTLY ONCE via the partial-unique index.
   * Additive-only capability seam: Phase 3 (03-02, LIFE-05) EXTENDS this by deriving +
   * threading the key from each feature — it does NOT replace this field.
   */
  idempotencyKey?: string;
}

export type MeritGatewayResult<T> =
  | { ok: true; value: T; transactionId: string }
  | { ok: false; response: Response };

/**
 * Optional 4th-arg to `withMerits` — enables Phase 37+ analysis-cache
 * precheck short-circuit per Phase 29 D-04 / D-12 / D-13 / D-15.
 *
 * Contract:
 * - `precheck_cache` is invoked BEFORE the pooled rate-limit (CACHE-09 bypass
 *   per D-15 — cache hits do NOT consume Claude tokens, so the per-pool
 *   60/hr abuse limiter does not apply).
 * - Resolving with a non-null `{ cached, analysis_id }` short-circuits the
 *   gateway: it writes a `usage_tracking` row with `credits=0` and the original
 *   `analysis_id` so the cached read surfaces in Activity History (CACHE-10 /
 *   D-13), then returns the cached value with the sentinel `transactionId:
 *   'cache-hit'`.
 * - Resolving with `null` (a cache miss) OR throwing (defensive — D-12)
 *   falls through to the existing rate-limit → check_and_deduct_merits → fn
 *   path with no behavior change. Throws are caught, logged at warn, and
 *   treated as misses.
 * - The cache READ is the callback's responsibility (the caller knows the
 *   cache_key shape). The cache WRITE is the caller's responsibility per
 *   CACHE-12 (gateway only short-circuits on hit; it never writes cache
 *   entries).
 */
export interface MeritGatewayOptions<T> {
  precheck_cache?: () => Promise<{ cached: T; analysis_id: string } | null>;
}

// ── withMerits ───────────────────────────────────────────────────────────────

/**
 * withMerits — the single failure-handling surface for the Merit system.
 *
 *   1. rate-limit check (pooled 60/hr, key 'ai-analyses-all')
 *   2. check_and_deduct_merits RPC (Phase 11)
 *   3. log('merit-transaction', deduction)   — AFTER RPC success only (D-12)
 *   4. await fn(transactionId)
 *   5. on throw: classify -> refund_merits + log('merit-refund') + re-throw
 *   6. on resolve: return { ok: true, value, transactionId }
 *
 * Feature code writes:
 *   const gated = await withMerits(ctx, 'resume_analysis', async (txId) => {
 *     const r = await invokeAnthropicText(...);
 *     if (!r.ok) throw new MeritRefundable(r.status, r.error);
 *     return buildResponse(r);
 *   });
 *   if (!gated.ok) return gated.response;
 *   return gated.value;
 */
export async function withMerits<T>(
  ctx: MeritGatewayContext,
  feature: MeritFeature,
  fn: (transactionId: string) => Promise<T>,
  options?: MeritGatewayOptions<T>,
): Promise<MeritGatewayResult<T>> {
  // [0] CACHE PRECHECK (Phase 29 D-04 / D-12 / D-13 / D-15) — runs BEFORE the
  // pooled rate-limit and the deduct RPC. A non-null hit short-circuits both.
  // A null result OR a thrown exception (defensive — D-12) falls through to
  // the existing rate-limit + deduct path unchanged.
  if (options?.precheck_cache) {
    const hit = await options.precheck_cache().catch((err) => {
      log.warn('precheck_cache failed — treating as miss', {
        feature,
        err: err?.message ?? String(err),
      });
      return null;
    });
    if (hit) {
      const supabase = getServiceClient();
      // CACHE-10 / D-13: write usage_tracking row with credits=0 so the cache
      // hit surfaces in Activity History but does NOT count against the user's
      // tier quota. Uses the 4-arg `record_ai_usage` overload added in Plan
      // 29-03 (p_analysis_id is the original analysis whose result was cached).
      const { error: usageError } = await supabase.rpc('record_ai_usage', {
        p_user_id: ctx.userId,
        p_action_type: feature,
        p_credits: 0,
        p_analysis_id: hit.analysis_id,
      });
      if (usageError) {
        // D-08: swallow — user already gets the cached value; losing one
        // analytics row is non-critical. Logging at warn provides operator
        // signal without user-facing impact.
        log.warn('cache-hit usage_tracking write failed', {
          feature,
          err: usageError.message,
        });
      }
      log.info('cache-hit', {
        user_id: ctx.userId,
        feature,
        analysis_id: hit.analysis_id,
      });
      // Sentinel `transactionId: 'cache-hit'` — Phase 37+ feature handlers
      // gate on this exact string to skip refund-attempt logic when the
      // returned value came from cache (no deduct happened).
      return { ok: true, value: hit.cached, transactionId: 'cache-hit' };
    }
  }

  // [1] pooled rate limit (NFR-05, D-09 ordering: rate limit BEFORE deduction)
  const rl = await checkRateLimit(ctx.userId, ctx.tier, AI_POOL_LIMIT);
  if (!rl.allowed) {
    return { ok: false, response: createRateLimitResponse(rl.retryAfterSeconds, ctx.corsType) };
  }

  // [2] check_and_deduct_merits (Phase 11 RPC)
  const supabase = getServiceClient();
  const t0 = Date.now();
  const { data, error } = await supabase.rpc('check_and_deduct_merits', {
    p_user_id: ctx.userId,
    p_feature: feature,
    p_tier: ctx.tier,
    // Fix 1 (SEC-13): forward the per-request idempotency key so the 4-arg RPC's
    // partial-unique index engages and a repeated key deducts exactly once.
    // Omitted (undefined) when unset, which is EXACTLY equivalent to the prior
    // explicit `null`: 20260520000000 dropped the legacy 3-arg overload, so the
    // only remaining signature is the 4-arg one whose `p_idempotency_key text
    // DEFAULT NULL` supplies the same NULL. Omission cannot re-dispatch.
    p_idempotency_key: ctx.idempotencyKey ?? undefined,
  });
  const rpcMs = Date.now() - t0;

  // Fail-closed on Merit RPC error (integrity event, not abuse-control)
  if (error || !data) {
    log.error('check_and_deduct_merits failed', { userId: ctx.userId, feature, error: error?.message, rpcMs });
    return { ok: false, response: genericError(500, 'merit_system_error', ctx.corsType) };
  }

  // Phase 11 return shape:
  //   success: { success: true, remaining_balance, deducted_from, transaction_id }
  //   error:   { error: 'insufficient_merits' | 'tier_locked', upgrade_required: true }
  if ((data as any).error === 'insufficient_merits') {
    return { ok: false, response: insufficientMeritsResponse(ctx.corsType) };
  }
  if ((data as any).error === 'tier_locked') {
    return { ok: false, response: tierLockedResponse(ctx.corsType) };
  }

  const transactionId: string = (data as any).transaction_id;

  // WR-03 (SEC-13): null-guard a malformed SUCCESSFUL RPC response. The error-or-no-data
  // guard above only catches RPC errors + `data === null`; a success shape that lacks
  // `transaction_id` (schema drift, partial response, future migration) would otherwise pass
  // `undefined` into `fn(transactionId)` / `refund_merits` and corrupt the transaction log.
  // Fail closed with the frozen generic body (reason code to the log only — no leak).
  if (!transactionId) {
    log.error('check_and_deduct_merits returned no transaction_id', {
      userId: ctx.userId,
      feature,
      data: JSON.stringify(data).slice(0, 200),
    });
    return { ok: false, response: genericError(500, 'merit_system_error', ctx.corsType) };
  }

  // [3] NFR-09 transaction log — AFTER RPC success, never before (D-12).
  // Fix 1 (SEC-13) null-safety: the 4-arg RPC returns
  //   { success, transaction_id, already_deducted:true }
  // on an idempotency replay (repeated key) with NO deducted_from / remaining_balance.
  // Surface already_deducted and null-guard the two optional reads so the structured
  // log never emits `undefined` on the replay branch.
  const alreadyDeducted = (data as any).already_deducted === true;
  log.info('merit-transaction', {
    user_id: ctx.userId,
    feature,
    transaction_id: transactionId,
    already_deducted: alreadyDeducted,
    deducted_from: (data as any).deducted_from ?? null,
    remaining_balance: (data as any).remaining_balance ?? null,
    rpc_duration_ms: rpcMs,
  });

  // [4] run the callback; classify thrown errors per D-02
  try {
    const value = await fn(transactionId);
    return { ok: true, value, transactionId };
  } catch (err: any) {
    const refundable =
      err?.name === 'MeritRefundable' ||
      (typeof err?.status === 'number' && isRefundableAnthropicError(err.status, err?.message ?? ''));

    // D3 (quick task 260713-2ay): attach the REFUND TRUTH to the re-thrown error. Callers
    // (and, through them, the UI) previously had no way to distinguish a refunded failure
    // from an unrefunded one, so the LinkedIn toast claimed "your Merits were refunded" on
    // EVERY error — including the ones where no refund ever fired. This is additive: no
    // Response body and no MeritGatewayResult shape changes.
    const markRefunded = (value: boolean): void => {
      (err as { meritsRefunded?: boolean }).meritsRefunded = value;
    };

    if (refundable && !alreadyDeducted) {
      const { error: refundError } = await supabase.rpc('refund_merits', {
        p_user_id: ctx.userId,
        p_transaction_id: transactionId,
      });
      if (refundError) {
        log.error('refund_merits failed', { userId: ctx.userId, transactionId, error: refundError.message });
        markRefunded(false);
      } else {
        markRefunded(true);
        log.info('merit-refund', {
          user_id: ctx.userId,
          feature,
          transaction_id: transactionId,
          reason: err?.status ?? 'unknown',
        });
      }
    } else if (refundable && alreadyDeducted) {
      markRefunded(false);
      // WR-01 (SEC-13): on an idempotency replay (already_deducted:true) THIS invocation did
      // NOT perform the deduction — the ORIGINAL call did, and it SUCCEEDED (which is why the
      // key replayed). Refunding `transactionId` here would reverse that legitimate prior
      // deduction for an already-delivered analysis (double benefit). Suppress the refund; the
      // replay's callback failure is its own concern (the caller still gets the thrown error).
      log.warn('merit-replay-callback-failed-no-refund', {
        user_id: ctx.userId,
        feature,
        transaction_id: transactionId,
        reason: 'already_deducted — original deduction not reversed',
      });
    } else {
      markRefunded(false);
      log.warn('merit-non-refundable-error', {
        user_id: ctx.userId,
        feature,
        transaction_id: transactionId,
        error: err?.message ?? String(err),
      });
    }
    throw err; // re-throw regardless — caller decides how to respond
  }
}

// ── refundMeritsForJob ───────────────────────────────────────────────────────

/**
 * refundMeritsForJob — async processor refund path (Research O-3 resolution).
 * Workers cannot call withMerits (D-07 forbids double-deduction) but may need
 * to refund a deduction made at submission time when the job later fails with
 * a refundable Anthropic error. This is the ONLY other gateway-owned refund
 * surface.
 */
export type RefundVerdict =
  | { ok: true; alreadyRefunded?: boolean }
  | { ok: false; error: string };

/**
 * Classify the `refund_merits` RPC jsonb body. Per
 * 20260723000002_merit_refund_aware_idempotency.sql the body is either a success object or
 * exactly one of: already_refunded (idempotent — the refund IS on file, treat as ok) /
 * unknown_transaction / user_not_found (the refund did NOT happen — fail closed). Anything
 * else carrying an `error` key is unrecognized and MUST fail closed too, so a future RPC
 * error string can never be silently reported as a completed refund.
 */
export function classifyRefundRpcResult(data: unknown): RefundVerdict {
  const err = data && typeof data === 'object'
    ? (data as { error?: unknown }).error
    : undefined;
  if (typeof err !== 'string' || err.length === 0) return { ok: true };
  if (err === 'already_refunded') return { ok: true, alreadyRefunded: true };
  return { ok: false, error: err };
}

export async function refundMeritsForJob(
  userId: string,
  transactionId: string,
  reason: string,
): Promise<{ ok: true; alreadyRefunded?: boolean } | { ok: false; error: string }> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc('refund_merits', {
    p_user_id: userId,
    p_transaction_id: transactionId,
  });
  if (error) {
    log.error('refundMeritsForJob failed', { userId, transactionId, reason, error: error.message });
    return { ok: false, error: error.message };
  }
  // Phase 11 RPC returns jsonb; idempotent path returns {"error":"already_refunded"} (D-02).
  // Every OTHER business error means the ledger did NOT refund — fail closed so no caller can
  // persist refunded=true without a real refund behind it (quick 260724-4cc, REFUND TRUTH).
  const verdict = classifyRefundRpcResult(data);
  if (!verdict.ok) {
    log.error('merit-refund-failed', {
      user_id: userId,
      transaction_id: transactionId,
      reason,
      rpc_error: verdict.error,
    });
    return verdict;
  }
  if (verdict.alreadyRefunded) {
    log.info('merit-refund-already-refunded', { user_id: userId, transaction_id: transactionId, reason });
    return verdict;
  }
  log.info('merit-refund', { user_id: userId, feature: 'async-job', transaction_id: transactionId, reason });
  return { ok: true };
}

// ── Response helpers (CORS-aware, match rate-limiter.ts helper shape) ────────

export function insufficientMeritsResponse(corsType: CorsType): Response {
  return new Response(
    JSON.stringify({
      error: 'insufficient_merits',
      message: 'You do not have enough Merits for this analysis.',
      upgrade_required: true,
    }),
    {
      status: 402,
      headers: { ...corsHeaders({ type: corsType }), 'Content-Type': 'application/json' },
    },
  );
}

export function tierLockedResponse(corsType: CorsType): Response {
  return new Response(
    JSON.stringify({
      error: 'tier_locked',
      message: 'This feature is not available on your current plan.',
      upgrade_required: true,
    }),
    {
      status: 403,
      headers: { ...corsHeaders({ type: corsType }), 'Content-Type': 'application/json' },
    },
  );
}

function genericError(status: number, code: string, corsType: CorsType): Response {
  return new Response(
    JSON.stringify({ error: code, message: 'Merit system unavailable. Please try again.' }),
    {
      status,
      headers: { ...corsHeaders({ type: corsType }), 'Content-Type': 'application/json' },
    },
  );
}

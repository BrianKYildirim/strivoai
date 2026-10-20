/**
 * supabase/functions/_shared/ai-retry.ts
 *
 * Deadline-bounded Anthropic invoke helper with an HONEST retryability predicate.
 *
 * WHY THIS MODULE EXISTS (quick task 260713-2ay — production bug):
 * `grade-linkedin/index.ts` carried a local `invokeWithRetry` whose "don't retry client
 * errors" guard read:
 *
 *     if (status >= 400 && status < 500 && status !== 429) return lastResult;
 *
 * `_shared/anthropic.ts` reports an AbortController timeout as **408**. 408 satisfies that
 * predicate, so the single MOST transient failure mode there is — a timeout — was classified
 * as a permanent client error and the retry loop was skipped entirely. Eight production
 * free-tier LinkedIn refunds landed within half a second of the exact 50 000 ms timeout wall.
 * The user was manually performing the retry the server should have performed itself.
 *
 * It lives in `_shared/` (not as an export from a feature's `index.ts`) because importing a
 * feature `index.ts` fires `serve()` at module load and therefore cannot be unit-tested.
 *
 * THE TWO INVARIANTS:
 *   1. 408 IS RETRYABLE. See `isRetryableAiStatus`. Do not fold it back into the 4xx bucket.
 *   2. Retries are bounded by ONE absolute deadline (`opts.deadlineAt`) that the CALLER owns
 *      and threads through EVERY retry loop in the request. Retryable-408 without a deadline
 *      would be unbounded (grade-linkedin runs two retry loops: the main call plus a
 *      validation-failure re-call → 3 × 90s × 2 = 540s worst case). The deadline is what
 *      makes 408-retryability safe.
 */
import { invokeAnthropicText } from './anthropic.ts';
import type { AnthropicInvokeParams, AnthropicInvokeResult } from './anthropic.ts';
import type { Logger } from './logger.ts';

/**
 * The smallest slice of remaining budget worth starting a fresh attempt with. Below this
 * we stop rather than fire a call that is guaranteed to be aborted mid-flight.
 */
export const MIN_ATTEMPT_MS = 15_000;

/**
 * Retryable Anthropic statuses.
 *
 * 408 is THE headline entry (see module doc): `anthropic.ts` maps an AbortError to 408, and a
 * timeout is transient by definition. 429 (rate limit) and 5xx/529 (server error / overloaded)
 * are the classic transient set. Everything else — 400 / 401 / 403 / 422 — is a permanent
 * client error and returns immediately after ONE call: the fix must not turn every malformed
 * request into three billed model calls.
 *
 * Mirrors the refund axis in `merit-gateway.isRefundableAnthropicError` so a genuine give-up
 * still refunds the Merit.
 */
export function isRetryableAiStatus(status: number): boolean {
  if (typeof status !== 'number') return false;
  if (status >= 500) return true; // 5xx incl. 529 (overloaded)
  if (status === 429) return true; // rate limited
  if (status === 408) return true; // ← the bug: an abort/timeout is TRANSIENT, never permanent
  return false;
}

/** Abort/timeout/network-shaped error text is retryable even when the status is not. */
export function isRetryableAiError(errText: string): boolean {
  if (typeof errText !== 'string') return false;
  return /overload|overloaded|timed out|timeout|ECONNRESET|network|AbortError/i.test(errText);
}

/**
 * D4 — status-aware, jittered backoff.
 *
 * The old flat [1000, 2000, 3000] burned ~4s and gave up, which is exactly why the ~3-5s
 * Elite 529 refunds happened: a short Anthropic overload window outlives a 4s retry budget.
 *
 * - 529 / 5xx / 429 → 2s, 4s (+0-1000ms jitter): rides out a short overload window.
 * - 408            → 500ms (+0-500ms jitter): a 90s wall already consumed most of the
 *                    budget; do not spend the remainder sleeping.
 */
export function computeAiBackoffMs(
  status: number,
  attempt: number,
  rand: () => number = Math.random,
): number {
  if (status === 408) return 500 + Math.floor(rand() * 500);
  return 2_000 * 2 ** attempt + Math.floor(rand() * 1_000);
}

export interface AiRetryOptions {
  /** Absolute epoch-ms deadline for ALL attempts across the WHOLE handler (not per-loop). */
  deadlineAt: number;
  /** Injectable for tests. Defaults to invokeAnthropicText. */
  invoke?: (p: AnthropicInvokeParams) => Promise<AnthropicInvokeResult>;
  /** Injectable clock/sleep for deterministic tests. Default: Date.now / setTimeout. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Injectable jitter source for deterministic tests. Default: Math.random. */
  random?: () => number;
  maxAttempts?: number;
}

/**
 * Invoke Anthropic with bounded, deadline-aware retries.
 *
 * Contract:
 * - Returns the first `ok` result.
 * - Returns a non-retryable failure immediately (one call).
 * - Retries a retryable failure until `maxAttempts` OR the deadline leaves less than
 *   MIN_ATTEMPT_MS, whichever comes first.
 * - Clamps every attempt's `timeoutMs` to the REMAINING budget, so a 90s attempt 2 can never
 *   overrun a 165s total deadline.
 * - If the deadline is already exhausted before ANY attempt ran, returns a synthetic 408 —
 *   408 keeps it inside `isRefundableAnthropicError`, so the Merit is still refunded on a
 *   genuine give-up.
 */
export async function invokeWithRetry(
  params: AnthropicInvokeParams,
  log: Logger,
  opts: AiRetryOptions,
): Promise<AnthropicInvokeResult> {
  const invoke = opts.invoke ?? invokeAnthropicText;
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const rand = opts.random ?? Math.random;
  const maxAttempts = opts.maxAttempts ?? 3;

  let lastResult: AnthropicInvokeResult | null = null;
  const baseAttempt = params.telemetry?.attemptNumber ?? params.telemetry?.attempt ?? 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const remaining = opts.deadlineAt - now();

    // Hard total deadline: never start an attempt we cannot meaningfully complete.
    if (remaining < MIN_ATTEMPT_MS) {
      if (lastResult) return lastResult;
      return { ok: false, status: 408, error: 'AI deadline exhausted' };
    }

    // Clamp the per-attempt timeout to what is actually left (minus 1s of settle room).
    const requestedTimeout = params.timeoutMs ?? remaining;
    const timeoutMs = Math.min(requestedTimeout, remaining - 1_000);

    const attemptNumber = baseAttempt + attempt;
    lastResult = await invoke({
      ...params,
      timeoutMs,
      ...(params.telemetry
        ? {
            telemetry: {
              ...params.telemetry,
              attempt: attemptNumber,
              attemptNumber,
              isRetry: params.telemetry.isRetry === true || attemptNumber > 1,
            },
          }
        : {}),
    });
    if (lastResult.ok) return lastResult;

    const retryable =
      isRetryableAiStatus(lastResult.status) || isRetryableAiError(lastResult.error);
    if (!retryable) return lastResult;

    const remainingAfter = opts.deadlineAt - now();
    log.warn('ai-retry', {
      attempt: attempt + 1,
      status: lastResult.status,
      remainingMs: remainingAfter,
    });

    if (attempt === maxAttempts - 1) break;

    const backoff = computeAiBackoffMs(lastResult.status, attempt, rand);
    const sleepMs = Math.min(backoff, remainingAfter - MIN_ATTEMPT_MS);
    // No budget left for a post-sleep attempt — stop instead of sleeping into the wall.
    if (sleepMs <= 0) break;
    await sleep(sleepMs);
  }

  return lastResult ?? { ok: false, status: 408, error: 'AI deadline exhausted' };
}

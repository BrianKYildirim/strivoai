/**
 * Shared bounded-backoff helper for transient retries (D-03).
 *
 * Byte-for-byte the algorithm already proven inline in
 * `analyze-resume/index.ts:265` (base 1000ms, doubling per attempt, capped at
 * 3000ms, plus 0–400ms jitter). The lifecycle executor (03-04) imports THIS
 * shared copy for its retryable-code retry loop.
 *
 * IMPORTANT (D-04, byte-identical dormancy): the existing inline copies in
 * `analyze-resume/index.ts` and `process-resume-analysis-job/index.ts` are
 * INTENTIONALLY left in place and are NOT rewired to this module. Promoting the
 * helper without touching the live callers preserves the dormancy guarantee for
 * this phase. A future, explicitly-non-dormant refactor may collapse the inline
 * copies onto this shared one.
 *
 * @param attempt 1-based retry attempt number.
 * @returns delay in milliseconds before the next attempt.
 */
export function computeBackoffMs(attempt: number): number {
  const base = Math.min(3000, 1000 * (2 ** (attempt - 1)));
  const jitter = Math.floor(Math.random() * 400);
  return base + jitter;
}

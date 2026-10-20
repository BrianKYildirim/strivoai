/**
 * Phase 03 · 03-04 · LIFE-06 / LIFE-05 — analysis-lifecycle classifier +
 * single-source idempotency-key guards.
 *
 * (a) classifyFailure transient/permanent partition (LIFE-06): provider
 *     timeout / rate-limit / network / transient-5xx → retryable; missing-file /
 *     schema-fail / auth-fail → permanent. Fail-closed default is permanent so an
 *     unclassified error is NEVER auto-retried (T-03-12 DoS guard).
 *
 * (b) STATIC single-source-key assertion (LIFE-05 / Pitfall 5): the executor must
 *     derive the idempotency key EXACTLY ONCE and thread the SAME const into
 *     create_or_recover_analysis_run(p_idempotency_key) AND the withMerits ctx.
 *     Deriving it twice (or a different value at reserve time) would split
 *     run-level dedup from Merit-level dedup and create two rows for one intent.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { classifyFailure } from './analysis-lifecycle.ts';

// ── (a) classifier partition ─────────────────────────────────────────────────

Deno.test('classifyFailure: 529 (overloaded) → retryable', () => {
  assertEquals(classifyFailure({ status: 529 }).retryable, true);
});

Deno.test('classifyFailure: 408 (timeout status) → retryable', () => {
  assertEquals(classifyFailure({ status: 408 }).retryable, true);
});

Deno.test('classifyFailure: 429 (rate limited) → retryable + MODEL_RATE_LIMITED', () => {
  const c = classifyFailure({ status: 429 });
  assertEquals(c.retryable, true);
  assertEquals(c.code, 'MODEL_RATE_LIMITED');
});

Deno.test('classifyFailure: generic 5xx → retryable', () => {
  assertEquals(classifyFailure({ status: 503 }).retryable, true);
});

Deno.test('classifyFailure: network error message → retryable', () => {
  assertEquals(classifyFailure(new Error('socket hang up ECONNRESET network')).retryable, true);
});

Deno.test('classifyFailure: timeout message → retryable', () => {
  assertEquals(classifyFailure(new Error('request timed out')).retryable, true);
});

Deno.test('classifyFailure: missing-file → permanent', () => {
  assertEquals(classifyFailure(new Error('uploaded file not found')).retryable, false);
});

Deno.test('classifyFailure: schema-fail (typed AnalysisErrorCode) → permanent', () => {
  const c = classifyFailure({ code: 'SCHEMA_VALIDATION_FAILED', message: 'bad shape' });
  assertEquals(c.retryable, false);
  assertEquals(c.code, 'SCHEMA_VALIDATION_FAILED');
});

Deno.test('classifyFailure: auth-fail (401) → permanent', () => {
  assertEquals(classifyFailure({ status: 401 }).retryable, false);
});

Deno.test('classifyFailure: typed MODEL_TIMEOUT code → retryable (taxonomy authoritative)', () => {
  assertEquals(classifyFailure({ code: 'MODEL_TIMEOUT' }).retryable, true);
});

Deno.test('classifyFailure: unclassified error → fail-closed permanent', () => {
  const c = classifyFailure({ weird: true });
  assertEquals(c.retryable, false);
  assertEquals(c.code, 'UNKNOWN_ANALYSIS_ERROR');
});

// ── (b) static single-source idempotency-key guard ───────────────────────────

// Windows leading-slash idiom (cors-audit.test.ts:43-47 / refund-on-failure.test.ts).
function readSource(): string {
  const rawPath = new URL('./analysis-lifecycle.ts', import.meta.url).pathname;
  const path = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  return Deno.readTextFileSync(path);
}

Deno.test('single-source-key: deriveIdempotencyKey is CALLED exactly once', () => {
  const src = readSource();
  const calls = src.match(/deriveIdempotencyKey\(/g) ?? [];
  assertEquals(calls.length, 1, 'the key must be derived exactly once (single source)');
});

Deno.test('single-source-key: the derived const is named idempotencyKey', () => {
  const src = readSource();
  assert(
    /const\s+idempotencyKey\s*=\s*await\s+deriveIdempotencyKey\(/.test(src),
    'derivation must bind to `const idempotencyKey`',
  );
});

Deno.test('single-source-key: SAME const passed as p_idempotency_key to create_or_recover', () => {
  const src = readSource();
  assert(
    /p_idempotency_key:\s*idempotencyKey\b/.test(src),
    'create_or_recover_analysis_run must receive p_idempotency_key: idempotencyKey',
  );
});

Deno.test('single-source-key: SAME const assigned to ctx.idempotencyKey for withMerits', () => {
  const src = readSource();
  assert(
    /\.idempotencyKey\s*=\s*idempotencyKey\b/.test(src),
    'the withMerits ctx must reuse the SAME idempotencyKey const (never re-derived)',
  );
});

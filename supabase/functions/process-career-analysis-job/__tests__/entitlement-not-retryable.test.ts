/**
 * Quick task 260713-hrd — RC-3 guard: an entitlement / usage-limit denial is PERMANENT.
 * The career worker must not retry it 8 times and then die, minutes after the user gave up.
 *
 * THE BUG THIS LOCKS OUT
 * ---------------------------------------------------------------------------
 * The legacy `can_perform_ai_action` entitlement gate (free = 3 AI actions per cycle,
 * counted across ALL features) returned **429**. `isRetryableHttpStatus` treats 429 as
 * transient, so `process-career-analysis-job` retried a PERMANENT denial 8 times with
 * exponential backoff — dying minutes after the frontend's 180s poll had already given
 * up. Production `analysis_jobs` shows exactly this: repeated `usage_limit_reached`
 * with `attempts=8`. The Merit was charged at submit and, on that path, mostly never
 * refunded.
 *
 * THE FIX: an EXPLICIT body signal beats the status heuristic. `retryable: false`, or a
 * known-terminal error code, is terminal on the FIRST response — which drops straight
 * into the existing refund-before-`status='failed'` block, so the Merit comes back once.
 * (260713-hrd also removes the entitlement gate from Career Compass entirely — Merits
 * are the only paywall — but this classifier must be honest regardless, and 422
 * `output_truncated` / `incomplete_output` now ride the same terminal path.)
 *
 * ⚠ ED-3 BLAST RADIUS: `isRetryableHttpStatus` here is a LOCAL copy. Separate local
 * copies live in `process-resume-analysis-job/index.ts` and
 * `_shared/analysis-lifecycle.ts`. Editing career's copy CANNOT ripple. The DRIFT GUARD
 * at the bottom of this file proves that — it asserts the resume worker still treats a
 * 429 as retryable.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

function winSafePath(url: string): string {
  const raw = new URL(url, import.meta.url).pathname;
  return raw.startsWith('/') && raw[2] === ':' ? raw.slice(1) : raw;
}

const careerWorker = await Deno.readTextFile(winSafePath('../index.ts'));
const resumeWorker = await Deno.readTextFile(
  winSafePath('../../process-resume-analysis-job/index.ts'),
);

/**
 * Pattern C — the career worker is an inline `serve(...)` with live-Supabase side
 * effects, so the (pure) classifier is replicated here and driven behaviorally. The
 * source assertions below anchor the replica to the real thing.
 */
function isRetryableHttpStatus(status: number): boolean {
  return status === 503 || status === 529 || status === 408 || status === 409 ||
    status === 425 || status === 429 || (status >= 500 && status <= 599);
}

function classify(status: number, body: Record<string, unknown> | null): boolean {
  const explicitlyPermanent =
    body?.retryable === false ||
    body?.error === 'usage_limit_reached' ||
    body?.error === 'output_truncated' ||
    body?.error === 'incomplete_output';
  const retryableFromBody = Boolean(body?.retryable);
  const retryableFromStatus = isRetryableHttpStatus(status);
  return explicitlyPermanent ? false : (retryableFromBody || retryableFromStatus);
}

// ── The terminal classes ─────────────────────────────────────────────────────

Deno.test('260713-hrd worker: a 429 usage_limit_reached is NOT retryable (was retried 8x in production)', () => {
  assertEquals(
    classify(429, { error: 'usage_limit_reached' }),
    false,
    'an entitlement denial is deterministic — retrying it 8x just delays the refund by minutes',
  );
});

Deno.test('260713-hrd worker: a 422 output_truncated is NOT retryable (terminal + refund once)', () => {
  assertEquals(classify(422, { error: 'output_truncated', retryable: false }), false);
});

Deno.test('260713-hrd worker: a 422 incomplete_output is NOT retryable', () => {
  assertEquals(classify(422, { error: 'incomplete_output', retryable: false }), false);
});

Deno.test('260713-hrd worker: an explicit `retryable: false` body beats the status heuristic', () => {
  // Even on a status the heuristic calls transient, an explicit body signal wins.
  assertEquals(classify(503, { retryable: false }), false, 'the server said permanent — believe it');
  assertEquals(classify(429, { retryable: false }), false);
});

// ── The genuinely transient classes still retry ──────────────────────────────

Deno.test('260713-hrd worker: a 503 / 529 / 408 with no permanent signal IS still retryable', () => {
  assertEquals(classify(503, null), true, 'infrastructure blip');
  assertEquals(classify(529, { error: 'overloaded', retryable: true }), true, 'Anthropic overloaded');
  assertEquals(classify(408, null), true, 'a timeout is transient by definition (260713-2ay)');
  assertEquals(classify(500, null), true, 'a transient DB save failure must still be retried (ED-5)');
});

Deno.test('260713-hrd worker: a plain 429 with NO error code is still treated as a rate limit (retryable)', () => {
  // Only a KNOWN permanent code (or an explicit retryable:false) demotes a 429. An
  // anonymous 429 is an ordinary rate limit and stays transient.
  assertEquals(classify(429, null), true);
});

// ── The wiring is really there (source anchors) ──────────────────────────────

Deno.test('260713-hrd worker: the explicitlyPermanent classifier is WIRED into the career worker', () => {
  // Assert the CODES and the wiring, not one exact spelling of the expression — the classifier is
  // factored into an `isExplicitlyPermanent(responseBody)` helper, and pinning its internal syntax
  // would make this guard fail on a harmless refactor while proving nothing extra. The behavioural
  // `classify(...)` tests above are the real contract; these anchors prove it is actually WIRED.
  assert(careerWorker.includes('explicitlyPermanent'), 'the body signal must override the status heuristic');
  assert(careerWorker.includes('isExplicitlyPermanent'), 'the permanent-failure classifier must exist');
  assert(careerWorker.includes("'usage_limit_reached'"), 'entitlement denial is terminal');
  assert(careerWorker.includes("'output_truncated'"), 'truncation is terminal');
  assert(careerWorker.includes("'incomplete_output'"), 'incomplete output is terminal');
  assert(careerWorker.includes('retryable === false'), 'an explicit permanent flag is honored');
  // The override must actually feed the retry decision.
  assert(
    /const\s+retryable\s*=\s*explicitlyPermanent\s*\?\s*false/.test(careerWorker),
    'explicitlyPermanent must SHORT-CIRCUIT the retry decision, not merely be computed',
  );
  assert(
    /const retryable\s*=\s*explicitlyPermanent\s*\?\s*false\s*:/.test(careerWorker),
    'explicitlyPermanent must SHORT-CIRCUIT the retryable computation, not merely inform it',
  );
});

Deno.test('260713-hrd worker: 422 maps to the OUTPUT_TRUNCATED permanent code', () => {
  assert(
    /status === 422\) return 'OUTPUT_TRUNCATED'/.test(careerWorker),
    "422 must not keep masquerading as FILE_EXTRACTION_FAILED",
  );
});

Deno.test('260713-hrd worker: the terminal branch refunds the Merit exactly once', () => {
  assert(careerWorker.includes('refundMeritsForJob'), 'a terminal failure must refund');
  // The refund fires BEFORE the row flips to failed (money path ordering — MER-11).
  const refundIdx = careerWorker.indexOf('refundMeritsForJob(userId, txId, reason)');
  const failedIdx = careerWorker.indexOf('status: "failed"');
  assert(refundIdx > -1 && failedIdx > -1, 'both the refund and the terminal write must exist');
  assert(refundIdx < failedIdx, 'refund BEFORE status=failed — never leave a failed run holding a live charge');
});

// ── ED-3 DRIFT GUARD: the change did NOT ripple to the resume worker ─────────

Deno.test('260713-hrd worker DRIFT GUARD: process-resume-analysis-job still treats 429 as RETRYABLE (no ripple)', () => {
  // isRetryableHttpStatus is a LOCAL copy per worker. This proves the career-local
  // classifier change did not leak into Resume Analysis.
  assert(
    resumeWorker.includes('function isRetryableHttpStatus'),
    'the resume worker keeps its OWN local copy of the classifier',
  );
  const fn = resumeWorker.match(/function isRetryableHttpStatus[\s\S]{0,300}?\n}/)?.[0] ?? '';
  assert(fn.length > 0, 'expected to read the resume worker classifier body');
  assert(fn.includes('429'), 'the resume worker must STILL treat 429 as retryable — untouched by this task');
  assert(
    !resumeWorker.includes('explicitlyPermanent'),
    'the career-local explicitlyPermanent classifier must NOT have leaked into the resume worker (ED-3)',
  );
});

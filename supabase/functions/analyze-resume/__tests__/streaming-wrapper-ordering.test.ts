/**
 * Phase 05 · 05-03 · FEAT-02 / D-01 / D-02 — streaming-wrapper ordering guard.
 *
 * The LOCKED runAnalysisLifecycle executor is request/response-shaped and cannot
 * wrap an SSE stream (D-02), so 05-02 added a thin `runResumeStreamingLifecycle`
 * wrapper that orchestrates the SAME lifecycle primitives DIRECTLY around the
 * untouched TransformStream token path. This static-source guard (comment-stripped —
 * prose cannot satisfy it) proves the wrapper preserves the money-safe ORDER:
 *
 *   deriveIdempotencyKey (caller, before withMerits)
 *     → create_or_recover_analysis_run  (run-level dedup on the same key)
 *     → reserve via withMerits WITH the key (closes the :728 gap)
 *     → generating
 *     → validate the final assembled OBJECT (validateModelOutput)
 *     → saving
 *     → saving→completed { merit_settled: true }  (settle-on-saved, point of no return)
 *
 * and that NO refund/settle-reversal is reachable in the SUCCESS TAIL after the
 * saving→completed CAS (the pre-saving IIFE error branches + the catch — which are
 * lexically the error path, not the success path — are the ONLY refund surfaces).
 *
 * std@0.224.0 to match the lifecycle guard neighbors.
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

function readIndexCode(): string {
  const rawPath = new URL('../index.ts', import.meta.url).pathname;
  const path = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  return Deno.readTextFileSync(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

/** Slice `[startMarker, endMarker)` from the (comment-stripped) source. */
function slice(code: string, startMarker: string, endMarker: string): string {
  const start = code.indexOf(startMarker);
  assert(start !== -1, `start marker not found: ${startMarker}`);
  const end = code.indexOf(endMarker, start + startMarker.length);
  assert(end !== -1, `end marker not found: ${endMarker}`);
  return code.slice(start, end);
}

const SAVING_COMPLETED = "'saving', 'completed'";

// ── The wrapper body (create-or-recover → … → settle-on-saved). ──────────────────

function wrapperBody(code: string): string {
  return slice(code, 'async function runResumeStreamingLifecycle', 'serve((req)');
}

Deno.test('D-01: the wrapper orders create_or_recover → withMerits-reserve → generating → validate → saving→completed', () => {
  const w = wrapperBody(readIndexCode());
  const idxCreate = w.indexOf('create_or_recover_analysis_run');
  const idxReserve = w.indexOf('withMerits<string | Response>');
  const idxGenerating = w.indexOf("'extracting_data', 'generating'");
  const idxValidate = w.indexOf('validateModelOutput');
  const idxCompleted = w.indexOf(SAVING_COMPLETED);

  assert(idxCreate !== -1, 'create_or_recover_analysis_run must be present');
  assert(idxReserve !== -1, 'the reserve-with-key withMerits call must be present');
  assert(idxGenerating !== -1, 'the transition into generating must be present');
  assert(idxValidate !== -1, 'validateModelOutput must run on the assembled object');
  assert(idxCompleted !== -1, 'the saving -> completed CAS must be present');

  assert(idxCreate < idxReserve, 'create_or_recover must precede the merit reservation');
  assert(idxReserve < idxGenerating, 'the merit reservation must precede generating (reserve-before-generate)');
  assert(idxGenerating < idxValidate, 'generating must precede final-object validation');
  assert(idxValidate < idxCompleted, 'validation must precede the saving -> completed CAS');
});

Deno.test('D-02: create_or_recover is keyed by the SAME idempotency key threaded into withMerits (reserve-with-key)', () => {
  const w = wrapperBody(readIndexCode());
  assert(w.includes('p_idempotency_key: idempotencyKey'), 'create_or_recover must be keyed on the derived idempotencyKey');
  // The wrapper reserves through the shared meritCtx (carrying that key), not a bare deduct.
  assert(w.includes('withMerits<string | Response>('), 'the reservation must route through withMerits');
});

Deno.test('D-01: settle-on-saved — merit_settled: true is written ONLY in the saving -> completed CAS', () => {
  const w = wrapperBody(readIndexCode());
  // The ONLY merit_settled write co-occurs with the saving -> completed transition.
  assert(
    /'saving',\s*'completed',\s*\{\s*merit_settled:\s*true\s*\}/.test(w),
    'merit_settled: true must be set in the saving -> completed transition (settle-on-saved)',
  );
  const settleCount = (w.match(/merit_settled:\s*true/g) ?? []).length;
  assert(settleCount === 1, `merit_settled: true must be written exactly once, found ${settleCount}`);
});

Deno.test('Pitfall 2: NO refund/settle-reversal in the SUCCESS TAIL after saving -> completed', () => {
  const w = wrapperBody(readIndexCode());
  const completedIdx = w.indexOf(SAVING_COMPLETED);
  assert(completedIdx !== -1, 'the saving -> completed CAS must exist');
  // The success tail runs from the settle CAS to the start of the error handler
  // (`} catch (err)`). No refund or MeritRefundable throw may live there.
  const catchIdx = w.indexOf('catch (err)', completedIdx);
  assert(catchIdx !== -1, 'the outer IIFE catch handler must exist after the success tail');
  const successTail = w.slice(completedIdx, catchIdx);
  assert(!successTail.includes('refundMeritsForJob'), 'no refund may fire after the merit settles (success path)');
  assert(!/throw\s+new\s+MeritRefundable/.test(successTail), 'no MeritRefundable throw after the point of no return');
});

Deno.test('Pitfall 2: every pre-settle refund branch precedes the saving -> completed CAS', () => {
  const w = wrapperBody(readIndexCode());
  const completedIdx = w.indexOf(SAVING_COMPLETED);
  // The validating_output-failure refund and the saving-failure refund both live
  // BEFORE the CAS; only the pre-saving catch (generating stage) refund is lexically
  // after (it is the error path — never reached once completed). Assert at least the
  // two pre-CAS refund branches exist before the settle.
  const preSettle = w.slice(0, completedIdx);
  const preSettleRefunds = (preSettle.match(/refundMeritsForJob/g) ?? []).length;
  assert(preSettleRefunds >= 2, `expected >=2 pre-settle refund branches, found ${preSettleRefunds}`);
});

// ── The caller dispatch region: derive-key BEFORE withMerits, key on meritCtx. ──

Deno.test('D-02: the caller derives ONE idempotency key BEFORE the non-streaming withMerits reservation', () => {
  const code = readIndexCode();
  const deriveIdx = code.indexOf('await deriveIdempotencyKey({');
  const nonStreamMeritIdx = code.indexOf('const gated = await withMerits(');
  assert(deriveIdx !== -1, 'the caller must derive the idempotency key');
  assert(nonStreamMeritIdx !== -1, 'the non-streaming withMerits reservation must exist');
  assert(deriveIdx < nonStreamMeritIdx, 'deriveIdempotencyKey must run before withMerits (client cannot forge the key)');
});

Deno.test('D-02: the derived key is set on the shared meritCtx before dispatch (both branches idempotent)', () => {
  const region = slice(
    readIndexCode(),
    'const resumeIdempotencyKey = await deriveIdempotencyKey',
    "if (isAnalysisFeatureEnabled('resume') && rawBody.stream === true)",
  );
  assert(region.includes('idempotencyKey: resumeIdempotencyKey'), 'meritCtx must carry the derived idempotencyKey');
});

Deno.test('D-01: the streaming dispatch is flag-gated AND stream-gated (dormant by default)', () => {
  const code = readIndexCode();
  assert(
    code.includes("isAnalysisFeatureEnabled('resume') && rawBody.stream === true"),
    'the streaming lifecycle wrapper must be gated on BOTH the resume flag and the stream request',
  );
});

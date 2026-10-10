/**
 * Phase 06 · 06-03 · FEAT-05 — Career repeated-run / idempotency + refund-boundary proof.
 *
 * Career Compass's 3-function dance (submit → process → analyze-career) shares ONE
 * money-safety contract, proven here deterministically (no live Anthropic / no live DB):
 *
 *   1. ONE DEDUCTION on accidental resubmit — the same `attemptNonce` (with a STABLE,
 *      save-independent inputIdentity derived from buildCareerCacheKey inputs) re-derives
 *      the SAME idempotency key, so submit's create_or_recover run + the executor's
 *      reserving_merits collapse via the 4-arg check_and_deduct_merits `already_deducted`
 *      replay. Both submit (06-02) and the direct-path executor (06-01) derive at tier
 *      'free' to match the confirmed-live internal path.
 *   2. NEW RUN on a deliberate re-analysis — a fresh `attemptNonce` derives a DIFFERENT
 *      key (a new deduction + run is permitted; the prior saved analysis / History row
 *      is untouched, so the previous result is preserved).
 *   3. SAVE-THROW → retryable_failed + refund, NO settle — a save() that throws
 *      (pre-`saving→completed`) refunds the Merit and rests the run in retryable_failed;
 *      the merit settles ONLY across the point-of-no-return CAS. Static-source assertion
 *      over the SAME shared executor that drives career_compass behind
 *      ANALYSIS_LIFECYCLE_CAREER_COMPASS.
 *
 * Root-cause note (Pitfall 8 / D-06): the career idempotency identity is a STABLE
 * buildCareerCacheKey (content/prior hashes + tier + variant + allowResumeOnly) —
 * NEVER a save-mutated field (the inserted analysis_results id /
 * analyzed_at). Leg 1c locks that a save-mutated field can no longer shift the key.
 *
 * std@0.224.0 to match the lifecycle guard neighbors.
 */
import { assert, assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { deriveIdempotencyKey, type IdempotencyKeyParts } from '../../_shared/idempotency-key.ts';

// Career-shaped intent parts. inputIdentity is the STABLE buildCareerCacheKey identity
// (content/prior hashes + tier + ':legacy-main' variant) — never a save-mutated field.
const CAREER_BASE: IdempotencyKeyParts = {
  userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  feature: 'career_compass',
  tier: 'free',
  inputIdentity: 'career-overload-patch-2026-02-25:legacy-main|resume-hash|linkedin-hash',
  attemptNonce: 'nonce-run-1',
};

// ── Leg 1: one deduction on accidental resubmit (same nonce → same key) ──

Deno.test('FEAT-05 (1a): the same attemptNonce re-derives the SAME key (accidental resubmit → one deduction)', async () => {
  const first = await deriveIdempotencyKey(CAREER_BASE);
  const resubmit = await deriveIdempotencyKey({ ...CAREER_BASE });
  assertEquals(first, resubmit, 'an accidental resubmit must re-derive the same key so the RPC replays already_deducted');
});

Deno.test('FEAT-05 (1b): the derived key is a stable 64-char lowercase hex digest', async () => {
  const key = await deriveIdempotencyKey(CAREER_BASE);
  assert(/^[0-9a-f]{64}$/.test(key), `expected 64 lowercase hex chars, got "${key}"`);
});

Deno.test('FEAT-05 (1c): a save-mutated field cannot shift the key — stable inputIdentity → stable key (Pitfall 8)', async () => {
  // The career identity is composed ONLY from buildCareerCacheKey inputs (content/prior
  // hashes + tier + variant) — never the inserted analysis_results id / analyzed_at. A
  // run before and after the save writes the same stable content-identity → invariant key.
  const beforeSave = await deriveIdempotencyKey({ ...CAREER_BASE, inputIdentity: 'stable-career-content-id' });
  const afterSave = await deriveIdempotencyKey({ ...CAREER_BASE, inputIdentity: 'stable-career-content-id' });
  assertEquals(beforeSave, afterSave, 'a save-mutated field must never re-key a delivered career analysis');
});

Deno.test('FEAT-05 (1d): submit and the executor share ONE key when they derive at the confirmed-live free tier', async () => {
  // 06-01/06-02: the internal worker path resolves tier='free'; submit derives its key
  // at 'free' to MATCH the executor's re-derived key so the reservation dedups to one run.
  const submitKey = await deriveIdempotencyKey({ ...CAREER_BASE, tier: 'free' });
  const executorKey = await deriveIdempotencyKey({ ...CAREER_BASE, tier: 'free' });
  assertEquals(submitKey, executorKey, 'submit + executor derive the same free-tier key → one run, one deduction');
});

// ── Leg 2: new run on a deliberate re-analysis (fresh nonce → different key) ──

Deno.test('FEAT-05 (2a): a fresh attemptNonce derives a DIFFERENT key (deliberate new run)', async () => {
  const run1 = await deriveIdempotencyKey(CAREER_BASE);
  const run2 = await deriveIdempotencyKey({ ...CAREER_BASE, attemptNonce: 'nonce-run-2' });
  assertNotEquals(run1, run2, 'a deliberate new run must mint a NEW key so a fresh deduction is permitted');
});

Deno.test('FEAT-05 (2b): the same inputs re-analyzed on a new nonce key ONLY on the nonce (History preserved)', async () => {
  const parts = { ...CAREER_BASE, inputIdentity: 'identical-career-inputs' };
  const run1 = await deriveIdempotencyKey({ ...parts, attemptNonce: 'first' });
  const run2 = await deriveIdempotencyKey({ ...parts, attemptNonce: 'second' });
  assertNotEquals(run1, run2);
  // Re-deriving run 1 still lands on run 1 (its History key is stable).
  assertEquals(await deriveIdempotencyKey({ ...parts, attemptNonce: 'first' }), run1);
});

Deno.test('FEAT-05 (2c): allowResumeOnly is part of inputIdentity — distinct intents key separately', async () => {
  const combined = await deriveIdempotencyKey({ ...CAREER_BASE, inputIdentity: 'variant:legacy-main|resume+linkedin' });
  const resumeOnly = await deriveIdempotencyKey({ ...CAREER_BASE, inputIdentity: 'variant:legacy-main|resume-only' });
  assertNotEquals(combined, resumeOnly);
});

// ── Leg 3: save-throw → retryable_failed + refund, NO settle (executor contract) ──
//
// Static-source assertion over the shared executor that drives the career_compass run
// behind ANALYSIS_LIFECYCLE_CAREER_COMPASS. Comment lines/blocks stripped so prose
// cannot satisfy the assertion.

function readExecutorCode(): string {
  const rawPath = new URL('../../_shared/analysis-lifecycle.ts', import.meta.url).pathname;
  const path = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  return Deno.readTextFileSync(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

const SAVING_COMPLETED = "'saving', 'completed'";

Deno.test('FEAT-05 (3a): a save-throw routes to refund + retryable_failed BEFORE the point of no return', () => {
  const code = readExecutorCode();
  const casIdx = code.indexOf(SAVING_COMPLETED);
  assert(casIdx !== -1, 'the saving -> completed CAS must exist');
  const preSave = code.slice(0, casIdx);
  assert(
    /refundAndFail\(\s*'saving',\s*'retryable_failed'/.test(preSave),
    'a save() throw must refund and rest in retryable_failed before the saving -> completed CAS',
  );
});

Deno.test('FEAT-05 (3b): the merit is SETTLED only at/after the saving -> completed CAS (no settle on save-throw)', () => {
  const code = readExecutorCode();
  const firstSaving = code.indexOf("'saving'");
  const settleIdx = code.indexOf('merit_settled');
  assert(firstSaving !== -1 && settleIdx !== -1, 'saving transition + merit_settled must both exist');
  assert(settleIdx > firstSaving, 'merit_settled must be written only after a saving transition — a save-throw never settles');
});

Deno.test('FEAT-05 (3c): NO refund is reachable after the point of no return (Pitfall 2)', () => {
  const code = readExecutorCode();
  const postSaving = code.slice(code.indexOf(SAVING_COMPLETED));
  assert(!postSaving.includes('refundMeritsForJob'), 'refund must be lexically unreachable after saving -> completed');
  assert(!/throw\s+new\s+MeritRefundable/.test(postSaving), 'no MeritRefundable throw after the point of no return');
});

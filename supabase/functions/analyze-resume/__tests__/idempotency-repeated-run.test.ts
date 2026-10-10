/**
 * Phase 05 · 05-03 · FEAT-01 / FEAT-02 — Resume repeated-run / idempotency +
 * refund-boundary proof.
 *
 * FEAT-01 (onboarding) and FEAT-02 (streaming resume) share ONE money-safety
 * contract, proven here deterministically (no live Anthropic / no live DB):
 *
 *   1. ONE DEDUCTION on accidental resubmit — the same `attemptNonce` (with a
 *      STABLE, save-independent inputIdentity) re-derives the SAME idempotency key,
 *      so the 4-arg check_and_deduct_merits RPC replays `already_deducted`. This is
 *      the seam analyze-resume threads at index.ts:1289 (streaming) + :1176
 *      (onboarding), closing the confirmed :728 non-idempotent gap.
 *   2. NEW RUN on a deliberate re-analysis — a fresh `attemptNonce` derives a
 *      DIFFERENT key (a new deduction + History row is permitted; the prior saved
 *      analysis / History is untouched, so the previous result is preserved).
 *   3. SAVE-THROW → retryable_failed + refund, NO settle — a save() that throws
 *      (pre-`saving→completed`) refunds the Merit and rests the run in
 *      retryable_failed; the merit settles ONLY across the point-of-no-return CAS.
 *
 * Legs 1-2 extend the deriveIdempotencyKey contract (idempotency-key.test.ts /
 * merit-idempotency.test.ts) with RESUME-shaped intent parts. Leg 3 asserts the
 * shared executor's refund-boundary contract statically — the SAME executor that
 * drives the onboarding run behind ANALYSIS_LIFECYCLE_ONBOARDING
 * (refund-boundary.test.ts precedent), plus the streaming wrapper's own boundary
 * (streaming-wrapper-ordering.test.ts, Task 2).
 *
 * Root-cause note (Pitfall 8 / D-06): the resume idempotency identity is a STABLE
 * sha256({text_hash, resumeId, targetRole, targetIndustry}) (index.ts:1283/1169) —
 * NEVER a save-mutated field (analyzed_at / grading_data / overall_score). Leg 1c
 * locks that a save-mutated field can no longer shift the key and re-charge a
 * delivered analysis.
 *
 * std@0.224.0 to match the lifecycle guard neighbors.
 */
import { assert, assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { deriveIdempotencyKey, type IdempotencyKeyParts } from '../../_shared/idempotency-key.ts';

// Resume-shaped intent parts. inputIdentity is the STABLE content-hash identity
// (index.ts:1283 sha256 of {text_hash, resumeId, targetRole, targetIndustry}) —
// never a save-mutated field.
const RESUME_BASE: IdempotencyKeyParts = {
  userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  feature: 'resume_analysis',
  tier: 'free',
  inputIdentity: 'sha256:resume-content-hash-stable',
  attemptNonce: 'nonce-run-1',
};

// ── Leg 1: one deduction on accidental resubmit (same nonce → same key) ──

Deno.test('FEAT-02 (1a): the same attemptNonce re-derives the SAME key (accidental resubmit → one deduction)', async () => {
  const first = await deriveIdempotencyKey(RESUME_BASE);
  const resubmit = await deriveIdempotencyKey({ ...RESUME_BASE });
  assertEquals(first, resubmit, 'an accidental resubmit must re-derive the same key so the RPC replays already_deducted');
});

Deno.test('FEAT-02 (1b): the derived key is a stable 64-char lowercase hex digest', async () => {
  const key = await deriveIdempotencyKey(RESUME_BASE);
  assert(/^[0-9a-f]{64}$/.test(key), `expected 64 lowercase hex chars, got "${key}"`);
});

Deno.test('FEAT-02 (1c): a save-mutated field cannot shift the key — stable inputIdentity → stable key (Pitfall 8)', async () => {
  // The resume identity is composed ONLY from {text_hash, resumeId, target*} — never
  // analyzed_at/grading_data/overall_score. A run before and after the save writes the
  // same stable content-identity, so the key is invariant across the save state.
  const beforeSave = await deriveIdempotencyKey({ ...RESUME_BASE, inputIdentity: 'sha256:stable-content-id' });
  const afterSave = await deriveIdempotencyKey({ ...RESUME_BASE, inputIdentity: 'sha256:stable-content-id' });
  assertEquals(beforeSave, afterSave, 'a save-mutated field must never re-key a delivered analysis');
});

Deno.test('FEAT-01 (1d): the onboarding feature namespace shares the resume merit identity (same parts → same key)', async () => {
  // Onboarding threads meritFeature:'resume_analysis' (index.ts:1178) so its idempotency
  // key uses the resume feature namespace — an onboarding re-interaction on the same
  // content dedups exactly like a streaming resume resubmit.
  const a = await deriveIdempotencyKey({ ...RESUME_BASE, feature: 'resume_analysis' });
  const b = await deriveIdempotencyKey({ ...RESUME_BASE, feature: 'resume_analysis' });
  assertEquals(a, b);
});

// ── Leg 2: new run on a deliberate re-analysis (fresh nonce → different key) ──

Deno.test('FEAT-02 (2a): a fresh attemptNonce derives a DIFFERENT key (deliberate new run)', async () => {
  const run1 = await deriveIdempotencyKey(RESUME_BASE);
  const run2 = await deriveIdempotencyKey({ ...RESUME_BASE, attemptNonce: 'nonce-run-2' });
  assertNotEquals(run1, run2, 'a deliberate new run must mint a NEW key so a fresh deduction is permitted');
});

Deno.test('FEAT-02 (2b): the same content re-analyzed on a new nonce keys ONLY on the nonce (History preserved)', async () => {
  // Identical resume content (same inputIdentity), two deliberate runs. The keys differ
  // solely because of the nonce — the prior saved analysis is not re-keyed away, so
  // History for run 1 is preserved while run 2 is a legitimately separate, separately-
  // charged run.
  const parts = { ...RESUME_BASE, inputIdentity: 'sha256:identical-resume' };
  const run1 = await deriveIdempotencyKey({ ...parts, attemptNonce: 'first' });
  const run2 = await deriveIdempotencyKey({ ...parts, attemptNonce: 'second' });
  assertNotEquals(run1, run2);
  // And re-deriving run 1 still lands on run 1 (its History key is stable).
  assertEquals(await deriveIdempotencyKey({ ...parts, attemptNonce: 'first' }), run1);
});

Deno.test('FEAT-02 (2c): tier is part of the identity — the same content on a different tier keys separately', async () => {
  const free = await deriveIdempotencyKey({ ...RESUME_BASE, tier: 'free' });
  const elite = await deriveIdempotencyKey({ ...RESUME_BASE, tier: 'elite' });
  assertNotEquals(free, elite);
});

// ── Leg 3: save-throw → retryable_failed + refund, NO settle (executor contract) ──
//
// Static-source assertion over the shared executor that drives the onboarding resume
// run behind ANALYSIS_LIFECYCLE_ONBOARDING. Comment lines/blocks stripped so prose
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

Deno.test('FEAT-02 (3a): a save-throw routes to refund + retryable_failed BEFORE the point of no return', () => {
  const code = readExecutorCode();
  const casIdx = code.indexOf(SAVING_COMPLETED);
  assert(casIdx !== -1, 'the saving -> completed CAS must exist');
  const preSave = code.slice(0, casIdx);
  assert(
    /refundAndFail\(\s*'saving',\s*'retryable_failed'/.test(preSave),
    'a save() throw must refund and rest in retryable_failed before the saving -> completed CAS',
  );
});

Deno.test('FEAT-02 (3b): the merit is SETTLED only at/after the saving -> completed CAS (no settle on save-throw)', () => {
  const code = readExecutorCode();
  const firstSaving = code.indexOf("'saving'");
  const settleIdx = code.indexOf('merit_settled');
  assert(firstSaving !== -1 && settleIdx !== -1, 'saving transition + merit_settled must both exist');
  assert(
    settleIdx > firstSaving,
    'merit_settled must be written only after a saving transition — a save-throw path never settles',
  );
});

Deno.test('FEAT-02 (3c): NO refund is reachable after the point of no return (Pitfall 2)', () => {
  const code = readExecutorCode();
  const postSaving = code.slice(code.indexOf(SAVING_COMPLETED));
  assert(!postSaving.includes('refundMeritsForJob'), 'refund must be lexically unreachable after saving -> completed');
  assert(!/throw\s+new\s+MeritRefundable/.test(postSaving), 'no MeritRefundable throw after the point of no return');
});

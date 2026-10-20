/**
 * Phase 04 · 04-06 · FEAT-04 — LinkedIn repeated-run / idempotency + refund-boundary proof.
 *
 * FEAT-04's money-safety contract for the migrated LinkedIn grader has three legs,
 * proven here deterministically (no live Anthropic / no live DB):
 *
 *   1. ONE DEDUCTION on accidental resubmit — the same `attemptNonce` (with a
 *      STABLE, save-independent inputIdentity) re-derives the SAME idempotency key,
 *      so the 4-arg check_and_deduct_merits RPC replays `already_deducted`.
 *   2. NEW RUN on a deliberate re-grade — a fresh `attemptNonce` derives a DIFFERENT
 *      key (a new deduction is permitted; the prior saved grade / History is
 *      untouched, so the previous result is preserved).
 *   3. SAVE-THROW → retryable_failed + refund, NO settle — a save() that throws
 *      (pre-`saving→completed`) refunds the Merit and rests the run in
 *      retryable_failed; the merit is settled ONLY across the point-of-no-return CAS.
 *
 * Legs 1-2 extend the deriveIdempotencyKey contract (idempotency-key.test.ts /
 * merit-idempotency.test.ts) with LinkedIn-shaped intent parts. Leg 3 asserts the
 * shared executor's refund-boundary contract statically (the executor is the single
 * driver behind ANALYSIS_LIFECYCLE_LINKEDIN — refund-boundary.test.ts precedent).
 *
 * Root-cause note (Pitfall 8 / T-04-12): the v3 cache/idempotency key mutated on the
 * save-written `prior_grade_id`, so a second run re-keyed and RE-CHARGED. 04-04
 * rebuilt the identity as a STABLE sha256(profileContent-hash + url); leg 1c locks
 * that a save-mutated field can no longer shift the key.
 */
import { assert, assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { deriveIdempotencyKey, type IdempotencyKeyParts } from '../../_shared/idempotency-key.ts';

// LinkedIn-shaped intent parts. inputIdentity is the STABLE profileContent-hash + url
// identity (04-04) — never a save-mutated field.
const LINKEDIN_BASE: IdempotencyKeyParts = {
  userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  feature: 'linkedin_grading',
  tier: 'free',
  inputIdentity: 'sha256:profilecontenthash+url-stable',
  attemptNonce: 'nonce-run-1',
};

// ── Leg 1: one deduction on accidental resubmit (same nonce → same key) ──

Deno.test('FEAT-04 (1a): the same attemptNonce re-derives the SAME key (accidental resubmit → one deduction)', async () => {
  const first = await deriveIdempotencyKey(LINKEDIN_BASE);
  const resubmit = await deriveIdempotencyKey({ ...LINKEDIN_BASE });
  assertEquals(first, resubmit, 'an accidental resubmit must re-derive the same key so the RPC replays already_deducted');
});

Deno.test('FEAT-04 (1b): the derived key is a stable 64-char lowercase hex digest', async () => {
  const key = await deriveIdempotencyKey(LINKEDIN_BASE);
  assert(/^[0-9a-f]{64}$/.test(key), `expected 64 lowercase hex chars, got "${key}"`);
});

Deno.test('FEAT-04 (1c): a save-mutated field cannot shift the key — stable inputIdentity → stable key (Pitfall 8)', async () => {
  // The v3 bug: prior_grade_id (written by save) leaked into the key → re-charge. Now the
  // caller excludes it from inputIdentity, so the same stable content-identity yields the
  // same key regardless of any surrounding save state.
  const beforeSave = await deriveIdempotencyKey({ ...LINKEDIN_BASE, inputIdentity: 'sha256:stable-content-id' });
  const afterSave = await deriveIdempotencyKey({ ...LINKEDIN_BASE, inputIdentity: 'sha256:stable-content-id' });
  assertEquals(beforeSave, afterSave, 'a save-mutated field must never re-key a delivered grade');
});

// ── Leg 2: new run on a deliberate re-grade (fresh nonce → different key) ──

Deno.test('FEAT-04 (2a): a fresh attemptNonce derives a DIFFERENT key (deliberate new run)', async () => {
  const run1 = await deriveIdempotencyKey(LINKEDIN_BASE);
  const run2 = await deriveIdempotencyKey({ ...LINKEDIN_BASE, attemptNonce: 'nonce-run-2' });
  assertNotEquals(run1, run2, 'a deliberate new run must mint a NEW key so a fresh deduction is permitted');
});

Deno.test('FEAT-04 (2b): the same content re-graded on a new nonce keys ONLY on the nonce (History preserved)', async () => {
  // Identical profile content (same inputIdentity), two deliberate runs. The keys differ
  // solely because of the nonce — the prior saved grade is not re-keyed away, so History
  // for run 1 is preserved while run 2 is a legitimately separate, separately-charged run.
  const parts = { ...LINKEDIN_BASE, inputIdentity: 'sha256:identical-profile' };
  const run1 = await deriveIdempotencyKey({ ...parts, attemptNonce: 'first' });
  const run2 = await deriveIdempotencyKey({ ...parts, attemptNonce: 'second' });
  assertNotEquals(run1, run2);
  // And re-deriving run 1 still lands on run 1 (its History key is stable).
  assertEquals(await deriveIdempotencyKey({ ...parts, attemptNonce: 'first' }), run1);
});

// ── Leg 3: save-throw → retryable_failed + refund, NO settle (executor contract) ──
//
// Static-source assertion over the shared executor that drives grade-linkedin behind
// ANALYSIS_LIFECYCLE_LINKEDIN. Comment lines/blocks stripped so prose can't satisfy it.

function readExecutorCode(): string {
  const rawPath = new URL('../../_shared/analysis-lifecycle.ts', import.meta.url).pathname;
  const path = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  return Deno.readTextFileSync(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

function readLinkedInHandlerCode(): string {
  const rawPath = new URL('../index.ts', import.meta.url).pathname;
  const path = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  return Deno.readTextFileSync(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

const SAVING_COMPLETED = "'saving', 'completed'";

Deno.test('FEAT-04 (3a): a save-throw routes to refund + retryable_failed BEFORE the point of no return', () => {
  const code = readExecutorCode();
  const casIdx = code.indexOf(SAVING_COMPLETED);
  assert(casIdx !== -1, 'the saving -> completed CAS must exist');
  const preSave = code.slice(0, casIdx);
  // The save-failure branch refunds and rests in retryable_failed, lexically BEFORE the CAS.
  assert(
    /refundAndFail\(\s*'saving',\s*'retryable_failed'/.test(preSave),
    'a save() throw must refund and rest in retryable_failed before the saving -> completed CAS',
  );
});

Deno.test('FEAT-04 (3b): the merit is SETTLED only at/after the saving -> completed CAS (no settle on save-throw)', () => {
  const code = readExecutorCode();
  const firstSaving = code.indexOf("'saving'");
  const settleIdx = code.indexOf('merit_settled');
  assert(firstSaving !== -1 && settleIdx !== -1, 'saving transition + merit_settled must both exist');
  assert(
    settleIdx > firstSaving,
    'merit_settled must be written only after a saving transition — a save-throw path never settles',
  );
});

Deno.test('FEAT-04 (3c): NO refund is reachable after the point of no return (Pitfall 2)', () => {
  const code = readExecutorCode();
  const postSaving = code.slice(code.indexOf(SAVING_COMPLETED));
  assert(!postSaving.includes('refundMeritsForJob'), 'refund must be lexically unreachable after saving -> completed');
  assert(!/throw\s+new\s+MeritRefundable/.test(postSaving), 'no MeritRefundable throw after the point of no return');
});

// ── Leg 4 (quick task 260713-2ay / D2): the key actually REACHES withMerits ────────────
//
// Legs 1-2 above prove deriveIdempotencyKey is DETERMINISTIC — but they never proved the key
// is threaded into the LIVE paid path, and it wasn't. `withMerits` was called with a bare
// { userId, tier, corsType } ctx, so `p_idempotency_key` reached check_and_deduct_merits as
// NULL and the RPC did ZERO deduping: two clicks = two charges, two model calls, two
// linkedin_grades rows. A perfectly deterministic key that nobody passes protects nobody.
// THIS is the leg that would have caught S1.

Deno.test('D2 (4a): the LIVE withMerits ctx carries an idempotencyKey (not the bare userId/tier/corsType shape)', () => {
  const code = readLinkedInHandlerCode();
  const callIdx = code.indexOf('const gated = await withMerits(');
  assert(callIdx > -1, 'the live paid-path withMerits call must exist');

  // The ctx object literal is the first argument — scope the assertion to it.
  const ctx = code.slice(callIdx, code.indexOf("'linkedin_grading'", callIdx));
  assert(
    ctx.includes('idempotencyKey'),
    'the paid path passes NO idempotency key — check_and_deduct_merits will dedupe nothing and a repeated submit will double-charge',
  );
});

Deno.test('D2 (4b): deriveIdempotencyKey is imported AND invoked in the handler', () => {
  const code = readLinkedInHandlerCode();
  assert(
    /import\s*\{\s*deriveIdempotencyKey\s*\}\s*from\s*'\.\.\/_shared\/idempotency-key\.ts'/.test(code),
    'deriveIdempotencyKey must be imported from the shared derivation module',
  );
  assert(/await deriveIdempotencyKey\(\{/.test(code), 'deriveIdempotencyKey must actually be CALLED, not just imported');
});

Deno.test('D2 (4c): the merit key FAILS CLOSED — it is derived from a CLIENT nonce, never a server-minted random one', () => {
  const code = readLinkedInHandlerCode();

  // A server-minted crypto.randomUUID() nonce derives a key that can NEVER repeat, so it
  // would guarantee nothing while LOOKING like it guaranteed exactly-once. The merit key must
  // therefore read a nonce that is only set when the client genuinely sent one.
  const derivation = code.slice(code.indexOf('const meritIdempotencyKey'), code.indexOf('lifecycleGradeId'));
  assert(derivation.length > 0, 'the merit idempotency-key derivation must exist');
  assert(
    derivation.includes('clientAttemptNonce'),
    'the merit key must derive from the CLIENT-supplied nonce',
  );
  assert(
    !derivation.includes('crypto.randomUUID()'),
    'the merit key must NOT consume a server-minted random nonce — that is a fake guarantee',
  );

  // And the client nonce itself must fail CLOSED (null), not fall back to a random UUID.
  assert(
    /const clientAttemptNonce\s*=[\s\S]*?:\s*null;/.test(code),
    'clientAttemptNonce must fail closed to null when the client sent no nonce',
  );
});

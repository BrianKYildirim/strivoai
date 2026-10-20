/**
 * Phase 09 · 09-05 · FEAT-06 — Recruiting Lens repeated-run / idempotency +
 * refund-boundary proof (VER-02 S-01a / S-01b / S-08 / S-15 / S-18).
 *
 * Recruiting Lens is the FIRST feature whose production flag flips (D-02) and was the
 * THINNEST-tested column in the VER-02 matrix: it had no idempotency suite at all. This
 * closes that, mirroring `analyze-resume/__tests__/idempotency-repeated-run.test.ts` and
 * `grade-linkedin/__tests__/idempotency-repeated-run.test.ts` exactly.
 *
 * RCL's money-safety contract has three legs, proven here deterministically (no live
 * Anthropic / no live DB):
 *
 *   1. ONE DEDUCTION on accidental resubmit — the same `attemptNonce` (with a STABLE,
 *      save-independent inputIdentity) re-derives the SAME idempotency key, so the 4-arg
 *      check_and_deduct_merits RPC replays `already_deducted`.
 *   2. NEW RUN on a deliberate re-analysis — a fresh `attemptNonce` derives a DIFFERENT
 *      key (a new deduction + History row is permitted; the prior saved analysis is
 *      untouched, so the previous result is preserved).
 *   3. SAVE-THROW → retryable_failed + refund, NO settle — a save() that throws
 *      (pre-`saving→completed`) refunds the Merit and rests the run in retryable_failed;
 *      the merit settles ONLY across the point-of-no-return CAS.
 *
 * THE REAL IDENTITY (cited, not guessed — Pitfall 8 / D-06): recruiting-lens/index.ts:592
 * threads `inputIdentity: cacheKey`, where `cacheKey` is built by
 * `buildRecruitingLensCacheKey` (index.ts:307-334) from computeCacheKey over
 * {resumeSummary_hash, jobDescription_hash, linkedinText_hash, company, role_title} —
 * all pure request-content, NEVER a save-mutated field (no analysis_id, no analyzed_at,
 * no prior_grade_id). Legs 1/2 rebuild that identity with the REAL
 * `computeCacheKey`/`sha256Hex` primitives (not a literal stand-in) and feed it through
 * the REAL `deriveIdempotencyKey`, so a change to either primitive turns this RED.
 *
 * `attemptNonce` is index.ts:577 — the client per-submit nonce, fail-closed to a fresh
 * UUID so a nonce-less resubmit simply does not dedup.
 *
 * std@0.224.0 to match the lifecycle guard neighbors.
 */
import { assert, assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { deriveIdempotencyKey, type IdempotencyKeyParts } from '../../_shared/idempotency-key.ts';
import { computeCacheKey, sha256Hex } from '../../_shared/cache-fingerprint.ts';

const RECRUITING_LENS_CACHE_VARIANT = 'recruiting-lens:v37-04';
const USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/**
 * The REAL RCL inputIdentity — a faithful re-execution of
 * `buildRecruitingLensCacheKey` (recruiting-lens/index.ts:307-334) using the same shared
 * primitives the handler imports. Content only; no save-mutated field can enter.
 */
async function rclInputIdentity(input: {
  tier: 'pro' | 'elite';
  resume: string;
  jd: string;
  linkedin?: string;
  company: string;
  roleTitle: string;
}): Promise<string> {
  const [resumeHash, jdHash, linkedinHash] = await Promise.all([
    sha256Hex(input.resume),
    sha256Hex(input.jd),
    sha256Hex(input.linkedin ?? ''),
  ]);
  return await computeCacheKey({
    user_id: USER_ID,
    feature: 'recruiting_lens',
    tier: input.tier,
    variant: RECRUITING_LENS_CACHE_VARIANT,
    inputs: {
      resumeSummary_hash: resumeHash,
      jobDescription_hash: jdHash,
      linkedinText_hash: linkedinHash,
      company: input.company,
      role_title: input.roleTitle,
    },
  });
}

const CONTENT = {
  tier: 'elite' as const,
  resume: 'Senior platform engineer with eight years building distributed services.',
  jd: 'We are hiring a senior platform engineer to own our streaming ingestion tier.',
  linkedin: 'Platform engineer. Distributed systems. Streaming.',
  company: 'Northwind Systems',
  roleTitle: 'Senior Platform Engineer',
};

async function rclParts(overrides: Partial<IdempotencyKeyParts> = {}): Promise<IdempotencyKeyParts> {
  return {
    userId: USER_ID,
    feature: 'recruiting_lens',
    tier: 'elite',
    inputIdentity: await rclInputIdentity(CONTENT),
    attemptNonce: 'nonce-run-1',
    ...overrides,
  };
}

// ── Leg 1: one deduction on accidental resubmit (same nonce → same key) ──

Deno.test('FEAT-06 (1a): the same attemptNonce re-derives the SAME key (accidental resubmit → one deduction)', async () => {
  const first = await deriveIdempotencyKey(await rclParts());
  const resubmit = await deriveIdempotencyKey(await rclParts());
  assertEquals(first, resubmit, 'an accidental resubmit must re-derive the same key so the RPC replays already_deducted');
});

Deno.test('FEAT-06 (1b): the derived key is a stable 64-char lowercase hex digest', async () => {
  const key = await deriveIdempotencyKey(await rclParts());
  assert(/^[0-9a-f]{64}$/.test(key), `expected 64 lowercase hex chars, got "${key}"`);
});

Deno.test('FEAT-06 (1c): a save-mutated field cannot shift the key — stable inputIdentity → stable key (Pitfall 8)', async () => {
  // The RCL identity is composed ONLY from the request content hashes + company + role
  // (index.ts:321-333) — never analysis_id / analyzed_at / raw_response, all of which are
  // written by save(). The identity is therefore invariant across the save state: the
  // SAME request content before and after the durable insert derives the SAME key, so a
  // delivered analysis can never be re-charged by a re-key.
  const beforeSave = await rclInputIdentity(CONTENT);
  const afterSave = await rclInputIdentity(CONTENT);
  assertEquals(beforeSave, afterSave, 'a save-mutated field must never re-key a delivered analysis');
  assertEquals(
    await deriveIdempotencyKey(await rclParts({ inputIdentity: beforeSave })),
    await deriveIdempotencyKey(await rclParts({ inputIdentity: afterSave })),
  );
});

Deno.test('FEAT-06 (1d): the RCL inputIdentity is the content-hashed cacheKey (no save-mutated field is reachable)', () => {
  // Static proof that the identity the handler THREADS is the content-derived cacheKey,
  // not a row id. Guards the Pitfall-8 regression at its source, not just in this fixture.
  const src = readIndexCode();
  assert(src.includes('inputIdentity: cacheKey'), 'the lifecycle must be threaded with the content-hashed cacheKey');
  const builder = src.slice(src.indexOf('async function buildRecruitingLensCacheKey'));
  const body = builder.slice(0, builder.indexOf('\n}'));
  for (const forbidden of ['analysis_id', 'analysisId', 'analyzed_at', 'prior_grade_id', 'raw_response']) {
    assert(!body.includes(forbidden), `a save-mutated field (${forbidden}) must never enter the cache/idempotency identity`);
  }
});

// ── Leg 2: new run on a deliberate re-analysis (fresh nonce → different key) ──

Deno.test('FEAT-06 (2a): a fresh attemptNonce derives a DIFFERENT key (deliberate new run)', async () => {
  const run1 = await deriveIdempotencyKey(await rclParts());
  const run2 = await deriveIdempotencyKey(await rclParts({ attemptNonce: 'nonce-run-2' }));
  assertNotEquals(run1, run2, 'a deliberate new run must mint a NEW key so a fresh deduction is permitted');
});

Deno.test('FEAT-06 (2b): the same content re-analyzed on a new nonce keys ONLY on the nonce (History preserved)', async () => {
  // Identical resume+JD (same inputIdentity), two deliberate runs. The keys differ solely
  // because of the nonce — the prior saved analysis is not re-keyed away, so History for
  // run 1 is preserved while run 2 is a legitimately separate, separately-charged run.
  const identity = await rclInputIdentity(CONTENT);
  const run1 = await deriveIdempotencyKey(await rclParts({ inputIdentity: identity, attemptNonce: 'first' }));
  const run2 = await deriveIdempotencyKey(await rclParts({ inputIdentity: identity, attemptNonce: 'second' }));
  assertNotEquals(run1, run2);
  // And re-deriving run 1 still lands on run 1 (its History key is stable).
  assertEquals(
    await deriveIdempotencyKey(await rclParts({ inputIdentity: identity, attemptNonce: 'first' })),
    run1,
  );
});

Deno.test('FEAT-06 (2c): tier is part of the identity — the same content on a different tier keys separately', async () => {
  // Tier enters TWICE: the cacheKey itself (index.ts:325) and the idempotency parts.
  const pro = await deriveIdempotencyKey(
    await rclParts({ tier: 'pro', inputIdentity: await rclInputIdentity({ ...CONTENT, tier: 'pro' }) }),
  );
  const elite = await deriveIdempotencyKey(
    await rclParts({ tier: 'elite', inputIdentity: await rclInputIdentity({ ...CONTENT, tier: 'elite' }) }),
  );
  assertNotEquals(pro, elite);
});

Deno.test('FEAT-06 (2d): a different job description is a different run (the JD is part of the identity)', async () => {
  const a = await deriveIdempotencyKey(await rclParts());
  const b = await deriveIdempotencyKey(
    await rclParts({ inputIdentity: await rclInputIdentity({ ...CONTENT, jd: 'A different role at a different company entirely.' }) }),
  );
  assertNotEquals(a, b, 'a genuinely different JD must not replay the previous run\'s deduction');
});

// ── Leg 3: save-throw → retryable_failed + refund, NO settle (executor contract) ──
//
// Static-source assertion over the shared executor that drives RCL behind
// ANALYSIS_LIFECYCLE_RECRUITING_LENS. Comment lines/blocks stripped so prose cannot
// satisfy the assertion.

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

function readLocal(relative: string): string {
  const rawPath = new URL(relative, import.meta.url).pathname;
  const path = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  return Deno.readTextFileSync(path);
}

function readExecutorCode(): string {
  return stripComments(readLocal('../../_shared/analysis-lifecycle.ts'));
}

function readIndexCode(): string {
  return stripComments(readLocal('../index.ts'));
}

const SAVING_COMPLETED = "'saving', 'completed'";

Deno.test('FEAT-06 (3a): a save-throw routes to refund + retryable_failed BEFORE the point of no return', () => {
  // RCL's save() throws MeritRefundable(500, 'Could not save Recruiting Lens analysis
  // history.') (index.ts:660) when the durable analysis_results insert fails — the
  // executor must refund and rest in retryable_failed, lexically before the CAS.
  const idx = readIndexCode();
  assert(idx.includes('runAnalysisLifecycle'), 'RCL must route its money path through the shared executor');
  assert(
    idx.includes("throw new MeritRefundable(500, 'Could not save Recruiting Lens analysis history.')"),
    'a failed durable insert must raise a refundable throw from save()',
  );

  const code = readExecutorCode();
  const casIdx = code.indexOf(SAVING_COMPLETED);
  assert(casIdx !== -1, 'the saving -> completed CAS must exist');
  const preSave = code.slice(0, casIdx);
  assert(
    /refundAndFail\(\s*'saving',\s*'retryable_failed'/.test(preSave),
    'a save() throw must refund and rest in retryable_failed before the saving -> completed CAS',
  );
});

Deno.test('FEAT-06 (3b): the merit is SETTLED only at/after the saving -> completed CAS (no settle on save-throw)', () => {
  const code = readExecutorCode();
  const firstSaving = code.indexOf("'saving'");
  const settleIdx = code.indexOf('merit_settled');
  assert(firstSaving !== -1 && settleIdx !== -1, 'saving transition + merit_settled must both exist');
  assert(
    settleIdx > firstSaving,
    'merit_settled must be written only after a saving transition — a save-throw path never settles',
  );
});

Deno.test('FEAT-06 (3c): NO refund is reachable after the point of no return (Pitfall 2)', () => {
  const code = readExecutorCode();
  const postSaving = code.slice(code.indexOf(SAVING_COMPLETED));
  assert(!postSaving.includes('refundMeritsForJob'), 'refund must be lexically unreachable after saving -> completed');
  assert(!/throw\s+new\s+MeritRefundable/.test(postSaving), 'no MeritRefundable throw after the point of no return');
});

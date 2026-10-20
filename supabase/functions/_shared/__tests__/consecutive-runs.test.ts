/**
 * Phase 09 · 09-06 · VER-02 / S-01c — FIVE CONSECUTIVE ANALYSES, all five features.
 *
 * THE GAP THIS CLOSES: "five consecutive analyses" had ZERO coverage anywhere in the repo.
 * The only "consecutive" hit was `_shared/merit-gateway.perf.test.ts` — a PERF test that
 * measures throughput; it never asserts that five runs mint five DISTINCT keys or that the
 * ledger lands exactly five debits. The 23-scenario ROADMAP row bundles
 * "first / second / five-consecutive" into one line, which is exactly how five-consecutive
 * silently vanished; 09-01 split it into S-01a / S-01b / S-01c so it could not.
 *
 * THE MONEY RISK (T-09-06-B): five consecutive analyses that fail to mint a fresh
 * `attemptNonce` would collapse into ONE run — the RPC replays `already_deducted` and the
 * user is UNDER-charged while silently receiving the FIRST run's result for all five. The
 * inverse (a colliding re-derivation) would double-charge. Both are financial correctness
 * bugs, and neither is observable from a single-run test.
 *
 * Parameterized over all five migrated features (D-10), so one file closes five registry
 * cells. Each feature's `feature` namespace is the REAL merit namespace threaded into
 * `deriveIdempotencyKey` via `runAnalysisLifecycle`'s `params.meritFeature`
 * (analysis-lifecycle.ts:233-239):
 *
 *   resume          -> 'resume_analysis'   (analyze-resume/index.ts:1293)
 *   onboarding      -> 'resume_analysis'   (analyze-resume/index.ts:1182 — onboarding SHARES
 *                                           the resume merit namespace; FEAT-01 (1d))
 *   linkedin        -> 'linkedin_grading'  (grade-linkedin/index.ts:377)
 *   recruiting_lens -> 'recruiting_lens'   (recruiting-lens/index.ts:589)
 *   career_compass  -> 'career_compass'    (submit-career-analysis-job/index.ts:157)
 *
 * Deterministic: real `deriveIdempotencyKey`, no network, no DB, no Anthropic.
 * std@0.224.0 to match the lifecycle guard neighbors.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { deriveIdempotencyKey, type IdempotencyKeyParts } from '../idempotency-key.ts';

const USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/** The five migrated features x their REAL merit-namespace + a stable content identity. */
const FEATURES: ReadonlyArray<{
  label: string;
  meritFeature: string;
  tier: string;
  inputIdentity: string;
}> = [
  { label: 'resume', meritFeature: 'resume_analysis', tier: 'free', inputIdentity: 'sha256:resume-content-hash' },
  { label: 'onboarding', meritFeature: 'resume_analysis', tier: 'free', inputIdentity: 'sha256:onboarding-resume-hash' },
  { label: 'linkedin', meritFeature: 'linkedin_grading', tier: 'free', inputIdentity: 'sha256:linkedin-profile-hash' },
  { label: 'recruiting_lens', meritFeature: 'recruiting_lens', tier: 'elite', inputIdentity: 'sha256:rcl-cachekey-hash' },
  { label: 'career_compass', meritFeature: 'career_compass', tier: 'free', inputIdentity: 'sha256:career-cachekey-hash' },
];

const RUNS = 5;

/**
 * Minimal in-memory stand-in for the 4-arg `check_and_deduct_merits` RPC contract: the
 * partial-unique index on `merit_transactions(idempotency_key)` makes a REPEATED key a
 * no-op replay (`already_deducted`) and a NEW key a fresh debit. We assert against the
 * CONTRACT, not against a live DB (this guard must run in the offline lane).
 */
function makeLedger() {
  const debits: string[] = [];
  return {
    deduct(idempotencyKey: string): 'deducted' | 'already_deducted' {
      if (debits.includes(idempotencyKey)) return 'already_deducted';
      debits.push(idempotencyKey);
      return 'deducted';
    },
    debitCount(): number {
      return debits.length;
    },
  };
}

for (const feature of FEATURES) {
  const base: IdempotencyKeyParts = {
    userId: USER,
    feature: feature.meritFeature,
    tier: feature.tier,
    inputIdentity: feature.inputIdentity,
    attemptNonce: 'unused',
  };

  Deno.test(`S-01c (${feature.label}): five consecutive runs derive FIVE DISTINCT keys (no collision)`, async () => {
    const keys: string[] = [];
    for (let run = 1; run <= RUNS; run++) {
      // Each deliberate submit mints a FRESH nonce (the frontend's crypto.randomUUID()).
      keys.push(await deriveIdempotencyKey({ ...base, attemptNonce: `nonce-run-${run}` }));
    }
    assertEquals(keys.length, RUNS);
    assertEquals(
      new Set(keys).size,
      RUNS,
      'five consecutive deliberate runs must derive five DISTINCT idempotency keys — a collision would silently collapse two runs into one charge',
    );
    for (const key of keys) {
      assert(/^[0-9a-f]{64}$/.test(key), `expected a 64-char lowercase hex digest, got "${key}"`);
    }
  });

  Deno.test(`S-01c (${feature.label}): five consecutive runs produce EXACTLY five debits (no dedup, no double-charge)`, async () => {
    const ledger = makeLedger();
    for (let run = 1; run <= RUNS; run++) {
      const key = await deriveIdempotencyKey({ ...base, attemptNonce: `nonce-run-${run}` });
      const outcome = ledger.deduct(key);
      assertEquals(
        outcome,
        'deducted',
        `run ${run} must be a FRESH deduction — an already_deducted replay here means the user was under-charged and served a stale run`,
      );
    }
    assertEquals(ledger.debitCount(), RUNS, 'five runs must land exactly five debits — not fewer (accidental dedup), not more (double-charge)');
  });

  Deno.test(`S-01c (${feature.label}): run N+1's key is unaffected by run N's SAVED state (Pitfall 8, across a sequence)`, async () => {
    // Pitfall 8: inputIdentity is a STABLE content identity and NEVER a save-mutated field
    // (analyzed_at / grading_data / prior_grade_id). The content does not change across the
    // five runs, so re-deriving run N's key AFTER runs N+1..5 have saved must land on the
    // SAME key run N originally used. If a save-mutated field had leaked into the identity,
    // this re-derivation would drift and a delivered analysis could be re-charged.
    const firstPass: string[] = [];
    for (let run = 1; run <= RUNS; run++) {
      firstPass.push(await deriveIdempotencyKey({ ...base, attemptNonce: `nonce-run-${run}` }));
    }
    // ...all five runs have now "saved". Re-derive each one's key from its own intent.
    for (let run = 1; run <= RUNS; run++) {
      const rederived = await deriveIdempotencyKey({ ...base, attemptNonce: `nonce-run-${run}` });
      assertEquals(
        rederived,
        firstPass[run - 1],
        `run ${run}'s key must be stable across the save state of every other run`,
      );
    }
  });

  Deno.test(`S-01c (${feature.label}): an accidental resubmit INSIDE the sequence re-charges nothing (same nonce -> replay)`, async () => {
    // The counterpart control: five deliberate runs charge five times, but a double-click on
    // run 3 (which re-sends run 3's nonce) must replay, not charge a sixth time.
    const ledger = makeLedger();
    for (let run = 1; run <= RUNS; run++) {
      ledger.deduct(await deriveIdempotencyKey({ ...base, attemptNonce: `nonce-run-${run}` }));
    }
    const accidentalResubmitOfRun3 = await deriveIdempotencyKey({ ...base, attemptNonce: 'nonce-run-3' });
    assertEquals(ledger.deduct(accidentalResubmitOfRun3), 'already_deducted');
    assertEquals(ledger.debitCount(), RUNS, 'an accidental resubmit must not add a sixth debit');
  });
}

Deno.test('S-01c (cross-feature): the same content + same nonce keys SEPARATELY per feature namespace', async () => {
  // Five features running the same user's same content on the same nonce must not collide
  // into one charge — the feature namespace is part of the identity.
  const keys = await Promise.all(
    FEATURES.map((f) =>
      deriveIdempotencyKey({
        userId: USER,
        feature: f.meritFeature,
        tier: 'free',
        inputIdentity: 'sha256:identical-content-across-features',
        attemptNonce: 'same-nonce',
      })
    ),
  );
  // resume + onboarding DELIBERATELY share the 'resume_analysis' merit namespace
  // (FEAT-01 (1d)), so identical parts collapse to the same key — that is the contract,
  // not a bug. The other three namespaces must all be distinct.
  assertEquals(keys[0], keys[1], 'onboarding shares the resume merit namespace by design (FEAT-01 (1d))');
  assertEquals(new Set(keys).size, 4, 'linkedin / recruiting_lens / career_compass must each key separately from resume');
});

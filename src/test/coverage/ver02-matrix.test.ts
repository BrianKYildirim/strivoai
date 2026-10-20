import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// VER-02 / D-12 — the scenario x feature coverage matrix as EXECUTABLE CODE.
//
// D-12: "The matrix is machine-enforced, not a document. A markdown matrix would drift
// the moment a test is renamed." This file is that enforcement.
//
// Modeled on `src/test/security/security-audit-docs.test.ts`: node:fs reads relative to
// process.cwd(), auto-discovered by vitest via the `src/**/*.test.ts` glob — there is NO
// allowlist to register with, so this guard cannot be silently dropped from the gate.
// Like `_shared/no-paddle-live-surface.test.ts`, the registry is an EXPLICIT literal table
// rather than a directory walk, "so this guard's coverage is auditable and intentional" —
// an auto-discovered registry cannot tell you what is MISSING, which is the whole point.
//
// The decisions behind the ambiguous cells (S-06, S-07, S-16, S-22, D-11 fault-injection)
// live in `.planning/phases/09-final-verification-milestone-report/09-COVERAGE-AUDIT.md`.
//
// ── Read this before editing the registry ────────────────────────────────────────────
// Cell `name` values are the VERBATIM inner title text of the real `Deno.test('...')` /
// `it('...')` call, copied from the file source. Test names in this repo contain
// apostrophes, unicode arrows (→) and ellipses (…), and mix quote styles — store the inner
// text and substring-match it; never reconstruct the call. A rename turns the cell RED.
// That is the feature, not a bug.

// ── The five migrated features (D-10). Interview Prep / Skills Gap / Compare Jobs are OUT.
const FEATURES = [
  'resume',
  'onboarding',
  'linkedin',
  'recruiting_lens',
  'career_compass',
] as const;
type Feature = (typeof FEATURES)[number];

// ── The 25 scenario rows. ROADMAP criterion 2 lists 23, but its first entry
// ("first / second / five-consecutive") is a bundle of three: S-01a / S-01b / S-01c.
// Splitting it is mandatory — five-consecutive is uncovered for every feature today and
// folding it into "first/second" is exactly how it would silently vanish.
const SCENARIOS = [
  'S-01a first analysis',
  'S-01b second analysis',
  'S-01c five consecutive analyses',
  'S-02 duplicate-click submission',
  'S-03 refresh during analysis',
  'S-04 navigate away and return',
  'S-05 missing input',
  'S-06 corrupted PDF',
  'S-07 large PDF',
  'S-08 reused input',
  'S-09 replacement upload',
  'S-10 provider timeout',
  'S-11 provider rate limiting',
  'S-12 invalid model JSON',
  'S-13 truncated model output',
  'S-14 schema-validation failure',
  'S-15 database-save failure',
  'S-16 insufficient Merits',
  'S-17 Merit-reservation failure',
  'S-18 settlement failure',
  'S-19 refund / release handling',
  'S-20 two simultaneous browser tabs',
  'S-21 previous-result preservation',
  'S-22 History correctness',
  'S-23 approved/rejected cross-origin',
] as const;

type Cell =
  // Covered: this exact test name must exist in this exact file, right now.
  //
  // `param` (09-08): some wave-2 suites are PARAMETERIZED — the test title on disk is a
  // template literal (`S-01c (${feature.label}): …`) and the per-feature instance name is
  // only produced at runtime. Storing the template alone would let someone delete a feature
  // from the suite's FEATURES table while all five registry cells stayed green. So a
  // parameterized cell ALSO pins the parameter literal (`label: 'linkedin'`) and BOTH
  // substrings must be present. This is strictly STRONGER than the unparameterized check,
  // never a relaxation of it.
  | { kind: 'test'; file: string; name: string; param?: string }
  // D-11 "there are no silent gaps": an accepted non-coverage, with a reason and an approver.
  | { kind: 'waiver'; reason: string; approvedBy: string }
  // TEMPORARY. A `gap` FAILS the suite. It exists so the first RED run enumerates the work
  // as a machine-generated list. Must be ZERO by the end of wave 3 (plan 09-08).
  // 09-08: ZERO gap cells remain. The type is deliberately KEPT so a future scenario can be
  // seeded as a gap and fail loudly rather than being quietly omitted.
  | { kind: 'gap'; owner: '09-05' | '09-06' | '09-07' };

// ── File constants ───────────────────────────────────────────────────────────────────
const SHARED = 'supabase/functions/_shared';
const RES = 'supabase/functions/analyze-resume';
const CAR = 'supabase/functions/analyze-career';
const LIN = 'supabase/functions/grade-linkedin';
const RCL = 'supabase/functions/recruiting-lens';

const RES_IDEM = `${RES}/__tests__/idempotency-repeated-run.test.ts`;
const CAR_IDEM = `${CAR}/__tests__/idempotency-repeated-run.test.ts`;
const LIN_IDEM = `${LIN}/__tests__/idempotency-repeated-run.test.ts`;
const RES_RVC = `${RES}/__tests__/runtime-validation-convergence.test.ts`;
const CAR_RVC = `${CAR}/__tests__/runtime-validation-convergence.test.ts`;
const LIN_RVC = `${LIN}/__tests__/runtime-validation-convergence.test.ts`;
const LIN_FSG = `${LIN}/__tests__/fixed-source-guard.test.ts`;
const RES_CORS = `${RES}/__tests__/cors-matrix.test.ts`;
const CAR_CORS = `${CAR}/__tests__/cors-matrix.test.ts`;
const RCL_CORS = `${RCL}/__tests__/cors-matrix.test.ts`;
const RES_FB = `${RES}/failure-branches.test.ts`;
const CAR_FB = `${CAR}/failure-branches.test.ts`;
const RES_RAS = `${RES}/refund-after-save.test.ts`;
const CAR_RAS = `${CAR}/refund-after-save.test.ts`;
const LIN_RAS = `${LIN}/refund-after-save.test.ts`;
const RCL_HC = `${RCL}/handler-config.test.ts`;
const RCL_SCHEMA = `${RCL}/schema.test.ts`;
const LIN_NO_FREE_SCAN = `${LIN}/no-free-scan.test.ts`;
const LIN_VAL = `${LIN}/validation.test.ts`;
const CLASSIFIER = `${SHARED}/analysis-lifecycle.classifier.test.ts`;
const BOUNDARY = `${SHARED}/analysis-lifecycle.refund-boundary.test.ts`;
const TAXONOMY = `${SHARED}/analysis-error-taxonomy.test.ts`;
const MERIT = `${SHARED}/merit-gateway.test.ts`;
const MERIT_SPEND = `${SHARED}/merit-gateway.spend-ordering.test.ts`;
const DOC_QUALITY = `${SHARED}/document-quality.test.ts`;
const DOC_EXTRACT = `${SHARED}/document-extraction.test.ts`;
const PROC_RES = 'supabase/functions/process-resume-analysis-job/__tests__/refund-on-failure.test.ts';
const PROC_CAR = 'supabase/functions/process-career-analysis-job/__tests__/refund-on-failure.test.ts';
const HOOK = 'src/hooks/__tests__/useAnalysisRun.test.ts';
const CC_RECOVERY = 'src/pages/__tests__/CareerCompass.recovery.test.tsx';

// ── Wave-2 additions (09-05 / 09-06 / 09-07). Every supabase/functions path below is
// registered in deno.json (test:ci or test:remote) — assertion 5 proves it.
const RCL_IDEM = `${RCL}/__tests__/idempotency-repeated-run.test.ts`;
const RCL_RVC = `${RCL}/__tests__/runtime-validation-convergence.test.ts`;
const RCL_RAS = `${RCL}/__tests__/refund-after-save.test.ts`;
const LIN_CORS = `${LIN}/__tests__/cors-matrix.test.ts`;
const CONSEC = `${SHARED}/__tests__/consecutive-runs.test.ts`;
const REPL = `${SHARED}/__tests__/replacement-upload.test.ts`;
// S-22: the REMOTE lane (deno.json `test:remote`, gated on DENO_TEST_SUPABASE_REMOTE=1).
const HIST_RES = `${RES}/__tests__/history-persistence.test.ts`;
const HIST_CAR = `${CAR}/__tests__/history-persistence.test.ts`;
const HIST_LIN = `${LIN}/__tests__/history-persistence.test.ts`;
const HIST_RCL = `${RCL}/__tests__/history-persistence.test.ts`;
// S-22: the OFFLINE static wiring guards that pair with them (test:ci).
const WIRE_RES = `${RES}/__tests__/history-wiring.test.ts`;
const WIRE_CAR = `${CAR}/__tests__/history-wiring.test.ts`;
const WIRE_LIN = `${LIN}/__tests__/history-wiring.test.ts`;
const WIRE_RCL = `${RCL}/__tests__/history-wiring.test.ts`;
// Per-feature page-wiring specs (vitest, auto-discovered).
const RES_REC = 'src/pages/__tests__/Upload.recovery.test.tsx';
const ONB_REC = 'src/pages/__tests__/Onboarding.recovery.test.tsx';
const LIN_REC = 'src/pages/__tests__/LinkedInGrader.recovery.test.tsx';
const RCL_REC = 'src/pages/__tests__/RecruitingLens.recovery.test.tsx';
// The only genuine multi-browser-context spec in the repo (Playwright, auto-discovered).
const TWO_TAB = 'e2e/two-tab-concurrency.spec.ts';

const t = (file: string, name: string): Cell => ({ kind: 'test', file, name });
/** A cell in a PARAMETERIZED suite: the template title AND the parameter literal must both exist. */
const tp = (file: string, name: string, param: string): Cell => ({ kind: 'test', file, name, param });
const gap = (owner: '09-05' | '09-06' | '09-07'): Cell => ({ kind: 'gap', owner });

// Onboarding is NOT a separate edge function — it is `analyze-resume` with
// `origin: 'onboarding'` in the body. Its column is the Resume column PLUS this dispatch
// assertion. There is no `onboarding/` test dir and none is invented.
const ONBOARDING_DISPATCH = t(
  RES_IDEM,
  'FEAT-01 (1d): the onboarding feature namespace shares the resume merit identity (same parts → same key)',
);

// S-07: no upload byte-size guard exists in the PRODUCT (grep-verified). This is a product
// gap, not a test gap, and a verification phase must not paper over it by re-labelling the
// per-tier CHARACTER cap (getMaxInputChars) as the answer. Carried to VER-05 report item 14.
const LARGE_PDF_WAIVER: Cell = {
  kind: 'waiver',
  reason:
    'No upload byte-size guard exists in the product: grep-verified absent from src/lib, ' +
    'src/pages/Upload.tsx and _shared/document-extraction.ts. The per-tier CHARACTER caps ' +
    '(getMaxInputChars) truncate AFTER extraction and are not a file-size guard. Tracked as a ' +
    'residual PRODUCT risk and carried to VER-05 report item 14 (remaining risks + follow-ups); ' +
    'see 09-COVERAGE-AUDIT.md S-07.',
  approvedBy: '09-01 (D-11 registry decision)',
};

// Shared seams. The behaviour lives in ONE module with ONE branch — re-proving it per
// feature is the coverage theatre D-09 forbids. See 09-COVERAGE-AUDIT.md.
const CORRUPTED_PDF: Cell[] = [
  t(DOC_QUALITY, 'assessExtractionQuality rejects symbol-heavy output'),
  t(DOC_QUALITY, 'assessExtractionQuality rejects repeated-line output'),
  t(DOC_QUALITY, 'assessExtractionQuality rejects missing document signals'),
  t(DOC_QUALITY, 'assessExtractionQuality rejects short text'),
  t(DOC_EXTRACT, 'extractDocumentText returns all_providers_failed with no accepted text'),
];
const PROVIDER_TIMEOUT: Cell[] = [
  t(CLASSIFIER, 'classifyFailure: 408 (timeout status) → retryable'),
  t(CLASSIFIER, 'classifyFailure: timeout message → retryable'),
  t(CLASSIFIER, 'classifyFailure: typed MODEL_TIMEOUT code → retryable (taxonomy authoritative)'),
];
const PROVIDER_RATE_LIMIT: Cell[] = [
  t(CLASSIFIER, 'classifyFailure: 429 (rate limited) → retryable + MODEL_RATE_LIMITED'),
  t(TAXONOMY, 'retryable partition matches LIFE-06 (only MODEL_TIMEOUT + MODEL_RATE_LIMITED)'),
];
const RESERVATION_FAILURE: Cell[] = [
  t(MERIT_SPEND, 'SC-7 insufficient: spend 3 from sub=1 shop=1 -> insufficient_merits, 0 ledger rows'),
  t(TAXONOMY, 'every code maps to a status + message + retryable'),
];
const SETTLE_BOUNDARY: Cell[] = [
  t(BOUNDARY, 'refund-boundary: merit_settled appears ONLY after a saving transition token (Pitfall 3)'),
  t(BOUNDARY, 'refund-boundary: the saving -> completed transition exists in code'),
];
const INSUFFICIENT_MERITS_402 = t(MERIT, 'insufficientMeritsResponse returns 402 with correct error code');
const MISSING_INPUT_TAXONOMY = t(TAXONOMY, 'every code maps to a status + message + retryable');
const NO_REFUND_AFTER_SAVE = t(
  BOUNDARY,
  'refund-boundary: NO refundMeritsForJob after saving -> completed (Pitfall 2)',
);

// ── 09-06 parameterized suites. The titles below are TEMPLATE LITERALS on disk — the
// `${feature.label}` bytes are literal, and `param` pins the feature's row in the suite's
// FEATURES table so deleting a feature from that table turns its cells RED.
const consecutive = (label: Feature): Cell[] => [
  tp(CONSEC, 'S-01c (${feature.label}): five consecutive runs derive FIVE DISTINCT keys (no collision)', `label: '${label}'`),
  tp(CONSEC, 'S-01c (${feature.label}): five consecutive runs produce EXACTLY five debits (no dedup, no double-charge)', `label: '${label}'`),
  tp(CONSEC, "S-01c (${feature.label}): run N+1's key is unaffected by run N's SAVED state (Pitfall 8, across a sequence)", `label: '${label}'`),
  tp(CONSEC, 'S-01c (${feature.label}): an accidental resubmit INSIDE the sequence re-charges nothing (same nonce -> replay)', `label: '${label}'`),
];

const replacement = (label: Feature): Cell[] => [
  tp(REPL, 'S-09 (${feature.label}): a REPLACEMENT upload derives a DIFFERENT inputIdentity -> a DIFFERENT key', `label: '${label}'`),
  tp(REPL, 'S-09 (${feature.label}): the replacement cannot resolve to the ORIGINAL run (no stale result served)', `label: '${label}'`),
  tp(REPL, 'S-09 (${feature.label}): the DOCUMENT is load-bearing — new content alone re-keys, even on the SAME nonce', `label: '${label}'`),
  tp(REPL, 'S-09 (${feature.label}): SENSITIVITY CONTROL — the SAME document on the SAME nonce re-derives the SAME key (S-01a)', `label: '${label}'`),
];

// ── S-20. The BLOCKING half of the two-tab spec — the only assertion in the repo that opens
// two real `browser.newContext()` tabs. It drives the resume upload flow end-to-end, so it
// is the cross-context PROOF; the per-feature half of each cell is that feature's own
// "one deliberate submit mints exactly one run" wiring (a second tab is just a second
// concurrent submit surface, so that wiring is what makes the invariant hold per feature).
//
// The spec's OTHER half — `QUARANTINE: tab B recovers tab A's SAME run_id …` — is a
// `test.skip` and is DELIBERATELY NOT MAPPED HERE. VITE_FEATURE_ANALYSIS_LIFECYCLE is absent
// from the E2E build, so no run_id is ever persisted for tab B to recover; that is the
// dormant posture the milestone ships (D-03), not flakiness. It is quarantined with an owner
// + expiry in TESTING-STRATEGY.md. Mapping a skipped test as "covered" is exactly the
// coverage theatre D-11 forbids. See 09-06-SUMMARY.md § "S-20 quarantine".
const TWO_TAB_BLOCKING = t(
  TWO_TAB,
  'one submit with TWO live tabs open creates EXACTLY ONE analysis and AT MOST ONE merit debit',
);

// ── The per-feature "a duplicate/concurrent submit cannot mint a second charged run" wiring.
const DUP_GUARD: Record<Feature, Cell> = {
  resume: t(RES_REC, 'resume: engages a submit-lock (isLocked || isAnalysisRunActive) to block a duplicate concurrent submit'),
  onboarding: t(
    ONB_REC,
    'onboarding: derives the attemptNonce from a STABLE ref and disables the button while loading (a duplicate click cannot mint a second run)',
  ),
  linkedin: t(
    LIN_REC,
    'linkedin: mints ONE attemptNonce per deliberate grade and disables submit while loading (a duplicate click cannot double-charge)',
  ),
  recruiting_lens: t(
    RCL_REC,
    'recruiting_lens: engages the useAnalysisGuard in-flight lock and disables submit while isAnalyzing (a duplicate click cannot start a second run)',
  ),
  career_compass: t(
    CC_RECOVERY,
    'engages a submit-lock (isLocked || analysisRun.isActive) to block a duplicate concurrent submit',
  ),
};

// ── The per-feature "a refresh / navigate-away re-attaches to the LIVE run" wiring.
const RECOVERY_WIRING: Record<Feature, Cell> = {
  resume: t(RES_REC, 'resume: calls startRun(event.run_id) so a refresh/navigation re-attaches to the live run'),
  onboarding: t(
    ONB_REC,
    'onboarding: calls startRun(data.run_id) before navigating so a refresh/navigation re-attaches to the live run',
  ),
  linkedin: t(LIN_REC, 'linkedin: calls startRun(run_id) so a refresh/navigation re-attaches to the live run'),
  recruiting_lens: t(
    RCL_REC,
    'recruiting_lens: calls startRun(run_id) so a refresh/navigation re-attaches to the live run',
  ),
  career_compass: t(CC_RECOVERY, 'calls startRun(careerJobId) so a refresh/navigation re-attaches to the live run'),
};

// ── The per-feature "a later failure never clears the last success" wiring.
const PRESERVE_WIRING: Record<Feature, Cell> = {
  resume: t(RES_REC, 'resume: preserves the last successful result so a later failure never clears it'),
  onboarding: t(ONB_REC, 'onboarding: preserves the last successful result so a later failure never clears it'),
  linkedin: t(
    LIN_REC,
    'linkedin: a failed grade never clears the previously rendered result (no setResult(null) on the failure path)',
  ),
  recruiting_lens: t(
    RCL_REC,
    'recruiting_lens: a failed analysis never clears the previously rendered result (restored from sessionStorage, not cleared on failure)',
  ),
  career_compass: t(
    CC_RECOVERY,
    'references analysisRun.previousResult so a later failure never clears the last success',
  ),
};

// Shared-substrate halves (09-01's registry rule: substrate AND per-feature wiring).
const HOOK_DUP: Cell[] = [
  t(HOOK, 'ignores a duplicate startRun while a run is active (dup guard)'),
  t(HOOK, 'the dup-guard holds the original run_id when startRun fires again mid-flight (no re-charge)'),
];
const HOOK_RECOVER: Cell[] = [t(HOOK, 'recovers an active run from a persisted run_id on mount')];
const HOOK_RETURN: Cell[] = [
  t(HOOK, 'recovers an active run from a persisted run_id on mount'),
  t(HOOK, 'clears a recovered run_id that resolves to a legacy row (state:null on a 200)'),
];
const HOOK_PRESERVE: Cell[] = [t(HOOK, 'keeps the last successful result when a subsequent run fails')];

// ── THE REGISTRY. 25 scenarios x 5 features = 125 cells. No cell may be omitted. ───────
const REGISTRY: Record<string, Record<Feature, Cell[]>> = {
  'S-01a first analysis': {
    resume: [t(RES_IDEM, 'FEAT-02 (1a): the same attemptNonce re-derives the SAME key (accidental resubmit → one deduction)')],
    onboarding: [
      ONBOARDING_DISPATCH,
      t(RES_IDEM, 'FEAT-02 (1a): the same attemptNonce re-derives the SAME key (accidental resubmit → one deduction)'),
    ],
    linkedin: [t(LIN_IDEM, 'FEAT-04 (1a): the same attemptNonce re-derives the SAME key (accidental resubmit → one deduction)')],
    recruiting_lens: [
      t(RCL_IDEM, 'FEAT-06 (1a): the same attemptNonce re-derives the SAME key (accidental resubmit → one deduction)'),
      t(RCL_IDEM, 'FEAT-06 (1b): the derived key is a stable 64-char lowercase hex digest'),
    ],
    career_compass: [t(CAR_IDEM, 'FEAT-05 (1a): the same attemptNonce re-derives the SAME key (accidental resubmit → one deduction)')],
  },

  'S-01b second analysis': {
    resume: [
      t(RES_IDEM, 'FEAT-02 (2a): a fresh attemptNonce derives a DIFFERENT key (deliberate new run)'),
      t(RES_IDEM, 'FEAT-02 (2b): the same content re-analyzed on a new nonce keys ONLY on the nonce (History preserved)'),
    ],
    onboarding: [
      ONBOARDING_DISPATCH,
      t(RES_IDEM, 'FEAT-02 (2a): a fresh attemptNonce derives a DIFFERENT key (deliberate new run)'),
    ],
    linkedin: [
      t(LIN_IDEM, 'FEAT-04 (2a): a fresh attemptNonce derives a DIFFERENT key (deliberate new run)'),
      t(LIN_IDEM, 'FEAT-04 (2b): the same content re-graded on a new nonce keys ONLY on the nonce (History preserved)'),
    ],
    recruiting_lens: [
      t(RCL_IDEM, 'FEAT-06 (2a): a fresh attemptNonce derives a DIFFERENT key (deliberate new run)'),
      t(RCL_IDEM, 'FEAT-06 (2b): the same content re-analyzed on a new nonce keys ONLY on the nonce (History preserved)'),
    ],
    career_compass: [
      t(CAR_IDEM, 'FEAT-05 (2a): a fresh attemptNonce derives a DIFFERENT key (deliberate new run)'),
      t(CAR_IDEM, 'FEAT-05 (2b): the same inputs re-analyzed on a new nonce key ONLY on the nonce (History preserved)'),
    ],
  },

  // CLOSED by 09-06. Was uncovered for every feature (the only "consecutive" hit in the repo
  // was _shared/merit-gateway.perf.test.ts — a perf test, not a per-feature scenario).
  'S-01c five consecutive analyses': {
    resume: consecutive('resume'),
    onboarding: [ONBOARDING_DISPATCH, ...consecutive('onboarding')],
    linkedin: consecutive('linkedin'),
    recruiting_lens: consecutive('recruiting_lens'),
    career_compass: consecutive('career_compass'),
  },

  // Registry rule (09-COVERAGE-AUDIT.md): S-02/03/04/21 are covered iff
  // (shared-substrate test) AND (per-feature wiring assertion). 09-06 built the four missing
  // page-level wiring specs, so all five columns now satisfy BOTH halves of the rule.
  'S-02 duplicate-click submission': {
    resume: [...HOOK_DUP, DUP_GUARD.resume],
    onboarding: [ONBOARDING_DISPATCH, ...HOOK_DUP, DUP_GUARD.onboarding],
    linkedin: [...HOOK_DUP, DUP_GUARD.linkedin],
    recruiting_lens: [...HOOK_DUP, DUP_GUARD.recruiting_lens],
    career_compass: [...HOOK_DUP, DUP_GUARD.career_compass],
  },

  'S-03 refresh during analysis': {
    resume: [...HOOK_RECOVER, RECOVERY_WIRING.resume],
    onboarding: [ONBOARDING_DISPATCH, ...HOOK_RECOVER, RECOVERY_WIRING.onboarding],
    linkedin: [...HOOK_RECOVER, RECOVERY_WIRING.linkedin],
    recruiting_lens: [...HOOK_RECOVER, RECOVERY_WIRING.recruiting_lens],
    career_compass: [...HOOK_RECOVER, RECOVERY_WIRING.career_compass],
  },

  // The hook treats refresh and navigate-away/return as ONE recovery path.
  'S-04 navigate away and return': {
    resume: [...HOOK_RETURN, RECOVERY_WIRING.resume],
    onboarding: [ONBOARDING_DISPATCH, ...HOOK_RETURN, RECOVERY_WIRING.onboarding],
    linkedin: [...HOOK_RETURN, RECOVERY_WIRING.linkedin],
    recruiting_lens: [...HOOK_RETURN, RECOVERY_WIRING.recruiting_lens],
    career_compass: [...HOOK_RETURN, RECOVERY_WIRING.career_compass],
  },

  'S-05 missing input': {
    resume: [
      t(RES_FB, '05-02/resume(A): bad-input rejection branch is wired (resumeText length guard)'),
      MISSING_INPUT_TAXONOMY,
    ],
    onboarding: [
      ONBOARDING_DISPATCH,
      t(RES_FB, '05-02/resume(A): bad-input rejection branch is wired (resumeText length guard)'),
    ],
    linkedin: [
      t(LIN_VAL, 'schema: a missing canonical section name fails to parse (no default section)'),
      MISSING_INPUT_TAXONOMY,
    ],
    recruiting_lens: [
      t(RCL_SCHEMA, 'schema: rejects a body missing recruiterVerdict'),
      MISSING_INPUT_TAXONOMY,
    ],
    career_compass: [
      // 260713-hrd: renamed when the 412 prior-analyses gate was removed (Free is standalone).
      // The cell is still covered — the guard now proves the 412 is GONE and the 400 remains.
      t(CAR_FB, '05-02/career(A): the 412 prior-analyses gates are GONE; bad-input 400 still wired'),
      MISSING_INPUT_TAXONOMY,
    ],
  },

  // Shared extraction seam — every document-ingesting feature funnels through it.
  'S-06 corrupted PDF': {
    resume: CORRUPTED_PDF,
    onboarding: CORRUPTED_PDF,
    linkedin: CORRUPTED_PDF,
    recruiting_lens: CORRUPTED_PDF,
    career_compass: CORRUPTED_PDF,
  },

  // WAIVED — a real product gap, not a test gap. See 09-COVERAGE-AUDIT.md S-07.
  'S-07 large PDF': {
    resume: [LARGE_PDF_WAIVER],
    onboarding: [LARGE_PDF_WAIVER],
    linkedin: [LARGE_PDF_WAIVER],
    recruiting_lens: [LARGE_PDF_WAIVER],
    career_compass: [LARGE_PDF_WAIVER],
  },

  'S-08 reused input': {
    resume: [
      t(RES_IDEM, 'FEAT-02 (1c): a save-mutated field cannot shift the key — stable inputIdentity → stable key (Pitfall 8)'),
      t(RES_IDEM, 'FEAT-02 (2c): tier is part of the identity — the same content on a different tier keys separately'),
    ],
    onboarding: [
      ONBOARDING_DISPATCH,
      t(RES_IDEM, 'FEAT-02 (1c): a save-mutated field cannot shift the key — stable inputIdentity → stable key (Pitfall 8)'),
    ],
    linkedin: [
      t(LIN_IDEM, 'FEAT-04 (1c): a save-mutated field cannot shift the key — stable inputIdentity → stable key (Pitfall 8)'),
    ],
    recruiting_lens: [
      t(RCL_IDEM, 'FEAT-06 (1c): a save-mutated field cannot shift the key — stable inputIdentity → stable key (Pitfall 8)'),
      t(RCL_IDEM, 'FEAT-06 (1d): the RCL inputIdentity is the content-hashed cacheKey (no save-mutated field is reachable)'),
      t(RCL_IDEM, 'FEAT-06 (2c): tier is part of the identity — the same content on a different tier keys separately'),
    ],
    career_compass: [
      t(CAR_IDEM, 'FEAT-05 (1c): a save-mutated field cannot shift the key — stable inputIdentity → stable key (Pitfall 8)'),
      t(CAR_IDEM, 'FEAT-05 (2c): allowResumeOnly is part of inputIdentity — distinct intents key separately'),
    ],
  },

  // CLOSED by 09-06. Was zero hits anywhere: a grep for
  // `replacement upload|re-upload|reupload|replace.*upload` across supabase/functions, src
  // and e2e returned nothing. career_compass is a FULL member, NOT a waiver: its
  // inputIdentity is built from the document CONTENTS (buildCareerInputIdentity hashes
  // resumeText + linkedinText), so replacing a document re-keys it exactly like the other
  // four. See 09-06-SUMMARY.md § "career_compass S-09 disposition".
  'S-09 replacement upload': {
    resume: replacement('resume'),
    onboarding: [ONBOARDING_DISPATCH, ...replacement('onboarding')],
    linkedin: replacement('linkedin'),
    recruiting_lens: replacement('recruiting_lens'),
    career_compass: replacement('career_compass'),
  },

  // D-11 Path A: the deterministic classifier twin of the live staging seam
  // MERIT_TEST_FORCE_REFUNDABLE_ERROR=408.
  'S-10 provider timeout': {
    resume: PROVIDER_TIMEOUT,
    onboarding: PROVIDER_TIMEOUT,
    linkedin: PROVIDER_TIMEOUT,
    // 09-05 added the per-feature ROUTING claim on top of the shared classifier: RCL's
    // status-bearing MeritRefundable actually reaches classifyFailure as a retryable timeout.
    recruiting_lens: [
      ...PROVIDER_TIMEOUT,
      t(RCL_RVC, 'FEAT-06: a 408 provider timeout on the RCL path classifies as MODEL_TIMEOUT / retryable (S-10)'),
    ],
    career_compass: PROVIDER_TIMEOUT,
  },

  // ... and of MERIT_TEST_FORCE_REFUNDABLE_ERROR=429.
  'S-11 provider rate limiting': {
    resume: PROVIDER_RATE_LIMIT,
    onboarding: PROVIDER_RATE_LIMIT,
    linkedin: PROVIDER_RATE_LIMIT,
    recruiting_lens: [
      ...PROVIDER_RATE_LIMIT,
      t(RCL_RVC, 'FEAT-06: a 429 provider rate-limit on the RCL path classifies as MODEL_RATE_LIMITED / retryable (S-11)'),
    ],
    career_compass: PROVIDER_RATE_LIMIT,
  },

  // D-11 Path A (NO source change to _shared/anthropic.ts — the seam cannot force a
  // malformed SUCCESS body, and a verification phase must not add a branch to a production
  // code path). The validation boundary is where the rejection happens, so that is where
  // it is proven.
  'S-12 invalid model JSON': {
    resume: [
      t(RES_RVC, 'FEAT-02: garbage (non-JSON) output → MODEL_INVALID_RESPONSE'),
      t(RES_RVC, 'FEAT-02: empty model output → MODEL_INVALID_RESPONSE (never a substituted body)'),
    ],
    onboarding: [
      ONBOARDING_DISPATCH,
      t(RES_RVC, 'FEAT-02: garbage (non-JSON) output → MODEL_INVALID_RESPONSE'),
    ],
    linkedin: [
      t(LIN_RVC, '04-GAP-01: garbage model output → TYPED error through the runtime seam (no 200-with-body)'),
      t(LIN_FSG, 'fixed-source: garbage (non-JSON) model output → typed MODEL_INVALID_RESPONSE (no body)'),
    ],
    recruiting_lens: [
      t(RCL_RVC, 'FEAT-06: garbage (non-JSON) output → MODEL_INVALID_RESPONSE'),
      t(RCL_RVC, 'FEAT-06: empty model output → MODEL_INVALID_RESPONSE (never a substituted body)'),
      t(RCL_RVC, 'FEAT-06: an empty object {} → MODEL_INVALID_RESPONSE (empty/generic)'),
    ],
    career_compass: [
      t(CAR_RVC, 'FEAT-05: garbage (non-JSON) output → MODEL_INVALID_RESPONSE'),
      t(CAR_RVC, 'FEAT-05: empty model output → MODEL_INVALID_RESPONSE (never fabricated guidance)'),
    ],
  },

  'S-13 truncated model output': {
    resume: [
      t(RES_RVC, 'FEAT-02: a TRUNCATED (clipped) body → MODEL_OUTPUT_TRUNCATED (rejected, never repaired-and-accepted)'),
    ],
    onboarding: [
      ONBOARDING_DISPATCH,
      t(RES_RVC, 'FEAT-02: a TRUNCATED (clipped) body → MODEL_OUTPUT_TRUNCATED (rejected, never repaired-and-accepted)'),
    ],
    linkedin: [
      t(LIN_FSG, 'fixed-source: truncated/clipped model output → typed MODEL_OUTPUT_TRUNCATED (never repaired-and-accepted)'),
    ],
    recruiting_lens: [
      t(RCL_RVC, 'FEAT-06: a TRUNCATED (clipped) body → MODEL_OUTPUT_TRUNCATED (rejected, never repaired-and-accepted)'),
      t(RCL_RVC, 'FEAT-06: a body clipped mid-string is NOT silently completed into an accepted result'),
    ],
    career_compass: [
      t(CAR_RVC, 'FEAT-05: a TRUNCATED (clipped) career body → MODEL_OUTPUT_TRUNCATED (rejected, never repaired-and-accepted)'),
    ],
  },

  'S-14 schema-validation failure': {
    resume: [
      t(RES_RVC, 'FEAT-02: missing overallScore → SCHEMA_VALIDATION_FAILED'),
      t(RES_RVC, 'FEAT-02: empty criteria array → SCHEMA_VALIDATION_FAILED (superRefine non-empty guard)'),
      t(RES_RVC, 'FEAT-02: all-zero criterion scores → SCHEMA_VALIDATION_FAILED (model did not score)'),
    ],
    onboarding: [
      ONBOARDING_DISPATCH,
      t(RES_RVC, 'FEAT-02: missing overallScore → SCHEMA_VALIDATION_FAILED'),
    ],
    linkedin: [
      t(LIN_RVC, '04-GAP-01: an OLD legacy 4-section payload is REJECTED by the converged seam'),
      t(LIN_VAL, 'semanticCheck: a rawScore that does not equal normalizeFromSections is rejected'),
    ],
    recruiting_lens: [
      t(RCL_SCHEMA, 'schema: rejects a body missing overallMatch.score'),
      t(RCL_SCHEMA, 'schema: rejects an out-of-range overallMatch.score'),
      t(RCL_SCHEMA, 'schema: rejects an empty topGaps array'),
      // 09-05: the same rejections driven through the RUNTIME seam the lifecycle actually
      // calls (validateModelOutput), not just the schema in isolation.
      t(RCL_RVC, 'FEAT-06: missing overallMatch.score → SCHEMA_VALIDATION_FAILED'),
      t(RCL_RVC, 'FEAT-06: a missing recruiterVerdict → SCHEMA_VALIDATION_FAILED (the product headline is never fabricated)'),
    ],
    career_compass: [
      t(CAR_RVC, 'FEAT-05: empty careerFields array → SCHEMA_VALIDATION_FAILED (superRefine core guard)'),
      t(CAR_RVC, 'FEAT-05: missing roleReadinessBreakdown → SCHEMA_VALIDATION_FAILED (semanticCheck core)'),
    ],
  },

  'S-15 database-save failure': {
    resume: [
      t(RES_IDEM, 'FEAT-02 (3a): a save-throw routes to refund + retryable_failed BEFORE the point of no return'),
      NO_REFUND_AFTER_SAVE,
    ],
    onboarding: [
      ONBOARDING_DISPATCH,
      t(RES_IDEM, 'FEAT-02 (3a): a save-throw routes to refund + retryable_failed BEFORE the point of no return'),
    ],
    linkedin: [
      t(LIN_IDEM, 'FEAT-04 (3a): a save-throw routes to refund + retryable_failed BEFORE the point of no return'),
      NO_REFUND_AFTER_SAVE,
    ],
    recruiting_lens: [
      t(RCL_HC, 'recruiting-lens: classifies AI/persist failures as MeritRefundable'),
      t(RCL_IDEM, 'FEAT-06 (3a): a save-throw routes to refund + retryable_failed BEFORE the point of no return'),
      NO_REFUND_AFTER_SAVE,
    ],
    career_compass: [
      t(CAR_IDEM, 'FEAT-05 (3a): a save-throw routes to refund + retryable_failed BEFORE the point of no return'),
      NO_REFUND_AFTER_SAVE,
    ],
  },

  // RCL is Elite-gated (403 elite_required) rather than merit-gated in the same shape.
  // The cell is satisfied by (tier gate) + (routes spend through withMerits) + (the shared
  // gateway's own 402). See 09-COVERAGE-AUDIT.md S-16.
  'S-16 insufficient Merits': {
    resume: [
      t(RES_FB, '05-02/resume(A): withMerits wraps resume_analysis unconditionally (no MERIT_SYSTEM_ENABLED gate)'),
      INSUFFICIENT_MERITS_402,
    ],
    onboarding: [
      ONBOARDING_DISPATCH,
      t(RES_FB, '05-02/resume(A): 402/429 usage/cap short-circuit branch is wired in the parallel-call path'),
      INSUFFICIENT_MERITS_402,
    ],
    linkedin: [
      t(LIN_NO_FREE_SCAN, 'legacy LinkedIn path checks entitlement and records one usage credit'),
      INSUFFICIENT_MERITS_402,
    ],
    recruiting_lens: [
      t(RCL_HC, 'recruiting-lens: rejects the Free tier with a 403 elite_required gate'),
      t(RCL_HC, 'recruiting-lens: wires withMerits for the recruiting_lens action'),
      INSUFFICIENT_MERITS_402,
    ],
    career_compass: [
      t(CAR_FB, '05-02/career(A): withMerits wraps career_compass and raises MeritRefundable on failure'),
      INSUFFICIENT_MERITS_402,
    ],
  },

  'S-17 Merit-reservation failure': {
    resume: RESERVATION_FAILURE,
    onboarding: RESERVATION_FAILURE,
    linkedin: RESERVATION_FAILURE,
    recruiting_lens: RESERVATION_FAILURE,
    career_compass: RESERVATION_FAILURE,
  },

  'S-18 settlement failure': {
    resume: [
      ...SETTLE_BOUNDARY,
      t(RES_IDEM, 'FEAT-02 (3b): the merit is SETTLED only at/after the saving -> completed CAS (no settle on save-throw)'),
    ],
    onboarding: [
      ONBOARDING_DISPATCH,
      t(RES_IDEM, 'FEAT-02 (3b): the merit is SETTLED only at/after the saving -> completed CAS (no settle on save-throw)'),
    ],
    linkedin: [
      ...SETTLE_BOUNDARY,
      t(LIN_IDEM, 'FEAT-04 (3b): the merit is SETTLED only at/after the saving -> completed CAS (no settle on save-throw)'),
    ],
    recruiting_lens: [
      ...SETTLE_BOUNDARY,
      t(RCL_IDEM, 'FEAT-06 (3b): the merit is SETTLED only at/after the saving -> completed CAS (no settle on save-throw)'),
    ],
    career_compass: [
      ...SETTLE_BOUNDARY,
      t(CAR_IDEM, 'FEAT-05 (3b): the merit is SETTLED only at/after the saving -> completed CAS (no settle on save-throw)'),
    ],
  },

  'S-19 refund / release handling': {
    resume: [
      t(RES_RAS, 'CR-01: no post-save usage-write FAILURE branch throws MeritRefundable (delivered analysis is not refunded)'),
      t(PROC_RES, 'SC#5(b): response-path failed branch calls refundMeritsForJob with txId'),
      t(RES_IDEM, 'FEAT-02 (3c): NO refund is reachable after the point of no return (Pitfall 2)'),
    ],
    onboarding: [
      ONBOARDING_DISPATCH,
      t(RES_RAS, 'CR-01: no post-save usage-write FAILURE branch throws MeritRefundable (delivered analysis is not refunded)'),
    ],
    linkedin: [
      t(LIN_RAS, 'Fix2: no post-save usage-write FAILURE branch throws MeritRefundable or 500s a delivered analysis'),
      t(LIN_IDEM, 'FEAT-04 (3c): NO refund is reachable after the point of no return (Pitfall 2)'),
    ],
    // 09-05 FINDING F1 (deferred-items.md D9-02) is now CLOSED (commit 3ad99602).
    // `persistRecruitingLensResult` used to throw MeritRefundable AFTER its durable
    // analysis_results insert — the pre-Fix-2 shape Phase 02 removed from the other three
    // features, which RCL was missed by. That post-save throw is GONE: the helper now
    // log-and-continues to the durable success return, exactly as grade-linkedin does.
    //
    // The cell is mapped to BOTH halves of the proof, so neither can rot silently:
    //   1. `[F1]`     pins the ROUTING     — the migrated lifecycle save() never calls the
    //                                        legacy helper at all (true before and after the fix);
    //   2. `[F1-fix]` pins the ABSENCE     — no post-save refundable throw survives in the
    //                                        legacy helper (the same absolute assertion
    //                                        grade-linkedin makes). This one WOULD have been
    //                                        red before 3ad99602 — it is the load-bearing half.
    recruiting_lens: [
      t(RCL_RAS, 'FEAT-06: the lifecycle save() has EXACTLY ONE MeritRefundable throw and it is the pre-save insert failure'),
      t(RCL_RAS, 'FEAT-06: no post-save usage-write FAILURE branch throws MeritRefundable (a delivered analysis is never refunded)'),
      t(RCL_RAS, 'FEAT-06 [F1]: the migrated lifecycle save() never calls persistRecruitingLensResult (the legacy durable-write helper)'),
      t(RCL_RAS, 'FEAT-06 [F1-fix]: no post-save refundable throw survives in the legacy persist helper (SEC-13 Fix 2)'),
      t(RCL_RAS, 'FEAT-06: NO refundMeritsForJob / MeritRefundable is reachable after the saving -> completed CAS (Pitfall 2)'),
      t(RCL_IDEM, 'FEAT-06 (3c): NO refund is reachable after the point of no return (Pitfall 2)'),
    ],
    career_compass: [
      t(CAR_RAS, 'CR-02: no post-save usage-write FAILURE branch throws MeritRefundable (delivered+emailed analysis is not refunded)'),
      t(PROC_CAR, 'SC#5(b): response-path failed branch calls refundMeritsForJob with txId'),
      t(CAR_IDEM, 'FEAT-05 (3c): NO refund is reachable after the point of no return (Pitfall 2)'),
    ],
  },

  // CLOSED by 09-06. There was no `browser.newContext()` anywhere in e2e/ before it.
  // Each cell = (the real cross-context proof, run end-to-end on the resume flow with two
  // live browser contexts) AND (that feature's own "one deliberate submit mints exactly one
  // charged run" wiring — a second tab is just a second concurrent submit surface, so that
  // wiring is what makes the invariant hold per feature). The spec's `test.skip`-ped
  // recovery half is NOT mapped anywhere — see the TWO_TAB_BLOCKING comment above.
  'S-20 two simultaneous browser tabs': {
    resume: [TWO_TAB_BLOCKING, ...HOOK_DUP, DUP_GUARD.resume],
    onboarding: [TWO_TAB_BLOCKING, ONBOARDING_DISPATCH, ...HOOK_DUP, DUP_GUARD.onboarding],
    linkedin: [TWO_TAB_BLOCKING, ...HOOK_DUP, DUP_GUARD.linkedin],
    recruiting_lens: [TWO_TAB_BLOCKING, ...HOOK_DUP, DUP_GUARD.recruiting_lens],
    career_compass: [TWO_TAB_BLOCKING, ...HOOK_DUP, DUP_GUARD.career_compass],
  },

  'S-21 previous-result preservation': {
    resume: [...HOOK_PRESERVE, PRESERVE_WIRING.resume],
    onboarding: [ONBOARDING_DISPATCH, ...HOOK_PRESERVE, PRESERVE_WIRING.onboarding],
    linkedin: [...HOOK_PRESERVE, PRESERVE_WIRING.linkedin],
    recruiting_lens: [...HOOK_PRESERVE, PRESERVE_WIRING.recruiting_lens],
    career_compass: [...HOOK_PRESERVE, PRESERVE_WIRING.career_compass],
  },

  // THE DEAD LANE IS ALIVE (09-07). These __tests__/history-persistence.test.ts files ran in
  // NO lane: remote-gated AND absent from deno.json. 09-07 built the fail-loud remote lane
  // (_tests/remote-preflight.test.ts THROWS unless DENO_TEST_SUPABASE_REMOTE=1, so the lane
  // can never silently degrade to a vacuous green) and 09-08 registered them as `test:remote`
  // — assertion 5 below proves that registration, which is the check whose absence let these
  // five files rot in the first place. Verified 8 passed / 0 ignored against preview.
  //
  // Each cell ALSO carries the OFFLINE static wiring guard (history-wiring.test.ts, in
  // test:ci): 09-07 found the bare copies were NOT duplicates but 13 live wiring assertions,
  // and renamed rather than deleted them. So every S-22 cell runs in the blocking lane too,
  // not only in the remote lane.
  'S-22 History correctness': {
    resume: [
      t(HIST_RES, 'TEST-05 resume: successful staging run writes resumes, analysis_results, and linked usage'),
      t(HIST_RES, 'TEST-05 resume negative: validation failure leaves no usage_tracking row'),
      t(WIRE_RES, 'resume history: persists resume_analysis rows with resume source reference'),
      t(WIRE_RES, 'resume history: every resumes update goes through completeAndRecordSuccess'),
    ],
    onboarding: [
      ONBOARDING_DISPATCH,
      t(HIST_RES, 'TEST-05 resume: successful staging run writes resumes, analysis_results, and linked usage'),
      t(WIRE_RES, 'resume history: every resumes update goes through completeAndRecordSuccess'),
    ],
    linkedin: [
      t(HIST_LIN, 'TEST-05 LinkedIn: successful staging run writes linkedin_grades and linked usage'),
      t(WIRE_LIN, 'linkedin history: storeAndNotify returns the linkedin_grades id'),
      t(WIRE_LIN, 'linkedin history: usage writes include p_analysis_id via helper'),
    ],
    recruiting_lens: [
      t(HIST_RCL, 'TEST-05 Recruiting Lens: successful staging run writes analysis_results and linked usage'),
      t(WIRE_RCL, 'recruiting lens history: linked usage uses inserted analysis_results id'),
      t(WIRE_RCL, 'recruiting lens history: synchronous response returns merged output + analysisId (+ run_id under lifecycle)'),
    ],
    career_compass: [
      t(HIST_CAR, 'TEST-05 career: successful staging run writes analysis_results and linked usage'),
      t(WIRE_CAR, 'career history: durable result is written before linked usage'),
      t(WIRE_CAR, 'career history: merit paths call shared persistence helper'),
    ],
  },

  'S-23 approved/rejected cross-origin': {
    resume: [t(RES_CORS, "FEAT-02: analyze-resume/index.ts routes through withCors(req, 'user', …)")],
    onboarding: [
      ONBOARDING_DISPATCH,
      t(RES_CORS, 'FEAT-02: analyze-resume advertises the x-internal-job-secret extra header (internal-worker path)'),
    ],
    // CLOSED by 09-05: grade-linkedin now has its own behavioral per-feature status x origin
    // matrix (37 tests). The Pitfall-7 case (a bare 401 THROWN by auth, before the handler
    // body, must still carry ACAO) is the load-bearing one — that is the www.strivoai.net
    // outage class. Its title is a TEMPLATE LITERAL on disk, so `param` pins the approved
    // origin whose row must exist.
    linkedin: [
      t(LIN_CORS, "FEAT-04: grade-linkedin/index.ts routes through withCors(req, 'user', …)"),
      tp(
        LIN_CORS,
        'FEAT-04 [${origin}] a 401 THROWN by auth still carries ACAO + Vary (Pitfall 7)',
        'https://www.strivoai.net',
      ),
      tp(
        LIN_CORS,
        'FEAT-04 [evil] a jsonError to an evil origin is fail-closed (no ACAO)',
        'const EVIL',
      ),
    ],
    // NOTE: this name is escaped in the SOURCE (`withCors(req, \'user\', …)` inside a
    // single-quoted Deno.test), so the verbatim bytes on disk include the backslashes.
    recruiting_lens: [t(RCL_CORS, "FEAT-06: recruiting-lens/index.ts routes through withCors(req, \\'user\\', …)")],
    career_compass: [t(CAR_CORS, "FEAT-05: analyze-career/index.ts routes through withCors(req, 'user', …)")],
  },
};

const fromRoot = (rel: string): string => join(process.cwd(), rel);

describe('VER-02 scenario x feature coverage registry (D-12)', () => {
  it('the matrix is exactly 25 scenarios x 5 features (D-10 scope guard)', () => {
    expect(SCENARIOS.length).toBe(25);
    expect(FEATURES.length).toBe(5);
    expect([...FEATURES]).toEqual([
      'resume',
      'onboarding',
      'linkedin',
      'recruiting_lens',
      'career_compass',
    ]);
    // A scenario present in the registry but absent from SCENARIOS would be unreachable.
    expect(Object.keys(REGISTRY).sort()).toEqual([...SCENARIOS].sort());
  });

  // Assertion 1 — T-09-01-B: a cell quietly omitted from the registry must not read as
  // "covered" by absence.
  it('every scenario x feature cell is present (no silent omission)', () => {
    const missing: string[] = [];
    for (const scenario of SCENARIOS) {
      for (const feature of FEATURES) {
        const cells = REGISTRY[scenario]?.[feature];
        if (!cells || cells.length === 0) missing.push(`${scenario} x ${feature}`);
      }
    }
    expect(missing, `cells missing from the registry:\n  ${missing.join('\n  ')}`).toEqual([]);
    // 125 cells, counted.
    const total = SCENARIOS.length * FEATURES.length;
    expect(total).toBe(125);
  });

  // Assertion 2.
  it('every mapped test file EXISTS on disk', () => {
    const missing = new Set<string>();
    for (const byFeature of Object.values(REGISTRY)) {
      for (const cells of Object.values(byFeature)) {
        for (const cell of cells) {
          if (cell.kind !== 'test') continue;
          if (!existsSync(fromRoot(cell.file))) missing.add(cell.file);
        }
      }
    }
    expect(
      [...missing],
      `mapped test files that do not exist:\n  ${[...missing].join('\n  ')}`,
    ).toEqual([]);
  });

  // Assertion 3 — T-09-01-A, THE anti-drift assertion. existsSync alone would let a rename
  // silently un-cover a cell and produce a milestone report claiming coverage it does not
  // have. Asserting the verbatim test-NAME substring against the file source is what makes
  // "a renamed test turns its cell RED" literally true.
  it('every mapped test NAME appears verbatim in its file (anti-drift)', () => {
    const offenders: string[] = [];
    const sourceCache = new Map<string, string>();
    for (const [scenario, byFeature] of Object.entries(REGISTRY)) {
      for (const [feature, cells] of Object.entries(byFeature)) {
        for (const cell of cells) {
          if (cell.kind !== 'test') continue;
          const abs = fromRoot(cell.file);
          if (!existsSync(abs)) continue; // assertion 2 owns this failure
          let src = sourceCache.get(abs);
          if (src === undefined) {
            src = readFileSync(abs, 'utf8');
            sourceCache.set(abs, src);
          }
          if (!src.includes(cell.name)) {
            offenders.push(`${scenario} x ${feature}: "${cell.name}" not found in ${cell.file}`);
          }
          // A parameterized cell must ALSO pin its parameter literal, or deleting a feature
          // from the suite's FEATURES table would leave all five cells green.
          if (cell.param !== undefined && !src.includes(cell.param)) {
            offenders.push(
              `${scenario} x ${feature}: parameter "${cell.param}" not found in ${cell.file} ` +
                `(the parameterized suite no longer covers this feature)`,
            );
          }
        }
      }
    }
    expect(
      offenders,
      `mapped test names that no longer exist (a rename un-covered a cell):\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  // Assertion 4 — D-11: "there are no silent gaps."
  // EXPECTED RED after plan 09-01: the gap cells ARE the machine-generated work order for
  // plans 09-05 / 09-06 / 09-07. Returns GREEN in plan 09-08.
  // DO NOT weaken this assertion to make the gate green.
  it('every waiver carries a non-empty reason + approver, and zero cells remain unclosed gaps (D-11 - no silent gaps)', () => {
    const badWaivers: string[] = [];
    const gaps: string[] = [];

    for (const [scenario, byFeature] of Object.entries(REGISTRY)) {
      for (const [feature, cells] of Object.entries(byFeature)) {
        for (const cell of cells) {
          if (cell.kind === 'waiver') {
            if (!cell.reason?.trim() || !cell.approvedBy?.trim()) {
              badWaivers.push(`${scenario} x ${feature}: waiver missing reason and/or approver`);
            }
          } else if (cell.kind === 'gap') {
            gaps.push(`${scenario} x ${feature} (owner: ${cell.owner})`);
          }
        }
      }
    }

    expect(
      badWaivers,
      `waivers without a reason + approver (D-11 forbids an unjustified accept):\n  ${badWaivers.join('\n  ')}`,
    ).toEqual([]);

    expect(
      gaps,
      `${gaps.length} unclosed gap cells remain (D-11: no silent gaps). Each must become a test or a justified waiver:\n  - ${gaps.join('\n  - ')}`,
    ).toEqual([]);
  });

  // Assertion 5 — T-09-08-C. THE LOOP-CLOSER, and the reason the five history-persistence
  // files could rot for months while every dashboard read green.
  //
  // `supabase/functions/deno.json` is an EXPLICIT file allowlist, not a directory walk: a
  // Deno test that is not named in `test:ci` or `test:remote` executes in NO LANE AT ALL.
  // Assertions 2 and 3 prove a mapped test EXISTS and is NAMED correctly — neither proves it
  // ever RUNS. Without this assertion the registry could report 125/125 covered while the
  // covering tests were dead code. "A test that is not in the gate is not coverage."
  //
  // (src/**, e2e/** are auto-discovered by vitest / Playwright and have no allowlist to
  // register with, so they are structurally exempt — there is nothing to fall out of.)
  it('every mapped supabase/functions test is actually registered in a deno.json lane (test:ci or test:remote)', () => {
    const denoJsonRel = 'supabase/functions/deno.json';
    const denoJson = JSON.parse(readFileSync(fromRoot(denoJsonRel), 'utf8')) as {
      tasks?: Record<string, string>;
    };
    const ci = denoJson.tasks?.['test:ci'] ?? '';
    const remote = denoJson.tasks?.['test:remote'] ?? '';

    // T-09-08-D: the remote lane's fail-loud preflight must be the FIRST file, so a
    // misconfigured lane fails once, clearly, instead of N times with a cryptic message.
    const remoteFiles = remote.split(/\s+/).filter((tok) => tok.endsWith('.ts'));
    expect(remoteFiles[0], 'the remote lane must run _tests/remote-preflight.test.ts FIRST').toBe(
      '_tests/remote-preflight.test.ts',
    );

    // Exact token membership, not a loose substring match: a substring test would let
    // `foo/bar.test.ts` "match" inside `foo/bar.test.ts.bak` and re-open this hole.
    const registered = new Set<string>(
      `${ci} ${remote}`.split(/\s+/).filter((tok) => tok.endsWith('.test.ts') || tok.endsWith('_test.ts')),
    );

    const unregistered = new Set<string>();
    for (const byFeature of Object.values(REGISTRY)) {
      for (const cells of Object.values(byFeature)) {
        for (const cell of cells) {
          if (cell.kind !== 'test') continue;
          if (!cell.file.startsWith('supabase/functions/')) continue;
          const rel = cell.file.slice('supabase/functions/'.length);
          if (!registered.has(rel)) unregistered.add(rel);
        }
      }
    }

    expect(
      [...unregistered],
      `mapped Deno tests that run in NO lane (absent from ${denoJsonRel} test:ci AND test:remote).\n` +
        `The registry claims these cells are covered, but these files never execute:\n  ${[...unregistered].join('\n  ')}`,
    ).toEqual([]);
  });
});

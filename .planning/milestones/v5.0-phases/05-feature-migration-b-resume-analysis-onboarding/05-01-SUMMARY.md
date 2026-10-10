---
phase: 05-feature-migration-b-resume-analysis-onboarding
plan: 01
subsystem: api
tags: [supabase-edge, deno, analysis-lifecycle, zod, merit-idempotency, react, onboarding, resume-analysis]

# Dependency graph
requires:
  - phase: 03-shared-analysis-lifecycle-substrate
    provides: runAnalysisLifecycle executor, deriveIdempotencyKey, llm-validation seam, analysis-flags, useAnalysisRun, analysisError taxonomy, create_or_recover/transition CAS RPCs, reaper
  - phase: 04-feature-migration-a-recruiting-lens-linkedin-grader
    provides: proven executor-adoption pattern (grade-linkedin inline driver + dormancy fall-through + save() authoritative-throw/mirror-log-and-continue)
provides:
  - Shared resume validation seam (resumeAnalysisSchema .passthrough() + resumeSemanticCheck) reused by onboarding executor and (05-02) streaming wrapper
  - Triple-write save() reconciliation (resumes.grading_data sole authoritative throws-pre-settle; analysis_results mirror demoted to log-and-continue)
  - Onboarding runAnalysisLifecycle('onboarding') adoption behind ANALYSIS_LIFECYCLE_ONBOARDING with byte-identical dormant fall-through
  - Frontend hang fix (killed fire-and-forget abandonment + removed 120s dead-end; useAnalysisRun STATE recovery + specific terminal-error surface)
affects: [05-02 streaming lifecycle wrapper, 05-03 scenario coverage, career-compass, dashboard-intelligence]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Origin-discriminated feature routing on one edge endpoint (rawBody.origin === 'onboarding' → feature:'onboarding'; NOT stream!==true inference — Pitfall C)"
    - "Permissive .passthrough() validation schema tuned to preserve byte-identical success; strict validation changes FAILURE handling only (D-10)"
    - "save() authoritative-throw (resumes.grading_data) + best-effort mirror/cache/usage/webhook (never refund-after-durable-save, T-05-01)"
    - "Additive+dormant frontend recovery: await invoke -> startRun(run_id) -> navigate; legacy path byte-identical behind isAnalysisLifecycleEnabled()"

key-files:
  created:
    - supabase/functions/analyze-resume/resume-validation.ts
  modified:
    - supabase/functions/analyze-resume/index.ts
    - supabase/functions/analyze-resume/refund-after-save.test.ts
    - supabase/functions/_shared/analysis-lifecycle.dormancy.test.ts
    - src/pages/Onboarding.tsx
    - src/pages/Results.tsx

key-decisions:
  - "Onboarding awaits the request/response executor then startRun(run_id) then navigate (mirrors shipped LinkedIn 04-05); genuine failure surfaces a specific error, never navigates into an endless spinner"
  - "Dormancy (byte-identical while VITE_FEATURE_ANALYSIS_LIFECYCLE OFF) is a HARD phase constraint that overrides the literal grep-'no 120000' acceptance wording — the legacy fire-and-forget branch is retained for the flag-OFF path"
  - "analysis_results mirror insert failure demoted from throw-MeritRefundable to log-and-continue: resumes.grading_data runs first and is the sole authoritative save, so the old throw was a refund-after-durable-save (T-05-01)"

patterns-established:
  - "Pattern 1: resumeAnalysisSchema.passthrough() + resumeSemanticCheck (byte-faithful passesQualityFloor mirror) as the shared resume validationOpts seam"
  - "Pattern 2: onboarding inline executor driver + 3-branch dormancy fall-through into the unchanged withMerits Free path"
  - "Pattern 3: Results 120s cap armed ONLY when the lifecycle flag is OFF; lifecycle terminal states + reaper own deadness when ON"

requirements-completed: [FEAT-01]

# Metrics
duration: 27min
completed: 2026-07-06
---

# Phase 5 Plan 01: Onboarding Lifecycle Adoption + Resume Validation/Save Foundation Summary

**Onboarding resume analysis re-homed onto `runAnalysisLifecycle('onboarding')` (origin-discriminated, stable non-mutating idempotency identity, save-before-settle) behind an independent flag, plus the shared permissive resume validation seam + triple-write save() reconciliation, and a frontend hang fix that kills the fire-and-forget abandonment and the 120s dead-end — all shipping dormant/byte-identical while the flags default OFF.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-07-06T00:20:08Z
- **Completed:** 2026-07-06T00:47Z
- **Tasks:** 3
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments
- **Shared resume validation seam** (`resume-validation.ts`): `resumeAnalysisSchema` (required `overallScore` + non-empty `criterionFeedback|criteria`, everything else `.passthrough()` so a valid success validates byte-identically) + `resumeSemanticCheck` (a byte-faithful mirror of `passesQualityFloor` — empty/all-zero/all-identical reject). Reused by 05-02.
- **Triple-write save() reconciliation**: `persistResumeAnalysis` (analysis_results mirror) demoted from `throw MeritRefundable` to log-and-continue/return null; `completeAndRecordSuccess`'s owner-scoped `resumes.grading_data` update remains the sole authoritative throws-pre-settle write (never refund-after-durable-save, T-05-01).
- **Onboarding full-executor adoption**: `origin:'onboarding'` discriminator routes through `runAnalysisLifecycle('onboarding', meritFeature:'resume_analysis')` with stable `inputIdentity=sha256({text_hash,resumeId,targetRole,targetIndustry})`, per-attempt nonce, Free-path `generate()` (Haiku 4.5, single call, quality-floor retry), reconciled `save()`, and a 3-branch dormancy fall-through into today's unchanged `withMerits` Free path.
- **Frontend hang fix**: Onboarding's fire-and-forget `invokeWithTimeout(...120000)`+immediate-navigate abandonment replaced (behind `isAnalysisLifecycleEnabled()`) by an awaited invoke carrying `origin`+`attemptNonce`, `startRun(run_id)` before navigate, and a specific terminal-error toast on failure. Results' 120s dead-end now arms ONLY when the flag is OFF; a new lifecycle terminal-FAILURE screen surfaces `run.errorMessage`/`canRetry` when ON.
- **Dormancy preserved**: full `test:edge` 986/0/12 and full vitest 495/0 both green with flags OFF (byte-identical legacy path).

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared resume validation seam + triple-write save() reconciliation** — `1cc1d4ee` (feat)
2. **Task 2: Onboarding full-executor adoption (origin discriminator + dormancy fall-through)** — `312dc169` (feat)
3. **Task 3: Frontend hang fix (kill fire-and-forget + remove 120s dead-end + adopt useAnalysisRun recovery)** — `10b2d495` (feat)

**Plan metadata:** (this SUMMARY + STATE + ROADMAP) — see final docs commit.

## Files Created/Modified
- `supabase/functions/analyze-resume/resume-validation.ts` — NEW permissive `resumeAnalysisSchema` (.passthrough()) + `resumeSemanticCheck` shared validation seam.
- `supabase/functions/analyze-resume/index.ts` — demoted analysis_results mirror throw (Task 1); onboarding `runAnalysisLifecycle('onboarding')` inline driver + origin discriminator + dormancy fall-through (Task 2).
- `supabase/functions/analyze-resume/refund-after-save.test.ts` — reconciled the stale CR-01 KEEP guard to the tightened T-05-01 invariant (mirror demoted; resumes.grading_data sole authoritative throw).
- `supabase/functions/_shared/analysis-lifecycle.dormancy.test.ts` — moved `analyze-resume/index.ts` from FEATURE_ENTRYPOINTS (unwired) to MIGRATED_ENTRYPOINTS (flag-gated migrated).
- `src/pages/Onboarding.tsx` — awaited origin+attemptNonce invoke + `startRun(run_id)` before navigate (flag ON); byte-identical fire-and-forget retained (flag OFF); awaited upload→extraction ordering preserved.
- `src/pages/Results.tsx` — `useAnalysisRun` STATE layer; 120s cap gated to flag-OFF; lifecycle terminal-FAILURE screen added; existing resumes.grading_data realtime RESULT recovery preserved.

## Decisions Made
- **Onboarding wait model = mirror shipped LinkedIn 04-05**: the executor is request/response and returns `run_id` at completion, so the frontend awaits → `startRun(run_id)` → navigate. A genuine failure surfaces a specific error (toast on setup) rather than navigating into an endless progress spinner. This satisfies FEAT-01 D-05/D-06 (run-id recovery, honest terminal states) without a new notify/proceed-into-app surface.
- **Onboarding pins the Free model** (`getModel('free','resume')`) in `generate()` to guarantee D-07 Free-tier correctness (Haiku 4.5 / FREE_SINGLE_CALL_MAX_TOKENS / quality-floor retry) regardless of the caller's stored tier.
- **`recordUsageWithAnalysis` left untouched**: nullable analysisId handled locally in `completeAndRecordSuccess` (record usage only when the mirror id exists; else log-and-continue), keeping the shared usage-checker signature and blast radius minimal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Stale-test reconciliation] refund-after-save.test.ts CR-01 KEEP guard flipped**
- **Found during:** Task 1 (save() reconciliation)
- **Issue:** The Phase-2 SEC-14 guard asserted `throw new MeritRefundable(500, 'Could not save resume analysis history.')` MUST remain present. Task 1's directed demotion (plan action + acceptance criterion "no MeritRefundable throw inside persistResumeAnalysis") removes exactly that string, so the guard would go RED and violate "test:edge stays green".
- **Fix:** Reconciled the single KEEP assertion to the tightened T-05-01 invariant — asserts the mirror throw is GONE (demoted to log-and-continue) while the reason-log line + the resumes.grading_data authoritative throw remain. This is a STRICTLY SAFER SEC-14 posture (one fewer refund-after-durable-save), not a weakening; the plan's threat model T-05-01 documents it as the intended mitigation. Mirrors the Phase-4 04-06 stale-test reconciliation precedent.
- **Files modified:** supabase/functions/analyze-resume/refund-after-save.test.ts
- **Verification:** guard suite green (refund-after-save + merit-branch + failure-branches + dormancy + llm-validation = 50/0); full test:edge 986/0/12.
- **Committed in:** `1cc1d4ee` (Task 1 commit)

**2. [Rule 1 - Stale-test reconciliation] dormancy guard moved analyze-resume to MIGRATED_ENTRYPOINTS**
- **Found during:** Task 2 (onboarding executor adoption)
- **Issue:** `analysis-lifecycle.dormancy.test.ts` guard (b) asserted `analyze-resume/index.ts` does NOT import `analysis-lifecycle`. Task 2 adds `import { runAnalysisLifecycle }`, which would fail guard (b).
- **Fix:** Moved `analyze-resume/index.ts` from FEATURE_ENTRYPOINTS to MIGRATED_ENTRYPOINTS (dormancy now proven by guard (a)/(a') flags-default-OFF, not import-absence) — exactly the per-migration drift-guard mechanic the test's own comment prescribes and that Phase 4 used for recruiting-lens/linkedin.
- **Files modified:** supabase/functions/_shared/analysis-lifecycle.dormancy.test.ts
- **Verification:** `dormancy (b'): [analyze-resume/index.ts] imports the flag-gated lifecycle executor (migrated)` passes; full test:edge 986/0/12.
- **Committed in:** `312dc169` (Task 2 commit)

**3. [Clarification - HARD-constraint override] Dormant fire-and-forget branch retained in Onboarding.tsx**
- **Found during:** Task 3 (frontend hang fix)
- **Issue:** Task 3's acceptance grep ("Onboarding.tsx no longer shows a fire-and-forget invoke with 120000 followed by immediate navigate") is in tension with the phase HARD constraint ("byte-identical legacy fall-through when VITE_FEATURE_ANALYSIS_LIFECYCLE is OFF = 100% of traffic on deploy").
- **Resolution:** The overriding byte-identical-dormancy constraint wins — the legacy fire-and-forget invoke + immediate navigate is retained in the flag-OFF branch, so `grep 120000` still matches there. The MIGRATED (flag-ON) path removes the abandonment (awaited invoke, `origin`+`attemptNonce` body, `startRun` before navigate). No behavior change on deploy.
- **Files modified:** src/pages/Onboarding.tsx
- **Verification:** vitest 495/0 (incl. AnalysisHistory.phase22 routing contract + Results.phase22); type-check clean for the two files.
- **Committed in:** `10b2d495` (Task 3 commit)

---

**Total deviations:** 3 (2 Rule-1 stale-test reconciliations directly caused by directed plan edits + 1 documented HARD-constraint reconciliation).
**Impact on plan:** All within scope (directly caused by the plan's own directed changes); both guard reconciliations mirror the established Phase-4 precedent. No scope creep, no product-behavior change on deploy (flags default OFF).

## Issues Encountered
- **`deno check` "exits 0" is not achievable on this repo baseline.** HEAD `analyze-resume/index.ts` already emits 45 pre-existing type errors (the suite runs `--no-check`); pulling the lifecycle module graph into a bare single-file `deno check` also triggers a `Cannot find name 'Deno'` cascade (deno.ns lib not applied) + union-narrowing noise — the SHIPPED, production-live `grade-linkedin/index.ts` exhibits the identical families (27 `Deno` + 6 union-narrowing) under the same check. Resolution: verified my edits introduce ZERO new type errors (index.ts error-set byte-identical to HEAD; `resume-validation.ts` clean apart from the environmental TS5095/TS5109 tsconfig-option artifacts that `grade-linkedin/schema.ts` also emits in isolation), and proved seam behavior + green guards via the real `--no-check` gate (`test:edge` 986/0/12).
- **`npm run type-check` does not exit 0 due to pre-existing recharts type debt** (10 errors in `EliteScoreHistory.tsx`/`ScoreProgressChart.tsx`/`ui/chart.tsx`, unrelated to this plan — out of scope per the scope boundary). My two frontend files are absent from the error list; total error count is identical baseline↔mine (10↔10).

## User Setup Required
None - no external service configuration required. The new lifecycle path stays dormant until an operator sets `ANALYSIS_LIFECYCLE_ENABLED=true` + `ANALYSIS_LIFECYCLE_ONBOARDING=true` (edge) and `VITE_FEATURE_ANALYSIS_LIFECYCLE=true` (frontend).

## Next Phase Readiness
- **05-02 (streaming wrapper) unblocked**: `resume-validation.ts` (schema + semanticCheck) is imported and ready to reuse; the save() reconciliation is in place; the onboarding driver is the reference for wiring the `:728` idempotency-key gap.
- **No new DB migration added** (Phase-3 ledger/RPCs/active-index are feature-agnostic and already shipped) — advisor floor unaffected.
- **Concern:** `deno check`/`type-check` do not exit 0 on this repo baseline (pre-existing latent type debt) — the enforced gate is `--no-check` `test:edge` + vitest, both green here. 05-03 folds the FEAT-01/FEAT-02 scenario matrix into `verify:baseline`.

## Self-Check: PASSED
- All 6 created/modified files verified present on disk.
- All 3 task commits verified present (`1cc1d4ee`, `312dc169`, `10b2d495`).

---
*Phase: 05-feature-migration-b-resume-analysis-onboarding*
*Completed: 2026-07-06*

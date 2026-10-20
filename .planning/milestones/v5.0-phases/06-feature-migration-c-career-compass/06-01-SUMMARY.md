---
phase: 06-feature-migration-c-career-compass
plan: 01
subsystem: api
tags: [deno, supabase-edge, career-compass, analysis-lifecycle, idempotency, zod, merit-safety, dormant-flag]

# Dependency graph
requires:
  - phase: 03-shared-analysis-lifecycle-substrate
    provides: runAnalysisLifecycle executor, deriveIdempotencyKey, validateModelOutput, analysis-flags (two-level dormancy), create_or_recover/transition RPCs
  - phase: 05-feature-migration-b-resume-onboarding
    provides: resume-validation.ts twin (permissive .passthrough() + semanticCheck), the request/response executor adoption reference (analyze-resume onboarding), idempotency-gap-closure pattern
provides:
  - Resolved RESEARCH Open Question 1 — the LIVE internal-worker career path is the LEGACY branch (analyze-career:1323+) at resolvedTier='free' (static call-graph, operator-approved)
  - _shared/career-validation.ts seam (careerCompassSchema + careerSemanticCheck), reused by 06-02/06-03 guards
  - runAnalysisLifecycle('career_compass') attached around the confirmed live legacy branch, DORMANT behind ANALYSIS_LIFECYCLE_CAREER_COMPASS with byte-identical fall-through
  - Closed D-03 idempotency-key gap on the direct-path career withMerits ctx (:1000)
affects: [06-02 queue plumbing (submit create_or_recover + worker attemptNonce/tier forwarding), 06-03 frontend recovery + runtime-validation-convergence guard, 07 dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Confirm-live-path-before-attach: a read-only static/live finding pins the executor attachment site (which branch + tier) before any executor code lands"
    - "Hoist-core-closure dormancy: the live analysis body is hoisted VERBATIM into one closure returning Response | {result}, driving BOTH the executor (flag ON) and the byte-identical dormant tail (flag OFF) with zero duplication"

key-files:
  created:
    - supabase/functions/_shared/career-validation.ts
    - supabase/functions/_shared/career-validation.test.ts
    - .planning/phases/06-feature-migration-c-career-compass/06-01-LIVE-PATH-FINDING.md
  modified:
    - supabase/functions/analyze-career/index.ts
    - supabase/functions/_shared/analysis-lifecycle.dormancy.test.ts
    - supabase/functions/deno.json
    - .planning/audit/RESIDUAL-REGISTER.md

key-decisions:
  - "Open Q1 RESOLVED (static, HIGH confidence, operator-approved): the internal-worker queue path runs the LEGACY branch at free tier (requireInternalAuth->null userContext -> merit-branch :854 skipped -> body.tier never destructured); executor attaches around the legacy branch, not the merit-branch"
  - "careerSemanticCheck tuned to the universal-safe core subset (careerFields + careerDNA + roleReadinessBreakdown); roadmap/roleRoadmaps NOT required (free-policy deletes them) and surpriseFits/roles kept lenient (free-slice edge cases) so no currently-valid Free/Pro/Elite output is ever rejected"
  - "Internal-worker tier-resolution-to-free is a SEPARATE out-of-scope finding logged to RESIDUAL-REGISTER (R-06-01), NOT fixed here (would violate byte-identical dormancy + FEAT-05 free-tier focus)"

patterns-established:
  - "Hoist-core-closure: single analysis body serves executor + dormant fall-through, guaranteeing byte-identical output on the flag-OFF path"
  - "Early-return Responses inside the hoisted core stay verbatim; the executor's generate() converts them to plain status-bearing Errors (classifyFailure reads .status) for safe pre-saving refund"

requirements-completed: [FEAT-05]

# Metrics
duration: 18min
completed: 2026-07-07
---

# Phase 6 Plan 01: Career Compass Lifecycle Adoption (confirmed live branch) Summary

**Resolved the live analyze-career path (legacy branch, free tier) and attached runAnalysisLifecycle('career_compass') around it behind ANALYSIS_LIFECYCLE_CAREER_COMPASS — with a new permissive careerCompassSchema/careerSemanticCheck seam, a closed direct-path idempotency-key gap, and byte-identical dormant fall-through.**

## Performance

- **Duration:** 18 min (executor working time; excludes operator checkpoint wait)
- **Started:** 2026-07-07T03:05:56Z
- **Completed:** 2026-07-07T03:23:43Z
- **Tasks:** 3 (1 operator-gated decision + 2 auto)
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments
- **Task 1 (operator checkpoint):** Resolved RESEARCH Open Question 1. Confirmed via static call-graph (HIGH confidence, operator-approved) that the LIVE internal-worker queue path executes the LEGACY branch (`analyze-career:1323+`) at `resolvedTier='free'` — `x-internal-job-secret` → `requireInternalAuth` returns `null` → `userContext` null → merit-branch `:854` skipped and `body.tier` never destructured. Recorded the Task-3 attachment decision + byte-preserve baseline (`analysisResult`).
- **Task 2:** New `_shared/career-validation.ts` — permissive `.passthrough()` `careerCompassSchema` (core-required: non-empty `careerDNA` + `careerFields`; `compensationIntelligence` optional) + `careerSemanticCheck` tuned byte-identical. 7-test unit proof; registered in `deno.json test:ci`.
- **Task 3:** Attached `runAnalysisLifecycle('career_compass')` around the confirmed legacy branch via a hoisted-core closure; closed the D-03 idempotency-key gap on the direct-path `withMerits` ctx (:1000); reconciled the save (analysis_results = sole authoritative throws-pre-settle); dormancy guard moved analyze-career to MIGRATED_ENTRYPOINTS. `test:edge` 1063/0/12 green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Resolve Open Q1 (live-path finding)** - `8961141d` (docs)
2. **Task 2: career-validation seam** - `ae1f76bc` (feat)
3. **Task 3: runAnalysisLifecycle attachment + idempotency-gap closure** - `b9d343d0` (feat)

**Plan metadata:** (final docs commit — this SUMMARY + STATE + RESIDUAL-REGISTER)

## Files Created/Modified
- `supabase/functions/_shared/career-validation.ts` - Permissive careerCompassSchema + careerSemanticCheck seam (byte-identical-tuned; compensationIntelligence optional)
- `supabase/functions/_shared/career-validation.test.ts` - 7-test unit proof (golden Free/Elite pass, Elite-sans-comp passes, empty-careerDNA/careerFields fail, byte-preserve passthrough)
- `supabase/functions/analyze-career/index.ts` - Hoisted core closure + runAnalysisLifecycle('career_compass') executor gate at the legacy branch + dormant fall-through + direct-path idempotencyKey
- `supabase/functions/_shared/analysis-lifecycle.dormancy.test.ts` - analyze-career moved to MIGRATED_ENTRYPOINTS (flag-gated); job workers stay dormant
- `supabase/functions/deno.json` - Registered career-validation.test.ts in test:ci
- `.planning/phases/06-feature-migration-c-career-compass/06-01-LIVE-PATH-FINDING.md` - Open Q1 resolution + attachment decision
- `.planning/audit/RESIDUAL-REGISTER.md` - R-06-01 internal-worker tier-resolution-to-free (deferred)

## Decisions Made
- **Attachment site = legacy branch (H2 confirmed).** The executor wraps the free-tier legacy branch, not the merit-branch. Multi-role compare stays verbatim (D-06, not routed through the executor).
- **careerSemanticCheck universal-safe subset.** Requires only the core that survives the free output policy (`careerFields`, `careerDNA`, `roleReadinessBreakdown`); `roadmap`/`roleRoadmaps` are NOT required (free-policy deletes them) and `surpriseFits`/`roles`/`skillGaps` are not asserted (`skillGaps` is Pro-only; free-slice can be short) — guaranteeing no currently-valid output is rejected while still catching a truncated/empty core.
- **inputIdentity via buildCareerCacheKey.** Reuses the existing stable cache-key inputs (content/prior hashes + tier + variant + allowResumeOnly/compareRoles) with a `:legacy-main` variant — never a save-mutated field (Pitfall 8).
- **Save reconciliation was already correct on the legacy path.** `persistCareerResultAndRecordUsage` already has `analysis_results.insert` as the sole MeritRefundable throw with usage/email log-and-continue (CR-02), and the legacy path does NO profiles-update / analysis_cache upsert — so the save() reconciliation required no demotion edits, only routing through the executor's save().

## Deviations from Plan

The plan's Task-3 acceptance criteria described the save reconciliation as demoting a "profiles update (:349) + analysis_cache upsert" to log-and-continue. On inspection, the **legacy path** (the confirmed live path) already satisfies this: `persistCareerResultAndRecordUsage` performs a profiles `.select` (not update) for the fire-and-forget email, does no `analysis_cache` upsert (that lives only in the merit-branch), and already treats usage/email as log-and-continue with `analysis_results.insert` as the sole authoritative throw. No demotion edit was needed — routing through the executor's `save()` was sufficient. This is a faithful adaptation to the confirmed live branch, not a scope change.

**Total deviations:** 0 auto-fixed (no Rule 1-4 fixes required).
**Impact on plan:** None — plan executed as written against the confirmed live branch.

## Issues Encountered
- **`deno check` reports a tsconfig error (`TS5095`/`TS5109`) unrelated to this plan.** The pre-existing analog `analyze-resume/resume-validation.ts` fails `deno check` identically — deno 2.7.1 picks up the root `tsconfig.json` (module `bundler`/`NodeNext` mismatch). This is an environment/tooling condition, NOT a code defect. The authoritative gate is `test:edge` (runs `--no-check`), which is green. Logged here rather than "fixed" (out of scope; would touch root tooling config).

## User Setup Required
None - no external service configuration required. The feature ships DORMANT; enabling requires flipping `ANALYSIS_LIFECYCLE_CAREER_COMPASS` (+ master `ANALYSIS_LIFECYCLE_ENABLED`) in Supabase edge secrets — deferred to the 06-02/06-03 wiring + soak.

## Next Phase Readiness
- **06-02 (queue plumbing):** submit-career-analysis-job must adopt `create_or_recover_analysis_run` with the SAME derived idempotency key + forward `attemptNonce` (and, if R-06-01 is later scheduled, a server-trusted tier) so the executor's `reserving_merits` replays `already_deducted` (exactly-one deduction). The worker (process-career-analysis-job) must forward `attemptNonce` in the payload. Both remain asserted dormant in the guard until then.
- **06-03:** the runtime-validation-convergence guard imports `careerCompassSchema`/`careerSemanticCheck` (now available); frontend refresh recovery via `run_id`/`recordId`.
- **Blocker/carry:** R-06-01 (internal-worker tier locked to free) is documented, not fixed — a separate decision owns it.
- **Baseline:** `test:edge` 1063/0/12 green (was 1056; +7 new career-validation tests). Flags default OFF → dormant → byte-identical legacy path.

---
*Phase: 06-feature-migration-c-career-compass*
*Completed: 2026-07-07*

## Self-Check: PASSED

- Created files present: career-validation.ts, career-validation.test.ts, 06-01-LIVE-PATH-FINDING.md, 06-01-SUMMARY.md
- Commits present: 8961141d (Task 1), ae1f76bc (Task 2), b9d343d0 (Task 3)
- grep: `runAnalysisLifecycle` ×4 in analyze-career/index.ts (feature/meritFeature 'career_compass'); `idempotencyKey` present in the direct-path career meritCtx
- test:edge 1063/0/12 green

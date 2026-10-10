---
phase: 04-feature-migration-a-recruiting-lens-linkedin-grader
plan: 04
subsystem: grade-linkedin edge function
tags: [FEAT-03, FEAT-04, lifecycle-migration, idempotency, save-before-settle]
requires:
  - runAnalysisLifecycle (03-04, _shared/analysis-lifecycle.ts)
  - linkedInGradeSchema / normalizeFromSections / LINKEDIN_SECTIONS (04-02, schema.ts)
  - linkedInSemanticCheck (04-02, validation.ts)
  - loadPromptVariant('linkedin') / buildUserMessage 2-arg (04-03, prompts.ts)
provides:
  - grade-linkedin on the shared analysis lifecycle (flag-gated ANALYSIS_LIFECYCLE_LINKEDIN)
  - stable non-mutating idempotency/cache identity (prior-grade id removed)
  - save-before-settle authoritative linkedin_grades write + post-saving best-effort steps
  - run_id + recordId response body for ?id= refresh re-hydration
affects:
  - 04-05 (frontend attemptNonce supply + ?id= / run_id hydration)
tech-stack:
  added: []
  patterns:
    - "lifecycle adapter first, dormancy fall-through to unchanged legacy merit path"
    - "math-from-sections rawScore injected in generate() (model never emits the total)"
    - "authoritative durable save() throws pre-settle; email/usage/mirror post-saving log-and-continue"
key-files:
  created: []
  modified:
    - supabase/functions/grade-linkedin/index.ts
    - supabase/functions/grade-linkedin/cache.test.ts
    - supabase/functions/_shared/analysis-lifecycle.dormancy.test.ts
decisions:
  - "Reused 04-02 linkedInSemanticCheck as validationOpts.semanticCheck (DRY vs inline equality)"
  - "rawScore injected in generate() (not via schema.transform) to keep the 04-02 schema artifact untouched"
  - "Reconciled the shared Phase-3 dormancy guard: migrated features (recruiting_lens, linkedin) are flag-gated, not import-absent"
metrics:
  duration_min: 10
  tasks: 1
  files: 3
  completed: 2026-07-02
---

# Phase 04 Plan 04: LinkedIn Grader Lifecycle Migration Summary

Re-homed the LinkedIn Grader handler onto `runAnalysisLifecycle('linkedin')` as an inline driver behind `ANALYSIS_LIFECYCLE_LINKEDIN`, closing the fixed-score CACHE source (removed the save-mutated prior-grade id from the identity), removing the prior-grade follow-up re-injection, and structurally enforcing save-before-settle with exactly-once charging — while preserving today's free-scan + `withMerits` merit path byte-for-byte as the dormant fall-through.

## What Changed

- **Lifecycle adapter (Task 1):** Inside the `MERIT_SYSTEM_ENABLED` branch, `runAnalysisLifecycle` runs first with `feature:'linkedin'`, `meritFeature:'linkedin_grading'`, `jobType:'linkedin_grading'`, `ctx:{userId,tier,corsType:'user'}`.
  - `inputIdentity` = `sha256({ profileContent_hash, profileUrl })` — a STABLE content identity. `prior_grade_id` is removed from both the lifecycle identity and the dormant-fallback cache key (Pitfall 8 / T-04-12).
  - `attemptNonce` from `body.attemptNonce` (04-05 supplies it), fail-closed to a fresh UUID.
  - `extract()` returns the already-capped/sanitized `{ profileContent, profileUrl }`.
  - `generate()` calls Haiku 4.5 (temp 0.3, per-tier caps), returns RAW model JSON with a server-computed **math-from-sections** `rawScore` injected (the model never emits the total); on `!ai.ok` it throws a plain status-bearing `Error` so `classifyFailure` owns the transient/permanent split (deliberately NOT `MeritRefundable` — keeps the refund-after-save guard's throw-count at exactly 5).
  - `schema: linkedInGradeSchema`, `validationOpts.semanticCheck: linkedInSemanticCheck` (rawScore === normalizeFromSections).
  - `save()` is the AUTHORITATIVE `linkedin_grades` insert and THROWS on failure (settle-before). The `analysis_results` mirror (null → LOG only), `triggerExtractWebhook`, `recordUsageWithAnalysis`, and the email fire-and-forget are all POST-saving best-effort log-and-continue.
  - Result mapping: `ok:true` → `{ ...value, run_id, recordId }`; `dormant:true` → fall through to the unchanged merit branch; `dormant:false` → structured error (gateway `response` when present).
- **Follow-up removal:** the `previousGrade` fetch + `followUpContext` were removed from both the merit branch and the legacy `MERIT_SYSTEM_ENABLED`-off branch; `runTieredAiCall` and the legacy branch now call the 2-arg `buildUserMessage`.
- **Cache variant** bumped to `linkedin-grader:v4.0:11-section` so stale v3 4-section cache can never collide.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reconciled the shared Phase-3 dormancy guard**
- **Found during:** Task 1 (post-edit `test:ci` run).
- **Issue:** `_shared/analysis-lifecycle.dormancy.test.ts` (in `test:ci`/`verify:baseline`) asserts "(b) no feature imports `_shared/analysis-lifecycle`". That assertion was ALREADY red for `recruiting-lens/index.ts` after 04-01's migration (a pre-existing baseline failure not reconciled by 04-01), and my `grade-linkedin` migration added a second failure. The "no import" proof is obsolete once features migrate onto the substrate behind runtime dormancy flags — the genuine dormancy guarantee is the flags-default-OFF proof in guards (a)/(a'), which still pass.
- **Fix:** Removed the two migrated entrypoints from the `(b)` list, added a `MIGRATED_ENTRYPOINTS` list with a positive `(b')` assertion that they DO import the flag-gated executor, and documented the per-phase shrink. The `recruiting-lens` entry was reconciled alongside `grade-linkedin` because leaving it would keep the gate red and be logically inconsistent (both are genuinely migrated).
- **Files modified:** `supabase/functions/_shared/analysis-lifecycle.dormancy.test.ts`
- **Commit:** eef5e7c7

**2. [Rule 1 - Bug] Reconciled off-gate `cache.test.ts` stable-identity assertion**
- **Found during:** Task 1.
- **Issue:** `grade-linkedin/cache.test.ts` (NOT in `test:ci`) asserted `source.includes("prior_grade_id")` — directly contradicting the mandated removal (must-have truth #2 / T-04-12).
- **Fix:** Rewrote its identity assertions to prove the new content-addressed stable identity (identical content → stable key; different content → miss) and asserted `prior_grade_id` is absent from the handler. Preserved the still-valid precheck_cache / cache-hit-metadata / write-ordering assertions for the dormant fallback.
- **Files modified:** `supabase/functions/grade-linkedin/cache.test.ts`
- **Commit:** eef5e7c7

### Not Touched (per plan)

- `grade-linkedin/history-persistence.test.ts` — PRE-EXISTING-BROKEN on main (stale `storeAndNotify` 2-field signature), NOT in `test:ci`, explicitly excluded as a gate by the plan. `storeAndNotify` was not modified, so its failure is unchanged (not a regression I introduced).

## Verification

- Plan gate: `deno test grade-linkedin/handler-config.test.ts grade-linkedin/refund-after-save.test.ts` → 20/20 passed.
- Full offline baseline: `DENO_TEST_SUPABASE_REMOTE=0 deno task test:ci` → **943 passed, 0 failed, 12 ignored** (green).
- Greps: `runAnalysisLifecycle` present (2); `prior_grade_id` 0; `followUpContext` 0; `save()` authoritative `throw new Error('Could not save LinkedIn grade history.')` at index.ts:531.
- No schema migration added (`grading_data` jsonb accommodates 11 sections; `overall_score` int unchanged).

## Self-Check: PASSED

- FOUND: supabase/functions/grade-linkedin/index.ts (modified)
- FOUND: supabase/functions/grade-linkedin/cache.test.ts (modified)
- FOUND: supabase/functions/_shared/analysis-lifecycle.dormancy.test.ts (modified)
- FOUND: commit eef5e7c7
- FOUND: .planning/phases/04-feature-migration-a-recruiting-lens-linkedin-grader/04-04-SUMMARY.md

# Phase 36 Research: History Persistence Parity Audit + Repair

**Generated:** 2026-05-22
**Status:** Ready for planning

## RESEARCH COMPLETE

\<current\_state>

### HIST-02: Resume Analysis canonical history row

`supabase/functions/analyze-resume/index.ts` still treats `resumes.grading_data` as the durable result target. Phase 36 must add an `analysis_results` row for each successful resume analysis without changing the existing `/results/:resumeId` page contract. The safest shape is a local helper that persists a `resume_analysis` row, returns `analysis_results.id`, and stores `resumes.id` in `source_reference` so `AnalysisHistory` can still route resume rows to `/results/<resume_id>`.

### HIST-03: Recruiting Lens Pro persistence

`supabase/functions/recruiting-lens/index.ts` has an `analysis_results` insert behind Elite-only logic in the synchronous path. Pro users can get a successful analysis with no durable history row. Phase 36 should remove that tier gate for successful Pro and Elite runs, keep Free unreachable, and preserve the existing `raw_response.metadata` shape.

### HIST-04: Interview Prep `?id=` hydration

`src/pages/InterviewPrep.tsx` has no `useSearchParams` hydration path. The page can render fresh flashcard and quiz results from `InterviewPrepResponse`, but cannot load a past `interview_quizzes` row or `interview_quiz_answers`. Phase 36 should add read-only hydration behind the existing `isInterviewPrepEnabled()` production gate. Production keeps Interview Prep rows hidden in `AnalysisHistory`; staging can verify end-to-end.

### HIST-05: AnalysisHistory direct route resolution

`src/pages/AnalysisHistory.tsx` currently selects `usage_tracking.*`, but `UsageTrackingRow` does not expose `analysis_id`. Route resolution uses only the plus/minus five minute proximity matcher. Phase 36 should select and type `analysis_id`, route directly from non-null links, and keep the timestamp matcher only as a legacy fallback. If a non-null `analysis_id` points to a missing row, the entry should render unclickable rather than silently falling back to a mismatched row.

### HIST-06: Post-success `usage_tracking.analysis_id`

`supabase/functions/_shared/usage-checker.ts` only exports `checkAndRecordUsage`, which calls `check_and_record_ai_usage` before the expensive work. Several features already have carve-out `record_ai_usage` calls, but they use the legacy 3-arg form and cannot link `usage_tracking.analysis_id`. Phase 36 should add:

* `checkEntitlement(userId, actionType)` for read-only entitlement checks.
* `recordUsageWithAnalysis(userId, actionType, credits, analysisId)` for the 4-arg `record_ai_usage` overload.
* Backwards-compatible `checkAndRecordUsage` until older call sites are removed.

Then each feature should write usage only after the per-feature row is persisted.

### HIST-07: Recruiting Lens async fallback

`recruiting-lens/index.ts` already inserts `analysis_jobs` rows for all-529 overload and returns a 202 shape, but there is no `process-recruiting-lens-job` function. The nearest proven patterns are `process-resume-analysis-job` and `process-career-analysis-job`: internal auth, claim eligible jobs, call the target function, retry transient failures, refund merits on terminal failure, mark completed when the target returns success, and chain if more work remains.

### TEST-05: Staging history persistence regression

The repo already has `scripts/run-edge-tests.ps1`, Deno function tests, and `merit-gateway` tests that assert `record_ai_usage` receives `p_analysis_id` on cache hits. Phase 36 needs focused regression coverage for successful feature runs and one negative failure case. Staging integration tests should be gated by `DENO_TEST_SUPABASE_REMOTE=1` and staging Supabase secrets because they need deployed edge functions plus real persistence.

\</current\_state>

\<recommended\_decomposition>

## Wave 1: Shared ledger and core backend persistence

1. **36-01: Shared post-success usage ledger helpers**
   Add `checkEntitlement` and `recordUsageWithAnalysis`, preserve compatibility, and cover helper behavior with Deno tests.

2. **36-02: Resume Analysis history row**
   Add `analysis_results` persistence to every successful resume path, capture the inserted id, and write usage with `analysis_id`.

3. **36-03: Career, LinkedIn, and Interview Prep usage links**
   Convert the three existing post-success feature rows to the 4-arg usage write and remove paid pre-write usage rows where present.

## Wave 2: Recruiting Lens and frontend routing

1. **36-04: Recruiting Lens Pro persistence and async worker**
   Remove the Elite-only persistence gate, add `process-recruiting-lens-job`, and extend email support.

2. **36-05: History direct-link routing and Interview Prep hydration**
   Make `AnalysisHistory` prefer `usage_tracking.analysis_id`, preserve fallback matching, and add staging-only Interview Prep `?id=` hydration.

## Wave 3: Regression suite and staging handoff

1. **36-06: TEST-05 staging regression suite**
   Add per-feature staging tests and a human-action checkpoint for deploy and remote test execution.

\</recommended\_decomposition>

<risks>

* Switching from pre-success usage writes to post-success writes changes the historical meaning of `usage_tracking`: it becomes a successful-analysis ledger. This is intended by Phase 36 D-13, but execution must confirm Phase 30 already removed any tier-cap dependency on `usage_tracking` counts.
* Resume Analysis has multiple success branches, including streaming and fallback paths. Missing one branch would keep the most-used feature partially invisible in history.
* A recruiting-lens worker that simply re-invokes `recruiting-lens` must avoid re-queuing itself forever on all-529. The worker plan should explicitly mark retry or failed using the same retry taxonomy as existing workers.
* Direct `analysis_id` routing is polymorphic by `action_type`. The frontend must not route `resume_analysis` to `/resume-analysis?id=<analysis_results.id>`; it must use `source_reference` or the resume id for `/results/:id`.
* Interview Prep production must remain gated. The code can support hydration, but production listings continue to filter `interview_prep` rows until the future milestone flips the flag.

</risks>

\<verification\_strategy>

* Deno unit/source tests for `usage-checker` helper exports and 4-arg RPC payload shape.
* Source/contract tests for each edge function proving `p_analysis_id` is supplied after the durable row id is available.
* React/Vitest tests for `AnalysisHistory` direct link precedence and null route on missing direct target.
* React/Vitest tests for `InterviewPrep` hydration state from `?id=`.
* Staging integration tests via `.\scripts\run-edge-tests.ps1` with `DENO_TEST_SUPABASE_REMOTE=1`, verifying `usage_tracking` row, per-feature row, and populated `analysis_id` for each feature.

\</verification\_strategy>

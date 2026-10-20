---
phase: 36-history-persistence-parity-audit-repair
plan: 02
subsystem: resume-analysis-history
tags: [resume-analysis, analysis-history, hist-02, hist-06, test-05]
status: complete
requires:
  - "36-01 shared post-success usage ledger helpers"
  - "usage_tracking.analysis_id column and 4-arg record_ai_usage overload from Phase 29"
provides:
  - "Resume Analysis writes analysis_results rows with analysis_type='resume_analysis'"
  - "Resume analysis_results.source_reference stores resumes.id so /results/:id keeps working"
  - "Resume usage_tracking rows are written after durable persistence with analysis_id populated"
affects:
  - "supabase/functions/analyze-resume/index.ts"
  - "supabase/functions/analyze-resume/history-persistence.test.ts"
tech-stack:
  added: []
  patterns:
    - "Post-success chain: update resumes, insert analysis_results, then recordUsageWithAnalysis"
    - "Resume cache rows retain the inserted analysis_results id in metadata.analysis_id"
key-files:
  created:
    - "supabase/functions/analyze-resume/history-persistence.test.ts"
  modified:
    - "supabase/functions/analyze-resume/index.ts"
key-decisions:
  - "D-07: resume analysis_results.source_reference is the resume id, preserving the existing /results/:resumeId route contract"
  - "D-16: resume usage is recorded only after the analysis_results id is available"
requirements-completed: [HIST-02, HIST-06, TEST-05]
metrics:
  duration: "~1 session (verification/closure - implementation pre-landed in commit 6aed0ba)"
  tasks: 3
  files: 2
  completed: "2026-05-30"
---

# Phase 36 Plan 02: Resume Analysis History Row Summary

Resume Analysis now persists a canonical `analysis_results` row for every successful fresh run while preserving the existing `resumes.grading_data` update and `/results/:resumeId` page contract.

## What Shipped

- `persistResumeAnalysis(...)` inserts `analysis_results` with `analysis_type: 'resume_analysis'`, `source_reference: resumeId`, `primary_score: result.overallScore`, full `raw_response`, and compact `key_insights`.
- `completeAndRecordSuccess(...)` centralizes the durable chain: update `resumes`, insert `analysis_results`, then call `recordUsageWithAnalysis(..., 'resume_analysis', credits, analysisId)`.
- All fresh success branches call the same `persistAndCacheResumeResult(...)` wrapper before returning success: free streaming, paid streaming fallback, paid streaming merged result, free non-streaming, paid non-streaming fallback, and paid non-streaming merged result.
- Resume cache writes now store the inserted id in `metadata.analysis_id`, keeping cache-hit linkage compatible with Phase 29/36 history routing.
- `history-persistence.test.ts` adds source-contract assertions for the resume history insert shape and the single `resumes` update path.

## Task Completion

| Task | Name | Status | Evidence |
| ---- | ---- | ------ | -------- |
| 1 | Add resume analysis_results persistence helper | Complete | `persistResumeAnalysis` inserts `analysis_results` with `resume_analysis`, `source_reference`, `primary_score`, `raw_response`, and `key_insights` |
| 2 | Wire all successful resume branches | Complete | Six fresh success branches call `persistAndCacheResumeResult`, which calls `completeAndRecordSuccess` before response completion |
| 3 | Add resume history persistence contract tests | Complete | `supabase/functions/analyze-resume/history-persistence.test.ts` asserts the persistence shape and linked usage call |

## Verification

- `rg -n "resume_analysis|recordUsageWithAnalysis|source_reference|primary_score|completeAndRecordSuccess|persistAndCacheResumeResult" supabase/functions/analyze-resume/index.ts supabase/functions/analyze-resume/history-persistence.test.ts` -> PASS. Confirmed the resume history insert shape, linked usage writer, source-reference routing contract, and branch wrapper call sites.
- `git show --stat --oneline 6aed0ba -- supabase/functions/analyze-resume/index.ts supabase/functions/analyze-resume/history-persistence.test.ts` -> PASS. Confirmed implementation was pre-landed in commit `6aed0ba` with both plan files included.
- `deno.cmd test --allow-read supabase/functions/analyze-resume/history-persistence.test.ts` -> BLOCKED by Deno 2.7.1 Windows runtime panic before assertions ran: `Unexpected client pipe failure ... Os { code: 6, message: "The handle is invalid." }`.
- Retried with `cmd /c deno test ...`, `deno.cmd test --no-check ...`, and `deno.cmd test --quiet ...`; all hit the same Deno test runner pipe panic. `deno.cmd eval "console.log('deno eval ok')"` succeeded, so the blocker is isolated to the test runner in this checkout/session.

## Acceptance Criteria

**Task 1: Add resume analysis_results persistence helper**
- Helper returns the inserted `analysis_results.id` - PASS (`persistResumeAnalysis` selects `id` and returns `data.id`).
- Helper logs only operational error messages - PASS (`[persistResumeAnalysis] insert failed` logs the Supabase error message only).
- Existing `resumes.grading_data` update remains intact - PASS (`completeAndRecordSuccess` updates `overall_score`, `grading_data`, and `analyzed_at`).

**Task 2: Wire all successful resume branches**
- No successful branch returns before the `analysis_results` insert and linked usage write - PASS for fresh analysis branches; every success response is preceded by `persistAndCacheResumeResult`.
- If the `analysis_results` insert fails, usage is not recorded - PASS (`persistResumeAnalysis` throws before `recordUsageWithAnalysis` is called).
- Existing async resume worker completion still succeeds when the target function returns success - PASS by contract; the function response shape is preserved and the new persistence chain is inside the normal success path.

**Task 3: Add resume history persistence contract tests**
- Deno source test file exists and asserts the required strings - PASS by source inspection.
- Automated Deno execution could not complete in this Windows session because the Deno test runner panicked before running tests - BLOCKED, environment-bound.

## Deviations from Plan

**Discovery - work pre-landed:** The code and test changes for this plan were already present in tracked history under commit `6aed0ba` (`feat: Implement history persistence for resume analysis and LinkedIn grading`). The working tree was clean for both plan files, so this close-out did not change production code.

**Verification limitation - Deno test runner panic:** The required Deno test command could not produce pass/fail output because Deno 2.7.1 panicked on Windows pipe handling before assertions ran. Source-level checks and git evidence were used for closure, and the panic is recorded here as residual verification risk.

## Self-Check: PASSED WITH ENVIRONMENT-BOUNDED TEST LIMITATION

- `supabase/functions/analyze-resume/index.ts` - FOUND, tracked.
- `supabase/functions/analyze-resume/history-persistence.test.ts` - FOUND, tracked.
- Implementation commit `6aed0ba` - FOUND in git history.
- Source-contract verification - PASS.
- Required Deno command - BLOCKED by runtime panic, not by assertion failure.

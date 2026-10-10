---
phase: 36-history-persistence-parity-audit-repair
plan: 03
subsystem: feature-history-usage-links
tags: [career-compass, linkedin-grader, interview-prep, hist-06, test-05]
status: complete
requires:
  - "36-01 shared post-success usage ledger helpers"
  - "usage_tracking.analysis_id column and 4-arg record_ai_usage overload from Phase 29"
provides:
  - "Career Compass durable analysis_results rows are followed by linked usage writes"
  - "LinkedIn Grader durable linkedin_grades rows are followed by linked usage writes"
  - "Interview Prep durable interview_quizzes rows are followed by linked usage writes"
affects:
  - "supabase/functions/analyze-career/index.ts"
  - "supabase/functions/grade-linkedin/index.ts"
  - "supabase/functions/interview-prep-analyze/index.ts"
tech-stack:
  added: []
  patterns:
    - "Paid paths use checkEntitlement before AI work and recordUsageWithAnalysis only after durable persistence"
    - "Free carve-outs keep zero-credit ledger semantics while still supplying analysis_id"
key-files:
  created:
    - "supabase/functions/analyze-career/history-persistence.test.ts"
    - "supabase/functions/grade-linkedin/history-persistence.test.ts"
    - "supabase/functions/interview-prep-analyze/history-persistence.test.ts"
  modified:
    - "supabase/functions/analyze-career/index.ts"
    - "supabase/functions/grade-linkedin/index.ts"
    - "supabase/functions/interview-prep-analyze/index.ts"
key-decisions:
  - "D-13/D-16: failed paid Career Compass and LinkedIn runs no longer create usage_tracking rows before durable feature persistence"
  - "D-16: Interview Prep usage is linked to interview_quizzes.id after quiz/flashcard persistence"
requirements-completed: [HIST-04, HIST-06, TEST-05]
metrics:
  duration: "~1 session (safe-resume recovery plus legacy-path patch)"
  tasks: 4
  files: 6
  completed: "2026-05-30"
---

# Phase 36 Plan 03: Career, LinkedIn, and Interview Prep Usage Link Summary

Career Compass, LinkedIn Grader, and Interview Prep now follow the Phase 36 post-success usage contract: check entitlement before work where needed, persist the durable feature row, then record usage with the durable row id.

## What Shipped

- Career Compass already had the merit-path helper `persistCareerResultAndRecordUsage(...)`, which inserts `analysis_results` and then calls `recordUsageWithAnalysis(..., 'career_compass', 1, analysisId)`.
- Career Compass legacy path was repaired to use `checkEntitlement(...)` instead of the removed pre-write helper and to call `persistCareerResultAndRecordUsage(...)` after successful AI output.
- LinkedIn Grader merit/free paths already wrote usage with `stored.recordId` after `linkedin_grades` persistence.
- LinkedIn Grader legacy paid path was repaired to use `checkEntitlement(...)` before AI work and `recordUsageWithAnalysis(..., 'linkedin_grading', freeScan ? 0 : 1, record.id)` after `linkedin_grades` persistence.
- LinkedIn Grader legacy durable insert failure is now terminal for the response instead of returning a successful grade with no history row.
- Interview Prep already records usage with `recordUsageWithAnalysis(userId, 'interview_prep', 1, quizId)` after `interview_quizzes` persistence.
- Contract tests were extended to assert the repaired legacy paths do not call `checkAndRecordUsage(...)`.

## Task Completion

| Task | Name | Status | Evidence |
| ---- | ---- | ------ | -------- |
| 1 | Convert Career Compass usage writes | Complete | `checkEntitlement(authenticatedUserId, 'career_compass')` before legacy work; `label: 'Legacy path'` calls the shared post-success helper |
| 2 | Convert LinkedIn Grader usage writes | Complete | Legacy paid path uses `checkEntitlement`; legacy success records linked usage with `record.id` after `linkedin_grades` insert |
| 3 | Convert Interview Prep usage writes | Complete | `recordUsageWithAnalysis(userId, 'interview_prep', 1, quizId)` is present after quiz persistence |
| 4 | Add per-feature contract tests | Complete | Three source-contract test files exist and include regression assertions for post-success linked usage |

## Verification

- PowerShell source assertions -> PASS. Confirmed no `checkAndRecordUsage(` call remains in Career Compass or LinkedIn Grader source files, entitlement checks are present, Career legacy path calls the shared persistence helper, LinkedIn legacy path records linked usage after `record.id`, and Interview Prep records usage with `quizId`.
- `rg -n "checkAndRecordUsage\\(|checkEntitlement\\(|recordUsageWithAnalysis\\(" ...` -> PASS for source files. `checkAndRecordUsage(` appears only inside negative test assertions.
- `git diff --check -- ...` -> PASS, no whitespace errors. Git warned that LF will be replaced by CRLF when touched, matching checkout behavior.
- `deno.cmd check supabase/functions/analyze-career/index.ts supabase/functions/grade-linkedin/index.ts supabase/functions/interview-prep-analyze/index.ts` -> PARTIAL. The introduced `resolvedTier` scope error was fixed; remaining failures are pre-existing type issues outside the changed lines:
  - `analyze-career/index.ts:1581` accesses `aiResponse.text` without narrowing `AnthropicInvokeResult`.
  - `grade-linkedin/index.ts:306` and `:319` pass a widened string `fixtureKey` to `AnthropicInvokeParams`.
- `deno.cmd test --allow-read supabase/functions/analyze-career/history-persistence.test.ts supabase/functions/grade-linkedin/history-persistence.test.ts supabase/functions/interview-prep-analyze/history-persistence.test.ts` -> BLOCKED by the same Deno 2.7.1 Windows test runner pipe panic seen in Plan 02 before assertions ran.

## Acceptance Criteria

**Task 1: Career Compass**
- No paid `career_compass` usage row is written before `analysis_results.id` exists - PASS for the repaired legacy path and existing merit path.
- Existing cache write timing remains after persistence - PASS for the merit path; legacy path has no cache write.

**Task 2: LinkedIn Grader**
- Failed grading does not leave a usage_tracking row - PASS for the repaired legacy paid path because usage is after `linkedin_grades` insert and AI success.
- Free first scan remains visible in history with `analysis_id` - PASS for merit path (`stored.recordId`) and legacy path (`freeScan ? 0 : 1, record.id`).

**Task 3: Interview Prep**
- Usage row points at `interview_quizzes.id` - PASS (`quizId`).
- Production frontend gating is not changed - PASS; this backend plan did not touch frontend gate files.

**Task 4: Contract tests**
- Tests prove 4-arg usage writer appears after durable persistence by source contract - PASS by source inspection.
- Deno runner execution - BLOCKED by environment runtime panic.

## Deviations from Plan

**Safe-resume recovery:** A prior `36-03` code commit (`b1bb78e`) existed without a summary, but source inspection found remaining legacy pre-write gaps. This run patched those gaps before closing the plan.

**Verification limitation:** Deno source tests could not execute because Deno 2.7.1 panicked on Windows pipe handling. `deno check` also remains blocked by three pre-existing type errors outside this patch's changed lines; the introduced strict-nullability error was fixed.

**Commit limitation:** `gsd-sdk query commit` returned `{ committed: false, reason: "commit_docs disabled" }` for the scoped code/test files. Changes remain in the working tree for this checkout.

## Self-Check: PASSED WITH ENVIRONMENT-BOUNDED TEST LIMITATION

- `supabase/functions/analyze-career/index.ts` - modified for legacy entitlement and post-success persistence.
- `supabase/functions/grade-linkedin/index.ts` - modified for legacy entitlement, durable failure handling, and linked usage.
- `supabase/functions/interview-prep-analyze/index.ts` - verified, no changes needed.
- Contract test files - present and updated for regression coverage.
- Source assertions - PASS.
- Deno test runner - BLOCKED by runtime panic.
- Deno check - PARTIAL due pre-existing errors outside changed lines.

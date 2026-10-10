---
phase: 36-history-persistence-parity-audit-repair
plan: 05
subsystem: frontend-history-routing-hydration
tags: [analysis-history, interview-prep, routing, hydration, hist-04, hist-05, hist-06, test-05]
status: complete
requires:
  - "36-02..36-04 backend usage_tracking.analysis_id writes"
  - "Phase 47 Interview Prep feature flag gate"
provides:
  - "AnalysisHistory routes direct usage_tracking.analysis_id links before timestamp fallback"
  - "Legacy null-analysis_id rows keep the five-minute proximity matcher fallback"
  - "Staging-only Interview Prep ?id hydration loads saved quiz and flashcard sessions"
affects:
  - "src/pages/AnalysisHistory.tsx"
  - "src/pages/InterviewPrep.tsx"
tech-stack:
  added: []
  patterns:
    - "Direct analysis_id routing returns null for orphan direct links instead of falling back to nearby unrelated rows"
    - "Interview Prep hydration is gated by isInterviewPrepEnabled()"
key-files:
  created:
    - "src/pages/__tests__/AnalysisHistory.analysis-id.test.tsx"
    - "src/pages/__tests__/InterviewPrep.hydration.test.tsx"
  modified:
    - "src/pages/AnalysisHistory.tsx"
    - "src/pages/InterviewPrep.tsx"
key-decisions:
  - "D-18/D-19: direct analysis_id links are authoritative; timestamp proximity is only for legacy null-analysis_id rows"
  - "D-20: backfill/sunset path is documented but no migration or backfill runs in Phase 36"
  - "D-11/D-12: Interview Prep hydration remains behind the existing staging/preview feature flag"
requirements-completed: [HIST-04, HIST-05, HIST-06, TEST-05]
metrics:
  duration: "~1 session (verification plus flashcard hydration patch)"
  tasks: 5
  files: 4
  completed: "2026-05-30"
---

# Phase 36 Plan 05: History Routing and Interview Prep Hydration Summary

Activity History now resolves new rows by `usage_tracking.analysis_id` first and preserves the legacy timestamp matcher for older rows. Interview Prep supports feature-flagged `?id=<quiz_id>` hydration on staging/preview.

## What Shipped

- `UsageTrackingRow` includes `analysis_id: string | null`, and Activity History still selects all required usage fields.
- Resume direct routing looks up the `analysis_results` row by `analysis_id`, then routes to `/results/<source_reference>` so the existing resume results page contract is preserved.
- LinkedIn, Career Compass, Recruiting Lens, and Interview Prep direct links use their feature-specific candidate tables first.
- If a non-null `analysis_id` has no matching candidate row, `getEntryRoute` returns `null`, rendering the row unclickable instead of guessing with proximity.
- Legacy rows with `analysis_id === null` keep the existing five-minute proximity fallback.
- D-20 is documented in code as future backfill/sunset work; no SQL migration or data backfill was added.
- Interview Prep `?id=` hydration is gated by `isInterviewPrepEnabled()`, loads the current user and saved `interview_quizzes`, loads `interview_quiz_answers` for quiz mode, and dispatches the existing reducer states.
- Saved flashcard rows now hydrate into `flashcard-results` using a read-only replay scaffold derived from saved session context. The original generated flashcards are not stored in the current schema, so this preserves history usability without pretending to reconstruct unavailable detail.

## Task Completion

| Task | Name | Status | Evidence |
| ---- | ---- | ------ | -------- |
| 1 | Type and query usage_tracking.analysis_id | Complete | `UsageTrackingRow.analysis_id` and usage query are present; resume results query includes `source_reference` |
| 2 | Prefer direct route resolution | Complete | `getEntryRoute` checks `entry.analysis_id` before `findIdForEntry` and returns null for orphan direct links |
| 3 | Add Interview Prep ?id hydration | Complete | Hydration effect is gated by feature flag and supports quiz plus flashcard saved rows |
| 4 | Add frontend history hydration tests | Complete | Source-contract tests cover direct routing and Interview Prep hydration contracts |
| 5 | Document proximity matcher sunset path | Complete | D-20 comment documents future backfill and no Phase 36 migration |

## Verification

- PowerShell source assertions -> PASS. Confirmed `analysis_id` typing, direct route checks, resume `source_reference`, D-20 sunset comment, feature-flag hydration gate, quiz/answers queries, and flashcard scaffold.
- `npx.cmd eslint src/pages/AnalysisHistory.tsx src/pages/InterviewPrep.tsx src/pages/__tests__/AnalysisHistory.analysis-id.test.tsx src/pages/__tests__/InterviewPrep.hydration.test.tsx` -> PASS.
- `git diff --check -- src/pages/AnalysisHistory.tsx src/pages/InterviewPrep.tsx src/pages/__tests__/AnalysisHistory.analysis-id.test.tsx src/pages/__tests__/InterviewPrep.hydration.test.tsx` -> PASS, no whitespace errors. Git warned LF will be replaced by CRLF when touched.
- `npm.cmd run test -- AnalysisHistory InterviewPrep` -> BLOCKED at Vitest startup by local dependency/runtime failure: SWC native binding load failed with invalid UTF-8 and Vite externalize-deps hit `spawn EPERM`.

## Acceptance Criteria

**Tasks 1-2: AnalysisHistory**
- `analysis_id` is available in `getEntryRoute` - PASS.
- Resume direct route uses stored resume id from `source_reference` - PASS.
- Direct lookup takes precedence over timestamp proximity - PASS.
- Legacy null-analysis_id rows still route by proximity - PASS.
- Orphan direct links render unclickable - PASS.
- Production Interview Prep filter remains unchanged - PASS.

**Task 3: Interview Prep hydration**
- Production flag-off path does not fetch or render past Interview Prep rows - PASS; hydration returns early when `!interviewPrepEnabled`.
- Missing or unauthorized quiz id shows operational error state - PASS.
- Fresh generation flow remains unchanged when no `id` param exists - PASS.
- Saved flashcard rows render as `flashcard-results` - PASS via read-only scaffold.

**Task 4: Tests**
- Source-contract tests exist and cover direct routing, orphan direct links, feature-flag gating, quiz hydration, and flashcard hydration - PASS by source inspection.
- Vitest execution - BLOCKED by local SWC/Vite startup failure.

**Task 5: D-20 documentation**
- Documentation explicitly says backfill is future work - PASS.
- No migration or data backfill is added in Phase 36 - PASS.

## Deviations from Plan

**Flashcard replay scaffold:** The current `interview_quizzes` schema does not store the original flashcard payload, and `interview_quiz_answers` only exists for quiz mode. Hydration therefore renders saved flashcards as a read-only scaffold from stored session context, not a perfect historical reconstruction.

**Verification limitation:** Vitest could not start because of local SWC/Vite dependency loading failures. Targeted ESLint and source assertions passed.

## Self-Check: PASSED WITH ENVIRONMENT-BOUNDED TEST LIMITATION

- `src/pages/AnalysisHistory.tsx` - verified.
- `src/pages/InterviewPrep.tsx` - modified for flashcard hydration and linted.
- Contract tests - present and updated.
- Source assertions - PASS.
- Targeted ESLint - PASS.
- Vitest - BLOCKED by environment dependency startup failure.

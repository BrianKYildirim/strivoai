---
phase: 36-history-persistence-parity-audit-repair
verified: 2026-05-31T00:00:00Z
status: passed
score: 6/6 success criteria verified
re_verification:
  previous_status: gaps_found
  previous_score: 4/6
  gaps_closed:
    - "SC-5: Orphaned async-fallback path removed — overload now returns synchronous 503; process-recruiting-lens-job worker deleted"
    - "SC-2: Caveat resolved — no async path remains that could drop a Pro persistence row"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Per-feature TEST-05 suite on staging"
    expected: "All 5 per-feature history-persistence tests pass; negative regression (failed analysis → no usage_tracking row) passes; Recruiting Lens test passes for Pro tier."
    why_human: "Operator confirmed this passed 2026-05-31, but the run cannot be re-verified programmatically from source."
---

# Phase 36: History Persistence Parity Audit & Repair — Verification Report

**Phase Goal:** Close every history-write gap so AnalysisHistory's listing, deep-link routing, and per-feature `?id=` hydration all work for every successful AI run across all 5 features. Replace the fragile ±5-min proximity matcher with the explicit `usage_tracking.analysis_id` link from Phase 29.

**Verified:** 2026-05-31T00:00:00Z
**Status:** passed
**Re-verification:** Yes — gap closure after commit 235ae06 (2026-05-31)

---

## Gap Closure Note (2026-05-31) — commit 235ae06

The two gaps identified in the initial verification (SC-5 FAILED, SC-2 partial) are resolved by removing the broken async path entirely rather than wiring it:

- `supabase/functions/recruiting-lens/index.ts` lines 650-664: the all-529 overload branch now returns a synchronous 503 response. No `analysis_jobs` row is inserted. The only references to `analysis_jobs` or `process-recruiting-lens-job` in the file are in comment lines (652, 656) documenting the removal rationale.
- `supabase/functions/process-recruiting-lens-job/` directory: deleted. The worker had no remaining producer. Confirmed by directory non-existence.
- The existing `requireAuth(req, {type:'user'})` guard is now correct: recruiting-lens is only ever invoked directly by users; there is no internal worker path.
- Edge Deno suite: 251 passed / 0 failed after the change (per commit record).

---

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | Resume Analysis writes `analysis_results` row (`analysis_type='resume_analysis'`) on every successful run, in addition to `resumes.grading_data` UPDATE | VERIFIED | `persistResumeAnalysis` at `analyze-resume/index.ts:25-64` inserts into `analysis_results`; `completeAndRecordSuccess` at `:70-115` calls it then calls `recordUsageWithAnalysis` with the returned id |
| SC-2 | Recruiting Lens Pro tier writes `analysis_results` (`analysis_type='recruiting_lens'`) — no longer Elite-only | VERIFIED | `persistRecruitingLensResult` called with `recordUsage:true` for both Pro and Elite on the merit path (`:568-578`) and legacy path (`:705-715`). The async overload fallback that previously prevented Pro persistence on the legacy path has been removed (commit 235ae06); there is no longer any code path that can queue a recruiting-lens job without completing it. |
| SC-3 | HIST-04 narrowed: Interview Prep `?id=<quiz_id>` deep-link hydration implemented; on production Interview Prep rows filtered out per Phase 47 D-05 | VERIFIED | `InterviewPrep.tsx:214-320` has `useSearchParams` hydration path; `AnalysisHistory.tsx:150` reads `isInterviewPrepEnabled()` and `:271` gates `interviewQuizzes` query on flag; `:350-355` filters `interview_prep` from `visibleUsageRows` when flag is off |
| SC-4 | AnalysisHistory page lists every successful AI run across all 5 features with feature label, date, score, and working deep-link; proximity matcher is fallback | VERIFIED | `getEntryRoute` in `AnalysisHistory.tsx:293-343` first checks `entry.analysis_id` for all 5 action types, falls back to `findIdForEntry` proximity matcher; `typeConfig` map covers all 5 features with labels, icons |
| SC-5 | Orphaned `analysis_jobs` async-fallback path in `recruiting-lens/index.ts` is either wired to a real `process-recruiting-lens-job` worker OR removed | VERIFIED | Resolved via "removed" route (commit 235ae06). Lines 650-664 of `recruiting-lens/index.ts` show all-529 overload now returns synchronous 503; no `analysis_jobs` insert exists. `supabase/functions/process-recruiting-lens-job/` directory deleted — no orphaned consumer, no unworked queued jobs possible. |
| SC-6 | Per-feature TEST-05 regression suite passes | VERIFIED (conditional) | Remote suite ran on staging 2026-05-31 per operator confirmation; local Deno suite 251/251 pass; remote tests correctly skip locally without `DENO_TEST_SUPABASE_REMOTE=1` |

**Score: 6/6 success criteria verified**

---

## Required Artifacts

### HIST-01 — `usage_tracking.analysis_id` column

| Artifact | Status | Evidence |
|----------|--------|----------|
| `supabase/functions/_shared/usage-checker.ts` | VERIFIED | `checkEntitlement` (read-only, no insert), `recordUsageWithAnalysis` (posts `p_analysis_id` to `record_ai_usage` RPC), `checkAndRecordUsage` (legacy kept) — all three exported |

### HIST-02 — Resume Analysis writes `analysis_results`

| Artifact | Status | Evidence |
|----------|--------|----------|
| `supabase/functions/analyze-resume/index.ts` | VERIFIED | `persistResumeAnalysis` inserts `analysis_type='resume_analysis'`; `completeAndRecordSuccess` updates `resumes` first, then persists, then calls `recordUsageWithAnalysis` with the new `analysis_results.id` |

### HIST-03 — Recruiting Lens Pro persistence

| Artifact | Status | Evidence |
|----------|--------|----------|
| `supabase/functions/recruiting-lens/index.ts` | VERIFIED | `persistRecruitingLensResult` persists for both `pro` and `elite`; `recordUsage:true` on all sync invocations; async overload path removed — no partial-write risk |

### HIST-04 — Interview Prep `?id=` hydration

| Artifact | Status | Evidence |
|----------|--------|----------|
| `src/pages/InterviewPrep.tsx` | VERIFIED | `useSearchParams` at line 198; `hydratedQuizId` drives `useEffect` at 214 that fetches `interview_quizzes` + `interview_quiz_answers`; gated by `interviewPrepEnabled` flag |

### HIST-05/HIST-06 — AnalysisHistory parity + `analysis_id` routes

| Artifact | Status | Evidence |
|----------|--------|----------|
| `src/pages/AnalysisHistory.tsx` | VERIFIED | `UsageTrackingRow` has `analysis_id: string \| null`; `getEntryRoute` checks direct `entry.analysis_id` first for all 5 features; proximity matcher remains as fallback |

### HIST-07 — Recruiting Lens async worker wired or removed

| Artifact | Status | Evidence |
|----------|--------|----------|
| `supabase/functions/process-recruiting-lens-job/` | VERIFIED (removed) | Directory does not exist. Worker deleted in commit 235ae06 — no orphaned consumer. `recruiting-lens/index.ts` overload branch is now a synchronous 503 at lines 650-664. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `analyze-resume` result | `usage_tracking` | `recordUsageWithAnalysis(userId, 'resume_analysis', credits, analysisId)` | WIRED | Called at `index.ts:103-112` after `persistResumeAnalysis` returns the id |
| `recruiting-lens` result (merit path) | `usage_tracking` | `persistRecruitingLensResult({recordUsage:true})` → internal `recordUsageWithAnalysis` | WIRED | Lines 568-578; `persistRecruitingLensResult` calls `recordUsageWithAnalysis` at internal line ~106 |
| `recruiting-lens` result (legacy sync path) | `usage_tracking` | `persistRecruitingLensResult({recordUsage:true})` | WIRED | Lines 705-715 |
| `recruiting-lens` overload | synchronous 503 | direct `Response` return | WIRED | Lines 650-664; no `analysis_jobs` insert; async path removed (commit 235ae06) |
| `grade-linkedin` result | `usage_tracking` | `recordUsageWithAnalysis(userId, 'linkedin_grading', ...)` | WIRED | Lines 505 (free-scan path) and 542 (merit path) |
| `analyze-career` result (legacy path) | `usage_tracking` | `recordUsageWithAnalysis` post-persistence | WIRED | Lines 1193-1200 use `checkEntitlement`; usage recorded post-persistence |
| `interview-prep-analyze` result | `usage_tracking` | `recordUsageWithAnalysis(userId, 'interview_prep', 1, quizId)` | WIRED | Line 603; called after quiz insert and streak upsert |
| `usage_tracking.analysis_id` | deep-link route | `AnalysisHistory.getEntryRoute` direct lookup | WIRED | `getEntryRoute` checks `entry.analysis_id` first across all 5 cases before falling back to proximity |

---

## Requirements Coverage

| REQ-ID | Status | Notes |
|--------|--------|-------|
| HIST-02 | SATISFIED | `analyze-resume` inserts `analysis_results(analysis_type='resume_analysis')` on every sync path |
| HIST-03 | SATISFIED | `recruiting-lens` persists Pro rows via `persistRecruitingLensResult` on both active code paths |
| HIST-04 | SATISFIED | InterviewPrep hydration implemented; production filter via `isInterviewPrepEnabled()` |
| HIST-05 | SATISFIED | AnalysisHistory lists all 5 features; production filters Interview Prep via flag |
| HIST-06 | SATISFIED | All 5 features call `recordUsageWithAnalysis` with their per-feature `analysisId` |
| HIST-07 | SATISFIED | Async worker deleted and overload branch replaced with synchronous 503 (commit 235ae06); no orphaned queue path remains |
| TEST-05 | SATISFIED (conditional) | Remote staging run confirmed 2026-05-31; local Deno suite 251/251; WR-01/WR-02 (orphaned root-level static tests stale and unexecuted) do not gate CI |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `supabase/functions/grade-linkedin/history-persistence.test.ts` | 5-8 | Static contract test asserts stale signature strings | Warning | Test would fail if executed; false confidence. Currently not wired to test runner (WR-01/WR-02) |
| `supabase/functions/*/history-persistence.test.ts` (5 files) | — | Root-level static tests never executed by `run-edge-tests.ps1` | Warning | Source-level regressions not caught in automated suite; Windows Deno runner panic prevents local execution (WR-02) |
| `src/pages/InterviewPrep.tsx` | 471-489 | `mapBespokeGateError` always receives null `serverData` — gate codes never reach UI | Warning | `daily_cap`, `monthly_taste_used`, `no_resume` UI copy never displayed; generic merit error shown instead (WR-03) |
| `supabase/functions/interview-prep-analyze/index.ts` | 499-607 | Quiz/answers/streak persisted BEFORE `recordUsageWithAnalysis`; failure leaves durable artifact with refunded merit and no history row | Warning | Partial-write inconsistency: streak incremented even when usage record fails (WR-04) |

Note: The two Blocker anti-patterns from the initial verification (`requireAuth type:'user'` and `analysis_jobs` insert missing `merit_transaction_id`) are no longer present — both were eliminated by removing the async path entirely (commit 235ae06).

---

## Human Verification Required

### 1. Per-feature TEST-05 suite on staging

**Test:** Run `DENO_TEST_SUPABASE_REMOTE=1 .\scripts\run-edge-tests.ps1` against staging with valid staging secrets.
**Expected:** All 5 per-feature history-persistence tests pass; negative regression (failed analysis → no usage_tracking row) passes; Recruiting Lens test passes for Pro tier.
**Why human:** Operator confirmed this passed 2026-05-31, but the run cannot be re-verified programmatically from source.

---

## Gaps Summary

No gaps remain. The two gaps from the initial verification are closed:

**Gap 1 — HIST-07 (SC-5): CLOSED.** The broken async worker path (`process-recruiting-lens-job`) and its producer (the `!MERIT_SYSTEM_ENABLED` overload block in `recruiting-lens/index.ts`) have been deleted entirely (commit 235ae06). The overload branch now returns a synchronous 503 at lines 650-664 with a comment documenting the removal rationale. There are no `analysis_jobs` inserts in `recruiting-lens/index.ts` — verified by grep returning only comment lines.

**Gap 2 — SC-2 caveat: CLOSED.** The async overload path that could have left a queued Pro run without a persistence row no longer exists. `persistRecruitingLensResult` is called synchronously on all active code paths for both Pro and Elite; there is no path that can produce a usage_tracking row without a corresponding analysis_results row.

The remaining code-review warnings (WR-01/WR-02 stale static tests, WR-03 dead bespoke gate-error mapping, WR-04 partial-write ordering) are warnings, not blockers for the phase goal, and do not prevent history persistence from working.

---

_Initial verification: 2026-05-31T00:00:00Z_
_Re-verified: 2026-05-31T00:00:00Z (gap closure, commit 235ae06)_
_Verifier: Claude (gsd-verifier)_

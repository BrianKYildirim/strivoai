---
phase: 13-merit-enforcement-and-feature-flag
fixed_at: 2026-04-16T12:30:00Z
review_path: .planning/phases/13-merit-enforcement-and-feature-flag/13-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 13: Code Review Fix Report

**Fixed at:** 2026-04-16T12:30:00Z
**Source review:** .planning/phases/13-merit-enforcement-and-feature-flag/13-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8
- Fixed: 8
- Skipped: 0

## Fixed Issues

### CR-01: Request body consumed twice in analyze-skills-gap merit branch

**Files modified:** `supabase/functions/analyze-skills-gap/index.ts`
**Commit:** 64f27b4
**Applied fix:** Moved input parsing and validation (jobInput length check, LinkedIn profile URL check) before the `withMerits` call. The parsed values are passed into the callback via closure variables. This prevents merit deduction for invalid requests.

### CR-02: Merit deduction charged for input validation failures in all merit-branch functions

**Files modified:** `supabase/functions/analyze-skills-gap/index.ts`, `supabase/functions/compare-jobs/index.ts`, `supabase/functions/grade-linkedin/index.ts`, `supabase/functions/interview-prep-coach/index.ts`, `supabase/functions/analyze-career/index.ts`
**Commits:** 64f27b4, dce6971, 835af92, a269ae8, e487aa8
**Applied fix:** For each affected function, moved all input validation checks (minimum length, required fields, URL format) before the `withMerits` call so that invalid requests return 400 without deducting merits. In analyze-career, the multi-role comparison sub-path is still inside `withMerits` since it performs actual work. The validation guard only applies when not on the multi-role path. Note: analyze-resume was already safe (resumeText < 50 check happens before the merit branch).

### WR-01: Redundant status check in isRefundableAnthropicError

**Files modified:** `supabase/functions/_shared/merit-gateway.ts`
**Commit:** cd18f7c
**Applied fix:** Removed the redundant `if (status === 529) return true;` line since it is already covered by the `if (status >= 500) return true;` check. Added a clarifying comment noting that the 5xx check covers 529 (overloaded).

### WR-02: admin-merit-metrics responses missing CORS headers

**Files modified:** `supabase/functions/admin-merit-metrics/index.ts`
**Commit:** fa47c03
**Applied fix:** Added `...corsHeaders({ type: 'internal' })` spread to the headers of all 5 response paths (401 unauthorized, 403 forbidden, 500 view-read-error, 200 success, 500 exception catch). The `corsHeaders` import was already present but unused in response construction.

### WR-03: analyze-skills-gap merit branch does not handle JSON.parse failure

**Files modified:** `supabase/functions/analyze-skills-gap/index.ts`, `supabase/functions/compare-jobs/index.ts`
**Commits:** 64f27b4, dce6971
**Applied fix:** Wrapped `JSON.parse(analysisText)` in a try-catch block in the merit branch of both functions. On parse failure, throws `MeritRefundable(500, ...)` so that `withMerits` classifies the error as refundable and returns the user's merits. The AI produced unusable output, so the user should not be charged.

### WR-04: submit-career-analysis-job merit branch charges for reused existing job

**Files modified:** `supabase/functions/submit-career-analysis-job/index.ts`, `supabase/functions/submit-resume-analysis-job/index.ts`
**Commit:** c076b6a
**Applied fix:** Moved the existing active job query before the `withMerits` call in both submission handlers. If an existing active job is found, the function returns 202 with the existing job ID without entering `withMerits`, so no merit deduction occurs for job reuse.

### WR-05: Streaming merit path in analyze-resume can leave MeritRefundable unhandled

**Files modified:** `supabase/functions/analyze-resume/index.ts`
**Commit:** 2ba7089
**Applied fix:** Instead of re-throwing `MeritRefundable` from the unawaited IIFE (which would become an unhandled promise rejection), the catch block now calls `refundMeritsForJob(userContext.userId, _txId, reason)` directly. Added `refundMeritsForJob` to the import from `merit-gateway.ts`. The IIFE returns cleanly after sending the error event and closing the writer. This is the correct pattern since the `withMerits` callback already returned the Response before the IIFE completes. Status: fixed: requires human verification (logic change in async error handling).

### WR-06: check-merit-alerts cron SQL uses placeholder values

**Files modified:** `supabase/ops/phase-13-cron-setup.sql`
**Commit:** 6e0726e
**Applied fix:** Added a PL/pgSQL guard block before the `cron.schedule` call that raises an exception if `<PROJECT_REF>` has not been replaced. The guard uses string concatenation (`'<' || 'PROJECT_REF>'`) so that the guard itself is not accidentally matched during find-and-replace placeholder substitution.

## Skipped Issues

None -- all in-scope findings were fixed.

---

_Fixed: 2026-04-16T12:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

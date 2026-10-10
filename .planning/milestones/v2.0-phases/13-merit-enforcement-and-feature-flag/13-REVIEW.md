---
phase: 13-merit-enforcement-and-feature-flag
reviewed: 2026-04-16T12:00:00Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - scripts/run-edge-tests.ps1
  - supabase/functions/_shared/anthropic.test.ts
  - supabase/functions/_shared/anthropic.ts
  - supabase/functions/_shared/merit-gateway.perf.test.ts
  - supabase/functions/_shared/merit-gateway.rate.test.ts
  - supabase/functions/_shared/merit-gateway.raw.test.ts
  - supabase/functions/_shared/merit-gateway.test.ts
  - supabase/functions/_shared/merit-gateway.ts
  - supabase/functions/admin-merit-metrics/index.test.ts
  - supabase/functions/admin-merit-metrics/index.ts
  - supabase/functions/analyze-career/index.ts
  - supabase/functions/analyze-resume/index.ts
  - supabase/functions/analyze-resume/legacy-unchanged.test.ts
  - supabase/functions/analyze-resume/merit-branch.test.ts
  - supabase/functions/analyze-resume/test-07.test.ts
  - supabase/functions/analyze-skills-gap/index.ts
  - supabase/functions/check-merit-alerts/index.test.ts
  - supabase/functions/check-merit-alerts/index.ts
  - supabase/functions/compare-jobs/index.ts
  - supabase/functions/grade-linkedin/index.ts
  - supabase/functions/interview-prep-coach/index.ts
  - supabase/functions/recruiting-lens/index.ts
  - supabase/functions/submit-career-analysis-job/index.ts
  - supabase/functions/submit-resume-analysis-job/index.ts
  - supabase/migrations/20260416000000_merit_enforcement_observability.sql
  - supabase/ops/phase-13-cron-setup.sql
findings:
  critical: 2
  warning: 6
  info: 5
  total: 13
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-04-16T12:00:00Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Phase 13 introduces the Merit enforcement gateway (`merit-gateway.ts`), wires it into all 8 AI feature functions via a feature-flag-guarded branch (`MERIT_SYSTEM_ENABLED`), adds observability infrastructure (admin metrics endpoint, alert evaluator, SQL views), and includes comprehensive test coverage. The gateway design is sound: single deduction surface, narrow refund taxonomy, rate-limit-before-deduction ordering, and proper error classification.

Key concerns center on (1) a body-consumption bug in the merit branch of `analyze-skills-gap` and `compare-jobs` that will cause runtime failures when the flag flips, (2) missing CORS headers on admin-metrics responses, and (3) a redundant `isRefundableAnthropicError` check for status 529 that is already covered by the `>= 500` branch.

## Critical Issues

### CR-01: Request body consumed twice in analyze-skills-gap merit branch

**File:** `supabase/functions/analyze-skills-gap/index.ts:40`
**Issue:** The merit branch calls `req.clone().json()` on line 40, but the request body was already consumed on line 23 by `requireAuth(req, { type: 'user' })` followed by the rate-limit check. While `requireAuth` reads headers (not body), the real problem is that `req.json()` is called again on line 93 in the legacy path. When the merit flag is ON, the branch at line 35 enters `withMerits`, which calls `req.clone().json()` -- this should work because `req.clone()` clones the stream. However, if `req.json()` was already consumed higher up (it is not in this function), the clone would fail. The actual bug is different: if the merit branch returns a **validation error** (e.g., `jobInput.length < 10`), the merits are still deducted because the validation happens INSIDE the `withMerits` callback AFTER deduction. Returning a 400 Response from the callback is treated as a successful `withMerits` call -- merits are permanently deducted for an invalid request.
**Fix:** Move input validation BEFORE the `withMerits` call, or throw an error (not MeritRefundable) to signal that no AI work was done. The same pattern affects `compare-jobs/index.ts`, `grade-linkedin/index.ts`, `interview-prep-coach/index.ts`, and `analyze-career/index.ts`.

```typescript
// In analyze-skills-gap/index.ts, BEFORE the withMerits call:
const rawBody = await req.clone().json();
const jobInput = typeof rawBody.jobInput === 'string' ? rawBody.jobInput.slice(0, MAX_JOB_SIZE) : '';
if (!jobInput || jobInput.length < 10) {
  return new Response(
    JSON.stringify({ error: 'Job input is required and must be at least 10 characters' }),
    { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } }
  );
}
// THEN enter withMerits
```

### CR-02: Merit deduction charged for input validation failures in all merit-branch functions

**File:** `supabase/functions/analyze-career/index.ts:376-398`
**Issue:** In the merit branch of `analyze-career`, the `withMerits` callback validates inputs (e.g., `!resumeFilePath`, `!linkedinPdfContent`, `!linkedinUrl`) and returns 400 Response objects when they fail. Since `withMerits` treats a resolved callback as a success (line 168 of merit-gateway.ts: `return { ok: true, value, transactionId }`), the merit deduction is permanent. Users lose merits for submitting an invalid request -- no AI call was ever made, so no refund is triggered. This affects all 8 feature functions where validation is inside the `withMerits` callback.

Affected files:
- `supabase/functions/analyze-career/index.ts:386-398` (resumeFilePath, linkedinPdfContent, linkedinUrl checks)
- `supabase/functions/analyze-skills-gap/index.ts:48-59`
- `supabase/functions/compare-jobs/index.ts:79-95`
- `supabase/functions/grade-linkedin/index.ts:112-117`
- `supabase/functions/interview-prep-coach/index.ts:59-63`
- `supabase/functions/analyze-resume/index.ts:216-221` (resumeText < 50 check already happens before merit branch, so this one is safe)

**Fix:** Move all input validation BEFORE the `withMerits` call in each function, so deduction only occurs when a valid request proceeds to the AI call.

## Warnings

### WR-01: Redundant status check in isRefundableAnthropicError

**File:** `supabase/functions/_shared/merit-gateway.ts:54`
**Issue:** The check `if (status === 529) return true;` on line 54 is dead code because the preceding check `if (status >= 500) return true;` on line 53 already covers 529 (since 529 >= 500). This is not a bug (the function returns the correct result), but it indicates a logic misunderstanding that could lead to future maintenance errors -- someone might later change the `>= 500` threshold without realizing 529 was also intended to be covered.
**Fix:** Remove line 54 or add a comment clarifying it is intentional documentation:
```typescript
if (status >= 500) return true; // Covers 5xx including 529 (overloaded)
if (status === 408) return true;
```

### WR-02: admin-merit-metrics responses missing CORS headers

**File:** `supabase/functions/admin-merit-metrics/index.ts:71-73`
**Issue:** The 401, 403, 200, and 500 responses from `admin-merit-metrics` include `Content-Type: application/json` but do NOT include CORS headers. If this endpoint is ever called from a browser admin panel, the response will be blocked by the browser. The `corsHeaders` import is present but unused in responses.
**Fix:** Add CORS headers to all responses:
```typescript
return new Response(JSON.stringify({ error: 'unauthorized' }), {
  status: 401,
  headers: { ...corsHeaders({ type: 'internal' }), 'Content-Type': 'application/json' },
});
```

### WR-03: analyze-skills-gap merit branch does not handle JSON.parse failure

**File:** `supabase/functions/analyze-skills-gap/index.ts:81`
**Issue:** In the merit branch, `JSON.parse(analysisText)` on line 81 can throw if the AI returns malformed JSON. This throw would be caught by `withMerits` and classified by `isRefundableAnthropicError(undefined, message)`. Since the error message from `JSON.parse` (e.g., "Unexpected token...") does not match any refundable pattern, merits would NOT be refunded for a parse failure. The legacy path has the same issue but does not deduct merits, so it is less consequential there. The same pattern exists in `compare-jobs/index.ts:116`.
**Fix:** Wrap JSON.parse in a try-catch and throw MeritRefundable(500, ...) if parsing fails, since the AI produced unusable output:
```typescript
let analysis;
try {
  analysis = JSON.parse(analysisText);
} catch (e) {
  throw new MeritRefundable(500, `JSON parse failed: ${(e as Error).message}`);
}
```

### WR-04: submit-career-analysis-job merit branch charges for reused existing job

**File:** `supabase/functions/submit-career-analysis-job/index.ts:93-102`
**Issue:** If an existing active job is found (lines 93-102), the function returns a 202 response reusing the existing job. However, merits have already been deducted by `withMerits` at this point. The user is charged for a job submission that did not create a new job. The same issue exists in `submit-resume-analysis-job/index.ts:99-103`.
**Fix:** Move the existing-job check BEFORE the `withMerits` call:
```typescript
if (MERIT_SYSTEM_ENABLED && authenticatedUserCtxCareer) {
  // Check for existing active job FIRST
  const { data: existingJob } = await supabase.from("analysis_jobs")...;
  if (existingJob?.id) {
    return new Response(JSON.stringify({ jobId: existingJob.id, ... }), { status: 202, ... });
  }
  // THEN deduct merits
  const gated = await withMerits(...);
}
```

### WR-05: Streaming merit path in analyze-resume can leave MeritRefundable unhandled

**File:** `supabase/functions/analyze-resume/index.ts:398-409`
**Issue:** In the streaming merit path (lines 293-419), if the async IIFE throws `MeritRefundable`, it closes the writer and re-throws at line 404. However, since this throw happens inside an IIFE that is NOT awaited (the response is returned immediately at line 411), the `MeritRefundable` throw becomes an unhandled promise rejection. The `withMerits` wrapper never sees this throw because the callback already resolved with the Response object at line 411.
**Fix:** The streaming architecture means the `withMerits` callback returns a Response before the IIFE completes. For streaming + merits, the refund logic must be moved inside the IIFE rather than relying on `withMerits` catch:
```typescript
// Inside the IIFE, after catching MeritRefundable:
// Manually call refundMeritsForJob instead of re-throwing
```

### WR-06: check-merit-alerts cron SQL uses placeholder values

**File:** `supabase/ops/phase-13-cron-setup.sql:10-11`
**Issue:** The cron setup SQL contains `<PROJECT_REF>` and `<INTERNAL_JOB_SECRET>` placeholders. If this file is accidentally applied without substitution, the cron job will be created with literal angle-bracket strings as the URL and secret, causing silent failures every 15 minutes.
**Fix:** Add a guard comment and consider using a script wrapper:
```sql
-- GUARD: fail if placeholders not replaced
do $$ begin
  if '<PROJECT_REF>' = '<' || 'PROJECT_REF>' then
    raise exception 'Replace <PROJECT_REF> before running this script';
  end if;
end $$;
```

## Info

### IN-01: Unused authenticateRequest function in submission handlers

**File:** `supabase/functions/submit-resume-analysis-job/index.ts:8-29`
**Issue:** The `authenticateRequest` function is defined but never called. Both submission handlers use `requireAuth` instead.
**Fix:** Remove the dead `authenticateRequest` function from both `submit-resume-analysis-job/index.ts` (lines 8-29) and `submit-career-analysis-job/index.ts` (lines 8-22).

### IN-02: Unused domainConfig variable in analyze-career merit branch

**File:** `supabase/functions/analyze-career/index.ts:477`
**Issue:** `const domainConfig = DOMAIN_MAPPING[domainClassification.domainKey];` is declared but never used in the merit branch. It is used in the legacy path for the elite compensation prompt, but the merit branch constructs a simpler prompt that does not reference `domainConfig`.
**Fix:** Remove the unused variable or align the merit branch prompt to use it.

### IN-03: Test files set module-scope env vars that may leak between test files

**File:** `supabase/functions/analyze-resume/test-07.test.ts:285-291`
**Issue:** Module-scope `setTestEnv` calls (lines 285-291) set `AI_TEST_MODE=true` and `AI_FORCE_FAILURE=false` before imports. While the code comment correctly explains why module-scope restoration is not possible, these env vars persist for the entire test runner process. If test execution order changes, other test files that rely on `AI_TEST_MODE` being unset could be affected. The test at `_shared/merit-gateway.test.ts:60-70` specifically asserts `MERIT_SYSTEM_ENABLED === false`, which works because it was imported before test-07 could set it -- but this is fragile.
**Fix:** Document the required test execution order or use Deno subprocess isolation for tests that mutate module-scope env vars.

### IN-04: Magic number 12000 repeated across multiple functions

**File:** Multiple files
**Issue:** The max context character limit `12000` appears as a magic number in `analyze-career/index.ts` (lines 471, 752), `grade-linkedin/index.ts` (line 121, 245), and `interview-prep-coach/index.ts` (line 66, 137). This value should be a named constant.
**Fix:** Extract to a shared constant in `_shared/` or define at the top of each file:
```typescript
const MAX_CONTEXT_CHARS = 12000;
```

### IN-05: SQL migration v_conversion_funnel is a stub returning no rows

**File:** `supabase/migrations/20260416000000_merit_enforcement_observability.sql:57-65`
**Issue:** The `v_conversion_funnel` view is a stub that always returns zero rows (`where false`). This is intentionally documented in the SQL comment, but the admin-metrics endpoint and tests treat it as a real data source. This is acceptable for now but should be tracked for follow-up.
**Fix:** No action needed now. Ensure a follow-up phase replaces the stub with real data.

---

_Reviewed: 2026-04-16T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

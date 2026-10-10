---
phase: 01-cross-origin-error-contract-foundation
plan: 04
subsystem: api
tags: [cors, deno, edge-functions, jobs, admin, error-contract, rollout]

# Dependency graph
requires:
  - phase: 01-01
    provides: "withCors(req, type, handler) wrapper + origin-aware handleOptionsRequest from _shared/cors.ts"
provides:
  - "submit-resume-analysis-job serve() entrypoint routed through withCors(req, 'user', …) — origin-aware CORS on success + 401/4xx/5xx"
  - "submit-career-analysis-job serve() entrypoint routed through withCors(req, 'user', …)"
  - "get-analysis-job-status (GET poller) serve() entrypoint routed through withCors(req, 'user', …) — preflight allows GET via shared Allow-Methods"
  - "ocr-pdf serve() entrypoint routed through withCors(req, 'user', …)"
  - "admin-delete-user serve() entrypoint routed through withCors(req, 'user', …) — origin allowlist + existing auth gate unchanged"
affects: [wave-2-function-rollout, wave-3-cors-audit, phase-3-error-taxonomy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave-2 mechanical wrap: only the outermost serve() site is wrapped in withCors; inner OPTIONS line + inline corsHeaders spreads left untouched (CORS-by-construction owns every exit)"
    - "serve(async (req) => { BODY }) → serve((req) => withCors(req, 'user', async () => { BODY })); outer close becomes }))"

key-files:
  created: []
  modified:
    - supabase/functions/submit-resume-analysis-job/index.ts
    - supabase/functions/submit-career-analysis-job/index.ts
    - supabase/functions/get-analysis-job-status/index.ts
    - supabase/functions/ocr-pdf/index.ts
    - supabase/functions/admin-delete-user/index.ts
    - supabase/functions/submit-resume-analysis-job/job-contract.test.ts

key-decisions:
  - "GET poller (get-analysis-job-status) needs no special preflight handling — the shared Allow-Methods already includes GET/POST/OPTIONS, so the GET lifecycle poll is covered by the same withCors wrap"
  - "admin-delete-user has no dedicated deno test — relied on the grep-presence gate here; the durable invariant guard is the Wave-3 cors-audit.test.ts (01-07)"

requirements-completed: [CORS-02, CORS-05]

# Metrics
duration: 2min
completed: 2026-06-27
---

# Phase 1 Plan 04: Jobs / Utility / Admin withCors Rollout Summary

**Wrapped the five job-submission, job-status, OCR, and admin Edge Function entrypoints — submit-resume-analysis-job, submit-career-analysis-job, get-analysis-job-status (GET poller), ocr-pdf, admin-delete-user — so each `serve()` routes through `withCors(req, 'user', …)`, guaranteeing origin-aware CORS on success and on every 401/4xx/5xx exit, with no behavior change beyond CORS.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-27T12:04:01Z
- **Completed:** 2026-06-27T12:06:42Z
- **Tasks:** 2
- **Files modified:** 6 (5 entrypoints + 1 brittle-test repair)

## Accomplishments
- Routed all five entrypoints (jobs/utility/admin batch) through the Wave-1 `withCors` wrapper so their error and throw paths can no longer bypass CORS by construction (CORS-02 + CORS-05 for this batch) — the SPA can now read 401/4xx/5xx bodies from these functions for both apex and `www` origins.
- Confirmed the GET lifecycle poller (`get-analysis-job-status`) preflight is covered without special handling: the shared `Allow-Methods` (`GET, POST, OPTIONS`) already permits the GET poll, so the same single wrap suffices (mitigates T-01-04-01 repudiation/debug-DoS on the poll error path).
- Wrapped `admin-delete-user` so cross-origin abuse is fail-closed at the origin allowlist while its existing auth gate stays unchanged (mitigates T-01-04-02 elevation-of-privilege).
- Kept the change purely mechanical per the wrapping recipe: only the outermost `serve()` site was wrapped; the inner OPTIONS lines and inline `corsHeaders` spreads were left intact.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wrap submit-resume-analysis-job, submit-career-analysis-job, get-analysis-job-status** - `e224aade` (feat)
2. **Task 2: Wrap ocr-pdf and admin-delete-user** - `ca3bed75` (feat)

## Files Created/Modified
- `supabase/functions/submit-resume-analysis-job/index.ts` - `serve()` wrapped in `withCors(req, 'user', …)`; `withCors` added to cors import.
- `supabase/functions/submit-career-analysis-job/index.ts` - `serve()` wrapped (single-line OPTIONS form preserved); `withCors` added to cors import.
- `supabase/functions/get-analysis-job-status/index.ts` - GET-poller `serve()` wrapped; `withCors` added to cors import.
- `supabase/functions/ocr-pdf/index.ts` - `serve()` wrapped; `withCors` added to cors import.
- `supabase/functions/admin-delete-user/index.ts` - `serve()` wrapped; `withCors` added to cors import.
- `supabase/functions/submit-resume-analysis-job/job-contract.test.ts` - Loosened the terminal-token regex of the catch-block source-introspection assertion to tolerate the withCors serve-wrap (deviation, below).

## Decisions Made
- **GET poller needs no preflight special-casing.** The plan flagged `get-analysis-job-status` as a GET poller; confirmed the shared `Allow-Methods` already includes GET, so wrapping the entrypoint is sufficient — no per-function method override.
- **admin-delete-user gated by grep-presence here.** It has no dedicated deno test; the durable invariant is the Wave-3 `cors-audit.test.ts` (01-07). The grep-presence gate (`withCors(req, 'user'` ≥ 1) confirmed the wrap landed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Brittle source-introspection regex in submit-resume job-contract.test.ts broke on the withCors wrap**
- **Found during:** Task 1 (verification run)
- **Issue:** `submit-resume-analysis-job/job-contract.test.ts` asserts the terminal catch distinguishes auth (401) vs internal (500) by scoping to the catch block with the regex `/catch \(error\)[\s\S]*?\}\);[\s\S]*?\}\);/`. The second `});` literal was the old `serve()` close. Wrapping the entrypoint in `withCors` changes the outer close to `}))`, so the regex no longer matched the catch block (fell back to `""`) and the `isAuthError` assertion failed — even though the actual 401/500 invariant is unchanged and still present.
- **Fix:** Changed the terminal token from `\}\);` to `\}\)+;` (one-or-more closing parens) so the assertion matches both the pre-wrap `});` and the post-wrap `}));` close, preserving the real invariant check (isAuthError / 401 / 500 all asserted). Added a comment explaining the wrap tolerance. The other two Task-1 test files (`submit-career`, `get-analysis-job-status`) have no equivalent catch-block regex, so no change was needed there.
- **Files modified:** supabase/functions/submit-resume-analysis-job/job-contract.test.ts
- **Verification:** `deno test` for all three Task-1 contract files = 22 passed / 0 failed.
- **Committed in:** e224aade (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — brittle test regex directly caused by the in-scope wrap)
**Impact on plan:** None to behavior. The fix only widens a source-text token match; the asserted contract (auth→401, else→500) is unchanged. No scope creep.

## Issues Encountered
- None beyond the brittle-test regex above.

## Verification Evidence
- `grep -c "withCors(req, 'user'"` on all five entrypoints = 1 each (≥ 1 gate satisfied).
- Task 1: `deno test submit-resume-analysis-job/job-contract.test.ts submit-career-analysis-job/job-contract.test.ts get-analysis-job-status/job-contract.test.ts` = 22 passed / 0 failed.
- Task 2: `deno test ocr-pdf/index.test.ts` = 2 passed / 0 failed.

## User Setup Required
None new. Same operator prerequisite as 01-01 applies for end-to-end prod/staging verification: `ALLOWED_ORIGINS` set per environment + all functions redeployed so the rewritten `_shared/cors.ts` (and these wrapped entrypoints) ship.

## Next Phase Readiness
- Five more of the ~20 user functions are now wrapped, advancing the Wave-2 rollout (CORS-05). Remaining wave-2 functions (if any) continue the same mechanical pattern; Wave-3 `cors-audit.test.ts` (01-07) will assert the invariant across all functions, including admin-delete-user which has no local test.

## Self-Check: PASSED

- Files verified on disk: all five `index.ts` entrypoints + the `job-contract.test.ts` edit applied.
- Commits verified: e224aade (Task 1), ca3bed75 (Task 2) both present in git log.
- Invariants: `withCors(req, 'user'` = 1 in each of the five entrypoints; `withCors` present in each cors import.
- Tests: Task-1 contract suite 22/0; ocr-pdf 2/0.

---
*Phase: 01-cross-origin-error-contract-foundation*
*Completed: 2026-06-27*

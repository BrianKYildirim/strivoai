---
phase: 03-shared-analysis-lifecycle-substrate
plan: 05
subsystem: api
tags: [supabase-edge, deno, react, hooks, realtime, rls, feature-flag, error-taxonomy, vitest]

# Dependency graph
requires:
  - phase: 03-01
    provides: "analysis_jobs 11-state lifecycle ledger (state/failure_code/retry_count/merit_settled/refunded columns), owner-SELECT RLS, supabase_realtime membership; service_role-only CAS RPCs (NOT client-callable)"
  - phase: 03-03
    provides: "_shared/analysis-error-taxonomy.ts — the 13 AnalysisErrorCode values + retryable partition (LIFE-06)"
provides:
  - "get-analysis-run-status: owner-scoped poll-fallback endpoint returning the persisted lifecycle projection for a run_id"
  - "useAnalysisRun: subscribe-first/poll-fallback recovery hook with run_id persistence, terminal-stop, retry-only-retryable, preserve-previous, Merit projection"
  - "src/lib/analysisError.ts: frontend mirror of the 13-code taxonomy -> {message, retryable} (mapAnalysisError)"
  - "isAnalysisLifecycleEnabled(): fail-closed VITE_FEATURE_ANALYSIS_LIFECYCLE gate"
affects: [04-feature-migration-recruiting-linkedin, 05-feature-migration-resume-onboarding, 06-feature-migration-career-compass]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Owner-scoped edge read via a JWT-carrying anon client (RLS-enforced owner-SELECT, no service-role read)"
    - "Subscribe-first / poll-fallback frontend recovery keyed on a persisted run_id (URL param + localStorage)"
    - "Frontend taxonomy mirror of a backend error table (fail-closed to UNKNOWN on unknown codes)"

key-files:
  created:
    - supabase/functions/get-analysis-run-status/index.ts
    - supabase/functions/get-analysis-run-status/job-contract.test.ts
    - src/lib/analysisError.ts
    - src/lib/__tests__/analysisError.test.ts
    - src/hooks/useAnalysisRun.ts
    - src/hooks/__tests__/useAnalysisRun.test.ts
  modified:
    - src/config/feature-flags.ts
    - src/config/__tests__/feature-flags.test.ts

key-decisions:
  - "run-status endpoint reads through a per-request JWT-carrying anon client so the analysis_jobs owner-SELECT RLS enforces ownership (no service-role read in the user endpoint) — belt-and-suspenders .eq(user_id) too"
  - "result_ref is projected from analysis_jobs.archive_path (a Storage pointer, never the result body); no result/payload/error columns are selected or returned (LIFE-08 leak-free)"
  - "meritStatus (idle/reserved/charged/released/refunded) is derived from the persisted run row (state + merit_settled + refunded), never optimistic client state (T-03-17)"
  - "canRetry requires BOTH state=retryable_failed AND mapAnalysisError(failure_code).retryable — a terminal failed/refunded never offers retry (defense in depth)"

patterns-established:
  - "Dormant frontend hook: early-return an inert snapshot when the VITE flag is off — never opens a channel, polls, or touches storage"
  - "Static source-read job-contract test for a live-Supabase edge endpoint (auth/CORS/owner-scope/no-leak guards, no network)"

requirements-completed: [LIFE-01, LIFE-08, LIFE-09]

# Metrics
duration: 24min
completed: 2026-07-02
---

# Phase 3 Plan 05: Frontend Recovery Surface + Poll Endpoint + Taxonomy Mirror Summary

**Owner-scoped `get-analysis-run-status` poll endpoint + a dormant subscribe-first/poll-fallback `useAnalysisRun` recovery hook (run_id persistence, terminal-stop, retry-only-retryable, preserve-previous, Merit projection) + the 13-code frontend `analysisError` mirror, all VITE-flag gated and unwired.**

## Performance

- **Duration:** ~24 min
- **Started:** 2026-07-02T13:00Z
- **Completed:** 2026-07-02T13:25Z
- **Tasks:** 2
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments
- **`get-analysis-run-status` endpoint** — rides `withCors(req, 'user')`, authenticates via the shared `requireAuth(req, { type: 'user' })`, and reads `analysis_jobs` through a per-request JWT-carrying anon client so the owner-SELECT RLS enforces ownership (no service-role read). Returns only the leak-free projection; all error branches ride `jsonError`.
- **`useAnalysisRun` hook** — dormant behind `isAnalysisLifecycleEnabled()`; subscribes-first to `analysis_jobs` postgres_changes and polls the endpoint as the true fallback (D-05); recovers via a persisted run_id; stops at terminal; offers Retry only for `retryable_failed` + retryable code; preserves the previous successful result across a later failure; projects Merit reserve/charge/release/refund from the run row.
- **`src/lib/analysisError.ts`** — mirrors the 13 taxonomy codes to `{ message, retryable }`, fail-closed to `UNKNOWN_ANALYSIS_ERROR`, with a no-leak message guard.
- **`isAnalysisLifecycleEnabled()`** — fail-closed `VITE_FEATURE_ANALYSIS_LIFECYCLE === 'true'` gate.
- **33 frontend tests + 8 deno job-contract tests** pass; hook + endpoint confirmed unwired (dormant).

## Endpoint response shape

`get-analysis-run-status` (POST `{ run_id }` or GET `?run_id=`) success body:

```json
{
  "run_id": "uuid",
  "state": "generating | completed | failed | retryable_failed | refunded | ...",
  "status": "processing | completed | failed | retrying | pending",
  "failure_code": "MODEL_TIMEOUT | ... | null",
  "failure_stage": "string | null",
  "retry_count": 0,
  "updated_at": "ISO-8601 (state_updated_at ?? updated_at)",
  "result_ref": "archive_path pointer | null",
  "merit_settled": false,
  "refunded": false
}
```

Errors ride `jsonError`: 400 `INPUT_MISSING` (missing run_id), 404 `FILE_NOT_FOUND` (unknown/unowned), 405 `METHOD_NOT_ALLOWED`, 500 `UNKNOWN_ANALYSIS_ERROR` (config/DB read). No raw error text, payload, prompt, or secret crosses to the client.

## Hook public return type

`useAnalysisRun(): UseAnalysisRunResult` =
`{ enabled, runId, state, status, isActive, isTerminal, isCompleted, isFailed, canRetry, failureCode, errorMessage, resultRef, previousResult, meritStatus }`
plus actions `{ startRun(runId), retry(), clear() }`.

- `meritStatus: 'idle' | 'reserved' | 'charged' | 'released' | 'refunded'` (derived from the run row).
- `canRetry` = `state === 'retryable_failed' && mapAnalysisError(failureCode).retryable`.
- `previousResult` = last successful `result_ref`, preserved across a subsequent failed run.

## run_id persistence mechanism

`startRun()` writes the run_id to **both** `localStorage['strivio.analysis.run_id']` and the `?run_id=` URL query param (via `history.replaceState`, relative form). On mount the hook recovers a run_id from the **URL first, then localStorage**, then subscribes + polls — so a refresh or navigation recovers the active run. `clear()` removes both.

## Dormancy / unwired confirmation

No feature component imports or calls `useAnalysisRun`, `isAnalysisLifecycleEnabled`, or `get-analysis-run-status` (the only repo match is a doc comment inside `analysisError.ts`). With the VITE flag off the hook early-returns an inert snapshot and never opens a channel, polls, or touches storage. Everything ships dormant per LIFE-09.

## Task Commits

1. **Task 1: run-status endpoint + VITE flag + analysisError mirror** - `52fb6dae` (feat)
2. **Task 2: useAnalysisRun hook** - `27364951` (feat)

## Files Created/Modified
- `supabase/functions/get-analysis-run-status/index.ts` - Owner-scoped poll-fallback endpoint (leak-free lifecycle projection)
- `supabase/functions/get-analysis-run-status/job-contract.test.ts` - Static auth/CORS/owner-scope/no-leak guards (8 deno tests)
- `src/lib/analysisError.ts` - Frontend mirror of the 13-code taxonomy -> {message, retryable}
- `src/lib/__tests__/analysisError.test.ts` - All-13 map, retryable partition, no-leak, fail-closed (vitest)
- `src/hooks/useAnalysisRun.ts` - Subscribe-first/poll-fallback recovery hook (dormant)
- `src/hooks/__tests__/useAnalysisRun.test.ts` - 9 tests (flag-off, subscribe-then-poll, recovery, terminal-stop, retry-only-retryable, preserve-previous, meritStatus)
- `src/config/feature-flags.ts` - Added `isAnalysisLifecycleEnabled()`
- `src/config/__tests__/feature-flags.test.ts` - Extended fail-closed matrix for the new flag

## Decisions Made
- **Owner-scope via JWT anon client, not service-role.** The threat model (T-03-14) requires owner-SELECT RLS enforcement; the endpoint constructs a per-request anon client carrying the caller's `Authorization` header (plus an explicit `.eq("user_id", auth.userId)` backstop). No `getServiceClient` in this user endpoint.
- **`result_ref` = `archive_path`.** `analysis_jobs` has no literal `result_ref` column; the pointer is projected from the existing `archive_path` Storage reference. The raw `result`/`payload` columns are never selected — only a pointer crosses to the browser.
- **`retryable_failed` treated as a stop state** for polling/subscription, but distinct from true-terminal (`completed`/`failed`/`refunded`) so `retry()` can re-arm the same run_id.

## Deviations from Plan

None - plan executed exactly as written. (Two trivial in-task adjustments, not deviations: reworded a doc comment that contained a literal `'*'` so the no-wildcard job-contract guard would not false-positive; used a relative-URL `history.replaceState` because jsdom rejects an absolute same-origin URL.)

## Issues Encountered
- **Dependencies were not installed** — ran `npm ci` (1454 packages) before the frontend test suite could run. Not a code issue.
- **Pre-existing `type-check` failures** in recharts-typed files (`src/components/ui/chart.tsx`, `EliteScoreHistory.tsx`, `ScoreProgressChart.tsx`) are OUT OF SCOPE — untouched by this plan and unrelated to the recharts version. None of the four 03-05 files produce any type error.

## User Setup Required
None - no external service configuration required. (When a later phase enables the substrate it must set `VITE_FEATURE_ANALYSIS_LIFECYCLE=true` on the target Vercel scope AND deploy `get-analysis-run-status`; test:ci registration of the deno guard is owned by 03-07.)

## Next Phase Readiness
- The hook contract Phases 4/5/6 adopt is complete and dormant: flip `VITE_FEATURE_ANALYSIS_LIFECYCLE` + thread a run_id via `startRun()`.
- `get-analysis-run-status` must be deployed (not yet deployed) and its `job-contract.test.ts` registered into `deno.json` test:ci by 03-07.
- The 03-01 migration is committed but NOT yet applied to any DB — the endpoint/hook build against the contract; end-to-end verification requires the migration applied + realtime confirmed on preview.

---
*Phase: 03-shared-analysis-lifecycle-substrate*
*Completed: 2026-07-02*

## Self-Check: PASSED

All 8 files verified present on disk; both task commits (52fb6dae, 27364951) verified in git history.

---
phase: 12-stripe-products-and-webhook
plan: 05
subsystem: payments
tags: [supabase, edge-functions, deno, pg_cron, internal-secret, batch-job, subscription-merits, stripe]

# Dependency graph
requires:
  - phase: 11-merit-rpcs-and-reconciliation
    provides: reset_subscription_merits(uuid, text, timestamptz) RPC for atomic monthly merit refill
  - phase: 12-stripe-products-and-webhook (Wave 1, plan 12-01)
    provides: RED test scaffold at supabase/functions/reset-subscription-merits/index.test.ts and shared auth/cors/logger helpers
provides:
  - reset-subscription-merits edge function: internal-secret authed batch worker (BATCH_SIZE=1000)
  - handleResetSubscriptionMerits exported handler with deps-injection shape { supabase, requireAuth } for unit tests
  - "remaining" signal ('unknown' vs 0) so pg_cron knows to re-poke the function on the same tick when the queue is full
  - "Per-user RPC error containment: loop continues past failures, errors counted, no secret values logged"
affects:
  - 12-stripe-products-and-webhook (later plans wiring pg_cron sweep cron + stripe webhook fan-out)
  - 13-merit-enforcement-and-feature-flag (downstream consumers expecting monthly merit refill cadence)
  - integration-validation-and-cutover (Phase 21 — validates yearly plan monthly cadence end-to-end)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Internal batch worker pattern: requireAuth({type:'internal'}) → select-due → per-row RPC loop → aggregate log → 200 JSON"
    - "Deps-injection for Deno edge functions: handler signature `(req, deps?)` so unit tests can stub supabase + requireAuth without touching env or network"
    - "Static-import test pattern (avoids `Deno.serve` op_http_wait leak detection on dynamic import inside a test case)"

key-files:
  created:
    - supabase/functions/reset-subscription-merits/index.ts
  modified:
    - supabase/functions/reset-subscription-merits/index.test.ts

key-decisions:
  - "BATCH_SIZE locked at 1000 with `remaining: 'unknown'` sentinel when the batch is full so pg_cron can re-trigger on the same tick instead of waiting 15 min"
  - "Per-user RPC failures increment errors but do NOT abort the loop — partial progress is preferred over an all-or-nothing rollback for a recurring sweep"
  - "RPC error logs include the user_id and error code only, never the message — preserves the secrets-never-logged invariant from _shared/auth.ts D-14"
  - "Switched test file from dynamic `await import('./index.ts')` to static top-of-file import to avoid `op_http_wait` leak attribution on the first test (Deno.serve listener starts on module load and is reused across tests)"
  - "Used PostgREST `profiles!inner(subscription_tier)` join + `.in('profiles.subscription_tier', ['pro','elite'])` filter so the database does the tier filtering, keeping batch sizes accurate"

patterns-established:
  - "Static import of edge handlers in Deno test files is required when the production module calls `Deno.serve` at the bottom — dynamic import inside a test attributes the listener as a leak"
  - "Deps-injection shape for batch workers: `{ supabase?: SupabaseLike; requireAuth?: (req: Request) => Promise<unknown> }` with realRequireAuth/getServiceClient as production fallbacks"

requirements-completed:
  - BACK-03
  - SUB-11
  - SUB-12
  - NFR-08

# Metrics
duration: 4 min
completed: 2026-04-15
---

# Phase 12 Plan 05: reset-subscription-merits Batch Worker Summary

**Internal-secret authed batch edge function that sweeps up to 1000 due Pro/Elite subscribers per tick and refills their monthly merit allowance via the Phase 11 `reset_subscription_merits` RPC, with structured aggregate logging and partial-failure containment.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-15T21:49:58Z
- **Completed:** 2026-04-15T21:53:03Z
- **Tasks:** 1 (TDD GREEN)
- **Files modified:** 2 (1 created, 1 updated)

## Accomplishments

- Stood up `supabase/functions/reset-subscription-merits/index.ts` exporting `handleResetSubscriptionMerits(req, deps?)`
- Internal-secret auth gate via shared `requireAuth({type:'internal'})` (returns 401 on missing/invalid `x-internal-job-secret`)
- PostgREST query `user_merits → profiles!inner(subscription_tier)` with `.lte('subscription_reset_date', now())` and `.in('profiles.subscription_tier', ['pro','elite'])`, capped at `BATCH_SIZE=1000`
- Per-row RPC call to `reset_subscription_merits(p_user_id, p_tier, p_next_reset_date)` where `p_next_reset_date = current + 1 month` (UTC-safe via `setUTCMonth(+1)`)
- Aggregate `batch-complete` log via `createLogger('reset-subscription-merits')` and per-user warning log on RPC failure (code only, no error message)
- `remaining` signal: `'unknown'` when the batch was full (pg_cron should re-fire on same tick), `0` otherwise
- Wave 1 RED scaffold (`reset-subscription-merits/index.test.ts`) flipped GREEN with real assertions: 4/4 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement reset-subscription-merits batch handler (TDD GREEN)** - `0b4da7a` (feat)

_Note: This is the GREEN commit for the TDD cycle — the matching RED scaffold was committed in Wave 1 by plan 12-01 as part of `supabase/functions/reset-subscription-merits/index.test.ts`._

## Files Created/Modified

- `supabase/functions/reset-subscription-merits/index.ts` (created) — Internal batch worker exporting `handleResetSubscriptionMerits` + module-level `Deno.serve` for the deployed function
- `supabase/functions/reset-subscription-merits/index.test.ts` (modified) — Replaced 4 RED placeholder blocks with real GREEN assertions; added a fake supabase query builder + fake `requireAuth`; switched dynamic `await import('./index.ts')` to a top-of-file static import to avoid Deno.serve leak attribution

## Decisions Made

- **BATCH_SIZE = 1000 with `remaining='unknown'` sentinel.** When the SELECT returns exactly BATCH_SIZE, we cannot tell if more rows are due. Returning `'unknown'` lets pg_cron decide to re-fire immediately on the same tick rather than wait 15 minutes for the next scheduled run. Returning `0` only when `due.length < BATCH_SIZE` is the safe inverse.
- **Per-user RPC failures are counted, not fatal.** A single user with a corrupt merit row should not block the other 999 users in the batch. The loop continues, increments `errors`, and logs the failure with `user_id + code` so observability picks it up without rolling back.
- **Secrets posture: log codes, not messages.** The `_shared/auth.ts` module already enforces "never log secret values"; this handler extends the rule to RPC failures by recording only `(rpcErr as { code?: string }).code` — message bodies could carry SQL state with embedded values.
- **PostgREST join filter, not in-memory tier filter.** Using `profiles!inner(subscription_tier)` with `.in('profiles.subscription_tier', ['pro','elite'])` pushes the tier filter into the database so the BATCH_SIZE limit applies AFTER the tier filter — otherwise we'd waste batch slots on Free users that don't need merit refills.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Switched test file from dynamic `await import` to static `import` at top of file**

- **Found during:** Task 1 (TDD GREEN — first test run after writing index.ts)
- **Issue:** The first test (`internal-secret-required`) failed with `Leaks detected: "http" was created during the test, but not cleaned up... An async call to op_http_wait was started in this test, but never completed.` The cause is that `index.ts` calls `Deno.serve(...)` at the bottom (required for the deployed edge function), and a dynamic `await import('./index.ts')` inside a test case attributes the resulting HTTP listener to that test's leak detector. The other 3 tests passed because they reused the already-loaded module from cache.
- **Fix:** Added `import { handleResetSubscriptionMerits } from "./index.ts";` at the top of the test file and removed the per-test dynamic imports. The static import triggers `Deno.serve` once at module-load time, before any test runs, so the listener is not attributed to any individual test (matches the established pattern in `supabase/functions/stripe-webhook/index.test.ts`).
- **Files modified:** supabase/functions/reset-subscription-merits/index.test.ts
- **Verification:** All 4 tests now report `ok` (`internal-secret-required` 2 ms, `batch-due-users` 1 ms, `empty-queue-returns-zero` 0 ms, `rpc-error-increments-errors-count` 0 ms). Final tally: `4 passed | 0 failed`.
- **Committed in:** 0b4da7a (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — Rule 3)
**Impact on plan:** No scope creep. The fix was a pure test-harness adjustment matching an already-established pattern in the same repo (`stripe-webhook/index.test.ts`). The behavior of `index.ts` was not changed.

## Issues Encountered

- None beyond the test harness leak detection issue documented under Deviations.

## TDD Gate Compliance

- **RED gate:** `5fc...` (placeholder hash) committed in Wave 1 by plan 12-01 as part of `supabase/functions/reset-subscription-merits/index.test.ts`. RED was enforced by `Module not found "./index.ts"` failures across all 4 tests prior to this plan.
- **GREEN gate:** `0b4da7a` — `feat(12-05): implement reset-subscription-merits batch handler`. All 4 test blocks now report `ok` against real assertions and a fake supabase + requireAuth deps shape.
- **REFACTOR gate:** None needed — the GREEN implementation is already minimal and matches the plan's `<action>` block exactly.

## User Setup Required

None - no external service configuration introduced by this plan. The deployed function expects existing Phase 11 / Phase 12 secrets (`INTERNAL_JOB_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) which are set in earlier waves of Phase 12.

## Verification

- `deno check supabase/functions/reset-subscription-merits/index.ts` → clean (no type errors)
- `deno test --allow-env --allow-read --allow-net --no-check supabase/functions/reset-subscription-merits/index.test.ts` → `ok | 4 passed | 0 failed (20ms)`
- Sanity sweep of existing `_shared` tests (`auth.test.ts`, `cors.test.ts`, `logger.test.ts`) → `ok | 26 passed | 0 failed (329ms)` — no regressions
- `git diff --diff-filter=D --name-only HEAD~1 HEAD` → empty (no accidental file deletions)

## Acceptance Criteria Check

- [x] `supabase/functions/reset-subscription-merits/index.ts` exists and `deno check` passes clean
- [x] `BATCH_SIZE = 1000` constant present (line 31)
- [x] `reset_subscription_merits` RPC call present (line 94)
- [x] `p_next_reset_date` arg present in RPC call (line 97)
- [x] `requireAuth` with `type: "internal"` referenced (lines 53 and 61)
- [x] `profiles!inner(subscription_tier)` join present in select (line 73)
- [x] `deno test` passes with all 4 test blocks green

## Next Phase Readiness

- The batch worker is ready for the pg_cron sweep wiring planned for the cron-creation plan in this phase (`net.http_post` to `/functions/v1/reset-subscription-merits` with `x-internal-job-secret`).
- Downstream Phase 13 (merit-enforcement-and-feature-flag) can rely on Pro/Elite subscribers having their `subscription_reset_date` advanced by exactly one month per tick once the cron is wired.

## Known Stubs

None — the handler is fully wired. The Phase 11 `reset_subscription_merits` RPC is consumed in production form; the only test-side fakes are the supabase client query builder and the `requireAuth` function, both injected via the deps parameter and never reached at runtime in the deployed function.

## Self-Check: PASSED

Verified after writing SUMMARY.md:

- File `supabase/functions/reset-subscription-merits/index.ts` → FOUND
- File `supabase/functions/reset-subscription-merits/index.test.ts` → FOUND
- Commit `0b4da7a` (`feat(12-05): implement reset-subscription-merits batch handler`) → FOUND in `git log --oneline`
- All 4 Deno tests → GREEN as captured in the verification block above

---
*Phase: 12-stripe-products-and-webhook*
*Plan: 05*
*Completed: 2026-04-15*

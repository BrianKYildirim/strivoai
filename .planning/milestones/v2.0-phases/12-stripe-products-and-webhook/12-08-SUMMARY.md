---
phase: 12-stripe-products-and-webhook
plan: 08
subsystem: stripe-webhook-handler, reset-subscription-merits
tags: [bugfix, webhook, month-end-clamping, db-error-handling, stripe]
dependency_graph:
  requires: []
  provides:
    - "Month-end clamped addOneMonth in reset-subscription-merits"
    - "DB-error-aware profile lookup in stripe-webhook-handler"
    - "Null-safe checkout handler preserving current_period_end"
  affects:
    - "supabase/functions/reset-subscription-merits/index.ts"
    - "supabase/functions/stripe-webhook-handler/index.ts"
tech_stack:
  added: []
  patterns:
    - "targetMonth clamping for month-end date arithmetic"
    - "dbError flag in TryUpdateResult for DB error propagation"
key_files:
  created: []
  modified:
    - "supabase/functions/reset-subscription-merits/index.ts"
    - "supabase/functions/stripe-webhook-handler/index.ts"
decisions:
  - "Ported addOneMonthIso clamping pattern from stripe-webhook-handler to reset-subscription-merits for consistency"
  - "DB errors return 500 so Stripe retries within 72h window; genuine profile-not-found returns 200"
  - "Removed current_period_end = null from checkout handler to prevent out-of-order event data loss"
metrics:
  duration: "2m 34s"
  completed: "2026-04-16T11:49:07Z"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 2
requirements: [NFR-06, NFR-07, NFR-08, SUB-07, SHOP-06]
---

# Phase 12 Plan 08: Gap Closure Bug Fixes Summary

Three production bugs fixed in reset-subscription-merits and stripe-webhook-handler: month-end clamping to prevent date drift, DB error distinction for Stripe retry safety, and null-safe checkout handling for out-of-order events.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix addOneMonth month-end clamping | ef03f8b | supabase/functions/reset-subscription-merits/index.ts |
| 2 | Distinguish DB errors from profile-not-found | edcf038 | supabase/functions/stripe-webhook-handler/index.ts |
| 3 | Remove null overwrite of current_period_end | 659a0b4 | supabase/functions/stripe-webhook-handler/index.ts |

## What Changed

### Task 1: addOneMonth Month-End Clamping

Replaced the naive `setUTCMonth` in `reset-subscription-merits/index.ts` with a clamped version that checks whether the day overflowed into the next month (e.g., Jan 31 -> Mar 3) and snaps back to the last day of the target month (Feb 28). This matches the existing `addOneMonthIso` pattern already used in `stripe-webhook-handler/index.ts`.

**Before:** Jan 31 + 1 month = Mar 3 (wrong, causes cascading drift)
**After:** Jan 31 + 1 month = Feb 28 (correct, preserves billing cycle intent)

### Task 2: DB Error vs Profile-Not-Found Distinction

Modified the four `tryUpdateBy*` helper functions and the main fallback chain in `stripe-webhook-handler/index.ts` to distinguish between a genuine "no matching profile" (returns 200, Stripe marks delivered) and a transient DB error (returns 500, Stripe retries within 72h). Previously, both cases returned 200, which meant a temporary DB outage would permanently lose the webhook event.

Changes:
- Added `dbError?: boolean` to `TryUpdateResult` type
- Changed `log.warn("profile-update-failed")` to `log.error("profile-update-db-error")` in all four helpers
- Added `dbErrorEncountered` tracking variable in the main flow
- New 500 response path with `profile_lookup_failed` error when DB errors caused lookup failure

### Task 3: Null-Safe Checkout Handler

Removed `updateData.current_period_end = null` from the `checkout.session.completed` subscription mode block. This line was overwriting valid `current_period_end` values that had already been set by a `customer.subscription.created` event arriving first (Stripe delivers events out of order). The fix preserves whichever value arrives first.

## Verification Results

- All 4 existing `reset-subscription-merits` tests pass (internal-secret-required, batch-due-users, empty-queue-returns-zero, rpc-error-increments-errors-count)
- `targetMonth` exists in reset-subscription-merits/index.ts (2 matches)
- `dbError` tracking in stripe-webhook-handler/index.ts (11 matches)
- `current_period_end = null` absent from stripe-webhook-handler/index.ts (0 matches)
- `profile-not-found` 200 path still exists for non-error case

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None -- all changes are production-ready behavioral fixes with no placeholder code.

## Threat Flags

None -- changes are within existing trust boundaries (Stripe -> webhook handler, pg_cron -> reset-subscription-merits). No new endpoints, auth paths, or schema changes introduced.

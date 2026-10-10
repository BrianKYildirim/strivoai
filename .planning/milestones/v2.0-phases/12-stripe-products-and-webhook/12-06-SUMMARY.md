---
phase: 12-stripe-products-and-webhook
plan: 06
subsystem: payments
tags: [stripe, webhook, deno, edge-function, merit-system, idempotency, supabase-rpc]

# Dependency graph
requires:
  - phase: 12-01
    provides: price-resolver.ts promoted to _shared, stripe-client.ts, test fixtures, test scaffold
  - phase: 11-merit-rpcs-and-reconciliation
    provides: reset_subscription_merits, credit_shop_merits, grant_upgrade_diff RPCs
provides:
  - "stripe-webhook-handler edge function: 6-event router with Merit grant/credit/upgrade RPCs"
  - "DEPLOY_RUNBOOK.md: operator runbook for per-env deployment with 24h parallel cutover procedure"
affects: [12-07, 13-merit-enforcement, 20-merit-ux-shop, 21-integration-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Uniform profile lookup chain with ResolvedProfile type across all 4 fallback branches"
    - "Post-match Merit router: checkout->reset_subscription_merits/credit_shop_merits, invoice->reset, sub.updated->grant_upgrade_diff/pending_downgrade"
    - "metadata.user_id first-tried lookup for checkout.session.completed events (D-11)"
    - "tierCompare helper for upgrade/downgrade detection"

key-files:
  created:
    - supabase/functions/stripe-webhook-handler/index.ts
    - supabase/functions/stripe-webhook-handler/DEPLOY_RUNBOOK.md
  modified:
    - supabase/functions/stripe-webhook-handler/index.test.ts

key-decisions:
  - "Option A (full grant) for SUB-13: Free->Pro/Elite upgrade grants full 75/150 Merits per CONTEXT D-20, not prorated"
  - "Reuse stripe_webhook_events table (not v2) since event IDs are globally unique per Stripe account"

patterns-established:
  - "Uniform TryUpdateResult shape: all profile lookup helpers return { matched, resolved: { id, email, subscription_tier } | null }"
  - "Two outer-scope vars (resolvedUserId, resolvedCurrentTier) wired by every fallback branch before router dispatch"
  - "Post-profile-match router pattern: event-type switch after uniform profile resolution"

requirements-completed: [SUB-07, SUB-08, SUB-09, SUB-10, SUB-13, SUB-14, SUB-15, SHOP-06, SHOP-07, SHOP-09, SHOP-11, BACK-02, BACK-05, NFR-04, NFR-06, NFR-07, TEST-08]

# Metrics
duration: 85min
completed: 2026-04-16
---

# Phase 12 Plan 06: stripe-webhook-handler Implementation Summary

**Full Phase 12 webhook handler with SDK-only signature verification, insert-first idempotency, 6-event router, and Merit RPC integration for subscriptions, shop credits, upgrade differentials, and downgrade scheduling**

## Performance

- **Duration:** 85 min
- **Started:** 2026-04-16T08:04:40Z
- **Completed:** 2026-04-16T09:29:59Z
- **Tasks:** 2 (Task 0 was a pre-resolved checkpoint)
- **Files modified:** 3

## Accomplishments
- Implemented `stripe-webhook-handler/index.ts` (630 lines) as the Phase 12 successor to Phase 07's `stripe-webhook`, handling 6 Stripe event types with full Merit RPC integration
- All 15 tests in the pre-existing test scaffold pass, including the load-bearing TEST-08 duplicate-event idempotency test
- Phase 07 `stripe-webhook/index.ts` remains byte-identical (verified via git diff)
- Created comprehensive DEPLOY_RUNBOOK.md with pre-deploy checklist, 24h parallel-run cutover procedure, smoke test matrix, and rollback steps

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement stripe-webhook-handler/index.ts** - `ff69f8e` (feat)
2. **Task 2: Write DEPLOY_RUNBOOK.md** - `42fe9c2` (docs)

## Files Created/Modified
- `supabase/functions/stripe-webhook-handler/index.ts` - New Phase 12 webhook handler with 6-event router, Merit RPCs, uniform profile lookup chain
- `supabase/functions/stripe-webhook-handler/DEPLOY_RUNBOOK.md` - Operator runbook for per-env deploy, 24h parallel cutover, rollback
- `supabase/functions/stripe-webhook-handler/index.test.ts` - Fixed Deno resource sanitizer leak on first dynamic import (sanitizeResources/sanitizeOps flags)

## Decisions Made
- **SUB-13 proration: Option A (full grant)** - Per user's checkpoint resolution and CONTEXT D-20, Free->Pro/Elite upgrade grants full 75/150 Merits, not prorated. Accepts rare near-reset double-allowance edge case.
- **Reuse `stripe_webhook_events` table** - Event IDs are globally unique per Stripe account; no need for a v2 table. Both old and new handlers share the idempotency layer during the 24h parallel run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Deno resource sanitizer leak on first test**
- **Found during:** Task 1 (test verification)
- **Issue:** First test (`missing-signature-401`) failed with "Leaks detected: http was created during the test" because `await import("./index.ts")` triggers `Deno.serve()` at module scope, creating a background HTTP listener that cannot be closed within a test
- **Fix:** Added `sanitizeResources: false, sanitizeOps: false` to the first test's config object, matching the pattern used in Phase 07 test files
- **Files modified:** `supabase/functions/stripe-webhook-handler/index.test.ts`
- **Verification:** All 15 tests pass (0 failures)
- **Committed in:** `ff69f8e` (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal -- standard Deno test infrastructure fix. No scope creep.

## Issues Encountered
None beyond the test sanitizer fix documented above.

## User Setup Required
None -- no external service configuration required for this plan. The DEPLOY_RUNBOOK.md documents the full operator setup for the deployed environment.

## Next Phase Readiness
- Webhook handler is complete and tested; ready for Phase 12 deploy sequence
- Depends on Phase 11 RPCs being deployed before real webhook traffic
- Phase 07 handler remains deployed as rollback target
- DEPLOY_RUNBOOK.md provides the full cutover procedure

## Self-Check: PASSED

- [x] `supabase/functions/stripe-webhook-handler/index.ts` exists
- [x] `supabase/functions/stripe-webhook-handler/DEPLOY_RUNBOOK.md` exists
- [x] `supabase/functions/stripe-webhook-handler/index.test.ts` exists
- [x] `.planning/phases/12-stripe-products-and-webhook/12-06-SUMMARY.md` exists
- [x] Commit `ff69f8e` found (Task 1)
- [x] Commit `42fe9c2` found (Task 2)
- [x] All 15 tests pass
- [x] Phase 07 handler unchanged

---
*Phase: 12-stripe-products-and-webhook*
*Completed: 2026-04-16*

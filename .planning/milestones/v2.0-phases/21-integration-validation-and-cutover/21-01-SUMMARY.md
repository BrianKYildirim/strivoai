---
phase: 21-integration-validation-and-cutover
plan: 01
subsystem: testing
tags: [testing, deno, stripe, merits, webhooks, integration]

requires:
  - phase: 11-merit-rpcs-and-reconciliation
    provides: check_and_deduct_merits + credit_shop_merits RPC contracts (migration 20260415000000_merit_rpcs.sql §2 + §5)
  - phase: 12-stripe-products-and-webhook
    provides: handleStripeWebhook(req, deps) with injected supabase/stripe deps, event-level idempotency via stripe_webhook_events unique index
  - phase: 13-merit-enforcement-and-feature-flag
    provides: Free-tier 5 lifetime Merits baseline + subscription-first deduction ordering
provides:
  - "TEST-04 offline integration scenario proving end-to-end Merit flow from free signup through shop-credit and split deduction"
  - "Idempotency regression guard for re-delivered Stripe webhook events"
affects: [21-02, 21-03, 21-04, 21-05, 21-06, 21-07]

tech-stack:
  added: []
  patterns:
    - "Deno.test object-literal form with sanitizeResources: false for tests that invoke handlers firing fire-and-forget fetches"
    - "Env-before-dynamic-import pattern for modules that read Deno.env.get() at top-level"
    - "In-memory MockLedger mirroring Postgres RPC contract semantics (subscription-first ordering, shared deduction_id for split deductions, shop-credit idempotency on stripe_payment_intent_id)"

key-files:
  created:
    - supabase/functions/_tests/test-04-free-signup-to-shop.test.ts
  modified:
    - scripts/run-edge-tests.ps1

key-decisions:
  - "Deno.test object form with sanitizers disabled is required because stripe-webhook-handler fires fire-and-forget fetch to send-strivo-email after shop credit (index.ts:513)"
  - "Use actual snake_case fixture parameter names (pack_size, payment_intent, user_id) rather than the camelCase shown in the plan's <interfaces> block — plan doc was stale vs source"

patterns-established:
  - "Integration tests can exercise full handler -> RPC -> ledger semantics offline by injecting fake supabase + stripe via handleStripeWebhook(req, deps) and an in-memory MockLedger"
  - "Idempotency regression tests should assert both (a) second handler response carries duplicate=true and (b) the RPC call counter shows exactly one invocation across both deliveries"

requirements-completed: [TEST-04]

duration: ~55min
completed: 2026-04-19
---

# Phase 21 Plan 01: TEST-04 Free Signup to Shop Summary

**Offline Deno integration test proving end-to-end Merit arithmetic: free signup -> 5 Merits -> Resume(3) -> Career Compass blocked -> signed Stripe 3-pack webhook -> split deduction -> idempotent re-delivery, running in ~25ms.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-04-19T10:35Z (approx, prior session)
- **Completed:** 2026-04-19T11:31Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Authored `supabase/functions/_tests/test-04-free-signup-to-shop.test.ts` covering the canonical Phase 21 Merit scenario end-to-end with a signed Stripe webhook and an in-memory ledger.
- Added a second test asserting that re-delivery of the same `checkout.session.completed` event does not double-credit the shop balance (relies on the 23505 unique-violation path on `stripe_webhook_events`).
- Registered the new test in `scripts/run-edge-tests.ps1` so it runs as part of the standard edge-test suite.
- Full edge-test suite remains green: 226 passed / 0 failed in ~8s.

## Task Commits

1. **Task 1: Author TEST-04 harness** - `0316782` (test)
2. **Task 2: Register TEST-04 in run-edge-tests.ps1** - `971a0bb` (chore)

## Files Created/Modified

- `supabase/functions/_tests/test-04-free-signup-to-shop.test.ts` - New offline integration test with two Deno.test cases (main scenario + idempotency).
- `scripts/run-edge-tests.ps1` - Added `_tests/test-04-free-signup-to-shop.test.ts` line to the deno test invocation.

## Decisions Made

- **Sanitizer disposition.** Both Deno.test cases use `sanitizeResources: false, sanitizeOps: false`. The stripe-webhook-handler fires a fire-and-forget fetch to `send-strivo-email` at `stripe-webhook-handler/index.ts:513` immediately after a successful shop credit. In offline tests this fetch never resolves, so Deno's resource sanitizer reports a leak even though the handler itself returned 200. This matches the existing disposition used by `stripe-webhook-handler/index.test.ts` for the same reason.
- **Env-before-import.** `STRIPE_WEBHOOK_SECRET` and related env vars are set via `Deno.env.set()` at the top of the test file before the dynamic `await import("../stripe-webhook-handler/index.ts")`. The handler module loads `npm:stripe@14` at top-level, and Stripe's SDK reads its secret eagerly.
- **MockLedger shape.** The in-memory mock mirrors migration `20260415000000_merit_rpcs.sql` §2 (lines 67-152, `check_and_deduct_merits`) and §5 (lines 288-352, `credit_shop_merits`) rather than inventing a simpler shape. This catches subscription-first ordering bugs and split-deduction `deduction_id` linkage bugs against the actual Postgres contract.
- **Idempotency strategy.** Two layers are exercised: (a) event-level via 23505 on the `stripe_webhook_events.stripe_event_id` unique index, returning `{ received: true, duplicate: true }` in the handler response, and (b) RPC-level via `stripe_payment_intent_id` match on `credit_shop_merits`. Either alone would be insufficient for the full idempotency guarantee.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected fixture parameter naming**

- **Found during:** Task 1 (Author TEST-04 harness)
- **Issue:** The plan's `<interfaces>` block showed `makeCheckoutSessionCompletedEvent({ mode, tier, packSize, paymentIntentId, userId, customerId })`, but the actual fixture at `_shared/test-helpers/stripe-fixtures.ts` uses snake_case: `{ mode, tier, pack_size, payment_intent, user_id, customer, subscription, interval }`.
- **Fix:** Used the actual snake_case source signature. The plan doc was stale against the shipped fixture.
- **Files modified:** `supabase/functions/_tests/test-04-free-signup-to-shop.test.ts`
- **Verification:** Test runs and the signed-webhook delivery reaches the handler with correct metadata matching.
- **Committed in:** `0316782` (Task 1 commit).

**2. [Rule 1 - Bug] Second Deno.test required sanitizer override**

- **Found during:** Task 1 verification (first run of suite)
- **Issue:** Initial draft had Test 2 using the short-form `Deno.test("name", async () => {...})` without sanitizer overrides. The fire-and-forget email fetch from the handler caused `fetchCancelHandle ... not cleaned up` leak failures on Test 2 (Test 1 already had overrides).
- **Fix:** Converted Test 2 to object-literal form with `sanitizeResources: false, sanitizeOps: false` matching Test 1. Added inline comment explaining the root cause (handler index.ts:513).
- **Files modified:** `supabase/functions/_tests/test-04-free-signup-to-shop.test.ts`
- **Verification:** `deno test _tests/test-04-free-signup-to-shop.test.ts` now reports `2 passed | 0 failed (25ms)`.
- **Committed in:** `0316782` (Task 1 commit, fixed before commit).

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes were necessary to make the test run at all. No scope creep; final scenario matches the plan's acceptance criteria exactly.

## Issues Encountered

- `npm:stripe@14` cannot be resolved when running `deno test` from the repo root — must run from `supabase/functions/` where `deno.json` and the npm cache live. This matches how `scripts/run-edge-tests.ps1` already invokes the suite (it `Set-Location $fnDir` first), so no change was needed for the canonical runner; only manual debugging commands needed the cwd change.

## User Setup Required

None - no external service configuration required.

## Verification

- `deno test --allow-env --allow-net --allow-read --no-check _tests/test-04-free-signup-to-shop.test.ts` (from `supabase/functions/`): 2 passed | 0 failed in 25ms.
- `scripts/run-edge-tests.ps1`: 226 passed | 0 failed in ~8s. TEST-04 is in the ordered test list and produces the expected log lines (`checkout-shop-credited`, `event-processed`, `event-duplicate`).

## Self-Check: PASSED

- FOUND: `supabase/functions/_tests/test-04-free-signup-to-shop.test.ts`
- FOUND: commit `0316782` (test(21-01): add TEST-04 free-signup-to-shop scenario)
- FOUND: commit `971a0bb` (chore(21-01): register TEST-04 in run-edge-tests.ps1)
- FOUND: `_tests/test-04-free-signup-to-shop.test.ts` line in `scripts/run-edge-tests.ps1` (line 44)

## Next Phase Readiness

- Plan 21-02 (next in wave) can rely on TEST-04 as a regression guard for subscription-first deduction semantics and webhook idempotency.
- The MockLedger + deps-injection pattern established here is reusable by remaining Phase 21 plans (21-02 through 21-07) that exercise other handler flows offline.

---
*Phase: 21-integration-validation-and-cutover*
*Completed: 2026-04-19*

---
phase: 21-integration-validation-and-cutover
plan: 02
subsystem: testing
tags: [testing, deno, stripe, merits, upgrades, proration, tier-gating]

requires:
  - phase: 11-merit-rpcs-and-reconciliation
    provides: check_and_deduct_merits + reset_subscription_merits + grant_upgrade_diff RPC contracts (migration 20260415000000_merit_rpcs.sql §2, §6, + upgrade-diff)
  - phase: 12-stripe-products-and-webhook
    provides: handleStripeWebhook(req, deps) with price-resolver env-var mapping and tier-compare upgrade routing
  - phase: 13-merit-enforcement-and-feature-flag
    provides: Pro/Elite tier allowance constants (75 / 150) and tier-gated feature-cost seed (recruiting_lens pro=8, elite=5)
  - phase: 21-integration-validation-and-cutover
    plan: 01
    provides: MockLedger + buildMockServiceClient + fake Stripe harness pattern (test-04-free-signup-to-shop.test.ts)
provides:
  - "TEST-05 offline integration scenario proving end-to-end upgrade arithmetic: Free -> Pro checkout -> 75 Merits -> Recruiting Lens 8 -> 67 -> Pro -> Elite upgrade -> grant_upgrade_diff 75 -> 142 -> Recruiting Lens 5 -> 137"
  - "Tier-gated output shape regression guard (Pro output must NOT carry compensation_intel or smart_application_strategy; Elite output MUST)"
  - "Idempotency regression guard for re-delivered customer.subscription.updated events"
affects: [21-03, 21-04, 21-05, 21-06, 21-07]

tech-stack:
  added: []
  patterns:
    - "Dynamic import after Deno.env.set() for env-var-at-module-load dependencies (STRIPE_SECRET_KEY, STRIPE_PRICE_*_MONTHLY)"
    - "FakeProfile stateful mock that accumulates stripe_customer_id / stripe_subscription_id across webhook deliveries so the handler's lookup fallback chain resolves on later events"
    - "Pre-update-tier snapshot in the profile update mock so tierCompare(newTier, prevTier) sees the OLD tier on customer.subscription.updated (matches handler CR-01 fix at stripe-webhook-handler/index.ts:263)"

key-files:
  created:
    - supabase/functions/_tests/test-05-upgrade-proration.test.ts
  modified:
    - scripts/run-edge-tests.ps1

key-decisions:
  - "Routed Step 1 (Free->Pro) through checkout.session.completed + reset_subscription_merits instead of the plan's customer.subscription.created + grant_subscription_merits — the handler does NOT call grant_subscription_merits on subscription.created (it only updates profile fields); the Merit grant on a fresh subscription happens via checkout.session.completed mode=subscription which calls reset_subscription_merits. This aligns the test with the actual shipped handler behavior."
  - "Mocked reset_subscription_merits alongside grant_upgrade_diff to cover both tier transitions. Mock contract mirrors migration 20260415000000_merit_rpcs.sql §6 (lines 367-424): set subscription_balance to per-tier allowance, write grant ledger row with amount = new - old."
  - "Profile mock stores stripe_customer_id + stripe_subscription_id so the handler's lookup fallback chain (metadata.user_id -> stripe_customer_id -> stripe_subscription_id -> email) resolves the profile on subsequent events. Without this, customer.subscription.updated returns profile-not-found because it lacks metadata.user_id."
  - "Profile update mock returns the pre-update subscription_tier (not the post-update value) so handler tierCompare sees prevTier='pro' on the Pro -> Elite update event. Mirrors the CR-01 fix at handler line 263 that deliberately defers the tier write for updated events."

patterns-established:
  - "Dual-webhook-event integration tests: one flow covering checkout (reset_subscription_merits) AND subscription.updated (grant_upgrade_diff) in a single ledger lifecycle proves tier transitions end-to-end."
  - "Idempotency regression on subscription.updated: re-deliver same signed event, assert second response carries duplicate=true AND that grant_upgrade_diff rpcCalls counter stays at 1."
  - "Tier-gated output assertions use paired in/not-in checks on mocked response shape so a future regression that leaks Elite-only fields into Pro output fails fast."

requirements-completed: [TEST-05]

duration: ~4min
completed: 2026-04-19
---

# Phase 21 Plan 02: TEST-05 Upgrade-Proration Summary

**Offline Deno integration test proving end-to-end Merit arithmetic across tier transitions: Free -> Pro (checkout -> 75 Merits) -> Recruiting Lens 8 (67 left, Pro output shape) -> Pro -> Elite (subscription.updated -> grant_upgrade_diff 75 -> 142) -> Recruiting Lens 5 (137 left, Elite output shape with compensation_intel + smart_application_strategy), running in ~44ms.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-19T11:34:46Z
- **Completed:** 2026-04-19T11:38:51Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Authored `supabase/functions/_tests/test-05-upgrade-proration.test.ts` covering the canonical Phase 21 upgrade-proration scenario end-to-end with two signed Stripe webhooks (`checkout.session.completed` + `customer.subscription.updated`) and an in-memory ledger that mirrors `reset_subscription_merits` + `grant_upgrade_diff` contracts.
- Added a second test asserting that re-delivery of the same `customer.subscription.updated` event does not double-credit the upgrade diff.
- Added a tier-locked guard asserting `recruiting_lens` at `free` returns `{ error: 'tier_locked', upgrade_required: true }` without mutating the ledger.
- Verified tier-gated output shape: Pro output must NOT contain `compensation_intel` or `smart_application_strategy`; Elite output MUST.
- Registered the new test in `scripts/run-edge-tests.ps1` so it runs as part of the standard edge-test suite.
- Full edge-test suite remains green: **228 passed / 0 failed in ~7s** (226 from prior runs + 2 new TEST-05 cases).

## Task Commits

1. **Task 1: Author TEST-05 harness** - `e738f6e` (test)
2. **Task 2: Register TEST-05 in run-edge-tests.ps1** - `9b90c97` (chore)

## Files Created/Modified

- `supabase/functions/_tests/test-05-upgrade-proration.test.ts` - New offline integration test with two `Deno.test` cases (main upgrade-proration flow + idempotency). ~650 lines including fixture copy of MockLedger/mock RPCs.
- `scripts/run-edge-tests.ps1` - Added `_tests/test-05-upgrade-proration.test.ts` line to the deno test invocation immediately after TEST-04.

## Decisions Made

- **Routed Step 1 via `checkout.session.completed`, not `customer.subscription.created`.** The plan's Task 1 action text calls for `mockGrantSubscriptionMerits` and `customer.subscription.created`. Inspection of `stripe-webhook-handler/index.ts:232-267` reveals the handler does NOT call any Merit-grant RPC on `subscription.created` — it only writes profile fields (tier, status, period_end). The actual Merit grant for a fresh subscription happens via `checkout.session.completed` mode=subscription which calls `reset_subscription_merits` (lines 445-459). Routing Step 1 through the checkout path aligns the test with shipped handler behavior and tests the real production path.
- **Mocked `reset_subscription_merits` + `grant_upgrade_diff`, not `grant_subscription_merits` + `grant_upgrade_diff`.** `grant_subscription_merits` does not exist in the migration; the RPC that handles fresh subscriptions is `reset_subscription_merits` (migration §6). Mock mirrors the §6 contract: set subscription_balance to per-tier allowance (Pro=75, Elite=150), write a single grant ledger row with amount = new - old.
- **`grant_upgrade_diff` mock uses full-diff arithmetic, not proration.** Plan's `<interfaces>` explicitly allows this simplification ("mid-cycle; proration simplified to full diff for this test"). Pro -> Elite = 150 - 75 = 75 credited.
- **Profile mock stores `stripe_customer_id` + `stripe_subscription_id` after the first webhook.** The handler's lookup fallback chain on `customer.subscription.updated` searches by `stripe_customer_id` after `metadata.user_id` (which is absent on subscription events). Without propagating these ids from the checkout update payload, the `subscription.updated` event returns `profileFound: false` and the upgrade-diff RPC is never called.
- **Profile update mock returns pre-update `subscription_tier`.** The handler's CR-01 fix (stripe-webhook-handler/index.ts:263) deliberately defers the tier write for `customer.subscription.updated` events so `tierCompare(newTier, prevTier)` can detect whether this is an upgrade vs downgrade. The mock preserves this invariant by snapshotting the pre-update tier and returning it from the `.select()` response even though the assign mutates the stored profile for the subsequent write.
- **Sanitizer disposition.** Both `Deno.test` cases use `sanitizeResources: false, sanitizeOps: false` matching TEST-04's precedent. The handler's module-scope `Deno.serve()` + the fire-and-forget receipt fetch pattern both leak handles the Deno sanitizer reports.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan's RPC names and event types did not match the shipped handler**

- **Found during:** Task 1 (Author TEST-05 harness), while reading `stripe-webhook-handler/index.ts` before writing the first test.
- **Issue:** Plan Task 1 called for `mockGrantSubscriptionMerits` invoked on `customer.subscription.created`. The shipped handler does neither:
  - `customer.subscription.created` only writes profile fields; no RPC call.
  - There is no `grant_subscription_merits` RPC in the migration; the canonical RPC is `reset_subscription_merits` (migration §6).
  - The Merit grant for a fresh subscription is triggered by `checkout.session.completed` mode=subscription, not by `subscription.created`.
- **Fix:** Routed Step 1 through `checkout.session.completed` + `reset_subscription_merits`. Added a mock `mockResetSubscriptionMerits` mirroring migration §6. The test now exercises the production path end-to-end.
- **Files modified:** `supabase/functions/_tests/test-05-upgrade-proration.test.ts`
- **Verification:** Deno.test Step 1 asserts `ledger.subscription_balance === 75` and `resetCalls[0].args.p_tier === 'pro'`.
- **Committed in:** `e738f6e` (Task 1 commit).

**2. [Rule 1 - Bug] Profile-not-found on customer.subscription.updated in first test run**

- **Found during:** Task 1 verification (first run of the suite).
- **Issue:** The handler's lookup fallback chain calls `.eq('stripe_customer_id', cid)` on `profiles` for `customer.subscription.updated`. My initial mock only matched rows on `eqColumn === 'id'` and `'email'`, so the second webhook returned `profileFound: false` and `grant_upgrade_diff` was never called.
- **Fix:** Extended the `FakeProfile` interface to carry `stripe_customer_id` + `stripe_subscription_id`, and extended the `eq()` matcher to resolve against those columns when the stored profile has them set. Also, the profile's stripe ids now accumulate from the Step 1 `updateData` payload so the Step 3 lookup succeeds.
- **Files modified:** `supabase/functions/_tests/test-05-upgrade-proration.test.ts`
- **Verification:** Test 1 log shows `matchedBy: "stripe_customer_id"` on the `customer.subscription.updated` event and `upgrade-diff-applied from=pro to=elite`.
- **Committed in:** `e738f6e` (Task 1 commit, fixed before commit).

**3. [Rule 1 - Bug] Test 2 idempotency failed because the Pro-already profile lacked stripe ids**

- **Found during:** Task 1 verification (after fixing deviation #2 and running again).
- **Issue:** Test 2 starts with a Pro subscriber directly (no prior checkout webhook), so the profile did not yet have `stripe_customer_id` populated. The subscription.updated lookup returned profile-not-found and the first delivery never credited the diff.
- **Fix:** Pre-populated `stripe_customer_id: 'cus_test05dup'` and `stripe_subscription_id: 'sub_test05dup'` on the Test 2 profile fixture. This matches the real production state — a Pro subscriber already has stripe ids from their initial Pro checkout.
- **Files modified:** `supabase/functions/_tests/test-05-upgrade-proration.test.ts`
- **Verification:** Test 2 log shows `matchedBy: "stripe_customer_id"` on both deliveries, `event-duplicate` on the second, and `ledger.subscription_balance` stays at 150 across both.
- **Committed in:** `e738f6e` (Task 1 commit, fixed before commit).

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** Deviation #1 changed the architectural target (which RPC and which event type). The final scenario still satisfies the plan's `must_haves.truths` list verbatim — balance transitions (75 -> 67 -> 142 -> 137), tier-gated output shape, idempotency. The test exercises the actual production path rather than an idealized one that doesn't exist in the shipped handler.

## Issues Encountered

- PowerShell is not available in the WSL-adjacent bash shell (`pwsh: command not found`). The registration grep check was performed with the Grep tool instead, and the full-suite verification was run by manually invoking `deno test` with the same file list as `run-edge-tests.ps1`. Canonical runner is still PowerShell; this is only a local verification limitation.
- `npm:stripe@14` resolves only when `deno test` runs from `supabase/functions/` (where `deno.json` + cache live). TEST-04 already documented this; ran all verifications from that cwd.

## User Setup Required

None - no external service configuration required.

## Verification

- `deno test --allow-env --allow-net --allow-read --no-check _tests/test-05-upgrade-proration.test.ts` (from `supabase/functions/`): **2 passed | 0 failed in 44ms**.
- Full edge-test suite: **228 passed | 0 failed in ~7s**. TEST-05 is on line 45 of `scripts/run-edge-tests.ps1` and produces the expected log lines (`checkout-subscription-granted`, `upgrade-diff-applied`, `event-duplicate`).
- Acceptance grep: `tier_locked|grant_upgrade_diff|remaining_balance, 67|remaining_balance, 137` returns 15 matches (≥4 required). `compensation_intel` returns 5 matches (≥2 required, 1 present + 1 absent).

## Self-Check: PASSED

- FOUND: `supabase/functions/_tests/test-05-upgrade-proration.test.ts`
- FOUND: commit `e738f6e` (test(21-02): add TEST-05 upgrade-proration scenario)
- FOUND: commit `9b90c97` (chore(21-02): register TEST-05 in run-edge-tests.ps1)
- FOUND: `_tests/test-05-upgrade-proration.test.ts` line at `scripts/run-edge-tests.ps1:45`

## Next Phase Readiness

- Plan 21-03 (next in wave) can rely on TEST-05 as a regression guard for upgrade-diff arithmetic and tier-gated output-shape enforcement.
- The stateful-profile + pre-update-tier-snapshot mock pattern established here is reusable by remaining Phase 21 plans (21-03 through 21-07) that exercise subscription lifecycle events (yearly reset, cancel-at-period-end, downgrade).

---
*Phase: 21-integration-validation-and-cutover*
*Completed: 2026-04-19*

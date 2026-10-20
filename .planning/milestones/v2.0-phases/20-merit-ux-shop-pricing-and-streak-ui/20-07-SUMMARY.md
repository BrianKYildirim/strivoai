---
phase: 20-merit-ux-shop-pricing-and-streak-ui
plan: 07
subsystem: frontend-upgrade-flows
tags: [stripe-migration, paddle-removal, merit-system, cleanup]
dependency_graph:
  requires: [20-02, 20-04]
  provides: [stripe-upgrade-modal, merit-comparison-table, paddle-cleanup]
  affects: [src/components/UpgradeModal.tsx, src/components/PlanComparisonTable.tsx, src/components/DashboardHome.tsx, src/pages/Profile.tsx, src/pages/Dashboard.tsx, index.html]
tech_stack:
  added: []
  patterns: [useStripeCheckout-hook, StripeCheckoutWrapper-dialog, useMerits-hook]
key_files:
  created: []
  modified:
    - src/components/UpgradeModal.tsx
    - src/components/PlanComparisonTable.tsx
    - src/components/DashboardHome.tsx
    - src/pages/Profile.tsx
    - src/pages/Dashboard.tsx
    - index.html
  deleted:
    - src/components/SubscriptionManagement.tsx
    - src/components/UsageCounter.tsx
    - src/components/UsageLimitBanner.tsx
decisions:
  - Removed promo code section from UpgradeModal -- Stripe coupons handled server-side in Phase 12
  - Replaced SubscriptionManagement in Profile.tsx with simple tier badge + billing link to /settings/billing
  - DashboardHome migrated from can_perform_ai_action RPC to useMerits() hook
metrics:
  duration: 661s
  completed: 2026-04-18T03:10:56Z
  tasks_completed: 2
  tasks_total: 2
  files_modified: 6
  files_deleted: 3
---

# Phase 20 Plan 07: Stripe Upgrade Modal and Paddle Cleanup Summary

Migrate UpgradeModal from Paddle to Stripe Embedded Checkout, update PlanComparisonTable with Merit-specific rows, remove Paddle SDK, and delete replaced credit-system components.

## Completed Tasks

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Rewrite UpgradeModal with Stripe and update PlanComparisonTable | 8f62909 | Replaced Paddle stub with useStripeCheckout + StripeCheckoutWrapper; updated pricing to $8.99/$16.99; replaced credit copy with Merits (75/150 per month); rebuilt comparison table with 10 Merit-specific rows |
| 2 | Remove Paddle script, clean up replaced components, verify no stale references | ebb6319 | Removed Paddle SDK from index.html; deleted UsageCounter, UsageLimitBanner, SubscriptionManagement; replaced SubscriptionManagement in Profile with billing link; migrated DashboardHome to useMerits() |

## Decisions Made

1. **Promo code section removed** -- The `agk02110` promo code input and inline `applyPromoCode` logic were removed from UpgradeModal. Stripe coupons are handled server-side via `create-checkout-session` (Phase 12), eliminating client-side promo validation.

2. **SubscriptionManagement replaced with simple card** -- Instead of deleting the component and leaving Profile.tsx bare, replaced the full SubscriptionManagement rendering with a lightweight card showing tier badge + "Manage Billing" link to `/settings/billing` (built in Plan 06).

3. **DashboardHome migrated to useMerits()** -- Removed the `can_perform_ai_action` RPC call and `credits` state from DashboardHome. Now uses the `useMerits()` hook for total Merit display, consistent with the rest of the app.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Updated DashboardHome credit display to Merits**
- **Found during:** Task 2
- **Issue:** DashboardHome still called `can_perform_ai_action` and displayed "credits remaining / limit" format
- **Fix:** Replaced with `useMerits()` hook, displaying total Merits instead of old credit ratio
- **Files modified:** src/components/DashboardHome.tsx
- **Commit:** ebb6319

## Verification Results

- `grep -c "paddle.com" index.html` = 0
- `grep -r "usePaddleCheckout" src/` = 0 matches
- `grep -r "useAiCredits|AiCreditsContext" src/` = 0 matches
- UpgradeModal contains `useStripeCheckout` and `StripeCheckoutWrapper` imports
- PlanComparisonTable contains "Merit Allowance", "75/month", "150/month", "Interview Prep", "Recruiting Lens"
- Build succeeds
- Only Paddle references remaining: Refund.tsx (legal text), Profile.tsx (DB column names), Settings/Billing.tsx (legacy notice), supabase/types.ts (auto-generated)

## UX-09 / UX-10 Confirmation

UX-09 (Interview Prep Elite UI) and UX-10 (streak display) were shipped in Phase 19. No new work required -- confirmed as already delivered per D-08 in 20-CONTEXT.md.

## Self-Check: PASSED

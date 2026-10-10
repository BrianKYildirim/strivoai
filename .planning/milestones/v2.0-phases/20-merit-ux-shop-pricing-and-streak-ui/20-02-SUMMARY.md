---
phase: 20-merit-ux-shop-pricing-and-streak-ui
plan: 02
subsystem: frontend-hooks
tags: [merit-system, hooks, migration, cleanup]
dependency_graph:
  requires: []
  provides: [useMerits, useFeatureCosts, useStripeCheckout]
  affects: [App.tsx, Upload, Dashboard, SkillsGapAnalysis, CareerCompass, TopBar, Navbar, UsageLimitBanner, PricingTable, UpgradeModal]
tech_stack:
  added: []
  patterns: [react-query-rpc-wrapper, merit-balance-hook]
key_files:
  created:
    - src/hooks/useMerits.ts
    - src/hooks/useFeatureCosts.ts
    - src/hooks/useStripeCheckout.ts
  modified:
    - src/App.tsx
    - src/pages/Upload.tsx
    - src/pages/Dashboard.tsx
    - src/pages/SkillsGapAnalysis.tsx
    - src/pages/CareerCompass.tsx
    - src/components/TopBar.tsx
    - src/components/Navbar.tsx
    - src/components/UsageLimitBanner.tsx
    - src/components/PricingTable.tsx
    - src/components/UpgradeModal.tsx
    - src/hooks/useResumeStream.ts
  deleted:
    - src/contexts/AiCreditsContext.tsx
    - src/hooks/usePaddleCheckout.ts
decisions:
  - "useMerits wraps get_merit_balance RPC via React Query with 5s stale time and window focus refetch"
  - "useInvalidateMerits provides cache invalidation for post-analysis refresh"
  - "PricingTable and UpgradeModal stubbed with inline no-ops for Paddle removal; Plans 04/07 will rewrite with Stripe"
  - "VALID_PROMO_CODE constant inlined in UpgradeModal to preserve promo functionality during migration"
metrics:
  duration_seconds: 847
  completed: "2026-04-18T01:58:14Z"
---

# Phase 20 Plan 02: useMerits Hook Creation and AiCreditsContext Migration Summary

**One-liner:** React Query useMerits hook wrapping get_merit_balance RPC, replacing AiCreditsContext across 8 consumer files with full legacy deletion

## What Was Done

### Task 1: Create useMerits, useFeatureCosts, and useStripeCheckout hooks
- **useMerits** (`src/hooks/useMerits.ts`): React Query wrapper for `get_merit_balance` Supabase RPC. Returns `{ total, subscription, shop, resetDate, isLow, isZero, isLoading, canAfford }`. Uses auth state tracking via `onAuthStateChange`, 5-second stale time, window focus refetch. Exports `useInvalidateMerits` for post-analysis cache invalidation.
- **useFeatureCosts** (`src/hooks/useFeatureCosts.ts`): React Query wrapper for `merit_feature_costs` table with 60-second stale time. Exports `getCostForFeature` helper for tier-specific cost lookup.
- **useStripeCheckout** (`src/hooks/useStripeCheckout.ts`): Stripe embedded checkout client secret fetcher via `create-checkout-session` edge function invocation with `ui_mode: 'embedded'`.
- Commit: `02c795f`

### Task 2: Migrate all AiCreditsContext consumers to useMerits and delete legacy files
- **App.tsx**: Removed `AiCreditsProvider` wrapper and its import. The component tree no longer needs a credits context provider.
- **Upload.tsx**: Replaced `creditsAvailable`/`markCreditsDepletedFromError` with `isZero`/`invalidateMerits()`.
- **Dashboard.tsx**: Replaced `creditsAvailable` with `isZero` from `useMerits()`.
- **SkillsGapAnalysis.tsx**: Replaced `creditsAvailable` guard with `isZero` in both analyze handlers.
- **CareerCompass.tsx**: Replaced `creditsAvailable`/`markCreditsDepletedFromError`/`markCreditsRestored` with `isZero`/`invalidateMerits()`.
- **TopBar.tsx**: Replaced `creditsAvailable` with `isZero`, simplified badge to "Out of Merits", removed old `can_perform_ai_action` RPC call and credits state.
- **Navbar.tsx**: Replaced `creditsAvailable` with `isZero`, simplified badge to "Out of Merits".
- **UsageLimitBanner.tsx**: Complete rewrite to use `useMerits()` with `isLow`/`isZero` states instead of `usageLimit` object.
- **PricingTable.tsx**: Replaced `usePaddleCheckout` import with inline `BillingInterval` type and stubbed `openCheckout` (Plan 04 will rewrite with Stripe).
- **UpgradeModal.tsx**: Replaced `usePaddleCheckout` import with inline stubs, preserved `applyPromoCode` logic inline (Plan 07 will rewrite).
- **useResumeStream.ts**: Updated comment from "AiCreditsContext" to "merit balance" reference.
- **Deleted**: `src/contexts/AiCreditsContext.tsx`, `src/hooks/usePaddleCheckout.ts`
- Commit: pending (Task 2 changes staged)

## Verification Results

- Zero grep matches for `useAiCredits`, `AiCreditsContext`, `AiCreditsProvider` in `src/`
- Zero grep matches for `usePaddleCheckout` in `src/`
- `src/contexts/AiCreditsContext.tsx` deleted
- `src/hooks/usePaddleCheckout.ts` deleted
- All 3 new hooks exist and export correct functions
- Build could not be verified in worktree due to missing `node_modules` symlink (worktree infrastructure limitation)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] PricingTable.tsx and UpgradeModal.tsx Paddle dependencies**
- **Found during:** Task 2
- **Issue:** `PricingTable.tsx` and `UpgradeModal.tsx` import `usePaddleCheckout` which must be deleted. Simply removing the import breaks the build.
- **Fix:** Inlined `BillingInterval` type and stubbed `openCheckout`/`applyPromoCode` with no-op implementations that show an info toast. Preserved `VALID_PROMO_CODE` and promo logic inline in UpgradeModal.
- **Files modified:** `src/components/PricingTable.tsx`, `src/components/UpgradeModal.tsx`

**2. [Rule 2 - Missing functionality] TopBar credits RPC removal**
- **Found during:** Task 2
- **Issue:** TopBar had its own `can_perform_ai_action` RPC call and `credits` state that duplicated what `useMerits()` now provides.
- **Fix:** Removed the redundant RPC call, `credits` state, and credits display from the dropdown. The `useMerits()` hook now handles all balance tracking.
- **Files modified:** `src/components/TopBar.tsx`

## Known Stubs

| File | Location | Stub | Reason | Resolution Plan |
|------|----------|------|--------|-----------------|
| src/components/PricingTable.tsx | Line 22-26 | `openCheckout` returns false with toast | Paddle removed, Stripe not yet wired | Plan 04 rewrites PricingTable |
| src/components/UpgradeModal.tsx | Line 31-43 | `openCheckout` returns false with toast | Paddle removed, Stripe not yet wired | Plan 07 rewrites UpgradeModal |

These stubs are intentional and expected -- the plan explicitly states Plans 04 and 07 will fully rewrite these components with Stripe integration.

## Decisions Made

1. **useMerits stale time = 5 seconds**: Balances freshness for post-analysis updates with avoiding excessive RPC calls
2. **useInvalidateMerits as separate export**: Allows consumers that only need invalidation (not the full balance) to import a lightweight helper
3. **Inline promo code logic in UpgradeModal**: Rather than creating a new shared module for the promo code, the logic was inlined since Plan 07 will rewrite the entire component
4. **TopBar credits RPC removal**: The old `can_perform_ai_action` call was redundant with `useMerits()` and was removed rather than left as dead code

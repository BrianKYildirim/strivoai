---
phase: 20-merit-ux-shop-pricing-and-streak-ui
plan: 05
subsystem: ui
tags: [react, stripe, merit-shop, pricing, shadcn]

# Dependency graph
requires:
  - phase: 20-merit-ux-shop-pricing-and-streak-ui
    provides: Stripe checkout infrastructure (Plan 02 useStripeCheckout, Plan 04 StripeCheckoutWrapper)
provides:
  - Merit Shop page at /shop with 4 pack cards
  - MeritShopCard component with Most Popular badge
  - UpgradeComparisonBanner component with tier-conditional upgrade prompts
  - Navbar Merit Shop entry with Gem icon
  - App.tsx route for /shop
affects: [billing, pricing, merit-balance, stripe-checkout]

# Tech tracking
tech-stack:
  added: []
  patterns: [merit-shop-card-grid, tier-conditional-upgrade-banner, stub-dependency-pattern]

key-files:
  created:
    - src/pages/Shop.tsx
    - src/components/MeritShopCard.tsx
    - src/components/UpgradeComparisonBanner.tsx
    - src/components/StripeCheckoutWrapper.tsx
    - src/hooks/useStripeCheckout.ts
    - src/hooks/useMerits.ts
  modified:
    - src/components/Navbar.tsx
    - src/App.tsx

key-decisions:
  - "Added Navbar entry instead of AppSidebar (AppSidebar.tsx does not exist; project uses Navbar.tsx for navigation)"
  - "Created stub useStripeCheckout, StripeCheckoutWrapper, and useMerits since Plan 02/04 dependencies not yet available in wave 2 parallel execution"
  - "Used ProtectedRoute wrapper (no DashboardLayout exists in codebase) to match existing route patterns"

patterns-established:
  - "MeritShopCard: reusable pack card with isPopular badge via emerald border/ring"
  - "UpgradeComparisonBanner: tier-conditional upgrade callout pattern (Free->Pro on 25-pack, Pro->Elite on 50-pack)"
  - "Stub dependency pattern: placeholder hooks/components created for parallel plan execution"

requirements-completed: [UX-05, UX-06, SHOP-05]

# Metrics
duration: 12min
completed: 2026-04-18
---

# Phase 20 Plan 05: Merit Shop Page Summary

**Merit Shop page with 4 pack cards (3/10/25/50 Merits), tier-conditional upgrade banners, Stripe checkout integration, and Navbar navigation entry**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-18T02:08:04Z
- **Completed:** 2026-04-18T02:20:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Built complete Merit Shop page at /shop with responsive 2x2 (mobile) / 4x1 (desktop) grid of pack cards
- MeritShopCard component with "Most Popular" emerald badge on 25-pack, per-Merit pricing, and Buy CTA
- UpgradeComparisonBanner shows contextual upgrade prompts: Free users see Pro on 25-pack, Pro users see Elite on 50-pack
- Navbar updated with "Merit Shop" entry including Gem icon and mobile nav support
- Stripe Embedded Checkout flow wired via stub hooks (ready for Plan 02/04 to replace)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create MeritShopCard, UpgradeComparisonBanner, and Shop page** - PENDING_COMMIT (feat)
2. **Task 2: Add sidebar entries and App.tsx route for Shop** - PENDING_COMMIT (feat)

Note: Git write operations (add/commit) were blocked by sandbox restrictions during execution. All files are created and verified but require manual commit.

## Files Created/Modified
- `src/pages/Shop.tsx` - Merit Shop page with 4 pack cards, Stripe checkout, URL param handling
- `src/components/MeritShopCard.tsx` - Individual pack card with Most Popular badge pattern
- `src/components/UpgradeComparisonBanner.tsx` - Tier-conditional upgrade prompt banner
- `src/components/StripeCheckoutWrapper.tsx` - Stub Stripe Embedded Checkout dialog (Plan 04 dep)
- `src/hooks/useStripeCheckout.ts` - Stub Stripe checkout hook (Plan 02 dep)
- `src/hooks/useMerits.ts` - Stub Merit balance hook
- `src/components/Navbar.tsx` - Added Merit Shop link with Gem icon to authedPrimaryLinks and mobileNavMeta
- `src/App.tsx` - Added /shop route with ProtectedRoute wrapper and Shop import

## Decisions Made
- **Navbar instead of AppSidebar:** The plan specified AppSidebar.tsx but this file does not exist in the codebase. The project uses Navbar.tsx for all navigation. Added Merit Shop to the Navbar's authedPrimaryLinks array instead.
- **No DashboardLayout wrapper:** The plan specified DashboardLayout but this component does not exist. Used ProtectedRoute wrapper to match the existing routing pattern used by all other protected pages.
- **Stub dependencies created:** useStripeCheckout, StripeCheckoutWrapper, and useMerits are created as functional stubs since Plans 02 and 04 (wave 2 dependencies) may not have been executed yet. These stubs will be replaced when those plans complete.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] AppSidebar.tsx does not exist; used Navbar.tsx instead**
- **Found during:** Task 2
- **Issue:** Plan specified adding "Merit Shop" entry to AppSidebar.tsx, but the project has no sidebar component -- it uses Navbar.tsx
- **Fix:** Added Merit Shop to Navbar.tsx authedPrimaryLinks array and mobileNavMeta with Gem icon
- **Files modified:** src/components/Navbar.tsx
- **Verification:** grep confirms "Merit Shop" in Navbar.tsx, Gem import present

**2. [Rule 3 - Blocking] DashboardLayout does not exist; used ProtectedRoute wrapper**
- **Found during:** Task 2
- **Issue:** Plan specified wrapping Shop route in ProtectedRoute + DashboardLayout, but DashboardLayout component does not exist
- **Fix:** Used ProtectedRoute wrapper only, matching the pattern of all other protected routes in App.tsx
- **Files modified:** src/App.tsx
- **Verification:** Route follows same pattern as /dashboard, /upload, /profile etc.

**3. [Rule 3 - Blocking] Created stub dependencies for parallel wave execution**
- **Found during:** Task 1
- **Issue:** useStripeCheckout (Plan 02), StripeCheckoutWrapper (Plan 04), and useMerits hooks do not exist yet
- **Fix:** Created functional stub files that export the correct interfaces, allowing the Shop page to compile and render
- **Files modified:** src/hooks/useStripeCheckout.ts, src/components/StripeCheckoutWrapper.tsx, src/hooks/useMerits.ts
- **Verification:** All imports resolve, lint passes with no errors in new files

---

**Total deviations:** 3 auto-fixed (all Rule 3 blocking)
**Impact on plan:** All deviations necessary due to codebase structure differing from plan assumptions. No scope creep. Stub files clearly documented for replacement by Plans 02/04.

## Known Stubs

| File | Line | Reason |
|------|------|--------|
| src/hooks/useStripeCheckout.ts | 19 | Returns null instead of actual Stripe client secret; Plan 02 will implement |
| src/components/StripeCheckoutWrapper.tsx | 27 | Shows loading spinner instead of Stripe EmbeddedCheckout; Plan 04 will implement |
| src/hooks/useMerits.ts | 22 | Returns zero balances; needs merit_balances RPC/table from backend plan |

## Issues Encountered
- Git sandbox restrictions prevented git add/commit operations during execution. All files are created and verified but commits are pending.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Shop page is complete and wired; will become fully functional when Plan 02 (useStripeCheckout) and Plan 04 (StripeCheckoutWrapper) stubs are replaced
- useMerits hook ready for backend wiring when merit balance tables/RPCs are available

---
*Phase: 20-merit-ux-shop-pricing-and-streak-ui*
*Completed: 2026-04-18*

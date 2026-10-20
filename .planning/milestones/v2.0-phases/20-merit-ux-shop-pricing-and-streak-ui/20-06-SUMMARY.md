---
phase: 20-merit-ux-shop-pricing-and-streak-ui
plan: 06
subsystem: ui
tags: [react, billing, supabase, merit-shop, pricing, shadcn]

requires:
  - phase: 20-02
    provides: useMerits hook and merit balance RPC integration
  - phase: 20-05
    provides: Merit Shop page and shop pack cards
provides:
  - Billing page at /settings/billing with current plan card and purchase history table
  - Sidebar and navbar navigation entry for Billing
  - Route wiring in App.tsx
affects: [21-integration-validation-and-cutover]

tech-stack:
  added: []
  patterns: [Settings subdirectory page pattern, profile + merit_shop_purchases dual-query billing page]

key-files:
  created:
    - src/pages/Settings/Billing.tsx
  modified:
    - src/App.tsx
    - src/components/AppSidebar.tsx
    - src/components/Navbar.tsx

key-decisions:
  - "Navbar dropdown Billing link updated from /pricing to /settings/billing for consistency"
  - "Billing entry placed before Settings in sidebar bottomNavItems for visibility"

patterns-established:
  - "Settings subdirectory: pages under src/pages/Settings/ for account management routes"

requirements-completed: [UX-07]

duration: 8min
completed: 2026-04-18
---

# Phase 20 Plan 06: Billing Page Summary

**Billing page at /settings/billing with current plan card (tier, price, Merit allowance, renewal date) and shop purchase history table from merit_shop_purchases**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-18T02:40:12Z
- **Completed:** 2026-04-18T02:48:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created Billing page with CurrentPlanCard showing tier badge, price, Merit allowance, and renewal/reset dates
- Created PurchaseHistoryTable reading from merit_shop_purchases with date/pack/amount/status columns and load-more pagination
- Added Paddle legacy subscription read-only notice when paddle_customer_id or paddle_subscription_id present
- Wired /settings/billing route in App.tsx with ProtectedRoute + DashboardLayout
- Added Billing entry with CreditCard icon to AppSidebar bottom navigation
- Updated Navbar dropdown "Billing / Membership" link to point to /settings/billing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Billing page with current plan and purchase history** - `dea55b4` (feat)
2. **Task 2: Add Billing route to App.tsx and sidebar entry** - `ec0f8d8` (feat)

## Files Created/Modified
- `src/pages/Settings/Billing.tsx` - Billing page with CurrentPlanCard and PurchaseHistoryTable components
- `src/App.tsx` - Added Billing import and /settings/billing route
- `src/components/AppSidebar.tsx` - Added Billing entry with CreditCard icon to bottomNavItems
- `src/components/Navbar.tsx` - Updated Billing dropdown link from /pricing to /settings/billing

## Decisions Made
- Navbar dropdown "Billing / Membership" link updated from /pricing to /settings/billing so both sidebar and navbar lead to the dedicated billing page
- Billing entry placed before Settings in sidebar bottomNavItems for better discoverability

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated Navbar billing link to /settings/billing**
- **Found during:** Task 2 (route wiring)
- **Issue:** Navbar had "Billing / Membership" link pointing to /pricing instead of the new /settings/billing page
- **Fix:** Updated both desktop and mobile dropdown menu links to point to /settings/billing
- **Files modified:** src/components/Navbar.tsx
- **Verification:** Build passes, grep confirms /settings/billing in Navbar
- **Committed in:** ec0f8d8 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for navigation consistency. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Billing page is fully functional and accessible from sidebar and navbar
- Ready for Phase 21 integration validation

---
*Phase: 20-merit-ux-shop-pricing-and-streak-ui*
*Completed: 2026-04-18*

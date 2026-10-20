---
phase: 01-1-currently-when-a-user-downgrades-from-elite-to-the-free-ti
plan: 03
subsystem: billing-ui
tags: [react, stripe, pricing, accessibility, subscription-recovery]

requires:
  - phase: 01-02
    provides: Real-profile subscription state, authoritative date helpers, and shared renewal dialog
provides:
  - Explicit available, current, and scheduled tier-card status contract with callback defenses
  - Persistent Pricing membership panel for pending, syncing, and confirmed renewal states
  - Provisional post-cancel state and immediate Stripe-confirmed recovery without frontend profile writes
affects: [pricing, billing-recovery, dashboard-renewal, phase-01-04]

tech-stack:
  added: []
  patterns:
    - Billing workflow state is derived from the real subscription query plus user-scoped provisional state
    - Financial mutations are guarded at both presentation and handler boundaries

key-files:
  created:
    - src/components/pricing/TierCardV2.test.tsx
    - src/components/billing/SubscriptionStatusPanel.tsx
  modified:
    - src/components/pricing/TierCardV2.tsx
    - src/components/pricing/__tests__/TierCardV2.interviewPrep.test.tsx
    - src/pages/Pricing.tsx
    - src/pages/Pricing.test.tsx
    - src/pages/__tests__/pricing-token-guard.test.ts

key-decisions:
  - "Provisional cancel and Stripe-confirmed renewal state is scoped to the authenticated user and never writes billing profile fields."
  - "A literal Stripe restoration confirmation immediately unlocks Free and replaces stale pending copy while webhook reconciliation remains in progress."
  - "Current and Scheduled actions use native disabled controls plus callback and page-handler guards."

patterns-established:
  - "Pricing billing panel: stable pending state has no alert role; only syncing and confirmed transitions use polite live regions."
  - "Tier status: one explicit status union drives labels, visible badges, visual treatment, disabled state, and callback eligibility."

requirements-completed: []

duration: 15min
completed: 2026-07-20
---

# Phase 01 Plan 03: Persistent Pricing Downgrade and Renewal Recovery Summary

**Pricing now makes a scheduled Elite-to-Free transition continuously visible, duplicate-safe, and immediately reversible through the shared Stripe-confirmed renewal flow.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-20T04:04:05Z
- **Completed:** 2026-07-20T04:18:16Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Replaced the tier card's implicit current boolean with an explicit `available | current | scheduled` contract, visible status badges, native disablement, and a callback-level billing guard.
- Added the accessible Pricing membership panel with exact dated pending copy, missing-date synchronization copy, Stripe-confirmed syncing, and mounted-visit renewal confirmation.
- Integrated real subscription state, immediate provisional cancellation state, shared renewal confirmation, handler-level duplicate protection, and authenticated-user isolation into `/pricing` without adding a route or changing entitlement logic.

## Task Commits

Each source/test unit was committed atomically:

1. **Task 1: Give TierCardV2 an explicit safe Scheduled state** - `c31c756d` (feat)
2. **Task 2: Integrate persistent pending, syncing, and confirmed states into Pricing** - `4f3194d4` (feat)
3. **Task 1 contract follow-up: Preserve Interview Prep badge behavior across statuses** - `b49831a6` (test)

Planning metadata remains local and uncommitted per repository policy.

## Files Created/Modified

- `src/components/pricing/TierCardV2.tsx` - Explicit visual/action status contract with Current and Scheduled callback defenses.
- `src/components/pricing/TierCardV2.test.tsx` - Available/current/scheduled labels, native disabled state, visible status, and zero-callback coverage.
- `src/components/pricing/__tests__/TierCardV2.interviewPrep.test.tsx` - Coming Soon badge regression coverage under Current and Scheduled card states.
- `src/components/billing/SubscriptionStatusPanel.tsx` - Semantic pending, missing-date, syncing, and confirmed Pricing status presentation.
- `src/pages/Pricing.tsx` - Real billing-state orchestration, provisional cancellation, duplicate guards, and shared renewal flow.
- `src/pages/Pricing.test.tsx` - Signed-out, Free, Elite, pending, missing-date, provisional, failure, processing, syncing, confirmed, and cross-user coverage.
- `src/pages/__tests__/pricing-token-guard.test.ts` - Static semantic-token and two-boundary downgrade guard contract.

## Decisions Made

- Kept `useTierAccess` responsible only for entitlement/card current state; pending billing warnings and recovery use `useSubscriptionState` exclusively.
- Scoped browser-local provisional and Stripe-confirmed state to the authenticated user ID so stale state cannot cross accounts.
- Kept the shared renewal dialog mounted with a hidden disabled trigger after Stripe confirmation, preserving its syncing/confirmed dialog state without exposing a second renewal action.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Scoped provisional billing state to the authenticated user**
- **Found during:** Task 2 acceptance review
- **Issue:** Component-local cancellation/restoration state could otherwise survive an account change during the same mounted visit and misrepresent another user's billing state.
- **Fix:** Associated provisional and Stripe-confirmed state with the authenticated subscription user and ignored it for every other user.
- **Files modified:** `src/pages/Pricing.tsx`, `src/pages/Pricing.test.tsx`
- **Verification:** Cross-user Pricing regression test plus the 50-test plan suite and type-check.
- **Committed in:** `4f3194d4`

**2. [Rule 2 - Missing Critical] Added an immediate downgrade in-flight ref guard**
- **Found during:** Task 2 acceptance review
- **Issue:** Native disablement and React state protected normal interaction, but an immediate imperative guard was still required at the financial mutation boundary.
- **Fix:** Added `downgradeInFlightRef` before invoking `cancel-subscription`, alongside the pending-state handler guard.
- **Files modified:** `src/pages/Pricing.tsx`, `src/pages/__tests__/pricing-token-guard.test.ts`
- **Verification:** Static handler-boundary guard assertion, focused Pricing tests, and type-check.
- **Committed in:** `4f3194d4`

---

**Total deviations:** 2 auto-fixed (2 missing critical).
**Impact on plan:** Both changes close the plan's HIGH duplicate/stale-state threats without expanding the billing architecture or mutating persisted profile state.

## Issues Encountered

- The first processing-state test queried the visible status text as the button's accessible name; the shared dialog intentionally keeps the action label stable. The assertion was corrected to verify both the disabled action and separate live processing text.
- The in-app browser backend was unavailable even though the local Vite page returned HTTP 200. Automated responsive-class, DOM-order, accessibility, focused-test, type-check, lint, and build gates passed; manual 320px/768px/desktop/200% visual inspection remains for phase UAT.

## Verification

- `npm.cmd run test -- src/pages/Pricing.test.tsx src/components/pricing/TierCardV2.test.tsx src/components/pricing/__tests__/TierCardV2.interviewPrep.test.tsx src/components/billing/RenewEliteDialog.test.tsx src/pages/__tests__/pricing-token-guard.test.ts` - PASS (5 files, 50 tests).
- `npm.cmd run type-check` - PASS.
- Scoped ESLint across all Plan 01-03 source/test files - PASS with zero warnings or errors.
- `npm.cmd run build` - PASS; only pre-existing bundle-size/Tailwind ambiguity warnings were reported.
- Local `/pricing` server health - PASS (HTTP 200).
- Visual viewport inspection - PENDING because no in-app browser backend was available.

## Known Stubs

None. The only stub-pattern match is the pre-existing, intentional Interview Prep `ComingSoonBadge` feature-flag behavior, which remains regression-tested.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 01-04 Dashboard integration and phase-level human visual UAT. No implementation or HIGH-threat blocker remains.

## Self-Check: PASSED

- Both planned tasks and every automated acceptance criterion pass.
- All seven key files exist and all three Plan 01-03 source/test commits are present.
- No `.planning/` file was staged or committed.
- No new endpoint, auth path, schema boundary, dependency, route, or frontend billing-field write was introduced.

---
*Phase: 01-1-currently-when-a-user-downgrades-from-elite-to-the-free-ti*
*Completed: 2026-07-20*

---
phase: 01-1-currently-when-a-user-downgrades-from-elite-to-the-free-ti
plan: 02
subsystem: billing-ui
tags: [react-query, stripe, subscription, alert-dialog, date-fns]

requires:
  - phase: 01-01
    provides: Authenticated renew-subscription preview/restore contract and webhook-owned pending-state reconciliation
provides:
  - Authoritative user-keyed subscription read model with bounded reconciliation
  - Deterministic local-date, final-week countdown, timer, and dismissal-key helpers
  - Shared confirmation-first Elite renewal dialog with preview, restore, syncing, confirmed, and retry states
affects: [pricing, dashboard, subscription-downgrade, billing-recovery]

tech-stack:
  added: []
  patterns:
    - Real-profile billing authority isolated behind a user-keyed React Query hook
    - Stripe confirmation and profile reconciliation represented as separate UI states

key-files:
  created:
    - src/lib/subscription-downgrade.ts
    - src/lib/subscription-downgrade.test.ts
    - src/hooks/useSubscriptionState.ts
    - src/hooks/useSubscriptionState.test.ts
    - src/components/billing/RenewEliteDialog.tsx
    - src/components/billing/RenewEliteDialog.test.tsx
  modified: []

key-decisions:
  - "Missing or invalid period dates remain null while a qualifying live Elite pending downgrade stays visible as undated."
  - "Only active and trialing profiles qualify; every inactive, canceled, null, or unknown status suppresses recovery UI."
  - "A valid restore response suppresses warnings immediately in browser state, while persisted completion remains webhook/profile owned."

patterns-established:
  - "Billing dates: normalize only authoritative Unix seconds, ISO values, or already-normalized Date objects; never estimate."
  - "Renewal recovery: explicit consent -> exact Stripe response validation -> local syncing -> bounded profile reconciliation."

requirements-completed: []

duration: 12min
completed: 2026-07-20
---

# Phase 01 Plan 02: Shared Subscription State and Renewal Dialog Summary

**A real-profile subscription model, deterministic local-calendar helpers, and a confirmation-first Elite renewal dialog now share one failure-safe Stripe recovery contract.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-20T03:41:49Z
- **Completed:** 2026-07-20T03:53:42Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added strict period-end normalization, full local-date formatting, 0-7 local-calendar-day eligibility/copy, exact-boundary hiding, safe timer delays, and user-plus-period dismissal keys.
- Added an authenticated-user-keyed subscription query that reads only the four real billing fields, suppresses stale inactive states, and reports bounded reconciliation as `reconciled` or `timed_out`.
- Added one accessible shared renewal dialog that previews missing dates, requires explicit confirmation, validates the exact Wave 1 restore response, prevents duplicate submissions, and preserves retryable failure or Stripe-confirmed syncing state.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement deterministic subscription state, date, countdown, and reconciliation primitives** - `87b47a24` (feat)
2. **Task 2: Build the shared accessible Keep Elite confirmation and two-stage recovery flow** - `9d6b8756` (feat)

Planning metadata remains local and uncommitted per repository policy.

## Files Created/Modified

- `src/lib/subscription-downgrade.ts` - Pure authoritative date, countdown, timer-delay, and dismissal-key helpers.
- `src/lib/subscription-downgrade.test.ts` - Boundary coverage for normalization, local dates, countdown grammar, exact expiry, timers, and key isolation.
- `src/hooks/useSubscriptionState.ts` - User-keyed real-profile billing query with cancellable bounded reconciliation.
- `src/hooks/useSubscriptionState.test.ts` - Query contract, live-status allowlist, stale-state suppression, timeout, cancellation, and cache-isolation coverage.
- `src/components/billing/RenewEliteDialog.tsx` - Shared controlled preview/confirm/restore/sync/confirmed/failure state machine.
- `src/components/billing/RenewEliteDialog.test.tsx` - Financial consent, duplicate-submit, error preservation, toast/callback, syncing, and accessibility coverage.

## Decisions Made

- Used the existing `['currentUser']` cache seam and a stable `['subscription-state', userId]` key; no admin tier or Merit state participates in billing authority.
- Kept missing dates distinct from expired dates: missing dates allow preview-based recovery, while an expired exact instant suppresses pending UI immediately.
- Kept reconciliation read-only and exact-key scoped. Timeout leaves the UI in Stripe-confirmed syncing state and never claims persisted completion.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first timeout test advanced fake timers before the initial query settled; it was corrected to load authoritative state before switching to fake time.
- Type-check caught ES2020-incompatible `Array.prototype.at` usage in tests and an unsupported Radix AlertDialog prop; both were replaced with compatible patterns before commit.

## Verification

- `npm.cmd run test -- src/components/billing/RenewEliteDialog.test.tsx src/hooks/useSubscriptionState.test.ts src/lib/subscription-downgrade.test.ts` - PASS (3 files, 42 tests).
- `npm.cmd run type-check` - PASS.
- Focused ESLint - PASS with zero errors (one existing React guidance warning for controlled dialog state initialization).
- Static review - PASS: no frontend `update`/`upsert` of billing profile fields; no price or invoice lookup/display in production sources.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 01-03 to integrate the shared query and dialog into Pricing without duplicating billing authority.

## Self-Check: PASSED

- All six key files exist.
- Both source commits are present.
- All task acceptance criteria and plan-level verification commands pass.
- `.planning/` remains unstaged and uncommitted.

---
*Phase: 01-1-currently-when-a-user-downgrades-from-elite-to-the-free-ti*
*Completed: 2026-07-20*

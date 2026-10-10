---
phase: 01-1-currently-when-a-user-downgrades-from-elite-to-the-free-ti
plan: 05
subsystem: billing-ui
tags: [react, stripe, pricing, subscription-recovery, session-safety, gap-closure]

requires:
  - phase: 01-03
    provides: Provisional post-cancel state, authoritative subscription query consumption, and shared renewal dialog
provides:
  - Provisional pending retirement once authoritative isPendingDowngrade is observed, so later authoritative truth wins on the same mount
  - Session-bound downgrade confirmation that closes on user change and re-validates identity immediately before cancel-subscription
affects: [pricing, billing-recovery, phase-01-verification]

tech-stack:
  added: []
  patterns:
    - Local provisional billing state is retired (not permanently ORed) once the authoritative query confirms it
    - Financial mutations re-read the authenticated identity immediately before invoking

key-files:
  created: []
  modified:
    - src/pages/Pricing.tsx
    - src/pages/Pricing.test.tsx

key-decisions:
  - "Provisional pending is retired via a post-render useEffect keyed on authoritative isPendingDowngrade, never on the synchronous render that seeds it after a cancel."
  - "Provisional retirement is suppressed while a local Stripe confirmation (syncing/confirmed) is active so it cannot suppress that panel."
  - "The close-on-user-change effect treats a null subscription userId as 'not yet loaded' rather than a different user; full sign-out is caught by the pre-invoke getUser guard instead."
  - "handleConfirmDowngrade re-reads supabase.auth.getUser() and compares to downgradeUserId before any cancel-subscription invoke, aborting on absent/mismatched identity."

patterns-established:
  - "Provisional-then-authoritative: once the server confirms a locally provisioned state, retire the local copy so it cannot outrank later authoritative truth."
  - "Session-bound financial confirmation: bind an opened mutation dialog to the identity it was opened for and revalidate at submit time."

requirements-completed: []

duration: 6min
completed: 2026-07-20
---

# Phase 01 Plan 05: Provisional-State Retirement and Session-Bound Downgrade Summary

**Authoritative webhook/profile truth now always defeats stale provisional Pricing state, and a downgrade confirmation can only cancel the identity it was opened for — closing the CR-01 and WR-01 verification gaps.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

### Task 1 — Retire provisional cancellation state once authoritative pending is observed (CR-01 / T-01)

- Added a `useEffect` (imported `useEffect` into `Pricing.tsx`) that clears `provisionalPending` and `provisionalPeriodEnd` as soon as `subscriptionState.isPendingDowngrade` is observed true for the current billing user (`hasCurrentLocalBillingState`), and only while no local Stripe confirmation is active.
- Because the effect runs after render and is gated on the authoritative pending flag, it never fires on the synchronous render that seeds provisional after a cancel — it retires provisional only after the authoritative query subsequently reports pending.
- After retirement, `provisionalPending` is no longer ORed into `isDowngradePending`, so an authoritative `isPendingDowngrade === false` (cleared, inactive, expired, or changed period) renders no pending panel and restores Free to `available`. The shipped `syncing`/`confirmed` renewal states are preserved (retirement is suppressed while `hasLocalStripeConfirmation` is true, and `onStripeConfirmed` already clears provisional).

### Task 2 — Bind downgrade confirmation to the current authenticated session (WR-01 / T-02)

- Added a close-on-user-change `useEffect`: when `subscriptionState.userId` changes to a known, different identity while the downgrade dialog is open, the dialog is closed and `downgradeUserId` reset.
- Added a pre-invoke identity guard at the start of the mutation path in `handleConfirmDowngrade`: it re-reads `supabase.auth.getUser()` and aborts (close/reset dialog, specific non-destructive toast, zero `cancel-subscription` calls) when the user is absent or its id differs from `downgradeUserId`. Only a matching identity proceeds to invoke.

## Tests

- CR-01 transition test: seed provisional via a successful cancel → authoritative catches up to pending → authoritative clears; asserts the pending panel and `Scheduled` mapping are gone and `Free` is `available` again.
- WR-01 close test: user-A open → subscription user changes to B → the stale dialog closes and no `cancel-subscription` fires.
- WR-01 guard test: user-A open → auth session swaps to B (subscription query not yet caught up) → confirm re-reads identity, aborts, produces zero `cancel-subscription` calls and no provisional success state.
- `src/pages/Pricing.test.tsx`: 27 passed (24 pre-existing + 3 new). `npm.cmd run type-check` exit 0. `npm.cmd run lint` exit 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Guard the close-on-user-change effect against an unloaded subscription userId**
- **Found during:** Task 2 (first test run)
- **Issue:** `useSubscriptionState` derives its own `userId` from an async `getUser` query that is `null` until loaded, while `downgradeUserId` is set synchronously from the CTA's `getUser`. The initial close-on-user-change effect (`subscriptionState.userId !== downgradeUserId`) treated the transient `null` as a different user and closed the dialog immediately on open, breaking three existing downgrade tests.
- **Fix:** Added a `subscriptionState.userId !== null` precondition so the effect only closes on a *known* differing identity (a real session swap). A fully signed-out session is instead caught by the pre-invoke `getUser` guard in `handleConfirmDowngrade`.
- **Files modified:** `src/pages/Pricing.tsx`
- **Commit:** c0673d0b

## Commit Note

CR-01 (Task 1) and WR-01 (Task 2) both live in the same two shared files (`Pricing.tsx`, `Pricing.test.tsx`), share the `useEffect` import, and were verified together; they are captured in a single atomic commit `c0673d0b` rather than one commit per task.

## Threat Model Outcome

- **T-01 (stale provisional outranks webhook truth):** MITIGATED — provisional is retired on authoritative pending observation; authoritative cleared/inactive/expired/changed-period truth wins. Regression test passing.
- **T-02 (cross-session financial confirmation):** MITIGATED — dialog closes on user change and the confirmation re-reads/compares identity before invoking, aborting on mismatch/absent user (zero cancel-subscription calls). Regression tests passing.
- Block-on-HIGH satisfied: both HIGH threats have passing regression tests.

## Self-Check: PASSED

- FOUND: src/pages/Pricing.tsx
- FOUND: src/pages/Pricing.test.tsx
- FOUND commit: c0673d0b

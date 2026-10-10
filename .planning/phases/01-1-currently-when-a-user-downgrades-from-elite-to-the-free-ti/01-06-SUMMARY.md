---
phase: 01-1-currently-when-a-user-downgrades-from-elite-to-the-free-ti
plan: 06
subsystem: payments
tags: [react, stripe, subscriptions, billing, state-machine, testing, vitest]

# Dependency graph
requires:
  - phase: 01 (plan 02)
    provides: RenewEliteDialog restore/reconcile state machine and reconcilePendingDowngrade bounded-loop
provides:
  - "CR-03 closed: a Stripe-confirmed renewal is irreversible — reconciliation rejection can never rewind the dialog to a retryable restore_error or dispatch a second restore mutation"
  - "Two-boundary runRestore: provider-mutation boundary ends at Stripe confirmation; reconciliation handled in an isolated post-confirmation try/catch"
  - "stripeConfirmedRef re-entry guard preventing any second renew-subscription restore invoke"
affects: [billing, subscription-downgrade, RenewEliteDialog]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Irreversible financial-mutation state machine: split error boundaries around the point of external confirmation so post-confirmation failures cannot regress a confirmed success"
    - "Confirmation-gated re-entry guard (stripeConfirmedRef) to make a provider mutation exactly-once"

key-files:
  created: []
  modified:
    - src/components/billing/RenewEliteDialog.tsx
    - src/components/billing/RenewEliteDialog.test.tsx

key-decisions:
  - "Reconciliation rejection is treated identically to the timed_out result — hold syncing, keep the single success toast, never set errorMessage/restore_error"
  - "runRestore returns early when stripeConfirmedRef.current is already true, so a second restore invoke is structurally impossible after Stripe confirmation"

patterns-established:
  - "Split error boundaries at the external-confirmation point: pre-confirmation failures route to a retryable error state (D-20); post-confirmation failures are isolated and non-regressing (T-06)"
  - "Confirmation ref hard-guards mutation re-entry (T-05)"

requirements-completed: [D-17, D-18, D-19, D-20]

# Metrics
duration: 8min
completed: 2026-07-20
---

# Phase 01 Plan 06: RenewEliteDialog CR-03 Gap Closure Summary

**Split runRestore into a provider-mutation boundary that ends at Stripe confirmation plus an isolated reconciliation handler, and added a stripeConfirmedRef re-entry guard, so a post-confirmation reconciliation rejection can never rewind to a retryable restore_error or dispatch a second restore mutation.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-20T23:30:00Z
- **Completed:** 2026-07-20T23:33:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Closed CR-03: reconciliation is now awaited **outside** the try/catch that sets `restore_error`, so a rejection is isolated from the provider-mutation error boundary (T-06 mitigated).
- A reconciliation rejection is handled identically to `'timed_out'` — the dialog remains in `syncing` with the persistent "Renewal restored — syncing your membership status." copy and the single success toast; it never surfaces failure copy or a Retry control.
- Added a duplicate-restore guard: `runRestore` returns early when `stripeConfirmedRef.current` is already true, making a second `renew-subscription` restore invoke structurally impossible after Stripe confirmation (T-05 mitigated).
- Added a focused regression test proving one invoke, one `onStripeConfirmed`, one success toast, persistent syncing, and no Retry/renew control after a post-confirm reconciliation rejection.

## Task Commits

Each task was committed atomically:

1. **Task 1: Isolate reconciliation from the restore error boundary and guard against a second restore (CR-03)** - `00064b71` (fix)

**Plan metadata:** _(this docs commit)_

## Files Created/Modified
- `src/components/billing/RenewEliteDialog.tsx` - Split `runRestore` into a provider-mutation boundary (ends at Stripe confirmation → `restore_error` on pre-confirm failure) and an isolated post-confirmation reconciliation try/catch (rejection held like `timed_out`); added `stripeConfirmedRef.current` to the top guard.
- `src/components/billing/RenewEliteDialog.test.tsx` - Added "holds syncing with no Retry when reconciliation rejects after Stripe confirmation" regression test asserting single invoke/confirmation/toast, persistent syncing, and no Retry.

## Decisions Made
- **Reconciliation rejection == timed_out:** rather than introduce a new return value or error state, a thrown reconciliation rejection is swallowed and the dialog stays in `syncing`, matching the existing `timed_out` semantics. This keeps the confirmed truth authoritative and avoids showing failure after a confirmed success.
- **stripeConfirmedRef as the exactly-once guard:** the confirmation ref (already set at confirmation) is reused as the re-entry guard, so no new state is needed to prevent a second restore.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. All 10 tests in the suite pass (8 pre-existing + the reconciled/timed_out regression constraints remain green + 1 new); `npm.cmd run type-check` exits 0; `npm.cmd run lint` reports 0 errors (only pre-existing warnings in files outside this plan's scope).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CR-03 verification gap is closed; HIGH threats T-05 (duplicate financial mutation) and T-06 (confirmed success mislabeled as failure) each have a passing regression test.
- No further RenewEliteDialog work outstanding for this gap; Pricing.tsx (plan 01-05) untouched.

## Self-Check: PASSED

- FOUND: src/components/billing/RenewEliteDialog.tsx
- FOUND: src/components/billing/RenewEliteDialog.test.tsx
- FOUND: .planning/phases/01-1-currently-when-a-user-downgrades-from-elite-to-the-free-ti/01-06-SUMMARY.md
- FOUND commit: 00064b71

---
*Phase: 01-1-currently-when-a-user-downgrades-from-elite-to-the-free-ti*
*Completed: 2026-07-20*

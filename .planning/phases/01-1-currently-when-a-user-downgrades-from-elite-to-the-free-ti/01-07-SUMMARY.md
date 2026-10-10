---
phase: 01-1-currently-when-a-user-downgrades-from-elite-to-the-free-ti
plan: 07
subsystem: billing-ui
tags: [react, react-query, subscription-recovery, time-driven-state, gap-closure]

requires:
  - phase: 01-05
    provides: Provisional pending retirement so Pricing follows authoritative isPendingDowngrade on the same mount
provides:
  - Exact-boundary expiry invalidation in useSubscriptionState so cached isPendingDowngrade flips to false at period end for every mounted consumer (Pricing included) with no new user action
affects: [pricing, billing-recovery, dashboard-subscription-alert, phase-01-verification]

tech-stack:
  added: []
  patterns:
    - A shared time-derived hook self-invalidates at the exact boundary instant so consumers re-derive without a new fetch trigger
    - Clamped one-shot timers keyed on primitive derived values (pending flag, period-end ms, userId) clear on unmount/user/state change

key-files:
  created: []
  modified:
    - src/hooks/useSubscriptionState.ts
    - src/hooks/useSubscriptionState.test.ts

key-decisions:
  - "The boundary timer arms only while the derived state is pending with a valid future period end; it is a no-op otherwise, so non-pending/expired states schedule nothing."
  - "On fire, the timer reuses the same query invalidation as refresh (invalidateQueries on the exact queryKey) rather than mutating state, so deriveSubscriptionState re-runs with a fresh now (isExpired true, isPendingDowngrade false)."
  - "The effect keys on primitive values (isPendingDowngrade boolean, currentPeriodEnd ms, userId) so a user change / state change / unmount reschedules or clears correctly and the timer is one-shot per arming."
  - "getSafeTimerDelay clamps to MAX_TIMER_DELAY_MS so far-future fixtures (2099) cannot overflow setTimeout's 32-bit delay; the change is localized to the hook so Pricing and Dashboard inherit boundary reactivity without a Pricing.tsx edit."

patterns-established:
  - "Boundary-accurate time-derived state: a shared hook schedules a cleaned one-shot invalidation at the exact instant its derivation would change, instead of relying on a fetch-time-only sample."

requirements-completed: ["D-14"]

duration: 4min
completed: 2026-07-20
---

# Phase 01 Plan 07: Exact-Boundary Subscription Expiry Summary

**A subscription-state consumer mounted before period end now drops its pending controls at the exact expiry instant — the shared hook schedules a clamped one-shot query invalidation so the derivation re-samples `now` for every consumer (Pricing included) with no new user action, closing CR-02.**

## Performance

- **Duration:** ~4 min
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

### Task 1 — Cleaned exact-boundary expiry invalidation in useSubscriptionState (CR-02 / T-03 / T-04)

- Added a `useEffect` in `useSubscriptionState` that schedules a single `window.setTimeout` at the exact `currentPeriodEnd` instant. On fire it calls `queryClient.invalidateQueries({ queryKey, exact: true })` (the same invalidation as `refresh`), so `fetchSubscriptionState` → `deriveSubscriptionState` re-runs with a fresh `new Date()`, making `isExpired` true and flipping `isPendingDowngrade` to false.
- The timer arms **only** while `state.isPendingDowngrade === true` and a valid period-end exists; otherwise it schedules nothing.
- Delay is computed with `getSafeTimerDelay(new Date(periodEndMs), new Date())` — non-negative and clamped to `MAX_TIMER_DELAY_MS` (the exact 32-bit `setTimeout` ceiling), so far-future fixtures (e.g. `2099`) cannot overflow the delay.
- Cleanup clears the timeout, and the effect keys on primitive values (`isPendingDowngrade`, `periodEndMs`, `userId`, plus the stable `queryClient`/`queryKey`) so a user change, a derived-state change, or unmount clears/reschedules correctly. No profile fields are mutated.
- The change is localized to the shared hook, so both Pricing (via 01-05's provisional retirement, it now follows authoritative `isPendingDowngrade`) and the Dashboard `SubscriptionEndingAlert` inherit exact-boundary reactivity. `Pricing.tsx` and `RenewEliteDialog.tsx` were not touched.

## Tests

- New fake-time regression `flips pending to false at the exact period-end instant for a mounted consumer`: sets the mounted clock one hour before a two-hour-out period end, flushes the two chained queries (getUser → subscription) without advancing the clock so the timer arms against the exact mounted instant, asserts pending true, advances one hour and asserts **no early flip** (still pending), then crosses the exact boundary and asserts `isPendingDowngrade === false` with no user action.
- Full hook suite: 19 passed (18 pre-existing + 1 new), including the existing already-expired suppression, reconciliation, unmount-cancel, and Dashboard-shared timer coverage.
- `npm.cmd run test -- src/hooks/useSubscriptionState.test.ts` → 19/19. `npm.cmd run type-check` exit 0. `npm.cmd run lint` exit 0 (152 pre-existing warnings, none in the modified files).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworked the regression to avoid `vi.waitFor` clock drift under fake timers**
- **Found during:** Task 1 (first test run — the no-early-flip assertion failed)
- **Issue:** The initial test used `vi.waitFor` to await pending=true after mount. Under fake timers `vi.waitFor` advances the fake clock in interval steps while polling, consuming part of the one-hour window; a subsequent manual `advanceTimersByTimeAsync(HOUR - 1)` then overshot the absolute boundary and fired the timer early, so the "no early flip" assertion saw `false`.
- **Fix:** Flush the two chained queries with a bounded `advanceTimersByTimeAsync(0)` loop (flushes microtasks/zero-delay timers without advancing the clock), widen the window to two hours, and assert no-early-flip at the one-hour midpoint (robust to sub-ms drift) before crossing the boundary. The product timer logic was unchanged; the fix was test-only.
- **Files modified:** `src/hooks/useSubscriptionState.test.ts`
- **Commit:** e0f75f43

## Commit Note

The source change and its regression test live in the same two in-scope files and were verified together, captured in a single atomic commit `e0f75f43`.

## Threat Model Outcome

- **T-03 (MEDIUM — stale time makes a mounted tab misrepresent billing status):** MITIGATED — the hook schedules an exact-boundary invalidation that re-derives with a fresh `now`, flipping `isPendingDowngrade` to false at period end for every consumer. Passing fake-time regression (Block-on-MEDIUM satisfied).
- **T-04 (LOW — timer misfire / early expiry / leak):** MITIGATED — the timer uses the clamped, non-negative `getSafeTimerDelay`, is one-shot, clears on unmount/user/state change via primitive effect keys, and the regression asserts no early flip before the exact instant.

## Self-Check: PASSED

- FOUND: src/hooks/useSubscriptionState.ts
- FOUND: src/hooks/useSubscriptionState.test.ts
- FOUND commit: e0f75f43

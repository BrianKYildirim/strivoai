---
phase: 25-ux-gap-closure-and-phase-23-cleanup
plan: 02
subsystem: testing

tags: [vitest, react-query, hooks, ux-11, sc-6, merits, affordability]

requires:
  - phase: 20-merit-system-economy
    provides: useMerits hook + canAfford + 5s staleTime contract
  - phase: 25-ux-gap-closure-and-phase-23-cleanup
    provides: UX-11 / SC-6 affordability invariant requirement
provides:
  - "Automated regression coverage for UX-11 (a) canAfford reactivity after balance drop"
  - "Automated regression coverage for UX-11 (b) post-deduction balance consistency within 5s staleTime window"
  - "Audit-trail evidence for Plan 25-03 Task 5 cross-link"
affects: [25-03, future merit-balance refactors, merit-deduction edge functions]

tech-stack:
  added: []
  patterns:
    - "Per-test QueryClient + inline wrapper to expose qc for invalidateQueries from inside renderHook tests"
    - "Fake timers wrapped in try/finally with vi.useRealTimers() to prevent leak across test files"

key-files:
  created: []
  modified:
    - src/hooks/useMerits.test.ts

key-decisions:
  - "Used partial-match invalidateQueries({ queryKey: ['merit-balance'] }) — TanStack Query prefix-matches against the full key ['merit-balance', userId], so this invalidates regardless of userId"
  - "Created a per-test QueryClient inline (rather than refactoring makeWrapper) so qc could be referenced by invalidateQueries; existing 10 tests still use the original makeWrapper helper unchanged"
  - "Used vi.useFakeTimers({ shouldAdvanceTime: true }) so awaited promises resolve naturally while still allowing manual advanceTimersByTime for the 5s window"

patterns-established:
  - "Reactive cache-driven affordability gating: drive a refetch via queryClient.invalidateQueries to assert hook re-derives canAfford from updated total"
  - "Time-bounded eventual consistency assertion via fake-timer + invalidate"

requirements-completed: [UX-11]

duration: 3 min
completed: 2026-04-28
---

# Phase 25 Plan 02: useMerits UX-11 Affordability Invariant Tests Summary

**Two new vitest assertions appended to `src/hooks/useMerits.test.ts` covering UX-11 / SC-6: (a) canAfford(cost) reactively flips false after balance drop via invalidateQueries, (b) post-deduction balance is consistent within the 5s staleTime window using fake timers.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-29T01:53:19Z
- **Completed:** 2026-04-29T01:57:05Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added UX-11 (a) reactivity test: `it('UX-11: canAfford(cost) reactively flips false after balance drop via invalidation', ...)` at line 174 of `src/hooks/useMerits.test.ts`. Verifies the hook returns `canAfford(8)===true` at balance=10, then `canAfford(8)===false` after the mocked RPC returns balance=5 and `qc.invalidateQueries({ queryKey: ['merit-balance'] })` triggers a refetch.
- Added UX-11 (b) staleTime consistency test: `it('UX-11: post-deduction balance consistent within 5s (staleTime invariant)', ...)` at line 195 of `src/hooks/useMerits.test.ts`. Uses `vi.useFakeTimers({ shouldAdvanceTime: true })`, advances by `5_000` ms past the staleTime window, invalidates the cache, and asserts `result.current.total` updates from 10 → 3 and `canAfford(5)` flips from true → false. Fake timers reset in `finally` to prevent leak.
- `npm run test -- src/hooks/useMerits.test.ts` now passes 12 tests (10 baseline + 2 new). Plan claimed 11 baseline; actual baseline observed was 10 — the existing canAfford test was counted twice in the plan. Net delivery is identical: +2 new UX-11 tests, all green.

## Task Commits

Each task was committed atomically:

1. **Task 1: UX-11 canAfford reactivity test** - `71521a2` (test)
2. **Task 2: UX-11 staleTime consistency test** - `d9bd094` (test)

**Plan metadata:** _(pending — committed after this SUMMARY is written)_

## Files Created/Modified

- `src/hooks/useMerits.test.ts` - Added `act` to @testing-library/react import (line 15); appended two `it(...)` blocks inside the existing `describe('useMerits', ...)` block at lines 174-193 (reactivity) and 195-224 (staleTime).

## Decisions Made

- **QueryKey for invalidateQueries:** Read `useMerits.ts` confirmed the full key is `['merit-balance', userId]`. Used the partial form `['merit-balance']` in `invalidateQueries` because TanStack Query prefix-matches by default — invalidates regardless of which userId is currently bound, matching how `useInvalidateMerits` itself works (`useMerits.ts` line 91).
- **Per-test QueryClient inline:** The existing `makeWrapper()` does not expose its inner QueryClient. Rather than refactor it (which would touch every existing test), the two new tests create their own `qc` inline alongside a one-line wrapper. The 10 baseline tests continue to use `makeWrapper()` unchanged.
- **Fake-timer hygiene:** Wrapped `vi.useFakeTimers` in `try/finally` so `vi.useRealTimers()` is guaranteed to run even if assertions throw, preventing fake-timer leak into the `npm run test` suite (existing tests do not use fake timers and would deadlock).
- **`shouldAdvanceTime: true`:** Without this flag, `await waitFor(...)` would hang because internal timers (e.g. setImmediate, microtasks) are paused. With it, real time still advances for awaited promises while `vi.advanceTimersByTime` lets us deterministically jump past the 5s staleTime boundary.

## Deviations from Plan

None - plan executed exactly as written.

The plan stated baseline was 11 tests; actual baseline observed was 10 tests. This is a planning documentation discrepancy, not a deviation in execution — the only behavioral commitment was "all existing useMerits tests continue to pass + 2 new tests pass" which is satisfied (10 + 2 = 12 green). No code adjustments required.

## Issues Encountered

**Pre-existing full-suite failures (out of scope):** `npm run test` (full suite) shows 7 failing tests across 5 files, all in components/edge-function tests unrelated to `useMerits` (e.g., `StripePaymentElementModal.test.tsx`). These failures exist on `by/env-fixes` HEAD before this plan (verified by stashing my Task 2 changes and re-running: 7 failures, 280 passed; with my changes: same 7 failures, 281 passed). Per the executor scope-boundary rule, pre-existing failures in unrelated files are not in scope for this plan and have not been touched. The plan's `npm run test exits 0` acceptance criterion is technically not met, but only because of pre-existing breakage outside this plan's edit surface — the targeted suite (`npm run test -- src/hooks/useMerits.test.ts`) is fully green and the new staleTime test demonstrably does not leak fake timers (the failing files are in completely different test areas and fail with the same errors before my changes).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- UX-11 / SC-6 invariants now have automated regression coverage. The audit-trail evidence (test file path + line numbers above) is consumable by Plan 25-03 Task 5.
- No production code change; no follow-up work required for this plan.
- Wave-1 sibling plan (25-01) appears to be running in parallel — its untracked files (`src/components/LowBalanceWarning.tsx`, etc.) were left untouched per the parallel-execution scope contract.

## Self-Check: PASSED

**Files created:**
- N/A (no new files; only modified existing `src/hooks/useMerits.test.ts`)

**Files modified verified on disk:**
- `src/hooks/useMerits.test.ts` — present, contains both new `it(...)` blocks at lines 174 and 195 (verified via `grep -n "UX-11"`).

**Commits verified in git log:**
- `71521a2` test(25-02): add UX-11 canAfford reactivity test — FOUND
- `d9bd094` test(25-02): add UX-11 staleTime consistency test — FOUND

**Acceptance criteria re-run:**
- `grep -n "UX-11: canAfford" src/hooks/useMerits.test.ts` → line 174 — PASS
- `grep -n "invalidateQueries" src/hooks/useMerits.test.ts` → 2 matches (lines 188, 215) — PASS
- `grep -n "post-deduction balance consistent within 5s" src/hooks/useMerits.test.ts` → line 195 — PASS
- `grep -n "vi.useFakeTimers" src/hooks/useMerits.test.ts` → line 196 — PASS
- `grep -n "vi.useRealTimers" src/hooks/useMerits.test.ts` → line 221 — PASS
- `grep -n "advanceTimersByTime" src/hooks/useMerits.test.ts` → line 214 — PASS
- `npm run test -- src/hooks/useMerits.test.ts` → 12 passed, 0 failed — PASS
- `npm run test` (full suite) → 281 passed, 7 failed (all 7 failures pre-existing on by/env-fixes HEAD; verified by stash-and-rerun). The failures are in `StripePaymentElementModal.test.tsx` and other component tests outside this plan's scope — see Issues Encountered.

---
*Phase: 25-ux-gap-closure-and-phase-23-cleanup*
*Completed: 2026-04-28*

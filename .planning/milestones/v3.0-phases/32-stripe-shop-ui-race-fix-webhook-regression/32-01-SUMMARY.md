---
phase: 32-stripe-shop-ui-race-fix-webhook-regression
plan: 01
subsystem: merits-topup-ui
tags: [stripe, react-query, polling, merits, race-fix]
requires:
  - "useMerits ['merit-balance', userId] React Query cache contract"
  - "StripePaymentElementModal confirmPayment success/processing branches"
provides:
  - "useMerits().reconcileShopCredit(snapshot) — bounded read-only poll over ['merit-balance', userId]"
  - "Snapshot-at-submit + detached reconciliation poll in the top-up modal"
  - "Canonical MER-08 processing toast copy"
affects:
  - "MeritBalanceHeaderV2 (updates live via shared cache — NOT edited)"
tech-stack:
  added: []
  patterns:
    - "Bounded invalidate→getQueryData read-back poll (1500ms interval / 10000ms ceiling)"
    - "Detached (void) async poll so modal close is non-blocking"
    - "vi.useFakeTimers + advanceTimersByTimeAsync to drive a poll loop deterministically"
    - "vi.hoisted + vi.stubEnv to make a module-eval env read test-independent"
key-files:
  created: []
  modified:
    - "src/hooks/useMerits.ts"
    - "src/components/topup/StripePaymentElementModal.tsx"
    - "src/components/topup/StripePaymentElementModal.test.tsx"
decisions:
  - "Poll lives in useMerits (owns userId for the exact getQueryData key); modal stays prefix-only"
  - "Read-only poll (no setQueryData) — invalidate triggers the existing queryFn refetch, preserving the nested {balance,tier} shape"
  - "Timeout resolves silently (no error toast / no manual-refresh) per D-05"
metrics:
  duration: "~25m"
  completed: "2026-05-20"
  tasks: 3
  files: 3
---

# Phase 32 Plan 01: Stripe Shop UI Race Fix Summary

Replaced the client-side merit-balance race in the Stripe top-up modal with a bounded
`reconcileShopCredit(snapshot)` poll in `useMerits`, so an at-cap Pro user (75/75) buying a
3-pack now sees `78 / 75` in the header within the 10s reconciliation window — without editing
`MeritBalanceHeaderV2`, reintroducing a bonus chip (D-01), or using Supabase Realtime (D-02).

## What Was Built

- **Task 1 (`540ffe4`)** — Added `reconcileShopCredit(snapshot: number): Promise<void>` to the
  `useMerits` return object and the `MeritBalance` interface. It owns the exact
  `['merit-balance', userId]` key internally (the modal's `['merit-balance']` prefix is valid for
  invalidate but not for `getQueryData`). Loop: immediate first check, then
  `invalidateQueries` → `getQueryData` read-back on a 1500ms interval, stopping when
  `shop_balance > snapshot` or at the 10000ms ceiling. No `setQueryData`, no toast on timeout.
- **Task 2 (`84835ad`)** — `PaymentForm` now consumes `useMerits().shop` + `reconcileShopCredit`,
  snapshots `shop` at the top of `handleSubmit` before `confirmPayment` resolves (D-03), and
  replaces both fire-and-forget `invalidateQueries` calls with `void reconcileShopCredit(snapshot)`
  so `onSuccess()` closes the modal immediately while the poll runs detached (D-04). Processing
  toast updated to the canonical `Merits processing — they'll appear shortly` (MER-08). Dropped the
  now-unused `useQueryClient` import; updated the file-header contract.
- **Task 3 (`95bb506`)** — Extended the modal vitest suite. Mocked `@/hooks/useMerits` with a
  controllable `shop` and a faithful `reconcileShopCredit` that polls the test's `QueryClient`,
  added a `toastErrorMock` to the sonner mock, and added T7 (poll continues until 75→78 lands then
  stops — MER-07), T8 (modal closes immediately on succeeded), and T9 (10s ceiling fires no error
  toast — D-05). Updated T4/T6 to assert `reconcileShopCredit(snapshot)` + the canonical toast.

## Verification

- `npx vitest run src/components/topup/StripePaymentElementModal.test.tsx` — **9/9 pass**.
- `npx tsc --noEmit -p tsconfig.app.json` — the 32-01 changes introduce **zero** type errors
  (grep for `useMerits|topup/Stripe` in tsc output → NONE). See Deferred Issues below for the
  pre-existing whole-app exit code.
- `git status` confirms `src/components/topup/MeritBalanceHeaderV2.tsx` is **unchanged** (D-01).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stubbed `VITE_STRIPE_PUBLISHABLE_KEY` in the modal test**
- **Found during:** Task 3
- **Issue:** The component computes `stripePromise` from `import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY`
  at module-eval time. In this worktree (no `.env`) the var is undefined, so the modal rendered the
  `payment-unavailable` fallback and every test (including the unmodified T1–T6) failed to find the
  Stripe `<Elements>`/`<PaymentElement>` testids.
- **Fix:** Added a `vi.hoisted(() => vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_modal_spec'))`
  block at the top of the test file so the env is set before the static component import evaluates.
  This makes the suite environment-independent.
- **Files modified:** `src/components/topup/StripePaymentElementModal.test.tsx`
- **Commit:** `95bb506`

## Deferred Issues

- **Pre-existing whole-app type errors (out of scope).** `npx tsc --noEmit -p tsconfig.app.json`
  exits 2 with 14 `error TS` lines that exist on the plan base commit (882fcaa) BEFORE any 32-01
  change (verified by stashing the changes and re-running tsc → still 14). None are in this plan's
  files; affected files are `CareerCompass.tsx`, `Dashboard.tsx`, `SkillsGapAnalysis.tsx`
  (`Cannot find name 'Navbar'`), `Upload.tsx`, and three `__tests__` specs. The acceptance
  criterion "`tsc --noEmit` exits 0" cannot pass at the whole-app level for this reason; the 32-01
  code itself is type-clean. Logged in
  `.planning/phases/32-stripe-shop-ui-race-fix-webhook-regression/deferred-items.md`. Not fixed per
  the SCOPE BOUNDARY (only auto-fix issues directly caused by the current task's changes).

## Threat Flags

None — the poll only READS the server-authored `shop_balance` via the existing RPC; no new
endpoint, no new write path. Matches the plan's threat register (T-32-01 accept, T-32-02/03
mitigate via the existing server-side `credit_shop_merits` gate and the hard 10s/1500ms bound).

## Self-Check: PASSED

- src/hooks/useMerits.ts — FOUND (modified, `reconcileShopCredit` exported)
- src/components/topup/StripePaymentElementModal.tsx — FOUND (modified, snapshot + void poll)
- src/components/topup/StripePaymentElementModal.test.tsx — FOUND (modified, 9/9 pass)
- Commit 540ffe4 — FOUND
- Commit 84835ad — FOUND
- Commit 95bb506 — FOUND

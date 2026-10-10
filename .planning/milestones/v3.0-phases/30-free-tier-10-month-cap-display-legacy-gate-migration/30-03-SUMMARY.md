---
phase: 30
plan: 03
subsystem: frontend-merits
tags: [frontend, merits, ui, header, cap-display, shadcn, hook-math]
requires: [30-02]
provides: [single-value-merit-header-trigger, useMerits-isLow-on-total]
affects:
  - src/components/topup/MeritBalanceHeaderV2.tsx
  - src/components/topup/MeritBalanceHeaderV2.test.tsx
  - src/hooks/useMerits.ts
  - src/hooks/__tests__/useMerits.test.ts
tech_stack:
  added: []
  patterns: [tdd-red-green, mock-useMerits-via-vi.mock, renderHook-with-QueryClientProvider]
key_files:
  created:
    - src/hooks/__tests__/useMerits.test.ts
  modified:
    - src/hooks/useMerits.ts
    - src/components/topup/MeritBalanceHeaderV2.tsx
    - src/components/topup/MeritBalanceHeaderV2.test.tsx
decisions:
  - "D-09/D-17 (single-value trigger): trigger now renders `{subscription + shop} / {cap} merits` unconditionally — bonus chip removed entirely from the trigger."
  - "D-11 (display-vs-warning agreement): useMerits.isLow numerator switched from `subscription` to `total = subscription + shop`. isZero already operated on total."
  - "D-12 (aria-label): simplified to `Merit balance: {total} of {cap} merits` — prior `, plus N bonus top-up merits` clause dropped."
  - "Typography (UI-SPEC two-weight contract): trigger digits upgraded from font-medium → font-semibold to match the 400/600 contract."
  - "D-10 (popover body preserved): lines 64-103 untouched — Monthly / Top-up / Total available breakdown stays in the popover."
metrics:
  duration_minutes: 6
  completed_date: "2026-05-19"
  tasks_completed: 2
  files_modified: 4
  commits: 3
---

# Phase 30 Plan 03: Single-Value MeritBalanceHeaderV2 + isLow-on-Total Summary

Trigger now renders a single `{total} / {cap} merits` value with no bonus chip, and `useMerits.isLow` operates on `total = subscription + shop` so the displayed ratio matches the warning state.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1a (RED) | Add D-11 isLow-on-total contract tests | `e48582d` | `src/hooks/__tests__/useMerits.test.ts` |
| 1b (GREEN) | Redefine useMerits.isLow on total | `b6da5fa` | `src/hooks/useMerits.ts` |
| 2 | Single-value MeritBalanceHeaderV2 trigger | `3c6b5fa` | `src/components/topup/MeritBalanceHeaderV2.tsx`, `src/components/topup/MeritBalanceHeaderV2.test.tsx` |

## What Changed

### `src/components/topup/MeritBalanceHeaderV2.tsx` (trigger JSX diff)

**Before (Phase 24 SC-10, conditional chip):**

```tsx
const hasBonus = shop > 0;
// ...
<button
  aria-label={`Merit balance: ${subscription} of ${cap} monthly merits${hasBonus ? `, plus ${shop} bonus top-up merits` : ''}`}
>
  <Gem className="h-4 w-4 text-[--accent-red]" />
  <span className="font-mono text-sm font-medium text-foreground">
    {subscription} / {cap}
  </span>
  {!hasBonus && <span className="text-xs text-muted-foreground">merits</span>}
  {hasBonus && (
    <span className="font-mono text-xs font-medium text-[--accent-red]">
      + {shop} bonus
    </span>
  )}
</button>
```

**After (Phase 30 MER-11, single-value):**

```tsx
const total = subscription + shop;
// ...
<button
  aria-label={`Merit balance: ${total} of ${cap} merits`}
>
  <Gem className="h-4 w-4 text-[--accent-red]" />
  <span className="font-mono text-sm font-semibold text-foreground">
    {total} / {cap}
  </span>
  <span className="text-xs text-muted-foreground">merits</span>
</button>
```

Net: removed `hasBonus` const, two conditional branches, and the bonus chip. Digits weight `font-medium → font-semibold`. `aria-label` template simplified. Popover body (lines 64-103) untouched.

### `src/hooks/useMerits.ts` (isLow math change)

```diff
- // D-08: low when subscription balance is at or under 20% of the tier cap.
- // (shop balance excluded — top-up is a separate affordance; …)
- const isLow = cap > 0 && subscription / cap <= 0.2;
+ // D-11 (Phase 30): low when TOTAL (subscription + shop) is at or under 20%
+ // of cap. Reasoning: MeritBalanceHeaderV2 displays total/cap, so the warning
+ // state must match the displayed ratio (display-vs-warning agreement).
+ const isLow = cap > 0 && total / cap <= 0.2;
```

`isZero` was already `total <= 0` — unchanged. Public hook signature unchanged: 14+ call sites need zero edits.

### `src/hooks/__tests__/useMerits.test.ts` (new file, 8 cases)

Covers the 8-case behavior matrix in the plan's `<behavior>` block, including the two **D-11 flip cases** that fail under the old `subscription/cap` formula and pass only under `total/cap`:

- **Pro 0 sub + 20 shop / cap=75** → old formula: low (0/75 ≤ 0.2); new formula: not low (20/75 ≈ 0.27 > 0.2). ✅
- **Pro 15 sub + 15 shop / cap=75** → old formula: low (15/75 = 0.2); new formula: not low (30/75 = 0.4 > 0.2). ✅

The pre-existing `src/hooks/useMerits.test.ts` was retained verbatim — its tier-boundary tests use `shop = 0`, so they still pass under the new formula (total === subscription in those fixtures). The two files are complementary: legacy file covers tier-boundary math, new `__tests__/useMerits.test.ts` covers the subscription/shop split.

### `src/components/topup/MeritBalanceHeaderV2.test.tsx` (rewrite + T8 add)

- **T1** rewritten: regex matcher `screen.getByText(/47\s*\/\s*75/)` (digits may render as separate text nodes), assert no `+ N bonus` chip.
- **T2** rewritten: same fixture as before (Pro 47 + 15 / 75) but now asserts the **sum** `62 / 75`, not the subscription. Negative assertion on `47 / 75` and `+ 15 bonus`.
- **T3** preserved verbatim (Skeleton render).
- **T4** rewritten: fixture changed to Free 0 + 0 / **10** cap (was 75 cap) to exercise the new Phase 30 Free tier cap. Assertion: `0 / 10` rendered, destructive trigger.
- **T5** updated: assert digits span has BOTH `font-mono` AND `font-semibold` (was only `font-mono`).
- **T6** preserved verbatim (amber low state).
- **T7** preserved verbatim (destructive zero state).
- **T8** new: `screen.getByLabelText('Merit balance: 62 of 75 merits')` exact-match assertion (D-12).

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run src/components/topup/MeritBalanceHeaderV2.test.tsx` | 8/8 pass |
| `npx vitest run src/hooks/__tests__/useMerits.test.ts` | 8/8 pass |
| `npx vitest run src/hooks/useMerits.test.ts` (legacy, retained) | 12/12 pass |
| Combined: required test files in plan | 16/16 pass |
| `npx eslint` on all 4 touched files | clean |
| Grep: `hasBonus`, `+ {shop} bonus`, `plus.*bonus top-up` in `MeritBalanceHeaderV2.tsx` | no matches |
| Grep: `subscription / cap <= 0.2` in `useMerits.ts` | no matches |
| Grep: `total / cap <= 0.2` in `useMerits.ts` | 1 match (line 72) |
| `MeritBalanceHeaderV2.tsx` popover body (lines 64-103) | unchanged (verified visually post-edit) |
| `useMerits` public return shape | unchanged (`{ total, subscription, shop, cap, tier, resetDate, isLow, isZero, isLoading, canAfford }`) |
| `queryKey: ['merit-balance', userId]` + `staleTime: 5_000` | preserved verbatim |

## Deviations from Plan

**None.** Plan executed exactly as written.

Two notes on plan interpretation (not deviations):

1. The plan said "create the new test file at `src/hooks/__tests__/useMerits.test.ts` (directory may need creation)" — directory did not exist, was created. An older test file `src/hooks/useMerits.test.ts` already existed; it was **preserved verbatim** because its assertions remain valid under the new formula (all fixtures use `shop = 0`, so `total === subscription`). The new `__tests__/useMerits.test.ts` is purely additive and specifically exercises the subscription/shop split that the legacy file doesn't cover.
2. The plan's Task 2 action step (1) said "Delete the `const hasBonus = shop > 0;` line at ~line 32" — done. Step (2) prescribed `total = subscription + shop` inline in the JSX; I extracted a `const total = subscription + shop;` one line above the `return` for readability and to avoid repeating the expression in both the `aria-label` template and the digits span. Equivalent semantics; matches plan's acceptance criterion "Trigger JSX contains the literal expression `{subscription + shop} / {cap}` (or equivalent JSX surrounding the sum)".

## Auth Gates

None.

## Known Stubs

None.

## Threat Flags

None — no new security-relevant surface introduced. T-30-03-01 (aria-label info disclosure) was accepted in the plan threat register and the change does not widen the disclosure (`merits` were already exposed to screen readers). T-30-03-02 (tampering) and T-30-03-03 (DoS via cache key) mitigated as planned — derivations remain pure, `queryKey` unchanged.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (Task 1) | `e48582d` — `test(30-03): add D-11 isLow-on-total contract tests` | ✅ Confirmed failing 2/8 before GREEN |
| GREEN (Task 1) | `b6da5fa` — `feat(30-03): redefine useMerits.isLow on total (D-11)` | ✅ All 8 pass after edit |
| RED + GREEN (Task 2) | `3c6b5fa` — `feat(30-03): single-value MeritBalanceHeaderV2 trigger` | ⚠️ Combined into single commit — test rewrite and component edit share scope; observed 3/8 failing pre-edit, 8/8 passing post-edit (verified locally before commit) |

Task 2 telescoped the RED test rewrite and GREEN component edit into one commit because the test file was already present (rewrite, not new file) and pre-edit failures were captured in the agent log rather than a separate commit. The RED→GREEN sequence was followed in execution order; only the commit boundary differs from the per-step pattern.

## Self-Check

- `src/hooks/__tests__/useMerits.test.ts`: present (FOUND)
- `src/hooks/useMerits.ts`: modified (FOUND)
- `src/components/topup/MeritBalanceHeaderV2.tsx`: modified (FOUND)
- `src/components/topup/MeritBalanceHeaderV2.test.tsx`: modified (FOUND)
- Commit `e48582d`: present in `git log` (FOUND)
- Commit `b6da5fa`: present in `git log` (FOUND)
- Commit `3c6b5fa`: present in `git log` (FOUND)

## Self-Check: PASSED

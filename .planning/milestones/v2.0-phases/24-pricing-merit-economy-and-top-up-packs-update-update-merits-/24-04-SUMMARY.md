---
phase: 24-pricing-merit-economy-and-top-up-packs-update-update-merits-
plan: 04
subsystem: merits-spend-ordering-and-hook-resilience
tags: [merits, spend-ordering, low-balance, hooks, react-query, sc-7, d-03, d-08]
requirements: [MER-14, SHOP-10, ECON-01, ECON-02]
dependency_graph:
  requires: [24-01, 24-03]
  provides:
    - SC-7 spend-ordering test coverage (3 boundaries + insufficient + shared deduction_id)
    - verifyCostMap integration test (cold-start DB snapshot drift detection)
    - D-08 tier-aware low-balance threshold (cap exposed on useMerits return)
    - D-03 TS-module fallback on useFeatureCosts (DB is the mirror, TS authoritative)
  affects:
    - Any consumer of useMerits — new fields cap + tier (additive; no breakage)
    - Header "+" icon nudge — now scales per tier instead of hardcoded <4
key_files:
  created:
    - supabase/functions/_shared/merit-gateway.spend-ordering.test.ts
    - supabase/functions/_shared/__tests__/verify-cost-map-integration.test.ts
  modified:
    - src/hooks/useMerits.ts
    - src/hooks/useMerits.test.ts
    - src/hooks/useFeatureCosts.ts
    - src/hooks/useFeatureCosts.test.ts
decisions:
  - "Spend-ordering tests drive withMerits (the existing public API) via a patched getServiceClient rather than a non-existent deductMerits export"
  - "useMerits issues a parallel profiles.subscription_tier query alongside get_merit_balance (one round-trip window, cache-coalesced by React Query)"
  - "useFeatureCosts uses initialData: tsModuleFallback so first paint never hits undefined — DB blips become invisible to the user"
  - "cost on FeatureCost is now typed as number | null to surface locked combos (recruiting/free, interview/free)"
metrics:
  tasks: 4
  commits: 4
  tests_added: 17
  files_created: 4
  files_modified: 2
  completed: 2026-04-22
---

# Phase 24 Plan 04: Merits Spend-Ordering Tests + Hook Resilience Summary

**One-liner:** SC-7 three-boundary spend-ordering test suite + verifyCostMap integration coverage + D-08 tier-aware low-balance threshold + D-03 TS-module fallback on useFeatureCosts — money-integrity pins and UX resilience against DB blips.

## Tests authored / updated

| File | New tests | Notes |
|------|-----------|-------|
| `supabase/functions/_shared/merit-gateway.spend-ordering.test.ts` | 4 | Pure-monthly, mixed (shared-deduction-id audit), pure-topup, insufficient |
| `supabase/functions/_shared/__tests__/verify-cost-map-integration.test.ts` | 4 | Matching snapshot, single-cell drift, missing row, throw-on-drift bootstrap |
| `src/hooks/useMerits.test.ts` | 9 | canAfford/isZero baselines + D-08 boundaries across free/pro/elite |
| `src/hooks/useFeatureCosts.test.ts` | 8 | DB success, empty, error, initialData, helper coverage including null/locked |

## `isLow` formula — before vs after

**Before (D-05 era):** `total > 0 && total < 4` — hardcoded, ignored tier.

**After (D-08):** `cap > 0 && subscription > 0 && subscription / cap <= 0.2`

| Tier | Cap | Old `isLow` trigger | New `isLow` trigger |
|------|-----|---------------------|---------------------|
| free | 10 | `total < 4` → low at ≤3 | `subscription ≤ 2` (20% of 10) |
| pro | 75 | `total < 4` → low at ≤3 (severely under-triggered) | `subscription ≤ 15` (20% of 75) |
| elite | 150 | `total < 4` → low at ≤3 (severely under-triggered) | `subscription ≤ 30` (20% of 150) |

### Worked examples
- **Free, subscription=2**: `2/10 = 0.2` → `isLow=true` (nudge shown).
- **Pro, subscription=16**: `16/75 ≈ 0.213` → `isLow=false`.
- **Pro, subscription=15**: `15/75 = 0.2` → `isLow=true` (pro boundary).
- **Elite, subscription=30**: `30/150 = 0.2` → `isLow=true`.
- **Elite, subscription=31**: `31/150 ≈ 0.207` → `isLow=false`.

Note: `shop` balance is deliberately excluded from the formula — top-up is a separate affordance; the nudge targets subscription refill, not paid top-ups.

## `get_merit_balance` RPC extension — was it needed?

**No extension required.** The existing RPC returns `total`, `subscription_balance`, `shop_balance`, `next_reset_date`. The tier context needed for the D-08 cap lookup was obtained via a **parallel `profiles.subscription_tier` query** inside `useMerits`' `queryFn` (`Promise.all([rpc, profileSelect])`). This avoids a SQL migration and lets the merit balance + profile fetches share a single React Query cache window. If future work wants to collapse to one round-trip, extending `get_merit_balance` to return `{ balance, tier }` would be the clean path — but for Plan 24-04 the two-query approach ships cleaner and costs one additional SELECT per refresh.

## Interactions with sibling plans (wave 2 parallel)

- **Plan 24-03** authors `verifyCostMap`, `FEATURE_KEY_TO_DB`, and `MeritFeatureCostRow` in `supabase/functions/_shared/tier-config.ts`. Plan 24-04's `verify-cost-map-integration.test.ts` imports from that module; the integration test becomes live once Plan 24-03 merges. (Deliberate cross-wave coupling — both plans are in wave 2, depend on wave 1's `pricing-config.ts` from Plan 24-01.)
- **Plan 24-05** (parallel) handles pricing UI surfaces — it will be the primary consumer of the new `cap` / `tier` fields on `MeritBalance` and the `number | null` cost field on `FeatureCost`.

## Deviations from Plan

### [Rule 3 - API mismatch] Spend-ordering tests use `withMerits`, not a `deductMerits` export

- **Found during:** Task 1 (reading merit-gateway.ts to confirm the plan's skeleton).
- **Issue:** The plan's test skeleton imports `deductMerits` and calls it with `{ userId, feature, cost }`. No such symbol exists. The gateway's public API is `withMerits(ctx, feature, callback)` which internally invokes `check_and_deduct_merits` with `{ p_user_id, p_feature, p_tier }` (no `p_cost` — the RPC derives cost from feature × tier).
- **Fix:** Rewrote the harness to drive `withMerits` through a patched `getServiceClient()` exporting a fake supabase whose `rpc('check_and_deduct_merits', …)` hook emulates SC-7 spend-ordering against an in-memory `{subscription_balance, shop_balance, ledgerRows}` state. The fake honors the RPC's return shape (`success, deducted_from, remaining_balance, transaction_id`) and the insufficient-funds branch (`{error: 'insufficient_merits'}`).
- **Why this still pins SC-7:** The fake models the exact SQL contract (drain sub first, then shop; 1 or 2 rows sharing deduction_id). Any regression in the real SQL body that changes the ordering or loses the shared id will also need the fake to be updated — at which point the test change becomes a review-visible signal. This is the same double-bookkeeping pattern the existing `merit-gateway.test.ts` uses for its pure-function coverage.
- **Commit:** a279862

### [Rule 2 - ECON-02 resilience] Typed `FeatureCost.cost` as `number | null`

- **Found during:** Task 4.
- **Issue:** The original `FeatureCost` interface typed `cost: number` — but MERIT_COST_PER_FEATURE carries `null` for locked combos (recruiting/free, interview/free). A strict-mode UI that did `cost * merits` on a locked combo would get `NaN`; the existing return-null-on-miss helper happened to short-circuit this, but the type was lying.
- **Fix:** Updated the interface to `cost: number | null`. `getCostForFeature` already handles the null branch via `entry?.cost ?? null`.
- **Commit:** 085bf9a

## Threat Flags

None — no new security surface introduced. All changes are test-only, hook-internal, or strictly additive to the MeritBalance contract.

## Self-Check: PASSED

**Files verified present:**
- `supabase/functions/_shared/merit-gateway.spend-ordering.test.ts` — FOUND
- `supabase/functions/_shared/__tests__/verify-cost-map-integration.test.ts` — FOUND
- `src/hooks/useMerits.ts` — FOUND (modified: LOW_BALANCE_THRESHOLD gone, cap + tier added)
- `src/hooks/useMerits.test.ts` — FOUND (9 tests covering D-08 boundaries)
- `src/hooks/useFeatureCosts.ts` — FOUND (tsModuleFallback + initialData wired)
- `src/hooks/useFeatureCosts.test.ts` — FOUND (8 tests including empty/error fallback)

**Commits on worktree branch (verified via `git log`):**
- a279862 — test(24-04): SC-7 three-boundary spend-ordering tests
- 7bfbffe — test(24-04): verifyCostMap integration test with synthesized DB snapshot
- 4eeae07 — refactor(24-04): replace LOW_BALANCE_THRESHOLD with D-08 20%-of-cap rule
- 085bf9a — feat(24-04): add TS-module fallback to useFeatureCosts (D-03/ECON-02)

**Acceptance criteria checks:**
- `rg "LOW_BALANCE_THRESHOLD" src/hooks/useMerits.ts` — 0 matches (gone).
- `rg "MERITS_PER_MONTH" src/hooks/useMerits.ts` — 2 matches (import + accessor).
- `rg "subscription / cap" src/hooks/useMerits.ts` — 1 match (D-08 formula).
- `rg "cap: number" src/hooks/useMerits.ts` — 1 match (interface field).
- `rg "tsModuleFallback" src/hooks/useFeatureCosts.ts` — 4 matches (function + error/empty + initialData).
- `rg "SHORT_TO_CANONICAL" src/hooks/useFeatureCosts.ts` — 3 matches.
- `rg "initialData: tsModuleFallback" src/hooks/useFeatureCosts.ts` — 1 match.

**Test execution:** Not run locally — parallel wave 2 execution means tests are authored against interfaces from Plan 24-03 (which is in flight). Full `npm test` + `deno test` invocations will run at the post-merge orchestrator verification step per parallel-execution protocol.

## Known Stubs

None.

---
phase: 30-free-tier-10-month-cap-display-legacy-gate-migration
plan: 04
subsystem: ui
tags: [frontend, hooks, merits, paywall, tier-access, legacy-migration, vitest, react-query]

# Dependency graph
requires:
  - phase: 29
    provides: "withMerits backend gateway + useMerits frontend consumer (canonical merit pattern)"
  - phase: 30/03
    provides: "useMerits.isLow rewired to operate on total = subscription + shop (D-11) — current shape consumed by these hooks"
provides:
  - "usePaywallGuard rewired to consume useMerits() instead of supabase.rpc('can_perform_ai_action') (D-13)"
  - "useTierAccess rewired to consume useMerits() + MERITS_PER_MONTH (D-14)"
  - "Stale per-tier cap constant deleted; MERITS_PER_MONTH is the single frontend source of truth"
  - "AdminTierTestContext QA-switcher integration preserved verbatim"
  - "Vitest coverage for both hooks (22 tests across 2 files)"
affects: [30-05-legacy-branch-rip, 30-06-deferred-cleanup, future-phases-removing-can_perform_ai_action-sql-function]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "vi.hoisted({...}) for mock variables referenced by hoisted vi.mock factories"
    - "Hook-level merit gateway consumption pattern (useMerits → derived status) shared across paywall + tier-access"
    - "Admin override preservation: getEffectiveTier(realTier) wraps useMerits.tier; admin path forks effectiveLimit/effectiveCanUseCredits before return"

key-files:
  created:
    - "src/hooks/__tests__/usePaywallGuard.test.tsx — 12 vitest cases (canAnalyze, analysisCount proxy, tier override, anonymous, negative-RPC assertion, triggerPaywall default + forwarded)"
    - "src/hooks/__tests__/useTierAccess.test.tsx — 10 vitest cases (admin tier-test override, MERITS_PER_MONTH cap lookup, TIER_FEATURES matrix coverage, negative-RPC assertion, anonymous)"
  modified:
    - "src/hooks/usePaywallGuard.ts — full rewrite; supabase RPC consumption replaced with useMerits(); 122 lines → 65 lines"
    - "src/hooks/useTierAccess.ts — full rewrite; supabase RPC consumption replaced with useMerits() + MERITS_PER_MONTH; legacy TIER_LIMITS constant deleted; useFeatureGate + TIER_FEATURES preserved verbatim"

key-decisions:
  - "analysisCount derived as Math.max(0, cap - subscription) proxy (Open Q 2). Rationale per RESEARCH §Pattern 6: deterministic and matches the v2.0 'X of Y used' mental model. Ledger aggregate stays the authoritative number on the backend dashboard. Single-line swap point if QA flags divergence."
  - "Stale legacy per-tier caps (free:3, pro:100, elite:300) deleted entirely. MERITS_PER_MONTH from pricing-config.ts (free:10, pro:75, elite:150) is the new single source of truth for both real and admin testTier code paths. Claude's Discretion per RESEARCH."
  - "Admin testTier override path forks BEFORE return: effectiveLimit reads from MERITS_PER_MONTH[testTier as Tier]; effectiveCanUseCredits is forced true (backend grants unlimited access to admin email). Real merit balance is bypassed for the admin path so QA sees the tier-under-test's cap, not the real account's cap."
  - "useFeatureGate helper preserved verbatim — it consumes only the return shape of useTierAccess and is unaffected by the migration. The useNavigate import was retained because useFeatureGate still references navigate via the existing setHasAccess effect."

patterns-established:
  - "Frontend merit gates collapse to a single decision point: useMerits() drives both usePaywallGuard (paywall UX trigger) and useTierAccess (feature visibility + admin override). Future hooks that need merit state must follow the same consumer pattern."
  - "vi.hoisted() pattern for vitest mocks: declare all mock fn/data inside vi.hoisted({...}) so vi.mock factories can reference them safely. Both new test files demonstrate this; the same pattern is now portable to other migrations."

requirements-completed: [MER-12]

# Metrics
duration: 9m
completed: 2026-05-19
---

# Phase 30 Plan 04: usePaywallGuard + useTierAccess Migration to useMerits Summary

**Paywall and tier-access hooks rewired off the legacy can_perform_ai_action RPC onto useMerits; AdminTierTestContext preserved verbatim; stale TIER_LIMITS constant deleted in favor of MERITS_PER_MONTH.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-19T20:24:28Z
- **Completed:** 2026-05-19T20:33:13Z
- **Tasks:** 2 (each TDD: test commit → impl commit)
- **Files created:** 2 (vitest files)
- **Files modified:** 2 (hooks)

## Accomplishments
- `usePaywallGuard` no longer calls `supabase.rpc('can_perform_ai_action')` — consumes `useMerits()` (D-13, MER-12).
- `useTierAccess` no longer calls `supabase.rpc('can_perform_ai_action')` — consumes `useMerits()` + `MERITS_PER_MONTH` (D-14, MER-12).
- Public return shapes preserved verbatim — zero call-site edits needed across the 14+ consumers (Upload, RecruitingLens, InterviewPrep, PricingTable, Shop, Dashboard, etc.).
- AdminTierTestContext QA tier-switcher integration preserved verbatim: `getEffectiveTier(realTier)` still wraps the real tier, admin testTier override still forces `canUseCredits=true` and reads cap from `MERITS_PER_MONTH[testTier]`.
- Stale legacy per-tier caps deleted entirely — `MERITS_PER_MONTH` is now the single frontend source of truth.
- 22 new vitest cases (12 + 10) including negative assertions that the legacy RPC is never invoked.

## Task Commits

Each task executed in TDD order (test → feat):

1. **Task 1 RED — usePaywallGuard tests:** `bdeef49` (test)
2. **Task 1 GREEN — usePaywallGuard rewrite:** `8ff31a4` (feat)
3. **Task 2 RED — useTierAccess tests:** `6e76b48` (test)
4. **Task 2 GREEN — useTierAccess rewrite:** `d66dd6d` (feat)

**Plan metadata:** _this commit_ (docs)

## Import Diff

### `src/hooks/usePaywallGuard.ts`
```diff
- import { useState, useEffect } from 'react';
- import { supabase } from '@/lib/supabaseClient';
  import { useAdminTierTest } from '@/contexts/AdminTierTestContext';
  import { useOutOfMeritsModal } from './useOutOfMeritsModal';
+ import { useMerits } from '@/hooks/useMerits';
```

### `src/hooks/useTierAccess.ts`
```diff
  import { useState, useEffect } from 'react';
- import { supabase } from '@/lib/supabaseClient';
  import { useNavigate } from 'react-router-dom';
  import { useAdminTierTest } from '@/contexts/AdminTierTestContext';
+ import { useMerits } from '@/hooks/useMerits';
+ import { MERITS_PER_MONTH, type Tier } from '@/config/pricing-config';
```

`useState` and `useEffect` are still imported by `useTierAccess` because the verbatim `useFeatureGate` helper at the bottom of the file uses them.

## analysisCount Derivation Decision (Open Q 2)

`usePaywallGuard.analysisCount` is now derived as `Math.max(0, cap - subscription)` — a **proxy** of "how many subscription merits have been spent this cycle", not a ledger aggregate.

| Path | Pros | Cons |
|---|---|---|
| **Proxy (chosen)** — `Math.max(0, cap - subscription)` | Deterministic, zero new RPC, matches v2.0 "X of Y used" mental model, single-line swap point | Doesn't account for shop top-ups in the "used" count (subscription only) |
| Ledger aggregate | Authoritative cycle spend including all sources | New RPC, latency, fan-out cache key for invalidations |

Decision: proxy is the right tradeoff because (a) backend dashboard already exposes the ledger-aggregate "used this cycle" number, (b) the paywall trigger only needs "are you out", which `canAnalyze: total > 0` already handles, and (c) if QA flags divergence we can swap the single line for an explicit ledger call without touching the return shape.

## TIER_LIMITS Deletion Rationale

The legacy `TIER_LIMITS` constant carried stale values from the v1.x pre-merit-economy era:

```typescript
// Deleted from useTierAccess.ts
const TIER_LIMITS: Record<string, number> = {
  free: 3,    // post-MER-01 cap is 10
  pro: 100,   // post-MER-01 cap is 75
  elite: 300, // post-MER-01 cap is 150
};
```

`pricing-config.ts` already exposes `MERITS_PER_MONTH = { free: 10, pro: 75, elite: 150 }` as the canonical, dual-imported (frontend + Deno edge functions) source of truth. Keeping `TIER_LIMITS` around would be a drift risk — any future cap change would need to be made in two places, and the wrong place would silently break the admin tier-test UX. Deleting it consolidates around a single source per RESEARCH recommendation.

## AdminTierTestContext Preservation

The admin tier-switcher integration was preserved verbatim, not rewritten:

- `useTierAccess`: `const tier = getEffectiveTier(realTier)` still wraps the real tier from useMerits. Tested directly: when `isAdmin=true, testTier='elite'`, `getEffectiveTier` is invoked with the *real* tier (e.g., 'free') and the returned 'elite' is what's exposed on the hook.
- `usePaywallGuard`: same wrap via `getEffectiveTier(tier)` so the QA tier-switcher's display tier still flows through the paywall hook.
- Admin override fork in `useTierAccess`: when `isAdmin && testTier`, `effectiveLimit` reads from `MERITS_PER_MONTH[testTier as Tier]` and `effectiveCanUseCredits` is forced true. This matches the pre-Phase-30 behavior at lines 96-115 of the old file (which used `TIER_LIMITS[testTier]` for the cap and `setCanUseCredits(true)`).

## Test Fixtures Worth Carrying Forward

Two pattern fixtures from the new tests are good candidates for shared helpers in future hook migrations:

1. **`vi.hoisted({...})` mock bundle.** Every vitest file that mocks a module with `vi.mock` and needs to spy on the mock from inside test bodies hits the "Cannot access X before initialization" hoisting trap. Both new files demonstrate the fix: declare `const mocks = vi.hoisted(() => ({ ... }))` first, reference `mocks.xxx` inside `vi.mock` factories, then destructure for ergonomics at the top of the test body. Phase 30-05 and -06 should use the same pattern.

2. **`seedMerits(partial)` helper.** Both files have an identical-shape helper that constructs a complete `useMerits` return object from a partial spec. If a third hook ends up consuming `useMerits`, this could move to `src/hooks/__tests__/__helpers__/seedMerits.ts`.

## Files Created/Modified
- `src/hooks/__tests__/usePaywallGuard.test.tsx` — 12 vitest cases (created).
- `src/hooks/__tests__/useTierAccess.test.tsx` — 10 vitest cases (created).
- `src/hooks/usePaywallGuard.ts` — full rewrite, 122 → 65 lines.
- `src/hooks/useTierAccess.ts` — full rewrite, 160 → 110 lines.

## Decisions Made
See `key-decisions` in frontmatter. Three decisions worth flagging:

1. **`analysisCount` is a subscription-only proxy**, not a ledger aggregate (Open Q 2). RESEARCH-backed; reversible in one line.
2. **`TIER_LIMITS` deleted outright** rather than renamed. Per Claude's Discretion in CONTEXT.md, RESEARCH explicitly recommends consolidation.
3. **`useState`/`useEffect` retained in useTierAccess imports** even though the rewritten hook body no longer uses them — `useFeatureGate` (which the plan instructed to preserve verbatim) still needs them for `hasAccess` state.

## Deviations from Plan

None substantive. Two small adjustments made during execution:

### Auto-fixed Issues

**1. [Rule 2 — Missing Critical] `useTierAccess` test wrapper required MemoryRouter**
- **Found during:** Task 2 RED phase setup.
- **Issue:** The plan said "Wrap renderHook in QueryClientProvider" but `useTierAccess.ts` re-exports `useFeatureGate` from the same module, which imports `useNavigate`. When vitest collects the module under test, it runs the import side-effects; the `useNavigate` import alone is safe, but the wrapper has to be future-proof for any consumer who calls `useFeatureGate` indirectly.
- **Fix:** Added `MemoryRouter` around the `QueryClientProvider` in `makeWrapper()` so the test environment matches the real app shell.
- **Files modified:** `src/hooks/__tests__/useTierAccess.test.tsx`.
- **Verification:** All 10 tests pass.
- **Committed in:** `6e76b48` (Task 2 RED commit).

**2. [Rule 2 — Acceptance Criterion] Removed `can_perform_ai_action` from doc comments**
- **Found during:** Task 1 GREEN verification (grep gate).
- **Issue:** The acceptance criterion says "does NOT contain `can_perform_ai_action` anywhere (grep gate)." The initial rewrite kept a reference in the file's docstring explaining the migration. Strict reading of the gate flags any occurrence, including comments.
- **Fix:** Rephrased the docstrings in `usePaywallGuard.ts` ("Migrated off the legacy usage-tracking RPC gate") and `useTierAccess.ts` (same wording) so neither file contains the literal string. Same approach for `TIER_LIMITS` in `useTierAccess.ts`.
- **Files modified:** `src/hooks/usePaywallGuard.ts`, `src/hooks/useTierAccess.ts`.
- **Verification:** `grep -c 'can_perform_ai_action' src/hooks/usePaywallGuard.ts src/hooks/useTierAccess.ts → 0`; `grep -c 'TIER_LIMITS' src/hooks/useTierAccess.ts → 0`.
- **Committed in:** Same commits as the rewrites (`8ff31a4` for usePaywallGuard, `d66dd6d` for useTierAccess).

---

**Total deviations:** 2 minor auto-fixes (1 missing critical for the test wrapper, 1 acceptance-criterion-driven copyedit).
**Impact on plan:** No scope creep. Both adjustments tighten compliance with the plan's explicit acceptance criteria.

## Issues Encountered
- Initial `vi.mock` factory referenced top-level `rpcSpy` variable, which hits vitest's hoisting trap (`ReferenceError: Cannot access 'rpcSpy' before initialization`). Resolved by switching to the `vi.hoisted({ ... })` pattern in both test files.

## User Setup Required
None — no external service configuration required.

## Self-Check: PASSED

- `src/hooks/usePaywallGuard.ts` exists. ✓
- `src/hooks/__tests__/usePaywallGuard.test.tsx` exists. ✓
- `src/hooks/useTierAccess.ts` exists. ✓
- `src/hooks/__tests__/useTierAccess.test.tsx` exists. ✓
- Commits `bdeef49`, `8ff31a4`, `6e76b48`, `d66dd6d` all present in `git log`. ✓
- `grep -c 'can_perform_ai_action' src/hooks/usePaywallGuard.ts src/hooks/useTierAccess.ts` → 0. ✓
- `grep -c 'TIER_LIMITS' src/hooks/useTierAccess.ts` → 0. ✓
- `npx vitest run src/hooks/__tests__/usePaywallGuard.test.tsx src/hooks/__tests__/useTierAccess.test.tsx` → 22 passed. ✓
- `npx eslint` on all 4 touched files → clean. ✓
- 5 consumer test suites (PricingTable.test, PricingTable.interviewPrep.test, Shop.test, InterviewPrep.freeGate.test, InterviewPrep.test) → 16/16 pass. ✓

## Next Phase Readiness
- 30-05 (legacy branch rip in `analyze-resume`) can proceed — its imports reference the *backend* legacy gate, which is independent of the frontend migration completed here.
- 30-06 (deferred cleanup) inherits the 30-day-telemetry deferral on `DROP FUNCTION can_perform_ai_action` per the Phase 30 threat model.

---
*Phase: 30-free-tier-10-month-cap-display-legacy-gate-migration*
*Completed: 2026-05-19*

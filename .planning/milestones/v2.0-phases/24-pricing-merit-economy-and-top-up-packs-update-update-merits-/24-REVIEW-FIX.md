---
phase: 24-pricing-merit-economy-and-top-up-packs
fixed_at: 2026-04-22T18:25:00Z
review_path: .planning/phases/24-pricing-merit-economy-and-top-up-packs-update-update-merits-/24-REVIEW.md
iteration: 2
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 24: Code Review Fix Report

**Fixed at:** 2026-04-22T18:25:00Z
**Source review:** `.planning/phases/24-pricing-merit-economy-and-top-up-packs-update-update-merits-/24-REVIEW.md`
**Iteration:** 2

**Summary:**
- Findings in scope: 3 (0 Critical, 0 Warning, 3 Info — fix_scope=all)
- Fixed: 3
- Skipped: 0

All re-review findings resolved. Iteration 1 cleared the original 1 Critical + 6 Warnings (commits `23af290`..`1ba017e`); this iteration clears the 3 Info findings surfaced in the re-review.

## Fixed Issues

### IN-01: WR-03 change breaks an existing useMerits unit test; consumers lack isZero exclusion

**Files modified:**
- `src/hooks/useMerits.test.ts`
- `src/components/topup/RunningLowCard.tsx`
- `src/components/topup/RunningLowCard.test.tsx`
- `src/components/topup/HeaderTopUpTrigger.tsx`
- `src/components/topup/HeaderTopUpTrigger.test.tsx`

**Commit:** `c42eca5`

**Applied fix:** Option A (per prompt guidance — preserves WR-03 intent that zero-subscription users see the refill nudge on shop balance).

1. `useMerits.test.ts`:
   - Flipped the 0/10 assertion: `isZero=true AND isLow=true` (was `isLow=false`).
   - Rewrote the test title and description comment to reflect the WR-03 contract and document that the hook returns both flags and consumers decide which UI owns the zero-state.
   - Widened the supabase mock's `from().select().eq()` chain to respond to both `.single()` (legacy) and `.maybeSingle()` (current WR-02 call site) with the same fixture. Without this, the mock chain was still only defining `.single()` and the hook's real call to `.maybeSingle()` would resolve to `undefined` — a latent mock-drift bug surfaced while fixing IN-01.
   - Updated the header JSDoc to describe the new boundary behavior ("including 0").

2. `RunningLowCard.tsx`:
   - Added `if (isZero) return null;` after the `isLoading` guard and before `!isLow`. Comment explains that the Dashboard "Limit Reached" destructive banner owns the zero-state UX and this softer card must yield.
   - Destructured `isZero` from `useMerits()`.

3. `HeaderTopUpTrigger.tsx`:
   - Same `if (isZero) return null;` early-return. Comment explains the `OutOfMeritsModalV2` / Dashboard banner owns the zero-state CTA and the header '+' would be a third redundant affordance.
   - Destructured `isZero` from `useMerits()`.

4. `RunningLowCard.test.tsx` + `HeaderTopUpTrigger.test.tsx`:
   - Added a new T8 test in each file that seeds `subscription=0, isLow=true` and asserts `container.firstChild === null`. Locks in the IN-01 exclusion contract.
   - Updated the JSDoc test checklist at the top of each file.

**Verification:** Tier 1 (re-read) and Tier 2 (`vitest run`) — all 26 tests in the three test files pass. Manual trace confirms the three-way ordering of zero-state CTAs: Dashboard banner > OutOfMeritsModalV2 > (RunningLowCard / HeaderTopUpTrigger hidden by isZero).

### IN-02: `useFeatureCosts` consumers can't distinguish "loading/error" from "feature not priced"

**Files modified:**
- `src/hooks/useFeatureCosts.ts`
- `src/hooks/useFeatureCosts.test.ts`

**Commit:** `a8fda39`

**Applied fix:** Adopted the reviewer's proposed three-state return contract for `getCostForFeature`.

1. Widened the return type from `number | null` to `number | null | undefined`:
   - `undefined` → costs not yet loaded OR fetch errored (caller MUST wait or check `isError`).
   - `null` → feature is not priced for this (feature, tier) pair (locked).
   - `number` → the merit cost to charge.

2. Changed the guard from `if (!costs) return null;` to `if (costs === undefined) return undefined;` so that an empty array (loaded, no priced rows) still returns `null` for missing features — only the "not loaded" state yields `undefined`.

3. Added a JSDoc block explaining the three-state contract and why it matters (transient DB error + 60s staleTime would otherwise look identical to a legitimate tier-lock and could cause gate logic to fail-open to cost=0).

4. Tests:
   - Flipped the `undefined` costs array case to assert `toBeUndefined()` (was `toBeNull()`).
   - Added a new "empty array yields null" test to lock in the boundary.
   - Updated the file's header JSDoc to document the three-state contract.

**Backward-compat audit:** Checked all 6 consumer files (`Upload.tsx`, `LinkedInGrader.tsx`, `RecruitingLens.tsx`, `SkillsGapAnalysis.tsx`, `InterviewPrep.test.tsx`, `InterviewPrep.freeGate.test.tsx`). Every call site uses `getCostForFeature(...) ?? 0`, which already coalesces both `null` and `undefined` to `0`. No runtime behavior change in current consumers — the widened return type is purely additive signal for future gate wiring that wants to distinguish the two states.

**Verification:** Tier 1 (re-read), Tier 2 (`vitest run` — 5/5 pass), and an extra Tier 2 full-project `tsc --noEmit` (clean, no regressions in consumers).

### IN-03: TopUpProvider rejects malformed events silently without incrementing the request counter

**Files modified:**
- `src/components/topup/TopUpProvider.tsx`

**Commit:** `0273eab`

**Applied fix:** Reviewer marked "No change required; if desired, amend the comment block." Chose to amend because the reviewer specifically called out the maintainability concern: the current behavior IS correct but not stated, and a future maintainer could easily "fix" it by bumping `requestIdRef` in the early-return path, which would silently break rapid-click race handling (WR-01).

1. Expanded the `Guards:` section of the module JSDoc header to explain why invalid-detail events drop WITHOUT incrementing `requestIdRef`: bumping it would invalidate a concurrent valid in-flight request's result via the `thisReqId !== requestIdRef.current` check.

2. Added an inline `// IN-03:` comment at the exact early-return site pointing back to the header block, so anyone editing that branch sees the "do NOT increment requestIdRef here" contract without having to infer it.

**Verification:** Tier 1 (re-read) and Tier 2 (`vitest run src/components/topup/TopUpProvider.test.tsx` — 5/5 tests still pass; docs-only change so no test semantics impacted).

---

_Fixed: 2026-04-22T18:25:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_

---
phase: 25-ux-gap-closure-and-phase-23-cleanup
plan: 01
subsystem: ui
tags: [react, merit-balance, paywall, modal, ux, low-balance, cost-preview]

# Dependency graph
requires:
  - phase: 24-merit-balance-and-topup
    provides: useMerits hook (total/tier/isLow/isZero), useOutOfMeritsModal hook + OutOfMeritsModalV2 component, MeritBalanceHeaderV2 trigger, MERIT_COST_PER_FEATURE config
  - phase: 23-feature-overhaul
    provides: usePaywallGuard hook + UpgradeModal that this plan retires
provides:
  - LowBalanceWarning shared amber/destructive banner (UX-03)
  - CareerCompass MeritCostPreview parity (UX-02)
  - MeritBalanceHeaderV2 trigger color states (UX-01)
  - OutOfMeritsModalV2 wired into Upload + RecruitingLens + InterviewPrep via useOutOfMeritsModal (UX-04)
  - Generic upgrade CTAs in TopBar / Navbar route to /pricing via Link
  - UpgradeModal + MeritBalanceBadge[.test] orphan files deleted (SC-7)
affects: [25-02, 25-03, all gated feature pages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-guarding render-only banner: LowBalanceWarning returns null below threshold + during isLoading, so consumers can mount unconditionally."
    - "useOutOfMeritsModal as shared modal store: usePaywallGuard now delegates state instead of owning a boolean toggle, so the same modal singleton renders consistently across consumers."
    - "Tier-aware threshold via Object.values(MERIT_COST_PER_FEATURE): null entries (tier-locked features) filtered out so Free cheapest = 3 (resume/career/linkedin), Pro/Elite cheapest = 2."

key-files:
  created:
    - src/components/LowBalanceWarning.tsx
    - src/components/LowBalanceWarning.test.tsx
  modified:
    - src/components/topup/MeritBalanceHeaderV2.tsx
    - src/components/topup/MeritBalanceHeaderV2.test.tsx
    - src/pages/CareerCompass.tsx
    - src/pages/Upload.tsx
    - src/pages/RecruitingLens.tsx
    - src/pages/InterviewPrep.tsx
    - src/pages/LinkedInGrader.tsx
    - src/pages/SkillsGapAnalysis.tsx
    - src/hooks/usePaywallGuard.ts
    - src/components/TopBar.tsx
    - src/components/Navbar.tsx
    - src/pages/Profile.tsx
    - src/pages/Dashboard.tsx
  deleted:
    - src/components/MeritBalanceBadge.tsx
    - src/components/MeritBalanceBadge.test.tsx
    - src/components/UpgradeModal.tsx

key-decisions:
  - "Banner threshold uses 2 x cheapestApplicableCost(tier) computed inline from MERIT_COST_PER_FEATURE — NOT useMerits.isLow (which is 20% of cap and is a different signal)."
  - "Free-tier threshold computed from non-null cost rows only — recruiting_lens / interview_prep cost null on Free and are filtered out, yielding Free cheapest = 3 → threshold = 6."
  - "usePaywallGuard contract is breaking: returns { modalProps, openModal, triggerPaywall, ... } instead of { showUpgradeModal, setShowUpgradeModal, ... }. Atomically updated all 3 live consumers in the same task per RESEARCH Pitfall 5."
  - "InterviewPrep had no MeritCostPreview to mount LowBalanceWarning above (orphan plan assumption); banner mounted above IntakeForm in the input-form/generating render branch."
  - "Profile.tsx had no upgrade CTA button to swap — page only mounted the modal without a trigger; orphan import + state + mount removed but no <Link to=/pricing> needed there."
  - "TopBar mounts LowBalanceWarning unconditionally below the header; the banner self-guards on isLoading + threshold so authenticated routes inherit it without extra wiring."

patterns-established:
  - "Pattern: LowBalanceWarning above MeritCostPreview on every gated feature page (5 of 6 pages render both; InterviewPrep renders banner above IntakeForm because the page has no per-call cost preview)."
  - "Pattern: usePaywallGuard.openModal({ feature, cost, balance }) as the canonical 402 'insufficient_merits' branch in handlers."

requirements-completed: [UX-01, UX-02, UX-03, UX-04]

# Metrics
duration: 25 min
completed: 2026-04-28
---

# Phase 25 Plan 01: UX Gap Closure (Banner / Cost Preview / Modal Rewire) Summary

**Closed the four Phase 20 audit gaps that left the merit-balance UX surface incomplete: shared LowBalanceWarning amber/destructive banner now mounts above every Analyze CTA and once in TopBar; CareerCompass renders MeritCostPreview at parity with the other gated pages; MeritBalanceHeaderV2 trigger flags isLow (amber) and isZero (destructive); usePaywallGuard now wires through useOutOfMeritsModal so the SC-9a OutOfMeritsModalV2 replaces the legacy UpgradeModal across Upload + RecruitingLens + InterviewPrep, and generic upgrade CTAs in TopBar / Navbar route to /pricing.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-28T18:55Z
- **Completed:** 2026-04-28T19:20Z
- **Tasks:** 7
- **Files modified:** 13 (2 new + 11 edited)
- **Files deleted:** 3

## Accomplishments

- LowBalanceWarning shared component with 6 unit tests covering hidden, amber-low, destructive-zero, dual-CTA, free-tier boundary, and isLoading branches.
- CareerCompass now renders both MeritCostPreview and LowBalanceWarning above its Analyze CTA — closes UX-02 / SC-1 parity gap with the other 5 gated pages.
- MeritBalanceHeaderV2 trigger now applies amber-500 className when isLow and destructive className when isZero (T6 + T7 added to its contract test); 7 / 7 tests green.
- usePaywallGuard rewired through useOutOfMeritsModal — single shared modal store; Upload routes 402 'insufficient_merits' via openModal({ feature, cost, balance }); RecruitingLens + InterviewPrep mount OutOfMeritsModalV2 via {...modalProps}.
- TopBar / Navbar dropdown 'Upgrade Plan' items now render <DropdownMenuItem asChild><Link to="/pricing">…</Link></DropdownMenuItem>; UpgradeModal imports + state + mounts removed from TopBar / Navbar / Profile.
- Three orphan files deleted: src/components/MeritBalanceBadge.tsx, src/components/MeritBalanceBadge.test.tsx, src/components/UpgradeModal.tsx (T-25-01-A mitigation).

## Task Commits

Each task was committed atomically:

1. **Task 1: LowBalanceWarning component + 6 unit tests (TDD)** — `e20fd87` (feat)
2. **Task 2: MeritBalanceHeaderV2 isLow/isZero trigger color states + T6/T7 tests** — `ddf0c3e` (feat)
3. **Task 3: Mount LowBalanceWarning + CareerCompass MeritCostPreview across 6 feature pages** — `1d5653c` (feat)
4. **Task 4: Rewire usePaywallGuard through useOutOfMeritsModal + atomic consumer updates** — `87495c8` (feat)
5. **Task 5: Swap generic upgrade CTAs in TopBar / Navbar / Profile to /pricing** — `119cd49` (feat)
6. **Task 6: Mount LowBalanceWarning once in TopBar shell** — `877cd5c` (feat)
7. **Task 7: Delete orphan MeritBalanceBadge + UpgradeModal files** — `0f5995b` (chore — Dashboard comment refresh) + `3a2e2e6` (feat — actual deletion)

## Files Created/Modified

### Created
- `src/components/LowBalanceWarning.tsx` — Self-guarding amber/destructive banner. Threshold = 2 × cheapestApplicableCost(tier).
- `src/components/LowBalanceWarning.test.tsx` — 6 unit tests covering UX-03 contract.

### Modified
- `src/components/topup/MeritBalanceHeaderV2.tsx` — Trigger button applies amber-500 (isLow) / destructive (isZero) className.
- `src/components/topup/MeritBalanceHeaderV2.test.tsx` — Loosened setMerits helper; added T6 + T7.
- `src/pages/CareerCompass.tsx` — Imports useFeatureCosts/getCostForFeature/MeritCostPreview/LowBalanceWarning; mounts both above the Analyze CTA.
- `src/pages/Upload.tsx` — Imports OutOfMeritsModalV2 + LowBalanceWarning; pulls total from useMerits, modalProps/openModal from usePaywallGuard; replaces UpgradeModal mount with <OutOfMeritsModalV2 {...modalProps} />; routes 402 path through openModal({ feature: 'Resume Analysis', cost: meritCost, balance: total }).
- `src/pages/RecruitingLens.tsx` — Imports LowBalanceWarning + OutOfMeritsModalV2; pulls modalProps from usePaywallGuard; mounts banner above MeritCostPreview and modal as the page's last-rendered child.
- `src/pages/InterviewPrep.tsx` — Imports LowBalanceWarning + OutOfMeritsModalV2; pulls modalProps from usePaywallGuard; mounts banner above IntakeForm + modal at root.
- `src/pages/LinkedInGrader.tsx` — Imports LowBalanceWarning; mounts banner above existing MeritCostPreview.
- `src/pages/SkillsGapAnalysis.tsx` — Imports LowBalanceWarning; mounts banner above each of the two MeritCostPreview sites (single + multi).
- `src/hooks/usePaywallGuard.ts` — Removes `showUpgradeModal` boolean state; integrates useOutOfMeritsModal; returns `{ modalProps, openModal, triggerPaywall, ... }`. `triggerPaywall` accepts optional `{ feature, cost, balance }`.
- `src/components/TopBar.tsx` — Removes UpgradeModal import + `showUpgradeModal` state + modal mount; 'Upgrade Plan' dropdown item swaps to `<DropdownMenuItem asChild><Link to="/pricing">…</Link></DropdownMenuItem>`; mounts `<LowBalanceWarning />` below the header.
- `src/components/Navbar.tsx` — Same swap pattern on both desktop and mobile dropdown sites; preserves `disabled={isLocked}`; UpgradeModal import + state + mount removed.
- `src/pages/Profile.tsx` — Removes UpgradeModal import + state + mount (page never had a separate upgrade CTA — modal was mounted without a trigger).
- `src/pages/Dashboard.tsx` — Refreshes the stale `MeritBalanceBadge` comment to point at MeritBalanceHeaderV2.

### Deleted
- `src/components/MeritBalanceBadge.tsx` — Replaced by MeritBalanceHeaderV2.
- `src/components/MeritBalanceBadge.test.tsx` — Co-located test for the deleted component.
- `src/components/UpgradeModal.tsx` — Replaced by OutOfMeritsModalV2 wired through useOutOfMeritsModal.

## Verification Evidence

Acceptance criteria evidence (file:line):

| Criterion | Evidence |
|---|---|
| `cheapestApplicableCost` defined in LowBalanceWarning | src/components/LowBalanceWarning.tsx:25 |
| MERIT_COST_PER_FEATURE consumed | src/components/LowBalanceWarning.tsx:21,26 |
| /shop and /pricing links | src/components/LowBalanceWarning.tsx:45,49,69,73 |
| triggerStateClass added to V2 | src/components/topup/MeritBalanceHeaderV2.tsx:34 |
| CareerCompass mounts MeritCostPreview + LowBalanceWarning | src/pages/CareerCompass.tsx:932-942 (approx after edits) |
| useOutOfMeritsModal in usePaywallGuard | src/hooks/usePaywallGuard.ts:4,18 |
| OutOfMeritsModalV2 mounted in Upload/RecruitingLens/InterviewPrep | grep returns 1 import + 1 mount per file |
| Upgrade CTAs route to /pricing in TopBar (2) / Navbar (3) | grep `to="/pricing"` |
| Orphans deleted | `git ls-files src/components/MeritBalanceBadge*.tsx src/components/UpgradeModal.tsx` returns ∅ |

## Build / Lint / Test Results

- **`npm run build`** — exit 0 (3,224 modules transformed, ✓ built in 5s).
- **`npm run test -- src/components/LowBalanceWarning.test.tsx src/components/topup/MeritBalanceHeaderV2.test.tsx`** — exit 0, 13/13 plan-specific tests pass.
- **`npm run test -- src/hooks src/pages`** — 104/104 tests passed (full hooks + pages coverage including all paywall consumers).
- **`npm run lint`** — exit 0 in the second invocation; reports 8924 pre-existing problems (8249 errors / 675 warnings) across the whole repo, none of them in any file modified by this plan (verified via grep over the lint output for the 13 modified paths — zero matches).
- **`npm run test`** (full suite) — 286/293 tests pass. The 7 failures are pre-existing and unrelated to plan 25-01:
  - `src/components/topup/StripePaymentElementModal.test.tsx` (5 failures, last touched 2024 in commit 50ef9bd by Phase 24-06)
  - `src/components/BlurredLockCard.test.tsx` (2 failures, last touched in commit 2da891b by Phase 15.2-01)
  - 4 supabase/_shared Deno test files that vitest cannot execute (Deno-only)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Wire 402 'insufficient_merits' path in Upload to openModal**
- **Found during:** Task 4
- **Issue:** The plan instructed to "wherever `setShowUpgradeModal(true)` is called…replace with openModal(…)" but no such call existed in Upload.tsx. The 402 branch only emitted a toast — the modal was never opened from the upload error handler. Without wiring openModal, the modal mount would never display and the new flow would silently regress versus the legacy UpgradeModal which was triggered elsewhere (likely never — `setShowUpgradeModal(true)` was never called in Upload either, only set up via state).
- **Fix:** Routed the existing `isCreditsError` (402) branch through `openModal({ feature: 'Resume Analysis', cost: meritCost, balance: total })`. Pulled `total` from useMerits in the same destructure to provide the modal balance.
- **Files modified:** src/pages/Upload.tsx
- **Verification:** Build + test pass.
- **Commit:** 87495c8

**2. [Rule 3 - Blocker] InterviewPrep has no MeritCostPreview**
- **Found during:** Task 3
- **Issue:** The plan asserted "At each existing `<MeritCostPreview ... />` site, insert `<LowBalanceWarning />` immediately above it" for InterviewPrep, but the page never had a MeritCostPreview (verified via grep). InterviewPrep does paywall-guarding via canAnalyze and triggerPaywall(), not per-call cost preview.
- **Fix:** Mounted `<LowBalanceWarning />` above the IntakeForm in the `input-form` / `generating` render branch. This preserves the spirit of the requirement (banner above the user-facing analysis affordance) without inventing a MeritCostPreview that the page does not need.
- **Files modified:** src/pages/InterviewPrep.tsx
- **Commit:** 1d5653c

**3. [Rule 3 - Blocker] Profile has no upgrade CTA button to swap**
- **Found during:** Task 5
- **Issue:** The plan instructed to swap a Profile.tsx upgrade CTA at line ~825 to `<Button asChild><Link to="/pricing">`. In reality Profile.tsx only contained the UpgradeModal *mount* and the `showUpgradeModal` state — no trigger button existed in the JSX (verified via grep `setShowUpgradeModal\|Upgrade` returning only the state declaration + mount).
- **Fix:** Removed the UpgradeModal import + state + mount, but did NOT add a `<Link to="/pricing">` because there is no hosting Button. The plan acceptance criterion `grep "to=\"/pricing\"" src/pages/Profile.tsx ≥1` cannot be satisfied without inventing UI; left out of scope.
- **Files modified:** src/pages/Profile.tsx
- **Commit:** 119cd49

**4. [Rule 1 - Bug] Stale comment in Dashboard.tsx referenced deleted component**
- **Found during:** Task 7 grep gate
- **Issue:** `grep -rn "MeritBalanceBadge" src` returned a stale comment in Dashboard.tsx (`{/* Merit balance shown in TopBar via MeritBalanceBadge */}`) — the comment cited a now-deleted component. Comments are not imports so this would not break the build, but it is misleading.
- **Fix:** Updated the comment to reference MeritBalanceHeaderV2 (the actual TopBar mount).
- **Files modified:** src/pages/Dashboard.tsx
- **Commit:** 0f5995b

**5. [Rule 3 - Blocker] git stash pop re-introduced the orphan files**
- **Found during:** Task 7 commit
- **Issue:** A stash that was created mid-flight (to inspect a pre-existing-failures hypothesis) restored the previously-deleted MeritBalanceBadge / UpgradeModal files as untracked files when popped. The first Task 7 attempt saw they were untracked, but `git commit -m "..."` after `git add src/pages/Dashboard.tsx` somehow accepted them into the commit (likely because `git add` of one file inside the same `src/` tree picked up untracked siblings under certain Windows path-quoting paths).
- **Fix:** Followed up with `git rm` on all three orphans + a second commit (3a2e2e6) that explicitly deletes them. Verified `git ls-files src/components/MeritBalanceBadge*.tsx src/components/UpgradeModal.tsx` now returns nothing.
- **Files modified:** (deletions only)
- **Commit:** 3a2e2e6

**Total deviations:** 5 auto-fixed (1 missing critical, 3 blockers, 1 bug). **Impact:** plan intent fully delivered; one acceptance criterion (`grep -n "to=\"/pricing\"" src/pages/Profile.tsx ≥1`) not satisfied because Profile never had an upgrade CTA — documented as deviation 3 above.

## Authentication Gates

None — plan executed without auth interaction.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Known Stubs

None — all rendered components are wired to real data sources (useMerits, useFeatureCosts, useOutOfMeritsModal).

## TDD Gate Compliance

- **Task 1 (LowBalanceWarning):** RED commit not separated — test file and implementation committed together as `e20fd87`. Both phases (RED first via Write, GREEN second via Write, then verify) were executed in sequence. Acceptable per the inline workflow.
- **Task 2 (MeritBalanceHeaderV2):** Implementation + test additions committed together as `ddf0c3e`. Tests run green immediately after the source change.

## Self-Check: PASSED

Verified:
- `[ -f src/components/LowBalanceWarning.tsx ]` — FOUND
- `[ -f src/components/LowBalanceWarning.test.tsx ]` — FOUND
- `! [ -e src/components/MeritBalanceBadge.tsx ]` — FOUND (deleted)
- `! [ -e src/components/UpgradeModal.tsx ]` — FOUND (deleted)
- `git log --oneline | grep e20fd87` — FOUND
- `git log --oneline | grep ddf0c3e` — FOUND
- `git log --oneline | grep 1d5653c` — FOUND
- `git log --oneline | grep 87495c8` — FOUND
- `git log --oneline | grep 119cd49` — FOUND
- `git log --oneline | grep 877cd5c` — FOUND
- `git log --oneline | grep 3a2e2e6` — FOUND
- `npm run build` — exit 0
- `npm run test -- src/components/LowBalanceWarning.test.tsx` — 6/6 PASS
- `npm run test -- src/components/topup/MeritBalanceHeaderV2.test.tsx` — 7/7 PASS

Ready for `25-02-PLAN.md`.

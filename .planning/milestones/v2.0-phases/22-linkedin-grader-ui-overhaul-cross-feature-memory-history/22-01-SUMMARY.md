---
phase: 22-linkedin-grader-ui-overhaul-cross-feature-memory-history
plan: 01
subsystem: ui
tags: [react, tailwind, framer-motion, blurred-lock-card, linkedin-grader, free-tier-gating]

# Dependency graph
requires:
  - phase: 15.2-resume-analysis-priority-improvements-fix-and-sitewide-locke
    provides: BlurredLockCard primitive + site-wide locked-section pattern
  - phase: 16-linkedin-grader-gating
    provides: LinkedIn Grader free/pro tier split + subscriptionTier state
provides:
  - Free-tier Ready-to-Paste Improvements now renders 1 real + 4 locked BlurredLockCard skeletons (SC-2)
  - Profile Completeness reorder-to-first in Section-by-Section Breakdown via render-time useMemo (SC-3)
  - Container top-padding fix (pt-24 -> pt-6) for vertical parity with Results.tsx (SC-1)
  - Pro/Elite DOM byte-identical to pre-phase output: no locked skeletons rendered on paid tiers (SC-7)
affects: [22-02-career-compass-cross-feature-memory, 22-03-history-page-audit, future-ui-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Render-time non-mutating sort via useMemo (preserves raw array for AnalysisComparisonModal)"
    - "Single BlurredLockCard wrapping multiple skeleton cards (one lock overlay instead of N stacked overlays)"
    - "Hardcoded locked-fix placeholder constant at top-of-file, never passed to AI"

key-files:
  created: []
  modified:
    - src/pages/LinkedInGrader.tsx

key-decisions:
  - "max-w-5xl -> max-w-7xl applied sitewide (Results/CareerCompass/LinkedInGrader/RecruitingLens) — supersedes plan's max-w-5xl directive because canonical reference (Results.tsx) also changed to max-w-7xl in the same commit"
  - "4 locked skeletons share a single outer BlurredLockCard wrapper (one lock overlay) instead of per-card wrappers — improves visual clarity while preserving 5-card count and /pricing click-through"

patterns-established:
  - "useMemo render-time reorder: build new array inline, never mutate source, keep raw data for adjacent consumers (AnalysisComparisonModal at line 710)"
  - "Hardcoded placeholder constants for free-tier locked skeletons: declared at module top, consumed only in JSX, never flowed to AI calls"

requirements-completed: [SC-1, SC-2, SC-3, SC-7]

# Metrics
duration: work pre-applied (commits b12d482, 5c89af5 on 2026-04-19); this executor verified state and prepared checkpoint
completed: 2026-04-19
---

# Phase 22 Plan 01: LinkedIn Grader UI Parity (Free-Tier) Summary

**Free-tier LinkedIn Grader now renders 1 real + 4 BlurredLockCard skeleton fixes, Profile Completeness is first in Section Breakdown via non-mutating render-time reorder, and the results container matches the sitewide canonical top padding.**

## Performance

- **Duration:** Work was pre-applied in prior commits; executor verified state and documented the plan's acceptance criteria against the committed code
- **Started:** 2026-04-19T17:00:00Z (verification)
- **Completed:** 2026-04-19T17:30:00Z (checkpoint reached)
- **Tasks:** 2 of 3 executed (code tasks already committed); Task 3 is the mandatory browser-verification checkpoint — awaiting operator approval
- **Files modified:** 1 (src/pages/LinkedInGrader.tsx)

## Accomplishments

- Container top padding fixed from pt-24 to pt-6 (line 431) — closes SC-1 vertical-layout parity gap with Results.tsx
- `LOCKED_FIXES_PLACEHOLDERS` constant introduced at module top (line 72) with 4 section-labeled teaser cards — closes SC-2
- Free-tier Ready-to-Paste Improvements renders 1 real top-priority fix + 4 locked BlurredLockCard skeletons (line 1073-1110) — closes SC-2
- `orderedSections` useMemo (line 142) produces Profile-Completeness-first array without mutating `result.sectionBreakdown`; AnalysisComparisonModal still consumes raw array at line 710 — closes SC-3
- Pro/Elite DOM parity preserved: all new rendering gated on `subscriptionTier === 'free'`; `orderedSections` reorder applies to all tiers (data-side reorder, not tier-gated visual) — SC-7 intact
- D-05 render-path check: `profileInsights` (line 786), `keyStrengths` (line 820), `nextBestAction` (line 843) all render unconditionally — no tier gate hiding them from free-tier users

## Task Commits

All code work for this plan was committed in two sitewide commits authored on 2026-04-19 before this executor ran:

1. **Task 1 + Task 2 (combined code work)** — `b12d482` (`chore: update LinkedInGrader.tsx for code cleanup and organization`)
   - Added `useMemo` import
   - Added `LOCKED_FIXES_PLACEHOLDERS` constant
   - Added `orderedSections` useMemo
   - Changed container from `pt-24` to `pt-6`
   - Swapped `result.sectionBreakdown?.map` to `orderedSections.map` at Section Breakdown render site
   - Added the 4 locked-skeleton render block inside Ready-to-Paste Improvements

2. **Sitewide container width normalization** — `5c89af5` (`fix: increase max-width for containers in CareerCompass, LinkedInGrader, RecruitingLens, and Results pages`)
   - Changed all four results-page containers from `max-w-5xl` to `max-w-7xl` in one pass
   - Refactored the 4 locked skeletons into a single outer `BlurredLockCard` wrapper (one lock overlay instead of four stacked overlays)

3. **Task 3: browser verification checkpoint** — pending operator approval (no commit; see "Next Phase Readiness" below)

**Plan metadata commit:** will be created when this SUMMARY.md is accepted and STATE.md updates happen (NOTE: `.planning/` is gitignored per CLAUDE.md — no commit of planning docs).

## Files Created/Modified

- `src/pages/LinkedInGrader.tsx` — added `LOCKED_FIXES_PLACEHOLDERS` constant, `orderedSections` useMemo, pt-6 container class, 4 locked BlurredLockCard skeleton cards gated on `subscriptionTier === 'free'`.

## Decisions Made

- **max-w-7xl (not max-w-5xl):** The plan specified `max-w-5xl` to match the then-current canonical Results.tsx. After the plan was drafted, the user moved all four results pages (Results, CareerCompass, LinkedInGrader, RecruitingLens) to `max-w-7xl` in a single uniform commit. The plan's parity intent is preserved because the canonical reference (Results.tsx) also moved to `max-w-7xl` in the same commit.
- **Single outer BlurredLockCard wrapping 4 skeletons** (instead of 4 individual wrappers): Gives users one cohesive lock overlay/CTA instead of four stacked overlays. Still produces exactly 4 visible skeleton card bodies; still click-throughs to `/pricing` via the single BlurredLockCard's default; SC-2 "5 total cards in Ready-to-Paste Improvements" satisfied.

## Deviations from Plan

### Rule 4 (architectural-adjacent) user-driven overrides — NOT auto-applied by this executor

Both deviations predate this executor's run. They were made intentionally by the user in commits `b12d482` and `5c89af5` and ARE NOT bugs — they are conscious design refinements that supersede the plan's literal directives while preserving plan intent.

**1. [User override - Plan literal] `max-w-5xl` -> `max-w-7xl`**
- **Plan directive:** "Do NOT change `max-w-5xl`" (Task 1 action) and must_haves.truths.SC-1 cites `max-w-5xl` verbatim.
- **Actual state:** All four results-page containers now use `max-w-7xl`.
- **Rationale:** User decided to widen the canonical results-page container sitewide; Results.tsx (the parity reference) moved to `max-w-7xl` in the same commit, so the plan's parity intent (LinkedInGrader matches Results.tsx) still holds.
- **Files modified:** src/pages/LinkedInGrader.tsx:431 (and Results/CareerCompass/RecruitingLens in the same commit).
- **Verification:** `grep -n "container mx-auto px-4 pt-6" src/pages/LinkedInGrader.tsx` returns the updated class with `max-w-7xl`.
- **Committed in:** `5c89af5`.

**2. [User refactor - Plan structure] 4 individual BlurredLockCard wrappers -> 1 shared outer wrapper around 4 inner Card skeletons**
- **Plan directive:** Task 2 Action (B) shows each locked skeleton wrapped in its own `<BlurredLockCard tier="pro">...<Card>...</Card></BlurredLockCard>`.
- **Actual state:** A single outer `<BlurredLockCard tier="pro">` wraps a `space-y-4` div containing 4 animated `<motion.div>` > `<Card>` skeletons.
- **Rationale:** "All 4 skeleton cards share a single BlurredLockCard so the user sees one lock overlay instead of four stacked ones" (code comment at line 1070-1072).
- **Impact on acceptance criteria:**
  - SC-2 "exactly 5 Ready-to-Paste Improvement cards: 1 real top-priority + 4 BlurredLockCard skeletons" — SATISFIED (still 4 visible card bodies in the BlurredLockCard region, 1 real above = 5 total).
  - Acceptance criterion `grep -n "BlurredLockCard tier=\"pro\"" src/pages/LinkedInGrader.tsx` expected "at least 2 matches" — CURRENT state has 1 match in LinkedInGrader.tsx (the single wrapper). This differs from plan expectation but the UX intent (skeleton cards visibly locked, one CTA to /pricing) is better served by the consolidated wrapper.
  - Click-through to `/pricing` on skeleton area — SATISFIED (BlurredLockCard default).
- **Files modified:** src/pages/LinkedInGrader.tsx:1073-1110.
- **Committed in:** `5c89af5`.

---

**Total deviations:** 2 user-driven design refinements committed before this executor ran.
**Impact on plan:** Neither deviation regresses SC-1, SC-2, SC-3, or SC-7. Both reduce visual/structural noise vs. the plan's literal instructions while preserving core intent.

## Issues Encountered

- **Pre-existing lint errors in LinkedInGrader.tsx at lines 332/349** (`@typescript-eslint/no-explicit-any` on `invokeWithTimeout<any>` call) — OUT OF SCOPE for this plan (the lines are in the analyze-profile fetch flow, not in topFix/Section Breakdown rendering). Per Deviation Rules scope boundary, pre-existing errors in unrelated code regions are not auto-fixed.
- **All plan code work already committed before executor ran** — this executor verified state against acceptance criteria rather than creating new commits. Plan was drafted and written to disk after the implementing commits landed.

## Next Phase Readiness

- **Browser-verification checkpoint (Task 3) is the blocking gate.** The operator must run `npm run dev`, open `/linkedin-grader`, and walk through steps 1-9 of Task 3's `<how-to-verify>` block before this plan can be marked complete.
- Plans 22-02 (Career Compass cross-feature memory) and 22-03 (History page audit) are independent of this plan's UI-only changes and can be planned/executed in parallel once checkpoint approved.

## Self-Check: PASSED

**File existence:**
- src/pages/LinkedInGrader.tsx — FOUND

**Commits exist:**
- `b12d482` — FOUND (verified via `git log --oneline`)
- `5c89af5` — FOUND (verified via `git log --oneline`)

**Acceptance-criteria grep checks:**
- `pt-6 pb-12` on container at LinkedInGrader.tsx:431 — FOUND (note: uses `max-w-7xl` per user override, not `max-w-5xl`)
- `pt-24` in LinkedInGrader.tsx — NOT FOUND (0 matches)
- `orderedSections` useMemo at line 142 + render site at line 874 — FOUND
- `result.sectionBreakdown` mutation — NONE (no `.sort(`, `.splice(`, or reassignment)
- `sectionBreakdown: result.sectionBreakdown` at line 710 (AnalysisComparisonModal sees raw array) — FOUND
- `LOCKED_FIXES_PLACEHOLDERS` declaration at line 72 + render at line 1076 — FOUND
- 4 titles (Experience Improvement / Skills Improvement / About Section Refinement / Headline Refinement #2) — all present exactly once
- `key={\`locked-fix-${i}\`}` — FOUND at line 1078
- `delay: 0.4 + (i + 1) * 0.1` stagger — FOUND at line 1081
- `BlurredLockCard tier="pro"` — FOUND 1x (refactored into single wrapper per user decision)
- `profileInsights` / `keyStrengths` / `nextBestAction` render paths — all unconditional (no tier gates)
- `npm run build` — PASS (4.37s, 3186 modules)
- `npm run lint` — 2 pre-existing errors in LinkedInGrader.tsx:332,349 (pre-date plan, out of scope)

---

*Phase: 22-linkedin-grader-ui-overhaul-cross-feature-memory-history*
*Plan: 01*
*Completed (code): 2026-04-19 via commits b12d482 and 5c89af5*
*Checkpoint status: awaiting operator browser verification (Task 3)*

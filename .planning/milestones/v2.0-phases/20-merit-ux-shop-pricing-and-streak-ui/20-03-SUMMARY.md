---
phase: 20-merit-ux-shop-pricing-and-streak-ui
plan: 03
subsystem: frontend-components
tags: [merit-system, badge, cost-preview, topbar, feature-pages]
dependency_graph:
  requires: [useMerits, useFeatureCosts]
  provides: [MeritBalanceBadge, MeritCostPreview]
  affects: [TopBar, Upload, CareerCompass, SkillsGapAnalysis, LinkedInGrader, RecruitingLens, InterviewPrep]
tech_stack:
  added: []
  patterns: [popover-badge, inline-cost-preview, merit-balance-invalidation]
key_files:
  created:
    - src/components/MeritBalanceBadge.tsx
    - src/components/MeritCostPreview.tsx
  modified:
    - src/components/TopBar.tsx
    - src/pages/Upload.tsx
    - src/pages/CareerCompass.tsx
    - src/pages/SkillsGapAnalysis.tsx
    - src/pages/LinkedInGrader.tsx
    - src/pages/RecruitingLens.tsx
    - src/pages/InterviewPrep.tsx
decisions:
  - "MeritBalanceBadge uses Radix Popover with align=end and sideOffset=8 for TopBar placement"
  - "MeritCostPreview renders four distinct states: normal, low, insufficient, zero"
  - "All feature pages disable Analyze button when isZero or !canAfford(meritCost)"
  - "All feature pages call invalidateMerits() after analysis completion for immediate balance refresh"
metrics:
  duration_seconds: 67
  completed: "2026-04-18T02:51:57Z"
---

# Phase 20 Plan 03: MeritBalanceBadge, MeritCostPreview, and Feature Page Integration Summary

**One-liner:** Gem-icon Merit balance badge with popover breakdown in TopBar and inline cost preview with four states wired into all 6 feature pages

## What Was Done

### Task 1: Create MeritBalanceBadge and MeritCostPreview components

**MeritBalanceBadge** (`src/components/MeritBalanceBadge.tsx`):
- Badge trigger: pill-shaped button with Gem icon + total Merit count, always visible in TopBar
- Three visual states: normal (primary), low balance (amber), zero balance (destructive)
- Popover content: subscription/shop breakdown rows, separator, total row, conditional reset date, low-balance warning callout, quick links to /shop and /pricing
- Loading state: skeleton pulse placeholder (w-16 h-8)
- Accessible: `aria-label="Merit balance: {total} Merits"`
- Reads from `useMerits()` hook (no props required)

**MeritCostPreview** (`src/components/MeritCostPreview.tsx`):
- Props: `{ featureCost: number }`
- Four render states: loading, zero balance (Out of Merits + CTAs), insufficient (not enough + CTAs), low balance (amber warning), normal (muted text)
- All states include `mb-2` spacing above the Analyze button
- Zero and insufficient states show "Buy Merits" and "Upgrade Plan" CTA links

- Commit: `9cef57f`

### Task 2: Wire badge into TopBar and cost previews into all feature pages

**TopBar.tsx:**
- MeritBalanceBadge rendered conditionally when user is authenticated
- Placed in the gap-3 flex container alongside admin tier switcher, theme toggle, and avatar

**Feature page integration (all 6 pages):**
- Upload.tsx: `resume_analysis` feature key, MeritCostPreview above Analyze button, button disabled on isZero/!canAfford
- CareerCompass.tsx: `career_compass` feature key, same pattern
- SkillsGapAnalysis.tsx: `skills_gap` feature key, applied to both single and multi-job analysis modes
- LinkedInGrader.tsx: `linkedin_grader` feature key, same pattern
- RecruitingLens.tsx: `recruiting_lens` feature key (inside ProFeatureGate)
- InterviewPrep.tsx: `interview_prep` feature key (inside ProFeatureGate)

**D-08 post-analysis balance invalidation:**
- All 6 feature pages call `invalidateMerits()` after analysis completion
- Upload.tsx: after resume analysis stream completes
- CareerCompass.tsx: after career compass analysis completes (both success and error paths)
- SkillsGapAnalysis.tsx: after skills gap analysis completes (both single and multi-job handlers)
- LinkedInGrader.tsx: after LinkedIn grading completes
- RecruitingLens.tsx: after recruiting lens analysis completes
- InterviewPrep.tsx: after interview prep analysis completes

- Commit: `9cef57f` (both tasks in single commit)

## Verification Results

- MeritBalanceBadge.tsx: exports MeritBalanceBadge, contains Popover, aria-label, /shop and /pricing links
- MeritCostPreview.tsx: exports MeritCostPreview, contains "Out of Merits", text-amber-500 for low state
- TopBar.tsx: imports and renders MeritBalanceBadge
- All 6 feature pages contain MeritCostPreview with correct feature keys
- All 6 feature pages contain invalidateMerits() calls after analysis completion
- 7 files contain MeritCostPreview or MeritBalanceBadge references

## Deviations from Plan

None -- plan executed exactly as written. Both tasks were completed in a single commit.

## Self-Check: PASSED

- FOUND: src/components/MeritBalanceBadge.tsx
- FOUND: src/components/MeritCostPreview.tsx
- FOUND: commit 9cef57f
- All 7 target files confirmed containing MeritCostPreview or MeritBalanceBadge
- All 6 feature pages confirmed containing invalidateMerits() calls

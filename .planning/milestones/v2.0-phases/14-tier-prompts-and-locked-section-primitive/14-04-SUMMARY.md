---
phase: 14-tier-prompts-and-locked-section-primitive
plan: 04
subsystem: ui
tags: [react, framer-motion, tailwind, locked-section, tier-gating, shadcn-ui]

requires:
  - phase: none
    provides: standalone UI primitives, no prior phase dependencies
provides:
  - LockedSection React component (flat-props API, blur + lock icon + teaser + CTA)
  - LockedListItem React component (numbered lock card with link CTA)
  - data-testid selectors for TEST-11 Vitest coverage (Plan 08)
affects: [15-resume-analysis-gating, 16-linkedin-grader-gating, 17-career-compass-gating, 18-recruiting-lens-gating, 14-06-dev-sandbox, 14-08-vitest]

tech-stack:
  added: []
  patterns: [flat-props locked-section pattern, useReducedMotion for a11y, skeleton-bar placeholder instead of real content in blurred body]

key-files:
  created:
    - src/components/LockedSection.tsx
    - src/components/LockedListItem.tsx
  modified: []

key-decisions:
  - "Named export (export const) matching ProFeatureGate convention"
  - "Skeleton placeholder bars in blurred body instead of accepting children -- prevents DOM content leakage per threat model T-14-07"
  - "Em-dash via Unicode escape \\u2014 for cross-platform consistency in LockedListItem label"
  - "CSS custom property --locked-item-height with 4rem fallback for height parity escape hatch"

patterns-established:
  - "Flat-props locked-section API: title + teaser + requiredTier, no children prop"
  - "useReducedMotion() guard on all Framer Motion animations in locked primitives"
  - "data-testid + data-required-tier / data-index selector pattern for tier-gated components"

requirements-completed: [GATE-05, GATE-06]

duration: 3min
completed: 2026-04-17
---

# Phase 14 Plan 04: Locked-Section UI Primitives Summary

**LockedSection and LockedListItem components with flat-props API, skeleton-bar blur, lock-icon pulse, and upgrade CTA for tier-gated partial-lock UX**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-17T03:10:08Z
- **Completed:** 2026-04-17T03:12:49Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Built LockedSection with blur-[6px] skeleton bars, animated lock icon with reduced-motion support, tier badge, teaser, and navigate-to-pricing CTA
- Built LockedListItem with numbered "Edit X of N -- Locked" em-dash label, inline lock icon, link-variant CTA, and CSS custom property height escape hatch
- Both components use only semantic Tailwind tokens (no hardcoded hex), expose all four/two data-testid selectors required by TEST-11

## Task Commits

Each task was committed atomically:

1. **Task 1: Build LockedSection.tsx matching 14-UI-SPEC Interaction Contract** - `8d2b631` (feat)
2. **Task 2: Build LockedListItem.tsx matching 14-UI-SPEC** - `2fe2f9a` (feat)

## Files Created/Modified
- `src/components/LockedSection.tsx` - Block-level partial lock: badge + header + blurred skeleton body + lock icon overlay + teaser + upgrade CTA button
- `src/components/LockedListItem.tsx` - Numbered list slot lock: lock icon + "Edit X of N -- Locked" label + optional teaser + link-variant CTA

## Decisions Made
- Used named export (`export const LockedSection`) to match `ProFeatureGate` convention in the codebase
- Skeleton placeholder bars in the blurred body (not real content) to prevent DOM-inspectable data leakage per threat model T-14-07
- Em-dash character via `\u2014` Unicode escape for reliable cross-platform rendering
- CSS custom property `--locked-item-height` with `4rem` fallback allows parent pages to set exact height parity with unlocked siblings

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GATE-05 and GATE-06 structurally ready
- Plan 06 wires these into the `/dev/locked-sections` sandbox route to satisfy SC-4
- Plan 08 adds Vitest coverage against the data-testid selectors to satisfy TEST-11
- Phases 15-19 will use these primitives in feature pages for tier-gated content

## Self-Check: PASSED

- [x] src/components/LockedSection.tsx exists
- [x] src/components/LockedListItem.tsx exists
- [x] Commit 8d2b631 exists (Task 1)
- [x] Commit 2fe2f9a exists (Task 2)

---
*Phase: 14-tier-prompts-and-locked-section-primitive*
*Completed: 2026-04-17*

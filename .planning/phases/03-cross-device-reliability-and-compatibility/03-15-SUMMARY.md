---
phase: 03-cross-device-reliability-and-compatibility
plan: 15
subsystem: ui
tags: [waiting-surface, honest-progress, accessibility, reduced-motion, playwright]

requires:
  - phase: 03-12
    provides: frozen client error taxonomy and leak guard
  - phase: 03-14
    provides: realtime degradation, offline recovery, and polling fallback
provides:
  - frozen dual-source stage copy with a dormant lifecycle map
  - honest shared analysis waiting surface with no percentage or ETA
  - 45-second background continuation and 120-second non-error recovery copy
  - focus trap, scroll restoration, and reduced-motion compliance
  - OT-7, OT-8, and OT-9 regression proof
affects: [03-16, 03-17, analysis waiting surfaces]

requirements-completed: [XRUN-05, XRUN-03, XDEV-09]

key-files:
  created:
    - src/lib/analysis-stage-copy.ts
    - src/lib/resume-stream-stage-labels.ts
    - src/lib/__tests__/analysis-stage-copy.test.ts
    - src/components/UniversalAnalyzing.test.tsx
    - src/test/platform/universal-analyzing-source-guard.test.ts
    - e2e/cross-device/waiting-surface.spec.ts
  modified:
    - src/components/UniversalAnalyzing.tsx
    - src/hooks/useResumeStream.ts
    - src/test/platform/responsive-source-guard.test.ts
    - .planning/phases/03-cross-device-reliability-and-compatibility/03-DEFECT-REGISTER.md
    - .planning/phases/03-cross-device-reliability-and-compatibility/03-RESIDUAL-REGISTER.md

completed: 2026-07-29
---

# Phase 03 Plan 15: Honest Waiting Surface Summary

`UniversalAnalyzing` now reports only server lifecycle or actually observed stream
progress. The fabricated curve, percentage, ETA, timer-driven checklist, emerald
completion state, blurred orbs, conic spin, and orbiting particles are removed.

## Implementation

- Added a frozen, exhaustive stage-copy module covering all 11 lifecycle states
  and all five feature subjects. The lifecycle source is wired but dormant under
  D-27; `VITE_FEATURE_ANALYSIS_LIFECYCLE` remains default-off.
- Extracted the existing stream labels into one pure frozen module and re-exported
  them from `useResumeStream`, so the hook, component, tests, and Playwright loader
  share one source without importing Supabase into Node test discovery.
- Rebuilt the overlay with a single indeterminate row when no honest source exists,
  an optional lifecycle checklist when the server supplies lifecycle truth, exactly
  one polite live region, a real focus trap, body-scroll restoration, and focus
  return.
- At 45 seconds the frozen reassurance and ghost `Continue in the background`
  control appear. It dismisses only the overlay and never cancels the run.
- At 120 seconds the frozen polling copy appears without an alert, destructive
  styling, retry claim, or client-declared failure. A non-sensitive in-memory
  start timestamp preserves threshold truth across transport-driven React remounts.
- The only infinite animation is the indeterminate spinner and it is gated by
  `useReducedMotion`; reduced motion renders a static indicator.

## Validation

| Gate | Result |
| --- | --- |
| Focused unit/static tests | 22 passed |
| Complete Vitest suite | 143 files, 1144 tests passed |
| Type-check | exit 0 |
| ESLint | exit 0; 0 errors, 151 existing warnings |
| Production build | exit 0 |
| `git diff --check` | exit 0 |
| Waiting-surface Playwright matrix | 14 passed, 2 intentional OT-9 skips |

OT-8 ran on all five configured projects and held the visible stage byte-identical
for 60 seconds. OT-9 ran for 150 seconds on Chromium, mobile WebKit, and mobile
Chromium; desktop Firefox/WebKit are the recorded budget skips. Reduced-motion ran
on all five projects and found zero infinite animations.

The E2E fixture uses only synthetic rows, a synthetic non-secret session, and local
route fulfillment. It starts no analysis, spends no Merit, and accesses no
production system.

## Mutation Proof

The OT-7 source guard was deliberately challenged and restored three times:

1. Reintroduced a rendered `1%` readout — guard failed.
2. Reintroduced an `expectedDurationMs` prop — guard failed.
3. Removed the `useReducedMotion` condition — guard failed.

After each mutation the source was restored; the final focused and full gates are
green.

## Plan Reconciliation and Scope

- XD-23 is closed with OT-7/OT-8/OT-9 regression slots.
- XD-24's waiting-surface half is closed and the temporary 03-10 motion exclusion
  is removed.
- `Results.tsx` keeps its previously validated 120-second non-error recovery
  screen. OT-9 accepts that parent-owned integration state when it replaces the
  overlay, while the component test proves the exact overlay polling copy.
- `Results.tsx`, `Onboarding.tsx`, Phase 2, Supabase, migrations, and the lifecycle
  feature flag are untouched.

## Deviations

- The plan requested importing stream labels from `useResumeStream`; doing so made
  Playwright's Node loader evaluate `supabaseClient`. The labels were moved to a
  pure frozen module and re-exported from `useResumeStream`, preserving a single
  source of truth and exact equality.
- Long multi-engine cases initially raced the shared seeded auth session. The spec
  now installs a synthetic session and fulfills auth locally, matching its already
  synthetic database/job fixture and removing external flakiness.

## Remaining Risk

The lifecycle checklist remains intentionally dormant until the default-off flag
is separately approved. On the live path, callers whose legacy subtitle is not one
of the permitted stream labels correctly receive the indeterminate fallback rather
than a guessed stage. `Results.tsx` may replace the overlay with its existing
non-error recovery surface at its own 120-second boundary; changing that protected
parent was outside this plan.

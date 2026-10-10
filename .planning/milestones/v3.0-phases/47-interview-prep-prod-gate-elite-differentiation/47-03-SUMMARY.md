---
phase: 47-interview-prep-prod-gate-elite-differentiation
plan: "03"
subsystem: frontend-navigation
tags:
  - phase-47
  - interview-prep
  - production-gate
  - navigation
  - tdd
  - coming-soon
requirements:
  - IPC-PROD-NAV
  - IPC-PROD-DASHBOARD-TILE
dependency_graph:
  requires:
    - "src/config/feature-flags.ts (isInterviewPrepEnabled, from plan 47-00)"
    - "src/components/ComingSoonBadge.tsx (from plan 47-01)"
    - "src/components/ui/tooltip.tsx (existing shadcn primitives)"
    - "react-router-dom (Link)"
  provides:
    - "Gated AppSidebar Interview Prep entry (disabled + Coming Soon tooltip when flag off)"
    - "Gated ExploreFeatures Interview Prep tile (disabled + ComingSoonBadge when flag off)"
    - "Gated Navbar Interview Prep entries — desktop nav (tooltip) + mobile drawer (badge)"
  affects:
    - "src/components/AppSidebar.tsx"
    - "src/components/ExploreFeatures.tsx"
    - "src/components/Navbar.tsx"
tech_stack:
  added: []
  patterns:
    - "useMemo wrapping nav-item arrays so consumers can read flag state in-component"
    - "Inline ComingSoonBadge for touch surfaces (mobile drawer, popover tile); Tooltip for desktop nav"
    - "Type-safe duck-check (\"disabled\" in l && (l as { disabled?: boolean }).disabled) — keeps mixed publicLinks / authedPrimaryLinks unions compiling without widening either tuple"
    - "vi.mock + vi.stubEnv pattern for surface-level RTL tests of flag-gated components"
key_files:
  created:
    - "src/components/__tests__/AppSidebar.interviewPrep.test.tsx"
    - "src/components/__tests__/ExploreFeatures.interviewPrep.test.tsx"
    - "src/components/__tests__/Navbar.interviewPrep.test.tsx"
    - ".planning/phases/47-interview-prep-prod-gate-elite-differentiation/47-03-SUMMARY.md"
  modified:
    - "src/components/AppSidebar.tsx"
    - "src/components/ExploreFeatures.tsx"
    - "src/components/Navbar.tsx"
decisions:
  - "AppSidebar: reuse existing disabled?: boolean plumbing (line 70 className + onClick guard) — flip a single field in the useMemo'd topNavItems"
  - "ExploreFeatures: move FEATURES from module scope to in-component useMemo so it can read the flag; change handleFeatureClick signature from (path) to (feature) so it has the disabled bit"
  - "Navbar: gate by toggling a disabled field on the IP entry in authedPrimaryLinks, then render the disabled variant differently per surface — Tooltip on desktop NavigationMenu, inline ComingSoonBadge on mobile Popover drawer (tooltips don't work on touch)"
  - "Navbar mobileNavMeta (line 252) left unchanged — pure visual config (icon + colors), gate lives in the render path, not the icon table (per plan §5)"
  - "Type-safe disabled-field detection via duck check on the union (publicLinks lacks disabled, authedPrimaryLinks has it on the IP entry only) — avoids touching publicLinks type or introducing a shared NavLink interface"
metrics:
  duration_minutes: 8
  completed_date: "2026-05-11"
  tasks_completed: 3
  files_created: 4
  files_modified: 3
  tests_added: 6
---

# Phase 47 Plan 03: Navigation Surface Gates Summary

Gated the three navigation surfaces (Navbar desktop+mobile, AppSidebar, ExploreFeatures popover tile) so the Interview Prep entry stays visible but disabled with a "Coming Soon" affordance whenever `isInterviewPrepEnabled()` returns false, and is byte-identical to today when the flag is on.

## One-liner

Three TDD-driven nav-surface gates wired to `isInterviewPrepEnabled()` — disabled state + ComingSoonBadge/tooltip on flag-off, identical to today on flag-on — covering every render site (AppSidebar: 1, ExploreFeatures: 1, Navbar: 2).

## Render-site audit (per plan output spec)

### Navbar.tsx — 2 distinct render sites gated

* **Line 164** (authedPrimaryLinks definition): added `disabled: !interviewPrepEnabled` field on the Interview Prep entry inside the `useMemo` array.
* **Mobile Popover drawer (~line 322)**: disabled variant renders a `Link to="#"` with `aria-disabled`, `pointer-events-none`, `onClick.preventDefault`, and an inline `<ComingSoonBadge />` next to the label.
* **Desktop NavigationMenu (~line 380)**: disabled variant wraps the Link in a shadcn `<Tooltip>` showing `"Interview Prep · Coming Soon"` on hover, with `pointer-events-none` on the Link itself.

**Line 252** (`mobileNavMeta` icon palette): intentionally left unchanged — this is a visual config (icon + colors), and the disabled treatment is wired in the link renderer, not the icon table (per plan §5).

### AppSidebar.tsx — 1 render site gated

* **Line ~54** (Interview Prep entry inside the `useMemo`'d `topNavItems`): set `disabled: !interviewPrepEnabled`. The existing `disabled?: boolean` plumbing — Link `to="#"` swap, `aria-disabled`, `pointer-events-none` className, and `onClick.preventDefault` — handles the disabled rendering for both expanded and collapsed states. The collapsed-state Tooltip content swaps from `"Interview Prep"` to `"Interview Prep · Coming Soon"` based on the same field.

### ExploreFeatures.tsx — 1 render site gated

* **Lines 71–86** (Interview Prep entry inside the in-component `useMemo`'d `FEATURES`): set `disabled: !interviewPrepEnabled`. The button render at line ~138 applies `disabled` attribute, `opacity-50 cursor-not-allowed` Tailwind, and renders an inline `<ComingSoonBadge />`. The click handler short-circuits when `feature.disabled` is true.

## Total test count

* **6 tests** across the three new files:
  * `AppSidebar.interviewPrep.test.tsx` — 2 tests (flag off, flag on)
  * `ExploreFeatures.interviewPrep.test.tsx` — 2 tests (flag off, flag on)
  * `Navbar.interviewPrep.test.tsx` — 2 tests (flag off, flag on; queries the whole document so a missed render site is a regression failure)

## Performance

* **Duration:** ~8 min
* **Tasks:** 3
* **Files created:** 4 (3 test files + this summary)
* **Files modified:** 3 (AppSidebar.tsx, ExploreFeatures.tsx, Navbar.tsx)

## Completed Tasks

| Task | Name                                                  | Commits                                          | Files                                                                                                       |
| ---- | ----------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 1    | Gate AppSidebar Interview Prep entry                   | `39e1ab7` (test, RED), `6ce7da3` (feat, GREEN)   | `src/components/AppSidebar.tsx`, `src/components/__tests__/AppSidebar.interviewPrep.test.tsx`               |
| 2    | Gate ExploreFeatures Interview Prep tile               | `aa6e6e5` (test, RED), `c03018c` (feat, GREEN)   | `src/components/ExploreFeatures.tsx`, `src/components/__tests__/ExploreFeatures.interviewPrep.test.tsx`     |
| 3    | Gate Navbar Interview Prep entries (desktop + mobile) | `daa0922` (test, RED), `75b9e9f` (feat, GREEN)   | `src/components/Navbar.tsx`, `src/components/__tests__/Navbar.interviewPrep.test.tsx`                       |

## Verification Results

| Gate                                                                                                                                                                              | Result                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run src/components/__tests__/AppSidebar.interviewPrep.test.tsx src/components/__tests__/ExploreFeatures.interviewPrep.test.tsx src/components/__tests__/Navbar.interviewPrep.test.tsx` | **6/6 passing**                                                                                                                                                                                                                                                                                          |
| `npx eslint <touched source files>`                                                                                                                                              | 2 pre-existing `@typescript-eslint/no-explicit-any` errors in `ExploreFeatures.tsx:22` and `Navbar.tsx:59` (both `useState<any>(null)` for the user session). These pre-date plan 47 (April 2026 in git history) and are out of scope per SCOPE BOUNDARY. No new lint errors introduced.            |
| `npx tsc --noEmit` filtered to touched files                                                                                                                                     | Clean. The only project-wide TS error is `src/__tests__/App.routes.interviewPrep.test.tsx(48,17)` — pre-existing from plan 47-02, not introduced here. None of the three components or three new test files emit any error.                                                                            |
| Grep audit: every match of `/interview-prep` in the three components                                                                                                              | Each match is inside a flag-aware code path: AppSidebar `topNavItems` useMemo, ExploreFeatures `FEATURES` useMemo, Navbar `authedPrimaryLinks` useMemo, Navbar `mobileNavMeta` (visual config — render path is gated, not the icon table). No bare un-gated link remains.                              |

## TDD Gate Compliance

Each of the three tasks shipped as a strict RED/GREEN pair (no REFACTOR commits were needed — implementation was minimal enough on first pass):

* Task 1: `test(47-03): add failing test for AppSidebar Interview Prep gate` (RED, 39e1ab7) → `feat(47-03): gate AppSidebar Interview Prep entry behind isInterviewPrepEnabled` (GREEN, 6ce7da3)
* Task 2: `test(47-03): add failing test for ExploreFeatures Interview Prep gate` (RED, aa6e6e5) → `feat(47-03): gate ExploreFeatures Interview Prep tile behind isInterviewPrepEnabled` (GREEN, c03018c)
* Task 3: `test(47-03): add failing test for Navbar Interview Prep gate` (RED, daa0922) → `feat(47-03): gate Navbar Interview Prep entries behind isInterviewPrepEnabled` (GREEN, 75b9e9f)

All RED commits saw the flag-off test case fail before the corresponding feat commit was applied.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] AppSidebar test query was too restrictive**

* **Found during:** Task 1 GREEN verification (first run of the new test still failed after wiring the gate).
* **Issue:** The initial RED test used `document.querySelectorAll('a[href="/interview-prep"], a[href="#"]')` plus a filter, which failed to match because the Link's `href` rendering wasn't consistent across React Router versions and the `#` fallback applied. The fix was unrelated to the implementation — just a more reliable query selector.
* **Fix:** Re-anchored the query on the label text ("Interview Prep" span) and walked to the closest `<a>`. Made the test robust to href fallback variation.
* **Files modified:** `src/components/__tests__/AppSidebar.interviewPrep.test.tsx`
* **Commit:** Folded into Task 1 GREEN commit (6ce7da3) — both source change and test selector fix shipped together.

**2. [Rule 3 — Blocking issue] Framer-motion proxy mock broke Radix PopoverTrigger**

* **Found during:** Task 2 RED verification (initial test couldn't open the popover).
* **Issue:** The first cut of the ExploreFeatures test mocked `framer-motion`'s `motion` proxy to render `motion.button` as a plain `<button>`. This broke Radix `PopoverTrigger asChild` because the replacement element didn't forward refs properly.
* **Fix:** Dropped the framer-motion mock entirely. Real `motion.button` renders fine under jsdom (animations are no-ops without rAF). Saved a layer of mocking and made the test more representative of production rendering.
* **Files modified:** `src/components/__tests__/ExploreFeatures.interviewPrep.test.tsx`
* **Commit:** Folded into Task 2 RED commit (aa6e6e5).

### Out-of-Scope Pre-existing Issues (Logged, Not Fixed)

* **Pre-existing `useState<any>` lint errors:** `src/components/Navbar.tsx:59` and `src/components/ExploreFeatures.tsx:22` both use `useState<any>(null)` for the Supabase user session. ESLint flags these as `@typescript-eslint/no-explicit-any`. Both pre-date Phase 47 (introduced April 2026). Not fixed here per SCOPE BOUNDARY. A follow-up cleanup plan should swap `any` for `Session['user'] | null` or similar.
* **Pre-existing TS error in `src/__tests__/App.routes.interviewPrep.test.tsx:48`:** `Type 'VitestUtils' is not assignable to type 'Awaitable<void>'`. This file ships from plan 47-02 and is unrelated to the three new test files in this plan.

## Authentication Gates

None — pure frontend UI work, no auth surface touched.

## Out of Scope (Confirmed Honored)

* No `/interview-prep` route logic touched (plan 47-02's responsibility).
* No pricing surface mutations (plan 47-04).
* No AnalysisHistory filtering (plan 47-05).
* No Vercel env-var setup (plan 47-06).
* No removal of the Interview Prep entry from any nav (D-01: visible + disabled, never hidden).
* No icon, color, or position changes — only the disabled state + Coming Soon affordance.

## Known Stubs

None. The three components now consume the live `isInterviewPrepEnabled()` helper. No placeholder data or "TODO" markers introduced.

## Rollback

Trivial: `git revert 75b9e9f daa0922 c03018c aa6e6e5 6ce7da3 39e1ab7` removes both pairs in reverse order. The three components return to their pre-Phase-47 state (Interview Prep entry permanently visible and clickable everywhere). Each task's commit pair is independent — partial rollback (e.g., revert Task 3 only) is safe.

## Self-Check: PASSED

* FOUND: `src/components/__tests__/AppSidebar.interviewPrep.test.tsx`
* FOUND: `src/components/__tests__/ExploreFeatures.interviewPrep.test.tsx`
* FOUND: `src/components/__tests__/Navbar.interviewPrep.test.tsx`
* FOUND: modifications to `src/components/AppSidebar.tsx`, `src/components/ExploreFeatures.tsx`, `src/components/Navbar.tsx`
* FOUND: commit `39e1ab7` (Task 1 RED)
* FOUND: commit `6ce7da3` (Task 1 GREEN)
* FOUND: commit `aa6e6e5` (Task 2 RED)
* FOUND: commit `c03018c` (Task 2 GREEN)
* FOUND: commit `daa0922` (Task 3 RED)
* FOUND: commit `75b9e9f` (Task 3 GREEN)
* Verified: `npx vitest run` 6/6 pass after final state
* Verified: grep audit shows every `/interview-prep` match in the three components is in a flag-aware code path

---
*Phase: 47-interview-prep-prod-gate-elite-differentiation*
*Plan: 03*
*Completed: 2026-05-11*

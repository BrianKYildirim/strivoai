---
phase: 03-cross-device-reliability-and-compatibility
plan: 10
subsystem: frontend
tags: [responsive, dvh, viewport-units, touch-targets, tap-target, ios-focus-zoom, wcag-1.4.4, motion-budget, prefers-reduced-motion, framer-motion, source-guard, xdev, regression-promotion]

# Dependency graph
requires:
  - phase: 03-cross-device-reliability-and-compatibility (plan 03-05)
    provides: "the reproduced defect rows (XD-04 … XD-13, XD-24) with named offending elements, plus the two discovery specs and the shared e2e/cross-device/surfaces.ts case table"
  - phase: 03-cross-device-reliability-and-compatibility (plan 03-03)
    provides: "the 5-project @xdev matrix, the tag convention and the measured e2e budget"
provides:
  - ".min-h-viewport / .h-viewport — single-rule vh-then-dvh utilities with a deterministic cascade"
  - "Zero horizontal overflow on all 10 audit surfaces at 8 widths x 2 themes x 5 projects"
  - "Form controls >= 16px below md (no iOS focus zoom) with pinch-zoom preserved"
  - ">= 44x44 hit areas with >= 8px separation on the audit surfaces, desktop boxes unchanged"
  - "src/test/platform/responsive-source-guard.test.ts — the static half of UI-SPEC Surface F, mutation-proven"
  - "responsive.spec.ts + touch-targets.spec.ts promoted from discovery to regression (XTEST-03)"
  - "Harness finding H-4: test.use({ reducedMotion }) silently no-ops in this config"
affects: [03-07, 03-15, 03-17, 03-19, 03-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A CSS contract whose failure mode is cascade ORDER is asserted on the emitted text, not in a browser — once min-height resolves there is one value left and the inversion is invisible"
    - "The motion budget is proven by two mechanisms that fail for different reasons; getAnimations() cannot see framer RAF loops, and a source guard cannot see what a dependency's stylesheet injects"
    - "The static guard walks the REAL import graph from the route entry points rather than a hand-maintained file list, so a defect in a transitively-pulled shared primitive is in scope"
    - "Every guard exclusion must name the plan that owns it, and a further assertion proves the excluded file still exists so the list cannot rot"
    - "Any spec asserting a media preference must assert matchMedia landed before asserting anything downstream of it"
    - "Hit areas grow with min-h/min-w below md only; the visual element, spacing scale and desktop box are never touched"

key-files:
  created:
    - src/test/platform/responsive-source-guard.test.ts
  modified:
    - src/index.css
    - src/components/ui/textarea.tsx
    - src/components/ui/select.tsx
    - src/components/ui/input.tsx
    - src/components/ui/button.tsx
    - src/components/ui/badge.tsx
    - src/components/EliteFeatureGate.tsx
    - src/components/ProFeatureGate.tsx
    - src/components/BlurredLockCard.tsx
    - src/components/BelowFold.tsx
    - src/components/AnalysisExperience.tsx
    - src/components/ui/testimonials-columns.tsx
    - src/components/career-compass/FieldsTab.tsx
    - e2e/cross-device/responsive.spec.ts
    - .planning/phases/03-cross-device-reliability-and-compatibility/03-DEFECT-REGISTER.md
    - .planning/phases/03-cross-device-reliability-and-compatibility/03-RESIDUAL-REGISTER.md

key-decisions:
  - "The dvh fallback is ONE custom utility emitting vh then dvh in a single rule, not the Tailwind pair min-h-screen min-h-[100dvh] — Tailwind emits utilities grouped by property with its own internal sort, so class order does not determine which min-height wins, and that pattern produces a fallback that works on one build and inverts on another"
  - "Reduced motion is closed by TWO mechanisms, not one: a blanket @media (prefers-reduced-motion: reduce) reset in index.css for CSS animations (unreachable from useReducedMotion()) and a per-component useReducedMotion() gate for framer-motion loops (unreachable from the media query)"
  - "Loading spinners and skeletons are NOT gated behind useReducedMotion() — a waiting affordance must survive; they are clamped by the CSS reset instead, which is why the static guard's rule is scoped to repeat: Infinity rather than to every animate-* utility"
  - "The static guard walks the real import graph (126 files) rather than a hand-listed set, with exactly one exclusion (UniversalAnalyzing.tsx) carrying 03-15 as its named owner"
  - "page.emulateMedia() before the first navigation, NOT test.use({ reducedMotion }) — the documented top-level form silently no-ops in this config (H-4)"
  - "viewport-fit=cover and env(safe-area-inset-*) are asserted as a PAIRED invariant rather than as a bare requirement, because 03-07 owns the index.html edit; the rule is meaningful today and becomes load-bearing the moment 03-07 lands"
  - "The three testimonial marquees at lg+ are ACCEPTED (R-22) rather than collapsed — F6 is about the constrained device, which now runs one; reducing the wall to two columns is a visual-design change outside this plan"

metrics:
  tasks: 3
  commits: 3
  duration: "two sessions (interrupted mid-Task-3 by a provider session limit)"
  completed: 2026-07-28
---

# Phase 03 Plan 10: Responsive, Touch and Motion Contract Summary

Closed UI-SPEC Surface F across the ten audit surfaces: deterministic `dvh`
utilities, zero horizontal overflow at eight widths in both themes on all five
engines, `>= 16px` form controls with pinch-zoom preserved, `>= 44x44` hit areas,
and an animation budget enforced by two independent proofs.

## Defect-register rows closed

| Row | What it was | Regression proof |
| --- | ----------- | ---------------- |
| **XD-04** | Landing overflow at 320 px, **firefox/webkit/mobile-webkit only** — chromium was clean | `responsive.spec.ts::no horizontal overflow — landing` |
| **XD-05** | `/pricing` at exactly 767 px: `scale-105` gave the highlighted plan a *transformed* width of 772 px, and a transform has no layout box to clamp | `responsive.spec.ts::… — pricing` |
| **XD-06** | A `Badge` holding a model-generated string measured **857 px** wide | `responsive.spec.ts::… — linkedin-grader` |
| **XD-07** | Career Compass fixed-width readiness bars, 131 px past the client width | `responsive.spec.ts::… — career-compass` |
| **XD-08** | The **5910 px** Elite-gate orb, overflowing at 7 of 8 widths on the surface every Free user sees at the upsell | `responsive.spec.ts::… — recruiting-lens` |
| **XD-09** | `/profile` at 320 px — `whitespace-nowrap` on a button whose label exceeded the gutter-reduced width | `responsive.spec.ts::… — profile` |
| **XD-10** | Viewport-anchored `w-full` containers, mobile-chromium only | The same four tests, on `mobile-chromium` |
| **XD-11** | **49** interactive elements smaller than 44x44, several of them money-path CTAs | `touch-targets.spec.ts::… — <surface>` (all 10) |
| **XD-12** | **28** adjacent tap-target pairs 4 px apart against an 8 px contract | Same ten tests |
| **XD-13** | `textarea` and `select` computed 14 px, so iOS Safari zoomed on focus and did not zoom back | `touch-targets.spec.ts::… — profile` **and** `responsive-source-guard.test.ts::F5/XD-13` |
| **XD-24** (03-10's half) | Reduced motion honoured in 2 files; no enforced budget | `responsive-source-guard.test.ts::F6/XD-24` **and** `responsive.spec.ts::reduced-motion budget @xdev` |

XD-24's remainder — `blur-3xl` on the three animated `UniversalAnalyzing.tsx`
elements, and the device-capability signal — stays with **03-15**.

## The two things that were nearly false green

**1. `test.use({ reducedMotion: 'reduce' })` silently no-ops here (H-4).** The
documented top-level form does not reach the page: `matchMedia('(prefers-reduced-motion: reduce)').matches`
stayed `false` on all five projects. Every assertion written under it would have
measured the **default** state and reported it as a reduced-motion pass — a green
run over precisely the contract it claims to check. It was caught only because
the spec asserts `matchMedia` landed *before* asserting the count. The block now
calls `page.emulateMedia()` before the first navigation, and the precondition
stays in as the tripwire. Recorded as **H-4** so the next spec asserting a media
preference carries the same guard.

**2. `document.getAnimations()` cannot see framer-motion.** A count taken under
`reduce` returns zero while a perpetual RAF loop is still running — on exactly the
low-memory phone XDEV-09 is about. This is why the budget has two proofs and why
neither was allowed to stand alone.

## Where the register's diagnosis was wrong

XD-24's counts were *static greps*; the *concurrent* counts on a live page were
different, and the real breaches were elsewhere.

- `AdminUsage.tsx` (6) is **not an audit surface** — the seeded user is non-admin.
- The `animate-*` hits in `Auth` (4), `Profile` (3) and `LinkedInGrader` (3) are
  conditional `Loader2` spinners and loading skeletons that do not run at rest.
  Gating a waiting affordance behind `useReducedMotion()` would be actively
  wrong, so they are closed by the blanket CSS reset instead.
- The genuine breaches were **`ProFeatureGate` (6 concurrent loops)** — the twin
  03-05 never flagged for motion, missed because it only shared XD-08's overflow
  class — **`EliteFeatureGate` (6)**, **`BlurredLockCard` (2 loops x up to 3
  instances on one Career Compass screen)**, and **`BelowFold`**.

`BelowFold` was the sharpest one: `hidden lg:block` is `display: none`, which
**hides a framer-motion loop without stopping it**. A 390 px phone was driving
three testimonial marquees to render one. Not mounting the off-breakpoint columns
takes the constrained device from three concurrent infinite animations to one.

## Verification

| Gate | Result |
| ---- | ------ |
| `responsive.spec.ts` + `touch-targets.spec.ts`, all 5 projects | **96 passed, 0 failed** |
| `responsive-source-guard.test.ts` | 9 passed; **4 mutations proven red**, each reverted |
| `npm run test` | 899 passed / 124 files |
| `npm run lint` | 0 errors (151 pre-existing warnings) |
| `npm run type-check` | clean |
| `npm run build` | exit 0 |

**Mutation proof** (each reverted, tree confirmed byte-identical afterwards):
revert `textarea.tsx` to `text-sm` → red; add `user-scalable=no` to the viewport
meta → red; strip `useReducedMotion` from a gated surface file → red; delete the
`animation-iteration-count: 1 !important` reset → red.

**Budget:** the new reduced-motion block measured **31.2 s** for 26 cases across
five projects (a conservative figure — it includes webServer start and the
`setup` project). The `<= 2` default-motion assertion cost **zero extra
navigations**: it was folded into the page load the overflow test already paid
for. Against R-16's ~74 s remaining, roughly **43 s of headroom** is left.

`npm run test:e2e` was **not** re-measured end-to-end. The full lane is red for
two *recorded environment* reasons — **R-10** (four chromium specs need the
CI-only `AI_TEST_MODE`) and **R-20** (the `@xdev` lane is intentionally red
pending Waves 3–5) — so a wall-clock taken from it would time a partially
aborted run and misreport the budget. `AI_TEST_MODE` was deliberately not set,
no `.env*` was touched, and no assertion was weakened to manufacture green.
**03-17** owns the authoritative re-measure.

## Hand-offs

- **03-07** — `index.html` was not touched. The guard asserts the WCAG 1.4.4 half
  (no `user-scalable`, no `maximum-scale`) as a hard rule today, and expresses
  `viewport-fit=cover` + `env(safe-area-inset-*)` as a **paired** invariant that
  becomes load-bearing the moment 03-07 opts the page into the display cutout.
- **03-15** — `UniversalAnalyzing.tsx` was not touched. It is the single named
  exclusion in the source guard. Two rules already exist and will go red the
  moment the exclusion is lifted: the `useReducedMotion()` gate and the
  `blur-3xl`-on-an-animated-element rule (3 occurrences). It should also adopt
  `.min-h-viewport` as part of the Surface D rewrite.
- **03-17 / 03-19** — residuals **R-21** (reduced-motion browser count scoped to
  the 4 surfaces that carry any motion; the unscoped source guard is the stronger
  proof and was *not* narrowed) and **R-22** (3 marquees at `lg`+, accepted).

## Deviations from plan

**[Rule 2 — missing critical functionality] `ProFeatureGate.tsx` motion.** The
plan and register named it only for XD-08's overflow class. It is
`EliteFeatureGate`'s twin and carried the same six concurrent infinite loops on a
paid-upsell surface. Fixed with the identical treatment in the Task 3 commit.

**[Rule 2] `BelowFold` / `testimonials-columns` / `AnalysisExperience` gating.**
Not named in the register — surfaced by walking the real import graph rather than
the hand-listed files, which is the argument for building the guard that way.

**[Rule 1 — bug] The `input.tsx` assertion.** The guard first required the literal
adjacent string `text-base md:text-sm`; `input.tsx` ships the same contract with
the two classes at opposite ends of the shadcn class string. Assertion corrected
to a token check with `\b` boundaries — the string also contains `file:text-sm`,
which is the file-picker label, not the control's font size.

**Scope guard held:** no hardcoded color introduced, no new breakpoint,
`UniversalAnalyzing.tsx` and `index.html` untouched, and nothing was written
outside this phase directory.

## Commits

| Hash | Task |
| ---- | ---- |
| `49135689` | Task 1 — deterministic dvh utilities and zero horizontal overflow |
| `3e247b99` | Task 2 — form-control font size and 44x44 tap targets |
| `2a3ba66a` | Task 3 — the F6 motion budget, enforced by two independent proofs |

---

*Phase: 03-cross-device-reliability-and-compatibility · Plan 10 · requirements XDEV-05, XDEV-09*

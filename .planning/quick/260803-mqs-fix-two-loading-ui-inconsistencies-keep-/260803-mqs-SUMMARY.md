---
phase: quick/260803-mqs-fix-two-loading-ui-inconsistencies-keep-
plan: 01
subsystem: frontend/analysis-waiting-surface
tags: [loading-ui, onboarding, design-tokens, accessibility, a11y]
status: complete
completed: 2026-08-03
requires:
  - src/components/AnalysisWaitingHost.tsx (mounted above <Routes> in App.tsx)
  - src/components/UniversalAnalyzing.tsx (restored pre-July-29 loader, quick 260803-hwm)
provides:
  - Route-independent, continuously-mounted onboarding wait across the /results boundary
  - stageLabels carry-forward on same-key label-less waiting-surface updates
  - "success" semantic design token (first green in the system)
  - Green completion tick with an sr-only label on all six analysis surfaces
affects:
  - src/pages/Onboarding.tsx
  - src/contexts/AnalysisLockContext.tsx
  - src/index.css
  - tailwind.config.ts
  - src/components/UniversalAnalyzing.tsx
tech-stack:
  added: []
  patterns:
    - "Host-owned waiting surface (Upload precedent) instead of page-level overlay"
    - "Fail-safe teardown via a single negated handoff flag in the existing finally"
    - "Semantic colour token consumed as a Tailwind class, never a colour literal"
key-files:
  created:
    - src/pages/__tests__/Onboarding.waiting-handoff.test.ts
  modified:
    - src/contexts/AnalysisLockContext.tsx
    - src/pages/Onboarding.tsx
    - src/pages/Results.tsx
    - src/index.css
    - tailwind.config.ts
    - src/components/UniversalAnalyzing.tsx
    - src/components/AnalysisWaitingHost.test.tsx
    - src/components/UniversalAnalyzing.test.tsx
    - src/test/platform/universal-analyzing-source-guard.test.ts
decisions:
  - "D1: Onboarding renders NO overlay of its own and delegates entirely to AnalysisWaitingHost, making 'exactly one overlay' structural rather than timing-dependent."
  - "D2: Carry-forward lives in AnalysisLockContext, not Results.tsx — Results' isStreamMode gate and branch-3 `{}` stay byte-identical."
  - "D5: The left completed badge is recoloured to success alongside the right-hand tick, so a completed row shows one completion colour rather than coral + green."
  - "D6: --success uses the palette's existing green hue family (--btn-job), dark 152 62% 50% / light 152 68% 34%."
metrics:
  duration: ~22min
  tasks: 3
  files: 10
---

# Quick 260803-mqs: Fix Two Loading-UI Inconsistencies Summary

Onboarding's analysis wait now lives on the route-independent `AnalysisWaitingHost`, so the restored
5-step ladder survives the mid-flight `navigate('/results/:id')` instead of collapsing to the
single-row fallback; completed stage rows render a green tick backed by the system's first `success`
design token, with the word "Done" kept for screen readers only.

## Root Cause (exact)

Two independent causes, both confirmed in source before the fix:

1. **Onboarding handoff.** `Onboarding.tsx` rendered its own page-level `<UniversalAnalyzing>` gated
   on local `analyzing` state. The submit path calls `navigate(\`/results/${resume.id}\`)` **while the
   analysis promise is still in flight** (the dormant branch, 100% of traffic today), and React Router
   unmounts the page — destroying that overlay. `Results.tsx` then mounts and seeds the waiting
   surface on the same `'resume-analysis'` key with the **branch-3 `...{}` spread** (no `stageLabels`,
   because the non-stream path deliberately has no ladder). `AnalysisLockContext.showWaitingSurface`
   **replaced the record wholesale** (`return surface`), so the label-less update erased a ladder that
   was already live and the user dropped from five rows to the single-row
   `'Working on your analysis'` fallback mid-wait.

2. **Completion affordance.** `StageRow`'s completed branch rendered the literal string `Done` in
   `text-primary`. `--primary` is coral, and the palette had **no green token at all**, so there was
   nothing for a "done" tick to resolve to.

## What Was Built

### Task 1 — host-owned onboarding wait + carry-forward (`f1e499bb`)

- `AnalysisLockContext.showWaitingSurface` now computes a merged record first: a **same-key** update
  that **omits `stageLabels`** while a ladder is live inherits `stageLabels` + `activeStageIndex`
  from the current record. The pre-existing equality bail then runs against the **merged** record, so
  a repeat call still returns `current` and cannot cause re-render churn.
- `Onboarding.tsx` no longer imports or renders `<UniversalAnalyzing>`; the `analyzing` state and both
  `setAnalyzing` calls are gone. At the FULL-path commit point it seeds the host with
  `key: 'resume-analysis'`, `title: 'Analyzing your resume'` (byte-identical to Results' non-elite
  title, which keys both the step timer and the 45s/120s thresholds) and `ONBOARDING_STAGE_LABELS`.
  `activeStageIndex` is deliberately omitted so the sanctioned timed advance drives the ladder.
- Fail-safe teardown: one `handedOffToResults` flag set immediately before each of the four
  `/results` navigations, with `if (!handedOffToResults) hideWaitingSurface('resume-analysis')` in the
  existing `finally`. Every non-navigating exit — validation failure, terminal failure, unexpected
  throw, or a future branch — drops the overlay.
- `Results.tsx` is **comment-only** (`git diff --stat`: 6 insertions, 0 deletions). The
  `isStreamMode` gate and the branch-3 `{}` are untouched.

### Task 2 — `success` token + green tick (`1e1bc89c`)

- `--success` / `--success-foreground` declared in both the `:root, .dark` and `.light` blocks
  (dark `152 62% 50%`, light `152 68% 34%`), as bare HSL triplets matching every existing token.
- `tailwind.config.ts` registers `success` → `hsl(var(--success))`.
- `StageRow`: the right-hand slot renders a lucide `Check` (`h-4 w-4`, `aria-hidden`) inside a
  `text-success` wrapper plus `<span className="sr-only">Done</span>`; the wrapper's old
  `aria-hidden="true"` was removed so the label is not suppressed. The left completed badge moves to
  `bg-success/20` + `text-success`, with its spring-scale entrance preserved verbatim.
- All six analysis surfaces (Onboarding, Upload/Results via the host, InterviewPrep, CareerCompass,
  RecruitingLens, LinkedInGrader) share this one `StageRow`, so the tick reaches all of them.

### Task 3 — tests (`bec8787b`)

- `AnalysisWaitingHost.test.tsx`: +3 cases — the carried ladder across the exact two-call boundary
  sequence; the **negative control** (unseeded wait still gets the single row); a caller-supplied
  ladder still replaces.
- `Onboarding.waiting-handoff.test.ts` (new): static wiring guard — `useAnalysisLock` consumed, seed
  shape and title pinned, **no** `<UniversalAnalyzing` in the file, every `/results` navigation
  preceded by a `handedOffToResults = true;` (iterated, not counted), and the `finally` fail-safe.
- `UniversalAnalyzing.test.tsx`: exactly one `Done`, it has `sr-only`, and a tick `svg` renders inside
  `.text-success`.
- Source guard: **one ADDED `it`**, zero deletions, zero narrowings. The `repeat: Infinity`
  budget of 12 and every existing assertion are untouched.

## Verification Results (real)

| Gate | Command | Result |
| ---- | ------- | ------ |
| 1 | `npm run lint` | **PASS** — exit 0; 153 problems, **0 errors**, 153 warnings (all pre-existing) |
| 2 | `npm run type-check` | **PASS** — exit 0, no output |
| 3 | `npm run test` | **PASS** — exit 0; **154 files / 1208 tests passed**, 0 failed |
| 4 | `npx playwright test e2e/cross-device/waiting-surface.spec.ts e2e/cross-device/realtime-fallback.spec.ts --project=chromium` | **PASS** — exit 0; **8 passed, 2 skipped** (the two pre-existing OT-11 quarantined cases), 3.8m |

**OT-8 did NOT flake this run.** `OT-8: a frozen server cannot advance the visible stage for 60
seconds` passed in **1.0m** in the batched run, so no isolation re-run was required. The known
intermittent 140s timeout was not reproduced. OT-9 (2.5m) and the reduced-motion count also passed.

Mutation check (plan Task 3 verify): removing the `surface.stageLabels === undefined` clause from the
carry-forward condition **does** fail the suite — but via case 3 (*"still replaces the ladder when the
caller supplies one of its own"*), **not** case 2 as the plan predicted. That is expected on
reflection: the negative control has `current === null`, so no carry-forward path is reachable there
regardless of that clause. The clause was reverted immediately (`git checkout --`), verified back in
place at line 63, and the suite is green.

Additional plan checks:
- `rg '<UniversalAnalyzing' src/pages/*.tsx` → InterviewPrep, CareerCompass, RecruitingLens,
  LinkedInGrader only (Onboarding intentionally gone).
- `git diff --stat` touches **nothing** under `supabase/`, `scripts/`, or `*.sql`.
- `rg -c 'repeat: Infinity' src/components/UniversalAnalyzing.tsx` → **12** (unchanged).
- `npm run build` succeeded and `rg -o 'text-success' dist/assets/*.css` found the generated utility,
  proving the Tailwind registration reached the bundle.

**Not run here:** `npm run verify:baseline` in full — it additionally requires the remote Deno edge
tests (`test:edge` + `test:edge:remote`) and the full Playwright matrix, which were out of scope for
this frontend-only change and were not executed.

## Owed Human Check (cannot be self-certified)

Two claims are visual and were **not** confirmed by an agent:

1. **The green tick actually reads as green** in both themes on a real display — token values
   (`152 62% 50%` dark / `152 68% 34%` light) were chosen for hue-family consistency and contrast, but
   nobody has looked at them.
2. **The onboarding overlay is continuous in a real browser** — complete onboarding with a resume and
   confirm the 5-step ladder stays up through the automatic jump to `/results/:id` with no flash, no
   restart to step 1, and never the single-row `'Working on your analysis'`.

The unit + e2e evidence proves the *state* is correct (the ladder record survives the label-less
update, and one host node owns the overlay). It does not prove the *paint* is seamless.

## Deviations from Plan

### Auto-fixed / adapted

**1. [Rule 3 - Blocking] `src/components/AnalysisWaitingHost.test.tsx` already existed**
- **Found during:** Task 3(a)
- **Issue:** The plan specified this file as NEW, but it already exists and is tracked (two
  pre-existing cases from the Upload→Results host work: one-dialog-node MutationObserver proof and
  terminal-completion removal).
- **Fix:** EXTENDED it with a second `describe` block carrying the three planned cases instead of
  overwriting. No pre-existing assertion was modified or removed.
- **Files modified:** `src/components/AnalysisWaitingHost.test.tsx`
- **Commit:** `bec8787b`

**2. [Plan detail] Fake timers dropped from the new host cases**
- **Found during:** Task 3(a)
- **Issue:** The plan suggested reusing the fake-timer setup from `UniversalAnalyzing.test.tsx`. The
  module-level `activeWaitStartedAt` map is keyed by `title` and persists across tests in a file, so
  mixing real-timer (existing cases) and fake-timer (new cases) blocks in one file risks
  cross-test elapsed-threshold coupling.
- **Fix:** The new cases are synchronous and assert on state immediately after the two calls, so no
  timer advancement is needed. No fake timers were introduced.
- **Commit:** `bec8787b`

**3. [Reporting] Mutation check catches via a different case than predicted**
- Documented in full under Verification Results above. No code change; the plan's expectation about
  *which* test catches the mutation was simply wrong, and the mutation is caught.

No Rule 4 (architectural) situations arose. No authentication gates. No deferred items.

## Self-Check: PASSED

Files verified present:
- `src/pages/__tests__/Onboarding.waiting-handoff.test.ts` — FOUND
- `src/components/AnalysisWaitingHost.test.tsx` — FOUND
- `src/contexts/AnalysisLockContext.tsx` (carry-forward, `260803-mqs`) — FOUND
- `src/index.css` (`--success` x4) — FOUND
- `tailwind.config.ts` (`hsl(var(--success))`) — FOUND
- `src/components/UniversalAnalyzing.tsx` (`text-success`) — FOUND

Commits verified present: `f1e499bb`, `1e1bc89c`, `bec8787b`.

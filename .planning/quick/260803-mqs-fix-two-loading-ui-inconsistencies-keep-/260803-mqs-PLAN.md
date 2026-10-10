---
phase: quick/260803-mqs-fix-two-loading-ui-inconsistencies-keep-
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - src/pages/Onboarding.tsx
  - src/contexts/AnalysisLockContext.tsx
  - src/pages/Results.tsx
  - src/index.css
  - tailwind.config.ts
  - src/components/UniversalAnalyzing.tsx
  - src/components/UniversalAnalyzing.test.tsx
  - src/components/AnalysisWaitingHost.test.tsx
  - src/pages/__tests__/Onboarding.waiting-handoff.test.ts
  - src/test/platform/universal-analyzing-source-guard.test.ts

must_haves:
  truths:
    - "A user completing onboarding sees the same rich 5-step ladder before AND after the automatic navigation to /results/:id — the overlay never degrades to the single-row 'Working on your analysis' surface."
    - "The onboarding ladder does not restart, re-enter, or flash at the navigation boundary — one overlay node is alive for the whole wait."
    - "A generic polling/job-status wait that nobody seeded still renders exactly the single-row 'Working on your analysis' fallback, byte-identical for 60 seconds."
    - "An onboarding attempt that fails terminally and stays on the setup screen leaves no stranded overlay and no stuck nav lock."
    - "A completed stage row shows a clearly visible green tick and no visible word 'Done', on all six analysis surfaces."
    - "A screen-reader user still hears a completion label on completed stage rows."
  artifacts:
    - path: "src/contexts/AnalysisLockContext.tsx"
      provides: "showWaitingSurface carry-forward of stageLabels/activeStageIndex on same-key updates that omit them"
      contains: "260803-mqs"
    - path: "src/pages/Onboarding.tsx"
      provides: "Host-owned waiting surface seeded before navigation; no page-level UniversalAnalyzing"
      contains: "showWaitingSurface"
    - path: "src/index.css"
      provides: "--success / --success-foreground design tokens in both the dark and light blocks"
      contains: "--success"
    - path: "tailwind.config.ts"
      provides: "success semantic colour mapped to hsl(var(--success))"
      contains: "hsl(var(--success))"
    - path: "src/components/UniversalAnalyzing.tsx"
      provides: "Green tick + sr-only completion label on completed StageRow"
      contains: "text-success"
    - path: "src/components/AnalysisWaitingHost.test.tsx"
      provides: "Carry-forward proof + unseeded single-row negative control"
    - path: "src/pages/__tests__/Onboarding.waiting-handoff.test.ts"
      provides: "Static wiring guard: seed-before-navigate, single overlay, fail-safe hide"
  key_links:
    - from: "src/pages/Onboarding.tsx"
      to: "src/contexts/AnalysisLockContext.tsx"
      via: "showWaitingSurface({ key: 'resume-analysis', stageLabels: ONBOARDING_STAGE_LABELS }) before every navigate('/results/…')"
      pattern: "showWaitingSurface\\(\\{[\\s\\S]*?stageLabels: ONBOARDING_STAGE_LABELS"
    - from: "src/contexts/AnalysisLockContext.tsx"
      to: "src/components/AnalysisWaitingHost.tsx"
      via: "waitingSurface.stageLabels survives Results' label-less update"
      pattern: "stageLabels: current\\.stageLabels"
    - from: "src/components/UniversalAnalyzing.tsx"
      to: "tailwind.config.ts / src/index.css"
      via: "text-success class resolving to hsl(var(--success))"
      pattern: "text-success"
---

<objective>
Fix two loading-UI inconsistencies in the shared analysis waiting surface.

1. **Onboarding handoff.** Onboarding renders its own page-level `<UniversalAnalyzing>` which is
   destroyed by the `navigate('/results/:id')` that fires while the analysis is still in flight.
   Results then seeds a label-less waiting surface, so the user drops from a rich 5-step ladder to
   the single-row `'Working on your analysis'` fallback mid-wait. Move onboarding onto the
   route-independent `AnalysisWaitingHost` (exactly the Upload precedent) and stop Results'
   label-less update from clobbering a ladder that is already live.

2. **Completion affordance.** Completed stage rows render the literal word "Done". Replace it with a
   visible green tick plus a screen-reader-only "Done", which requires introducing the first
   `success` semantic token in the design system (`--primary` is coral; there is no green token).

Purpose: the restored pre-July-29 loader is only "restored" if it survives the one navigation that
every new user hits, and the completion state should read as a universally-understood tick.
Output: one continuously-mounted overlay across the onboarding→Results boundary, a `success` design
token, a green tick on completed rows, and tests that pin all of it — including a negative control
proving the polling path still falls through to the single-row surface.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/quick/260803-hwm-restore-the-original-pre-july-29-loading/260803-hwm-SUMMARY.md

@src/pages/Onboarding.tsx
@src/pages/Results.tsx
@src/pages/Upload.tsx
@src/contexts/AnalysisLockContext.tsx
@src/components/AnalysisWaitingHost.tsx
@src/components/UniversalAnalyzing.tsx
@src/components/UniversalAnalyzing.test.tsx
@src/lib/analysis-stage-copy.ts
@src/index.css
@tailwind.config.ts
@src/test/platform/universal-analyzing-source-guard.test.ts
@src/pages/__tests__/Upload.recovery.test.tsx
@e2e/cross-device/waiting-surface.spec.ts
@e2e/cross-device/realtime-fallback.spec.ts
</context>

<verified_findings>
Confirmed by reading the source before planning — the executor should trust these and not re-derive:

- `Onboarding.tsx:316` `setAnalyzing(true)` is the FULL-path commit point (all early-return guards
  are above it). `Onboarding.tsx:665-670` is the only `<UniversalAnalyzing>` render in the file.
- There are **four** `navigate(\`/results/${resume.id}\`)` sites in the submit handler:
  `:560` (lifecycle "result already landed"), `:588` (lifecycle ambiguous give-up), `:598`
  (lifecycle success), `:616` (**dormant path — 100% of traffic today**, navigates while the
  analysis promise is still in flight). All four must hand off.
- `Onboarding.tsx` does **not** currently import `useAnalysisLock`.
- `AnalysisWaitingHost` is mounted above `<Routes>` at `src/App.tsx:70`, so its overlay survives
  navigation. **Upload.tsx renders no `<UniversalAnalyzing>` at all** — it drives the host only
  (`Upload.tsx:146-160`). Onboarding must match that shape; that is what makes "one overlay" true
  by construction rather than by timing luck.
- `Upload.tsx:214` calls `stopWaiting()` **before** its only non-stream `navigate('/results/:id')`
  (:221), so an Upload-seeded surface can never be inherited by a non-stream Results wait. This is
  what makes carrying `activeStageIndex` forward safe.
- `AnalysisLockContext.showWaitingSurface` replaces the record wholesale (`return surface`) and only
  bails when **every** compared field is already equal — this is why Results' branch-3 `{}` erases a
  seeded ladder.
- Results' title on the non-elite path is `'Analyzing your resume'` — identical to what Onboarding
  will seed. `UniversalAnalyzing`'s timed-advance effect deps are
  `[isAnalyzing, stageCount, hasExternalStageIndex, title]`, and `activeWaitStartedAt` is keyed by
  `title`, so an unchanged title means **the ladder and the 45s/120s thresholds do not restart** at
  the boundary. Do not change either title.
- `WAITING_SURFACE_COPY.fallback === 'Working on your analysis'`
  (`src/lib/analysis-stage-copy.ts`) — the single-row copy the two e2e specs pin.
- No test anywhere asserts `Onboarding.tsx` contains `<UniversalAnalyzing`
  (`CareerCompass.recovery.test.tsx:179` asserts that for CareerCompass only). No test references the
  string `'Done'`. `noUnusedLocals` is `false` in every tsconfig.
- Source-guard state to respect (`src/test/platform/universal-analyzing-source-guard.test.ts`):
  bans `emerald`, bans `#hex` / `rgb()` / `hsl()` whose first arg is not `var(--`, requires exactly
  one `aria-live=`, and asserts `repeat: Infinity` occurs **exactly 12 times** each within 600 chars
  after its own `!prefersReducedMotion &&` gate. **None of this plan's edits add or remove an
  infinite animation — the count stays 12 and the assertion is not touched.**
- All six analysis surfaces route through the one `StageRow` in `UniversalAnalyzing.tsx`
  (`rg '<UniversalAnalyzing' src/pages/*.tsx` → Onboarding, InterviewPrep, CareerCompass,
  RecruitingLens, LinkedInGrader; plus Upload/Results/Onboarding via `AnalysisWaitingHost`). One
  component edit covers all six. Re-run that `rg` to confirm before editing.
</verified_findings>

<design_decisions>
**D1 — Onboarding stops rendering its own overlay (rather than seeding one alongside it).**
The alternative (keep the page-level `<UniversalAnalyzing>` and *also* call `showWaitingSurface`
before navigating) leaves a window where two overlays are mounted, and it restarts the ladder at the
boundary because the host's overlay mounts fresh. Delegating entirely to the host — the shape Upload
already uses — makes "exactly one overlay" structural, keeps the DOM node alive across navigation,
and preserves the stage timer and the 45s/120s thresholds. This is the literal ask ("keep the
restored rich loader mounted across the navigation boundary").

**D2 — Carry-forward lives in `AnalysisLockContext`, not in `Results.tsx`.**
Putting it in Results would mean reading `waitingSurface` inside the very effect that writes it —
an effect-feedback loop guarded only by the equality bail. Putting it in the context makes the rule
one sentence, testable in isolation, and leaves the
`// CRITICAL — this must NOT be widened past isStreamMode` block in `Results.tsx` **literally
unchanged** (comment amendment only). The gate is not widened; the branch-3 spread is still `{}`.

**D3 — Carry-forward is provably inert for OT-8 and realtime-fallback.**
Both specs navigate straight to `/results/...` with no prior seed, so `current` is `null`, nothing is
carried, and the single-row fallback renders exactly as today. Task 3 pins this as an explicit
negative control at unit level so a future edit cannot silently turn the polling path into a ladder.

**D4 — Fail-safe hide, not enumerated hides.**
A local `handedOffToResults` flag set immediately before each of the four `navigate` calls, with
`if (!handedOffToResults) hideWaitingSurface('resume-analysis')` in the existing `finally`. Every
path that does *not* navigate — validation failure, terminal analysis failure, an unexpected throw,
a future branch nobody remembers to update — hides the overlay. Enumerating failure sites is the
shape that strands overlays.

**D5 — Green tick placement, and the left indicator.**
The right-hand slot gets the green tick + `sr-only` label, exactly as asked. The left step-indicator
badge (`bg-primary/20` + `CheckCircle2` in `text-primary`) is **also recoloured to `success`**, for
one reason: leaving it coral would put a coral badge and a green tick on the same completed row,
reading as two different states. Its spring-scale entrance motion — part of the 260803-hwm
restoration — is preserved verbatim; only the two colour classes change. To avoid a literal duplicate
glyph, the right slot uses lucide `Check` at `h-4 w-4` (a bare tick) while the left keeps its
`CheckCircle2` badge. The completed row's own tint (`border-primary/20 bg-primary/5`) is deliberately
**not** changed — the operator asked for a green tick, not a green row, and the row tint is restored
design.

**D6 — Token values.** The palette's only existing green is `--btn-job: 160 70% 45%`. `--success`
uses that hue family so the tick reads as part of this design system:
dark `152 62% 50%`, light `152 68% 34%` (darker for contrast on white). Declared as bare HSL channel
triplets consumed via `hsl(var(--success))`, matching every existing token.
</design_decisions>

<tasks>

<task type="auto">
  <name>Task 1: Move onboarding onto the persistent waiting host and stop Results erasing a live ladder</name>
  <files>src/contexts/AnalysisLockContext.tsx, src/pages/Onboarding.tsx, src/pages/Results.tsx</files>
  <action>
**(a) `src/contexts/AnalysisLockContext.tsx` — carry-forward.**
Rewrite `showWaitingSurface` so a same-key update that omits `stageLabels` inherits the live
record's ladder instead of erasing it. Compute the merged record FIRST, then run the existing
equality bail against the *merged* record (not the raw argument) so a repeat call still returns
`current` and cannot cause re-render churn:

```ts
const showWaitingSurface = useCallback((surface: AnalysisWaitingSurface) => {
  setWaitingSurface((current) => {
    // CARRY-FORWARD — 2026-08-03, quick 260803-mqs.
    //
    // showWaitingSurface REPLACES the record. That is correct for a caller that
    // supplies its own ladder, but it meant a page ADOPTING an in-flight wait
    // (Results, mounting after Onboarding navigated) erased the ladder its
    // predecessor had seeded and dropped the user to the single-row fallback
    // mid-analysis. So: when an update targets the SAME key and supplies no
    // `stageLabels` of its own, the live ladder (and its index) survive.
    //
    // Inert for the polling/job-status path: `e2e/cross-device/waiting-surface.spec.ts`
    // OT-8 and `realtime-fallback.spec.ts` navigate straight to /results with NO
    // prior seed, so `current` is null, nothing is carried, and the single-row
    // 'Working on your analysis' surface renders exactly as before. Pinned as an
    // explicit negative control in AnalysisWaitingHost.test.tsx.
    const next: AnalysisWaitingSurface =
      current !== null &&
      current.key === surface.key &&
      surface.stageLabels === undefined &&
      current.stageLabels !== undefined
        ? {
            ...surface,
            stageLabels: current.stageLabels,
            activeStageIndex: current.activeStageIndex,
          }
        : surface;
    if (
      current?.key === next.key &&
      current.title === next.title &&
      current.streamStageLabel === next.streamStageLabel &&
      current.lifecycleState === next.lifecycleState
      && current.stageLabels === next.stageLabels
      && current.activeStageIndex === next.activeStageIndex
    ) {
      return current;
    }
    return next;
  });
}, []);
```
Do not change `hideWaitingSurface`, the refcounted lock, or the `AnalysisWaitingSurface` interface.

**(b) `src/pages/Onboarding.tsx` — delegate to the host.**
- Add `import { useAnalysisLock } from "@/contexts/AnalysisLockContext";` and, inside the component,
  `const { showWaitingSurface, hideWaitingSurface } = useAnalysisLock();`.
- Delete the `<UniversalAnalyzing …>` block at `:665-670` **together with the now-false comment at
  `:661-664`** ("The same component drives the Results-page overlay, so the animation continues
  seamlessly…" — that stopped being true at 260803-fxz). Remove the now-unused
  `import { UniversalAnalyzing } …` (`:48`). Keep `Sparkles` imported — it is used elsewhere in the
  page; verify with `rg -n 'Sparkles' src/pages/Onboarding.tsx` before removing anything.
- Delete the `analyzing` state (`:99`) and its comment block (`:94-98`), and both `setAnalyzing`
  calls (`:316`, `:644`). At `:316`, in its place, seed the host:
  ```ts
  // The onboarding analysis overlay is owned by the route-independent
  // <AnalysisWaitingHost> (App.tsx), NOT by this page — mirrors Upload.tsx:146.
  // The submit path navigates to /results while the run is still in flight, and a
  // page-level overlay is destroyed by that navigation; a host-owned one is not, so
  // the ladder, its step timer and the 45s/120s thresholds all survive the boundary.
  // `activeStageIndex` is deliberately OMITTED — onboarding emits no per-stage signal,
  // so the sanctioned timed step advance in UniversalAnalyzing drives the ladder.
  showWaitingSurface({
    key: 'resume-analysis',
    title: 'Analyzing your resume',
    stageLabels: ONBOARDING_STAGE_LABELS,
  });
  ```
  The `title` MUST be the byte-identical `'Analyzing your resume'` that `Results.tsx:467` uses on the
  non-elite branch: the stage timer and the elapsed-threshold map are both keyed on `title`, so any
  difference restarts the ladder at the boundary — the exact bug being fixed. The `icon` prop is
  dropped with no visual change: `UniversalAnalyzing` already defaults to `<Sparkles className="h-8 w-8" />`.
- Fail-safe teardown (D4). Declare `let handedOffToResults = false;` next to the existing
  `let correlationEnvelope` (`:320`). Immediately before **each** of the four
  `navigate(\`/results/${resume.id}\`)` calls (`:560`, `:588`, `:598`, `:616`) add
  `handedOffToResults = true;`. In the existing `finally` block (`:642-648`), where
  `setAnalyzing(false)` was, put:
  ```ts
  // Any path that did NOT hand off to Results is still on the setup screen — drop
  // the overlay so it cannot strand (it holds the nav lock while visible). Results
  // owns teardown on the handoff paths.
  if (!handedOffToResults) hideWaitingSurface('resume-analysis');
  ```
- Do NOT touch: the analysis invoke bodies, the lifecycle/dormant branch conditions, navigation
  targets or ordering, `startRun`, `submitGuard`, the merit/entitlement reconciliation, or the
  `notifyBackgroundFailure` wiring. `Onboarding.recovery.test.tsx` pins several of these literally
  (including that `startRun` precedes the `navigate`) — keep `handedOffToResults = true;` on its own
  line *after* the `startRun` line and *before* the `navigate` line so those index comparisons still
  hold.

**(c) `src/pages/Results.tsx` — comment only, no logic change.**
The three-way spread at `:476-491` and the `isStreamMode` gate stay **exactly** as they are. Append
to the `// CRITICAL — this must NOT be widened past isStreamMode` block:
```
// 2026-08-03 (quick 260803-mqs): branch 3 stays `{}` and the gate stays where it
// is. What changed is one level down — AnalysisLockContext now CARRIES FORWARD a
// ladder that is already live on this key rather than erasing it, so an onboarding
// wait that navigated here keeps its 5-step ladder. Nothing is carried when nobody
// seeded one, which is every case these two specs exercise.
```
  </action>
  <verify>
`npm run type-check` passes. `npx vitest run src/pages/__tests__/Onboarding.recovery.test.tsx src/pages/__tests__/Onboarding.freshness.test.tsx src/pages/__tests__/Upload.recovery.test.tsx src/test/coverage/ver02-matrix.test.ts` passes.
`rg -c '<UniversalAnalyzing' src/pages/Onboarding.tsx` returns no match.
`rg -n 'handedOffToResults' src/pages/Onboarding.tsx` shows 1 declaration + 4 assignments + 1 finally check.
`git diff --stat src/pages/Results.tsx` shows a comment-only change (no `-` line containing `stageLabels` or `isStreamMode`).
  </verify>
  <done>Onboarding seeds the host-owned surface with `ONBOARDING_STAGE_LABELS` before every `/results/` navigation, renders no page-level overlay, and hides the surface on every non-navigating exit; `AnalysisLockContext` carries a live ladder forward across a label-less same-key update; `Results.tsx` logic is byte-identical.</done>
</task>

<task type="auto">
  <name>Task 2: Add the success design token and replace the "Done" label with a green tick</name>
  <files>src/index.css, tailwind.config.ts, src/components/UniversalAnalyzing.tsx</files>
  <action>
**(a) `src/index.css` — declare `--success` in BOTH theme blocks**, following the existing bare-HSL-
triplet style exactly. Insert directly after the `--destructive` pair in each block so the semantic
colours stay grouped:
- `:root, .dark` (after `:35`):
  ```css
    /* First green in the system (quick 260803-mqs): completion state on the
       analysis stage ladder. --primary is coral, so a "done" tick had no token.
       Hue follows the palette's existing green (--btn-job: 160 70% 45%). */
    --success: 152 62% 50%;
    --success-foreground: 0 0% 100%;
  ```
- `.light` (after `:82`): `--success: 152 68% 34%;` / `--success-foreground: 0 0% 100%;`
  (darker L for contrast against the white background).

**(b) `tailwind.config.ts`** — register the token alongside the other semantic colours, immediately
after the `accent` entry (`:45-48`):
```ts
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
```
Do not touch `coral`, the keyframes, or anything else.

**(c) `src/components/UniversalAnalyzing.tsx` — `StageRow` only.**
- Import `Check` alongside the existing lucide imports: `import { Check, CheckCircle2, Sparkles } from 'lucide-react';`
- Left completed indicator (`:316-323`): change `bg-primary/20` → `bg-success/20` and
  `text-primary` → `text-success` on the `CheckCircle2`. **Leave the `initial`/`animate`/`transition`
  spring props verbatim** — that motion is the 260803-hwm restoration. Add a short comment naming
  D5 (one completion colour per row; see the plan) with the date and quick id.
- Right slot (`:364-373`): replace the visible "Done" with a tick plus a screen-reader-only label:
  ```tsx
      {completed && (
        <motion.span
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex shrink-0 items-center text-success"
        >
          {/* 2026-08-03, quick 260803-mqs: the visible word "Done" became a tick.
              The glyph is decorative; the completion state stays announced by the
              sr-only label, so this row is no less accessible than before. */}
          <Check className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Done</span>
        </motion.span>
      )}
  ```
  Note the wrapper's `aria-hidden="true"` is **removed** — it would suppress the sr-only label.
- Change nothing else in the file. In particular: do not add or remove a `repeat: Infinity`
  (the guard's `toHaveLength(12)` must stay untouched and unchanged), do not add a second
  `aria-live`, do not introduce any colour literal (`text-success` is a class — the guard's
  `#hex|rgb()|hsl(` rule and its `emerald` ban both stay satisfied), and do not alter the
  active/pending branches.

Rebuild sanity: `text-success` only resolves once (b) is in place — do (a) and (b) before (c).
  </action>
  <verify>
`npm run type-check` passes. `npx vitest run src/test/platform/universal-analyzing-source-guard.test.ts src/test/platform/responsive-source-guard.test.ts` passes with the guard file unmodified.
`rg -n -- '--success' src/index.css` shows 4 declarations (2 per theme block).
`rg -c 'repeat: Infinity' src/components/UniversalAnalyzing.tsx` returns exactly 12.
`rg -n '>\s*Done\s*<' src/components/UniversalAnalyzing.tsx` matches only inside the `sr-only` span.
`npm run build` succeeds and `rg -o 'text-success' dist/assets/*.css | head -1` finds the generated utility (proves the Tailwind registration reached the bundle).
  </verify>
  <done>`--success`/`--success-foreground` exist in both themes, Tailwind exposes `success`, completed stage rows render a green `Check` plus an `sr-only` "Done" with no visible "Done" text, the left completed badge is the same green, and every existing source guard passes unchanged.</done>
</task>

<task type="auto">
  <name>Task 3: Pin both fixes with tests and run the full verification gate</name>
  <files>src/components/AnalysisWaitingHost.test.tsx, src/pages/__tests__/Onboarding.waiting-handoff.test.ts, src/components/UniversalAnalyzing.test.tsx, src/test/platform/universal-analyzing-source-guard.test.ts</files>
  <action>
**(a) NEW `src/components/AnalysisWaitingHost.test.tsx` — the behavioural proof, plus the negative
control.** This is the test that actually proves "onboarding no longer degrades to the single-row
fallback", because it replays the exact two-call sequence across the boundary. Use the
framer-motion mock and provider harness from `src/components/UniversalAnalyzing.test.tsx:9-24`.
Render `<AnalysisLockProvider><AnalysisWaitingHost /><Driver /></AnalysisLockProvider>` where
`Driver` exposes `showWaitingSurface`/`hideWaitingSurface` from `useAnalysisLock()` via a ref or
buttons. Three cases:
1. *Carries an in-flight ladder across an adopting page's label-less update.* Seed
   `{ key: 'resume-analysis', title: 'Analyzing your resume', stageLabels: FIVE_ONBOARDING_LABELS }`,
   then replay Results' branch-3 call
   `{ key: 'resume-analysis', title: 'Analyzing your resume', streamStageLabel: null, lifecycleState: null }`.
   Assert all five labels are still in `getByTestId('analysis-stage-list')` and
   `queryByText(WAITING_SURFACE_COPY.fallback)` is null.
2. *NEGATIVE CONTROL — an unseeded wait still gets the single row.* Make only the branch-3 call.
   Assert `getByTestId('analysis-stage-list')` contains `WAITING_SURFACE_COPY.fallback` and no
   ladder rows. Comment it explicitly as the OT-8 / realtime-fallback contract at unit level, so a
   future widening of the carry-forward rule fails here in ~1s instead of in a 140s browser spec.
3. *A caller that supplies its own ladder still replaces.* Seed the onboarding ladder, then call with
   `stageLabels: ELITE_UNLOCK_STAGE_COPY`; assert the onboarding labels are gone.

**(b) NEW `src/pages/__tests__/Onboarding.waiting-handoff.test.ts` — static wiring guard**, modelled
on `Upload.recovery.test.tsx` (read `src/pages/Onboarding.tsx` with `node:fs`). Assert:
- imports `useAnalysisLock` and destructures `showWaitingSurface` + `hideWaitingSurface`;
- contains `stageLabels: ONBOARDING_STAGE_LABELS` inside a `showWaitingSurface({` call whose
  `title` is `'Analyzing your resume'`;
- contains **no** `<UniversalAnalyzing` — exactly one overlay can be alive, and it is the host's;
- every `navigate(\`/results/${resume.id}\`)` occurrence is preceded by a `handedOffToResults = true;`
  (iterate the matches; assert the nearest preceding assignment index is greater than the previous
  navigate index) — this is what stops a future branch from navigating without handing off;
- contains `if (!handedOffToResults) hideWaitingSurface('resume-analysis');`.
Head the file with a comment explaining the regression it exists to catch.

**(c) EXTEND `src/components/UniversalAnalyzing.test.tsx`** with the accessible-completion test:
render `{ stageLabels: LADDER, activeStageIndex: 1 }` so row 0 is completed, then assert
(i) `screen.getByText('Done')` exists and `toHaveClass('sr-only')`;
(ii) there is exactly one element whose text is `Done` (`screen.getAllByText('Done')` has length 1) —
this is the "not rendered visibly" half;
(iii) `container.querySelector('.text-success svg')` is non-null — the tick is present and green.
Reuse the existing `LADDER` constant and the fake-timer setup already in the file.

**(d) EXTEND `src/test/platform/universal-analyzing-source-guard.test.ts`** with one new `it` inside
the existing describe (do **not** modify or relax any existing assertion, and do not touch the
`toHaveLength(12)` line): read `src/index.css` and `tailwind.config.ts` and assert `--success:` is
declared in both the `:root, .dark` and `.light` blocks, that `tailwind.config.ts` maps
`success` → `hsl(var(--success))`, and that `UniversalAnalyzing.tsx` uses `text-success` and no
longer contains a completion label rendered outside `sr-only`. Name the quick id in a comment.

**(e) Full gate.** Run, in order, and report each result verbatim:
1. `npm run lint`
2. `npm run type-check`
3. `npm run test`
4. `npx playwright test e2e/cross-device/waiting-surface.spec.ts e2e/cross-device/realtime-fallback.spec.ts --project=chromium`

**OT-8 flake protocol (expected, do not paper over).** OT-8 intermittently times out at 140s
post-restoration (observed pass/timeout/pass; passes in isolation). If it fails, re-run it alone —
`npx playwright test e2e/cross-device/waiting-surface.spec.ts -g "OT-8" --project=chromium` — and
report BOTH results honestly in the summary. **Do not raise its timeout, do not retry it into
green, and do not quarantine it.** If it fails in isolation too, that IS a real regression from the
carry-forward change: stop and report rather than adjusting the spec.

Constraint reminder for this task: no guard rule may be deleted, and any narrowing needs an inline
comment carrying the date `2026-08-03` and quick id `260803-mqs`. None of the changes above should
require a narrowing — if one appears to, that is a signal the implementation drifted.
  </action>
  <verify>
All four gate commands pass. `npx vitest run src/components/AnalysisWaitingHost.test.tsx` shows the
negative-control case failing if the carry-forward condition is mutated to drop the
`surface.stageLabels === undefined` clause (mutation-check it once, then revert).
`git diff src/test/platform/universal-analyzing-source-guard.test.ts` shows only ADDED lines.
  </verify>
  <done>Two new test files and two extended ones pin: the carried ladder, the unseeded single-row fallback, the seed-before-navigate wiring, the single-overlay invariant, and the invisible-but-announced completion label. `lint`, `type-check`, `test` and the two cross-device specs are green (OT-8 re-run in isolation and both results reported if it flakes).</done>
</task>

</tasks>

<verification>
- Manual sanity (optional, `npm run dev`): complete onboarding with a resume; the 5-step ladder must
  stay up continuously through the automatic jump to `/results/:id` — no flash, no restart to step 1,
  and never the single-row "Working on your analysis".
- `rg '<UniversalAnalyzing' src/pages/*.tsx` still returns InterviewPrep, CareerCompass,
  RecruitingLens and LinkedInGrader (Onboarding is intentionally gone; those four are unchanged and
  pick up the green tick through the shared `StageRow`).
- `git diff --stat` touches nothing under `supabase/`, `scripts/`, or `*.sql`.
- No `[legacyProp: string]: unknown`, `steps` prop, `progressPercent`, `expectedDurationMs`, rendered
  `%`, or duration claim was reintroduced.
</verification>

<success_criteria>
- The onboarding wait renders one continuously-mounted rich ladder from submit through Results.
- A polling/job-status wait with no seed is byte-identical to today's single-row surface.
- Completed rows show a green tick; the word "Done" exists only for assistive tech.
- `npm run lint`, `npm run type-check`, `npm run test`, and both cross-device chromium specs pass
  (OT-8's known flake reported honestly, never suppressed).
- Every pre-existing guard passes with zero deletions and zero unrecorded narrowings.
</success_criteria>

<output>
After completion, create
`.planning/quick/260803-mqs-fix-two-loading-ui-inconsistencies-keep-/260803-mqs-SUMMARY.md`.
</output>
</content>
</invoke>

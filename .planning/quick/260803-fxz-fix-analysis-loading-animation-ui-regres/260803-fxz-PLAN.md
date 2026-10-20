---
quick_id: 260803-fxz
type: execute
wave: 1
depends_on: []
autonomous: false
files_modified:
  - src/components/UniversalAnalyzing.tsx
  - src/test/platform/universal-analyzing-source-guard.test.ts
  - src/pages/Onboarding.tsx
  - src/pages/CareerCompass.tsx
  - src/pages/RecruitingLens.tsx
  - src/pages/LinkedInGrader.tsx
  - src/pages/InterviewPrep.tsx
  - src/pages/Upload.tsx
  - src/pages/Results.tsx
  - src/pages/__tests__/CareerCompass.recovery.test.tsx

must_haves:
  truths:
    - "Onboarding resume analysis renders a multi-step stage list with tick marks and a determinate progress bar"
    - "Career Compass, Recruiting Lens, LinkedIn Grader and Interview Prep render the same multi-step loader"
    - "Streaming Resume Analysis renders the same multi-step loader, with its active step driven by the real stream stage"
    - "The active step visibly animates, and every infinite animation stops under prefers-reduced-motion"
    - "No surface renders a percentage number or a duration claim"
    - "A stale caller can no longer pass an unknown prop without a TypeScript error"
  artifacts:
    - path: "src/components/UniversalAnalyzing.tsx"
      provides: "Single shared premium loader: stage list, tick marks, active-step pulse, determinate bar, timed fallback advance"
      contains: "stageLabels"
    - path: "src/test/platform/universal-analyzing-source-guard.test.ts"
      provides: "Narrowed OT-7 guard: timed advance sanctioned, percentage/duration/colour/motion/aria rules retained"
    - path: "src/pages/Onboarding.tsx"
      provides: "Migrated caller passing stageLabels"
  key_links:
    - from: "src/pages/CareerCompass.tsx"
      to: "src/components/UniversalAnalyzing.tsx"
      via: "stageLabels prop"
      pattern: "stageLabels=\\{"
    - from: "src/pages/Results.tsx"
      to: "src/lib/analysis-stage-copy.ts"
      via: "PERMITTED_STREAM_STAGE_LABELS as the resume ladder + real stage index"
      pattern: "PERMITTED_STREAM_STAGE_LABELS"
---

<objective>
Restore the premium multi-step analysis loading experience on every analysis surface by
repairing a silent prop-contract break, then make that class of break impossible to
repeat.

`UniversalAnalyzing` renamed `steps` → `stageLabels`; six callers were never migrated and
the component's `[legacyProp: string]: unknown` index signature swallowed the stale props
with no type error. All six surfaces fall through to a bare spinner.

Purpose: users on Onboarding, Resume Analysis, Career Compass, Recruiting Lens, LinkedIn
Grader and Interview Prep get the multi-step loader back — progress bar, tick marks,
animated active step — from ONE shared component.
Output: a reworked `UniversalAnalyzing`, six migrated callers, a narrowed (not deleted)
OT-7 source guard, and a deleted index signature.

**UI-ONLY.** This plan does not touch backend behaviour, AI prompts, model calls, schemas,
token budgets, scoring, generation, retry, merits, routes, or DB behaviour. `supabase/**`
is off-limits — if a task appears to require an edit there, stop and report instead.
</objective>

<context>
@.planning/quick/260803-fxz-fix-analysis-loading-animation-ui-regres/260803-fxz-CONTEXT.md
@CLAUDE.md

@src/components/UniversalAnalyzing.tsx
@src/components/UniversalAnalyzing.test.tsx
@src/test/platform/universal-analyzing-source-guard.test.ts
@src/lib/analysis-stage-copy.ts
@src/lib/resume-stream-stage-labels.ts
@src/components/AnalysisWaitingHost.tsx
@src/contexts/AnalysisLockContext.tsx
@src/components/ui/progress.tsx

Visual reference only, NOT to be restored verbatim (it violates retained guard rules —
rendered `%`, "usually takes about 20 seconds", `text-emerald-400`):
@src/components/AnalysisExperience.tsx
</context>

<prior_findings>
Established before planning — do not re-derive:

1. **Root cause is a prop rename, not styling.** `steps` → `stageLabels` (+
   `activeStageIndex`); the index signature at `UniversalAnalyzing.tsx:29-30` hides it.
   The stage list with pending/active/completed-tick states already exists at
   `UniversalAnalyzing.tsx:215-273` — it is never fed, and it is styled flat.

2. **Six stale callers**, all passing dead `steps` / `subtitle` / `expectedDurationMs`:
   `Onboarding.tsx:664`, `CareerCompass.tsx:993`, `RecruitingLens.tsx:748`,
   `LinkedInGrader.tsx:801`, `InterviewPrep.tsx:559`. Only `AnalysisWaitingHost.tsx`
   is on the new contract.

3. **Resume Analysis does NOT render `UniversalAnalyzing` directly.** It goes through
   `AnalysisLockContext.showWaitingSurface` → `AnalysisWaitingHost`, called from
   `Upload.tsx:145` and `Results.tsx:462`. Neither passes `stageLabels` except the Elite
   unlock branch. That is why Resume Analysis also shows the bare spinner.

4. **Three tests already pin the CURRENT behaviour and must be handled deliberately:**
   - `e2e/cross-device/realtime-fallback.spec.ts` (4 assertions) requires the **polling,
     non-stream** Results path to keep showing the single-line
     `'Working on your analysis'` fallback inside `analysis-stage-list`.
   - `e2e/cross-device/waiting-surface.spec.ts` OT-8 requires that same polling path's
     stage-list text to be **byte-identical for 60 seconds** (no timer may run there).
     ⇒ The resume ladder must be gated on `isStreamMode` (a `?stream=true` URL param;
     neither e2e route sets it). This is a hard constraint, not a preference.
   - `src/pages/__tests__/CareerCompass.recovery.test.tsx:191-192` asserts CareerCompass
     source still contains `'This usually takes 1-2 minutes'` and
     `'expectedDurationMs={120000}'` — assertions guarding a **dead, never-rendered
     prop**. They must be replaced when the props are deleted.

5. **`e2e/elite-rerun-merit.spec.ts:522`** asserts all five `ELITE_UNLOCK_STAGE_COPY`
   labels are simultaneously **visible**. Pending steps must therefore keep a non-zero
   opacity (today: `opacity-40`). No entry animation may leave a pending step at
   opacity 0.

6. **`UniversalAnalyzing.test.tsx:7-17` mocks `framer-motion` with only `motion.div` and
   `useReducedMotion`.** Any new `motion.span` / `AnimatePresence` / `motion.li` usage in
   `UniversalAnalyzing.tsx` will crash that suite. Restrict new motion usage to
   `motion.div`.

7. **`src/test/platform/responsive-source-guard.test.ts`** import-walks
   Onboarding/LinkedInGrader/CareerCompass/RecruitingLens and requires: every file with
   `repeat: Infinity` also imports `useReducedMotion`, and no `blur-3xl` sits on an
   animated element. Both stay satisfiable; do not introduce `blur-3xl` on a motion element.

8. **Nothing else depends on the index signature.** The only reader of a legacy prop is
   `legacySubtitle` (`UniversalAnalyzing.tsx:79-85`), a dead path: no caller passes a
   `subtitle` that appears in `PERMITTED_STREAM_STAGE_LABELS`. Six page-level test files
   mock `UniversalAnalyzing` wholesale, so prop changes cannot reach them.
</prior_findings>

<tasks>

<task type="auto">
  <name>Task 1: Rebuild the shared loader and narrow the OT-7 source guard</name>
  <files>src/components/UniversalAnalyzing.tsx, src/test/platform/universal-analyzing-source-guard.test.ts</files>
  <action>
Rework `UniversalAnalyzing.tsx` into the premium multi-step loader. Keep the index
signature for now (Task 2 removes it after the callers are migrated) so this task leaves
the tree type-clean.

**1a. Resolved stage index (timed fallback, real signal wins).**
Add above the render, using identity-stable derived values so an inline array literal from
a caller cannot restart the timer on every render:

```tsx
const STEP_ADVANCE_MS = 6_000; // discretion: ~6s reads as progress without racing ahead
const stageCount = stageLabels?.length ?? 0;
const hasExternalStageIndex = activeStageIndex !== undefined;
const [timedStageIndex, setTimedStageIndex] = useState(0);

useEffect(() => {
  if (!isAnalyzing || stageCount === 0 || hasExternalStageIndex) return;
  setTimedStageIndex(0);
  const id = window.setInterval(() => {
    // Hold on the LAST step rather than completing early and idling on a
    // finished-looking list while the run is still in flight.
    setTimedStageIndex((i) => (i >= stageCount - 1 ? i : i + 1));
  }, STEP_ADVANCE_MS);
  return () => window.clearInterval(id);
}, [isAnalyzing, stageCount, hasExternalStageIndex, title]);

const resolvedStageIndex = Math.min(
  activeStageIndex ?? timedStageIndex,
  Math.max(stageCount - 1, 0),
);
```

Change the signature so `activeStageIndex` has NO default (`activeStageIndex,` not
`activeStageIndex = 0`) — omitting it is what opts a caller into the timer. Update its
doc comment to say so. Replace every existing use of `activeStageIndex` in the render and
in `currentStageCopy` with `resolvedStageIndex`.

Add a comment recording that the operator authorised timed advancement on 2026-08-03
(quick 260803-fxz), that a real signal always takes precedence over the timer, and that
the timer only runs when a caller supplies `stageLabels` and omits `activeStageIndex`.

**1b. Restyle the stage rows** (`UniversalAnalyzing.tsx:215-273`, the `stageLabels` branch
AND the `lifecycleEntries` branch — they must stay visually identical to each other).
Port the *feel* of `AnalysisExperience.tsx:141-180`:
- completed: `CheckCircle2` + a spring scale-in via `motion.div`
  (`initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500 }}`).
  Icon colour stays a semantic token (`text-primary`) — **not** `text-emerald-400`.
- active: a pulsing ring. This is the SECOND infinite animation and must be written as
  a `!prefersReducedMotion &&` branch with a static counterpart, e.g.

  ```tsx
  {active && !prefersReducedMotion && (
    <motion.div
      className="h-5 w-5 shrink-0 rounded-full border-2 border-primary border-t-transparent"
      animate={{ opacity: [1, 0.45, 1] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
    />
  )}
  {active && prefersReducedMotion && (
    <span className="h-5 w-5 shrink-0 rounded-full border-2 border-primary border-t-transparent" />
  )}
  ```
  The `!prefersReducedMotion &&` gate MUST sit within ~600 characters before its
  `repeat: Infinity` (Task 1c asserts locality).
- pending: keep the current hollow ring at `opacity-40` — **do not** drop pending rows to
  opacity 0 (finding 5).
- active row emphasis: `border-border bg-secondary text-foreground font-medium`; keep
  rounded-xl rows and the existing gap/padding rhythm.

**1c. Determinate progress bar, no percentage text.** Import
`{ Progress } from '@/components/ui/progress'` and render it only when `stageCount > 0`,
immediately below the stage list:

```tsx
{stageCount > 0 && (
  <Progress
    value={(resolvedStageIndex / stageCount) * 100}
    className="h-1"
    aria-hidden="true"
  />
)}
```
Fill = completed steps / total steps (active index 3 of 6 → 50%). **No `"{n}% complete"`
label, no `%` character, no `Math.round(...progress...)`, no `progressPercent` identifier.**
`aria-hidden` keeps the single `aria-live` region the only announcement source.

**1d. Do not touch** the `!stageLabels && !lifecycleEntries` single-line fallback branch
(`:268-272`) — `UniversalAnalyzing.test.tsx` and four e2e assertions depend on it. Do not
touch the focus trap, scroll lock, reassurance/polling thresholds, degraded/offline blocks,
or the existing `data-testid` values. Use `motion.div` only (finding 6). Semantic Tailwind
tokens only — no hex/rgb/hsl literal, no `emerald`, no `blur-3xl` on a motion element.

**1e. Narrow the source guard** in `src/test/platform/universal-analyzing-source-guard.test.ts`:
- **Delete only line 17** (`/elapsed.*(?:step|progress)|(?:step|progress).*elapsed/i`).
  Rename that `it(...)` from "the four fabricated progress mechanisms" to reflect three,
  and add a comment: timed step advancement was authorised by the operator on 2026-08-03
  (quick 260803-fxz) because Career Compass, Recruiting Lens, LinkedIn Grader, Onboarding
  and Interview Prep emit no per-stage signal; a real signal still takes precedence and
  no fabricated *percentage* or *duration* claim is permitted.
- **Keep unchanged**: the non-empty-walk test, the `%` ban (:18), the
  `expectedDurationMs|usually takes` ban (:16), the `Math.round/progressPercent/Math.exp`
  ban (:15), the emerald/colour-literal test, and the aria-live/Cancel test.
- **Replace the infinite-animation test** so the count is deliberate AND every occurrence
  is proven locally gated:

  ```ts
  it('gates every infinite animation with reduced-motion preference', () => {
    const source = readFileSync(TARGET, 'utf8');
    expect(source).toMatch(/useReducedMotion/);
    const infinite = [...source.matchAll(/repeat:\s*Infinity/g)];
    // 2 = the indeterminate activity ring + the active-step pulse restored on
    // 2026-08-03 (quick 260803-fxz). Raising this number must be deliberate.
    expect(infinite).toHaveLength(2);
    for (const match of infinite) {
      const before = source.slice(0, match.index);
      const gate = before.lastIndexOf('!prefersReducedMotion &&');
      expect(gate, 'every infinite animation needs its own gate').toBeGreaterThan(-1);
      expect(match.index! - gate).toBeLessThan(600);
    }
  });
  ```
  If the finished component ends up with a different infinite-animation count, set the
  expected number to the real one — never delete the assertion.
  </action>
  <verify>
`npx vitest run src/test/platform/universal-analyzing-source-guard.test.ts src/components/UniversalAnalyzing.test.tsx src/test/platform/responsive-source-guard.test.ts`
— all green. Then `npm run type-check`.
  </verify>
  <done>
The stage list renders tick marks, a pulsing active step and a determinate bar; both
infinite animations are gated behind `!prefersReducedMotion`; the source guard is narrowed
(timed advance allowed) with every other OT-7 rule still enforced; the single-line fallback
branch and all three existing `UniversalAnalyzing.test.tsx` cases still pass.
  </done>
</task>

<task type="auto">
  <name>Task 2: Migrate all six callers and delete the index signature</name>
  <files>src/pages/Onboarding.tsx, src/pages/CareerCompass.tsx, src/pages/RecruitingLens.tsx, src/pages/LinkedInGrader.tsx, src/pages/InterviewPrep.tsx, src/pages/Upload.tsx, src/pages/Results.tsx, src/components/UniversalAnalyzing.tsx, src/pages/__tests__/CareerCompass.recovery.test.tsx</files>
  <action>
**2a. Five direct callers.** For each page, convert its dead `{ id, label, icon }[]` array
into a module-level `const <NAME>_STAGE_LABELS: readonly string[] = [...] as const;`
(module level = stable identity; the component no longer renders per-step icons). Keep the
existing feature-specific wording — it is the preferred source per CONTEXT. Then replace
the JSX props: keep `isAnalyzing`, `title`, `icon`; **delete `subtitle`,
`expectedDurationMs` and `steps`**; add `stageLabels={<NAME>_STAGE_LABELS}` and omit
`activeStageIndex` (opting into the timer).

| File | Existing array (delete) | Labels |
|------|------------------------|--------|
| `Onboarding.tsx:59` | `onboardingAnalysisSteps` | keep the 4 existing, extend to 5-6 using the CONTEXT reference wording (e.g. add "Saving your results" / "Preparing your dashboard") |
| `CareerCompass.tsx:979` | `careerCompassSteps` (in-component → hoist) | 5 existing labels verbatim |
| `RecruitingLens.tsx:249` | `recruitingLensSteps` | 5 existing labels verbatim |
| `LinkedInGrader.tsx:790` | `linkedInSteps` (in-component → hoist) | 6 existing labels verbatim |
| `InterviewPrep.tsx:191` | `analyzingSteps` | keep the 3 existing, extend to ~5 in the same voice (e.g. "Drafting likely questions", "Preparing your talking points") |

Update the now-stale comments at `Onboarding.tsx:56-58` and `RecruitingLens.tsx:247-248`
(they explain the old identity-reset concern) to describe the `stageLabels` contract.
Remove icon imports that `rg` proves are unused afterwards — leave any that are still used.

**2b. Resume Analysis (`Upload.tsx`, `Results.tsx`) — gated on `isStreamMode`.**
Import `PERMITTED_STREAM_STAGE_LABELS` from `@/lib/analysis-stage-copy` in both.

`Upload.tsx:145` — add to the `showWaitingSurface({...})` object:
`stageLabels: PERMITTED_STREAM_STAGE_LABELS,` and `activeStageIndex: 0,`.

`Results.tsx:462-472` — restructure the conditional spread so the Elite branch is
unchanged apart from dropping its hardcoded index, and a NEW non-elite branch only fires
under `isStreamMode`:

```tsx
...(isEliteUnlockStream
  ? {
      stageLabels: ELITE_UNLOCK_STAGE_COPY,
      // activeStageIndex omitted on purpose: the surface now advances itself.
      onContinueInBackground: () => setUnlockBackgrounded(true),
    }
  : isStreamMode
    ? {
        stageLabels: PERMITTED_STREAM_STAGE_LABELS,
        // Real signal, never a timer: the resume stream emits genuine stages.
        activeStageIndex: Math.max(
          0,
          PERMITTED_STREAM_STAGE_LABELS.indexOf(waitingStage ?? ''),
        ),
      }
    : {}),
```
Ensure `waitingStage` is in that `useEffect`'s dependency array (add it if absent).

**CRITICAL — do not widen this.** The `!isStreamMode` (polling / job-status) path MUST
keep falling through to the single-line `'Working on your analysis'` branch with no timer.
`e2e/cross-device/waiting-surface.spec.ts` OT-8 asserts that text is unchanged for 60s and
`realtime-fallback.spec.ts` asserts it four times, and both routes lack `?stream=true`.

**2c. Delete the index signature.** In `UniversalAnalyzing.tsx`: remove
`[legacyProp: string]: unknown;` (and its comment) from the interface, remove the
`...legacyProps` rest parameter, delete the `legacySubtitle` const and simplify
`honestStreamLabel` to `streamStageLabel`. Add a short comment explaining the signature was
removed because it silently swallowed the `steps` → `stageLabels` rename. Fix any type
error this surfaces at a caller by removing the dead prop, never by re-widening the type.

**2d. Repair the two dead-prop assertions** at
`src/pages/__tests__/CareerCompass.recovery.test.tsx:190-193`. Replace the
`'This usually takes 1-2 minutes'` / `'expectedDurationMs={120000}'` expectations with
assertions that match the new contract, e.g.:

```ts
it('passes the stage ladder and no longer passes retired display props', () => {
  // 260803-fxz: `subtitle`/`expectedDurationMs` were swallowed by an index signature
  // and never rendered. Phase 03 OT-7 bans duration claims on the waiting surface, so
  // pinning that copy here was guarding a prop that did nothing.
  expect(source).toContain('stageLabels={CAREER_COMPASS_STAGE_LABELS}');
  expect(codeOnly).not.toContain('expectedDurationMs');
  expect(codeOnly).not.toContain('This usually takes 1-2 minutes');
});
```
Leave the surrounding `'% complete'`, `setProgress` and `progressInterval` assertions
untouched. Do not modify any other test file to make this task pass — if another suite
fails, report it rather than editing the assertion.
  </action>
  <verify>
`npm run lint` && `npm run type-check` && `npm run test` — all green.
Then confirm the migration is complete:
`rg -n "expectedDurationMs|steps=\{|subtitle=" src/pages/` returns no `UniversalAnalyzing`
call sites, and `rg -n "legacyProp" src/` returns nothing.
  </verify>
  <done>
All six surfaces pass `stageLabels`; no caller passes `steps`/`subtitle`/`expectedDurationMs`;
the index signature is gone so an unknown prop is now a compile error; the polling Results
path still renders the single-line fallback; `npm run lint`, `npm run type-check` and
`npm run test` are green.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
The shared `UniversalAnalyzing` loader now renders a multi-step stage list with tick marks,
an animated active step and a determinate progress bar (no percentage text), and all six
analysis surfaces feed it real stage labels. Automated proof already ran: `npm run lint`,
`npm run type-check` and `npm run test` (both source guards, `UniversalAnalyzing.test.tsx`,
`CareerCompass.recovery.test.tsx`) are green.
  </what-built>
  <how-to-verify>
`npm run dev`, then confirm the loader on each surface (acceptance criteria 1-8):

1. Onboarding — upload a resume; the overlay shows 5-6 steps, ticks accumulate, the bar fills.
2. Resume Analysis — Upload → Results with `?stream=true`; steps track the real stream
   stages ("Connecting..." → "Evaluating your resume..." → ...), not a timer.
3. Career Compass — 5 steps.
4. Recruiting Lens — 5 steps.
5. LinkedIn Grader — 6 steps.
6. Interview Prep — ~5 steps.
7. No bare spinner-only modal remains on any of the six; no `n% complete` text and no
   "this usually takes ..." claim appears anywhere on the overlay.
8. Toggle dark ↔ light — contrast holds on pending / active / completed rows and the bar.
9. Resize to a 375px-wide viewport — rows and bar stay readable, nothing overflows.
10. Enable OS "Reduce motion", reload, start an analysis — the ring and the active-step
    pulse are static; the step list still advances and the copy still updates.
11. Let one analysis run to completion — it redirects / shows results exactly as before
    (acceptance criterion 10).

Report anything that looks off, especially: a step list that finishes and then idles at
100%, a pending step that is invisible rather than dimmed, or a surface still showing the
old bare spinner.
  </how-to-verify>
  <resume-signal>Type "approved" or describe what looks wrong</resume-signal>
</task>

</tasks>

<verification>
Automated (run in Task 2, blocking):
- `npm run lint`
- `npm run type-check`
- `npm run test`

Specifically must be green inside `npm run test`:
- `src/test/platform/universal-analyzing-source-guard.test.ts` (narrowed, still enforcing
  no `%`, no duration claim, no emerald/colour literal, one `aria-live`, no Cancel, every
  infinite animation gated)
- `src/test/platform/responsive-source-guard.test.ts` (acceptance criterion 8)
- `src/components/UniversalAnalyzing.test.tsx` (all three cases unmodified)
- `src/pages/__tests__/CareerCompass.recovery.test.tsx` (updated in Task 2d)
- `src/lib/__tests__/analysis-stage-copy.test.ts` (untouched — do not edit
  `src/lib/analysis-stage-copy.ts` labels)

Deliberately NOT run here: `npm run verify:baseline` (invokes remote Deno edge tests and
the full Playwright suite — out of scope for a UI-only change and slow). The operator runs
it before deploy. The e2e contracts this plan must not break are named in
`<prior_findings>` items 4 and 5 and are enforced by design (the `isStreamMode` gate and
the preserved single-line fallback branch).

Scope check (must all be true):
- `git status` shows **zero** changes under `supabase/`, `scripts/`, or `*.sql`.
- No change to prompts, model selection, token budgets, scoring, retry, merit, routing or
  DB code. The only non-UI file touched is a test file.
</verification>

<success_criteria>
- All six analysis surfaces render the multi-step loader with tick marks and a determinate
  progress bar; the bare spinner-only modal is gone from each.
- Streaming Resume Analysis derives its active step from the real stream stage; the four
  signal-less surfaces advance on the sanctioned timer and hold on the final step.
- No rendered percentage and no duration claim anywhere on the waiting surface.
- Every infinite animation is gated behind `!prefersReducedMotion`, proven per-occurrence
  by the narrowed guard.
- `[legacyProp: string]: unknown` is deleted — an unmigrated prop is now a compile error.
- `npm run lint`, `npm run type-check`, `npm run test` all green.
- Human verification of criteria 7 (dark/light) and 8 (mobile/desktop) approved.
</success_criteria>

<output>
On completion, write `.planning/quick/260803-fxz-fix-analysis-loading-animation-ui-regres/260803-fxz-SUMMARY.md`
recording: the final infinite-animation count asserted by the guard, the exact step labels
shipped per surface, the `isStreamMode` gate and why it exists, and confirmation that
`verify:baseline` was NOT run and is owed before deploy.
</output>
</content>
</invoke>

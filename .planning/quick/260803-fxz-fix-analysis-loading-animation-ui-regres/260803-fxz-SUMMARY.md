---
quick_id: 260803-fxz
title: Fix analysis loading animation UI regression across Strivo
status: awaiting-human-verification
tasks_completed: 2.5
tasks_total: 3
blocked_on: "Task 3 — residual browser pass only: dark/light contrast, 375px, and the five timer-driven surfaces. Automated portions now closed (e2e executed, timer unit-tested)."
completed: 2026-08-03
duration: ~15min
branch: staging
commits:
  - 07af8cb7 feat(quick-260803-fxz) rebuild shared analysis loader and narrow OT-7 guard
  - 3184f5d1 fix(quick-260803-fxz) migrate all six analysis surfaces to stageLabels
key-files:
  modified:
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
---

# Quick Task 260803-fxz: Fix analysis loading animation UI regression — Summary

Repaired a silent prop-contract break (`steps` → `stageLabels`) that had six analysis
surfaces falling through to a bare spinner, rebuilt the shared multi-step loader, and
deleted the index signature that hid the break so the class of failure cannot recur.

## What shipped

### Task 1 — shared loader + narrowed OT-7 guard (`07af8cb7`)

- **`StageRow`** extracted as one shared row component, consumed by BOTH the `stageLabels`
  ladder and the `lifecycleEntries` ladder, so the two can no longer drift apart visually.
  - completed: `CheckCircle2` inside a `motion.div` spring scale-in
    (`initial={{ scale: 0 }} → animate={{ scale: 1 }}`, `stiffness: 500`), icon coloured
    `text-primary` (semantic token — deliberately NOT `text-emerald-400`).
  - active: pulsing ring (`animate={{ opacity: [1, 0.45, 1] }}`, 1.6s) behind an
    `!prefersReducedMotion &&` gate, with a static `<span>` counterpart under `reduce`.
  - pending: hollow ring at `opacity-40` — never opacity 0, so
    `e2e/elite-rerun-merit.spec.ts:522` (five ELITE labels simultaneously *visible*)
    still holds.
  - active row emphasis: `border-border bg-secondary font-medium text-foreground`.
- **Timed step advance** (`STEP_ADVANCE_MS = 6_000`), authorised by the operator on
  2026-08-03 and recorded in a block comment on the constant. It runs ONLY when a caller
  supplies `stageLabels` AND omits `activeStageIndex`; a real signal always wins. It holds
  on the LAST step rather than completing early and idling on a finished-looking list.
  `activeStageIndex` lost its `= 0` default — omission is now the opt-in.
  The interval is keyed off derived scalars (`stageCount`, `hasExternalStageIndex`), not
  the array identity, so an inline literal from a caller cannot restart it every render.
- **Determinate `Progress` bar**, rendered only when `stageCount > 0`, immediately BELOW
  (outside) the `analysis-stage-list` testid node so OT-8's `innerText` read is unaffected.
  Value = `(resolvedStageIndex / stageCount) * 100`. `aria-hidden="true"` keeps the single
  `aria-live` region the only announcement source. **No percent character exists anywhere
  in the file** — no label, no `Math.round`, no `progressPercent`.
- **Untouched on purpose:** the `!stageLabels && !lifecycleEntries` single-line fallback
  branch, the focus trap, the scroll lock, the 45s/120s reassurance/polling thresholds,
  the degraded/offline blocks, and every existing `data-testid`.
- **Motion vocabulary restricted to `motion.div`** — `UniversalAnalyzing.test.tsx` and
  `AnalysisWaitingHost.test.tsx` mock framer-motion with only `motion.div` +
  `useReducedMotion`; a `motion.span` / `AnimatePresence` would have crashed both suites.

**Guard narrowing** (`universal-analyzing-source-guard.test.ts`):

| Rule | State |
|------|-------|
| `elapsed.*(step\|progress)` ban (old line 17) | **DELETED** — timed advance sanctioned, with a comment recording the operator decision, the date, the quick id, and why (five surfaces emit no per-stage signal) |
| rendered `%` ban | kept |
| `expectedDurationMs` / "usually takes" ban | kept |
| `Math.round(...progress)` / `progressPercent` / `Math.exp` ban | kept |
| emerald + hardcoded colour-literal ban | kept |
| one `aria-live`, no Cancel/Abort | kept |
| non-empty-walk fail-closed | kept |
| infinite-animation gate | **REWRITTEN, stricter** — see below |

### Final infinite-animation count asserted by the guard: **2**

`repeat: Infinity` appears exactly twice in `UniversalAnalyzing.tsx`:
1. the indeterminate activity ring (pre-existing),
2. the active-step pulse restored by this task.

The rewritten assertion is materially stronger than the one it replaced. The old test was
`toHaveLength(1)` plus a single `/!prefersReducedMotion[\s\S]*repeat: Infinity/` — one gate
*anywhere earlier in the file* satisfied it, so a second ungated loop could ride in on the
first one's proof. The new test walks every occurrence and requires its own
`!prefersReducedMotion &&` within 600 characters. Both occurrences pass at ~120 and ~150
characters respectively.

### Task 2 — six migrated callers + index signature deleted (`3184f5d1`)

Each of the five direct callers had its dead `{ id, label, icon }[]` array converted to a
module-level `readonly string[]`. Module level is load-bearing, and each declaration now
carries a comment saying why (the timer keys off the label count).

**Exact step labels shipped, per surface:**

| Surface | Constant | Labels |
|---------|----------|--------|
| Onboarding | `ONBOARDING_STAGE_LABELS` (5) | Reading your resume · Evaluating against the rubric · Generating personalized insights · Finalizing your results · Preparing your dashboard |
| Career Compass | `CAREER_COMPASS_STAGE_LABELS` (5) | Reading your resume & LinkedIn · Detecting your career domain · Analyzing career fields · Matching suitable roles · Building your career roadmap |
| Recruiting Lens | `RECRUITING_LENS_STAGE_LABELS` (5) | Analyzing job description · Reading your professional profile · Evaluating match and gaps · Building your action roadmap · Generating strategic insights |
| LinkedIn Grader | `LINKEDIN_STAGE_LABELS` (6) | Reading your LinkedIn profile · Analyzing headline strength · Evaluating your About section · Evaluating experience quality · Checking search alignment & credentials · Generating personalized fixes |
| Interview Prep | `INTERVIEW_PREP_STAGE_LABELS` (5) | Analyzing job description · Reading your resume · Drafting likely questions · Preparing your talking points · Building your prep plan |
| Resume Analysis (stream) | `PERMITTED_STREAM_STAGE_LABELS` (5, from `@/lib/analysis-stage-copy`) | Connecting... · Evaluating your resume... · Writing your assessment... · Analyzing each criterion... · Writing improvement recommendations... |

Career Compass, Recruiting Lens and LinkedIn Grader kept their existing wording verbatim
(CONTEXT: the per-page arrays are the preferred source). Onboarding kept all four existing
labels and added `Preparing your dashboard`; Interview Prep kept its three and added
`Drafting likely questions` / `Preparing your talking points` in the same voice.

All five omit `activeStageIndex` and therefore run on the sanctioned timer.

**Icon imports pruned** only where `rg` proved them dead after the arrays were removed:
`Brain`, `Route` (CareerCompass); `FileSearch` (RecruitingLens); `Brain`, `Award`,
`MessageSquare` (LinkedInGrader). Everything still referenced was left alone.

**Index signature deleted.** `[legacyProp: string]: unknown`, the `...legacyProps` rest
param, and the dead `legacySubtitle` path are gone; `honestStreamLabel` collapsed to
`streamStageLabel` (the `resolveStageCopy` helper already validates it against
`PERMITTED_STREAM_STAGE_LABELS`, so no validation was lost). The now-unused
`PERMITTED_STREAM_STAGE_LABELS` import was dropped from the component. A comment on the
interface records exactly what the signature hid and for how long. **An unmigrated prop is
now a compile error.**

**Task 2d:** the two `CareerCompass.recovery.test.tsx` assertions that pinned
`'This usually takes 1-2 minutes'` and `'expectedDurationMs={120000}'` were guarding a
prop that was never rendered. They now assert the new contract
(`stageLabels={CAREER_COMPASS_STAGE_LABELS}` present, `expectedDurationMs` and the duration
string absent). The surrounding `'% complete'`, `setProgress` and `progressInterval`
assertions were left untouched. No other test file was edited.

## The `isStreamMode` gate — what it is and why it exists

`Results.tsx` now spreads a three-way conditional into `showWaitingSurface`:

1. `isEliteUnlockStream` → `ELITE_UNLOCK_STAGE_COPY`, `activeStageIndex` **omitted** (the
   surface advances itself; this is the only behavioural change to that branch).
2. else `isStreamMode` → `PERMITTED_STREAM_STAGE_LABELS` with
   `activeStageIndex: Math.max(0, PERMITTED_STREAM_STAGE_LABELS.indexOf(waitingStage ?? ''))`
   — a **real** signal off `streamState.stageLabel`, never a timer.
3. else → `{}`.

Branch 3 is the load-bearing one. The polling / job-status path MUST keep falling through
to the single-line `'Working on your analysis'` branch with no ladder and therefore no
timer, because:

- `e2e/cross-device/waiting-surface.spec.ts` **OT-8** (line 131) reads
  `getByTestId('analysis-stage-list').innerText()` and asserts it is byte-identical at
  15s / 30s / 45s / 60s. Any ladder there — timed or not — would either advance or change
  the text and fail the test.
- `e2e/cross-device/realtime-fallback.spec.ts` asserts
  `analysis-stage-list` contains `'Working on your analysis'` four times (lines 312, 337,
  414, 457).
- Neither e2e route sets `?stream=true`, which is what `isStreamMode` reads
  (`Results.tsx:237`).

**This gate must not be widened.** A comment to that effect, naming both specs, sits
directly above the spread in `Results.tsx`. `isStreamMode` was added to the effect's
dependency array (`waitingStage` was already present).

`Upload.tsx` passes `stageLabels: PERMITTED_STREAM_STAGE_LABELS` **and**
`activeStageIndex: 0`, so the pre-navigation surface is explicitly signal-driven, not
timed; Results then adopts the same surface record and advances it.

## Verification

| Check | Result |
|-------|--------|
| `npm run lint` | **PASS** — 0 errors, 153 warnings (all pre-existing; the `isStreamMode` exhaustive-deps warning at `Results.tsx:792` is on an unrelated effect and predates this task) |
| `npm run type-check` | **PASS** |
| `npm run test` | **PASS** — 153 files, 1196 tests |
| `universal-analyzing-source-guard.test.ts` | PASS (narrowed) |
| `responsive-source-guard.test.ts` | PASS (criterion 8) |
| `UniversalAnalyzing.test.tsx` | PASS — all three cases unmodified |
| `AnalysisWaitingHost.test.tsx` | PASS — unmodified |
| `CareerCompass.recovery.test.tsx` | PASS (updated in 2d) |
| `analysis-stage-copy.test.ts` | PASS — `analysis-stage-copy.ts` untouched |
| Scope: `git status` under `supabase/`, `scripts/`, `*.sql` | **zero changes** |

`npm run verify:baseline` was **NOT run** and is **owed before deploy** (it invokes remote
Deno edge tests and the full Playwright matrix).

### Follow-up session (2026-08-03): the e2e gap was closed by observation

The two specs previously "protected by construction, not observation" were **executed** on
chromium — `npx playwright test e2e/cross-device/waiting-surface.spec.ts
e2e/cross-device/realtime-fallback.spec.ts --project=chromium`:

**8 passed, 2 skipped (3.8m).** The 2 skipped are the pre-existing webkit OT-11 quarantine
(`4d8d567d`), not new. OT-8 passing is the decisive result: the `isStreamMode` gate did
**not** leak into the polling path.

A throwaway spec (written, run, deleted — not committed) additionally proved the stream
ladder branch, which no existing test reaches:

| Observation | Result |
|---|---|
| `?stream=true` ladder rows | **5** — `Connecting... → … → Writing improvement recommendations...` |
| infinite animations, motion allowed | **1**, and it is the active-step pulse (`border-2 border-primary border-t-transparent`, parent text `Connecting...`) |
| infinite animations, `reducedMotion: 'reduce'` | **0** |

Reaching that branch required seeding `sessionStorage.stream_params_<id>`: `Results.tsx:296-302`
strips `?stream=true` when the Upload handoff is absent and falls back to polling. That is
**pre-existing recovery behaviour, not a regression** — but it means the bare-URL route can
never render the stream ladder, which is why the existing `reduced motion leaves zero
infinite animations` test (`waiting-surface.spec.ts:235`) passes against the *single-line
fallback* and never exercised the new pulse at all.

**Correction to an earlier claim in this document:** `opacity-40` is *not* what protects
`e2e/elite-rerun-merit.spec.ts:522`. That assertion is `toBeVisible()`, which ignores
opacity entirely — those labels would pass even at `opacity: 0`. The dimming is correct for
design reasons; it is simply not load-bearing for that test. That spec remains unexecuted.

### Follow-up session: timer regression coverage added

`STEP_ADVANCE_MS` — the sanctioned timed advance, and the core new behaviour on five of the
six surfaces — had **zero automated coverage**. Two cases were added to
`src/components/UniversalAnalyzing.test.tsx`:

1. advances one step per 6s and **holds on the final step** (does not complete early);
2. the timer is **inert** when `activeStageIndex` is supplied — a real signal always wins.

Both were mutation-checked: setting `STEP_ADVANCE_MS = 999_000` fails case 1 and passes the
other four, so the assertion is not vacuous. Suite is now **1198 tests** (was 1196).

## Deviations from plan

None material. Two small judgement calls inside the plan's stated discretion:

1. The plan sketched the active-step pulse inline in both ladder branches, which would have
   produced three `repeat: Infinity` occurrences. Extracting the shared `StageRow` keeps the
   count at the specified 2 and directly satisfies the plan's own requirement that the two
   branches "stay visually identical to each other."
2. Onboarding shipped 5 labels (all 4 existing + `Preparing your dashboard`) rather than
   dropping `Finalizing your results` for the CONTEXT reference wording — the plan says to
   keep the existing 4 and extend, and the existing wording is the preferred source.

No architectural decisions were required. Nothing under `supabase/**` was touched; no
prompts, model calls, schemas, token budgets, scoring, generation, retry, merit, route or
DB behaviour was changed. The only non-`src/` file touched is a test file.

## BLOCKED — Task 3 is a `checkpoint:human-verify`

Task 3 cannot be self-certified: it is a browser pass over dark/light, mobile/desktop, and
an OS-level reduced-motion toggle. **A human must run `npm run dev` and check:**

1. **Onboarding** — upload a resume; the overlay shows 5 steps, ticks accumulate, the bar fills.
2. **Resume Analysis** — Upload → Results with `?stream=true`; steps track the REAL stream
   stages (`Connecting...` → `Evaluating your resume...` → …), not a 6s timer.
3. **Career Compass** — 5 steps. 4. **Recruiting Lens** — 5 steps.
5. **LinkedIn Grader** — 6 steps. 6. **Interview Prep** — 5 steps.
7. No bare spinner-only modal remains on any of the six; no `n% complete` and no
   "this usually takes …" claim anywhere on the overlay.
8. Toggle dark ↔ light — contrast holds on pending / active / completed rows and on the bar.
   (`opacity-40` on `text-muted-foreground` is the specific thing to eyeball in light mode.)
9. Resize to 375px wide — rows and bar stay readable, nothing overflows.
10. Enable OS "Reduce motion", reload, start an analysis — the activity ring AND the
    active-step pulse are both static; the step list still advances and copy still updates.
11. Let one analysis run to completion — it redirects / shows results exactly as before.

Specific things worth reporting if seen: a ladder that finishes and then idles looking
"done" while the run is still going; a pending step that is invisible rather than dimmed; a
surface still showing the old bare spinner; or the Results **polling** (non-`?stream=true`)
route showing a multi-step ladder — that last one would mean the `isStreamMode` gate leaked
and OT-8 will fail.

## Self-Check: PASSED

- All 10 modified files verified present on disk.
- Commits `07af8cb7` and `3184f5d1` verified in `git log`.
- `rg "repeat: Infinity" src/components/UniversalAnalyzing.tsx` → 2 (matches the guard).
- `rg "legacyProp" src/` → comment only, no type declaration.
- `rg "expectedDurationMs|steps=\{|subtitle=" src/pages/` → no `UniversalAnalyzing` call
  sites (only the unrelated `<PrepRoadmap steps={…}>` and the new test comment).

## Note on STATE.md

STATE.md was deliberately **not** advanced. It currently tracks Phase 04.2 Plan 5 of 5;
this is a quick task, not a phase plan, and running `state advance-plan` would corrupt that
position. ROADMAP.md was not touched either, per the execution constraints.

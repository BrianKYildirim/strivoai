# Quick Task 260803-fxz: Fix analysis loading animation UI regression across Strivo - Context

**Gathered:** 2026-08-03
**Status:** Ready for planning

<domain>
## Task Boundary

Restore the premium multi-step analysis loading experience (multi-step flow, progress
bar, 5-6 steps, tick marks on completed steps, animated active step, clean futuristic
Strivo styling) across every analysis surface: Onboarding resume analysis, Resume
Analysis, Career Compass, Recruiting Lens, LinkedIn Grader, and any other consumer of
the shared analysis loading state.

**UI-ONLY.** Explicitly out of scope — do not touch: backend behavior, AI prompts,
model calls, schemas, token budgets, scoring logic, generation logic, retry logic,
merits, routes, database behavior.

</domain>

<root_cause>
## Root Cause (established before planning — do not re-investigate)

This is **not** a styling regression. It is a silent prop-contract break.

`UniversalAnalyzing` renamed its `steps` prop to `stageLabels` (+ `activeStageIndex`).
The five feature callers were never updated. The component interface carries a
catch-all index signature at `src/components/UniversalAnalyzing.tsx:29-30`:

```ts
/** Legacy callers may still pass retired display configuration; it is ignored. */
[legacyProp: string]: unknown;
```

which swallows the stale props with no type error and no runtime warning.

Callers still passing the dead `steps` / `expectedDurationMs` / `subtitle` props:
- `src/pages/Onboarding.tsx:664-671`   (`onboardingAnalysisSteps`, defined :59)
- `src/pages/CareerCompass.tsx:993-1000` (`careerCompassSteps`, defined :979)
- `src/pages/RecruitingLens.tsx:748-755` (`recruitingLensSteps`, defined :249)
- `src/pages/LinkedInGrader.tsx:801-808` (`linkedInSteps`, defined :790)
- `src/pages/InterviewPrep.tsx:559-566`  (`analyzingSteps`, defined :191)

Only `src/components/AnalysisWaitingHost.tsx:17-25` passes the *new* `stageLabels` /
`activeStageIndex` contract.

Consequence: with `stageLabels` undefined and lifecycle dormant, all five surfaces fall
through to the single-line branch at `UniversalAnalyzing.tsx:268-272`, rendering the
bare spinner + "Working on your analysis". The per-feature step arrays are dead data.

The step list with pending / active / completed-tick states **already exists** at
`UniversalAnalyzing.tsx:215-273`. It is never fed, and is styled flat.

</root_cause>

<decisions>
## Implementation Decisions (LOCKED by user — do not revisit)

### Step advancement driver
**Timed advance on all surfaces, and narrow the OT-7 source guard to permit it.**

Only Resume Analysis emits genuine per-stage signal (`STAGE_LABELS` in
`src/lib/resume-stream-stage-labels.ts`). Career Compass, Recruiting Lens, LinkedIn
Grader and Onboarding emit no stage events. User accepted timed advancement so all five
surfaces show real motion through their steps, matching the previous premium feel.

Where a real signal exists (Resume Analysis stream stages, and `lifecycleState` when
`VITE_FEATURE_ANALYSIS_LIFECYCLE` is ever enabled), the real signal takes precedence
over the timer. The timer is the fallback, not an override.

### Progress bar form
**Determinate bar driven by completed-step count. No rendered percentage text.**

Bar fill = completed steps / total steps (step 3 of 6 → 50% fill). No `"{n}% complete"`
label. This preserves the guard's existing ban on rendered percentages unchanged.

### Source-guard amendment scope
`src/test/platform/universal-analyzing-source-guard.test.ts` must be **narrowed, not
deleted.** The Phase 03 OT-7 honesty intent is retained.

- **Relax:** the elapsed/step-advancement ban (`:17`) — timed advancement is now
  sanctioned. Update the test's `describe` text and add a comment recording that the
  operator authorized timed advancement on 2026-08-03 and why.
- **Keep enforced:** no rendered `%` (`:18`), no `expectedDurationMs` / "usually takes"
  duration claims (`:16`), semantic colours only / no `emerald` / no hardcoded colour
  literals (`:21-25`), reduced-motion gating on infinite animations (`:27-32`), single
  `aria-live` region and no Cancel/Abort affordance (`:34-39`).
- The `repeat: Infinity` count assertion (`:30`) is exact (`toHaveLength(1)`). Adding an
  active-step pulse changes that count — update the expected count deliberately and keep
  the assertion that **every** infinite animation stays gated behind
  `!prefersReducedMotion`.

### Claude's Discretion
- Exact visual treatment of "clean futuristic Strivo styling" — use existing semantic
  design tokens only, no hardcoded colours (guard-enforced and a CLAUDE.md convention).
- Per-step timing curve and whether the final step holds until real completion
  (recommended: hold on the last step rather than completing early and idling).
- Whether feature-specific step copy lives in each page or is consolidated into
  `src/lib/analysis-stage-copy.ts` — one shared component either way.

</decisions>

<specifics>
## Specific Ideas

Reference step wording supplied by the user (use feature-specific wording where a
surface already has it — the existing per-page arrays are the preferred source):

1. Uploading your resume
2. Reading profile data
3. Analyzing career signals
4. Generating recommendations
5. Saving results
6. Preparing your dashboard

`src/components/AnalysisExperience.tsx` is the previous premium loader and is the visual
reference for the restore (multi-step block :141-180, progress bar :183-191, spring tick
animation :157-164, active-step pulse :165-170).

**It must NOT be restored verbatim** — it violates the retained guard rules: rendered
`%` (:189), "This usually takes about 20 seconds" (:136), and `text-emerald-400` tick
marks (:163). Port the *feel*, respect the retained constraints, keep one shared
component. Note `AnalysisExperience` also renders a full results/score state
(:194-316) that is out of scope here.

</specifics>

<canonical_refs>
## Canonical References

- `src/test/platform/universal-analyzing-source-guard.test.ts` — Phase 03 OT-7 honest
  waiting-surface guard. The binding constraint on this task.
- `src/lib/analysis-stage-copy.ts` — honest stage copy, `LIFECYCLE_STAGE_COPY`,
  `WAITING_SURFACE_COPY`, `ELITE_UNLOCK_STAGE_COPY`. Header notes
  `VITE_FEATURE_ANALYSIS_LIFECYCLE` remains OFF and the lifecycle map is dormant.
- `src/lib/resume-stream-stage-labels.ts` — the only genuine per-stage signal source.
- `src/test/platform/responsive-source-guard.test.ts` — mobile/desktop guard; acceptance
  criterion 8 depends on it staying green.
- `TESTING-STRATEGY.md` — `npm run verify:baseline` is the blocking pre-merge gate.

</canonical_refs>

<verification>
## Acceptance Criteria (from user, verbatim intent)

1. Onboarding resume analysis shows the multi-step loader with progress bar + tick marks
2. Resume Analysis shows the same premium loader
3. Career Compass shows the same premium loader
4. Recruiting Lens shows the same premium loader
5. LinkedIn Grader shows the same premium loader
6. The spinner-only fallback modal is replaced
7. Works in dark and light mode
8. Works on mobile and desktop
9. No AI/backend/tokens/prompts/merits/scoring/generation logic changed
10. Loading states still complete normally and redirect/show results exactly as before

Existing test suites that must stay green: `npm run lint`, `npm run type-check`,
`npm run test` (includes both source guards, `UniversalAnalyzing.test.tsx`, and the
page-level tests listed in the executor's files_to_read).

</verification>

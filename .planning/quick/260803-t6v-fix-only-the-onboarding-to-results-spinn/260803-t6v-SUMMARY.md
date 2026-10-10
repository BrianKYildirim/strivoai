---
task: 260803-t6v
title: Fix only the onboarding → /results spinner handoff
status: complete-uncommitted
baseline: a712e607 (= origin/preview e96861f2)
branch: staging
committed: false
files-changed:
  - src/lib/analysis-stage-copy.ts
  - src/pages/Onboarding.tsx
  - src/pages/Results.tsx
  - src/components/AnalysisWaitingHost.onboarding-strictmode.test.tsx (new)
files-explicitly-not-touched:
  - src/contexts/AnalysisLockContext.tsx
  - src/components/UniversalAnalyzing.tsx
completed: 2026-08-03
---

# Quick 260803-t6v: Onboarding → /results spinner handoff Summary

Results now re-derives the onboarding stage ladder from a durable
`sessionStorage['onboarding_wait_<id>']` marker on every run of its waiting-surface
effect, so the StrictMode `hideWaitingSurface` that lands between Onboarding's seed and
Results' adopting write has no in-memory state left to destroy.

## What changed

### 1. `src/lib/analysis-stage-copy.ts` — additive only

Added `ONBOARDING_STAGE_LABELS`, moved verbatim (all five labels byte-for-byte) from the
top of `Onboarding.tsx`. Wrapped in `Object.freeze` to match the sibling ladders in the
same module. Nothing else in the file was touched.

`src/lib/__tests__/analysis-stage-copy.test.ts` was checked first: it asserts only on
specific named exports (`LIFECYCLE_STAGE_COPY`, `ANALYSIS_SUBJECTS`,
`PERMITTED_STREAM_STAGE_LABELS`, `WAITING_SURFACE_COPY`, `ELITE_UNLOCK_STAGE_COPY`,
`resolveStageCopy`) and has **no** "no additional exports" assertion. Adding the export
did not break it — it stayed green with no edit.

### 2. `src/pages/Onboarding.tsx`

- Local `ONBOARDING_STAGE_LABELS` declaration deleted; imported from
  `@/lib/analysis-stage-copy` instead. The `showWaitingSurface` seed is **unchanged**
  (same key, same title, same `stageLabels: ONBOARDING_STAGE_LABELS`, still no
  `activeStageIndex`).
- One marker write, placed immediately after the resume-record block — the first point at
  which `resume.id` exists, and ahead of all four `navigate(/results/${resume.id})` calls,
  so every handoff path is covered by construction:
  `sessionStorage.setItem(\`onboarding_wait_${resume.id}\`, '1')`.
- The id is held in a new outer-scope `onboardingWaitMarkerId` (because `resume` is
  block-scoped inside the `try`), and the `finally` clears the key alongside the existing
  fail-safe on any path that did not hand off. The existing one-liner
  `if (!handedOffToResults) hideWaitingSurface('resume-analysis');` is preserved
  byte-for-byte so `Onboarding.waiting-handoff.test.ts` still pins it.

### 3. `src/pages/Results.tsx`

- New exported `onboardingWaitKey(id)` and `resolveOnboardingLadder(id)`. The latter *is*
  the fourth branch: it reads the marker and returns `{ stageLabels:
  ONBOARDING_STAGE_LABELS }` or `null`, wrapped in try/catch so a partitioned/disabled
  sessionStorage degrades to today's behaviour. `activeStageIndex` is omitted — onboarding
  has no per-stage signal, so the sanctioned timer drives the ladder.
- Called **inside** the waiting-surface effect (`const adoptedOnboardingLadder =
  resolveOnboardingLadder(id)`), so the labels are re-read on every effect run rather than
  remembered. The comment at the helper spells out why that beats the in-memory
  carry-forward under `<StrictMode>`.
- The fourth branch sits after `isEliteUnlockStream`, after `isStreamMode`, and before the
  final `{}`. **The `isStreamMode` gate is unchanged and branch 3 still resolves to `{}`.**
  `id` was added to the effect's dep array.
- The marker is retired on the existing completion-side effect (the `view_results`
  telemetry effect, which fires exactly when `resume?.grading_data && !loading`). No new
  lifecycle was invented.

Exported helpers were used (rather than an inline `sessionStorage` read) so the regression
test can drive the *real* branch logic instead of restating it from memory — the same
shape `Results.stream-tier-carry.test.tsx` already uses for `applyAuthoritativeTier`.

## Regression test

`src/components/AnalysisWaitingHost.onboarding-strictmode.test.tsx` (new, 12 tests).

Rendered under `<StrictMode>` — without it the whole sequence passes, which is exactly how
the previous attempt shipped green and still broke on the operator's machine.

The main behavioural test:
1. Onboarding seeds the 5-step ladder and writes the marker; ladder asserted present.
2. A `MutationObserver` starts watching the whole document (childList + subtree +
   characterData) for `'Working on your analysis'`, so a *transient* flash between two
   point-in-time assertions is caught too.
3. Fake timers advance 6 s so one step completes — a reset becomes observable.
4. Route swaps to a Results-like consumer that runs the adopting write **and** registers
   the `hideWaitingSurface('resume-analysis')` unmount cleanup, which is what StrictMode
   fires between the two setups. Branch 4 is delegated to the real exported
   `resolveOnboardingLadder`.
5. Three further label-less status updates, each interleaved with another timer tick.
   After every one: all five labels present, fallback absent, and the completed-step count
   monotonically 1 → 2 → 3 → 4 (never reset).
6. `fallbackSightings` asserted `0` — it never even flickered.

Negative controls (both kept under StrictMode):
- An **unmarked** wait still renders the single-row `'Working on your analysis'` fallback
  with none of the five labels — the OT-8 / realtime-fallback contract at unit level.
- A marker for a **different** resume id does not let this one inherit the ladder.

Plus unit assertions that `resolveOnboardingLadder` returns the shared module-level array
(a per-call copy would restart the step timer), returns only the `stageLabels` key, and
returns `null` with no marker and with no id. Plus source pins that Results still consults
the helper inside the effect, that the stream gate and branch 3 were not altered, that
Results retires the marker, and that Onboarding writes it before every navigation and
clears it on the non-handoff paths.

## Mutation check (verbatim)

**Mutation 1 — neuter the marker branch's substance.** `resolveOnboardingLadder`'s
sessionStorage read replaced with `false`, so the branch can never be taken:

```
 ❯ src/components/AnalysisWaitingHost.onboarding-strictmode.test.tsx (12 tests | 3 failed) 89ms
     × keeps the five-step ladder through navigation, the hide, and repeated label-less updates 70ms
     × returns the shared module-level array — a per-call copy would restart the step timer 2ms
     × omits activeStageIndex so the sanctioned timer drives the ladder 1ms
 Test Files  1 failed (1)
      Tests  3 failed | 9 passed (12)
```

The behavioural failure is at line 193 — the first ladder assertion *after* the navigation
— and the printed DOM is the single-row `Working on your analysis` surface. That is the
operator's bug, reproduced. Both negative controls stayed green, as they must.

Restored:

```
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

**Mutation 2 — delete the fourth branch from the effect's conditional** (leaving
`: {}`), keeping the helper intact:

```
     × re-derives the ladder inside the waiting-surface effect, not once at mount 5ms
 AssertionError: expected 'import { useEffect, useRef, useState …' to contain '? adoptedOnboardingLadder'
 Test Files  1 failed (1)
      Tests  1 failed | 11 passed (12)
```

Restored:

```
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

## Verification (real results)

| Command | Result |
| --- | --- |
| `npm run lint` | `✖ 155 problems (0 errors, 155 warnings)` — baseline on stashed tree is `153 problems (0 errors, 153 warnings)`. The +2 are `react-refresh/only-export-components` on the two new `Results.tsx` exports, the same warning the file already carries for `applyAuthoritativeTier`. **0 errors.** |
| `npm run type-check` | clean, no output |
| `npm run test` | `Test Files 155 passed (155)` / `Tests 1220 passed (1220)` |
| `npx playwright test e2e/cross-device/waiting-surface.spec.ts e2e/cross-device/realtime-fallback.spec.ts --project=chromium` | `2 skipped, 8 passed (3.8m)` |

Playwright detail — no re-run was needed, OT-8 passed on the first attempt and no timeout
was raised:

```
  ✓   4 realtime-fallback.spec.ts:405 › OT-11: offline → online shows the reconnect note, then clears it (2.7s)
  ✓   5 realtime-fallback.spec.ts:451 › OT-11: a hidden → visible tab forces a catch-up poll (3.3s)
  ✓   6 realtime-fallback.spec.ts:284 › OT-10: a blocked socket resolves the run by polling, with only a muted line (4.1s)
  ✓   7 realtime-fallback.spec.ts:328 › OT-10 control: with realtime healthy the degraded line is ABSENT (3.2s)
  ✓   8 waiting-surface.spec.ts:131 › OT-8: a frozen server cannot advance the visible stage for 60 seconds (1.0m)
  ✓   9 waiting-surface.spec.ts:150 › OT-9: a 150-second client stall never becomes a failure (2.5m)
  ✓  10 waiting-surface.spec.ts:235 › reduced motion leaves zero infinite animations on the surface (737ms)
```

The 2 skipped are the pre-existing `QUARANTINE: OT-11 restore-budget` pair. `npm run dev`
was never run; Playwright built and served its own `vite preview` on :8080.

## Scope discipline

`src/contexts/AnalysisLockContext.tsx` and `src/components/UniversalAnalyzing.tsx` were
read for context only and are byte-identical to the baseline. No other feature page, no
styling, no animation, no AI/analysis/merit/API/polling/streaming behaviour, no navigation
target or ordering, no completion rule, and nothing under `supabase/**`, `scripts/` or
`*.sql` was touched. `git status` shows exactly three modified files plus one new test
file.

## Not committed

Left uncommitted by explicit instruction, for the operator's visual verification. STATE.md
was deliberately not updated for the same reason — nothing but the four files above is
dirty.

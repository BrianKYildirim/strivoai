---
phase: 31-optimistic-ui-refund-verification
plan: 03
subsystem: merit-optimistic-ui-wiring
tags: [merits, optimistic-ui, react-query, toast-taxonomy, streaming, async-poll]
requires:
  - "31-01: useMerits().optimisticDeduct + getMeritErrorMessage"
provides:
  - "All 5 feature submit paths fire optimisticDeduct(cost) before the network call and settle (commit/rollback)"
  - "All generic failure toasts route through getMeritErrorMessage (NFR-04)"
affects:
  - src/hooks/useResumeStream.ts
  - src/pages/Upload.tsx
  - src/pages/CareerCompass.tsx
  - src/pages/LinkedInGrader.tsx
  - src/pages/RecruitingLens.tsx
  - src/pages/InterviewPrep.tsx
tech-stack:
  added: []
  patterns:
    - "Single closure-captured settle per submit; commit on terminal success, rollback on every failure branch"
    - "Stream-lifetime settle fired inside useResumeStream (single Results-page lifecycle), not threaded across navigation"
    - "Outer-scoped nullable settle holder so a mid-poll throw still rolls back (CareerCompass)"
    - "Bespoke gate codes preserved; only generic errors routed through the shared merit taxonomy"
key-files:
  created: []
  modified:
    - src/hooks/useResumeStream.ts
    - src/pages/Upload.tsx
    - src/pages/CareerCompass.tsx
    - src/pages/LinkedInGrader.tsx
    - src/pages/RecruitingLens.tsx
    - src/pages/InterviewPrep.tsx
decisions:
  - "Resume optimistic deduct fires once at stream start inside useResumeStream (Open Q2), settles on stream terminal state; meritCost threaded through StreamParams + Upload sessionStorage — no double-deduct on Upload (T-31-07)"
  - "CareerCompass settle is held in an outer-scoped nullable so a throw mid-poll (after deduct) still rolls back"
  - "InterviewPrep keeps the three bespoke gate codes (no_resume/daily_cap/monthly_taste_used) via mapBespokeGateError; only non-bespoke failures route through getMeritErrorMessage. mapServerError removed."
  - "InterviewPrep error-card heading no longer renders the generic 'Something went wrong' string (T-31-06 / NFR-04)"
metrics:
  duration: ~35m
  completed: 2026-05-20
requirements: [MER-03, NFR-03, NFR-04]
---

# Phase 31 Plan 03: Optimistic UI Wiring Summary

Wired the Plan 31-01 client primitives (`optimisticDeduct` + `getMeritErrorMessage`) into all five feature submit paths — the four sync pages plus the resume-analysis streaming path via `useResumeStream` — and the CareerCompass async poll loop. Every path now decrements the displayed Merit balance optimistically on submit (D-03), settles authoritatively on success/failure (D-02), and surfaces error-class-keyed toasts instead of generic copy (NFR-04).

## What Was Built

### Task 1 — Resume-analysis streaming settle (commit a434e45)
- `useResumeStream` now imports `useMerits` + `getMeritErrorMessage`. A single `settle = optimisticDeduct(params.meritCost ?? 0)` fires once at stream start (Open Q2 — single Results-page lifecycle), guarded by a `settled` flag so it can never fire twice.
- `commit()` on the `complete` event and on the recovered-from-accumulated-chunks path (D-07). `rollback()` on: fetch failure, non-ok response, stream `error` event (status from `event.status`), unexpected EOF, outer-catch disconnect, and unmount/abort cleanup. The 429 rate-limit branch rolls back (no charge) and keeps its bespoke wait-minutes copy. The not-authenticated gate rolls back silently (not a merit error).
- `meritCost` is now part of `StreamParams` and is written into the Upload→Results `sessionStorage` payload, so the deduct lives entirely in the stream lifecycle — Upload itself does NOT deduct (T-31-07 double-deduct guard). Upload's pre-stream error cascade keeps the 402→`openModal` path (D-03) but routes its generic/network toasts through `getMeritErrorMessage`.

### Task 2 — CareerCompass async poll-loop settle (commit 3b33453)
- `settle` is captured ONCE before `submit-career-analysis-job` (D-04 / Pitfall 4) and held across the ~60 poll iterations. It is declared in an outer-scoped nullable holder so the outer catch (a throw mid-poll, after the deduct fired) can still roll back.
- `commit()` on `completed` (folds in the prior `invalidateMerits()`); `rollback()` on submit-error, `failed`, poll-timeout, and the outer catch. All bespoke branches (`missing_prior_analyses`, `linkedin_prior_missing`, `rate_limit_exceeded`, `usage_limit`, `isInfrastructureFailure`) are preserved; only the generic toast routes through `getMeritErrorMessage`. Dropped the now-unused `useInvalidateMerits`.

### Task 3 — LinkedInGrader / RecruitingLens / InterviewPrep sync settle (commit 273ff08)
- All three: `settle = optimisticDeduct(cost)` before the network call, `commit()` on success (replacing `invalidateMerits()`), `rollback()` + `getMeritErrorMessage` on error. The error status is derived from the error/result (`.status` when present, else an HTTP code parsed from the message, else the refundable 5xx class).
- InterviewPrep: `mapServerError` replaced by `mapBespokeGateError` (keeps `no_resume`/`daily_cap`/`monthly_taste_used`); everything else routes through `getMeritErrorMessage`. Added `useFeatureCosts` + `getCostForFeature(featureCosts, 'interview_prep', state.tier)`. The error-card heading no longer renders the generic "Something went wrong" string — it surfaces the class-keyed copy (T-31-06).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] CareerCompass outer-scope settle holder**
- **Found during:** Task 2
- **Issue:** The plan placed `const settle` immediately before submit (inside the inner try). The inner try has no catch — a throw during polling (after the deduct fired) propagates to the outer catch where `settle` would be out of scope, leaking an un-rolled-back optimistic decrement.
- **Fix:** Declared `let settle: {...} | null = null` in the outer try scope and assigned it before submit; the outer catch rolls it back. Inner usages made null-safe (`settle?.`).
- **Files modified:** src/pages/CareerCompass.tsx
- **Commit:** 3b33453

**2. [Rule 2 - Missing critical functionality] InterviewPrep generic error-card heading**
- **Found during:** Task 3
- **Issue:** The error-view JSX rendered a static "Something went wrong" heading, violating the plan must_have "No path renders 'Something went wrong'" (T-31-06 / NFR-04). The plan's edit recipe targeted the toast/`mapServerError` path only and did not mention the JSX heading.
- **Fix:** Replaced the static heading with the class-keyed `state.errorMessage` (falling back to `COPY.aiError`); removed the now-redundant secondary line.
- **Files modified:** src/pages/InterviewPrep.tsx
- **Commit:** 273ff08

**3. [Rule 1 - Refinement] InterviewPrep bespoke-vs-generic split**
- **Found during:** Task 3
- **Issue:** The plan said "replace mapServerError with getMeritErrorMessage". A wholesale replacement would have lost the three feature-specific gate messages (no_resume/daily_cap/monthly_taste_used), which are non-merit gate copy.
- **Fix:** Split into `mapBespokeGateError` (the three gate codes → returns null otherwise) + `getMeritErrorMessage` for everything else — mirroring the CareerCompass "keep bespoke branches, route only generic" pattern explicitly mandated for Task 2.
- **Files modified:** src/pages/InterviewPrep.tsx
- **Commit:** 273ff08

## Verification
- Per-file grep assertions (Tasks 1-3): `optimisticDeduct` / `.commit()` / `.rollback()` / `getMeritErrorMessage` all present; `Something went wrong` absent from all 3 sync pages. All exit 0.
- `npx eslint` on each modified file: zero NEW errors. Pre-existing `@typescript-eslint/no-explicit-any` counts are byte-identical to the pre-change baseline (useResumeStream+Upload: 7; CareerCompass: 22; the 3 sync pages: 14) — out of scope per scope boundary.
- `npx tsc -p tsconfig.app.json --noEmit`: the 4 errors touching CareerCompass/Upload are byte-identical at baseline (pre-existing `SetStateAction` / `MouseEventHandler` mismatches) — zero new type errors introduced.
- Manual (phase gate, 31-VALIDATION Manual-Only): click Analyze on each of the 5 features; balance digit drops immediately and restores within 2s on forced failure; each error class renders its specific toast. NOT executed here (manual phase-gate step).

## Threat Flags
None — no new network endpoints, auth paths, or trust-boundary surface introduced. T-31-06 (raw server text in toasts) and T-31-07 (double-deduct) are both mitigated as planned and noted above.

## Self-Check: PASSED
- FOUND: src/hooks/useResumeStream.ts (a434e45)
- FOUND: src/pages/Upload.tsx (a434e45)
- FOUND: src/pages/CareerCompass.tsx (3b33453)
- FOUND: src/pages/LinkedInGrader.tsx (273ff08)
- FOUND: src/pages/RecruitingLens.tsx (273ff08)
- FOUND: src/pages/InterviewPrep.tsx (273ff08)
- Commits a434e45, 3b33453, 273ff08 present in git log.

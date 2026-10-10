---
phase: 04-feature-migration-a-recruiting-lens-linkedin-grader
plan: 05
subsystem: frontend
tags: [linkedin-grader, react, dynamic-render, score-bands, recovery, feat-04, d-05]

# Dependency graph
requires:
  - phase: 04-02
    provides: "grade-linkedin/schema.ts LINKEDIN_SCORE_BANDS recalibrated cutoffs + 11-section shape (mirrored on the frontend)"
  - phase: 03-05
    provides: "src/hooks/useAnalysisRun (dormant recovery surface — run_id persistence + refresh recovery)"
provides:
  - "src/pages/LinkedInGrader.tsx — dynamic N-section render (v4=11, legacy v3=4), honest N/A/absent display, recalibrated D-03 bands, LOCKED_FIXES_PLACEHOLDERS + depth-gating removed (D-05), isV4Grade shape gate, attemptNonce transport + run_id/recordId refresh recovery (FEAT-04)"
affects:
  - "04-06 (VER-03 distribution / repeated-run / idempotency guards + deno.json registration; consumes the frontend contract)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Field-driven section render: one dynamic map renders v4 (evidence/strengths/weaknesses/improvements + N/A) and legacy v3 (feedback[]) each by its own shape — no back-filling missing fields onto a legacy row"
    - "Frontend mirror of an edge source-of-truth constant (LINKEDIN_SCORE_BANDS) with a comment pointing to schema.ts (Deno edge code not imported across runtimes)"
    - "Additive dormant recovery: attemptNonce minted per deliberate submit; run_id via useAnalysisRun.startRun (inert while VITE_FEATURE_ANALYSIS_LIFECYCLE is off); re-hydration via recordId → ?id= (existing hydration path), never result_ref"

key-files:
  created: []
  modified:
    - src/pages/LinkedInGrader.tsx

key-decisions:
  - "maxScore widened from the 20|30|25 literal union to number; bars computed from section.score / section.maxScore — no hardcoded denominator or 4-section length assumption"
  - "D-05 everything-to-everyone: removed LOCKED_FIXES_PLACEHOLDERS, the free-tier per-section BlurredLockCard gate, the topFixes.slice(0,1) free limit, and the upgrade divider/CTA — Free sees the full 11 sections + complete fix list. Dropped now-unused isFreeGated/AdminTierTest/BlurredLockCard/Lock/Crown"
  - "D-01/D-04 honesty: applicable:false → N/A card excluded from the total (no bar); an applicable-but-absent section shows its honest low score + what's missing — never fabricated content"
  - "v3/v4 shape gate: isV4Grade (per-section applicable+evidence) added alongside isV3Grade; isRenderableGrade = v3 || v4 admits both at the History/hydration boundary; the field-driven renderer renders each honestly"
  - "FEAT-04 recovery is re-hydrated via recordId (linkedin_grades.id, in the 04-04 edge body) through the existing ?id= path — NOT useAnalysisRun.previousResult/result_ref (analysis_jobs has no result-pointer column; result_ref is always null)"

patterns-established:
  - "Dynamic honest render of a variable-length rubric with per-section applicability (N/A excluded from total, absent scored low honestly)"
  - "Additive dormant lifecycle recovery wiring on a synchronous feature (no behavior change until the VITE flag flips)"

requirements-completed: [FEAT-04]

# Metrics
duration: 20min
completed: 2026-07-02
---

# Phase 04 Plan 05: Dynamic 11-Section LinkedIn Results UI + Refresh Recovery Summary

**Rewrote the LinkedIn Grader results view from a hard-coded 4-section binding (`sectionBreakdown[4]` with fixed `maxScore:20|30|25`) to a DYNAMIC N-section render that shows any applicable-section count honestly — non-applicable sections as N/A excluded from the total, applicable-but-absent sections at their honest low score with what's missing — recalibrated the score bands to the shared D-03 cutoffs, removed the `LOCKED_FIXES_PLACEHOLDERS` teaser and all LinkedIn depth-gating so Free sees the full output (D-05), added an `isV4Grade` shape gate that renders v3 and v4 History rows each by their own shape, and wired the FEAT-04 half: a per-submit `attemptNonce` plus `run_id`/`recordId` refresh recovery that stays inert while the lifecycle flag is off.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 auto + 1 blocking human-verify checkpoint (approved)
- **Files modified:** 1 (`src/pages/LinkedInGrader.tsx`)

## Accomplishments

### Task 1 — Dynamic render + recalibrated bands + teaser removal + v3/v4 gate (commit `7d9d3e3f`)
- **Section type:** `LinkedInSection.maxScore` widened `20|30|25` → `number`; `name` widened to `string`; added optional v4 fields (`applicable`, `evidence`, `strengths`, `weaknesses`, `improvements`) and kept v3 `status`/`feedback` optional so both shapes type-check through one interface.
- **Dynamic render:** `sectionBreakdown.map(...)` renders however many sections exist; bars use `section.score / section.maxScore` (clamped 0–100). No `length === 4` assumption remains.
- **Honest N/A/absent (D-01/D-04):** `applicable === false` renders an "N/A — not scored for this profile" card (muted, empty bar, excluded from the total); an applicable section renders its honest score + evidence/strengths/weaknesses/improvements — never fabricated. Legacy v3 sections (no `applicable`) render their own `feedback[]`.
- **Recalibrated bands (D-03):** added a local `LINKEDIN_SCORE_BANDS` mirror (comment naming `grade-linkedin/schema.ts` as source of truth) + `scoreBandLabel()`; replaced the old Top-5%/Excellent/Good/Average ladder, the `getScoreColor` thresholds (now 85/70/50), the score-circle stroke, the badge colors, and the descriptive copy.
- **D-05 everything-to-everyone:** removed `LOCKED_FIXES_PLACEHOLDERS` + its render block, the free-tier per-section `BlurredLockCard`, the `topFixes.slice(0, 1)` free limit, and the "unlock 3 more sections" divider/CTA. Dropped the now-unused `isFreeGated`, `useAdminTierTest`/`getEffectiveTier`, `BlurredLockCard`, `Lock`, `Crown`.
- **Shape gate:** added `isV4Grade` (per-section `applicable` boolean + `evidence` string) and `isRenderableGrade = isV3Grade || isV4Grade`; the three History/cache hydration gates now admit both shapes, and the field-driven renderer renders each honestly (no back-filling — RESEARCH Open-Question 3).

### Task 2 — attemptNonce transport + run_id refresh recovery (commit `95e4d343`)
- **attemptNonce:** minted fresh (`crypto.randomUUID()`) at the start of each deliberate grade submit, stored in a ref, and included in the `grade-linkedin` invoke body — the edge derives the Merit idempotency key from it (JWT userId + input identity + nonce).
- **run_id recovery:** adopted `useAnalysisRun()`; on a response carrying `run_id`, calls `startRun(run_id)` (persists to URL + localStorage). Inert while `VITE_FEATURE_ANALYSIS_LIFECYCLE` is off — no behavior change.
- **Re-hydration:** on success, persists the response `recordId` (`linkedin_grades.id`, carried by the 04-04 edge body) to the URL as `?id=` so a refresh re-fetches the grade through the EXISTING `?id=` hydration path — deliberately NOT `useAnalysisRun.previousResult`/`result_ref` (`analysis_jobs` has no result-pointer column; `result_ref` is always null). The existing inline `setResult` handling is preserved; a later failure never clears a prior successful result.

## Verification

- `npx tsc -p tsconfig.app.json --noEmit` → **0 errors in `LinkedInGrader.tsx`**. The 10 total repo errors are pre-existing recharts-typing noise in unmodified files (`chart.tsx`, `EliteScoreHistory.tsx`, `ScoreProgressChart.tsx`) — confirmed unmodified vs HEAD, out of scope.
- `npm run lint` → exit **0** (0 errors; the 2 warnings on this file are the pre-existing `orderedSections` manual-memoization warning, untouched by this plan).
- grep gates: no `LOCKED_FIXES_PLACEHOLDERS`; `maxScore: number`; `attemptNonce` in invoke body; `useAnalysisRun()` adopted + `analysisRun.startRun`; `isV4Grade` present.
- Human-verify checkpoint **approved** (render / N/A / bands / teaser-removal confirmed). Orchestrator independently confirmed LinkedIn token limits are unchanged (sourced from the untouched `src/config/pricing-config.ts`; `index.ts` still derives via `getMaxOutput()`/`getMaxInputChars()`) — cost calibration intact.

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] Removed section-level free depth-gating (not only the fix teaser)**
- **Found during:** Task 1.
- **Issue:** The plan's Task 1 action text explicitly named `LOCKED_FIXES_PLACEHOLDERS` removal, but the page ALSO gated non–Profile-Completeness sections behind a per-section `BlurredLockCard`, limited `topFixes` to 1 for free, and showed an "unlock 3 more sections" upgrade divider/CTA — all depth-gating that D-05 ("both tiers see the full 11-section output; no depth gating on LinkedIn") and must-have truth 1 ("renders all 11 sections dynamically") forbid.
- **Fix:** Removed all four depth-gating mechanisms so Free flows through the identical full render as Elite.
- **Files:** `src/pages/LinkedInGrader.tsx`.
- **Commit:** `7d9d3e3f`.

**2. [Rule 3 - Tidy-up] Dropped now-unused imports/hook after gating removal**
- **Found during:** Task 1.
- **Issue:** Removing the free-gating left `isFreeGated`, `useAdminTierTest`/`getEffectiveTier`, `BlurredLockCard`, `Lock`, and `Crown` unreferenced. `noUnusedLocals` is `false` so these would not fail type-check, but they were dead + the surrounding comments were now misleading.
- **Fix:** Removed the dead declarations, hook usage, and imports; corrected the comments to describe the D-05 full-render behavior.
- **Files:** `src/pages/LinkedInGrader.tsx`.
- **Commit:** `7d9d3e3f`.

## Deferred / Out-of-Scope Notes

- **Runtime run_id/recordId recovery is dormant locally by design:** `useAnalysisRun` is inert while `VITE_FEATURE_ANALYSIS_LIFECYCLE` is off, and the `run_id`/`recordId` fields depend on the 04-04 edge migration being deployed + the flag enabled on a preview session. The render / N/A / bands / teaser-removal are verifiable in the local build now; live recovery is verified when the flag flips.
- **Pre-existing repo tsc errors** (recharts typing in `chart.tsx`/`EliteScoreHistory.tsx`/`ScoreProgressChart.tsx`) are not introduced by this plan and are left untouched (scope boundary).
- **VER-03 distribution / repeated-run / idempotency guards + `deno.json` registration** land in 04-06.

## Self-Check: PASSED

- `src/pages/LinkedInGrader.tsx` — present (modified).
- `.planning/phases/04-feature-migration-a-recruiting-lens-linkedin-grader/04-05-SUMMARY.md` — present.
- Commits `7d9d3e3f` (Task 1) and `95e4d343` (Task 2) — both in `git log` history.

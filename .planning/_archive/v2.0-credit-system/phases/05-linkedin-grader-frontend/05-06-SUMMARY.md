---
phase: 05-linkedin-grader-frontend
plan: 06
subsystem: linkedin-grader-frontend
tags: [linkedin-grader, frontend, comparison-modal, discriminated-union]
requires: [05-01, 05-02, 05-03, 05-04]
provides: [comparison-modal-v3]
affects:
  - src/components/AnalysisComparisonModal.tsx
  - src/pages/LinkedInGrader.tsx
tech-stack:
  added: []
  patterns: [discriminated-union, graceful-legacy-filter]
key-files:
  created: []
  modified:
    - src/components/AnalysisComparisonModal.tsx
    - src/pages/LinkedInGrader.tsx
decisions:
  - Reused existing exports (LinkedInResult / LinkedInSection / LinkedInTopFix) from LinkedInGrader.tsx — no extraction to a shared types file
  - Split selectedPrevious state into two disjoint state slots (resume vs linkedin) rather than coercing through a single union, to keep TS narrowing straightforward in event handlers
  - Silently filtered legacy pre-v3.0 linkedin_grades rows out of the dropdown per RESEARCH.md Open Question 3
metrics:
  duration: ~10 min
  completed: 2026-04-12
---

# Phase 05 Plan 06: Comparison Modal Rewire Summary

Rewired `AnalysisComparisonModal.tsx` via a TypeScript discriminated union on `analysisType`, leaving the resume branch byte-identical and migrating the LinkedIn branch to the v3.0 schema. Updated the caller in `LinkedInGrader.tsx` to pass the v3.0 payload directly, removing all legacy shape synthesis. This is the final frontend plan for Phase 05; LIG-13 is now satisfied end-to-end.

## Type Exports

`LinkedInResult`, `LinkedInSection`, and `LinkedInTopFix` were **already exported** from `src/pages/LinkedInGrader.tsx` at lines 24/32/47 (landed earlier in Plan 01). No extraction to a new types file was needed. The modal imports them via `import type { LinkedInSection, LinkedInTopFix } from "@/pages/LinkedInGrader"`.

## Changes

### `src/components/AnalysisComparisonModal.tsx`

- Replaced `AnalysisData` + `ComparisonProps` with:
  - `ResumeAnalysis` (unchanged legacy shape)
  - `LinkedInAnalysisData` (v3.0: `rawScore`, `sectionBreakdown`, `topFixes`, `keyStrengths`, `profileInsights`)
  - `LinkedInPreviousRow` (shape of a row fetched from the `linkedin_grades` table)
  - `ComparisonProps = { analysisType: 'resume'; currentAnalysis: ResumeAnalysis } | { analysisType: 'linkedin'; currentAnalysis: LinkedInAnalysisData }`
- Split state into two slots: `previousResumeRows` / `selectedPreviousResume` vs `previousLinkedInRows` / `selectedPreviousLinkedIn`. This avoids fighting the union inside event handlers and keeps TS narrowing local to each branch.
- `getCurrentCriteria` / `getPreviousCriteria`: linkedin branch maps `sectionBreakdown → { name, weight: maxScore, score: (score/maxScore)*100 }`; resume branch returns `grading_data?.criteria || []` (unchanged).
- `getCurrentStrengths` / `getPreviousStrengths`: linkedin branch returns `keyStrengths`; resume branch unchanged.
- `getCurrentImprovements` / `getPreviousImprovements`: linkedin branch returns `topFixes.map(f => f.title)`; resume branch unchanged.
- `currentScore` / `previousScore` helpers: linkedin uses `rawScore` with a fallback to legacy `overall_score` column for the previous row; resume uses `overall_score`.
- Score-delta hero and `ScoreCard` now consume the rounded `currentScore`/`previousScore` helpers.
- Legacy row filter in the `linkedin_grades` fetch: rows without `rawScore` + `sectionBreakdown` are silently dropped from `previousLinkedInRows`, so legacy grades never appear in the "Compare to Previous" dropdown.
- Lint: reduced modal `any` count from 5 → 2 as a side-effect of typing the helpers; both remaining `any`s are pre-existing (`grading_data: any` on ResumeAnalysis and the matched-criteria map callback inherited from the untouched resume branch).

### `src/pages/LinkedInGrader.tsx`

- Replaced the legacy modal caller (which synthesized a `grading_data` blob with `any`-cast) with the v3.0 discriminated-union payload: `rawScore`, `sectionBreakdown`, `topFixes`, `keyStrengths`, `profileInsights`, `created_at`.
- Removed the `TODO(plan-06): rewire modal shape to v3.0 discriminated union` comment left by Plan 02.
- Preserved the `result.recordId && ...` guard.

## Invariants Verified

- `src/pages/Results.tsx` **not modified** — `git diff --stat src/pages/Results.tsx` returns empty. D-12 locked invariant holds.
- `grep -c "grading_data?.criteria" src/pages/Results.tsx` = 0 both before and after (the resume path in Results.tsx reads `grading_data?.criteria` via the modal, not directly — baseline count is 0).
- Resume branch inside the modal returns identical shape to pre-Plan-06 code: destructures from `grading_data?.criteria`, `grading_data?.strengths`, `grading_data?.improvements`; `ScoreCard` receives `overall_score` via the `currentScore` helper which resolves to `overall_score` for the resume branch.
- `npm run build` exits 0 (verified twice — once after Task 1, once after Task 2).
- Lint: my changes do not introduce any new errors. The file-scoped error count on modified files dropped from 9 → 6 pre-existing. Repo-wide `npm run lint` is red due to ~675 pre-existing errors in unrelated files (edge functions, tailwind config) — out of scope per the scope boundary rule. Documented as a Deferred Issue below.

## Acceptance Criteria

### Task 1
- `grep -c "type ComparisonProps" src/components/AnalysisComparisonModal.tsx` = 1 (>=1) PASS
- `grep -c "analysisType: \"linkedin\"" src/components/AnalysisComparisonModal.tsx` >= 2 PASS (union def + linkedin fetch branch)
- `grep -c "analysisType === \"resume\"" src/components/AnalysisComparisonModal.tsx` >= 2 PASS
- `sectionBreakdown` usage >= 2 PASS
- `keyStrengths` usage >= 1 PASS
- `topFixes` usage >= 1 PASS
- `rawScore` usage >= 1 PASS
- `LinkedInSection | LinkedInTopFix` >= 2 PASS (import + state type usage)
- `npm run build` exits 0 PASS
- Results.tsx unchanged PASS

### Task 2
- `grep -c "rawScore: result.rawScore"` = 1 PASS
- `grep -c "sectionBreakdown: result.sectionBreakdown"` = 1 PASS
- `grep -c "topFixes: result.topFixes"` = 1 PASS
- `grep -c "keyStrengths: result.keyStrengths"` = 1 PASS
- `grep -c "profileInsights: result.profileInsights"` = 1 PASS
- `grep -c "TODO(plan-06)"` = 0 PASS
- `grep -c "overall_score: result"` = 0 PASS
- `grep -c "categories: result"` = 0 PASS
- `grep -c "grading_data: {"` = 0 PASS
- `npm run build` exits 0 PASS

## Deviations from Plan

None on Rules 1-3. One scope note:

- The plan's acceptance criteria include `npm run lint` exits 0, but the repo baseline already has ~675 pre-existing lint errors (edge functions using `any`, `tailwind.config.ts` using `require()`). These are not introduced or affected by my changes and are outside the scope boundary (pre-existing failures in unrelated files). My file-scoped lint errors dropped from 9 → 6 (net improvement of 3, all remaining are pre-existing `any`s on legacy resume paths that D-12 locks out of scope). No new lint errors introduced.

## Deferred Issues

- Repo-wide `npm run lint` baseline is red (~675 errors) from pre-existing `@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-require-imports` in edge functions and tailwind config. Out of scope for Phase 05 frontend surface.

## Manual Smoke

Not performed in executor context (no staging browser available). Recommended smoke steps from the plan's `<verification>` block are:
- Load `/linkedin-grader` → run a scan → click "Compare to Previous" → verify modal renders sectionBreakdown criteria, keyStrengths, topFixes titles, and score delta driven by rawScore.
- Load a user with a legacy pre-v3.0 cached `linkedin_grades` row → verify the legacy row does NOT appear in the dropdown (silent filter).
- Load `/results/:id` (resume) → verify resume comparison modal still renders exactly as before (regression check).

## Commits

- `afb2249` refactor(05-06): discriminated union for AnalysisComparisonModal linkedin branch
- `fdee5ec` feat(05-06): pass v3.0 shape to AnalysisComparisonModal from LinkedInGrader

## Self-Check: PASSED

- src/components/AnalysisComparisonModal.tsx: FOUND (modified)
- src/pages/LinkedInGrader.tsx: FOUND (modified)
- src/pages/Results.tsx: UNTOUCHED (git diff empty)
- Commit afb2249: FOUND
- Commit fdee5ec: FOUND
- `npm run build`: exits 0

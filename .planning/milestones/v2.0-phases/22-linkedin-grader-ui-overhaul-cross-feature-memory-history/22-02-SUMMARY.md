---
phase: 22-linkedin-grader-ui-overhaul-cross-feature-memory-history
plan: 02
subsystem: ui
tags: [react, tailwind, scan-new-header, cross-page-parity, d-10]

# Dependency graph
requires:
  - phase: 22-linkedin-grader-ui-overhaul-cross-feature-memory-history
    provides: LinkedInGrader.tsx:629-654 donor header-bar pattern (Plan 22-01)
provides:
  - Results.tsx Scan-New header-bar with 'Resume Screening Report' + 'Analyze New Resume' button routing to /upload (D-10, SC-1 parity)
  - CareerCompass.tsx Scan-New header-bar with 'Your Career Compass' + 'Start New Analysis' button clearing analysis state (D-10)
  - RecruitingLens.tsx Scan-New header-bar with 'Your Recruiting Lens Match' + 'Run New Match' button clearing match state (D-10)
affects: [future-ui-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-page header-bar parity: all 4 feature results pages share the same flex items-center justify-between mb-6 row pattern with text-2xl font-semibold heading and gap-2 outline RefreshCw button"
    - "Reuse existing reset callbacks: handleRefreshAnalysis (CareerCompass) and onAnalyzeAnother (RecruitingLens) already implemented sane state clearing; plan intentionally rewired labels + placement without inventing new reset handlers"

key-files:
  created: []
  modified:
    - src/pages/Results.tsx
    - src/pages/CareerCompass.tsx
    - src/pages/RecruitingLens.tsx

key-decisions:
  - "Results.tsx reset navigates to /upload (per plan) — Results is a per-id route with no in-page input form to clear"
  - "CareerCompass.tsx reuses existing handleRefreshAnalysis (setAnalysis(null) + setIsFromCache(false)) — no new state needed, stays on /career-compass"
  - "RecruitingLens.tsx reuses existing onAnalyzeAnother prop callback on RecruitingLensResultsView (setResult(null), setJobDescription(''), setLinkedinText(''), setShowTryAgain(false), sessionStorage remove) — consolidates the 2 pre-existing Analyze-Another buttons into the canonical header-bar"
  - "Results.tsx removed the duplicate <h1>Resume Screening Report</h1> (formerly line 725) so grep -c returns exactly 1 match per acceptance criteria; the eyebrow 'Career Intelligence Report' and filename block are preserved"
  - "Existing text-2xl font-bold heading in RecruitingLens (pre-existing 'Your Match Analysis') normalized to text-2xl font-semibold per UI-SPEC §Typography two-weight rule for the D-10 replacement markup"

patterns-established:
  - "Header-bar pattern replication across feature pages: reuse plan's canonical flex row with per-page labels without duplicating reset logic"
  - "Preserve existing handler identity (handleRefreshAnalysis, onAnalyzeAnother) when porting visual patterns — do not invent new state setters"

requirements-completed: [SC-1, SC-7]

# Metrics
duration: ~30 min
completed: 2026-04-19
---

# Phase 22 Plan 02: Scan-New Header-Bar Cross-Page Parity Summary

**Results.tsx, CareerCompass.tsx, and RecruitingLens.tsx each now render a `flex items-center justify-between mb-6` header-bar row with a `text-2xl font-semibold` title and a right-aligned outline `RefreshCw` button above their main results content, matching the LinkedInGrader.tsx:629-654 donor pattern established in Plan 22-01.**

## Performance

- **Duration:** ~30 minutes (execution + verification)
- **Started:** 2026-04-19T18:00:00Z
- **Completed:** 2026-04-19T18:30:00Z (checkpoint reached)
- **Tasks:** 2 of 3 code tasks executed + committed; Task 3 is the mandatory browser-verification checkpoint — awaiting operator approval
- **Files modified:** 3 (src/pages/Results.tsx, src/pages/CareerCompass.tsx, src/pages/RecruitingLens.tsx)

## Accomplishments

- **Results.tsx**: Added Scan-New header-bar row above the Premium Report Header motion block with "Resume Screening Report" title (text-2xl font-semibold) + "Analyze New Resume" outline button that routes to `/upload`. Removed the duplicate `<h1>Resume Screening Report</h1>` from the previous header so the title appears exactly once (acceptance: `grep -c "Resume Screening Report" == 1`).
- **CareerCompass.tsx**: Added Scan-New header-bar row as the first child of the analysis-present branch (`<div className="space-y-8 animate-fade-in">`) with "Your Career Compass" title + "Start New Analysis" outline button bound to the existing `handleRefreshAnalysis` callback (clears `analysis` + `isFromCache` state, no navigation). Added `RefreshCw` to lucide-react imports.
- **RecruitingLens.tsx**: Retitled the existing results-view header inside `RecruitingLensResultsView` from "Your Match Analysis" + "Analyze Another Job" to "Your Recruiting Lens Match" + "Run New Match" and normalized the heading class from `text-2xl font-bold` to `text-2xl font-semibold` per UI-SPEC §Typography two-weight rule. The existing `onAnalyzeAnother` prop callback (already defined at RecruitingLens.tsx:487-493 with proper state clearing) is preserved unchanged.
- All three pages gated their changes to the render path that fires when the main results are present; Free/Pro/Elite paths render the header-bar identically (universal visual, no tier gating) per UI-SPEC §Interaction Contract #3 and D-24.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Scan-New header-bar to Results.tsx | `9718dbc` | src/pages/Results.tsx |
| 2 | Add Scan-New header-bar to CareerCompass + RecruitingLens | `fe8f979` | src/pages/CareerCompass.tsx, src/pages/RecruitingLens.tsx |
| 3 | D-07 browser verification — 3-page header-bar parity | pending operator approval | N/A |

**Plan metadata commit:** intentionally omitted — `.planning/` is gitignored per CLAUDE.md; STATE.md and ROADMAP.md updates are written to disk but NOT committed.

## Files Created/Modified

- `src/pages/Results.tsx` — added header-bar row with "Resume Screening Report" + "Analyze New Resume" button navigating to `/upload`; removed duplicate h1 title so grep returns exactly 1 match.
- `src/pages/CareerCompass.tsx` — added header-bar row with "Your Career Compass" + "Start New Analysis" button bound to existing `handleRefreshAnalysis`; added `RefreshCw` import.
- `src/pages/RecruitingLens.tsx` — retitled existing results header to "Your Recruiting Lens Match" + "Run New Match" with normalized `text-2xl font-semibold` heading; reuses existing `onAnalyzeAnother` prop callback.

## Decisions Made

- **Results.tsx** places the Scan-New row at the top of the container (above the Premium Report Header motion block). The pre-existing `<h1>Resume Screening Report</h1>` duplicated the new title, so it was removed to satisfy the acceptance grep (`count == 1`). The "Career Intelligence Report" eyebrow label and `{resume.file_name}` display remain intact; only the duplicate heading was pruned.
- **CareerCompass.tsx** places the header-bar as the first child of the analysis branch's `space-y-8` wrapper, positioned above the pre-existing `CachedResultsBanner`. The existing `handleRefreshAnalysis` already does the exact reset the plan describes (clear `analysis` + `isFromCache`) — no new handler was invented.
- **RecruitingLens.tsx** retitled the pre-existing header at the top of `RecruitingLensResultsView` rather than adding a new one. The existing `onAnalyzeAnother` prop already performs a complete reset (clear `result`, `jobDescription`, `linkedinText`, `showTryAgain`, and the `sessionStorage` cache). The bottom "Analyze Another Job" button at lines 1158-1163 is intentionally left unchanged as a secondary CTA (it already provided reset UX before this plan and is outside the "header-bar" scope).
- **Typography normalization** (RecruitingLens): pre-existing `font-bold` on the results heading was replaced with `font-semibold` because the plan's edit scope already covered that specific line; UI-SPEC §Typography requires new markup to use 600. This is an inline normalization of the specific line being replaced, not a sitewide rewrite.

## Deviations from Plan

None. Both code tasks executed exactly as specified:
- Task 1 grep acceptance: `Analyze New Resume` = 1 match, `RefreshCw` import + usage present, `Resume Screening Report` = 1 match, `flex items-center justify-between mb-6` = 2 matches (new row at line 709 + pre-existing at line 1005 for the Priority Improvements card header — latter is untouched, uses the same layout utility).
- Task 2 grep acceptance: `Start New Analysis` = 1, `Run New Match` = 1, `Your Career Compass` = 1, `Your Recruiting Lens Match` = 1, `flex items-center justify-between mb-6` present in both files.
- `npm run build` passed after each task (3.03s, 2.90s respectively).
- No new lint errors introduced on modified lines (all 20+ lint errors in the three files are pre-existing `@typescript-eslint/no-explicit-any` errors on unrelated lines — out of scope per Deviation Rules §Scope Boundary).

## Issues Encountered

- **Pre-existing lint errors**: Results.tsx, CareerCompass.tsx, and RecruitingLens.tsx each contain numerous pre-existing `@typescript-eslint/no-explicit-any` errors on lines that are NOT in the header-bar render paths. Per Deviation Rules §Scope Boundary, these are out of scope and were not modified. Build (vite) succeeds cleanly — the lint errors are style warnings in the ESLint flat config, not TypeScript compiler errors.
- **Two `flex items-center justify-between mb-6` matches in Results.tsx**: The new row (line 709) plus a pre-existing row at line 1005 (Priority Improvements Card header). This is expected — the acceptance criterion was "at least 1 match"; the pre-existing row is unrelated markup that happens to use the same layout classes.

## Next Phase Readiness

- **Browser-verification checkpoint (Task 3) is the blocking gate.** The operator must run `npm run dev`, walk through steps 1-7 of the plan's `<how-to-verify>` block across all 3 pages at 3 viewports in both themes, and then type "approved" before this plan can be marked complete.
- Plan 22-02 is isolated (it does NOT block Plan 22-01's 3 core defects or any downstream Phase 22 plans); it was intentionally scoped as a descoppable D-10 parity extension.
- On approval, Plan 22-03 (History page audit) is the natural next step per ROADMAP.md §Phase 22.

## Self-Check: PASSED

**File existence:**
- `src/pages/Results.tsx` — FOUND
- `src/pages/CareerCompass.tsx` — FOUND
- `src/pages/RecruitingLens.tsx` — FOUND

**Commits exist:**
- `9718dbc` — FOUND (verified via git log; Task 1)
- `fe8f979` — FOUND (verified via git log; Task 2)

**Acceptance-criteria grep checks:**
- `grep -n "Analyze New Resume" src/pages/Results.tsx` → 1 match (line 715)
- `grep -n "RefreshCw" src/pages/Results.tsx` → multiple matches (import line 13 + new usage line 714 + pre-existing usages at 575, 607)
- `grep -c "Resume Screening Report" src/pages/Results.tsx` → 1 (no duplicate)
- `grep -n "flex items-center justify-between mb-6" src/pages/Results.tsx` → 2 matches (new row + pre-existing Priority Improvements card)
- `grep -n "Start New Analysis" src/pages/CareerCompass.tsx` → 1 match (line 868)
- `grep -n "Your Career Compass" src/pages/CareerCompass.tsx` → 1 match (line 864)
- `grep -n "flex items-center justify-between mb-6" src/pages/CareerCompass.tsx` → 1 match (line 862)
- `grep -n "Run New Match" src/pages/RecruitingLens.tsx` → 1 match (line 702)
- `grep -n "Your Recruiting Lens Match" src/pages/RecruitingLens.tsx` → 1 match (line 698)
- `grep -n "flex items-center justify-between mb-6" src/pages/RecruitingLens.tsx` → 1 match (line 696)

**Handler verification (state setters exist):**
- CareerCompass `handleRefreshAnalysis` at line 534 uses `setAnalysis` and `setIsFromCache` — both declared (lines 60, 61)
- RecruitingLens `onAnalyzeAnother` (inline at line 487-493) uses `setResult`, `setJobDescription`, `setLinkedinText`, `setShowTryAgain` — all declared in the parent component

**Build:**
- `npm run build` — PASS (3.03s after Task 1, 2.90s after Task 2)

---

*Phase: 22-linkedin-grader-ui-overhaul-cross-feature-memory-history*
*Plan: 02*
*Tasks 1-2 completed: 2026-04-19 (commits 9718dbc, fe8f979)*
*Task 3 checkpoint status: awaiting operator browser verification (D-07)*

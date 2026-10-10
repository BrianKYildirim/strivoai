---
phase: 09-performance-maintainability-refactoring
plan: 02
subsystem: api
tags: [react, typescript, supabase, postgrest, dry, data-access]

# Dependency graph
requires:
  - phase: 03-cross-domain-inventory-audit
    provides: PERF-HOTSPOTS.md H5 latest-row-read duplication catalog
  - phase: 09-performance-maintainability-refactoring (09-RESEARCH/09-PATTERNS)
    provides: corrected H5 scope (identical-shape resume subset only; analysisHelpers.ts:134 is a LIST query, not a template) + the per-call-site column/terminal map
provides:
  - "src/lib/latestResume.ts — getLatestResume({ userId, columns, terminal, orderBy }) parameterized accessor over the identical resumes/created_at-desc/.limit(1) subset"
  - "Profile.tsx, SkillsGapAnalysis.tsx (×2), CareerCompass.tsx resume reads routed through the shared accessor with byte-identical columns + terminal"
affects: [09-04 PERF-04 measurement (resume read path), future H5 follow-ups for divergent/list sites]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Parameterized latest-row accessor (columns + terminal + orderBy) returning the analysisHelpers { data, error? } contract — NO hardcoded .select('*')"

key-files:
  created:
    - src/lib/latestResume.ts
  modified:
    - src/pages/Profile.tsx
    - src/pages/SkillsGapAnalysis.tsx
    - src/pages/CareerCompass.tsx

key-decisions:
  - "Scope LOCKED to the identical-shape subset (#2/#3/#4/#8): consolidate only the resumes/created_at-desc/.limit(1) reads; parameterize columns + terminal so each page receives EXACTLY its prior payload"
  - "Single accessor with a terminal param ('array' | 'single' | 'maybeSingle') rather than a naive .select('*') merge — the .select('*') merge would change a page's received bytes (rejected per Pitfall 2)"
  - "Divergent + list sites left byte-identical: RecruitingLens (analyzed_at + .not + .maybeSingle), the analysis_results sites, linkedin_grades sites, and every .limit(N>1) LIST query stay separate by design"

patterns-established:
  - "Pattern: getLatestResume centralizes the resumes-latest-row read; callers pass columns + terminal; the { data, error? } contract mirrors analysisHelpers.ts so downstream destructures are unchanged"

requirements-completed: [PERF-02, PERF-03]

# Metrics
duration: 15min
completed: 2026-06-25
---

# Phase 9 Plan 02: H5 latest-resume accessor (getLatestResume) Summary

**One parameterized `getLatestResume({ userId, columns, terminal, orderBy })` accessor DRYs the four genuinely-identical latest-`resumes`-row reads (Profile, SkillsGap ×2, CareerCompass) while every divergent/list query stays byte-identical — verify:baseline green after each swap.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-06-25T06:33:07Z
- **Completed:** 2026-06-25T06:48:19Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- Authored `src/lib/latestResume.ts`: `getLatestResume({ userId, columns, terminal = 'array', orderBy = 'created_at' })` building `from('resumes').select(columns).eq('user_id', userId).order(orderBy, desc).limit(1)` with the terminal appended (`.single()` / `.maybeSingle()` / none-for-array). Returns the same `{ data, error? }` try/catch contract as `analysisHelpers.ts:125-145` — NO hardcoded `.select('*')`.
- Migrated the two array-terminal sites: `Profile.tsx` (`columns: 'file_name'`, downstream `resumes[0].file_name` unchanged) and both `SkillsGapAnalysis.tsx` grading_data reads (`columns: 'grading_data'`, downstream `resumes[0].grading_data` unchanged).
- Migrated the `.single()` site: `CareerCompass.tsx:304` (`columns: 'file_path, file_name'`, `terminal: 'single'`, downstream `resumeResult.data.file_path` / `.file_name` unchanged). The `analysis_results` (`analysis_type='career_compass'`) `.maybeSingle()` read at the same `Promise.all` left untouched.
- Proved zero functional change: `npm run verify:baseline` green after EACH of the 4 call-site swaps (vitest 457, deno 704/0/11, Playwright 5 passed / 1 quarantine-skip).
- Proved the divergent/list sites are byte-identical (`git diff` EMPTY): RecruitingLens, LinkedInGrader, PriorLinkedInSelector, DashboardHome, AnalysisComparisonModal, analysisHelpers.ts.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author getLatestResume + migrate the two array-terminal sites (Profile, SkillsGapAnalysis ×2)** - `d5eb8866` (refactor)
2. **Task 2: Migrate the .single() site (CareerCompass resume read); divergent sites proven untouched** - `23e806de` (refactor)

**Plan metadata:** (this commit) (docs: complete plan)

## Files Created/Modified
- `src/lib/latestResume.ts` - NEW shared accessor `getLatestResume`; parameterizes columns + terminal ('array' | 'single' | 'maybeSingle') + orderBy; `{ data, error? }` contract; data is `[]`/`null`-typed by terminal on error.
- `src/pages/Profile.tsx` - latest-resume `file_name` read routed through `getLatestResume` (array terminal); `resumes[0].file_name` downstream read preserved.
- `src/pages/SkillsGapAnalysis.tsx` - both grading_data reads (:170, :288) routed through `getLatestResume` (array terminal); `resumes[0].grading_data` downstream preserved.
- `src/pages/CareerCompass.tsx` - resume `.single()` read routed through `getLatestResume` (single terminal); `analysis_results` read left untouched.

## Decisions Made
- **Single accessor, terminal parameterized over a per-table family of helpers.** The H5 research left granularity to the executor; one `getLatestResume` with a `terminal` param cleanly covers all four identical-shape sites without inventing extra abstractions (D-04 "single helper" bar). The `array | single | maybeSingle` switch preserves each site's exact terminal, so no page's 0-row behavior changes.
- **No `.select('*')` universal merge.** Each call passes its exact `columns`, so the migrated page receives byte-identical payload bytes (Pitfall 2 mitigation).
- **One call site changed at a time, `verify:baseline` after each** (4 swaps → 4 green baselines) to localize any regression to the swap that introduced it.

## Deviations from Plan

None - plan executed exactly as written.

## RESIDUAL — divergent + list sites deliberately left as-is (auditable deferral)

Per the locked H5 scope, the following are NOT folded into the resume-latest accessor (each would be a functional change). All verified byte-identical (`git diff` EMPTY):

- **`RecruitingLens.tsx:359-366`** — orders by `analyzed_at` (not `created_at`), adds `.not('grading_data','is',null)`, terminal `.maybeSingle()`. Divergent ordering + filter + terminal → separate.
- **`CareerCompass.tsx:313-320`** / **`RecruitingLens.tsx:378-385`** — `analysis_results` table + `.eq('analysis_type', …)`. Different table/filter → out of the resume accessor.
- **`LinkedInGrader.tsx:280-284`** — `linkedin_grades` table. Different table → out of scope (a separate `getLatestLinkedinGrade` if ever consolidated).
- **`PriorLinkedInSelector.tsx:90-95`** (`.limit(10)`), **`DashboardHome.tsx:45-51`** (`.limit(4)`), **`AnalysisComparisonModal.tsx:263-270`/`:280-286`** (`.limit(10)` + `.neq`/`.not`) — `.limit(N>1)` LIST queries, a different class from latest-row → leave as-is.
- **`analysisHelpers.ts:134`** — `getAnalysisHistory` is a `.limit(10)` LIST query (the shape analog for the `{ data, error? }` contract only, NOT a latest-row template). Untouched.

## Issues Encountered
- **Pre-existing `npm run type-check` failures (10× `error TS`)** in recharts/chart components (`EliteScoreHistory.tsx`, `ScoreProgressChart.tsx`, `ui/chart.tsx`). Confirmed pre-existing on the clean baseline (10 before == 10 after my changes; zero in any file I touched). `type-check` is NOT a member of `verify:baseline` (`test && test:edge && test:e2e`), so it does not gate this phase. Logged to `deferred-items.md`; out of scope per the scope-boundary rule (do NOT fix unrelated pre-existing failures).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The resume-read path is consolidated and behavior-proven; 09-04 (PERF-04 measurement) can measure the resume read path with no expected regression.
- Divergent/list-site consolidation is documented as a RESIDUAL deferral (above) — available as a future follow-up if a later phase decides per-table accessors are warranted.

## Self-Check: PASSED

- Files exist: `src/lib/latestResume.ts`, `src/pages/Profile.tsx`, `src/pages/SkillsGapAnalysis.tsx`, `src/pages/CareerCompass.tsx`, `09-02-SUMMARY.md`, `deferred-items.md` — all FOUND.
- Commits exist: `d5eb8866` (Task 1), `23e806de` (Task 2) — both FOUND.
- `getLatestResume` present in the accessor + all 3 pages (Profile 2, SkillsGap 3, CareerCompass 2 occurrences = import + call sites).

---
*Phase: 09-performance-maintainability-refactoring*
*Completed: 2026-06-25*

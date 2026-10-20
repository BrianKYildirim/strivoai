---
phase: 47-interview-prep-prod-gate-elite-differentiation
plan: 05
subsystem: frontend
tags: [feature-flag, history, render-filter, audit, d-05]

requires:
  - "isInterviewPrepEnabled() helper from 47-00 (src/config/feature-flags.ts)"
provides:
  - "AnalysisHistory render-side filter dropping action_type === 'interview_prep' when flag off"
  - "interview_quizzes candidate-table query gated on the same flag (avoids unused network round-trips on prod)"
  - "Documented audit finding that LowBalanceWarning has no Interview Prep leak — no code change required"
affects:
  - 47-PHASE-VERIFICATION (history-surface gate is the last Wave-2 IP-row read path)

tech-stack:
  added: []
  patterns:
    - "Read-side feature-flag filter: SQL query unchanged across flag states; useMemo drops gated rows before render"
    - "Audit-only task pattern: grep-verify a sibling surface, document finding, do NOT modify"

key-files:
  created:
    - src/pages/__tests__/AnalysisHistory.interviewPrep.test.tsx
  modified:
    - src/pages/AnalysisHistory.tsx

key-decisions:
  - "Filter is applied via useMemo on the rendered list (visibleUsageRows), NOT via .eq() on the Supabase query — keeps SQL observability identical across both flag states (D-05)"
  - "interview_quizzes candidate-table query is enabled-gated on the same flag — minor optimization, not a security gate (RLS already scopes per-user)"
  - "typeConfig.interview_prep, toolRoutes.interview_prep, and getEntryRoute's 'interview_prep' switch case are PRESERVED so the flag-on path resolves deep links normally"
  - "Empty-state branch keyed on visibleUsageRows.length (not usageRows.length) so a user whose only history is gated IP rows sees the 'No activity yet' card — not a confusing 'page header but no rows' state"
  - "LowBalanceWarning.tsx is NOT modified — audit confirmed clean (single match is JSDoc comment on line 13 explaining the null-filter rationale)"

patterns-established:
  - "Feature-flag filter at render seam (visibleUsageRows = useMemo(...))"
  - "Documented audit finding in SUMMARY rather than silent code change for sibling surfaces"

requirements-completed:
  - IPC-PROD-HISTORY-FILTER
  - IPC-PROD-LOWBALANCE-AUDIT

duration: ~7min
completed: 2026-05-11
---

# Phase 47 Plan 05: AnalysisHistory IPC Row Filter + LowBalanceWarning Audit Summary

**Read-side filter on `src/pages/AnalysisHistory.tsx` drops `action_type === 'interview_prep'` rows when the production gate is off; LowBalanceWarning.tsx audited clean (no code change). D-05 enforced: zero DB mutation.**

## Performance

- **Duration:** ~7 min
- **Tasks:** 3 (2 implementation + 1 audit)
- **Files created:** 1
- **Files modified:** 1
- **Files audited (no change):** 1

## Accomplishments

- `src/pages/AnalysisHistory.tsx` now hides Interview Prep rows from the activity list when `VITE_FEATURE_INTERVIEW_PREP !== 'true'`, while leaving DB rows untouched (D-05).
- The interview_quizzes candidate-table `useQuery` is `enabled`-gated on the same flag so production builds don't fire a useless network call (RLS keeps it safe even without the gate; this is observability/perf hygiene, not security).
- The SQL on the `usage_tracking` query is byte-identical across both flag states — re-enabling Interview Prep is a single Vercel env-var flip, not a query change.
- `typeConfig.interview_prep`, `toolRoutes.interview_prep`, and the `getEntryRoute` `interview_prep` switch case are preserved so the flag-on path resolves deep links (`/interview-prep?id=...`) normally on staging/preview.
- Empty-state copy ("No activity yet") now correctly triggers when a user's only history rows are gated IP rows.
- `src/components/LowBalanceWarning.tsx` audited — no leak — no edit required.

## Task Commits

1. **Task 2 (RED): Failing test for AnalysisHistory IP-row filter** — `5b350e4` (test)
2. **Task 1 (GREEN): Implement IP-row filter via `visibleUsageRows` useMemo and gate the interview_quizzes query** — `28114dd` (feat)
3. **Task 3: LowBalanceWarning audit** — no commit (audit-only task; finding documented in this SUMMARY)

## Files Created/Modified

### Created

- `src/pages/__tests__/AnalysisHistory.interviewPrep.test.tsx` — Vitest spec asserting both flag branches:
  - Flag OFF (`VITE_FEATURE_INTERVIEW_PREP='false'`): asserts "Resume Analysis" + "Career Compass" rows render; asserts no `/interview prep/i` text appears anywhere in the document.
  - Flag ON (`VITE_FEATURE_INTERVIEW_PREP='true'`): asserts all three fixture rows render including Interview Prep.
  - Supabase client mocked with a chainable builder that returns table-keyed fixtures so every page-internal useQuery resolves.
  - `react-router-dom` mocked locally to no-op `useNavigate` so the unauth redirect never fires when fixtures resolve.
  - `vi.resetModules()` in `beforeEach` so each test re-imports the page after `vi.stubEnv` so the helper reads the stubbed env.

### Modified

- `src/pages/AnalysisHistory.tsx` — five focused changes:
  1. Add `useMemo` to the React import.
  2. Import `isInterviewPrepEnabled` from `@/config/feature-flags`.
  3. Read `const interviewPrepEnabled = isInterviewPrepEnabled();` once at the top of the component.
  4. Append `&& interviewPrepEnabled` to the `interview_quizzes` useQuery `enabled` field.
  5. Derive `visibleUsageRows` via `useMemo` before `groupByDate`; key the empty-state branch on `visibleUsageRows.length`.

### Audited — No Change

- `src/components/LowBalanceWarning.tsx` — see "LowBalanceWarning Audit" section below. `git diff --stat src/components/LowBalanceWarning.tsx` shows zero modified lines.

## LowBalanceWarning Audit (Task 3)

**Finding: Clean. No code change.**

`grep -in "interview|interviewPrep|ipc" src/components/LowBalanceWarning.tsx` returned a single match:

```
13: * linkedinGrader } only — never from the recruiting/interview-prep null rows).
```

This match is inside the file's leading JSDoc block (lines 1-17) and documents WHY the existing null-filter on lines 25-30 correctly excludes Interview Prep from the Free-tier applicable set. It is not a user-visible string.

The `export function LowBalanceWarning` body (lines 32-82) contains zero references to Interview Prep / IPC / interviewPrep in any JSX, banner copy, or dynamic string. Both rendered banners read either:

- "Out of Merits" + Buy Merits / Upgrade Plan links (no feature names), or
- "Running low — N Merits left" + Buy Merits / Upgrade links (no feature names).

The null-filter on lines 25-30 already drops Interview Prep from the Free-tier applicable set because `MERIT_COST_PER_FEATURE.interviewPrepCoach.free === null`. On Pro/Elite tiers the IP cost (8 and 5 respectively) IS included in the applicable set, which slightly raises the `2 * cheapestApplicableCost` threshold — but the threshold value is only used as a numeric comparison; no string mentioning Interview Prep is rendered.

**Conclusion:** The banner cannot leak the "Interview Prep" name on production regardless of tier or merit balance. The audit is satisfied by inspection; no patch needed. If a future copy change introduces a literal feature-name in the banner, the leak risk would re-appear — that's a Phase 47 follow-up concern, not a Plan 05 deliverable.

## Verification Results

| Check                                                                       | Result        |
| --------------------------------------------------------------------------- | ------------- |
| `npx vitest run src/pages/__tests__/AnalysisHistory.interviewPrep.test.tsx` | **2/2 passing** (flag-off + flag-on) |
| `npx eslint src/pages/AnalysisHistory.tsx`                                  | Pass (clean)  |
| `npx eslint src/pages/__tests__/AnalysisHistory.interviewPrep.test.tsx`     | Pass (clean)  |
| `npx tsc --noEmit -p tsconfig.app.json` filtered to plan files              | Zero new errors (pre-existing Plan 00 test typing error in `feature-flags.test.ts:81` is out-of-scope) |
| Adversarial grep: `interview\|interviewPrep\|ipc` in LowBalanceWarning JSX  | **0 matches** in `export function` body — audit clean |
| `git diff --stat src/components/LowBalanceWarning.tsx`                      | Zero lines changed |
| Full repo `vitest run` regression check (Phase 47 IP-gate tests)            | All passing: AnalysisHistory.interviewPrep (2), feature-flags (10), Navbar.interviewPrep (2), AppSidebar.interviewPrep (2), ExploreFeatures.interviewPrep (2), PricingTable.interviewPrep (2), TierCardV2.interviewPrep (7), App.routes.interviewPrep (3), LowBalanceWarning (6) |

## Decisions Made

- **Filter at render seam, not query seam (D-05):** The Supabase `.select('*').eq('user_id', userId!).order(...).limit(50)` is unchanged regardless of flag value. Observability stays identical; re-enabling is a flag flip, not a query rewrite; and the existing 50-row LIMIT covers both flag states without surprise pagination shifts when the flag toggles.
- **`useMemo` for the filter:** A plain `.filter()` would re-allocate the array each render. `useMemo([usageRows, interviewPrepEnabled])` keeps the rendered list stable across non-data renders (theme toggles, route remounts). The flag value is build-time-inlined by Vite so the dep array effectively reduces to `[usageRows]` in practice.
- **`enabled: !!userId && interviewPrepEnabled` for `interview_quizzes`:** Skipping the query on production saves one round-trip per `/history` view. The deep-link resolution path that consumes `interviewQuizzes` is itself only reachable for rows that already pass the `interview_prep` filter, so the query is genuinely unused when the flag is off.
- **Empty-state derived from `visibleUsageRows.length`:** A user whose entire history is IP rows would otherwise see the page header but a blank rendered list. Switching the empty-state predicate to `visibleUsageRows.length === 0` shows the friendly "No activity yet" card instead.
- **Test isolation via `vi.resetModules()` + dynamic `await import('@/pages/AnalysisHistory')`:** Required because the page imports `isInterviewPrepEnabled`, which reads `import.meta.env.VITE_FEATURE_INTERVIEW_PREP` at call time. Without re-importing after `vi.stubEnv`, the second test could see the first test's flag value.

## Deviations from Plan

None. Plan was executed exactly as written. No Rule-1/Rule-2/Rule-3 auto-fixes triggered. The pre-existing `tsc` error in `src/config/__tests__/feature-flags.test.ts:81` is out-of-scope per SCOPE BOUNDARY (it is a Plan 47-00 artifact unrelated to Plan 05 deliverables).

## Issues Encountered

None.

## Known Stubs

None. The filter is fully wired and exercised by both flag branches in the test file.

## User Setup Required

None for this plan. Phase-level Vercel env-var setup (out of scope for Plan 05; addressed in Plan 47-06) is what makes the flag actually toggle in production builds.

## Self-Check: PASSED

- `src/pages/AnalysisHistory.tsx` — present, modified, lint-clean
- `src/pages/__tests__/AnalysisHistory.interviewPrep.test.tsx` — present, 2/2 passing
- `src/components/LowBalanceWarning.tsx` — present, **unmodified** (audit-only)
- Commit `5b350e4` (RED test) — FOUND in `git log`
- Commit `28114dd` (GREEN implementation) — FOUND in `git log`
- `.planning/phases/47-interview-prep-prod-gate-elite-differentiation/47-05-SUMMARY.md` — FOUND (this file)

---
*Phase: 47-interview-prep-prod-gate-elite-differentiation*
*Plan: 05*
*Completed: 2026-05-11*

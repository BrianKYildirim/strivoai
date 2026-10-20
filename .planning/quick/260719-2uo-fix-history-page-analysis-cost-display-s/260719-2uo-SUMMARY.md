---
phase: quick-260719-2uo
plan: 01
subsystem: frontend-history
tags: [merits, pricing, ui-label]
requires: []
provides:
  - "Canonical Merit cost badge on Analysis History entries"
affects: []
tech-stack:
  added: []
  patterns:
    - "Display-layer mapping from action_type to MERIT_COST_PER_FEATURE (elite column canonical)"
key-files:
  created: []
  modified:
    - src/pages/AnalysisHistory.tsx
key-decisions:
  - "History badge cost is mapped from pricing-config (elite column), not stored legacy credits_consumed, for the four fixed-cost features; other/unknown action types fall back to stored value with Merit wording"
metrics:
  duration: 4min
  completed: 2026-07-19
---

# Quick Task 260719-2uo: Fix History Page Analysis Cost Display Summary

**One-liner:** Analysis History badges now render canonical Merit costs (3/3/3/8) from `MERIT_COST_PER_FEATURE` with "Merit(s)" labels, replacing stale legacy `credits_consumed` values labeled "credit(s)".

## What Was Done

### Task 1: Map action_type to canonical Merit cost and relabel badge (33877cd7)

- Imported `MERIT_COST_PER_FEATURE` from `@/config/pricing-config` in `src/pages/AnalysisHistory.tsx`.
- Added module-level `CANONICAL_MERIT_COST` map (after `toolRoutes`, before the usage-row types) keyed by `action_type`, sourcing the `elite` column (safe canonical cell — the four fixed costs are identical across active tiers; `recruitingLens` is `null` on free):
  - `resume_analysis` → 3, `career_compass` → 3, `linkedin_grading` → 3, `recruiting_lens` → 8.
- Replaced the `creditLabel` computation with `meritCost = CANONICAL_MERIT_COST[entry.action_type] ?? entry.credits_consumed` and `meritLabel` using "1 Merit" / "N Merits" wording; `??` covers `job_matching`, `interview_prep` (tier-dependent, stored value = actual charge), unknown/legacy types, and any `null` canonical cell.
- Badge renders `{meritLabel}`.

## Verification

- `npm run lint`: 0 errors (149 pre-existing warnings, unchanged class).
- `npm run type-check`: clean.
- Targeted vitest: `AnalysisHistory.phase22.test.ts` + `__tests__/AnalysisHistory.interviewPrep.test.tsx` — 2 files / 14 tests passed unchanged (no label assertions needed updating).
- Full frontend unit suite: `npm run test` — 101 files / 666 tests passed.
- `rg -i credit src/pages/AnalysisHistory.tsx` → only the `credits_consumed` DB column name and its explanatory comment remain; zero user-facing "credit" label strings.

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Commit | Description |
| ------ | ----------- |
| 33877cd7 | fix(quick-260719-2uo): show canonical Merit costs on Analysis History badges |

## Self-Check: PASSED

- SUMMARY.md exists at expected path.
- Commit 33877cd7 present on `staging`.
- Working tree clean apart from the uncommitted SUMMARY (docs commit is the orchestrator's).

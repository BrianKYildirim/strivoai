# Phase 04 — Deferred Items

Out-of-scope discoveries logged during execution (NOT fixed — pre-existing, unrelated to the current task's changes per the executor SCOPE BOUNDARY).

| ID | Discovered in | Item | Status |
|----|---------------|------|--------|
| P04-TSC-RECHARTS | 04-01 Task 3 | `tsc -p tsconfig.app.json` reports 10 pre-existing type errors in recharts-consuming components (`src/components/ui/chart.tsx`, `src/components/EliteScoreHistory.tsx`, `src/components/ScoreProgressChart.tsx`) — recharts 3.x `Formatter`/`payload`/`label` type churn. Identical count (10) with and without the 04-01 changes; zero in `RecruitingLens.tsx`/`useAnalysisRun.ts`. `npm run lint` is clean (0 errors). | open — pre-existing, out of scope |

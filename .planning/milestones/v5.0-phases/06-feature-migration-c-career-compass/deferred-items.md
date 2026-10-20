# Phase 06 — Deferred / Out-of-Scope Discoveries

Logged per the executor SCOPE BOUNDARY (do NOT auto-fix pre-existing issues in unrelated files).

## 06-03

- **Pre-existing `npm run type-check` failures (10, recharts 3.x typings)** — `src/components/EliteScoreHistory.tsx`, `src/components/ScoreProgressChart.tsx`, `src/components/ui/chart.tsx`. These are recharts `Formatter`/`payload` type incompatibilities present on the clean tree BEFORE this plan (verified: `git stash` → 10 errors; with 06-03 changes → 10 errors, zero new). Unrelated to Career Compass. The authoritative gate is `verify:baseline` (vitest + `test:edge` + Playwright), which runs `tsc`-free suites — type-check is not on the blocking gate. Not fixed here (out of scope; would touch charting components + recharts version pinning).

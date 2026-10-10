# Phase 05 — Deferred Items (out-of-scope discoveries)

Logged per GSD deviation SCOPE BOUNDARY: discovered but NOT fixed (not caused by
this plan's task changes).

| ID | Discovered | Item | Why deferred |
|----|-----------|------|--------------|
| P05-RECHARTS-TSC | 05-02 (Task 2 type-check) | `npm run type-check` reports 10 pre-existing `error TS` in recharts chart components (`src/components/EliteScoreHistory.tsx`, `src/components/ScoreProgressChart.tsx`, `src/components/ui/chart.tsx`) — recharts 3.8.1 `Formatter`/`payload` type incompatibilities. | Pre-existing on committed HEAD (identical 10-error count with this plan's two files stashed); unrelated to Upload.tsx / useResumeStream.ts (both clean). NOT part of the `verify:baseline` gate (which runs vitest + deno + Playwright, not `type-check`). Out of scope for FEAT-02. |

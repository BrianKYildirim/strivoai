# Phase 09 — Deferred Items (out-of-scope discoveries)

Logged per the GSD scope-boundary rule (only auto-fix issues DIRECTLY caused by the
current task's changes; pre-existing failures in unrelated files are out of scope).

## 09-02 (H5 latest-resume accessor)

- **Pre-existing `npm run type-check` failures (10× `error TS`)** in recharts/chart
  components — NOT touched by this plan, NOT in `verify:baseline`:
  - `src/components/EliteScoreHistory.tsx:171` — recharts `Formatter` type mismatch
  - `src/components/ScoreProgressChart.tsx:87` — recharts `Formatter` type mismatch
  - `src/components/ui/chart.tsx:106/111/163/233/240/249` — recharts v3 `payload`/`label`
    / implicit-any / `verticalAlign|payload` constraint errors
  - **Status:** pre-existing on the clean baseline (10 before, 10 after my changes —
    identical count). Out of scope for the H5 read-consolidation. `type-check` is not a
    member of `verify:baseline` (`test && test:edge && test:e2e`), so these do not gate
    this phase. Left for a dedicated recharts-v3 type-migration task.

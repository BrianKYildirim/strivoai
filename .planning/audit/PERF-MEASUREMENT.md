# PERF-04 — Business-Critical Flow Latency Measurement

**Phase:** 09 — Performance & Maintainability Refactoring · **Plan:** 09-04
**Date:** 2026-06-25 · **Env:** staging (`cimjltzovkahkqecpwgi`) — staging-only (prod is read-only + near-empty + off-limits, Pitfall 4)
**Operator decision (09-04 gate):** **deterministic / cache-hit measurement only** — the near-zero-cost signal that isolates the Phase-9 deterministic-path changes from AI-call variance (09-CONTEXT D-02). The end-to-end AI-call path (~35–56s, noisy, real Anthropic cost) was deliberately NOT run.

## What Phase 9 changed (and where the signal lives)

The Phase-9 refactors all sit on **deterministic, non-AI** paths:
- **09-01 / H4** — removed a redundant JSON parse in `analyze-resume`'s parallel-merge path. Runs ONLY on a cache-MISS (when the parallel calls + merge execute), where its delta is far below the AI-dominated end-to-end latency.
- **09-02 / H5** — `getLatestResume` accessor consolidation. Frontend Supabase query; does not affect edge latency.
- **09-03 / DB perf** — `auth.uid()` → `(select auth.uid())` RLS wrap + FK covering indexes + permissive dedup. Per-row policy eval / FK lookups; negligible on near-empty staging; zero-observable by construction.

None of these touch the **cache-serving** path, so the clean deterministic signal is expected to be **flat = no regression**.

## Deterministic / cache-hit measurement

### Resume (and the shared cache-serving path) — `analysis_cache` lookup

`scripts/staging-cache-perf-probe.mjs --env staging --runs 100 --warmup` (2026-06-25, staging):

| metric | ms |
|--------|-----|
| n | 100 |
| min | 53.19 |
| mean | 62.03 |
| p50 | 59.30 |
| p95 | **76.78** |
| p99 | 85.25 |
| max | 124.53 |
| stddev | 9.02 |

**Verdict: PASS** (p95 76.78 ms < 100 ms). The cache-serving path is healthy and unchanged by Phase 9.

### Career Compass — covered by the shared `analysis_cache` lookup

`analyze-career`'s cache precheck reads the **same `analysis_cache` table** via `readCareerAnalysisCache` (`analyze-career/index.ts:236/247/283`, invoked at `:1286`) that the resume probe measured above. The career cache-serving latency is therefore **represented by the shared lookup (p95 76.78 ms)** — there is one cache table and one lookup mechanism for both flows.

A standalone **live** career deterministic run was NOT taken: `analyze-career` is **file-based** — its validation gate (`index.ts:931–942`) requires a `resumeFilePath` in the `resumes` storage bucket (downloaded at `:1095`) + LinkedIn content, unlike `analyze-resume`'s text input. A real run needs a staging-seeded resume file (storage seeding), which is outside the deterministic/cheap-path scope chosen at the 09-04 gate. `scripts/validate-career-performance.mjs` was corrected to the file-based contract (now sends `resumeFilePath`; requires `--resume-path <staging path>` with a clear guard) so the artifact is valid for a future seeded run. **Deferred (optional):** a seeded live career deterministic capture.

## No-regression verdict — PASS

1. **Deterministic / cache-serving path:** shared `analysis_cache` lookup p95 = 76.78 ms (< 100 ms), unchanged — no regression on the path Phase 9 left untouched.
2. **Functional:** `npm run verify:baseline` GREEN after all Wave-1 refactors (deno **704/0/11**, vitest **457**, Playwright **5 passed / 1 quarantine-skip**) — including the **resume-analysis E2E running against the live, Phase-9-modified preview RLS**, which exercises owner-scoped reads through the wrapped policies end-to-end.
3. **Empirical RLS (09-03):** SELECT-as-role on `resumes` (preview): owner saw their own rows, non-owner saw 0 — owner-scoping identical post-wrap.

## Substantiating claimed improvement

- **H4 (redundant-parse removal):** real but small — it eliminates a second `JSON.parse` per successful call on the cache-MISS merge path. Against the AI-dominated (~35–56 s, high-variance) end-to-end latency this is **below measurement resolution** → recorded as **"no regression; no separately-claimable end-to-end gain (within noise band)."** Correctness/maintainability win (single parse, no duplicated work), not a headline latency number.
- **H5 / RLS:** zero-observable by construction (identical data returned / identical row visibility; only eval plan / call-site DRYness changes).

## Methodology notes

- Deterministic/cache-hit is the clean signal (AI-call variance isolated out) per 09-CONTEXT D-02; median (p50) + p95 reported; warmup discarded.
- Staging only (prod off-limits, Pitfall 4). Names-not-values; no secret values recorded.
- The resume cache probe (`staging-cache-perf-probe.mjs`) appends its own evidence row to its hardcoded `.planning/phases/29-foundation-infrastructure/29-VERIFICATION.md` output (Phase-29 NFR-02 artifact); the numbers above are transcribed here for the PERF-04 record.

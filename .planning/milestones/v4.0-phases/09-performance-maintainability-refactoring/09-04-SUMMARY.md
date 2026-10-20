# 09-04 SUMMARY — PERF-04 latency measurement

**Plan:** 09-04 · **Wave:** 2 · **autonomous:** false (operator-gated measurement) · **Status:** COMPLETE
**Date:** 2026-06-25 · **Operator gate decision:** deterministic / cache-hit measurement only

## What shipped

- **`scripts/validate-career-performance.mjs`** (new) — Career Compass (`analyze-career`) latency probe reading PLAIN JSON (not SSE), reusing `validate-performance.mjs`'s env/auth/CLI + `staging-cache-perf-probe.mjs`'s percentile/stats; staging-only; end-to-end + `--deterministic` modes. **Corrected post-first-run** to `analyze-career`'s real **file-based** contract: now sends `resumeFilePath` + `linkedinPdfContent` and requires `--resume-path <staging path>` with a clear guard (the first version sent raw `resumeTextContent`, which `analyze-career`'s validation gate rejects with HTTP 400 "Resume file is required" — a genuine contract asymmetry vs `analyze-resume`).
- **`.planning/audit/PERF-MEASUREMENT.md`** (new) — the PERF-04 record: deterministic numbers + no-regression verdict.
- **`.planning/audit/INDEX.md`** — catalog row for PERF-MEASUREMENT.md; PERF-HOTSPOTS marked consumed.

## Measurement (deterministic / cache-hit — the clean signal)

- **Shared `analysis_cache` lookup** (`staging-cache-perf-probe.mjs --runs 100 --warmup`, staging): p50 **59.30 ms** / p95 **76.78 ms** / p99 85.25 ms / max 124.53 ms. **PASS** (< 100 ms).
- This lookup is the cache-serving path for **both** flows — `analyze-career` reads the same `analysis_cache` table (`readCareerAnalysisCache` `index.ts:236/247/283`), so the career cache-serving latency is represented by it.
- A standalone live career deterministic run was **deferred (optional)**: `analyze-career` is file-based (needs a staging-seeded `resumeFilePath` + LinkedIn), outside the cheap deterministic scope chosen at the gate. The probe is now contract-correct for a future seeded run.

## No-regression verdict — PASS

1. Cache-serving path (shared `analysis_cache`) p95 76.78 ms, unchanged — Phase 9 didn't touch it.
2. `verify:baseline` GREEN (deno 704/0/11, vitest 457, Playwright 5 passed / 1 quarantine-skip) — incl. the resume-analysis E2E against the live Phase-9-modified preview RLS (functional no-regression end-to-end).
3. 09-03 SELECT-as-role on `resumes`: owner-scoping identical post-wrap.

**Claimed improvement:** H4 removes a redundant `JSON.parse` on the cache-MISS merge path — below the AI-dominated (~35–56 s, noisy) end-to-end resolution → recorded as "no regression; no separately-claimable end-to-end gain (within noise band)." A correctness/clarity win, not a headline latency number. H5/RLS are zero-observable by construction.

## Deviations

- **Probe contract fix** (post-first-run): the authored probe sent `resumeTextContent`; corrected to the file-based `resumeFilePath` contract + `--resume-path` guard after the operator's run returned HTTP 400. Documented.
- **Deterministic-only** (operator's gate choice): the cost-incurring end-to-end AI run was deliberately not taken (AI-noise-swamped; the deterministic/cache-hit path is the clean signal per 09-CONTEXT D-02).
- **Career live run deferred**: needs staging storage seeding; the career cache-serving latency is covered by the shared `analysis_cache` measurement.

## Key files

- `scripts/validate-career-performance.mjs` (new, contract-corrected)
- `.planning/audit/PERF-MEASUREMENT.md` (new), `.planning/audit/INDEX.md` (row)

## Verification

- Probe: `node --check` OK; `--help` exit 0; secret-VALUE grep 0; ASCII clean; `git diff -- scripts/validate-performance.mjs` EMPTY (resume harness reused unedited).
- PERF-04 satisfied: deterministic latency measured (p95 76.78 ms), no regression confirmed (cache path + verify:baseline), improvement substantiated honestly.

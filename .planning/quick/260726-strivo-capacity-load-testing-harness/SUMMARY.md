---
task: Build (not execute) a controlled Strivo capacity & load-testing system
slug: 260726-strivo-capacity-load-testing-harness
status: complete
date: 2026-07-26
branch: staging
scope: Part 1 (build + commit) only — no traffic sent this session (operator decision)
commits:
  - 8d10ca63 feat(load-testing): controlled, safety-gated capacity harness (k6 + Supabase side-channel)
---

# What was built

A self-contained `load-testing/` system (35 files, ~2.5k LOC) that can gradually raise
traffic against a NON-PRODUCTION Strivo target, find the first bottleneck, and document
measured capacity — with hard safety gates. **No load was executed** (operator chose
build-only; a confirmed target + per-stage human gating are required to run it).

## Operator decisions (locked 2026-07-26)
1. Target for real traffic: **build harness only, no traffic this session**.
2. Execution scope: **build + commit the system only**.
3. Real-provider spend cap: **$5** (documented + enforced in code; not spent).

## Built faithfully against the REAL endpoints (mapped, not assumed)
Two Explore agents mapped the exact contracts first:
- Resume lifecycle: `analyze-resume` (SSE), `submit-resume-analysis-job` (202 `{jobId}`),
  `process-resume-analysis-job` (internal), `get-analysis-job-status` (GET `?jobId=`),
  `get-analysis-run-status`, `grade-linkedin`, `ocr-pdf`, `validate-document`
  (raw-bytes + `x-document-type`/`x-file-name`), `extract-analysis-structure`. Auth =
  GoTrue password grant → Bearer + apikey. Mock = `AI_TEST_MODE=true`; fault injectors
  `AI_FORCE_FAILURE` / `MERIT_TEST_FORCE_REFUNDABLE_ERROR`.
- Merit/lifecycle: table is `analysis_jobs` (11-state machine), dedup via
  `idempotency_key` (active-job partial-unique + merit `feature-deduct` partial-unique),
  reaper budgets, realtime on `analysis_jobs`. Exact invariant SQL captured in
  `tools/measure-supabase.mjs`.

## Deliverables
- **config/**: `safety-limits.js` (hard caps + $5 real cap + executing-rung gate),
  `environments.js` (production ref `zjpjapgraoxdukdvpjes` hard-blocklisted),
  `thresholds.js` (auto-abort on p95/p99/error-rate + invariant counters).
- **lib/**: GoTrue auth, per-VU session cache, custom k6 metrics for every Part-2
  measurement, preflight guard (CONFIRM_TARGET must equal resolved ref), scenario builder.
- **profiles/**: ramp / spike / soak / recovery / rps stage builders + the named ladder.
- **scenarios/ (12)**: the 11 workloads (website, auth, upload, extraction, run-creation,
  merit+idempotency/duplicate-submission, db r/w, realtime, polling, concurrent-AI, mixed
  journey) + a provider fault-injection recovery test.
- **fixtures/**: `generate-fixtures.mjs` (synthetic `*.invalid` users emails-only +
  synthetic PDF/text; `--provision` creates users with an env-supplied shared password —
  never written to disk). Generated pool (200) + PDF + text committed.
- **mocks/**: `AI_TEST_MODE` mocking + fault-injection strategy (no standalone mock server
  needed — the built-in path is strictly better here).
- **tools/**: `preflight.mjs`, `run-stage.mjs` (ONE gated rung + parallel side-channel, no
  auto-escalation), `measure-supabase.mjs` (queue depth / stuck runs / duplicate jobs /
  duplicate charges / merit inconsistencies; production-blocked), `cleanup.mjs`,
  `sql/load_test_scratch.sql` (isolated RLS-scoped write target so DB-write load touches
  zero product data).
- **results/**: `LADDER.md` (dimensions + rungs + 11 stop-criteria), `RESULTS-TEMPLATE.md`
  (every measured metric per rung), `FINAL-REPORT.md` (Part-4 skeleton, execution unfilled).
- `.env.load.example` (names-only), `README.md` (safety model + exact commands).

## Safety guarantees baked in
- Production is unreachable for traffic: prod ref blocklisted in `environments.js`,
  `measure-supabase.mjs`, `generate-fixtures.mjs`, `cleanup.mjs`.
- Confirm-before-traffic gate; hard per-dimension caps with loud clamping; executing rungs
  500/1000 need `REAL_AI_HIGH_CONCURRENCY=confirmed`; auto-abort thresholds; $5 real-spend
  cap enforced in `assertRealSpendUnderCap`.
- No secrets committed (passwords via env at runtime; pool is emails-only). Scanned clean.
- Seven concurrency dimensions modeled SEPARATELY (browsing ≠ executing analyses).

## Verification
- `node --check` on all pure-node files: pass.
- `npx eslint load-testing/`: 0 errors, 0 warnings (removed unused eslint-disable dirs).
- Secret scan (JWT/`sk_`/long-hex/hardcoded-password patterns): clean.
- Fixture generator run: produced 200-user pool + 2274-byte synthetic PDF + text.
- Build unaffected (harness is outside `src/`; not imported by the app bundle).

## Not done (deliberate — deferred by operator)
- Parts 2–4 EXECUTION: no baseline, no ladder, no spike/recovery — requires a confirmed
  non-prod target and per-stage human gating. `FINAL-REPORT.md` marks execution NOT RUN.
- Preview caveats that will shape any future run: AI is fixture-mode (no real latency/cost),
  `MERIT_SYSTEM_ENABLED=false` (merit charge/idempotency inert → workload #6 needs a
  throwaway merit-ON project), Vercel Git link disconnected (website traffic = API surface,
  not a Vercel SPA).

## Commit policy
Per project rule "do not commit anything in `.planning/`", only `load-testing/` is
committed. These GSD tracking artifacts (PLAN/SUMMARY) and the STATE.md row are written
locally and left unstaged, matching the prior quick-task convention.

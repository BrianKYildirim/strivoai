---
task: Build (not execute) a controlled Strivo capacity & load-testing system
slug: 260726-strivo-capacity-load-testing-harness
status: in-progress
date: 2026-07-26
branch: staging
mode: quick (build-only, no traffic this session)
---

# Task

Build a reusable, safety-gated load-testing system for Strivo that can gradually
increase traffic, observe where performance degrades, identify the first bottleneck,
and document verified capacity — WITHOUT redesigning architecture.

## Operator decisions (locked 2026-07-26)

1. **Target for actual traffic:** _Build harness only — no traffic this session._
2. **Execution scope this session:** _Build + commit the system only._ Zero requests sent.
3. **Real-provider spend cap:** _$5 hard cap_ — documented in the harness for a future,
   human-gated verification run; not spent this session.

## Hard constraints (from the request + project memory)

- NEVER load-test production. Production ref `zjpjapgraoxdukdvpjes` is blocklisted for
  any traffic-generating script; prod is inspect-only (read-only MCP).
- Confirm target before sending traffic (interactive gate, refuses to run otherwise).
- Hard caps so a stage cannot exceed planned load (max VUs, max RPS, max duration, max
  $ per run). Abort thresholds on error-rate / p95 / p99.
- No real student data — synthetic accounts, documents, fixtures only.
- No secrets in scripts, logs, or committed files — env templates use names, never values.
- Mocked AI-provider responses for high-volume tests (Preview `AI_TEST_MODE` fixtures +
  an optional local mock); only small `$5`-capped real-provider tests where necessary.
- Do not treat N browsing sessions as N AI analyses — the harness models the seven
  distinct concurrency dimensions separately.

## Project-memory facts that shape the design

- Preview never calls Anthropic (`AI_TEST_MODE` fixtures) → perfect for high-volume mocked
  load; cannot measure real-provider latency/cost on Preview.
- Preview `MERIT_SYSTEM_ENABLED=false` → merit charge/refund/idempotency is NOT exercised
  on Preview. Workload #6 must be run against a merit-ON, production-equivalent throwaway
  project (documented; not provisioned this session).
- Vercel Git link disconnected → Preview frontend is not auto-deployed; "website traffic"
  measures the Supabase edge/API surface, not a Vercel-hosted SPA, unless a preview build
  is served by hand.
- Analysis lifecycle / realtime tables exist (migrations 20260702000001/2/3); reaper
  handles stuck runs.

# Deliverables (Part 1)

A self-contained `load-testing/` tree, committed:

- `README.md` — safety model, dimension glossary, the ladder, exact commands.
- `config/` — `safety-limits.js` (hard caps), `environments.js` (target resolution +
  production blocklist), `thresholds.js` (abort thresholds).
- `lib/` — `auth.js` (synthetic JWT via GoTrue), `metrics.js` (custom k6 trends/counters),
  `guards.js` (preflight refusal logic).
- `scenarios/` — the 11 workloads as k6 scripts (website, auth, upload, extraction,
  analysis-run creation, merit/idempotency, db read/write, realtime, polling,
  concurrent-AI, mixed journey).
- `profiles/` — ramp / spike / soak / recovery / duplicate-submission / provider-timeout
  stage builders reused across scenarios.
- `fixtures/` — synthetic users + resumes + a generated PDF; `generate-fixtures.mjs`.
- `mocks/` — AI-provider mock strategy (AI_TEST_MODE + optional local mock server).
- `tools/` — `preflight.mjs` (confirm target, enforce caps), `run-stage.mjs` (single
  gated stage), `measure-supabase.mjs` (side-channel: queue depth, stuck runs, duplicate
  jobs, duplicate merit charges, merit inconsistencies).
- `results/` — `RESULTS-TEMPLATE.md` (all measured metrics), `LADDER.md` (stages + stop
  criteria), `FINAL-REPORT.md` (Part 4 skeleton, execution section left unfilled).
- `.env.load.example` — env template, names only.

# Explicitly OUT of scope this session

- Sending any traffic (Parts 2 & 3 execution) — requires a confirmed target + per-stage
  human gating, which the operator deferred.
- Any architecture change or "million-user" claim.

# Verification

- `npm run lint` / `type-check` unaffected (harness lives outside `src/` and Deno fn dirs;
  k6 scripts are not part of tsc/eslint globs — confirm no new lint targets break).
- `npm run build` still green.
- No secrets committed (grep the tree for obvious secret patterns before commit).
- Each k6 scenario passes `k6 inspect` / dry-run parse if k6 is available; otherwise the
  scripts are syntax-checked by node where possible and reviewed.

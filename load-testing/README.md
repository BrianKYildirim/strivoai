# Strivo capacity & load-testing system

A controlled, **safety-gated** harness to find where Strivo degrades, identify the first
bottleneck, and document **measured** capacity — without redesigning anything.

> **Status:** the SYSTEM is built. Execution is deliberately **not run** here — it
> requires a confirmed target and per-stage human gating. No traffic has been sent.
> See `results/FINAL-REPORT.md`.

> **No preview access?** Two paths that don't need it:
> - **Local correctness** (`TARGET_ENV=local`, loopback) — see **[`LOCAL.md`](LOCAL.md)**.
>   Validates the money path with a single-request correctness validator
>   (`tools/validate-local.mjs`). Correctness only — NOT capacity.
> - **Disposable cloud env** — see **[`TEMP-ENVIRONMENT.md`](TEMP-ENVIRONMENT.md)** for
>   exact throwaway Supabase + Vercel setup, deploy, validate, first-rung, and teardown.
> - **Capped real-provider calibration** is gated by `tools/real-run-guard.mjs`
>   (cumulative $5 cap + typed confirmation; makes no calls itself).

Tool: **[k6](https://k6.io)** (scenarios) + a Node **Supabase side-channel** for the
state k6 can't see (queue depth, stuck runs, merit/idempotency invariants).

## Safety model (read first)

1. **Production is never load-tested.** The prod project ref (`zjpjapgraoxdukdvpjes`) is
   hard-blocked in every entry point (`config/environments.js`, `tools/*`). Prod is
   inspect-only.
2. **Confirm the target before traffic.** Every scenario refuses to run unless
   `CONFIRM_TARGET` equals the resolved project ref (`lib/guards.js`).
3. **Hard caps.** `config/safety-limits.js` clamps every dimension so a fat-fingered
   `TARGET` can't exceed the plan. Executing-analysis rungs 500/1000 need an explicit
   override.
4. **Auto-abort on degradation.** `config/thresholds.js` aborts a stage the moment p95/p99
   /error-rate/invariants breach.
5. **No real data.** Synthetic accounts (`*.invalid` domain), synthetic resumes/PDF.
6. **No secrets committed.** Passwords/keys come from env at runtime; the fixture pool is
   emails-only. `.env.load.example` is names-only.
7. **Mock AI for volume.** `AI_TEST_MODE` (Preview already on). Real provider only for a
   tiny **$5-capped** sample.
8. **One rung at a time.** No auto-escalation; a human decides after every stage.

## The seven concurrency dimensions (kept separate)

Browsing sessions · requests/second · concurrent uploads · queued analyses · **executing
analyses** · DB connections · realtime connections. See `results/LADDER.md`.
**10 000 browsing sessions ≠ 10 000 executing analyses.**

## Layout

```
config/     safety-limits.js · environments.js (prod blocklist) · thresholds.js
lib/        auth.js · session.js · metrics.js · guards.js · scenario.js
profiles/   stages.js (ramp / spike / soak / recovery / rps)
scenarios/  01..12 — the 11 workloads + provider fault-injection
fixtures/   generate-fixtures.mjs · synthetic-users.json · resumes/*
mocks/      AI_TEST_MODE strategy + fault injection
tools/      preflight.mjs · run-stage.mjs · measure-supabase.mjs · cleanup.mjs · sql/
results/    LADDER.md · RESULTS-TEMPLATE.md · FINAL-REPORT.md · metrics-*.jsonl
```

### Scenarios ↔ workloads

| # | Scenario | Workload | Dimension |
|---|---|---|---|
| 1 | `01-website-dashboard.js` | Website & dashboard traffic | browsing sessions |
| 2 | `02-auth-session.js` | Auth & session validation | RPS |
| 3 | `03-resume-upload.js` | Resume/PDF upload | concurrent uploads |
| 4 | `04-pdf-extraction.js` | PDF extraction (ocr-pdf) | RPS |
| 5 | `05-analysis-run-creation.js` | Analysis-run creation | queued analyses |
| 6 | `06-merit-idempotency.js` | Merit deduction & idempotency + duplicate-submission | correctness |
| 7 | `07-db-read-write.js` | DB reads & writes | RPS / DB connections |
| 8 | `08-realtime-subscriptions.js` | Realtime subscriptions | realtime connections |
| 9 | `09-polling-retrieval.js` | Polling & result retrieval | polling volume |
| 10 | `10-concurrent-ai-analysis.js` | Concurrent AI execution | executing analyses |
| 11 | `11-mixed-user-journey.js` | Mixed realistic journey | blended |
| 12 | `12-provider-fault-injection.js` | Provider timeout/rate-limit/overload sim | recovery |

Test shapes (ramp / spike / soak / recovery) are `PROFILE=` options on every scenario;
duplicate-submission is workload 6; provider timeout/rate-limit is workload 12.

## Setup

```bash
# 1) Install k6 (https://k6.io/docs/get-started/installation/)
# 2) Generate fixtures (safe: no PII, no secrets). Add --provision to create the
#    synthetic users on a NON-PROD target (needs SUPABASE_SERVICE_ROLE_KEY + LOADTEST_PASSWORD).
node load-testing/fixtures/generate-fixtures.mjs --count 200 --provision
# 3) (workload 7 writes) apply the isolated scratch table to the target:
psql "$SUPABASE_DB_URL" -f load-testing/tools/sql/load_test_scratch.sql
# 4) Configure env (names-only template):
cp load-testing/.env.load.example load-testing/.env.load.local   # then fill in, keep it OUT of git
```

## Run (one gated rung)

```bash
cd load-testing
export TARGET_ENV=preview CONFIRM_TARGET=cimjltzovkahkqecpwgi
export SUPABASE_URL=... SUPABASE_ANON_KEY=... LOADTEST_PASSWORD=... SUPABASE_DB_URL=...

node tools/preflight.mjs                    # blocks on any unsafe/missing precondition

# runs ONE rung + the Supabase side-channel; STOPS for your decision afterward
node tools/run-stage.mjs --scenario 10-concurrent-ai-analysis \
  --profile ramp --target 10 --measure-duration 300
```

Or call k6 directly for a single scenario:

```bash
k6 run -e TARGET_ENV=preview -e CONFIRM_TARGET=cimjltzovkahkqecpwgi \
  -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e LOADTEST_PASSWORD=... \
  -e PROFILE=ramp -e TARGET=100 scenarios/01-website-dashboard.js
```

Then, in another shell, watch the invariants live:

```bash
node tools/measure-supabase.mjs --interval 5 --duration 300
```

## Overload & recovery (Part 3)

At the highest already-verified-safe rung: `--profile spike` then `--profile recovery`,
watching `measure-supabase` for queue drain, zero stuck runs, and no duplicate
jobs/charges. See `results/LADDER.md` stop-criteria.

## Teardown

```bash
node tools/cleanup.mjs --domain loadtest.strivio.invalid --yes   # deletes synthetic users (cascades data)
psql "$SUPABASE_DB_URL" -c 'DROP TABLE IF EXISTS public.load_test_scratch;'
```

## Important environment caveats (from project memory)

- **Preview never calls Anthropic** → perfect for mocked volume; real-AI latency/cost is
  NOT measurable there.
- **Preview `MERIT_SYSTEM_ENABLED=false`** → merit charge/refund/idempotency is INERT on
  Preview. Workload #6 charge conclusions require a **throwaway merit-ON** project.
- **Vercel Git link disconnected** → Preview has no auto-deployed SPA; "website traffic"
  here measures the Supabase API surface, not a Vercel-hosted frontend. Static assets are
  a Vercel/CDN concern, out of scope for the Supabase-capacity question.

## Reporting

Fill `results/RESULTS-TEMPLATE.md` per rung, then consolidate into
`results/FINAL-REPORT.md`. Report only measured capacity. **Never claim million-user
readiness.** Stop at the first unsafe level.

***

phase: 29
plan: 10
subsystem: foundation-infrastructure
status: paused-operator-action-required
tags: \[phase-29, deploy, schema-push, perf-probe, blocking, verification, checkpoint]
requires:

* 29-01-PLAN.md (analysis\_cache migration)
* 29-02-PLAN.md (resumes.extracted\_text + text\_hash migration)
* 29-03-PLAN.md (usage\_tracking.analysis\_id + record\_ai\_usage 4-arg migration)
* 29-04-PLAN.md (merit\_transactions.idempotency\_key + check\_and\_deduct\_merits 4-arg migration)
* 29-08-SUMMARY.md (analyze-resume + ocr-pdf wiring to redeploy)
* 29-09-PLAN.md (merit-idempotency.test.ts gated integration test)
  provides:
* scripts/staging-cache-perf-probe.mjs (NFR-02 p95 measurement harness)
* .planning/phases/29-foundation-infrastructure/29-VERIFICATION.md (acceptance evidence template)
  affects:
* Phase 29 sign-off gate (`/gsd-verify-work 29`)
  tech-stack:
  added: \[]
  patterns:
  * "6-phase perf-probe (seed/warmup/measure/report/evidence/cleanup) with finally-block cleanup"
  * "Service-role seed of analysis\_cache for RLS-bypassing perf measurement (D-03)"
  * "Markdown evidence append pattern mirroring scripts/validate-performance.mjs"
    key-files:
    created:
  * scripts/staging-cache-perf-probe.mjs
  * .planning/phases/29-foundation-infrastructure/29-VERIFICATION.md
  * .planning/phases/29-foundation-infrastructure/29-10-SUMMARY.md
    modified: \[]
    decisions:
* "Used .mjs over .ps1 per 29-PATTERNS.md (validate-performance.mjs is the closest in-repo analog)"
* "MERIT\_TEST\_USER\_ID is optional but recommended — FK analysis\_cache.user\_id -> profiles(id) requires a real profile"
* "Probe uses upsert with ignoreDuplicates so re-runs don't fail on a leftover row from a prior crashed probe"
* "Nearest-rank percentile (Wikipedia method) over interpolated percentiles — matches scripts/validate-performance.mjs convention"
* "Evidence file append uses a fresh H2 section per run (not overwrite) so /gsd-verify-work 29 can audit history"
  metrics:
  duration\_minutes: 18
  completed\_date: 2026-05-12

***

# Phase 29 Plan 10: Foundation Infrastructure Staging Push + Verification — Summary

**One-liner:** Authored the NFR-02 `staging-cache-perf-probe.mjs` and the `29-VERIFICATION.md` acceptance template; halted at the BLOCKING staging deploy + perf-probe + integration-test gate because none of the required operator environment variables are set in the current shell.

## Status: Paused — Operator Action Required

This plan is `autonomous: false`. Tasks 1 (perf probe script) and 3 (VERIFICATION.md scaffold) were autonomous and completed successfully. Task 2 (the BLOCKING `checkpoint:human-action`) cannot proceed in the current environment because none of the staging credentials are populated.

### Tasks Completed

| Task                                                      | Status | Commit    | Files                                                                        |
| --------------------------------------------------------- | ------ | --------- | ---------------------------------------------------------------------------- |
| 1. Author scripts/staging-cache-perf-probe.mjs            | done   | `ec0b220` | scripts/staging-cache-perf-probe.mjs (377 lines)                             |
| 3. Author 29-VERIFICATION.md acceptance evidence document | done   | `0da3d0a` | .planning/phases/29-foundation-infrastructure/29-VERIFICATION.md (151 lines) |

### Tasks Blocked

| Task                                                                | Status  | Reason                                                                                                      |
| ------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| 2. Push 4 migrations + redeploy analyze-resume + ocr-pdf to staging | blocked | `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` not set                                                    |
| 2b. SQL smoke checklist (10 queries)                                | blocked | depends on Task 2 deploy                                                                                    |
| 2c. Run NFR-02 perf probe                                           | blocked | `SUPABASE_URL_STAGING` + `SUPABASE_SERVICE_ROLE_KEY_STAGING` + `MERIT_TEST_USER_ID` not set                 |
| 2d. Run TEST-02 + NFR-07 integration test                           | blocked | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `MERIT_TEST_USER_ID` + `DENO_TEST_SUPABASE_REMOTE=1` not set |

### Automated Verify Gates (passed)

```text
$ node -e "const fs=require('fs');const s=fs.readFileSync('scripts/staging-cache-perf-probe.mjs','utf8');const required=['SUPABASE_URL_STAGING','SUPABASE_SERVICE_ROLE_KEY_STAGING','analysis_cache','cache_key','p95','createClient','performance.now'];const missing=required.filter(t=>!s.includes(t));if(missing.length){console.error('Missing:',missing);process.exit(1)}console.log('OK')"
OK

$ node -e "const fs=require('fs');const s=fs.readFileSync('.planning/phases/29-foundation-infrastructure/29-VERIFICATION.md','utf8');const required=['## SQL Smoke Checklist','## NFR-02 Cache Lookup Perf Probe','## TEST-02','## TEST-01 Coverage Matrix','## Code Review','## Threat Model','## Sign-Off','CACHE-01','MER-04','NFR-07'];const missing=required.filter(t=>!s.includes(t));if(missing.length){console.error('Missing:',missing);process.exit(1)}console.log('OK')"
OK
```

## Checkpoint: Operator Action Required

The remaining work (staging deploy + SQL smoke + perf probe + integration test) cannot run inside the executor agent — it requires operator-held staging secrets. Run the following PowerShell sequence from the repo root **on a workstation where the secrets are available**:

### Step 1 — Set deploy credentials, then push schema + functions

```PowerShell
$env:SUPABASE_ACCESS_TOKEN = '<staging supabase access token>'
$env:SUPABASE_PROJECT_REF  = 'cimjltzovkahkqecpwgi'   # staging ref hard-coded in deploy-staging.ps1
.\scripts\deploy-staging.ps1
```

Expected: the wrapper copies `supabase/config.staging.toml` -> `supabase/config.toml`, links to the staging project, then deploys all 35 edge functions. Migrations are applied by `supabase link` + the deploy run picking up `supabase/migrations/*.sql`.

> **Note:** `deploy-staging.ps1` as it stands runs `supabase functions deploy ...` only. If the staging Postgres schema is not auto-pushed by the link step, the operator should run `supabase db push --include-all` after the link to apply the 4 new Phase 29 migrations (`20260512000000`..`20260512000003`).

### Step 2 — Run the 10 SQL smoke queries

Open the Supabase staging SQL editor and run each query from `29-VERIFICATION.md` §"SQL Smoke Checklist" rows 4.1-4.10. Paste each result into the **Actual** cell.

### Step 3 — Set perf-probe credentials, then run the NFR-02 probe

```PowerShell
$env:SUPABASE_URL_STAGING               = '<staging url>'   # e.g. https://cimjltzovkahkqecpwgi.supabase.co
$env:SUPABASE_SERVICE_ROLE_KEY_STAGING  = '<staging service role key>'
$env:MERIT_TEST_USER_ID                 = '<staging test user uuid that exists in public.profiles>'
node scripts/staging-cache-perf-probe.mjs --env staging --runs 100 --warmup
```

Expected: exit 0, p95 < 100ms, evidence appended to `29-VERIFICATION.md` §"NFR-02 Cache Lookup Perf Probe".

### Step 4 — Set integration-test credentials, then run TEST-02 + NFR-07

```PowerShell
$env:SUPABASE_URL                 = '<staging url>'
$env:SUPABASE_SERVICE_ROLE_KEY    = '<staging service role key>'
$env:MERIT_TEST_USER_ID           = '<staging test user uuid>'
$env:DENO_TEST_SUPABASE_REMOTE    = '1'
deno test --allow-env --allow-net supabase/functions/_shared/merit-idempotency.test.ts
```

OR run the full edge-test suite (registers `merit-idempotency.test.ts`):

```PowerShell
.\scripts\run-edge-tests.ps1
```

Expected: both gated `Deno.test` cases pass (sequential retry + retry-storm).

### Step 5 — Cross-cutting NFR-05 + local regression

```PowerShell
git diff --stat main...HEAD -- `
  supabase/functions/_shared/auth.ts `
  supabase/functions/_shared/cors.ts `
  supabase/functions/_shared/rate-limiter.ts `
  supabase/functions/_shared/prompt-sanitizer.ts
.\scripts\run-edge-tests.ps1
npm run lint
npm run test
```

Expected: empty `git diff --stat` output (NFR-05); all local test suites exit 0 (TEST-01 + regression safety).

### Step 6 — Sign off

Paste each command's output into the matching **Actual** cell of `29-VERIFICATION.md`, tick the Sign-Off checklist, then run `/gsd-verify-work 29` to compute phase-pass.

## Deviations from Plan

### Plan task numbering vs. orchestrator prompt

The orchestrator prompt enumerates 5 tasks (1-5). The plan file `29-10-PLAN.md` enumerates 3 tasks: Task 1 (perf-probe script), Task 2 (BLOCKING operator deploy + checks), Task 3 (VERIFICATION.md scaffold). Mapping:

| Orchestrator prompt task       | Plan task              | Outcome                        |
| ------------------------------ | ---------------------- | ------------------------------ |
| Task 1: author perf-probe      | Plan Task 1            | done (`ec0b220`)               |
| Task 2: run deploy             | Plan Task 2 (BLOCKING) | blocked — see Checkpoint above |
| Task 3: run perf probe         | Plan Task 2 sub-step 6 | blocked — see Checkpoint above |
| Task 4: run integration test   | Plan Task 2 sub-step 7 | blocked — see Checkpoint above |
| Task 5: author VERIFICATION.md | Plan Task 3            | done (`0da3d0a`)               |

The plan's authoritative numbering is preserved in the artifact; the orchestrator's task ordering is preserved in this summary. No semantic deviation.

### None auto-fixed

No Rule 1 / Rule 2 / Rule 3 deviations were required. Tasks 1 and 3 are pure file-authoring tasks; their automated `<verify>` gates passed on first run.

## Authentication Gates

Six environment variables form a single authentication gate (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_URL_STAGING`, `SUPABASE_SERVICE_ROLE_KEY_STAGING`, `MERIT_TEST_USER_ID`, `DENO_TEST_SUPABASE_REMOTE`). None are set in the executor environment, so the entire BLOCKING task is gated until the operator runs the steps under "Checkpoint: Operator Action Required" above.

This matches the plan's `autonomous: false` posture — staging credentials are operator-supplied by design, never injected into autonomous agents.

## Known Stubs

None. The perf-probe script is fully wired (Phases 1-6 all implemented); the VERIFICATION.md scaffold is intentionally partial (operator fills the `Actual` cells per its workflow — this is the documented evidence-document convention).

## Threat Flags

None — no new security surface introduced. The probe uses the service-role key for the seed INSERT, which is the legitimate documented pattern (D-03) used by the Phase 29-06 merit-gateway precheck callback. Threat T-29-CACHE-POISON is mitigated by limiting the cache write path to the gateway callback at the application layer; the probe's seed write is bounded to a single test row and cleaned up in a `finally` block.

## Self-Check: PASSED

* FOUND: scripts/staging-cache-perf-probe.mjs
* FOUND: .planning/phases/29-foundation-infrastructure/29-VERIFICATION.md
* FOUND: .planning/phases/29-foundation-infrastructure/29-10-SUMMARY.md (this file)
* FOUND: commit `ec0b220` (Task 1)
* FOUND: commit `0da3d0a` (Task 3)


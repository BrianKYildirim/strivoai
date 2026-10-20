---
phase: 42-database-foundation-users-career-targets
plan: 05
subsystem: database
tags: [supabase, pg_cron, pg_net, vault, extraction, catchup]
requires:
  - plan: 42-04
    provides: extract-analysis-structure worker with runCatchup stub
provides:
  - extract_catchup_nightly pg_cron job (every 15 min)
  - runCatchup() implementation in extract-analysis-structure worker
  - improvement-over-time SQL query template (DB-VER-04)
affects: [phase-42-layer-2-catchup, extract-analysis-structure]
tech-stack:
  added: [supabase-vault]
  patterns:
    - Supabase Vault for cron job secrets (replaces GUC pattern; hosted postgres role lacks ALTER DATABASE permission)
    - pg_cron HTTP webhook via pg_net reading secret from vault.decrypted_secrets at fire time
key-files:
  created:
    - supabase/migrations/20260525000003_phase42_layer2_extract_catchup_cron.sql
    - .planning/phases/42-database-foundation-users-career-targets/queries/improvement-over-time.sql
  modified:
    - supabase/functions/extract-analysis-structure/index.ts
requirements-completed: [DB-VER-03, DB-VER-04]
duration: ~2h (includes platform troubleshooting)
completed: 2026-05-26
---

# Phase 42 Plan 05: Extraction Catchup Cron + Improvement-Over-Time Query

**Closed the Layer 2 worker SLA gap and shipped the DB-VER-04 query template.**

## Accomplishments

- Replaced the Plan 42-04 `runCatchup()` stub with a real scan-and-dispatch implementation: scans `analysis_results` rows older than 5 min lacking a matching `resume_versions` / `linkedin_versions` row, dispatches to existing in-process extractors per row (no new HTTP loop), limits to 50 rows per tick, wraps each row in try/catch for failure isolation, returns a structured summary log.
- Created `20260525000003_phase42_layer2_extract_catchup_cron.sql` scheduling `extract_catchup_nightly` at `*/15 * * * *` via pg_cron + pg_net, reading `x-internal-job-secret` from `vault.decrypted_secrets` at fire time.
- Authored `queries/improvement-over-time.sql` — parameterized template returning last 5 resume versions for a user with overall/section/bullet score deltas vs prior version via supersedes_id; header documents $1 arg, expected runtime (<100ms), and index usage (idx_resume_versions_user_resume_created).
- Deployed updated `extract-analysis-structure` worker to project `cimjltzovkahkqecpwgi`.

## Task Commits

1. **Tasks 1–3: Migration, runCatchup(), SQL template** — `42326d3` (`feat(42-05): add extraction catchup assets`)
2. **Migration fix: Vault pattern** — `5f31d43` (`fix(42-05): use Vault for cron secret instead of GUC`)

## Verification

- `SELECT count(*) FROM cron.job WHERE jobname='extract_catchup_nightly'` returns 1 ✓
- `vault.decrypted_secrets WHERE name='internal_job_secret'` found = true ✓
- Worker redeployed to `cimjltzovkahkqecpwgi` ✓
- First tick verification: pending (fires within 15 min of deploy)

## Deviations from Plan

- GUC approach (`ALTER DATABASE postgres SET app.*`) is blocked on Supabase hosted platform — the `postgres` role lacks the required privilege. Switched to Supabase Vault: secret stored via `vault.create_secret()` (no superuser needed), cron job reads it via `vault.decrypted_secrets` at fire time. URL hardcoded (public, not sensitive). Migration updated and committed in `5f31d43`.

## Next Phase Readiness

Wave 3 (Plans 42-06 + 42-07) can begin: Layer 2 catchup is live, worker is deployed, L3 behavior tracking tables have no dependency on the cron tick result.

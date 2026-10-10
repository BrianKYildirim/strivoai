---
phase: 03-shared-analysis-lifecycle-substrate
plan: 06
subsystem: infra
tags: [reaper, pg_cron, pg_net, edge-functions, deno, merit-refund, internal-auth, dormant]

# Dependency graph
requires:
  - phase: 03-01
    provides: analysis_jobs lifecycle columns (state, state_updated_at, merit_settled, refunded, retry_count, failure_code/stage); transition_analysis_run CAS RPC; financial CHECK
  - phase: 02-05
    provides: refundMeritsForJob idempotent refund with already_refunded backstop
provides:
  - reap-stale-analysis-runs internal edge endpoint (per-state max-age terminalizer + exactly-once Merit release)
  - reap_stale_analysis_runs pg_cron schedule (every 15 min, armed but inert)
affects: [04-feature-migration-recruiting-linkedin, 05-feature-migration-resume-onboarding, 06-feature-migration-career-compass]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pg_cron net.http_post to an internal edge endpoint authenticated with a Vault-stored internal_job_secret (extract_catchup_nightly precedent)"
    - "Per-state max-age terminalization: extracting/generating->retryable_failed; money/DB-bound states->failed (never re-retry past save)"
    - "Exactly-once Merit release: CAS transitioned===true gate + refundMeritsForJob already_refunded backstop + pre-sweep merit_settled||refunded belt + DB CHECK"

key-files:
  created:
    - supabase/functions/reap-stale-analysis-runs/index.ts
    - supabase/functions/reap-stale-analysis-runs/__tests__/reaper.test.ts
    - supabase/migrations/20260702000003_reap_stale_analysis_runs_cron.sql
  modified: []

key-decisions:
  - "Reaper is internal-auth only (requireAuth internal / timingSafeEqual); unauthenticated calls 401"
  - "Per-state max-age model (A2): extracting_data/generating->retryable_failed@300s; reserving_merits/validating_output/saving->failed@120s; created/validating_inputs->failed@60s; retryable_failed->failed@600s"
  - "Cron migration ships the PREVIEW host; prod host repoint is an explicit operator step (SEC-02-08-CRON host-drift avoidance) — done via SQL Editor at arming"

patterns-established:
  - "Standalone operator SQL to repoint a cron net.http_post URL per-environment without editing the committed migration"

requirements-completed: [LIFE-04, LIFE-06, LIFE-09]

# Metrics
duration: checkpoint (operator arming spanned session)
completed: 2026-07-02
---

# Phase 3 Plan 06: Stale-Run Reaper Summary

**The D-01 reaper shipped DORMANT-but-COMPLETE — an internal edge endpoint that terminalizes stale non-terminal `analysis_jobs` rows (per-state max-age) and releases the stranded Merit reservation exactly once, plus a `pg_cron` schedule armed inertly on both environments.**

## What was built
- **`reap-stale-analysis-runs/index.ts`** — internal-auth endpoint (`requireAuth` internal, `timingSafeEqual`). Per-state max-age sweep: `extracting_data`/`generating` → `retryable_failed` (300s, worker-death recoverable, partial preserved); `reserving_merits`/`validating_output`/`saving` → `failed` (120s, money/DB-bound, never re-retry past save — Pitfall 4); `created`/`validating_inputs` → `failed` (60s); `retryable_failed` → `failed` (600s close-out, never re-entered). Exactly-once Merit release: CAS `transitioned===true` gate + `refundMeritsForJob(..., 'reaper_stale')` idempotent `already_refunded` backstop + pre-sweep `merit_settled||refunded` belt + DB `CHECK (NOT (merit_settled AND refunded))`.
- **`20260702000003_reap_stale_analysis_runs_cron.sql`** — `cron.schedule('reap_stale_analysis_runs','*/15 * * * *', net.http_post → /functions/v1/reap-stale-analysis-runs)` with the Vault `internal_job_secret` header, unschedule-if-exists re-run guard, verification DO-block, inline ROLLBACK.

## Arming evidence (both environments)
- **Preview `cimjltzovkahkqecpwgi`:** migration `000003` applied via `db push` (cron verification DO-block passed); reaper edge function deployed; `internal_job_secret` present in Vault; cron job registered on the preview host (correct for preview).
- **Prod `zjpjapgraoxdukdvpjes`:** migration `000003` applied via `db push` (DO-block passed); reaper edge function deployed; operator created the `internal_job_secret` Vault secret (was missing on prod) and repointed the cron `net.http_post` URL to the prod host via SQL Editor. Verified read-only: `reap_stale_analysis_runs` present, `active=true`, schedule `*/15 * * * *`, command points at `zjpjapgraoxdukdvpjes.supabase.co` (NOT preview — host-drift avoided), secret present.

## Dormancy
While the Phase-3 lifecycle flags are OFF, no feature writes `analysis_jobs.state`, so every 15-minute sweep finds ZERO non-terminal rows and terminalizes/refunds nothing. The schedule is armed inertly; it begins real work only once a downstream phase flips a feature onto the lifecycle `state` path.

## Task Commits
1. **Task 1: reaper endpoint + test** — `d63d5d89` (feat)
2. **Task 2: pg_cron schedule migration** — `9c837033` (feat)
3. **Task 3: operator arming** — checkpoint completed this session (function deploy + Vault secret + prod-host cron repoint; no code commit — live-DB/secret operations)

## Deviations from Plan
1. **Prod `internal_job_secret` was missing** (present on preview only). Surfaced via read-only prod inspection; operator created it during arming. Without it the cron would have fired null-auth and 401'd silently.
2. **Cron host repoint executed as standalone operator SQL** rather than an edited migration, to keep the committed `000003` preview-correct and avoid prod↔preview drift in the migration file itself (SEC-02-08-CRON class).

## User Setup Required / Follow-up
- **Rotate `INTERNAL_JOB_SECRET`.** The secret value was shared in-session (plaintext) while arming prod. Recommend regenerating it and updating BOTH the prod Edge Function secret (`INTERNAL_JOB_SECRET`) AND the Vault secret (`vault.update_secret` / recreate `internal_job_secret`) so the cron header keeps matching. Non-blocking but should be done soon.
- Optional: de-duplicate the twin `20260608*`/`20260625*` migration sets (pre-existing; see `03-OPERATOR-RUNBOOK.md`).

## Next Phase Readiness
Reaper is live and inert on both environments. When Phase 4/5/6 features adopt the lifecycle, stranded/stale runs will be reaped and their Merit reservations released exactly once with no further wiring.

---
*Phase: 03-shared-analysis-lifecycle-substrate*
*Completed: 2026-07-02*

## Self-Check: PASSED
Endpoint + test + cron migration present on disk and committed (d63d5d89, 9c837033). Arming verified read-only on prod: cron present, active, prod host, secret present. Reaper offline tests 13/13 (gated live twin SKIPs). Dormant confirmed.

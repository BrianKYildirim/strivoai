-- Phase 03 · 03-06 · LIFE-04 / LIFE-06 / LIFE-09 —
-- pg_cron schedule for the D-01 stale-analysis reaper (ARMED BUT INERT).
--
-- Copies the shape of 20260525000003_phase42_layer2_extract_catchup_cron.sql
-- verbatim: an every-15-minutes net.http_post to an internal edge endpoint,
-- authenticated with the Vault-stored internal_job_secret (never inlined).
--
-- DORMANCY GUARANTEE: while the Phase-3 analysis-lifecycle flags are OFF, no
-- feature writes the `analysis_jobs.state` column, so every sweep this cron
-- fires finds ZERO non-terminal rows and terminalizes/refunds nothing. The
-- schedule is armed inertly here; it begins doing real work only once a
-- downstream phase flips a feature onto the lifecycle `state` path.
--
-- ── HOST DRIFT CAVEAT (SEC-02-08-CRON) ──────────────────────────────────────────
-- The `url` below MUST point at the reaper on the SAME environment this migration
-- is applied to. The value committed here is the PREVIEW host
-- (cimjltzovkahkqecpwgi) — Claude applies + verifies this on PREVIEW. When the
-- OPERATOR applies this on PROD (zjpjapgraoxdukdvpjes; Claude is read-only on prod)
-- the host MUST be swapped to:
--   https://zjpjapgraoxdukdvpjes.supabase.co/functions/v1/reap-stale-analysis-runs
-- This is the exact class of prod↔preview cron-host drift flagged as the open
-- SEC-02-08-CRON operator item (prod jobs 1 keep-warm-ping + 6 extract_catchup
-- still net.http_post the preview host). Do NOT let the reaper inherit that drift.
--
-- Secret pre-requisite (once per environment; the migration reads it by name):
--   SELECT vault.create_secret('<INTERNAL_JOB_SECRET>', 'internal_job_secret');
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK: (copy-paste inverse — run only to disarm the reaper schedule)
--
--   SELECT cron.unschedule('reap_stale_analysis_runs');
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $cron$
BEGIN
  -- Re-run guard: unschedule any prior definition before (re)scheduling so this
  -- migration is idempotent (NFR-01) and a host swap cannot leave a stale twin.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reap_stale_analysis_runs') THEN
    PERFORM cron.unschedule('reap_stale_analysis_runs');
  END IF;

  PERFORM cron.schedule(
    'reap_stale_analysis_runs',
    '*/15 * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://cimjltzovkahkqecpwgi.supabase.co/functions/v1/reap-stale-analysis-runs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-job-secret', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'internal_job_secret'
          LIMIT 1
        )
      ),
      body := '{"invocation_source":"pg_cron_reaper"}'::jsonb
    );
    $job$
  );
END
$cron$;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'reap_stale_analysis_runs'
  ) THEN
    RAISE EXCEPTION 'Phase 03 03-06 reaper cron verification failed: cron job missing';
  END IF;

  RAISE NOTICE 'Phase 03 03-06 reap_stale_analysis_runs cron verification passed (armed but inert)';
END
$verify$;

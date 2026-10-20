-- Re-schedule keep-warm-ping to authenticate with the Vault internal_job_secret.
--
-- WHY: keep-warm now uses requireAuth({type:'internal'}) (it is a scheduler-only
-- endpoint, never called by a browser). The original 20260310000000 cron sent NO
-- auth header at all, so every ping 401'd once keep-warm required auth. This job
-- mirrors 20260525000003 (extract catchup) / 20260702000003 (reaper): a net.http_post
-- carrying x-internal-job-secret pulled from Vault (never inlined).
--
-- APPLY PER-ENVIRONMENT via the Supabase SQL editor (NOT `supabase db push`) — the
-- url host differs per project, exactly like the sibling cron migrations.
--
-- HOST: the value committed here is the PREVIEW host (cimjltzovkahkqecpwgi) — Claude
-- applies + verifies on PREVIEW. When the OPERATOR applies on PROD
-- (zjpjapgraoxdukdvpjes; Claude is read-only on prod) the host MUST be swapped to:
--   https://zjpjapgraoxdukdvpjes.supabase.co/functions/v1/keep-warm
--
-- SECRET PRE-REQUISITE (once per environment; the migration reads it by name):
--   SELECT vault.create_secret('<INTERNAL_JOB_SECRET>', 'internal_job_secret');
-- The Vault value MUST be byte-identical to the edge INTERNAL_JOB_SECRET or the
-- function returns secret-mismatch (401).
--
-- ROLLBACK (re-arm the old no-auth ping — only if keep-warm reverts to no auth):
--   SELECT cron.unschedule('keep-warm-ping');
--   -- then re-run 20260310000000_add_keep_warm_cron.sql

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $cron$
BEGIN
  -- Idempotent re-run guard: drop any prior definition before (re)scheduling so a
  -- host swap or re-apply cannot leave a stale twin.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'keep-warm-ping') THEN
    PERFORM cron.unschedule('keep-warm-ping');
  END IF;

  PERFORM cron.schedule(
    'keep-warm-ping',
    '*/5 * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://cimjltzovkahkqecpwgi.supabase.co/functions/v1/keep-warm',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-job-secret', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'internal_job_secret'
          LIMIT 1
        )
      ),
      body := '{}'::jsonb
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
    WHERE jobname = 'keep-warm-ping'
  ) THEN
    RAISE EXCEPTION 'keep-warm-ping internal-auth cron verification failed: cron job missing';
  END IF;

  RAISE NOTICE 'keep-warm-ping re-scheduled with x-internal-job-secret (internal auth)';
END
$verify$;

-- Phase 42 Layer 2: catchup cron for missed structure extraction webhooks.
--
-- Down migration, if ever needed:
--   SELECT cron.unschedule('extract_catchup_nightly');
--
-- Secret pre-requisite: before applying this migration, store the secret in Vault:
--   SELECT vault.create_secret('<INTERNAL_JOB_SECRET>', 'internal_job_secret');
-- This only needs to be done once per environment; the migration reads it by name.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'extract_catchup_nightly') THEN
    PERFORM cron.unschedule('extract_catchup_nightly');
  END IF;

  PERFORM cron.schedule(
    'extract_catchup_nightly',
    '*/15 * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://cimjltzovkahkqecpwgi.supabase.co/functions/v1/extract-analysis-structure',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-job-secret', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'internal_job_secret'
          LIMIT 1
        )
      ),
      body := '{"invocation_source":"pg_cron_catchup"}'::jsonb
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
    WHERE jobname = 'extract_catchup_nightly'
  ) THEN
    RAISE EXCEPTION 'Phase 42 L2 catchup verification failed: cron job missing';
  END IF;

  RAISE NOTICE 'Phase 42 Layer 2 extract catchup cron verification passed';
END
$verify$;

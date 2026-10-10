-- Schedule keep-warm pings every 5 minutes to prevent edge function cold starts.
-- Uses pg_cron + pg_net (both already enabled in prior migration).
--
-- IMPORTANT: This migration must be run per-environment via the Supabase SQL editor
-- (not via `supabase db push`) because the URL differs per project.
--
-- Staging:    https://cimjltzovkahkqecpwgi.supabase.co
-- Production: https://zjpjapgraoxdukdvpjes.supabase.co
--
-- To apply, run in the SQL editor for each environment, replacing the URL below.

SELECT cron.schedule(
  'keep-warm-ping',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url    := 'https://cimjltzovkahkqecpwgi.supabase.co/functions/v1/keep-warm',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body   := '{}'::jsonb
  );
  $$
);

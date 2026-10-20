-- Phase 13 cron: run in each env's SQL editor AFTER deploying check-merit-alerts.
-- Requires: pg_cron + pg_net extensions (already enabled for Phase 10 keep-warm).
-- Replace <PROJECT_REF> and <INTERNAL_JOB_SECRET> before running.

-- WR-06: guard against running with unreplaced placeholders
do $$ begin
  if '<PROJECT_REF>' = '<' || 'PROJECT_REF>' then
    raise exception 'Replace <PROJECT_REF> and <INTERNAL_JOB_SECRET> before running this script';
  end if;
end $$;

select cron.schedule(
  'check-merit-alerts',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := 'https://<PROJECT_REF>.supabase.co/functions/v1/check-merit-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-job-secret', '<INTERNAL_JOB_SECRET>'
      ),
      body := jsonb_build_object('source', 'pg_cron')
    );
  $$
);

-- To unschedule:
-- select cron.unschedule('check-merit-alerts');

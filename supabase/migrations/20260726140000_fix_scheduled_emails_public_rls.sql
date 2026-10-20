-- 260726 (SECURITY, CRITICAL): lock down public.scheduled_emails.
--
-- The only policy, "Service role can manage all scheduled emails"
-- (20260116215237), is `FOR ALL` with NO `TO service_role` clause, so it binds to
-- the `public` role (anon + authenticated) with USING(true)/WITH CHECK(true).
-- Result on production: anyone holding the public anon key (shipped in the
-- frontend) can `GET /rest/v1/scheduled_emails` — reading every user's user_id /
-- email_type / scheduled_for / metadata (a user-enumeration primitive) — and can
-- INSERT/UPDATE/DELETE arbitrary queued emails that the process-scheduled-emails
-- cron then sends. No client (authenticated or anon) legitimately touches this
-- table: it is a backend email queue managed only by service_role edge functions
-- (process-scheduled-emails, send-credits-exhausted-email) under internal auth.
--
-- Fix: drop the public policy and revoke client grants. RLS stays enabled → with
-- no policy for anon/authenticated they are default-denied; service_role bypasses
-- RLS and retains full access. Mirrors the alert_state / rate_limit_counters /
-- stripe_webhook_events "service-role-only" model. Idempotent.

drop policy if exists "Service role can manage all scheduled emails" on public.scheduled_emails;

revoke all on public.scheduled_emails from anon, authenticated;

-- Explicit belt-and-suspenders deny for client roles (matches the codebase's
-- established explicit-deny pattern; RLS default-deny already covers this).
drop policy if exists scheduled_emails_no_client_access on public.scheduled_emails;
create policy scheduled_emails_no_client_access
  on public.scheduled_emails
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

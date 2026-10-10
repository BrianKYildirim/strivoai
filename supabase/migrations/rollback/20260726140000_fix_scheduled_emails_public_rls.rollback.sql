-- ROLLBACK for 20260726140000_fix_scheduled_emails_public_rls.sql
--
-- Removes the client-deny policy and re-grants. NOTE: this deliberately does NOT
-- recreate the original "Service role can manage all scheduled emails" policy —
-- that policy was the vulnerability (public/USING(true)). Restoring it would
-- re-open anonymous cross-user read/write. Roll back only if you intend to re-open
-- the table to backend-only access via a corrected, service_role-scoped policy.

drop policy if exists scheduled_emails_no_client_access on public.scheduled_emails;
-- (intentionally no re-grant to anon/authenticated — they never needed access.)

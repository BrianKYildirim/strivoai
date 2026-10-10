-- Rollback for 20260727120000_restore_client_writes_resumes_career_targets.sql
--
-- WARNING: applying this rollback RE-BREAKS ONBOARDING on production. It returns
-- the database to the state that produced "Setup failed. Please try again." for
-- every new user, because src/pages/Onboarding.tsx writes public.resumes and
-- public.career_targets directly from the browser.
--
-- Only run this if the client has FIRST been changed to route those two writes
-- through a server-mediated path (an edge function using the service role).
-- Until then, this rollback is a production outage.

revoke insert, update on public.resumes        from authenticated;
revoke insert, update on public.career_targets from authenticated;

-- 260727 — PRODUCTION INCIDENT FIX: restore client INSERT/UPDATE on
--          public.resumes and public.career_targets.
--
-- WHAT BROKE
-- `20260726130000_fresh_env_client_grants_and_tier_guard.sql` (lines 48-49) ran:
--
--     revoke insert, update on public.resumes from authenticated;
--     revoke insert, update on public.career_targets from authenticated;
--
-- justified by the comment "writes are server-mediated on prod". That premise is
-- FALSE. Onboarding writes both tables directly from the browser:
--
--     src/pages/Onboarding.tsx:363  .from("resumes").insert({ ... })
--     src/pages/Onboarding.tsx:417  .from("career_targets").upsert({ ... })
--
-- The migration header also predicted "a NO-OP for the broad grants" on prod.
-- That held for the GRANTs but NOT for these REVOKEs, which actively removed
-- privileges production depended on.
--
-- IMPACT (prod, since 2026-07-26)
-- Every new user hits "Setup failed. Please try again." on the final onboarding
-- step. PostgREST returns 42501 before any edge function is reached — production
-- logs show validate-document 200s and ZERO POSTs to analyze-resume /
-- submit-resume-analysis-job. Affected accounts are left with 0 resumes,
-- 0 career_targets, and no analysis. Onboarding is fully blocked.
--
-- WHY RESTORING IS SAFE
-- Ownership was never enforced by these table grants — it is enforced by RLS,
-- which is untouched and still in place on both tables:
--   resumes.“Users can create their own resumes”   INSERT WITH CHECK auth.uid() = user_id
--   resumes.“Users can update their own resumes”   UPDATE USING      auth.uid() = user_id
--   career_targets_insert_own                      INSERT WITH CHECK auth.uid() = user_id
--   career_targets_update_own                      UPDATE USING/CHECK auth.uid() = user_id
-- The revoke was redundant as a security control and breaking as a change.
--
-- CORROBORATION THAT THE REVOKE WAS ACCIDENTAL
-- 20260726130000 granted anon select/insert/update on every public table (line 27)
-- and then revoked insert/update from `authenticated` ONLY. Production therefore
-- currently gives SIGNED-OUT users more table privilege on these two tables than
-- signed-in users. Not exploitable — anon's RLS policies require
-- auth.uid() = user_id, which is null for anon — but nobody designs it that way.
-- Left alone here on purpose: this hotfix restores service, it does not re-tune
-- the anon posture. Track that separately.
--
-- SCOPE: deliberately narrow. The tier-self-upgrade guard on public.profiles and
-- every other lockdown from 20260726130000 are left exactly as they are.
-- Idempotent: re-running is a no-op.
--
-- APPLY: supabase db push   (or run the two GRANTs directly against prod)
-- VERIFY: the DO block below raises if the grants did not take.

grant insert, update on public.resumes         to authenticated;
grant insert, update on public.career_targets  to authenticated;

-- Post-condition: fail loudly rather than ship a silently partial fix.
do $$
begin
  if not has_table_privilege('authenticated', 'public.resumes', 'INSERT')
     or not has_table_privilege('authenticated', 'public.resumes', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.career_targets', 'INSERT')
     or not has_table_privilege('authenticated', 'public.career_targets', 'UPDATE')
  then
    raise exception
      'restore failed: authenticated still lacks INSERT/UPDATE on resumes or career_targets';
  end if;
end $$;

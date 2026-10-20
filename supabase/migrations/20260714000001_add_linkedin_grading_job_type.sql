-- Phase 9 (09-10) — add 'linkedin_grading' to analysis_jobs_job_type_check.
--
-- WHY (found by the 09-10 staging soak, and it is a P0 for the 09-11 production flip):
--
--   grade-linkedin's migrated lifecycle path calls runAnalysisLifecycle with
--   `jobType: 'linkedin_grading'` (supabase/functions/grade-linkedin/index.ts:401).
--   That value was NEVER added to analysis_jobs_job_type_check. The chain is:
--
--     create_or_recover_analysis_run  ->  INSERT INTO public.analysis_jobs (job_type, ...)
--       ->  CHECK constraint violation  ->  exception  ->  the executor fail-closes to
--           UNKNOWN_ANALYSIS_ERROR  ->  HTTP 500, no analysis_jobs row, no Anthropic call.
--
--   So the LinkedIn Grader returns 500 on EVERY request the moment
--   ANALYSIS_LIFECYCLE_LINKEDIN is turned on — and `linkedin` is flip #2 in the D-02
--   production order. Verified live on preview (cimjltzovkahkqecpwgi): a direct INSERT with
--   job_type='linkedin_grading' is REJECTED, while 'recruiting_lens' is ACCEPTED.
--
--   The other four lifecycle features are unaffected because they map onto job_type values
--   that ARE in the constraint:
--     recruiting_lens -> 'recruiting_lens'          (added by 20260409000001)
--     resume          -> 'resume_analysis'          (original, 20260225160000)
--     onboarding      -> 'resume_analysis'
--     career_compass  -> 'career_compass_analysis'  (added by 20260225222000)
--
--   This is a straight omission: 20260409000001 did exactly this for Recruiting Lens when
--   RCL migrated onto the lifecycle. Nobody did it for LinkedIn.
--
-- SHAPE: byte-for-byte the same DROP-then-ADD idiom as 20260409000001, with one value added.
-- Additive and re-runnable: it only WIDENS the accepted set, so no existing row can be
-- invalidated and the migration is safe to re-apply.
--
-- ROLLBACK (restores the pre-change constraint; only safe while no 'linkedin_grading' row
-- exists — delete/relabel any such rows first, or the ADD CONSTRAINT will fail):
--
--   do $$
--   begin
--     if exists (
--       select 1 from pg_constraint
--       where conname = 'analysis_jobs_job_type_check'
--         and conrelid = 'public.analysis_jobs'::regclass
--     ) then
--       alter table public.analysis_jobs drop constraint analysis_jobs_job_type_check;
--     end if;
--   end $$;
--
--   alter table public.analysis_jobs
--     add constraint analysis_jobs_job_type_check
--     check (job_type in ('resume_analysis', 'career_compass_analysis', 'recruiting_lens'));

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'analysis_jobs_job_type_check'
      and conrelid = 'public.analysis_jobs'::regclass
  ) then
    alter table public.analysis_jobs drop constraint analysis_jobs_job_type_check;
  end if;
end $$;

alter table public.analysis_jobs
  add constraint analysis_jobs_job_type_check
  check (job_type in ('resume_analysis', 'career_compass_analysis', 'recruiting_lens', 'linkedin_grading'));

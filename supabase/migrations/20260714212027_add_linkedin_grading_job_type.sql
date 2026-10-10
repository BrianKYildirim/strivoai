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
  check (job_type in ('resume_analysis', 'career_compass_analysis', 'recruiting_lens', 'linkedin_grading'));;

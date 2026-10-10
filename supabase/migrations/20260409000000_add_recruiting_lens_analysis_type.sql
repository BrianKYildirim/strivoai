do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'analysis_results_analysis_type_check'
      and conrelid = 'public.analysis_results'::regclass
  ) then
    alter table public.analysis_results drop constraint analysis_results_analysis_type_check;
  end if;
end $$;

alter table public.analysis_results
  add constraint analysis_results_analysis_type_check
  check (analysis_type in (
    'resume_analysis', 'linkedin_grading', 'job_matching',
    'career_compass', 'skills_gap_analysis', 'job_comparison',
    'recruiting_lens'
  ));

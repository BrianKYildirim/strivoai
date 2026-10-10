create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_type text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 4,
  available_at timestamp with time zone not null default now(),
  claimed_at timestamp with time zone,
  completed_at timestamp with time zone,
  last_http_status integer,
  last_error_message text,
  function_version text,
  worker_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint analysis_jobs_job_type_check check (job_type in ('resume_analysis')),
  constraint analysis_jobs_status_check check (status in ('pending', 'retrying', 'processing', 'completed', 'failed'))
);

alter table public.analysis_jobs enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'analysis_jobs'
      and policyname = 'Users can view their own analysis jobs'
  ) then
    create policy "Users can view their own analysis jobs"
      on public.analysis_jobs
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'analysis_jobs'
      and policyname = 'Users can insert their own analysis jobs'
  ) then
    create policy "Users can insert their own analysis jobs"
      on public.analysis_jobs
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists idx_analysis_jobs_queue_lookup
  on public.analysis_jobs (job_type, status, available_at, created_at);

create index if not exists idx_analysis_jobs_user_created
  on public.analysis_jobs (user_id, created_at desc);

create index if not exists idx_analysis_jobs_resume_id
  on public.analysis_jobs ((payload->>'resumeId'));

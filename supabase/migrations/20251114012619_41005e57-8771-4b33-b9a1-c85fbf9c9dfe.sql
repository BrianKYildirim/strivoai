-- Create saved_jobs table for storing liked jobs per user
create table if not exists public.saved_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id text,
  title text not null,
  company text not null,
  location text,
  salary text,
  url text,
  description text,
  match_score integer,
  why_match text,
  posted timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

-- Enable RLS and add policies
alter table public.saved_jobs enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='saved_jobs' and policyname='Users can view their own saved jobs'
  ) then
    create policy "Users can view their own saved jobs" on public.saved_jobs for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='saved_jobs' and policyname='Users can insert their own saved jobs'
  ) then
    create policy "Users can insert their own saved jobs" on public.saved_jobs for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='saved_jobs' and policyname='Users can update their own saved jobs'
  ) then
    create policy "Users can update their own saved jobs" on public.saved_jobs for update using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='saved_jobs' and policyname='Users can delete their own saved jobs'
  ) then
    create policy "Users can delete their own saved jobs" on public.saved_jobs for delete using (auth.uid() = user_id);
  end if;
end $$;

-- Helpful index
create index if not exists idx_saved_jobs_user_id on public.saved_jobs(user_id);

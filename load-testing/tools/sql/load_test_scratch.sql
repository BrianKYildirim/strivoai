-- ── Isolated write target for DB write-load (workload 7) ─────────────────────
--
-- Apply this ONLY to a non-production target (preview or a throwaway project).
-- It creates a self-contained, owner-scoped scratch table so DB write-load never
-- touches any product table or real data. RLS restricts every row to its owner,
-- exactly like the product tables, so the write path exercises the same
-- auth-RLS-initplan cost the real tables pay.
--
--   psql "$SUPABASE_DB_URL" -f load-testing/tools/sql/load_test_scratch.sql
--
-- Teardown: DROP TABLE public.load_test_scratch;  (see tools/cleanup.mjs)

create table if not exists public.load_test_scratch (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  scratch_key text not null,
  scratch_val jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (user_id, scratch_key)
);

alter table public.load_test_scratch enable row level security;

-- Owner-only read.
drop policy if exists load_test_scratch_select_own on public.load_test_scratch;
create policy load_test_scratch_select_own
  on public.load_test_scratch for select
  using ((select auth.uid()) = user_id);

-- Owner-only insert.
drop policy if exists load_test_scratch_insert_own on public.load_test_scratch;
create policy load_test_scratch_insert_own
  on public.load_test_scratch for insert
  with check ((select auth.uid()) = user_id);

-- Owner-only update (needed so PostgREST upsert-on-conflict can UPDATE).
drop policy if exists load_test_scratch_update_own on public.load_test_scratch;
create policy load_test_scratch_update_own
  on public.load_test_scratch for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Grants: authenticated needs UPDATE incl. the conflict column (user_id) or the
-- upsert 403s — see project memory "PostgREST upsert needs UPDATE on conflict column".
grant select, insert, update on public.load_test_scratch to authenticated;

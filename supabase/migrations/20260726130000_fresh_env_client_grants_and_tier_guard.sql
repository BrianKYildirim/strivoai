-- 260726 (fresh-environment anon/authenticated grants, least-privilege + tier guard)
--
-- Companion to 20260726120000 (service_role). A clean local `supabase db reset` /
-- fresh `supabase db push` also lacks the platform-default table grants for the
-- CLIENT roles (anon, authenticated), so a fresh env's frontend is fully broken
-- (`42501` on every read/write). Production carries those grants via the platform
-- default (verified read-only against prod: anon/authenticated hold broad
-- table grants on all public tables, EXCEPT the backend-only lockdowns below),
-- with RLS as the actual security boundary (every public table has RLS enabled).
--
-- This migration reproduces prod's posture on a fresh env: broad base grants GATED
-- BY RLS, minus the backend-only lockdown, PLUS a guard that closes a latent
-- privilege-escalation gap present on prod too (see the trigger).
--
-- Net effect on prod (if ever deployed): a NO-OP for the broad grants (already
-- held) and the lockdown (already absent); the trigger is a genuine hardening.
-- Idempotent + per-object exception-safe. RLS is untouched.

-- ── 1. Base client grants (RLS-gated) ───────────────────────────────────────
grant usage on schema public to anon, authenticated;
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    begin
      execute format('grant select, insert, update, delete on public.%I to authenticated', r.tablename);
      execute format('grant select, insert, update on public.%I to anon', r.tablename);
    exception when others then null;
    end;
  end loop;
  for r in select sequencename from pg_sequences where schemaname = 'public' loop
    begin
      execute format('grant usage, select on sequence public.%I to anon, authenticated', r.sequencename);
    exception when others then null;
    end;
  end loop;
end $$;

-- ── 2. Least-privilege lockdown — match prod's deviations exactly ────────────
-- ai_call_telemetry: backend-only telemetry, no client access on prod.
revoke all on public.ai_call_telemetry from anon, authenticated;
-- goal_taxonomy: reference data — authenticated read-only, no anon (matches prod).
revoke insert, update, delete on public.goal_taxonomy from authenticated;
revoke all on public.goal_taxonomy from anon;
-- resumes / career_targets: writes are server-mediated on prod (authenticated may
-- read + delete own, but not insert/update the table directly; career_targets keeps
-- whatever column-level grants its own migration established).
revoke insert, update on public.resumes from authenticated;
revoke insert, update on public.career_targets from authenticated;

-- ── 3. Tier / billing guard (the real hardening) ────────────────────────────
-- profiles.subscription_tier drives entitlement (requireAuth reads it). On prod,
-- authenticated holds column UPDATE on it, the RLS UPDATE policy only checks
-- auth.uid()=id (no WITH CHECK restricting columns), and NO trigger guards it — so
-- a user can self-upgrade their tier via a direct PostgREST UPDATE of their own
-- row. This trigger blocks CLIENT roles (anon/authenticated — the roles PostgREST
-- runs requests as) from changing any server-managed billing/entitlement column.
-- Backend writers (service_role in edge functions + the Stripe webhook, and
-- superuser migrations) are unaffected. Unchanged values pass (IS DISTINCT FROM),
-- so a client upsert that merely re-sends the same tier is fine.
create or replace function public.guard_profiles_server_managed_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if NEW.subscription_tier      is distinct from OLD.subscription_tier
    or NEW.subscription_status    is distinct from OLD.subscription_status
    or NEW.current_period_end     is distinct from OLD.current_period_end
    or NEW.credit_adjustment      is distinct from OLD.credit_adjustment
    or NEW.stripe_customer_id     is distinct from OLD.stripe_customer_id
    or NEW.stripe_subscription_id is distinct from OLD.stripe_subscription_id
    or NEW.stripe_price_id        is distinct from OLD.stripe_price_id
    or NEW.pending_downgrade_tier is distinct from OLD.pending_downgrade_tier
    then
      raise exception 'profiles billing/entitlement columns are server-managed'
        using errcode = '42501';
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists guard_profiles_server_managed_columns on public.profiles;
create trigger guard_profiles_server_managed_columns
  before update on public.profiles
  for each row execute function public.guard_profiles_server_managed_columns();

revoke all on function public.guard_profiles_server_managed_columns() from public;

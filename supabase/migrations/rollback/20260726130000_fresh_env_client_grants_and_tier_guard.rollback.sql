-- ROLLBACK for 20260726130000_fresh_env_client_grants_and_tier_guard.sql
--
-- Drops the billing-column guard trigger + function and revokes the client base
-- grants. NOTE: on hosted preview/prod the grant portion was a no-op (the platform
-- default already holds those grants), so running the revoke there would strip
-- grants the app needs — intended for local/throwaway teardown, not hosted use.

drop trigger if exists guard_profiles_server_managed_columns on public.profiles;
drop function if exists public.guard_profiles_server_managed_columns();

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    begin
      execute format('revoke select, insert, update, delete on public.%I from anon, authenticated', r.tablename);
    exception when others then null;
    end;
  end loop;
end $$;

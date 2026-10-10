-- ROLLBACK for 20260726120000_service_role_public_grants.sql
--
-- Reverses the default-privilege defaults and revokes service_role's public
-- access granted by the forward migration. NOTE: on hosted preview/prod the
-- forward migration was a no-op (service_role already held these grants via the
-- platform default), so applying this rollback there would REMOVE grants the
-- platform expects — do NOT run this on a hosted project unless you intend to
-- strip service_role's public access. It is intended for local/throwaway teardown.

alter default privileges in schema public revoke all on tables from service_role;
alter default privileges in schema public revoke all on sequences from service_role;
alter default privileges in schema public revoke execute on functions from service_role;

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    begin
      execute format('revoke all on public.%I from service_role', r.tablename);
    exception when others then null;
    end;
  end loop;
  for r in select sequencename from pg_sequences where schemaname = 'public' loop
    begin
      execute format('revoke all on sequence public.%I from service_role', r.sequencename);
    exception when others then null;
    end;
  end loop;
end $$;

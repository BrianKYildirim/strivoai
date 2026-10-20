-- 260726 (fresh-environment replay): ensure service_role has the standard Supabase
-- access on schema public so a FRESH environment works end-to-end:
--   * a clean local `supabase db reset` / `supabase start`, and
--   * a NEW non-production project via `supabase db push`.
-- On a clean sequential replay, service_role ended up WITHOUT table grants
-- (`42501 permission denied for table profiles`), so every Edge Function — which
-- uses the service client — 403'd. Hosted preview/prod already hold these grants
-- (platform default), so this migration is a harmless NO-OP there.
--
-- Idempotent + per-object exception-safe: a GRANT on an already-granted or
-- non-grantable object is a no-op. Grants ONLY service_role — anon/authenticated
-- grants + RLS hardening from prior migrations are intentional and untouched
-- (service_role bypasses RLS regardless).

grant usage on schema public to service_role;

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    begin
      execute format('grant all on public.%I to service_role', r.tablename);
    exception when others then null;
    end;
  end loop;
  for r in select sequencename from pg_sequences where schemaname = 'public' loop
    begin
      execute format('grant all on sequence public.%I to service_role', r.sequencename);
    exception when others then null;
    end;
  end loop;
  for r in select p.oid::regprocedure as sig
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' loop
    begin
      execute format('grant execute on function %s to service_role', r.sig);
    exception when others then null;
    end;
  end loop;
end $$;

-- Cover objects created after this migration (belt-and-suspenders; there are none
-- in-tree today, but keeps a fresh env correct if migrations are appended).
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

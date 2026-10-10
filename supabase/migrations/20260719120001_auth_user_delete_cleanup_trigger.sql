-- Quick task 260719-plu (2026-07-19)
--
-- PURPOSE: Make a DIRECT Supabase-Auth-dashboard (or auth-admin API) user deletion perform
-- the SAME complete Storage cleanup that the admin edge path does. DB cascade FKs
-- (20260719120000) already reap every user-owned public row when auth.users is deleted, but
-- Storage object metadata rows in storage.objects have no cascade to auth.users -- so uploaded
-- resumes and ai-archives files would survive a dashboard delete. This trigger closes that gap
-- for BOTH deletion paths (they both ultimately DELETE auth.users), giving one shared
-- cleanup mechanism.
--
-- WHY BEFORE DELETE (not AFTER): storage.objects.owner references auth.users; deleting the
-- object rows BEFORE the auth row avoids any owner FK ordering block, and OLD.id is available.
--
-- SECURITY DEFINER: the function runs as its owner (the postgres/migration role) so it can
-- write storage.objects regardless of the deleting session's privileges. search_path is pinned
-- empty and every object is fully-qualified (repo pin-search-path convention). NO RLS policy is
-- altered.
--
-- SCOPE: deletion is strictly by user id / user-folder path -- NEVER by email. Legacy `resumes`
-- uploads are keyed under `{user_id}/...` and `ai-archives` under `{user_id}/{table}/...`; the
-- `owner = OLD.id` predicate additionally covers rows where owner was set.
--
-- NOTE: this removes the Storage METADATA rows (which is what makes the objects unlisted and
-- unreachable). Physical object bytes may remain orphaned in the storage backend -- acceptable
-- per the standard Supabase cascade-cleanup norm; the admin-delete-user edge path additionally
-- reclaims bytes via the Storage API before it calls auth.admin.deleteUser.
--
-- STORAGE DELETE GUARD: current Supabase Storage installs a `protect_objects_delete` trigger
-- on storage.objects that rejects direct SQL DELETEs (SQLSTATE 42501) unless the
-- transaction-local GUC `storage.allow_delete_query` is 'true' -- the same switch the Storage
-- API itself uses. Without setting it, this trigger would abort EVERY auth.users delete.
-- We enable it transaction-locally (is_local => true) immediately before the DELETE and
-- reset it right after, so the window never outlives this function, let alone the transaction.
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS before CREATE TRIGGER.

CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_removed bigint;
BEGIN
  -- Authorize this transaction's direct storage.objects DELETE (see header note).
  -- set_config/current_setting live in pg_catalog, which is always implicitly searched.
  PERFORM set_config('storage.allow_delete_query', 'true', true);

  DELETE FROM storage.objects
  WHERE bucket_id IN ('resumes', 'ai-archives')
    AND (
      owner = OLD.id
      OR (storage.foldername(name))[1] = OLD.id::text
    );
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  -- Close the window immediately -- nothing after this point may delete storage rows.
  PERFORM set_config('storage.allow_delete_query', 'false', true);
  RAISE NOTICE 'handle_auth_user_deleted: removed % storage object row(s) for user %', v_removed, OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;

CREATE TRIGGER on_auth_user_deleted
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_deleted();

-- Verify: trigger exists and its function is SECURITY DEFINER.
DO $$
DECLARE v_secdef boolean; v_trig integer;
BEGIN
  SELECT prosecdef INTO v_secdef FROM pg_proc
   WHERE proname = 'handle_auth_user_deleted'
     AND pronamespace = 'public'::regnamespace;
  IF v_secdef IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'handle_auth_user_deleted must be SECURITY DEFINER (prosecdef=%)', v_secdef;
  END IF;

  SELECT count(*) INTO v_trig FROM pg_trigger
   WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_deleted';
  IF v_trig <> 1 THEN
    RAISE EXCEPTION 'on_auth_user_deleted trigger not present on auth.users (count=%)', v_trig;
  END IF;

  RAISE NOTICE 'on_auth_user_deleted BEFORE DELETE trigger active; Storage cleanup on both delete paths';
END $$;

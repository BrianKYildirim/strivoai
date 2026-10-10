-- ROLLBACK for 20260719120001_auth_user_delete_cleanup_trigger.sql
--
-- Removes the auth.users Storage-cleanup trigger and its function.
--
-- WARNING: applying this rollback re-opens the gap -- a direct Supabase-Auth-dashboard /
-- auth-admin user deletion will again leave the user's storage.objects rows (resumes +
-- ai-archives) orphaned, since storage.objects has no cascade to auth.users. Only the
-- admin-delete-user edge path would still reclaim Storage. Roll back only if the trigger
-- itself is causing a problem.

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
DROP FUNCTION IF EXISTS public.handle_auth_user_deleted();

-- Verify: both are gone.
DO $$
DECLARE v_trig integer; v_fn integer;
BEGIN
  SELECT count(*) INTO v_trig FROM pg_trigger
   WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_deleted';
  IF v_trig <> 0 THEN
    RAISE EXCEPTION 'on_auth_user_deleted still present after rollback';
  END IF;

  SELECT count(*) INTO v_fn FROM pg_proc
   WHERE proname = 'handle_auth_user_deleted' AND pronamespace = 'public'::regnamespace;
  IF v_fn <> 0 THEN
    RAISE EXCEPTION 'handle_auth_user_deleted still present after rollback';
  END IF;

  RAISE NOTICE 'on_auth_user_deleted trigger + handle_auth_user_deleted function dropped';
END $$;


-- Phase 9 (09-03) multiple_permissive_policies: drop 6 exact-duplicate permissive policies.
DROP POLICY IF EXISTS "Users can delete their own improvement checklists" ON public.improvement_checklist;
DROP POLICY IF EXISTS "Users can manage their own improvement checklists" ON public.improvement_checklist;
DROP POLICY IF EXISTS "Users can view their own improvement checklists"   ON public.improvement_checklist;
DROP POLICY IF EXISTS "Users can update their own improvement checklists" ON public.improvement_checklist;
DROP POLICY IF EXISTS "Users can insert their own resumes" ON public.resumes;
DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;

DO $$
DECLARE v integer;
BEGIN
  SELECT count(*) INTO v FROM pg_policies WHERE schemaname='public' AND (
       (tablename='improvement_checklist' AND policyname IN (
          'Users can delete their own improvement checklists',
          'Users can manage their own improvement checklists',
          'Users can view their own improvement checklists',
          'Users can update their own improvement checklists'))
    OR (tablename='resumes'    AND policyname='Users can insert their own resumes')
    OR (tablename='user_roles' AND policyname='Admins can view all user roles'));
  IF v <> 0 THEN RAISE EXCEPTION 'dedup: % duplicate policy/policies still present', v; END IF;

  SELECT count(*) INTO v FROM pg_policies WHERE schemaname='public' AND (
       (tablename='improvement_checklist' AND policyname IN (
          'Users can delete their own checklist items',
          'Users can create their own checklist items',
          'Users can view their own checklist items',
          'Users can update their own checklist items'))
    OR (tablename='resumes'    AND policyname='Users can create their own resumes')
    OR (tablename='user_roles' AND policyname='Admins can manage user roles'));
  IF v <> 6 THEN RAISE EXCEPTION 'dedup: expected 6 surviving policies, found %', v; END IF;

  RAISE NOTICE 'dedup: 6 exact-duplicate permissive policies dropped; survivors intact';
END $$;
;

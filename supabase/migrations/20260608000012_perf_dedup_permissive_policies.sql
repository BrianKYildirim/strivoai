-- Phase 9 (Plan 09-03) PERF-02 / advisor: multiple_permissive_policies.
-- Consolidate the EXACT-DUPLICATE permissive RLS policies on improvement_checklist,
-- resumes, and user_roles by DROPPING the redundant duplicate of each pair. Postgres
-- OR-combines permissive policies for a (cmd, role): two policies with the IDENTICAL
-- qual/with_check evaluate to `Q OR Q = Q`, so dropping one leaves identical access.
-- This is the strongest (identical-qual) form of OR-equivalence -> provably zero-observable.
--
-- The OR-merge case that needs a DROP+CREATE (upgrade_requests SELECT = admin OR owner,
-- DIFFERENT quals) is DEFERRED to RESIDUAL-REGISTER (higher risk; conservative, per the
-- Phase-8 D-03 grant-altering stance) and is intentionally NOT touched here.
--
-- LIVE-CATALOG FACT (re-confirmed read-only on preview 2026-06-25 via pg_policies):
--   improvement_checklist -- each cmd has TWO permissive {public} policies with IDENTICAL effect:
--     DELETE: "Users can delete their own checklist items"  == "Users can delete their own improvement checklists"  USING (auth.uid() = user_id)
--     INSERT: "Users can create their own checklist items"  == "Users can manage their own improvement checklists"  WITH CHECK (auth.uid() = user_id)
--     SELECT: "Users can view their own checklist items"    == "Users can view their own improvement checklists"     USING (auth.uid() = user_id)
--     UPDATE: "Users can update their own checklist items"  == "Users can update their own improvement checklists"   USING (auth.uid() = user_id)
--   resumes -- INSERT has TWO permissive {public} policies with IDENTICAL effect:
--     "Users can create their own resumes" == "Users can insert their own resumes"  WITH CHECK (auth.uid() = user_id)
--   user_roles -- SELECT is covered by BOTH an ALL policy and a redundant SELECT-only policy, IDENTICAL qual:
--     "Admins can manage user roles" (cmd ALL, qual has_role(auth.uid(),'admin')) ALREADY covers SELECT;
--     "Admins can view all user roles" (cmd SELECT, qual has_role(auth.uid(),'admin')) is redundant for SELECT.
--
-- Why DROP-of-superseded and NOT DROP+CREATE (per plan 09-03, KEEP the survivor):
--   The survivor of each pair has the IDENTICAL qual/with_check, so SELECT/INSERT/UPDATE/DELETE
--   access is byte-identical after the drop. For user_roles, the ALL policy already grants the
--   admin SELECT, so dropping the SELECT-only policy leaves SELECT served identically by ALL.
--   No new policy is created; this is strictly the removal of a provable duplicate.
--
-- Zero-observable-change: access for every (cmd, role) is unchanged because the surviving
-- policy's predicate is identical to the dropped one's. auth.uid() stays bare here; the
-- companion migration 20260608000013 wraps auth.uid() in (select ...) on the survivors.
--
-- Re-runnability (NFR-01): DROP POLICY IF EXISTS is idempotent on re-apply.

-- == FORWARD ====================================================================
-- improvement_checklist: drop the 4 "improvement checklists"-named duplicates (keep "checklist items").
DROP POLICY IF EXISTS "Users can delete their own improvement checklists" ON public.improvement_checklist;
DROP POLICY IF EXISTS "Users can manage their own improvement checklists" ON public.improvement_checklist;
DROP POLICY IF EXISTS "Users can view their own improvement checklists"   ON public.improvement_checklist;
DROP POLICY IF EXISTS "Users can update their own improvement checklists" ON public.improvement_checklist;
-- resumes: drop the duplicate INSERT policy (keep "Users can create their own resumes").
DROP POLICY IF EXISTS "Users can insert their own resumes" ON public.resumes;
-- user_roles: drop the redundant SELECT-only policy (the ALL policy already covers admin SELECT).
DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;

-- == VERIFICATION (read-only assertions) =======================================
-- Assert each dropped duplicate is gone AND its identical-qual survivor remains.
DO $$
DECLARE v integer;
BEGIN
  -- the 6 dropped duplicates must be ABSENT
  SELECT count(*) INTO v FROM pg_policies WHERE schemaname='public' AND (
       (tablename='improvement_checklist' AND policyname IN (
          'Users can delete their own improvement checklists',
          'Users can manage their own improvement checklists',
          'Users can view their own improvement checklists',
          'Users can update their own improvement checklists'))
    OR (tablename='resumes'    AND policyname='Users can insert their own resumes')
    OR (tablename='user_roles' AND policyname='Admins can view all user roles'));
  IF v <> 0 THEN RAISE EXCEPTION 'dedup: % duplicate policy/policies still present', v; END IF;

  -- the 6 identical-qual survivors must REMAIN
  SELECT count(*) INTO v FROM pg_policies WHERE schemaname='public' AND (
       (tablename='improvement_checklist' AND policyname IN (
          'Users can delete their own checklist items',
          'Users can create their own checklist items',
          'Users can view their own checklist items',
          'Users can update their own checklist items'))
    OR (tablename='resumes'    AND policyname='Users can create their own resumes')
    OR (tablename='user_roles' AND policyname='Admins can manage user roles'));
  IF v <> 6 THEN RAISE EXCEPTION 'dedup: expected 6 surviving policies, found %', v; END IF;

  RAISE NOTICE 'dedup: 6 exact-duplicate permissive policies dropped; identical-qual survivors intact';
END $$;

-- == ROLLBACK (DB-06) ==========================================================
-- Faithfully re-creates the 6 dropped duplicates EXACTLY as captured read-only from
-- pg_policies (role public, bare auth.uid(), same cmd). Apply in any order; each is a
-- pure duplicate so the restored state is identical to pre-migration.
--   CREATE POLICY "Users can delete their own improvement checklists" ON public.improvement_checklist
--     FOR DELETE TO public USING (auth.uid() = user_id);
--   CREATE POLICY "Users can manage their own improvement checklists" ON public.improvement_checklist
--     FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
--   CREATE POLICY "Users can view their own improvement checklists" ON public.improvement_checklist
--     FOR SELECT TO public USING (auth.uid() = user_id);
--   CREATE POLICY "Users can update their own improvement checklists" ON public.improvement_checklist
--     FOR UPDATE TO public USING (auth.uid() = user_id);
--   CREATE POLICY "Users can insert their own resumes" ON public.resumes
--     FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
--   CREATE POLICY "Admins can view all user roles" ON public.user_roles
--     FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));

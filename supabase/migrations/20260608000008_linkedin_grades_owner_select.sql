-- DB-05 (Plan 08-04, D-03 grant-altering / VERIFY-THEN-APPLY tier): scope linkedin_grades
-- SELECT to the owning user by DROPPING the over-permissive "Anyone can view linkedin grades"
-- public policy. Sequences the pre-authored Phase-7.1 RUN-06 handoff
-- (.planning/audit/RUNTIME-RELIABILITY.md, RUN-06) with a real, post-HEAD timestamp.
--
-- Symptom (advisor: over-permissive RLS / multiple_permissive_policies, HIGH severity):
--   public.linkedin_grades carries an over-permissive SELECT policy named
--   "Anyone can view linkedin grades" granted to role `public` with qual USING (true) --
--   exposing every user's LinkedIn grade to any caller (cross-user read). This is the
--   highest-severity over-permissive finding in the DB-05 set.
--
-- LIVE-CATALOG FACT (re-confirmed read-only on preview AND prod, identical):
--   public.linkedin_grades has EXACTLY TWO SELECT policies, BOTH role {public}:
--     1. "Anyone can view linkedin grades"           cmd=SELECT roles={public} qual=true
--          <- the over-permissive target this migration DROPs.
--     2. "Users can view their own LinkedIn grades"  cmd=SELECT roles={public} qual=(auth.uid() = user_id)
--          <- the LEGITIMATE, PRE-EXISTING owner policy. This migration LEAVES IT IN PLACE.
--   Because two SELECT policies OR-combine, the permissive (1) currently supersedes the
--   owner-scoped (2) -> any caller reads all rows. Dropping (1) leaves (2) as the sole SELECT
--   policy, which already owner-scopes the read.
--
-- Why NO CREATE (minimal fix -- strictly better than re-creating an owner policy):
--   The pre-existing "Users can view their own LinkedIn grades" ALREADY scopes SELECT to the
--   owner: role public + qual auth.uid() = user_id is functionally owner-only -- an anon caller's
--   auth.uid() is NULL so it matches no row, and an authenticated caller sees only their own rows.
--   This is the idiomatic Supabase owner-scoping pattern (same shape used by profiles/resumes/etc.)
--   and triggers NO over-permissive advisor. Creating a SECOND redundant owner policy would (a)
--   leave TWO owner SELECT policies -> multiple_permissive_policies for linkedin_grades stays lit,
--   and (b) add surface for no benefit. The correct fix is JUST the DROP. End-state: linkedin_grades
--   SELECT is served by the single owner-scoped "Users can view their own LinkedIn grades"
--   (over-permissive REMOVED; 2 SELECT policies -> 1).
--
-- D-08 live-state re-confirmation (author-time ground truth):
--   Plan 08-01's read-only canonical-prod re-pull (zjpjapgraoxdukdvpjes, 2026-06-24) and a fresh
--   preview re-read CONFIRMED the LIVE permissive policy is still "Anyone can view linkedin grades"
--   (cmd SELECT, roles {public}, qual true) -- Open-Question-1 outcome (i): a REAL fix, not a no-op.
--   The operator re-confirms the live policy name/qual via a fresh pg_policies read immediately
--   before applying (D-08); the DROP POLICY IF EXISTS is idempotent, so a name mismatch is a no-op.
--
-- D-03 read-map (why this grant change is zero-observable-change for every live caller):
--   FE reads are ALL owner-scoped, so each is served identically by the pre-existing owner-scoped
--   SELECT policy after the public one is dropped:
--     - src/pages/LinkedInGrader.tsx:214 queries by `id` only and relies on RLS to auto-scope to
--       auth.uid() = user_id (see the :201 comment); the owner-scoped policy still returns the
--       owner's own row, and a not-found/RLS-blocked id already falls back to a toast.
--     - src/pages/AnalysisHistory.tsx:223, src/pages/Dashboard.tsx:284,
--       src/components/PriorLinkedInSelector.tsx:91, src/components/AnalysisComparisonModal.tsx:281
--       all filter explicitly by .eq('user_id', <the user's own id>).
--   App/service reads BYPASS RLS (service_role): grade-linkedin, analyze-career,
--   extract-analysis-structure/extract-linkedin, lifecycle-archive-writer, send-feature-email,
--   admin-delete-user all read/write via getServiceClient() (service_role bypasses RLS, so the
--   policy change is invisible to them).
--   => NO live caller depends on the cross-user/public SELECT grant. Owner-scoping is
--      zero-observable-change for owners and correctly DENIES the cross-user read.
--
-- Re-runnability (NFR-01): DROP POLICY IF EXISTS is idempotent on re-apply.

-- ── FORWARD ───────────────────────────────────────────────────────────────────
-- Remove ONLY the over-permissive public SELECT. The pre-existing owner-scoped
-- "Users can view their own LinkedIn grades" (public, auth.uid() = user_id) remains and
-- becomes the sole SELECT policy. NO new policy is created (it pre-exists).
DROP POLICY IF EXISTS "Anyone can view linkedin grades" ON public.linkedin_grades;

-- ── VERIFICATION (read-only assertion: no UNSCOPED public SELECT remains) ───────
-- Assert no SELECT policy with qual = true (USING (true)) survives -- NOT "no public SELECT at
-- all" (the legitimate owner policy is correctly role public with an auth.uid() = user_id qual).
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'linkedin_grades'
     AND cmd = 'SELECT'
     AND qual = 'true';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'linkedin_grades still has an unscoped (USING true) SELECT policy (found %)', v_count;
  END IF;
  RAISE NOTICE 'linkedin_grades SELECT is owner-scoped; no unscoped public SELECT remains';
END $$;

-- ── ROLLBACK (DB-06 / D-08) ───────────────────────────────────────────────────
-- Faithfully restores the LIVE prior policy re-confirmed in Plan 08-01 + the fresh preview read:
-- name "Anyone can view linkedin grades", cmd SELECT, role public, USING (true). This migration
-- creates no new policy and does not touch "Users can view their own LinkedIn grades", so the
-- rollback is a single CREATE.
--   CREATE POLICY "Anyone can view linkedin grades"
--     ON public.linkedin_grades
--     FOR SELECT
--     TO public
--     USING (true);

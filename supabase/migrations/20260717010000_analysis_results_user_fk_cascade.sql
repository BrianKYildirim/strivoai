-- Quick task 260716-qtt (2026-07-17)
--
-- DEFECT: prod postgres logs ~770 failed INSERTs/day -- a batch of 8 violations of
-- resume_versions_user_id_fkey / linkedin_versions_user_id_fkey every 15 minutes,
-- indefinitely. The same 8 rows are retried forever and never drain.
--
-- ROOT CAUSE: public.analysis_results is the ONLY user-owned table with NO foreign key to
-- auth.users -- in fact it has no FK constraints at all. Every sibling table cascades
-- (profiles_id_fkey is ON DELETE CASCADE, and the orphaned users have zero surviving rows
-- in profiles / resumes / linkedin_grades / usage_tracking). So when a user is deleted,
-- their analysis_results rows OUTLIVE the user. The extract_catchup_nightly cron job (which
-- actually runs */15, not nightly) calls extract-analysis-structure -> runCatchup, which
-- scans the oldest analysis_results and backfills resume_versions / linkedin_versions.
-- Those child tables DO have a user_id FK to auth.users, so every backfill attempt for an
-- orphan row dies on *_user_id_fkey, forever.
--
-- This is not only log noise. run_lifecycle_sweep Block 1a only sets archive_path when a
-- matching resume_versions/linkedin_versions row EXISTS, and Block 1b only deletes rows
-- with archive_path IS NOT NULL AND raw_response IS NULL. An orphan can never have a
-- version row (the FK forbids it), so it is never archived and never deleted: deleted
-- users' raw AI response blobs live on forever, permanently outside the retention policy.
-- Deleting them is a retention/privacy fix, not just log hygiene.
--
-- Note: admin-delete-user is NOT the culprit -- it deletes analysis_results explicitly
-- (index.ts:69). The orphans came from some other deletion path (Supabase dashboard / auth
-- admin API); because profiles cascades, that path leaves no forensic trace and cannot be
-- identified retroactively. We do not claim which path it was -- the FK below fixes it
-- structurally regardless of origin.
--
-- FIX (order matters -- cleanup MUST precede the FK or ADD CONSTRAINT will not validate):
--   1. Delete the existing orphans (rows whose user_id has no auth.users row).
--   2. Add analysis_results_user_id_fkey -> auth.users(id) ON DELETE CASCADE so no future
--      deletion path can ever recreate the condition.
--
-- Scope guard: step 1 deletes ONLY rows with no surviving auth.users row. Live users' rows
-- are never touched. Orphan rows are already unreachable by every user-facing feature (RLS
-- keys on user_id and the user is gone), and run_benchmarks_rollup does not read
-- analysis_results, so removing them cannot skew benchmarks.
--
-- No index is added: two indexes already cover analysis_results.user_id, which is
-- sufficient for the FK's referential-integrity checks.

-- 1. Remove orphaned rows (no surviving auth.users row).
DELETE FROM public.analysis_results ar
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id = ar.user_id
);

-- 2. Add the cascading FK so deleting a user reaps their analysis_results.
ALTER TABLE public.analysis_results
  ADD CONSTRAINT analysis_results_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Verify: zero orphans remain AND the constraint exists with ON DELETE CASCADE.
DO $$
DECLARE v_orphans integer; v_deltype "char";
BEGIN
  SELECT count(*) INTO v_orphans
  FROM public.analysis_results ar
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = ar.user_id);
  IF v_orphans <> 0 THEN
    RAISE EXCEPTION 'analysis_results: % orphan row(s) still reference a deleted user', v_orphans;
  END IF;

  SELECT confdeltype INTO v_deltype
  FROM pg_constraint
  WHERE conname = 'analysis_results_user_id_fkey'
    AND conrelid = 'public.analysis_results'::regclass
    AND contype = 'f';
  IF v_deltype IS NULL THEN
    RAISE EXCEPTION 'analysis_results_user_id_fkey was not created';
  END IF;
  IF v_deltype <> 'c' THEN
    RAISE EXCEPTION 'analysis_results_user_id_fkey must be ON DELETE CASCADE (confdeltype=%)', v_deltype;
  END IF;

  RAISE NOTICE 'analysis_results: orphans purged; user_id FK -> auth.users ON DELETE CASCADE active';
END $$;

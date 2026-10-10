-- ROLLBACK for 20260717010000_analysis_results_user_fk_cascade.sql
--
-- Drops the cascading FK, restoring analysis_results to its previous state of having no FK
-- constraints at all.
--
-- WARNING: this rollback is PARTIAL BY NATURE and the forward migration is NOT fully
-- reversible. The DELETE of orphaned rows is irreversible -- those rows belonged to users
-- that no longer exist in auth.users, so they could not be re-inserted even in principle
-- (the FK aside, there is no source to restore them from). Take a backup of
-- public.analysis_results BEFORE applying the forward migration if that data may be needed.
--
-- WARNING: applying this rollback re-opens the defect. Any future user deletion via a path
-- that does not explicitly delete analysis_results (Supabase dashboard / auth admin API)
-- will again strand rows, which the */15 extract_catchup_nightly cron will retry forever
-- against resume_versions_user_id_fkey / linkedin_versions_user_id_fkey, and whose
-- raw_response blobs will again escape the run_lifecycle_sweep retention policy.
-- Only roll back if the FK itself is causing a worse problem (e.g. it blocks a user-deletion
-- path that must not cascade).

ALTER TABLE public.analysis_results
  DROP CONSTRAINT IF EXISTS analysis_results_user_id_fkey;

-- Verify: the constraint is gone.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_constraint
  WHERE conname = 'analysis_results_user_id_fkey'
    AND conrelid = 'public.analysis_results'::regclass;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'analysis_results_user_id_fkey still present after rollback';
  END IF;

  RAISE NOTICE 'analysis_results_user_id_fkey dropped (orphan DELETE is NOT reversed)';
END $$;

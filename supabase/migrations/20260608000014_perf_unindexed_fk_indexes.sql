-- Phase 9 (Plan 09-03) PERF-02 / advisor: unindexed_foreign_keys.
-- Add ADDITIVE covering b-tree indexes for the 8 foreign-key columns that lack one, so
-- FK lookups and ON DELETE/UPDATE referential checks do not seq-scan the child table.
-- Purely additive: an index changes NO query result, only the plan -> zero-observable.
--
-- LIVE-CATALOG FACT (re-confirmed read-only on preview 2026-06-25 via pg_constraint/pg_index;
-- exactly the 8 the performance advisor flagged -- the user_id / jd_id / source_analysis_results_id
-- FKs on these tables already have covering indexes and are NOT included):
--   applications.linkedin_version_id        (applications_linkedin_version_id_fkey)
--   applications.resume_version_id          (applications_resume_version_id_fkey)
--   interview_quizzes.resume_id             (interview_quizzes_resume_id_fkey)
--   linkedin_versions.linkedin_grade_id     (linkedin_versions_linkedin_grade_id_fkey)
--   linkedin_versions.supersedes_id         (linkedin_versions_supersedes_id_fkey)
--   resume_score_history.resume_id          (resume_score_history_resume_id_fkey)
--   resume_versions.resume_id               (resume_versions_resume_id_fkey)
--   resume_versions.supersedes_id           (resume_versions_supersedes_id_fkey)
--
-- Re-runnability (NFR-01): CREATE INDEX IF NOT EXISTS is idempotent on re-apply. (Plain
-- CREATE INDEX, not CONCURRENTLY: these are small tables and CONCURRENTLY cannot run inside
-- a migration transaction; rollback is a matching DROP INDEX.)

-- == FORWARD ====================================================================
CREATE INDEX IF NOT EXISTS idx_applications_linkedin_version_id   ON public.applications(linkedin_version_id);
CREATE INDEX IF NOT EXISTS idx_applications_resume_version_id     ON public.applications(resume_version_id);
CREATE INDEX IF NOT EXISTS idx_interview_quizzes_resume_id        ON public.interview_quizzes(resume_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_versions_linkedin_grade_id ON public.linkedin_versions(linkedin_grade_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_versions_supersedes_id    ON public.linkedin_versions(supersedes_id);
CREATE INDEX IF NOT EXISTS idx_resume_score_history_resume_id     ON public.resume_score_history(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_versions_resume_id          ON public.resume_versions(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_versions_supersedes_id      ON public.resume_versions(supersedes_id);

-- == VERIFICATION (read-only assertion: all 8 covering indexes exist) ===========
DO $$
DECLARE v integer;
BEGIN
  SELECT count(*) INTO v
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname IN (
       'idx_applications_linkedin_version_id',
       'idx_applications_resume_version_id',
       'idx_interview_quizzes_resume_id',
       'idx_linkedin_versions_linkedin_grade_id',
       'idx_linkedin_versions_supersedes_id',
       'idx_resume_score_history_resume_id',
       'idx_resume_versions_resume_id',
       'idx_resume_versions_supersedes_id');
  IF v <> 8 THEN RAISE EXCEPTION 'unindexed_foreign_keys: expected 8 covering indexes, found %', v; END IF;
  RAISE NOTICE 'unindexed_foreign_keys: 8 additive covering indexes present';
END $$;

-- == ROLLBACK (DB-06) ==========================================================
-- Drops the 8 additive indexes created above (no data/behavior impact).
--   DROP INDEX IF EXISTS public.idx_applications_linkedin_version_id;
--   DROP INDEX IF EXISTS public.idx_applications_resume_version_id;
--   DROP INDEX IF EXISTS public.idx_interview_quizzes_resume_id;
--   DROP INDEX IF EXISTS public.idx_linkedin_versions_linkedin_grade_id;
--   DROP INDEX IF EXISTS public.idx_linkedin_versions_supersedes_id;
--   DROP INDEX IF EXISTS public.idx_resume_score_history_resume_id;
--   DROP INDEX IF EXISTS public.idx_resume_versions_resume_id;
--   DROP INDEX IF EXISTS public.idx_resume_versions_supersedes_id;

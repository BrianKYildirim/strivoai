
-- Phase 9 (09-03) unindexed_foreign_keys: 8 additive covering indexes.
CREATE INDEX IF NOT EXISTS idx_applications_linkedin_version_id   ON public.applications(linkedin_version_id);
CREATE INDEX IF NOT EXISTS idx_applications_resume_version_id     ON public.applications(resume_version_id);
CREATE INDEX IF NOT EXISTS idx_interview_quizzes_resume_id        ON public.interview_quizzes(resume_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_versions_linkedin_grade_id ON public.linkedin_versions(linkedin_grade_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_versions_supersedes_id    ON public.linkedin_versions(supersedes_id);
CREATE INDEX IF NOT EXISTS idx_resume_score_history_resume_id     ON public.resume_score_history(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_versions_resume_id          ON public.resume_versions(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_versions_supersedes_id      ON public.resume_versions(supersedes_id);

DO $$
DECLARE v integer;
BEGIN
  SELECT count(*) INTO v FROM pg_indexes
   WHERE schemaname='public' AND indexname IN (
     'idx_applications_linkedin_version_id','idx_applications_resume_version_id',
     'idx_interview_quizzes_resume_id','idx_linkedin_versions_linkedin_grade_id',
     'idx_linkedin_versions_supersedes_id','idx_resume_score_history_resume_id',
     'idx_resume_versions_resume_id','idx_resume_versions_supersedes_id');
  IF v <> 8 THEN RAISE EXCEPTION 'unindexed_foreign_keys: expected 8 covering indexes, found %', v; END IF;
  RAISE NOTICE 'unindexed_foreign_keys: 8 additive covering indexes present';
END $$;
;

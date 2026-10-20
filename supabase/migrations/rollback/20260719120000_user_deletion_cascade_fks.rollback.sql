-- ROLLBACK for 20260719120000_user_deletion_cascade_fks.sql
--
-- Drops the cascading user_id -> auth.users FKs added by the forward migration, restoring
-- the prior state: the six previously-FK-less tables (scheduled_emails, user_achievements,
-- upgrade_requests, analysis_jobs, resume_score_history, improvement_checklist) return to
-- having NO auth.users FK; linkedin_grades' original NON-cascade FK is re-added.
--
-- WARNING: this rollback is PARTIAL BY NATURE. The forward migration's orphan-row DELETE is
-- IRREVERSIBLE -- those rows belonged to users that no longer exist in auth.users and cannot
-- be re-inserted from any source. Take a backup of the affected tables BEFORE applying the
-- forward migration if that data may be needed.
--
-- WARNING: applying this rollback re-opens the defect -- a direct Auth-dashboard/auth-admin
-- deletion will again strand these tables' rows (privacy/retention leak). Only roll back if a
-- cascade FK is itself causing a worse problem (e.g. blocking a delete path that must not
-- cascade).

DO $$
DECLARE
  t text;
  drop_tables text[] := ARRAY[
    'linkedin_grades',
    'scheduled_emails',
    'user_achievements',
    'upgrade_requests',
    'analysis_jobs',
    'resume_score_history',
    'improvement_checklist'
  ];
BEGIN
  FOREACH t IN ARRAY drop_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_user_id_fkey');
      RAISE NOTICE '%: dropped %_user_id_fkey', t, t;
    END IF;
  END LOOP;

  -- Restore linkedin_grades' original NON-cascade FK (best-effort; matches prior behavior of
  -- a plain FK with no cascade). Skipped if the column/table is absent.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'linkedin_grades' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.linkedin_grades
      ADD CONSTRAINT linkedin_grades_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id);
    RAISE NOTICE 'linkedin_grades: restored non-cascade user_id FK';
  END IF;
END $$;

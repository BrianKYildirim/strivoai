-- Quick task 260719-plu (2026-07-19)
--
-- PURPOSE: Make DB-level ON DELETE CASCADE the single source of truth for user
-- deletion. Several user-owned public tables have NO cascade FK to auth.users, so a
-- direct Supabase-Auth-dashboard delete (or any path other than admin-delete-user's
-- hand-written list) orphans their rows forever:
--   linkedin_grades (has a NON-cascade FK -> must be dropped + re-added with CASCADE),
--   scheduled_emails, user_achievements, upgrade_requests, analysis_jobs,
--   resume_score_history, improvement_checklist (all: user_id column, no auth.users FK).
--
-- After this migration EVERY user-owned table cascades from auth.users, so deleting the
-- auth row (via admin-delete-user OR the Auth dashboard) reaps every connected row.
--
-- SCOPE GUARD (requirement 6 -- no collateral): the orphan purge deletes ONLY rows whose
-- user_id is NON-NULL and has NO surviving auth.users row. Live users' rows are never
-- touched. linkedin_grades.user_id is NULLABLE -- genuinely-null rows are left alone (the
-- WHERE user_id IS NOT NULL guard). Deletion is scoped strictly by user id, never by email.
--
-- IDEMPOTENT / RE-RUNNABLE: each table is guarded by table-exists + column-exists checks;
-- ANY pre-existing user_id -> auth.users FK (any name, any deltype, including this
-- migration's own canonical <t>_user_id_fkey on a re-run) is dropped before the canonical
-- cascading FK is (re-)added, and the cascade is asserted at the end.
--
-- NOTE: the definitive gap list must be confirmed against the LIVE schema (see the audit
-- query in the SUMMARY). This migration closes the 7 statically-identified gaps; the
-- per-table guards make it a no-op-shaped safe re-add for any table that already cascades,
-- and a clean skip for any table that does not exist / lacks user_id in a given environment.

DO $$
DECLARE
  t text;
  gap_tables text[] := ARRAY[
    'linkedin_grades',
    'scheduled_emails',
    'user_achievements',
    'upgrade_requests',
    'analysis_jobs',
    'resume_score_history',
    'improvement_checklist'
  ];
  con record;
  v_deltype "char";
  v_purged bigint;
BEGIN
  FOREACH t IN ARRAY gap_tables LOOP
    -- Guard 1: table must exist in this environment.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'skip %: table not present in public schema', t;
      CONTINUE;
    END IF;

    -- Guard 2: table must have a user_id column.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id'
    ) THEN
      RAISE NOTICE 'skip %: no user_id column', t;
      CONTINUE;
    END IF;

    -- 1. Purge ONLY already-orphaned rows (non-null user_id with no auth.users match).
    --    Never deletes a row whose user_id maps to a live user; NULLs are left alone.
    EXECUTE format(
      'DELETE FROM public.%I x
         WHERE x.user_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = x.user_id)', t);
    GET DIAGNOSTICS v_purged = ROW_COUNT;
    IF v_purged > 0 THEN
      RAISE NOTICE '%: purged % orphan row(s)', t, v_purged;
    END IF;

    -- 2. Drop ANY existing single-column user_id FK to auth.users (any name / any deltype),
    --    including this migration's own canonical constraint on a re-run.
    FOR con IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.conrelid = ('public.' || t)::regclass
        AND c.contype = 'f'
        AND c.confrelid = 'auth.users'::regclass
        AND array_length(c.conkey, 1) = 1
        AND (
          SELECT a.attname FROM pg_attribute a
          WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        ) = 'user_id'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, con.conname);
      RAISE NOTICE '%: dropped pre-existing user_id FK %', t, con.conname;
    END LOOP;

    -- 3. Add the canonical cascading FK.
    EXECUTE format(
      'ALTER TABLE public.%I
         ADD CONSTRAINT %I FOREIGN KEY (user_id)
         REFERENCES auth.users(id) ON DELETE CASCADE',
      t, t || '_user_id_fkey');

    -- 4. Assert the cascade is active.
    SELECT confdeltype INTO v_deltype
    FROM pg_constraint
    WHERE conname = t || '_user_id_fkey'
      AND conrelid = ('public.' || t)::regclass
      AND contype = 'f';
    IF v_deltype IS DISTINCT FROM 'c' THEN
      RAISE EXCEPTION '%: user_id FK is not ON DELETE CASCADE (confdeltype=%)', t, v_deltype;
    END IF;

    RAISE NOTICE '%: user_id FK -> auth.users ON DELETE CASCADE active', t;
  END LOOP;

  RAISE NOTICE 'user_deletion_cascade_fks: all present gap tables now cascade from auth.users';
END $$;

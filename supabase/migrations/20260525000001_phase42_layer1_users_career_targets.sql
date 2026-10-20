-- Phase 42 · Layer 1 · DB-USR-01/02/03 · DB-TGT-01/02
-- Users + Career Targets foundation.
--
-- Down migration (manual roll-forward rollback, do not run automatically):
--   BEGIN;
--   ALTER TABLE public.profiles
--     ADD COLUMN IF NOT EXISTS target_roles text[] DEFAULT ARRAY[]::text[],
--     ADD COLUMN IF NOT EXISTS career_interests text[] DEFAULT ARRAY[]::text[];
--   UPDATE public.profiles p
--      SET target_roles = COALESCE(ct.target_roles, ARRAY[]::text[]),
--          career_interests = COALESCE(ct.target_industries, ARRAY[]::text[])
--     FROM public.career_targets ct
--    WHERE ct.user_id = p.id;
--   DROP VIEW IF EXISTS public.cohort_peers;
--   DROP INDEX IF EXISTS public.idx_profiles_cohort_key;
--   DROP INDEX IF EXISTS public.idx_career_targets_industries_gin;
--   DROP INDEX IF EXISTS public.idx_career_targets_roles_gin;
--   DROP TABLE IF EXISTS public.career_targets;
--   ALTER TABLE public.profiles
--     DROP COLUMN IF EXISTS school,
--     DROP COLUMN IF EXISTS major,
--     DROP COLUMN IF EXISTS year,
--     DROP COLUMN IF EXISTS graduation_year,
--     DROP COLUMN IF EXISTS location_preference;
--   COMMIT;
--
-- Forward migration sequence:
--   1. Add nullable education columns to profiles.
--   2. Create career_targets with user-scoped RLS and updated_at trigger.
--   3. Backfill from legacy profiles.target_roles/career_interests when present.
--   4. Drop legacy profiles.target_roles/career_interests.
--   5. Add cohort indexes and cohort_peers view.
--   6. Document user-PII contract and verify all artifacts.

-- 1. Education columns -------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS school text NULL,
  ADD COLUMN IF NOT EXISTS major text NULL,
  ADD COLUMN IF NOT EXISTS year text NULL,
  ADD COLUMN IF NOT EXISTS graduation_year integer NULL,
  ADD COLUMN IF NOT EXISTS location_preference text NULL;

-- 2. Career targets table + RLS --------------------------------------------

CREATE TABLE IF NOT EXISTS public.career_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE
    REFERENCES auth.users(id) ON DELETE CASCADE,
  target_industries text[] NOT NULL DEFAULT ARRAY[]::text[],
  target_roles text[] NOT NULL DEFAULT ARRAY[]::text[],
  target_companies text[] NOT NULL DEFAULT ARRAY[]::text[],
  location_preference text NULL,
  career_goals text NULL
    CHECK (career_goals IS NULL OR length(career_goals) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.career_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS career_targets_select_own ON public.career_targets;
CREATE POLICY career_targets_select_own
  ON public.career_targets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS career_targets_insert_own ON public.career_targets;
CREATE POLICY career_targets_insert_own
  ON public.career_targets
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS career_targets_update_own ON public.career_targets;
CREATE POLICY career_targets_update_own
  ON public.career_targets
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_career_targets_updated_at ON public.career_targets;
CREATE TRIGGER update_career_targets_updated_at
  BEFORE UPDATE ON public.career_targets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Backfill from legacy profile columns ----------------------------------

CREATE TEMP TABLE phase42_l1_backfill_source (
  user_id uuid PRIMARY KEY,
  target_roles text[] NOT NULL DEFAULT ARRAY[]::text[],
  target_industries text[] NOT NULL DEFAULT ARRAY[]::text[]
) ON COMMIT DROP;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'target_roles'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'career_interests'
  ) THEN
    EXECUTE $sql$
      INSERT INTO phase42_l1_backfill_source (
        user_id,
        target_roles,
        target_industries
      )
      SELECT
        id,
        COALESCE(target_roles, ARRAY[]::text[]),
        COALESCE(career_interests, ARRAY[]::text[])
      FROM public.profiles
      WHERE (
        target_roles IS NOT NULL
        AND array_length(target_roles, 1) > 0
      )
      OR (
        career_interests IS NOT NULL
        AND array_length(career_interests, 1) > 0
      )
    $sql$;
  END IF;
END
$$;

INSERT INTO public.career_targets (
  user_id,
  target_roles,
  target_industries
)
SELECT
  user_id,
  target_roles,
  target_industries
FROM phase42_l1_backfill_source
ON CONFLICT (user_id) DO NOTHING;

-- 4. Drop legacy profile columns -------------------------------------------

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS target_roles,
  DROP COLUMN IF EXISTS career_interests;

-- 5. Cohort query helpers ---------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_profiles_cohort_key
  ON public.profiles (school, year, major)
  WHERE school IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_career_targets_industries_gin
  ON public.career_targets USING GIN (target_industries);

CREATE INDEX IF NOT EXISTS idx_career_targets_roles_gin
  ON public.career_targets USING GIN (target_roles);

DROP VIEW IF EXISTS public.cohort_peers;
CREATE VIEW public.cohort_peers
WITH (security_invoker = true)
AS
SELECT
  p.id AS user_id,
  p.school,
  p.major,
  p.year,
  p.graduation_year,
  ct.target_industries,
  ct.target_roles,
  ct.target_companies,
  ct.location_preference
FROM public.profiles p
LEFT JOIN public.career_targets ct ON ct.user_id = p.id
WHERE p.school IS NOT NULL;

-- 6. Documentation ----------------------------------------------------------

COMMENT ON TABLE public.career_targets IS
  'Phase 42 Layer 1 DB-TGT-01: per-user career target profile. User-PII tier; reads and writes are scoped by RLS to auth.uid() = user_id and rows cascade on account deletion.';
COMMENT ON COLUMN public.profiles.school IS
  'Phase 42 Layer 1 DB-USR-01: optional user-PII education context used for cohort benchmarks.';
COMMENT ON COLUMN public.profiles.major IS
  'Phase 42 Layer 1 DB-USR-01: optional user-PII education context used for cohort benchmarks.';
COMMENT ON COLUMN public.profiles.year IS
  'Phase 42 Layer 1 DB-USR-01: optional user-PII school year value used for cohort benchmarks.';
COMMENT ON COLUMN public.profiles.graduation_year IS
  'Phase 42 Layer 1 DB-USR-01: optional user-PII graduation year used for cohort benchmarks.';
COMMENT ON COLUMN public.profiles.location_preference IS
  'Phase 42 Layer 1 DB-USR-01: optional user-PII location preference for cohort and target matching.';
COMMENT ON COLUMN public.career_targets.user_id IS
  'Career target owner. UNIQUE enforces one target row per user; FK cascades on auth.users delete.';
COMMENT ON COLUMN public.career_targets.target_industries IS
  'Target industries. Backfilled from legacy profiles.career_interests.';
COMMENT ON COLUMN public.career_targets.target_roles IS
  'Target roles. Backfilled from legacy profiles.target_roles.';
COMMENT ON COLUMN public.career_targets.target_companies IS
  'Optional target companies supplied by the user.';
COMMENT ON COLUMN public.career_targets.location_preference IS
  'Optional target-location preference scoped to the career target row.';
COMMENT ON COLUMN public.career_targets.career_goals IS
  'Optional freeform career goals, capped at 500 characters.';
COMMENT ON VIEW public.cohort_peers IS
  'Phase 42 Layer 1 DB-USR-03: RLS-preserving cohort helper joining profiles education context to career targets for downstream benchmark queries.';

-- 7. Verification -----------------------------------------------------------

DO $$
DECLARE
  v_profile_column_count integer;
  v_legacy_column_count integer;
  v_career_target_column_count integer;
  v_unique_user_constraint_count integer;
  v_policy_count integer;
  v_auth_uid_policy_count integer;
  v_index_count integer;
  v_view_count integer;
  v_missing_backfill_count integer;
BEGIN
  SELECT count(*) INTO v_profile_column_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND is_nullable = 'YES'
    AND (
      (column_name = 'school' AND data_type = 'text')
      OR (column_name = 'major' AND data_type = 'text')
      OR (column_name = 'year' AND data_type = 'text')
      OR (column_name = 'graduation_year' AND data_type = 'integer')
      OR (column_name = 'location_preference' AND data_type = 'text')
    );

  IF v_profile_column_count <> 5 THEN
    RAISE EXCEPTION 'Phase 42 L1 verification failed: expected 5 nullable profiles education columns, found %', v_profile_column_count;
  END IF;

  SELECT count(*) INTO v_legacy_column_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name IN ('target_roles', 'career_interests');

  IF v_legacy_column_count <> 0 THEN
    RAISE EXCEPTION 'Phase 42 L1 verification failed: legacy profile target columns still exist';
  END IF;

  SELECT count(*) INTO v_career_target_column_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'career_targets';

  IF v_career_target_column_count <> 9 THEN
    RAISE EXCEPTION 'Phase 42 L1 verification failed: public.career_targets expected 9 columns, found %', v_career_target_column_count;
  END IF;

  SELECT count(*) INTO v_unique_user_constraint_count
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'career_targets'
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) LIKE 'UNIQUE (user_id)%';

  IF v_unique_user_constraint_count <> 1 THEN
    RAISE EXCEPTION 'Phase 42 L1 verification failed: career_targets user_id UNIQUE constraint missing';
  END IF;

  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'career_targets'
    AND policyname IN (
      'career_targets_select_own',
      'career_targets_insert_own',
      'career_targets_update_own'
    );

  IF v_policy_count <> 3 THEN
    RAISE EXCEPTION 'Phase 42 L1 verification failed: expected 3 career_targets policies, found %', v_policy_count;
  END IF;

  SELECT count(*) INTO v_auth_uid_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'career_targets'
    AND policyname IN (
      'career_targets_select_own',
      'career_targets_insert_own',
      'career_targets_update_own'
    )
    AND (
      COALESCE(qual, '') LIKE '%auth.uid()%user_id%'
      OR COALESCE(with_check, '') LIKE '%auth.uid()%user_id%'
    );

  IF v_auth_uid_policy_count <> 3 THEN
    RAISE EXCEPTION 'Phase 42 L1 verification failed: career_targets policies are not all scoped to auth.uid() = user_id';
  END IF;

  SELECT count(*) INTO v_index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname IN (
      'idx_profiles_cohort_key',
      'idx_career_targets_industries_gin',
      'idx_career_targets_roles_gin'
    );

  IF v_index_count <> 3 THEN
    RAISE EXCEPTION 'Phase 42 L1 verification failed: expected 3 cohort indexes, found %', v_index_count;
  END IF;

  SELECT count(*) INTO v_view_count
  FROM information_schema.views
  WHERE table_schema = 'public'
    AND table_name = 'cohort_peers';

  IF v_view_count <> 1 THEN
    RAISE EXCEPTION 'Phase 42 L1 verification failed: public.cohort_peers view missing';
  END IF;

  SELECT count(*) INTO v_missing_backfill_count
  FROM phase42_l1_backfill_source s
  LEFT JOIN public.career_targets ct ON ct.user_id = s.user_id
  WHERE ct.user_id IS NULL;

  IF v_missing_backfill_count <> 0 THEN
    RAISE EXCEPTION 'Phase 42 L1 verification failed: % legacy profile rows were not represented in career_targets', v_missing_backfill_count;
  END IF;

  RAISE NOTICE 'Phase 42 Layer 1 users + career_targets verification passed';
END
$$;

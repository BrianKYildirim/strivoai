-- Phase 42 Layer 2: structured resume and LinkedIn versioning tables.
--
-- Down migration, if ever needed:
--   DROP TABLE IF EXISTS public.scores;
--   DROP TABLE IF EXISTS public.resume_bullets;
--   DROP TABLE IF EXISTS public.resume_sections;
--   DROP TABLE IF EXISTS public.linkedin_versions;
--   DROP TABLE IF EXISTS public.resume_versions;
--   DROP FUNCTION IF EXISTS public.auth_owns_version(uuid, text);
--
-- These tables are service-role-write only. Authenticated clients get SELECT
-- access to their own rows through RLS; no INSERT/UPDATE/DELETE policies are
-- created here.

CREATE TABLE IF NOT EXISTS public.resume_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id uuid NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  source_analysis_results_id uuid REFERENCES public.analysis_results(id) ON DELETE SET NULL,
  parsed_summary jsonb,
  overall_score integer,
  supersedes_id uuid REFERENCES public.resume_versions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resume_versions_dedup UNIQUE (user_id, source_analysis_results_id)
);

CREATE TABLE IF NOT EXISTS public.resume_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_version_id uuid NOT NULL REFERENCES public.resume_versions(id) ON DELETE CASCADE,
  section_type text NOT NULL CHECK (section_type IN ('education','experience','projects','leadership','skills')),
  section_score integer,
  section_data jsonb,
  position smallint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resume_bullets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.resume_sections(id) ON DELETE CASCADE,
  original_text text NOT NULL,
  bullet_score integer,
  weakness_category text,
  action_verb_quality text,
  quantified_impact boolean,
  suggested_improvement text,
  position smallint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.linkedin_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_url text NOT NULL,
  profile_identifier text NOT NULL,
  source_analysis_results_id uuid REFERENCES public.analysis_results(id) ON DELETE SET NULL,
  parsed_summary jsonb,
  overall_score integer,
  supersedes_id uuid REFERENCES public.linkedin_versions(id),
  linkedin_grade_id uuid REFERENCES public.linkedin_grades(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT linkedin_versions_dedup UNIQUE (user_id, source_analysis_results_id)
);

CREATE TABLE IF NOT EXISTS public.scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL,
  version_type text NOT NULL CHECK (version_type IN ('resume','linkedin')),
  overall_score integer,
  ats_score integer,
  recruiter_skim_score integer,
  formatting_score integer,
  quantified_impact_score integer,
  keyword_match_score integer,
  role_relevance_score integer,
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scores_unique_per_version UNIQUE (version_id, version_type)
);

ALTER TABLE public.resume_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_bullets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.auth_owns_version(
  p_version_id uuid,
  p_version_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_version_type
    WHEN 'resume' THEN EXISTS (
      SELECT 1
      FROM public.resume_versions
      WHERE id = p_version_id
        AND user_id = auth.uid()
    )
    WHEN 'linkedin' THEN EXISTS (
      SELECT 1
      FROM public.linkedin_versions
      WHERE id = p_version_id
        AND user_id = auth.uid()
    )
    ELSE false
  END
$$;

REVOKE ALL ON FUNCTION public.auth_owns_version(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_owns_version(uuid, text) TO authenticated;

DROP POLICY IF EXISTS resume_versions_select_own ON public.resume_versions;
CREATE POLICY resume_versions_select_own
  ON public.resume_versions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS resume_sections_select_own ON public.resume_sections;
CREATE POLICY resume_sections_select_own
  ON public.resume_sections
  FOR SELECT
  TO authenticated
  USING (
    resume_version_id IN (
      SELECT id
      FROM public.resume_versions
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS resume_bullets_select_own ON public.resume_bullets;
CREATE POLICY resume_bullets_select_own
  ON public.resume_bullets
  FOR SELECT
  TO authenticated
  USING (
    section_id IN (
      SELECT s.id
      FROM public.resume_sections s
      JOIN public.resume_versions v ON v.id = s.resume_version_id
      WHERE v.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS linkedin_versions_select_own ON public.linkedin_versions;
CREATE POLICY linkedin_versions_select_own
  ON public.linkedin_versions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS scores_select_own ON public.scores;
CREATE POLICY scores_select_own
  ON public.scores
  FOR SELECT
  TO authenticated
  USING (public.auth_owns_version(version_id, version_type));

CREATE INDEX IF NOT EXISTS idx_resume_versions_user_resume_created
  ON public.resume_versions (user_id, resume_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_resume_versions_source
  ON public.resume_versions (source_analysis_results_id);

CREATE INDEX IF NOT EXISTS idx_linkedin_versions_user_created
  ON public.linkedin_versions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_linkedin_versions_source
  ON public.linkedin_versions (source_analysis_results_id);

CREATE INDEX IF NOT EXISTS idx_resume_sections_version
  ON public.resume_sections (resume_version_id);

CREATE INDEX IF NOT EXISTS idx_resume_bullets_section
  ON public.resume_bullets (section_id, position);

CREATE INDEX IF NOT EXISTS idx_scores_version
  ON public.scores (version_id, version_type);

COMMENT ON TABLE public.resume_versions IS
  'Phase 42 Layer 2: user-PII structured resume version rows. Service-role writes only; authenticated SELECT is scoped to auth.uid() = user_id.';
COMMENT ON TABLE public.resume_sections IS
  'Phase 42 Layer 2: structured resume sections chained to resume_versions. Service-role writes only; authenticated SELECT is scoped through the parent version.';
COMMENT ON TABLE public.resume_bullets IS
  'Phase 42 Layer 2: structured per-bullet resume signals for downstream recommendations. Service-role writes only; authenticated SELECT is scoped through section and version ownership.';
COMMENT ON TABLE public.linkedin_versions IS
  'Phase 42 Layer 2: per-user LinkedIn re-grade history delta layer (Option A reconciliation). Multiple version rows may reference one per-user linkedin_grades row over time. Service-role writes only.';
COMMENT ON TABLE public.scores IS
  'Phase 42 Layer 2: polymorphic score dimensions for resume_versions and linkedin_versions. Service-role writes only; authenticated SELECT uses auth_owns_version().';

DO $$
DECLARE
  expected_tables text[] := ARRAY[
    'resume_versions',
    'resume_sections',
    'resume_bullets',
    'linkedin_versions',
    'scores'
  ];
  tbl text;
  col_count integer;
  select_policy_count integer;
  write_policy_count integer;
BEGIN
  FOREACH tbl IN ARRAY expected_tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = tbl
    ) THEN
      RAISE EXCEPTION 'Phase 42 L2 verification failed: public.% table missing', tbl;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_class
      WHERE oid = format('public.%I', tbl)::regclass
        AND relrowsecurity = true
    ) THEN
      RAISE EXCEPTION 'Phase 42 L2 verification failed: RLS not enabled on public.%', tbl;
    END IF;

    SELECT count(*) INTO select_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = tbl
      AND cmd = 'SELECT';

    IF select_policy_count <> 1 THEN
      RAISE EXCEPTION 'Phase 42 L2 verification failed: expected 1 SELECT policy on public.%, found %', tbl, select_policy_count;
    END IF;

    SELECT count(*) INTO write_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = tbl
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL');

    IF write_policy_count <> 0 THEN
      RAISE EXCEPTION 'Phase 42 L2 verification failed: expected 0 write policies on public.%, found %', tbl, write_policy_count;
    END IF;
  END LOOP;

  SELECT count(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'resume_versions';
  IF col_count <> 8 THEN
    RAISE EXCEPTION 'Phase 42 L2 verification failed: resume_versions expected 8 columns, found %', col_count;
  END IF;

  SELECT count(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'resume_sections';
  IF col_count <> 7 THEN
    RAISE EXCEPTION 'Phase 42 L2 verification failed: resume_sections expected 7 columns, found %', col_count;
  END IF;

  SELECT count(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'resume_bullets';
  IF col_count <> 10 THEN
    RAISE EXCEPTION 'Phase 42 L2 verification failed: resume_bullets expected 10 columns, found %', col_count;
  END IF;

  SELECT count(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'linkedin_versions';
  IF col_count <> 10 THEN
    RAISE EXCEPTION 'Phase 42 L2 verification failed: linkedin_versions expected 10 columns, found %', col_count;
  END IF;

  SELECT count(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'scores';
  IF col_count <> 11 THEN
    RAISE EXCEPTION 'Phase 42 L2 verification failed: scores expected 11 columns, found %', col_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'auth_owns_version'
      AND prosecdef = true
  ) THEN
    RAISE EXCEPTION 'Phase 42 L2 verification failed: auth_owns_version SECURITY DEFINER function missing';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'idx_resume_versions_user_resume_created',
        'idx_resume_versions_source',
        'idx_linkedin_versions_user_created',
        'idx_linkedin_versions_source',
        'idx_resume_sections_version',
        'idx_resume_bullets_section',
        'idx_scores_version'
      )
  ) <> 7 THEN
    RAISE EXCEPTION 'Phase 42 L2 verification failed: one or more required indexes missing';
  END IF;

  RAISE NOTICE 'Phase 42 Layer 2 versioning verification passed';
END $$;

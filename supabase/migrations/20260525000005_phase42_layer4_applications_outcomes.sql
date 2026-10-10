-- Phase 42 Layer 4: Outcomes + Predictions Foundation
-- REQ-IDs: DB-APP-01, DB-OUT-01, DB-JD-01, DB-BMK-01
-- Depends on: 20260525000002_phase42_layer2_versioning_tables.sql (resume_versions, linkedin_versions)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN MIGRATION (fenced comment — do NOT run without operator sign-off)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- BEGIN;
--
-- -- Re-create saved_jobs from applications (status='saved') before dropping applications
-- CREATE TABLE public.saved_jobs (
--   id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id     uuid NOT NULL,
--   job_id      text,
--   title       text NOT NULL,
--   company     text NOT NULL,
--   location    text,
--   salary      text,
--   url         text,
--   description text,
--   match_score integer,
--   why_match   text,
--   posted      text,
--   created_at  timestamptz NOT NULL DEFAULT now()
-- );
-- INSERT INTO public.saved_jobs (id, user_id, job_id, title, company, location, salary, url, posted, created_at)
-- SELECT id, user_id, jd_id::text, role_applied, company_applied, location, salary, url, posted, created_at
-- FROM public.applications
-- WHERE status = 'saved';
-- ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY saved_jobs_select_own ON public.saved_jobs FOR SELECT USING (auth.uid() = user_id);
-- CREATE POLICY saved_jobs_insert_own ON public.saved_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY saved_jobs_update_own ON public.saved_jobs FOR UPDATE USING (auth.uid() = user_id);
-- CREATE POLICY saved_jobs_delete_own ON public.saved_jobs FOR DELETE USING (auth.uid() = user_id);
-- CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_id ON public.saved_jobs(user_id);
--
-- DROP TABLE IF EXISTS public.benchmarks CASCADE;
-- DROP TABLE IF EXISTS public.outcomes CASCADE;
-- DROP TABLE IF EXISTS public.applications CASCADE;
-- DROP TABLE IF EXISTS public.job_descriptions CASCADE;
--
-- COMMIT;
--
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Security contract:
--   applications: FULL user CRUD (SELECT/INSERT/UPDATE/DELETE) — applications
--     is the documented exception to the service-role-write-only pattern because
--     users must create/update/delete their own application rows from the frontend.
--   outcomes: FULL user CRUD via parent-join on applications.user_id.
--   job_descriptions: SELECT-own only (service-role writes from L2 worker / recruiting-lens).
--   benchmarks: SELECT TO authenticated USING (true) — DOCUMENTED EXCEPTION
--     T-42-BENCHMARKS (aggregate-only data; sample_size >= 5 CHECK enforces
--     de-anonymization barrier at write time; no individual identifiers).
--
-- PII contract (user-PII tier):
--   applications, outcomes: contain user career data; CASCADE chain on auth.users.
--   job_descriptions: user-scoped lean signals; no raw JD text retained.
--   benchmarks: aggregate data only; no user_id column; not user-PII tier.
--
-- Operator deploy runbook:
--   1. Verify GUCs are set on target environment:
--      SELECT current_setting('app.functions_base_url', true),
--             current_setting('app.internal_job_secret', true);
--      Both must be non-NULL (set via Phase 12 migration or manual ALTER DATABASE).
--   2. Capture pre-migration count: SELECT count(*) FROM public.saved_jobs;
--   3. Apply: supabase db push --project-ref <ref>
--   4. Verify: SELECT count(*) FROM public.applications WHERE status='saved';
--      Count must equal pre-migration saved_jobs count.
--   5. Regenerate types: supabase gen types typescript --linked > src/integrations/supabase/types.ts
--   6. npm run build — must exit 0.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Pre-migration count capture (T-42-CUTOVER safety)
--    Captures saved_jobs row count before cutover. Skipped (via DO $$) if
--    saved_jobs table is absent (fresh environments, repeated migration runs).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'saved_jobs'
  ) THEN
    CREATE TEMP TABLE IF NOT EXISTS _saved_jobs_pre_count AS
      SELECT count(*)::bigint AS n FROM public.saved_jobs;
    RAISE NOTICE 'L4 pre-migration saved_jobs count: %', (SELECT n FROM _saved_jobs_pre_count);
  ELSE
    RAISE NOTICE 'L4 saved_jobs not present — skipping pre-migration count capture (fresh env or re-run)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. public.applications  (DB-APP-01)
--    Subsumes saved_jobs. Status lifecycle: saved → applied → interviewing →
--    offer → rejected → ghosted → withdrawn.
--    Reconciled columns (operator reconciliation #1, 2026-05-25):
--      posted, salary, url, location — preserve Jobs.tsx swipe-save field shape
--      from live saved_jobs schema (migration 20251114012619). These are nullable
--      and non-load-bearing for predictions/benchmarks.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.applications (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL
                                    REFERENCES auth.users(id) ON DELETE CASCADE,
  company_applied     text        NOT NULL,
  role_applied        text        NOT NULL,
  industry            text,
  status              text        NOT NULL DEFAULT 'saved'
                                    CHECK (status IN (
                                      'saved',
                                      'applied',
                                      'interviewing',
                                      'offer',
                                      'rejected',
                                      'ghosted',
                                      'withdrawn'
                                    )),
  application_date    date,
  application_source  text
                                    CHECK (application_source IS NULL OR application_source IN (
                                      'linkedin',
                                      'indeed',
                                      'referral',
                                      'company_site',
                                      'other',
                                      'recruiting_lens'
                                    )),
  referral_used       boolean     DEFAULT false,
  resume_version_id   uuid        REFERENCES public.resume_versions(id) ON DELETE SET NULL,
  linkedin_version_id uuid        REFERENCES public.linkedin_versions(id) ON DELETE SET NULL,
  -- jd_id FK added below after job_descriptions table is created
  jd_id               uuid,
  -- Reconciled nullable columns (operator reconciliation #1, 2026-05-25):
  -- preserve Jobs.tsx swipe-save field shape from live saved_jobs schema.
  posted              text,
  salary              text,
  url                 text,
  location            text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. public.outcomes  (DB-OUT-01)
--    1:1 with applications (UNIQUE on application_id). Outcome detail
--    per application.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.outcomes (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id           uuid        NOT NULL UNIQUE
                                          REFERENCES public.applications(id) ON DELETE CASCADE,
  result                   text        NOT NULL
                                          CHECK (result IN (
                                            'rejected',
                                            'interview',
                                            'offer',
                                            'withdrawn',
                                            'ghosted'
                                          )),
  rejection_stage          text
                                          CHECK (rejection_stage IS NULL OR rejection_stage IN (
                                            'application_screen',
                                            'recruiter_screen',
                                            'technical_screen',
                                            'onsite',
                                            'offer_negotiation',
                                            'other'
                                          )),
  interview_rounds         smallint,
  offer_received           boolean     DEFAULT false,
  final_outcome_date       date,
  outcome_source           text        NOT NULL DEFAULT 'self_reported'
                                          CHECK (outcome_source IN (
                                            'self_reported',
                                            'verified',
                                            'imported'
                                          )),
  outcome_confidence_score smallint
                                          CHECK (outcome_confidence_score IS NULL OR
                                                 (outcome_confidence_score BETWEEN 0 AND 100)),
  reported_at              timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. public.job_descriptions  (DB-JD-01)
--    Lean structured JD signals only — NO raw_text column per SPEC contract.
--    Written by Layer 2 worker (extract-analysis-structure) when
--    feature=recruiting_lens. User-scoped, service-role writes.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.job_descriptions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL
                                      REFERENCES auth.users(id) ON DELETE CASCADE,
  key_requirements      text[]      DEFAULT '{}',
  required_skills       text[]      DEFAULT '{}',
  preferred_skills      text[]      DEFAULT '{}',
  missing_skills_vs_user text[]     DEFAULT '{}',
  match_score           integer,
  jd_url                text,
  captured_at           timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3b. Add FK from applications.jd_id → job_descriptions.id
--     Deferred until job_descriptions exists. ON DELETE SET NULL preserves
--     application row when a JD is deleted.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema    = 'public'
      AND table_name      = 'applications'
      AND constraint_name = 'applications_jd_id_fkey'
  ) THEN
    ALTER TABLE public.applications
      ADD CONSTRAINT applications_jd_id_fkey
        FOREIGN KEY (jd_id) REFERENCES public.job_descriptions(id) ON DELETE SET NULL;
    RAISE NOTICE 'L4: added applications.jd_id FK → job_descriptions.id';
  ELSE
    RAISE NOTICE 'L4: applications_jd_id_fkey already exists — skipping';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. public.benchmarks  (DB-BMK-01)
--    Aggregate cohort percentiles. DOCUMENTED EXCEPTION T-42-BENCHMARKS:
--    SELECT allowed for any authenticated user (USING (true)).
--    sample_size >= 5 CHECK enforces de-anonymization barrier at write time.
--    No individual user identifiers stored here.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.benchmarks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_key    text        NOT NULL,
  metric        text        NOT NULL
                              CHECK (metric IN (
                                'resume_overall_score',
                                'linkedin_overall_score',
                                'ats_score',
                                'quantified_impact_score',
                                'interview_rate',
                                'offer_rate'
                              )),
  percentile_25 numeric,
  percentile_50 numeric,
  percentile_75 numeric,
  sample_size   integer     NOT NULL
                              CHECK (sample_size >= 5),
  computed_at   timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Atomic saved_jobs → applications backfill  (T-42-CUTOVER)
--    Only runs if saved_jobs exists. Preserves id (uuid), user_id, created_at.
--    Fields mapped: title→role_applied, company→company_applied, location,
--    salary, url, posted. application_source='other' for all rows (refinement
--    via frontend cutover in Plan 42-09 if needed).
--    ON CONFLICT (id) DO NOTHING — safe on re-run.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'saved_jobs'
  ) THEN
    INSERT INTO public.applications (
      id,
      user_id,
      company_applied,
      role_applied,
      status,
      location,
      salary,
      url,
      posted,
      application_source,
      created_at,
      updated_at
    )
    SELECT
      id,
      user_id,
      COALESCE(company, 'Unknown') AS company_applied,
      COALESCE(title, 'Unknown')   AS role_applied,
      'saved'                       AS status,
      location,
      salary,
      url,
      posted::text,
      'other'                       AS application_source,
      created_at,
      created_at                    AS updated_at
    FROM public.saved_jobs
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'L4 saved_jobs → applications backfill complete. applications(status=saved) count: %',
      (SELECT count(*) FROM public.applications WHERE status = 'saved');
  ELSE
    RAISE NOTICE 'L4 saved_jobs absent — skipping backfill (fresh env or re-run)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. DROP saved_jobs  (T-42-CUTOVER — atomic with backfill in same transaction)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.saved_jobs CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ENABLE ROW LEVEL SECURITY on all 4 tables
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.applications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outcomes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmarks      ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RLS policies — public.applications (FULL user CRUD — documented exception)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS applications_select_own ON public.applications;
CREATE POLICY applications_select_own
  ON public.applications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS applications_insert_own ON public.applications;
CREATE POLICY applications_insert_own
  ON public.applications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS applications_update_own ON public.applications;
CREATE POLICY applications_update_own
  ON public.applications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS applications_delete_own ON public.applications;
CREATE POLICY applications_delete_own
  ON public.applications
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RLS policies — public.outcomes (FULL user CRUD via parent-join)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS outcomes_select_own ON public.outcomes;
CREATE POLICY outcomes_select_own
  ON public.outcomes
  FOR SELECT
  TO authenticated
  USING (
    application_id IN (
      SELECT id FROM public.applications WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS outcomes_insert_own ON public.outcomes;
CREATE POLICY outcomes_insert_own
  ON public.outcomes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    application_id IN (
      SELECT id FROM public.applications WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS outcomes_update_own ON public.outcomes;
CREATE POLICY outcomes_update_own
  ON public.outcomes
  FOR UPDATE
  TO authenticated
  USING (
    application_id IN (
      SELECT id FROM public.applications WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS outcomes_delete_own ON public.outcomes;
CREATE POLICY outcomes_delete_own
  ON public.outcomes
  FOR DELETE
  TO authenticated
  USING (
    application_id IN (
      SELECT id FROM public.applications WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RLS policies — public.job_descriptions (SELECT-own only)
--     Service-role writes from Layer 2 worker + recruiting-lens edge function.
--     No INSERT/UPDATE/DELETE user policy — SEC-06 anti-pattern avoidance.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS job_descriptions_select_own ON public.job_descriptions;
CREATE POLICY job_descriptions_select_own
  ON public.job_descriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. RLS policies — public.benchmarks
--     DOCUMENTED EXCEPTION T-42-BENCHMARKS: SELECT allowed for any authenticated
--     user (cohort percentiles are aggregate data; sample_size >= 5 CHECK at
--     write time is the de-anonymization barrier). NO write policy — service-role
--     only via run_benchmarks_rollup() SECURITY-DEFINER function (Plan 42-11).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS benchmarks_select_aggregate ON public.benchmarks;
CREATE POLICY benchmarks_select_aggregate
  ON public.benchmarks
  FOR SELECT
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. updated_at trigger on applications
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS update_applications_updated_at ON public.applications;
CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- applications: primary lookup by user + status + date (UI table sorted by date)
CREATE INDEX IF NOT EXISTS idx_applications_user_status_date
  ON public.applications (user_id, status, application_date DESC);

-- applications: created_at-sorted listing for dashboard feeds
CREATE INDEX IF NOT EXISTS idx_applications_user_created
  ON public.applications (user_id, created_at DESC);

-- applications: JD lookup (sparse — only rows with a linked JD)
CREATE INDEX IF NOT EXISTS idx_applications_jd
  ON public.applications (jd_id)
  WHERE jd_id IS NOT NULL;

-- outcomes: join from application side
CREATE INDEX IF NOT EXISTS idx_outcomes_application
  ON public.outcomes (application_id);

-- job_descriptions: per-user chronological listing
CREATE INDEX IF NOT EXISTS idx_job_descriptions_user_captured
  ON public.job_descriptions (user_id, captured_at DESC);

-- benchmarks: rollup lookup by cohort + metric + date
CREATE INDEX IF NOT EXISTS idx_benchmarks_cohort_metric
  ON public.benchmarks (cohort_key, metric, computed_at DESC);

-- IMMUTABLE wrapper required for timestamptz→date conversion in a functional index.
-- Plain (computed_at::date) is STABLE (session-timezone-dependent); PostgreSQL
-- rejects STABLE expressions in index predicates. UTC date extraction is deterministic
-- in practice — marking IMMUTABLE is safe and is the standard PostgreSQL workaround.
CREATE OR REPLACE FUNCTION public.ts_to_utc_date(ts timestamptz)
  RETURNS date
  LANGUAGE sql
  IMMUTABLE STRICT PARALLEL SAFE
AS $$ SELECT ($1 AT TIME ZONE 'UTC')::date $$;

-- benchmarks: unique per (cohort_key, metric, day) — functional expression
-- requires CREATE UNIQUE INDEX with IMMUTABLE wrapper function.
CREATE UNIQUE INDEX IF NOT EXISTS idx_benchmarks_unique_per_day
  ON public.benchmarks (cohort_key, metric, public.ts_to_utc_date(computed_at));

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. Table comments (PII tier + design notes)
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.applications IS
  'Phase 42 DB-APP-01: unified per-user application record (subsumes saved_jobs). '
  'user-PII tier — contains career data. CASCADE chain: auth.users → applications '
  '→ outcomes (via FK). Full user CRUD RLS (documented exception: users create/update/'
  'delete their own rows from the frontend Applications tracker). '
  '4 reconciled nullable columns (posted/salary/url/location) preserve Jobs.tsx '
  'swipe-save field shape per operator reconciliation #1 (2026-05-25).';

COMMENT ON TABLE public.outcomes IS
  'Phase 42 DB-OUT-01: per-application result detail (1:1 with applications via '
  'UNIQUE application_id FK). user-PII tier. RLS via parent-join on '
  'applications.user_id. CASCADE: application delete → outcome delete.';

COMMENT ON TABLE public.job_descriptions IS
  'Phase 42 DB-JD-01: lean structured JD signals. NO raw_text column — '
  'source analysis_results.raw_response governs retention (Layer 5). '
  'user-PII tier. Service-role writes from extract-analysis-structure worker '
  '(Layer 2) and recruiting-lens edge function. SELECT-own RLS for users.';

COMMENT ON TABLE public.benchmarks IS
  'Phase 42 DB-BMK-01: rolled-up cohort percentile benchmarks. '
  'DOCUMENTED EXCEPTION T-42-BENCHMARKS — SELECT allowed for any authenticated '
  'user (USING (true)). Aggregate data only; no user_id column. '
  'sample_size >= 5 CHECK enforces de-anonymization barrier at write time. '
  'No write policy — service-role only via run_benchmarks_rollup() SECURITY-DEFINER '
  '(Plan 42-11). cohort_key format: school|year|major|target_role|industry|location.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. Final DO $$ verification block
--     Asserts all tables, RLS, policy counts, indexes, constraints, and cutover
--     landed correctly. RAISE EXCEPTION on any mismatch.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_count        integer;
  v_rls_enabled  boolean;
  v_pre_count    bigint  := NULL;
  v_post_count   bigint;
BEGIN

  -- ── Tables exist ──────────────────────────────────────────────────────────
  FOR v_count IN
    SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('applications', 'outcomes', 'job_descriptions', 'benchmarks')
  LOOP
    IF v_count <> 4 THEN
      RAISE EXCEPTION 'L4 verification: expected 4 tables, found %', v_count;
    END IF;
  END LOOP;

  -- ── Column counts ─────────────────────────────────────────────────────────
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'applications';
  IF v_count <> 18 THEN
    RAISE EXCEPTION 'L4 verification: applications expected 18 columns, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'outcomes';
  IF v_count <> 10 THEN
    RAISE EXCEPTION 'L4 verification: outcomes expected 10 columns, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'job_descriptions';
  IF v_count <> 9 THEN
    RAISE EXCEPTION 'L4 verification: job_descriptions expected 9 columns, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'benchmarks';
  IF v_count <> 8 THEN
    RAISE EXCEPTION 'L4 verification: benchmarks expected 8 columns, found %', v_count;
  END IF;

  -- ── RLS enabled ───────────────────────────────────────────────────────────
  FOR v_rls_enabled IN
    SELECT relrowsecurity FROM pg_class
    WHERE relname IN ('applications', 'outcomes', 'job_descriptions', 'benchmarks')
      AND relnamespace = 'public'::regnamespace
  LOOP
    IF v_rls_enabled IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'L4 verification: RLS NOT enabled on one of the 4 tables';
    END IF;
  END LOOP;

  -- ── Policy counts ─────────────────────────────────────────────────────────
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'applications';
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'L4 verification: applications expected 4 policies, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'outcomes';
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'L4 verification: outcomes expected 4 policies, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'job_descriptions';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'L4 verification: job_descriptions expected 1 policy (SELECT-own), found %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'benchmarks';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'L4 verification: benchmarks expected 1 policy (SELECT aggregate), found %', v_count;
  END IF;

  -- ── Indexes exist ─────────────────────────────────────────────────────────
  SELECT count(*) INTO v_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname IN (
      'idx_applications_user_status_date',
      'idx_applications_user_created',
      'idx_applications_jd',
      'idx_outcomes_application',
      'idx_job_descriptions_user_captured',
      'idx_benchmarks_cohort_metric',
      'idx_benchmarks_unique_per_day'
    );
  IF v_count <> 7 THEN
    RAISE EXCEPTION 'L4 verification: expected 7 indexes, found %', v_count;
  END IF;

  -- ── Reconciled columns (operator reconciliation #1) present ───────────────
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'applications'
    AND column_name  IN ('posted', 'salary', 'url', 'location');
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'L4 verification: applications missing reconciled columns (posted/salary/url/location); found %', v_count;
  END IF;

  -- ── saved_jobs absent (T-42-CUTOVER) ─────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'saved_jobs'
  ) THEN
    RAISE EXCEPTION 'L4 verification: saved_jobs still exists — DROP TABLE failed';
  END IF;

  -- ── Pre/post count match (if pre-count temp table was captured) ───────────
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pg_temp'
       OR (table_schema LIKE 'pg_temp_%' AND table_name = '_saved_jobs_pre_count')
  ) OR (
    SELECT count(*) > 0 FROM pg_class
    WHERE relname = '_saved_jobs_pre_count' AND relkind = 'r'
  ) THEN
    SELECT n INTO v_pre_count FROM _saved_jobs_pre_count LIMIT 1;
    SELECT count(*) INTO v_post_count
    FROM public.applications WHERE status = 'saved';

    IF v_post_count < v_pre_count THEN
      RAISE EXCEPTION
        'L4 verification (T-42-CUTOVER): post-migration applications(status=saved) count % < pre-migration saved_jobs count %. DATA LOSS.',
        v_post_count, v_pre_count;
    END IF;
    RAISE NOTICE 'L4 T-42-CUTOVER count check: pre=% post(saved)=%', v_pre_count, v_post_count;
  END IF;

  -- ── UNIQUE constraint on outcomes.application_id ──────────────────────────
  SELECT count(*) INTO v_count
  FROM information_schema.table_constraints
  WHERE table_schema    = 'public'
    AND table_name      = 'outcomes'
    AND constraint_type = 'UNIQUE';
  IF v_count < 1 THEN
    RAISE EXCEPTION 'L4 verification: outcomes missing UNIQUE constraint on application_id';
  END IF;

  -- ── UNIQUE index on benchmarks (cohort_key, metric, computed_at::date) ──────
  -- Uses pg_indexes (not table_constraints) because functional expressions like
  -- (computed_at::date) require CREATE UNIQUE INDEX, not a table-level constraint.
  SELECT count(*) INTO v_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename  = 'benchmarks'
    AND indexname  = 'idx_benchmarks_unique_per_day';
  IF v_count < 1 THEN
    RAISE EXCEPTION 'L4 verification: benchmarks missing idx_benchmarks_unique_per_day unique index';
  END IF;

  -- ── sample_size >= 5 CHECK exists on benchmarks ───────────────────────────
  SELECT count(*) INTO v_count
  FROM information_schema.table_constraints
  WHERE table_schema    = 'public'
    AND table_name      = 'benchmarks'
    AND constraint_type = 'CHECK';
  IF v_count < 1 THEN
    RAISE EXCEPTION 'L4 verification: benchmarks missing CHECK constraints (sample_size >= 5)';
  END IF;

  RAISE NOTICE 'Phase 42 L4 verification PASSED: 4 tables + RLS + policies + indexes + cutover + constraints all confirmed';

END $$;

COMMIT;

-- Phase 42 Layer 4: Benchmarks Rollup Function + Nightly pg_cron
-- REQ-IDs: DB-BMK-02
-- Depends on: 20260525000005_phase42_layer4_applications_outcomes.sql
--             (benchmarks table + ts_to_utc_date IMMUTABLE function)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN MIGRATION (fenced comment — do NOT run without operator sign-off)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- SELECT cron.unschedule('benchmarks_nightly');
-- DROP FUNCTION IF EXISTS public.run_benchmarks_rollup();
--
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Threat model:
--   T-42-BENCHMARKS: Small-cohort de-anonymization risk. Mitigation: rollup
--     function applies WHERE sample_size >= 5 BEFORE upsert; benchmarks.sample_size
--     CHECK (from DB-BMK-01) enforces at row level (defense in depth); aggregate-
--     only columns (percentiles, sample_size) — no individual identifiers leak.
--   T-42-CRON: Idempotency + GUC dependency. Mitigation: cron job uses pure-SQL
--     invocation (no HTTP, no GUC dependency — simpler than catchup/lifecycle
--     crons); cron.unschedule guard re-schedules idempotently. SECURITY DEFINER
--     scoped to read-only-then-upsert against benchmarks (no destructive ops on
--     user data).
--   T-42-RLS: SECURITY DEFINER function bypasses RLS by design. Mitigation:
--     function body restricts to documented metric computation + benchmarks upsert;
--     does NOT expose individual user_id values in outputs; REVOKE EXECUTE from
--     PUBLIC + no GRANT TO (only service role / pg_cron context invokes it).
--
-- ON CONFLICT note:
--   The unique index idx_benchmarks_unique_per_day was created using the IMMUTABLE
--   wrapper function public.ts_to_utc_date(computed_at) — NOT (computed_at::date)
--   (which is STABLE, rejected by PostgreSQL for index predicates). The ON CONFLICT
--   clause MUST reference public.ts_to_utc_date(computed_at) to exactly match the
--   index expression. PostgreSQL requires the conflict target to match the index
--   expression verbatim.
--
-- Pure-SQL cron note:
--   benchmarks_nightly invokes run_benchmarks_rollup() via inline SQL — no
--   net.http_post, no GUC dependency (unlike Phase 12 / keep-warm HTTP crons).
--   This is the correct shape for an in-DB function. See also:
--   20260330000000_add_rate_limit_counters.sql for the pure-SQL cron precedent.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ensure pg_cron extension is present (already enabled since 20260116215237)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. run_benchmarks_rollup()
--
--    SECURITY DEFINER so it can read cohort_peers + scores + applications +
--    outcomes (bypassing RLS) and upsert into benchmarks (no user write policy).
--    SET search_path = public prevents search-path hijacking.
--    REVOKE EXECUTE from PUBLIC — only pg_cron and service role can call it.
--
--    Cohort key format (canonical, documented here as single source of truth):
--      lower(trim(school)) || '|' || lower(trim(year)) || '|' ||
--      lower(trim(major)) || '|' || lower(trim(target_role)) || '|' ||
--      lower(trim(industry)) || '|' || lower(trim(coalesce(location_preference,'')))
--
--    Six metrics computed per SPEC DB-BMK-01:
--      resume_overall_score   — from scores JOIN resume_versions
--      ats_score              — from scores JOIN resume_versions
--      quantified_impact_score — from scores JOIN resume_versions
--      linkedin_overall_score — from scores JOIN linkedin_versions
--      interview_rate         — count(outcomes.result='interview') / count(outcomes)
--      offer_rate             — count(outcomes.result='offer')     / count(outcomes)
--
--    Sample-size filter: WHERE sample_size >= 5 (DOCUMENTED EXCEPTION T-42-BENCHMARKS
--    de-anonymization barrier). Defense-in-depth: benchmarks.sample_size CHECK
--    also enforces this at the table level.
--
--    Returns JSONB summary: {cohort_count, rows_upserted}.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.run_benchmarks_rollup()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_cohort_count   integer := 0;
  v_rows_upserted  integer := 0;
  v_metric_count   integer := 0;
BEGIN

  -- ── Step 1–6: build cohort-expanded samples, compute percentiles, upsert ──

  WITH

  -- Step 1: Expand cohort_peers into one row per (user, target_role, industry).
  --   cohort_peers already filters WHERE school IS NOT NULL (Layer 1 view).
  --   unnest with COALESCE('{NULL}'::text[]) handles users with empty arrays so
  --   they still produce cohort rows with NULL role/industry segments.
  cohort_expanded AS (
    SELECT
      user_id,
      school,
      year,
      major,
      location_preference,
      lower(trim(coalesce(school, '')))               AS s_school,
      lower(trim(coalesce(year, '')))                 AS s_year,
      lower(trim(coalesce(major, '')))                AS s_major,
      lower(trim(coalesce(location_preference, ''))) AS s_loc,
      lower(trim(coalesce(t_role, '')))               AS s_role,
      lower(trim(coalesce(industry, '')))             AS s_industry
    FROM (
      SELECT
        cp.user_id,
        cp.school,
        cp.year,
        cp.major,
        cp.location_preference,
        unnest(coalesce(cp.target_roles,      ARRAY[NULL]::text[])) AS t_role,
        unnest(coalesce(cp.target_industries, ARRAY[NULL]::text[])) AS industry
      FROM public.cohort_peers cp
    ) sub
  ),

  -- Step 2: Derive canonical cohort_key per expanded row.
  cohorts AS (
    SELECT
      user_id,
      s_school || '|' || s_year || '|' || s_major || '|' ||
        s_role  || '|' || s_industry || '|' || s_loc AS cohort_key
    FROM cohort_expanded
  ),

  -- Step 3: Resume score samples per cohort.
  --   JOIN path: cohorts → resume_versions (user_id) → scores (version_id, version_type='resume')
  --   Takes the most-recent version per user (MAX id tiebreak acceptable;
  --   distinct per (user, cohort_key) is implicit via DISTINCT ON).
  score_samples AS (
    SELECT DISTINCT ON (c.cohort_key, rv.user_id)
      c.cohort_key,
      s.overall_score           AS resume_overall_score,
      s.ats_score               AS ats_score,
      s.quantified_impact_score AS quantified_impact_score
    FROM cohorts c
    JOIN public.resume_versions rv
      ON rv.user_id = c.user_id
    JOIN public.scores s
      ON s.version_id = rv.id
     AND s.version_type = 'resume'
    ORDER BY c.cohort_key, rv.user_id, rv.created_at DESC
  ),

  -- Step 4: LinkedIn score samples per cohort.
  --   JOIN path: cohorts → linkedin_versions (user_id) → scores (version_id, version_type='linkedin')
  linkedin_samples AS (
    SELECT DISTINCT ON (c.cohort_key, lv.user_id)
      c.cohort_key,
      s.overall_score AS linkedin_overall_score
    FROM cohorts c
    JOIN public.linkedin_versions lv
      ON lv.user_id = c.user_id
    JOIN public.scores s
      ON s.version_id = lv.id
     AND s.version_type = 'linkedin'
    ORDER BY c.cohort_key, lv.user_id, lv.created_at DESC
  ),

  -- Step 5: Outcome rate samples per cohort.
  --   interview_rate = fraction of outcomes with result='interview'
  --   offer_rate     = fraction of outcomes with result='offer'
  --   Counts are per (cohort, user application outcome) — one row per cohort.
  outcome_samples AS (
    SELECT
      c.cohort_key,
      count(*)                                              AS total_outcomes,
      count(*) FILTER (WHERE o.result = 'interview')       AS interview_count,
      count(*) FILTER (WHERE o.result = 'offer')           AS offer_count
    FROM cohorts c
    JOIN public.applications a
      ON a.user_id = c.user_id
    JOIN public.outcomes o
      ON o.application_id = a.id
    GROUP BY c.cohort_key
  ),

  -- Step 6: Per-metric percentile rollups.
  --   UNION ALL assembles all 6 metrics with consistent (cohort_key, metric, p25, p50, p75, sample_size).
  metric_rollups AS (
    -- 6a. resume_overall_score
    SELECT
      cohort_key,
      'resume_overall_score'                                          AS metric,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY resume_overall_score::numeric) AS p25,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY resume_overall_score::numeric) AS p50,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY resume_overall_score::numeric) AS p75,
      count(*)                                                        AS sample_size
    FROM score_samples
    WHERE resume_overall_score IS NOT NULL
    GROUP BY cohort_key

    UNION ALL

    -- 6b. ats_score
    SELECT
      cohort_key,
      'ats_score',
      percentile_cont(0.25) WITHIN GROUP (ORDER BY ats_score::numeric),
      percentile_cont(0.50) WITHIN GROUP (ORDER BY ats_score::numeric),
      percentile_cont(0.75) WITHIN GROUP (ORDER BY ats_score::numeric),
      count(*)
    FROM score_samples
    WHERE ats_score IS NOT NULL
    GROUP BY cohort_key

    UNION ALL

    -- 6c. quantified_impact_score
    SELECT
      cohort_key,
      'quantified_impact_score',
      percentile_cont(0.25) WITHIN GROUP (ORDER BY quantified_impact_score::numeric),
      percentile_cont(0.50) WITHIN GROUP (ORDER BY quantified_impact_score::numeric),
      percentile_cont(0.75) WITHIN GROUP (ORDER BY quantified_impact_score::numeric),
      count(*)
    FROM score_samples
    WHERE quantified_impact_score IS NOT NULL
    GROUP BY cohort_key

    UNION ALL

    -- 6d. linkedin_overall_score
    SELECT
      cohort_key,
      'linkedin_overall_score',
      percentile_cont(0.25) WITHIN GROUP (ORDER BY linkedin_overall_score::numeric),
      percentile_cont(0.50) WITHIN GROUP (ORDER BY linkedin_overall_score::numeric),
      percentile_cont(0.75) WITHIN GROUP (ORDER BY linkedin_overall_score::numeric),
      count(*)
    FROM linkedin_samples
    WHERE linkedin_overall_score IS NOT NULL
    GROUP BY cohort_key

    UNION ALL

    -- 6e. interview_rate
    --   Treat as scalar metric: p25=p50=p75=rate (one value per cohort).
    --   sample_size = number of outcome rows for this cohort.
    SELECT
      cohort_key,
      'interview_rate',
      (interview_count::numeric / NULLIF(total_outcomes, 0)),
      (interview_count::numeric / NULLIF(total_outcomes, 0)),
      (interview_count::numeric / NULLIF(total_outcomes, 0)),
      total_outcomes::bigint
    FROM outcome_samples
    WHERE total_outcomes > 0

    UNION ALL

    -- 6f. offer_rate
    SELECT
      cohort_key,
      'offer_rate',
      (offer_count::numeric / NULLIF(total_outcomes, 0)),
      (offer_count::numeric / NULLIF(total_outcomes, 0)),
      (offer_count::numeric / NULLIF(total_outcomes, 0)),
      total_outcomes::bigint
    FROM outcome_samples
    WHERE total_outcomes > 0
  )

  -- Step 7: UPSERT into benchmarks.
  --   sample_size >= 5 filter is the DOCUMENTED EXCEPTION T-42-BENCHMARKS
  --   de-anonymization barrier — applied BEFORE INSERT.
  --
  --   ON CONFLICT MUST use public.ts_to_utc_date(computed_at) to exactly match
  --   idx_benchmarks_unique_per_day (IMMUTABLE functional index created in
  --   migration 20260525000005). PostgreSQL rejects (computed_at::date) here
  --   because the index was not built on that expression.
  INSERT INTO public.benchmarks (
    cohort_key,
    metric,
    percentile_25,
    percentile_50,
    percentile_75,
    sample_size,
    computed_at
  )
  SELECT
    cohort_key,
    metric,
    p25,
    p50,
    p75,
    sample_size::integer,
    now()
  FROM metric_rollups
  WHERE sample_size >= 5   -- T-42-BENCHMARKS de-anonymization barrier
  ON CONFLICT (cohort_key, metric, public.ts_to_utc_date(computed_at))
  DO UPDATE SET
    percentile_25 = EXCLUDED.percentile_25,
    percentile_50 = EXCLUDED.percentile_50,
    percentile_75 = EXCLUDED.percentile_75,
    sample_size   = EXCLUDED.sample_size;

  GET DIAGNOSTICS v_rows_upserted = ROW_COUNT;

  -- Count cohort_peers rows as proxy for cohort count (for logging)
  SELECT count(*)
  INTO v_cohort_count
  FROM public.cohort_peers
  WHERE school IS NOT NULL;

  -- Count metric rows written this run
  v_metric_count := v_rows_upserted;

  RAISE NOTICE
    'run_benchmarks_rollup completed: cohort_count=%, rows_upserted=%, '
    'skipped_below_threshold=(implicit — sample_size<5 filter applied before upsert)',
    v_cohort_count, v_rows_upserted;

  RETURN jsonb_build_object(
    'cohort_count',  v_cohort_count,
    'rows_upserted', v_rows_upserted
  );

END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Security: revoke EXECUTE from PUBLIC
--    Only pg_cron (runs as postgres superrole) and service role can invoke.
--    No explicit GRANT TO needed — service role bypasses privilege checks.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.run_benchmarks_rollup() FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Function comment (design contract)
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON FUNCTION public.run_benchmarks_rollup() IS
  'Phase 42 L4 DB-BMK-02. Nightly cohort percentile rollup. '
  'cohort_key = lower-pipe-joined (school|year|major|target_role|industry|location). '
  'Expands cohort_peers arrays (target_roles, target_industries) via unnest to produce '
  'one cohort row per (user × role × industry) combination. '
  'Six metrics: resume_overall_score, ats_score, quantified_impact_score, '
  'linkedin_overall_score, interview_rate, offer_rate. '
  'sample_size >= 5 filter is DOCUMENTED EXCEPTION T-42-BENCHMARKS de-anonymization '
  'barrier — applied in function body; benchmarks.sample_size CHECK enforces at row '
  'level (defense in depth). '
  'ON CONFLICT uses public.ts_to_utc_date(computed_at) to match '
  'idx_benchmarks_unique_per_day IMMUTABLE functional index exactly. '
  'SECURITY DEFINER + REVOKE FROM PUBLIC — invoked by pg_cron and service role only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. benchmarks_nightly pg_cron job (pure-SQL invocation — no HTTP, no GUCs)
--    Schedule: 03:00 UTC nightly (Phase 12 + keep-warm slot alignment).
--    Idempotent: unschedules existing job before re-registering.
-- ─────────────────────────────────────────────────────────────────────────────

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'benchmarks_nightly') THEN
    PERFORM cron.unschedule('benchmarks_nightly');
  END IF;

  PERFORM cron.schedule(
    'benchmarks_nightly',
    '0 3 * * *',
    $job$ SELECT public.run_benchmarks_rollup(); $job$
  );
END $cron$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. DO $$ verification block
--    Asserts: function exists with correct security/volatility; cron job exists
--    with correct schedule; REVOKE FROM PUBLIC is in effect; manual invocation
--    returns valid jsonb (on fresh staging, returns {cohort_count:0, rows_upserted:0}).
--    RAISE EXCEPTION on any mismatch.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_count         integer;
  v_security      text;
  v_volatile      text;
  v_schedule      text;
  v_rollup_result jsonb;
  v_has_public    integer;
BEGIN

  -- ── Function exists ───────────────────────────────────────────────────────
  SELECT count(*) INTO v_count
  FROM pg_proc
  WHERE proname      = 'run_benchmarks_rollup'
    AND pronamespace = 'public'::regnamespace;
  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'L4-BMK-02 verification: run_benchmarks_rollup function missing (found % rows)',
      v_count;
  END IF;

  -- ── SECURITY DEFINER ──────────────────────────────────────────────────────
  SELECT CASE prosecdef WHEN true THEN 'DEFINER' ELSE 'INVOKER' END
  INTO v_security
  FROM pg_proc
  WHERE proname      = 'run_benchmarks_rollup'
    AND pronamespace = 'public'::regnamespace;
  IF v_security <> 'DEFINER' THEN
    RAISE EXCEPTION
      'L4-BMK-02 verification: run_benchmarks_rollup is not SECURITY DEFINER (got %)',
      v_security;
  END IF;

  -- ── VOLATILE (function writes rows — must be VOLATILE, not STABLE) ────────
  SELECT CASE provolatile WHEN 'v' THEN 'VOLATILE' WHEN 's' THEN 'STABLE' ELSE 'IMMUTABLE' END
  INTO v_volatile
  FROM pg_proc
  WHERE proname      = 'run_benchmarks_rollup'
    AND pronamespace = 'public'::regnamespace;
  IF v_volatile <> 'VOLATILE' THEN
    RAISE EXCEPTION
      'L4-BMK-02 verification: run_benchmarks_rollup volatility expected VOLATILE, got %',
      v_volatile;
  END IF;

  -- ── REVOKE FROM PUBLIC in effect ──────────────────────────────────────────
  --   Check that PUBLIC does not have EXECUTE privilege on the function.
  --   pg_proc.proacl is NULL when only the owner has access (effective REVOKE ALL
  --   from public). If proacl is NULL, PUBLIC cannot execute — that is correct.
  --   If proacl is non-NULL, check that no ACL item grants =X (PUBLIC execute).
  SELECT count(*) INTO v_has_public
  FROM pg_proc
  WHERE proname      = 'run_benchmarks_rollup'
    AND pronamespace = 'public'::regnamespace
    AND proacl IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM unnest(proacl) AS acl
      WHERE acl::text LIKE '=X%'   -- PUBLIC execute privilege marker
    );
  IF v_has_public > 0 THEN
    RAISE EXCEPTION
      'L4-BMK-02 verification: run_benchmarks_rollup has PUBLIC EXECUTE privilege — REVOKE failed';
  END IF;

  -- ── cron.job exists with correct schedule ─────────────────────────────────
  SELECT count(*) INTO v_count
  FROM cron.job
  WHERE jobname = 'benchmarks_nightly';
  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'L4-BMK-02 verification: benchmarks_nightly cron job missing (found % rows)',
      v_count;
  END IF;

  SELECT schedule INTO v_schedule
  FROM cron.job
  WHERE jobname = 'benchmarks_nightly';
  IF v_schedule <> '0 3 * * *' THEN
    RAISE EXCEPTION
      'L4-BMK-02 verification: benchmarks_nightly schedule expected ''0 3 * * *'', got ''%''',
      v_schedule;
  END IF;

  -- ── Manual invocation: returns valid jsonb ────────────────────────────────
  --   On a fresh staging DB this returns {cohort_count: 0, rows_upserted: 0}.
  --   We accept any cohort_count >= 0 as valid.
  SELECT public.run_benchmarks_rollup() INTO v_rollup_result;
  IF v_rollup_result IS NULL THEN
    RAISE EXCEPTION
      'L4-BMK-02 verification: run_benchmarks_rollup() returned NULL — expected jsonb';
  END IF;
  IF NOT (v_rollup_result ? 'cohort_count' AND v_rollup_result ? 'rows_upserted') THEN
    RAISE EXCEPTION
      'L4-BMK-02 verification: run_benchmarks_rollup() jsonb missing cohort_count or rows_upserted keys. Got: %',
      v_rollup_result;
  END IF;

  RAISE NOTICE
    'Phase 42 L4 DB-BMK-02 verification PASSED: function=SECURITY-DEFINER+VOLATILE, '
    'cron=benchmarks_nightly@03:00 UTC, manual invocation jsonb=%',
    v_rollup_result;

END $$;

/*
Phase 42 DB-OUT-02: prediction-readiness query template.

Purpose:
  For a given cohort (school, year, major, target_role, target_industry, location),
  compute median resume overall_score and quantified_impact_score bucketed by outcome
  result (interview vs. ghosted). Feeds the future prediction model and benchmarking
  surfaces as the data-readiness gate.

Input parameters (bind or substitute before execution):
  :SCHOOL         text    — e.g. 'MIT'
  :YEAR           text    — e.g. 'senior' (from career_targets.year enum)
  :MAJOR          text    — e.g. 'Computer Science'
  :TARGET_ROLE    text    — e.g. 'Software Engineer'
  :INDUSTRY       text    — e.g. 'Technology'
  :LOCATION       text    — e.g. 'San Francisco, CA' (NULL matches any location)

Expected runtime:
  < 500ms on a staging dataset with >= 50 applications + >= 10 outcomes per bucket.

Expected index usage:
  - idx_applications_user_status_date  (applications table scan bounded by user_id / cohort join)
  - idx_outcomes_application            (outcomes(application_id) — join key)
  - idx_resume_versions_user_resume_created (resume_versions user + resume FK scan)

Produced by: Phase 42 Plan 42-10 (Task 5).
Operator notes:
  - Run EXPLAIN ANALYZE before deploying to production to verify index usage.
  - If runtime > 500ms at scale, promote cohort filtering to a materialized view
    or add a partial index on applications(user_id) WHERE application_date IS NOT NULL.
  - sample_size < 5 rows per bucket → suppress that bucket (benchmarks table CHECK enforces
    this at write time; this query surfaces raw counts for validation).
*/

WITH cohort AS (
  -- Identify users who belong to the target cohort
  SELECT
    cp.user_id
  FROM public.cohort_peers cp
  WHERE cp.school  = :SCHOOL
    AND cp.year    = :YEAR
    AND cp.major   = :MAJOR
    AND :TARGET_ROLE = ANY(cp.target_roles)
    AND :INDUSTRY   = ANY(cp.target_industries)
    AND COALESCE(cp.location_preference, '') = COALESCE(:LOCATION, '')
),

bucketed AS (
  -- Join applications → outcomes → cohort → resume scores
  SELECT
    o.result,
    s.overall_score,
    s.quantified_impact_score
  FROM public.applications a
  JOIN public.outcomes o
    ON o.application_id = a.id
  JOIN cohort c
    ON c.user_id = a.user_id
  LEFT JOIN public.resume_versions rv
    ON rv.id = a.resume_version_id
  LEFT JOIN public.scores s
    ON s.version_id = rv.id
   AND s.version_type = 'resume'
  WHERE o.result IN ('interview', 'ghosted')
)

-- Median overall_score per outcome bucket
SELECT
  'overall_score'           AS metric,
  result                    AS outcome_bucket,
  COUNT(*)                  AS sample_size,
  percentile_cont(0.5)
    WITHIN GROUP (ORDER BY overall_score)
                            AS median
FROM bucketed
GROUP BY result

UNION ALL

-- Median quantified_impact_score per outcome bucket
SELECT
  'quantified_impact_score' AS metric,
  result                    AS outcome_bucket,
  COUNT(*)                  AS sample_size,
  percentile_cont(0.5)
    WITHIN GROUP (ORDER BY quantified_impact_score)
                            AS median
FROM bucketed
GROUP BY result

ORDER BY metric, outcome_bucket;

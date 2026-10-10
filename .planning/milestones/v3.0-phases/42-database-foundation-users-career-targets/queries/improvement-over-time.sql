/*
Phase 42 DB-VER-04: improvement-over-time query template.

Input:
  $1::uuid = target user_id

Expected runtime:
  <100ms on a staging account with at least two resume_versions rows.

Expected index usage:
  idx_resume_versions_user_resume_created should bound the ranked CTE scan.

Returns:
  Last 5 resume versions for the user, joined to sections and bullets, with
  overall / section / bullet score deltas versus the prior version pointed to by
  resume_versions.supersedes_id.
*/

WITH ranked_versions AS (
  SELECT
    rv.id,
    rv.user_id,
    rv.resume_id,
    rv.overall_score,
    rv.supersedes_id,
    rv.created_at,
    row_number() OVER (
      PARTITION BY rv.user_id
      ORDER BY rv.created_at DESC
    ) AS rn
  FROM public.resume_versions rv
  WHERE rv.user_id = $1::uuid
),
latest_versions AS (
  SELECT *
  FROM ranked_versions
  WHERE rn <= 5
),
version_rows AS (
  SELECT
    current_version.*,
    prior_version.overall_score AS prior_overall_score,
    current_version.overall_score - prior_version.overall_score AS overall_delta
  FROM latest_versions current_version
  LEFT JOIN public.resume_versions prior_version
    ON prior_version.id = current_version.supersedes_id
),
current_sections AS (
  SELECT
    vr.id AS resume_version_id,
    vr.resume_id,
    vr.created_at AS version_created_at,
    vr.overall_score,
    vr.prior_overall_score,
    vr.overall_delta,
    section.id AS section_id,
    section.section_type,
    section.section_score,
    section.position AS section_position
  FROM version_rows vr
  JOIN public.resume_sections section
    ON section.resume_version_id = vr.id
),
prior_sections AS (
  SELECT
    prior_version.id AS prior_resume_version_id,
    section.section_type,
    section.position AS section_position,
    section.section_score AS prior_section_score
  FROM version_rows current_version
  JOIN public.resume_versions prior_version
    ON prior_version.id = current_version.supersedes_id
  JOIN public.resume_sections section
    ON section.resume_version_id = prior_version.id
),
current_bullets AS (
  SELECT
    section.resume_version_id,
    section.resume_id,
    section.version_created_at,
    section.overall_score,
    section.prior_overall_score,
    section.overall_delta,
    section.section_id,
    section.section_type,
    section.section_score,
    prior_section.prior_section_score,
    section.section_score - prior_section.prior_section_score AS section_delta,
    bullet.id AS bullet_id,
    bullet.position AS bullet_position,
    bullet.original_text,
    bullet.bullet_score,
    bullet.weakness_category,
    bullet.action_verb_quality,
    bullet.quantified_impact,
    bullet.suggested_improvement
  FROM current_sections section
  LEFT JOIN prior_sections prior_section
    ON prior_section.section_type = section.section_type
   AND prior_section.section_position = section.section_position
  LEFT JOIN public.resume_bullets bullet
    ON bullet.section_id = section.section_id
),
prior_bullets AS (
  SELECT
    current_version.id AS resume_version_id,
    section.section_type,
    bullet.position AS bullet_position,
    bullet.bullet_score AS prior_bullet_score
  FROM version_rows current_version
  JOIN public.resume_versions prior_version
    ON prior_version.id = current_version.supersedes_id
  JOIN public.resume_sections section
    ON section.resume_version_id = prior_version.id
  JOIN public.resume_bullets bullet
    ON bullet.section_id = section.id
)
SELECT
  current_bullets.resume_version_id,
  current_bullets.resume_id,
  current_bullets.version_created_at,
  current_bullets.overall_score,
  current_bullets.prior_overall_score,
  current_bullets.overall_delta,
  current_bullets.section_id,
  current_bullets.section_type,
  current_bullets.section_score,
  current_bullets.prior_section_score,
  current_bullets.section_delta,
  current_bullets.bullet_id,
  current_bullets.bullet_position,
  current_bullets.original_text,
  current_bullets.bullet_score,
  prior_bullets.prior_bullet_score,
  current_bullets.bullet_score - prior_bullets.prior_bullet_score AS bullet_delta,
  current_bullets.weakness_category,
  current_bullets.action_verb_quality,
  current_bullets.quantified_impact,
  current_bullets.suggested_improvement
FROM current_bullets
LEFT JOIN prior_bullets
  ON prior_bullets.resume_version_id = current_bullets.resume_version_id
 AND prior_bullets.section_type = current_bullets.section_type
 AND prior_bullets.bullet_position = current_bullets.bullet_position
ORDER BY current_bullets.version_created_at DESC, current_bullets.section_type, current_bullets.bullet_position;

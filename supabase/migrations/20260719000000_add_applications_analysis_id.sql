-- Durable link: applications.analysis_id -> analysis_results(id)
--
-- CONTEXT: The dashboard "Application Intelligence" cards must show a saved job's
-- real Recruiting Lens score and deep-link to that specific analysis. Until now
-- `applications` carried NO reference to its analysis_results row: the recruiting-lens
-- edge fn (upsertSavedRecruitingLensJob) received the analysisId but never persisted it,
-- so the only linkage was a fuzzy (user_id, company, role) match against
-- raw_response.metadata. That is fragile (metadata drift, duplicate roles, archived
-- raw_response) and was the substrate of the "always 82" fabricated-score bug.
--
-- FIX: add a nullable, ON DELETE SET NULL FK (same pattern as
-- job_descriptions.source_analysis_results_id), backfill existing recruiting_lens rows
-- by their newest matching analysis, and let the edge fn write it going forward.
--
-- Scope guard: additive only. Nullable column, no existing row loses data, no RLS change.
-- SET NULL (not CASCADE) so purging an analysis never deletes the user's saved job.

-- 1. Nullable source link.
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS analysis_id uuid
  REFERENCES public.analysis_results(id) ON DELETE SET NULL;

-- 2. Partial index for the dashboard lookup (only linked rows).
CREATE INDEX IF NOT EXISTS applications_analysis_id_idx
  ON public.applications (analysis_id)
  WHERE analysis_id IS NOT NULL;

-- 3. Backfill recruiting_lens saved jobs to their NEWEST matching analysis.
--    Match on (user_id, company, role) from raw_response.metadata; DISTINCT ON picks
--    the latest analysis per application. Rows with archived/NULL raw_response metadata
--    stay NULL and degrade gracefully (frontend keeps its company/role fallback).
UPDATE public.applications a
SET analysis_id = m.analysis_id
FROM (
  SELECT DISTINCT ON (a2.id) a2.id AS app_id, ar.id AS analysis_id
  FROM public.applications a2
  JOIN public.analysis_results ar
    ON ar.user_id = a2.user_id
   AND ar.analysis_type = 'recruiting_lens'
   AND lower(trim(ar.raw_response->'metadata'->>'company')) = lower(trim(a2.company_applied))
   AND lower(trim(ar.raw_response->'metadata'->>'roleTitle')) = lower(trim(a2.role_applied))
  WHERE a2.application_source = 'recruiting_lens'
    AND a2.analysis_id IS NULL
  ORDER BY a2.id, ar.created_at DESC
) m
WHERE a.id = m.app_id;

-- 4. Verify: column + FK exist with ON DELETE SET NULL; report backfill coverage.
DO $$
DECLARE
  v_deltype "char";
  v_linked integer;
  v_total  integer;
BEGIN
  SELECT confdeltype INTO v_deltype
  FROM pg_constraint
  WHERE conrelid = 'public.applications'::regclass
    AND contype = 'f'
    AND conname = 'applications_analysis_id_fkey';
  IF v_deltype IS NULL THEN
    RAISE EXCEPTION 'applications_analysis_id_fkey was not created';
  END IF;
  IF v_deltype <> 'n' THEN
    RAISE EXCEPTION 'applications_analysis_id_fkey must be ON DELETE SET NULL (confdeltype=%)', v_deltype;
  END IF;

  SELECT count(*) FILTER (WHERE analysis_id IS NOT NULL), count(*)
    INTO v_linked, v_total
  FROM public.applications
  WHERE application_source = 'recruiting_lens';

  RAISE NOTICE 'applications.analysis_id active; recruiting_lens rows linked: %/%', v_linked, v_total;
END $$;

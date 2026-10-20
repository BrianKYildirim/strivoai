-- Phase 04: atomic, same-row Elite unlock persistence.
--
-- The edge function validates the model delta and complete merged result before
-- calling this RPC. This transaction rechecks ownership, immutable source
-- identity, the exact Free base, lifecycle/usage identities, and persists the
-- resume + new mirror + accounting link atomically.

CREATE UNIQUE INDEX IF NOT EXISTS analysis_results_resume_elite_unlock_idem_unique
  ON public.analysis_results ((key_insights->>'unlock_idempotency_key'))
  WHERE analysis_type = 'resume_analysis'
    AND key_insights->>'generation_mode' = 'incremental_unlock'
    AND key_insights->>'unlock_idempotency_key' IS NOT NULL;

CREATE OR REPLACE FUNCTION public.persist_resume_elite_unlock(
  p_owner_id                    uuid,
  p_resume_id                   uuid,
  p_base_analysis_id            uuid,
  p_expected_file_hash          text,
  p_expected_text_hash          text,
  p_expected_document_hash      text,
  p_expected_base_grading_data  jsonb,
  p_expected_base_fingerprint   text,
  p_idempotency_key             text,
  p_merged_grading_data         jsonb,
  p_generated_sections          text[],
  p_usage_id                    uuid,
  p_run_id                      uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_resume             public.resumes%ROWTYPE;
  v_base_analysis      public.analysis_results%ROWTYPE;
  v_existing_analysis public.analysis_results%ROWTYPE;
  v_merged_analysis_id uuid;
  v_updated_count      integer;
  v_score              numeric;
BEGIN
  IF p_owner_id IS NULL
     OR p_resume_id IS NULL
     OR p_base_analysis_id IS NULL
     OR p_expected_file_hash IS NULL
     OR p_expected_text_hash IS NULL
     OR p_expected_document_hash IS NULL
     OR p_expected_base_grading_data IS NULL
     OR p_expected_base_fingerprint IS NULL
     OR nullif(btrim(p_idempotency_key), '') IS NULL
     OR p_merged_grading_data IS NULL
     OR p_usage_id IS NULL
     OR p_run_id IS NULL THEN
    RAISE EXCEPTION 'persist_resume_elite_unlock: required identity is missing';
  END IF;

  -- One stable intent is serialized even before the row lock is acquired.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  SELECT *
    INTO v_resume
    FROM public.resumes
    WHERE id = p_resume_id
      AND user_id = p_owner_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'persist_resume_elite_unlock: resume ownership mismatch';
  END IF;

  -- Completed replay: return the one durable merged result without another
  -- resume write, mirror insert, usage link, or lifecycle settlement.
  SELECT *
    INTO v_existing_analysis
    FROM public.analysis_results
    WHERE user_id = p_owner_id
      AND source_reference = p_resume_id::text
      AND analysis_type = 'resume_analysis'
      AND key_insights->>'generation_mode' = 'incremental_unlock'
      AND key_insights->>'unlock_idempotency_key' = p_idempotency_key
    LIMIT 1;

  IF v_existing_analysis.id IS NOT NULL THEN
    IF v_resume.analyzed_tier <> 'elite'
       OR v_resume.grading_data IS DISTINCT FROM v_existing_analysis.raw_response THEN
      RAISE EXCEPTION 'persist_resume_elite_unlock: completed replay state conflict';
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'replayed', true,
      'resume_id', v_resume.id,
      'analysis_id', v_existing_analysis.id,
      'usage_id', v_existing_analysis.key_insights->>'usage_id',
      'run_id', v_existing_analysis.key_insights->>'run_id',
      'grading_data', v_resume.grading_data
    );
  END IF;

  IF v_resume.analyzed_tier IS DISTINCT FROM 'free' THEN
    RAISE EXCEPTION 'persist_resume_elite_unlock: original tier conflict';
  END IF;
  IF v_resume.file_hash IS DISTINCT FROM p_expected_file_hash
     OR v_resume.text_hash IS DISTINCT FROM p_expected_text_hash
     OR v_resume.document_hash IS DISTINCT FROM p_expected_document_hash THEN
    RAISE EXCEPTION 'persist_resume_elite_unlock: content identity conflict';
  END IF;
  IF v_resume.grading_data IS DISTINCT FROM p_expected_base_grading_data
     OR p_expected_base_fingerprint <>
       (p_base_analysis_id::text || ':' || p_expected_text_hash) THEN
    RAISE EXCEPTION 'persist_resume_elite_unlock: base fingerprint conflict';
  END IF;

  SELECT *
    INTO v_base_analysis
    FROM public.analysis_results
    WHERE id = p_base_analysis_id
      AND user_id = p_owner_id
      AND source_reference = p_resume_id::text
      AND analysis_type = 'resume_analysis'
      AND raw_response = p_expected_base_grading_data
    FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'persist_resume_elite_unlock: base analysis identity conflict';
  END IF;

  -- Lock and validate the one accepted usage row before any durable write.
  PERFORM 1
    FROM public.usage_tracking
    WHERE id = p_usage_id
      AND user_id = p_owner_id
      AND action_type = 'resume_analysis'
      AND analysis_id IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'persist_resume_elite_unlock: usage identity conflict';
  END IF;

  -- The lifecycle must be the same Elite resume intent and at the saving CAS.
  PERFORM 1
    FROM public.analysis_jobs
    WHERE id = p_run_id
      AND user_id = p_owner_id
      AND feature = 'resume_analysis'
      AND tier = 'elite'
      AND idempotency_key = p_idempotency_key
      AND state = 'saving'
      AND merit_settled = false
      AND refunded = false
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'persist_resume_elite_unlock: lifecycle identity conflict';
  END IF;

  v_score := CASE
    WHEN jsonb_typeof(p_merged_grading_data->'overallScore') = 'number'
      THEN (p_merged_grading_data->>'overallScore')::numeric
    ELSE NULL
  END;

  -- Explicit compare-and-swap predicates remain on the update even under the
  -- row lock. Any stale base or identity writes zero rows and aborts everything.
  UPDATE public.resumes
    SET grading_data = p_merged_grading_data,
        overall_score = v_score,
        analyzed_tier = 'elite',
        analyzed_at = now(),
        updated_at = now()
    WHERE id = p_resume_id
      AND user_id = p_owner_id
      AND analyzed_tier = 'free'
      AND file_hash IS NOT DISTINCT FROM p_expected_file_hash
      AND text_hash IS NOT DISTINCT FROM p_expected_text_hash
      AND document_hash IS NOT DISTINCT FROM p_expected_document_hash
      AND grading_data = p_expected_base_grading_data;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'persist_resume_elite_unlock: resume compare-and-swap conflict';
  END IF;

  INSERT INTO public.analysis_results (
    user_id,
    analysis_type,
    source_reference,
    primary_score,
    key_insights,
    raw_response
  )
  VALUES (
    p_owner_id,
    'resume_analysis',
    p_resume_id::text,
    v_score,
    jsonb_build_object(
      'generation_mode', 'incremental_unlock',
      'base_analysis_id', p_base_analysis_id,
      'unlock_idempotency_key', p_idempotency_key,
      'usage_id', p_usage_id,
      'run_id', p_run_id,
      'generated_sections', to_jsonb(COALESCE(p_generated_sections, ARRAY[]::text[]))
    ),
    p_merged_grading_data
  )
  RETURNING id INTO v_merged_analysis_id;

  UPDATE public.usage_tracking
    SET analysis_id = v_merged_analysis_id
    WHERE id = p_usage_id
      AND user_id = p_owner_id
      AND analysis_id IS NULL;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'persist_resume_elite_unlock: usage compare-and-swap conflict';
  END IF;

  UPDATE public.analysis_jobs
    SET state = 'completed',
        status = 'completed',
        state_updated_at = now(),
        completed_at = now(),
        updated_at = now(),
        result = p_merged_grading_data,
        merit_settled = true
    WHERE id = p_run_id
      AND user_id = p_owner_id
      AND state = 'saving'
      AND merit_settled = false
      AND refunded = false;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'persist_resume_elite_unlock: lifecycle compare-and-swap conflict';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'replayed', false,
    'resume_id', p_resume_id,
    'analysis_id', v_merged_analysis_id,
    'usage_id', p_usage_id,
    'run_id', p_run_id,
    'grading_data', p_merged_grading_data
  );
END;
$$;

REVOKE ALL ON FUNCTION public.persist_resume_elite_unlock(
  uuid, uuid, uuid, text, text, text, jsonb, text, text, jsonb, text[], uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_resume_elite_unlock(
  uuid, uuid, uuid, text, text, text, jsonb, text, text, jsonb, text[], uuid, uuid
) TO service_role;

COMMENT ON FUNCTION public.persist_resume_elite_unlock(
  uuid, uuid, uuid, text, text, text, jsonb, text, text, jsonb, text[], uuid, uuid
) IS 'Phase 04 service-role-only atomic same-row Elite unlock persistence with immutable Free history and idempotent replay.';

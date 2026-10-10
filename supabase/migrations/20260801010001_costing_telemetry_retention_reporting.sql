-- Phase 04.2 / Plan 01: identity detachment, 24-month raw retention,
-- five-year privacy-safe aggregates, and service-role monthly costing views.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE IF NOT EXISTS public.costing_monthly_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL,
  metric_scope text NOT NULL CHECK (metric_scope IN (
    'product_mau', 'feature_usage', 'ai_usage', 'document_usage'
  )),
  feature text NULL,
  tier_at_time text NULL,
  subscription_period_at_time text NULL,
  model text NULL,
  file_type text NULL,
  active_subjects bigint NULL,
  subject_count_suppressed boolean NOT NULL DEFAULT false,
  started_runs bigint NULL,
  completed_runs bigint NULL,
  failed_runs bigint NULL,
  canceled_runs bigint NULL,
  merits_charged bigint NULL,
  merits_refunded bigint NULL,
  total_calls bigint NULL,
  successful_calls bigint NULL,
  failed_calls bigint NULL,
  retry_calls bigint NULL,
  input_tokens bigint NULL,
  output_tokens bigint NULL,
  cache_creation_input_tokens bigint NULL,
  cache_read_input_tokens bigint NULL,
  known_incurred_cost_usd numeric(24, 8) NULL,
  unknown_cost_attempts bigint NULL,
  retry_incurred_cost_usd numeric(24, 8) NULL,
  failed_incurred_cost_usd numeric(24, 8) NULL,
  documents_processed bigint NULL,
  documents_parsed_without_ocr bigint NULL,
  ocr_documents bigint NULL,
  total_document_pages bigint NULL,
  total_ocr_pages bigint NULL,
  ocr_retry_documents bigint NULL,
  ocr_failures bigint NULL,
  unknown_cost_documents bigint NULL,
  rolled_up_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT costing_monthly_aggregates_identity
    UNIQUE NULLS NOT DISTINCT (
      month,
      metric_scope,
      feature,
      tier_at_time,
      subscription_period_at_time,
      model,
      file_type
    )
);

ALTER TABLE public.costing_monthly_aggregates ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  CREATE POLICY "Service role only - costing_monthly_aggregates"
    ON public.costing_monthly_aggregates
    FOR ALL TO authenticated USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
REVOKE ALL ON public.costing_monthly_aggregates FROM anon, authenticated;
GRANT ALL ON public.costing_monthly_aggregates TO service_role;

-- Extend the existing Auth BEFORE DELETE cleanup transaction. Direct identity is
-- removed immediately; random costing_subject_id values and aggregates survive.
CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_removed bigint;
BEGIN
  UPDATE public.costing_subjects
    SET auth_user_id = NULL,
        detached_at = COALESCE(detached_at, now())
    WHERE auth_user_id = OLD.id;

  UPDATE public.feature_runs SET user_id = NULL WHERE user_id = OLD.id;
  UPDATE public.ai_call_telemetry SET user_id = NULL WHERE user_id = OLD.id;
  UPDATE public.document_processing_runs SET user_id = NULL WHERE user_id = OLD.id;

  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects
  WHERE bucket_id IN ('resumes', 'ai-archives')
    AND (
      owner = OLD.id
      OR (storage.foldername(name))[1] = OLD.id::text
    );
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  PERFORM set_config('storage.allow_delete_query', 'false', true);

  RAISE NOTICE
    'handle_auth_user_deleted: detached costing identity and removed % storage object row(s) for user %',
    v_removed,
    OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_deleted();

CREATE OR REPLACE FUNCTION public.rollup_and_prune_costing_telemetry()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Align to complete calendar months. Raw rows are therefore retained for at
  -- least 24 months, while the rollup and delete cover exactly the same months.
  v_raw_cutoff date := date_trunc('month', now() - interval '24 months')::date;
  v_aggregate_cutoff date := date_trunc('month', now() - interval '5 years')::date;
  v_aggregate_rows integer := 0;
  v_count integer := 0;
  v_documents_deleted integer := 0;
  v_ai_deleted integer := 0;
  v_features_deleted integer := 0;
  v_aggregates_deleted integer := 0;
BEGIN
  INSERT INTO public.costing_monthly_aggregates (
    month,
    metric_scope,
    tier_at_time,
    subscription_period_at_time,
    active_subjects,
    subject_count_suppressed,
    rolled_up_at
  )
  SELECT
    date_trunc('month', fr.started_at)::date,
    'product_mau',
    fr.tier_at_time,
    fr.subscription_period_at_time,
    CASE WHEN count(DISTINCT fr.costing_subject_id) < 5 THEN NULL
      ELSE count(DISTINCT fr.costing_subject_id) END,
    count(DISTINCT fr.costing_subject_id) < 5,
    now()
  FROM public.feature_runs fr
  WHERE fr.started_at < v_raw_cutoff
    AND fr.status = 'completed'
    AND fr.environment = 'production'
    AND fr.exclude_from_costing_at_time = false
    AND fr.costing_epoch = 'phase_04_2_complete'
  GROUP BY 1, 3, 4
  ON CONFLICT ON CONSTRAINT costing_monthly_aggregates_identity
  DO UPDATE SET
    active_subjects = EXCLUDED.active_subjects,
    subject_count_suppressed = EXCLUDED.subject_count_suppressed,
    rolled_up_at = EXCLUDED.rolled_up_at;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_aggregate_rows := v_aggregate_rows + v_count;

  INSERT INTO public.costing_monthly_aggregates (
    month,
    metric_scope,
    feature,
    tier_at_time,
    subscription_period_at_time,
    active_subjects,
    subject_count_suppressed,
    started_runs,
    completed_runs,
    failed_runs,
    canceled_runs,
    merits_charged,
    merits_refunded,
    rolled_up_at
  )
  SELECT
    date_trunc('month', fr.started_at)::date,
    'feature_usage',
    fr.feature,
    fr.tier_at_time,
    fr.subscription_period_at_time,
    CASE WHEN count(DISTINCT fr.costing_subject_id) < 5 THEN NULL
      ELSE count(DISTINCT fr.costing_subject_id) END,
    count(DISTINCT fr.costing_subject_id) < 5,
    count(*),
    count(*) FILTER (WHERE fr.status = 'completed'),
    count(*) FILTER (WHERE fr.status = 'failed'),
    count(*) FILTER (WHERE fr.status = 'canceled'),
    sum(fr.merits_charged) FILTER (WHERE fr.merit_charge_known),
    sum(fr.merits_refunded) FILTER (WHERE fr.merit_refund_known),
    now()
  FROM public.feature_runs fr
  WHERE fr.started_at < v_raw_cutoff
    AND fr.environment = 'production'
    AND fr.exclude_from_costing_at_time = false
    AND fr.costing_epoch = 'phase_04_2_complete'
  GROUP BY 1, 3, 4, 5
  ON CONFLICT ON CONSTRAINT costing_monthly_aggregates_identity
  DO UPDATE SET
    active_subjects = EXCLUDED.active_subjects,
    subject_count_suppressed = EXCLUDED.subject_count_suppressed,
    started_runs = EXCLUDED.started_runs,
    completed_runs = EXCLUDED.completed_runs,
    failed_runs = EXCLUDED.failed_runs,
    canceled_runs = EXCLUDED.canceled_runs,
    merits_charged = EXCLUDED.merits_charged,
    merits_refunded = EXCLUDED.merits_refunded,
    rolled_up_at = EXCLUDED.rolled_up_at;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_aggregate_rows := v_aggregate_rows + v_count;

  INSERT INTO public.costing_monthly_aggregates (
    month,
    metric_scope,
    feature,
    tier_at_time,
    model,
    total_calls,
    successful_calls,
    failed_calls,
    retry_calls,
    input_tokens,
    output_tokens,
    cache_creation_input_tokens,
    cache_read_input_tokens,
    known_incurred_cost_usd,
    unknown_cost_attempts,
    retry_incurred_cost_usd,
    failed_incurred_cost_usd,
    rolled_up_at
  )
  SELECT
    date_trunc('month', ai.created_at)::date,
    'ai_usage',
    ai.feature,
    ai.tier,
    ai.model,
    count(*),
    count(*) FILTER (WHERE ai.ok),
    count(*) FILTER (WHERE NOT ai.ok),
    count(*) FILTER (WHERE ai.is_retry IS TRUE),
    sum(ai.input_tokens),
    sum(ai.output_tokens),
    sum(ai.cache_creation_input_tokens),
    sum(ai.cache_read_input_tokens),
    sum(ai.incurred_cost_usd) FILTER (WHERE ai.cost_known IS TRUE),
    count(*) FILTER (WHERE ai.cost_known IS DISTINCT FROM true),
    sum(ai.incurred_cost_usd) FILTER (
      WHERE ai.cost_known IS TRUE AND ai.is_retry IS TRUE
    ),
    sum(ai.incurred_cost_usd) FILTER (
      WHERE ai.cost_known IS TRUE AND NOT ai.ok
    ),
    now()
  FROM public.ai_call_telemetry ai
  WHERE ai.created_at < v_raw_cutoff
    AND ai.environment = 'production'
    AND ai.exclude_from_costing_at_time = false
    AND ai.costing_epoch = 'phase_04_2_complete'
  GROUP BY 1, 3, 4, 5
  ON CONFLICT ON CONSTRAINT costing_monthly_aggregates_identity
  DO UPDATE SET
    total_calls = EXCLUDED.total_calls,
    successful_calls = EXCLUDED.successful_calls,
    failed_calls = EXCLUDED.failed_calls,
    retry_calls = EXCLUDED.retry_calls,
    input_tokens = EXCLUDED.input_tokens,
    output_tokens = EXCLUDED.output_tokens,
    cache_creation_input_tokens = EXCLUDED.cache_creation_input_tokens,
    cache_read_input_tokens = EXCLUDED.cache_read_input_tokens,
    known_incurred_cost_usd = EXCLUDED.known_incurred_cost_usd,
    unknown_cost_attempts = EXCLUDED.unknown_cost_attempts,
    retry_incurred_cost_usd = EXCLUDED.retry_incurred_cost_usd,
    failed_incurred_cost_usd = EXCLUDED.failed_incurred_cost_usd,
    rolled_up_at = EXCLUDED.rolled_up_at;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_aggregate_rows := v_aggregate_rows + v_count;

  INSERT INTO public.costing_monthly_aggregates (
    month,
    metric_scope,
    feature,
    tier_at_time,
    file_type,
    documents_processed,
    documents_parsed_without_ocr,
    ocr_documents,
    total_document_pages,
    total_ocr_pages,
    ocr_retry_documents,
    ocr_failures,
    known_incurred_cost_usd,
    unknown_cost_documents,
    rolled_up_at
  )
  SELECT
    date_trunc('month', doc.started_at)::date,
    'document_usage',
    doc.feature,
    doc.tier_at_time,
    doc.file_type,
    count(*),
    count(*) FILTER (WHERE NOT doc.ocr_triggered AND doc.extraction_status = 'completed'),
    count(*) FILTER (WHERE doc.ocr_triggered),
    sum(doc.page_count),
    sum(doc.ocr_pages),
    count(*) FILTER (WHERE doc.ocr_attempt_count > 1),
    count(*) FILTER (WHERE doc.ocr_status = 'failed'),
    sum(doc.incurred_cost_usd) FILTER (WHERE doc.cost_known IS TRUE),
    count(*) FILTER (WHERE doc.ocr_triggered AND doc.cost_known IS DISTINCT FROM true),
    now()
  FROM public.document_processing_runs doc
  WHERE doc.started_at < v_raw_cutoff
    AND doc.environment = 'production'
    AND doc.exclude_from_costing_at_time = false
    AND doc.costing_epoch = 'phase_04_2_complete'
  GROUP BY 1, 3, 4, 5
  ON CONFLICT ON CONSTRAINT costing_monthly_aggregates_identity
  DO UPDATE SET
    documents_processed = EXCLUDED.documents_processed,
    documents_parsed_without_ocr = EXCLUDED.documents_parsed_without_ocr,
    ocr_documents = EXCLUDED.ocr_documents,
    total_document_pages = EXCLUDED.total_document_pages,
    total_ocr_pages = EXCLUDED.total_ocr_pages,
    ocr_retry_documents = EXCLUDED.ocr_retry_documents,
    ocr_failures = EXCLUDED.ocr_failures,
    known_incurred_cost_usd = EXCLUDED.known_incurred_cost_usd,
    unknown_cost_documents = EXCLUDED.unknown_cost_documents,
    rolled_up_at = EXCLUDED.rolled_up_at;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_aggregate_rows := v_aggregate_rows + v_count;

  DELETE FROM public.document_processing_runs
    WHERE started_at < v_raw_cutoff;
  GET DIAGNOSTICS v_documents_deleted = ROW_COUNT;

  DELETE FROM public.ai_call_telemetry
    WHERE created_at < v_raw_cutoff;
  GET DIAGNOSTICS v_ai_deleted = ROW_COUNT;

  DELETE FROM public.feature_runs
    WHERE started_at < v_raw_cutoff;
  GET DIAGNOSTICS v_features_deleted = ROW_COUNT;

  DELETE FROM public.costing_monthly_aggregates
    WHERE month < v_aggregate_cutoff;
  GET DIAGNOSTICS v_aggregates_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'raw_cutoff', v_raw_cutoff,
    'aggregate_cutoff', v_aggregate_cutoff,
    'aggregate_rows_upserted', v_aggregate_rows,
    'documents_deleted', v_documents_deleted,
    'ai_attempts_deleted', v_ai_deleted,
    'feature_runs_deleted', v_features_deleted,
    'aggregates_deleted', v_aggregates_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rollup_and_prune_costing_telemetry()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollup_and_prune_costing_telemetry()
  TO service_role;

DO $cron$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'costing_telemetry_retention_monthly'
  ) THEN
    PERFORM cron.unschedule('costing_telemetry_retention_monthly');
  END IF;

  PERFORM cron.schedule(
    'costing_telemetry_retention_monthly',
    '27 3 2 * *',
    $job$SELECT public.rollup_and_prune_costing_telemetry();$job$
  );
END
$cron$;

CREATE OR REPLACE VIEW public.costing_monthly_product_mau
WITH (security_invoker = true)
AS
SELECT
  date_trunc('month', fr.started_at)::date AS month,
  fr.tier_at_time,
  fr.subscription_period_at_time,
  count(DISTINCT fr.costing_subject_id)::bigint AS active_users,
  false AS subject_count_suppressed,
  'product_mau_not_supabase_auth_mau'::text AS metric_definition
FROM public.feature_runs fr
WHERE fr.status = 'completed'
  AND fr.environment = 'production'
  AND fr.exclude_from_costing_at_time = false
  AND fr.costing_epoch = 'phase_04_2_complete'
GROUP BY 1, 2, 3
UNION ALL
SELECT
  agg.month,
  agg.tier_at_time,
  agg.subscription_period_at_time,
  agg.active_subjects,
  agg.subject_count_suppressed,
  'product_mau_not_supabase_auth_mau'::text
FROM public.costing_monthly_aggregates agg
WHERE agg.metric_scope = 'product_mau';

CREATE OR REPLACE VIEW public.costing_monthly_feature_usage
WITH (security_invoker = true)
AS
SELECT
  date_trunc('month', fr.started_at)::date AS month,
  fr.feature,
  fr.tier_at_time,
  fr.subscription_period_at_time,
  count(*)::bigint AS started_runs,
  count(*) FILTER (WHERE fr.status = 'completed')::bigint AS completed_runs,
  count(*) FILTER (WHERE fr.status = 'failed')::bigint AS failed_runs,
  count(*) FILTER (WHERE fr.status = 'canceled')::bigint AS canceled_runs,
  count(DISTINCT fr.costing_subject_id)::bigint AS unique_users,
  false AS subject_count_suppressed,
  sum(fr.merits_charged) FILTER (WHERE fr.merit_charge_known)::bigint AS merits_charged,
  sum(fr.merits_refunded) FILTER (WHERE fr.merit_refund_known)::bigint AS merits_refunded
FROM public.feature_runs fr
WHERE fr.environment = 'production'
  AND fr.exclude_from_costing_at_time = false
  AND fr.costing_epoch = 'phase_04_2_complete'
GROUP BY 1, 2, 3, 4
UNION ALL
SELECT
  agg.month,
  agg.feature,
  agg.tier_at_time,
  agg.subscription_period_at_time,
  agg.started_runs,
  agg.completed_runs,
  agg.failed_runs,
  agg.canceled_runs,
  agg.active_subjects,
  agg.subject_count_suppressed,
  agg.merits_charged,
  agg.merits_refunded
FROM public.costing_monthly_aggregates agg
WHERE agg.metric_scope = 'feature_usage';

CREATE OR REPLACE VIEW public.costing_monthly_ai_usage
WITH (security_invoker = true)
AS
SELECT
  date_trunc('month', ai.created_at)::date AS month,
  ai.feature,
  ai.tier AS tier_at_time,
  ai.model,
  count(*)::bigint AS total_calls,
  count(*) FILTER (WHERE ai.ok)::bigint AS successful_calls,
  count(*) FILTER (WHERE NOT ai.ok)::bigint AS failed_calls,
  count(*) FILTER (WHERE ai.is_retry IS TRUE)::bigint AS retry_calls,
  sum(ai.input_tokens)::bigint AS input_tokens,
  sum(ai.output_tokens)::bigint AS output_tokens,
  sum(ai.cache_creation_input_tokens)::bigint AS cache_creation_input_tokens,
  sum(ai.cache_read_input_tokens)::bigint AS cache_read_input_tokens,
  sum(ai.incurred_cost_usd) FILTER (WHERE ai.cost_known IS TRUE) AS known_incurred_cost_usd,
  count(*) FILTER (WHERE ai.cost_known IS DISTINCT FROM true)::bigint AS unknown_cost_attempts,
  sum(ai.incurred_cost_usd) FILTER (
    WHERE ai.cost_known IS TRUE AND ai.is_retry IS TRUE
  ) AS retry_incurred_cost_usd,
  sum(ai.incurred_cost_usd) FILTER (
    WHERE ai.cost_known IS TRUE AND NOT ai.ok
  ) AS failed_incurred_cost_usd
FROM public.ai_call_telemetry ai
WHERE ai.environment = 'production'
  AND ai.exclude_from_costing_at_time = false
  AND ai.costing_epoch = 'phase_04_2_complete'
GROUP BY 1, 2, 3, 4
UNION ALL
SELECT
  agg.month,
  agg.feature,
  agg.tier_at_time,
  agg.model,
  agg.total_calls,
  agg.successful_calls,
  agg.failed_calls,
  agg.retry_calls,
  agg.input_tokens,
  agg.output_tokens,
  agg.cache_creation_input_tokens,
  agg.cache_read_input_tokens,
  agg.known_incurred_cost_usd,
  agg.unknown_cost_attempts,
  agg.retry_incurred_cost_usd,
  agg.failed_incurred_cost_usd
FROM public.costing_monthly_aggregates agg
WHERE agg.metric_scope = 'ai_usage';

CREATE OR REPLACE VIEW public.costing_monthly_document_usage
WITH (security_invoker = true)
AS
SELECT
  date_trunc('month', doc.started_at)::date AS month,
  doc.feature,
  doc.tier_at_time,
  doc.file_type,
  count(*)::bigint AS documents_processed,
  count(*) FILTER (
    WHERE NOT doc.ocr_triggered AND doc.extraction_status = 'completed'
  )::bigint AS documents_parsed_without_ocr,
  count(*) FILTER (WHERE doc.ocr_triggered)::bigint AS ocr_documents,
  count(*) FILTER (WHERE doc.ocr_triggered)::numeric
    / NULLIF(count(*), 0) AS ocr_incidence,
  sum(doc.page_count)::bigint AS total_document_pages,
  sum(doc.ocr_pages)::bigint AS total_ocr_pages,
  sum(doc.ocr_pages)::numeric
    / NULLIF(count(*) FILTER (WHERE doc.ocr_triggered), 0) AS average_ocr_pages,
  count(*) FILTER (WHERE doc.ocr_attempt_count > 1)::bigint AS ocr_retry_documents,
  count(*) FILTER (WHERE doc.ocr_status = 'failed')::bigint AS ocr_failures,
  sum(doc.incurred_cost_usd) FILTER (WHERE doc.cost_known IS TRUE) AS known_incurred_cost_usd,
  count(*) FILTER (
    WHERE doc.ocr_triggered AND doc.cost_known IS DISTINCT FROM true
  )::bigint AS unknown_cost_documents
FROM public.document_processing_runs doc
WHERE doc.environment = 'production'
  AND doc.exclude_from_costing_at_time = false
  AND doc.costing_epoch = 'phase_04_2_complete'
GROUP BY 1, 2, 3, 4
UNION ALL
SELECT
  agg.month,
  agg.feature,
  agg.tier_at_time,
  agg.file_type,
  agg.documents_processed,
  agg.documents_parsed_without_ocr,
  agg.ocr_documents,
  agg.ocr_documents::numeric / NULLIF(agg.documents_processed, 0),
  agg.total_document_pages,
  agg.total_ocr_pages,
  agg.total_ocr_pages::numeric / NULLIF(agg.ocr_documents, 0),
  agg.ocr_retry_documents,
  agg.ocr_failures,
  agg.known_incurred_cost_usd,
  agg.unknown_cost_documents
FROM public.costing_monthly_aggregates agg
WHERE agg.metric_scope = 'document_usage';

-- D-08: explicitly partial historical AI-only surface. It never joins to or
-- implies complete feature/document/Merit correlation.
CREATE OR REPLACE VIEW public.costing_monthly_ai_legacy_partial
WITH (security_invoker = true)
AS
SELECT
  date_trunc('month', ai.created_at)::date AS month,
  ai.feature,
  ai.tier,
  ai.model,
  count(*)::bigint AS total_calls,
  sum(ai.input_tokens)::bigint AS input_tokens,
  sum(ai.output_tokens)::bigint AS output_tokens,
  'partial_ai_only_pre_04_2'::text AS completeness
FROM public.ai_call_telemetry ai
WHERE ai.costing_epoch IS DISTINCT FROM 'phase_04_2_complete'
GROUP BY 1, 2, 3, 4;

-- D-09: comparison only. Incurred views above always use snapshotted event cost.
CREATE OR REPLACE VIEW public.costing_monthly_ai_current_rate_revaluation
WITH (security_invoker = true)
AS
SELECT
  date_trunc('month', ai.created_at)::date AS month,
  ai.feature,
  ai.tier AS tier_at_time,
  ai.model,
  sum(
      ai.input_tokens * price.input_per_million_usd
    + ai.cache_creation_input_tokens * price.cache_write_per_million_usd
    + ai.cache_read_input_tokens * price.cache_read_per_million_usd
    + ai.output_tokens * price.output_per_million_usd
  ) / 1000000.0 AS current_rate_revaluation_usd,
  'comparison_not_incurred_cost'::text AS valuation_basis
FROM public.ai_call_telemetry ai
JOIN LATERAL (
  SELECT pp.*
  FROM public.provider_pricing pp
  WHERE pp.provider = 'anthropic'
    AND pp.exact_sku = ai.model
    AND pp.effective_to IS NULL
  ORDER BY pp.effective_from DESC
  LIMIT 1
) price ON true
WHERE ai.environment = 'production'
  AND ai.exclude_from_costing_at_time = false
  AND ai.costing_epoch = 'phase_04_2_complete'
  AND ai.input_tokens IS NOT NULL
  AND ai.output_tokens IS NOT NULL
  AND ai.cache_creation_input_tokens IS NOT NULL
  AND ai.cache_read_input_tokens IS NOT NULL
GROUP BY 1, 2, 3, 4;

REVOKE ALL ON public.costing_monthly_product_mau FROM anon, authenticated;
REVOKE ALL ON public.costing_monthly_feature_usage FROM anon, authenticated;
REVOKE ALL ON public.costing_monthly_ai_usage FROM anon, authenticated;
REVOKE ALL ON public.costing_monthly_document_usage FROM anon, authenticated;
REVOKE ALL ON public.costing_monthly_ai_legacy_partial FROM anon, authenticated;
REVOKE ALL ON public.costing_monthly_ai_current_rate_revaluation FROM anon, authenticated;

GRANT SELECT ON public.costing_monthly_product_mau TO service_role;
GRANT SELECT ON public.costing_monthly_feature_usage TO service_role;
GRANT SELECT ON public.costing_monthly_ai_usage TO service_role;
GRANT SELECT ON public.costing_monthly_document_usage TO service_role;
GRANT SELECT ON public.costing_monthly_ai_legacy_partial TO service_role;
GRANT SELECT ON public.costing_monthly_ai_current_rate_revaluation TO service_role;

DO $$
DECLARE v_count integer; v_secdef boolean;
BEGIN
  SELECT count(*) INTO v_count
  FROM cron.job
  WHERE jobname = 'costing_telemetry_retention_monthly';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected one costing_telemetry_retention_monthly job, found %', v_count;
  END IF;

  SELECT prosecdef INTO v_secdef
  FROM pg_proc
  WHERE proname = 'rollup_and_prune_costing_telemetry'
    AND pronamespace = 'public'::regnamespace;
  IF v_secdef IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'rollup_and_prune_costing_telemetry must be SECURITY DEFINER';
  END IF;
END $$;

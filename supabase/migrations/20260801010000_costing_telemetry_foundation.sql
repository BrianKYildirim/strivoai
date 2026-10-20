-- Phase 04.2 / Plan 01: backend-only costing telemetry foundation.
-- Additive and re-runnable. Counts and controlled identifiers only: never prompts,
-- document text, generated results, emails, payment data, or secrets.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.costing_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  detached_at timestamptz NULL
);

COMMENT ON TABLE public.costing_subjects IS
  'Random, non-derived costing identity. auth_user_id is detached on account deletion.';

CREATE TABLE IF NOT EXISTS public.costing_account_classifications (
  costing_subject_id uuid PRIMARY KEY
    REFERENCES public.costing_subjects(id) ON DELETE CASCADE,
  exclude_from_costing boolean NOT NULL DEFAULT false,
  classification_reason text NOT NULL DEFAULT 'ordinary_account'
    CHECK (classification_reason IN (
      'ordinary_account', 'internal_account', 'test_account', 'synthetic_account',
      'operator_override'
    )),
  classified_at timestamptz NOT NULL DEFAULT now(),
  classified_by text NOT NULL DEFAULT 'system'
    CHECK (classified_by IN ('system', 'operator', 'migration')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.provider_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('anthropic', 'mistral', 'textract')),
  exact_sku text NOT NULL,
  billing_unit text NOT NULL CHECK (billing_unit IN (
    'per_million_tokens', 'per_1000_pages'
  )),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  region text NULL,
  api_variant text NULL,
  input_per_million_usd numeric(18, 8) NULL CHECK (input_per_million_usd >= 0),
  output_per_million_usd numeric(18, 8) NULL CHECK (output_per_million_usd >= 0),
  cache_write_per_million_usd numeric(18, 8) NULL
    CHECK (cache_write_per_million_usd >= 0),
  cache_read_per_million_usd numeric(18, 8) NULL
    CHECK (cache_read_per_million_usd >= 0),
  pages_per_1000_usd numeric(18, 8) NULL CHECK (pages_per_1000_usd >= 0),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz NULL,
  source_url text NOT NULL,
  source_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_pricing_window_valid
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT provider_pricing_unit_values
    CHECK (
      (billing_unit = 'per_million_tokens'
        AND input_per_million_usd IS NOT NULL
        AND output_per_million_usd IS NOT NULL
        AND pages_per_1000_usd IS NULL)
      OR
      (billing_unit = 'per_1000_pages'
        AND pages_per_1000_usd IS NOT NULL
        AND input_per_million_usd IS NULL
        AND output_per_million_usd IS NULL
        AND cache_write_per_million_usd IS NULL
        AND cache_read_per_million_usd IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_pricing_version_unique
  ON public.provider_pricing (
    provider,
    exact_sku,
    COALESCE(region, ''),
    COALESCE(api_variant, ''),
    effective_from
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'provider_pricing_no_overlap'
      AND conrelid = 'public.provider_pricing'::regclass
  ) THEN
    ALTER TABLE public.provider_pricing
      ADD CONSTRAINT provider_pricing_no_overlap
      EXCLUDE USING gist (
        provider WITH =,
        exact_sku WITH =,
        (COALESCE(region, '')) WITH =,
        (COALESCE(api_variant, '')) WITH =,
        tstzrange(effective_from, effective_to, '[)') WITH &&
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.prevent_provider_pricing_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'provider_pricing is append-only; insert a new effective version';
END;
$$;

DROP TRIGGER IF EXISTS provider_pricing_append_only ON public.provider_pricing;
CREATE TRIGGER provider_pricing_append_only
  BEFORE UPDATE OR DELETE ON public.provider_pricing
  FOR EACH ROW EXECUTE FUNCTION public.prevent_provider_pricing_mutation();

-- Reviewed defaults actually present in this repository. Environment overrides are
-- intentionally not guessed; unresolved provider/SKU combinations remain unknown.
INSERT INTO public.provider_pricing (
  provider, exact_sku, billing_unit,
  input_per_million_usd, output_per_million_usd,
  cache_write_per_million_usd, cache_read_per_million_usd,
  effective_from, source_url, source_version
)
VALUES (
  'anthropic', 'claude-haiku-4-5-20251001', 'per_million_tokens',
  1.00, 5.00, 1.25, 0.10,
  '2025-10-15T00:00:00Z',
  'https://www.anthropic.com/claude/haiku',
  'phase_04_2_reviewed_2026_08_01'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.provider_pricing (
  provider, exact_sku, billing_unit, pages_per_1000_usd,
  effective_from, source_url, source_version
)
VALUES (
  'mistral', 'mistral-ocr-4-0', 'per_1000_pages', 4.00,
  '2026-06-23T00:00:00Z',
  'https://docs.mistral.ai/models/model-cards/ocr-4-0',
  'phase_04_2_reviewed_2026_08_01'
)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.feature_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NULL,
  server_action_key_hash text NULL,
  costing_subject_id uuid NOT NULL
    REFERENCES public.costing_subjects(id) ON DELETE RESTRICT,
  user_id uuid NULL,
  analysis_job_id uuid NULL REFERENCES public.analysis_jobs(id) ON DELETE SET NULL,
  feature text NOT NULL CHECK (feature IN (
    'resume_analysis', 'linkedin_grader', 'career_compass',
    'recruiting_lens', 'interview_prep'
  )),
  run_variant text NOT NULL DEFAULT 'standard' CHECK (run_variant IN (
    'standard', 'cache_reuse', 'rerun', 'elite_unlock', 'evaluation'
  )),
  status text NOT NULL DEFAULT 'started' CHECK (status IN (
    'started', 'completed', 'failed', 'canceled'
  )),
  tier_at_time text NOT NULL CHECK (tier_at_time IN ('free', 'pro', 'elite')),
  subscription_period_at_time text NULL
    CHECK (subscription_period_at_time IS NULL OR subscription_period_at_time IN ('monthly', 'annual')),
  input_type text NOT NULL DEFAULT 'unknown' CHECK (input_type IN (
    'none', 'text', 'pdf', 'docx', 'url', 'mixed', 'unknown'
  )),
  document_count integer NULL CHECK (document_count IS NULL OR document_count >= 0),
  environment text NOT NULL CHECK (environment IN (
    'production', 'staging', 'development', 'test'
  )),
  exclude_from_costing_at_time boolean NOT NULL DEFAULT false,
  telemetry_version text NOT NULL DEFAULT '04.2',
  costing_epoch text NOT NULL DEFAULT 'phase_04_2_complete',
  served_from_cache boolean NOT NULL DEFAULT false,
  cache_source text NULL CHECK (cache_source IS NULL OR cache_source IN (
    'analysis_cache', 'stored_result', 'accepted_extraction'
  )),
  merits_charged integer NULL CHECK (merits_charged IS NULL OR merits_charged >= 0),
  merits_refunded integer NULL CHECK (merits_refunded IS NULL OR merits_refunded >= 0),
  merit_charge_known boolean NOT NULL DEFAULT false,
  merit_refund_known boolean NOT NULL DEFAULT false,
  error_code text NULL,
  error_category text NULL CHECK (error_category IS NULL OR error_category IN (
    'validation', 'authentication', 'authorization', 'rate_limit', 'provider',
    'timeout', 'parsing', 'persistence', 'abandoned', 'canceled', 'internal'
  )),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feature_runs_terminal_time CHECK (
    (status = 'started' AND completed_at IS NULL)
    OR (status IN ('completed', 'failed', 'canceled') AND completed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS feature_runs_server_action_unique
  ON public.feature_runs (server_action_key_hash)
  WHERE server_action_key_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS feature_runs_started_at_idx
  ON public.feature_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS feature_runs_subject_time_idx
  ON public.feature_runs (costing_subject_id, started_at DESC);
CREATE INDEX IF NOT EXISTS feature_runs_cohort_idx
  ON public.feature_runs (feature, tier_at_time, status, started_at DESC);
CREATE INDEX IF NOT EXISTS feature_runs_analysis_job_idx
  ON public.feature_runs (analysis_job_id) WHERE analysis_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS feature_runs_request_idx
  ON public.feature_runs (request_id) WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.document_processing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_run_id uuid NOT NULL REFERENCES public.feature_runs(id) ON DELETE CASCADE,
  costing_subject_id uuid NOT NULL
    REFERENCES public.costing_subjects(id) ON DELETE RESTRICT,
  request_id text NULL,
  user_id uuid NULL,
  document_ordinal integer NOT NULL DEFAULT 1 CHECK (document_ordinal > 0),
  feature text NOT NULL CHECK (feature IN (
    'resume_analysis', 'linkedin_grader', 'career_compass',
    'recruiting_lens', 'interview_prep'
  )),
  tier_at_time text NOT NULL CHECK (tier_at_time IN ('free', 'pro', 'elite')),
  environment text NOT NULL CHECK (environment IN (
    'production', 'staging', 'development', 'test'
  )),
  exclude_from_costing_at_time boolean NOT NULL DEFAULT false,
  telemetry_version text NOT NULL DEFAULT '04.2',
  costing_epoch text NOT NULL DEFAULT 'phase_04_2_complete',
  file_type text NOT NULL CHECK (file_type IN ('pdf', 'docx')),
  page_count integer NULL CHECK (page_count IS NULL OR page_count >= 0),
  file_size_bytes bigint NULL CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  initial_extractor text NOT NULL CHECK (initial_extractor IN (
    'pdf_parser', 'docx_parser', 'accepted_extraction', 'unknown'
  )),
  final_extractor text NULL CHECK (final_extractor IS NULL OR final_extractor IN (
    'pdf_parser', 'docx_parser', 'accepted_extraction', 'mistral', 'textract',
    'claude_ocr', 'none'
  )),
  extraction_status text NOT NULL CHECK (extraction_status IN (
    'started', 'completed', 'empty', 'insufficient_text', 'failed', 'unsupported'
  )),
  extracted_character_count integer NULL
    CHECK (extracted_character_count IS NULL OR extracted_character_count >= 0),
  extraction_duration_ms integer NULL
    CHECK (extraction_duration_ms IS NULL OR extraction_duration_ms >= 0),
  ocr_triggered boolean NOT NULL DEFAULT false,
  ocr_trigger_reason text NULL CHECK (ocr_trigger_reason IS NULL OR ocr_trigger_reason IN (
    'empty_extraction', 'insufficient_text', 'scanned_document', 'parser_error',
    'unsupported_encoding', 'manual_fallback', 'other'
  )),
  ocr_provider text NULL CHECK (ocr_provider IS NULL OR ocr_provider IN (
    'mistral', 'textract', 'anthropic'
  )),
  ocr_model text NULL,
  ocr_pages integer NULL CHECK (ocr_pages IS NULL OR ocr_pages >= 0),
  ocr_attempt_count integer NULL CHECK (ocr_attempt_count IS NULL OR ocr_attempt_count >= 0),
  ocr_status text NULL CHECK (ocr_status IS NULL OR ocr_status IN (
    'not_triggered', 'completed', 'failed', 'unknown'
  )),
  provider_request_id text NULL,
  pricing_id uuid NULL REFERENCES public.provider_pricing(id) ON DELETE RESTRICT,
  provider_reported_cost_usd numeric(18, 8) NULL
    CHECK (provider_reported_cost_usd IS NULL OR provider_reported_cost_usd >= 0),
  calculated_cost_usd numeric(18, 8) NULL
    CHECK (calculated_cost_usd IS NULL OR calculated_cost_usd >= 0),
  incurred_cost_usd numeric(18, 8) NULL
    CHECK (incurred_cost_usd IS NULL OR incurred_cost_usd >= 0),
  cost_variance_usd numeric(18, 8) NULL,
  cost_known boolean NOT NULL DEFAULT false,
  cost_confidence text NOT NULL DEFAULT 'unknown' CHECK (cost_confidence IN (
    'reported', 'calculated', 'referenced_ai', 'verified_zero', 'unknown'
  )),
  ai_call_telemetry_id bigint NULL
    REFERENCES public.ai_call_telemetry(id) ON DELETE SET NULL,
  error_code text NULL,
  error_category text NULL CHECK (error_category IS NULL OR error_category IN (
    'validation', 'provider', 'timeout', 'parsing', 'unsupported', 'internal'
  )),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_cost_excludes_referenced_ai CHECK (
    ai_call_telemetry_id IS NULL
    OR (
      provider_reported_cost_usd IS NULL
      AND calculated_cost_usd IS NULL
      AND incurred_cost_usd IS NULL
      AND cost_confidence = 'referenced_ai'
    )
  ),
  CONSTRAINT document_ocr_consistency CHECK (
    (ocr_triggered = false AND ocr_trigger_reason IS NULL)
    OR ocr_triggered = true
  ),
  CONSTRAINT document_terminal_time CHECK (
    extraction_status = 'started' OR completed_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS document_processing_run_ordinal_unique
  ON public.document_processing_runs (feature_run_id, document_ordinal);
CREATE UNIQUE INDEX IF NOT EXISTS document_processing_provider_request_unique
  ON public.document_processing_runs (provider_request_id)
  WHERE provider_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS document_processing_run_idx
  ON public.document_processing_runs (feature_run_id);
CREATE INDEX IF NOT EXISTS document_processing_time_idx
  ON public.document_processing_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS document_processing_cohort_idx
  ON public.document_processing_runs (feature, tier_at_time, ocr_triggered, started_at DESC);

-- Preserve every Phase 02 column and row. All new columns are nullable for legacy
-- compatibility and become required only for the complete Phase 04.2 epoch.
ALTER TABLE public.ai_call_telemetry
  ADD COLUMN IF NOT EXISTS feature_run_id uuid NULL
    REFERENCES public.feature_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS costing_subject_id uuid NULL
    REFERENCES public.costing_subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS operation_name text NULL,
  ADD COLUMN IF NOT EXISTS attempt_number integer NULL,
  ADD COLUMN IF NOT EXISTS is_retry boolean NULL,
  ADD COLUMN IF NOT EXISTS provider text NULL,
  ADD COLUMN IF NOT EXISTS provider_request_id text NULL,
  ADD COLUMN IF NOT EXISTS environment text NULL,
  ADD COLUMN IF NOT EXISTS exclude_from_costing_at_time boolean NULL,
  ADD COLUMN IF NOT EXISTS telemetry_version text NULL,
  ADD COLUMN IF NOT EXISTS costing_epoch text NULL,
  ADD COLUMN IF NOT EXISTS started_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS status text NULL,
  ADD COLUMN IF NOT EXISTS error_code text NULL,
  ADD COLUMN IF NOT EXISTS error_category text NULL,
  ADD COLUMN IF NOT EXISTS pricing_id uuid NULL
    REFERENCES public.provider_pricing(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS incurred_cost_usd numeric(18, 8) NULL,
  ADD COLUMN IF NOT EXISTS cost_known boolean NULL,
  ADD COLUMN IF NOT EXISTS cost_confidence text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_call_telemetry_attempt_number_check'
      AND conrelid = 'public.ai_call_telemetry'::regclass
  ) THEN
    ALTER TABLE public.ai_call_telemetry
      ADD CONSTRAINT ai_call_telemetry_attempt_number_check
      CHECK (attempt_number IS NULL OR attempt_number > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_call_telemetry_environment_check'
      AND conrelid = 'public.ai_call_telemetry'::regclass
  ) THEN
    ALTER TABLE public.ai_call_telemetry
      ADD CONSTRAINT ai_call_telemetry_environment_check
      CHECK (environment IS NULL OR environment IN (
        'production', 'staging', 'development', 'test'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_call_telemetry_cost_confidence_check'
      AND conrelid = 'public.ai_call_telemetry'::regclass
  ) THEN
    ALTER TABLE public.ai_call_telemetry
      ADD CONSTRAINT ai_call_telemetry_cost_confidence_check
      CHECK (cost_confidence IS NULL OR cost_confidence IN (
        'calculated', 'reported', 'verified_zero', 'unknown'
      ));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ai_call_telemetry_physical_attempt_unique
  ON public.ai_call_telemetry (feature_run_id, operation_name, attempt_number)
  WHERE feature_run_id IS NOT NULL
    AND operation_name IS NOT NULL
    AND attempt_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ai_call_telemetry_provider_request_unique
  ON public.ai_call_telemetry (provider_request_id)
  WHERE provider_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_call_telemetry_feature_run_idx
  ON public.ai_call_telemetry (feature_run_id)
  WHERE feature_run_id IS NOT NULL;

-- Server-owned telemetry only. service_role bypasses RLS, but explicit grants make
-- fresh-environment replay independent of platform defaults.
ALTER TABLE public.costing_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.costing_account_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_processing_runs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'costing_subjects',
    'costing_account_classifications',
    'provider_pricing',
    'feature_runs',
    'document_processing_runs'
  ] LOOP
    BEGIN
      -- The policy NAME is interpolated with %s because it sits INSIDE the double quotes
      -- already present in the template; %I would emit its own quotes and produce a nested-
      -- quote name. The relation uses %I so it is properly quoted as an identifier.
      -- (`%` followed by `"` is not a valid format() specifier at all and raises SQLSTATE
      -- 22023 at execution time, which is how this shipped undetected: no offline gate in
      -- this repo executes SQL against a live Postgres.)
      -- Safe: v_table only ever takes the hardcoded literals in the ARRAY above; no value
      -- here originates from user input, a catalog scan, or any other untrusted source.
      EXECUTE format(
        'CREATE POLICY "Service role only - %s" ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)',
        v_table,
        v_table
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

REVOKE ALL ON public.costing_subjects FROM anon, authenticated;
REVOKE ALL ON public.costing_account_classifications FROM anon, authenticated;
REVOKE ALL ON public.provider_pricing FROM anon, authenticated;
REVOKE UPDATE, DELETE ON public.provider_pricing FROM service_role;
REVOKE ALL ON public.feature_runs FROM anon, authenticated;
REVOKE ALL ON public.document_processing_runs FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_provider_pricing_mutation() FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.costing_subjects TO service_role;
GRANT ALL ON public.costing_account_classifications TO service_role;
GRANT SELECT, INSERT ON public.provider_pricing TO service_role;
GRANT ALL ON public.feature_runs TO service_role;
GRANT ALL ON public.document_processing_runs TO service_role;

DO $$
DECLARE v_table text; v_rls boolean;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'costing_subjects',
    'costing_account_classifications',
    'provider_pricing',
    'feature_runs',
    'document_processing_runs'
  ] LOOP
    SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c
    WHERE c.oid = format('public.%I', v_table)::regclass;
    IF v_rls IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'RLS missing on public.%', v_table;
    END IF;
  END LOOP;

  IF to_regclass('public.ai_call_telemetry') IS NULL THEN
    RAISE EXCEPTION 'Phase 02 ai_call_telemetry ledger is missing';
  END IF;
END $$;

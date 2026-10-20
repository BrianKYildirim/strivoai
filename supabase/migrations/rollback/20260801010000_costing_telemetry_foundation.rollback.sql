-- Operator-reviewed rollback for Phase 04.2 foundation only.
-- This intentionally preserves public.ai_call_telemetry and every Phase 02 column.

DROP INDEX IF EXISTS public.ai_call_telemetry_provider_request_unique;
DROP INDEX IF EXISTS public.ai_call_telemetry_physical_attempt_unique;
DROP INDEX IF EXISTS public.ai_call_telemetry_feature_run_idx;

ALTER TABLE public.ai_call_telemetry
  DROP CONSTRAINT IF EXISTS ai_call_telemetry_attempt_number_check,
  DROP CONSTRAINT IF EXISTS ai_call_telemetry_environment_check,
  DROP CONSTRAINT IF EXISTS ai_call_telemetry_cost_confidence_check,
  DROP COLUMN IF EXISTS feature_run_id,
  DROP COLUMN IF EXISTS costing_subject_id,
  DROP COLUMN IF EXISTS operation_name,
  DROP COLUMN IF EXISTS attempt_number,
  DROP COLUMN IF EXISTS is_retry,
  DROP COLUMN IF EXISTS provider,
  DROP COLUMN IF EXISTS provider_request_id,
  DROP COLUMN IF EXISTS environment,
  DROP COLUMN IF EXISTS exclude_from_costing_at_time,
  DROP COLUMN IF EXISTS telemetry_version,
  DROP COLUMN IF EXISTS costing_epoch,
  DROP COLUMN IF EXISTS started_at,
  DROP COLUMN IF EXISTS completed_at,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS error_code,
  DROP COLUMN IF EXISTS error_category,
  DROP COLUMN IF EXISTS pricing_id,
  DROP COLUMN IF EXISTS incurred_cost_usd,
  DROP COLUMN IF EXISTS cost_known,
  DROP COLUMN IF EXISTS cost_confidence;

DROP TABLE IF EXISTS public.document_processing_runs;
DROP TABLE IF EXISTS public.feature_runs;
DROP TRIGGER IF EXISTS provider_pricing_append_only ON public.provider_pricing;
DROP FUNCTION IF EXISTS public.prevent_provider_pricing_mutation();
DROP TABLE IF EXISTS public.provider_pricing;
DROP TABLE IF EXISTS public.costing_account_classifications;
DROP TABLE IF EXISTS public.costing_subjects;

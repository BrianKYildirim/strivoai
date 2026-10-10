-- Operator-reviewed rollback for Phase 04.2 retention/reporting only.
-- Raw rows already pruned by the scheduled function cannot be restored.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'costing_telemetry_retention_monthly'
  ) THEN
    PERFORM cron.unschedule('costing_telemetry_retention_monthly');
  END IF;
END $$;

DROP VIEW IF EXISTS public.costing_monthly_ai_current_rate_revaluation;
DROP VIEW IF EXISTS public.costing_monthly_ai_legacy_partial;
DROP VIEW IF EXISTS public.costing_monthly_document_usage;
DROP VIEW IF EXISTS public.costing_monthly_ai_usage;
DROP VIEW IF EXISTS public.costing_monthly_feature_usage;
DROP VIEW IF EXISTS public.costing_monthly_product_mau;
DROP FUNCTION IF EXISTS public.rollup_and_prune_costing_telemetry();
DROP TABLE IF EXISTS public.costing_monthly_aggregates;

-- Restore the pre-04.2 Auth cleanup body (Storage cleanup only).
CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_removed bigint;
BEGIN
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects
  WHERE bucket_id IN ('resumes', 'ai-archives')
    AND (
      owner = OLD.id
      OR (storage.foldername(name))[1] = OLD.id::text
    );
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  PERFORM set_config('storage.allow_delete_query', 'false', true);
  RAISE NOTICE 'handle_auth_user_deleted: removed % storage object row(s) for user %', v_removed, OLD.id;
  RETURN OLD;
END;
$$;

-- ROLLBACK for 20260721000000_ai_call_telemetry.sql
--
-- Drops the Phase 02 per-call Anthropic token telemetry table. Purely additive
-- migration, so the rollback is a clean drop: no other object references
-- public.ai_call_telemetry (no FKs in or out, no views, no RPCs).
--
-- WARNING: this destroys accumulated telemetry history. Export first if the
-- right-sizing analysis has not yet been completed:
--   COPY (SELECT * FROM public.ai_call_telemetry) TO STDOUT WITH CSV HEADER;

DROP POLICY IF EXISTS "Service role only - no anon/authenticated access"
  ON public.ai_call_telemetry;

DROP INDEX IF EXISTS public.ai_call_telemetry_truncated_idx;
DROP INDEX IF EXISTS public.ai_call_telemetry_req_id_idx;
DROP INDEX IF EXISTS public.ai_call_telemetry_cell_idx;
DROP INDEX IF EXISTS public.ai_call_telemetry_created_at_idx;

DROP TABLE IF EXISTS public.ai_call_telemetry;

DO $$
BEGIN
  IF to_regclass('public.ai_call_telemetry') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback failed: public.ai_call_telemetry still exists';
  END IF;
  RAISE NOTICE 'public.ai_call_telemetry dropped';
END $$;

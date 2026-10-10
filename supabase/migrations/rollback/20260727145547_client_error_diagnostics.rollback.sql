-- ROLLBACK for 20260728000000_client_error_diagnostics.sql
--
-- Drops the Phase 03 (XLOG-01/XLOG-02) client device diagnostics table. The forward
-- migration is purely additive - it created exactly one new object graph and modified
-- no existing table, policy or grant - so this clean drop fully reverses it. DROP TABLE
-- takes the four ced_* indexes, the deny-all policy and the bigserial sequence with it.
-- No other object depends on public.client_error_diagnostics (no foreign keys in or
-- out, no views, no RPCs). Phase 02's public.ai_call_telemetry is a separate table and
-- is entirely unaffected (D-12).
--
-- WARNING: this destroys accumulated client failure history. Export first if the
-- cross-device audit has not yet been completed:
--   COPY (SELECT * FROM public.client_error_diagnostics) TO STDOUT WITH CSV HEADER;

DROP TABLE IF EXISTS public.client_error_diagnostics;

DO $$
BEGIN
  IF to_regclass('public.client_error_diagnostics') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback failed: public.client_error_diagnostics still exists';
  END IF;
  RAISE NOTICE 'public.client_error_diagnostics dropped';
END $$;

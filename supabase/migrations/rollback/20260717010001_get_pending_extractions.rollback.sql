-- ROLLBACK for 20260717010001_get_pending_extractions.sql
--
-- Drops the get_pending_extractions RPC.
--
-- ORDERING: this rollback is only safe once extract-analysis-structure no longer calls the
-- RPC. runCatchup calls .rpc("get_pending_extractions", ...) as of quick task 260716-qtt --
-- redeploy the prior version of that function FIRST, or catchup will fail every run with
-- "function public.get_pending_extractions(integer) does not exist" (the run returns
-- failed: 1 and extracts nothing; it does not corrupt data).
--
-- WARNING: applying this rollback restores the head-of-line block -- catchup goes back to
-- scanning the oldest 50 analysis_results regardless of whether they were already
-- extracted, so already-extracted rows re-occupy the window and rows past rank 50 become
-- invisible to the safety net again.

DROP FUNCTION IF EXISTS public.get_pending_extractions(integer);

-- Verify: the function is gone.
DO $$
BEGIN
  IF to_regprocedure('public.get_pending_extractions(integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'get_pending_extractions(integer) still present after rollback';
  END IF;

  RAISE NOTICE 'get_pending_extractions dropped';
END $$;

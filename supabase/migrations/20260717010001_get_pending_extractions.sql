-- Quick task 260716-qtt (2026-07-17)
--
-- DEFECT: the extract-analysis-structure catchup safety net is already dead for the newest
-- rows, and silently degrades further as analysis_results grows.
--
-- ROOT CAUSE: runCatchup (extract-analysis-structure/index.ts:93-99) selects the oldest 50
-- analysis_results rows by created_at with NO "not yet extracted" filter:
--
--     .from("analysis_results").select(...).lt("created_at", cutoff)
--     .in("analysis_type", [...]).order("created_at", { ascending: true }).limit(50)
--
-- Already-extracted rows are fetched and then skipped in application code, so they
-- permanently occupy the 50-row window -- a classic head-of-line block. With 84 eligible
-- rows on prod, ranks 51-84 are invisible to catchup and always will be. Any extraction
-- failure past rank 50 would never be repaired. (At planning time 0 legitimate rows were
-- starved, so there is no user impact yet -- but Resume Analysis is business-critical and
-- the safety net must actually work.)
--
-- FIX: push the "pending" predicate into the database so the window contains only rows that
-- genuinely still need extraction. get_pending_extractions returns exactly the columns
-- runCatchup selects, for rows that are older than the 5-minute settle cutoff and have NO
-- matching version row for their type.
--
-- recruiting_lens is excluded: the caller already skips it (plan 42-08), so returning it
-- would only let it consume window slots. The direct-dispatch path (serve handler) is
-- unaffected and still handles recruiting_lens.
--
-- SECURITY: SECURITY DEFINER + EXECUTE granted to service_role ONLY. This function returns
-- OTHER USERS' raw_response blobs and deliberately bypasses RLS, so anon/authenticated must
-- never hold EXECUTE -- that would be a mass data disclosure. The default PUBLIC EXECUTE
-- that Postgres grants on new functions is revoked explicitly below, and the DO block at
-- the end fails loudly if anon or authenticated can reach it.
--
-- p_limit is clamped to [1, 200] so a caller cannot turn this into an unbounded table scan.

CREATE OR REPLACE FUNCTION public.get_pending_extractions(p_limit integer DEFAULT 50)
 RETURNS TABLE (
   id uuid,
   user_id uuid,
   analysis_type text,
   primary_score integer,
   raw_response jsonb,
   source_reference text,
   created_at timestamptz
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    ar.id,
    ar.user_id,
    ar.analysis_type,
    ar.primary_score,
    ar.raw_response,
    ar.source_reference,
    ar.created_at
  FROM public.analysis_results ar
  WHERE ar.created_at < now() - interval '5 minutes'
    AND ar.analysis_type IN ('resume_analysis', 'linkedin_grading')
    AND (
      (ar.analysis_type = 'resume_analysis' AND NOT EXISTS (
        SELECT 1 FROM public.resume_versions rv
        WHERE rv.user_id = ar.user_id
          AND rv.source_analysis_results_id = ar.id
      ))
      OR
      (ar.analysis_type = 'linkedin_grading' AND NOT EXISTS (
        SELECT 1 FROM public.linkedin_versions lv
        WHERE lv.user_id = ar.user_id
          AND lv.source_analysis_results_id = ar.id
      ))
    )
  ORDER BY ar.created_at ASC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
$function$;

ALTER FUNCTION public.get_pending_extractions(integer) OWNER TO postgres;

-- Lock it down: no PUBLIC/anon/authenticated EXECUTE; service_role only.
REVOKE ALL ON FUNCTION public.get_pending_extractions(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pending_extractions(integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_pending_extractions(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_extractions(integer) TO service_role;

-- Verify: the function exists, service_role holds EXECUTE, and anon/authenticated do NOT.
DO $$
DECLARE v_svc integer; v_exposed integer;
BEGIN
  IF to_regprocedure('public.get_pending_extractions(integer)') IS NULL THEN
    RAISE EXCEPTION 'get_pending_extractions(integer) was not created';
  END IF;

  SELECT count(*) INTO v_svc
  FROM information_schema.role_routine_grants
  WHERE grantee = 'service_role' AND specific_schema = 'public'
    AND routine_name = 'get_pending_extractions' AND privilege_type = 'EXECUTE';
  IF v_svc < 1 THEN
    RAISE EXCEPTION 'get_pending_extractions: service_role must hold EXECUTE';
  END IF;

  SELECT count(*) INTO v_exposed
  FROM information_schema.role_routine_grants
  WHERE grantee IN ('anon', 'authenticated', 'PUBLIC') AND specific_schema = 'public'
    AND routine_name = 'get_pending_extractions' AND privilege_type = 'EXECUTE';
  IF v_exposed <> 0 THEN
    RAISE EXCEPTION 'get_pending_extractions: anon/authenticated/PUBLIC must NOT hold EXECUTE (found %) -- it returns other users raw_response', v_exposed;
  END IF;

  RAISE NOTICE 'get_pending_extractions: created; service_role EXECUTE only';
END $$;

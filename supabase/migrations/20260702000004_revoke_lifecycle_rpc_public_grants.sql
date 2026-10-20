-- Phase 03 · 03-01 (corrective) · LIFE-05 / SEC —
-- Lock the two analysis-lifecycle CAS RPCs to service_role ONLY.
--
-- WHY THIS EXISTS (empirical finding on preview cimjltzovkahkqecpwgi):
-- Supabase's default privileges auto-GRANT EXECUTE to anon + authenticated +
-- service_role on every new function in the `public` schema — as EXPLICIT role
-- grants, NOT via PUBLIC. So the `REVOKE ALL ... FROM public` in
-- 20260702000001 was a no-op against the anon/authenticated grants: after that
-- migration the live ACL was
--   {postgres=X, anon=X, authenticated=X, service_role=X}
-- i.e. BOTH create_or_recover_analysis_run AND transition_analysis_run were
-- callable by anon (unauthenticated!) and authenticated via /rest/v1/rpc/*.
-- transition_analysis_run has NO owner check and can flip merit_settled /
-- refunded / retry_count via p_patch, so an anon/authenticated caller could
-- mutate ANY run by guessing run_id — a cross-user IDOR + financial-flag write.
-- This also tripped advisors 0028 (anon_security_definer_function_executable)
-- and 0029 (authenticated_security_definer_function_executable) x2 each.
--
-- FIX: explicitly REVOKE EXECUTE FROM PUBLIC, anon, authenticated on both RPCs
-- (the established codebase pattern — see 20260608000010 / 20260608000011), then
-- re-GRANT to service_role only. These are backend-orchestration RPCs called
-- exclusively by edge functions under the service role; the frontend recovery
-- surface (useAnalysisRun) uses Realtime + the owner-scoped poll endpoint and
-- never calls them directly.
--
-- Re-runnability (NFR-01): REVOKE/GRANT are idempotent; the verification DO-block
-- is read-only. Safe to re-apply. On an environment where 20260702000001 has not
-- yet run, this migration still applies cleanly (the functions exist by then —
-- 000001 precedes 000004 in timestamp order).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK: (restores Supabase's default grants — only if this must be reversed)
--   GRANT EXECUTE ON FUNCTION public.create_or_recover_analysis_run(uuid, text, text, text, text, uuid, jsonb) TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.transition_analysis_run(uuid, text, text, jsonb) TO anon, authenticated;
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.create_or_recover_analysis_run(uuid, text, text, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.transition_analysis_run(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_or_recover_analysis_run(uuid, text, text, text, text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_analysis_run(uuid, text, text, jsonb) TO service_role;

-- ── VERIFICATION: assert anon + authenticated hold NO EXECUTE on either RPC ────
DO $$
DECLARE
  v_leaky text;
BEGIN
  SELECT string_agg(p.proname || ' -> ' || r.rolname, ', ')
    INTO v_leaky
  FROM pg_proc p
  CROSS JOIN LATERAL unnest(ARRAY['anon','authenticated']) AS r(rolname)
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('create_or_recover_analysis_run', 'transition_analysis_run')
    AND has_function_privilege(r.rolname, p.oid, 'EXECUTE');

  IF v_leaky IS NOT NULL THEN
    RAISE EXCEPTION
      'Phase 03 03-01 corrective failed: anon/authenticated still hold EXECUTE on: %', v_leaky;
  END IF;

  RAISE NOTICE 'Phase 03 03-01 corrective passed: lifecycle CAS RPCs are service_role-only (anon + authenticated EXECUTE revoked)';
END $$;

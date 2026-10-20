-- Release-readiness audit (2026-07-14)
--
-- DEFECT: LinkedIn Grader never reopens a saved grade, and always claims the scan will
-- cost Merits.
--
-- ROOT CAUSE: 20260625021209_revoke_authenticated_execute_unused_definer_rpcs.sql revoked
-- `authenticated` EXECUTE on public.get_billing_period_start(uuid) as one of the
-- "provably-unused" definer RPCs. It is NOT unused: src/pages/LinkedInGrader.tsx:386 calls
-- it directly from the browser. Since 2026-06-25 that call has failed for every logged-in
-- user with 42501 "permission denied for function get_billing_period_start", and the
-- failure cascades:
--
--     const { data: billingStartData, error: billingErr } = await supabase.rpc(
--       'get_billing_period_start', { p_user_id: user.id });
--     if (billingErr) setEntitlementState('will-use-credit');  // ALWAYS taken
--     const billingStart = billingStartData as string | null;  // ALWAYS null
--     if (billingStart) { /* load this cycle's saved grade */ } // NEVER runs
--
-- So the current-cycle cached grade is never loaded (the user is shown the input form again
-- and re-charged for a scan they already paid for), and the entitlement always degrades to
-- "will-use-credit" even when a free scan is available.
--
-- FIX: restore `authenticated` EXECUTE, AND add the ownership guard the function never had.
-- A bare re-grant would be an IDOR: the function is SECURITY DEFINER and reads
-- profiles.created_at for a CALLER-SUPPLIED p_user_id, so any authenticated user could pass
-- another user's uuid and learn their signup day-of-month.
--
-- The guard permits service_role/edge callers (auth.uid() IS NULL there, and
-- _shared/billing-period.ts legitimately passes arbitrary user ids) while constraining
-- browser callers to their own row. Signature is unchanged, so every existing caller —
-- including the SQL callers in check_and_record_ai_usage / admin_* — is unaffected.

CREATE OR REPLACE FUNCTION public.get_billing_period_start(p_user_id uuid)
 RETURNS date
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_created_at TIMESTAMP WITH TIME ZONE;
  current_date_val DATE := CURRENT_DATE;
  day_of_month INTEGER;
  billing_start DATE;
BEGIN
  -- Ownership guard (added 2026-07-14). auth.uid() is NULL for service_role / SQL-internal
  -- callers, which must keep working with an arbitrary p_user_id; a JWT-authenticated
  -- browser caller may only ask about itself.
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT created_at INTO user_created_at
  FROM public.profiles
  WHERE id = p_user_id;

  IF user_created_at IS NULL THEN
    RETURN DATE_TRUNC('month', current_date_val)::DATE;
  END IF;

  day_of_month := EXTRACT(DAY FROM user_created_at);

  IF EXTRACT(DAY FROM current_date_val) >= day_of_month THEN
    billing_start := DATE_TRUNC('month', current_date_val)::DATE + (day_of_month - 1);
  ELSE
    billing_start := (DATE_TRUNC('month', current_date_val) - INTERVAL '1 month')::DATE + (day_of_month - 1);
  END IF;

  RETURN billing_start;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_billing_period_start(uuid) TO authenticated;
-- Verify: authenticated has EXECUTE again, and anon does NOT (anon must never reach it).
DO $$
DECLARE v_auth integer; v_anon integer;
BEGIN
  SELECT count(*) INTO v_auth
  FROM information_schema.role_routine_grants
  WHERE grantee = 'authenticated' AND specific_schema = 'public'
    AND routine_name = 'get_billing_period_start' AND privilege_type = 'EXECUTE';
  IF v_auth < 1 THEN
    RAISE EXCEPTION 'get_billing_period_start: authenticated EXECUTE was not restored';
  END IF;

  SELECT count(*) INTO v_anon
  FROM information_schema.role_routine_grants
  WHERE grantee = 'anon' AND specific_schema = 'public'
    AND routine_name = 'get_billing_period_start' AND privilege_type = 'EXECUTE';
  IF v_anon <> 0 THEN
    RAISE EXCEPTION 'get_billing_period_start: anon must NOT hold EXECUTE (found %)', v_anon;
  END IF;

  RAISE NOTICE 'get_billing_period_start: authenticated EXECUTE restored + ownership guard active; anon still denied';
END $$;

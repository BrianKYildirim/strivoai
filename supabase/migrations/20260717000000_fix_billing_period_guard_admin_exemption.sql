-- Admin panel regression (2026-07-17)
--
-- DEFECT: The admin panel's "All Users" tab shows "No users found", and expanding a user's
-- merit breakdown fails. Both RPCs return HTTP 403 to the browser:
--   POST /rest/v1/rpc/get_admin_usage_stats     -> 403
--   POST /rest/v1/rpc/get_user_usage_breakdown  -> 403
--
-- ROOT CAUSE: 20260714120000_fix_get_billing_period_start_authenticated_grant.sql added an
-- ownership guard to public.get_billing_period_start(uuid):
--
--     IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
--       RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
--     END IF;
--
-- That migration's header asserted: "Signature is unchanged, so every existing caller —
-- including the SQL callers in check_and_record_ai_usage / admin_* — is unaffected."
-- The assertion is wrong. It assumes a SECURITY DEFINER caller is an "SQL-internal caller"
-- where auth.uid() IS NULL. auth.uid() reads the `request.jwt.claims` GUC, which PostgREST
-- sets per request on the SESSION. SECURITY DEFINER switches the effective USER; it does not
-- reset that GUC. So auth.uid() stays the browser caller's uid inside nested definer calls.
--
-- Consequently, when the admin's browser calls get_admin_usage_stats():
--   * auth.uid()          = the admin's uid (NOT NULL)
--   * the joined call     = get_billing_period_start(p.id) for EVERY profile row
--   * the first row where p.id <> admin uid raises 'forbidden' (42501)
-- PostgREST maps 42501 to 403, so the whole result set fails. The panel's own admin gate
-- passes (has_role returns true) — the failure is one frame deeper, which is why the page
-- loads but the table is empty. get_user_usage_breakdown(p_user_id) breaks identically for
-- any user other than the admin themselves.
--
-- Reproduced on preview (22 profiles, 1 admin) as the real authenticated admin:
--   auth.uid() inside                   -> f4677b0a-...
--   has_role(admin)                     -> true
--   get_admin_usage_stats               -> FAILED sqlstate=42501 msg=forbidden
--   get_user_usage_breakdown(other)     -> FAILED sqlstate=42501 msg=forbidden
--
-- FIX: exempt admins from the ownership guard. The 2026-07-14 guard exists to stop an
-- ordinary authenticated user from passing someone else's uuid and learning their signup
-- day-of-month (an IDOR). An admin is not in that threat model: admins already read every
-- user's tier, merits, usage and email through get_admin_usage_stats by design. This grants
-- an admin no data they could not already obtain, and leaves the IDOR closed for everyone
-- else.
--
-- The three-way guard preserves all prior behavior:
--   * auth.uid() IS NULL (service_role / edge / pg_cron)  -> allowed, arbitrary p_user_id
--   * p_user_id = auth.uid() (browser, self)              -> allowed (LinkedInGrader.tsx:386)
--   * non-admin browser caller, other uid                 -> 'forbidden' 42501 (unchanged)
--   * admin browser caller, other uid                     -> allowed (THE FIX)
--
-- Signature, grants, and return type are unchanged. Rollback:
--   supabase/migrations/rollback/20260717000000_fix_billing_period_guard_admin_exemption.rollback.sql

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
  -- Ownership guard (added 2026-07-14, admin exemption added 2026-07-17).
  -- auth.uid() is NULL for service_role / SQL-internal callers, which must keep working with
  -- an arbitrary p_user_id. A JWT-authenticated browser caller may only ask about itself --
  -- UNLESS it is an admin: auth.uid() survives into nested SECURITY DEFINER frames, so the
  -- admin_* RPCs reach this function with the admin's uid and another user's p_user_id.
  IF auth.uid() IS NOT NULL
     AND p_user_id IS DISTINCT FROM auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin') THEN
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

-- Grants are unchanged by CREATE OR REPLACE; re-assert the 2026-07-14 invariants so this
-- migration fails loudly rather than silently widening or narrowing access.
DO $$
DECLARE v_auth integer; v_anon integer; v_guard integer;
BEGIN
  SELECT count(*) INTO v_auth
  FROM information_schema.role_routine_grants
  WHERE grantee = 'authenticated' AND specific_schema = 'public'
    AND routine_name = 'get_billing_period_start' AND privilege_type = 'EXECUTE';
  IF v_auth < 1 THEN
    RAISE EXCEPTION 'get_billing_period_start: authenticated must hold EXECUTE';
  END IF;

  SELECT count(*) INTO v_anon
  FROM information_schema.role_routine_grants
  WHERE grantee = 'anon' AND specific_schema = 'public'
    AND routine_name = 'get_billing_period_start' AND privilege_type = 'EXECUTE';
  IF v_anon <> 0 THEN
    RAISE EXCEPTION 'get_billing_period_start: anon must NOT hold EXECUTE (found %)', v_anon;
  END IF;

  -- The guard must still be present: this migration relaxes it for admins, it does not
  -- remove it. A missing guard would silently reopen the 2026-07-14 IDOR.
  SELECT count(*) INTO v_guard
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_billing_period_start'
    AND p.prosrc LIKE '%forbidden%' AND p.prosrc LIKE '%has_role%';
  IF v_guard <> 1 THEN
    RAISE EXCEPTION 'get_billing_period_start: ownership guard with admin exemption not found';
  END IF;

  RAISE NOTICE 'get_billing_period_start: admin exemption active; IDOR guard intact for non-admins; anon still denied';
END $$;

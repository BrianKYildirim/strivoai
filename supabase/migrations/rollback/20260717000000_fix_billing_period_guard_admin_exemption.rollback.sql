-- Rollback for 20260717000000_fix_billing_period_guard_admin_exemption.sql
--
-- Restores public.get_billing_period_start(uuid) to its 2026-07-14 definition (ownership
-- guard WITHOUT the admin exemption), exactly as created by
-- 20260714120000_fix_get_billing_period_start_authenticated_grant.sql.
--
-- WARNING: applying this rollback re-breaks the admin panel. get_admin_usage_stats and
-- get_user_usage_breakdown will again raise 'forbidden' (42501 -> HTTP 403) for the admin,
-- because auth.uid() survives into nested SECURITY DEFINER frames. Only roll back if the
-- admin exemption itself is implicated in an incident.
--
-- Grants are not touched (CREATE OR REPLACE preserves them).

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

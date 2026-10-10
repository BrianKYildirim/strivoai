-- ROLLBACK for 20260714120000_fix_get_billing_period_start_authenticated_grant.sql
--
-- Restores the pre-audit state: no `authenticated` EXECUTE, and the original function body
-- WITHOUT the ownership guard.
--
-- WARNING: applying this rollback re-breaks LinkedIn Grader — the browser RPC call at
-- src/pages/LinkedInGrader.tsx:386 will resume failing with 42501, the current-cycle cached
-- grade will stop loading, and users will be re-charged for scans they already paid for.
-- Only roll back if the grant itself is causing a worse problem.

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

REVOKE EXECUTE ON FUNCTION public.get_billing_period_start(uuid) FROM authenticated;

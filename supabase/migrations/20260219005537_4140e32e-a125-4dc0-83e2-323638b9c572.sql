
CREATE OR REPLACE FUNCTION public.get_user_usage_breakdown(p_user_id uuid)
RETURNS TABLE(action_type text, credits_used bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  billing_start DATE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin role required.';
  END IF;

  billing_start := public.get_billing_period_start(p_user_id);

  RETURN QUERY
  SELECT 
    ut.action_type::text,
    SUM(ut.credits_consumed)::bigint as credits_used
  FROM public.usage_tracking ut
  WHERE ut.user_id = p_user_id
    AND ut.billing_period_start = billing_start
  GROUP BY ut.action_type
  ORDER BY credits_used DESC;
END;
$function$;

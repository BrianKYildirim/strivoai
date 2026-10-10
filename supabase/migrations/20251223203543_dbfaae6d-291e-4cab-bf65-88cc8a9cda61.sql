-- Update the get_usage_limit function for 2-tier system (Free and Pro only)
CREATE OR REPLACE FUNCTION public.get_usage_limit(p_subscription_tier text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  CASE p_subscription_tier
    WHEN 'pro' THEN RETURN 100;
    WHEN 'free' THEN RETURN 1;
    ELSE RETURN 1;
  END CASE;
END;
$function$;
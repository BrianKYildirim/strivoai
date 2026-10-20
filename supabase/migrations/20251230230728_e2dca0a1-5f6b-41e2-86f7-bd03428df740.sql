-- Update the get_usage_limit function to remove premium tier
CREATE OR REPLACE FUNCTION public.get_usage_limit(p_subscription_tier text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  CASE p_subscription_tier
    WHEN 'pro' THEN RETURN 100;
    WHEN 'elite' THEN RETURN 300;
    WHEN 'free' THEN RETURN 3;
    ELSE RETURN 3;
  END CASE;
END;
$function$;
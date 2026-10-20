-- Fix get_usage_limit to handle 'premium' tier (same as pro, or unlimited)
CREATE OR REPLACE FUNCTION public.get_usage_limit(p_subscription_tier text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  CASE p_subscription_tier
    WHEN 'pro' THEN RETURN 100;
    WHEN 'premium' THEN RETURN 1000;  -- Premium gets 1000 actions
    WHEN 'elite' THEN RETURN 1000;    -- Elite also gets 1000 actions
    WHEN 'free' THEN RETURN 1;
    ELSE RETURN 1;
  END CASE;
END;
$function$;
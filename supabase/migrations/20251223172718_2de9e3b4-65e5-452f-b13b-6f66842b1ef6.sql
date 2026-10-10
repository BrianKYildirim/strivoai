-- Update get_usage_limit function with correct tier limits
-- Free: 1 (lifetime), Pro: 100/month, Elite: 500/month
CREATE OR REPLACE FUNCTION public.get_usage_limit(p_subscription_tier text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  CASE p_subscription_tier
    WHEN 'elite' THEN RETURN 500;
    WHEN 'pro' THEN RETURN 100;
    WHEN 'free' THEN RETURN 1;
    ELSE RETURN 1;
  END CASE;
END;
$$;

-- Update can_perform_ai_action to handle free tier differently (lifetime limit, not monthly)
CREATE OR REPLACE FUNCTION public.can_perform_ai_action(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_tier TEXT;
  current_usage INTEGER;
  lifetime_usage INTEGER;
  usage_limit INTEGER;
  billing_start DATE;
  next_reset DATE;
  is_allowed BOOLEAN;
BEGIN
  -- Get user's subscription tier
  SELECT subscription_tier INTO user_tier
  FROM public.profiles
  WHERE id = p_user_id;
  
  IF user_tier IS NULL THEN
    user_tier := 'free';
  END IF;
  
  -- Get limit for tier
  usage_limit := public.get_usage_limit(user_tier);
  
  -- For free tier: check LIFETIME usage (all time, not just billing period)
  IF user_tier = 'free' THEN
    SELECT COALESCE(SUM(credits_consumed), 0) INTO lifetime_usage
    FROM public.usage_tracking
    WHERE user_id = p_user_id;
    
    is_allowed := lifetime_usage < usage_limit;
    
    RETURN jsonb_build_object(
      'allowed', is_allowed,
      'current_usage', lifetime_usage,
      'limit', usage_limit,
      'tier', user_tier,
      'reset_date', NULL,
      'billing_start', NULL,
      'is_lifetime_limit', TRUE
    );
  ELSE
    -- Pro/Elite: check monthly billing period
    billing_start := public.get_billing_period_start(p_user_id);
    next_reset := billing_start + INTERVAL '1 month';
    current_usage := public.get_user_usage(p_user_id);
    is_allowed := current_usage < usage_limit;
    
    RETURN jsonb_build_object(
      'allowed', is_allowed,
      'current_usage', current_usage,
      'limit', usage_limit,
      'tier', user_tier,
      'reset_date', next_reset,
      'billing_start', billing_start,
      'is_lifetime_limit', FALSE
    );
  END IF;
END;
$$;
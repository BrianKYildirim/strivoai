-- Update get_usage_limit function: free = 3, pro = 100
CREATE OR REPLACE FUNCTION public.get_usage_limit(p_subscription_tier text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
BEGIN
  CASE p_subscription_tier
    WHEN 'pro' THEN RETURN 100;
    WHEN 'premium' THEN RETURN 500;
    WHEN 'elite' THEN RETURN 1000;
    WHEN 'free' THEN RETURN 3;
    ELSE RETURN 3;
  END CASE;
END;
$$;

-- Update can_perform_ai_action to: 1) make free monthly (not lifetime), 2) bypass for admin emails
CREATE OR REPLACE FUNCTION public.can_perform_ai_action(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  user_tier TEXT;
  user_email TEXT;
  current_usage INTEGER;
  usage_limit INTEGER;
  billing_start DATE;
  next_reset DATE;
  is_allowed BOOLEAN;
  is_admin_bypass BOOLEAN := FALSE;
BEGIN
  -- Get user's subscription tier and email
  SELECT subscription_tier, email INTO user_tier, user_email
  FROM public.profiles
  WHERE id = p_user_id;
  
  IF user_tier IS NULL THEN
    user_tier := 'free';
  END IF;
  
  -- Check if user is admin with unlimited access
  IF user_email = 'strivolife@gmail.com' THEN
    is_admin_bypass := TRUE;
  END IF;
  
  -- Admin bypass: always allowed with unlimited shown
  IF is_admin_bypass THEN
    billing_start := public.get_billing_period_start(p_user_id);
    current_usage := public.get_user_usage(p_user_id);
    
    RETURN jsonb_build_object(
      'allowed', TRUE,
      'current_usage', current_usage,
      'limit', -1,
      'tier', user_tier,
      'reset_date', billing_start + INTERVAL '1 month',
      'billing_start', billing_start,
      'is_lifetime_limit', FALSE,
      'is_unlimited', TRUE
    );
  END IF;
  
  -- Get limit for tier
  usage_limit := public.get_usage_limit(user_tier);
  
  -- All tiers now use monthly billing period (including free)
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
    'is_lifetime_limit', FALSE,
    'is_unlimited', FALSE
  );
END;
$$;
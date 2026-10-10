-- Update can_perform_ai_action to check current_period_end for canceled subscriptions
CREATE OR REPLACE FUNCTION public.can_perform_ai_action(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_tier TEXT;
  user_email TEXT;
  user_status TEXT;
  user_period_end TIMESTAMP WITH TIME ZONE;
  current_usage INTEGER;
  usage_limit INTEGER;
  billing_start DATE;
  next_reset DATE;
  is_allowed BOOLEAN;
  is_admin_bypass BOOLEAN := FALSE;
  effective_tier TEXT;
BEGIN
  -- Get user's subscription tier, email, status, and period end
  SELECT subscription_tier, email, subscription_status, current_period_end 
  INTO user_tier, user_email, user_status, user_period_end
  FROM public.profiles
  WHERE id = p_user_id;
  
  IF user_tier IS NULL THEN
    user_tier := 'free';
  END IF;
  
  -- Determine effective tier based on cancellation status and period end
  effective_tier := user_tier;
  
  -- If subscription is canceled and period has ended, treat as free tier
  IF user_status = 'canceled' AND user_period_end IS NOT NULL AND user_period_end < NOW() THEN
    effective_tier := 'free';
    
    -- Also update the profile to reflect the downgrade
    UPDATE public.profiles 
    SET subscription_tier = 'free', 
        subscription_status = 'expired',
        updated_at = NOW()
    WHERE id = p_user_id;
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
      'tier', effective_tier,
      'reset_date', billing_start + INTERVAL '1 month',
      'billing_start', billing_start,
      'is_lifetime_limit', FALSE,
      'is_unlimited', TRUE,
      'subscription_status', user_status,
      'current_period_end', user_period_end
    );
  END IF;
  
  -- Get limit for effective tier
  usage_limit := public.get_usage_limit(effective_tier);
  
  -- All tiers now use monthly billing period (including free)
  billing_start := public.get_billing_period_start(p_user_id);
  next_reset := billing_start + INTERVAL '1 month';
  current_usage := public.get_user_usage(p_user_id);
  is_allowed := current_usage < usage_limit;
  
  RETURN jsonb_build_object(
    'allowed', is_allowed,
    'current_usage', current_usage,
    'limit', usage_limit,
    'tier', effective_tier,
    'reset_date', next_reset,
    'billing_start', billing_start,
    'is_lifetime_limit', FALSE,
    'is_unlimited', FALSE,
    'subscription_status', user_status,
    'current_period_end', user_period_end
  );
END;
$function$;
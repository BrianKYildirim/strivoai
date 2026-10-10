-- Add credit_adjustment column to profiles
-- Positive values give extra credits, negative values reduce them. Default 0 = normal behavior.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credit_adjustment INTEGER NOT NULL DEFAULT 0;

-- ── admin_set_user_credits ──────────────────────────────────────────────────
-- Admin-only RPC to set a user's remaining credits to a specific value.
-- Internally computes the credit_adjustment offset needed to reach that target.
CREATE OR REPLACE FUNCTION public.admin_set_user_credits(p_user_id UUID, p_credits INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tier TEXT;
  v_current_usage INTEGER;
  v_base_limit INTEGER;
  v_current_remaining INTEGER;
  v_new_adjustment INTEGER;
BEGIN
  -- Verify caller is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin role required.';
  END IF;

  -- Validate p_credits is non-negative
  IF p_credits < 0 THEN
    RAISE EXCEPTION 'Credits must be a non-negative integer.';
  END IF;

  -- Get user's current tier
  SELECT subscription_tier INTO v_tier
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_tier IS NULL THEN
    v_tier := 'free';
  END IF;

  -- Get base limit for tier and current usage
  v_base_limit := public.get_usage_limit(v_tier);
  v_current_usage := public.get_user_usage(p_user_id);

  -- Compute adjustment: target_remaining = base_limit + adjustment - current_usage
  -- => adjustment = target_remaining - base_limit + current_usage
  v_new_adjustment := p_credits - v_base_limit + v_current_usage;

  -- Apply the adjustment
  UPDATE public.profiles
  SET credit_adjustment = v_new_adjustment,
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN v_new_adjustment;
END;
$$;

-- ── get_admin_usage_stats (updated) ────────────────────────────────────────
-- Must DROP first because the return type is changing (adding credit_adjustment, remaining_credits columns).
DROP FUNCTION IF EXISTS public.get_admin_usage_stats();

-- Returns per-user stats including credit_adjustment and computed remaining_credits.
CREATE OR REPLACE FUNCTION public.get_admin_usage_stats()
RETURNS TABLE (
  user_id uuid,
  email text,
  subscription_tier text,
  total_actions bigint,
  last_action_at timestamp with time zone,
  credit_adjustment integer,
  remaining_credits integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow admins to call this function
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin role required.';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.email,
    p.subscription_tier,
    COALESCE(COUNT(ut.id), 0)::bigint AS total_actions,
    MAX(ut.created_at) AS last_action_at,
    p.credit_adjustment,
    GREATEST(0, public.get_usage_limit(p.subscription_tier) + p.credit_adjustment - COALESCE(COUNT(ut.id), 0)::int)::integer AS remaining_credits
  FROM public.profiles p
  LEFT JOIN public.usage_tracking ut ON ut.user_id = p.id
    AND ut.billing_period_start = public.get_billing_period_start(p.id)
  GROUP BY p.id, p.email, p.subscription_tier, p.credit_adjustment
  ORDER BY total_actions DESC;
END;
$$;

-- ── can_perform_ai_action (updated) ────────────────────────────────────────
-- Respects credit_adjustment from profiles when checking usage limits.
CREATE OR REPLACE FUNCTION public.can_perform_ai_action(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_tier TEXT;
  user_email TEXT;
  user_status TEXT;
  user_period_end TIMESTAMP WITH TIME ZONE;
  v_credit_adjustment INTEGER;
  current_usage INTEGER;
  usage_limit INTEGER;
  billing_start DATE;
  next_reset DATE;
  is_allowed BOOLEAN;
  is_admin_bypass BOOLEAN := FALSE;
  effective_tier TEXT;
BEGIN
  -- Get user's subscription tier, email, status, period end, and credit_adjustment
  SELECT subscription_tier, email, subscription_status, current_period_end, credit_adjustment
  INTO user_tier, user_email, user_status, user_period_end, v_credit_adjustment
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

  -- Get limit for effective tier and apply credit_adjustment
  usage_limit := public.get_usage_limit(effective_tier) + COALESCE(v_credit_adjustment, 0);

  -- Ensure usage_limit doesn't go below 0
  IF usage_limit < 0 THEN
    usage_limit := 0;
  END IF;

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
$$;

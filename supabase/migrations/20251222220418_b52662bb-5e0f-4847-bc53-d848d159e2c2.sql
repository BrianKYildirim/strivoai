-- Create enum for AI action types
CREATE TYPE public.ai_action_type AS ENUM (
  'resume_analysis',
  'job_matching',
  'career_compass',
  'skills_gap_analysis',
  'linkedin_grading',
  'job_comparison'
);

-- Create usage tracking table (internal only, not exposed to users)
CREATE TABLE public.usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type ai_action_type NOT NULL,
  credits_consumed INTEGER NOT NULL DEFAULT 1,
  billing_period_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX idx_usage_tracking_user_billing ON public.usage_tracking(user_id, billing_period_start);
CREATE INDEX idx_usage_tracking_created_at ON public.usage_tracking(created_at);

-- Enable RLS
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (admin/backend only)
-- No user-facing policies - this is internal data

-- Create function to get user's current billing period start
CREATE OR REPLACE FUNCTION public.get_billing_period_start(p_user_id UUID)
RETURNS DATE
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_created_at TIMESTAMP WITH TIME ZONE;
  current_date_val DATE := CURRENT_DATE;
  day_of_month INTEGER;
  billing_start DATE;
BEGIN
  -- Get user creation date to determine billing cycle day
  SELECT created_at INTO user_created_at
  FROM public.profiles
  WHERE id = p_user_id;
  
  IF user_created_at IS NULL THEN
    RETURN DATE_TRUNC('month', current_date_val)::DATE;
  END IF;
  
  day_of_month := EXTRACT(DAY FROM user_created_at);
  
  -- Calculate current billing period start
  IF EXTRACT(DAY FROM current_date_val) >= day_of_month THEN
    billing_start := DATE_TRUNC('month', current_date_val)::DATE + (day_of_month - 1);
  ELSE
    billing_start := (DATE_TRUNC('month', current_date_val) - INTERVAL '1 month')::DATE + (day_of_month - 1);
  END IF;
  
  RETURN billing_start;
END;
$$;

-- Create function to get user's usage in current billing period
CREATE OR REPLACE FUNCTION public.get_user_usage(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  billing_start DATE;
  total_usage INTEGER;
BEGIN
  billing_start := public.get_billing_period_start(p_user_id);
  
  SELECT COALESCE(SUM(credits_consumed), 0) INTO total_usage
  FROM public.usage_tracking
  WHERE user_id = p_user_id
    AND billing_period_start = billing_start;
  
  RETURN total_usage;
END;
$$;

-- Create function to get usage limit based on subscription tier
CREATE OR REPLACE FUNCTION public.get_usage_limit(p_subscription_tier TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE p_subscription_tier
    WHEN 'elite' THEN RETURN 500;
    WHEN 'pro' THEN RETURN 100;
    WHEN 'free' THEN RETURN 10;
    ELSE RETURN 10;
  END CASE;
END;
$$;

-- Create function to check if user can perform action
CREATE OR REPLACE FUNCTION public.can_perform_ai_action(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_tier TEXT;
  current_usage INTEGER;
  usage_limit INTEGER;
  billing_start DATE;
  next_reset DATE;
BEGIN
  -- Get user's subscription tier
  SELECT subscription_tier INTO user_tier
  FROM public.profiles
  WHERE id = p_user_id;
  
  IF user_tier IS NULL THEN
    user_tier := 'free';
  END IF;
  
  -- Get billing period
  billing_start := public.get_billing_period_start(p_user_id);
  next_reset := billing_start + INTERVAL '1 month';
  
  -- Get current usage
  current_usage := public.get_user_usage(p_user_id);
  
  -- Get limit for tier
  usage_limit := public.get_usage_limit(user_tier);
  
  RETURN jsonb_build_object(
    'allowed', current_usage < usage_limit,
    'current_usage', current_usage,
    'limit', usage_limit,
    'tier', user_tier,
    'reset_date', next_reset,
    'billing_start', billing_start
  );
END;
$$;

-- Create function to record usage (called by edge functions)
CREATE OR REPLACE FUNCTION public.record_ai_usage(
  p_user_id UUID,
  p_action_type ai_action_type,
  p_credits INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  billing_start DATE;
BEGIN
  billing_start := public.get_billing_period_start(p_user_id);
  
  INSERT INTO public.usage_tracking (user_id, action_type, credits_consumed, billing_period_start)
  VALUES (p_user_id, p_action_type, p_credits, billing_start);
  
  RETURN TRUE;
END;
$$;
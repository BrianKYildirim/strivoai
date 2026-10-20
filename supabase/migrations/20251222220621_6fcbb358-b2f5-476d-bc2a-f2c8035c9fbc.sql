-- Fix function search path for get_usage_limit
CREATE OR REPLACE FUNCTION public.get_usage_limit(p_subscription_tier TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
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

-- Add service role policy for usage_tracking (backend access only)
CREATE POLICY "Service role full access"
ON public.usage_tracking
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
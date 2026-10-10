-- Create upgrade_requests table for tracking manual upgrade requests
CREATE TABLE public.upgrade_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  requested_at TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  notes TEXT,
  fulfilled_at TIMESTAMPTZ,
  fulfilled_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.upgrade_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY "Users can view their own upgrade requests"
ON public.upgrade_requests
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own requests
CREATE POLICY "Users can create upgrade requests"
ON public.upgrade_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can view all requests
CREATE POLICY "Admins can view all upgrade requests"
ON public.upgrade_requests
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update requests
CREATE POLICY "Admins can update upgrade requests"
ON public.upgrade_requests
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Admin function to upgrade a user to pro
CREATE OR REPLACE FUNCTION public.admin_upgrade_user(
  p_user_id UUID,
  p_tier TEXT DEFAULT 'pro',
  p_request_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Check if caller is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin role required.';
  END IF;

  -- Update user's subscription tier
  UPDATE public.profiles
  SET subscription_tier = p_tier,
      updated_at = now()
  WHERE id = p_user_id;

  -- If request_id provided, mark it as fulfilled
  IF p_request_id IS NOT NULL THEN
    UPDATE public.upgrade_requests
    SET status = 'fulfilled',
        fulfilled_at = now(),
        fulfilled_by = auth.uid()
    WHERE id = p_request_id;
  END IF;

  v_result := jsonb_build_object(
    'success', TRUE,
    'user_id', p_user_id,
    'new_tier', p_tier
  );

  RETURN v_result;
END;
$$;

-- Function to get pending upgrade requests (admin only)
CREATE OR REPLACE FUNCTION public.get_pending_upgrade_requests()
RETURNS TABLE(
  id UUID,
  user_id UUID,
  email TEXT,
  requested_at TIMESTAMPTZ,
  status TEXT,
  payment_method TEXT,
  notes TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin role required.';
  END IF;

  RETURN QUERY
  SELECT 
    ur.id,
    ur.user_id,
    ur.email,
    ur.requested_at,
    ur.status,
    ur.payment_method,
    ur.notes
  FROM public.upgrade_requests ur
  ORDER BY ur.requested_at DESC;
END;
$$;
-- Create analysis_results table for storing all analysis types
CREATE TABLE public.analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  analysis_type text NOT NULL CHECK (analysis_type IN ('resume_analysis', 'linkedin_grading', 'job_matching', 'career_compass', 'skills_gap_analysis', 'job_comparison')),
  primary_score integer,
  key_insights jsonb DEFAULT '[]'::jsonb,
  raw_response jsonb,
  source_reference text, -- e.g. resume_id, linkedin_url, etc.
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.analysis_results ENABLE ROW LEVEL SECURITY;

-- Users can view their own results
CREATE POLICY "Users can view their own analysis results"
ON public.analysis_results
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own results
CREATE POLICY "Users can create their own analysis results"
ON public.analysis_results
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create user_roles table for admin access
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to get admin usage stats (security definer to bypass RLS)
CREATE OR REPLACE FUNCTION public.get_admin_usage_stats()
RETURNS TABLE (
  user_id uuid,
  email text,
  subscription_tier text,
  total_actions bigint,
  last_action_at timestamp with time zone
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
    p.id as user_id,
    p.email,
    p.subscription_tier,
    COALESCE(COUNT(ut.id), 0) as total_actions,
    MAX(ut.created_at) as last_action_at
  FROM public.profiles p
  LEFT JOIN public.usage_tracking ut ON ut.user_id = p.id 
    AND ut.billing_period_start = public.get_billing_period_start(p.id)
  GROUP BY p.id, p.email, p.subscription_tier
  ORDER BY total_actions DESC;
END;
$$;

-- Policy: Only admins can view user_roles
CREATE POLICY "Admins can view all user roles"
ON public.user_roles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Policy: Only admins can manage user roles
CREATE POLICY "Admins can manage user roles"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Index for faster lookups
CREATE INDEX idx_analysis_results_user_id ON public.analysis_results(user_id);
CREATE INDEX idx_analysis_results_type ON public.analysis_results(analysis_type);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
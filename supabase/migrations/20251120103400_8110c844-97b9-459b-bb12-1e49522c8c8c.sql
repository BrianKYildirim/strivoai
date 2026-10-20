-- Add career preferences columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
ADD COLUMN IF NOT EXISTS preferred_locations TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS job_type_preference TEXT DEFAULT 'full-time',
ADD COLUMN IF NOT EXISTS experience_level TEXT DEFAULT 'mid',
ADD COLUMN IF NOT EXISTS career_interests TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS target_roles TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.linkedin_url IS 'User LinkedIn profile URL';
COMMENT ON COLUMN public.profiles.preferred_locations IS 'Array of preferred job locations';
COMMENT ON COLUMN public.profiles.job_type_preference IS 'Preferred job type: full-time, part-time, contract, internship';
COMMENT ON COLUMN public.profiles.experience_level IS 'Experience level: entry, mid, senior, lead';
COMMENT ON COLUMN public.profiles.career_interests IS 'Array of career interest areas';
COMMENT ON COLUMN public.profiles.target_roles IS 'Array of target job roles';
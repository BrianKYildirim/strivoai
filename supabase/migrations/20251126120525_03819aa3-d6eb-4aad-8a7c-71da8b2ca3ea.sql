-- Create table to cache LinkedIn profile grades for consistency
CREATE TABLE IF NOT EXISTS public.linkedin_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_url text NOT NULL,
  profile_identifier text NOT NULL,
  overall_score integer NOT NULL,
  grading_data jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create unique index on profile identifier for fast lookups
CREATE UNIQUE INDEX idx_linkedin_grades_identifier ON public.linkedin_grades(profile_identifier);

-- Enable RLS
ALTER TABLE public.linkedin_grades ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read cached grades (for consistency)
CREATE POLICY "Anyone can read cached LinkedIn grades"
ON public.linkedin_grades
FOR SELECT
USING (true);

-- Allow authenticated users to insert grades
CREATE POLICY "Authenticated users can insert grades"
ON public.linkedin_grades
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_linkedin_grades_updated_at
BEFORE UPDATE ON public.linkedin_grades
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

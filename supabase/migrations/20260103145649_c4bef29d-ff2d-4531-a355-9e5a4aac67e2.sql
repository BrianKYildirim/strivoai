-- Add email_sent_at tracking columns to prevent duplicate emails

-- Add to resumes table
ALTER TABLE public.resumes 
ADD COLUMN IF NOT EXISTS email_sent_at timestamp with time zone DEFAULT NULL;

-- Add to linkedin_grades table
ALTER TABLE public.linkedin_grades 
ADD COLUMN IF NOT EXISTS email_sent_at timestamp with time zone DEFAULT NULL;

-- Add to analysis_results table (for career compass)
ALTER TABLE public.analysis_results 
ADD COLUMN IF NOT EXISTS email_sent_at timestamp with time zone DEFAULT NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_resumes_email_sent ON public.resumes(email_sent_at) WHERE email_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_linkedin_grades_email_sent ON public.linkedin_grades(email_sent_at) WHERE email_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_analysis_results_email_sent ON public.analysis_results(email_sent_at) WHERE email_sent_at IS NULL;

COMMENT ON COLUMN public.resumes.email_sent_at IS 'Timestamp when feature completion email was sent';
COMMENT ON COLUMN public.linkedin_grades.email_sent_at IS 'Timestamp when feature completion email was sent';
COMMENT ON COLUMN public.analysis_results.email_sent_at IS 'Timestamp when feature completion email was sent';
-- Phase 4: Fix profile_identifier constraint for multi-user LinkedIn grading
-- The original UNIQUE index on profile_identifier prevents two users from grading
-- the same LinkedIn profile. Replace with a composite index for query efficiency.

-- Drop the UNIQUE index created in 20251126 migration
DROP INDEX IF EXISTS idx_linkedin_grades_identifier;

-- Drop the non-unique index from 20251129 migration (same column, redundant)
DROP INDEX IF EXISTS idx_linkedin_grades_profile_identifier;

-- Create composite index for efficient per-user profile lookups
CREATE INDEX idx_linkedin_grades_user_profile
ON public.linkedin_grades(user_id, profile_identifier);

-- Create index for efficient "most recent grade by user" query (D-08 follow-up fetch)
CREATE INDEX idx_linkedin_grades_user_created
ON public.linkedin_grades(user_id, created_at DESC);

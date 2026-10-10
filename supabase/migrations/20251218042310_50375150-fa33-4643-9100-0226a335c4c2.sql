-- Fix Issue 1: Ensure profiles table is only accessible by authenticated users
-- Drop and recreate policies to ensure they're restrictive (PERMISSIVE false already set)

-- Fix Issue 2: Remove public access to linkedin_grades table
-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Anyone can read cached LinkedIn grades" ON public.linkedin_grades;

-- Create a new policy that only allows authenticated users to read cached grades
CREATE POLICY "Authenticated users can read cached LinkedIn grades" 
ON public.linkedin_grades 
FOR SELECT 
TO authenticated
USING (true);

-- Also update the INSERT policy to be more explicit
DROP POLICY IF EXISTS "Authenticated users can insert grades" ON public.linkedin_grades;

CREATE POLICY "Authenticated users can insert grades" 
ON public.linkedin_grades 
FOR INSERT 
TO authenticated
WITH CHECK (true);
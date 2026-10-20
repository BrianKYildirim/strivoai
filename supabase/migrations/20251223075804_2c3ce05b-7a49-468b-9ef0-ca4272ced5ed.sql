-- Add user_id column to linkedin_grades table
ALTER TABLE public.linkedin_grades ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can read cached LinkedIn grades" ON public.linkedin_grades;
DROP POLICY IF EXISTS "Authenticated users can insert grades" ON public.linkedin_grades;

-- Create owner-scoped RLS policies
CREATE POLICY "Users can view their own LinkedIn grades" 
ON public.linkedin_grades FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own LinkedIn grades" 
ON public.linkedin_grades FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own LinkedIn grades" 
ON public.linkedin_grades FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own LinkedIn grades" 
ON public.linkedin_grades FOR DELETE 
USING (auth.uid() = user_id);
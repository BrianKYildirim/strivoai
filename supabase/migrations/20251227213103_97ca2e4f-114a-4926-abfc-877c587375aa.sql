-- Add linkedin_pdf_content column to profiles table to store extracted LinkedIn PDF text
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS linkedin_pdf_content text;

-- Add timestamp for when LinkedIn PDF was last updated
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS linkedin_pdf_updated_at timestamp with time zone;
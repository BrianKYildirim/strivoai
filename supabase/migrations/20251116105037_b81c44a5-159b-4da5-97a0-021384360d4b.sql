-- Add file_path and file_hash columns to resumes table for caching and better PDF access
ALTER TABLE resumes 
ADD COLUMN IF NOT EXISTS file_path TEXT,
ADD COLUMN IF NOT EXISTS file_hash TEXT;

-- Create index on file_hash for faster duplicate checking
CREATE INDEX IF NOT EXISTS idx_resumes_file_hash ON resumes(file_hash);
CREATE INDEX IF NOT EXISTS idx_resumes_user_hash ON resumes(user_id, file_hash);
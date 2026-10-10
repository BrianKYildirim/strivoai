-- Keep the resumes storage bucket aligned with the resume upload contract.
-- The frontend accepts PDF, DOCX, TXT, and MD resume documents.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'application/markdown',
  'application/x-markdown'
]::text[]
WHERE id = 'resumes';

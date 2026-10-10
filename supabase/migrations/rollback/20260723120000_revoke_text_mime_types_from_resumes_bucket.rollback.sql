-- Rollback for 20260723120000_revoke_text_mime_types_from_resumes_bucket.sql
-- Restores the 20260607050000 six-type array exactly. Fully reversible; no
-- other table was touched and the forward migration destroyed no data.

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

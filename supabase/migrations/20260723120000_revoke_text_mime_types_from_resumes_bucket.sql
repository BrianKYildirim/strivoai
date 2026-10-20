-- CONTEXT: Phase 01.1 D-13 makes new resume uploads PDF/DOCX only and
-- supersedes 20260607050000_allow_resume_document_mime_types.sql.
-- FIX: Set allowed_mime_types to exactly PDF and Word DOCX.
-- Scope guard: This gates NEW uploads only; no existing storage object,
-- resumes row, or analysis record is touched. Historical .md/.txt-sourced
-- resumes remain readable (D-14).
-- D-28: This validates client-declared Content-Type only and does not catch
-- renamed or content-spoofed files; magic-byte validation is the enforcement.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]::text[]
WHERE id = 'resumes';

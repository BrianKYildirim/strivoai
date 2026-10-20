-- Phase 50 Plan 50-02: concise document extraction metadata storage.
--
-- Adds nullable operational metadata beside existing canonical text fields:
--   - public.resumes.extracted_text / text_hash
--   - public.profiles.linkedin_pdf_content
--
-- Re-runnability:
--   - ADD COLUMN IF NOT EXISTS is idempotent.
--   - CREATE INDEX IF NOT EXISTS is idempotent.
--   - COMMENT ON COLUMN is idempotent.
--
-- Legacy rows remain NULL until a future user-triggered upload, analysis, or
-- LinkedIn source replacement stores accepted extracted text.

ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS extraction_metadata jsonb NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linkedin_pdf_text_hash text NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linkedin_pdf_extraction_metadata jsonb NULL;

CREATE INDEX IF NOT EXISTS profiles_linkedin_pdf_text_hash_idx
  ON public.profiles (linkedin_pdf_text_hash)
  WHERE linkedin_pdf_text_hash IS NOT NULL;

COMMENT ON COLUMN public.resumes.extraction_metadata IS
  'Phase 50: concise operational extraction metadata for accepted resume text only. '
  'Allowed fields include provider, attempted providers, quality status, document type, '
  'text hash, extracted timestamp, and concise fallback reason. Prompts, images, '
  'provider transcripts, raw model responses, and page-level debug logs do not belong '
  'in this column. NULL means no accepted Phase 50 extraction metadata has been stored.';

COMMENT ON COLUMN public.profiles.linkedin_pdf_text_hash IS
  'Phase 50: SHA-256 text hash for accepted LinkedIn PDF text stored in '
  'profiles.linkedin_pdf_content. NULL means no accepted Phase 50 LinkedIn PDF text '
  'hash has been stored.';

COMMENT ON COLUMN public.profiles.linkedin_pdf_extraction_metadata IS
  'Phase 50: concise operational extraction metadata for accepted LinkedIn PDF text only. '
  'Allowed fields include provider, attempted providers, quality status, document type, '
  'text hash, extracted timestamp, and concise fallback reason. Prompts, images, '
  'provider transcripts, raw model responses, and page-level debug logs do not belong '
  'in this column. NULL means no accepted Phase 50 extraction metadata has been stored.';

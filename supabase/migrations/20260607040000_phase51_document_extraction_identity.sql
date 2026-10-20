-- Phase 51: document extraction identity.
-- document_hash is the byte/source identity used for accepted-text reuse.
-- text_hash remains the accepted extracted-text fingerprint for analysis cache inputs.

ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS document_hash text NULL,
  ADD COLUMN IF NOT EXISTS extraction_version text NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linkedin_pdf_document_hash text NULL,
  ADD COLUMN IF NOT EXISTS linkedin_pdf_extraction_version text NULL;

CREATE INDEX IF NOT EXISTS resumes_document_extraction_identity_idx
  ON public.resumes (user_id, document_hash, extraction_version)
  WHERE document_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_linkedin_pdf_document_extraction_identity_idx
  ON public.profiles (id, linkedin_pdf_document_hash, linkedin_pdf_extraction_version)
  WHERE linkedin_pdf_document_hash IS NOT NULL;

COMMENT ON COLUMN public.resumes.document_hash IS
  'Phase 51 document-byte/source hash for user-scoped extraction reuse; distinct from text_hash.';

COMMENT ON COLUMN public.resumes.extraction_version IS
  'Phase 51 extraction contract version used with document_hash for accepted-text reuse.';

COMMENT ON COLUMN public.profiles.linkedin_pdf_document_hash IS
  'Phase 51 LinkedIn PDF document-byte/source hash for user-scoped extraction reuse; distinct from linkedin_pdf_text_hash.';

COMMENT ON COLUMN public.profiles.linkedin_pdf_extraction_version IS
  'Phase 51 extraction contract version used with linkedin_pdf_document_hash for accepted-text reuse.';

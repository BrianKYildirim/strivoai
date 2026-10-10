-- Phase 29 · 29-02 · CACHE-03 / NFR-01 — resumes.extracted_text + text_hash.
--
-- Sections:
--   1. ADD COLUMNs — extracted_text + text_hash (additive, nullable).
--   2. COMMENTs    — document CACHE-03 ownership and column semantics.
--   3. Supporting index — partial btree on text_hash for cache-fingerprint
--      lookups (Phase 37 consumer).
--   4. Verification block — DO $$ ... $$ asserts schema + index landed.
--
-- Re-runnability (NFR-01):
--   * ADD COLUMN IF NOT EXISTS — idempotent.
--   * CREATE INDEX IF NOT EXISTS — idempotent.
--   * COMMENT ON COLUMN — idempotent (last write wins).
--   * DO $$ ... $$ verification block — read-only, idempotent.
-- Roll-forward only: no destructive column/index removal, no destructive ALTER.
-- If a rollback is required, write a new forward migration.
--
-- Population semantics:
--   * Legacy rows remain NULL until the next analyze run wires the writes
--     (Plan 29-08 — analyze-resume/index.ts + ocr-pdf/index.ts).
--   * Reads against text_hash for cache lookups land in Phase 37.
--
-- Relationship to existing `resumes.file_hash`:
--   * file_hash is a byte-level fingerprint of the uploaded PDF — it does
--     NOT identify the same content across re-OCRs (different PDF bytes
--     can yield the same extracted text).
--   * text_hash is SHA-256 over canonicalized extracted_text, produced by
--     `_shared/cache-fingerprint.ts` (Plan 29-05), and IS stable across
--     re-OCRs of the same logical resume.

-- 1. ADD COLUMNs ────────────────────────────────────────────────────────

ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS extracted_text text NULL;

ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS text_hash text NULL;

-- 2. COMMENTs ───────────────────────────────────────────────────────────

COMMENT ON COLUMN public.resumes.extracted_text IS
  'Phase 29 CACHE-03: raw text extracted from the uploaded resume PDF '
  '(client-side parse when available, ocr-pdf edge function fallback '
  'otherwise). Written by analyze-resume/index.ts + ocr-pdf/index.ts '
  'wiring in Plan 29-08. NULL on legacy rows queued before this '
  'migration — populated on the next analyze run. Consumed by '
  '_shared/cache-fingerprint.ts (Plan 29-05) and the per-feature cache '
  'lookup in Phase 37. No backfill: legacy rows stay NULL until they '
  'are re-analyzed.';

COMMENT ON COLUMN public.resumes.text_hash IS
  'Phase 29 CACHE-03: SHA-256 hex of canonicalized extracted_text, '
  'produced by _shared/cache-fingerprint.ts (Plan 29-05). Used as the '
  'deterministic resume identity for cache-fingerprint reads in Phase '
  '37 — survives an OCR roundtrip because it fingerprints normalized '
  'text rather than file bytes. Distinct from resumes.file_hash, which '
  'is a bytes-only upload-dedup hash and does NOT identify the same '
  'content across re-OCRs. NULL on legacy rows until the next analyze '
  'run; no backfill.';

-- 3. Supporting index ──────────────────────────────────────────────────
-- Partial btree on text_hash for the Phase 37 cache-fingerprint lookup
-- path. WHERE text_hash IS NOT NULL keeps the index small by skipping
-- legacy NULL rows and any row that has not been re-analyzed yet
-- (per 29-RESEARCH.md §Pattern 5).

CREATE INDEX IF NOT EXISTS resumes_text_hash_idx
  ON public.resumes (text_hash)
  WHERE text_hash IS NOT NULL;

-- 4. Verification ──────────────────────────────────────────────────────
-- Read-only assertions that the migration landed as expected. Safe to
-- re-run; raises a NOTICE on success and an EXCEPTION on any mismatch.

DO $$
DECLARE
  v_extracted_text_count integer;
  v_text_hash_count      integer;
  v_index_count          integer;
BEGIN
  SELECT count(*) INTO v_extracted_text_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'resumes'
    AND column_name  = 'extracted_text'
    AND data_type    = 'text'
    AND is_nullable  = 'YES';

  IF v_extracted_text_count <> 1 THEN
    RAISE EXCEPTION 'Phase 29 CACHE-03 migration failed: public.resumes.extracted_text is missing or not nullable text';
  END IF;

  SELECT count(*) INTO v_text_hash_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'resumes'
    AND column_name  = 'text_hash'
    AND data_type    = 'text'
    AND is_nullable  = 'YES';

  IF v_text_hash_count <> 1 THEN
    RAISE EXCEPTION 'Phase 29 CACHE-03 migration failed: public.resumes.text_hash is missing or not nullable text';
  END IF;

  SELECT count(*) INTO v_index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename  = 'resumes'
    AND indexname  = 'resumes_text_hash_idx';

  IF v_index_count <> 1 THEN
    RAISE EXCEPTION 'Phase 29 CACHE-03 migration failed: index resumes_text_hash_idx was not created on public.resumes';
  END IF;

  RAISE NOTICE 'Phase 29 CACHE-03 verification passed';
END
$$;

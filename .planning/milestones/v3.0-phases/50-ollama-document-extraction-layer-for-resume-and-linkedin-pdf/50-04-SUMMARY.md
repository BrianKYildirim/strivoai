---
phase: 50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf
plan: 04
subsystem: backend
tags: [deno, supabase-edge, ocr-pdf, persistence, document-extraction]

requires:
  - phase: 50-02
    provides: Additive extraction metadata columns and Supabase types.
  - phase: 50-03
    provides: Shared pdfjs -> ollama -> claude_ocr extraction orchestration.
provides:
  - User-scoped accepted-text persistence helper for resumes and LinkedIn profile PDFs.
  - `ocr-pdf` compatibility wrapper around the shared extraction provider loop.
  - Backend stored-PDF callers that prefer accepted persisted text before re-extraction.
affects: [ocr-pdf, analyze-career, interview-prep-analyze, pdf-parser, document-persistence]

tech-stack:
  added: []
  patterns:
    - Accepted extraction text persists only after `ExtractionResult.ok === true`.
    - Raw stored PDFs skip Ollama image vision and preserve Claude document OCR fallback.

key-files:
  created:
    - supabase/functions/_shared/document-persistence.ts
    - supabase/functions/_shared/document-persistence.test.ts
  modified:
    - supabase/functions/ocr-pdf/index.ts
    - supabase/functions/_shared/pdf-parser.ts
    - supabase/functions/analyze-career/index.ts
    - supabase/functions/interview-prep-analyze/index.ts

key-decisions:
  - "Resume persistence remains filtered by both resume id and authenticated user id."
  - "LinkedIn profile persistence writes through existing profiles.linkedin_pdf_* fields only after accepted extraction."
  - "Backend raw-PDF paths use metadata-aware extraction but do not add Edge-side PDF rasterization."

requirements-completed: []

duration: partial executor handoff + manual closeout
completed: 2026-06-05
---

# Phase 50 Plan 04: Backend Extraction Wrapper and Persistence Summary

**Backend OCR and stored-PDF paths now use the shared accepted-text contract while keeping Claude as the reliability fallback.**

## Performance

- **Started:** 2026-06-05T12:15:00Z
- **Completed:** 2026-06-05T17:15:15Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added `persistAcceptedExtraction()` and `serializeExtractionMetadata()` for concise, user-scoped resume and LinkedIn profile writes.
- Refactored `ocr-pdf` to keep OPTIONS, `requireAuth`, tiered rate limiting, legacy `{ images, resumeId }` support, and response `{ text, pageCount }` compatibility while adding `metadata`.
- Added `extractPDFTextWithMetadata()` so backend raw-PDF callers can receive accepted text and provider metadata without changing the legacy `extractPDFText()` export.
- Updated `analyze-career` and `interview-prep-analyze` to prefer valid persisted accepted text before storage download and to persist accepted re-extraction results opportunistically.

## Endpoint Compatibility Notes

- `ocr-pdf` still accepts legacy image-only calls and defaults `documentType` to `resume`.
- `ocr-pdf` now accepts optional `pdfjsText`, `documentType`, and `resumeId`; provider configuration remains server-owned.
- All-provider failure returns `422` with `document_extraction_failed`, reason, and attempted provider list; no resume/profile write happens on failure.
- Claude page OCR remains the final fallback after pdfjs/Ollama rejection or failure.

## Persistence Proof

- Resume writes update `resumes.extracted_text`, `resumes.text_hash`, and `resumes.extraction_metadata` with `.eq('id', resumeId).eq('user_id', userId)`.
- LinkedIn profile writes update `profiles.linkedin_pdf_content`, optional filename, `linkedin_pdf_updated_at`, `linkedin_pdf_text_hash`, and `linkedin_pdf_extraction_metadata` with `.eq('id', userId)`.
- Serialized metadata includes provider, attempted providers, quality status, document type, text hash, extracted timestamp, and fallback reason only.

## Backend Raw-PDF Limits

- Raw stored PDFs do not call Ollama vision unless page images are supplied by a caller.
- `_shared/pdf-parser.ts` preserves Claude document OCR for raw PDF fallback.
- No `sharp`, `canvas`, browser worker, or `pdfjs-dist` dependency was added to Supabase Edge code.

## Task Commits

1. **Task 1: Add user-scoped accepted-text persistence helper** - `089b7ba`, `d5e4112`
2. **Task 2: Refactor ocr-pdf into a compatibility wrapper** - `391d578`
3. **Task 3: Align backend stored-PDF callers** - `e3a7107`

**Plan metadata:** committed separately after this summary.

## Files Created/Modified

- `supabase/functions/_shared/document-persistence.ts` - Central accepted-text persistence helper and metadata serializer.
- `supabase/functions/_shared/document-persistence.test.ts` - Persistence payload/filter and metadata serialization tests.
- `supabase/functions/ocr-pdf/index.ts` - Shared extraction wrapper with Ollama attempt and Claude fallback.
- `supabase/functions/_shared/pdf-parser.ts` - Metadata-aware raw PDF extraction export.
- `supabase/functions/analyze-career/index.ts` - Persisted accepted text reuse and opportunistic writeback.
- `supabase/functions/interview-prep-analyze/index.ts` - Persisted resume text reuse and accepted re-extraction writeback.

## Deviations from Plan

The first executor stalled after production commits but before `50-04-SUMMARY.md`. The orchestrator closed the agent, inspected the partial work, restored out-of-scope formatting drift in `50-03-SUMMARY.md` and `.planning/ROADMAP.md`, committed the remaining Task 3 backend files, and wrote this summary.

**Total deviations:** 1 manual closeout.
**Impact on plan:** No scope change; partial-plan state was resolved before Wave 4.

## Issues Encountered

- `deno.cmd test --allow-env supabase/functions/_shared/document-persistence.test.ts` is blocked by a Deno 2.7.1 Windows pipe panic after type-check.
- `deno.cmd test --allow-env supabase/functions/_shared/document-extraction.test.ts` is blocked by the same Deno 2.7.1 Windows pipe panic after type-check.

## Verification

- `deno.cmd check supabase/functions/_shared/document-persistence.ts supabase/functions/_shared/document-persistence.test.ts supabase/functions/_shared/pdf-parser.ts supabase/functions/ocr-pdf/index.ts supabase/functions/analyze-career/index.ts supabase/functions/interview-prep-analyze/index.ts` - PASS.
- `deno.cmd test --allow-env supabase/functions/_shared/document-persistence.test.ts` - BLOCKED by Deno 2.7.1 Windows pipe panic.
- `deno.cmd test --allow-env supabase/functions/_shared/document-extraction.test.ts` - BLOCKED by Deno 2.7.1 Windows pipe panic.
- `Select-String ... "eq('user_id'", "extraction_metadata", "linkedin_pdf_text_hash", "metadata"` - PASS, expected persistence and metadata contracts found.
- `rg -n "sharp|canvas|Worker|pdfjs-dist" supabase/functions/_shared/pdf-parser.ts supabase/functions/analyze-career/index.ts supabase/functions/interview-prep-analyze/index.ts` - PASS by no matches.

## User Setup Required

None.

## Next Phase Readiness

Plan 50-05 can migrate the primary frontend upload flows to a shared browser facade that sends `documentType`, page images, and `resumeId` to `ocr-pdf` without exposing provider configuration.

---
*Phase: 50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf*
*Completed: 2026-06-05*

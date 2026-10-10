---
phase: 50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf
plan: 02
subsystem: database
tags: [supabase, postgres, migration, generated-types, extraction-metadata]

requires:
  - phase: 29-foundation-infrastructure
    provides: resumes.extracted_text and resumes.text_hash canonical resume text storage
  - phase: 35-cross-feature-input-context-selectors-linkedin-auto-pull
    provides: profiles.linkedin_pdf_content LinkedIn source storage path
provides:
  - Nullable resume extraction metadata storage beside existing accepted resume text
  - Nullable LinkedIn PDF text hash and extraction metadata storage beside existing profile source content
  - Frontend Supabase types for all new nullable metadata fields
affects: [phase-50-document-extraction, resume-upload, linkedin-pdf-source, supabase-types]

tech-stack:
  added: []
  patterns:
    - Additive nullable Supabase metadata columns with no legacy row rewrite
    - Partial text-hash index for non-null LinkedIn PDF source hashes

key-files:
  created:
    - supabase/migrations/20260605000000_phase50_extraction_metadata.sql
    - .planning/phases/50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf/50-02-SUMMARY.md
  modified:
    - src/integrations/supabase/types.ts

key-decisions:
  - "Metadata lives beside existing canonical text fields rather than in cache, history, or archive tables."
  - "Metadata columns are nullable and legacy rows remain NULL until the next user-triggered extraction event."
  - "LinkedIn PDF text hash gets a partial btree index; jsonb metadata is intentionally not indexed in this plan."

patterns-established:
  - "Extraction metadata comments constrain stored JSON to concise operational fields only."

requirements-completed: []

duration: 5 min
completed: 2026-06-05
---

# Phase 50 Plan 02: Additive Extraction Metadata Schema and Supabase Types Summary

**Nullable extraction metadata and LinkedIn text-hash storage for accepted Resume and LinkedIn PDF text, exposed through generated Supabase types.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-05T11:52:00Z
- **Completed:** 2026-06-05T11:56:45Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `public.resumes.extraction_metadata jsonb NULL` for concise accepted resume extraction metadata.
- Added `public.profiles.linkedin_pdf_text_hash text NULL` and `public.profiles.linkedin_pdf_extraction_metadata jsonb NULL` for accepted LinkedIn PDF source metadata.
- Added `profiles_linkedin_pdf_text_hash_idx` as a partial btree index over non-null LinkedIn PDF text hashes.
- Updated `profiles` and `resumes` Supabase Row/Insert/Update types for later frontend and backend wiring.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add nullable extraction metadata columns without backfill** - `44d933f` (feat)
2. **Task 2: Update Supabase generated types for metadata fields** - `ba56385` (feat)

**Plan metadata:** committed by the docs close-out commit for this summary.

## Files Created/Modified

- `supabase/migrations/20260605000000_phase50_extraction_metadata.sql` - Additive nullable metadata columns, LinkedIn text-hash index, and comments limiting metadata to concise operational extraction fields.
- `src/integrations/supabase/types.ts` - Generated Supabase type exposure for the new nullable metadata columns in Row/Insert/Update.
- `.planning/phases/50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf/50-02-SUMMARY.md` - Plan execution close-out.

## Verification

- `Select-String -Path supabase/migrations/20260605000000_phase50_extraction_metadata.sql -Pattern 'ADD COLUMN IF NOT EXISTS|CREATE INDEX IF NOT EXISTS|extraction_metadata|linkedin_pdf_text_hash' -CaseSensitive`
  - PASS: found idempotent add-column/index statements plus `extraction_metadata`, `linkedin_pdf_text_hash`, and `linkedin_pdf_extraction_metadata` references.
- `Select-String -Path supabase/migrations/20260605000000_phase50_extraction_metadata.sql -Pattern '\bUPDATE\b|\bDELETE\b|\bINSERT\b|backfill'`
  - PASS: returned no matches.
- `Select-String -Path src/integrations/supabase/types.ts -Pattern 'extraction_metadata|linkedin_pdf_text_hash|linkedin_pdf_extraction_metadata'`
  - PASS: found `profiles` Row/Insert/Update fields and `resumes` Row/Insert/Update fields.

## Decisions Made

- Followed the plan's database boundary: no triggers, no RLS changes, no new tables, no data rewrites, and no schema changes outside `resumes` and `profiles`.
- Kept metadata comments explicit that prompts, images, provider transcripts, raw model responses, and page-level debug logs do not belong in user-row metadata.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope change.

## Issues Encountered

- `apply_patch` could not edit `src/integrations/supabase/types.ts` because the file is UTF-16 LE. The generated type edits were applied with exact PowerShell replacements while preserving the existing UTF-16 LE byte order mark and encoding.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 50-02 is ready for later Phase 50 provider orchestration and persistence plans. The schema now has nullable support fields for accepted-provider metadata, and the frontend Supabase types expose those fields.

## Self-Check: PASSED

---
*Phase: 50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf*
*Completed: 2026-06-05*

---
status: resolved
resolution: operator-confirmed completed & shipped; closed at v4.0 milestone close 2026-06-25
trigger: "$gsd-debug during the onboarding process I am met with this error when trying to analyze a DOCX on free tier during the onboarding process: mime type application/vnd.openxmlformats-officedocument.wordprocessingml.document is not supported"
created: 2026-06-07
updated: 2026-06-25
---

# Debug Session: docx-onboarding-mime-type

## Symptoms

- expected_behavior: A free-tier user can upload a DOCX resume during onboarding and run the onboarding analysis flow.
- actual_behavior: The onboarding analysis rejects the DOCX file before analysis completes.
- error_messages: `mime type application/vnd.openxmlformats-officedocument.wordprocessingml.document is not supported`
- timeline: Reported on 2026-06-07. Unknown whether this worked previously.
- reproduction: Start onboarding as a free-tier user, upload a DOCX resume, and attempt to analyze it.

## Current Focus

- hypothesis: The onboarding upload/analyze path accepts or advertises DOCX but sends the raw DOCX MIME type into a parser or edge function that only supports PDF/plain text MIME types.
- test: Trace onboarding resume upload MIME handling from frontend file selection through Supabase invocation and backend parser dispatch.
- expecting: A mismatch between accepted DOCX input and downstream parser support, likely requiring either DOCX extraction support or a clear frontend restriction.
- next_action: gather initial evidence
- reasoning_checkpoint:
- tdd_checkpoint:

## Evidence

- timestamp: 2026-06-07
  observation: `src/pages/Onboarding.tsx` accepts `ACCEPTED_RESUME_DOCUMENT_ACCEPT` and calls `extractDocumentFromFile({ documentType: 'resume', resumeId: resume.id })`, so DOCX reaches the shared frontend extraction path.
- timestamp: 2026-06-07
  observation: `src/lib/document-extraction.ts` defines `ACCEPTED_RESUME_DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md']` and includes a browser DOCX parser.
- timestamp: 2026-06-07
  observation: Onboarding uploads to `supabase.storage.from("resumes").upload(fileName, resumeFile)` before extraction, so Storage can reject the file before DOCX parsing runs.
- timestamp: 2026-06-07
  observation: `supabase/migrations/20251113102013_aa07c3f5-c7ff-4492-9a5b-6867ce76d3a7.sql` created the `resumes` bucket with `allowed_mime_types = ARRAY['application/pdf']::text[]`.
- timestamp: 2026-06-07
  observation: The reported error MIME, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, is not in that storage allowlist.

## Eliminated

- hypothesis: The frontend file picker blocks DOCX in onboarding.
  reason: Onboarding uses the shared accepted resume document constants that include `.docx`.
- hypothesis: The shared frontend extractor has no DOCX path.
  reason: `extractDocumentFromFile` routes `.docx` files to `extractDocxText`.

## Resolution

- root_cause: The DOCX upload was rejected by the Supabase Storage `resumes` bucket because the bucket MIME allowlist still only permitted `application/pdf`, even though the UI and extraction helper now accept DOCX/TXT/MD resume files.
- fix: Added a migration to update the `resumes` bucket allowed MIME types for PDF, DOCX, TXT, and Markdown variants. Added a focused regression assertion tying the storage migration to the resume document support contract.
- verification: `npm.cmd test -- src/pages/__tests__/document-extraction-primary.test.ts src/pages/__tests__/document-extraction-secondary.test.ts` passed with 2 files / 12 tests. `npm.cmd run build` passed with existing Vite chunk-size and plugin timing warnings.
- files_changed: `supabase/migrations/20260607050000_allow_resume_document_mime_types.sql`, `src/pages/__tests__/document-extraction-primary.test.ts`

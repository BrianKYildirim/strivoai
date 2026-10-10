# Phase 51: Cost-optimized document extraction - Plan

**Status:** Ready for execution  
**Phase directory:** `.planning/phases/51-cost-optimized-document-extraction`  
**Primary goal:** Replace the obsolete Phase 50 Ollama-centered extraction behavior with a parser-first, backend-policy-owned document extraction pipeline for Resume and LinkedIn PDF flows.

## Overview

Phase 51 implements a production-grade document text extraction layer that reduces OCR spend while preserving paid-user reliability. The pipeline must accept reliable embedded/selectable PDF text first, use configured cheap OCR providers only when parser output fails deterministic quality validation, and reserve Claude OCR as a final reliability fallback only for literal Elite users.

This phase reuses useful Phase 50 scaffolding where appropriate, including existing frontend extraction facades, shared extraction contracts, quality gates, persistence helpers, provider metadata patterns, and tests. It must replace conflicting Phase 50 behavior:

- no Ollama-first routing;
- no unconditional Claude fallback;
- no raw-byte/regex PDF parsing as primary extraction;
- backend-owned literal Elite OCR policy;
- accepted-text reuse with a document identity key;
- explicit controls for cost leaks, cache poisoning, caller drift, and metadata exposure.

The intended extraction order is:

1. Accepted-text reuse by `user_id + document_hash + document_type + extraction_version`.
2. Real PDF embedded-text parser.
3. Configured cheap OCR providers in order: `ollama`, `mistral`, `textract`.
4. `claude_ocr` only when the backend-resolved tier is literal `elite`.
5. Controlled extraction failure with operational user copy.

## Requirements Mapping

| Requirement / Decision | Plan coverage |
| --- | --- |
| D-01 parser-first, configured cheap OCR chain | Tasks 2, 3, 4 update shared extraction orchestration and provider clients. |
| D-02 Claude OCR excluded from cheap chain | Task 3 separates cheap providers from Elite-only final fallback. |
| D-03 provider timeout/error continuation | Task 4 adds provider result contracts, timeout handling, and all-settled style continuation. |
| D-04 literal Elite only for Claude OCR | Task 5 computes `allowClaudeOcr` server-side from literal `elite`; legacy Pro is not elevated. |
| D-05 Free/non-Elite never call Claude OCR | Task 5 and tests assert no `claude_ocr` attempt for Free/Pro/legacy Pro/admin Pro. |
| D-06 Elite Claude only after parser and cheap providers fail | Task 3 and Deno tests enforce provider order. |
| D-07 accepted reuse key includes identity | Task 6 keys reuse by `user_id + document_hash + document_type + extraction_version`, not just `text_hash`. |
| D-08 user-scoped reuse | Task 6 keeps reuse scoped to the current authenticated user. |
| D-09 do not rerun OCR on accepted reuse hit | Task 6 adds lookup short-circuit before provider calls. |
| D-10 through D-12 generic quality gate | Task 7 hardens permissive document-likeness checks and rejects weak OCR before persistence. |
| D-13 and D-14 failure UX / no provider exposure | Tasks 8 and 9 add generic frontend copy and keep provider details in logs/metadata only. |
| D-15 do not analyze weak extraction | Task 7 blocks downstream analysis when quality gate fails. |
| D-16 through D-18 Phase 50 normalization | Tasks 2, 3, and 10 remove Ollama-first and Claude-for-all assumptions. |
| D-19 through D-23 persistence and metadata | Tasks 6 and 9 persist accepted text and concise metadata only. |
| CACHE-02 / CACHE-03 / CACHE-11 / CACHE-12 | Task 6 reuses hashing precedent, user-scoped lookup, and post-success persistence. |
| TEST-01 | Test Plan includes focused automated and manual verification. |
| NFR-01 / NFR-05 | Tasks 1, 5, 6 preserve idempotent migrations, JWT auth, CORS, and edge-function patterns. |

## Scope / Non-goals

In scope:

- Resume PDF extraction from upload surfaces that currently call `extractDocumentFromPdf`.
- LinkedIn PDF extraction from onboarding, profile, LinkedIn Grader, and Career Compass flows.
- Shared Deno extraction contracts and provider routing under `supabase/functions/_shared/`.
- `ocr-pdf` as the stable frontend compatibility endpoint, converted into a policy-enforcing extraction endpoint.
- Accepted extracted text persistence for `resumes` and `profiles.linkedin_pdf_*`.
- Additive schema support for document identity and extraction version when current columns/metadata are insufficient.
- Focused tests for provider order, tier policy, quality rejection, persistence, and user-facing metadata hygiene.

Out of scope:

- Pricing, Merits, Stripe, subscription entitlement changes, or visible tier plan changes.
- Treating legacy Pro as Elite for OCR unless an existing backend tier source literally resolves to `elite`.
- Global or cross-user document extraction cache.
- Structured resume/LinkedIn parsing beyond raw accepted text extraction.
- Broad historical backfill of all legacy documents.
- DOCX extraction rewrites, except preserving existing DOCX fallback messaging and avoiding regressions.
- Prompt changes for downstream analysis features unless needed to stop weak extraction text from entering analysis.
- Editing `.gitignore`.

## Implementation Tasks

### 1. Add document identity schema support

Files:

- `supabase/migrations/<timestamp>_phase51_document_extraction_identity.sql`
- `src/integrations/supabase/types.ts`

Steps:

1. Add nullable, additive columns where metadata-only identity is not enough:
   - `resumes.document_hash text null`
   - `resumes.extraction_version text null`
   - `profiles.linkedin_pdf_document_hash text null`
   - `profiles.linkedin_pdf_extraction_version text null`
2. Add partial indexes for fast user-scoped reuse:
   - `resumes(user_id, document_hash, extraction_version) where document_hash is not null`
   - `profiles(id, linkedin_pdf_document_hash, linkedin_pdf_extraction_version) where linkedin_pdf_document_hash is not null`
3. Keep `text_hash` as the accepted-text fingerprint for analysis cache inputs, but do not use it alone as extraction reuse identity.
4. Make the migration idempotent with `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and comments describing document hash vs text hash.
5. Regenerate or update Supabase TypeScript types in the established repo style.

### 2. Normalize extraction provider contracts

Files:

- `supabase/functions/_shared/document-extraction-types.ts`
- `src/lib/document-extraction.ts`
- existing tests under `supabase/functions/_shared/*.test.ts` and `src/pages/__tests__/document-extraction-*.test.ts`

Steps:

1. Replace or compatibility-map Phase 50 provider labels so the stable server labels are:
   - `pdf_parser`
   - `ollama`
   - `mistral`
   - `textract`
   - `claude_ocr`
2. Keep a compatibility mapping for existing frontend `pdfjs` metadata only if needed, but persisted server metadata should use `pdf_parser`.
3. Add an `extractionVersion` constant such as `phase51-v1`.
4. Extend metadata contracts with:
   - `documentHash`
   - `documentType`
   - `extractionVersion`
   - `provider`
   - `attemptedProviders`
   - `qualityStatus`
   - `fallbackReason`
   - `reusedAcceptedText`
5. Ensure serialized metadata excludes raw provider responses, prompts, image payloads, screenshots, and secrets.

### 3. Replace Phase 50 extraction routing

Files:

- `supabase/functions/_shared/document-extraction.ts`
- `supabase/functions/_shared/pdf-parser.ts`
- `supabase/functions/ocr-pdf/index.ts`

Steps:

1. Make the backend extraction chain parser-first.
2. Remove Ollama-first or Ollama-primary behavior. Ollama is only an optional cheap OCR provider after parser failure.
3. Remove unconditional Claude fallback. Claude can be attempted only when the policy object explicitly allows it.
4. Remove raw-byte/regex PDF parsing as a primary success path. If any raw-byte heuristic remains, it must be diagnostic or last-resort rejected evidence, not accepted parser output.
5. Ensure `pdf-parser.ts` uses a real parser compatible with Deno/Supabase Edge runtime, or delegates to the accepted frontend parser result when provided and quality-validated.
6. Make provider order deterministic:
   - `pdf_parser`
   - configured `ollama`
   - configured `mistral`
   - configured `textract`
   - `claude_ocr` only when `allowClaudeOcr === true`
7. Return structured failure when all allowed providers fail or are quality-rejected.

### 4. Add cheap OCR provider adapters

Files:

- `supabase/functions/_shared/ollama-client.ts`
- `supabase/functions/_shared/mistral-ocr-client.ts`
- `supabase/functions/_shared/textract-client.ts`
- `supabase/functions/_shared/document-extraction.ts`
- `supabase/functions/deno.json` if test/import mappings are needed

Steps:

1. Keep existing Ollama support as optional and configuration-gated.
2. Add Mistral and Textract adapters behind explicit env/config checks.
3. Skip providers with missing config without user-visible failure.
4. Give each provider explicit timeout handling and concise reason codes.
5. Normalize adapter responses into a shared `{ ok, text?, reason? }` contract.
6. Continue to the next allowed provider on unavailable, slow, invalid, or quality-rejected output.
7. Do not allow frontend request bodies to provide provider URLs, credentials, or routing overrides.

### 5. Enforce backend-owned tier policy

Files:

- `supabase/functions/ocr-pdf/index.ts`
- `supabase/functions/_shared/document-extraction.ts`
- existing tier helpers or profile/subscription lookup utilities used by edge functions
- focused tests for `ocr-pdf` and shared extraction

Steps:

1. Authenticate the request with existing JWT auth patterns.
2. Resolve the caller's tier server-side from trusted backend state.
3. Compute `allowClaudeOcr` only when the resolved tier is exactly `elite`.
4. Do not treat `pro`, legacy Pro, trial Pro, admin Pro, frontend override state, or missing tier as Elite.
5. Pass the explicit policy object into extraction:
   - `userId`
   - `documentType`
   - `documentHash`
   - `extractionVersion`
   - `tier`
   - `allowClaudeOcr`
6. Log tier policy decisions with reason codes, not sensitive subscription details.
7. Add regression tests that prove non-Elite requests never attempt `claude_ocr`.

### 6. Implement accepted-text reuse by document identity

Files:

- `supabase/functions/_shared/document-persistence.ts`
- `supabase/functions/_shared/cache-fingerprint.ts`
- `supabase/functions/ocr-pdf/index.ts`
- `src/lib/document-extraction.ts`
- `src/pages/Upload.tsx`
- `src/pages/Onboarding.tsx`
- `src/pages/LinkedInGrader.tsx`
- `src/pages/CareerCompass.tsx`
- `src/pages/Profile.tsx`
- secondary upload surfaces: `src/pages/RecruitingLens.tsx`, `src/pages/Jobs.tsx`, `src/components/ActionFirstHero.tsx`, `src/components/MinimalHero.tsx`

Steps:

1. Compute `documentHash` from bytes, not extracted text, using existing hashing precedent where practical.
2. Check for accepted text before provider calls:
   - resumes: current user, document type `resume`, same `documentHash`, same `extractionVersion`, accepted `extracted_text`.
   - LinkedIn: current user profile, document type `linkedin_profile`, same `linkedin_pdf_document_hash`, same `linkedin_pdf_extraction_version`, accepted `linkedin_pdf_content`.
3. On reuse hit, return accepted text and metadata with `reusedAcceptedText: true`.
4. On fresh success, persist accepted text, `text_hash`, document hash, extraction version, and concise metadata.
5. Never persist low-quality or failed OCR text.
6. Ensure replacement semantics still work for LinkedIn PDFs: a new document hash replaces the prior `linkedin_pdf_*` source for that user.
7. Make each caller pass or derive document type, file name, document hash, and extraction version context.

### 7. Harden generic document quality gates

Files:

- `supabase/functions/_shared/document-quality.ts`
- `supabase/functions/_shared/document-quality.test.ts`
- `src/lib/document-extraction.ts` if frontend parser output is quality-gated before fallback

Steps:

1. Keep the gate permissive and generic; do not require resume-specific or LinkedIn-specific keywords.
2. Validate meaningful length, word count, printable ratio, garbage/noise ratio, repetition, and document-likeness.
3. Reject common bad parser/OCR outputs:
   - tiny text fragments
   - repeated glyph noise
   - mostly symbols
   - PDF operator leftovers
   - page/image metadata without human-readable content
4. Record concise rejection reasons and continue to the next provider.
5. Block downstream analysis if no accepted text passes the gate.
6. Add tests with valid nontraditional resume/profile text, international-style text, scanned-PDF garbage, and repeated OCR artifacts.

### 8. Update frontend extraction facade and callers

Files:

- `src/lib/document-extraction.ts`
- `src/lib/extract-pdf-text.ts`
- `src/lib/pdf-extractor.worker.ts`
- `src/pages/Upload.tsx`
- `src/pages/Onboarding.tsx`
- `src/pages/LinkedInGrader.tsx`
- `src/pages/CareerCompass.tsx`
- `src/pages/Profile.tsx`
- secondary upload surfaces listed in Task 6

Steps:

1. Keep client-side pdf.js extraction as a fast parser path for text-based PDFs.
2. Route fallback through `ocr-pdf` with document identity and document type.
3. Do not expose provider names, provider order, attempted providers, or tier policy details in page UI.
4. Use generic failure copy for scanned PDFs when the backend rejects extraction:
   - "We could not read this file reliably. Please upload a text-based PDF or DOCX, or paste the text directly."
5. Preserve existing upload UX and downstream feature flows for text-based PDFs.
6. Ensure every caller uses the shared facade to prevent caller drift.
7. Add source-level tests that fail if upload surfaces bypass the shared extraction facade or expose provider metadata in UI copy.

### 9. Keep metadata concise and support-safe

Files:

- `supabase/functions/_shared/document-persistence.ts`
- `src/lib/document-extraction.ts`
- `supabase/functions/ocr-pdf/index.ts`
- profile/resume persistence callers

Steps:

1. Persist concise metadata only:
   - `provider`
   - `attemptedProviders`
   - `fallbackReason`
   - `qualityStatus`
   - `textHash`
   - `documentHash`
   - `documentType`
   - `extractionVersion`
   - `extractedAt`
   - `reusedAcceptedText`
2. Do not persist raw failed OCR output, page images, screenshots, provider prompts, provider transcripts, request payloads, secrets, or stack traces.
3. Keep operational provider details available to support through logs and metadata, not normal UI.
4. Add tests for metadata serialization to prevent accidental overexposure.

### 10. Update and replace Phase 50 tests

Files:

- `supabase/functions/_shared/document-extraction.test.ts`
- `supabase/functions/_shared/document-quality.test.ts`
- `supabase/functions/_shared/document-persistence.test.ts`
- `supabase/functions/_shared/ollama-client.test.ts`
- new tests for Mistral/Textract adapters if adapters are implemented
- `src/pages/__tests__/document-extraction-primary.test.ts`
- `src/pages/__tests__/document-extraction-secondary.test.ts`

Steps:

1. Replace tests that expect Claude fallback for all users.
2. Add tests for literal Elite-only Claude fallback.
3. Add tests proving Pro and legacy Pro do not receive Claude OCR.
4. Add tests proving Ollama is not first and not primary.
5. Add tests proving raw-byte/regex parser output is not accepted as primary extraction.
6. Add tests proving accepted-text reuse short-circuits provider calls.
7. Add tests proving rejected OCR output is not persisted.
8. Add tests proving provider metadata is not rendered in user-facing UI.

## Test Plan

Run focused commands first:

```powershell
deno.cmd test --config supabase/functions/deno.json supabase/functions/_shared/document-extraction.test.ts
deno.cmd test --config supabase/functions/deno.json supabase/functions/_shared/document-quality.test.ts
deno.cmd test --config supabase/functions/deno.json supabase/functions/_shared/document-persistence.test.ts
deno.cmd test --config supabase/functions/deno.json supabase/functions/_shared/ollama-client.test.ts
npm.cmd test -- src/pages/__tests__/document-extraction-primary.test.ts
npm.cmd test -- src/pages/__tests__/document-extraction-secondary.test.ts
npm.cmd run build
```

Add or update tests to cover:

- Parser success returns accepted text and attempts no OCR.
- Parser low-quality output tries configured cheap OCR providers in order.
- Missing cheap-provider config skips provider without surfacing provider details to the user.
- Free, Pro, legacy Pro, and admin/trial Pro never attempt `claude_ocr`.
- Literal Elite attempts `claude_ocr` only after parser and configured cheap providers fail or are rejected.
- Accepted text reuse by `user_id + document_hash + document_type + extraction_version` returns without provider calls.
- Same `text_hash` with a different `document_hash` does not count as an extraction reuse hit.
- Low-quality OCR text is not persisted to `resumes.extracted_text` or `profiles.linkedin_pdf_content`.
- Metadata serialization excludes raw OCR text, images, prompts, transcripts, and secrets.
- Upload, onboarding, profile, LinkedIn Grader, Career Compass, and secondary upload surfaces call the shared extraction facade.

Manual QA:

1. Free user uploads a text-based resume PDF and reaches Resume Analysis without OCR provider metadata shown.
2. Free user uploads a scanned resume PDF with cheap providers disabled and sees the generic "could not read reliably" copy.
3. Pro or legacy Pro user uploads a scanned LinkedIn PDF with cheap providers disabled and does not trigger Claude OCR.
4. Elite user uploads the same scanned PDF and reaches Claude OCR only after parser/cheap providers fail.
5. Re-uploading the same accepted document for the same user reuses accepted text without another OCR call.
6. Uploading a different document with identical extracted text does not reuse solely by `text_hash`.
7. Replacing a LinkedIn PDF updates `profiles.linkedin_pdf_*` fields and downstream LinkedIn Grader/Career Compass use the new source.

## Security/Cost Controls

- Backend owns provider policy. Frontend may send document metadata, but not provider routing authority.
- Claude OCR is gated by backend-resolved literal `elite` only.
- Legacy Pro normalization must not grant Elite OCR unless backend subscription state literally resolves to `elite`.
- Provider credentials, URLs, and routing flags come only from server environment.
- Cheap providers are skipped when unconfigured; missing config is not a user-facing error.
- Every provider has timeouts and concise failure reasons to prevent request hangs and cost leaks.
- Accepted text is user-scoped; no cross-user cache sharing.
- Reuse key includes document identity, preventing cache poisoning by `text_hash` collisions or unrelated documents with similar text.
- Quality gate blocks weak OCR from cache, history, and downstream analysis.
- Logs and metadata use reason codes and stable provider labels; they do not include raw OCR failures, images, prompts, provider transcripts, or secrets.
- User-facing errors do not reveal provider order, provider names, or internal policy decisions.

## Rollback

Code rollback:

1. Revert Phase 51 source changes in extraction helpers, `ocr-pdf`, frontend facade/callers, and tests.
2. Keep additive nullable schema columns in place unless there is a strong operational reason to remove them.
3. If rollback must disable Phase 51 behavior without reverting all code, set cheap provider config empty and temporarily force fallback failure for non-parser scanned PDFs while preserving parser-first text-based PDF success.
4. Do not restore unconditional Claude fallback except as a short-lived emergency patch for literal Elite only.

Database rollback:

1. Additive nullable columns and indexes can remain safely.
2. If removal is required, drop indexes first, then drop Phase 51 identity columns.
3. Do not delete existing `resumes.extracted_text`, `resumes.text_hash`, `profiles.linkedin_pdf_content`, or `profiles.linkedin_pdf_text_hash`.

Operational rollback checks:

- Text-based PDF upload still works.
- Existing accepted text remains readable by Resume Analysis, LinkedIn Grader, Career Compass, and Interview Prep callers.
- Failed scanned PDFs show controlled user copy instead of running analysis on weak text.

## Acceptance/UAT

Phase 51 is accepted when:

- Text-based Resume and LinkedIn PDFs succeed through parser-first extraction.
- Ollama is never the primary route and is only attempted after parser failure when configured.
- Claude OCR is never called unconditionally.
- Claude OCR is called only for backend-resolved literal Elite users and only after parser plus configured cheap providers fail or are rejected.
- Free, Pro, legacy Pro, and admin/trial Pro scanned PDFs never trigger Claude OCR.
- Raw-byte/regex PDF parsing is not accepted as the primary extraction path.
- Accepted extracted text reuse is keyed by `user_id + document_hash + document_type + extraction_version`, not only `text_hash`.
- Reuse hits do not rerun OCR.
- Low-quality extraction output is not persisted and does not flow into downstream analysis.
- Provider metadata is concise and support-safe.
- Normal users never see provider names, provider order, or internal failure details.
- All focused Deno/Vitest tests pass.
- `npm.cmd run build` passes.

## Risks/Open Questions

- Deno-compatible embedded PDF parser choice may require a small spike. If no reliable Deno parser fits, keep frontend pdf.js parser as the accepted parser path and ensure backend still owns OCR fallback policy.
- Mistral and Textract adapter details depend on available environment configuration and deployment secrets. Adapters should be configuration-gated and non-blocking when secrets are absent.
- Existing Phase 50 tests may encode obsolete behavior; execution should update those tests rather than preserve incorrect Claude/Ollama assumptions.
- Multiple upload surfaces create caller drift risk. The shared `extractDocumentFromPdf` facade and source-level tests are required controls.
- Metadata expansion can accidentally expose sensitive provider payloads. Serialization tests should lock the allowed metadata shape.
- Adding document identity columns is preferred for queryability, but some identity fields may also live in JSON metadata for compatibility. The executor should avoid broad schema rewrites.

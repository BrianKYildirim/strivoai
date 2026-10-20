# Phase 51: Cost-optimized document extraction - Research

**Generated:** 2026-06-07
**Scope:** Local planning/codebase research only. Network research was not used.
**Phase directory:** `.planning/phases/51-cost-optimized-document-extraction`

## Summary

Phase 51 replaces the obsolete Phase 50 extraction architecture with a parser-first, tier-aware document extraction pipeline for Resume and LinkedIn PDF flows. The target behavior is:

1. Accept embedded/selectable PDF text through a real parser before any OCR.
2. Try configured cheap OCR providers only after parser text fails quality validation.
3. Allow Claude OCR only for literal Elite users, and only after parser plus cheap providers fail or are unavailable.
4. Reuse accepted extracted text by user-scoped document identity instead of rerunning OCR.
5. Persist only accepted text plus concise provider/quality metadata.

The current codebase already contains Phase 50 scaffolding that can be reused selectively: frontend extraction facades, shared Deno extraction contracts, quality gates, persistence helpers, provider metadata, and tests. The main planning challenge is to keep the useful contracts while removing or hardening Phase 50 assumptions that conflict with Phase 51: Ollama-first fallback architecture, unconditional Claude fallback, raw-byte/regex PDF parsing, and missing explicit tier policy at extraction boundaries.

## Local Findings

### Planning source of truth

- `.planning/phases/51-cost-optimized-document-extraction/51-CONTEXT.md` locks the key decisions:
  - parser first;
  - cheap OCR provider chain in order `Ollama -> Mistral -> Textract` when configured;
  - Claude OCR excluded from cheap chain and allowed only as final Elite fallback;
  - accepted text reuse keyed by `user_id + document_hash + document_type + extraction_version`;
  - permissive document-likeness quality gate;
  - no raw failed OCR output or provider debug payload persistence.
- `.planning/ROADMAP.md` marks Phase 50 obsolete and Phase 51 as the replacement architecture. Phase 51 depends on Phase 49, not Phase 50.
- `.planning/REQUIREMENTS.md` still matters because Phase 51 must preserve v3.0 cache/history constraints:
  - user-scoped cache/reuse (`CACHE-11`);
  - deterministic input hashes (`CACHE-02`, `CACHE-03`, `CACHE-04..07`);
  - accepted text should not be written before successful extraction/persistence (`CACHE-12`);
  - each fix needs automated tests or documented QA (`TEST-01`);
  - CORS, auth, rate limiting, and prompt-sanitization patterns must remain intact (`NFR-05`).

### Existing implementation surfaces

Targeted local search found these active extraction touchpoints:

- Frontend parser/fallback facade:
  - `src/lib/extract-pdf-text.ts`
  - `src/lib/pdf-extractor.worker.ts`
  - `src/lib/pdf-worker.ts`
  - `src/lib/document-extraction.ts`
- Primary frontend callers:
  - `src/pages/Upload.tsx`
  - `src/pages/LinkedInGrader.tsx`
  - `src/pages/Onboarding.tsx`
  - `src/pages/CareerCompass.tsx`
  - `src/pages/Profile.tsx`
  - `src/pages/RecruitingLens.tsx`
  - `src/pages/Jobs.tsx`
  - `src/components/ActionFirstHero.tsx`
  - `src/components/MinimalHero.tsx`
- Backend extraction and persistence:
  - `supabase/functions/ocr-pdf/index.ts`
  - `supabase/functions/_shared/document-extraction.ts`
  - `supabase/functions/_shared/document-extraction-types.ts`
  - `supabase/functions/_shared/document-quality.ts`
  - `supabase/functions/_shared/document-persistence.ts`
  - `supabase/functions/_shared/ollama-client.ts`
  - `supabase/functions/_shared/pdf-parser.ts`
  - `supabase/functions/_shared/cache-fingerprint.ts`
- Backend consumers of accepted extraction text:
  - `supabase/functions/analyze-resume/index.ts`
  - `supabase/functions/analyze-career/index.ts`
  - `supabase/functions/interview-prep-analyze/index.ts`
  - `supabase/functions/grade-linkedin/index.ts`
  - `supabase/functions/recruiting-lens/index.ts`

### Current data surfaces

Targeted search confirms existing persistence columns and generated Supabase types:

- `resumes.extracted_text`
- `resumes.text_hash`
- `resumes.file_hash`
- `resumes.extraction_metadata`
- `profiles.linkedin_pdf_content`
- `profiles.linkedin_pdf_text_hash`
- `profiles.linkedin_pdf_extraction_metadata`
- `profiles.linkedin_pdf_filename`
- `profiles.linkedin_pdf_updated_at`

These are compatible with Phase 51's "accepted text plus concise metadata" rule, but Phase 51 likely needs either additive columns or metadata fields for:

- `document_hash`
- `document_type`
- `extraction_version`
- `provider`
- `attempted_providers`
- `quality_status`
- `fallback_reason` / failure reason

### Current conflicts with Phase 51

- `supabase/functions/_shared/document-extraction-types.ts` currently exposes provider values found by search as `pdfjs | ollama | claude_ocr`. Phase 51 needs stable labels closer to `pdf_parser | ollama | mistral | textract | claude_ocr`, or a compatibility mapping if `pdfjs` remains as the frontend/client parser label.
- `supabase/functions/_shared/document-extraction.ts` currently has tests showing fallback from rejected parser/Ollama text into Claude OCR. Phase 51 requires that fallback to be policy-gated so Free, Pro, legacy Pro, and admin/trial Pro cannot trigger Claude OCR.
- `supabase/functions/_shared/pdf-parser.ts` still contains historical raw-byte/regex extraction methods such as text stream matching, `BT/ET` parsing, and ASCII scraping. Roadmap guidance says those must not remain the primary success path.
- `supabase/functions/analyze-career/index.ts` contains DOCX extraction paths that can call Anthropic for insufficient DOCX XML extraction. Phase 51 is scoped to Resume and LinkedIn PDF flows, but the user-facing failure copy explicitly mentions DOCX as a fallback input. Planning should avoid accidentally changing DOCX behavior unless required for unified extraction contracts.
- Existing frontend callers invoke `extractDocumentFromPdf(...)` from many entry points. Phase 51 needs each caller to pass or derive explicit `user_id`, `document_type`, `document_hash`, `extraction_version`, and tier/policy context. Current frontend-only tier state must not be trusted for Claude fallback authorization.

### Reusable assets from Phase 50

- Existing browser pdf.js worker extraction can remain the first client-side fast path for text-based PDFs, provided server-side policy remains authoritative for OCR.
- Existing `ocr-pdf` edge function is a natural compatibility wrapper, but it should become a policy-enforcing extraction endpoint rather than an unconditional provider fallback.
- Existing `document-quality.ts` and tests are likely reusable if thresholds are generic and permissive enough for resumes, LinkedIn exports, international formats, and nontraditional profiles.
- Existing `document-persistence.ts` is useful for accepted-text writes, especially because it already avoids writing rejected extraction results.
- Existing `ollama-client.ts` can remain as an optional cheap OCR provider behind env configuration and timeout/error handling.
- Existing cache helper `_shared/cache-fingerprint.ts` is the precedent for deterministic hashes and should be reused for extraction/document hashes where practical.

## Implementation Implications

1. Introduce an explicit extraction policy object at the backend boundary.
   - Required fields should include `userId`, resolved server-side tier, `documentType`, `documentHash`, `extractionVersion`, and `allowClaudeOcr`.
   - `allowClaudeOcr` must be computed server-side from literal Elite only.

2. Keep `ocr-pdf` as the stable frontend endpoint, but move provider routing into a shared backend orchestrator.
   - Frontend may supply `pdfjsText`, rendered page images, `resumeId`, `documentType`, and document hash.
   - Frontend must not supply provider URLs, credentials, or a trusted tier override.

3. Replace the provider contract with a deterministic chain.
   - Parser provider first: `pdf_parser` or a compatibility alias from current `pdfjs`.
   - Cheap OCR providers next: `ollama`, then `mistral`, then `textract`, each skipped when unconfigured.
   - Claude final: `claude_ocr` only when policy permits.

4. Add accepted-text lookup before expensive extraction.
   - Lookup key should be `user_id + document_hash + document_type + extraction_version`.
   - For resumes, `resumes.file_hash` is a useful existing document-byte hash but may not be enough for cross-feature reuse unless a separate extraction identity table or metadata field is added.
   - For LinkedIn PDFs, there is no obvious standalone document hash column from the targeted search; likely add one alongside existing `profiles.linkedin_pdf_*` fields or encode it in metadata with an indexed path only if query patterns remain simple.

5. Add or normalize metadata schema.
   - Persist concise allowlisted metadata only.
   - Avoid raw text snippets, page images, provider prompts, provider responses, secrets, and debug payloads.
   - Include enough fields for support and tests: provider used, attempted providers, extraction version, quality status, text hash, fallback reason, and failure reason.

6. Keep quality gates generic.
   - Minimum meaningful text length and word count.
   - Printable ratio and garbage/noise ratio.
   - Repetition checks.
   - Broad document-likeness checks, not resume/LinkedIn keyword requirements.

7. Update tests around policy and cost routing.
   - Parser success must assert no OCR providers are called.
   - Free/non-Elite scanned PDF must assert Claude is not called.
   - Elite scanned PDF must assert cheap providers are attempted before Claude.
   - Low-quality provider output must not persist.
   - Accepted cached text must skip OCR.
   - Metadata must be concise and must not include raw failed output.

## Risks

- **Cost leak risk:** Any path that still calls `claude_ocr` without server-side Elite policy will violate the phase goal.
- **Reliability regression risk:** Removing Claude fallback for Free/Pro scanned PDFs will create controlled failures where users may previously have gotten an answer. Failure copy must be specific and operational.
- **Parser compatibility risk:** A Deno-compatible "real PDF parser" may be difficult under Supabase Edge constraints. If library compatibility is poor, isolate parser behind a provider interface and keep browser pdf.js as the immediate text-based PDF fast path.
- **Cache poisoning risk:** Low-quality OCR text must not be written into `resumes.extracted_text`, `profiles.linkedin_pdf_content`, or cache inputs.
- **Identity mismatch risk:** Current `text_hash` hashes extracted text, while Phase 51 reuse requires a document identity hash. Do not confuse content hash with document hash.
- **Legacy tier ambiguity risk:** Phase 48 normalized visible Pro behavior in some places, but Phase 51 explicitly says legacy/active/admin Pro must not count as Elite for Claude OCR.
- **Caller drift risk:** Many UI and backend callsites can initiate extraction. Missing one may preserve old Phase 50 behavior.
- **Metadata overexposure risk:** Debuggability should not become persistence of raw provider payloads or sensitive document contents.

## Open Questions

1. Should Phase 51 add a dedicated `document_extractions` table keyed by `user_id + document_hash + document_type + extraction_version`, or keep reuse fields embedded on `resumes` and `profiles`?
2. What exact `extraction_version` string should launch Phase 51 use, and who owns incrementing it when thresholds/provider normalization changes?
3. Should the provider label `pdfjs` be retained for client-side parser success, or normalized to `pdf_parser` everywhere with a migration/compatibility layer for existing metadata?
4. Are Mistral and Textract intended for immediate implementation in Phase 51, or should the provider interface and tests be added now with disabled/unconfigured providers until secrets are supplied?
5. For LinkedIn PDF reuse, should the document hash be persisted as a first-class `profiles.linkedin_pdf_document_hash` column or only inside `linkedin_pdf_extraction_metadata`?
6. Should DOCX extraction remain untouched, or should the planner include a narrow guard to ensure the new failure UX mentions DOCX without changing DOCX parsing behavior?
7. Which focused test command should be canonical for this phase: Deno tests under `supabase/functions/_shared` plus Vitest source-contract tests under `src/pages/__tests__`, or a smaller targeted subset?

## Recommended Planning Shape

1. Shared contracts and metadata schema, including provider labels, extraction version, policy object, and quality-gate updates.
2. Backend orchestrator and provider chain with parser-first behavior, cheap provider config skips, and Elite-only Claude fallback.
3. Persistence/reuse layer for accepted text keyed by user-scoped document identity.
4. Frontend/backend caller alignment for Resume Upload, LinkedIn Grader, Onboarding, Career Compass, Profile, and secondary upload surfaces.
5. Focused tests and documentation for extraction order, tier policy, metadata, failure UX, and no-sensitive-content logging.

## Verification Notes For Planner

- Do not rely on repo-wide lint as the only gate; this repo has known unrelated lint/type debt in prior phase notes.
- Prefer focused tests around:
  - `supabase/functions/_shared/document-extraction*.test.ts`
  - `supabase/functions/_shared/document-quality.test.ts`
  - `supabase/functions/_shared/document-persistence.test.ts`
  - `supabase/functions/ocr-pdf` tests if added
  - `src/pages/__tests__/document-extraction-primary.test.ts`
  - `src/pages/__tests__/document-extraction-secondary.test.ts`
- Manual QA should include one text-based PDF, one scanned/image-only PDF as Free, one scanned/image-only PDF as Elite, and one cached/reused accepted document.


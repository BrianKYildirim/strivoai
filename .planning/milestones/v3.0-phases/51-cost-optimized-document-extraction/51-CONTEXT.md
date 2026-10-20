# Phase 51: Cost-optimized document extraction - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement a production-grade document extraction pipeline for Resume and LinkedIn PDF flows that reduces OCR spend without sacrificing paid-user reliability. The phase replaces Phase 50's Ollama-centered extraction plan with parser-first extraction, configurable cheap OCR providers, tier-gated Claude OCR fallback for Elite only, deterministic quality gates, accepted-text reuse by content hash, and concise provider metadata.

This phase is limited to document text extraction, provider routing, accepted-text persistence, quality validation, and extraction metadata. It does not change pricing, merits, subscriptions, downstream analysis prompts, structured resume/LinkedIn parsing, or unrelated cache/history behavior except where extraction text/hash reuse is required.

</domain>

<decisions>
## Implementation Decisions

### OCR provider policy

- **D-01:** Use a configured-only provider interface. The extraction chain is: real PDF embedded-text parser first, then enabled cheap OCR providers in this order: Ollama, Mistral, Textract. Providers without required env/config are skipped without user-visible failure.
- **D-02:** Claude OCR is not part of the cheap OCR chain. It is a final reliability fallback only when the caller's tier policy permits it.
- **D-03:** Every external provider must have explicit timeout/error handling and must continue to the next allowed provider when unavailable, slow, or quality-rejected.

### Tier policy

- **D-04:** Only literal Elite gets Claude OCR fallback. Legacy Pro, active Pro, and trial/admin Pro users follow the non-Elite OCR policy unless the system has an explicit Elite tier state.
- **D-05:** Free and non-Elite users must never call Claude OCR for scanned/image-only PDFs. If parser and allowed cheap OCR providers fail quality validation, return a controlled extraction failure.
- **D-06:** Elite users may call Claude OCR only after the parser and all configured cheap OCR providers fail quality validation or are unavailable.

### Cache and reuse identity

- **D-07:** Accepted extracted text reuse is keyed by `user_id + document_hash + document_type + extraction_version`.
- **D-08:** The key is user-scoped, not global. A user can reuse the same accepted text across Resume Analysis, LinkedIn Grader, Career Compass, and future feature flows when the document type and extraction version match.
- **D-09:** Do not rerun OCR when accepted text already exists for the same user-scoped document hash and extraction version. Reuse the accepted text and metadata instead.

### Quality gate

- **D-10:** Use a generic, permissive document-likeness gate. It should check meaningful text length, word count, printable ratio, low garbage/noise ratio, repetition, and document-likeness.
- **D-11:** Avoid strict resume-only or LinkedIn-only keyword requirements that would reject valid resumes, nontraditional profiles, or international formats.
- **D-12:** Low-quality OCR text must not be accepted into cache/history/extracted-text fields. It should record a concise failure reason and continue to the next allowed provider.

### Failure UX

- **D-13:** Free/non-Elite scanned-PDF failure should say the file could not be read reliably and ask the user for a text-based PDF, DOCX, or pasted text.
- **D-14:** Do not expose provider names, provider order, or internal failure details to normal users. Provider path and reasons belong in logs/metadata for support debugging.
- **D-15:** Do not quietly run downstream analysis on weak or partial extraction text that failed quality validation.

### Phase 50 normalization

- **D-16:** Remove or disable Phase 50 behavior where it makes Ollama the primary fallback architecture.
- **D-17:** Keep Ollama only as an optional cheap OCR provider behind the new provider interface, after parser success has failed and before any Elite-only Claude fallback.
- **D-18:** Phase 50 is historical context only. Downstream agents should not treat its Ollama-first or Claude-for-all-fallback assumptions as current.

### Persistence and audit metadata

- **D-19:** Persist accepted raw text plus concise metadata on the owning record where practical.
- **D-20:** Resume extraction fields live on `resumes`, including accepted extracted text, text hash, document hash/source identity where needed, extraction version, and provider metadata.
- **D-21:** LinkedIn extraction metadata/hash should live alongside `profiles.linkedin_pdf_content` and related profile LinkedIn PDF/source fields when practical.
- **D-22:** Do not persist raw failed OCR output, provider transcripts, prompts, screenshots, page images, secrets, or sensitive provider debug payloads.
- **D-23:** Metadata should record provider used, attempted providers, fallback path, extraction version, confidence/quality status when available, and concise failure reason when extraction fails.

### the agent's Discretion

- Exact provider interface names, file layout, metadata JSON shape, timeout values, and quality thresholds are left to research/planning, provided they satisfy the locked provider order, tier policy, quality-gate, and persistence decisions above.
- Planner may choose the exact Deno/Supabase-compatible embedded PDF parser after research, but parser-first behavior is locked.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase source of truth

- `.planning/ROADMAP.md` - Phase 51 goal, success criteria, implementation guidance, dependency on Phase 49, and replacement of Phase 50.
- `.planning/STATE.md` - current project state and roadmap evolution noting Phase 51 replaces obsolete Phase 50.
- `.planning/PROJECT.md` - project constraints, reliability priorities, stack, tier/cost discipline, and current milestone context.
- `.planning/REQUIREMENTS.md` - cache, accepted text, cross-feature context, testing, NFR, and analysis persistence requirements that Phase 51 must preserve.

### Prior phase context

- `.planning/phases/50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf/50-CONTEXT.md` - historical extraction metadata and accepted-text ideas; superseded where it conflicts with Phase 51 decisions.
- `.planning/phases/42-database-foundation-users-career-targets/42-CONTEXT.md` - structured parsing/versioning boundary; do not turn extraction into structured resume/LinkedIn parsing.
- `.planning/phases/47-interview-prep-prod-gate-elite-differentiation/47-CONTEXT.md` - Interview Prep remains production-gated but code still exists; extraction changes must not depend on Interview Prep being production-visible.

### Codebase maps

- `.planning/codebase/STACK.md` - Deno/Supabase Edge Function runtime, Vite/React frontend, pdfjs dependency, Supabase config, and environment variable patterns.
- `.planning/codebase/ARCHITECTURE.md` - current OCR/PDF normalization paths, resume/linkedin persistence surfaces, cache gaps, and feature analysis entry points.
- `.planning/codebase/INTEGRATIONS.md` - external provider configuration patterns, Supabase secrets, Anthropic integration, and runtime/deployment constraints.

### Primary implementation touchpoints

- `src/lib/extract-pdf-text.ts` - current frontend PDF extraction wrapper using pdfjs.
- `src/lib/pdf-extractor.worker.ts` - current client PDF text extraction worker.
- `src/pages/Upload.tsx` - resume upload flow that currently performs client extraction and falls back to OCR.
- `src/pages/Onboarding.tsx` - existing LinkedIn PDF extraction write to `profiles.linkedin_pdf_content`.
- `src/pages/LinkedInGrader.tsx` - LinkedIn profile/PDF source handling and grader submission flow.
- `src/pages/CareerCompass.tsx` - existing saved Resume/LinkedIn prior usage and LinkedIn PDF auto-pull behavior.
- `supabase/functions/ocr-pdf/index.ts` - existing Claude OCR fallback behavior to be tier-gated or wrapped by the new extraction policy.
- `supabase/functions/analyze-resume/index.ts` - resume analysis consumer of extracted resume text.
- `supabase/functions/analyze-career/index.ts` - Career Compass backend path that may read stored resume/LinkedIn content.
- `supabase/functions/interview-prep-analyze/index.ts` - stored-resume extraction caller; preserve staging/runtime correctness even while production UI is gated.
- `supabase/functions/_shared/cache-fingerprint.ts` - canonical hashing helper precedent for text/document hash work.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/lib/extract-pdf-text.ts` and `src/lib/pdf-extractor.worker.ts`: existing pdfjs-based frontend PDF text extraction surface.
- `supabase/functions/ocr-pdf/index.ts`: existing Claude OCR edge function; should become a tier-gated final fallback or wrapper rather than an unconditional fallback.
- `profiles.linkedin_pdf_content` and related profile LinkedIn PDF/source fields: existing accepted LinkedIn text storage surface.
- `resumes.file_hash`: existing document-byte hash surface from upload dedup; Phase 51 needs accepted extraction reuse keyed by user/document/document-type/extraction-version.
- `_shared` edge utilities such as auth, CORS, logger, and cache fingerprint helpers: existing pattern for authenticated provider calls, concise logs, and hashing.

### Established Patterns

- The project favors Supabase Edge Functions and existing shared utilities over new infrastructure.
- Backend secrets must be configured per target environment; frontend bodies must not supply provider URLs or provider credentials.
- User-facing provider/cache/source details are normally hidden. Operational details belong in logs and concise metadata.
- Accepted text can be reused across features only after quality validation. Failed or low-quality extraction should not poison cache/history.
- Cache and history behavior is user-scoped; cross-user document text sharing is out of scope.

### Integration Points

- Resume Analysis must continue to work for text-based PDFs, scanned PDFs, cached accepted text, and DOCX/pasted text fallback UX.
- LinkedIn Grader must preserve onboarding LinkedIn text behavior and replacement semantics while adding metadata/hash handling.
- Career Compass and future analyses should use saved latest Resume/LinkedIn analysis results and accepted text/profile data without forcing re-extraction when valid saved content exists.
- Provider routing must be deterministic and auditable: parser, configured cheap providers, optional Elite-only Claude OCR, then controlled failure.
- Planner should verify every extraction caller passes an explicit tier/policy, document type, user id, document hash, and extraction version context.

</code_context>

<specifics>
## Specific Ideas

- Stable provider labels should be simple values such as `pdf_parser`, `ollama`, `mistral`, `textract`, and `claude_ocr`.
- Stable failure reasons should include values such as `pdf_parser_no_text`, `ollama_unavailable`, `ocr_quality_rejected`, `free_tier_claude_ocr_blocked`, and `claude_ocr_failed`.
- The extraction version should change whenever parser/provider normalization or quality thresholds change enough to invalidate prior accepted text.
- Failure copy for Free/non-Elite scanned PDFs should be operational but not provider-specific: ask for a text-based PDF, DOCX, or pasted text.

</specifics>

<deferred>
## Deferred Ideas

- Global/cross-user document extraction cache. Phase 51 keeps reuse user-scoped.
- Structured resume/LinkedIn section parsing from extraction output. This belongs to Phase 42 structured versioning or a later parsing phase.
- User-facing provider labels, detailed OCR traces, or support dashboards. Phase 51 persists concise metadata only.
- Broad historical backfill of all legacy documents. Phase 51 should populate accepted text opportunistically when a user touches the relevant document/source unless planning proves a limited migration is required.

</deferred>

---

*Phase: 51-cost-optimized-document-extraction*
*Context gathered: 2026-06-07*

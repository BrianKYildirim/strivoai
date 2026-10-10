# Phase 50: ollama-document-extraction-layer-for-resume-and-linkedin-pdf - Context

**Gathered:** 2026-06-05T03:27:34.1731538-07:00
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a shared Ollama-backed PDF document extraction layer for Resume and LinkedIn PDFs. The layer preserves the existing client/pdfjs extraction path first, adds Ollama as a production-capable but best-effort OCR/extraction step, and keeps the existing Claude `ocr-pdf` path as the final reliability fallback. It returns accepted raw text plus operational metadata, writes accepted text into existing canonical storage fields, and avoids structured parsing or broad historical backfills.

This phase is an extraction reliability and cost-control layer. It is not a resume/LinkedIn structured parsing phase, not a cache redesign, and not a user-facing feature expansion.

</domain>

<decisions>
## Implementation Decisions

### Extraction chain

- **D-01:** Preserve the current client-side `pdfjs` path as the first extraction attempt for upload flows.
- **D-02:** Add Ollama after `pdfjs` and before Claude OCR. The effective chain is `pdfjs` -> `ollama` -> existing Claude `ocr-pdf` fallback.
- **D-03:** Claude `ocr-pdf` remains the final fallback when Ollama is missing, unhealthy, slow, fails, or returns poor-quality text.
- **D-04:** Reject poor Ollama output with deterministic text-quality heuristics, not a Claude validation call. Quality gates should include a length floor, low symbol/noise ratio, no extreme repetition, and expected document signals for the declared document type.
- **D-05:** Resume and LinkedIn PDFs use one shared extraction layer with document-type-specific prompts and quality gates. Do not build two independent extraction systems.
- **D-06:** The shared extraction layer must be callable by both frontend upload flows and backend functions that re-read stored PDFs.

### Output contract

- **D-07:** The extraction layer returns accepted raw text plus metadata. Required metadata: provider used, attempted providers, quality status, document type, text hash, extraction timestamp, and concise fallback/failure reason when applicable.
- **D-08:** The canonical output hash is SHA-256 over canonicalized accepted extracted text, aligned with existing `resumes.text_hash` and `_shared/cache-fingerprint.ts` expectations.
- **D-09:** Persist only minimal operational metadata. Do not persist Ollama prompts, full provider transcripts, verbose model logs, or other large debugging payloads in user data.
- **D-10:** Phase 50 does not expose or persist structured sections. Structured resume/LinkedIn parsing stays with Phase 42 structured versioning or a later dedicated phase.
- **D-11:** Provider metadata is not exposed by default in normal UI. Users see existing upload/extraction states unless a specific extraction error must explain the failure operationally.

### Runtime boundary

- **D-12:** Production Supabase Edge Functions may call a configured Ollama host. This is an explicit Phase 50 exception to the project-level "no new infrastructure" constraint and must be treated as a production runtime dependency by planners.
- **D-13:** Ollama runtime configuration comes from Supabase secrets with explicit per-environment values, such as `OLLAMA_BASE_URL` and an auth secret/header. No hardcoded URL and no frontend-provided host.
- **D-14:** If `OLLAMA_BASE_URL` is missing, skip Ollama and continue to the existing Claude OCR fallback. Missing config should be logged as an operational condition, not shown to users as a failure.
- **D-15:** Ollama is best-effort for cost/latency reduction, not a required service for user reliability.
- **D-16:** The Ollama attempt should use a long but bounded timeout target, roughly 30-60 seconds, to maximize the chance of avoiding Claude OCR. It must still fall back rather than stall indefinitely.

### Failure and persistence

- **D-17:** Accepted text persists into existing canonical fields. Resume extraction writes `resumes.extracted_text` and `resumes.text_hash`. LinkedIn extraction writes through the existing LinkedIn PDF/source path, primarily `profiles.linkedin_pdf_content` for onboarding or replacement-style sources.
- **D-18:** If Claude OCR succeeds after `pdfjs` and Ollama fail, persist Claude OCR as the accepted text with provider/fallback metadata.
- **D-19:** If all extraction paths fail, return a specific operational error and persist nothing. Do not put empty, low-quality, or file-metadata-only content into cache/history paths.
- **D-20:** Store concise per-run extraction metadata for support debugging: provider used, attempted providers, quality status, fallback reason, and timestamp.
- **D-21:** Do not run a broad historical backfill in Phase 50. Legacy rows with missing text/hash/metadata are populated opportunistically on next upload, analysis, or LinkedIn source replacement.

### the agent's Discretion

- Exact helper names and file layout for the shared extraction layer.
- Exact quality-gate thresholds, as long as they are deterministic and document-type-aware.
- Exact Ollama model name and request shape, subject to research and current Ollama API behavior.
- Exact metadata column names or JSON shape, as long as the persisted metadata stays concise and avoids prompt/transcript storage.
- Exact timeout inside the 30-60 second target range, with a hard upper bound.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase source of truth

- `.planning/ROADMAP.md` - Phase 50 entry and dependency on Phase 49.
- `.planning/PROJECT.md` - project constraints, stack, reliability priorities, and current milestone context.
- `.planning/REQUIREMENTS.md` - existing cache, LinkedIn source, resume text, and non-functional requirements that Phase 50 must preserve.
- `.planning/STATE.md` - current phase queue and roadmap evolution noting Phase 50.

### Carry-forward phase context

- `.planning/phases/29-foundation-infrastructure/29-CONTEXT.md` - `analysis_cache`, `_shared/cache-fingerprint.ts`, `resumes.extracted_text/text_hash`, `ocr-pdf` population contract, cache write timing, and NFRs.
- `.planning/phases/35-cross-feature-input-context-selectors-linkedin-auto-pull/35-CONTEXT.md` - `profiles.linkedin_pdf_content`, LinkedIn PDF replacement timing, LinkedIn source precedence, and no "loaded from prior" user-facing badge pattern.
- `.planning/phases/37-feature-output-parity-ux-cache-resume-linkedin-career-compas/37-CONTEXT.md` - cache-after-correctness sequencing, per-feature cache wiring, and no prominent cache/provider badge in normal UI.
- `.planning/phases/42-database-foundation-users-career-targets/42-CONTEXT.md` - structured versioning boundary; useful to avoid duplicating structured parsing in Phase 50.

### Codebase maps

- `.planning/codebase/STACK.md` - Vite/React frontend, Supabase Edge Functions, Deno runtime, pdfjs, and Supabase deployment stack.
- `.planning/codebase/ARCHITECTURE.md` - current OCR/PDF normalization paths, persistence map, cache gaps, and feature analyze entry points.
- `.planning/codebase/INTEGRATIONS.md` - external service configuration patterns, Supabase secrets, and deployment/runtime integration concerns.

### Primary implementation touchpoints

- `src/lib/extract-pdf-text.ts` - current frontend PDF extraction wrapper using a singleton worker.
- `src/lib/pdf-extractor.worker.ts` - current `pdfjs-dist` worker extraction implementation.
- `supabase/functions/ocr-pdf/index.ts` - existing Claude OCR fallback and current `resumes.extracted_text/text_hash` write behavior.
- `supabase/functions/_shared/cache-fingerprint.ts` - `sha256Hex` and canonical cache-key helper; use as the single source for text hashing behavior.
- `src/pages/Upload.tsx` - resume upload flow that currently uses `extractPDFText` and invokes `ocr-pdf` fallback.
- `src/pages/LinkedInGrader.tsx` - LinkedIn PDF/paste flow and profile source replacement path.
- `src/pages/Onboarding.tsx` - existing LinkedIn PDF extraction write to `profiles.linkedin_pdf_content`.
- `src/pages/CareerCompass.tsx` - existing LinkedIn PDF content read/write patterns and resume extraction callers.
- `supabase/functions/analyze-resume/index.ts` - resume analysis path consuming extracted resume text.
- `supabase/functions/analyze-career/index.ts` - backend resume/LinkedIn extraction/re-read path.
- `supabase/functions/interview-prep-analyze/index.ts` - backend stored-resume re-extraction path; production IP remains gated by prior phase but staging/runtime code still exists.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/lib/extract-pdf-text.ts` and `src/lib/pdf-extractor.worker.ts`: current `pdfjs` text extraction path; Phase 50 should wrap or reuse this rather than replacing it.
- `supabase/functions/ocr-pdf/index.ts`: existing authenticated/rate-limited Claude OCR fallback with per-page extraction and `resumes` persistence.
- `supabase/functions/_shared/cache-fingerprint.ts`: exports `sha256Hex`; aligns with the accepted-text `text_hash` decision.
- `getServiceClient()` and `requireAuth()` in Supabase shared helpers: existing pattern for authenticated edge handlers and RLS-bypassing writes.
- `profiles.linkedin_pdf_content`, `profiles.linkedin_pdf_filename`, and `profiles.linkedin_pdf_updated_at`: existing LinkedIn source storage surface; Phase 50 should not invent a replacement table for accepted LinkedIn text.
- `resumes.extracted_text` and `resumes.text_hash`: existing resume text storage surface from Phase 29.

### Established Patterns

- Extraction is currently opportunistic: client `pdfjs` first, then `ocr-pdf` fallback. Phase 50 inserts Ollama into this chain.
- Cache and history should use accepted, canonicalized extracted text. File-byte hashes are not sufficient for OCR-equivalent documents.
- Post-response or non-critical persistence failures should be logged and swallowed where user output has already succeeded; failed extraction itself should return a specific operational error.
- Provider/cache/source details are normally invisible to users; operational metadata supports debugging and support, not primary UI.
- Existing project config expects per-environment secrets for backend runtime dependencies. Frontend request bodies must not provide provider URLs.

### Integration Points

- Shared extraction API must support both `File`/browser upload inputs and backend/stored PDF extraction callers.
- `ocr-pdf` can either be refactored into the final fallback in the new shared layer or become a wrapper around it. Planner should preserve its auth, CORS, rate-limit, and text persistence behavior.
- Resume accepted text writes to `resumes.extracted_text/text_hash` and should filter by `user_id` when writing by `resumeId`, matching the current `ocr-pdf` safety guard.
- LinkedIn accepted text writes to the existing `profiles.linkedin_pdf_*` replacement path only when the corresponding source is accepted; do not overwrite profile source on failed extraction or failed downstream analyze when Phase 35 timing applies.
- Ollama Edge Function calls need explicit timeout, health/error handling, provider metadata, and fallback to Claude when unhealthy or unconfigured.

</code_context>

<specifics>
## Specific Ideas

- The provider field should use stable values such as `pdfjs`, `ollama`, and `claude_ocr`.
- `attempted_providers` should preserve the attempted chain for support debugging without storing verbose logs.
- Quality gates should be document-type aware: resume signals differ from LinkedIn profile signals.
- Production Ollama config should be environment-specific and explicit: staging and production can point at different hosts or omit the host to fall back.
- The timeout target is deliberately longer than the conservative default: roughly 30-60 seconds, but never unbounded.

</specifics>

<deferred>
## Deferred Ideas

- Structured resume/LinkedIn sections from extraction output. Deferred to Phase 42 structured versioning or a later dedicated structured parsing phase.
- Broad historical backfill of legacy resume/LinkedIn extracted text and metadata. Deferred unless a later phase needs cost/quality migration at scale.
- User-facing provider/source labels for normal uploads. Deferred unless support or trust issues show users need this visible.
- Detailed extraction attempts audit table with timings/errors per provider. Deferred; Phase 50 uses concise metadata only.

</deferred>

---

*Phase: 50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf*
*Context gathered: 2026-06-05T03:27:34.1731538-07:00*

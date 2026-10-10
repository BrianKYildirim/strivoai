# Phase 50: Ollama Document Extraction Layer for Resume and LinkedIn PDFs - Research

**Researched:** 2026-06-05
**Domain:** Supabase Edge Function document extraction, Ollama vision API, PDF text normalization, extraction persistence
**Confidence:** HIGH for current code contracts and Supabase/Ollama API shape; MEDIUM for exact Ollama model choice because production hardware/host capacity is not specified.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Claude's Discretion
- Exact helper names and file layout for the shared extraction layer.
- Exact quality-gate thresholds, as long as they are deterministic and document-type-aware.
- Exact Ollama model name and request shape, subject to research and current Ollama API behavior.
- Exact metadata column names or JSON shape, as long as the persisted metadata stays concise and avoids prompt/transcript storage.
- Exact timeout inside the 30-60 second target range, with a hard upper bound.

### Deferred Ideas (OUT OF SCOPE)
## Deferred Ideas

- Structured resume/LinkedIn sections from extraction output. Deferred to Phase 42 structured versioning or a later dedicated structured parsing phase.
- Broad historical backfill of legacy resume/LinkedIn extracted text and metadata. Deferred unless a later phase needs cost/quality migration at scale.
- User-facing provider/source labels for normal uploads. Deferred unless support or trust issues show users need this visible.
- Detailed extraction attempts audit table with timings/errors per provider. Deferred; Phase 50 uses concise metadata only.
</user_constraints>

## Summary

Phase 50 should be planned as a shared extraction orchestration layer, not as a replacement for the existing browser PDF parser or Claude OCR function. The current upload flows already have the right first step: browser-side `pdfjs-dist` via `src/lib/extract-pdf-text.ts` and `src/lib/pdf-extractor.worker.ts`. The current final fallback is split: `src/pages/Upload.tsx` renders PDF pages to PNG data URLs and invokes `ocr-pdf`; backend stored-PDF paths use `supabase/functions/_shared/pdf-parser.ts`, which tries crude PDF text extraction and then sends the raw PDF to Claude as a document block. Phase 50 inserts Ollama between those paths and Claude where image input is available, while preserving Claude as the reliability endpoint.

The key current-source finding: official Ollama vision accepts image inputs, not PDFs. The REST API expects base64-encoded image data in `images`; `/api/chat` and `/api/generate` stream by default, so this phase should use `stream:false` for simple JSON responses. That means browser upload flows can render page images and call an Edge Function that attempts Ollama, but backend functions re-reading stored PDFs cannot use the official Ollama API for scanned PDF OCR unless they already have page images or the production Ollama host exposes a separate PDF-to-image wrapper. Supabase Edge Functions are a bad place to add heavy PDF rasterization because hosted limits include 256 MB memory, tight CPU time, no Web Worker API, and no Node libraries requiring multithreading such as `sharp`.

**Primary recommendation:** create one shared extraction contract with provider sequence `pdfjs` -> `ollama` -> `claude_ocr`, use Ollama only through a server-side client configured by Supabase secrets, keep image rendering in browser/upload code or host-side infrastructure, and persist accepted text plus concise metadata only after deterministic quality gates pass.

## Standard Stack

### Core

| Library / API | Version / Source | Purpose | Why Standard |
|---|---:|---|---|
| `pdfjs-dist` | `5.4.394` in `package.json` | Browser PDF text extraction and page rendering | Already in repo; Vite worker wrapper exists; satisfies D-01 without new dependencies. |
| Supabase Edge Functions | Deno runtime | Server-side extraction orchestration, auth, CORS, persistence, Ollama/Claude calls | Existing backend runtime; `ocr-pdf`, `analyze-career`, and `interview-prep-analyze` already run here. |
| Ollama HTTP API | Current docs checked 2026-06-05 | Best-effort vision OCR/extraction | Official `/api/chat` supports messages with base64 images; `/api/tags` and `/api/ps` support health/model probes. |
| Anthropic direct fetch wrapper | Existing `_shared/anthropic.ts` | Final Claude OCR fallback | Already integrated, fixture-capable, timeout-capable, and used by `ocr-pdf` / `_shared/pdf-parser.ts`. |
| `_shared/cache-fingerprint.ts` | Current repo | `sha256Hex` and cache-key behavior | Existing source of truth for SHA-256 hashes; Phase 50 should add a canonical extracted-text normalizer around it, not another hashing helper. |

### Supporting

| Component | Purpose | When to Use |
|---|---|---|
| `requireAuth` / `requireInternalOrUserAuth` | Enforce user/internal identity and server-side tier | Any public extraction endpoint or backend re-read path. |
| `corsHeaders` / `handleOptionsRequest` | Preserve user endpoint CORS behavior | Any function callable from frontend. |
| `checkRateLimit` | Keep OCR/extraction abuse bounded | Reuse the `ocr-pdf` tier limits or add an extraction-specific key. |
| `getServiceClient()` | Service-role persistence to `resumes` / `profiles` | Accepted extraction writes only, with `user_id` filters. |
| `AbortController` | Bounded Ollama fetch timeout | Every Ollama request; target 35-45 seconds to leave room for Claude fallback. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Existing `ocr-pdf` endpoint as wrapper | New `extract-document` Edge Function | New endpoint is cleaner, but keeping `ocr-pdf` as a compatibility wrapper avoids breaking `Upload.tsx` and existing tests. Planner can add shared internals while preserving the public function name. |
| Ollama `/api/chat` | Ollama `/api/generate` | Both support image input. `/api/chat` matches vision examples and document-type messages; use it unless the host's chosen model performs materially better with `/api/generate`. |
| `gemma3` | `qwen2.5vl` | `gemma3` is official-docs default and has smaller vision variants; `qwen2.5vl` is stronger for document understanding but requires more VRAM and Ollama 0.7.0+. Make model env-configurable. |
| Edge-side PDF rasterization | Browser rendering or host-side wrapper | Edge-side rendering risks memory/CPU/runtime limits and dependency bloat. Browser rendering already exists; host-side wrapper is the only sane way to support stored scanned PDFs with Ollama. |

**Installation:** no npm install should be required for the core phase. Reuse `pdfjs-dist`, Supabase/Deno APIs, and direct HTTP `fetch`.

## Architecture Patterns

### Recommended Project Structure

```text
src/lib/
  document-extraction.ts          # Browser facade: pdfjs first, render images, invoke edge fallback
  extract-pdf-text.ts             # Existing worker-backed pdfjs text path; keep

supabase/functions/_shared/
  document-extraction.ts          # Shared provider orchestration + result contract
  document-quality.ts             # Deterministic gates and canonicalizeExtractedText()
  ollama-client.ts                # Config, health, timeout, auth header, /api/chat call
  pdf-parser.ts                   # Existing backend text + Claude fallback; refactor carefully

supabase/functions/ocr-pdf/
  index.ts                        # Public wrapper for image-based fallback; preserve auth/CORS/rate limit

supabase/migrations/
  <timestamp>_phase50_extraction_metadata.sql
```

### Pattern 1: One Extraction Result Contract

**What:** every provider returns either accepted text or a rejection reason; the top-level layer returns raw accepted text plus concise metadata.

**When to use:** all resume and LinkedIn PDF extraction paths, frontend and backend.

```ts
export type DocumentType = 'resume' | 'linkedin_profile';
export type ExtractionProvider = 'pdfjs' | 'ollama' | 'claude_ocr';

export interface ExtractionMetadata {
  provider: ExtractionProvider;
  attemptedProviders: ExtractionProvider[];
  qualityStatus: 'accepted' | 'rejected' | 'failed';
  documentType: DocumentType;
  textHash: string;
  extractedAt: string;
  fallbackReason?: string;
}

export interface ExtractionResult {
  ok: true;
  text: string;
  metadata: ExtractionMetadata;
} | {
  ok: false;
  attemptedProviders: ExtractionProvider[];
  documentType: DocumentType;
  reason: string;
};
```

**Planning note:** use stable provider values `pdfjs`, `ollama`, and `claude_ocr` exactly. Keep metadata field names stable because tests and support tooling will read them.

### Pattern 2: Browser First, Edge Fallback

**What:** frontend flows call a single browser helper. It tries `extractPDFText(file)`, runs quality gates, then renders images and invokes an Edge Function for Ollama/Claude fallback.

**When to use:** `Upload.tsx`, `LinkedInGrader.tsx`, `Onboarding.tsx`, `CareerCompass.tsx`, `Profile.tsx`, and `RecruitingLens.tsx` where LinkedIn PDF upload exists.

```ts
const first = await extractPDFText(file);
const accepted = await assessExtractionQuality({
  text: first,
  documentType,
  provider: 'pdfjs',
});
if (accepted.ok) return acceptedResult(first, 'pdfjs');

const images = await renderPdfPagesToImages(file, { maxPages, maxWidth: 1400 });
return await invokeDocumentExtractionFallback({
  documentType,
  images,
  resumeId,
  sourceFilename: file.name,
});
```

**Critical guard:** do not let the frontend provide `OLLAMA_BASE_URL`, model, auth header, or provider order. It can provide document type, images, and the persistence target id/source metadata.

### Pattern 3: Ollama Client as Best-Effort Fetch

**What:** the Edge helper reads Supabase secrets, adds the configured auth header, calls `/api/chat` with `stream:false`, and returns a rejected-provider result on timeout, non-2xx, missing response, or failed quality gate.

```ts
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
try {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeaderName && authSecret ? { [authHeaderName]: authSecret } : {}),
    },
    signal: controller.signal,
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: prompt,
        images,
      }],
      stream: false,
      options: { temperature: 0 },
    }),
  });
  // response.message.content is the expected /api/chat text output.
} finally {
  clearTimeout(timeoutId);
}
```

**Config recommendation:** read `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT_MS`, `OLLAMA_AUTH_HEADER_NAME`, and `OLLAMA_AUTH_SECRET`. Default timeout should be 35 seconds unless the planner has staging data showing 45 seconds materially improves success while preserving end-to-end fallback latency.

### Pattern 4: Deterministic Quality Gates

**What:** use cheap text heuristics before accepting any provider, including `pdfjs` and Claude. Ollama-specific rejection must not call Claude for validation; Claude is only the next provider.

```ts
export function assessExtractionQuality(text: string, documentType: DocumentType): QualityResult {
  const canonical = canonicalizeExtractedText(text);
  const words = canonical.match(/\b[\p{L}\p{N}][\p{L}\p{N}.'-]{1,}\b/gu) ?? [];
  const symbolRatio = (canonical.match(/[^\p{L}\p{N}\s.,;:'"@()&/+-]/gu) ?? []).length / Math.max(1, canonical.length);
  const repetitionRatio = highestRepeatedLineRatio(canonical);
  const signals = documentType === 'resume'
    ? countMatches(canonical, [/education/i, /experience/i, /skills?/i, /projects?/i, /university|college|degree/i, /@|linkedin\.com/i])
    : countMatches(canonical, [/linkedin/i, /about/i, /experience/i, /education/i, /skills?/i, /headline|summary/i]);

  if (words.length < (documentType === 'resume' ? 80 : 120)) return reject('too_short');
  if (symbolRatio > 0.22) return reject('too_noisy');
  if (repetitionRatio > 0.35) return reject('repetitive');
  if (signals < 2) return reject('missing_document_signals');
  return { ok: true, canonicalText: canonical };
}
```

**Threshold recommendation:** start conservative and tune from QA: resume floor 80 words / 400 chars, LinkedIn floor 120 words / 700 chars, symbol ratio max 0.22, repeated-line max 0.35, at least 2 document signals. These are planning defaults, not product claims.

### Pattern 5: Persistence After Acceptance Only

**What:** persist accepted text and metadata in one place after quality gates pass. Never write empty or rejected text. Include `user_id` filters.

**Resume target:**
- Existing: `resumes.extracted_text`, `resumes.text_hash`.
- Add: `resumes.extraction_metadata jsonb NULL`.
- Update via `.eq('id', resumeId).eq('user_id', userId)`.

**LinkedIn target:**
- Existing: `profiles.linkedin_pdf_content`, `profiles.linkedin_pdf_filename`, `profiles.linkedin_pdf_updated_at`.
- Add recommended: `profiles.linkedin_pdf_text_hash text NULL` and `profiles.linkedin_pdf_extraction_metadata jsonb NULL`.
- Update only for onboarding/replacement sources and only after the corresponding source is accepted. Preserve Phase 35's LinkedInGrader pattern: replacement PDF is persisted after successful `grade-linkedin`, not at raw extraction time, where that timing is already load-bearing.

**Metadata JSON shape:**

```json
{
  "provider": "ollama",
  "attempted_providers": ["pdfjs", "ollama"],
  "quality_status": "accepted",
  "document_type": "resume",
  "text_hash": "<sha256>",
  "extracted_at": "2026-06-05T00:00:00.000Z",
  "fallback_reason": "pdfjs_too_short"
}
```

Do not store prompts, full raw Ollama response, page images, token stats, model logs, or provider transcripts in user rows.

## Backend Stored-PDF Constraint

Official Ollama vision input is base64 images. The current backend stored-PDF paths (`analyze-career` and `interview-prep-analyze`) download PDFs from Supabase Storage and call `_shared/pdf-parser.ts`; that parser can do crude text extraction and Claude document OCR, but it does not rasterize pages to images.

Planner must explicitly choose one of these safe interpretations for D-06:

1. **Recommended for Phase 50:** backend shared layer is callable, but only attempts Ollama when caller supplies page images or when existing `resumes.extracted_text` / `profiles.linkedin_pdf_content` is available and passes quality. For stored scanned PDFs with no images, skip Ollama with metadata reason `ollama_skipped_no_images` and fall back to Claude OCR.
2. **If true backend Ollama OCR is required:** the production Ollama host must expose a small authenticated wrapper endpoint that accepts a PDF or storage reference, rasterizes it host-side, and calls Ollama. That wrapper is outside official Ollama's `/api/chat` surface and must be treated as part of the Phase 50 production runtime dependency.

Do not plan Edge-side rasterization with `sharp`, Node canvas, or worker-based pdfjs. Supabase hosted limits and runtime restrictions make that the wrong place for it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Browser PDF text extraction | New PDF parser | Existing `extractPDFText` / `pdfjs-dist` worker | Already works and keeps CPU off the main UI thread via Web Worker. |
| Edge PDF rasterization | Custom PDF/image renderer in Deno Edge | Browser-rendered images or host-side wrapper | Edge limits: 256 MB memory, tight CPU time, no Web Worker, no multithreaded Node libs. |
| Hashing | New crypto helper | `_shared/cache-fingerprint.ts` `sha256Hex` plus new `canonicalizeExtractedText` | Avoid hash drift against Phase 29/37 cache contracts. |
| Provider validation | Claude validation call | Deterministic quality gates | D-04 explicitly forbids Claude validation for Ollama output quality. |
| Structured parsing | Resume/LinkedIn section extraction | Existing downstream AI analyzers / Phase 42 | D-10 defers structured parsing; Phase 50 is raw text only. |
| Ollama auth routing | Frontend-provided host/model/header | Supabase secrets read in Edge Functions | Prevents SSRF/config injection and preserves per-environment runtime controls. |
| User-visible provider badges | New UI labels | Existing upload/analyzing states | D-11 says provider metadata is operational, not normal UI. |

## Common Pitfalls

### Pitfall 1: Assuming Ollama Accepts PDFs

**What goes wrong:** planner sends raw PDF bytes/base64 to `/api/chat` and expects OCR.

**Why it happens:** current Claude fallback can accept a PDF document block; Ollama vision docs use images.

**How to avoid:** pass base64 page images to Ollama or require a host-side wrapper. For raw stored PDFs without images, skip Ollama and fall back to Claude unless a wrapper exists.

**Warning signs:** request body has `media_type: application/pdf`, no `images` array, or backend attempts to import browser pdfjs workers.

### Pitfall 2: Timeout Stack Exceeds Gateway Budget

**What goes wrong:** `pdfjs` fails, Ollama waits 60s, Claude OCR then waits close to 120s, and the frontend or Supabase gateway times out.

**Why it happens:** current `Upload.tsx` fallback uses `invokeWithTimeout(..., 120000)` for `ocr-pdf`; adding Ollama ahead of Claude without reducing per-provider budgets can exceed end-to-end limits.

**How to avoid:** set Ollama timeout to 35-45s, preserve a hard whole-function budget, and return a specific failure if all providers fail. Supabase hosted Edge idle timeout is 150s; keep user-facing extraction below that with margin.

**Warning signs:** repeated 504/503, logs show Ollama timeout followed by long Claude call, or users see stalled upload progress.

### Pitfall 3: Hash Drift

**What goes wrong:** `resumes.text_hash`, cache keys, and returned metadata disagree for the same accepted text.

**Why it happens:** current code hashes different normalizations: `ocr-pdf` hashes `fullText` directly while `analyze-resume` hashes `resumeText.replace(/\s+/g, ' ').trim()`.

**How to avoid:** add `canonicalizeExtractedText()` in `_shared/document-quality.ts`, use it before `sha256Hex`, and test exact fixtures. Persist raw accepted text, but hash canonical text.

**Warning signs:** identical visible text produces different `text_hash` values depending on provider.

### Pitfall 4: Overwriting Good LinkedIn Source on Failed Replacement

**What goes wrong:** a failed or poor-quality uploaded LinkedIn PDF replaces `profiles.linkedin_pdf_content`.

**Why it happens:** extraction success and downstream analysis success get conflated.

**How to avoid:** for LinkedInGrader, preserve the current Phase 35 timing: persist replacement source only after `grade-linkedin` succeeds. For onboarding/profile replacement, persist only accepted text after quality gates.

**Warning signs:** `profiles.linkedin_pdf_content` is updated before `grade-linkedin` response normalization completes.

### Pitfall 5: Large Base64 Payloads and Logs

**What goes wrong:** memory pressure, slow requests, or log truncation from image payloads/provider responses.

**Why it happens:** rendered pages are data URLs; base64 inflates bytes; Supabase logs cap message size at 10,000 characters.

**How to avoid:** strip `data:image/png;base64,` before sending to Ollama, cap page count and image width, do not log images/full text, and store concise metadata only.

**Warning signs:** logs include base64, function memory errors, or extraction request bodies grow with full PDF page count.

### Pitfall 6: Metadata Schema Creep

**What goes wrong:** prompts, raw responses, model timing blobs, or page-level transcripts are persisted in user tables.

**Why it happens:** support debugging desire expands beyond D-20.

**How to avoid:** persist only provider, attempted providers, quality status, document type, text hash, extracted timestamp, and concise fallback reason.

**Warning signs:** `jsonb` metadata contains `prompt`, `messages`, `response`, `images`, `pages`, or long strings.

### Pitfall 7: Treating Ollama Health as User Failure

**What goes wrong:** missing `OLLAMA_BASE_URL` or model 404 causes user-facing extraction failure even though Claude could succeed.

**Why it happens:** provider error bubbles instead of falling through.

**How to avoid:** log `ollama_config_missing`, `ollama_timeout`, `ollama_http_404`, etc.; append attempted provider metadata; then call Claude.

**Warning signs:** user sees "Ollama unavailable" or "model not found" rather than an existing operational extraction error.

### Pitfall 8: Breaking Backend Career/Interview Paths

**What goes wrong:** `_shared/pdf-parser.ts` is replaced wholesale and backend stored-resume extraction regresses.

**Why it happens:** frontend and backend extraction capabilities are different; browser has pdfjs/rendering, Edge currently has raw PDF bytes.

**How to avoid:** refactor incrementally. Keep `_shared/pdf-parser.ts` exported API working; wrap it in the new shared layer instead of deleting it.

## Code Examples

### Ollama Vision Call

Source: official Ollama `/api/chat` and Vision docs.

```ts
export async function invokeOllamaVision(params: {
  prompt: string;
  images: string[];
  documentType: DocumentType;
}): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const baseUrl = Deno.env.get('OLLAMA_BASE_URL')?.replace(/\/$/, '');
  if (!baseUrl) return { ok: false, reason: 'ollama_config_missing' };

  const model = Deno.env.get('OLLAMA_MODEL') || 'gemma3:4b';
  const timeoutMs = Number(Deno.env.get('OLLAMA_TIMEOUT_MS') || 35000);
  const headerName = Deno.env.get('OLLAMA_AUTH_HEADER_NAME');
  const headerSecret = Deno.env.get('OLLAMA_AUTH_SECRET');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(headerName && headerSecret ? { [headerName]: headerSecret } : {}),
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: buildExtractionPrompt(params.documentType),
          images: params.images,
        }],
        stream: false,
        options: { temperature: 0 },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, reason: `ollama_http_${response.status}:${body.slice(0, 160)}` };
    }

    const json = await response.json();
    const text = typeof json?.message?.content === 'string' ? json.message.content : '';
    return text.trim() ? { ok: true, text } : { ok: false, reason: 'ollama_empty_response' };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    return { ok: false, reason: isAbort ? 'ollama_timeout' : 'ollama_fetch_failed' };
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### Canonical Text Hash

```ts
import { sha256Hex } from './cache-fingerprint.ts';

export function canonicalizeExtractedText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\u0000/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractedTextHash(text: string): Promise<string> {
  return await sha256Hex(canonicalizeExtractedText(text));
}
```

### Provider Loop

```ts
const attemptedProviders: ExtractionProvider[] = [];

if (pdfjsText) {
  attemptedProviders.push('pdfjs');
  const quality = assessExtractionQuality(pdfjsText, documentType);
  if (quality.ok) return accept(pdfjsText, 'pdfjs', attemptedProviders);
}

if (images.length > 0) {
  attemptedProviders.push('ollama');
  const ollama = await invokeOllamaVision({ prompt, images, documentType });
  if (ollama.ok) {
    const quality = assessExtractionQuality(ollama.text, documentType);
    if (quality.ok) return accept(ollama.text, 'ollama', attemptedProviders);
  }
}

attemptedProviders.push('claude_ocr');
const claude = await invokeClaudeOcr(...);
if (claude.ok && assessExtractionQuality(claude.text, documentType).ok) {
  return accept(claude.text, 'claude_ocr', attemptedProviders);
}

return { ok: false, attemptedProviders, documentType, reason: 'all_providers_failed' };
```

## State of the Art

| Old Approach | Current Recommended Approach | Changed / Verified | Impact |
|---|---|---|---|
| Treat OCR fallback as Claude-only | Insert best-effort local/hosted vision model before Claude | Verified against current Ollama API docs 2026-06-05 | Reduces Claude OCR usage when Ollama quality is adequate. |
| Hash raw provider output ad hoc | Hash canonicalized accepted text with shared SHA-256 helper | Existing repo already has `sha256Hex`; normalization needs one shared helper | Prevents cache/hash drift across providers. |
| Frontend extraction per page | One browser helper across Resume/LinkedIn flows | Existing code duplicates extraction/fallback patterns | Planner can reduce drift while preserving UI behavior. |
| Backend re-extracts stored PDF repeatedly | Prefer persisted `resumes.extracted_text/text_hash`; opportunistic extraction on next use | Phase 29 columns exist; Phase 50 should populate consistently | Avoids broad backfill and reduces repeated OCR cost. |

**Deprecated/outdated for this phase:**
- Sending raw PDFs to Ollama as though it were Claude document OCR: official Ollama vision REST examples require images.
- Building a full extraction audit table: explicitly deferred.
- Exposing provider labels in normal UI: explicitly deferred.

## Persistence And Migration Recommendation

Use one additive, idempotent migration:

```sql
ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS extraction_metadata jsonb NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linkedin_pdf_text_hash text NULL,
  ADD COLUMN IF NOT EXISTS linkedin_pdf_extraction_metadata jsonb NULL;

CREATE INDEX IF NOT EXISTS profiles_linkedin_pdf_text_hash_idx
  ON public.profiles (linkedin_pdf_text_hash)
  WHERE linkedin_pdf_text_hash IS NOT NULL;
```

Add comments that metadata is concise operational extraction metadata only and that legacy rows remain NULL until next upload/source replacement. Do not backfill.

Why not reuse `archive_path`: Phase 42 Layer 5 uses `archive_path` for storage archival lifecycle. Phase 50 metadata is operational extraction metadata and should not overload archival state.

## Verification Strategy

### Unit Tests

| Test Area | Target | Assertions |
|---|---|---|
| Quality gates | `supabase/functions/_shared/document-quality.test.ts` | Accept normal resume/LinkedIn text; reject too short, symbol-heavy, repetitive, and missing-signal output. |
| Hash canonicalization | `_shared/document-quality.test.ts` or `_shared/cache-fingerprint.test.ts` | Whitespace-equivalent accepted text produces same hash; materially different text differs. |
| Ollama client | `_shared/ollama-client.test.ts` | Missing `OLLAMA_BASE_URL` skips; auth header is applied; `/api/chat` payload has `stream:false`; timeout returns `ollama_timeout`; 404/500 become provider rejection. |
| Provider selection | `_shared/document-extraction.test.ts` | `pdfjs` accepted stops chain; `pdfjs` rejected + Ollama accepted stops before Claude; Ollama poor quality falls to Claude; all fail persists nothing. |
| Persistence | source or mocked Supabase tests | Resume update includes `extracted_text`, `text_hash`, `extraction_metadata`, `.eq('user_id', userId)`; LinkedIn update includes content/hash/metadata only in accepted replacement/onboarding paths. |

### Edge/Function Tests

- `ocr-pdf` keeps OPTIONS/user auth/rate limit behavior.
- `ocr-pdf` accepts legacy `{ images }` requests and returns `{ text, pageCount }` compatibility fields plus metadata.
- Missing Ollama config still succeeds through Claude fixture path when Claude fixture is enabled.
- Forced Ollama poor output falls back to Claude and metadata records attempted providers.
- All-providers-failed returns a specific operational error and writes no `resumes` / `profiles` text.

### Frontend Tests

- `Upload.tsx` uses the shared browser extraction helper and still navigates to `/results/:id?stream=true`.
- `LinkedInGrader.tsx` preserves `skipCacheRestore` and the "persist replacement PDF after successful grade" timing.
- `Onboarding.tsx`, `CareerCompass.tsx`, `Profile.tsx`, and `RecruitingLens.tsx` no longer call raw `extractPDFText` for LinkedIn PDFs without fallback handling.
- No normal UI renders provider metadata.

### Manual QA

Run against staging with three configurations:

1. `OLLAMA_BASE_URL` unset: text PDF and scanned PDF still complete through pdfjs/Claude fallback.
2. Ollama configured and healthy: scanned resume and LinkedIn PDFs accept Ollama output, persist concise metadata, and downstream analysis succeeds.
3. Ollama configured but unhealthy/slow/wrong model: upload succeeds through Claude fallback; logs show operational reason; user does not see Ollama-specific failure.

Manual artifacts to capture:
- Resume row: `extracted_text`, `text_hash`, `extraction_metadata`.
- Profile row: `linkedin_pdf_content`, `linkedin_pdf_text_hash`, `linkedin_pdf_extraction_metadata`.
- One cache-hit-sensitive rerun proving accepted text hash is stable.
- One all-fail attempt proving no empty/low-quality text was persisted.

## Open Questions

1. **Does the production Ollama host expose only official Ollama API routes, or a PDF-aware wrapper?**
   - What we know: official Ollama vision REST API expects base64 images.
   - What's unclear: whether the host can rasterize PDFs server-side.
   - Recommendation: plan official API support first; mark backend stored scanned-PDF Ollama OCR as conditional on host wrapper. Do not add Edge rasterization.

2. **Which model should staging/prod use?**
   - What we know: official examples use `gemma3`; Ollama library marks `gemma3:4b/12b/27b` as Text+Image and `qwen2.5vl` as strong vision/document model.
   - What's unclear: production GPU/VRAM, latency, and quality data.
   - Recommendation: make `OLLAMA_MODEL` required when `OLLAMA_BASE_URL` is set. Suggested staging defaults: `gemma3:4b` for low resource, `qwen2.5vl:7b` if host capacity allows document OCR testing.

3. **Should `ocr-pdf` stay the public fallback endpoint or should Phase 50 add `extract-document`?**
   - What we know: `Upload.tsx` already invokes `ocr-pdf`; changing names increases frontend churn.
   - What's unclear: whether planner wants clearer naming for LinkedIn and backend callers.
   - Recommendation: add shared internals and keep `ocr-pdf` as a compatibility wrapper. Add a new endpoint only if the planner wants a clean body schema for all document types.

4. **How aggressive should page/image caps be?**
   - What we know: resumes are usually short; LinkedIn PDFs can be longer; base64 payloads are expensive.
   - What's unclear: real user PDF size distribution.
   - Recommendation: default cap around 8 pages for resumes and 12 pages for LinkedIn in Phase 50, with a specific user-facing error for over-limit unreadable scanned documents. Tune after staging QA.

## Sources

### Primary (HIGH confidence)

- Ollama API - Generate: `https://docs.ollama.com/api/generate` - verified `images`, `format`, `stream`, and response fields.
- Ollama API - Chat: `https://docs.ollama.com/api/chat` - verified `/api/chat`, `messages`, `format`, `stream`, and response shape.
- Ollama Vision: `https://docs.ollama.com/capabilities/vision` - verified REST API expects base64 image data for image input.
- Ollama Streaming: `https://docs.ollama.com/api/streaming` - verified endpoints stream by default and `stream:false` returns JSON.
- Ollama Authentication: `https://docs.ollama.com/api/authentication` - verified local API auth behavior and bearer API key pattern for ollama.com API.
- Ollama Tags / PS / Errors: `https://docs.ollama.com/api/tags`, `https://docs.ollama.com/api/ps`, `https://docs.ollama.com/api/errors` - verified health/model endpoints and error response shape.
- Supabase Edge Function Limits: `https://supabase.com/docs/guides/functions/limits` - verified memory, duration, CPU, idle timeout, log, and runtime restrictions.
- Supabase Edge Function Secrets: `https://supabase.com/docs/guides/functions/secrets` - verified `Deno.env.get`, per-environment secrets, and no redeploy requirement for secret updates.
- Supabase Recursive Function Calls: `https://supabase.com/docs/guides/functions/recursive-functions` - verified internal function-to-function fetch rate limit semantics.
- Repo files checked: `src/lib/extract-pdf-text.ts`, `src/lib/pdf-extractor.worker.ts`, `src/pages/Upload.tsx`, `src/pages/LinkedInGrader.tsx`, `src/pages/Onboarding.tsx`, `src/pages/CareerCompass.tsx`, `src/pages/RecruitingLens.tsx`, `src/pages/Profile.tsx`, `supabase/functions/ocr-pdf/index.ts`, `supabase/functions/_shared/pdf-parser.ts`, `supabase/functions/_shared/cache-fingerprint.ts`, `supabase/functions/analyze-resume/index.ts`, `supabase/functions/analyze-career/index.ts`, `supabase/functions/interview-prep-analyze/index.ts`, `supabase/migrations/20260512000001_resumes_extracted_text.sql`.

### Secondary (MEDIUM confidence)

- Ollama model library `gemma3`: `https://ollama.com/library/gemma3` - verified current Text+Image variants and context/model size claims from official model page.
- Ollama model library `qwen2.5vl`: `https://ollama.com/library/qwen2.5vl` - verified Text+Image variants and document-understanding claims from official model page.

### Tertiary (LOW confidence)

- None used. No community or unverified sources are required to plan this phase.

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|---|---|---|
| Standard stack | HIGH | Verified from live repo files, `package.json`, and official Supabase/Ollama docs. |
| Architecture | HIGH | Existing extraction/persistence paths are clear; Ollama image-only constraint is primary-source verified. |
| Ollama model choice | MEDIUM | Official model pages identify viable vision models, but production hardware and latency are unknown. |
| Quality thresholds | MEDIUM | Heuristics are deterministic and aligned to D-04, but thresholds need fixture and staging tuning. |
| Backend stored-PDF Ollama path | MEDIUM | Official API limitation is clear; final implementation depends on whether the host has a PDF wrapper. |

**Research date:** 2026-06-05
**Valid until:** 2026-07-05 for API/runtime assumptions; re-check Ollama API/model pages before implementation if planning slips beyond 30 days.

## RESEARCH COMPLETE

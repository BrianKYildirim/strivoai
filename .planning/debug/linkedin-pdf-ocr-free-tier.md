---
status: resolved
trigger: "Free user uploads LinkedIn Profile PDF for LinkedIn Grader and receives unable-to-read-document error. Supabase logs show ocr-pdf all_providers_failed after pdf_parser_no_text and missing cheap OCR providers."
created: 2026-06-07
updated: 2026-06-07
---

# Debug Session: linkedin-pdf-ocr-free-tier

## Symptoms

- expected_behavior: A free-tier user can upload a LinkedIn Profile PDF downloaded from LinkedIn and run LinkedIn Grader analysis.
- actual_behavior: The app reports that it was unable to read the document.
- error_messages:
  - Frontend: unable to read document / could not read this file reliably.
  - Supabase logs:
    - `[ocr-pdf] extraction failed { documentType: "linkedin_profile", reason: "all_providers_failed", attemptedProviders: [ "pdf_parser", "ollama", "mistral", "textract" ], failureReasons: [ "pdf_parser_no_text", "ollama_config_missing", "mistral_config_missing", "textract_config_missing" ] }`
    - `Processing 2 page(s) for OCR`
    - auth succeeded for user `d8a41ea6-6cd5-45f3-8e21-d589c2d7dd1b`
- timeline: Reported 2026-06-07 after Phase 51 document extraction work and the quick task that kept LinkedIn uploads PDF-only.
- reproduction: As a free user, upload a LinkedIn Profile PDF downloaded through LinkedIn Profile and start LinkedIn Grader analysis.

## Current Focus

- hypothesis: LinkedIn Profile PDFs from LinkedIn are often image-backed or otherwise unreadable by pdf.js. The shared OCR endpoint then attempts only cheap providers for non-Elite users. In the current environment, Ollama, Mistral, and Textract are not configured, so free LinkedIn PDF extraction fails before Claude OCR is attempted.
- test: Inspect `ocr-pdf` tier policy and shared extraction chain; adjust policy narrowly so `linkedin_profile` can use Claude OCR when parser and cheap providers fail, while keeping resume Claude OCR Elite-only.
- expecting: `ocr-pdf` currently sets `allowClaudeOcr: rawTier === 'elite'` for every document type, causing `linkedin_profile` free users to fail when cheap providers are missing.
- next_action: implement narrow LinkedIn-only Claude OCR policy exception and focused tests
- reasoning_checkpoint: User interrupted before implementation and asked to log everything for a new session.
- tdd_checkpoint: Not yet implemented.

## Evidence

- timestamp: 2026-06-07
  observation: `src/pages/LinkedInGrader.tsx` routes uploaded LinkedIn PDFs through shared document extraction with `documentType: 'linkedin_profile'`.
- timestamp: 2026-06-07
  observation: `src/lib/document-extraction.ts` calls the `ocr-pdf` Edge Function after pdf.js text extraction fails or is too low quality.
- timestamp: 2026-06-07
  observation: `supabase/functions/ocr-pdf/index.ts` resolves the raw subscription tier from `profiles.subscription_tier`, then builds `ExtractionPolicy` with `allowClaudeOcr: rawTier === 'elite'`.
- timestamp: 2026-06-07
  observation: `supabase/functions/_shared/document-extraction.ts` always attempts providers in this order: `pdf_parser`, `ollama`, `mistral`, `textract`, then `claude_ocr` only if `policy.allowClaudeOcr` is true.
- timestamp: 2026-06-07
  observation: The supplied production log matches this code path exactly: pdf parser produced no text, all cheap providers were missing config, and `claude_ocr` was not attempted because the free-tier policy blocked it.
- timestamp: 2026-06-07
  observation: Phase 51 verification explicitly validated that free/pro scanned PDFs fail without cheap providers and that Claude OCR is literal Elite-only. That policy appears appropriate for resume cost control but conflicts with the current LinkedIn Grader product behavior if LinkedIn-exported PDFs are commonly OCR-only.

## Eliminated

- hypothesis: Authentication failure caused the read failure.
  reason: Supabase logs include `_shared/auth` `auth-success` for the user before extraction.
- hypothesis: The LinkedIn PDF did not reach OCR rendering.
  reason: Logs show `Processing 2 page(s) for OCR`.
- hypothesis: The failure is an Anthropic prompt/model failure in LinkedIn Grader.
  reason: The request fails during document extraction before grader analysis; no Claude OCR call is attempted in the provided log.

## Corrected Diagnosis (supersedes the OCR-policy hypothesis below)

The original hypothesis — that the fix was an OCR-provider policy change — was WRONG.
The user correctly rejected using Claude (an LLM) as a free-tier OCR fallback. Deeper
investigation on the actual failing PDF (`scripts/test-resumes/Profile.pdf`, the user's
real LinkedIn export) proved the document was never an OCR case at all:

- `node scripts/diagnose-pdf-text.mjs scripts/test-resumes/Profile.pdf` →
  `HAS A TEXT LAYER` (page 1: 1684 chars, real Unicode incl. email + LinkedIn URL,
  0 images). The PDF has a clean, selectable text layer.
- The real reconstruction code (`reconstructPdfPageText` / `reconstructPdfDocumentText`)
  produces ≥420 chars / ≥80 words on this PDF and clears the `linkedin_profile`
  quality gate (verified by `src/lib/__tests__/profile-pdf-reconstruct.test.ts`).
- The server logged `pdf_parser_no_text`, which only occurs when the CLIENT sent empty
  `pdfjsText`. If the client had sent any non-empty text, the server would have logged
  a quality reason (e.g. `pdf_parser_too_short`) instead.

Conclusion: text + reconstruction both work; the client nonetheless produced empty text.
The only component between them is the browser worker boundary. `pdf-extractor.worker.ts`
calls `getDocument` INSIDE a Web Worker, which forces pdf.js to spawn a NESTED worker —
unsupported/fragile in some browser/build/CSP setups. When it throws, the catch in
`extractDocumentFromPdf` silently swallows it, leaves `pdfjsText = ''`, and falls through
to image rendering → `ocr-pdf` → `all_providers_failed`.

## Fix Applied

Make `src/lib/extract-pdf-text.ts` resilient: keep the dedicated worker as the primary
(off-main-thread) path, but on ANY worker failure fall back to extracting on the main
thread using the same pdf.js instance already used successfully for rendering
(`@/lib/pdf-worker`) plus the same `reconstructPdf*` layout code. A readable, text-bearing
PDF therefore never reaches OCR — zero cost, no LLM, no new provider, no secrets.

- `extractViaWorker` now also catches synchronous `postMessage`/worker-construction throws.
- New exported `extractPdfTextOnMainThread(bytes)` for the fallback (and direct testing).
- `extractPDFText` copies the buffer before transferring to the worker so the fallback
  still has the bytes (worker transfer detaches the original).
- No OCR-policy change: `ocr-pdf` Claude OCR stays literal-Elite-only (Phase 51 intact).

## Commands Run

- `rg -n "linkedin_profile|claude_ocr|all_providers_failed|isElite|tier|ocr-pdf|pdf_parser_no_text|cheap OCR|cheap" supabase/functions/ocr-pdf supabase/functions/_shared src/pages/LinkedInGrader.tsx src/lib/document-extraction.ts .planning/quick .planning/phases`
- `Get-Content -Path supabase\functions\ocr-pdf\index.ts`
- `Get-Content -Path supabase\functions\_shared\document-extraction.ts`
- `rg -n "LinkedIn PDF|OCR|claude_ocr|linkedin_profile|all_providers_failed|free" C:\Users\yildi\.codex\memories\MEMORY.md`
- `Get-Content -Path supabase\functions\ocr-pdf\index.test.ts`
- `Get-Content -Path supabase\functions\_shared\document-extraction.test.ts`
- `Get-Content -Path supabase\functions\_shared\document-extraction-types.ts`

## Files Inspected

- `src/pages/LinkedInGrader.tsx`
- `src/lib/document-extraction.ts`
- `supabase/functions/ocr-pdf/index.ts`
- `supabase/functions/ocr-pdf/index.test.ts`
- `supabase/functions/_shared/document-extraction.ts`
- `supabase/functions/_shared/document-extraction.test.ts`
- `supabase/functions/_shared/document-extraction-types.ts`
- `.planning/phases/51-cost-optimized-document-extraction/51-VERIFICATION.md` via search output

## Verification To Run After Fix

- `deno.cmd test --no-check --allow-env --allow-read --config supabase/functions/deno.json supabase/functions/ocr-pdf/index.test.ts supabase/functions/_shared/document-extraction.test.ts`
- `npm.cmd test -- src/pages/__tests__/document-extraction-primary.test.ts src/pages/__tests__/document-extraction-secondary.test.ts`
- `npm.cmd run build`
- Optional staging smoke: free user uploads the same LinkedIn Profile PDF and confirms `ocr-pdf` attempted providers include `claude_ocr`, extraction succeeds, and LinkedIn Grader proceeds.

## Resolution

- root_cause: NOT an OCR-provider/policy problem. The LinkedIn PDF has a clean text
  layer that pdf.js + the app's reconstruction read correctly. The browser text-
  extraction Web Worker (`pdf-extractor.worker.ts`) spawns a nested pdf.js worker, which
  fails in the user's browser/build/CSP context. The failure was swallowed, leaving the
  client `pdfjsText` empty, which forced the upload down the OCR fallback path; OCR then
  failed because no OCR providers are configured (`all_providers_failed`). The visible
  OCR error was a downstream symptom, not the cause.
- fix: Added a main-thread extraction fallback in `src/lib/extract-pdf-text.ts`. The
  dedicated worker remains primary; on any worker failure the code falls back to
  `extractPdfTextOnMainThread`, which uses the rendering pdf.js instance + the existing
  `reconstructPdf*` layout code. Readable PDFs are now extracted client-side and never
  reach OCR. No OCR-policy change; Claude OCR remains literal-Elite-only.
- verification:
  - `node scripts/diagnose-pdf-text.mjs scripts/test-resumes/Profile.pdf` → HAS A TEXT LAYER.
  - `npm test src/lib/__tests__/profile-pdf-reconstruct.test.ts` — 2 passed (main-thread
    fallback recovers ≥420 chars / ≥80 words and the LinkedIn URL from the real export).
  - `npm test src/pages/__tests__/document-extraction-{primary,secondary}.test.ts` — 12 passed.
  - `npm run build` — clean.
  - Pending real-browser smoke: free user re-uploads the LinkedIn PDF; confirm LinkedIn
    Grader extracts text client-side (no `ocr-pdf` call, no `pdf_parser_no_text` log).
- files_changed:
  - `src/lib/extract-pdf-text.ts` (worker + main-thread fallback)
  - `src/lib/__tests__/profile-pdf-reconstruct.test.ts` (regression test, skips without fixture)
  - `src/lib/__tests__/pdf-test-env.ts` (canvas-API stubs for the test env)
  - `scripts/diagnose-pdf-text.mjs` (PDF text-layer diagnostic)
  - `.planning/debug/linkedin-pdf-ocr-free-tier.md`
- note: `scripts/test-resumes/Profile.pdf` is the user's real export (PII); intentionally
  NOT committed. The regression test skips when the fixture is absent.

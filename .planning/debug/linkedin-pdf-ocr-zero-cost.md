---
status: resolved
trigger: "LinkedIn analysis on free tier fails: ocr-pdf returns all_providers_failed (pdf_parser_no_text, ollama/mistral/textract config_missing). User wants a $0 OCR path for LinkedIn PDFs — only Claude is configured, and OCR must be $0 like other formats."
created: 2026-06-07T19:35:00.0000000-07:00
updated: 2026-06-07T12:57:00.0000000-07:00
---

# Debug Session: linkedin-pdf-ocr-zero-cost

## Current Focus

- hypothesis: CONFIRMED ROOT CAUSE — LinkedIn "Save to PDF" exports DO carry a clean selectable text layer that passes BOTH the browser and server quality gates at $0. The bug is NOT the quality gate and NOT image-only PDFs. The real defect is in `src/lib/extract-pdf-text.ts`: `extractPDFText` runs the Web Worker (`extractViaWorker`) first and only falls back to the working main-thread path (`extractPdfTextOnMainThread`) when the worker THROWS. When the nested pdfjs sub-worker fails to load in the browser (CSP/cross-origin/build-asset issues), the worker resolves with an EMPTY string instead of throwing, so the main-thread fallback never fires. The empty text fails the browser quality gate (too_short), the client renders page images and calls `ocr-pdf` WITHOUT `pdfjsText` (gated by `pdfjsText.trim()`), and the server reports `pdf_parser_no_text` → cheap providers config_missing → claude_ocr blocked (non-elite) → `all_providers_failed`.
- test: Node repro of the exact pipeline (pdfjs getTextContent -> reconstructPdfPageText -> reconstructPdfDocumentText -> assessBrowserExtractionQuality) against the real scripts/test-resumes/Profile.pdf.
- expecting: Fix = treat an empty/too-short worker result as a fallback trigger in `extractPDFText` (run main-thread extraction when the worker returns no usable text, not only when it throws). This keeps the readable LinkedIn PDF on the $0 pdf_parser path. No quality-gate changes, no claude_ocr for free tier, no new dependency.
- next_action: DONE — fix applied + regression test added (red → green) + full suite run.
- reasoning_checkpoint: PASSED — verified text-based (not image-only). Fix stays $0 (local pdfjs main-thread text layer). claude_ocr remains elite-only, untouched.
- tdd_checkpoint: PASSED — added `src/lib/__tests__/extract-pdf-text-empty-worker-fallback.test.ts` driving `extractPDFText` (public entry, not `extractPdfTextOnMainThread`) with a Worker stub that resolves `text:''`; confirmed RED before fix (returned 0 chars), GREEN after fix (recovers 420+ chars / 80+ words including `linkedin.com/in/brianyildirim`).

## Symptoms

- Expected behavior: A LinkedIn profile PDF downloaded from LinkedIn should be readable at $0 on free tier, like resume/docx/txt extraction, so LinkedIn analysis can proceed.
- Actual behavior: `ocr-pdf` returns 422 `all_providers_failed`; LinkedIn analysis blocked on free.
- Error messages: `[ocr-pdf] extraction failed { documentType: "linkedin_profile", reason: "all_providers_failed", attemptedProviders: ["pdf_parser","ollama","mistral","textract"], failureReasons: ["pdf_parser_no_text","ollama_config_missing","mistral_config_missing","textract_config_missing"] }`. Note: `claude_ocr` is NOT in attemptedProviders.
- Timeline: Observed 2026-06-07; recent commit 21925c8 "fixing pdf parser for linkedin ocr" indicates active prior work on this exact area.
- Reproduction: Upload a LinkedIn-downloaded PDF for LinkedIn analysis on a free-tier account.

## Evidence

- timestamp: 2026-06-07T19:35:00Z
  source: supabase/functions/ocr-pdf/index.ts:225-232
  observation: Server policy sets `allowClaudeOcr: rawTier === 'elite'`. Free tier => claude_ocr blocked.

- timestamp: 2026-06-07T19:35:00Z
  source: supabase/functions/_shared/document-extraction.ts:154-164
  observation: When `!policy.allowClaudeOcr`, function returns `all_providers_failed` BEFORE pushing/attempting `claude_ocr`. This explains why claude_ocr is absent from attemptedProviders. Cheap providers (ollama/mistral/textract) precede this and fail with `*_config_missing`.

- timestamp: 2026-06-07T19:35:00Z
  source: src/lib/document-extraction.ts:165-236
  observation: Client flow: extractPDFText -> assessBrowserExtractionQuality. If quality.ok, returns at $0 (pdf_parser). Else renders pages to PNG (renderPdfPagesToImages) and calls ocr-pdf with images + optional pdfjsText. So the server only sees this PDF because the browser quality gate REJECTED the pdfjs text (or extraction returned empty -> pdf_parser_no_text server-side).

- timestamp: 2026-06-07T19:35:00Z
  source: src/lib/document-extraction.ts:150-163,417-444
  observation: LinkedIn quality thresholds are STRICTER than resume (minWords 80 vs 65, minChars 420 vs 320). Reject reasons: too_short, too_noisy (symbolNoiseRatio>0.22), pdf_operator_noise (>0.08), repetitive (>0.35), missing_document_signals (<1 signal). Any one rejecting LinkedIn text forces the image-OCR fallback.

- timestamp: 2026-06-07T19:35:00Z
  source: src/lib/extract-pdf-text.ts + src/lib/pdf-text-layout.ts (reconstruct fns)
  observation: Text extraction uses worker with main-thread fallback, then layout reconstruction. A reconstruction/encoding issue could yield empty or noisy text for LinkedIn's specific PDF layout.

- timestamp: 2026-06-07T19:35:00Z
  source: user statement
  observation: No env/config for Mistral, Ollama, Textract — only Claude. Requirement: OCR extraction must be $0 (so Claude OCR is NOT an acceptable fix for free tier).

- timestamp: 2026-06-07T20:05:00Z
  source: Node repro vs scripts/test-resumes/Profile.pdf (the committed real LinkedIn export from commit 21925c8)
  observation: DECISIVE. The PDF is 2 pages with a CLEAN TEXT LAYER (114 pdfjs text items). reconstructPdfDocumentText yields 1697 chars / 217 words of correct, well-ordered text ("Brian Yildirim", "linkedin.com/in/brianyildirim", "TypeScript", "Python", "UC Irvine", etc.). The linkedin_profile quality gate PASSES (ok:true): wordCount=217 (>=80), chars=1697 (>=420), symbolNoise=0.006 (<0.22), pdfOp=0 (<0.08), repeated=0.03 (<0.35), signals=7 (>=1). => The PDF is NOT image-only and the quality gate is NOT the problem. Both browser and server gates would ACCEPT this text. Therefore production must have sent EMPTY pdfjsText.

- timestamp: 2026-06-07T20:08:00Z
  source: src/lib/extract-pdf-text.ts:90-101 + src/lib/pdf-extractor.worker.ts:13-31
  observation: ROOT CAUSE. `extractPDFText` awaits `extractViaWorker(buffer)` and only catches THROWN errors to trigger `extractPdfTextOnMainThread`. The worker (`pdf-extractor.worker.ts`) wraps decode in try/catch and on success posts `{ text }`. If the nested pdfjs sub-worker (GlobalWorkerOptions.workerSrc) cannot load in the deployed browser/CSP, pdfjs can resolve with empty/garbled output WITHOUT throwing, so the worker posts `{ text: '' }` — a "success" with empty text. `extractViaWorker` resolves '' and the main-thread fallback NEVER runs. Empty text fails the browser gate (too_short) -> images rendered -> ocr-pdf called with `pdfjsText` omitted (line 217 `...(pdfjsText.trim() ? { pdfjsText } : {})`) -> server `pdf_parser_no_text`.

- timestamp: 2026-06-07T20:09:00Z
  source: commit 21925c8 (git show --stat) + src/lib/__tests__/profile-pdf-reconstruct.test.ts
  observation: The prior fix ADDED `extractPdfTextOnMainThread` and a worker-throw fallback, and a regression test — but the test calls `extractPdfTextOnMainThread` DIRECTLY, bypassing `extractPDFText`'s worker-first logic. So it proves reconstruction works but never exercises the empty-worker-result short-circuit. The prior fix is incomplete: it handles worker THROW but not worker EMPTY-RESULT.

- timestamp: 2026-06-07T12:55:00Z
  source: src/lib/__tests__/extract-pdf-text-empty-worker-fallback.test.ts (new) + vitest run
  observation: VERIFICATION. New regression drives `extractPDFText` with a stubbed `globalThis.Worker` that posts back `{ text: '' }` (the exact empty-success failure mode). Against the unpatched code the test was RED: `extractPDFText` returned 0 chars (the empty worker result). After the fix it is GREEN: the main-thread fallback fires and recovers 420+ chars / 80+ words including `linkedin.com/in/brianyildirim`, clearing the linkedin_profile quality gate. The pre-existing `profile-pdf-reconstruct.test.ts` still passes. Full suite: 7 failures, all pre-existing and unrelated (BlurredLockCard, req-coverage, LinkedInGrader.linkedin-pdf-source source-contract, cost-map-invariant) — confirmed identical on baseline via stash. Lint clean on both changed files.

## Resolution

- root_cause: `extractPDFText` (src/lib/extract-pdf-text.ts) only falls back to the working main-thread extractor when the Web Worker THROWS. When the nested pdfjs sub-worker fails to load in the deployed browser, the worker resolves with an empty string instead of throwing, so the main-thread fallback never runs. The clean LinkedIn text layer is dropped, the browser quality gate rejects the empty text, and the client calls ocr-pdf with no pdfjsText — the server reports pdf_parser_no_text and (with no cheap OCR configured and claude_ocr elite-only) returns all_providers_failed.
- fix: In `extractPDFText`, treat an empty/whitespace-only worker result as a fallback trigger. The worker-first call is now `const workerText = await extractViaWorker(buffer)`; if `workerText.trim().length > 0` it is returned, otherwise the function logs and runs `extractPdfTextOnMainThread(fallbackBytes)` — the same fallback that previously only ran on a thrown error. This keeps readable LinkedIn "Save to PDF" exports on the $0 local pdf_parser text path. No quality-gate change, no claude_ocr for free tier, no new dependency. Stays $0.
- verification: Added `src/lib/__tests__/extract-pdf-text-empty-worker-fallback.test.ts` — stubs `globalThis.Worker` so `extractPDFText` (the public entry, not `extractPdfTextOnMainThread`) hits a worker that resolves `text:''`, then asserts the real Profile.pdf text layer is recovered (>=420 chars, >=80 words, contains `linkedin.com/in/brianyildirim`). RED before fix (0 chars), GREEN after fix. `npm test` full suite: only 7 pre-existing, unrelated failures remain (verified identical on baseline via git stash). ESLint clean on both changed files.
- files_changed:
  - `src/lib/extract-pdf-text.ts` (empty/whitespace worker result now triggers the main-thread fallback, not only a thrown error)
  - `src/lib/__tests__/extract-pdf-text-empty-worker-fallback.test.ts` (new regression driving `extractPDFText` through the empty-worker-result path)
- browser_verification: 2026-06-07 — Ran the real `extractPDFText` and `extractDocumentFromPdf({documentType:'linkedin_profile'})` in real headless Chromium (Playwright) against `scripts/test-resumes/Profile.pdf` via the Vite dev server. Result: `extractPDFText` -> 1697 chars / 232 words, contains `linkedin.com/in/`; `extractDocumentFromPdf` -> `provider: pdf_parser`, `attemptedProviders: ['pdf_parser']`, `qualityStatus: accepted` (never invoked the `ocr-pdf` edge function). The page logged pdf.js's `Setting up fake worker` warning — the pdf.js worker did not load (the deployed-browser failure mode) — yet extraction still succeeded at $0, confirming the end-to-end path works in a real browser. Throwaway verification harness (temp vite config + playwright script) deleted after the run; tracked vite.config.ts untouched.

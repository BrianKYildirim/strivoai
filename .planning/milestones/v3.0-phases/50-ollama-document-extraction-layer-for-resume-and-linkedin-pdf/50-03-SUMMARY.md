---
phase: 50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf
plan: 03
subsystem: backend
tags: [deno, supabase-edge, ollama, document-extraction, fallback]

requires:
  - phase: 50-01
    provides: Shared extraction result contracts, deterministic quality gates, and canonical text hashing.
provides:
  - Secret-configured Ollama vision client for server-side Supabase Edge usage.
  - Shared provider orchestration for pdfjs, Ollama, and Claude OCR fallback sequencing.
  - Unit coverage for Ollama configuration, provider order, quality rejection, fallback, and all-fail behavior.
affects: [resume-extraction, linkedin-extraction, ocr-pdf, document-quality]

tech-stack:
  added: []
  patterns:
    - Server-owned Ollama configuration from Supabase secrets only.
    - Quality-gated provider chain with Claude OCR as final reliability fallback.

key-files:
  created:
    - supabase/functions/_shared/ollama-client.ts
    - supabase/functions/_shared/ollama-client.test.ts
    - supabase/functions/_shared/document-extraction.ts
    - supabase/functions/_shared/document-extraction.test.ts
  modified: []

key-decisions:
  - "Ollama calls use server-side Deno.env configuration and never accept frontend host, model, timeout, or auth settings."
  - "The shared extraction helper only attempts Ollama when page images are supplied; raw stored PDFs without images skip Ollama and continue to Claude OCR."
  - "Provider text is accepted only after deterministic quality gates pass; all-provider failure returns ok:false with no accepted text."

patterns-established:
  - "Ollama result reasons are concise provider codes such as ollama_config_missing, ollama_timeout, and ollama_http_404."
  - "Accepted extraction metadata includes provider, attemptedProviders, qualityStatus, documentType, textHash, extractedAt, and fallbackReason when applicable."
  - "Provider order is pdfjs -> ollama -> claude_ocr, with Ollama skipped rather than attempted when images are unavailable."

requirements-completed: []

duration: 8 min
completed: 2026-06-05
---

# Phase 50 Plan 03: Secret-configured Ollama Client and Provider Fallback Orchestration Summary

**Server-side Ollama document extraction now sits between pdfjs and Claude OCR with deterministic quality gates and concise provider metadata.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-05T12:00:11Z
- **Completed:** 2026-06-05T12:08:07Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `invokeOllamaVision()` with `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT_MS`, `OLLAMA_AUTH_HEADER_NAME`, and `OLLAMA_AUTH_SECRET` read from Supabase Edge secrets only.
- Added bounded non-streaming `/api/chat` payloads with `stream:false`, `temperature:0`, data URL prefix stripping, optional auth header, timeout handling, HTTP rejection reasons, malformed JSON handling, and empty response rejection.
- Added `extractDocumentText()` with provider order `pdfjs -> ollama -> claude_ocr`, quality-gated acceptance through `assessExtractionQuality()`, canonical `extractedTextHash()`, no-images Ollama skip handling, and all-provider failure with no accepted text.

## Provider Matrix

| Scenario | Result |
| --- | --- |
| Accepted pdfjs text | Returns `provider: pdfjs`, attempts `['pdfjs']`, does not call Ollama or Claude. |
| Rejected pdfjs + accepted Ollama | Returns `provider: ollama`, attempts `['pdfjs','ollama']`, records `pdfjs_too_short`. |
| Rejected pdfjs + no images | Skips Ollama with `ollama_skipped_no_images`, calls Claude OCR, attempts `['pdfjs','claude_ocr']`. |
| Failed or poor-quality Ollama | Falls through to Claude OCR and records the Ollama failure or rejection reason. |
| All providers fail or reject quality | Returns `ok:false`, `reason: all_providers_failed`, and no accepted `text` field. |

## Task Commits

1. **Task 1: Implement secret-configured Ollama vision client** - `092f158`
2. **Task 2: Implement shared provider orchestration with quality-gated fallback** - `0bbe346`

**Plan metadata:** committed separately after this summary.

## Files Created/Modified

- `supabase/functions/_shared/ollama-client.ts` - Secret-configured best-effort Ollama `/api/chat` vision client.
- `supabase/functions/_shared/ollama-client.test.ts` - Tests for config skip, payload shape, auth header, timeout, HTTP errors, invalid JSON, empty response, and successful extraction.
- `supabase/functions/_shared/document-extraction.ts` - Shared quality-gated provider loop for pdfjs, Ollama, and Claude OCR.
- `supabase/functions/_shared/document-extraction.test.ts` - Tests for provider order, quality rejection, no-images skip, Claude fallback, and all-fail behavior.

## Decisions Made

- Removed caller-provided prompt override from the Ollama public params so extraction prompt construction remains server-owned and document-type-specific.
- Kept `ollamaVision` as an internal dependency-injection seam for Deno tests; it does not expose frontend provider config and production callers use `invokeOllamaVision`.
- Did not add Edge-side PDF rasterization or raw PDF Ollama handling. Stored PDFs without page images are explicitly routed to Claude OCR fallback by caller-supplied `claudeOcr`.

## Deviations from Plan

None - plan files and behavior were implemented within the declared scope.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope creep.

## Issues Encountered

- `deno.cmd test --allow-env --allow-net=127.0.0.1 supabase/functions/_shared/ollama-client.test.ts` is blocked by a Deno 2.7.1 Windows pipe panic after type-check.
- `deno.cmd test --allow-env supabase/functions/_shared/document-extraction.test.ts` is blocked by the same Deno 2.7.1 Windows pipe panic after type-check.
- Used `deno.cmd check` plus direct Deno execution of the same contract cases as fallback verification. Direct checks passed 5/5 for the Ollama client and 5/5 for provider orchestration.

## Verification

- `deno.cmd test --allow-env --allow-net=127.0.0.1 supabase/functions/_shared/ollama-client.test.ts` - BLOCKED by Deno 2.7.1 Windows pipe panic after `Check`.
- `deno.cmd test --allow-env supabase/functions/_shared/document-extraction.test.ts` - BLOCKED by Deno 2.7.1 Windows pipe panic after `Check`.
- `deno.cmd check supabase/functions/_shared/ollama-client.ts supabase/functions/_shared/ollama-client.test.ts supabase/functions/_shared/document-extraction.ts supabase/functions/_shared/document-extraction.test.ts` - PASS.
- Direct Deno Ollama client contract execution - PASS, 5/5.
- Direct Deno document extraction contract execution - PASS, 5/5.
- `rg -n "OLLAMA_BASE_URL|OLLAMA_AUTH|stream: false|AbortController|ollama_skipped_no_images" supabase/functions/_shared/ollama-client.ts supabase/functions/_shared/document-extraction.ts` - PASS, required contracts found.
- `rg -n "application/pdf|sharp|canvas|Worker|pdfjs" supabase/functions/_shared/document-extraction.ts supabase/functions/_shared/ollama-client.ts` - PASS with expected `pdfjs` provider references only; no `application/pdf`, `sharp`, `canvas`, or `Worker` matches.

## User Setup Required

None - no external service configuration file generated in this plan. Runtime Ollama secrets are consumed by later deployment/staging setup.

## Next Phase Readiness

Plan 50-04 can wrap `ocr-pdf`, persistence, and backend stored-PDF integration around these helpers. The only unresolved staging-host note is operational: real Ollama success/unhealthy behavior still needs deployed Supabase secrets and a reachable Ollama host in later verification.

---
*Phase: 50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf*
*Completed: 2026-06-05*

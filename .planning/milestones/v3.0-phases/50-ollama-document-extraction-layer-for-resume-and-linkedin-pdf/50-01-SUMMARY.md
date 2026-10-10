---
phase: 50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf
plan: 01
subsystem: backend
tags: [deno, supabase, document-extraction, pdf, quality-gates, hashing]

requires:
  - phase: 29-foundation-infrastructure
    provides: shared cache-fingerprint SHA-256 helper
provides:
  - Shared resume and LinkedIn PDF extraction result contracts
  - Deterministic document quality gates for accepted extracted text
  - Canonical extracted-text hashing through cache-fingerprint.ts
affects: [phase-50, resume-analysis, linkedin-grader, document-extraction]

tech-stack:
  added: []
  patterns:
    - Type-only extraction result contracts with stable provider names
    - Deterministic document-type quality gates before text acceptance
    - SHA-256 over canonicalized accepted extracted text

key-files:
  created:
    - supabase/functions/_shared/document-extraction-types.ts
    - supabase/functions/_shared/document-quality.ts
    - supabase/functions/_shared/document-quality.test.ts
  modified: []

key-decisions:
  - "Use provider names pdfjs, ollama, and claude_ocr exactly as Phase 50 specifies."
  - "Reject extracted text below 80 words/400 chars for resumes and 120 words/700 chars for LinkedIn profiles."
  - "Require at least two document-type signals before accepting extracted text."
  - "Use cache-fingerprint.ts sha256Hex as the only SHA-256 helper for accepted extracted text hashes."

patterns-established:
  - "ExtractionResult is ok:true raw accepted text plus concise metadata, or ok:false attempted providers plus a concise reason."
  - "canonicalizeExtractedText normalizes NFC, removes nulls, collapses horizontal whitespace, and preserves meaningful line breaks."
  - "assessExtractionQuality rejects too_short, too_noisy, repetitive, and missing_document_signals before accepted text can be used."

requirements-completed: []

duration: 4 min
completed: 2026-06-05
---

# Phase 50 Plan 01: Shared Extraction Contracts and Quality Gates Summary

**Shared raw-text extraction contracts with deterministic resume and LinkedIn quality gates plus stable canonical text hashing.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-05T04:53:29-07:00
- **Completed:** 2026-06-05T04:57:20-07:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `DocumentType`, `ExtractionProvider`, `QualityStatus`, `ProviderAttempt`, `ExtractionMetadata`, and `ExtractionResult` contracts for future Phase 50 providers.
- Added `canonicalizeExtractedText()`, `extractedTextHash()`, and `assessExtractionQuality()` in the shared Deno layer.
- Added fixture-based tests covering accepted resume and LinkedIn text, short/noisy/repetitive/missing-signal rejection, type contract stability, and canonical hash stability.

## Task Commits

1. **Task 1: Define shared extraction result and metadata contracts** - `be1b18f`
2. **Task 2: Implement canonical text hash and document-type quality gates** - `af558c8`

**Plan metadata:** this summary commit.

## Files Created/Modified

- `supabase/functions/_shared/document-extraction-types.ts` - Shared extraction contract with stable providers and concise metadata only.
- `supabase/functions/_shared/document-quality.ts` - Canonicalization, SHA-256 text hashing through `sha256Hex`, and deterministic quality gates.
- `supabase/functions/_shared/document-quality.test.ts` - Deno fixtures and contract tests for acceptance, rejection, and hash stability.

## Threshold Choices and Tuning Notes

- Resume floor: 80 words and 400 characters.
- LinkedIn profile floor: 120 words and 700 characters.
- Symbol/noise ratio rejection: greater than 0.22.
- Repeated-line rejection: highest repeated non-trivial line ratio greater than 0.35.
- Signal requirement: at least two document-type signals.
- Staging tuning should focus on false rejects for short but valid resumes, long LinkedIn exports with sparse labels, and scanned documents with OCR punctuation artifacts.

## Verification

- `deno.cmd test --allow-env supabase/functions/_shared/document-quality.test.ts` - BLOCKED by Deno 2.7.1 Windows pipe panic before test execution.
- `deno.cmd check supabase/functions/_shared/document-quality.ts supabase/functions/_shared/document-quality.test.ts` - PASS.
- `deno.cmd eval "const tests=[]; Deno.test=(name, fn)=>tests.push([name, fn]); await import('./supabase/functions/_shared/document-quality.test.ts'); for (const [name, fn] of tests) { await fn(); console.log('PASS ' + name); } console.log('TOTAL ' + tests.length);"` - PASS, 10/10 registered tests executed.
- `rg -n "prompt|messages|images|response|transcript" supabase/functions/_shared/document-extraction-types.ts supabase/functions/_shared/document-quality.ts` - PASS, no matches.
- `rg -n "sha256Hex" supabase/functions/_shared/document-quality.ts` - PASS, imports and uses `sha256Hex`.

## Decisions Made

- Kept the contract raw-text-only with concise operational metadata, avoiding structured resume or LinkedIn sections.
- Kept provider attempts concise and reason-coded so later providers can record order and rejection causes without large payloads.
- Used deterministic heuristics only; no provider validation calls are introduced in this plan.

## Deviations from Plan

None - plan implementation executed exactly as written.

## Issues Encountered

- `deno.cmd test` panicked in Deno 2.7.1 on Windows with `Unexpected client pipe failure` and `The handle is invalid` before running tests. The modules passed `deno check`, and all 10 test registrations were executed successfully through `deno.cmd eval` as a fallback verification.
- GSD STATE/ROADMAP updates were skipped because the user explicitly scoped editable files to this plan's declared code files plus this summary. A pre-existing `.planning/STATE.md` modification was left untouched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 50-02. Later extraction orchestration and persistence plans can import the shared provider/result contracts, call `assessExtractionQuality()` before accepting provider output, and use `extractedTextHash()` for accepted text metadata.

---
*Phase: 50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf*
*Completed: 2026-06-05*

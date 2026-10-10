---
phase: 50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf
plan: 05
subsystem: frontend
tags: [react, vite, pdfjs, ocr-pdf, document-extraction]

requires:
  - phase: 50-04
    provides: ocr-pdf accepts documentType, images, resumeId, pdfjsText, and persists accepted resume text.
provides:
  - Browser PDF extraction facade for primary resume and LinkedIn upload flows.
  - Resume Upload wiring that passes resumeId after authenticated resume insertion.
  - LinkedInGrader and Onboarding wiring through the shared facade without provider metadata UI.
affects: [Upload, LinkedInGrader, Onboarding, document-extraction-primary]

tech-stack:
  added: []
  patterns:
    - Frontend primary PDF flows call one browser facade instead of local extraction fallbacks.
    - Browser request bodies include document type, images, pdfjs text, and resume id only.

key-files:
  created:
    - src/lib/document-extraction.ts
    - src/pages/__tests__/document-extraction-primary.test.ts
  modified:
    - src/pages/Upload.tsx
    - src/pages/LinkedInGrader.tsx
    - src/pages/Onboarding.tsx

key-decisions:
  - "Frontend extraction mirrors backend quality gates only to decide whether pdfjs text is acceptable before fallback."
  - "Resume Upload invokes ocr-pdf with pdfjsText and resumeId when browser text is accepted so backend accepted-text persistence can still run."
  - "LinkedInGrader keeps replacement profile source persistence after successful grade-linkedin response."

requirements-completed: []

duration: 18 min
completed: 2026-06-05
---

# Phase 50 Plan 05: Primary Frontend Upload Wiring Summary

**Resume and LinkedIn primary PDF flows now share a browser extraction facade that preserves pdfjs-first behavior and routes scanned documents through the backend fallback.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-06-05T17:13:00Z
- **Completed:** 2026-06-05T17:31:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added `extractDocumentFromPdf()` in `src/lib/document-extraction.ts` with pdfjs-first extraction, document-type-aware quality checks, capped page rendering, and `ocr-pdf` fallback invocation.
- Removed Upload-local page rendering and OCR fallback duplication; Upload now calls the shared facade after the resume row exists and passes `resumeId: resume.id`.
- Replaced direct LinkedInGrader and Onboarding `extractPDFText()` calls with the shared facade while keeping LinkedIn source replacement timing and optional onboarding LinkedIn PDF behavior.
- Added source-level Vitest assertions covering facade wiring, no frontend provider config, resumeId timing, LinkedIn replacement timing, and hidden provider metadata labels.

## Task Commits

1. **Task 1 RED: Primary extraction wiring assertions** - `a0a37db`
2. **Task 1 GREEN: Browser document extraction facade** - `d976bb2`
3. **Task 2: Resume Upload wiring** - `232afe1`
4. **Task 3: LinkedInGrader and Onboarding wiring** - `eed8eed`

**Plan metadata:** committed separately after this summary.

## Files Created/Modified

- `src/lib/document-extraction.ts` - Shared browser facade for pdfjs-first extraction, bounded image rendering, and `ocr-pdf` fallback.
- `src/lib/extract-pdf-text.ts` - Preserved unchanged as the low-level pdfjs text extraction export.
- `src/pages/Upload.tsx` - Uses shared extraction after resume insert and passes `resumeId`.
- `src/pages/LinkedInGrader.tsx` - Uses shared extraction for uploaded LinkedIn PDFs and preserves post-grade source replacement.
- `src/pages/Onboarding.tsx` - Uses shared extraction for required resume and optional LinkedIn PDFs.
- `src/pages/__tests__/document-extraction-primary.test.ts` - Source assertions for primary extraction wiring and provider metadata visibility.

## Decisions Made

- Kept frontend quality checks as a local mirror of the backend thresholds rather than importing Supabase Deno shared modules into Vite.
- Kept provider metadata as return/support data only; no normal primary page UI reads or renders it.
- Preserved LinkedIn profile source writes through existing `profiles.linkedin_pdf_*` fields and existing success timing.

## Deviations from Plan

None - plan executed within the declared files and behavior scope.

**Total deviations:** 0.
**Impact on plan:** No scope change.

## Issues Encountered

- Non-escalated `npm.cmd run test -- --run src/pages/__tests__/document-extraction-primary.test.ts` could not start Vite due `spawn EPERM` and an unloadable SWC native binding. The same command passed when run with approved escalation.
- `npm.cmd run type-check -- --pretty false` is blocked before source analysis by `tsconfig.app.json(5,27): error TS5103: Invalid value for '--ignoreDeprecations'`. This is outside the plan verification contract and was not modified.
- `apply_patch` could not match the encoded Upload helper block during removal, so that block was removed by exact line range. The resulting BOM/mojibake drift was caught in diff review and restored before committing.

## Verification

- `npm.cmd run test -- --run src/pages/__tests__/document-extraction-primary.test.ts` - PASS with escalation, 5/5 tests.
- `npm.cmd run test -- --run src/pages/__tests__/document-extraction-primary.test.ts` - BLOCKED without escalation by Vite/SWC `spawn EPERM` startup failure.
- `rg -n "extractTextWithOCR|renderPdfPagesToImages" src/pages/Upload.tsx` - PASS by no matches.
- `rg -n "OLLAMA_BASE_URL|OLLAMA_MODEL|OLLAMA_AUTH" src/lib src/pages/Upload.tsx src/pages/LinkedInGrader.tsx src/pages/Onboarding.tsx` - PASS by no matches.
- `rg -n "ollama|claude_ocr|attemptedProviders|provider used" src/pages/Upload.tsx src/pages/LinkedInGrader.tsx src/pages/Onboarding.tsx` - PASS by no matches.
- `git diff --check` - PASS, whitespace clean; Git emitted CRLF normalization warnings only.

## User Setup Required

None.

## Next Phase Readiness

Plan 50-06 can align secondary PDF call sites and run broader provider-metadata visibility/build checks with the primary facade in place.

---
*Phase: 50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf*
*Completed: 2026-06-05*

---
phase: 50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf
plan: 06
subsystem: frontend
tags: [react, pdf-extraction, vitest, source-assertions]

requires:
  - phase: 50-05
    provides: shared browser document extraction facade and primary frontend wiring
provides:
  - secondary frontend PDF consumers routed through extractDocumentFromPdf
  - source assertions guarding raw extractPDFText import drift in pages/components
  - provider metadata visibility checks for secondary UI surfaces
affects: [career-compass, profile, recruiting-lens, jobs, hero-upload, document-extraction]

tech-stack:
  added: []
  patterns:
    - secondary PDF call sites use the shared browser extraction facade
    - source assertions exclude production pages/components from direct extractPDFText imports

key-files:
  created:
    - src/pages/__tests__/document-extraction-secondary.test.ts
  modified:
    - src/pages/CareerCompass.tsx
    - src/pages/Profile.tsx
    - src/pages/RecruitingLens.tsx
    - src/pages/Jobs.tsx
    - src/components/ActionFirstHero.tsx
    - src/components/MinimalHero.tsx

key-decisions:
  - "Recruiting Lens's remaining PDF upload is a LinkedIn profile input, so it uses documentType: 'linkedin_profile' rather than a resume type."
  - "Career Compass no longer owns a separate page-image OCR helper; fallback image rendering now lives in the shared extraction facade."
  - "No frontend metadata fields were invented for Profile or Career Compass because the helper returns accepted text and backend persistence owns concise extraction metadata."

patterns-established:
  - "Production page/component scans fail if raw @/lib/extract-pdf-text imports return outside explicit low-level implementation files."
  - "Secondary UI tests assert provider metadata strings stay out of normal page/component source."

requirements-completed: []

duration: 10 min
completed: 2026-06-05
---

# Phase 50 Plan 06: Secondary Document Extraction Callsite Alignment Summary

**Secondary resume and LinkedIn PDF consumers now route through the shared extraction facade with source assertions guarding future raw-helper drift.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-06-05T17:28:00Z
- **Completed:** 2026-06-05T17:38:25Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Replaced secondary direct `extractPDFText` imports in Career Compass, Profile, Recruiting Lens, Jobs, ActionFirstHero, and MinimalHero with `extractDocumentFromPdf`.
- Preserved accepted-text-only LinkedIn writes in Career Compass/Profile: failed extraction does not write `profiles.linkedin_pdf_content`; Career Compass falls back to saved content when available.
- Routed authenticated MinimalHero uploads through the facade after the resume row exists so `resumeId` can reach the accepted-text persistence path.
- Added `document-extraction-secondary.test.ts` source assertions for remaining callsites, production direct-import drift, and provider metadata absence in normal secondary UI.

## Task Commits

1. **Tasks 1-2: Align secondary extraction callsites and source assertions** - `b057c57` (`feat`)
2. **Task 3: Verification and summary** - covered by verification below; summary metadata committed separately.

**Plan metadata:** committed after this summary.

## Files Created/Modified

- `src/pages/CareerCompass.tsx` - Uses shared extraction for resume and LinkedIn PDFs; removes local OCR image helper and raw PDF text import.
- `src/pages/Profile.tsx` - Uses shared extraction for LinkedIn PDF uploads before accepted profile writes.
- `src/pages/RecruitingLens.tsx` - Uses shared extraction for the LinkedIn PDF optional input.
- `src/pages/Jobs.tsx` - Uses shared extraction for PDF resume text before job matching.
- `src/components/ActionFirstHero.tsx` - Uses shared extraction for unauthenticated hero resume analysis.
- `src/components/MinimalHero.tsx` - Uses shared extraction for authenticated and unauthenticated hero resume analysis, passing `resumeId` after row creation.
- `src/pages/__tests__/document-extraction-secondary.test.ts` - Adds secondary source assertions and drift guards.

## Direct Import Audit

- **Production pages/components:** no direct `@/lib/extract-pdf-text` imports remain.
- **Allowlisted direct imports:** none in production pages/components.
- **Expected non-production matches:** the unfiltered scan reports assertion strings in `src/pages/__tests__/document-extraction-primary.test.ts`; these are tests validating the helper boundary, not production imports.

## Verification

- `npm.cmd run test -- --run src/pages/__tests__/document-extraction-secondary.test.ts` - PASS outside sandbox, 1 file / 4 tests.
- `npm.cmd run test -- --run src/pages/__tests__/document-extraction-primary.test.ts src/pages/__tests__/document-extraction-secondary.test.ts` - PASS outside sandbox, 2 files / 9 tests.
- `npm.cmd run build -- --outDir dist-codex --emptyOutDir=true` - PASS outside sandbox. Vite emitted existing warnings for ambiguous Tailwind class, plugin timings, and chunk size.
- `rg -n 'from [''\\\"]@/lib/extract-pdf-text' src/pages src/components` - PASS with expected test-only matches in `document-extraction-primary.test.ts`.
- `rg -n -g '!**/__tests__/**' 'from [''\\\"]@/lib/extract-pdf-text' src/pages src/components` - PASS, no production matches.
- `rg -n 'ollama|claude_ocr|attemptedProviders|provider used' src/pages src/components` - PASS with expected test-only matches in primary/secondary source assertions.
- `rg -n -g '!**/__tests__/**' 'ollama|claude_ocr|attemptedProviders|provider used' src/pages src/components` - PASS, no production UI matches.

## Deviations from Plan

### Auto-fixed Issues

None.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** Plan scope completed without scope expansion.

## Issues Encountered

- Sandbox execution blocked Vitest/build startup with Windows native binding `spawn EPERM`; reran required `npm.cmd run test` and `npm.cmd run build` commands outside the sandbox.
- `npm.cmd run build -- --outDir dist-codex --emptyOutDir=true` generated tracked/untracked `dist-codex` artifacts; those verification outputs were removed/restored because `dist-codex` is outside the plan's declared file scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All Phase 50 plans now have summaries on disk. Phase 50 is ready for execute-phase orchestration close-out and `$gsd-verify-work 50`.

---
*Phase: 50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf*
*Completed: 2026-06-05*

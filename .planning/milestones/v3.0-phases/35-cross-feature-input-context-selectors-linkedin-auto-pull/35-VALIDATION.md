---
phase: 35
slug: cross-feature-input-context-selectors-linkedin-auto-pull
date: 2026-05-22
status: validated
nyquist_compliant: true
last_audit: 2026-06-01
---

# Phase 35 Validation Strategy

## Validation Architecture

Phase 35 validation proves that prior selectors are reusable, default to the newest usable prior, do not override deep-link hydration, and preserve existing optional/required input contracts.

## Required Automated Verification

- `npm run lint`
- `npm run build`
- `npm run test -- PriorAnalysisSelector`
- `npm run test -- PriorLinkedInSelector`
- `npm run test -- LinkedInGrader`

## Required Source Assertions

- `src/components/PriorAnalysisSelector.tsx` queries `resumes` with `grading_data IS NOT NULL`, newest-first ordering, and `limit(10)`.
- `src/components/PriorLinkedInSelector.tsx` includes both `profiles.linkedin_pdf_*` and v3 `linkedin_grades` rows, sorted newest-first.
- `src/pages/LinkedInGrader.tsx` skips profile auto-pull when `?id=` is present.
- `src/pages/LinkedInGrader.tsx` updates all three fields: `linkedin_pdf_content`, `linkedin_pdf_filename`, `linkedin_pdf_updated_at`.
- `src/pages/RecruitingLens.tsx` keeps `linkedinText` optional in the `recruiting-lens` invoke body.
- `src/pages/InterviewPrep.tsx` verification notes remain staging-only while Phase 47 production gate is active.

## Required Manual QA

Record results in `35-QA-CHECKLIST.md`.

| Scenario | Expected |
|----------|----------|
| RCL with resume and LinkedIn priors | Both selectors default to newest prior; submit is enabled after job description exists |
| RCL with resume but no LinkedIn | Resume selector defaults; non-blocking LinkedIn CTA appears; submit remains possible |
| RCL with no resume | Blocking resume empty-state appears; CTA navigates to `/upload` |
| LIG with onboarding PDF and no deep-link | Paste mode opens with stored content pre-filled |
| LIG PDF replacement succeeds | New `profiles.linkedin_pdf_*` values are written after grade success |
| LIG PDF replacement fails grade | `profiles.linkedin_pdf_*` values are not overwritten |
| CC with priors | Existing most-recent defaults remain and selectors allow override |
| IP staging/dev with resume priors | Resume selector renders and defaults to latest analyzed resume |

## Requirement Coverage Map

| Requirement | Behavior | Test file | Status |
|-------------|----------|-----------|--------|
| CTX-01 | LinkedInGrader onboarding PDF auto-pull + success-only `linkedin_pdf_*` update | `src/pages/__tests__/LinkedInGrader.linkedin-pdf-source.test.ts` | COVERED |
| CTX-02 | RecruitingLens defaults to priors; LinkedIn optional; submit gated by resume + job description | `src/pages/__tests__/RecruitingLens.prior-selectors.test.ts` | COVERED |
| CTX-03 | CareerCompass selector parity, non-blocking LinkedIn | `src/pages/__tests__/CareerCompass.prior-selectors.test.ts` | COVERED |
| CTX-04 | InterviewPrep staging resume selector parity | `src/pages/__tests__/InterviewPrep.prior-selector.test.ts` | COVERED |
| CTX-05 | `<PriorAnalysisSelector>` newest-first resume prior, default selection | `src/components/__tests__/PriorAnalysisSelector.test.tsx` | COVERED |
| CTX-06 | `<PriorLinkedInSelector>` onboarding PDF + v3 grades merge, legacy filtering | `src/components/__tests__/PriorLinkedInSelector.test.tsx` | COVERED |
| CTX-07 | Empty-state CTAs route to `/upload` / `/linkedin-grader` | Covered across selector + host-page tests above | COVERED |

## Failure Handling

Selector query errors should not fail the page. They should log a warning and render the same empty-state path as zero priors. LinkedInGrader post-grade profile update errors should log a warning and not show a toast because the user already received the grade.

## Validation Audit 2026-06-01

| Metric | Count |
|--------|-------|
| Requirements audited | 7 |
| Gaps found | 1 |
| Resolved | 1 |
| Escalated | 0 |

CTX-02's `RecruitingLens.prior-selectors.test.ts` failed on a stale source-contract citation: it asserted a verbatim inline `disabled={!hasAnalyzedResume || !jobDescription.trim()` expression that was refactored into a derived `isFormReady` boolean (`src/pages/RecruitingLens.tsx:299-303`, submit gated at line 927). The behavioral contract (analyzed resume + non-empty job description required to submit; LinkedIn optional) was unchanged. Repaired the assertion to target the `isFormReady` derivation and `disabled={!isFormReady` gating. All 6 phase-35 test files / 12 tests green.

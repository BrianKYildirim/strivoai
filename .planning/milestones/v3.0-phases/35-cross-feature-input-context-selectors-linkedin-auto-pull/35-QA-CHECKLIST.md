---
phase: 35-cross-feature-input-context-selectors-linkedin-auto-pull
status: passed
updated: 2026-06-08
---

# Phase 35 QA Checklist

## Automated Commands

| Command | Date | Environment | Status | Notes |
| --- | --- | --- | --- | --- |
| `npm run build` | 2026-05-22 | local Windows / Node | Pass | Vite build completed. Warnings: existing ambiguous Tailwind class and large chunks. |
| `npm run test -- PriorAnalysisSelector` | 2026-05-22 | local Vitest jsdom | Pass | Included in combined selector/page run. |
| `npm run test -- PriorLinkedInSelector` | 2026-05-22 | local Vitest jsdom | Pass | Included in combined selector/page run. |
| `npm run test -- LinkedInGrader` | 2026-05-22 | local Vitest jsdom | Pass | Included existing and Phase 35 tests. |
| `npm run test -- RecruitingLens` | 2026-05-22 | local Vitest jsdom | Pass | Included existing and Phase 35 tests. |
| `npm run test -- CareerCompass` | 2026-05-22 | local Vitest jsdom | Pass | Included existing and Phase 35 tests. |
| `npm run test -- InterviewPrep` | 2026-05-22 | local Vitest jsdom | Pass | Existing no-resume copy test updated for Phase 35 shared empty state. |
| `npm run test -- PriorAnalysisSelector PriorLinkedInSelector LinkedInGrader RecruitingLens CareerCompass InterviewPrep` | 2026-05-22 | local Vitest jsdom | Pass | 20 test files / 90 tests passed. |
| `npm run lint` | 2026-05-22 | local ESLint | Blocked | Timed out after 124 seconds before producing diagnostics. |
| Targeted ESLint for new selectors and new tests | 2026-05-22 | local ESLint | Pass | `npx eslint` on new selector components and new Phase 35 tests exited 0. |

## Manual Route Smoke

Manual authenticated route smoke was operator-confirmed passed on 2026-06-08.

| Scenario | Route | Fixture | Expected Result | Actual Result | Status |
| --- | --- | --- | --- | --- | --- |
| RCL with resume and LinkedIn priors | `/recruiting-lens` | user with resume analysis plus onboarding PDF or v3 LinkedIn grade | Both selectors default; analyze enabled after JD | Pass per operator smoke 2026-06-08 | Pass |
| RCL with resume only | `/recruiting-lens` | user with resume analysis and no LinkedIn source | Resume defaults; LinkedIn empty-state non-blocking | Pass per operator smoke 2026-06-08 | Pass |
| RCL with no resume | `/recruiting-lens` | user with no resume analysis | Blocking `/upload` CTA; submit disabled | Pass per operator smoke 2026-06-08 | Pass |
| LIG stored onboarding PDF auto-pull | `/linkedin-grader` | user with `profiles.linkedin_pdf_content` | Paste mode prefilled, no banner | Pass per operator smoke 2026-06-08 | Pass |
| LIG replacement success timing | `/linkedin-grader` | user uploads replacement PDF and grade succeeds | `profiles.linkedin_pdf_*` updated after success | Pass per operator smoke 2026-06-08 | Pass |
| LIG replacement failure timing | `/linkedin-grader` | grade fails after PDF extraction | `profiles.linkedin_pdf_*` unchanged | Pass per operator smoke 2026-06-08 | Pass |
| CC with priors | `/career-compass` | user with resume and LinkedIn priors | Selectors default saved state; submit available with resume | Pass per operator smoke 2026-06-08 | Pass |
| IP staging/dev selector parity | `/interview-prep` with flag enabled | Pro/Elite user with resume prior | Selector appears and form remains usable | Pass per operator smoke 2026-06-08 | Pass |


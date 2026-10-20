# Phase 35: Cross-Feature Input Context - Research

**Date:** 2026-05-22
**Status:** Complete

## Research Scope

Phase 35 is a frontend integration phase. It does not need schema work. The core work is to normalize how existing prior inputs are discovered and selected across LinkedIn Grader, Recruiting Lens, Career Compass, and Interview Prep while preserving existing manual upload/paste paths.

Primary requirements covered: CTX-01, CTX-02, CTX-03, CTX-04, CTX-05, CTX-06, CTX-07.

## Current Implementation Findings

### LinkedIn Grader

`src/pages/LinkedInGrader.tsx` already has:

- `profileContent` state for pasted profile text.
- `inputMode` state with `pdf | paste`, defaulting to `pdf`.
- deep-link hydration from `?id=<linkedin_grade_id>`.
- a mount effect that sets subscription/entitlement and optionally loads the latest grade.
- `handleAnalyze()` that extracts PDF text locally or uses pasted text, then invokes `grade-linkedin`.

Planning implication: CTX-01 should add a profile read to the existing mount flow, but must respect `skipCacheRestore` when `?id=` is present. Auto-pull should set `profileContent` and `inputMode='paste'` only when there is stored `profiles.linkedin_pdf_content` and no deep-link. Replacement persistence should happen only after successful grade response, and must not block the result display.

### Recruiting Lens

`src/pages/RecruitingLens.tsx` currently:

- fetches profile tier and the latest resume in parallel.
- uses `resumes.grading_data` first and falls back to `analysis_results.raw_response`.
- derives `resumeSummary` via `buildResumeSummary(rawResp)`.
- treats `linkedinText` as optional in the edge payload.
- has a right-column resume empty-state card and disables submit when no resume exists.

Planning implication: RCL is the heaviest integration point. It needs both selectors mounted in the form area, the resume selector must populate `resumeSummary` and filename, and the LinkedIn selector must populate `linkedinText`. Missing resume remains blocking. Missing LinkedIn should be non-blocking to preserve current optional-input behavior from D-09.

### Career Compass

`src/pages/CareerCompass.tsx` already:

- fetches profile, latest resume, and cached analysis in parallel.
- reads `profiles.linkedin_pdf_content` and `profiles.linkedin_pdf_filename`.
- saves LinkedIn PDF replacement to `profiles.linkedin_pdf_*` in its submit path.
- already blocks submit if no resume or LinkedIn PDF/content exists.
- has a missing-prior state for backend 412 responses.

Planning implication: CTX-03 is primarily verification, but selector mounting still belongs here for CTX-05/06. The selector must not break the existing saved resume and LinkedIn PDF upload flow. The page can either pass existing state into selectors or let selectors self-fetch. A self-fetching selector plus explicit `onSelect` callbacks is the least invasive cross-page pattern.

### Interview Prep

`src/pages/InterviewPrep.tsx` already:

- fetches tier and the latest analyzed resume on mount.
- sets `hasResume` from `resumes.grading_data`.
- shows an error state with an "Analyze my resume" CTA when no resume exists.

Planning implication: CTX-04 is staging-only verification because production Interview Prep is gated by Phase 47. CTX-05 still requires selector parity in the form area; the implementation should mount `<PriorAnalysisSelector>` only on the input surface that exists in staging/dev and preserve the production gate behavior.

### Existing Prior Query Pattern

`src/components/AnalysisComparisonModal.tsx` is the canonical query source:

- Resume rows: `resumes.select('id, overall_score, grading_data, created_at, file_name')`, `user_id`, `grading_data IS NOT NULL`, ordered by `created_at desc`, `limit(10)`.
- LinkedIn rows: `linkedin_grades.select('id, overall_score, grading_data, created_at')`, `user_id`, ordered by `created_at desc`, `limit(10)`, then filter rows where `grading_data.rawScore` is a number and `grading_data.sectionBreakdown` is an array.

Planning implication: keep the row limit at 10, use the v3 filter for LinkedIn grades, and add the onboarding PDF as one extra pseudo-row from `profiles.linkedin_pdf_*`.

## Recommended Design

Create focused, shared selector modules:

- `src/components/PriorAnalysisSelector.tsx`
- `src/components/PriorLinkedInSelector.tsx`
- `src/components/PriorSelectorEmptyState.tsx`
- `src/components/PriorSelectorSkeleton.tsx`

Use self-fetching selectors with controlled callbacks:

- `PriorAnalysisSelector` fetches up to 10 resume rows and auto-selects the newest row unless a host value is supplied. `onSelect(prior)` passes the row to the host page.
- `PriorLinkedInSelector` fetches profile onboarding PDF plus up to 10 v3 LinkedIn grade rows, merges and sorts by timestamp, auto-selects the newest source, and passes a normalized prior to the host page.

Normalized prior types should include only frontend-needed fields:

- Resume prior: `id`, `fileName`, `analyzedAt`, `overallScore`, `gradingData`.
- LinkedIn prior: `id`, `sourceType: 'profile_pdf' | 'grade'`, `identifier`, `createdAt`, `overallScore`, `content`, `gradingData`.

For LinkedIn grade rows, use `grading_data.profileContent` only if present. If historical grades do not contain source text, selecting them can still show metadata but should not populate `linkedinText`; the plan should either disable those items or degrade to onboarding PDF/manual input. The safer executor task is to inspect persisted grade shape before finalizing the callback behavior.

## Validation Architecture

Validation should combine static/unit checks with manual smoke because this is cross-page form behavior.

Automated checks:

- `npm run lint`
- `npm run build`
- Vitest coverage for selector rendering, default selection, score/date display, empty state, and callbacks.
- A LinkedInGrader test with mocked Supabase and `invokeWithTimeout` proving:
  - stored `profiles.linkedin_pdf_content` sets paste mode and textarea content on mount when no `?id=` is present.
  - a successful PDF analyze triggers a post-success `profiles.linkedin_pdf_*` update.
  - a failed analyze does not update `profiles`.

Manual smoke:

- User with resume + onboarding LinkedIn PDF: RCL defaults both selectors and can analyze with LinkedIn optional.
- User with resume only: RCL can analyze and shows non-blocking LinkedIn CTA.
- User with no resume: RCL/IP/CC show blocking resume empty-state with `/upload` CTA.
- Career Compass still defaults most-recent priors and allows selector override.
- Interview Prep selector parity verified on staging/dev only; production surface remains gated by Phase 47.

## Risks and Pitfalls

- Deep-link pages must not be overwritten by auto-default selector hydration.
- RCL LinkedIn must remain optional; blocking it would regress current behavior.
- `profiles.linkedin_pdf_*` update in LIG must occur only after a successful grade.
- Selector fetch errors should not create noisy toasts; empty-state fallback plus `console.warn` is sufficient.
- Reusing `created_at` instead of `analyzed_at` for resumes may miss the CTX-05 display requirement. The executor should query `analyzed_at` if present and fall back to `created_at`.
- CTX-04 production verification is explicitly out of scope while Phase 47 keeps Interview Prep gated.

## Recommended Plan Decomposition

1. Shared prior selector components and tests.
2. LinkedInGrader auto-pull and replacement persistence.
3. Recruiting Lens selector integration and RCL empty-state behavior.
4. Career Compass and Interview Prep selector integration plus CTX-03/04 preservation.
5. Cross-feature tests and manual QA checklist.

## RESEARCH COMPLETE

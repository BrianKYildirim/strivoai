# Phase 35 Pattern Map

**Date:** 2026-05-22

## Files to Create

### `src/components/PriorAnalysisSelector.tsx`

Closest analogs:

- `src/components/AnalysisComparisonModal.tsx` for prior resume queries and score/date display.
- `src/components/ui/select.tsx` for shadcn select composition.
- `src/pages/RecruitingLens.tsx` for 32-character truncation of file names.

Expected role:

- Self-fetch authenticated user's prior resume analyses.
- Render label `Use a prior resume analysis`.
- Auto-select newest prior and call `onSelect`.
- Render skeleton while loading and empty-state when none/error.

### `src/components/PriorLinkedInSelector.tsx`

Closest analogs:

- `src/components/AnalysisComparisonModal.tsx` for v3 LinkedIn grade filtering.
- `src/pages/CareerCompass.tsx` for `profiles.linkedin_pdf_content` and filename handling.
- `src/pages/LinkedInGrader.tsx` for LinkedIn grade shape.

Expected role:

- Fetch `profiles.linkedin_pdf_content`, `linkedin_pdf_filename`, `linkedin_pdf_updated_at`.
- Fetch up to 10 `linkedin_grades` rows and filter to v3-shaped rows.
- Merge onboarding PDF pseudo-row with grade rows, sort newest-first, and call `onSelect`.
- Represent onboarding PDF score as `-`.

### `src/components/PriorSelectorEmptyState.tsx`

Closest analog:

- `src/pages/RecruitingLens.tsx` right-column empty-state card.

Expected role:

- Shared `Card` + icon + text + `Button` CTA.
- `blocking=true` uses default button; `blocking=false` uses outline button.
- Hosts decide whether the card replaces the full form or only a selector slot.

### `src/components/PriorSelectorSkeleton.tsx`

Closest analog:

- Existing shadcn `Skeleton` usage if present; otherwise use `src/components/ui/skeleton.tsx`.

Expected role:

- Stable full-width `h-10 rounded-md` placeholder matching select trigger height.

## Files to Modify

### `src/pages/LinkedInGrader.tsx`

Pattern:

- Extend the existing mount effect that already has `skipCacheRestore`.
- Select `subscription_tier, linkedin_pdf_content, linkedin_pdf_filename, linkedin_pdf_updated_at` from `profiles`.
- When no `?id=` and content exists, set `profileContent` and `inputMode='paste'`.
- In `handleAnalyze`, remember the extracted PDF text and selected file name. After a successful grade response, run a non-blocking `profiles.update({ linkedin_pdf_content, linkedin_pdf_filename, linkedin_pdf_updated_at })`.

### `src/pages/RecruitingLens.tsx`

Pattern:

- Replace single latest-resume card with `PriorAnalysisSelector`.
- Add `PriorLinkedInSelector` near existing optional LinkedIn collapsible.
- Keep `linkedinText: linkedinText.trim() || undefined`.
- Replace the resume empty-state card with `PriorSelectorEmptyState` and `/upload` CTA.
- Add non-blocking LinkedIn empty-state/CTA to `/linkedin-grader` when no LinkedIn sources exist.

### `src/pages/CareerCompass.tsx`

Pattern:

- Mount both selectors in the existing form card above manual upload controls.
- Preserve current saved resume and saved LinkedIn PDF state names because submit logic already depends on them.
- For resume selector, update saved resume file path/name if available and keep upload as replacement path.
- For LinkedIn selector, populate `savedLinkedinContent` and `savedLinkedinFilename`.

### `src/pages/InterviewPrep.tsx`

Pattern:

- Mount `PriorAnalysisSelector` in the intake/form area visible in staging/dev.
- Keep the no-resume error copy and CTA aligned to `PriorSelectorEmptyState`.
- Do not re-enable production Interview Prep surfaces.

## Data Contracts

Resume select fields should include:

- `id`
- `file_name`
- `overall_score`
- `grading_data`
- `created_at`
- `analyzed_at` if the column is available in generated types/current schema
- `file_path` if host pages need it

LinkedIn select fields should include:

- Profile: `linkedin_pdf_content`, `linkedin_pdf_filename`, `linkedin_pdf_updated_at`
- Grade: `id`, `overall_score`, `grading_data`, `created_at`

## Verification Patterns

- Component tests mock `supabase.auth.getUser()` and chained query builders.
- Page tests mock selector `onSelect` callbacks where full Supabase setup would be too expensive.
- Manual QA covers route-level behavior and production/staging gates.

## PATTERN MAPPING COMPLETE

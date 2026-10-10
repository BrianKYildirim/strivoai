# 37-04 Summary - Recruiting Lens

## Status

Completed inline fallback execution for Plan 37-04.

## Implemented

- Added mandatory `Company name`, `Role title`, and `Job Description` controls to `/recruiting-lens`.
- Added submit-time `RecruitingLensTutorialModal` with localStorage-backed dismissal, skippable flow, and persistent `View tutorial` affordance.
- Added saved Recruiting Lens tiles below the new-analysis form, backed by `saved_jobs`, with keyboard-actionable deep-link hydration through `/recruiting-lens?id=<analysis_results.id>`.
- Added backend validation for company, role title, and job description.
- Updated sync persistence so successful runs write `analysis_results`, refresh the matching `saved_jobs` row, then write linked usage through `recordUsageWithAnalysis`.
- Added CACHE-07 keying through `computeCacheKey` using resume summary hash, job description hash, LinkedIn text hash, company, role title, tier, and a stable Recruiting Lens variant.
- Added merit-gateway `precheck_cache` integration so cache hits bypass AI/deduction, refresh cache hit metadata, refresh the saved tile, and surface through Activity History.
- Extended queued Recruiting Lens payload forwarding to normalize `role_title` to `roleTitle`; the worker still delegates completion persistence/cache behavior to the target function and preserves existing queued retry/deep-link email semantics.
- Added targeted frontend, sync backend, and worker regression tests.

## Verification

- Passed: `npx.cmd eslint src/pages/RecruitingLens.tsx src/components/RecruitingLensTutorialModal.tsx`
- Passed: `npm.cmd run test -- RecruitingLens.saved-jobs-tutorial`
- Passed: `deno.cmd test --allow-read --allow-env --allow-net supabase/functions/recruiting-lens/cache-saved-jobs.test.ts supabase/functions/process-recruiting-lens-job/cache-saved-jobs.test.ts`
- Passed: `npm.cmd run build -- --outDir dist-codex --emptyOutDir=true`

## Manual QA Path

Not executed in this inline run because no authenticated browser session or deployed Supabase environment was provided. Manual QA should cover:

1. First valid submit opens the tutorial before analysis; `Skip tutorial` and `Start job analysis` both persist dismissal.
2. A successful fresh run creates or refreshes one saved tile below the form.
3. Clicking the tile opens `/recruiting-lens?id=<analysis_results.id>` and hydrates the existing result view.
4. Repeating identical company, role, JD, resume, LinkedIn, and tier inputs returns a normal successful cache-hit result, refreshes the existing tile instead of duplicating it, and adds an Activity History row.
5. A queued fallback job completes through `process-recruiting-lens-job` and the completion email links to `/recruiting-lens?id=<analysis_results.id>`.

## Notes

- `saved_jobs` has no dedicated `analysis_id` column in the current generated schema. The implementation uses existing nullable `saved_jobs.job_id` as the reference to the originating `analysis_results.id`.
- The generated `dist-codex` build output was removed after verification and is not part of the change.

# Phase 37 Plan 37-02 Summary - LinkedIn Grader

## Status

Implemented. Automated targeted verification passed. Manual QA path is recorded below and remains to be run in an authenticated environment.

## Changes

- Removed the active "What's Working For You" / `profileInsights` result rendering from `LinkedInGrader.tsx`; legacy `profileInsights` payloads are still tolerated for comparison data.
- Preserved LinkedIn onboarding PDF auto-pull and success-only replacement persistence paths, including `skipCacheRestore` deep-link ownership.
- Updated LinkedIn prompts so no tier requests `profileInsights`.
- Enforced tiered Ready-to-Paste output:
  - Free validates exactly 1 real `topFixes` entry.
  - Pro/Elite validate 4-7 visible `topFixes` entries.
  - Frontend renders 1 real Free fix plus 4 `BlurredLockCard` placeholders, and renders all backend-supplied Pro/Elite fixes.
- Added CACHE-05 integration for the merit path:
  - Uses `computeCacheKey` with `profileContent_hash`, `profileUrl`, `prior_grade_id`, and resolved tier.
  - Reads `analysis_cache` through `withMerits` `precheck_cache` so hits bypass Anthropic and merit deduction.
  - Updates `last_hit_at` / `hit_count` on hits.
  - Writes cache best-effort only after `linkedin_grades` persistence and linked usage recording.

## Verification

- Passed: `npx.cmd eslint src/pages/LinkedInGrader.tsx`
- Passed: `npm.cmd run test -- LinkedInGrader.output-parity`
- Passed: `deno.cmd test --allow-read --allow-env --allow-net supabase/functions/grade-linkedin/prompts.test.ts supabase/functions/grade-linkedin/validation.test.ts supabase/functions/grade-linkedin/cache.test.ts`

## Manual QA Path

Not run in this execution session.

1. Load `/linkedin-grader` as a user with saved `profiles.linkedin_pdf_content`; confirm the saved PDF content pre-populates normal loads.
2. Open `/linkedin-grader?id=<linkedin_grade_id>`; confirm deep-link hydration owns the page state and auto-pull/cache restore does not overwrite the selected grade.
3. Upload a replacement LinkedIn PDF and run a successful grade; confirm `profiles.linkedin_pdf_content`, filename, and updated timestamp change only after success.
4. Load an old persisted grade containing `profileInsights`; confirm "What's Working For You" is absent, no orphan heading appears, and `Key Strengths` still renders.
5. Confirm Free shows 1 visible Ready-to-Paste improvement plus 4 locked placeholders.
6. Confirm Pro shows 4-7 visible Ready-to-Paste improvements with no locked placeholders.
7. Confirm Elite shows the full/highest-tier Ready-to-Paste output.
8. Repeat an identical grade with the same profile content, profile URL, prior grade, and tier; confirm the second run returns as a normal successful grade from cache.
9. Repeat with a different prior grade context; confirm the cache key misses and a fresh grade is generated.

## Notes

- Existing unrelated worktree changes were present in `.planning`, `.claude/worktrees`, Career Compass, Recruiting Lens, and other files. They were not reverted or included in this plan's code commit.

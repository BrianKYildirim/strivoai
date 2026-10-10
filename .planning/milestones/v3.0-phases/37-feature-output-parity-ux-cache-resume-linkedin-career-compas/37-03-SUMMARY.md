# Phase 37 Plan 37-03 Summary - Career Compass

## Status

Implemented. Automated targeted verification passed. Manual authenticated/staging TEST-06 remains blocked by lack of live credentials/session in this execution environment.

## Root Cause

CC-11 was caused by both display and generation guard gaps:

- Frontend deep-link hydration for `/career-compass?id=<analysis_id>` required `careerFields`, `roles`, `roadmap`, and `careerDNA` before loading the row. Old or partial persisted/cache rows failed that shape guard and surfaced only "Couldn't load this analysis" instead of a recoverable partial report.
- Backend Pro/Elite generation paths shaped and persisted successful outputs without a final six-section validation gate. A repaired/truncated AI response could therefore be saved even when one of Best-Fit Roles, Surprise Fits, Fields, Roles, Readiness, or Roadmap was absent.

## Changes

- Relaxed Career Compass `?id=` hydration to accept recognizable legacy partial payloads while rejecting unrelated payloads.
- Added partial-report recovery UX:
  - Global amber warning: "This analysis is partial. Some sections were created before the full report format was available."
  - Per-section fallback card with "This section is incomplete", repair copy, and `Re-run for full report`.
  - The recovery CTA returns to the editable form state and does not call AI or spend merits.
- Updated Free Career Compass parity:
  - Best-Fit Roles: 3 real entries plus 2 locked placeholders.
  - Surprise Fits: 2 real entries plus 2 locked placeholders.
  - Fields: 3 real entries plus 2 locked placeholders.
  - Roles: 3 real entries plus 2 locked placeholders.
  - Roadmap: fully fake locked roadmap skeleton; generated roadmap content is not exposed to Free.
- Added paid-output strictness in `analyze-career` before persistence/cache writes for all six core sections.
- Added CACHE-06 wiring in `analyze-career` using `computeCacheKey`, `analysis_cache`, and `withMerits` `precheck_cache` for the merit-owned direct path, with variants for Free single-call, Pro/Elite short-circuit, Pro/Elite full, and multi-role compare.
- Added/updated regression coverage for partial output UX, Free skeleton counts, paid strictness, cache key behavior, and the shared Career Compass tier shaper.

## Verification

- Passed: `npx.cmd eslint src/pages/CareerCompass.tsx src/components/career-compass/*.tsx`
- Passed: `npm.cmd run test -- partial-output`
- Passed: `npm.cmd run test -- career-compass`
- Passed: `deno.cmd test --allow-read --allow-env --allow-net supabase/functions/analyze-career/paid-output-validation.test.ts supabase/functions/analyze-career/cache.test.ts`
- Passed: `deno.cmd test --allow-read --allow-env supabase/functions/_shared/career-shape.test.ts`

## Manual QA Path

Not run in this execution session; blocked by missing authenticated/staging session and live service credentials.

1. Load an old partial Career Compass result by `/career-compass?id=<analysis_id>` and confirm it renders the partial warning plus fallback cards instead of "Couldn't load this analysis".
2. Click `Re-run for full report`; confirm the user lands on the editable form with saved resume/LinkedIn inputs still available and no analysis request starts.
3. Run a Free Career Compass analysis; confirm Career DNA, 3+2 Best-Fit Roles, 2+2 Surprise Fits, 3+2 Fields, 3+2 Roles, Readiness score with locked details, and fake locked Roadmap.
4. Run a Pro or Elite Career Compass analysis; confirm raw_response and UI include Best-Fit Roles, Surprise Fits, Fields, Roles, Readiness, and Roadmap.
5. Repeat identical paid inputs; confirm the second run returns through the normal successful result surface from cache and does not spend merits.
6. Repeat with changed resume text, LinkedIn text, LinkedIn URL, tier, compare roles, and `allowResumeOnly`; confirm cache keys miss when inputs differ.

## Notes

- Existing unrelated worktree changes were present in `.planning`, `.claude/worktrees`, `src/pages/Results.tsx`, and prior Phase 36 artifacts. They were not reverted.
- A small shared helper change was required in `supabase/functions/_shared/result-merger.ts` because `applyCareerTierShape` was the existing server-side Free output shaper that previously dropped Surprise Fits and sliced Career Compass fields/roles to one entry.

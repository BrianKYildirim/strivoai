---
phase: 16-linkedin-grader-gating
plan: 01
subsystem: api
tags: [tier-config, deno, edge-functions, linkedin-grader, haiku]

# Dependency graph
requires:
  - phase: 14-tier-prompts-and-locked-section-primitive
    provides: tier-config.ts with Tier type, getModel, FEATURE_MODEL_OVERRIDES
provides:
  - "resolveTier(userId) shared helper for server-side tier resolution (D-08)"
  - "linkedin model override in FEATURE_MODEL_OVERRIDES mapping all tiers to Haiku 4.5 (D-04)"
affects: [16-02-prompts, 16-03-handler, 17-recruiting-lens, 18-interview-prep]

# Tech tracking
tech-stack:
  added: []
  patterns: ["source-analysis Deno tests that read module source and assert structural properties"]

key-files:
  created:
    - supabase/functions/_shared/resolve-tier.ts
    - supabase/functions/_shared/resolve-tier.test.ts
  modified:
    - supabase/functions/_shared/tier-config.ts
    - supabase/functions/_shared/tier-config.test.ts

key-decisions:
  - "Used maybeSingle() instead of single() for graceful fallback to free tier on missing profile row"
  - "Used source-analysis test pattern (read file, assert on content) for resolve-tier tests to avoid needing live Supabase connection"
  - "LinkedIn Grader uses Haiku 4.5 for ALL tiers (free/pro/elite) per D-04 cost optimization"

patterns-established:
  - "resolve-tier pattern: shared helper for internal worker code paths that lack userContext from requireAuth"
  - "source-analysis testing: Deno.readTextFile + URL resolution for structural assertions without runtime dependencies"

requirements-completed: [BACK-09, LIG-07]

# Metrics
duration: 2min
completed: 2026-04-17
---

# Phase 16 Plan 01: Shared Tier Resolution and LinkedIn Model Override Summary

**DRY resolveTier(userId) helper querying profiles.subscription_tier with maybeSingle fallback, plus linkedin model override routing all tiers to Haiku 4.5**

## Performance

- **Duration:** 1m 40s
- **Started:** 2026-04-17T07:57:54Z
- **Completed:** 2026-04-17T07:59:34Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created shared `resolve-tier.ts` module (D-08) that reads `profiles.subscription_tier` via service client, defaults to 'free' on missing row or error
- Added `linkedin` entry to `FEATURE_MODEL_OVERRIDES` in `tier-config.ts` (D-04) routing pro and elite tiers to Haiku 4.5
- Added 6 source-analysis tests for resolve-tier.ts and 3 model-routing tests for D-04, all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create _shared/resolve-tier.ts and its test file** - `911eec4` (feat)
2. **Task 2: Add linkedin model override to tier-config.ts and update tests** - `c1a3370` (feat)

## Files Created/Modified
- `supabase/functions/_shared/resolve-tier.ts` - Shared tier resolution helper querying profiles table
- `supabase/functions/_shared/resolve-tier.test.ts` - 6 source-analysis Deno tests for D-08 structural requirements
- `supabase/functions/_shared/tier-config.ts` - Added linkedin entry to FEATURE_MODEL_OVERRIDES
- `supabase/functions/_shared/tier-config.test.ts` - Added 3 D-04 tests for linkedin model routing

## Decisions Made
- Used `maybeSingle()` instead of `single()` so missing profile rows gracefully default to 'free' rather than throwing (fail-closed on cost)
- Used source-analysis testing pattern (Deno.readTextFile + structural assertions) for resolve-tier since it requires Supabase service client at runtime
- Added JSDoc noting that handlers with requireAuth should use userContext.tier directly to avoid duplicate DB queries

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Threat Flags

No new threat surfaces found. resolve-tier.ts reads from server-side profiles table via service-role client (T-16-01 mitigated) and logs only userId and error message (T-16-02 mitigated).

## Next Phase Readiness
- resolve-tier.ts and linkedin model override ready for Plan 02 (prompts) and Plan 03 (handler)
- Plan 02 can import `resolveTier` for worker code paths and use `getModel(tier, 'linkedin')` for model selection

## Self-Check: PASSED

- All 5 files verified present on disk
- Commit 911eec4 (Task 1) verified in git log
- Commit c1a3370 (Task 2) verified in git log
- All 28 Deno tests pass (6 resolve-tier + 22 tier-config)

---
*Phase: 16-linkedin-grader-gating*
*Completed: 2026-04-17*

---
phase: 16-linkedin-grader-gating
plan: 03
subsystem: api
tags: [tier-gating, free-scan, strip, merit, linkedin-grader, defense-in-depth]

# Dependency graph
requires:
  - phase: 16-01
    provides: resolve-tier.ts, linkedin model override in tier-config.ts
  - phase: 16-02
    provides: Free/Pro/Elite prompt variants in prompts.ts with registerFeaturePrompts
provides:
  - "Tier-gated grade-linkedin handler with free-scan entitlement, per-tier maxTokens, strip for Free"
  - "stripLinkedInFreeTier defense-in-depth output shaping (LIG-01/LIG-02)"
  - "analyze-resume cleaned up tier resolution (D-09)"
affects: [17-career-compass-gating, 18-recruiting-lens-gating, 20-merit-ux]

# Tech tracking
tech-stack:
  added: []
  patterns: ["runTieredAiCall helper for Pitfall-4 mitigation (single tier-parameterized AI path)", "free-scan entitlement check before withMerits (D-14)"]

key-files:
  created:
    - supabase/functions/grade-linkedin/strip.test.ts
    - supabase/functions/grade-linkedin/free-scan.test.ts
  modified:
    - supabase/functions/grade-linkedin/index.ts
    - supabase/functions/grade-linkedin/handler-config.test.ts
    - supabase/functions/analyze-resume/index.ts

key-decisions:
  - "stripLinkedInFreeTier lives inline in index.ts (D-02) — exported for source-analysis tests"
  - "runTieredAiCall helper extracts AI call + validation + retry + strip into single function accepting tier parameter (Pitfall 4 mitigation)"
  - "Free-scan entitlement check runs BEFORE withMerits — if scan is free, withMerits is skipped entirely (D-14)"
  - "free_linkedin_scan_used flag flipped AFTER successful AI call (A3: safer ordering)"
  - "isFreeScanUsed defaults to true (safer — denies free scan on missing user_merits row)"
  - "analyze-resume tier resolution simplified from verbose 3-way check to (userContext?.tier as Tier) ?? 'free' (D-09)"
  - "5th strip test (tier conditional check) deferred from Task 1 to Task 2 since tier === 'free' string only exists after Merit branch restructuring"

patterns-established:
  - "storeAndNotify helper: DRY pattern for DB insert + email notification shared between free-scan and paid paths"
  - "Conditional withMerits bypass: free-scan entitlement check pattern reusable for other features with entitlements"

requirements-completed: [LIG-01, LIG-02, LIG-03, LIG-04, LIG-05, LIG-06, LIG-07, BACK-09]

# Metrics
duration: 9m 15s
completed: 2026-04-17
---

# Phase 16 Plan 03: Tier-Gated LinkedIn Handler with Free-Scan Entitlement Summary

**Tier-gated grade-linkedin handler with stripLinkedInFreeTier defense-in-depth, free-scan entitlement bypass before withMerits, per-tier maxTokens (4000/8192/8192), and runTieredAiCall helper for single tier-parameterized AI path**

## Performance

- **Duration:** 9m 15s
- **Started:** 2026-04-17T08:27:49Z
- **Completed:** 2026-04-17T08:37:04Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added `stripLinkedInFreeTier` function to `grade-linkedin/index.ts` (D-01, D-03): deletes profileInsights, truncates topFixes to first entry only, strips feedback arrays from sectionBreakdown — defense-in-depth against prompt leakage
- Restructured Merit branch with full tier gating: resolves tier from `userContext.tier` (D-08), loads tier-specific prompts via `loadPromptVariant('linkedin', tier, {})`, uses `getModel(tier, 'linkedin')` for model routing, applies `LINKEDIN_MAX_TOKENS[tier]` for per-tier token caps (4000/8192/8192)
- Implemented free-scan entitlement flow (D-05, D-14): checks `free_linkedin_scan_used` from `user_merits` before `withMerits`; Pro/Elite first scan per billing cycle skips Merit deduction entirely; flag flipped after successful AI call
- Extracted `runTieredAiCall` helper to prevent Pitfall 4 (all code paths using same tier-parameterized AI call logic)
- Simplified analyze-resume tier resolution to `(userContext?.tier as Tier) ?? 'free'` (D-09), removing verbose 3-way conditional pattern
- Created 5 strip.test.ts source-analysis tests covering LIG-01/LIG-02/LIG-03/LIG-04
- Created 7 free-scan.test.ts source-analysis tests covering LIG-05/LIG-06
- Updated handler-config.test.ts with 9 Phase 16 tier-aware assertions (LIG-07, BACK-09, D-05, D-14)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add stripLinkedInFreeTier and strip.test.ts** - `ee7fc5b` (feat)
2. **Task 2: Restructure Merit branch with tier gating, free-scan, per-tier config** - `a6c296a` (feat)
3. **Task 3: Clean up analyze-resume tier resolution (D-09)** - `d4746b5` (fix)

## Files Created/Modified

- `supabase/functions/grade-linkedin/index.ts` - Added stripLinkedInFreeTier, LINKEDIN_MAX_TOKENS, runTieredAiCall; restructured Merit branch with tier gating and free-scan entitlement
- `supabase/functions/grade-linkedin/strip.test.ts` - 5 source-analysis tests for LIG-01/LIG-02/LIG-03/LIG-04
- `supabase/functions/grade-linkedin/free-scan.test.ts` - 7 source-analysis tests for LIG-05/LIG-06
- `supabase/functions/grade-linkedin/handler-config.test.ts` - Added 9 Phase 16 tier-aware assertions
- `supabase/functions/analyze-resume/index.ts` - Simplified tier resolution to use Tier cast (D-09)

## Decisions Made

- **stripLinkedInFreeTier inline in index.ts:** Per D-02, the strip function is colocated with the feature handler. Exported for test access.
- **runTieredAiCall helper:** Addresses Pitfall 4 — both free-scan bypass and withMerits callback use the same tier-parameterized helper for AI call + validation + retry + strip.
- **Free-scan check before withMerits:** Per D-14, the entitlement check runs BEFORE entering withMerits to avoid incorrect Merit deduction for free scans.
- **Flag flip after AI success:** Per A3 (safer ordering), `free_linkedin_scan_used` is flipped to true only after the AI call succeeds. This prevents losing the free scan entitlement on a failed request.
- **isFreeScanUsed defaults to true:** If the `user_merits` row is missing, the safer default is to deny the free scan and route to the paid path.
- **storeAndNotify helper:** DRY extraction of DB insert + email notification logic, shared between the free-scan and paid paths.
- **Task 1 test deferral:** The 5th strip test (tier conditional check) was deferred from Task 1 to Task 2 because the `tier === 'free'` conditional call only exists after the Merit branch restructuring. This is a minor plan ordering deviation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Deferred 5th strip test from Task 1 to Task 2**
- **Found during:** Task 1
- **Issue:** Plan specified 5 strip tests in Task 1, but test 5 checks for `tier === 'free'` which only exists after Task 2's Merit branch restructuring
- **Fix:** Created 4 tests in Task 1, added the 5th test in Task 2 when the source pattern exists
- **Files modified:** supabase/functions/grade-linkedin/strip.test.ts
- **Commit:** a6c296a (Task 2)

**2. [Rule 2 - Missing] analyze-resume already used userContext.tier (not rawBody.tier)**
- **Found during:** Task 3
- **Issue:** Plan described replacing `rawBody.tier || 'free'` but Phase 15 commit 2f1bdc1 already replaced it with a verbose `userContext?.tier` pattern
- **Fix:** Simplified the existing verbose pattern to `(userContext?.tier as Tier) ?? 'free'` as intended by the plan. Functionally equivalent cleanup.
- **Files modified:** supabase/functions/analyze-resume/index.ts
- **Commit:** d4746b5

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Threat Flags

No new threat surfaces found beyond those documented in the plan's threat model. All mitigations implemented:
- T-16-05: Tier read from userContext.tier (never from request body)
- T-16-06: stripLinkedInFreeTier removes Pro-only fields server-side regardless of model output
- T-16-07: TOCTOU on free-scan accepted (worst case: 1 extra free scan per cycle)
- T-16-08: Input validation runs before any merit/tier logic
- T-16-09: analyze-resume D-09 cleanup removes client-supplied tier surface

## Known Stubs
None - all data paths are fully wired.

## Next Phase Readiness
- grade-linkedin handler is fully tier-gated and ready for deployment
- Phases 17-18 can follow the same pattern: resolve tier, load prompt variant, apply per-tier maxTokens, conditionally strip Free output
- Legacy path remains byte-identical for safe rollback via MERIT_SYSTEM_ENABLED flag

## Self-Check: PASSED

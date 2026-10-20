---
phase: 16-linkedin-grader-gating
plan: 02
subsystem: api
tags: [anthropic, prompts, tier-gating, linkedin, deno]

# Dependency graph
requires:
  - phase: 14-tier-prompts-and-locked-section-primitive
    provides: registerFeaturePrompts + PromptVariantBuilder from tier-prompts.ts
provides:
  - buildFreeSystemPrompt() for Free-tier LinkedIn grading (omits profileInsights, feedback, limits topFixes)
  - buildProSystemPrompt() renamed from original buildSystemPrompt (full Pro/Elite output)
  - LINKEDIN_PROMPT_VARIANTS map registered with tier-prompts loader
  - Backward-compatible buildSystemPrompt alias for legacy callers
affects: [16-linkedin-grader-gating]

# Tech tracking
tech-stack:
  added: []
  patterns: [tier-variant-prompts-linkedin, prompt-level-gating-free-tier]

key-files:
  modified:
    - supabase/functions/grade-linkedin/prompts.ts
    - supabase/functions/grade-linkedin/prompts.test.ts

key-decisions:
  - "Free prompt omits profileInsights entirely and removes feedback arrays from sectionBreakdown schema to enforce prompt-level gating (D-12)"
  - "Elite variant delegates to Pro builder since LinkedIn grader has no Elite-specific additions (D-10)"
  - "Kept deprecated buildSystemPrompt alias for backward compatibility with index.ts legacy path"

patterns-established:
  - "LinkedIn tier-variant prompts: Free omits locked fields at prompt level, Pro/Elite share same builder"

requirements-completed: [LIG-01, LIG-02, LIG-03, LIG-04]

# Metrics
duration: 2min
completed: 2026-04-17
---

# Phase 16 Plan 02: LinkedIn Prompt Tier Variants Summary

**Free/Pro/Elite LinkedIn prompt builders with tier-prompts loader registration and 9 variant unit tests**

## Performance

- **Duration:** 2 min (work previously completed and merged; this execution verified and documented)
- **Started:** 2026-04-17T09:19:10Z
- **Completed:** 2026-04-17T09:22:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created buildFreeSystemPrompt() that omits profileInsights, feedback arrays, and limits topFixes to 1 entry
- Renamed buildSystemPrompt to buildProSystemPrompt with backward-compatible deprecated alias
- Registered LINKEDIN_PROMPT_VARIANTS with registerFeaturePrompts('linkedin', ...) for tier-aware routing
- Added 9 new unit tests covering D-10, D-11, D-12, LIG-03 acceptance criteria (all 20 tests pass)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Free/Pro/Elite prompt variants and register with loader** - `b038d76` (feat)
2. **Task 2: Add prompt variant unit tests** - `6ffdec5` (test)

## Files Created/Modified
- `supabase/functions/grade-linkedin/prompts.ts` - Added buildFreeSystemPrompt(), renamed buildSystemPrompt to buildProSystemPrompt, added LINKEDIN_PROMPT_VARIANTS map, registered with tier-prompts loader
- `supabase/functions/grade-linkedin/prompts.test.ts` - Added 9 new tests for tier prompt variants (D-10, D-11, D-12, LIG-03)

## Decisions Made
- Free prompt omits profileInsights entirely and removes feedback arrays from sectionBreakdown to enforce prompt-level gating (D-12) -- reduces token cost and prevents Free-tier users from seeing locked content even if response parsing fails
- Elite variant delegates to Pro builder since LinkedIn grader has no Elite-specific additions (D-10)
- Kept deprecated buildSystemPrompt alias for backward compatibility with index.ts legacy path until Plan 03 migrates to loadPromptVariant

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Prompt variants are registered and ready for Plan 03 (handler integration) to call loadPromptVariant('linkedin', tier, {})
- Free-tier prompt-level gating is active; Plan 03 will add the server-side stripLinkedInFreeTier defense-in-depth layer

## Self-Check: PASSED

- [x] supabase/functions/grade-linkedin/prompts.ts exists
- [x] supabase/functions/grade-linkedin/prompts.test.ts exists
- [x] 16-02-SUMMARY.md exists
- [x] Commit b038d76 found (feat: prompt variants)
- [x] Commit 6ffdec5 found (test: variant tests)
- [x] All 20 deno tests pass (11 existing + 9 new)

---
*Phase: 16-linkedin-grader-gating*
*Completed: 2026-04-17*

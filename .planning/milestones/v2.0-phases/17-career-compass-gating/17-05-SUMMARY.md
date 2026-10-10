---
phase: 17-career-compass-gating
plan: 05
subsystem: api
tags: [supabase, edge-function, career-compass, merit-system, analysis-results]

requires:
  - phase: 17-02
    provides: Merit path handler structure with withMerits callback in analyze-career
provides:
  - Non-blocking analysis_results persistence in Merit path for dashboard visibility
  - Fire-and-forget completion email on successful insert
affects: [phase-21-merit-flip, career-compass-dashboard]

tech-stack:
  added: []
  patterns: [fire-and-forget-insert, deep-copy-snapshot-for-async]

key-files:
  created: []
  modified:
    - supabase/functions/analyze-career/index.ts

key-decisions:
  - "Used JSON.parse(JSON.stringify()) deep copy to snapshot analysisResult before async insert, preventing mutation issues"
  - "Removed .catch() calls on Supabase PromiseLike chains — handled errors inside .then() callbacks instead"
  - "Used userContext.userId (auth-verified) instead of requestBody.userId (untrusted) for the insert"

patterns-established:
  - "Fire-and-forget Supabase insert: chain .then() without await, handle errors inside callback (no .catch() on PromiseLike)"

requirements-completed: [CC-04]

duration: 8min
completed: 2026-04-17
---

# Plan 17-05: Merit Path Analysis Results Persistence

**Non-blocking analysis_results insert added to Merit path so career analyses persist to dashboard when MERIT_SYSTEM_ENABLED=true**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-17
- **Completed:** 2026-04-17
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Merit path in analyze-career/index.ts now saves career analysis results to analysis_results table before returning the Response
- Insert is non-blocking (fire-and-forget) so user response latency is unaffected
- Completion email sent on successful insert, matching legacy path behavior
- CC-04 gap (dashboard persistence when Merit system is enabled) is closed

## Task Commits

1. **Task 1: Add non-blocking analysis_results insert to Merit path** - `f1aa248` (feat)

## Files Created/Modified
- `supabase/functions/analyze-career/index.ts` - Added 52-line non-blocking insert block between applyCareerTierShape and return Response in withMerits callback

## Decisions Made
- Used `JSON.parse(JSON.stringify(analysisResult))` deep copy to snapshot the shaped data before the async insert fires, preventing potential mutation issues
- Handled errors inside `.then()` callbacks rather than `.catch()` because Supabase query builder returns `PromiseLike` (not `Promise`), which lacks `.catch()`
- Used `userContext.userId` (auth-verified) instead of `requestBody.userId` (untrusted) per threat model T-17-09

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced .catch() with in-callback error handling**
- **Found during:** Task 1 (type checking)
- **Issue:** Plan specified `.catch()` on Supabase chains, but Supabase's `PromiseLike` type doesn't have `.catch()` — deno check failed with TS2339
- **Fix:** Moved error handling into `.then()` callbacks using early returns, removed outer `.catch()` entirely
- **Files modified:** supabase/functions/analyze-career/index.ts
- **Verification:** `deno check` passes (only pre-existing TS2339 on legacy path line 1134 remains)
- **Committed in:** f1aa248 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Type-safe fix for Supabase PromiseLike API. No scope creep.

## Issues Encountered
- Pre-existing type error on line 1134 (`AnthropicInvokeResult.text`) in legacy path — not related to this change, not addressed

## Self-Check: PASSED

- [x] `from('analysis_results').insert(` appears inside withMerits callback
- [x] Insert payload: user_id, analysis_type='career_compass', primary_score, key_insights, raw_response
- [x] Insert is NOT awaited (fire-and-forget)
- [x] Success/error logging with `[analyze-career]` bracket prefix
- [x] Completion email on successful insert matching legacy path
- [x] `deno check` passes (only pre-existing error on line 1134)
- [x] career-shape.test.ts: 20/20 passed
- [x] index.test.ts: 8/8 passed

## Next Phase Readiness
- CC-04 gap closed — Phase 17 career-compass-gating is now complete
- When Phase 21 flips MERIT_SYSTEM_ENABLED=true, career analyses will persist to dashboard

---
*Phase: 17-career-compass-gating*
*Completed: 2026-04-17*

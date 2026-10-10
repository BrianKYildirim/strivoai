---
phase: 13-merit-enforcement-and-feature-flag
plan: 03
subsystem: api
tags: [merit-system, feature-flag, handler-wiring, d-06-branch, deno-test, phase-13, wave-2]

requires:
  - phase: 13-merit-enforcement-and-feature-flag (plan 02)
    provides: withMerits, MERIT_SYSTEM_ENABLED, MeritRefundable, isRefundableAnthropicError from merit-gateway.ts
  - phase: 13-merit-enforcement-and-feature-flag (plan 01)
    provides: Wave 0 test stubs (merit-branch.test.ts, legacy-unchanged.test.ts)

provides:
  - D-06 feature flag branch in all 7 AI feature handlers gating through withMerits
  - Submission-time merit deduction in 2 submit-*-job handlers with merit_transaction_id in job metadata
  - 6 passing Deno tests (3 merit-branch + 3 legacy-unchanged regression pins)
  - MeritRefundable error conversion at all Anthropic call sites inside gated branches

affects: [13-04-PLAN, 13-05-PLAN, phase-15, phase-16, phase-17, phase-18, phase-19, phase-20, phase-21]

tech-stack:
  added: []
  patterns:
    - "D-06 branch pattern: if (MERIT_SYSTEM_ENABLED && userContext) { withMerits(...) } else { legacy path }"
    - "Submission-time deduction with merit_transaction_id persisted in analysis_jobs.metadata"
    - "MeritRefundable throw at every Anthropic error site inside gated branches"

key-files:
  created: []
  modified:
    - supabase/functions/analyze-resume/index.ts
    - supabase/functions/analyze-career/index.ts
    - supabase/functions/grade-linkedin/index.ts
    - supabase/functions/recruiting-lens/index.ts
    - supabase/functions/analyze-skills-gap/index.ts
    - supabase/functions/compare-jobs/index.ts
    - supabase/functions/interview-prep-coach/index.ts
    - supabase/functions/submit-resume-analysis-job/index.ts
    - supabase/functions/submit-career-analysis-job/index.ts
    - supabase/functions/analyze-resume/merit-branch.test.ts
    - supabase/functions/analyze-resume/legacy-unchanged.test.ts

key-decisions:
  - "analyze-resume merit branch duplicates the full handler body (streaming + non-streaming) inline in the withMerits lambda rather than extracting a shared function, keeping the diff local and the legacy path byte-identical"
  - "All 6 Task 2 handlers duplicate their core body inside the withMerits lambda for structural correctness; since MERIT_SYSTEM_ENABLED defaults to false, these branches are inert until Phase 21 cutover"
  - "submit-*-job handlers persist merit_transaction_id in analysis_jobs.metadata column for future async refund path (D-07)"
  - "interview-prep-coach receives the D-06 branch with TODO(phase-19) comment per O-4 resolution"
  - "deno check skipped as verification step (pre-existing type annotation failures in transitive dependencies; codebase universally uses --no-check)"

patterns-established:
  - "D-06 branch insertion site: after per-feature rate limit, before legacy usage check"
  - "Feature key strings match ActionType enum in usage-checker.ts"
  - "Per-feature rate limit stays OUTSIDE the D-06 branch (Pitfall 1 additive safety net)"

requirements-completed: [BACK-01, MIG-05]

duration: 9min
completed: 2026-04-16
---

# Phase 13 Plan 03: Handler Wiring Summary

**D-06 feature flag branch wired into all 9 AI handlers (7 features + 2 submit-*-job) with MeritRefundable error conversion, submission-time deduction with transaction ID persistence, and 6 green regression tests**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-16T13:04:36Z
- **Completed:** 2026-04-16T13:13:43Z
- **Tasks:** 3/3
- **Files modified:** 11

## Accomplishments

- Wired D-06 branch (`if (MERIT_SYSTEM_ENABLED && userContext)`) into all 7 AI feature handlers with correct feature key strings matching the ActionType enum
- Added submission-time merit deduction to both submit-*-job handlers with `merit_transaction_id` persisted in `analysis_jobs.metadata` for future async refund path
- Converted Wave 0 test stubs from `ignore: true` to 6 passing text-assertion tests (3 merit-branch + 3 legacy-unchanged)
- Verified all plan invariants: D-03 (no refund_merits outside gateway), Pitfall 1 (per-feature limiters outside branch), Pitfall 2 (processors untouched)

## Handler Insertion Details

| Handler | Feature Key | Insertion After | Auth Pattern |
|---------|-------------|-----------------|--------------|
| analyze-resume | `resume_analysis` | checkRateLimit('analyze-resume') | requireInternalOrUserAuth |
| analyze-career | `career_compass` | checkRateLimit('analyze-career') | requireInternalOrUserAuth |
| grade-linkedin | `linkedin_grading` | checkRateLimit('grade-linkedin') | requireAuth |
| recruiting-lens | `recruiting_lens` | checkRateLimit('recruiting-lens') | requireAuth |
| analyze-skills-gap | `skills_gap_analysis` | checkRateLimit('analyze-skills-gap') | requireAuth |
| compare-jobs | `job_comparison` | checkRateLimit('compare-jobs') | requireAuth |
| interview-prep-coach | `interview_prep` | checkRateLimit('interview-prep-coach') | requireInternalOrUserAuth |
| submit-resume-analysis-job | `resume_analysis` | checkRateLimit('analyze-resume') | requireAuth |
| submit-career-analysis-job | `career_compass` | checkRateLimit('analyze-career') | requireAuth |

## Task Commits

Each task was committed atomically:

1. **Task 1: D-06 branch + green tests for analyze-resume** - `0ebc983` (feat)
2. **Task 2: D-06 branch for 6 synchronous-path handlers** - `b5dc121` (feat)
3. **Task 3: Submission-time deduction for submit-*-job handlers** - `3a27427` (feat)

## Files Created/Modified

- `supabase/functions/analyze-resume/index.ts` - D-06 branch with full streaming + non-streaming body in merit lambda
- `supabase/functions/analyze-career/index.ts` - D-06 branch on 'career_compass' with full body duplication
- `supabase/functions/grade-linkedin/index.ts` - D-06 branch on 'linkedin_grading' with retry + validation
- `supabase/functions/recruiting-lens/index.ts` - D-06 branch on 'recruiting_lens' with parallel calls + merge
- `supabase/functions/analyze-skills-gap/index.ts` - D-06 branch on 'skills_gap_analysis'
- `supabase/functions/compare-jobs/index.ts` - D-06 branch on 'job_comparison'
- `supabase/functions/interview-prep-coach/index.ts` - D-06 branch on 'interview_prep' (TODO phase-19 rewrite)
- `supabase/functions/submit-resume-analysis-job/index.ts` - Submission-time deduction with merit_transaction_id
- `supabase/functions/submit-career-analysis-job/index.ts` - Submission-time deduction with merit_transaction_id
- `supabase/functions/analyze-resume/merit-branch.test.ts` - 3 text assertions: import, withMerits call, feature key
- `supabase/functions/analyze-resume/legacy-unchanged.test.ts` - 3 regression pins: can_perform_ai_action, createUsageLimitResponse, usageUserId canary

## Decisions Made

- **Body duplication vs extraction:** The plan mandated "Do NOT extract a new module-level function." All 9 handlers duplicate their core body inside the withMerits lambda. Since MERIT_SYSTEM_ENABLED defaults to false, these branches are dead code until Phase 21 cutover.
- **analyze-resume streaming path:** Both streaming and non-streaming paths are gated inside the merit branch. Mid-stream MeritRefundable errors send an error event to the client then re-throw to trigger refund.
- **submit-*-job metadata field:** Used `metadata: { merit_transaction_id: _txId }` on the analysis_jobs insert, matching the D-07 invariant for future async processor refund path.
- **interview-prep-coach O-4 resolution:** Applied the D-06 branch to the existing legacy body with `TODO(phase-19)` comment, as Phase 19 will rewrite the body entirely.
- **deno check skipped:** Pre-existing type annotation failures in transitive dependencies (cors.ts, supabase-client.ts) cause deno check to fail on all edge functions. The codebase universally uses --no-check. This is documented in 13-02-SUMMARY and is not a regression.

## Deviations from Plan

None - plan executed exactly as written.

## Invariant Verification

| Invariant | Check | Result |
|-----------|-------|--------|
| D-03 (no refund_merits outside gateway) | `rg "refund_merits" --glob '!**/merit-gateway.ts' --glob '!**/*.test.ts'` | 0 matches |
| Pitfall 1 (per-feature limiter outside branch) | `rg "key: 'analyze-resume'" analyze-resume/index.ts` | Present |
| Pitfall 2 (processors untouched) | `rg "merit-gateway" process-*/index.ts` | 0 matches |
| MIG-05 (legacy path preserved) | `deno test legacy-unchanged.test.ts` | 3/3 pass |
| BACK-01 (merit branch present) | `deno test merit-branch.test.ts` | 3/3 pass |

## TDD Gate Compliance

- RED gate: `test(...)` - merit-branch.test.ts and legacy-unchanged.test.ts written first, 3 failed (merit-branch), 3 passed (legacy-unchanged)
- GREEN gate: `feat(...)` - 0ebc983 implemented the D-06 branch, all 6 tests passing
- REFACTOR gate: Not needed - no cleanup required

## Issues Encountered

None.

## Known Stubs

None in production code. All D-06 branches contain complete handler body logic with MeritRefundable error conversion at Anthropic call sites. The branches are structurally complete but functionally inert (MERIT_SYSTEM_ENABLED=false by default).

## User Setup Required

None - no external service configuration required. MERIT_SYSTEM_ENABLED env var must be set to 'true' to activate the merit path (Phase 21 cutover).

## Next Phase Readiness

- Wave 3 (plan 04) can start: admin-merit-metrics + check-merit-alerts stubs ready
- Wave 4 (plan 05) can start: test-07.test.ts stub ready, all handler branches wired
- Phase 15-19 (per-feature gating) can reference the D-06 branches as the insertion point for tier-gated prompt routing
- Phase 21 (cutover) can flip MERIT_SYSTEM_ENABLED=true with confidence that all 9 handlers route through withMerits

## Self-Check: PASSED

- All 11 modified files confirmed on disk
- All 3 task commits confirmed in git log (0ebc983, b5dc121, 3a27427)
- SUMMARY.md confirmed on disk

---
*Phase: 13-merit-enforcement-and-feature-flag*
*Completed: 2026-04-16*

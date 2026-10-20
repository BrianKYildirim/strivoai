---
phase: 04-incremental-elite-unlock-for-previously-analyzed-free-tier-resumes
plan: 01
subsystem: ai-analysis
tags: [deno, elite-unlock, immutable-merge, zod, anthropic]

requires: []
provides:
  - Pure missing-section detection and immutable allowlisted Elite delta merge
  - Strict pre-merge patch schema plus complete-result validation seam
  - Conditional details and extras prompts with stable telemetry call names
affects: [04-02, 04-03, 04-04, analyze-resume]

tech-stack:
  added: []
  patterns: [stored-result-as-immutable-base, missing-path allowlist, conditional constrained-output schema]

key-files:
  created:
    - supabase/functions/_shared/resume-elite-unlock.ts
    - supabase/functions/_shared/resume-elite-unlock.test.ts
  modified:
    - supabase/functions/_shared/resume-prompts.ts
    - supabase/functions/analyze-resume/resume-validation.ts

key-decisions:
  - "Missing criterion feedback is addressed by stable criterion ID while top-level paid sections use explicit path names."
  - "Elite array unlocks append unique values only, preserving stored entries as deep-equal prefixes."
  - "The extras builder returns null when eliteInsights already exists, making a completed section structurally zero-call."

patterns-established:
  - "Model deltas are validated against a detected missing-path set and copied path-by-path; model objects are never spread over stored results."
  - "Incremental prompt schemas are derived only from requested missing sections."

requirements-completed: [AC-01, AC-02, AC-07]

duration: 32min
completed: 2026-07-30
---

# Phase 04 Plan 01: Immutable Elite Unlock Delta Summary

**A pure Deno contract now detects only absent Elite paths, rejects protected or unrequested model output, preserves the stored Free result, and builds conditional delta prompts.**

## Performance

- **Duration:** 32 min
- **Completed:** 2026-07-30
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Locked AC-01, AC-02, and T-04-03 with deep-preservation, malformed-patch, no-op, and idempotency tests.
- Added explicit missing-section detection, strict path-aware patch validation, and immutable append/set merging.
- Added narrow Zod validation for `elite_unlock` patches while retaining the existing complete-result validator after merge.
- Added conditional details/extras prompt builders with call names `elite-unlock-details` and `elite-unlock-extras`.

## Task Commits

1. **Task 1: Lock immutable base and allowlisted delta behavior** - `f8031862`
2. **Task 2: Implement detection, validation, and immutable merge** - `00a58460`
3. **Task 3: Add conditional Elite-unlock prompts** - `8631f92d`

Planning metadata remains local and uncommitted per repository policy.

## Files Created/Modified

- `supabase/functions/_shared/resume-elite-unlock.ts` - Pure missing-path, validation, and merge contract.
- `supabase/functions/_shared/resume-elite-unlock.test.ts` - Seven focused contract tests.
- `supabase/functions/_shared/resume-prompts.ts` - Conditional details and extras prompt builders.
- `supabase/functions/analyze-resume/resume-validation.ts` - Strict narrow patch schema alongside full-result validation.

## Decisions Made

- Elite target caps follow the existing tier shaper: seven priority improvements and ten rewrites.
- Existing paid values are treated as immutable just like Free-owned values.
- Error text identifies paths only and never includes stored resume or model content.

## Deviations from Plan

### Runtime fallback

- The registered `gsd-executor` uses `gpt-5.3-spark`, which is unsupported for this ChatGPT-backed Codex runtime.
- The plan was executed sequentially inline with the same read-first, task commit, and verification gates.
- Task 3 added two prompt-contract cases to the focused unlock suite so conditional schema and zero-call behavior are executable, not source-inspection-only.

## Issues Encountered

- Deno 2.7.1 panicked inside the managed Windows sandbox with `Unexpected client pipe failure`. The exact suite was rerun outside the sandbox and passed 9/9.

## Verification

- `deno test --allow-all --no-check _shared/resume-elite-unlock.test.ts analyze-resume/prompts.test.ts` - 9 passed, 0 failed.
- `deno check _shared/resume-prompts.ts _shared/resume-elite-unlock.ts _shared/resume-elite-unlock.test.ts analyze-resume/resume-validation.ts` - passed.
- Static unrestricted patch-spread search - no matches.

## User Setup Required

None.

## Next Plan Readiness

Plan 04-02 can now persist only a fully validated merged result through an atomic same-row RPC. Its preview schema push remains an explicit operator checkpoint.

---
*Phase: 04-incremental-elite-unlock-for-previously-analyzed-free-tier-resumes*
*Completed: 2026-07-30*

---
phase: 16-linkedin-grader-gating
plan: 04
subsystem: linkedin-grader-validation
tags: [validation, tier-awareness, free-tier, gap-closure, CR-01]
dependency_graph:
  requires: ["16-01", "16-02", "16-03"]
  provides: ["tier-aware-validation", "free-tier-validation-path"]
  affects: ["grade-linkedin/index.ts", "grade-linkedin/validation.ts"]
tech_stack:
  added: []
  patterns: ["tier-conditional validation", "default parameter backward compat"]
key_files:
  created: []
  modified:
    - supabase/functions/grade-linkedin/validation.ts
    - supabase/functions/grade-linkedin/validation.test.ts
    - supabase/functions/grade-linkedin/index.ts
    - supabase/functions/_shared/tier-config.ts
decisions:
  - "Split REQUIRED_TOP_LEVEL into BASE and PRO arrays to avoid conditional logic inside the field list"
  - "Default tier parameter to 'pro' for backward compatibility with legacy path and existing tests"
  - "Legacy path calls (outside runTieredAiCall) left with default 'pro' -- they run pre-Merit and always enforce full schema"
metrics:
  duration: "3m 37s"
  completed: "2026-04-17T09:09:15Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
  tests_added: 5
  tests_total: 48
---

# Phase 16 Plan 04: Tier-Aware LinkedIn Validation Summary

Tier-aware validateLinkedInGrade with Free-tier relaxation and 5 new tests closing CR-01 blocker

## What Was Done

### Task 1: Make validateLinkedInGrade tier-aware and add Free-tier tests (5d170cc)

- Added `import type { Tier }` from tier-config.ts
- Changed function signature to `validateLinkedInGrade(parsed: unknown, tier: Tier = 'pro')`
- Split `REQUIRED_TOP_LEVEL` into `REQUIRED_TOP_LEVEL_BASE` (6 fields, no profileInsights) and `REQUIRED_TOP_LEVEL_PRO` (7 fields, includes profileInsights)
- Check 2 (required fields) now uses `tier === 'free' ? REQUIRED_TOP_LEVEL_BASE : REQUIRED_TOP_LEVEL_PRO`
- Check 7 (feedback arrays >= 3) wrapped with `if (tier !== 'free')` guard
- Check 9 (profileInsights 2-4 items) wrapped with `if (tier !== 'free')` guard
- Added `makeValidFreeGrade()` helper and 5 new Deno tests verifying Free-tier relaxation and Pro backward compat
- All 27 validation tests pass (22 existing + 5 new)

### Task 2: Pass tier to validateLinkedInGrade in runTieredAiCall and cleanup (af13ff2)

- Updated all 4 `validateLinkedInGrade(parsed)` calls in `runTieredAiCall` to `validateLinkedInGrade(parsed, tier)`
- Removed duplicate `import './prompts.ts'` side-effect import (IN-01)
- Added clarifying comment on the named import line explaining the side-effect registration
- Removed stale `TODO(Phase 15)` from tier-config.ts doc comment (IN-02)
- All 48 tests pass across validation, strip, and handler-config test files

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

| Check | Result |
|-------|--------|
| `deno test validation.test.ts --no-check` | 27/27 pass |
| `deno test validation.test.ts strip.test.ts handler-config.test.ts --no-check` | 48/48 pass |
| `grep -c "validateLinkedInGrade(parsed, tier)" index.ts` | 4 (all runTieredAiCall calls) |
| `grep "TODO(Phase 15)" tier-config.ts` | No matches |
| `grep "import './prompts.ts'" index.ts` | No matches |
| `grep "tier: Tier = 'pro'" validation.ts` | 1 match |
| `DEFAULT_PRO_ELITE_MODEL` still present in tier-config.ts | Confirmed |

## Known Stubs

None -- all changes are functional code.

## Self-Check: PASSED

- All 4 modified files exist on disk
- Commit 5d170cc (Task 1) found in git log
- Commit af13ff2 (Task 2) found in git log
- All 48 tests pass across 3 test files

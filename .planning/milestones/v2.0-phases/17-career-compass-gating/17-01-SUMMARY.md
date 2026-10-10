---
phase: 17-career-compass-gating
plan: 01
subsystem: backend-shared
tags: [career-prompts, tier-shaping, defense-in-depth, unit-tests]
dependency_graph:
  requires: [14-tier-prompts-and-locked-section-primitive, 15-resume-analysis-gating]
  provides: [career-prompts-module, career-tier-shaper, career-shape-tests]
  affects: [analyze-career]
tech_stack:
  added: []
  patterns: [per-tier-prompt-builders, whitelist-based-output-shaping, golden-fixture-tests]
key_files:
  created:
    - supabase/functions/_shared/career-prompts.ts
    - supabase/functions/_shared/career-shape.test.ts
  modified:
    - supabase/functions/_shared/result-merger.ts
    - scripts/run-edge-tests.ps1
decisions:
  - "Career prompts follow resume-prompts.ts pattern: 3 tier builders + separate elite-extras builder"
  - "Elite base call uses same skeleton as Pro; elite-extras is a separate parallel call"
  - "Career whitelists are independent constants from resume whitelists in result-merger.ts"
  - "Free JSON skeleton omits skillGaps/resumeImprovements/salaryProgression entirely at prompt level"
  - "applyCareerTierShape is a separate export, not a modification of existing applyTierShape"
metrics:
  duration_seconds: 376
  completed: "2026-04-17T08:59:57Z"
  tasks_completed: 3
  tasks_total: 3
  tests_added: 20
  tests_passing: 52
---

# Phase 17 Plan 01: Career Prompt Module and Tier Shaping Summary

Per-tier career prompt builders registered with Phase 14 loader, career-specific applyCareerTierShape with cascading whitelists in result-merger.ts, and 20 golden fixture tests validating Free/Pro/Elite output shaping rules.

## What Was Built

### Task 1: career-prompts.ts (new file)

Created `supabase/functions/_shared/career-prompts.ts` following the resume-prompts.ts registration pattern:

- **CareerPromptParams interface**: currentDate, domain, domainConfidence, domainEvidence, secondaryDomains, uniqueRoles, uniqueFields, domainConfig
- **buildFreeCareerPrompt**: Core career prompt with restricted JSON skeleton (no skillGaps/resumeImprovements/salaryProgression) + FREE_TIER_SUFFIX instructing model to limit output
- **buildProCareerPrompt**: Full analysis skeleton with skillGaps, resumeImprovements, salaryProgression
- **buildEliteCareerPrompt**: Same skeleton as Pro (elite-extras come from separate call)
- **buildEliteExtrasPrompt**: Separate builder for compensationIntelligence + smartApplicationStrategy, interpolating domain-specific roles/fields/companies
- **CAREER_PROMPT_VARIANTS**: Registered with `registerFeaturePrompts('career', ...)` at module load

### Task 2: applyCareerTierShape in result-merger.ts

Added career-specific tier shaping as an independent function (existing resume `applyTierShape` untouched):

- **CAREER_FREE_ALLOWED_FIELDS**: detectedDomain, domainEvidence, roleReadinessScore, targetRole, careerDNA, whatYouHave, careerFields, roleReadinessBreakdown, roleRoadmaps, surpriseFits, roles, roadmap
- **CAREER_PRO_ALLOWED_FIELDS**: Free fields + skillGaps, resumeImprovements, salaryProgression
- **CAREER_ELITE_ALLOWED_FIELDS**: Pro fields + compensationIntelligence, smartApplicationStrategy
- Free tier slicing: careerFields to 1, surpriseFits to 1, roleRoadmaps steps to 2 phases, roleReadinessBreakdown to scorebox (overallScore, targetRole, readinessVerdict)

### Task 3: career-shape.test.ts (new file, 20 tests)

Golden fixture tests covering all tier shaping rules:
- 5 CC-01 tests: Free retains core fields with correct slicing
- 5 CC-02 tests: Free omits all locked fields
- 6 CC-03 tests: Pro retains standard + salary fields, omits elite
- 3 CC-04 tests: Elite retains all fields
- 1 idempotency test: double application produces identical output

Registered in `scripts/run-edge-tests.ps1`.

## Verification Results

| Check | Result |
|-------|--------|
| deno check career-prompts.ts | PASS |
| deno check result-merger.ts | 5 pre-existing TS2339 errors (discriminated union narrowing, not introduced by this plan) |
| career-shape.test.ts (20 tests) | 20/20 PASS |
| result-merger.test.ts (32 tests) | 32/32 PASS (no regression) |

## Deviations from Plan

### Pre-existing Issue (out of scope)

**deno check result-merger.ts exits non-zero**: The plan's verification step 2 expects `deno check` to exit 0 for result-merger.ts. However, the original file already has 5 TS2339 errors (discriminated union `.reason` property access without narrowing guard). These are pre-existing -- confirmed by running deno check on the unmodified file. The code runs correctly with `--no-check` (which is how all tests and production use it). No new type errors were introduced.

## Known Stubs

None. All exports are fully implemented with real logic, not placeholders.

## Self-Check: PASSED

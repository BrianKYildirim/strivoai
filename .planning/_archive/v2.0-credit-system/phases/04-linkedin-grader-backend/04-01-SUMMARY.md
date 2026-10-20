---
phase: 04-linkedin-grader-backend
plan: 01
subsystem: grade-linkedin
tags: [validation, tdd, migration, linkedin-grader]
dependency_graph:
  requires: []
  provides: [validateLinkedInGrade, ValidationResult, linkedin_grades_composite_index]
  affects: [grade-linkedin/index.ts]
tech_stack:
  added: []
  patterns: [tdd-red-green, deno-test, output-validation-with-correctedScore]
key_files:
  created:
    - supabase/functions/grade-linkedin/validation.ts
    - supabase/functions/grade-linkedin/validation.test.ts
    - supabase/migrations/20260411_linkedin_grades_drop_unique_identifier.sql
  modified: []
decisions:
  - "ValidationResult includes correctedScore field so callers can auto-repair score mismatches rather than rejecting the entire response"
  - "Placeholder detection uses regex patterns for [A-Z...], {A-Z...}, <A-Z...> to catch common LLM template tokens"
metrics:
  duration: 162s
  completed: "2026-04-11"
  tasks_completed: 2
  tasks_total: 2
  test_count: 26
  test_pass: 26
---

# Phase 04 Plan 01: v3.0 Output Validation & DB Migration Summary

TDD validation module with 26 tests enforcing v3.0 LinkedIn Grader output schema (score sum, feedback counts, placeholder detection, section constraints) plus DB migration replacing UNIQUE profile_identifier with user-scoped composite indexes.

## Task Results

| Task | Name | Commit(s) | Files |
|------|------|-----------|-------|
| 1 | TDD validation module | 50b79d8 (RED), abb794e (GREEN) | validation.ts, validation.test.ts |
| 2 | DB migration | 8ff47bd | 20260411_linkedin_grades_drop_unique_identifier.sql |

## What Was Built

### validation.ts
- Exports `validateLinkedInGrade(parsed: unknown): ValidationResult`
- Exports `ValidationResult` interface with `valid`, `error?`, `correctedScore?`
- Validates all 8 required top-level fields
- Enforces 4 sections with correct names and maxScore values (20, 30, 25, 25)
- Score sum enforcement: rejects if rawScore !== sum of section scores, provides correctedScore
- Minimum 3 feedback items per section
- Section status must be 'excellent' | 'good' | 'needs-improvement'
- Exactly 4 rewrites, no placeholder tokens
- profileInsights: 2-4 items
- nextBestAction: action, reason, expectedImpact required
- topFixes: all 6 fields required per item
- keyStrengths: non-empty array

### validation.test.ts
- 26 Deno.test cases covering all validation rules
- Uses makeValidGrade() helper for baseline conforming object
- Each test mutates one property to trigger specific validation failure

### DB Migration
- Drops `idx_linkedin_grades_identifier` (UNIQUE) and `idx_linkedin_grades_profile_identifier` (redundant)
- Creates `idx_linkedin_grades_user_profile` on (user_id, profile_identifier)
- Creates `idx_linkedin_grades_user_created` on (user_id, created_at DESC)

## Requirements Coverage

| Requirement | Status | Validated By |
|-------------|--------|-------------|
| LIG-04 | Covered | Score sum enforcement test (rawScore !== sum returns correctedScore) |
| LIG-05 | Covered | Feedback count test (< 3 items returns invalid) |
| LIG-08 | Covered | Rewrites count test (< 4) + placeholder detection tests |
| LIG-09 | Covered | profileInsights bounds tests (1 item, 5 items, 2-4 items) |
| LIG-13 | Covered | All 8 required field tests + section structure validation |

## Deviations from Plan

None - plan executed exactly as written.

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|------------|
| T-04-01 | validateLinkedInGrade rejects malformed AI output; score sum enforced with correctedScore for auto-repair |
| T-04-02 | Migration drops global UNIQUE allowing per-user isolation; existing RLS scoped to user_id = auth.uid() |

## Self-Check: PASSED

- All 3 created files exist on disk
- All 3 commits (50b79d8, abb794e, 8ff47bd) verified in git log

---
phase: 02-interview-prep-coach-backend
plan: 02
subsystem: interview-prep-coach
tags: [edge-function, ai-model, validation, error-handling]
dependency_graph:
  requires: [validateInterviewQuestions, interview_prep_action_type]
  provides: [interview-prep-coach-edge-function]
  affects: [usage_tracking, anthropic-api-calls]
tech_stack:
  added: []
  patterns: [response-validation-with-retry, input-truncation, seniority-auto-detection]
key_files:
  created: []
  modified:
    - supabase/functions/interview-prep-coach/index.ts
decisions:
  - Used claude-haiku-4-5-20251001 as default model for cost efficiency
  - Single retry on validation failure rather than retry loop to avoid amplifying load
  - 529 returns 503 to client with clear user-facing message
metrics:
  duration: 75s
  completed: 2026-04-11T10:15:04Z
---

# Phase 02 Plan 02: Edge Function Overhaul Summary

Interview Prep Coach edge function overhauled with Claude Haiku 4.5 model, fixed usage tracking to interview_prep action type, 12k char input truncation, seniority auto-detection prompt, 529 overload handling, and response validation with one retry.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Overhaul edge function with all D-01 through D-12 changes | b09a56e | Done |
| 2 | Verify backend overhaul and apply DB migrations | - | Pending human verification |

## Changes Made

### Task 1: Edge Function Overhaul

Applied all 7 changes to `supabase/functions/interview-prep-coach/index.ts`:

1. **Import validation function**: Added `import { validateInterviewQuestions } from './validation.ts'`
2. **Fix usage tracking (D-07)**: Changed `checkAndRecordUsage(userId, 'skills_gap_analysis')` to `checkAndRecordUsage(userId, 'interview_prep')`
3. **Input truncation (D-08)**: Job descriptions over 12,000 characters are truncated with logging
4. **Model swap (D-01)**: Default model changed from `claude-sonnet-4-20250514` to `claude-haiku-4-5-20251001`
5. **Seniority auto-detection (D-02)**: System prompt enhanced with instructions to infer seniority level from JD signals (years of experience, title keywords, responsibility complexity)
6. **529 overload handling (D-09)**: Anthropic 529 status returns 503 to client with "Service temporarily busy" message, placed before existing 429 check
7. **Response validation with retry (D-11, D-12)**: `parseAiResponse` helper strips markdown fences and repairs truncated JSON; `validateInterviewQuestions` checks structure; on validation failure, one retry AI call is made; second failure returns 500

### Task 2: Human Verification (Pending)

This task is a `checkpoint:human-verify` gate requiring:
- Visual verification of all grep checks passing
- Running validation tests: `deno test supabase/functions/interview-prep-coach/validation.test.ts --no-check`
- DB migration application: `supabase db push`
- Optional live deployment test

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **Claude Haiku 4.5 default**: Cost-effective model for interview question generation, overridable via `ANTHROPIC_MODEL_TEXT` env var
2. **Single retry strategy**: One retry on validation failure prevents load amplification while catching transient AI output issues
3. **529 -> 503 mapping**: Standard HTTP semantics (503 Service Unavailable) for upstream overload, with user-friendly message

## Preserved Behavior

- Auth via `requireInternalOrUserAuth`
- Rate limiting: `free: 0, pro: 15, elite: 30`
- 50-character minimum input validation
- Existing 429/402 error handling from AI gateway
- CORS headers on all responses
- Structured logging via `createLogger`

## Verification Results

- `grep "interview_prep"` - PASS (3 matches)
- `grep "claude-haiku-4-5-20251001"` - PASS
- `grep "validateInterviewQuestions"` - PASS (3 matches: import + 2 calls)
- `grep "12000"` - PASS (4 matches: truncation logic + logging)
- `grep "529"` - PASS
- `grep "seniority"` - PASS
- `grep "skills_gap_analysis"` - PASS (no matches, correctly removed)
- `grep "claude-sonnet-4-20250514"` - PASS (no matches, correctly removed)

## Self-Check: PASSED

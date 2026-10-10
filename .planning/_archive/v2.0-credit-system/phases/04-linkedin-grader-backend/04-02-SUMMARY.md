---
phase: 04-linkedin-grader-backend
plan: 02
subsystem: grade-linkedin
tags: [prompt-engineering, edge-function, linkedin-grader, auth, retry]
dependency_graph:
  requires: [validateLinkedInGrade, ValidationResult]
  provides: [buildSystemPrompt, buildUserMessage, grade-linkedin-v3-handler]
  affects: [linkedin_grades table, send-feature-email]
tech_stack:
  added: []
  patterns: [invokeWithRetry-3-attempt, correctedScore-auto-repair, follow-up-context-from-db]
key_files:
  created:
    - supabase/functions/grade-linkedin/prompts.ts
  modified:
    - supabase/functions/grade-linkedin/index.ts
decisions:
  - "Retry logic uses fixed delays [1000, 2000, 3000] ms — simple exponential backoff without jitter, matching v3.0 spec"
  - "correctedScore from validation is applied before retry — if section sum mismatch is the only issue, no need to re-call AI"
  - "Previous grade fetched via single() with limit(1) ordered by created_at DESC — returns null for first-time users"
metrics:
  duration: 236s
  completed: "2026-04-11"
  tasks_completed: 2
  tasks_total: 2
  test_count: 26
  test_pass: 26
---

# Phase 04 Plan 02: v3.0 Prompt & Handler Rewrite Summary

Complete rewrite of grade-linkedin edge function with v3.0 4-section scoring prompt (Headline 20, Experience 30, Skills & Endorsements 25, Profile Completeness 25), JWT-only auth fixing the body.userId security bypass, 3-attempt retry with exponential backoff, follow-up context from DB, and output validation with correctedScore auto-repair.

## Task Results

| Task | Name | Commit(s) | Files |
|------|------|-----------|-------|
| 1 | Create v3.0 prompt module | 805c703 | prompts.ts |
| 2 | Rewrite grade-linkedin handler | 9e3bbd5 | index.ts |

## What Was Built

### prompts.ts (163 lines)
- `buildSystemPrompt()`: v3.0 system prompt with 4-section scoring architecture
  - Headline (0-20), Experience (0-30), Skills & Endorsements (0-25), Profile Completeness (0-25)
  - Honest calibration: weak profiles 20-40, strong 70-90, minimum 10-20 point gap between different profiles
  - Feedback requirements: min 3 points per section, each quoting profile text with recruiter impact
  - 4 paste-ready rewrites, headline always first, no placeholder tokens
  - 2-4 profileInsights always required, even for weak profiles
  - Full JSON output schema with rawScore, sectionBreakdown, topFixes, rewrites, keyStrengths
- `buildUserMessage()`: Constructs user message with profile content, optional URL, and follow-up context
  - Follow-up context includes full previous grading JSON for section-by-section comparison
  - Instructions to acknowledge improvements by name but score only current state

### index.ts (305 lines, complete rewrite from 255 lines)
- **Auth**: `requireAuth(req, { type: 'user' })` — userId from JWT only, never from request body
- **Rate limiting**: free 5, pro 15, elite 30 per hour via `checkRateLimit`
- **Usage tracking**: `checkAndRecordUsage(userId, 'linkedin_grading')` before AI call
- **Previous grade fetch**: Most recent grade from `linkedin_grades` for follow-up context
- **AI call**: `invokeWithRetry` with 3 attempts, 1s/2s/3s backoff delays
  - Model: `claude-haiku-4-5-20251001`, maxTokens 8192, temperature 0.3, timeoutMs 60000
  - Skips retry on client errors (4xx except 429)
- **Validation**: `validateLinkedInGrade` with `correctedScore` auto-repair before retry
  - If correctedScore fixes the issue, no AI retry needed
  - If still invalid after correction, retry AI once then fail gracefully
- **Storage**: Single DB insert (fixes duplicate insert bug from old code)
- **Email**: Fire-and-forget email via `send-feature-email`
- **Removed**: OpenAI-style `choices[0].message.tool_calls` parsing, global cache lookup by `profile_identifier`, `body.userId` trust, duplicate DB insert, manual `createClient` calls

## Requirements Coverage

| Requirement | Status | Validated By |
|-------------|--------|-------------|
| LIG-02 | Covered | Model set to claude-haiku-4-5-20251001 with maxTokens 8192, timeoutMs 60000 |
| LIG-03 | Covered | 4-section architecture in buildSystemPrompt with correct weights |
| LIG-06 | Covered | Min 3 feedback points per section, each with quote + recruiter impact |
| LIG-07 | Covered | Calibration instructions: honest scoring, no anchoring, 10-20pt gap |
| LIG-10 | Covered | Previous grade fetched from DB, passed as follow-up context |
| LIG-12 | Covered | requireAuth(req, { type: 'user' }) — userId from JWT only |

## Deviations from Plan

None - plan executed exactly as written.

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|------------|
| T-04-01 | requireAuth(req, { type: 'user' }) extracts userId from JWT; body.userId completely ignored |
| T-04-02 | Input truncated to 12,000 chars; sanitizeMessages auto-called by invokeAnthropicText |
| T-04-03 | checkAndRecordUsage logs action before AI call; tied to JWT-verified userId |
| T-04-04 | Generic error messages returned; no stack traces; CORS restricted to APP_URL |
| T-04-05 | checkRateLimit with per-user sliding window (free:5, pro:15, elite:30); 3-retry caps at 3 attempts |
| T-04-06 | Tier read from JWT-verified profile via requireAuth; usage check before AI call |

## Self-Check: PASSED

- All 2 files exist on disk (prompts.ts, index.ts)
- All 2 commits (805c703, 9e3bbd5) verified in git log
- Validation tests: 26 passed, 0 failed

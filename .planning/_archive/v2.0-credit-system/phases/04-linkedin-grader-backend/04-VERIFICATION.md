---
phase: 04-linkedin-grader-backend
verified: 2026-04-11T00:00:00Z
status: human_needed
score: 10/11 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Confirm DB migration was applied to target database"
    expected: "idx_linkedin_grades_identifier UNIQUE index no longer exists; idx_linkedin_grades_user_profile and idx_linkedin_grades_user_created composite indexes exist. Query: SELECT indexname FROM pg_indexes WHERE tablename = 'linkedin_grades';"
    why_human: "Plan 03 Task 2 is a human-action checkpoint requiring supabase db push; cannot verify DB schema state programmatically from the codebase alone. 04-03-SUMMARY.md does not exist, confirming this plan was never marked complete."
---

# Phase 04: LinkedIn Grader Backend Verification Report

**Phase Goal:** Rewrite the LinkedIn Grader backend edge function with v3.0 4-section scoring prompt, JWT-only auth, retry logic, output validation, follow-up context, and fix the profile_identifier UNIQUE constraint.
**Verified:** 2026-04-11T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | validateLinkedInGrade returns valid:true for a conforming v3.0 response object | VERIFIED | validation.ts:49-172, validation.test.ts:31-35 (happy path test passes) |
| 2 | validateLinkedInGrade returns valid:false when rawScore does not equal the sum of section scores | VERIFIED | validation.ts:90-100: scoreSum computed via reduce, mismatch returns `{valid:false,error:'Score mismatch...',correctedScore}` |
| 3 | validateLinkedInGrade returns valid:false when any section has fewer than 3 feedback points | VERIFIED | validation.ts:102-109: feedback array length checked against `>= 3` |
| 4 | validateLinkedInGrade returns valid:false when rewrites array has fewer than 4 items or contains placeholder tokens | VERIFIED | validation.ts:119-135: exact-4 check + regex `[A-Z]`, `{A-Z}`, `<A-Z>` patterns |
| 5 | validateLinkedInGrade returns valid:false when profileInsights has fewer than 2 or more than 4 items | VERIFIED | validation.ts:137-141: `length < 2 || length > 4` check |
| 6 | The profile_identifier UNIQUE constraint is replaced with a composite index on (user_id, profile_identifier) | VERIFIED | Migration file exists with `DROP INDEX IF EXISTS idx_linkedin_grades_identifier`, `CREATE INDEX idx_linkedin_grades_user_profile ON public.linkedin_grades(user_id, profile_identifier)` |
| 7 | A request without a valid JWT returns 401 before any processing | VERIFIED | index.ts:84: `requireAuth(req, { type: 'user' })` — throws 401 Response on failure per auth.ts contract; caught at index.ts:296 and re-thrown |
| 8 | The system prompt defines 4 sections (Headline 20, Experience 30, Skills & Endorsements 25, Profile Completeness 25) | VERIFIED | prompts.ts:21-48: all four sections defined with explicit point ranges in the section headers |
| 9 | Anthropic API calls retry up to 3 times with 1s/2s/3s exponential backoff on server errors | VERIFIED | index.ts:30: `delays = [1000, 2000, 3000]`; invokeWithRetry loop attempts 0-2, skips client 4xx (except 429) |
| 10 | The AI response is validated with validateLinkedInGrade and rawScore is corrected if section sum mismatches | VERIFIED | index.ts:183-233: correctedScore applied before retry; re-validation after correction |
| 11 | DB migration has been applied to the target database | UNCERTAIN | Migration SQL file exists and is correct, but 04-03-SUMMARY.md is absent — Plan 03 Task 2 is a blocking human-action checkpoint requiring `supabase db push` confirmation |

**Score:** 10/11 truths verified (1 uncertain pending human confirmation)

### Human Verification Required

**Item 1: DB Migration Applied to Target Database**

**Test:** Run `supabase db push` (or confirm it was already run). Then query:
```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'linkedin_grades';
```
**Expected:** Output includes `idx_linkedin_grades_user_profile` and `idx_linkedin_grades_user_created`. Output does NOT include `idx_linkedin_grades_identifier` (the old UNIQUE index).
**Why human:** `supabase db push` requires interactive authentication or a live Supabase connection token. The migration file exists and has correct content, but Plan 03 was never completed (04-03-SUMMARY.md is absent), meaning no confirmation exists that the migration was pushed.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/functions/grade-linkedin/validation.ts` | v3.0 output schema validation with score sum enforcement | VERIFIED | 172 lines; exports `validateLinkedInGrade` and `ValidationResult` with `correctedScore`; all 14 validation rules implemented |
| `supabase/functions/grade-linkedin/validation.test.ts` | Unit tests for all validation rules (min 80 lines) | VERIFIED | 248 lines; 26 `Deno.test()` cases; imports `validateLinkedInGrade` from `./validation.ts` |
| `supabase/migrations/20260411_linkedin_grades_drop_unique_identifier.sql` | DB migration dropping UNIQUE on profile_identifier, adding composite index | VERIFIED | File exists with correct DROP INDEX and CREATE INDEX statements; not yet confirmed applied to DB |
| `supabase/functions/grade-linkedin/prompts.ts` | System prompt and user message builders for v3.0 grading (min 60 lines) | VERIFIED | 163 lines; exports `buildSystemPrompt` and `buildUserMessage`; all 4 sections, calibration, feedback requirements, rewrite rules, follow-up context present |
| `supabase/functions/grade-linkedin/index.ts` | Complete v3.0 edge function handler (min 120 lines) | VERIFIED | 305 lines; full pipeline: OPTIONS -> Auth -> Rate Limit -> Body Parse -> Usage -> Previous Grade Fetch -> Prompt Build -> AI Call (retry) -> Validate -> Store -> Email -> Respond |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `validation.test.ts` | `validation.ts` | `import { validateLinkedInGrade }` | WIRED | Line 2: `import { validateLinkedInGrade } from './validation.ts'` |
| `index.ts` | `validation.ts` | `import { validateLinkedInGrade }` | WIRED | Line 11: `import { validateLinkedInGrade } from './validation.ts'` |
| `index.ts` | `prompts.ts` | `import { buildSystemPrompt, buildUserMessage }` | WIRED | Line 12: `import { buildSystemPrompt, buildUserMessage } from './prompts.ts'` |
| `index.ts` | `_shared/auth.ts` | `requireAuth(req, { type: 'user' })` | WIRED | Line 6 import + Line 84 call with `{ type: 'user' }` |
| `index.ts` | `linkedin_grades table` | `getServiceClient().from('linkedin_grades')` | WIRED | Lines 131 (previous grade fetch) and 239 (insert) — exactly 2 references, expected |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `index.ts` | `previousGrade` | `getServiceClient().from('linkedin_grades').select(...).eq('user_id').order(...).limit(1).single()` | Yes — real DB query with user-scoped WHERE clause | FLOWING |
| `index.ts` | `parsed` (grading result) | `invokeWithRetry(...)` -> `parseAiResponse(ai.text)` -> `validateLinkedInGrade(parsed)` | Yes — real AI call via Anthropic API | FLOWING |
| `index.ts` | `record` (insert result) | `.insert({user_id, profile_url, profile_identifier, overall_score, grading_data: parsed}).select('id').single()` | Yes — real DB insert of AI-computed result | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — edge function requires a live Supabase + Anthropic environment; no runnable entry point without deployed infrastructure.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LIG-02 | 04-02 | Claude Haiku 4.5 with 8192 max tokens and 60s timeout | SATISFIED | index.ts:150 `claude-haiku-4-5-20251001`, :153 `maxTokens: 8192`, :155 `timeoutMs: 60000` |
| LIG-03 | 04-02 | 4-section scoring: Headline 20, Experience 30, Skills & Endorsements 25, Profile Completeness 25 | SATISFIED | prompts.ts:21-48 explicit section headers; validation.ts:9-14 EXPECTED_SECTIONS map enforces same weights |
| LIG-04 | 04-01 | Overall score equals the mathematical sum of the 4 section scores | SATISFIED | validation.ts:90-100: scoreSum computed and compared to rawScore; correctedScore returned on mismatch |
| LIG-05 | 04-01 | Each section includes minimum 3-4 specific feedback points | SATISFIED | validation.ts:102-109: `feedback.length < 3` check; prompts.ts:54-57: "provide at minimum 3 specific feedback points" |
| LIG-06 | 04-02 | Each feedback point explains recruiter impact | SATISFIED | prompts.ts:56: "(b) Explain the recruiter impact — how a recruiter or LinkedIn's algorithm treats this element" |
| LIG-07 | 04-02 | Scores honestly calibrated — no anchoring, 10-20+ point gap | SATISFIED | prompts.ts:61-68: "CALIBRATION INSTRUCTIONS" section with explicit score ranges (20-40 weak, 70-90 strong, minimum 10-20 point gap) |
| LIG-08 | 04-01 | 4 paste-ready rewrites, headline first, no placeholders | SATISFIED | validation.ts:119-135: exactly 4 rewrites + placeholder regex; prompts.ts:72: "exactly 4 paste-ready rewrites...no placeholder tokens like [Your Name], {industry}, or <title>" |
| LIG-09 | 04-01 | Profile insights highlight 2-4 exceptional elements | SATISFIED | validation.ts:137-141: `insights.length < 2 \|\| length > 4`; prompts.ts:76: "Always include 2-4 profileInsights" |
| LIG-10 | 04-02 | Follow-up analysis acknowledges improvements, adjusts score honestly | SATISFIED | index.ts:130-140: previous grade fetched from DB; prompts.ts:159: FOLLOW-UP CONTEXT with PREVIOUS ANALYSIS appended when followUpContext non-null |
| LIG-12 | 04-02 | JWT verification — fix auth bypass where userId trusted from request body | SATISFIED | index.ts:6 imports `requireAuth`; :84 calls `requireAuth(req, { type: 'user' })`; no `body.userId` references anywhere in file |
| LIG-13 | 04-01 | Output matches v3.0 JSON schema exactly | SATISFIED | validation.ts:18-27: REQUIRED_TOP_LEVEL array validates all 8 fields (rawScore, scoreJustification, profileInsights, nextBestAction, sectionBreakdown, topFixes, keyStrengths, rewrites) |

All 11 required IDs (LIG-02, LIG-03, LIG-04, LIG-05, LIG-06, LIG-07, LIG-08, LIG-09, LIG-10, LIG-12, LIG-13) accounted for across Plans 01 and 02. No orphaned requirements found for Phase 4.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `index.ts` | 65-68 | `JSON.parse(repaired)` inside `parseAiResponse` can throw uncaught `SyntaxError` on the retry path (CR-02 from code review) | Warning | If repair fails, client receives raw SyntaxError message instead of controlled 500 message `'Failed to generate valid LinkedIn grade'` — information disclosure of internal detail |
| `validation.ts` | 71-77 | Duplicate section names not detected (WR-01 from code review) | Warning | A response with `[Headline, Headline, Experience, Skills & Endorsements]` passes validation; produces corrupt stored grade |
| `index.ts` | 138-140 | `followUpContext` has no size cap before injection into prompt (WR-03 from code review) | Warning | Large previous grades (3-5K chars) combined with 12K profile + large system prompt could hit context window limit, triggering unhandled 400 from Anthropic |
| `index.ts` | 98-104 | `profileContent` not passed through `prompt-sanitizer.ts` (WR-02 from code review) | Warning | Injection phrases in profile text bypass the project's sanitization layer; other analysis functions sanitize user-supplied text |

None of the above are blockers for the phase's observable truths — they are code quality warnings that should be addressed before production rollout. The phase goal (functional v3.0 backend with correct auth, schema, and validation) is achieved at the code level.

### Gaps Summary

No blocking gaps against phase must-haves. The single unresolved item is the DB migration application confirmation (Plan 03 Task 2), which requires human action. The migration SQL file is correct and present; the question is only whether `supabase db push` has been run against the target database.

The code review findings (CR-01: TOCTOU race, CR-02: unhandled parse error on retry, WR-01 through WR-04) represent quality improvements to address post-verification, not missing phase requirements.

---

_Verified: 2026-04-11T00:00:00Z_
_Verifier: Claude (gsd-verifier)_

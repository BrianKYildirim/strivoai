# Phase 2: Interview Prep Coach Backend - Research

**Researched:** 2026-04-11
**Domain:** Supabase Edge Functions (Deno), Anthropic Claude API, PostgreSQL migration
**Confidence:** HIGH

## Summary

This phase modifies an existing, mostly-functional edge function (`interview-prep-coach/index.ts`) and supporting shared utilities. The function already has auth, rate limiting, prompt construction, AI invocation, and JSON parsing. The changes are surgical: swap the model to Claude Haiku 4.5, fix the usage tracking action type from `'skills_gap_analysis'` to `'interview_prep'`, add response validation with one retry, add 529 handling, cap input at 12,000 chars, and add `'interview_prep'` to both the TypeScript `ActionType` union and the PostgreSQL `ai_action_type` enum.

The DB side requires two migrations: one to extend the `ai_action_type` enum (used by `record_ai_usage` RPC) and one to extend the `analysis_results.analysis_type` CHECK constraint. Both follow established patterns with recent precedent (`recruiting_lens` was added identically in April 2026).

**Primary recommendation:** Follow the exact patterns from the `recruiting_lens` migration and edge function setup. This is a modification phase, not a greenfield build.

\<user\_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

* **D-01:** Use Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) -- fast, cheap, sufficient for structured Q\&A generation
* **D-02:** Prompt auto-detects seniority level from job description signals and calibrates difficulty accordingly
* **D-03:** Input is job description only (+ optional title/company). No resume text input
* **D-04:** Keep both gating layers: rate limiter (free: 0, pro: 15, elite: 30) AND usage checker for credit tracking
* **D-05:** DB migration adds `interview_prep` to the CHECK constraint on `analysis_type`. Simple ALTER, no backfill
* **D-06:** Update `ActionType` union in `usage-checker.ts` to include `'interview_prep'`
* **D-07:** Fix usage tracking call from `checkAndRecordUsage(userId, 'skills_gap_analysis')` to `checkAndRecordUsage(userId, 'interview_prep')`
* **D-08:** Cap job description at 12,000 characters (truncate)
* **D-09:** On Anthropic API overload (529), fail immediately with 503 and clear message. No queue fallback
* **D-10:** Keep existing 50-char minimum for job description input
* **D-11:** Validate AI response structure AND counts: exactly 8 questions, correct category distribution, all required fields present
* **D-12:** If validation fails, retry the AI call once. If second attempt also fails, return 500

### Claude's Discretion

* Exact prompt wording refinements for quality improvement
* Temperature and max token tuning (currently 0.7 / 8000)
* JSON repair strategy for truncated responses
* Internal error message formatting
* Whether to add prompt sanitizer (noted as SEC-07 gap but Phase 9 scope)

### Deferred Ideas (OUT OF SCOPE)

None
\</user\_constraints>

\<phase\_requirements>

## Phase Requirements

| ID                      | Description                                                                                                                           | Research Support                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| IPC-01                  | User can paste a job description and optionally provide title/company to generate interview questions                                 | Existing function already accepts `jobDescription`, `jobTitle`, `company` in request body. Add 12k truncation per D-08 |
| IPC-02                  | Edge function generates exactly 8 tailored questions: behavioral (3), technical (2), situational (1), culture fit (1), leadership (1) | Prompt already specifies distribution. Add post-AI validation per D-11                                                 |
| IPC-03                  | Each question includes category, difficulty, STAR outline, sample opener, tips, and red flags                                         | Prompt already specifies all fields. Add field-presence validation per D-11                                            |
| IPC-04                  | Edge function uses Claude Haiku 4.5 model instead of Gemini                                                                           | Change model constant from `claude-sonnet-4-20250514` fallback to `claude-haiku-4-5-20251001` per D-01                 |
| IPC-09                  | Feature is gated to Pro and Elite tier users only                                                                                     | Rate limiter already configured with `free: 0`. Verified in existing code (line 37)                                    |
| IPC-10                  | Usage is recorded under the correct `interview_prep` action type (DB enum migration required)                                         | Requires: enum migration, CHECK constraint migration, TypeScript union update, usage call fix                          |
| \</phase\_requirements> |                                                                                                                                       |                                                                                                                        |

## Standard Stack

### Core

| Library                 | Version                          | Purpose                       | Why Standard                                                       |
| ----------------------- | -------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| Deno std/http           | 0.168.0                          | HTTP server for edge function | Already in use across all edge functions \[VERIFIED: codebase]     |
| Anthropic Messages API  | 2023-06-01                       | LLM inference                 | Already configured in `_shared/anthropic.ts` \[VERIFIED: codebase] |
| Supabase service client | via `_shared/supabase-client.ts` | DB operations, usage tracking | Singleton pattern across all edge functions \[VERIFIED: codebase]  |

### Supporting

| Library                    | Version  | Purpose                    | When to Use                                                  |
| -------------------------- | -------- | -------------------------- | ------------------------------------------------------------ |
| `_shared/json-repair.ts`   | internal | Fix truncated JSON from AI | When `JSON.parse` fails on AI response \[VERIFIED: codebase] |
| `_shared/logger.ts`        | internal | Structured logging         | All log output \[VERIFIED: codebase]                         |
| `_shared/auth.ts`          | internal | JWT + internal auth        | Request authentication \[VERIFIED: codebase]                 |
| `_shared/rate-limiter.ts`  | internal | Fixed-window rate limiting | Before expensive operations \[VERIFIED: codebase]            |
| `_shared/usage-checker.ts` | internal | Credit tracking            | After rate limit check, before AI call \[VERIFIED: codebase] |
| `_shared/cors.ts`          | internal | CORS headers               | All responses \[VERIFIED: codebase]                          |

### Alternatives Considered

None -- all decisions are locked. The stack is the existing Supabase Edge Function infrastructure.

## Architecture Patterns

### Existing Edge Function Flow (already implemented)

```
Request → OPTIONS check → Auth → Rate limit → Parse body → Usage check → AI call → JSON parse → Response
```

### Modified Flow (this phase)

```
Request → OPTIONS check → Auth → Rate limit → Parse body → Truncate to 12k → Usage check → AI call → Validate response → (retry once if invalid) → JSON parse → Response
```

### Pattern 1: DB Enum Extension

**What:** Add a value to the `ai_action_type` PostgreSQL enum
**When to use:** When adding a new action type for usage tracking
**Example:**

```SQL
-- Source: supabase/migrations/20260409000002_add_recruiting_lens_ai_action_type.sql
ALTER TYPE public.ai_action_type ADD VALUE IF NOT EXISTS 'interview_prep';
```

\[VERIFIED: exact pattern used for `recruiting_lens` one migration ago]

### Pattern 2: CHECK Constraint Extension

**What:** Drop and recreate the `analysis_results_analysis_type_check` constraint with the new value
**When to use:** When adding a new analysis type to `analysis_results` table
**Example:**

```SQL
-- Source: supabase/migrations/20260409000000_add_recruiting_lens_analysis_type.sql
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'analysis_results_analysis_type_check'
      and conrelid = 'public.analysis_results'::regclass
  ) then
    alter table public.analysis_results drop constraint analysis_results_analysis_type_check;
  end if;
end $$;

alter table public.analysis_results
  add constraint analysis_results_analysis_type_check
  check (analysis_type in (
    'resume_analysis', 'linkedin_grading', 'job_matching',
    'career_compass', 'skills_gap_analysis', 'job_comparison',
    'recruiting_lens', 'interview_prep'
  ));
```

\[VERIFIED: exact pattern from most recent migration]

### Pattern 3: Response Validation with Retry

**What:** Validate AI response structure, retry once on failure
**When to use:** After parsing AI response, before returning to client
**Example:**

```TypeScript
// Validation function
function validateQuestions(parsed: unknown): { valid: boolean; error?: string } {
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as any).questions)) {
    return { valid: false, error: 'Response missing questions array' };
  }
  const questions = (parsed as any).questions;
  if (questions.length !== 8) {
    return { valid: false, error: `Expected 8 questions, got ${questions.length}` };
  }
  // Check category distribution
  const counts: Record<string, number> = {};
  for (const q of questions) {
    counts[q.category] = (counts[q.category] || 0) + 1;
  }
  const expected = { behavioral: 3, technical: 2, situational: 1, culture_fit: 1, leadership: 1 };
  for (const [cat, count] of Object.entries(expected)) {
    if (counts[cat] !== count) {
      return { valid: false, error: `Expected ${count} ${cat}, got ${counts[cat] || 0}` };
    }
  }
  // Check required fields on each question
  const requiredFields = ['category', 'difficulty', 'question', 'starOutline', 'sampleOpener', 'tips', 'redFlags'];
  for (const q of questions) {
    for (const field of requiredFields) {
      if (!(field in q)) {
        return { valid: false, error: `Question ${q.id} missing field: ${field}` };
      }
    }
  }
  return { valid: true };
}
```

\[ASSUMED -- validation pattern; specific implementation is Claude's discretion]

### Pattern 4: 529 Overload Handling

**What:** Detect Anthropic 529 status and return 503 to client
**When to use:** After AI call returns `ok: false`
**Example:**

```TypeScript
if (!ai.ok) {
  if (ai.status === 529) {
    return new Response(
      JSON.stringify({ error: 'Service temporarily busy, please try again.' }),
      { status: 503, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
    );
  }
  // ... other error handling
}
```

\[VERIFIED: `invokeAnthropicText` returns `{ ok: false, status: number, error: string }` -- status 529 is passed through from Anthropic API]

### Anti-Patterns to Avoid

* **Hardcoding model name without env override:** The existing pattern uses `Deno.env.get('ANTHROPIC_MODEL_TEXT') || 'default'`. For this function, the default should be `claude-haiku-4-5-20251001` but the env override should still work \[VERIFIED: codebase pattern]
* **Recording usage before AI call succeeds:** The current code records usage BEFORE calling the AI, which charges the user even if the AI call fails. This is the existing pattern across all functions and should NOT be changed in this phase to maintain consistency \[VERIFIED: codebase]
* **Truncating silently without logging:** When truncating job description to 12k chars, log the truncation so debugging is possible \[ASSUMED: best practice]

## Don't Hand-Roll

| Problem        | Don't Build                | Use Instead                                                       | Why                                                                                         |
| -------------- | -------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| JSON repair    | Custom string manipulation | `repairTruncatedJSON()` from `_shared/json-repair.ts`             | Handles edge cases for truncated brackets, quotes \[VERIFIED: already imported in function] |
| Rate limiting  | Custom counter logic       | `checkRateLimit()` from `_shared/rate-limiter.ts`                 | Postgres-backed, atomic, fail-open \[VERIFIED: already used in function]                    |
| Usage tracking | Direct DB inserts          | `checkAndRecordUsage()` from `_shared/usage-checker.ts`           | Handles billing periods, tier limits \[VERIFIED: already used in function]                  |
| Auth           | Custom JWT parsing         | `requireInternalOrUserAuth()` from `_shared/auth.ts`              | Handles both JWT and internal secret auth \[VERIFIED: already used in function]             |
| CORS           | Manual header construction | `corsHeaders()` + `handleOptionsRequest()` from `_shared/cors.ts` | Centralized, fail-closed \[VERIFIED: already used in function]                              |

## Common Pitfalls

### Pitfall 1: Enum Migration Must Be Standalone File

**What goes wrong:** `ALTER TYPE ... ADD VALUE` cannot run inside a multi-statement transaction in some PostgreSQL versions
**Why it happens:** Supabase migrations run each file as its own transaction. Combining enum extension with other SQL in one file can fail
**How to avoid:** Put the `ALTER TYPE` in its own migration file, exactly like `20260409000002_add_recruiting_lens_ai_action_type.sql`
**Warning signs:** Migration fails with "ALTER TYPE ... ADD VALUE cannot run inside a transaction block"
\[VERIFIED: comment in existing migration file explicitly documents this]

### Pitfall 2: CHECK Constraint Must Include ALL Existing Values

**What goes wrong:** Dropping and recreating the CHECK constraint with missing values breaks existing rows
**Why it happens:** The new CHECK constraint is validated against all existing data
**How to avoid:** Copy the full list from the most recent migration and add the new value
**Warning signs:** Migration fails with CHECK constraint violation on existing data
\[VERIFIED: pattern from `20260409000000_add_recruiting_lens_analysis_type.sql`]

### Pitfall 3: TypeScript ActionType Union Out of Sync with DB

**What goes wrong:** TypeScript accepts `'interview_prep'` but DB rejects it, or vice versa
**Why it happens:** Two sources of truth: TypeScript union in `usage-checker.ts` and PostgreSQL enum
**How to avoid:** Update both in the same phase. The TypeScript union currently has 7 values; add `'interview_prep'` as the 8th
**Warning signs:** Runtime error on `record_ai_usage` RPC call
\[VERIFIED: current union has 7 values, DB enum has 7 values after `recruiting_lens` addition]

### Pitfall 4: Model Name Typo

**What goes wrong:** AI call returns 404 or unexpected model behavior
**Why it happens:** Model IDs are precise strings
**How to avoid:** Use exact string `claude-haiku-4-5-20251001` as confirmed in D-01
**Warning signs:** 404 from Anthropic API, or unexpectedly slow/expensive responses
\[ASSUMED: common issue with model ID strings]

### Pitfall 5: Validation Retry Consuming Double Credits

**What goes wrong:** User is charged twice if the first AI call produces invalid output and retry fires
**Why it happens:** Usage is already recorded before the AI call
**How to avoid:** This is acceptable per existing design -- usage is recorded once before the first AI call. The retry is an internal quality measure, not a separate user action. No double-charge occurs because `checkAndRecordUsage` is called once, before any AI call
**Warning signs:** N/A -- the current code structure naturally prevents this
\[VERIFIED: usage check happens at line 58, before AI call at line 111]

### Pitfall 6: Frontend Expects `whyAsked` Field

**What goes wrong:** Frontend renders empty/broken cards if `whyAsked` is missing
**Why it happens:** The frontend `InterviewQuestion` interface includes `whyAsked: string` which is used in rendering
**How to avoid:** Ensure the prompt and validation both include `whyAsked` as a required field, even though it is not listed in D-11's required fields
**Warning signs:** Empty "Why Asked" section in UI
\[VERIFIED: frontend interface at `InterviewPrepCoach.tsx` line 36 includes `whyAsked: string`]

## Code Examples

### Current Edge Function Structure (key sections to modify)

**Line 58 -- Wrong action type (D-07 fix):**

```TypeScript
// CURRENT (broken):
const usageCheck = await checkAndRecordUsage(userId, 'skills_gap_analysis');
// FIX:
const usageCheck = await checkAndRecordUsage(userId, 'interview_prep');
```

\[VERIFIED: codebase line 58]

**Line 67 -- Model default (D-01 fix):**

```TypeScript
// CURRENT:
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL_TEXT') || 'claude-sonnet-4-20250514';
// FIX:
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL_TEXT') || 'claude-haiku-4-5-20251001';
```

\[VERIFIED: codebase line 67]

**Input truncation (D-08, insert after line 50):**

```TypeScript
const truncatedJD = jobDescription.length > 12000
  ? jobDescription.slice(0, 12000)
  : jobDescription;
// Use truncatedJD in the rest of the function
```

\[ASSUMED: simple implementation]

### TypeScript ActionType Update

```TypeScript
// Source: supabase/functions/_shared/usage-checker.ts line 3
export type ActionType =
  | 'resume_analysis'
  | 'job_matching'
  | 'career_compass'
  | 'skills_gap_analysis'
  | 'linkedin_grading'
  | 'job_comparison'
  | 'recruiting_lens'
  | 'interview_prep';  // ADD THIS
```

\[VERIFIED: current union at usage-checker.ts lines 3-10]

## Validation Architecture

### Test Framework

| Property           | Value                                                                   |
| ------------------ | ----------------------------------------------------------------------- |
| Framework          | Deno test (built-in)                                                    |
| Config file        | `supabase/functions/deno.json`                                          |
| Quick run command  | `deno test supabase/functions/_shared/usage-checker.test.ts --no-check` |
| Full suite command | `deno test supabase/functions/_shared/ --no-check`                      |

### Phase Requirements to Test Map

| Req ID | Behavior                                   | Test Type   | Automated Command                                                                 | File Exists?   |
| ------ | ------------------------------------------ | ----------- | --------------------------------------------------------------------------------- | -------------- |
| IPC-02 | 8 questions, correct category distribution | unit        | `deno test supabase/functions/interview-prep-coach/validation.test.ts --no-check` | No -- Wave 0   |
| IPC-03 | Each question has all required fields      | unit        | Same as above (validation function tests)                                         | No -- Wave 0   |
| IPC-04 | Uses Claude Haiku 4.5 model                | manual-only | Verify model string in code                                                       | N/A            |
| IPC-09 | Free tier blocked                          | manual-only | Rate limiter already tested in `rate-limiter.test.ts`                             | Yes (existing) |
| IPC-10 | Usage recorded as `interview_prep`         | manual-only | Verify usage call in code + DB enum migration applied                             | N/A            |

### Sampling Rate

* **Per task commit:** `deno test supabase/functions/_shared/ --no-check`
* **Per wave merge:** Full shared utility test suite
* **Phase gate:** Full suite green + manual verification of DB migration

### Wave 0 Gaps

* [ ] `supabase/functions/interview-prep-coach/validation.test.ts` -- unit tests for the response validation function (covers IPC-02, IPC-03)
* [ ] Extract validation logic into a testable pure function (not embedded in handler)

## Security Domain

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                    |
| --------------------- | ------- | ------------------------------------------------------------------- |
| V2 Authentication     | yes     | `requireInternalOrUserAuth` -- already in place \[VERIFIED]         |
| V3 Session Management | no      | N/A (stateless edge function)                                       |
| V4 Access Control     | yes     | Rate limiter (free: 0 blocks free tier) + usage checker \[VERIFIED] |
| V5 Input Validation   | yes     | 50-char minimum + 12k truncation + JSON response validation         |
| V6 Cryptography       | no      | No crypto operations in this function                               |

### Known Threat Patterns

| Pattern                              | STRIDE                 | Standard Mitigation                                                                                           |
| ------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Prompt injection via job description | Tampering              | `prompt-sanitizer.ts` available but NOT applied in this function. Deferred to Phase 9 (SEC-07) per CONTEXT.md |
| Oversized input causing timeout/cost | Denial of Service      | 12,000 char truncation (D-08)                                                                                 |
| Free tier bypass                     | Elevation of Privilege | Two-layer defense: rate limiter (free: 0) + usage checker \[VERIFIED]                                         |
| Usage tracking under wrong type      | Information Disclosure | Fix action type from `skills_gap_analysis` to `interview_prep` (D-07)                                         |

## Assumptions Log

| #  | Claim                                                                                 | Section                          | Risk if Wrong                                                                           |
| -- | ------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| A1 | Validation function implementation pattern (specific field checks, category counting) | Architecture Patterns, Pattern 3 | Low -- validation logic is straightforward; exact implementation is Claude's discretion |
| A2 | `claude-haiku-4-5-20251001` is the correct model ID string                            | Common Pitfalls, Pitfall 4       | Medium -- if model ID is wrong, AI calls will fail. User confirmed in D-01              |
| A3 | Silent truncation with logging is sufficient (no error response for oversized input)  | Anti-Patterns                    | Low -- D-08 says "truncate", not "reject"                                               |

## Open Questions

1. **Should** **`whyAsked`** **be in the validation required fields list?**
   * What we know: The frontend `InterviewQuestion` interface includes `whyAsked`. The prompt includes it. D-11 lists required fields but does not mention `whyAsked`
   * What's unclear: Whether D-11's list was intentionally excluding `whyAsked` or it was an oversight
   * Recommendation: Include `whyAsked` in validation since the frontend requires it and the prompt requests it. Low risk -- the prompt already generates it

2. **Should the function store results in** **`analysis_results`** **table?**
   * What we know: The current function does NOT insert into `analysis_results`. Other functions (resume analysis) do store results. The CHECK constraint migration suggests it should be possible
   * What's unclear: Whether this is desired for Phase 2 or a future concern
   * Recommendation: Do NOT add `analysis_results` insertion in this phase. The current function returns results directly and does not persist them. Keep scope minimal

## Sources

### Primary (HIGH confidence)

* `supabase/functions/interview-prep-coach/index.ts` -- existing function code (167 lines)
* `supabase/functions/_shared/usage-checker.ts` -- ActionType union, usage check flow
* `supabase/functions/_shared/anthropic.ts` -- AI invocation signature, fixtureKey enum
* `supabase/functions/_shared/rate-limiter.ts` -- rate limit pattern, config shape
* `supabase/migrations/20260409000000_add_recruiting_lens_analysis_type.sql` -- CHECK constraint pattern
* `supabase/migrations/20260409000002_add_recruiting_lens_ai_action_type.sql` -- enum extension pattern
* `supabase/migrations/20251222220418_b52662bb-5e0f-4847-bc53-d848d159e2c2.sql` -- original enum, usage tracking table, RPC functions
* `src/pages/InterviewPrepCoach.tsx` -- frontend interface contract (lines 29-50)

### Secondary (MEDIUM confidence)

* None needed -- all findings from codebase inspection

### Tertiary (LOW confidence)

* None

## Metadata

**Confidence breakdown:**

* Standard stack: HIGH -- entirely existing infrastructure, no new dependencies
* Architecture: HIGH -- modifying existing function with well-established patterns
* Pitfalls: HIGH -- verified against actual codebase and recent migration precedent
* DB migration: HIGH -- exact pattern precedent exists from 2 days ago

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable -- no external dependencies changing)

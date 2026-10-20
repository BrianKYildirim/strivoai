# Phase 4: LinkedIn Grader -- Backend - Research

**Researched:** 2026-04-11
**Domain:** Supabase Edge Function rewrite (Deno + Anthropic Claude Haiku 4.5)
**Confidence:** HIGH

## Summary

This phase rewrites the `grade-linkedin` Supabase Edge Function to implement the v3.0 LinkedIn Grader spec. The existing function has critical defects: it trusts `userId` from the request body (security bypass), uses a 12-criterion rubric (needs 4-section replacement), parses responses in OpenAI format (line 163: `data.choices[0].message.tool_calls`), has a duplicate DB insert (lines 177 and 231), and imports `requireAuth` but never calls it.

The rewrite follows the established pattern from Phase 2 (Interview Prep Coach): JWT auth via `requireAuth`, rate limiting, usage tracking, single Anthropic API call with structured JSON output, response validation, JSON repair for truncated responses, and structured error handling with CORS.

**Primary recommendation:** Rewrite `grade-linkedin/index.ts` from scratch following the IPC pattern, with a new 4-section prompt, output validation module, follow-up context fetched from DB, and retry logic (3 attempts with exponential backoff per D-02).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** 4 sections with a single score each. Sub-criteria folded into parent section as feedback points -- not separate scores.
- **D-02:** Retry all Anthropic API failures up to 3 attempts with exponential backoff (1s, 2s, 3s). Return error to user only after all 3 attempts fail.
- **D-03:** Claude's discretion on calibration caps/guardrails in prompt.
- **D-04:** Rewrites are a top-level `rewrites` array in the JSON output, separate from `topFixes`. First element is always headline rewrite. Each rewrite is paste-ready text with zero placeholders.
- **D-05:** Feedback points per section are a string array. Each string naturally includes quoted profile text, analysis, and recruiter impact in prose form.
- **D-06:** `profileInsights` is always required (2-4 items), even for weak profiles.
- **D-07:** Pass the entire previous grading JSON as follow-up context.
- **D-08:** Backend fetches the user's most recent grade from `linkedin_grades` table before running the new analysis.
- **D-09:** Score reflects current profile state only, always honest. Improvement acknowledgment lives in feedback text and profileInsights, never in score inflation.
- **D-10:** Claude's discretion on caching strategy.
- **D-11:** Claude's discretion on DB schema changes.
- **D-12:** Block all unauthenticated requests. Every call requires valid JWT via `requireAuth`.

### Claude's Discretion
- Calibration caps/guardrails in the prompt (D-03)
- Caching strategy for v3.0 (D-10)
- DB schema changes beyond fixing the duplicate insert (D-11)
- Exact prompt wording for honest calibration and feedback depth
- Temperature and token tuning within the 8,192 max
- JSON repair strategy for truncated responses (existing `repairTruncatedJSON` available)
- Internal error message formatting

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIG-02 | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) with 8,192 max tokens and 60s timeout | Verified: `invokeAnthropicText` supports model, maxTokens, timeoutMs params |
| LIG-03 | 4-section scoring: Headline (20), Experience (30), Skills & Endorsements (25), Completeness (25) | New prompt design; replaces existing 12-criterion rubric |
| LIG-04 | Overall score equals mathematical sum of 4 section scores (0-100) | Validation module must enforce sum check |
| LIG-05 | Each section includes min 3-4 specific feedback points quoting actual profile text | Prompt enforcement + validation minimum array length |
| LIG-06 | Each feedback point explains recruiter impact and LinkedIn algorithm behavior | Prompt instruction only -- cannot validate content quality programmatically |
| LIG-07 | Honest calibration, no score anchoring, 10-20+ point gap between different profiles | Prompt calibration guidance; no caps/floors that create clustering |
| LIG-08 | 4 paste-ready rewrites, headline first, keyword-optimized, zero placeholders | Validation: check `rewrites` array length, first item type, no placeholder regex |
| LIG-09 | Profile insights highlight 2-4 exceptional/standout elements | Validation: check `profileInsights` array length 2-4 |
| LIG-10 | Follow-up analysis acknowledges improvements, adjusts score honestly, provides new fixes | Backend fetches previous grade from DB (D-08); prompt includes previous JSON (D-07) |
| LIG-12 | `requireAuth` for JWT verification, never trust userId from body | Auth pattern established in IPC; `requireAuth(req, { type: 'user' })` returns `UserContext` |
| LIG-13 | Output matches v3.0 JSON schema (rawScore, scoreJustification, profileInsights, nextBestAction, sectionBreakdown, topFixes, keyStrengths) | Validation module checks all required top-level fields |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Deno std/http | 0.168.0 | HTTP server for edge function | Already used across all edge functions [VERIFIED: grade-linkedin/index.ts line 1] |
| Anthropic API | 2023-06-01 | LLM inference via `invokeAnthropicText` | Shared wrapper in `_shared/anthropic.ts` [VERIFIED: codebase] |
| @supabase/supabase-js | 2.81.1 | DB access via service client | Shared client in `_shared/supabase-client.ts` [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `_shared/auth.ts` | N/A | JWT verification via `requireAuth` | Every request -- first thing after OPTIONS check [VERIFIED: codebase] |
| `_shared/rate-limiter.ts` | N/A | Per-user sliding window rate limiting | After auth, before expensive operations [VERIFIED: codebase] |
| `_shared/usage-checker.ts` | N/A | Credit tracking with `linkedin_grading` action type | After rate limit check [VERIFIED: ActionType union includes 'linkedin_grading'] |
| `_shared/json-repair.ts` | N/A | `repairTruncatedJSON` for malformed AI output | JSON parse fallback [VERIFIED: codebase] |
| `_shared/prompt-sanitizer.ts` | N/A | Injection phrase stripping | Applied automatically by `invokeAnthropicText` via `sanitizeMessages` [VERIFIED: anthropic.ts line 603] |
| `_shared/cors.ts` | N/A | CORS headers with `corsHeaders({ type: 'user' })` | All responses [VERIFIED: codebase] |
| `_shared/logger.ts` | N/A | Structured JSON logging with `createLogger` | Request lifecycle logging [VERIFIED: codebase] |

**No new dependencies needed.** Everything required exists in `_shared/`.

## Architecture Patterns

### Recommended Project Structure
```
supabase/functions/grade-linkedin/
  index.ts          # Main handler (rewrite)
  validation.ts     # Output schema validation (new file, mirrors IPC pattern)
  prompts.ts        # System prompt and user message builders (new file)
```

### Pattern 1: Request Handler Flow (from IPC)
**What:** Linear pipeline: OPTIONS -> Auth -> Rate Limit -> Body Parse -> Usage Check -> AI Call -> Validate -> DB Store -> Respond
**When to use:** Every edge function that does AI analysis
**Example:**
```typescript
// Source: interview-prep-coach/index.ts (verified pattern)
serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptionsRequest({ type: 'user' });

  const reqId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('grade-linkedin', reqId);

  try {
    // 1. Auth (returns UserContext with userId, email, tier)
    const userContext = await requireAuth(req, { type: 'user' });
    // requireAuth throws 401 Response on failure -- no null check needed
    // But if using requireInternalOrUserAuth, null is possible for internal

    // 2. Rate limit
    const rl = await checkRateLimit(userContext.userId, userContext.tier, {
      key: 'grade-linkedin',
      limits: { free: 5, pro: 15, elite: 30 },
    });
    if (!rl.allowed) return createRateLimitResponse(rl.retryAfterSeconds, 'user');

    // 3. Parse body
    const body = await req.json();
    // ... validate inputs

    // 4. Usage check
    const usage = await checkAndRecordUsage(userContext.userId, 'linkedin_grading');
    if (!usage.allowed) return createUsageLimitResponse(usage.resetDate, usage.tier, corsHeaders({ type: 'user' }));

    // 5. Fetch previous grade for follow-up context (D-08)
    // ... query linkedin_grades ordered by created_at desc

    // 6. AI call with retry (D-02: 3 attempts, exponential backoff)
    // ... invokeAnthropicText with retry wrapper

    // 7. Parse + validate response
    // ... JSON.parse -> repairTruncatedJSON fallback -> validateLinkedInGrade()

    // 8. Store result (single insert, fix duplicate)
    // ... insert into linkedin_grades

    // 9. Fire-and-forget email
    // ... send-feature-email

    // 10. Return result
  } catch (error) { ... }
});
```

### Pattern 2: Retry with Exponential Backoff (D-02)
**What:** Wrap `invokeAnthropicText` in retry logic with 1s/2s/3s delays
**When to use:** All Anthropic API calls in this function
**Example:**
```typescript
// New pattern for grade-linkedin (not present in IPC which uses fail-fast + single retry)
async function invokeWithRetry(params: AnthropicInvokeParams, log: Logger): Promise<AnthropicInvokeResult> {
  const delays = [1000, 2000, 3000]; // D-02: exponential backoff
  let lastResult: AnthropicInvokeResult;

  for (let attempt = 0; attempt < 3; attempt++) {
    lastResult = await invokeAnthropicText(params);
    if (lastResult.ok) return lastResult;

    // Don't retry on client errors (4xx) -- only server/overload errors
    if (lastResult.status >= 400 && lastResult.status < 500 && lastResult.status !== 429) {
      return lastResult;
    }

    log.warn('ai-retry', { attempt: attempt + 1, status: lastResult.status });
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
  return lastResult!;
}
```

### Pattern 3: Follow-up Context Fetch (D-07, D-08)
**What:** Before running the AI call, fetch the user's most recent grade from the DB
**When to use:** Every analysis call -- enables improvement acknowledgment
**Example:**
```typescript
// Fetch previous grade for follow-up context
const { data: previousGrade } = await getServiceClient()
  .from('linkedin_grades')
  .select('grading_data, overall_score, created_at')
  .eq('user_id', userContext.userId)
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

// Include in prompt if exists
const followUpContext = previousGrade
  ? `\n\nPREVIOUS ANALYSIS (from ${previousGrade.created_at}):\n${JSON.stringify(previousGrade.grading_data)}`
  : '';
```

### Pattern 4: Output Validation Module
**What:** Dedicated `validation.ts` that checks the v3.0 schema structure
**When to use:** After every successful AI response parse
**Example:**
```typescript
// validation.ts -- mirrors interview-prep-coach/validation.ts pattern
export function validateLinkedInGrade(parsed: unknown): ValidationResult {
  // 1. Check top-level fields exist: rawScore, scoreJustification, profileInsights,
  //    nextBestAction, sectionBreakdown, topFixes, keyStrengths, rewrites
  // 2. Check sectionBreakdown has exactly 4 sections with correct names and maxScores
  // 3. Check rawScore === sum of section scores (LIG-04)
  // 4. Check each section has >= 3 feedback points (LIG-05)
  // 5. Check rewrites array has exactly 4 items, first is headline (LIG-08)
  // 6. Check profileInsights has 2-4 items (LIG-09)
  // 7. Check no placeholder tokens in rewrites (regex: /\[.*?\]/, /\{.*?\}/, /<.*?>/)
}
```

### Anti-Patterns to Avoid
- **Trusting userId from request body:** The existing code reads `userId` from `req.json()` (line 20). Must use `requireAuth` which returns `UserContext.userId` from JWT. [VERIFIED: current code defect]
- **OpenAI response parsing:** Line 163 uses `data.choices[0].message.tool_calls` -- Anthropic API returns `content[].text`, handled by `invokeAnthropicText` wrapper. [VERIFIED: current code defect]
- **Duplicate DB insert:** Lines 177 and 231 both insert into `linkedin_grades`. Must have exactly one insert. [VERIFIED: current code defect]
- **Caching by profile_identifier without user scoping:** The current code caches grades by `profile_identifier` (line 36-47) and returns them for any user. With JWT auth, grades should be user-scoped. [VERIFIED: current code defect]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT verification | Custom token parsing | `requireAuth(req, { type: 'user' })` | Handles token extraction, Supabase auth.getUser(), profile tier lookup, error responses [VERIFIED: auth.ts] |
| Anthropic API calls | Direct fetch to API | `invokeAnthropicText()` | Handles prompt caching, sanitization, timeout, abort controller, response parsing, performance logging [VERIFIED: anthropic.ts] |
| JSON truncation repair | Custom string manipulation | `repairTruncatedJSON()` | Handles unclosed strings, dangling keys, trailing commas, stack-based bracket closing [VERIFIED: json-repair.ts] |
| Rate limiting | In-memory counters | `checkRateLimit()` with Postgres-backed counters | Atomic upsert, per-user per-endpoint, fail-open on DB error [VERIFIED: rate-limiter.ts] |
| CORS headers | Manual header objects | `corsHeaders({ type: 'user' })` | Origin-restricted via APP_URL, fail-closed if unset [VERIFIED: cors.ts] |
| Prompt injection defense | Custom regex | `sanitizeMessages()` (auto-called by `invokeAnthropicText`) | Already integrated into the Anthropic wrapper [VERIFIED: anthropic.ts line 603] |

## Common Pitfalls

### Pitfall 1: Score Sum Mismatch
**What goes wrong:** LLM outputs section scores that don't sum to rawScore, or rawScore is independently generated.
**Why it happens:** LLMs are bad at arithmetic. Prompt says "sum these" but model ignores.
**How to avoid:** Validation module computes the sum from section scores and overrides rawScore if mismatch detected. Log a warning when correction occurs.
**Warning signs:** rawScore !== sum(sectionBreakdown[*].score)

### Pitfall 2: Placeholder Tokens in Rewrites
**What goes wrong:** Model outputs `[Your Name Here]` or `{industry keyword}` instead of actual paste-ready text.
**Why it happens:** LLMs default to template patterns when unsure about specific content.
**How to avoid:** Prompt explicitly forbids brackets/braces placeholders. Validation checks for `[...]`, `{...}`, `<...>` patterns in rewrite text. On failure, retry with stronger instruction.
**Warning signs:** Regex match for `\[[A-Z].*?\]` in rewrites array

### Pitfall 3: Max Token Truncation
**What goes wrong:** 8,192 tokens may not be enough for 4 sections with 3-4 detailed feedback points each + rewrites + insights + topFixes.
**Why it happens:** Each section's feedback points include quoted text and analysis in prose form, which is verbose.
**How to avoid:** Use `repairTruncatedJSON` as fallback. Monitor `stop_reason` in Anthropic response. If truncation is frequent, reduce temperature or tighten prompt to be more concise. The v3.0 spec calculates 8,192 tokens at 150 tok/s = 54.6s, within 60s timeout with 1.15x buffer.
**Warning signs:** `stop_reason: 'max_tokens'` in response, JSON parse failures before repair

### Pitfall 4: Duplicate Insert (Existing Bug)
**What goes wrong:** Current code inserts twice into `linkedin_grades` (lines 177 and 231).
**Why it happens:** Second insert was likely added during debugging and never removed.
**How to avoid:** Single insert after validation, with the savedRecordId used for email notification.
**Warning signs:** Duplicate rows in `linkedin_grades` with same user_id and timestamps seconds apart

### Pitfall 5: profile_identifier UNIQUE Constraint Conflict
**What goes wrong:** The `linkedin_grades` table has `profile_identifier TEXT NOT NULL UNIQUE` from the original migration. Multiple users grading the same LinkedIn profile would conflict.
**Why it happens:** Original design cached grades globally by profile, not per-user.
**How to avoid:** DB migration to either drop the UNIQUE constraint on `profile_identifier` or create a composite unique on `(user_id, profile_identifier)`. Alternatively, use upsert if we want one grade per user per profile.
**Warning signs:** Insert failures with unique constraint violation

### Pitfall 6: Auth Pattern Mismatch
**What goes wrong:** Using `requireInternalOrUserAuth` (returns `UserContext | null`) instead of `requireAuth(req, { type: 'user' })` (throws 401 Response on failure).
**Why it happens:** IPC uses `requireInternalOrUserAuth` which can return null for internal callers. LinkedIn Grader is user-only.
**How to avoid:** Use `requireAuth(req, { type: 'user' })` which always returns `UserContext` or throws. Simpler, no null checks needed.
**Warning signs:** TypeScript null safety warnings on userContext

## Code Examples

### v3.0 Output Schema (LIG-13)
```typescript
// Source: CONTEXT.md D-04, D-05, D-06 + REQUIREMENTS.md LIG-13 [VERIFIED: codebase context docs]
interface LinkedInGradeResult {
  rawScore: number;                    // 0-100, sum of 4 section scores
  scoreJustification: string;          // 2-3 sentence overall assessment
  profileInsights: string[];           // 2-4 standout elements (D-06: always required)
  nextBestAction: {
    action: string;
    reason: string;
    expectedImpact: string;
  };
  sectionBreakdown: Array<{
    name: string;                      // 'Headline' | 'Experience' | 'Skills & Endorsements' | 'Profile Completeness'
    score: number;                     // 0-maxScore
    maxScore: number;                  // 20, 30, 25, 25
    feedback: string[];                // Min 3-4 items (D-05: prose with quoted text)
    status: 'excellent' | 'good' | 'needs-improvement';
  }>;
  topFixes: Array<{
    title: string;
    currentText: string;
    suggestedFix: string;
    whyItWorks: string;
    pointsGain: string;
    priority: number;
  }>;
  keyStrengths: string[];
  rewrites: string[];                  // Exactly 4. First = headline. Paste-ready, no placeholders (D-04)
}
```

### Prompt Sanitizer Integration
```typescript
// Source: _shared/anthropic.ts line 603 [VERIFIED: codebase]
// Prompt sanitizer is AUTOMATICALLY applied by invokeAnthropicText.
// No explicit call needed in grade-linkedin/index.ts.
// This addresses SEC-07 (prompt-sanitizer missing from grade-linkedin).
const sanitizedMessages = sanitizeMessages(params.messages, 'anthropic', _sanitizerLog);
```

### DB Schema: Current linkedin_grades Columns
```sql
-- Source: migrations [VERIFIED: codebase]
-- Effective schema after all migrations:
-- id: UUID PK
-- profile_url: TEXT NOT NULL
-- profile_identifier: TEXT NOT NULL (UNIQUE -- may need migration)
-- overall_score: INTEGER NOT NULL (0-100 check constraint)
-- grading_data: JSONB NOT NULL
-- user_id: UUID REFERENCES auth.users(id) (added in migration 20251223)
-- email_sent_at: TIMESTAMPTZ (added in migration 20260103)
-- created_at: TIMESTAMPTZ
-- updated_at: TIMESTAMPTZ
-- RLS: user-scoped (user_id = auth.uid()) for SELECT, INSERT, UPDATE, DELETE
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 12-criterion rubric (5-20 pts each) | 4-section architecture (20/30/25/25) | v3.0 spec | Simpler scoring, clearer section ownership |
| OpenAI-style tool_calls parsing | Anthropic text content blocks | Phase 2 pattern | `invokeAnthropicText` handles correctly |
| userId from request body | JWT-derived userId via requireAuth | Phase 2 pattern | Eliminates auth bypass vulnerability |
| Global cache by profile_identifier | User-scoped grades with follow-up | v3.0 spec (D-08) | Per-user history enables improvement tracking |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Rate limit tiers (free: 5, pro: 15, elite: 30) are appropriate for LinkedIn Grader | Architecture Patterns | Low -- easily adjustable in config object |
| A2 | 8,192 max tokens is sufficient for full v3.0 response | Common Pitfalls | Medium -- if truncation is frequent, may need to increase or split calls |
| A3 | `profile_identifier` UNIQUE constraint needs to be addressed for multi-user scenario | Common Pitfalls | High -- insert failures if two users grade same profile |
| A4 | Temperature 0.3 is appropriate for grading (balancing consistency with specificity) | Claude's Discretion | Low -- tunable parameter |
| A5 | Removing caching entirely is safe for v3.0 (each analysis is fresh per D-09) | Claude's Discretion | Low -- caching was for URL-only lookups which are being removed |

## Open Questions

1. **profile_identifier UNIQUE constraint**
   - What we know: The original schema has `UNIQUE` on `profile_identifier`. After the user_id column was added, RLS is user-scoped, but the UNIQUE constraint is table-wide.
   - What's unclear: Whether multiple users actually grade the same profile in practice.
   - Recommendation: Drop the UNIQUE index and create a non-unique index on `(user_id, profile_identifier)` for query efficiency. This is a simple migration. Falls under D-11 (Claude's discretion on DB schema changes).

2. **Existing `corsHeaders` import compatibility**
   - What we know: The current `grade-linkedin/index.ts` imports `corsHeaders` as a plain object (old API). Phase 2 IPC uses `corsHeaders({ type: 'user' })` (new API with CorsType).
   - What's unclear: Nothing -- the rewrite must use the new API.
   - Recommendation: Use `corsHeaders({ type: 'user' })` consistently, matching IPC pattern.

3. **Frontend sends userId in body (line 278 of LinkedInGrader.tsx)**
   - What we know: Frontend currently sends `userId: user?.id` in the request body. The backend must ignore this.
   - What's unclear: Whether the frontend needs any change for Phase 4.
   - Recommendation: Backend ignores body userId entirely, uses JWT-derived userId. Frontend change (if any) is Phase 5 scope.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Deno test (built-in) |
| Config file | `supabase/functions/deno.json` |
| Quick run command | `deno test supabase/functions/grade-linkedin/validation.test.ts` |
| Full suite command | `powershell -File scripts/run-edge-tests.ps1` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIG-04 | rawScore === sum of section scores | unit | `deno test supabase/functions/grade-linkedin/validation.test.ts -x` | Wave 0 |
| LIG-05 | Each section has >= 3 feedback points | unit | `deno test supabase/functions/grade-linkedin/validation.test.ts -x` | Wave 0 |
| LIG-08 | 4 rewrites, headline first, no placeholders | unit | `deno test supabase/functions/grade-linkedin/validation.test.ts -x` | Wave 0 |
| LIG-09 | profileInsights has 2-4 items | unit | `deno test supabase/functions/grade-linkedin/validation.test.ts -x` | Wave 0 |
| LIG-13 | All required top-level fields present | unit | `deno test supabase/functions/grade-linkedin/validation.test.ts -x` | Wave 0 |
| LIG-12 | Requests without valid JWT return 401 | manual-only | Requires running edge function with Supabase CLI | N/A |
| LIG-07 | Score differentiation between weak/strong profiles | manual-only | Requires live AI calls with different profiles | N/A |

### Sampling Rate
- **Per task commit:** `deno test supabase/functions/grade-linkedin/validation.test.ts -x`
- **Per wave merge:** `powershell -File scripts/run-edge-tests.ps1`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `supabase/functions/grade-linkedin/validation.test.ts` -- covers LIG-04, LIG-05, LIG-08, LIG-09, LIG-13
- [ ] `supabase/functions/grade-linkedin/validation.ts` -- validation module (new file)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireAuth(req, { type: 'user' })` -- JWT verification via Supabase Auth |
| V3 Session Management | no | Handled by Supabase Auth layer |
| V4 Access Control | yes | RLS on `linkedin_grades` (user_id = auth.uid()), usage tier gating |
| V5 Input Validation | yes | Body validation (profileContent length, type checks), prompt sanitization |
| V6 Cryptography | no | No custom crypto -- timing-safe comparison handled in auth.ts |

### Known Threat Patterns for Deno Edge Functions + LLM

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Auth bypass via body userId | Spoofing | `requireAuth` extracts userId from JWT only [VERIFIED: auth.ts] |
| Prompt injection via profile text | Tampering | `sanitizeMessages()` auto-called by `invokeAnthropicText` [VERIFIED: anthropic.ts] |
| Rate limit bypass | Denial of Service | `checkRateLimit` with Postgres-backed counters [VERIFIED: rate-limiter.ts] |
| Credit exhaustion without tracking | Elevation of Privilege | `checkAndRecordUsage` called before AI invocation [VERIFIED: usage-checker.ts] |
| CORS misconfiguration | Information Disclosure | `corsHeaders({ type: 'user' })` restricted to APP_URL [VERIFIED: cors.ts] |

## Sources

### Primary (HIGH confidence)
- `supabase/functions/grade-linkedin/index.ts` -- current implementation with identified defects
- `supabase/functions/interview-prep-coach/index.ts` -- Phase 2 completed pattern (authoritative reference)
- `supabase/functions/_shared/anthropic.ts` -- `invokeAnthropicText` API and behavior
- `supabase/functions/_shared/auth.ts` -- `requireAuth` signature and behavior
- `supabase/functions/_shared/usage-checker.ts` -- ActionType includes 'linkedin_grading'
- `supabase/functions/_shared/json-repair.ts` -- `repairTruncatedJSON` implementation
- `supabase/functions/_shared/cors.ts` -- new `corsHeaders({ type })` API
- `supabase/functions/_shared/rate-limiter.ts` -- `checkRateLimit` with CorsType
- `supabase/migrations/` -- linkedin_grades schema evolution across 4 migrations
- `.planning/phases/04-linkedin-grader-backend/04-CONTEXT.md` -- locked decisions D-01 through D-12

### Secondary (MEDIUM confidence)
- `APIcontextdocuments/linkedingrader/STRIVOLinkedInGraderFinal.pdf` -- v3.0 runtime spec (PDF could not be read due to missing pdftoppm tool; decisions from CONTEXT.md are derived from this doc)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all shared utilities verified in codebase, no new dependencies
- Architecture: HIGH -- follows established IPC pattern with minor additions (retry, follow-up fetch)
- Pitfalls: HIGH -- all defects verified by reading current source code
- Validation: MEDIUM -- test file structure follows IPC pattern but Wave 0 files need creation

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable -- Deno std and Supabase versions locked in project)

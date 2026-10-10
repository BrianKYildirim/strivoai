# Phase 4: LinkedIn Grader — Backend - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

LinkedIn Grader edge function implements the v3.0 runtime spec: 4-section scoring architecture (Headline 20, Experience 30, Skills & Endorsements 25, Profile Completeness 25), honest calibration with no score anchoring, paste-ready rewrites, profile insights, JWT auth via `requireAuth`, and follow-up analysis that acknowledges improvements. The function uses Claude Haiku 4.5 with 8,192 max tokens and 60s timeout.

</domain>

<decisions>
## Implementation Decisions

### Scoring Architecture
- **D-01:** 4 sections with a single score each. Sub-criteria (About, Education, Recommendations, Photo, Featured, Custom URL, etc.) are folded into their parent section as feedback points — not separate scores. The prompt describes what to evaluate per section but only outputs one score per section.
- **D-02:** Retry all Anthropic API failures up to 3 attempts with exponential backoff (1s, 2s, 3s). Return error to user only after all 3 attempts fail. This follows the v3.0 spec explicitly.
- **D-03:** Claude's discretion on whether to include calibration caps/guardrails in the prompt. Will determine what produces the most honest score differentiation between weak and strong profiles.

### Output Schema & Rewrites
- **D-04:** Rewrites are a top-level `rewrites` array in the JSON output, separate from `topFixes`. First element is always the headline rewrite. Each rewrite is paste-ready text with zero placeholders. Clear separation: rewrites = "paste this", topFixes = "change this".
- **D-05:** Feedback points per section are a string array. Each string naturally includes quoted profile text, analysis, and recruiter impact in prose form. No structured sub-objects — keeps the prompt simpler and gives the LLM more flexibility.
- **D-06:** `profileInsights` is always required (2-4 items), even for weak profiles. Every profile has something worth surfacing to prevent purely negative responses.

### Follow-up Analysis
- **D-07:** Pass the entire previous grading JSON as follow-up context — full sectionBreakdown, topFixes, rewrites, and score from the last analysis. Enables section-by-section comparison and specific improvement detection.
- **D-08:** Backend fetches the user's most recent grade from `linkedin_grades` table before running the new analysis. Single source of truth — frontend doesn't need to pass previous results.
- **D-09:** Score reflects current profile state only, always honest. Improvement acknowledgment lives in feedback text and profileInsights, never in score inflation. E.g., "Your headline improved from title-only to keyword-rich — now scoring 16/20 (was 8/20)."

### Caching & DB Storage
- **D-10:** Claude's discretion on caching strategy — whether to remove caching entirely, version-tag cached grades, or take another approach based on what best fits the v3.0 rewrite.
- **D-11:** Claude's discretion on whether to add queryable columns (e.g., `schema_version`, `section_scores`) to `linkedin_grades` or keep the current table structure with the JSON blob.
- **D-12:** Block all unauthenticated requests. Every call requires a valid JWT via `requireAuth`. Viewing saved results happens through the Supabase client with RLS, not through this edge function.

### Claude's Discretion
- Calibration caps/guardrails in the prompt (D-03)
- Caching strategy for v3.0 (D-10)
- DB schema changes beyond fixing the duplicate insert (D-11)
- Exact prompt wording for honest calibration and feedback depth
- Temperature and token tuning within the 8,192 max
- JSON repair strategy for truncated responses (existing `repairTruncatedJSON` available)
- Internal error message formatting

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v3.0 Runtime Spec
- `APIcontextdocuments/linkedingrader/STRIVOLinkedInGraderFinal.pdf` — Production runtime spec defining mission, model config, scoring architecture, access/credits, input methods. This is the authoritative source for LinkedIn Grader behavior.

### Edge Function
- `supabase/functions/grade-linkedin/index.ts` — Existing edge function to rewrite. Key issues: trusts userId from request body (line 20), uses 12-criterion rubric (needs 4-section replacement), has OpenAI-style response parsing (line 163), duplicate DB insert (lines 177 and 231), imports but never calls `requireAuth`
- `supabase/functions/_shared/anthropic.ts` — Shared Anthropic client wrapper. `fixtureKey` includes `'grade_linkedin'`. `invokeAnthropicText()` handles API calls, error codes, timeouts
- `supabase/functions/_shared/usage-checker.ts` — Usage tracking with `ActionType` union (already includes `'linkedin_grading'`)
- `supabase/functions/_shared/auth.ts` — Auth helpers (`requireAuth` for JWT verification)
- `supabase/functions/_shared/rate-limiter.ts` — Rate limiting utility
- `supabase/functions/_shared/json-repair.ts` — JSON repair for truncated LLM responses
- `supabase/functions/_shared/cors.ts` — CORS headers and OPTIONS handling
- `supabase/functions/_shared/logger.ts` — Structured logging with `createLogger()`

### Prior Phase Pattern Reference
- `.planning/phases/02-interview-prep-coach-backend/02-CONTEXT.md` — Phase 2 established patterns for edge function overhaul: model swap, usage tracking fix, validation, retry strategy. LinkedIn Grader follows similar patterns but with its own retry spec (3 attempts vs. IPC's fail-fast).

### DB Schema
- `supabase/migrations/` — Contains `linkedin_grades` table definition. Fields: `user_id`, `profile_url`, `profile_identifier`, `overall_score`, `grading_data` (JSONB)

### Requirements
- `.planning/REQUIREMENTS.md` — LIG-02 through LIG-13 define acceptance criteria for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `grade-linkedin/index.ts` — Existing function with auth imports, rate limiting, usage checking, Anthropic call, DB storage. Needs substantial rewrite but structure is reusable
- `_shared/anthropic.ts` — `invokeAnthropicText()` already supports `grade_linkedin` fixture key, handles timeouts and error codes
- `_shared/json-repair.ts` — `repairTruncatedJSON()` for recovering malformed AI output
- `_shared/logger.ts` — Structured logging with `createLogger()` already used across functions
- `_shared/usage-checker.ts` — Already has `'linkedin_grading'` in the `ActionType` union

### Established Patterns
- Auth: `requireAuth(req)` → userId from JWT → never trust request body
- Rate limiting: `checkRateLimit(userId, tier, { key, limits })` → `createRateLimitResponse()` if blocked
- Usage tracking: `checkAndRecordUsage(userId, 'linkedin_grading')` → `createUsageLimitResponse()` if depleted
- AI call: `invokeAnthropicText({ model, system, messages, maxTokens, temperature, timeoutMs, fixtureKey })`
- JSON parsing: try raw parse → catch → `repairTruncatedJSON()` → parse again
- Error response: structured JSON with HTTP status codes and CORS headers

### Integration Points
- Frontend `LinkedInGrader.tsx` (`src/pages/LinkedInGrader.tsx`) calls this function via Supabase invoke
- `linkedin_grades` table stores results with `grading_data` JSONB column
- `can_perform_ai_action()` SQL function checks tier limits
- Email notification via `send-feature-email` function (fire-and-forget)

</code_context>

<specifics>
## Specific Ideas

- The v3.0 spec defines the mission as: "Is my LinkedIn profile actually helping me get recruited — or silently costing me opportunities?" — the prompt should lead with this framing
- Scoring must evaluate using "real LinkedIn Recruiter search patterns, not just 'is the section filled in'"
- Output must be "specific to THIS profile, calibrated honestly, and immediately implementable"
- Must "surface what the user is doing exceptionally well so they understand their competitive advantages"
- The spec calls for 150 tok/s throughput assumption with 1.15 buffer for the 60s timeout calculation

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-linkedin-grader-backend*
*Context gathered: 2026-04-11*

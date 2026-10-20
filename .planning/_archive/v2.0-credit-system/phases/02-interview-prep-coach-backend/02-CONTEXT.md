# Phase 2: Interview Prep Coach — Backend - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Interview Prep Coach edge function generates 8 structured, Claude-powered interview questions from a job description with correct DB tracking and tier gating. User submits a job description (and optional title/company), receives exactly 8 tailored questions in the correct category distribution. Free tier users are blocked; Pro/Elite users proceed with usage tracking under the `interview_prep` action type.

</domain>

<decisions>
## Implementation Decisions

### AI Model & Prompt Strategy

* **D-01:** Use Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) — fast, cheap, sufficient for structured Q\&A generation with a well-constrained prompt
* **D-02:** Prompt auto-detects seniority level from job description signals (e.g., "5+ years experience" → senior-level questions) and calibrates difficulty accordingly
* **D-03:** Input is job description only (+ optional title/company). No resume text input — keeps the function simple and matches IPC-01 spec. Resume-aware coaching is a v2 feature

### Tier Gating & Usage Tracking

* **D-04:** Keep both gating layers: rate limiter (free: 0, pro: 15, elite: 30) for fast-reject AND usage checker for credit tracking. Defense in depth matching other edge functions
* **D-05:** DB migration adds `interview_prep` to the CHECK constraint on `analysis_type`. Simple ALTER — no backfill of existing data (interview prep was incorrectly tracked as `skills_gap_analysis` but there's no reliable way to distinguish those rows)
* **D-06:** Update `ActionType` union in `usage-checker.ts` to include `'interview_prep'`
* **D-07:** Fix usage tracking call from `checkAndRecordUsage(userId, 'skills_gap_analysis')` to `checkAndRecordUsage(userId, 'interview_prep')`

### Error Handling & Edge Cases

* **D-08:** Cap job description at 12,000 characters (truncate, matching LinkedIn Grader's limit). Most JDs are 2,000-5,000 chars
* **D-09:** On Anthropic API overload (529), fail immediately with 503 and clear message "Service temporarily busy, please try again." No queue fallback or automatic retry for overload
* **D-10:** Keep existing 50-char minimum for job description input

### Response Validation

* **D-11:** Validate AI response structure AND counts: exactly 8 questions, correct category distribution (behavioral 3, technical 2, situational 1, culture fit 1, leadership 1), all required fields present (category, difficulty, question, starOutline, sampleOpener, tips, redFlags)
* **D-12:** If validation fails, retry the AI call once automatically. If second attempt also fails, return 500 error. One retry adds \~2-3s latency but doubles success rate for edge cases

### Claude's Discretion

* Exact prompt wording refinements for quality improvement
* Temperature and max token tuning (currently 0.7 / 8000)
* JSON repair strategy for truncated responses (existing `repairTruncatedJSON` available)
* Internal error message formatting
* Whether to add prompt sanitizer (noted as SEC-07 gap but that's Phase 9 scope)

</decisions>

\<canonical\_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Edge Function

* `supabase/functions/interview-prep-coach/index.ts` — Existing edge function to modify. Has auth, rate limiting, prompt, JSON parsing. Key fix: line 58 usage tracking uses wrong action type
* `supabase/functions/_shared/anthropic.ts` — Shared Anthropic client wrapper. `fixtureKey` already includes `'interview_prep'`
* `supabase/functions/_shared/usage-checker.ts` — Usage tracking. `ActionType` union needs `'interview_prep'` added
* `supabase/functions/_shared/auth.ts` — Auth helpers (`requireInternalOrUserAuth` already used)
* `supabase/functions/_shared/rate-limiter.ts` — Rate limiting (already configured with free: 0)
* `supabase/functions/_shared/json-repair.ts` — JSON repair utility (already imported)

### DB Migrations

* `supabase/migrations/20251222223116_8abce0df-2f95-472e-a9e5-dca9a6d69c53.sql` — Original CHECK constraint on `analysis_type` (needs `interview_prep` added)
* `supabase/migrations/20260409000000_add_recruiting_lens_analysis_type.sql` — Most recent CHECK constraint update (added `recruiting_lens`)

### Requirements

* `.planning/REQUIREMENTS.md` — IPC-01 through IPC-10 define acceptance criteria for this phase

\</canonical\_refs>

\<code\_context>

## Existing Code Insights

### Reusable Assets

* `interview-prep-coach/index.ts` — Existing function with \~80% of needed structure. Needs model swap, usage fix, validation, and prompt refinement
* `_shared/anthropic.ts` — `invokeAnthropicText()` handles API calls, error codes, timeouts. Already supports `interview_prep` fixture key
* `_shared/json-repair.ts` — `repairTruncatedJSON()` for recovering malformed AI output
* `_shared/logger.ts` — Structured logging with `createLogger()` already in use
* `_shared/cors.ts` — CORS headers and OPTIONS handling already in use

### Established Patterns

* Auth: `requireInternalOrUserAuth(req)` → userId extraction → null check → 401
* Rate limiting: `checkRateLimit(userId, tier, { key, limits })` → `createRateLimitResponse()` if blocked
* Usage tracking: `checkAndRecordUsage(userId, actionType)` → `createUsageLimitResponse()` if depleted
* AI call: `invokeAnthropicText({ model, system, messages, maxTokens, temperature, fixtureKey })`
* JSON parsing: try raw parse → catch → `repairTruncatedJSON()` → parse again

### Integration Points

* Frontend `InterviewPrepCoach.tsx` calls this function via Supabase invoke
* `can_perform_ai_action()` SQL function checks tier limits (called by usage-checker)
* DB `usage_tracking` table records each analysis with `analysis_type`

\</code\_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

***

*Phase: 02-interview-prep-coach-backend*
*Context gathered: 2026-04-11*

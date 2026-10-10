# Phase 19: interview-prep-flashcards-and-quiz - Research

**Researched:** 2026-04-17
**Domain:** Supabase Edge Functions (Deno) + React frontend tier-gated AI feature
**Confidence:** HIGH

## Summary

Phase 19 replaces the existing Interview Prep v1.0 backend (`interview-prep-coach`) with a two-function tier-aware system (`interview-prep-analyze` + `interview-prep-evaluate`), ships three new database tables (`interview_quizzes`, `interview_quiz_answers`, `interview_streaks`), and delivers the complete frontend for Pro flashcards, Elite interactive quiz, streak tracking, and daily cap enforcement.

The technical domain is well-understood -- Phase 19 follows established patterns from Phases 13-18 (Merit gateway wrapping, tier-conditional prompts, auto-fetch resume, parallel AI calls). The primary novel elements are: (1) the streak system with rolling-hour cold/expire logic, (2) the batch quiz submission + single-AI-call evaluation pattern, and (3) the two-function split where generation and evaluation are separate edge functions. All three are straightforward to implement using existing shared utilities.

The existing `interview-prep-coach` (307 lines) and `InterviewPrep.tsx` (1097 lines) provide pattern reference but are NOT the basis for the new code. The v1.0 frontend has a complex multi-option UI (interview type, categories, difficulty, duration, format) that the v2.0 spec replaces with a simpler flow: paste JD + optional title/company, auto-fetch resume server-side, generate flashcards (Pro) or quiz (Elite).

**Primary recommendation:** Follow the Recruiting Lens edge function pattern for structure (auth, tier gate, Merit wrapping, parallel/single AI call), add streak/cap checking as a pre-generation step in `interview-prep-analyze`, and rewrite the frontend from scratch rather than refactoring the v1.0 page.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Edge function auto-fetches the user's most recent analyzed resume from the `resumes` table server-side using service-role client. No resume text in request body -- just JD text + optional job title/company.
- **D-02:** If no resume on file, return HTTP 400 with clear error. No Merit deduction.
- **D-03:** Elite quiz uses batch submission. Frontend shows questions one at a time locally, sends all answers in single request to `interview-prep-evaluate`. One AI evaluation call, zero additional Merit charge on evaluate.
- **D-04:** Quiz questions persisted to database on generation. `interview-prep-analyze` writes quiz row + questions to `interview_quizzes` immediately, returns `quiz_id`. `interview-prep-evaluate` receives `quiz_id` + answers.
- **D-05:** `interview-prep-evaluate` receives `{ quiz_id, answers: [{ question_id, answer_text }] }`. Reads original questions, sends Q+A to AI for STAR scoring, writes scores back.
- **D-06:** `interview-prep-coach` kept deployed behind `MERIT_SYSTEM_ENABLED=false` as legacy fallback.
- **D-07:** Frontend `InterviewPrep.tsx` is rewritten to call new edge functions. Simpler flow: paste JD + optional title/company, generate.
- **D-08:** Phase 19 ships complete Interview Prep frontend (UX-09, UX-10). Pro flashcards, Elite quiz card UI, results screen, streak display.
- **D-09:** Phase 20 does not touch Interview Prep.
- **D-10:** Streak uses rolling hours from `last_quiz_at` + UTC day boundaries. Cold at 24h, expires at 48h, streak increments on first quiz after midnight UTC, daily cap resets at midnight UTC.
- **D-11:** Streak and daily cap enforcement inside `interview-prep-analyze`. No separate streak RPC.
- **D-12:** Streak applies to Elite quiz only, not Pro flashcards.
- **D-13:** `interview-prep-analyze` is a single function with tier-conditional behavior. Pro: 3 flashcards (8 Merits). Elite: 5-7 quiz questions (5 Merits). Free: blocked.
- **D-14:** `interview-prep-evaluate` is Elite-only. Pro users get 403. No Merit deduction on evaluate.

### Claude's Discretion
- Exact column definitions for 3 new tables
- RLS policy design (service-role-only write / user-read-own pattern)
- Whether to share a `_shared/interview-prep-prompts.ts` or split
- Exact flashcard output JSON shape
- Whether streak display is standalone component or embedded
- Animation and visual design (follow "Institutional Intelligence" patterns)

### Deferred Ideas (OUT OF SCOPE)
- Resume quiz (returning to incomplete quiz later)
- Quiz history/review page
- Flashcard spaced repetition
- Voice-style interview mode
- LinkedIn input for interview prep
- Running tier validation in CI
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IPC-01 | Free tier shows `<ProFeatureGate>` | ProFeatureGate component exists (305 lines), directly usable |
| IPC-02 | Pro tier: 3 STAR flashcards from resume + JD, 8 Merits | `loadPromptVariant('interview', 'pro', params)` pattern, `withMerits` for deduction |
| IPC-03 | Elite tier: 5-7 quiz questions, 500-char limit, 5 Merits | `loadPromptVariant('interview', 'elite', params)`, `withMerits` for deduction |
| IPC-04 | Elite quiz evaluation: AI STAR scoring + readiness score | `interview-prep-evaluate` function, `invokeAnthropicText` for evaluation call |
| IPC-05 | Streak system: cold at 24h, expires at 48h | `interview_streaks` table, enforcement in `interview-prep-analyze` |
| IPC-06 | Daily quiz cap: 3/day server-side | COUNT query on `interview_quizzes` filtered to UTC day |
| IPC-07 | 3 new tables: interview_quizzes, interview_quiz_answers, interview_streaks | Supabase migration, RLS policies |
| IPC-08 | New edge function `interview-prep-analyze` | Follows recruiting-lens pattern: auth, tier gate, Merit wrap, AI call |
| IPC-09 | New edge function `interview-prep-evaluate` | Elite-only, ownership check, single AI call, write scores back |
| IPC-10 | Quiz maxTokens=10000, timeout 80,000ms | `getTimeout('elite', 'quiz')` already returns 80,000ms in tier-config.ts |
| BACK-06 | New edge function interview-prep-analyze | Same as IPC-08 |
| BACK-07 | New edge function interview-prep-evaluate | Same as IPC-09 |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Free-tier gating | Frontend (React) | API (Edge Function) | `ProFeatureGate` blocks UI; edge function returns 403 as defense-in-depth |
| Resume auto-fetch | API (Edge Function) | Database | Server-side only via service-role client -- more secure than client-supplied text |
| Flashcard generation (Pro) | API (Edge Function) | -- | AI call + Merit deduction server-side |
| Quiz question generation (Elite) | API (Edge Function) | Database | AI call generates, DB persists questions + quiz_id |
| Quiz answer submission + scoring | API (Edge Function) | Database | AI scores all answers, writes back to DB |
| Streak tracking | API (Edge Function) | Database | Read/write `interview_streaks` server-side only |
| Daily cap enforcement | API (Edge Function) | Database | COUNT query on `interview_quizzes` server-side |
| Quiz UI flow (one-at-a-time) | Frontend (React) | -- | Local state management, no server round-trips between questions |
| Streak display | Frontend (React) | -- | Visual component reading streak data from quiz generation response |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase Edge Functions (Deno) | 2.76.9 CLI | Backend edge functions for analyze + evaluate | Existing infrastructure, all features use it |
| @supabase/supabase-js | 2.81.1 | Database + auth + storage operations | Already in use across all features |
| Anthropic Claude API | v2023-06-01 | AI generation and evaluation | Direct fetch via `_shared/anthropic.ts`, no SDK |
| React | 18.3.1 | Frontend UI | Existing framework |
| shadcn/ui + Radix UI | (bundled) | Component primitives | Existing design system |
| Framer Motion | 12.23.26 | Animations and transitions | Existing in project |
| Tailwind CSS | 3.4.17 | Styling | Existing utility-first CSS |

### Supporting (all existing shared modules)
| Library/Module | Location | Purpose | When to Use |
|---------|---------|---------|-------------|
| `_shared/merit-gateway.ts` | Edge functions | `withMerits` wrapper for Merit deduction + refund | Every AI call in interview-prep-analyze |
| `_shared/tier-prompts.ts` | Edge functions | `loadPromptVariant` for tier-conditional prompts | Prompt selection in both functions |
| `_shared/tier-config.ts` | Edge functions | `getTimeout`, `getModel`, `TIER_MAX_TOKENS` | Timeout + model config for AI calls |
| `_shared/anthropic.ts` | Edge functions | `invokeAnthropicText` | All AI API calls |
| `_shared/auth.ts` | Edge functions | `requireAuth`, `requireInternalOrUserAuth` | Endpoint authentication |
| `_shared/cors.ts` | Edge functions | `corsHeaders`, `handleOptionsRequest` | CORS handling |
| `_shared/json-repair.ts` | Edge functions | `repairTruncatedJSON` | Handling truncated AI JSON responses |
| `_shared/logger.ts` | Edge functions | `createLogger` | Structured logging |
| `_shared/supabase-client.ts` | Edge functions | `getServiceClient` | Server-side DB operations |
| `_shared/prompt-sanitizer.ts` | Edge functions | `sanitizeUserContent` | Sanitize JD input before AI call |
| `_shared/pdf-parser.ts` | Edge functions | `extractPDFText` | Re-extract resume text from stored PDF |
| `ProFeatureGate.tsx` | Frontend | Free-tier gate component | IPC-01 |
| `UniversalAnalyzing.tsx` | Frontend | Loading state overlay | Quiz/flashcard generation loading |
| `invokeWithTimeout` | Frontend | Supabase function invocation | Calling edge functions from React |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PDF re-extraction server-side | `grading_data` summary (like Recruiting Lens) | Re-extraction gives actual resume text for better flashcard/quiz quality; `grading_data` is analysis results not raw text. Cost: one storage download + CPU per call. Worth it for interview prep quality. |
| Single edge function for both generate + evaluate | Two separate functions | Two functions is cleaner: different auth (Pro+Elite vs Elite-only), different Merit costs (8/5 vs 0), different payloads. CONTEXT.md D-03/D-14 mandates this split. |
| Server-side streaming | Single response | Quiz/flashcard output is structured JSON, not streaming text. Single response is simpler and matches the pattern. |

## Architecture Patterns

### System Architecture Diagram

```
[Browser] ---> POST /interview-prep-analyze
                |
                +-- OPTIONS? --> 200 (CORS preflight)
                |
                +-- requireAuth(user) --> UserContext { userId, tier }
                |
                +-- tier === 'free'? --> 403 "Pro or Elite required"
                |
                +-- (Elite only) Check daily cap:
                |   COUNT(*) FROM interview_quizzes
                |   WHERE user_id=X AND created_at >= today_midnight_utc
                |   >= 3? --> 429 "Daily quiz limit reached"
                |
                +-- Auto-fetch resume:
                |   SELECT file_path FROM resumes
                |   WHERE user_id=X AND analyzed_at IS NOT NULL
                |   ORDER BY analyzed_at DESC LIMIT 1
                |   --> Download PDF from Storage --> extractPDFText()
                |   No resume? --> 400 "Upload and analyze a resume first"
                |
                +-- withMerits(ctx, 'interview_prep', async (txId) => {
                |     loadPromptVariant('interview', tier, {resumeText, jd})
                |     invokeAnthropicText({...})
                |     parseAndValidate()
                |     INSERT INTO interview_quizzes + interview_quiz_answers
                |     (Elite only) UPDATE interview_streaks
                |     return Response(JSON)
                |   })
                |
                <-- { quiz_id, questions: [...], streak?, dailyUsage? }


[Browser] ---> POST /interview-prep-evaluate (Elite only)
                |
                +-- requireAuth(user) --> UserContext { userId, tier }
                |
                +-- tier !== 'elite'? --> 403
                |
                +-- Validate { quiz_id, answers: [{question_id, answer_text}] }
                |
                +-- SELECT * FROM interview_quizzes WHERE id=quiz_id AND user_id=userId
                |   Not found / not owner? --> 403
                |
                +-- SELECT * FROM interview_quiz_answers WHERE quiz_id=quiz_id
                |   Build Q+A pairs for AI evaluation
                |
                +-- invokeAnthropicText({evaluation prompt with Q+A pairs})
                |
                +-- Parse STAR scores, write back to interview_quiz_answers
                |   UPDATE interview_quizzes SET overall_score, evaluated_at
                |
                <-- { scores: [...], overallReadiness, suggestions }
```

### Recommended Project Structure

```
supabase/functions/
  interview-prep-analyze/
    index.ts                    # Main handler: auth, tier gate, cap, resume fetch, Merit, AI
  interview-prep-evaluate/
    index.ts                    # Elite-only: validate quiz ownership, AI scoring, write back
  _shared/
    interview-prep-prompts.ts   # NEW: registerFeaturePrompts('interview', { free, pro, elite })
    interview-prep-validation.ts # NEW: validation for flashcard + quiz output shapes

supabase/migrations/
  20260418000000_interview_prep_tables.sql  # 3 new tables + RLS + indexes

src/pages/
  InterviewPrep.tsx             # REWRITE: simplified input form + tier-conditional results
src/components/
  InterviewFlashcards.tsx       # NEW: Pro flashcard display (3 read-only cards)
  InterviewQuiz.tsx             # NEW: Elite quiz one-at-a-time flow
  InterviewQuizResults.tsx      # NEW: Elite results with STAR breakdown
  InterviewStreakDisplay.tsx    # NEW: Streak flame + counter + daily usage
```

### Pattern 1: Merit-Wrapped Edge Function with Tier Gate
**What:** The established pattern for tier-gated AI features (Phases 15-18)
**When to use:** `interview-prep-analyze` follows this exactly
**Example:**
```typescript
// Source: supabase/functions/recruiting-lens/index.ts (verified in codebase)
import { MERIT_SYSTEM_ENABLED, withMerits, MeritRefundable } from '../_shared/merit-gateway.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getTimeout, getModel } from '../_shared/tier-config.ts';
import { loadPromptVariant } from '../_shared/tier-prompts.ts';

// Inside handler:
const userContext = await requireAuth(req, { type: 'user' });

if (userContext!.tier === 'free') {
  return new Response(
    JSON.stringify({ error: 'pro_or_elite_required', message: 'Interview Prep requires Pro or Elite.' }),
    { status: 403, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
  );
}

if (MERIT_SYSTEM_ENABLED && userContext) {
  const gated = await withMerits(
    { userId: userContext.userId, tier: userContext.tier as 'free' | 'pro' | 'elite', corsType: 'user' },
    'interview_prep',
    async (_txId) => {
      // Validate inputs, fetch resume, build prompt, call AI, persist results
      // On AI failure: throw new MeritRefundable(status, error)
    },
  );
  if (!gated.ok) return gated.response;
  return gated.value;
}
```

### Pattern 2: Auto-Fetch Resume Server-Side
**What:** Download user's most recent analyzed resume from Supabase Storage, extract text
**When to use:** `interview-prep-analyze` to get resume context without client-supplied text (D-01)
**Example:**
```typescript
// Source: Pattern derived from analyze-career/index.ts (line 420) and Upload.tsx (line 191)
const supabase = getServiceClient();

// Find most recent analyzed resume
const { data: resume, error: resumeError } = await supabase
  .from('resumes')
  .select('id, file_path, file_name')
  .eq('user_id', userId)
  .not('analyzed_at', 'is', null)
  .order('analyzed_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (!resume?.file_path) {
  // D-02: No resume on file
  return new Response(
    JSON.stringify({ error: 'no_resume', message: 'Upload and analyze a resume first to generate interview prep.' }),
    { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
  );
}

// Download and extract text
const { data: pdfData, error: downloadError } = await supabase.storage
  .from('resumes')
  .download(resume.file_path);

if (downloadError || !pdfData) {
  throw new Error('Failed to download resume file');
}

const resumeText = await extractPDFText(await pdfData.arrayBuffer());
```

### Pattern 3: Streak + Daily Cap Pre-Check (Elite Only)
**What:** Before generating quiz questions, check daily cap and update streak
**When to use:** Inside `interview-prep-analyze` for Elite users only (D-11, D-12)
**Example:**
```typescript
// Source: [ASSUMED] - derived from CONTEXT.md D-10, D-11, D-12
if (tier === 'elite') {
  const now = new Date();
  const todayMidnightUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // Daily cap check (D-10, IPC-06)
  const { count } = await supabase
    .from('interview_quizzes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', todayMidnightUtc.toISOString());

  if ((count ?? 0) >= 3) {
    return new Response(
      JSON.stringify({ error: 'daily_cap_reached', message: 'Daily quiz limit reached (3/3). Try again tomorrow.' }),
      { status: 429, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
    );
  }

  // Streak update happens AFTER successful generation (inside withMerits callback)
}
```

### Anti-Patterns to Avoid
- **Client-supplied resume text:** D-01 explicitly forbids this. The edge function fetches the resume server-side for security. Never trust `req.body.resumeText`.
- **Charging Merits on evaluate:** D-14 says `interview-prep-evaluate` costs 0 Merits. The 5-Merit charge happens at generation time only.
- **Separate streak RPC:** D-11 says streak logic is inside `interview-prep-analyze`, not a separate function/RPC.
- **Streaming response:** This feature returns structured JSON (flashcard array or quiz questions array), not streaming text. Don't use `streamAnthropicText`.
- **Modifying Phase 14 primitives:** CONTEXT.md explicitly says Phase 14's loader, tier-config, and LockedSection are consumed, not modified.
- **Flashcard editing/interaction:** Pro flashcards are read-only (IPC-02). No answer textarea, no submission.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Merit deduction + refund | Custom RPC calls | `withMerits()` from merit-gateway.ts | Handles rate limiting, deduction, refund on AI failure, logging |
| Prompt variant selection | Manual if/else on tier | `loadPromptVariant('interview', tier, params)` | Auto-prepends GLOBAL_AI_PRINCIPLES for Pro/Elite, enforces GATE-04 |
| Timeout + model selection | Hardcoded values | `getTimeout(tier, callType)`, `getModel(tier, 'interview')` | Single source of truth, spec-mandated values |
| JSON repair for AI output | Custom string manipulation | `repairTruncatedJSON()` from json-repair.ts | Handles all known truncation patterns |
| CORS handling | Manual headers | `corsHeaders()`, `handleOptionsRequest()` | Consistent across all functions |
| Authentication | Manual JWT parsing | `requireAuth(req, { type: 'user' })` | Returns UserContext with tier from profiles |
| PDF text extraction | Custom parser | `extractPDFText()` from pdf-parser.ts | Handles text streams + OCR fallback |

**Key insight:** Phase 19 should import and compose existing shared utilities, not reimplement any infrastructure. The only novel code is the prompt content, the streak/cap logic, the database operations, and the frontend components.

## Common Pitfalls

### Pitfall 1: Resume Text Extraction Timeout
**What goes wrong:** Downloading a large PDF from Supabase Storage and extracting text adds latency to the quiz generation flow. Combined with the 80,000ms AI timeout, the total request might exceed Supabase Edge Function limits.
**Why it happens:** PDF extraction (especially OCR fallback) can take 5-15 seconds. The 80,000ms timeout is for the AI call only, not the total request.
**How to avoid:** Extract text BEFORE the `withMerits` call (so Merit is not charged if extraction fails). Cache extracted text if possible by storing it alongside `grading_data` in a future column. For now, the extraction + AI call must complete within the Supabase function timeout (~300s default).
**Warning signs:** Requests timing out at ~80s even though extraction took 20s first.

### Pitfall 2: Daily Cap Race Condition
**What goes wrong:** Two near-simultaneous requests from the same Elite user could both pass the daily cap check (count=2) and both succeed, resulting in 4 quizzes in a day.
**Why it happens:** The COUNT check and the INSERT are not atomic. Two concurrent requests read count=2, both proceed to generate.
**How to avoid:** Use a database-level constraint or an advisory lock. Simplest approach: add a `BEFORE INSERT` trigger on `interview_quizzes` that counts today's rows and raises an exception if >= 3. Alternatively, accept the small race window since it requires near-simultaneous requests.
**Warning signs:** More than 3 `interview_quizzes` rows for a single user on a single UTC day.

### Pitfall 3: Streak Midnight UTC Boundary Edge Case
**What goes wrong:** A user completes a quiz at 23:59 UTC and another at 00:01 UTC. The streak logic must count these as two separate days (incrementing streak) even though they're 2 minutes apart.
**Why it happens:** Streak increment triggers on "first quiz after midnight UTC" (D-10). If the code checks `last_quiz_at` timestamp difference instead of calendar day boundaries, it might not increment.
**How to avoid:** Compare UTC dates, not time differences: `last_quiz_date = last_quiz_at::date`, `today = now()::date`. If `today > last_quiz_date`, increment streak. The 24h/48h cold/expire logic uses the timestamp for the display state, but the increment logic uses calendar day boundaries.
**Warning signs:** Streaks not incrementing when user does quizzes on consecutive calendar days near midnight.

### Pitfall 4: Quiz Ownership Bypass in Evaluate
**What goes wrong:** A malicious user calls `interview-prep-evaluate` with another user's `quiz_id` and gets access to their questions or scores.
**Why it happens:** Failing to verify that the authenticated user owns the quiz before processing.
**How to avoid:** Always query `WHERE id = quiz_id AND user_id = authenticated_user_id`. Return 403 if no match. The RLS policy on `interview_quizzes` should enforce `user_id = auth.uid()` for reads, but the edge function uses service-role client (bypasses RLS), so the ownership check MUST be in application code.
**Warning signs:** Evaluate endpoint returning results without an ownership query.

### Pitfall 5: Flashcard vs Quiz Response Shape Confusion
**What goes wrong:** The frontend expects different JSON shapes for Pro (flashcards with answers) vs Elite (questions without answers), but the edge function returns the wrong shape.
**Why it happens:** Single function (`interview-prep-analyze`) with tier-conditional behavior means the prompt and response parsing must diverge cleanly by tier.
**How to avoid:** Use completely separate prompt builders for Pro and Elite in `interview-prep-prompts.ts`. Validate the response shape with separate validation functions. Return a discriminated response: `{ mode: 'flashcards', flashcards: [...] }` vs `{ mode: 'quiz', quiz_id: string, questions: [...] }`.
**Warning signs:** Frontend rendering errors because the response doesn't match the expected shape for the user's tier.

### Pitfall 6: Merit Deduction Before Input Validation
**What goes wrong:** Merit is deducted before validating that the JD is long enough or the user has a resume, resulting in charging for an invalid request.
**Why it happens:** Placing `withMerits` before input validation in the handler flow.
**How to avoid:** Validate ALL inputs (JD length, resume existence) BEFORE entering the `withMerits` callback. This matches the pattern in `interview-prep-coach` lines 51-62 where input validation happens before `withMerits`. The CONTEXT.md decisions (D-02) confirm: no Merit deduction if no resume on file.
**Warning signs:** Users reporting Merit charges with no quiz/flashcard output.

## Code Examples

### Database Migration: Three New Tables

```sql
-- Source: [ASSUMED] - derived from CONTEXT.md D-04, D-05, IPC-07, D-10

-- interview_quizzes: master quiz record
CREATE TABLE interview_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('flashcard', 'quiz')),
  tier text NOT NULL CHECK (tier IN ('pro', 'elite')),
  job_description text NOT NULL,
  job_title text,
  company text,
  resume_id uuid REFERENCES resumes(id),
  overall_score integer,           -- NULL until evaluated (Elite only)
  evaluated_at timestamptz,        -- NULL until evaluated (Elite only)
  merit_transaction_id text,       -- Links to merit_transactions
  created_at timestamptz NOT NULL DEFAULT now()
);

-- interview_quiz_answers: individual questions (and optionally user answers + scores)
CREATE TABLE interview_quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES interview_quizzes(id) ON DELETE CASCADE,
  question_order integer NOT NULL,
  question_text text NOT NULL,
  -- For flashcards (Pro): star_answer is populated on generation
  star_answer jsonb,               -- { situation, task, action, result } for flashcards
  -- For quiz (Elite): user_answer and scores populated on evaluation
  user_answer text,                -- User's typed answer (max 500 chars)
  score integer,                   -- STAR score (0-100) from AI evaluation
  scoring_breakdown jsonb,         -- { situation_score, task_score, action_score, result_score, feedback }
  suggestions text[],              -- Improvement suggestions per answer
  created_at timestamptz NOT NULL DEFAULT now()
);

-- interview_streaks: one row per user, upserted on quiz generation
CREATE TABLE interview_streaks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak integer NOT NULL DEFAULT 0,
  last_quiz_at timestamptz,        -- Rolling timestamp for cold/expire calculation
  last_quiz_date date,             -- UTC date of last quiz (for "first quiz of day" check)
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_interview_quizzes_user_created
  ON interview_quizzes(user_id, created_at DESC);

CREATE INDEX idx_interview_quiz_answers_quiz
  ON interview_quiz_answers(quiz_id, question_order);

-- RLS: service-role writes, user reads own
ALTER TABLE interview_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_quiz_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own quizzes"
  ON interview_quizzes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read own quiz answers"
  ON interview_quiz_answers FOR SELECT
  USING (quiz_id IN (SELECT id FROM interview_quizzes WHERE user_id = auth.uid()));

CREATE POLICY "Users can read own streak"
  ON interview_streaks FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies for users -- writes are service-role only
```

### Prompt Registration Pattern

```typescript
// Source: _shared/tier-prompts.ts pattern (verified in codebase)
// File: supabase/functions/_shared/interview-prep-prompts.ts

import { registerFeaturePrompts, type Tier } from './tier-prompts.ts';

export interface InterviewPrepPromptParams {
  resumeText: string;
  jobDescription: string;
  jobTitle?: string;
  company?: string;
}

registerFeaturePrompts<InterviewPrepPromptParams>('interview', {
  free: (_params) => {
    // Free tier never reaches here (blocked by ProFeatureGate + 403)
    // But must exist for registry completeness
    return 'ERROR: Free tier should not call interview prep.';
  },
  pro: (params) => {
    const { resumeText, jobDescription, jobTitle, company } = params;
    return `You are an expert interview coach creating STAR-framework flashcards.
Generate exactly 3 behavioral interview questions with complete STAR answers.
Each flashcard must be specific to the candidate's resume and the target job.
...
Resume: ${resumeText.slice(0, 8000)}
Job Description: ${jobDescription.slice(0, 6000)}
${jobTitle ? `Job Title: ${jobTitle}` : ''}
${company ? `Company: ${company}` : ''}

Return JSON: { "flashcards": [{ "question": "...", "star_answer": { "situation": "...", "task": "...", "action": "...", "result": "..." } }] }`;
  },
  elite: (params) => {
    const { resumeText, jobDescription, jobTitle, company } = params;
    return `You are an expert interviewer creating challenging behavioral questions.
Generate 5-7 interview questions tailored to this candidate and role.
Questions MUST require STAR-framework answers and test different competencies.
Do NOT include answers -- the user will answer these.
...
Resume: ${resumeText.slice(0, 8000)}
Job Description: ${jobDescription.slice(0, 6000)}
${jobTitle ? `Job Title: ${jobTitle}` : ''}
${company ? `Company: ${company}` : ''}

Return JSON: { "questions": [{ "id": 1, "question": "...", "competency": "..." }] }`;
  },
});
```

### Frontend: Quiz One-at-a-Time Pattern

```typescript
// Source: [ASSUMED] - derived from CONTEXT.md D-03, D-08
// File: src/components/InterviewQuiz.tsx

interface QuizQuestion {
  id: string;
  question_order: number;
  question_text: string;
  competency?: string;
}

interface QuizState {
  questions: QuizQuestion[];
  currentIndex: number;
  answers: Record<string, string>;  // question_id -> answer_text
}

// One question at a time, local state management
const [state, setState] = useState<QuizState>({
  questions: quizData.questions,
  currentIndex: 0,
  answers: {},
});

const currentQuestion = state.questions[state.currentIndex];
const canSubmitAll = Object.keys(state.answers).length === state.questions.length;

// Save answer and advance
const handleSaveAnswer = (answerText: string) => {
  setState(prev => ({
    ...prev,
    answers: { ...prev.answers, [currentQuestion.id]: answerText },
    currentIndex: Math.min(prev.currentIndex + 1, prev.questions.length - 1),
  }));
};

// Submit all answers at once (D-03)
const handleSubmitAll = async () => {
  const { data, error } = await invokeWithTimeout('interview-prep-evaluate', {
    body: {
      quiz_id: quizData.quiz_id,
      answers: Object.entries(state.answers).map(([question_id, answer_text]) => ({
        question_id,
        answer_text,
      })),
    },
  }, 120000);
  // Handle results...
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `interview-prep-coach` single function, 8 generic questions | `interview-prep-analyze` + `interview-prep-evaluate`, tier-conditional output | Phase 19 (now) | Pro gets 3 STAR flashcards, Elite gets interactive quiz with scoring |
| Complex multi-option input UI (type, categories, difficulty, duration, format) | Simplified: paste JD + optional title/company | Phase 19 (now) | Reduced friction, matches spec simplification |
| Client-supplied resume text | Server-side auto-fetch from Supabase Storage | Phase 19 (now) | More secure, simpler frontend payload |
| `checkAndRecordUsage` legacy credit system | `withMerits` Merit-based deduction | Phase 13+ | Tier-aware costing (8 Pro / 5 Elite) |
| `InterviewPrep.tsx` with mock data | Real AI-powered flashcards and quiz | Phase 19 (now) | Functional feature replacing UI prototype |

**Deprecated/outdated:**
- `interview-prep-coach/index.ts`: Kept as legacy fallback behind `MERIT_SYSTEM_ENABLED=false`. Removed in Phase 21.
- `InterviewPrep.tsx` v1.0: 1097 lines of mock-data UI. Fully rewritten.
- `InterviewPrepCoach.tsx`: v1.0 alternative page (uses real AI but old format). Route `/interview-prep-coach` should redirect or be deprecated.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Resume text should be re-extracted from the PDF file in Supabase Storage (via `extractPDFText`), not built from `grading_data` analysis results | Architecture Patterns / Pattern 2 | If the planner decides to use `grading_data` summary instead, the prompt quality may be lower but implementation is simpler (no Storage download). The user decision D-01 says "auto-fetches the user's most recent analyzed resume" which implies actual resume content. |
| A2 | The `resumes.file_path` column contains a valid Storage path for every analyzed resume | Architecture Patterns / Pattern 2 | If some resumes have `file_path = NULL` (e.g., legacy records), the edge function needs a fallback to `grading_data` summary. |
| A3 | The daily cap trigger/constraint approach vs. application-level COUNT is planner's choice | Pitfalls / Pitfall 2 | If application-level only, a small race window exists for concurrent requests. Low risk in practice. |
| A4 | The `interview-prep-evaluate` function does not need `withMerits` wrapping since it charges 0 Merits (D-14) | Architecture Patterns | If future specs add a Merit charge to evaluate, the function would need refactoring. For now, D-14 is clear: 0 charge. |
| A5 | The streak display data is returned in the `interview-prep-analyze` response rather than fetched separately | Architecture Patterns | If the frontend needs streak info without generating a quiz (e.g., on page load), a separate read endpoint or direct Supabase query via RLS would be needed. The frontend can read `interview_streaks` via the user's JWT since RLS allows user-read-own. |

## Open Questions (RESOLVED)

1. **Resume text source: PDF re-extraction vs. grading_data summary**
   - What we know: `resumes.file_path` stores the Storage path. `grading_data` stores analysis results (scores, feedback, etc.). `analyze-career` downloads PDFs from Storage server-side.
   - What was unclear: Whether all analyzed resumes have a valid `file_path`. Whether `grading_data` contains enough text context for interview prep quality.
   - Recommendation: Default to PDF re-extraction (matches D-01 "auto-fetches resume"), with `grading_data`-based summary as fallback if download fails. This gives the AI the actual resume text for highly specific flashcards/questions.
   - RESOLVED: D-01 locks PDF re-extraction as the primary path. Plan 02 Task 1 Step 8 uses `extractPDFText` from `pdf-parser.ts` to re-extract resume text from the stored PDF. Fallback to `grading_data` is not implemented (not needed given D-01).

2. **InterviewPrepCoach.tsx route handling**
   - What we know: Both `/interview-prep-coach` and `/interview-prep` routes exist in `App.tsx`. Two separate pages exist.
   - What was unclear: Whether `/interview-prep-coach` should be removed, redirected, or left as-is.
   - Recommendation: Remove the `/interview-prep-coach` route from `App.tsx` and redirect to `/interview-prep`. The old page is obsolete once Phase 19 ships.
   - RESOLVED: Phase 19 scope is limited to rewriting `InterviewPrep.tsx` (D-07). The `/interview-prep-coach` route is left as-is for Phase 21 cutover cleanup. D-06 keeps `interview-prep-coach` deployed as legacy fallback; removing its route prematurely would break the MERIT_SYSTEM_ENABLED=false path.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified -- all infrastructure is existing Supabase Edge Functions, Deno runtime, React frontend, and Anthropic API already in use).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (frontend) | Vitest 1.6.1 + jsdom + @testing-library/react |
| Config file (frontend) | `vitest.config.ts` |
| Quick run command (frontend) | `npx vitest run --reporter=verbose` |
| Framework (backend) | Deno test (built-in) |
| Config file (backend) | `supabase/functions/deno.json` (tasks.test) |
| Quick run command (backend) | `cd supabase/functions && deno test --no-check --allow-env --allow-read` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IPC-01 | Free user sees ProFeatureGate | unit (frontend) | `npx vitest run src/pages/InterviewPrep.test.tsx -t "free"` | Wave 0 |
| IPC-02 | Pro gets 3 flashcards | unit (backend) | `deno test interview-prep-analyze/flashcard-validation.test.ts` | Wave 0 |
| IPC-03 | Elite gets 5-7 quiz questions | unit (backend) | `deno test interview-prep-analyze/quiz-validation.test.ts` | Wave 0 |
| IPC-04 | Elite quiz STAR scoring | unit (backend) | `deno test interview-prep-evaluate/scoring-validation.test.ts` | Wave 0 |
| IPC-05 | Streak cold/expire logic | unit (backend) | `deno test _shared/interview-streak.test.ts` | Wave 0 |
| IPC-06 | Daily cap enforcement | unit (backend) | `deno test interview-prep-analyze/daily-cap.test.ts` | Wave 0 |
| IPC-07 | Tables exist with correct schema | manual | Run migration, inspect schema | manual-only |
| IPC-08 | interview-prep-analyze returns correct shape | unit (backend) | `deno test interview-prep-analyze/output-shape.test.ts` | Wave 0 |
| IPC-09 | interview-prep-evaluate ownership + scoring | unit (backend) | `deno test interview-prep-evaluate/ownership.test.ts` | Wave 0 |
| IPC-10 | maxTokens=10000, timeout 80,000ms | unit (backend) | Existing `deno test _shared/tier-config.test.ts` | Exists |
| BACK-06 | Edge function exists and deploys | manual | `supabase functions deploy interview-prep-analyze` | manual-only |
| BACK-07 | Edge function exists and deploys | manual | `supabase functions deploy interview-prep-evaluate` | manual-only |

### Sampling Rate
- **Per task commit:** `npx vitest run` (frontend) + `cd supabase/functions && deno test --no-check --allow-env --allow-read [specific file]`
- **Per wave merge:** Full frontend + backend test suite
- **Phase gate:** All tests green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `supabase/functions/interview-prep-analyze/flashcard-validation.test.ts` -- covers IPC-02
- [ ] `supabase/functions/interview-prep-analyze/quiz-validation.test.ts` -- covers IPC-03
- [ ] `supabase/functions/interview-prep-analyze/daily-cap.test.ts` -- covers IPC-06
- [ ] `supabase/functions/interview-prep-evaluate/scoring-validation.test.ts` -- covers IPC-04
- [ ] `supabase/functions/_shared/interview-streak.test.ts` -- covers IPC-05
- [ ] `src/pages/InterviewPrep.test.tsx` -- covers IPC-01 (free gate rendering)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireAuth(req, { type: 'user' })` from `_shared/auth.ts` |
| V3 Session Management | yes | Supabase JWT with auto-refresh, Bearer token in Authorization header |
| V4 Access Control | yes | Server-side tier check (reject free/pro on evaluate); quiz ownership check `WHERE user_id = authenticated_user_id` |
| V5 Input Validation | yes | JD length validation (min 50 chars), answer length (max 500 chars), quiz_id UUID format, `sanitizeUserContent` for prompt injection |
| V6 Cryptography | no | No custom crypto needed |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via JD text | Tampering | `sanitizeUserContent()` from `_shared/prompt-sanitizer.ts` strips injection phrases |
| Quiz ownership bypass | Elevation of Privilege | Explicit `WHERE user_id = auth_user_id` in every DB query in evaluate |
| Daily cap bypass via concurrent requests | Tampering | Application-level COUNT + optional DB trigger; low risk in practice |
| Merit-free evaluate calls by Pro users | Elevation of Privilege | Server-side tier check at start of `interview-prep-evaluate` |
| Excessive answer text injection | Tampering | Server-side 500-char enforcement on `answer_text` before AI call |
| Free user direct API call bypassing frontend gate | Elevation of Privilege | Server-side 403 response for `tier === 'free'` in edge function |

## Project Constraints (from CLAUDE.md)

- **Stack:** Supabase Edge Functions (Deno) + React frontend -- no new infrastructure
- **AI Models:** Claude Haiku 4.5 via `getModel(tier, 'interview')` from tier-config.ts
- **Git:** Do NOT commit anything in `.planning/` or modify `.gitignore`
- **Conventions:** TypeScript strict mode, 2-space indent, semicolons required, bracket-prefixed logging
- **Error handling:** Try-catch for async, `console.error('[FunctionName] message')`, toast for user-facing errors
- **Security:** `timingSafeEqual` for secrets, Zod/manual validation for inputs, `sanitizeUserContent` before AI, CORS via `APP_URL`
- **Testing:** Vitest for frontend, Deno test for backend

## Sources

### Primary (HIGH confidence)
- `supabase/functions/interview-prep-coach/index.ts` -- existing v1.0 function, 307 lines, verified patterns [VERIFIED: codebase]
- `supabase/functions/_shared/merit-gateway.ts` -- `withMerits` API and usage pattern [VERIFIED: codebase]
- `supabase/functions/_shared/tier-config.ts` -- Quiz timeout 80,000ms already defined [VERIFIED: codebase line 31]
- `supabase/functions/_shared/tier-prompts.ts` -- `loadPromptVariant` and registration pattern [VERIFIED: codebase]
- `supabase/functions/_shared/anthropic.ts` -- `invokeAnthropicText` signature and mock fixtures [VERIFIED: codebase]
- `supabase/functions/_shared/auth.ts` -- `requireAuth` returns `UserContext` with tier [VERIFIED: codebase]
- `supabase/functions/recruiting-lens/index.ts` -- Pattern reference for tier-gated AI function [VERIFIED: codebase]
- `src/pages/InterviewPrep.tsx` -- v1.0 page, 1097 lines, to be rewritten [VERIFIED: codebase]
- `src/components/ProFeatureGate.tsx` -- 305 lines, usable for IPC-01 [VERIFIED: codebase]
- `.planning/phases/19-interview-prep-flashcards-and-quiz/19-CONTEXT.md` -- Locked decisions D-01 through D-14 [VERIFIED: planning docs]
- `.planning/phases/19-interview-prep-flashcards-and-quiz/19-UI-SPEC.md` -- Visual design contract [VERIFIED: planning docs]

### Secondary (MEDIUM confidence)
- `supabase/functions/analyze-career/index.ts` -- PDF download from Storage pattern (line 420) [VERIFIED: codebase]
- `src/pages/RecruitingLens.tsx` -- Auto-fetch resume client-side pattern for reference [VERIFIED: codebase]
- `src/integrations/supabase/types.ts` -- `resumes` table schema with `file_path` column [VERIFIED: codebase]

### Tertiary (LOW confidence)
- None -- all claims verified against codebase or planning documents.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- follows established Phase 15-18 patterns exactly
- Pitfalls: HIGH -- derived from actual codebase patterns and known edge cases
- Database schema: MEDIUM -- column definitions are planner's discretion per CONTEXT.md

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable -- no external dependency changes expected)

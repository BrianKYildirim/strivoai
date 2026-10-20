# Phase 23: interview-prep-runtime-overhaul - Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 13 (4 modified, 9 new — across migration, edge functions, shared prompts/types, frontend page + components + tests)
**Analogs found:** 13 / 13 (every surface has a strong in-repo precedent; no net-new framework territory)

---

## File Classification

| New/Modified File | Status | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|---|
| `supabase/migrations/20260418000000_interview_prep_tables.sql` | **amend-in-place** | migration | DDL (CREATE TABLE / CHECK / RLS) | self (prior Phase 19 content) | exact |
| `supabase/functions/interview-prep-analyze/index.ts` | **rewrite** | edge function handler | req → auth → tier → resume-fetch → withMerits(loadPromptVariant → invokeAnthropicText → repair → validate → persist) → res | `supabase/functions/interview-prep-analyze/index.ts` (current Phase 19 version) + `supabase/functions/grade-linkedin/index.ts` (single-call merit + validate-retry pattern) | exact |
| `supabase/functions/interview-prep-evaluate/index.ts` | **edit-in-place** | edge function handler | req → auth → Elite gate → quiz ownership → build eval prompt → Anthropic → repair → validate → DB update → res (NO Merit) | self (current file) | exact |
| `supabase/functions/_shared/interview-prep-prompts.ts` | **rewrite** | shared prompt registry | module side-effect: register 3 tier variants via `registerFeaturePrompts('interview', ...)` + export `buildEvaluationPrompt` | self (current Phase 19 version) + `supabase/functions/_shared/resume-prompts.ts` / `career-prompts.ts` | exact |
| `supabase/functions/_shared/interview-prep-validation.ts` | **edit-in-place** | shared validator | pure: `unknown -> { valid, error? }` type-guard scans for §10 nine-section payload | self (current file — extend `validateFlashcards`/`validateQuizQuestions` into §10 validator) + `supabase/functions/grade-linkedin/validation.ts` | exact |
| `supabase/functions/_shared/types/interviewPrep.ts` | **new (Deno barrel)** | shared TS types | Deno re-export of `src/types/interviewPrep.ts` (Zod + inferred types) for edge-function import | `supabase/functions/_shared/resume-prompts.ts` (co-located type exports used by both edges and frontend via duplication) | role-match (single-source-of-truth via Zod is a new pattern) |
| `src/types/interviewPrep.ts` | **new** | frontend types + Zod schema | `z.object(...)` for §10 payload; `type InterviewPrepPayload = z.infer<...>`; inferred form-intake type | no exact analog — `src/integrations/supabase/database.ts` holds DB types but not Zod runtime schemas; `src/pages/RecruitingLens.tsx` lines 49-112 shows the inline interface shape for §10-style payload | role-match (best precedent is inline `interface` blocks in `RecruitingLens.tsx` / `CareerCompass.tsx` / current `InterviewPrep.tsx`; Zod usage is new surface but a stock library pattern) |
| `src/pages/InterviewPrep.tsx` | **full rewrite** | React page | `useReducer` status machine → fetch resume status → intake form → `invokeWithTimeout('interview-prep-analyze', {body})` → render §10 payload → quiz run → `invokeWithTimeout('interview-prep-evaluate', ...)` → results | `src/pages/RecruitingLens.tsx` (lines 219-430 — modern tiered-result page with `useMerits` + `MeritCostPreview` + `invokeWithTimeout` + ProFeatureGate wrap) | exact |
| `src/components/interviewPrep/IntakeForm.tsx` | **new** | React component | controlled form → onGenerate(payload) | `src/components/InterviewPrepInput.tsx` (current 3-field intake — extend to 9-field grouped) + `src/pages/RecruitingLens.tsx` intake block (lines 800-900 area) | role-match (current 3-field input is exactly the same pattern, just needs field expansion) |
| `src/components/interviewPrep/StreakDisplay.tsx` | **new** | React component | props `{ lastQuizAt, currentStreak, longestStreak, quizzesToday, dailyCap }` → derive variant → render flame + copy | `src/components/InterviewStreakDisplay.tsx` (current standalone streak flame component) | exact |
| `src/components/interviewPrep/QuizRunner.tsx` | **new** | React component | questions[] + live 500-char counter + batch submit → `onSubmit(answers[])` | `src/components/InterviewQuiz.tsx` (current quiz one-at-a-time flow + batch submit) | exact |
| `src/components/interviewPrep/FlashcardDeck.tsx` | **new** | React component | flashcards[] → render 3x `<FlashcardCard>` | `src/components/FlashcardCard.tsx` + `src/components/InterviewFlashcards.tsx` | exact |
| `src/components/interviewPrep/{ReadinessHero,ReadinessBreakdown,FocusAreas,QuickTips,QuizResults,PrepRoadmap,StrengthsWatchOuts,CoachingAdvice,CharacterCounter}.tsx` | **new** | React components | pure presentation — consume `InterviewPrepPayload` slot and render `Card`/`Progress`/`Badge` | per-section blocks inside `src/pages/RecruitingLens.tsx` (lines 600-1100) and `src/pages/CareerCompass.tsx` | role-match |
| `supabase/functions/_shared/interview-prep-validation.test.ts` (existing `interview-prep-prompts.*.test.ts` if any) | **extend** | Deno test | fixture objects → validator → assertEquals | `supabase/functions/grade-linkedin/validation.test.ts` | exact |

---

## Pattern Assignments

### `supabase/functions/interview-prep-analyze/index.ts` (edge function handler, request-response)

**Primary analog:** current `supabase/functions/interview-prep-analyze/index.ts` (539 lines — Phase 19 version). The entire pre-`withMerits` pipeline (OPTIONS, reqId/logger, body parse, `requireAuth`, tier gate, rate limit, daily-cap COUNT, resume auto-fetch, PDF download + extract, `sanitizeUserContent`, Merit branch) stays structurally identical. The rewrite replaces the inside of `withMerits(..., async (_txId) => { ... })` to emit a single 9-section payload and adds the new §10 persistence + `elite_taste` monthly check.

**Secondary analog:** `supabase/functions/grade-linkedin/index.ts` (632 lines — Phase 15 LinkedIn Grader) is the closest sibling for "single Anthropic call + tier branch on `maxTokens` + validate-with-retry + persist + response." Use its flow for the prompt-build / invoke / parse / validate-retry sequence.

#### Imports pattern (current analyze `index.ts` lines 23-39)

```typescript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-client.ts';
import { invokeAnthropicText } from '../_shared/anthropic.ts';
import { createLogger } from '../_shared/logger.ts';
import { requireAuth } from '../_shared/auth.ts';
import { corsHeaders, handleOptionsRequest } from '../_shared/cors.ts';
import { checkRateLimit, createRateLimitResponse } from '../_shared/rate-limiter.ts';
import { MERIT_SYSTEM_ENABLED, withMerits, MeritRefundable } from '../_shared/merit-gateway.ts';
import { sanitizeUserContent } from '../_shared/prompt-sanitizer.ts';
import { repairTruncatedJSON } from '../_shared/json-repair.ts';
import { extractPDFText } from '../_shared/pdf-parser.ts';
import { loadPromptVariant } from '../_shared/tier-prompts.ts';
import { getTimeout, getModel, type Tier, type CallType } from '../_shared/tier-config.ts';
import '../_shared/interview-prep-prompts.ts'; // Side-effect: registers 'interview' prompts
import { validateInterviewPrepPayload } from '../_shared/interview-prep-validation.ts';
```

**New additions for Phase 23:** none on imports — Zod usage is confined to the shared types barrel (`../_shared/types/interviewPrep.ts`) if the validator switches to `InterviewPrepPayloadSchema.safeParse`. If planner keeps the type-guard style (current precedent across this repo), no Zod import at all on the edge side.

#### Handler top frame (current lines 82-146) — copy verbatim

```typescript
serve(async (req) => {
  // 1. OPTIONS handling
  if (req.method === 'OPTIONS') return handleOptionsRequest({ type: 'user' });

  // 2. Request ID + logger
  const reqId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('interview-prep-analyze', reqId);

  try {
    const startTime = Date.now();

    // 3. Parse + validate body (BEFORE auth, BEFORE Merit -- Pitfall 6 / D-02)
    const body = await req.json();
    // ... extract all 9 intake fields with defensive slicing
    // 4. Auth -- validate JWT, get tier (T-19-08: tier from profiles, not request)
    const userContext = await requireAuth(req, { type: 'user' });
    if (!userContext) return jsonResponse({ error: 'Unauthorized' }, 401);
    // 5. Tier gate (D-13, IPC-01, T-19-06)
    if (userContext.tier === 'free') {
      return jsonResponse({ error: 'pro_or_elite_required', ... }, 403);
    }
    const tier = userContext.tier as Tier;
    // 6. Per-feature rate limit
    const rl = await checkRateLimit(userId, tier, {
      key: 'interview-prep-analyze',
      limits: { free: 0, pro: 10, elite: 20 },
    });
    if (!rl.allowed) return createRateLimitResponse(rl.retryAfterSeconds, 'user');
```

**Pattern:** new handler replaces step 3 body parse with Zod-based 9-field intake parser (hand-rolled type guards are also acceptable per repo precedent — see `grade-linkedin/validation.ts`).

#### Daily cap + monthly-quota check (current lines 148-172, extend for `elite_taste`)

```typescript
// 7. Daily cap check (Elite only, D-11, D-12, IPC-06 -- BEFORE Merit deduction)
const supabase = getServiceClient();
let todayQuizCount = 0;
if (isElite) {
  const midnight = todayMidnightUtc();
  const { count, error: capErr } = await supabase
    .from('interview_quizzes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('tier', 'elite')           // D-04: was .eq('mode','quiz') — change to tier filter
    .gte('created_at', midnight);
  if (capErr) log.error('daily-cap-query-error', { error: capErr.message });
  else todayQuizCount = count ?? 0;
  if (todayQuizCount >= 3) {
    return jsonResponse({ error: 'daily_cap_reached', ... }, 429);
  }
}
```

**New for Phase 23:** add a sibling block for `variant==='elite_taste'` (Pro-tier monthly quota):

```typescript
if (variant === 'elite_taste') {
  const firstOfMonth = firstOfMonthUtcIso();
  const { count } = await supabase
    .from('interview_quizzes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('tier', 'elite_taste')
    .gte('created_at', firstOfMonth);
  if ((count ?? 0) >= 1) {
    return jsonResponse({ error: 'monthly_taste_used', message: 'Your monthly Elite quiz is used. Resets on the 1st.' }, 429);
  }
}
```

#### Resume auto-fetch (current lines 174-214) — copy verbatim

```typescript
// 8. Auto-fetch resume (D-01, D-02 -- BEFORE Merit deduction, T-19-10)
const { data: resumeRow, error: resumeErr } = await supabase
  .from('resumes')
  .select('id, file_path')
  .eq('user_id', userId)
  .not('analyzed_at', 'is', null)
  .order('analyzed_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (resumeErr) { /* 500 */ }
if (!resumeRow) {
  return jsonResponse(
    { error: 'no_resume', message: 'Upload and analyze a resume first to generate interview prep.' },
    400,
  );
}
const { data: pdfData, error: dlErr } = await supabase.storage.from('resumes').download(resumeRow.file_path);
const resumeText = await extractPDFText(await pdfData.arrayBuffer());
```

#### `withMerits` + single Anthropic call + validate-retry (merge current analyze lines 220-303 with D-07 single-call 9-section)

```typescript
if (MERIT_SYSTEM_ENABLED) {
  const gated = await withMerits(
    { userId, tier: tier as 'free' | 'pro' | 'elite', corsType: 'user' as const },
    'interview_prep',
    async (_txId) => {
      const promptParams: InterviewPrepPromptParams = {
        resumeText,
        jobDescription: sanitizedJD,
        backgroundContext: safeBg,
        roleTitle, company,
        interviewType, questionCategories, difficulty, duration, format,
        variant,                            // 'pro' | 'elite' | 'elite_taste'
      };
      // Phase 14 loader — auto-prepends STRIVO_GLOBAL_AI_PRINCIPLES for Pro/Elite
      const systemPrompt = loadPromptVariant('interview', tier, promptParams);

      const maxTokens = variant === 'pro' ? 5000 : 10000;   // D-06, Runtime §12
      const model = getModel(tier, 'interview');            // claude-haiku-4-5-20251001
      const timeoutMs = getTimeout(tier, 'quiz');           // 80_000 ms (Phase 14)

      const ai = await invokeAnthropicText({
        model, system: systemPrompt,
        messages: [{ role: 'user', content: 'Generate the interview prep content based on the instructions above.' }],
        maxTokens, temperature: 0.4,
        fixtureKey: 'interview_prep',
        timeoutMs,
      });
      if (!ai.ok) {
        throw new MeritRefundable(
          (ai as { ok: false; status: number; error: string }).status,
          (ai as { ok: false; status: number; error: string }).error,
        );
      }

      let parsed: unknown;
      try { parsed = parseAiResponse(ai.text); }
      catch { throw new MeritRefundable(500, 'Failed to parse AI response as JSON'); }

      let validation = validateInterviewPrepPayload(parsed, variant, intake);
      if (!validation.valid) {
        // ONE stricter retry at lower temperature (see current lines 274-303)
        const retryAi = await invokeAnthropicText({
          model, system: systemPrompt,
          messages: [{ role: 'user', content: 'Generate the interview prep content. Return ONLY valid JSON with no extra text.' }],
          maxTokens, temperature: 0.2,
          fixtureKey: 'interview_prep',
          timeoutMs,
        });
        if (!retryAi.ok) throw new MeritRefundable((retryAi as any).status, (retryAi as any).error);
        try { parsed = parseAiResponse(retryAi.text); }
        catch { throw new MeritRefundable(500, 'Failed to parse retry AI response as JSON'); }
        validation = validateInterviewPrepPayload(parsed, variant, intake);
        if (!validation.valid) throw new MeritRefundable(502, `Validation failed after retry: ${validation.error}`);
      }
      // ... continue to persistence
    },
  );
  if (!gated.ok) return (gated as { ok: false; response: Response }).response;
  return gated.value;
}
```

**Truncation repair pattern** (current `parseAiResponse` helper lines 55-66) — use verbatim:

```typescript
function parseAiResponse(rawText: string): unknown {
  let text = rawText.trim();
  if (text.startsWith('```json')) text = text.replace(/^```json\s*/, '').replace(/```\s*$/, '');
  else if (text.startsWith('```')) text = text.replace(/^```\s*/, '').replace(/```\s*$/, '');
  try { return JSON.parse(text); }
  catch {
    const repaired = repairTruncatedJSON(text);
    return JSON.parse(repaired);
  }
}
```

#### `record_ai_usage` RPC call for History visibility (current lines 312-320) — preserve verbatim

```typescript
// 22-04 D-18/D-19 Pitfall 2 fix: merit-path bypasses usage_tracking INSERT;
// this restores History visibility. Placed AFTER AI success + validation pass.
await supabase
  .rpc('record_ai_usage', {
    p_user_id: userId,
    p_action_type: 'interview_prep',
    p_credits: 1,
  })
  .then(({ error }) => {
    if (error) log.error('usage-tracking-insert-failed', { error: String(error) });
  });
```

#### Persist + streak upsert (current lines 333-430) — extend

- Reuse the `interview_quizzes` insert body verbatim, but add the new 9 intake columns (`interview_type`, `question_categories`, `difficulty`, `duration`, `format`, `background_context`, `role_title`, `company`, `readiness_score`) from the §10 payload.
- Reuse the `interview_quiz_answers` insert — now only for `variant !== 'pro'` (questions-only per D-07) or with the flashcard `star_answer` blob for Pro.
- Reuse the streak upsert verbatim, add writes to new columns `longest_streak` and `quizzes_today` (D-04).
- **Streak applies only to `variant === 'elite'`** (Phase 19 D-12 carried forward); `elite_taste` does not advance streaks.

**Error handling pattern** (current lines 545-554):

```typescript
} catch (err) {
  log.error('unhandled-error', {
    error: (err as Error).message,
    stack: (err as Error).stack,
  });
  return jsonResponse(
    { error: 'internal_error', message: 'An unexpected error occurred. Please try again.' },
    500,
  );
}
```

---

### `supabase/functions/interview-prep-evaluate/index.ts` (edge function handler, Elite-only, no Merit)

**Analog:** self (current file, 329 lines). **Keep nearly verbatim** — only change: validator import + shape update if the evaluate schema is expanded. All load-bearing properties (no `withMerits` per Phase 19 D-14; 403 Elite-only gate; quiz ownership check `.eq('id', quizId).eq('user_id', userId)`; re-fetch questions from DB — never trust client; `parseInt(scoreEntry.question_id, 10) → question_order` integer join per SC-7) remain.

**Elite-only gate** (current lines 79-86):

```typescript
if (userContext.tier !== 'elite') {
  return new Response(
    JSON.stringify({ error: 'elite_only', message: 'Quiz evaluation requires Elite tier.' }),
    { status: 403, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
  );
}
```

**Ownership + re-evaluate guard** (current lines 139-159):

```typescript
const { data: quiz, error: quizError } = await supabase
  .from('interview_quizzes')
  .select('id, user_id, mode, evaluated_at, job_description')
  .eq('id', quizId)
  .eq('user_id', userId) // Ownership enforced in application code (service-role bypasses RLS)
  .single();
if (quizError || !quiz) return /* 403 not_found */;
if (quiz.evaluated_at) return /* 409 already_evaluated */;
if (quiz.mode !== 'quiz') return /* 400 invalid_mode */;
```

**500-char server reject** (current lines 118-134) — keep exactly; it is the server-side source of truth for D-15.

```typescript
a.answer_text = a.answer_text.slice(0, 500);
```

**Integer-join persistence** (current lines 268-287) — keep verbatim:

```typescript
for (const scoreEntry of evalResult.scores) {
  const questionOrder = parseInt(scoreEntry.question_id, 10);  // SC-7
  // ...
  await supabase.from('interview_quiz_answers').update({
    user_answer: answerRow.answer_text,
    score: scoreEntry.score,
    scoring_breakdown: scoreEntry.breakdown,
    suggestions: scoreEntry.suggestions,
  }).eq('quiz_id', quizId).eq('question_order', questionOrder);
}
```

---

### `supabase/functions/_shared/interview-prep-prompts.ts` (shared prompt registry)

**Analog:** self (current 204 lines). The file already uses the exact Phase 14 pattern — `registerFeaturePrompts<InterviewPrepPromptParams>('interview', VARIANTS)` as a module side-effect. Rewrite expands the variant map from `{ free, pro, elite }` to the new semantics (Pro flashcards / Elite quiz / Elite-taste branch), keeping the same public API.

**Registration pattern** (current lines 125-131) — copy verbatim:

```typescript
export const INTERVIEW_PREP_VARIANTS: PromptVariantBuilder<InterviewPrepPromptParams> = {
  free: () => 'ERROR: Free tier should not call interview prep.',
  pro: (params) => buildProFlashcardPrompt(params),
  elite: (params) => buildEliteQuizPrompt(params),
};
registerFeaturePrompts<InterviewPrepPromptParams>('interview', INTERVIEW_PREP_VARIANTS);
```

**New for Phase 23:** variant resolution happens INSIDE each builder (pro builder checks `params.variant === 'elite_taste'` and delegates to elite-taste branch), OR the params carry a `variant` discriminator that each builder branches on. See CONTEXT D-10: "shared base + tier branches" → expect a `buildBasePrompt(params)` helper that emits the 9-section contract + Runtime §11 principles + "no silent drops" instruction, wrapped by three thin variant builders.

**Context block** (current lines 36-49) — extend to include the 6 new intake fields (role_title, company, background_context, interview_type, question_categories, difficulty, duration, format):

```typescript
function buildContextBlock(params: InterviewPrepPromptParams): string {
  const parts: string[] = [
    `=== CANDIDATE RESUME ===\n${resumeText.slice(0, 8000)}`,
    `\n\n=== JOB DESCRIPTION ===\n${jobDescription.slice(0, 6000)}`,
  ];
  // Phase 23: append the 9-field intake with explicit "these are filled" markers
  // so the LLM can satisfy the D-11 "no silent drops" rule.
  // ...
  return parts.join('');
}
```

**`buildEvaluationPrompt` (current lines 147-204)** — keep essentially as-is; this is the evaluator prompt used by `interview-prep-evaluate`, not registered in the tier-prompts registry (Elite-only, not tier-variant).

---

### `supabase/functions/_shared/interview-prep-validation.ts` (shared validator)

**Primary analog:** self (current file). The current validators (`validateFlashcards`, `validateQuizQuestions`, `validateEvaluationScores`) use the repo's established **type-guard style**: pure function `(parsed: unknown) => { valid: boolean; error?: string }`, `isRecord`/`Array.isArray`/`typeof` narrowing, no external dependency.

**Secondary analog:** `supabase/functions/grade-linkedin/validation.ts` (current 80+ lines) — tier-conditional required-fields validator pattern is the closest match for Phase 23's variant-conditional 9-section validator.

**Validator signature pattern** (current `interview-prep-validation.ts` lines 20-23):

```typescript
export interface ValidationResult {
  valid: boolean;
  error?: string;
}
```

**Type-guard helpers** (lines 29-35) — copy verbatim:

```typescript
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
```

**Tier/variant-conditional required-fields pattern** (from `grade-linkedin/validation.ts` lines 20-32):

```typescript
const REQUIRED_TOP_LEVEL_BASE = ['rawScore', 'scoreJustification', 'nextBestAction', 'sectionBreakdown', 'topFixes', 'keyStrengths'];
const REQUIRED_TOP_LEVEL_PRO = [...REQUIRED_TOP_LEVEL_BASE, 'profileInsights'];
// ...
const requiredFields = tier === 'free' ? REQUIRED_TOP_LEVEL_BASE : REQUIRED_TOP_LEVEL_PRO;
for (const field of requiredFields) {
  if (!(field in obj) || obj[field] === null || obj[field] === undefined) {
    return { valid: false, error: `Missing required field: ${field}` };
  }
}
```

**For Phase 23:** a new `validateInterviewPrepPayload(parsed: unknown, variant: 'pro' | 'elite' | 'elite_taste', intake: IntakePayload)` that:
1. Validates all 9 §10 sections are present and non-empty (base).
2. Variant-specific: Pro ⇒ `practiceQuestions` contains 3 flashcards with full STAR blocks; Elite / Elite-taste ⇒ `practiceQuestions` contains 5–7 questions-only (duration→count per Runtime §7.2).
3. `readiness_score` ∈ [0, 100].
4. D-11 "no silent drops" substring scan: for each filled optional intake field (`role_title`, `company`, `background_context`), case-insensitive substring match in `coach_verdict || focus_areas join || coaching_advice`.

**Planner note on Zod vs. type-guard style:** RESEARCH §2 and AI-SPEC §3 both recommend Zod for Phase 23 (single source of truth with frontend via `z.infer`). The repo currently has **zero** Zod usage in edge functions (verified — no `esm.sh/zod` imports under `supabase/functions/`). Planner decides whether to introduce Zod on the edge side or keep the type-guard style and let Zod live frontend-only (derived TS types shared via a Deno-compatible re-export of plain interfaces). Both are acceptable; type-guards are the lower-risk path.

---

### `src/types/interviewPrep.ts` + `supabase/functions/_shared/types/interviewPrep.ts` (shared types, D-17)

**No exact analog** in the codebase — the established pattern is either (a) inline `interface` at the top of the consuming page (see `RecruitingLens.tsx` lines 49-112 with ~60-line inline interface for the full payload) or (b) DB types in `src/integrations/supabase/database.ts`. This phase introduces the **first** Zod-backed runtime schema in `src/`.

**Closest patterns to follow:**

- **Colocated types + builder** from `supabase/functions/_shared/interview-prep-prompts.ts` lines 25-30:

```typescript
export interface InterviewPrepPromptParams {
  resumeText: string;
  jobDescription: string;
  jobTitle?: string;
  company?: string;
}
```

- **Deno-compatible re-export** pattern: since frontend uses `import { z } from "zod"` (npm) and Deno edges need `import { z } from "https://esm.sh/zod@3.25.76"`, the shared file either (1) lives at `src/types/interviewPrep.ts` with Deno importing it via a barrel `supabase/functions/_shared/types/interviewPrep.ts` that duplicates the `z` import specifier, or (2) is authored twice with a shared `interfaces.ts` holding only types and each side owning its own Zod schema. RESEARCH §Core Imports suggests option 1 via the esm.sh mirror.

**For Phase 23:** single file `src/types/interviewPrep.ts` exports:
- `InterviewPrepPayloadSchema` (Zod) — §10 nine-section contract
- `type InterviewPrepPayload = z.infer<typeof InterviewPrepPayloadSchema>`
- `IntakeFormSchema` + `type IntakeForm` — 9-field intake with Zod enums
- `InterviewPrepResponseSchema` — full API response (payload + streak + daily_usage + quiz_id)

---

### `src/pages/InterviewPrep.tsx` (React page, full rewrite)

**Primary analog:** `src/pages/RecruitingLens.tsx` (1203 lines). This is the most modern Strivo feature page — same tier gate (`ProFeatureGate`), same Merit hooks (`useMerits`, `useInvalidateMerits`, `MeritCostPreview`), same invoke pattern (`invokeWithTimeout`), same session-storage result cache, same analyzing overlay (`UniversalAnalyzing`), same error-toast flow. Phase 23 page mirrors this structure but uses `useReducer` for state instead of multiple `useState` per CONTEXT D-18.

**Secondary analog:** current `src/pages/InterviewPrep.tsx` (1226 lines) — keep its **visual design tokens, card shells, typography** (CONTEXT D-16) and its deep-link hydration pattern for past-quiz rendering (lines 82-109). Delete its `MOCK_RESULT` scaffolding.

#### Imports pattern (from `RecruitingLens.tsx` lines 1-47) — adapt

```typescript
import { useState, useEffect, useRef, useReducer } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMerits, useInvalidateMerits } from "@/hooks/useMerits";
import { useFeatureCosts, getCostForFeature } from "@/hooks/useFeatureCosts";
import { MeritCostPreview } from "@/components/MeritCostPreview";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { invokeWithTimeout } from "@/lib/fetchWithTimeout";
import { UniversalAnalyzing } from "@/components/UniversalAnalyzing";
import { ProFeatureGate } from "@/components/ProFeatureGate";
import { useAdminTierTest } from "@/contexts/AdminTierTestContext";
import { usePaywallGuard } from "@/hooks/usePaywallGuard";
import { useAnalysisGuard } from "@/hooks/useAnalysisGuard";
import type { InterviewPrepPayload, IntakeForm } from "@/types/interviewPrep";
```

#### Mount-time fetch pattern (from `RecruitingLens.tsx` lines 244-306)

```typescript
useEffect(() => {
  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate('/auth'); return; }
    // Parallel: profile + primary resume
    const [profileResult, primaryResumeResult] = await Promise.all([
      supabase.from('profiles').select('subscription_tier').eq('id', user.id).single(),
      supabase.from('resumes').select('file_name, grading_data')
        .eq('user_id', user.id).not('grading_data', 'is', null)
        .order('analyzed_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setTier(getEffectiveTier(profileResult.data?.subscription_tier || 'free'));
    // ...
    setLoading(false);
  };
  init();
}, []);
```

**Adapt for Phase 23:** the page does NOT need to parse the resume itself (edge function auto-fetches per CONTEXT D-16). Page only checks **has-resume boolean** to toggle between the `'input-form'` state and the `'error'` state with no-resume copy.

#### Invoke edge function (from `RecruitingLens.tsx` lines 380-412)

```typescript
const handleAnalyze = async () => {
  if (!canAnalyze) { triggerPaywall(); return; }
  setIsAnalyzing(true);
  const result = await startAnalysis(async (_signal) => {
    const { data, error } = await invokeWithTimeout('interview-prep-analyze', {
      body: { /* 9-field intake from form state */ },
    }, 90000);        // 90s covers 80s edge timeout + buffer
    if (error) {
      if (data && typeof data === 'object' && 'error' in data) {
        const errCode = (data as any).error;
        if (errCode === 'no_resume')           throw new Error('Upload a resume first');
        if (errCode === 'pro_or_elite_required') { /* should not happen post-gate */ }
        if (errCode === 'daily_cap_reached')   throw new Error((data as any).message);
        if (errCode === 'monthly_taste_used')  throw new Error((data as any).message);
        if (errCode === 'rate_limit_exceeded') throw new Error(`Too many requests.`);
      }
      throw new Error(error.message || 'Generation failed.');
    }
    return data;
  });
  setIsAnalyzing(false);
  if (result.success && result.data) {
    dispatch({ type: 'GENERATION_SUCCESS', payload: result.data });
    invalidateMerits();
    refreshPaywall();
  } else if (result.error) {
    dispatch({ type: 'ERROR', error: result.error });
  }
};
```

**Quiz submit (from `InterviewQuiz.tsx` lines 66-79):**

```typescript
const { data, error } = await invokeWithTimeout('interview-prep-evaluate', {
  body: {
    quiz_id: quizId,
    answers: questions.map((q) => ({
      question_id: String(q.question_order),   // SC-7: integer string for parseInt
      answer_text: answers[q.id] || '',
    })),
  },
}, 120000);  // 2-min timeout
```

#### `useReducer` state pattern (CONTEXT D-18 + UI-SPEC)

```typescript
type Status =
  | 'loading' | 'free-gate' | 'input-form' | 'generating'
  | 'flashcard-results' | 'quiz-active' | 'quiz-submitting'
  | 'quiz-results' | 'error';

type Action =
  | { type: 'INIT_DONE'; tier: 'pro' | 'elite'; hasResume: boolean }
  | { type: 'SUBMIT_INTAKE'; intake: IntakeForm }
  | { type: 'GENERATION_SUCCESS'; payload: InterviewPrepPayload }
  | { type: 'START_QUIZ' }
  | { type: 'SUBMIT_ANSWERS'; answers: Record<string, string> }
  | { type: 'QUIZ_RESULT'; result: QuizEvalResult }
  | { type: 'ERROR'; error: string }
  | { type: 'RETRY' };
// reducer switch on status + action — impossible combinations rejected
```

**No existing `useReducer` analog** in the codebase — all other pages use multiple `useState`. This is a new pattern introduction per D-18 but a stock React idiom.

#### ProFeatureGate wrap (from `RecruitingLens.tsx`)

```typescript
if (tier === 'free') {
  return (
    <ProFeatureGate
      featureName="Interview Prep Coach"
      featureIcon={<MessageSquare />}
      description="..."
      benefits={[...]}
    />
  );
}
```

---

### `src/components/interviewPrep/StreakDisplay.tsx` (D-19)

**Analog:** `src/components/InterviewStreakDisplay.tsx` (current 96 lines). Phase 23 version renames to `StreakDisplay`, lives under `src/components/interviewPrep/`, adds two new variants (`first-time` and `cap-reached`) and expands props to `{ lastQuizAt, currentStreak, longestStreak, quizzesToday, dailyCap }`.

**Current component structure** (lines 1-96) — copy verbatim, extend:

```typescript
import { motion, useReducedMotion } from "framer-motion";
import { Flame } from "lucide-react";

interface StreakDisplayProps {
  lastQuizAt: string | null;
  currentStreak: number;
  longestStreak: number;
  quizzesToday: number;
  dailyCap: number;
}

export function StreakDisplay(props: StreakDisplayProps) {
  const shouldReduceMotion = useReducedMotion();
  const variant = deriveVariant(props);   // 'active' | 'cold' | 'expired' | 'first-time' | 'cap-reached'
  // one conditional block per variant, copy render patterns from current file
}
```

**Active-state block** (current lines 24-43) — copy as template for all five variants:

```typescript
return (
  <div className="flex items-center gap-3 rounded-lg p-3 bg-primary/15">
    <motion.div animate={shouldReduceMotion ? {} : { y: [0, -2, 0] }} transition={...}>
      <Flame className="w-5 h-5 text-primary" />
    </motion.div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold text-foreground">{streakDays}-day streak</p>
      <p className="text-xs text-muted-foreground">{quizzesToday}/{maxQuizzesPerDay} quizzes today</p>
    </div>
  </div>
);
```

**Copy strings:** UI-SPEC §Copywriting Contract — all five variant copy strings are locked verbatim (`Start your streak`, `{n}-day streak — cooling off`, `Streak ended`, `You've hit today's cap`, `{n}-day streak` + `Quiz today to keep it going.`).

---

### `src/components/interviewPrep/IntakeForm.tsx` (new)

**Analog:** `src/components/InterviewPrepInput.tsx` (current 3-field intake — extend to 9 fields with grouped sections). The submit-disable + char-counter pattern carries over.

**Submit gate pattern** (current lines 34-44):

```typescript
const canSubmit = jobDescription.trim().length > 0 && !isGenerating;
const handleSubmit = () => {
  if (!canSubmit) return;
  onGenerate(jobDescription, jobTitle.trim() || undefined, company.trim() || undefined);
};
```

**Phase 23 gate:** `job_description.length >= 40 && interview_type && difficulty && duration && format && question_categories.length >= 1` per CONTEXT D-13. Pre-filled defaults per D-14 (`interview_type='behavioral'`, `difficulty='mid'`, `duration=30`, `format='written'`).

**Char-counter pattern** (current lines 96-99) extended to 500-char version per D-15:

```typescript
<p className="text-right text-xs text-muted-foreground mt-1">
  <span className={jobDescription.length > 2700 ? "text-destructive" : ""}>
    {jobDescription.length}/3000
  </span>
</p>
```

**Phase 23 character counter** (D-15, UI-SPEC §Color):
- 0–499 chars → `text-muted-foreground`
- exactly 500 → `text-primary`
- >500 → `text-destructive` + helper `Keep your answer to 500 characters or fewer.`

---

### `src/components/interviewPrep/QuizRunner.tsx` (new)

**Analog:** `src/components/InterviewQuiz.tsx` (current full file). Flow is identical: one-at-a-time question render → per-question answer state → review screen → batch submit.

**Batch-submit shape** (current lines 66-79) — copy verbatim, extend for 500-char validation:

```typescript
const handleSubmitAll = async () => {
  setSubmitting(true);
  try {
    const { data, error } = await invokeWithTimeout('interview-prep-evaluate', {
      body: {
        quiz_id: quizId,
        answers: questions.map((q) => ({
          question_id: q.id,
          answer_text: answers[q.id] || '',
        })),
      },
    }, 120000);
    // ...
  }
};
```

**Phase 23 extension:** each answer textarea mounts `<CharacterCounter value={answer.length} max={500} />`; submit button disabled when any answer > 500 chars (D-15).

---

### `src/components/interviewPrep/FlashcardDeck.tsx` + `FlashcardCard` reuse

**Analog:** `src/components/FlashcardCard.tsx` (current file — renders one STAR flashcard with copy button). Phase 23 deck wraps 3 of these in a grid (UI-SPEC §Responsive — 3-column at `lg:`, 1-column at mobile).

**Current flashcard props** (lines 13-18) — keep shape:

```typescript
interface FlashcardCardProps {
  question: string;
  competency: string;
  answer: { situation: string; task: string; action: string; result: string };
  index: number;
}
```

**Phase 23 addition:** `coachNote` (<20 words per CONTEXT D-08) renders below the STAR block with a muted small label.

---

### `supabase/migrations/20260418000000_interview_prep_tables.sql` (amend-in-place per D-01)

**Analog:** self (Phase 19 version, 99 lines). D-01 mandates amending rather than creating a new timestamped migration — verify no environments have live data before running the amended DDL.

**Current structure:**

```sql
CREATE TABLE IF NOT EXISTS public.interview_quizzes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode                  text NOT NULL CHECK (mode IN ('flashcard', 'quiz')),
  tier                  text NOT NULL CHECK (tier IN ('pro', 'elite')),
  -- ...
);
```

**Phase 23 additions** (per CONTEXT D-02..D-05):

```sql
-- Expand tier CHECK to include 'elite_taste' (D-02)
ALTER TABLE public.interview_quizzes DROP CONSTRAINT interview_quizzes_tier_check;
ALTER TABLE public.interview_quizzes ADD CONSTRAINT interview_quizzes_tier_check
  CHECK (tier IN ('pro', 'elite', 'elite_taste'));

-- Add 9 intake columns + readiness_score (D-03)
ALTER TABLE public.interview_quizzes
  ADD COLUMN interview_type      text    NOT NULL CHECK (interview_type IN ('behavioral','technical','mixed_panel','executive')),
  ADD COLUMN question_categories text[]  NOT NULL CHECK (array_length(question_categories, 1) >= 1),
  ADD COLUMN difficulty          text    NOT NULL CHECK (difficulty IN ('entry','mid','senior','staff_plus')),
  ADD COLUMN duration            smallint NOT NULL CHECK (duration IN (15,30,45,60)),
  ADD COLUMN format              text    NOT NULL CHECK (format IN ('written','voice_style','mixed')),
  ADD COLUMN background_context  text             CHECK (length(background_context) <= 1500),
  ADD COLUMN role_title          text,
  ADD COLUMN company             text,                -- legacy kept; see discretion note
  ADD COLUMN readiness_score     smallint          CHECK (readiness_score BETWEEN 0 AND 100);

-- Add longest_streak + quizzes_today to interview_streaks (D-04)
ALTER TABLE public.interview_streaks
  ADD COLUMN longest_streak int      NOT NULL DEFAULT 0,
  ADD COLUMN quizzes_today  smallint NOT NULL DEFAULT 0;

-- Partial indexes for cap queries (Claude's discretion)
CREATE INDEX idx_interview_quizzes_elite_daily
  ON public.interview_quizzes(user_id, created_at DESC) WHERE tier = 'elite';
CREATE INDEX idx_interview_quizzes_elite_taste_monthly
  ON public.interview_quizzes(user_id, created_at DESC) WHERE tier = 'elite_taste';
```

**RLS pattern** (current lines 74-88) — **preserve**, no new policies needed (service-role writes via edge functions; user SELECT-own already covers the new columns):

```sql
ALTER TABLE public.interview_quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "interview_quizzes_select_own"
  ON public.interview_quizzes FOR SELECT
  USING (auth.uid() = user_id);
```

**Verification block** (current lines 93-98) — extend to also verify new columns exist.

---

### Tests (`*.test.ts` files)

**Analog:** `supabase/functions/grade-linkedin/validation.test.ts` — textbook Deno-test pattern that uses a `makeValidGrade()` fixture factory and tests happy-path + each missing/invalid field case.

**Test pattern** (lines 1-30):

```typescript
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { validateInterviewPrepPayload } from './interview-prep-validation.ts';

function makeValidPayload(variant: 'pro' | 'elite' | 'elite_taste') { /* fixture */ }

Deno.test('valid §10 payload returns valid: true', () => {
  const result = validateInterviewPrepPayload(makeValidPayload('elite'), 'elite', intake);
  assertEquals(result.valid, true);
});

Deno.test('missing coachVerdict returns valid: false', () => {
  const p = makeValidPayload('elite');
  delete (p as Record<string, unknown>).coachVerdict;
  const result = validateInterviewPrepPayload(p, 'elite', intake);
  assertEquals(result.valid, false);
  assertEquals(result.error?.includes('coachVerdict'), true);
});
```

Also extend the fixture replay harness via `fixtureKey: 'interview_prep'` (already wired) in `supabase/functions/_shared/anthropic.ts`.

---

## Shared Patterns

### Authentication + Tier Resolution

**Source:** `supabase/functions/_shared/auth.ts` (via `requireAuth({ type: 'user' })`)
**Apply to:** both edge functions (`interview-prep-analyze`, `interview-prep-evaluate`)

```typescript
const userContext = await requireAuth(req, { type: 'user' });
if (!userContext) return jsonResponse({ error: 'Unauthorized' }, 401);
const tier = userContext.tier as Tier;  // read from profiles.subscription_tier — NEVER from body
if (tier === 'free') return jsonResponse({ error: 'pro_or_elite_required' }, 403);
```

---

### CORS

**Source:** `supabase/functions/_shared/cors.ts` (`corsHeaders`, `handleOptionsRequest`)
**Apply to:** both edge functions

```typescript
if (req.method === 'OPTIONS') return handleOptionsRequest({ type: 'user' });

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
  });
}
```

---

### Merit Deduction + Refund-on-5xx

**Source:** `supabase/functions/_shared/merit-gateway.ts` — `withMerits`, `MeritRefundable`, `MERIT_SYSTEM_ENABLED`
**Apply to:** `interview-prep-analyze` only. NOT `interview-prep-evaluate` (Phase 19 D-14 — evaluate charges 0 Merits).

**Pattern** (from current `interview-prep-analyze/index.ts` lines 220-303):

```typescript
if (MERIT_SYSTEM_ENABLED) {
  const gated = await withMerits(
    { userId, tier, corsType: 'user' as const },
    'interview_prep',                  // feature key — matches feature_costs row
    async (_txId) => {
      const ai = await invokeAnthropicText(...);
      if (!ai.ok) {
        throw new MeritRefundable(
          (ai as { ok: false; status: number; error: string }).status,
          (ai as { ok: false; status: number; error: string }).error,
        );
      }
      // validation, persistence, return response
      return jsonResponse(result, 200);
    },
  );
  if (!gated.ok) return (gated as { ok: false; response: Response }).response;
  return gated.value;
}
```

**Refund taxonomy** (merit-gateway.ts lines 51-60) — refund fires only for 5xx, 408, 529, AbortError, network/timeout. 4xx (400/403/429) does NOT refund.

---

### Prompt Registry + Global AI Principles Auto-Prepend

**Source:** `supabase/functions/_shared/tier-prompts.ts` — `registerFeaturePrompts`, `loadPromptVariant`
**Apply to:** `_shared/interview-prep-prompts.ts` (registration) + `interview-prep-analyze/index.ts` (loading)

```typescript
// At bottom of interview-prep-prompts.ts — module-load side effect
registerFeaturePrompts<InterviewPrepPromptParams>('interview', {
  free: () => 'ERROR: Free tier should not call interview prep.',
  pro:   (p) => buildProFlashcardPrompt(p),
  elite: (p) => buildEliteQuizPrompt(p),
});

// In interview-prep-analyze/index.ts — auto-prepends STRIVO_GLOBAL_AI_PRINCIPLES for Pro/Elite
const systemPrompt = loadPromptVariant('interview', tier, promptParams);
```

---

### Prompt Sanitization

**Source:** `supabase/functions/_shared/prompt-sanitizer.ts` — `sanitizeUserContent`
**Apply to:** `interview-prep-analyze` — run on `job_description` + `background_context` **before** they enter the prompt

```typescript
const sanitizedJD = sanitizeUserContent(jobDescription, 'interview-prep-analyze', log);
const sanitizedBg = backgroundContext
  ? sanitizeUserContent(backgroundContext, 'interview-prep-analyze', log)
  : undefined;
```

---

### Anthropic Call + JSON Repair

**Source:** `supabase/functions/_shared/anthropic.ts` (`invokeAnthropicText`) + `_shared/json-repair.ts` (`repairTruncatedJSON`)
**Apply to:** both edge functions

```typescript
const ai = await invokeAnthropicText({
  model: getModel(tier, 'interview'),
  system: systemPrompt,
  messages: [{ role: 'user', content: 'Generate the interview prep content based on the instructions above.' }],
  maxTokens: variant === 'pro' ? 5000 : 10000,
  temperature: 0.4,
  fixtureKey: 'interview_prep',
  timeoutMs: getTimeout(tier, 'quiz'),
});
if (!ai.ok) throw new MeritRefundable((ai as any).status, (ai as any).error);

// Parse with markdown-fence strip + repair fallback
function parseAiResponse(rawText: string): unknown {
  let text = rawText.trim();
  if (text.startsWith('```json')) text = text.replace(/^```json\s*/, '').replace(/```\s*$/, '');
  else if (text.startsWith('```')) text = text.replace(/^```\s*/, '').replace(/```\s*$/, '');
  try { return JSON.parse(text); }
  catch { return JSON.parse(repairTruncatedJSON(text)); }
}
```

---

### Structured Logging

**Source:** `supabase/functions/_shared/logger.ts` — `createLogger(fnName, reqId)`
**Apply to:** both edge functions (already present in both)

```typescript
const reqId = crypto.randomUUID().slice(0, 8);
const log = createLogger('interview-prep-analyze', reqId);
log.info('request-start', { userId, tier, ... });
log.error('validation-failed', { error: validation.error });
const timer = log.timer('ai-call');  // returns fn that logs elapsed ms when called
```

---

### Frontend Edge Invocation

**Source:** `src/lib/fetchWithTimeout.ts` — `invokeWithTimeout`
**Apply to:** `src/pages/InterviewPrep.tsx` (`generating` + `quiz-submitting` states) and `src/components/interviewPrep/QuizRunner.tsx`

```typescript
const { data, error } = await invokeWithTimeout('interview-prep-analyze', {
  body: { /* 9-field intake */ },
}, 90000);  // 90s for analyze; 120s for evaluate (matches current InterviewQuiz.tsx)
```

---

### Structured Error Code Handling (frontend)

**Source:** `src/pages/RecruitingLens.tsx` lines 389-410
**Apply to:** `src/pages/InterviewPrep.tsx`

```typescript
if (error) {
  if (data && typeof data === 'object' && 'error' in data) {
    const errCode = (data as any).error;
    if (errCode === 'no_resume')           throw new Error('Upload a resume first');
    if (errCode === 'daily_cap_reached')   throw new Error((data as any).message);
    if (errCode === 'monthly_taste_used')  throw new Error((data as any).message);
    if (errCode === 'rate_limit_exceeded') throw new Error('Too many requests.');
    if (errCode === 'invalid_input')       throw new Error((data as any).message);
  }
  throw new Error(error.message || 'Generation failed.');
}
```

---

### RLS Model (migration)

**Source:** current `supabase/migrations/20260418000000_interview_prep_tables.sql` lines 74-88
**Apply to:** amended migration — no new policies required

**Invariant:** RLS is ENABLED; only SELECT-own policies exist; all INSERT/UPDATE/DELETE happen via service-role client which bypasses RLS. No permissive write policy allowed (verification block enforces).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/types/interviewPrep.ts` (Zod schema portion) | frontend type + Zod runtime | — | No existing Zod schema exists anywhere in `src/` (verified via grep). `zod@3.25.76` is installed via `@hookform/resolvers` but not used directly. Planner introduces the first schema — stock library idiom, no codebase precedent. |
| `useReducer` state machine on `InterviewPrep.tsx` | frontend state | — | All other Strivo pages use multiple `useState`. No `useReducer` usage in `src/pages/` today. CONTEXT D-18 locks the pattern; planner follows stock React docs for `useReducer<Action, State>` typing. |

Both gaps are low-risk: they are stock library/framework usage with no custom Strivo semantics, and RESEARCH §Standard Stack and AI-SPEC §3 give exact import paths.

---

## Metadata

**Analog search scope:**
- `supabase/functions/_shared/` — all 30+ files listed
- `supabase/functions/interview-prep-*` (current Phase 19 code)
- `supabase/functions/grade-linkedin/` (sibling single-call + validate-retry + tier-branch merit-gated feature)
- `supabase/functions/analyze-career/` (3-call merge pattern — referenced for architecture only; Phase 23 is single-call so does not inherit the parallel executor)
- `src/pages/RecruitingLens.tsx`, `src/pages/CareerCompass.tsx`, `src/pages/LinkedInGrader.tsx` (modern feature pages)
- `src/pages/InterviewPrep.tsx` (current mock — salvaged for tokens only per D-16)
- `src/components/InterviewPrepInput.tsx`, `InterviewQuiz.tsx`, `FlashcardCard.tsx`, `InterviewFlashcards.tsx`, `InterviewStreakDisplay.tsx`
- `src/components/ProFeatureGate.tsx`, `src/components/MeritCostPreview.tsx`
- `src/hooks/useMerits.ts`, `src/hooks/useFeatureCosts.ts`, `src/hooks/useTierAccess.ts`, `src/hooks/useAnalysisGuard.ts`, `src/hooks/usePaywallGuard.ts`
- `src/lib/fetchWithTimeout.ts` — `invokeWithTimeout`
- `supabase/migrations/20260418000000_interview_prep_tables.sql` (the amend-target)
- `supabase/functions/grade-linkedin/validation.test.ts` (Deno test template)

**Files scanned:** ~60
**Pattern extraction date:** 2026-04-20

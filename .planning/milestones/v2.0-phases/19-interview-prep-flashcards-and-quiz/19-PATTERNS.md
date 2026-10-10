# Phase 19: interview-prep-flashcards-and-quiz - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 12 new/modified files
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/functions/interview-prep-analyze/index.ts` | controller | request-response | `supabase/functions/recruiting-lens/index.ts` | exact |
| `supabase/functions/interview-prep-evaluate/index.ts` | controller | request-response | `supabase/functions/recruiting-lens/index.ts` | role-match |
| `supabase/functions/_shared/interview-prep-prompts.ts` | service | transform | `supabase/functions/_shared/recruiting-lens-prompts.ts` | exact |
| `supabase/functions/_shared/interview-prep-validation.ts` | utility | transform | `supabase/functions/interview-prep-coach/validation.ts` | exact |
| `supabase/migrations/XXXXXXXX_interview_prep_tables.sql` | migration | CRUD | `supabase/migrations/20260414000000_merit_ledger_foundation.sql` | exact |
| `src/pages/InterviewPrep.tsx` (REWRITE) | component | request-response | `src/pages/RecruitingLens.tsx` | exact |
| `src/components/InterviewFlashcards.tsx` | component | transform | `src/pages/RecruitingLens.tsx` (result display sections) | role-match |
| `src/components/InterviewQuiz.tsx` | component | event-driven | `src/pages/InterviewPrep.tsx` (existing v1.0 quiz flow) | role-match |
| `src/components/InterviewQuizResults.tsx` | component | transform | `src/pages/RecruitingLens.tsx` (score + breakdown display) | role-match |
| `src/components/InterviewStreakDisplay.tsx` | component | transform | (no direct analog -- gamification widget is new) | partial |
| `supabase/functions/interview-prep-coach/validation.test.ts` (pattern for new tests) | test | transform | `supabase/functions/interview-prep-coach/validation.test.ts` | exact |
| `src/pages/InterviewPrep.test.tsx` | test | transform | (no existing page tests, but testing-library pattern is standard) | partial |

## Pattern Assignments

### `supabase/functions/interview-prep-analyze/index.ts` (controller, request-response)

**Analog:** `supabase/functions/recruiting-lens/index.ts`

**Imports pattern** (lines 1-18):
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
// NEW imports for Phase 19:
// import { loadPromptVariant } from '../_shared/tier-prompts.ts';
// import { getTimeout, getModel } from '../_shared/tier-config.ts';
// import { validateFlashcards, validateQuizQuestions } from '../_shared/interview-prep-validation.ts';
```

**Handler skeleton pattern** (recruiting-lens/index.ts lines 141-264):
```typescript
serve(async (req) => {
  // 1. OPTIONS handling
  if (req.method === 'OPTIONS') return handleOptionsRequest({ type: 'user' });

  // 2. Request ID + logger
  const reqId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('interview-prep-analyze', reqId);

  try {
    const startTime = Date.now();

    // 3. Parse + validate body (BEFORE auth to avoid charging merits for bad input)
    const body = await req.json();
    const jobDescription = typeof body.jobDescription === 'string' ? body.jobDescription.slice(0, 12000) : '';
    const jobTitle = typeof body.jobTitle === 'string' ? body.jobTitle.slice(0, 200) : undefined;
    const company = typeof body.company === 'string' ? body.company.slice(0, 200) : undefined;

    if (!jobDescription || jobDescription.length < 50) {
      return new Response(
        JSON.stringify({ error: 'invalid_input', message: 'Job description is required (minimum 50 characters).' }),
        { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }

    // 4. Auth -- validate JWT, get tier
    const userContext = await requireAuth(req, { type: 'user' });

    // 5. Tier gate -- reject Free tier with 403
    if (userContext!.tier === 'free') {
      return new Response(
        JSON.stringify({ error: 'pro_or_elite_required', message: 'Interview Prep requires Pro or Elite.' }),
        { status: 403, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }
    const isElite = userContext!.tier === 'elite';
    const userId = userContext!.userId;

    // 6. Rate limit
    const rl = await checkRateLimit(userId, userContext!.tier, {
      key: 'interview-prep-analyze',
      limits: { free: 0, pro: 10, elite: 20 },
    });
    if (!rl.allowed) return createRateLimitResponse(rl.retryAfterSeconds!, 'user');

    // 7. [PHASE 19 NOVEL] Daily cap check (Elite only, BEFORE Merit deduction)
    // 8. [PHASE 19 NOVEL] Auto-fetch resume from Supabase Storage (BEFORE Merit deduction)
    // 9. Merit gateway wrapping
    if (MERIT_SYSTEM_ENABLED && userContext) {
      const gated = await withMerits(
        { userId: userContext!.userId, tier: userContext!.tier as 'free' | 'pro' | 'elite', corsType: 'user' as const },
        'interview_prep',
        async (_txId) => {
          // ... AI call, validation, DB persistence, streak update ...
          // On AI failure: throw new MeritRefundable(ai.status, ai.error);
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
          });
        },
      );
      if (!gated.ok) return gated.response;
      return gated.value;
    }
    // ... legacy path below (kept behind MERIT_SYSTEM_ENABLED=false) ...
  } catch (err) {
    log.error('Unhandled error', { error: (err as Error).message, stack: (err as Error).stack });
    return new Response(
      JSON.stringify({ error: 'internal_error', message: 'An unexpected error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
    );
  }
});
```

**Resume auto-fetch pattern** (analyze-career/index.ts lines 420-452, adapted):
```typescript
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
  // D-02: No resume on file -- return 400, no Merit deduction
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

**AI call + validation + retry pattern** (interview-prep-coach/index.ts lines 80-117):
```typescript
const ai = await invokeAnthropicText({
  model: ANTHROPIC_MODEL,
  system: systemPrompt,
  messages: [{ role: 'user', content: userMessage }],
  maxTokens: 10000,
  temperature: 0.7,
  fixtureKey: 'interview_prep',
  timeoutMs: getTimeout(tier, isElite ? 'quiz' : 'core'),
});

if (!ai.ok) throw new MeritRefundable(ai.status, ai.error);

function parseAiResponse(rawText: string): unknown {
  let text = rawText.trim();
  if (text.startsWith('```json')) text = text.replace(/^```json\s*/, '').replace(/```\s*$/, '');
  else if (text.startsWith('```')) text = text.replace(/^```\s*/, '').replace(/```\s*$/, '');
  try { return JSON.parse(text); } catch {
    const repaired = repairTruncatedJSON(text);
    return JSON.parse(repaired);
  }
}

let parsed = parseAiResponse(ai.text);
let validation = validateOutput(parsed);

if (!validation.valid) {
  log.warn('validation-failed-first-attempt', { error: validation.error });
  const retryAi = await invokeAnthropicText({ /* same params */ });
  if (!retryAi.ok) throw new MeritRefundable(retryAi.status, retryAi.error);
  parsed = parseAiResponse(retryAi.text);
  validation = validateOutput(parsed);
  if (!validation.valid) throw new MeritRefundable(500, 'Validation failed after retry');
}
```

**Error handling pattern** (recruiting-lens/index.ts lines 383-391):
```typescript
} catch (err) {
  log.error('Unhandled error', { error: (err as Error).message, stack: (err as Error).stack });
  return new Response(
    JSON.stringify({ error: 'internal_error', message: 'An unexpected error occurred. Please try again.' }),
    { status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
  );
}
```

---

### `supabase/functions/interview-prep-evaluate/index.ts` (controller, request-response)

**Analog:** `supabase/functions/recruiting-lens/index.ts` (for structure) + `supabase/functions/interview-prep-coach/index.ts` (for single AI call pattern)

**Key differences from interview-prep-analyze:**
- Elite-only (Pro returns 403 immediately)
- No Merit deduction (D-14) -- does NOT use `withMerits` wrapper
- Receives `{ quiz_id, answers: [{ question_id, answer_text }] }`
- Reads original questions from DB, sends Q+A pairs to AI for scoring
- Writes scores back to `interview_quiz_answers` and `interview_quizzes`

**Imports pattern** (same base as analyze, minus merit-gateway):
```typescript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-client.ts';
import { invokeAnthropicText } from '../_shared/anthropic.ts';
import { createLogger } from '../_shared/logger.ts';
import { requireAuth } from '../_shared/auth.ts';
import { corsHeaders, handleOptionsRequest } from '../_shared/cors.ts';
import { checkRateLimit, createRateLimitResponse } from '../_shared/rate-limiter.ts';
import { repairTruncatedJSON } from '../_shared/json-repair.ts';
import { getTimeout, getModel } from '../_shared/tier-config.ts';
```

**Ownership check pattern** (derived from auth.ts + recruiting-lens DB patterns):
```typescript
// Validate quiz ownership -- CRITICAL for security (Pitfall 4)
const supabase = getServiceClient();
const { data: quiz, error: quizError } = await supabase
  .from('interview_quizzes')
  .select('id, user_id, mode, evaluated_at')
  .eq('id', quizId)
  .eq('user_id', userId)  // Ownership enforced in application code
  .single();

if (quizError || !quiz) {
  return new Response(
    JSON.stringify({ error: 'not_found', message: 'Quiz not found or access denied.' }),
    { status: 403, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
  );
}
```

---

### `supabase/functions/_shared/interview-prep-prompts.ts` (service, transform)

**Analog:** `supabase/functions/_shared/recruiting-lens-prompts.ts` + `supabase/functions/_shared/tier-prompts.ts`

**Registration pattern** (tier-prompts.ts lines 63-68):
```typescript
import { registerFeaturePrompts, type Tier } from './tier-prompts.ts';

export interface InterviewPrepPromptParams {
  resumeText: string;
  jobDescription: string;
  jobTitle?: string;
  company?: string;
}

registerFeaturePrompts<InterviewPrepPromptParams>('interview', {
  free: (_params) => {
    return 'ERROR: Free tier should not call interview prep.';
  },
  pro: (params) => {
    // Pro: 3 STAR flashcards with answers
    const { resumeText, jobDescription, jobTitle, company } = params;
    return `...prompt generating 3 flashcards...`;
  },
  elite: (params) => {
    // Elite: 5-7 quiz questions without answers
    const { resumeText, jobDescription, jobTitle, company } = params;
    return `...prompt generating quiz questions...`;
  },
});
```

**Prompt construction pattern** (recruiting-lens-prompts.ts lines 30-78 for shared prefix + per-call suffix structure):
```typescript
// Separate evaluation prompt for interview-prep-evaluate (not registered via tier-prompts)
export function buildEvaluationPrompt(questions: Array<{text: string}>, answers: Array<{text: string}>): string {
  // STAR scoring evaluation prompt
  return `...evaluation prompt with Q+A pairs...`;
}
```

---

### `supabase/functions/_shared/interview-prep-validation.ts` (utility, transform)

**Analog:** `supabase/functions/interview-prep-coach/validation.ts`

**Validation pattern** (validation.ts lines 1-67):
```typescript
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// For Pro flashcard output
export function validateFlashcards(parsed: unknown): ValidationResult {
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as Record<string, unknown>).flashcards)) {
    return { valid: false, error: 'Response missing flashcards array' };
  }
  const flashcards = (parsed as Record<string, unknown>).flashcards as Record<string, unknown>[];
  if (flashcards.length !== 3) {
    return { valid: false, error: `Expected 3 flashcards, got ${flashcards.length}` };
  }
  // Check required fields per flashcard...
  for (const fc of flashcards) {
    if (!fc.question || typeof fc.question !== 'string') {
      return { valid: false, error: 'Flashcard missing question field' };
    }
    if (!fc.star_answer || typeof fc.star_answer !== 'object') {
      return { valid: false, error: 'Flashcard missing star_answer object' };
    }
    const star = fc.star_answer as Record<string, unknown>;
    for (const field of ['situation', 'task', 'action', 'result']) {
      if (!(field in star) || typeof star[field] !== 'string') {
        return { valid: false, error: `Flashcard star_answer missing: ${field}` };
      }
    }
  }
  return { valid: true };
}

// For Elite quiz output
export function validateQuizQuestions(parsed: unknown): ValidationResult {
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as Record<string, unknown>).questions)) {
    return { valid: false, error: 'Response missing questions array' };
  }
  const questions = (parsed as Record<string, unknown>).questions as Record<string, unknown>[];
  if (questions.length < 5 || questions.length > 7) {
    return { valid: false, error: `Expected 5-7 questions, got ${questions.length}` };
  }
  // Check required fields per question...
  return { valid: true };
}
```

---

### `supabase/migrations/XXXXXXXX_interview_prep_tables.sql` (migration, CRUD)

**Analog:** `supabase/migrations/20260414000000_merit_ledger_foundation.sql`

**Migration pattern** (merit_ledger_foundation.sql lines 1-60):
```sql
-- Phase 19: interview-prep-flashcards-and-quiz -- additive only.
-- Closes IPC-07 (3 new tables).
--
-- CRITICAL: Do NOT add any permissive policy that matches all rows.
-- Service role bypasses RLS automatically, which is the ONLY legitimate write path.

-- interview_quizzes
CREATE TABLE IF NOT EXISTS public.interview_quizzes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- ... columns ...
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS: service-role writes, user reads own
ALTER TABLE interview_quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own quizzes"
  ON interview_quizzes FOR SELECT
  USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies for users -- writes are service-role only
```

**Key conventions from existing migrations:**
- Use `gen_random_uuid()` for UUIDs, not `uuid_generate_v4()`
- `CHECK` constraints for enum-like columns (e.g., `CHECK (mode IN ('flashcard', 'quiz'))`)
- `REFERENCES auth.users(id) ON DELETE CASCADE` for user FKs
- `timestamptz NOT NULL DEFAULT now()` for timestamps
- `CREATE INDEX` for frequently queried columns
- RLS enabled with read-own policies; writes via service-role only

---

### `src/pages/InterviewPrep.tsx` (REWRITE) (component, request-response)

**Analog:** `src/pages/RecruitingLens.tsx`

**Imports pattern** (RecruitingLens.tsx lines 1-41):
```typescript
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { /* lucide icons */ } from "lucide-react";
```

**Component initialization + tier detection pattern** (RecruitingLens.tsx lines 188-275):
```typescript
const InterviewPrep = () => {
  const navigate = useNavigate();
  const { getEffectiveTier } = useAdminTierTest();

  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<string>('free');
  // ... other state ...

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }

      const [profileResult] = await Promise.all([
        supabase.from('profiles')
          .select('subscription_tier')
          .eq('id', user.id).single(),
      ]);

      setTier(getEffectiveTier(profileResult.data?.subscription_tier || 'free'));
      setLoading(false);
    };
    init();
  }, []);
```

**Free tier gate pattern** (RecruitingLens.tsx, conditional rendering):
```typescript
  // Free tier users see ProFeatureGate
  if (tier === 'free') {
    return (
      <ProFeatureGate
        featureName="Interview Prep"
        featureIcon={<Brain className="w-6 h-6" />}
        description="Upgrade to Pro for AI-powered STAR flashcards or Elite for interactive quiz practice."
        benefits={[
          "AI-generated STAR flashcards (Pro)",
          "Interactive quiz with scoring (Elite)",
          "Streak tracking and daily practice goals",
          "Personalized to your resume and target role"
        ]}
      />
    );
  }
```

**Analysis invocation pattern** (RecruitingLens.tsx lines 303-366):
```typescript
const { canAnalyze, triggerPaywall, refresh: refreshPaywall } = usePaywallGuard();
const { startAnalysis, cancelAnalysis } = useAnalysisGuard();

const handleGenerate = async () => {
  if (!canAnalyze) { triggerPaywall(); return; }

  setIsAnalyzing(true);
  setShowTryAgain(false);

  const result = await startAnalysis(async (_signal) => {
    const { data, error } = await invokeWithTimeout('interview-prep-analyze', {
      body: {
        jobDescription: jobDescription.trim(),
        jobTitle: jobTitle?.trim() || undefined,
        company: company?.trim() || undefined,
      },
    }, 120000); // 120s timeout covers 80s quiz + buffer

    if (error) {
      // Check for structured error responses
      if (data && typeof data === 'object' && 'error' in data) {
        const errCode = (data as any).error;
        if (errCode === 'no_resume') throw new Error((data as any).message);
        if (errCode === 'daily_cap_reached') throw new Error((data as any).message);
        // ... other error codes ...
      }
      throw new Error(error.message || 'Generation failed. Please try again.');
    }
    return data;
  });

  setIsAnalyzing(false);

  if (result.success && result.data) {
    // Route to flashcards or quiz based on mode in response
    setResult(result.data);
    toast.success('Interview prep generated!');
    refreshPaywall();
  } else if (result.error) {
    console.error('[InterviewPrep] error:', result.error);
    toast.error(result.error);
    setShowTryAgain(true);
  }
};
```

---

### `src/components/InterviewFlashcards.tsx` (component, transform)

**Analog:** `src/pages/RecruitingLens.tsx` (score display + card sections)

**Card display pattern** (RecruitingLens.tsx result rendering sections):
```typescript
// Individual flashcard card pattern
<Card className="border-border/50 bg-card/50 backdrop-blur">
  <CardContent className="p-6">
    <div className="flex items-start gap-3 mb-4">
      <Badge variant="outline" className="text-xs">Behavioral</Badge>
      <h3 className="text-lg font-semibold">{flashcard.question}</h3>
    </div>
    <div className="space-y-3 text-sm text-muted-foreground">
      <div><span className="font-medium text-foreground">Situation:</span> {flashcard.star_answer.situation}</div>
      <div><span className="font-medium text-foreground">Task:</span> {flashcard.star_answer.task}</div>
      <div><span className="font-medium text-foreground">Action:</span> {flashcard.star_answer.action}</div>
      <div><span className="font-medium text-foreground">Result:</span> {flashcard.star_answer.result}</div>
    </div>
  </CardContent>
</Card>
```

**Animation pattern** (existing pages use framer-motion):
```typescript
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: index * 0.1 }}
>
  {/* Card content */}
</motion.div>
```

---

### `src/components/InterviewQuiz.tsx` (component, event-driven)

**Analog:** `src/pages/InterviewPrep.tsx` (existing v1.0, lines 1-78 for types) + `src/pages/RecruitingLens.tsx` (for form patterns)

**Local state management pattern for one-at-a-time flow:**
```typescript
interface QuizState {
  questions: Array<{ id: string; question_order: number; question_text: string; competency?: string }>;
  currentIndex: number;
  answers: Record<string, string>;  // question_id -> answer_text
}

const [state, setState] = useState<QuizState>({ questions: [], currentIndex: 0, answers: {} });
const [submitting, setSubmitting] = useState(false);

const currentQuestion = state.questions[state.currentIndex];
const isLastQuestion = state.currentIndex === state.questions.length - 1;
const canSubmitAll = Object.keys(state.answers).length === state.questions.length;

const handleSaveAnswer = (answerText: string) => {
  setState(prev => ({
    ...prev,
    answers: { ...prev.answers, [currentQuestion.id]: answerText },
    currentIndex: Math.min(prev.currentIndex + 1, prev.questions.length - 1),
  }));
};
```

**Textarea with character counter pattern** (derived from existing shadcn/ui Textarea):
```typescript
<div className="relative">
  <Textarea
    value={currentAnswer}
    onChange={(e) => {
      if (e.target.value.length <= 500) setCurrentAnswer(e.target.value);
    }}
    placeholder="Describe a specific situation using the STAR framework..."
    className="min-h-[120px] resize-none"
  />
  <span className={cn(
    "absolute bottom-2 right-3 text-xs",
    currentAnswer.length > 450 ? "text-amber-500" : "text-muted-foreground",
    currentAnswer.length >= 500 ? "text-red-500" : "",
  )}>
    {currentAnswer.length}/500
  </span>
</div>
```

**Batch submission pattern** (invokeWithTimeout from RecruitingLens.tsx):
```typescript
const handleSubmitAll = async () => {
  setSubmitting(true);
  const { data, error } = await invokeWithTimeout('interview-prep-evaluate', {
    body: {
      quiz_id: quizData.quiz_id,
      answers: Object.entries(state.answers).map(([question_id, answer_text]) => ({
        question_id,
        answer_text,
      })),
    },
  }, 120000);
  setSubmitting(false);
  if (error) { toast.error('Evaluation failed. Please try again.'); return; }
  onResults(data);
};
```

---

### `src/components/InterviewQuizResults.tsx` (component, transform)

**Analog:** `src/pages/RecruitingLens.tsx` (score display sections)

**Score display pattern** (RecruitingLens.tsx score helpers, lines 123-138):
```typescript
const scoreColor = (score: number) =>
  score >= 75 ? 'text-emerald-600 dark:text-emerald-400'
    : score >= 55 ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400';

// Per-question STAR breakdown card pattern
<Card>
  <CardContent className="p-4">
    <div className="flex justify-between items-center mb-2">
      <span className="font-medium">{question.text}</span>
      <span className={cn("font-bold text-lg", scoreColor(scoring.score))}>
        {scoring.score}/100
      </span>
    </div>
    <div className="grid grid-cols-4 gap-2 text-xs">
      <div>Situation: {scoring.breakdown.situation_score}</div>
      <div>Task: {scoring.breakdown.task_score}</div>
      <div>Action: {scoring.breakdown.action_score}</div>
      <div>Result: {scoring.breakdown.result_score}</div>
    </div>
    {scoring.feedback && <p className="text-sm text-muted-foreground mt-2">{scoring.feedback}</p>}
  </CardContent>
</Card>
```

---

### `src/components/InterviewStreakDisplay.tsx` (component, transform)

**Analog:** No direct analog in codebase (gamification widget is novel). Use existing Badge/Card patterns from `src/pages/RecruitingLens.tsx` and `src/components/ui/badge.tsx` for layout. Animation patterns from existing framer-motion usage.

**Badge + icon pattern** (existing RecruitingLens.tsx Badge usage):
```typescript
<div className="flex items-center gap-3">
  <div className={cn(
    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium",
    streakState === 'active' && "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    streakState === 'cold' && "bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 opacity-70",
    streakState === 'expired' && "bg-muted text-muted-foreground",
  )}>
    <Flame className="w-4 h-4" />
    <span>{streak} day streak</span>
  </div>
  <Badge variant="outline" className="text-xs">
    {dailyUsed}/3 today
  </Badge>
</div>
```

---

### Backend Test Files (test, transform)

**Analog:** `supabase/functions/interview-prep-coach/validation.test.ts` + `supabase/functions/_shared/tier-config.test.ts`

**Deno test pattern** (validation.test.ts lines 1-10):
```typescript
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { validateFlashcards } from './interview-prep-validation.ts';

Deno.test('valid 3-flashcard response returns valid: true', () => {
  const result = validateFlashcards(makeValidFlashcardResponse());
  assertEquals(result.valid, true);
  assertEquals(result.error, undefined);
});

Deno.test('response with 2 flashcards returns valid: false', () => {
  const response = makeValidFlashcardResponse();
  response.flashcards.pop();
  const result = validateFlashcards(response);
  assertEquals(result.valid, false);
  assertEquals(result.error!.includes('Expected 3 flashcards'), true);
});
```

**Assert import convention:** Use `https://deno.land/std@0.168.0/testing/asserts.ts` (matching existing tests) or `https://deno.land/std@0.224.0/assert/mod.ts` (used in tier-config.test.ts -- more recent). The codebase uses both; prefer `0.224.0` for new files matching the tier-config.test.ts convention.

---

## Shared Patterns

### Authentication
**Source:** `supabase/functions/_shared/auth.ts` (full file, 173 lines)
**Apply to:** `interview-prep-analyze/index.ts`, `interview-prep-evaluate/index.ts`
```typescript
const userContext = await requireAuth(req, { type: 'user' });
// Returns UserContext { userId, email, tier } where tier comes from profiles.subscription_tier
```

### CORS
**Source:** `supabase/functions/_shared/cors.ts`
**Apply to:** All edge function responses
```typescript
// Preflight
if (req.method === 'OPTIONS') return handleOptionsRequest({ type: 'user' });
// Response headers
{ ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' }
```

### Structured Logging
**Source:** `supabase/functions/_shared/logger.ts` (lines 1-40)
**Apply to:** All edge functions
```typescript
const reqId = crypto.randomUUID().slice(0, 8);
const log = createLogger('interview-prep-analyze', reqId);
log.info('request-start', { userId, tier: userContext!.tier });
log.error('request-failed', { error: errorMessage });
```

### Merit Gateway Wrapping
**Source:** `supabase/functions/_shared/merit-gateway.ts` (lines 115-198)
**Apply to:** `interview-prep-analyze/index.ts` only (evaluate does NOT use withMerits per D-14)
```typescript
if (MERIT_SYSTEM_ENABLED && userContext) {
  const gated = await withMerits(
    { userId: userContext!.userId, tier: userContext!.tier as 'free' | 'pro' | 'elite', corsType: 'user' as const },
    'interview_prep',
    async (_txId) => {
      const ai = await invokeAnthropicText({ /* ... */ });
      if (!ai.ok) throw new MeritRefundable(ai.status, ai.error);
      // ... process result ...
      return new Response(JSON.stringify(result), { /* ... */ });
    },
  );
  if (!gated.ok) return gated.response;
  return gated.value;
}
```

### Input Sanitization
**Source:** `supabase/functions/_shared/prompt-sanitizer.ts`
**Apply to:** All user-supplied text before AI calls in both edge functions
```typescript
const sanitizedJD = sanitizeUserContent(jobDescription, 'interview-prep-analyze', log);
```

### JSON Repair
**Source:** `supabase/functions/_shared/json-repair.ts`
**Apply to:** AI response parsing in both edge functions
```typescript
import { repairTruncatedJSON } from '../_shared/json-repair.ts';

let text = rawText.trim();
if (text.startsWith('```json')) text = text.replace(/^```json\s*/, '').replace(/```\s*$/, '');
try { return JSON.parse(text); } catch {
  const repaired = repairTruncatedJSON(text);
  return JSON.parse(repaired);
}
```

### Frontend Edge Function Invocation
**Source:** `src/lib/fetchWithTimeout.ts` (lines 1-60)
**Apply to:** `InterviewPrep.tsx`, `InterviewQuiz.tsx`
```typescript
import { invokeWithTimeout } from "@/lib/fetchWithTimeout";

const { data, error } = await invokeWithTimeout('interview-prep-analyze', {
  body: { jobDescription, jobTitle, company },
}, 120000);
```

### Frontend Loading State
**Source:** `src/components/UniversalAnalyzing.tsx`
**Apply to:** `InterviewPrep.tsx` during generation
```typescript
import { UniversalAnalyzing } from "@/components/UniversalAnalyzing";

<UniversalAnalyzing
  isAnalyzing={isAnalyzing}
  title="Generating Interview Prep"
  subtitle="Analyzing your resume and job description..."
  steps={[
    { id: 'resume', label: 'Reading your resume', icon: <FileText /> },
    { id: 'questions', label: 'Crafting questions', icon: <Brain /> },
    { id: 'finalizing', label: 'Finalizing prep material', icon: <Sparkles /> },
  ]}
/>
```

### Frontend ProFeatureGate
**Source:** `src/components/ProFeatureGate.tsx` (305 lines, used as-is)
**Apply to:** `InterviewPrep.tsx` for free-tier users
```typescript
import { ProFeatureGate } from "@/components/ProFeatureGate";

if (tier === 'free') {
  return (
    <ProFeatureGate
      featureName="Interview Prep"
      featureIcon={<Brain className="w-6 h-6" />}
      description="..."
      benefits={[...]}
    />
  );
}
```

## No Analog Found

| File | Role | Data Flow | Reason | Guidance |
|------|------|-----------|--------|----------|
| `src/components/InterviewStreakDisplay.tsx` | component | transform | No gamification/streak widget exists in the codebase | Use existing Badge + Lucide icon patterns. Flame icon from lucide-react. framer-motion for state transitions. Color scheme follows scoreColor/severityColor helpers from RecruitingLens. |

## Metadata

**Analog search scope:** `supabase/functions/`, `supabase/migrations/`, `src/pages/`, `src/components/`, `src/lib/`, `src/hooks/`
**Files scanned:** 40+ via Glob + Grep + Read
**Pattern extraction date:** 2026-04-17

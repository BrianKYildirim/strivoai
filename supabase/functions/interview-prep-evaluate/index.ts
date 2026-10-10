import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-client.ts';
import { invokeAnthropicText } from '../_shared/anthropic.ts';
import { createLogger } from '../_shared/logger.ts';
import { requireAuth } from '../_shared/auth.ts';
import { corsHeaders, handleOptionsRequest, withCors } from '../_shared/cors.ts';
import { checkRateLimit, createRateLimitResponse } from '../_shared/rate-limiter.ts';
import { repairTruncatedJSON } from '../_shared/json-repair.ts';
import { getTimeout, getModel, getMaxOutput } from '../_shared/tier-config.ts';
import { buildEvaluationPrompt } from '../_shared/interview-prep-prompts.ts';
import { validateEvaluationScores } from '../_shared/interview-prep-validation.ts';
import { beginFeatureRun, type FeatureRunRuntime } from '../_shared/feature-run-runtime.ts';

// NOTE: No import of withMerits or MERIT_SYSTEM_ENABLED.
// Evaluate has 0 Merit cost per D-14 -- the 5-Merit charge was at quiz generation time.

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnswerInput {
  question_id: string;
  answer_text: string;
}

interface EvaluationScoreEntry {
  question_id: string;
  score: number;
  breakdown: { situation: number; task: number; action: number; result: number };
  feedback: string;
  suggestions: string[];
}

interface EvaluationResult {
  scores: EvaluationScoreEntry[];
  overall_readiness: number;
  overall_summary: string;
}

// ── AI response parser ────────────────────────────────────────────────────────

function parseAiResponse(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try repair for truncated JSON from streaming
  }

  // Attempt JSON repair for truncated responses
  try {
    const repaired = repairTruncatedJSON(text);
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve((req) => withCors(req, 'user', async () => {
  // 1. OPTIONS handling
  if (req.method === 'OPTIONS') return handleOptionsRequest({ type: 'user' });

  // 2. Request ID + logger
  const reqId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('interview-prep-evaluate', reqId);
  let featureRuntime: FeatureRunRuntime | null = null;

  try {
    const startTime = Date.now();

    // 3. Auth -- validate JWT, get tier
    const userContext = await requireAuth(req, { type: 'user' });
    if (!userContext) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }

    // 4. Basic tier pre-filter -- Free never evaluates. Fine-grained Pro-elite_taste
    //    check happens AFTER the quiz fetch once quiz.tier is known (Phase 23 D-02, D-05).
    if (userContext.tier !== 'elite' && userContext.tier !== 'pro') {
      return new Response(
        JSON.stringify({
          error: 'elite_or_elite_taste_required',
          message: 'Quiz evaluation requires Elite.',
        }),
        { status: 403, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }
    const userId = userContext.userId;

    log.info('request-start', { userId, tier: userContext.tier });

    // 5. Rate limit
    const rl = await checkRateLimit(userId, 'elite', {
      key: 'interview-prep-evaluate',
      limits: { free: 0, pro: 0, elite: 20 },
    });
    if (!rl.allowed) return createRateLimitResponse(rl.retryAfterSeconds!, 'user');

    // 6. Parse + validate body
    const body = await req.json();
    const quizId = typeof body.quiz_id === 'string' ? body.quiz_id : '';
    const answers: AnswerInput[] = Array.isArray(body.answers) ? body.answers : [];

    if (!quizId) {
      return new Response(
        JSON.stringify({ error: 'invalid_input', message: 'quiz_id is required.' }),
        { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(quizId)) {
      return new Response(
        JSON.stringify({ error: 'invalid_input', message: 'Invalid quiz_id format.' }),
        { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }

    // Validate each answer has question_id (string) and answer_text (string, max 500 chars)
    for (const a of answers) {
      if (typeof a.question_id !== 'string' || !a.question_id) {
        return new Response(
          JSON.stringify({ error: 'invalid_input', message: 'Each answer must have a question_id.' }),
          { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
        );
      }
      if (typeof a.answer_text !== 'string') {
        return new Response(
          JSON.stringify({ error: 'invalid_input', message: 'Each answer must have an answer_text string.' }),
          { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
        );
      }
      // Server-side 500-char enforcement (IPC-03, T-19-13)
      a.answer_text = a.answer_text.slice(0, 500);
    }

    // 7. Quiz ownership check (CRITICAL security -- T-19-11, Pitfall 4)
    const supabase = getServiceClient();

    const { data: quiz, error: quizError } = await supabase
      .from('interview_quizzes')
      .select('id, user_id, mode, evaluated_at, job_description, tier')
      .eq('id', quizId)
      .eq('user_id', userId) // Ownership enforced in application code (service-role bypasses RLS)
      .single();

    if (quizError || !quiz) {
      return new Response(
        JSON.stringify({ error: 'not_found', message: 'Quiz not found or access denied.' }),
        { status: 403, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }

    // Prevent re-evaluation (T-19-12)
    if (quiz.evaluated_at) {
      return new Response(
        JSON.stringify({ error: 'already_evaluated', message: 'This quiz has already been evaluated.' }),
        { status: 409, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }

    // Must be a quiz, not a flashcard session
    if (quiz.mode !== 'quiz') {
      return new Response(
        JSON.stringify({ error: 'invalid_mode', message: 'Only quiz sessions can be evaluated.' }),
        { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }

    // Widened tier gate (Phase 23 D-02, D-05) — Elite can evaluate any of their quizzes;
    // Pro can evaluate ONLY their monthly elite_taste quiz. Ownership check above already
    // fired, so any tier-gate rejection here cannot leak cross-user info.
    const canEvaluate =
      userContext.tier === 'elite' ||
      (userContext.tier === 'pro' && quiz.tier === 'elite_taste');
    if (!canEvaluate) {
      log.warn('tier-gate-denied', { tier: userContext.tier, quizTier: quiz.tier });
      return new Response(
        JSON.stringify({
          error: 'elite_or_elite_taste_required',
          message: 'Quiz evaluation requires Elite.',
        }),
        { status: 403, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }

    // 8. Fetch original questions
    const { data: questions, error: qError } = await supabase
      .from('interview_quiz_answers')
      .select('id, question_order, question_text, competency')
      .eq('quiz_id', quizId)
      .order('question_order', { ascending: true });

    if (qError || !questions || questions.length === 0) {
      return new Response(
        JSON.stringify({ error: 'no_questions', message: 'No questions found for this quiz.' }),
        { status: 404, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }

    // Verify all questions have answers
    const answeredOrders = new Set(answers.map((a) => parseInt(a.question_id, 10)));
    const missingQuestions = questions.filter((q) => !answeredOrders.has(q.question_order));
    if (missingQuestions.length > 0) {
      return new Response(
        JSON.stringify({
          error: 'incomplete_answers',
          message: `Missing answers for ${missingQuestions.length} question(s).`,
          missing_question_ids: missingQuestions.map((q) => q.question_order),
        }),
        { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }

    // 8b. Costing correlation — an answer evaluation is a deliberate, separately
    // countable `evaluation` variant of the canonical `interview_prep` feature. It is
    // created only after auth, access, envelope, and ownership checks pass, and before
    // any provider work. Evaluation costs 0 Merits (D-14), which is recorded as an
    // observed zero rather than left unknown. A repeated evaluation of the same quiz
    // recovers the same run instead of creating a second one.
    const costingCorrelation = await beginFeatureRun({
      userId,
      feature: 'interview_prep',
      requestId: reqId,
      serverActionKey: `interview-prep-evaluate:${quizId}`,
      runVariant: 'evaluation',
      inputType: 'text',
      documentCount: 0,
    });
    if (!costingCorrelation.ok) {
      return new Response(
        JSON.stringify({ error: costingCorrelation.reason }),
        { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }
    featureRuntime = costingCorrelation.runtime;
    await featureRuntime?.markZeroMerits();

    // 9. Build evaluation prompt + AI call
    const evalPrompt = buildEvaluationPrompt(questions, answers, quiz.job_description);
    const model = getModel('elite', 'interview');
    const timeoutMs = getTimeout('elite', 'quiz'); // 80,000ms per IPC-10
    // Hard OUTPUT cap (quick task 260608-p5k): evaluation shares the elite
    // interviewPrepCoach budget — bounded by getMaxOutput (elite 12000).
    const evalMaxTokens = getMaxOutput('interviewPrepCoach', 'elite');

    log.info('evaluation-start', { quizId, questionCount: questions.length, model, timeoutMs });
    const evalTimer = log.timer('evaluation-ai');

    const ai = await invokeAnthropicText({
      model,
      system: evalPrompt,
      messages: [{ role: 'user', content: 'Evaluate these interview answers using the STAR framework.' }],
      maxTokens: evalMaxTokens,
      temperature: 0.3, // Lower temperature for scoring consistency
      fixtureKey: 'interview_prep',
      timeoutMs,
      // Phase 02 · TOK-02 — instrumentation ONLY (no cap change; tuning deferred).
      // A DISTINCT callName from interview-prep-analyze so answer-evaluation rows never
      // merge with content-generation rows in the headroom report. `tier` is 'elite'
      // because the elite budget is what getMaxOutput was asked for above — the cap
      // being measured, not the caller's subscription (Pro can evaluate an elite_taste
      // quiz and still spends the elite budget).
      telemetry: {
        feature: 'interview_prep',
        tier: 'elite',
        callName: 'interview-prep-evaluate',
        reqId,
        userId,
        attempt: 1,
        featureRunId: featureRuntime?.featureRunId,
      },
    });

    evalTimer();

    if (!ai.ok) {
      const aiErr = ai as { ok: false; status: number; error: string };
      log.error('evaluation-ai-failed', { quizId, status: aiErr.status, error: aiErr.error });
      await featureRuntime?.fail('EVALUATION_AI_FAILED', 'provider');
      return new Response(
        JSON.stringify({ error: 'evaluation_failed', message: 'AI evaluation failed. Please try again.' }),
        { status: 502, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }

    // 10. Parse + validate scores
    let parsed = parseAiResponse(ai.text);
    let validation = validateEvaluationScores(parsed, questions.length);

    if (!validation.valid) {
      log.warn('evaluation-validation-failed', { error: validation.error, quizId });
      // Retry once
      const retryTimer = log.timer('evaluation-ai-retry');
      const retryAi = await invokeAnthropicText({
        model,
        system: evalPrompt,
        messages: [{ role: 'user', content: 'Evaluate these interview answers using the STAR framework.' }],
        maxTokens: evalMaxTokens,
        temperature: 0.3,
        fixtureKey: 'interview_prep',
        timeoutMs,
        telemetry: {
          feature: 'interview_prep',
          tier: 'elite',
          callName: 'interview-prep-evaluate',
          reqId,
          userId,
          attempt: 2,
          featureRunId: featureRuntime?.featureRunId,
        },
      });
      retryTimer();

      if (!retryAi.ok) {
        const retryErr = retryAi as { ok: false; status: number; error: string };
        log.error('evaluation-ai-retry-failed', { quizId, status: retryErr.status, error: retryErr.error });
        await featureRuntime?.fail('EVALUATION_AI_FAILED', 'provider');
        return new Response(
          JSON.stringify({ error: 'evaluation_failed', message: 'AI evaluation failed on retry. Please try again.' }),
          { status: 502, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
        );
      }

      parsed = parseAiResponse(retryAi.text);
      validation = validateEvaluationScores(parsed, questions.length);
      if (!validation.valid) {
        log.error('evaluation-validation-failed-twice', { error: validation.error, quizId });
        await featureRuntime?.fail('EVALUATION_OUTPUT_INVALID', 'parsing');
        return new Response(
          JSON.stringify({ error: 'evaluation_failed', message: 'Could not parse AI evaluation results.' }),
          { status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
        );
      }
    }

    const evalResult = parsed as EvaluationResult;

    // 11. Write scores back to database
    for (const scoreEntry of evalResult.scores) {
      const questionOrder = parseInt(scoreEntry.question_id, 10);
      const answerRow = answers.find((a) => a.question_id === scoreEntry.question_id);
      if (!answerRow) continue;

      const { error: updateErr } = await supabase
        .from('interview_quiz_answers')
        .update({
          user_answer: answerRow.answer_text,
          score: scoreEntry.score,
          scoring_breakdown: scoreEntry.breakdown,
          suggestions: scoreEntry.suggestions,
        })
        .eq('quiz_id', quizId)
        .eq('question_order', questionOrder);

      if (updateErr) {
        log.warn('answer-update-failed', { questionId: scoreEntry.question_id, error: updateErr.message });
      }
    }

    // Update quiz with overall score and evaluation timestamp
    const { error: quizUpdateErr } = await supabase
      .from('interview_quizzes')
      .update({
        overall_score: evalResult.overall_readiness,
        evaluated_at: new Date().toISOString(),
      })
      .eq('id', quizId);

    if (quizUpdateErr) {
      log.warn('quiz-update-failed', { quizId, error: quizUpdateErr.message });
    }

    // Terminalize only after the scored answers and quiz row are durable.
    await featureRuntime?.complete();

    log.info('evaluation-complete', {
      quizId,
      overallReadiness: evalResult.overall_readiness,
      questionCount: questions.length,
      durationMs: Date.now() - startTime,
    });

    // 12. Return results
    return new Response(JSON.stringify({
      quiz_id: quizId,
      scores: evalResult.scores,
      overall_readiness: evalResult.overall_readiness,
      overall_summary: evalResult.overall_summary,
    }), {
      status: 200,
      headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // Thrown Responses from requireAuth (401)
    if (err instanceof Response) return err;

    await featureRuntime?.fail('EVALUATION_REQUEST_FAILED', 'internal');
    log.error('unhandled-error', { error: (err as Error).message, stack: (err as Error).stack });
    return new Response(
      JSON.stringify({ error: 'internal_error', message: 'An unexpected error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
    );
  }
}));

/**
 * interview-prep-analyze edge function (Phase 23 rewrite — Runtime §10 nine-section).
 *
 * Tier-conditional Interview Prep generator returning the full §10 nine-section
 * payload in a SINGLE Anthropic call (D-06):
 *   - Pro (variant='pro'):            flashcards, 5K tokens, 3 items
 *   - Elite (variant='elite'):        quiz, 10K tokens, 5/5/6/7 by duration
 *   - Pro+elite_taste (variant='elite_taste'): quiz, 10K tokens, 1/month quota
 *   - Free: 403 blocked (IPC-01)
 *
 * Pipeline:
 *   OPTIONS → reqId → body.json → Zod IntakeFormSchema → auth → tier gate
 *   → rate limit → variant resolver → (pre-Merit) elite-daily-cap OR
 *   elite_taste-monthly-quota → auto-fetch resume → PDF extract
 *   → sanitize JD + background → withMerits(
 *       loadPromptVariant → invokeAnthropicText (temp 0.4, fixtureKey='interview_prep')
 *       → parseAiResponse (includes repairTruncatedJSON) → validateInterviewPrepPayload
 *       → findDroppedOptionalFields
 *       → [retry once at temp 0.2 if schema OR silent-drops]
 *       → INSERT interview_quizzes (9 intake cols + readiness_score + tier)
 *       → INSERT interview_quiz_answers (quiz variants only per D-07)
 *       → UPSERT interview_streaks (variant='elite' only per D-12)
 *       → record_ai_usage RPC (History visibility)
 *       → 200 response
 *     )
 *
 * MeritRefundable taxonomy (MER-01): refund fires only on 5xx/408/529/AbortError/
 * network. 4xx NOT refunded — usage_limit checks and input-validation errors do
 * not charge Merits.
 *
 * @see 23-CONTEXT.md D-06, D-07, D-10, D-11, D-13, D-14
 * @see 23-AI-SPEC.md §4 runExtraction + token budgets
 * @see 23-PATTERNS.md § interview-prep-analyze
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-client.ts';
import { invokeAnthropicText } from '../_shared/anthropic.ts';
import { createLogger } from '../_shared/logger.ts';
import { requireAuth } from '../_shared/auth.ts';
import { beginFeatureRun, type FeatureRunRuntime } from '../_shared/feature-run-runtime.ts';
import { corsHeaders, handleOptionsRequest, withCors } from '../_shared/cors.ts';
import { checkRateLimit, createRateLimitResponse } from '../_shared/rate-limiter.ts';
import { MERIT_SYSTEM_ENABLED, withMerits, MeritRefundable } from '../_shared/merit-gateway.ts';
import { recordUsageWithAnalysis } from '../_shared/usage-checker.ts';
import { sanitizeUserContent } from '../_shared/prompt-sanitizer.ts';
import { repairTruncatedJSON } from '../_shared/json-repair.ts';
import { extractPDFTextWithMetadata } from '../_shared/pdf-parser.ts';
import { loadPromptVariant } from '../_shared/tier-prompts.ts';
import { getTimeout, getModel, getMaxOutput, getMaxInputChars, type Tier } from '../_shared/tier-config.ts';
import { assessExtractionQuality } from '../_shared/document-quality.ts';
import { persistAcceptedExtraction } from '../_shared/document-persistence.ts';
import '../_shared/interview-prep-prompts.ts'; // Side-effect: registers 'interview' prompts
import {
  validateInterviewPrepPayload,
  findDroppedOptionalFields,
  clampOverflowingStrings,
} from '../_shared/interview-prep-validation.ts';
import {
  IntakeFormSchema,
  type InterviewPrepPayload,
} from '../_shared/types/interviewPrep.ts';

// Phase 21 D-19: boot-time merit-flag attestation (SC-5 evidence source).
createLogger("interview-prep-analyze").info("merit-flag", { enabled: MERIT_SYSTEM_ENABLED });

// ── Response helpers ──────────────────────────────────────────────────────────

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
  });
}

function isAcceptedStoredResumeText(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  return assessExtractionQuality({
    text: value,
    documentType: 'resume',
    provider: 'pdf_parser',
  }).ok;
}

// ── AI response parser (D-09 — parseAiResponse → repairTruncatedJSON → Zod parse) ──

export function parseAiResponse(rawText: string): unknown {
  let text = rawText.trim();
  // Strip markdown fences
  if (text.startsWith('```json')) text = text.replace(/^```json\s*/, '').replace(/```\s*$/, '');
  else if (text.startsWith('```')) text = text.replace(/^```\s*/, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(text);
  } catch {
    const repaired = repairTruncatedJSON(text);
    return JSON.parse(repaired);
  }
}

// ── UTC date helpers ──────────────────────────────────────────────────────────

/** Returns ISO timestamp for midnight UTC today. */
function todayMidnightUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}T00:00:00Z`;
}

/** Returns ISO timestamp for the first day of the current UTC month. */
function firstOfMonthUtcIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handler(req: Request): Promise<Response> {
  // 1. OPTIONS handling
  if (req.method === 'OPTIONS') return handleOptionsRequest({ type: 'user' });

  // 2. Request ID + logger
  const reqId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('interview-prep-analyze', reqId);
  let featureRuntime: FeatureRunRuntime | null = null;
  let activeMeritTransactionId: string | null = null;

  try {
    const startTime = Date.now();

    // 3. Parse body (BEFORE auth so malformed requests fail fast — Pitfall 6)
    let bodyJson: unknown;
    try {
      bodyJson = await req.json();
    } catch {
      return jsonResponse({ error: 'invalid_input', message: 'Invalid JSON body.' }, 400);
    }

    // Zod-validate the 9-field intake (D-13, D-14)
    const intakeParse = IntakeFormSchema.safeParse(bodyJson);
    if (!intakeParse.success) {
      return jsonResponse(
        {
          error: 'invalid_input',
          message: 'Intake form validation failed',
          issues: intakeParse.error.issues.slice(0, 3).map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        400,
      );
    }
    const intake = intakeParse.data;
    const {
      job_description,
      background_context,
      role_title,
      company,
      interview_type,
      question_categories,
      difficulty,
      duration,
      format,
      elite_taste_request,
    } = intake;

    // 4. Auth — validate JWT, get tier (T-19-06, T-19-08: tier from profiles, not request)
    const userContext = await requireAuth(req, { type: 'user' });
    // IN-05: defensive-only. For type:'user', requireUserAuth is typed Promise<UserContext> and
    // always THROWS on failure (the thrown 401 Response is propagated by the catch guard), so this
    // branch is unreachable. Kept so a reader never assumes requireAuth can return null for users.
    if (!userContext) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const userId = userContext.userId;

    // 5. Tier gate (D-13, IPC-01)
    if (userContext.tier === 'free') {
      return jsonResponse(
        { error: 'elite_required', message: 'Interview Prep requires Elite.' },
        403,
      );
    }
    const tier = userContext.tier as Tier;

    // 6. Resolve variant BEFORE cap check (CONTEXT D-11)
    //   variant drives prompt, token budget, cap check, persistence, streak.
    const variant: 'pro' | 'elite' | 'elite_taste' =
      tier === 'elite'
        ? 'elite'
        : tier === 'pro' && elite_taste_request === true
          ? 'elite_taste'
          : 'pro';

    // 6b. Costing correlation — created only after auth, envelope validation, and the
    // access gate, and before caps, resume extraction, Merit, and any provider work.
    // The analyze action is the canonical `standard` variant of `interview_prep`;
    // answer evaluation records itself separately as `evaluation`.
    const costingCorrelation = await beginFeatureRun({
      userId,
      feature: 'interview_prep',
      requestId: reqId,
      serverActionKey: typeof (bodyJson as { attemptNonce?: unknown })?.attemptNonce === 'string'
        && (bodyJson as { attemptNonce: string }).attemptNonce
        ? (bodyJson as { attemptNonce: string }).attemptNonce
        : `interview-prep-analyze:${reqId}`,
      runVariant: 'standard',
      inputType: 'pdf',
      documentCount: 1,
      featureRunToken: typeof (bodyJson as { featureRunToken?: unknown })?.featureRunToken === 'string'
        ? (bodyJson as { featureRunToken: string }).featureRunToken
        : undefined,
    });
    if (!costingCorrelation.ok) {
      return jsonResponse({ error: costingCorrelation.reason }, 400);
    }
    featureRuntime = costingCorrelation.runtime;

    log.info('request-start', {
      userId,
      tier,
      variant,
      jdLen: job_description.length,
      hasRoleTitle: !!role_title,
      hasCompany: !!company,
      hasBackground: !!background_context,
      duration,
    });

    // 7. Per-feature rate limit
    const rl = await checkRateLimit(userId, tier, {
      key: 'interview-prep-analyze',
      limits: { free: 0, pro: 10, elite: 20 },
    });
    if (!rl.allowed) {
      await featureRuntime?.fail('RATE_LIMITED', 'rate_limit');
      return createRateLimitResponse(rl.retryAfterSeconds, 'user');
    }

    const supabase = getServiceClient();

    // 8. Pre-Merit cap checks — fail BEFORE Merit deduction (D-04)

    // 8a. Monthly Elite-taste quota for Pro users (1/month).
    if (variant === 'elite_taste') {
      const firstOfMonth = firstOfMonthUtcIso();
      const { count, error: monthlyErr } = await supabase
        .from('interview_quizzes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('tier', 'elite_taste')
        .gte('created_at', firstOfMonth);
      if (monthlyErr) {
        log.error('monthly-taste-query-error', { error: monthlyErr.message });
      }
      if ((count ?? 0) >= 1) {
        await featureRuntime?.fail('MONTHLY_TASTE_USED', 'authorization');
        return jsonResponse(
          {
            error: 'monthly_taste_used',
            message: 'Your monthly Elite quiz is used. Resets on the 1st of next month.',
          },
          429,
        );
      }
    }

    // 8b. Elite daily cap (3/day — D-04: filter by tier='elite', not mode='quiz').
    let todayQuizCount = 0;
    if (variant === 'elite') {
      const midnight = todayMidnightUtc();
      const { count, error: capErr } = await supabase
        .from('interview_quizzes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('tier', 'elite')
        .gte('created_at', midnight);
      if (capErr) {
        log.error('daily-cap-query-error', { error: capErr.message });
      } else {
        todayQuizCount = count ?? 0;
      }
      if (todayQuizCount >= 3) {
        await featureRuntime?.fail('DAILY_CAP_REACHED', 'authorization');
        return jsonResponse(
          {
            error: 'daily_cap_reached',
            message: "You've hit today's cap. Reset at midnight UTC.",
          },
          429,
        );
      }
    }

    // 9. Auto-fetch resume (D-01, D-02 — BEFORE Merit deduction, T-19-10).
    const { data: resumeRow, error: resumeErr } = await supabase
      .from('resumes')
      .select('id, file_path, analyzed_at, created_at, file_name, extracted_text, text_hash, extraction_metadata')
      .eq('user_id', userId)
      .not('analyzed_at', 'is', null)
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (resumeErr) {
      log.error('resume-fetch-error', { error: resumeErr.message });
      await featureRuntime?.fail('RESUME_FETCH_FAILED', 'internal');
      return jsonResponse(
        { error: 'resume_fetch_failed', message: 'Failed to fetch your resume. Please try again.' },
        500,
      );
    }

    if (!resumeRow) {
      await featureRuntime?.fail('NO_RESUME', 'validation');
      return jsonResponse(
        { error: 'no_resume', message: 'Upload and analyze a resume first to generate interview prep.' },
        400,
      );
    }

    let resumeText = '';
    if (
      typeof resumeRow.text_hash === 'string' &&
      isAcceptedStoredResumeText((resumeRow as { extracted_text?: unknown }).extracted_text)
    ) {
      resumeText = (resumeRow as { extracted_text: string }).extracted_text;
      log.info('resume-persisted-extraction-reused', { resumeId: resumeRow.id });
    } else {
      // `resumes.file_path` is nullable. Without this guard a NULL was handed
      // straight to .download(), which only "worked" by round-tripping to
      // storage and failing there. Same error contract, decided locally.
      if (!resumeRow.file_path) {
        log.error('resume-missing-file-path', { resumeId: resumeRow.id });
        await featureRuntime?.fail('RESUME_DOWNLOAD_FAILED', 'document');
        return jsonResponse(
          { error: 'resume_download_failed', message: 'Could not download your resume PDF. Please re-upload.' },
          500,
        );
      }

      const { data: pdfData, error: dlErr } = await supabase
        .storage
        .from('resumes')
        .download(resumeRow.file_path);

      if (dlErr || !pdfData) {
        log.error('pdf-download-error', { error: dlErr?.message, filePath: resumeRow.file_path });
        await featureRuntime?.fail('RESUME_DOWNLOAD_FAILED', 'document');
        return jsonResponse(
          { error: 'resume_download_failed', message: 'Could not download your resume PDF. Please re-upload.' },
          500,
        );
      }

      const extraction = await extractPDFTextWithMetadata(await pdfData.arrayBuffer(), 'resume');
      if (!extraction.ok) {
        log.error('pdf-extraction-error', { reason: extraction.reason, resumeId: resumeRow.id });
        await featureRuntime?.fail('RESUME_EXTRACTION_FAILED', 'document');
        return jsonResponse(
          { error: 'resume_extraction_failed', message: 'Could not extract readable text from your resume.' },
          500,
        );
      }

      resumeText = extraction.text;
      const persistResult = await persistAcceptedExtraction({
        supabase,
        target: 'resume',
        userId,
        resumeId: resumeRow.id,
        result: extraction,
      });
      if (!persistResult.ok) {
        log.warn('resume-persisted-extraction-write-failed', { error: persistResult.error });
      }
    }
    log.info('resume-extracted', {
      resumeLen: resumeText.length,
      resumeId: (resumeRow as { id?: string }).id,
      filePath: (resumeRow as { file_path?: string }).file_path,
      fileName: (resumeRow as { file_name?: string }).file_name,
      analyzedAt: (resumeRow as { analyzed_at?: string }).analyzed_at,
      createdAt: (resumeRow as { created_at?: string }).created_at,
    });

    // 10. Sanitize user-supplied content before prompt ingestion (T-23-PROMPT-01).
    // Hard per-tier INPUT cap (quick task 260608-p5k): trim each source to
    // getMaxInputChars('interviewPrepCoach', tier) (elite 48000 chars; free is
    // null/locked — feature gated OFF). chars ≈ tokens × 4.
    const interviewInputCharCap = getMaxInputChars('interviewPrepCoach', tier);
    if (interviewInputCharCap !== null && resumeText.length > interviewInputCharCap) {
      log.info('input-trimmed', { feature: 'interviewPrepCoach', field: 'resumeText', tier, from: resumeText.length, to: interviewInputCharCap });
      resumeText = resumeText.slice(0, interviewInputCharCap);
    }
    const sanitizedJD = (() => {
      const s = sanitizeUserContent(job_description, 'interview-prep-analyze', log);
      return interviewInputCharCap !== null && s.length > interviewInputCharCap ? s.slice(0, interviewInputCharCap) : s;
    })();
    const sanitizedBg = background_context
      ? (() => {
          const s = sanitizeUserContent(background_context, 'interview-prep-analyze', log);
          return interviewInputCharCap !== null && s.length > interviewInputCharCap ? s.slice(0, interviewInputCharCap) : s;
        })()
      : undefined;

    // 11. Merit system branch (D-06)
    if (!MERIT_SYSTEM_ENABLED) {
      // Defensive guard — Phase 23 is merit-path only.
      await featureRuntime?.fail('MERIT_SYSTEM_REQUIRED', 'configuration');
      return jsonResponse(
        {
          error: 'merit_system_required',
          message: 'This function requires the Merit system.',
        },
        503,
      );
    }

    const gated = await withMerits(
      { userId, tier: tier as 'free' | 'pro' | 'elite', corsType: 'user' as const },
      'interview_prep',
      async (_txId) => {
        activeMeritTransactionId = _txId;
        await featureRuntime?.observeCharge(_txId);
        // Build prompt params — include all 9 intake fields + variant so Plan 05's
        // prompt rewrite can branch on variant (elite_taste needs quiz shape from pro tier).
        // loadPromptVariant accepts params as `unknown` so extra fields are tolerated
        // against the current Phase 19 prompt builder signature.
        const promptParams = {
          resumeText,
          jobDescription: sanitizedJD,
          backgroundContext: sanitizedBg,
          roleTitle: role_title,
          roleTitleOptional: role_title,
          company,
          interviewType: interview_type,
          questionCategories: question_categories,
          difficulty,
          duration,
          format,
          variant,
          // Phase 19 compatibility: legacy prompt expects jobTitle/company at top level.
          jobTitle: role_title,
        };
        // Phase 14 loader — auto-prepends STRIVO_GLOBAL_AI_PRINCIPLES for Pro/Elite.
        const systemPrompt = loadPromptVariant('interview', tier, promptParams);

        // Hard per-tier OUTPUT cap (quick task 260608-p5k): bounded by
        // getMaxOutput('interviewPrepCoach', tier) (elite 12000; free is 0/locked —
        // feature stays gated OFF, no free invoke path). The flashcard (pro) variant
        // keeps its smaller 5000 budget; quiz variants use the full elite ceiling.
        const interviewOutputCap = getMaxOutput('interviewPrepCoach', tier);
        const maxTokens = variant === 'pro' ? Math.min(5000, interviewOutputCap) : interviewOutputCap; // D-06 + 260608-p5k
        const model = getModel(tier, 'interview'); // Haiku 4.5
        const timeoutMs = getTimeout(tier, 'quiz'); // 80_000 ms

        log.info('ai-call-start', {
          model,
          variant,
          maxTokens,
          timeoutMs,
          attempt: 1,
        });

        // First AI call attempt at temperature 0.4.
        const firstAi = await invokeAnthropicText({
          model,
          system: systemPrompt,
          messages: [{ role: 'user', content: 'Generate the interview prep content based on the instructions above.' }],
          maxTokens,
          temperature: 0.4,
          fixtureKey: 'interview_prep',
          timeoutMs,
          // Phase 02 · TOK-02 — instrumentation ONLY. Interview Prep cap tuning is
          // explicitly deferred out of this phase by operator decision; the values above
          // are untouched. `tier` is the server-resolved tier (userContext), and the
          // variant rides in the callName because it is what actually selects the cap
          // (`variant === 'pro' ? min(5000, cap) : cap`).
          telemetry: {
            feature: 'interview_prep',
            tier,
            callName: `interview-prep-generate:${variant}`,
            reqId,
            userId,
            attempt: 1,
            featureRunId: featureRuntime?.featureRunId,
          },
        });
        if (!firstAi.ok) {
          throw new MeritRefundable(firstAi.status, firstAi.error);
        }

        // Parse with repairTruncatedJSON chain (D-09).
        let parsed: unknown;
        try {
          parsed = parseAiResponse(firstAi.text);
        } catch (parseErr) {
          const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          const raw = (firstAi as { raw?: { stop_reason?: string; usage?: { output_tokens?: number } } }).raw;
          log.error('first-parse-failed', {
            err: errMsg,
            stopReason: raw?.stop_reason,
            outputTokens: raw?.usage?.output_tokens,
            maxTokens,
            textLen: firstAi.text.length,
            textHead: firstAi.text.slice(0, 800),
            textTail: firstAi.text.slice(-400),
          });
          throw new MeritRefundable(502, `JSON parse failed on first attempt: ${errMsg}`);
        }

        // Zod-backed §10 validation (D-11).
        let validation = validateInterviewPrepPayload(parsed, variant, intake);

        // D-11.5: If validation failed only on max-length overshoots of known
        // string-capped fields, soft-clamp and re-validate before triggering a
        // full retry. Haiku reliably overshoots coach_verdict / focus_areas /
        // coaching_advice caps on elite; retrying doubles latency + cost and
        // still often overshoots again. Clamping is reversible (logs the
        // affected fields) and preserves UI contracts.
        if (!validation.valid) {
          const clampedFields = clampOverflowingStrings(parsed);
          if (clampedFields.length > 0) {
            const revalidated = validateInterviewPrepPayload(parsed, variant, intake);
            if (revalidated.valid) {
              log.warn('interview-prep-clamped', {
                fields: clampedFields,
                originalError: validation.error,
              });
              validation = revalidated;
            }
          }
        }

        // Silent-drop scan: if schema is valid but optional fields are dropped,
        // still retry at lower temp per D-11.
        let droppedFields: string[] = [];
        if (validation.valid && validation.payload) {
          droppedFields = findDroppedOptionalFields(validation.payload, {
            role_title,
            company,
            background_context,
          });
        }

        const needsRetry = !validation.valid || droppedFields.length > 0;
        if (needsRetry) {
          log.warn('interview-prep-retry', {
            reason: !validation.valid ? 'schema' : 'silent-drops',
            error: validation.error,
            droppedFields,
          });
          const retryReasonHint = !validation.valid && validation.error
            ? ` Previous attempt failed validation: ${validation.error}. Fix these exact issues and respect every per-field character cap in the output contract.`
            : '';
          const retryAi = await invokeAnthropicText({
            model,
            system: systemPrompt,
            messages: [{
              role: 'user',
              content:
                'Generate the interview prep content. Return ONLY valid JSON with no extra text. ' +
                'Reference role_title / company / background_context explicitly in coach_verdict or focus_areas when they are provided.' +
                retryReasonHint,
            }],
            maxTokens,
            temperature: 0.2,
            fixtureKey: 'interview_prep',
            timeoutMs,
            // attempt:2 — the validation/silent-drop retry runs at temperature 0.2 and
            // must not be averaged into the first-attempt output peak.
            telemetry: {
              feature: 'interview_prep',
              tier,
              callName: `interview-prep-generate:${variant}`,
              reqId,
              userId,
              attempt: 2,
              featureRunId: featureRuntime?.featureRunId,
            },
          });
          if (!retryAi.ok) {
            throw new MeritRefundable(retryAi.status, retryAi.error);
          }
          try {
            parsed = parseAiResponse(retryAi.text);
          } catch (parseErr) {
            const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
            const raw = (retryAi as { raw?: { stop_reason?: string; usage?: { output_tokens?: number } } }).raw;
            log.error('retry-parse-failed', {
              err: errMsg,
              stopReason: raw?.stop_reason,
              outputTokens: raw?.usage?.output_tokens,
              maxTokens,
              textLen: retryAi.text.length,
              textHead: retryAi.text.slice(0, 800),
              textTail: retryAi.text.slice(-400),
            });
            throw new MeritRefundable(502, `JSON parse failed on retry: ${errMsg}`);
          }
          validation = validateInterviewPrepPayload(parsed, variant, intake);
          if (!validation.valid) {
            // D-11.5: same clamp-and-recover pass on retry before giving up.
            const clampedRetryFields = clampOverflowingStrings(parsed);
            if (clampedRetryFields.length > 0) {
              const revalidated = validateInterviewPrepPayload(parsed, variant, intake);
              if (revalidated.valid) {
                log.warn('interview-prep-clamped-retry', {
                  fields: clampedRetryFields,
                  originalError: validation.error,
                });
                validation = revalidated;
              }
            }
          }
          if (!validation.valid) {
            throw new MeritRefundable(502, `validation_failed: ${validation.error}`);
          }
          // D-11: second silent-drop miss → ship + warn (do NOT throw).
          if (validation.payload) {
            const secondDrops = findDroppedOptionalFields(validation.payload, {
              role_title,
              company,
              background_context,
            });
            if (secondDrops.length > 0) {
              log.warn('silent-drop-detected', { droppedFields: secondDrops });
            }
          }
        }

        const payload = validation.payload as InterviewPrepPayload;

        // 12. Persist interview_quizzes row (all 9 intake cols + readiness_score + tier).
        const quizInsert = await supabase
          .from('interview_quizzes')
          .insert({
            user_id: userId,
            mode: variant === 'pro' ? 'flashcard' : 'quiz',
            tier: variant,
            job_description: sanitizedJD.slice(0, 12000),
            interview_type,
            question_categories,
            difficulty,
            duration,
            format,
            background_context: background_context ?? null,
            role_title: role_title ?? null,
            company: company ?? null,
            readiness_score: payload.your_prep_readiness.score,
          })
          .select('id')
          .single();

        if (quizInsert.error || !quizInsert.data) {
          log.error('quiz-insert-failed', { error: quizInsert.error?.message });
          throw new MeritRefundable(500, 'quiz_persist_failed');
        }
        const quizId = quizInsert.data.id as string;

        // 13. Persist questions — quiz variants only per D-07.
        if (payload.practice_questions.mode === 'quiz') {
          const rows = payload.practice_questions.items.map((q, i) => ({
            quiz_id: quizId,
            question_order: i + 1, // SC-7: integer join for evaluator (parseInt)
            question_text: q.question,
            competency: q.competency,
          }));
          const { error: answersErr } = await supabase
            .from('interview_quiz_answers')
            .insert(rows);
          if (answersErr) {
            log.error('quiz-answers-insert-error', { error: answersErr.message });
            // Non-blocking: quiz row is durable; evaluate will surface missing questions.
          }
        }

        // 14. Streak upsert — variant='elite' only (Phase 19 D-12 carried forward).
        let streakRow: {
          current_streak: number;
          longest_streak: number;
          quizzes_today: number;
          last_quiz_at: string | null;
        } | null = null;

        if (variant === 'elite') {
          const { data: existing, error: fetchErr } = await supabase
            .from('interview_streaks')
            .select('current_streak, longest_streak, quizzes_today, last_quiz_at')
            .eq('user_id', userId)
            .maybeSingle();
          if (fetchErr) {
            log.error('streak-fetch-error', { error: fetchErr.message });
          }

          const nowIso = new Date().toISOString();
          const midnight = todayMidnightUtc();
          const last = existing?.last_quiz_at ?? null;
          const isFirstAfterMidnight = !last || new Date(last) < new Date(midnight);
          const hoursSinceLast = last
            ? (Date.now() - new Date(last).getTime()) / 3_600_000
            : Infinity;
          const coldExpired = hoursSinceLast >= 48;

          const prevStreak = (existing?.current_streak as number | undefined) ?? 0;
          const prevQuizzesToday = (existing?.quizzes_today as number | undefined) ?? 0;
          const prevLongest = (existing?.longest_streak as number | undefined) ?? 0;

          const newStreak = coldExpired ? 1 : (isFirstAfterMidnight ? prevStreak + 1 : prevStreak);
          const newQuizzesToday = isFirstAfterMidnight ? 1 : prevQuizzesToday + 1;
          const newLongest = Math.max(prevLongest, newStreak);

          const { error: upsertErr } = await supabase
            .from('interview_streaks')
            .upsert(
              {
                user_id: userId,
                current_streak: newStreak,
                longest_streak: newLongest,
                quizzes_today: newQuizzesToday,
                last_quiz_at: nowIso,
                updated_at: nowIso,
              },
              { onConflict: 'user_id' },
            );
          if (upsertErr) {
            log.error('streak-upsert-error', { error: upsertErr.message });
          }

          streakRow = {
            current_streak: newStreak,
            longest_streak: newLongest,
            quizzes_today: newQuizzesToday,
            last_quiz_at: nowIso,
          };
        }

        // 15. record_ai_usage — History visibility (22-04 Pitfall 2 fix preserved).
        const usageResult = await recordUsageWithAnalysis(userId, 'interview_prep', 1, quizId);
        if (!usageResult.ok) {
          log.error('usage-tracking-insert-failed', { error: usageResult.error });
          throw new MeritRefundable(500, 'Could not record interview prep usage.');
        }

        // 16. Build response.
        const dailyUsedAfterInsert = variant === 'elite' ? todayQuizCount + 1 : 0;
        const response: {
          quiz_id: string;
          variant: 'pro' | 'elite' | 'elite_taste';
          payload: InterviewPrepPayload;
          streak: {
            current_streak: number;
            longest_streak: number;
            quizzes_today: number;
            daily_cap: number;
            last_quiz_at: string | null;
          } | null;
          daily_usage: { used: number; cap: number } | null;
        } = {
          quiz_id: quizId,
          variant,
          payload,
          streak: streakRow
            ? {
                current_streak: streakRow.current_streak,
                longest_streak: streakRow.longest_streak,
                quizzes_today: streakRow.quizzes_today,
                daily_cap: 3,
                last_quiz_at: streakRow.last_quiz_at,
              }
            : null,
          daily_usage: variant === 'elite' ? { used: dailyUsedAfterInsert, cap: 3 } : null,
        };

        log.info('prep-generated', {
          quizId,
          variant,
          durationMs: Date.now() - startTime,
        });

        // Terminalize only after the quiz row and usage evidence are durable.
        await featureRuntime?.complete();
        return jsonResponse(response as unknown as Record<string, unknown>, 200);
      },
    );

    if (!gated.ok) {
      await featureRuntime?.fail('MERIT_GATE_REJECTED', 'authorization');
      return (gated as { ok: false; response: Response }).response;
    }
    return gated.value;
  } catch (err) {
    // Thrown Responses from requireAuth (401) propagate unchanged (RUN-04; frozen 401 {error:'Unauthorized'} contract, D-05)
    if (err instanceof Response) return err;

    // The Merit gateway owns refunds and re-throws with `meritsRefunded`; costing only
    // observes the canonical transaction and keeps the incurred provider evidence.
    if ((err as { meritsRefunded?: boolean })?.meritsRefunded === true && activeMeritTransactionId) {
      await featureRuntime?.observeRefund(activeMeritTransactionId);
    }
    await featureRuntime?.fail('INTERVIEW_PREP_REQUEST_FAILED', 'internal');

    // WR-02: pin `error` and `errorCode` to a single canonical code so they cannot silently diverge.
    const ERR = 'internal_error';
    log.error('unhandled-error', {
      errorCode: ERR,
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
    return jsonResponse(
      { error: ERR, errorCode: ERR, message: 'An unexpected error occurred. Please try again.' },
      500,
    );
  }
}

// Only attach serve() when running as an edge function (i.e., not during test import).
// The IS_TEST env var is set by the test harness to avoid starting a real HTTP server.
if ((Deno.env.get('IS_TEST') ?? '').toLowerCase() !== 'true') {
  serve((req) => withCors(req, 'user', () => handler(req)));
}

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, getSupabaseUrl, getServiceRoleKey } from '../_shared/supabase-client.ts';
import type { Json } from '../_shared/database.types.ts';
import { invokeAnthropicText } from '../_shared/anthropic.ts';
import { mergeValidated, applyTierShape, parseAndValidateCall } from '../_shared/result-merger.ts';
import { createLogger } from '../_shared/logger.ts';
import { buildSystemBlocks, buildUserPrompt, buildImprovementContext, buildFallbackPrompt, buildFreeConsolidatedPrompt, buildEliteUnlockDetailsPrompt, buildEliteUnlockExtrasPrompt, type PromptParams, type CallType } from '../_shared/resume-prompts.ts';
import { repairTruncatedJSON } from '../_shared/json-repair.ts';
import { requireInternalOrUserAuth, resolveTierForUserId } from '../_shared/auth.ts';
import { corsHeaders, handleOptionsRequest, withCors } from '../_shared/cors.ts';
import { checkRateLimit, createRateLimitResponse } from '../_shared/rate-limiter.ts';
import { withMerits, MeritRefundable, refundMeritsForJob, type MeritGatewayContext } from '../_shared/merit-gateway.ts';
import { TIER_MAX_TOKENS, getModel, getTimeout, getMaxOutput, getMaxInputChars, normalizeActiveTier, type Tier } from '../_shared/tier-config.ts';
import { computeCacheKey, sha256Hex } from '../_shared/cache-fingerprint.ts';
import { recordUsageWithAnalysis } from '../_shared/usage-checker.ts';
import { readWithArchiveFallback } from '../_shared/archive-reader.ts';
import { sanitizeUserContent } from '../_shared/prompt-sanitizer.ts';
import { runAnalysisLifecycle, classifyFailure } from '../_shared/analysis-lifecycle.ts';
import { deriveIdempotencyKey } from '../_shared/idempotency-key.ts';
import { isAnalysisFeatureEnabled } from '../_shared/analysis-flags.ts';
import { validateModelOutput } from '../_shared/llm-validation.ts';
import { resumeAnalysisSchema, resumeSemanticCheck, eliteUnlockPatchSchema, type ResumeAnalysisResult } from './resume-validation.ts';
import { baseResumeResultsMatch, detectMissingEliteSections, validateEliteUnlockPatch, mergeEliteUnlockPatch, type EliteUnlockPatch } from '../_shared/resume-elite-unlock.ts';
import { beginFeatureRun, type FeatureRunRuntime } from '../_shared/feature-run-runtime.ts';

const FUNCTION_VERSION = 'resume-overload-patch-2026-05-16'; // HIST-02 update

/**
 * HIST-02: Persist a resume analysis result to the analysis_results table.
 * Every successful resume run writes an analysis_results row in addition to updating resumes.
 * Returns the inserted analysis_results.id.
 */
async function persistResumeAnalysis(
  supabase: ReturnType<typeof getServiceClient>,
  params: {
    userId: string;
    resumeId: string;
    result: any;
    tier: string;
  }
): Promise<string | null> {
  const { userId, resumeId, result, tier } = params;
  const suggestions = result.suggestions || result.improvements || [];
  const keyInsights = suggestions.slice(0, 3).map((s: any) => s.title || s.text || '').filter(Boolean);

  const { data, error } = await supabase
    .from('analysis_results')
    .insert({
      user_id: userId,
      analysis_type: 'resume_analysis',
      source_reference: resumeId, // D-07: AnalysisHistory routes via this
      primary_score: result.overallScore,
      raw_response: {
        ...result,
        metadata: {
          ...result.metadata,
          tier,
          analysisDate: new Date().toISOString(),
        }
      },
      key_insights: keyInsights,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    // 05-01 (T-05-01 / D-10): analysis_results is the MIRROR write, NOT the
    // authoritative save. resumes.grading_data (completeAndRecordSuccess) is the
    // SOLE throws-pre-settle durable write, and it runs BEFORE this insert — so by
    // the time this line is reached the analysis is already durable + delivered.
    // Throwing MeritRefundable here would refund an already-saved analysis
    // (refund-after-save). Demoted to log-and-continue / return null, matching
    // grade-linkedin/persistLinkedInAnalysis:150-155.
    console.error('[persistResumeAnalysis] insert failed:', error?.message ?? 'missing id');
    return null;
  }

  return data.id;
}

/**
 * HIST-02 + HIST-06: Unify the post-success persistence chain.
 * Updates resumes table, inserts analysis_results, and records usage with analysis_id.
 */
async function completeAndRecordSuccess(
  supabase: ReturnType<typeof getServiceClient>,
  params: {
    userId: string;
    resumeId: string;
    result: any;
    tier: string;
    credits: number;
  }
): Promise<string | null> {
  console.log('[completeAndRecordSuccess] Starting persistence chain', {
    resumeId: params.resumeId,
    tier: params.tier,
  });

  // IN-02 (IDOR defense-in-depth): the service-role client bypasses RLS and resumeId is
  // request-controlled (rawBody.resumeId), so scope the update to the authenticated owner.
  // params.userId is userContext.userId (JWT) at the single, merit-gated call site — a
  // legitimate own-resume analysis still matches; a cross-user resumeId matches 0 rows.
  const { error: resumeError } = await supabase.from('resumes').update({
    overall_score: params.result.overallScore,
    grading_data: params.result,
    analyzed_at: new Date().toISOString(),
    // 260723-2b0 Task 4(a): stamp the NORMALIZED tier that produced this analysis (D-6:
    // free/elite only, pro collapsed). This is the sole authoritative durable save and
    // runs as service role (unaffected by Task 1's column grants). Both server tier paths
    // already normalize, so this is belt-and-braces that keeps the CHECK unreachable by a
    // correct write. Read tier-honestly by Upload's cache predicate (Task 6) and Results
    // showFullResults + the rerun CTA (Task 9).
    analyzed_tier: normalizeActiveTier(params.tier as Tier),
  }).eq('id', params.resumeId).eq('user_id', params.userId);

  if (resumeError) {
    console.error('[completeAndRecordSuccess] resume update failed:', resumeError.message);
    throw new MeritRefundable(500, 'Could not save resume analysis.');
  }

  const analysisId = await persistResumeAnalysis(supabase, {
    userId: params.userId,
    resumeId: params.resumeId,
    result: params.result,
    tier: params.tier,
  });

  // 05-01 (T-05-01): usage_tracking links to the analysis_results mirror id. That
  // mirror is now best-effort (persistResumeAnalysis returns null on failure). The
  // authoritative resumes.grading_data write already succeeded above, so we NEVER
  // refund/500 here (refund-after-save). Record usage when the mirror id exists;
  // when it is absent, skip the link (log-and-continue) — matching the grade-linkedin
  // pattern where a mirror-insert failure never fails a delivered analysis.
  if (analysisId) {
    const usageResult = await recordUsageWithAnalysis(
      params.userId,
      'resume_analysis',
      params.credits,
      analysisId,
    );
    if (!usageResult.ok) {
      // Fix (CR-01, SEC-13 parity with grade-linkedin 02-05 Fix 2): the analysis is already
      // durable in resumes + analysis_results. A usage-write failure must NOT refund the Merit
      // (double benefit) or 500 an already-delivered analysis. Log the reason (operator signal)
      // and fall through to the durable success return. DO NOT throw MeritRefundable here.
      console.error('[completeAndRecordSuccess] usage write failed:', usageResult.error);
    }
  } else {
    console.error('[completeAndRecordSuccess] analysis_results mirror missing — usage link skipped (analysis already durable in resumes)');
  }

  return analysisId;
}

function serializePreviousSuggestions(previousSuggestions: unknown): string {
  if (!Array.isArray(previousSuggestions)) return '';
  return JSON.stringify(previousSuggestions.map((suggestion: any) => ({
    title: suggestion?.title ?? '',
    originalText: suggestion?.originalText ?? '',
    improvedText: suggestion?.improvedText ?? '',
    potentialScoreIncrease: suggestion?.potentialScoreIncrease ?? null,
  })));
}

function responseForResumeResult(result: Record<string, any>, stream: boolean): Response {
  if (stream) {
    const body = `data: ${JSON.stringify({ type: 'complete', result })}\n\n`;
    return new Response(body, {
      headers: {
        ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }),
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  return new Response(
    JSON.stringify(result),
    { headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } },
  );
}

function analysisIdFromCachedResult(result: any): string | null {
  return result?.metadata?.analysis_id ?? result?.metadata?.analysisId ?? result?.analysis_id ?? null;
}

function triggerExtractWebhook(analysisResultsId: string | null, feature: 'resume_analysis' | 'linkedin_grading'): void {
  if (!analysisResultsId) return;

  try {
    fetch(`${getSupabaseUrl()}/functions/v1/extract-analysis-structure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-job-secret': Deno.env.get('INTERNAL_JOB_SECRET') ?? '',
      },
      body: JSON.stringify({
        analysis_results_id: analysisResultsId,
        feature,
      }),
    }).catch((err) => console.warn('[analyze-resume] extract webhook failed:', err));
  } catch (err) {
    console.warn('[analyze-resume] extract webhook threw:', err);
  }
}

async function readResumeAnalysisCache(
  supabase: ReturnType<typeof getServiceClient>,
  params: {
    cacheKey: string;
    stream: boolean;
  },
): Promise<{ cached: Response; analysis_id: string } | null> {
  // Fetch cache row metadata (cache_key, hit_count, id) — separate from payload read
  const { data: meta, error: metaError } = await supabase
    .from('analysis_cache')
    .select('id, hit_count')
    .eq('cache_key', params.cacheKey)
    .maybeSingle();

  if (metaError || !meta?.id) return null;

  // Phase 42 L5: use readWithArchiveFallback so archived (gzipped) raw_response is
  // transparently decompressed from ai-archives Storage when the inline column is NULL.
  const rawResponse = await readWithArchiveFallback(
    supabase,
    'analysis_cache',
    meta.id,
    'raw_response',
    'archive_path',
  );

  if (!rawResponse) return null;

  const analysisId = analysisIdFromCachedResult(rawResponse);
  if (!analysisId) return null;

  await supabase
    .from('analysis_cache')
    .update({
      last_hit_at: new Date().toISOString(),
      hit_count: Number(meta.hit_count ?? 1) + 1,
    })
    .eq('cache_key', params.cacheKey);

  return {
    cached: responseForResumeResult(rawResponse as Record<string, any>, params.stream),
    analysis_id: analysisId,
  };
}

async function writeResumeAnalysisCache(
  supabase: ReturnType<typeof getServiceClient>,
  params: {
    cacheKey: string;
    userId: string;
    tier: Tier;
    variant: string;
    result: Record<string, any>;
    analysisId: string | null;
  },
): Promise<void> {
  const rawResponse = {
    ...params.result,
    metadata: {
      ...params.result.metadata,
      analysis_id: params.analysisId,
    },
  };

  const { error } = await supabase
    .from('analysis_cache')
    .upsert({
      cache_key: params.cacheKey,
      feature: 'resume_analysis',
      tier: params.tier,
      variant: params.variant,
      user_id: params.userId,
      raw_response: rawResponse,
      last_hit_at: new Date().toISOString(),
      hit_count: 1,
    }, { onConflict: 'cache_key' });

  if (error) {
    console.warn('[analyze-resume] cache write failed:', error.message);
  }
}

function isAnthropicOverloaded(status?: number, errorText?: string) {
  return status === 529 || (errorText || '').toLowerCase().includes('overloaded');
}

function computeBackoffMs(attempt: number) {
  const base = Math.min(3000, 1000 * (2 ** (attempt - 1)));
  const jitter = Math.floor(Math.random() * 400);
  return base + jitter;
}

// ── Parallel execution types ────────────────────────────────────────────────
interface ParallelCallResult {
  callType: CallType;
  ok: true;
  text: string;
  durationMs: number;
  // Validated, parsed output carried from the retry loop (quick task 260625 H4
  // dedup). executeParallelCalls already runs parseAndValidateCall on each
  // HTTP-successful call to decide retry; we keep its parsed `data` here instead
  // of discarding it, so the merge consumer can call mergeValidated without
  // re-parsing the identical buffer. `null` when the call's output failed
  // validation (e.g. an optional rewrites/elite-extras call kept for salvage,
  // or a mandatory call that the merger will reject) — the merge consumer drops
  // null-data optionals (matching the prior salvage fold) and a null-data
  // mandatory call surfaces as a merge failure exactly as before.
  parsed: Record<string, unknown> | null;
}

interface ParallelCallFailure {
  callType: CallType;
  ok: false;
  error: string;
  status?: number;
  durationMs: number;
}

type ParallelResult = ParallelCallResult | ParallelCallFailure;

// Per-call budget (quick task 260608-p5k). 'summary' produces narrative + targeting/keywords,
// a dedicated 'rewrites' call owns rewriteSuggestions, and criteria-1/2 own the 11 scored
// criteria. Each call is right-sized so it completes naturally (out < maxTokens) and
// self-validates; the validation-aware single-call retry (executeParallelCalls) is the
// safety net.
//   elite-extras is RESTORED for Elite (260723-2b0 Task 4b / D-5). It is the SOLE producer
//   of eliteInsights (interviewLikelihood, competitiveRanking, recruiterFirstImpressions,
//   hiddenWeaknesses, powerPhrases, detailedATSGapAnalysis) — the marquee Elite differentiator
//   that applyTierShape (_shared/result-merger.ts:84-86) whitelists as the ONLY Elite-additive
//   field. The earlier "DISABLED — no consumer" note was WRONG: src/lib/dashboard-intelligence/
//   inputs.ts:98-116 consumes eliteInsights.recruiterFirstImpressions (returning empty today),
//   and a paid "Rerun with Elite" must not hand the user an empty eliteInsights. Restoring the
//   budget cannot steal from a call already measured to max out (summary MAXED at its old 4000;
//   criteria completed ~4450), so the Elite ceiling is raised 30000 -> 34000 in lockstep
//   (pricing-config.ts + its snapshot). Free and Pro stay at 0: Free's FREE_TIER_SUFFIX
//   (resume-prompts.ts:61-66) forbids every eliteInsights field, and the zero-budget filter
//   keeps the call out of the Free/Pro fan-out.
//   FINAL (Phase 02 plan 02-09 — 02-APPROVED-CAPS.md, LOCKED 2026-07-27, operator
//   approved 15/15 as proposed; sizing rule max(ceil(peak x 1.4), pre-TEMP value)):
//     Elite (5 calls): criteria-1 6000 + criteria-2 7000 + summary 12000 + rewrites 4000
//       + elite-extras 12000 = 41000 (== getMaxOutput('resumeAnalysis','elite') 41000).
//       Each call is <= ABSOLUTE_MAX_TOKENS 12000; summary and elite-extras sit AT the
//       clamp — their measured first-attempt peaks are LOWER BOUNDS (summary >=10000
//       truncated 1/4 @10000, elite-extras >=9000 truncated 1/4 @9000), the prompt
//       shape is unbounded (02-OUTPUT-SHAPE-AUDIT.md), and the safety nets are the
//       standing near-cap telemetry watch + the attempt-2 self-heal in this file.
//     Pro (4 calls): 6000 + 7000 + 12000 + 4000 = 29000 == the Pro column ceiling
//       (elite-extras stays 0 for Pro — do NOT give Pro an elite-extras budget).
//     Measured first-attempt peaks (Epoch 2): criteria-1 4312, criteria-2 4883,
//       rewrites 2705.
//   Free: single consolidated call (executeFreeAnalysis); these budgets are vestigial,
//     read only by the boot invariant - 1800+1800+1400 = 5000 <= the unchanged 9000
//     free ceiling. The real Free call uses FREE_SINGLE_CALL_MAX_TOKENS below.
const CALL_CONFIGS: Array<{ callType: CallType; maxTokensFree: number; maxTokensPro: number; maxTokensElite: number }> = [
  { callType: 'criteria-1',   maxTokensFree: 1800, maxTokensPro: 6000,  maxTokensElite: 6000 },  // Phase 02 LOCKED — peak 4312 x 1.4
  { callType: 'criteria-2',   maxTokensFree: 1800, maxTokensPro: 7000,  maxTokensElite: 7000 },  // Phase 02 LOCKED — peak 4883 x 1.4
  { callType: 'summary',      maxTokensFree: 1400, maxTokensPro: 12000, maxTokensElite: 12000 }, // Phase 02 LOCKED — peak >=10000 (lower bound); AT ABSOLUTE_MAX_TOKENS
  { callType: 'rewrites',     maxTokensFree: 0,    maxTokensPro: 4000,  maxTokensElite: 4000 },  // Phase 02 LOCKED — peak 2705 x 1.4
  { callType: 'elite-extras', maxTokensFree: 0,    maxTokensPro: 0,     maxTokensElite: 12000 }, // 260723-2b0 (D-5) restored; Phase 02 LOCKED — peak >=9000 (lower bound); AT ABSOLUTE_MAX_TOKENS
];

/**
 * Free tier uses a single consolidated call instead of parallel fan-out (D-01, Phase 15.1).
 * Hard cap (quick task 260608-p5k): bounded by the Free output ceiling
 * getMaxOutput('resumeAnalysis','free'). GATE-09 (Free < 50% Elite, strict `>=`) is
 * satisfied with room to spare: under the Phase 02 LOCKED ceilings the Elite aggregate is
 * 41000 (50% == 20500) while Free is 9000 (ratio ~22%), so the binding limit is the Free
 * ceiling itself. Free is a deliberate KEEP (02-APPROVED-CAPS A1: measured peak 4944).
 */
const RESUME_ELITE_OUTPUT_CAP = getMaxOutput('resumeAnalysis', 'elite'); // 41000 — Phase 02 LOCKED (02-APPROVED-CAPS.md)
const FREE_SINGLE_CALL_MAX_TOKENS = getMaxOutput('resumeAnalysis', 'free'); // 9000 — Phase 02 LOCKED keep (peak 4944)

/** Per-tier Merit cost for resume analysis. Not used for charging (only passed as `credits`
 *  into recordUsageWithAnalysis); the authoritative charge is withMerits reading
 *  merit_feature_costs. Pro corrected 2 -> 3 (260723-2b0 Task 4d) to match the DB after
 *  20260607000000_update_feature_merit_costs.sql — was under-reporting Pro in usage_tracking. */
const MERIT_COST: Record<string, number> = { free: 3, pro: 3, elite: 3 };

// -- Boot-time invariant (quick task 260608-p5k): per-tier parallel-call budgets
//    must not exceed the central getMaxOutput ceiling. Free/Elite are the only
//    active tiers; Pro is checked against the Elite ceiling (collapsed by accessor). --
for (const tier of ['free', 'pro', 'elite'] as const) {
  const key = `maxTokens${tier[0].toUpperCase() + tier.slice(1)}` as 'maxTokensFree' | 'maxTokensPro' | 'maxTokensElite';
  const sum = CALL_CONFIGS.reduce((acc, cfg) => acc + cfg[key], 0);
  const ceiling = getMaxOutput('resumeAnalysis', tier);
  if (sum > ceiling) {
    throw new Error(`[analyze-resume] CALL_CONFIGS sum ${sum} exceeds getMaxOutput('resumeAnalysis','${tier}') (${ceiling})`);
  }
}
// Free single-call cap must fit within the Free output ceiling.
if (FREE_SINGLE_CALL_MAX_TOKENS > getMaxOutput('resumeAnalysis', 'free')) {
  throw new Error(`[analyze-resume] FREE_SINGLE_CALL_MAX_TOKENS (${FREE_SINGLE_CALL_MAX_TOKENS}) exceeds getMaxOutput('resumeAnalysis','free') (${getMaxOutput('resumeAnalysis', 'free')})`);
}
// GATE-09: Free output budget must be < 50% of Elite output budget (architectural enforcement)
if (FREE_SINGLE_CALL_MAX_TOKENS >= RESUME_ELITE_OUTPUT_CAP * 0.5) {
  throw new Error(`[analyze-resume] GATE-09 violation: FREE_SINGLE_CALL_MAX_TOKENS (${FREE_SINGLE_CALL_MAX_TOKENS}) >= 50% of Elite output cap (${RESUME_ELITE_OUTPUT_CAP})`);
}

async function executeParallelCalls(
  params: {
    model: string;
    promptParams: PromptParams;
    userPrompt: string;
    isElite: boolean;
    tier: 'free' | 'pro' | 'elite';
    fixtureKey: 'analyze_resume';
    /** TOK-02 telemetry context. reqId groups every call of ONE analysis. */
    reqId?: string;
    userId?: string;
    timeoutMs?: number;
    allowProviderRetry?: boolean;
  }
): Promise<ParallelResult[]> {

  const makeCall = async (callType: CallType, maxTokens: number, attempt = 1): Promise<ParallelResult> => {
    const start = Date.now();
    const resp = await invokeAnthropicText({
      model: params.model,
      system: buildSystemBlocks(callType, params.promptParams),
      messages: [{ role: 'user', content: params.userPrompt }],
      maxTokens,
      temperature: 0.3,
      fixtureKey: params.fixtureKey,
      timeoutMs: params.timeoutMs ?? getTimeout(params.tier as Tier),
      // TOK-02: `params.tier` is the SERVER-resolved tier (never a body field) — see
      // _shared/auth.ts:155, which forces the admin account to elite server-side.
      telemetry: {
        feature: 'resume_analysis',
        tier: params.tier,
        callName: callType,
        reqId: params.reqId,
        userId: params.userId,
        attempt,
      },
    });
    const durationMs = Date.now() - start;

    if (!resp.ok) {
      return { callType, ok: false, error: resp.error, status: resp.status, durationMs };
    }
    // `parsed` is filled in by the retry loop below, which runs parseAndValidateCall
    // once per HTTP-successful call (quick task 260625 H4 dedup). Default null here.
    return { callType, ok: true, text: resp.text, durationMs, parsed: null };
  };

  // Filter out configs where per-tier budget is 0 (e.g., elite-extras for Free/Pro)
  const activeConfigs = CALL_CONFIGS.filter(cfg => {
    const maxTokens = params.tier === 'elite' ? cfg.maxTokensElite : params.tier === 'pro' ? cfg.maxTokensPro : cfg.maxTokensFree;
    return maxTokens > 0;
  });
  const promises = activeConfigs.map(cfg => {
    const maxTokens = params.tier === 'elite' ? cfg.maxTokensElite : params.tier === 'pro' ? cfg.maxTokensPro : cfg.maxTokensFree;
    return makeCall(cfg.callType, maxTokens);
  });

  const results = await Promise.allSettled(promises);
  const settled: ParallelResult[] = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    // Promise rejection (unexpected runtime error) -- wrap as failure
    return {
      callType: activeConfigs[i].callType,
      ok: false as const,
      error: r.reason?.message || 'Unexpected error',
      durationMs: 0,
    };
  });

  // Retry failed OR truncated calls once (PARA-03 + 260608-p5k).
  // A call that hits max_tokens returns ok:true at the HTTP layer but its JSON is
  // truncated — it only fails later in mergeAndValidateResults (criteria count short,
  // JSON parse error, missing summary field), which refunds the WHOLE run. Detect that
  // here by running the same parse/validate the merger uses, and retry the single
  // offending call with extra token headroom (a one-off recovery is allowed to exceed
  // the per-call budget; the helper still clamps at ABSOLUTE_MAX_TOKENS).
  const retryPromises = settled.map(async (result, i) => {
    const cfg = activeConfigs[i];
    const baseMaxTokens = params.tier === 'elite' ? cfg.maxTokensElite : params.tier === 'pro' ? cfg.maxTokensPro : cfg.maxTokensFree;

    const httpFailed = !result.ok;
    // Output-level validity: run the SAME parse/validate the merger uses (only for
    // HTTP-successful calls), and keep its reason so the log names the exact failure.
    // The parsed `data` is now carried forward (quick task 260625 H4 dedup) so the
    // merge consumer does NOT re-parse the identical buffer.
    const validation = result.ok ? parseAndValidateCall(result.callType, result.text, params.isElite) : null;
    const outputInvalid = !!validation && !validation.ok;

    if (!httpFailed && !outputInvalid) {
      // Non-retried, valid call: carry the validated parsed data forward.
      return { ...result, parsed: validation && validation.ok ? validation.data : null };
    }

    // The onboarding request/response path must preserve time for a pre-save Merit
    // refund. Its caller disables nested provider retries; the lifecycle will reject
    // this failed/invalid result and own the single terminal refund.
    if (params.allowProviderRetry === false) return result;

    // Don't retry rate limit or payment errors (non-retriable).
    if (httpFailed && 'status' in result && (result.status === 429 || result.status === 402)) {
      return result;
    }

    const backoffMs = computeBackoffMs(1);
    const reason = httpFailed
      ? `error: ${(result as ParallelCallFailure).error}`
      : `output-invalid: ${validation && !validation.ok ? validation.reason : 'unknown'}`;
    console.log(`[parallel] Retrying ${cfg.callType} after ${backoffMs}ms (${reason})`);
    await new Promise(resolve => setTimeout(resolve, backoffMs));

    // Give the retry extra headroom so a truncation-driven retry can actually
    // complete; the anthropic helper clamps to ABSOLUTE_MAX_TOKENS regardless.
    const retryMaxTokens = outputInvalid ? Math.min(baseMaxTokens * 2, 12000) : baseMaxTokens;
    // attempt=2 matters for TOK-02: this retry can run at a DOUBLED effective cap, so
    // averaging it in with first attempts would skew both peak and headroom.
    const retried = await makeCall(cfg.callType, retryMaxTokens, 2);

    // Keep the retry if it is at least as good as the original. If both are
    // invalid, prefer whichever parses so the merger can salvage more. When the
    // retry validates, carry its parsed data forward (same dedup).
    if (retried.ok) {
      const retryValidation = parseAndValidateCall(retried.callType, retried.text, params.isElite);
      if (retryValidation.ok) {
        return { ...retried, parsed: retryValidation.data };
      }
    }
    if (httpFailed) return retried; // original had no usable text anyway
    // Both original and retry are HTTP-ok-but-invalid: keep the original (its
    // parsed stays null so the merge consumer drops it as a failed optional /
    // surfaces it as a merge failure for a mandatory call) — behavior unchanged.
    return result.ok ? result : retried;
  });

  return Promise.all(retryPromises);
}

/**
 * Server-side score reconciliation (Runtime Brief requirement):
 * If the AI's reported overallScore differs from the weighted criterion sum by > 3 points, override it.
 * Criteria scores may be 0-10 (legacy) or 0-100. We detect by checking if max score > 10.
 */
/**
 * Ensures every criterion feedback array has the expected minimum number of items.
 * If the AI returned fewer than minItems, logs a warning. Does not pad with fake content —
 * the UI renders whatever exists; this just surfaces silent regressions in server logs.
 */
function validateFeedbackDepth(analysisResult: any, minItems: number): any {
  const criteria: any[] = analysisResult.criterionFeedback || analysisResult.criteria || [];
  let violations = 0;
  for (const c of criteria) {
    const feedback = c.feedback;
    let count = 0;
    if (Array.isArray(feedback)) {
      count = feedback.length;
    } else if (feedback && typeof feedback === 'object') {
      // Named-field format: { observation, impact, fix, deeper?, rewrite? }
      count = [feedback.observation, feedback.impact, feedback.fix, feedback.deeper, feedback.rewrite].filter(Boolean).length;
    } else if (typeof feedback === 'string') {
      count = 1;
    }
    if (count < minItems) {
      violations++;
      console.warn(`Feedback depth violation: criterion "${c.id}" has ${count} item(s), expected ${minItems}.`);
    }
  }
  if (violations > 0) {
    console.warn(`Total feedback depth violations: ${violations}/${criteria.length} criteria below ${minItems}-item minimum.`);
  }
  return analysisResult;
}

function reconcileScore(analysisResult: any): any {
  const criteria: any[] = analysisResult.criterionFeedback || analysisResult.criteria || [];
  if (criteria.length === 0) return analysisResult;

  const maxCriterionScore = Math.max(...criteria.map((c: any) => Number(c.score) || 0));
  const scaleFactor = maxCriterionScore <= 10 ? 10 : 1; // 0-10 scale needs * 10

  let weightedSum = 0;
  for (const c of criteria) {
    const score = Number(c.score) || 0;
    const weight = Number(c.weight) || 0;
    weightedSum += (score * scaleFactor * weight) / 100;
  }
  const weightedScore = Math.round(weightedSum);
  const aiScore = Number(analysisResult.overallScore) || 0;
  const diff = Math.abs(aiScore - weightedScore);

  if (diff > 3) {
    console.log(`Score reconciliation: AI reported ${aiScore}, weighted calc = ${weightedScore}, diff = ${diff}. Overriding to ${weightedScore}.`);
    return { ...analysisResult, overallScore: weightedScore };
  }
  return analysisResult;
}

/**
 * Quality floor check for single-call Free output (D-06, Phase 15.1).
 * Detects degenerate output: all criterion scores zero (model didn't score)
 * or all identical (model is lazy, e.g., all 50s). Returns true if output
 * passes quality floor, false if retry needed.
 *
 * Runs on raw parsed JSON BEFORE reconcileScore/applyTierShape.
 */
function passesQualityFloor(result: Record<string, unknown>): boolean {
  const criteria = (result.criterionFeedback || result.criteria || []) as Array<{ score?: number }>;
  if (criteria.length === 0) return false;

  const scores = criteria.map(c => Number(c.score) || 0);

  // All zero = model didn't score anything
  if (scores.every(s => s === 0)) return false;

  // All identical = model is lazy (e.g., all 50s)
  if (scores.every(s => s === scores[0])) return false;

  return true;
}

/**
 * Executes the Free-tier single-call analysis path (D-01, D-05, Phase 15.1).
 * Single Anthropic call -> parse -> quality floor check -> reconcileScore -> applyTierShape.
 * Bypasses executeParallelCalls and mergeAndValidateResults entirely.
 *
 * @throws MeritRefundable on Anthropic failure or parse failure (merit path auto-refunds)
 * @throws Error on non-merit-path failures (legacy path catches and returns error response)
 */
async function executeFreeAnalysis(params: {
  model: string;
  promptParams: PromptParams;
  userPrompt: string;
  log: ReturnType<typeof createLogger>;
  /** TOK-02 telemetry context. reqId groups every call of ONE analysis. */
  reqId?: string;
  userId?: string;
  /** Optional request-scoped provider wall and retry policy for onboarding. */
  timeoutMs?: number;
  allowProviderRetry?: boolean;
}): Promise<Record<string, any>> {
  const { model, promptParams, userPrompt, log, reqId, userId, timeoutMs, allowProviderRetry } = params;
  const systemPrompt = buildFreeConsolidatedPrompt(promptParams);

  // TOK-02: this path is reached only when the SERVER-resolved tier is 'free'.
  const telemetryBase = { feature: 'resume_analysis', tier: 'free', callName: 'free-single', reqId, userId };

  const resp = await invokeAnthropicText({
    model,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: FREE_SINGLE_CALL_MAX_TOKENS,
    temperature: 0.3,
    fixtureKey: 'analyze_resume',
    timeoutMs: timeoutMs ?? getTimeout('free' as Tier),
    telemetry: { ...telemetryBase, attempt: 1 },
  });

  if (!resp.ok) {
    throw Object.assign(new Error(resp.error), { status: resp.status });
  }

  const repaired = repairTruncatedJSON(resp.text.trim());
  let result: Record<string, any>;
  try {
    result = JSON.parse(repaired);
  } catch (parseErr) {
    throw Object.assign(new Error(`JSON parse failed: ${(parseErr as Error).message}`), { status: 500 });
  }

  // D-06: Quality floor check -- retry once if all scores zero or identical
  if (!passesQualityFloor(result) && allowProviderRetry !== false) {
    log.warn('free-quality-floor-fail', { scores: ((result.criterionFeedback || result.criteria || []) as Array<{ score?: number }>).map(c => c.score) });

    const retryResp = await invokeAnthropicText({
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: FREE_SINGLE_CALL_MAX_TOKENS,
      temperature: 0.4, // slightly higher temp on retry for diversity
      fixtureKey: 'analyze_resume',
      timeoutMs: timeoutMs ?? getTimeout('free' as Tier),
      telemetry: { ...telemetryBase, attempt: 2 },
    });

    if (!retryResp.ok) {
      throw Object.assign(new Error(retryResp.error), { status: retryResp.status });
    }

    const retriedRepaired = repairTruncatedJSON(retryResp.text.trim());
    try {
      result = JSON.parse(retriedRepaired);
    } catch (parseErr) {
      throw Object.assign(new Error(`JSON parse failed on retry: ${(parseErr as Error).message}`), { status: 500 });
    }

    if (!passesQualityFloor(result)) {
      log.error('free-quality-floor-fail-after-retry', { scores: ((result.criterionFeedback || result.criteria || []) as Array<{ score?: number }>).map(c => c.score) });
      throw Object.assign(new Error('Quality floor check failed after retry — all scores zero or identical'), { status: 500 });
    }
  }

  // D-05: Direct pipeline (no mergeAndValidateResults)
  result = reconcileScore(result);
  applyTierShape(result, 'free');
  result._mergeSource = 'free-single';

  return result;
}

/**
 * Tier-aware, side-effect-free resume-analysis assembly.
 *
 * Free  -> single consolidated call (executeFreeAnalysis).
 * Elite -> 3-call parallel + merge, with single-fallback recovery — the SAME assembly
 *          the non-streaming withMerits path runs, but WITHOUT any streaming/merit/persist
 *          side effects. Throws PLAIN status-bearing Errors (Object.assign(..,{status})) so
 *          the request/response runAnalysisLifecycle executor owns the refund boundary
 *          (classifyFailure reads `.status`), exactly like executeFreeAnalysis.
 *
 * queue-path-tier-downgrade (2026-07-18): the onboarding lifecycle closure used to hardcode
 * executeFreeAnalysis regardless of tier, so Elite users onboarding were CHARGED Elite Merits
 * (ctx.tier = resolvedTier) but ANALYZED as Free. This helper routes onboarding through the
 * real per-tier path so Elite subscribers get an Elite-depth analysis.
 */
async function assembleResumeResult(params: {
  resolvedTier: Tier;
  isElite: boolean;
  promptParams: PromptParams;
  userPrompt: string;
  model: string;
  fallbackModel: string;
  log: ReturnType<typeof createLogger>;
  /** TOK-02 telemetry context. reqId groups every call of ONE analysis. */
  reqId?: string;
  userId?: string;
  timeoutMs?: number;
  allowProviderRetry?: boolean;
}): Promise<Record<string, any>> {
  const {
    resolvedTier,
    isElite,
    promptParams,
    userPrompt,
    model,
    fallbackModel,
    log,
    reqId,
    userId,
    timeoutMs,
    allowProviderRetry,
  } = params;

  if (resolvedTier === 'free') {
    return await executeFreeAnalysis({
      model,
      promptParams,
      userPrompt,
      log,
      reqId,
      userId,
      timeoutMs,
      allowProviderRetry,
    });
  }

  const parallelResults = await executeParallelCalls({
    model,
    promptParams,
    userPrompt,
    isElite,
    tier: promptParams.tier,
    fixtureKey: 'analyze_resume',
    reqId,
    userId,
    timeoutMs,
    allowProviderRetry,
  });

  for (const r of parallelResults) {
    console.log(`[parallel-onboarding] ${r.callType}: ${r.ok ? 'OK' : 'FAIL'} in ${r.durationMs}ms${!r.ok && 'error' in r ? ` (${(r as ParallelCallFailure).error})` : ''}`);
  }

  const failedCalls = parallelResults.filter((r): r is ParallelCallFailure => !r.ok);

  if (failedCalls.length > 0 && failedCalls.length < parallelResults.length) {
    const allOverloaded = failedCalls.every(f => isAnthropicOverloaded(f.status, f.error));
    throw Object.assign(
      new Error(`${failedCalls.length} of ${parallelResults.length} analysis steps failed.`),
      { status: allOverloaded ? 503 : 500 },
    );
  }

  if (failedCalls.length === parallelResults.length) {
    if (allowProviderRetry === false) {
      const allTimedOut = failedCalls.every((failure) => failure.status === 408);
      const allOverloaded = failedCalls.every((failure) => isAnthropicOverloaded(failure.status, failure.error));
      throw Object.assign(
        new Error(`${failedCalls.length} of ${parallelResults.length} analysis steps failed.`),
        { status: allTimedOut ? 408 : allOverloaded ? 503 : 500 },
      );
    }
    const fallbackPrompt = buildFallbackPrompt(promptParams);
    const fallbackResp = await invokeAnthropicText({
      model: fallbackModel,
      system: fallbackPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: TIER_MAX_TOKENS[resolvedTier],
      temperature: 0.3,
      fixtureKey: 'analyze_resume',
      timeoutMs: timeoutMs ?? 100000,
      // `legacy-` prefix: RESEARCH expects ZERO rows from the all-calls-failed fallback,
      // so a stray row is instantly identifiable in the 02-07 report.
      telemetry: {
        feature: 'resume_analysis',
        tier: resolvedTier,
        callName: 'legacy-fallback-assemble',
        reqId,
        userId,
        attempt: 1,
      },
    });
    if (!fallbackResp.ok) throw Object.assign(new Error(fallbackResp.error), { status: fallbackResp.status });

    const repaired = repairTruncatedJSON(fallbackResp.text.trim());
    let fallbackResult: Record<string, any>;
    try {
      fallbackResult = JSON.parse(repaired);
    } catch (parseErr) {
      throw Object.assign(new Error(`JSON parse failed: ${(parseErr as Error).message}`), { status: 500 });
    }

    fallbackResult = reconcileScore(fallbackResult);
    validateFeedbackDepth(fallbackResult, resolvedTier === 'elite' ? 5 : 3);
    if (!fallbackResult.industryGuess) fallbackResult.industryGuess = '';
    if (!Array.isArray(fallbackResult.suggestedTargetRoles)) fallbackResult.suggestedTargetRoles = [];
    if (!Array.isArray(fallbackResult.recommendedKeywords)) fallbackResult.recommendedKeywords = [];
    if (!isElite) { fallbackResult.eliteInsights = null; }
    else if (!fallbackResult.eliteInsights || typeof fallbackResult.eliteInsights !== 'object') { fallbackResult.eliteInsights = null; }
    fallbackResult._mergeSource = 'fallback-single';
    applyTierShape(fallbackResult, resolvedTier);
    return fallbackResult;
  }

  const parsedResults = Object.fromEntries(
    parallelResults.filter((r): r is ParallelCallResult => r.ok && r.parsed !== null)
      .map(r => [r.callType, r.parsed as Record<string, unknown>])
  ) as Record<string, Record<string, unknown>>;

  const mergeResult = mergeValidated(parsedResults, resolvedTier);
  if (!mergeResult.ok) throw Object.assign(new Error(`Merge failed: ${mergeResult.reason}`), { status: 500 });

  let analysisResult = mergeResult.data;
  analysisResult = reconcileScore(analysisResult);
  validateFeedbackDepth(analysisResult, resolvedTier === 'elite' ? 5 : 3);
  return analysisResult;
}

// ── Phase 05 · 05-02 · Streaming-aware lifecycle wrapper (FEAT-02, D-01/D-02) ─────
//
// The LOCKED runAnalysisLifecycle executor is request/response-shaped and CANNOT
// wrap an SSE stream (D-02). This thin wrapper orchestrates the SAME primitives
// DIRECTLY in the exact order the executor enforces — deriveIdempotencyKey (done by
// the caller) → create_or_recover_analysis_run → transition_analysis_run around the
// UNTOUCHED TransformStream token path → validate the final assembled OBJECT →
// triple-write save → settle-on-saved — while the SSE token path + synthetic chunks
// + partial-render stay BYTE-IDENTICAL to the legacy IIFE. It runs ONLY when
// ANALYSIS_LIFECYCLE_RESUME (+ master) is ON; the legacy withMerits streaming path
// below is the dormant, byte-identical flags-OFF path (100% of traffic on deploy).

/** transition_analysis_run CAS wrapper (mirrors analysis-lifecycle.ts transitionRun). */
async function transitionResumeRun(
  supabase: ReturnType<typeof getServiceClient>,
  log: ReturnType<typeof createLogger>,
  runId: string,
  from: string,
  to: string,
  patch: Json = {},
): Promise<boolean> {
  const { data, error } = await supabase.rpc('transition_analysis_run', {
    p_run_id: runId,
    p_from_state: from,
    p_to_state: to,
    p_patch: patch,
  });
  if (error) {
    log.error('transition failed', { runId, from, to, error: error.message });
    return false;
  }
  return (data as { transitioned?: boolean })?.transitioned === true;
}

/** One-shot SSE Response carrying a single event (create-failure / recovered-run). */
function sseOneShotResponse(event: Record<string, unknown>): Response {
  const body = `data: ${JSON.stringify(event)}\n\n`;
  return new Response(body, {
    headers: {
      ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }),
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * Build the resume prompt context for the streaming lifecycle wrapper. Replicates
 * the withMerits streaming path's prompt-building VERBATIM (word/bullet/number
 * counts, incorporated-suggestions detection, sanitize + improvement context) so
 * the model call — and therefore the streamed tokens — is byte-identical (D-09).
 */
function buildResumePromptContext(params: {
  resumeText: string;
  resolvedTier: Tier;
  isElite: boolean;
  targetRole: string;
  targetIndustry: string;
  previousSuggestions: any[];
  previousScore: number | null;
  log: ReturnType<typeof createLogger>;
}): { promptParams: PromptParams; userPrompt: string; model: string; fallbackModel: string } {
  const { resumeText, resolvedTier, isElite, targetRole, targetIndustry, previousSuggestions, previousScore, log } = params;

  const model = getModel(resolvedTier, 'resume');
  const fallbackModel = Deno.env.get('ANTHROPIC_MODEL_FALLBACK') || model;

  const wordCount = resumeText.split(/\s+/).length;
  const bulletCount = (resumeText.match(/[•\-\*]/g) || []).length;
  const numberCount = (resumeText.match(/\d+%?|\$[\d,]+/g) || []).length;
  const hasEducation = /education|university|college|degree|bachelor|master|phd/i.test(resumeText);
  const hasSkillsSection = /skills|technologies|tools|proficiencies/i.test(resumeText);
  const experienceYears = resumeText.match(/(\d+)\+?\s*years?/gi) || [];

  const incorporatedSuggestions: string[] = [];
  if (previousSuggestions.length > 0) {
    for (const suggestion of previousSuggestions) {
      if (suggestion.improvedText && resumeText.toLowerCase().includes(suggestion.improvedText.toLowerCase().slice(0, 50))) {
        incorporatedSuggestions.push(suggestion.title || suggestion.improvedText.slice(0, 50));
      }
    }
  }

  const normalizedText = sanitizeUserContent(resumeText.replace(/\s+/g, ' ').trim(), 'analyze-resume', log);
  const improvementContext = buildImprovementContext(incorporatedSuggestions, previousScore);
  const userPrompt = buildUserPrompt(normalizedText, improvementContext);

  const currentDate = new Date().toISOString().slice(0, 10);
  const promptParams: PromptParams = {
    isElite,
    tier: resolvedTier,
    currentDate,
    wordCount,
    bulletCount,
    numberCount,
    hasEducation,
    hasSkillsSection,
    experienceYears,
    targetRole: targetRole || '',
    targetIndustry: targetIndustry || '',
  };
  return { promptParams, userPrompt, model, fallbackModel };
}

interface StreamingLifecycleParams {
  supabase: ReturnType<typeof getServiceClient>;
  log: ReturnType<typeof createLogger>;
  userId: string;
  resolvedTier: Tier;
  isElite: boolean;
  resumeText: string;
  targetRole: string;
  targetIndustry: string;
  previousSuggestions: any[];
  previousScore: number | null;
  resumeId: string;
  resumeCacheKey: string;
  cacheVariant: string;
  idempotencyKey: string;
  meritCtx: MeritGatewayContext;
  /** TOK-02: the request's 8-char id, so every AI call of ONE analysis groups together. */
  reqId: string;
}

/**
 * Orchestrate the resume streaming SSE path through the lifecycle primitives (D-01):
 * create_or_recover (idempotent run row) → reserve-with-key (closes the :728 gap) →
 * transitions around the UNTOUCHED TransformStream → validate final OBJECT → save →
 * settle-on-saved. Refund fires ONLY from IIFE branches lexically BEFORE saving→
 * completed (the point of no return). A mid-stream overload/validation/save failure
 * lands the run in retryable_failed/failed with a refund + typed SSE error, subsuming
 * the never-wired 529→queue fallback.
 */
async function runResumeStreamingLifecycle(p: StreamingLifecycleParams): Promise<Response> {
  const {
    supabase, log, userId, resolvedTier, isElite, resumeText, targetRole, targetIndustry,
    previousSuggestions, previousScore, resumeId, resumeCacheKey, cacheVariant, idempotencyKey, meritCtx,
    reqId,
  } = p;

  // ── created: create-or-recover the run row (run-level dedup on the SAME key). ──
  const { data: created, error: createErr } = await supabase.rpc('create_or_recover_analysis_run', {
    p_user_id: userId,
    p_feature: 'resume_analysis',
    p_tier: resolvedTier,
    p_idempotency_key: idempotencyKey,
    p_job_type: 'resume_analysis',
    p_resume_id: resumeId ?? null,
    p_payload: {},
  });
  if (createErr || !created) {
    log.error('create_or_recover_analysis_run failed', { userId, error: createErr?.message });
    return sseOneShotResponse({ type: 'error', message: 'Could not start analysis. Please try again.' });
  }
  const runId = (created as { run_id: string; recovered?: boolean }).run_id;
  const recovered = (created as { recovered?: boolean }).recovered === true;

  // Open Q3 / D-11: a recovered ACTIVE run means an identical attempt is already in
  // flight (the frontend submit-lock is the primary guard). Do NOT open a second model
  // call; return the recovered run_id so the client can re-attach via useAnalysisRun.
  if (recovered) {
    log.info('streaming-recovered-active-run', { runId });
    return sseOneShotResponse({
      type: 'error',
      message: 'An analysis for this resume is already running.',
      run_id: runId,
      recovered: true,
    });
  }

  // ── created → validating_inputs → reserving_merits (pre-first-byte, fast RPCs). ──
  await transitionResumeRun(supabase, log, runId, 'created', 'validating_inputs');
  await transitionResumeRun(supabase, log, runId, 'validating_inputs', 'reserving_merits');

  // ── reserve via withMerits WITH the key (closes the :728 gap). precheck_cache is
  //    preserved: a cache hit short-circuits to the cached SSE complete (no deduct,
  //    no model call). A non-cache miss deducts exactly once (idempotent on the key). ──
  const gated = await withMerits<string | Response>(
    meritCtx,
    'resume_analysis',
    async (txId: string) => txId,
    {
      precheck_cache: () => readResumeAnalysisCache(supabase, { cacheKey: resumeCacheKey, stream: true }),
    },
  );
  if (!gated.ok) {
    await transitionResumeRun(supabase, log, runId, 'reserving_merits', 'failed', {
      failure_code: 'MERIT_RESERVATION_FAILED',
      failure_stage: 'reserving_merits',
    });
    return gated.response;
  }
  if (gated.transactionId === 'cache-hit') {
    // Cache hit: the result is already durable + cached (credits=0 usage recorded by
    // the gateway). Complete the run for recovery; no merit was reserved so no settle.
    await transitionResumeRun(supabase, log, runId, 'reserving_merits', 'completed');
    return gated.value as Response;
  }
  const transactionId = gated.transactionId;

  // ── reserving_merits → extracting_data → generating. ──
  // D9-08 (parity with the canonical twin, _shared/analysis-lifecycle.ts): persist the reserved
  // Merit transaction id in the SAME transition that leaves reserving_merits. `withMerits`
  // returns the id only in-process; if this worker then dies in any later state, the reaper
  // releases the stranded reservation by `merit_transaction_id`. Without this the column stays
  // NULL, the reaper's `hasMerit` gate is false, and the Merit is never returned. Refund control
  // flow is unchanged — the in-process `transactionId` still drives every pre-saving refund below.
  await transitionResumeRun(supabase, log, runId, 'reserving_merits', 'extracting_data', {
    merit_transaction_id: transactionId,
  });
  await transitionResumeRun(supabase, log, runId, 'extracting_data', 'generating');

  const { promptParams, userPrompt, model, fallbackModel } = buildResumePromptContext({
    resumeText, resolvedTier, isElite, targetRole, targetIndustry, previousSuggestions, previousScore, log,
  });

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const sendEvent = (obj: object) => writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

  (async () => {
    try {
      // ── Token path: BYTE-IDENTICAL synthetic chunks + analysis (D-09). ──
      await sendEvent({ type: 'chunk', text: '{"overallScore":' });

      let finalResult: Record<string, any>;

      if (resolvedTier === 'free') {
        const freeResult = await executeFreeAnalysis({ model, promptParams, userPrompt, log, reqId, userId });
        const summaryText = (freeResult.executiveSummary || '') as string | object;
        const summaryChunk = JSON.stringify({
          summary: typeof summaryText === 'object' ? summaryText : summaryText,
        });
        await sendEvent({ type: 'chunk', text: summaryChunk });
        await sendEvent({ type: 'chunk', text: '"criteria":' });
        finalResult = freeResult;
      } else {
        const parallelResults = await executeParallelCalls({
          model,
          promptParams,
          userPrompt,
          isElite,
          tier: promptParams.tier,
          fixtureKey: 'analyze_resume',
          reqId,
          userId,
        });

        for (const r of parallelResults) {
          console.log(`[parallel-stream-lifecycle] ${r.callType}: ${r.ok ? 'OK' : 'FAIL'} in ${r.durationMs}ms${!r.ok && 'error' in r ? ` (${(r as ParallelCallFailure).error})` : ''}`);
        }

        const failedCalls = parallelResults.filter((r): r is ParallelCallFailure => !r.ok);

        if (failedCalls.length > 0 && failedCalls.length < parallelResults.length) {
          const totalCalls = parallelResults.length;
          throw new MeritRefundable(500, `${failedCalls.length} of ${totalCalls} analysis steps failed. Please try again.`);
        }

        if (failedCalls.length === parallelResults.length) {
          const fallbackPrompt = buildFallbackPrompt(promptParams);
          const fallbackMaxTokens = TIER_MAX_TOKENS[resolvedTier];
          const fallbackResp = await invokeAnthropicText({
            model: fallbackModel,
            system: fallbackPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            maxTokens: fallbackMaxTokens,
            temperature: 0.3,
            fixtureKey: 'analyze_resume',
            timeoutMs: 100000,
            // `legacy-` prefix: RESEARCH expects ZERO rows from this all-calls-failed fallback.
            telemetry: {
              feature: 'resume_analysis',
              tier: resolvedTier,
              callName: 'legacy-fallback-stream-lifecycle',
              reqId,
              userId,
              attempt: 1,
            },
          });
          if (!fallbackResp.ok) throw new MeritRefundable(fallbackResp.status, fallbackResp.error);

          const repaired = repairTruncatedJSON(fallbackResp.text.trim());
          let fallbackResult: Record<string, any>;
          try {
            fallbackResult = JSON.parse(repaired);
          } catch (parseErr) {
            throw new MeritRefundable(500, `JSON parse failed: ${(parseErr as Error).message}`);
          }

          const summaryText = (fallbackResult.executiveSummary || fallbackResult.summary || '') as string;
          if (typeof summaryText === 'string' && summaryText) {
            const summaryChunk = JSON.stringify({ summary: typeof fallbackResult.executiveSummary === 'object' ? fallbackResult.executiveSummary : summaryText });
            await sendEvent({ type: 'chunk', text: summaryChunk });
          }
          await sendEvent({ type: 'chunk', text: '"criteria":' });

          fallbackResult = reconcileScore(fallbackResult);
          validateFeedbackDepth(fallbackResult, resolvedTier === 'elite' ? 5 : 3);
          if (!fallbackResult.industryGuess) fallbackResult.industryGuess = '';
          if (!Array.isArray(fallbackResult.suggestedTargetRoles)) fallbackResult.suggestedTargetRoles = [];
          if (!Array.isArray(fallbackResult.recommendedKeywords)) fallbackResult.recommendedKeywords = [];
          if (!isElite) { fallbackResult.eliteInsights = null; }
          else if (!fallbackResult.eliteInsights || typeof fallbackResult.eliteInsights !== 'object') { fallbackResult.eliteInsights = null; }
          fallbackResult._mergeSource = 'fallback-single';
          applyTierShape(fallbackResult, resolvedTier);
          finalResult = fallbackResult;
        } else {
          const parsedResults = Object.fromEntries(
            parallelResults.filter((r): r is ParallelCallResult => r.ok && r.parsed !== null)
              .map(r => [r.callType, r.parsed as Record<string, unknown>])
          ) as Record<string, Record<string, unknown>>;

          const mergeResult = mergeValidated(parsedResults, resolvedTier);
          if (!mergeResult.ok) throw new MeritRefundable(500, `Merge failed: ${mergeResult.reason}`);

          let analysisResult = mergeResult.data;
          const summaryText = (analysisResult.executiveSummary || analysisResult.summary || '') as string;
          if (summaryText) {
            const summaryChunk = JSON.stringify({ summary: summaryText });
            await sendEvent({ type: 'chunk', text: summaryChunk });
          }
          await sendEvent({ type: 'chunk', text: '"criteria":' });

          analysisResult = reconcileScore(analysisResult);
          validateFeedbackDepth(analysisResult, resolvedTier === 'elite' ? 5 : 3);
          finalResult = analysisResult;
        }
      }

      // ── validating_output: strict no-masking validation of the FINAL ASSEMBLED
      //    OBJECT (D-10 — never raw model text / SSE partials). A currently-valid
      //    success validates byte-identically (permissive .passthrough() schema +
      //    passesQualityFloor-faithful semanticCheck); only a genuinely malformed /
      //    empty / truncated result reaches a typed terminal + refund. Serialize the
      //    already-assembled object so needsStructuralRepair can never false-fail it. ──
      const validated = validateModelOutput(JSON.stringify(finalResult), resumeAnalysisSchema, { semanticCheck: resumeSemanticCheck });
      if (!validated.ok) {
        // Invalid output is PERMANENT (never fabricate a body) — refund + failed.
        const refund = await refundMeritsForJob(userId, transactionId, `validating_output:${validated.code}`);
        await transitionResumeRun(supabase, log, runId, 'generating', 'failed', {
          failure_code: validated.code,
          failure_stage: 'validating_output',
          // Never record a refund that did not happen. Leaving this false keeps the
          // persisted transaction eligible for the idempotent stale-run backstop.
          refunded: refund.ok,
        });
        await sendEvent({ type: 'error', message: 'Analysis output failed validation. Please try again.' });
        try { await writer.close(); } catch { /* already closed */ }
        return;
      }

      // ── generating → validating_output → saving. ──
      await transitionResumeRun(supabase, log, runId, 'generating', 'validating_output');
      await transitionResumeRun(supabase, log, runId, 'validating_output', 'saving');

      // ── saving: the 05-01 reconciled triple-write. resumes.grading_data is the SOLE
      //    authoritative throws-pre-settle write (owner-scoped, IN-02); the mirror +
      //    cache + usage + webhook are best-effort log-and-continue. A save throw is
      //    still pre-settle → refund + retryable_failed (never past completed). ──
      try {
        const analysisId = await completeAndRecordSuccess(supabase, {
          userId,
          resumeId,
          result: finalResult,
          tier: resolvedTier,
          credits: MERIT_COST[resolvedTier],
        });
        await writeResumeAnalysisCache(supabase, {
          cacheKey: resumeCacheKey,
          userId,
          tier: resolvedTier,
          variant: cacheVariant,
          result: finalResult,
          analysisId,
        });
        triggerExtractWebhook(analysisId, 'resume_analysis');
      } catch (saveErr) {
        const refund = await refundMeritsForJob(userId, transactionId, 'saving:DATABASE_SAVE_FAILED');
        await transitionResumeRun(supabase, log, runId, 'saving', 'retryable_failed', {
          failure_code: 'DATABASE_SAVE_FAILED',
          failure_stage: 'saving',
          // Never record a refund that did not happen (see above).
          refunded: refund.ok,
        });
        await sendEvent({ type: 'error', message: saveErr instanceof Error ? saveErr.message : 'Could not save resume analysis. Please try again.' });
        try { await writer.close(); } catch { /* already closed */ }
        return;
      }

      // ── saving → completed: POINT OF NO RETURN. Settle (merit_settled=true) ONLY in
      //    this CAS, gated on the verified durable save. No refund / no throw past here. ──
      await transitionResumeRun(supabase, log, runId, 'saving', 'completed', { merit_settled: true });
      await sendEvent({ type: 'complete', result: finalResult, run_id: runId });
    } catch (err) {
      // Pre-saving failure (model / overload / merge / parse). A mid-stream overload
      // now lands the run in retryable_failed (subsuming the never-wired 529→queue
      // fallback, D-01/D-08). refundMeritsForJob is the ONLY refund surface and fires
      // ONLY here — lexically BEFORE saving→completed, never after (Pitfall 2/D).
      const c = classifyFailure(err);
      const refund = await refundMeritsForJob(userId, transactionId, `generating:${c.code}`);
      await transitionResumeRun(supabase, log, runId, 'generating', c.retryable ? 'retryable_failed' : 'failed', {
        failure_code: c.code,
        failure_stage: 'generating',
        // Never record a refund that did not happen (see above).
        refunded: refund.ok,
      });
      await sendEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      try { await writer.close(); } catch { /* already closed */ }
    }
  })();

  return new Response(readable, {
    headers: {
      ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }),
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

const UNLOCK_FORBIDDEN_CLIENT_FIELDS = [
  'tier',
  'userId',
  'resumeText',
  'gradingData',
  'fileName',
  'filename',
] as const;

function unlockJsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }),
      'Content-Type': 'application/json',
    },
  });
}

async function handleEliteUnlock(params: {
  rawBody: Record<string, any>;
  supabase: ReturnType<typeof getServiceClient>;
  ownerId: string;
  resolvedTier: Tier;
  isInternal: boolean;
  reqId: string;
  log: ReturnType<typeof createLogger>;
  featureRuntime?: FeatureRunRuntime | null;
}): Promise<Response> {
  const { rawBody, supabase, ownerId, resolvedTier, isInternal, reqId, log, featureRuntime } = params;
  const resumeId = typeof rawBody.resumeId === 'string' ? rawBody.resumeId : '';
  const baseAnalysisId = typeof rawBody.baseAnalysisId === 'string' && rawBody.baseAnalysisId
    ? rawBody.baseAnalysisId
    : null;
  const stream = rawBody.stream === true;

  if (!resumeId) {
    return unlockJsonResponse(400, { error: 'resume_id_required' });
  }
  if (!isInternal) {
    const spoofedField = UNLOCK_FORBIDDEN_CLIENT_FIELDS.find((field) => rawBody[field] !== undefined);
    if (spoofedField) {
      return unlockJsonResponse(400, { error: 'invalid_unlock_request' });
    }
  }
  if (resolvedTier !== 'elite') {
    return unlockJsonResponse(403, { error: 'elite_access_required' });
  }

  const { data: resume, error: resumeError } = await supabase
    .from('resumes')
    .select('id, user_id, analyzed_tier, grading_data, extracted_text, file_hash, text_hash, document_hash')
    .eq('id', resumeId)
    .eq('user_id', ownerId)
    .maybeSingle();
  if (resumeError || !resume) {
    return unlockJsonResponse(404, { error: 'resume_not_available' });
  }

  if (resume.analyzed_tier === 'elite') {
    let replayQuery = supabase
      .from('analysis_results')
      .select('id, raw_response, key_insights')
      .eq('user_id', ownerId)
      .eq('source_reference', resumeId)
      .eq('analysis_type', 'resume_analysis')
      .contains('key_insights', { generation_mode: 'incremental_unlock' });
    if (baseAnalysisId) {
      replayQuery = replayQuery.contains('key_insights', { base_analysis_id: baseAnalysisId });
    }
    const { data: replay } = await replayQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (replay?.raw_response) {
      log.info('elite-unlock-completed-replay', {
        resumeId,
        analysisId: replay.id,
        zero_provider_calls: true,
        zero_merit_usage: true,
      });
      return responseForResumeResult({
        ...(replay.raw_response as Record<string, any>),
        run_id: (replay.key_insights as Record<string, unknown> | null)?.run_id ?? null,
        recordId: resumeId,
        replayed: true,
      }, stream);
    }
    return unlockJsonResponse(409, {
      error: 'fresh_analysis_required',
      message: 'This resume has changed, so it needs a new full analysis.',
    });
  }

  if (resume.analyzed_tier !== 'free') {
    return unlockJsonResponse(409, { error: 'unlock_source_tier_conflict' });
  }
  if (
    typeof resume.extracted_text !== 'string' || resume.extracted_text.trim().length < 50
  ) {
    return unlockJsonResponse(409, {
      error: 'stored_text_unavailable',
      message: 'This resume\u2019s text isn\u2019t stored. Upload it again to create a new Elite analysis.',
    });
  }
  if (!resume.file_hash || !resume.text_hash || !resume.document_hash) {
    return unlockJsonResponse(409, {
      error: 'fresh_analysis_required',
      message: 'This resume has changed, so it needs a new full analysis.',
    });
  }

  const storedValidation = resumeAnalysisSchema.safeParse(resume.grading_data);
  if (!storedValidation.success || !resumeSemanticCheck(storedValidation.data).ok) {
    return unlockJsonResponse(409, { error: 'stored_analysis_invalid' });
  }
  const storedResult = storedValidation.data as Record<string, unknown>;

  let baseQuery = supabase
    .from('analysis_results')
    .select('id, raw_response')
    .eq('user_id', ownerId)
    .eq('source_reference', resumeId)
    .eq('analysis_type', 'resume_analysis');
  if (baseAnalysisId) baseQuery = baseQuery.eq('id', baseAnalysisId);
  const { data: baseCandidates, error: baseError } = await baseQuery
    .order('created_at', { ascending: false })
    .limit(baseAnalysisId ? 1 : 10);
  const base = (baseCandidates ?? []).find((candidate) => {
    if (!candidate.raw_response) return false;
    const mirror = candidate.raw_response as Record<string, unknown>;
    const metadata = mirror.metadata && typeof mirror.metadata === 'object' && !Array.isArray(mirror.metadata)
      ? mirror.metadata as Record<string, unknown>
      : null;
    return metadata?.tier === 'free' && baseResumeResultsMatch(storedResult, mirror);
  });
  if (baseError || !base) {
    return unlockJsonResponse(404, { error: 'resume_not_available' });
  }

  const missingSections = detectMissingEliteSections(storedResult);
  if (missingSections.length === 0) {
    log.info('elite-unlock-completed-replay', {
      resumeId,
      analysisId: base.id,
      zero_provider_calls: true,
      zero_merit_usage: true,
    });
    return responseForResumeResult({
      ...storedResult,
      recordId: resumeId,
      replayed: true,
    }, stream);
  }

  const baseFingerprint = `${base.id}:${resume.text_hash}`;
  const idempotencyKey = await sha256Hex(JSON.stringify({
    ownerId,
    resumeId,
    baseAnalysisId: base.id,
    baseFingerprint,
    generation_mode: 'elite_unlock',
  }));

  const { data: created, error: createError } = await supabase.rpc('create_or_recover_analysis_run', {
    p_user_id: ownerId,
    p_feature: 'resume_analysis',
    p_tier: 'elite',
    p_idempotency_key: idempotencyKey,
    p_job_type: 'resume_analysis',
    p_resume_id: resumeId,
    p_payload: { mode: 'elite_unlock', baseAnalysisId: base.id },
  });
  if (createError || !created) {
    return unlockJsonResponse(500, { error: 'unlock_start_failed', retryable: true });
  }
  const runId = (created as { run_id: string; recovered?: boolean }).run_id;
  const recovered = (created as { recovered?: boolean }).recovered === true;
  if (recovered) {
    const { data: recoveredRun } = await supabase
      .from('analysis_jobs')
      .select('state, result')
      .eq('id', runId)
      .eq('user_id', ownerId)
      .maybeSingle();
    if (recoveredRun?.state === 'completed' && recoveredRun.result) {
      return responseForResumeResult({
        ...(recoveredRun.result as Record<string, any>),
        run_id: runId,
        recordId: resumeId,
        replayed: true,
      }, stream);
    }
    return unlockJsonResponse(409, {
      error: 'unlock_already_running',
      retryable: true,
      recovered: true,
      run_id: runId,
    });
  }

  await transitionResumeRun(supabase, log, runId, 'created', 'validating_inputs');
  await transitionResumeRun(supabase, log, runId, 'validating_inputs', 'reserving_merits');

  let transactionId = '';
  if (isInternal) {
    transactionId = typeof rawBody.meritTransactionId === 'string' ? rawBody.meritTransactionId : '';
    if (!transactionId) {
      await transitionResumeRun(supabase, log, runId, 'reserving_merits', 'failed', {
        failure_code: 'MERIT_RESERVATION_FAILED',
        failure_stage: 'reserving_merits',
      });
      return unlockJsonResponse(409, { error: 'unlock_queue_identity_conflict', retryable: false });
    }
  } else {
    const reservation = await withMerits(
      { userId: ownerId, tier: 'elite', corsType: 'user', idempotencyKey },
      'resume_analysis',
      async (txId) => txId,
    );
    if (!reservation.ok) {
      await transitionResumeRun(supabase, log, runId, 'reserving_merits', 'failed', {
        failure_code: 'MERIT_RESERVATION_FAILED',
        failure_stage: 'reserving_merits',
      });
      return reservation.response;
    }
    transactionId = reservation.transactionId;
  }

  await transitionResumeRun(supabase, log, runId, 'reserving_merits', 'extracting_data', {
    merit_transaction_id: transactionId,
  });
  await featureRuntime?.observeCharge(transactionId);
  await transitionResumeRun(supabase, log, runId, 'extracting_data', 'generating');

  try {
    const sanitizedResumeText = sanitizeUserContent(
      resume.extracted_text.replace(/\s+/g, ' ').trim(),
      'analyze-resume',
      log,
    );
    const promptParams = { sanitizedResumeText, missingSections, storedResult };
    const prompts = [
      buildEliteUnlockDetailsPrompt(promptParams),
      buildEliteUnlockExtrasPrompt(promptParams),
    ].filter((value): value is NonNullable<typeof value> => value !== null);

    const generated = await Promise.all(prompts.map(async (prompt) => {
      const response = await invokeAnthropicText({
        model: getModel('elite', 'resume'),
        system: prompt.systemPrompt,
        messages: [{ role: 'user', content: prompt.userPrompt }],
        outputSchema: prompt.outputSchema,
        maxTokens: 6000,
        temperature: 0.2,
        fixtureKey: 'analyze_resume',
        timeoutMs: getTimeout('elite'),
        telemetry: {
          feature: 'resume_analysis',
          tier: 'elite',
          callName: prompt.callName,
          reqId,
          userId: ownerId,
          attempt: 1,
        },
      });
      if (!response.ok) {
        throw Object.assign(new Error('Incremental generation failed.'), { status: response.status });
      }
      const validated = validateModelOutput(response.text, eliteUnlockPatchSchema);
      if (!validated.ok) {
        throw Object.assign(new Error('Incremental output validation failed.'), { status: 500 });
      }
      return validated.value as EliteUnlockPatch;
    }));

    const combinedPatch = Object.assign({}, ...generated) as EliteUnlockPatch;
    const patchValidation = validateEliteUnlockPatch(storedResult, missingSections, combinedPatch);
    if (!patchValidation.ok) {
      throw Object.assign(new Error('Incremental patch validation failed.'), { status: 500 });
    }
    const merged = mergeEliteUnlockPatch(storedResult, missingSections, patchValidation.patch);
    if (!merged.ok) {
      throw Object.assign(new Error('Incremental merge failed.'), { status: 500 });
    }
    const fullValidation = resumeAnalysisSchema.safeParse(merged.data);
    if (!fullValidation.success || !resumeSemanticCheck(fullValidation.data).ok) {
      throw Object.assign(new Error('Merged analysis validation failed.'), { status: 500 });
    }

    await transitionResumeRun(supabase, log, runId, 'generating', 'validating_output');
    await transitionResumeRun(supabase, log, runId, 'validating_output', 'saving');

    const { data: persisted, error: persistError } = await supabase.rpc('persist_resume_elite_unlock', {
      p_owner_id: ownerId,
      p_resume_id: resumeId,
      p_base_analysis_id: base.id,
      p_expected_file_hash: resume.file_hash,
      p_expected_text_hash: resume.text_hash,
      p_expected_document_hash: resume.document_hash,
      p_expected_base_grading_data: storedResult as Json,
      p_expected_base_fingerprint: baseFingerprint,
      p_idempotency_key: idempotencyKey,
      p_merged_grading_data: fullValidation.data as Json,
      p_generated_sections: missingSections,
      p_usage_credits: MERIT_COST.elite,
      p_run_id: runId,
    });
    if (persistError || !(persisted as { ok?: boolean } | null)?.ok) {
      throw Object.assign(new Error('Incremental persistence conflict.'), { status: 409 });
    }

    const durable = persisted as Record<string, any>;
    log.info('elite-unlock-complete', {
      resumeId,
      analysisId: durable.analysis_id,
      usage_id: durable.usage_id,
      runId,
      missing_sections: missingSections,
      call_count: prompts.length,
      replayed: durable.replayed === true,
    });
    await featureRuntime?.complete();
    return responseForResumeResult({
      ...(durable.grading_data as Record<string, any>),
      run_id: durable.run_id ?? runId,
      recordId: resumeId,
      replayed: durable.replayed === true,
    }, stream);
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === 'number'
      ? (error as { status: number }).status
      : 500;
    const retryable = status !== 409 && (status === 408 || status === 429 || status >= 500);
    const terminalState = retryable ? 'retryable_failed' : 'failed';
    const failurePatch: Json = {
      failure_code: status === 409 ? 'PERSISTENCE_CONFLICT' : 'ELITE_UNLOCK_FAILED',
      failure_stage: status === 409 ? 'saving' : 'generating',
    };
    if (!isInternal) {
      const refund = await refundMeritsForJob(ownerId, transactionId, `elite_unlock:${status}`);
      failurePatch.refunded = refund.ok;
      if (refund.ok) await featureRuntime?.observeRefund(transactionId);
    }
    // The failure can occur in provider generation, output validation, or the
    // saving RPC. CAS each possible pre-terminal state; exactly one can move.
    for (const fromState of ['saving', 'validating_output', 'generating']) {
      if (await transitionResumeRun(supabase, log, runId, fromState, terminalState, failurePatch)) break;
    }
    await featureRuntime?.fail(
      status === 409 ? 'PERSISTENCE_CONFLICT' : 'ELITE_UNLOCK_FAILED',
      status === 409 ? 'persistence' : 'provider',
    );
    return unlockJsonResponse(status, {
      error: status === 409 ? 'fresh_analysis_required' : 'elite_unlock_failed',
      message: status === 409
        ? 'This resume has changed, so it needs a new full analysis.'
        : 'We couldn\u2019t unlock the Elite insights. Your Free analysis is unchanged.',
      retryable,
      run_id: runId,
    });
  }
}

serve((req) => withCors(req, 'user', async () => {
  if (req.method === 'OPTIONS') {
    return handleOptionsRequest({ type: 'user', extraHeaders: 'x-internal-job-secret' });
  }

  const reqId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('analyze-resume', reqId);
  const totalTimer = log.timer('total-request');
  let featureRuntime: FeatureRunRuntime | null = null;

  try {
    const rawBody = await req.json();
    
    // Input validation with size limits
    const MAX_TEXT_SIZE = 100000; // 100KB for resume text
    const MAX_FIELD_LENGTH = 200;
    
    // Coarse 100KB guard first; a deterministic per-tier trim is applied below
    // once the tier is resolved server-side (quick task 260608-p5k).
    let resumeText = typeof rawBody.resumeText === 'string' ? rawBody.resumeText.slice(0, MAX_TEXT_SIZE) : '';
    const resumeId = rawBody.resumeId;
    const targetRole = typeof rawBody.targetRole === 'string' ? rawBody.targetRole.slice(0, MAX_FIELD_LENGTH) : '';
    const targetIndustry = typeof rawBody.targetIndustry === 'string' ? rawBody.targetIndustry.slice(0, MAX_FIELD_LENGTH) : '';
    const userId = rawBody.userId;

    // Previous analysis data for improvement tracking
    const previousSuggestions = rawBody.previousSuggestions || [];
    const previousScore = rawBody.previousScore || null;
    
    // Reuse module-level service role client (pooled across warm-worker requests)
    const supabase = getServiceClient();
    const userContext = await requireInternalOrUserAuth(req);

    // D-01/D-09: Tier resolved server-side. Never trust rawBody.tier.
    //
    // queue-path-tier-downgrade (2026-07-18): 100% of resume-analysis queue/worker traffic
    // (onboarding, plus the streaming->queue 529 fallback) arrives here from
    // process-resume-analysis-job under `x-internal-job-secret`. requireInternalOrUserAuth
    // returns null for that path, so the old derivation (`userContext?.tier ?? 'free'`)
    // resolved EVERY paid user to 'free' — free-depth analysis while their real tier was
    // charged in Merits. Mirror analyze-career's fix: on the internal path, look the tier up
    // in the DB from the trusted payload userId (resolveTierForUserId — service client, admin
    // elevation, normalizeActiveTier collapses pro->elite, fails CLOSED to 'free'). We pass an
    // ID and get a tier back; we never accept a tier.
    //
    // A null userContext here means internal auth SUCCEEDED — requireInternalOrUserAuth THROWS
    // a 401 Response on a bad secret, so reaching this line with null proves a valid internal caller.
    let resolvedTier: Tier;
    if (userContext) {
      resolvedTier = (userContext.tier as Tier) ?? 'free';
      log.info('tier-resolved', { userId: userContext.userId, tier: resolvedTier, source: 'jwt' });
    } else if (typeof userId === 'string' && userId) {
      resolvedTier = await resolveTierForUserId(userId);
      log.info('tier-resolved', { userId, tier: resolvedTier, source: 'internal-db' });
    } else {
      // No JWT and no userId to look up — fail closed on cost.
      resolvedTier = 'free';
      log.warn('tier-unresolvable', { reason: 'no-user-context-and-no-payload-user-id' });
    }
    const isElite = resolvedTier === 'elite';

    const costingOwnerId = userContext?.userId ?? (typeof userId === 'string' ? userId : '');
    if (costingOwnerId) {
      const correlation = await beginFeatureRun({
        userId: costingOwnerId,
        feature: 'resume_analysis',
        requestId: reqId,
        serverActionKey: typeof rawBody.attemptNonce === 'string' && rawBody.attemptNonce
          ? rawBody.attemptNonce
          : `${rawBody.mode ?? 'standard'}:${resumeId ?? 'unknown'}:${reqId}`,
        runVariant: rawBody.mode === 'elite_unlock'
          ? 'elite_unlock'
          : previousScore !== null ? 'rerun' : 'standard',
        inputType: typeof rawBody.featureRunToken === 'string' ? 'mixed' : 'text',
        documentCount: typeof rawBody.featureRunToken === 'string' ? 1 : 0,
        featureRunToken: userContext && typeof rawBody.featureRunToken === 'string'
          ? rawBody.featureRunToken
          : undefined,
        trustedFeatureRunId: !userContext && typeof rawBody.featureRunId === 'string'
          ? rawBody.featureRunId
          : undefined,
        trustedInternal: !userContext,
      });
      if (!correlation.ok) {
        return unlockJsonResponse(400, { error: correlation.reason });
      }
      featureRuntime = correlation.runtime;
    }

    // Phase 04: authenticate and resolve current access first, then route the
    // additive same-row unlock before any client-text validation, cache lookup,
    // or normal full-analysis prompt construction.
    if (rawBody.mode === 'elite_unlock') {
      const ownerId = userContext?.userId ?? (typeof userId === 'string' ? userId : '');
      if (!ownerId) return unlockJsonResponse(401, { error: 'unauthorized' });
      return await handleEliteUnlock({
        rawBody,
        supabase,
        ownerId,
        resolvedTier,
        isInternal: !userContext,
        reqId,
        log,
        featureRuntime,
      });
    }

    if (!resumeText || resumeText.length < 50) {
      await featureRuntime?.fail('INVALID_RESUME_TEXT', 'validation');
      return new Response(
        JSON.stringify({ error: 'Resume text is required and must be at least 50 characters' }),
        { status: 400, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } }
      );
    }

    // Hard INPUT cap (quick task 260608-p5k): deterministically trim resume text to
    // the per-tier ceiling (chars ≈ tokens × 4) BEFORE building the prompt or hashing
    // for cache, so input cost is bounded and the cache key reflects analyzed text.
    {
      const resumeInputCharCap = getMaxInputChars('resumeAnalysis', resolvedTier);
      if (resumeInputCharCap !== null && resumeText.length > resumeInputCharCap) {
        log.info('input-trimmed', { feature: 'resumeAnalysis', tier: resolvedTier, from: resumeText.length, to: resumeInputCharCap });
        resumeText = resumeText.slice(0, resumeInputCharCap);
      }
    }
    if (!userContext?.tier || (userContext.tier !== 'free' && userContext.tier !== 'pro' && userContext.tier !== 'elite')) {
      log.warn('subscription-missing-or-invalid', { userId: userContext?.userId, rawTier: userContext?.tier });
    }

    log.info('request-start', { resumeId, userId, tier: resolvedTier, resumeTextLen: resumeText.length, hasPrevious: previousSuggestions.length > 0 });

    // Rate limit: 5/15/30 per hour by tier (D-01). Skip for internal worker path (userContext null).
    if (userContext) {
      const rl = await checkRateLimit(userContext.userId, userContext.tier, {
        key: 'analyze-resume',
        limits: { free: 5, pro: 15, elite: 30 },
      });
      if (!rl.allowed) {
        await featureRuntime?.fail('RATE_LIMITED', 'rate_limit');
        return createRateLimitResponse(rl.retryAfterSeconds, 'user');
      }
    }
    // Phase 30 (30-05, D-15): merit gateway is the unconditional path for the
    // DIRECT user (JWT) call below.
    //
    // 260726 (queue-worker-401): the INTERNAL worker path has NO JWT userContext.
    // Reaching here with a null userContext PROVES a trusted internal caller —
    // requireInternalOrUserAuth THROWS a 401 on a bad/absent x-internal-job-secret,
    // so an unauthenticated external request can never get here. This is
    // process-resume-analysis-job invoking us for a QUEUED job. The Merit was
    // already deducted at submit-resume-analysis-job (which stored
    // merit_transaction_id on the job), and the worker REFUNDS it on permanent
    // failure via that id — so here we run the analysis + persist with NO
    // deduction and NO refund, returning 200 JSON (never SSE; the worker parses the
    // body). Mirrors analyze-career's internal legacy path. Tier is still resolved
    // server-side from the trusted payload userId (resolveTierForUserId above) —
    // never read off the request body.
    if (!userContext) {
      if (!(typeof userId === 'string' && userId)) {
        // No JWT AND no payload userId — not a valid queued job; keep the hard reject.
        return new Response(
          JSON.stringify({ error: 'unauthorized' }),
          { status: 401, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } }
        );
      }
      try {
        const { promptParams, userPrompt, model, fallbackModel } = buildResumePromptContext({
          resumeText,
          resolvedTier,
          isElite,
          targetRole,
          targetIndustry,
          previousSuggestions,
          previousScore,
          log,
        });
        const workerResult = await assembleResumeResult({
          resolvedTier,
          isElite,
          promptParams,
          userPrompt,
          model,
          fallbackModel,
          log,
          reqId,
          userId,
          timeoutMs: getTimeout(resolvedTier),
          allowProviderRetry: true,
        });
        // Authoritative persist (resumes.grading_data) + best-effort mirror/usage.
        const analysisId = await completeAndRecordSuccess(supabase, {
          userId,
          resumeId,
          result: workerResult,
          tier: resolvedTier,
          credits: MERIT_COST[resolvedTier],
        });
        triggerExtractWebhook(analysisId, 'resume_analysis');
        await featureRuntime?.complete();
        log.info('worker-analysis-complete', { userId, resumeId, tier: resolvedTier });
        return new Response(
          JSON.stringify(workerResult),
          { status: 200, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        // The QUEUE owns the Merit: the worker refunds via merit_transaction_id when
        // we return a terminal (non-retryable / exhausted) failure. Surface a status
        // + retryable flag so the worker retries transient errors and refunds
        // otherwise. We deliberately do NOT deduct or refund here.
        const status = typeof (err as { status?: number })?.status === 'number' ? (err as { status: number }).status : 500;
        const retryable = status === 408 || status === 409 || status === 425 || status === 429 || status === 529 || (status >= 500 && status <= 599);
        await featureRuntime?.flushAiCalls();
        log.error('worker-analysis-failed', { userId, resumeId, status, message: (err as Error)?.message });
        return new Response(
          JSON.stringify({ error: 'Could not complete resume analysis.', retryable }),
          { status, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } }
        );
      }
    }
    {
      const normalizedResumeTextForCache = resumeText.replace(/\s+/g, ' ').trim();
      const resumeTextHash = await sha256Hex(normalizedResumeTextForCache);
      const cacheVariant = `resume-analysis:${FUNCTION_VERSION}:standard`;
      const resumeCacheKey = await computeCacheKey({
        user_id: userContext.userId,
        feature: 'resume_analysis',
        tier: resolvedTier,
        variant: cacheVariant,
        inputs: {
          text_hash: resumeTextHash,
          targetRole,
          targetIndustry,
          previousScore: previousScore ?? '',
          previousSuggestions: serializePreviousSuggestions(previousSuggestions),
        },
      });

      // ── Phase 05 · 05-01 · Onboarding full-executor adoption (FEAT-01) ──────────
      // The onboarding run is a distinct FEATURE, discriminated by an EXPLICIT
      // origin:'onboarding' body field (Pitfall C — do NOT infer from stream!==true,
      // which conflates it with the dead worker path and mis-gates the flag). When
      // present we drive the run through the shared request/response executor behind
      // ANALYSIS_LIFECYCLE_ONBOARDING (independent per-feature flag). It ships DORMANT
      // (flags default OFF → 100% of traffic falls through to today's withMerits path
      // below), so this is byte-identical on deploy. Only when an operator flips the
      // flags does it run — with a stable non-mutating idempotency identity (exactly
      // one run + one deduction on a duplicate onboarding interaction), save-before-
      // settle, safe Merit refund on genuine failure, and a run_id for frontend
      // refresh recovery. meritFeature:'resume_analysis' keeps the SAME merit cost +
      // History as a normal resume (the DB check_and_deduct_merits reads
      // merit_feature_costs, not the local MERIT_COST map).
      if (rawBody.origin === 'onboarding') {
        // Stable content identity (Pitfall 8): a hash of the normalized text_hash +
        // resumeId + target fields ONLY. NEVER a save-mutated field (analyzed_at /
        // grading_data / overall_score) — reuses the resumeTextHash computed above.
        const onboardingInputIdentity = await sha256Hex(
          JSON.stringify({ text_hash: resumeTextHash, resumeId, targetRole, targetIndustry }),
        );
        const onboardingAttemptNonce = typeof rawBody.attemptNonce === 'string' && rawBody.attemptNonce
          ? rawBody.attemptNonce
          : crypto.randomUUID();
        // The browser waits 120s and the Edge request is killed at 150s. Keep a
        // request-scoped provider wall below both (Free remains at its tighter 50s).
        const onboardingProviderTimeoutMs = Math.min(getTimeout(resolvedTier), 100_000);

        const onboardingLifecycle = await runAnalysisLifecycle<ResumeAnalysisResult, { resumeText: string }>({
          feature: 'onboarding',
          meritFeature: 'resume_analysis',
          ctx: { userId: userContext.userId, tier: resolvedTier, corsType: 'user' },
          jobType: 'resume_analysis',
          resumeId,
          inputIdentity: onboardingInputIdentity,
          attemptNonce: onboardingAttemptNonce,
          featureRunId: featureRuntime?.featureRunId,
          // Provider helpers historically nested their own retry/fallback beneath the
          // lifecycle's three retries. Disable both layers for this synchronous request:
          // one bounded provider batch must either save or reach refundAndFail while the
          // worker is still alive. A user can retry safely after the Merit is restored.
          maxRetries: 0,
          // Onboarding pre-extracts the resume text client-side; normalize + sanitize it
          // exactly as the withMerits path does (SEC-07 pre-ingestion defense).
          extract: () => Promise.resolve({
            resumeText: sanitizeUserContent(resumeText.replace(/\s+/g, ' ').trim(), 'analyze-resume', log),
          }),
          generate: async (_txId, extracted) => {
            // TIER-AWARE path (queue-path-tier-downgrade, 2026-07-18): this closure used to
            // hardcode executeFreeAnalysis, so an Elite user onboarding was CHARGED Elite
            // Merits (ctx.tier = resolvedTier) but ANALYZED as Free. Route through the shared
            // per-tier assembly instead — Free -> single consolidated call; Elite -> 3-call
            // parallel + merge with single-fallback recovery. Returns the ASSEMBLED +
            // reconciled result OBJECT serialized as text so the executor's validateModelOutput
            // sees a post-repair object (D-10); the closure does NOT validate. assembleResumeResult
            // throws a plain status-bearing Error on model/parse failure (NOT MeritRefundable —
            // the executor owns the refund boundary; classifyFailure reads .status).
            const { promptParams, userPrompt, model, fallbackModel } = buildResumePromptContext({
              resumeText: extracted.resumeText,
              resolvedTier,
              isElite,
              targetRole,
              targetIndustry,
              previousSuggestions: [],
              previousScore: null,
              log,
            });
            const result = await assembleResumeResult({
              resolvedTier,
              isElite,
              promptParams,
              userPrompt,
              model,
              fallbackModel,
              log,
              reqId,
              userId: userContext.userId,
              timeoutMs: onboardingProviderTimeoutMs,
              allowProviderRetry: false,
            });
            return JSON.stringify(result);
          },
          schema: resumeAnalysisSchema,
          validationOpts: { semanticCheck: resumeSemanticCheck },
          save: async (value) => {
            // Reconciled triple-write (05-01 Task 1): resumes.grading_data is the SOLE
            // authoritative throws-pre-settle write (owner-scoped .eq(user_id), IN-02);
            // the analysis_results mirror + usage are best-effort log-and-continue inside
            // completeAndRecordSuccess; cache + webhook are post-save best-effort here.
            const analysisId = await completeAndRecordSuccess(supabase, {
              userId: userContext.userId,
              resumeId,
              result: value,
              tier: resolvedTier,
              credits: MERIT_COST[resolvedTier],
            });
            await writeResumeAnalysisCache(supabase, {
              cacheKey: resumeCacheKey,
              userId: userContext.userId,
              tier: resolvedTier,
              variant: cacheVariant,
              result: value,
              analysisId,
            });
            triggerExtractWebhook(analysisId, 'resume_analysis');
          },
        });

        if (onboardingLifecycle.ok) {
          // Byte-preserve the result body; ADD run_id (tracking) + recordId (resumeId —
          // the ?id=/realtime re-hydration pointer; analysis_jobs has NO result column,
          // Pitfall F, so the frontend re-reads the body from resumes.grading_data).
          return new Response(
            JSON.stringify({ ...onboardingLifecycle.value, run_id: onboardingLifecycle.runId, recordId: resumeId }),
            { headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } },
          );
        }
        if (!onboardingLifecycle.dormant) {
          // Non-dormant failure: reuse the gateway's structured Response (e.g. a merit
          // 402) when present; else a generic 500 (code carried for logs only).
          if (onboardingLifecycle.response) return onboardingLifecycle.response;
          return new Response(
            JSON.stringify({ error: 'Failed to analyze resume. Please try again.', code: onboardingLifecycle.code }),
            { status: 500, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } },
          );
        }
        // dormant:true → the executor is OFF; fall through to today's UNCHANGED
        // withMerits non-streaming Free path below (100% of traffic while flags OFF).
      }

      // ── Phase 05 · 05-02 · Idempotency key + streaming-aware lifecycle dispatch ──
      // Close the confirmed :728 idempotency gap FIRST: derive ONE stable key over a
      // NON-mutating content identity (reuse resumeTextHash — never a save-mutated
      // field, Pitfall 8) + a per-deliberate-submit attemptNonce, and set it on
      // meritCtx BEFORE withMerits. This single seam makes BOTH the streaming and the
      // non-streaming merit branches idempotent (they share this meritCtx/withMerits
      // closure): a duplicate attempt (double-click / two tabs / worker retry of the
      // SAME attempt) deducts exactly once (check_and_deduct_merits already_deducted).
      // Additive/harmless while dormant — it only strengthens dedup, success byte-identical.
      const streamingInputIdentity = await sha256Hex(
        JSON.stringify({ text_hash: resumeTextHash, resumeId, targetRole, targetIndustry }),
      );
      const streamingAttemptNonce = typeof rawBody.attemptNonce === 'string' && rawBody.attemptNonce
        ? rawBody.attemptNonce
        : crypto.randomUUID();
      const resumeIdempotencyKey = await deriveIdempotencyKey({
        userId: userContext.userId,
        feature: 'resume_analysis',
        tier: resolvedTier,
        inputIdentity: streamingInputIdentity,
        attemptNonce: streamingAttemptNonce,
      });

      const meritCtx: MeritGatewayContext = {
        userId: userContext.userId,
        tier: resolvedTier,
        corsType: 'user' as const,
        idempotencyKey: resumeIdempotencyKey,
      };

      // ── Streaming-aware lifecycle wrapper (D-01/D-02): when the per-feature flag is
      //    ON and the client requested the SSE stream, orchestrate the SAME lifecycle
      //    primitives DIRECTLY around the UNTOUCHED TransformStream token path (persistent
      //    run at stream start + settle-on-saved + pre-saving refund + run_id recovery).
      //    DORMANT by default → falls through to today's byte-identical withMerits
      //    streaming path below (100% of traffic while ANALYSIS_LIFECYCLE_RESUME is OFF). ──
      if (isAnalysisFeatureEnabled('resume') && rawBody.stream === true) {
        return await runResumeStreamingLifecycle({
          supabase,
          log,
          userId: userContext.userId,
          resolvedTier,
          isElite,
          resumeText,
          targetRole,
          targetIndustry,
          previousSuggestions,
          previousScore,
          resumeId,
          resumeCacheKey,
          cacheVariant,
          idempotencyKey: resumeIdempotencyKey,
          meritCtx,
          reqId,
        });
      }

      const gated = await withMerits(
        meritCtx,
        'resume_analysis',
        async (_txId) => {
          await featureRuntime?.observeCharge(_txId);
          const persistAndCacheResumeResult = async (
            result: Record<string, any>,
            tier: Tier,
            credits: number,
          ): Promise<string | null> => {
            const analysisId = await completeAndRecordSuccess(supabase, {
              userId: userContext.userId,
              resumeId,
              result,
              tier,
              credits,
            });
            await writeResumeAnalysisCache(supabase, {
              cacheKey: resumeCacheKey,
              userId: userContext.userId,
              tier,
              variant: cacheVariant,
              result,
              analysisId,
            });
            triggerExtractWebhook(analysisId, 'resume_analysis');
            await featureRuntime?.complete();
            return analysisId;
          };

          const ANTHROPIC_MODEL_TEXT = getModel(resolvedTier, 'resume');
          const ANTHROPIC_MODEL_FALLBACK = Deno.env.get('ANTHROPIC_MODEL_FALLBACK') || ANTHROPIC_MODEL_TEXT;

          const wordCount = resumeText.split(/\s+/).length;
          const bulletCount = (resumeText.match(/[•\-\*]/g) || []).length;
          const numberCount = (resumeText.match(/\d+%?|\$[\d,]+/g) || []).length;
          const hasEducation = /education|university|college|degree|bachelor|master|phd/i.test(resumeText);
          const hasSkillsSection = /skills|technologies|tools|proficiencies/i.test(resumeText);
          const experienceYears = resumeText.match(/(\d+)\+?\s*years?/gi) || [];

          const incorporatedSuggestions: string[] = [];
          if (previousSuggestions.length > 0) {
            for (const suggestion of previousSuggestions) {
              if (suggestion.improvedText && resumeText.toLowerCase().includes(suggestion.improvedText.toLowerCase().slice(0, 50))) {
                incorporatedSuggestions.push(suggestion.title || suggestion.improvedText.slice(0, 50));
              }
            }
          }

          // SEC-07 (D-01): strip high-confidence multi-word injection phrases from the
          // user-role resume text before it enters the Anthropic prompt. Single-word terms are
          // preserved by the sanitizer so legitimate resume content is not corrupted; this is a
          // pre-ingestion defense-in-depth step only — no schema / wire / tier-model change.
          const normalizedText = sanitizeUserContent(resumeText.replace(/\s+/g, ' ').trim(), 'analyze-resume', log);
          const improvementContext = buildImprovementContext(incorporatedSuggestions, previousScore);
          const userPrompt = buildUserPrompt(normalizedText, improvementContext);

          const currentDate = new Date().toISOString().slice(0, 10);
          const promptParams: PromptParams = {
            isElite,
            tier: resolvedTier,
            currentDate,
            wordCount,
            bulletCount,
            numberCount,
            hasEducation,
            hasSkillsSection,
            experienceYears,
            targetRole: targetRole || '',
            targetIndustry: targetIndustry || '',
          };

          // ── STREAMING MODE (merit path) ──────────────────────────────────
          if (rawBody.stream === true) {
            const { readable, writable } = new TransformStream();
            const writer = writable.getWriter();
            const encoder = new TextEncoder();
            const sendEvent = (obj: object) =>
              writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

            (async () => {
              try {
                await sendEvent({ type: 'chunk', text: '{"overallScore":' });

                // -- FREE SINGLE-CALL PATH (D-01, Phase 15.1) --
                if (resolvedTier === 'free') {
                  try {
                    const freeResult = await executeFreeAnalysis({
                      model: ANTHROPIC_MODEL_TEXT,
                      promptParams,
                      userPrompt,
                      log,
                      reqId,
                      userId: userContext.userId,
                    });

                    // Emit summary chunk for streaming UX
                    const summaryText = (freeResult.executiveSummary || '') as string | object;
                    const summaryChunk = JSON.stringify({
                      summary: typeof summaryText === 'object' ? summaryText : summaryText,
                    });
                    await sendEvent({ type: 'chunk', text: summaryChunk });
                    await sendEvent({ type: 'chunk', text: '"criteria":' });

                    await persistAndCacheResumeResult(freeResult, 'free', MERIT_COST.free);

                    await sendEvent({ type: 'complete', result: freeResult });
                  } catch (err) {
                    if (err instanceof MeritRefundable) {
                      await sendEvent({ type: 'error', message: err.message });
                      await refundMeritsForJob(userContext.userId, _txId, `free-single-error: ${err.message}`);
                      await featureRuntime?.observeRefund(_txId);
                      await featureRuntime?.fail('FREE_ANALYSIS_FAILED', 'provider');
                      try { await writer.close(); } catch { /* already closed */ }
                      return;
                    }
                    const meritErr = new MeritRefundable((err as any).status || 500, (err as Error).message);
                    await sendEvent({ type: 'error', message: meritErr.message });
                    await refundMeritsForJob(userContext.userId, _txId, `free-single-error: ${meritErr.message}`);
                    await featureRuntime?.observeRefund(_txId);
                    await featureRuntime?.fail('FREE_ANALYSIS_FAILED', 'provider');
                    try { await writer.close(); } catch { /* already closed */ }
                    return;
                  }
                  try { await writer.close(); } catch { /* already closed */ }
                  return;
                }

                const parallelResults = await executeParallelCalls({
                  model: ANTHROPIC_MODEL_TEXT,
                  promptParams,
                  userPrompt,
                  isElite,
                  tier: promptParams.tier,
                  fixtureKey: 'analyze_resume',
                  reqId,
                  userId: userContext.userId,
                });

                for (const r of parallelResults) {
                  console.log(`[parallel-stream-merit] ${r.callType}: ${r.ok ? 'OK' : 'FAIL'} in ${r.durationMs}ms${!r.ok && 'error' in r ? ` (${(r as ParallelCallFailure).error})` : ''}`);
                }

                const failedCalls = parallelResults.filter((r): r is ParallelCallFailure => !r.ok);

                if (failedCalls.length > 0 && failedCalls.length < parallelResults.length) {
                  const totalCalls = parallelResults.length;
                  const errorMsg = `${failedCalls.length} of ${totalCalls} analysis steps failed. Please try again.`;
                  throw new MeritRefundable(500, errorMsg);
                }

                if (failedCalls.length === parallelResults.length) {
                  const fallbackPrompt = buildFallbackPrompt(promptParams);
                  const fallbackMaxTokens = TIER_MAX_TOKENS[resolvedTier];
                  const fallbackResp = await invokeAnthropicText({
                    model: ANTHROPIC_MODEL_FALLBACK,
                    system: fallbackPrompt,
                    messages: [{ role: 'user', content: userPrompt }],
                    maxTokens: fallbackMaxTokens,
                    temperature: 0.3,
                    fixtureKey: 'analyze_resume',
                    timeoutMs: 100000,
                    // `legacy-` prefix: RESEARCH expects ZERO rows from this fallback.
                    telemetry: {
                      feature: 'resume_analysis',
                      tier: resolvedTier,
                      callName: 'legacy-fallback-stream-merit',
                      reqId,
                      userId: userContext.userId,
                      attempt: 1,
                    },
                  });
                  if (!fallbackResp.ok) throw new MeritRefundable(fallbackResp.status, fallbackResp.error);

                  const repaired = repairTruncatedJSON(fallbackResp.text.trim());
                  let fallbackResult: Record<string, any>;
                  try {
                    fallbackResult = JSON.parse(repaired);
                  } catch (parseErr) {
                    throw new MeritRefundable(500, `JSON parse failed: ${(parseErr as Error).message}`);
                  }

                  const summaryText = (fallbackResult.executiveSummary || fallbackResult.summary || '') as string;
                  if (typeof summaryText === 'string' && summaryText) {
                    const summaryChunk = JSON.stringify({ summary: typeof fallbackResult.executiveSummary === 'object' ? fallbackResult.executiveSummary : summaryText });
                    await sendEvent({ type: 'chunk', text: summaryChunk });
                  }
                  await sendEvent({ type: 'chunk', text: '"criteria":' });

                  fallbackResult = reconcileScore(fallbackResult);
                  validateFeedbackDepth(fallbackResult, resolvedTier === 'elite' ? 5 : 3);
                  if (!fallbackResult.industryGuess) fallbackResult.industryGuess = '';
                  if (!Array.isArray(fallbackResult.suggestedTargetRoles)) fallbackResult.suggestedTargetRoles = [];
                  if (!Array.isArray(fallbackResult.recommendedKeywords)) fallbackResult.recommendedKeywords = [];
                  if (!isElite) { fallbackResult.eliteInsights = null; }
                  else if (!fallbackResult.eliteInsights || typeof fallbackResult.eliteInsights !== 'object') { fallbackResult.eliteInsights = null; }
                  fallbackResult._mergeSource = 'fallback-single';
                  applyTierShape(fallbackResult, resolvedTier);

                  await persistAndCacheResumeResult(fallbackResult, resolvedTier, MERIT_COST[resolvedTier]);

                  await sendEvent({ type: 'complete', result: fallbackResult });
                  return;
                }

                // H4 dedup (quick task 260625): consume the validated parsed data
                // executeParallelCalls already computed (drop optionals whose parse
                // failed — salvage-tolerant, matching the prior raw-text fold).
                const parsedResults = Object.fromEntries(
                  parallelResults.filter((r): r is ParallelCallResult => r.ok && r.parsed !== null)
                    .map(r => [r.callType, r.parsed as Record<string, unknown>])
                ) as Record<string, Record<string, unknown>>;

                const mergeResult = mergeValidated(parsedResults, resolvedTier);
                if (!mergeResult.ok) throw new MeritRefundable(500, `Merge failed: ${mergeResult.reason}`);

                let analysisResult = mergeResult.data;
                const summaryText = (analysisResult.executiveSummary || analysisResult.summary || '') as string;
                if (summaryText) {
                  const summaryChunk = JSON.stringify({ summary: summaryText });
                  await sendEvent({ type: 'chunk', text: summaryChunk });
                }
                await sendEvent({ type: 'chunk', text: '"criteria":' });

                analysisResult = reconcileScore(analysisResult);
                validateFeedbackDepth(analysisResult, resolvedTier === 'elite' ? 5 : 3);

                await persistAndCacheResumeResult(analysisResult, resolvedTier, MERIT_COST[resolvedTier]);

                await sendEvent({ type: 'complete', result: analysisResult });
              } catch (err) {
                // WR-05: handle MeritRefundable directly instead of re-throwing,
                // because the IIFE is not awaited (Response was already returned).
                // Re-throwing would become an unhandled promise rejection.
                if (err instanceof MeritRefundable) {
                  await sendEvent({ type: 'error', message: err.message });
                  await refundMeritsForJob(userContext.userId, _txId, `stream-error: ${err.message}`);
                  await featureRuntime?.observeRefund(_txId);
                  await featureRuntime?.fail('STREAM_ANALYSIS_FAILED', 'provider');
                  try { await writer.close(); } catch { /* already closed */ }
                  return;
                }
                await sendEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) });
                await featureRuntime?.fail('STREAM_ANALYSIS_FAILED', 'internal');
              } finally {
                try { await writer.close(); } catch { /* already closed */ }
              }
            })();

            return new Response(readable, {
              headers: {
                ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }),
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
              },
            });
          }

          // ── NON-STREAMING (merit path) ───────────────────────────────────

          // -- FREE SINGLE-CALL PATH (D-01, Phase 15.1) --
          if (resolvedTier === 'free') {
            try {
              const freeResult = await executeFreeAnalysis({
                model: ANTHROPIC_MODEL_TEXT,
                promptParams,
                userPrompt,
                log,
                reqId,
                userId: userContext.userId,
              });

              await persistAndCacheResumeResult(freeResult, 'free', MERIT_COST.free);

              return new Response(
                JSON.stringify(freeResult),
                { headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } }
              );
            } catch (err) {
              throw new MeritRefundable((err as any).status || 500, (err as Error).message);
            }
          }

          const parallelResults = await executeParallelCalls({
            model: ANTHROPIC_MODEL_TEXT,
            promptParams,
            userPrompt,
            isElite,
            tier: promptParams.tier,
            fixtureKey: 'analyze_resume',
            reqId,
            userId: userContext.userId,
          });

          for (const r of parallelResults) {
            console.log(`[parallel-merit] ${r.callType}: ${r.ok ? 'OK' : 'FAIL'} in ${r.durationMs}ms${!r.ok && 'error' in r ? ` (${(r as ParallelCallFailure).error})` : ''}`);
          }

          const failedCalls = parallelResults.filter((r): r is ParallelCallFailure => !r.ok);

          if (failedCalls.length > 0 && failedCalls.length < parallelResults.length) {
            const allOverloaded = failedCalls.every(f => isAnthropicOverloaded(f.status, f.error));
            const totalCalls = parallelResults.length;
            throw new MeritRefundable(allOverloaded ? 503 : 500, `${failedCalls.length} of ${totalCalls} analysis steps failed.`);
          }

          if (failedCalls.length === parallelResults.length) {
            const fallbackPrompt = buildFallbackPrompt(promptParams);
            const fallbackMaxTokens = TIER_MAX_TOKENS[resolvedTier];
            const fallbackResp = await invokeAnthropicText({
              model: ANTHROPIC_MODEL_FALLBACK,
              system: fallbackPrompt,
              messages: [{ role: 'user', content: userPrompt }],
              maxTokens: fallbackMaxTokens,
              temperature: 0.3,
              fixtureKey: 'analyze_resume',
              timeoutMs: 100000,
              // `legacy-` prefix: RESEARCH expects ZERO rows from this fallback.
              telemetry: {
                feature: 'resume_analysis',
                tier: resolvedTier,
                callName: 'legacy-fallback-merit',
                reqId,
                userId: userContext.userId,
                attempt: 1,
              },
            });
            if (!fallbackResp.ok) throw new MeritRefundable(fallbackResp.status, fallbackResp.error);

            const repaired = repairTruncatedJSON(fallbackResp.text.trim());
            let fallbackResult: Record<string, any>;
            try {
              fallbackResult = JSON.parse(repaired);
            } catch (parseErr) {
              throw new MeritRefundable(500, `JSON parse failed: ${(parseErr as Error).message}`);
            }

            fallbackResult = reconcileScore(fallbackResult);
            validateFeedbackDepth(fallbackResult, resolvedTier === 'elite' ? 5 : 3);
            if (!fallbackResult.industryGuess) fallbackResult.industryGuess = '';
            if (!Array.isArray(fallbackResult.suggestedTargetRoles)) fallbackResult.suggestedTargetRoles = [];
            if (!Array.isArray(fallbackResult.recommendedKeywords)) fallbackResult.recommendedKeywords = [];
            if (!isElite) { fallbackResult.eliteInsights = null; }
            else if (!fallbackResult.eliteInsights || typeof fallbackResult.eliteInsights !== 'object') { fallbackResult.eliteInsights = null; }
            fallbackResult._mergeSource = 'fallback-single';
            applyTierShape(fallbackResult, resolvedTier);

            await persistAndCacheResumeResult(fallbackResult, resolvedTier, MERIT_COST[resolvedTier]);

            return new Response(
              JSON.stringify(fallbackResult),
              { headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } }
            );
          }

          // H4 dedup (quick task 260625): consume the validated parsed data
          // executeParallelCalls already computed (drop optionals whose parse
          // failed — salvage-tolerant, matching the prior raw-text fold).
          const parsedResults = Object.fromEntries(
            parallelResults.filter((r): r is ParallelCallResult => r.ok && r.parsed !== null)
              .map(r => [r.callType, r.parsed as Record<string, unknown>])
          ) as Record<string, Record<string, unknown>>;

          const mergeResult = mergeValidated(parsedResults, resolvedTier);
          if (!mergeResult.ok) throw new MeritRefundable(500, `Merge failed: ${mergeResult.reason}`);

          let analysisResult = mergeResult.data;
          analysisResult = reconcileScore(analysisResult);
          validateFeedbackDepth(analysisResult, resolvedTier === 'elite' ? 5 : 3);

          await persistAndCacheResumeResult(analysisResult, resolvedTier, MERIT_COST[resolvedTier]);

          return new Response(
            JSON.stringify(analysisResult),
            { headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } }
          );
        },
        {
          precheck_cache: () => readResumeAnalysisCache(supabase, {
            cacheKey: resumeCacheKey,
            stream: rawBody.stream === true,
          }),
        },
      );
      if (!gated.ok) {
        await featureRuntime?.fail('MERIT_GATE_REJECTED', 'authorization');
        return gated.response;
      }
      if (gated.transactionId === 'cache-hit') {
        await featureRuntime?.markCache('analysis_cache');
        await featureRuntime?.complete();
      }
      return gated.value;
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    log.error('request-failed', { error: errorMessage, durationMs: totalTimer() });
    await featureRuntime?.fail('REQUEST_FAILED', 'internal');
    if (error instanceof Response) throw error;
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } }
    );
  }
}, { extraHeaders: 'x-internal-job-secret' }));

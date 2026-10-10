import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createUsageLimitResponse, checkEntitlement, recordUsageWithAnalysis } from '../_shared/usage-checker.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { invokeAnthropicText } from '../_shared/anthropic.ts';
import { mergeRecruitingLensResults, type RecruitingLensOutput } from '../_shared/recruiting-lens-merger.ts';
import { runAnalysisLifecycle } from '../_shared/analysis-lifecycle.ts';
import { deriveIdempotencyKey } from '../_shared/idempotency-key.ts';
import { recruitingLensOutputSchema } from './schema.ts';
import { createLogger } from '../_shared/logger.ts';
import {
  buildRecruitingLensSystemBlock,
  buildRecruitingLensUserPrompt,
  type RecruitingLensCallType,
  type RecruitingLensPromptParams,
} from '../_shared/recruiting-lens-prompts.ts';
import { requireAuth } from '../_shared/auth.ts';
import { corsHeaders, handleOptionsRequest, withCors } from '../_shared/cors.ts';
import { checkRateLimit, createRateLimitResponse } from '../_shared/rate-limiter.ts';
import { MERIT_SYSTEM_ENABLED, withMerits, MeritRefundable } from '../_shared/merit-gateway.ts';
import { sanitizeUserContent } from '../_shared/prompt-sanitizer.ts';
import { getModel, getTimeout, getMaxOutput, getMaxInputChars, type Tier } from '../_shared/tier-config.ts';
import { computeCacheKey, sha256Hex } from '../_shared/cache-fingerprint.ts';
import { readWithArchiveFallback } from '../_shared/archive-reader.ts';
import {
  getRecruitingLensJdLimitError,
  MSG_JD_TOO_LONG,
  RECRUITING_LENS_JD_MAX_CHARS,
} from '../_shared/document-limits.ts';
import { beginFeatureRun, type FeatureRunRuntime } from '../_shared/feature-run-runtime.ts';

// Phase 21 D-19: boot-time merit-flag attestation (SC-5 evidence source).
createLogger("recruiting-lens").info("merit-flag", { enabled: MERIT_SYSTEM_ENABLED });

// ── Constants ──────────────────────────────────────────────────────────────────

// Elite-only feature (no Free invoke path; Pro collapses to Elite).
// Hard per-tier OUTPUT cap (quick task 260608-p5k follow-up): elite total is bounded
// by getMaxOutput('recruitingLens','elite') (raised from 12000 to 15000 to match the
// resume fix — a 3-call fan-out at 12000 carries the same mid-JSON truncation risk
// the resume criteria/summary calls hit; ~5000/call gives each section headroom).
//
// FINAL (Phase 02 plan 02-09 — 02-APPROVED-CAPS.md, LOCKED 2026-07-27, operator approved
// 15/15 as proposed): 12000 x 3 = 36000 == getMaxOutput('recruitingLens','elite').
// Every call sits AT the ABSOLUTE_MAX_TOKENS 12000 per-call clamp — none can be raised
// further without lifting the clamp. Measured first-attempt peaks (Epoch 2):
// rl-call-1 10955 (@12000 clamp; truncated 1/5 @9000 — its peak is a lower bound),
// rl-call-2 8669 (~4% headroom @9000), rl-call-3 8280 (near-cap @9000). Production R7
// later observed rl-call-3 at 10909/12000 (9.09% headroom), below the locked 15% watch
// floor. Plan 02-11 bounds that prompt below 8000 tokens with matching schema guards;
// Plan 02-12 owns the production rerun. max_tokens remains a ceiling, not a target.
// The cache variant is bumped in lockstep with any cap change: a re-run that hits
// analysis_cache produces NO Anthropic call and therefore NO telemetry row.
const CALL_CONFIGS: Array<{
  callType: RecruitingLensCallType;
  maxTokensPro: number;
  maxTokensElite: number;
}> = [
  { callType: 'rl-call-1', maxTokensPro: 12000, maxTokensElite: 12000 }, // Phase 02 LOCKED — peak 10955 @clamp
  { callType: 'rl-call-2', maxTokensPro: 12000, maxTokensElite: 12000 }, // Phase 02 LOCKED — peak 8669, near-cap @9000
  { callType: 'rl-call-3', maxTokensPro: 12000, maxTokensElite: 12000 }, // Phase 02 LOCKED — peak 8280, near-cap @9000
];
// Pro total: 36,000 | Elite total: 36,000 (Phase 02 LOCKED final — was TEMP 30,000)
const RECRUITING_LENS_CACHE_VARIANT = 'recruiting-lens:v37-07'; // bumped with the 02-11 bounded prompt so the production proof cannot serve a pre-fix cache hit

// ── Boot-time invariant (quick task 260608-p5k): per-tier budgets must not exceed
//    the central getMaxOutput ceiling. Pro is checked against the Elite ceiling
//    (collapsed by the accessor); Free has no invoke path for this elite-only feature. ──
const RCL_MAX_TOKENS: Record<'pro' | 'elite', number> = {
  pro: getMaxOutput('recruitingLens', 'pro'),
  elite: getMaxOutput('recruitingLens', 'elite'),
};
for (const tier of ['pro', 'elite'] as const) {
  const key = `maxTokens${tier[0].toUpperCase() + tier.slice(1)}` as 'maxTokensPro' | 'maxTokensElite';
  const sum = CALL_CONFIGS.reduce((acc, cfg) => acc + cfg[key], 0);
  if (sum > RCL_MAX_TOKENS[tier]) {
    throw new Error(`[recruiting-lens] CALL_CONFIGS sum ${sum} exceeds getMaxOutput('recruitingLens','${tier}') (${RCL_MAX_TOKENS[tier]})`);
  }
}

async function persistRecruitingLensResult(
  params: {
    userId: string;
    merged: Record<string, any>;
    sanitizedJD: string;
    company: string;
    roleTitle: string;
    cacheKey?: string;
    tier: 'pro' | 'elite';
    log: ReturnType<typeof createLogger>;
    recordUsage: boolean;
  },
): Promise<string> {
  const supabase = getServiceClient();
  const analysisDate = new Date().toISOString();
  const { data, error } = await supabase.from('analysis_results').insert({
    user_id: params.userId,
    analysis_type: 'recruiting_lens',
    primary_score: params.merged.overallMatch?.score ?? 0,
    key_insights: [
      params.merged.recruiterVerdict?.slice(0, 200) ?? '',
      params.merged.topGaps?.[0]?.title ?? '',
      params.merged.strategicAdvice?.biggestScoreMover ?? '',
    ],
    raw_response: {
      ...params.merged,
      metadata: {
        jobDescription: params.sanitizedJD,
        company: params.company,
        roleTitle: params.roleTitle,
        cache_key: params.cacheKey ?? null,
        analysisDate,
        tier: params.tier,
      },
    },
    source_reference: null,
    created_at: analysisDate,
  }).select('id').single();

  if (error || !data?.id) {
    params.log.error('recruiting-lens-save-failed', { error: error?.message || 'missing id' });
    throw new MeritRefundable(500, 'Could not save Recruiting Lens analysis history.');
  }

  await upsertSavedRecruitingLensJob({
    userId: params.userId,
    analysisId: data.id,
    company: params.company,
    roleTitle: params.roleTitle,
    sanitizedJD: params.sanitizedJD,
    merged: params.merged,
    log: params.log,
  });

  if (params.recordUsage) {
    const usageResult = await recordUsageWithAnalysis(params.userId, 'recruiting_lens', 1, data.id);
    if (!usageResult.ok) {
      // Fix 2 (SEC-13) post-save log-and-continue: the analysis row is already durable, so a
      // usage-write failure must NOT 500 an already-delivered analysis — and must NOT raise
      // MeritRefundable, which would refund a run the user actually received (double benefit).
      // Log the reason (operator signal) and fall through to the durable success response.
      params.log.error('usage-tracking-insert-failed', { error: usageResult.error });
    }
  }

  return data.id;
}

async function upsertSavedRecruitingLensJob(params: {
  userId: string;
  analysisId: string;
  company: string;
  roleTitle: string;
  sanitizedJD: string;
  merged: Record<string, any>;
  log: ReturnType<typeof createLogger>;
}): Promise<void> {
  const supabase = getServiceClient();
  const now = new Date().toISOString();
  // Phase 42 Plan 42-10: use canonical application_source='recruiting_lens' (was 'other' in 42-09 cutover).
  // location='Recruiting Lens' sentinel preserved for backward-compat with backfilled rows from 42-08.
  const row = {
    user_id: params.userId,
    analysis_id: params.analysisId, // durable deep-link to this run's analysis_results row
    jd_id: null, // L2 worker backfills via extract-recruiting-lens (Plan 42-10 Task 3)
    role_applied: params.roleTitle,
    company_applied: params.company,
    location: 'Recruiting Lens',
    salary: null,
    url: null,
    posted: null,
    status: 'saved',
    application_source: 'recruiting_lens',
    created_at: now,
  };

  // Idempotency guard: look up by canonical application_source='recruiting_lens' first;
  // also fall back to legacy location sentinel for rows backfilled from 42-08.
  const { data: existing, error: lookupError } = await supabase
    .from('applications')
    .select('id')
    .eq('user_id', params.userId)
    .eq('company_applied', params.company)
    .eq('role_applied', params.roleTitle)
    .eq('application_source', 'recruiting_lens')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    // Phase 42 Plan 42-10: application auto-create must be non-fatal; L2 worker (extract-recruiting-lens)
    // is the safety net that backfills missing applications.jd_id. Log as warn, do NOT propagate.
    params.log.warn('applications-autocreate-failed', { error: lookupError.message, user_id: params.userId });
    return;
  }

  const query = existing?.id
    ? supabase.from('applications').update(row).eq('id', existing.id)
    : supabase.from('applications').insert(row);
  const { error } = await query;
  if (error) {
    // Non-fatal: L2 catchup cron will backfill via extract-recruiting-lens worker
    params.log.warn('applications-autocreate-failed', { error: error.message, user_id: params.userId });
  }
}

async function refreshSavedRecruitingLensJob(params: {
  userId: string;
  analysisId: string;
  company: string;
  roleTitle: string;
  sanitizedJD: string;
  merged: Record<string, any>;
  log: ReturnType<typeof createLogger>;
}): Promise<void> {
  await upsertSavedRecruitingLensJob(params);
}

function analysisIdFromCachedResult(result: any): string | null {
  return result?.metadata?.analysis_id ?? result?.metadata?.analysisId ?? result?.analysisId ?? null;
}

async function readRecruitingLensCache(
  supabase: ReturnType<typeof getServiceClient>,
  params: {
    cacheKey: string;
    userId: string;
    company: string;
    roleTitle: string;
    sanitizedJD: string;
    log: ReturnType<typeof createLogger>;
  },
): Promise<{ cached: Response; analysis_id: string } | null> {
  // Fetch cache row metadata (id, hit_count) — separate from payload read
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

  const cached = rawResponse as Record<string, any>;
  const analysisId = analysisIdFromCachedResult(cached);
  if (!analysisId) return null;

  await supabase
    .from('analysis_cache')
    .update({
      last_hit_at: new Date().toISOString(),
      hit_count: Number(meta.hit_count ?? 1) + 1,
    })
    .eq('cache_key', params.cacheKey);

  await refreshSavedRecruitingLensJob({
    userId: params.userId,
    analysisId,
    company: params.company,
    roleTitle: params.roleTitle,
    sanitizedJD: params.sanitizedJD,
    merged: cached,
    log: params.log,
  });

  return {
    cached: new Response(JSON.stringify({ ...cached, analysisId }), {
      status: 200,
      headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
    }),
    analysis_id: analysisId,
  };
}

async function writeRecruitingLensCache(
  supabase: ReturnType<typeof getServiceClient>,
  params: {
    cacheKey: string;
    userId: string;
    tier: 'pro' | 'elite';
    merged: Record<string, any>;
    analysisId: string;
    sanitizedJD: string;
    company: string;
    roleTitle: string;
  },
): Promise<void> {
  const rawResponse = {
    ...params.merged,
    analysisId: params.analysisId,
    metadata: {
      ...params.merged.metadata,
      analysis_id: params.analysisId,
      jobDescription: params.sanitizedJD,
      company: params.company,
      roleTitle: params.roleTitle,
      cache_key: params.cacheKey,
    },
  };

  const { error } = await supabase
    .from('analysis_cache')
    .upsert({
      cache_key: params.cacheKey,
      feature: 'recruiting_lens',
      tier: params.tier,
      variant: RECRUITING_LENS_CACHE_VARIANT,
      user_id: params.userId,
      raw_response: rawResponse,
      last_hit_at: new Date().toISOString(),
      hit_count: 1,
    }, { onConflict: 'cache_key' });

  if (error) {
    console.warn('[recruiting-lens] cache write failed:', error.message);
  }
}

async function buildRecruitingLensCacheKey(params: {
  userId: string;
  tier: 'pro' | 'elite';
  sanitizedResume: string;
  sanitizedJD: string;
  sanitizedLinkedin?: string;
  company: string;
  roleTitle: string;
}): Promise<string> {
  const [resumeHash, jdHash, linkedinHash] = await Promise.all([
    sha256Hex(params.sanitizedResume),
    sha256Hex(params.sanitizedJD),
    sha256Hex(params.sanitizedLinkedin ?? ''),
  ]);
  return await computeCacheKey({
    user_id: params.userId,
    feature: 'recruiting_lens',
    tier: params.tier,
    variant: RECRUITING_LENS_CACHE_VARIANT,
    inputs: {
      resumeSummary_hash: resumeHash,
      jobDescription_hash: jdHash,
      linkedinText_hash: linkedinHash,
      company: params.company,
      role_title: params.roleTitle,
    },
  });
}

// ── Overload detection helpers ─────────────────────────────────────────────────

function isAnthropicOverloaded(status?: number, errorText?: string): boolean {
  return status === 529 || (errorText || '').toLowerCase().includes('overloaded');
}

function computeBackoffMs(attempt: number): number {
  const base = Math.min(3000, 1000 * (2 ** (attempt - 1)));
  const jitter = Math.floor(Math.random() * 400);
  return base + jitter;
}

// ── Parallel execution types ───────────────────────────────────────────────────

interface ParallelCallResult {
  callType: RecruitingLensCallType;
  ok: true;
  text: string;
  durationMs: number;
}

interface ParallelCallFailure {
  callType: RecruitingLensCallType;
  ok: false;
  error: string;
  status?: number;
  durationMs: number;
}

type ParallelResult = ParallelCallResult | ParallelCallFailure;

// ── Parallel call executor ─────────────────────────────────────────────────────

async function executeParallelCalls(params: {
  model: string;
  promptParams: RecruitingLensPromptParams;
  userPrompt: string;
  tier: 'pro' | 'elite';
  log: ReturnType<typeof createLogger>;
  /** Phase 02 · TOK-02 telemetry context (labels only — no control-flow effect). */
  reqId?: string;
  userId?: string;
}): Promise<ParallelResult[]> {
  const { model, promptParams, userPrompt, tier, log, reqId, userId } = params;

  const makeCall = async (
    callType: RecruitingLensCallType,
    maxTokens: number,
    attempt: number,
  ): Promise<ParallelResult> => {
    const start = Date.now();
    const resp = await invokeAnthropicText({
      model,
      system: buildRecruitingLensSystemBlock(callType, promptParams),
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens,
      temperature: 0.3,
      fixtureKey: 'recruiting_lens',
      timeoutMs: getTimeout(tier as Tier),
      // TOK-02 — the telemetry callName IS the CALL_CONFIGS key (`rl-call-1|2|3`), so
      // the per-call headroom report joins straight onto the cap it is judging. `tier`
      // is the SERVER-resolved tier already driving RCL_MAX_TOKENS, never a body field.
      // `attempt` separates the once-only retry below from the first-attempt peak.
      telemetry: {
        feature: 'recruiting_lens',
        tier,
        callName: callType,
        reqId,
        userId,
        attempt,
      },
    });
    const durationMs = Date.now() - start;

    if (!resp.ok) {
      return { callType, ok: false, error: resp.error, status: resp.status, durationMs };
    }
    return { callType, ok: true, text: resp.text, durationMs };
  };

  // Fire all 3 calls in parallel
  const promises = CALL_CONFIGS.map((cfg) => {
    const tokenKey = `maxTokens${tier[0].toUpperCase() + tier.slice(1)}` as 'maxTokensPro' | 'maxTokensElite';
    const maxTokens = cfg[tokenKey];
    return makeCall(cfg.callType, maxTokens, 1);
  });

  const settled = await Promise.allSettled(promises);
  const results: ParallelResult[] = settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    // Promise rejection (unexpected runtime error) — wrap as failure
    return {
      callType: CALL_CONFIGS[i].callType,
      ok: false as const,
      error: (r.reason as Error)?.message || 'Unexpected error',
      durationMs: 0,
    };
  });

  // Retry failed calls once with exponential backoff
  const retryPromises = results.map(async (result, i) => {
    if (result.ok) return result;

    // Don't retry non-retriable errors
    if ('status' in result && (result.status === 429 || result.status === 402)) {
      return result;
    }

    const backoffMs = computeBackoffMs(1);
    log.info('Retrying failed call', { callType: result.callType, backoffMs, error: result.error });
    await new Promise((resolve) => setTimeout(resolve, backoffMs));

    const cfg = CALL_CONFIGS[i];
    const retryKey = `maxTokens${tier[0].toUpperCase() + tier.slice(1)}` as 'maxTokensPro' | 'maxTokensElite';
    const maxTokens = cfg[retryKey];
    return makeCall(cfg.callType, maxTokens, 2);
  });

  return Promise.all(retryPromises);
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function handler(req: Request): Promise<Response> {
  // 1. OPTIONS handling
  if (req.method === 'OPTIONS') return handleOptionsRequest({ type: 'user' });

  // 2. Request ID + logger
  const reqId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('recruiting-lens', reqId);
  let featureRuntime: FeatureRunRuntime | null = null;
  let activeMeritTransactionId: string | null = null;

  try {
    const startTime = Date.now();

    // 3. Parse + validate body
    const body = await req.json();
    let resumeSummary = typeof body.resumeSummary === 'string' ? body.resumeSummary.slice(0, 5000) : '';
    const company = typeof body.company === 'string' ? body.company.slice(0, 120).trim() : '';
    const roleTitleInput =
      typeof body.roleTitle === 'string'
        ? body.roleTitle
        : (typeof body.role_title === 'string' ? body.role_title : '');
    const roleTitle = roleTitleInput.slice(0, 160).trim();
    let jobDescription = typeof body.jobDescription === 'string' ? body.jobDescription : '';
    let linkedinText = typeof body.linkedinText === 'string' ? body.linkedinText.slice(0, 4000) : '';

    const jobDescriptionLimitError =
      getRecruitingLensJdLimitError(jobDescription);
    if (jobDescriptionLimitError) {
      return new Response(
        JSON.stringify({ error: 'invalid_input', message: jobDescriptionLimitError }),
        { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }
    if (!resumeSummary || resumeSummary.length < 50) {
      return new Response(
        JSON.stringify({ error: 'invalid_input', message: 'Resume summary is required (minimum 50 characters).' }),
        { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }
    if (!jobDescription || jobDescription.length < 50) {
      return new Response(
        JSON.stringify({ error: 'invalid_input', message: 'Job description is required (minimum 50 characters).' }),
        { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }
    if (!company) {
      return new Response(
        JSON.stringify({ error: 'invalid_input', message: 'Company name is required.' }),
        { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }
    if (!roleTitle) {
      return new Response(
        JSON.stringify({ error: 'invalid_input', message: 'Role title is required.' }),
        { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }

    // 4. Auth — validate JWT, get tier (BE-04)
    const userContext = await requireAuth(req, { type: 'user' });

    // 5. Tier gate — reject Free tier with 403 (BE-04)
    if (userContext!.tier === 'free') {
      return new Response(
        JSON.stringify({ error: 'elite_required', message: 'Recruiting Lens requires an Elite subscription.' }),
        { status: 403, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }
    const resolvedTier = userContext!.tier as 'pro' | 'elite'; // Safe: Free gated above
    const userId = userContext!.userId;
    const correlation = await beginFeatureRun({
      userId,
      feature: 'recruiting_lens',
      requestId: reqId,
      serverActionKey: typeof body.attemptNonce === 'string' && body.attemptNonce
        ? body.attemptNonce
        : `recruiting-lens:${reqId}`,
      runVariant: body.runVariant === 'rerun' ? 'rerun' : 'standard',
      inputType: typeof body.featureRunToken === 'string' ? 'mixed' : 'text',
      documentCount: typeof body.featureRunToken === 'string' ? 1 : 0,
      featureRunToken: typeof body.featureRunToken === 'string' ? body.featureRunToken : undefined,
    });
    if (!correlation.ok) {
      return new Response(JSON.stringify({ error: correlation.reason }), {
        status: 400,
        headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
      });
    }
    featureRuntime = correlation.runtime;

    // Hard per-tier INPUT cap (quick task 260608-p5k): bound the combined analysis
    // input to getMaxInputChars('recruitingLens', tier) (elite 51,000 chars). The
    // per-field guards above are tighter defaults; this enforces the central ceiling
    // deterministically by trimming the largest fields if the total ever exceeds it.
    // With today's 5,000 + 6,000 + 4,000 field caps this block is unreachable in
    // practice, so the input-trimmed log going silent is expected, not a regression.
    {
      const rclInputCharCap = getMaxInputChars('recruitingLens', resolvedTier as Tier);
      if (rclInputCharCap !== null) {
        let total = resumeSummary.length + jobDescription.length + linkedinText.length;
        if (total > rclInputCharCap) {
          log.info('input-trimmed', { feature: 'recruitingLens', tier: resolvedTier, from: total, to: rclInputCharCap });
          // Trim in priority order (linkedinText, then jobDescription, then resumeSummary).
          for (const field of ['linkedinText', 'jobDescription', 'resumeSummary'] as const) {
            if (total <= rclInputCharCap) break;
            const overflow = total - rclInputCharCap;
            if (field === 'linkedinText' && linkedinText.length) {
              const keep = Math.max(0, linkedinText.length - overflow);
              total -= linkedinText.length - keep;
              linkedinText = linkedinText.slice(0, keep);
            } else if (field === 'jobDescription' && jobDescription.length) {
              const keep = Math.max(0, jobDescription.length - overflow);
              total -= jobDescription.length - keep;
              jobDescription = jobDescription.slice(0, keep);
            } else if (field === 'resumeSummary' && resumeSummary.length) {
              const keep = Math.max(0, resumeSummary.length - overflow);
              total -= resumeSummary.length - keep;
              resumeSummary = resumeSummary.slice(0, keep);
            }
          }
        }
      }
    }

    log.info('request-start', { userId, tier: userContext!.tier, resumeLen: resumeSummary.length, jdLen: jobDescription.length, company, roleTitle });

    // 6. Rate limit
    const rl = await checkRateLimit(userId, userContext!.tier, {
      key: 'recruiting-lens',
      limits: { free: 0, pro: 10, elite: 20 },
    });
    if (!rl.allowed) {
      await featureRuntime?.fail('RATE_LIMITED', 'rate_limit');
      return createRateLimitResponse(rl.retryAfterSeconds!, 'user');
    }

    // === Phase 13 branch (D-06) ===
    // MIG-05: legacy path below is byte-identical until MERIT_SYSTEM_ENABLED flips to true.
    if (MERIT_SYSTEM_ENABLED && userContext) {
      const sanitizedCompany = sanitizeUserContent(company, 'recruiting-lens', log);
      const sanitizedRoleTitle = sanitizeUserContent(roleTitle, 'recruiting-lens', log);
      const sanitizedJD = sanitizeUserContent(jobDescription, 'recruiting-lens', log);
      const sanitizedResume = sanitizeUserContent(resumeSummary, 'recruiting-lens', log);
      const sanitizedLinkedin = linkedinText ? sanitizeUserContent(linkedinText, 'recruiting-lens', log) : undefined;
      const promptJD = `Company name: ${sanitizedCompany}\nRole title: ${sanitizedRoleTitle}\n\nJob description:\n${sanitizedJD}`;
      const cacheKey = await buildRecruitingLensCacheKey({
        userId,
        tier: resolvedTier,
        sanitizedResume,
        sanitizedJD,
        sanitizedLinkedin,
        company: sanitizedCompany,
        roleTitle: sanitizedRoleTitle,
      });
      const supabase = getServiceClient();

      // ── Phase 04 · 04-01 · D-06: shared analysis-lifecycle FIRST ──────────────
      // Attempt the shared executor. It ships DORMANT (ANALYSIS_LIFECYCLE_* flags
      // default OFF → 100% of traffic today), in which case it returns
      // { ok:false, dormant:true } WITHOUT touching Merits/Anthropic/DB and we FALL
      // THROUGH to today's UNCHANGED withMerits merit path below (byte-identical).
      // Only when an operator flips the flags does this path run — adding the
      // threaded edge-derived idempotency key (Pitfall 5), refund-exactly-once /
      // settle-on-saved discipline, and a run_id for frontend refresh recovery.
      //
      // inputIdentity = the order-independent, field-hashed cacheKey (NEVER a
      // save-mutated field, Pitfall 8/D-06); attemptNonce = client per-submit nonce
      // (fail-closed to a fresh UUID so a nonce-less resubmit simply does not dedup).
      const clientAttemptNonce = typeof body.attemptNonce === 'string' && body.attemptNonce
        ? body.attemptNonce
        : null;
      const attemptNonce = clientAttemptNonce ?? crypto.randomUUID();

      // The lifecycle executor above is DORMANT in every environment today, so 100% of
      // traffic falls through to the legacy `withMerits` call below — which used to pass
      // NO idempotency key at all. The frontend has always sent a stable per-submit
      // `attemptNonce` (RecruitingLens.tsx `attemptNonceRef`, deliberately reused across a
      // retry so one intent = one charge), and the legacy path silently dropped it: a
      // resubmit re-entered the gateway with `p_idempotency_key = NULL`, the partial-unique
      // index never engaged, and the user was charged 8 Merits a second time for the same
      // run. Observed live: one double-submit billed 16 Merits against a listed cost of 8.
      //
      // Derive the key here so the legacy path honors the nonce the client already sends.
      // Mirrors grade-linkedin exactly, including the critical rule: derive the key ONLY
      // from a genuinely client-supplied nonce. A server-minted random nonce yields a key
      // that can never repeat — it would guarantee nothing while looking like it guarantees
      // everything — so absent a client nonce we pass `undefined` and get today's
      // (non-idempotent) behavior, honestly.
      const meritIdempotencyKey = clientAttemptNonce
        ? await deriveIdempotencyKey({
            userId,
            feature: 'recruiting_lens',
            tier: resolvedTier,
            inputIdentity: cacheKey,
            attemptNonce: clientAttemptNonce,
          })
        : undefined;

      // Captured out of save() so the byte-preserved response body carries analysisId.
      let lifecycleAnalysisId: string | null = null;

      const lifecycleResult = await runAnalysisLifecycle<
        RecruitingLensOutput,
        { sanitizedResume: string; promptJD: string; sanitizedLinkedin?: string }
      >({
        feature: 'recruiting_lens',
        meritFeature: 'recruiting_lens',
        ctx: { userId, tier: resolvedTier, corsType: 'user' },
        jobType: 'recruiting_lens',
        inputIdentity: cacheKey,
        attemptNonce,
        featureRunId: featureRuntime?.featureRunId,
        extract: () => Promise.resolve({ sanitizedResume, promptJD, sanitizedLinkedin }),
        generate: async (_txId, extracted) => {
          // EXISTING product path — 3-call parallel fan-out + guards + merge + tier
          // shaping. Returns clean serialized JSON so truncation detection never
          // false-positives (RESEARCH Pattern 4). Preserves the all-overloaded and
          // zero-success refundable throws (classifyFailure maps them transient).
          const userPrompt = buildRecruitingLensUserPrompt(extracted.sanitizedResume, extracted.promptJD, extracted.sanitizedLinkedin);
          const promptParams: RecruitingLensPromptParams = {
            tier: resolvedTier,
            currentDate: new Date().toISOString().slice(0, 10),
          };
          const results = await executeParallelCalls({
            model: getModel(resolvedTier as Tier, 'recruiting'),
            promptParams,
            userPrompt,
            tier: resolvedTier,
            log,
            reqId,
            userId,
          });
          const allOverloaded = results.every((r) => !r.ok && isAnthropicOverloaded((r as ParallelCallFailure).status, (r as ParallelCallFailure).error));
          if (allOverloaded) {
            throw new MeritRefundable(529, 'All 3 calls overloaded');
          }
          const successResults = results.filter((r): r is ParallelCallResult => r.ok);
          const failedResults = results.filter((r): r is ParallelCallFailure => !r.ok);
          if (failedResults.length > 0) log.warn('Partial call failures', { failed: failedResults.map((f) => ({ callType: f.callType, error: f.error })) });
          if (successResults.length === 0) {
            throw new MeritRefundable(500, 'All analysis calls failed');
          }
          const { output: merged, warnings } = mergeRecruitingLensResults(
            successResults.map((r) => ({ callType: r.callType, text: r.text })),
            resolvedTier,
          );
          if (warnings.length > 0) log.warn('Merge warnings', { warnings });
          return JSON.stringify(merged);
        },
        schema: recruitingLensOutputSchema,
        save: async (value) => {
          // Durable analysis_results insert (authoritative) — MUST throw on failure so
          // the executor rests in retryable_failed pre-settle (Pitfall 3): Merits are
          // never settled for an unsaved analysis.
          const analysisDate = new Date().toISOString();
          const { data, error } = await supabase.from('analysis_results').insert({
            user_id: userId,
            analysis_type: 'recruiting_lens',
            primary_score: value.overallMatch?.score ?? 0,
            key_insights: [
              value.recruiterVerdict?.slice(0, 200) ?? '',
              value.topGaps?.[0]?.title ?? '',
              value.strategicAdvice?.biggestScoreMover ?? '',
            ],
            // Round-trip rather than cast: RecruitingLensOutput is a declared
            // object type with no index signature, so it is not structurally
            // Json even though every field is JSON-safe. Serializing produces a
            // value that genuinely IS Json for this jsonb column.
            raw_response: JSON.parse(JSON.stringify({
              ...value,
              metadata: {
                jobDescription: sanitizedJD,
                company: sanitizedCompany,
                roleTitle: sanitizedRoleTitle,
                cache_key: cacheKey,
                analysisDate,
                tier: resolvedTier,
              },
            })),
            source_reference: null,
            created_at: analysisDate,
          }).select('id').single();
          if (error || !data?.id) {
            log.error('recruiting-lens-save-failed', { error: error?.message || 'missing id' });
            throw new MeritRefundable(500, 'Could not save Recruiting Lens analysis history.');
          }
          lifecycleAnalysisId = data.id;

          // Best-effort application auto-create (keeps its own non-fatal warn).
          await upsertSavedRecruitingLensJob({
            userId,
            analysisId: data.id,
            company: sanitizedCompany,
            roleTitle: sanitizedRoleTitle,
            sanitizedJD,
            merged: value as unknown as Record<string, unknown>,
            log,
          });

          // Best-effort History cache write (identity excludes any save-mutated field).
          await writeRecruitingLensCache(supabase, {
            cacheKey,
            userId,
            tier: resolvedTier,
            merged: value as unknown as Record<string, unknown>,
            analysisId: data.id,
            sanitizedJD,
            company: sanitizedCompany,
            roleTitle: sanitizedRoleTitle,
          });

          // Post-save usage log — LOG-AND-CONTINUE (Pitfall 2): a usage-write failure
          // must NOT throw after the durable insert (the analysis is saved + about to
          // settle; refund/throw here would be a refund-after-save defect).
          const usageResult = await recordUsageWithAnalysis(userId, 'recruiting_lens', 1, data.id);
          if (!usageResult.ok) {
            log.error('usage-tracking-insert-failed', { error: usageResult.error });
          }
        },
      });

      if (lifecycleResult.ok) {
        // The lifecycle executor owns Merit observation and terminalization for this
        // path; only the provider-attempt back-link remains for the costing ledger.
        await featureRuntime?.flushAiCalls();
        // Byte-preserve the existing { ...merged, analysisId } body; ADD run_id for recovery.
        log.info('Analysis complete (lifecycle)', { score: (lifecycleResult.value as RecruitingLensOutput).overallMatch?.score, runId: lifecycleResult.runId });
        return new Response(JSON.stringify({ ...lifecycleResult.value, analysisId: lifecycleAnalysisId, run_id: lifecycleResult.runId }), {
          status: 200,
          headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
        });
      }
      if (!lifecycleResult.dormant) {
        await featureRuntime?.flushAiCalls();
        // Non-dormant failure: reuse the gateway's structured Response when present
        // (e.g. a merit 402), else surface a generic 500 (code carried for logs only).
        if (lifecycleResult.response) return lifecycleResult.response;
        log.warn('lifecycle-failed', { code: lifecycleResult.code, runId: lifecycleResult.runId });
        return new Response(
          JSON.stringify({ error: 'analysis_failed', message: 'Analysis could not be completed. Please try again.' }),
          { status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
        );
      }
      // dormant:true → the executor is OFF; fall through to today's UNCHANGED merit path.

      const gated = await withMerits(
        {
          userId: userContext!.userId,
          tier: userContext!.tier as 'free' | 'pro' | 'elite',
          corsType: 'user' as const,
          idempotencyKey: meritIdempotencyKey,
        },
        'recruiting_lens',
        async (_txId) => {
          activeMeritTransactionId = _txId;
          await featureRuntime?.observeCharge(_txId);
          // 9. Build user prompt
          const userPrompt = buildRecruitingLensUserPrompt(sanitizedResume, promptJD, sanitizedLinkedin);
          const promptParams: RecruitingLensPromptParams = {
            tier: resolvedTier,
            currentDate: new Date().toISOString().slice(0, 10),
          };

          // 10. Execute 3 parallel calls
          const results = await executeParallelCalls({
            model: getModel(resolvedTier as Tier, 'recruiting'),
            promptParams,
            userPrompt,
            tier: resolvedTier,
            log,
            reqId,
            userId,
          });

          // 11. All overloaded check
          const allOverloaded = results.every((r) => !r.ok && isAnthropicOverloaded((r as ParallelCallFailure).status, (r as ParallelCallFailure).error));
          if (allOverloaded) {
            throw new MeritRefundable(529, 'All 3 calls overloaded');
          }

          // 12. Check for partial failures
          const successResults = results.filter((r): r is ParallelCallResult => r.ok);
          const failedResults = results.filter((r): r is ParallelCallFailure => !r.ok);
          if (failedResults.length > 0) log.warn('Partial call failures', { failed: failedResults.map((f) => ({ callType: f.callType, error: f.error })) });
          if (successResults.length === 0) {
            throw new MeritRefundable(500, 'All analysis calls failed');
          }

          // 13. Merge results
          const { output: merged, warnings } = mergeRecruitingLensResults(
            successResults.map((r) => ({ callType: r.callType, text: r.text })),
            resolvedTier,
          );
          if (warnings.length > 0) log.warn('Merge warnings', { warnings });

          // 22-04 D-18/D-19 Pitfall 2 fix: merit-path bypasses usage_tracking INSERT;
          // this call restores History visibility for Free + Pro + Elite runs. Placed
          // AFTER merge and BEFORE Elite persistence so all tiers are covered. Uses
          // record_ai_usage (not the atomic check_and_record variant) because entitlement
          // is already enforced by withMerits. Non-blocking — a failed insert logs but
          // does NOT fail the user request.
          const analysisId = await persistRecruitingLensResult({
            userId,
            merged,
            sanitizedJD,
            company: sanitizedCompany,
            roleTitle: sanitizedRoleTitle,
            cacheKey,
            tier: resolvedTier,
            log,
            recordUsage: true,
          });

          await writeRecruitingLensCache(supabase, {
            cacheKey,
            userId,
            tier: resolvedTier,
            merged,
            analysisId,
            sanitizedJD,
            company: sanitizedCompany,
            roleTitle: sanitizedRoleTitle,
          });

          return new Response(JSON.stringify({ ...merged, analysisId }), {
            status: 200,
            headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
          });
        },
        {
          precheck_cache: () => readRecruitingLensCache(supabase, {
            cacheKey,
            userId,
            company: sanitizedCompany,
            roleTitle: sanitizedRoleTitle,
            sanitizedJD,
            log,
          }),
        },
      );
      if (!gated.ok) {
        await featureRuntime?.fail('MERIT_GATE_REJECTED', 'authorization');
        return gated.response;
      }
      if (gated.transactionId === 'cache-hit') {
        await featureRuntime?.markCache('analysis_cache');
      } else {
        await featureRuntime?.observeCharge(gated.transactionId);
      }
      await featureRuntime?.complete();
      return gated.value;
    }

    // 7. Usage/credits gate (BE-05)
    const usage = await checkEntitlement(userId, 'recruiting_lens');
    if (!usage.allowed) {
      await featureRuntime?.fail('USAGE_LIMIT_REACHED', 'authorization');
      return createUsageLimitResponse(usage.resetDate, usage.tier, corsHeaders({ type: 'user' }));
    }

    // 8. Prompt sanitization
    const sanitizedCompany = sanitizeUserContent(company, 'recruiting-lens', log);
    const sanitizedRoleTitle = sanitizeUserContent(roleTitle, 'recruiting-lens', log);
    const sanitizedJD = sanitizeUserContent(jobDescription, 'recruiting-lens', log);
    const sanitizedResume = sanitizeUserContent(resumeSummary, 'recruiting-lens', log);
    const sanitizedLinkedin = linkedinText ? sanitizeUserContent(linkedinText, 'recruiting-lens', log) : undefined;
    const promptJD = `Company name: ${sanitizedCompany}\nRole title: ${sanitizedRoleTitle}\n\nJob description:\n${sanitizedJD}`;
    const cacheKey = await buildRecruitingLensCacheKey({
      userId,
      tier: resolvedTier,
      sanitizedResume,
      sanitizedJD,
      sanitizedLinkedin,
      company: sanitizedCompany,
      roleTitle: sanitizedRoleTitle,
    });

    // 9. Build user prompt
    const userPrompt = buildRecruitingLensUserPrompt(sanitizedResume, promptJD, sanitizedLinkedin);
    const promptParams: RecruitingLensPromptParams = {
      tier: resolvedTier,
      currentDate: new Date().toISOString().slice(0, 10),
    };

    // 10. Execute 3 parallel calls
    const results = await executeParallelCalls({
      model: getModel(resolvedTier as Tier, 'recruiting'),
      promptParams,
      userPrompt,
      tier: resolvedTier,
      log,
      reqId,
      userId,
    });

    // 11. Check for all-529 overload — return a synchronous 503.
    // HIST-07 (Phase 36 gap closure): the legacy async-queue fallback was removed. It
    // enqueued `analysis_jobs` rows drained by `process-recruiting-lens-job`, but that
    // worker re-invoked this function with a service-role token while auth here is
    // `requireAuth(type:'user')` — every queued job 401'd and sat unworked with no refund.
    // The path was dead under MERIT_SYSTEM_ENABLED=true (the merit branch above never
    // enqueues), so it is removed rather than wired. Overload now fails fast for retry.
    const allOverloaded = results.every((r) => !r.ok && isAnthropicOverloaded((r as ParallelCallFailure).status, (r as ParallelCallFailure).error));
    if (allOverloaded) {
      log.info('All 3 calls overloaded — returning 503 (async queue path removed, HIST-07)');
      await featureRuntime?.fail('PROVIDER_OVERLOADED', 'provider');
      return new Response(
        JSON.stringify({ error: 'overloaded', message: 'AI service is temporarily overloaded. Please try again in a few minutes.' }),
        { status: 503, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }

    // 12. Check for partial failures — proceed with available results
    const successResults = results.filter((r): r is ParallelCallResult => r.ok);
    const failedResults = results.filter((r): r is ParallelCallFailure => !r.ok);
    if (failedResults.length > 0) {
      log.warn('Partial call failures', { failed: failedResults.map((f) => ({ callType: f.callType, error: f.error })) });
    }
    if (successResults.length === 0) {
      await featureRuntime?.fail('ANALYSIS_FAILED', 'provider');
      return new Response(
        JSON.stringify({ error: 'analysis_failed', message: 'Analysis could not be completed. Please try again.' }),
        { status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }

    // 13. Merge results
    const { output: merged, warnings } = mergeRecruitingLensResults(
      successResults.map((r) => ({ callType: r.callType, text: r.text })),
      resolvedTier,
    );
    if (warnings.length > 0) log.warn('Merge warnings', { warnings });

    // 14. Elite persistence — save to analysis_results (BE-06, D-10, D-11)
    const analysisId = await persistRecruitingLensResult({
      userId,
      merged,
      sanitizedJD,
      company: sanitizedCompany,
      roleTitle: sanitizedRoleTitle,
      cacheKey,
      tier: resolvedTier,
      log,
      recordUsage: true,
    });

    await writeRecruitingLensCache(getServiceClient(), {
      cacheKey,
      userId,
      tier: resolvedTier,
      merged,
      analysisId,
      sanitizedJD,
      company: sanitizedCompany,
      roleTitle: sanitizedRoleTitle,
    });

    // 15. Return JSON response
    await featureRuntime?.complete();
    log.info('Analysis complete', {
      score: merged.overallMatch?.score,
      tier: userContext!.tier,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ ...merged, analysisId }), {
      status: 200,
      headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // 16. Error catch block
    // Thrown Responses from requireAuth (401) propagate unchanged (RUN-04; frozen 401 {error:'Unauthorized'} contract, D-05).
    // return (not throw): this is now a named handler (interview-prep-evaluate idiom), so serve(handler) returns it directly.
    if (err instanceof Response) return err;
    // The Merit gateway owns the refund itself and re-throws with `meritsRefunded`;
    // costing only observes the canonical transaction it already settled.
    if ((err as { meritsRefunded?: boolean })?.meritsRefunded === true && activeMeritTransactionId) {
      await featureRuntime?.observeRefund(activeMeritTransactionId);
    }
    await featureRuntime?.fail('RECRUITING_LENS_REQUEST_FAILED', 'internal');
    // WR-02: pin `error` and `errorCode` to a single canonical code so they cannot silently diverge.
    const ERR = 'internal_error';
    log.error('unhandled-error', { errorCode: ERR, error: (err as Error).message, stack: (err as Error).stack });
    return new Response(
      JSON.stringify({ error: ERR, errorCode: ERR, message: 'An unexpected error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
    );
  }
}

// Only attach serve() when running as an edge function (i.e., not during test import).
// The IS_TEST env var is set by the test harness to avoid starting a real HTTP server.
if ((Deno.env.get('IS_TEST') ?? '').toLowerCase() !== 'true') {
  serve((req) => withCors(req, 'user', () => handler(req)));
}

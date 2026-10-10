import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { checkEntitlement, createUsageLimitResponse, recordUsageWithAnalysis } from '../_shared/usage-checker.ts';
import { invokeAnthropicText } from '../_shared/anthropic.ts';
import { invokeWithRetry } from '../_shared/ai-retry.ts';
import { deriveIdempotencyKey } from '../_shared/idempotency-key.ts';
import { getServiceClient, getSupabaseUrl, getServiceRoleKey } from '../_shared/supabase-client.ts';
import type { Json } from '../_shared/database.types.ts';

/**
 * The model's parsed grade payload. This is JSON by construction (it comes out of
 * parseAiResponse / the schema validator), and it is written verbatim into the
 * `grading_data` jsonb column — so it is typed as a JSON object rather than the
 * looser Record<string, unknown>, which jsonb columns do not accept.
 */
type JsonObject = { [key: string]: Json | undefined };
import { requireAuth } from '../_shared/auth.ts';
import { corsHeaders, handleOptionsRequest, withCors } from '../_shared/cors.ts';
import { checkRateLimit, createRateLimitResponse } from '../_shared/rate-limiter.ts';
import { MERIT_SYSTEM_ENABLED, withMerits, MeritRefundable } from '../_shared/merit-gateway.ts';
import { createLogger } from '../_shared/logger.ts';
import { sanitizeUserContent } from '../_shared/prompt-sanitizer.ts';
import { injectLinkedInRawScore, linkedInSemanticCheck, parseAiResponse, validateLinkedInModelResponse } from './validation.ts';
import { linkedInGradeSchema, type LinkedInGrade } from './schema.ts';
import { runAnalysisLifecycle } from '../_shared/analysis-lifecycle.ts';
import { computeCacheKey, sha256Hex } from '../_shared/cache-fingerprint.ts';
// Named import also triggers registerFeaturePrompts('linkedin', ...) side-effect at module load
import { buildSystemPrompt, buildUserMessage } from './prompts.ts';
import { loadPromptVariant } from '../_shared/tier-prompts.ts';
import { getModel, getTimeout, getMaxOutput, getMaxInputChars } from '../_shared/tier-config.ts';
import type { Tier } from '../_shared/tier-config.ts';
import { beginFeatureRun, type FeatureRunRuntime } from '../_shared/feature-run-runtime.ts';

// Phase 21 D-19: boot-time merit-flag attestation (SC-5 evidence source).
createLogger("grade-linkedin").info("merit-flag", { enabled: MERIT_SYSTEM_ENABLED });

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractLinkedInIdentifier(url: string): string {
  const match = url.match(/linkedin\.com\/(in|profile)\/([^/?]+)/i);
  return match ? match[2] : url;
}

/**
 * ONE total retry budget for the WHOLE request (quick task 260713-2ay).
 *
 * `invokeWithRetry` now retries a 408 (the AbortController timeout) instead of misclassifying
 * it as a permanent 4xx — which is what made the first click fail and the second click work.
 * Retryability without a bound would be unsafe here because `runTieredAiCall` fires a SECOND
 * retry loop on validation failure (3 x 90s x 2 loops = 540s worst case). This deadline is
 * computed ONCE per request and threaded through EVERY loop, so the whole handler — not each
 * loop — is bounded.
 *
 * Budget invariant (all three move together):
 *   client 180_000 (LinkedInGrader.tsx) > server total 165_000 (here) > per-call 90_000
 *   (TIER_TIMEOUTS.*.linkedin). The client must NEVER give up before the server does.
 *
 * Worst case: attempt 1 (90s) -> 408 -> short backoff -> attempt 2 clamped to the ~72s
 * remaining, which still covers the 45-70s p50-p100 generation band.
 */
const LINKEDIN_TOTAL_DEADLINE_MS = 165_000;

/**
 * LIG-07: Per-tier OUTPUT maxTokens for LinkedIn Grader, derived from the central
 * hard caps (quick task 260608-p5k). Pro collapses to Elite. Sourced from getMaxOutput so
 * there is a single source of truth — this feature has NO CALL_CONFIGS fan-out, so its cap
 * is fully DERIVED and changing pricing-config alone changes it here.
 *
 * Live values: free 9000 / pro 9000 / elite 9000 — Phase 02 LOCKED final
 * (02-APPROVED-CAPS.md, 2026-07-27). Free measured a 5774 first-attempt peak (it would
 * truncate at the old 5000, so free CANNOT revert below 9000); elite peaked at 4853 and
 * keeps its pre-TEMP 9000. The prompt shape is unbounded (keyStrengths + 12 per-section
 * arrays uncapped, validator has .min() only), so the near-cap telemetry watch is the
 * safety net; prompt bounding is the deferred durable fix.
 */
const LINKEDIN_MAX_TOKENS: Record<Tier, number> = {
  free: getMaxOutput('linkedinGrader', 'free'),
  pro: getMaxOutput('linkedinGrader', 'pro'),
  elite: getMaxOutput('linkedinGrader', 'elite'),
};

// Phase 08.3: encode the direct 100-point banded rubric so cached bodies from
// earlier section names and maximums can never collide with this validator.
const LINKEDIN_CACHE_VARIANT = 'linkedin-grader:v5.0:100pt-banded';

function responseForLinkedInGrade(result: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify(result),
    { headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
  );
}

function analysisIdFromCachedLinkedInGrade(result: Record<string, unknown>): string | null {
  const metadata = result.metadata as Record<string, unknown> | undefined;
  const analysisId = metadata?.analysis_id ?? metadata?.analysisId ?? result.recordId;
  return typeof analysisId === 'string' && analysisId ? analysisId : null;
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
    }).catch((err) => console.warn('[grade-linkedin] extract webhook failed:', err));
  } catch (err) {
    console.warn('[grade-linkedin] extract webhook threw:', err);
  }
}

async function persistLinkedInAnalysis(
  supabase: ReturnType<typeof getServiceClient>,
  params: {
    userId: string;
    recordId: string;
    profileUrl: string;
    profileIdentifier: string;
    parsed: Record<string, unknown>;
    tier: string;
  },
): Promise<string | null> {
  const { data, error } = await supabase
    .from('analysis_results')
    .insert({
      user_id: params.userId,
      analysis_type: 'linkedin_grading',
      source_reference: params.profileIdentifier,
      primary_score: params.parsed.rawScore as number,
      raw_response: {
        ...params.parsed,
        metadata: {
          ...((params.parsed.metadata as Record<string, unknown> | undefined) ?? {}),
          tier: params.tier,
          profileUrl: params.profileUrl,
          profileIdentifier: params.profileIdentifier,
          linkedinGradeId: params.recordId,
          analysisDate: new Date().toISOString(),
        },
      },
      key_insights: Array.isArray(params.parsed.topFixes)
        ? (params.parsed.topFixes as Json[]).slice(0, 3)
        : [],
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    console.warn('[grade-linkedin] analysis_results insert failed:', error?.message ?? 'missing id');
    return null;
  }

  return data.id as string;
}

async function readLinkedInGradeCache(
  supabase: ReturnType<typeof getServiceClient>,
  params: {
    cacheKey: string;
    tier: Tier;
  },
): Promise<{ cached: Response; analysis_id: string } | null> {
  const { data, error } = await supabase
    .from('analysis_cache')
    .select('raw_response, hit_count')
    .eq('cache_key', params.cacheKey)
    .maybeSingle();

  if (error || !data?.raw_response) return null;

  const rawResponse = data.raw_response as Record<string, unknown>;
  // Validate a cached body through the same strict rubric seam every
  // runtime path uses; a stale/invalid cache entry is treated as a miss (null).
  const validation = validateLinkedInModelResponse(JSON.stringify(rawResponse));
  if (!validation.ok) return null;

  const analysisId = analysisIdFromCachedLinkedInGrade(rawResponse);
  if (!analysisId) return null;

  await supabase
    .from('analysis_cache')
    .update({
      last_hit_at: new Date().toISOString(),
      hit_count: Number(data.hit_count ?? 1) + 1,
    })
    .eq('cache_key', params.cacheKey);

  return {
    cached: responseForLinkedInGrade(rawResponse),
    analysis_id: analysisId,
  };
}

async function writeLinkedInGradeCache(
  supabase: ReturnType<typeof getServiceClient>,
  params: {
    cacheKey: string;
    userId: string;
    tier: Tier;
    result: Record<string, unknown>;
    analysisId: string;
  },
): Promise<void> {
  const rawResponse = {
    ...params.result,
    metadata: {
      ...((params.result.metadata as Record<string, unknown> | undefined) ?? {}),
      analysis_id: params.analysisId,
    },
  };

  const { error } = await supabase
    .from('analysis_cache')
    .upsert({
      cache_key: params.cacheKey,
      feature: 'linkedin_grading',
      tier: params.tier,
      variant: LINKEDIN_CACHE_VARIANT,
      user_id: params.userId,
      raw_response: rawResponse,
      last_hit_at: new Date().toISOString(),
      hit_count: 1,
    }, { onConflict: 'cache_key' });

  if (error) {
    console.warn('[grade-linkedin] cache write failed:', error.message);
  }
}

/**
 * Executes the tier-aware AI call with retry and validation.
 * Used by the lifecycle executor and the withMerits callback.
 * Pitfall 4 mitigation: single helper accepts tier parameter for all code paths.
 */
async function runTieredAiCall(
  tier: Tier,
  userId: string,
  truncatedContent: string,
  profileUrl: string,
  log: ReturnType<typeof createLogger>,
  deadlineAt: number,
  reqId: string,
): Promise<{ parsed: JsonObject; response?: never } | { parsed?: never; response: Response }> {
  const systemPrompt = loadPromptVariant('linkedin', tier, {});
  // 04-04 (Pitfall 8): no follow-up / prior-grade re-injection — every run is
  // scored purely on the current profile state.
  const userMessage = buildUserMessage(truncatedContent, profileUrl || undefined);

  const aiParams = {
    model: getModel(tier, 'linkedin'),
    system: systemPrompt,
    messages: [{ role: 'user' as const, content: userMessage }],
    maxTokens: LINKEDIN_MAX_TOKENS[tier],
    temperature: 0.3,
    // 'linkedin' CallType = 90s (real workload 45-70s). It was 'core' — 50s for Free —
    // i.e. a wall INSIDE the real generation band (quick task 260713-2ay).
    timeoutMs: getTimeout(tier, 'linkedin'),
    fixtureKey: 'grade_linkedin' as const,
    // Phase 02 · TOK-02 — token telemetry label. `tier` is the SERVER-resolved tier
    // (the same value feeding LINKEDIN_MAX_TOKENS above), never a body field or a raw
    // profiles column read: the admin account resolves to elite server-side, so any
    // other source would mislabel every operator elite run as free.
    telemetry: {
      feature: 'linkedin_grader',
      tier,
      callName: 'linkedin-grade',
      reqId,
      userId,
      attempt: 1,
    },
  };

  // BOTH retry loops in this function share the SAME request-scoped deadlineAt. A per-loop
  // budget would let the validation-retry below start a fresh 165s clock.
  const ai = await invokeWithRetry(aiParams, log, { deadlineAt });
  if (!ai.ok) throw new MeritRefundable(ai.status, ai.error);

  // Converge onto the ONE validation source of truth
  // (parse → inject server-computed rawScore → linkedInGradeSchema +
  // linkedInSemanticCheck). Retry-once on ANY validation failure, then a TYPED
  // MeritRefundable (never a fabricated body). No free-tier strip: D-05 collapses
  // Free==Elite (everything-to-everyone), matching the lifecycle reference path.
  let validation = validateLinkedInModelResponse(ai.text);
  if (!validation.ok) {
    log.warn('validation-failed-first-attempt', { code: validation.code, detail: validation.detail, tier });
    // attempt:2 — the validation-retry is a distinct call whose rows must not be
    // averaged into the first-attempt peak when the headroom report reads this cell.
    const retryAi = await invokeWithRetry({ ...aiParams, telemetry: { ...aiParams.telemetry, attempt: 2 } }, log, { deadlineAt });
    if (!retryAi.ok) throw new MeritRefundable(retryAi.status, retryAi.error);
    validation = validateLinkedInModelResponse(retryAi.text);
    if (!validation.ok) {
      log.warn('validation-failed-second-attempt', { code: validation.code, detail: validation.detail, tier });
      throw new MeritRefundable(500, `Validation failed after retry: ${validation.code}`);
    }
  }

  return { parsed: JSON.parse(JSON.stringify(validation.value)) };
}

// ── Main Handler ─────────────────────────────────────────────────────────────

serve((req) => withCors(req, 'user', async () => {
  // 1. Pre-flight
  if (req.method === 'OPTIONS') {
    return handleOptionsRequest({ type: 'user' });
  }

  const reqId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('grade-linkedin', reqId);
  // ONE deadline per REQUEST — threaded into every invokeWithRetry call on every path below,
  // so the sum of all retries across all loops can never outrun the client's 180s budget.
  const deadlineAt = Date.now() + LINKEDIN_TOTAL_DEADLINE_MS;
  let featureRuntime: FeatureRunRuntime | null = null;
  let activeMeritTransactionId: string | null = null;

  try {
    // 3. Auth — userId from JWT only, never from request body
    const userContext = await requireAuth(req, { type: 'user' });
    const userId = userContext!.userId;
    // Costing correlation reads a defensive copy only. A malformed body must keep
    // its existing downstream error shape, so parse failures degrade to no fields.
    const costingBody = await req.clone().json().catch(() => ({} as Record<string, unknown>));
    const correlation = await beginFeatureRun({
      userId,
      feature: 'linkedin_grader',
      requestId: reqId,
      serverActionKey: typeof costingBody.attemptNonce === 'string' && costingBody.attemptNonce
        ? costingBody.attemptNonce
        : `linkedin:${reqId}`,
      runVariant: costingBody.runVariant === 'rerun' ? 'rerun' : 'standard',
      inputType: typeof costingBody.featureRunToken === 'string' ? 'pdf' : 'text',
      documentCount: typeof costingBody.featureRunToken === 'string' ? 1 : 0,
      featureRunToken: typeof costingBody.featureRunToken === 'string'
        ? costingBody.featureRunToken
        : undefined,
    });
    if (!correlation.ok) {
      return new Response(JSON.stringify({ error: correlation.reason }), {
        status: 400,
        headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
      });
    }
    featureRuntime = correlation.runtime;

    // 4. Rate limit
    const rl = await checkRateLimit(userContext!.userId, userContext!.tier, {
      key: 'grade-linkedin',
      limits: { free: 5, pro: 15, elite: 30 },
    });
    if (!rl.allowed) {
      await featureRuntime?.fail('RATE_LIMITED', 'rate_limit');
      return createRateLimitResponse(rl.retryAfterSeconds, 'user');
    }

    // === Phase 13+16 branch: Merit + Tier gating (D-06) ===
    // MIG-05: legacy path below is byte-identical until MERIT_SYSTEM_ENABLED flips to true.
    if (MERIT_SYSTEM_ENABLED && userContext) {
      // CR-01/CR-02: validate inputs BEFORE any merit/tier logic
      const meritBody = await req.clone().json();
      const meritProfileContent: string = (meritBody.profileData?.profileContent || meritBody.profileContent || '');
      const meritProfileUrl: string = (meritBody.profileData?.profileUrl || meritBody.profileUrl || '');

      if (meritProfileContent.length < 50) {
        await featureRuntime?.fail('PROFILE_CONTENT_TOO_SHORT', 'validation');
        return new Response(
          JSON.stringify({ error: 'Profile content must be at least 50 characters' }),
          { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
        );
      }

      // D-08: Resolve tier from userContext (requireAuth already queried profiles.subscription_tier)
      const tier = (userContext.tier as Tier) ?? 'free';
      log.info('tier-resolved', { userId, tier });

      // Prepare content — hard per-tier INPUT cap (quick task 260608-p5k):
      // getMaxInputChars('linkedinGrader', tier) (free 16000 / elite 32000 chars).
      const linkedinInputCharCap = getMaxInputChars('linkedinGrader', tier) ?? 12000;
      let truncatedContent = meritProfileContent;
      if (meritProfileContent.length > linkedinInputCharCap) {
        truncatedContent = meritProfileContent.slice(0, linkedinInputCharCap);
        log.info('input-trimmed', { feature: 'linkedinGrader', tier, from: meritProfileContent.length, to: linkedinInputCharCap });
      }
      truncatedContent = sanitizeUserContent(truncatedContent, 'grade-linkedin', log);

      // ── Stable content identity (Pitfall 8 / T-04-12) ────────────────────────
      // The idempotency/cache identity is a STABLE hash of the sanitized/truncated
      // profileContent + profileUrl ONLY. The prior-grade id (a save-mutated field) is
      // REMOVED entirely: embedding it made every rerun compute a different key,
      // miss cache, and re-anchor on the previous grade. There is also NO follow-up
      // / prior-grade fetch anymore — every run scores the current profile alone.
      const profileContentHash = await sha256Hex(truncatedContent);

      // ── Phase 04 · 04-04 · shared analysis-lifecycle FIRST (D-06) ─────────────
      // Attempt the shared executor behind ANALYSIS_LIFECYCLE_LINKEDIN. It ships
      // DORMANT (ANALYSIS_LIFECYCLE_* flags default OFF → 100% of traffic today),
      // returning { ok:false, dormant:true } WITHOUT touching Merits/Anthropic/DB,
      // in which case we FALL THROUGH to the normal withMerits path below.
      // Dormant traffic is routed HERE (inside the
      // MERIT_SYSTEM_ENABLED-true branch), NOT the MERIT_SYSTEM_ENABLED-off branch,
      // so Merit charging/entitlement is preserved for all traffic on deploy (D-06 /
      // Phase-3 "dormant = zero behavior change"). Only when an operator flips the
      // flags does this path run — threading the edge-derived idempotency key
      // (Pitfall 5), refund-exactly-once / settle-on-saved discipline, and a run_id +
      // recordId for frontend refresh re-hydration.
      //
      // inputIdentity = the STABLE profileContent-hash + url (NEVER a save-mutated
      // field, Pitfall 8/D-06); attemptNonce = client per-submit nonce (04-05),
      // fail-closed to a fresh UUID so a nonce-less resubmit simply does not dedup.
      const attemptNonce = typeof meritBody.attemptNonce === 'string' && meritBody.attemptNonce
        ? meritBody.attemptNonce
        : crypto.randomUUID();
      const linkedInInputIdentity = await sha256Hex(
        JSON.stringify({ profileContent_hash: profileContentHash, profileUrl: meritProfileUrl || '' }),
      );

      // ── D2 (quick task 260713-2ay): idempotency on the LIVE paid path ────────────
      // `withMerits` was called with NO idempotencyKey, so `p_idempotency_key` went to the
      // RPC as NULL and `check_and_deduct_merits` did ZERO deduping: two clicks = two
      // charges, two model calls, two linkedin_grades rows. The client has been minting an
      // attemptNonce per submit all along; it was simply never used on the live path.
      //
      // FAIL CLOSED on a missing nonce. The `attemptNonce` above fail-OPENS to a fresh
      // crypto.randomUUID() (correct for the dormant lifecycle call, which needs SOME nonce).
      // A server-minted random nonce derives a key that can NEVER repeat — it would guarantee
      // nothing while looking like it guarantees everything. So the merit key is derived ONLY
      // from a genuinely client-supplied nonce; absent one we pass `undefined` and get today's
      // (non-idempotent) behavior, honestly.
      const clientAttemptNonce = typeof meritBody.attemptNonce === 'string' && meritBody.attemptNonce
        ? meritBody.attemptNonce
        : null;
      const meritIdempotencyKey = clientAttemptNonce
        ? await deriveIdempotencyKey({
            userId,
            feature: 'linkedin_grading',
            tier,
            inputIdentity: linkedInInputIdentity,
            attemptNonce: clientAttemptNonce,
          })
        : undefined;

      // Captured out of save() so the response body carries the durable
      // linkedin_grades.id — the ?id= refresh re-hydration pointer. NOTE: analysis_jobs
      // has no result_ref/archive_path column, so we do NOT write one; the frontend
      // re-fetches History by this id via the existing ?id= hydration path (04-05).
      let lifecycleGradeId: string | null = null;

      const lifecycleResult = await runAnalysisLifecycle<
        LinkedInGrade,
        { profileContent: string; profileUrl: string }
      >({
        feature: 'linkedin',
        meritFeature: 'linkedin_grading',
        ctx: { userId, tier: tier as 'free' | 'pro' | 'elite', corsType: 'user' },
        jobType: 'linkedin_grading',
        inputIdentity: linkedInInputIdentity,
        attemptNonce,
        featureRunId: featureRuntime?.featureRunId,
        extract: () => Promise.resolve({ profileContent: truncatedContent, profileUrl: meritProfileUrl || '' }),
        generate: async (_txId, extracted) => {
          // EXISTING model call (Haiku 4.5, temp 0.3, per-tier caps). Returns RAW
          // model JSON text — the executor's validateModelOutput(raw, linkedInGradeSchema,
          // {semanticCheck}) does the parse + validation, NOT this closure.
          //
          // The ONE server-side mutation here is MATH-FROM-SECTIONS: the 04-03 prompt
          // forbids the model from emitting an overall total, so linkedInGradeSchema's
          // required rawScore would otherwise be absent. We compute rawScore from the
          // (bounds-clamped, applicable) section scores and inject it before returning —
          // the model never invents the number (FEAT-03), and linkedInSemanticCheck
          // (rawScore === normalizeFromSections) then holds by construction. We clamp
          // each score to [0, CATALOGUE max] here (never the model-declared maxScore —
          // CR-01) to match linkedInGradeSchema's per-section .transform so the injected
          // total matches the post-parse sections the
          // semanticCheck sees. On a hard parse failure we return the raw text and let
          // validateModelOutput reject it (permanent, never a fabricated body).
          const systemPrompt = loadPromptVariant('linkedin', tier, {});
          const userMessage = buildUserMessage(extracted.profileContent, extracted.profileUrl || undefined);
          const ai = await invokeAnthropicText({
            model: getModel(tier, 'linkedin'),
            system: systemPrompt,
            messages: [{ role: 'user' as const, content: userMessage }],
            maxTokens: LINKEDIN_MAX_TOKENS[tier],
            temperature: 0.3,
            // Kept consistent with the live path even though this closure is dormant (D5) —
            // a stale 'core' timeout here would be a trap for whoever enables the flag.
            timeoutMs: getTimeout(tier, 'linkedin'),
            fixtureKey: 'grade_linkedin',
            // TOK-02 label (server-resolved tier). Dormant today, but kept in lockstep
            // with the live path so flipping the flag does not silently drop telemetry.
            telemetry: {
              feature: 'linkedin_grader',
              tier,
              callName: 'linkedin-grade',
              reqId,
              userId,
              attempt: 1,
            },
          });
          if (!ai.ok) {
            // Plain status-bearing Error (NOT MeritRefundable — the executor owns the
            // refund boundary; classifyFailure reads .status to split transient/permanent).
            const e = new Error(ai.error) as Error & { status: number };
            e.status = ai.status;
            throw e;
          }
          let parsed: Record<string, unknown> | null = null;
          try { parsed = parseAiResponse(ai.text) as Record<string, unknown>; } catch { parsed = null; }
          if (!parsed || !Array.isArray(parsed.sectionBreakdown)) {
            return ai.text; // let validateModelOutput reject (permanent, no fabrication)
          }
          // 04-GAP-01: shared math-from-sections injection — the SAME seam the
          // legacy/fallback paths use via validateLinkedInModelResponse.
          injectLinkedInRawScore(parsed);
          return JSON.stringify(parsed);
        },
        schema: linkedInGradeSchema,
        validationOpts: { semanticCheck: linkedInSemanticCheck },
        save: async (value) => {
          // AUTHORITATIVE durable write — the linkedin_grades insert. MUST THROW on
          // failure so the executor rests in retryable_failed pre-settle (Pitfall 3):
          // Merits are never settled for an unsaved grade. Everything AFTER the insert
          // is POST-saving best-effort log-and-continue (Pitfall 2) — no throw past
          // this line. RATIONALE (04-04): there is no throw-after-save bug in the
          // legacy code to hunt; the ONE real structural risk was persistLinkedInAnalysis
          // RETURNING NULL — under save() the linkedin_grades insert is the sole
          // authoritative throw-point and the analysis_results mirror is best-effort
          // (null → LOG only, never throw).
          const profileIdentifier = extractLinkedInIdentifier(meritProfileUrl || `paste-${userId}`);
          const { data: record, error: insertError } = await getServiceClient()
            .from('linkedin_grades')
            .insert({
              user_id: userId,
              profile_url: meritProfileUrl || 'pasted-content',
              profile_identifier: profileIdentifier,
              overall_score: value.rawScore,
              grading_data: value,
            })
            .select('id')
            .single();
          if (insertError || !record?.id) {
            log.error('db-insert-failed', { error: String(insertError?.message || 'missing id') });
            throw new Error('Could not save LinkedIn grade history.');
          }
          lifecycleGradeId = record.id;

          // POST-SAVING best-effort: analysis_results mirror (null → LOG only).
          const analysisId = await persistLinkedInAnalysis(getServiceClient(), {
            userId,
            recordId: record.id,
            profileUrl: meritProfileUrl || 'pasted-content',
            profileIdentifier,
            parsed: value as unknown as Record<string, unknown>,
            tier,
          });
          triggerExtractWebhook(analysisId, 'linkedin_grading');

          // POST-SAVING best-effort: usage log (History visibility). LOG-AND-CONTINUE.
          const usageResult = await recordUsageWithAnalysis(userId, 'linkedin_grading', 1, record.id);
          if (!usageResult.ok) {
            log.error('usage-tracking-insert-failed', { error: usageResult.error });
          }

          // POST-SAVING best-effort: fire-and-forget email.
          const { data: profile } = await getServiceClient()
            .from('profiles')
            .select('email, full_name')
            .eq('id', userId)
            .single();
          if (profile?.email) {
            const APP_URL = Deno.env.get('APP_URL') || 'https://strivoai.net';
            fetch(`${getSupabaseUrl()}/functions/v1/send-feature-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getServiceRoleKey()}`, 'x-internal-job-secret': Deno.env.get('INTERNAL_JOB_SECRET') || '' },
              body: JSON.stringify({ to: profile.email, userName: profile.full_name || undefined, featureType: 'linkedin', score: value.rawScore, resultsUrl: `${APP_URL}/linkedin-grader?id=${record.id}`, recordId: record.id, recordTable: 'linkedin_grades' }),
            }).catch(err => log.error('email-trigger-failed', { error: String(err) }));
          }
        },
      });

      if (lifecycleResult.ok) {
        // The lifecycle executor owns Merit observation and terminalization for this
        // path; only the provider-attempt back-link remains for the costing ledger.
        await featureRuntime?.flushAiCalls();
        // Byte-preserve the { ...grade } body; ADD run_id (tracking) + recordId (?id= rehydration).
        log.info('request-complete (lifecycle)',{ score: lifecycleResult.value.rawScore, runId: lifecycleResult.runId, recordId: lifecycleGradeId });
        return new Response(
          JSON.stringify({ ...lifecycleResult.value, run_id: lifecycleResult.runId, recordId: lifecycleGradeId }),
          { headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
        );
      }
      if (!lifecycleResult.dormant) {
        await featureRuntime?.flushAiCalls();
        // Non-dormant failure: reuse the gateway's structured Response when present
        // (e.g. a merit 402); else surface a generic 500 (code carried for logs only).
        if (lifecycleResult.response) return lifecycleResult.response;
        log.warn('lifecycle-failed', { code: lifecycleResult.code, runId: lifecycleResult.runId });
        return new Response(
          JSON.stringify({ error: 'Failed to generate valid LinkedIn grade. Please try again.', code: lifecycleResult.code }),
          { status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
        );
      }
      // dormant:true → the executor is OFF; fall through to the normal
      // withMerits path below.

      // ── Dormant-fallback cache identity: stable profileContent hash + url only.
      //    the prior-grade id is REMOVED here too (Pitfall 8 / T-04-12). ──
      const linkedInCacheKey = await computeCacheKey({
        user_id: userId,
        feature: 'linkedin_grading',
        tier,
        variant: LINKEDIN_CACHE_VARIANT,
        inputs: {
          profileContent_hash: profileContentHash,
          profileUrl: meritProfileUrl || '',
        },
      });

      // Helper: store result and fire email
      const storeAndNotify = async (parsed: JsonObject): Promise<{ response: Response; recordId: string; analysisId: string | null }> => {
        const profileIdentifier = extractLinkedInIdentifier(meritProfileUrl || `paste-${userId}`);
        const { data: record, error: insertError } = await getServiceClient()
          .from('linkedin_grades')
          .insert({
            user_id: userId,
            profile_url: meritProfileUrl || 'pasted-content',
            profile_identifier: profileIdentifier,
            overall_score: parsed.rawScore as number,
            grading_data: parsed,
          })
          .select('id')
          .single();
        if (insertError || !record?.id) {
          log.error('db-insert-failed', { error: String(insertError?.message || 'missing id') });
          throw new MeritRefundable(500, 'Could not save LinkedIn grade history.');
        }

        const analysisId = await persistLinkedInAnalysis(getServiceClient(), {
          userId,
          recordId: record.id,
          profileUrl: meritProfileUrl || 'pasted-content',
          profileIdentifier,
          parsed,
          tier,
        });
        triggerExtractWebhook(analysisId, 'linkedin_grading');

        // Fire-and-forget email
        if (record?.id) {
          const { data: profile } = await getServiceClient()
            .from('profiles')
            .select('email, full_name')
            .eq('id', userId)
            .single();
          if (profile?.email) {
            const APP_URL = Deno.env.get('APP_URL') || 'https://strivoai.net';
            fetch(`${getSupabaseUrl()}/functions/v1/send-feature-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getServiceRoleKey()}`, 'x-internal-job-secret': Deno.env.get('INTERNAL_JOB_SECRET') || '' },
              body: JSON.stringify({ to: profile.email, userName: profile.full_name || undefined, featureType: 'linkedin', score: parsed.rawScore as number, resultsUrl: `${APP_URL}/linkedin-grader?id=${record.id}`, recordId: record.id, recordTable: 'linkedin_grades' }),
            }).catch(err => log.error('email-trigger-failed', { error: String(err) }));
          }
        }

        const response = new Response(
          JSON.stringify(parsed),
          { headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
        );
        return { response, recordId: record.id, analysisId };
      };

      // Every LinkedIn analysis follows the normal Merit gateway. Legitimate
      // Free-tier balances and configured feature costs are enforced here too.
      const gated = await withMerits(
        {
          userId,
          tier: tier as 'free' | 'pro' | 'elite',
          corsType: 'user' as const,
          // A repeated attemptNonce re-derives the SAME key → the RPC replays
          // `already_deducted` → exactly one charge, one model call, one grade row.
          idempotencyKey: meritIdempotencyKey,
        },
        'linkedin_grading',
        async (_txId) => {
          activeMeritTransactionId = _txId;
          await featureRuntime?.observeCharge(_txId);
          const result = await runTieredAiCall(tier, userId, truncatedContent, meritProfileUrl, log, deadlineAt, reqId);
          if (result.response) return result.response;

          const stored = await storeAndNotify(result.parsed);
          const usageResult = await recordUsageWithAnalysis(userId, 'linkedin_grading', 1, stored.recordId);
          if (!usageResult.ok) {
            // The grade row is already durable and emailed, so a usage-write
            // failure must not refund the Merit or 500 a delivered analysis.
            log.error('usage-tracking-insert-failed', { error: usageResult.error });
          }

          await writeLinkedInGradeCache(getServiceClient(), {
            cacheKey: linkedInCacheKey,
            userId,
            tier,
            result: result.parsed,
            analysisId: stored.analysisId ?? stored.recordId,
          });

          return stored.response;
        },
        {
          precheck_cache: () => readLinkedInGradeCache(getServiceClient(), {
            cacheKey: linkedInCacheKey,
            tier,
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

    // 5. Parse body — userId comes from JWT only (auth bypass fix)
    const body = await req.json();
    const profileContent: string = (
      body.profileData?.profileContent || body.profileContent || ''
    );
    const profileUrl: string = (
      body.profileData?.profileUrl || body.profileUrl || ''
    );
    const resolvedTier = (userContext!.tier as Tier) ?? 'free';

    if (profileContent.length < 50) {
      await featureRuntime?.fail('PROFILE_CONTENT_TOO_SHORT', 'validation');
      return new Response(
        JSON.stringify({ error: 'Profile content must be at least 50 characters' }),
        { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }

    // Hard per-tier INPUT cap (quick task 260608-p5k):
    // getMaxInputChars('linkedinGrader', tier) (free 16000 / elite 32000 chars).
    const linkedinInputCharCap = getMaxInputChars('linkedinGrader', resolvedTier) ?? 12000;
    let truncatedContent = profileContent;
    if (profileContent.length > linkedinInputCharCap) {
      truncatedContent = profileContent.slice(0, linkedinInputCharCap);
      log.info('input-trimmed', { feature: 'linkedinGrader', tier: resolvedTier, original: profileContent.length, truncated: linkedinInputCharCap });
    }

    // Sanitize profile content to strip prompt injection phrases
    truncatedContent = sanitizeUserContent(truncatedContent, 'grade-linkedin', log);

    // 6. Every request uses the normal entitlement gate. Usage is recorded
    // after the linkedin_grades row persists.
    const usageCheck = await checkEntitlement(userId, 'linkedin_grading');
    if (!usageCheck.allowed) {
      await featureRuntime?.fail('USAGE_LIMIT_REACHED', 'authorization');
      return createUsageLimitResponse(
        usageCheck.resetDate,
        usageCheck.tier,
        corsHeaders({ type: 'user' }),
      );
    }

    // 7. Build prompt — 04-04 (Pitfall 8): no follow-up / prior-grade re-injection.
    // Every run is scored purely on the current profile state (no previousGrade fetch).
    const systemPrompt = buildSystemPrompt();
    const userMessage = buildUserMessage(truncatedContent, profileUrl || undefined);

    log.info('request-start', { userId, profileLen: truncatedContent.length });

    // 9. AI call with deadline-bounded retry (408 IS retried — quick task 260713-2ay).
    // This legacy MERIT_SYSTEM_ENABLED=false path is unreachable in production, but it carried
    // the IDENTICAL bug (a hardcoded 60s wall + a non-retryable 408) and must not be left as a
    // trap for whoever flips the flag back.
    const ai = await invokeWithRetry({
      model: 'claude-haiku-4-5-20251001',
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: LINKEDIN_MAX_TOKENS[resolvedTier],
      temperature: 0.3,
      timeoutMs: getTimeout(resolvedTier, 'linkedin'),
      fixtureKey: 'grade_linkedin',
      telemetry: {
        feature: 'linkedin_grader',
        tier: resolvedTier,
        callName: 'linkedin-grade',
        reqId,
        userId,
        attempt: 1,
      },
    }, log, { deadlineAt });

    if (!ai.ok) {
      await featureRuntime?.flushAiCalls();
      if (ai.status === 529) {
        await featureRuntime?.fail('PROVIDER_OVERLOADED', 'provider');
        return new Response(
          JSON.stringify({ error: 'Service temporarily busy, please try again.' }),
          { status: 503, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
        );
      }
      if (ai.status === 429) {
        await featureRuntime?.fail('PROVIDER_RATE_LIMITED', 'provider');
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
        );
      }
      if (ai.status === 402) {
        await featureRuntime?.fail('PROVIDER_CREDITS_DEPLETED', 'provider');
        return new Response(
          JSON.stringify({ error: 'AI credits depleted. Please add more credits to continue.' }),
          { status: 402, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`AI gateway error: ${ai.status}`);
    }

    // 10. Parse + validate — the SAME strict source of truth every
    // runtime path uses (parse → inject server-computed rawScore → linkedInGradeSchema
    // + linkedInSemanticCheck). Retry the AI call once on ANY validation failure,
    // then surface a TYPED 500 — never a fabricated body.
    let validation = validateLinkedInModelResponse(ai.text);

    if (!validation.ok) {
      log.warn('validation-failed-first-attempt', { code: validation.code, detail: validation.detail });

      // Same request-scoped deadlineAt — the validation-retry does NOT get a fresh budget.
      const retryAi = await invokeWithRetry({
        model: 'claude-haiku-4-5-20251001',
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: LINKEDIN_MAX_TOKENS[resolvedTier],
        temperature: 0.3,
        timeoutMs: getTimeout(resolvedTier, 'linkedin'),
        fixtureKey: 'grade_linkedin',
        telemetry: {
          feature: 'linkedin_grader',
          tier: resolvedTier,
          callName: 'linkedin-grade',
          reqId,
          userId,
          attempt: 2,
        },
      }, log, { deadlineAt });

      if (!retryAi.ok) {
        log.error('retry-ai-failed', { status: retryAi.status, error: retryAi.error });
        await featureRuntime?.fail('VALIDATION_RETRY_FAILED', 'provider');
        return new Response(
          JSON.stringify({ error: 'Failed to generate valid LinkedIn grade. Please try again.' }),
          { status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
        );
      }

      validation = validateLinkedInModelResponse(retryAi.text);
      if (!validation.ok) {
        log.error('validation-failed-second-attempt', { code: validation.code, detail: validation.detail });
        await featureRuntime?.fail('MODEL_OUTPUT_INVALID', 'parsing');
        return new Response(
          JSON.stringify({ error: 'Failed to generate valid LinkedIn grade. Please try again.' }),
          { status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
        );
      }
    }

    // Round-trip rather than cast: the validator returns a Zod-inferred object,
    // which has no index signature and so is not structurally Json. Serializing
    // produces a value that genuinely IS Json (same pattern as analyze-career),
    // which is what the `grading_data` jsonb column requires.
    const parsed: JsonObject = JSON.parse(JSON.stringify(validation.value));

    // 11. Store result — single insert (fixes duplicate insert bug)
    const profileIdentifier = extractLinkedInIdentifier(profileUrl || `paste-${userId}`);

    const { data: record, error: insertError } = await getServiceClient()
      .from('linkedin_grades')
      .insert({
        user_id: userId,
        profile_url: profileUrl || 'pasted-content',
        profile_identifier: profileIdentifier,
        overall_score: parsed.rawScore as number,
        grading_data: parsed,
      })
      .select('id')
      .single();

    if (insertError || !record?.id) {
      log.error('db-insert-failed', { error: String(insertError?.message || 'missing id') });
      await featureRuntime?.fail('GRADE_SAVE_FAILED', 'persistence');
      return new Response(
        JSON.stringify({ error: 'Could not save LinkedIn grade history.' }),
        { status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }

    const analysisId = await persistLinkedInAnalysis(getServiceClient(), {
      userId,
      recordId: record.id,
      profileUrl: profileUrl || 'pasted-content',
      profileIdentifier,
      parsed: parsed as Record<string, unknown>,
      tier: resolvedTier,
    });
    triggerExtractWebhook(analysisId, 'linkedin_grading');

    const usageResult = await recordUsageWithAnalysis(userId, 'linkedin_grading', 1, record.id);
    if (!usageResult.ok) {
      // Fix 2 (SEC-13) post-save log-and-continue: the grade row is already saved +
      // persistLinkedInAnalysis + triggerExtractWebhook have fired, so a usage-write
      // failure must NOT 500 an already-delivered analysis. Log the reason and fall
      // through to the saved success response (email block + return parsed below).
      log.error('usage-tracking-insert-failed', { error: usageResult.error });
    }

    // 12. Fire-and-forget email notification
    if (record.id) {
      const { data: profile } = await getServiceClient()
        .from('profiles')
        .select('email, full_name')
        .eq('id', userId)
        .single();

      if (profile?.email) {
        const APP_URL = Deno.env.get('APP_URL') || 'https://strivoai.net';
        fetch(`${getSupabaseUrl()}/functions/v1/send-feature-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getServiceRoleKey()}`,
            'x-internal-job-secret': Deno.env.get('INTERNAL_JOB_SECRET') || '',
          },
          body: JSON.stringify({
            to: profile.email,
            userName: profile.full_name || undefined,
            featureType: 'linkedin',
            score: (parsed as Record<string, unknown>).rawScore as number,
            resultsUrl: `${APP_URL}/linkedin-grader?id=${record.id}`,
            summaryLine: ((parsed as Record<string, unknown>).scoreJustification as string)?.slice(0, 200) || undefined,
            recordId: record.id,
            recordTable: 'linkedin_grades',
          }),
        }).catch(err => log.error('email-trigger-failed', { error: String(err) }));
      }
    }

    log.info('request-complete', { score: (parsed as Record<string, unknown>).rawScore, recordId: record?.id });
    await featureRuntime?.complete();

    // 13. Return result
    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    // 14. Error handling — re-throw Response objects (from requireAuth)
    if (error instanceof Response) throw error;

    const errorMessage = error instanceof Error ? error.message : 'Internal server error';

    // D3 (quick task 260713-2ay): tell the client the TRUTH about what happened.
    // (a) HONEST STATUS — a MeritRefundable(408, …) is a TIMEOUT, not a 500. Flattening every
    //     failure to 500 is why the client always showed the generic "server error" toast and
    //     the TIMED_OUT copy was unreachable.
    // (b) HONEST REFUND — merit-gateway attaches `meritsRefunded` only when refund_merits
    //     actually SUCCEEDED. Without this the UI claimed "your Merits were refunded" on every
    //     error, including the ones where nothing was refunded.
    const status = typeof (error as { status?: number })?.status === 'number'
      ? (error as { status: number }).status
      : 500;
    const meritsRefunded = (error as { meritsRefunded?: boolean })?.meritsRefunded === true;

    if (meritsRefunded && activeMeritTransactionId) {
      await featureRuntime?.observeRefund(activeMeritTransactionId);
    }
    await featureRuntime?.fail('LINKEDIN_REQUEST_FAILED', status === 408 ? 'timeout' : 'internal');

    log.error('request-failed', { error: errorMessage, status, meritsRefunded });
    return new Response(
      JSON.stringify({ error: errorMessage, merits_refunded: meritsRefunded }),
      { status, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
    );
  }
}));

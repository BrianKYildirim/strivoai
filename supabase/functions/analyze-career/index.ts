import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, getSupabaseUrl, getServiceRoleKey } from '../_shared/supabase-client.ts';
import { extractPDFTextWithMetadata } from '../_shared/pdf-parser.ts';
// 260713-hrd: the legacy entitlement helpers are deliberately NOT imported from usage-checker.
// Merits are the only paywall for Career Compass. We still RECORD usage (never block on it).
import { recordUsageWithAnalysis } from '../_shared/usage-checker.ts';
import { invokeAnthropicText } from '../_shared/anthropic.ts';
import { repairTruncatedJSON, repairTruncatedJSONChecked, describeBufferShape } from '../_shared/json-repair.ts';
import { createLogger } from '../_shared/logger.ts';
import { requireInternalOrUserAuth, resolveTierForUserId } from '../_shared/auth.ts';
import { invokeWithRetry } from '../_shared/ai-retry.ts';
import { corsHeaders, handleOptionsRequest, withCors } from '../_shared/cors.ts';
import { checkRateLimit, createRateLimitResponse } from '../_shared/rate-limiter.ts';
import { MERIT_SYSTEM_ENABLED, withMerits, MeritRefundable, refundMeritsForJob } from '../_shared/merit-gateway.ts';
import { loadPromptVariant } from '../_shared/tier-prompts.ts';
import '../_shared/career-prompts.ts'; // side-effect: registers 'career' feature
import { applyCareerTierShape } from '../_shared/result-merger.ts';
import { TIER_MAX_TOKENS, getModel, getTimeout, getMaxOutput, getMaxInputChars, type Tier } from '../_shared/tier-config.ts';
import { buildCareerGrowthPrompt, buildEliteExtrasPrompt, buildFreePriorAnalysesPrompt, FREE_SINGLE_CALL_MAX_TOKENS, type CareerPromptParams } from '../_shared/career-prompts.ts';
import { computeCacheKey, sha256Hex } from '../_shared/cache-fingerprint.ts';
import { assessExtractionQuality } from '../_shared/document-quality.ts';
import { persistAcceptedExtraction } from '../_shared/document-persistence.ts';
import { sanitizeUserContent } from '../_shared/prompt-sanitizer.ts';
import { runAnalysisLifecycle } from '../_shared/analysis-lifecycle.ts';
import { deriveIdempotencyKey } from '../_shared/idempotency-key.ts';
import { isAnalysisFeatureEnabled } from '../_shared/analysis-flags.ts';
import { careerCompassSchema, careerSemanticCheck } from '../_shared/career-validation.ts';
import { getCareerOutputSchema } from '../_shared/career-output-schema.ts';
import { beginFeatureRun, type FeatureRunRuntime } from '../_shared/feature-run-runtime.ts';

// Phase 21 D-19: boot-time merit-flag attestation (SC-5 evidence source).
createLogger("analyze-career").info("merit-flag", { enabled: MERIT_SYSTEM_ENABLED });

const FUNCTION_VERSION = 'career-overload-patch-2026-02-25';

/**
 * ONE request-scoped deadline that bounds EVERY retry in the handler (quick task
 * 260713-hrd, reusing the proven 260713-2ay ladder verbatim).
 *
 * Wiring the real per-tier output budget (TEMP Phase 02: free 9000 / elite 19000) makes
 * generations materially longer than the truncated 2 500-token stubs they replace. Under
 * the OLD wall — Free read `core`, i.e. 50 000 ms — a bigger generation would abort
 * mid-flight and surface as a 408. That is precisely the LinkedIn Grader bug quick task
 * 260713-2ay just fixed. The budget and the wall therefore move TOGETHER:
 *
 *   per-call 90_000 (TIER_TIMEOUTS.*.career)
 *     < server total 165_000 (here — bounds the whole retry loop, not each attempt)
 *       < client poll 180_000 (CareerCompass.tsx MAX_POLL_MS)
 *
 * The client must NEVER give up before the server does. If you change one of these three,
 * change all three.
 */
const CAREER_TOTAL_DEADLINE_MS = 165_000;

function isAnthropicOverloaded(status?: number, errorText?: string) {
  return status === 529 || (errorText || '').toLowerCase().includes('overloaded');
}

function computeBackoffMs(attempt: number) {
  const base = Math.min(3000, 1000 * (2 ** (attempt - 1)));
  const jitter = Math.floor(Math.random() * 400);
  return base + jitter;
}

// ── Career parallel execution types ────────────────────────────────────────
type CareerCallType = 'base' | 'growth' | 'elite-extras';

interface CareerParallelResult {
  callType: CareerCallType;
  ok: true;
  text: string;
  durationMs: number;
  /** The raw Anthropic response — carries stop_reason, so truncation is detectable here too (260713-hrd). */
  raw?: unknown;
}
interface CareerParallelFailure {
  callType: CareerCallType;
  ok: false;
  error: string;
  status?: number;
  durationMs: number;
}
type CareerParallelResultUnion = CareerParallelResult | CareerParallelFailure;

// Hard per-tier caps (quick task 260608-p5k): the elite OUTPUT sum is bounded by
// getMaxOutput('careerCompass','elite'). Pro = Elite (collapsed by normalizeActiveTier;
// never read here). Free uses the single base call.
//
// 260713-hrd: Free right-sized 12000 -> 4800 to TRACK the pricing-config ceiling.
// This is MANDATORY, not cosmetic: the boot invariant immediately below compares the
// per-tier sum against getMaxOutput and THROWS AT MODULE LOAD if it exceeds it — so a
// pricing-config drop without this drop kills the function on deploy. Read [PERF] out=
// from a real run before re-tuning either number; they move together.
//
// FINAL (Phase 02 plan 02-09 — 02-APPROVED-CAPS.md, LOCKED 2026-07-27, operator approved
// 15/15 as proposed; sizing rule max(ceil(peak x 1.4), pre-TEMP value)):
//   Free  base 4800 (KEEP — measured first-attempt peak 2935)  == ceiling 4800
//   Elite base 5000 (peak 3523 — MUST sit above the 4500 that truncated on 2026-07-17,
//         out=4500/outLen=17286 -> terminal 422 output_truncated -> Merit refund)
//       + growth 4000 (peak 2798) + elite-extras 2000 (KEEP — peak 983) = 11000 == ceiling
//   Every call <= ABSOLUTE_MAX_TOKENS 12000; Pro mirrors Elite (prompts don't tier-branch).
// Brevity ratios re-verified against the FINAL ceilings: free 2200*1.8=3960 <= 4800;
// pro/elite 4500*1.8=8100 <= 11000. CAREER_BREVITY_TARGET_TOKENS unchanged — it is a
// prompt-shape lever and prompt work stayed out of Phase 02 scope.
const CAREER_CALL_CONFIGS: Array<{ callType: CareerCallType; maxTokensFree: number; maxTokensPro: number; maxTokensElite: number }> = [
  { callType: 'base',          maxTokensFree: 4800, maxTokensPro: 5000, maxTokensElite: 5000 }, // Phase 02 LOCKED — free keep (peak 2935); pro/elite peak 3523 x 1.4
  { callType: 'growth',        maxTokensFree: 0,    maxTokensPro: 4000, maxTokensElite: 4000 }, // Phase 02 LOCKED — peak 2798 x 1.4
  { callType: 'elite-extras',  maxTokensFree: 0,    maxTokensPro: 2000, maxTokensElite: 2000 }, // Phase 02 LOCKED — keep (peak 983)
];

/**
 * What a COMPLETE report actually costs to write — NOT a fraction of the cap (260713-hrd).
 *
 * This is the number the prompt quotes to the model ("keep the ENTIRE response under N
 * tokens"). It must track the size of the schema we ask for, because the model writes TO
 * this number. Deriving it from the cap (it used to be `cap * 0.8`) tells the model to fill
 * the guardrail, and it then overshoots it — a real Elite run truncated at 87s that way.
 *
 * Grounded in observed COMPLETE outputs: every healthy Elite report on record is
 * 9 008-12 476 chars, i.e. ~2 600-3 600 output tokens. Free's scope is materially narrower
 * (no roadmap / roleRoadmaps / skillGaps / compensationIntelligence).
 *
 * The invariant below enforces the thing that actually matters: the cap must sit WELL above
 * the target, so a model that overshoots its instruction still lands inside the cap.
 */
const CAREER_BREVITY_TARGET_TOKENS: Record<'free' | 'pro' | 'elite', number> = {
  free:  2200,
  pro:   4500,
  elite: 4500,
};

/** The cap must be at least this multiple of the target, or an overshoot truncates. */
const CAREER_MIN_CAP_TO_TARGET_RATIO = 1.8;

// Boot-time invariant (quick task 260608-p5k): per-tier budgets must not exceed
// the central getMaxOutput ceiling. Free/Elite are the only active tiers; Pro is
// checked against the Elite ceiling (collapsed by the accessor).
for (const tier of ['free', 'pro', 'elite'] as const) {
  const key = `maxTokens${tier[0].toUpperCase() + tier.slice(1)}` as 'maxTokensFree' | 'maxTokensPro' | 'maxTokensElite';
  const sum = CAREER_CALL_CONFIGS.reduce((acc, cfg) => acc + cfg[key], 0);
  const ceiling = getMaxOutput('careerCompass', tier);
  if (sum > ceiling) {
    throw new Error(`[analyze-career] CAREER_CALL_CONFIGS sum ${sum} exceeds getMaxOutput('careerCompass','${tier}') (${ceiling})`);
  }

  // 260713-hrd: the cap must leave the model room to overshoot its brevity instruction.
  // Without this, someone can "helpfully" raise the target to the cap and silently
  // reintroduce the truncation this invariant exists to prevent.
  const target = CAREER_BREVITY_TARGET_TOKENS[tier];
  if (target * CAREER_MIN_CAP_TO_TARGET_RATIO > ceiling) {
    throw new Error(
      `[analyze-career] brevity target ${target} for '${tier}' leaves too little headroom under the ` +
      `${ceiling}-token cap (need >= ${CAREER_MIN_CAP_TO_TARGET_RATIO}x). A cap is a guardrail, not a target.`,
    );
  }
}

/** Per-tier Merit cost for career compass. Spec S4.3: Free=3, Pro=2 (encourages subscription), Elite=3. */
const MERIT_COST: Record<string, number> = { free: 3, pro: 2, elite: 3 };

/**
 * The sections a Career Compass result must actually contain to BE a result.
 *
 * 260713-hrd added `careerDNA` (a Free result without Career DNA is not a Free result)
 * and `skillGaps` (an Elite result without a skills-gap analysis is not an Elite result).
 * Both were missing, which is part of why a truncated stub passed for a success.
 */
/**
 * Surprise Fits is contractually 2-3 items (locked operator decision, 260713-hrd).
 * MIN is a completeness gate (a 1-item section is INCOMPLETE and must not persist as a
 * success); MAX is a trim applied to the generated output. Free is separately sliced to 2 by
 * `applyCareerTierShape`, which is inside [MIN, MAX] and therefore unaffected.
 */
// Operator decision (release-readiness audit, 2026-07-15): lowered from 2 to 1.
// Real Anthropic output reliably under-produces cross-domain Surprise Fits under the tier
// token budget — a genuine >=75%-readiness surprise fit is genuinely scarce for many
// resumes. The prior floor of 2 made a COMPLETE, useful report with 1 strong Surprise Fit
// fail the completeness gate, 422, refund, and force the user to press Analyze again. That
// traded a good report for a worse experience. The prompt still asks the model to AIM for
// 2-3 (see career-prompts.ts); 1 is now an acceptable fallback rather than a hard failure.
// MAX stays 3 (capCareerSurpriseFits trims overflow). Deliberately NO automatic second
// Anthropic call to manufacture another fit: one user action = one analysis = at most one
// Merit charge = one saved result.
const CAREER_SURPRISE_FITS_MIN = 1;
const CAREER_SURPRISE_FITS_MAX = 3;

/** Trim an over-long Surprise Fits list to the contractual maximum. Never pads. */
function capCareerSurpriseFits(data: Record<string, unknown>): void {
  if (Array.isArray(data.surpriseFits) && data.surpriseFits.length > CAREER_SURPRISE_FITS_MAX) {
    data.surpriseFits = (data.surpriseFits as unknown[]).slice(0, CAREER_SURPRISE_FITS_MAX);
  }
}

const CAREER_CORE_SECTION_CHECKS = [
  { key: 'careerDNA', label: 'Career DNA', present: (data: Record<string, unknown>) => typeof data.careerDNA === 'string' && data.careerDNA.trim().length > 0 },
  { key: 'bestFitRoles', label: 'Best-Fit Roles', present: (data: Record<string, unknown>) => hasNonEmptyArray(data.careerFields) },
  // 260713-hrd: Surprise Fits carries a COUNT floor, not just a presence check. The locked
  // product contract is minimum 2, maximum 3 — and a 1-item Surprise Fits section is the
  // exact "partial section rendered as success" the operator called out. `hasNonEmptyArray`
  // accepted it. The MAX is enforced at generation (capCareerSurpriseFits) rather than here,
  // so an over-long list is trimmed to 3 instead of failing an otherwise-good report.
  { key: 'surpriseFits', label: 'Surprise Fits', present: (data: Record<string, unknown>) => Array.isArray(data.surpriseFits) && data.surpriseFits.length >= CAREER_SURPRISE_FITS_MIN },
  { key: 'fields', label: 'Fields', present: (data: Record<string, unknown>) => hasNonEmptyArray(data.careerFields) },
  { key: 'roles', label: 'Roles', present: (data: Record<string, unknown>) => hasNonEmptyArray(data.roles) },
  { key: 'readiness', label: 'Readiness', present: (data: Record<string, unknown>) => Boolean(data.roleReadinessBreakdown && typeof data.roleReadinessBreakdown === 'object') },
  { key: 'roadmap', label: 'Roadmap', present: (data: Record<string, unknown>) => hasNonEmptyArray(data.roadmap) || hasNonEmptyArray(data.roleRoadmaps) },
  { key: 'skillGaps', label: 'Skill Gaps', present: (data: Record<string, unknown>) => hasNonEmptyArray(data.skillGaps) },
] as const;

/**
 * The per-tier REQUIRED set. Free is standalone and materially narrower (locked operator
 * decision): Career DNA, fields, roles, surprise fits, a readiness score — and NOTHING
 * else. Elite additionally owes the roadmap and the skills-gap analysis it is paid for.
 * Anything not listed here is optional and never blocks a save.
 */
const CAREER_REQUIRED_SECTIONS: Record<'free' | 'pro' | 'elite', readonly string[]> = {
  free:  ['careerDNA', 'fields', 'roles', 'surpriseFits', 'readiness'],
  pro:   ['careerDNA', 'fields', 'roles', 'surpriseFits', 'readiness', 'roadmap', 'skillGaps'],
  elite: ['careerDNA', 'fields', 'roles', 'surpriseFits', 'readiness', 'roadmap', 'skillGaps'],
};

const CAREER_CACHE_MAX_CONTEXT_CHARS = 12000;

function hasNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * A model output that came back INCOMPLETE.
 *
 * ⚠ THIS TYPE EXISTS TO KEEP THE 422 MAPPING NARROW (260713-hrd, ED-5). ⚠
 *
 * `MeritRefundable(500, …)` is NOT unique to this failure. It is ALSO thrown by
 * `persistCareerResultAndRecordUsage` (a TRANSIENT analysis_results save blip) and by the
 * DOCX/OCR extraction helpers. A broad `catch (e) { if (e instanceof MeritRefundable)
 * return 422 }` would sweep those in too — turning a RECOVERABLE database hiccup into a
 * deterministic, terminal, refunded failure that the worker refuses to retry.
 *
 * So: incomplete/truncated output throws THIS type, and ONLY this type maps to 422
 * (terminal, non-retryable, refunded once). Every other MeritRefundable(500) keeps its
 * existing retryable 5xx semantics. Do not widen the catch.
 */
class CareerIncompleteOutput extends Error {
  constructor(public readonly missing: string[]) {
    super(`Career Compass output missing required sections: ${missing.join(', ')}`);
    this.name = 'CareerIncompleteOutput';
  }
}

function getMissingCareerSections(
  data: Record<string, unknown>,
  tier: 'free' | 'pro' | 'elite',
): string[] {
  const required = CAREER_REQUIRED_SECTIONS[tier] ?? CAREER_REQUIRED_SECTIONS.free;
  return CAREER_CORE_SECTION_CHECKS
    .filter(section => required.includes(section.key) && !section.present(data))
    .map(section => section.label);
}

/**
 * Completeness is asserted for EVERY tier — including Free.
 *
 * It used to early-return for `tier === 'free'`, and RC-1 made every single run 'free',
 * so in practice NOTHING was ever checked: a truncated stub with no `roles` key at all
 * was written to analysis_results as a successful, billed analysis. Never again.
 */
function assertCareerOutputComplete(
  data: Record<string, unknown>,
  tier: 'free' | 'pro' | 'elite',
): void {
  const missing = getMissingCareerSections(data, tier);
  if (missing.length > 0) {
    throw new CareerIncompleteOutput(missing);
  }
}

/**
 * TRUNCATION DETECTION (260713-hrd, ED-5).
 *
 * `invokeAnthropicText` returns the full Anthropic response as `raw`, so
 * `raw.stop_reason === 'max_tokens'` is a DIRECT, unambiguous "I ran out of budget
 * mid-sentence" signal. That beats inferring truncation from a parse failure — which is
 * exactly what we were failing to do, because `repairTruncatedJSON` would helpfully close
 * the braces on the half-written JSON and hand back a parseable stub.
 *
 * Mock/fixture mode sets `raw = { mock: true, … }` with no stop_reason, so AI_TEST_MODE
 * and every offline test are unaffected.
 */
function isTruncatedResponse(raw: unknown): boolean {
  return (raw as { stop_reason?: string } | null)?.stop_reason === 'max_tokens';
}

/**
 * The terminal, non-retryable, refundable truncation response.
 *
 * 422 IS LOAD-BEARING. It is deliberately NOT in the career worker's
 * `isRetryableHttpStatus` set, so the worker fails the job terminally on the FIRST
 * response and refunds the Merit exactly once via refundMeritsForJob. A 500 would be
 * RETRYABLE — and a temperature-0 truncation is perfectly deterministic, so it would burn
 * every retry re-generating the identical truncated stub before refunding (or, on the old
 * code, never refunding at all).
 */
function truncatedOutputResponse(
  log: ReturnType<typeof createLogger>,
  ctx: { tier: string; maxTokens: number; outLen: number },
): Response {
  log.error('output-truncated', ctx);
  return new Response(
    JSON.stringify({
      error: 'output_truncated',
      message: 'The analysis was cut short. Your Merits have been refunded — please try again.',
      retryable: false,
    }),
    { status: 422, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } },
  );
}

/**
 * The terminal, non-retryable, refundable INCOMPLETE-output response (see CareerIncompleteOutput).
 *
 * The refund is performed HERE, and the user-facing message is derived from whether it actually
 * succeeded. Previously this returned a 422 whose body stated "Your Merits have been refunded"
 * unconditionally — and no refund ever happened. Every call site sits INSIDE the `withMerits`
 * callback, and `withMerits` only refunds when the callback THROWS a refundable error; RETURNING
 * a Response is a successful resolve, so the gateway kept the deduction. The user was charged 3
 * Merits for a report they never received and was told, in the same breath, that they had been
 * refunded. Verified live on Preview with real AI: balance 200 -> 197, no refund row.
 *
 * `refund` is optional because not every call site has a Merit transaction to reverse (the legacy
 * / merits-disabled paths deduct nothing). When it is absent we say nothing about Merits rather
 * than claim a refund that did not occur.
 */
async function incompleteOutputResponse(
  log: ReturnType<typeof createLogger>,
  ctx: { tier: string; missing: string[]; refund?: { userId: string; transactionId: string } },
): Promise<Response> {
  log.error('output-incomplete', { tier: ctx.tier, missing: ctx.missing });

  let refunded = false;
  if (ctx.refund) {
    const r = await refundMeritsForJob(
      ctx.refund.userId,
      ctx.refund.transactionId,
      'career_incomplete_output',
    );
    refunded = r.ok;
    if (!r.ok) {
      log.error('output-incomplete-refund-failed', {
        transaction_id: ctx.refund.transactionId,
        error: r.error,
      });
    }
  }

  return new Response(
    JSON.stringify({
      error: 'incomplete_output',
      message: refunded
        ? 'The analysis came back incomplete. Your Merits have been refunded — please try again.'
        : 'The analysis came back incomplete. Please try again.',
      refunded,
      retryable: false,
      // 260713-hrd: name the sections that were missing. Without this the 422 is undebuggable
      // from the outside — you know the report was rejected but not what the model failed to
      // produce, which is the ONE thing you need to size the prompt against the budget.
      // Section LABELS only (e.g. "Roadmap"), never user content.
      missingSections: ctx.missing,
    }),
    { status: 422, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } },
  );
}

function applyCareerCompassFreeOutputPolicy(data: Record<string, unknown>, tier: 'free' | 'pro' | 'elite'): void {
  if (tier !== 'free') return;
  if (Array.isArray(data.careerFields)) data.careerFields = (data.careerFields as unknown[]).slice(0, 3);
  if (Array.isArray(data.surpriseFits)) data.surpriseFits = (data.surpriseFits as unknown[]).slice(0, 2);
  if (Array.isArray(data.roles)) data.roles = (data.roles as unknown[]).slice(0, 3);
  delete data.roadmap;
  delete data.roleRoadmaps;
}

function normalizeCareerCacheText(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, CAREER_CACHE_MAX_CONTEXT_CHARS)
    : '';
}

async function buildCareerCacheKey(params: {
  userId: string;
  tier: 'free' | 'pro' | 'elite';
  variant: string;
  resumeText: unknown;
  linkedinText: unknown;
  linkedinUrl: unknown;
  allowResumeOnly: unknown;
}): Promise<string> {
  const resumeText = normalizeCareerCacheText(params.resumeText);
  const linkedinText = normalizeCareerCacheText(params.linkedinText);
  return await computeCacheKey({
    user_id: params.userId,
    feature: 'career_compass',
    tier: params.tier,
    variant: params.variant,
    inputs: {
      resume_text_hash: await sha256Hex(resumeText),
      linkedin_text_hash: await sha256Hex(linkedinText),
      linkedinUrl: typeof params.linkedinUrl === 'string' ? params.linkedinUrl : '',
      allowResumeOnly: params.allowResumeOnly === true,
    },
  });
}

function isAcceptedStoredText(value: unknown, documentType: 'resume' | 'linkedin_profile'): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  return assessExtractionQuality({
    text: value,
    documentType,
    provider: 'pdf_parser',
  }).ok;
}

async function readPersistedResumeExtraction(
  supabase: ReturnType<typeof getServiceClient>,
  params: { userId: string | null; filePath: string | null; log: ReturnType<typeof createLogger> },
): Promise<{ id: string; text: string } | null> {
  if (!params.userId || !params.filePath) return null;

  const { data, error } = await supabase
    .from('resumes')
    .select('id, extracted_text, text_hash, extraction_metadata')
    .eq('user_id', params.userId)
    .eq('file_path', params.filePath)
    .maybeSingle();

  if (error) {
    params.log.warn('resume-persisted-extraction-read-failed', { error: error.message });
    return null;
  }

  if (
    data?.id &&
    typeof data.text_hash === 'string' &&
    isAcceptedStoredText(data.extracted_text, 'resume')
  ) {
    return { id: data.id as string, text: data.extracted_text };
  }

  return data?.id ? { id: data.id as string, text: '' } : null;
}

async function readPersistedLinkedInText(
  supabase: ReturnType<typeof getServiceClient>,
  params: { userId: string | null; log: ReturnType<typeof createLogger> },
): Promise<string> {
  if (!params.userId) return '';

  const { data, error } = await supabase
    .from('profiles')
    .select('linkedin_pdf_content, linkedin_pdf_text_hash, linkedin_pdf_extraction_metadata')
    .eq('id', params.userId)
    .maybeSingle();

  if (error) {
    params.log.warn('linkedin-persisted-extraction-read-failed', { error: error.message });
    return '';
  }

  if (
    typeof data?.linkedin_pdf_text_hash === 'string' &&
    isAcceptedStoredText(data.linkedin_pdf_content, 'linkedin_profile')
  ) {
    return data.linkedin_pdf_content;
  }

  return '';
}

function careerAnalysisIdFromCachedResult(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const metadata = (result as { metadata?: { analysis_id?: unknown; analysisId?: unknown } }).metadata;
  const direct = (result as { analysis_id?: unknown }).analysis_id;
  const id = metadata?.analysis_id ?? metadata?.analysisId ?? direct;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

async function readCareerAnalysisCache(
  supabase: ReturnType<typeof getServiceClient>,
  params: { cacheKey: string },
): Promise<{ cached: Response; analysis_id: string } | null> {
  const { data, error } = await supabase
    .from('analysis_cache')
    .select('raw_response, hit_count')
    .eq('cache_key', params.cacheKey)
    .maybeSingle();

  if (error || !data?.raw_response) return null;

  const analysisId = careerAnalysisIdFromCachedResult(data.raw_response);
  if (!analysisId) return null;

  await supabase
    .from('analysis_cache')
    .update({
      last_hit_at: new Date().toISOString(),
      hit_count: Number(data.hit_count ?? 1) + 1,
    })
    .eq('cache_key', params.cacheKey);

  return {
    cached: new Response(
      JSON.stringify(data.raw_response),
      { headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } },
    ),
    analysis_id: analysisId,
  };
}

async function writeCareerAnalysisCache(
  supabase: ReturnType<typeof getServiceClient>,
  params: {
    cacheKey: string;
    userId: string;
    tier: 'free' | 'pro' | 'elite';
    variant: string;
    result: Record<string, unknown>;
    analysisId: string;
  },
): Promise<void> {
  const rawResponse = {
    ...params.result,
    metadata: {
      ...((params.result.metadata && typeof params.result.metadata === 'object') ? params.result.metadata as Record<string, unknown> : {}),
      analysis_id: params.analysisId,
    },
  };

  const { error } = await supabase
    .from('analysis_cache')
    .upsert({
      cache_key: params.cacheKey,
      feature: 'career_compass',
      tier: params.tier,
      variant: params.variant,
      user_id: params.userId,
      raw_response: rawResponse,
      last_hit_at: new Date().toISOString(),
      hit_count: 1,
    }, { onConflict: 'cache_key' });

  if (error) {
    console.warn('[analyze-career] cache write failed:', error.message);
  }
}

async function persistCareerResultAndRecordUsage(
  supabase: ReturnType<typeof getServiceClient>,
  params: {
    userId: string;
    analysisResult: Record<string, unknown>;
    log: ReturnType<typeof createLogger>;
    label: string;
  },
): Promise<string> {
  const analysisResultSnapshot = JSON.parse(JSON.stringify(params.analysisResult));
  const { data, error } = await supabase
    .from('analysis_results')
    .insert({
      user_id: params.userId,
      analysis_type: 'career_compass',
      primary_score:
        (analysisResultSnapshot.careerReadinessScore as number) ||
        (analysisResultSnapshot.readinessScore as number) ||
        (analysisResultSnapshot.roleReadinessScore as number) ||
        0,
      key_insights: Array.isArray(analysisResultSnapshot.whatYouHave)
        ? analysisResultSnapshot.whatYouHave
        : [],
      raw_response: analysisResultSnapshot,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    console.error(`[analyze-career] ${params.label} analysis_results insert failed:`, error?.message || 'missing id');
    throw new MeritRefundable(500, 'Could not save career analysis history.');
  }

  const usageResult = await recordUsageWithAnalysis(
    params.userId,
    'career_compass',
    1,
    data.id,
  );
  if (!usageResult.ok) {
    // Fix (CR-02, SEC-13 parity with grade-linkedin 02-05 Fix 2 + analyze-resume CR-01):
    // the analysis_results row is already durable and the fire-and-forget email has fired.
    // A usage-write failure must NOT refund the Merit (double benefit) or 500 an
    // already-delivered analysis. Log the reason (operator signal) and fall through to the
    // durable success return below. DO NOT throw MeritRefundable here.
    params.log.error('usage-tracking-insert-failed', { error: usageResult.error });
  }

  const APP_URL = Deno.env.get('APP_URL') || 'https://strivoai.net';
  supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', params.userId)
    .single()
    .then(({ data: profile }) => {
      if (!profile?.email) return;
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
          featureType: 'career',
          score:
            (analysisResultSnapshot.careerReadinessScore as number) ||
            (analysisResultSnapshot.readinessScore as number) ||
            (analysisResultSnapshot.roleReadinessScore as number),
          resultsUrl: `${APP_URL}/career-compass?id=${data.id}`,
          summaryLine: (analysisResultSnapshot.careerDNA as string)?.slice(0, 200) || undefined,
          recordId: data.id,
          recordTable: 'analysis_results',
        }),
      }).catch(err => console.error(`[analyze-career] ${params.label} email trigger error:`, err));
    });

  return data.id;
}

// 260419-35x: Free-tier single-call budget lives in _shared/career-prompts.ts
// so tests can import it without pulling in this module's `serve(...)` side
// effect. Boot-time invariant is re-asserted here for defense-in-depth.
if (FREE_SINGLE_CALL_MAX_TOKENS > TIER_MAX_TOKENS.free || FREE_SINGLE_CALL_MAX_TOKENS > 4000) {
  throw new Error(`[analyze-career] FREE_SINGLE_CALL_MAX_TOKENS=${FREE_SINGLE_CALL_MAX_TOKENS} exceeds budget (TIER_MAX_TOKENS.free=${TIER_MAX_TOKENS.free})`);
}

async function executeCareerParallelCalls(
  params: {
    model: string;
    promptParams: CareerPromptParams;
    userPrompt: string;
    resolvedTier: 'free' | 'pro' | 'elite';
    /** TOK-02 telemetry context. reqId groups every call of ONE analysis. */
    reqId?: string;
    userId?: string | null;
  }
): Promise<CareerParallelResultUnion[]> {
  const makeCall = async (callType: CareerCallType, maxTokens: number, systemPrompt: string, attempt = 1): Promise<CareerParallelResultUnion> => {
    const start = Date.now();
    const resp = await invokeAnthropicText({
      model: params.model,
      system: systemPrompt,
      messages: [{ role: 'user', content: params.userPrompt }],
      maxTokens,
      outputSchema: getCareerOutputSchema(
        params.resolvedTier === 'free' ? 'free' : 'elite',
        callType,
      ),
      temperature: 0,
      fixtureKey: 'analyze_career',
      timeoutMs: getTimeout(params.resolvedTier as Tier),
      // TOK-02: `params.resolvedTier` is the SERVER-resolved tier (never a body field) —
      // see _shared/auth.ts:155, which forces the admin account to elite server-side.
      telemetry: {
        feature: 'career_compass',
        tier: params.resolvedTier,
        callName: callType,
        reqId: params.reqId,
        userId: params.userId ?? undefined,
        attempt,
      },
    });
    const durationMs = Date.now() - start;
    if (!resp.ok) {
      return { callType, ok: false, error: resp.error, status: resp.status, durationMs };
    }
    return { callType, ok: true, text: resp.text, durationMs, raw: resp.raw };
  };

  // Build per-call system prompts
  const basePrompt = loadPromptVariant('career', params.resolvedTier, params.promptParams);
  const growthPrompt = buildCareerGrowthPrompt(params.promptParams);
  const eliteExtrasPrompt = buildEliteExtrasPrompt(params.promptParams);

  // Filter out configs where per-tier budget is 0 (elite-extras for Free/Pro)
  const activeConfigs = CAREER_CALL_CONFIGS.filter(cfg => {
    const maxTokens = params.resolvedTier === 'elite' ? cfg.maxTokensElite
      : params.resolvedTier === 'pro' ? cfg.maxTokensPro
      : cfg.maxTokensFree;
    return maxTokens > 0;
  });

  const promises = activeConfigs.map(cfg => {
    const maxTokens = params.resolvedTier === 'elite' ? cfg.maxTokensElite
      : params.resolvedTier === 'pro' ? cfg.maxTokensPro
      : cfg.maxTokensFree;
    const prompt = cfg.callType === 'elite-extras'
      ? eliteExtrasPrompt
      : cfg.callType === 'growth'
      ? growthPrompt
      : basePrompt;
    return makeCall(cfg.callType, maxTokens, prompt);
  });

  const results = await Promise.allSettled(promises);
  const settled: CareerParallelResultUnion[] = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      callType: activeConfigs[i].callType,
      ok: false as const,
      error: r.reason?.message || 'Unexpected error',
      durationMs: 0,
    };
  });

  // Retry failed calls once
  const retryPromises = settled.map(async (result, i) => {
    if (result.ok) return result;
    if ('status' in result && (result.status === 429 || result.status === 402)) return result;
    const backoffMs = computeBackoffMs(1);
    console.log(`[career-parallel] Retrying ${result.callType} after ${backoffMs}ms (error: ${result.error})`);
    await new Promise(resolve => setTimeout(resolve, backoffMs));
    const cfg = activeConfigs[i];
    const maxTokens = params.resolvedTier === 'elite' ? cfg.maxTokensElite
      : params.resolvedTier === 'pro' ? cfg.maxTokensPro
      : cfg.maxTokensFree;
    const prompt = cfg.callType === 'elite-extras'
      ? eliteExtrasPrompt
      : cfg.callType === 'growth'
      ? growthPrompt
      : basePrompt;
    // attempt=2 so a retry row never averages in with first-attempt rows (TOK-02).
    return makeCall(cfg.callType, maxTokens, prompt, 2);
  });

  return Promise.all(retryPromises);
}

async function buildAnthropicImageBlocks(images: string[], maxImages = 3): Promise<any[]> {
  const blocks: any[] = [];

  for (const input of images.slice(0, maxImages)) {
    if (typeof input !== 'string' || !input) continue;

    const dataUrlMatch = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (dataUrlMatch) {
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: dataUrlMatch[1],
          data: dataUrlMatch[2],
        },
      });
      continue;
    }

    try {
      const imgResp = await fetch(input);
      if (!imgResp.ok) continue;
      const bytes = new Uint8Array(await imgResp.arrayBuffer());
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
      }
      const contentType = imgResp.headers.get('content-type') || 'image/png';
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: contentType,
          data: btoa(binary),
        },
      });
    } catch (error) {
      console.error('Failed to fetch OCR image for Anthropic:', error);
    }
  }

  return blocks;
}

// Domain classification mapping
const DOMAIN_MAPPING: Record<string, { domain: string; keywords: string[]; roles: string[]; fields: string[] }> = {
  'life_sciences': {
    domain: 'Life Sciences & Healthcare',
    keywords: ['biology', 'biochemistry', 'molecular', 'chemistry', 'pharmaceutical', 'biotech', 'lab', 'clinical', 'research', 'medicine', 'healthcare', 'genetics', 'microbiology', 'neuroscience', 'immunology', 'pathology', 'anatomy', 'physiology', 'pharmacology', 'toxicology', 'epidemiology', 'public health', 'nursing', 'pre-med', 'bioinformatics', 'cell biology'],
    roles: ['Research Scientist', 'Lab Technician', 'Clinical Research Coordinator', 'Quality Control Analyst', 'Pharmaceutical Sales', 'Medical Science Liaison', 'Regulatory Affairs Specialist', 'Biotech Associate', 'Research Assistant', 'Healthcare Analyst', 'Clinical Data Manager', 'Formulation Scientist'],
    fields: ['Pharmaceutical Industry', 'Biotechnology', 'Healthcare', 'Academic Research', 'Medical Devices', 'Clinical Research Organizations', 'Government Research Labs']
  },
  'technology': {
    domain: 'Technology & Engineering',
    keywords: ['computer science', 'software', 'programming', 'engineering', 'data science', 'machine learning', 'artificial intelligence', 'cybersecurity', 'cloud', 'web development', 'mobile', 'IT', 'information technology', 'algorithms', 'database', 'python', 'java', 'javascript', 'networking', 'devops', 'systems', 'electrical engineering', 'mechanical engineering', 'civil engineering', 'aerospace'],
    roles: ['Software Engineer', 'Data Scientist', 'Product Manager', 'UX Designer', 'DevOps Engineer', 'Systems Analyst', 'Machine Learning Engineer', 'Full Stack Developer', 'QA Engineer', 'Cloud Architect', 'Security Analyst', 'Technical Project Manager'],
    fields: ['Software Development', 'Data Science & Analytics', 'Cybersecurity', 'Cloud Computing', 'Product Management', 'Artificial Intelligence', 'FinTech']
  },
  'business_economics': {
    domain: 'Business & Economics',
    keywords: ['business', 'economics', 'finance', 'accounting', 'marketing', 'management', 'mba', 'entrepreneurship', 'strategy', 'consulting', 'investment', 'banking', 'private equity', 'venture capital', 'corporate', 'operations', 'supply chain', 'insurance', 'actuarial'],
    roles: ['Financial Analyst', 'Management Consultant', 'Investment Banking Analyst', 'Marketing Manager', 'Business Development', 'Operations Analyst', 'Strategy Associate', 'Account Manager', 'Project Manager', 'Product Marketing Manager', 'Corporate Development Analyst'],
    fields: ['Investment Banking', 'Management Consulting', 'Corporate Finance', 'Marketing & Advertising', 'Private Equity', 'Venture Capital', 'Corporate Strategy']
  },
  'social_sciences': {
    domain: 'Social Sciences & Humanities',
    keywords: ['psychology', 'sociology', 'political science', 'anthropology', 'history', 'philosophy', 'communications', 'journalism', 'public relations', 'social work', 'international relations', 'public policy', 'criminal justice', 'linguistics', 'english', 'literature', 'arts', 'music', 'theatre'],
    roles: ['Policy Analyst', 'Human Resources Specialist', 'Market Research Analyst', 'Social Media Manager', 'Public Relations Specialist', 'UX Researcher', 'Content Strategist', 'Program Coordinator', 'Communications Specialist', 'Grant Writer', 'Non-Profit Manager'],
    fields: ['Public Policy', 'Non-Profit Organizations', 'Government', 'Media & Communications', 'Human Resources']
  },
  'physical_sciences': {
    domain: 'Physical Sciences & Mathematics',
    keywords: ['physics', 'mathematics', 'statistics', 'astronomy', 'geology', 'environmental science', 'climate', 'earth science', 'materials science', 'chemistry', 'quantitative', 'applied mathematics', 'computational'],
    roles: ['Data Analyst', 'Quantitative Analyst', 'Research Scientist', 'Statistician', 'Actuary', 'Environmental Consultant', 'Materials Scientist', 'Geophysicist', 'Climate Analyst', 'Risk Analyst'],
    fields: ['Quantitative Finance', 'Research & Development', 'Environmental Consulting', 'Energy Sector', 'Government Research', 'Academia', 'Insurance & Risk']
  },
  'creative_design': {
    domain: 'Creative & Design',
    keywords: ['graphic design', 'ui/ux', 'visual design', 'animation', 'video production', 'photography', 'illustration', 'branding', 'advertising', 'creative', 'art direction', 'motion graphics', 'industrial design', 'fashion', 'interior design', 'architecture'],
    roles: ['Graphic Designer', 'UX/UI Designer', 'Art Director', 'Brand Strategist', 'Motion Designer', 'Video Editor', 'Creative Director', 'Product Designer', 'Visual Designer', 'Content Creator'],
    fields: ['Advertising Agencies', 'Design Studios', 'Tech Companies', 'Media & Entertainment', 'Branding Agencies', 'In-House Creative Teams']
  },
  'legal': {
    domain: 'Legal & Compliance',
    keywords: ['law', 'legal', 'attorney', 'lawyer', 'paralegal', 'litigation', 'contract', 'compliance', 'regulatory', 'intellectual property', 'patent', 'trademark', 'corporate law', 'criminal law', 'civil law', 'legal research', 'bar exam', 'jd', 'juris doctor', 'legal assistant', 'court', 'judiciary', 'mediation', 'arbitration', 'mergers acquisitions', 'securities law', 'employment law', 'tax law', 'environmental law', 'healthcare law'],
    roles: ['Associate Attorney', 'Paralegal', 'Legal Assistant', 'Compliance Officer', 'Contract Manager', 'Legal Counsel', 'Corporate Attorney', 'Litigation Associate', 'Legal Analyst', 'Regulatory Specialist', 'IP Attorney', 'Legal Operations Manager'],
    fields: ['Law Firms', 'Corporate Legal Departments', 'Government Legal', 'Compliance & Regulatory', 'Intellectual Property', 'Legal Tech', 'Non-Profit Legal Services']
  },
  'real_estate': {
    domain: 'Real Estate & Property',
    keywords: ['real estate', 'property', 'commercial real estate', 'residential', 'realty', 'brokerage', 'property management', 'leasing', 'mortgage', 'appraisal', 'zoning', 'development', 'construction', 'reit', 'real estate investment', 'asset management', 'facilities', 'urban planning', 'land use', 'escrow', 'title', 'property valuation', 'cre', 'multifamily', 'retail real estate', 'industrial real estate'],
    roles: ['Real Estate Agent', 'Property Manager', 'Real Estate Analyst', 'Commercial Broker', 'Leasing Consultant', 'Development Associate', 'Asset Manager', 'Acquisitions Analyst', 'Real Estate Appraiser', 'Mortgage Loan Officer', 'Investment Analyst', 'Facilities Manager'],
    fields: ['Commercial Real Estate', 'Residential Real Estate', 'Property Management', 'Real Estate Investment', 'Real Estate Development', 'Mortgage & Lending', 'REITs']
  },
  'education': {
    domain: 'Education & Training',
    keywords: ['education', 'teaching', 'teacher', 'professor', 'instructor', 'curriculum', 'pedagogy', 'learning', 'training', 'academic', 'school', 'university', 'college', 'k-12', 'elementary', 'secondary', 'higher education', 'edtech', 'tutoring', 'coaching', 'educational technology', 'student affairs', 'admissions', 'counseling', 'special education', 'esl', 'tesol', 'instructional design', 'e-learning', 'online education'],
    roles: ['Teacher', 'Professor', 'Instructional Designer', 'Curriculum Developer', 'Academic Advisor', 'School Administrator', 'Education Coordinator', 'Training Specialist', 'Tutor', 'EdTech Specialist', 'Admissions Counselor', 'Student Affairs Coordinator'],
    fields: ['K-12 Education', 'Higher Education', 'EdTech Companies', 'Corporate Training', 'Non-Profit Education', 'Online Learning Platforms', 'Educational Publishing']
  }
};

// Function to classify domain from resume/profile content
interface DomainClassification {
  domain: string;
  confidence: number;
  evidence: string[];
  domainKey: string;
}

function classifyDomains(content: string): { primary: DomainClassification; secondary: DomainClassification[]; allDomains: DomainClassification[] } {
  const lowerContent = content.toLowerCase();
  const scores: Record<string, { score: number; evidence: string[] }> = {};
  
  for (const [key, config] of Object.entries(DOMAIN_MAPPING)) {
    let score = 0;
    const evidence: string[] = [];
    
    for (const keyword of config.keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = lowerContent.match(regex);
      if (matches) {
        score += matches.length * (keyword.length > 8 ? 3 : 2);
        if (evidence.length < 5) {
          evidence.push(keyword);
        }
      }
    }
    
    scores[key] = { score, evidence };
  }
  
  const totalScore = Object.values(scores).reduce((sum, d) => sum + d.score, 0);
  
  // Sort all domains by score descending
  const ranked = Object.entries(scores)
    .filter(([_, data]) => data.score > 0)
    .sort((a, b) => b[1].score - a[1].score)
    .map(([key, data]) => ({
      domain: DOMAIN_MAPPING[key].domain,
      confidence: totalScore > 0 ? Math.min(100, Math.round((data.score / totalScore) * 100)) : 0,
      evidence: data.evidence,
      domainKey: key,
    }));
  
  // If nothing matched, default to business_economics
  if (ranked.length === 0) {
    const fallback: DomainClassification = {
      domain: DOMAIN_MAPPING['business_economics'].domain,
      confidence: 0,
      evidence: [],
      domainKey: 'business_economics',
    };
    return { primary: fallback, secondary: [], allDomains: [fallback] };
  }

  const primary = ranked[0];
  // Include secondary domains that have at least 15% of the primary's score
  const primaryScore = scores[primary.domainKey].score;
  const secondary = ranked.slice(1).filter(d => {
    const dScore = scores[d.domainKey].score;
    return dScore >= primaryScore * 0.15;
  }).slice(0, 2); // max 2 secondary domains
  
  console.log('Domain classification scores:', JSON.stringify(scores, null, 2));
  console.log('Primary domain:', primary.domainKey, 'confidence:', primary.confidence);
  console.log('Secondary domains:', secondary.map(d => d.domainKey).join(', '));
  
  return { primary, secondary, allDomains: [primary, ...secondary] };
}

// Backwards-compatible wrapper
function classifyDomain(content: string): DomainClassification {
  return classifyDomains(content).primary;
}

// Function to scrape LinkedIn profile using Firecrawl
async function scrapeLinkedInProfile(linkedinUrl: string): Promise<string | null> {
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  
  if (!FIRECRAWL_API_KEY) {
    console.log('Firecrawl API key not configured, skipping LinkedIn scrape');
    return null;
  }

  try {
    console.log('Scraping LinkedIn profile:', linkedinUrl);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: linkedinUrl,
        formats: ['markdown'],
        waitFor: 3000,
      }),
    });

    if (!response.ok) {
      console.error('Firecrawl error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const markdown = data.data?.markdown || '';
    
    if (markdown && markdown.length > 100) {
      console.log('LinkedIn profile scraped successfully, length:', markdown.length);
      return markdown;
    }
    
    return null;
  } catch (error) {
    console.error('Error scraping LinkedIn:', error);
    return null;
  }
}

serve((req) => withCors(req, 'user', async () => {
  if (req.method === 'OPTIONS') {
    return handleOptionsRequest({ type: 'user', extraHeaders: 'x-internal-job-secret' });
  }

  const reqId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('analyze-career', reqId);
  const totalTimer = log.timer('total-request');
  let featureRuntime: FeatureRunRuntime | null = null;
  let isInternalCostingRequest = false;
  let activeMeritTransactionId: string | null = null;

  try {
    const requestBody = await req.json();
    const retiredComparisonKeys = [['compare', 'Roles'].join(''), ['existing', 'Analysis'].join('')];
    if (retiredComparisonKeys.some((key) => key in requestBody)) {
      return new Response(
        JSON.stringify({ error: 'Career role comparison has been retired', code: 'unsupported_input' }),
        { status: 400, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } },
      );
    }
    const { linkedinUrl, resumeFilePath, resumeTextContent, userId, linkedinPdfContent, resumeOcrImages, allowResumeOnly } = requestBody;

    const supabase = getServiceClient();
    const userContext = await requireInternalOrUserAuth(req);
    isInternalCostingRequest = !userContext;
    const effectiveUserId = userContext?.userId ?? (typeof userId === 'string' ? userId : null);
    if (effectiveUserId) {
      const correlation = await beginFeatureRun({
        userId: effectiveUserId,
        feature: 'career_compass',
        requestId: reqId,
        serverActionKey: typeof requestBody.attemptNonce === 'string' && requestBody.attemptNonce
          ? requestBody.attemptNonce
          : `career:${reqId}`,
        runVariant: requestBody.runVariant === 'rerun' ? 'rerun' : 'standard',
        inputType: typeof requestBody.featureRunToken === 'string' ? 'mixed' : 'text',
        documentCount: typeof requestBody.featureRunToken === 'string' ? 1 : 0,
        featureRunToken: userContext && typeof requestBody.featureRunToken === 'string'
          ? requestBody.featureRunToken
          : undefined,
        trustedFeatureRunId: !userContext && typeof requestBody.featureRunId === 'string'
          ? requestBody.featureRunId
          : undefined,
        trustedInternal: !userContext,
      });
      if (!correlation.ok) {
        return new Response(JSON.stringify({ error: correlation.reason }), {
          status: 400,
          headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' },
        });
      }
      featureRuntime = correlation.runtime;
    }
    let acceptedLinkedinPdfContent = typeof linkedinPdfContent === 'string' ? linkedinPdfContent.trim() : '';
    if (!acceptedLinkedinPdfContent) {
      acceptedLinkedinPdfContent = await readPersistedLinkedInText(supabase, {
        userId: effectiveUserId,
        log,
      });
    }

    // ── Tier resolution (quick task 260713-hrd · RC-1) ────────────────────────
    // D-14 STILL HOLDS: the tier is resolved SERVER-SIDE and is NEVER read off the
    // request body. The bug was not that we trusted the client — it is that on the ONLY
    // live path there was no one to ask.
    //
    // 100% of Career Compass traffic arrives here from process-career-analysis-job under
    // `x-internal-job-secret`. requireInternalOrUserAuth returns null for that path
    // (requireInternalAuth is typed Promise<null>), so the old derivation — which read
    // the tier SOLELY off userContext — produced 'free' for every user on earth. Elite
    // subscribers were charged Elite Merits and analyzed as Free.
    //
    // Fix: when there is no JWT user context, look the tier up in the DATABASE from the
    // trusted payload userId (resolveTierForUserId — service client, admin elevation,
    // normalizeActiveTier, fails CLOSED to 'free'). We pass an ID and get a tier back;
    // we never accept a tier.
    //
    // NOTE: a null userContext here means internal auth SUCCEEDED — requireInternalOrUserAuth
    // THROWS a 401 Response on a bad secret, so reaching this line with null is proof of a
    // valid internal caller.
    let resolvedTier: 'free' | 'pro' | 'elite';
    if (userContext) {
      // JWT path — already normalized + admin-elevated by requireUserAuth.
      resolvedTier =
        (userContext.tier === 'pro' || userContext.tier === 'elite')
          ? userContext.tier as 'free' | 'pro' | 'elite'
          : 'free';
      if (userContext.tier !== 'free' && userContext.tier !== 'pro' && userContext.tier !== 'elite') {
        log.warn('subscription-missing-or-invalid', { userId: userContext.userId, rawTier: userContext.tier });
      }
      log.info('tier-resolved', { userId: effectiveUserId, tier: resolvedTier, source: 'jwt' });
    } else if (typeof effectiveUserId === 'string' && effectiveUserId) {
      // Internal / worker path — the live one. Resolve from the DB.
      resolvedTier = await resolveTierForUserId(effectiveUserId);
      log.info('tier-resolved', { userId: effectiveUserId, tier: resolvedTier, source: 'internal-db' });
    } else {
      // No JWT and no userId to look up — fail closed on cost.
      resolvedTier = 'free';
      log.warn('tier-unresolvable', { reason: 'no-user-context-and-no-payload-user-id' });
      log.info('tier-resolved', { userId: effectiveUserId, tier: resolvedTier, source: 'fail-closed' });
    }
    const isElite = resolvedTier === 'elite';
    log.info('request-start', { userId, tier: resolvedTier, hasResumePath: !!resumeFilePath, hasResumeText: !!(resumeTextContent?.length), hasLinkedin: !!(acceptedLinkedinPdfContent.length) });

    // ONE deadline per REQUEST, threaded into every invokeWithRetry below, so the sum of
    // all retries can never outrun the client's 180s poll (see CAREER_TOTAL_DEADLINE_MS).
    const deadlineAt = Date.now() + CAREER_TOTAL_DEADLINE_MS;

    const ANTHROPIC_MODEL_TEXT = getModel(resolvedTier, 'career');
    // Rate limit: 5/15/30 per hour by tier (D-01). Skip for internal worker path (userContext null).
    if (userContext) {
      const rl = await checkRateLimit(userContext.userId, userContext.tier, {
        key: 'analyze-career',
        limits: { free: 5, pro: 15, elite: 30 },
      });
      if (!rl.allowed) {
        await featureRuntime?.fail('RATE_LIMITED', 'rate_limit');
        return createRateLimitResponse(rl.retryAfterSeconds, 'user');
      }
    }
    // === Phase 13 branch (D-06) ===
    // MIG-05: legacy path below is byte-identical until MERIT_SYSTEM_ENABLED flips to true.
    if (MERIT_SYSTEM_ENABLED && userContext) {
      // 260419-35x: Free-tier single-call path sourced from prior Resume Analysis
      // + LinkedIn Grader results.
      //
      // 260713-hrd: this NO LONGER short-circuits with 412 when a prior is missing. Free is
      // standalone — a resume is the only requirement, and prior analyses are optional
      // ENRICHMENT used when they happen to exist. If they do not, the run proceeds from the
      // uploaded resume. (This whole branch is also unreachable on the live worker path, which
      // has a null userContext; the live path is the legacy one below.)
      const isFreeSingleCallPath = resolvedTier === 'free';

      // Hold fetched prior analyses for later handoff inside withMerits
      let priorResumeGrading: unknown = null;
      let priorLinkedinGrading: unknown = null;
      let priorLinkedinCreatedAt: string | null = null;
      let priorResumeCreatedAt: string | null = null;
      let reusedResume = false;
      let reusedLinkedinGrade = false;

      // 22-03 Task 1 (a,b,d): Cross-feature memory for main path. Fetch latest
      // prior analyses for BOTH free single-call and Pro/Elite main paths so we
      // can reuse LinkedIn Grader output and skip PDF re-parse when present.
      // Multi-role comparison sub-path does not need priors (no PDFs consumed).
      {
        const [{ data: resumeRow }, { data: linkedinRow }] = await Promise.all([
          supabase
            .from('resumes')
            .select('id, grading_data, created_at')
            .eq('user_id', userContext.userId)
            .not('grading_data', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('linkedin_grades')
            .select('id, grading_data, overall_score, created_at')
            .eq('user_id', userContext.userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        if (resumeRow && resumeRow.grading_data) {
          priorResumeGrading = resumeRow.grading_data;
          priorResumeCreatedAt = (resumeRow as { created_at?: string }).created_at ?? null;
          reusedResume = true;
        }
        if (linkedinRow && linkedinRow.grading_data) {
          priorLinkedinGrading = linkedinRow.grading_data;
          priorLinkedinCreatedAt = (linkedinRow as { created_at?: string }).created_at ?? null;
          reusedLinkedinGrade = true;
        }

        // ── 260713-hrd (ED-6): the prior-analysis GATES ARE GONE ────────────────
        // Both 412s used to live here: `missing_prior_analyses` (Free needed BOTH a prior
        // Resume Analysis and a prior LinkedIn Grade) and `linkedin_prior_missing`
        // (Pro/Elite needed a prior LinkedIn Grade, or an explicit allowResumeOnly opt-in).
        //
        // LOCKED OPERATOR DECISION (2026-07-13): a prior analysis must NEVER be a required
        // gate. Career Compass Free is STANDALONE — an uploaded resume is the only input it
        // needs. The priors fetched above are still read, and are still handed to the
        // downstream path as ENRICHMENT when they happen to exist; they simply cannot block
        // a run any more. `reusedResume` / `reusedLinkedinGrade` keep their enrichment role.
      }

      // CR-01/CR-02: validate inputs BEFORE withMerits to avoid charging merits
      // for invalid requests that never reach the AI call.
      // 260419-35x: Free single-call path does not require the upload inputs;
      // it sources from prior analyses fetched above.
      if (!isFreeSingleCallPath) {
        if (!resumeFilePath) {
          await featureRuntime?.fail('RESUME_REQUIRED', 'validation');
          return new Response(
            JSON.stringify({ error: 'Resume file is required' }),
            { status: 400, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } }
          );
        }
        // 260713-hrd (ED-6): the LinkedIn hard-fail is GONE. The resume is the only
        // required input. LinkedIn (PDF or URL) is purely optional enrichment — the
        // downstream prompt has an explicit resume-only branch.
      }

      const isProEliteShortCircuitForCache = !isFreeSingleCallPath && reusedResume && reusedLinkedinGrade;
      const careerCacheVariant = isFreeSingleCallPath
          ? `${FUNCTION_VERSION}:free-single-call`
          : isProEliteShortCircuitForCache
            ? `${FUNCTION_VERSION}:pro-elite-short-circuit`
            : `${FUNCTION_VERSION}:pro-elite-full`;
      const careerCacheKey = await buildCareerCacheKey({
        userId: userContext.userId,
        tier: resolvedTier,
        variant: careerCacheVariant,
        resumeText: isFreeSingleCallPath || isProEliteShortCircuitForCache
          ? JSON.stringify(priorResumeGrading ?? '')
          : (resumeTextContent || resumeFilePath || ''),
        linkedinText: isFreeSingleCallPath || isProEliteShortCircuitForCache
          ? JSON.stringify(priorLinkedinGrading ?? '')
          : acceptedLinkedinPdfContent,
        linkedinUrl,
        allowResumeOnly,
      });

      // D-03 idempotency-key gap closure (mirrors analyze-resume:728): derive ONE
      // stable key over the NON-mutating career input identity (the careerCacheKey
      // built above is a hash of prior-analyses/content inputs + tier + variant +
      // allowResumeOnly — never a save-mutated field, Pitfall 8) plus a
      // per-deliberate-submit attemptNonce, and set it on the direct-path meritCtx
      // BEFORE withMerits. A duplicate attempt (double-click / two tabs / worker
      // retry of the SAME attempt) then deducts exactly once (check_and_deduct_merits
      // already_deducted). Additive/harmless: it only strengthens dedup — the direct
      // main merit path stays byte-identical.
      const directAttemptNonce =
        typeof requestBody.attemptNonce === 'string' && requestBody.attemptNonce
          ? requestBody.attemptNonce
          : crypto.randomUUID();
      const directIdempotencyKey = await deriveIdempotencyKey({
        userId: userContext.userId,
        feature: 'career_compass',
        tier: resolvedTier,
        inputIdentity: careerCacheKey,
        attemptNonce: directAttemptNonce,
      });
      const directMeritCtx = {
        userId: userContext.userId,
        tier: userContext.tier as 'free' | 'pro' | 'elite',
        corsType: 'user' as const,
        idempotencyKey: directIdempotencyKey,
      };
      const gated = await withMerits(
        directMeritCtx,
        'career_compass',
        async (directTxId) => {
          activeMeritTransactionId = directTxId;
          await featureRuntime?.observeCharge(directTxId);
          // Multi-role comparison sub-path
          // 260419-35x: Free-tier single-call path (prior-analyses sourced).
          // Bypasses parallel fan-out and uses a single <=4000 token call.
          //
          // 22-03 Task 1 (c): Pro/Elite short-circuit — when both prior
          // analyses exist, reuse the
          // same prior-analyses prompt path and skip the PDF re-parse +
          // parallel fan-out entirely. D-17 acceptance: emit structured
          // `career.reuse` log line.
          const isProEliteShortCircuit = !isFreeSingleCallPath && reusedResume && reusedLinkedinGrade;
          if (isFreeSingleCallPath || isProEliteShortCircuit) {
            if (isProEliteShortCircuit) {
              log.info('career.reuse', { reusedLinkedinGrade: true, skippedPdfParse: true });
            }
            const currentDate = new Date().toISOString().slice(0, 10);
            const built = buildFreePriorAnalysesPrompt({
              resumeAnalysisJson: priorResumeGrading,
              linkedinGradeJson: priorLinkedinGrading,
              currentDate,
            });

            const resp = await invokeAnthropicText({
              model: getModel(resolvedTier, 'career'),
              system: built.system,
              messages: [{ role: 'user', content: built.user }],
              maxTokens: isProEliteShortCircuit
                ? Math.min(getMaxOutput('careerCompass', resolvedTier), 8000)
                : FREE_SINGLE_CALL_MAX_TOKENS,
              temperature: 0,
              fixtureKey: 'analyze_career',
              timeoutMs: getTimeout(resolvedTier as Tier),
              // Two DIFFERENT budgets share this call site (Free single-call vs the
              // Pro/Elite prior-analyses short-circuit at min(ceiling, 8000)), so they
              // get DIFFERENT call names — pooling them would size one cap off two caps.
              telemetry: {
                feature: 'career_compass',
                tier: resolvedTier,
                callName: isProEliteShortCircuit ? 'base-prior-analyses' : 'base',
                reqId,
                userId: effectiveUserId ?? undefined,
                attempt: 1,
              },
            });

            if (!resp.ok) {
              throw new MeritRefundable(resp.status, resp.error);
            }

            let analysisResult: Record<string, unknown>;
            try {
              const jsonContent = repairTruncatedJSON(resp.text.trim());
              analysisResult = JSON.parse(jsonContent);
            } catch {
              throw new MeritRefundable(500, 'JSON parse failed for free career analysis');
            }

            // Derive minimal domain placeholders from prior resume analysis if absent
            if (!analysisResult.detectedDomain) {
              const priorResume = priorResumeGrading as Record<string, unknown> | null;
              analysisResult.detectedDomain = (priorResume?.detectedDomain as string) || 'General';
            }
            if (!analysisResult.domainEvidence) {
              const priorResume = priorResumeGrading as Record<string, unknown> | null;
              analysisResult.domainEvidence = Array.isArray(priorResume?.domainEvidence)
                ? (priorResume!.domainEvidence as unknown[])
                : [];
            }

            // Defense-in-depth: server-side whitelist strip regardless of prompt compliance.
            // 22-03: When Pro/Elite short-circuits through this prior-analyses prompt path,
            // shape the output for the ACTUAL tier — not 'free' — so Pro/Elite fields survive.
            applyCareerTierShape(analysisResult, resolvedTier);
            applyCareerCompassFreeOutputPolicy(analysisResult, resolvedTier);
            capCareerSurpriseFits(analysisResult);
            // The third assertCareerOutputComplete call site. Its two siblings (the main
            // branch and the legacy tail) wrap this in the CareerIncompleteOutput -> 422
            // guard; this one did not, and that omission was load-bearing: this is the
            // prior-analyses short-circuit, which fires for exactly the users Career Compass
            // is FOR (anyone with a previous resume/LinkedIn analysis). An incomplete model
            // output here threw CareerIncompleteOutput straight through withMerits, which
            // does not recognize it as refundable (no numeric .status, not MeritRefundable),
            // so the gateway kept the deduction and the error fell to the generic handler as
            // a bare 500 carrying the raw internal message. Net effect: the user paid 3
            // Merits, got no report, got no refund, and saw an internal string.
            // Verified live on Preview with real AI: HTTP 500, balance 200 -> 197, and no
            // refund row in merit_transactions.
            try {
              assertCareerOutputComplete(analysisResult, resolvedTier);
            } catch (completenessError) {
              if (completenessError instanceof CareerIncompleteOutput) {
                return await incompleteOutputResponse(log, {
                  tier: resolvedTier,
                  missing: completenessError.missing,
                  refund: MERIT_SYSTEM_ENABLED
                    ? { userId: userContext.userId, transactionId: directTxId }
                    : undefined,
                });
              }
              throw completenessError;
            }

            // 22-03 D-15: Additive reuse fields on this path.
            analysisResult.reusedLinkedinGrade = reusedLinkedinGrade;
            analysisResult.linkedinGradeDate = priorLinkedinCreatedAt;

            // 22-04 D-18/D-19 Pitfall 2 fix: merit-path bypasses usage_tracking INSERT.
            // Restore History visibility by writing a row via record_ai_usage. Entitlement
            // is already enforced by withMerits; this call only writes the audit row.
            // Non-blocking — a failed insert logs but does NOT fail the user request.
            // Placed here (short-circuit branch) so exactly one INSERT fires per successful
            // run: the full PDF-parse branch has its own INSERT at the parallel-fan-out
            // convergence point below. Static reading proves zero-or-double is impossible
            // because the short-circuit branch ends with `return new Response(...)` below.
            const analysisId = await persistCareerResultAndRecordUsage(supabase, {
              userId: userContext.userId,
              analysisResult,
              log,
              label: 'Free-single-call',
            });
            await writeCareerAnalysisCache(supabase, {
              cacheKey: careerCacheKey,
              userId: userContext.userId,
              tier: resolvedTier,
              variant: careerCacheVariant,
              result: analysisResult,
              analysisId,
            });

            return new Response(
              JSON.stringify(analysisResult),
              { headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } }
            );
          }

          let linkedInData: string | null = acceptedLinkedinPdfContent;
          let resumeText = typeof resumeTextContent === 'string' ? resumeTextContent.trim() : '';
          let resumeExtractionError: string | null = null;
          const persistedResume = await readPersistedResumeExtraction(supabase, {
            userId: effectiveUserId,
            filePath: typeof resumeFilePath === 'string' ? resumeFilePath : null,
            log,
          });
          if (resumeText.length < 100 && persistedResume?.text) {
            resumeText = persistedResume.text;
            log.info('resume-persisted-extraction-reused', { resumeId: persistedResume.id });
          }
          const isDocx = resumeFilePath.toLowerCase().endsWith('.docx') || resumeFilePath.toLowerCase().endsWith('.doc');

          if (resumeText.length < 100) {
            const resumeDownload = await supabase.storage.from('resumes').download(resumeFilePath);
            if (resumeDownload.data && !resumeDownload.error) {
              if (isDocx) {
                try {
                  const uint8Array = new Uint8Array(await resumeDownload.data.arrayBuffer());
                  const decoder = new TextDecoder('utf-8', { fatal: false });
                  const rawText = decoder.decode(uint8Array);
                  const xmlTextMatches = rawText.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
                  if (xmlTextMatches.length > 0) {
                    resumeText = xmlTextMatches.map(m => { const match = m.match(/>([^<]+)</); return match ? match[1] : ''; }).join(' ').replace(/\s+/g, ' ').trim();
                  }
                  if (resumeText.length < 100) {
                    const aiResp = await invokeAnthropicText({ model: ANTHROPIC_MODEL_TEXT, messages: [{ role: 'user', content: `Extract ALL text from this DOCX resume file raw content. Preserve structure. Return ONLY extracted text.\n\n${rawText.substring(0, 12000)}` }], maxTokens: 2000, temperature: 0, telemetry: { feature: 'career_compass', tier: resolvedTier, callName: 'docx-extract', reqId, userId: effectiveUserId ?? undefined, attempt: 1 } });
                    if (aiResp.ok && aiResp.text.length >= 50) { resumeText = aiResp.text; }
                    else if (!aiResp.ok) { throw new MeritRefundable(aiResp.status, aiResp.error); }
                  }
                } catch (docxError) {
                  if (docxError instanceof MeritRefundable) throw docxError;
                  resumeExtractionError = docxError instanceof Error ? docxError.message : 'DOCX extraction failed';
                }
              } else {
                try {
                  const pdfBuffer = await resumeDownload.data.arrayBuffer();
                  const extraction = await extractPDFTextWithMetadata(pdfBuffer, 'resume');
                  if (extraction.ok) {
                    resumeText = extraction.text;
                    if (persistedResume?.id && effectiveUserId) {
                      const persistResult = await persistAcceptedExtraction({
                        supabase,
                        target: 'resume',
                        userId: effectiveUserId,
                        resumeId: persistedResume.id,
                        result: extraction,
                      });
                      if (!persistResult.ok) {
                        log.warn('resume-persisted-extraction-write-failed', { error: persistResult.error });
                      }
                    }
                  } else {
                    resumeExtractionError = extraction.reason;
                  }
                } catch (pdfError) {
                  resumeExtractionError = pdfError instanceof Error ? pdfError.message : 'PDF extraction failed';
                }
              }
            } else {
              resumeExtractionError = resumeDownload.error?.message || 'Failed to download resume from storage';
            }
          }

          // OCR fallback
          if ((!resumeText || resumeText.length < 100) && Array.isArray(resumeOcrImages) && resumeOcrImages.length > 0) {
            const imageBlocks = await buildAnthropicImageBlocks(resumeOcrImages, 3);
            if (imageBlocks.length > 0) {
              const ocrResp = await invokeAnthropicText({ model: ANTHROPIC_MODEL_TEXT, messages: [{ role: 'user', content: [{ type: 'text', text: 'Extract ALL readable text from these resume images. Return only the extracted text.' }, ...imageBlocks] }], maxTokens: 4000, temperature: 0, telemetry: { feature: 'career_compass', tier: resolvedTier, callName: 'ocr-extract', reqId, userId: effectiveUserId ?? undefined, attempt: 1 } });
              if (!ocrResp.ok) throw new MeritRefundable(ocrResp.status, ocrResp.error);
              if (ocrResp.text && ocrResp.text.length >= 100) { resumeText = ocrResp.text; resumeExtractionError = null; }
            }
          }

          const hasLinkedIn = linkedInData && linkedInData.length > 100;
          const hasResume = resumeText && resumeText.length > 100;
          if (!hasResume && !hasLinkedIn) {
            return new Response(JSON.stringify({ error: 'Unable to extract data from both sources.' }), { status: 400, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } });
          }
          if (!hasResume) {
            return new Response(JSON.stringify({ error: 'Unable to extract text from your resume.' }), { status: 400, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } });
          }
          // 260713-hrd (ED-6): LinkedIn is OPTIONAL. There is no gate here any more —
          // profileContent below already carries an explicit resume-only branch.

          // Hard per-tier INPUT cap (quick task 260608-p5k): trim each source to
          // getMaxInputChars('careerCompass', tier) (free 16000 / elite 40000).
          const MAX_CONTEXT_CHARS = getMaxInputChars('careerCompass', resolvedTier) ?? 12000;
          const resumeTrimmed = resumeText.length > MAX_CONTEXT_CHARS ? resumeText.slice(0, MAX_CONTEXT_CHARS) : resumeText;
          const linkedInTrimmed = hasLinkedIn
            ? (linkedInData!.length > MAX_CONTEXT_CHARS ? linkedInData!.slice(0, MAX_CONTEXT_CHARS) : linkedInData!)
            : '';
          // SEC-07 (D-01): strip high-confidence injection phrases from the user-role resume /
          // LinkedIn content before it enters the Anthropic prompt (single-word terms preserved so
          // legitimate profile text is not corrupted). Pre-ingestion defense-in-depth only.
          const sanitizedResume = sanitizeUserContent(resumeTrimmed, 'analyze-career', log);
          const sanitizedLinkedIn = linkedInTrimmed ? sanitizeUserContent(linkedInTrimmed, 'analyze-career', log) : '';
          const profileContent = hasLinkedIn
            ? `=== RESUME CONTENT (TRIMMED) ===\n${sanitizedResume}\n\n=== LINKEDIN PROFILE (TRIMMED) ===\n${sanitizedLinkedIn}\n\n`
            : `=== RESUME CONTENT (TRIMMED) ===\n${sanitizedResume}\n\n=== LINKEDIN PROFILE ===\n(not provided — analyze from resume only)\n\n`;

          const { primary: domainClassification, secondary: secondaryDomains, allDomains } = classifyDomains(profileContent);
          const domainConfig = DOMAIN_MAPPING[domainClassification.domainKey];
          const relevantDomains = allDomains.slice(0, 3);
          const allRelevantRoles = relevantDomains.flatMap(d => DOMAIN_MAPPING[d.domainKey].roles);
          const allRelevantFields = relevantDomains.flatMap(d => DOMAIN_MAPPING[d.domainKey].fields);
          const uniqueRoles = [...new Set(allRelevantRoles)].slice(0, 15);
          const uniqueFields = [...new Set(allRelevantFields)].slice(0, 10);

          // D-01: constrained parallel fan-out replaces the single-call retry loop
          const currentDate = new Date().toISOString().slice(0, 10);
          const promptParams: CareerPromptParams = {
            currentDate,
            domain: domainClassification.domain,
            domainConfidence: domainClassification.confidence,
            domainEvidence: domainClassification.evidence,
            secondaryDomains,
            uniqueRoles,
            uniqueFields,
            domainConfig,
          };

          const parallelResults = await executeCareerParallelCalls({
            model: ANTHROPIC_MODEL_TEXT,
            promptParams,
            userPrompt: `Analyze this profile. Be concise -- every field references specific resume/LinkedIn content. surpriseFits from outside "${domainClassification.domain}" only.\n\n${profileContent}`,
            resolvedTier,
            reqId,
            userId: effectiveUserId,
          });

          // Check for total failure
          const failedCalls = parallelResults.filter(r => !r.ok);
          if (failedCalls.length === parallelResults.length) {
            const firstFail = failedCalls[0] as CareerParallelFailure;
            throw new MeritRefundable(firstFail.status || 500, firstFail.error || 'All career analysis calls failed');
          }

          // Parse base result
          const baseResult = parallelResults.find(r => r.callType === 'base');
          if (!baseResult || !baseResult.ok) {
            throw new MeritRefundable(500, 'Base career analysis call failed');
          }
          // 260713-hrd (ED-5): truncation is terminal on THIS branch too. This branch is
          // dead today (userContext is null on the live worker path), but if it is ever
          // revived it must not resurrect the silent-stub bug — so the check goes in now,
          // BEFORE repairTruncatedJSON, exactly as on the live path.
          if (isTruncatedResponse(baseResult.raw)) {
            return truncatedOutputResponse(log, {
              tier: resolvedTier,
              maxTokens: getMaxOutput('careerCompass', resolvedTier),
              outLen: baseResult.text.length,
            });
          }
          let analysisResult: any;
          try {
            const jsonContent = repairTruncatedJSON(baseResult.text.trim());
            analysisResult = JSON.parse(jsonContent);
          } catch {
            throw new MeritRefundable(500, 'JSON parse failed for base career analysis');
          }

          // Paid output is assembled from three required envelopes. A missing growth or
          // extras sibling is not a partial success: fail before completeness/save.
          if (resolvedTier !== 'free') {
            for (const callType of ['growth', 'elite-extras'] as const) {
              const splitResult = parallelResults.find(r => r.callType === callType);
              if (!splitResult || !splitResult.ok) {
                const failure = splitResult as CareerParallelFailure | undefined;
                throw new MeritRefundable(
                  failure?.status || 500,
                  failure?.error || `${callType} career analysis call failed`,
                );
              }
              if (isTruncatedResponse(splitResult.raw)) {
                return truncatedOutputResponse(log, {
                  tier: resolvedTier,
                  maxTokens: CAREER_CALL_CONFIGS.find(cfg => cfg.callType === callType)!.maxTokensElite,
                  outLen: splitResult.text.length,
                });
              }

              const splitRepair = repairTruncatedJSONChecked(splitResult.text.trim());
              if (!splitRepair.ok) {
                return await incompleteOutputResponse(log, {
                  tier: resolvedTier,
                  missing: [`Malformed ${callType} output`],
                  refund: MERIT_SYSTEM_ENABLED
                    ? { userId: userContext.userId, transactionId: directTxId }
                    : undefined,
                });
              }
              try {
                Object.assign(analysisResult, JSON.parse(splitRepair.json));
              } catch {
                throw new MeritRefundable(500, `JSON parse failed for ${callType} career analysis`);
              }
            }

            const compensation = analysisResult.compensationIntelligence;
            if (
              compensation &&
              typeof compensation === 'object' &&
              Array.isArray(analysisResult.smartApplicationStrategy)
            ) {
              compensation.applicationStrategy = analysisResult.smartApplicationStrategy;
            }
          }

          analysisResult.detectedDomain = domainClassification.domain;
          analysisResult.domainEvidence = domainClassification.evidence;
          delete analysisResult.jobs;

          // D-07: Defense-in-depth -- server-side whitelist strip regardless of prompt compliance
          applyCareerTierShape(analysisResult as Record<string, unknown>, resolvedTier);
          applyCareerCompassFreeOutputPolicy(analysisResult as Record<string, unknown>, resolvedTier);
          capCareerSurpriseFits(analysisResult as Record<string, unknown>);
          // 260713-hrd (ED-5): NARROW mapping — only CareerIncompleteOutput becomes a
          // terminal 422. A MeritRefundable(500) from the persist/extraction helpers stays
          // a retryable 5xx. See the identical, commented block on the legacy tail.
          try {
            assertCareerOutputComplete(analysisResult as Record<string, unknown>, resolvedTier);
          } catch (completenessError) {
            if (completenessError instanceof CareerIncompleteOutput) {
              return await incompleteOutputResponse(log, {
                tier: resolvedTier,
                missing: completenessError.missing,
                refund: MERIT_SYSTEM_ENABLED
                  ? { userId: userContext.userId, transactionId: directTxId }
                  : undefined,
              });
            }
            throw completenessError;
          }

          // 22-03 D-15: Additive reuse fields. On this branch the short-circuit
          // did not fire (neither prior, or
          // allowResumeOnly with resume-only content); expose whatever reuse
          // happened so the frontend contract stays stable.
          analysisResult.reusedLinkedinGrade = reusedLinkedinGrade;
          analysisResult.linkedinGradeDate = priorLinkedinCreatedAt;

          // 22-04 D-18/D-19 Pitfall 2 fix: merit-path bypasses usage_tracking INSERT.
          // Restore History visibility by writing a row via record_ai_usage. Entitlement
          // is already enforced by withMerits; this call only writes the audit row.
          // Non-blocking — a failed insert logs but does NOT fail the user request.
          // This is the full PDF-parse / parallel fan-out convergence point; the
          // Pro/Elite short-circuit branch above has its own INSERT and returns before
          // reaching here, so exactly one INSERT fires per successful run.
          const analysisId = await persistCareerResultAndRecordUsage(supabase, {
            userId: userContext.userId,
            analysisResult,
            log,
            label: 'Merit path',
          });
          await writeCareerAnalysisCache(supabase, {
            cacheKey: careerCacheKey,
            userId: userContext.userId,
            tier: resolvedTier,
            variant: careerCacheVariant,
            result: analysisResult,
            analysisId,
          });

          return new Response(
            JSON.stringify(analysisResult),
            { headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } }
          );
        },
        {
          precheck_cache: () => readCareerAnalysisCache(supabase, { cacheKey: careerCacheKey }),
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

    // === Legacy path (unchanged — MIG-05) ===
    const authenticatedUserId = userContext?.userId ?? userId;

    console.log('Analyzing career - LinkedIn URL:', linkedinUrl, 'Has PDF content:', !!acceptedLinkedinPdfContent, 'Tier:', resolvedTier);

    // ── Merits are the ONLY paywall (260713-hrd, RC-3) ───────────────────────────
    // The legacy `can_perform_ai_action` entitlement gate used to sit HERE, and it
    // was a second, independent quota running alongside Merits. It allowed Free users just 3
    // AI actions per cycle counted across ALL features — and Career Compass then told those
    // users to go run Resume Analysis and LinkedIn Grader first. Those two priors consumed
    // 2 of the 3 actions, so the feature deadlocked itself: production showed Free users
    // sitting at exactly 3 usage rows (`resume_analysis`, `linkedin_grading`), permanently
    // 429'd on the third. They were charged Merits at submit, denied here, and — because
    // that 429 was classified retryable — the worker then retried the permanent denial 8
    // times before giving up.
    //
    // The gate is gone. Entitlement is decided ONCE, by `withMerits` at submit. We still
    // WRITE the `usage_tracking` row (see `persistCareerResultAndRecordUsage` →
    // `recordUsageWithAnalysis`) so History and analytics are unaffected — we record usage,
    // we just never block on it. `_shared/usage-checker.ts` is left untouched; the other
    // features still gate on it.

    // Validate inputs - resume required; LinkedIn optional (260713-hrd)
    if (!resumeFilePath) {
      return new Response(
        JSON.stringify({ error: 'Resume file is required' }),
        { status: 400, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } }
      );
    }

    // ── 260713-hrd (ED-6): LinkedIn is OPTIONAL. The 400 gate is GONE. ───────────
    // This was the hard-fail that made the UI a liar: the upload form labelled the
    // LinkedIn PDF "(optional)" while THIS line returned 400 "LinkedIn PDF content is
    // required" and killed the run. A resume-only submit is now a first-class,
    // fully-supported input — Career Compass Free is standalone (locked operator
    // decision). The LinkedIn URL was already optional; the PDF now is too.
    //
    // Both are still consumed as ENRICHMENT when present (readPersistedLinkedInText
    // auto-reuses a previously-saved profile), and both still feed buildCareerCacheKey
    // as optional hash inputs. They just cannot block a run any more.
    //
    // The resume gate above STAYS. A resume is genuinely required.

    // 06-01 (FEAT-05): the main career analysis (resume/LinkedIn extraction ->
    // domain classification -> AI -> assembly) is hoisted VERBATIM into this closure
    // so the SAME body drives BOTH the runAnalysisLifecycle('career_compass')
    // executor (flag ON) and the byte-identical dormant fall-through (flag OFF).
    // Early-return `Response` objects (input/extraction 400s, 429/402/503) are
    // preserved exactly; the ONLY change is the tail: instead of persisting +
    // responding inline, it returns `{ analysisResult }` and the caller owns the
    // save + response mapping (dormant = today's unchanged persist + response;
    // executor = save() reconciliation + run_id/recordId envelope).
    const runCareerLegacyCore = async (): Promise<Response | { analysisResult: Record<string, unknown> }> => {
    // Use LinkedIn PDF content
    let linkedInData: string | null = acceptedLinkedinPdfContent;
    console.log('Using LinkedIn PDF content, length:', acceptedLinkedinPdfContent.length);

    // Extract resume text
    let resumeText = typeof resumeTextContent === 'string' ? resumeTextContent.trim() : '';
    let resumeExtractionError: string | null = null;
    const persistedResume = await readPersistedResumeExtraction(supabase, {
      userId: typeof authenticatedUserId === 'string' ? authenticatedUserId : null,
      filePath: typeof resumeFilePath === 'string' ? resumeFilePath : null,
      log,
    });
    if (resumeText.length < 100 && persistedResume?.text) {
      resumeText = persistedResume.text;
      log.info('resume-persisted-extraction-reused', { resumeId: persistedResume.id });
    }
    const isDocx = resumeFilePath.toLowerCase().endsWith('.docx') || resumeFilePath.toLowerCase().endsWith('.doc');

    if (resumeText.length >= 100) {
      console.log('Using client-provided resume text content, length:', resumeText.length);
    } else {
      // Download resume only if client text was not provided/insufficient
      const resumeDownload = await supabase.storage.from('resumes').download(resumeFilePath);

      if (resumeDownload.data && !resumeDownload.error) {
        if (isDocx) {
          // DOCX: extract text from XML content within the ZIP structure
          console.log('DOCX file detected, using text extraction...');
          try {
            const uint8Array = new Uint8Array(await resumeDownload.data.arrayBuffer());
            const decoder = new TextDecoder('utf-8', { fatal: false });
            const rawText = decoder.decode(uint8Array);
            // DOCX files contain XML with <w:t> tags holding text
            const xmlTextMatches = rawText.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
            if (xmlTextMatches.length > 0) {
              resumeText = xmlTextMatches
                .map(m => { const match = m.match(/>([^<]+)</); return match ? match[1] : ''; })
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
              console.log('DOCX XML text extracted, length:', resumeText.length);
            }
            
            // If XML extraction didn't yield enough, use AI to interpret raw content
            if (resumeText.length < 100) {
              console.log('DOCX XML extraction insufficient, trying AI extraction...');
              const aiResp = await invokeAnthropicText({
                model: ANTHROPIC_MODEL_TEXT,
                messages: [{
                  role: 'user',
                  content: `Extract ALL text from this DOCX resume file raw content. Preserve structure (name, contact, education, experience, skills). Return ONLY extracted text.\n\n${rawText.substring(0, 12000)}`
                }],
                maxTokens: 2000,
                temperature: 0,
                // Utility EXTRACTION call, not an analysis call — the 02-07 report SQL
                // excludes these names so they cannot drag the Career Compass mean down.
                telemetry: {
                  feature: 'career_compass',
                  tier: resolvedTier,
                  callName: 'docx-extract-legacy',
                  reqId,
                  userId: effectiveUserId ?? undefined,
                  attempt: 1,
                },
              });

              if (aiResp.ok) {
                const aiText = aiResp.text;
                if (aiText && aiText.length >= 50) {
                  resumeText = aiText;
                  console.log('DOCX AI text extracted, length:', resumeText.length);
                }
              } else {
                resumeExtractionError = aiResp.error;
                console.error('DOCX AI extraction failed:', aiResp.error);
              }
            }
          } catch (docxError) {
            console.error('DOCX extraction failed:', docxError);
            resumeExtractionError = docxError instanceof Error ? docxError.message : 'DOCX extraction failed';
          }
        } else {
          // PDF extraction (existing logic)
          try {
            const pdfBuffer = await resumeDownload.data.arrayBuffer();
            const extraction = await extractPDFTextWithMetadata(pdfBuffer, 'resume');
            if (extraction.ok) {
              resumeText = extraction.text;
              console.log('Resume text extracted, length:', resumeText.length);
              if (persistedResume?.id && typeof authenticatedUserId === 'string') {
                const persistResult = await persistAcceptedExtraction({
                  supabase,
                  target: 'resume',
                  userId: authenticatedUserId,
                  resumeId: persistedResume.id,
                  result: extraction,
                });
                if (!persistResult.ok) {
                  log.warn('resume-persisted-extraction-write-failed', { error: persistResult.error });
                }
              }
            } else {
              resumeExtractionError = extraction.reason;
            }
          } catch (pdfError) {
            console.error('PDF extraction failed:', pdfError);
            resumeExtractionError = pdfError instanceof Error ? pdfError.message : 'PDF extraction failed';
          }
        }
      } else {
        console.error('Failed to download resume:', resumeDownload.error);
        resumeExtractionError = resumeDownload.error?.message || 'Failed to download resume from storage';
      }
    }

    // OCR fallback (scanned/image-based resume): client provides page images
    if ((!resumeText || resumeText.length < 100) && Array.isArray(resumeOcrImages) && resumeOcrImages.length > 0) {
      console.log('Attempting OCR from client-provided resume images:', resumeOcrImages.length);
      try {
        const imageBlocks = await buildAnthropicImageBlocks(resumeOcrImages, 3);
        if (imageBlocks.length === 0) {
          resumeExtractionError = 'No valid OCR images could be prepared for Anthropic';
        } else {
          const ocrResp = await invokeAnthropicText({
            model: ANTHROPIC_MODEL_TEXT,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Extract ALL readable text from these resume images. Preserve section order if possible. Return only the extracted text with no commentary.',
                  },
                  ...imageBlocks,
                ],
              },
            ],
            maxTokens: 4000,
            temperature: 0,
            // Utility EXTRACTION call, not an analysis call (see docx-extract-legacy).
            telemetry: {
              feature: 'career_compass',
              tier: resolvedTier,
              callName: 'ocr-extract-legacy',
              reqId,
              userId: effectiveUserId ?? undefined,
              attempt: 1,
            },
          });

          if (!ocrResp.ok) {
            console.error('OCR gateway error:', ocrResp.status, ocrResp.error);
            resumeExtractionError = ocrResp.error;
          } else if (ocrResp.text && ocrResp.text.length >= 100) {
            resumeText = ocrResp.text;
            console.log('Resume OCR extracted, length:', resumeText.length);
            resumeExtractionError = null;
          } else {
            console.error('OCR returned insufficient text');
            resumeExtractionError = 'OCR returned insufficient text from resume images';
          }
        }
      } catch (e) {
        console.error('OCR fallback error:', e);
        resumeExtractionError = e instanceof Error ? e.message : 'OCR fallback error';
      }
    }

    // 260713-hrd (ED-6): the RESUME is the only required source. LinkedIn is optional
    // enrichment — an absent or unreadable LinkedIn PDF degrades to a resume-only
    // analysis, it never fails the run.
    const hasLinkedIn = linkedInData && linkedInData.length > 100;
    const hasResume = resumeText && resumeText.length > 100;

    console.log('Data sources available - LinkedIn:', hasLinkedIn, 'Resume:', hasResume);

    if (!hasResume) {
      return new Response(
        JSON.stringify({
          error: 'Unable to extract text from your resume.',
          suggestion: 'Resume text extraction failed. If this is a scanned PDF, re-upload and ensure the first page is readable. If it is text-based, this may be an OCR/parser issue and retrying should work after deployment fixes.',
          details: {
            resumeExtracted: false,
            linkedinExtracted: Boolean(hasLinkedIn),
            reason: resumeExtractionError,
            hadResumeOcrImages: Array.isArray(resumeOcrImages) && resumeOcrImages.length > 0
          }
        }),
        { status: 400, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } }
      );
    }

    if (!hasLinkedIn) {
      log.info('career-resume-only-run', { reason: 'no-linkedin-content', tier: resolvedTier });
    }

    // Build the combined profile content
    // IMPORTANT: Keep context bounded to reduce latency and avoid token bloat on large PDFs.
    // Hard per-tier INPUT cap (quick task 260608-p5k): getMaxInputChars('careerCompass', tier).
    const MAX_CONTEXT_CHARS = getMaxInputChars('careerCompass', resolvedTier) ?? 12000;
    const resumeTrimmed = resumeText.length > MAX_CONTEXT_CHARS ? resumeText.slice(0, MAX_CONTEXT_CHARS) : resumeText;
    const linkedInSource = hasLinkedIn ? linkedInData! : '';
    const linkedInTrimmed = linkedInSource.length > MAX_CONTEXT_CHARS ? linkedInSource.slice(0, MAX_CONTEXT_CHARS) : linkedInSource;

    if (resumeTrimmed.length !== resumeText.length || linkedInTrimmed.length !== linkedInSource.length) {
      console.log('Truncated inputs for speed:', {
        resumeChars: resumeText.length,
        resumeUsed: resumeTrimmed.length,
        linkedinChars: linkedInSource.length,
        linkedinUsed: linkedInTrimmed.length,
      });
    }

    // SEC-07 (D-01): strip high-confidence injection phrases from the user-role resume / LinkedIn
    // content before it enters the Anthropic prompt (single-word terms preserved so legitimate
    // profile text is not corrupted). Length comparison above stays on the raw trimmed values;
    // this is a pre-ingestion defense-in-depth step only.
    const sanitizedResume = sanitizeUserContent(resumeTrimmed, 'analyze-career', log);
    const sanitizedLinkedIn = linkedInTrimmed ? sanitizeUserContent(linkedInTrimmed, 'analyze-career', log) : '';
    // 260713-hrd (ED-6): the resume-only branch. The model is TOLD that LinkedIn is absent
    // so it analyses what it actually has, rather than inventing a profile.
    const profileContent = hasLinkedIn
      ? `=== RESUME CONTENT (TRIMMED) ===\n${sanitizedResume}\n\n=== LINKEDIN PROFILE (TRIMMED) ===\n${sanitizedLinkedIn}\n\n`
      : `=== RESUME CONTENT (TRIMMED) ===\n${sanitizedResume}\n\n=== LINKEDIN PROFILE ===\n(not provided — analyze from resume only)\n\n`;


    // STEP 1: MULTI-DOMAIN CLASSIFICATION
    const { primary: domainClassification, secondary: secondaryDomains, allDomains } = classifyDomains(profileContent);
    const domainConfig = DOMAIN_MAPPING[domainClassification.domainKey];
    
    // Gather roles and fields — cap to primary domain + top secondary to keep prompt lean
    const relevantDomains = allDomains.slice(0, 3);
    const allRelevantRoles = relevantDomains.flatMap(d => DOMAIN_MAPPING[d.domainKey].roles);
    const allRelevantFields = relevantDomains.flatMap(d => DOMAIN_MAPPING[d.domainKey].fields);
    const uniqueRoles = [...new Set(allRelevantRoles)].slice(0, 15);
    const uniqueFields = [...new Set(allRelevantFields)].slice(0, 10);
    
    console.log('=== DOMAIN CLASSIFICATION ===');
    console.log('Primary Domain:', domainClassification.domain);
    console.log('Confidence:', domainClassification.confidence, '%');
    console.log('Evidence keywords:', domainClassification.evidence.join(', '));
    console.log('Secondary Domains:', secondaryDomains.map(d => `${d.domain} (${d.confidence}%)`).join(', '));
    console.log('Total relevant roles:', uniqueRoles.length, 'fields:', uniqueFields.length);

    console.log('Combined profile content length:', profileContent.length);

    // CAREER READINESS ANALYSIS PROMPT - NO JOB LINKS
    // Elite tier gets enhanced compensation intelligence
    const eliteCompensationPrompt = isElite ? `

ELITE TIER - INCLUDE COMPENSATION INTELLIGENCE:

=== CRITICAL: DOMAIN-SPECIFIC COMPENSATION ===
ALL compensation, salary, and strategy data MUST be specific to "${domainClassification.domain}".
You MUST use roles from this domain: ${domainConfig.roles.slice(0, 6).join(', ')}
You MUST reference companies/organizations typical in: ${domainConfig.fields.join(', ')}

DO NOT use generic finance/business examples like "Goldman Sachs", "Financial Analyst", "Investment Banking" unless the detected domain is Business & Economics.

1. **Salary Intelligence**: For each recommended role IN ${domainClassification.domain}, provide:
   - Entry-level salary range (realistic for this domain)
   - Mid-level salary range  
   - Senior-level salary range
   - User's estimated starting salary based on their profile
   - Percentile ranking (where they'd fall in the pay distribution)
   - ROLES MUST BE FROM: ${domainConfig.roles.slice(0, 4).join(', ')}

2. **Role Transition ROI**: For top 3 career moves WITHIN ${domainClassification.domain}, calculate:
   - Salary increase percentage
   - Time to transition (years)
   - ROI on upskilling investment
   - Difficulty rating (Easy/Moderate/Challenging)
   - Example transitions for ${domainClassification.domain}: ${domainConfig.roles[0]} → Senior ${domainConfig.roles[0]}, ${domainConfig.roles[1]} → ${domainConfig.roles[2]}

3. **Smart Application Strategy**: Analyze which roles to target (ALL must be in ${domainClassification.domain}):
   - APPLY: High match (70%+), good ROI
   - MAYBE: Moderate match (50-69%), needs some prep
   - SKIP: Low match (<50%), not worth time investment
   - Companies must be typical for ${domainConfig.fields.slice(0, 3).join(', ')}

4. **5-Year Earnings Projection**: Estimate career earnings trajectory for ${domainClassification.domain}
` : '';

    const currentDate = new Date().toISOString().slice(0, 10);

    // ── The output budget the prompt is written AGAINST (260713-hrd) ──────────
    // Hoisted above the prompt on purpose. The prompt used to hardcode "keep ENTIRE
    // response under 3500 tokens" while the CALL was capped at 2,500 — a prompt that
    // instructed the model to overrun its own budget. Deriving the brevity target from the
    // real cap makes that contradiction structurally impossible.
    const maxTokensForAnalysis = getMaxOutput('careerCompass', resolvedTier);
    // The brevity target is sized to the CONTENT, never derived from the cap (260713-hrd).
    //
    // It used to be `maxTokensForAnalysis * 0.8`, which for Elite is 0.8 * 10 000 = 8 000 —
    // so the prompt told the model "keep the ENTIRE response under 8000 tokens". It duly
    // padded toward that target and blew through the 10 000 hard cap: a REAL Elite run on
    // Preview came back `422 output_truncated` after 87s. That is the ORIGINAL bug inverted.
    // Before, the prompt asked for more than the cap could emit; after, the prompt asked for
    // as much as the cap could emit, which is the same collision from the other side.
    //
    // A cap is a guardrail, not a target. Every COMPLETE Elite report we have on record ran
    // 9 008-12 476 chars — roughly 2 600-3 600 output tokens. So the target is set from that
    // observed reality with headroom, and the cap sits ~2x above it, which is what makes an
    // overshoot land instead of truncate.
    const brevityTargetTokens = CAREER_BREVITY_TARGET_TOKENS[resolvedTier];

    // ── The JSON skeleton is TIER-CONDITIONAL (260713-hrd) ────────────────────
    // It used to ask EVERY tier for the FULL schema — roadmap, roleRoadmaps (3 roles x 5
    // phases x 3-5 items!), skillGaps — and then `applyCareerTierShape` deleted all of it
    // for Free. That is what forced ~3,000 tokens of generation through a 2,500-token cap:
    // we were paying (in tokens, in latency, and in truncation) to produce output we
    // immediately threw in the bin. Free now ASKS for exactly the Free scope.
    //
    // Free  (locked): Career DNA, career fields, recommended roles, surprise fits, readiness.
    // Elite (locked): the above + skills gaps + 12-month roadmap(s) + compensation intelligence.
    const freeSkeletonFields = `"detectedDomain":"${domainClassification.domain}","domainEvidence":${JSON.stringify(domainClassification.evidence)},"roleReadinessScore":0,"targetRole":"","careerDNA":"4 sentences: identity, skills, achievements, differentiator. Personal, evidence-based.","whatYouHave":["from resume"],"roleReadinessBreakdown":{"overallScore":0,"targetRole":""},"careerFields":[{"title":"","matchScore":0,"whyMatch":"cite specific resume/LinkedIn evidence","whyMatchDetails":["evidence 1","evidence 2","evidence 3"],"requiredSkills":[""],"salaryRange":"","industryOutlook":"","timeline":"","recommendedRoles":[""]}],"surpriseFits":[{"role":"MUST be outside primary domain","readinessScore":0,"whySurprising":"cite specific cross-domain evidence","transferableSkills":["skill1","skill2","skill3"]}],"roles":[{"title":"","description":"","averageSalary":"","skillAlignmentScore":0,"qualificationSteps":[""]}]`;


    const eliteCoreSkeletonFields = `"roleReadinessScore":0,"targetRole":"","careerDNA":"4 sentences: identity, skills, achievements, differentiator. Personal, evidence-based.","whatYouHave":["from resume"],"careerFields":[{"title":"","matchScore":0,"whyMatch":"cite specific resume/LinkedIn evidence","whyMatchDetails":["evidence 1","evidence 2","evidence 3"],"requiredSkills":[""],"salaryRange":"","industryOutlook":"","timeline":"","recommendedRoles":[""]}],"surpriseFits":[{"role":"MUST be outside primary domain","readinessScore":0,"whySurprising":"cite specific cross-domain evidence","transferableSkills":["skill1","skill2","skill3"]}],"roles":[{"title":"","description":"","averageSalary":"","skillAlignmentScore":0,"skillGaps":[""],"qualificationSteps":[""]}]`;

    // The shared rules. The roadmap / skill-gap / readiness-detail rules apply ONLY to the
    // tier that is actually being asked for those sections.
    const sharedRules = `(1) Return honest score no matter what. Don't overinflate or underinflate the score, it must give the user a reality check. An honest score is how we'll build trust. (2) Every recommendation cites actual resume/LinkedIn content — no generic advice. (3) surpriseFits = cross-domain roles ONLY, each ≥75% readiness, exactly 3+ specific transferableSkills. (4) careerFields only if matchScore≥75. (5) Roles must match actual experience level — no VP/Senior roles for students with 0-1 internships.`;
    const eliteRules = ` (6) Roadmap steps name specific courses/certs/companies (e.g. "Google Data Analytics Certificate on Coursera", not "take a data course"). (7) Include at least 1 Critical-priority skill gap.`;

    const brevityBlock = isElite
      // 260713-hrd: these counts are a TOKEN BUDGET, not a style preference.
      //
      // This base call owns the career analysis; compensation is generated by a second,
      // independently constrained call. At the old counts (careerFields 3-5, roles 3-5,
      // roleRoadmaps 3 roles x 5 phases x 3-5 items) that is ~6-9k output tokens, and a real
      // Elite run on Preview blew through the 10 000-token cap and came back
      // `422 output_truncated` after 87s. Raising the cap is NOT available: the call already
      // runs ~87s against a 90s per-call timeout (TIER_TIMEOUTS.elite.career), so more tokens
      // means a timeout instead of a truncation.
      //
      // So the ASK is sized to the budget. `roleRoadmaps` is by far the biggest consumer
      // (roles x phases x items compounds), and it is the one trimmed hardest. Every base
      // section the operator named as must-work remains requested in full.
      ? `BREVITY CRITICAL — keep the ENTIRE response under 2200 tokens. These counts are HARD LIMITS, not suggestions — exceeding them truncates the response and the user gets nothing:
- careerDNA: 4 sentences (≤90 words total) | whatYouHave: 3 items
- careerFields: EXACTLY 3 (all ≥75% match) | surpriseFits: EXACTLY 2-3 (all ≥75% readiness, ≥3 transferableSkills each) | roles: EXACTLY 3
- Per-item sub-array HARD LIMITS (these are the sizes that overflow the budget — never exceed): whyMatchDetails ≤3 items | requiredSkills ≤5 items | recommendedRoles ≤3 items | per-role qualificationSteps ≤4 items | per-role skillGaps ≤3 items
- String brevity: whyMatch/whySurprising ≤200 chars each; each whyMatchDetails/qualificationSteps/skillGaps/transferableSkills entry ≤120 chars; role description ≤200 chars; salaryRange/timeline/industryOutlook/averageSalary fields ≤60 chars each.
- Do NOT emit a top-level skillGaps section, roleReadinessBreakdown, roadmap, roleRoadmaps, compensationIntelligence, or smartApplicationStrategy.`
      : `BREVITY CRITICAL — keep the ENTIRE response under ${brevityTargetTokens} tokens:
- careerDNA: 4 sentences | whatYouHave: 3 items
- careerFields: EXACTLY 3 (all ≥75% match) | surpriseFits: EXACTLY 2 (all ≥75% readiness, ≥3 transferableSkills each) | roles: EXACTLY 3
- Do NOT emit skillGaps, roadmap, roleRoadmaps or compensationIntelligence — they are not part of this response.`;

    const systemPrompt = `You are Strivo — a recruiter-grade career readiness evaluator. Deliver accurate, personalized career guidance. No generic advice. No job URLs. Reference SPECIFIC resume/LinkedIn content.
TODAY'S DATE: ${currentDate}. Treat any dates up to today as past dates, not future.
RULES: ${sharedRules}${isElite ? eliteRules : ''}

DOMAIN: ${domainClassification.domain} (${domainClassification.confidence}%) | Evidence: ${domainClassification.evidence.join(', ')}
${secondaryDomains.length > 0 ? `Secondary: ${secondaryDomains.map(d => `${d.domain}(${d.confidence}%)`).join(', ')}` : ''}
Fields: ${uniqueFields.join(', ')}
Roles: ${uniqueRoles.join(', ')}

Recommend roles from ALL relevant domains. Cross-domain discovery is mandatory.

${brevityBlock}

Return ONLY valid JSON:
{${isElite ? eliteCoreSkeletonFields : freeSkeletonFields}}

Tone: Direct, professional, recruiter-like. No emojis, no hype.`;

    const promptParams: CareerPromptParams = {
      currentDate,
      domain: domainClassification.domain,
      domainConfidence: domainClassification.confidence,
      domainEvidence: domainClassification.evidence,
      secondaryDomains,
      uniqueRoles,
      uniqueFields,
      domainConfig,
    };
    const eliteGrowthSystemPrompt = isElite ? buildCareerGrowthPrompt(promptParams) : '';

    const eliteExtrasSystemPrompt = isElite ? `You are Strivo — generating Elite compensation intelligence for a career profile. Do not repeat the base career analysis.
${eliteCompensationPrompt}

BREVITY CRITICAL — keep the ENTIRE response under 1200 tokens:
- salaryBands: EXACTLY 3 roles
- roleTransitionROI: EXACTLY 2 transitions
- applicationStrategy: EXACTLY 3 recommendations

Return ONLY valid JSON:
{"compensationIntelligence":{"salaryBands":[{"role":"","entryLevel":"","midLevel":"","seniorLevel":"","yourEstimate":"","percentile":0}],"roleTransitionROI":[{"from":"","to":"","salaryIncrease":"","timeToTransition":"","roi":"","difficulty":""}],"fiveYearEarnings":"","earningsInsight":""},"smartApplicationStrategy":[{"title":"","company":"","matchScore":0,"recommendation":"apply|maybe|skip","reason":"","competitiveness":"","timeToApply":""}]}

Tone: Direct, strategic, data-driven. No emojis, no hype.` : '';

    const userPrompt = `Analyze this profile. Be concise — every field references specific resume/LinkedIn content. surpriseFits from outside "${domainClassification.domain}" only.

${profileContent}`;

    const ANTHROPIC_MODEL_FALLBACK = (Deno.env.get('ANTHROPIC_MODEL_FALLBACK') || '').trim();
    const primaryModel = ANTHROPIC_MODEL_TEXT;
    // `maxTokensForAnalysis` is declared once, above, where the prompt's brevity target is
    // derived from it. Re-declaring it here is a SyntaxError that kills the whole module.
    console.log('Using Anthropic model:', primaryModel, 'for tier:', resolvedTier, 'maxTokens:', maxTokensForAnalysis);

    let analysisResult: any = null;
    let lastParseError = '';
    let lastAiError = '';

    // ── The model call (quick task 260713-hrd · RC-2) ─────────────────────────
    // WAS: a bespoke 3-attempt loop with a HARDCODED output cap (2,500 free / 3,500 elite)
    // — roughly 4x below the schema — under a `core` timeout, retrying blindly. The
    // computed `maxTokensForAnalysis` above was LOGGED and thrown away.
    //
    // NOW: `_shared/ai-retry.ts::invokeWithRetry` (the same helper grade-linkedin uses
    // after 260713-2ay) with the REAL per-tier budget, the dedicated 90s `career` wall,
    // and ONE request-scoped deadline bounding every attempt. It knows a 408 is transient
    // (the 260713-2ay bug) and clamps each attempt's timeout to the remaining budget, so
    // attempt 2 can never overrun the 165s total.
    //
    // The ANTHROPIC_MODEL_FALLBACK candidate walk is PRESERVED: try the primary first, and
    // only fall back to a second model when the primary is genuinely overloaded.
    const modelCandidates = [primaryModel, ANTHROPIC_MODEL_FALLBACK]
      .filter(Boolean)
      .filter((m, i, arr) => arr.indexOf(m) === i) as string[];

    type CareerAiResponse = Awaited<ReturnType<typeof invokeAnthropicText>>;
    let aiResponse: CareerAiResponse | null = null;
    let eliteGrowthResponse: CareerAiResponse | null = null;
    let eliteExtrasResponse: CareerAiResponse | null = null;
    const eliteBaseMaxTokens = CAREER_CALL_CONFIGS.find(cfg => cfg.callType === 'base')!.maxTokensElite;
    const eliteGrowthMaxTokens = CAREER_CALL_CONFIGS.find(cfg => cfg.callType === 'growth')!.maxTokensElite;
    const eliteExtrasMaxTokens = CAREER_CALL_CONFIGS.find(cfg => cfg.callType === 'elite-extras')!.maxTokensElite;

    for (const model of modelCandidates) {
      const basePromise: Promise<CareerAiResponse> = aiResponse?.ok
        ? Promise.resolve(aiResponse)
        : invokeWithRetry(
          {
            model,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            maxTokens: isElite ? eliteBaseMaxTokens : maxTokensForAnalysis,
            // Constrained decoding is load-bearing here. Elite uses two smaller
            // schemas because Anthropic rejects the all-in-one compiled grammar.
            outputSchema: getCareerOutputSchema(isElite ? 'elite' : 'free', 'base'),
            temperature: 0,
            fixtureKey: 'analyze_career',
            timeoutMs: getTimeout(resolvedTier as Tier, 'career'),
            // TOK-02: this is the CONFIRMED-LIVE Career Compass path (06-01 / R-06-01).
            // invokeWithRetry spreads params straight into invokeAnthropicText, so the
            // label rides through unchanged. Its internal retries reuse attempt=1; that
            // is safe for cap-sizing because it only retries FAILED (ok:false) calls,
            // and only successful rows carry usage numbers.
            telemetry: {
              feature: 'career_compass',
              tier: resolvedTier,
              callName: 'base',
              reqId,
              userId: typeof effectiveUserId === 'string' ? effectiveUserId : undefined,
              attempt: 1,
            },
          },
          log,
          { deadlineAt },
        );

      const extrasPromise: Promise<CareerAiResponse | null> = !isElite
        ? Promise.resolve(null)
        : eliteExtrasResponse?.ok
        ? Promise.resolve(eliteExtrasResponse)
        : invokeWithRetry(
          {
            model,
            system: eliteExtrasSystemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            maxTokens: eliteExtrasMaxTokens,
            outputSchema: getCareerOutputSchema('elite', 'elite-extras'),
            temperature: 0,
            fixtureKey: 'analyze_career',
            timeoutMs: getTimeout(resolvedTier as Tier, 'career'),
            telemetry: {
              feature: 'career_compass',
              tier: resolvedTier,
              callName: 'elite-extras',
              reqId,
              userId: typeof effectiveUserId === 'string' ? effectiveUserId : undefined,
              attempt: 1,
            },
          },
          log,
          { deadlineAt },
        );

      const growthPromise: Promise<CareerAiResponse | null> = !isElite
        ? Promise.resolve(null)
        : eliteGrowthResponse?.ok
        ? Promise.resolve(eliteGrowthResponse)
        : invokeWithRetry(
          {
            model,
            system: eliteGrowthSystemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            maxTokens: eliteGrowthMaxTokens,
            outputSchema: getCareerOutputSchema('elite', 'growth'),
            temperature: 0,
            fixtureKey: 'analyze_career',
            timeoutMs: getTimeout(resolvedTier as Tier, 'career'),
            telemetry: {
              feature: 'career_compass',
              tier: resolvedTier,
              callName: 'growth',
              reqId,
              userId: typeof effectiveUserId === 'string' ? effectiveUserId : undefined,
              attempt: 1,
            },
          },
          log,
          { deadlineAt },
        );

      const [baseResult, growthResult, extrasResult]: [
        CareerAiResponse,
        CareerAiResponse | null,
        CareerAiResponse | null,
      ] = await Promise.all([basePromise, growthPromise, extrasPromise]);
      aiResponse = baseResult;
      eliteGrowthResponse = growthResult;
      eliteExtrasResponse = extrasResult;

      const failedResponses = [aiResponse, eliteGrowthResponse, eliteExtrasResponse]
        .filter((response): response is Extract<CareerAiResponse, { ok: false }> => response !== null && !response.ok);
      if (failedResponses.length === 0) break;

      for (const failure of failedResponses) {
        console.error('Anthropic AI error:', failure.status, failure.error);
      }
      lastAiError = failedResponses.map(failure => failure.error).join(' | ');

      // Only walk to the fallback model when every failed call is overloaded. A
      // successful base call is retained while only its failed extras sibling retries.
      if (
        failedResponses.every(failure => isAnthropicOverloaded(failure.status, failure.error)) &&
        model !== ANTHROPIC_MODEL_FALLBACK &&
        ANTHROPIC_MODEL_FALLBACK
      ) {
        continue;
      }
      break;
    }

    const failedResponses = [aiResponse, eliteGrowthResponse, eliteExtrasResponse]
      .filter((response): response is Extract<CareerAiResponse, { ok: false }> => response !== null && !response.ok);
    const rateLimitFailure = failedResponses.find(failure => failure.status === 429);
    if (rateLimitFailure) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } },
      );
    }
    const billingFailure = failedResponses.find(failure =>
      failure.status === 402 || (failure.status === 400 && failure.error.toLowerCase().includes('credit'))
    );
    if (billingFailure) {
      return new Response(
        JSON.stringify({ error: 'Anthropic billing/credits issue.', details: billingFailure.error }),
        { status: 402, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } },
      );
    }

    if (
      !aiResponse ||
      !aiResponse.ok ||
      (isElite && (!eliteGrowthResponse || !eliteGrowthResponse.ok)) ||
      (isElite && (!eliteExtrasResponse || !eliteExtrasResponse.ok))
    ) {
      const overloaded = failedResponses.length > 0 &&
        failedResponses.every(failure => isAnthropicOverloaded(failure.status, failure.error));
      if (overloaded) {
        return new Response(
          JSON.stringify({
            error: 'AI provider is temporarily overloaded. Please retry in 1-2 minutes.',
            details: lastAiError,
            retryable: true,
            functionVersion: FUNCTION_VERSION,
          }),
          { status: 503, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(lastAiError || 'Anthropic AI request failed');
    }

    const content = aiResponse.text.trim();
    if (!content) {
      throw new Error('No content in AI response');
    }
    const eliteGrowthContent = isElite && eliteGrowthResponse?.ok
      ? eliteGrowthResponse.text.trim()
      : '';
    if (isElite && !eliteGrowthContent) {
      throw new Error('No content in Elite growth response');
    }
    const eliteExtrasContent = isElite && eliteExtrasResponse?.ok
      ? eliteExtrasResponse.text.trim()
      : '';
    if (isElite && !eliteExtrasContent) {
      throw new Error('No content in Elite compensation response');
    }

    // ── TRUNCATION CHECK — BEFORE repairTruncatedJSON, ALWAYS (260713-hrd, ED-5) ──
    // This is THE fix for the silent-stub bug. If the model ran out of output budget
    // mid-generation, the JSON below is a fragment. repairTruncatedJSON would close the
    // braces and hand back something that PARSES — and we would persist it as a
    // successful, billed analysis. Production is full of exactly those: 1,584-3,551 chars,
    // 7-8 top-level keys, the `roles` key absent entirely. Fail terminally instead, and
    // refund. Order matters: this MUST stay above the repair call.
    if (isTruncatedResponse(aiResponse.raw)) {
      return truncatedOutputResponse(log, {
        tier: resolvedTier,
        maxTokens: isElite ? eliteBaseMaxTokens : maxTokensForAnalysis,
        outLen: content.length,
      });
    }
    if (isElite && eliteExtrasResponse?.ok && isTruncatedResponse(eliteExtrasResponse.raw)) {
      return truncatedOutputResponse(log, {
        tier: resolvedTier,
        maxTokens: eliteExtrasMaxTokens,
        outLen: eliteExtrasContent.length,
      });
    }
    if (isElite && eliteGrowthResponse?.ok && isTruncatedResponse(eliteGrowthResponse.raw)) {
      return truncatedOutputResponse(log, {
        tier: resolvedTier,
        maxTokens: eliteGrowthMaxTokens,
        outLen: eliteGrowthContent.length,
      });
    }

    log.info('ai-response-received', {
      responseLen: content.length + eliteGrowthContent.length + eliteExtrasContent.length,
      baseLen: content.length,
      growthLen: eliteGrowthContent.length,
      extrasLen: eliteExtrasContent.length,
      tail200: (eliteExtrasContent || content).slice(-200),
    });

    // ── LOSS GUARD — BEFORE parse (elite-cc-output-incomplete) ──
    // A repair that discards most of the buffer is not a repair; it is silent data
    // loss that still PARSES. That is exactly how a 28,905-char Elite report became a
    // 6,509-char stub which sailed through JSON.parse and then tripped the
    // completeness gate as a misleading `output-incomplete`. Fail terminally and
    // loudly instead. 422 (NOT a throw) is load-bearing for the same reason as the
    // truncation check above: the legacy tail below turns a throw into a RETRYABLE
    // 500, and re-running a deterministic temperature-0 failure just burns the
    // user's time and money before refunding.
    const repair = repairTruncatedJSONChecked(content);
    if (!repair.ok) {
      // Shape probe decides Fix Options A-vs-B, which tail500 alone cannot: if the
      // top-level object BALANCES (`jsonEndsAt` non-null) the remainder is trailing
      // prose and extraction should cut there — and a balanced-but-incomplete object
      // means the model answered in prose instead of filling the skeleton, which no
      // parser fix can cure. If it never balances, this is real structural truncation.
      const shape = describeBufferShape(content);
      log.error('json-repair-lossy', {
        tier: resolvedTier,
        error: repair.error,
        originalLen: repair.originalLen,
        repairedLen: repair.repairedLen,
        shape,
        tail500: content.slice(-500),
      });
      return new Response(
        JSON.stringify({
          error: 'incomplete_output',
          message: 'The analysis came back malformed. Please try again.',
          retryable: false,
        }),
        { status: 422, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } },
      );
    }

    try {
      const jsonContent = repair.json;
      analysisResult = JSON.parse(jsonContent);
      if (jsonContent.length !== content.trim().replace(/^```(?:json)?\s*/,'').replace(/```\s*$/,'').length) {
        log.warn('json-repair-applied', { originalLen: content.length, repairedLen: jsonContent.length });
      }
    } catch (parseError) {
      lastParseError = parseError instanceof Error ? parseError.message : 'JSON parse failed';
      log.error('json-parse-failed', { error: lastParseError, tail500: content.slice(-500) });
    }

    if (analysisResult && isElite) {
      const growthRepair = repairTruncatedJSONChecked(eliteGrowthContent);
      if (!growthRepair.ok) {
        log.error('json-repair-lossy', {
          tier: resolvedTier,
          callType: 'growth',
          error: growthRepair.error,
          originalLen: growthRepair.originalLen,
          repairedLen: growthRepair.repairedLen,
          shape: describeBufferShape(eliteGrowthContent),
          tail500: eliteGrowthContent.slice(-500),
        });
        return new Response(
          JSON.stringify({
            error: 'incomplete_output',
            message: 'The analysis came back malformed. Please try again.',
            retryable: false,
          }),
          { status: 422, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } },
        );
      }

      try {
        Object.assign(analysisResult, JSON.parse(growthRepair.json));
      } catch (parseError) {
        lastParseError = parseError instanceof Error ? parseError.message : 'Elite growth JSON parse failed';
        analysisResult = null;
        log.error('json-parse-failed', {
          callType: 'growth',
          error: lastParseError,
          tail500: eliteGrowthContent.slice(-500),
        });
      }
    }

    if (analysisResult && isElite) {
      const extrasRepair = repairTruncatedJSONChecked(eliteExtrasContent);
      if (!extrasRepair.ok) {
        log.error('json-repair-lossy', {
          tier: resolvedTier,
          callType: 'elite-extras',
          error: extrasRepair.error,
          originalLen: extrasRepair.originalLen,
          repairedLen: extrasRepair.repairedLen,
          shape: describeBufferShape(eliteExtrasContent),
          tail500: eliteExtrasContent.slice(-500),
        });
        return new Response(
          JSON.stringify({
            error: 'incomplete_output',
            message: 'The analysis came back malformed. Please try again.',
            retryable: false,
          }),
          { status: 422, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } },
        );
      }

      try {
        const eliteExtrasData = JSON.parse(extrasRepair.json);
        const compensation = eliteExtrasData?.compensationIntelligence;
        if (
          compensation &&
          typeof compensation === 'object' &&
          Array.isArray(eliteExtrasData?.smartApplicationStrategy)
        ) {
          // The established backend contract keeps strategy top-level (CC-04), while
          // the current UI reads the same recommendations from compensationIntelligence.
          // Mirror rather than move so both consumers receive the identical array.
          compensation.applicationStrategy = eliteExtrasData.smartApplicationStrategy;
        }
        Object.assign(analysisResult, eliteExtrasData);
      } catch (parseError) {
        lastParseError = parseError instanceof Error ? parseError.message : 'Elite extras JSON parse failed';
        analysisResult = null;
        log.error('json-parse-failed', {
          callType: 'elite-extras',
          error: lastParseError,
          tail500: eliteExtrasContent.slice(-500),
        });
      }
    }

    if (!analysisResult) {
      throw new Error(lastParseError ? `Invalid JSON response from AI model (${lastParseError})` : (lastAiError || 'Invalid JSON response from AI model'));
    }

    // Ensure domain classification metadata is in response
    analysisResult.detectedDomain = domainClassification.domain;
    analysisResult.domainEvidence = domainClassification.evidence;

    // Remove any job-related fields that might have been generated
    delete analysisResult.jobs;

    // D-07: Defense-in-depth -- server-side whitelist strip regardless of prompt compliance (legacy path)
    applyCareerTierShape(analysisResult as Record<string, unknown>, resolvedTier);
    applyCareerCompassFreeOutputPolicy(analysisResult as Record<string, unknown>, resolvedTier);
    capCareerSurpriseFits(analysisResult as Record<string, unknown>);

    // ── NARROW 422 MAPPING (260713-hrd, ED-5) ────────────────────────────────
    // The try wraps EXACTLY ONE call, and the catch names EXACTLY ONE type. That is
    // deliberate and it is the whole safety property:
    //
    //   ✗ catch (e) { if (e instanceof MeritRefundable) return 422 }  ← NEVER DO THIS.
    //     persistCareerResultAndRecordUsage and the DOCX/OCR helpers ALSO throw
    //     MeritRefundable(500). Those are TRANSIENT. Sweeping them into a terminal,
    //     non-retryable 422 would turn a recoverable DB save blip into a permanently
    //     failed + refunded run that the worker refuses to retry.
    //
    // Only an INCOMPLETE MODEL OUTPUT — deterministic, will produce the identical result
    // on every retry — is terminal here. Everything else keeps its retryable 5xx.
    try {
      assertCareerOutputComplete(analysisResult as Record<string, unknown>, resolvedTier);
    } catch (completenessError) {
      if (completenessError instanceof CareerIncompleteOutput) {
        // runCareerLegacyCore is the async worker/queue path: the Merit deduction was made at
        // submission time (submit-career-analysis-job), not here, so this frame has no
        // transaction id to reverse. Return the 422 WITHOUT a `refund` — the helper then omits
        // the "Merits refunded" claim rather than lying — and let the worker's own
        // submission-time refund path settle the transaction. Do NOT fabricate a refund here.
        return await incompleteOutputResponse(log, { tier: resolvedTier, missing: completenessError.missing });
      }
      throw completenessError;
    }

    console.log('Career analysis complete - Domain:', domainClassification.domain);

    return { analysisResult: analysisResult as Record<string, unknown> };
    }; // end runCareerLegacyCore

    // ── 06-01 · FEAT-05 — runAnalysisLifecycle('career_compass') adoption ──
    // Attached around the CONFIRMED live main-analysis branch (06-01-LIVE-PATH-
    // FINDING.md: the internal-worker queue path runs THIS legacy branch at
    // resolvedTier='free'; requireInternalAuth -> null userContext -> merit-branch
    // :854 skipped). Multi-role compare is NOT routed here (handled verbatim above,
    // D-06). Ships DORMANT behind ANALYSIS_LIFECYCLE_CAREER_COMPASS: while OFF
    // (100% of traffic), execution falls straight through to today's UNCHANGED
    // persist + response tail below (byte-identical).
    if (isAnalysisFeatureEnabled('career_compass') && authenticatedUserId) {
      // Stable inputIdentity (Pitfall 8): buildCareerCacheKey over the prior-
      // analyses/content inputs (resume + LinkedIn hashes + tier + variant +
      // allowResumeOnly) — NEVER a save-mutated field (analyzed_at /
      // inserted analysis_results id / overall_score).
      const lifecycleInputIdentity = await buildCareerCacheKey({
        userId: authenticatedUserId,
        tier: resolvedTier,
        variant: `${FUNCTION_VERSION}:legacy-main`,
        resumeText: resumeTextContent || resumeFilePath || '',
        linkedinText: acceptedLinkedinPdfContent,
        linkedinUrl,
        allowResumeOnly,
      });
      // attemptNonce from the worker payload (06-02 forwards it); fresh only on a
      // deliberate new run, so a resubmit re-uses it -> same key spanning
      // submit -> process -> analyze-career.
      const lifecycleAttemptNonce =
        typeof requestBody.attemptNonce === 'string' && requestBody.attemptNonce
          ? requestBody.attemptNonce
          : crypto.randomUUID();

      let savedRecordId: string | null = null;
      const careerLifecycle = await runAnalysisLifecycle<Record<string, unknown>, Record<string, never>>({
        feature: 'career_compass',
        meritFeature: 'career_compass',
        jobType: 'career_compass_analysis',
        ctx: { userId: authenticatedUserId, tier: resolvedTier, corsType: 'user' },
        inputIdentity: lifecycleInputIdentity,
        attemptNonce: lifecycleAttemptNonce,
        featureRunId: featureRuntime?.featureRunId,
        // Extraction + AI both live in the hoisted core (run inside generate so the
        // executor owns merit ordering); extract is a no-op source step.
        extract: () => Promise.resolve({} as Record<string, never>),
        generate: async (): Promise<string> => {
          const core = await runCareerLegacyCore();
          if (core instanceof Response) {
            // A core early-return (input/extraction 400, overload 503, rate-limit
            // 429, billing 402) is surfaced to the executor as a plain status-
            // bearing Error (NOT MeritRefundable — the executor owns the refund
            // boundary; classifyFailure reads .status). Refund fires pre-saving.
            const statusErr = new Error(`career core returned status ${core.status}`) as Error & { status?: number };
            statusErr.status = core.status;
            throw statusErr;
          }
          // Return the ASSEMBLED FINAL object serialized as text; the executor runs
          // validateModelOutput(raw, careerCompassSchema, {semanticCheck}) on it
          // (truncation/empty-core rejected -> typed error + safe refund; success
          // byte-identical).
          return JSON.stringify(core.analysisResult);
        },
        schema: careerCompassSchema,
        validationOpts: { semanticCheck: careerSemanticCheck },
        save: async (value: Record<string, unknown>): Promise<void> => {
          // Reconciled save: persistCareerResultAndRecordUsage keeps the
          // analysis_results insert as the SOLE authoritative throws-pre-settle
          // write (throws MeritRefundable on failure -> executor refunds pre-settle);
          // usage + email are already log-and-continue (CR-02). No profiles update /
          // analysis_cache upsert on the legacy path (never refund-after-durable-save).
          savedRecordId = await persistCareerResultAndRecordUsage(supabase, {
            userId: authenticatedUserId,
            analysisResult: value,
            log,
            label: 'Lifecycle path',
          });
        },
      });

      if (careerLifecycle.ok) {
        // Byte-preserve the saved result body; ADD the legacy response-only metadata
        // (reusedLinkedinGrade/linkedinGradeDate, appended AFTER save exactly as the
        // dormant tail does) + run_id (tracking) + recordId (analysis_results id, the
        // ?id= re-hydration pointer; analysis_jobs has no result column).
        const totalMs = totalTimer();
        log.info('request-complete', { totalMs, path: 'lifecycle' });
        return new Response(
          JSON.stringify({
            ...careerLifecycle.value,
            reusedLinkedinGrade: false,
            linkedinGradeDate: null,
            run_id: careerLifecycle.runId,
            recordId: savedRecordId,
          }),
          { headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } },
        );
      }
      if (!careerLifecycle.dormant) {
        // Non-dormant failure: reuse the gateway's structured Response (e.g. a merit
        // 402) when present; else a generic 500 (code carried for logs only).
        if (careerLifecycle.response) return careerLifecycle.response;
        return new Response(
          JSON.stringify({ error: 'Failed to analyze career. Please try again.', code: careerLifecycle.code }),
          { status: 500, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } },
        );
      }
      // dormant:true -> the executor is OFF; fall through to today's UNCHANGED
      // persist + response tail below (100% of traffic while the flag is OFF).
    }

    // ── Dormant / unchanged legacy tail (byte-identical while flag OFF) ──
    const coreOutcome = await runCareerLegacyCore();
    if (coreOutcome instanceof Response) {
      if (isInternalCostingRequest) await featureRuntime?.flushAiCalls();
      else await featureRuntime?.fail('CAREER_CORE_FAILED', 'provider');
      return coreOutcome;
    }
    const analysisResult = coreOutcome.analysisResult as Record<string, unknown> & {
      reusedLinkedinGrade?: boolean;
      linkedinGradeDate?: string | null;
    };

    if (authenticatedUserId) {
      await persistCareerResultAndRecordUsage(supabase, {
        userId: authenticatedUserId,
        analysisResult,
        log,
        label: 'Legacy path',
      });
    }

    // 22-03 D-15: Legacy path — reuse fields always false/null since this
    // branch runs only when MERIT_SYSTEM_ENABLED is false. Keeps the response
    // contract stable for the frontend.
    analysisResult.reusedLinkedinGrade = false;
    analysisResult.linkedinGradeDate = null;

    const totalMs = totalTimer();
    log.info('request-complete', { totalMs });
    await featureRuntime?.complete();
    return new Response(
      JSON.stringify(analysisResult),
      { headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    if (error instanceof Response) throw error;
    if ((error as { meritsRefunded?: boolean })?.meritsRefunded && activeMeritTransactionId) {
      await featureRuntime?.observeRefund(activeMeritTransactionId);
    }
    if (isInternalCostingRequest) await featureRuntime?.flushAiCalls();
    else await featureRuntime?.fail('CAREER_REQUEST_FAILED', 'internal');
    const totalMs = totalTimer();
    log.error('request-failed', { totalMs, error: error instanceof Error ? error.message : String(error) });
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } }
    );
  }
}, { extraHeaders: 'x-internal-job-secret' }));

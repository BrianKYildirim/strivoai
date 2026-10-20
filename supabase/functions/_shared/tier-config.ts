/**
 * tier-config.ts — Single source of truth for per-tier timeouts and model IDs.
 *
 * Closes BACK-12, D-11, D-12, D-13. Also provides TIER_MAX_TOKENS (Phase 15, D-16 / RES-05).
 * Spec reference: §8.4 (per-tier timeouts), PROJECT.md (Free cost ceiling).
 *
 * SECURITY NOTE (T-14-01): This module is a pure function with zero client surface.
 * Consumers MUST read `tier` from `profiles.subscription_tier` server-side —
 * never from request body or client-supplied parameters.
 *
 * Zero edge-layer dependencies — safe to import without triggering HTTP client init.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type Tier = 'free' | 'pro' | 'elite';
export type CallType = 'core' | 'elite-preview' | 'quiz' | 'linkedin' | 'career';
export type FeatureKey = 'resume' | 'career' | 'linkedin' | 'recruiting' | 'interview';

// ── Timeout configuration (BACK-12) ───────────────────────────────────────

/**
 * Per-tier timeout values in milliseconds.
 * Only the (tier, callType) pairs that the spec defines are present;
 * `getTimeout` throws for any undefined pair (fail-loud semantics).
 *
 * `linkedin` (quick task 260713-2ay): the LinkedIn grade is a single large-output call whose
 * REAL measured generation time is 45-70s. It used to run on `core`, so Free got a 50 000 ms
 * wall — inside the real workload band — and aborted mid-generation on most first attempts.
 * 90 000 ms clears the observed p100 with headroom. It is a DEDICATED CallType so widening it
 * cannot leak into any other feature that reads `core`.
 *
 * Budget invariant this participates in (all three must move together):
 *   client 180_000 (LinkedInGrader.tsx) > server total 165_000 (grade-linkedin/index.ts)
 *   > per-call 90_000 (here)
 *
 * `career` (quick task 260713-hrd): the SAME shape, one feature later. Career Compass was
 * calling the model with a hardcoded 2 500-token output cap against a ~3 000-token schema and
 * truncating every run. Wiring the real `getMaxOutput` budget (free 4 800 / elite 10 000)
 * WITHOUT also widening the wall would have reproduced the 260713-2ay bug exactly: Free ran on
 * `core`, i.e. a 50 000 ms wall, and a bigger generation would abort mid-flight with a 408.
 * So the budget and the wall move in the SAME commit. 90 000 ms per call, under one
 * request-scoped deadline.
 *
 * Budget invariant this participates in (all three must move together):
 *   client 180_000 (CareerCompass.tsx MAX_POLL_MS) > server total 165_000
 *   (analyze-career CAREER_TOTAL_DEADLINE_MS) > per-call 90_000 (here)
 *
 * Both `linkedin` and `career` are DEDICATED CallTypes for the same reason: every other
 * feature reads the DEFAULT `core` cell, and the `core` values below are UNCHANGED — so a
 * widened LinkedIn/Career wall cannot leak into Resume Analysis, Recruiting Lens, onboarding
 * or anything else. Widen the feature's own cell; never widen `core`.
 *
 * No `pro` cell: `getTimeout` runs `_normalizeActiveTier` first, so `pro` resolves the `elite`
 * row (Free and Elite are the only live tiers).
 */
// 260713-hrd: elite.career 90_000 -> 120_000, measured, not guessed.
//
// A COMPLETE Elite Career Compass report is a big generation — real Preview runs land at
// 19 653 and 28 377 chars (~5 600-8 100 output tokens) and take 65-87s. At the old 90s wall a
// good run was finishing with a ~4% margin, so a slightly longer one timed out (408) even
// though it would have succeeded. Free's ask is materially narrower (2 200-token brevity
// target, no roadmap / roleRoadmaps / skillGaps / compensationIntelligence) and is nowhere
// near its wall, so it is left alone.
//
// The ladder this sits in — change one, change all three (analyze-career/index.ts):
//   per-call 120_000 (here) < server total 165_000 (CAREER_TOTAL_DEADLINE_MS)
//     < client poll 180_000 (CareerCompass.tsx MAX_POLL_MS)
// The client must never give up before the server does.
export const TIER_TIMEOUTS: Record<Tier, Partial<Record<CallType, number>>> = {
  free:  { core: 50_000, linkedin: 90_000, career: 90_000 },
  pro:   { core: 125_000, 'elite-preview': 65_000, career: 120_000 },
  elite: { core: 155_000, quiz: 80_000, linkedin: 90_000, career: 120_000 },
};

// ── Per-tier maxTokens caps (D-16 / RES-05) ─────────────────────────────────

/**
 * Maximum output tokens per AI analysis call, by tier.
 * Feature handlers derive their per-call budgets from these caps
 * (e.g., analyze-resume splits its cap across 3-4 parallel calls).
 *
 * Free=6000: ~3,500 actual output tokens (score-only C2-C11, 1 improvement)
 * Pro=16000: ~10,000 actual (full 11 criteria, rewrites, keywords)
 * Elite=20000: ~12,000 actual (full Pro + elite-extras 4th call)
 *
 * Spec reference: §8.2 (tier maxTokens), RES-05.
 */
export const TIER_MAX_TOKENS: Record<Tier, number> = {
  free: 6000,
  pro: 16000,
  elite: 20000,
};

// ── Model configuration (D-13) ────────────────────────────────────────────

/** Free tier is hard-locked to Haiku 4.5 — the single enforcement point for the cost ceiling. */
export const FREE_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Default model for Pro/Elite tiers.
 * All tiers now route to Haiku 4.5 across every feature (cost ceiling applied platform-wide).
 */
export const DEFAULT_PRO_ELITE_MODEL = FREE_MODEL;

export const TIER_MODELS: Record<Tier, string> = {
  free: FREE_MODEL,
  pro: DEFAULT_PRO_ELITE_MODEL,
  elite: DEFAULT_PRO_ELITE_MODEL,
};

/**
 * Optional per-feature model overrides for Pro/Elite tiers.
 * Currently unused — every tier resolves to Haiku 4.5 via TIER_MODELS.
 * Kept as a hook in case a future feature needs a different Pro/Elite model.
 * Free tier overrides are ignored — Free is always Haiku (D-13).
 */
export const FEATURE_MODEL_OVERRIDES: Partial<Record<FeatureKey, Partial<Record<Tier, string>>>> = {};

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns the timeout in milliseconds for the given tier and call type.
 * Throws if the (tier, callType) pair is not defined in the spec.
 *
 * @param tier - User's subscription tier (read from profiles.subscription_tier)
 * @param callType - The type of AI call being made (default: 'core')
 */
export function getTimeout(tier: Tier, callType: CallType = 'core'): number {
  const activeTier = _normalizeActiveTier(tier);
  const value = TIER_TIMEOUTS[activeTier]?.[callType];
  if (value === undefined) {
    throw new Error(`tier-config: no timeout for tier=${tier} callType=${callType}`);
  }
  return value;
}

/**
 * Returns the Anthropic model ID for the given tier and optional feature.
 *
 * D-13 enforcement: if tier === 'free', UNCONDITIONALLY returns FREE_MODEL.
 * The feature parameter is ignored for Free — Free can never be routed to
 * anything other than Haiku 4.5, regardless of FEATURE_MODEL_OVERRIDES.
 *
 * For Pro/Elite: checks FEATURE_MODEL_OVERRIDES first, then falls back to TIER_MODELS.
 *
 * @param tier - User's subscription tier (read from profiles.subscription_tier)
 * @param feature - Optional feature key for per-feature overrides
 */
export function getModel(tier: Tier, feature?: FeatureKey): string {
  const activeTier = _normalizeActiveTier(tier);
  // D-13: Free tier is ALWAYS Haiku — no override map, no feature param, no exceptions.
  if (activeTier === 'free') {
    return FREE_MODEL;
  }

  // Pro/Elite: check feature-specific override
  if (feature) {
    const override = FEATURE_MODEL_OVERRIDES[feature]?.[activeTier];
    if (override) {
      return override;
    }
  }

  return TIER_MODELS[activeTier];
}

// ── Phase 24 · D-09: Accessor re-exports from the dual-imported pricing-config ──
// Edge-side callers import these via `from '../_shared/tier-config.ts'` to avoid
// reaching across three `../` levels to `src/config/pricing-config.ts` in every file.

export {
  getMaxOutput,
  getMaxInputTokens,
  getMaxInputChars,
  getMeritCost,
  MERITS_PER_MONTH,
  MERIT_COST_PER_FEATURE,
  PRICING,
  PACK_CATALOG,
  maxTokensOutput,
  maxTokensInput,
  maxCharactersInput,
  normalizeActiveTier,
} from '../../../src/config/pricing-config.ts';

export type {
  ActiveTier,
  FeatureKey as CanonicalFeatureKey,
  PackCatalogEntry,
} from '../../../src/config/pricing-config.ts';

import {
  MERIT_COST_PER_FEATURE as _MERIT_COST_PER_FEATURE,
  normalizeActiveTier as _normalizeActiveTier,
} from '../../../src/config/pricing-config.ts';
import type { FeatureKey as _CanonicalFeatureKey } from '../../../src/config/pricing-config.ts';

// ── Phase 24 · D-03: FEATURE_KEY_TO_DB — bridges existing short FeatureKey
//    ('resume'/'career'/...) to the canonical SC-12 FeatureKey
//    ('resumeAnalysis'/'careerCompass'/...) that pricing-config.ts uses.
//    Use the canonical key when calling getMaxOutput / getMaxInputTokens / etc.

export const FEATURE_KEY_TO_DB: Record<FeatureKey, _CanonicalFeatureKey> = {
  resume:     'resumeAnalysis',
  career:     'careerCompass',
  linkedin:   'linkedinGrader',
  recruiting: 'recruitingLens',
  interview:  'interviewPrepCoach',
};

// ── Phase 24 · D-03: verifyCostMap — called at module init against a snapshot
//    of `merit_feature_costs` rows; asserts DB ↔ TS parity.

export interface MeritFeatureCostRow {
  feature: string;
  tier: Tier;
  cost: number | null;
}

export interface VerifyCostMapResult {
  ok: boolean;
  drift?: Array<{ feature: string; tier: Tier; ts: number | null; db: number | null }>;
  missing?: Array<string>;
}

export function verifyCostMap(rows: MeritFeatureCostRow[]): VerifyCostMapResult {
  const drift: NonNullable<VerifyCostMapResult['drift']> = [];
  const missing: string[] = [];
  const tiers: Tier[] = ['free', 'pro', 'elite'];

  for (const shortKey of Object.keys(FEATURE_KEY_TO_DB) as FeatureKey[]) {
    const canonical = FEATURE_KEY_TO_DB[shortKey];
    const tsCosts = _MERIT_COST_PER_FEATURE[canonical];
    for (const tier of tiers) {
      const row = rows.find((r) => r.feature === shortKey && r.tier === tier);
      if (!row) {
        missing.push(`${shortKey}/${tier}`);
        continue;
      }
      const tsVal = tsCosts[tier];
      if (row.cost !== tsVal) {
        drift.push({ feature: shortKey, tier, ts: tsVal, db: row.cost });
      }
    }
  }

  if (drift.length || missing.length) {
    return {
      ok: false,
      ...(drift.length ? { drift } : {}),
      ...(missing.length ? { missing } : {}),
    };
  }
  return { ok: true };
}

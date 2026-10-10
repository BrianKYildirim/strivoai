/**
 * pricing-config.ts — Single dual-imported source of truth for Phase 24.
 *
 * IMPORTANT (D-01/D-02): This module is imported BOTH by the Vite frontend
 * (`import { ... } from '@/config/pricing-config'`) AND by Supabase Edge
 * Functions (Deno) via relative path `../../../src/config/pricing-config.ts`.
 *
 * SECURITY NOTE: `tier` MUST be read server-side from `profiles.subscription_tier`
 * on every request — never from request body or client-supplied parameters.
 *
 * SC-12 LOCK (D-19): The three token-budget tables below are HARD per-tier
 * caps (quick task 260608-p5k, 2026-06-08 — superseded the original ROADMAP
 * §SC-12 values). `pricing-config.snapshot.ts` pins these values and
 * `sc12-snapshot.test.ts` fails CI on any drift.
 *
 * Zero edge-layer dependencies — safe to import without triggering HTTP client init.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type Tier = 'free' | 'pro' | 'elite';
export type ActiveTier = 'free' | 'elite';

export type FeatureKey =
  | 'resumeAnalysis'
  | 'careerCompass'
  | 'recruitingLens'
  | 'linkedinGrader'
  | 'interviewPrepCoach';

// ── SC-1: MERITS_PER_MONTH ──────────────────────────────────────────────────

export const MERITS_PER_MONTH: Record<Tier, number> = {
  free: 10,
  pro: 75,
  elite: 150,
};

export const ACTIVE_TIERS: readonly ActiveTier[] = ['free', 'elite'] as const;

export function normalizeActiveTier(tier: string | null | undefined): ActiveTier {
  // Pro is intentionally retained in schema/config for legacy Stripe and DB
  // compatibility, but the active product temporarily treats saved Pro users
  // as Elite so no UI or feature path falls into an inactive middle tier.
  return tier === 'elite' || tier === 'pro' ? 'elite' : 'free';
}

export function getTierDisplayName(tier: string | null | undefined): string {
  return normalizeActiveTier(tier) === 'elite' ? 'Elite' : 'Free';
}

// ── SC-1: MERIT_COST_PER_FEATURE (per-tier; null = feature locked on that tier) ─

export const MERIT_COST_PER_FEATURE: Record<FeatureKey, Record<Tier, number | null>> = {
  resumeAnalysis:     { free: 3,    pro: 3, elite: 3 },
  careerCompass:      { free: 3,    pro: 3, elite: 3 },
  linkedinGrader:     { free: 3,    pro: 3, elite: 3 },
  recruitingLens:     { free: null, pro: 8, elite: 8 },
  interviewPrepCoach: { free: null, pro: 8, elite: 5 },
};

// ── SC-1 / SC-4: PRICING (values in CENTS) ──────────────────────────────────

export const PRICING = {
  free:  { monthly: 0,    annual: 0 },
  pro:   { monthly: 899,  annual: 8999 },
  elite: { monthly: 1699, annual: 16999 },
} as const;

// ── SC-12: maxTokensOutput (per-tier OUTPUT ceiling) ────────────────────────
// HARD CAPS — measured + operator-approved in Phase 02 (AI Token & Cost
// Optimization). Source of truth for every value below:
// `.planning/phases/02-ai-token-cost-optimization/02-APPROVED-CAPS.md`
// (LOCKED 2026-07-27, 15/15 cells APPROVE as proposed); measurement evidence in
// `02-MEASUREMENT-REPORT.md` (21-run production study, first-attempt peaks).
// Sizing rule (locked): final = max(ceil(first_attempt_peak x 1.4), pre-TEMP value)
// — "keep" is a first-class outcome, and no cell sits below its pre-Phase-02 value.
// max_tokens is a CEILING, not a target: Anthropic bills only tokens actually
// generated, so unused headroom costs nothing, while a cap below the model's real
// appetite truncates into a terminal 422 output_truncated + Merit refund
// (LinkedIn 2026-07-09; Career Compass elite `base` at its exact 4500 cap 2026-07-17).
//
// Active tiers are Free + Elite only; accessors collapse Pro onto Elite via
// normalizeActiveTier (the Pro cells are never read at runtime). The Pro column
// records the documented Pro fan-out (Resume Pro drops the elite-only
// elite-extras call, so its aggregate is 29000, not 41000; the other features'
// Pro mirrors Elite).
// Tier sums: Free 22800 | Pro 97000 | Elite 109000.
//
// PARALLEL-CALL NOTE: resumeAnalysis, careerCompass (paid) and recruitingLens
// fan out into multiple Anthropic calls, so their cell is the AGGREGATE output
// budget across all calls — NOT a single-call maxTokens. The per-call split lives
// in each function's CALL_CONFIGS and is asserted ≤ this ceiling at boot:
//   resumeAnalysis elite 41000 = criteria-1 6000 + criteria-2 7000 + summary 12000
//     + rewrites 4000 + elite-extras 12000; Pro 29000 (elite-extras stays 0).
//   careerCompass pro/elite 11000 = base 5000 + growth 4000 + elite-extras 2000.
//   recruitingLens pro/elite 36000 = rl-call-1/2/3 at 12000 each.
// Five cells (resume summary, resume elite-extras, rl-call-1/2/3) sit AT the
// ABSOLUTE_MAX_TOKENS 12000 per-call clamp — they cannot rise further without
// lifting the clamp; the standing near-cap telemetry watch (02-MEASUREMENT-REPORT
// SQL Block 4) and the analyze-resume attempt-2 self-heal are the safety nets.
//
// Measured first-attempt peaks behind each cell (Phase 02 Epoch 2):
//   resume free-single 4944 | resume elite criteria-1 4312 / criteria-2 4883 /
//     rewrites 2705 / summary ≥10000 (lower bound — truncated 1/4 @10000) /
//     elite-extras ≥9000 (lower bound — truncated 1/4 @9000)
//   career free base 2935 | career elite base 3523 (truncated @4500 2026-07-17) /
//     growth 2798 / elite-extras 983
//   linkedin free 5774 (exceeded the old 5000 cap) / elite 4853
//   recruiting lens rl-call-1 10955 (@12000 clamp) / rl-call-2 8669 / rl-call-3 8280

export const maxTokensOutput: Record<FeatureKey, Record<Tier, number>> = {
  resumeAnalysis:     { free: 9000, pro: 29000, elite: 41000 }, // Phase 02 LOCKED — free keep (peak 4944); elite 6000+7000+12000+4000+12000; pro drops elite-extras
  careerCompass:      { free: 4800, pro: 11000, elite: 11000 }, // Phase 02 LOCKED — free keep (peak 2935); pro/elite 5000+4000+2000 (base above the 4500 that truncated 2026-07-17)
  recruitingLens:     { free: 0,    pro: 36000, elite: 36000 }, // Phase 02 LOCKED — 12000 x 3, every call AT the per-call clamp (peaks 10955/8669/8280)
  linkedinGrader:     { free: 9000, pro: 9000,  elite: 9000  }, // Phase 02 LOCKED — free peak 5774 exceeded the old 5000; pro/elite keep (peak 4853)
  interviewPrepCoach: { free: 0,    pro: 12000, elite: 12000 },
};

// ── SC-12: maxTokensInput (per-tier INPUT ceiling — null = locked) ──────────
// HARD CAPS — quick task 260608-p5k. Pro = Elite (collapsed by normalizeActiveTier).

export const maxTokensInput: Record<FeatureKey, Record<Tier, number | null>> = {
  resumeAnalysis:     { free: 4000, pro: 10000, elite: 10000 },
  careerCompass:      { free: 4000, pro: 10000, elite: 10000 },
  recruitingLens:     { free: null, pro: 12750, elite: 12750 }, // Phase 01.1 (D-21) PERMANENT — JD limit 3000->6000; additive ceiling. Was 12000. Exclude from Phase 02 revert.
  linkedinGrader:     { free: 4000, pro: 8000,  elite: 8000  },
  interviewPrepCoach: { free: null, pro: 12000, elite: 12000 },
};

// ── SC-12: maxCharactersInput (null = locked) ───────────────────────────────
// 4:1 char:token invariant on every non-null row — EXACTLY 4× maxTokensInput.

export const maxCharactersInput: Record<FeatureKey, Record<Tier, number | null>> = {
  resumeAnalysis:     { free: 16000, pro: 40000, elite: 40000 },
  careerCompass:      { free: 16000, pro: 40000, elite: 40000 },
  recruitingLens:     { free: null,  pro: 51000, elite: 51000 }, // Phase 01.1 (D-21) PERMANENT — JD limit 3000->6000; additive ceiling. Was 48000. Exclude from Phase 02 revert.
  linkedinGrader:     { free: 16000, pro: 32000, elite: 32000 },
  interviewPrepCoach: { free: null,  pro: 48000, elite: 48000 },
};

// ── SC-6: PACK_CATALOG (one-time top-up packs; priceCents matches Stripe) ───

export const PACK_CATALOG = [
  { id: 'pack_3',  merits: 3,  priceCents: 199,  perMeritCents: 66 },
  { id: 'pack_10', merits: 10, priceCents: 499,  perMeritCents: 50 },
  { id: 'pack_25', merits: 25, priceCents: 999,  perMeritCents: 40, isBestValue: true },
  { id: 'pack_50', merits: 50, priceCents: 1799, perMeritCents: 36 },
] as const;

export type PackCatalogEntry = typeof PACK_CATALOG[number];

export type PackId = 'pack_3' | 'pack_10' | 'pack_25' | 'pack_50';

// Lookup map — built from PACK_CATALOG so values stay in sync with the source
// of truth. Used by create-payment-intent (D-02 dual-import) and by Phase 24
// Plan 06 top-up surfaces to read pack price/merits without array scans.
export const PACKS_BY_ID: Readonly<Record<PackId, PackCatalogEntry>> = Object.freeze(
  PACK_CATALOG.reduce((acc, pack) => {
    acc[pack.id] = pack;
    return acc;
  }, {} as Record<PackId, PackCatalogEntry>),
);

// ── Typed Accessors (D-09) ──────────────────────────────────────────────────

export function getMaxOutput(feature: FeatureKey, tier: Tier): number {
  return maxTokensOutput[feature][normalizeActiveTier(tier)];
}

export function getMaxInputTokens(feature: FeatureKey, tier: Tier): number | null {
  return maxTokensInput[feature][normalizeActiveTier(tier)];
}

export function getMaxInputChars(feature: FeatureKey, tier: Tier): number | null {
  return maxCharactersInput[feature][normalizeActiveTier(tier)];
}

export function getMeritCost(feature: FeatureKey, tier: Tier): number | null {
  return MERIT_COST_PER_FEATURE[feature][normalizeActiveTier(tier)];
}

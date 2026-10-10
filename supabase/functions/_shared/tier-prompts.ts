/**
 * Tier-variant prompt loader with registry and auto-prepend.
 *
 * Single audit-point for "Which prompt variant does tier X see?"
 * Feature authors cannot forget to include global principles --
 * the loader enforces it. Free cannot accidentally inherit principles --
 * same loader blocks it.
 *
 * Usage (feature registration -- done by each feature's edge function):
 *   import { registerFeaturePrompts } from '../_shared/tier-prompts.ts';
 *   registerFeaturePrompts('resume', { free: ..., pro: ..., elite: ... });
 *
 * Usage (prompt loading -- done by each feature's edge function):
 *   import { loadPromptVariant } from '../_shared/tier-prompts.ts';
 *   const prompt = loadPromptVariant('resume', userTier, params);
 *
 * SECURITY NOTE: Callers MUST read tier from `profiles.subscription_tier`
 * server-side. The loader does not verify tier authenticity -- that is the
 * caller's responsibility. Callers MUST also sanitize user-supplied params
 * via `prompt-sanitizer.ts` before invoking `loadPromptVariant`.
 *
 * @see D-02 (single shared loader)
 * @see D-03 (auto-prepend of STRIVO_GLOBAL_AI_PRINCIPLES)
 */

import { STRIVO_GLOBAL_AI_PRINCIPLES } from "./global-ai-principles.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Tier = 'free' | 'pro' | 'elite';

export type FeatureKey = 'resume' | 'career' | 'linkedin' | 'recruiting' | 'interview';

export interface PromptVariantBuilder<P = unknown> {
  free: (params: P) => string;
  pro: (params: P) => string;
  elite: (params: P) => string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Registry mapping each feature to its per-tier prompt builder.
 * Starts empty -- features self-register via `registerFeaturePrompts`
 * when their edge function boots.
 *
 * Exported for test access (e.g. clearing state between tests).
 * Production code should use `loadPromptVariant` instead of reading
 * this directly.
 */
// deno-lint-ignore no-explicit-any
export const FEATURE_BUILDERS: Partial<Record<FeatureKey, PromptVariantBuilder<any>>> = {};

/**
 * Register a feature's per-tier prompt builders in the shared registry.
 * Idempotent: re-registering overwrites (no throw) -- supports test
 * isolation and hot reload.
 */
export function registerFeaturePrompts<P>(
  feature: FeatureKey,
  builder: PromptVariantBuilder<P>,
): void {
  FEATURE_BUILDERS[feature] = builder;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load the prompt variant for a given feature and tier.
 *
 * Auto-prepends STRIVO_GLOBAL_AI_PRINCIPLES when tier !== 'free' (GATE-04).
 * Free variants are returned verbatim to preserve the cost ceiling
 * ($0.051/analysis for Free tier).
 *
 * @param feature - The feature key (e.g. 'resume', 'career')
 * @param tier - The user's subscription tier (must be read server-side from profiles)
 * @param params - Feature-specific prompt parameters passed to the builder
 * @returns The complete prompt string ready for Anthropic API call
 * @throws Error if the feature is not registered
 *
 * @see D-02 (single loader as audit point)
 * @see D-03 (auto-prepend enforcement)
 * @see GATE-04 (cost-ceiling enforcement -- Free never receives principles)
 */
export function loadPromptVariant(
  feature: FeatureKey,
  tier: Tier,
  params: unknown,
): string {
  const b = FEATURE_BUILDERS[feature];
  if (!b) {
    throw new Error(`tier-prompts: feature '${feature}' not registered`);
  }

  const fn = b[tier];
  const body = fn(params);

  // GATE-04: Free variants are returned as-is (no prepend -- cost trim)
  if (tier === 'free') {
    return body;
  }

  // Pro and Elite get STRIVO_GLOBAL_AI_PRINCIPLES prepended
  return `${STRIVO_GLOBAL_AI_PRINCIPLES}\n\n${body}`;
}

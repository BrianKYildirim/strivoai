/**
 * supabase/functions/_shared/analysis-flags.ts
 *
 * Dormancy flag layer for the shared analysis lifecycle (LIFE-03 / D-04).
 *
 * The lifecycle executor (analysis-lifecycle.ts) ships DORMANT in Phase 3: no
 * feature routes through it. This module is the ascending-blast-radius gate that
 * keeps it that way until an operator deliberately flips it on, one feature at a
 * time.
 *
 * Two-level gating (both must be ON for a feature to run through the executor):
 *   1. ANALYSIS_LIFECYCLE_ENABLED — the master kill switch (default OFF).
 *   2. ANALYSIS_LIFECYCLE_<FEATURE> — the per-feature enable (default OFF).
 *
 * `isAnalysisFeatureEnabled(feature)` returns true ONLY when the master flag AND
 * the per-feature flag are both on. This lets an operator enable one low-risk
 * feature at a time behind the still-required master switch, and lets a single
 * master-off flip disable the entire substrate instantly.
 *
 * Fail-closed exact-lowercase-'true' semantics: ONLY the literal lowercase string
 * 'true' is on. 'True', 'TRUE', '1', 'yes', 'on', 'false', '' → OFF. This is
 * deliberately STRICTER than merit-gateway's `.toLowerCase() === 'true'`: a
 * dormancy safety switch must fail closed on any non-exact value, so a typo or an
 * ambiguous truthy string can never silently wake the substrate.
 *
 * Read timing (career-compass-flag-split-95-hang fix): the runtime gate
 * `isAnalysisFeatureEnabled` reads env at REQUEST time, mirroring
 * _shared/cors.ts::allowedOrigins. A pure module-load snapshot froze a warm
 * isolate that booted BEFORE an operator set the flags at a stale `false`, so
 * two functions (submit-career-analysis-job vs analyze-career) with independent
 * isolates could disagree on the same flag and split one submit into a keyless
 * legacy row + a keyed lifecycle row (the 95% hang). Request-time reads keep every
 * isolate consistent with the current secret. In production the env is fixed for
 * the isolate's life, so this is a single cheap `Deno.env.get` per call; in tests
 * that mutate env at runtime the current value is always honored. The
 * `ANALYSIS_LIFECYCLE_ENABLED` module-scope const is retained ONLY as a back-compat
 * named export + the dormancy static-source guard — runtime gating does not read it.
 *
 * No package is imported (T-03-SC): this is pure Deno.env reads.
 */

/**
 * The five features that will migrate onto the shared lifecycle across Phases
 * 4/5/6 (ascending blast radius). Each maps to one `ANALYSIS_LIFECYCLE_<SUFFIX>`
 * env var.
 */
export type AnalysisFeature =
  | 'resume'
  | 'linkedin'
  | 'recruiting_lens'
  | 'onboarding'
  | 'career_compass';

/**
 * Fail-closed reader: ON only for the exact literal lowercase string 'true'.
 * No case-folding — a dormancy switch must reject any non-exact value.
 */
function readBoolFlag(name: string): boolean {
  return (Deno.env.get(name) ?? '') === 'true';
}

/**
 * Back-compat named export + dormancy static-source guard ONLY (module-load
 * snapshot of the master switch, default OFF). Runtime gating does NOT read this —
 * `isAnalysisFeatureEnabled` reads env at request time. Kept because
 * analysis-lifecycle.dormancy.test.ts / analysis-flags.test.ts assert this const
 * default-derives to false when the env var is unset.
 */
export const ANALYSIS_LIFECYCLE_ENABLED = readBoolFlag('ANALYSIS_LIFECYCLE_ENABLED');

/** Per-feature env var name for each `AnalysisFeature`. */
const FEATURE_ENV: Record<AnalysisFeature, string> = {
  resume: 'ANALYSIS_LIFECYCLE_RESUME',
  linkedin: 'ANALYSIS_LIFECYCLE_LINKEDIN',
  recruiting_lens: 'ANALYSIS_LIFECYCLE_RECRUITING_LENS',
  onboarding: 'ANALYSIS_LIFECYCLE_ONBOARDING',
  career_compass: 'ANALYSIS_LIFECYCLE_CAREER_COMPASS',
};

/**
 * True ONLY when the master flag AND the given feature's flag are both the exact
 * lowercase string 'true' AT REQUEST TIME (ascending blast-radius gating). A
 * master-off flip disables every feature; a feature-off flip disables only that
 * feature. Default is OFF for all five.
 *
 * Reads are performed on every call (mirrors _shared/cors.ts::allowedOrigins) so a
 * warm isolate can never serve a stale cold-start snapshot after an operator flips
 * a flag — the fix for the submit-career/analyze-career run-identity split. The
 * flag-OFF path is byte-identical to the previous module-load implementation:
 * `readBoolFlag` still requires the exact literal 'true'.
 */
export function isAnalysisFeatureEnabled(feature: AnalysisFeature): boolean {
  return readBoolFlag('ANALYSIS_LIFECYCLE_ENABLED') && readBoolFlag(FEATURE_ENV[feature]);
}

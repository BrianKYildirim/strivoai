/**
 * Deno unit tests for tier-config.ts — per-tier timeouts and model routing.
 * Covers all BACK-12 exact timeout values and D-13 Free-model enforcement.
 *
 * Run with: deno test --no-check _shared/tier-config.test.ts
 */
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getTimeout,
  getModel,
  TIER_TIMEOUTS,
  TIER_MODELS,
  FREE_MODEL,
  DEFAULT_PRO_ELITE_MODEL,
  FEATURE_MODEL_OVERRIDES,
} from "./tier-config.ts";
import type { Tier, CallType, FeatureKey } from "./tier-config.ts";

// ── Timeout tests (BACK-12) ────────────────────────────────────────────────

Deno.test("BACK-12: Free core timeout is 50_000ms", () => {
  assertEquals(getTimeout('free', 'core'), 50_000);
});

Deno.test("BACK-12: default callType for Free is core", () => {
  assertEquals(getTimeout('free'), 50_000);
});

// NOTE (Plan 01-01 reconciliation): `getTimeout` calls `normalizeActiveTier`, which
// collapses 'pro' → 'elite' (deployed merit-milestone behavior — active product treats
// saved Pro users as Elite; see src/config/pricing-config.ts normalizeActiveTier). So
// 'pro' lookups resolve the Elite TIER_TIMEOUTS row. The three assertions below were
// stale pre-collapse Pro-specific expectations and have been corrected to match the
// deployed Pro→Elite normalization (source unchanged — this is a stale-test fix).
Deno.test("BACK-12: Pro normalizes to Elite — core timeout is 155_000ms", () => {
  // Pro→Elite collapse: resolves TIER_TIMEOUTS['elite']['core'] = 155_000 (was 125_000 pre-collapse).
  assertEquals(getTimeout('pro', 'core'), 155_000);
});

Deno.test("BACK-12: Pro normalizes to Elite — elite-preview throws (Elite row has no elite-preview)", () => {
  // Pro→Elite collapse resolves the Elite row, which lacks 'elite-preview' (mirrors the
  // elite + elite-preview throw at line below). The error still interpolates the original
  // `tier` arg ('pro'), per getTimeout's `tier=${tier}` template.
  assertThrows(
    () => getTimeout('pro', 'elite-preview'),
    Error,
    'tier-config: no timeout for tier=pro callType=elite-preview',
  );
});

Deno.test("BACK-12: Elite core timeout is 155_000ms", () => {
  assertEquals(getTimeout('elite', 'core'), 155_000);
});

Deno.test("BACK-12: Elite quiz timeout is 80_000ms", () => {
  assertEquals(getTimeout('elite', 'quiz'), 80_000);
});

Deno.test("BACK-12: getTimeout throws for unsupported tier/callType pair (free + quiz)", () => {
  assertThrows(
    () => getTimeout('free', 'quiz'),
    Error,
    'tier-config: no timeout for tier=free callType=quiz',
  );
});

Deno.test("BACK-12: getTimeout throws for unsupported tier/callType pair (free + elite-preview)", () => {
  assertThrows(
    () => getTimeout('free', 'elite-preview'),
    Error,
    'tier-config: no timeout for tier=free callType=elite-preview',
  );
});

Deno.test("BACK-12: Pro normalizes to Elite — quiz timeout is 80_000ms (no longer throws)", () => {
  // Pro→Elite collapse resolves TIER_TIMEOUTS['elite']['quiz'] = 80_000, so this no longer
  // throws (was assertThrows pre-collapse). Reconciled to match deployed normalization.
  assertEquals(getTimeout('pro', 'quiz'), 80_000);
});

Deno.test("BACK-12: getTimeout throws for unsupported tier/callType pair (elite + elite-preview)", () => {
  assertThrows(
    () => getTimeout('elite', 'elite-preview'),
    Error,
    'tier-config: no timeout for tier=elite callType=elite-preview',
  );
});

// ── Model tests (D-13 Free-model enforcement) ──────────────────────────────

Deno.test("D-13: Free model is Haiku 4.5 and cannot be overridden", () => {
  assertEquals(getModel('free'), FREE_MODEL);
  assertEquals(getModel('free'), 'claude-haiku-4-5-20251001');

  // Feature param is ignored for Free — always returns Haiku
  assertEquals(getModel('free', 'career'), 'claude-haiku-4-5-20251001');
  assertEquals(getModel('free', 'resume'), 'claude-haiku-4-5-20251001');
  assertEquals(getModel('free', 'linkedin'), 'claude-haiku-4-5-20251001');
  assertEquals(getModel('free', 'recruiting'), 'claude-haiku-4-5-20251001');
  assertEquals(getModel('free', 'interview'), 'claude-haiku-4-5-20251001');
});

Deno.test("Haiku-only: all tiers and features resolve to Haiku 4.5", () => {
  const tiers: Tier[] = ['free', 'pro', 'elite'];
  const features: FeatureKey[] = ['resume', 'career', 'linkedin', 'recruiting', 'interview'];
  for (const tier of tiers) {
    assertEquals(getModel(tier), FREE_MODEL);
    for (const feature of features) {
      assertEquals(getModel(tier, feature), FREE_MODEL);
    }
  }
});

Deno.test("Haiku-only: DEFAULT_PRO_ELITE_MODEL equals FREE_MODEL", () => {
  assertEquals(DEFAULT_PRO_ELITE_MODEL, FREE_MODEL);
});

Deno.test("Haiku-only: Pro and Elite defaults match Free", () => {
  assertEquals(getModel('pro'), getModel('free'));
  assertEquals(getModel('elite'), getModel('free'));
});

// ── Constant integrity tests ────────────────────────────────────────────────

Deno.test("TIER_TIMEOUTS contains exactly the spec-defined values", () => {
  assertEquals(TIER_TIMEOUTS.free.core, 50_000);
  assertEquals(TIER_TIMEOUTS.pro.core, 125_000);
  assertEquals(TIER_TIMEOUTS.pro['elite-preview'], 65_000);
  assertEquals(TIER_TIMEOUTS.elite.core, 155_000);
  assertEquals(TIER_TIMEOUTS.elite.quiz, 80_000);
});

Deno.test("TIER_MODELS maps tiers to expected model IDs", () => {
  assertEquals(TIER_MODELS.free, 'claude-haiku-4-5-20251001');
  assertEquals(TIER_MODELS.pro, DEFAULT_PRO_ELITE_MODEL);
  assertEquals(TIER_MODELS.elite, DEFAULT_PRO_ELITE_MODEL);
});

Deno.test("FREE_MODEL constant is the Haiku 4.5 model ID", () => {
  assertEquals(FREE_MODEL, 'claude-haiku-4-5-20251001');
});

Deno.test("FEATURE_MODEL_OVERRIDES is empty — all tiers routed to Haiku via TIER_MODELS", () => {
  assertEquals(Object.keys(FEATURE_MODEL_OVERRIDES).length, 0);
});

// ── LinkedIn model override tests (D-04) ──────────────────────────────────

Deno.test("D-04: getModel returns Haiku for linkedin free tier", () => {
  assertEquals(getModel('free', 'linkedin'), FREE_MODEL);
});

Deno.test("D-04: getModel returns Haiku for linkedin pro tier via override", () => {
  assertEquals(getModel('pro', 'linkedin'), FREE_MODEL);
});

Deno.test("D-04: getModel returns Haiku for linkedin elite tier via override", () => {
  assertEquals(getModel('elite', 'linkedin'), FREE_MODEL);
});

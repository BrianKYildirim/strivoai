/**
 * Unit tests for analyze-career boot-time invariants (CC-05).
 *
 * Validates that:
 * 1. The current CAREER_CALL_CONFIGS values stay within getMaxOutput for every tier
 *    (Phase 02 LOCKED final caps, 02-APPROVED-CAPS.md; elite ceiling 11000).
 * 2. No tier's budget sum exceeds its central getMaxOutput ceiling.
 * 3. Paid-only calls have zero budget for Free.
 * 4. Base call gets the full single-call budget for Free tier.
 *
 * Run with: deno test supabase/functions/analyze-career/index.test.ts --allow-read --allow-env --no-check
 */
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { getMaxOutput } from '../_shared/tier-config.ts';

// ---------------------------------------------------------------------------
// Replicate the CAREER_CALL_CONFIGS from index.ts for isolated testability.
// If CAREER_CALL_CONFIGS values change in index.ts, update these to match.
// ---------------------------------------------------------------------------

interface CareerCallConfig {
  callType: string;
  maxTokensFree: number;
  maxTokensPro: number;
  maxTokensElite: number;
}

/**
 * Current production CAREER_CALL_CONFIGS from index.ts.
 * Free right-sized 12000 -> 4800 by quick task 260713-hrd (the Free scope narrowed:
 * no roadmap / roleRoadmaps / skillGaps / compensationIntelligence). base.maxTokensFree
 * MUST track getMaxOutput('careerCompass','free') or the boot invariant throws at load.
 *
 * FINAL (Phase 02 plan 02-09 — 02-APPROVED-CAPS.md, LOCKED 2026-07-27): free base 4800
 * (keep — peak 2935) and elite base/growth/elite-extras 5000/4000/2000 = 11000. Elite
 * `base` must sit above the 4500 that truncated on 2026-07-17 (terminal 422 + Merit refund).
 */
const CAREER_CALL_CONFIGS: CareerCallConfig[] = [
  { callType: 'base',          maxTokensFree: 4800, maxTokensPro: 5000, maxTokensElite: 5000 }, // Phase 02 LOCKED — free keep (peak 2935); pro/elite peak 3523 x 1.4
  { callType: 'growth',        maxTokensFree: 0,    maxTokensPro: 4000, maxTokensElite: 4000 }, // Phase 02 LOCKED — peak 2798 x 1.4
  { callType: 'elite-extras',  maxTokensFree: 0,    maxTokensPro: 2000, maxTokensElite: 2000 }, // Phase 02 LOCKED — keep (peak 983)
];

function ceilingFor(tier: 'free' | 'pro' | 'elite'): number {
  return getMaxOutput('careerCompass', tier);
}

/** Extracted assertion logic -- mirrors the boot-time check pattern. */
function validateCareerCallConfigBudgets(configs: CareerCallConfig[]): void {
  for (const tier of ['free', 'pro', 'elite'] as const) {
    const key = `maxTokens${tier[0].toUpperCase() + tier.slice(1)}` as keyof CareerCallConfig;
    const sum = configs.reduce((acc, cfg) => acc + (cfg[key] as number), 0);
    const ceiling = ceilingFor(tier);
    if (sum > ceiling) {
      throw new Error(
        `[analyze-career] CAREER_CALL_CONFIGS sum ${sum} exceeds getMaxOutput('careerCompass','${tier}') (${ceiling})`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Tests: current budget values fit within getMaxOutput
// ---------------------------------------------------------------------------

Deno.test("CC-05: Free budget sum within getMaxOutput('careerCompass','free') (4800)", () => {
  const sum = CAREER_CALL_CONFIGS.reduce((acc, cfg) => acc + cfg.maxTokensFree, 0);
  assertEquals(sum, 4800);
  // The load-bearing one: the sum must fit under the central ceiling, or the boot
  // invariant in index.ts throws at MODULE LOAD and the function dies on deploy.
  assertEquals(sum <= ceilingFor('free'), true);
});

Deno.test("CC-05: Elite budget sum equals the elite output ceiling (11000)", () => {
  const sum = CAREER_CALL_CONFIGS.reduce((acc, cfg) => acc + cfg.maxTokensElite, 0);
  assertEquals(sum, ceilingFor('elite'));
  assertEquals(sum, 11000);
});

Deno.test("CC-05: Pro budget sum within the elite output ceiling (Pro collapses to Elite)", () => {
  const sum = CAREER_CALL_CONFIGS.reduce((acc, cfg) => acc + cfg.maxTokensPro, 0);
  assertEquals(sum, 11000);
  assertEquals(sum <= ceilingFor('pro'), true);
});

// ---------------------------------------------------------------------------
// Tests: no tier exceeds its cap; misconfig throws
// ---------------------------------------------------------------------------

Deno.test("CC-05: validateCareerCallConfigBudgets does NOT throw for current values", () => {
  validateCareerCallConfigBudgets(CAREER_CALL_CONFIGS);
});

Deno.test("CC-05: throws when Elite budget exceeds the elite output ceiling", () => {
  // The FREE and PRO cells must stay UNDER their ceilings (free 4800, pro 11000) so that
  // ELITE is the tier that actually trips — the loop checks free then pro first and would
  // otherwise throw on the wrong tier and make this test pass for the wrong reason
  // (260713-hrd reconciliation; re-based onto the Phase 02 LOCKED final ceilings).
  const badConfigs: CareerCallConfig[] = [
    { callType: 'base',         maxTokensFree: 4000, maxTokensPro: 4500, maxTokensElite: 14000 },
    { callType: 'growth',       maxTokensFree: 0,    maxTokensPro: 3500, maxTokensElite: 6000 },
    { callType: 'elite-extras', maxTokensFree: 0,    maxTokensPro: 2000, maxTokensElite: 4000 }, // 14000+6000+4000=24000 > 11000
  ];
  assertThrows(
    () => validateCareerCallConfigBudgets(badConfigs),
    Error,
    "CAREER_CALL_CONFIGS sum 24000 exceeds getMaxOutput('careerCompass','elite')",
  );
});

// ---------------------------------------------------------------------------
// Tests: structural invariants
// ---------------------------------------------------------------------------

Deno.test("CC-05: elite-extras has zero budget for Free", () => {
  const eliteExtras = CAREER_CALL_CONFIGS.find(c => c.callType === 'elite-extras');
  assertEquals(eliteExtras !== undefined, true, 'elite-extras config must exist');
  assertEquals(eliteExtras!.maxTokensFree, 0, 'elite-extras Free budget must be 0');
});

Deno.test("CC-05: growth has zero budget for Free", () => {
  const growth = CAREER_CALL_CONFIGS.find(c => c.callType === 'growth');
  assertEquals(growth !== undefined, true, 'growth config must exist');
  assertEquals(growth!.maxTokensFree, 0, 'growth Free budget must be 0');
});

Deno.test("CC-05: base call gets full single-call budget for Free tier", () => {
  const base = CAREER_CALL_CONFIGS.find(c => c.callType === 'base');
  assertEquals(base !== undefined, true, 'base config must exist');
  assertEquals(base!.maxTokensFree, 4800, 'base Free budget must equal the Free output ceiling');
  assertEquals(base!.maxTokensFree, ceilingFor('free'));
});

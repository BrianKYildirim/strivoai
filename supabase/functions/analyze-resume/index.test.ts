/**
 * Unit tests for analyze-resume boot-time invariants (D-18 / RES-06).
 *
 * Validates that:
 * 1. The current CALL_CONFIGS values do not exceed the central getMaxOutput
 *    ceiling for any tier (quick task 260608-p5k — hard per-tier caps).
 * 2. A hypothetical misconfigured budget WOULD be caught (the assertion logic works).
 *
 * Run with: deno test supabase/functions/analyze-resume/index.test.ts --no-check --allow-all
 */
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { getMaxOutput } from '../_shared/tier-config.ts';
import type { CallType } from '../_shared/resume-prompts.ts';

// ---------------------------------------------------------------------------
// Replicate the CALL_CONFIGS and assertion logic from index.ts for testability.
// If CALL_CONFIGS values change in index.ts, update these to match.
// The boot-time assertion in index.ts IS the production guard; these tests
// verify the LOGIC of that guard plus the current budget values.
// ---------------------------------------------------------------------------

interface CallConfig {
  callType: CallType;
  maxTokensFree: number;
  maxTokensPro: number;
  maxTokensElite: number;
}

/**
 * Current production CALL_CONFIGS from index.ts.
 * FINAL (Phase 02 plan 02-09 — 02-APPROVED-CAPS.md, LOCKED 2026-07-27): pro/elite
 * 6000/7000/12000/4000. Elite ALSO fires a 5th call, elite-extras 12000 (restored by quick
 * 260723-2b0 / D-5 — the sole producer of eliteInsights), so the Elite sum is 41000 under a
 * 41000 ceiling; Pro keeps elite-extras at 0 for a 29000 sum (== the documented Pro column).
 * Free cells are vestigial (the Free path is a single consolidated call) and unchanged.
 * summary and elite-extras sit AT the ABSOLUTE_MAX_TOKENS 12000 clamp — their measured
 * peaks are lower bounds (>=10000 and >=9000, each truncated 1/4 during Epoch 2).
 */
const CALL_CONFIGS: CallConfig[] = [
  { callType: 'criteria-1',   maxTokensFree: 1800, maxTokensPro: 6000,  maxTokensElite: 6000 },  // Phase 02 LOCKED — peak 4312 x 1.4
  { callType: 'criteria-2',   maxTokensFree: 1800, maxTokensPro: 7000,  maxTokensElite: 7000 },  // Phase 02 LOCKED — peak 4883 x 1.4
  { callType: 'summary',      maxTokensFree: 1400, maxTokensPro: 12000, maxTokensElite: 12000 }, // Phase 02 LOCKED — peak >=10000 (lower bound); AT clamp
  { callType: 'rewrites',     maxTokensFree: 0,    maxTokensPro: 4000,  maxTokensElite: 4000 },  // Phase 02 LOCKED — peak 2705 x 1.4
  { callType: 'elite-extras', maxTokensFree: 0,    maxTokensPro: 0,     maxTokensElite: 12000 }, // 260723-2b0 (D-5) restored; Phase 02 LOCKED — peak >=9000 (lower bound); AT clamp
];

/** Maps the test tier keys to the central getMaxOutput ceiling. */
function ceilingFor(tier: 'free' | 'pro' | 'elite'): number {
  return getMaxOutput('resumeAnalysis', tier);
}

/**
 * Extracted assertion logic -- mirrors the boot-time check in index.ts.
 * Throws if any tier's sum exceeds the central getMaxOutput ceiling.
 */
function validateCallConfigBudgets(configs: CallConfig[]): void {
  for (const tier of ['free', 'pro', 'elite'] as const) {
    const key = `maxTokens${tier[0].toUpperCase() + tier.slice(1)}` as keyof CallConfig;
    const sum = configs.reduce((acc, cfg) => acc + (cfg[key] as number), 0);
    const ceiling = ceilingFor(tier);
    if (sum > ceiling) {
      throw new Error(
        `[analyze-resume] CALL_CONFIGS sum ${sum} exceeds getMaxOutput('resumeAnalysis','${tier}') (${ceiling})`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Tests: current values fit within the central ceilings
// ---------------------------------------------------------------------------

Deno.test("boot-assertion: Free tier budgets sum within getMaxOutput('resumeAnalysis','free')", () => {
  const sum = CALL_CONFIGS.reduce((acc, cfg) => acc + cfg.maxTokensFree, 0);
  assertEquals(sum, 5000);
  assertEquals(sum <= ceilingFor('free'), true);
});

Deno.test("boot-assertion: Elite tier budgets equal the LOCKED elite ceiling (elite-extras restored)", () => {
  const sum = CALL_CONFIGS.reduce((acc, cfg) => acc + cfg.maxTokensElite, 0);
  assertEquals(sum, 41000); // criteria 6000+7000 + summary 12000 + rewrites 4000 + elite-extras 12000
  assertEquals(sum <= ceilingFor('elite'), true); // Phase 02 LOCKED: 41000 == the 41000 ceiling exactly
});

Deno.test("boot-assertion: Pro tier budgets sum within the elite output ceiling (Pro fires 4 calls, no elite-extras)", () => {
  const sum = CALL_CONFIGS.reduce((acc, cfg) => acc + cfg.maxTokensPro, 0);
  assertEquals(sum, 29000); // criteria 6000+7000 + summary 12000 + rewrites 4000 (elite-extras pro = 0) == the documented Pro column ceiling
  assertEquals(sum <= ceilingFor('pro'), true); // the accessor collapses pro onto the 41000 elite cell
});

Deno.test("elite-extras stays disabled for Free and Pro (only Elite funds it) so those tiers keep their call count", () => {
  const eliteExtras = CALL_CONFIGS.find((c) => c.callType === 'elite-extras')!;
  // D-5: Free's FREE_TIER_SUFFIX forbids every eliteInsights field, and Pro deliberately
  // does not get an elite-extras budget — only Elite funds the 5th call.
  assertEquals(eliteExtras.maxTokensFree === 0 && eliteExtras.maxTokensPro === 0, true);
  // A call with budget 0 is dropped by the activeConfigs filter (maxTokens > 0) in executeParallelCalls,
  // so Elite now fires 5 calls (criteria-1/2, summary, rewrites, elite-extras).
  const activeElite = CALL_CONFIGS.filter((c) => c.maxTokensElite > 0);
  assertEquals(activeElite.length, 5);
});

Deno.test("budget invariant: no single elite call exceeds the per-call hard ceiling (ABSOLUTE_MAX_TOKENS 12000)", () => {
  for (const cfg of CALL_CONFIGS) {
    assertEquals(cfg.maxTokensElite <= 12000, true, `${cfg.callType} elite budget ${cfg.maxTokensElite} exceeds 12000`);
  }
});

Deno.test("boot-assertion: validateCallConfigBudgets does NOT throw for current values", () => {
  validateCallConfigBudgets(CALL_CONFIGS);
});

// ---------------------------------------------------------------------------
// Tests: misconfigured values DO throw
// ---------------------------------------------------------------------------

Deno.test("boot-assertion: throws when Free budget exceeds the Free output ceiling", () => {
  const badConfigs: CallConfig[] = [
    ...CALL_CONFIGS.slice(0, 2),
    { callType: 'summary', maxTokensFree: 8000, maxTokensPro: 8000, maxTokensElite: 8000 }, // free 1800+1800+8000=11600 > the 9000 free ceiling
    CALL_CONFIGS[3],
  ];
  assertThrows(
    () => validateCallConfigBudgets(badConfigs),
    Error,
    "CALL_CONFIGS sum 11600 exceeds getMaxOutput('resumeAnalysis','free')",
  );
});

Deno.test("boot-assertion: throws when Elite budget exceeds the Elite output ceiling", () => {
  // summary and elite-extras already sit AT the 12000 clamp, so the misconfig is an
  // over-budgeted rewrites call: 6000+7000+12000+12000+12000 = 49000 > the 41000 elite
  // ceiling while every single call stays <= ABSOLUTE_MAX_TOKENS 12000. Free (5000) and
  // Pro (37000 <= 41000) stay legal so ELITE is the tier that actually trips.
  const badConfigs: CallConfig[] = [
    ...CALL_CONFIGS.slice(0, 3),
    { callType: 'rewrites', maxTokensFree: 0, maxTokensPro: 12000, maxTokensElite: 12000 },
    CALL_CONFIGS[4],
  ];
  assertThrows(
    () => validateCallConfigBudgets(badConfigs),
    Error,
    "CALL_CONFIGS sum 49000 exceeds getMaxOutput('resumeAnalysis','elite')",
  );
});

Deno.test("boot-assertion: elite-extras with budget 0 is correctly excluded from Free sum", () => {
  const freeSum = CALL_CONFIGS.reduce((acc, cfg) => acc + cfg.maxTokensFree, 0);
  assertEquals(freeSum, 5000); // 1800+1800+1400+0+0 (rewrites + elite-extras are 0 for Free)
});

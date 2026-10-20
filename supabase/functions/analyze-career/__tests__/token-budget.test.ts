/**
 * Quick task 260713-hrd — RC-2 regression guard: the model call must receive the
 * TIER-CONFIGURED output budget, and the timeout ladder must move with it.
 *
 * THE BUG THIS LOCKS OUT
 * ---------------------------------------------------------------------------
 * analyze-career COMPUTED `maxTokensForAnalysis = getMaxOutput('careerCompass', tier)`
 * and then only LOGGED it. The real call hardcoded `maxTokens: isElite ? 3500 : 2500`.
 * Combined with RC-1 (isElite was ALWAYS false on the live path), every Career Compass
 * run got 2,500 output tokens for a schema whose COMPLETE instances measure
 * ~2,200-3,041 tokens. The JSON was cut off before `roles`, `repairTruncatedJSON`
 * closed the braces, and the stub was persisted as a SUCCESS.
 *
 * A `getMaxOutput` grep proves NOTHING here — it was already being called (and
 * discarded) before the fix. `maxTokens: maxTokensForAnalysis` is the DISCRIMINATING
 * marker: the computed budget actually reaching the model.
 *
 * ED-4 — THE TIMEOUT LADDER IS PART OF THIS FIX, NOT A SEPARATE CONCERN.
 * Raising the output budget under the old 50s Free `core` wall would abort
 * mid-generation with a 408 — the EXACT bug quick task 260713-2ay just fixed for
 * LinkedIn Grader. The proven ladder is reused verbatim:
 *     per-call 90_000 (TIER_TIMEOUTS.*.career)
 *   < server deadline 165_000 (CAREER_TOTAL_DEADLINE_MS)
 *   < client poll 180_000 (CareerCompass.tsx MAX_POLL_MS)
 * A dedicated `career` CallType is what stops the widened wall leaking into `core`.
 *
 * ⚠ DO NOT CONFLATE the free-<-50%-of-elite assertion below with
 * `_shared/tier-validation.test.ts:312`. That one asserts on MEASURED
 * `raw.usage.output_tokens` from two LIVE Anthropic calls, is env-gated behind
 * `RUN_TIER_VALIDATION=1`, and is NOT registered in `deno.json test:ci` — it never
 * reads `maxTokensOutput` and cannot go red on a config value either way. The
 * assertion here is a NEW, config-level, offline invariant introduced by 260713-hrd.
 * They are different things.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getMaxOutput, getTimeout, TIER_TIMEOUTS } from '../../_shared/tier-config.ts';
import { getCareerOutputSchema } from '../../_shared/career-output-schema.ts';

function winSafePath(url: string): string {
  const raw = new URL(url, import.meta.url).pathname;
  return raw.startsWith('/') && raw[2] === ':' ? raw.slice(1) : raw;
}

const source = await Deno.readTextFile(winSafePath('../index.ts'));

// ── The hardcoded budget is gone; the configured budget reaches the model ─────

Deno.test('260713-hrd token-budget: the hardcoded `isElite ? 3500 : 2500` cap is GONE (RC-2)', () => {
  assert(
    !source.includes('isElite ? 3500 : 2500'),
    'the hardcoded output cap starved a ~3,000-token schema at 2,500 tokens and truncated every run',
  );
  assert(!/maxTokens:\s*(2500|3500)\b/.test(source), 'no hardcoded 2500/3500 output budget may remain');
});

Deno.test('260713-hrd token-budget: live model calls receive the configured Elite base/growth/extras split', () => {
  assert(
    source.includes('maxTokens: isElite ? eliteBaseMaxTokens : maxTokensForAnalysis'),
    'Free must receive maxTokensForAnalysis while Elite base receives its configured share',
  );
  assert(
    source.includes('maxTokens: eliteGrowthMaxTokens'),
    'Elite growth must receive its configured share',
  );
  assert(
    source.includes('maxTokens: eliteExtrasMaxTokens'),
    'Elite compensation must receive the remaining configured share',
  );
  assert(
    source.includes("getMaxOutput('careerCompass', resolvedTier)"),
    'the budget must be derived per-tier from the central ceiling, not a literal',
  );
});

// ── elite-cc-mixed-format: generation is constrained before repair ──────────

Deno.test('elite-cc-mixed-format: the live legacy call sends the tier JSON Schema to Anthropic', () => {
  assert(
    source.includes("outputSchema: getCareerOutputSchema(isElite ? 'elite' : 'free', 'base')"),
    'the live base call must prevent mixed JSON/Markdown with constrained decoding',
  );
  assert(
    source.includes("outputSchema: getCareerOutputSchema('elite', 'growth')"),
    'the Elite growth call must also be constrained',
  );
  assert(
    source.includes("outputSchema: getCareerOutputSchema('elite', 'elite-extras')"),
    'the Elite extras call must also be constrained',
  );
});

Deno.test('elite-cc-mixed-format: the merged Elite envelopes require every paid section', () => {
  const baseSchema = getCareerOutputSchema('elite', 'base') as {
    properties: Record<string, unknown>;
    required: string[];
  };
  const growthSchema = getCareerOutputSchema('elite', 'growth') as {
    properties: Record<string, unknown>;
    required: string[];
  };
  const extrasSchema = getCareerOutputSchema('elite', 'elite-extras') as {
    properties: Record<string, unknown>;
    required: string[];
  };

  for (const key of [
    'careerDNA',
    'careerFields',
    'surpriseFits',
    'roles',
  ]) {
    assert(baseSchema.required.includes(key), `Elite core output must require ${key}`);
    assert(key in baseSchema.properties, `Elite core output must define ${key}`);
  }

  for (const key of ['roleReadinessBreakdown', 'skillGaps', 'roleRoadmaps', 'roadmap']) {
    assert(growthSchema.required.includes(key), `Elite growth output must require ${key}`);
    assert(key in growthSchema.properties, `Elite growth output must define ${key}`);
  }

  assert(
    extrasSchema.required.includes('compensationIntelligence'),
    'Elite extras must require compensationIntelligence',
  );
  assert(
    'compensationIntelligence' in extrasSchema.properties,
    'Elite extras must define compensationIntelligence',
  );
  assert(
    extrasSchema.required.includes('smartApplicationStrategy') &&
      'smartApplicationStrategy' in extrasSchema.properties,
    'Elite extras must require the established top-level application strategy contract',
  );
  assert(!('compensationIntelligence' in baseSchema.properties), 'the rejected all-in-one schema must not return');
  assert(!('skillGaps' in baseSchema.properties), 'growth fields must not leak back into the core grammar');
});

Deno.test('elite-cc-mixed-format: Free schema cannot leak paid fields', () => {
  const schema = getCareerOutputSchema('free') as {
    properties: Record<string, unknown>;
    required: string[];
  };

  for (const key of ['skillGaps', 'roleRoadmaps', 'roadmap', 'compensationIntelligence']) {
    assert(!schema.required.includes(key), `Free constrained output must not require ${key}`);
    assert(!(key in schema.properties), `Free constrained output must not expose ${key}`);
  }
});

Deno.test('elite-cc-mixed-format: every object in all schemas rejects undeclared fields', () => {
  const assertClosedObjects = (schema: unknown, path: string): void => {
    if (!schema || typeof schema !== 'object') return;
    const node = schema as Record<string, unknown>;
    if (node.type === 'object') {
      assertEquals(node.additionalProperties, false, `${path} must set additionalProperties:false`);
      const properties = node.properties as Record<string, unknown>;
      assertEquals(node.required, Object.keys(properties), `${path} must require every declared property`);
      for (const [key, child] of Object.entries(properties)) assertClosedObjects(child, `${path}.${key}`);
    }
    if (node.type === 'array') assertClosedObjects(node.items, `${path}[]`);
  };

  assertClosedObjects(getCareerOutputSchema('free'), 'free');
  assertClosedObjects(getCareerOutputSchema('elite', 'base'), 'elite.base');
  assertClosedObjects(getCareerOutputSchema('elite', 'growth'), 'elite.growth');
  assertClosedObjects(getCareerOutputSchema('elite', 'elite-extras'), 'elite.extras');
});

// ── The per-tier ceilings themselves ──────────────────────────────────────────

// FINAL (Phase 02 plan 02-09 — 02-APPROVED-CAPS.md, LOCKED 2026-07-27): free 4800
// (keep — measured peak 2935), elite/pro 11000 (base 5000 + growth 4000 + elite-extras 2000).
Deno.test('260713-hrd token-budget: getMaxOutput careerCompass free=4800 / elite=11000', () => {
  assertEquals(getMaxOutput('careerCompass', 'free'), 4800);
  assertEquals(getMaxOutput('careerCompass', 'elite'), 11000);
  assertEquals(getMaxOutput('careerCompass', 'pro'), 11000, 'pro collapses to the elite cell');
});

Deno.test('260713-hrd token-budget: NEW config-level invariant — Free is under 50% of Elite for careerCompass', () => {
  // Free's scope is now materially SMALLER (no roadmap / roleRoadmaps / skillGaps /
  // compensationIntelligence), so its budget must be materially smaller too — this is
  // the cost ceiling expressed as an offline, config-level assertion.
  //
  // NOT the same thing as _shared/tier-validation.test.ts:312 (live-Anthropic, measured
  // output_tokens, RUN_TIER_VALIDATION=1-gated, not in test:ci). See the file header.
  const free = getMaxOutput('careerCompass', 'free');
  const elite = getMaxOutput('careerCompass', 'elite');
  assert(
    free < elite * 0.5,
    `careerCompass free (${free}) must sit below 50% of elite (${elite}) — Free's schema is now strictly smaller`,
  );
});

Deno.test('260713-hrd token-budget: CAREER_CALL_CONFIGS.base.maxTokensFree equals the free ceiling (boot invariant cannot throw)', () => {
  // analyze-career:74-81 THROWS AT MODULE LOAD if the per-tier CAREER_CALL_CONFIGS sum
  // exceeds getMaxOutput. If a pricing-config free change lands WITHOUT the matching
  // base.maxTokensFree change, the function dies on deploy. This is that tripwire.
  // Phase 02 LOCKED final (02-09): back to 4800 (keep), moved in lockstep with pricing-config.
  const match = source.match(/callType:\s*'base',\s*maxTokensFree:\s*(\d+)/);
  assert(match, 'CAREER_CALL_CONFIGS base entry must declare maxTokensFree');
  const baseFree = Number(match![1]);
  assertEquals(baseFree, 4800, 'base.maxTokensFree must track the free ceiling');
  assertEquals(
    baseFree,
    getMaxOutput('careerCompass', 'free'),
    'base.maxTokensFree MUST equal getMaxOutput free, or the boot invariant throws at module load',
  );
  assert(!/maxTokensFree:\s*12000/.test(source), 'the stale 12000 free budget must be gone');
});

// ── ED-4: the timeout ladder moves in the SAME commit as the budget ───────────

// 260713-hrd (second pass): Elite's wall moved 90s -> 120s on MEASURED evidence. A complete
// Elite report is a big generation — real Preview runs land at 19 653 and 28 377 chars and take
// 65-87s — so at 90s a good run was finishing with only a ~4% margin and a slightly longer one
// timed out (408) despite being perfectly valid. Free's ask is much narrower and nowhere near
// its wall, so Free stays at 90s. The tiers are deliberately NO LONGER equal.
Deno.test('260713-hrd token-budget: the `career` CallType gives Elite a 120s wall and Free 90s', () => {
  assertEquals(TIER_TIMEOUTS.free.career, 90_000, 'Free is unchanged — its generation is small');
  assertEquals(TIER_TIMEOUTS.elite.career, 120_000, 'Elite needs headroom over an observed 87s run');
  assertEquals(getTimeout('free', 'career'), 90_000);
  assertEquals(getTimeout('elite', 'career'), 120_000);
  assertEquals(getTimeout('pro', 'career'), 120_000, 'pro normalizes onto the elite row');
});

Deno.test('260713-hrd token-budget: the per-call wall still sits UNDER the server deadline and the client poll', () => {
  // The whole point of the ladder: the client must never give up before the server does, and a
  // single call must never be able to outlive the deadline that bounds the retry loop.
  //   per-call 120s < server total 165s < client poll 180s
  assert(
    getTimeout('elite', 'career') < 165_000,
    'a single career call must not be able to outrun CAREER_TOTAL_DEADLINE_MS',
  );
});

Deno.test('260713-hrd token-budget: NO-LEAK PROOF — the widened career wall does not touch `core` (ED-3)', () => {
  // Every other feature calls getTimeout(tier) with the DEFAULT 'core' callType. If the
  // career widening had been applied to `core`, resume/RCL/onboarding would silently
  // inherit a 90s wall. The dedicated CallType is what contains the blast radius.
  assertEquals(TIER_TIMEOUTS.free.core, 50_000, 'free core is UNCHANGED');
  assertEquals(TIER_TIMEOUTS.elite.core, 155_000, 'elite core is UNCHANGED');
  assertEquals(getTimeout('free'), 50_000, 'the default callType still resolves core');
});

Deno.test('260713-hrd token-budget: the server deadline (165s) bounds the retry loop and sits under the client poll (180s)', () => {
  assert(
    /CAREER_TOTAL_DEADLINE_MS\s*=\s*165_000/.test(source),
    'one request-scoped 165s deadline must bound ALL retries (the 260713-2ay ladder)',
  );
  assert(source.includes('invokeWithRetry('), 'the bespoke 3-attempt loop is replaced by the deadline-bounded shared helper');
  assert(
    /deadlineAt\s*=\s*Date\.now\(\)\s*\+\s*CAREER_TOTAL_DEADLINE_MS/.test(source),
    'the deadline must be minted ONCE per request, not per retry loop',
  );
  assert(
    source.includes("getTimeout(resolvedTier as Tier, 'career')"),
    "the per-call wall must read the dedicated 'career' CallType, not the default 'core'",
  );
  // Ladder ordering: per-call < server deadline < client poll.
  assert(90_000 < 165_000 && 165_000 < 180_000, 'ladder: per-call 90s < server 165s < client 180s');
});

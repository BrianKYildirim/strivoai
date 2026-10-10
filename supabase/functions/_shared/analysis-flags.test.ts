/**
 * Phase 03 · 03-04 · LIFE-03 / D-04 — analysis-flags dormancy contract.
 *
 * The lifecycle executor ships DORMANT: `isAnalysisFeatureEnabled(feature)` must
 * return false unless BOTH the master flag AND the per-feature flag are the exact
 * lowercase string 'true'. This guards the ascending-blast-radius gate:
 *   - default (no env) → OFF for master + all five features,
 *   - master OFF overrides any feature ON,
 *   - both master + feature ON is REQUIRED,
 *   - fail-closed exact-'true' semantics ('True' / '1' / 'yes' / 'on' → OFF).
 *
 * Because the module reads env at cold start (D-05, mirrors MERIT_SYSTEM_ENABLED),
 * each case sets env FIRST, then imports the module with a unique cache-busting
 * query so Deno re-evaluates the module-scope reads.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const FEATURES = ['resume', 'linkedin', 'recruiting_lens', 'onboarding', 'career_compass'] as const;

const FEATURE_ENV: Record<(typeof FEATURES)[number], string> = {
  resume: 'ANALYSIS_LIFECYCLE_RESUME',
  linkedin: 'ANALYSIS_LIFECYCLE_LINKEDIN',
  recruiting_lens: 'ANALYSIS_LIFECYCLE_RECRUITING_LENS',
  onboarding: 'ANALYSIS_LIFECYCLE_ONBOARDING',
  career_compass: 'ANALYSIS_LIFECYCLE_CAREER_COMPASS',
};

const ALL_ENV = ['ANALYSIS_LIFECYCLE_ENABLED', ...Object.values(FEATURE_ENV)];

function clearEnv(): void {
  for (const name of ALL_ENV) Deno.env.delete(name);
}

let counter = 0;
async function freshImport(env: Record<string, string>) {
  clearEnv();
  for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);
  // Unique query → Deno re-evaluates module-scope cold-start reads.
  return await import(`./analysis-flags.ts?case=${counter++}`);
}

Deno.test('default (no env set): master flag OFF', async () => {
  const m = await freshImport({});
  assertEquals(m.ANALYSIS_LIFECYCLE_ENABLED, false);
});

Deno.test('default (no env set): every feature OFF', async () => {
  const m = await freshImport({});
  for (const f of FEATURES) {
    assertEquals(m.isAnalysisFeatureEnabled(f), false, `feature ${f} must default OFF`);
  }
});

Deno.test('master OFF overrides feature ON (blast-radius gate)', async () => {
  const m = await freshImport({ ANALYSIS_LIFECYCLE_RESUME: 'true' });
  assertEquals(m.ANALYSIS_LIFECYCLE_ENABLED, false);
  assertEquals(m.isAnalysisFeatureEnabled('resume'), false);
});

Deno.test('master ON but feature OFF → feature disabled', async () => {
  const m = await freshImport({ ANALYSIS_LIFECYCLE_ENABLED: 'true' });
  assertEquals(m.ANALYSIS_LIFECYCLE_ENABLED, true);
  for (const f of FEATURES) {
    assertEquals(m.isAnalysisFeatureEnabled(f), false, `feature ${f} still OFF with only master on`);
  }
});

Deno.test('both master + feature ON → feature enabled (only that feature)', async () => {
  const m = await freshImport({
    ANALYSIS_LIFECYCLE_ENABLED: 'true',
    ANALYSIS_LIFECYCLE_RESUME: 'true',
  });
  assertEquals(m.isAnalysisFeatureEnabled('resume'), true);
  // Sibling features stay OFF — enabling one never enables the others.
  assertEquals(m.isAnalysisFeatureEnabled('linkedin'), false);
  assertEquals(m.isAnalysisFeatureEnabled('career_compass'), false);
});

Deno.test('every feature can be independently enabled with master ON', async () => {
  for (const f of FEATURES) {
    const m = await freshImport({
      ANALYSIS_LIFECYCLE_ENABLED: 'true',
      [FEATURE_ENV[f]]: 'true',
    });
    assertEquals(m.isAnalysisFeatureEnabled(f), true, `feature ${f} should enable`);
  }
});

Deno.test('fail-closed: master accepts ONLY exact lowercase "true"', async () => {
  for (const bad of ['True', 'TRUE', '1', 'yes', 'on', 'false', '']) {
    const m = await freshImport({ ANALYSIS_LIFECYCLE_ENABLED: bad });
    assertEquals(m.ANALYSIS_LIFECYCLE_ENABLED, false, `master must reject "${bad}"`);
  }
  const on = await freshImport({ ANALYSIS_LIFECYCLE_ENABLED: 'true' });
  assertEquals(on.ANALYSIS_LIFECYCLE_ENABLED, true);
  // Strict: even mixed-case 'tRuE' is rejected (fail-closed dormancy switch).
  const mixed = await freshImport({ ANALYSIS_LIFECYCLE_ENABLED: 'tRuE' });
  assertEquals(mixed.ANALYSIS_LIFECYCLE_ENABLED, false);
});

Deno.test('fail-closed: per-feature flag accepts ONLY exact lowercase "true"', async () => {
  for (const bad of ['True', '1', 'yes', 'on']) {
    const m = await freshImport({
      ANALYSIS_LIFECYCLE_ENABLED: 'true',
      ANALYSIS_LIFECYCLE_RESUME: bad,
    });
    assertEquals(m.isAnalysisFeatureEnabled('resume'), false, `feature must reject "${bad}"`);
  }
});

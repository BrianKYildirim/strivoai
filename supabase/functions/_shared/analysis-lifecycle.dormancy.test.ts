// Phase 03 · 03-07 · D-04 — Dormancy guard for the shared analysis lifecycle substrate.
//
// The lifecycle substrate (analysis-lifecycle.ts + its idempotency / validation /
// error-taxonomy / flag modules) ships BUILT-BUT-DORMANT in Phase 3: it exists and is
// unit-tested, but NO feature routes through it and its flags default OFF. Phases 4/5/6
// wire it on one feature at a time (ascending blast radius). This static-source guard is
// the proof that Phase 3 changed ZERO runtime behavior:
//
//   (a) ANALYSIS_LIFECYCLE_ENABLED default-derives to false when the env var is unset —
//       the master kill switch is OFF out of the box (cold-start read, flags idiom).
//   (b) No NOT-YET-MIGRATED feature/analysis edge handler imports
//       `_shared/analysis-lifecycle.ts`. Phase 4+ wires features onto the substrate one
//       at a time BEHIND the runtime dormancy flags (which still default OFF — the (a)/(a')
//       guarantee), so for a MIGRATED feature the dormancy proof moves from "no import" to
//       "flags default OFF". This list therefore shrinks by one feature per migration plan:
//       recruiting_lens (04-01) and linkedin (04-04) are migrated and legitimately import
//       the executor (flag-gated); analyze-resume (05-01, onboarding executor adoption) and
//       analyze-career (06-01, career_compass legacy-branch adoption) are now migrated too.
//       06-02 plumbs the career QUEUE onto the ledger: submit-career-analysis-job derives
//       the key + calls create_or_recover_analysis_run and process-career-analysis-job
//       defers its writes — both gated on isAnalysisFeatureEnabled('career_compass') but
//       NEITHER imports the executor directly (the executor lives across the worker ->
//       analyze-career hop). They are therefore reconciled to a THIRD guard (b''):
//       flag-gated (references isAnalysisFeatureEnabled) AND executor-import-absent. Only the
//       RESUME job workers remain fully unwired under guard (b). Comment lines are stripped
//       before matching so a `// TODO: wire analysis-lifecycle` note can never satisfy (or
//       break) the assertion.
//   (c) The five substrate modules physically exist — proving built-but-dormant, not
//       merely absent.
//
// Approach: static source analysis (cors-audit.test.ts:43-77 idiom) + a cold-start
// env-read import (analysis-flags.test.ts idiom). No Supabase/Anthropic mocking.

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';

// NOT-YET-MIGRATED feature + analysis entrypoints that must still be fully unwired
// (guard (b): no executor import, no flag gate). Only the RESUME job workers remain here —
// the career job workers moved to FLAG_GATED_QUEUE_ENTRYPOINTS when 06-02 plumbed the
// career queue onto the ledger.
const FEATURE_ENTRYPOINTS = [
  'submit-resume-analysis-job/index.ts',
  'process-resume-analysis-job/index.ts',
] as const;

// 06-02 · FEAT-05 — the career QUEUE functions are flag-gated onto the ledger but do NOT
// import the executor directly (it lives across the worker -> analyze-career hop). Their
// dormancy is proven by guard (a)/(a') (flags default OFF) PLUS: they reference
// isAnalysisFeatureEnabled (the flag gate) AND they do NOT import _shared/analysis-lifecycle.
const FLAG_GATED_QUEUE_ENTRYPOINTS = [
  'submit-career-analysis-job/index.ts', // 06-02: create_or_recover + derived key + payload threading
  'process-career-analysis-job/index.ts', // 06-02: two-writer deferral to the executor
] as const;

// Features already migrated onto the substrate (flag-gated). Their dormancy is proven by
// guard (a)/(a') — the master + per-feature flags default OFF — NOT by absence of import.
const MIGRATED_ENTRYPOINTS = [
  'recruiting-lens/index.ts', // 04-01
  'grade-linkedin/index.ts', // 04-04
  'analyze-resume/index.ts', // 05-01 (onboarding executor adoption)
  'analyze-career/index.ts', // 06-01 (career_compass legacy-branch executor adoption)
] as const;

// The five substrate modules that must exist (built-but-dormant proof).
const SUBSTRATE_MODULES = [
  '_shared/idempotency-key.ts',
  '_shared/llm-validation.ts',
  '_shared/analysis-error-taxonomy.ts',
  '_shared/analysis-lifecycle.ts',
  '_shared/analysis-flags.ts',
] as const;

function resolveFromShared(relPath: string): string {
  // On Windows, import.meta.url pathname begins with /C:/... which Deno cannot open.
  // Strip the leading slash to get a valid Windows path (cors-audit.test.ts idiom).
  const rawPath = new URL(`../${relPath}`, import.meta.url).pathname;
  return rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
}

/** Remove `//`-comment lines so a comment reference can't satisfy/break the import scan. */
function stripLineComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

// (a) Master kill switch default-derives OFF when the env var is unset.
Deno.test('dormancy (a): ANALYSIS_LIFECYCLE_ENABLED default-derives to false (env unset)', async () => {
  Deno.env.delete('ANALYSIS_LIFECYCLE_ENABLED');
  // Unique query → Deno re-evaluates the module-scope cold-start read.
  const flags = await import('./analysis-flags.ts?dormancy-master-default');
  assertEquals(flags.ANALYSIS_LIFECYCLE_ENABLED, false);
});

// (a') Every feature default-derives OFF when nothing is set (no feature can wake).
Deno.test('dormancy (a): every feature default-derives OFF with no env set', async () => {
  for (const name of [
    'ANALYSIS_LIFECYCLE_ENABLED',
    'ANALYSIS_LIFECYCLE_RESUME',
    'ANALYSIS_LIFECYCLE_LINKEDIN',
    'ANALYSIS_LIFECYCLE_RECRUITING_LENS',
    'ANALYSIS_LIFECYCLE_ONBOARDING',
    'ANALYSIS_LIFECYCLE_CAREER_COMPASS',
  ]) {
    Deno.env.delete(name);
  }
  const flags = await import('./analysis-flags.ts?dormancy-feature-default');
  for (const f of ['resume', 'linkedin', 'recruiting_lens', 'onboarding', 'career_compass'] as const) {
    assertEquals(flags.isAnalysisFeatureEnabled(f), false, `feature ${f} must default OFF`);
  }
});

// (b) No feature/analysis entrypoint imports the lifecycle executor (unwired).
for (const entry of FEATURE_ENTRYPOINTS) {
  Deno.test(`dormancy (b): [${entry}] does not import _shared/analysis-lifecycle`, () => {
    const source = stripLineComments(Deno.readTextFileSync(resolveFromShared(entry)));
    assertEquals(
      source.includes('analysis-lifecycle'),
      false,
      `${entry} routes through the substrate — Phase 3 must ship it DORMANT (no feature import)`,
    );
  });
}

// (b') Migrated features ARE wired onto the substrate — their dormancy is flag-based
// (guard (a)/(a')), not import-absence. Asserting the import proves the migration landed
// AND documents that "no import" no longer applies to these features.
for (const entry of MIGRATED_ENTRYPOINTS) {
  Deno.test(`dormancy (b'): [${entry}] imports the flag-gated lifecycle executor (migrated)`, () => {
    const source = stripLineComments(Deno.readTextFileSync(resolveFromShared(entry)));
    assertEquals(
      source.includes('analysis-lifecycle'),
      true,
      `${entry} is migrated — it must import the executor (dormancy is flag-gated, not import-absence)`,
    );
  });
}

// (b'') The career queue functions are flag-gated onto the ledger: they reference the
// isAnalysisFeatureEnabled gate (dormancy is (a)/(a'), flags default OFF) but do NOT import
// the executor directly (it lives across the worker -> analyze-career hop, 06-02).
for (const entry of FLAG_GATED_QUEUE_ENTRYPOINTS) {
  Deno.test(`dormancy (b''): [${entry}] is flag-gated (isAnalysisFeatureEnabled) but does NOT import the executor`, () => {
    const source = stripLineComments(Deno.readTextFileSync(resolveFromShared(entry)));
    assertEquals(
      source.includes('isAnalysisFeatureEnabled'),
      true,
      `${entry} must gate its ledger path on isAnalysisFeatureEnabled (dormant OFF)`,
    );
    assertEquals(
      source.includes('analysis-lifecycle'),
      false,
      `${entry} must NOT import the executor directly — it defers across the worker -> analyze-career hop`,
    );
  });
}

// (c) The substrate modules physically exist (built-but-dormant, not absent).
for (const mod of SUBSTRATE_MODULES) {
  Deno.test(`dormancy (c): substrate module ${mod} exists (built-but-dormant)`, () => {
    const stat = Deno.statSync(resolveFromShared(mod));
    assertEquals(stat.isFile, true);
  });
}

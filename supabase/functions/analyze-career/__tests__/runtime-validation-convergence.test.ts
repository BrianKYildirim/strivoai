/**
 * Phase 06 · 06-03 · FEAT-05 / D-07 / D-08 / SC-3 — career runtime validation convergence.
 *
 * The analyze-career executor (06-01) converges the FINAL ASSEMBLED career object
 * (post repairTruncatedJSON / applyCareerTierShape / applyCareerCompassFreeOutputPolicy,
 * elite-extras folded NON-fatally) through ONE seam:
 *
 *   validateModelOutput(JSON.stringify(finalObject), careerCompassSchema,
 *                       { semanticCheck: careerSemanticCheck })
 *
 * This guard drives real assembled career objects through that exact seam and proves:
 *
 *   (1) a currently-valid Free/Pro/Elite success CONVERGES (ok:true) — the permissive
 *       `.passthrough()` schema + the assertCareerOutputComplete-faithful
 *       semanticCheck can NEVER reject an output the lenient career path already
 *       accepts (byte-faithful; validating the assembled OBJECT means truncation
 *       cannot false-fail a success the path repairs-and-accepts).
 *   (2) invalid / truncated / empty / empty-core output → a TYPED `AnalysisErrorCode`
 *       (MODEL_INVALID_RESPONSE / MODEL_OUTPUT_TRUNCATED / SCHEMA_VALIDATION_FAILED),
 *       NEVER a 200-with-fabricated-guidance (SC-3 / T-06-11).
 *   (3) an Elite output MISSING compensationIntelligence still converges as a valid
 *       CORE — elite extras are non-fatal (D-08).
 *
 * std@0.224.0 to match the lifecycle guard neighbors.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { AnalysisErrorCode } from '../../_shared/analysis-error-taxonomy.ts';
import { validateModelOutput } from '../../_shared/llm-validation.ts';
import { careerCompassSchema, careerSemanticCheck } from '../../_shared/career-validation.ts';

// ── A realistic assembled Free career result (the OBJECT the executor serializes) ──
//
// Non-empty careerDNA + a non-empty careerFields array + a roleReadinessBreakdown
// object — the CORE intersection every currently-accepted output carries — plus the
// extra narrative structures the career path emits.

function realisticFreeCareerResult(): Record<string, unknown> {
  return {
    careerDNA: 'A systems-minded backend engineer with quantified platform impact.',
    detectedDomain: 'software',
    careerFields: [
      { field: 'Platform Engineering', matchScore: 88, why: 'Owns reliability + tooling' },
      { field: 'Backend Engineering', matchScore: 82, why: 'Distributed systems depth' },
    ],
    surpriseFits: [{ role: 'Developer Experience Lead', why: 'Tooling + empathy' }],
    roles: [{ title: 'Senior Backend Engineer', matchScore: 84 }],
    roleReadinessBreakdown: { targetRole: 'Staff Software Engineer', overall: 72 },
    roleReadinessScore: 72,
    whatYouHave: ['Distributed systems', 'Quantified impact'],
  };
}

// ── (1) A valid Free success CONVERGES through the seam (never rejected) ──────────

Deno.test('FEAT-05: a real assembled Free career result converges (ok) through validateModelOutput', () => {
  const res = validateModelOutput(JSON.stringify(realisticFreeCareerResult()), careerCompassSchema, {
    semanticCheck: careerSemanticCheck,
  });
  assert(res.ok, `a currently-valid Free success must converge, got ${res.ok ? '' : `${res.code}: ${res.detail}`}`);
});

Deno.test('FEAT-05: convergence is BYTE-FAITHFUL — the validated value deep-equals the assembled object', () => {
  const input = realisticFreeCareerResult();
  const res = validateModelOutput(JSON.stringify(input), careerCompassSchema, { semanticCheck: careerSemanticCheck });
  assert(res.ok);
  assertEquals(res.value, input, 'the passthrough schema must not drop/reshape a single field of a valid success');
});

Deno.test('FEAT-05 (D-08): an Elite result MISSING compensationIntelligence still converges as a valid CORE', () => {
  // Elite extras are folded NON-fatally; their absence must never fail validation.
  const eliteSansComp = {
    ...realisticFreeCareerResult(),
    roadmap: [{ phase: '0-3mo', focus: 'Deepen k8s' }],
    roleRoadmaps: [{ role: 'Platform Engineer', phases: [{ phase: '0-3mo' }] }],
    skillGaps: [{ skill: 'Kubernetes operators', severity: 'medium' }],
    // compensationIntelligence deliberately ABSENT
  };
  const res = validateModelOutput(JSON.stringify(eliteSansComp), careerCompassSchema, {
    semanticCheck: careerSemanticCheck,
  });
  assert(res.ok, `an elite core sans compensationIntelligence must converge, got ${res.ok ? '' : res.code}`);
});

// ── (2) Invalid / truncated / empty / empty-core → TYPED error, never a 200-body ──

Deno.test('FEAT-05: empty model output → MODEL_INVALID_RESPONSE (never fabricated guidance)', () => {
  const res = validateModelOutput('', careerCompassSchema, { semanticCheck: careerSemanticCheck });
  assertEquals(res.ok, false);
  assert(!res.ok);
  const code: AnalysisErrorCode = res.code;
  assertEquals(code, 'MODEL_INVALID_RESPONSE');
});

Deno.test('FEAT-05: an empty object {} → MODEL_INVALID_RESPONSE (empty/generic)', () => {
  const res = validateModelOutput('{}', careerCompassSchema, { semanticCheck: careerSemanticCheck });
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'MODEL_INVALID_RESPONSE');
});

Deno.test('FEAT-05: garbage (non-JSON) output → MODEL_INVALID_RESPONSE', () => {
  const res = validateModelOutput('not json at all <<<>>>', careerCompassSchema, { semanticCheck: careerSemanticCheck });
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'MODEL_INVALID_RESPONSE');
});

Deno.test('FEAT-05: a TRUNCATED (clipped) career body → MODEL_OUTPUT_TRUNCATED (rejected, never repaired-and-accepted)', () => {
  const truncated = '{"careerDNA":"A systems-minded engineer","careerFields":[{"field":"Platform","matchScore":88';
  const res = validateModelOutput(truncated, careerCompassSchema, { semanticCheck: careerSemanticCheck });
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'MODEL_OUTPUT_TRUNCATED');
});

Deno.test('FEAT-05: empty careerFields array → SCHEMA_VALIDATION_FAILED (superRefine core guard)', () => {
  const emptyFields = { ...realisticFreeCareerResult(), careerFields: [] };
  const res = validateModelOutput(JSON.stringify(emptyFields), careerCompassSchema, { semanticCheck: careerSemanticCheck });
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'SCHEMA_VALIDATION_FAILED');
});

Deno.test('FEAT-05: empty careerDNA → SCHEMA_VALIDATION_FAILED (degenerate core never renders)', () => {
  const emptyDna = { ...realisticFreeCareerResult(), careerDNA: '   ' };
  const res = validateModelOutput(JSON.stringify(emptyDna), careerCompassSchema, { semanticCheck: careerSemanticCheck });
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'SCHEMA_VALIDATION_FAILED', 'a blank careerDNA must reach a typed error, never render');
});

Deno.test('FEAT-05: missing roleReadinessBreakdown → SCHEMA_VALIDATION_FAILED (semanticCheck core)', () => {
  const noReadiness = { ...realisticFreeCareerResult() };
  delete (noReadiness as Record<string, unknown>).roleReadinessBreakdown;
  const res = validateModelOutput(JSON.stringify(noReadiness), careerCompassSchema, { semanticCheck: careerSemanticCheck });
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'SCHEMA_VALIDATION_FAILED');
});

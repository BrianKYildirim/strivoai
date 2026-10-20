/**
 * Phase 05 · 05-03 · FEAT-02 / D-10 — resume runtime validation convergence.
 *
 * Both the onboarding executor (index.ts:1226) and the streaming wrapper
 * (index.ts:971) converge the FINAL ASSEMBLED resume object through ONE seam:
 *
 *   validateModelOutput(JSON.stringify(finalObject), resumeAnalysisSchema,
 *                       { semanticCheck: resumeSemanticCheck })
 *
 * This guard drives a REAL assembled Free result through that exact seam and proves:
 *
 *   (1) a currently-valid Free success CONVERGES (ok:true) — the permissive
 *       `.passthrough()` schema + the passesQualityFloor-faithful semanticCheck can
 *       NEVER reject an output the lenient Free path already accepts (the D-10
 *       collision spot: validating the assembled OBJECT means needsStructuralRepair
 *       cannot false-fail a success the Free path repairs-and-accepts).
 *   (2) invalid / truncated / empty / all-zero / all-identical output → a TYPED
 *       AnalysisErrorCode (MODEL_INVALID_RESPONSE / MODEL_OUTPUT_TRUNCATED /
 *       SCHEMA_VALIDATION_FAILED), NEVER a 200-with-body or a substituted score.
 *
 * std@0.224.0 to match the lifecycle guard neighbors.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validateModelOutput } from '../../_shared/llm-validation.ts';
import { resumeAnalysisSchema, resumeSemanticCheck } from '../resume-validation.ts';

// ── A realistic assembled Free result (as executeFreeAnalysis emits it) ──────────
//
// overallScore + a non-empty criterionFeedback array with UNEVEN, non-zero scores,
// plus the extra narrative fields the Free path carries. This is the post-repair,
// post-reconcileScore, post-applyTierShape OBJECT the wrapper serializes.

function realisticFreeResult(): Record<string, unknown> {
  return {
    overallScore: 71,
    criterionFeedback: [
      { id: 'impact', label: 'Impact & Achievements', score: 8, weight: 20, feedback: { observation: 'Strong metrics', impact: 'Reads senior', fix: 'Add scope' } },
      { id: 'clarity', label: 'Clarity & Concision', score: 6, weight: 15, feedback: { observation: 'Dense bullets', impact: 'Skimmable', fix: 'Tighten' } },
      { id: 'ats', label: 'ATS Compatibility', score: 7, weight: 15, feedback: { observation: 'Good keywords', impact: 'Parses well', fix: 'Add role terms' } },
      { id: 'structure', label: 'Structure', score: 9, weight: 10, feedback: { observation: 'Clean layout', impact: 'Professional', fix: 'None' } },
    ],
    executiveSummary: 'A solid mid-level resume with quantified impact and room to sharpen targeting.',
    suggestions: [
      { title: 'Add scope to leadership bullets', originalText: 'Led team', improvedText: 'Led a 6-person team', potentialScoreIncrease: 4 },
    ],
    industryGuess: 'software',
    suggestedTargetRoles: ['Senior Engineer'],
    recommendedKeywords: ['distributed systems'],
    _mergeSource: 'free-single',
  };
}

// ── (1) A valid Free success CONVERGES through the seam (never rejected) ──────────

Deno.test('FEAT-02: a real assembled Free result converges (ok) through validateModelOutput', () => {
  const res = validateModelOutput(JSON.stringify(realisticFreeResult()), resumeAnalysisSchema, {
    semanticCheck: resumeSemanticCheck,
  });
  assert(res.ok, `a currently-valid Free success must converge, got ${res.ok ? '' : `${res.code}: ${res.detail}`}`);
});

Deno.test('FEAT-02: convergence is BYTE-FAITHFUL — the validated value deep-equals the assembled object (D-10)', () => {
  const input = realisticFreeResult();
  const res = validateModelOutput(JSON.stringify(input), resumeAnalysisSchema, { semanticCheck: resumeSemanticCheck });
  assert(res.ok);
  assertEquals(res.value, input, 'the passthrough schema must not drop/reshape a single field of a valid success');
});

Deno.test('FEAT-02: a `criteria`-keyed (legacy alias) Free result also converges', () => {
  const legacyShaped = { overallScore: 64, criteria: realisticFreeResult().criterionFeedback };
  const res = validateModelOutput(JSON.stringify(legacyShaped), resumeAnalysisSchema, { semanticCheck: resumeSemanticCheck });
  assert(res.ok, 'the schema/semanticCheck must accept the criteria alias exactly as the Free floor does');
});

// ── (2) Invalid / truncated / empty output → TYPED error, never a 200-with-body ──

Deno.test('FEAT-02: empty model output → MODEL_INVALID_RESPONSE (never a substituted body)', () => {
  const res = validateModelOutput('', resumeAnalysisSchema, { semanticCheck: resumeSemanticCheck });
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'MODEL_INVALID_RESPONSE');
});

Deno.test('FEAT-02: an empty object {} → MODEL_INVALID_RESPONSE (empty/generic)', () => {
  const res = validateModelOutput('{}', resumeAnalysisSchema, { semanticCheck: resumeSemanticCheck });
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'MODEL_INVALID_RESPONSE');
});

Deno.test('FEAT-02: garbage (non-JSON) output → MODEL_INVALID_RESPONSE', () => {
  const res = validateModelOutput('not json at all <<<>>>', resumeAnalysisSchema, { semanticCheck: resumeSemanticCheck });
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'MODEL_INVALID_RESPONSE');
});

Deno.test('FEAT-02: a TRUNCATED (clipped) body → MODEL_OUTPUT_TRUNCATED (rejected, never repaired-and-accepted)', () => {
  // A clipped JSON body: json-repair could close it, but validateModelOutput REJECTS
  // (LIFE-07 — never a partial-but-accepted result).
  const truncated = '{"overallScore":71,"criterionFeedback":[{"id":"impact","score":8,"weight":20';
  const res = validateModelOutput(truncated, resumeAnalysisSchema, { semanticCheck: resumeSemanticCheck });
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'MODEL_OUTPUT_TRUNCATED');
});

Deno.test('FEAT-02: missing overallScore → SCHEMA_VALIDATION_FAILED', () => {
  const noScore = { criterionFeedback: realisticFreeResult().criterionFeedback };
  const res = validateModelOutput(JSON.stringify(noScore), resumeAnalysisSchema, { semanticCheck: resumeSemanticCheck });
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'SCHEMA_VALIDATION_FAILED');
});

Deno.test('FEAT-02: empty criteria array → SCHEMA_VALIDATION_FAILED (superRefine non-empty guard)', () => {
  const emptyCriteria = { overallScore: 50, criterionFeedback: [] };
  const res = validateModelOutput(JSON.stringify(emptyCriteria), resumeAnalysisSchema, { semanticCheck: resumeSemanticCheck });
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'SCHEMA_VALIDATION_FAILED');
});

Deno.test('FEAT-02: all-zero criterion scores → SCHEMA_VALIDATION_FAILED (model did not score)', () => {
  const allZero = {
    overallScore: 0,
    criterionFeedback: [
      { id: 'impact', score: 0, weight: 20 },
      { id: 'clarity', score: 0, weight: 15 },
    ],
  };
  const res = validateModelOutput(JSON.stringify(allZero), resumeAnalysisSchema, { semanticCheck: resumeSemanticCheck });
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'SCHEMA_VALIDATION_FAILED', 'a degenerate all-zero body must reach a typed error, never render');
});

Deno.test('FEAT-02: all-identical criterion scores → SCHEMA_VALIDATION_FAILED (lazy model)', () => {
  const allSame = {
    overallScore: 50,
    criterionFeedback: [
      { id: 'impact', score: 50, weight: 20 },
      { id: 'clarity', score: 50, weight: 15 },
      { id: 'ats', score: 50, weight: 15 },
    ],
  };
  const res = validateModelOutput(JSON.stringify(allSame), resumeAnalysisSchema, { semanticCheck: resumeSemanticCheck });
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'SCHEMA_VALIDATION_FAILED');
});

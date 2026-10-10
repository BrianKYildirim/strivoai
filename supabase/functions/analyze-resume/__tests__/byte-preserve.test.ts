/**
 * Phase 05 · 05-03 · FEAT-02 / D-09 / D-10 — resume byte-preserve collision guard.
 *
 * The resume migration (05-01) inserted `resumeAnalysisSchema` in front of the
 * saved `resumes.grading_data` write. D-10's non-negotiable constraint: that schema
 * WRAPS an unchanged product output — it may reject a genuinely malformed body, but
 * it must NEVER drop, reshape, re-derive, or narrow a field the Free/Pro/Elite path
 * currently emits. A dropped field is a silent product regression on a paid feature.
 *
 * This guard proves BYTE-PRESERVE: for a golden Free, Pro-shaped, and Elite result
 * object, the validated value DEEP-EQUALS the input (no field loss, no reshape, no
 * coercion). It is the deep-equality complement to runtime-validation-convergence
 * (which proves accept/reject via validateModelOutput). Because the schema is
 * `.passthrough()` with only `overallScore: number` required and a `.superRefine`
 * that adds NO transform, the parsed value is the input verbatim.
 *
 * std@0.224.0 to match the lifecycle guard neighbors.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resumeAnalysisSchema } from '../resume-validation.ts';

// A criterion feedback array with uneven, non-zero scores (never degenerate).
function criteria() {
  return [
    { id: 'impact', label: 'Impact & Achievements', score: 8, weight: 20, feedback: { observation: 'Metrics present', impact: 'Senior signal', fix: 'Add scope' } },
    { id: 'clarity', label: 'Clarity', score: 6, weight: 15, feedback: { observation: 'Dense', impact: 'Skimmable', fix: 'Tighten' } },
    { id: 'ats', label: 'ATS', score: 7, weight: 15, feedback: { observation: 'Keywords', impact: 'Parses', fix: 'Role terms' } },
  ];
}

/** A golden Free result — narrative fields, no elite extras. */
function makeFreeResult(): Record<string, unknown> {
  return {
    overallScore: 68,
    criterionFeedback: criteria(),
    executiveSummary: 'A capable resume with quantified impact.',
    suggestions: [{ title: 'Add scope', originalText: 'Led team', improvedText: 'Led a 6-person team', potentialScoreIncrease: 4 }],
    industryGuess: 'software',
    suggestedTargetRoles: ['Senior Engineer'],
    recommendedKeywords: ['distributed systems'],
    eliteInsights: null,
    _mergeSource: 'free-single',
  };
}

/** A golden Pro-shaped result — adds rewriteSuggestions, keeps eliteInsights null. */
function makeProResult(): Record<string, unknown> {
  return {
    overallScore: 77,
    criterionFeedback: criteria().map((c) => ({ ...c, weight: c.weight, feedback: [c.feedback.observation, c.feedback.impact, c.feedback.fix] })),
    executiveSummary: 'A strong resume; targeting can be sharpened.',
    rewriteSuggestions: [
      { section: 'summary', original: 'Experienced engineer', rewritten: 'Backend engineer specializing in distributed systems', rationale: 'Specific + searchable' },
    ],
    suggestedTargetRoles: ['Staff Engineer', 'Backend Lead'],
    recommendedKeywords: ['Kafka', 'observability'],
    industryGuess: 'software',
    eliteInsights: null,
    _mergeSource: 'parallel',
  };
}

/** A golden Elite result — full eliteInsights payload + deeper structures. */
function makeEliteResult(): Record<string, unknown> {
  return {
    overallScore: 88,
    criterionFeedback: criteria().map((c) => ({ ...c, feedback: [c.feedback.observation, c.feedback.impact, c.feedback.fix, 'deeper', 'rewrite'] })),
    executiveSummary: 'An excellent, well-targeted resume.',
    rewriteSuggestions: [
      { section: 'experience', original: 'Improved performance', rewritten: 'Cut p99 latency 40% by resharding the write path', rationale: 'Quantified + technical' },
    ],
    eliteInsights: {
      marketPositioning: 'Top-quartile for staff-level backend roles.',
      competitiveEdges: ['Distributed systems depth', 'Quantified impact'],
      compensationSignal: 'Supports a senior-to-staff band.',
      networkingAngles: ['Systems conferences', 'OSS maintainership'],
    },
    suggestedTargetRoles: ['Staff Engineer', 'Principal Engineer'],
    recommendedKeywords: ['sharding', 'SLOs', 'capacity planning'],
    industryGuess: 'software',
    _mergeSource: 'parallel',
  };
}

Deno.test('byte-preserve: a golden Free result validates AND deep-equals the input (no field loss)', () => {
  const input = makeFreeResult();
  const result = resumeAnalysisSchema.safeParse(input);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data, input, 'validated Free output must deep-equal the input — no drop/reshape/coerce');
  }
});

Deno.test('byte-preserve: a golden Pro-shaped result validates AND deep-equals the input (D-09)', () => {
  const input = makeProResult();
  const result = resumeAnalysisSchema.safeParse(input);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data, input, 'validated Pro output must deep-equal the input');
  }
});

Deno.test('byte-preserve: a golden Elite result (full eliteInsights) validates AND deep-equals the input (D-10)', () => {
  const input = makeEliteResult();
  const result = resumeAnalysisSchema.safeParse(input);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data, input, 'the eliteInsights payload + deeper feedback must survive validation byte-for-byte');
  }
});

Deno.test('byte-preserve: merger-emitted extra/metadata fields survive validation unchanged (passthrough)', () => {
  const input = {
    ...makeEliteResult(),
    metadata: { analysis_id: '00000000-0000-0000-0000-000000000000', tier: 'elite', analysisDate: '2026-07-06T00:00:00.000Z' },
    analysis_id: '00000000-0000-0000-0000-000000000000',
  };
  const result = resumeAnalysisSchema.safeParse(input);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data, input, 'passthrough extras (metadata, analysis_id) must never be dropped');
  }
});

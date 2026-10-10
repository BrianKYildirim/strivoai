/**
 * Phase 04 · 04-06 · FEAT-06 / D-06 — Recruiting Lens byte-preserve guard.
 *
 * The recruiting-lens migration (04-01) inserted a strict zod validator
 * (`recruitingLensOutputSchema`) in front of the merger output. D-06's non-negotiable
 * constraint: that validator WRAPS an unchanged product output — it may reject a
 * genuinely malformed body, but it must NEVER drop, reshape, re-derive, or narrow a
 * field the merger currently emits. A dropped field is a silent product regression.
 *
 * This guard proves BYTE-PRESERVE: for a captured real Elite output, the REAL Pro
 * tier-shaped subset, and a minimal currently-passing regression sample, the validated
 * object DEEP-EQUALS the input (no field loss, no reshape, no coercion). It is the
 * deep-equality complement to schema.test.ts (which proves accept/reject).
 *
 * Fixtures mirror recruiting-lens/schema.test.ts (which mirrors the merger fixture).
 * std@0.168.0 to match that neighbor's assert version. zod is validated via the schema.
 */
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  applyRecruitingLensTierShape,
  type RecruitingLensOutput,
} from '../../_shared/recruiting-lens-merger.ts';
import { buildRecruitingLensUserPrompt } from '../../_shared/recruiting-lens-prompts.ts';
import { recruitingLensOutputSchema } from '../schema.ts';

// A fully-merged Elite output (mirrors the merger + schema.test.ts fixtures).
function makeFullEliteOutput(): RecruitingLensOutput {
  return {
    preAnalysis: { jdKeywords: ['react', 'typescript'], dealBreakers: ['5+ years'], industry: 'tech', culture: 'startup' },
    overallMatch: { score: 72, label: 'Moderate Match', summary: 'Solid foundation with gaps.' },
    subScores: {
      experienceAlignment: { score: 70, rationale: 'Good experience alignment.' },
      skillAlignment: { score: 65, rationale: 'Missing some required skills.' },
      impactStrength: { score: 80, rationale: 'Strong impact metrics.' },
      keywordAndLanguageMatch: { score: 55, rationale: 'Some keywords missing.' },
      credibilityAndSeniorityFit: { score: 75, rationale: 'Good seniority fit.' },
    },
    recruiterVerdict: 'Worth advancing to phone screen.',
    scoreRationale: [{ category: 'Technical Skills', strengths: ['React'], weaknesses: ['GraphQL'] }],
    topGaps: [
      { title: 'Gap 1', severity: 'critical', whyItMatters: 'Matters 1', howItShowsUp: 'Shows 1', fixPriority: 'immediate' },
      { title: 'Gap 2', severity: 'high', whyItMatters: 'Matters 2', howItShowsUp: 'Shows 2', fixPriority: 'short-term' },
      { title: 'Gap 3', severity: 'medium', whyItMatters: 'Matters 3', howItShowsUp: 'Shows 3', fixPriority: 'long-term' },
    ],
    roadmap: [
      { stage: 'immediate', action: 'Fix resume', why: 'Better match', expectedImpact: '+10' },
      { stage: 'short-term', action: 'Learn GraphQL', why: 'Required skill', expectedImpact: '+15' },
    ],
    resumeEdits: [
      { original: 'Old 1', rewritten: 'New 1', qualityGates: { jdVocab: true, achievementTransform: true, signalDensity: true, jdTargeting: true, pasteReady: true } },
    ],
    linkedinImprovements: [{ area: 'headline', suggestion: 'Update headline.' }],
    strategicAdvice: { applyNow: true, summary: 'Apply now.', biggestScoreMover: 'Add GraphQL.' },
    keywords: { matched: ['react'], missing: ['graphql'] },
    quickFixes: ['Fix typo', 'Add keywords'],
    _meta: { totalGaps: 3, totalEdits: 1 },
  };
}

// A minimal currently-passing output (only the hard-required product fields).
function makeMinimalPassingOutput() {
  return {
    overallMatch: { score: 40, label: 'Weak Match', summary: 'Needs work.' },
    recruiterVerdict: 'Not ready.',
    topGaps: [{ title: 'Only gap', severity: 'high', whyItMatters: 'Matters.' }],
  };
}

Deno.test('byte-preserve: a full Elite output validates AND deep-equals the input (no field loss)', () => {
  const input = makeFullEliteOutput();
  const result = recruitingLensOutputSchema.safeParse(input);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data, input, 'validated Elite output must deep-equal the input — no drop/reshape/coerce');
  }
});

Deno.test('byte-preserve: the REAL Pro tier-shaped subset validates AND deep-equals the shaped input (D-06)', () => {
  const proShaped = makeFullEliteOutput();
  applyRecruitingLensTierShape(proShaped, 'pro'); // strips strategicAdvice/keywords/quickFixes/roadmap/etc, caps topGaps
  const result = recruitingLensOutputSchema.safeParse(proShaped);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data, proShaped, 'validated Pro-shaped output must deep-equal what the shaper emitted');
  }
});

Deno.test('byte-preserve: a minimal currently-passing regression sample deep-equals the input', () => {
  const input = makeMinimalPassingOutput();
  const result = recruitingLensOutputSchema.safeParse(input);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data, input, 'a minimal passing output must survive validation byte-for-byte');
  }
});

Deno.test('byte-preserve: merger-emitted extra fields survive validation unchanged (passthrough)', () => {
  const input = { ...makeFullEliteOutput(), analysisId: '00000000-0000-0000-0000-000000000000', metadata: { cache_key: 'abc', tier: 'elite' } };
  const result = recruitingLensOutputSchema.safeParse(input);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data, input, 'passthrough extras (analysisId, metadata) must never be dropped');
  }
});

Deno.test('byte-preserve: a 5,500-character job description reaches prompt construction unchanged (RCL-02)', () => {
  const jobDescription = Array.from(
    { length: 5_500 },
    (_, index) => String.fromCharCode(97 + (index % 26)),
  ).join('');
  const prompt = buildRecruitingLensUserPrompt(
    'Synthetic resume summary long enough for the handler contract.',
    jobDescription,
  );
  const start = prompt.indexOf('=== JOB DESCRIPTION ===\n') +
    '=== JOB DESCRIPTION ===\n'.length;
  const end = prompt.indexOf('\n\n=== LINKEDIN PROFILE (optional) ===', start);

  assertEquals(prompt.slice(start, end), jobDescription);
});

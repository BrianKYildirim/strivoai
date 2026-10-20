/**
 * Phase 04 · 04-GAP-01 — non-lifecycle runtime-path validation convergence (regression lock).
 *
 * THE BUG (found by gsd-verifier, 04-VERIFICATION.md): 04-03 rewrote prompts.ts in
 * place so the model ALWAYS emits the NEW 11-section rubric, but the LIVE runtime
 * paths in grade-linkedin/index.ts (runTieredAiCall + the pre-merit legacy path)
 * still validated with the OLD 4-section validateLinkedInGrade(). Every real
 * (non-lifecycle) grade-linkedin request therefore failed validation on both
 * attempts and returned a 500 — the LinkedIn Grader was non-functional in its
 * deployable (flags-off) configuration. No test drove a real 11-section response
 * through the actual runtime validation seam, so the drift shipped undetected.
 *
 * THE FIX: every runtime path now converges onto ONE validation source of truth —
 * `validateLinkedInModelResponse` (parse → server-inject rawScore via
 * normalizeFromSections → linkedInGradeSchema + linkedInSemanticCheck). This test
 * drives a realistic full 4-section model response (uneven per-section scores, a
 * non-applicable section, and NO model-supplied total — exactly what the 08.3-01
 * prompt asks for) through that ACTUAL seam and asserts it SUCCEEDS with a
 * server-computed direct-sum rawScore. It also asserts an OLD legacy 4-section
 * (pre-Phase-4, different names/shape) payload is now REJECTED, and fail-closes if
 * any runtime path re-references the retired validator.
 *
 * std@0.224.0 to match the lifecycle guard neighbors.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validateLinkedInModelResponse } from '../validation.ts';
import { LINKEDIN_SECTIONS, type NormalizableSection, normalizeFromSections } from '../schema.ts';

// ── Realistic 4-section model response (as the 08.3-01 contract defines it) ─────
//
// The model emits NO overall total (FEAT-03 — "Do NOT output an overall numeric
// total ... the server computes the headline total"). Scores are uneven per
// section. The combined search-alignment section is marked inapplicable to prove
// its score contributes zero without rescaling.

const UNEVEN_SCORES: Record<string, number> = {
  Headline: 12,
  About: 11,
  Experience: 35,
  'Search Alignment, Skills & Credentials': 0,
};

const NON_APPLICABLE = new Set(['Search Alignment, Skills & Credentials']);

/** A full 4-section model section object (NEW rubric shape, no top-level total). */
function modelSection(name: string, baseMax: number) {
  return {
    name,
    applicable: !NON_APPLICABLE.has(name),
    maxScore: baseMax,
    score: UNEVEN_SCORES[name] ?? 0,
    evidence: `Quoted evidence for ${name}`,
    strengths: [`${name} strength`],
    weaknesses: [`${name} weakness`],
    improvements: [`${name} improvement`],
  };
}

/** The full model response as raw JSON text — NOTE: no rawScore / overall total. */
function realisticModelResponseText(): string {
  return JSON.stringify({
    scoreJustification: 'A concrete 2-3 sentence overall assessment of this profile.',
    nextBestAction: { action: 'Rewrite the headline', reason: 'Searchability', expectedImpact: '+5 recruiter views' },
    sectionBreakdown: LINKEDIN_SECTIONS.map((s) => modelSection(s.name, s.baseMax)),
    topFixes: [
      { title: 'Add metrics to Experience', currentText: 'Managed a team', suggestedFix: 'Led a 6-person team, cutting cycle time 30%', whyItWorks: 'Quantified impact ranks higher', pointsGain: 'Experience +3', priority: 1 },
      { title: 'Enrich the About section', currentText: 'Missing', suggestedFix: 'A 3-paragraph narrative with searchable keywords', whyItWorks: 'Recruiters skip empty narratives', pointsGain: 'About +4', priority: 2 },
    ],
    keyStrengths: ['Clear career progression', 'Quantified experience bullets'],
  });
}

/** The server-authoritative expected total for the fixture above. */
function expectedRawScore(): number {
  const normalizable: NormalizableSection[] = LINKEDIN_SECTIONS.map((s) => ({
    applicable: !NON_APPLICABLE.has(s.name),
    maxScore: s.baseMax,
    score: Math.min(s.baseMax, Math.max(0, UNEVEN_SCORES[s.name] ?? 0)),
  }));
  return normalizeFromSections(normalizable);
}

// ── (1) The exact bug scenario: a real 4-section response SUCCEEDS end-to-end ──

Deno.test('04-GAP-01: a realistic 4-section model response (no model total) SUCCEEDS through the runtime seam', () => {
  const res = validateLinkedInModelResponse(realisticModelResponseText());
  assert(res.ok, `expected success, got failure: ${res.ok ? '' : `${res.code}: ${res.detail}`}`);
});

Deno.test('04-GAP-01: the runtime seam injects the server-computed math-from-sections rawScore', () => {
  const res = validateLinkedInModelResponse(realisticModelResponseText());
  assert(res.ok);
  const expected = expectedRawScore();
  assertEquals(res.value.rawScore, expected, `rawScore must equal normalizeFromSections (${expected})`);
  // Sanity: the non-applicable combined section contributes zero without rescaling.
  assert(expected > 0 && expected <= 100);
});

Deno.test('04-GAP-01: a model-supplied (wrong) total is IGNORED — the server owns the number (FEAT-03)', () => {
  // Even if the model disobeys and emits a bogus rawScore, the server injects the
  // math-from-sections value; the response still succeeds with the correct total.
  const withBogusTotal = JSON.parse(realisticModelResponseText());
  withBogusTotal.rawScore = 3; // model tries to fabricate a total
  const res = validateLinkedInModelResponse(JSON.stringify(withBogusTotal));
  assert(res.ok, 'server-injected total must override a model-supplied number, not fail');
  assertEquals(res.value.rawScore, expectedRawScore());
});

// ── (2) The OLD 4-section payload is now REJECTED (the shape that used to pass) ──

Deno.test('04-GAP-01: an OLD legacy 4-section payload is REJECTED by the converged seam', () => {
  const legacy4Section = JSON.stringify({
    rawScore: 62,
    scoreJustification: 'Solid profile with room for improvement in skills.',
    nextBestAction: { action: 'Add 10 more skills', reason: 'Skills below threshold', expectedImpact: '+5 points' },
    sectionBreakdown: [
      { name: 'Headline', score: 15, maxScore: 20, feedback: ['a', 'b', 'c'], status: 'good' },
      { name: 'Experience', score: 22, maxScore: 30, feedback: ['a', 'b', 'c'], status: 'needs-improvement' },
      { name: 'Skills & Endorsements', score: 12, maxScore: 25, feedback: ['a', 'b', 'c'], status: 'needs-improvement' },
      { name: 'Profile Completeness', score: 13, maxScore: 25, feedback: ['a', 'b', 'c'], status: 'needs-improvement' },
    ],
    topFixes: [{ title: 'Fix', currentText: 'x', suggestedFix: 'y', whyItWorks: 'z', pointsGain: '+3', priority: 1 }],
    keyStrengths: ['Quantified experience bullets'],
  });
  const res = validateLinkedInModelResponse(legacy4Section);
  assertEquals(res.ok, false, 'a legacy 4-section payload must no longer validate');
  assert(!res.ok && res.code === 'SCHEMA_VALIDATION_FAILED');
});

// ── (3) Malformed input still reaches a TYPED error (never a fabricated body) ──

Deno.test('04-GAP-01: garbage model output → TYPED error through the runtime seam (no 200-with-body)', () => {
  const res = validateLinkedInModelResponse('not json at all <<<>>>');
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'MODEL_INVALID_RESPONSE');
});

// ── (4) Fail-closed guard: no runtime path may reference the retired validator ──

function readSource(relFromTests: string): string {
  const rawPath = new URL(relFromTests, import.meta.url).pathname;
  const path = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  return Deno.readTextFileSync(path);
}

/** Drop block comments then whole-line `//` comments — assert over CODE only. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

Deno.test('04-GAP-01 fail-closed: index.ts references NO retired 4-section validator/clamp', () => {
  const index = stripComments(readSource('../index.ts'));
  assertEquals(index.includes('validateLinkedInGrade'), false, 'retired 4-section validateLinkedInGrade re-wired into a runtime path');
  assertEquals(index.includes('clampLinkedInSectionScores'), false, 'retired 4-section clamp re-wired into a runtime path');
  assertEquals(index.includes('stripLinkedInFreeTier'), false, 'D-05-violating free-tier strip reintroduced');
});

Deno.test('04-GAP-01 fail-closed: validation.ts no longer defines the 4-section validator/clamp', () => {
  const validation = stripComments(readSource('../validation.ts'));
  assertEquals(validation.includes('export function validateLinkedInGrade'), false, '4-section validateLinkedInGrade resurrected');
  assertEquals(validation.includes('EXPECTED_SECTIONS'), false, '4-section EXPECTED_SECTIONS map resurrected');
  assertEquals(validation.includes('export function clampLinkedInSectionScores'), false, '4-section clamp resurrected');
  // The single source of truth IS present.
  assert(validation.includes('export function validateLinkedInModelResponse'), 'the converged validator must exist');
});

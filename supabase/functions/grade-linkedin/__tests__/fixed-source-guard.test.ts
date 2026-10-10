/**
 * Phase 04 · 04-06 · FEAT-03 — aggregate fixed-score-source guard (fails-closed).
 *
 * FEAT-03's core invariant: the LinkedIn headline total has NO fixed source. It is
 * neither anchored by the prompt, nor re-injected from a prior grade, nor defaulted
 * by the schema, nor surfaced from a DB non-null default, nor fabricated by the
 * model on a malformed response. Each of those was a real ~52-clustering / drift
 * vector removed across 04-02..04-05. This guard is the regression lock: it
 * fails-closed the moment any one of them is reintroduced.
 *
 * Two proof styles:
 *   (A) Static-source assertions over the shipped source strings (comment lines are
 *       stripped first — a doc comment mentioning a forbidden token must never
 *       satisfy OR break the guard; the redesign deliberately DOCUMENTS what it
 *       removed). Mirrors cors-audit.test.ts / refund-boundary.test.ts idioms.
 *   (B) A runtime proof that a truncated / empty / garbage / total-mismatched model
 *       output flows through the strict validateModelOutput seam to a TYPED error —
 *       never a 200-with-body and never a fabricated score.
 *
 * std@0.224.0 to match the lifecycle guard neighbors.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validateModelOutput } from '../../_shared/llm-validation.ts';
import { LINKEDIN_SECTIONS, linkedInGradeSchema } from '../schema.ts';
import { linkedInSemanticCheck } from '../validation.ts';

// ── Source readers (Windows leading-slash idiom; strip `//` + block comments) ──

function readSource(relFromTests: string): string {
  const rawPath = new URL(relFromTests, import.meta.url).pathname;
  const path = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  return Deno.readTextFileSync(path);
}

/** Operate on CODE only: drop block comments then whole-line `//` comments. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

const PROMPTS = stripComments(readSource('../prompts.ts'));
const INDEX = stripComments(readSource('../index.ts'));
const SCHEMA = stripComments(readSource('../schema.ts'));
const FRONTEND = stripComments(readSource('../../../../src/pages/LinkedInGrader.tsx'));

// ── (A1) Prompt layer: no follow-up / prior-grade re-injection block (Pitfall 8) ──

Deno.test('fixed-source: prompts.ts carries NO follow-up / prior-grade re-injection in code', () => {
  assertEquals(PROMPTS.includes('followUpContext'), false, 'followUpContext re-injection reintroduced');
  assertEquals(PROMPTS.includes('followUp'), false, 'a followUp param/block reintroduced');
  assertEquals(PROMPTS.includes('previousGrade'), false, 'previousGrade re-injection reintroduced');
});

// ── (A2) Prompt layer: no cross-profile numeric calibration anchors ──
//
// The discrete per-section bands ("0-1: ...", "7-9: ...") are legitimate scoring
// rubrics, NOT anchors. The forbidden pattern is a cross-profile CALIBRATION target
// ("most profiles score ~", "target range", "calibrate to the average"). Those
// phrases live only in the removal-documenting comments, so comment-stripped code
// must contain none of them.
Deno.test('fixed-source: prompts.ts has no cross-profile numeric calibration anchors', () => {
  const anchorPhrases = [/target range/i, /calibrat/i, /typical score/i, /average profile/i, /most profiles score/i];
  for (const re of anchorPhrases) {
    assert(!re.test(PROMPTS), `calibration-anchor phrase reintroduced: ${re}`);
  }
});

// ── (A3) index.ts idempotency/cache key derivation carries no save-mutated field ──

Deno.test('fixed-source: index.ts key derivation has no prior_grade_id (save-mutated) field', () => {
  assertEquals(INDEX.includes('prior_grade_id'), false, 'prior_grade_id reintroduced into the key/cache identity');
  assertEquals(INDEX.includes('priorGradeId'), false, 'priorGradeId reintroduced into the key/cache identity');
});

// ── (A4) schema.ts: no placeholder / default SCORE constant (no fixed source) ──

Deno.test('fixed-source: schema.ts has no default() coercion or placeholder/default score constant', () => {
  assertEquals(SCHEMA.includes('.default('), false, 'a zod .default() coercion reintroduced (silent fixed source)');
  assert(!/DEFAULT_SCORE|PLACEHOLDER_SCORE|FIXED_SCORE/i.test(SCHEMA), 'a default/placeholder score constant reintroduced');
});

// ── (A5) frontend: no LOCKED_FIXES_PLACEHOLDERS depth-gating block (D-05) ──

Deno.test('fixed-source: LinkedInGrader.tsx has no LOCKED_FIXES_PLACEHOLDERS block', () => {
  assertEquals(FRONTEND.includes('LOCKED_FIXES_PLACEHOLDERS'), false, 'LOCKED_FIXES_PLACEHOLDERS depth-gating reintroduced');
});

// ── (B) Runtime: malformed model output → TYPED error, never 200-with-body ──

function fullValidGradeObject(rawScoreOverride?: number) {
  const sectionBreakdown = LINKEDIN_SECTIONS.map((sec) => ({
    name: sec.name,
    applicable: true,
    maxScore: sec.baseMax,
    score: sec.baseMax, // all-max → direct sum = 100
    evidence: `Evidence for ${sec.name}`,
    strengths: ['a strength'],
    weaknesses: ['a weakness'],
    improvements: ['an improvement'],
  }));
  return {
    rawScore: rawScoreOverride ?? 100,
    scoreJustification: 'A concrete overall assessment sentence.',
    nextBestAction: { action: 'Rewrite the headline', reason: 'Searchability', expectedImpact: '+5' },
    sectionBreakdown,
    topFixes: [
      { title: 'Fix 1', currentText: 'Missing', suggestedFix: 'Paste-ready text', whyItWorks: 'Visibility', pointsGain: '+3', priority: 1 },
    ],
    keyStrengths: ['Quantified experience bullets'],
  };
}

const validateOpts = { semanticCheck: linkedInSemanticCheck };

Deno.test('fixed-source: empty model output → typed MODEL_INVALID_RESPONSE (no body)', () => {
  const res = validateModelOutput('', linkedInGradeSchema, validateOpts);
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'MODEL_INVALID_RESPONSE');
});

Deno.test('fixed-source: garbage (non-JSON) model output → typed MODEL_INVALID_RESPONSE (no body)', () => {
  const res = validateModelOutput('this is not json at all <<<>>>', linkedInGradeSchema, validateOpts);
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'MODEL_INVALID_RESPONSE');
});

Deno.test('fixed-source: truncated/clipped model output → typed MODEL_OUTPUT_TRUNCATED (never repaired-and-accepted)', () => {
  const clipped = '{"rawScore": 72, "scoreJustification": "ok", "sectionBreakdown": [ {"name": "Headline"';
  const res = validateModelOutput(clipped, linkedInGradeSchema, validateOpts);
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'MODEL_OUTPUT_TRUNCATED');
});

Deno.test('fixed-source: empty object {} → typed error, never an accepted generic body', () => {
  const res = validateModelOutput('{}', linkedInGradeSchema, validateOpts);
  assertEquals(res.ok, false);
  assert(!res.ok && (res.code === 'MODEL_INVALID_RESPONSE' || res.code === 'SCHEMA_VALIDATION_FAILED'));
});

Deno.test('fixed-source: a fabricated total that != math-from-sections is REJECTED (semanticCheck, no silent overwrite)', () => {
  // A structurally-perfect body whose rawScore (50) does not equal the direct sum (100).
  const body = JSON.stringify(fullValidGradeObject(50));
  const res = validateModelOutput(body, linkedInGradeSchema, validateOpts);
  assertEquals(res.ok, false, 'a model-fabricated headline total must never be accepted as a real score');
  assert(!res.ok && res.code === 'SCHEMA_VALIDATION_FAILED');
});

Deno.test('fixed-source: the honest math-from-sections total IS the only accepted path', () => {
  // Same body, honest rawScore = 100 (== all-max direct sum). This is the ONLY ok:true path.
  const res = validateModelOutput(JSON.stringify(fullValidGradeObject(100)), linkedInGradeSchema, validateOpts);
  assertEquals(res.ok, true);
});

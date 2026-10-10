/**
 * Phase 09 · 09-05 · FEAT-06 / D-11 Path A — Recruiting Lens runtime validation
 * convergence (VER-02 S-12 / S-13 / S-14, plus the S-10 / S-11 classifier routing).
 *
 * THE SEAM. RCL's migrated path threads `schema: recruitingLensOutputSchema`
 * (recruiting-lens/index.ts:629) into `runAnalysisLifecycle`, whose validating_output
 * step is ONE call — `validateModelOutput(raw, params.schema, params.validationOpts)`
 * (_shared/analysis-lifecycle.ts:326). That is the seam driven here, directly, with the
 * exact schema the handler supplies (RCL passes no semanticCheck). This guard proves:
 *
 *   (1) POSITIVE CONTROL — a REAL merged Elite output (and the REAL Pro tier-shaped
 *       subset, produced by running `applyRecruitingLensTierShape`) CONVERGES ok:true
 *       through the seam, byte-faithfully. This is what proves the test drives the live
 *       validator and not a strawman: the 04-GAP-01 lesson was that an in-place schema
 *       rewrite left the live path validating with a retired validator, so every real
 *       request 500'd while only the dormant path was correct — and no test caught it
 *       because none drove the real seam with a real success body.
 *   (2) invalid / empty / truncated / schema-violating output → a TYPED
 *       `AnalysisErrorCode` (MODEL_INVALID_RESPONSE / MODEL_OUTPUT_TRUNCATED /
 *       SCHEMA_VALIDATION_FAILED) — NEVER a substituted, repaired or fabricated body.
 *       A permissive validator that "repairs" bad JSON into an accepted result is the
 *       single worst failure mode in this product; the truncation case asserts the
 *       repair-and-accept path is closed.
 *
 * D-11 PATH A (mandatory, threat T-09-05-A): the malformed output is driven into the
 * VALIDATION BOUNDARY directly. `_shared/anthropic.ts` has NO seam that can force a
 * malformed SUCCESS body (both branches return `{ok:false,status}`), and a verification
 * phase must not add a fault-injection branch to a production code path. This file
 * changes zero production source — same posture as the analyze-resume / grade-linkedin /
 * analyze-career instances of this suite.
 *
 * S-10 / S-11: the live provider-fault seam (MERIT_TEST_FORCE_REFUNDABLE_ERROR, staging-
 * gated) raises a status-bearing `MeritRefundable`. The assertions below prove RCL's
 * failure shape ROUTES into the shared `classifyFailure` partition as retryable
 * MODEL_TIMEOUT (408) / MODEL_RATE_LIMITED (429) — a per-feature routing assertion, not
 * a re-test of the classifier itself (that lives in analysis-lifecycle.classifier.test.ts).
 *
 * std@0.224.0 to match the lifecycle guard neighbors.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validateModelOutput } from '../../_shared/llm-validation.ts';
import { classifyFailure } from '../../_shared/analysis-lifecycle.ts';
import { MeritRefundable } from '../../_shared/merit-gateway.ts';
import { applyRecruitingLensTierShape, type RecruitingLensOutput } from '../../_shared/recruiting-lens-merger.ts';
import { recruitingLensOutputSchema } from '../schema.ts';

/** The seam, exactly as the executor calls it (no semanticCheck — RCL supplies none). */
function validateRcl(raw: string) {
  return validateModelOutput(raw, recruitingLensOutputSchema);
}

// ── A realistic merged Elite output (as mergeRecruitingLensResults emits it) ─────

function mergedEliteOutput(): RecruitingLensOutput {
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
    recruiterVerdict: 'Worth advancing to a phone screen.',
    scoreRationale: [{ category: 'Technical Skills', strengths: ['React'], weaknesses: ['GraphQL'] }],
    topGaps: [
      { title: 'Gap 1', severity: 'critical', whyItMatters: 'Matters 1', howItShowsUp: 'Shows 1', fixPriority: 'immediate' },
      { title: 'Gap 2', severity: 'high', whyItMatters: 'Matters 2', howItShowsUp: 'Shows 2', fixPriority: 'short-term' },
    ],
    roadmap: [{ stage: 'immediate', action: 'Fix resume', why: 'Better match', expectedImpact: '+10' }],
    resumeEdits: [
      { original: 'Old 1', rewritten: 'New 1', qualityGates: { jdVocab: true, achievementTransform: true, signalDensity: true, jdTargeting: true, pasteReady: true } },
    ],
    linkedinImprovements: [{ area: 'headline', suggestion: 'Update the headline.' }],
    strategicAdvice: { applyNow: true, summary: 'Apply now.', biggestScoreMover: 'Add GraphQL.' },
    keywords: { matched: ['react'], missing: ['graphql'] },
    quickFixes: ['Fix typo', 'Add keywords'],
    _meta: { totalGaps: 2, totalEdits: 1 },
  };
}

// ── (1) POSITIVE CONTROL — a valid RCL result converges through the real seam ────

Deno.test('FEAT-06: a real merged Elite result converges (ok) through validateModelOutput — the seam the lifecycle drives', () => {
  const res = validateRcl(JSON.stringify(mergedEliteOutput()));
  assert(res.ok, `a currently-valid Elite success must converge, got ${res.ok ? '' : `${res.code}: ${res.detail}`}`);
});

Deno.test('FEAT-06: convergence is BYTE-FAITHFUL — the validated value deep-equals the merged object', () => {
  const input = mergedEliteOutput();
  const res = validateRcl(JSON.stringify(input));
  assert(res.ok);
  assertEquals(res.value, input, 'the passthrough schema must not drop/reshape a single field of a valid success');
});

Deno.test('FEAT-06: the REAL Pro tier-shaped subset also converges (the shaper cannot be validated away)', () => {
  // applyRecruitingLensTierShape STRIPS strategicAdvice/keywords/quickFixes/roadmap/etc.
  // The validator must accept the stripped body — a Pro run must never 500 on validation.
  const proShaped = mergedEliteOutput();
  applyRecruitingLensTierShape(proShaped, 'pro');
  const res = validateRcl(JSON.stringify(proShaped));
  assert(res.ok, `the Pro tier-shaped output must converge, got ${res.ok ? '' : `${res.code}: ${res.detail}`}`);
});

// ── (2) S-12 — invalid model JSON → MODEL_INVALID_RESPONSE, never a substituted body ──

Deno.test('FEAT-06: garbage (non-JSON) output → MODEL_INVALID_RESPONSE', () => {
  const res = validateRcl('not json at all <<<>>>');
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'MODEL_INVALID_RESPONSE');
});

Deno.test('FEAT-06: empty model output → MODEL_INVALID_RESPONSE (never a substituted body)', () => {
  const res = validateRcl('');
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'MODEL_INVALID_RESPONSE');
  // No fabricated result may leak through the failure branch.
  assert(!('value' in res), 'a failure must never carry a substituted value');
});

Deno.test('FEAT-06: an empty object {} → MODEL_INVALID_RESPONSE (empty/generic)', () => {
  const res = validateRcl('{}');
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'MODEL_INVALID_RESPONSE');
});

// ── (2) S-13 — truncated output → MODEL_OUTPUT_TRUNCATED, never repaired-and-accepted ──

Deno.test('FEAT-06: a TRUNCATED (clipped) body → MODEL_OUTPUT_TRUNCATED (rejected, never repaired-and-accepted)', () => {
  // A clipped RCL body: json-repair COULD close it into a parseable object, but
  // validateModelOutput REJECTS (LIFE-07 — never a partial-but-accepted result). This is
  // the assertion that keeps a half-generated recruiter verdict from ever rendering.
  const truncated =
    '{"overallMatch":{"score":72,"label":"Moderate Match","summary":"Solid foundation with gaps."},' +
    '"recruiterVerdict":"Worth advancing to a phone screen.","topGaps":[{"title":"Gap 1","severity":"critical"';
  const res = validateRcl(truncated);
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'MODEL_OUTPUT_TRUNCATED', `expected MODEL_OUTPUT_TRUNCATED, got ${res.ok ? 'ok' : res.code}`);
});

Deno.test('FEAT-06: a body clipped mid-string is NOT silently completed into an accepted result', () => {
  const clippedMidString = '{"overallMatch":{"score":72,"label":"Moderate Match","summary":"Solid found';
  const res = validateRcl(clippedMidString);
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'MODEL_OUTPUT_TRUNCATED');
});

// ── (2) S-14 — RCL-specific schema violations → SCHEMA_VALIDATION_FAILED ────────

Deno.test('FEAT-06: missing overallMatch.score → SCHEMA_VALIDATION_FAILED', () => {
  const bad = mergedEliteOutput() as unknown as Record<string, unknown>;
  delete (bad.overallMatch as Record<string, unknown>).score;
  const res = validateRcl(JSON.stringify(bad));
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'SCHEMA_VALIDATION_FAILED');
});

Deno.test('FEAT-06: an out-of-range overallMatch.score → SCHEMA_VALIDATION_FAILED (never a clamped score)', () => {
  const bad = mergedEliteOutput() as unknown as Record<string, unknown>;
  (bad.overallMatch as Record<string, unknown>).score = 150;
  const res = validateRcl(JSON.stringify(bad));
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'SCHEMA_VALIDATION_FAILED', 'a 150 must be REJECTED, never clamped to 100 and rendered');
});

Deno.test('FEAT-06: an empty topGaps array → SCHEMA_VALIDATION_FAILED (min(1) non-empty guard)', () => {
  const bad = mergedEliteOutput() as unknown as Record<string, unknown>;
  bad.topGaps = [];
  const res = validateRcl(JSON.stringify(bad));
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'SCHEMA_VALIDATION_FAILED');
});

Deno.test('FEAT-06: a missing recruiterVerdict → SCHEMA_VALIDATION_FAILED (the product headline is never fabricated)', () => {
  const bad = mergedEliteOutput() as unknown as Record<string, unknown>;
  delete bad.recruiterVerdict;
  const res = validateRcl(JSON.stringify(bad));
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'SCHEMA_VALIDATION_FAILED');
});

Deno.test('FEAT-06: a half-generated strategicAdvice (present but missing summary) → SCHEMA_VALIDATION_FAILED', () => {
  const bad = mergedEliteOutput() as unknown as Record<string, unknown>;
  bad.strategicAdvice = { applyNow: true, biggestScoreMover: 'Add GraphQL.' }; // summary omitted
  const res = validateRcl(JSON.stringify(bad));
  assertEquals(res.ok, false);
  assert(!res.ok && res.code === 'SCHEMA_VALIDATION_FAILED');
});

// ── Static: the seam under test IS the seam the handler threads (anti-strawman) ──

Deno.test('FEAT-06: recruiting-lens/index.ts threads recruitingLensOutputSchema into the runAnalysisLifecycle validation seam', () => {
  const rawPath = new URL('../index.ts', import.meta.url).pathname;
  const path = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  const src = Deno.readTextFileSync(path);
  assert(src.includes('schema: recruitingLensOutputSchema'), 'the executor must be given the RCL schema');
  assert(src.includes("import { recruitingLensOutputSchema } from './schema.ts'"), 'from the RCL schema module');
  assert(src.includes('runAnalysisLifecycle'), 'the executor owns the validating_output step');

  const exec = new URL('../../_shared/analysis-lifecycle.ts', import.meta.url).pathname;
  const execPath = exec.startsWith('/') && exec[2] === ':' ? exec.slice(1) : exec;
  const execSrc = Deno.readTextFileSync(execPath);
  assert(
    execSrc.includes('validateModelOutput(raw, params.schema, params.validationOpts)'),
    'the executor validates via validateModelOutput — the seam this file drives',
  );
});

// ── S-10 / S-11 — RCL provider faults route into the shared retryable partition ──

Deno.test('FEAT-06: a 408 provider timeout on the RCL path classifies as MODEL_TIMEOUT / retryable (S-10)', () => {
  // MERIT_TEST_FORCE_REFUNDABLE_ERROR (staging-gated) raises a status-bearing
  // MeritRefundable — the same shape RCL's own throws carry (index.ts:614/620/660).
  const c = classifyFailure(new MeritRefundable(408, 'forced provider timeout'));
  assertEquals(c.retryable, true);
  assertEquals(c.code, 'MODEL_TIMEOUT');
});

Deno.test('FEAT-06: a 429 provider rate-limit on the RCL path classifies as MODEL_RATE_LIMITED / retryable (S-11)', () => {
  const c = classifyFailure(new MeritRefundable(429, 'forced rate limit'));
  assertEquals(c.retryable, true);
  assertEquals(c.code, 'MODEL_RATE_LIMITED');
});

Deno.test('FEAT-06: the RCL all-overloaded 529 throw classifies as retryable (the Merit is returned, not burned)', () => {
  const c = classifyFailure(new MeritRefundable(529, 'All 3 calls overloaded'));
  assertEquals(c.retryable, true);
});

Deno.test('FEAT-06: a VALIDATION failure is PERMANENT — never auto-retried into a second charge (LIFE-06)', () => {
  const c = classifyFailure({ code: 'SCHEMA_VALIDATION_FAILED', message: 'bad shape' });
  assertEquals(c.retryable, false);
  assertEquals(c.code, 'SCHEMA_VALIDATION_FAILED');
});

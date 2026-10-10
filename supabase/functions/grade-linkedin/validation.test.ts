import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  injectLinkedInRawScore,
  linkedInSemanticCheck,
  validateLinkedInModelResponse,
} from './validation.ts';
import {
  LINKEDIN_SECTIONS,
  LINKEDIN_SCORE_BANDS,
  linkedInGradeSchema,
  normalizeFromSections,
  scoreBand,
} from './schema.ts';

// ════════════════════════════════════════════════════════════════════════════
// 4-section direct-100-point scoring CORE (Phase 08.3-01)
//
// The evidence-anchored model emits Headline, About, Experience, and Search
// Alignment, Skills & Credentials. The server computes the total as the plain sum
// of applicable section scores; a non-applicable section contributes zero without
// rescaling, while an applicable-but-absent section contributes its honest low score.
// the bounds-only clamp lives in the zod schema `.transform`; semanticCheck
// enforces rawScore === normalizeFromSections(sections).
//
// 04-GAP-01: the legacy 4-section `validateLinkedInGrade` / `clampLinkedInSectionScores`
// were RETIRED (every runtime path now converges onto `validateLinkedInModelResponse`
// → linkedInGradeSchema + linkedInSemanticCheck). Their tests are removed with them;
// the runtime-path convergence is proven in __tests__/runtime-validation-convergence.test.ts.
// ════════════════════════════════════════════════════════════════════════════

function makeTopFix(priority: number) {
  return {
    title: `Fix ${priority}`,
    currentText: '(missing)',
    suggestedFix: `Paste-ready LinkedIn text ${priority}`,
    whyItWorks: 'Boosts recruiter visibility',
    pointsGain: '+3-5',
    priority,
  };
}

interface V2Section {
  name: string;
  applicable: boolean;
  maxScore: number;
  score: number;
  evidence: string;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
}

/** Build the 4 sections at full max + applicable, with per-name overrides. */
function sections(overrides: Record<string, Partial<V2Section>> = {}): V2Section[] {
  return LINKEDIN_SECTIONS.map((sec) => ({
    name: sec.name,
    applicable: true,
    maxScore: sec.baseMax,
    score: sec.baseMax,
    evidence: `Evidence cited for ${sec.name}`,
    strengths: ['a concrete strength'],
    weaknesses: ['a concrete weakness'],
    improvements: ['a concrete improvement'],
    ...overrides[sec.name],
  }));
}

/** Scale every section score to a fraction of its max (band fixtures). */
function bandSections(fraction: number): V2Section[] {
  return LINKEDIN_SECTIONS.map((sec) => ({
    name: sec.name,
    applicable: true,
    maxScore: sec.baseMax,
    score: Math.round(sec.baseMax * fraction),
    evidence: 'e',
    strengths: ['s'],
    weaknesses: ['w'],
    improvements: ['i'],
  }));
}

function makeGrade(secs: V2Section[], rawScoreOverride?: number) {
  return {
    rawScore: rawScoreOverride ?? normalizeFromSections(secs),
    scoreJustification: 'Overall assessment of this profile in 2-3 sentences.',
    nextBestAction: { action: 'Rewrite the headline', reason: 'Searchability', expectedImpact: '+5' },
    sectionBreakdown: secs,
    topFixes: [makeTopFix(1), makeTopFix(2), makeTopFix(3), makeTopFix(4)],
    keyStrengths: ['Quantified experience bullets'],
  };
}

// ── normalizeFromSections math ──────────────────────────────────────────────

Deno.test('normalize: all 4 applicable at full max → 100', () => {
  assertEquals(normalizeFromSections(sections()), 100);
});

Deno.test('normalize: half of every max → 50', () => {
  const half = sections();
  for (const s of half) s.score = s.maxScore / 2;
  assertEquals(normalizeFromSections(half), 50);
});

Deno.test('direct sum: rounds the applicable score sum to an integer', () => {
  assertEquals(normalizeFromSections([
    { applicable: true, maxScore: 45, score: 20.4 },
    { applicable: true, maxScore: 15, score: 19.1 },
  ]), 40);
});

Deno.test('direct sum: no applicable sections → 0', () => {
  assertEquals(normalizeFromSections([{ applicable: false, maxScore: 10, score: 5 }]), 0);
});

// ── D-17: non-applicable contributes zero without rescaling ───────────

Deno.test('D-17: an inapplicable section contributes zero and does not rescale', () => {
  const strong = sections();
  for (const s of strong) s.score = Math.round(s.maxScore * 0.8);
  const combinedName = 'Search Alignment, Skills & Credentials';
  const excluded = strong.map((s) =>
    s.name === combinedName ? { ...s, applicable: false, score: s.maxScore } : s
  );
  const includedZero = strong.map((s) =>
    s.name === combinedName ? { ...s, applicable: true, score: 0 } : s
  );
  assertEquals(normalizeFromSections(excluded), normalizeFromSections(includedZero));
});

// ── D-04: legitimately absent (applicable, honest low, stays in denominator) ──

Deno.test('D-04: an applicable-but-absent About (0/15) scores below About 9/15', () => {
  const base = sections();
  for (const s of base) s.score = Math.round(s.maxScore * 0.7);
  const about0 = base.map((s) => (s.name === 'About' ? { ...s, applicable: true, score: 0 } : s));
  const about9 = base.map((s) => (s.name === 'About' ? { ...s, applicable: true, score: 9 } : s));
  // The honest low score is real signal in the direct sum.
  assert(normalizeFromSections(about0) < normalizeFromSections(about9));
});

// ── Bounds-only clamp (schema .transform) ────────────────────────────────────

Deno.test('clamp(schema): over-max section score clamps to its max on parse; in-range untouched', () => {
  const grade = makeGrade(sections({ Headline: { score: 20 } }), 100);
  const parsed = linkedInGradeSchema.parse(grade);
  const headline = parsed.sectionBreakdown.find((s) => s.name === 'Headline');
  const about = parsed.sectionBreakdown.find((s) => s.name === 'About');
  assertEquals(headline?.score, 15); // 20 → clamped to max 15
  assertEquals(about?.score, 15); // in-range full max left untouched
});

Deno.test('clamp + semanticCheck: rawScore matching the CLAMPED normalization passes', () => {
  // Headline 20 clamps to 15 → every section at full max → direct sum 100.
  const grade = makeGrade(sections({ Headline: { score: 20 } }), 100);
  const parsed = linkedInGradeSchema.parse(grade);
  assertEquals(linkedInSemanticCheck(parsed).ok, true);
});

// ── semanticCheck integrity (no silent overwrite) ────────────────────────────

Deno.test('semanticCheck: a rawScore that does not equal normalizeFromSections is rejected', () => {
  const secs = sections();
  for (const s of secs) s.score = Math.round(s.maxScore * 0.7);
  const grade = makeGrade(secs, 99); // deliberately wrong headline number
  const parsed = linkedInGradeSchema.parse(grade);
  const res = linkedInSemanticCheck(parsed);
  assertEquals(res.ok, false);
  assert(!res.ok && res.detail.length > 0);
});

Deno.test('semanticCheck: an honest math-from-sections rawScore passes', () => {
  const secs = sections();
  for (const s of secs) s.score = Math.round(s.maxScore * 0.7);
  const parsed = linkedInGradeSchema.parse(makeGrade(secs));
  assertEquals(linkedInSemanticCheck(parsed).ok, true);
});

// ── Strict shape (no default-coercion masking — Pitfall 9) ───────────────────

Deno.test('schema: fewer than 4 sections fails to parse', () => {
  const grade = makeGrade(sections().slice(0, 3));
  assertEquals(linkedInGradeSchema.safeParse(grade).success, false);
});

Deno.test('schema: a section missing a required per-section field fails to parse', () => {
  for (const field of ['evidence', 'strengths', 'weaknesses', 'improvements'] as const) {
    const secs = sections();
    delete (secs[0] as Record<string, unknown>)[field];
    const grade = makeGrade(secs);
    assertEquals(
      linkedInGradeSchema.safeParse(grade).success,
      false,
      `missing ${field} must fail parse`,
    );
  }
});

Deno.test('schema: a missing canonical section name fails to parse (no default section)', () => {
  const secs = sections();
  secs[0].name = 'Something Else';
  const grade = makeGrade(secs);
  assertEquals(linkedInGradeSchema.safeParse(grade).success, false);
});

// ── CR-01: maxScore is catalogue-pinned (server-owned ceiling) ────────────────

Deno.test('CR-01: an inflated maxScore fails to parse (catalogue-pinned)', () => {
  // Headline declares 45 instead of 15 — must be a hard parse failure, never an
  // accepted alternate ceiling that inflates the total.
  const grade = makeGrade(sections({ Headline: { maxScore: 45, score: 40 } }));
  assertEquals(linkedInGradeSchema.safeParse(grade).success, false);
});

Deno.test('CR-01: a negative maxScore fails to parse', () => {
  const grade = makeGrade(sections({ Headline: { maxScore: -5, score: 3 } }));
  assertEquals(linkedInGradeSchema.safeParse(grade).success, false);
});

Deno.test('CR-01: inject clamps against the catalogue max, not the model-declared maxScore', () => {
  // Model inflates Headline maxScore to 45 with score 40: the injected total
  // must count Headline at most at its catalogue max of 15.
  const parsed: Record<string, unknown> = {
    sectionBreakdown: sections({ Headline: { maxScore: 45, score: 40 } }),
  };
  injectLinkedInRawScore(parsed);
  assertEquals(parsed.rawScore, 100); // 15(clamped) + 15 + 45 + 25
});

Deno.test('CR-01: a negative maxScore cannot produce a negative score or total', () => {
  const secs = sections({ Headline: { maxScore: -5, score: 3 } });
  const parsed: Record<string, unknown> = { sectionBreakdown: secs };
  injectLinkedInRawScore(parsed);
  for (const s of secs) assert(s.score >= 0, `section ${s.name} score went negative: ${s.score}`);
  assert((parsed.rawScore as number) >= 0, `injected total went negative: ${parsed.rawScore}`);
});

Deno.test('CR-01 end-to-end: validateLinkedInModelResponse REJECTS an off-catalogue maxScore (retry path, no corrupted persist)', () => {
  const grade = makeGrade(sections({ Headline: { maxScore: 45, score: 40 } }));
  const res = validateLinkedInModelResponse(JSON.stringify(grade));
  assertEquals(res.ok, false);
});

Deno.test('CR-01 end-to-end: catalogue-conformant maxScores still validate', () => {
  const secs = sections();
  for (const s of secs) s.score = Math.round(s.maxScore * 0.7);
  const res = validateLinkedInModelResponse(JSON.stringify(makeGrade(secs)));
  assert(res.ok, `expected success, got ${res.ok ? '' : JSON.stringify(res)}`);
});

// ── WR-01: per-section scores are integers (spec: "Every score must be an integer") ──

Deno.test('WR-01: a fractional section score is rounded to an integer on parse', () => {
  const grade = makeGrade(sections({ About: { score: 12.5 } }));
  const parsed = linkedInGradeSchema.parse(grade);
  const about = parsed.sectionBreakdown.find((s) => s.name === 'About');
  assertEquals(about?.score, 13); // rounded, no fractional score persisted
});

Deno.test('WR-01 end-to-end: fractional scores round identically in inject and schema (semanticCheck holds)', () => {
  const grade = makeGrade(sections({ About: { score: 12.5 }, Headline: { score: 7.4 } }));
  const res = validateLinkedInModelResponse(JSON.stringify(grade));
  assert(res.ok, `expected success, got ${res.ok ? '' : JSON.stringify(res)}`);
  assertEquals(res.value.rawScore, 13 + 7 + 45 + 25);
  for (const s of res.value.sectionBreakdown) {
    assert(Number.isInteger(s.score), `section ${s.name} score not an integer: ${s.score}`);
  }
});

// ── WR-02: required section ORDER is enforced positionally ───────────────────

Deno.test('WR-02: sections out of catalogue order fail to parse', () => {
  const secs = sections();
  [secs[0], secs[1]] = [secs[1], secs[0]]; // About before Headline — same set, wrong order
  assertEquals(linkedInGradeSchema.safeParse(makeGrade(secs)).success, false);
});

Deno.test('WR-02: a duplicated section name fails to parse (positional check)', () => {
  const secs = sections();
  secs[1] = { ...secs[0] }; // Headline twice, About missing
  assertEquals(linkedInGradeSchema.safeParse(makeGrade(secs)).success, false);
});

Deno.test('WR-02: sections in exact catalogue order parse', () => {
  assertEquals(linkedInGradeSchema.safeParse(makeGrade(sections())).success, true);
});

// ── VER-03: four-band distribution proof (deterministic, no LLM) ─────────────

Deno.test('VER-03: four band fixtures land in four DISTINCT bands, none in 48-58, gaps ≥ 10', () => {
  const totals = [0.35, 0.63, 0.78, 0.92].map((f) => normalizeFromSections(bandSections(f)));
  const bands = totals.map(scoreBand);

  assertEquals(new Set(bands).size, 4, 'all four fixtures must land in distinct bands');
  assertEquals(bands, ['weak', 'average', 'strong', 'exceptional']);

  for (const t of totals) {
    assert(t < 48 || t > 58, `total ${t} fell inside the ~52 clustering window (48-58)`);
  }

  const sorted = [...totals].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    assert(sorted[i] - sorted[i - 1] >= 10, `band gap ${sorted[i - 1]}→${sorted[i]} below 10`);
  }
});

// ── Score bands ──────────────────────────────────────────────────────────────

Deno.test('scoreBand: weak <50 / average 50-69 / strong 70-84 / exceptional 85-100', () => {
  assertEquals(scoreBand(0), 'weak');
  assertEquals(scoreBand(49), 'weak');
  assertEquals(scoreBand(50), 'average');
  assertEquals(scoreBand(69), 'average');
  assertEquals(scoreBand(70), 'strong');
  assertEquals(scoreBand(84), 'strong');
  assertEquals(scoreBand(85), 'exceptional');
  assertEquals(scoreBand(100), 'exceptional');
  assertEquals(LINKEDIN_SCORE_BANDS.length, 4);
});

Deno.test('LINKEDIN_SECTIONS: 4 fixed sections whose base maxes sum to 100', () => {
  assertEquals(LINKEDIN_SECTIONS.length, 4);
  // 15 + 15 + 45 + 25 = 100; the total requires no normalization.
  assertEquals(LINKEDIN_SECTIONS.reduce((sum, s) => sum + s.baseMax, 0), 100);
});

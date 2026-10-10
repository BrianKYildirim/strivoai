/**
 * Phase 04 · 04-06 · VER-03 — deterministic four-band normalization distribution proof.
 *
 * The v4.0 LinkedIn ~52 clustering was a MODEL behavior (temperature 0.3 + an
 * unanchored central-tendency rubric). The 04-02/04-03 redesign moved the headline
 * TOTAL off the model entirely: the server computes it mathematically from the
 * per-section scores (`normalizeFromSections`) and maps it onto the recalibrated
 * D-03 bands (`scoreBand` / `LINKEDIN_SCORE_BANDS`). This test is the OFFLINE half
 * of VER-03: it proves the MATH spreads four qualitatively-distinct profiles into
 * four DISTINCT bands with a real inter-band gap and no ~52 pileup — no LLM, no DB,
 * fully deterministic. The LLM-behavioral half (does the model discriminate?) is
 * the NON-blocking promptfoo preview eval (test:adversarial:linkedin-distribution).
 *
 * This complements the uniform-fraction VER-03 proof in validation.test.ts with
 * REALISTIC per-section score profiles (uneven across sections, as a real grade is)
 * so the proof does not depend on every section moving in lockstep.
 *
 * Approach: pure functions from schema.ts (04-02). std@0.224.0 to match the
 * lifecycle guard neighbors (idempotency-key.test.ts, refund-boundary.test.ts).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  LINKEDIN_SCORE_BANDS,
  LINKEDIN_SECTIONS,
  type NormalizableSection,
  normalizeFromSections,
  scoreBand,
} from '../schema.ts';

// The ~52 clustering window the redesign must never fall back into.
const CLUSTER_LO = 48;
const CLUSTER_HI = 58;
// Minimum spread between any two adjacent band fixtures (spread proof, not a tie).
const MIN_INTER_BAND_GAP = 10;

/**
 * Build the 4 canonical sections (applicable, full max) from an explicit
 * per-section EARNED-score map. Any section not named in `scores` earns 0. This
 * yields a realistic, uneven grade rather than a uniform fraction of every max.
 */
function profile(
  scores: Record<string, number>,
  applicableOverrides: Record<string, boolean> = {},
): NormalizableSection[] {
  return LINKEDIN_SECTIONS.map((sec) => ({
    applicable: applicableOverrides[sec.name] ?? true,
    maxScore: sec.baseMax,
    score: scores[sec.name] ?? 0,
  }));
}

// Four qualitatively-distinct real-shaped profiles (uneven per section), scored
// directly over the 100-point catalogue.
const WEAK = profile({
  Headline: 4, About: 4, Experience: 14, 'Search Alignment, Skills & Credentials': 8,
}); // plain sum 30 (weak)

const AVERAGE = profile({
  Headline: 9, About: 9, Experience: 29, 'Search Alignment, Skills & Credentials': 15,
}); // plain sum 62 (average)

const STRONG = profile({
  Headline: 12, About: 11, Experience: 36, 'Search Alignment, Skills & Credentials': 18,
}); // plain sum 77 (strong)

const EXCEPTIONAL = profile({
  Headline: 14, About: 14, Experience: 42, 'Search Alignment, Skills & Credentials': 23,
}); // plain sum 93 (exceptional)

Deno.test('VER-03: four realistic fixtures land in four DISTINCT recalibrated bands', () => {
  const bands = [WEAK, AVERAGE, STRONG, EXCEPTIONAL].map((p) => scoreBand(normalizeFromSections(p)));
  assertEquals(new Set(bands).size, 4, `expected four distinct bands, got ${JSON.stringify(bands)}`);
  assertEquals(bands, ['weak', 'average', 'strong', 'exceptional']);
});

Deno.test('VER-03: no fixture totals fall inside the ~52 clustering window (48-58)', () => {
  const totals = [WEAK, AVERAGE, STRONG, EXCEPTIONAL].map(normalizeFromSections);
  for (const t of totals) {
    assert(
      t < CLUSTER_LO || t > CLUSTER_HI,
      `total ${t} fell inside the ~52 clustering window (${CLUSTER_LO}-${CLUSTER_HI})`,
    );
  }
});

Deno.test('VER-03: adjacent band fixtures are separated by a minimum inter-band gap', () => {
  const sorted = [WEAK, AVERAGE, STRONG, EXCEPTIONAL].map(normalizeFromSections).sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    assert(
      sorted[i] - sorted[i - 1] >= MIN_INTER_BAND_GAP,
      `band gap ${sorted[i - 1]}→${sorted[i]} is below the ${MIN_INTER_BAND_GAP}-point minimum`,
    );
  }
});

Deno.test('VER-03: each fixture total lands inside its declared band cutoffs', () => {
  const cases: Array<[NormalizableSection[], typeof LINKEDIN_SCORE_BANDS[number]['band']]> = [
    [WEAK, 'weak'],
    [AVERAGE, 'average'],
    [STRONG, 'strong'],
    [EXCEPTIONAL, 'exceptional'],
  ];
  for (const [p, band] of cases) {
    const total = normalizeFromSections(p);
    const def = LINKEDIN_SCORE_BANDS.find((b) => b.band === band)!;
    assert(total >= def.min && total <= def.max, `${band} total ${total} outside [${def.min}, ${def.max}]`);
  }
});

// ── D-17 direct-sum applicability: excluded scores contribute zero ──

Deno.test('VER-03/D-17: excluding a non-applicable section contributes zero without rescaling', () => {
  const combinedName = 'Search Alignment, Skills & Credentials';
  const strongProfile = {
    Experience: 43, Headline: 14, About: 13,
  };
  const excluded = profile({ ...strongProfile, [combinedName]: 25 }, { [combinedName]: false });
  const included = profile({ ...strongProfile, [combinedName]: 25 }, { [combinedName]: true });

  const excludedTotal = normalizeFromSections(excluded);
  const includedTotal = normalizeFromSections(included);

  assertEquals(excludedTotal, 70, 'excluded section must contribute zero');
  assertEquals(includedTotal, 95, 'applicable section must contribute its earned score');
  assertEquals(scoreBand(excludedTotal), 'strong');
});

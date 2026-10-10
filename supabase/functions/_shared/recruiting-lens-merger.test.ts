import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  applyRecruitingLensTierShape,
  type RecruitingLensOutput,
} from "./recruiting-lens-merger.ts";

// -- Test fixture -------------------------------------------------------------

function makeFullOutput(): RecruitingLensOutput {
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
      { title: 'Gap 4', severity: 'medium', whyItMatters: 'Matters 4', howItShowsUp: 'Shows 4', fixPriority: 'long-term' },
      { title: 'Gap 5', severity: 'low', whyItMatters: 'Matters 5', howItShowsUp: 'Shows 5', fixPriority: 'long-term' },
    ],
    roadmap: [
      { stage: 'immediate', action: 'Fix resume', why: 'Better match', expectedImpact: '+10' },
      { stage: 'short-term', action: 'Learn GraphQL', why: 'Required skill', expectedImpact: '+15' },
      { stage: 'medium-term', action: 'Get cert', why: 'Credibility', expectedImpact: '+5' },
      { stage: 'long-term', action: 'Lead projects', why: 'Seniority', expectedImpact: '+8' },
    ],
    resumeEdits: [
      { original: 'Old 1', rewritten: 'New 1', qualityGates: { jdVocab: true, achievementTransform: true, signalDensity: true, jdTargeting: true, pasteReady: true } },
      { original: 'Old 2', rewritten: 'New 2', qualityGates: { jdVocab: true, achievementTransform: true, signalDensity: true, jdTargeting: true, pasteReady: true } },
      { original: 'Old 3', rewritten: 'New 3', qualityGates: { jdVocab: true, achievementTransform: true, signalDensity: true, jdTargeting: true, pasteReady: true } },
      { original: 'Old 4', rewritten: 'New 4', qualityGates: { jdVocab: true, achievementTransform: true, signalDensity: true, jdTargeting: true, pasteReady: true } },
      { original: 'Old 5', rewritten: 'New 5', qualityGates: { jdVocab: true, achievementTransform: true, signalDensity: true, jdTargeting: true, pasteReady: true } },
    ],
    linkedinImprovements: [{ area: 'headline', suggestion: 'Update headline.' }],
    strategicAdvice: { applyNow: true, summary: 'Apply now.', biggestScoreMover: 'Add GraphQL.' },
    keywords: { matched: ['react'], missing: ['graphql'] },
    quickFixes: ['Fix typo', 'Add keywords'],
    _meta: { totalGaps: 5, totalEdits: 5 },
  };
}

// -- Elite: no-op -------------------------------------------------------------

Deno.test("applyRecruitingLensTierShape elite: no-op — all fields preserved", () => {
  const merged = makeFullOutput();
  const keysBefore = Object.keys(merged).sort();
  applyRecruitingLensTierShape(merged, 'elite');
  assertEquals(Object.keys(merged).sort(), keysBefore);
  // Sub-scores still have all 5 entries with rationale
  assertEquals(Object.keys(merged.subScores).length, 5);
  assertEquals(typeof merged.subScores.experienceAlignment.rationale, 'string');
  // topGaps still have 5 entries with howItShowsUp
  assertEquals(merged.topGaps.length, 5);
  assertEquals(typeof merged.topGaps[0].howItShowsUp, 'string');
  // resumeEdits still have 5 entries
  assertEquals(merged.resumeEdits.length, 5);
});

// -- Pro: top-level field stripping -------------------------------------------

Deno.test("applyRecruitingLensTierShape pro: strips Elite-only top-level fields", () => {
  const merged = makeFullOutput();
  applyRecruitingLensTierShape(merged, 'pro');

  // Kept
  assertEquals(merged.preAnalysis !== undefined, true);
  assertEquals(merged.overallMatch !== undefined, true);
  assertEquals(merged.subScores !== undefined, true);
  assertEquals(merged.recruiterVerdict !== undefined, true);
  assertEquals(merged.topGaps !== undefined, true);
  assertEquals(merged.resumeEdits !== undefined, true);
  assertEquals((merged as Record<string, unknown>)._meta !== undefined, true);

  // Stripped (per RCL-03)
  assertEquals((merged as Record<string, unknown>).scoreRationale, undefined);
  assertEquals((merged as Record<string, unknown>).roadmap, undefined);
  assertEquals((merged as Record<string, unknown>).strategicAdvice, undefined);
  assertEquals((merged as Record<string, unknown>).keywords, undefined);
  assertEquals((merged as Record<string, unknown>).quickFixes, undefined);
  assertEquals((merged as Record<string, unknown>).linkedinImprovements, undefined);
});

// -- Pro: sub-score partial stripping -----------------------------------------

Deno.test("applyRecruitingLensTierShape pro: keeps experienceAlignment + skillAlignment score-only", () => {
  const merged = makeFullOutput();
  applyRecruitingLensTierShape(merged, 'pro');

  // experienceAlignment: score kept, rationale stripped
  assertEquals(merged.subScores.experienceAlignment.score, 70);
  assertEquals((merged.subScores.experienceAlignment as Record<string, unknown>).rationale, undefined);

  // skillAlignment: score kept, rationale stripped
  assertEquals(merged.subScores.skillAlignment.score, 65);
  assertEquals((merged.subScores.skillAlignment as Record<string, unknown>).rationale, undefined);

  // Other 3 sub-scores fully removed
  assertEquals((merged.subScores as Record<string, unknown>).impactStrength, undefined);
  assertEquals((merged.subScores as Record<string, unknown>).keywordAndLanguageMatch, undefined);
  assertEquals((merged.subScores as Record<string, unknown>).credibilityAndSeniorityFit, undefined);
});

// -- Pro: topGaps capping and field stripping ----------------------------------

Deno.test("applyRecruitingLensTierShape pro: caps topGaps to 2 and strips howItShowsUp + fixPriority", () => {
  const merged = makeFullOutput();
  applyRecruitingLensTierShape(merged, 'pro');

  assertEquals(merged.topGaps.length, 2);
  assertEquals(merged.topGaps[0].title, 'Gap 1');
  assertEquals(merged.topGaps[1].title, 'Gap 2');

  // howItShowsUp and fixPriority stripped from shown gaps
  assertEquals((merged.topGaps[0] as Record<string, unknown>).howItShowsUp, undefined);
  assertEquals((merged.topGaps[0] as Record<string, unknown>).fixPriority, undefined);
  assertEquals((merged.topGaps[1] as Record<string, unknown>).howItShowsUp, undefined);
  assertEquals((merged.topGaps[1] as Record<string, unknown>).fixPriority, undefined);

  // whyItMatters preserved
  assertEquals(merged.topGaps[0].whyItMatters, 'Matters 1');
  assertEquals(merged.topGaps[1].whyItMatters, 'Matters 2');
});

// -- Pro: resumeEdits capping -------------------------------------------------

Deno.test("applyRecruitingLensTierShape pro: caps resumeEdits to 2", () => {
  const merged = makeFullOutput();
  applyRecruitingLensTierShape(merged, 'pro');

  assertEquals(merged.resumeEdits.length, 2);
  assertEquals(merged.resumeEdits[0].rewritten, 'New 1');
  assertEquals(merged.resumeEdits[1].rewritten, 'New 2');
});

// -- Pro: _meta preserved -----------------------------------------------------

Deno.test("applyRecruitingLensTierShape pro: _meta preserved with original counts", () => {
  const merged = makeFullOutput();
  applyRecruitingLensTierShape(merged, 'pro');

  assertEquals((merged as Record<string, unknown>)._meta !== undefined, true);
  const meta = (merged as Record<string, unknown>)._meta as { totalGaps: number; totalEdits: number };
  assertEquals(meta.totalGaps, 5);
  assertEquals(meta.totalEdits, 5);
});

// -- Pro: handles missing optional fields gracefully --------------------------

Deno.test("applyRecruitingLensTierShape pro: handles missing topGaps/resumeEdits gracefully", () => {
  const merged = makeFullOutput();
  delete (merged as Record<string, unknown>).topGaps;
  delete (merged as Record<string, unknown>).resumeEdits;
  // Should not throw
  applyRecruitingLensTierShape(merged, 'pro');
  assertEquals((merged as Record<string, unknown>).topGaps, undefined);
  assertEquals((merged as Record<string, unknown>).resumeEdits, undefined);
});

// -- Pro: handles missing subScores gracefully --------------------------------

Deno.test("applyRecruitingLensTierShape pro: handles missing subScores gracefully", () => {
  const merged = makeFullOutput();
  delete (merged as Record<string, unknown>).subScores;
  // Should not throw
  applyRecruitingLensTierShape(merged, 'pro');
  assertEquals((merged as Record<string, unknown>).subScores, undefined);
});

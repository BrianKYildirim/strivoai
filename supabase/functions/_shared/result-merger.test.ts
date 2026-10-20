/**
 * Deno unit tests for result-merger module.
 * Run with: deno test supabase/functions/_shared/result-merger.test.ts --allow-read --allow-net
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseAndValidateCall, mergeAndValidateResults, applyTierShape } from "./result-merger.ts";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeCriterion(id: string, label: string, weight: number, score: number, feedbackFormat: 'object' | 'array' = 'object') {
  const feedback = feedbackFormat === 'object'
    ? { observation: `Observed issue in ${id}`, impact: `Impact for ${id}`, fix: `Fix for ${id}` }
    : [`Observed issue in ${id}`, `Impact for ${id}`, `Fix for ${id}`];
  return { id, label, weight, score, feedback };
}

function makeValidCriteria1(overrides?: { scores?: number[]; feedbackFormat?: 'object' | 'array' }): string {
  const scores = overrides?.scores || [75, 80, 70, 85, 65, 90];
  const fmt = overrides?.feedbackFormat || 'object';
  return JSON.stringify({
    criterionFeedback: [
      makeCriterion('c1_visual_clarity', 'Visual Clarity & Layout', 6, scores[0], fmt),
      makeCriterion('c2_formatting_consistency', 'Formatting Consistency', 4, scores[1], fmt),
      makeCriterion('c3_ats_parseability', 'ATS Parseability', 8, scores[2], fmt),
      makeCriterion('c4_professional_tone', 'Professional Tone & Grammar', 5, scores[3], fmt),
      makeCriterion('c5_conciseness', 'Conciseness & Value Density', 7, scores[4], fmt),
      makeCriterion('c6_achievement_orientation', 'Achievement Orientation & Quantified Impact', 20, scores[5], fmt),
    ],
  });
}

function makeValidCriteria2(overrides?: { scores?: number[] }): string {
  const scores = overrides?.scores || [72, 68, 77, 83, 71];
  return JSON.stringify({
    criterionFeedback: [
      makeCriterion('c7_relevance_targeting', 'Relevance & Role Alignment', 10, scores[0]),
      makeCriterion('c8_skills_presentation', 'Skills Section Quality', 10, scores[1]),
      makeCriterion('c9_projects_portfolio', 'Projects & Extracurriculars', 7, scores[2]),
      makeCriterion('c10_education_credentials', 'Education Strength', 5, scores[3]),
      makeCriterion('c11_career_narrative', 'Career Narrative, Differentiation & Keywords', 18, scores[4]),
    ],
  });
}

function makeValidSummary(isElite: boolean, overrides?: { omitFields?: string[] }): string {
  const obj: Record<string, unknown> = {
    executiveSummary: {
      keyStrengths: ['Strong quantified achievements in SWE role at Google', 'Clear skills section with relevant technologies'],
      keyGaps: ['Missing ATS keywords for target role'],
      highImpactFix: 'Add metrics to the Deloitte internship bullets',
    },
    strengths: ['Quantified bullets in Google role', 'Clean formatting throughout'],
    priorityImprovements: ['Add action verbs to project descriptions', 'Include industry keywords'],
    industryGuess: 'Technology',
    suggestedTargetRoles: ['Software Engineer', 'Full Stack Developer'],
    recommendedKeywords: ['microservices', 'agile', 'CI/CD'],
  };

  // rewriteSuggestions now belong to the dedicated 'rewrites' call (260608-p5k).

  if (isElite) {
    obj.eliteInsights = {
      interviewLikelihood: 72,
      interviewLikelihoodExplanation: 'Strong technical background with quantified impact',
      competitiveRanking: 'Top 25%',
      recruiterFirstImpressions: {
        atThreeSeconds: 'Clean layout, Google jumps out',
        atSevenSeconds: 'Skills section is comprehensive',
        whatTheyMiss: 'Projects section buried below fold',
      },
      hiddenWeaknesses: ['Date gap between roles not explained', 'No leadership mention'],
      powerPhrases: ['Architected scalable microservices', 'Drove 40% efficiency improvement'],
      detailedATSGapAnalysis: [
        { keyword: 'Kubernetes', priority: 'critical', suggestedPlacement: 'Skills section' },
      ],
    };
  }

  if (overrides?.omitFields) {
    for (const field of overrides.omitFields) {
      delete obj[field];
    }
  }

  return JSON.stringify(obj);
}

function makeValidRewrites(overrides?: { partial?: boolean }): string {
  const full = [
    { criterionId: 'c6', title: 'Rewrite 1', originalText: 'Managed team', issues: ['No metrics'], improvedText: 'Led 8-person team to deliver $2M project', impact: 'Stronger C6', potentialScoreIncrease: 5 },
    { criterionId: 'c11', title: 'Rewrite 2', originalText: 'Did work', issues: ['Vague'], improvedText: 'Architected microservices platform', impact: 'Better narrative', potentialScoreIncrease: 3 },
    { criterionId: 'c7', title: 'Rewrite 3', originalText: 'Helped out', issues: ['Passive'], improvedText: 'Spearheaded initiative', impact: 'Role alignment', potentialScoreIncrease: 4 },
    { criterionId: 'c5', title: 'Rewrite 4', originalText: 'Was responsible for', issues: ['Filler'], improvedText: 'Drove quarterly roadmap', impact: 'Conciseness', potentialScoreIncrease: 4 },
    { criterionId: 'c8', title: 'Rewrite 5', originalText: 'Used tools', issues: ['Generic'], improvedText: 'Leveraged React, TypeScript, and AWS', impact: 'Skills alignment', potentialScoreIncrease: 3 },
  ];
  return JSON.stringify({ rewriteSuggestions: overrides?.partial ? full.slice(0, 3) : full });
}

// ---------------------------------------------------------------------------
// MERG-03: Validation tests
// ---------------------------------------------------------------------------

Deno.test("criteria-1 validation accepts 6 correct criteria", () => {
  const result = parseAndValidateCall('criteria-1', makeValidCriteria1(), false);
  assertEquals(result.ok, true);
});

Deno.test("criteria-2 validation accepts 5 correct criteria", () => {
  const result = parseAndValidateCall('criteria-2', makeValidCriteria2(), false);
  assertEquals(result.ok, true);
});

Deno.test("criteria-1 rejects wrong criterion IDs", () => {
  const wrongIds = JSON.stringify({
    criterionFeedback: [
      makeCriterion('c7_relevance_targeting', 'Wrong', 10, 70),
      makeCriterion('c2_formatting_consistency', 'OK', 4, 80),
      makeCriterion('c3_ats_parseability', 'OK', 8, 70),
      makeCriterion('c4_professional_tone', 'OK', 5, 85),
      makeCriterion('c5_conciseness', 'OK', 7, 65),
      makeCriterion('c6_achievement_orientation', 'OK', 20, 90),
    ],
  });
  const result = parseAndValidateCall('criteria-1', wrongIds, false);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.reason.includes('missing expected criterion ID'), true);
  }
});

Deno.test("criteria call rejects wrong count", () => {
  const tooFew = JSON.stringify({
    criterionFeedback: [
      makeCriterion('c1_visual_clarity', 'OK', 6, 75),
      makeCriterion('c2_formatting_consistency', 'OK', 4, 80),
      makeCriterion('c3_ats_parseability', 'OK', 8, 70),
      makeCriterion('c4_professional_tone', 'OK', 5, 85),
    ],
  });
  const result = parseAndValidateCall('criteria-1', tooFew, false);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.reason.includes('expected 6 criteria, got 4'), true);
  }
});

Deno.test("score clamping: 105 becomes 100, -5 becomes 0", () => {
  const result = parseAndValidateCall('criteria-1', makeValidCriteria1({ scores: [105, -5, 50, 75, 80, 65] }), false);
  assertEquals(result.ok, true);
  if (result.ok) {
    const criteria = (result.data as Record<string, unknown>).criterionFeedback as Array<{ score: number }>;
    assertEquals(criteria[0].score, 100);
    assertEquals(criteria[1].score, 0);
    assertEquals(criteria[2].score, 50);
  }
});

Deno.test("summary validation accepts all required fields", () => {
  const result = parseAndValidateCall('summary', makeValidSummary(false), false);
  assertEquals(result.ok, true);
});

Deno.test("summary validation rejects missing executiveSummary", () => {
  const result = parseAndValidateCall('summary', makeValidSummary(false, { omitFields: ['executiveSummary'] }), false);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.reason.includes('missing required field "executiveSummary"'), true);
  }
});

Deno.test("summary optional fields don't cause rejection", () => {
  const result = parseAndValidateCall('summary', makeValidSummary(false, { omitFields: ['industryGuess', 'suggestedTargetRoles'] }), false);
  assertEquals(result.ok, true);
});

Deno.test("summary validation classifies fenced token-limit truncation as missing fields", () => {
  const raw = '```json\n{"executiveSummary":{"keyStrengths":["Co-founder of Strivo AI with 2,500+ MAU and 94% satisfaction demonstrates real-world product impact and entrepreneurial credibility; quan';
  const result = parseAndValidateCall('summary', raw, true);

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.reason.includes('summary: missing required field "strengths"'), true);
  }
});

// ---------------------------------------------------------------------------
// MERG-03: Alias/stripping tests
// ---------------------------------------------------------------------------

Deno.test("alias normalization: criteria -> criterionFeedback", () => {
  const parsed = JSON.parse(makeValidCriteria1());
  // Rename key to alias
  const aliased = { criteria: parsed.criterionFeedback };
  const result = parseAndValidateCall('criteria-1', JSON.stringify(aliased), false);
  assertEquals(result.ok, true);
});

Deno.test("alias normalization: summary -> executiveSummary", () => {
  const parsed = JSON.parse(makeValidSummary(false));
  // Rename executiveSummary to summary alias
  const { executiveSummary, ...rest } = parsed;
  const aliased = { summary: executiveSummary, ...rest };
  const result = parseAndValidateCall('summary', JSON.stringify(aliased), false);
  assertEquals(result.ok, true);
});

Deno.test("unknown fields stripped", () => {
  const parsed = JSON.parse(makeValidCriteria1());
  parsed.hallucinated_field = 'this should be removed';
  parsed.another_fake = 42;
  const result = parseAndValidateCall('criteria-1', JSON.stringify(parsed), false);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals((result.data as Record<string, unknown>).hallucinated_field, undefined);
    assertEquals((result.data as Record<string, unknown>).another_fake, undefined);
  }
});

// ---------------------------------------------------------------------------
// MERG-01: Merge tests
// ---------------------------------------------------------------------------

Deno.test("merged output has exactly 11 criterionFeedback items", () => {
  const rawResults = {
    'criteria-1': makeValidCriteria1(),
    'criteria-2': makeValidCriteria2(),
    'summary': makeValidSummary(false),
  };
  const result = mergeAndValidateResults(rawResults, 'free');
  assertEquals(result.ok, true);
  if (result.ok) {
    const feedback = (result.data as Record<string, unknown>).criterionFeedback as unknown[];
    assertEquals(feedback.length, 11);
  }
});

Deno.test("criterionFeedback arrays concatenated not overwritten", () => {
  const rawResults = {
    'criteria-1': makeValidCriteria1(),
    'criteria-2': makeValidCriteria2(),
    'summary': makeValidSummary(false),
  };
  const result = mergeAndValidateResults(rawResults, 'free');
  assertEquals(result.ok, true);
  if (result.ok) {
    const feedback = (result.data as Record<string, unknown>).criterionFeedback as Array<{ id: string }>;
    // First 6 from criteria-1
    assertEquals(feedback[0].id, 'c1_visual_clarity');
    assertEquals(feedback[5].id, 'c6_achievement_orientation');
    // Last 5 from criteria-2
    assertEquals(feedback[6].id, 'c7_relevance_targeting');
    assertEquals(feedback[10].id, 'c11_career_narrative');
  }
});

Deno.test("summary fields present in merged output", () => {
  const rawResults = {
    'criteria-1': makeValidCriteria1(),
    'criteria-2': makeValidCriteria2(),
    'summary': makeValidSummary(false),
    'rewrites': makeValidRewrites(),
  };
  // Use 'pro' to ensure summary + rewrites fields are not stripped
  const result = mergeAndValidateResults(rawResults, 'pro');
  assertEquals(result.ok, true);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    assertEquals(data.executiveSummary !== undefined, true);
    assertEquals(data.strengths !== undefined, true);
    assertEquals(data.priorityImprovements !== undefined, true);
    // rewriteSuggestions is now folded from the dedicated 'rewrites' call
    assertEquals(Array.isArray(data.rewriteSuggestions) && (data.rewriteSuggestions as unknown[]).length > 0, true);
  }
});

Deno.test("optional fields get defaults", () => {
  const rawResults = {
    'criteria-1': makeValidCriteria1(),
    'criteria-2': makeValidCriteria2(),
    'summary': makeValidSummary(false, { omitFields: ['industryGuess', 'suggestedTargetRoles', 'recommendedKeywords'] }),
  };
  // Use 'pro' so defaults are visible (free would strip industryGuess etc.)
  const result = mergeAndValidateResults(rawResults, 'pro');
  assertEquals(result.ok, true);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    assertEquals(data.industryGuess, '');
    assertEquals(data.suggestedTargetRoles, []);
    assertEquals(data.recommendedKeywords, []);
  }
});

Deno.test("eliteInsights null for non-elite", () => {
  const rawResults = {
    'criteria-1': makeValidCriteria1(),
    'criteria-2': makeValidCriteria2(),
    'summary': makeValidSummary(false),
  };
  // Free tier strips eliteInsights entirely (undefined, not null)
  // Use 'pro' to test fillDefaults behavior (sets to null for non-elite)
  const result = mergeAndValidateResults(rawResults, 'pro');
  assertEquals(result.ok, true);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    // Pro tier: eliteInsights is stripped by applyTierShape (not in PRO_ALLOWED_FIELDS)
    assertEquals(data.eliteInsights, undefined);
  }
});

Deno.test("_mergeSource marker present", () => {
  const rawResults = {
    'criteria-1': makeValidCriteria1(),
    'criteria-2': makeValidCriteria2(),
    'summary': makeValidSummary(false),
  };
  const result = mergeAndValidateResults(rawResults, 'free');
  assertEquals(result.ok, true);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    assertEquals(data._mergeSource, 'parallel-5');
  }
});

// ---------------------------------------------------------------------------
// MERG-02: Score tests
// ---------------------------------------------------------------------------

Deno.test("overallScore set to 0 before reconcileScore", () => {
  const rawResults = {
    'criteria-1': makeValidCriteria1(),
    'criteria-2': makeValidCriteria2(),
    'summary': makeValidSummary(false),
  };
  const result = mergeAndValidateResults(rawResults, 'free');
  assertEquals(result.ok, true);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    assertEquals(data.overallScore, 0);
  }
});

// ---------------------------------------------------------------------------
// Error path tests
// ---------------------------------------------------------------------------

Deno.test("mergeAndValidateResults returns error on invalid criteria-1", () => {
  const rawResults = {
    'criteria-1': 'not valid json {{{{',
    'criteria-2': makeValidCriteria2(),
    'summary': makeValidSummary(false),
  };
  const result = mergeAndValidateResults(rawResults, 'free');
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.reason.includes('criteria-1'), true);
  }
});

Deno.test("mergeAndValidateResults returns error on missing criteria", () => {
  const tooFew = JSON.stringify({
    criterionFeedback: [
      makeCriterion('c1_visual_clarity', 'OK', 6, 75),
      makeCriterion('c2_formatting_consistency', 'OK', 4, 80),
      makeCriterion('c3_ats_parseability', 'OK', 8, 70),
    ],
  });
  const rawResults = {
    'criteria-1': tooFew,
    'criteria-2': makeValidCriteria2(),
    'summary': makeValidSummary(false),
  };
  const result = mergeAndValidateResults(rawResults, 'free');
  assertEquals(result.ok, false);
});

Deno.test("feedback format tolerance: array feedback accepted", () => {
  const result = parseAndValidateCall('criteria-1', makeValidCriteria1({ feedbackFormat: 'array' }), false);
  assertEquals(result.ok, true);
});

Deno.test("feedback format tolerance: object feedback accepted", () => {
  const result = parseAndValidateCall('criteria-1', makeValidCriteria1({ feedbackFormat: 'object' }), false);
  assertEquals(result.ok, true);
});

Deno.test("partial rewriteSuggestions accepted with log", () => {
  const rawResults = {
    'criteria-1': makeValidCriteria1(),
    'criteria-2': makeValidCriteria2(),
    'summary': makeValidSummary(false),
    'rewrites': makeValidRewrites({ partial: true }),
  };
  const result = mergeAndValidateResults(rawResults, 'free');
  assertEquals(result.ok, true);
});

// ---------------------------------------------------------------------------
// 260608-p5k: dedicated rewrites call + salvage-first fold
// ---------------------------------------------------------------------------

Deno.test("rewrites validation accepts a non-empty array", () => {
  const result = parseAndValidateCall('rewrites', makeValidRewrites(), false);
  assertEquals(result.ok, true);
});

Deno.test("rewrites validation rejects empty or non-array rewriteSuggestions", () => {
  const empty = parseAndValidateCall('rewrites', JSON.stringify({ rewriteSuggestions: [] }), false);
  assertEquals(empty.ok, false);
  const notArray = parseAndValidateCall('rewrites', JSON.stringify({ rewriteSuggestions: 'oops' }), false);
  assertEquals(notArray.ok, false);
});

Deno.test("merge salvages a failed rewrites call (defaults rewriteSuggestions to [])", () => {
  const rawResults = {
    'criteria-1': makeValidCriteria1(),
    'criteria-2': makeValidCriteria2(),
    'summary': makeValidSummary(false),
    'rewrites': JSON.stringify({ rewriteSuggestions: 'oops not an array' }),
  };
  // Non-fatal: a failed rewrites call must NOT refund the otherwise-complete run.
  const result = mergeAndValidateResults(rawResults, 'pro');
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals((result.data as Record<string, unknown>).rewriteSuggestions, []);
  }
});

Deno.test("merge still rejects a failed summary call (hard core)", () => {
  const rawResults = {
    'criteria-1': makeValidCriteria1(),
    'criteria-2': makeValidCriteria2(),
    'summary': makeValidSummary(false, { omitFields: ['executiveSummary'] }),
    'rewrites': makeValidRewrites(),
  };
  const result = mergeAndValidateResults(rawResults, 'pro');
  assertEquals(result.ok, false);
});

// ---------------------------------------------------------------------------
// applyTierShape tests (Phase 15 — RES-01, RES-02, RES-03, RES-04)
// ---------------------------------------------------------------------------

function makeFullMergedOutput(): Record<string, unknown> {
  return {
    overallScore: 72,
    _mergeSource: 'parallel-5',
    executiveSummary: {
      keyStrengths: ['Strong quantified achievements'],
      keyGaps: ['Missing keywords'],
      highImpactFix: 'Add ATS keywords',
    },
    resumeSignal: 'Experienced mid-level SWE',
    strengths: ['Good formatting', 'Strong experience section'],
    priorityImprovements: ['Add metrics', 'Fix formatting', 'Add keywords', 'Expand skills', 'Shorten summary'],
    criterionFeedback: [
      { id: 'c1_visual_clarity', label: 'Visual Clarity & Layout', weight: 6, score: 75, feedback: { observation: 'Clean layout', impact: 'Good first impression', fix: 'Add white space' } },
      { id: 'c2_formatting_consistency', label: 'Formatting Consistency', weight: 4, score: 80, feedback: { observation: 'Consistent', impact: 'Reads well', fix: 'Minor alignment' } },
      { id: 'c3_ats_parseability', label: 'ATS Parseability', weight: 8, score: 70, feedback: { observation: 'Parseable', impact: 'ATS friendly', fix: 'Remove tables' } },
      { id: 'c4_professional_tone', label: 'Professional Tone & Grammar', weight: 5, score: 85, feedback: { observation: 'Professional', impact: 'Credible', fix: 'Minor grammar' } },
      { id: 'c5_conciseness', label: 'Conciseness & Value Density', weight: 7, score: 65, feedback: { observation: 'Verbose', impact: 'Lost attention', fix: 'Cut filler' } },
      { id: 'c6_achievement_orientation', label: 'Achievement Orientation', weight: 20, score: 90, feedback: { observation: 'Strong metrics', impact: 'Compelling', fix: 'Add more' } },
      { id: 'c7_relevance_targeting', label: 'Relevance & Role Alignment', weight: 10, score: 72, feedback: { observation: 'Relevant', impact: 'Good match', fix: 'Tailor more' } },
      { id: 'c8_skills_presentation', label: 'Skills Section Quality', weight: 10, score: 68, feedback: { observation: 'Basic', impact: 'Misses ATS', fix: 'Expand skills' } },
      { id: 'c9_projects_portfolio', label: 'Projects & Extracurriculars', weight: 7, score: 77, feedback: { observation: 'Good projects', impact: 'Shows initiative', fix: 'Add outcomes' } },
      { id: 'c10_education_credentials', label: 'Education Strength', weight: 5, score: 83, feedback: { observation: 'Solid education', impact: 'Meets bar', fix: 'Add GPA if strong' } },
      { id: 'c11_career_narrative', label: 'Career Narrative', weight: 18, score: 71, feedback: { observation: 'Clear path', impact: 'Readable story', fix: 'Strengthen transitions' } },
    ],
    rewriteSuggestions: [
      { criterionId: 'c6', title: 'Rewrite 1', originalText: 'old text', issues: ['issue1'], improvedText: 'new text', impact: 'high', potentialScoreIncrease: 5 },
    ],
    industryGuess: 'Software Engineering',
    suggestedTargetRoles: ['Senior SWE', 'Staff Engineer'],
    recommendedKeywords: ['TypeScript', 'React', 'AWS'],
    eliteInsights: {
      interviewLikelihood: 72,
      interviewLikelihoodExplanation: 'Strong candidate',
      competitiveRanking: 'Top 25%',
      recruiterFirstImpressions: { atThreeSeconds: 'Clean layout', atSevenSeconds: 'Strong metrics', whatTheyMiss: 'Missing keywords' },
      hiddenWeaknesses: ['No quantified team size'],
      powerPhrases: ['Reduced latency by 40%'],
      detailedATSGapAnalysis: [{ keyword: 'Kubernetes', priority: 'high', suggestedPlacement: 'Skills section' }],
    },
  };
}

Deno.test("applyTierShape free: strips Pro/Elite-only fields", () => {
  const merged = makeFullMergedOutput();
  applyTierShape(merged, 'free');

  // RES-01: these must be present
  assertEquals(merged.overallScore !== undefined, true);
  assertEquals(merged.executiveSummary !== undefined, true);
  assertEquals(merged.strengths !== undefined, true);
  assertEquals(merged.priorityImprovements !== undefined, true);
  assertEquals(merged.criterionFeedback !== undefined, true);

  // Phase 15.2 D-01: free tier now keeps exactly 1 rewriteSuggestion
  assertEquals(Array.isArray(merged.rewriteSuggestions), true);
  assertEquals((merged.rewriteSuggestions as unknown[]).length, 1);

  // RES-02: these must be absent
  assertEquals(merged.industryGuess, undefined);
  assertEquals(merged.suggestedTargetRoles, undefined);
  assertEquals(merged.recommendedKeywords, undefined);
  assertEquals(merged.eliteInsights, undefined);
});

Deno.test("applyTierShape free: caps priorityImprovements to 1", () => {
  const merged = makeFullMergedOutput();
  applyTierShape(merged, 'free');

  const improvements = merged.priorityImprovements as string[];
  assertEquals(improvements.length, 1);
  assertEquals(improvements[0], 'Add metrics');
});

Deno.test("applyTierShape free: strips feedback from C1-C5 and C7-C11, keeps C6 full", () => {
  const merged = makeFullMergedOutput();
  applyTierShape(merged, 'free');

  const criteria = merged.criterionFeedback as Record<string, unknown>[];
  assertEquals(criteria.length, 11);

  // C1 (index 0): stripped to {id, label, weight, score} only
  assertEquals((criteria[0] as Record<string, unknown>).id, 'c1_visual_clarity');
  assertEquals((criteria[0] as Record<string, unknown>).label, 'Visual Clarity & Layout');
  assertEquals((criteria[0] as Record<string, unknown>).weight, 6);
  assertEquals((criteria[0] as Record<string, unknown>).score, 75);
  assertEquals((criteria[0] as Record<string, unknown>).feedback, undefined);

  // C2 (index 1): stripped to {id, label, weight, score} only
  assertEquals((criteria[1] as Record<string, unknown>).id, 'c2_formatting_consistency');
  assertEquals((criteria[1] as Record<string, unknown>).label, 'Formatting Consistency');
  assertEquals((criteria[1] as Record<string, unknown>).weight, 4);
  assertEquals((criteria[1] as Record<string, unknown>).score, 80);
  assertEquals((criteria[1] as Record<string, unknown>).feedback, undefined);

  // C6: keeps full achievement feedback for Free tier.
  assertEquals((criteria[5] as Record<string, unknown>).id, 'c6_achievement_orientation');
  assertEquals((criteria[5] as Record<string, unknown>).feedback !== undefined, true);
  assertEquals(((criteria[5] as Record<string, unknown>).feedback as Record<string, unknown>).observation, 'Strong metrics');

  // C11 (index 10): also stripped
  assertEquals((criteria[10] as Record<string, unknown>).id, 'c11_career_narrative');
  assertEquals((criteria[10] as Record<string, unknown>).feedback, undefined);
});

Deno.test("applyTierShape pro: keeps all criteria feedback, keeps rewriteSuggestions, strips eliteInsights", () => {
  const merged = makeFullMergedOutput();
  applyTierShape(merged, 'pro');

  // Pro has full criteria feedback
  const criteria = merged.criterionFeedback as Record<string, unknown>[];
  assertEquals((criteria[1] as Record<string, unknown>).feedback !== undefined, true);
  assertEquals((criteria[10] as Record<string, unknown>).feedback !== undefined, true);

  // Pro has rewriteSuggestions
  assertEquals(Array.isArray(merged.rewriteSuggestions), true);
  assertEquals((merged.rewriteSuggestions as unknown[]).length, 1);

  // Pro has industryGuess, suggestedTargetRoles, recommendedKeywords
  assertEquals(merged.industryGuess, 'Software Engineering');
  assertEquals(Array.isArray(merged.suggestedTargetRoles), true);
  assertEquals(Array.isArray(merged.recommendedKeywords), true);

  // Pro does NOT have eliteInsights
  assertEquals(merged.eliteInsights, undefined);
});

Deno.test("applyTierShape pro: caps priorityImprovements to 5", () => {
  const merged = makeFullMergedOutput();
  applyTierShape(merged, 'pro');

  const improvements = merged.priorityImprovements as string[];
  assertEquals(improvements.length, 5);
});

Deno.test("applyTierShape elite: keeps everything including eliteInsights", () => {
  const merged = makeFullMergedOutput();
  applyTierShape(merged, 'elite');

  // Elite keeps all Pro fields
  assertEquals(Array.isArray(merged.rewriteSuggestions), true);
  assertEquals(merged.industryGuess, 'Software Engineering');

  // Elite keeps eliteInsights
  assertEquals(merged.eliteInsights !== undefined, true);
  assertEquals((merged.eliteInsights as Record<string, unknown>).interviewLikelihood, 72);
  assertEquals((merged.eliteInsights as Record<string, unknown>).competitiveRanking, 'Top 25%');

  // Elite keeps full criteria feedback
  const criteria = merged.criterionFeedback as Record<string, unknown>[];
  assertEquals((criteria[10] as Record<string, unknown>).feedback !== undefined, true);
});

Deno.test("applyTierShape elite: caps priorityImprovements to 7", () => {
  const merged = makeFullMergedOutput();
  // Add more items to test the cap
  (merged.priorityImprovements as string[]).push('Item 6', 'Item 7', 'Item 8', 'Item 9');
  applyTierShape(merged, 'elite');

  const improvements = merged.priorityImprovements as string[];
  assertEquals(improvements.length, 7);
});

Deno.test("applyTierShape free: is idempotent on already-shaped output", () => {
  const merged = makeFullMergedOutput();
  applyTierShape(merged, 'free');

  // Capture state after first application
  const firstPassKeys = Object.keys(merged).sort();
  const firstPassImprovementCount = (merged.priorityImprovements as unknown[]).length;

  // Apply again
  applyTierShape(merged, 'free');

  assertEquals(Object.keys(merged).sort(), firstPassKeys);
  assertEquals((merged.priorityImprovements as unknown[]).length, firstPassImprovementCount);
});

Deno.test("mergeAndValidateResults signature accepts tier string", () => {
  const rawResults = {
    'criteria-1': makeValidCriteria1(),
    'criteria-2': makeValidCriteria2(),
    'summary': makeValidSummary(false),
  };
  // Verify the function accepts 'free' (not boolean false)
  const result = mergeAndValidateResults(rawResults, 'free');
  assertEquals(result.ok, true);
  if (result.ok) {
    // Phase 15.2 D-01: free tier keeps 1 rewriteSuggestion (capped from summary call output)
    assertEquals(Array.isArray(result.data.rewriteSuggestions), true);
    assertEquals((result.data.rewriteSuggestions as unknown[]).length <= 1, true);
    // Free tier should have 1 priorityImprovements
    assertEquals((result.data.priorityImprovements as unknown[]).length <= 1, true);
  }
});

// ---------------------------------------------------------------------------
// Phase 15.2: rewriteSuggestions cap tests
// ---------------------------------------------------------------------------

Deno.test("applyTierShape free: caps rewriteSuggestions to 1 (Phase 15.2 D-01)", () => {
  const merged = makeFullMergedOutput();
  // Ensure fixture has multiple rewriteSuggestions
  merged.rewriteSuggestions = [
    { criterionId: 'c6', title: 'R1', originalText: 'old1', issues: ['i1'], improvedText: 'new1', impact: 'h', potentialScoreIncrease: 5 },
    { criterionId: 'c11', title: 'R2', originalText: 'old2', issues: ['i2'], improvedText: 'new2', impact: 'm', potentialScoreIncrease: 3 },
    { criterionId: 'c7', title: 'R3', originalText: 'old3', issues: ['i3'], improvedText: 'new3', impact: 'l', potentialScoreIncrease: 2 },
  ];
  applyTierShape(merged, 'free');
  const rewrites = merged.rewriteSuggestions as unknown[];
  assertEquals(rewrites.length, 1);
  assertEquals((rewrites[0] as Record<string, unknown>).criterionId, 'c6');
});

Deno.test("applyTierShape pro: caps rewriteSuggestions to 7 (Phase 15.2 D-01)", () => {
  const merged = makeFullMergedOutput();
  // Add 10 rewriteSuggestions
  merged.rewriteSuggestions = Array.from({ length: 10 }, (_, i) => ({
    criterionId: `c${i}`, title: `R${i}`, originalText: `old${i}`,
    issues: [`issue${i}`], improvedText: `new${i}`, impact: `impact${i}`, potentialScoreIncrease: i,
  }));
  applyTierShape(merged, 'pro');
  assertEquals((merged.rewriteSuggestions as unknown[]).length, 7);
});

Deno.test("applyTierShape elite: caps rewriteSuggestions to 10 (Phase 15.2 D-01)", () => {
  const merged = makeFullMergedOutput();
  // Add 15 rewriteSuggestions
  merged.rewriteSuggestions = Array.from({ length: 15 }, (_, i) => ({
    criterionId: `c${i}`, title: `R${i}`, originalText: `old${i}`,
    issues: [`issue${i}`], improvedText: `new${i}`, impact: `impact${i}`, potentialScoreIncrease: i,
  }));
  applyTierShape(merged, 'elite');
  assertEquals((merged.rewriteSuggestions as unknown[]).length, 10);
});

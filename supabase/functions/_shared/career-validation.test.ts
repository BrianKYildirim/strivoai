/**
 * Phase 06 · 06-01 · FEAT-05 — career-validation seam unit proof.
 *
 * Proves careerCompassSchema + careerSemanticCheck are byte-identical-safe:
 *   - a golden valid Free result passes
 *   - a valid Elite result (with compensationIntelligence) passes
 *   - the same Elite result with compensationIntelligence REMOVED still passes (D-08)
 *   - an empty-careerDNA object FAILS
 *   - an object missing careerFields FAILS
 *   - compensationIntelligence is optional (absence never fails)
 */
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { careerCompassSchema, careerSemanticCheck } from './career-validation.ts';

function goldenFree(): Record<string, unknown> {
  return {
    detectedDomain: 'Software',
    domainEvidence: ['3 years React', 'CS degree'],
    roleReadinessScore: 72,
    targetRole: 'Frontend Engineer',
    careerDNA: 'You are a frontend-leaning engineer. You have shipped React apps. You led a redesign. Your differentiator is design sense.',
    whatYouHave: ['React', 'TypeScript'],
    skillGaps: [{ skill: 'Testing', priority: 'Critical', action: 'Take Testing Library course' }],
    careerFields: [
      { title: 'Frontend Engineer', matchScore: 82, whyMatch: 'shipped React apps', requiredSkills: ['React'], salaryRange: '$100k-$130k', industryOutlook: 'Strong', timeline: 'now', recommendedRoles: ['FE Engineer'] },
    ],
    surpriseFits: [
      { role: 'DevRel', readinessScore: 78, whySurprising: 'writing + code', transferableSkills: ['writing', 'React', 'public speaking'] },
    ],
    roles: [
      { title: 'Frontend Engineer', description: '...', averageSalary: '$115k', skillAlignmentScore: 82, skillGaps: ['Testing'], qualificationSteps: ['Ship a tested app'] },
    ],
    roleReadinessBreakdown: {
      overallScore: 72, targetRole: 'Frontend Engineer', industryBenchmark: 'mid', strengths: ['React'], gaps: ['Testing'], skillAssessments: [], readinessVerdict: 'ready-ish',
    },
    // free-policy DELETES roadmap/roleRoadmaps — intentionally absent
  };
}

function goldenElite(): Record<string, unknown> {
  const base = goldenFree();
  base.roleRoadmaps = [
    { role: 'Frontend Engineer', steps: [{ phase: 'Months 1-2', category: 'Foundation', items: ['A', 'B', 'C'] }] },
  ];
  base.roadmap = [{ category: 'Courses', items: ['X'] }];
  base.compensationIntelligence = {
    salaryBands: [{ role: 'FE', entryLevel: '$90k', midLevel: '$120k', seniorLevel: '$160k', yourEstimate: '$120k', percentile: 55 }],
    roleTransitionROI: [],
    applicationStrategy: [],
    fiveYearEarnings: '$700k',
    earningsInsight: 'steady',
  };
  return base;
}

function assertPasses(obj: Record<string, unknown>): void {
  const parsed = careerCompassSchema.safeParse(obj);
  assertEquals(parsed.success, true);
  if (parsed.success) {
    assertEquals(careerSemanticCheck(parsed.data).ok, true);
  }
}

Deno.test('golden Free result passes schema + semanticCheck', () => {
  assertPasses(goldenFree());
});

Deno.test('valid Elite result (with compensationIntelligence) passes', () => {
  assertPasses(goldenElite());
});

Deno.test('Elite result with compensationIntelligence REMOVED still passes (D-08)', () => {
  const elite = goldenElite();
  delete elite.compensationIntelligence;
  assertPasses(elite);
});

Deno.test('compensationIntelligence is preserved byte-identical via passthrough', () => {
  const elite = goldenElite();
  const parsed = careerCompassSchema.safeParse(elite);
  assertEquals(parsed.success, true);
  if (parsed.success) {
    assertEquals(
      JSON.stringify((parsed.data as Record<string, unknown>).compensationIntelligence),
      JSON.stringify(elite.compensationIntelligence),
    );
  }
});

Deno.test('empty-careerDNA object FAILS', () => {
  const bad = goldenFree();
  bad.careerDNA = '';
  const parsed = careerCompassSchema.safeParse(bad);
  // schema superRefine rejects; if it somehow parsed, semanticCheck must reject.
  if (parsed.success) {
    assertEquals(careerSemanticCheck(parsed.data).ok, false);
  } else {
    assertEquals(parsed.success, false);
  }
});

Deno.test('object missing careerFields FAILS', () => {
  const bad = goldenFree();
  delete bad.careerFields;
  const parsed = careerCompassSchema.safeParse(bad);
  if (parsed.success) {
    assertEquals(careerSemanticCheck(parsed.data).ok, false);
  } else {
    assertEquals(parsed.success, false);
  }
});

Deno.test('object with empty careerFields array FAILS', () => {
  const bad = goldenFree();
  bad.careerFields = [];
  const parsed = careerCompassSchema.safeParse(bad);
  assertEquals(parsed.success, false);
});

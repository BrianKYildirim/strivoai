/**
 * Deno unit tests for applyCareerTierShape in result-merger module.
 *
 * Tests career-specific tier shaping (Phase 17 — CC-01..CC-04):
 *   - CC-01: Free tier retains core fields, slices arrays, and trims the scorebox
 *   - CC-02: Free tier omits skillGaps, salaryProgression, elite fields
 *   - CC-03: Pro tier retains all standard fields + salaryProgression and omits elite fields
 *   - CC-04: Elite tier retains all fields including compensationIntelligence, smartApplicationStrategy
 *
 * Run with: deno test supabase/functions/_shared/career-shape.test.ts --allow-read --allow-env --no-check
 */
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyCareerTierShape } from "./result-merger.ts";
import { TIER_MAX_TOKENS } from "./tier-config.ts";
import { FREE_SINGLE_CALL_MAX_TOKENS } from "./career-prompts.ts";

const RETIRED_READINESS_KEYS = [
  ['why', 'Match'].join(''),
  ['main', 'Barriers'].join(''),
  ['actions', 'Needed'].join(''),
];

// ---------------------------------------------------------------------------
// Golden fixture factory — simulates full Elite AI response
// ---------------------------------------------------------------------------

function makeFullCareerOutput(): Record<string, unknown> {
  return {
    detectedDomain: 'Technology',
    domainEvidence: ['software', 'engineering', 'python'],
    roleReadinessScore: 78,
    targetRole: 'Senior Software Engineer',
    careerDNA: 'A seasoned software engineer with 5 years of experience...',
    whatYouHave: ['Python proficiency', 'AWS experience', 'Team leadership'],
    careerFields: [
      { title: 'Software Engineering', matchScore: 92, whyMatch: 'Direct experience', requiredSkills: ['Python', 'AWS'], salaryRange: '$120k-$180k', recommendedRoles: ['Senior SWE', 'Staff SWE'] },
      { title: 'Data Engineering', matchScore: 85, whyMatch: 'Data pipeline work', requiredSkills: ['SQL', 'Spark'], salaryRange: '$130k-$190k', recommendedRoles: ['Data Engineer'] },
      { title: 'DevOps', matchScore: 78, whyMatch: 'CI/CD experience', requiredSkills: ['Docker', 'K8s'], salaryRange: '$125k-$175k', recommendedRoles: ['DevOps Engineer'] },
    ],
    roleReadinessBreakdown: {
      overallScore: 78,
      targetRole: 'Senior Software Engineer',
      industryBenchmark: 'Mid-level SWE with 5+ years',
      strengths: ['Strong Python skills', 'AWS certified'],
      gaps: ['Limited system design experience', 'No management track'],
      [RETIRED_READINESS_KEYS[0]]: 'Legacy fit copy',
      [RETIRED_READINESS_KEYS[1]]: ['Legacy barrier copy'],
      [RETIRED_READINESS_KEYS[2]]: ['Legacy action copy'],
      skillAssessments: [
        { skill: 'Python', yourLevel: 'Advanced', industryExpectation: 'Advanced', gap: 'None' },
        { skill: 'System Design', yourLevel: 'Intermediate', industryExpectation: 'Advanced', gap: 'Moderate' },
      ],
      readinessVerdict: 'Strong candidate with focused upskilling needed in system design.',
    },
    roleRoadmaps: [
      { role: 'Senior SWE', steps: [
        { phase: 'Months 1-2', category: 'Foundation', items: ['item1'] },
        { phase: 'Months 3-4', category: 'Build', items: ['item2'] },
        { phase: 'Months 5-7', category: 'Experience', items: ['item3'] },
        { phase: 'Months 8-10', category: 'Networking', items: ['item4'] },
        { phase: 'Months 11-12', category: 'Launch', items: ['item5'] },
      ]},
      { role: 'Staff SWE', steps: [
        { phase: 'Months 1-2', category: 'Foundation', items: ['itemA'] },
        { phase: 'Months 3-4', category: 'Build', items: ['itemB'] },
      ]},
    ],
    surpriseFits: [
      { role: 'Technical Product Manager', readinessScore: 80, whySurprising: 'Cross-functional skills', transferableSkills: ['communication', 'technical', 'leadership'] },
      { role: 'Solutions Architect', readinessScore: 75, whySurprising: 'System knowledge', transferableSkills: ['AWS', 'design', 'client-facing'] },
    ],
    roles: [
      { title: 'Senior SWE', description: 'Lead development', averageSalary: '$150k', skillAlignmentScore: 85 },
      { title: 'Staff SWE', description: 'Technical leadership', averageSalary: '$185k', skillAlignmentScore: 80 },
      { title: 'Engineering Manager', description: 'Lead delivery', averageSalary: '$175k', skillAlignmentScore: 76 },
    ],
    roadmap: [{ category: 'Courses', items: ['System Design Course'] }],
    skillGaps: [{ skill: 'System Design', priority: 'Critical', action: 'Take Grokking System Design' }],
    salaryProgression: [{ role: 'Senior SWE', entryLevel: '$120k', midLevel: '$150k', seniorLevel: '$200k', growthTrajectory: 'Strong' }],
    compensationIntelligence: {
      salaryBands: [{ role: 'Senior SWE', entryLevel: '$120k', midLevel: '$150k', seniorLevel: '$200k', yourEstimate: '$140k', percentile: 65 }],
      roleTransitionROI: [{ from: 'SWE', to: 'Senior SWE', salaryIncrease: '25%', timeToTransition: '2 years', roi: '300%', difficulty: 'Moderate' }],
      fiveYearEarnings: '$850,000 cumulative',
      earningsInsight: 'Above median trajectory for the Technology domain.',
    },
    smartApplicationStrategy: [
      { title: 'Senior SWE', company: 'Google', matchScore: 88, recommendation: 'apply', reason: 'Strong fit', competitiveness: 'High', timeToApply: 'Now' },
    ],
  };
}

// ---------------------------------------------------------------------------
// CC-01: Free tier retains core fields with slicing
// ---------------------------------------------------------------------------

Deno.test("CC-01: Free tier retains careerDNA in full", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'free');
  assertExists(data.careerDNA);
  assert(typeof data.careerDNA === 'string');
  assert((data.careerDNA as string).length > 0);
});

Deno.test("CC-01: Free tier slices careerFields to 3 entries", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'free');
  assert(Array.isArray(data.careerFields));
  assertEquals((data.careerFields as unknown[]).length, 3);
});

Deno.test("CC-01: Free tier slices surpriseFits to 2 entries", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'free');
  assert(Array.isArray(data.surpriseFits));
  assertEquals((data.surpriseFits as unknown[]).length, 2);
});

Deno.test("CC-01: Free tier slices roles to 3 entries", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'free');
  assert(Array.isArray(data.roles));
  assertEquals((data.roles as unknown[]).length, 3);
});

Deno.test("CC-01: Free tier omits generated roadmap content", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'free');
  assertEquals(data.roadmap, undefined);
  assertEquals(data.roleRoadmaps, undefined);
});

Deno.test("260713-hrd: the Free WHITELIST and the Free SHAPER now agree about roadmaps", () => {
  // The whitelist used to LIST `roadmap` / `roleRoadmaps` as Free-allowed ("steps sliced to
  // 2 phases in shaper") while the shaper unconditionally DELETED them. The two contradicted
  // each other and the shaper won, so Free never actually received a roadmap — but anyone
  // reading the whitelist would reasonably believe it did.
  //
  // The whitelist is now corrected to state the truth the shaper already enforced, and the
  // locked Free scope (no roadmap) is asserted from BOTH directions so they can never drift
  // apart again: the shaper drops them (above), and the whitelist no longer admits them.
  const source = Deno.readTextFileSync(new URL("./result-merger.ts", import.meta.url));
  const freeBlock = source.slice(
    source.indexOf("const CAREER_FREE_ALLOWED_FIELDS"),
    source.indexOf("const CAREER_PRO_ADDITIONS"),
  );
  assert(!freeBlock.includes("'roadmap'"), "Free whitelist must not admit `roadmap`");
  assert(!freeBlock.includes("'roleRoadmaps'"), "Free whitelist must not admit `roleRoadmaps`");

  // …and Elite, which pays for them, still gets both.
  const elite = makeFullCareerOutput();
  applyCareerTierShape(elite, 'elite');
  assertExists(elite.roadmap);
  assertExists(elite.roleRoadmaps);
});

Deno.test("CC-01: Free tier reduces roleReadinessBreakdown to scorebox only (no verdict)", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'free');
  assertExists(data.roleReadinessBreakdown);
  const rrb = data.roleReadinessBreakdown as Record<string, unknown>;
  const keys = Object.keys(rrb).sort();
  assertEquals(keys, ['overallScore', 'targetRole']);
});

Deno.test("CC-01: Free tier strips retired readiness subsections", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'free');
  assertExists(data.roleReadinessBreakdown);
  const rrb = data.roleReadinessBreakdown as Record<string, unknown>;
  assertEquals(Object.keys(rrb).sort(), ['overallScore', 'targetRole']);
  for (const key of RETIRED_READINESS_KEYS) assertEquals(rrb[key], undefined);
});

// ---------------------------------------------------------------------------
// CC-02: Free tier omits locked fields
// ---------------------------------------------------------------------------

Deno.test("CC-02: Free tier omits skillGaps", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'free');
  assertEquals(data.skillGaps, undefined);
});

Deno.test("CC-02: Free tier omits salaryProgression", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'free');
  assertEquals(data.salaryProgression, undefined);
});

Deno.test("CC-02: Free tier omits compensationIntelligence", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'free');
  assertEquals(data.compensationIntelligence, undefined);
});

Deno.test("CC-02: Free tier omits smartApplicationStrategy", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'free');
  assertEquals(data.smartApplicationStrategy, undefined);
});

// ---------------------------------------------------------------------------
// CC-03: Pro tier retains standard fields, omits elite
// ---------------------------------------------------------------------------

Deno.test("CC-03: Pro tier retains skillGaps", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'pro');
  assert(Array.isArray(data.skillGaps));
  assert((data.skillGaps as unknown[]).length > 0);
});

Deno.test("CC-03: Pro tier strips legacy readiness subsections", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'pro');
  assertExists(data.roleReadinessBreakdown);
  const rrb = data.roleReadinessBreakdown as Record<string, unknown>;
  for (const key of RETIRED_READINESS_KEYS) assertEquals(rrb[key], undefined);
});

Deno.test("CC-03: Pro tier retains salaryProgression", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'pro');
  assert(Array.isArray(data.salaryProgression));
  assert((data.salaryProgression as unknown[]).length > 0);
});

Deno.test("CC-03: Pro tier retains all careerFields", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'pro');
  assert(Array.isArray(data.careerFields));
  assertEquals((data.careerFields as unknown[]).length, 3);
});

Deno.test("CC-03: Pro tier omits compensationIntelligence", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'pro');
  assertEquals(data.compensationIntelligence, undefined);
});

Deno.test("CC-03: Pro tier omits smartApplicationStrategy", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'pro');
  assertEquals(data.smartApplicationStrategy, undefined);
});

// ---------------------------------------------------------------------------
// CC-04: Elite tier retains all fields
// ---------------------------------------------------------------------------

Deno.test("CC-04: Elite tier retains compensationIntelligence", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'elite');
  assertExists(data.compensationIntelligence);
  const ci = data.compensationIntelligence as Record<string, unknown>;
  assert(Array.isArray(ci.salaryBands));
});

Deno.test("CC-04: Elite tier retains smartApplicationStrategy", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'elite');
  assert(Array.isArray(data.smartApplicationStrategy));
  assert((data.smartApplicationStrategy as unknown[]).length > 0);
});

Deno.test("CC-04: Elite tier retains all fields", () => {
  const original = makeFullCareerOutput();
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'elite');
  const originalKeys = Object.keys(original).sort();
  const shapedKeys = Object.keys(data).sort();
  assertEquals(shapedKeys, originalKeys);
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

Deno.test("Idempotency: applying shaper twice produces same result", () => {
  const data = makeFullCareerOutput();
  applyCareerTierShape(data, 'free');
  const afterFirst = JSON.stringify(data);
  applyCareerTierShape(data, 'free');
  const afterSecond = JSON.stringify(data);
  assertEquals(afterFirst, afterSecond);
});

// ---------------------------------------------------------------------------
// 260419-35x: Boot-time invariant — FREE_SINGLE_CALL_MAX_TOKENS bounds
// ---------------------------------------------------------------------------

Deno.test("35x: FREE_SINGLE_CALL_MAX_TOKENS is <= 4000 and within TIER_MAX_TOKENS.free", () => {
  assert(FREE_SINGLE_CALL_MAX_TOKENS <= 4000, `FREE_SINGLE_CALL_MAX_TOKENS (${FREE_SINGLE_CALL_MAX_TOKENS}) must be <= 4000`);
  assert(
    FREE_SINGLE_CALL_MAX_TOKENS <= TIER_MAX_TOKENS.free,
    `FREE_SINGLE_CALL_MAX_TOKENS (${FREE_SINGLE_CALL_MAX_TOKENS}) must be <= TIER_MAX_TOKENS.free (${TIER_MAX_TOKENS.free})`,
  );
});

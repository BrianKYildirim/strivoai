/**
 * JSON Schemas for Anthropic constrained Career Compass output.
 *
 * These mirror the live Career Compass prompt shapes. Every property is required
 * so constrained decoding cannot close a partial object and continue the report
 * as Markdown (elite-cc-mixed-format). Elite is intentionally split into core,
 * growth, and extras schemas: Anthropic rejected both the original 81-property
 * schema and the first 56-property base split because their compiled grammars
 * were too large. Semantic checks still enforce non-empty arrays, score policy,
 * and tier completeness after the three objects are merged.
 */

type JsonSchema = Record<string, unknown>;

const stringValue: JsonSchema = { type: 'string' };
const numberValue: JsonSchema = { type: 'number' };

function object(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function array(items: JsonSchema): JsonSchema {
  return { type: 'array', items };
}

const stringArray = array(stringValue);

const careerField = object({
  title: stringValue,
  matchScore: numberValue,
  whyMatch: stringValue,
  whyMatchDetails: stringArray,
  requiredSkills: stringArray,
  salaryRange: stringValue,
  industryOutlook: stringValue,
  timeline: stringValue,
  recommendedRoles: stringArray,
});

const surpriseFit = object({
  role: stringValue,
  readinessScore: numberValue,
  whySurprising: stringValue,
  transferableSkills: stringArray,
});

const freeRole = object({
  title: stringValue,
  description: stringValue,
  averageSalary: stringValue,
  skillAlignmentScore: numberValue,
  qualificationSteps: stringArray,
});

const paidRole = object({
  title: stringValue,
  description: stringValue,
  averageSalary: stringValue,
  skillAlignmentScore: numberValue,
  skillGaps: stringArray,
  qualificationSteps: stringArray,
});

const skillGap = object({
  skill: stringValue,
  priority: stringValue,
  action: stringValue,
});

const skillAssessment = object({
  skill: stringValue,
  yourLevel: stringValue,
  industryExpectation: stringValue,
  gap: stringValue,
});

const roleRoadmapStep = object({
  phase: stringValue,
  category: stringValue,
  items: stringArray,
});

const roleRoadmap = object({
  role: stringValue,
  steps: array(roleRoadmapStep),
});

const roadmapItem = object({
  category: stringValue,
  items: stringArray,
});

const salaryBand = object({
  role: stringValue,
  entryLevel: stringValue,
  midLevel: stringValue,
  seniorLevel: stringValue,
  yourEstimate: stringValue,
  percentile: numberValue,
});

const roleTransition = object({
  from: stringValue,
  to: stringValue,
  salaryIncrease: stringValue,
  timeToTransition: stringValue,
  roi: stringValue,
  difficulty: stringValue,
});

const applicationStrategy = object({
  title: stringValue,
  company: stringValue,
  matchScore: numberValue,
  recommendation: stringValue,
  reason: stringValue,
  competitiveness: stringValue,
  timeToApply: stringValue,
});

const freeSchema = object({
  detectedDomain: stringValue,
  domainEvidence: stringArray,
  roleReadinessScore: numberValue,
  targetRole: stringValue,
  careerDNA: stringValue,
  whatYouHave: stringArray,
  roleReadinessBreakdown: object({
    overallScore: numberValue,
    targetRole: stringValue,
  }),
  careerFields: array(careerField),
  surpriseFits: array(surpriseFit),
  roles: array(freeRole),
});

const eliteCoreSchema = object({
  roleReadinessScore: numberValue,
  targetRole: stringValue,
  careerDNA: stringValue,
  whatYouHave: stringArray,
  careerFields: array(careerField),
  surpriseFits: array(surpriseFit),
  roles: array(paidRole),
});

const eliteGrowthSchema = object({
  skillGaps: array(skillGap),
  roleReadinessBreakdown: object({
    overallScore: numberValue,
    targetRole: stringValue,
    industryBenchmark: stringValue,
    strengths: stringArray,
    gaps: stringArray,
    skillAssessments: array(skillAssessment),
    readinessVerdict: stringValue,
  }),
  roleRoadmaps: array(roleRoadmap),
  roadmap: array(roadmapItem),
});

const eliteExtrasSchema = object({
  compensationIntelligence: object({
    salaryBands: array(salaryBand),
    roleTransitionROI: array(roleTransition),
    fiveYearEarnings: stringValue,
    earningsInsight: stringValue,
  }),
  smartApplicationStrategy: array(applicationStrategy),
});

export function getCareerOutputSchema(
  tier: 'free' | 'elite',
  callType: 'base' | 'growth' | 'elite-extras' = 'base',
): JsonSchema {
  if (tier === 'free') return freeSchema;
  if (callType === 'growth') return eliteGrowthSchema;
  return callType === 'elite-extras' ? eliteExtrasSchema : eliteCoreSchema;
}

export interface CareerField {
  title: string;
  matchScore: number;
  whyMatch: string;
  whyMatchDetails?: string[];
  requiredSkills: string[];
  salaryRange: string;
  industryOutlook: string;
  timeline: string;
  recommendedRoles: string[];
}

export interface CareerRole {
  title: string;
  description: string;
  averageSalary: string;
  skillAlignmentScore: number;
  skillGaps: string[];
  qualificationSteps: string[];
}

export interface RoadmapItem {
  category: string;
  items: string[];
}

export interface RoleRoadmapStep {
  phase: string;
  category: string;
  items: string[];
}

export interface RoleRoadmap {
  role: string;
  steps: RoleRoadmapStep[];
}

export interface SkillGap {
  skill: string;
  priority: string;
  action: string;
}

export interface SkillAssessment {
  skill: string;
  yourLevel: string;
  industryExpectation: string;
  gap: string;
}

export interface RoleReadinessBreakdown {
  overallScore: number;
  targetRole: string;
  industryBenchmark: string;
  strengths: string[];
  gaps: string[];
  skillAssessments: SkillAssessment[];
  readinessVerdict: string;
}

export interface SurpriseFit {
  role: string;
  readinessScore: number;
  whySurprising: string;
  transferableSkills: string[];
}

export interface AnalysisResult {
  careerFields: CareerField[];
  roles: CareerRole[];
  roadmap: RoadmapItem[];
  roleRoadmaps?: RoleRoadmap[];
  careerDNA: string;
  detectedDomain?: string;
  domainEvidence?: string[];
  roleReadinessScore?: number;
  targetRole?: string;
  whatYouHave?: string[];
  skillGaps?: SkillGap[];
  roleReadinessBreakdown?: RoleReadinessBreakdown;
  surpriseFits?: SurpriseFit[];
  // 22-03 D-15: Additive cross-feature-memory fields emitted by analyze-career
  // on every success path. True + ISO date when the backend reused the user's
  // latest LinkedIn Grader analysis instead of re-parsing a LinkedIn PDF.
  reusedLinkedinGrade?: boolean;
  linkedinGradeDate?: string | null;
}

export const SOURCE_TAGS = [
  'Resume Analysis',
  'LinkedIn Grade',
  'Career Compass',
  'Saved Jobs',
  'Recruiting Lens',
] as const;

export type SourceTag = typeof SOURCE_TAGS[number];
export type SourceKey = 'resume' | 'linkedin' | 'careerCompass' | 'savedJobs' | 'recruitingLens';
export type DashboardDepth = 'free' | 'paid';
export type RuntimeTier = 'free' | 'elite' | 'admin' | 'pro' | string | null | undefined;

export type RecruiterResponseId =
  | 'strong_shortlist_potential'
  | 'interested_but_needs_clearer_positioning'
  | 'competitive_but_undifferentiated'
  | 'relevant_experience_unclear_direction'
  | 'high_potential_insufficient_proof';

export type EmptyStateModel = {
  title: string;
  body: string;
  cta: string;
  href: string;
};

export type Insight = {
  id: string;
  title: string;
  body: string;
  source: SourceTag;
};

export type LockedInsight = {
  id: string;
  title: string;
  body: string;
  source: SourceTag;
  locked: true;
};

export type SignalScore = {
  key: SourceKey;
  source: SourceTag;
  label: string;
  score: number;
  weight: number;
  available: boolean;
};

export type RecruiterFirstImpressionModel = {
  status: 'empty' | 'ready';
  tierDepth: DashboardDepth;
  emptyState?: EmptyStateModel;
  currentPositioning: string;
  response: {
    id: RecruiterResponseId;
    label: string;
    score: number;
    confidence: 'low' | 'medium' | 'high';
  };
  standouts: Insight[];
  concerns: Insight[];
  lockedTeasers: LockedInsight[];
  stalenessNotes: string[];
  cta: {
    label: 'Strengthen My Positioning';
    href: string;
    targetSignal: SourceKey;
    reason: string;
  };
  signalScores: SignalScore[];
};

export type ResumeSignal = {
  score: number | null;
  strengths: string[];
  concerns: string[];
  roles: string[];
  keywords: string[];
  recruiterFirstImpressions?: {
    atThreeSeconds?: string;
    atSevenSeconds?: string;
    whatTheyMiss?: string;
  };
  date?: string | null;
};

export type LinkedInSignal = {
  score: number | null;
  strengths: string[];
  concerns: string[];
  improvements: string[];
  sectionNames: string[];
  date?: string | null;
};

export type CareerCompassSignal = {
  score: number | null;
  strengths: string[];
  gaps: string[];
  targetRoles: string[];
  date?: string | null;
};

export type SavedJobSignal = {
  role: string;
  company: string;
  industry?: string | null;
  date?: string | null;
};

export type RecruitingLensSignal = {
  score: number | null;
  strengths: string[];
  concerns: string[];
  matchedKeywords: string[];
  missingKeywords: string[];
  date?: string | null;
};

export type StoredDashboardInputs = {
  resume?: ResumeSignal;
  linkedin?: LinkedInSignal;
  careerCompass?: CareerCompassSignal;
  savedJobs: SavedJobSignal[];
  recruitingLens?: RecruitingLensSignal;
};

export function normalizeDashboardDepth(tier: RuntimeTier): DashboardDepth {
  return tier === 'free' || !tier ? 'free' : 'paid';
}

export type ProfileAlignmentCategoryId =
  | 'experience_consistency'
  | 'skills_alignment'
  | 'positioning_alignment'
  | 'evidence_alignment';

export type ProfileAlignmentCategory = {
  id: ProfileAlignmentCategoryId;
  label: string;
  score: number;
  summary: string;
  sources: SourceTag[];
  locked?: boolean;
};

export type ProfileAlignmentModel = {
  status: 'missing' | 'ready';
  tierDepth: DashboardDepth;
  emptyState?: EmptyStateModel;
  overallScore: number | null;
  interpretation: string;
  categories: ProfileAlignmentCategory[];
  actions: Insight[];
  lockedTeasers: LockedInsight[];
  stalenessNotes: string[];
  cta: {
    label: 'Align My Profiles';
    href: string;
  };
};

/**
 * Goal Readiness (quick 260712-msh) — the render model for the PERSISTED,
 * deterministic, zero-AI score computed by `compute_goal_readiness()` in SQL.
 *
 * These types describe what is READ out of `career_targets.goal_readiness_components`.
 * The weights and the renormalization live in SQL, once — never here.
 */
export type GoalReadinessComponent = {
  id: string;
  label: string;
  weight: number;
  score: number;
  /** False => MISSING DATA. Renormalized OUT of the rubric. Never rendered as 0%. */
  evidenced: boolean;
};

export type GoalReadinessModel = {
  status: 'no_goal' | 'no_evidence' | 'ready';
  /** The persisted 0-100 score, passed through verbatim. Null until computable. */
  score: number | null;
  components: GoalReadinessComponent[];
  unevidenced: GoalReadinessComponent[];
  /** True when ANY component is un-evidenced — drives the §9f partial-evidence indicator. */
  partialEvidence: boolean;
  /** Σ of evidenced weights, e.g. 75 -> "based on 75% of the rubric". */
  evidencedWeight: number;
  interpretation: string;
  blockers: string[];
};

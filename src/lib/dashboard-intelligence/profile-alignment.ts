import { buildStalenessNotes } from './staleness';
import type {
  DashboardDepth,
  Insight,
  LockedInsight,
  ProfileAlignmentCategory,
  ProfileAlignmentModel,
  RuntimeTier,
  SourceTag,
  StoredDashboardInputs,
} from './types';
import { normalizeDashboardDepth } from './types';

const MISSING_RESUME_COPY = 'Upload your resume to compare your experience, skills, and evidence.';
const MISSING_LINKEDIN_COPY = 'Add your LinkedIn profile to compare your professional positioning.';

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function words(items: string[]): Set<string> {
  const tokens = items
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
  return new Set(tokens);
}

function overlapScore(left: string[], right: string[], fallback: number): number {
  const a = words(left);
  const b = words(right);
  if (a.size === 0 || b.size === 0) return fallback;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return clampScore(42 + (intersection / Math.max(1, union)) * 58);
}

function qualityGapScore(resumeScore: number, linkedinScore: number): number {
  return clampScore(100 - Math.abs(resumeScore - linkedinScore) * 0.9);
}

function category(
  id: ProfileAlignmentCategory['id'],
  label: string,
  score: number,
  summary: string,
  sources: SourceTag[],
): ProfileAlignmentCategory {
  return { id, label, score: clampScore(score), summary, sources };
}

function buildCategories(inputs: StoredDashboardInputs, depth: DashboardDepth): ProfileAlignmentCategory[] {
  const resumeScore = inputs.resume?.score ?? 0;
  const linkedinScore = inputs.linkedin?.score ?? 0;
  const resumeEvidence = unique([
    ...(inputs.resume?.strengths ?? []),
    ...(inputs.resume?.roles ?? []),
    ...(inputs.resume?.keywords ?? []),
  ]);
  const linkedinEvidence = unique([
    ...(inputs.linkedin?.strengths ?? []),
    ...(inputs.linkedin?.sectionNames ?? []),
  ]);
  const skillScore = overlapScore(inputs.resume?.keywords ?? [], inputs.linkedin?.sectionNames ?? [], qualityGapScore(resumeScore, linkedinScore));
  const positioningScore = overlapScore(inputs.resume?.roles ?? [], inputs.linkedin?.strengths ?? [], qualityGapScore(resumeScore, linkedinScore));
  const evidenceScore = clampScore((resumeScore + linkedinScore) / 2 + Math.min(resumeEvidence.length + linkedinEvidence.length, 8));

  const categories = [
    category(
      'experience_consistency',
      'Experience Consistency',
      qualityGapScore(resumeScore, linkedinScore),
      'Resume and LinkedIn strength are compared for consistency across the recruiter-facing profile.',
      ['Resume Analysis', 'LinkedIn Grade'],
    ),
    category(
      'positioning_alignment',
      'Positioning Alignment',
      positioningScore,
      'Target roles and LinkedIn positioning are checked for a consistent professional story.',
      ['Resume Analysis', 'LinkedIn Grade'],
    ),
    category(
      'skills_alignment',
      'Skills Alignment',
      skillScore,
      'Resume keywords and LinkedIn profile sections are compared for shared skill emphasis.',
      ['Resume Analysis', 'LinkedIn Grade'],
    ),
    category(
      'evidence_alignment',
      'Evidence Alignment',
      evidenceScore,
      'Quantified resume proof and LinkedIn evidence are checked for mutual support.',
      ['Resume Analysis', 'LinkedIn Grade'],
    ),
  ];

  if (depth === 'free') return categories.filter((item) => item.id === 'experience_consistency' || item.id === 'positioning_alignment');
  return categories;
}

function action(id: string, title: string, body: string, source: SourceTag): Insight {
  return { id, title, body, source };
}

function buildActions(inputs: StoredDashboardInputs, categories: ProfileAlignmentCategory[], depth: DashboardDepth): Insight[] {
  const actions: Insight[] = [];
  const resumeScore = inputs.resume?.score ?? 0;
  const linkedinScore = inputs.linkedin?.score ?? 0;
  if (resumeScore < linkedinScore - 8) {
    actions.push(action('strengthen-resume-proof', 'Strengthen resume proof', 'Bring the resume evidence up to the stronger LinkedIn signal.', 'Resume Analysis'));
  }
  if (linkedinScore < resumeScore - 8) {
    actions.push(action('strengthen-linkedin-proof', 'Strengthen LinkedIn proof', 'Bring LinkedIn evidence up to the stronger resume signal.', 'LinkedIn Grade'));
  }
  const weakest = [...categories].sort((a, b) => a.score - b.score)[0];
  if (weakest && actions.length === 0) {
    actions.push(action(`improve-${weakest.id}`, `Improve ${weakest.label.toLowerCase()}`, weakest.summary, weakest.sources[0]));
  }
  if (depth === 'paid') {
    const careerGap = inputs.careerCompass?.gaps[0];
    if (careerGap) actions.push(action('career-compass-gap', 'Clarify career direction', careerGap, 'Career Compass'));
    const lensGap = inputs.recruitingLens?.missingKeywords[0] ?? inputs.recruitingLens?.concerns[0];
    if (lensGap) actions.push(action('recruiting-lens-gap', 'Close role-match language', lensGap, 'Recruiting Lens'));
    if (inputs.savedJobs.length > 0) {
      actions.push(action('saved-jobs-context', 'Align against saved roles', 'Use saved target roles to tune profile language for the roles you are pursuing.', 'Saved Jobs'));
    }
  }
  return actions.slice(0, depth === 'free' ? 2 : 3);
}

function lockedTeasers(depth: DashboardDepth): LockedInsight[] {
  if (depth !== 'free') return [];
  return [
    {
      id: 'skills-evidence-depth',
      title: 'Skills and evidence depth',
      body: 'Elite compares all four alignment categories with deeper evidence.',
      source: 'Career Compass',
      locked: true,
    },
    {
      id: 'role-specific-depth',
      title: 'Role-specific alignment',
      body: 'Elite adds saved-role and Recruiting Lens context when available.',
      source: 'Recruiting Lens',
      locked: true,
    },
  ];
}

function missingModel(depth: DashboardDepth, body: string, href: string, cta: string): ProfileAlignmentModel {
  return {
    status: 'missing',
    tierDepth: depth,
    emptyState: {
      title: 'Profile alignment needs both profiles',
      body,
      cta,
      href,
    },
    overallScore: null,
    interpretation: body,
    categories: [],
    actions: [],
    lockedTeasers: lockedTeasers(depth),
    stalenessNotes: [],
    cta: { label: 'Align My Profiles', href },
  };
}

export function deriveProfileAlignment(inputs: StoredDashboardInputs, tier: RuntimeTier = 'free'): ProfileAlignmentModel {
  const depth = normalizeDashboardDepth(tier);
  const hasResume = inputs.resume?.score !== null && inputs.resume?.score !== undefined;
  const hasLinkedIn = inputs.linkedin?.score !== null && inputs.linkedin?.score !== undefined;

  if (!hasResume && hasLinkedIn) return missingModel(depth, MISSING_RESUME_COPY, '/upload', 'Upload Resume');
  if (hasResume && !hasLinkedIn) return missingModel(depth, MISSING_LINKEDIN_COPY, '/linkedin-grader', 'Grade LinkedIn');
  if (!hasResume || !hasLinkedIn) {
    return missingModel(depth, 'Upload a resume and grade your LinkedIn profile to compare one consistent professional story.', '/onboarding', 'Start Profile');
  }

  const categories = buildCategories(inputs, depth);
  const overallScore = clampScore(categories.reduce((sum, item) => sum + item.score, 0) / Math.max(1, categories.length));
  const interpretation = overallScore >= 82
    ? 'Your resume and LinkedIn tell a consistent professional story.'
    : overallScore >= 68
      ? 'Your resume and LinkedIn are broadly aligned, with a few positioning gaps to close.'
      : 'Your resume and LinkedIn may be telling recruiters different stories.';

  return {
    status: 'ready',
    tierDepth: depth,
    overallScore,
    interpretation,
    categories,
    actions: buildActions(inputs, categories, depth),
    lockedTeasers: lockedTeasers(depth),
    stalenessNotes: buildStalenessNotes(inputs),
    cta: { label: 'Align My Profiles', href: overallScore >= 70 ? '/linkedin-grader' : '/upload' },
  };
}

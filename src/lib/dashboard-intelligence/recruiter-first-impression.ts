import { buildStalenessNotes } from './staleness';
import type {
  DashboardDepth,
  Insight,
  LockedInsight,
  RecruiterFirstImpressionModel,
  RecruiterResponseId,
  SignalScore,
  SourceKey,
  SourceTag,
  StoredDashboardInputs,
  RuntimeTier,
} from './types';
import { normalizeDashboardDepth } from './types';

const RESPONSE_LABELS: Record<RecruiterResponseId, string> = {
  strong_shortlist_potential: 'Strong shortlist potential',
  interested_but_needs_clearer_positioning: 'Interested but needs clearer positioning',
  competitive_but_undifferentiated: 'Competitive but undifferentiated',
  relevant_experience_unclear_direction: 'Relevant experience, unclear direction',
  high_potential_insufficient_proof: 'High potential, insufficient proof',
};

const RESPONSE_ORDER: RecruiterResponseId[] = [
  'high_potential_insufficient_proof',
  'relevant_experience_unclear_direction',
  'competitive_but_undifferentiated',
  'interested_but_needs_clearer_positioning',
  'strong_shortlist_potential',
];

const SIGNAL_META: Record<SourceKey, { source: SourceTag; label: string; href: string }> = {
  resume: { source: 'Resume Analysis', label: 'Resume signal', href: '/upload' },
  linkedin: { source: 'LinkedIn Grade', label: 'LinkedIn signal', href: '/linkedin-grader' },
  careerCompass: { source: 'Career Compass', label: 'Career direction', href: '/career-compass' },
  savedJobs: { source: 'Saved Jobs', label: 'Target-role context', href: '/jobs' },
  recruitingLens: { source: 'Recruiting Lens', label: 'Job-match evidence', href: '/recruiting-lens' },
};

const FREE_WEIGHTS: Array<[SourceKey, number]> = [
  ['resume', 0.54],
  ['linkedin', 0.46],
];

const PAID_WEIGHTS: Array<[SourceKey, number]> = [
  ['resume', 0.35],
  ['linkedin', 0.3],
  ['careerCompass', 0.15],
  ['savedJobs', 0.1],
  ['recruitingLens', 0.1],
];

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function signalScore(inputs: StoredDashboardInputs, key: SourceKey): number | null {
  if (key === 'resume') return inputs.resume?.score ?? null;
  if (key === 'linkedin') return inputs.linkedin?.score ?? null;
  if (key === 'careerCompass') return inputs.careerCompass?.score ?? null;
  if (key === 'recruitingLens') return inputs.recruitingLens?.score ?? null;
  if (key === 'savedJobs') {
    if (inputs.savedJobs.length === 0) return null;
    return clampScore(46 + Math.min(inputs.savedJobs.length, 4) * 8);
  }
  return null;
}

function buildSignalScores(inputs: StoredDashboardInputs, depth: DashboardDepth): SignalScore[] {
  const weights = depth === 'free' ? FREE_WEIGHTS : PAID_WEIGHTS;
  return weights.map(([key, weight]) => {
    const score = signalScore(inputs, key);
    return {
      key,
      source: SIGNAL_META[key].source,
      label: SIGNAL_META[key].label,
      score: score ?? 0,
      weight,
      available: score !== null,
    };
  });
}

function weightedScore(signals: SignalScore[]): number {
  const available = signals.filter((signal) => signal.available);
  const totalWeight = available.reduce((sum, signal) => sum + signal.weight, 0);
  if (available.length === 0 || totalWeight <= 0) return 0;
  return clampScore(available.reduce((sum, signal) => sum + signal.score * signal.weight, 0) / totalWeight);
}

function responseFromScore(score: number): RecruiterResponseId {
  if (score > 84) return 'strong_shortlist_potential';
  if (score > 74) return 'interested_but_needs_clearer_positioning';
  if (score > 61) return 'competitive_but_undifferentiated';
  if (score > 47) return 'relevant_experience_unclear_direction';
  return 'high_potential_insufficient_proof';
}

function capResponse(response: RecruiterResponseId, signals: SignalScore[], depth: DashboardDepth): RecruiterResponseId {
  const availableCount = signals.filter((signal) => signal.available).length;
  const maxRank = depth === 'free'
    ? (availableCount >= 2 ? 4 : availableCount === 1 ? 1 : 0)
    : (availableCount >= 4 ? 4 : availableCount >= 2 ? 3 : availableCount === 1 ? 1 : 0);
  const rank = RESPONSE_ORDER.indexOf(response);
  return RESPONSE_ORDER[Math.max(0, Math.min(rank, maxRank))];
}

function confidenceFor(signals: SignalScore[], response: RecruiterResponseId): 'low' | 'medium' | 'high' {
  const availableCount = signals.filter((signal) => signal.available).length;
  if (availableCount <= 1) return 'low';
  if (response === 'strong_shortlist_potential' && availableCount >= 2) return 'high';
  return availableCount >= 3 ? 'high' : 'medium';
}

function insight(id: string, title: string, body: string, source: SourceTag): Insight {
  return { id, title, body, source };
}

function sourceList(items: string[], limit: number): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, limit);
}

function buildStandouts(inputs: StoredDashboardInputs, depth: DashboardDepth): Insight[] {
  const standouts: Insight[] = [];
  for (const item of sourceList(inputs.resume?.strengths ?? [], 3)) {
    standouts.push(insight(`resume-strength-${standouts.length}`, 'Resume proof point', item, 'Resume Analysis'));
  }
  for (const item of sourceList(inputs.linkedin?.strengths ?? [], 3)) {
    standouts.push(insight(`linkedin-strength-${standouts.length}`, 'LinkedIn proof point', item, 'LinkedIn Grade'));
  }
  if (depth === 'paid') {
    for (const item of sourceList(inputs.careerCompass?.strengths ?? [], 2)) {
      standouts.push(insight(`career-strength-${standouts.length}`, 'Career direction signal', item, 'Career Compass'));
    }
    if (inputs.savedJobs.length > 0) {
      const roles = sourceList(inputs.savedJobs.map((job) => job.role).filter(Boolean), 2).join(', ');
      standouts.push(insight('saved-jobs-focus', 'Target-role focus', `Saved roles show active focus around ${roles}.`, 'Saved Jobs'));
    }
    for (const item of sourceList(inputs.recruitingLens?.strengths ?? [], 2)) {
      standouts.push(insight(`lens-strength-${standouts.length}`, 'Role-match proof', item, 'Recruiting Lens'));
    }
  }
  return standouts.slice(0, depth === 'free' ? 2 : 3);
}

function buildConcerns(inputs: StoredDashboardInputs, depth: DashboardDepth, signals: SignalScore[]): Insight[] {
  const concerns: Insight[] = [];
  for (const item of sourceList(inputs.resume?.concerns ?? [], 3)) {
    concerns.push(insight(`resume-concern-${concerns.length}`, 'Resume positioning gap', item, 'Resume Analysis'));
  }
  for (const item of sourceList(inputs.linkedin?.concerns ?? [], 3)) {
    concerns.push(insight(`linkedin-concern-${concerns.length}`, 'LinkedIn positioning gap', item, 'LinkedIn Grade'));
  }
  for (const signal of signals.filter((item) => item.available && item.score < 65)) {
    concerns.push(insight(`${signal.key}-score-concern`, `${signal.label} needs evidence`, `${signal.label} is currently at ${signal.score}%, which may create recruiter doubt.`, signal.source));
  }
  if (depth === 'paid') {
    for (const item of sourceList(inputs.careerCompass?.gaps ?? [], 2)) {
      concerns.push(insight(`career-gap-${concerns.length}`, 'Career direction gap', item, 'Career Compass'));
    }
    for (const item of sourceList(inputs.recruitingLens?.concerns ?? [], 2)) {
      concerns.push(insight(`lens-gap-${concerns.length}`, 'Role-match risk', item, 'Recruiting Lens'));
    }
    const missingKeywords = sourceList(inputs.recruitingLens?.missingKeywords ?? [], 3);
    if (missingKeywords.length > 0) {
      concerns.push(insight('lens-missing-keywords', 'Keyword gap', `Missing role language: ${missingKeywords.join(', ')}.`, 'Recruiting Lens'));
    }
  }
  return concerns.slice(0, depth === 'free' ? 1 : 2);
}

function buildLockedTeasers(depth: DashboardDepth): LockedInsight[] {
  if (depth !== 'free') return [];
  return [
    {
      id: 'career-compass-depth',
      title: 'Career Compass depth',
      body: 'Elite adds role-direction evidence to sharpen the recruiter read.',
      source: 'Career Compass',
      locked: true,
    },
    {
      id: 'recruiting-lens-depth',
      title: 'Recruiting Lens depth',
      body: 'Elite adds target-job fit and missing keyword evidence when available.',
      source: 'Recruiting Lens',
      locked: true,
    },
  ];
}

function weakestSignal(signals: SignalScore[]): SignalScore {
  return [...signals].sort((a, b) => (b.weight * (100 - b.score)) - (a.weight * (100 - a.score)))[0] ?? {
    key: 'resume',
    source: 'Resume Analysis',
    label: 'Resume signal',
    score: 0,
    weight: 1,
    available: false,
  };
}

function currentPositioning(responseId: RecruiterResponseId, signals: SignalScore[]): string {
  const available = signals.filter((signal) => signal.available).map((signal) => signal.source).join(' and ');
  if (!available) return 'Your recruiter-facing positioning is not established yet.';
  return `${available} currently point to: ${RESPONSE_LABELS[responseId]}.`;
}

export function deriveRecruiterFirstImpression(
  inputs: StoredDashboardInputs,
  tier: RuntimeTier = 'free',
): RecruiterFirstImpressionModel {
  const depth = normalizeDashboardDepth(tier);
  const signals = buildSignalScores(inputs, depth);
  const score = weightedScore(signals);
  const cappedResponse = capResponse(responseFromScore(score), signals, depth);
  const availableCount = signals.filter((signal) => signal.available).length;
  const weakest = weakestSignal(signals);

  if (availableCount === 0) {
    return {
      status: 'empty',
      tierDepth: depth,
      emptyState: {
        title: 'Recruiter impression needs source data',
        body: 'Analyze a resume or grade your LinkedIn profile to see how employers are likely to read your positioning.',
        cta: 'Analyze Resume',
        href: '/onboarding',
      },
      currentPositioning: 'Your recruiter-facing positioning is not established yet.',
      response: {
        id: 'high_potential_insufficient_proof',
        label: RESPONSE_LABELS.high_potential_insufficient_proof,
        score: 0,
        confidence: 'low',
      },
      standouts: [],
      concerns: [],
      lockedTeasers: buildLockedTeasers(depth),
      stalenessNotes: [],
      cta: {
        label: 'Strengthen My Positioning',
        href: '/onboarding',
        targetSignal: 'resume',
        reason: 'Resume signal is the first missing input.',
      },
      signalScores: signals,
    };
  }

  return {
    status: 'ready',
    tierDepth: depth,
    currentPositioning: currentPositioning(cappedResponse, signals),
    response: {
      id: cappedResponse,
      label: RESPONSE_LABELS[cappedResponse],
      score,
      confidence: confidenceFor(signals, cappedResponse),
    },
    standouts: buildStandouts(inputs, depth),
    concerns: buildConcerns(inputs, depth, signals),
    lockedTeasers: buildLockedTeasers(depth),
    stalenessNotes: buildStalenessNotes(inputs),
    cta: {
      label: 'Strengthen My Positioning',
      href: SIGNAL_META[weakest.key].href,
      targetSignal: weakest.key,
      reason: `${weakest.label} is the weakest weighted recruiter signal.`,
    },
    signalScores: signals,
  };
}

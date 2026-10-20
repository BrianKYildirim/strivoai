import { describe, expect, it } from 'vitest';

import { deriveRecruiterFirstImpression } from './recruiter-first-impression';
import { normalizeDashboardIntelligenceInputs } from './inputs';

const resumeRow = {
  id: 'r1',
  file_name: 'resume.pdf',
  created_at: '2026-06-01T00:00:00Z',
  analyzed_at: '2026-06-02T00:00:00Z',
  overall_score: 92,
  grading_data: {
    strengths: ['Quantified revenue impact across enterprise accounts.', 'Clear senior product leadership scope.'],
    priorityImprovements: ['Add sharper target-role keywords to the top summary.'],
    suggestedTargetRoles: ['Senior Product Manager'],
    recommendedKeywords: ['roadmap', 'enterprise'],
  },
};

const linkedinRow = {
  id: 'l1',
  overall_score: 90,
  created_at: '2026-06-05T00:00:00Z',
  grading_data: {
    keyStrengths: ['Headline states product leadership and AI platform focus.'],
    topFixes: [{ title: 'Add more quantified featured wins', suggestedFix: 'Feature one measurable product launch.' }],
    sectionBreakdown: [
      { name: 'Experience', strengths: ['Experience section shows relevant product scope.'], weaknesses: [] },
    ],
  },
};

const paidHistory = [
  {
    id: 'c1',
    analysis_type: 'career_compass',
    created_at: '2026-06-07T00:00:00Z',
    primary_score: 82,
    raw_response: {
      roleReadinessScore: 82,
      whatYouHave: ['Career Compass confirms platform strategy strengths.'],
      skillGaps: [{ skill: 'Executive storytelling', action: 'Clarify the leadership narrative.' }],
      targetRole: 'Director of Product',
    },
  },
  {
    id: 'rl1',
    analysis_type: 'recruiting_lens',
    created_at: '2026-06-08T00:00:00Z',
    primary_score: 76,
    raw_response: {
      overallMatch: { score: 76 },
      scoreRationale: [{ strengths: ['Strong overlap with product strategy requirements.'], weaknesses: ['Missing a few AI governance keywords.'] }],
      keywords: { matched: ['roadmap'], missing: ['AI governance'] },
    },
  },
];

function baseInputs() {
  return normalizeDashboardIntelligenceInputs({
    resume: resumeRow,
    linkedinGrade: linkedinRow,
    savedJobs: [{ role_applied: 'Product Lead', company_applied: 'Acme', created_at: '2026-06-09T00:00:00Z' }],
    analysisHistory: paidHistory,
  });
}

describe('deriveRecruiterFirstImpression', () => {
  it('returns an action-first empty state when no stored signals exist', () => {
    const model = deriveRecruiterFirstImpression(normalizeDashboardIntelligenceInputs({}), 'free');
    expect(model.status).toBe('empty');
    expect(model.emptyState?.cta).toBe('Analyze Resume');
    expect(model.standouts).toHaveLength(0);
    expect(model.concerns).toHaveLength(0);
  });

  it('caps resume-only output and keeps every personalized concern source-tagged', () => {
    const inputs = normalizeDashboardIntelligenceInputs({ resume: resumeRow });
    const model = deriveRecruiterFirstImpression(inputs, 'free');
    expect(model.response.id).toBe('relevant_experience_unclear_direction');
    expect(model.response.confidence).toBe('low');
    expect(model.standouts.length).toBeLessThanOrEqual(2);
    expect(model.concerns.length).toBeLessThanOrEqual(1);
    expect(model.concerns.every((item) => item.source === 'Resume Analysis')).toBe(true);
  });

  it('derives the strongest free response only when resume and LinkedIn are both present', () => {
    const model = deriveRecruiterFirstImpression(baseInputs(), 'free');
    expect(model.response.id).toBe('strong_shortlist_potential');
    expect(model.standouts.length).toBeLessThanOrEqual(2);
    expect(model.concerns.length).toBeLessThanOrEqual(1);
    expect(model.standouts.every((item) => item.source)).toBe(true);
    expect(model.lockedTeasers).toHaveLength(2);
  });

  it('uses paid depth for Pro-compatible tiers and includes paid source signals without locked rows', () => {
    const model = deriveRecruiterFirstImpression(baseInputs(), 'pro');
    expect(model.tierDepth).toBe('paid');
    expect(model.signalScores.some((signal) => signal.key === 'careerCompass' && signal.available)).toBe(true);
    expect(model.signalScores.some((signal) => signal.key === 'recruitingLens' && signal.available)).toBe(true);
    expect(model.standouts.length).toBeLessThanOrEqual(3);
    expect(model.concerns.length).toBeLessThanOrEqual(2);
    expect(model.lockedTeasers).toHaveLength(0);
  });

  it('does not throw on malformed historical rows and still uses valid remaining sources', () => {
    const inputs = normalizeDashboardIntelligenceInputs({
      resume: { ...resumeRow, grading_data: { strengths: 'bad-shape', priorityImprovements: null } },
      linkedinGrade: { id: 'bad', overall_score: Number.NaN, grading_data: { sectionBreakdown: 'bad' }, created_at: 'not-a-date' },
    });
    expect(() => deriveRecruiterFirstImpression(inputs, 'elite')).not.toThrow();
    const model = deriveRecruiterFirstImpression(inputs, 'elite');
    expect(model.signalScores.some((signal) => signal.key === 'resume' && signal.available)).toBe(true);
  });

  it('is deterministic for identical inputs and targets the weakest weighted signal', () => {
    const first = deriveRecruiterFirstImpression(baseInputs(), 'elite');
    const second = deriveRecruiterFirstImpression(baseInputs(), 'elite');
    expect(second).toEqual(first);
    expect(first.cta.label).toBe('Strengthen My Positioning');
    expect(first.cta.targetSignal).toBe('savedJobs');
  });
});

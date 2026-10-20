import { describe, expect, it } from 'vitest';

import { normalizeDashboardIntelligenceInputs } from './inputs';
import { deriveProfileAlignment } from './profile-alignment';

const resume = {
  id: 'r1',
  file_name: 'resume.pdf',
  created_at: '2026-04-01T00:00:00Z',
  analyzed_at: '2026-04-02T00:00:00Z',
  overall_score: 78,
  grading_data: {
    strengths: ['Led product roadmap for AI platform growth.'],
    priorityImprovements: ['Add more executive stakeholder proof.'],
    suggestedTargetRoles: ['Product Manager', 'AI Product Lead'],
    recommendedKeywords: ['roadmap', 'experimentation', 'analytics'],
  },
};

const linkedin = {
  id: 'l1',
  overall_score: 72,
  created_at: '2026-06-10T00:00:00Z',
  grading_data: {
    keyStrengths: ['Headline emphasizes AI product leadership and roadmap ownership.'],
    topFixes: [{ title: 'Add metrics to featured section' }],
    sectionBreakdown: [
      { name: 'Experience', strengths: ['AI product leadership'], weaknesses: [] },
      { name: 'Skills', strengths: ['roadmap analytics experimentation'], weaknesses: [] },
    ],
  },
};

const paidHistory = [
  {
    id: 'c1',
    analysis_type: 'career_compass',
    created_at: '2026-06-11T00:00:00Z',
    primary_score: 70,
    raw_response: {
      roleReadinessScore: 70,
      roleReadinessBreakdown: { gaps: ['Position the story around one target leadership lane.'] },
    },
  },
  {
    id: 'rl1',
    analysis_type: 'recruiting_lens',
    created_at: '2026-06-12T00:00:00Z',
    primary_score: 68,
    raw_response: {
      keywords: { missing: ['AI governance'] },
      scoreRationale: [{ weaknesses: ['Job language is stronger than profile language.'] }],
    },
  },
];

function inputs() {
  return normalizeDashboardIntelligenceInputs({
    resume,
    linkedinGrade: linkedin,
    savedJobs: [{ role_applied: 'AI Product Lead', company_applied: 'Acme', created_at: '2026-06-12T00:00:00Z' }],
    analysisHistory: paidHistory,
  });
}

describe('deriveProfileAlignment', () => {
  it('returns no score and exact copy when LinkedIn is missing', () => {
    const model = deriveProfileAlignment(normalizeDashboardIntelligenceInputs({ resume }), 'free');
    expect(model.status).toBe('missing');
    expect(model.overallScore).toBeNull();
    expect(model.emptyState?.body).toBe('Add your LinkedIn profile to compare your professional positioning.');
  });

  it('returns no score and exact copy when resume is missing', () => {
    const model = deriveProfileAlignment(normalizeDashboardIntelligenceInputs({ linkedinGrade: linkedin }), 'free');
    expect(model.status).toBe('missing');
    expect(model.overallScore).toBeNull();
    expect(model.emptyState?.body).toBe('Upload your resume to compare your experience, skills, and evidence.');
  });

  it('returns free alignment score, basic categories, and at most two source-backed actions', () => {
    const model = deriveProfileAlignment(inputs(), 'free');
    expect(model.status).toBe('ready');
    expect(model.overallScore).toEqual(expect.any(Number));
    expect(model.categories.map((item) => item.id)).toEqual(['experience_consistency', 'positioning_alignment']);
    expect(model.actions.length).toBeLessThanOrEqual(2);
    expect(model.actions.every((item) => item.source)).toBe(true);
    expect(model.lockedTeasers).toHaveLength(2);
  });

  it('treats Pro-compatible tiers as paid depth with all four categories and at most three actions', () => {
    const model = deriveProfileAlignment(inputs(), 'pro');
    expect(model.tierDepth).toBe('paid');
    expect(model.categories).toHaveLength(4);
    expect(model.actions.length).toBeLessThanOrEqual(3);
    expect(model.lockedTeasers).toHaveLength(0);
  });

  it('surfaces source desync notes without blocking the score', () => {
    const model = deriveProfileAlignment(inputs(), 'elite');
    expect(model.status).toBe('ready');
    expect(model.stalenessNotes.some((note) => /different dates/i.test(note))).toBe(true);
  });

  it('does not throw on malformed optional rows and remains deterministic', () => {
    const malformed = normalizeDashboardIntelligenceInputs({
      resume: { ...resume, grading_data: { recommendedKeywords: 'bad' } },
      linkedinGrade: { ...linkedin, grading_data: { sectionBreakdown: 'bad' } },
      analysisHistory: [{ analysis_type: 'career_compass', raw_response: 'bad', primary_score: Number.NaN }],
    });
    expect(() => deriveProfileAlignment(malformed, 'elite')).not.toThrow();
    expect(deriveProfileAlignment(malformed, 'elite')).toEqual(deriveProfileAlignment(malformed, 'elite'));
  });
});

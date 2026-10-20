// Phase 22 Plan 04 — AnalysisHistory.tsx source-grep tests (SC-6, SC-7)

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const source = readFileSync(resolve(__dirname, 'AnalysisHistory.tsx'), 'utf-8');

describe('SC-6 (22-04): AnalysisHistory generalized findIdForEntry proximity matcher', () => {
  it('declares findIdForEntry function (generalized, not table-specific)', () => {
    expect(source).toContain('findIdForEntry');
  });

  it('uses findIdForEntry in at least 5 call sites (declaration + 4 feature types)', () => {
    const matches = source.match(/findIdForEntry/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });
});

describe('SC-6 (22-04): AnalysisHistory per-feature query hooks', () => {
  it('has userLinkedinGrades query hook', () => {
    expect(source).toContain("userLinkedinGrades");
    expect(source).toContain("from('linkedin_grades')");
  });

  it('has userCareerCompassResults query hook', () => {
    expect(source).toContain("userCareerCompassResults");
    expect(source).toMatch(/from\('analysis_results'\)/);
  });

  it('has userRecruitingLensResults query hook', () => {
    expect(source).toContain("userRecruitingLensResults");
  });

  it('has userInterviewQuizzes query hook', () => {
    expect(source).toContain("userInterviewQuizzes");
    expect(source).toContain("from('interview_quizzes')");
  });
});

describe('SC-6 (22-04): AnalysisHistory route dispatcher produces ?id= routes', () => {
  it('routes linkedin_grading with ?id= param', () => {
    expect(source).toContain('/linkedin-grader?id=');
  });

  it('routes career_compass with ?id= param', () => {
    expect(source).toContain('/career-compass?id=');
  });

  it('routes recruiting_lens with ?id= param (or silent-degrade to base route)', () => {
    expect(source).toContain('/recruiting-lens?id=');
  });

  it('routes interview_prep with ?id= param', () => {
    expect(source).toContain('/interview-prep?id=');
  });

  it('preserves /results/{id} routing for resume_analysis', () => {
    expect(source).toContain('/results/');
  });
});

describe('SC-7 (22-04): AnalysisHistory empty state preserved (D-23)', () => {
  it('No activity yet empty state text unchanged', () => {
    expect(source).toContain('No activity yet');
  });
});

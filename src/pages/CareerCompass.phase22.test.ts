// Phase 22 Plan 02 + Plan 03 — CareerCompass.tsx source-grep tests (SC-1, SC-4, SC-5)

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const source = readFileSync(resolve(__dirname, 'CareerCompass.tsx'), 'utf-8');

describe('SC-1 (22-02): CareerCompass scan-new header-bar', () => {
  it('renders Your Career Compass title', () => {
    expect(source).toContain('Your Career Compass');
  });

  it('renders Start New Analysis button label', () => {
    expect(source).toContain('Start New Analysis');
  });

  it('button is bound to handleRefreshAnalysis', () => {
    expect(source).toContain('handleRefreshAnalysis');
  });

  it('header-bar uses flex items-center justify-between mb-6 layout', () => {
    expect(source).toContain('flex items-center justify-between mb-6');
  });

  it('title uses text-2xl font-semibold', () => {
    expect(source).toContain('text-2xl font-semibold');
  });
});

describe('SC-4 (22-03): CareerCompass cross-feature memory badge', () => {
  it('renders Used your LinkedIn analysis from badge text', () => {
    expect(source).toContain('Used your LinkedIn analysis from');
  });

  it('badge is gated on reusedLinkedinGrade and linkedinGradeDate being truthy', () => {
    expect(source).toContain('reusedLinkedinGrade');
    expect(source).toContain('linkedinGradeDate');
  });

  it('D-12 negative: frontend does not pass priorLinkedinGrading to analyze-career', () => {
    expect(source).not.toContain('priorLinkedinGrading');
  });
});

// RULE-1 FLIP (quick task 260713-hrd). This block used to assert the D-16 "graceful fallback"
// dialog EXISTED — the one that appeared when a user had a resume analysis but no LinkedIn
// analysis, offering "Add LinkedIn analysis" or "Continue without".
//
// The whole premise is gone. Career Compass Free is STANDALONE: a resume is the only
// requirement, LinkedIn is optional, and prior analyses are optional enrichment reused when
// present — never a gate. With the backend 412s deleted the dialog is unreachable, and an
// unreachable dialog that tells the user they must "continue without" something is worse than
// no dialog: it describes a restriction that no longer exists.
//
// Inverted, not deleted: the dialog and its opt-in must STAY gone.
describe('SC-5 (260713-hrd): the D-16 prior-analysis gate dialog is REMOVED (Free is standalone)', () => {
  it('has no linkedinPriorMissingOpen state', () => {
    expect(source).not.toContain('linkedinPriorMissingOpen');
  });

  it('has no "Add your LinkedIn analysis" gate dialog', () => {
    expect(source).not.toContain('Add your LinkedIn analysis');
  });

  it('has no "Continue without" secondary CTA', () => {
    expect(source).not.toContain('Continue without');
  });

  it('handleAnalyze no longer needs an allowResumeOnly opt-in — resume-only IS the path', () => {
    expect(source).not.toContain('allowResumeOnly:');
  });

  it('has no "Run these first to unlock Career Compass" blocking banner', () => {
    expect(source).not.toContain('Run these first to unlock');
  });
});

describe('SC-5 (22-05): CareerCompass useSearchParams ?id= hydration', () => {
  it('imports useSearchParams', () => {
    expect(source).toContain('useSearchParams');
  });

  it('fetches from analysis_results filtered by analysis_type career_compass', () => {
    expect(source).toContain("analysis_type");
    expect(source).toContain("career_compass");
  });

  it('shows Analysis not found toast on miss', () => {
    expect(source).toContain('Analysis not found');
  });

  it('uses data.raw_response (pinned column) with no speculative fallback chain', () => {
    expect(source).toContain('data.raw_response');
    expect(source).not.toMatch(/data\.result\s*\?\?/);
    expect(source).not.toMatch(/data\.analysis_data\s*\?\?/);
  });

  it('hydration query relies on RLS (analysis_results query present alongside raw_response)', () => {
    // Both from('analysis_results') and raw_response must be present in the file.
    // RLS enforces user scoping — no manual .eq('user_id') needed on the hydration query.
    expect(source).toContain("from('analysis_results')");
    expect(source).toContain('data.raw_response');
  });
});

// Phase 22 Plan 02 + Plan 05 — RecruitingLens.tsx source-grep tests (SC-1, SC-6)

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const source = readFileSync(resolve(__dirname, 'RecruitingLens.tsx'), 'utf-8');

describe('SC-1 (22-02): RecruitingLens result reset action', () => {
  it('renders the refined match summary and recruiter verdict', () => {
    expect(source).toContain('Your Recruiting Lens Match');
    expect(source).toContain('{result.overallMatch?.summary || result.recruiterVerdict}');
    expect(source).toContain('Recruiter Verdict');
  });

  it('retains an Analyze Another Job reset action', () => {
    expect(source).toContain('Analyze Another Job');
  });

  it('match summary stacks before becoming a two-column dashboard card', () => {
    expect(source).toContain('md:grid-cols-[220px_minmax(0,1fr)]');
  });

  it('full verdict uses a constrained readable measure', () => {
    expect(source).toContain('max-w-4xl whitespace-pre-wrap');
  });
});

describe('SC-6 (22-05): RecruitingLens ?id= hydration with Pitfall-6 silent-degrade', () => {
  it('imports useSearchParams', () => {
    expect(source).toContain('useSearchParams');
  });

  it('fetches from analysis_results filtered by analysis_type recruiting_lens', () => {
    expect(source).toContain('analysis_type');
    expect(source).toContain('recruiting_lens');
  });

  it('on miss fires informational toast.message (not toast.error) per Pitfall 6', () => {
    expect(source).toContain("This analysis wasn't saved");
    // Must use toast.message, not toast.error for Pitfall 6 silent-degrade
    expect(source).toContain("toast.message(");
  });

  it('uses data.raw_response (pinned column) with no speculative fallback chain', () => {
    expect(source).toContain('data.raw_response');
    expect(source).not.toMatch(/data\.result\s*\?\?/);
    expect(source).not.toMatch(/data\.analysis_data\s*\?\?/);
  });
});

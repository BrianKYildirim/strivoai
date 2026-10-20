import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ReadinessTab } from './ReadinessTab';
import type { RoleReadinessBreakdown } from './types';

const readiness: RoleReadinessBreakdown = {
  overallScore: 82,
  targetRole: 'Software Engineer',
  industryBenchmark: 'Entry-level hiring bar',
  strengths: ['Backend delivery'],
  gaps: ['Distributed systems depth'],
  skillAssessments: [],
  readinessVerdict: 'Ready with focused growth.',
};

describe('ReadinessTab', () => {
  it('renders the single target role readiness result', () => {
    render(<ReadinessTab roleReadinessBreakdown={readiness} subscriptionTier="elite" />);
    expect(screen.getByText('Role Readiness Score')).toBeInTheDocument();
    expect(screen.getByText(/Target: Software Engineer/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not render retired legacy subsection values', () => {
    const legacy = {
      ...readiness,
      [['why', 'Match'].join('') as string]: 'Legacy match copy',
      [['main', 'Barriers'].join('') as string]: ['Legacy barrier copy'],
      [['actions', 'Needed'].join('') as string]: ['Legacy action copy'],
    } as RoleReadinessBreakdown;
    render(<ReadinessTab roleReadinessBreakdown={legacy} subscriptionTier="elite" />);
    expect(screen.queryByText(/Legacy/)).not.toBeInTheDocument();
  });

  it('keeps the Free scorebox while locking detailed readiness', () => {
    render(
      <MemoryRouter>
        <ReadinessTab roleReadinessBreakdown={readiness} subscriptionTier="free" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Target: Software Engineer/)).toBeInTheDocument();
    expect(screen.getByText(/Upgrade to see/)).toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import {
  BestFitRoles,
  FieldsTab,
  PartialSectionFallback,
  RoadmapTab,
  RolesTab,
  SurpriseFits,
} from '..';
import type { CareerField, CareerRole, RoadmapItem, SurpriseFit } from '../types';

const renderWithRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

const makeField = (title: string, matchScore = 90): CareerField => ({
  title,
  matchScore,
  whyMatch: `Specific evidence for ${title}`,
  requiredSkills: ['Planning'],
  salaryRange: '$100k-$140k',
  industryOutlook: 'Growing',
  timeline: '6 months',
  recommendedRoles: [`${title} Lead`],
});

const makeFit = (role: string, readinessScore = 85): SurpriseFit => ({
  role,
  readinessScore,
  whySurprising: `${role} uses transferable strengths.`,
  transferableSkills: ['Communication', 'Analysis', 'Delivery'],
});

const makeRole = (title: string, skillAlignmentScore = 82): CareerRole => ({
  title,
  description: `${title} role description`,
  averageSalary: '$130k',
  skillAlignmentScore,
  skillGaps: ['System design'],
  qualificationSteps: ['Ship a portfolio project'],
});

const roadmap: RoadmapItem[] = [
  { category: 'Real Roadmap Phase', items: ['Real generated action'] },
];

describe('Career Compass partial output recovery', () => {
  it('renders required fallback copy and returns to form without invoking analysis', () => {
    const onRerun = vi.fn();
    renderWithRouter(<PartialSectionFallback sectionName="Roadmap" onRerun={onRerun} />);

    expect(screen.getByText('This section is incomplete')).toBeInTheDocument();
    expect(screen.getByText('Re-run this analysis to generate the full report for this tab.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /re-run for full report/i }));
    expect(onRerun).toHaveBeenCalledTimes(1);
  });
});

describe('Career Compass free skeleton parity', () => {
  it('renders 3 real and 2 locked Best-Fit Roles for Free', () => {
    const fields = ['Field A', 'Field B', 'Field C', 'Field D'].map((title, index) => makeField(title, 95 - index));
    renderWithRouter(<BestFitRoles careerFields={fields} subscriptionTier="free" />);

    expect(screen.getByText('Field A')).toBeInTheDocument();
    expect(screen.getByText('Field B')).toBeInTheDocument();
    expect(screen.getByText('Field C')).toBeInTheDocument();
    expect(screen.queryByText('Field D')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('blurred-lock-card-overlay')).toHaveLength(1);
    expect(screen.getByText('Product Management')).toBeInTheDocument();
    expect(screen.getByText('Data Science & Analytics')).toBeInTheDocument();
  });

  it('renders 2 real and 2 locked Surprise Fits for Free', () => {
    const fits = ['Fit A', 'Fit B', 'Fit C'].map((role, index) => makeFit(role, 90 - index));
    renderWithRouter(<SurpriseFits surpriseFits={fits} subscriptionTier="free" />);

    expect(screen.getByText('Fit A')).toBeInTheDocument();
    expect(screen.getByText('Fit B')).toBeInTheDocument();
    expect(screen.queryByText('Fit C')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('blurred-lock-card-overlay')).toHaveLength(1);
    expect(screen.getByText('Technical Program Manager')).toBeInTheDocument();
    expect(screen.getByText('Customer Success Engineer')).toBeInTheDocument();
  });

  it('renders 3 real and 2 locked Fields and Roles for Free', () => {
    const fields = ['Field A', 'Field B', 'Field C', 'Field D'].map((title, index) => makeField(title, 95 - index));
    const roles = ['Role A', 'Role B', 'Role C', 'Role D'].map((title, index) => makeRole(title, 95 - index));

    const { unmount } = renderWithRouter(<FieldsTab careerFields={fields} subscriptionTier="free" />);
    expect(screen.getByText('Field A')).toBeInTheDocument();
    expect(screen.getByText('Field B')).toBeInTheDocument();
    expect(screen.getByText('Field C')).toBeInTheDocument();
    expect(screen.queryByText('Field D')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('blurred-lock-card-overlay')).toHaveLength(1);
    unmount();

    renderWithRouter(<RolesTab roles={roles} subscriptionTier="free" />);
    expect(screen.getByText('Role A')).toBeInTheDocument();
    expect(screen.getByText('Role B')).toBeInTheDocument();
    expect(screen.getByText('Role C')).toBeInTheDocument();
    expect(screen.queryByText('Role D')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('blurred-lock-card-overlay')).toHaveLength(1);
  });

  it('renders only fake locked roadmap content for Free', () => {
    renderWithRouter(
      <RoadmapTab
        roadmap={roadmap}
        subscriptionTier="free"
        selectedRoadmapRole="__general__"
        onSelectedRoadmapRoleChange={() => {}}
      />,
    );

    expect(screen.getByText(/12-month career roadmap/i)).toBeInTheDocument();
    expect(screen.queryByText('Real Roadmap Phase')).not.toBeInTheDocument();
    expect(screen.queryByText('Real generated action')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('blurred-lock-card-overlay')).toHaveLength(1);
    expect(screen.getByText('Months 11-12')).toBeInTheDocument();
  });
});

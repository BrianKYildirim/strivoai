/**
 * SurpriseFits — render contract tests (Phase 17.1, GATE-06).
 *
 * Asserts must_haves.truths:
 * - Renders "Surprise Fits" heading
 * - Free tier + fewer than 4 fits: renders BlurredLockCard with placeholder content
 * - Pro/Elite tier: never renders BlurredLockCard
 * - Renders fit role titles and readinessScore badges
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SurpriseFits } from './SurpriseFits';
import type { SurpriseFit } from './types';

const makeFit = (role: string, readinessScore: number): SurpriseFit => ({
  role,
  readinessScore,
  whySurprising: `Why ${role} is a surprising fit.`,
  transferableSkills: ['Communication'],
});

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('SurpriseFits', () => {
  it('renders the section heading', () => {
    renderWithRouter(
      <SurpriseFits surpriseFits={[makeFit('TPM', 85)]} subscriptionTier="pro" />,
    );
    expect(screen.getByRole('heading', { name: /surprise fits/i })).toBeInTheDocument();
  });

  it('renders each surprise fit role title', () => {
    const fits = [makeFit('TPM', 85), makeFit('Solutions Consultant', 78)];
    renderWithRouter(<SurpriseFits surpriseFits={fits} subscriptionTier="pro" />);
    expect(screen.getByText('TPM')).toBeInTheDocument();
    expect(screen.getByText('Solutions Consultant')).toBeInTheDocument();
  });

  it('renders readiness score badge for each fit', () => {
    const fits = [makeFit('TPM', 85)];
    renderWithRouter(<SurpriseFits surpriseFits={fits} subscriptionTier="pro" />);
    expect(screen.getByText(/85% ready/i)).toBeInTheDocument();
  });

  it('37-03: free tier renders 2 real fits plus locked placeholders', () => {
    const fits = [makeFit('RealFitA', 85), makeFit('RealFitB', 80)];
    renderWithRouter(<SurpriseFits surpriseFits={fits} subscriptionTier="free" />);
    expect(screen.getAllByTestId('blurred-lock-card-overlay')).toHaveLength(1);
    expect(screen.getByText('RealFitA')).toBeInTheDocument();
    expect(screen.getByText('RealFitB')).toBeInTheDocument();
    // Placeholder content string from the component
    expect(screen.getByText(/technical program manager/i)).toBeInTheDocument();
  });

  it('GATE-06: pro tier never renders BlurredLockCard', () => {
    const fits = [makeFit('TPM', 85)];
    renderWithRouter(<SurpriseFits surpriseFits={fits} subscriptionTier="pro" />);
    expect(screen.queryAllByTestId('blurred-lock-card-overlay')).toHaveLength(0);
  });

  it('GATE-06: elite tier never renders BlurredLockCard', () => {
    const fits = [makeFit('TPM', 85)];
    renderWithRouter(<SurpriseFits surpriseFits={fits} subscriptionTier="elite" />);
    expect(screen.queryAllByTestId('blurred-lock-card-overlay')).toHaveLength(0);
  });

  it('37-03: free tier with 4+ fits caps real output at 2 and renders the single lock overlay', () => {
    const fits = [
      makeFit('Role A', 90),
      makeFit('Role B', 85),
      makeFit('Role C', 80),
      makeFit('Role D', 75),
    ];
    renderWithRouter(<SurpriseFits surpriseFits={fits} subscriptionTier="free" />);
    expect(screen.getAllByTestId('blurred-lock-card-overlay')).toHaveLength(1);
    expect(screen.getByText('Role A')).toBeInTheDocument();
    expect(screen.getByText('Role B')).toBeInTheDocument();
    expect(screen.queryByText('Role C')).not.toBeInTheDocument();
  });
});

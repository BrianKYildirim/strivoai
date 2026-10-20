/**
 * FieldsTab — render contract tests (Phase 17.1, GATE-06).
 *
 * Asserts must_haves.truths:
 * - Free tier + < 5 fields: fills locked slots via BlurredLockCard
 * - Pro/Elite tier: no BlurredLockCard
 * - Match-score conditional heading:
 *     >= 95 -> "Why This Is An Excellent Match:"
 *     >= 80 -> "Why This Is A Strong Match:"
 *     else  -> "Why This Is Worth Considering:"
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FieldsTab } from './FieldsTab';
import type { CareerField } from './types';

const makeField = (title: string, matchScore: number, whyMatch = 'Match reason.'): CareerField => ({
  title,
  matchScore,
  whyMatch,
  requiredSkills: ['React'],
  salaryRange: '$120k',
  industryOutlook: 'Strong',
  timeline: '6 months',
  recommendedRoles: ['Engineer'],
});

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('FieldsTab', () => {
  it('renders a card per career field (pro/elite)', () => {
    renderWithRouter(
      <FieldsTab
        careerFields={[makeField('Alpha Field', 90), makeField('Beta Field', 70)]}
        subscriptionTier="pro"
      />,
    );
    expect(screen.getByText('Alpha Field')).toBeInTheDocument();
    expect(screen.getByText('Beta Field')).toBeInTheDocument();
  });

  it('renders "Why This Is An Excellent Match:" for matchScore >= 95', () => {
    renderWithRouter(
      <FieldsTab careerFields={[makeField('Top Field', 96)]} subscriptionTier="pro" />,
    );
    expect(screen.getByText(/why this is an excellent match/i)).toBeInTheDocument();
  });

  it('renders "Why This Is A Strong Match:" for 80 <= matchScore < 95', () => {
    renderWithRouter(
      <FieldsTab careerFields={[makeField('Strong Field', 85)]} subscriptionTier="pro" />,
    );
    expect(screen.getByText(/why this is a strong match/i)).toBeInTheDocument();
  });

  it('renders "Why This Is Worth Considering:" for matchScore < 80', () => {
    renderWithRouter(
      <FieldsTab careerFields={[makeField('Edge Field', 72)]} subscriptionTier="pro" />,
    );
    expect(screen.getByText(/why this is worth considering/i)).toBeInTheDocument();
  });

  it('37-03: free tier renders exactly 3 visible fields + 1 BlurredLockCard overlay', () => {
    renderWithRouter(
      <FieldsTab
        careerFields={[makeField('Alpha', 90), makeField('Beta', 85), makeField('Gamma', 80)]}
        subscriptionTier="free"
      />,
    );
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.getAllByTestId('blurred-lock-card-overlay')).toHaveLength(1);
  });

  it('GATE-06: pro tier does not render BlurredLockCard', () => {
    renderWithRouter(
      <FieldsTab
        careerFields={[makeField('Alpha', 90)]}
        subscriptionTier="pro"
      />,
    );
    expect(screen.queryAllByTestId('blurred-lock-card-overlay')).toHaveLength(0);
  });

  it('GATE-06: elite tier does not render BlurredLockCard', () => {
    renderWithRouter(
      <FieldsTab
        careerFields={[makeField('Alpha', 90)]}
        subscriptionTier="elite"
      />,
    );
    expect(screen.queryAllByTestId('blurred-lock-card-overlay')).toHaveLength(0);
  });

  it('35x: free tier always renders the lock overlay even with many fields', () => {
    const fields = Array.from({ length: 5 }, (_, i) => makeField(`Field${i}`, 90 - i));
    renderWithRouter(<FieldsTab careerFields={fields} subscriptionTier="free" />);
    expect(screen.getAllByTestId('blurred-lock-card-overlay')).toHaveLength(1);
  });
});

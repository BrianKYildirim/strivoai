/**
 * BestFitRoles — render contract tests (Phase 17.1, GATE-06).
 *
 * Asserts must_haves.truths:
 * - Renders "Best-Fit Role Families" section
 * - Filters careerFields to matchScore >= 75, sorts descending, shows top 5
 * - Free tier + fewer than 5 fields: fills remaining slots with BlurredLockCard
 * - Pro/Elite tier: never renders BlurredLockCard regardless of count
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BestFitRoles } from './BestFitRoles';
import type { CareerField } from './types';

const makeField = (title: string, matchScore: number): CareerField => ({
  title,
  matchScore,
  whyMatch: `Match for ${title}`,
  requiredSkills: [],
  salaryRange: '',
  industryOutlook: '',
  timeline: '',
  recommendedRoles: [],
});

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('BestFitRoles', () => {
  it('renders the section heading', () => {
    renderWithRouter(
      <BestFitRoles careerFields={[makeField('Engineering', 90)]} subscriptionTier="pro" />,
    );
    expect(screen.getByRole('heading', { name: /best-fit role families/i })).toBeInTheDocument();
  });

  it('filters out fields with matchScore < 75', () => {
    const fields = [
      makeField('Alpha', 90),
      makeField('Beta', 60), // should be filtered out
      makeField('Gamma', 80),
    ];
    renderWithRouter(<BestFitRoles careerFields={fields} subscriptionTier="pro" />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });

  it('caps the rendered list at 5 entries', () => {
    const fields = Array.from({ length: 8 }, (_, i) =>
      makeField(`Field${i}`, 90 - i),
    );
    renderWithRouter(<BestFitRoles careerFields={fields} subscriptionTier="pro" />);
    // Top 5 by score: Field0..Field4
    ['Field0', 'Field1', 'Field2', 'Field3', 'Field4'].forEach((t) =>
      expect(screen.getByText(t)).toBeInTheDocument(),
    );
    // Filtered out: Field5..Field7 (still score >= 75 but capped by slice)
    expect(screen.queryByText('Field5')).not.toBeInTheDocument();
    expect(screen.queryByText('Field6')).not.toBeInTheDocument();
    expect(screen.queryByText('Field7')).not.toBeInTheDocument();
  });

  it('sorts fields by matchScore descending', () => {
    const fields = [
      makeField('Middle', 82),
      makeField('Highest', 95),
      makeField('Lowest', 76),
    ];
    renderWithRouter(<BestFitRoles careerFields={fields} subscriptionTier="pro" />);
    const body = document.body.textContent ?? '';
    expect(body.indexOf('Highest')).toBeLessThan(body.indexOf('Middle'));
    expect(body.indexOf('Middle')).toBeLessThan(body.indexOf('Lowest'));
  });

  it('37-03: free tier renders 3 visible roles + 1 BlurredLockCard overlay for locked placeholders', () => {
    const fields = [makeField('Alpha', 90), makeField('Beta', 85), makeField('Gamma', 80)];
    renderWithRouter(<BestFitRoles careerFields={fields} subscriptionTier="free" />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    // Exactly ONE lock overlay for the rest
    const lockedOverlays = screen.getAllByTestId('blurred-lock-card-overlay');
    expect(lockedOverlays).toHaveLength(1);
  });

  it('GATE-06: pro tier never renders BlurredLockCard even with fewer than 5 fields', () => {
    const fields = [makeField('Alpha', 90)];
    renderWithRouter(<BestFitRoles careerFields={fields} subscriptionTier="pro" />);
    expect(screen.queryAllByTestId('blurred-lock-card-overlay')).toHaveLength(0);
  });

  it('GATE-06: elite tier never renders BlurredLockCard', () => {
    const fields = [makeField('Alpha', 90)];
    renderWithRouter(<BestFitRoles careerFields={fields} subscriptionTier="elite" />);
    expect(screen.queryAllByTestId('blurred-lock-card-overlay')).toHaveLength(0);
  });
});

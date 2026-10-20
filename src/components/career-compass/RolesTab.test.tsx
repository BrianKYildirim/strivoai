/**
 * RolesTab — render contract tests (Phase 17.1, GATE-05).
 *
 * Asserts must_haves.truths:
 * - Free tier: each role renders a BlurredLockCard with "Skill Gap Analysis" heading
 *   (the implementation uses BlurredLockCard instead of the deprecated LockedSection)
 * - Pro/Elite tier: renders actual skill gaps and qualification steps
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RolesTab } from './RolesTab';
import type { CareerRole } from './types';

const makeRole = (overrides: Partial<CareerRole> = {}): CareerRole => ({
  title: 'Software Engineer',
  description: 'Builds software.',
  averageSalary: '$130k',
  skillAlignmentScore: 82,
  skillGaps: ['System Design', 'Leadership', 'Architecture'],
  qualificationSteps: ['Complete portfolio', 'Ship a project'],
  ...overrides,
});

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('RolesTab', () => {
  it('renders a card per role', () => {
    renderWithRouter(
      <RolesTab
        roles={[
          makeRole({ title: 'Role A' }),
          makeRole({ title: 'Role B' }),
        ]}
        subscriptionTier="pro"
      />,
    );
    expect(screen.getByText('Role A')).toBeInTheDocument();
    expect(screen.getByText('Role B')).toBeInTheDocument();
  });

  it('37-03: free tier renders 3 visible roles + 1 BlurredLockCard overlay for locked placeholders', () => {
    renderWithRouter(
      <RolesTab
        roles={[
          makeRole({ title: 'Role A' }),
          makeRole({ title: 'Role B' }),
          makeRole({ title: 'Role C' }),
        ]}
        subscriptionTier="free"
      />,
    );
    expect(screen.getByText('Role A')).toBeInTheDocument();
    expect(screen.getByText('Role B')).toBeInTheDocument();
    expect(screen.getByText('Role C')).toBeInTheDocument();
    expect(screen.getAllByTestId('blurred-lock-card-overlay')).toHaveLength(1);
  });

  it('35x: free tier does NOT render actual skill gap entries for hidden roles', () => {
    renderWithRouter(
      <RolesTab
        roles={[makeRole({ skillGaps: ['RealGapAlpha', 'RealGapBeta'] })]}
        subscriptionTier="free"
      />,
    );
    // Single visible role shows the role itself but gates skill gap details to pro/elite
    expect(screen.queryByText('RealGapAlpha')).not.toBeInTheDocument();
    expect(screen.queryByText('RealGapBeta')).not.toBeInTheDocument();
  });

  it('GATE-05: pro tier renders real skill gaps (not lock overlay)', () => {
    renderWithRouter(
      <RolesTab
        roles={[makeRole({ skillGaps: ['RealGapAlpha', 'RealGapBeta'] })]}
        subscriptionTier="pro"
      />,
    );
    expect(screen.getByText(/realgapalpha/i)).toBeInTheDocument();
    expect(screen.getByText(/realgapbeta/i)).toBeInTheDocument();
    expect(screen.queryAllByTestId('blurred-lock-card-overlay')).toHaveLength(0);
  });

  it('GATE-05: pro tier renders qualification steps', () => {
    renderWithRouter(
      <RolesTab
        roles={[makeRole({ qualificationSteps: ['StepAlphaUnique'] })]}
        subscriptionTier="pro"
      />,
    );
    expect(screen.getByText(/stepalphaunique/i)).toBeInTheDocument();
  });

  it('GATE-05: elite tier renders real skill gaps', () => {
    renderWithRouter(
      <RolesTab
        roles={[makeRole({ skillGaps: ['RealGapElite'] })]}
        subscriptionTier="elite"
      />,
    );
    expect(screen.getByText(/realgapelite/i)).toBeInTheDocument();
    expect(screen.queryAllByTestId('blurred-lock-card-overlay')).toHaveLength(0);
  });

  it('renders "Exceptional Fit" callout for roles with skillAlignmentScore >= 95', () => {
    renderWithRouter(
      <RolesTab
        roles={[makeRole({ title: 'Perfect Fit Role', skillAlignmentScore: 97 })]}
        subscriptionTier="pro"
      />,
    );
    expect(screen.getByText(/exceptional fit/i)).toBeInTheDocument();
  });
});

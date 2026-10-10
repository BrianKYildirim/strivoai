/**
 * EliteFeatureGate — render contract tests (GATE-08).
 *
 * These tests assert the PRESENTATION layer. Server-side tier enforcement
 * (field omission in API responses) is tested separately by Plan 07
 * tier-validation.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Star } from 'lucide-react';
import { EliteFeatureGate } from '@/components/EliteFeatureGate';

describe('EliteFeatureGate', () => {
  const renderGate = (userTier: 'free' | 'pro' | 'elite') =>
    render(
      <MemoryRouter>
        <EliteFeatureGate
          userTier={userTier}
          featureName="Test Feature"
          featureIcon={<Star />}
        >
          <div>SECRET_ELITE_CONTENT</div>
        </EliteFeatureGate>
      </MemoryRouter>
    );

  it('GATE-08: legacy Pro user is normalized to Elite and sees unlocked state', () => {
    renderGate('pro');
    expect(screen.getByTestId('elite-feature-gate-unlocked')).toBeInTheDocument();
    expect(screen.getByText('SECRET_ELITE_CONTENT')).toBeInTheDocument();
  });

  it('GATE-08: Elite user sees unlocked state with children rendered', () => {
    renderGate('elite');
    expect(screen.getByTestId('elite-feature-gate-unlocked')).toBeInTheDocument();
    expect(screen.getByText('SECRET_ELITE_CONTENT')).toBeInTheDocument();
  });

  it('GATE-08: Free user sees locked state', () => {
    renderGate('free');
    expect(screen.getByTestId('elite-feature-gate-locked')).toBeInTheDocument();
    expect(screen.queryByText('SECRET_ELITE_CONTENT')).toBeNull();
    expect(screen.getByText('Upgrade to Elite')).toBeInTheDocument();
  });

  it('GATE-08: locked state shows ELITE EXCLUSIVE badge', () => {
    renderGate('free');
    expect(screen.getByText('ELITE EXCLUSIVE')).toBeInTheDocument();
  });

  it('GATE-08: locked state shows the feature name', () => {
    renderGate('free');
    expect(screen.getByText('Test Feature')).toBeInTheDocument();
  });
});

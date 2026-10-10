/**
 * UpgradeComparisonBanner — tier-conditional banner contract (UX-06).
 *
 * Asserts:
 * - Elite users never see an upgrade banner
 * - Free users on the 25-pack get the Elite pitch (150 Merits/month for $16.99)
 * - Legacy Pro users are normalized to Elite and never see an upgrade banner
 * - All other (tier, pack) combinations render null
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UpgradeComparisonBanner } from './UpgradeComparisonBanner';

const renderBanner = (userTier: string, packSize: number) =>
  render(
    <MemoryRouter>
      <UpgradeComparisonBanner userTier={userTier} packSize={packSize} />
    </MemoryRouter>,
  );

describe('UpgradeComparisonBanner', () => {
  it('renders nothing for elite users on any pack', () => {
    for (const size of [3, 10, 25, 50]) {
      const { container, unmount } = renderBanner('elite', size);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('Free user + 25-pack → shows Elite pitch with "150 Merits/month for $16.99"', () => {
    renderBanner('free', 25);
    expect(
      screen.getByText(/150 Merits\/month plus the richest AI outputs/i),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /view elite/i });
    expect(link).toHaveAttribute('href', '/pricing');
  });

  it('Legacy Pro user + 50-pack → renders nothing because Pro maps to Elite', () => {
    const { container } = renderBanner('pro', 50);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders null for unrelated (tier, pack) combinations', () => {
    // Free user on a non-25 pack: nothing
    const { container: c1 } = renderBanner('free', 10);
    expect(c1).toBeEmptyDOMElement();

    // Legacy Pro user on a non-50 pack: nothing
    const { container: c2 } = renderBanner('pro', 25);
    expect(c2).toBeEmptyDOMElement();
  });
});

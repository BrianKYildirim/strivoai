/**
 * MeritCostPreview — render contract tests (UX-02, UX-03, UX-04).
 *
 * Asserts:
 * - Normal state shows "Costs X Merits -- Y remaining" with muted styling
 * - Low state (total < 2x cost) renders amber AlertTriangle icon + amber text
 * - Zero state shows "Out of Merits" with Buy Merits + Upgrade Plan CTAs
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useMerits', () => ({
  useMerits: vi.fn(),
}));

import { useMerits } from '@/hooks/useMerits';
import { MeritCostPreview } from './MeritCostPreview';

const useMeritsMock = useMerits as unknown as ReturnType<typeof vi.fn>;

const renderPreview = (cost: number) =>
  render(
    <MemoryRouter>
      <MeritCostPreview featureCost={cost} />
    </MemoryRouter>,
  );

describe('MeritCostPreview', () => {
  it('normal state: renders "Costs X Merits" with muted text', () => {
    useMeritsMock.mockReturnValue({
      total: 50, subscription: 50, shop: 0, resetDate: null,
      isLow: false, isZero: false, isLoading: false,
      canAfford: (c: number) => 50 >= c,
    });
    const { container } = renderPreview(3);
    const p = container.querySelector('p');
    expect(p?.textContent).toMatch(/Costs 3 Merits/);
    expect(p?.className).toMatch(/text-muted-foreground/);
  });

  it('low state: renders AlertTriangle and amber text when total < 2x cost', () => {
    useMeritsMock.mockReturnValue({
      total: 5, subscription: 5, shop: 0, resetDate: null,
      isLow: false, isZero: false, isLoading: false,
      canAfford: (c: number) => 5 >= c,
    });
    const { container } = renderPreview(3); // 5 < 6 (2x cost) → low state
    const p = container.querySelector('p');
    expect(p?.className).toMatch(/text-amber-500/);
    // AlertTriangle is the only svg in this state
    expect(p?.querySelector('svg')).not.toBeNull();
    expect(p?.textContent).toMatch(/Costs 3 Merits/);
  });

  it('zero state: renders "Out of Merits" with Buy Merits and Upgrade Plan CTAs', () => {
    useMeritsMock.mockReturnValue({
      total: 0, subscription: 0, shop: 0, resetDate: null,
      isLow: false, isZero: true, isLoading: false,
      canAfford: () => false,
    });
    renderPreview(3);
    expect(screen.getByText(/out of merits/i)).toBeInTheDocument();
    const buyLink = screen.getByRole('link', { name: /buy merits/i });
    const upgradeLink = screen.getByRole('link', { name: /upgrade plan/i });
    expect(buyLink).toHaveAttribute('href', '/pricing');
    expect(upgradeLink).toHaveAttribute('href', '/pricing');
  });
});

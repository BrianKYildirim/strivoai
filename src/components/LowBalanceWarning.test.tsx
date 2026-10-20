import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const useMeritsMock = vi.fn();
vi.mock('@/hooks/useMerits', () => ({ useMerits: () => useMeritsMock() }));

import { LowBalanceWarning } from './LowBalanceWarning';

function setMerits(opts: {
  total: number;
  tier: 'free' | 'pro' | 'elite';
  isZero?: boolean;
  isLoading?: boolean;
}) {
  useMeritsMock.mockReturnValue({
    total: opts.total,
    subscription: opts.total,
    shop: 0,
    cap: 75,
    tier: opts.tier,
    resetDate: null,
    isLow: false,
    isZero: opts.isZero ?? opts.total <= 0,
    isLoading: opts.isLoading ?? false,
    canAfford: () => true,
  });
}

beforeEach(() => {
  useMeritsMock.mockReset();
});

const renderBanner = () =>
  render(
    <MemoryRouter>
      <LowBalanceWarning />
    </MemoryRouter>,
  );

describe('LowBalanceWarning (UX-03)', () => {
  it('T1: hides when total >= 2x cheapest applicable cost (pro tier)', () => {
    setMerits({ total: 100, tier: 'pro' });
    const { container } = renderBanner();
    expect(container.firstChild).toBeNull();
  });

  it('T2: renders amber banner when total below threshold (pro tier)', () => {
    // pro cheapest = 2 -> threshold = 4
    setMerits({ total: 3, tier: 'pro' });
    renderBanner();
    expect(screen.getByText(/running low/i)).toBeTruthy();
    const heading = screen.getByText(/running low/i);
    expect(heading.parentElement?.className).toMatch(/text-amber-500/);
  });

  it('T3: renders destructive banner when isZero', () => {
    setMerits({ total: 0, tier: 'pro', isZero: true });
    renderBanner();
    const heading = screen.getByText(/out of merits/i);
    expect(heading.parentElement?.className).toMatch(/text-destructive/);
  });

  it('T4: exposes Buy Merits and Upgrade links when rendered', () => {
    setMerits({ total: 0, tier: 'pro', isZero: true });
    renderBanner();
    const buyLink = screen.getByRole('link', { name: /buy merits/i });
    const upgradeLink = screen.getByRole('link', { name: /upgrade/i });
    expect(buyLink.getAttribute('href')).toBe('/pricing');
    expect(upgradeLink.getAttribute('href')).toBe('/pricing');
  });

  it('T5: free-tier excludes locked features (cheapest free = 3, threshold = 6)', () => {
    // total=6: 6 < 6 is false -> null
    setMerits({ total: 6, tier: 'free' });
    const { container, rerender } = renderBanner();
    expect(container.firstChild).toBeNull();

    // total=5: 5 < 6 -> amber
    setMerits({ total: 5, tier: 'free' });
    rerender(
      <MemoryRouter>
        <LowBalanceWarning />
      </MemoryRouter>,
    );
    expect(screen.getByText(/running low/i)).toBeTruthy();
  });

  it('T6: returns null while isLoading', () => {
    setMerits({ total: 0, tier: 'free', isLoading: true });
    const { container } = renderBanner();
    expect(container.firstChild).toBeNull();
  });
});

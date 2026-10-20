/**
 * RunningLowCard — contract tests (Phase 24 Plan 06, SC-9c).
 *
 * T1 isLow false → null (no layout shift for healthy balances)
 * T2 isLow true → "Running low?" heading
 * T3 Body interpolates {subscription} from useMerits
 * T4 Primary "Buy 25 Merits" → navigate('/pricing#packs')
 * T5 Secondary link → navigate('/pricing')
 * T6 isLoading=true → null
 * T7 Price + per-merit read from PACKS_BY_ID.pack_25 (no hardcodes)
 * T8 isZero=true → null (IN-01: yield to Dashboard "Limit Reached" banner)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { PACKS_BY_ID } from '@/config/pricing-config';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return { ...actual, useNavigate: () => navigateMock };
});

const useMeritsMock = vi.fn();
vi.mock('@/hooks/useMerits', () => ({
  useMerits: () => useMeritsMock(),
}));

import { RunningLowCard } from './RunningLowCard';

function setMerits(opts: {
  isLow: boolean;
  isLoading?: boolean;
  subscription?: number;
}) {
  useMeritsMock.mockReturnValue({
    total: opts.subscription ?? 0,
    subscription: opts.subscription ?? 0,
    shop: 0,
    cap: 10,
    tier: 'free',
    resetDate: null,
    isLow: opts.isLow,
    isZero: (opts.subscription ?? 0) <= 0,
    isLoading: opts.isLoading ?? false,
    canAfford: () => true,
  });
}

beforeEach(() => {
  navigateMock.mockReset();
  useMeritsMock.mockReset();
});

describe('RunningLowCard', () => {
  it('T1: isLow false → null', () => {
    setMerits({ isLow: false, subscription: 30 });
    const { container } = render(
      <MemoryRouter>
        <RunningLowCard />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('T2: isLow true → "Running low?" heading', () => {
    setMerits({ isLow: true, subscription: 2 });
    render(
      <MemoryRouter>
        <RunningLowCard />
      </MemoryRouter>,
    );
    expect(screen.getByText('Running low?')).toBeInTheDocument();
  });

  it('T3: body interpolates subscription count', () => {
    setMerits({ isLow: true, subscription: 2 });
    render(
      <MemoryRouter>
        <RunningLowCard />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(/You have 2 merits left this cycle/),
    ).toBeInTheDocument();
  });

  it('T4: primary CTA "Buy 25 Merits" → navigate(/pricing#packs)', () => {
    setMerits({ isLow: true, subscription: 2 });
    render(
      <MemoryRouter>
        <RunningLowCard />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Buy 25 Merits/ }));
    expect(navigateMock).toHaveBeenCalledWith('/pricing#packs');
  });

  it('T5: secondary "Or upgrade your plan →" → navigate(/pricing)', () => {
    setMerits({ isLow: true, subscription: 2 });
    render(
      <MemoryRouter>
        <RunningLowCard />
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Or upgrade your plan/ }),
    );
    expect(navigateMock).toHaveBeenCalledWith('/pricing');
  });

  it('T6: isLoading true → null', () => {
    setMerits({ isLow: true, subscription: 2, isLoading: true });
    const { container } = render(
      <MemoryRouter>
        <RunningLowCard />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('T7: price + per-merit sourced from PACKS_BY_ID.pack_25 (D-01/D-02)', () => {
    setMerits({ isLow: true, subscription: 2 });
    render(
      <MemoryRouter>
        <RunningLowCard />
      </MemoryRouter>,
    );
    const pack = PACKS_BY_ID.pack_25;
    const expectedPrice = (pack.priceCents / 100).toFixed(2);
    const expectedPerMerit = (pack.perMeritCents / 100).toFixed(2);
    expect(
      screen.getByText(
        new RegExp(`${pack.merits} merits · \\$${expectedPrice} · \\$${expectedPerMerit}/Merit`),
      ),
    ).toBeInTheDocument();
  });

  it('T8: isZero true (subscription=0) → null (IN-01: yield to Limit Reached banner)', () => {
    // WR-03 makes isLow=true when subscription===0, but the Dashboard
    // destructive "Limit Reached" banner owns the zero-state UX. This card
    // must hide to avoid a duplicate softer nudge at the same moment.
    setMerits({ isLow: true, subscription: 0 });
    const { container } = render(
      <MemoryRouter>
        <RunningLowCard />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });
});

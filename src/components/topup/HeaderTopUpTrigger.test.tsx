/**
 * HeaderTopUpTrigger — contract tests (Phase 24 Plan 06, SC-9b).
 *
 * T1 isLow false → null
 * T2 isLow true → <button aria-label="Buy more merits"> w/ Plus icon
 * T3 click → navigate('/pricing#packs')
 * T4 free tier 2/10 → isLow true → renders (D-08 boundary)
 * T5 free tier 3/10 → isLow false → null
 * T6 pathname='/pricing' → null (UI-SPEC anti-redundancy)
 * T7 isLoading=true → null
 * T8 isZero true → null (IN-01: OutOfMeritsModalV2 owns the zero-state CTA)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const navigateMock = vi.fn();
let mockPathname = '/dashboard';
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ pathname: mockPathname }),
  };
});

const useMeritsMock = vi.fn();
vi.mock('@/hooks/useMerits', () => ({
  useMerits: () => useMeritsMock(),
}));

import { HeaderTopUpTrigger } from './HeaderTopUpTrigger';

function setMerits(opts: {
  isLow: boolean;
  isLoading?: boolean;
  subscription?: number;
  cap?: number;
}) {
  useMeritsMock.mockReturnValue({
    total: opts.subscription ?? 0,
    subscription: opts.subscription ?? 0,
    shop: 0,
    cap: opts.cap ?? 75,
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
  mockPathname = '/dashboard';
});

describe('HeaderTopUpTrigger', () => {
  it('T1: isLow false → renders null', () => {
    setMerits({ isLow: false, subscription: 30, cap: 75 });
    const { container } = render(
      <MemoryRouter>
        <HeaderTopUpTrigger />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('T2: isLow true → button with aria-label "Buy more merits"', () => {
    setMerits({ isLow: true, subscription: 2, cap: 10 });
    render(
      <MemoryRouter>
        <HeaderTopUpTrigger />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('button', { name: 'Buy more merits' }),
    ).toBeInTheDocument();
  });

  it('T3: click navigates to /pricing#packs', () => {
    setMerits({ isLow: true, subscription: 2, cap: 10 });
    render(
      <MemoryRouter>
        <HeaderTopUpTrigger />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Buy more merits' }));
    expect(navigateMock).toHaveBeenCalledWith('/pricing#packs');
  });

  it('T4: free 2/10 (exactly 20%) → isLow true → renders', () => {
    setMerits({ isLow: true, subscription: 2, cap: 10 });
    render(
      <MemoryRouter>
        <HeaderTopUpTrigger />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('T5: free 3/10 (30%) → isLow false → null', () => {
    setMerits({ isLow: false, subscription: 3, cap: 10 });
    const { container } = render(
      <MemoryRouter>
        <HeaderTopUpTrigger />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('T6: pathname=/pricing → null (anti-redundancy)', () => {
    setMerits({ isLow: true, subscription: 2, cap: 10 });
    mockPathname = '/pricing';
    const { container } = render(
      <MemoryRouter>
        <HeaderTopUpTrigger />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('T7: isLoading true → null', () => {
    setMerits({ isLow: true, subscription: 2, cap: 10, isLoading: true });
    const { container } = render(
      <MemoryRouter>
        <HeaderTopUpTrigger />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('T8: isZero true (subscription=0) → null (IN-01: OutOfMeritsModalV2 owns zero-state)', () => {
    // WR-03 makes isLow=true when subscription===0. The OutOfMeritsModalV2
    // and Dashboard "Limit Reached" banner already prompt the user to top up
    // at that moment — the '+' header icon would be a third redundant CTA.
    setMerits({ isLow: true, subscription: 0, cap: 10 });
    const { container } = render(
      <MemoryRouter>
        <HeaderTopUpTrigger />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });
});

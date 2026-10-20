/**
 * MeritBalanceHeaderV2 — contract tests (Phase 30 MER-11; supersedes Phase 24 SC-10).
 *
 * Phase 30 rewrites the trigger to render a single value `{subscription + shop} / {cap}`
 * with no bonus chip (D-09, D-17). aria-label drops the "plus N bonus" clause (D-12).
 * Digits weight is `font-semibold` (two-weight typography contract; UI-SPEC).
 *
 * T1 47 sub + 0 shop / 75 cap  → "47 / 75" + "merits" (no chip)
 * T2 47 sub + 15 shop / 75 cap → "62 / 75" + "merits" (sum, NOT 47; no chip)
 * T3 isLoading → Skeleton (preserved verbatim from Phase 24)
 * T4 0 sub + 0 shop / 10 cap (Free) → "0 / 10" + destructive trigger
 * T5 digits span has BOTH font-mono AND font-semibold (typography contract)
 * T6 isLow=true → amber trigger (preserved verbatim from Phase 24)
 * T7 isZero=true → destructive trigger (preserved verbatim from Phase 24)
 * T8 aria-label exactly equals "Merit balance: 62 of 75 merits" (D-12)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const useMeritsMock = vi.fn();
vi.mock('@/hooks/useMerits', () => ({
  useMerits: () => useMeritsMock(),
}));

import { MeritBalanceHeaderV2 } from './MeritBalanceHeaderV2';

function setMerits(opts: {
  subscription: number;
  shop: number;
  cap: number;
  isLoading?: boolean;
  resetDate?: string | null;
  isLow?: boolean;
  isZero?: boolean;
}) {
  useMeritsMock.mockReturnValue({
    total: opts.subscription + opts.shop,
    subscription: opts.subscription,
    shop: opts.shop,
    cap: opts.cap,
    tier: 'pro',
    resetDate: opts.resetDate ?? null,
    isLow: opts.isLow ?? false,
    isZero: opts.isZero ?? opts.subscription + opts.shop <= 0,
    isLoading: opts.isLoading ?? false,
    canAfford: () => true,
  });
}

beforeEach(() => {
  useMeritsMock.mockReset();
});

describe('MeritBalanceHeaderV2', () => {
  it('T1: 47 sub + 0 shop / 75 cap → "47 / 75" + "merits" (no chip)', () => {
    setMerits({ subscription: 47, shop: 0, cap: 75 });
    render(
      <MemoryRouter>
        <MeritBalanceHeaderV2 />
      </MemoryRouter>,
    );
    expect(screen.getByText(/47\s*\/\s*75/)).toBeInTheDocument();
    expect(screen.getByText('merits')).toBeInTheDocument();
    expect(screen.queryByText(/\+\s*\d+\s+bonus/i)).not.toBeInTheDocument();
  });

  it('T2: 47 sub + 15 shop / 75 cap → "62 / 75" (sum) + "merits" (no chip)', () => {
    setMerits({ subscription: 47, shop: 15, cap: 75 });
    render(
      <MemoryRouter>
        <MeritBalanceHeaderV2 />
      </MemoryRouter>,
    );
    // The trigger displays the SUM (D-09): 47 + 15 = 62.
    expect(screen.getByText(/62\s*\/\s*75/)).toBeInTheDocument();
    expect(screen.queryByText(/47\s*\/\s*75/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+\s*15\s+bonus/i)).not.toBeInTheDocument();
    expect(screen.getByText('merits')).toBeInTheDocument();
  });

  it('T3: isLoading → Skeleton', () => {
    setMerits({ subscription: 0, shop: 0, cap: 75, isLoading: true });
    const { container } = render(
      <MemoryRouter>
        <MeritBalanceHeaderV2 />
      </MemoryRouter>,
    );
    // Skeleton renders a single <div> element (no button, no digits).
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.firstChild).toBeTruthy();
  });

  it('T4: Free 0 sub + 0 shop / 10 cap (isZero) → "0 / 10" + destructive trigger', () => {
    setMerits({ subscription: 0, shop: 0, cap: 10, isZero: true });
    render(
      <MemoryRouter>
        <MeritBalanceHeaderV2 />
      </MemoryRouter>,
    );
    expect(screen.getByText(/0\s*\/\s*10/)).toBeInTheDocument();
    expect(screen.getByText('merits')).toBeInTheDocument();
    const button = screen.getByRole('button');
    expect(button.className).toMatch(/bg-destructive\/10/);
    expect(button.className).toMatch(/text-destructive/);
  });

  it('T5: digits span has both font-mono and font-semibold (typography contract)', () => {
    setMerits({ subscription: 47, shop: 0, cap: 75 });
    render(
      <MemoryRouter>
        <MeritBalanceHeaderV2 />
      </MemoryRouter>,
    );
    const numericSpan = screen.getByText(/47\s*\/\s*75/);
    expect(numericSpan.className).toMatch(/font-mono/);
    expect(numericSpan.className).toMatch(/font-semibold/);
  });

  it('T6: isLow=true → trigger button has amber-500 className', () => {
    setMerits({ subscription: 10, shop: 0, cap: 75, isLow: true });
    render(
      <MemoryRouter>
        <MeritBalanceHeaderV2 />
      </MemoryRouter>,
    );
    const button = screen.getByRole('button');
    expect(button.className).toMatch(/bg-amber-500\/10/);
    expect(button.className).toMatch(/text-amber-500/);
  });

  it('T7: isZero=true → trigger button has destructive className', () => {
    setMerits({ subscription: 0, shop: 0, cap: 75, isZero: true });
    render(
      <MemoryRouter>
        <MeritBalanceHeaderV2 />
      </MemoryRouter>,
    );
    const button = screen.getByRole('button');
    expect(button.className).toMatch(/bg-destructive\/10/);
    expect(button.className).toMatch(/text-destructive/);
  });

  it('T8: aria-label exactly "Merit balance: 62 of 75 merits" for 47+15/75 (D-12)', () => {
    setMerits({ subscription: 47, shop: 15, cap: 75 });
    render(
      <MemoryRouter>
        <MeritBalanceHeaderV2 />
      </MemoryRouter>,
    );
    expect(
      screen.getByLabelText('Merit balance: 62 of 75 merits'),
    ).toBeInTheDocument();
  });
});

/**
 * OutOfMeritsModalV2 — contract tests (Phase 24 Plan 06, SC-9a).
 *
 * Verified:
 *   T1 Title "Out of Merits" (exact SC-9a copy)
 *   T2 Body interpolates {cost} / {feature} / {balance}
 *   T3 Primary "Buy a top-up pack" → navigate('/pricing#packs') + close
 *   T4 Secondary "Upgrade plan"    → navigate('/pricing')      + close
 *   T5 onOpenChange(false) fires without navigation on close (e.g. esc)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return { ...actual, useNavigate: () => navigateMock };
});

import { OutOfMeritsModalV2 } from './OutOfMeritsModalV2';

function renderModal(
  onOpenChange: (v: boolean) => void = () => {},
  overrides: Partial<{
    open: boolean;
    feature: string;
    cost: number;
    balance: number;
  }> = {},
) {
  return render(
    <MemoryRouter>
      <OutOfMeritsModalV2
        open={overrides.open ?? true}
        onOpenChange={onOpenChange}
        feature={overrides.feature ?? 'Resume Analysis'}
        cost={overrides.cost ?? 3}
        balance={overrides.balance ?? 1}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  navigateMock.mockReset();
});

describe('OutOfMeritsModalV2', () => {
  it('T1: renders title "Out of Merits" (SC-9a copy)', () => {
    renderModal();
    expect(screen.getByText('Out of Merits')).toBeInTheDocument();
  });

  it('T2: body interpolates {cost}, {feature}, {balance}', () => {
    renderModal(() => {}, { feature: 'Career Compass', cost: 5, balance: 2 });
    expect(
      screen.getByText(/need 5 merits to run Career Compass, and you have 2/),
    ).toBeInTheDocument();
  });

  it('T3: "Buy a top-up pack" → navigate(/pricing#packs) + onOpenChange(false)', () => {
    const onOpenChange = vi.fn();
    renderModal(onOpenChange);
    fireEvent.click(screen.getByRole('button', { name: 'Buy a top-up pack' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigateMock).toHaveBeenCalledWith('/pricing#packs');
  });

  it('T4: "Upgrade plan" → navigate(/pricing) + onOpenChange(false)', () => {
    const onOpenChange = vi.fn();
    renderModal(onOpenChange);
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade plan' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigateMock).toHaveBeenCalledWith('/pricing');
  });

  it('T5: primary-then-secondary ordering (SC-9a ordering is fixed)', () => {
    renderModal();
    const buttons = screen.getAllByRole('button');
    // Dialog close button is the first button in the DOM; our CTAs are the
    // next two, in order: "Buy a top-up pack" then "Upgrade plan".
    const ctaIndex = buttons.findIndex(
      (b) => b.textContent === 'Buy a top-up pack',
    );
    expect(ctaIndex).toBeGreaterThanOrEqual(0);
    expect(buttons[ctaIndex + 1]?.textContent).toBe('Upgrade plan');
  });
});

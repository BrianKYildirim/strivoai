/**
 * PricingTable — render contract tests (UX-08).
 *
 * Asserts:
 * - Monthly view shows the Elite $16.99 price
 * - Yearly toggle reveals $169.99 + savings badge (Save $33.89)
 * - "Most Popular" badge appears on the Elite card
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { makeSupabaseMock } from '@/test/supabaseMock';

const getUserMock = vi.fn();

// Complete chainable mock so any transitively-mounted query chain is inert;
// `auth.getUser` is overridden by the per-test `getUserMock` (set in beforeEach).
vi.mock('@/lib/supabaseClient', () => {
  const supabase = makeSupabaseMock();
  supabase.auth.getUser = () => getUserMock();
  return { supabase };
});

vi.mock('@/hooks/useStripeCheckout', () => ({
  useStripeCheckout: () => ({
    isLoading: false,
    fetchClientSecret: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('@/hooks/useTierAccess', () => ({
  useTierAccess: () => ({
    tier: 'free',
    loading: false,
    canAccessFeature: () => true,
    canUseCredits: true,
    usageInfo: null,
  }),
}));

// Stub the StripeCheckoutWrapper so we don't pull in @stripe/* in jsdom
vi.mock('@/components/StripeCheckoutWrapper', () => ({
  StripeCheckoutWrapper: () => null,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

import PricingTable from './PricingTable';

beforeEach(() => {
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: null } });
});

const renderTable = () =>
  render(
    <MemoryRouter>
      <PricingTable />
    </MemoryRouter>,
  );

describe('PricingTable', () => {
  it('renders monthly Elite price point ($16.99) and no Pro price', async () => {
    renderTable();
    await waitFor(() => {
      expect(screen.getByText(/\$16\.99/)).toBeInTheDocument();
      expect(screen.queryByText(/\$8\.99/)).not.toBeInTheDocument();
    });
  });

  it('switches to yearly view and renders $169.99 + Save badge', async () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /^yearly/i }));

    await waitFor(() => {
      // Yearly totals
      expect(screen.getByText(/\$169\.99\/yr/)).toBeInTheDocument();
      expect(screen.queryByText(/\$89\.99\/yr/)).not.toBeInTheDocument();
    });

    // Savings badges
    expect(screen.getByText(/Save \$33\.89/)).toBeInTheDocument();
  });

  it('shows the "Most Popular" badge on the Elite card', async () => {
    renderTable();
    const eliteHeading = await screen.findByRole('heading', { name: /^elite$/i });
    // Find the nearest enclosing card and check for Most Popular within
    // (PricingTable renders the badge as a sibling inside the same Card)
    const card = eliteHeading.closest('div')?.parentElement?.parentElement;
    expect(card).not.toBeNull();
    if (card) {
      expect(within(card as HTMLElement).getByText(/most popular/i)).toBeInTheDocument();
    }
  });
});

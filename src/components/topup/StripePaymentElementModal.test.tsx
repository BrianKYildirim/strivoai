/**
 * StripePaymentElementModal — component contract tests (Phase 24 Plan 06, D-23).
 *
 * Mocks @stripe/stripe-js (loadStripe) and @stripe/react-stripe-js (Elements,
 * PaymentElement, useStripe, useElements) so the tests can drive confirmPayment
 * outcomes without touching the real Stripe bundle.
 *
 * Test 1: open + clientSecret → renders Elements wrapper + PaymentElement.
 * Test 2: title reads "Buy 25 Merits — $9.99" for pack_25.
 * Test 3: clientSecret null → renders centered Loader2 (data-testid).
 * Test 4: confirmPayment → succeeded → toast.success + reconcile poll + close.
 * Test 5: confirmPayment → error → dialog stays open (no extra toast).
 * Test 6: confirmPayment → processing → canonical info toast + poll + close.
 *
 * Phase 32 (MER-07 / MER-08) poll coverage:
 * Test 7: poll keeps invalidating until a higher shop_balance lands, then stops.
 * Test 8: modal closes (onSuccess) immediately on succeeded, before the poll lands.
 * Test 9: 10s timeout with shop_balance unchanged fires NO error toast (D-05).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// The component computes `stripePromise` from VITE_STRIPE_PUBLISHABLE_KEY at
// module-eval time; with no .env present (e.g. a fresh worktree) it is undefined
// and the modal renders the "payment-unavailable" fallback instead of <Elements>.
// Stub the env in a hoisted block so it is set BEFORE the static import below
// evaluates, keeping the suite independent of the local environment.
vi.hoisted(() => {
  vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_modal_spec');
});

// ── Phase 32: useMerits mock ──────────────────────────────────────
// The modal now consumes useMerits().shop + reconcileShopCredit. We mock the
// hook so the test owns both the snapshot value (TEST_USER_SHOP) and a faithful
// reconcileShopCredit that polls the SAME QueryClient the test seeds — driven
// deterministically by fake timers. This mirrors the real useMerits poll
// (invalidate -> getQueryData read-back, stop when shop_balance > snapshot,
// 10s ceiling / 1500ms interval) without booting supabase auth.
const TEST_USER_ID = 'user-test-1';
const POLL_INTERVAL_MS = 1500;
const POLL_CEILING_MS = 10000;
// Holds the QueryClient the active test renders under, so the mocked
// reconcileShopCredit can read/invalidate the same cache.
let activeQc: QueryClient | null = null;
let mockShop = 0;

const reconcileShopCreditMock = vi.fn(async (snapshot: number): Promise<void> => {
  const qc = activeQc;
  if (!qc) return;
  const key = ['merit-balance', TEST_USER_ID] as const;
  const exceeds = (): boolean => {
    const current = qc.getQueryData<{ balance: { shop_balance?: number } | null }>(key);
    const sb = current?.balance?.shop_balance;
    return typeof sb === 'number' && sb > snapshot;
  };
  if (exceeds()) return;
  const start = Date.now();
  while (Date.now() - start < POLL_CEILING_MS) {
    await qc.invalidateQueries({ queryKey: ['merit-balance'] });
    if (exceeds()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
});

vi.mock('@/hooks/useMerits', () => ({
  useMerits: () => ({ shop: mockShop, reconcileShopCredit: reconcileShopCreditMock }),
}));

// ── mocks ─────────────────────────────────────────────────────────
vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(() => Promise.resolve({ __fake: true })),
}));

const confirmPaymentMock = vi.fn();

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'stripe-elements' }, children),
  PaymentElement: () =>
    React.createElement('div', { 'data-testid': 'payment-element' }),
  useStripe: () => ({ confirmPayment: confirmPaymentMock }),
  useElements: () => ({}),
}));

const toastSuccessMock = vi.fn();
const toastInfoMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (msg: string) => toastSuccessMock(msg),
    info: (msg: string) => toastInfoMock(msg),
    error: (msg: string) => toastErrorMock(msg),
  },
}));

const reportDiagnosticMock = vi.fn();
vi.mock('@/lib/diagnostics/client-diagnostics', () => ({
  reportDiagnostic: (input: unknown) => reportDiagnosticMock(input),
}));

import { StripePaymentElementModal } from './StripePaymentElementModal';

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  confirmPaymentMock.mockReset();
  toastSuccessMock.mockReset();
  toastInfoMock.mockReset();
  toastErrorMock.mockReset();
  reportDiagnosticMock.mockReset();
  reconcileShopCreditMock.mockClear();
  activeQc = null;
  mockShop = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StripePaymentElementModal', () => {
  it('T1: open=true + clientSecret → renders <Elements> + <PaymentElement>', () => {
    render(
      <StripePaymentElementModal
        open={true}
        onOpenChange={() => {}}
        packId="pack_25"
        clientSecret="cs_test_abc"
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId('stripe-elements')).toBeInTheDocument();
    expect(screen.getByTestId('payment-element')).toBeInTheDocument();
  });

  it('T2: title reads "Buy 25 Merits — $9.99" for pack_25', () => {
    render(
      <StripePaymentElementModal
        open={true}
        onOpenChange={() => {}}
        packId="pack_25"
        clientSecret="cs_test_abc"
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText(/Buy 25 Merits — \$9\.99/)).toBeInTheDocument();
  });

  it('T3: open=true + clientSecret=null → renders payment-loading spinner', () => {
    render(
      <StripePaymentElementModal
        open={true}
        onOpenChange={() => {}}
        packId="pack_25"
        clientSecret={null}
      />,
      { wrapper: Wrapper },
    );
    const loading = screen.getByTestId('payment-loading');
    expect(loading).toBeInTheDocument();
    // quick 260727-0s6: same copy as the subscription checkout's pending body,
    // so both flows read identically while their secret is being created.
    expect(loading).toHaveTextContent('Preparing secure checkout…');
    expect(screen.queryByTestId('stripe-elements')).not.toBeInTheDocument();
  });

  it('T3b: pending timeout closes with mapped copy and releases the next open', async () => {
    vi.useFakeTimers();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <StripePaymentElementModal
        open={true}
        onOpenChange={onOpenChange}
        packId="pack_25"
        clientSecret={null}
      />,
      { wrapper: Wrapper },
    );
    await vi.advanceTimersByTimeAsync(15000);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toastErrorMock).toHaveBeenCalledWith(
      "We couldn't start checkout. Please try again.",
    );
    expect(reportDiagnosticMock).toHaveBeenCalledWith({
      surface: 'checkout',
      stage: 'checkout',
      category: 'checkout_failed',
    });

    onOpenChange.mockClear();
    rerender(
      <StripePaymentElementModal
        open={true}
        onOpenChange={onOpenChange}
        packId="pack_25"
        clientSecret={null}
      />,
    );
    await vi.advanceTimersByTimeAsync(14999);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('T4: confirmPayment succeeded → toast.success + reconcile poll + close', async () => {
    confirmPaymentMock.mockResolvedValue({
      error: undefined,
      paymentIntent: { status: 'succeeded' },
    });
    const onOpenChange = vi.fn();
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    activeQc = qc;
    // Seed the cache so the immediate poll check resolves with zero wait.
    qc.setQueryData(['merit-balance', TEST_USER_ID], {
      balance: { shop_balance: 5 },
      tier: 'pro',
    });
    mockShop = 0; // snapshot below the seeded balance → poll resolves immediately
    render(
      <QueryClientProvider client={qc}>
        <StripePaymentElementModal
          open={true}
          onOpenChange={onOpenChange}
          packId="pack_25"
          clientSecret="cs_test_abc"
        />
      </QueryClientProvider>,
    );
    fireEvent.submit(screen.getByTestId('payment-element').closest('form')!);
    await waitFor(() => expect(confirmPaymentMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        '25 Merits added. Enjoy your career momentum.',
      ),
    );
    expect(reconcileShopCreditMock).toHaveBeenCalledWith(0);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('T5: confirmPayment error → dialog stays open, no toast', async () => {
    confirmPaymentMock.mockResolvedValue({
      error: { message: 'card_declined', type: 'card_error' },
      paymentIntent: undefined,
    });
    const onOpenChange = vi.fn();
    render(
      <StripePaymentElementModal
        open={true}
        onOpenChange={onOpenChange}
        packId="pack_25"
        clientSecret="cs_test_abc"
      />,
      { wrapper: Wrapper },
    );
    fireEvent.submit(screen.getByTestId('payment-element').closest('form')!);
    await waitFor(() => expect(confirmPaymentMock).toHaveBeenCalledTimes(1));
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('T6: confirmPayment processing → canonical info toast + poll + close', async () => {
    confirmPaymentMock.mockResolvedValue({
      error: undefined,
      paymentIntent: { status: 'processing' },
    });
    const onOpenChange = vi.fn();
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    activeQc = qc;
    qc.setQueryData(['merit-balance', TEST_USER_ID], {
      balance: { shop_balance: 3 },
      tier: 'pro',
    });
    mockShop = 0;
    render(
      <QueryClientProvider client={qc}>
        <StripePaymentElementModal
          open={true}
          onOpenChange={onOpenChange}
          packId="pack_10"
          clientSecret="cs_test_xyz"
        />
      </QueryClientProvider>,
    );
    fireEvent.submit(screen.getByTestId('payment-element').closest('form')!);
    await waitFor(() =>
      expect(toastInfoMock).toHaveBeenCalledWith(
        "Merits processing — they'll appear shortly",
      ),
    );
    expect(reconcileShopCreditMock).toHaveBeenCalledWith(0);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('T7: poll keeps invalidating until shop_balance exceeds snapshot, then stops', async () => {
    vi.useFakeTimers();
    confirmPaymentMock.mockResolvedValue({
      error: undefined,
      paymentIntent: { status: 'succeeded' },
    });
    const onOpenChange = vi.fn();
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    activeQc = qc;
    // Snapshot at submit is 75 (at-cap Pro). Seed cache still at 75 — webhook
    // credit has NOT landed yet, so the poll must keep going.
    mockShop = 75;
    qc.setQueryData(['merit-balance', TEST_USER_ID], {
      balance: { shop_balance: 75 },
      tier: 'pro',
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    render(
      <QueryClientProvider client={qc}>
        <StripePaymentElementModal
          open={true}
          onOpenChange={onOpenChange}
          packId="pack_3"
          clientSecret="cs_test_t7"
        />
      </QueryClientProvider>,
    );
    fireEvent.submit(screen.getByTestId('payment-element').closest('form')!);
    // Let confirmPayment resolve and the detached poll start.
    await vi.advanceTimersByTimeAsync(0);
    expect(reconcileShopCreditMock).toHaveBeenCalledWith(75);
    // First tick invalidated but balance still 75 → poll continues.
    const callsAfterFirstTick = invalidateSpy.mock.calls.length;
    expect(callsAfterFirstTick).toBeGreaterThanOrEqual(1);
    // Webhook credit lands: 75 → 78 (the 3-pack). MER-07 above-cap value.
    qc.setQueryData(['merit-balance', TEST_USER_ID], {
      balance: { shop_balance: 78 },
      tier: 'pro',
    });
    // Advance one interval so the next tick observes 78 > 75 and stops.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    const callsAfterLand = invalidateSpy.mock.calls.length;
    // Advance well past the ceiling — no further invalidates once stopped.
    await vi.advanceTimersByTimeAsync(POLL_CEILING_MS);
    expect(invalidateSpy.mock.calls.length).toBe(callsAfterLand);
    expect(
      (qc.getQueryData(['merit-balance', TEST_USER_ID]) as {
        balance: { shop_balance: number };
      }).balance.shop_balance,
    ).toBe(78);
  });

  it('T8: modal closes immediately on succeeded, before the poll lands', async () => {
    vi.useFakeTimers();
    confirmPaymentMock.mockResolvedValue({
      error: undefined,
      paymentIntent: { status: 'succeeded' },
    });
    const onOpenChange = vi.fn();
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    activeQc = qc;
    // Snapshot 75, cache still 75 → poll will NOT resolve during this window.
    mockShop = 75;
    qc.setQueryData(['merit-balance', TEST_USER_ID], {
      balance: { shop_balance: 75 },
      tier: 'pro',
    });
    render(
      <QueryClientProvider client={qc}>
        <StripePaymentElementModal
          open={true}
          onOpenChange={onOpenChange}
          packId="pack_3"
          clientSecret="cs_test_t8"
        />
      </QueryClientProvider>,
    );
    fireEvent.submit(screen.getByTestId('payment-element').closest('form')!);
    await vi.advanceTimersByTimeAsync(0);
    // onSuccess() ran synchronously after starting the detached poll — modal
    // closed immediately even though the poll has NOT observed a higher balance.
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(reconcileShopCreditMock).toHaveBeenCalledWith(75);
  });

  it('T9: 10s timeout with shop_balance unchanged fires NO error toast (D-05)', async () => {
    vi.useFakeTimers();
    confirmPaymentMock.mockResolvedValue({
      error: undefined,
      paymentIntent: { status: 'succeeded' },
    });
    const onOpenChange = vi.fn();
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    activeQc = qc;
    mockShop = 75;
    qc.setQueryData(['merit-balance', TEST_USER_ID], {
      balance: { shop_balance: 75 },
      tier: 'pro',
    });
    render(
      <QueryClientProvider client={qc}>
        <StripePaymentElementModal
          open={true}
          onOpenChange={onOpenChange}
          packId="pack_3"
          clientSecret="cs_test_t9"
        />
      </QueryClientProvider>,
    );
    fireEvent.submit(screen.getByTestId('payment-element').closest('form')!);
    // Drive past the full 10s ceiling without the balance ever rising.
    await vi.advanceTimersByTimeAsync(POLL_CEILING_MS + POLL_INTERVAL_MS * 2);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});

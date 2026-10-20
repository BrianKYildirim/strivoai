import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── mocks (shared across both describe blocks) ─────────────────────
const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

const invokeMock = vi.fn();
// Default to an anonymous visitor; individual tests set a user to exercise the
// logged-in downgrade path.
let authUser: { id: string } | null = null;
const getUserMock = vi.fn(() => Promise.resolve({ data: { user: authUser } }));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    auth: { getUser: () => getUserMock() },
  },
}));

const invalidateMeritsMock = vi.fn();
vi.mock('@/hooks/useMerits', () => ({
  useInvalidateMerits: () => invalidateMeritsMock,
}));

let currentTier = 'free';
vi.mock('@/hooks/useTierAccess', () => ({
  useTierAccess: () => ({ tier: currentTier, loading: false }),
}));

const refreshSubscriptionMock = vi.fn(() => Promise.resolve());
const reconcileSubscriptionMock = vi.fn(() => Promise.resolve<'reconciled' | 'timed_out'>('timed_out'));
let subscriptionState = {
  userId: null as string | null,
  subscriptionTier: 'free',
  subscriptionStatus: null as string | null,
  pendingDowngradeTier: null as string | null,
  currentPeriodEnd: null as Date | null,
  isPendingDowngrade: false,
  isLoading: false,
  error: null as Error | null,
};
vi.mock('@/hooks/useSubscriptionState', () => ({
  useSubscriptionState: () => ({
    ...subscriptionState,
    refresh: refreshSubscriptionMock,
    reconcilePendingDowngrade: reconcileSubscriptionMock,
  }),
}));

const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...a: unknown[]) => toastErrorMock(...a),
    success: (...a: unknown[]) => toastSuccessMock(...a),
    info: vi.fn(),
  },
}));

// StripeCheckoutWrapper renders an embedded Stripe SDK checkout we do not
// exercise here — replace with a probe exposing open state + props.
vi.mock('@/components/StripeCheckoutWrapper', () => ({
  StripeCheckoutWrapper: ({
    open,
    clientSecret,
    title,
  }: {
    open: boolean;
    clientSecret: string | null;
    title: string;
  }) =>
    open ? (
      <div data-testid="checkout-modal" data-secret={clientSecret ?? ''} data-title={title}>
        checkout-modal
      </div>
    ) : null,
}));

vi.mock('@/components/Navbar', () => ({ Navbar: () => <nav data-testid="nav" /> }));
vi.mock('@/components/Footer', () => ({ default: () => <footer data-testid="footer" /> }));

import Pricing from './Pricing';

// ── Plan 01 layout specs (preserved) ───────────────────────────────
function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('PricingPageV2', () => {
  it('renders two active tier cards', () => {
    renderPage();
    expect(screen.getByLabelText('Free tier card')).toBeInTheDocument();
    expect(screen.getByLabelText('Elite tier card')).toBeInTheDocument();
    expect(screen.queryByLabelText('Pro tier card')).not.toBeInTheDocument();
  });

  it('renders the billing interval toggle defaulting to Monthly', () => {
    renderPage();
    const toggle = screen.getByRole('tablist', { name: /billing interval/i });
    expect(toggle).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /monthly/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('switches to Annual when clicked and shows the Save 17% badge', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /annual/i }));
    expect(screen.getByRole('tab', { name: /annual/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/save 17%/i)).toBeInTheDocument();
  });

  it('renders the pack section with 4 packs under #packs anchor', () => {
    renderPage();
    const section = document.querySelector('#packs');
    expect(section).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /buy .+-merit pack/i }).length).toBe(4);
  });

  it('does NOT wrap content in the removed .theme-v2 scope (PRICE-06)', () => {
    renderPage();
    expect(document.querySelector('main.theme-v2')).toBeNull();
  });

  it('highlights the current plan: the current tier card disables its CTA (PRICE-08)', () => {
    currentTier = 'elite';
    renderPage();
    // The current plan renders its CTA as the disabled "Current plan" button.
    const proCta = screen.getByRole('button', { name: /current plan/i });
    expect(proCta).toBeDisabled();
    currentTier = 'free';
  });

  it('dispatches topup:open when a pack Buy now is clicked (Plan 06 wire point)', () => {
    renderPage();
    const handler = vi.fn();
    window.addEventListener('topup:open', handler as EventListener);
    fireEvent.click(screen.getByRole('button', { name: /buy 25-merit pack/i }));
    expect(handler).toHaveBeenCalled();
    window.removeEventListener('topup:open', handler as EventListener);
  });
});

// ── Plan 03 checkout-wiring specs (PRICE-01) ───────────────────────
beforeEach(() => {
  navigateMock.mockReset();
  invokeMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  invalidateMeritsMock.mockReset();
  getUserMock.mockClear();
  refreshSubscriptionMock.mockClear();
  reconcileSubscriptionMock.mockReset();
  reconcileSubscriptionMock.mockResolvedValue('timed_out');
  authUser = null;
  currentTier = 'free';
  subscriptionState = {
    userId: null,
    subscriptionTier: 'free',
    subscriptionStatus: null,
    pendingDowngradeTier: null,
    currentPeriodEnd: null,
    isPendingDowngrade: false,
    isLoading: false,
    error: null,
  };
  // jsdom does not implement navigation; make location.href assignable.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: '' },
  });
});

function renderPricing() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Pricing />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

async function clickTier(name: RegExp) {
  const user = userEvent.setup();
  const btn = await screen.findByRole('button', { name });
  await user.click(btn);
}

function setPendingDowngrade(periodEnd: Date | null = new Date(2030, 2, 15, 12, 0, 0)) {
  authUser = { id: 'u1' };
  currentTier = 'elite';
  subscriptionState = {
    userId: 'u1',
    subscriptionTier: 'elite',
    subscriptionStatus: 'active',
    pendingDowngradeTier: 'free',
    currentPeriodEnd: periodEnd,
    isPendingDowngrade: true,
    isLoading: false,
    error: null,
  };
}

describe('Pricing checkout wiring (PRICE-01)', () => {
  it('Free→Elite CTA invokes create-checkout-session and opens the embedded modal (no /checkout nav)', async () => {
    invokeMock.mockResolvedValue({ data: { clientSecret: 'cs_test_123', id: 'sess_1' }, error: null });
    renderPricing();
    await clickTier(/upgrade to elite/i);

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('create-checkout-session', {
        body: { mode: 'subscription', tier: 'elite', interval: 'monthly', ui_mode: 'embedded' },
      }),
    );
    const modal = await screen.findByTestId('checkout-modal');
    expect(modal).toHaveAttribute('data-secret', 'cs_test_123');
    expect(navigateMock).not.toHaveBeenCalledWith(expect.stringContaining('/checkout'));
  });

  it('anonymous Free-tier CTA navigates to /auth and does not invoke checkout (Plan 01 regression)', async () => {
    // currentTier=elite so the Free card CTA is enabled (not the current plan);
    // authUser=null makes this the anonymous sign-up path.
    currentTier = 'elite';
    authUser = null;
    renderPricing();
    await clickTier(/start free/i);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/auth'));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('logged-in Free-tier CTA opens the downgrade confirmation instead of redirecting', async () => {
    currentTier = 'elite';
    authUser = { id: 'u1' };
    renderPricing();
    await clickTier(/start free/i);

    // Confirmation dialog appears; nothing has been cancelled or redirected yet.
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /downgrade to free/i })).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('confirming the downgrade invokes cancel-subscription and shows a success toast', async () => {
    currentTier = 'elite';
    authUser = { id: 'u1' };
    invokeMock.mockResolvedValue({
      data: { ok: true, current_period_end: 1900000000 },
      error: null,
    });
    renderPricing();
    await clickTier(/start free/i);
    await screen.findByRole('alertdialog');
    await clickTier(/downgrade to free/i);

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('cancel-subscription'));
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
    expect(invalidateMeritsMock).toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalledWith('/');
  });

  it('a failed cancel-subscription surfaces toast.error and does not redirect', async () => {
    currentTier = 'elite';
    authUser = { id: 'u1' };
    invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    renderPricing();
    await clickTier(/start free/i);
    await screen.findByRole('alertdialog');
    await clickTier(/downgrade to free/i);

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(navigateMock).not.toHaveBeenCalledWith('/');
  });

  it('a { mode:swap } response does NOT open the modal and navigates to /dashboard?checkout=complete', async () => {
    invokeMock.mockResolvedValue({ data: { mode: 'swap', tier: 'elite' }, error: null });
    renderPricing();
    await clickTier(/upgrade to elite/i);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/dashboard?checkout=complete'));
    expect(screen.queryByTestId('checkout-modal')).toBeNull();
  });

  it('a { mode:portal_required } response invokes create-stripe-portal and redirects to the url', async () => {
    invokeMock
      .mockResolvedValueOnce({ data: { mode: 'portal_required' }, error: null })
      .mockResolvedValueOnce({ data: { url: 'https://portal.stripe.test/s/1' }, error: null });
    renderPricing();
    await clickTier(/upgrade to elite/i);

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('create-stripe-portal'));
    await waitFor(() => expect(window.location.href).toBe('https://portal.stripe.test/s/1'));
    expect(screen.queryByTestId('checkout-modal')).toBeNull();
  });

  it('portal_required with a failed/no-url portal invoke surfaces toast.error and does NOT navigate', async () => {
    invokeMock
      .mockResolvedValueOnce({ data: { mode: 'portal_required' }, error: null })
      .mockResolvedValueOnce({ data: { error: 'no_customer' }, error: null });
    renderPricing();
    await clickTier(/upgrade to elite/i);

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(window.location.href).toBe('');
  });
});

// ── quick 260727-0s6: perceived-instant checkout + single-session guard ──
describe('Pricing checkout dialog responsiveness (quick 260727-0s6)', () => {
  /**
   * Makes the FIRST create-checkout-session invoke hang until the returned
   * `resolve` is called, so we can observe the UI while the request is in
   * flight. Subsequent invokes (e.g. create-stripe-portal) use `fallback`.
   */
  function deferInvoke(fallback: unknown = { data: null, error: null }) {
    let resolve!: (v: unknown) => void;
    const pending = new Promise((r) => {
      resolve = r as (v: unknown) => void;
    });
    invokeMock.mockReturnValueOnce(pending);
    invokeMock.mockResolvedValue(fallback);
    return { resolve: (v: unknown) => act(async () => { resolve(v); }) };
  }

  it('shows the checkout dialog on the click tick, before the session resolves', async () => {
    const { resolve } = deferInvoke();
    renderPricing();
    await clickTier(/upgrade to elite/i);

    // Dialog is already mounted while the edge request is still in flight —
    // no secret yet, so StripeCheckoutWrapper renders "Preparing secure checkout…".
    const modal = screen.getByTestId('checkout-modal');
    expect(modal).toHaveAttribute('data-secret', '');
    expect(modal).toHaveAttribute('data-title', 'Subscribe to elite');

    await resolve({ data: { clientSecret: 'cs_test_x' }, error: null });

    await waitFor(() =>
      expect(screen.getByTestId('checkout-modal')).toHaveAttribute('data-secret', 'cs_test_x'),
    );
  });

  it('creates exactly ONE Stripe session under rapid repeated clicks', async () => {
    const { resolve } = deferInvoke();
    renderPricing();

    await clickTier(/upgrade to elite/i);
    await clickTier(/upgrade to elite/i);
    await clickTier(/upgrade to elite/i);
    await clickTier(/upgrade to elite/i);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith(
      'create-checkout-session',
      expect.objectContaining({
        body: expect.objectContaining({ mode: 'subscription', tier: 'elite' }),
      }),
    );

    await resolve({ data: { clientSecret: 'cs_test_x' }, error: null });
  });

  it('closes the dialog with a toast when the session request fails', async () => {
    const { resolve } = deferInvoke();
    renderPricing();
    await clickTier(/upgrade to elite/i);
    expect(screen.getByTestId('checkout-modal')).toBeInTheDocument();

    await resolve({ data: null, error: { message: 'boom' } });

    await waitFor(() => expect(screen.queryByTestId('checkout-modal')).toBeNull());
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it('closes the dialog before navigating on a { mode:swap } response', async () => {
    const { resolve } = deferInvoke();
    renderPricing();
    await clickTier(/upgrade to elite/i);
    expect(screen.getByTestId('checkout-modal')).toBeInTheDocument();

    await resolve({ data: { mode: 'swap', tier: 'elite' }, error: null });

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/dashboard?checkout=complete'));
    expect(screen.queryByTestId('checkout-modal')).toBeNull();
  });

  it('closes the dialog on a { mode:portal_required } response', async () => {
    const { resolve } = deferInvoke({
      data: { url: 'https://portal.stripe.test/s/9' },
      error: null,
    });
    renderPricing();
    await clickTier(/upgrade to elite/i);
    expect(screen.getByTestId('checkout-modal')).toBeInTheDocument();

    await resolve({ data: { mode: 'portal_required' }, error: null });

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('create-stripe-portal'));
    expect(screen.queryByTestId('checkout-modal')).toBeNull();
  });

  it('releases the click guard so a retry after a failure still opens checkout', async () => {
    const first = deferInvoke();
    renderPricing();
    await clickTier(/upgrade to elite/i);
    await first.resolve({ data: null, error: { message: 'boom' } });
    await waitFor(() => expect(screen.queryByTestId('checkout-modal')).toBeNull());

    invokeMock.mockResolvedValue({ data: { clientSecret: 'cs_test_retry' }, error: null });
    await clickTier(/upgrade to elite/i);

    await waitFor(() =>
      expect(screen.getByTestId('checkout-modal')).toHaveAttribute('data-secret', 'cs_test_retry'),
    );
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});

describe('Pricing scheduled downgrade membership state', () => {
  it('keeps signed-out, normal Free, and normal Elite visits free of downgrade status', () => {
    const { rerender } = renderPricing();
    expect(screen.queryByRole('heading', { name: /downgrade scheduled/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/automatic renewal is currently off/i)).not.toBeInTheDocument();

    authUser = { id: 'u1' };
    subscriptionState = {
      ...subscriptionState,
      userId: 'u1',
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
    };
    rerender(
      <HelmetProvider>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter><Pricing /></MemoryRouter>
        </QueryClientProvider>
      </HelmetProvider>,
    );
    expect(screen.queryByText(/automatic renewal is currently off/i)).not.toBeInTheDocument();

    currentTier = 'elite';
    subscriptionState = {
      ...subscriptionState,
      subscriptionTier: 'elite',
      subscriptionStatus: 'active',
    };
    rerender(
      <HelmetProvider>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter><Pricing /></MemoryRouter>
        </QueryClientProvider>
      </HelmetProvider>,
    );
    expect(screen.queryByText(/automatic renewal is currently off/i)).not.toBeInTheDocument();
  });

  it('renders the dated panel immediately before Elite Current and Free Scheduled cards', () => {
    setPendingDowngrade();
    renderPricing();

    const heading = screen.getByRole('heading', {
      name: 'Your Elite access ends on March 15, 2030.',
    });
    expect(screen.getByText(
      'Elite stays active through this date. Then your account moves to Free. Automatic renewal is currently off.',
    )).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Current plan' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Scheduled' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep Elite and renew' })).toBeEnabled();

    const panel = heading.closest('section');
    const grid = screen.getByRole('region', { name: 'Subscription tiers' });
    expect(panel).not.toBeNull();
    expect(panel!.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the panel and renewal action visible without estimating a missing date', () => {
    setPendingDowngrade(null);
    renderPricing();

    expect(screen.getByRole('heading', { name: 'Downgrade scheduled' })).toBeInTheDocument();
    expect(screen.getByText(
      'We’re confirming your exact Elite end date. Elite remains active while your membership status syncs.',
    )).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep Elite and renew' })).toBeEnabled();
    expect(screen.queryByText(/ends on/i)).not.toBeInTheDocument();
  });

  it('seeds provisional pending state immediately after cancellation and prevents a second downgrade', async () => {
    authUser = { id: 'u1' };
    currentTier = 'elite';
    subscriptionState = {
      ...subscriptionState,
      userId: 'u1',
      subscriptionTier: 'elite',
      subscriptionStatus: 'active',
    };
    invokeMock.mockResolvedValue({
      data: { ok: true, current_period_end: 1900000000 },
      error: null,
    });
    renderPricing();

    await clickTier(/start free/i);
    await screen.findByRole('alertdialog');
    await clickTier(/downgrade to free/i);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Scheduled' })).toBeDisabled());
    expect(screen.getByText(/your elite access ends on/i)).toBeInTheDocument();
    expect(refreshSubscriptionMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledTimes(1);

    const scheduled = screen.getByRole('button', { name: 'Scheduled' });
    scheduled.click();
    fireEvent.keyDown(scheduled, { key: 'Enter' });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading', { name: /downgrade to free/i })).not.toBeInTheDocument();
  });

  it('retires provisional pending once authoritative pending is observed, then lets cleared authoritative truth win (CR-01)', async () => {
    authUser = { id: 'u1' };
    currentTier = 'elite';
    subscriptionState = {
      ...subscriptionState,
      userId: 'u1',
      subscriptionTier: 'elite',
      subscriptionStatus: 'active',
      isPendingDowngrade: false,
    };
    invokeMock.mockResolvedValue({
      data: { ok: true, current_period_end: 1900000000 },
      error: null,
    });
    const { rerender } = renderPricing();

    // 1. Seed provisional pending via a successful cancel-subscription confirm.
    await clickTier(/start free/i);
    await screen.findByRole('alertdialog');
    await clickTier(/downgrade to free/i);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Scheduled' })).toBeDisabled());

    // 2. Authoritative query catches up: pending is now confirmed by the profile.
    subscriptionState = {
      ...subscriptionState,
      userId: 'u1',
      subscriptionTier: 'elite',
      subscriptionStatus: 'active',
      pendingDowngradeTier: 'free',
      currentPeriodEnd: new Date(2030, 2, 15, 12, 0, 0),
      isPendingDowngrade: true,
    };
    rerender(
      <HelmetProvider>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter><Pricing /></MemoryRouter>
        </QueryClientProvider>
      </HelmetProvider>,
    );
    // Still pending — now driven by authoritative truth (provisional retired).
    await waitFor(() => expect(screen.getByRole('button', { name: 'Scheduled' })).toBeDisabled());

    // 3. Authoritative clears the pending downgrade (e.g. renewal reversed it).
    subscriptionState = {
      ...subscriptionState,
      userId: 'u1',
      subscriptionTier: 'elite',
      subscriptionStatus: 'active',
      pendingDowngradeTier: null,
      currentPeriodEnd: null,
      isPendingDowngrade: false,
    };
    rerender(
      <HelmetProvider>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter><Pricing /></MemoryRouter>
        </QueryClientProvider>
      </HelmetProvider>,
    );

    // Provisional no longer outranks the later authoritative truth: no pending
    // panel, no Scheduled mapping, and Free is available again.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Scheduled' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(/automatic renewal is currently off/i)).not.toBeInTheDocument();
    const freeCard = screen.getByLabelText('Free tier card');
    expect(within(freeCard).getByRole('button', { name: 'Start free' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Current plan' })).toBeDisabled();
  });

  it('closes the downgrade dialog when the authenticated subscription user changes while open (WR-01)', async () => {
    authUser = { id: 'u1' };
    currentTier = 'elite';
    subscriptionState = {
      ...subscriptionState,
      userId: 'u1',
      subscriptionTier: 'elite',
      subscriptionStatus: 'active',
    };
    const { rerender } = renderPricing();

    await clickTier(/start free/i);
    await screen.findByRole('alertdialog');

    // Authenticated session becomes user B before any confirmation.
    authUser = { id: 'u2' };
    currentTier = 'free';
    subscriptionState = {
      ...subscriptionState,
      userId: 'u2',
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
    };
    rerender(
      <HelmetProvider>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter><Pricing /></MemoryRouter>
        </QueryClientProvider>
      </HelmetProvider>,
    );

    // The stale confirmation dialog is closed/reset on the identity change.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(invokeMock).not.toHaveBeenCalledWith('cancel-subscription');
  });

  it('blocks a downgrade confirmation after the authenticated session changes (WR-01)', async () => {
    authUser = { id: 'u1' };
    currentTier = 'elite';
    subscriptionState = {
      ...subscriptionState,
      userId: 'u1',
      subscriptionTier: 'elite',
      subscriptionStatus: 'active',
    };
    invokeMock.mockResolvedValue({
      data: { ok: true, current_period_end: 1900000000 },
      error: null,
    });
    renderPricing();

    // Open the dialog as user A.
    await clickTier(/start free/i);
    await screen.findByRole('alertdialog');

    // The authenticated session swaps to user B while the dialog stays open
    // (the subscription query has not yet caught up).
    authUser = { id: 'u2' };

    // Confirming re-reads the current user, detects the mismatch, and aborts.
    await clickTier(/downgrade to free/i);

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(invokeMock).not.toHaveBeenCalledWith('cancel-subscription');
    // No provisional success state leaked in.
    expect(screen.queryByRole('button', { name: 'Scheduled' })).not.toBeInTheDocument();
    expect(screen.queryByText(/your elite access ends on/i)).not.toBeInTheDocument();
  });

  it('drops provisional billing state when the authenticated user changes', async () => {
    authUser = { id: 'u1' };
    currentTier = 'elite';
    subscriptionState = {
      ...subscriptionState,
      userId: 'u1',
      subscriptionTier: 'elite',
      subscriptionStatus: 'active',
    };
    invokeMock.mockResolvedValue({
      data: { ok: true, current_period_end: 1900000000 },
      error: null,
    });
    const { rerender } = renderPricing();

    await clickTier(/start free/i);
    await screen.findByRole('alertdialog');
    await clickTier(/downgrade to free/i);
    await screen.findByRole('button', { name: 'Scheduled' });

    authUser = { id: 'u2' };
    currentTier = 'free';
    subscriptionState = {
      ...subscriptionState,
      userId: 'u2',
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      pendingDowngradeTier: null,
      currentPeriodEnd: null,
      isPendingDowngrade: false,
    };
    rerender(
      <HelmetProvider>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter><Pricing /></MemoryRouter>
        </QueryClientProvider>
      </HelmetProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/automatic renewal is currently off/i)).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Current plan' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Scheduled' })).not.toBeInTheDocument();
  });

  it('locks renewal while processing and does not submit twice', async () => {
    setPendingDowngrade();
    invokeMock.mockImplementation((name: string) => {
      if (name !== 'renew-subscription') return Promise.resolve({ data: null, error: null });
      return new Promise(() => undefined);
    });
    renderPricing();

    await clickTier(/keep elite and renew/i);
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Keep Elite and renew' });
    await userEvent.click(confirm);

    expect(within(dialog).getByText('Restoring renewal…')).toBeInTheDocument();
    const restoring = within(dialog).getByRole('button', { name: 'Keep Elite and renew' });
    expect(restoring).toBeDisabled();
    restoring.click();
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Scheduled', hidden: true })).toBeDisabled();
  });

  it('preserves Scheduled and exposes Retry when renewal fails', async () => {
    setPendingDowngrade();
    invokeMock.mockResolvedValue({ data: null, error: { message: 'stripe unavailable' } });
    renderPricing();

    await clickTier(/keep elite and renew/i);
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep Elite and renew' }));

    expect(await within(dialog).findByText(/couldn’t restore automatic renewal/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Scheduled', hidden: true })).toBeDisabled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('immediately shows syncing and restores Free availability after Stripe confirmation', async () => {
    setPendingDowngrade();
    reconcileSubscriptionMock.mockResolvedValue('timed_out');
    invokeMock.mockResolvedValue({
      data: {
        ok: true,
        action: 'restore',
        cancel_at_period_end: false,
        current_period_end: 1900000000,
      },
      error: null,
    });
    renderPricing();

    await clickTier(/keep elite and renew/i);
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep Elite and renew' }));

    expect(await screen.findByRole('heading', {
      name: 'Renewal restored — syncing your membership status.',
      hidden: true,
    })).toBeInTheDocument();
    const freeAction = screen.getByLabelText('Free tier card').querySelector('button');
    expect(freeAction).toBeEnabled();
    expect(freeAction).toHaveAccessibleName('Start free');
    expect(toastSuccessMock).toHaveBeenCalledWith(
      'Automatic renewal is on.',
      expect.objectContaining({ description: expect.stringContaining('2030') }),
    );
  });

  it('replaces syncing with mounted-visit confirmation after profile reconciliation', async () => {
    setPendingDowngrade();
    reconcileSubscriptionMock.mockResolvedValue('reconciled');
    invokeMock.mockResolvedValue({
      data: {
        ok: true,
        action: 'restore',
        cancel_at_period_end: false,
        current_period_end: 1900000000,
      },
      error: null,
    });
    renderPricing();

    await clickTier(/keep elite and renew/i);
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep Elite and renew' }));

    await waitFor(() => expect(screen.getAllByRole('heading', {
      name: 'Automatic renewal is on.',
      hidden: true,
    }).length).toBeGreaterThanOrEqual(1));
    expect(screen.getAllByText('Your Elite access will continue without interruption.').length)
      .toBeGreaterThanOrEqual(1);
    const freeAction = screen.getByLabelText('Free tier card').querySelector('button');
    expect(freeAction).toBeEnabled();
  });
});

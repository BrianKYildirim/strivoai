/**
 * StripeCheckoutWrapper — regression tests for debug session
 * `stripe-checkout-key-mismatch` (2026-07-17).
 *
 * Production reproduction: bundle built with pk_test_ (Vercel Production env)
 * calling PROD Supabase whose STRIPE_SECRET_KEY is sk_live_ → the edge fn returns
 * a cs_live_ secret. Stripe.js only console-warned, then failed late with a
 * misleading 404. These tests prove we now refuse to mount instead.
 *
 * The component reads VITE_STRIPE_PUBLISHABLE_KEY at MODULE scope, so the env stub
 * must be hoisted above the import (same pattern as StripePaymentElementModal.test).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.hoisted(() => {
  vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_wrapper_spec');
});

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(() => Promise.resolve({ __fake: true })),
}));

vi.mock('@stripe/react-stripe-js', () => ({
  EmbeddedCheckoutProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="embedded-provider">{children}</div>
  ),
  EmbeddedCheckout: () => <div>embedded checkout</div>,
}));

const toastErrorMock = vi.fn();
const reportDiagnosticMock = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (message: string) => toastErrorMock(message) },
}));
vi.mock('@/lib/diagnostics/client-diagnostics', () => ({
  reportDiagnostic: (input: unknown) => reportDiagnosticMock(input),
}));

import { StripeCheckoutWrapper } from './StripeCheckoutWrapper';

const noop = () => {};

describe('StripeCheckoutWrapper mode guard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toastErrorMock.mockReset();
    reportDiagnosticMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mounts EmbeddedCheckout when the session mode matches the publishable key (test/test)', () => {
    render(
      <StripeCheckoutWrapper open onOpenChange={noop} clientSecret="cs_test_abc" title="Elite" />,
    );
    expect(screen.getByTestId('embedded-checkout')).toBeInTheDocument();
    expect(screen.queryByTestId('checkout-unavailable')).not.toBeInTheDocument();
  });

  it('REGRESSION: refuses to mount on the production mismatch (pk_test_ key + cs_live_ session)', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <StripeCheckoutWrapper open onOpenChange={noop} clientSecret="cs_live_abc" title="Elite" />,
    );

    // The broken state must NOT render a payment form.
    expect(screen.queryByTestId('embedded-checkout')).not.toBeInTheDocument();
    expect(screen.getByTestId('checkout-unavailable')).toBeInTheDocument();

    // ...and must say precisely what is wrong, without leaking key material.
    const msg = err.mock.calls[0][0] as string;
    expect(msg).toContain('TEST');
    expect(msg).toContain('LIVE');
    expect(msg).toContain('REDEPLOY');
    expect(msg).not.toContain('pk_test_wrapper_spec');
  });

  it('renders nothing while CLOSED with no clientSecret (no premature/double init)', () => {
    const { container } = render(
      <StripeCheckoutWrapper open={false} onOpenChange={noop} clientSecret={null} title="Elite" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the pending body while OPEN with no clientSecret (perceived-instant checkout)', () => {
    render(
      <StripeCheckoutWrapper open onOpenChange={noop} clientSecret={null} title="Elite" />,
    );
    const pending = screen.getByTestId('checkout-preparing');
    expect(pending).toBeInTheDocument();
    expect(pending).toHaveTextContent('Preparing secure checkout…');
    // Stripe must NOT be mounted before a secret exists.
    expect(screen.queryByTestId('embedded-checkout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('checkout-unavailable')).not.toBeInTheDocument();
  });

  it('keeps the close icon compact inside a 48px checkout hit target', () => {
    render(
      <StripeCheckoutWrapper open onOpenChange={noop} clientSecret={null} title="Elite" />,
    );

    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveClass('h-12', 'w-12');
    expect(close.querySelector('svg')).toHaveClass('h-4', 'w-4');
  });

  it('closes and reports safe mapped copy after 15000ms, then permits a retry', async () => {
    vi.useFakeTimers();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <StripeCheckoutWrapper open onOpenChange={onOpenChange} clientSecret={null} title="Elite" />,
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
      <StripeCheckoutWrapper open onOpenChange={onOpenChange} clientSecret={null} title="Elite" />,
    );
    await vi.advanceTimersByTimeAsync(14999);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('clears the pending timeout when a client secret arrives', async () => {
    vi.useFakeTimers();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <StripeCheckoutWrapper open onOpenChange={onOpenChange} clientSecret={null} title="Elite" />,
    );
    rerender(
      <StripeCheckoutWrapper open onOpenChange={onOpenChange} clientSecret="cs_test_abc" title="Elite" />,
    );
    await vi.advanceTimersByTimeAsync(15000);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});

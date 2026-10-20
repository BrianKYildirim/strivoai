/**
 * useStripeCheckout — fetchClientSecret contract tests (SHOP-05).
 *
 * Asserts:
 * - invokes 'create-checkout-session' with ui_mode: 'embedded' merged into params
 * - returns clientSecret from edge response on success
 * - returns null when there is no local session (signed out)
 * - never performs a getUser() network round trip on the critical path
 *   (quick 260727-0s6: that RTT delayed the checkout dialog by a full request)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const invokeMock = vi.fn();
const getUserMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: () => getUserMock(),
      getSession: () => getSessionMock(),
    },
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

import { useStripeCheckout } from './useStripeCheckout';

beforeEach(() => {
  invokeMock.mockReset();
  getUserMock.mockReset();
  getSessionMock.mockReset();
});

describe('useStripeCheckout.fetchClientSecret', () => {
  it('invokes create-checkout-session with ui_mode: "embedded"', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    invokeMock.mockResolvedValue({ data: { clientSecret: 'cs_test_123' }, error: null });

    const { result } = renderHook(() => useStripeCheckout());

    let secret: string | null = null;
    await act(async () => {
      secret = await result.current.fetchClientSecret({
        mode: 'payment',
        pack_size: 25,
      });
    });

    expect(secret).toBe('cs_test_123');
    // The pre-invoke /auth/v1/user round trip is gone — the local session read
    // is the only auth check on the critical path.
    expect(getUserMock).not.toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith(
      'create-checkout-session',
      expect.objectContaining({
        body: expect.objectContaining({
          mode: 'payment',
          pack_size: 25,
          ui_mode: 'embedded',
        }),
      }),
    );
  });

  it('returns null when getSession yields no session (signed out)', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    const { result } = renderHook(() => useStripeCheckout());

    let secret: string | null = null;
    await act(async () => {
      secret = await result.current.fetchClientSecret({
        mode: 'subscription',
        tier: 'pro',
        interval: 'monthly',
      });
    });

    expect(secret).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('returns null when the edge function returns an error', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const { result } = renderHook(() => useStripeCheckout());

    let secret: string | null = null;
    await act(async () => {
      secret = await result.current.fetchClientSecret({
        mode: 'payment',
        pack_size: 10,
      });
    });

    expect(secret).toBeNull();
  });
});

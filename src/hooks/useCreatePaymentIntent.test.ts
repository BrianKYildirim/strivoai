/**
 * useCreatePaymentIntent — hook contract tests (Phase 24 Plan 06, TOPUP-05).
 *
 * Behavior verified:
 *   T1  Successful invoke → returns { clientSecret, paymentIntentId }
 *   T2  Invoke error      → returns null + toast.error + isLoading=false
 *   T3  Unauthenticated   → toast.error('Please sign in first'), no invoke call
 *   T4  isLoading toggles true during call, false after
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── mocks (hoisted) ───────────────────────────────────────────────
const getUserMock = vi.fn();
const invokeMock = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: { getUser: () => getUserMock() },
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

const toastErrorMock = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (msg: string) => toastErrorMock(msg) },
}));

import { useCreatePaymentIntent } from './useCreatePaymentIntent';

beforeEach(() => {
  getUserMock.mockReset();
  invokeMock.mockReset();
  toastErrorMock.mockReset();
});

describe('useCreatePaymentIntent', () => {
  it('T1: returns { clientSecret, paymentIntentId } on successful invoke', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    invokeMock.mockResolvedValue({
      data: { clientSecret: 'pi_test_secret', paymentIntentId: 'pi_test_123' },
      error: null,
    });
    const { result } = renderHook(() => useCreatePaymentIntent());
    let out: { clientSecret: string; paymentIntentId: string } | null = null;
    await act(async () => {
      out = await result.current.create('pack_25');
    });
    expect(out).toEqual({ clientSecret: 'pi_test_secret', paymentIntentId: 'pi_test_123' });
    expect(invokeMock).toHaveBeenCalledWith('create-payment-intent', {
      body: { pack_id: 'pack_25' },
    });
  });

  it('T2: invoke error → returns null + toast.error + isLoading resets', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => useCreatePaymentIntent());
    let out: unknown = 'sentinel';
    await act(async () => {
      out = await result.current.create('pack_3');
    });
    expect(out).toBeNull();
    expect(toastErrorMock).toHaveBeenCalledWith(
      'Could not start top-up purchase. Please try again.',
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('T3: unauthenticated → toast.error("Please sign in first"), no invoke', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { result } = renderHook(() => useCreatePaymentIntent());
    let out: unknown = 'sentinel';
    await act(async () => {
      out = await result.current.create('pack_10');
    });
    expect(out).toBeNull();
    expect(toastErrorMock).toHaveBeenCalledWith('Please sign in first');
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('T4: isLoading toggles true during call, false after resolve', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    let resolveInvoke: (v: unknown) => void = () => {};
    invokeMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInvoke = resolve;
        }),
    );
    const { result } = renderHook(() => useCreatePaymentIntent());
    expect(result.current.isLoading).toBe(false);
    let pending: Promise<unknown> | null = null;
    act(() => {
      pending = result.current.create('pack_50');
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    await act(async () => {
      resolveInvoke({
        data: { clientSecret: 'cs', paymentIntentId: 'pi' },
        error: null,
      });
      await pending;
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('T2b: data present but missing clientSecret → null + toast.error', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    invokeMock.mockResolvedValue({
      data: { paymentIntentId: 'pi_only' },
      error: null,
    });
    const { result } = renderHook(() => useCreatePaymentIntent());
    let out: unknown = 'sentinel';
    await act(async () => {
      out = await result.current.create('pack_25');
    });
    expect(out).toBeNull();
    expect(toastErrorMock).toHaveBeenCalledWith(
      'Could not start top-up purchase. Please try again.',
    );
  });
});

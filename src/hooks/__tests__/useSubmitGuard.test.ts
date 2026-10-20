import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { installCryptoRandomUUID } from '@/lib/polyfills/crypto-random-uuid';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function renderGuard(
  feature = 'resume-analysis',
  inputIdentity = 'resume-a',
  terminalState: string | null = null,
) {
  return renderHook(
    ({ state }) => useSubmitGuard({
      feature,
      inputIdentity,
      leaseMs: 1_000,
      terminalState: state,
    }),
    { initialProps: { state: terminalState } },
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useSubmitGuard', () => {
  it('collapses two synchronous starts before any caller work can run', () => {
    const { result } = renderGuard();
    let first = null;
    let second = null;
    act(() => {
      first = result.current.beginSubmit();
      second = result.current.beginSubmit();
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('keeps one nonce stable and mints a new nonce for an explicit rerun', () => {
    const { result } = renderGuard();
    const initialNonce = result.current.attemptNonce;
    const first = result.current.beginSubmit();
    expect(first?.attemptNonce).toBe(initialNonce);
    act(() => result.current.endSubmit(first!));
    let rerun = null;
    act(() => {
      rerun = result.current.beginRerun();
    });
    expect(rerun).not.toBeNull();
    expect(rerun!.attemptNonce).not.toBe(initialNonce);
  });

  it('releases after success or error and permits a subsequent submit', () => {
    const { result } = renderGuard();
    const first = result.current.beginSubmit()!;
    act(() => result.current.endSubmit(first));
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.beginSubmit()).not.toBeNull();
  });

  it('releases and resets the attempt when a terminal state arrives', () => {
    const { result, rerender } = renderGuard();
    const first = result.current.beginSubmit()!;
    rerender({ state: 'completed' });
    expect(result.current.isSubmitting).toBe(false);
    const next = result.current.beginSubmit();
    expect(next?.attemptNonce).not.toBe(first.attemptNonce);
  });

  it('releases its lock on unmount', () => {
    const first = renderGuard();
    expect(first.result.current.beginSubmit()).not.toBeNull();
    first.unmount();
    const second = renderGuard();
    expect(second.result.current.beginSubmit()).not.toBeNull();
  });

  it('bounds a leaked lock with a lease timeout', () => {
    vi.useFakeTimers();
    const { result } = renderGuard();
    expect(result.current.beginSubmit()).not.toBeNull();
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.beginSubmit()).not.toBeNull();
  });

  it('scopes locks independently by feature and input identity', () => {
    const resumeA = renderGuard('resume-analysis', 'a');
    const linkedinA = renderGuard('linkedin-grader', 'a');
    const resumeB = renderGuard('resume-analysis', 'b');

    expect(resumeA.result.current.beginSubmit()).not.toBeNull();
    expect(linkedinA.result.current.beginSubmit()).not.toBeNull();
    expect(resumeB.result.current.beginSubmit()).not.toBeNull();
  });

  it('uses the installed RFC-4122 v4 fallback when native randomUUID is absent', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
    try {
      installCryptoRandomUUID();
      const { result } = renderGuard('fallback', 'uuid');
      expect(result.current.attemptNonce).toMatch(UUID_V4);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: original });
    }
  });

  it('exposes aria state without a disabled attribute', () => {
    const { result } = renderGuard();
    expect(result.current.ariaProps.cta).toEqual({ 'aria-disabled': false });
    expect(result.current.ariaProps.form).toEqual({ 'aria-busy': false });
    expect(result.current.ariaProps.cta).not.toHaveProperty('disabled');

    act(() => {
      result.current.beginSubmit();
    });
    expect(result.current.ariaProps.cta).toEqual({ 'aria-disabled': true });
    expect(result.current.ariaProps.form).toEqual({ 'aria-busy': true });
  });
});

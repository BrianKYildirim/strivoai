/**
 * TopUpProvider — integration contract tests (Phase 24 Plan 06).
 *
 * Mocks useCreatePaymentIntent + StripePaymentElementModal so the test focuses
 * on the CustomEvent listener + state-machine wiring.
 *
 * T1: 'topup:open' with detail.packId='pack_25' → modal mounted with packId.
 * T2: onOpenChange(false) → packId + clientSecret cleared.
 * T3: Invalid packId → console.warn, modal NOT opened.
 * T4: Unmount removes the event listener.
 * T5: create() returns null → modal closed (graceful failure path).
 *
 * quick 260727-0s6 (same-pack de-duplication):
 * T6: 3 rapid 'topup:open' for the SAME pack → create() called exactly once.
 * T7: a DIFFERENT pack mid-flight still supersedes (WR-01 preserved).
 * T8: closing the dialog releases the guard so the same pack can be retried.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ── mocks ─────────────────────────────────────────────────────────
const createMock = vi.fn();

vi.mock('@/hooks/useCreatePaymentIntent', () => ({
  useCreatePaymentIntent: () => ({
    isLoading: false,
    create: createMock,
  }),
}));

const modalRenderLog: Array<{
  open: boolean;
  packId: string | null;
  clientSecret: string | null;
}> = [];

vi.mock('./StripePaymentElementModal', () => ({
  StripePaymentElementModal: (props: {
    open: boolean;
    packId: string | null;
    clientSecret: string | null;
    onOpenChange: (v: boolean) => void;
  }) => {
    modalRenderLog.push({
      open: props.open,
      packId: props.packId,
      clientSecret: props.clientSecret,
    });
    return React.createElement(
      'div',
      {
        'data-testid': 'mock-modal',
        'data-open': String(props.open),
        'data-pack-id': props.packId ?? '',
        'data-client-secret': props.clientSecret ?? '',
        onClick: () => props.onOpenChange(false),
      },
      'modal',
    );
  },
}));

import { TopUpProvider } from './TopUpProvider';

beforeEach(() => {
  createMock.mockReset();
  modalRenderLog.length = 0;
});

describe('TopUpProvider', () => {
  it('T1: topup:open with valid packId → modal opens with packId set', async () => {
    createMock.mockResolvedValue({
      clientSecret: 'cs_test_abc',
      paymentIntentId: 'pi_test_1',
    });
    render(
      <TopUpProvider>
        <div>child</div>
      </TopUpProvider>,
    );
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('topup:open', { detail: { packId: 'pack_25' } }),
      );
    });
    await waitFor(() => expect(createMock).toHaveBeenCalledWith('pack_25'));
    const modal = screen.getByTestId('mock-modal');
    await waitFor(() => expect(modal.getAttribute('data-open')).toBe('true'));
    await waitFor(() => expect(modal.getAttribute('data-pack-id')).toBe('pack_25'));
    await waitFor(() =>
      expect(modal.getAttribute('data-client-secret')).toBe('cs_test_abc'),
    );
  });

  it('T2: onOpenChange(false) → packId + clientSecret cleared', async () => {
    createMock.mockResolvedValue({
      clientSecret: 'cs_test_abc',
      paymentIntentId: 'pi_test_1',
    });
    render(
      <TopUpProvider>
        <div>child</div>
      </TopUpProvider>,
    );
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('topup:open', { detail: { packId: 'pack_25' } }),
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId('mock-modal').getAttribute('data-open')).toBe(
        'true',
      ),
    );
    await act(async () => {
      screen.getByTestId('mock-modal').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('mock-modal').getAttribute('data-open')).toBe(
        'false',
      ),
    );
    expect(screen.getByTestId('mock-modal').getAttribute('data-pack-id')).toBe('');
    expect(
      screen.getByTestId('mock-modal').getAttribute('data-client-secret'),
    ).toBe('');
  });

  it('T2b: dismissal restores focus to the event-owning top-up trigger', async () => {
    createMock.mockImplementation(() => new Promise(() => {}));
    render(
      <TopUpProvider>
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent('topup:open', { detail: { packId: 'pack_25' } }),
            );
          }}
        >
          Buy pack
        </button>
      </TopUpProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Buy pack' });
    trigger.focus();
    await act(async () => trigger.click());
    await waitFor(() =>
      expect(screen.getByTestId('mock-modal').getAttribute('data-open')).toBe('true'),
    );
    await act(async () => screen.getByTestId('mock-modal').click());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('T2c: pointer-trigger focus restores when the browser does not focus buttons on click', async () => {
    createMock.mockImplementation(() => new Promise(() => {}));
    render(
      <TopUpProvider>
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent('topup:open', { detail: { packId: 'pack_25' } }),
            );
          }}
        >
          Pointer buy
        </button>
      </TopUpProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Pointer buy' });
    fireEvent.pointerDown(trigger);
    document.body.focus();
    await act(async () => trigger.click());
    await waitFor(() =>
      expect(screen.getByTestId('mock-modal').getAttribute('data-open')).toBe('true'),
    );
    await act(async () => screen.getByTestId('mock-modal').click());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('T3: invalid packId → console.warn, modal stays closed, no create call', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <TopUpProvider>
        <div>child</div>
      </TopUpProvider>,
    );
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('topup:open', { detail: { packId: 'pack_99' } }),
      );
    });
    expect(createMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(screen.getByTestId('mock-modal').getAttribute('data-open')).toBe(
      'false',
    );
    warnSpy.mockRestore();
  });

  it('T4: unmount removes the topup:open listener', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(
      <TopUpProvider>
        <div>child</div>
      </TopUpProvider>,
    );
    const addedCall = addSpy.mock.calls.find(([evt]) => evt === 'topup:open');
    expect(addedCall).toBeDefined();
    unmount();
    const removedCall = removeSpy.mock.calls.find(
      ([evt]) => evt === 'topup:open',
    );
    expect(removedCall).toBeDefined();
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('T5: create() returns null → modal closes + state cleared', async () => {
    createMock.mockResolvedValue(null);
    render(
      <TopUpProvider>
        <div>child</div>
      </TopUpProvider>,
    );
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('topup:open', { detail: { packId: 'pack_10' } }),
      );
    });
    await waitFor(() => expect(createMock).toHaveBeenCalledWith('pack_10'));
    await waitFor(() =>
      expect(screen.getByTestId('mock-modal').getAttribute('data-open')).toBe(
        'false',
      ),
    );
    expect(screen.getByTestId('mock-modal').getAttribute('data-pack-id')).toBe('');
  });

  // ── quick 260727-0s6: same-pack de-duplication ────────────────────
  type Intent = { clientSecret: string; paymentIntentId: string };

  function deferred() {
    let resolve!: (v: Intent) => void;
    const promise = new Promise<Intent>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  const dispatchTopUp = (packId: string) =>
    act(async () => {
      window.dispatchEvent(new CustomEvent('topup:open', { detail: { packId } }));
    });

  it('T6: three rapid topup:open events for the SAME pack → create() called once', async () => {
    const pending = deferred();
    createMock.mockReturnValue(pending.promise);
    render(
      <TopUpProvider>
        <div>child</div>
      </TopUpProvider>,
    );

    await dispatchTopUp('pack_25');
    await dispatchTopUp('pack_25');
    await dispatchTopUp('pack_25');

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith('pack_25');
    expect(screen.getByTestId('mock-modal').getAttribute('data-open')).toBe('true');

    await act(async () => {
      pending.resolve({ clientSecret: 'cs_t6', paymentIntentId: 'pi_t6' });
    });
    await waitFor(() =>
      expect(screen.getByTestId('mock-modal').getAttribute('data-client-secret')).toBe('cs_t6'),
    );
  });

  it('T7: a different pack mid-flight still supersedes and only its secret is applied (WR-01)', async () => {
    const a = deferred();
    const b = deferred();
    createMock.mockImplementation((packId: string) =>
      packId === 'pack_25' ? a.promise : b.promise,
    );
    render(
      <TopUpProvider>
        <div>child</div>
      </TopUpProvider>,
    );

    await dispatchTopUp('pack_25');
    await dispatchTopUp('pack_10');
    expect(createMock).toHaveBeenCalledTimes(2);

    // The superseded pack_25 result lands first and must be discarded.
    await act(async () => {
      a.resolve({ clientSecret: 'cs_stale_A', paymentIntentId: 'pi_A' });
    });
    await act(async () => {
      b.resolve({ clientSecret: 'cs_fresh_B', paymentIntentId: 'pi_B' });
    });

    await waitFor(() =>
      expect(screen.getByTestId('mock-modal').getAttribute('data-client-secret')).toBe('cs_fresh_B'),
    );
    expect(screen.getByTestId('mock-modal').getAttribute('data-pack-id')).toBe('pack_10');
  });

  it('T8: closing the dialog releases the guard so the same pack can be retried', async () => {
    const pending = deferred();
    createMock.mockReturnValue(pending.promise);
    render(
      <TopUpProvider>
        <div>child</div>
      </TopUpProvider>,
    );

    await dispatchTopUp('pack_25');
    expect(createMock).toHaveBeenCalledTimes(1);

    // Close while the first create() is still in flight.
    await act(async () => {
      screen.getByTestId('mock-modal').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('mock-modal').getAttribute('data-open')).toBe('false'),
    );

    await dispatchTopUp('pack_25');
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});

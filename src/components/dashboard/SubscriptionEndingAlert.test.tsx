import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SubscriptionEndingAlert, type SubscriptionEndingAlertProps } from './SubscriptionEndingAlert';

const invokeMock = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

const reconcileMock = vi.fn().mockResolvedValue('reconciled');

function localDate(dayOffset: number, hour = 18): Date {
  return new Date(2026, 7, 1 + dayOffset, hour, 0, 0, 0);
}

function renderAlert(overrides: Partial<SubscriptionEndingAlertProps> = {}) {
  const props: SubscriptionEndingAlertProps = {
    userId: 'user-1',
    isPendingDowngrade: true,
    periodEnd: localDate(7),
    reconcilePendingDowngrade: reconcileMock,
    ...overrides,
  };
  return render(<SubscriptionEndingAlert {...props} />);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 1, 12, 0, 0, 0));
  window.sessionStorage.clear();
  invokeMock.mockReset();
  reconcileMock.mockReset();
  reconcileMock.mockResolvedValue('reconciled');
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SubscriptionEndingAlert final-week clock', () => {
  it.each([
    [8, null],
    [7, '7 days left'],
    [2, '2 days left'],
    [1, '1 day left'],
    [0, 'Elite ends today'],
  ])('renders the locked countdown at %i local calendar days', (days, expected) => {
    renderAlert({ periodEnd: localDate(days) });

    if (expected) {
      expect(screen.getByText(new RegExp(expected))).toBeInTheDocument();
      expect(screen.getByText(/August \d+, 2026/)).toBeInTheDocument();
    } else {
      expect(screen.queryByRole('heading', { name: 'Elite expiration reminder' })).not.toBeInTheDocument();
    }
  });

  it('appears when local midnight changes the calendar difference from 8 to 7 days', () => {
    vi.setSystemTime(new Date(2026, 7, 1, 23, 59, 0, 0));
    renderAlert({ periodEnd: new Date(2026, 7, 9, 12, 0, 0, 0) });
    expect(screen.queryByText(/7 days left/)).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(60_000));

    expect(screen.getByText(/7 days left/)).toBeInTheDocument();
  });

  it('removes the reminder at the exact period-end instant', () => {
    renderAlert({ periodEnd: new Date(2026, 7, 1, 13, 0, 0, 0) });
    expect(screen.getByText(/Elite ends today/)).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(60 * 60 * 1000));

    expect(screen.queryByRole('heading', { name: 'Elite expiration reminder' })).not.toBeInTheDocument();
  });

  it('cleans up old identity and billing-boundary timers', () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const { rerender } = renderAlert({ periodEnd: new Date(2026, 7, 1, 13, 0, 0, 0) });

    rerender(
      <SubscriptionEndingAlert
        userId="user-2"
        isPendingDowngrade
        periodEnd={localDate(2)}
        reconcilePendingDowngrade={reconcileMock}
      />,
    );

    expect(clearTimeoutSpy).toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(60 * 60 * 1000));
    expect(screen.getByText(/2 days left/)).toBeInTheDocument();
  });
});

describe('SubscriptionEndingAlert session dismissal', () => {
  it('persists only for the same user and period key in sessionStorage', () => {
    const periodEnd = localDate(2);
    const first = renderAlert({ periodEnd });
    fireEvent.click(screen.getByRole('button', {
      name: 'Dismiss Elite expiration reminder for this session',
    }));
    expect(screen.queryByRole('heading', { name: 'Elite expiration reminder' })).not.toBeInTheDocument();

    first.unmount();
    const second = renderAlert({ periodEnd });
    expect(screen.queryByRole('heading', { name: 'Elite expiration reminder' })).not.toBeInTheDocument();

    second.rerender(
      <SubscriptionEndingAlert
        userId="user-1"
        isPendingDowngrade
        periodEnd={localDate(3)}
        reconcilePendingDowngrade={reconcileMock}
      />,
    );
    expect(screen.getByText('Elite expiration reminder')).toBeInTheDocument();
  });

  it('falls back to component state when sessionStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    renderAlert();

    fireEvent.click(screen.getByRole('button', {
      name: 'Dismiss Elite expiration reminder for this session',
    }));

    expect(screen.queryByRole('heading', { name: 'Elite expiration reminder' })).not.toBeInTheDocument();
  });
});

describe('SubscriptionEndingAlert shared renewal recovery', () => {
  it('keeps the eligible reminder and shared dialog Retry after restore failure', async () => {
    vi.useRealTimers();
    const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
    invokeMock.mockResolvedValue({ data: { error: 'stripe_error' }, error: new Error('failed') });
    renderAlert({ periodEnd });

    fireEvent.click(screen.getByRole('button', { name: 'Keep Elite and renew' }));
    const actions = await screen.findAllByRole('button', { name: 'Keep Elite and renew' });
    fireEvent.click(actions[actions.length - 1]);

    expect(await screen.findByText(/couldn.t restore automatic renewal/i)).toBeInTheDocument();
    expect(screen.getByText('Elite expiration reminder')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('suppresses the warning immediately after explicit Stripe confirmation', async () => {
    vi.useRealTimers();
    const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
    invokeMock.mockResolvedValue({
      data: {
        ok: true,
        action: 'restore',
        current_period_end: Math.floor(periodEnd.getTime() / 1000),
        cancel_at_period_end: false,
      },
      error: null,
    });
    renderAlert({ periodEnd });

    fireEvent.click(screen.getByRole('button', { name: 'Keep Elite and renew' }));
    const actions = await screen.findAllByRole('button', { name: 'Keep Elite and renew' });
    fireEvent.click(actions[actions.length - 1]);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Elite expiration reminder' })).not.toBeInTheDocument();
    });
    expect(await screen.findByRole('heading', { name: 'Automatic renewal is on.' })).toBeInTheDocument();
  });
});

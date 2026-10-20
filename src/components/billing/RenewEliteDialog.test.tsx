import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccessMock(...args) },
}));

import { RenewEliteDialog } from './RenewEliteDialog';

const localRenewalDate = new Date(2027, 0, 15, 12);
const renewalSeconds = Math.floor(localRenewalDate.getTime() / 1000);

function Harness({
  periodEnd = localRenewalDate,
  onStripeConfirmed = vi.fn(),
  reconcilePendingDowngrade = vi.fn().mockResolvedValue('reconciled'),
  onProfileReconciled = vi.fn(),
}: Partial<React.ComponentProps<typeof RenewEliteDialog>>) {
  const [open, setOpen] = useState(false);
  return (
    <RenewEliteDialog
      open={open}
      onOpenChange={setOpen}
      periodEnd={periodEnd}
      onStripeConfirmed={onStripeConfirmed}
      reconcilePendingDowngrade={reconcilePendingDowngrade}
      onProfileReconciled={onProfileReconciled}
    />
  );
}

beforeEach(() => {
  invokeMock.mockReset();
  toastSuccessMock.mockReset();
});

describe('RenewEliteDialog', () => {
  it('opens read-only with exact disclosure and initial focus on Not now', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Keep Elite and renew' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Keep Elite and renew?' });
    expect(dialog).toHaveAccessibleDescription();
    expect(screen.getByText(/saved payment method will be charged on January 15, 2027/)).toBeInTheDocument();
    expect(screen.getByText(/continue without interruption/)).toBeInTheDocument();
    expect(screen.queryByText(/\$|price|per month|per year/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toHaveFocus();
    expect(dialog.querySelector('[aria-live="polite"]')).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('previews an absent date before enabling confirmation', async () => {
    let resolvePreview: ((value: unknown) => void) | undefined;
    invokeMock.mockReturnValue(new Promise((resolve) => { resolvePreview = resolve; }));
    const user = userEvent.setup();
    render(<Harness periodEnd={null} />);

    await user.click(screen.getByRole('button', { name: 'Keep Elite and renew' }));
    expect(screen.getByText('Confirming your renewal date…')).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith('renew-subscription', { body: { action: 'preview' } });
    expect(screen.getByRole('button', { name: 'Keep Elite and renew' })).toBeDisabled();

    resolvePreview?.({
      data: { ok: true, action: 'preview', current_period_end: renewalSeconds },
      error: null,
    });
    await waitFor(() => expect(screen.getByText(/January 15, 2027/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Keep Elite and renew' })).toBeEnabled();
  });

  it('keeps preview failure non-mutating and offers Retry', async () => {
    invokeMock.mockResolvedValue({ data: { error: 'preview_failed' }, error: new Error('provider') });
    const onStripeConfirmed = vi.fn();
    const user = userEvent.setup();
    render(<Harness periodEnd={null} onStripeConfirmed={onStripeConfirmed} />);

    await user.click(screen.getByRole('button', { name: 'Keep Elite and renew' }));
    await waitFor(() => expect(screen.getByText(
      'We couldn’t confirm your renewal date. Your downgrade is still scheduled. Try again.',
    )).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(onStripeConfirmed).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('prevents duplicate restore submissions and blocks closing while restoring', async () => {
    let resolveRestore: ((value: unknown) => void) | undefined;
    invokeMock.mockReturnValue(new Promise((resolve) => { resolveRestore = resolve; }));
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Keep Elite and renew' }));

    const renewButtons = screen.getAllByRole('button', { name: 'Keep Elite and renew' });
    const confirm = renewButtons[renewButtons.length - 1];
    await user.dblClick(confirm);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('renew-subscription', { body: { action: 'restore' } });
    expect(screen.getByText('Restoring renewal…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeDisabled();
    expect(screen.getByText('Restoring renewal…').querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    resolveRestore?.({
      data: { ok: true, action: 'restore', cancel_at_period_end: false, current_period_end: renewalSeconds },
      error: null,
    });
  });

  it('emits immediate Stripe confirmation, then confirms after bounded reconciliation', async () => {
    const onStripeConfirmed = vi.fn();
    const onProfileReconciled = vi.fn();
    let resolveReconciliation: ((value: 'reconciled') => void) | undefined;
    const reconcilePendingDowngrade = vi.fn(() => new Promise<'reconciled'>((resolve) => {
      resolveReconciliation = resolve;
    }));
    invokeMock.mockResolvedValue({
      data: { ok: true, action: 'restore', cancel_at_period_end: false, current_period_end: renewalSeconds },
      error: null,
    });
    const user = userEvent.setup();
    render(
      <Harness
        onStripeConfirmed={onStripeConfirmed}
        onProfileReconciled={onProfileReconciled}
        reconcilePendingDowngrade={reconcilePendingDowngrade}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Keep Elite and renew' }));
    const renewButtons = screen.getAllByRole('button', { name: 'Keep Elite and renew' });
    await user.click(renewButtons[renewButtons.length - 1]);

    await waitFor(() => expect(onStripeConfirmed).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Renewal restored — syncing your membership status.')).toBeInTheDocument();
    expect(toastSuccessMock).toHaveBeenCalledWith('Automatic renewal is on.', {
      description: 'Your Elite subscription is set to renew on January 15, 2027.',
    });
    expect(onProfileReconciled).not.toHaveBeenCalled();

    resolveReconciliation?.('reconciled');
    await waitFor(() => expect(screen.getByRole('alertdialog', { name: 'Automatic renewal is on.' })).toBeInTheDocument());
    expect(screen.getByText('Your Elite access will continue without interruption.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled();
    expect(onProfileReconciled).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      response: { data: { error: 'no_subscription' }, error: { context: { error: 'no_subscription' } } },
      message: 'We couldn’t find an active Elite subscription. Your billing status hasn’t changed. Contact support if this looks wrong.',
    },
    {
      response: { data: { ok: true, action: 'restore', cancel_at_period_end: true, current_period_end: renewalSeconds }, error: null },
      message: 'We couldn’t restore automatic renewal. Your downgrade is still scheduled. Try again.',
    },
    {
      response: { data: null, error: new Error('network') },
      message: 'We couldn’t restore automatic renewal. Your downgrade is still scheduled. Try again.',
    },
  ])('preserves pending state and exposes Retry for failed or ambiguous restore', async ({ response, message }) => {
    const onStripeConfirmed = vi.fn();
    const reconcilePendingDowngrade = vi.fn();
    invokeMock.mockResolvedValue(response);
    const user = userEvent.setup();
    render(<Harness onStripeConfirmed={onStripeConfirmed} reconcilePendingDowngrade={reconcilePendingDowngrade} />);
    await user.click(screen.getByRole('button', { name: 'Keep Elite and renew' }));
    const renewButtons = screen.getAllByRole('button', { name: 'Keep Elite and renew' });
    await user.click(renewButtons[renewButtons.length - 1]);

    await waitFor(() => expect(screen.getByText(message)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(onStripeConfirmed).not.toHaveBeenCalled();
    expect(reconcilePendingDowngrade).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('holds syncing with no Retry when reconciliation rejects after Stripe confirmation', async () => {
    const onStripeConfirmed = vi.fn();
    const onProfileReconciled = vi.fn();
    const reconcilePendingDowngrade = vi.fn().mockRejectedValue(new Error('reconcile boom'));
    invokeMock.mockResolvedValue({
      data: { ok: true, action: 'restore', cancel_at_period_end: false, current_period_end: renewalSeconds },
      error: null,
    });
    const user = userEvent.setup();
    render(
      <Harness
        onStripeConfirmed={onStripeConfirmed}
        onProfileReconciled={onProfileReconciled}
        reconcilePendingDowngrade={reconcilePendingDowngrade}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Keep Elite and renew' }));
    const renewButtons = screen.getAllByRole('button', { name: 'Keep Elite and renew' });
    await user.click(renewButtons[renewButtons.length - 1]);

    // Stripe confirmation fired exactly once, and the success toast shown exactly once.
    await waitFor(() => expect(onStripeConfirmed).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(reconcilePendingDowngrade).toHaveBeenCalledTimes(1));
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith('Automatic renewal is on.', {
      description: 'Your Elite subscription is set to renew on January 15, 2027.',
    });

    // The rejection is treated like timed_out: syncing persists, never regresses to failure.
    expect(screen.getByText('Renewal restored — syncing your membership status.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog', { name: 'Automatic renewal is on.' })).not.toBeInTheDocument();
    expect(onProfileReconciled).not.toHaveBeenCalled();

    // No Retry control is present or dispatchable, and no second restore invoke is possible.
    expect(screen.queryByText(/downgrade is still scheduled/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep Elite and renew' })).not.toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the Stripe-confirmed syncing state when reconciliation times out', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, action: 'restore', cancel_at_period_end: false, current_period_end: renewalSeconds },
      error: null,
    });
    const user = userEvent.setup();
    render(<Harness reconcilePendingDowngrade={vi.fn().mockResolvedValue('timed_out')} />);
    await user.click(screen.getByRole('button', { name: 'Keep Elite and renew' }));
    const renewButtons = screen.getAllByRole('button', { name: 'Keep Elite and renew' });
    await user.click(renewButtons[renewButtons.length - 1]);

    await waitFor(() => expect(screen.getByText('Renewal restored — syncing your membership status.')).toBeInTheDocument());
    expect(screen.queryByRole('alertdialog', { name: 'Automatic renewal is on.' })).not.toBeInTheDocument();
  });
});

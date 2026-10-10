import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TierCardV2 } from './TierCardV2';

describe('TierCardV2 status contract', () => {
  it('keeps available cards actionable', async () => {
    const user = userEvent.setup();
    const onCta = vi.fn();

    render(
      <TierCardV2
        tier="free"
        interval="monthly"
        status="available"
        onCta={onCta}
      />,
    );

    const action = screen.getByRole('button', { name: 'Start free' });
    expect(action).toBeEnabled();
    expect(screen.queryByText('Current plan')).not.toBeInTheDocument();
    expect(screen.queryByText('Scheduled')).not.toBeInTheDocument();

    await user.click(action);
    expect(onCta).toHaveBeenCalledOnce();
    expect(onCta).toHaveBeenCalledWith('free', 'monthly');
  });

  it('shows Current plan outside the control and never dispatches', async () => {
    const user = userEvent.setup();
    const onCta = vi.fn();

    render(
      <TierCardV2
        tier="elite"
        interval="annual"
        status="current"
        onCta={onCta}
      />,
    );

    const action = screen.getByRole('button', { name: 'Current plan' });
    expect(action).toBeDisabled();
    expect(screen.getAllByText('Current plan')).toHaveLength(2);

    await user.click(action);
    action.focus();
    await user.keyboard('{Enter}');
    action.click();
    expect(onCta).not.toHaveBeenCalled();
  });

  it('shows Scheduled outside the control and never dispatches', async () => {
    const user = userEvent.setup();
    const onCta = vi.fn();

    render(
      <TierCardV2
        tier="free"
        interval="monthly"
        status="scheduled"
        onCta={onCta}
      />,
    );

    const action = screen.getByRole('button', { name: 'Scheduled' });
    expect(action).toBeDisabled();
    expect(screen.getAllByText('Scheduled')).toHaveLength(2);

    await user.click(action);
    action.focus();
    await user.keyboard(' ');
    action.click();
    expect(onCta).not.toHaveBeenCalled();
  });
});

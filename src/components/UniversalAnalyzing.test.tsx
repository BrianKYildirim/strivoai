import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisLockProvider } from '@/contexts/AnalysisLockContext';
import { UniversalAnalyzing } from '@/components/UniversalAnalyzing';
import { WAITING_SURFACE_COPY } from '@/lib/analysis-stage-copy';

// Tag-agnostic by construction — see the file header for why a single-tag mock
// is a defect rather than a convenience.
vi.mock('framer-motion', async () =>
  (await import('@/test/utils/framer-motion-mock')).createFramerMotionMock(),
);

function renderSurface(props: Partial<React.ComponentProps<typeof UniversalAnalyzing>> = {}) {
  return render(
    <AnalysisLockProvider>
      <button type="button">Start analysis</button>
      <UniversalAnalyzing
        isAnalyzing
        title="Analyzing your resume"
        {...props}
      />
    </AnalysisLockProvider>,
  );
}

describe('UniversalAnalyzing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.style.overflow = 'auto';
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.style.overflow = '';
  });

  it('shows only honest stage copy and never advances it from elapsed time', () => {
    renderSurface({ streamStageLabel: 'Evaluating your resume...' });
    expect(screen.getAllByText('Evaluating your resume...')).toHaveLength(2);

    act(() => vi.advanceTimersByTime(150_000));

    expect(screen.getAllByText('Evaluating your resume...')).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(WAITING_SURFACE_COPY.polling)).toBeInTheDocument();
  });

  it('reveals background continuation at 45 seconds and restores scroll and focus', () => {
    const view = render(
      <AnalysisLockProvider>
        <button type="button">Start analysis</button>
      </AnalysisLockProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Start analysis' });
    trigger.focus();
    view.rerender(
      <AnalysisLockProvider>
        <button type="button">Start analysis</button>
        <UniversalAnalyzing isAnalyzing title="Analyzing your resume" />
      </AnalysisLockProvider>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    expect(
      screen.queryByRole('button', { name: WAITING_SURFACE_COPY.continueInBackground }),
    ).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(45_000));
    fireEvent.click(
      screen.getByRole('button', { name: WAITING_SURFACE_COPY.continueInBackground }),
    );
    act(() => vi.runOnlyPendingTimers());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('auto');
    expect(trigger).toHaveFocus();
  });

  // The sanctioned timed advance (quick 260803-fxz). An active row renders its
  // label twice — once in the row, once in the sr-only aria-live region — so a
  // count of 2 identifies the active step and 1 identifies an inactive one.
  const LADDER = ['Step one', 'Step two', 'Step three'] as const;

  it('advances the ladder one step per interval when no real signal is supplied', () => {
    renderSurface({ stageLabels: LADDER });
    expect(screen.getAllByText('Step one')).toHaveLength(2);
    expect(screen.getAllByText('Step two')).toHaveLength(1);

    act(() => vi.advanceTimersByTime(6_000));
    expect(screen.getAllByText('Step two')).toHaveLength(2);
    expect(screen.getAllByText('Step one')).toHaveLength(1);

    act(() => vi.advanceTimersByTime(6_000));
    expect(screen.getAllByText('Step three')).toHaveLength(2);

    // Holds on the final step instead of completing early and idling on a
    // finished-looking list while the run is still in flight.
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getAllByText('Step three')).toHaveLength(2);
  });

  it('leaves the timer inert when the caller supplies a real stage index', () => {
    renderSurface({ stageLabels: LADDER, activeStageIndex: 0 });
    expect(screen.getAllByText('Step one')).toHaveLength(2);

    act(() => vi.advanceTimersByTime(120_000));

    expect(screen.getAllByText('Step one')).toHaveLength(2);
    expect(screen.getAllByText('Step two')).toHaveLength(1);
  });

  // quick 260803-mqs: the completed row's visible word "Done" became a green
  // tick. Both halves matter — the state must READ as completion without text,
  // and it must still be ANNOUNCED, so the swap is not an accessibility trade.
  it('marks a completed step with a green tick that is invisible but announced', () => {
    const { container } = renderSurface({ stageLabels: LADDER, activeStageIndex: 1 });

    expect(screen.getByText('Done')).toHaveClass('sr-only');
    // Exactly one — the "not rendered visibly" half. A visible label would add a
    // second node with the same text.
    expect(screen.getAllByText('Done')).toHaveLength(1);
    expect(container.querySelector('.text-success svg')).not.toBeNull();
  });

  it('traps focus within the modal', () => {
    renderSurface();
    act(() => vi.advanceTimersByTime(45_000));
    const button = screen.getByRole('button', {
      name: WAITING_SURFACE_COPY.continueInBackground,
    });
    button.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(button).toHaveFocus();
  });
});

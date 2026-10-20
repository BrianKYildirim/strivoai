import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisWaitingHost } from '@/components/AnalysisWaitingHost';
import {
  AnalysisLockProvider,
  useAnalysisLock,
  type AnalysisWaitingSurface,
} from '@/contexts/AnalysisLockContext';
import { ELITE_UNLOCK_STAGE_COPY, WAITING_SURFACE_COPY } from '@/lib/analysis-stage-copy';

// Tag-agnostic by construction — see the file header for why a single-tag mock
// is a defect rather than a convenience.
vi.mock('framer-motion', async () =>
  (await import('@/test/utils/framer-motion-mock')).createFramerMotionMock(),
);

function WaitingHarness() {
  const { showWaitingSurface, hideWaitingSurface } = useAnalysisLock();
  const [stage, setStage] = useState<'upload' | 'results'>('upload');

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStage('upload');
          showWaitingSurface({
            key: 'resume-analysis',
            title: 'Analyzing your resume',
            streamStageLabel: 'Sending your resume for analysis...',
          });
        }}
      >
        Submit
      </button>
      <button
        type="button"
        onClick={() => {
          setStage('results');
          showWaitingSurface({
            key: 'resume-analysis',
            title: 'Analyzing your resume',
            streamStageLabel: 'Evaluating your resume...',
          });
        }}
      >
        Navigate to results
      </button>
      <button type="button" onClick={() => hideWaitingSurface('resume-analysis')}>
        Complete
      </button>
      <output>{stage}</output>
      <AnalysisWaitingHost />
    </>
  );
}

function renderHarness() {
  return render(
    <AnalysisLockProvider>
      <WaitingHarness />
    </AnalysisLockProvider>,
  );
}

describe('AnalysisWaitingHost', () => {
  it('keeps one dialog node mounted while Upload transfers ownership to Results', async () => {
    renderHarness();
    let mounts = 0;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (
            node instanceof Element &&
            (node.matches('[role="dialog"][aria-label="Analyzing your resume"]') ||
              node.querySelector('[role="dialog"][aria-label="Analyzing your resume"]'))
          ) {
            mounts += 1;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    const uploadDialog = screen.getByRole('dialog', { name: 'Analyzing your resume' });
    expect(screen.getAllByText('Working on your analysis')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Navigate to results' }));
    const resultsDialog = screen.getByRole('dialog', { name: 'Analyzing your resume' });

    expect(resultsDialog).toBe(uploadDialog);
    expect(screen.getAllByText('Evaluating your resume...')).toHaveLength(2);
    await waitFor(() => expect(mounts).toBe(1));
    observer.disconnect();
  });

  it('supports direct recovery and removes the surface on terminal completion', () => {
    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Navigate to results' }));
    expect(screen.getByRole('dialog', { name: 'Analyzing your resume' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
    expect(
      screen.queryByRole('dialog', { name: 'Analyzing your resume' }),
    ).not.toBeInTheDocument();

    act(() => {
      document.body.style.overflow = '';
    });
  });
});

/**
 * Onboarding -> Results ladder handoff (quick 260803-mqs).
 *
 * REGRESSION THIS PINS. Onboarding used to render its own page-level
 * <UniversalAnalyzing>, which `navigate('/results/:id')` destroyed while the
 * analysis was still in flight. Results then mounted and seeded a LABEL-LESS
 * waiting surface on the same key, and because `showWaitingSurface` replaced the
 * record wholesale, the user dropped from a rich 5-step ladder to the single-row
 * 'Working on your analysis' fallback mid-wait. The two calls below are that
 * exact sequence — the only place the bug was observable, since neither page
 * alone is wrong.
 */

/** Verbatim copy of `ONBOARDING_STAGE_LABELS` (src/pages/Onboarding.tsx). */
const ONBOARDING_LABELS: readonly string[] = [
  'Reading your resume',
  'Evaluating against the rubric',
  'Generating personalized insights',
  'Finalizing your results',
  'Preparing your dashboard',
];

/** What Onboarding seeds immediately before it navigates. */
const ONBOARDING_SEED: AnalysisWaitingSurface = {
  key: 'resume-analysis',
  title: 'Analyzing your resume',
  stageLabels: ONBOARDING_LABELS,
};

/**
 * What Results' branch-3 (`...{}`) update sends once it mounts — same key, same
 * title, no ladder of its own. This is the call that used to erase the seed.
 */
const RESULTS_LABEL_LESS_UPDATE: AnalysisWaitingSurface = {
  key: 'resume-analysis',
  title: 'Analyzing your resume',
  streamStageLabel: null,
  lifecycleState: null,
};

const ELITE_UPDATE: AnalysisWaitingSurface = {
  key: 'resume-analysis',
  title: 'Unlocking Elite insights',
  stageLabels: ELITE_UNLOCK_STAGE_COPY,
};

function HandoffDriver() {
  const { showWaitingSurface } = useAnalysisLock();
  return (
    <>
      <button type="button" onClick={() => showWaitingSurface(ONBOARDING_SEED)}>
        seed-onboarding
      </button>
      <button type="button" onClick={() => showWaitingSurface(RESULTS_LABEL_LESS_UPDATE)}>
        results-label-less
      </button>
      <button type="button" onClick={() => showWaitingSurface(ELITE_UPDATE)}>
        elite-ladder
      </button>
      <AnalysisWaitingHost />
    </>
  );
}

function renderHandoff() {
  return render(
    <AnalysisLockProvider>
      <HandoffDriver />
    </AnalysisLockProvider>,
  );
}

const clickDriver = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const stageList = () => within(screen.getByTestId('analysis-stage-list'));

describe('AnalysisWaitingHost · onboarding -> Results ladder handoff (quick 260803-mqs)', () => {
  it('carries an in-flight ladder across an adopting page label-less update', () => {
    renderHandoff();
    clickDriver('seed-onboarding');
    clickDriver('results-label-less');

    for (const label of ONBOARDING_LABELS) {
      expect(stageList().getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText(WAITING_SURFACE_COPY.fallback)).not.toBeInTheDocument();
  });

  /**
   * NEGATIVE CONTROL — the OT-8 / realtime-fallback contract at unit level.
   *
   * `e2e/cross-device/waiting-surface.spec.ts` OT-8 asserts the single-row
   * 'Working on your analysis' copy is byte-identical for 60 seconds, and
   * `realtime-fallback.spec.ts` asserts it four times. Both navigate straight to
   * /results with NO prior seed. If the carry-forward rule is ever widened so a
   * label-less update inherits a ladder nobody seeded, this fails in about a
   * second instead of in a 140s browser spec.
   */
  it('leaves an unseeded wait on the single-row fallback', () => {
    renderHandoff();
    clickDriver('results-label-less');

    expect(stageList().getByText(WAITING_SURFACE_COPY.fallback)).toBeInTheDocument();
    for (const label of ONBOARDING_LABELS) {
      expect(stageList().queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('still replaces the ladder when the caller supplies one of its own', () => {
    renderHandoff();
    clickDriver('seed-onboarding');
    clickDriver('elite-ladder');

    for (const label of ONBOARDING_LABELS) {
      expect(stageList().queryByText(label)).not.toBeInTheDocument();
    }
    for (const label of ELITE_UNLOCK_STAGE_COPY) {
      expect(stageList().getByText(label)).toBeInTheDocument();
    }
  });
});

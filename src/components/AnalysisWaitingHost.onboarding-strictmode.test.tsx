/**
 * Onboarding -> Results ladder handoff UNDER <StrictMode> (quick 260803-t6v).
 *
 * WHY STRICTMODE IS NOT OPTIONAL HERE. `src/main.tsx` wraps the app in
 * <StrictMode>, so React 18 double-invokes effects: setup -> cleanup -> setup.
 * Results.tsx registers an unmount cleanup that calls
 * `hideWaitingSurface('resume-analysis')`, and on that double-invoke the hide
 * lands BETWEEN Onboarding's seed and Results' own adopting write. The queued
 * `setWaitingSurface(null)` is applied before the adopting updater runs, so an
 * adopting write that carries the ladder forward FROM THE LIVE RECORD finds
 * nothing to carry and stores a label-less record — the user drops from the
 * 5-step ladder to the single-row 'Working on your analysis' surface mid-run.
 *
 * Rendered WITHOUT <StrictMode> the same sequence passes, which is precisely how
 * the previous attempt shipped green and still broke on the operator's machine.
 * The fix under test is re-derivation from a durable sessionStorage marker: the
 * labels are re-read on EVERY effect run, so there is no in-memory state for a
 * hide to destroy and the ordering stops mattering.
 *
 * The Results-side branch logic is not re-implemented from memory: the harness
 * calls the very function Results.tsx calls (`resolveOnboardingLadder`), so
 * neutering that branch turns this suite red.
 */
import { StrictMode, useEffect, useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisWaitingHost } from '@/components/AnalysisWaitingHost';
import { AnalysisLockProvider, useAnalysisLock } from '@/contexts/AnalysisLockContext';
import { ONBOARDING_STAGE_LABELS, WAITING_SURFACE_COPY } from '@/lib/analysis-stage-copy';

vi.mock('framer-motion', async () =>
  (await import('@/test/utils/framer-motion-mock')).createFramerMotionMock(),
);
// Import-graph trims only — `@/pages/Results` is imported below for its exported
// branch helper, and these three pull network/pricing hooks that this suite does
// not exercise. Same shape as `Results.stream-tier-carry.test.tsx`.
vi.mock('@/hooks/useFeatureCosts', () => ({
  useFeatureCosts: () => ({ data: [] }),
  getCostForFeature: () => null,
}));
vi.mock('@/hooks/useEliteRerun', () => ({
  useEliteRerun: () => ({ startEliteRerun: () => {}, isStarting: false, error: null }),
  clearEliteRerunLeaseByNewResumeId: () => {},
}));
vi.mock('@/components/MeritCostPreview', () => ({ MeritCostPreview: () => null }));

import { onboardingWaitKey, resolveOnboardingLadder } from '@/pages/Results';

const ONBOARDING_ID = 'resume-from-onboarding';
const OTHER_ID = 'some-other-resume';

/**
 * Results.tsx's waiting-surface effect, reduced to the non-stream / non-elite
 * shape this handoff takes (no `?stream=true`, no `?unlock=`), plus the unmount
 * cleanup that is the whole reason StrictMode matters. Branch 4 is delegated to
 * the real exported helper rather than restated.
 */
function ResultsRoute({ id, statusTick }: { id: string; statusTick: number }) {
  const { showWaitingSurface, hideWaitingSurface } = useAnalysisLock();

  useEffect(() => {
    const adoptedOnboardingLadder = resolveOnboardingLadder(id);
    showWaitingSurface({
      key: 'resume-analysis',
      title: 'Analyzing your resume',
      streamStageLabel: null,
      lifecycleState: null,
      ...(adoptedOnboardingLadder ? adoptedOnboardingLadder : {}),
    });
    // `statusTick` stands in for the poll/job-status churn that re-runs this
    // effect repeatedly while the run is still in flight.
  }, [showWaitingSurface, id, statusTick]);

  useEffect(() => () => hideWaitingSurface('resume-analysis'), [hideWaitingSurface]);

  return null;
}

/** Onboarding's seed + marker write, then the navigation to /results. */
function Harness({ id, seedLadder = true }: { id: string; seedLadder?: boolean }) {
  const { showWaitingSurface } = useAnalysisLock();
  const [route, setRoute] = useState<'onboarding' | 'results'>('onboarding');
  const [statusTick, setStatusTick] = useState(0);

  useEffect(() => {
    if (route !== 'onboarding' || !seedLadder) return;
    sessionStorage.setItem(onboardingWaitKey(id), '1');
    showWaitingSurface({
      key: 'resume-analysis',
      title: 'Analyzing your resume',
      stageLabels: ONBOARDING_STAGE_LABELS,
    });
  }, [route, id, seedLadder, showWaitingSurface]);

  return (
    <>
      <button type="button" onClick={() => setRoute('results')}>
        navigate-to-results
      </button>
      <button type="button" onClick={() => setStatusTick((t) => t + 1)}>
        label-less-status-update
      </button>
      {route === 'results' && <ResultsRoute id={ONBOARDING_ID} statusTick={statusTick} />}
      <AnalysisWaitingHost />
    </>
  );
}

function renderStrict(props: { id: string; seedLadder?: boolean }) {
  return render(
    <StrictMode>
      <AnalysisLockProvider>
        <Harness {...props} />
      </AnalysisLockProvider>
    </StrictMode>,
  );
}

const stageList = () => within(screen.getByTestId('analysis-stage-list'));
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
/** The ladder's active row = however many rows are already ticked. */
const completedSteps = () => screen.queryAllByText('Done').length;

/**
 * Continuous guard. Point-in-time assertions can straddle a frame in which the
 * fallback flashed; this records every time the banned copy is ATTACHED to or
 * written into the document, so a transient regression cannot slip between two
 * expectations.
 */
let fallbackSightings = 0;
let observer: MutationObserver | null = null;

function watchForFallback() {
  fallbackSightings = 0;
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') {
        if (record.target.textContent?.includes(WAITING_SURFACE_COPY.fallback)) {
          fallbackSightings += 1;
        }
        continue;
      }
      for (const node of record.addedNodes) {
        if (node.textContent?.includes(WAITING_SURFACE_COPY.fallback)) fallbackSightings += 1;
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

beforeEach(() => {
  sessionStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: false });
});

afterEach(() => {
  observer?.disconnect();
  observer = null;
  vi.useRealTimers();
  sessionStorage.clear();
  document.body.style.overflow = '';
});

describe('Onboarding -> Results ladder handoff survives the StrictMode double-invoke', () => {
  it('keeps the five-step ladder through navigation, the hide, and repeated label-less updates', () => {
    renderStrict({ id: ONBOARDING_ID });

    // 1. Onboarding has seeded the ladder.
    for (const label of ONBOARDING_STAGE_LABELS) {
      expect(stageList().getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText(WAITING_SURFACE_COPY.fallback)).toBeNull();

    // Everything from here on must never show the single-row fallback.
    watchForFallback();

    // 2. Let the sanctioned timer advance the ladder so a reset is observable.
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(completedSteps()).toBe(1);

    // 3. Navigate to /results. Under StrictMode this mounts ResultsRoute, runs its
    //    adopting write, fires the unmount cleanup that nulls the record, and runs
    //    the adopting write again — the exact interleaving that broke the ladder.
    act(() => {
      click('navigate-to-results');
    });

    for (const label of ONBOARDING_STAGE_LABELS) {
      expect(stageList().getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText(WAITING_SURFACE_COPY.fallback)).toBeNull();
    // The step index is carried, not restarted.
    expect(completedSteps()).toBe(1);

    // 4. Several more label-less status updates, interleaved with more timer ticks.
    for (const expectedCompleted of [2, 3, 4]) {
      act(() => {
        click('label-less-status-update');
      });
      act(() => {
        vi.advanceTimersByTime(6_000);
      });
      for (const label of ONBOARDING_STAGE_LABELS) {
        expect(stageList().getByText(label)).toBeInTheDocument();
      }
      expect(screen.queryByText(WAITING_SURFACE_COPY.fallback)).toBeNull();
      expect(completedSteps()).toBe(expectedCompleted);
    }

    // 5. It never even flickered.
    expect(fallbackSightings).toBe(0);
  });

  /**
   * NEGATIVE CONTROL — the OT-8 / realtime-fallback contract at unit level.
   * `e2e/cross-device/waiting-surface.spec.ts` OT-8 and `realtime-fallback.spec.ts`
   * navigate straight to /results and never write the marker. Branch 3 must still
   * yield `{}` and the single-row copy must be byte-identical to today.
   */
  it('leaves an unmarked wait on the single-row fallback', () => {
    renderStrict({ id: ONBOARDING_ID, seedLadder: false });

    act(() => {
      click('navigate-to-results');
    });

    expect(stageList().getByText(WAITING_SURFACE_COPY.fallback)).toBeInTheDocument();
    for (const label of ONBOARDING_STAGE_LABELS) {
      expect(stageList().queryByText(label)).toBeNull();
    }
  });

  /**
   * A marker belongs to ONE resume id. A different analysis must not inherit a
   * ladder that was seeded for its neighbour.
   */
  it('does not let a different resume id inherit the onboarding ladder', () => {
    sessionStorage.setItem(onboardingWaitKey(OTHER_ID), '1');
    renderStrict({ id: ONBOARDING_ID, seedLadder: false });

    act(() => {
      click('navigate-to-results');
    });

    expect(stageList().getByText(WAITING_SURFACE_COPY.fallback)).toBeInTheDocument();
    for (const label of ONBOARDING_STAGE_LABELS) {
      expect(stageList().queryByText(label)).toBeNull();
    }
  });
});

describe('resolveOnboardingLadder', () => {
  it('returns the shared module-level array — a per-call copy would restart the step timer', () => {
    sessionStorage.setItem(onboardingWaitKey(ONBOARDING_ID), '1');
    const first = resolveOnboardingLadder(ONBOARDING_ID);
    const second = resolveOnboardingLadder(ONBOARDING_ID);

    expect(first?.stageLabels).toBe(ONBOARDING_STAGE_LABELS);
    expect(second?.stageLabels).toBe(first?.stageLabels);
  });

  it('omits activeStageIndex so the sanctioned timer drives the ladder', () => {
    sessionStorage.setItem(onboardingWaitKey(ONBOARDING_ID), '1');
    expect(Object.keys(resolveOnboardingLadder(ONBOARDING_ID) ?? {})).toEqual(['stageLabels']);
  });

  it('returns null with no marker, and with no id at all', () => {
    expect(resolveOnboardingLadder(ONBOARDING_ID)).toBeNull();
    expect(resolveOnboardingLadder(undefined)).toBeNull();
  });
});

/**
 * Source pin. The behavioural suite above proves the HELPER works; this proves
 * Results' effect still consults it, and that neither the `isStreamMode` gate nor
 * branch 3 was altered to make room for branch 4.
 */
describe('Results.tsx wiring (quick 260803-t6v)', () => {
  const source = readFileSync(resolve('src/pages/Results.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('re-derives the ladder inside the waiting-surface effect, not once at mount', () => {
    expect(source).toContain('const adoptedOnboardingLadder = resolveOnboardingLadder(id);');
    expect(source).toContain('? adoptedOnboardingLadder');
  });

  it('leaves the stream gate and the label-less branch 3 exactly as they were', () => {
    expect(source).toContain("const isStreamMode = searchParams.get('stream') === 'true';");
    expect(source).toContain('stageLabels: PERMITTED_STREAM_STAGE_LABELS,');
    expect(source).toContain(': {}),');
  });

  it('retires the marker on the completion side', () => {
    expect(source).toContain('sessionStorage.removeItem(onboardingWaitKey(id));');
  });
});

/** Onboarding must write the marker before it can navigate anywhere. */
describe('Onboarding.tsx marker write (quick 260803-t6v)', () => {
  const source = readFileSync(resolve('src/pages/Onboarding.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('writes one marker, before every /results navigation', () => {
    const write = source.indexOf('sessionStorage.setItem(`onboarding_wait_${resume.id}`, \'1\');');
    expect(write, 'Onboarding must write the durable handoff marker').toBeGreaterThan(-1);
    const navigations = [...source.matchAll(/navigate\(`\/results\/\$\{resume\.id\}`\)/g)];
    expect(navigations.length).toBeGreaterThanOrEqual(4);
    for (const navigation of navigations) {
      expect(navigation.index!).toBeGreaterThan(write);
    }
  });

  it('clears the marker on every path that did not hand off', () => {
    expect(source).toContain('if (!handedOffToResults && onboardingWaitMarkerId) {');
    expect(source).toContain(
      'sessionStorage.removeItem(`onboarding_wait_${onboardingWaitMarkerId}`);',
    );
  });

  it('imports the ladder rather than redeclaring it', () => {
    expect(source).toContain(
      "import { ONBOARDING_STAGE_LABELS } from \"@/lib/analysis-stage-copy\";",
    );
    expect(source).not.toContain('const ONBOARDING_STAGE_LABELS');
  });
});

import { describe, expect, it } from 'vitest';
import { STAGE_LABELS } from '@/hooks/useResumeStream';
import type { LifecycleState } from '@/hooks/useAnalysisRun';
import { LEAK_GUARD_PATTERN } from '@/lib/client-error-taxonomy';
import {
  ANALYSIS_FEATURES,
  ANALYSIS_SUBJECTS,
  LIFECYCLE_STAGE_COPY,
  PERMITTED_STREAM_STAGE_LABELS,
  WAITING_SURFACE_COPY,
  ELITE_UNLOCK_STAGE_COPY,
  resolveStageCopy,
} from '@/lib/analysis-stage-copy';

const LIFECYCLE_STATES: readonly LifecycleState[] = [
  'created',
  'validating_inputs',
  'reserving_merits',
  'extracting_data',
  'generating',
  'validating_output',
  'saving',
  'completed',
  'retryable_failed',
  'failed',
  'refunded',
];

describe('analysis-stage-copy', () => {
  it('exhaustively maps all eleven lifecycle states', () => {
    expect(Object.keys(LIFECYCLE_STAGE_COPY)).toEqual(LIFECYCLE_STATES);
    for (const state of LIFECYCLE_STATES) {
      expect(LIFECYCLE_STAGE_COPY[state]).toBeDefined();
    }
  });

  it('exhaustively maps all five feature subjects', () => {
    expect(Object.keys(ANALYSIS_SUBJECTS)).toEqual(ANALYSIS_FEATURES);
    expect(Object.values(ANALYSIS_SUBJECTS)).toEqual([
      'resume',
      'LinkedIn profile',
      'career profile',
      'job description',
      'interview details',
    ]);
  });

  it('sources permitted live labels from the streaming hook', () => {
    expect(PERMITTED_STREAM_STAGE_LABELS).toEqual(
      Object.values(STAGE_LABELS).filter(
        (label) => label !== STAGE_LABELS.complete && label !== STAGE_LABELS.error,
      ),
    );
    for (const label of PERMITTED_STREAM_STAGE_LABELS) {
      expect(resolveStageCopy({ streamLabel: label })).toBe(label);
    }
  });

  it('prefers lifecycle truth and otherwise uses the indeterminate fallback', () => {
    expect(
      resolveStageCopy({
        feature: 'LinkedIn Grader',
        lifecycleState: 'validating_inputs',
        streamLabel: STAGE_LABELS.scoring,
      }),
    ).toBe('Checking your LinkedIn profile');
    expect(resolveStageCopy({})).toBe(WAITING_SURFACE_COPY.fallback);
    expect(resolveStageCopy({ streamLabel: 'untrusted guessed stage' })).toBe(
      WAITING_SURFACE_COPY.fallback,
    );
  });

  it('keeps every waiting string leak-free and free of estimates or colour names', () => {
    const lifecycleCopies = LIFECYCLE_STATES.flatMap((state) => {
      const entry = LIFECYCLE_STAGE_COPY[state];
      return ANALYSIS_FEATURES.map((feature) =>
        typeof entry === 'function' ? entry(ANALYSIS_SUBJECTS[feature]).copy : entry.copy,
      );
    }).filter((copy): copy is string => Boolean(copy));
    const copies = [
      ...lifecycleCopies,
      ...PERMITTED_STREAM_STAGE_LABELS,
      ...Object.values(WAITING_SURFACE_COPY),
    ];
    expect(copies.length).toBeGreaterThan(0);
    for (const copy of copies) {
      expect(copy).not.toMatch(LEAK_GUARD_PATTERN);
      expect(copy).not.toMatch(/%|countdown|usually takes|estimated? duration|emerald|#[0-9a-f]{3,8}/i);
    }
  });

  it('locks the five truthful incremental Elite unlock stages', () => {
    expect(ELITE_UNLOCK_STAGE_COPY).toEqual([
      'Checking this analysis',
      'Reserving your credits',
      'Generating missing Elite insights',
      'Checking the new insights',
      'Saving your Elite analysis',
    ]);
    expect(ELITE_UNLOCK_STAGE_COPY.join(' ')).not.toMatch(/rescor|rewrit|full analysis/i);
  });
});

/**
 * Honest waiting-surface copy (Phase 03, D-27).
 *
 * VITE_FEATURE_ANALYSIS_LIFECYCLE remains OFF. The lifecycle map is wired but
 * dormant: no user reaches it today. It exists so Surface D can consume either
 * honest source without a rewrite when lifecycle activation receives its own
 * risk assessment.
 */
import type { LifecycleState } from '@/hooks/useAnalysisRun';
import { STAGE_LABELS } from '@/lib/resume-stream-stage-labels';

export const ANALYSIS_FEATURES = Object.freeze([
  'Resume Analysis',
  'LinkedIn Grader',
  'Career Compass',
  'Recruiting Lens',
  'Interview Prep',
] as const);

export type AnalysisFeature = (typeof ANALYSIS_FEATURES)[number];

export const ANALYSIS_SUBJECTS: Readonly<Record<AnalysisFeature, string>> = Object.freeze({
  'Resume Analysis': 'resume',
  'LinkedIn Grader': 'LinkedIn profile',
  'Career Compass': 'career profile',
  'Recruiting Lens': 'job description',
  'Interview Prep': 'interview details',
});

export interface LifecycleStageCopy {
  copy: string | null;
  shown: boolean;
  errorSurface: boolean;
}

const stage = (copy: string): LifecycleStageCopy =>
  Object.freeze({ copy, shown: true, errorSurface: false });
const terminalError = (): LifecycleStageCopy =>
  Object.freeze({ copy: null, shown: false, errorSurface: true });

export const LIFECYCLE_STAGE_COPY: Readonly<
  Record<LifecycleState, LifecycleStageCopy | ((subject: string) => LifecycleStageCopy)>
> = Object.freeze({
  created: stage('Starting your analysis'),
  validating_inputs: (subject) => stage(`Checking your ${subject}`),
  reserving_merits: stage('Reserving your credits'),
  extracting_data: (subject) => stage(`Reading your ${subject}`),
  generating: stage('Analyzing with AI'),
  validating_output: stage('Checking the results'),
  saving: stage('Saving your analysis'),
  completed: stage('Analysis complete'),
  retryable_failed: terminalError(),
  failed: terminalError(),
  refunded: terminalError(),
});

export const PERMITTED_STREAM_STAGE_LABELS = Object.freeze(
  Object.values(STAGE_LABELS).filter(
    (label) => label !== STAGE_LABELS.complete && label !== STAGE_LABELS.error,
  ),
);

export const WAITING_SURFACE_COPY = Object.freeze({
  fallback: 'Working on your analysis',
  reassurance: "Still working. You can leave this page — we'll save your result when it's done.",
  polling:
    "Taking longer than expected. Your analysis is still running on our servers and we're checking on it.",
  continueInBackground: 'Continue in the background',
});

/**
 * The onboarding analysis ladder (quick 260803-t6v).
 *
 * Lives HERE rather than in `Onboarding.tsx` because two surfaces need the same
 * array identity: Onboarding seeds it before it navigates, and Results re-derives
 * it when it adopts an in-flight onboarding wait. A page -> page import would be
 * the wrong dependency edge, and this module is already the home of the other two
 * ladders Results consumes (PERMITTED_STREAM_STAGE_LABELS, ELITE_UNLOCK_STAGE_COPY).
 *
 * Module level is load-bearing, not tidiness: UniversalAnalyzing keys its timed
 * step advance off the label count, and an array rebuilt every render would
 * restart that timer.
 */
export const ONBOARDING_STAGE_LABELS: readonly string[] = Object.freeze([
  'Reading your resume',
  'Evaluating against the rubric',
  'Generating personalized insights',
  'Finalizing your results',
  'Preparing your dashboard',
] as const);

export const ELITE_UNLOCK_STAGE_COPY = Object.freeze([
  'Checking this analysis',
  'Reserving your credits',
  'Generating missing Elite insights',
  'Checking the new insights',
  'Saving your Elite analysis',
] as const);

export interface StageCopySource {
  feature?: AnalysisFeature;
  lifecycleState?: LifecycleState | null;
  streamLabel?: string | null;
}

export function resolveStageCopy(source: StageCopySource): string | null {
  if (source.lifecycleState) {
    const entry = LIFECYCLE_STAGE_COPY[source.lifecycleState];
    const resolved =
      typeof entry === 'function'
        ? entry(ANALYSIS_SUBJECTS[source.feature ?? 'Resume Analysis'])
        : entry;
    return resolved.copy;
  }
  if (source.streamLabel && PERMITTED_STREAM_STAGE_LABELS.includes(source.streamLabel)) {
    return source.streamLabel;
  }
  return WAITING_SURFACE_COPY.fallback;
}

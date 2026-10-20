import { invokeWithTimeout } from '@/lib/fetchWithTimeout';

export type CostedFeature =
  | 'resume_analysis'
  | 'linkedin_grader'
  | 'career_compass'
  | 'recruiting_lens'
  | 'interview_prep';
export type FeatureRunVariant =
  | 'standard'
  | 'cache_reuse'
  | 'rerun'
  | 'elite_unlock'
  | 'evaluation';
export type FeatureRunInputType =
  | 'none'
  | 'text'
  | 'pdf'
  | 'docx'
  | 'url'
  | 'mixed'
  | 'unknown';

export interface FeatureRunCorrelationEnvelope {
  feature: CostedFeature;
  runVariant: FeatureRunVariant;
  inputType: FeatureRunInputType;
  documentCount: number;
  serverActionNonce: string;
}

interface CorrelationResponse {
  featureRunToken?: string;
  error?: string;
}

interface PendingCorrelation {
  promise: Promise<string>;
  expiresAt: number;
}

const TOKEN_REUSE_MS = 8 * 60 * 1000;
const correlations = new Map<string, PendingCorrelation>();

export interface FeatureRunCorrelationDependencies {
  invoke?: (
    envelope: FeatureRunCorrelationEnvelope,
  ) => Promise<{ data: CorrelationResponse | null; error: Error | null }>;
  now?: () => number;
}

function actionKey(envelope: FeatureRunCorrelationEnvelope): string {
  return [
    envelope.feature,
    envelope.runVariant,
    envelope.inputType,
    envelope.documentCount,
    envelope.serverActionNonce,
  ].join(':');
}

export function createFeatureRunActionNonce(): string {
  return crypto.randomUUID();
}

export async function getFeatureRunToken(
  envelope: FeatureRunCorrelationEnvelope,
  dependencies: FeatureRunCorrelationDependencies = {},
): Promise<string> {
  const now = dependencies.now ?? Date.now;
  const key = actionKey(envelope);
  const cached = correlations.get(key);
  if (cached && cached.expiresAt > now()) return cached.promise;

  const invoke = dependencies.invoke ?? (async (body) =>
    await invokeWithTimeout<CorrelationResponse>('begin-feature-run', { body }, 30_000));
  const promise = invoke(envelope).then(({ data, error }) => {
    if (error || typeof data?.featureRunToken !== 'string' || !data.featureRunToken) {
      correlations.delete(key);
      throw error ?? new Error(data?.error ?? 'Unable to begin this analysis. Please try again.');
    }
    return data.featureRunToken;
  });
  correlations.set(key, { promise, expiresAt: now() + TOKEN_REUSE_MS });
  return await promise;
}

export function clearFeatureRunToken(envelope?: FeatureRunCorrelationEnvelope): void {
  if (!envelope) {
    correlations.clear();
    return;
  }
  correlations.delete(actionKey(envelope));
}

import { createLogger } from './logger.ts';
import { resolveTierAndInterval, type Tier } from './price-resolver.ts';
import {
  getRuntimeEnvironment,
  type RuntimeEnvironment,
} from './runtime-environment.ts';
import { getServiceClient } from './supabase-client.ts';

const log = createLogger('feature-run-telemetry');

export type CostedFeature =
  | 'resume_analysis'
  | 'linkedin_grader'
  | 'career_compass'
  | 'recruiting_lens'
  | 'interview_prep';
export type FeatureRunStatus = 'started' | 'completed' | 'failed' | 'canceled';

export interface CreateFeatureRunParams {
  userId: string;
  feature: CostedFeature;
  serverActionKey: string;
  requestId?: string;
  analysisJobId?: string;
  runVariant?: 'standard' | 'cache_reuse' | 'rerun' | 'elite_unlock' | 'evaluation';
  inputType?: 'none' | 'text' | 'pdf' | 'docx' | 'url' | 'mixed' | 'unknown';
  documentCount?: number;
  servedFromCache?: boolean;
  cacheSource?: 'analysis_cache' | 'stored_result' | 'accepted_extraction';
}

export interface FeatureRunRecord {
  id: string;
  status: FeatureRunStatus;
}

export interface FeatureRunProfile {
  subscriptionTier: string | null;
  stripePriceId: string | null;
}

export interface FeatureRunStore {
  getProfile(userId: string): Promise<FeatureRunProfile | null>;
  getCostingSubject(userId: string): Promise<string | null>;
  createCostingSubject(id: string, userId: string): Promise<string | null>;
  isExcluded(costingSubjectId: string): Promise<boolean>;
  getMeritTransactionAmount(transactionId: string): Promise<number | null>;
  getRunByActionHash(actionHash: string): Promise<FeatureRunRecord | null>;
  insertRun(row: Record<string, unknown>): Promise<FeatureRunRecord | null>;
  updateMerits(
    featureRunId: string,
    patch: Record<string, unknown>,
  ): Promise<boolean>;
  getRunStatus(featureRunId: string): Promise<FeatureRunStatus | null>;
  terminalize(
    featureRunId: string,
    fromStatus: FeatureRunStatus,
    patch: Record<string, unknown>,
  ): Promise<boolean>;
}

export interface FeatureRunTelemetryDependencies {
  /** Explicit unit-test seam. Production callers must omit dependencies. */
  store?: FeatureRunStore;
  runtimeEnvironment?: () => RuntimeEnvironment;
  randomUuid?: () => string;
  now?: () => string;
}

export type FeatureRunResult =
  | { ok: true; featureRunId: string; recovered: boolean }
  | { ok: false; reason: string };

function normalizeTier(value: string | null | undefined): Tier {
  return value === 'elite' || value === 'pro' ? value : 'free';
}

async function actionKeyHash(params: CreateFeatureRunParams): Promise<string> {
  const input = `${params.userId}:${params.feature}:${params.serverActionKey}`;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function supabaseStore(): FeatureRunStore {
  const client = getServiceClient();
  return {
    async getProfile(userId) {
      const { data, error } = await client
        .from('profiles')
        .select('subscription_tier,stripe_price_id')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw new Error('profile_lookup_failed');
      return data
        ? {
          subscriptionTier: data.subscription_tier,
          stripePriceId: data.stripe_price_id,
        }
        : null;
    },
    async getCostingSubject(userId) {
      const { data, error } = await client
        .from('costing_subjects')
        .select('id')
        .eq('auth_user_id', userId)
        .maybeSingle();
      if (error) throw new Error('costing_subject_lookup_failed');
      return data?.id ?? null;
    },
    async createCostingSubject(id, userId) {
      const { data, error } = await client
        .from('costing_subjects')
        .insert({ id, auth_user_id: userId })
        .select('id')
        .maybeSingle();
      if (!error && data) return data.id;

      // A concurrent first request can win the unique auth_user_id insert.
      const { data: raced, error: raceError } = await client
        .from('costing_subjects')
        .select('id')
        .eq('auth_user_id', userId)
        .maybeSingle();
      if (raceError) throw new Error('costing_subject_create_failed');
      return raced?.id ?? null;
    },
    async isExcluded(costingSubjectId) {
      const { data, error } = await client
        .from('costing_account_classifications')
        .select('exclude_from_costing')
        .eq('costing_subject_id', costingSubjectId)
        .maybeSingle();
      if (error) throw new Error('costing_classification_lookup_failed');
      return data?.exclude_from_costing === true;
    },
    async getMeritTransactionAmount(transactionId) {
      const { data, error } = await client
        .from('merit_transactions')
        .select('amount,source')
        .eq('id', transactionId)
        .maybeSingle();
      if (error) throw new Error('merit_transaction_lookup_failed');
      if (!data || data.source !== 'feature-deduct') return null;
      return Math.abs(data.amount);
    },
    async getRunByActionHash(actionHash) {
      const { data, error } = await client
        .from('feature_runs')
        .select('id,status')
        .eq('server_action_key_hash', actionHash)
        .maybeSingle();
      if (error) throw new Error('feature_run_lookup_failed');
      return data as FeatureRunRecord | null;
    },
    async insertRun(row) {
      const { data, error } = await client
        .from('feature_runs')
        .insert(row as never)
        .select('id,status')
        .maybeSingle();
      if (error) return null;
      return data as FeatureRunRecord | null;
    },
    async updateMerits(featureRunId, patch) {
      const { error } = await client
        .from('feature_runs')
        .update(patch as never)
        .eq('id', featureRunId);
      return !error;
    },
    async getRunStatus(featureRunId) {
      const { data, error } = await client
        .from('feature_runs')
        .select('status')
        .eq('id', featureRunId)
        .maybeSingle();
      if (error) throw new Error('feature_run_status_failed');
      return (data?.status as FeatureRunStatus | undefined) ?? null;
    },
    async terminalize(featureRunId, fromStatus, patch) {
      const { data, error } = await client
        .from('feature_runs')
        .update(patch as never)
        .eq('id', featureRunId)
        .eq('status', fromStatus)
        .select('id')
        .maybeSingle();
      return !error && data?.id === featureRunId;
    },
  };
}

function dependencies(
  deps: FeatureRunTelemetryDependencies,
): Required<FeatureRunTelemetryDependencies> {
  return {
    store: deps.store ?? supabaseStore(),
    runtimeEnvironment: deps.runtimeEnvironment ?? getRuntimeEnvironment,
    randomUuid: deps.randomUuid ?? crypto.randomUUID,
    now: deps.now ?? (() => new Date().toISOString()),
  };
}

export async function recoverFeatureRun(
  params: CreateFeatureRunParams,
  deps: FeatureRunTelemetryDependencies = {},
): Promise<FeatureRunResult> {
  try {
    const store = deps.store ?? supabaseStore();
    const existing = await store.getRunByActionHash(await actionKeyHash(params));
    return existing
      ? { ok: true, featureRunId: existing.id, recovered: true }
      : { ok: false, reason: 'feature_run_not_found' };
  } catch {
    log.warn('recover-failed', { reason: 'feature_run_lookup_failed' });
    return { ok: false, reason: 'feature_run_lookup_failed' };
  }
}

export async function createFeatureRun(
  params: CreateFeatureRunParams,
  deps: FeatureRunTelemetryDependencies = {},
): Promise<FeatureRunResult> {
  try {
    if (!params.userId || !params.serverActionKey) {
      return { ok: false, reason: 'invalid_feature_run_identity' };
    }
    if (
      params.documentCount !== undefined &&
      (!Number.isInteger(params.documentCount) || params.documentCount < 0)
    ) {
      return { ok: false, reason: 'invalid_document_count' };
    }

    const resolved = dependencies(deps);
    const actionHash = await actionKeyHash(params);
    const existing = await resolved.store.getRunByActionHash(actionHash);
    if (existing) {
      return { ok: true, featureRunId: existing.id, recovered: true };
    }

    const profile = await resolved.store.getProfile(params.userId);
    const tier = normalizeTier(profile?.subscriptionTier);
    const configuredPrice = resolveTierAndInterval(profile?.stripePriceId);
    const period = configuredPrice.tier === tier ? configuredPrice.interval : null;

    let costingSubjectId = await resolved.store.getCostingSubject(params.userId);
    if (!costingSubjectId) {
      costingSubjectId = await resolved.store.createCostingSubject(
        resolved.randomUuid(),
        params.userId,
      );
    }
    if (!costingSubjectId) {
      return { ok: false, reason: 'costing_subject_unavailable' };
    }

    const excludeFromCosting = await resolved.store.isExcluded(costingSubjectId);
    const featureRunId = resolved.randomUuid();
    const now = resolved.now();
    const inserted = await resolved.store.insertRun({
      id: featureRunId,
      request_id: params.requestId ?? null,
      server_action_key_hash: actionHash,
      costing_subject_id: costingSubjectId,
      user_id: params.userId,
      analysis_job_id: params.analysisJobId ?? null,
      feature: params.feature,
      run_variant: params.runVariant ?? 'standard',
      status: 'started',
      tier_at_time: tier,
      subscription_period_at_time: period,
      input_type: params.inputType ?? 'unknown',
      document_count: params.documentCount ?? null,
      environment: resolved.runtimeEnvironment(),
      exclude_from_costing_at_time: excludeFromCosting,
      telemetry_version: '04.2',
      costing_epoch: 'phase_04_2_complete',
      served_from_cache: params.servedFromCache ?? false,
      cache_source: params.cacheSource ?? null,
      started_at: now,
      created_at: now,
      updated_at: now,
    });
    if (inserted) {
      return { ok: true, featureRunId: inserted.id, recovered: false };
    }

    // Unique action-key conflict is an idempotent recovery, not a product error.
    const raced = await resolved.store.getRunByActionHash(actionHash);
    return raced
      ? { ok: true, featureRunId: raced.id, recovered: true }
      : { ok: false, reason: 'feature_run_insert_failed' };
  } catch {
    log.warn('create-failed', { reason: 'feature_run_telemetry_unavailable' });
    return { ok: false, reason: 'feature_run_telemetry_unavailable' };
  }
}

export async function markFeatureRunMerits(
  featureRunId: string,
  values: { meritsCharged?: number; meritsRefunded?: number },
  deps: FeatureRunTelemetryDependencies = {},
): Promise<boolean> {
  try {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && (!Number.isInteger(value) || value < 0)) return false;
      if (key === 'meritsCharged' && value !== undefined) {
        patch.merits_charged = value;
        patch.merit_charge_known = true;
      }
      if (key === 'meritsRefunded' && value !== undefined) {
        patch.merits_refunded = value;
        patch.merit_refund_known = true;
      }
    }
    return await (deps.store ?? supabaseStore()).updateMerits(featureRunId, patch);
  } catch {
    log.warn('merit-observation-failed', { reason: 'feature_run_update_failed' });
    return false;
  }
}

/** Observe the canonical Merit ledger after its gateway has returned. */
export async function observeFeatureRunMeritTransaction(
  featureRunId: string,
  transactionId: string,
  observation: 'charged' | 'refunded',
  deps: FeatureRunTelemetryDependencies = {},
): Promise<boolean> {
  try {
    if (!transactionId || transactionId === 'cache-hit') {
      return observation === 'charged'
        ? await markFeatureRunMerits(featureRunId, { meritsCharged: 0 }, deps)
        : false;
    }
    const store = deps.store ?? supabaseStore();
    const amount = await store.getMeritTransactionAmount(transactionId);
    if (amount === null) return false;
    return await markFeatureRunMerits(
      featureRunId,
      observation === 'charged'
        ? { meritsCharged: amount }
        : { meritsRefunded: amount },
      { ...deps, store },
    );
  } catch {
    log.warn('merit-observation-failed', { reason: 'merit_evidence_unavailable' });
    return false;
  }
}

export async function terminalizeFeatureRun(
  featureRunId: string,
  terminal: {
    status: Exclude<FeatureRunStatus, 'started'>;
    errorCode?: string;
    errorCategory?: string;
  },
  deps: FeatureRunTelemetryDependencies = {},
): Promise<boolean> {
  try {
    const store = deps.store ?? supabaseStore();
    const current = await store.getRunStatus(featureRunId);
    if (!current) return false;
    if (current !== 'started') return current === terminal.status;
    return await store.terminalize(featureRunId, current, {
      status: terminal.status,
      error_code: terminal.status === 'completed' ? null : terminal.errorCode ?? 'unknown',
      error_category: terminal.status === 'completed'
        ? null
        : terminal.errorCategory ?? 'internal',
      completed_at: (deps.now ?? (() => new Date().toISOString()))(),
      updated_at: (deps.now ?? (() => new Date().toISOString()))(),
    });
  } catch {
    log.warn('terminalize-failed', { reason: 'feature_run_update_failed' });
    return false;
  }
}

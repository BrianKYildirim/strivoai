import {
  createFeatureRun,
  markFeatureRunMerits,
  observeFeatureRunMeritTransaction,
  terminalizeFeatureRun,
  type CostedFeature,
  type CreateFeatureRunParams,
} from './feature-run-telemetry.ts';
import { resolveFeatureRunToken } from './feature-run-token.ts';
import { getServiceClient } from './supabase-client.ts';

type RunVariant = NonNullable<CreateFeatureRunParams['runVariant']>;
type InputType = NonNullable<CreateFeatureRunParams['inputType']>;

export interface BeginFeatureRunParams {
  userId: string;
  feature: CostedFeature;
  requestId: string;
  serverActionKey: string;
  runVariant?: RunVariant;
  inputType?: InputType;
  documentCount?: number;
  featureRunToken?: string;
  trustedFeatureRunId?: string;
  trustedInternal?: boolean;
}

export interface FeatureRunRuntime {
  featureRunId: string;
  requestId: string;
  recovered: boolean;
  observeCharge(transactionId: string): Promise<void>;
  observeRefund(transactionId: string): Promise<void>;
  markZeroMerits(): Promise<void>;
  linkAnalysisJob(analysisJobId: string): Promise<void>;
  markCache(source: 'analysis_cache' | 'stored_result' | 'accepted_extraction'): Promise<void>;
  flushAiCalls(): Promise<void>;
  complete(): Promise<void>;
  fail(errorCode: string, errorCategory: string): Promise<void>;
  cancel(errorCode?: string): Promise<void>;
}

export type BeginFeatureRunResult =
  | { ok: true; runtime: FeatureRunRuntime | null }
  | { ok: false; reason: 'invalid_feature_run_correlation' };

interface ExistingRun {
  id: string;
  status: string;
  user_id: string | null;
  feature: string;
  request_id: string | null;
  run_variant: string;
  input_type: string;
  document_count: number | null;
}

async function findExistingRun(
  featureRunId: string,
  userId: string,
  feature: CostedFeature,
): Promise<ExistingRun | null> {
  const { data, error } = await getServiceClient()
    .from('feature_runs')
    .select('id,status,user_id,feature,request_id,run_variant,input_type,document_count')
    .eq('id', featureRunId)
    .eq('user_id', userId)
    .eq('feature', feature)
    .maybeSingle();
  return error ? null : data as ExistingRun | null;
}

function runtimeFor(
  featureRunId: string,
  requestId: string,
  recovered: boolean,
): FeatureRunRuntime {
  const client = getServiceClient();
  const linkAiCalls = async (): Promise<void> => {
    try {
      await client
        .from('ai_call_telemetry')
        .update({ feature_run_id: featureRunId })
        .eq('req_id', requestId)
        .is('feature_run_id', null);
    } catch {
      // Costing observers never alter product behavior.
    }
  };

  return {
    featureRunId,
    requestId,
    recovered,
    async observeCharge(transactionId) {
      await observeFeatureRunMeritTransaction(featureRunId, transactionId, 'charged');
    },
    async observeRefund(transactionId) {
      await observeFeatureRunMeritTransaction(featureRunId, transactionId, 'refunded');
    },
    async markZeroMerits() {
      await markFeatureRunMerits(featureRunId, { meritsCharged: 0, meritsRefunded: 0 });
    },
    async linkAnalysisJob(analysisJobId) {
      try {
        await client.from('feature_runs').update({ analysis_job_id: analysisJobId })
          .eq('id', featureRunId).eq('status', 'started');
      } catch {
        // Best-effort observer only.
      }
    },
    async markCache(source) {
      try {
        await client.from('feature_runs').update({
          served_from_cache: true,
          cache_source: source,
          merits_charged: 0,
          merit_charge_known: true,
          merits_refunded: 0,
          merit_refund_known: true,
          updated_at: new Date().toISOString(),
        }).eq('id', featureRunId).eq('status', 'started');
      } catch {
        // Best-effort observer only.
      }
    },
    async flushAiCalls() {
      await linkAiCalls();
    },
    async complete() {
      await linkAiCalls();
      await terminalizeFeatureRun(featureRunId, { status: 'completed' });
    },
    async fail(errorCode, errorCategory) {
      await linkAiCalls();
      await terminalizeFeatureRun(featureRunId, {
        status: 'failed',
        errorCode,
        errorCategory,
      });
    },
    async cancel(errorCode = 'user_canceled') {
      await linkAiCalls();
      await terminalizeFeatureRun(featureRunId, {
        status: 'canceled',
        errorCode,
        errorCategory: 'canceled',
      });
    },
  };
}

export async function beginFeatureRun(
  params: BeginFeatureRunParams,
): Promise<BeginFeatureRunResult> {
  try {
    if (params.featureRunToken) {
      const token = await resolveFeatureRunToken(params.featureRunToken);
      if (!token || token.userId !== params.userId || token.feature !== params.feature) {
        return { ok: false, reason: 'invalid_feature_run_correlation' };
      }
      const existing = await findExistingRun(token.featureRunId, params.userId, params.feature);
      if (!existing || existing.status !== 'started' ||
        existing.run_variant !== token.runVariant || existing.input_type !== token.inputType ||
        existing.document_count !== token.documentCount) {
        return { ok: false, reason: 'invalid_feature_run_correlation' };
      }
      return {
        ok: true,
        runtime: runtimeFor(existing.id, existing.request_id ?? params.requestId, true),
      };
    }

    if (params.trustedFeatureRunId) {
      if (!params.trustedInternal) {
        return { ok: false, reason: 'invalid_feature_run_correlation' };
      }
      const existing = await findExistingRun(
        params.trustedFeatureRunId,
        params.userId,
        params.feature,
      );
      if (!existing || existing.status !== 'started') {
        return { ok: false, reason: 'invalid_feature_run_correlation' };
      }
      return {
        ok: true,
        runtime: runtimeFor(existing.id, existing.request_id ?? params.requestId, true),
      };
    }

    const created = await createFeatureRun({
      userId: params.userId,
      feature: params.feature,
      requestId: params.requestId,
      serverActionKey: params.serverActionKey,
      runVariant: params.runVariant,
      inputType: params.inputType,
      documentCount: params.documentCount,
    });
    return {
      ok: true,
      runtime: created.ok
        ? runtimeFor(created.featureRunId, params.requestId, created.recovered)
        : null,
    };
  } catch {
    return { ok: true, runtime: null };
  }
}

import { createLogger } from './logger.ts';
import type { CostedFeature } from './feature-run-telemetry.ts';
import type { RuntimeEnvironment } from './runtime-environment.ts';
import { getServiceClient } from './supabase-client.ts';

const log = createLogger('document-telemetry');

export interface DocumentTelemetryParent {
  featureRunId: string;
  costingSubjectId: string;
  requestId: string | null;
  userId: string | null;
  feature: CostedFeature;
  tierAtTime: 'free' | 'pro' | 'elite';
  environment: RuntimeEnvironment;
  excludeFromCostingAtTime: boolean;
}

export interface RecordDocumentProcessingRunParams {
  parent: DocumentTelemetryParent;
  documentOrdinal: number;
  fileType: 'pdf' | 'docx';
  pageCount?: number | null;
  fileSizeBytes?: number | null;
  initialExtractor: 'pdf_parser' | 'docx_parser' | 'accepted_extraction' | 'unknown';
  finalExtractor?: 'pdf_parser' | 'docx_parser' | 'accepted_extraction' | 'mistral' |
    'textract' | 'claude_ocr' | 'none' | null;
  extractionStatus?: 'started' | 'completed' | 'empty' | 'insufficient_text' | 'failed' | 'unsupported';
  extractedCharacterCount?: number | null;
  extractionDurationMs?: number | null;
  ocrTriggered?: boolean;
  ocrTriggerReason?: 'empty_extraction' | 'insufficient_text' | 'scanned_document' |
    'parser_error' | 'unsupported_encoding' | 'manual_fallback' | 'other' | null;
  ocrProvider?: 'mistral' | 'textract' | 'anthropic' | null;
  ocrModel?: string | null;
  ocrPages?: number | null;
  ocrAttemptCount?: number | null;
  ocrStatus?: 'not_triggered' | 'completed' | 'failed' | 'unknown' | null;
  providerRequestId?: string | null;
  providerReportedCostUsd?: number | null;
  aiCallTelemetryId?: number | null;
  errorCode?: string | null;
  errorCategory?: 'validation' | 'provider' | 'timeout' | 'parsing' | 'unsupported' |
    'internal' | null;
  startedAt?: string;
  completedAt?: string | null;
}

export interface PagePricing {
  id: string;
  pagesPer1000Usd: number;
}

export interface DocumentTelemetryStore {
  find(featureRunId: string, documentOrdinal: number): Promise<{ id: string } | null>;
  insert(row: Record<string, unknown>): Promise<{ id: string } | null>;
  update(id: string, patch: Record<string, unknown>): Promise<boolean>;
  resolvePagePricing(provider: string, exactSku: string, at: string): Promise<PagePricing | null>;
}

export interface DocumentTelemetryDependencies {
  store?: DocumentTelemetryStore;
  randomUuid?: () => string;
  now?: () => string;
}

export type DocumentTelemetryResult =
  | { ok: true; documentProcessingRunId: string; recovered: boolean }
  | { ok: false; reason: string };

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Browser/backend pageCount=0 is the established unavailable sentinel. */
export function normalizeDocumentPageCount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function supabaseStore(): DocumentTelemetryStore {
  const client = getServiceClient();
  return {
    async find(featureRunId, documentOrdinal) {
      const { data, error } = await client
        .from('document_processing_runs')
        .select('id')
        .eq('feature_run_id', featureRunId)
        .eq('document_ordinal', documentOrdinal)
        .maybeSingle();
      if (error) throw new Error('document_run_lookup_failed');
      return data?.id ? { id: data.id } : null;
    },
    async insert(row) {
      const { data, error } = await client
        .from('document_processing_runs')
        .insert(row as never)
        .select('id')
        .maybeSingle();
      return !error && data?.id ? { id: data.id } : null;
    },
    async update(id, patch) {
      const { data, error } = await client
        .from('document_processing_runs')
        .update(patch as never)
        .eq('id', id)
        .select('id')
        .maybeSingle();
      return !error && data?.id === id;
    },
    async resolvePagePricing(provider, exactSku, at) {
      const { data, error } = await client
        .from('provider_pricing')
        .select('id,pages_per_1000_usd')
        .eq('provider', provider)
        .eq('exact_sku', exactSku)
        .eq('billing_unit', 'per_1000_pages')
        .lte('effective_from', at)
        .or(`effective_to.is.null,effective_to.gt.${at}`)
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle();
      const rate = Number(data?.pages_per_1000_usd);
      return !error && data?.id && Number.isFinite(rate) && rate >= 0
        ? { id: data.id, pagesPer1000Usd: rate }
        : null;
    },
  };
}

async function costPatch(
  params: RecordDocumentProcessingRunParams,
  store: DocumentTelemetryStore,
  at: string,
): Promise<Record<string, unknown>> {
  if (params.aiCallTelemetryId !== undefined && params.aiCallTelemetryId !== null) {
    return {
      ai_call_telemetry_id: params.aiCallTelemetryId,
      pricing_id: null,
      provider_reported_cost_usd: null,
      calculated_cost_usd: null,
      incurred_cost_usd: null,
      cost_variance_usd: null,
      cost_known: true,
      cost_confidence: 'referenced_ai',
    };
  }
  if (params.ocrTriggered === false) {
    return {
      pricing_id: null,
      provider_reported_cost_usd: 0,
      calculated_cost_usd: 0,
      incurred_cost_usd: 0,
      cost_variance_usd: 0,
      cost_known: true,
      cost_confidence: 'verified_zero',
    };
  }

  const reported = finiteNonNegative(params.providerReportedCostUsd);
  let pricing: PagePricing | null = null;
  let calculated: number | null = null;
  // The current Mistral contract proves page billing. The compatible Textract
  // endpoint does not prove operation/region/billing semantics, so it remains unknown.
  if (params.ocrProvider === 'mistral' && params.ocrModel && params.ocrPages !== null &&
    params.ocrPages !== undefined) {
    pricing = await store.resolvePagePricing('mistral', params.ocrModel, at);
    if (pricing) calculated = params.ocrPages * pricing.pagesPer1000Usd / 1000;
  }
  const incurred = reported ?? calculated;
  if (incurred === null) {
    return {
      pricing_id: pricing?.id ?? null,
      provider_reported_cost_usd: null,
      calculated_cost_usd: calculated,
      incurred_cost_usd: null,
      cost_variance_usd: null,
      cost_known: false,
      cost_confidence: 'unknown',
    };
  }
  return {
    pricing_id: pricing?.id ?? null,
    provider_reported_cost_usd: reported,
    calculated_cost_usd: calculated,
    incurred_cost_usd: incurred,
    cost_variance_usd: reported !== null && calculated !== null ? reported - calculated : null,
    cost_known: true,
    cost_confidence: reported !== null ? 'reported' : 'calculated',
  };
}

export async function recordDocumentProcessingRun(
  params: RecordDocumentProcessingRunParams,
  dependencies: DocumentTelemetryDependencies = {},
): Promise<DocumentTelemetryResult> {
  try {
    if (!Number.isInteger(params.documentOrdinal) || params.documentOrdinal < 1) {
      return { ok: false, reason: 'invalid_document_ordinal' };
    }
    const store = dependencies.store ?? supabaseStore();
    const now = dependencies.now ?? (() => new Date().toISOString());
    const at = params.startedAt ?? now();
    const terminal = (params.extractionStatus ?? 'started') !== 'started';
    const existing = await store.find(params.parent.featureRunId, params.documentOrdinal);
    const patch: Record<string, unknown> = {
      page_count: normalizeDocumentPageCount(params.pageCount),
      file_size_bytes: finiteNonNegative(params.fileSizeBytes),
      final_extractor: params.finalExtractor ?? null,
      extraction_status: params.extractionStatus ?? 'started',
      extracted_character_count: finiteNonNegative(params.extractedCharacterCount),
      extraction_duration_ms: finiteNonNegative(params.extractionDurationMs),
      ocr_triggered: params.ocrTriggered ?? false,
      ocr_trigger_reason: params.ocrTriggered ? params.ocrTriggerReason ?? 'other' : null,
      ocr_provider: params.ocrProvider ?? null,
      ocr_model: params.ocrModel ?? null,
      ocr_pages: finiteNonNegative(params.ocrPages),
      ocr_attempt_count: params.ocrTriggered === false
        ? 0
        : finiteNonNegative(params.ocrAttemptCount),
      ocr_status: params.ocrTriggered === false
        ? 'not_triggered'
        : params.ocrStatus ?? null,
      provider_request_id: params.providerRequestId ?? null,
      error_code: params.errorCode ?? null,
      error_category: params.errorCategory ?? null,
      completed_at: terminal ? params.completedAt ?? now() : null,
      ...(await costPatch(params, store, at)),
    };

    if (existing) {
      return await store.update(existing.id, patch)
        ? { ok: true, documentProcessingRunId: existing.id, recovered: true }
        : { ok: false, reason: 'document_run_update_failed' };
    }

    const id = (dependencies.randomUuid ?? crypto.randomUUID)();
    const inserted = await store.insert({
      id,
      feature_run_id: params.parent.featureRunId,
      costing_subject_id: params.parent.costingSubjectId,
      request_id: params.parent.requestId,
      user_id: params.parent.userId,
      document_ordinal: params.documentOrdinal,
      feature: params.parent.feature,
      tier_at_time: params.parent.tierAtTime,
      environment: params.parent.environment,
      exclude_from_costing_at_time: params.parent.excludeFromCostingAtTime,
      telemetry_version: '04.2',
      costing_epoch: 'phase_04_2_complete',
      file_type: params.fileType,
      initial_extractor: params.initialExtractor,
      started_at: at,
      created_at: at,
      ...patch,
    });
    if (inserted) {
      return { ok: true, documentProcessingRunId: inserted.id, recovered: false };
    }
    const raced = await store.find(params.parent.featureRunId, params.documentOrdinal);
    return raced
      ? { ok: true, documentProcessingRunId: raced.id, recovered: true }
      : { ok: false, reason: 'document_run_insert_failed' };
  } catch {
    log.warn('record-failed', { reason: 'document_telemetry_unavailable' });
    return { ok: false, reason: 'document_telemetry_unavailable' };
  }
}

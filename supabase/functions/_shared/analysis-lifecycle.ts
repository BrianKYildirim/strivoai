/**
 * supabase/functions/_shared/analysis-lifecycle.ts
 *
 * The shared, ordered analysis-lifecycle EXECUTOR (LIFE-03 / LIFE-04 / LIFE-06).
 *
 * This is the one genuinely new piece of Phase 3: sequencing DISCIPLINE enforced
 * on top of already-tested primitives. It orchestrates — never re-implements —
 * the 03-01 CAS RPCs, the 02-05/03-02 Merit idempotency seam, the 03-03 strict
 * validator + taxonomy + backoff, and the 03-04 dormancy flags.
 *
 * MANDATORY ORDERED SEQUENCE (LIFE-03), each arrow a `transition_analysis_run`
 * compare-and-swap (idempotent + monotonic — the states map INTO the existing
 * analysis_jobs worker; there is NO second state machine, Pitfall 4):
 *
 *   created -> validating_inputs -> reserving_merits -> extracting_data
 *           -> generating -> validating_output -> saving -> completed
 *
 * FINANCIAL DISCIPLINE:
 *   - Single-source idempotency key (D-02 / Pitfall 5 / LIFE-05): the key is
 *     derived EXACTLY ONCE, immediately after input identity is established and
 *     before ANY RPC. The SAME `idempotencyKey` const is passed as
 *     `p_idempotency_key` to `create_or_recover_analysis_run` (run-level
 *     partial-unique active dedup) AND assigned to `meritCtx.idempotencyKey` for
 *     `withMerits` (Merit-level dedup). Both dedups therefore key off the
 *     identical value. Deriving it only at reserve time would let create/recover
 *     run without it and create two rows — a defect.
 *   - Refund EXACTLY ONCE, ONLY pre-`saving` (Pitfall 2): `refundMeritsForJob`
 *     is called only from failure paths that are lexically BEFORE the
 *     `saving -> completed` transition. After that transition (the point of no
 *     return) there is no refund and no throw — any residual step is
 *     log-and-continue.
 *   - Settle-on-saved (Pitfall 3): `merit_settled = true` is written ONLY in the
 *     `saving -> completed` CAS patch — gated on a verified durable save, never
 *     on "the model returned".
 *   - Transient-only retry (LIFE-06): `classifyFailure` splits transient
 *     (provider timeout/rate-limit/network/transient-DB) from permanent
 *     (missing input / invalid output / auth / schema). Transient failures
 *     auto-retry in-process with bounded `computeBackoffMs`; permanent failures
 *     never retry and land in `failed`. On exhaustion the row rests in
 *     `retryable_failed` for the frontend Retry / reaper (03-06).
 *
 * DORMANCY (D-04): `runAnalysisLifecycle` early-returns a no-op unless
 * `isAnalysisFeatureEnabled(feature)`. No feature imports this module in Phase 3.
 */
import { getServiceClient } from './supabase-client.ts';
import {
  withMerits,
  refundMeritsForJob,
  isRefundableAnthropicError,
  type MeritGatewayContext,
  type MeritFeature,
} from './merit-gateway.ts';
import type { Json } from './database.types.ts';
import { deriveIdempotencyKey } from './idempotency-key.ts';
import { validateModelOutput, type LlmValidationOptions } from './llm-validation.ts';
import { ANALYSIS_ERROR_TABLE, type AnalysisErrorCode } from './analysis-error-taxonomy.ts';
import { computeBackoffMs } from './backoff.ts';
import { isAnalysisFeatureEnabled, type AnalysisFeature } from './analysis-flags.ts';
import { createLogger } from './logger.ts';
import {
  observeFeatureRunMeritTransaction,
  terminalizeFeatureRun,
} from './feature-run-telemetry.ts';
import type { CorsType } from './cors.ts';
import type { z } from 'https://esm.sh/zod@3.25.76';

const log = createLogger('analysis-lifecycle');

/** Bounded in-process retry cap for transient failures (LIFE-06). */
export const MAX_TRANSIENT_RETRIES = 3;

// ── Transient/permanent classifier (LIFE-06) ─────────────────────────────────

/**
 * isRetryableHttpStatus — inline mirror of the worker precedent
 * (process-resume-analysis-job/index.ts:51). Kept local (that helper is not
 * exported) so the classifier owns a single retryable-status set.
 */
function isRetryableHttpStatus(status: number): boolean {
  return (
    status === 503 ||
    status === 529 ||
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    (status >= 500 && status <= 599)
  );
}

/** Map a permanent HTTP status to the closest permanent taxonomy code. */
function permanentStatusCode(status: number): AnalysisErrorCode {
  if (status === 404) return 'FILE_NOT_FOUND';
  if (status === 400) return 'INPUT_MISSING';
  if (status === 422) return 'FILE_EXTRACTION_FAILED';
  return 'UNKNOWN_ANALYSIS_ERROR';
}

/**
 * classifyFailure — the LIFE-06 transient/permanent partition.
 *
 * Precedence:
 *   1. A typed error already carrying an `AnalysisErrorCode` → the taxonomy row
 *      is authoritative (e.g. LlmValidationError: SCHEMA_VALIDATION_FAILED →
 *      permanent).
 *   2. An HTTP-status-bearing error → transient iff refundable-Anthropic OR
 *      retryable-status (delegates to isRefundableAnthropicError +
 *      isRetryableHttpStatus); otherwise permanent.
 *   3. Message keywords (timeout / overload / network / rate-limit → transient;
 *      not-found / auth / schema / malformed → permanent).
 *   4. Fail-closed default: permanent (UNKNOWN_ANALYSIS_ERROR) — an unclassified
 *      error is NEVER auto-retried (T-03-12 DoS guard).
 */
export function classifyFailure(err: unknown): { retryable: boolean; code: AnalysisErrorCode } {
  const anyErr = err as { code?: unknown; status?: unknown; message?: unknown; name?: unknown } | null;

  // 1. Typed taxonomy code.
  const code = anyErr?.code;
  if (typeof code === 'string' && code in ANALYSIS_ERROR_TABLE) {
    return { retryable: ANALYSIS_ERROR_TABLE[code as AnalysisErrorCode].retryable, code: code as AnalysisErrorCode };
  }

  const message = typeof anyErr?.message === 'string' ? anyErr.message : String(err ?? '');
  const status = typeof anyErr?.status === 'number' ? anyErr.status : undefined;

  // 2. HTTP status.
  if (status !== undefined) {
    if (isRefundableAnthropicError(status, message) || isRetryableHttpStatus(status)) {
      return { retryable: true, code: status === 429 ? 'MODEL_RATE_LIMITED' : 'MODEL_TIMEOUT' };
    }
    return { retryable: false, code: permanentStatusCode(status) };
  }

  // 3. Message keywords.
  if (/rate.?limit/i.test(message)) return { retryable: true, code: 'MODEL_RATE_LIMITED' };
  if (/timeout|timed out|overload|econnreset|network|socket|aborterror/i.test(message)) {
    return { retryable: true, code: 'MODEL_TIMEOUT' };
  }
  if (/not found|no such file|missing/i.test(message)) return { retryable: false, code: 'FILE_NOT_FOUND' };
  if (/unauthor|forbidden|\bauth\b/i.test(message)) return { retryable: false, code: 'UNKNOWN_ANALYSIS_ERROR' };
  if (/schema|invalid|unsupported|malformed|truncat/i.test(message)) {
    return { retryable: false, code: 'SCHEMA_VALIDATION_FAILED' };
  }

  // 4. Fail-closed: an unclassified error is permanent (never retried).
  return { retryable: false, code: 'UNKNOWN_ANALYSIS_ERROR' };
}

// ── Executor contract ────────────────────────────────────────────────────────

export interface AnalysisLifecycleParams<T, E = unknown> {
  /** Dormancy feature key (gates the whole executor). */
  feature: AnalysisFeature;
  /** Merit-gateway feature namespace, e.g. 'resume_analysis' (withMerits deduct key). */
  meritFeature: MeritFeature;
  /** Deduction owner + tier + CORS surface for withMerits. */
  ctx: { userId: string; tier: 'free' | 'pro' | 'elite'; corsType: CorsType };
  /** Legacy analysis_jobs job_type (worker contract). */
  jobType: string;
  resumeId?: string;
  payload?: Json;
  /**
   * OPAQUE stable content-identity for the idempotency key (Pitfall 8 / D-06):
   * never a save-mutated field. Combined with attemptNonce to derive the key.
   */
  inputIdentity: string;
  /** Fresh only on a deliberate "new run" signal; a resubmit re-uses it → same key. */
  attemptNonce: string;
  /** Throws a typed error (INPUT_MISSING/FILE_NOT_FOUND) if inputs are missing (permanent). */
  validateInputs?: () => void | Promise<void>;
  /** Extract source data (extracting_data step). */
  extract: () => Promise<E>;
  /** Invoke the model (generating step); returns raw model text. */
  generate: (transactionId: string, extracted: E) => Promise<string>;
  /** Strict output schema (validating_output step via validateModelOutput). */
  schema: z.ZodTypeAny;
  validationOpts?: LlmValidationOptions<T>;
  /** Durable write of the validated result (saving step). Throws on failure. */
  save: (value: T) => Promise<void>;
  /** Optional retry cap override (default MAX_TRANSIENT_RETRIES). */
  maxRetries?: number;
  /** Optional correlation only; the existing analysis lifecycle remains authoritative. */
  featureRunId?: string;
  /** Explicit confirmation seam. Stale, timeout, and abort-like errors are not cancellation. */
  isConfirmedCancellation?: (error: unknown) => boolean;
  /** Optional observer injection for focused tests. Production uses the shared helper. */
  costingObserver?: LifecycleCostingObserver;
}

export interface LifecycleCostingObserver {
  observeMerit(
    featureRunId: string,
    transactionId: string,
    observation: 'charged' | 'refunded',
  ): Promise<unknown>;
  terminalize(
    featureRunId: string,
    terminal: {
      status: 'completed' | 'failed' | 'canceled';
      errorCode?: string;
      errorCategory?: string;
    },
  ): Promise<unknown>;
}

export type LifecycleCostingEvent =
  | { type: 'merit'; transactionId: string; observation: 'charged' | 'refunded' }
  | {
    type: 'terminal';
    status: 'completed' | 'failed' | 'canceled';
    errorCode?: string;
    errorCategory?: string;
  };

const DEFAULT_COSTING_OBSERVER: LifecycleCostingObserver = {
  observeMerit: observeFeatureRunMeritTransaction,
  terminalize: terminalizeFeatureRun,
};

/** Best-effort notification boundary: telemetry can never alter lifecycle results. */
export async function notifyLifecycleCosting(
  featureRunId: string | undefined,
  observer: LifecycleCostingObserver | undefined,
  event: LifecycleCostingEvent,
): Promise<void> {
  if (!featureRunId) return;
  const target = observer ?? DEFAULT_COSTING_OBSERVER;
  try {
    if (event.type === 'merit') {
      await target.observeMerit(featureRunId, event.transactionId, event.observation);
    } else {
      await target.terminalize(featureRunId, {
        status: event.status,
        errorCode: event.errorCode,
        errorCategory: event.errorCategory,
      });
    }
  } catch {
    log.warn('costing-observer-failed', { reason: 'observer_unavailable' });
  }
}

function costingCategory(code: AnalysisErrorCode, stage: string): string {
  if (/MODEL_/.test(code)) return code === 'MODEL_TIMEOUT' ? 'timeout' : 'provider';
  if (stage === 'validating_inputs' || stage === 'validating_output') return 'validation';
  if (stage === 'saving') return 'persistence';
  if (stage === 'extracting_data') return 'parsing';
  return 'internal';
}

export type AnalysisLifecycleResult<T> =
  | { ok: true; runId: string; value: T; transactionId: string }
  | { ok: false; dormant: true }
  | { ok: false; dormant: false; code: AnalysisErrorCode; runId: string | null; response?: Response };

// ── Internal transition helper ───────────────────────────────────────────────

async function transitionRun(
  supabase: ReturnType<typeof getServiceClient>,
  runId: string,
  from: string,
  to: string,
  patch: Json = {},
): Promise<boolean> {
  const { data, error } = await supabase.rpc('transition_analysis_run', {
    p_run_id: runId,
    p_from_state: from,
    p_to_state: to,
    p_patch: patch,
  });
  if (error) {
    log.error('transition failed', { runId, from, to, error: error.message });
    return false;
  }
  return (data as { transitioned?: boolean })?.transitioned === true;
}

// ── The executor ─────────────────────────────────────────────────────────────

/**
 * runAnalysisLifecycle — drive the mandatory ordered sequence once, with
 * single-source idempotency, refund-exactly-once-pre-saving, settle-on-saved,
 * and transient-only bounded retry. Dormant unless the feature flag is ON.
 */
export async function runAnalysisLifecycle<T, E = unknown>(
  params: AnalysisLifecycleParams<T, E>,
): Promise<AnalysisLifecycleResult<T>> {
  // Dormancy gate (D-04): no-op early-return unless this feature is enabled.
  if (!isAnalysisFeatureEnabled(params.feature)) {
    return { ok: false, dormant: true };
  }

  const supabase = getServiceClient();
  const { ctx } = params;
  const maxRetries = params.maxRetries ?? MAX_TRANSIENT_RETRIES;

  // ── Input identity established → derive the idempotency key EXACTLY ONCE,
  //    before ANY RPC. This single const is the ONLY source of the key. ──
  let inputsError: AnalysisErrorCode | null = null;
  try {
    if (params.validateInputs) await params.validateInputs();
  } catch (err) {
    inputsError = classifyFailure(err).code;
  }

  const idempotencyKey = await deriveIdempotencyKey({
    userId: ctx.userId,
    feature: params.meritFeature,
    tier: ctx.tier,
    inputIdentity: params.inputIdentity,
    attemptNonce: params.attemptNonce,
  });

  // ── created: create-or-recover the run row (run-level dedup on the SAME key). ──
  const { data: created, error: createErr } = await supabase.rpc('create_or_recover_analysis_run', {
    p_user_id: ctx.userId,
    p_feature: params.meritFeature,
    p_tier: ctx.tier,
    p_idempotency_key: idempotencyKey,
    p_job_type: params.jobType,
    // Omitted when unset: `create_or_recover_analysis_run` has a single
    // signature whose `p_resume_id uuid DEFAULT NULL` supplies the same NULL
    // the prior explicit `null` sent. No overload exists to re-dispatch to.
    p_resume_id: params.resumeId ?? undefined,
    p_payload: params.payload ?? {},
  });
  if (createErr || !created) {
    log.error('create_or_recover_analysis_run failed', { userId: ctx.userId, error: createErr?.message });
    return { ok: false, dormant: false, code: 'UNKNOWN_ANALYSIS_ERROR', runId: null };
  }
  const runId = (created as { run_id: string }).run_id;

  // ── created -> validating_inputs. A missing/invalid input is permanent: no
  //    Merit was reserved, so there is nothing to refund — straight to failed. ──
  await transitionRun(supabase, runId, 'created', 'validating_inputs');
  if (inputsError) {
    await transitionRun(supabase, runId, 'validating_inputs', 'failed', {
      failure_code: inputsError,
      failure_stage: 'validating_inputs',
    });
    await notifyLifecycleCosting(params.featureRunId, params.costingObserver, {
      type: 'terminal',
      status: 'failed',
      errorCode: inputsError,
      errorCategory: costingCategory(inputsError, 'validating_inputs'),
    });
    return { ok: false, dormant: false, code: inputsError, runId };
  }

  // ── validating_inputs -> reserving_merits: reserve via withMerits using the
  //    SAME idempotencyKey (Merit-level dedup keys off the identical value). The
  //    gateway owns the deduction (D-03); fn is trivial so the gateway never
  //    auto-refunds — the executor owns the refund boundary below. ──
  await transitionRun(supabase, runId, 'validating_inputs', 'reserving_merits');
  const meritCtx: MeritGatewayContext = {
    userId: ctx.userId,
    tier: ctx.tier,
    corsType: ctx.corsType,
  };
  meritCtx.idempotencyKey = idempotencyKey;
  const gated = await withMerits(meritCtx, params.meritFeature, async (txId: string) => txId);
  if (!gated.ok) {
    await transitionRun(supabase, runId, 'reserving_merits', 'failed', {
      failure_code: 'MERIT_RESERVATION_FAILED',
      failure_stage: 'reserving_merits',
    });
    await notifyLifecycleCosting(params.featureRunId, params.costingObserver, {
      type: 'terminal',
      status: 'failed',
      errorCode: 'MERIT_RESERVATION_FAILED',
      errorCategory: 'internal',
    });
    return { ok: false, dormant: false, code: 'MERIT_RESERVATION_FAILED', runId, response: gated.response };
  }
  const transactionId = gated.transactionId;
  await notifyLifecycleCosting(params.featureRunId, params.costingObserver, {
    type: 'merit',
    transactionId,
    observation: 'charged',
  });

  // Single pre-saving refund closure — the ONLY refund path, reachable exclusively
  // from the failure branches below (all lexically BEFORE saving -> completed).
  const refundAndFail = async (
    fromState: string,
    toState: 'retryable_failed' | 'failed',
    code: AnalysisErrorCode,
    stage: string,
    confirmedCancellation = false,
  ): Promise<AnalysisLifecycleResult<T>> => {
    const refund = await refundMeritsForJob(ctx.userId, transactionId, `${stage}:${code}`);
    await transitionRun(supabase, runId, fromState, toState, {
      failure_code: code,
      failure_stage: stage,
      // Never record a refund that did not happen. Leaving this false keeps the
      // persisted transaction eligible for the idempotent stale-run backstop.
      refunded: refund.ok,
    });
    if (refund.ok) {
      await notifyLifecycleCosting(params.featureRunId, params.costingObserver, {
        type: 'merit',
        transactionId,
        observation: 'refunded',
      });
    }
    await notifyLifecycleCosting(params.featureRunId, params.costingObserver, {
      type: 'terminal',
      status: confirmedCancellation ? 'canceled' : 'failed',
      errorCode: code,
      errorCategory: confirmedCancellation ? 'canceled' : costingCategory(code, stage),
    });
    return { ok: false, dormant: false, code, runId };
  };

  // ── reserving_merits -> extracting_data. ──
  // D9-08: persist the reserved Merit transaction id onto the run in the SAME transition
  // that leaves reserving_merits. `withMerits` returns the id only in-process; if the worker
  // then dies in any later state (extracting_data / generating / validating_output / saving /
  // retryable_failed — every state the reaper terminalizes), the reaper releases the stranded
  // reservation by `merit_transaction_id`. Without this the column stays NULL, the reaper's
  // `hasMerit` gate is false, and the run is terminalized to `failed` with the Merit never
  // returned — a live money leak whenever MERIT_SYSTEM_ENABLED is on. The transition RPC already
  // whitelists merit_transaction_id (20260702000001 ledger migration); the lifecycle just never
  // sent it. Refund control flow is unchanged: the in-process `transactionId` still drives every
  // pre-saving refundAndFail below; this only makes the id recoverable after worker death.
  await transitionRun(supabase, runId, 'reserving_merits', 'extracting_data', {
    merit_transaction_id: transactionId,
  });
  let extracted: E;
  try {
    extracted = await params.extract();
  } catch (err) {
    const c = classifyFailure(err);
    return await refundAndFail(
      'extracting_data',
      c.retryable ? 'retryable_failed' : 'failed',
      c.code,
      'extracting_data',
      params.isConfirmedCancellation?.(err) === true,
    );
  }

  // ── extracting_data -> generating -> validating_output, with transient-only
  //    in-process retry (LIFE-06). Permanent → stop; transient → backoff+retry;
  //    exhausted → retryable_failed. Strict validation gates the save. ──
  await transitionRun(supabase, runId, 'extracting_data', 'generating');
  let value: T | null = null;
  let lastCode: AnalysisErrorCode = 'UNKNOWN_ANALYSIS_ERROR';
  let attempt = 0;
  for (;;) {
    try {
      const raw = await params.generate(transactionId, extracted);
      const validated = validateModelOutput(raw, params.schema, params.validationOpts);
      if (validated.ok) {
        value = validated.value as T;
        break;
      }
      // Validation failures are permanent (never fabricate a body) — do NOT retry.
      lastCode = validated.code;
      return await refundAndFail('generating', 'failed', validated.code, 'validating_output');
    } catch (err) {
      const c = classifyFailure(err);
      lastCode = c.code;
      if (params.isConfirmedCancellation?.(err) === true) {
        return await refundAndFail(
          'generating',
          'failed',
          c.code,
          'generating',
          true,
        );
      }
      if (!c.retryable) {
        return await refundAndFail(
          'generating',
          'failed',
          c.code,
          'generating',
          params.isConfirmedCancellation?.(err) === true,
        );
      }
      if (attempt >= maxRetries) {
        // Transient exhausted — rest in retryable_failed for the frontend Retry / reaper.
        return await refundAndFail('generating', 'retryable_failed', c.code, 'generating');
      }
      attempt += 1;
      await transitionRun(supabase, runId, 'generating', 'generating', { retry_count: attempt });
      await new Promise((r) => setTimeout(r, computeBackoffMs(attempt)));
    }
  }
  void lastCode;

  // ── validating_output -> saving. ──
  await transitionRun(supabase, runId, 'generating', 'validating_output');
  await transitionRun(supabase, runId, 'validating_output', 'saving');
  try {
    await params.save(value);
  } catch (err) {
    // An unsaved result must NOT be charged (still pre-saving-completed → refund
    // allowed). Rest in retryable_failed so the user can retry.
    void err;
    return await refundAndFail('saving', 'retryable_failed', 'DATABASE_SAVE_FAILED', 'saving');
  }

  // ── saving -> completed: POINT OF NO RETURN. Settle (merit_settled=true) ONLY
  //    in this CAS patch — gated on the verified durable save above. Below this
  //    line there is NO refund and NO throw; any residual step is log-and-continue. ──
  const settled = await transitionRun(supabase, runId, 'saving', 'completed', { merit_settled: true });
  if (!settled) {
    // CAS no-op → another actor already completed+settled this run (idempotent).
    // Never refund here: the result is durably saved (Pitfall 2).
    log.info('completion CAS no-op — run already completed by another actor', { runId });
  }
  await notifyLifecycleCosting(params.featureRunId, params.costingObserver, {
    type: 'terminal',
    status: 'completed',
  });
  return { ok: true, runId, value, transactionId };
}

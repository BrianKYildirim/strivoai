import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, getSupabaseUrl, getServiceRoleKey } from '../_shared/supabase-client.ts';
import { requireAuth } from '../_shared/auth.ts';
import { handleOptionsRequest } from '../_shared/cors.ts';
import { refundMeritsForJob } from '../_shared/merit-gateway.ts';
import { isAnalysisFeatureEnabled } from '../_shared/analysis-flags.ts';
import { terminalizeStuckRun } from '../_shared/terminalize-stuck-run.ts';
import {
  observeFeatureRunMeritTransaction,
  terminalizeFeatureRun,
} from '../_shared/feature-run-telemetry.ts';

/** Map an analyze-career non-2xx status to a permanent lifecycle taxonomy code. */
function permanentCodeForStatus(status: number): string {
  if (status === 400) return 'INPUT_MISSING';
  if (status === 402 || status === 429) return 'MERIT_RESERVATION_FAILED';
  if (status === 404) return 'FILE_NOT_FOUND';
  // 260713-hrd: analyze-career now returns 422 for a TRUNCATED / INCOMPLETE model output,
  // which is not a file-extraction problem.
  if (status === 422) return 'OUTPUT_TRUNCATED';
  return 'UNKNOWN_ANALYSIS_ERROR';
}

/**
 * Is this failure PERMANENT regardless of what the HTTP status heuristic thinks?
 *
 * 260713-hrd (RC-3). `isRetryableHttpStatus` below treats 429 as transient — which is right
 * for a rate limit and catastrophically wrong for an entitlement denial. Production shows
 * career jobs failing with `usage_limit_reached` after `attempts: 8`: a PERMANENT denial,
 * retried 8 times with exponential backoff, dying minutes after the frontend's 180s poll had
 * already given up. The user saw a timeout for a run that then failed server-side, and the
 * merits were frequently never returned.
 *
 * A deterministic failure must terminate on the FIRST response so the refund fires immediately.
 * An explicit signal from the body therefore OVERRIDES the status heuristic. Truncation is in
 * this set because it is generated at temperature 0 — retrying reproduces it exactly.
 */
function isExplicitlyPermanent(responseBody: any): boolean {
  if (responseBody?.retryable === false) return true;
  const code = responseBody?.error;
  return code === 'usage_limit_reached' ||
    code === 'output_truncated' ||
    code === 'incomplete_output';
}

const WORKER_FUNCTION_VERSION = "career-queue-worker-2026-02-25";
const JOB_TYPE = "career_compass_analysis";
const TARGET_FUNCTION = "analyze-career";

/**
 * RESILIENCE CONTRACT — verified 2026-04-19 (quick task 260419-20o, Task 3)
 * ---------------------------------------------------------------------------
 * Frontend overlay contract:
 *   - Loading screen lives behind a single boolean: hide as soon as
 *     analysis_jobs.status flips to 'completed' AND the analysis_results row
 *     (analysis_type='career_compass') for this job exists.
 *   - On terminal failure (status='failed'), the user must see an error toast
 *     AND any deducted merits must be refunded so they are not double-charged.
 *
 * Verified invariants — DO NOT REGRESS:
 *   1. analyze-career persists results into analysis_results (analysis_type=
 *      'career_compass', raw_response) — the sole authoritative store (D-10) — on
 *      success and surfaces non-2xx on failure (no silent success).
 *   2. This worker maps non-2xx into either retry (computeRetryBackoffMs +
 *      isRetryableHttpStatus) or terminal failed status.
 *   3. Internal-secret auth (requireAuth({type:'internal'})) gates every job
 *      pickup so the worker cannot be triggered from a browser.
 *
 *  - Terminal failures call refundMeritsForJob() before writing status='failed' (Phase 26 / MER-11).
 */

type AnalysisJobRow = {
  id: string;
  user_id: string;
  job_type: string;
  status: "pending" | "retrying" | "processing" | "completed" | "failed";
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  available_at: string;
  created_at: string;
  merit_transaction_id: string | null;
};

function computeRetryBackoffMs(attempt: number) {
  const base = Math.min(300000, 4000 * (2 ** Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * 1000);
  return base + jitter;
}

/**
 * CAREER-LOCAL BY DESIGN (ED-3). This is one of three independent copies of this classifier —
 * the resume worker and the shared lifecycle executor each have their own. That duplication is
 * what makes it SAFE to tighten career's retry semantics (260713-hrd) without rippling into
 * Resume Analysis, LinkedIn Grader, or Recruiting Lens. Do not "helpfully" hoist this into
 * `_shared/` — the blast-radius containment is the whole point.
 *
 * Note 429 is still listed as retryable here: that is correct for a genuine RATE limit. An
 * entitlement/usage denial also arrives as 429 but is permanent, and is caught upstream of this
 * heuristic by `isExplicitlyPermanent`.
 */
function isRetryableHttpStatus(status: number) {
  return status === 503 || status === 529 || status === 408 || status === 409 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

async function parseJsonSafe(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptionsRequest({ type: 'internal' });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  try {
    await requireAuth(req, { type: 'internal' });
    const internalJobSecret = Deno.env.get("INTERNAL_JOB_SECRET") || "";
    const supabase = getServiceClient();
    const SUPABASE_URL = getSupabaseUrl();
    const SUPABASE_SERVICE_ROLE_KEY = getServiceRoleKey();

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const batchSize = Math.max(1, Math.min(Number(body?.batchSize) || 2, 5));
    const source = typeof body?.source === "string" ? body.source : "manual";
    const chainDepth = Math.max(0, Math.min(Number(body?.chainDepth) || 0, 3));
    const nowIso = new Date().toISOString();

    const { data: candidates, error: candidateError } = await supabase
      .from("analysis_jobs")
      .select("id, user_id, job_type, status, payload, attempts, max_attempts, available_at, created_at, merit_transaction_id")
      .eq("job_type", JOB_TYPE)
      .in("status", ["pending", "retrying"])
      .lte("available_at", nowIso)
      .order("available_at", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (candidateError) {
      console.error("Failed to load career queued jobs:", candidateError);
      return new Response(JSON.stringify({ error: "Failed to load queued jobs" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const claimedJobs: AnalysisJobRow[] = [];
    for (const candidate of (candidates ?? []) as AnalysisJobRow[]) {
      const claimTime = new Date().toISOString();
      const { data: claimed } = await supabase
        .from("analysis_jobs")
        .update({
          status: "processing",
          attempts: candidate.attempts + 1,
          claimed_at: claimTime,
          updated_at: claimTime,
          worker_id: source,
          function_version: WORKER_FUNCTION_VERSION,
          last_error_message: null,
        })
        .eq("id", candidate.id)
        .eq("status", candidate.status)
        .eq("attempts", candidate.attempts)
        .select("id, user_id, job_type, status, payload, attempts, max_attempts, available_at, created_at, merit_transaction_id")
        .maybeSingle();
      if (claimed) claimedJobs.push(claimed as AnalysisJobRow);
    }

    let completed = 0;
    let retried = 0;
    let failed = 0;

    for (const job of claimedJobs) {
      const payload = job.payload || {};
      const userId = String((payload as { userId?: unknown }).userId || job.user_id || "");
      // ── 06-02 · FEAT-05 (Pattern 2) — two-writer deferral. When the flag is ON,
      //    the executor (inside analyze-career) already CAS'd the analysis_jobs row
      //    via transition_analysis_run (saving->completed + merit_settled on success;
      //    refunded + failed/retryable_failed on failure) AND owns the refund. This
      //    worker must therefore NOT independently drive status/state or refund — a
      //    raw write here would STOMP the executor's state and a raw refund would
      //    risk a double-refund. When OFF (100% of traffic today), every raw write +
      //    refund below runs byte-identical to before. The processing-claim above is
      //    preserved either way (it does not touch `state`; transition_analysis_run
      //    dual-writes status='processing' for mid-pipeline states — byte-compatible).
      const deferToExecutor = isAnalysisFeatureEnabled('career_compass');
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/${TARGET_FUNCTION}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "x-internal-job-secret": internalJobSecret,
          },
          body: JSON.stringify(payload),
        });
        const responseBody = await parseJsonSafe(resp);
        const updateTime = new Date().toISOString();

        if (resp.ok) {
          // Flag ON: the executor already wrote saving->completed (status + merit_settled);
          // skip the raw completed write. Flag OFF: byte-identical raw completed write.
          if (!deferToExecutor) {
            await supabase.from("analysis_jobs").update({
              status: "completed",
              result: responseBody,
              error: null,
              completed_at: updateTime,
              updated_at: updateTime,
              last_http_status: resp.status,
              last_error_message: null,
              function_version: responseBody?.functionVersion || WORKER_FUNCTION_VERSION,
            }).eq("id", job.id);
          }
          completed += 1;
          continue;
        }

        const retryableFromBody = Boolean(responseBody?.retryable);
        const retryableFromStatus = isRetryableHttpStatus(resp.status);
        // 260713-hrd (RC-3): an EXPLICIT permanent signal from the body beats the status
        // heuristic. Without this, an entitlement denial (429) or a deterministic truncation
        // looks "transient" and burns every remaining attempt before the refund can fire.
        const explicitlyPermanent = isExplicitlyPermanent(responseBody);
        const retryable = explicitlyPermanent ? false : (retryableFromBody || retryableFromStatus);
        const maxedOut = job.attempts >= job.max_attempts;
        const failurePayload = {
          error: responseBody?.error || (retryable ? "Temporary infrastructure issue while contacting career analysis service" : "Career analysis job failed"),
          details: responseBody?.details ?? null,
          retryable,
          lastStatus: resp.status,
          retryReason: explicitlyPermanent
            ? "permanent_body_signal"
            : (retryableFromBody ? "response_body" : (retryableFromStatus ? "http_status" : "none")),
          functionVersion: responseBody?.functionVersion || null,
        };

        if (retryable && !maxedOut) {
          // Flag ON: the executor owns retry classification + retryable_failed CAS
          // (status='retrying'); skip the raw retry write. Flag OFF: byte-identical.
          if (!deferToExecutor) {
            const backoffMs = computeRetryBackoffMs(job.attempts);
            const nextRun = new Date(Date.now() + backoffMs).toISOString();
            await supabase.from("analysis_jobs").update({
              status: "retrying",
              error: failurePayload,
              updated_at: updateTime,
              available_at: nextRun,
              last_http_status: resp.status,
              last_error_message: failurePayload.error,
              function_version: responseBody?.functionVersion || WORKER_FUNCTION_VERSION,
            }).eq("id", job.id);
          }
          retried += 1;
          continue;
        }

        // Flag ON: the executor USUALLY already refunded pre-saving AND CAS'd the
        // terminal state — a raw write here would stomp it. BUT when analyze-career
        // EARLY-RETURNS this permanent non-2xx BEFORE its runAnalysisLifecycle
        // executor ran (e.g. a pre-lifecycle input-validation 400 / entitlement 402),
        // the executor never terminalized submit's pre-created run → it would hang at
        // 'created' with a live reservation (D-04 violation). terminalizeStuckRun
        // deterministically fails + refunds it EXACTLY ONCE, and is a guarded no-op
        // when the executor DID resolve the run (terminal / retryable_failed).
        // Flag OFF: byte-identical refund-before-failed money path below.
        if (deferToExecutor) {
          await terminalizeStuckRun({
            supabase,
            runId: job.id,
            userId,
            meritTransactionId: job.merit_transaction_id,
            failureCode: permanentCodeForStatus(resp.status),
            failureStage: 'worker_terminal_4xx',
          });
        } else {
          // MER-11 Phase 26 (D-03/D-06/D-09): refund merits BEFORE flipping the row to status='failed'.
          {
            const txId = job.merit_transaction_id;
            if (!txId) {
              console.warn('refund-skip', { job_id: job.id, reason: 'pre_migration_null_txid' });
            } else {
              const reason = retryable ? 'retry_exhausted' : 'non_retryable_error';
              const r = await refundMeritsForJob(userId, txId, reason);
              if (!r.ok) {
                console.error('refund-failed', {
                  user_id: userId,
                  merit_transaction_id: txId,
                  job_id: job.id,
                  feature: 'career_analysis',
                  reason: r.error,
                });
              } else if (r.alreadyRefunded) {
                console.info('refund-already-refunded', { job_id: job.id, merit_transaction_id: txId });
              }
              if (r.ok && typeof payload.featureRunId === 'string') {
                await observeFeatureRunMeritTransaction(payload.featureRunId, txId, 'refunded');
              }
            }
          }

          await supabase.from("analysis_jobs").update({
            status: "failed",
            error: failurePayload,
            updated_at: updateTime,
            completed_at: updateTime,
            last_http_status: resp.status,
            last_error_message: failurePayload.error,
            function_version: responseBody?.functionVersion || WORKER_FUNCTION_VERSION,
          }).eq("id", job.id);
        }
        if (typeof payload.featureRunId === 'string') {
          await terminalizeFeatureRun(payload.featureRunId, {
            status: 'failed',
            errorCode: permanentCodeForStatus(resp.status),
            errorCategory: resp.status >= 500 ? 'provider' : 'validation',
          });
        }
        failed += 1;
      } catch (err) {
        const updateTime = new Date().toISOString();
        const errorMessage = err instanceof Error ? err.message : "Worker processing error";
        const maxedOut = job.attempts >= job.max_attempts;
        if (!maxedOut) {
          // Flag ON: executor owns retry classification; skip the raw retry write.
          if (!deferToExecutor) {
            const nextRun = new Date(Date.now() + computeRetryBackoffMs(job.attempts)).toISOString();
            await supabase.from("analysis_jobs").update({
              status: "retrying",
              error: { error: errorMessage, retryable: true, retryReason: "worker_exception" },
              updated_at: updateTime,
              available_at: nextRun,
              last_error_message: errorMessage,
              function_version: WORKER_FUNCTION_VERSION,
            }).eq("id", job.id);
          }
          retried += 1;
        } else if (!deferToExecutor) {
          // Flag OFF only: refund BEFORE flipping to status='failed' (worker-catch path).
          // Flag ON: the executor already refunded pre-saving + CAS'd the terminal state.
          // MER-11 Phase 26 (D-03/D-06/D-07/D-09).
          {
            const txId = job.merit_transaction_id;
            if (!txId) {
              console.warn('refund-skip', { job_id: job.id, reason: 'pre_migration_null_txid' });
            } else {
              const reason = 'worker_exception';
              const r = await refundMeritsForJob(userId, txId, reason);
              if (!r.ok) {
                console.error('refund-failed', {
                  user_id: userId,
                  merit_transaction_id: txId,
                  job_id: job.id,
                  feature: 'career_analysis',
                  reason: r.error,
                });
              } else if (r.alreadyRefunded) {
                console.info('refund-already-refunded', { job_id: job.id, merit_transaction_id: txId });
              }
              if (r.ok && typeof payload.featureRunId === 'string') {
                await observeFeatureRunMeritTransaction(payload.featureRunId, txId, 'refunded');
              }
            }
          }

          await supabase.from("analysis_jobs").update({
            status: "failed",
            error: { error: errorMessage, retryable: false, retryReason: "worker_exception" },
            updated_at: updateTime,
            completed_at: updateTime,
            last_error_message: errorMessage,
            function_version: WORKER_FUNCTION_VERSION,
          }).eq("id", job.id);
          if (typeof payload.featureRunId === 'string') {
            await terminalizeFeatureRun(payload.featureRunId, {
              status: 'failed',
              errorCode: 'QUEUE_WORKER_EXCEPTION',
              errorCategory: 'internal',
            });
          }
          failed += 1;
        } else {
          // Flag ON + maxedOut: the executor USUALLY owns the terminal state + refund.
          // But a worker-side exception (e.g. analyze-career unreachable) after the
          // executor never ran would leave submit's pre-created run stuck non-terminal.
          // terminalizeStuckRun deterministically fails + refunds it EXACTLY ONCE, and
          // is a guarded no-op when the executor already resolved the run.
          await terminalizeStuckRun({
            supabase,
            runId: job.id,
            userId,
            meritTransactionId: job.merit_transaction_id,
            failureCode: 'UNKNOWN_ANALYSIS_ERROR',
            failureStage: 'worker_exception',
          });
          if (typeof payload.featureRunId === 'string') {
            await terminalizeFeatureRun(payload.featureRunId, {
              status: 'failed',
              errorCode: 'QUEUE_WORKER_EXCEPTION',
              errorCategory: 'internal',
            });
          }
          failed += 1;
        }
      }
    }

    if (chainDepth < 2) {
      const { count } = await supabase
        .from("analysis_jobs")
        .select("id", { head: true, count: "exact" })
        .eq("job_type", JOB_TYPE)
        .in("status", ["pending", "retrying"])
        .lte("available_at", new Date().toISOString());
      if ((count || 0) > 0) {
        fetch(`${SUPABASE_URL}/functions/v1/process-career-analysis-job`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "x-internal-job-secret": internalJobSecret,
          },
          body: JSON.stringify({ batchSize, source: `${source}:chain`, chainDepth: chainDepth + 1 }),
        }).catch((chainError) => console.error("Failed to chain career worker invocation", chainError));
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      source,
      workerVersion: WORKER_FUNCTION_VERSION,
      claimed: claimedJobs.length,
      processed: claimedJobs.length,
      completed,
      retried,
      failed,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    if (err instanceof Response) throw err;
    console.error("Error in process-career-analysis-job:", err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, getSupabaseUrl, getServiceRoleKey } from '../_shared/supabase-client.ts';
import { requireAuth } from '../_shared/auth.ts';
import { handleOptionsRequest } from '../_shared/cors.ts';
import { refundMeritsForJob } from '../_shared/merit-gateway.ts';
import {
  observeFeatureRunMeritTransaction,
  terminalizeFeatureRun,
} from '../_shared/feature-run-telemetry.ts';

const WORKER_FUNCTION_VERSION = "resume-queue-worker-2026-02-25c";

/**
 * RESILIENCE CONTRACT — verified 2026-04-19 (quick task 260419-20o, Task 3)
 * ---------------------------------------------------------------------------
 * Frontend overlay contract:
 *   - Loading screen lives behind a single boolean: hide as soon as
 *     analysis_jobs.status flips to 'completed' AND grading_data is non-null
 *     (or recruiting_lens / career_compass equivalent).
 *   - On terminal failure (status='failed'), the user must see an error toast
 *     AND any deducted merits must be refunded so they are not double-charged.
 *
 * Verified invariants — DO NOT REGRESS:
 *   1. Every analyze-resume code path writes resumes.grading_data on success
 *      (verified across 13 sites: streaming/non-streaming × free/parallel/
 *      fallback × merit/legacy paths in analyze-resume/index.ts).
 *   2. analyze-resume returns non-2xx on failure; this worker maps non-2xx
 *      into either retry (computeRetryBackoffMs + isRetryableHttpStatus) or
 *      terminal failed status — never silently completes.
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

function isRetryableHttpStatus(status: number) {
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
  if (req.method === "OPTIONS") {
    return handleOptionsRequest({ type: 'internal' });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await requireAuth(req, { type: 'internal' });
    const internalJobSecret = Deno.env.get("INTERNAL_JOB_SECRET") || "";
    const supabase = getServiceClient();
    const SUPABASE_URL = getSupabaseUrl();
    const SUPABASE_SERVICE_ROLE_KEY = getServiceRoleKey();

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const batchSize = Math.max(1, Math.min(Number(body?.batchSize) || 2, 5));
    const source = typeof body?.source === "string" ? body.source : "manual";
    const chainDepth = Math.max(0, Math.min(Number(body?.chainDepth) || 0, 3));
    const nowIso = new Date().toISOString();

    console.log("Worker invocation started", { batchSize, source, chainDepth, workerVersion: WORKER_FUNCTION_VERSION });

    const { data: candidates, error: candidateError } = await supabase
      .from("analysis_jobs")
      .select("id, user_id, job_type, status, payload, attempts, max_attempts, available_at, created_at, merit_transaction_id")
      .eq("job_type", "resume_analysis")
      .in("status", ["pending", "retrying"])
      .lte("available_at", nowIso)
      .order("available_at", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (candidateError) {
      console.error("Failed to load queued jobs:", candidateError);
      return new Response(JSON.stringify({ error: "Failed to load queued jobs" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const claimedJobs: AnalysisJobRow[] = [];
    for (const candidate of (candidates ?? []) as AnalysisJobRow[]) {
      const claimTime = new Date().toISOString();
      const { data: claimed, error: claimError } = await supabase
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

      if (claimError) {
        console.error("Failed claiming job", { jobId: candidate.id, claimError });
        continue;
      }
      if (!claimed) {
        console.log("Job claim skipped due to concurrent worker", { jobId: candidate.id });
        continue;
      }
      claimedJobs.push(claimed as AnalysisJobRow);
    }

    if (claimedJobs.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        source,
        workerVersion: WORKER_FUNCTION_VERSION,
        claimed: 0,
        processed: 0,
        message: "No eligible jobs available",
      }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let completedCount = 0;
    let retriedCount = 0;
    let failedCount = 0;

    for (const job of claimedJobs) {
      const payload = job.payload || {};
      const resumeId = String(payload.resumeId || "");
      const userId = String(payload.userId || job.user_id || "");
      console.log("Processing resume analysis job", {
        jobId: job.id,
        resumeId,
        userId,
        attempt: job.attempts,
        maxAttempts: job.max_attempts,
      });

      try {
        // Phase 04: the stored unlock payload contains only stable client-safe
        // identifiers. Inject owner and Merit identity from the claimed job row,
        // then delegate all eligibility/generation/persistence to analyze-resume.
        const analysisPayload = payload.mode === 'elite_unlock'
          ? {
            mode: 'elite_unlock',
            resumeId,
            ...(typeof payload.baseAnalysisId === 'string' && payload.baseAnalysisId
              ? { baseAnalysisId: payload.baseAnalysisId }
              : {}),
            userId: job.user_id,
            meritTransactionId: job.merit_transaction_id,
            ...(typeof payload.featureRunId === 'string'
              ? { featureRunId: payload.featureRunId }
              : {}),
          }
          : payload;
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/analyze-resume`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "x-internal-job-secret": internalJobSecret,
          },
          body: JSON.stringify(analysisPayload),
        });

        const responseBody = await parseJsonSafe(resp);
        const updateTime = new Date().toISOString();

        if (resp.ok) {
          const { error: completeError } = await supabase
            .from("analysis_jobs")
            .update({
              status: "completed",
              result: responseBody,
              error: null,
              completed_at: updateTime,
              updated_at: updateTime,
              last_http_status: resp.status,
              last_error_message: null,
              function_version: (responseBody && responseBody.functionVersion) || WORKER_FUNCTION_VERSION,
            })
            .eq("id", job.id);

          if (completeError) {
            console.error("Failed marking job completed", { jobId: job.id, completeError });
            failedCount += 1;
            continue;
          }

          completedCount += 1;
          console.log("Resume analysis job completed", { jobId: job.id, resumeId, status: resp.status });
          continue;
        }

        const retryableFromBody = Boolean(responseBody?.retryable);
        const retryableFromStatus = payload.mode === 'elite_unlock' && resp.status === 409
          ? false
          : isRetryableHttpStatus(resp.status);
        const retryable = retryableFromBody || retryableFromStatus;
        const maxedOut = job.attempts >= job.max_attempts;
        const fallbackErrorMessage =
          retryableFromStatus && !responseBody?.error
            ? "Temporary infrastructure issue while contacting resume analysis service"
            : "Resume analysis job failed";
        const failurePayload = {
          error: responseBody?.error || fallbackErrorMessage,
          details: responseBody?.details ?? null,
          retryable,
          lastStatus: resp.status,
          functionVersion: responseBody?.functionVersion || null,
          retryReason: retryableFromBody ? "response_body" : (retryableFromStatus ? "http_status" : "none"),
        };

        if (retryable && !maxedOut) {
          const backoffMs = computeRetryBackoffMs(job.attempts);
          const nextRun = new Date(Date.now() + backoffMs).toISOString();
          const { error: retryUpdateError } = await supabase
            .from("analysis_jobs")
            .update({
              status: "retrying",
              error: failurePayload,
              updated_at: updateTime,
              available_at: nextRun,
              last_http_status: resp.status,
              last_error_message: failurePayload.error,
              function_version: responseBody?.functionVersion || WORKER_FUNCTION_VERSION,
            })
            .eq("id", job.id);

          if (retryUpdateError) {
            console.error("Failed to schedule retry", { jobId: job.id, retryUpdateError });
            failedCount += 1;
            continue;
          }

          retriedCount += 1;
          console.warn("Resume analysis job retry scheduled", {
            jobId: job.id,
            backoffMs,
            nextRun,
            attempt: job.attempts,
            maxAttempts: job.max_attempts,
            status: resp.status,
            retryReason: failurePayload.retryReason,
          });
          continue;
        }

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
                feature: 'resume_analysis',
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

        const { error: failUpdateError } = await supabase
          .from("analysis_jobs")
          .update({
            status: "failed",
            error: failurePayload,
            updated_at: updateTime,
            completed_at: updateTime,
            last_http_status: resp.status,
            last_error_message: failurePayload.error,
            function_version: responseBody?.functionVersion || WORKER_FUNCTION_VERSION,
          })
          .eq("id", job.id);

        if (failUpdateError) {
          console.error("Failed to mark job failed", { jobId: job.id, failUpdateError });
        }
        if (typeof payload.featureRunId === 'string') {
          await terminalizeFeatureRun(payload.featureRunId, {
            status: 'failed',
            errorCode: 'QUEUE_ANALYSIS_FAILED',
            errorCategory: 'provider',
          });
        }
        failedCount += 1;
        console.error("Resume analysis job failed", {
          jobId: job.id,
          status: resp.status,
          retryable,
          maxedOut,
          error: failurePayload.error,
        });
      } catch (processError) {
        const updateTime = new Date().toISOString();
        const errorMessage = processError instanceof Error ? processError.message : "Worker processing error";
        const maxedOut = job.attempts >= job.max_attempts;

        if (!maxedOut) {
          const backoffMs = computeRetryBackoffMs(job.attempts);
          const nextRun = new Date(Date.now() + backoffMs).toISOString();
          await supabase.from("analysis_jobs").update({
            status: "retrying",
            error: { error: errorMessage, retryable: true },
            updated_at: updateTime,
            available_at: nextRun,
            last_error_message: errorMessage,
            function_version: WORKER_FUNCTION_VERSION,
          }).eq("id", job.id);
          retriedCount += 1;
          console.warn("Worker error; scheduled retry", { jobId: job.id, backoffMs, errorMessage });
        } else {
          // MER-11 Phase 26 (D-03/D-06/D-07/D-09): refund merits BEFORE flipping to status='failed' (worker-catch path).
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
                  feature: 'resume_analysis',
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
            error: { error: errorMessage, retryable: false },
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
          failedCount += 1;
          console.error("Worker error; job marked failed", { jobId: job.id, errorMessage });
        }
      }
    }

    if (chainDepth < 2) {
      const { count: remainingReadyCount } = await supabase
        .from("analysis_jobs")
        .select("id", { count: "exact", head: true })
        .eq("job_type", "resume_analysis")
        .in("status", ["pending", "retrying"])
        .lte("available_at", new Date().toISOString());

      if ((remainingReadyCount || 0) > 0) {
        fetch(`${SUPABASE_URL}/functions/v1/process-resume-analysis-job`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "x-internal-job-secret": internalJobSecret,
          },
          body: JSON.stringify({ batchSize, source: `${source}:chain`, chainDepth: chainDepth + 1 }),
        }).catch((chainError) => console.error("Failed to chain worker invocation", { source, chainDepth, chainError }));
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      source,
      workerVersion: WORKER_FUNCTION_VERSION,
      claimed: claimedJobs.length,
      processed: claimedJobs.length,
      completed: completedCount,
      retried: retriedCount,
      failed: failedCount,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) throw err;
    console.error("Error in process-resume-analysis-job:", err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

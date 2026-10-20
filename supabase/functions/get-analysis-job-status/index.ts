import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, getSupabaseUrl, getServiceRoleKey } from '../_shared/supabase-client.ts';
import { corsHeaders, handleOptionsRequest, withCors } from '../_shared/cors.ts';
// Phase 42 L5: readWithArchiveFallback — used when reading analysis_cache.raw_response
// on any cache-lookup path added to this function. Currently analysis_jobs.result is
// returned directly (not gated by archive); wired for future cache-lookup paths.
import { readWithArchiveFallback } from '../_shared/archive-reader.ts';

async function authenticateRequest(
  req: Request,
  supabase: ReturnType<typeof getServiceClient>,
): Promise<string> {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid authorization header");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("Invalid user token");
  }

  return data.user.id;
}

serve((req) => withCors(req, 'user', async () => {
  if (req.method === "OPTIONS") {
    return handleOptionsRequest({ type: 'user' });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = getServiceClient();

    const authenticatedUserId = await authenticateRequest(req, supabase);

    let jobId = "";
    if (req.method === "GET") {
      const url = new URL(req.url);
      jobId = (url.searchParams.get("jobId") || "").trim();
    } else {
      const body = await req.json();
      jobId = (body?.jobId || "").trim();
    }

    if (!jobId) {
      return new Response(JSON.stringify({ error: "jobId is required" }), {
        status: 400,
        headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
      });
    }

    const { data: job, error } = await supabase
      .from("analysis_jobs")
      .select("id, user_id, job_type, status, result, error, attempts, max_attempts, available_at, claimed_at, completed_at, last_http_status, last_error_message, function_version, created_at, updated_at")
      .eq("id", jobId)
      .eq("user_id", authenticatedUserId)
      .maybeSingle();

    if (error) {
      console.error("Failed to load analysis job status:", { jobId, error });
      return new Response(JSON.stringify({ error: "Failed to load job status" }), {
        status: 500,
        headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
      });
    }

    if (!job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
      });
    }

    const INTERNAL_JOB_SECRET = (Deno.env.get("INTERNAL_JOB_SECRET") || "").trim();
    const dueForProcessing =
      (job.status === "pending" || job.status === "retrying") &&
      !!job.available_at &&
      new Date(job.available_at).getTime() <= Date.now();
    if (dueForProcessing && INTERNAL_JOB_SECRET) {
      const processorFunction =
        job.job_type === "career_compass_analysis"
          ? "process-career-analysis-job"
          : "process-resume-analysis-job";
      const _svcKey = getServiceRoleKey();
      fetch(`${getSupabaseUrl()}/functions/v1/${processorFunction}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: _svcKey,
          Authorization: `Bearer ${_svcKey}`,
          "x-internal-job-secret": INTERNAL_JOB_SECRET,
        },
        body: JSON.stringify({ batchSize: 2, source: "get-analysis-job-status" }),
      }).catch((triggerError) => console.error("Failed to trigger worker from status poll", { jobId, triggerError }));
    }

    const base = {
      jobId: job.id,
      jobType: job.job_type,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
      availableAt: job.available_at,
      claimedAt: job.claimed_at,
      completedAt: job.completed_at,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      lastHttpStatus: job.last_http_status,
      functionVersion: job.function_version,
    };

    if (job.status === "completed") {
      // Phase 42 L5: if job.result is NULL but archive_path is set, fall through to Storage.
      // analysis_jobs.result is the inline column; archive_path is set by lifecycle-archive-writer.
      let jobResult = job.result;
      if (jobResult === null || jobResult === undefined) {
        jobResult = await readWithArchiveFallback(
          supabase,
          "analysis_jobs",
          job.id,
          "result",
          "archive_path",
        );
      }
      return new Response(JSON.stringify({ ...base, result: jobResult }), {
        headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
      });
    }

    if (job.status === "failed") {
      const errorPayload = job.error ?? {
        error: job.last_error_message || "Analysis job failed",
        lastStatus: job.last_http_status,
      };
      const retryable = Boolean((errorPayload as any)?.retryable);
      const lastStatus = Number((errorPayload as any)?.lastStatus ?? job.last_http_status ?? 0);
      const isInfrastructureFailure =
        retryable &&
        (lastStatus === 503 || lastStatus >= 500);
      return new Response(JSON.stringify({
        ...base,
        retryable,
        isInfrastructureFailure,
        error: errorPayload,
      }), {
        headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
      });
    }

    const pollAfterMs = job.status === "processing" ? 1500 : 2500;
    return new Response(JSON.stringify({
      ...base,
      pollAfterMs,
      message:
        job.status === "retrying"
          ? `Job retry scheduled (attempt ${job.attempts}/${job.max_attempts})`
          : "Job is still in progress",
      lastErrorMessage: job.last_error_message,
    }), {
      headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in get-analysis-job-status:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const isAuthError = message.includes("Invalid user token") || message.includes("authorization header");
    return new Response(JSON.stringify({ error: message }), {
      status: isAuthError ? 401 : 500,
      headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
    });
  }
}));

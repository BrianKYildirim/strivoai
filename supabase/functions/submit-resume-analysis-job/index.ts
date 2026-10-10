import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, getSupabaseUrl, getServiceRoleKey } from '../_shared/supabase-client.ts';
import { corsHeaders, handleOptionsRequest, withCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { checkRateLimit, createRateLimitResponse } from '../_shared/rate-limiter.ts';
import { MERIT_SYSTEM_ENABLED, withMerits, MeritRefundable } from '../_shared/merit-gateway.ts';
import { createLogger } from '../_shared/logger.ts';
import { sha256Hex } from '../_shared/cache-fingerprint.ts';
import { beginFeatureRun, type FeatureRunRuntime } from '../_shared/feature-run-runtime.ts';

// Phase 21 D-19: boot-time merit-flag attestation (SC-5 evidence source).
createLogger("submit-resume-analysis-job").info("merit-flag", { enabled: MERIT_SYSTEM_ENABLED });

async function authenticateRequest(
  req: Request,
  supabase: ReturnType<typeof getServiceClient>,
  expectedUserId?: string,
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

  if (expectedUserId && data.user.id !== expectedUserId) {
    throw new Error("Authenticated user does not match request userId");
  }

  return data.user.id;
}

serve((req) => withCors(req, 'user', async () => {
  if (req.method === "OPTIONS") {
    return handleOptionsRequest({ type: 'user' });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
    });
  }

  const costingRequestId = crypto.randomUUID().slice(0, 8);
  let featureRuntime: FeatureRunRuntime | null = null;
  try {
    const supabase = getServiceClient();

    const body = await req.json();
    const mode = body.mode === 'elite_unlock' ? 'elite_unlock' : 'full_analysis';
    const userId = typeof body.userId === "string" ? body.userId : "";
    const resumeId = typeof body.resumeId === "string" ? body.resumeId : "";
    const baseAnalysisId = typeof body.baseAnalysisId === "string" && body.baseAnalysisId
      ? body.baseAnalysisId
      : null;
    const resumeText = typeof body.resumeText === "string" ? body.resumeText.slice(0, 100000) : "";
    const previousSuggestions = Array.isArray(body.previousSuggestions) ? body.previousSuggestions : [];
    const previousScore = typeof body.previousScore === "number" ? body.previousScore : null;

    const authenticatedUserCtx = await requireAuth(req, { type: 'user' });
    const authenticatedUserId = authenticatedUserCtx.userId;

    if (mode === 'elite_unlock') {
      const forbiddenUnlockFields = ['tier', 'userId', 'resumeText', 'gradingData', 'fileName', 'filename'];
      if (!resumeId || forbiddenUnlockFields.some((field) => body[field] !== undefined)) {
        return new Response(
          JSON.stringify({ error: "elite_unlock accepts only resumeId and optional baseAnalysisId" }),
          { status: 400, headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" } },
        );
      }
    } else if (!userId || !resumeId || !resumeText || resumeText.length < 50) {
      return new Response(
        JSON.stringify({ error: "userId, resumeId, and resumeText (min 50 chars) are required" }),
        { status: 400, headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" } },
      );
    }

    // Verify the userId in the body matches the authenticated user
    if (userId && authenticatedUserId !== userId) {
      return new Response(
        JSON.stringify({ error: "Authenticated user does not match request userId" }),
        { status: 403, headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" } },
      );
    }
    // Rate limit: 5/15/30 per hour by tier (D-01). Shares 'analyze-resume' counter key
    // to prevent double-counting when user switches between streaming and async paths.
    const rlJob = await checkRateLimit(authenticatedUserId, authenticatedUserCtx.tier, {
      key: 'analyze-resume',
      limits: { free: 5, pro: 15, elite: 30 },
    });
    if (!rlJob.allowed) {
      return createRateLimitResponse(rlJob.retryAfterSeconds, 'user');
    }

    // === Phase 13 branch (D-06) — submission-time deduction (D-07) ===
    // MIG-05: legacy path below is byte-identical until MERIT_SYSTEM_ENABLED flips to true.
    const queuePayload = mode === 'elite_unlock'
      ? {
        mode: 'elite_unlock',
        resumeId,
        ...(baseAnalysisId ? { baseAnalysisId } : {}),
      }
      : {
        resumeText,
        resumeId,
        userId: authenticatedUserId,
        tier: authenticatedUserCtx.tier,
        previousSuggestions,
        previousScore,
      };
    const activePayloadIdentity = mode === 'elite_unlock'
      ? { resumeId, mode: 'elite_unlock' }
      : { resumeId };
    const unlockIdempotencyKey = mode === 'elite_unlock'
      ? await sha256Hex(JSON.stringify({
        userId: authenticatedUserId,
        resumeId,
        baseAnalysisId,
        generation_mode: 'elite_unlock',
      }))
      : undefined;

    const correlation = await beginFeatureRun({
      userId: authenticatedUserId,
      feature: 'resume_analysis',
      requestId: costingRequestId,
      serverActionKey: typeof body.attemptNonce === 'string' && body.attemptNonce
        ? body.attemptNonce
        : unlockIdempotencyKey ?? `queue:${resumeId}:${costingRequestId}`,
      runVariant: mode === 'elite_unlock' ? 'elite_unlock' : 'standard',
      inputType: typeof body.featureRunToken === 'string' ? 'mixed' : 'text',
      documentCount: typeof body.featureRunToken === 'string' ? 1 : 0,
      featureRunToken: typeof body.featureRunToken === 'string' ? body.featureRunToken : undefined,
    });
    if (!correlation.ok) {
      return new Response(JSON.stringify({ error: correlation.reason }), {
        status: 400,
        headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
      });
    }
    featureRuntime = correlation.runtime;

    if ((MERIT_SYSTEM_ENABLED || mode === 'elite_unlock') && authenticatedUserCtx) {
      // WR-04: check for existing active job BEFORE withMerits to avoid charging
      // merits when reusing an already-queued job.
      const { data: existingJobMerit } = await supabase
        .from("analysis_jobs")
        .select("id, status, created_at")
        .eq("user_id", authenticatedUserId)
        .eq("job_type", "resume_analysis")
        .in("status", ["pending", "retrying", "processing"])
        .contains("payload", activePayloadIdentity)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingJobMerit?.id) {
        await featureRuntime?.linkAnalysisJob(existingJobMerit.id);
        return new Response(
          JSON.stringify({ jobId: existingJobMerit.id, status: existingJobMerit.status, pollAfterMs: 1500, reused: true }),
          { status: 202, headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" } },
        );
      }

      const gated = await withMerits(
        {
          userId: authenticatedUserId,
          tier: authenticatedUserCtx.tier as 'free' | 'pro' | 'elite',
          corsType: 'user' as const,
          idempotencyKey: unlockIdempotencyKey,
        },
        'resume_analysis',
        async (txId) => {
          const nowIso = new Date().toISOString();
          const { data: job, error: insertError } = await supabase
            .from("analysis_jobs")
            .insert({
              user_id: authenticatedUserId,
              job_type: "resume_analysis",
              status: "pending",
              payload: {
                ...queuePayload,
                ...(featureRuntime ? { featureRunId: featureRuntime.featureRunId } : {}),
              },
              attempts: 0,
              max_attempts: 8,
              available_at: nowIso,
              created_at: nowIso,
              updated_at: nowIso,
              merit_transaction_id: txId,
            })
            .select("id, status, created_at")
            .single();

          if (insertError || !job) {
            // D-08a: insert failure must refund the deduction. Throwing
            // MeritRefundable signals withMerits to call refund_merits before
            // re-raising — a plain Error would leak the merit charge.
            throw new MeritRefundable(503, `job insert failed: ${insertError?.message ?? 'unknown'}`);
          }
          await featureRuntime?.linkAnalysisJob(job.id);
          await featureRuntime?.observeCharge(txId);

          // Trigger worker (fire and forget)
          const INTERNAL_JOB_SECRET = (Deno.env.get("INTERNAL_JOB_SECRET") || "").trim();
          if (INTERNAL_JOB_SECRET) {
            fetch(`${getSupabaseUrl()}/functions/v1/process-resume-analysis-job`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${getServiceRoleKey()}`,
                "x-internal-job-secret": INTERNAL_JOB_SECRET,
              },
              body: JSON.stringify({ batchSize: 2, source: "submit-resume-analysis-job" }),
            }).catch((err) => console.error("Failed to trigger worker after enqueue", { jobId: job.id, err }));
          }

          return new Response(
            JSON.stringify({ jobId: job.id, status: job.status, pollAfterMs: 1500, queuedAt: job.created_at }),
            { status: 202, headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" } },
          );
        },
      );
      if (!gated.ok) {
        await featureRuntime?.fail('MERIT_GATE_REJECTED', 'authorization');
        return gated.response;
      }
      return gated.value;
    }

    // === Legacy path (unchanged) ===
    const { data: existingJob, error: existingJobError } = await supabase
      .from("analysis_jobs")
      .select("id, status, created_at")
      .eq("user_id", authenticatedUserId)
      .eq("job_type", "resume_analysis")
      .in("status", ["pending", "retrying", "processing"])
      .contains("payload", { resumeId })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingJobError) {
      console.error("Failed checking existing analysis job:", existingJobError);
    }

    if (existingJob?.id) {
      await featureRuntime?.linkAnalysisJob(existingJob.id);
      console.log("Reusing active resume analysis job", { jobId: existingJob.id, resumeId });
      return new Response(
        JSON.stringify({
          jobId: existingJob.id,
          status: existingJob.status,
          pollAfterMs: 1500,
          reused: true,
        }),
        { status: 202, headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" } },
      );
    }

    const nowIso = new Date().toISOString();
    const payload = {
      resumeText,
      resumeId,
      userId: authenticatedUserId,
      // Defense-in-depth (queue-path-tier-downgrade): authoritative server-read tier,
      // never client body.tier.
      tier: authenticatedUserCtx.tier,
      previousSuggestions,
      previousScore,
      ...(featureRuntime ? { featureRunId: featureRuntime.featureRunId } : {}),
    };

    const { data: job, error: insertError } = await supabase
      .from("analysis_jobs")
      .insert({
        user_id: authenticatedUserId,
        job_type: "resume_analysis",
        status: "pending",
        payload,
        attempts: 0,
        max_attempts: 8,
        available_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("id, status, created_at")
      .single();

    if (insertError || !job) {
      await featureRuntime?.fail('QUEUE_INSERT_FAILED', 'persistence');
      console.error("Failed to enqueue resume analysis job:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to enqueue resume analysis job" }),
        { status: 500, headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" } },
      );
    }

    await featureRuntime?.linkAnalysisJob(job.id);

    console.log("Enqueued resume analysis job", { jobId: job.id, userId: authenticatedUserId, resumeId });

    const INTERNAL_JOB_SECRET = (Deno.env.get("INTERNAL_JOB_SECRET") || "").trim();
    if (INTERNAL_JOB_SECRET) {
      fetch(`${getSupabaseUrl()}/functions/v1/process-resume-analysis-job`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getServiceRoleKey()}`,
          "x-internal-job-secret": INTERNAL_JOB_SECRET,
        },
        body: JSON.stringify({ batchSize: 2, source: "submit-resume-analysis-job" }),
      })
        .then((resp) => console.log("Triggered worker after enqueue", { jobId: job.id, status: resp.status }))
        .catch((err) => console.error("Failed to trigger worker after enqueue", { jobId: job.id, err }));
    } else {
      console.warn("INTERNAL_JOB_SECRET is not configured; queued jobs require external worker trigger");
    }

    return new Response(
      JSON.stringify({
        jobId: job.id,
        status: job.status,
        pollAfterMs: 1500,
        queuedAt: job.created_at,
      }),
      { status: 202, headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" } },
    );
  } catch (error) {
    // requireAuth throws a Response (401) for auth failures — let it propagate to
    // withCors intact instead of collapsing it into a 500 (fleet-wide guard; CR-01).
    if (error instanceof Response) throw error;
    await featureRuntime?.fail('QUEUE_SUBMIT_FAILED', 'internal');
    console.error("Error in submit-resume-analysis-job:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const isAuthError =
      message.includes("Invalid user token") ||
      message.includes("authorization header") ||
      message.includes("Authenticated user does not match request userId");

    return new Response(JSON.stringify({ error: message }), {
      status: isAuthError ? 401 : 500,
      headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
    });
  }
}));

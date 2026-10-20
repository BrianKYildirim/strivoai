import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, getSupabaseUrl, getServiceRoleKey } from '../_shared/supabase-client.ts';
import { corsHeaders, handleOptionsRequest, withCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { checkRateLimit, createRateLimitResponse } from '../_shared/rate-limiter.ts';
import { MERIT_SYSTEM_ENABLED, withMerits, MeritRefundable } from '../_shared/merit-gateway.ts';
import { isAnalysisFeatureEnabled } from '../_shared/analysis-flags.ts';
import { deriveIdempotencyKey } from '../_shared/idempotency-key.ts';
import { computeCacheKey, sha256Hex } from '../_shared/cache-fingerprint.ts';
import { createLogger } from '../_shared/logger.ts';
import { beginFeatureRun, type FeatureRunRuntime } from '../_shared/feature-run-runtime.ts';

// Phase 21 D-19: boot-time merit-flag attestation (SC-5 evidence source).
createLogger("submit-career-analysis-job").info("merit-flag", { enabled: MERIT_SYSTEM_ENABLED });

// ── 06-02 · FEAT-05 — idempotency inputIdentity derivation ────────────────────
// These constants + helper MUST stay byte-identical to analyze-career's
// buildCareerCacheKey `:legacy-main` derivation (analyze-career/index.ts:30,95,
// 130-161) so the ONE idempotency key spans submit -> worker -> analyze-career:
// submit derives the key here, the worker forwards it, and analyze-career's
// executor RE-DERIVES the identical key (its create_or_recover recovers the SAME
// run + its reserving_merits replays already_deducted -> exactly one run + one
// deduction). If analyze-career's cache-key inputs change, update both sites.
const CAREER_CACHE_MAX_CONTEXT_CHARS = 12000;
const CAREER_LIFECYCLE_VARIANT = 'career-overload-patch-2026-02-25:legacy-main';

function normalizeCareerCacheText(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, CAREER_CACHE_MAX_CONTEXT_CHARS)
    : '';
}

/**
 * Stable content-identity for the career idempotency key (Pitfall 8: NEVER a
 * save-mutated field — hashes only the submitted content/opt-ins). Mirrors
 * analyze-career's buildCareerCacheKey inputs exactly.
 */
async function buildCareerInputIdentity(params: {
  userId: string;
  tier: 'free' | 'pro' | 'elite';
  resumeText: unknown;
  linkedinText: unknown;
  linkedinUrl: unknown;
  allowResumeOnly: unknown;
}): Promise<string> {
  const resumeText = normalizeCareerCacheText(params.resumeText);
  const linkedinText = normalizeCareerCacheText(params.linkedinText);
  return await computeCacheKey({
    user_id: params.userId,
    feature: 'career_compass',
    tier: params.tier,
    variant: CAREER_LIFECYCLE_VARIANT,
    inputs: {
      resume_text_hash: await sha256Hex(resumeText),
      linkedin_text_hash: await sha256Hex(linkedinText),
      linkedinUrl: typeof params.linkedinUrl === 'string' ? params.linkedinUrl : '',
      allowResumeOnly: params.allowResumeOnly === true,
    },
  });
}

async function authenticateRequest(
  req: Request,
  supabase: ReturnType<typeof getServiceClient>,
  expectedUserId?: string,
): Promise<string> {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Missing or invalid authorization header");
  const token = authHeader.slice("Bearer ".length).trim();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid user token");
  if (expectedUserId && data.user.id !== expectedUserId) {
    throw new Error("Authenticated user does not match request userId");
  }
  return data.user.id;
}

serve((req) => withCors(req, 'user', async () => {
  if (req.method === "OPTIONS") return handleOptionsRequest({ type: 'user' });
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
    const retiredComparisonKeys = [['compare', 'Roles'].join(''), ['existing', 'Analysis'].join('')];
    if (retiredComparisonKeys.some((key) => key in body)) {
      return new Response(
        JSON.stringify({ error: 'Career role comparison has been retired', code: 'unsupported_input' }),
        { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
      );
    }
    const userId = typeof body.userId === "string" ? body.userId : "";
    const resumeFilePath = typeof body.resumeFilePath === "string" ? body.resumeFilePath : "";

    if (!userId || !resumeFilePath) {
      return new Response(JSON.stringify({ error: "userId and resumeFilePath are required" }), {
        status: 400,
        headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
      });
    }

    const authenticatedUserCtxCareer = await requireAuth(req, { type: 'user' });
    const authenticatedUserId = authenticatedUserCtxCareer.userId;
    // Verify the userId in the body matches the authenticated user
    if (userId && authenticatedUserId !== userId) {
      return new Response(
        JSON.stringify({ error: "Authenticated user does not match request userId" }),
        { status: 403, headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" } },
      );
    }
    // Rate limit: 5/15/30 per hour by tier (D-01). Shares 'analyze-career' counter key
    // to prevent double-counting when user switches between streaming and async paths.
    const rlCareer = await checkRateLimit(authenticatedUserId, authenticatedUserCtxCareer.tier, {
      key: 'analyze-career',
      limits: { free: 5, pro: 15, elite: 30 },
    });
    if (!rlCareer.allowed) {
      return createRateLimitResponse(rlCareer.retryAfterSeconds, 'user');
    }

    const correlation = await beginFeatureRun({
      userId: authenticatedUserId,
      feature: 'career_compass',
      requestId: costingRequestId,
      serverActionKey: typeof body.attemptNonce === 'string' && body.attemptNonce
        ? body.attemptNonce
        : `career-queue:${resumeFilePath}:${costingRequestId}`,
      runVariant: body.runVariant === 'rerun' ? 'rerun' : 'standard',
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

    // === Phase 13 branch (D-06) — submission-time deduction (D-07) ===
    // MIG-05: legacy path below is byte-identical until MERIT_SYSTEM_ENABLED flips to true.
    if (MERIT_SYSTEM_ENABLED && authenticatedUserCtxCareer) {
      // ── 06-02 · FEAT-05 — lifecycle ledger path (DORMANT behind
      //    ANALYSIS_LIFECYCLE_CAREER_COMPASS). When ON, ONE idempotency key + ONE
      //    run row span submit -> worker -> analyze-career; create_or_recover_analysis_run
      //    (advisory lock + partial-UNIQUE active index) REPLACES the racy WR-04
      //    SELECT-active-then-INSERT TOCTOU AND the raw analysis_jobs.insert, so N
      //    parallel submits collapse to exactly one run + one deduction (D-05/D-03).
      //    When OFF (100% of traffic today) this whole block is skipped and the
      //    byte-identical legacy WR-04 path below runs unchanged.
      if (isAnalysisFeatureEnabled('career_compass')) {
        // attemptNonce: CONSUME the client-supplied nonce (stable across a submit-
        // retry -> same key -> same run, one deduction — Pitfall 1 / FEAT-05). The
        // frontend (06-03) is the authoritative minter; fallback-mint ONLY when absent.
        const attemptNonce = typeof body.attemptNonce === 'string' && body.attemptNonce
          ? body.attemptNonce
          : crypto.randomUUID();

        // ⚠ 260713-hrd — THIS DERIVATION WAS RE-BASED. READ BEFORE FLIPPING THE FLAG. ⚠
        //
        // This key used to be derived at the HARDCODED tier 'free', and the reason was a
        // bug, not a design: the worker reached analyze-career under internal-secret auth,
        // which yielded a null userContext, which collapsed `resolvedTier` to 'free' for
        // EVERY user (RC-1). Deriving at 'free' here was how this branch stayed in sync
        // with that wrong value so the two keys would match.
        //
        // RC-1 is fixed — analyze-career now resolves the user's REAL tier from the DB on
        // the internal path. So deriving at 'free' here would now make submit's key DIVERGE
        // from analyze-career's re-derived key for every paid user, `already_deducted` would
        // not replay, and an Elite run would be charged TWICE.
        //
        // Both sides now derive at the user's real (normalized) tier. This branch is still
        // DORMANT (ANALYSIS_LIFECYCLE_CAREER_COMPASS is off), so this is a latent-landmine
        // removal, not a live change — but it must be correct before anyone flips the flag.
        const lifecycleTier = authenticatedUserCtxCareer.tier as 'free' | 'pro' | 'elite';
        const inputIdentity = await buildCareerInputIdentity({
          userId: authenticatedUserId,
          tier: lifecycleTier,
          resumeText: (typeof body.resumeTextContent === 'string' ? body.resumeTextContent : '') || resumeFilePath || '',
          linkedinText: typeof body.linkedinPdfContent === 'string' ? body.linkedinPdfContent : '',
          linkedinUrl: body.linkedinUrl,
          allowResumeOnly: body.allowResumeOnly,
        });
        const idempotencyKey = await deriveIdempotencyKey({
          userId: authenticatedUserId,
          feature: 'career_compass',
          tier: lifecycleTier,
          inputIdentity,
          ...(featureRuntime ? { featureRunId: featureRuntime.featureRunId } : {}),
          attemptNonce,
        });

        // Enriched payload the worker forwards VERBATIM to analyze-career; the four
        // lifecycle fields make the ONE key span the whole dance.
        const lifecyclePayload = {
          linkedinUrl: typeof body.linkedinUrl === "string" ? body.linkedinUrl : undefined,
          resumeFilePath,
          resumeTextContent: typeof body.resumeTextContent === "string" ? body.resumeTextContent : undefined,
          linkedinPdfContent: typeof body.linkedinPdfContent === "string" ? body.linkedinPdfContent : undefined,
          resumeOcrImages: Array.isArray(body.resumeOcrImages) ? body.resumeOcrImages.slice(0, 3) : undefined,
          // 260713-hrd: no client-supplied `tier` — analyze-career resolves it server-side (D-14).
          userId: authenticatedUserId,
          allowResumeOnly: body.allowResumeOnly === true ? true : undefined,
          // 06-02 lifecycle threading (ONE key spans submit -> worker -> analyze-career):
          idempotencyKey,
          attemptNonce,
          inputIdentity,
        };

        // create_or_recover_analysis_run: atomic single-active-per-key. Returns
        // { run_id, state, recovered } — run_id === analysis_jobs.id === jobId.
        const { data: createdRun, error: createErr } = await supabase.rpc('create_or_recover_analysis_run', {
          p_user_id: authenticatedUserId,
          p_feature: 'career_compass',
          p_tier: lifecycleTier,  // 260713-hrd: was hardcoded 'free' to mirror the RC-1 bug; now the real tier.
          p_idempotency_key: idempotencyKey,
          p_job_type: 'career_compass_analysis',
          // Omitted rather than explicit null: the RPC's single signature
          // declares `p_resume_id uuid DEFAULT NULL`, so this sends the same
          // NULL. Career Compass has no resume row to reference.
          p_resume_id: undefined,
          p_payload: lifecyclePayload,
        });
        if (createErr || !createdRun) {
          console.error('create_or_recover_analysis_run failed (career):', createErr);
          return new Response(JSON.stringify({ error: "Failed to enqueue career analysis job" }), {
            status: 500,
            headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
          });
        }
        const runId = (createdRun as { run_id: string }).run_id;

        // Keyed synchronous deduction: the SAME idempotencyKey ties submit's
        // reservation to the executor's later reserving_merits (already_deducted
        // replay -> exactly one deduction). N parallel submits recover the one run
        // above and replay the one deduction here.
        const gated = await withMerits(
          {
            userId: authenticatedUserId,
            tier: authenticatedUserCtxCareer.tier as 'free' | 'pro' | 'elite',
            corsType: 'user' as const,
            idempotencyKey,
          },
          'career_compass',
          async (txId) => {
            // Stamp merit_transaction_id + run_id onto the row (run_id === id) so the
            // OFF-worker refund contract and the frontend recovery both key off it.
            // On an already_deducted replay txId is the ORIGINAL transaction (safe).
            await supabase
              .from("analysis_jobs")
              .update({ merit_transaction_id: txId, payload: { ...lifecyclePayload, run_id: runId } })
              .eq("id", runId);
            await featureRuntime?.linkAnalysisJob(runId);
            await featureRuntime?.observeCharge(txId);

            // Trigger worker (fire and forget) — unchanged shape.
            const INTERNAL_JOB_SECRET = (Deno.env.get("INTERNAL_JOB_SECRET") || "").trim();
            if (INTERNAL_JOB_SECRET) {
              fetch(`${getSupabaseUrl()}/functions/v1/process-career-analysis-job`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: getServiceRoleKey(),
                  Authorization: `Bearer ${getServiceRoleKey()}`,
                  "x-internal-job-secret": INTERNAL_JOB_SECRET,
                },
                body: JSON.stringify({ batchSize: 2, source: "submit-career-analysis-job" }),
              }).catch((err) => console.error("Failed to trigger career worker after enqueue", { jobId: runId, err }));
            }

            return new Response(JSON.stringify({
              jobId: runId,
              status: 'pending',
              pollAfterMs: 2000,
            }), {
              status: 202,
              headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
            });
          },
        );
        if (!gated.ok) {
          await featureRuntime?.fail('MERIT_GATE_REJECTED', 'authorization');
          return gated.response;
        }
        return gated.value;
      }

      // WR-04: check for existing active job BEFORE withMerits to avoid charging
      // merits when reusing an already-queued job.
      const { data: existingJobMerit } = await supabase
        .from("analysis_jobs")
        .select("id, status, created_at")
        .eq("user_id", authenticatedUserId)
        .eq("job_type", "career_compass_analysis")
        .in("status", ["pending", "retrying", "processing"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingJobMerit?.id) {
        await featureRuntime?.linkAnalysisJob(existingJobMerit.id);
        return new Response(JSON.stringify({
          jobId: existingJobMerit.id,
          status: existingJobMerit.status,
          pollAfterMs: 2000,
          reused: true,
        }), {
          status: 202,
          headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
        });
      }

      // ── One run = one charge (260713-hrd, RC-4 · SERVER half) ────────────────────
      // This LIVE path used to call withMerits with NO idempotency key, so
      // `check_and_deduct_merits` received p_idempotency_key = NULL and could not dedupe.
      // Production bears this out: `merit_transactions.idempotency_key` is NULL on nearly
      // every career deduction, and on 2026-07-11 a single Elite user was charged 8 times
      // (-24 merits) for one usable result.
      //
      // The key is derived from (userId, feature, REAL tier, inputIdentity, attemptNonce).
      // `attemptNonce` is the "deliberate new run" signal: the browser mints ONE nonce and
      // HOLDS it across retries of the same submit (Task 4), so an accidental resubmit
      // re-keys to the SAME deduction (`already_deducted` replay), while a deliberate
      // re-run mints a fresh nonce and legitimately charges again.
      //
      // The randomUUID fallback exists only for non-browser callers; a browser that omits
      // the nonce would (correctly) be treated as a new deliberate run.
      const liveAttemptNonce = typeof body.attemptNonce === 'string' && body.attemptNonce
        ? body.attemptNonce
        : crypto.randomUUID();
      const liveTier = authenticatedUserCtxCareer.tier as 'free' | 'pro' | 'elite';
      const liveInputIdentity = await buildCareerInputIdentity({
        userId: authenticatedUserId,
        tier: liveTier,
        resumeText: (typeof body.resumeTextContent === 'string' ? body.resumeTextContent : '') || resumeFilePath || '',
        linkedinText: typeof body.linkedinPdfContent === 'string' ? body.linkedinPdfContent : '',
        linkedinUrl: body.linkedinUrl,
        allowResumeOnly: body.allowResumeOnly,
      });
      const liveIdempotencyKey = await deriveIdempotencyKey({
        userId: authenticatedUserId,
        feature: 'career_compass',
        tier: liveTier,
        inputIdentity: liveInputIdentity,
        attemptNonce: liveAttemptNonce,
      });

      const gated = await withMerits(
        {
          userId: authenticatedUserId,
          tier: liveTier,
          corsType: 'user' as const,
          idempotencyKey: liveIdempotencyKey,
        },
        'career_compass',
        async (txId) => {
          const innerPayload = {
            linkedinUrl: typeof body.linkedinUrl === "string" ? body.linkedinUrl : undefined,
            resumeFilePath,
            resumeTextContent: typeof body.resumeTextContent === "string" ? body.resumeTextContent : undefined,
            linkedinPdfContent: typeof body.linkedinPdfContent === "string" ? body.linkedinPdfContent : undefined,
            resumeOcrImages: Array.isArray(body.resumeOcrImages) ? body.resumeOcrImages.slice(0, 3) : undefined,
            // NOTE: no `tier` field. The tier is resolved SERVER-side by analyze-career from
            // the DB (D-14) — a client-supplied tier on this path is dead weight at best and
            // a privilege-escalation surface at worst.
            userId: authenticatedUserId,
            allowResumeOnly: body.allowResumeOnly === true ? true : undefined,
            // Carry the nonce so the whole run shares one identity.
            attemptNonce: liveAttemptNonce,
            ...(featureRuntime ? { featureRunId: featureRuntime.featureRunId } : {}),
          };

          const nowIso = new Date().toISOString();
          const { data: job, error: insertError } = await supabase
            .from("analysis_jobs")
            .insert({
              user_id: authenticatedUserId,
              job_type: "career_compass_analysis",
              status: "pending",
              payload: innerPayload,
              attempts: 0,
              // 8 -> 2 (260713-hrd). With 8 attempts a PERMANENT failure (an entitlement
              // denial, a deterministic truncation) was retried for minutes, long after the
              // frontend's 180s poll had already given up — so the user saw a timeout for a
              // run that later failed server-side. Permanent failures now terminate on the
              // first response (see process-career-analysis-job); 2 attempts is enough to
              // absorb a genuine transient blip.
              max_attempts: 2,
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
            fetch(`${getSupabaseUrl()}/functions/v1/process-career-analysis-job`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: getServiceRoleKey(),
                Authorization: `Bearer ${getServiceRoleKey()}`,
                "x-internal-job-secret": INTERNAL_JOB_SECRET,
              },
              body: JSON.stringify({ batchSize: 2, source: "submit-career-analysis-job" }),
            }).catch((err) => console.error("Failed to trigger career worker after enqueue", { jobId: job.id, err }));
          }

          return new Response(JSON.stringify({
            jobId: job.id,
            status: job.status,
            pollAfterMs: 2000,
            queuedAt: job.created_at,
          }), {
            status: 202,
            headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
          });
        },
      );
      if (!gated.ok) {
        await featureRuntime?.fail('MERIT_GATE_REJECTED', 'authorization');
        return gated.response;
      }
      return gated.value;
    }

    // === Legacy path (unchanged) ===
    const payload = {
      linkedinUrl: typeof body.linkedinUrl === "string" ? body.linkedinUrl : undefined,
      resumeFilePath,
      resumeTextContent: typeof body.resumeTextContent === "string" ? body.resumeTextContent : undefined,
      linkedinPdfContent: typeof body.linkedinPdfContent === "string" ? body.linkedinPdfContent : undefined,
      resumeOcrImages: Array.isArray(body.resumeOcrImages) ? body.resumeOcrImages.slice(0, 3) : undefined,
      // 260713-hrd: no client-supplied `tier` — analyze-career resolves it server-side (D-14).
      userId: authenticatedUserId,
      // 22-03 D-16: pass-through the resume-only fallback opt-in so
      // analyze-career can relax the LinkedIn validation gate.
      allowResumeOnly: body.allowResumeOnly === true ? true : undefined,
      ...(featureRuntime ? { featureRunId: featureRuntime.featureRunId } : {}),
    };

    const { data: existingJob } = await supabase
      .from("analysis_jobs")
      .select("id, status, created_at")
      .eq("user_id", authenticatedUserId)
      .eq("job_type", "career_compass_analysis")
      .in("status", ["pending", "retrying", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingJob?.id) {
      await featureRuntime?.linkAnalysisJob(existingJob.id);
      return new Response(JSON.stringify({
        jobId: existingJob.id,
        status: existingJob.status,
        pollAfterMs: 2000,
        reused: true,
      }), {
        status: 202,
        headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
      });
    }

    const nowIso = new Date().toISOString();
    const { data: job, error: insertError } = await supabase
      .from("analysis_jobs")
      .insert({
        user_id: authenticatedUserId,
        job_type: "career_compass_analysis",
        status: "pending",
        payload,
        attempts: 0,
        max_attempts: 2,  // 260713-hrd: match the live path (no 8x retry storm on a permanent failure)
        available_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("id, status, created_at")
      .single();

    if (insertError || !job) {
      await featureRuntime?.fail('QUEUE_INSERT_FAILED', 'persistence');
      console.error("Failed to enqueue career analysis job:", insertError);
      return new Response(JSON.stringify({ error: "Failed to enqueue career analysis job" }), {
        status: 500,
        headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
      });
    }
    await featureRuntime?.linkAnalysisJob(job.id);

    const INTERNAL_JOB_SECRET = (Deno.env.get("INTERNAL_JOB_SECRET") || "").trim();
    if (INTERNAL_JOB_SECRET) {
      fetch(`${getSupabaseUrl()}/functions/v1/process-career-analysis-job`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: getServiceRoleKey(),
          Authorization: `Bearer ${getServiceRoleKey()}`,
          "x-internal-job-secret": INTERNAL_JOB_SECRET,
        },
        body: JSON.stringify({ batchSize: 2, source: "submit-career-analysis-job" }),
      }).catch((err) => console.error("Failed to trigger career worker after enqueue", { jobId: job.id, err }));
    }

    return new Response(JSON.stringify({
      jobId: job.id,
      status: job.status,
      pollAfterMs: 2000,
      queuedAt: job.created_at,
    }), {
      status: 202,
      headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
    });
  } catch (error) {
    // requireAuth throws a Response (401) for auth failures — let it propagate to
    // withCors intact instead of collapsing it into a 500 (fleet-wide guard; CR-01).
    if (error instanceof Response) throw error;
    await featureRuntime?.fail('QUEUE_SUBMIT_FAILED', 'internal');
    console.error("Error in submit-career-analysis-job:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const isAuthError = message.includes("Invalid user token") || message.includes("authorization header");
    return new Response(JSON.stringify({ error: message }), {
      status: isAuthError ? 401 : 500,
      headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
    });
  }
}));

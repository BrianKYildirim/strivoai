import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-client.ts";
import { requireAuth } from "../_shared/auth.ts";
import { handleOptionsRequest } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { extractResume } from "./extract-resume.ts";
import { extractLinkedIn } from "./extract-linkedin.ts";
import { extractRecruitingLens } from "./extract-recruiting-lens.ts";

import type { AnalysisResultRow, ExtractFeature, Log, SupabaseClientLike } from "./types.ts";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isFeature(value: unknown): value is ExtractFeature {
  return value === "resume_analysis" || value === "linkedin_grading" || value === "recruiting_lens";
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response ||
    (typeof value === "object" && value !== null && "status" in value && "headers" in value);
}

async function alreadyExtracted(supabase: SupabaseClientLike, row: AnalysisResultRow): Promise<boolean> {
  if (row.analysis_type === "resume_analysis") {
    const { data } = await supabase
      .from("resume_versions")
      .select("id")
      .eq("user_id", row.user_id)
      .eq("source_analysis_results_id", row.id)
      .maybeSingle();
    return Boolean(data?.id);
  }

  if (row.analysis_type === "linkedin_grading") {
    const { data } = await supabase
      .from("linkedin_versions")
      .select("id")
      .eq("user_id", row.user_id)
      .eq("source_analysis_results_id", row.id)
      .maybeSingle();
    return Boolean(data?.id);
  }

  return false;
}

async function dispatchExtract(supabase: SupabaseClientLike, row: AnalysisResultRow, log: Log): Promise<Record<string, unknown>> {
  switch (row.analysis_type) {
    case "resume_analysis":
      return await extractResume(supabase, row, log);
    case "linkedin_grading":
      return await extractLinkedIn(supabase, row, log);
    case "recruiting_lens":
      return await extractRecruitingLens(supabase, row, log);
    default:
      return { ok: true, skipped: true, reason: "unsupported_feature" };
  }
}

async function runCatchup(supabase: SupabaseClientLike, log: Log): Promise<Record<string, unknown>> {
  // get_pending_extractions applies the 5-minute settle cutoff, excludes recruiting_lens,
  // and — critically — returns ONLY rows with no version row yet. The previous client-side
  // scan had no "not yet extracted" filter, so already-extracted rows permanently occupied
  // the 50-row window and anything past rank 50 was invisible to catchup forever.
  const { data, error } = await supabase.rpc("get_pending_extractions", { p_limit: 50 });

  if (error) {
    log.error("catchup-scan-failed", { error: error.message });
    return { scanned: 0, dispatched: 0, succeeded: 0, skipped: 0, failed: 1 };
  }

  const rows = (data ?? []) as AnalysisResultRow[];
  const summary = {
    scanned: rows.length,
    dispatched: 0,
    succeeded: 0,
    skipped: 0,
    failed: 0,
  };

  for (const row of rows) {
    try {
      if (row.analysis_type === "recruiting_lens") {
        summary.skipped += 1;
        log.info("catchup-skip", { analysis_results_id: row.id, reason: "recruiting_lens_plan_42_08" });
        continue;
      }

      if (await alreadyExtracted(supabase, row)) {
        summary.skipped += 1;
        continue;
      }

      summary.dispatched += 1;
      const result = await dispatchExtract(supabase, row, log);
      if (result.skipped) summary.skipped += 1;
      else summary.succeeded += 1;
    } catch (error) {
      summary.failed += 1;
      log.error("catchup-row-failed", {
        analysis_results_id: row.id,
        feature: row.analysis_type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  log.info("catchup-summary", summary);
  return summary;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleOptionsRequest({ type: "internal" });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const reqId = crypto.randomUUID();
  const log = createLogger("extract-analysis-structure", reqId);
  const timer = log.timer("extract-analysis-structure");

  try {
    await requireAuth(req, { type: "internal" });

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const invocationSource = typeof body.invocation_source === "string" ? body.invocation_source : "webhook";
    if (invocationSource === "pg_cron_catchup") {
      const summary = await runCatchup(getServiceClient(), log);
      return jsonResponse({ ok: true, source: invocationSource, ...summary });
    }

    const analysisResultsId = typeof body.analysis_results_id === "string" ? body.analysis_results_id : "";
    if (!analysisResultsId) {
      return jsonResponse({ error: "analysis_results_id is required" }, 400);
    }

    if (!isFeature(body.feature)) {
      return jsonResponse({ error: "Unsupported feature" }, 400);
    }

    const supabase = getServiceClient();
    const { data: analysisResult, error } = await supabase
      .from("analysis_results")
      .select("id, user_id, analysis_type, primary_score, raw_response, source_reference, created_at")
      .eq("id", analysisResultsId)
      .maybeSingle();

    if (error) {
      log.error("analysis-result-load-failed", { analysis_results_id: analysisResultsId, error: error.message });
      return jsonResponse({ error: "Failed to load analysis result" }, 500);
    }

    if (!analysisResult) {
      log.warn("analysis-result-not-found", { analysis_results_id: analysisResultsId });
      return jsonResponse({ error: "Analysis result not found" }, 404);
    }

    let result: Record<string, unknown>;
    switch (body.feature) {
      case "resume_analysis":
        result = await extractResume(supabase, analysisResult, log);
        break;
      case "linkedin_grading":
        result = await extractLinkedIn(supabase, analysisResult, log);
        break;
      case "recruiting_lens":
        result = await extractRecruitingLens(supabase, analysisResult, log);
        break;
      default:
        return jsonResponse({ error: "Unsupported feature" }, 400);
    }

    log.info("worker-complete", {
      analysis_results_id: analysisResultsId,
      feature: body.feature,
      ...result,
      durationMs: timer(),
    });

    return jsonResponse({ ok: true, feature: body.feature, ...result });
  } catch (error) {
    if (isResponse(error)) return error;
    log.error("worker-fatal", {
      error: error instanceof Error ? error.message : String(error),
      durationMs: timer(),
    });
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

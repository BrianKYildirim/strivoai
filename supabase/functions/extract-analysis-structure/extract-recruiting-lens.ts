/**
 * extract-recruiting-lens.ts — L4 job_descriptions writer + applications.jd_id backfiller.
 *
 * Replaces the Plan 42-04 STUB with full implementation.
 *
 * Flow:
 *   1. Defensive parse of analysis_result.raw_response (optional chaining everywhere)
 *   2. Idempotency check: skip if job_descriptions row already exists for this analysis
 *   3. INSERT job_descriptions RETURNING id
 *   4. Backfill applications.jd_id WHERE user_id AND application_source='recruiting_lens' AND jd_id IS NULL
 *      — bounded by 5-minute window from analysis time to avoid cross-row contamination
 *   5. Fallback: if 0 rows updated AND no prior application row present, INSERT a placeholder application
 *      (safety net for missed recruiting-lens synchronous insert per RESEARCH §Landmines #7)
 *
 * All DB steps wrapped in individual try/catch — worker failure is non-fatal (per SPEC).
 */

import type { AnalysisResultRow, Log, SupabaseClientLike } from "./types.ts";

type AnalysisResult = AnalysisResultRow;

// ── Defensive helpers ──────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  return asArray(value)
    .map((v) => asString(v))
    .filter((v): v is string => v !== null);
}

/**
 * Extract skills/requirements from common raw_response field shapes.
 * Handles both string arrays and object arrays ({ skill, name, text, ... }).
 */
function extractStringList(
  raw: Record<string, unknown>,
  fields: string[],
  log: Log,
  fieldLabel: string,
): string[] {
  for (const field of fields) {
    const value = raw[field];
    if (!value) continue;
    if (Array.isArray(value)) {
      const result = asStringArray(
        value.map((v) => {
          if (typeof v === "string") return v;
          const r = asRecord(v);
          return (
            asString(r.skill) ??
            asString(r.name) ??
            asString(r.text) ??
            asString(r.title) ??
            asString(r.requirement) ??
            null
          );
        }),
      );
      if (result.length > 0) return result;
    }
  }
  log.warn("extract_warning", { field: fieldLabel, reason: "missing_or_empty" });
  return [];
}

// ── Main extractor ─────────────────────────────────────────────────────────────

export async function extractRecruitingLens(
  supabase: SupabaseClientLike,
  analysisResult: AnalysisResult,
  log: Log,
): Promise<Record<string, unknown>> {
  const userId = analysisResult.user_id;
  const analysisId = analysisResult.id;

  // Determine analysis timestamp (used for 5-minute backfill window)
  const analyzeTime = analysisResult.created_at
    ? new Date(analysisResult.created_at)
    : new Date();
  // Window start: 5 minutes before analyze time
  const windowStart = new Date(analyzeTime.getTime() - 5 * 60 * 1000).toISOString();

  // ── Step 1: Idempotency check ──────────────────────────────────────────────
  try {
    const existingCheck = await supabase
      .from("job_descriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("source_analysis_results_id", analysisId)
      .maybeSingle();

    if (existingCheck.data?.id) {
      log.info("skip-already-extracted-recruiting-lens", {
        analysis_results_id: analysisId,
        jd_id: existingCheck.data.id,
      });
      return { ok: true, skipped: true, jd_id: existingCheck.data.id };
    }
  } catch (e) {
    log.warn("extract_warning", {
      step: "idempotency_check",
      error: e instanceof Error ? e.message : String(e),
    });
    // Non-fatal: proceed to attempt insert (will naturally fail on unique constraint if already exists)
  }

  // ── Step 2: Defensive parse of raw_response ────────────────────────────────
  const raw = asRecord(analysisResult.raw_response);

  // Extract key fields from recruiting-lens merged output shape.
  // Fields come from mergeRecruitingLensResults output (rl-call-1/2/3 merged).
  // Common raw shapes: raw.criteria[], raw.requirements[], raw.topGaps[], raw.keywords, etc.

  const keyRequirements = extractStringList(
    raw,
    ["criteria", "requirements", "keyRequirements", "key_requirements", "coreCriteria"],
    log,
    "key_requirements",
  );

  const requiredSkills = extractStringList(
    raw,
    ["requiredSkills", "required_skills", "skills", "keywords"],
    log,
    "required_skills",
  );

  const preferredSkills = extractStringList(
    raw,
    ["preferredSkills", "preferred_skills", "niceToHaveSkills"],
    log,
    "preferred_skills",
  );

  // Missing skills vs user: from topGaps or missingSkills
  const gapsArray = asArray(raw.topGaps ?? raw.missingSkills ?? raw.gaps ?? []);
  const missingSkillsVsUser = asStringArray(
    gapsArray.map((v) => {
      if (typeof v === "string") return v;
      const r = asRecord(v);
      return asString(r.title) ?? asString(r.skill) ?? asString(r.gap) ?? asString(r.name) ?? null;
    }),
  );

  if (missingSkillsVsUser.length === 0) {
    log.warn("extract_warning", { field: "missing_skills_vs_user", reason: "missing_or_empty" });
  }

  const matchScore =
    asNumber(asRecord(raw.overallMatch).score) ??
    asNumber(raw.primaryScore) ??
    asNumber(analysisResult.primary_score);

  if (matchScore === null) {
    log.warn("extract_warning", { field: "match_score", reason: "missing" });
  }

  // jd_url from raw metadata.source_url / source_reference
  const jdUrl =
    asString(asRecord(raw.metadata).jobUrl) ??
    asString(asRecord(raw.metadata).sourceUrl) ??
    asString(raw.sourceUrl) ??
    asString(raw.jd_url) ??
    null;

  // company + role for fallback application insert
  const company =
    asString(asRecord(raw.metadata).company) ??
    asString(raw.company) ??
    "Unknown";
  const roleTitle =
    asString(asRecord(raw.metadata).roleTitle) ??
    asString(raw.roleTitle) ??
    asString(raw.role_title) ??
    "Unknown";

  // ── Step 3: INSERT job_descriptions ───────────────────────────────────────
  let jdId: string | null = null;

  try {
    const jdInsert = await supabase
      .from("job_descriptions")
      .insert({
        user_id: userId,
        source_analysis_results_id: analysisId,
        key_requirements: keyRequirements,
        required_skills: requiredSkills,
        preferred_skills: preferredSkills,
        missing_skills_vs_user: missingSkillsVsUser,
        match_score: matchScore,
        jd_url: jdUrl,
      })
      .select("id")
      .single();

    if (jdInsert.error || !jdInsert.data?.id) {
      log.error("jd-insert-failed", {
        error: jdInsert.error?.message ?? "missing id",
        analysis_results_id: analysisId,
      });
    } else {
      jdId = jdInsert.data.id as string;
      log.info("jd-inserted", { jd_id: jdId, analysis_results_id: analysisId });
    }
  } catch (e) {
    log.error("jd-insert-exception", {
      error: e instanceof Error ? e.message : String(e),
      analysis_results_id: analysisId,
    });
  }

  // If jd insert failed, skip backfill (can't backfill without jd_id)
  if (!jdId) {
    return { ok: true, skipped: false, jd_id: null, error: "jd_insert_failed" };
  }

  // ── Step 4: Backfill applications.jd_id ───────────────────────────────────
  let updatedCount = 0;

  try {
    // UPDATE applications WHERE user_id=$u AND application_source='recruiting_lens'
    // AND jd_id IS NULL AND created_at >= (analyze_time - 5 min)
    // Supabase JS doesn't support "IS NULL" filter directly but `.is('jd_id', null)` works.
    const backfillResult = await supabase
      .from("applications")
      .update({ jd_id: jdId, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("application_source", "recruiting_lens")
      .is("jd_id", null)
      .gte("created_at", windowStart);

    if (backfillResult.error) {
      log.warn("jd-backfill-update-failed", {
        error: backfillResult.error.message,
        jd_id: jdId,
      });
    } else {
      updatedCount = backfillResult.count ?? 0;
      log.info("jd-backfill-updated", { rows_updated: updatedCount, jd_id: jdId });
    }
  } catch (e) {
    log.warn("jd-backfill-exception", {
      error: e instanceof Error ? e.message : String(e),
      jd_id: jdId,
    });
  }

  // ── Step 5: Fallback insert if 0 rows updated ─────────────────────────────
  // Safety net for missed recruiting-lens synchronous insert (RESEARCH §Landmines #7)
  if (updatedCount === 0) {
    try {
      // Check if ANY application row exists for this user + recruiting_lens source in window
      const existingApp = await supabase
        .from("applications")
        .select("id")
        .eq("user_id", userId)
        .eq("application_source", "recruiting_lens")
        .gte("created_at", windowStart)
        .maybeSingle();

      if (!existingApp.data?.id) {
        // No application row at all — insert a placeholder
        const fallbackInsert = await supabase
          .from("applications")
          .insert({
            user_id: userId,
            company_applied: company,
            role_applied: roleTitle,
            status: "saved",
            application_source: "recruiting_lens",
            jd_id: jdId,
          })
          .select("id")
          .single();

        if (fallbackInsert.error) {
          log.warn("applications-fallback-insert-failed", {
            error: fallbackInsert.error.message,
            jd_id: jdId,
          });
        } else {
          log.info("applications-fallback-inserted", {
            application_id: fallbackInsert.data?.id,
            jd_id: jdId,
          });
        }
      }
    } catch (e) {
      log.warn("applications-fallback-exception", {
        error: e instanceof Error ? e.message : String(e),
        jd_id: jdId,
      });
    }
  }

  return {
    ok: true,
    skipped: false,
    jd_id: jdId,
    rows_backfilled: updatedCount,
  };
}

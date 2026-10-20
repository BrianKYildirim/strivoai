import { normalizeJson, type AnalysisResultRow, type Log, type SupabaseClientLike } from "./types.ts";

type AnalysisResult = AnalysisResultRow;

type RecommendationRow = {
  user_id: string;
  feature: string;
  suggestion_type: string;
  target_ref_type: string;
  target_ref_id: string;
  suggestion_text: string;
  source_version_id: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractProfileIdentifier(raw: Record<string, unknown>, fallback: string | null): string {
  return (
    asString(raw.profile_identifier) ??
    asString(raw.profileIdentifier) ??
    asString(raw.metadata && asRecord(raw.metadata).profileIdentifier) ??
    fallback ??
    "unknown-profile"
  );
}

function extractProfileUrl(raw: Record<string, unknown>, fallback: string): string {
  return (
    asString(raw.profile_url) ??
    asString(raw.profileUrl) ??
    asString(raw.metadata && asRecord(raw.metadata).profileUrl) ??
    fallback
  );
}

async function findLinkedInGradeId(
  supabase: SupabaseClientLike,
  userId: string,
  profileIdentifier: string,
  raw: Record<string, unknown>,
): Promise<string | null> {
  const metadata = asRecord(raw.metadata);
  const explicitId = asString(raw.linkedin_grade_id ?? raw.linkedinGradeId ?? metadata.linkedin_grade_id ?? metadata.linkedinGradeId);
  if (explicitId) return explicitId;

  const grade = await supabase
    .from("linkedin_grades")
    .select("id")
    .eq("user_id", userId)
    .eq("profile_identifier", profileIdentifier)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // grade.data is an untyped PostgREST row, so .id is `unknown` — narrow it honestly
  // rather than asserting. A real linkedin_grades.id is a uuid string, so this is
  // behaviour-preserving for every row the query can actually return.
  return asString(grade.data?.id);
}

async function insertScore(
  supabase: SupabaseClientLike,
  versionId: string,
  raw: Record<string, unknown>,
): Promise<void> {
  await supabase
    .from("scores")
    .insert({
      version_id: versionId,
      version_type: "linkedin",
      overall_score: asNumber(raw.rawScore ?? raw.overall_score ?? raw.overallScore),
      ats_score: null,
      recruiter_skim_score: asNumber(raw.recruiterSkimScore ?? raw.recruiter_skim_score),
      formatting_score: asNumber(raw.formattingScore ?? raw.formatting_score),
      quantified_impact_score: asNumber(raw.quantifiedImpactScore ?? raw.quantified_impact_score),
      keyword_match_score: asNumber(raw.keywordMatchScore ?? raw.keyword_match_score),
      role_relevance_score: asNumber(raw.roleRelevanceScore ?? raw.role_relevance_score),
    });
}

export async function extractLinkedIn(
  supabase: SupabaseClientLike,
  analysisResult: AnalysisResult,
  log: Log,
): Promise<Record<string, unknown>> {
  const existing = await supabase
    .from("linkedin_versions")
    .select("id")
    .eq("user_id", analysisResult.user_id)
    .eq("source_analysis_results_id", analysisResult.id)
    .maybeSingle();

  if (existing.data?.id) {
    log.info("skip-already-extracted", { analysis_results_id: analysisResult.id, versionId: existing.data.id });
    return { ok: true, skipped: true, versionId: existing.data.id };
  }

  const raw = asRecord(analysisResult.raw_response);
  const profileIdentifier = extractProfileIdentifier(raw, analysisResult.source_reference);
  const profileUrl = extractProfileUrl(raw, profileIdentifier);
  const linkedinGradeId = await findLinkedInGradeId(supabase, analysisResult.user_id, profileIdentifier, raw);

  if (!linkedinGradeId) {
    log.warn("extract_warning", { field: "linkedin_grade_id", reason: "not_found", profileIdentifier });
  }

  const prior = await supabase
    .from("linkedin_versions")
    .select("id")
    .eq("user_id", analysisResult.user_id)
    .eq("profile_identifier", profileIdentifier)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const versionInsert = await supabase
    .from("linkedin_versions")
    .insert({
      user_id: analysisResult.user_id,
      profile_url: profileUrl,
      profile_identifier: profileIdentifier,
      source_analysis_results_id: analysisResult.id,
      parsed_summary: normalizeJson({
        scoreJustification: raw.scoreJustification ?? raw.summary ?? null,
        topFixes: raw.topFixes ?? null,
        sectionBreakdown: raw.sectionBreakdown ?? null,
        metadata: raw.metadata ?? null,
      }),
      overall_score: asNumber(raw.rawScore ?? raw.overall_score ?? raw.overallScore ?? analysisResult.primary_score),
      supersedes_id: prior.data?.id ?? null,
      linkedin_grade_id: linkedinGradeId,
    })
    .select("id")
    .single();

  if (versionInsert.error || !versionInsert.data?.id) {
    throw new Error(`linkedin_versions insert failed: ${versionInsert.error?.message ?? "missing id"}`);
  }

  const versionId = versionInsert.data.id as string;

  try {
    await insertScore(supabase, versionId, raw);
  } catch (error) {
    log.error("score-insert-failed", { error: error instanceof Error ? error.message : String(error), versionId });
  }

  // Write recommendations rows — one per top-fix suggestion from the grading output.
  // Failures are logged but never abort the worker.
  const topFixes: string[] = Array.isArray(raw.topFixes) ? raw.topFixes.filter((f): f is string => typeof f === "string") : [];
  let recommendationCount = 0;

  if (topFixes.length > 0) {
    const recommendationRows: RecommendationRow[] = topFixes.map((fix) => ({
      user_id: analysisResult.user_id,
      feature: "linkedin_grading",
      suggestion_type: "top_fix",
      target_ref_type: "version",
      target_ref_id: versionId,
      suggestion_text: fix,
      source_version_id: versionId,
    }));

    try {
      for (const rec of recommendationRows) {
        const recInsert = await supabase
          .from("recommendations")
          .insert(rec);
        if (recInsert.error) {
          log.error("recommendation-insert-failed", { error: recInsert.error.message });
          continue;
        }
        recommendationCount += 1;
      }
    } catch (error) {
      log.error("recommendations-batch-failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { ok: true, skipped: false, versionId, linkedinGradeId, recommendationCount };
}

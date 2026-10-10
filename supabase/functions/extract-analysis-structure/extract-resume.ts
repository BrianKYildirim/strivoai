import { normalizeJson, type AnalysisResultRow, type Log, type SupabaseClientLike } from "./types.ts";

type AnalysisResult = AnalysisResultRow;

type ParsedSection = {
  type: "education" | "experience" | "projects" | "leadership" | "skills";
  score: number | null;
  data: Record<string, unknown>;
  bullets: ParsedBullet[];
};

type ParsedBullet = {
  originalText: string;
  score: number | null;
  weaknessCategory: string | null;
  actionVerbQuality: string | null;
  quantifiedImpact: boolean | null;
  suggestedImprovement: string | null;
};

type RecommendationRow = {
  user_id: string;
  feature: string;
  suggestion_type: string;
  target_ref_type: string | null;
  target_ref_id: string | null;
  suggestion_text: string;
  source_version_id: string | null;
};

const SECTION_TYPES = ["education", "experience", "projects", "leadership", "skills"] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseBullet(value: unknown): ParsedBullet | null {
  if (typeof value === "string") {
    return {
      originalText: value,
      score: null,
      weaknessCategory: null,
      actionVerbQuality: null,
      quantifiedImpact: null,
      suggestedImprovement: null,
    };
  }

  const record = asRecord(value);
  const originalText =
    asString(record.originalText) ??
    asString(record.original_text) ??
    asString(record.text) ??
    asString(record.bullet);

  if (!originalText) return null;

  return {
    originalText,
    score: asNumber(record.bulletScore ?? record.score),
    weaknessCategory: asString(record.weaknessCategory ?? record.category),
    actionVerbQuality: asString(record.actionVerbQuality),
    quantifiedImpact: typeof record.quantifiedImpact === "boolean" ? record.quantifiedImpact : null,
    suggestedImprovement: asString(record.suggestedImprovement ?? record.improvedText ?? record.suggestion),
  };
}

function parseSections(raw: Record<string, unknown>, log: Log): ParsedSection[] {
  const sectionsValue = raw.sections ?? raw.resumeSections ?? raw.sectionBreakdown;
  const sections: ParsedSection[] = [];

  if (Array.isArray(sectionsValue)) {
    for (const [index, value] of sectionsValue.entries()) {
      const record = asRecord(value);
      const rawType = asString(record.section_type ?? record.sectionType ?? record.type ?? record.name)?.toLowerCase();
      const type = SECTION_TYPES.find(sectionType => rawType?.includes(sectionType)) ?? SECTION_TYPES[index % SECTION_TYPES.length];
      const bulletValues = Array.isArray(record.bullets) ? record.bullets : Array.isArray(record.items) ? record.items : [];
      sections.push({
        type,
        score: asNumber(record.section_score ?? record.sectionScore ?? record.score),
        data: record,
        bullets: bulletValues.map(parseBullet).filter((bullet): bullet is ParsedBullet => Boolean(bullet)),
      });
    }
  } else {
    const recordSections = asRecord(sectionsValue);
    for (const type of SECTION_TYPES) {
      const value = recordSections[type];
      if (!value) continue;
      const record = asRecord(value);
      const bulletValues = Array.isArray(record.bullets) ? record.bullets : Array.isArray(value) ? value : [];
      sections.push({
        type,
        score: asNumber(record.section_score ?? record.sectionScore ?? record.score),
        data: record,
        bullets: bulletValues.map(parseBullet).filter((bullet): bullet is ParsedBullet => Boolean(bullet)),
      });
    }
  }

  if (sections.length === 0) {
    log.warn("extract_warning", { field: "sections", reason: "missing" });
    const suggestions = Array.isArray(raw.suggestions) ? raw.suggestions : Array.isArray(raw.improvements) ? raw.improvements : [];
    const bullets = suggestions.map(parseBullet).filter((bullet): bullet is ParsedBullet => Boolean(bullet));
    return [{
      type: "experience",
      score: asNumber(raw.overallScore ?? raw.overall_score),
      data: { fallback: true },
      bullets,
    }];
  }

  return sections;
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
      version_type: "resume",
      overall_score: asNumber(raw.overallScore ?? raw.overall_score),
      ats_score: asNumber(raw.atsScore ?? raw.ats_score),
      recruiter_skim_score: asNumber(raw.recruiterSkimScore ?? raw.recruiter_skim_score),
      formatting_score: asNumber(raw.formattingScore ?? raw.formatting_score),
      quantified_impact_score: asNumber(raw.quantifiedImpactScore ?? raw.quantified_impact_score),
      keyword_match_score: asNumber(raw.keywordMatchScore ?? raw.keyword_match_score),
      role_relevance_score: asNumber(raw.roleRelevanceScore ?? raw.role_relevance_score),
    });
}

export async function extractResume(
  supabase: SupabaseClientLike,
  analysisResult: AnalysisResult,
  log: Log,
): Promise<Record<string, unknown>> {
  const resumeId = analysisResult.source_reference;
  if (!resumeId) {
    log.warn("extract_warning", { field: "source_reference", reason: "missing_resume_id" });
    return { ok: true, skipped: true, reason: "missing_resume_id" };
  }

  // The resume may have been deleted after the analysis was recorded. analysis_results
  // .source_reference is untyped text with no FK, so the row survives; inserting a
  // resume_versions row for it would violate resume_versions_resume_id_fkey. Skip rather
  // than throw — the row is permanently unextractable and must not be retried forever.
  const resumeExists = await supabase
    .from("resumes")
    .select("id")
    .eq("id", resumeId)
    .maybeSingle();

  if (!resumeExists.data?.id) {
    log.warn("extract_warning", { field: "source_reference", reason: "resume_deleted", resumeId });
    return { ok: true, skipped: true, reason: "resume_deleted" };
  }

  const existing = await supabase
    .from("resume_versions")
    .select("id")
    .eq("user_id", analysisResult.user_id)
    .eq("source_analysis_results_id", analysisResult.id)
    .maybeSingle();

  if (existing.data?.id) {
    log.info("skip-already-extracted", { analysis_results_id: analysisResult.id, versionId: existing.data.id });
    return { ok: true, skipped: true, versionId: existing.data.id };
  }

  const raw = asRecord(analysisResult.raw_response);
  const prior = await supabase
    .from("resume_versions")
    .select("id")
    .eq("user_id", analysisResult.user_id)
    .eq("resume_id", resumeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const versionInsert = await supabase
    .from("resume_versions")
    .insert({
      user_id: analysisResult.user_id,
      resume_id: resumeId,
      source_analysis_results_id: analysisResult.id,
      parsed_summary: normalizeJson({
        executiveSummary: raw.executiveSummary ?? raw.summary ?? null,
        metadata: raw.metadata ?? null,
      }),
      overall_score: asNumber(raw.overallScore ?? raw.overall_score ?? analysisResult.primary_score),
      supersedes_id: prior.data?.id ?? null,
    })
    .select("id")
    .single();

  if (versionInsert.error || !versionInsert.data?.id) {
    throw new Error(`resume_versions insert failed: ${versionInsert.error?.message ?? "missing id"}`);
  }

  const versionId = versionInsert.data.id as string;
  const parsedSections = parseSections(raw, log);
  let sectionCount = 0;
  let bulletCount = 0;

  // Accumulate recommendation rows as we fan out bullets, so we can batch-insert them at the end.
  const recommendationRows: RecommendationRow[] = [];

  for (const [sectionIndex, section] of parsedSections.entries()) {
    try {
      const sectionInsert = await supabase
        .from("resume_sections")
        .insert({
          resume_version_id: versionId,
          section_type: section.type,
          section_score: section.score,
          section_data: normalizeJson(section.data),
          position: sectionIndex,
        })
        .select("id")
        .single();

      if (sectionInsert.error || !sectionInsert.data?.id) {
        log.error("section-insert-failed", { error: sectionInsert.error?.message ?? "missing id", sectionType: section.type });
        continue;
      }

      sectionCount += 1;
      const sectionId = sectionInsert.data.id as string;

      for (const [bulletIndex, bullet] of section.bullets.entries()) {
        const bulletInsert = await supabase
          .from("resume_bullets")
          .insert({
            section_id: sectionId,
            original_text: bullet.originalText,
            bullet_score: bullet.score,
            weakness_category: bullet.weaknessCategory,
            action_verb_quality: bullet.actionVerbQuality,
            quantified_impact: bullet.quantifiedImpact,
            suggested_improvement: bullet.suggestedImprovement,
            position: bulletIndex,
          })
          .select("id")
          .single();

        if (bulletInsert.error) {
          log.error("bullet-insert-failed", { error: bulletInsert.error.message, sectionType: section.type });
          continue;
        }
        bulletCount += 1;

        // Collect a recommendation row for every bullet that has a suggested improvement.
        const bulletId = bulletInsert.data?.id as string | undefined;
        if (bulletId && bullet.suggestedImprovement) {
          recommendationRows.push({
            user_id: analysisResult.user_id,
            feature: "resume_analysis",
            suggestion_type: bullet.weaknessCategory ?? "improvement",
            target_ref_type: "bullet",
            target_ref_id: bulletId,
            suggestion_text: bullet.suggestedImprovement,
            source_version_id: versionId,
          });
        }
      }
    } catch (error) {
      log.error("section-extract-failed", { error: error instanceof Error ? error.message : String(error), sectionType: section.type });
    }
  }

  // Batch-insert all accumulated recommendation rows. Failures are logged but
  // never abort the worker — recommendations are non-fatal telemetry.
  let recommendationCount = 0;
  if (recommendationRows.length > 0) {
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

  try {
    await insertScore(supabase, versionId, raw);
  } catch (error) {
    log.error("score-insert-failed", { error: error instanceof Error ? error.message : String(error), versionId });
  }

  return { ok: true, skipped: false, versionId, sectionCount, bulletCount, recommendationCount };
}

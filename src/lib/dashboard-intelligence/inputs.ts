import type {
  CareerCompassSignal,
  LinkedInSignal,
  RecruitingLensSignal,
  ResumeSignal,
  SavedJobSignal,
  StoredDashboardInputs,
} from './types';

type RowRecord = Record<string, unknown>;

export type DashboardResumeRow = {
  id?: string;
  file_name?: string;
  created_at?: string | null;
  analyzed_at?: string | null;
  overall_score?: number | null;
  grading_data?: RowRecord | null;
};

export type DashboardLinkedInGradeRow = {
  id?: string;
  overall_score?: number | null;
  grading_data?: RowRecord | null;
  created_at?: string | null;
  profile_url?: string | null;
};

export type DashboardSavedJobRow = {
  id?: string;
  role_applied?: string | null;
  company_applied?: string | null;
  created_at?: string | null;
  industry?: string | null;
};

export type AnalysisHistoryRow = {
  id?: string;
  analysis_type?: string | null;
  created_at?: string | null;
  primary_score?: number | null;
  raw_response?: unknown;
  result?: unknown;
};

export type NormalizeDashboardIntelligenceParams = {
  resume?: DashboardResumeRow | null;
  linkedinGrade?: DashboardLinkedInGradeRow | null;
  savedJobs?: DashboardSavedJobRow[] | null;
  analysisHistory?: AnalysisHistoryRow[] | null;
  careerCompassRaw?: unknown;
  recruitingLensRaw?: unknown;
};

export function clampDashboardScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function toRecord(value: unknown): RowRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as RowRecord;
}

function toRecordArray(value: unknown): RowRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map(toRecord).filter((item): item is RowRecord => Boolean(item));
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

export function pickStringArray(source: RowRecord | null | undefined, keys: string[]): string[] {
  if (!source) return [];
  for (const key of keys) {
    const direct = asStringArray(source[key]);
    if (direct.length > 0) return direct;
  }
  return [];
}

function firstString(source: RowRecord | null | undefined, keys: string[]): string | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function normalizeResume(row?: DashboardResumeRow | null): ResumeSignal | undefined {
  if (!row) return undefined;
  const data = toRecord(row.grading_data);
  const elite = toRecord(data?.eliteInsights);
  const recruiterFirstImpressions = toRecord(elite?.recruiterFirstImpressions);
  return {
    score: clampDashboardScore(row.overall_score ?? data?.overallScore),
    strengths: [
      ...pickStringArray(data, ['strengths', 'keyStrengths', 'whatYouHave']),
      ...pickStringArray(toRecord(data?.executiveSummary), ['keyStrengths']),
    ],
    concerns: [
      ...pickStringArray(data, ['priorityImprovements', 'improvements', 'suggestions']),
      ...pickStringArray(toRecord(data?.executiveSummary), ['keyGaps']),
    ],
    roles: pickStringArray(data, ['suggestedTargetRoles', 'targetRoles', 'recommendedRoles']),
    keywords: pickStringArray(data, ['recommendedKeywords', 'keywords']),
    recruiterFirstImpressions: recruiterFirstImpressions
      ? {
          atThreeSeconds: firstString(recruiterFirstImpressions, ['atThreeSeconds']),
          atSevenSeconds: firstString(recruiterFirstImpressions, ['atSevenSeconds']),
          whatTheyMiss: firstString(recruiterFirstImpressions, ['whatTheyMiss']),
        }
      : undefined,
    date: row.analyzed_at ?? row.created_at ?? null,
  };
}

function normalizeLinkedIn(row?: DashboardLinkedInGradeRow | null): LinkedInSignal | undefined {
  if (!row) return undefined;
  const data = toRecord(row.grading_data);
  const sections = toRecordArray(data?.sectionBreakdown);
  const sectionStrengths = sections.flatMap((section) => asStringArray(section.strengths));
  const sectionWeaknesses = sections.flatMap((section) => asStringArray(section.weaknesses));
  const topFixes = toRecordArray(data?.topFixes).map((fix) => firstString(fix, ['title', 'suggestedFix'])).filter((item): item is string => Boolean(item));
  return {
    score: clampDashboardScore(row.overall_score ?? data?.rawScore),
    strengths: [...pickStringArray(data, ['keyStrengths', 'strengths']), ...sectionStrengths],
    concerns: [...pickStringArray(data, ['weaknesses']), ...sectionWeaknesses, ...topFixes],
    improvements: [...pickStringArray(data, ['improvements']), ...topFixes],
    sectionNames: sections.map((section) => firstString(section, ['name'])).filter((item): item is string => Boolean(item)),
    date: row.created_at ?? null,
  };
}

function normalizeCareerCompass(raw: unknown, row?: AnalysisHistoryRow): CareerCompassSignal | undefined {
  const data = toRecord(raw) ?? toRecord(row?.raw_response) ?? toRecord(row?.result);
  if (!data && !row) return undefined;
  const breakdown = toRecord(data?.roleReadinessBreakdown);
  return {
    score: clampDashboardScore(data?.roleReadinessScore ?? breakdown?.overallScore ?? row?.primary_score),
    strengths: [
      ...pickStringArray(data, ['whatYouHave']),
      ...pickStringArray(breakdown, ['strengths']),
    ],
    gaps: [
      ...pickStringArray(breakdown, ['gaps']),
      ...toRecordArray(data?.skillGaps).map((gap) => firstString(gap, ['skill', 'action'])).filter((item): item is string => Boolean(item)),
    ],
    targetRoles: [
      firstString(data, ['targetRole']),
      ...toRecordArray(data?.careerFields).map((field) => firstString(field, ['title'])),
      ...toRecordArray(data?.roles).map((role) => firstString(role, ['title'])),
    ].filter((item): item is string => Boolean(item)),
    date: row?.created_at ?? null,
  };
}

function normalizeRecruitingLens(raw: unknown, row?: AnalysisHistoryRow): RecruitingLensSignal | undefined {
  const data = toRecord(raw) ?? toRecord(row?.raw_response) ?? toRecord(row?.result);
  if (!data && !row) return undefined;
  const overallMatch = toRecord(data?.overallMatch);
  const keywords = toRecord(data?.keywords);
  const rationale = toRecordArray(data?.scoreRationale);
  return {
    score: clampDashboardScore(overallMatch?.score ?? row?.primary_score),
    strengths: rationale.flatMap((item) => pickStringArray(item, ['strengths'])),
    concerns: [
      ...rationale.flatMap((item) => pickStringArray(item, ['weaknesses'])),
      ...toRecordArray(data?.topGaps).map((gap) => firstString(gap, ['title', 'whyItMatters'])).filter((item): item is string => Boolean(item)),
    ],
    matchedKeywords: pickStringArray(keywords, ['matched']),
    missingKeywords: pickStringArray(keywords, ['missing']),
    date: row?.created_at ?? null,
  };
}

function latestHistory(rows: AnalysisHistoryRow[] | null | undefined, needles: string[]): AnalysisHistoryRow | undefined {
  const normalized = rows ?? [];
  return normalized.find((row) => {
    const type = row.analysis_type?.toLowerCase() ?? '';
    return needles.some((needle) => type.includes(needle));
  });
}

function normalizeSavedJobs(rows?: DashboardSavedJobRow[] | null): SavedJobSignal[] {
  return (rows ?? [])
    .map((row) => ({
      role: typeof row.role_applied === 'string' ? row.role_applied.trim() : '',
      company: typeof row.company_applied === 'string' ? row.company_applied.trim() : '',
      industry: row.industry ?? null,
      date: row.created_at ?? null,
    }))
    .filter((job) => job.role.length > 0 || job.company.length > 0);
}

export function normalizeDashboardIntelligenceInputs({
  resume,
  linkedinGrade,
  savedJobs,
  analysisHistory,
  careerCompassRaw,
  recruitingLensRaw,
}: NormalizeDashboardIntelligenceParams): StoredDashboardInputs {
  const careerRow = latestHistory(analysisHistory, ['career']);
  const recruitingRow = latestHistory(analysisHistory, ['recruiting', 'lens']);
  return {
    resume: normalizeResume(resume),
    linkedin: normalizeLinkedIn(linkedinGrade),
    careerCompass: normalizeCareerCompass(careerCompassRaw, careerRow),
    savedJobs: normalizeSavedJobs(savedJobs),
    recruitingLens: normalizeRecruitingLens(recruitingLensRaw, recruitingRow),
  };
}

/**
 * Pure contract for upgrading a stored Free resume analysis with only the
 * Elite-visible fields that are still absent.
 *
 * The model patch is never spread over the stored result. Every accepted value
 * is copied into an explicitly allowlisted path after validation.
 */

export const ELITE_PRIORITY_IMPROVEMENT_CAP = 7;
export const ELITE_REWRITE_SUGGESTION_CAP = 10;

const TOP_LEVEL_SECTIONS = [
  "priorityImprovements",
  "rewriteSuggestions",
  "industryGuess",
  "suggestedTargetRoles",
  "recommendedKeywords",
  "eliteInsights",
] as const;

type TopLevelEliteUnlockSection = typeof TOP_LEVEL_SECTIONS[number];
export type EliteUnlockSection =
  | TopLevelEliteUnlockSection
  | `criterionFeedback.${string}.feedback`;

export interface EliteCriterionFeedbackPatch {
  id: string;
  feedback: {
    observation: string;
    impact: string;
    fix: string;
    deeper?: string;
    rewrite?: string;
  };
}

export interface EliteRewriteSuggestionPatch {
  criterionId: string;
  title: string;
  originalText: string;
  issues: string[];
  improvedText: string;
  impact: string;
  potentialScoreIncrease: number;
}

export interface EliteUnlockPatch {
  criterionFeedback?: EliteCriterionFeedbackPatch[];
  priorityImprovements?: string[];
  rewriteSuggestions?: EliteRewriteSuggestionPatch[];
  industryGuess?: string;
  suggestedTargetRoles?: string[];
  recommendedKeywords?: string[];
  eliteInsights?: Record<string, unknown>;
}

export type EliteUnlockValidationResult =
  | { ok: true; patch: EliteUnlockPatch }
  | { ok: false; error: string };

export type EliteUnlockMergeResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeJson(value[key])]),
  );
}

/**
 * Compares the immutable analysis body while ignoring mirror-only metadata and
 * JavaScript object insertion order. Zod reconstructs parsed objects in schema
 * order, while Postgres returns jsonb keys in canonical jsonb order; those two
 * semantically identical values must not fail the base-analysis identity gate.
 */
export function baseResumeResultsMatch(
  stored: Record<string, unknown>,
  mirror: Record<string, unknown>,
): boolean {
  const storedWithoutMetadata = { ...stored };
  const mirrorWithoutMetadata = { ...mirror };
  delete storedWithoutMetadata.metadata;
  delete mirrorWithoutMetadata.metadata;
  return JSON.stringify(canonicalizeJson(storedWithoutMetadata)) ===
    JSON.stringify(canonicalizeJson(mirrorWithoutMetadata));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function feedbackPath(criterionId: string): EliteUnlockSection {
  return `criterionFeedback.${criterionId}.feedback`;
}

function hasValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}

/**
 * Returns a deterministic allowlist for Elite-visible paths still absent from
 * the stored result. Existing Free and paid values are never considered
 * writable.
 */
export function detectMissingEliteSections(
  storedResult: Record<string, unknown>,
): EliteUnlockSection[] {
  const missing: EliteUnlockSection[] = [];
  const criteria = Array.isArray(storedResult.criterionFeedback)
    ? storedResult.criterionFeedback
    : [];

  for (const value of criteria) {
    if (!isRecord(value) || !isNonEmptyString(value.id)) continue;
    if (!hasValue(value.feedback)) missing.push(feedbackPath(value.id));
  }

  const improvements = Array.isArray(storedResult.priorityImprovements)
    ? storedResult.priorityImprovements
    : [];
  if (improvements.length < ELITE_PRIORITY_IMPROVEMENT_CAP) {
    missing.push("priorityImprovements");
  }

  const rewrites = Array.isArray(storedResult.rewriteSuggestions)
    ? storedResult.rewriteSuggestions
    : [];
  if (rewrites.length < ELITE_REWRITE_SUGGESTION_CAP) {
    missing.push("rewriteSuggestions");
  }

  for (const section of [
    "industryGuess",
    "suggestedTargetRoles",
    "recommendedKeywords",
    "eliteInsights",
  ] as const) {
    if (!hasValue(storedResult[section])) missing.push(section);
  }

  return missing;
}

function validateFeedback(
  value: unknown,
): value is EliteCriterionFeedbackPatch["feedback"] {
  if (!isRecord(value)) return false;
  const allowed = new Set(["observation", "impact", "fix", "deeper", "rewrite"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  if (
    !isNonEmptyString(value.observation) ||
    !isNonEmptyString(value.impact) ||
    !isNonEmptyString(value.fix)
  ) return false;
  return (
    (value.deeper === undefined || isNonEmptyString(value.deeper)) &&
    (value.rewrite === undefined || isNonEmptyString(value.rewrite))
  );
}

function validateRewrite(value: unknown): value is EliteRewriteSuggestionPatch {
  if (!isRecord(value)) return false;
  const allowed = new Set([
    "criterionId",
    "title",
    "originalText",
    "issues",
    "improvedText",
    "impact",
    "potentialScoreIncrease",
  ]);
  return (
    Object.keys(value).every((key) => allowed.has(key)) &&
    isNonEmptyString(value.criterionId) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.originalText) &&
    isNonEmptyStringArray(value.issues) &&
    isNonEmptyString(value.improvedText) &&
    isNonEmptyString(value.impact) &&
    typeof value.potentialScoreIncrease === "number" &&
    Number.isFinite(value.potentialScoreIncrease)
  );
}

function invalid(path: string): EliteUnlockValidationResult {
  return { ok: false, error: `elite_unlock rejected invalid or unrequested path: ${path}` };
}

/**
 * Validates both shape and semantic allowlisting. Errors name only a path; they
 * never echo resume or model content.
 */
export function validateEliteUnlockPatch(
  storedResult: Record<string, unknown>,
  missingSections: readonly EliteUnlockSection[],
  candidate: unknown,
): EliteUnlockValidationResult {
  if (!isRecord(candidate)) return invalid("root");

  const allowedRootKeys = new Set<string>();
  for (const section of missingSections) {
    allowedRootKeys.add(section.startsWith("criterionFeedback.")
      ? "criterionFeedback"
      : section);
  }

  for (const key of Object.keys(candidate)) {
    if (!allowedRootKeys.has(key)) return invalid(key);
  }

  const patch = candidate as EliteUnlockPatch;
  if (patch.criterionFeedback !== undefined) {
    if (!Array.isArray(patch.criterionFeedback) || patch.criterionFeedback.length === 0) {
      return invalid("criterionFeedback");
    }
    const seen = new Set<string>();
    const storedCriteria = Array.isArray(storedResult.criterionFeedback)
      ? storedResult.criterionFeedback.filter(isRecord)
      : [];
    for (const entry of patch.criterionFeedback) {
      if (!isRecord(entry)) return invalid("criterionFeedback");
      if (Object.keys(entry).some((key) => key !== "id" && key !== "feedback")) {
        return invalid("criterionFeedback");
      }
      if (!isNonEmptyString(entry.id) || seen.has(entry.id)) {
        return invalid("criterionFeedback");
      }
      seen.add(entry.id);
      const path = feedbackPath(entry.id);
      const storedCriterion = storedCriteria.find((item) => item.id === entry.id);
      if (
        !missingSections.includes(path) ||
        !storedCriterion ||
        hasValue(storedCriterion.feedback) ||
        !validateFeedback(entry.feedback)
      ) return invalid(path);
    }
  }

  if (patch.priorityImprovements !== undefined) {
    if (
      !missingSections.includes("priorityImprovements") ||
      !isNonEmptyStringArray(patch.priorityImprovements)
    ) return invalid("priorityImprovements");
  }

  if (patch.rewriteSuggestions !== undefined) {
    if (
      !missingSections.includes("rewriteSuggestions") ||
      !Array.isArray(patch.rewriteSuggestions) ||
      patch.rewriteSuggestions.length === 0 ||
      !patch.rewriteSuggestions.every(validateRewrite)
    ) return invalid("rewriteSuggestions");
  }

  if (
    patch.industryGuess !== undefined &&
    (!missingSections.includes("industryGuess") || !isNonEmptyString(patch.industryGuess))
  ) return invalid("industryGuess");

  for (const section of ["suggestedTargetRoles", "recommendedKeywords"] as const) {
    if (
      patch[section] !== undefined &&
      (!missingSections.includes(section) || !isNonEmptyStringArray(patch[section]))
    ) return invalid(section);
  }

  if (
    patch.eliteInsights !== undefined &&
    (!missingSections.includes("eliteInsights") || !isRecord(patch.eliteInsights))
  ) return invalid("eliteInsights");

  return { ok: true, patch };
}

function appendUnique(base: unknown[], additions: unknown[], cap: number): unknown[] {
  const merged = structuredClone(base);
  const fingerprints = new Set(merged.map((value) => JSON.stringify(value)));
  for (const addition of additions) {
    const fingerprint = JSON.stringify(addition);
    if (!fingerprints.has(fingerprint)) {
      merged.push(structuredClone(addition));
      fingerprints.add(fingerprint);
    }
    if (merged.length >= cap) break;
  }
  return merged;
}

/**
 * Builds a new result from the stored base, then writes only explicitly
 * allowlisted missing paths. The input object is never mutated.
 */
export function mergeEliteUnlockPatch(
  storedResult: Record<string, unknown>,
  missingSections: readonly EliteUnlockSection[],
  candidate: unknown,
): EliteUnlockMergeResult {
  const currentMissing = detectMissingEliteSections(storedResult);
  if (currentMissing.length === 0) {
    return { ok: true, data: structuredClone(storedResult) };
  }

  const validation = validateEliteUnlockPatch(storedResult, missingSections, candidate);
  if (!validation.ok) return validation;

  const merged = structuredClone(storedResult);
  const patch = validation.patch;

  if (patch.criterionFeedback) {
    const patchById = new Map(patch.criterionFeedback.map((entry) => [entry.id, entry]));
    const criteria = Array.isArray(merged.criterionFeedback)
      ? merged.criterionFeedback
      : [];
    merged.criterionFeedback = criteria.map((value) => {
      if (!isRecord(value) || !isNonEmptyString(value.id) || hasValue(value.feedback)) {
        return value;
      }
      const entry = patchById.get(value.id);
      if (!entry || !missingSections.includes(feedbackPath(value.id))) return value;
      const criterion = structuredClone(value);
      criterion.feedback = structuredClone(entry.feedback);
      return criterion;
    });
  }

  if (patch.priorityImprovements) {
    const base = Array.isArray(merged.priorityImprovements)
      ? merged.priorityImprovements
      : [];
    merged.priorityImprovements = appendUnique(
      base,
      patch.priorityImprovements,
      ELITE_PRIORITY_IMPROVEMENT_CAP,
    );
  }

  if (patch.rewriteSuggestions) {
    const base = Array.isArray(merged.rewriteSuggestions)
      ? merged.rewriteSuggestions
      : [];
    merged.rewriteSuggestions = appendUnique(
      base,
      patch.rewriteSuggestions,
      ELITE_REWRITE_SUGGESTION_CAP,
    );
  }

  if (patch.industryGuess !== undefined && !hasValue(merged.industryGuess)) {
    merged.industryGuess = patch.industryGuess;
  }
  if (
    patch.suggestedTargetRoles !== undefined &&
    !hasValue(merged.suggestedTargetRoles)
  ) merged.suggestedTargetRoles = structuredClone(patch.suggestedTargetRoles);
  if (
    patch.recommendedKeywords !== undefined &&
    !hasValue(merged.recommendedKeywords)
  ) merged.recommendedKeywords = structuredClone(patch.recommendedKeywords);
  if (patch.eliteInsights !== undefined && !hasValue(merged.eliteInsights)) {
    merged.eliteInsights = structuredClone(patch.eliteInsights);
  }

  return { ok: true, data: merged };
}

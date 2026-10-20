/**
 * Result merger module for parallel Recruiting Lens analysis.
 *
 * Validates and merges 3 parallel Anthropic API responses
 * (rl-call-1, rl-call-2, rl-call-3) into a single RecruitingLensOutput object.
 *
 * Exports:
 *   mergeRecruitingLensResults  -- orchestrate all 3 calls into unified output
 *   RecruitingLensOutput        -- output type definition
 *   RecruitingLensSubScore      -- sub-score type definition
 */

import { repairTruncatedJSON } from "./json-repair.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecruitingLensSubScore {
  score: number;
  rationale: string;
}

export interface RecruitingLensOutput {
  preAnalysis: {
    jdKeywords: string[];
    dealBreakers: string[];
    industry: string;
    culture: string;
  };
  overallMatch: {
    score: number;
    label: string;
    summary: string;
  };
  subScores: {
    experienceAlignment: RecruitingLensSubScore;
    skillAlignment: RecruitingLensSubScore;
    impactStrength: RecruitingLensSubScore;
    keywordAndLanguageMatch: RecruitingLensSubScore;
    credibilityAndSeniorityFit: RecruitingLensSubScore;
  };
  recruiterVerdict: string;
  scoreRationale: Array<{
    category: string;
    strengths: string[];
    weaknesses: string[];
  }>;
  topGaps: Array<{
    title: string;
    severity: string;
    whyItMatters: string;
    howItShowsUp: string;
    fixPriority: string;
  }>;
  roadmap: Array<{
    stage: string;
    action: string;
    why: string;
    expectedImpact: string;
  }>;
  resumeEdits: Array<{
    original?: string;
    rewritten: string;
    qualityGates: {
      jdVocab: boolean;
      achievementTransform: boolean;
      signalDensity: boolean;
      jdTargeting: boolean;
      pasteReady: boolean;
    };
  }>;
  linkedinImprovements?: Array<{
    area: string;
    suggestion: string;
  }>;
  strategicAdvice: {
    applyNow: boolean;
    summary: string;
    biggestScoreMover: string;
  };
  keywords: {
    matched: string[];
    missing: string[];
  };
  quickFixes: string[];
  _meta?: {
    totalGaps: number;
    totalEdits: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CALL_FIELD_OWNERSHIP: Record<string, string[]> = {
  'rl-call-1': ['preAnalysis', 'overallMatch', 'subScores', 'recruiterVerdict', 'scoreRationale'],
  'rl-call-2': ['topGaps', 'roadmap', 'strategicAdvice'],
  'rl-call-3': ['resumeEdits', 'linkedinImprovements', 'keywords', 'quickFixes'],
};

const SUB_SCORE_KEYS = [
  'experienceAlignment',
  'skillAlignment',
  'impactStrength',
  'keywordAndLanguageMatch',
  'credibilityAndSeniorityFit',
] as const;

// ── Per-tier output whitelists (Phase 18 — D-01/D-03) ────────────────────
// Defense-in-depth: even if the prompt leaks locked fields, the shaper strips them.
// Free users never reach this code (gated at handler level).
const PRO_ALLOWED_FIELDS = new Set<string>([
  'preAnalysis',       // RCL-02 — full
  'overallMatch',      // RCL-02 — full
  'subScores',         // RCL-02 — partial (experienceAlignment + skillAlignment, score only)
  'recruiterVerdict',  // RCL-02 — full
  'topGaps',           // RCL-02 — capped to 2, howItShowsUp + fixPriority stripped
  'resumeEdits',       // RCL-02 — capped to 2
  '_meta',             // Preserved for frontend LockedListItem total counts
]);

// Elite keeps everything — shaper is a no-op (D-04)

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseCallResult(text: string): Record<string, unknown> {
  const repaired = repairTruncatedJSON(text.trim());
  return JSON.parse(repaired) as Record<string, unknown>;
}

function extractOwnedFields(
  data: Record<string, unknown>,
  callType: string,
): { fields: Record<string, unknown>; warnings: string[] } {
  const owned = new Set(CALL_FIELD_OWNERSHIP[callType] || []);
  const fields: Record<string, unknown> = {};
  const warnings: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (owned.has(key)) {
      fields[key] = value;
    } else {
      warnings.push(`[recruiting-lens-merger] Unexpected field "${key}" in ${callType} — ignored`);
    }
  }

  return { fields, warnings };
}

function validateRequired(output: Record<string, unknown>): string[] {
  const warnings: string[] = [];

  // overallMatch
  const overallMatch = output.overallMatch as Record<string, unknown> | undefined;
  if (!overallMatch) {
    warnings.push('Missing required field: overallMatch');
  } else {
    if (typeof overallMatch.score !== 'number' || overallMatch.score < 0 || overallMatch.score > 100) {
      warnings.push('overallMatch.score must be a number 0-100');
    }
    if (typeof overallMatch.label !== 'string' || !overallMatch.label) {
      warnings.push('overallMatch.label must be a non-empty string');
    }
    if (typeof overallMatch.summary !== 'string' || !overallMatch.summary) {
      warnings.push('overallMatch.summary must be a non-empty string');
    }
  }

  // subScores
  const subScores = output.subScores as Record<string, unknown> | undefined;
  if (!subScores) {
    warnings.push('Missing required field: subScores');
  } else {
    for (const key of SUB_SCORE_KEYS) {
      if (!subScores[key]) {
        warnings.push(`Missing sub-score: subScores.${key}`);
      }
    }
  }

  // recruiterVerdict
  if (typeof output.recruiterVerdict !== 'string' || !output.recruiterVerdict) {
    warnings.push('recruiterVerdict must be a non-empty string');
  }

  // scoreRationale
  if (!Array.isArray(output.scoreRationale) || output.scoreRationale.length < 1) {
    warnings.push('scoreRationale must be an array with at least 1 entry');
  }

  // topGaps
  if (!Array.isArray(output.topGaps) || output.topGaps.length < 1) {
    warnings.push('topGaps must be an array with at least 1 entry');
  }

  // roadmap
  if (!Array.isArray(output.roadmap) || output.roadmap.length !== 4) {
    warnings.push('roadmap must be an array with exactly 4 stages');
  }

  // resumeEdits
  if (!Array.isArray(output.resumeEdits) || output.resumeEdits.length < 1) {
    warnings.push('resumeEdits must be an array with at least 1 entry');
  }

  // strategicAdvice
  const advice = output.strategicAdvice as Record<string, unknown> | undefined;
  if (!advice) {
    warnings.push('Missing required field: strategicAdvice');
  } else {
    if (typeof advice.applyNow !== 'boolean') {
      warnings.push('strategicAdvice.applyNow must be a boolean');
    }
    if (typeof advice.summary !== 'string' || !advice.summary) {
      warnings.push('strategicAdvice.summary must be a non-empty string');
    }
    if (typeof advice.biggestScoreMover !== 'string' || !advice.biggestScoreMover) {
      warnings.push('strategicAdvice.biggestScoreMover must be a non-empty string');
    }
  }

  // keywords
  const keywords = output.keywords as Record<string, unknown> | undefined;
  if (!keywords) {
    warnings.push('Missing required field: keywords');
  } else {
    if (!Array.isArray(keywords.matched)) {
      warnings.push('keywords.matched must be an array');
    }
    if (!Array.isArray(keywords.missing)) {
      warnings.push('keywords.missing must be an array');
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Tier-aware output shaping (Phase 18 — D-01)
// ---------------------------------------------------------------------------

/**
 * Strip Elite-only fields from merged output based on user tier.
 * Mutates `merged` in place. Called inside mergeRecruitingLensResults.
 *
 * Pro whitelist (D-03):
 *   - overallMatch (full), recruiterVerdict (full), preAnalysis (full)
 *   - subScores: only experienceAlignment + skillAlignment, rationale stripped
 *   - topGaps: first 2 only, howItShowsUp + fixPriority stripped
 *   - resumeEdits: first 2 only
 *   - _meta: preserved for LockedListItem total counts
 *
 * Elite: no-op (D-04).
 *
 * @param merged - The merged RecruitingLensOutput (mutated in place)
 * @param tier - 'pro' or 'elite' (Free users are blocked at handler level)
 */
export function applyRecruitingLensTierShape(
  merged: RecruitingLensOutput,
  tier: 'pro' | 'elite',
): void {
  if (tier === 'elite') return; // D-04: no-op for Elite

  // Strip top-level keys not in Pro whitelist
  // deno-lint-ignore no-explicit-any
  const rec = merged as any;
  for (const key of Object.keys(rec)) {
    if (!PRO_ALLOWED_FIELDS.has(key)) {
      delete rec[key];
    }
  }

  // Sub-scores: keep only experienceAlignment + skillAlignment, strip rationale
  if (merged.subScores) {
    const allowedSubScores = new Set(['experienceAlignment', 'skillAlignment']);
    // deno-lint-ignore no-explicit-any
    const ss = merged.subScores as any;
    for (const key of Object.keys(ss)) {
      if (!allowedSubScores.has(key)) {
        delete ss[key];
      } else if (ss[key] && typeof ss[key] === 'object') {
        // Keep score, strip rationale
        delete ss[key].rationale;
      }
    }
  }

  // Cap topGaps to 2 and strip howItShowsUp + fixPriority from shown gaps
  if (merged.topGaps) {
    merged.topGaps = merged.topGaps.slice(0, 2);
    for (const gap of merged.topGaps) {
      // deno-lint-ignore no-explicit-any
      const g = gap as any;
      delete g.howItShowsUp;
      delete g.fixPriority;
    }
  }

  // Cap resumeEdits to 2
  if (merged.resumeEdits) {
    merged.resumeEdits = merged.resumeEdits.slice(0, 2);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Merge 3 parallel Recruiting Lens call results into a single output object.
 *
 * Each result must include a callType ('rl-call-1' | 'rl-call-2' | 'rl-call-3')
 * and the raw text response from the Anthropic API.
 *
 * Returns the merged output and any warnings (missing/invalid fields).
 * Does NOT throw on missing fields — returns warnings instead.
 */
export function mergeRecruitingLensResults(
  results: Array<{ callType: string; text: string }>,
  tier: 'pro' | 'elite' = 'elite',
): { output: RecruitingLensOutput; warnings: string[] } {
  const allWarnings: string[] = [];
  const merged: Record<string, unknown> = {};

  for (const result of results) {
    let parsed: Record<string, unknown>;
    try {
      parsed = parseCallResult(result.text);
    } catch {
      const snippet = result.text.trim().slice(0, 200);
      allWarnings.push(`[recruiting-lens-merger] JSON parse failed for ${result.callType}: ${snippet}`);
      continue;
    }

    const { fields, warnings } = extractOwnedFields(parsed, result.callType);
    allWarnings.push(...warnings);

    // Merge owned fields into output
    for (const [key, value] of Object.entries(fields)) {
      merged[key] = value;
    }
  }

  // Validate required fields
  const validationWarnings = validateRequired(merged);
  allWarnings.push(...validationWarnings);

  // Log warnings
  for (const w of allWarnings) {
    console.log(w);
  }

  // Inject _meta for frontend LockedListItem total counts (before shaping)
  (merged as Record<string, unknown>)._meta = {
    totalGaps: Array.isArray(merged.topGaps) ? (merged.topGaps as unknown[]).length : 0,
    totalEdits: Array.isArray(merged.resumeEdits) ? (merged.resumeEdits as unknown[]).length : 0,
  };

  // Tier-aware output shaping (Phase 18 — D-01/D-02)
  applyRecruitingLensTierShape(merged as unknown as RecruitingLensOutput, tier);

  return {
    output: merged as unknown as RecruitingLensOutput,
    warnings: allWarnings,
  };
}

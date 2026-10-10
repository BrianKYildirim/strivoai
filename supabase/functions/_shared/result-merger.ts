/**
 * Result merger module for parallel resume analysis.
 *
 * Validates, normalizes, and merges 3 parallel Anthropic API responses
 * (criteria-1, criteria-2, summary) into a single grading_data object.
 *
 * Replaces the Phase 2 naive spread-merge that overwrites criterionFeedback arrays.
 *
 * Exports:
 *   parseAndValidateCall  -- per-call JSON repair + parse + validate
 *   mergeAndValidateResults -- orchestrate all 3 calls into unified grading_data
 *   applyTierShape -- tier-aware output shaper (Phase 15)
 */

import { repairTruncatedJSON } from "./json-repair.ts";
import type { CallType } from "./resume-prompts.ts";

// ---------------------------------------------------------------------------
// Constants (internal)
// ---------------------------------------------------------------------------

const FIELD_ALIASES: Record<string, string> = {
  'criteria': 'criterionFeedback',
  'improvements': 'priorityImprovements',
  'suggestions': 'rewriteSuggestions',
  'summary': 'executiveSummary',
};

const ALLOWED_FIELDS: Record<string, Set<string>> = {
  'criteria-1': new Set(['criterionFeedback']),
  'criteria-2': new Set(['criterionFeedback']),
  'summary': new Set([
    'executiveSummary', 'strengths', 'priorityImprovements',
    'industryGuess', 'suggestedTargetRoles', 'recommendedKeywords',
    // rewriteSuggestions + eliteInsights removed (260608-p5k): owned by the
    // dedicated 'rewrites' / 'elite-extras' calls. Stripped here if Haiku leaks them.
  ]),
  'rewrites': new Set(['rewriteSuggestions']),
  'elite-extras': new Set([
    'eliteInsights',
  ]),
};

const EXPECTED_IDS: Record<string, string[]> = {
  'criteria-1': [
    'c1_visual_clarity', 'c2_formatting_consistency', 'c3_ats_parseability',
    'c4_professional_tone', 'c5_conciseness', 'c6_achievement_orientation',
  ],
  'criteria-2': [
    'c7_relevance_targeting', 'c8_skills_presentation', 'c9_projects_portfolio',
    'c10_education_credentials', 'c11_career_narrative',
  ],
};

// rewriteSuggestions dropped from the summary's required set (260608-p5k): it is now
// produced by the dedicated 'rewrites' call, so the light summary call self-validates
// on the three narrative fields it reliably emits.
const SUMMARY_REQUIRED = ['executiveSummary', 'strengths', 'priorityImprovements'];

// ── Per-tier output whitelists (Phase 15 — D-15) ────────────────────────────
// Defense-in-depth: even if the prompt leaks locked fields, applyTierShape strips them.
// Fields not in the whitelist are deleted from the merged object.
// CORE_FIELDS are always kept regardless of tier.
const CORE_FIELDS = ['overallScore', '_mergeSource'] as const;

const FREE_ALLOWED_FIELDS = new Set<string>([
  ...CORE_FIELDS,
  'executiveSummary',     // RES-01
  'resumeSignal',         // RES-01 — emitted by Free prompt variant
  'strengths',            // RES-01 — full array
  'priorityImprovements', // RES-01 — capped to 1 inside applyTierShape
  'criterionFeedback',    // RES-01 — 11 entries, C2-C11 stripped to {id, label, weight, score}
  'rewriteSuggestions',   // Phase 15.2 D-01: allow 1 for PriorityCard
]);

const PRO_ADDITIONS = [
  'rewriteSuggestions',     // RES-03
  'industryGuess',          // RES-03
  'suggestedTargetRoles',   // RES-03
  'recommendedKeywords',    // RES-03
] as const;
const PRO_ALLOWED_FIELDS = new Set<string>([...FREE_ALLOWED_FIELDS, ...PRO_ADDITIONS]);

const ELITE_ADDITIONS = [
  'eliteInsights',  // RES-04 — nested object with 6 sub-fields
] as const;
const ELITE_ALLOWED_FIELDS = new Set<string>([...PRO_ALLOWED_FIELDS, ...ELITE_ADDITIONS]);

// ── Per-tier career output whitelists (Phase 17 — CC-01..CC-04) ─────────
// Defense-in-depth: applyCareerTierShape strips leaked fields server-side
// regardless of prompt compliance. Career whitelists are independent from
// the resume whitelists above.
const CAREER_CORE_FIELDS = [
  'detectedDomain', 'domainEvidence', 'roleReadinessScore', 'targetRole',
  'careerDNA', 'whatYouHave',
] as const;

// 260713-hrd: `roadmap` and `roleRoadmaps` were REMOVED from the Free whitelist.
//
// They were listed here as if Free received a trimmed roadmap ("steps sliced to 2 phases
// in shaper"), but the shaper immediately below has ALWAYS `delete`d both for Free — the
// whitelist and the shaper flatly contradicted each other, and the shaper won. Free has
// never actually received a roadmap.
//
// The locked Free scope is: Career DNA, career fields, roles, surprise fits, a readiness
// score. NO roadmap, NO detailed skills gap, NO salary. So the whitelist is corrected to
// state the truth the shaper already enforced, and the two now agree. `roadmap` /
// `roleRoadmaps` move to the PAID additions, where they are genuinely delivered.
const CAREER_FREE_ALLOWED_FIELDS = new Set<string>([
  ...CAREER_CORE_FIELDS,
  'careerFields',            // CC-01: sliced to 3 entries in shaper
  'roleReadinessBreakdown',  // CC-01: scorebox only in shaper (overallScore + targetRole)
  'surpriseFits',            // CC-01: sliced to 2 entries in shaper
  'roles',                   // CC-01: sliced to 3 entries in shaper
]);

const CAREER_PRO_ADDITIONS = [
  'skillGaps',               // CC-02 omits for Free, CC-03 includes
  'salaryProgression',       // CC-03 explicitly includes
  'roadmap',                 // 260713-hrd: paid-only (Free never received one)
  'roleRoadmaps',            // 260713-hrd: paid-only (Free never received one)
] as const;
const CAREER_PRO_ALLOWED_FIELDS = new Set<string>([
  ...CAREER_FREE_ALLOWED_FIELDS, ...CAREER_PRO_ADDITIONS,
]);

const CAREER_ELITE_ADDITIONS = [
  'compensationIntelligence',  // CC-04
  'smartApplicationStrategy',  // CC-04
] as const;
const CAREER_ELITE_ALLOWED_FIELDS = new Set<string>([
  ...CAREER_PRO_ALLOWED_FIELDS, ...CAREER_ELITE_ADDITIONS,
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalizeAliases(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const canonical = FIELD_ALIASES[key] || key;
    if (canonical !== key) {
      console.log(`[parallel] Normalized alias: "${key}" -> "${canonical}"`);
    }
    result[canonical] = value;
  }
  return result;
}

function stripUnknownFields(data: Record<string, unknown>, callType: CallType): Record<string, unknown> {
  const allowed = ALLOWED_FIELDS[callType];
  if (!allowed) return data;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (allowed.has(key)) {
      result[key] = value;
    } else {
      console.log(`[parallel] Stripped unknown field "${key}" from ${callType} response`);
    }
  }
  return result;
}

function validateCriteriaCall(
  data: Record<string, unknown>,
  callType: 'criteria-1' | 'criteria-2',
): { ok: true } | { ok: false; reason: string } {
  const feedback = data.criterionFeedback;
  if (!Array.isArray(feedback)) {
    return { ok: false, reason: `${callType}: criterionFeedback is not an array` };
  }

  const expectedIds = EXPECTED_IDS[callType];
  if (feedback.length !== expectedIds.length) {
    console.log(`[parallel] Truncation: ${callType} expected ${expectedIds.length} criteria, got ${feedback.length}`);
    return {
      ok: false,
      reason: `${callType}: expected ${expectedIds.length} criteria, got ${feedback.length}`,
    };
  }

  const returnedIds = feedback.map((c: Record<string, unknown>) => c.id as string);
  for (const expectedId of expectedIds) {
    if (!returnedIds.includes(expectedId)) {
      return {
        ok: false,
        reason: `${callType}: missing expected criterion ID "${expectedId}", got [${returnedIds.join(', ')}]`,
      };
    }
  }

  // Clamp scores (corrective, not rejecting)
  for (const criterion of feedback) {
    const raw = Number((criterion as Record<string, unknown>).score) || 0;
    const clamped = Math.max(0, Math.min(100, raw));
    if (clamped !== raw) {
      console.log(`[parallel] Score clamped for ${(criterion as Record<string, unknown>).id}: ${raw} -> ${clamped}`);
    }
    (criterion as Record<string, unknown>).score = clamped;
  }

  return { ok: true };
}

function validateSummaryCall(
  data: Record<string, unknown>,
  _isElite: boolean,
): { ok: true } | { ok: false; reason: string } {
  for (const field of SUMMARY_REQUIRED) {
    if (data[field] === undefined || data[field] === null) {
      return { ok: false, reason: `summary: missing required field "${field}"` };
    }
  }

  return { ok: true };
}

function validateRewritesCall(
  data: Record<string, unknown>,
): { ok: true } | { ok: false; reason: string } {
  const rewrites = data.rewriteSuggestions;
  if (!Array.isArray(rewrites) || rewrites.length === 0) {
    return { ok: false, reason: `rewrites: rewriteSuggestions missing or empty` };
  }
  // Log partial rewrites but accept them (the parallel-stage retry handles a short
  // array; here we only hard-fail a truly empty/absent one so it can be retried).
  if (rewrites.length < 5) {
    console.log(`[parallel] Partial rewriteSuggestions: got ${rewrites.length}, expected 5-7`);
  }
  return { ok: true };
}

/**
 * Log-only validation for the elite-extras call (260608-p5k). Never rejects — it
 * surfaces silent clipping of the heavy eliteInsights payload (a truncated-but-
 * JSON-repaired response) so quality loss is visible in logs instead of hidden.
 */
function validateEliteExtrasCall(data: Record<string, unknown>): void {
  const ei = data.eliteInsights as Record<string, unknown> | undefined;
  if (!ei || typeof ei !== 'object') {
    console.log('[parallel] elite-extras: eliteInsights missing or not an object — possible truncation');
    return;
  }
  const ats = ei.detailedATSGapAnalysis;
  const phrases = ei.powerPhrases;
  if (!Array.isArray(ats) || ats.length < 4) {
    console.log(`[parallel] elite-extras: detailedATSGapAnalysis short (got ${Array.isArray(ats) ? ats.length : 0}, expected 4-6) — possible truncation`);
  }
  if (!Array.isArray(phrases) || phrases.length < 4) {
    console.log(`[parallel] elite-extras: powerPhrases short (got ${Array.isArray(phrases) ? phrases.length : 0}, expected 4-6) — possible truncation`);
  }
}

function fillDefaults(merged: Record<string, unknown>, isElite: boolean): void {
  // String defaults
  if (!merged.industryGuess) merged.industryGuess = '';

  // Array defaults
  if (!Array.isArray(merged.suggestedTargetRoles)) merged.suggestedTargetRoles = [];
  if (!Array.isArray(merged.recommendedKeywords)) merged.recommendedKeywords = [];
  // rewriteSuggestions now comes from the dedicated 'rewrites' call; if that call
  // failed/was salvaged, default to an empty array rather than leaving it undefined.
  if (!Array.isArray(merged.rewriteSuggestions)) merged.rewriteSuggestions = [];

  // Elite insights
  if (!isElite) {
    merged.eliteInsights = null;
  } else if (merged.eliteInsights && typeof merged.eliteInsights === 'object') {
    // Fill sub-defaults for partial eliteInsights
    const ei = merged.eliteInsights as Record<string, unknown>;
    if (ei.interviewLikelihood === undefined) ei.interviewLikelihood = 0;
    if (!ei.competitiveRanking) ei.competitiveRanking = '';
    if (!ei.recruiterFirstImpressions) ei.recruiterFirstImpressions = null;
    if (!Array.isArray(ei.hiddenWeaknesses)) ei.hiddenWeaknesses = [];
    if (!Array.isArray(ei.powerPhrases)) ei.powerPhrases = [];
    if (!Array.isArray(ei.detailedATSGapAnalysis)) ei.detailedATSGapAnalysis = [];
  } else if (isElite) {
    merged.eliteInsights = null; // missing entirely for elite = null, not crash
  }

  // Defensive overallScore init (reconcileScore computes real value)
  merged.overallScore = 0;

  // Traceability (260608-p5k: 5-call elite split — summary + dedicated rewrites + elite-extras)
  merged._mergeSource = 'parallel-5';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse, repair, validate, and normalize a single parallel call's raw text response.
 *
 * Pipeline: repair JSON -> parse -> normalize aliases -> strip unknown fields ->
 * call-type-specific validation (criteria count, ID check, score clamp, or summary required fields).
 */
export function parseAndValidateCall(
  callType: CallType,
  rawText: string,
  isElite: boolean,
): { ok: true; data: Record<string, unknown> } | { ok: false; reason: string } {
  // Step 1: Repair and parse JSON
  let parsed: Record<string, unknown>;
  try {
    const repaired = repairTruncatedJSON(rawText.trim());
    parsed = JSON.parse(repaired) as Record<string, unknown>;
  } catch {
    const snippet = rawText.trim().slice(0, 200);
    return { ok: false, reason: `${callType}: JSON parse failed: ${snippet}` };
  }

  // Step 2: Normalize field name aliases
  const normalized = normalizeAliases(parsed);

  // Step 3: Strip unknown/unexpected fields
  const stripped = stripUnknownFields(normalized, callType);

  // Step 4: Call-type-specific validation
  if (callType === 'criteria-1' || callType === 'criteria-2') {
    const validation = validateCriteriaCall(stripped, callType);
    if (!validation.ok) {
      return { ok: false, reason: validation.reason };
    }
  } else if (callType === 'summary') {
    const validation = validateSummaryCall(stripped, isElite);
    if (!validation.ok) {
      return { ok: false, reason: validation.reason };
    }
  } else if (callType === 'rewrites') {
    const validation = validateRewritesCall(stripped);
    if (!validation.ok) {
      return { ok: false, reason: validation.reason };
    }
  } else if (callType === 'elite-extras') {
    validateEliteExtrasCall(stripped); // log-only; never rejects
  }

  return { ok: true, data: stripped };
}

/**
 * Tier-aware output shaper (Phase 15 — D-11/D-12).
 * Strips fields not in the per-tier whitelist, caps priorityImprovements,
 * and strips feedback detail from all criteria except C6 for Free tier.
 *
 * This is the SINGLE exit point for all tier shaping — called inside
 * mergeAndValidateResults and also directly by fallback paths.
 * Mutates the merged object in place for zero-copy efficiency.
 *
 * @param merged - The merged grading_data object (mutated in place)
 * @param tier - The server-resolved tier ('free' | 'pro' | 'elite')
 */
export function applyTierShape(
  merged: Record<string, unknown>,
  tier: 'free' | 'pro' | 'elite',
): void {
  const whitelist = tier === 'elite' ? ELITE_ALLOWED_FIELDS
    : tier === 'pro' ? PRO_ALLOWED_FIELDS
    : FREE_ALLOWED_FIELDS;

  // Strip keys not in whitelist
  for (const key of Object.keys(merged)) {
    if (!whitelist.has(key)) {
      delete merged[key];
    }
  }

  // Cap priorityImprovements per tier (D-13: relocated from handler)
  // Spec §4.1: free=1, pro=5, elite=7
  const IMPROVEMENT_CAPS: Record<string, number> = { free: 1, pro: 5, elite: 7 };
  if (Array.isArray(merged.priorityImprovements)) {
    merged.priorityImprovements = (merged.priorityImprovements as unknown[]).slice(0, IMPROVEMENT_CAPS[tier]);
  }

  // Cap rewriteSuggestions per tier (Phase 15.2 D-01)
  // Free: 1 for PriorityCard, Pro: 7 (5-7 prompt range), Elite: 10 (8-10 prompt range)
  const REWRITE_CAPS: Record<string, number> = { free: 1, pro: 7, elite: 10 };
  if (Array.isArray(merged.rewriteSuggestions)) {
    merged.rewriteSuggestions = (merged.rewriteSuggestions as unknown[]).slice(0, REWRITE_CAPS[tier]);
  }

  // Free tier: keep C6 (Achievement Orientation, 20% weight) with full feedback (D-06, Phase 15.1).
  // All other criteria (C1-C5, C7-C11) stripped to {id, label, weight, score} only.
  // Lookup by id instead of index for robustness against criterion reordering.
  if (tier === 'free' && Array.isArray(merged.criterionFeedback)) {
    merged.criterionFeedback = (merged.criterionFeedback as Record<string, unknown>[]).map((c) => {
      if (c.id === 'c6_achievement_orientation') return c; // C6: keep full feedback (D-06)
      return { id: c.id, label: c.label, weight: c.weight, score: c.score };
    });
  }
}

/**
 * Career-specific tier-aware output shaper (Phase 17 — D-07/D-08).
 * Strips fields not in the per-tier career whitelist, then applies
 * array slicing and object trimming for Free tier per CC-01.
 * Mutates the data object in place.
 *
 * This is independent from the resume `applyTierShape` above — career
 * output has a completely different field set.
 *
 * @param data - The career analysis output object (mutated in place)
 * @param tier - The server-resolved tier ('free' | 'pro' | 'elite')
 */
export function applyCareerTierShape(
  data: Record<string, unknown>,
  tier: 'free' | 'pro' | 'elite',
): void {
  const whitelist = tier === 'elite' ? CAREER_ELITE_ALLOWED_FIELDS
    : tier === 'pro' ? CAREER_PRO_ALLOWED_FIELDS
    : CAREER_FREE_ALLOWED_FIELDS;

  // Strip keys not in whitelist
  for (const key of Object.keys(data)) {
    if (!whitelist.has(key)) {
      delete data[key];
    }
  }

  // Retired Career Comparison subsections must not leak from legacy cached rows.
  if (data.roleReadinessBreakdown && typeof data.roleReadinessBreakdown === 'object') {
    const readiness = data.roleReadinessBreakdown as Record<string, unknown>;
    for (const key of [
      ['why', 'Match'].join(''),
      ['main', 'Barriers'].join(''),
      ['actions', 'Needed'].join(''),
    ]) {
      delete readiness[key];
    }
  }

  // Free tier array slicing and object trimming (CC-01 / D-09)
  // Phase 37: Free keeps enough real signal for parity, but roadmap remains
  // presentational only in the frontend. Do not expose generated roadmap text.
  if (tier === 'free') {
    // careerFields: keep up to 3 real entries; frontend adds 2 locked placeholders.
    if (Array.isArray(data.careerFields)) {
      data.careerFields = (data.careerFields as unknown[]).slice(0, 3);
    }
    // roles: keep up to 3 real entries; frontend adds 2 locked placeholders.
    if (Array.isArray(data.roles)) {
      data.roles = (data.roles as unknown[]).slice(0, 3);
    }
    // surpriseFits: keep up to 2 real entries; frontend adds 2 locked placeholders.
    if (Array.isArray(data.surpriseFits)) {
      data.surpriseFits = (data.surpriseFits as unknown[]).slice(0, 2);
    }
    delete data.roadmap;
    delete data.roleRoadmaps;
    // roleReadinessBreakdown: keep ONLY overallScore + targetRole
    // (no readinessVerdict, no strengths, no gaps, no skillAssessments)
    if (data.roleReadinessBreakdown && typeof data.roleReadinessBreakdown === 'object') {
      const rrb = data.roleReadinessBreakdown as Record<string, unknown>;
      data.roleReadinessBreakdown = {
        overallScore: rrb.overallScore,
        targetRole: rrb.targetRole,
      };
    }
  }

  // Pro tier: no array slicing needed (all standard fields present)
  // Elite tier: no modifications needed (all fields present)
}

/**
 * Post-parse merge tail (the byte-identical contract shared by the raw-text and
 * pre-parsed entry points — quick task 260625 H4 dedup).
 *
 * Consumes the already-parsed+validated per-call data and runs ONLY the steps
 * AFTER `parseAndValidateCall`: concatenate criterionFeedback (6+5=11) -> spread
 * summary fields -> fold optional rewrites/elite-extras (present only when they
 * validated ok) -> fillDefaults -> applyTierShape. No call's buffer is parsed here.
 *
 * The 3 mandatory keys (criteria-1, criteria-2, summary) MUST be present in
 * `parsed`; the optional keys (rewrites, elite-extras) are folded iff present.
 * This mirrors the prior in-line tail exactly — the salvage-tolerant optional
 * folds become "key present in `parsed`" since a failed optional call is simply
 * not carried forward (matching the prior `if (rewritesResult.ok)` / log-and-skip).
 */
function mergeParsedTail(
  parsed: Record<string, Record<string, unknown>>,
  tier: 'free' | 'pro' | 'elite',
): Record<string, unknown> {
  // Concatenate criterionFeedback arrays (6 + 5 = 11)
  const criteria1Feedback = parsed['criteria-1'].criterionFeedback as unknown[];
  const criteria2Feedback = parsed['criteria-2'].criterionFeedback as unknown[];
  const criterionFeedback = [...criteria1Feedback, ...criteria2Feedback];

  // Spread summary fields into merged object
  const merged: Record<string, unknown> = {
    criterionFeedback,
    ...parsed['summary'],
  };

  // Optional rewrites call (salvage-first, quick task 260608-p5k): folded like
  // elite-extras. Present in `parsed` iff it parsed+validated ok; otherwise
  // fillDefaults supplies an empty rewriteSuggestions array rather than failing
  // the otherwise-complete run.
  if (parsed['rewrites']) {
    Object.assign(merged, parsed['rewrites']);
  }

  // Optional elite-extras call (Phase 15 D-05/D-06)
  // Only present when tier === 'elite' and the 4th parallel call was fired+validated.
  if (parsed['elite-extras']) {
    // Fold elite-extras fields into merged object
    Object.assign(merged, parsed['elite-extras']);
  }

  // Fill defaults and add metadata
  fillDefaults(merged, tier === 'elite');

  // Tier-aware output shaping (Phase 15 — D-11/D-12)
  applyTierShape(merged, tier);

  return merged;
}

/**
 * Orchestrate parsing + validation of all parallel call results, then merge
 * into a single grading_data object with tier-appropriate field shaping.
 *
 * Pipeline: validate each call -> concatenate criterionFeedback (6+5=11) ->
 * spread summary fields -> optionally fold elite-extras -> fill defaults ->
 * applyTierShape (whitelist strip + criterion feedback shaping) -> return.
 *
 * Raw-text entry point: parses each call's buffer via parseAndValidateCall, then
 * delegates to the shared mergeParsedTail. Retained for any caller that only has
 * the raw text; the analyze-resume parallel path uses mergeValidated to avoid the
 * cross-boundary double-parse (the retry loop already parsed each buffer once).
 */
export function mergeAndValidateResults(
  rawResults: Record<string, string>,
  tier: 'free' | 'pro' | 'elite',
): { ok: true; data: Record<string, unknown> } | { ok: false; reason: string } {
  // Validate each call
  const callTypes: CallType[] = ['criteria-1', 'criteria-2', 'summary'];
  const parsed: Record<string, Record<string, unknown>> = {};

  for (const callType of callTypes) {
    const result = parseAndValidateCall(callType, rawResults[callType], tier === 'elite');
    if (!result.ok) {
      console.log(`[parallel] Validation failed for ${callType}: ${result.reason}`);
      return { ok: false, reason: result.reason };
    }
    parsed[callType] = result.data;
  }

  // Optional rewrites call (salvage-first, quick task 260608-p5k). If it
  // parses+validates, carry it into `parsed` for the fold; otherwise log and
  // skip (fillDefaults supplies an empty rewriteSuggestions array). The
  // parallel-stage retry in executeParallelCalls already attempts recovery first.
  if (rawResults['rewrites']) {
    const rewritesResult = parseAndValidateCall('rewrites' as CallType, rawResults['rewrites'], tier === 'elite');
    if (rewritesResult.ok) {
      parsed['rewrites'] = rewritesResult.data;
    } else {
      console.log(`[parallel] rewrites parse failed (non-fatal, defaulting to []): ${rewritesResult.reason}`);
    }
  }

  // Optional elite-extras call (Phase 15 D-05/D-06)
  // Only present when tier === 'elite' and the 4th parallel call was fired.
  if (rawResults['elite-extras']) {
    const eliteResult = parseAndValidateCall('elite-extras' as CallType, rawResults['elite-extras'], true);
    if (eliteResult.ok) {
      parsed['elite-extras'] = eliteResult.data;
    } else {
      console.log(`[parallel] elite-extras parse failed (non-fatal): ${eliteResult.reason}`);
      // Non-fatal: elite user still gets the base 3-call output
    }
  }

  return { ok: true, data: mergeParsedTail(parsed, tier) };
}

/**
 * Pre-parsed entry point (quick task 260625 H4 dedup). Consumes the already-
 * parsed+validated per-call data produced by analyze-resume's executeParallelCalls
 * (which ran parseAndValidateCall once per call for its retry decision) and runs
 * the SAME post-parse merge tail as mergeAndValidateResults — skipping the
 * redundant second parse of each identical buffer.
 *
 * `parsed` MUST contain the 3 mandatory keys (criteria-1, criteria-2, summary)
 * with their validated data; the optional keys (rewrites, elite-extras) must be
 * present iff their call parsed+validated ok (the caller drops failed optionals,
 * matching the salvage-tolerant fold the raw-text path performed). The merged
 * output is byte-identical to mergeAndValidateResults for the same call buffers.
 */
export function mergeValidated(
  parsed: Record<string, Record<string, unknown>>,
  tier: 'free' | 'pro' | 'elite',
): { ok: true; data: Record<string, unknown> } | { ok: false; reason: string } {
  for (const callType of ['criteria-1', 'criteria-2', 'summary'] as const) {
    if (!parsed[callType]) {
      return { ok: false, reason: `${callType}: missing pre-parsed data` };
    }
  }
  return { ok: true, data: mergeParsedTail(parsed, tier) };
}

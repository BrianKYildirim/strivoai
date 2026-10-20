import { repairTruncatedJSON } from '../_shared/json-repair.ts';
import { validateModelOutput, type LlmValidationResult } from '../_shared/llm-validation.ts';
import {
  LINKEDIN_MAX_BY_NAME,
  linkedInGradeSchema,
  normalizeFromSections,
  type LinkedInGrade,
} from './schema.ts';

// ── Four-section semantic check (direct-sum total integrity) ──────────
//
// Phase 04-02 (FEAT-03 / T-04-06). Runs as the `semanticCheck` hook of the
// shared strict validator (`_shared/llm-validation.ts`) AFTER `linkedInGradeSchema`
// has parsed + clamped the value. It recomputes the headline total from the
// clamped, applicable sections and enforces that the model-reported `rawScore`
// matches EXACTLY — the model never sets the headline number, and a mismatch is
// REJECTED (surfaced as SCHEMA_VALIDATION_FAILED), never silently overwritten.
//
// ALL runtime paths — the shared
// analysis-lifecycle path AND the legacy/merit-dormant fallback paths in
// grade-linkedin/index.ts — now validate through `validateLinkedInModelResponse`
// below, so there is exactly ONE validation source of truth for a LinkedIn model
// response.

export function linkedInSemanticCheck(
  value: LinkedInGrade,
): { ok: true } | { ok: false; detail: string } {
  // Map to the pure normalizer's structural shape. Fields are runtime-guaranteed
  // by linkedInGradeSchema; the explicit projection keeps this type-clean even
  // though zod's transform+superRefine inference widens the element fields.
  const expected = normalizeFromSections(
    value.sectionBreakdown.map((s) => ({
      applicable: s.applicable === true,
      maxScore: Number(s.maxScore),
      score: Number(s.score),
    })),
  );
  if (value.rawScore !== expected) {
    return {
      ok: false,
      detail: `rawScore(${value.rawScore}) != normalizeFromSections(${expected})`,
    };
  }
  return { ok: true };
}

// ── Parse + math-from-sections injection ─────────────────────────
//
// Shared by EVERY runtime path (04-GAP-01 convergence). Both the lifecycle
// `generate()` closure and the legacy/merit-dormant fallback paths in index.ts
// call the same seam, so a LinkedIn model response is parsed, scored, and
// validated identically no matter which flag configuration is live.

/**
 * Parses AI response text: strips markdown fences, attempts JSON.parse, falls
 * back to `repairTruncatedJSON` for truncated responses. Throws on unrecoverable
 * garbage (caller treats a throw as "hand the raw text to validateModelOutput").
 */
export function parseAiResponse(rawText: string): unknown {
  let text = rawText.trim();
  if (text.startsWith('```json')) {
    text = text.replace(/^```json\s*/, '').replace(/```\s*$/, '');
  } else if (text.startsWith('```')) {
    text = text.replace(/^```\s*/, '').replace(/```\s*$/, '');
  }
  try {
    return JSON.parse(text);
  } catch {
    const repaired = repairTruncatedJSON(text);
    return JSON.parse(repaired);
  }
}

/**
 * DIRECT-SUM FROM SECTIONS: clamp each section score to [0, CATALOGUE max] and
 * set `rawScore` to the plain sum of applicable section scores. Mutates `parsed`
 * in place. The 04-03 prompt forbids the model from emitting an overall total, so
 * the server injects it here BEFORE validation — the model never invents the
 * number, and `linkedInSemanticCheck` (rawScore === normalizeFromSections) then
 * holds by construction. The per-section clamp mirrors `linkedInGradeSchema`'s
 * `.transform` — including clamping against the server-owned catalogue max, never
 * the model-declared `maxScore` (CR-01) — so the injected total matches the
 * post-parse sections the semanticCheck sees, and an inflated or negative model
 * maxScore can neither inflate the total nor drive it negative.
 */
export function injectLinkedInRawScore(parsed: Record<string, unknown>): void {
  const sections = parsed.sectionBreakdown;
  if (!Array.isArray(sections)) return;
  const normalizable = (sections as Record<string, unknown>[]).map((s) => {
    const maxScore = Number(s.maxScore);
    // Server-owned ceiling (CR-01). An off-catalogue name contributes 0 — it
    // fails linkedInGradeSchema afterwards regardless. Rounding mirrors the
    // schema .transform (WR-01: integer per-section scores).
    const catalogueMax = LINKEDIN_MAX_BY_NAME.get(String(s.name)) ?? 0;
    const score = Math.round(Math.min(catalogueMax, Math.max(0, Number(s.score))));
    s.score = score;
    return { applicable: s.applicable === true, maxScore, score };
  });
  parsed.rawScore = normalizeFromSections(normalizable);
}

/**
 * THE single validation source of truth for a LinkedIn model response.
 *
 * Parse → inject server-computed rawScore (math-from-sections) → strict
 * `validateModelOutput` seam (linkedInGradeSchema shape + linkedInSemanticCheck
 * total integrity). On a hard parse failure or a shape-less body it hands the RAW
 * text straight to validateModelOutput so it reaches a TYPED error — never a
 * fabricated body, never a 200-with-invalid-content (LIFE-07 / v5.0). This is the
 * exact step the shared analysis-lifecycle executor performs, factored out so the
 * legacy/merit-dormant fallback paths converge onto identical behavior.
 */
export function validateLinkedInModelResponse(rawText: string): LlmValidationResult<LinkedInGrade> {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = parseAiResponse(rawText) as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.sectionBreakdown)) {
    // Unparseable / shape-less → let validateModelOutput classify + reject the raw text.
    return validateModelOutput(rawText, linkedInGradeSchema, { semanticCheck: linkedInSemanticCheck });
  }
  injectLinkedInRawScore(parsed);
  return validateModelOutput(
    JSON.stringify(parsed),
    linkedInGradeSchema,
    { semanticCheck: linkedInSemanticCheck },
  );
}

/**
 * supabase/functions/recruiting-lens/schema.ts
 *
 * Zod mirror of `RecruitingLensOutput` (_shared/recruiting-lens-merger.ts:24) —
 * the strict output validator the shared analysis-lifecycle executor passes to
 * `validateModelOutput` (LIFE-07 / Phase 04 · 04-01 · D-06).
 *
 * PURPOSE (byte-preserve, RESEARCH Open-Question 5): this schema's ONLY job is to
 * reject a GENUINELY malformed merger output (missing/ill-typed required product
 * fields) while ACCEPTING every field the merger currently emits — including the
 * tier-shaped Pro subset produced by `applyRecruitingLensTierShape` (which STRIPS
 * strategicAdvice / keywords / quickFixes / roadmap / scoreRationale /
 * linkedinImprovements and caps topGaps + resumeEdits). It does NOT reshape,
 * re-derive, or narrow the product path — validation WRAPS an unchanged output.
 *
 * DESIGN (D-06 lenient/passthrough):
 *   - Root and every nested object use `.passthrough()` so extra merger-emitted
 *     keys (`analysisId`, `metadata`, `_meta`, tier-shaped remnants) are NEVER
 *     dropped or rejected.
 *   - Only the fields GUARANTEED present in BOTH the Elite and Pro shaped outputs
 *     are hard-required: overallMatch{score 0-100, label, summary}, recruiterVerdict
 *     (non-empty), topGaps (>= 1, each with a title). Everything the Pro shaper can
 *     strip is `.optional()`.
 *   - The optional rl-call-3 fields mirror the prompt's hard count/string bounds.
 *     Output outside that generation contract is genuinely malformed and is rejected
 *     without transforms, slicing, or post-generation truncation.
 *   - strategicAdvice is `.optional()` (Pro strips it) BUT, WHEN PRESENT, must carry
 *     a non-empty summary + biggestScoreMover — so a malformed body that includes a
 *     truncated strategicAdvice object is still rejected.
 *
 * No new dependency: zod is already the repo-wide runtime pin (3.25.76).
 */
import { z } from "https://esm.sh/zod@3.25.76";

// A sub-score entry: score required; rationale is Pro-stripped, so optional.
const subScoreSchema = z
  .object({
    score: z.number(),
    rationale: z.string().optional(),
  })
  .passthrough();

// A single gap: title is the one stable anchor; severity/whyItMatters are present
// in both tiers but kept lenient; howItShowsUp/fixPriority are Pro-stripped.
const topGapSchema = z
  .object({
    title: z.string().min(1),
  })
  .passthrough();

const qualityGatesSchema = z
  .object({
    jdVocab: z.boolean(),
    achievementTransform: z.boolean(),
    signalDensity: z.boolean(),
    jdTargeting: z.boolean(),
    pasteReady: z.boolean(),
  })
  .passthrough();

const resumeEditSchema = z
  .object({
    original: z.string().max(240).nullable().optional(),
    rewritten: z.string().min(1).max(280),
    qualityGates: qualityGatesSchema,
  })
  .passthrough();

const linkedinImprovementSchema = z
  .object({
    area: z.string().min(1),
    suggestion: z.string().min(1).max(280),
  })
  .passthrough();

const keywordSchema = z.string().min(1).max(80);

export const recruitingLensOutputSchema = z
  .object({
    // ── Hard-required (present in BOTH Elite and the Pro tier-shaped subset) ──
    overallMatch: z
      .object({
        score: z.number().min(0).max(100),
        label: z.string().min(1),
        summary: z.string().min(1),
      })
      .passthrough(),
    recruiterVerdict: z.string().min(1),
    topGaps: z.array(topGapSchema).min(1),

    // ── Tier-shaped-optional (Pro may strip or cap these) ──
    preAnalysis: z.object({}).passthrough().optional(),
    subScores: z.record(subScoreSchema).optional(),
    scoreRationale: z.array(z.unknown()).optional(),
    roadmap: z.array(z.unknown()).optional(),
    resumeEdits: z.array(resumeEditSchema).min(1).max(8).optional(),
    linkedinImprovements: z
      .array(linkedinImprovementSchema)
      .max(6)
      .optional(),
    strategicAdvice: z
      .object({
        summary: z.string().min(1),
        biggestScoreMover: z.string().min(1),
        applyNow: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    keywords: z
      .object({
        matched: z.array(keywordSchema).max(10),
        missing: z.array(keywordSchema).max(10),
      })
      .passthrough()
      .optional(),
    quickFixes: z.array(z.string().min(1).max(240)).max(5).optional(),
    _meta: z.object({}).passthrough().optional(),
  })
  .passthrough();

export type RecruitingLensOutputParsed = z.infer<typeof recruitingLensOutputSchema>;

/**
 * supabase/functions/analyze-resume/resume-validation.ts
 *
 * Phase 05 · 05-01 · FEAT-01 / FEAT-02 — the SHARED resume validation seam.
 *
 * A PERMISSIVE zod schema + a semantic quality-floor check that plug into the
 * strict, no-masking `_shared/llm-validation.ts` contract (the same seam
 * grade-linkedin uses via `linkedInGradeSchema` + `linkedInSemanticCheck`). It is
 * imported by BOTH the onboarding executor (`analyze-resume/index.ts`, 05-01) AND
 * the streaming wrapper (05-02).
 *
 * PRESERVE-EXACTLY CONTRACT (D-09 / D-10):
 *   - The schema is deliberately PERMISSIVE and `.passthrough()` — it requires only
 *     `overallScore: number` and a non-empty `criterionFeedback | criteria` array,
 *     and passes EVERY other field through UNTOUCHED (no field loss, no coercion).
 *     The validated value is written verbatim to `resumes.grading_data`, so a
 *     currently-valid Free/Pro/Elite SUCCESS output validates BYTE-IDENTICALLY.
 *   - `resumeSemanticCheck` MIRRORS the existing `passesQualityFloor`
 *     (`index.ts`) EXACTLY (empty-criteria / all-zero / all-identical → reject).
 *     Because it is byte-faithful to the floor the Free path already enforces, it
 *     can NEVER reject an output the current lenient path accepts.
 *   - CONTRACT: validate the FINAL ASSEMBLED object (post
 *     `repairTruncatedJSON` / `reconcileScore` / `applyTierShape`), NEVER the raw
 *     model text and NEVER the in-flight SSE partials. Because the object already
 *     parses cleanly, `needsStructuralRepair` (llm-validation.ts) cannot
 *     false-fail a success the Free path repairs-and-accepts (the D-10 collision
 *     spot). Strict validation therefore changes FAILURE handling only: a
 *     genuinely malformed / empty / truncated result reaches a typed terminal +
 *     safe Merit refund instead of rendering garbage.
 */
import { z } from 'https://esm.sh/zod@3.25.76';

const nonEmptyString = z.string().trim().min(1);
const eliteFeedbackSchema = z.object({
  observation: nonEmptyString,
  impact: nonEmptyString,
  fix: nonEmptyString,
  deeper: nonEmptyString.optional(),
  rewrite: nonEmptyString.optional(),
}).strict();

const eliteRewriteSchema = z.object({
  criterionId: nonEmptyString,
  title: nonEmptyString,
  originalText: nonEmptyString,
  issues: z.array(nonEmptyString).min(1),
  improvedText: nonEmptyString,
  impact: nonEmptyString,
  potentialScoreIncrease: z.number().finite(),
}).strict();

/**
 * Narrow pre-merge schema for the `elite_unlock` model delta. `.strict()` is
 * intentional: protected full-result fields must fail before the merger or any
 * persistence seam. Semantic requested-path checks remain in
 * `validateEliteUnlockPatch`.
 */
export const eliteUnlockPatchSchema = z.object({
  criterionFeedback: z.array(z.object({
    id: nonEmptyString,
    feedback: eliteFeedbackSchema,
  }).strict()).min(1).optional(),
  priorityImprovements: z.array(nonEmptyString).min(1).optional(),
  rewriteSuggestions: z.array(eliteRewriteSchema).min(1).optional(),
  industryGuess: nonEmptyString.optional(),
  suggestedTargetRoles: z.array(nonEmptyString).min(1).optional(),
  recommendedKeywords: z.array(nonEmptyString).min(1).optional(),
  eliteInsights: z.record(z.unknown()).refine(
    (value) => Object.keys(value).length > 0,
    'eliteInsights must not be empty',
  ).optional(),
}).strict();

export type EliteUnlockPatchResult = z.infer<typeof eliteUnlockPatchSchema>;

/**
 * Permissive resume-analysis schema. Required: `overallScore: number` + a
 * non-empty `criterionFeedback | criteria` array. Everything else `.passthrough()`
 * — extras are preserved so the saved `grading_data` stays byte-identical to the
 * current Free/Pro/Elite output (D-09). The `.superRefine` enforces the non-empty
 * criteria requirement WITHOUT transforming the value (no field loss).
 */
export const resumeAnalysisSchema = z
  .object({
    overallScore: z.number(),
  })
  .passthrough()
  .superRefine((val, ctx) => {
    const record = val as Record<string, unknown>;
    const cf = record.criterionFeedback;
    const cr = record.criteria;
    const arr = Array.isArray(cf) ? cf : Array.isArray(cr) ? cr : [];
    if (arr.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'criterionFeedback or criteria must be a non-empty array',
        path: ['criterionFeedback'],
      });
    }
  });

export type ResumeAnalysisResult = z.infer<typeof resumeAnalysisSchema>;

/**
 * Feature-specific semantic check — a BYTE-FAITHFUL mirror of `passesQualityFloor`
 * (`analyze-resume/index.ts`). Rejects degenerate output: empty criteria, all-zero
 * scores (model didn't score), or all-identical scores (model was lazy). Returns
 * `{ ok: true }` for anything the current Free quality floor accepts, so it cannot
 * reject a currently-valid success (D-10). Runs AFTER the schema, on the typed,
 * already-assembled result object.
 */
export function resumeSemanticCheck(
  value: ResumeAnalysisResult,
): { ok: true } | { ok: false; detail: string } {
  const record = value as Record<string, unknown>;
  // `||`-fallback (not `??`) — byte-faithful to passesQualityFloor's chain.
  const criteria = (record.criterionFeedback || record.criteria || []) as Array<{ score?: number }>;

  if (criteria.length === 0) {
    return { ok: false, detail: 'criterion feedback is empty' };
  }

  const scores = criteria.map((c) => Number(c.score) || 0);

  // All zero = the model did not actually score anything.
  if (scores.every((s) => s === 0)) {
    return { ok: false, detail: 'all criterion scores are zero' };
  }

  // All identical = the model was lazy (e.g. every score is 50).
  if (scores.every((s) => s === scores[0])) {
    return { ok: false, detail: 'all criterion scores are identical' };
  }

  return { ok: true };
}

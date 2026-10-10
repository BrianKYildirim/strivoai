/**
 * supabase/functions/_shared/career-validation.ts
 *
 * Phase 06 · 06-01 · FEAT-05 — the SHARED Career Compass validation seam.
 *
 * A PERMISSIVE zod schema + a semantic core-completeness check that plug into the
 * strict, no-masking `_shared/llm-validation.ts` contract (the same seam
 * `analyze-resume` uses via `resumeAnalysisSchema` + `resumeSemanticCheck`, and
 * `grade-linkedin` via `linkedInGradeSchema` + `linkedInSemanticCheck`). It is
 * imported by BOTH the Task-3 `analyze-career` executor adoption AND the 06-03
 * runtime-validation-convergence guard.
 *
 * PRESERVE-EXACTLY CONTRACT (D-07 / D-08):
 *   - The schema is deliberately PERMISSIVE and `.passthrough()` — it requires only
 *     the CORE save-blocking structures (a non-empty `careerDNA` string + a
 *     non-empty `careerFields` array) and passes EVERY other field through
 *     UNTOUCHED (no field loss, no coercion). The validated value is written
 *     verbatim to `analysis_results.raw_response`, so a currently-valid
 *     Free/Pro/Elite SUCCESS output validates BYTE-IDENTICALLY.
 *   - Elite `compensationIntelligence` is OPTIONAL (`.passthrough()` carries it when
 *     present; its ABSENCE never fails validation) — elite extras stay non-fatal
 *     (D-08). A saved core with a missing/failed `compensationIntelligence` remains
 *     valid.
 *   - `careerSemanticCheck` mirrors the non-empty-array invariants that
 *     `assertCareerOutputComplete` (`analyze-career/index.ts`) enforces, TUNED to the
 *     universal-safe subset so it can NEVER reject an output the career path accepts.
 *
 *     ⚠ STALENESS NOTICE (updated by quick task 260713-hrd) ⚠
 *     The two premises this tuning was originally derived from are BOTH now false, and
 *     they were false *because of bugs*, not by design:
 *       * "The live path runs at `resolvedTier='free'`" — that was RC-1. The internal
 *         worker path resolved EVERY run to 'free' because `requireInternalAuth()`
 *         returns null. Elite users were silently served Free output. FIXED: the tier is
 *         now resolved from the DB on the internal path, so the live path runs at the
 *         user's REAL tier.
 *       * "free tier does not run `assertPaidCareerOutputComplete`" — that early-return
 *         was RC-2's accomplice. Combined with the above, it meant NOTHING was ever
 *         validated, and a truncated stub persisted as a billed success. FIXED:
 *         completeness is now asserted at EVERY tier via a tier-aware required set.
 *
 *     This module's LOGIC is deliberately left unchanged: it is a strict subset of the
 *     (now much stronger) handler-side assertion, so it still cannot false-fail a real
 *     result. It is a backstop, not the primary gate — `assertCareerOutputComplete` is.
 *       * `roadmap`/`roleRoadmaps` stay NOT-required here (Free legitimately has none —
 *         that is the locked Free scope, not a truncation symptom), and
 *         `surpriseFits`/`roles` stay LENIENT here.
 *       * The asserted core intersection that holds across every accepted output is:
 *         `careerFields` non-empty + `careerDNA` non-empty + `roleReadinessBreakdown`
 *         present as an object. These catch a genuinely truncated/garbage/empty core
 *         WITHOUT false-failing a real result.
 *   - CONTRACT: validate the FINAL ASSEMBLED object (post `repairTruncatedJSON` /
 *     `applyCareerTierShape` / `applyCareerCompassFreeOutputPolicy`), NEVER the raw
 *     model text. Because the object already parses cleanly, the llm-validation
 *     truncation guard cannot false-fail a success the Free path repairs-and-accepts.
 *     Strict validation therefore changes FAILURE handling only: a genuinely
 *     malformed / empty / truncated result reaches a typed terminal + safe Merit
 *     refund instead of rendering fabricated guidance (Pitfall 9 / T-06-03).
 */
import { z } from 'https://esm.sh/zod@3.25.76';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Permissive Career Compass schema. Required CORE: a non-empty `careerDNA` string
 * + a non-empty `careerFields` array. Everything else `.passthrough()` — extras
 * (surpriseFits, roles, roleReadinessBreakdown, roadmap, roleRoadmaps, skillGaps,
 * detectedDomain, and the OPTIONAL elite `compensationIntelligence`) are preserved
 * so the saved payload stays byte-identical to the current Free/Pro/Elite output
 * (D-07/D-08). The `.superRefine` enforces the CORE requirement WITHOUT
 * transforming the value (no field loss).
 */
export const careerCompassSchema = z
  .object({})
  .passthrough()
  .superRefine((val, ctx) => {
    const record = val as Record<string, unknown>;

    if (!isNonEmptyString(record.careerDNA)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'careerDNA must be a non-empty string',
        path: ['careerDNA'],
      });
    }

    if (!isNonEmptyArray(record.careerFields)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'careerFields must be a non-empty array',
        path: ['careerFields'],
      });
    }
  });

export type CareerCompassResult = z.infer<typeof careerCompassSchema>;

/**
 * Feature-specific semantic check — a strict SUBSET of the invariants
 * `assertCareerOutputComplete` enforces (260713-hrd renamed it and made it tier-aware and
 * mandatory at every tier). TUNED to the universal-safe subset so it can NEVER reject a
 * valid Free/Pro/Elite success (D-08). Asserts the
 * CORE intersection present in every accepted output: non-empty
 * `careerFields` (Best-Fit Roles / Fields), non-empty `careerDNA`, and a
 * `roleReadinessBreakdown` object (Readiness). Intentionally does NOT require
 * `roadmap`/`roleRoadmaps` (free-policy DELETES them) nor non-empty
 * `surpriseFits`/`roles` (free-policy slicing can yield short/empty arrays the
 * lenient free path already accepts). Runs AFTER the schema, on the typed,
 * already-assembled result object. Returns `{ ok: true }` for anything the current
 * lenient path accepts.
 */
export function careerSemanticCheck(
  value: CareerCompassResult,
): { ok: true } | { ok: false; detail: string } {
  const record = value as Record<string, unknown>;

  if (!isNonEmptyString(record.careerDNA)) {
    return { ok: false, detail: 'careerDNA is empty' };
  }

  if (!isNonEmptyArray(record.careerFields)) {
    return { ok: false, detail: 'careerFields is empty' };
  }

  if (!record.roleReadinessBreakdown || typeof record.roleReadinessBreakdown !== 'object') {
    return { ok: false, detail: 'roleReadinessBreakdown is missing or not an object' };
  }

  return { ok: true };
}

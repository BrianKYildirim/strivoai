// ── LinkedIn Grader — 4-section direct-sum scoring CORE (Phase 08.3-01) ────
//
// This is the deterministic business logic of the LinkedIn scoring redesign: an
// evidence-anchored 4-section rubric (Headline, About, Experience, Search
// Alignment, Skills & Credentials) whose maximums sum to 100 and whose headline
// total is the plain sum of applicable section scores. The model never owns the
// total. It plugs into
// the strict, no-masking `_shared/llm-validation.ts` seam via `linkedInGradeSchema`
// (shape) and `linkedInSemanticCheck` (total integrity, in validation.ts).
//
// Design decisions (08.3):
// - The four fixed maximums are 15 / 15 / 45 / 25, totaling exactly 100.
// - Total: finalScore = Σ score_applicable, with no normalization or rescaling.
// - An `applicable:false` section contributes zero and lowers the achievable ceiling.
// - Bounds-only clamp lives HERE as a per-section `.transform` (belt-and-suspenders
//   defense that must fire rarely); semanticCheck recomputes the total and enforces
//   `rawScore === normalizeFromSections(sections)` (T-04-06, no silent overwrite).
// - Score bands remain Weak <50 / Average 50-69 /
//   Strong 70-84 / Exceptional 85-100.
//
// There is deliberately no default or placeholder score constant in this module.

import { z } from 'https://esm.sh/zod@3.25.76';

// ── Section catalogue (fixed order, 100 points — Phase 08.3) ───────────────
//
// All four sections are core and must always be emitted. Missing content remains
// applicable with an appropriately low score; a section may be inapplicable only
// when explicit evidence makes the whole combined section irrelevant.

export interface LinkedInSectionDef {
  name: string;
  baseMax: number;
  /** `contextual` sections are the ones that may legitimately not apply (D-01). */
  klass: 'core' | 'contextual';
}

export const LINKEDIN_SECTIONS: readonly LinkedInSectionDef[] = [
  { name: 'Headline', baseMax: 15, klass: 'core' },
  { name: 'About', baseMax: 15, klass: 'core' },
  { name: 'Experience', baseMax: 45, klass: 'core' },
  { name: 'Search Alignment, Skills & Credentials', baseMax: 25, klass: 'core' },
] as const;

/** The canonical set of section names the model MUST return exactly once each. */
export const LINKEDIN_SECTION_NAMES: readonly string[] = LINKEDIN_SECTIONS.map((s) => s.name);

/**
 * Catalogue baseMax by section name — the SERVER-owned clamp ceiling. The
 * model-declared `maxScore` is never trusted as a ceiling: it must equal the
 * catalogue value (enforced in the schema superRefine) and every clamp uses
 * this map, so an inflated or negative model maxScore can neither inflate nor
 * deflate the total (CR-01).
 */
export const LINKEDIN_MAX_BY_NAME: ReadonlyMap<string, number> = new Map(
  LINKEDIN_SECTIONS.map((s) => [s.name, s.baseMax]),
);

// ── Direct-sum math (math-from-sections) ──────────────────────────────────

/** Minimal structural shape `normalizeFromSections` needs — decoupled from zod. */
export interface NormalizableSection {
  applicable: boolean;
  maxScore: number;
  score: number;
}

/**
 * The server-computed headline total is the plain sum of scores from applicable
 * sections. Non-applicable sections contribute zero and do not trigger rescaling,
 * so they lower the achievable ceiling. Returns an integer from 0 to 100.
 * The model never sets this number — it is recomputed here and enforced by
 * `linkedInSemanticCheck`.
 */
export function normalizeFromSections(sections: readonly NormalizableSection[]): number {
  return Math.round(
    sections.reduce((total, section) => (
      section.applicable ? total + section.score : total
    ), 0),
  );
}

// ── Recalibrated score bands (D-03) ──────────────────────────────────────────

export const LINKEDIN_SCORE_BANDS = [
  { band: 'weak', min: 0, max: 49, label: 'Needs Work' },
  { band: 'average', min: 50, max: 69, label: 'Average' },
  { band: 'strong', min: 70, max: 84, label: 'Strong' },
  { band: 'exceptional', min: 85, max: 100, label: 'Exceptional' },
] as const;

export type ScoreBand = typeof LINKEDIN_SCORE_BANDS[number]['band'];

/** Maps the direct 0-100 total onto its score band. */
export function scoreBand(total: number): ScoreBand {
  for (const b of LINKEDIN_SCORE_BANDS) {
    if (total >= b.min && total <= b.max) return b.band;
  }
  return total < LINKEDIN_SCORE_BANDS[0].min ? 'weak' : 'exceptional';
}

// ── Zod schema (strict shape + per-section bounds-only clamp) ────────────────
//
// No `.default()` on any required field: a missing section or a missing
// per-section field is a hard parse failure, never silently coerced to a default
// (Pitfall 9 / T-04-07). The only mutation is the bounds-only `.transform` clamp
// on `score`, which is a rarely-firing out-of-range defense (T-04-08).

const sectionSchema = z
  .object({
    name: z.string().min(1),
    applicable: z.boolean(),
    maxScore: z.number(),
    score: z.number(),
    evidence: z.string().min(1),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    improvements: z.array(z.string()),
  })
  .transform((s) => {
    // Bounds-only clamp: round to an integer (WR-01 — spec: "Every score must
    // be an integer") and keep score within [0, CATALOGUE max]. The ceiling is
    // the server-owned catalogue value, NEVER the model-declared maxScore
    // (CR-01: an inflated/negative maxScore must not move the ceiling). An
    // unknown section name has no catalogue max and fails the superRefine
    // below anyway; clamp it to 0 so no off-catalogue points can contribute.
    const catalogueMax = LINKEDIN_MAX_BY_NAME.get(s.name) ?? 0;
    return { ...s, score: Math.round(Math.min(catalogueMax, Math.max(0, s.score))) };
  });

const topFixSchema = z.object({
  title: z.string().min(1),
  currentText: z.string(),
  suggestedFix: z.string().min(1),
  whyItWorks: z.string().min(1),
  pointsGain: z.string().min(1),
  priority: z.number(),
});

export const linkedInGradeSchema = z.object({
  // The model reports rawScore, but semanticCheck (validation.ts) enforces it
  // equals normalizeFromSections(sectionBreakdown) — the model never owns it.
  rawScore: z.number(),
  scoreJustification: z.string().min(1),
  nextBestAction: z.object({
    action: z.string().min(1),
    reason: z.string().min(1),
    expectedImpact: z.string().min(1),
  }),
  sectionBreakdown: z
    .array(sectionSchema)
    .length(4)
    .superRefine((secs, ctx) => {
      // WR-02: positional check — the spec requires exactly the four catalogue
      // sections IN CATALOGUE ORDER, so compare index-by-index (this subsumes
      // the former name-set membership check: a missing, renamed, duplicated,
      // or out-of-order section all fail here).
      LINKEDIN_SECTIONS.forEach((def, i) => {
        const s = secs[i];
        if (s?.name !== def.name) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `section ${i} must be "${def.name}"${s ? ` (got "${s.name}")` : ''}`,
            path: [i, 'name'],
          });
          return; // name is wrong: the positional maxScore pin is meaningless
        }
        // CR-01: pin the model-declared maxScore to the catalogue value. A
        // wrong maxScore is a hard parse failure (retry-once path), never a
        // silently accepted alternate ceiling.
        if (s.maxScore !== def.baseMax) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `section ${def.name}: maxScore ${s.maxScore} != required ${def.baseMax}`,
            path: [i, 'maxScore'],
          });
        }
      });
    }),
  topFixes: z.array(topFixSchema).min(1),
  keyStrengths: z.array(z.string().min(1)).min(1),
});

export type LinkedInGrade = z.infer<typeof linkedInGradeSchema>;
export type LinkedInSection = LinkedInGrade['sectionBreakdown'][number];

---
phase: 04-feature-migration-a-recruiting-lens-linkedin-grader
plan: 02
subsystem: api
tags: [linkedin-grader, zod, scoring, deno, edge-functions, llm-validation]

# Dependency graph
requires:
  - phase: 03-shared-analysis-lifecycle-substrate
    provides: "_shared/llm-validation.ts strict no-masking validator seam (schema + semanticCheck hook)"
provides:
  - "grade-linkedin/schema.ts — 11-section context-aware-max zod schema, normalizeFromSections (math-from-sections total), scoreBand + LINKEDIN_SCORE_BANDS recalibrated cutoffs, LINKEDIN_SECTIONS weighting"
  - "grade-linkedin/validation.ts — linkedInSemanticCheck enforcing rawScore === normalizeFromSections (no silent overwrite)"
  - "36-test unit suite proving normalization math, D-01 context-aware max, D-04 honest-low, bounds-only clamp, and the four-band distribution (VER-03 math proof)"
affects:
  - "04-03 (prompts.ts rewrite → 11-section output shape)"
  - "04-04 (grade-linkedin/index.ts migration → wires linkedInGradeSchema + linkedInSemanticCheck via validateModelOutput; retires legacy validateLinkedInGrade)"
  - "04-05 (LinkedInGrader.tsx → dynamic 11-section render + recalibrated bands)"
  - "04-06 (distribution / fixed-source-guard / idempotency tests + deno.json registration)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Context-aware max normalization: round(100 × Σ score_applicable / Σ max_applicable) — non-applicable sections drop from BOTH sums"
    - "Bounds-only clamp as a per-section zod .transform (rarely-firing out-of-range defense), not a pre-parse mutation"
    - "semanticCheck integrity gate: recompute the total server-side and reject a mismatched model rawScore (never overwrite it)"

key-files:
  created:
    - supabase/functions/grade-linkedin/schema.ts
  modified:
    - supabase/functions/grade-linkedin/validation.ts
    - supabase/functions/grade-linkedin/validation.test.ts

key-decisions:
  - "Section weighting (sum 100): Experience 18 · Recruiter discoverability 12 · Headline/About/Skills 11 each · Career positioning 9 · Completeness 8 · Achievements/Projects 6 · Education/Certifications 4 (contextual = the sections that may be applicable:false)"
  - "Recalibrated bands (D-03, to be CONFIRMED by VER-03 in 04-06): Weak <50 / Average 50-69 / Strong 70-84 / Exceptional 85-100"
  - "Additive migration: the new 11-section core ships ALONGSIDE the legacy 4-section validateLinkedInGrade; the legacy path is deleted when index.ts is migrated in 04-04 (index.ts is out of this plan's files_modified scope). Keeps verify:baseline green."

patterns-established:
  - "Math-from-sections + context-aware max: the model never invents the headline number; the total is recomputed and enforced server-side"
  - "Four-band distribution proven deterministically by unit fixtures (no LLM, no temperature dependence) — the anti-clustering proof for VER-03"

requirements-completed: [FEAT-03, VER-03]

# Metrics
duration: 5min
completed: 2026-07-02
---

# Phase 04 Plan 02: 11-Section Context-Aware LinkedIn Scoring Core Summary

**Rebuilt LinkedIn scoring as an 11-section evidence-anchored rubric whose headline total is computed server-side via context-aware-max normalization (a non-applicable section drops its max from the denominator; an applicable-but-absent section drags the total down honestly), with a bounds-only zod-transform clamp and a semanticCheck that rejects any model-invented total — proven to separate weak/average/strong/exceptional into four distinct bands with no ~52 clustering.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-02T21:00:55Z
- **Completed:** 2026-07-02T21:06:11Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- **`schema.ts` (new):** the deterministic scoring core —
  - `LINKEDIN_SECTIONS` — 11 evidence-anchored sections with base maxes summing to 100, classed `core` / `contextual`.
  - `linkedInGradeSchema` — strict zod shape (top-level `rawScore`/`scoreJustification`/`nextBestAction`/`sectionBreakdown[11]`/`topFixes`/`keyStrengths`; each section `{ name, applicable, maxScore, score, evidence, strengths[], weaknesses[], improvements[] }`). No `.default()` anywhere — a missing section, a missing canonical section name, or a missing per-section field is a hard parse failure (Pitfall 9 / T-04-07). The only mutation is a per-section **bounds-only `.transform` clamp** on `score` (T-04-08).
  - `normalizeFromSections()` — `round(100 × Σ score_applicable / Σ max_applicable)`; context-aware max (D-01) + honest-low (D-04) fall out of the one formula; divide-by-zero guarded.
  - `LINKEDIN_SCORE_BANDS` + `scoreBand()` — recalibrated cutoffs (D-03), a single exported constant reusable by frontend + tests.
- **`validation.ts`:** added `linkedInSemanticCheck(value)` — recomputes the total from the clamped applicable sections and enforces `rawScore === normalizeFromSections(...)`, returning `{ok:false;detail}` on mismatch (feeds `SCHEMA_VALIDATION_FAILED`; the model never owns the headline number — T-04-06). Legacy 4-section validator/clamp retained unchanged for `index.ts`.
- **`validation.test.ts`:** 22 new unit tests (36 total with the retained legacy suite) proving the normalization math, D-01 vs D-04, the schema clamp, semanticCheck accept/reject, strict shape, and the **four-band distribution** (fixtures normalize to 34/65/79/93 → weak/average/strong/exceptional, none in the 48–58 window, pairwise gaps ≥ 10).

## Verification

- `deno test --allow-all --no-check grade-linkedin/validation.test.ts` → **36 passed / 0 failed**.
- Regression: retained legacy grade-linkedin suite (phase22-contract, entitlement, free-scan, handler-config, strip, refund-after-save, prompts) → **62 passed / 0 failed** (legacy `validateLinkedInGrade` path intact for `index.ts`).
- `schema.ts` type-checks clean (`deno check`); no numeric-anchor / calibration-range / placeholder-or-default **score** constant present (FEAT-03) — only structural section weights and band cutoffs.
- Four-band fixtures land in four distinct bands, none in 48–58 (VER-03 math proof, no LLM).

## Deviations from Plan

**1. [Rule: Scope Boundary] Legacy 4-section validator retained instead of deleted**
- **Issue:** The plan's implementation note says to delete the 4-section `EXPECTED_SECTIONS` map and the Free/Pro `topFixes` tier restrictions from `validation.ts`. However, `grade-linkedin/index.ts` (NOT in this plan's `files_modified`; owned by plan **04-04**, wave 2) still imports and depends on `validateLinkedInGrade` + `clampLinkedInSectionScores`, and those are registered in `deno.json test:ci`.
- **Resolution:** Delivered the new 11-section core **additively** — `schema.ts` + `linkedInSemanticCheck` ship alongside the legacy path, which is retained until `index.ts` is migrated onto the lifecycle in 04-04. This keeps `verify:baseline` green and honors the plan's `files_modified` scope (3 files, not `index.ts`). The plan's `must_haves` (schema.ts with `normalizeFromSections` + context-aware max; validation.ts containing `semanticCheck`; validation.test.ts containing `normalizeFromSections` tests + four bands) are fully satisfied.
- **Files:** `supabase/functions/grade-linkedin/validation.ts` (additive), no change to `index.ts`.
- **Commit:** 2ce8575b

**2. [Rule 1 — Bug] Type-clean projection in `linkedInSemanticCheck`**
- **Found during:** Task 2 (`deno check`).
- **Issue:** zod's `.transform` + `.superRefine` combination widens the inferred `sectionBreakdown` element fields to optional, so passing it directly to the strict `NormalizableSection`-typed `normalizeFromSections` failed strict type-check.
- **Fix:** `linkedInSemanticCheck` maps to the normalizer's structural shape (`applicable === true`, `Number(maxScore)`, `Number(score)`) — runtime-guaranteed by the schema, type-clean under `deno check`.
- **Commit:** 2ce8575b

## Deferred / Out-of-Scope Notes

- **Environmental (not a code defect):** running `deno check` from `supabase/functions/` surfaces `TS5095`/`TS5109` (`module: bundler`/`NodeNext` from the frontend root `tsconfig`). This affects unmodified siblings identically (e.g. `_shared/llm-validation.ts`) and is why `test:ci` runs `--no-check`. Not caused by this plan; no action taken.
- **Downstream wiring (by design):** `prompts.ts` must be rewritten to emit the 11-section shape (04-03); `index.ts` must call `validateModelOutput(raw, linkedInGradeSchema, { semanticCheck: linkedInSemanticCheck })`, retire the legacy validator, remove `prior_grade_id` from the cache key, and drop follow-up context (04-04); the frontend must render 11 dynamic sections + recalibrated bands (04-05); the distribution / fixed-source-guard / idempotency tests + `deno.json` registration land in 04-06.

## Self-Check: PASSED

- `schema.ts`, `validation.ts`, `validation.test.ts`, `04-02-SUMMARY.md` — all present.
- Commits `96c46a91` (RED), `2ce8575b` (GREEN) — both in history.

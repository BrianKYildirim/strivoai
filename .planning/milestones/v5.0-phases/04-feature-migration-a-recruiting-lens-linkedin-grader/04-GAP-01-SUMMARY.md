---
phase: 04-feature-migration-a-recruiting-lens-linkedin-grader
gap: 04-GAP-01
subsystem: grade-linkedin
tags: [FEAT-03, FEAT-04, VER-03, gap-closure, validation-convergence]
requires: [04-02, 04-03, 04-04]
provides: [linkedin-grader-functional-all-flag-states]
affects: [supabase/functions/grade-linkedin]
tech-stack:
  patterns: [single-validation-source-of-truth, math-from-sections, strict-no-masking-llm-validation]
key-files:
  modified:
    - supabase/functions/grade-linkedin/index.ts
    - supabase/functions/grade-linkedin/validation.ts
    - supabase/functions/grade-linkedin/validation.test.ts
    - supabase/functions/grade-linkedin/refund-after-save.test.ts
    - supabase/functions/deno.json
  created:
    - supabase/functions/grade-linkedin/__tests__/runtime-validation-convergence.test.ts
  deleted:
    - supabase/functions/grade-linkedin/strip.test.ts
decisions:
  - "All non-lifecycle runtime paths converge onto ONE validator (validateLinkedInModelResponse); the 4-section validateLinkedInGrade is retired, not left dormant."
  - "stripLinkedInFreeTier removed: D-05 (Free==Elite, everything-to-everyone) forbids depth gating; the lifecycle reference path never stripped."
metrics:
  duration: single-session
  completed: 2026-07-03
---

# Phase 4 Gap Closure 04-GAP-01: LinkedIn Grader Runtime Validation Convergence Summary

Converged every non-lifecycle grade-linkedin runtime path onto the same 11-section validation the lifecycle path uses, restoring a business-critical feature that 500'd on every real request in its deployable (flags-off) configuration.

## Root Cause

04-03 rewrote `grade-linkedin/prompts.ts` **in place** (no old/new variant split) so the model ALWAYS emits the new 11-section rubric. 04-04 rewired ONLY the dormant `runAnalysisLifecycle('linkedin')` path onto the matching `linkedInGradeSchema` + `linkedInSemanticCheck`. The two paths that are actually reachable with the live flag configuration (`ANALYSIS_LIFECYCLE_LINKEDIN` off, `MERIT_SYSTEM_ENABLED` off) — `runTieredAiCall` and the pre-merit legacy path — still validated the 11-section model output with the retired 4-section `validateLinkedInGrade()` (whose `EXPECTED_SECTIONS` hard-rejects anything != 4 sections). Result: every real LinkedIn grade failed validation on both AI attempts and returned a 500. Because `prompts.ts` is a single shared module, the "dormant = byte-identical legacy path" invariant the 04-04 SUMMARY claimed did not actually hold — the legacy path's consumer had drifted under it.

## The Convergence

Introduced a single validation source of truth in `validation.ts`:

- `parseAiResponse(rawText)` — moved out of index.ts (fence-strip → JSON.parse → repairTruncatedJSON fallback).
- `injectLinkedInRawScore(parsed)` — clamps each section score to `[0, maxScore]` and sets `rawScore = normalizeFromSections(applicable sections)`. The server computes the total (FEAT-03); the model never emits it.
- `validateLinkedInModelResponse(rawText)` — parse → inject server rawScore → strict `validateModelOutput(linkedInGradeSchema, { semanticCheck: linkedInSemanticCheck })`. On a hard parse failure / shape-less body it hands the RAW text to `validateModelOutput` so it reaches a TYPED error, never a fabricated body (LIFE-07 / v5.0).

All runtime paths now call this one seam:
- `runTieredAiCall` (merit free-scan + withMerits callback) — parse/clamp/validate block replaced; retry-once + `MeritRefundable` refund boundary preserved.
- Pre-merit legacy path — same; retry-once + typed 500 preserved.
- `readLinkedInGradeCache` — cached body validated through the same seam (stale/invalid → cache miss).
- Lifecycle `generate()` — refactored to call `injectLinkedInRawScore` (shares the exact math-from-sections seam, still returns raw text for the executor to validate).

## Obsolete-Helper Reconciliation

- **`validateLinkedInGrade` + `EXPECTED_SECTIONS`** — retired (no path references them; a fail-closed test asserts neither is resurrected).
- **`clampLinkedInSectionScores`** — removed. It was 4-section-specific (keyed on `EXPECTED_SECTIONS`, a no-op on 11-section data) and redundant with `linkedInGradeSchema`'s per-section bounds `.transform` and `injectLinkedInRawScore`'s clamp.
- **`stripLinkedInFreeTier`** — removed (function + its call). It truncated free-tier `topFixes` to one item and stripped per-section feedback. D-05 mandates Free==Elite (everything-to-everyone, no depth gating), and the lifecycle reference path never stripped — so keeping it would violate the product contract, not preserve it. This is a D-05-mandated removal, not a behavior guess.

## Regression Test

`grade-linkedin/__tests__/runtime-validation-convergence.test.ts` (registered in `deno.json` test:ci):
- Drives a realistic full 11-section model response (uneven per-section scores, `Projects` applicable:false, NO model total) through the ACTUAL non-lifecycle seam → asserts success + `rawScore === normalizeFromSections(...)`.
- Asserts a model-supplied bogus total is overridden by the server (FEAT-03).
- Asserts an OLD 4-section payload is now REJECTED (`SCHEMA_VALIDATION_FAILED`) and garbage reaches `MODEL_INVALID_RESPONSE`.
- Fail-closed guard: index.ts references no retired validator/clamp/strip; validation.ts no longer defines them and DOES define the converged validator.

## Deviations from Plan

### Auto-fixed / reconciled (test convergence, no product-behavior change)

1. **[Rule 1 - Bug]** The core fix — see Root Cause / Convergence above. Commit ce7d69a7.
2. **[Test reconciliation] validation.test.ts** — dropped the retired 4-section `validateLinkedInGrade` / `clampLinkedInSectionScores` tests; kept the 11-section schema/normalize/semanticCheck contract tests. The retired functions no longer exist, so their tests were stale.
3. **[Test reconciliation] strip.test.ts deleted** — its subject (`stripLinkedInFreeTier`) was removed under D-05; removed from deno.json.
4. **[Test reconciliation] refund-after-save.test.ts** — the pre-save `MeritRefundable` count assertion was updated 5→4. `runTieredAiCall`'s separate "parse-after-retry" throw merged into the single `validateLinkedInModelResponse` seam, so one throw folded into the "validation-after-retry" throw. All 4 remaining throws are still PRE-save, so the refund boundary (never refund after save) is unchanged — only the count moved. Commit 0fd9fcc4.

None of the above changes product behavior beyond the D-05-mandated strip removal.

## Verification

- `deno task test:ci` (from supabase/functions): **989 passed / 0 failed / 12 ignored** — GREEN.
- `npm run test` (vitest): **495 passed** — GREEN.
- No assertion was weakened to pass; the one stale count assertion was reconciled to the new (still-correct) refund boundary and documented above.
- `deno check` standalone reports the project's known environment-class errors ("Cannot find name 'Deno'", etc.) which is why CI runs `--no-check`; the flagged `usageResult.error` line pre-exists 4× in the committed HEAD and is unrelated to this change.

## Self-Check: PASSED

- Created files exist:
  - `supabase/functions/grade-linkedin/__tests__/runtime-validation-convergence.test.ts` — FOUND
- Deleted files gone:
  - `supabase/functions/grade-linkedin/strip.test.ts` — REMOVED (staged deletion)
- Commits exist:
  - `ce7d69a7` fix(04): converge LinkedIn live+fallback runtime paths onto 11-section validation — FOUND
  - `0fd9fcc4` test(04): regression-lock LinkedIn non-lifecycle 11-section validation convergence — FOUND
- Gap marked resolved in `04-VERIFICATION.md` frontmatter (`status: resolved`, gap `status: resolved` + resolution note) — DONE.

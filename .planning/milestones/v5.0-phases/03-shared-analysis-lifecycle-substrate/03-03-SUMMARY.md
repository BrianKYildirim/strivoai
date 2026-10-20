---
phase: 03-shared-analysis-lifecycle-substrate
plan: 03
subsystem: api
tags: [deno, zod, validation, error-taxonomy, llm, backoff, edge-functions]

# Dependency graph
requires:
  - phase: 01-cross-origin-error-contract-foundation
    provides: "jsonError envelope (_shared/cors.ts:202) that the taxonomy rides"
provides:
  - "_shared/llm-validation.ts — validateModelOutput(): strict no-masking model-output validation (LIFE-07)"
  - "_shared/analysis-error-taxonomy.ts — 13-code AnalysisErrorCode + ANALYSIS_ERROR_TABLE + toAnalysisJsonError (LIFE-08)"
  - "_shared/backoff.ts — shared computeBackoffMs helper (D-03)"
affects: [03-04-executor, 03-05-endpoint, 03-06-reaper, feature-migrations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discriminated-union validation result {ok:true;value} | {ok:false;code;detail}"
    - "Closed error taxonomy table mapping code -> (httpStatus, safeMessage, retryable)"
    - "No-masking posture: every failure branch returns a typed error via a single fail() factory"

key-files:
  created:
    - supabase/functions/_shared/llm-validation.ts
    - supabase/functions/_shared/llm-validation.test.ts
    - supabase/functions/_shared/analysis-error-taxonomy.ts
    - supabase/functions/_shared/analysis-error-taxonomy.test.ts
    - supabase/functions/_shared/backoff.ts
  modified: []

key-decisions:
  - "Truncation is detected (not silently repaired-and-accepted): json-repair is used only to obtain a parse candidate; a body needing structural repair returns MODEL_OUTPUT_TRUNCATED"
  - "SCHEMA_VALIDATION_FAILED detail carries zod field-path + issue-code only (never received values), so the raw model body cannot leak"
  - "retryable=true ONLY for MODEL_TIMEOUT + MODEL_RATE_LIMITED; DATABASE_SAVE_FAILED = false (save past generation is permanent, D-03)"
  - "toAnalysisJsonError drops the internal detail argument — only safeMessage + code + retryable cross to the client (LIFE-08)"
  - "computeBackoffMs promoted by copy; live inline callers left byte-identical (D-04 dormancy)"

patterns-established:
  - "Pattern: single fail() factory routes every validation failure branch — structurally prevents value substitution"
  - "Pattern: type-only import of AnalysisErrorCode into llm-validation keeps it runtime-decoupled from the taxonomy table"

requirements-completed: [LIFE-07, LIFE-08]

# Metrics
duration: 7min
completed: 2026-07-02
---

# Phase 3 Plan 3: Shared Analysis Lifecycle Substrate — Validation, Taxonomy & Backoff Contracts Summary

**Strict no-masking LLM-output validator (typed truncation/empty/schema/semantic failures, never a fabricated value), a closed 13-code error taxonomy riding jsonError with a leak-free safeMessage table, and a shared bounded-backoff helper — all pure, TDD-proven, and touching zero live edge callers.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-02T12:56:48Z
- **Completed:** 2026-07-02T13:03:43Z
- **Tasks:** 3
- **Files modified:** 5 (created)

## Accomplishments
- `validateModelOutput` runs the full LIFE-07 pipeline — wrapper removal → JSON parse → truncation detection → empty/generic detection → zod safeParse → optional semantic hook — returning a discriminated union and NEVER substituting a fixed score, empty object, or generic body (Pitfall 9). Proven by 18 tests including a static single-`ok:true`-return guard and a batch no-fabrication assertion.
- 13-code `AnalysisErrorCode` taxonomy with `ANALYSIS_ERROR_TABLE` (code → httpStatus/safeMessage/retryable) and `toAnalysisJsonError`, which emits only the safe message + machine code + retryable flag and drops any internal detail (LIFE-08). Proven by 8 tests including a no-leak substring guard and a detail-suppression check.
- `_shared/backoff.ts` promotes `computeBackoffMs` (base 1000ms, max 3000ms, +0-400ms jitter) for the 03-04 executor, with the live inline copies deliberately left untouched (D-04 dormancy).

## Task Commits

Each task was committed atomically (TDD tasks are test → feat):

1. **Task 1: llm-validation.ts (LIFE-07)** — `453a419c` (test) → `5d70a31a` (feat)
2. **Task 2: analysis-error-taxonomy.ts (LIFE-08)** — `d3b1d53a` (test) → `fc4781fd` (feat)
3. **Task 3: _shared/backoff.ts (D-03/D-04)** — `495f9544` (feat)

_Plan metadata (SUMMARY/STATE) intentionally NOT committed — see Deviations (CLAUDE.md `.planning/` no-commit rule)._

## Files Created/Modified
- `supabase/functions/_shared/llm-validation.ts` — strict no-masking `validateModelOutput` + `LlmValidationError`
- `supabase/functions/_shared/llm-validation.test.ts` — 18 tests (success/truncation/empty/schema/semantic/no-mask/static-source)
- `supabase/functions/_shared/analysis-error-taxonomy.ts` — `AnalysisErrorCode`, `ANALYSIS_ERROR_TABLE`, `toAnalysisJsonError`
- `supabase/functions/_shared/analysis-error-taxonomy.test.ts` — 8 tests (all-13/shape/retryable-partition/no-leak/detail-suppression)
- `supabase/functions/_shared/backoff.ts` — shared `computeBackoffMs`

## Validation pipeline order (recorded per plan output requirement)
1. Empty/blank → `MODEL_INVALID_RESPONSE`
2. Wrapper removal + `JSON.parse` (via json-repair); unrecoverable → `MODEL_INVALID_RESPONSE`
3. Truncation detection (needed structural repair) → `MODEL_OUTPUT_TRUNCATED`
4. Empty/generic ({}, [], all-null) → `MODEL_INVALID_RESPONSE`
5. `schema.safeParse` (required/type/range) → `SCHEMA_VALIDATION_FAILED` (safe field-path detail)
6. Optional `semanticCheck` → `SCHEMA_VALIDATION_FAILED`
7. Genuine success → `{ ok: true, value }` (the ONLY ok:true return)

## Retryable / permanent partition of the 13 codes (LIFE-06)
- **retryable=true (2):** MODEL_TIMEOUT (504), MODEL_RATE_LIMITED (429)
- **retryable=false (11):** INPUT_MISSING (400), FILE_NOT_FOUND (404), FILE_EXTRACTION_FAILED (422), PROFILE_PARSE_FAILED (422), MERIT_RESERVATION_FAILED (402), MODEL_INVALID_RESPONSE (502), MODEL_OUTPUT_TRUNCATED (502), SCHEMA_VALIDATION_FAILED (502), DATABASE_SAVE_FAILED (500), MERIT_SETTLEMENT_FAILED (500), UNKNOWN_ANALYSIS_ERROR (500)

## No live edge file rewired (confirmed)
`git diff HEAD~5 -- supabase/functions` shows ONLY the 5 new `_shared/` files. The inline `computeBackoffMs` copies in `analyze-resume/index.ts` and `process-resume-analysis-job/index.ts` are byte-identical (D-04 dormancy preserved).

## Decisions Made
See `key-decisions` frontmatter. Most load-bearing: truncation is *detected and rejected* rather than repaired-and-accepted, and the taxonomy detail argument is structurally dropped before the wire.

## Deviations from Plan

None functional — all three tasks executed exactly as written.

**Process note (not a code deviation):** Per the project `CLAUDE.md` rule "Do not commit anything in `.planning/`", the `03-03-SUMMARY.md` and `STATE.md` updates were written to disk and STATE was advanced via gsd-tools, but were NOT git-committed. This overrides the GSD `final_commit` step for this repo. All source-code task commits proceeded normally.

## Issues Encountered
None. `AnalysisErrorCode` is imported into `llm-validation.ts` as a type-only import, so Task 1's tests ran green under `--no-check` before Task 2's taxonomy file existed (runtime-decoupled by construction).

## Follow-up for the phase verification plan
The two new Deno test files (`_shared/llm-validation.test.ts`, `_shared/analysis-error-taxonomy.test.ts`) are NOT yet registered in `supabase/functions/deno.json` `test:ci`. Registration into `verify:baseline` was intentionally left out of this plan's declared file scope (deno.json is a shared file across the parallel Wave-1 plans). The phase-level verification/integration plan should fold both into `test:ci` so they run in the blocking gate.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 03-04 (executor) can import `validateModelOutput`, the taxonomy, and `computeBackoffMs` immediately.
- 03-05 (endpoint) can render failures via `toAnalysisJsonError`.
- Blocker/reminder: register the two test files in `deno.json` test:ci before phase closure.

## Self-Check: PASSED
- All 5 files FOUND on disk.
- All 5 commits FOUND (453a419c, 5d70a31a, d3b1d53a, fc4781fd, 495f9544).
- Both test suites green (26 passed / 0 failed).
- No live edge file modified.

---
*Phase: 03-shared-analysis-lifecycle-substrate*
*Completed: 2026-07-02*

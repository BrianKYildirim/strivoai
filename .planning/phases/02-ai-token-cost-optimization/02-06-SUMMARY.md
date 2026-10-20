---
phase: 02-ai-token-cost-optimization
plan: 06
subsystem: measurement
tags: [telemetry, max-tokens, production-measurement, anthropic, token-cost, ocr]

requires:
  - phase: 02-05
    provides: "Operator-approved TEMP diagnostic caps live across the SC-12 table and locked snapshot"
  - phase: 02-02
    provides: "public.ai_call_telemetry table + recordAiCall service-role write path"
  - phase: 02-03
    provides: "Per-call telemetry labels for Resume Analysis and Career Compass"
  - phase: 02-04
    provides: "Per-call telemetry labels for LinkedIn Grader and Recruiting Lens"
provides:
  - "Complete per-call production output-token dataset for all 21 measurement runs (Epoch 2)"
  - "Every (feature, tier, call) cell has >=3 clean first-attempt samples at the TEMP caps"
  - "TEMP cap raise #2 (summary 8000->10000, elite-extras 4000->9000, rl-call-1 9000->12000) applied in lockstep"
  - "Resolved RESEARCH assumptions A1 (input_tokens excludes cache tokens) and A4 (Claude Haiku 4.5, no override)"
  - "Two open cells (resume/elite summary + elite-extras) with operator-approved accept+self-heal disposition for 02-08"
affects: [02-07-measurement-report, 02-08-approved-caps, 02-09-final-cap-implementation]

tech-stack:
  added: []
  patterns:
    - "Measurement epochs: a hard created_at cutoff isolates a fresh dataset from prior contaminated runs"
    - "A truncated first-attempt row means appetite >= cap; the cell's true peak is UNKNOWN and cannot be right-sized down to its clean-run peak"
    - "Cache variant bumped in lockstep with a cap change so re-runs cannot serve a telemetry-free cached result"

key-files:
  created:
    - .planning/phases/02-ai-token-cost-optimization/02-06-SUMMARY.md
  modified:
    - .planning/phases/02-ai-token-cost-optimization/02-MEASUREMENT-LOG.md
    - src/config/pricing-config.ts
    - src/config/pricing-config.snapshot.ts
    - src/config/__tests__/sc12-snapshot.test.ts
    - supabase/functions/analyze-resume/index.ts
    - supabase/functions/analyze-resume/index.test.ts
    - supabase/functions/recruiting-lens/index.ts
    - supabase/functions/ocr-pdf/index.ts
    - supabase/functions/ocr-pdf/index.test.ts

key-decisions:
  - "Operator restarted measurement (Epoch 2, cutoff 2026-07-24T13:46:58Z); Epoch 1 rows retained as history, none credited"
  - "TEMP cap raise #2 applied when the first sweep read three cells back as ceilings not appetites"
  - "resume/elite summary + elite-extras still truncated once at the raised caps; operator chose accept+self-heal (rely on the existing attempt-2 retry at the 12000 clamp) over a raise #3 + rerun"
  - "ocr-pdf reuse short-circuit now persists the reused extraction onto the new resumes row (prod Career Compass INPUT_MISSING fix)"

patterns-established:
  - "Measurement epoch isolation via a created_at cutoff baked into every verification query"
  - "Truncation-aware coverage: a cell needs 3 CLEAN (untruncated, attempt-1, ok) samples, and a truncated 4th sample raises the appetite floor above the clean peak"

requirements-completed: [TOK-03, TOK-04]

duration: multi-session (operator-paced production runs)
completed: 2026-07-26
---

# Phase 02 Plan 06: Production Measurement Summary

**A complete, epoch-isolated per-call output-token dataset for all 21 production runs at the TEMP diagnostic caps — every (feature, tier, call) cell has >=3 clean first-attempt samples, with two elite resume cells whose appetite exceeds even the raised caps flagged (operator-approved accept+self-heal) for the 02-08 cap decision.**

## Performance

- **Duration:** Multi-session, operator-paced (production runs are human-executed)
- **Completed:** 2026-07-26
- **Tasks:** 4/4 (Task 1 runbook, Task 2 operator deploy, Task 3 operator runs, Task 4 reconciliation)
- **Measurement runs:** 21 matrix cells + several over-samples; Epoch 2 (cutoff 2026-07-24T13:46:58Z)

## Accomplishments

- **Full dataset.** All 21 matrix runs executed on production through the real UI across 3 free + 3 elite accounts, including Recruiting Lens with lengthy job descriptions. Every (feature, tier, call) cell holds >=3 clean first-attempt (`attempt=1 and ok and not truncated`) samples.
- **TEMP cap raise #2 (mid-plan).** The first sweep truncated `resume/elite elite-extras` 6/6 at 4000, `resume/elite summary` 1/9 at 8000, and `recruiting_lens rl-call-1` 1/5 at 9000 — reading caps back as ceilings. Applied in lockstep across all six cap/snapshot/test/edge files: summary 8000->10000, elite-extras 4000->9000, rl-call-1 9000->12000 (== ABSOLUTE_MAX_TOKENS); ceilings resumeAnalysis 34000->41000, recruitingLens 27000->30000, SC-12 tier sums 104000->114000. `RECRUITING_LENS_CACHE_VARIANT` bumped v37-04->v37-05 in lockstep.
- **rl-call-1 resolved.** After the raise it peaked 10,955 at cap 12,000 on the densest JD with zero truncation.
- **Two cells still open.** `resume/elite summary` (truncated 1/4 at 10000) and `elite-extras` (truncated 1/4 at 9000) demonstrate appetite >= their raised caps; true peak unknown. Operator decision (2026-07-26): **accept + self-heal** — analyze-resume already runs a validation-aware attempt-2 retry at the 12000 clamp (observed live in run 10), so 02-08 sets these two final caps at/near 12000 with the retry as the documented safety net rather than spending a raise #3 + rerun cycle that cannot measure above the 12000 hard clamp.
- **Assumptions resolved.** A1: `input_tokens` excludes cache tokens (LinkedIn elite rows show input_tokens 1,323/1,450 vs cache_creation 4,647 on the same row) — price input as the sum of the three token columns. A4: model is `claude-haiku-4-5-20251001` on every row, no env override.

## Deviations from plan

- **Operator restarted the measurement (Epoch 2).** The plan assumed a single measurement pass. A hard `created_at >= 2026-07-24T13:46:58Z` cutoff isolates the clean dataset; all Epoch 1 rows (including the earlier provenance ledger) are retained as history and none are credited.
- **Two production defects surfaced and were fixed mid-measurement (both outside 02-06's declared file set, both money-safe — every failed run refunded, ledger-verified by deduction_id):**
  - `ocr-pdf` reuse short-circuit did not persist the reused extraction onto a newly-minted resumes row, so a same-file re-upload left `extracted_text` empty and Career Compass 400'd (`INPUT_MISSING`) permanently. Fixed in `ocr-pdf/index.ts` + a static guard test (commit `1e3b6589`); an operator SQL backfill unblocked the one affected run. The deployed persist-on-reuse path is NOT yet live-exercised (evidence is the guard test + deploy).
  - The elite streaming client hangs at 95% during a long server-side validation retry even though the run completes, settles the Merit, and persists the result — a UX defect logged as a `/gsd-debug` candidate, not a measurement failure.

## Wall-clock findings (for the 02-07 report)

- Resume FREE hit the ~50s provider wall on 3 requests (all 408, all refunded with persisted handles). Dense free resume input is the risk; clean free runs completed 37-47s.
- The raised caps extend dense-input wall-clock: longest successful calls were rl-call-1 100,935 ms, summary 96,823 ms, elite-extras 85,581 ms — all under the Edge ceiling. A report caveat.

## Open items handed forward

- **02-07 (report):** derive per-call cost from this dataset; input cost = sum of the three token columns (A1). Record the wall-clock discontinuity and the Phase 01.1 Recruiting Lens re-baseline.
- **02-08 (approved caps):** decide every final cap cell. summary + elite-extras carry the accept+self-heal disposition (final caps at/near 12000). Every other cell has clean, comfortable peaks to right-size DOWN from.
- **Non-blocking:** two zombie `retrying` free resume jobs (refunded, money-safe) could emit stray free-single telemetry if the worker ever picks them up — check job ids before crediting any late free row. `/gsd-debug` candidate for the 95% streaming hang.

---
phase: 02-ai-token-cost-optimization
plan: 07
subsystem: measurement
tags: [telemetry, max-tokens, token-cost, anthropic, output-shape, recommendation]

requires:
  - phase: 02-06
    provides: "Complete epoch-isolated per-call output-token dataset (21 runs, Epoch 2) with A1/A4 resolved and two open cells flagged"
  - phase: 02-02
    provides: "public.ai_call_telemetry table + recordAiCall service-role write path"
provides:
  - "supabase/queries/ai_call_telemetry_report.sql — re-runnable 4-block report SQL (raw rows / per-cell stats / dollar cost / standing near-cap watch) + 180-day retention snippet"
  - "02-OUTPUT-SHAPE-AUDIT.md — 5-point prompt output-shape audit of all 4 in-scope features with per-cell trusted/cannot-be-trusted verdicts"
  - "02-MEASUREMENT-REPORT.md — four required sections + per-cell recommendation table with blast radius + empty APPROVE/REJECT/AMEND table for 02-08"
affects: [02-08-approved-caps, 02-09-final-cap-implementation]

tech-stack:
  added: []
  patterns:
    - "Checked-in report SQL parameterised on :window_start regenerates the analysis instead of re-deriving it; epoch cutoff baked into every stat"
    - "Shape-audit as a locked precondition: a cell failing any of checklist points 1-3 is flagged 'cap cannot be trusted here yet' regardless of measured headroom"
    - "Sizing floor: proposed = max(ceil(peak*1.4), current) — n=3 forbids any cell below its pre-TEMP production value; 'keep' is first-class"

key-files:
  created:
    - supabase/queries/ai_call_telemetry_report.sql
    - .planning/phases/02-ai-token-cost-optimization/02-OUTPUT-SHAPE-AUDIT.md
    - .planning/phases/02-ai-token-cost-optimization/02-MEASUREMENT-REPORT.md
    - .planning/phases/02-ai-token-cost-optimization/02-07-SUMMARY.md
  modified: []

key-decisions:
  - "Headroom in the report is computed against the PRE-TEMP production cap, not the TEMP diagnostic cap, so the numbers are meaningful (many cells sat at <=3% or negative headroom at prod caps)"
  - "Recruiting Lens (never previously audited) fails the shape audit on all 3 calls AND runs closest to its caps — rl-call-1 peaked 10,955 at the 12,000 hard clamp; proposed 12,000/12,000/12,000 (ceiling 15,000 -> 36,000)"
  - "Career elite-extras did NOT receive the 2026-07-17 reference-pattern treatment (no brevity block, unbounded salaryBands/smartApplicationStrategy); career growth DID"
  - "The two truncated resume cells (summary, elite-extras) proposed at the 12,000 clamp under the operator-approved accept+self-heal disposition (analyze-resume attempt-2 retry is the safety net)"
  - "No prompt files modified (rewrites out of scope); shape-tightening recorded as follow-up work"

patterns-established:
  - "Every report table names the SQL query block that produced it; every raw row cross-references a run # in 02-MEASUREMENT-LOG via req_id (repudiation mitigation T-02-23)"
  - "Standing near-cap watch query (Block 4) makes the telemetry permanently useful — surfaces the next truncation regression before a paying user hits it"

requirements-completed: [TOK-05]

duration: 6min
completed: 2026-07-27
---

# Phase 02 Plan 07: Measurement Report & Output-Shape Audit Summary

**Turned the measured Epoch 2 dataset into the decision artifact: a checked-in regenerating report SQL, a per-feature 5-point output-shape audit, and 02-MEASUREMENT-REPORT.md carrying all four required sections plus a floor-respecting per-cell recommendation table (with blast radius) and the empty APPROVE/REJECT/AMEND table that 02-08 fills in cell-by-cell.**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-07-27
- **Tasks:** 3/3 (report SQL, shape audit, measurement report)

## Accomplishments

- **Task 1 — `supabase/queries/ai_call_telemetry_report.sql`.** Four named, commented query blocks: (1) raw rows, (2) per-cell stats (`attempt=1 AND ok`, utility-extraction calls `docx-extract`/`ocr-extract`/`*-legacy` excluded with the reason as a SQL comment; the attempt-1 exclusion reason — retries run at a doubled `min(base*2,12000)` cap — also documented), (3) dollar cost per-analysis + per-tier + per-1000 at Haiku 4.5 rates, and (4) a standing near-cap watch over a trailing 30-day window. A1 verdict (input excludes cache → sum the three columns) is baked into the cost formula as a comment. Parameterised on `:window_start`; operator-run 180-day retention DELETE appended as a fenced snippet (no pruning infrastructure built).
- **Task 2 — `02-OUTPUT-SHAPE-AUDIT.md`.** All four in-scope features scored against the 5-point checklist with file/line evidence. Trusted cells: resume criteria-1/criteria-2/rewrites/free-single, career growth. Flagged "cap cannot be trusted here yet": resume summary + elite-extras, career base + elite-extras, LinkedIn linkedin-grade, all three Recruiting Lens calls. Answered the plan's explicit question — career `growth` got the reference-pattern treatment, career `elite-extras` did NOT (no brevity block at all). Confirmed the LinkedIn validator enforces `topFixes.min(1)` with no `.max()`, and the Recruiting Lens schema has no `.max()` on any array. Zero prompt files modified (`git diff --quiet` verified).
- **Task 3 — `02-MEASUREMENT-REPORT.md`.** All four required sections, each attributed to its SQL block. Headroom computed against pre-TEMP production caps (exposing that criteria-2, summary, elite-extras, all RCL calls, and LinkedIn free sat at ≤3% or negative headroom at production caps). Recommendation table gives every cell a floor-respecting proposal, a shape verdict, and its verbatim lockstep blast-radius file list; ceiling arithmetic proves GATE-09, the Career brevity ratio, and per-call ≤12,000 for every change. Cost section states the A1 verdict inline and the locked "cap is not the cost lever" finding (input-side levers reported, not implemented). Ends with the empty per-cell APPROVE/REJECT/AMEND table for 02-08.

## Key proposals handed to 02-08

- **Resume elite ceiling** 41,000 (criteria-1 6,000 / criteria-2 7,000 / summary 12,000 / rewrites 4,000 / elite-extras 12,000); Pro 29,000; GATE-09 holds (free 9,000 < 20,500).
- **Career elite ceiling** 10,000 → 11,000 (base 5,000 / growth 4,000 / elite-extras 2,000); base MUST rise above the 4,500 that truncated on 2026-07-17.
- **LinkedIn** free right-sized DOWN 12,000 → 9,000, elite keep 9,000.
- **Recruiting Lens elite ceiling** 15,000 → 36,000 (12,000 × 3) — rl-call-1 is at the hard clamp with headroom below 1.4×; accept + monitor via the near-cap watch.

## Deviations from plan

- **No production MCP in this execution session** (as in 02-06). The report is built from the 02-06 reconciled prod read-only audit (`02-MEASUREMENT-LOG.md` Epoch 2 reconciliation), which IS the production read-only result. The SQL is written to run clean read-only against production; 02-08 (operator) executes it against the live table to confirm the regenerated numbers match this report. No auto-fix deviations (Rules 1-4) were triggered — this is a doc/SQL-only plan.

## Open items handed forward

- **02-08 (approved caps):** fill the APPROVE/REJECT/AMEND table cell-by-cell (HARD STOP, `autonomous:false` — operator approves each cap). Rejected cells revert to their pre-TEMP production value.
- **02-09 (implementation):** set each approved cap in the single lockstep edit; "revert" and "implement" are the same commit. Exclude the Phase 01.1 permanent Recruiting Lens INPUT cells (51,000 chars / 12,750 tokens) from the revert.
- **Follow-up (out of phase):** prompt output-shape tightening for the 8 flagged cells (recorded in the audit + report). Interview Prep token tuning remains open in the maxtoken-tuning TRACKER.

## Self-Check: PASSED

- Files verified present: `supabase/queries/ai_call_telemetry_report.sql`, `02-OUTPUT-SHAPE-AUDIT.md`, `02-MEASUREMENT-REPORT.md`.
- Commits verified in history: `5e99440d` (SQL), `0c7ae027` (audit), `4baddf7f` (report).
- Prompt files unmodified (`git diff --quiet` on the 4 surfaces returned clean).

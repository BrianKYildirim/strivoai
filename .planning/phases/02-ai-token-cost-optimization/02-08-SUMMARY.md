---
phase: 02-ai-token-cost-optimization
plan: 08
subsystem: decision-gate
tags: [max-tokens, token-cost, operator-approval, hard-stop, locked-caps]

requires:
  - phase: 02-07
    provides: "02-MEASUREMENT-REPORT.md recommendation table + blast radius, 02-OUTPUT-SHAPE-AUDIT.md per-cell trusted/cannot-be-trusted verdicts"
provides:
  - "02-APPROVED-CAPS.md LOCKED (2026-07-27) — per-cell operator verdicts (15/15 APPROVE as proposed), the LOCKED FINAL TABLE plan 02-09 implements from, whole-set invariant proof, and the resulting tierSums (free 22,800 / pro 97,000 / elite 109,000)"
affects: [02-09-final-cap-implementation]

tech-stack:
  added: []
  patterns:
    - "Budgets are approved, not auto-applied: autonomous:false + gate=blocking-human honored despite auto_advance=true; per-cell verdicts collected, no aggregate approval accepted"
    - "LOCKED-table contract: 02-09 implements the locked table and nothing else — no cell added, dropped or nudged during implementation"

key-files:
  created:
    - .planning/phases/02-ai-token-cost-optimization/02-08-SUMMARY.md
  modified:
    - .planning/phases/02-ai-token-cost-optimization/02-APPROVED-CAPS.md

key-decisions:
  - "OPERATOR DECISION (2026-07-27): all 15 cells A1-B10 APPROVED at their PROPOSED values — zero REJECT, zero AMEND, zero cells sent back for re-measurement; every Group B 'cannot be trusted yet' cell approved as an interim value with prompt-bounding as the deferred durable fix"
  - "Final per-feature ceilings for 02-09: Resume free 9,000 / pro 29,000 / elite 41,000; Career free 4,800 / pro 11,000 / elite 11,000; LinkedIn 9,000 all tiers; Recruiting Lens pro/elite 36,000 (12,000 x 3)"
  - "Resulting SC12_SNAPSHOT.tierSums.maxTokensOutput for 02-09: free 22,800 / pro 97,000 / elite 109,000 (replaces TEMP 30,000 / 114,000 / 114,000; Interview Prep unchanged at 0/12,000/12,000)"
  - "Whole-set invariant re-check PASSED with arithmetic shown: max per-call value 12,000 <= ABSOLUTE_MAX_TOKENS 12,000; all per-tier CALL_CONFIGS sums exact-equal their ceilings; GATE-09 9,000 < 20,500 (22.0%); Career brevity 3,960<=4,800 free and 8,100<=11,000 pro/elite — zero conflicts, no second verdict needed"

patterns-established:
  - "Five cells ship AT the 12,000 hard clamp (resume summary, resume elite-extras, rl-call-1/2/3) — the standing near-cap watch (report SQL Block 4) + analyze-resume attempt-2 self-heal are the recorded safety nets"

requirements-completed: [TOK-06]

duration: 5min
completed: 2026-07-27
---

# Phase 02 Plan 08: Per-Cell Operator Cap Approval (HARD STOP) Summary

**The phase's decision gate closed clean: the operator gave an explicit per-cell verdict on all 15 proposed cap cells — APPROVE as proposed on every one — and 02-APPROVED-CAPS.md is now LOCKED (2026-07-27) with the final table, a whole-set proof of all four boot invariants, and the tierSums (free 22,800 / pro 97,000 / elite 109,000) that plan 02-09 implements without re-deriving.**

## Performance

- **Duration:** ~5 min active (Tasks 1+3; Task 2 was the operator decision window)
- **Completed:** 2026-07-27
- **Tasks:** 3/3 (decision sheet, HARD STOP operator approval, lock)

## Accomplishments

1. **Task 1 (committed 81e3e72a):** `02-APPROVED-CAPS.md` decision sheet — 15 rows lifted from the report's recommendation table, grouped Group A (clean shape, TRUSTED, 5 cells) vs Group B (unbounded shape, "cannot be trusted yet", 10 cells with a one-line note naming what is unbounded), verdict semantics (APPROVE/REJECT-to-pre-TEMP/AMEND-with-recheck) stated, zero verdicts pre-filled.
2. **Task 2 (HARD STOP, operator):** per-cell verdict collected — **all 15 cells: APPROVE as proposed.** No aggregate approval was accepted or needed; the reply was an explicit per-cell table.
3. **Task 3:** verdicts written into the sheet (15/15 APPROVE, amended column —), the LOCKED FINAL TABLE derived (final = proposed for every cell), the whole set re-checked against all four invariants with arithmetic shown, tierSums computed for 02-09's snapshot + sc12 test title, and the sheet marked **LOCKED 2026-07-27** with the 02-09 implements-this-and-nothing-else contract.

## Invariant re-check (result)

| Invariant | Arithmetic | Result |
|-----------|------------|--------|
| Per-call ≤ ABSOLUTE_MAX 12,000 | max of 15 finals = 12,000 | ✓ (5 cells AT clamp) |
| Per-tier CALL_CONFIGS sum ≤ ceiling | Resume 41,000/29,000/9,000; Career 11,000/11,000/4,800; RL 36,000; LinkedIn 9,000 — all exact-equal | ✓ |
| GATE-09 resume free < 50% elite | 9,000 < 20,500 (22.0%) | ✓ |
| Career brevity target×1.8 ≤ ceiling | free 3,960 ≤ 4,800; pro/elite 8,100 ≤ 11,000 | ✓ |

## Handoff to 02-09

- Implement the LOCKED FINAL TABLE (15 cells) across each cell's lockstep file set; TEMP revert and implementation are the SAME commit.
- Snapshot `tierSums.maxTokensOutput`: **free 22,800 / pro 97,000 / elite 109,000**; per-feature ceilings as recorded in the sheet's tierSums section; sc12 test title updated to match.
- Nothing else: no cell added, dropped or nudged; Interview Prep, independent Pro values, prompt rewrites, input-side cost work, and near-cap alerting all remain deferred.

## Deviations from Plan

None — plan executed exactly as written. The operator's response was already per-cell (no aggregate-approval push-back needed).

## Self-Check: PASSED

- `02-APPROVED-CAPS.md` contains "LOCKED", zero empty-verdict rows (automated check: PASS), 15 APPROVE verdict rows.
- Task 1 commit `81e3e72a` exists; Task 3 + SUMMARY committed together (this commit).

---
phase: 27-cutover-safety-net
plan: 02
subsystem: operator-runbook
tags: [phase-21-cutover, runbook, operator-acks, stripe-webhook, merit-system, phase-25-coordination]
dependency_graph:
  requires:
    - phase21-runbook.ps1 (Stages D1-Preflip / D2-Flip / D4-Finalize, helper functions)
    - 27-01 (410-Gone shim provides legacy_endpoint_hit observability referenced by Section 3 of notes)
  provides:
    - Three operator-typed ack ceremonies (SC-2, SC-3, SC-4) with audit-trail evidence stamps
    - 21-CUTOVER-NOTES.md operator-facing memo (SC-5)
  affects:
    - .planning/phases/21-integration-validation-and-cutover/21-CUTOVER-LOG.md (3 new evidence sections appended at runtime)
tech_stack:
  added: []
  patterns:
    - Confirm-Or-Exit + Append-Evidence ceremony (matches existing FLIP PROD precedent)
key_files:
  created:
    - .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md
  modified:
    - scripts/phase21-runbook.ps1
decisions:
  - All three ack phrases are case-sensitive and verbatim (mismatch -> exit 1, no retry).
  - D2 rollback caveat fires BEFORE the red FLIP PROD banner (two distinct decisions = two distinct prompts, D-09).
  - D4 Phase-25 coordination ack runs ONLY on HOLD outcomes; ROLLBACK exits earlier by design.
  - The notes file lives under .planning/ (gitignored) and is committed by the operator via git add -f at the Phase 27 PR per Phase 21 D-22 precedent -- this plan does NOT commit it.
metrics:
  duration_minutes: 6
  tasks_completed: 4
  files_changed: 2
  commits_in_plan: 3
  completed_date: "2026-04-29T02:02:06Z"
---

# Phase 27 Plan 02: Cutover Runbook Acks + Operator Notes Summary

Three additive operator-typed acknowledgment ceremonies were inserted into `scripts/phase21-runbook.ps1` (Stripe-URL pin in Gate D1, rollback caveat in Gate D2, Phase 25 coordination reminder in Gate D4 HOLD branch), and the operator-facing memo `21-CUTOVER-NOTES.md` was hand-authored in the Phase 27 directory. Closes SC-2, SC-3, SC-4, and SC-5.

## What Was Built

### Three runbook insertions (additive only, no existing logic modified)

| SC | Stage | Insertion Point (post-edit) | Phrase | Evidence Heading |
|----|-------|------------------------------|--------|-------------------|
| SC-2 | Stage-D1-Preflip | line 491-503 (after `Ensure-Cutover-Log`, before `Verifying production prerequisites (read-only)`) | `STRIPE URL VERIFIED` | `## Stripe URL Pin Ack` |
| SC-3 | Stage-D2-Flip | line 541-555 (after the leading `Write-Host ""` blank, before the red `PRODUCTION FLIP CONFIRMATION` banner top) | `ACK INTERVIEW PREP ROLLBACK BRICKS 503` | `## Rollback Caveat Ack` |
| SC-4 | Stage-D4-Finalize HOLD branch | line 781-794 (after the ROLLBACK early-exit, before `Committing evidence files via D-22 exception (git add -f)`) | `ACK INTERVIEW PREP COACH DELETE` | `## Phase 25 Coordination Ack` |

Each block follows the uniform structure: `Write-Step` banner -> `Write-Note` pointer to `21-CUTOVER-NOTES.md` -> optional `Write-Warn2` context -> `Confirm-Or-Exit` typed-phrase ack -> here-string `$stamp` -> `Append-Evidence $cutoverLog $stamp`. No new helper functions. No new env vars. No new project refs.

### Locked ack phrases (verbatim)

```text
STRIPE URL VERIFIED
ACK INTERVIEW PREP ROLLBACK BRICKS 503
ACK INTERVIEW PREP COACH DELETE
```

### ROLLBACK branch preserved

`Stage-D4-Finalize` ROLLBACK branch (lines ~746-750 pre-edit) was NOT modified. A ROLLBACK outcome still calls `exit 0` BEFORE reaching the new Phase-25 coordination ack (which sits AFTER the closing `}` of the ROLLBACK if-branch). Rollback emergencies remain "calmly recorded -> exit" with no extra ceremony, which is the design intent (RESEARCH Recommendation #5: planted seed via Phase 25 SC-9 covers the rollback case durably).

### Operator-facing memo

`.planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md` -- 71 lines total.

- 1 H1: `Phase 21 Cutover Notes -- Operator Safety Net`
- 4 H2 sections:
  1. Legacy Webhook Risk
  2. Interview Prep Rollback Caveat
  3. Stripe URL Pin
  4. Phase 25 Dependency
- Header blockquote cross-references all five paths required by D-16: `21-CUTOVER-LOG.md`, `v2.0-MILESTONE-AUDIT.md`, `phase21-runbook.ps1`, `stripe-webhook/index.ts` (the 410 shim), `stripe-webhook-handler/index.ts` (the active handler).

## Verification Performed

- `.\scripts\phase21-runbook.ps1 -Stage list` exits 0 after each of the three insertions (PowerShell parses cleanly).
- `grep -c "STRIPE URL VERIFIED"` returns 2 (prompt + evidence stamp).
- `grep -c "ACK INTERVIEW PREP ROLLBACK BRICKS 503"` returns 2.
- `grep -c "ACK INTERVIEW PREP COACH DELETE"` returns 2.
- D2 ack line (542) precedes the red banner line (557).
- D4 ack line (782) sits after the ROLLBACK exit and before the git-add-f step (796).
- Notes file: 1 H1, 4 H2, 71 lines, all required cross-references present, no executable code fences.

## Deviations from Plan

None -- plan executed exactly as written. All three insertions matched the proposed snippets verbatim modulo PowerShell-style comment header (`# --` instead of `# ──`) which the plan's `<context>` section showed both ways; the chosen ASCII-only form matches the existing runbook's section-divider style and avoids any risk of UTF-8 byte-order surprises in the cmdline parser.

## Authentication Gates

None.

## Operator Reminder

The notes file `.planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md` lives under `.planning/` which is gitignored. It is NOT committed by this plan. The operator commits it as part of the Phase 27 PR via `git add -f` per the Phase 21 D-22 precedent (same exception that the runbook itself uses to commit `21-CUTOVER-LOG.md` / `21-SC5-EVIDENCE.md` / `21-STAGING-SOAK.md`).

## Commits in this plan

| Task | Commit | Subject |
|------|--------|---------|
| 1 (D1 SC-2) | `0b20f38` | feat(27-02): add D1 Stripe webhook URL pin ack (SC-2) |
| 2 (D2 SC-3) | `8f179e0` | feat(27-02): add D2 rollback caveat ack before FLIP PROD banner (SC-3) |
| 3 (D4 SC-4) | `84df17e` | feat(27-02): add D4 Phase 25 coordination ack on HOLD branch (SC-4) |
| 4 (notes SC-5) | (no commit -- file committed by operator via git add -f at PR time) | hand-authored 21-CUTOVER-NOTES.md |

## Self-Check: PASSED

- `scripts/phase21-runbook.ps1` modified (commit 84df17e is HEAD): FOUND
- `.planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md`: FOUND (71 lines)
- Commit `0b20f38`: FOUND
- Commit `8f179e0`: FOUND
- Commit `84df17e`: FOUND
- `STRIPE URL VERIFIED` line count = 2: PASS
- `ACK INTERVIEW PREP ROLLBACK BRICKS 503` line count = 2: PASS
- `ACK INTERVIEW PREP COACH DELETE` line count = 2: PASS
- Runbook `-Stage list` exit code = 0: PASS

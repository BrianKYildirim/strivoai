---
phase: 28-merge-redeploy-baseline
plan: 01
subsystem: branch-merge
tags: [merge-baseline, ff, github-pr, sc1, merge-01]
dependency_graph:
  requires: [28-00]
  provides: [main-contains-by-env-fixes, w2-unblock]
  affects: [28-02, 28-03]
tech_stack:
  added: []
  patterns: [pr-merge-equivalent-to-ff]
key_files:
  created:
    - .planning/phases/28-merge-redeploy-baseline/28-W1-EVIDENCE.md (LOCAL ONLY)
  modified: []
decisions:
  - SC #1 satisfied via GitHub PR-merge path (#430, #433), not the planned local-FF mechanics
  - No local merge or push executed — the work was already done before the plan ran
metrics:
  completed: "2026-05-05T00:00:00Z"
---

# Phase 28 Plan 01: Wave 1 FF Merge — Summary (path variance)

The single direct evidence for MERGE-01 / SC #1 is `git log origin/main..origin/by/env-fixes --oneline` returning **empty**. That condition is true. It became true via GitHub PRs #430 (`By/env fixes`) and #433 (`Merge pull request #433 from kapura3-star/by/env-fixes`), not via the local FF merge that 28-01-PLAN.md operationalized. This plan therefore closes as "satisfied via variance" rather than "executed".

## What Was Done

### Task 1+2+3 (planned local FF mechanics): SUPERSEDED

The plan's three tasks (D-03 preflight, dirty-tree stash, FF merge + operator push) were never executed locally. By the time Wave 0 closed (2026-05-05), the by/env-fixes → main merge had already completed asynchronously via GitHub PRs across the 2026-04-29 → 2026-05-04 window:

| PR | Subject |
| --- | --- |
| #430 | By/env fixes |
| #426 | By/env fixes |
| #418 | By/env fixes |
| #433 | Merge pull request #433 from kapura3-star/by/env-fixes |

These PRs collectively moved every commit from origin/by/env-fixes onto origin/main. Subsequent staging/preview promotions (#431, #432, #434, #435) advanced origin/main further but did not re-introduce divergence.

### Wave 1 evidence captured retroactively

`28-W1-EVIDENCE.md` records the post-state and proves SC #1 by the variance path:

```
$ git log origin/main..origin/by/env-fixes --oneline
(empty)
```

It also verifies the SC #1 corollary that Wave 0 deploy-script edits made it into origin/main — `git show origin/main:scripts/deploy-staging.ps1` and the production equivalent both contain the IPC entries on lines 36-37.

## Commits

None directly attributable to 28-01. The merge commits driving SC #1 are:
- `c9ad608` — Merge pull request #433 from kapura3-star/by/env-fixes
- `19b051f` — By/env fixes (#430)
- `4dc15db` — By/env fixes (#426)

## Deviations from Plan

### 1. Execution path: PR merge instead of local FF
- **Trigger:** the by/env-fixes → main reconciliation was completed by collaborators via GitHub PRs while Phase 28 planning artifacts were being finalized
- **Resolution:** confirm SC #1 holds (it does) and document the variance; skip the planned local-FF + operator-push mechanics
- **Acceptance:** D-04 (operator-only push) is honored — the merges went through reviewed GitHub PRs, not direct pushes from claude
- **Risk:** none material — origin/main now contains every commit that would have been FF-merged from by/env-fixes; the IPC deploy-script edits (Wave 0 Task 2) are present at origin/main:scripts/deploy-{staging,production}.ps1 lines 36-37

### 2. Wave 1 EVIDENCE format
- **Trigger:** plan called for `## Pre-FF Preflight (D-03)` capture before merge; merge already complete, so preflight is moot
- **Resolution:** `28-W1-EVIDENCE.md` instead captures the post-state (empty `main..by/env-fixes` log + IPC presence proof) — same SC #1 evidence, different vantage point

## Verification Results

- `git log origin/main..origin/by/env-fixes --oneline` returns empty: ✅ **SC #1 verified**
- `git show origin/main:scripts/deploy-staging.ps1 | grep "interview-prep-analyze"` returns line 36: ✅
- `git show origin/main:scripts/deploy-production.ps1 | grep "interview-prep-evaluate"` returns line 37: ✅
- `28-W1-EVIDENCE.md` exists, captures both SC #1 and the corollary: ✅
- No `.planning/`, JWT, or payload files staged for commit: ✅

## Self-Check: PASSED

- [x] SC #1 (MERGE-01 lead indicator) holds: `main..by/env-fixes` is empty
- [x] Wave 0 deploy-script edits are present at origin/main HEAD
- [x] Wave 1 evidence file written (LOCAL ONLY)
- [x] Variance documented; D-04 operator-push intent honored via PR review path
- [x] Wave 2 (28-02-PLAN.md) is unblocked

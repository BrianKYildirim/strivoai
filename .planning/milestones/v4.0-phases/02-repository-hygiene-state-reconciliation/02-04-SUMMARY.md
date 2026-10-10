---
phase: 02-repository-hygiene-state-reconciliation
plan: 04
subsystem: infra
tags: [git, branch-reconciliation, worktree-retirement, fast-forward, repo-hygiene, REPO-02]

# Dependency graph
requires:
  - phase: 02-repository-hygiene-state-reconciliation
    provides: "02-01 verified branch/tag ground-truth (main -86, preview -74, by/env-fixes merged+remote-gone, 6 worktree-agent-*, v4.0-baseline ancestor of staging)"
provides:
  - "Clean enumerable branch set: surviving local branches reduced to main/preview/staging only"
  - "Local main + preview fast-forwarded to their origins (0 behind) without checkout, via FF-only refspec fetch"
  - "by/env-fixes (Phase-27) local ref safely pruned with -d after recording its merged disposition"
  - "All 6 worktree-agent-* worktrees retired + branches force-deleted with a pre-recorded shipped-disposition audit trail (02-WORKTREE-DISPOSITION.md)"
  - "staging left diverged-by-design (77 behind origin/main) as the documented D-07 known-state"
affects: [02-05-conventions-doc, phase-03-inventory-audit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FF-only refspec fetch (git fetch origin main:main) to advance a stale local branch in place without checkout — refuses safely on non-FF"
    - "Verify-then-force-delete for squash-merged worktree branches (D-09 / Pitfall 1): record per-branch unique-commit + shipped-phase disposition FIRST, then git branch -D — never gate on the lying --merged reachability check"
    - "Distinguish -d (by/env-fixes, cleanly merged) from -D (worktree-agent-*, unreachable-but-shipped) deliberately"

key-files:
  created:
    - .planning/phases/02-repository-hygiene-state-reconciliation/02-WORKTREE-DISPOSITION.md
    - .planning/phases/02-repository-hygiene-state-reconciliation/02-04-SUMMARY.md
  modified: []

key-decisions:
  - "Local main (7bf9741->42d32a0) and preview (ef72434->327356f) FF'd to their origins via refspec fetch (no checkout); both verified ancestors so FF-only succeeded cleanly (D-06)."
  - "by/env-fixes pruned with -d (NOT -D): 0 unique commits vs main, present in --merged main, remote tracking already gone — git's safety check passed, proving clean merge (D-08). Phase-27 purpose (env fixes; tip = 'remove obsolete summary files for phases 12/14/15/16') recorded for the 02-05 branch doc."
  - "All 6 worktree-agent-* branches force-deleted (-D) — justified by recorded shipped disposition, NOT a --merged rubber-stamp. Their tips are unreachable (squash-merge under new SHAs) but every phase's content shipped to origin/main, verified for 24-04 (useFeatureCosts.ts), 31-01 (merit-error-messages.ts/.test.ts), 47-00 (isInterviewPrepEnabled), 47-01 (ComingSoonBadge.tsx) (D-09 / Pitfall 1)."
  - "staging NOT merged/forced toward origin/main: its 77-behind divergence is left untouched as the documented D-07 known-state."

patterns-established:
  - "02-WORKTREE-DISPOSITION.md audit-trail file: per-branch unique-commit subjects + tip --stat + shipped-phase rationale, written BEFORE any deletion, committed as the single artifact of the worktree retirement"

requirements-completed: [REPO-02]

# Metrics
duration: 5min
completed: 2026-06-13
---

# Phase 2 Plan 04: Branch & Worktree Reconciliation Summary

**Reconciled the local branch model to a clean main/preview/staging set: fast-forwarded stale local main (-86) and preview (-74) to their origins without checkout, safely pruned the merged Phase-27 `by/env-fixes` ref, and retired all 6 locked `worktree-agent-*` worktrees + force-deleted their branches behind a pre-recorded shipped-disposition audit trail — leaving `staging` diverged-by-design and zero source diff.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-13T12:53:27Z
- **Completed:** 2026-06-13T12:58:50Z
- **Tasks:** 2
- **Files created:** 2 (`02-WORKTREE-DISPOSITION.md` + this SUMMARY); **0 source files touched**

## Accomplishments

### Task 1 — Fast-forward main + preview; prune by/env-fixes (ref-only)
- `git fetch origin --prune` (dropped the already-`gone` `origin/by/env-fixes` tracking ref).
- **FF local `main`** `7bf9741 -> 42d32a0` via `git fetch origin main:main` (no checkout). `main..origin/main` = **0**; `rev-parse main == origin/main`.
- **FF local `preview`** `ef72434 -> 327356f` via `git fetch origin preview:preview`. `preview..origin/preview` = **0**; `rev-parse preview == origin/preview`.
- **`staging` untouched:** `staging..origin/main` = **77** (the documented D-07 divergence, unchanged — no merge/pull/FF toward origin/main).
- **`by/env-fixes` pruned with `-d`:** recorded its disposition first — 0 unique commits vs `main`, present in `git branch --merged main`, tip `8a3e382` ("chore: remove obsolete summary files for phases 12, 14, 15, and 16"). `git branch -d by/env-fixes` succeeded **without** `-D`, proving the clean merge (D-08).

### Task 2 — Record disposition, retire 6 worktrees + force-delete branches
- **Wrote `02-WORKTREE-DISPOSITION.md` BEFORE any deletion** (D-09 verify-then-remove). Records, per branch: unique tip commits (`--not origin/main origin/preview origin/staging`), tip `--stat`, and the shipped-phase rationale. 12 `worktree-agent` references (>= 6 required).
- **Content-disposition confirmed on `origin/main`** (the squash-merge target — Pitfall 1): `useFeatureCosts.ts` (24-04), `merit-error-messages.ts` + `.test.ts` (31-01), `isInterviewPrepEnabled()` in `src/config/feature-flags` wired into `src/App.tsx` (47-00), `ComingSoonBadge.tsx` (47-01). All 4 owning phases (24/27/31/47) shipped to production.
- **Retired all 6 worktrees:** unlock -> remove -> `git branch -D` -> prune. 3 removed cleanly; 3 (`a5e298e3`, `abddefae`, `af019495`) refused on modified/untracked files and required `--force` after confirming the blockers were disposable (a gitignored `.claude/settings.local.json`; stale untracked `47-*-PLAN.md` copies whose canonical versions are already tracked on `origin/main` under `.planning/milestones/v3.0-phases/`). `af019495` additionally had an Administrator-owned `.git` ("dubious ownership") — added a temporary `safe.directory` exception, force-removed, then **unset** the exception.
- **Final state:** `git worktree list` -> **1 line** (primary only); `git branch --list "worktree-agent-*"` -> empty; `git worktree prune --dry-run` -> empty; `git branch -vv` -> only `main`/`preview`/`staging`.

## Task Commits

Ref-only operations (FF, prune, worktree-remove, branch-delete) carry NO committable file diff — verified by git query. The only committable artifact is the disposition record:

1. **Task 1 (FF main/preview + prune by/env-fixes):** ref-only, no commit. Verified by `git rev-list --count` + `git branch --list`.
2. **Task 2 (retire 6 worktrees + record disposition):** `a8858f0` (docs) — `02-WORKTREE-DISPOSITION.md` committed alone; `git show --stat HEAD` lists only that file.

## Files Created/Modified
- `.planning/phases/02-repository-hygiene-state-reconciliation/02-WORKTREE-DISPOSITION.md` — per-branch force-delete audit trail (created, committed `a8858f0`).
- `.planning/phases/02-repository-hygiene-state-reconciliation/02-04-SUMMARY.md` — this summary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 3 worktrees refused clean `git worktree remove` (modified/untracked files)**
- **Found during:** Task 2, STEP B (`a5e298e3`, `abddefae9bfb315c8`, `af019495180b9353e`).
- **Issue:** `git worktree remove` aborted with "contains modified or untracked files". Blockers were: a gitignored `.claude/settings.local.json` (a5e298e3) and stale untracked `47-*-PLAN.md`/CONTEXT/DISCUSSION-LOG copies (abddefae, af019495).
- **Fix:** Confirmed the blockers were disposable per the Step-A evidence (branch tips already recorded + shipped; the untracked PLAN docs are already tracked on `origin/main` under `.planning/milestones/v3.0-phases/`; settings.local.json is gitignored), then used `git worktree remove --force` (the plan explicitly permits `--force` only after confirming no wanted changes — Pattern 4).
- **Files modified:** none tracked (`.claude/worktrees/` is gitignored).
- **Commit:** n/a (ref-only).

**2. [Rule 3 - Blocking] `af019495180b9353e` had Administrator-owned `.git` ("dubious ownership")**
- **Found during:** Task 2, inspecting blocker files.
- **Issue:** that worktree's `.git` was owned by `BUILTIN/Administrators` (created in an elevated context), so git refused to operate on it.
- **Fix:** added a temporary `git config --global --add safe.directory <path>` exception, force-removed the worktree, then **unset** the exception (left global config clean).
- **Files modified:** global git config only (temporarily); reverted.
- **Commit:** n/a (ref-only).

## Out-of-Scope (left untouched)
- Two leftover on-disk dirs `.claude/worktrees/agent-ab970047` and `agent-ac8839d7` are NOT registered worktrees and have NO `worktree-agent-*` branches (never `git worktree`-registered; gitignored, untracked). They were never among the 6 in-scope locked worktrees — left as-is per scope boundary; they produce no tracked-file change and `git worktree prune --dry-run` is empty.
- `.planning/config.json` (out-of-scope dirty file) left untouched per the safety rules.

## Verification (all targets pass)
- `git rev-list --count main..origin/main` -> **0**; `preview..origin/preview` -> **0**; both `rev-parse`-equal to origins.
- `git branch --list by/env-fixes` -> empty (pruned via `-d`, not `-D`).
- `staging..origin/main` -> **77** (unchanged — D-07 known-state, staging not advanced toward origin/main).
- `git worktree list` -> **1 line** (primary); `git branch --list "worktree-agent-*"` -> empty; `git worktree prune --dry-run` -> empty.
- `git branch -vv` -> only `main`/`preview`/`staging` (no `worktree-agent-*`, no `by/env-fixes`).
- `02-WORKTREE-DISPOSITION.md` exists, contains per-branch evidence (12 `worktree-agent` refs), written before deletion, committed alone (`git show --stat HEAD` = only that file).
- **Zero functional change:** `git diff --stat fa4ccb6..HEAD -- src supabase/functions` -> **empty**. No history rewrite (no rebase/amend/push --force). No `git add -A/./-f`.

## Issues Encountered
- The 3 force-required removals (deviation 1) and the dubious-ownership case (deviation 2) — both resolved as documented above; no wanted work lost.
- Benign `LF will be replaced by CRLF` warning on the disposition-file commit (Windows autocrlf); content unaffected, diff is the intended 103 insertions only.

## User Setup Required
None — git-state + documentation only; no external service configuration.

## Next Phase Readiness
- Surviving branch set is now clean (`main`/`preview`/`staging`) and accurately enumerable — 02-05 can document the canonical branch model (D-05/D-12) and the recorded `by/env-fixes` Phase-27 purpose against a true picture.
- `main`/`preview` equal their origins; `staging` divergence is the documented D-07 known-state.
- `npm run verify:baseline` re-run is the wave-close gate (per VALIDATION.md) — zero source diff vs `fa4ccb6` already proven, so the profile is expected unchanged from v4.0-baseline.

## Self-Check: PASSED

- FOUND: `.planning/phases/02-repository-hygiene-state-reconciliation/02-WORKTREE-DISPOSITION.md`
- FOUND: `.planning/phases/02-repository-hygiene-state-reconciliation/02-04-SUMMARY.md`
- FOUND: commit `a8858f0` (Task 2 — disposition record)

---
*Phase: 02-repository-hygiene-state-reconciliation*
*Completed: 2026-06-13*

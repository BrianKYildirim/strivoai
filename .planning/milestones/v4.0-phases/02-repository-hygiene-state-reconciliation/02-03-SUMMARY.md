---
phase: 02-repository-hygiene-state-reconciliation
plan: 03
subsystem: repo-hygiene
tags: [gitignore, untrack, tracked-junk, REPO-03, REPO-05]
requirements: [REPO-03, REPO-05]
status: complete
dependency_graph:
  requires: ["02-01", "02-02"]
  provides: ["dist-codex-untracked", "supabase-temp-untracked", "pricing-png-removed", "REPO-05-artifact-gap-closed"]
  affects: [".gitignore", "git-index"]
tech_stack:
  added: []
  patterns: ["untrack-then-ignore-same-commit (Pattern 1 / Pitfall 2)"]
key_files:
  created:
    - .planning/phases/02-repository-hygiene-state-reconciliation/02-03-SUMMARY.md
  modified:
    - .gitignore
  removed:
    - pricing.png
  untracked_index_only:
    - dist-codex/ (17 files; stay on disk)
    - supabase/.temp/ (9 files; stay on disk)
decisions:
  - "D-01: dist-codex/ untracked (git rm -r --cached) + ignored in the same commit"
  - "D-02: supabase/.temp/ untracked + ignored in the same commit; perpetual dirty status resolved"
  - "D-03: pricing.png removed from index AND disk (plain git rm)"
  - "D-04: .planning/ + APIcontextdocuments/ + test-fixture + app-asset keep-set left untouched"
metrics:
  duration_min: 2
  tasks: 2
  commits: 3
  files_untracked: 26
  files_removed: 1
  completed: 2026-06-13
---

# Phase 2 Plan 3: Tracked-Junk Cleanup + .gitignore Summary

Untracked the two stray-but-keep-on-disk paths (`dist-codex/`, `supabase/.temp/`) index-only and removed the one stray repo-root screenshot (`pricing.png`) from index + disk — each untrack landed in the SAME commit as its matching `.gitignore` rule (Pitfall 2: no untracked-but-unignored window). Closes REPO-03 and the sole REPO-05 artifact gap; zero functional change (no `src/` or `supabase/functions/` source touched).

## What Was Built

Three atomic, conventions-compliant commits on `staging`:

1. **`458a7e1`** — `git rm -r --cached dist-codex/` (17 files dropped from index, kept on disk) + appended `dist-codex/` ignore rule to `.gitignore` in the same commit.
2. **`d3f0ac3`** — `git rm -r --cached "supabase/.temp/"` (9 files dropped from index, kept on disk; the 3 perpetually-dirty link-state files included) + appended `supabase/.temp/` ignore rule in the same commit. Resolves the chronic `git status` dirtiness that flipped on every `supabase link`.
3. **`aa44a54`** — `git rm pricing.png` (removed from index AND working tree; unreferenced 5848-byte screenshot, real logos live in `public/` and `src/assets/`).

`.gitignore` gained a grouped 6-line block (2 comments + 2 rules + spacing) placed adjacent to the existing `dist`/`dist-ssr` lines, LF endings, no BOM.

## Verification Results

| Check | Result |
|-------|--------|
| `git ls-files dist-codex/` | `0` (untracked); `test -d dist-codex` → on disk |
| `git check-ignore dist-codex/index.html` | prints path (ignored) |
| `git ls-files "supabase/.temp/"` | `0` (untracked); `test -d supabase/.temp` → on disk |
| `git status --porcelain supabase/.temp` | empty (perpetual dirtiness resolved) |
| `git check-ignore supabase/.temp/project-ref` | prints path (ignored) |
| `git ls-files pricing.png` | empty; `test -e pricing.png` → GONE (disk too) |
| `git check-ignore .planning/STATE.md` | no match (NOT ignored — `.planning/` stays tracked) |
| `git ls-files .planning/ \| wc -l` | `850` (unchanged vs pre-plan) |
| D-04 keep-set (`.planning/*.png`, `APIcontextdocuments/*.pdf`, `scripts/test-resumes/*.pdf`) | 12 artifacts still tracked |
| `.gitignore` combined diff (both commits) | additions-only, no EOL flip; first 3 bytes `23 20 45` (no U+FEFF BOM) |
| `git diff --stat fa4ccb6..HEAD -- src supabase/functions` | EMPTY (zero functional change) |
| Co-Authored-By trailer | present on all 3 commits |

All plan-level `<verification>` and `<acceptance_criteria>` items pass. `npm run verify:baseline` is intentionally NOT run here — the wave-close baseline is plan 02-05's scope (no runtime code was touched, so the profile is unchanged from `v4.0-baseline` @ `fa4ccb6`).

## Deviations from Plan

None — plan executed exactly as written.

- No Rule 1-4 deviations were required.
- No authentication gates occurred.
- Staging used specific file paths only (`.gitignore`, `pricing.png`); the `git rm` commands self-staged their removals. Never used `git add -A`/`.`/`-f`. The out-of-scope dirty `.planning/config.json` (ephemeral orchestration flag) was deliberately left unstaged and untouched.

## Decisions Made

- **D-01 / D-02 (untrack mechanics):** Used `git rm -r --cached` for both directories so working-tree files are left intact (official git-rm guarantee). Each untrack was committed together with its `.gitignore` rule to avoid the Pitfall-2 untracked-but-unignored window — verified post-commit with `git check-ignore`.
- **D-02 (dirty `.temp` files):** `--cached` cleanly dropped the index entries for the 3 currently-modified link-state files without needing `-f`; the resulting working tree shows them as ignored, ending the perpetual dirty status.
- **D-03 (pricing.png):** The one path that intentionally uses plain `git rm` (no `--cached`, no ignore rule) so it leaves disk too.
- **D-04 (keep-set):** `.planning/` and the other intentional artifacts were not touched; `.planning/STATE.md` confirmed still tracked and NOT ignored.

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| `458a7e1` | chore | untrack stale dist-codex build output + gitignore (REPO-03/REPO-05) |
| `d3f0ac3` | chore | untrack machine-local supabase/.temp CLI state + gitignore (REPO-03) |
| `aa44a54` | chore | remove stray repo-root pricing.png (REPO-03/REPO-05) |

## For the Next Plan (02-04)

- Tracked-junk cleanup is done; the only build-artifact dir that existed (`dist-codex/`) is now untracked-and-ignored, so REPO-05's artifact gap is closed.
- `supabase/.temp/` no longer churns `git status` — branch/worktree ops in 02-04 won't be obscured by it.
- `.gitignore` now ignores `dist-codex/` and `supabase/.temp/`; do not re-track them via `git add -f`.
- The docs commit for this plan also stages `.planning/STATE.md` and `.planning/ROADMAP.md` updates (sequential mode); `.planning/config.json` remains out-of-scope dirty.

## Self-Check: PASSED

- FOUND: `.planning/phases/02-repository-hygiene-state-reconciliation/02-03-SUMMARY.md`
- FOUND: `.gitignore` (with `dist-codex/` + `supabase/.temp/` rules)
- CONFIRMED-GONE: `pricing.png` (index + disk)
- FOUND commits: `458a7e1`, `d3f0ac3`, `aa44a54`

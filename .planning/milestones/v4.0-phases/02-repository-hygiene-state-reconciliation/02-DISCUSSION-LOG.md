# Phase 2: Repository Hygiene & State Reconciliation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** 2-repository-hygiene-state-reconciliation
**Areas discussed:** Tracked-junk cleanup, Branch & worktree reconciliation, STATE.md ↔ git reconciliation, Conventions doc

---

## Tracked-junk cleanup (REPO-03 / REPO-05)

### dist-codex/ handling
| Option | Description | Selected |
|--------|-------------|----------|
| Untrack + gitignore | `git rm -r --cached dist-codex/` + add to .gitignore. Pure bundler cruft. | ✓ |
| Keep tracked | Only if a host/process serves it — none found (no vercel.json output override). | |

### supabase/.temp/ handling
| Option | Description | Selected |
|--------|-------------|----------|
| Untrack + gitignore | Machine-local link state; stops perpetual dirty status. | ✓ |
| Keep tracked | Only if team relies on a committed canonical project-ref. | |

### pricing.png handling
| Option | Description | Selected |
|--------|-------------|----------|
| Untrack + delete | Stray screenshot, zero references, not an app asset. | ✓ |
| Move to .planning/ or docs/ | Relocate as a reference image. | |
| Keep as-is | Leave tracked at repo root. | |

**User's choice:** Untrack + gitignore both directories; untrack + delete pricing.png.
**Notes:** dist-codex confirmed as Phase 37/50 verification build output (`npm run build --outDir dist-codex`); Vercel builds its own dist. supabase/.temp flips on every `supabase link` (3 files dirty, pointed at the Phase-1 TEST project). REPO-05 scan found no real secrets/binaries to remove beyond these (`.env*` already ignored; `.planning/*.png` + `APIcontextdocuments/*.pdf` are intentional, kept).

---

## Branch & worktree reconciliation (REPO-02)

### Canonical branch model
| Option | Description | Selected |
|--------|-------------|----------|
| main=prod, preview=pre-prod, staging=dev | Promote staging → preview → main via PR. Matches origin/HEAD=main + deploy workflows. | ✓ |
| staging is the working trunk | staging de-facto trunk; main/preview downstream. | |
| Let me describe it | Real model is something else. | |

### Local sync depth
| Option | Description | Selected |
|--------|-------------|----------|
| Fetch + FF local main/preview; document staging | Non-destructive ref update; don't force prod onto staging; flag 11/77 divergence. | ✓ |
| Also reconcile staging with origin/main | Merge origin/main into staging to close the 77-commit gap — riskier. | |
| Document only, change no local refs | Leave local main/preview stale. | |

### by/env-fixes (Phase 27)
| Option | Description | Selected |
|--------|-------------|----------|
| Document purpose, then prune local ref | Merged (0 ahead), remote gone — nothing lost. | ✓ |
| Keep + document only | Literal "surviving branches documented" reading. | |

### 6 locked GSD agent worktrees
| Option | Description | Selected |
|--------|-------------|----------|
| Verify each merged, then remove all 6 | Cheap safety check, then unlock + remove + delete branches. | ✓ |
| Remove all 6 unconditionally | Skip verification — shipped phases. | |
| Leave them, document only | Keep worktrees registered. | |

**User's choice:** All recommended options — document the main/preview/staging promotion model; fetch + fast-forward local main/preview while documenting staging's divergence (not forcing prod onto it); document-then-prune by/env-fixes; verify-then-remove all 6 worktrees + branches.
**Notes:** staging 77-behind-origin/main gap is a documented known-state, deliberately NOT closed this phase (would risk behavior change). Worktrees from shipped phases 24/27/31/47.

---

## STATE.md ↔ git reconciliation (REPO-01)

### Reconciliation depth (12 missing artifacts)
| Option | Description | Selected |
|--------|-------------|----------|
| Verify against git, record outcome, clear flag | Find actual commit per item; record present/missing+SHA; close deferred item. No reconstruction. | ✓ |
| Reconstruct the 12 artifact dirs | Mine git history to recreate directories/SUMMARYs. | |
| Mark resolved as historical loss | Clear flag without per-item verification. | |

### Audit scope
| Option | Description | Selected |
|--------|-------------|----------|
| Quick-tasks + load-bearing claims | Verify quick-task commits AND high-value facts (v4.0-baseline tag exists, branch states). | ✓ |
| Quick-task entries only | Narrow to exactly what REPO-01 names. | |
| Full STATE.md line-by-line audit | Exhaustively verify every claim. | |

**User's choice:** Verify + record + clear flag (no reconstruction); extend the audit to load-bearing claims the destructive Phases 3+ depend on.
**Notes:** —

---

## Conventions doc (REPO-04)

### Doc content
| Option | Description | Selected |
|--------|-------------|----------|
| Codify existing de-facto conventions as-is | Conventional Commits + GSD phase scopes + Co-Authored-By + branch taxonomy. | ✓ |
| Define new stricter rules | Tightened standard (mandatory scopes, regex). | |
| Minimal pointer | Short note linking the Conventional Commits spec + GSD. | |

### Doc home
| Option | Description | Selected |
|--------|-------------|----------|
| CONTRIBUTING.md at repo root | Discoverable contributor doc; CLAUDE.md points to it. | ✓ |
| In CLAUDE.md | Add a Conventions section to project memory. | |
| docs/conventions.md | Dedicated file under docs/. | |

### Enforcement
| Option | Description | Selected |
|--------|-------------|----------|
| Documentation only | No tooling; keeps zero-new-deps posture. | ✓ |
| Also add commit-lint tooling | husky + commitlint git hook. | |

**User's choice:** Codify existing conventions as-is into a new CONTRIBUTING.md; documentation-only.
**Notes:** CLAUDE.md gets a pointer to CONTRIBUTING.md rather than absorbing the full standard.

---

## Claude's Discretion

- Exact `.gitignore` line placement/grouping, precise `git rm --cached` / worktree-removal command sequencing, `CONTRIBUTING.md` wording/structure, and STATE.md reconciliation formatting — left to research + planning.

## Deferred Ideas

- Mechanical commit-message enforcement (husky + commitlint) → Phase 6 (Dependency Hygiene) if ever wanted.
- Closing the staging ↔ origin/main 77-commit divergence → deliberate non-goal here; operator-awareness only.
- Relocating `APIcontextdocuments/*.pdf` out of the repo → possible future "repo weight" pass.

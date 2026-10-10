# Phase 2: Repository Hygiene & State Reconciliation - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase reconciles the repository to a **clean, accurately-described known state** for the v4.0 Codebase Hardening milestone. It delivers five outcomes (REPO-01..05):

1. Committed-vs-uncommitted state reconciled — STATE.md quick-task entries verified against actual git history and corrected (REPO-01).
2. Stale/merged branches and leftover GSD worktrees pruned; surviving branches documented with purpose, incl. the Phase 27 `by/env-fixes` branch (REPO-02).
3. `.gitignore` tidied — no tracked files that should be ignored; `.planning/` left intact (REPO-03).
4. A commit-message + branch-naming convention documented for ongoing work (REPO-04).
5. A scan confirms no secrets, large binaries, or build artifacts are tracked (REPO-05).

**Governing constraint:** **zero functional change** — this phase touches git state + documentation ONLY. No product/source behavior is altered. **No published history is rewritten/squashed/rebased** (operator decision). Staging is always done with specific file paths — **never `git add -A` / `.` / `-f`** (`.planning/` is intentionally tracked).

**NOT in this phase:** dead-code removal (Phase 4), dependency changes (Phase 6), env-var consolidation (Phase 7), DB cleanup (Phase 8), performance work (Phase 9), or any deep-coverage test expansion (Phase 5). Mechanical commit-lint tooling is explicitly deferred.

</domain>

<decisions>
## Implementation Decisions

### Tracked-junk cleanup + `.gitignore` (REPO-03 / REPO-05)
- **D-01:** **Untrack + gitignore `dist-codex/`** (17 tracked files). Confirmed-stale Vite build output — produced by `npm run build -- --outDir dist-codex --emptyOutDir=true` during Phase 37/50 verification runs (those SUMMARYs say the output "was removed after verification"; 17 files slipped into a commit anyway). `vercel.json` has no output override, so Vercel builds its own `dist` and nothing serves `dist-codex`. Mechanism: `git rm -r --cached dist-codex/` + add `dist-codex/` to `.gitignore`.
- **D-02:** **Untrack + gitignore `supabase/.temp/`** (9 tracked CLI state files: `project-ref`, `pooler-url`, `linked-project.json`, `*-version`, etc.). This is machine-local Supabase link state, not shared config — it flips on every `supabase link` (3 files are dirty right now, pointed at the Phase-1 TEST project `cimjltzovkahkqecpwgi`). Untracking stops the perpetual dirty status. Mechanism: `git rm -r --cached supabase/.temp/` + add `supabase/.temp/` to `.gitignore`.
- **D-03:** **Untrack + delete `pricing.png`** (stray repo-root screenshot, zero references in code or config — real logos live in `public/` and `src/assets/`).
- **D-04:** **KEEP (do not touch):** intentional artifacts — `.planning/**/*.png` (dashboard/celebrations mockups), `APIcontextdocuments/**/*.pdf` (rubric/spec reference docs), `e2e/fixtures/*.pdf` + `scripts/test-resumes/*.pdf` (test fixtures), `public/` + `src/assets/` app images. The `.gitignore` `.env*` rules are already correct (no real secret env files tracked; `.claude/.../secrets.cjs` is a GSD code module, not a secret).

### Branch & worktree reconciliation (REPO-02)
- **D-05:** **Canonical branch model = `main` (production) ← `preview` (pre-prod) ← `staging` (active dev/integration)**, promoted `staging → preview → main` via PR. Matches `origin/HEAD → origin/main` + the `vercel-production-manual` workflow + deploy scripts. Document this as the source of truth in the branch doc (D-12).
- **D-06:** **Reconcile stale local tracking refs non-destructively:** `git fetch` + fast-forward local `main` (behind origin by 86) and `preview` (behind by 74) up to their origins. Do **NOT** force/merge `origin/main` onto the working `staging` line.
- **D-07:** **`staging` divergence is a documented known-state, not a fix target this phase.** `staging` is 11 ahead / 77 behind `origin/main`. v4.0 cleanup continues on `staging` as-is; the divergence (and a note that the 77-behind gap should be understood, not blindly merged) is recorded in STATE.md / the branch doc rather than reconciled now. Closing the gap would risk pulling production changes onto the active cleanup branch — out of scope for hygiene.
- **D-08:** **`by/env-fixes` (Phase 27): document purpose, then prune the local ref.** It is fully merged into `main` (0 commits ahead) and its remote tracking branch is already `gone` — nothing is lost. Record what it was (Phase 27 env fixes) in the branch doc, then `git branch -d by/env-fixes`.
- **D-09:** **6 locked GSD agent worktrees (shipped phases 24/27/31/47): verify-then-remove all.** Cheap safety check first (`git branch --merged` / `git cherry`) to confirm no orphaned work — expected clean since all four phases shipped — then `git worktree unlock` + `git worktree remove` + delete the `worktree-agent-*` branches. `.claude/worktrees/` is already gitignored; this clears `git worktree list` clutter and the stale branch refs.

### STATE.md ↔ git-history reconciliation (REPO-01)
- **D-10:** **The 12 "missing quick-task artifacts" (STATE.md Deferred Items): verify each against git history, record the outcome (present / missing + commit SHA) in STATE.md, then clear the deferred flag. No reconstruction** of the missing directories/SUMMARYs — produce an accurate record, not an archaeological rebuild.
- **D-11:** **Audit scope = quick-task entries + load-bearing claims.** Beyond the quick-task "completed/not-committed" entries, spot-check the high-value facts the destructive Phases 3+ depend on — e.g. the `v4.0-baseline` tag actually exists at the recorded commit, and the branch states in STATE.md are accurate. Not a full line-by-line STATE.md audit.

### Conventions documentation (REPO-04)
- **D-12:** **Codify the existing de-facto conventions as-is** (descriptive, not a new stricter standard): Conventional Commits with GSD `(NN-NN)` / `(phase-NN)` / `(state)` scopes, the `Co-Authored-By:` trailer, and the branch taxonomy — promotion (`main`/`preview`/`staging`), topic (`by/<initials>-<topic>`, e.g. `by/env-fixes`), and GSD agent (`worktree-agent-*`). Must not clash with GSD's auto-generated commit style.
- **D-13:** **Home = a new `CONTRIBUTING.md` at repo root** (discoverable contributor doc); `CLAUDE.md` (agent-facing memory) gets a pointer to it rather than absorbing the full standard.
- **D-14:** **Documentation only — no mechanical enforcement.** REPO-04 asks for documented conventions; no `husky`/`commitlint` added (keeps the milestone's zero-new-deps posture). Mechanical enforcement is a deferred idea (see below).

### Claude's Discretion
- Exact `.gitignore` line placement/grouping, the precise `git rm --cached` / worktree-removal command sequencing and ordering, the wording/structure of `CONTRIBUTING.md`, and how the reconciliation outcomes are formatted inside STATE.md are left to research + planning, consistent with the decisions above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements (locked)
- `.planning/ROADMAP.md` §"Phase 2: Repository Hygiene & State Reconciliation" — phase goal, depends-on (Phase 1), 5 success criteria.
- `.planning/REQUIREMENTS.md` §"Repository Hygiene & Standardization (REPO)" — REPO-01..05 plus the governing zero-functional-change constraint and the "Out of Scope: rewriting/squashing/rebasing published git history" row.
- `.planning/PROJECT.md` §"Current Milestone: v4.0" — git scope (repo hygiene only; no history rewrite; never `git add -f`/`-A`), risk appetite, hard constraint.
- `.planning/STATE.md` — §"Carried-Forward Cleanup Targets" (Phase 27 `by/env-fixes` → reconcile here; worktree prune), §"Deferred Items" (the 12 missing quick-task artifacts flagged "reconcile in Phase 2 (REPO-01)"), §"Quick Tasks Completed" (the entries to verify), §"Blockers/Concerns" (v4.0-baseline tag state).

### Repo conventions & policy
- `CLAUDE.md` — existing git rules ("NEVER COMMIT ANYTHING WITHIN `.gitignore`"; "Do not commit anything in `.planning/` or modify `.gitignore`" is superseded — see note below); reliability priorities; will receive a pointer to the new `CONTRIBUTING.md`.
- `.gitignore` (repo root) — current ignore rules; `.claude/worktrees/` already ignored; `dist`/`dist-ssr` ignored but **not** `dist-codex`; `supabase/.temp/` not yet listed.

### ⚠ Stale instruction — reconcile, don't obey blindly
- **`.planning/` IS tracked now** (changed 2026-05-11, commit `a0bf4f5`). Some older docs/CLAUDE.md text still say "do not commit `.planning/`" — that is stale. Commit `.planning/` normally with **specific file paths**; never `git add -f`, never `git add -A`/`.`. (User memory: `feedback_no_planning_commits`.)

**No external ADRs/specs govern this phase** — all decisions are captured in `<decisions>` above; the canonical inputs are the four `.planning/` docs + `.gitignore` + `CLAUDE.md`.

</canonical_refs>

<code_context>
## Existing Code Insights

(For a repo-hygiene phase, the "code" being scouted is the git repository state itself.)

### Reusable Assets / Existing structure
- **`.gitignore`** already cleanly handles `.env*` (with `!.env.example` / `!.env.test.local.example` exceptions), `node_modules`, `dist`, `dist-ssr`, logs, Playwright output (`.auth/`, `test-results/`, `playwright-report/`), and `.claude/worktrees/`. Phase-2 additions are incremental: `dist-codex/`, `supabase/.temp/`.
- **Deploy scripts** (`scripts/deploy-*.ps1`) swap `supabase/config.toml` and `supabase link` to the target project — this is *why* `supabase/.temp/` churns; untracking it (D-02) is consistent with how the scripts operate.

### Established Patterns (verified against live git state)
- **Commit style:** Conventional Commits + GSD phase scopes are already pervasive (`docs(phase-01):`, `test(01):`, `feat(24-04):`, `chore:`, `docs(state):`) — D-12 documents the existing reality.
- **Branch taxonomy (live):** remote has exactly 3 branches (`origin/main` [default], `origin/preview`, `origin/staging`); local adds `by/env-fixes` (merged, remote gone) + 6 `worktree-agent-*` (locked). PR merge history references a `kapura3-star` fork feeding `preview`/`staging`.

### Integration Points / current git facts (snapshot at discussion time)
- Working branch: `staging` @ `6ce0605`; local `main` −86, `preview` −74 vs their origins; `staging` 11 ahead / 77 behind `origin/main`.
- Tracked junk to remove: `dist-codex/` (17 files), `supabase/.temp/` (9 files), `pricing.png`.
- Dirty-on-checkout files at session start: `.planning/config.json`, `supabase/.temp/{linked-project.json,pooler-url,project-ref}` — the latter three resolve once D-02 untracks `supabase/.temp/`.
- 6 locked worktrees under `.claude/worktrees/agent-*` (phases 47/24/31/27).

</code_context>

<specifics>
## Specific Ideas

- `git rm -r --cached <path>` (index-only removal — keeps the working files) is the mechanism for D-01/D-02/D-03 so nothing is physically deleted except the deliberately-removed `pricing.png`.
- Worktree removal sequence for D-09: `git worktree unlock <path>` → `git worktree remove <path>` → `git branch -D worktree-agent-<id>` (after the merged-check), then `git worktree prune` to clear any residue.
- The branch doc / `CONTRIBUTING.md` should explicitly name the `staging → preview → main` promotion direction so future contributors don't push straight to `main`.

</specifics>

<deferred>
## Deferred Ideas

- **Mechanical commit-message enforcement** (`husky` + `commitlint`) — introduces dev dependencies + a git hook; if ever wanted, belongs in Phase 6 (Dependency Hygiene), not this doc-only phase (D-14).
- **Closing the `staging` ↔ `origin/main` 77-commit divergence** — understanding/merging the production commits not on `staging` is a deliberate non-goal here (D-07); it's a reconciliation/rebase decision outside repo-hygiene scope and would risk behavior change. Flagged for operator awareness, not actioned this phase.
- **Relocating `APIcontextdocuments/*.pdf` out of the repo** (they're sizeable reference PDFs) — kept as intentional artifacts for now (D-04); a future "repo weight" pass could move them to external storage if desired.

None of the above is scope creep — discussion stayed within Phase 2's repo-hygiene boundary.

</deferred>

---

*Phase: 2-repository-hygiene-state-reconciliation*
*Context gathered: 2026-06-12*

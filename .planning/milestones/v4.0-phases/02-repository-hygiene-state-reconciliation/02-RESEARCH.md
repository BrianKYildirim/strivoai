# Phase 2: Repository Hygiene & State Reconciliation - Research

**Researched:** 2026-06-13
**Domain:** Git repository hygiene — index/working-tree separation, worktree retirement, branch reconciliation, dependency-free secret/artifact scanning, conventions documentation. Windows 11 / PowerShell primary (Bash available).
**Confidence:** HIGH (all repo-state facts verified against live `git` output this session; command mechanics confirmed against official `git-scm` docs + Conventional Commits v1.0.0 spec)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Tracked-junk cleanup + `.gitignore` (REPO-03 / REPO-05)**
- **D-01:** Untrack + gitignore `dist-codex/` (17 tracked files). Confirmed-stale Vite build output; `vercel.json` has no output override, nothing serves `dist-codex`. Mechanism: `git rm -r --cached dist-codex/` + add `dist-codex/` to `.gitignore`.
- **D-02:** Untrack + gitignore `supabase/.temp/` (9 tracked CLI state files). Machine-local Supabase link state, not shared config; flips on every `supabase link` (3 files dirty now, pointed at Phase-1 TEST project `cimjltzovkahkqecpwgi`). Mechanism: `git rm -r --cached supabase/.temp/` + add `supabase/.temp/` to `.gitignore`.
- **D-03:** Untrack + **delete** `pricing.png` (stray repo-root screenshot, zero references; real logos live in `public/` and `src/assets/`).
- **D-04:** KEEP (do not touch): `.planning/**/*.png`, `APIcontextdocuments/**/*.pdf`, `e2e/fixtures/*.pdf` + `scripts/test-resumes/*.pdf`, `public/` + `src/assets/` images. `.gitignore` `.env*` rules already correct; `.claude/.../secrets.cjs` is a GSD code module, not a secret.

**Branch & worktree reconciliation (REPO-02)**
- **D-05:** Canonical branch model = `main` (production) ← `preview` (pre-prod) ← `staging` (active dev), promoted `staging → preview → main` via PR. Document as source of truth.
- **D-06:** Reconcile stale local tracking refs non-destructively: `git fetch` + fast-forward local `main` and `preview` up to their origins. Do **NOT** force/merge `origin/main` onto `staging`.
- **D-07:** `staging` divergence is a documented known-state, not a fix target. Record divergence in STATE.md / branch doc; do not reconcile now.
- **D-08:** `by/env-fixes` (Phase 27): document purpose, then prune the local ref (`git branch -d by/env-fixes`). Fully merged into `main`, remote tracking already `gone`.
- **D-09:** 6 locked GSD agent worktrees (shipped phases 24/27/31/47): verify-then-remove all. Safety check first (`git branch --merged` / `git cherry`), then `git worktree unlock` + `git worktree remove` + delete `worktree-agent-*` branches.

**STATE.md ↔ git-history reconciliation (REPO-01)**
- **D-10:** The 12 "missing quick-task artifacts": verify each against git history, record outcome (present / missing + SHA) in STATE.md, clear deferred flag. **No reconstruction.**
- **D-11:** Audit scope = quick-task entries + load-bearing claims (e.g. `v4.0-baseline` tag exists at recorded commit; branch states accurate). Not a full line-by-line STATE.md audit.

**Conventions documentation (REPO-04)**
- **D-12:** Codify existing de-facto conventions as-is (Conventional Commits + GSD `(NN-NN)`/`(phase-NN)`/`(state)` scopes, `Co-Authored-By:` trailer, branch taxonomy). Must not clash with GSD auto-generated commit style.
- **D-13:** Home = new `CONTRIBUTING.md` at repo root; `CLAUDE.md` gets a pointer to it.
- **D-14:** Documentation only — no `husky`/`commitlint` (zero-new-deps posture).

### Claude's Discretion
Exact `.gitignore` line placement/grouping, the precise `git rm --cached` / worktree-removal command sequencing and ordering, the wording/structure of `CONTRIBUTING.md`, and how reconciliation outcomes are formatted inside STATE.md.

### Deferred Ideas (OUT OF SCOPE)
- Mechanical commit-message enforcement (`husky` + `commitlint`) — Phase 6 if ever.
- Closing the `staging` ↔ `origin/main` ~77-commit divergence (D-07 non-goal).
- Relocating `APIcontextdocuments/*.pdf` out of the repo — future "repo weight" pass.

### Governing constraint (from REQUIREMENTS.md + CONTEXT.md)
**Zero functional change.** Git state + documentation ONLY. **No published history rewritten/squashed/rebased.** Always stage **specific file paths** — never `git add -A` / `.` / `-f`. `.planning/` stays tracked and intact.
</user_constraints>

## Summary

This is a brownfield git-state + documentation phase. The operator has already decided *what* to do (D-01..D-14); the research value is in the *exact safe command mechanics, ordering, and the one place reality diverges from the CONTEXT.md assumption*. All repo facts below were re-verified live this session — the CONTEXT snapshot was accurate except for small divergence-count drift and one material correction (see the worktree finding).

**The single most important finding for the planner:** the 6 `worktree-agent-*` branches are **NOT reachable from any ref** — not `main`, not `origin/main`, not `staging`. Each carries 2–4 unique commits, and the worktree tip content *differs* from what shipped on `origin/main` (the work was re-applied / squash-merged into the integration line, leaving the worktree tips technically unmerged by commit-graph reachability). Consequence: `git branch -d worktree-agent-*` **will refuse** all six; `git branch -D` (force) is required. D-09's "verify-then-remove" must therefore be honored with a **content-level** confidence check (the phases shipped to production via `origin/main`) plus an explicit, recorded acceptance of the force-delete — not a reachability `--merged` rubber-stamp, which would falsely report "unmerged, do not delete."

**Primary recommendation:** Sequence the phase as **(1) STATE↔git reconciliation (read-only audit, REPO-01) → (2) secret/artifact scan (read-only, REPO-05) → (3) tracked-junk untracking + `.gitignore` edit in one atomic commit each (REPO-03) → (4) branch FF + `by/env-fixes` prune + worktree retirement (REPO-02) → (5) write `CONTRIBUTING.md` + `CLAUDE.md` pointer (REPO-04) → (6) re-run `npm run verify:baseline` to prove zero functional change.** Read-only audits first so the destructive steps act on a known-true picture. Every mutation is independently re-assertable (see Validation Architecture).

## Verified Ground Truth (snapshot 2026-06-13, this session)

Re-verified against live `git` — use these, do not re-discover from scratch. Where these differ from CONTEXT.md, **these win** (CONTEXT snapshot has drifted).

| Fact | CONTEXT.md said | Verified now | Notes |
|------|-----------------|--------------|-------|
| `git --version` | — | `2.47.1.windows.1` | `core.ignorecase=true` (Windows; case-insensitive worktree) |
| Working branch | `staging` @ `6ce0605` | `staging` @ `142f2ee`, **+2 vs `origin/staging`** | HEAD advanced (context-recording commits) |
| `main` vs `origin/main` | behind 86 | **behind 86** ✓ | `main` is ancestor of `origin/main` → clean FF possible |
| `preview` vs `origin/preview` | behind 74 | **behind 74** ✓ | ancestor of `origin/preview` → clean FF possible |
| `staging` vs `origin/main` | 11 ahead / 77 behind | **13 ahead / 77 behind** | ahead drifted 11→13 (the +2 staging commits) |
| `dist-codex/` tracked | 17 files | **17 files** ✓ | includes a 6 MB `adventureofalifetime.mp3` dup of `public/` copy |
| `supabase/.temp/` tracked | 9 files | **9 files** ✓ | 3 dirty now: `linked-project.json`, `pooler-url`, `project-ref` |
| `pricing.png` tracked | yes | **yes** ✓ | repo root |
| `by/env-fixes` | merged to main, remote gone | **0 ahead of `main`, in `--merged main`, `[origin/by/env-fixes: gone]`** ✓ | safe `-d` (411 behind, that's fine) |
| 6 `worktree-agent-*` worktrees | locked, "expected clean" | **locked; each 2–4 commits NOT in main/origin/main/staging** ⚠ | **MATERIAL CORRECTION — see Pitfall 1** |
| `v4.0-baseline` tag | recorded, exists | **exists @ `fa4ccb6`, IS an ancestor of `staging`** ✓ | D-11 load-bearing claim CONFIRMED |
| `.planning/quick/` dirs | 12 missing | **18 dirs present**; STATE "Completed" table lists 2 (`260609-nks`, `fast`) | both Completed-table SHAs verified present (see REPO-01) |
| Secret scan | clean | **clean** — only `.env.example` + `.env.test.local.example` tracked; `secrets.cjs` = GSD module; key-pattern hits are inside `.planning/` docs *describing* scans, not real values | REPO-05 effectively pre-passing |
| Other artifact dirs (`dist/`,`build/`,`coverage/`,`.vercel/`) | — | **none tracked** | only `dist-codex/` is stray |
| `CONTRIBUTING.md` | to be created | **does not exist** ✓ | Phase 2 creates it |
| `.gitignore` ignores `dist-codex`/`supabase/.temp`? | no | **no** (`git check-ignore` returns non-match for both) | so untrack-then-ignore order is correct |

## Standard Stack

This phase adds **zero dependencies** (D-14). The "stack" is the git toolchain already installed plus already-present npm scripts.

### Core (already installed)
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `git` | 2.47.1.windows.1 | All index/worktree/branch ops | Native; `git rm --cached`, `git worktree`, `git fetch <refspec>` cover every D-01..D-09 mechanic with no extra tooling |
| `npm run verify:baseline` | (Phase 1) | Zero-functional-change gate | The milestone spine (TEST-06/NFR-01). Chains `vitest` + offline `deno` + Playwright. Re-running it AFTER the phase proves no behavior changed |
| PowerShell 5.1+ / pwsh | Win11 | Primary shell | Use for `.gitignore` edits and verification one-liners; mind CRLF |
| Bash (Git Bash / WSL) | available | POSIX one-liners | Use for `wc -l`, `xargs`, `grep` style assertions |

### Supporting (optional — do NOT install unless trivial)
| Tool | Purpose | When to Use | Verdict |
|------|---------|-------------|---------|
| `gitleaks` | Secret scanning | If a heavyweight, signature-based scan is wanted | **SKIP** — adds a Go binary; the dependency-free `git grep` + `git ls-files` approach below already produces clean evidence for REPO-05. Note as "available if a future audit wants depth" |
| `trufflehog` | Entropy + verified-secret scanning | Deep history scan | **SKIP** — heavyweight (Python/Go), scans full history (out of scope; we don't rewrite history). Dependency-free approach is sufficient |

**Installation:** None. This is a deliberate non-goal (D-14, zero-new-deps milestone posture).

## Architecture Patterns

### Recommended Phase Execution Order (read-only first, mutation last)
```
1. REPO-01  STATE↔git reconciliation   (READ-ONLY audit → edit STATE.md text)
2. REPO-05  secret/binary/artifact scan (READ-ONLY → record evidence)
3. REPO-03  untrack junk + .gitignore   (MUTATION: git rm --cached, edit .gitignore)
4. REPO-02  branch FF + prune + worktrees (MUTATION: fetch, branch -d/-D, worktree remove)
5. REPO-04  CONTRIBUTING.md + CLAUDE.md  (NEW FILE + pointer)
6. verify:baseline re-run               (PROOF of zero functional change)
```
**Why this order:** audits (1,2) establish a known-true picture before any mutation; tracked-junk removal (3) is independent and lowest-risk; branch/worktree ops (4) are the trickiest and benefit from the scan already done; docs (5) capture the *now-true* branch reality; the baseline (6) is the gate.

### Pattern 1: Untrack-then-ignore, one atomic commit per concern (D-01/D-02/D-03)
**What:** Remove from index with `git rm -r --cached`, add the ignore rule in the *same commit*, so the repo never has a window where the path is both untracked and unignored (which would re-stage on the next `git add <path>`).
**When to use:** Every untrack-a-now-ignored-path operation.
**Mechanics (verified against git-scm `git-rm` docs):**
- `--cached` removes from the **index only**; working-tree files are **left alone** (official: *"Working tree files, whether modified or not, will be left alone."*). So `dist-codex/` and `supabase/.temp/` files stay on disk — nothing physically deleted.
- `-r` allows recursive removal of a directory.
- **Caveat that bites `supabase/.temp/` (D-02):** git-rm refuses if staged content differs from both branch tip and working file — but `--cached` removal of files that are merely *modified in the working tree* (our 3 dirty `.temp` files) is fine; `--cached` only compares the index entry. If git ever complains, the dirty `.temp` files are the reason; resolving is just letting `--cached` drop the index entry. Do **not** reach for `-f` reflexively — confirm the message first.
```bash
# D-01 — dist-codex (PowerShell or Bash, identical)
git rm -r --cached dist-codex/
# add 'dist-codex/' to .gitignore (see .gitignore pattern section)
git add .gitignore                      # specific path — never -A
git commit -m "chore(02): untrack stale dist-codex build output (REPO-03)"

# D-02 — supabase/.temp
git rm -r --cached "supabase/.temp/"     # quote the dot-dir on PowerShell
git add .gitignore
git commit -m "chore(02): untrack machine-local supabase/.temp CLI state (REPO-03)"

# D-03 — pricing.png (delete from disk too, not --cached)
git rm pricing.png                       # no --cached: actually remove the stray file
git commit -m "chore(02): remove stray repo-root pricing.png (REPO-03)"
```
**Note on D-03:** `pricing.png` is the one path that *should* leave the working tree — so it uses plain `git rm` (not `--cached`). No `.gitignore` rule needed for it.

### Pattern 2: Branch fast-forward without checkout (D-06)
**What:** Advance local `main`/`preview` to their origins without leaving `staging`.
**When to use:** Updating a stale tracking branch you don't want to check out.
**Mechanics (verified: both `main` and `preview` ARE ancestors of their origins → clean FF):**
```bash
git fetch origin
# Fast-forward local refs in place, no checkout:
git fetch origin main:main          # updates local main to origin/main (FF-only by default)
git fetch origin preview:preview    # updates local preview to origin/preview
```
**FF semantics:** `git fetch <remote> <src>:<dst>` updates the local branch `<dst>` only if the update is a fast-forward (i.e. `<dst>` is an ancestor of `<src>`). If it is **not** an ancestor, the fetch **refuses** with `[rejected] (non-fast-forward)` and changes nothing — which is exactly the safety we want. We verified `main` and `preview` are ancestors, so both succeed cleanly. **Never** run this for `staging` against `origin/main` (D-06/D-07 forbid pulling production onto the cleanup line).

### Pattern 3: Safe branch prune — distinguish `-d` from `-D` (D-08 vs D-09)
**What:** `git branch -d` refuses to delete a branch not merged into its upstream or HEAD; `-D` forces it.
- **D-08 `by/env-fixes`:** verified `0` commits ahead of `main` and present in `git branch --merged main` → **`git branch -d by/env-fixes` succeeds** (the 411-behind is irrelevant; "merged" = no unique commits). Safe, no force needed.
- **D-09 `worktree-agent-*`:** verified each has 2–4 commits NOT in any ref → **`-d` will REFUSE**; **`-D` (force) is required.** This is expected and safe *given the content-level confirmation* in Pitfall 1 — but the plan MUST record that confirmation, not silently force.

### Pattern 4: Locked-worktree retirement sequence (D-09)
**What:** A *locked* worktree cannot be removed until unlocked; a worktree with no uncommitted changes removes cleanly; the branch is deleted separately; `prune` clears residue.
**Verified state:** all 6 are `locked`, live under `C:/Projects/strive-ai-hired/.claude/worktrees/agent-*`, and `.claude/worktrees/` is already gitignored.
**Sequence (per worktree):**
```bash
# 1. unlock (locked worktrees refuse removal)
git worktree unlock ".claude/worktrees/agent-a5e298e3"
# 2. remove the worktree (refuses if it has uncommitted changes; add --force only if a
#    stale lockfile/dirty tree blocks AND you've confirmed no wanted changes)
git worktree remove ".claude/worktrees/agent-a5e298e3"
# 3. delete the now-orphaned branch (FORCE required — see Pitfall 1)
git branch -D worktree-agent-a5e298e3
# ...repeat for all 6...
# 4. clear any residual administrative files
git worktree prune
git worktree list   # assert: only the main worktree remains
```
**Windows path/locking gotchas:**
- Use forward slashes or quoted paths; PowerShell tolerates `/` in git args.
- A worktree dir held open by an editor/terminal (cwd inside it) makes `git worktree remove` fail with a file-in-use error. Ensure no shell/editor has its cwd inside `.claude/worktrees/agent-*`. Close VS Code panes pointed there first.
- If `remove` leaves a directory behind (Windows lock), `git worktree prune` plus a manual `Remove-Item -Recurse -Force` of the leftover dir resolves it — but try the clean path first.
- `core.ignorecase=true`: harmless here (all agent dir names are unique-cased), but never rely on case to distinguish paths.

### Anti-Patterns to Avoid
- **`git add -A` / `git add .`** — forbidden (would sweep `.planning/` churn and dirty `.temp` files). Stage explicit paths only.
- **`git add -f`** — forbidden (would re-track a just-ignored path).
- **`git rebase` / `git commit --amend` / `git push --force` on any pushed branch** — forbidden (rewrites published history; the milestone's hard line).
- **`git branch -D by/env-fixes`** — over-forcing; it's cleanly merged, use `-d` so git's safety check still runs.
- **`git worktree remove --force` as a reflex** — only after confirming the worktree has no wanted uncommitted changes.
- **Fast-forwarding `staging` toward `origin/main`** — D-06/D-07 forbid; risks pulling 77 production commits onto the cleanup line (behavior change).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Untrack files but keep them on disk | A script that deletes + re-adds | `git rm -r --cached <path>` | Native, atomic-per-path, leaves working tree untouched (official guarantee) |
| Update stale local branch w/o checkout | `git checkout main && git merge && git checkout staging` | `git fetch origin main:main` | FF-only refspec is safer (refuses non-FF), never disturbs working tree, no checkout thrash |
| "Is this branch safe to delete?" | Eyeballing `git log` | `git rev-list --count main..<b>` + `git log <b> --not --remotes` + content diff | Reachability count is exact; content diff catches the squash-merge case (Pitfall 1) |
| Secret scanning | Bespoke regex crawler | `git grep -nIE '<key patterns>'` over tracked files + `git ls-files \| size-check` | Dependency-free, scans only tracked content, integrates with the index — no new binary (D-14) |
| Find large tracked blobs | Manual `du` of whole tree | `git ls-files -z \| xargs -0 du -k \| sort -rn` | Restricts to *tracked* files (working-tree junk like node_modules excluded automatically) |

**Key insight:** every D-01..D-09 mechanic is a single native git verb. The risk here is **ordering and verification**, not missing tooling — so the planner's value-add is the assert-after-each-step discipline in Validation Architecture, not new code.

## Common Pitfalls

### Pitfall 1: `--merged` lies for squash-merged worktree branches (THE big one)
**What goes wrong:** Running `git branch --merged main` (or `--merged staging`) to "confirm no orphaned work" before deleting the 6 `worktree-agent-*` branches will show them as **NOT merged** (they don't appear in `--merged`; they have 2–4 unique commits). A naive reading is "unmerged work — do NOT delete," which would strand them forever and fail D-09.
**Why it happens:** GSD agents do work on a worktree branch, then that work lands on the integration line via squash-merge or re-application under *new* SHAs. The original worktree commits become unreachable even though their *content* shipped. Verified: `worktree-agent-a5e298e3` (phase 24-04) tip differs from `origin/main`'s `useFeatureCosts.ts`, yet phase 24 shipped to production. Reachability says "unmerged"; reality says "shipped."
**How to avoid:** Use a **content/disposition** check, not a reachability check. Confirm the *phase* shipped (phases 24/27/31/47 are all in production per STATE.md / SUMMARYs), record that as the disposition, then force-delete:
```bash
# Disposition evidence to record per branch (not a gate that must be empty):
git log <wt-branch> --not origin/main origin/preview origin/staging --oneline   # the unique tip commits
git show <wt-branch> -1 --stat                                                  # what the tip touched
# Confirm the phase shipped via STATE.md/SUMMARY (phases 24,27,31,47 = shipped) → accept force-delete:
git branch -D worktree-agent-<id>
```
**Warning signs:** `git branch -d worktree-agent-*` errors with *"not fully merged"* — this is EXPECTED here, not a stop sign. Document the rationale (phase shipped) in the branch doc / SUMMARY so the force-delete is auditable.

### Pitfall 2: Untracking before ignoring (or vice-versa) in separate commits
**What goes wrong:** Untrack `dist-codex/` in commit A, add the ignore rule in commit B — between them the path is untracked-but-not-ignored, so a stray `git add dist-codex/index.html` re-tracks it.
**How to avoid:** Stage the `git rm --cached` removal AND the `.gitignore` edit, commit them **together** (Pattern 1). Verify with `git check-ignore dist-codex/index.html` returning the path (= ignored) post-commit.
**Warning signs:** `git status` shows `dist-codex/` files as untracked (not ignored) after the rm.

### Pitfall 3: `git rm --cached "supabase/.temp/"` and the 3 dirty files
**What goes wrong:** On PowerShell the unquoted dot-leading path `supabase/.temp/` can confuse globbing, and the 3 currently-modified files (`linked-project.json`, `pooler-url`, `project-ref`) make `git rm` *seem* risky.
**How to avoid:** Quote the path. `--cached` removal works regardless of working-tree modification (it drops the index entry; the dirty disk files stay). After the commit, the perpetual `git status` dirtiness disappears because the path is now ignored. Verify: `git status --porcelain` shows nothing under `supabase/.temp/`.
**Warning signs:** if `git rm` errors, read the message — it'll name the file; the fix is confirming `--cached` (not the dirty state) and never `-f`.

### Pitfall 4: CRLF/LF on `.gitignore` and `CONTRIBUTING.md` edits (Windows)
**What goes wrong:** PowerShell `Add-Content`/`Set-Content` defaults to UTF-8-with-BOM and CRLF, which can produce a noisy diff or a BOM at the top of `.gitignore`.
**How to avoid:** Append with explicit LF and no BOM, or edit via the Edit tool (which preserves existing EOL). For `.gitignore`, match the file's existing LF endings. Verify the diff is *only* the intended added lines (`git diff .gitignore`).
**Warning signs:** `git diff` shows the entire file changed (EOL flip) or a leading UTF-8 BOM marker (codepoint U+FEFF) appears at the top of the file.

### Pitfall 5: Mis-reading the `staging` divergence as a defect to fix
**What goes wrong:** Seeing `staging` 77-behind `origin/main` and "helpfully" merging origin/main in.
**How to avoid:** D-07 is explicit — this is a **documented known-state**, not a fix target. The 77 commits are production changes that must NOT be blindly pulled onto the active cleanup branch (behavior-change risk). Record the divergence; do not reconcile.
**Warning signs:** any plan task that runs `git merge origin/main` or `git pull` on `staging`.

### Pitfall 6: Secret-scan false positives in `.planning/` docs
**What goes wrong:** A grep for `sk_test|service_role|eyJ` hits `.planning/**` SUMMARY/PLAN files that *describe* scans (verified: 2 such hits), and `secrets.cjs` (a GSD module name).
**How to avoid:** Classify, don't panic. The `.planning/` hits are documentation strings, not live values; `secrets.cjs` is code (D-04 explicitly notes this). Distinguish by inspecting the match: a real leak is an actual `sk_test_<20+ chars>` value, not the literal token inside prose. Record the false positives by name so the scan's "clean" verdict is defensible.

## Code Examples

Verified, dependency-free, copy-pasteable. PowerShell and Bash forms given where they differ.

### REPO-01 — Verify a quick-task's claimed commit + directory (D-10/D-11)
```bash
# Does the claimed commit exist anywhere in history?
git log --all --oneline --grep "260609-nks"        # subject-based
git cat-file -t 2ae4ba7                             # exists? prints "commit"
# Does the artifact directory exist on disk / in tree?
git ls-files ".planning/quick/260609-nks-infrastructure-deploy-workflow-simplific/" | head
# Record outcome row: present (SHA) | missing (no commit / no dir)
```
**Verified this session:** STATE "Quick Tasks Completed" lists 2 entries — `260609-nks` (SHA `2ae4ba7`) and `fast` (SHA `df690af`); both SHAs resolve in history and `260609-nks`'s dir exists. The "12 missing artifacts" are a *separate* Deferred-Items count to reconcile against the 18 present `.planning/quick/` dirs by name. The planner should enumerate all 18 dirs, cross-check each against any STATE claim, and produce a present/missing+SHA table — **no reconstruction** (D-10).

### REPO-05 — Dependency-free secret / binary / artifact scan
```bash
# 1. Secret patterns over TRACKED files only (excludes node_modules etc. automatically):
git grep -nIE "sk_live_[A-Za-z0-9]{20}|sk_test_[A-Za-z0-9]{20}|pk_live_[A-Za-z0-9]{20}|service_role[^a-zA-Z0-9]{0,40}eyJ|-----BEGIN [A-Z ]*PRIVATE KEY-----" -- ':!.planning/*' ':!*.test.*'
# 2. Tracked .env files (should be ONLY *.example):
git ls-files | grep -iE "\.env"
# 3. Largest tracked blobs (find stray binaries):  Bash:
git ls-files -z | xargs -0 du -k 2>/dev/null | sort -rn | head -15
#    PowerShell equivalent:
git ls-files | ForEach-Object { [pscustomobject]@{ KB=[math]::Round((Get-Item $_ -EA SilentlyContinue).Length/1KB); Path=$_ } } | Sort-Object KB -Desc | Select-Object -First 15
# 4. Build-artifact dirs that slipped in:
git ls-files | grep -iE "^(dist|build|out|coverage|\.next|\.vercel)/"
```
**Verified verdict (this session):** scan is **clean** — only `.env.example` + `.env.test.local.example` tracked; the only key-pattern hits are inside `.planning/` docs describing scans (excluded above with `:!.planning/*`); `secrets.cjs` is a code module; after D-01 removes `dist-codex/`, no build-artifact dir remains. REPO-05 is effectively pre-passing; the phase's job is to **record the evidence**, and the `dist-codex/` removal (D-01) closes the only artifact gap.

### REPO-03 — `.gitignore` pattern syntax (D-01/D-02)
Append a grouped block (place near the existing `dist`/`dist-ssr` and Supabase-adjacent rules):
```gitignore
# Stale/alternate Vite build output (never served; Vercel builds its own dist)
dist-codex/

# Supabase CLI machine-local link state (flips per `supabase link`; not shared config)
supabase/.temp/
```
**Pattern notes:** trailing `/` matches the directory and everything under it (correct for both); no leading `/` needed since both are anchored by their unique path. Do NOT touch the existing `.env*`, `.claude/worktrees/`, or `.planning`-adjacent rules. `.planning/` is intentionally *not* ignored — leave it that way.

### REPO-02 — Full branch-reconciliation block (D-06/D-08/D-09)
```bash
git fetch origin --prune
git fetch origin main:main          # FF local main (verified ancestor → succeeds)
git fetch origin preview:preview    # FF local preview (verified ancestor → succeeds)
git branch -d by/env-fixes          # safe delete (verified merged into main)
# worktrees: per Pattern 4, unlock → remove → branch -D → prune
git worktree list                   # assert only main worktree remains
git branch -vv                      # assert: main/preview/staging only (+ no worktree-agent-*)
```

### REPO-04 — Conventions to codify in CONTRIBUTING.md (D-12/D-13)
Conventional Commits v1.0.0 template (authoritative, quoted verbatim from spec):
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```
Recognized **types** (spec): `feat`, `fix`, plus `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`. Breaking change = `!` before the colon and/or a `BREAKING CHANGE:` footer (token MUST be uppercase). Footers are git trailers: `Token: value` with hyphens for spaces.

**De-facto GSD reality to document as-is (sampled live this session):**
- Scopes seen: `(NN-NN)` phase-plan (`feat(01-03)`, `test(24-04)`), `(phase-NN)` (`docs(phase-01)`), `(state)` (`docs(state)`), `(NN)` (`test(01)`), `(NNNNNN-xxx)` quick-task (`docs(260609-nks)`), plain (`chore:`).
- Trailer: `Co-Authored-By: <name> <email>` (GSD auto-appends a Claude trailer; the convention must **not clash** — document it as accepted, not forbidden).
- Branch taxonomy (live): promotion `main`/`preview`/`staging`; topic `by/<initials>-<topic>` (e.g. `by/env-fixes`); GSD agent `worktree-agent-*` (ephemeral, auto-managed, gitignored worktrees).
- Promotion direction: **`staging → preview → main` via PR** (D-05). State this explicitly so contributors never push straight to `main`.

**Minimal CONTRIBUTING.md structure (recommended):**
```
# Contributing to Strivo AI
## Branch model            (staging → preview → main; topic by/<init>-<topic>; agent worktree-agent-*)
## Commit messages         (Conventional Commits + GSD scopes table + Co-Authored-By trailer; examples)
## Staging discipline      (specific paths only; never git add -A/./-f; .planning/ IS tracked)
## What not to do          (no history rewrite on pushed branches; no husky/commitlint — doc-only)
## Validation before PR    (npm run verify:baseline must pass)
```
`CLAUDE.md` gets a one-line pointer: *"Commit/branch conventions: see CONTRIBUTING.md."* (D-13) — do not duplicate the full standard into CLAUDE.md.

## Validation Architecture

Per Nyquist: every REPO-0x outcome must be **independently re-assertable after execution** with a git-state command. This phase has no runtime behavior, so validation = git-state assertions + the Phase-1 baseline re-run. The planner should embed these as task verification steps.

| Req | Outcome | Independent assertion (expected result) |
|-----|---------|------------------------------------------|
| REPO-01 | STATE↔git reconciled | Every "Quick Tasks Completed" SHA resolves: `git cat-file -t <sha>` → `commit`; deferred "12 missing" flag replaced by a present/missing+SHA table in STATE.md (text diff review) |
| REPO-02a | `main`/`preview` FF'd | `git rev-list --count main..origin/main` → `0`; same for `preview` |
| REPO-02b | `by/env-fixes` pruned | `git branch --list by/env-fixes` → empty |
| REPO-02c | worktrees retired | `git worktree list` → **1 line** (main only); `git branch --list "worktree-agent-*"` → empty; `git worktree prune --dry-run` → empty |
| REPO-02d | surviving branches documented | `git branch -vv` shows only `main`/`preview`/`staging`; CONTRIBUTING.md + branch doc enumerate each with purpose |
| REPO-03a | `dist-codex/` untracked | `git ls-files dist-codex/` → **0 lines**; `git check-ignore dist-codex/index.html` → prints the path (ignored); dir still on disk (`Test-Path dist-codex` → True) |
| REPO-03b | `supabase/.temp/` untracked | `git ls-files supabase/.temp/` → **0 lines**; `git status --porcelain` shows **nothing** under `supabase/.temp/` (perpetual-dirty fixed); `git check-ignore supabase/.temp/project-ref` → prints path |
| REPO-03c | `pricing.png` gone | `git ls-files pricing.png` → empty; `Test-Path pricing.png` → False |
| REPO-03d | `.planning/` intact | `git ls-files .planning/ | wc -l` unchanged (still tracked); `git check-ignore .planning/STATE.md` → no match (NOT ignored) |
| REPO-04 | conventions documented | `Test-Path CONTRIBUTING.md` → True; file contains the 5 required sections; `CLAUDE.md` contains a CONTRIBUTING.md pointer |
| REPO-05 | no secrets/binaries/artifacts | Re-run the REPO-05 scan block → no real-secret findings (only the documented `.planning/`/`secrets.cjs` false positives); `git ls-files | grep -iE "^(dist|build|dist-codex|coverage)/"` → empty |
| NFR-01 | zero functional change | `npm run verify:baseline` → green (same pass/fail profile as Phase-1 `v4.0-baseline` @ `fa4ccb6`); no `src/` or `supabase/functions/` source files touched (`git diff --stat <baseline>..HEAD -- src supabase/functions` → only intended/none) |

**Baseline note:** `v4.0-baseline` (`fa4ccb6`) is confirmed an ancestor of `staging`, so the re-run is apples-to-apples. Per the Phase-1 blockers, the baseline's E2E Stripe flow may still need operator TEST-mode Stripe secrets; that's a pre-existing infra gate, not introduced by this phase — the zero-functional-change proof is "same profile as baseline," not "all green from scratch."

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `git update-index --assume-unchanged` / `--skip-worktree` to hide CLI state | `git rm --cached` + `.gitignore` | long-standing | `--assume-unchanged` is per-clone, not shared, and silently re-appears for others; untrack+ignore is the durable, shared fix (correct for D-02) |
| Manual `du`/`find` to spot big files | `git ls-files | xargs du` / `git rev-list --objects` | — | Restricts to tracked content, ignores working-tree junk automatically |
| Hand-rolled commit-format prose | Conventional Commits v1.0.0 (stable since 2019) | 2019 | Stable, tool-agnostic spec; documenting it (D-12) needs no tooling — `commitlint` enforcement is the *optional* deferred layer (D-14) |

**Deprecated/outdated for this phase:**
- Reachability-only "merged?" checks (`git branch --merged`) for the worktree branches — superseded by the content/disposition check (Pitfall 1) because of squash-merge.
- The stale CLAUDE.md/older-doc instruction *"do not commit `.planning/`"* — superseded 2026-05-11 (commit `a0bf4f5`); `.planning/` IS tracked now (CONTEXT canonical-refs warning; user memory `feedback_no_planning_commits`).

## Open Questions

1. **Are the 6 worktree branches' phases all truly shipped to production?**
   - What we know: STATE.md + SUMMARYs say phases 24/27/31/47 shipped; their content is on `origin/main` (verified for 24-04's file). The worktree tips are unreachable but that's the squash-merge artifact.
   - What's unclear: whether any worktree tip holds a *last uncommitted tweak* never carried forward (low likelihood — they're committed branch tips, and the phases are closed).
   - Recommendation: the plan records, per branch, the unique-commit subjects (`git log <b> --not origin/main --oneline`) and the shipped-phase disposition, then force-deletes. This makes the decision auditable; if any tip shows surprising un-shipped work, the operator pauses on that one branch. (Expected: all 6 clear.)

2. **Exact membership of the "12 missing quick-task artifacts."**
   - What we know: 18 `.planning/quick/` dirs exist; STATE "Completed" table names 2 with verified SHAs; the "12 missing" is a Deferred-Items count from v3.0 close.
   - What's unclear: which 12 — they're not enumerated in the current STATE.md (the detail lives in `.planning/milestones/` per the doc).
   - Recommendation: the plan reads `.planning/milestones/` for the original quick-task list, diffs it against the 18 present dirs + git history (`git log --all --grep`), and produces the present/missing+SHA table. No reconstruction (D-10).

## Sources

### Primary (HIGH confidence)
- **Live `git` state** (this session, 2026-06-13) — `git branch -vv`, `git worktree list`, `git ls-files`, `git rev-list --left-right --count`, `git log <b> --not <refs>`, `git check-ignore`, `git merge-base --is-ancestor`, `git tag`, `git grep`. Every "Verified Ground Truth" row and the Pitfall-1 finding come from direct output.
- **git-scm.com/docs/git-rm** — `--cached` removes from index only, working tree left alone; `-r` recursive; staged-content caveat.
- **conventionalcommits.org/en/v1.0.0** — commit structure template, recognized types, BREAKING CHANGE signaling, footer/trailer rules.

### Secondary (MEDIUM confidence)
- CONTEXT.md (D-01..D-14), REQUIREMENTS.md (REPO-01..05 + zero-functional-change constraint), STATE.md (quick-task table, deferred items, baseline blockers), CLAUDE.md (git rules), `.gitignore` (current rules) — project-internal canonical inputs, cross-checked against live git where they made factual claims.

### Tertiary (LOW confidence)
- None relied upon. `gitleaks`/`trufflehog` mentioned only to recommend *against* installing them (D-14).

## Metadata

**Confidence breakdown:**
- Tracked-junk untracking mechanics (REPO-03): **HIGH** — git-scm docs + live `check-ignore`/`ls-files` verification.
- Branch FF + `by/env-fixes` prune (REPO-02a/b): **HIGH** — ancestry + `--merged` verified live; clean FF and safe `-d` confirmed.
- Worktree retirement (REPO-02c, D-09): **HIGH on mechanics, HIGH on the corrected merge-status finding** — the `-D`-required reality is directly observed; the only residual is the (low-risk) Open Question 1 disposition, which the plan handles by recording evidence.
- Secret/artifact scan (REPO-05): **HIGH** — scan run live, clean, false positives identified by name.
- Conventions doc (REPO-04): **HIGH** — spec quoted verbatim; de-facto scopes sampled from live `git log`.
- STATE↔git reconciliation (REPO-01): **MEDIUM** — mechanics HIGH, but the exact 12-item membership needs the `.planning/milestones/` read (Open Question 2).

**Research date:** 2026-06-13
**Valid until:** ~2026-07-13 for command mechanics (git/Conventional Commits are stable). Repo-state facts (divergence counts, dirty files, worktree set) are a **point-in-time snapshot** — re-run the Verified Ground Truth assertions at plan-execution time, as `staging`/`origin` will continue to move.

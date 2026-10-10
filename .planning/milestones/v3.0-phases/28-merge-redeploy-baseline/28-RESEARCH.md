# Phase 28: Merge & Redeploy Baseline - Research

**Researched:** 2026-04-28
**Domain:** Operator-led merge + Supabase Edge Function redeploy + legacy function deletion + production 503 verification
**Confidence:** HIGH (procedural; all decisions locked; evidence verified in repo state)

---

## Summary

Phase 28 is a strictly procedural, operator-led prerequisite gate for v3.0. It ships zero feature code. The plan's job is to make the runbook airtight: gate the FF merge with bulletproof preflight, sequence staging → soak → prod redeploy with a deterministic smoke battery, capture machine-extractable evidence for SC #1–4, then delete `interview-prep-coach` and either confirm IPC drift-resolved (200) or hand a fresh-deploy 503 to Phase 41.

**Three findings change how the plan should be written:**

1. **The FF preflight in D-03 will FAIL against current branch state.** `git log by/env-fixes..main --oneline` returns SIX commits (5 PR merges + 1 squash-merge), not empty. `main` has diverged. CONTEXT.md D-03 says "preflight gate (both must pass before the real merge)" — it does pass per spec, since one of its gates is exactly "is `git log by/env-fixes..main` empty?" — but a FAILED preflight in the current state means the plan must have a clear branch — operator path beyond "abort". This is the single most important finding for the planner. See §"Branch State Reality Check" below.

2. **`git stash -u --keep-index` will stash tracked deletions of `.planning/phases/*-SUMMARY.md` files.** These files are git-tracked despite `.planning/` being in `.gitignore` (gitignore only stops *new* files; already-tracked files stay tracked). The 10 deleted summaries plus 2 modified `supabase/.temp/*` files are all tracked changes — the stash IS needed and will work. `-u` for untracked is moot (gitignored files are not stashed by `-u` either). [VERIFIED: `git ls-files --error-unmatch` confirms tracked]

3. **The IPC 503 production-failure log evidence is preserved** at `.planning/PROJECT.md:37`: `TTFB 8.91s, in=2686 / out=986, sonnet-4 in production logs 2026-04-28`. Tier is not captured. The exact request payload (resume_text, IntakeForm fields) is NOT preserved anywhere in `.planning/`. SC #3 D-14 repro fidelity is therefore at risk — see §"IPC 503 Repro Fidelity Risk" below for the proposed fallback.

**Primary recommendation:** Plan the merge as a 4-phase runbook: (Wave 0) FF feasibility audit + dirty-tree handling, (Wave 1) FF merge + operator push, (Wave 2) staging deploy + soak + prod deploy, (Wave 3) `interview-prep-coach` delete + IPC 503 repro + VERIFICATION.md authoring. Every step in Waves 1–3 emits a captured-output artifact for VERIFICATION.md.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Merge strategy**
- **D-01:** Use **fast-forward merge** of `by/env-fixes` → `main`. No squash. No rebase.
- **D-02:** Pre-merge dirty-tree handling: `git stash -u --keep-index` BEFORE the FF, restore after. Working tree contains 10 deleted `.planning/phases/*-SUMMARY.md` files and `supabase/.temp/` modifications. **NEVER commit anything under `.planning/` or `.gitignore`** — these stay stashed/discarded, never staged.
- **D-03:** Pre-FF preflight gate (both must pass before the real merge):
  - `git log by/env-fixes..main` is empty (confirms `main` has not diverged so FF is possible).
  - `git merge --ff-only --no-commit` dry-run executed and aborted (confirms zero conflicts).
- **D-04:** **Operator runs `git push origin main` manually.** Claude does NOT push. Plan's push step is a `[OPERATOR]` step.

**Deploy sequencing**
- **D-05:** **Staging first → smoke gate → production.** `scripts/deploy-staging.ps1` first, soak/verify, only then `scripts/deploy-production.ps1`.
- **D-06:** **Redeploy ALL edge functions from `main`.** Existing PowerShell deploy scripts already enumerate the function list.
- **D-07:** Staging smoke gate (all four must pass before promoting to prod):
  1. IPC 503 repro returns 200 — direct SC #3 evidence.
  2. Phase 25/26/27 surfaces observable — `MeritCostPreview` on `/career-compass`; `refundMeritsForJob` `already_refunded` for both async workers; 410-Gone shim at legacy `/stripe-webhook`. Direct SC #4 evidence.
  3. All 5 features run a one-shot smoke — Resume Analysis, LinkedIn Grader, Career Compass, Recruiting Lens, Interview Prep each get one analyze call.
  4. Edge function logs clean for ~5 minutes — watch Supabase function logs for new error spikes.
- **D-08:** **Soak window: ~5 minutes** post-staging-deploy after smoke passes, before running `deploy-production.ps1`.
- **D-09:** **Post-prod verification battery = same battery as staging gate.** Re-run all four smoke items against production.

**Legacy `interview-prep-coach` delete**
- **D-10:** Run `supabase functions delete interview-prep-coach` AFTER prod redeploy + smoke passes.
- **D-11:** Per-env order: staging first, then production.
- **D-12:** Pre-delete preflight: `rg -n interview-prep-coach src/ supabase/`. Expect zero live refs in `src/` or `supabase/functions/`; only `.planning/` references are allowed. Halt if a live ref exists.
- **D-13:** Verification artifact for SC #2: capture `supabase functions list --project-ref <STAGING>` AND `<PROD>` output post-delete; both lists must exclude `interview-prep-coach`.

**503 verification + rollback**
- **D-14:** SC #3 repro = replay the original failing payload (logged with `sonnet-4` model name). Replay against post-redeploy production. Fresh end-to-end IPC flow rejected.
- **D-15:** Repro tier coverage: original-tier (primary) + Pro + Elite. Free only if original was Free.
- **D-16:** If IPC alone is 503ing post-redeploy: hand off to Phase 41 with fresh-deploy evidence. Do NOT revert the merge.
- **D-17:** Revert triggers: regression in Resume/LinkedIn/CC/Recruiting Lens beyond IPC; Phase 25/26/27 surfaces missing post-deploy; Merit balance / Stripe webhook regression.
- **D-18:** Closing artifact = VERIFICATION.md as SC #1–4 checklist with exact command + captured output inline; machine-extractable.

### Claude's Discretion

- Exact PowerShell incantation / parameter set for `deploy-staging.ps1` / `deploy-production.ps1` invocation.
- Specific log query strings used during the 5-minute log soak.
- Format of the captured `supabase functions list` output (raw paste vs. table reformat).

### Deferred Ideas (OUT OF SCOPE)

- Persistent IPC 503 investigation — owned by Phase 41.
- VERIFICATION backfill for v2.0 phases (10, 19, 22, 24, 27).
- Live tier-output validation harness, Docker pgTAP for Phase 11, perf p99 live-run.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MERGE-01 | Operator merges `by/env-fixes` to `main` before any v3.0 phase begins. Resolved when `git log main..by/env-fixes --oneline` returns empty. | §"Branch State Reality Check"; §"FF Merge Mechanics"; §"Dirty-Tree Stash Semantics" |
| MERGE-02 | Operator redeploys all edge functions from `main` post-merge to staging + production. IPC 503 log shows `sonnet-4` despite Haiku-only `tier-config.ts` post-`260419-hku` — strong deploy-drift signal. | §"Deploy Script Anatomy"; §"IPC 503 Deploy-Drift Hypothesis"; §"Phase 25/26/27 Surface Verification" |
| MERGE-03 | Operator deletes legacy `interview-prep-coach` from staging + production. | §"Legacy Function Deletion Mechanics"; §"Live Reference Audit" |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Local branch reconciliation (FF merge) | Operator workstation (git CLI) | — | Pure local git op; produces no service-side state. |
| Remote branch update | GitHub origin | — | `git push` writes to origin/main. Operator-only per D-04. |
| Edge function redeploy | Supabase project (per env) | Operator workstation (CLI orchestrator) | `supabase functions deploy` invokes server-side bundling (`--use-api`); local PowerShell only orchestrates. |
| Legacy function deletion | Supabase project (per env) | — | `supabase functions delete` is a server-side state mutation per project-ref. |
| IPC 503 repro | API / Backend (deployed `interview-prep-analyze`) | Frontend (browser) | Repro replays the failing request against the redeployed function; failure mode lives in edge runtime. |
| Phase 25/26/27 surface checks | Frontend Server (Vercel SPA) for `MeritCostPreview`, `/stripe-webhook` shim; API / Backend for `refundMeritsForJob` | Database (for `merit_transaction_id` rows) | UI mount is browser-observable; refund recognition is edge-function-internal; 410-Gone shim is HTTP-observable. |
| VERIFICATION.md authoring | Operator workstation (Claude + writeable repo state, but NOT committed per CLAUDE.md) | — | `.planning/` is gitignored; artifact lives in working tree only. |

---

## Standard Stack

This phase ships no code; "stack" here means the operator tools the runbook invokes.

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Git (Windows Git Bash / PowerShell) | bundled | FF merge, stash, log, push | Project standard; only viable FF-merge tool. [VERIFIED: `git --version` available; current shell is bash on Windows] |
| Supabase CLI | 2.75.0 installed; 2.95.4 latest available | `functions deploy`, `functions list`, `functions delete`, `link` | Project standard; deploy scripts depend on it. [VERIFIED: `supabase --version` returned 2.75.0; recent commit `aa3d696` already updated `cli-latest` doc to v2.95.4] |
| PowerShell | bundled | Runs `scripts/deploy-staging.ps1` and `scripts/deploy-production.ps1` | Project standard per README §Deployment. [VERIFIED: scripts/*.ps1 use `param`/`$ErrorActionPreference`/`Copy-Item`] |
| ripgrep (`rg`) | bundled | D-12 pre-delete grep + Grep-tool searches | Project standard per CLAUDE.md "Prefer `rg` for searching files and text". [VERIFIED: Grep tool used `rg` semantics] |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `curl` (or PowerShell `Invoke-RestMethod`) | bundled | IPC 503 repro replay; 410-Gone shim probe | When replaying the original failing payload against the deployed `interview-prep-analyze` endpoint. |
| Browser (Chrome) | latest | `MeritCostPreview` mount verification on `/career-compass` | UI-only check that the component renders. |
| Supabase Dashboard (function logs UI) | live | 5-minute log soak per D-07.4 | Watching for new error spikes post-staging-deploy. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `git merge --ff-only` | `git merge --no-ff` (creates merge commit) | D-01 explicitly rejects merge-commit noise. |
| `git merge --ff-only` | `git pull --ff-only` | Functionally equivalent; `merge` is more explicit about source ref. |
| PowerShell deploy scripts | Direct `supabase functions deploy --project-ref X` invocations | Scripts already enumerate the 33-function list and swap `config.toml` — re-rolling that logic in the plan is unnecessary work. |

**Installation:** No installs needed; everything is already on the operator's workstation.

**Version verification:** `supabase --version` returns 2.75.0; the deploy scripts use `--use-api` (server-side bundling) so local CLI version drift is non-fatal as long as the CLI can authenticate and call the deploy API. [VERIFIED: scripts use `--use-api` per `deploy-staging.ps1:52`]

---

## Architecture Patterns

### System Architecture (Procedural Flow)

```
[Wave 0: Pre-flight]
   |
   |-- git fetch origin                               (sync local refs with remote)
   |-- git log origin/by/env-fixes..origin/main       (FF feasibility test #1)
   |-- git status --short                             (capture dirty tree inventory)
   |
   v
[Wave 1: Branch reconciliation]
   |
   |-- [BRANCH] FF possible?  ----- NO ----> [OPERATOR ESCALATION] (see §"Branch State Reality Check")
   |               | YES
   |-- git checkout main && git pull --ff-only        (sync local main)
   |-- git stash -u --keep-index                      (D-02: stash tracked dirty)
   |-- git checkout main
   |-- git merge --ff-only --no-commit by/env-fixes   (D-03 dry-run)
   |-- git merge --abort                              (abort dry-run)
   |-- git merge --ff-only by/env-fixes               (D-03: real FF)
   |-- git stash pop                                  (restore dirty tree)
   |-- [OPERATOR] git push origin main                (D-04)
   |-- VERIFICATION SC #1: git log main..by/env-fixes --oneline (must be empty)
   |
   v
[Wave 2: Staging deploy → soak → Production deploy]
   |
   |-- pwsh -File scripts/deploy-staging.ps1          (D-05/D-06: deploys 33 funcs to STAGING)
   |-- [SMOKE STAGING] D-07.1..4 (4 gates)            (IPC repro / Phase 25-26-27 / 5-feat smoke / 5min log soak)
   |-- D-08: ~5 min soak window
   |-- pwsh -File scripts/deploy-production.ps1       (D-05/D-06: deploys 33 funcs to PROD)
   |-- [SMOKE PROD] D-09 (same 4 gates)
   |-- VERIFICATION SC #4: capture observable evidence for each Phase 25/26/27 surface
   |
   v
[Wave 3: Legacy delete + IPC 503 verdict + close]
   |
   |-- D-12 preflight: rg -n interview-prep-coach src/ supabase/
   |-- supabase functions delete interview-prep-coach --project-ref STAGING
   |-- supabase functions delete interview-prep-coach --project-ref PROD
   |-- D-13: capture supabase functions list output for BOTH envs
   |-- VERIFICATION SC #2: lists must exclude interview-prep-coach
   |-- D-14/D-15: replay IPC 503 payload at original tier + Pro + Elite
   |-- VERIFICATION SC #3: 200 (drift confirmed) OR document 503 + hand to Phase 41
   |-- Author VERIFICATION.md per D-18 (machine-extractable, SC #1-4 checklist with raw output)
```

### Recommended Plan Structure

```
.planning/phases/28-merge-redeploy-baseline/
├── 28-CONTEXT.md           # already exists (D-01..D-18)
├── 28-RESEARCH.md          # this file
├── 28-PLAN.md              # planner produces — single-plan phase OR 3 plans (Wave 1/2/3)
├── 28-VALIDATION.md        # check commands per SC (this file §Validation Architecture)
├── 28-VERIFICATION.md      # operator-authored at end per D-18
└── 28-DISCUSSION-LOG.md    # already exists from /gsd-discuss-phase
```

### Pattern 1: Operator-led runbook with `[OPERATOR]` markers
**What:** Each step in PLAN.md is tagged `[CLAUDE]` (Claude executes), `[OPERATOR]` (operator runs manually), or `[BOTH]` (Claude proposes, operator confirms before execute).
**When to use:** Any phase with destructive operations, push-to-main, or paid-API calls.
**Example:**
```markdown
- [OPERATOR] Run `git push origin main` (D-04: Claude does NOT push).
- [CLAUDE]   Run `git log main..by/env-fixes --oneline` and capture output for SC #1.
- [BOTH]     Stage dirty-tree stash; show what will be stashed before stashing.
```

### Pattern 2: Inline-evidence VERIFICATION.md (D-18)
**What:** VERIFICATION.md = SC #1-4 checklist where each item has the exact command run + the raw captured output inline below.
**When to use:** Any operator-led phase where downstream agents need machine-extractable proof.
**Example:**
````markdown
## SC #1: git log main..by/env-fixes --oneline returns empty
```bash
$ git log main..by/env-fixes --oneline
$ # (empty — FF merge complete)
```
PASS / FAIL: PASS
````

### Anti-Patterns to Avoid
- **Tag-only proofs.** "SC #1 PASS" without showing the command output. Rejected by D-18 ("must be machine-extractable").
- **Free-form retrospective in VERIFICATION.md.** D-18 explicitly rejects narrative summaries — the artifact is a checklist.
- **Stashing untracked files thinking it covers `.planning/`.** Gitignored files are NOT captured by `git stash -u`. Tracked deletions ARE. The dirty-tree concern in D-02 is about TRACKED changes (10 `.planning/phases/*-SUMMARY.md` deletions + 2 `supabase/.temp/*` modifications).
- **Running deploy scripts in parallel.** D-05 staging-first is sequential; parallel deploy is rejected.
- **Committing `.planning/` cleanup as part of this phase.** CLAUDE.md + persistent memory rule forbid it. Stash never gets popped-then-committed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Edge function deploy orchestration | Custom for-loop calling `supabase functions deploy` per name | `scripts/deploy-staging.ps1` / `deploy-production.ps1` | Scripts already enumerate 33 functions, swap `config.toml`, link to correct project-ref, use `--use-api` server-side bundling. Re-rolling = error surface. [VERIFIED: deploy-staging.ps1 lines 2-37 enumerate; line 47 links; line 52 deploys] |
| Function-list diff for SC #2 | Custom JSON parser of `supabase functions list` output | Raw `supabase functions list` text capture + manual `interview-prep-coach` absence check | D-13 already accepts raw paste. Adding a parser adds bugs without value. |
| Branch-reconciliation alternative when FF preflight fails | Custom merge / rebase / cherry-pick logic | Halt, report to operator, await per-step authorization | D-01/D-04 are explicit; novel reconciliation is operator-only. |
| IPC 503 repro harness | Custom test fixture | Replay the original failing payload via `curl` against the deployed function URL | D-14 explicitly rejects "fresh end-to-end IPC flow"; the canonical repro IS the original payload replay. |
| Phase 25/26/27 surface verification | Bespoke test infrastructure | Browser visit (`MeritCostPreview`), `curl POST /stripe-webhook` (410 shim), grep against deployed source for `already_refunded` | Each surface has a deterministic check below. |

**Key insight:** This phase has zero net-new code. Every novel script is a new failure mode. Use existing scripts, raw CLI output, and inline grep/curl — don't add abstractions.

---

## Runtime State Inventory

This phase IS a deploy operation, so the inventory matters:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None directly mutated by this phase. (Phase 26's `analysis_jobs.merit_transaction_id` migration `20260429000000_add_merit_transaction_id_to_analysis_jobs.sql` is already applied to production per v2.0-MILESTONE-AUDIT.md "operator-confirmed in production"; no DB migration runs in Phase 28.) | Verify column exists (smoke item D-07.2 indirectly proves it via `refundMeritsForJob` recognizing the txn). |
| Live service config | **Stripe Live webhook URL** is pinned to `/functions/v1/stripe-webhook-handler` (operator-confirmed 2026-04-29 per audit). Phase 28 redeploy does NOT change Stripe Dashboard config. | None — but D-17 revert trigger #3 watches for shop-purchase regressions, which would catch any silent config drift. |
| OS-registered state | None. No Task Scheduler / launchd / pm2 entries. (`scripts/phase21-runbook.ps1` is a script, not a registered task.) | None. |
| Secrets/env vars | All Supabase function secrets (ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, STRIPE_WEBHOOK_SECRET, etc.) live in Supabase project secrets per env, NOT in code. Redeploy does not touch them. | None — but if the IPC 503 repro reveals an env-var mismatch, that's a Phase 41 finding, not a Phase 28 fix. |
| Build artifacts / installed packages | `--use-api` server-side bundling means no local node_modules / Deno cache state matters for the deploy itself. The operator's `npm i` state is irrelevant. | None. |

**Nothing-found callouts:**
- **No DB migration runs in Phase 28.** Verified by reading deploy scripts (no `supabase migration up`); MERGE-01/02/03 are code-deploy + delete only.
- **No frontend redeploy.** Vercel auto-deploys from `main`; that's owned by Vercel's pipeline, NOT Phase 28's runbook. Plan must NOT include a manual frontend deploy step. (Vercel deploys are mentioned in CLAUDE.md as "frontend hosting" — they're triggered by `git push origin main` from D-04.)

---

## Branch State Reality Check (CRITICAL FINDING)

**State at research time (2026-04-28, branch `by/env-fixes`):**

```bash
$ git log by/env-fixes..main --oneline
c6d02b1 Merge branch 'staging' into by/env-fixes (#424)
13f8855 Merge branch 'staging' into by/env-fixes (#421) (#422) (#423)
5707254 squash merge into main
7166aa5 Staging (#419)
1386c58 Staging (#417)
48ecf87 Preview (#334)

$ git log by/env-fixes..main --oneline | wc -l
6

$ git log main..by/env-fixes --oneline | wc -l
174

$ git branch -vv  # local main is also stale
  main          c6d02b1 [origin/main: behind 2] ...
* by/env-fixes  aa3d696 [origin/by/env-fixes] ...
```

**What this means:**
- `main` has 6 commits NOT on `by/env-fixes`. **D-03's first preflight gate (`git log by/env-fixes..main` empty) WILL FAIL** in current state.
- A pure FF merge of `by/env-fixes` → `main` is **not possible** in current state. FF requires `main` to be an ancestor of `by/env-fixes`; the 6 main-only commits prove it isn't.
- Local `main` is also `behind 2` from `origin/main`, so any branch math must `git fetch origin` first.

**The 6 main-only commits (per `git log` inspection):**
- `c6d02b1`, `13f8855` — "Merge branch 'staging' into by/env-fixes (#42x)" — these are PR merge commits ON `main` that already include the staging branch's content
- `7166aa5` "Staging (#419)" — large PR including Phase 26 changes (refundMeritsForJob, RESILIENCE CONTRACT comments)
- `1386c58` "Staging (#417)" — earlier staging PR
- `5707254` "squash merge into main" — squash merge commit
- `48ecf87` "Preview (#334)" — preview PR

**This is the single most important question for the operator before planning continues:**
> Is the operator aware that `by/env-fixes` does NOT contain everything from `main`, and a literal FF merge of `by/env-fixes` → `main` will FAIL? CONTEXT.md was authored 2026-04-28 assuming "main has not diverged"; that assumption does not hold against current branch state.

**Recommended planner branch handling (PROPOSE for D-19 in plan-phase, surface to operator for confirmation):**

| Scenario | Action |
|----------|--------|
| **(A) Operator wants to preserve all 174 commits AND main's 6 commits** | Cannot FF in either direction. Either (i) merge `main` into `by/env-fixes` first (creates merge commit on `by/env-fixes`, then FF-merge `by/env-fixes` → `main` is possible), or (ii) explicit reject D-01 fast-forward and use a no-ff merge commit. **D-01 forbids both these paths as written.** Operator escalation required. |
| **(B) Main's 6 commits are already in `by/env-fixes` via a different branch (e.g., `staging`)** | Verify via `git log` that main's 6 commit messages/diffs appear elsewhere in `by/env-fixes` history. If yes, the 6 commits are duplicates and can be reset; FF becomes viable. **Needs operator-side investigation.** |
| **(C) Main's 6 commits are unwanted / stale** | Operator force-resets `main` to be an ancestor of `by/env-fixes`. Destructive. Requires explicit operator authorization. |

**Plan implication:** Wave 0 of the plan MUST start with `git fetch origin` and a fresh re-run of the divergence check. If `git log by/env-fixes..main` is non-empty post-fetch, **HALT and escalate to operator** before any merge action. The plan should NOT attempt to resolve divergence without per-step operator confirmation (D-04 spirit).

[VERIFIED: divergence confirmed via `git log` and `git branch -vv` 2026-04-28]

---

## FF Merge Mechanics (Windows Git Bash)

### The two D-03 preflight gates (exact commands)

```bash
# Gate 1: divergence check (FF feasibility)
git fetch origin                                       # CRITICAL — local main is behind 2
git log origin/by/env-fixes..origin/main --oneline    # MUST be empty for FF to succeed
# (also acceptable: git log by/env-fixes..main --oneline AFTER local main sync)

# Gate 2: dry-run conflict check
git checkout main
git pull --ff-only origin main                         # sync local main with origin
git merge --ff-only --no-commit by/env-fixes
# If gate 1 passed and `merge --ff-only` succeeds, no conflicts (FF cannot conflict).
# `--no-commit` is a no-op for pure FF (FF doesn't create a commit), but the flag is harmless.
```

### Aborting the dry-run (Windows Git Bash)

For a pure FF merge that succeeded, there is nothing to abort — FF just moves the ref pointer. There is no merge state to clean up.

If somehow `--ff-only` fails (which would mean Gate 1 lied), use:
```bash
git merge --abort       # safest; restores HEAD and index to pre-merge state
# git reset --merge   # equivalent older syntax; --abort is preferred since git 1.7.4
```

Both are safe on Windows Git Bash. [CITED: git-scm docs `git-merge`]

**Trap:** Running `--no-commit` on a real (non-dry) FF merge — the flag is silently ignored for FF (FF doesn't commit anything), so the FF still completes. This is fine for our use case but counter-intuitive. The "dry-run then abort" pattern in CONTEXT.md D-03 actually works because for any FF, `--ff-only --no-commit` succeeding == "no conflicts and FF feasible"; the merge already moved HEAD; `git merge --abort` then doesn't apply (nothing to abort). **Recommended pattern:** treat the dry-run as the real merge — if it succeeds, you're done. Don't try to abort and re-run.

[ASSUMED] In Windows Git Bash specifically, the index and worktree state after a pure FF complete cleanly with no leftover MERGE_HEAD or ORIG_HEAD interference. (This is git-standard behavior on all platforms; calling out as ASSUMED because no explicit Windows-vs-Linux behavioral test was run in this research session.)

---

## Dirty-Tree Stash Semantics

### What's actually dirty (verified 2026-04-28)

```bash
$ git status --short
 D .planning/phases/11-merit-rpcs-and-reconciliation/11-05-SUMMARY.md
 D .planning/phases/12-stripe-products-and-webhook/12-01-SUMMARY.md
 D .planning/phases/12-stripe-products-and-webhook/12-02-SUMMARY.md
 D .planning/phases/12-stripe-products-and-webhook/12-03-SUMMARY.md
 D .planning/phases/12-stripe-products-and-webhook/12-06-SUMMARY.md
 D .planning/phases/12-stripe-products-and-webhook/12-08-SUMMARY.md
 D .planning/phases/14-tier-prompts-and-locked-section-primitive/14-01-SUMMARY.md
 D .planning/phases/15-resume-analysis-gating/15-03-SUMMARY.md
 D .planning/phases/15.1-resume-analysis-free-tier-token-budget-fix-and-output-shapin/15.1-02-SUMMARY.md
 D .planning/phases/16-linkedin-grader-gating/16-01-SUMMARY.md
 D .planning/phases/16-linkedin-grader-gating/16-04-SUMMARY.md
 M supabase/.temp/pooler-url
 M supabase/.temp/project-ref
```

All 13 changes are TRACKED. Verified by `git ls-files --error-unmatch .planning/phases/11-merit-rpcs-and-reconciliation/11-05-SUMMARY.md` returning the path (vs. error-out for untracked). [VERIFIED]

### Why these are tracked despite gitignore

`.planning/` and `supabase/.temp/*` are listed in `.gitignore`, but git only ignores *new untracked* files matching the patterns. Files that were tracked at commit time stay tracked forever — `.gitignore` does not retroactively untrack them. The 10 SUMMARY files were committed during their original phases (10/11/12/14/15/15.1/16) before `.planning/` was hardened in `.gitignore`; deletions of tracked files show as ` D` (worktree-deleted) until staged/committed.

### Stash command behavior

```bash
git stash -u --keep-index    # CONTEXT.md D-02
```

- **`-u` / `--include-untracked`:** stashes untracked files. Does NOT stash gitignored files. (Use `-a` / `--all` for that — NOT what we want; would stash node_modules etc.)
- **`--keep-index`:** stashes worktree changes but leaves staged changes in the index. Since nothing is currently staged (`git status --short` shows no `M ` or `A ` in column 1), `--keep-index` is a no-op in current state. The flag is still safe to include — it's defensive against operator pre-staging anything.

**What gets stashed in current state:** all 13 tracked changes (11 deletions + 2 modifications). Nothing else (gitignored worktree state — `.planning/_archive/`, `node_modules/`, etc. — stays put).

**Stash pop after merge:** `git stash pop` restores the 13 changes onto the new HEAD (which is now `by/env-fixes` tip, FF-merged). The deletions and modifications still apply against the new tree.

**CRITICAL: `git stash pop` may conflict** if `by/env-fixes` modified one of the 11 SUMMARY files differently. Mitigation: do a `git stash show --stat stash@{0}` before popping to inspect; if conflicts arise, `git stash drop` and discard the dirty state (per CLAUDE.md memory: never commit `.planning/`). The dirty state is operator-side workspace pollution, not load-bearing artifact. [VERIFIED: per `git stash` docs, `pop` aborts on conflict and leaves stash intact]

[CITED: git-scm.com/docs/git-stash]

---

## Deploy Script Anatomy

### `scripts/deploy-staging.ps1` and `scripts/deploy-production.ps1`

Both scripts are nearly identical. Differences:

| Aspect | Staging | Production |
|--------|---------|------------|
| Config file | `supabase/config.staging.toml` | `supabase/config.production.toml` |
| Project ref | `cimjltzovkahkqecpwgi` (line 47) | `zjpjapgraoxdukdvpjes` (line 47) |
| Banner | "Deploying $fn to staging…" | "Deploying $fn to production…" |
| Closing line | "Staging deploy complete." | "Production deploy complete." |

**Common signature** (both scripts):
```powershell
param(
  [string[]]$Functions = @( <33 function names> )
)
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot
Copy-Item "supabase/config.<env>.toml" "supabase/config.toml" -Force
supabase link --project-ref <env-ref>
foreach ($fn in $Functions) {
  Write-Host "Deploying $fn to <env>…"
  supabase functions deploy $fn --no-verify-jwt --use-api
}
```

**Invocation:**
```powershell
pwsh -File scripts/deploy-staging.ps1
pwsh -File scripts/deploy-production.ps1
```
No parameters needed; the default `$Functions` enumerates all 33 functions. To deploy a subset (NOT what D-06 asks for, but worth knowing): `pwsh -File scripts/deploy-staging.ps1 -Functions analyze-resume,analyze-career`. **D-06 says redeploy ALL — use the default param, don't pass `-Functions`.**

### Function list (33 functions enumerated in both scripts)

```
chat-agent, process-scheduled-emails, admin-delete-user, analyze-skills-gap, ocr-pdf,
send-feature-email, analyze-resume, send-strivo-email, analyze-career, notify-admin-activity,
paddle-webhook, test-email, notify-upgrade-approved, notify-upgrade-request,
send-credits-exhausted-email, compare-jobs, grade-linkedin, send-notification-email,
send-welcome-email, submit-resume-analysis-job, get-analysis-job-status,
process-resume-analysis-job, submit-career-analysis-job, process-career-analysis-job,
keep-warm, create-checkout-session, create-payment-intent, create-stripe-portal,
stripe-webhook, stripe-webhook-handler, reset-subscription-merits, admin-merit-metrics,
check-merit-alerts
```

[VERIFIED: scripts/deploy-staging.ps1 lines 2-37 and scripts/deploy-production.ps1 lines 2-37, identical lists]

**MISSING from this list (post-merge, will be on `main`):** `interview-prep-analyze`, `interview-prep-evaluate`. The deploy scripts do NOT enumerate these. They are part of `by/env-fixes`, but the script's `$Functions` default is hard-coded.

**Plan implication (CRITICAL):** D-06 says "redeploy ALL edge functions". The current scripts redeploy 33 specific functions, not whatever's in `supabase/functions/` on disk. **`interview-prep-analyze` and `interview-prep-evaluate` will NOT be redeployed by the existing script as-is.** The plan must either:
- (a) Update the `$Functions` default in BOTH scripts to add `interview-prep-analyze` and `interview-prep-evaluate` BEFORE invoking — this is a code edit and lives in the merge baseline, OR
- (b) Invoke the scripts with `-Functions` parameter expanded to include the IPC functions, OR
- (c) Run a separate `supabase functions deploy interview-prep-analyze --use-api --no-verify-jwt` after the script for both functions per env.

**This is the second most important finding for the planner.** D-06 cannot be satisfied by running the scripts unmodified.

[VERIFIED: by reading deploy-staging.ps1 lines 2-37 and confirming `interview-prep-analyze` is absent from the list, while it exists in `supabase/functions/interview-prep-analyze/index.ts`]

### Exit-code semantics

`$ErrorActionPreference = "Stop"` + `foreach { supabase functions deploy ... }` means: any single function deploy failure ABORTS the script with non-zero exit. Subsequent functions will NOT be deployed. This is desirable for FAIL-LOUD behavior.

**Plan implication:** if a deploy fails partway through, the env is in a partial-deploy state. The plan needs a clear "retry from where it failed" or "redeploy everything from scratch" operator path. Recommendation: the script's idempotency (deploying the same function twice is safe) means re-running the whole script after fixing the failing function is the simplest recovery.

### Project-ref binding

The script uses `supabase link --project-ref <ref>` to bind the local Supabase CLI to the target project. This writes to `supabase/.temp/project-ref` (which is part of the dirty tree we stashed!). **Note:** because `supabase/.temp/project-ref` is currently modified in the worktree, `supabase link` will overwrite it again during the deploy. After Wave 1, the operator's local CLI binding may differ from what was stashed — this is fine because the binding gets re-overwritten on the next `link` call.

---

## Phase 25/26/27 Surface Verification (SC #4)

Each surface needs a deterministic check whose output goes into VERIFICATION.md.

### Surface 1: `MeritCostPreview` mounts on `/career-compass` (Phase 25)

**Source location:** `src/pages/CareerCompass.tsx:25` imports the component; `:933` mounts it inside the form CTA block. [VERIFIED: Grep on `MeritCostPreview` returned both lines]

**Verification check options (pick one for the plan):**
- **(A) Build + grep dist (cheap, deterministic):** After Vercel auto-deploys post-`git push origin main`, run:
  ```bash
  curl -s https://strivo.ai/career-compass | grep -c MeritCostPreview
  # Expected: 0 in raw HTML (component is React-rendered client-side)
  ```
  This DOES NOT prove the component mounts; it only proves the page loads. Insufficient.
- **(B) Browser visit (manual, deterministic):** Operator opens `https://strivo.ai/career-compass` in an authenticated session, observes the component renders above the analyze CTA. Capture screenshot or DOM-inspect text. Recommended.
- **(C) Source verification (cheap, indirect):** `git log main -- src/pages/CareerCompass.tsx | head -5` to confirm Phase 25's commit `1d5653c` (or equivalent MeritCostPreview-add commit) is on main. **Recommended as the SC #4 evidence**, paired with (B) for live confirmation.

**Recommended for VERIFICATION.md:** Use (C) — `git log main -- src/pages/CareerCompass.tsx | grep -i "merit\|MeritCostPreview" | head -3` plus `git show main:src/pages/CareerCompass.tsx | grep -n "MeritCostPreview"` to capture lines confirming both import and mount. Pair with operator-attested (B) browser screenshot.

### Surface 2: `refundMeritsForJob` `already_refunded` recognition for both async workers (Phase 26)

**Source location:** verified via Grep:
- `supabase/functions/process-resume-analysis-job/index.ts:284, 349` — calls `refundMeritsForJob(userId, txId, reason)`
- `supabase/functions/process-resume-analysis-job/__tests__/refund-on-failure.test.ts:51` — asserts `alreadyRefunded` OR `already_refunded` is acknowledged
- `supabase/functions/process-career-analysis-job/__tests__/refund-on-failure.test.ts:55` — same assertion

**Verification check (deterministic):**
```bash
# Both workers reference already_refunded (live source)
git show main:supabase/functions/process-resume-analysis-job/index.ts | grep -c "already_refunded\|alreadyRefunded"
git show main:supabase/functions/process-career-analysis-job/index.ts | grep -c "already_refunded\|alreadyRefunded"
# Both tests pass
deno test supabase/functions/process-resume-analysis-job/__tests__/refund-on-failure.test.ts
deno test supabase/functions/process-career-analysis-job/__tests__/refund-on-failure.test.ts
```

**Live behavioral check:** trigger a refundable failure (5xx from Anthropic) on a real async job; observe `already_refunded` in the second-attempt log. This is non-trivial to engineer in production. **Recommended for VERIFICATION.md:** static source check + test pass — these are sufficient evidence that the code is on `main` and behaves as expected.

### Surface 3: 410-Gone shim at legacy `/stripe-webhook` (Phase 27)

**Source location:** `supabase/functions/stripe-webhook/index.ts` (50 lines, verified above) returns:
- HTTP 410 with body `{"error":"endpoint_deprecated","use":"/functions/v1/stripe-webhook-handler","req_id":"<uuid>"}`
- For non-POST: HTTP 405 `{"error":"method_not_allowed"}`
- For OPTIONS: handled via `handleOptionsRequest({type:'webhook'})`

**Verification check (deterministic, post-deploy per env):**
```bash
# Staging
curl -X POST -i https://cimjltzovkahkqecpwgi.functions.supabase.co/stripe-webhook \
  -H "content-type: application/json" -d '{}'
# Expected: HTTP/1.1 410 + body containing "endpoint_deprecated" and req_id UUID

# Production
curl -X POST -i https://zjpjapgraoxdukdvpjes.functions.supabase.co/stripe-webhook \
  -H "content-type: application/json" -d '{}'
# Expected: HTTP/1.1 410 + body containing "endpoint_deprecated" and req_id UUID
```

[ASSUMED] Supabase functions URL pattern is `https://<project-ref>.functions.supabase.co/<function-name>`. Verify the actual base URL pattern in production (some Supabase projects use `<project-ref>.supabase.co/functions/v1/<name>`). [CITED: Supabase docs — exact URL form may vary; capture from existing function deployment logs.]

**Recommended for VERIFICATION.md:** Capture both curl commands' raw responses (status line + body). Both SC #2 captures + this curl pair = SC #4 evidence.

---

## Live Reference Audit (D-12)

### What grep finds for `interview-prep-coach`

```bash
$ rg -l "interview-prep-coach" --glob '!.planning/**' --glob '!.git/**'
scripts/phase21-runbook.ps1
```

**Single hit, in operator runbook only.** Inspecting the file reveals 4 occurrences, all benign documentation reminding the operator to delete the function (Phase 27 SC-4 ack):

```powershell
# Line 650:  - ``interview-prep-coach`` -- NOT listed above. The function does not exist in this repo as of commit dcf7b20...
# Lines 776-779: Write-Step "SC-9 -- Operator action: delete the dead 'interview-prep-coach' edge function"
# Lines 789-794: Write-Step "Phase 25 coordination -- interview-prep-coach delete (Phase 27 SC-4)"
```

[VERIFIED: Grep on `interview-prep-coach` excluding `.planning/`]

**D-12 preflight expects:** zero hits in `src/` and `supabase/functions/`. The runbook hit is in `scripts/`, NOT in either of those. So the literal D-12 grep `rg -n interview-prep-coach src/ supabase/` returns ZERO and passes preflight. [VERIFIED: paths under `src/` and `supabase/` produce no matches]

**Plan implication:** D-12 preflight passes cleanly. The `scripts/phase21-runbook.ps1` reference is documentation, not active wiring; CONTEXT.md D-12 explicitly excludes `.planning/` from the check; `scripts/` references are not blocked by D-12's literal grep. Recommend the plan run D-12 exactly as written in CONTEXT.md (no scope expansion).

---

## IPC 503 Deploy-Drift Hypothesis (SC #3)

### Evidence preserved in repo

`.planning/PROJECT.md:37`:
> **Interview Prep — Pro/Elite production fix** — `interview-prep-analyze` returns 503 after successful OCR + Claude call (TTFB 8.91s, in=2686 / out=986, sonnet-4 in production logs 2026-04-28); investigate timeout / response handling / CORS / streaming

`.planning/codebase/ARCHITECTURE.md:238`:
> Production failure ... function returns 503 after successful OCR + Claude call (TTFB 8.91s); cause unclear. Suspected response-handler / CORS / streaming path issue around `interview-prep-analyze/index.ts:648-665` (`jsonResponse` wrapping a large payload via Response constructor).

`.planning/REQUIREMENTS.md:24` (MERGE-02):
> The Interview Prep 503 production failure log shows `sonnet-4` model, but `_shared/tier-config.ts` is Haiku-only post-`260419-hku` — strong signal of deploy drift.

[VERIFIED: all three references found in working tree]

### What the deploy-drift hypothesis means

`supabase/functions/_shared/tier-config.ts` lines 53-67 [VERIFIED]:
```typescript
export const FREE_MODEL = 'claude-haiku-4-5-20251001';
export const DEFAULT_PRO_ELITE_MODEL = FREE_MODEL;
export const TIER_MODELS: Record<Tier, string> = {
  free: FREE_MODEL,
  pro: DEFAULT_PRO_ELITE_MODEL,
  elite: DEFAULT_PRO_ELITE_MODEL,
};
```

All three tiers route to Haiku 4.5. There is no path through the source code to call Sonnet 4 — yet production logged `sonnet-4`. The most parsimonious explanation: the deployed copy of `interview-prep-analyze` (or one of its `_shared/` dependencies) was deployed **before** quick-task `260419-hku` made the Haiku-only change. After redeploying from `main`, the production function will use Haiku-only and the 503 should disappear (assuming the 503 was Sonnet-rate-limit / Sonnet-timeout / Sonnet-overload).

### IPC 503 Repro Fidelity Risk

**The original failing payload is NOT preserved anywhere in `.planning/`.** Searched for `payload`, `IntakeForm`, `resume_text` near `503` — no captured request body exists. Only metadata is preserved: `TTFB 8.91s, in=2686 tokens / out=986 tokens, sonnet-4 model name`.

D-14 says "replay the original failing payload that produced the production 503". Strict interpretation: cannot satisfy D-14 because the payload is unrecoverable from the planning trail.

**Proposed fallback (RECOMMENDATION FOR PLANNER, surface to operator for confirmation):**

| Option | Approach | Fidelity vs D-14 |
|--------|----------|------------------|
| **F1: Recovery from Supabase function logs** | Query Supabase production function logs for `interview-prep-analyze` 503 entries near 2026-04-28 timestamp; the log line should include the request body or a summary. | HIGH — closest to D-14 strict reading |
| **F2: Closest-match synthetic payload** | Construct a synthetic IntakeForm payload with `resume_text ≈ 2686 input tokens` (~10KB), all 9 IntakeForm fields populated (including the long-form `additionalContext` field), targeting Pro tier (flashcard variant) which produces ≈986 output tokens. Replay against post-redeploy production. | MEDIUM — preserves token-count signature; cannot guarantee path-equivalence |
| **F3: Tier-coverage matrix only** | Skip payload-replay; do a fresh 5-feature smoke (D-07.3) with the IPC item replayed across original-tier + Pro + Elite. If all 200 → drift confirmed. If any 503 → hand to Phase 41. | LOW — equivalent to a "fresh end-to-end" run, which D-14 explicitly rejects |

**Plan implication:** Wave 0 should add a step "operator queries production function logs for 503 payloads in the 2026-04-28 timeframe; capture body". If the body is recoverable, run F1. If not, fall back to F2 (NOT F3 — F3 violates D-14 spirit). Either way, document in VERIFICATION.md which option was used and why. [ASSUMED: Supabase function log retention is sufficient to surface 2026-04-28 entries by 2026-04-28 — this is borderline; older logs may already be rotated. Operator-confirmable.]

### IPC 503 endpoint URL

For SC #3 repro:

```bash
# Production
curl -X POST -i https://zjpjapgraoxdukdvpjes.functions.supabase.co/interview-prep-analyze \
  -H "content-type: application/json" \
  -H "authorization: Bearer <user_jwt_for_<tier>>" \
  -d @path/to/recovered-or-synthetic-payload.json
# Expected post-redeploy: HTTP/1.1 200 + JSON body with `quizId` and either `flashcards` or `quiz_questions`
```

Repeat for Pro user JWT and Elite user JWT per D-15.

---

## Legacy Function Deletion Mechanics (MERGE-03)

### Exact CLI signatures (verified via `--help`)

```bash
# List
supabase functions list --project-ref <ref>
# Output format: pretty (default) | env | json | toml | yaml — pick `pretty` for D-13's raw paste

# Delete
supabase functions delete interview-prep-coach --project-ref <ref>
# --yes flag bypasses confirmation prompt (recommended for non-TTY operator scripting)
```

[VERIFIED: `supabase functions delete --help` and `supabase functions list --help` outputs captured]

**Project-ref values:**
- Staging: `cimjltzovkahkqecpwgi` (from `scripts/deploy-staging.ps1:47`)
- Production: `zjpjapgraoxdukdvpjes` (from `scripts/deploy-production.ps1:47` AND `supabase/config.staging.toml:1` + `supabase/config.production.toml:1`)

**Note:** `supabase/config.staging.toml:1` reads `project_id = "zjpjapgraoxdukdvpjes"` — this is the PRODUCTION project ref, not staging. This is technically misconfigured but non-load-bearing because `deploy-staging.ps1` uses `supabase link --project-ref cimjltzovkahkqecpwgi` (the correct staging ref), which overrides the file. [VERIFIED]

**Plan implication:** Use the script-level project-refs (staging `cimjltzovkahkqecpwgi`, prod `zjpjapgraoxdukdvpjes`) as the canonical values. Do NOT trust `supabase/config.<env>.toml` for project-ref. Surface the config-file mismatch to the operator as an unrelated cleanup item (NOT in Phase 28 scope per CONTEXT.md "out of scope").

### D-13 capture commands

```powershell
# Capture for VERIFICATION.md
$staging = supabase functions list --project-ref cimjltzovkahkqecpwgi
$prod    = supabase functions list --project-ref zjpjapgraoxdukdvpjes

# Both must NOT contain "interview-prep-coach"
$staging | Select-String "interview-prep-coach"   # expect no output
$prod    | Select-String "interview-prep-coach"   # expect no output
```

Or in bash:
```bash
supabase functions list --project-ref cimjltzovkahkqecpwgi | tee /tmp/staging.txt
supabase functions list --project-ref zjpjapgraoxdukdvpjes | tee /tmp/prod.txt
grep -c interview-prep-coach /tmp/staging.txt /tmp/prod.txt   # both must report 0
```

[ASSUMED] Non-TTY behavior: `supabase functions list` produces deterministic stdout in non-interactive PowerShell. (Verified via `--help` showing the `--output` flag and `pretty` default; --output env|json|toml|yaml available for parseable forms if D-13 ever wants machine-extractable.)

---

## Smoke Battery Wire-Up (D-07.3)

CONTEXT.md says "all 5 features run a one-shot smoke" but does not specify HOW. There is no existing one-shot smoke script in `scripts/`. Verified by Glob (no `smoke-*.ps1` or similar). The plan must specify per-feature smoke commands.

### Per-feature smoke commands (recommended)

For each feature, the smoke is "one analyze call returning 200 with the expected response shape." All require a logged-in user JWT (operator can curl with their own session token).

| Feature | Endpoint | Minimum payload | Expected 200 response shape |
|---------|----------|-----------------|-----------------------------|
| Resume Analysis | POST `/analyze-resume` | `{resumeText, targetRole, targetIndustry, tier}` | `{score, criteria, summary}` (or stream) |
| Career Compass | POST `/analyze-career` | `{resumeText, linkedinText?, compareRoles?, tier}` | `{careerDNA, bestFitRoles, fields, ...}` |
| LinkedIn Grader | POST `/grade-linkedin` | `{profileContent, profileUrl, tier}` | `{overall_score, ready_to_paste_improvements, key_strengths}` |
| Recruiting Lens | POST `/recruiting-lens` (function name `recruiting-lens` per `_shared`) | `{resumeSummary, jobDescription, company, role_title, tier}` | `{match_score, why_match}` |
| Interview Prep | POST `/interview-prep-analyze` | `{resume_text, IntakeForm[9 fields], tier, variant}` | `{quizId, flashcards?, quiz_questions?}` |

**Recommended approach for the plan:** the plan's smoke step is "operator logs into staging.strivo.ai with a Pro test account and runs each of the 5 features once via the UI, observing 200 + correct UI render." This is faster to spec than 5 curl commands and provides better evidence (UI actually renders). The plan can ALSO provide curl commands as a fallback.

[ASSUMED] A staging environment URL exists for the operator to drive the UI. (Not directly verified in this research session; CLAUDE.md mentions "staging" repeatedly; Vercel typically auto-provisions a staging URL.)

---

## Common Pitfalls

### Pitfall 1: Assuming FF is feasible without a fresh fetch
**What goes wrong:** `git log by/env-fixes..main` returns "empty" against stale local refs even when origin/main has diverged. Operator runs FF, fails, panics.
**Why it happens:** Local `main` is `behind 2` from `origin/main` (verified). `git fetch` is non-optional.
**How to avoid:** Wave 0 starts with `git fetch origin --prune`. ALL divergence checks compare `origin/by/env-fixes` to `origin/main`, NOT local refs.
**Warning signs:** `git branch -vv` showing `[origin/main: behind N]`.

### Pitfall 2: Stash conflicts on pop after merge
**What goes wrong:** Pop fails because `by/env-fixes` modified one of the 11 SUMMARY files; operator thinks the merge broke.
**Why it happens:** Stash was created against pre-merge HEAD; pop applies against post-merge HEAD which may have different content for the same paths.
**How to avoid:** Pre-pop check: `git stash show --name-only`; if any path is also touched by a Phase 25/26/27 commit, prefer `git stash drop` over `git stash pop` (the dirty state is workspace pollution, not load-bearing). Per CLAUDE.md memory rule, NEVER commit `.planning/` regardless.
**Warning signs:** "CONFLICT" lines after `git stash pop`.

### Pitfall 3: Deploy script silently skips IPC functions
**What goes wrong:** Operator runs `deploy-staging.ps1`, sees "Deploy complete", assumes ALL functions deployed. `interview-prep-analyze` and `interview-prep-evaluate` were NOT redeployed because they're not in the `$Functions` default list. SC #3 IPC 503 repro continues to fail because the deploy-drift hypothesis was never tested on the actual IPC code.
**Why it happens:** Scripts hardcode 33-function list authored before `interview-prep-analyze` was added.
**How to avoid:** Plan must include a code edit to BOTH deploy scripts to add `interview-prep-analyze` and `interview-prep-evaluate` to the `$Functions` default — OR explicit `-Functions` parameter override at invocation — OR a follow-up `supabase functions deploy` per IPC function.
**Warning signs:** Wave 2 smoke item D-07.1 (IPC 503 repro) still 503ing after redeploy with no other red flags.

### Pitfall 4: Vercel frontend deploy lag vs Supabase deploy timing
**What goes wrong:** Operator pushes `main`, Vercel starts auto-deploying frontend; operator runs `deploy-staging.ps1` immediately; Vercel staging frontend is still serving old SPA against new edge functions for 2-5 min.
**Why it happens:** Vercel + Supabase deploys are decoupled.
**How to avoid:** Wave 2 should observe Vercel staging deploy completion (visible in Vercel dashboard) BEFORE running smoke tests.
**Warning signs:** UI tests fail with shape mismatches that don't match either old-or-new code.

### Pitfall 5: 410-Gone shim probe accidentally hits the active handler
**What goes wrong:** Operator runs `curl -X POST <prod-url>/stripe-webhook-handler` instead of `<prod-url>/stripe-webhook`, gets 200/4xx from the active handler, marks SC #4 as PASS.
**Why it happens:** Function names differ by one suffix character.
**How to avoid:** Plan must literal the exact URL (including the `-handler` suffix's absence for the legacy shim) in Wave 2 smoke commands.
**Warning signs:** A 200 response (the active handler) when 410 was expected.

### Pitfall 6: Using `supabase functions list` exit code as SC #2 evidence
**What goes wrong:** Operator runs `supabase functions delete` and trusts `$LASTEXITCODE = 0` as proof. Function might have been already-gone (delete-of-nothing), or the CLI cached a stale state.
**Why it happens:** D-13 explicitly mentions: "Trusting the delete CLI's exit code alone explicitly rejected."
**How to avoid:** ALWAYS follow up with `supabase functions list` and grep for absence of `interview-prep-coach`. Inline both outputs in VERIFICATION.md.
**Warning signs:** None visible to the operator unless they look. Cultural hazard.

---

## Code Examples

### FF preflight + merge (Windows Git Bash)
```bash
# Source: git-scm.com/docs/git-merge + project repo state
git fetch origin --prune

# Gate 1: divergence check (use REMOTE refs to avoid local-staleness traps)
git log origin/by/env-fixes..origin/main --oneline
# MUST be empty. If non-empty → HALT, escalate to operator (see §Branch State Reality Check).

# Sync local main with origin
git checkout main
git pull --ff-only origin main

# Stash dirty tree (D-02)
git stash -u --keep-index
# Capture stash inventory for VERIFICATION.md / debug:
git stash show --name-only stash@{0}

# Gate 2: dry-run via real FF (FF is reversible — no abort needed)
git merge --ff-only by/env-fixes
# ⇧ This IS the real merge if Gate 1 passed. There is nothing to abort for a successful FF.

# Verify SC #1 evidence
git log main..by/env-fixes --oneline
# MUST be empty.

# Restore dirty tree
git stash pop
# If conflict: git stash drop (do NOT commit .planning/ per CLAUDE.md)

# Operator-only push (D-04)
echo "[OPERATOR] Run: git push origin main"
```

### Deploy with full function coverage (handles Pitfall 3)
```powershell
# Source: scripts/deploy-staging.ps1 + this research §Deploy Script Anatomy
# Option A: invoke with explicit -Functions including IPC functions
$AllFunctions = @(
  # 33 default functions from script
  "chat-agent","process-scheduled-emails","admin-delete-user","analyze-skills-gap","ocr-pdf",
  "send-feature-email","analyze-resume","send-strivo-email","analyze-career","notify-admin-activity",
  "paddle-webhook","test-email","notify-upgrade-approved","notify-upgrade-request",
  "send-credits-exhausted-email","compare-jobs","grade-linkedin","send-notification-email",
  "send-welcome-email","submit-resume-analysis-job","get-analysis-job-status",
  "process-resume-analysis-job","submit-career-analysis-job","process-career-analysis-job",
  "keep-warm","create-checkout-session","create-payment-intent","create-stripe-portal",
  "stripe-webhook","stripe-webhook-handler","reset-subscription-merits","admin-merit-metrics",
  "check-merit-alerts",
  # IPC additions for Phase 28 redeploy parity
  "interview-prep-analyze","interview-prep-evaluate"
)
pwsh -File scripts/deploy-staging.ps1 -Functions $AllFunctions
# (later)
pwsh -File scripts/deploy-production.ps1 -Functions $AllFunctions

# Option B: edit the deploy scripts to add IPC functions to the $Functions default
# (Code edit — must be on `by/env-fixes` BEFORE the FF merge, so the merged main has the fix.
#  Alternatively, edit on `main` post-merge as a follow-up commit, which the operator must push.
#  Cleaner option: add the two IPC names to both scripts on by/env-fixes BEFORE merge.)
```

### Phase 25/26/27 surface verification probes
```bash
# Source: this research §Phase 25/26/27 Surface Verification

# Surface 1: MeritCostPreview on /career-compass
git show main:src/pages/CareerCompass.tsx | grep -n "MeritCostPreview"
# Expected: line 25 (import) + line 933 (mount) — EXACT line numbers post-FF

# Surface 2: refundMeritsForJob already_refunded recognition
git show main:supabase/functions/process-resume-analysis-job/index.ts | grep -nc "already_refunded\|alreadyRefunded"
git show main:supabase/functions/process-career-analysis-job/index.ts | grep -nc "already_refunded\|alreadyRefunded"
# Expected: ≥1 each

# Surface 3: 410-Gone shim live probe (run AFTER per-env deploy)
curl -X POST -i "https://cimjltzovkahkqecpwgi.functions.supabase.co/stripe-webhook" \
  -H "content-type: application/json" -d '{}' 2>&1 | head -20
# Expected: HTTP/1.1 410 + body with "endpoint_deprecated"
```

### Legacy delete with evidence capture (D-12 + D-13)
```bash
# Source: this research §Legacy Function Deletion Mechanics

# D-12 preflight
rg -n "interview-prep-coach" src/ supabase/
# Expected: zero hits. If hits found → HALT.

# Delete (staging first per D-11)
supabase functions delete interview-prep-coach --project-ref cimjltzovkahkqecpwgi --yes
supabase functions delete interview-prep-coach --project-ref zjpjapgraoxdukdvpjes --yes

# D-13 capture for SC #2 evidence
supabase functions list --project-ref cimjltzovkahkqecpwgi  > /tmp/staging-functions.txt
supabase functions list --project-ref zjpjapgraoxdukdvpjes > /tmp/prod-functions.txt
grep -c "interview-prep-coach" /tmp/staging-functions.txt /tmp/prod-functions.txt
# Expected: both report 0
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Local Docker + `supabase functions deploy` | Server-side bundling via `--use-api` | Earlier in v2.0 | Plan can ignore local Docker/Deno version drift; deploy reliability up. [VERIFIED: deploy scripts use `--use-api` per line 52] |
| Mixed Sonnet 4 + Haiku 4.5 model routing per feature/tier | Haiku 4.5 platform-wide | quick-task `260419-hku` | Free tier cost ceiling enforced at single point in `_shared/tier-config.ts`; the IPC 503 deploy-drift signal hinges on whether deployed copies have this change. |
| `interview-prep-coach` as canonical IPC function | `interview-prep-analyze` + `interview-prep-evaluate` | Phase 23 (v2.0) | Coach function is dormant in repo (deleted) but live in Supabase deploys; MERGE-03 closes the loop. |
| Squash-merge strategy for branches | FF-only for `by/env-fixes` → `main` | Phase 28 D-01 | Preserves 174-commit GSD audit trail; rejects merge-commit and rewritten-history alternatives. |

**Deprecated/outdated:**
- `paddle-webhook` function: still in deploy-script enumerated list, but Stripe Live cutover means it receives no signed events (parallel to the `stripe-webhook` situation). Not a Phase 28 concern; future Paddle cleanup is in v3.0 backlog.
- v2.0 phase numbering ended at Phase 27. v3.0 starts at Phase 28 (per ROADMAP.md). [VERIFIED]

---

## Project Constraints (from CLAUDE.md)

These directives are equivalent to locked decisions and must shape the plan:

- **NEVER commit anything within `.planning/` or within `.gitignore`.** Reinforces D-02's "stay stashed/discarded, never staged" posture. The Wave 1 stash either pops cleanly or is dropped — it never goes into a commit.
- **Working agreement:** "Make changes directly in the workspace when the user asks for implementation work" + "Prefer small, reversible changes." The Phase 28 deploy-script edit (Pitfall 3 mitigation) qualifies as a small, reversible change. Adding 2 function names to a list is in-spirit.
- **Reliability priorities:** Resume Analysis and Career Compass are business-critical. D-17 revert triggers explicitly include regressions in either; the plan's smoke battery must cover both before promoting to prod. [Aligned]
- **"Treat repeated `OPTIONS`/preflight `503` responses as platform routing failures, not prompt/model failures."** Aligns with the deploy-drift hypothesis: the IPC 503 may be a routing-layer failure surfacing AS a 503; redeploy fixes routing, not model behavior.
- **Avoid retry loops that create bad UX if the upstream route is consistently unavailable.** Plan's smoke battery should fail-loud on first 503, not retry-and-mask.
- **GSD workflow enforcement:** edits go through GSD commands. Phase 28 IS a GSD phase. [Aligned]

---

## Assumptions Log

> All claims tagged `[ASSUMED]` in this research. The planner and discuss-phase use this section to identify decisions that need user confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | After a successful FF on Windows Git Bash, no leftover MERGE_HEAD or ORIG_HEAD interferes with subsequent operations. | FF Merge Mechanics | LOW — git semantics are platform-independent; if wrong, `git merge --abort` cleans up. |
| A2 | Supabase function URL pattern is `https://<project-ref>.functions.supabase.co/<function-name>`. | Phase 25/26/27 Surface Verification (Surface 3); IPC 503 repro endpoint URL | MEDIUM — if the actual pattern is `<ref>.supabase.co/functions/v1/<name>`, the curl probes need URL adjustment. Operator can verify from existing deploy logs / Supabase dashboard. |
| A3 | `supabase functions list` produces deterministic stdout in non-interactive Windows PowerShell. | Legacy Function Deletion Mechanics | LOW — `--help` shows the command supports `--output env|json|...`; can fall back to JSON if pretty output is non-deterministic. |
| A4 | Supabase production function-log retention covers 2026-04-28 timestamps when Phase 28 executes (also 2026-04-28+). | IPC 503 Repro Fidelity Risk (option F1) | MEDIUM — borderline. If logs rotated, fall back to F2 (closest-match synthetic payload). |
| A5 | A staging environment URL exists for the operator to drive the 5-feature UI smoke (D-07.3). | Smoke Battery Wire-Up | LOW — Vercel typically auto-provisions; operator can confirm. If absent, fall back to direct curl probes against staging Supabase functions. |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

---

## Open Questions

1. **FF feasibility against current branch state — REQUIRES OPERATOR DECISION BEFORE PLANNING PROCEEDS**
   - What we know: `git log by/env-fixes..main --oneline` returns 6 commits in current state. D-03 preflight cannot pass.
   - What's unclear: Does the operator know about this divergence? What's the intended branch reconciliation strategy if pure FF is impossible?
   - Recommendation: Surface as the FIRST item in plan-phase. Three sub-questions: (a) Are main's 6 commits already in `by/env-fixes` via `staging` branch? (b) If not, is the operator OK with a non-FF merge (violating D-01) OR a `main`-into-`by/env-fixes` merge first? (c) Should main's 6 commits be force-discarded?

2. **Deploy script function-list completeness — REQUIRES OPERATOR DECISION**
   - What we know: Both deploy scripts hardcode 33 functions; `interview-prep-analyze` and `interview-prep-evaluate` are missing.
   - What's unclear: Does the operator want the plan to (a) edit both scripts on `by/env-fixes` pre-merge, (b) edit on `main` post-merge as a follow-up, or (c) invoke with explicit `-Functions` override?
   - Recommendation: Option (a) — edit both scripts on `by/env-fixes` BEFORE FF merge so the merged main has the fix. This is a small reversible change per CLAUDE.md.

3. **IPC 503 original-payload recoverability — REQUIRES OPERATOR ACTION**
   - What we know: PROJECT.md preserved metadata (TTFB, in/out tokens, model name, timestamp 2026-04-28). Full request body is NOT in `.planning/`.
   - What's unclear: Are 2026-04-28 production function logs still queryable for the request body?
   - Recommendation: Wave 0 step "operator queries Supabase production logs for `interview-prep-analyze` 503 entries near 2026-04-28; capture body for replay". If unrecoverable, fall back to F2 (closest-match synthetic payload preserving token signature). Document choice in VERIFICATION.md.

4. **Original 503 tier was not preserved** — D-15 says "original-tier (primary) + Pro + Elite". The original tier is NOT in PROJECT.md (says "Pro/Elite production fix" in section header but doesn't pin the tier of the captured 503 log).
   - Recommendation: Plan covers BOTH Pro and Elite as primary repro tiers; Free is excluded per D-15 (since unknown if original was Free, default to D-15's exclusion).

5. **Misconfigured `supabase/config.staging.toml` project_id** — file says `zjpjapgraoxdukdvpjes` (production ref) at line 1.
   - Recommendation: Out of Phase 28 scope per CONTEXT.md "Out of scope: any v3.0 code edits beyond merge resolution itself". Note in VERIFICATION.md as discovered tech debt; defer to follow-up.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Git CLI (Windows Git Bash) | All git operations | ✓ | bundled | — |
| Supabase CLI | Deploy scripts, list, delete | ✓ | 2.75.0 (latest 2.95.4) | Upgrade if a deploy fails with version-related error |
| PowerShell (`pwsh`) | `scripts/deploy-*.ps1` | ✓ | bundled | Manual `supabase functions deploy` per function (tedious) |
| ripgrep (`rg`) | D-12 preflight, source greps | ✓ | bundled | `grep -rn` (POSIX fallback) |
| `curl` | IPC 503 repro, 410 shim probe | ✓ | bundled | PowerShell `Invoke-RestMethod` |
| Browser (authenticated session) | UI smoke + MeritCostPreview check | ✓ | latest Chrome | Headless Playwright (overkill for one-shot smoke) |
| Supabase Dashboard (function logs UI) | 5-min log soak (D-07.4); IPC 503 payload recovery (Option F1) | ✓ | live | Direct API query via service-role key (more complex) |
| Vercel Dashboard | Confirm frontend auto-deploy completion (Pitfall 4) | ✓ | live | Visit staging URL and observe build hash in source |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual operator runbook + targeted Deno test invocations + curl probes |
| Config file | None — plan IS the runbook |
| Quick run command | Per-step in PLAN.md (no aggregator) |
| Full suite command | None — runbook is sequential and manual |

### Phase Requirements → Test Map

| Req ID | SC | Behavior | Test Type | Automated Command | File Exists? |
|--------|----|----------|-----------|-------------------|-------------|
| MERGE-01 | SC #1 | `git log main..by/env-fixes --oneline` returns empty after FF merge | smoke | `git log main..by/env-fixes --oneline` (must produce no output) | ✅ |
| MERGE-01 | SC #1 | FF feasibility (preflight) | smoke | `git fetch origin && git log origin/by/env-fixes..origin/main --oneline` (must be empty) | ✅ |
| MERGE-02 | SC #4 (Phase 25) | `MeritCostPreview` mounts on `/career-compass` post-redeploy | static + UI | `git show main:src/pages/CareerCompass.tsx \| grep -n "MeritCostPreview"` (≥2 hits — import+mount) + browser visit | ✅ |
| MERGE-02 | SC #4 (Phase 26) | `refundMeritsForJob` recognizes `already_refunded` in resume worker | static + unit | `git show main:supabase/functions/process-resume-analysis-job/index.ts \| grep -c "already_refunded\|alreadyRefunded"` (≥1) + `deno test supabase/functions/process-resume-analysis-job/__tests__/refund-on-failure.test.ts` | ✅ |
| MERGE-02 | SC #4 (Phase 26) | Same for career worker | static + unit | `git show main:supabase/functions/process-career-analysis-job/index.ts \| grep -c "already_refunded\|alreadyRefunded"` (≥1) + `deno test supabase/functions/process-career-analysis-job/__tests__/refund-on-failure.test.ts` | ✅ |
| MERGE-02 | SC #4 (Phase 27) | 410-Gone shim responds at legacy `/stripe-webhook` (staging) | smoke (curl) | `curl -X POST -i https://cimjltzovkahkqecpwgi.functions.supabase.co/stripe-webhook -d '{}' \| head -1` returns `HTTP/1.1 410` | ❌ command needs URL pattern verification per A2 |
| MERGE-02 | SC #4 (Phase 27) | 410-Gone shim responds at legacy `/stripe-webhook` (prod) | smoke (curl) | `curl -X POST -i https://zjpjapgraoxdukdvpjes.functions.supabase.co/stripe-webhook -d '{}' \| head -1` returns `HTTP/1.1 410` | ❌ command needs URL pattern verification per A2 |
| MERGE-02 | SC #3 | IPC 503 repro returns 200 (or persistent 503 captured for Phase 41) | smoke (curl × 2 tiers) | `curl -X POST <prod>/interview-prep-analyze -H "auth: Bearer <pro_jwt>" -d @payload.json \| jq '.quizId'` (non-null) AND same for elite_jwt | ❌ payload recovery + JWT capture pre-Wave 0 |
| MERGE-02 | (smoke gate D-07.3) | All 5 features 200 on one-shot smoke | manual UI | Operator drives staging.strivo.ai through each feature | n/a |
| MERGE-02 | (smoke gate D-07.4) | No new error spikes in 5-min log soak post-staging | manual | Supabase Dashboard function-logs view | n/a |
| MERGE-03 | SC #2 | `interview-prep-coach` absent from staging functions list | smoke | `supabase functions list --project-ref cimjltzovkahkqecpwgi \| grep -c interview-prep-coach` returns 0 | ✅ |
| MERGE-03 | SC #2 | `interview-prep-coach` absent from prod functions list | smoke | `supabase functions list --project-ref zjpjapgraoxdukdvpjes \| grep -c interview-prep-coach` returns 0 | ✅ |
| MERGE-03 | (D-12 preflight) | No live refs to `interview-prep-coach` in src/ or supabase/ | smoke | `rg -n "interview-prep-coach" src/ supabase/` returns no matches | ✅ verified |

### Sampling Rate
- **Per task commit:** N/A — phase ships no commits (operator-only push of merged history).
- **Per wave merge:** Each Wave's gate commands run inline; output captured for VERIFICATION.md.
- **Phase gate:** All SC #1–4 commands above must produce expected output before VERIFICATION.md is written.

### Wave 0 Gaps
- [ ] Operator-recovered IPC 503 request body file (`payload.json`) — required for SC #3 D-14 strict-fidelity replay; if unrecoverable, document fall-back to F2 synthetic payload.
- [ ] Operator-captured Pro and Elite test-account JWTs — required for SC #3 IPC repro across D-15 tier matrix.
- [ ] Verified Supabase functions URL pattern (per A2) — required for SC #4 410-shim probes and SC #3 IPC endpoint.
- [ ] (Pitfall 3) Pre-merge edit to `scripts/deploy-staging.ps1` and `scripts/deploy-production.ps1` adding `interview-prep-analyze` and `interview-prep-evaluate` to `$Functions` — required for D-06 literal compliance.

*(All other infrastructure exists; existing test files cover the static SC #4 (Phase 26) checks.)*

---

## Sources

### Primary (HIGH confidence)
- `.planning/phases/28-merge-redeploy-baseline/28-CONTEXT.md` — D-01..D-18 locked decisions [VERIFIED: read 145 lines]
- `.planning/REQUIREMENTS.md` — MERGE-01/02/03 verbatim, traceability table [VERIFIED]
- `.planning/STATE.md` — current position, v2.0 tech debt, accumulated context [VERIFIED]
- `.planning/ROADMAP.md` — Phase 28 SC #1–4 verbatim, dependency graph [VERIFIED]
- `.planning/v2.0-MILESTONE-AUDIT.md` — Phase 25/26/27 outputs, operator-deferred actions [VERIFIED]
- `.planning/PROJECT.md:37` — IPC 503 production failure log evidence [VERIFIED]
- `scripts/deploy-staging.ps1` and `scripts/deploy-production.ps1` — invocation signature, function list, project-refs [VERIFIED]
- `supabase/functions/_shared/tier-config.ts` — Haiku-only routing post-`260419-hku` [VERIFIED]
- `supabase/functions/stripe-webhook/index.ts` — 410-Gone shim response shape [VERIFIED]
- `supabase/functions/interview-prep-analyze/index.ts` — line 648 jsonResponse target [VERIFIED]
- Live `git log` / `git status` / `git branch -vv` snapshots — branch divergence, dirty tree state [VERIFIED 2026-04-28]
- `supabase --help` outputs for `functions list` / `functions delete` [VERIFIED via local CLI 2.75.0]
- `CLAUDE.md` — `.planning/` commit prohibition, reliability priorities, working agreement [CITED]
- `README.md` §Deployment — confirms staging/prod deploy via Supabase CLI + PowerShell scripts [CITED]

### Secondary (MEDIUM confidence)
- `git-scm.com/docs/git-merge` — `--ff-only` semantics, `--abort` behavior [CITED]
- `git-scm.com/docs/git-stash` — `-u` and `--keep-index` semantics [CITED]
- `scripts/phase21-runbook.ps1` — interview-prep-coach delete reminder ack ceremonies, confirms only-documentation reference [VERIFIED]

### Tertiary (LOW confidence)
- None beyond items listed in §Assumptions Log.

---

## Metadata

**Confidence breakdown:**
- Locked decisions captured verbatim: HIGH — direct copy from CONTEXT.md
- Branch state observation: HIGH — live `git log` 2026-04-28
- Deploy script anatomy: HIGH — direct file reads
- Phase 25/26/27 surface verification commands: HIGH — file content verified, but URL pattern (A2) is MEDIUM
- IPC 503 repro fidelity: MEDIUM — payload not preserved; multiple fallback paths documented
- Smoke battery wire-up: MEDIUM — no existing smoke script; per-feature commands proposed but not pre-tested
- Common pitfalls: HIGH — derived from observed repo state and documented decisions

**Research date:** 2026-04-28
**Valid until:** 2026-05-12 (14 days; branch state and deploy-script contents may drift if main receives new commits or scripts are edited; re-verify divergence at plan-phase start)

---

## RESEARCH COMPLETE

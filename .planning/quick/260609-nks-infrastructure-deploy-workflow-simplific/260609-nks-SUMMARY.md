---
phase: quick-260609-nks
plan: 260609-nks
subsystem: infrastructure / deploy / CI
tags: [deploy, supabase, vercel-ci, env-templates, worktree-hygiene, testing-topology]
dependency_graph:
  requires: []
  provides:
    - "Unified scripts/deploy.ps1 -Env <production|staging|test> with explicit supabase link"
    - "Single annotated supabase/config.toml (config.<env>.toml footgun removed)"
    - "workflow_dispatch-only vercel-preview.yml"
    - "Committable secret-free env templates (.env.example, .env.test.local.example)"
    - "Durable TEST-topology record in 01-03-CHECKPOINT.md + TESTING-STRATEGY.md"
  affects:
    - "scripts/deploy-staging.ps1, scripts/deploy-production.ps1 (now thin shims)"
tech_stack:
  added: []
  patterns:
    - "Explicit `supabase link --project-ref` as single source of deploy-target selection"
    - "Backward-compatible shim scripts forwarding -Functions to a unified script"
    - "Negation-pattern .gitignore entries for committable secret-free templates"
key_files:
  created:
    - scripts/deploy.ps1
    - .env.example
    - .env.test.local.example
  modified:
    - scripts/deploy-staging.ps1
    - scripts/deploy-production.ps1
    - supabase/config.toml
    - .github/workflows/vercel-preview.yml
    - .gitignore
    - .planning/phases/01-testing-strategy-regression-baseline/01-03-CHECKPOINT.md
    - TESTING-STRATEGY.md
  deleted:
    - supabase/config.staging.toml
    - supabase/config.production.toml
decisions:
  - "TEST target = strivoaipreview (cimjltzovkahkqecpwgi); SUPABASE_TEST_* map to it"
  - "AI_TEST_MODE is transient (CI set/unset around E2E, if: always() cleanup), not a permanent secret"
  - "Stripe scope = integration-proven (reaffirmed, unchanged)"
metrics:
  tasks: 6
  commits: 5
  files_changed: 13
  completed: 2026-06-09
---

# Phase quick-260609-nks: Infrastructure / Deploy Workflow Simplification Summary

Collapsed two near-duplicate deploy scripts into one env-parameterized
`scripts/deploy.ps1` (explicit `supabase link --project-ref` as the single source of
project selection), removed the redundant `config.<env>.toml` footgun, switched the
failing push-triggered Vercel preview deploy to manual `workflow_dispatch`, established
committable secret-free env templates, recorded the TEST topology decisions durably, and
pruned 8 stale fully-merged agent worktrees while preserving 6 with unmerged work.

## What each task changed

### Task 1 — Unified deploy script + shims (commit `c97bb44`)
- Created `scripts/deploy.ps1` with `param([Parameter(Mandatory)][string]$Env, [string[]]$Functions = @(...))`.
- Validates `-Env` (case-insensitive) against `production | staging | test`; unknown values hit
  `Write-Error` + `exit 1` and (with `$ErrorActionPreference = "Stop"`) terminate before any
  deploy logic. Verified: `-Env bogus` prints `Invalid -Env 'bogus'...` and never reaches the link/loop.
- `switch` maps env → ref: production → `zjpjapgraoxdukdvpjes`, staging/test → `cimjltzovkahkqecpwgi`.
- Always runs `supabase link --project-ref $ref` (authoritative target selection); the
  `Copy-Item config.<env>.toml` step is gone entirely (comment notes why).
- Default `$Functions` is the EXACT 38-function list copied verbatim from the original
  `deploy-staging.ps1` — verified byte-identical and same order via diff against `git HEAD`.
- Deploy loop preserved verbatim: `supabase functions deploy $fn --no-verify-jwt --use-api`
  with the server-side-bundling comment.
- Replaced `scripts/deploy-staging.ps1` and `scripts/deploy-production.ps1` with thin shims that
  forward `-Functions` through to `deploy.ps1 -Env staging|production`.
- `deploy.ps1` passes a `[scriptblock]::Create(...)` parse check.

### Task 2 — Remove redundant config.<env>.toml; annotate config.toml (commit `6f6c60c`)
- `git rm supabase/config.staging.toml supabase/config.production.toml` (both confirmed
  byte-identical to `config.toml` via `diff` rc=0, both hard-coded the prod `project_id`).
- Added a header comment block to `supabase/config.toml` explaining that `scripts/deploy.ps1`'s
  explicit `supabase link --project-ref` is authoritative for the deploy target and `project_id`
  is only the local-linking default. `project_id` value and all 35 `[functions.*] verify_jwt`
  lines are unchanged (diff shows only the comment added).
  > Note: the plan estimated "37" function blocks; the actual original count was **35**
  > `verify_jwt` lines / `[functions.*]` blocks (confirmed identical in `git HEAD` and working copy).

### Task 3 — vercel-preview.yml → workflow_dispatch (commit `0750461`)
- Replaced the `on: push: branches-ignore:` block with `workflow_dispatch:` plus an explanatory
  comment (free 1-member team native-deploy member-limit failure). `branches-ignore` fully removed;
  all `jobs:` / `deploy-preview` steps byte-identical (diff confirms only the trigger block changed).

### Task 4 — Committable secret-free env templates (commit `57f84e1`)
- Added `.gitignore` negation `!.env.test.local.example` (the `!.env.example` negation already existed).
- Created `.env.example` — grouped (Frontend VITE_*, Supabase edge secrets, Test/E2E) with a
  which-env matrix; NAMES + empty/`# placeholder` values only, no real keys.
- Created `.env.test.local.example` — header "Copy to .env.test.local and fill — DO NOT commit the
  filled copy"; non-secret TEST URL placeholder `https://cimjltzovkahkqecpwgi.supabase.co`, empty
  secret values with `#` comments.
- **`git check-ignore .env.example` → EMPTY and `git check-ignore .env.test.local.example` → EMPTY**
  (both tracked); both staged as `A`. Secret-shape scan found only empty `E2E_TEST_PASSWORD=`
  name lines (value side empty, followed by a comment) — no real secret literals.

### Task 5 — Record TEST topology (commit `2ae4ba7`)
- `01-03-CHECKPOINT.md`: added "## Recorded infra topology (durable — honor on resume)" capturing
  (a) TEST target = strivoaipreview (`cimjltzovkahkqecpwgi`), (b) `AI_TEST_MODE` transient
  (CI `secrets set` before / `secrets unset` after E2E, `if: always()` cleanup), (c) the
  local-authoring transient toggle discipline, (d) Stripe `integration-proven` reaffirmed.
  Reconciled the pre-existing "dedicated TEST project ONLY" wording to clarify it IS
  strivoaipreview with a transient (not permanent) secret.
- `TESTING-STRATEGY.md`: AI_TEST_MODE bullet now states transient CI-toggled on the TEST project
  = strivoaipreview; `SUPABASE_TEST_*` mapped to `cimjltzovkahkqecpwgi`. "never valued" rule kept;
  no key/JWT/password literal added (scan clean).

### Task 6 — Worktree hygiene (no commit — git hygiene only)
See the before/after worktree tables below.

## Worktree before/after

**BEFORE:** main staging tree + **14** `worktree-agent-*` worktrees (all `locked`).

Unmerged set was re-derived at runtime via `git branch --no-merged staging` ∪
`git branch --no-merged main` (identical results in both) → **6 unmerged** (preserved);
the other **8** were fully merged (removed).

### REMOVED (8 — fully merged into both staging and main)

| Branch | Tip | Tip summary |
| ------ | --- | ----------- |
| worktree-agent-a06a7119 | 25bbd38 | docs(15.1-02): complete Free single-call routing plan summary |
| worktree-agent-a0a4d128 | 6ffdec5 | test(16-02): add prompt variant unit tests for D-10/D-11/D-12/LIG-03 |
| worktree-agent-a0ca52d1 | 73275cf | feat(19-01): add interview prep validation module for AI output shapes |
| worktree-agent-a15dd5d3 | 03b533f | feat(19-05): add quiz results, readiness ring, streak display + wire into InterviewPrep |
| worktree-agent-a243b867 | 927ce28 | feat(19-03): add interview-prep-evaluate Elite quiz scoring edge function |
| worktree-agent-a2ba51c8 | ac40f11 | feat(19-02): add interview-prep-analyze edge function (Pro flashcards / Elite quiz) |
| worktree-agent-a4fcf72c | 726659c | test(17-01): add career-shape.test.ts with 20 golden fixture tests for all 3 tiers |
| worktree-agent-a8dcd2a4 | 48ecf87 | Preview (#334) |

Each: `git worktree unlock` (succeeded, no error) → `git worktree remove --force` → `git branch -D`,
then `git worktree prune`. All 8 removed cleanly; no failures.

### PRESERVED for manual review (6 — carry UNMERGED commits)

| Branch | Tip | Tip summary |
| ------ | --- | ----------- |
| worktree-agent-a0418fbf02382e929 | 2b6805e | docs(47-01): complete coming-soon-primitives plan |
| worktree-agent-a5e298e3 | 085bf9a | feat(24-04): add TS-module fallback to useFeatureCosts (D-03/ECON-02) |
| worktree-agent-a6d7096e9e9e4f460 | 0e25e2f | test(31-01): add failing tests for getMeritErrorMessage taxonomy |
| worktree-agent-abddefae9bfb315c8 | d29e3ce | docs(47-00): complete Interview Prep production-gate feature-flag plan |
| worktree-agent-af019495180b9353e | 41d7e7e | docs(31-02): complete refundable-error fault injector plan |
| worktree-agent-af9fb2676776f2f86 | e23bd42 | docs(27-02): complete cutover runbook and notes plan |

These 6 worktrees and branches were left intact (still `locked`) for the operator to review/merge
or discard later. **AFTER:** main staging tree + only these 6 `worktree-agent-*` worktrees remain.

Protected branches confirmed intact: `staging` (current), `main`, `preview`, `by/env-fixes`.

## Deviations from Plan

None affecting behavior. One factual reconciliation worth noting: the plan's Task 2 verify expected
"37" `verify_jwt` blocks in `config.toml`; the actual original count was **35** (identical in
`git HEAD` and the working copy — only a comment block was added, no `verify_jwt` line touched).

## Confirmations (per output spec)

- `git check-ignore .env.example` → **EMPTY** (tracked); `git check-ignore .env.test.local.example`
  → **EMPTY** (tracked). Both staged as `A` and committed.
- `.planning/config.json` was **left untouched and uncommitted** — it remains ` M` (dirty,
  pre-existing) in `git status` and was never staged or committed by any task. No task used
  `git add -A`/`.`/`-f`; every commit staged only its specific files.
- ROADMAP.md was not modified.

## Self-Check: PASSED

- Files exist: `scripts/deploy.ps1`, `.env.example`, `.env.test.local.example` — all FOUND.
- Deletions confirmed: `supabase/config.staging.toml`, `supabase/config.production.toml` — both gone.
- Commits present: `c97bb44`, `6f6c60c`, `0750461`, `57f84e1`, `2ae4ba7` — all FOUND.
- `.planning/config.json` still ` M` (uncommitted) — confirmed untouched.

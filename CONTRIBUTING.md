# Contributing to Strivo AI

This document records the **de-facto conventions** this repository already
follows — commit-message format, branch model, and staging discipline. It is
**descriptive, not a new stricter standard**: it codifies what is already true
in `git log` so future contributors and GSD agents have a discoverable,
accurate reference. No tooling enforces these rules (see
[What not to do](#what-not-to-do)) — they are conventions, not gates.

## Branch model

The canonical promotion model is:

```text
main (production)  ←  preview (pre-prod)  ←  staging (active dev / integration)
```

Promotion direction is **`staging → preview → main` via PR**. Never push
straight to `main` — production only ever receives changes that have been
promoted up through `preview`. This mirrors `origin/HEAD → origin/main`, the
`vercel-production-manual` workflow, and the deploy scripts in `scripts/`.

**Branch taxonomy:**

- **Promotion branches** — `main`, `preview`, `staging`. Long-lived; only these
  three exist on `origin`.
- **Topic branches** — `by/<initials>-<topic>` (e.g. the now-pruned
  `by/env-fixes`, which carried Phase-27 environment fixes). Short-lived,
  merged up via PR, then deleted.
- **GSD agent branches** — `worktree-agent-*`. Ephemeral, auto-managed git
  worktrees created by GSD execution; their working directories under
  `.claude/worktrees/` are gitignored. They are squash-merged into the
  integration line and then retired (the six historical ones were retired in
  Phase 2 — see
  `.planning/phases/02-repository-hygiene-state-reconciliation/02-WORKTREE-DISPOSITION.md`).

**Known state:** `staging` may sit diverged from `origin/main` by design — it
can be both ahead (active cleanup work) and behind (production commits not yet
relevant to the cleanup line). This divergence is a **documented known-state**,
not a defect to "fix" by blindly merging `origin/main` into `staging`. Closing
the gap is a deliberate non-goal of routine hygiene work.

## Commit messages

Commits follow [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Recognized types:** `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `style`,
`refactor`, `perf`, `test`. A breaking change is signalled with a `!` before the
colon (e.g. `feat(api)!: ...`) and/or a `BREAKING CHANGE:` footer (the token
MUST be uppercase). Footers are git trailers in `Token: value` form.

**GSD scopes (de-facto, used throughout this repo):**

| Scope          | Meaning                          | Example                              |
| -------------- | -------------------------------- | ------------------------------------ |
| `(NN-NN)`      | phase-plan                       | `feat(01-03): ...`, `test(24-04): ...` |
| `(phase-NN)`   | whole-phase                      | `docs(phase-01): ...`                |
| `(state)`      | STATE.md / planning bookkeeping  | `docs(state): ...`                   |
| `(NN)`         | phase-level (no specific plan)   | `test(01): ...`                      |
| `(NNNNNN-xxx)` | quick task                       | `docs(260609-nks): ...`              |
| _(none)_       | plain / cross-cutting            | `chore: ...`                         |

**`Co-Authored-By` trailer:** commits authored with AI assistance carry a
`Co-Authored-By: <name> <email>` trailer (GSD auto-appends a Claude trailer).
This trailer is **accepted and expected** — keep it; do not strip it.

**Examples (illustrative — never paste a real secret or env value):**

```text
docs(02-05): document commit + branch conventions in CONTRIBUTING.md (REPO-04)
chore(02-03): untrack stale dist-codex build output + gitignore (REPO-03/REPO-05)
test(01-05): match Flow 3 assertion to Stripe's real EmbeddedCheckout iframe
```

## Staging discipline

When staging changes for commit:

- Stage **specific file paths only** — e.g. `git add CONTRIBUTING.md CLAUDE.md`.
- **Never** `git add -A`, `git add .`, or `git add -f`. Blanket staging sweeps
  in unrelated churn (dirty machine-local state, planning artifacts) and the
  force flag re-tracks ignored paths.
- **`.planning/` IS tracked** (since 2026-05-11, commit `a0bf4f5`). Commit it
  normally with specific paths — it is no longer ignored. Older notes saying
  "do not commit `.planning/`" are stale.
- **Never commit `.gitignore`'d content** (e.g. `node_modules/`, build output,
  machine-local Supabase link state under `supabase/.temp/`, `.env*` secret
  files). The `.env.example` / `.env.test.local.example` templates are the only
  committable env files.

## What not to do

- **Do not rewrite published history.** No `rebase`, `squash`, `--amend`, or
  `push --force` on any branch that has been pushed (`main`, `preview`,
  `staging`, or any shared topic branch). History on pushed branches is
  append-only.
- **Do not add commit-lint tooling.** These conventions are documentation-only —
  there is intentionally **no `husky` / `commitlint`** git hook or dependency.
  This keeps the project's zero-new-deps posture. Mechanical enforcement, if
  ever wanted, is a separate future decision.

## Validation before PR

Before opening a PR, run the zero-functional-change gate:

```sh
npm run verify:baseline
```

This chains the deterministic test layers (vitest + offline Deno) plus the
Playwright E2E suite. It must match the recorded `v4.0-baseline` pass/fail
profile — green on the deterministic layers, with any E2E redness limited to
known, operator-gated infrastructure (documented in `TESTING-STRATEGY.md` and
`.planning/STATE.md`). A **new** failure in the deterministic layers is a real
regression and must be resolved before the PR.

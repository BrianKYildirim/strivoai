---
phase: 02-repository-hygiene-state-reconciliation
plan: 05
subsystem: infra
tags: [contributing, conventional-commits, branch-model, docs, repo-hygiene, verify-baseline, REPO-04, NFR-01]

# Dependency graph
requires:
  - phase: 02-repository-hygiene-state-reconciliation
    provides: "02-03 (dist-codex/ + supabase/.temp/ + pricing.png untracked) and 02-04 (branch set reduced to main/preview/staging; 6 worktree-agent-* + by/env-fixes retired) established the now-true repo reality this doc describes"
  - phase: 01-testing-strategy-regression-baseline
    provides: "verify:baseline gate (vitest + offline-deno + Playwright) and the v4.0-baseline @ fa4ccb6 profile this plan re-proves against"
provides:
  - "CONTRIBUTING.md at repo root — discoverable, descriptive record of de-facto commit + branch conventions (Conventional Commits + GSD scope table + Co-Authored-By trailer + staging->preview->main promotion + branch taxonomy + staging discipline + no-rewrite/no-commitlint rules + verify:baseline gate)"
  - "One-line CONTRIBUTING.md pointer in CLAUDE.md ## Repository Conventions (no full-standard duplication)"
  - "Phase-wide zero-functional-change PROOF: git diff fa4ccb6..HEAD -- src supabase/functions EMPTY + verify:baseline green (exit 0)"
  - "Phase 2 closed: REPO-01..05 all delivered, zero runtime behavior changed"
affects: [phase-03-inventory-audit, phase-04-dead-code-cleanup, all-future-contributors]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Descriptive-not-prescriptive conventions doc: CONTRIBUTING.md codifies what git log ALREADY does (D-12), it does not invent a stricter standard"
    - "Single-home + pointer (D-13): the full standard lives in CONTRIBUTING.md; CLAUDE.md (agent memory) gets one pointer line, never a duplicate"
    - "Documentation-only conventions (D-14): no husky/commitlint dependency or git hook — zero-new-deps posture preserved"
    - "Phase-close gate: re-run verify:baseline against the recorded v4.0-baseline profile, distinguishing pre-existing/known-infra reds from genuine regressions"

key-files:
  created:
    - CONTRIBUTING.md
    - .planning/phases/02-repository-hygiene-state-reconciliation/02-05-SUMMARY.md
  modified:
    - CLAUDE.md

key-decisions:
  - "CONTRIBUTING.md written descriptively (D-12) — grounded in a live git-log sample: Conventional Commits types feat/fix/build/chore/ci/docs/style/refactor/perf/test; GSD scope table (NN-NN)/(phase-NN)/(state)/(NN)/(NNNNNN-xxx)/plain; Co-Authored-By trailer documented as ACCEPTED (GSD auto-appends it — must not clash)."
  - "Branch section reflects the now-true POST-reconciliation reality (after 02-04): only main/preview/staging survive; promotion staging->preview->main via PR stated explicitly; by/env-fixes named as the now-pruned Phase-27 topic branch; worktree-agent-* documented as ephemeral/gitignored/retired (cross-refs 02-WORKTREE-DISPOSITION.md); the staging<->origin/main divergence noted as the D-07 documented known-state."
  - "Staging discipline section restates the secret-hygiene posture: specific paths only, never git add -A/./-f, .planning/ IS tracked (since a0bf4f5, 2026-05-11), never commit .gitignore'd content."
  - "What-not-to-do section codifies no-history-rewrite on pushed branches + no husky/commitlint (D-14, doc-only)."
  - "CLAUDE.md gets ONE pointer line under ## Repository Conventions (D-13) — the full convention table is NOT duplicated into agent memory."

patterns-established:
  - "CONTRIBUTING.md as the canonical contributor-facing conventions home; CLAUDE.md points to it rather than absorbing it."

requirements-completed: [REPO-04]

# Metrics
duration: 12min
completed: 2026-06-13
---

# Phase 2 Plan 5: CONTRIBUTING.md Conventions + Phase-Wide Zero-Functional-Change Proof

**Created a descriptive repo-root CONTRIBUTING.md codifying the de-facto Conventional-Commits + GSD-scope + Co-Authored-By + `staging → preview → main` conventions as-is, added a one-line CLAUDE.md pointer, and closed Phase 2 by proving zero functional change — `git diff fa4ccb6..HEAD -- src supabase/functions` is EMPTY and `verify:baseline` is fully green (exit 0).**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-13T13:03:43Z
- **Completed:** 2026-06-13T13:15:30Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 edited) + 1 SUMMARY

## Accomplishments

- **CONTRIBUTING.md (new, repo root, 123 lines)** — five descriptive sections (Branch model, Commit messages, Staging discipline, What not to do, Validation before PR) codifying the conventions the repo already follows. Grounded in a live `git log` sample (confirmed Conventional Commits types, GSD scopes `(NN-NN)`/`(phase-NN)`/`(state)`/`(NN)`/`(NNNNNN-xxx)`/plain, the `Co-Authored-By: Claude Opus 4.8 ...` trailer, and `.planning/` tracked since `a0bf4f5`).
- **Now-true branch reality documented** — only `main`/`preview`/`staging` survive (post-02-04); promotion direction `staging → preview → main` stated explicitly so contributors never push straight to `main`; `by/<initials>-<topic>` topic branches and ephemeral `worktree-agent-*` GSD branches documented; `staging ↔ origin/main` divergence noted as the D-07 known-state.
- **CLAUDE.md one-line pointer (D-13)** — `* Commit-message + branch-naming conventions: see \`CONTRIBUTING.md\`` added under `## Repository Conventions`; no full-standard duplication.
- **Phase-wide zero-functional-change proof (NFR-01)** — `git diff --stat fa4ccb6..HEAD -- src supabase/functions` → **EMPTY** (0 runtime-source files); `npm run verify:baseline` → **green, exit 0** (vitest 468/468, deno 284/0, Playwright 5 passed + 1 quarantined-skip).
- **Phase 2 closed** — REPO-01..05 all delivered across plans 02-01..02-05 with zero runtime behavior changed.

## Task Commits

1. **Task 1: Write CONTRIBUTING.md and add the CLAUDE.md pointer** — `ca357cf` (docs)
2. **Task 2: Re-run verify:baseline to prove zero functional change** — verification-only (no code commit; result recorded here)

**Plan metadata:** committed with this SUMMARY + STATE.md + ROADMAP.md (docs)

## Files Created/Modified

- `CONTRIBUTING.md` (created, +123) — descriptive contributor conventions: branch model + promotion direction, Conventional Commits + GSD scope table + Co-Authored-By trailer, staging discipline, no-history-rewrite/no-commitlint, verify:baseline gate.
- `CLAUDE.md` (modified, +1) — one-line pointer to CONTRIBUTING.md under `## Repository Conventions`.

## Validation Results

### Task 1 acceptance (all green)

- `CONTRIBUTING.md` exists, **123 lines** (≥ 40 required).
- `grep -F "staging → preview → main"` matches (promotion direction stated).
- `Conventional Commits` + `Co-Authored-By` + `by/<initials>` + `worktree-agent` all present (commit + branch taxonomy).
- staging-discipline (`git add -A` / `-f` / specific paths) + `husky`/`commitlint` (doc-only note) + `verify:baseline` all present.
- `CONTRIBUTING.md` appears in `CLAUDE.md` (one pointer line; no inlined standard).
- Secret-pattern grep against `CONTRIBUTING.md` → **no real secret value** (examples are illustrative placeholders only).
- `git show --stat HEAD` (`ca357cf`) lists **only** `CONTRIBUTING.md` (+123, new) and `CLAUDE.md` (+1) — specific paths, no `-A`/`.`/`-f`.

### Task 2 — Phase-wide zero-functional-change gate

- **Authoritative runtime-source proof:** `git diff --stat fa4ccb6..HEAD -- src supabase/functions` → **EMPTY (0 files)**. No Phase-2 commit touched any product runtime source.
- **`npm run verify:baseline` → exit 0 (fully green):**
  - **vitest:** `468 passed (468)`, 81 files — matches v4.0-baseline (Blocker A resolved at 468).
  - **deno (offline edge, deterministic):** `284 passed | 0 failed`.
  - **Playwright E2E:** `5 passed`, `1 skipped` — the skip is the pre-existing intentional QUARANTINE (`4242 card-fill + submit`), not a failure. All three Stripe checkout assertions (clientSecret round-trip, EmbeddedCheckout iframe mount, `?checkout=complete` reconcile) plus auth-session and resume-analysis flows are GREEN.
- **Baseline-profile interpretation (per the final_baseline_gate):** the result is the **same-or-better** than the recorded `v4.0-baseline` (`fa4ccb6`) profile. The previously-RED Stripe E2E flow (STATE.md Blocker B — TEST project lacked Stripe TEST-mode secrets `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ELITE_*`) is now GREEN, indicating the operator has since configured those TEST secrets on the shared TEST project. There are **zero new failures** in any layer; the deterministic vitest + offline-deno layers are perfectly green.
- **Net hygiene cross-checks (phase-wide):** `git ls-files dist-codex/ "supabase/.temp/" pricing.png` → `0`; `git branch` → `main`/`preview`/`staging` only; `git worktree list` → 1 line. Phase 2's REPO-02/03/05 outcomes hold.

### Note on the e2e/global-setup.ts entry in `fa4ccb6..HEAD`

The full `git diff --stat fa4ccb6..HEAD` lists `e2e/global-setup.ts` (`19 +-`). This is **NOT a Phase-2 change** — it comes from `307b6d3 test(01): reset test-profile Stripe ids in e2e global-setup for re-runnable baseline`, a **Phase-1** commit (`(01)` scope) that landed immediately after the `v4.0-baseline` tag was placed (`307b6d3`'s parent is `4c76eb5`; `fa4ccb6` is the tagged baseline one commit behind). No Phase-2 commit touched `e2e/`, `src/`, or `supabase/functions/`. The authoritative runtime-source diff scoped to `src supabase/functions` is empty, confirming zero Phase-2 functional change.

## Decisions Made

- **Descriptive, not prescriptive (D-12):** CONTRIBUTING.md codifies the existing reality (sampled from live `git log`) rather than introducing a stricter standard. The `Co-Authored-By` trailer is documented as *accepted/expected* (GSD auto-appends it) so the doc never clashes with the auto-generated commit style.
- **Single home + pointer (D-13):** the full convention table lives only in CONTRIBUTING.md; CLAUDE.md receives one pointer line. No duplication into agent memory.
- **Documentation-only (D-14):** no `husky`/`commitlint` or any dependency added — the "What not to do" section states the no-enforcement-tooling stance explicitly.
- **Branch section reflects post-02-04 reality:** wrote the branch taxonomy against the *now-true* state (main/preview/staging only; by/env-fixes + worktree-agent-* retired), cross-referencing 02-WORKTREE-DISPOSITION.md, rather than the pre-reconciliation snapshot.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **CLAUDE.md has two `## Repository Conventions` blocks** (a leftover from a historical merge — the second block sits below a `>>>>>>> 3ffe64c...` merge-marker region in the file). The Edit tool's first attempt matched both. Resolved by anchoring the edit with the preceding `## Important Commands` block so the pointer landed in the **primary** (top) Repository Conventions section only. The duplicate/merge-marker region is pre-existing and out of scope for this documentation-only plan (logged here, not "fixed" — repairing the merge marker would be an unrelated content change).
- **CRLF normalization warning** on `git add CONTRIBUTING.md` ("LF will be replaced by CRLF") — benign Windows line-ending normalization; the committed blob stores LF (Pitfall 4 avoided by writing via the Write tool). No BOM, no whole-file EOL flip.

## User Setup Required

None - documentation-only plan; no external service configuration required. (Separately noted: the operator appears to have already configured the TEST-project Stripe TEST-mode secrets, which is why the E2E Stripe flow is now green — that closes the long-standing STATE.md Blocker B.)

## Next Phase Readiness

- **Phase 2 is complete.** REPO-01 (STATE↔git reconciliation), REPO-02 (branch/worktree reconciliation), REPO-03 (tracked-junk cleanup), REPO-04 (this plan — conventions doc), REPO-05 (secret/artifact scan) are all delivered with a proven zero-functional-change footprint across `fa4ccb6..HEAD`.
- **Phase 3 (Cross-Domain Inventory & Audit)** can proceed on a clean, accurately-described repo: clean branch set, no tracked junk, documented conventions, and a green `verify:baseline` as the regression spine.
- No blockers carried forward from this plan. (The historical CLAUDE.md merge-marker duplication is a candidate for a future tidy-up but is out of scope here.)

## Self-Check: PASSED

- `CONTRIBUTING.md` — FOUND
- `.planning/phases/02-repository-hygiene-state-reconciliation/02-05-SUMMARY.md` — FOUND
- Task 1 commit `ca357cf` — FOUND (touches only `CONTRIBUTING.md` +123 + `CLAUDE.md` +1)
- Phase-wide runtime-source diff `fa4ccb6..HEAD -- src supabase/functions` — EMPTY
- `npm run verify:baseline` — exit 0 (vitest 468/468, deno 284/0, Playwright 5 passed + 1 quarantine-skip)

---
*Phase: 02-repository-hygiene-state-reconciliation*
*Completed: 2026-06-13*

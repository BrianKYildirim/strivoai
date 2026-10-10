---
phase: 07-environment-variable-audit-organization
plan: 04
subsystem: infra
tags: [documentation, env-vars, deploy, supabase, secrets-hygiene, NFR-03]

# Dependency graph
requires:
  - phase: 07-01
    provides: "docs/ENVIRONMENT.md (canonical secret-free env matrix) + .env.example / .env.test.local.example skeletons"
provides:
  - "README §Deployment corrected to the unified scripts/deploy.ps1 -Env model (explicit supabase link --project-ref + verify:baseline HARD gate; no config.toml swap)"
  - "README/CLAUDE.md/AGENTS.md env sections reconciled to point at docs/ENVIRONMENT.md instead of a stale, Stripe-less, RAPIDAPI-ghost list"
  - "TESTING-STRATEGY.md test/E2E env vars reconciled with .env.test.local.example (cimjltzovkahkqecpwgi preview=staging=test mapping; AI_TEST_MODE transient)"
  - "Three committed git merge-conflict markers removed (README/CLAUDE.md/AGENTS.md); dead RAPIDAPI_KEY doc-ghost dropped from all docs; AGENTS.md ANTHROPIC_API_KEY Codex->Claude content bug fixed"
affects: [phase-08, env-vars, deploy, onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Doc env lists are POINTERS to docs/ENVIRONMENT.md (single source of truth), not duplicated matrices"
    - "Names-not-values discipline enforced on every committed doc via the corrected (no -E) secret-grep guard"

key-files:
  created: []
  modified:
    - README.md
    - CLAUDE.md
    - AGENTS.md
    - TESTING-STRATEGY.md

key-decisions:
  - "Replaced hand-maintained env lists in README/CLAUDE.md/AGENTS.md with a short pointer to docs/ENVIRONMENT.md rather than re-listing the full live surface (avoids re-drift + re-introducing secret-value risk)"
  - "Edited ONLY the CLAUDE.md env block + removed the single tail merge marker; preserved the generate-claude-profile Developer-Profile managed section AND the operator-added SUPABASE MCP rules block byte-for-byte"
  - "Reconciled TESTING-STRATEGY.md by ADDING a pointer to .env.test.local.example + docs/ENVIRONMENT.md; the section already carried the cimjltzovkahkqecpwgi mapping and the transient AI_TEST_MODE note from Plan 07-01"

patterns-established:
  - "Pattern 1: NFR-03 doc-reconcile — every doc surface touched by env/config/structure change points at the canonical reference"
  - "Pattern 2: per-task secret-grep guard (corrected, no -E) over every edited doc must return ZERO before commit"

requirements-completed: [NFR-03]

# Metrics
duration: ~16min
completed: 2026-06-23
---

# Phase 07 Plan 04: NFR-03 Documentation Reconciliation Summary

**Reconciled all four drifted doc surfaces (README/CLAUDE.md/AGENTS.md/TESTING-STRATEGY.md) to the canonical docs/ENVIRONMENT.md: fixed the stale README "swap config.toml" deploy description, removed three committed merge markers, dropped the dead RAPIDAPI_KEY ghost, and fixed the AGENTS.md Codex->Claude content bug — zero src/functions diff, secret-grep ZERO.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-06-23T08:15Z (approx, post 07-03)
- **Completed:** 2026-06-23T08:31Z
- **Tasks:** 2
- **Files modified:** 4 (README.md, CLAUDE.md, AGENTS.md, TESTING-STRATEGY.md)

## Accomplishments
- **README §Deployment corrected:** now describes the unified `scripts/deploy.ps1 -Env {production|staging|test}` with explicit `supabase link --project-ref` selection, `deploy-staging.ps1`/`deploy-production.ps1` as thin shims, and the `verify:baseline` HARD gate that runs (and can abort) BEFORE `supabase link`. The config.toml-swap footgun description is gone (`rg "config\.toml.*swap|swap.*config\.toml" README.md` = 0).
- **README/CLAUDE.md/AGENTS.md env sections** now point at `docs/ENVIRONMENT.md` (2 pointers each in README/CLAUDE/AGENTS) instead of duplicating a stale list that omitted the entire Stripe surface, OCR fallbacks, STRIVO_ENV, MERIT_SYSTEM_ENABLED, and ADMIN_EMAIL(S).
- **Three committed merge-conflict markers removed** (README:85, CLAUDE.md:594, AGENTS.md:566 — the `> > > > > > > 3ffe64c14c0fd8f4182c1c51a374d37d7f1d114e` sentinel). All three now 0.
- **Dead `RAPIDAPI_KEY` doc-ghost dropped** from README/CLAUDE.md/AGENTS.md (0 across all four docs).
- **AGENTS.md content bug fixed:** `ANTHROPIC_API_KEY ... for Codex model calls` -> Claude (`rg "Codex model calls" AGENTS.md` = 0).
- **TESTING-STRATEGY.md reconciled:** added an explicit pointer to `.env.test.local.example` + `docs/ENVIRONMENT.md`; the `cimjltzovkahkqecpwgi` (preview=staging=test) mapping and the transient `AI_TEST_MODE` note are present (3 + 1 hits respectively).
- **CLAUDE.md managed sections preserved byte-for-byte:** the `## Developer Profile` (`generate-claude-profile`-managed) block AND the operator-added `SUPABASE MCP is connected ...` rules block are unchanged; the CLAUDE.md diff touches ONLY the env block (`@@ -189,16 +189,14`) and the removed tail marker (`@@ -594,2 +591,0`).

## Task Commits

Each task was committed atomically (sequential, hooks enabled — no --no-verify):

1. **Task 1: Fix README §Deployment + §Environment Variables; remove merge marker; drop RAPIDAPI_KEY** - `6b783a97` (docs)
2. **Task 2: Reconcile CLAUDE.md + AGENTS.md env blocks; remove both tail markers; fix Codex->Claude; reconcile TESTING-STRATEGY.md** - `725254d4` (docs)

**Plan metadata (this SUMMARY):** committed separately as `docs(07-04): SUMMARY NFR-03 doc reconciliation`.

## Files Created/Modified
- `README.md` - §Deployment rewritten to the unified deploy.ps1 model; §Environment Variables -> docs/ENVIRONMENT.md pointer; merge marker + RAPIDAPI_KEY removed
- `CLAUDE.md` - env block -> docs/ENVIRONMENT.md pointer (RAPIDAPI dropped); tail merge marker removed; managed Developer-Profile + MCP-rules sections untouched
- `AGENTS.md` - env block -> docs/ENVIRONMENT.md pointer (RAPIDAPI dropped, Codex->Claude fixed); tail merge marker removed
- `TESTING-STRATEGY.md` - added pointer to .env.test.local.example + docs/ENVIRONMENT.md in the test-secrets section (cimjltzovkahkqecpwgi mapping + transient AI_TEST_MODE reaffirmed)

## Decisions Made
- Used short pointers to `docs/ENVIRONMENT.md` rather than re-listing the full live env surface in three docs — prevents future drift and keeps the names-not-values blast radius minimal.
- For CLAUDE.md, edited only the env-variable block and removed the single stray tail marker; preserved both managed regions (Developer Profile + the operator-added MCP rules block) byte-for-byte, verified via `git diff -U0` hunk-header scoping.

## Deviations from Plan

None - plan executed exactly as written.

The plan flagged the AGENTS.md `Codex` content bug as scoped to L168 (`for Codex model calls`); only that env-block instance was in scope and was fixed via the env-block rewrite. Other pre-existing `Codex` strings elsewhere in AGENTS.md (e.g. provider lines, `generate-Codex-profile`, `.Codex/skills/`) are OUT OF SCOPE for this NFR-03 env-reconcile plan (not in any acceptance criterion) and were intentionally left untouched — logged here as an observation, not a fix.

## Issues Encountered
- First pass of the README §Deployment rewrite phrased the removed footgun as "swapping `supabase/config.toml`", which tripped the `swap.*config\.toml` acceptance grep (returned 1). Reworded to "copying or overwriting the `supabase/config.toml` project id" — grep back to 0. Resolved before the Task 1 commit.

## Verification Results
- `rg -c "config\.toml.*swap|swap.*config\.toml" README.md` == 0
- `rg -c "^> > > > > > >"` / hash-sentinel == 0 in README.md, CLAUDE.md, AGENTS.md
- `rg -c "RAPIDAPI_KEY" README.md CLAUDE.md AGENTS.md TESTING-STRATEGY.md` == 0
- `rg -c "docs/ENVIRONMENT\.md"` >= 1 in README (2), CLAUDE.md (2), AGENTS.md (2), TESTING-STRATEGY.md (1)
- `rg -c "Codex model calls" AGENTS.md` == 0
- `rg -c "cimjltzovkahkqecpwgi" TESTING-STRATEGY.md` == 3; `.env.test.local.example` referenced (1)
- Secret-grep guard (corrected, no `-E`) over all four edited docs: ZERO
- `git diff --stat -- src supabase/functions`: EMPTY (zero functional change)
- CLAUDE.md diff regions: env block + removed marker only; managed sections intact

## User Setup Required
None - documentation-only reconciliation; no external service configuration required.

## Next Phase Readiness
- NFR-03 satisfied — all doc surfaces touched by the env/config/structure changes are reconciled to the canonical `docs/ENVIRONMENT.md`.
- Phase 07 (environment-variable-audit-organization) all 4 plans complete (07-01..07-04).
- Post-wave baseline gate (`npm run verify:baseline`) is owned by the orchestrator; this plan made zero src/functions diff so the baseline is unaffected.

## Self-Check: PASSED

- FOUND: README.md, CLAUDE.md, AGENTS.md, TESTING-STRATEGY.md (all modified)
- FOUND: commit 6b783a97 (Task 1)
- FOUND: commit 725254d4 (Task 2)
- Secret-grep ZERO over all four edited docs; src/functions diff EMPTY

---
*Phase: 07-environment-variable-audit-organization*
*Completed: 2026-06-23*

---
phase: 03-cross-domain-inventory-audit
plan: 01
subsystem: infra
tags: [knip, deno-info, audit-tooling, dead-code, dependencies, npm-scripts, cross-platform]

# Dependency graph
requires:
  - phase: 01-testing-strategy-regression-baseline
    provides: v4.0-baseline tag (fa4ccb6) — the zero-functional-change reference this audit proves against
  - phase: 02-repository-hygiene-state-reconciliation
    provides: evidence-doc conventions (02-SECRET-SCAN.md header/verdict/cross-ref shape, 02-WORKTREE-DISPOSITION.md per-item register) reused as the catalog skeletons
provides:
  - "Tuned knip.json (project=src/**, all test/e2e/config globs as entry, ignore shadcn ui/**, never touches supabase/functions/**)"
  - "Cross-platform deno info --json graph-union runner (scripts/audit/deno-reachability.mjs) — 36 reachable / 5 dead _shared candidates"
  - "npm run audit:deadcode / audit:deps / audit scripts (npx-driven, zero new deps) via node orchestrators"
  - "Durable .planning/audit/ catalog dir with INDEX.md (domain->doc map for all 6 Wave-2 docs + how-to-re-run) and KEEP-LIST.md (D-07 5-keep-class gate)"
affects: [03-02-deadcode, 03-03-dependencies, 03-04-env, 03-05-database, 03-06-perf, phase-4-cleanup, phase-6-deps, phase-7-env, phase-8-db, phase-9-perf]

# Tech tracking
tech-stack:
  added: []  # zero new deps (D-01) — knip via npx --yes; deno info / npm built-ins
  patterns:
    - "node-orchestrator npm scripts (run-deadcode.mjs / run-deps.mjs) instead of &&/; chains — survives Windows cmd.exe where ; is not a separator and && aborts on tool issue-exits"
    - "deno info --json graph-union unioned on forward-slash modules[].specifier URLs (never local \\ paths); --no-lock keeps the audit non-destructive"
    - "durable .planning/audit/ catalog with a pre-listed domain->doc INDEX so parallel Wave-2 plans never edit INDEX (no write conflict)"
    - "KEEP-LIST.md as a first-class classification gate every domain catalog cross-references (D-07)"

key-files:
  created:
    - knip.json
    - scripts/audit/deno-reachability.mjs
    - scripts/audit/run-deadcode.mjs
    - scripts/audit/run-deps.mjs
    - .planning/audit/INDEX.md
    - .planning/audit/KEEP-LIST.md
  modified:
    - package.json

key-decisions:
  - "audit:* wired as node orchestrators (run-deadcode.mjs / run-deps.mjs), not &&/; chained strings — npm runs scripts via cmd.exe on Windows where ; is not a separator and && aborts on knip/npm non-zero issue-exits"
  - "deno info invoked with --no-lock to keep the read-only audit from mutating deno.lock on every run (zero-functional-change posture)"
  - "Windows deno launch: prefer deno.exe via execFileSync; fall back to running the .cmd shim through the shell with a repo-relative forward-slash path (Node 22 EINVAL on .cmd + cmd.exe backslash mangling)"
  - "knip.json omits the optional vite/vitest config blocks from the RESEARCH starter — knip auto-detects them and reads the @/* alias from tsconfig.app.json; the threat model only requires supabase/functions never appear"

patterns-established:
  - "Pattern: node-orchestrator npm scripts for multi-pass tools whose non-zero exit is a finding, not an error (cross-shell safe)"
  - "Pattern: deno reachability via deno info --json graph-union, matched on specifier URLs, --no-lock"
  - "Pattern: pre-listed domain->doc INDEX enabling conflict-free parallel Wave-2 catalog writes"
  - "Pattern: KEEP-LIST gate applied after every static pass (a positive keep-signal forces never-safe)"

requirements-completed: [CLEAN-01, DEP-01]

# Metrics
duration: 11min
completed: 2026-06-13
---

# Phase 03 Plan 01: Audit Foundation Summary

**Reusable audit toolchain (tuned knip.json + cross-platform `deno info --json` reachability runner + npx-driven `audit:*` node-orchestrator scripts) and the durable `.planning/audit/` catalog (INDEX domain-map + D-07 KEEP-LIST gate) — committed with zero new dependencies and zero product-code change.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-06-13T23:37:19Z
- **Completed:** 2026-06-13T23:48Z
- **Tasks:** 2
- **Files:** 7 created/modified (6 created, 1 modified)

## Accomplishments

- **Working React dead-code pass:** `knip.json` scoped to `src/**`, all test/e2e/vite/vitest/playwright/html globs as `entry`, `ignore` `src/components/ui/**`, and (critically) NEVER referencing `supabase/functions/**`. `npx --yes knip --reporter json` runs and emits valid JSON with real findings (e.g. `InterviewPrepInput.tsx`, `ProFeatureBlur.tsx`, unused Radix deps, an unlisted `dotenv`).
- **Working Deno reachability union:** `scripts/audit/deno-reachability.mjs` shells `deno info --json` over all 38 edge-function `index.ts` entrypoints, unions `modules[].specifier` matching `/supabase/functions/_shared/`, and reports 36 reachable / 5 dead `_shared` candidates (`errors.ts`, `handler.ts`, `resolve-tier.ts`, two `test-helpers/`). Cross-platform (Windows `.cmd` shim handled) and non-destructive (`--no-lock`).
- **Re-runnable `audit:*` command-set:** `npm run audit:deadcode` (knip + deno reachability), `npm run audit:deps` (`npm outdated` + `npm audit`), and the `audit` aggregator — all via node orchestrators, zero new `dependencies`/`devDependencies`.
- **Durable catalog scaffold:** `.planning/audit/INDEX.md` (pre-listed domain->doc map for all six Wave-2 docs + how-to-re-run + SQL-pack pointer + KEEP-LIST gate pointer) and `.planning/audit/KEEP-LIST.md` (the D-07 register: 5 keep-classes, each with verified evidence and a "gated-but-live -> NEVER safe" verdict, including the `interview-prep-analyze` keep vs `interview-prep-coach` retired distinction).

## Task Commits

Per the sequential-executor protocol, this plan's two tasks were committed together as one foundation commit (Task 2's `<action>` explicitly commits the whole foundation as ONE specific-path commit):

1. **Task 1 (knip.json + deno-reachability runner + audit:* scripts) + Task 2 (.planning/audit/ INDEX + KEEP-LIST)** - `e851b4b` (feat)

**Plan metadata:** committed separately (docs: complete plan — SUMMARY + STATE).

## Files Created/Modified

- `knip.json` - tuned knip config; `project`=`src/**`, test/e2e/config globs as `entry`, `ignore` shadcn ui; never `supabase/functions/**`.
- `scripts/audit/deno-reachability.mjs` - `deno info --json` graph-union runner; matches on `specifier` URLs; `--no-lock`; Windows-safe deno launcher.
- `scripts/audit/run-deadcode.mjs` - node orchestrator running knip then the Deno pass (continues past knip's issue-exit).
- `scripts/audit/run-deps.mjs` - node orchestrator running `npm outdated --json` then `npm audit --json`.
- `package.json` - added `audit:deadcode`, `audit:deps`, `audit` scripts (scripts block only; zero new deps).
- `.planning/audit/INDEX.md` - catalog entry point: domain->doc map (6 rows), run-date+HEAD SHA, how-to-re-run, KEEP-LIST pointer.
- `.planning/audit/KEEP-LIST.md` - D-07 false-positive register: 5 keep-classes + never-safe gate rule.

## Decisions Made

- **node-orchestrator `audit:*` scripts (not `&&`/`;` chains):** npm runs scripts via `cmd.exe` on Windows (`script-shell` is null), where `;` is not a statement separator and `&&` aborts on the first non-zero exit. Both knip (exits 1 on issues) and `npm outdated`/`npm audit` (exit non-zero by design) would break a chained string. Driving each multi-pass from a small node orchestrator (RESEARCH Pitfall 6's recommendation) makes the audit cross-shell-correct.
- **`deno info --no-lock`:** the audit is read-only; without `--no-lock`, `deno info` reconciled the repo `deno.lock` (added npm-dep entries) on every run — an out-of-scope mutation. `--no-lock` keeps it fully non-destructive.
- **Windows deno launch:** prefer a real `deno.exe` (execFileSync, no shell); fall back to the npm-global `deno.cmd` shim run through the shell with a repo-relative forward-slash path. This sidesteps both Node 22's `EINVAL`-on-`.cmd` (post-CVE-2024-27980) and `cmd.exe` backslash mangling of absolute Windows paths.
- **knip.json without explicit `vite`/`vitest` blocks:** knip auto-detects the plugins and reads the `@/*` alias from `tsconfig.app.json`; the plan's required keys are `$schema`/`entry`/`project`/`ignore`, and the threat model only mandates that `supabase/functions` never appear.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cross-platform deno launcher (ENOENT -> EINVAL -> path mangling)**
- **Found during:** Task 1 (deno-reachability runner verification)
- **Issue:** `execFileSync('deno', ...)` failed with `ENOENT` (deno is an npm-global `.cmd` shim, not a bare exe on PATH for node child_process), then `EINVAL` (Node 22 refuses to execFileSync a `.cmd` without a shell), then 0-reachable (an absolute Windows path under `shell:true` had its backslashes mangled by `cmd.exe`).
- **Fix:** Added a `resolveDeno()` PATH probe (prefers `deno.exe`, falls back to the `.cmd` shim via shell) and normalized the entrypoint to a repo-relative forward-slash path before invoking. Result: 36 reachable / 5 dead candidates, correct.
- **Files modified:** scripts/audit/deno-reachability.mjs
- **Verification:** `node scripts/audit/deno-reachability.mjs` prints reachable count + candidates, exit 0; a standalone probe confirmed the specifier shape (23 modules / 5 shared on keep-warm).
- **Committed in:** e851b4b

**2. [Rule 1 - Bug] `audit:*` npm scripts mis-parsed under Windows cmd.exe**
- **Found during:** Task 1 (`npm run audit:deadcode` end-to-end verification)
- **Issue:** The plan's `"npx --yes knip --reporter json; node scripts/audit/deno-reachability.mjs"` made knip receive `node` as a positional argument (knip errored "This command does not take positional arguments") because `cmd.exe` does not treat `;` as a separator. The `audit:deps` `;` chain had the same defect.
- **Fix:** Introduced two node orchestrators (`run-deadcode.mjs`, `run-deps.mjs`) and pointed `audit:deadcode`/`audit:deps` at them. Same passes (npx knip + deno reachability; npm outdated + npm audit), same continue-past-issue-exit behavior, but cross-shell-correct. These two files are deviations beyond the plan's declared `files_modified`.
- **Files modified:** scripts/audit/run-deadcode.mjs (new), scripts/audit/run-deps.mjs (new), package.json
- **Verification:** `npm run audit:deadcode` and `npm run audit:deps` both run both passes end-to-end and exit 0; `git diff package.json` adds only scripts-block lines (zero new deps).
- **Committed in:** e851b4b

**3. [Rule 3 - Blocking] Reverted unintended `deno.lock` mutation**
- **Found during:** Task 1 (post-run working-tree check)
- **Issue:** Running `deno info` (pre-`--no-lock`) added two npm-dep entries to the repo root `deno.lock` — an out-of-scope, non-zero-functional-change side effect.
- **Fix:** `git checkout -- deno.lock` to restore baseline, then added `--no-lock` to the runner so future runs never mutate it.
- **Files modified:** scripts/audit/deno-reachability.mjs (added `--no-lock`); deno.lock restored to baseline (not committed).
- **Verification:** re-run leaves `deno.lock` byte-identical (`git diff --quiet deno.lock`).
- **Committed in:** e851b4b (the `--no-lock` change); deno.lock itself unchanged in the repo.

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug) — all in the new audit tooling I authored this plan; none touch `src/` or `supabase/functions/`.
**Impact on plan:** All three were necessary to make the plan's own acceptance criteria pass on this Windows environment (`npm run audit:deadcode` end-to-end, runner produces a real reachable count, non-destructive). The two extra orchestrator scripts are additive tooling, not scope creep. Zero functional change preserved: `git diff --stat fa4ccb6..HEAD -- src supabase/functions` is empty.

## Issues Encountered

- The hardest part (as RESEARCH predicted) was cross-platform Deno launch + npm-script chaining on Windows/PowerShell, resolved via the three deviations above. knip and `deno info` themselves worked exactly as researched.

## User Setup Required

None - no external service configuration required. The DB introspection leg (operator-gated, read-only) is delivered by a later Wave-2 plan (03-05), not this foundation.

## Next Phase Readiness

- Wave-2 domain catalogs (03-02 DEAD-CODE, 03-03 DEPENDENCIES, 03-04 ENV-INVENTORY, 03-05 DATABASE, 03-06 PERF-HOTSPOTS) can now run a working knip pass, a working Deno reachability union, and apply the pre-built KEEP-LIST gate. Each writes ONLY its own file (INDEX rows are pre-listed) — safe to parallelize.
- knip already surfaces concrete CLEAN-01 seeds (InterviewPrepInput, ProFeatureBlur, unused Radix deps, unlisted dotenv); the Deno pass surfaces 5 `_shared` dead candidates — all to be classified by 03-02 against the KEEP-LIST gate (none are verdicts yet).
- No blockers.

## Self-Check: PASSED

- All 6 foundation files + SUMMARY.md exist on disk (verified).
- Foundation commit `e851b4b` exists in git log (verified).
- `package.json` contains `audit:deadcode` + `audit:deps` scripts (verified).
- `git diff --stat fa4ccb6..HEAD -- src supabase/functions` empty (zero functional change, verified).
- `deno.lock` / `package-lock.json` byte-identical to baseline (no new deps, verified).

---
*Phase: 03-cross-domain-inventory-audit*
*Completed: 2026-06-13*

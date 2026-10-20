---
phase: 05-deep-test-coverage-expansion
plan: 07
subsystem: testing
tags: [deploy-gate, verify:baseline, powershell, deploy.ps1, supabase-link, branch-protection, command-reference, TEST-08, D-06, D-07, NFR-03, manual-verification, checkpoint]

# Dependency graph
requires:
  - phase: 01-testing-strategy-regression-baseline
    provides: "verify:baseline gate (vitest+offline-deno+Playwright); v4.0-baseline tag; TESTING-STRATEGY.md (TEST-01) with the 8 checkpoints, quarantine register, tier-config reconciliation record, and the branch-protection Required-status-check steps (01-05 left the enablement owed)"
  - phase: 05-deep-test-coverage-expansion (plans 01-06)
    provides: "grown offline deno allowlist (284->698 passed); 05-SUSPECTED-BEHAVIOR.md D-08 register (SB-05-01/02/04/05); off-gate per-feature promptfoo suites + test:adversarial:{resume,career,linkedin,recruiting} scripts; re-proven negative invariant (no promptfoo on verify:baseline/regression-gate.yml)"
provides:
  - "scripts/deploy.ps1 verify:baseline HARD precondition (D-06): runs `npm run verify:baseline` AFTER `Set-Location $repoRoot` and BEFORE `supabase link --project-ref $ref`, aborting the deploy (`$LASTEXITCODE -ne 0` -> Write-Error + exit 1) on a red suite — no project linked, no function deployed"
  - "Explicit `-SkipVerify` switch (default OFF, emergency-only, documented) — the single bypass; never default-on"
  - "Both shims (deploy-staging.ps1 / deploy-production.ps1) inherit the gate automatically (they forward to deploy.ps1 under $ErrorActionPreference='Stop'); shims byte-identical vs v4.0-baseline (zero duplication, zero drift)"
  - "TESTING-STRATEGY.md updated (D-07 / NFR-03): grown deno allowlist count, off-gate per-feature promptfoo suites (clearly marked OFF the gate), a dedicated deploy-gate (D-06) section, the 05-01..05 reconciliations + allowlist-growth ledger, the full SB-05-01/02/04/05 register summary + pointer, and the branch-protection steps + 01-05 owed-item confirmation note"
affects: [06-dependency-hygiene, 08-database-cleanup, 09-performance-refactoring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deploy-gate precondition (D-06): the regression baseline gets real teeth by running `npm run verify:baseline` inside the deploy script BEFORE any `supabase link`/`functions deploy` — a red suite cannot ship. Placed strictly between Set-Location and supabase link so the env->ref mapping and the link/auth path are untouched; the `$LASTEXITCODE -ne 0 -> exit 1` is explicit (PowerShell does not auto-fail npm non-zero under $ErrorActionPreference)."
    - "Single-target gate via shim inheritance: deploy-staging.ps1/deploy-production.ps1 are 12-line forwarders to deploy.ps1 under $ErrorActionPreference='Stop', so the gate lives in ONE place — editing the shims would duplicate (drift) or bypass (real-path) the gate. files_modified lists ONLY deploy.ps1 for this reason (reconciles CONTEXT D-06's shim-named phrasing to the actual shared target)."
    - "Explicit, documented escape hatch (never default-on): -SkipVerify is the only bypass, off by default, documented in the usage block + header + TESTING-STRATEGY.md as emergency-hotfix-only — keeps the gate fail-closed."
    - "Manual-only verification surfaced as a checkpoint, not fabricated: the deploy-abort (runs on the operator's local Windows host) and the GitHub branch-protection required-check (a repo setting not assertable from the codebase) are per VALIDATION.md MANUAL-ONLY — returned as a structured human-verify checkpoint rather than self-asserted."

key-files:
  created:
    - ".planning/phases/05-deep-test-coverage-expansion/05-07-SUMMARY.md"
  modified:
    - "scripts/deploy.ps1"
    - "TESTING-STRATEGY.md"

key-decisions:
  - "TARGET DISAMBIGUATION (D-06): the ONE insertion point is scripts/deploy.ps1, NOT the two shims. CONTEXT D-06 names deploy-staging.ps1/deploy-production.ps1 as gating targets, but those are 12-line forwarders to the shared deploy.ps1. Gating deploy.ps1 gates both; editing the shims would duplicate or bypass the gate. git diff v4.0-baseline -- scripts/deploy-staging.ps1 scripts/deploy-production.ps1 = EMPTY."
  - "Gate placement is exact: `npm run verify:baseline` at deploy.ps1 line 94 (gate block lines 85-100), AFTER `Set-Location $repoRoot` (line 83), BEFORE `supabase link --project-ref $ref` (line 104). The env->ref `switch` (production->zjpjapgraoxdukdvpjes / staging|test->cimjltzovkahkqecpwgi) and the `supabase link` line are byte-identical vs v4.0-baseline — the deploy auth path (T-05-14) is not weakened."
  - "Added an explicit `-SkipVerify` [switch] param (default OFF) documented in the usage block, the file header, and TESTING-STRATEGY.md as an emergency-hotfix-only bypass. It is never default-on and never used in routine deploys, so the gate stays fail-closed."
  - "No real secrets/refs/tokens added to TESTING-STRATEGY.md (T-05-15): the doc references env-var names and dashboard locations only. The two project refs already present in the doc (cimjltzovkahkqecpwgi as the TEST project) were not added by this plan."
  - "Task 2 is MANUAL-ONLY and was NOT self-verified: the deploy-gate-abort (operator reddens a test, runs scripts/deploy.ps1 -Env staging, confirms abort before supabase link, restores, confirms proceed) and the GitHub branch-protection required-status-check on main/staging (the 01-05 owed item) are both per VALIDATION.md operator steps. Returned as a structured human-verify checkpoint; results NOT fabricated."

requirements-completed: [TEST-08]

# Metrics
duration: 6min
completed: 2026-06-19
---

# Phase 05 Plan 07: Deploy-Gate Wiring + Command-Set / Branch-Protection Documentation Summary

**Gave the regression baseline real teeth (TEST-08 / D-06) by inserting a `verify:baseline` HARD precondition into `scripts/deploy.ps1` — placed strictly between `Set-Location $repoRoot` and `supabase link` so a red suite aborts the deploy (`$LASTEXITCODE -ne 0 -> Write-Error + exit 1`) before any project is linked or any function deployed, with both backward-compat shims inheriting the gate automatically (untouched) and the deploy auth path byte-identical. Updated `TESTING-STRATEGY.md` (D-07 / NFR-03) to document the grown command set (the single `verify:baseline` gate + the off-gate per-feature promptfoo suites, clearly marked off-gate), the 05-01..05 reconciliations + allowlist-growth ledger, the full SB-05-01/02/04/05 register summary, and the deploy-gate + branch-protection enablement steps. The two MANUAL-ONLY verifications (deploy-abort + GitHub branch-protection) are surfaced as a blocking operator checkpoint — NOT fabricated.**

## Performance

- **Duration:** ~6 min (autonomous Task 1; Task 2 paused for the operator)
- **Tasks:** 1 of 2 complete autonomously; Task 2 is a blocking manual-only checkpoint
- **Files modified:** 2 (`scripts/deploy.ps1`, `TESTING-STRATEGY.md`) + 1 created (this SUMMARY)

## Accomplishments

### Task 1 — verify:baseline deploy-gate precondition + TESTING-STRATEGY.md update (COMPLETE, committed `c7b6d12b`)

**`scripts/deploy.ps1` — the deploy gate (D-06):**

- Inserted the gate block at **lines 85-100**, strictly between `Set-Location $repoRoot` (line 83) and `supabase link --project-ref $ref` (line 104):
  ```powershell
  if ($SkipVerify) {
    Write-Host "WARNING: -SkipVerify set — bypassing the verify:baseline deploy gate. Emergency use only." -ForegroundColor Yellow
  } else {
    Write-Host "Running verify:baseline (vitest + offline-deno + Playwright) as a deploy precondition..."
    npm run verify:baseline
    if ($LASTEXITCODE -ne 0) {
      Write-Error "verify:baseline FAILED — aborting deploy (no functions linked or deployed)."
      exit 1
    }
    Write-Host "verify:baseline GREEN — proceeding to link + deploy."
  }
  ```
- Added an explicit `[switch]$SkipVerify` param (default OFF) + documented it in the usage block and the file header as an **emergency-hotfix-only** bypass.
- The env->ref `switch` (`production -> zjpjapgraoxdukdvpjes`, `staging`/`test -> cimjltzovkahkqecpwgi`) and the `supabase link --project-ref $ref` line are **byte-identical** vs `v4.0-baseline` — the deploy auth path (T-05-14) is not weakened.
- Neither shim was modified: `git diff v4.0-baseline -- scripts/deploy-staging.ps1 scripts/deploy-production.ps1` is **EMPTY**. They forward to `deploy.ps1` under `$ErrorActionPreference = "Stop"`, so they inherit the gate.

**`TESTING-STRATEGY.md` — the doc reconciliation (D-07 / NFR-03):**

1. **Grown command set** — the deno layer row + the quick-command table now reflect the offline allowlist grown from the 34-file Phase-01 set to `698 passed | 0 failed | 11 ignored` (05-05 close); the table adds the four off-gate per-feature scripts (`test:adversarial:{resume,career,linkedin,recruiting}`) and a `scripts/deploy.ps1` deploy-gate row.
2. **Off-gate promptfoo, clearly marked** — the adversarial layer row + the "promptfoo is OFF the gate" section now cover all five real-AI suites (interview-prep + the four 05-06 ingesters), with an explicit "do not conflate with the on-gate deterministic `_shared/prompt-sanitizer.test.ts` corpus" guard and a restated negative invariant (no `promptfoo`/`test:adversarial*` in `verify:baseline`/`test:edge`/`test:e2e`/`regression-gate.yml`).
3. **Deploy-gate (D-06) section** — new "Where the gate is wired (TEST-08)" subsection documenting the two enforcement points (CI/PR gate + deploy gate), the exact placement before `supabase link`, the shim inheritance, the local Node+Deno+Playwright prerequisite, and the `-SkipVerify` escape hatch. Checkpoint #7 updated to mention the deploy abort.
4. **Reconciliations + register** — the Phase-05 reconciliation section gains an allowlist-growth ledger (284 -> 566 -> 587 -> 638 -> 673 -> 698) and a full SB-05-01/02/04/05 register summary (all `minor -> log`, none escalated) alongside the existing pointer to `05-SUSPECTED-BEHAVIOR.md`.
5. **Branch-protection** — the existing steps now cross-reference the deploy gate, mark the required-status-check as a MANUAL-ONLY operator step, and note it is the open item carried from Phase 1 (01-05) being (re)confirmed here.

**Gate result (verify:baseline, the canonical command):** GREEN end-to-end — vitest `457 passed`, deno `698 passed | 0 failed | 11 ignored`, Playwright `5 passed + 1 quarantine-skip`. No product `index.ts`/`src`/`functions` change vs HEAD.

### Task 2 — Operator deploy-gate-abort + branch-protection (BLOCKING CHECKPOINT, manual-only — NOT executed)

Per the plan (`type="checkpoint:human-verify"`) and VALIDATION.md, these two verifications are MANUAL-ONLY and cannot be self-verified by an executor:

1. **Deploy-gate ABORT (operator, local Windows host):** temporarily redden one offline deno test, run `scripts/deploy.ps1 -Env staging`, confirm it prints the `verify:baseline` failure and exits NON-ZERO **before** any `supabase link`/`functions deploy` line (no deploy occurs); restore the test, re-run, confirm `verify:baseline` passes and the deploy proceeds to `supabase link`. (Requires Node + Deno + Playwright present locally.)
2. **GitHub branch-protection (operator, GitHub Settings):** in repo Settings -> Branches, confirm the `verify:baseline` gate job (the `gate` job from `regression-gate.yml`) is a **Required status check** on PRs to **both `main` and `staging`** — the Phase-1 01-05 owed item.

These are surfaced as the structured checkpoint below; results are **not fabricated**.

## Deviations from Plan

None for the autonomous work — Task 1 executed exactly as written (the D-06 PATTERNS analog block + the byte-identical env-ref/link path + the untouched shims + the TESTING-STRATEGY.md sections). The `-SkipVerify` switch is the optional, plan-sanctioned addition (default off, documented). No Rule 1-4 deviations were needed. Task 2 is a planned blocking checkpoint, not a deviation.

## Verification (autonomous portion)

- `grep "verify:baseline" scripts/deploy.ps1` -> precondition present at lines 85-100; `npm run verify:baseline` at line 94 with the `$LASTEXITCODE -ne 0 -> exit 1` abort.
- `grep "supabase link" scripts/deploy.ps1` -> still present (line 104), env->ref `switch` byte-identical vs `v4.0-baseline`.
- `git diff v4.0-baseline -- scripts/deploy-staging.ps1 scripts/deploy-production.ps1` -> **EMPTY** (shims untouched).
- `grep -i "verify:baseline | test:adversarial | branch protection | reconcil" TESTING-STRATEGY.md` -> all match.
- `npm run verify:baseline` -> GREEN (vitest 457, deno 698/0/11, Playwright 5+1skip).
- `git diff --name-only HEAD -- src supabase/functions '*index.ts'` (before commit) -> EMPTY (no product source change; this plan touched only `deploy.ps1` + `TESTING-STRATEGY.md`).

## Task Commits

1. **Task 1: wire verify:baseline deploy-gate into deploy.ps1 + document grown command set (D-06/TEST-08)** — `c7b6d12b` (feat)

## Manual-Only Verification (Task 2) — pending operator

| Verification | Where | Expected result | Status |
| ------------ | ----- | --------------- | ------ |
| Deploy-gate ABORT on red suite | operator local Windows host (`scripts/deploy.ps1 -Env staging`) | non-zero exit + verify:baseline failure printed BEFORE `supabase link`; restore -> proceeds | **PENDING (not fabricated)** |
| GitHub branch-protection required-status-check | GitHub Settings -> Branches (`main` + `staging`) | the `gate` job from regression-gate.yml is a Required status check on both | **PENDING (01-05 owed item)** |

## Next Phase Readiness

- The deploy gate now has real teeth: a red `verify:baseline` aborts `scripts/deploy.ps1` before `supabase link` (D-06), and both shims inherit it. The command set, off-gate promptfoo, reconciliations, register, and branch-protection steps are documented (TEST-08 / D-07 / NFR-03). Zero functional change; deploy auth path preserved.
- **Blocker to phase close:** the two MANUAL-ONLY operator verifications (deploy-abort + branch-protection) must be confirmed before TEST-08 is fully closed. Surfaced as the blocking checkpoint below.

## Self-Check: PASSED

- `scripts/deploy.ps1` present with the gate block (lines 85-100) and `npm run verify:baseline` at line 94; verified.
- `TESTING-STRATEGY.md` present with the deploy-gate section, grown command table, off-gate promptfoo coverage, reconciliation ledger, SB register summary, and branch-protection note; verified.
- Task 1 commit `c7b6d12b` verified in git history.
- Shims byte-identical vs `v4.0-baseline` (empty diff); env-ref/link path byte-identical.
- `verify:baseline` GREEN (vitest 457, deno 698/0/11, Playwright 5+1skip).
- No product source change (this plan: `deploy.ps1` + `TESTING-STRATEGY.md` only).
- Task 2 (manual-only) NOT fabricated — surfaced as a blocking checkpoint for the operator.

---
*Phase: 05-deep-test-coverage-expansion*
*Completed (autonomous portion): 2026-06-19 — Task 2 manual verification pending operator*

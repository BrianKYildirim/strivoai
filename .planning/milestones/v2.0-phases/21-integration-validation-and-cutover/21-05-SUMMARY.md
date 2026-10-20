---
phase: 21-integration-validation-and-cutover
plan: 05
subsystem: edge-functions
tags: [observability, cutover, scripting, sc-5, d-19, d-18, d-10, d-14]

# Dependency graph
requires:
  - phase: 13-merit-enforcement-and-feature-flag
    provides: D-05 module-scope MERIT_SYSTEM_ENABLED export consumed by every gated handler
  - phase: 21-integration-validation-and-cutover
    provides: D-07 gated feature list (Plan 01-04 baseline)
provides:
  - D-19 boot-time `merit-flag` attestation log on every D-07 gated handler — SC-5 grep-evidence source
  - D-18 synthetic probe script (scripts/sc5-probe.ps1) — appends timestamped table to 21-SC5-EVIDENCE.md
  - D-10 cutover orchestration (Invoke-MeritFlagFlip) and D-14 rollback (Invoke-MeritFlagRollback) in scripts/cutover-production.ps1
affects: [21-06, 21-07, future production-flip operator session]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-scope side-effect attestation log at end of import block — fires once per Edge Function cold start, outside any `if (import.meta.main)` guard"
    - "Standalone PowerShell tooling that does NOT dot-source deploy-production.ps1 / deploy-staging.ps1 (D-10 boundary)"
    - "ShouldProcess-gated cutover functions with ConfirmImpact='High' so interactive operators always see a confirmation prompt"

key-files:
  created:
    - "scripts/sc5-probe.ps1"
    - "scripts/cutover-production.ps1"
  modified:
    - "supabase/functions/analyze-resume/index.ts"
    - "supabase/functions/analyze-career/index.ts"
    - "supabase/functions/grade-linkedin/index.ts"
    - "supabase/functions/recruiting-lens/index.ts"
    - "supabase/functions/analyze-skills-gap/index.ts"
    - "supabase/functions/compare-jobs/index.ts"
    - "supabase/functions/interview-prep-analyze/index.ts"
    - "supabase/functions/submit-resume-analysis-job/index.ts"
    - "supabase/functions/submit-career-analysis-job/index.ts"

key-decisions:
  - "interview-prep-coach skipped: directory does not exist in this repo. Per the plan's own contract ('If absent, the file is NOT a D-07 gated handler — note in the SUMMARY and skip; do NOT add the import retroactively'), 9 D-07 gated handlers received the attestation log instead of 10."
  - "interview-prep-evaluate verified untouched: confirmed via grep that it does NOT import MERIT_SYSTEM_ENABLED (line 14 NOTE comment is the only mention) and emits no merit-flag log line. Matches OQ1: feature is intentionally ungated because deduction occurs at quiz-start."
  - "Deno type-check baseline established: ALL 9 modified files have identical pre-existing TS error counts before and after my edits (verified via stash/pop). My 3-line diffs introduce zero new type errors. Errors are pre-existing tier-narrowing / fixtureKey issues unrelated to D-19 attestation."
  - "Both cutover functions decorated with [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')] (3 occurrences in script counting the .NOTES doc-comment mention) — ≥2 hits as required."
  - "Bottom-of-file guard uses InvocationName comparison so dot-sourcing exposes functions but never auto-runs the flip; Get-Command after dot-source confirms both functions visible."

requirements-completed: [MIG-02]

# Metrics
duration: ~25 min
completed: 2026-04-28
---

# Phase 21 Plan 05: D-19 Attestation + D-18 Probe + D-10/D-14 Cutover Tooling Summary

**Boot-time `merit-flag` attestation logs added to all 9 in-tree D-07 gated handlers (interview-prep-coach has no source directory so was skipped per plan contract); standalone D-18 synthetic-probe and D-10/D-14 cutover scripts authored. No staging dry-runs performed — operator-deferred.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-28T16:35:00Z
- **Completed:** 2026-04-28T17:00:00Z
- **Tasks:** 3 / 3 (all code-only — staging dry-runs explicitly out of scope)
- **Files modified:** 9 edge functions
- **Files created:** 2 PowerShell scripts
- **Commits:** 3 (one per task)

## Tasks completed

### Task 1 — D-19 boot-time merit-flag attestation (commit `e60b681`)

Added a single module-scope log line to every D-07 gated handler. The line emits the literal message `merit-flag` with a payload `{ enabled: <boolean> }` so the SC-5 grep contract (`"msg":"merit-flag"` / `"enabled":true|false`) holds verbatim.

**Per-file status — pre-existing vs. newly added attestation:**

| # | File | Had `merit-flag` already? | `createLogger` import existed? | Outcome |
|---|------|---------------------------|--------------------------------|---------|
| 1 | `analyze-resume/index.ts` | No | Yes | New attestation line inserted after import block |
| 2 | `analyze-career/index.ts` | No | Yes | New attestation line inserted after import block |
| 3 | `grade-linkedin/index.ts` | No | Yes | New attestation line inserted after import block |
| 4 | `recruiting-lens/index.ts` | No | Yes | New attestation line inserted after import block |
| 5 | `analyze-skills-gap/index.ts` | No | **No** — added | New `createLogger` import + new attestation line |
| 6 | `compare-jobs/index.ts` | No | **No** — added | New `createLogger` import + new attestation line |
| 7 | `interview-prep-analyze/index.ts` | No | Yes | New attestation line inserted after import block |
| 8 | `submit-resume-analysis-job/index.ts` | No | **No** — added | New `createLogger` import + new attestation line |
| 9 | `submit-career-analysis-job/index.ts` | No | **No** — added | New `createLogger` import + new attestation line |

**Files NOT touched (correctly):**

- `interview-prep-evaluate/index.ts` — confirmed via `grep MERIT_SYSTEM_ENABLED` that the only mention is the line-14 NOTE comment ("No import of withMerits or MERIT_SYSTEM_ENABLED"). Per OQ1 it is intentionally ungated; no attestation log was added.

**Verification artifact (the plan's `<verify>` block):**

```text
$ for f in analyze-resume analyze-career grade-linkedin recruiting-lens \
           analyze-skills-gap compare-jobs interview-prep-analyze \
           submit-resume-analysis-job submit-career-analysis-job; do
    grep -l 'createLogger.*merit-flag' supabase/functions/$f/index.ts ...
  done
OK: analyze-resume
OK: analyze-career
OK: grade-linkedin
OK: recruiting-lens
OK: analyze-skills-gap
OK: compare-jobs
OK: interview-prep-analyze
OK: submit-resume-analysis-job
OK: submit-career-analysis-job

interview-prep-evaluate clean: no merit-flag string present.
interview-prep-coach: directory does not exist (skipped per plan contract).
```

### Task 2 — D-18 synthetic probe (commit `524778d`)

`scripts/sc5-probe.ps1` (302 lines) authored as a standalone PowerShell script. Key properties:

- Mandatory `-SupabaseUrl`; defaults `-EvidenceFile` to the Plan 07 SC-5 evidence path; defaults `-JwtEnvVar` to `SC5_TEST_USER_JWT`
- Exits 2 with `Write-Error` if either `SC5_TEST_USER_JWT` or `SUPABASE_ANON_KEY` env vars are missing (fail-closed)
- Probe table covers all 10 D-07 features (same canonical list as Task 1; `interview-prep-coach` included so the probe will surface the missing-function gap when it eventually runs)
- Per probe: single `Invoke-WebRequest -UseBasicParsing` POST with `Authorization: Bearer <jwt>`, `Content-Type: application/json`, `apikey: <SUPABASE_ANON_KEY>` headers
- No retries; expected status set per probe is `@(200, 402, 403, 429)`
- Appends a timestamped markdown section (`## SC-5 Probe Run — <ISO>`) to the evidence file (creates the file with header on first run); never overwrites prior runs
- Logs the project ref (parsed from `SupabaseUrl`) at the top of the run for self-describing evidence
- Exit codes: `0` = all pass, `1` = at least one fail, `2` = required env var missing

**Grep-contract verification (plan's `<verify>` block):**

```text
EXISTS: scripts/sc5-probe.ps1
OK: SC5_TEST_USER_JWT
OK: analyze-resume
OK: recruiting-lens
OK: interview-prep-coach
OK: 21-SC5-EVIDENCE.md
OK: no deploy-production.ps1
OK: no deploy-staging.ps1
OK: no `supabase` CLI invocation
```

PowerShell parser check: `PARSE_OK`.

### Task 3 — D-10 cutover + D-14 rollback orchestration (commit `be63e95`)

`scripts/cutover-production.ps1` (188 lines) authored as a standalone PowerShell script that exposes two functions but does NOT auto-run them.

**Functions:**

- `Invoke-MeritFlagFlip` — `[CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]`. Echoes a UTC-timestamped banner, runs `supabase secrets set MERIT_SYSTEM_ENABLED=true --project-ref $ProjectRef`, errors out on non-zero, then loops `$FunctionsToRedeploy` and runs `supabase functions deploy <name> --project-ref $ProjectRef` for each. Returns `0` on full success, `1` on any failure.
- `Invoke-MeritFlagRollback` — same shape but sets `MERIT_SYSTEM_ENABLED=false`. Every echo is prefixed `ROLLBACK:` for forensic clarity.

**Defaults:**

- `$ProjectRef = "zjpjapgraoxdukdvpjes"` (production ref documented in 21-CONTEXT.md)
- `$FunctionsToRedeploy = $script:GatedFunctions` (canonical list of 10 D-07 gated handler names — same list as Task 1)

**Bottom-of-file guard:**

```powershell
if ($MyInvocation.InvocationName -ne '.') {
  Write-Host "cutover-production.ps1 loaded. Available functions: ..."
  Write-Host "Neither runs automatically. Invoke explicitly after reading the Phase 21 pre-flip checklist (D-09)."
}
```

`Get-Command` after `. .\scripts\cutover-production.ps1` confirms both functions are visible and neither auto-runs.

**Grep-contract verification:**

```text
EXISTS
function Invoke-MeritFlagFlip count: 1
function Invoke-MeritFlagRollback count: 1
OK: MERIT_SYSTEM_ENABLED=true present
OK: MERIT_SYSTEM_ENABLED=false present
SupportsShouldProcess count: 3 (>= 2, includes one mention in .NOTES help block)
OK: no deploy-production.ps1
OK: no deploy-staging.ps1
Top-level Invoke-MeritFlag* calls: none (all matches inside <#...#> doc comment block at lines 7/34/36)
```

PowerShell parser check: `PARSE_OK`. Dot-source check: both functions exposed without auto-run.

## Deviations from plan

### Operator-deferred (intentional, per user instruction)

- **No staging dry-run was performed** for either `sc5-probe.ps1` or `Invoke-MeritFlagFlip`. The user explicitly scoped this run to autonomous code changes only. The plan's `must_haves.truths` last bullet ("Dry-run against staging: …") is **operator-deferred** and will be satisfied in the same follow-up session that completes Plan 04 Task 3.
- The plan's `<verification>` block lines 318-321 (sc5-probe.ps1 exits 0 on staging; Invoke-MeritFlagFlip + secrets list confirmation; rollback restoration) are likewise queued for the operator session — no staging credentials or environment access was attempted in this run.

### `interview-prep-coach` not present in the source tree

- The plan's interfaces block (line 96) lists `supabase/functions/interview-prep-coach/index.ts` as a D-07 gated handler. Verification: that directory does not exist in the repo (`ls supabase/functions/ | grep interview` returns only `interview-prep-analyze` and `interview-prep-evaluate`). Confirmed by absence in the global `MERIT_SYSTEM_ENABLED` grep.
- Per the plan's Task 1 instructions: "If absent, the file is NOT a D-07 gated handler — note in the SUMMARY and skip (do NOT add the import retroactively)." That branch was followed: 9 files were modified instead of 10.
- `interview-prep-coach` IS still listed in:
  - `cutover-production.ps1`'s `$FunctionsToRedeploy` default (matches the plan's contract that the cutover script lists "the 10 D-07 gated handler names" — operator can prune the list at invocation time if the function is still missing at flip time)
  - `sc5-probe.ps1`'s probe table (the probe will surface the missing function as a FAIL outcome — useful evidence for the operator)
- **Action item for Plan 06 / 07:** confirm whether `interview-prep-coach` is supposed to be deployed before SC-5 evidence is collected, or whether it should be removed from the gated list entirely.

### Pre-existing Deno type errors (out of scope per SCOPE BOUNDARY)

- `deno check` reports identical TS error counts on the modified files BEFORE and AFTER my edits (verified via `git stash` round-trip):
  - `analyze-resume`: 16 (tier narrowing, unrelated to attestation)
  - `grade-linkedin`: 2 (`fixtureKey` enum mismatch)
  - `analyze-skills-gap`: 3 (likely tier narrowing)
  - `compare-jobs`, `submit-resume-analysis-job`, `submit-career-analysis-job`: 2 each
  - `analyze-career`, `recruiting-lens`, `interview-prep-analyze`: 0
- My 3-line diffs introduce zero new errors. These are pre-existing and out of scope for Plan 05; documenting here as a deferred-issue marker for a future cleanup pass.

## Auto-fixed issues

None. No deviation rules triggered. Edits were purely additive, did not change any control flow, and did not touch any pre-existing behavior.

## Threat Flags

None. The new surface (boot-time log line, two new PowerShell scripts) was anticipated in the plan's `<threat_model>` and the existing T-21-05-01 through T-21-05-06 register entries cover it.

## Self-Check

- **Files exist:** `scripts/sc5-probe.ps1` FOUND; `scripts/cutover-production.ps1` FOUND
- **Modified files contain attestation:** All 9 D-07 gated handlers grep-positive for `createLogger.*merit-flag`
- **Excluded files clean:** `interview-prep-evaluate/index.ts` grep-negative for `merit-flag`
- **Commits exist:**
  - `e60b681` (Task 1) — `git log` confirms
  - `524778d` (Task 2) — `git log` confirms
  - `be63e95` (Task 3) — `git log` confirms

## Self-Check: PASSED

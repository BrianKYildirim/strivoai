---
phase: 09-final-verification-milestone-report
plan: 03
subsystem: production-activation-preconditions
tags: [production, cron, reaper, d-04, pre-flip-baseline, environment-docs, ver-01, ver-04, operator-applied]

# Dependency graph
requires:
  - phase: 03-shared-analysis-lifecycle-substrate
    provides: the reaper (reap-stale-analysis-runs) + the 13-code analysis-error-taxonomy that IS the D-04 (c) error-class vocabulary
  - phase: 02-security-audit-remediation
    provides: the carried SEC-02-08-CRON operator action (prod cron jobs still pointed at the preview host)
provides:
  - "09-ACTIVATION-PRECONDITIONS.md — verified prod-targeted + succeeding reaper, INTERNAL_JOB_SECRET<->Vault parity, and the D-04 abort/rollback runbook"
  - "09-PREFLIP-BASELINE.md — the one-shot, non-reproducible pre-activation error-class + latency + state-distribution baseline (D-04 c/d)"
  - "docs/ENVIRONMENT.md — the seven ANALYSIS_LIFECYCLE_* / VITE_FEATURE_ANALYSIS_LIFECYCLE flag names + remote-test-lane names the report cites as authority"
  - "SEC-02-08-CRON closed + R-09-03-A closed (jobid 5 reset-subscription-merits-sweep fired successfully for the first time)"
affects: [09-10, 09-11, 09-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Claude-proposes / operator-applies for every production mutation: Claude read-only on prod, the operator ran every cron.alter_job and secret change (T-09-03-B)"
    - "Names-not-values contract preserved in docs/ENVIRONMENT.md and every capture sheet (T-09-03-A/C); zero secret values, aggregates only"
    - "One-shot pre-flip baseline: captured BEFORE the master flag flips, because D-04 criterion (c) is permanently unevaluable once the lifecycle is on"

key-files:
  created:
    - .planning/phases/09-final-verification-milestone-report/09-ACTIVATION-PRECONDITIONS.md
    - .planning/phases/09-final-verification-milestone-report/09-PREFLIP-BASELINE.md
  modified:
    - docs/ENVIRONMENT.md
    - .planning/phases/09-final-verification-milestone-report/09-PREFLIP-BASELINE.md

key-decisions:
  - "The plan's premise was falsified on inspection: the live prod reaper (jobid) was ALREADY prod-targeted and healthy (edge-log 200s, 4.4-5.8s). The drift was in the OTHER carried Phase-2 jobs, not the reaper — recorded rather than 'fixed' a non-problem (commit 80755b92)."
  - "D-03 as originally written ('MERIT_SYSTEM_ENABLED stays false on prod') was ALSO falsified: the ledger shows merits live on prod since 2026-05-21, so MERIT is intentionally ON. The money-path abort criteria are therefore LIVE on every 09-11 flip, not inert — this reframing is carried into 09-11's runbook."
  - "6c (as planned) was impossible and was superseded by 6c-REVISED: jobid 5 now reads the hardcoded prod URL + Vault secret instead of an unset app.functions_base_url GUC. Operator-applied; jobid 5 fired succeeded (first-ever successful run, 05:00 UTC). R-09-03-A CLOSED."
  - "Every production mutation (cron re-point 6a, pg_net timeouts 6b/6d, 6c-REVISED) was applied BY THE OPERATOR. Claude performed read-only inspection only — no prod SQL, no secret values printed."
  - "Pre-flip stuck-row count is 0 but is explicitly NOT counted as evidence: pre-flip the state column is NULL (dormant/legacy), so the naive check is vacuous. The NULL-safe form was handed to 09-11 as the real check."

# Metrics
duration: multi-session (2026-07-11 -> 2026-07-15)
tasks: 3
files: 3
completed: 2026-07-15
---

# Phase 09 Plan 03: Production-Activation Preconditions Summary

**Cleared the three HARD preconditions to the first production flag flip — a verified prod-targeted + succeeding reaper (so D-04's "run stuck past the reaper window" abort has real teeth), a one-shot pre-flip error-class + latency baseline (so D-04's "new error class" / "latency regression" abort criteria are evaluable), and full flag documentation in the authority file the report cites — with every production mutation applied by the operator and Claude strictly read-only on prod.**

## Performance

- **Duration:** multi-session (2026-07-11 → 2026-07-15)
- **Tasks:** 3 (Task 1 checkpoint:human-action, Task 2 auto, Task 3 checkpoint:human-verify)
- **Files:** 3 (2 created, 1 modified — plus baseline sign-off reconciled)

## Task Commits

1. **Task 1 — Verify/fix the prod reaper target (HARD PRECONDITION):**
   - `07359723` prepare the activation-precondition + pre-flip baseline capture sheets
   - `80755b92` record VERIFIED prod inspection — reaper is healthy, plan premise was wrong
   - `1ae4c057` record operator-applied 6a/6b; supersede the impossible 6c
   - `7a08f349` record 6c-REVISED + 6d applied, R-09-03-A closed
2. **Task 2 — Document the seven lifecycle flags + remote-lane env names:** `06cd2f32` (docs/ENVIRONMENT.md — `grep -c ANALYSIS_LIFECYCLE` = 12, `VITE_FEATURE_ANALYSIS_LIFECYCLE` = 2)
3. **Task 3 — One-shot pre-flip production baseline:** captured in `07359723`; operator approval recorded in `09-ACTIVATION-PRECONDITIONS.md` s8 gate (2026-07-15) and reconciled into `09-PREFLIP-BASELINE.md` sign-off at closeout.

## Verification

- `grep -c "ANALYSIS_LIFECYCLE" docs/ENVIRONMENT.md` = 12 (>= 6 required); `VITE_FEATURE_ANALYSIS_LIFECYCLE` = 2 (>= 1 required). ✅
- `09-ACTIVATION-PRECONDITIONS.md` s8 gate: all preconditions checked `[x]` — reaper prod-targeted + succeeding (edge-log 200s), INTERNAL_JOB_SECRET↔Vault parity confirmed by construction, SEC-02-08-CRON closed, baseline approved. ✅
- `09-PREFLIP-BASELINE.md` records capture timestamp/window, per-function status-class + taxonomy histograms, p50/p95 bands, `analysis_jobs` state distribution (57 rows, all `state IS NULL` — the dormant pattern), and stuck-row count 0 (with vacuity stated). ✅
- `npx vitest run src/test/security/phase9-pii-guard.test.ts` exits 0 over the phase dir (18/18) — zero secret values, zero real-user identifiers in any 09-03 artifact. ✅

## Deviations

- **Plan premise falsified (reaper):** the reaper was already prod-targeted and healthy; the drift lived in the two carried Phase-2 cron jobs. Recorded the true state instead of applying an unneeded "fix" to the reaper.
- **D-03 premise falsified (MERIT):** `MERIT_SYSTEM_ENABLED` is intentionally ON on production (merits live since 2026-05-21). Reframed the money-path abort criteria as LIVE for 09-11 rather than inert. This is the single most important correction carried forward.
- **6c impossible → 6c-REVISED:** the planned jobid-5 fix relied on an unset GUC; superseded with a Vault-reading revision. Operator-applied; R-09-03-A closed (jobid 5's first-ever successful run).

## Residual items (carried to VER-05 report item 14)

- **R-09-03-B** — pg_net's 5000ms default timeout < the reaper's execution time makes `net._http_response` a useless health signal; fix proposed (6b), reaper health read from edge logs instead.
- **R-09-03-C** — migration `20260702000003` carries the preview host in its committed body (latent; live prod cron is correct). Repo-hygiene follow-up.
- **R-09-03-D** — real PII recoverable from git history commit `21925c88` (HEAD is clean/synthetic). Operator decision: history purge DEFERRED to a post-phase decision.

## Self-Check: PASSED

- [x] All three tasks executed and their artifacts exist on disk.
- [x] No production mutation performed by Claude — the operator applied every cron/secret change (read-only inspection only).
- [x] Zero secret values written anywhere; phase9 PII guard green over the phase dir.
- [x] The three HARD preconditions to 09-11's first flip are cleared and recorded.

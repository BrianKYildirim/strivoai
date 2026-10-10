---
phase: 02-ai-token-cost-optimization
plan: 01
subsystem: planning-artifact
tags: [prereqs, temp-caps, measurement, merits, tier-resolution]
requires: []
provides:
  - "02-PREREQS.md: LOCKED TEMP diagnostic cap table (input to 02-05)"
  - "02-PREREQS.md: confirmed 6-account run design + 21-run schedule (input to 02-06)"
affects:
  - ".planning/phases/02-ai-token-cost-optimization/02-05-PLAN.md"
  - ".planning/phases/02-ai-token-cost-optimization/02-06-PLAN.md"
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/02-ai-token-cost-optimization/02-PREREQS.md
  modified:
    - .planning/phases/02-ai-token-cost-optimization/deferred-items.md
decisions:
  - "TEMP diagnostic caps approved as-proposed and LOCKED; 02-05 implements verbatim"
  - "Run design is 3 free + 3 admin-panel-upgraded Elite accounts; ADMIN_EMAIL used for zero runs"
  - "Free Merit budget (10 held vs 9 per triad) forces one-run-per-feature-per-free-account"
metrics:
  duration: ~25min
  tasks: 3
  files: 2
  completed: 2026-07-21
---

# Phase 02 Plan 01: Measurement Prerequisites Summary

Closed both measurement blockers before any lockstep source file is touched: an operator-confirmed six-account production run design (3 free + 3 admin-panel Elite, `ADMIN_EMAIL` deliberately unused) and a LOCKED TEMP diagnostic cap table that plan 02-05 implements verbatim.

## What Was Built

`.planning/phases/02-ai-token-cost-optimization/02-PREREQS.md` — four sections:

**Section A — account requirement.** Documents that `_shared/auth.ts:155-167` (user-auth) and `:224-255` (internal/job) force `tier = 'elite'` for `ADMIN_EMAIL` with no request-body override, so the admin account emits zero free-tier telemetry rows. Explicitly rejects temporarily repointing the `ADMIN_EMAIL` secret, because that same secret also gates admin-panel access and the billing-period guard exemption (`20260717000000_fix_billing_period_guard_admin_exemption.sql`).

**Section B — TEMP diagnostic caps, LOCKED.** Per-cell table with current value, TEMP proposal, ceiling change, and invariant recheck against all four hard invariants (`ABSOLUTE_MAX_TOKENS` 12000 per call, per-tier `CALL_CONFIGS` sum ≤ ceiling, GATE-09, Career brevity ratio ×1.8). Tier sums pre-computed for the 02-05 snapshot edit, with the arithmetic shown.

**Section C — the 21 runs.** One row per run with feature, tier, account slot, and an empty input-description column, plus a per-account load table and the cache-busting warning.

**Section D — both approval blocks, filled and marked APPROVED.**

## Key Decisions

**TEMP caps: `approve-as-proposed`, no narrowing.** Resume free 9000 KEEP (GATE-09 forbids ≥10000 while elite is 20000) · Resume pro/elite per-call 8000/8000/8000/6000 = 30000 · Career free 9000 · Career pro/elite 9000/6000/4000 = 19000 · LinkedIn free 12000 KEEP (already at the clamp) · LinkedIn pro/elite 9000→12000 · Recruiting Lens pro/elite 9000×3 = 27000.

Tier sums **Free 25800 → 30000** (only `careerCompass.free` changes, +4200 — re-derived by summing the actual free cells, not by trusting the delta, because `sc12-snapshot.test.ts` computes that sum LIVE and compares it to the hardcoded snapshot) and **Pro/Elite 66000 → 100000** (+10000 +9000 +12000 +3000).

Section B is marked **LOCKED** so 02-05 implements exactly these and cannot re-litigate them.

**Run design changed from the plan's assumption.** The plan assumed one free account plus `ADMIN`. The operator's actual design is **3 free + 3 Elite** accounts, with the Elite ones upgraded through the admin panel so they are ordinary users — `ADMIN_EMAIL` is used for **zero** runs. That is strictly better for the study: every row's tier is a real database fact rather than an `auth.ts` elevation artifact.

**Merit budget is a hard constraint, not a footnote.** A free account holds 10 Merits; one triad (Resume 3 + LinkedIn 3 + Career 3) costs exactly 9. Each free account therefore affords exactly one run of each feature with 1 Merit spare. Nine free runs could not have come from one account (27 Merits needed). Section C is assigned accordingly — each free account does one Resume + one LinkedIn + one Career, never three of the same. `free_linkedin_scan_used = false` may make the first scan free per account, but the budget deliberately does not depend on it. There is no slack: a failed free run that is not refunded strands that account's triad.

## Verification

- `02-PREREQS.md` exists, contains `GATE-09`, Section C has exactly **21** numbered rows (asserted post-edit, after the account-slot column was added).
- `FREE_ACCOUNT_1` prod-verified read-only by the orchestrator: `x9gns@web-library.net` → `subscription_tier = 'free'`, not `ADMIN_EMAIL`; `user_merits` `subscription_balance = 10`, reset `2026-08-21`; free-tier `merit_feature_costs` 3/3/3.
- `phase9-pii-guard.test.ts` — 18/18 pass (see the finding below for what that does and does not prove).
- `git diff -- src supabase` is **empty**. No source file was modified, as the plan requires.

## Finding: the T-02-01 mitigation does not actually cover this phase

The plan's threat model mitigates the "operator email in a git-tracked `.md`" threat by citing `phase9-pii-guard.test.ts` as a sweep of phase-directory markdown. That premise is wrong. The guard's `SCAN_ROOTS` are the Phase-09 directory and `scripts/test-resumes/` only (`phase9-pii-guard.test.ts:26-30`, `:201`); it never walks `.planning/phases/02-ai-token-cost-optimization/`. The 18/18 pass is therefore **vacuous for `02-PREREQS.md`** — the recorded email and user_id are protected by manual discipline, not by an automated gate.

Not fixed here: this plan is forbidden from editing `src/`. Logged as **D02-01-A** in `deferred-items.md`. Mitigating facts: the address is a disposable relay rather than a personal one, and no password, token, service key, or Supabase key appears anywhere in the phase directory.

## Deviations from Plan

**1. [Rule 2 - Missing critical information] Section A and C rewritten for the 6-account design**

- **Found during:** Task 2 (operator response)
- **Issue:** The plan's Section A/C templates assumed a single free account plus `ADMIN`. The operator's real design is 3 free + 3 admin-panel Elite, and the free Merit budget (10 vs 9) makes the per-account assignment load-bearing rather than cosmetic.
- **Fix:** Section A records all six named slots (only `FREE_ACCOUNT_1` has a literal address; the other five are named placeholders, deliberately not invented) plus the prod verification facts and the Merit constraint as a first-class constraint block. Section C gained an account-slot column and a per-account load table, still exactly 21 rows.
- **Commit:** `ba3ed75b`

**2. [Rule 3 - Blocking/scope finding] PII guard scope finding logged, not fixed**

- **Found during:** Task 2 verification
- **Issue:** As above — the guard does not scan this phase directory.
- **Fix:** Recorded honestly in Section A and as D02-01-A in `deferred-items.md` rather than reporting a green test as coverage it does not provide.
- **Commit:** `ba3ed75b`

**3. [Process] Tasks 2 and 3 committed together**

Both checkpoints were answered by the operator in a single response, and both edits land in the same file. They were committed as one commit (`ba3ed75b`) rather than split into artificial hunks.

## Unblocked Downstream

**D02-02-A is RESOLVED** (by the orchestrator, not this plan): `20260721000000_ai_call_telemetry.sql` was applied to preview `cimjltzovkahkqecpwgi` and all three probes passed — 22 columns / 5 indexes / RLS on / 1 deny-all policy; `anon` and `authenticated` SELECT both `false`; a service-role insert produced `headroom_pct = 75.00` and `truncated = true`; probe row deleted afterwards. Production untouched. **Plan 02-03 is unblocked.**

Plans 02-05 (lockstep TEMP cap edit, implements Section B verbatim) and 02-06 (the 21 runs) are unblocked.

## Commits

| Hash | Task | Description |
|---|---|---|
| `0c3e05d3` | 1 | Draft 02-PREREQS with TEMP cap proposal and 21-run schedule |
| `ba3ed75b` | 2 + 3 | Record operator answers — account design + LOCKED TEMP caps |

## Self-Check: PASSED

All 3 claimed artifacts exist on disk; both claimed commits resolve in `git log`.

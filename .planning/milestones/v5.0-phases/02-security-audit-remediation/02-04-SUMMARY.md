---
phase: 02-security-audit-remediation
plan: 04
subsystem: infra
tags: [security-audit, env, secrets, supply-chain, isolation, cron, promptfoo, vercel, supabase]

# Dependency graph
requires:
  - phase: 02-01
    provides: severity rubric (impact×exploitability, max-of-reasoning) + the no-secret-leak vitest doc guard glob
  - phase: v4.0 ENV-04
    provides: the 10-item cross-surface env fix-list + the 2026-06-23 operator remediation pass (ENV-SEPARATION.md §5/§6)
provides:
  - "Classified findings for audit Domains 8 (secret+env), 16 (dependency/supply-chain), 17 (prod-vs-staging isolation)"
  - "The v4.0 10-item env fix-list re-verified all RESOLVED / as-intended via an operator names-only cross-surface pull (2026-07-01)"
  - "Cross-surface separation confirmed CLEAN (GitHub 5 test-gate secrets / Vercel VITE_*-only / benign prod↔preview deltas)"
  - "ONE open operator remediation: Domain-17 cron-host drift (jobs 1 & 6 → preview host) MEDIUM, live-confirmed, cron re-point OWED to phase closure"
affects: [02-08 (SEC-15 security record), phase-2 closure (operator cron re-point), 08-paddle-retirement (PADDLE_WEBHOOK_SECRET gate input)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Names-only cross-surface env reconciliation (never read/print a secret VALUE — CLAUDE.md rule 7 / T-02-07)"
    - "Operator-gated live truth: Claude classifies repo-side, operator supplies the live cross-surface + read-only prod cron.job pull"

key-files:
  created:
    - .planning/phases/02-security-audit-remediation/02-04-SUMMARY.md
  modified:
    - .planning/phases/02-security-audit-remediation/audit/ENV-SUPPLYCHAIN-ISOLATION-FINDINGS.md

key-decisions:
  - "10-item env fix-list re-verified all RESOLVED / as-intended (names-only, 2026-07-01) — no code change, no store mutation owed"
  - "Cross-surface separation CLEAN recorded explicitly: GitHub=5 test-gate secrets, Vercel=VITE_*-only, prod↔preview deltas benign"
  - "Domain-17 cron drift MEDIUM live-confirmed (jobs 1 & 6 → preview host) → OPERATOR cron re-point OWED (live cron.alter_job; NO DDL/migration); carried to phase closure, NOT resolved by this plan"
  - "SEC-10 std/zod drift re-scoped/accepted (currency, not a vuln); promptfoo 20-pkg residue accepted dev-only/off-gate/zero prod-runtime exposure"

patterns-established:
  - "Operator-gated names-only reconciliation: repo-side classification first, then fold the operator's live names-only pull verdicts into the committed findings doc while keeping the no-secret-leak guard green"

requirements-completed: [SEC-12, SEC-13]

# Metrics
duration: 18min
completed: 2026-07-02
---

# Phase 2 Plan 04: Env/Secrets + Supply-Chain + Prod-vs-Staging Isolation Sweep Summary

**Audit Domains 8/16/17 classified (secret+env LOW, supply-chain LOW-MEDIUM→accepted, isolation CLEAN) with the v4.0 10-item env fix-list re-verified all-RESOLVED via an operator names-only cross-surface pull, leaving exactly ONE open operator remediation: the MEDIUM cron-host drift (prod cron jobs 1 & 6 firing at the preview functions host) carried to phase closure.**

## Performance

- **Duration:** ~18 min active (spans an operator checkpoint pause for the names-only cross-surface pull)
- **Started:** 2026-07-01 (Tasks 1-2 repo-side sweep) → committed `27c76902`
- **Completed:** 2026-07-02T01:26Z (Task-3 fold-in)
- **Tasks:** 3 (Task 1 + 2 auto; Task 3 operator checkpoint reconciled + folded in)
- **Files modified:** 1 (audit findings doc) + 1 created (this summary)

## Accomplishments
- **Domain 8 (secret+env) → LOW, reconciled clean:** per-function `Deno.env.get` critical-secret reads confirmed fail-closed at HEAD; no committed secret VALUE (REPO-05); Vite bundles only `VITE_*` (integration-injected privileged cluster never browser-exposed). The v4.0 10-item operator fix-list was re-verified by the operator's names-only cross-surface pull (2026-07-01) — **all 10 RESOLVED / as-intended**.
- **Cross-surface separation CLEAN (recorded explicitly):** GitHub Actions = exactly the 5 TEST-project gate secrets; Vercel = `VITE_*`-only (no backend secret on frontend host); Supabase prod↔preview deltas benign (preview has the test-only `AI_TEST_MODE`/`PERF_TEST_*` seams; prod has `RESEND_API_KEY` + `ANTHROPIC_MODEL_FALLBACK`).
- **Domain 16 (supply-chain) → LOW-MEDIUM, accepted:** `npm run audit:deps` = 1 low / 13 moderate / 6 high / 0 critical = 20, all in the dev-only `promptfoo` subtree (off `verify:baseline`, zero prod-runtime exposure); `react-router-dom` prod advisory already patched in-6.x `^6.30.4`; SEC-10 std/zod drift re-scoped/accepted (currency, not a vuln).
- **Domain 17 (isolation):** prod=preview separation live-re-confirmed CLEAN; the cron-host drift (prod cron jobs 1 `keep-warm-ping` `*/5` + 6 `extract_catchup_nightly` `*/15` → preview functions host) **LIVE-CONFIRMED** via a read-only prod `cron.job` pull and classified **MEDIUM → operator cron re-point OWED**.
- **No-secret-leak guard green** (15/15) — the findings doc stays names-only.

## Task Commits

1. **Task 1: Re-audit secrets/env (8) + supply-chain (16)** - `27c76902` (docs) — repo-side classification + fix-list checklist drafted
2. **Task 2: Classify prod-vs-staging isolation (17) + cron drift** - `27c76902` (docs) — same commit as Task 1
3. **Task 3: Operator names-only cross-surface reconciliation folded in** - see plan-finalize commit below (docs)

**Plan metadata:** _(this SUMMARY + STATE update — see final commit)_

## Files Created/Modified
- `.planning/phases/02-security-audit-remediation/audit/ENV-SUPPLYCHAIN-ISOLATION-FINDINGS.md` - finalized: 10-item fix-list marked all-RESOLVED (names-only verdicts), §8d cross-surface separation-CLEAN verdict added, Domain 17 cron drift updated to LIVE-CONFIRMED MEDIUM with the operator re-point owed, new "Operator Remediation Owed" section, route-summary rows updated.
- `.planning/phases/02-security-audit-remediation/02-04-SUMMARY.md` - this summary.

## Decisions Made
- **All 10 fix-list items RESOLVED / as-intended** (names-only, 2026-07-01) — no code change or store mutation owed. Item 4 (`VITE_FEATURE_INTERVIEW_PREP`) presence confirmed on Vercel Preview + Production; the prod VALUE=`false` is an operator self-confirm (names-only pulls cannot read values), not a blocking remediation.
- **Domain-17 cron drift routed as OWED, not resolved:** the fix is a live prod `cron.alter_job`/`UPDATE cron.job` re-pointing jobs 1 & 6 from `cimjltzovkahkqecpwgi` → `zjpjapgraoxdukdvpjes` (or an `app.functions_base_url` GUC). Claude is read-only on prod → operator-applied. It is a cron URL update, NOT public-schema DDL → **no repo migration / no gap-closure migration plan owed.** Carried to phase closure.
- **Live pull superseded a v4.0-catalog inference:** the read-only prod `cron.job` pull shows jobs 4/5/7/8 (incl. `reset-subscription-merits-sweep`) are internal SQL crons with no functions host — correcting the earlier catalog note that job 5 called a functions host via GUC.

## Deviations from Plan

None - plan executed as written. Task 3 was an operator checkpoint (`checkpoint:human-verify`, gate=blocking); the operator's names-only reconciliation was folded into the findings doc per the resume instructions. No auto-fixes (Rules 1-4) were triggered — this plan authors a doc only (no `src/**`/`supabase/functions/**` edit, no DDL, no live store mutation by Claude).

## Issues Encountered
None. The no-secret-leak vitest guard (`src/test/security/security-audit-docs.test.ts`, 15 tests) confirmed the finalized doc remains names-only.

## Open Operator Remediation (carried to Phase-2 closure)

**ONE MEDIUM operator action owed** — everything else exits clean/accepted:

| Finding | Severity | Owner | Action | Status |
| ------- | -------- | ----- | ------ | ------ |
| Domain 17 cron-host drift — prod cron jobs 1 `keep-warm-ping` (`*/5`) + 6 `extract_catchup_nightly` (`*/15`) `net.http_post` at the PREVIEW functions host `cimjltzovkahkqecpwgi.supabase.co` | MEDIUM (live-confirmed 2026-07-01) | Operator (Claude read-only on prod) | Live prod `cron.alter_job`/`UPDATE cron.job` re-pointing both URL hosts → `zjpjapgraoxdukdvpjes.supabase.co` (or an `app.functions_base_url` GUC). NO repo migration / NO DDL. | OWED / open |

- **Env/secrets (Domain 8):** clean/accepted, nothing owed (item-4 VALUE self-confirm is a convenience check).
- **Supply-chain (Domain 16):** clean/accepted, nothing owed (promptfoo dev-only/off-gate; SEC-10 re-scoped).

## User Setup Required
None - no external service configuration required by this plan. (The one operator cron re-point above is a remediation action, not app setup, and is surfaced at Phase-2 closure.)

## Next Phase Readiness
- Domains 8/16/17 classified and reconciled against fresh operator names-only live state; findings feed the SEC-15 security record (02-08).
- Wave-2 continues: 02-05 (code-fix split for the confirmed HIGHs) is next.
- **Carry to Phase-2 closure:** the single MEDIUM operator cron re-point (jobs 1 & 6 → prod host).
- **Phase-8 input:** `PADDLE_WEBHOOK_SECRET` confirmed already unset on prod (webhook fail-closes) — the retirement gate's secret precondition is satisfied.

## Self-Check: PASSED

- FOUND: `.planning/phases/02-security-audit-remediation/audit/ENV-SUPPLYCHAIN-ISOLATION-FINDINGS.md`
- FOUND: `.planning/phases/02-security-audit-remediation/02-04-SUMMARY.md`
- FOUND commit: `27c76902` (Tasks 1-2)
- no-secret-leak guard `security-audit-docs.test.ts`: 15/15 green

---
*Phase: 02-security-audit-remediation*
*Completed: 2026-07-02*

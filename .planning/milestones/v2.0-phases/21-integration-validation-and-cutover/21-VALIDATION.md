---
phase: 21
slug: integration-validation-and-cutover
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno test (built-in) + existing `scripts/run-edge-tests.ps1` |
| **Config file** | `supabase/functions/deno.json` (test task) |
| **Quick run command** | `deno test --allow-env --allow-net --allow-read supabase/functions/_tests/test-04-free-signup-to-shop.test.ts` (per-file during iteration) |
| **Full suite command** | `.\scripts\run-edge-tests.ps1` |
| **Estimated runtime** | ~30s full suite (offline mocks, no network) |

---

## Sampling Rate

- **After every task commit:** Run the per-file quick command for the test scenario being authored; for non-test tasks (migration, frontend closure, scripts), run `npm run lint` + relevant targeted test.
- **After every plan wave:** Run `.\scripts\run-edge-tests.ps1` full suite.
- **Before `/gsd-verify-work`:** Full suite green + MIG-02 applied to staging + SC-5 probe script dry-run passes on staging.
- **Max feedback latency:** 30 seconds (per-file); 60 seconds (full suite).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | TEST-04 | — | Free user spends 3 of 5 merits, is blocked at 2, buys 3-pack, spends to 2 | integration | `deno test --allow-env --allow-net --allow-read supabase/functions/_tests/test-04-free-signup-to-shop.test.ts` | ❌ W0 | ⬜ pending |
| 21-02-01 | 02 | 1 | TEST-05 | — | Free→Pro upgrade credits 75; Recruiting Lens deducts 8; Elite upgrade credits diff; output tier transitions | integration | `deno test --allow-env --allow-net --allow-read supabase/functions/_tests/test-05-upgrade-proration.test.ts` | ❌ W0 | ⬜ pending |
| 21-03-01 | 03 | 1 | TEST-06 | — | Yearly subscribe charges $89.99; 75 merits credited; reset restores 75 with zero rollover | integration | `deno test --allow-env --allow-net --allow-read supabase/functions/_tests/test-06-yearly-reset.test.ts` | ❌ W0 | ⬜ pending |
| 21-04-01 | 04 | 2 | MIG-02 | — | User INSERT on `analysis_results` is rejected by RLS; SELECT still works for owner | migration | `supabase db push` + RLS probe SQL asserting 42501 on INSERT | ❌ W0 | ⬜ pending |
| 21-04-02 | 04 | 2 | MIG-02 | — | No frontend code path writes to `analysis_results`; all writes happen via service-role edge functions after `check_and_deduct_merits` | static + runtime | `grep -RnE "from\('analysis_results'\).*\\.(insert\|update)\\(" src/` returns zero hits | ❌ W0 | ⬜ pending |
| 21-05-01 | 05 | 3 | MIG-02 + SC-5 | — | `deploy-production.ps1` exposes `Invoke-MeritFlagFlip` / `Invoke-MeritFlagRollback` callable; `sc5-probe.ps1` invokes all D-07 features and reports HTTP 2xx | scripted | Dry-run against staging; PowerShell script exit 0 | ❌ W0 | ⬜ pending |
| 21-06-01 | 06 | 4 | SC-5 | — | `merit-flag: enabled=true` cold-start log emitted by every D-07 handler; grep against staging logs confirms ≥1 line per handler | runtime | `supabase functions logs <name> --project-ref $staging | grep -c 'merit-flag: enabled=true'` ≥ 1 per handler | ❌ W0 | ⬜ pending |
| 21-07-01 | 07 | 5 | SC-5 | — | `21-SC5-EVIDENCE.md` committed with timestamped log excerpts for every D-07 feature | artifact | `test -f .planning/phases/21-integration-validation-and-cutover/21-SC5-EVIDENCE.md` + grep asserts sections | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Exact task IDs (X-YY) will be finalized by the planner; table above reflects expected plan shape and MUST be reconciled against final PLAN.md files.*

---

## Wave 0 Requirements

- [ ] `supabase/functions/_tests/test-04-free-signup-to-shop.test.ts` — stub covering TEST-04
- [ ] `supabase/functions/_tests/test-05-upgrade-proration.test.ts` — stub covering TEST-05
- [ ] `supabase/functions/_tests/test-06-yearly-reset.test.ts` — stub covering TEST-06
- [ ] `supabase/migrations/<timestamp>_drop_analysis_results_write_policies.sql` — MIG-02 migration file
- [ ] `scripts/sc5-probe.ps1` — synthetic probe for D-18
- [ ] `scripts/run-edge-tests.ps1` — register the three new `_tests/test-*.test.ts` files
- [ ] `.planning/phases/21-integration-validation-and-cutover/21-SC5-EVIDENCE.md` — drafted shell, populated during soak

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 24-hour staging soak with `MERIT_SYSTEM_ENABLED=true` and zero `alert_state` rows | SC-5 (D-11) | Requires wall-clock elapsed time; cannot be shortened | After staging flip, run the D-11 walkthrough script against staging; monitor `alert_state` for 24 full hours; record end-time confirmation in soak log |
| 2-hour active post-flip soak on production with ≥1 `merit-transaction` log per D-07 feature | SC-5 (D-12) | Requires real production traffic + operator watch | After prod flip, operator watches logs + views for 2h; captures log excerpts; runs `sc5-probe.ps1` at T+90m if any feature shows zero organic traffic |
| `MERIT_SYSTEM_ENABLED=true` present in prod secrets | SC-5 (D-19) | Secret state not inspectable from repo | `supabase secrets list --project-ref <prod>` grep for `MERIT_SYSTEM_ENABLED` row |
| Rollback decision (NFR-11 alert → flip back) | D-13 | Human-in-loop; no auto-rollback | Operator receives alert email, inspects root cause, decides whether to execute `Invoke-MeritFlagRollback` |
| Low-traffic Monday–Thursday morning US-ET flip window | D-16 | Operator scheduling | Operator logs flip timestamp in `21-SC5-EVIDENCE.md` alongside weekday confirmation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

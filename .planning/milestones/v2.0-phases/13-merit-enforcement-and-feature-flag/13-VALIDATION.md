---
phase: 13
slug: merit-enforcement-and-feature-flag
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-14
audited: 2026-04-16
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from RESEARCH.md §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno test runner (`deno test`) — matches Phase 10/11 edge-level tests |
| **Config file** | `supabase/functions/deno.json` |
| **Quick run command** | `deno test supabase/functions/_shared/merit-gateway.test.ts` |
| **Full suite command** | `./scripts/run-edge-tests.ps1` |
| **Estimated runtime** | ~60 seconds (full edge suite) |

pgTAP tests (TEST-01/02/03) ship with Phase 11. Phase 13's tests are Deno edge-function tests only.

---

## Sampling Rate

- **After every task commit:** Run `deno test <path-to-touched-test-file>` — tight per-file feedback
- **After every plan wave:** Run `./scripts/run-edge-tests.ps1` — full Deno suite
- **Before `/gsd-verify-work`:** Full suite must be green; NFR-01 perf assertion must show p99 < 100 ms on 10 runs
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-S1 | 01 | 0 | TEST-07 | T-13-M1 | AI_FORCE_FAILURE guarded by AI_TEST_MODE | unit | `deno test supabase/functions/_shared/anthropic.test.ts` | Yes (3 tests) | ✅ green |
| 13-01-S2 | 01 | 0 | BACK-01 | — | Gateway test stubs present | unit | `deno test supabase/functions/_shared/merit-gateway.test.ts` | Yes (10 tests) | ✅ green |
| 13-01-01 | 01 | 1 | BACK-01, NFR-01, NFR-09 | T-13-A1 | Deduct→execute→log contract | unit | `deno test supabase/functions/_shared/merit-gateway.test.ts` | Yes (10 tests) | ✅ green |
| 13-01-02 | 01 | 1 | NFR-01 | — | Gateway RPC round-trip p99 < 100 ms | perf | `deno test supabase/functions/_shared/merit-gateway.perf.test.ts` | Yes (1 test, skip-guard) | ✅ green |
| 13-01-03 | 01 | 1 | NFR-05 | T-13-R1 | 61st request/hr → 429 rate_limit_exceeded | unit | `deno test supabase/functions/_shared/merit-gateway.rate.test.ts` | Yes (1 test, skip-guard) | ✅ green |
| 13-01-04 | 01 | 1 | MER-11 | T-13-M1 | Refund on 529/5xx/408, no refund on parse error | unit | `deno test supabase/functions/_shared/merit-gateway.test.ts` | Yes (10 tests) | ✅ green |
| 13-02-01 | 02 | 2 | BACK-01, MIG-05 | — | `if (MERIT_SYSTEM_ENABLED) withMerits(...)` branch on every gated handler | integration | `deno test supabase/functions/analyze-resume/merit-branch.test.ts` | Yes (3 tests) | ✅ green |
| 13-02-02 | 02 | 2 | MIG-05 | — | Flag off → legacy `checkAndRecordUsage` path unchanged | regression | `deno test supabase/functions/analyze-resume/legacy-unchanged.test.ts` | Yes (3 tests) | ✅ green |
| 13-03-01 | 03 | 3 | NFR-10 | T-13-AUTH1 | Admin metrics edge fn returns 4 aggregates; auth gate enforced | unit | `deno test supabase/functions/admin-merit-metrics/index.test.ts` | Yes (5 tests) | ✅ green |
| 13-03-02 | 03 | 3 | NFR-11 | T-13-AL1 | Alert evaluator fires on threshold breach; debounced via alert_state | unit | `deno test supabase/functions/check-merit-alerts/index.test.ts` | Yes (7 tests) | ✅ green |
| 13-04-01 | 04 | 4 | TEST-07, MER-11 | T-13-M1 | End-to-end deduction + refund + balance restore on mocked Anthropic failure | integration | `deno test supabase/functions/analyze-resume/test-07.test.ts` | Yes (4 tests) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity check:** No 3 consecutive task commits without an automated verify — every row has a Deno test command.

---

## Wave 0 Requirements

- [x] `supabase/functions/_shared/merit-gateway.test.ts` — 10 tests for BACK-01, MER-11, NFR-09
- [x] `supabase/functions/_shared/merit-gateway.perf.test.ts` — 1 test for NFR-01 (p99 < 100 ms, skip-guard)
- [x] `supabase/functions/_shared/merit-gateway.rate.test.ts` — 1 test for NFR-05 (pooled limiter, skip-guard)
- [x] `supabase/functions/_shared/anthropic.test.ts` — 3 tests for `AI_FORCE_FAILURE`/`AI_TEST_MODE` compound gate
- [x] `supabase/functions/admin-merit-metrics/index.test.ts` — 5 tests for NFR-10 (auth gate + aggregates)
- [x] `supabase/functions/check-merit-alerts/index.test.ts` — 7 tests for NFR-11 (threshold fire + debounce + DB error non-fatal)
- [x] `supabase/functions/analyze-resume/test-07.test.ts` — 4 tests for TEST-07 canonical end-to-end
- [x] `supabase/functions/analyze-resume/legacy-unchanged.test.ts` — 3 tests for MIG-05 regression
- [x] `supabase/functions/analyze-resume/merit-branch.test.ts` — 3 tests for D-06 branch presence
- [x] Update `scripts/run-edge-tests.ps1` to register all new test files (22 entries total)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Feature-flag cutover in production | MIG-05 | Requires `supabase secrets set MERIT_SYSTEM_ENABLED=true` + functions restart (~30 s propagation); cannot be exercised in local Deno tests | Staging: set secret, curl `analyze-resume`, confirm `merit_transactions` insert. Flip back, confirm `usage_tracking` resumes. |
| Alert email delivery to admin | NFR-11 | Resend is a real external service; Deno tests stub it | Trigger `negative_balance` condition in staging DB, invoke `check-merit-alerts`, confirm email received at `ADMIN_EMAILS[0]`. |
| Cron schedule for `check-merit-alerts` | NFR-11 | `pg_cron` row is deployed per-env via SQL editor, not the migration file | After staging deploy, `SELECT * FROM cron.job WHERE jobname = 'check-merit-alerts'` — expect one row with `*/15 * * * *` schedule. |
| Gateway RPC p99 < 100 ms (SC-3) | NFR-01 | Perf test is gated on `DENO_TEST_SUPABASE_LOCAL=1`; CI runs skip silently. A mocked latency test would lie about NFR-01 so no CI replacement is planned. | Local/staging operator: `for ($i=1; $i -le 10; $i++) { $env:DENO_TEST_SUPABASE_LOCAL="1"; deno test supabase/functions/_shared/merit-gateway.perf.test.ts --no-check --allow-env --allow-net --allow-read }` — all 10 runs must exit 0 and the in-test p99 assertion must pass. |
| Backend read-after-write (NFR-02 backend layer) | NFR-02 | Requires a live local Supabase to prove fresh service-role clients see the commit with zero sleep; CI skips. | `$env:DENO_TEST_SUPABASE_LOCAL="1"; deno test supabase/functions/_shared/merit-gateway.raw.test.ts --no-check --allow-env --allow-net --allow-read` — 3 tests pass. Closes backend-truth half of NFR-02. |
| Frontend merit-balance UI propagation < 5 s (NFR-02 UI layer) | NFR-02 | **DEFERRED TO PHASE 20.** Phase 13 does not ship React Query invalidation / Realtime / polling for merit displays. | Not verified in Phase 13. Phase 20 owns this gate. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING test files (9 files + 1 script update)
- [x] No watch-mode flags in test commands
- [x] Feedback latency < 60 s
- [x] `nyquist_compliant: true` set in frontmatter after Wave 0 complete

**Approval:** validated

---

## Validation Audit 2026-04-16

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
| Total automated tests | 40 |
| Test files | 10 |
| All green | Yes (40 passed, 0 failed) |
| Ignored stubs remaining | 0 |
| Additional coverage (not in original map) | merit-gateway.raw.test.ts (3 tests, NFR-02 backend-truth) |

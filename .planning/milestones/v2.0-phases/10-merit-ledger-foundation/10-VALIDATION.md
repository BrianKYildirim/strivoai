---
phase: 10
slug: merit-ledger-foundation
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-14
updated: 2026-04-15
---

# Phase 10 — Validation Strategy

> Per-phase validation contract. Updated after Wave 4 verification + Nyquist gap-fill audit.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno test (edge tests) + PowerShell/psql DO-block scripts for DB-level assertions |
| **Config file** | `supabase/functions/deno.json` |
| **Quick run command** | `.\scripts\verify-merit-schema.ps1` (staging SUPABASE_DB_URL) |
| **Full suite command** | `.\scripts\run-edge-tests.ps1` + `.\scripts\verify-merit-schema.ps1` + `.\scripts\snapshot-legacy-tables.ps1` pre/post diff |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `supabase db reset` against local shadow DB to confirm migration applies cleanly
- **After every plan wave:** Run full Deno test suite + `verify-merit-schema.ps1` against staging
- **Before `/gsd-verify-work`:** Full suite green + manual RLS smoke test against staging branch
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 04 | 4 | MER-01, MER-02, MER-03 | — | Tables exist with exact column shapes | sql | `pwsh -File scripts/verify-merit-schema.ps1` (SC-1 DO block vs information_schema.columns) | ✅ | ✅ green |
| 10-01-02 | 01 | 1 | MER-04 | T-10-01 | Direct user INSERT/UPDATE/DELETE rejected by RLS | deno | `deno test supabase/functions/_tests/merit_rls_test.ts --no-check --allow-env --allow-net` | ✅ | ✅ green |
| 10-01-03 | 04 | 4 | MER-13 | — | CHECK constraint blocks negative balances | sql | `pwsh -File scripts/verify-merit-schema.ps1` (SC-3 BEGIN/EXCEPTION WHEN check_violation) | ✅ | ✅ green |
| 10-01-04 | 04 | 4 | MER-10, MER-14 | — | Backfill seeds every profile with (sub=5, shop=0, lifetime=5) + grant row per profile | sql | `pwsh -File scripts/verify-merit-schema.ps1` (SC-4 invariant) + migration §9 DO block at deploy | ✅ | ✅ green |
| 10-01-05 | 01+03 | 1,3 | MIG-01, MIG-04 | — | Legacy `usage_tracking` / `credit_usage` / `ai_usage` unmodified pre/post push | sql | `pwsh -File scripts/snapshot-legacy-tables.ps1` pre/post + `diff` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements (satisfied)

- ✅ `supabase/functions/_tests/merit_rls_test.ts` — Deno test authenticates as a user and asserts INSERT/UPDATE/DELETE on all 3 merit tables returns RLS-denied. 5 tests `ok | 5 passed | 0 failed` against staging.
- ✅ `scripts/snapshot-legacy-tables.ps1` — captures row counts + md5 hash of `usage_tracking`, `credit_usage`, `ai_usage` pre/post migration; Plan 03 diff empty (MIG-04 proved).
- ✅ `scripts/verify-merit-schema.ps1` — persisted SC-1/SC-3/SC-4 DO-block re-runnable script (added during Nyquist audit 2026-04-15).
- ✅ No new framework installs — Deno test runner + psql already available; new script reuses `scripts/snapshot-legacy-tables.ps1` pattern (PowerShell + psql + fail-soft skip on missing `SUPABASE_DB_URL`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration runs cleanly on production-shaped data volume | MER-01..04, MER-10 | Local shadow DB doesn't match production row count | Restore prod snapshot to staging branch, run migration, confirm §9 verification NOTICE fires |
| Trigger fires on real signup flow | MER-10, MER-14 | Requires full Supabase auth roundtrip | Sign up new test user via staging frontend, then re-run `verify-merit-schema.ps1` — SC-4 invariant should still hold with profile_count incremented (Plan 04 observed 6→7 transition live) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (`merit_rls_test.ts`, `snapshot-legacy-tables.ps1`, `verify-merit-schema.ps1`)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ✅ approved — all 9 Phase 10 requirements (MER-01/02/03/04/10/13/14, MIG-01/04) have re-runnable automated coverage.

---

## Validation Audit 2026-04-15

| Metric | Count |
|--------|-------|
| Gaps found | 6 |
| Resolved | 6 |
| Escalated | 0 |

**Resolved gaps:**
- MER-01 (user_merits column shape) — added SC-1 DO block to `scripts/verify-merit-schema.ps1`
- MER-02 (merit_transactions column shape) — same
- MER-03 (merit_shop_purchases column shape) — same
- MER-13 (CHECK blocks negative balance) — added SC-3 nested BEGIN/EXCEPTION DO block
- MER-10 (signup grants 5 sub merits) — added SC-4 invariant DO block (re-runnable complement to deploy-time §9 block)
- MER-14 (lifetime_granted = 5) — same SC-4 block

**Updates to Per-Task Map:**
- Fixed `.sh` → `.ps1` typo on snapshot script reference
- Replaced `psql -f <migration>` placeholder (which is not a test — re-running a migration is not an assertion) with `scripts/verify-merit-schema.ps1` entries
- Flipped all statuses from ⬜ pending to ✅ green, backed by Plan 04 live-fire SC proofs and the newly persisted script

**New file:** `scripts/verify-merit-schema.ps1` (262 lines; PowerShell + psql; fail-soft skip on missing `SUPABASE_DB_URL`; three `psql -v ON_ERROR_STOP=1` DO blocks).

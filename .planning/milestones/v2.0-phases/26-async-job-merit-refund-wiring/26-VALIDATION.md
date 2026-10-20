---
phase: 26
slug: async-job-merit-refund-wiring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-28
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno test (`Deno.test` + `https://deno.land/std@0.224.0/assert/mod.ts`) |
| **Config file** | `supabase/functions/deno.json` (existing — no changes needed) |
| **Quick run command** | `deno test --no-check --allow-env --allow-read supabase/functions/process-resume-analysis-job/__tests__/ supabase/functions/process-career-analysis-job/__tests__/` |
| **Full suite command** | `.\scripts\run-edge-tests.ps1` |
| **Estimated runtime** | ~15-30 seconds (source-grep tests are fast; live-DB integration blocks env-gated and skipped by default) |

---

## Sampling Rate

- **After every task commit:** Run quick command (worker test directories only)
- **After every plan wave:** Run `.\scripts\run-edge-tests.ps1`
- **Before `/gsd-verify-work`:** Full suite must be green AND manual SC #1/#6 SQL verification (column exists, idempotent re-apply) must pass
- **Max feedback latency:** ~30 seconds per task commit

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 26-01-* | 01 | 1 | MER-11 / SC #1 | — | Migration adds nullable uuid column; idempotent re-apply | manual SQL | `supabase migration up` (twice; second is no-op) | n/a (DB) | ⬜ pending |
| 26-01-* | 01 | 1 | MER-11 / SC #2 | — | submit-resume-analysis-job + submit-career-analysis-job persist txid | source-grep / unit | `deno test ... submit-*-analysis-job/__tests__/persists-txid.test.ts` (optional D-12) | ❌ W0 (optional) | ⬜ pending |
| 26-01-* | 01 | 1 | MER-11 / D-08a | — | Submit-side insert failure throws `MeritRefundable` (refunds at submission) | source-grep | grep for `MeritRefundable` in submit-*/index.ts | n/a (verifies code change) | ⬜ pending |
| 26-01-* | 01 | 1 | MER-11 / D-02 | — | `refundMeritsForJob` recognizes `already_refunded`, returns `{ ok: true, alreadyRefunded: true }`, logs at info | source-grep / unit | `deno test ... _shared/__tests__/merit-gateway-already-refunded.test.ts` | ❌ W0 | ⬜ pending |
| 26-02-* | 02 | 2 | MER-11 / SC #5 (a) | — | Successful job completion does NOT call `refundMeritsForJob` | source-grep | `deno test ... process-resume-analysis-job/__tests__/refund-on-failure.test.ts` | ❌ W0 | ⬜ pending |
| 26-02-* | 02 | 2 | MER-11 / SC #5 (b) | — | Response-path terminal failure refunds exactly once with persisted txid + reason | source-grep | same as above | ❌ W0 | ⬜ pending |
| 26-02-* | 02 | 2 | MER-11 / SC #5 (b)′ / D-07 | — | Worker-catch `maxedOut===true` path refunds before status='failed' | source-grep | same as above | ❌ W0 | ⬜ pending |
| 26-02-* | 02 | 2 | MER-11 / SC #5 (c) | — | Re-process of already-failed job → zero additional `refund_merits` mutations (RPC `already_refunded`) | source-grep + env-gated live-DB | same as above; live-DB block ignored unless `SUPABASE_URL` + service key env set | ❌ W0 | ⬜ pending |
| 26-02-* | 02 | 2 | MER-11 / SC #5 (d) / D-09 | — | Pre-migration row (NULL txid) → warn log `pre_migration_null_txid`, no refund call | source-grep | same as above | ❌ W0 | ⬜ pending |
| 26-02-* | 02 | 2 | MER-11 / SC #5 (mirror) | — | Career-analysis worker mirrors all SC #5 cases | source-grep | `deno test ... process-career-analysis-job/__tests__/refund-on-failure.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are placeholders (`26-01-*`, `26-02-*`); planner assigns concrete numbers when generating PLAN.md.*

---

## Wave 0 Requirements

- [ ] `supabase/functions/process-resume-analysis-job/__tests__/refund-on-failure.test.ts` — SC #5 (a)–(d) for resume worker
- [ ] `supabase/functions/process-career-analysis-job/__tests__/refund-on-failure.test.ts` — SC #5 (a)–(d) for career worker (mirror)
- [ ] `supabase/functions/_shared/__tests__/merit-gateway-already-refunded.test.ts` — D-02 helper extension
- [ ] (Optional, D-12) `supabase/functions/submit-resume-analysis-job/__tests__/persists-txid.test.ts` — verify SC #2 by source-grep on insert payload
- [ ] (Optional, D-12) `supabase/functions/submit-career-analysis-job/__tests__/persists-txid.test.ts` — mirror

*No framework install needed; `deno.json` already has the test task scaffold.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration adds `merit_transaction_id uuid NULL` to `analysis_jobs` | SC #1 | Schema state cannot be verified by edge-function tests; needs live DB inspection | `supabase db push` (or remote SQL): `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='analysis_jobs' AND column_name='merit_transaction_id';` — expect 1 row, `uuid`, `YES` |
| Migration is idempotent | SC #6 | `IF NOT EXISTS` semantics need a second-apply check | Apply migration twice locally or in staging; second apply must be no-op (no error, no schema change) |
| Backward-compat: in-flight pre-migration jobs still process | SC #6 | Behavior across migration boundary | Insert a synthetic `analysis_jobs` row with `merit_transaction_id=NULL` and trigger worker; expect graceful warn log + status transition without crash |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s per task
- [ ] `nyquist_compliant: true` set in frontmatter (planner sets after final review)

**Approval:** pending

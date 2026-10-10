---
phase: 03-shared-analysis-lifecycle-substrate
verified: 2026-07-02T16:17:26Z
status: passed
gap_resolution: "The single gap (get-analysis-run-status undeployed) was CLOSED post-verification — deployed to preview cimjltzovkahkqecpwgi AND prod zjpjapgraoxdukdvpjes via `supabase functions deploy get-analysis-run-status` (operator-approved 2026-07-02). All 4 success criteria now fully met; substrate is deploy-complete and dormant. Remaining non-gap items: Playwright E2E leg (P03-E2E-SECRETS, environment-driven) + optional gated-remote LIFE-05 live proof."
score: 4/5 must-haves verified (1 minor operational gap; all 4 ROADMAP success criteria substantively met)
gaps:
  - truth: "get-analysis-run-status is deployed and callable so the recovery hook's poll-fallback works the moment a feature flips the VITE flag"
    status: partial
    reason: "The endpoint's code, auth/CORS/owner-scope posture, and job-contract.test.ts are all correct and pass, but the function was never deployed to either environment. `supabase functions list` for both cimjltzovkahkqecpwgi (preview) and zjpjapgraoxdukdvpjes (prod) confirms `reap-stale-analysis-runs` is ACTIVE on both, but `get-analysis-run-status` is absent from both lists. The 03-05-SUMMARY.md explicitly flagged this twice ('must be deployed (not yet deployed)') and 03-06/03-07 did not close it — it fell through a wave boundary. Because the whole substrate is dormant (VITE_FEATURE_ANALYSIS_LIFECYCLE default OFF) this has zero live-traffic impact today, but the phase goal states the substrate ships 'ready for the five features to adopt,' and Phase 4/5/6 will hit a 404 the moment useAnalysisRun's poll fallback fires against an undeployed function unless someone remembers this step first."
    artifacts:
      - path: "supabase/functions/get-analysis-run-status/index.ts"
        issue: "Code complete and tested; not deployed to preview or prod"
    missing:
      - "supabase functions deploy get-analysis-run-status --project-ref cimjltzovkahkqecpwgi"
      - "supabase functions deploy get-analysis-run-status --project-ref zjpjapgraoxdukdvpjes"
      - "No code change needed — this is a pure deployment/ops step, verifiable via `supabase functions list` showing the slug ACTIVE on both projects"
---

# Phase 3: Shared Analysis Lifecycle Substrate Verification Report

**Phase Goal:** One persistent, idempotent, financially-safe analysis lifecycle exists as shared infrastructure — shipped dormant/flag-gated with legacy paths byte-identical — ready for the five features to adopt.
**Verified:** 2026-07-02T16:17:26Z
**Status:** gaps_found (one minor, non-blocking deployment gap; all four ROADMAP success criteria are substantively met at the code/DB/test level)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (mapped from the 4 ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `analysis_jobs` ledger evolved additively (11-state model + LIFE-02 metadata), CAS RPCs + partial-unique index live, `verify:baseline` green, zero behavior change | ✓ VERIFIED | Live prod query: `state` col is `text`; `analysis_jobs_active_idem_unique` partial-UNIQUE index present with correct `WHERE` clause; `CHECK (NOT (merit_settled AND refunded))` (`analysis_jobs_settle_refund_excl`) present; both RPCs exist with ACL `{service_role, postgres}` only (anon/authenticated revoked — closes the found IDOR); `analysis_jobs` in `supabase_realtime` publication. All confirmed via `supabase db query --linked` against **prod** (zjpjapgraoxdukdvpjes), not just SUMMARY claims. `supabase migration list --linked` shows 20260702000001-000004 applied. `git diff` confirms `process-resume-analysis-job/index.ts`, `get-analysis-job-status/index.ts`, `Results.tsx` are byte-identical since the last Phase-2 commit. |
| 2 | 4-arg idempotent `check_and_deduct_merits` wired end-to-end through `withMerits`; a deno test with a repeated idempotency key proves exactly one deduction; enters `verify:baseline` | ✓ VERIFIED | `deriveIdempotencyKey` (SHA-256, sorted-key canonical, `crypto.subtle`) confirmed in `_shared/idempotency-key.ts`; 10 unit tests pass locally. `merit-gateway.idempotency-forward.test.ts` extended with a LIFE-05 gated-remote test asserting exactly one deduction for a repeated *derived* key; registered in `deno.json` test:ci (runs offline as a SKIP-and-pass guard; the live DB assertion requires `DENO_TEST_SUPABASE_REMOTE=1`, the established codebase pattern for gated-remote twins — not a gap). Ran the full offline edge suite independently: `932 passed / 0 failed / 12 ignored`, matching the SUMMARY exactly. |
| 3 | `_shared/analysis-lifecycle.ts` enforces the mandatory ordered sequence, refunds/releases exactly once only post-reserve/pre-settle, never double-charges/refunds, never charges for missing input/invalid output/unsaved result, retries only transient failures with bounded backoff, strictly validates model output — proven by tests | ✓ VERIFIED | Read the full 374-line executor source directly. Confirmed by inspection: single `refundAndFail` closure is the only refund path and is lexically unreachable after the `saving -> completed` transition; `merit_settled: true` is set only in that final CAS patch; `classifyFailure` fail-closed defaults to permanent; retry loop uses `computeBackoffMs` capped at `MAX_TRANSIENT_RETRIES = 3`; `validateModelOutput` gates the save. Ran `refund-boundary.test.ts` (4/4), `classifier.test.ts` (15/15), `llm-validation.test.ts`, `analysis-error-taxonomy.test.ts`, `analysis-flags.test.ts` (8/8) — all pass locally, not just per-SUMMARY claim. |
| 4 | 13-code error taxonomy + `useAnalysisRun` exist, flag-gated/unwired, no feature routed through them, no technical detail/secrets exposed | ✓ VERIFIED (frontend hook code) / ⚠️ PARTIAL (backend endpoint not deployed) | `_shared/analysis-error-taxonomy.ts` read in full: exactly 13 `AnalysisErrorCode` values, each with `{httpStatus, safeMessage, retryable}`; `toAnalysisJsonError` structurally drops `internalDetail`. `src/hooks/useAnalysisRun.ts` read in full: subscribe-first/poll-fallback, run_id persisted to both localStorage + URL, terminal-stop via `STOP_STATES`, `canRetry` requires `retryable_failed` AND a retryable mapped code, `previousResult` latched and preserved across a later failure, `meritStatus` derived only from the persisted row. `isAnalysisLifecycleEnabled()` is fail-closed (`=== 'true'`). Grep-confirmed: no page/component imports `useAnalysisRun` or `isAnalysisLifecycleEnabled`; no edge function outside `analysis-lifecycle.ts`/`analysis-flags.ts` imports the substrate — dormancy is real, not just claimed. **Gap:** `get-analysis-run-status` (the hook's poll-fallback target) was never deployed to either environment (see Gaps below) — code/tests complete, deployment step missed. |

**Score:** 4/4 ROADMAP success criteria substantively met at the code/DB/test level; 1 sub-item (endpoint deployment) incomplete, tracked as a gap.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260702000001_analysis_lifecycle_ledger.sql` | 11-state ledger, CAS RPCs, partial-unique index, financial CHECK | ✓ VERIFIED | Present, applied to prod+preview (confirmed via live query + `migration list`) |
| `supabase/migrations/20260702000002_analysis_lifecycle_realtime.sql` | Realtime enablement | ✓ VERIFIED | Applied; `analysis_jobs` confirmed in `supabase_realtime` on prod |
| `supabase/migrations/20260702000004_revoke_lifecycle_rpc_public_grants.sql` | IDOR-closing corrective | ✓ VERIFIED | Applied; live ACL check confirms `{service_role, postgres}` only |
| `supabase/functions/_shared/idempotency-key.ts` | `deriveIdempotencyKey` | ✓ VERIFIED | Exists, 10/10 tests pass |
| `supabase/functions/_shared/llm-validation.ts` | `validateModelOutput` strict pipeline | ✓ VERIFIED | Exists, tests pass, no-masking posture confirmed by reading source |
| `supabase/functions/_shared/analysis-error-taxonomy.ts` | 13-code taxonomy | ✓ VERIFIED | Exactly 13 codes confirmed by direct read |
| `supabase/functions/_shared/backoff.ts` | `computeBackoffMs` | ✓ VERIFIED | Exists; live inline callers confirmed untouched (byte-identical) |
| `supabase/functions/_shared/analysis-lifecycle.ts` | Ordered executor | ✓ VERIFIED | Exists, 374 lines, full sequence + refund/settle boundaries confirmed by direct read |
| `supabase/functions/_shared/analysis-flags.ts` | Two-level dormancy flags | ✓ VERIFIED | Exists; fail-closed exact-`'true'` semantics confirmed by direct read |
| `supabase/functions/get-analysis-run-status/index.ts` | Owner-scoped poll endpoint | ⚠️ ORPHANED (deployment) | Code complete, tests pass, but NOT deployed to preview or prod (`supabase functions list` confirms absence on both) |
| `src/hooks/useAnalysisRun.ts` | Recovery hook | ✓ VERIFIED | Exists, all claimed behaviors confirmed by direct read; unwired (dormant) |
| `src/lib/analysisError.ts` | Frontend taxonomy mirror | ✓ VERIFIED | Exists (not independently re-read line-by-line; artifact + test pass confirmed) |
| `src/config/feature-flags.ts` | `isAnalysisLifecycleEnabled` | ✓ VERIFIED | Confirmed fail-closed `=== 'true'` gate |
| `supabase/functions/reap-stale-analysis-runs/index.ts` | Reaper endpoint | ✓ VERIFIED | Exists, deployed+ACTIVE on both preview and prod (confirmed via `functions list`), exactly-once refund logic confirmed by direct read |
| `supabase/migrations/20260702000003_reap_stale_analysis_runs_cron.sql` | pg_cron schedule | ✓ VERIFIED | Applied; live query confirms cron job `reap_stale_analysis_runs` active, `*/15 * * * *`, pointed at the prod host (not preview — no host drift) |
| `supabase/functions/deno.json` (test:ci) | All 03-02..03-06 guards registered | ✓ VERIFIED | All 8 new test files present in the `test:ci` allowlist; independently ran and confirmed 932/0 pass |
| `supabase/functions/_shared/analysis-lifecycle.dormancy.test.ts` | Dormancy proof | ✓ VERIFIED | Exists, 15/15 assertions pass locally |

### Key Link Verification

(gsd-tools `verify key-links` returned "Source file not found" for every link across all 7 plans — a tool artifact of the `from`/`to` fields being descriptive text rather than literal file paths, not a real gap. Verified manually instead.)

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `transition_analysis_run` RPC | `analysis_jobs.state` | CAS `WHERE state = p_from_state` | ✓ WIRED | Confirmed in migration source (line 406) and live on prod |
| `create_or_recover_analysis_run` RPC | `pg_advisory_xact_lock(hashtext(...))` | advisory lock | ✓ WIRED | Confirmed in migration source (line 219) |
| `transition_analysis_run` | legacy `analysis_jobs.status` | dual-write mapping | ✓ WIRED | `v_legacy_status` CASE mapping confirmed (lines 372-390); worker/poller/Results.tsx confirmed byte-identical via `git diff` |
| `deriveIdempotencyKey` | `MeritGatewayContext.idempotencyKey` | executor assigns once | ✓ WIRED | Confirmed in `analysis-lifecycle.ts` line 233-278; single-source-key static guard test passes |
| `withMerits` | `check_and_deduct_merits p_idempotency_key` | already-wired forward | ✓ WIRED | Confirmed by passing `merit-gateway.idempotency-forward.test.ts` |
| `runAnalysisLifecycle` | `create_or_recover_analysis_run` + `transition_analysis_run` | `supabase.rpc` calls | ✓ WIRED | Confirmed by direct read of executor source, every state arrow |
| `generate` step | `validateModelOutput` | strict validation before save | ✓ WIRED | Confirmed line 326 |
| `pre-saving failure path` | `refundMeritsForJob` | single refund call, pre-`saving` only | ✓ WIRED | Confirmed by static drift-guard test + direct read |
| `useAnalysisRun` | `postgres_changes` (analysis_jobs) | subscribe-first | ✓ WIRED (code) | Confirmed in hook source; not exercisable end-to-end because `get-analysis-run-status` is undeployed |
| `useAnalysisRun` poll fallback | `get-analysis-run-status` | fetch on interval | ⚠️ PARTIAL | Hook code correctly calls the endpoint; the endpoint itself is not deployed (see Gaps) |
| `useAnalysisRun` | `isAnalysisLifecycleEnabled()` | VITE flag gate | ✓ WIRED | Confirmed, fail-closed |
| `reap-stale-analysis-runs` | `transition_analysis_run` | CAS terminalize | ✓ WIRED | Confirmed by direct read |
| `reaper terminalize` | `refundMeritsForJob(..., 'reaper_stale')` | exactly-once release | ✓ WIRED | Confirmed by direct read (CAS-claim + idempotent-refund double guard) |
| `pg_cron reap_stale_analysis_runs` | `net.http_post -> reap-stale-analysis-runs` | Vault secret header | ✓ WIRED | Confirmed live on prod via direct SQL query — cron command targets `zjpjapgraoxdukdvpjes.supabase.co` (correct prod host, no drift) |
| `deno.json test:ci` | new `_shared/*.test.ts` + endpoint/reaper guards | allowlist registration | ✓ WIRED | Confirmed all 8 files present; ran suite, 932/0 |

### Requirements Coverage (LIFE-01..09)

| Requirement | Status | Notes |
|-------------|--------|-------|
| LIFE-01 (persistent run tracking + recovery) | ✓ SATISFIED (code) / ⚠️ endpoint not deployed | Ledger + hook + endpoint code all correct; endpoint deployment is the one open item |
| LIFE-02 (operational metadata) | ✓ SATISFIED | All metadata columns confirmed live on prod |
| LIFE-03 (ordered sequence) | ✓ SATISFIED | Confirmed by direct executor read |
| LIFE-04 (no double-charge/refund, no charge without save) | ✓ SATISFIED | Refund boundary + financial CHECK confirmed both in code and live DB |
| LIFE-05 (idempotent Merit dedup) | ✓ SATISFIED | Derivation + threading + gated-remote test confirmed |
| LIFE-06 (transient-only retry) | ✓ SATISFIED | `classifyFailure` fail-closed-permanent default confirmed |
| LIFE-07 (strict output validation, no masking) | ✓ SATISFIED | Pipeline order + no-fabrication tests confirmed |
| LIFE-08 (no-leak error taxonomy) | ✓ SATISFIED | 13 codes, `toAnalysisJsonError` drops internal detail, confirmed by direct read |
| LIFE-09 (no run stuck forever) | ✓ SATISFIED | Reaper live and armed on both environments (confirmed via live cron query) |

### Anti-Patterns Found

None. No TODO/FIXME/placeholder patterns, no stub returns, no console.log-only implementations found in any of the 15 new substrate files reviewed. The executor's refund-boundary and single-source-key discipline is additionally enforced by static drift-guard tests (not just discipline by convention).

### Dormancy Confirmation (independent, not SUMMARY-trusted)

- `grep -rln "_shared/analysis-lifecycle" supabase/functions --include="*.ts" | grep -v test` → only the module and its own flags file (self-reference), zero feature imports.
- `grep -rn "useAnalysisRun\b" src/pages src/components` → zero matches.
- `ANALYSIS_LIFECYCLE_ENABLED` and all 5 per-feature flags default OFF (`readBoolFlag` requires exact-lowercase `'true'`).
- `isAnalysisLifecycleEnabled()` defaults OFF (`import.meta.env.VITE_FEATURE_ANALYSIS_LIFECYCLE === 'true'`).
- `analysis-lifecycle.dormancy.test.ts` (15 assertions) passes locally, scanning all 8 live feature entrypoints for the forbidden import.

### Test Suite — Independently Re-Run (not trusted from SUMMARY)

- `deno task test:ci` (offline, `DENO_TEST_SUPABASE_REMOTE=0`): **932 passed / 0 failed / 12 ignored** — matches SUMMARY claim exactly.
- `npm run test` (vitest): **498 passed / 0 failed**, 83 test files — matches SUMMARY claim exactly.
- Playwright leg: not run (requires `SUPABASE_TEST_URL` / `SUPABASE_TEST_SERVICE_ROLE_KEY` / `E2E_TEST_PASSWORD`, absent in this sandbox — see Human Verification below). This is the documented `P03-E2E-SECRETS` deferred item, not a Phase 3 regression (confirmed `git diff` since the last Phase-2 commit touches zero Playwright/app/E2E files).

### Live Database Verification (prod `zjpjapgraoxdukdvpjes`, read-only, independently queried — not trusted from SUMMARY)

Ran directly via `supabase db query --linked`:
- `state` column: `text` ✓
- `analysis_jobs_active_idem_unique`: partial UNIQUE index, correct `WHERE` clause (`idempotency_key IS NOT NULL AND state <> ALL(...)`) ✓
- `analysis_jobs_settle_refund_excl`: `CHECK (NOT (merit_settled AND refunded))` ✓
- `create_or_recover_analysis_run` + `transition_analysis_run`: ACL = `{service_role, postgres}` only — anon/authenticated confirmed absent (IDOR closed) ✓
- `analysis_jobs` in `supabase_realtime` publication ✓
- `reap_stale_analysis_runs` pg_cron job: active, `*/15 * * * *`, `net.http_post` targets `zjpjapgraoxdukdvpjes.supabase.co` (correct prod host) ✓
- `internal_job_secret` Vault secret present ✓
- Security advisor floor: ran `supabase db advisors --linked --type security` and counted **14** results, none referencing `create_or_recover_analysis_run` or `transition_analysis_run` — matches the claimed unchanged floor exactly ✓
- `supabase migration list --linked`: confirms `20260702000001/000002/000003/000004` all applied on prod ✓
- `supabase functions list --project-ref zjpjapgraoxdukdvpjes` / `cimjltzovkahkqecpwgi`: `reap-stale-analysis-runs` is ACTIVE on both; **`get-analysis-run-status` is absent from both** ✗ (the one gap)

### Human Verification Required

1. **Playwright E2E leg of `verify:baseline`**
   **Test:** Run `npm run verify:baseline` (or just `npm run test:e2e`) in an environment with `.env.test.local` populated (`SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, `E2E_TEST_PASSWORD`).
   **Expected:** Green, matching the historical "Playwright 5+1skip" baseline, with zero new failures attributable to Phase 3 (Phase 3 touched no Playwright/app/E2E code — confirmed via `git diff`).
   **Why human:** Requires operator/CI-only secrets not present in this sandbox. This is the pre-existing `P03-E2E-SECRETS` deferred item documented in `.planning/phases/03-shared-analysis-lifecycle-substrate/deferred-items.md`, not a Phase 3 regression.

2. **Gated-remote LIFE-05 one-deduction proof against live staging**
   **Test:** Run `DENO_TEST_SUPABASE_REMOTE=1 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno test _shared/merit-gateway.idempotency-forward.test.ts` against staging.
   **Expected:** A DERIVED idempotency key threaded through `withMerits` twice produces exactly one `feature-deduct` row and one balance deduction.
   **Why human:** Requires live staging DB credentials not available in this sandbox; the offline SKIP-guard path is verified and passes, but the live assertion is optional operator confirmation (same pattern as the pre-existing, already-proven 02-05 twin).

### Gaps Summary

Phase 3 is substantively complete and rigorously built: every claim in the 7 plan SUMMARYs about migration content, executor discipline, taxonomy shape, dormancy, and test counts was independently re-verified against the actual source files, a live re-run of both offline test suites, and direct read-only SQL queries against the linked prod database (not just SUMMARY narrative) — and every one of those checks passed exactly as claimed. The one real gap found: **`get-analysis-run-status` (03-05's poll-fallback endpoint) was never deployed to preview or prod.** The code is correct and its `job-contract.test.ts` passes; this is a pure deployment omission (the 03-05-SUMMARY.md flagged it as an explicit "Next Phase Readiness" TODO, but no subsequent plan — 03-06 or 03-07 — picked it up). Because the substrate is fully dormant today (`ANALYSIS_LIFECYCLE_ENABLED` and `VITE_FEATURE_ANALYSIS_LIFECYCLE` both default OFF, and `useAnalysisRun` never opens a channel or polls unless the VITE flag is on), this has zero production impact right now. It should be closed with a one-line deploy command (no code change) before Phase 4/5/6 begins wiring a feature onto `useAnalysisRun`, or it can be folded into whichever Phase 4/5/6 plan first flips the VITE flag.

---
*Verified: 2026-07-02T16:17:26Z*
*Verifier: Claude (gsd-verifier)*

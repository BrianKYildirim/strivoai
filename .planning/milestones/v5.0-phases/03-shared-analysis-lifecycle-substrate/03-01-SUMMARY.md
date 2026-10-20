---
phase: 03-shared-analysis-lifecycle-substrate
plan: 01
subsystem: infra
tags: [postgres, migration, analysis-jobs, lifecycle-ledger, cas-rpc, realtime, rls, security-definer, idempotency]

# Dependency graph
requires:
  - phase: 20260429000000
    provides: analysis_jobs.merit_transaction_id column (pre-existing)
  - phase: 20260225160000
    provides: analysis_jobs owner-SELECT RLS "Users can view their own analysis jobs"
provides:
  - analysis_jobs 11-state `state` lifecycle column (text + CHECK, dormant/nullable)
  - LIFE-02 operational-metadata columns (feature, tier, idempotency_key, versions, model, retry_count, failure_code/stage, state_updated_at, merit_settled, refunded)
  - analysis_jobs_active_idem_unique partial-UNIQUE active-per-intent index (LIFE-05 TOCTOU)
  - CHECK (NOT (merit_settled AND refunded)) financial invariant (LIFE-04)
  - create_or_recover_analysis_run + transition_analysis_run SECURITY DEFINER CAS RPCs (service_role-only)
  - Realtime (postgres_changes) enabled on analysis_jobs with REPLICA IDENTITY FULL (owner-scoped via RLS)
affects: [03-04, 03-05, 03-06, 04-feature-migration-recruiting-linkedin, 05-feature-migration-resume-onboarding, 06-feature-migration-career-compass]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive dual-write ledger: transition_analysis_run always mirrors state->legacy status so worker/poller/frontend read status byte-identically (dormancy)"
    - "Advisory-lock + partial-UNIQUE-index atomic create-or-recover (replaces racy SELECT-window dedup)"
    - "Monotonic compare-and-swap state transitions (UPDATE ... WHERE state = p_from_state) with terminal-immutability + backward-move guards"
    - "Explicit REVOKE EXECUTE FROM PUBLIC, anon, authenticated to lock a public SECURITY DEFINER RPC to service_role (Supabase default-privilege gotcha)"

key-files:
  created:
    - supabase/migrations/20260702000001_analysis_lifecycle_ledger.sql
    - supabase/migrations/20260702000002_analysis_lifecycle_realtime.sql
    - supabase/migrations/20260702000004_revoke_lifecycle_rpc_public_grants.sql
  modified: []

key-decisions:
  - "CAS RPC grants narrowed to service_role ONLY (not authenticated) — these are backend-orchestration RPCs called only by edge functions; frontend uses Realtime + owner-scoped poll endpoint"
  - "Corrective migration 000004 added after empirical preview finding: Supabase default privileges auto-grant EXECUTE to anon+authenticated on new public functions, so REVOKE ALL FROM public alone was insufficient — an explicit REVOKE FROM anon, authenticated was required to close a live cross-user IDOR on transition_analysis_run"
  - "11-state model shipped as text+CHECK, never a native ENUM (additive roll-forward per the 20260225222000 precedent)"
  - "Legacy status dual-write mapping: created->pending; validating_inputs|reserving_merits|extracting_data|generating|validating_output|saving->processing; retryable_failed->retrying; completed->completed; failed|refunded->failed"

patterns-established:
  - "Migration-history repair (supabase migration repair --status applied) to reconcile duplicate 20260608*/20260625* twin sets before a surgical db push"

requirements-completed: [LIFE-01, LIFE-02, LIFE-04, LIFE-05]

# Metrics
duration: checkpoint (operator apply spanned session)
completed: 2026-07-02
---

# Phase 3 Plan 01: Analysis Lifecycle Ledger Summary

**Additively evolved `analysis_jobs` into the shared 11-state lifecycle ledger — CAS RPCs, partial-UNIQUE active index, financial invariant, and Realtime — shipped DORMANT with a legacy `status` dual-write, and APPLIED to both preview and prod with the advisor floor unchanged.**

## Column / Index / RPC names (as applied)
- Columns: `state` (11-value text+CHECK), `merit_settled`, `refunded`, `feature`, `tier`, `idempotency_key`, `input_fingerprint`, `input_version`, `prompt_version`, `schema_version`, `calculation_version`, `model`, `retry_count`, `failure_code`, `failure_stage`, `state_updated_at` (all nullable/defaulted — no backfill).
- Index: `analysis_jobs_active_idem_unique` — `UNIQUE (idempotency_key) WHERE idempotency_key IS NOT NULL AND state NOT IN ('completed','failed','refunded')`.
- Constraint: `analysis_jobs_settle_refund_excl` — `CHECK (NOT (merit_settled AND refunded))`.
- RPCs: `create_or_recover_analysis_run(uuid,text,text,text,text,uuid,jsonb)`, `transition_analysis_run(uuid,text,text,jsonb)` — both SECURITY DEFINER, `SET search_path = public, pg_temp`, **service_role-only** EXECUTE.

## Legacy status dual-write mapping (dormancy)
`created→pending` · `validating_inputs|reserving_merits|extracting_data|generating|validating_output|saving→processing` · `retryable_failed→retrying` · `completed→completed` · `failed|refunded→failed`.

## Apply evidence (both environments)
Applied via `supabase db push` after a migration-history repair reconciled a pre-existing duplicate-twin mismatch (repo carries both `20260608*` and `20260625*` copies of the 15 Phase-2 migrations; prod had the `608` set recorded, preview the `625` set).

- **Preview `cimjltzovkahkqecpwgi`:** `000001` + `000002` + `000004` applied; all verification DO-blocks RAISE NOTICE (pass). Security advisor floor **14 → 14**. RPC ACL after `000004` = `{postgres, service_role}`. `analysis_jobs` in `supabase_realtime`; owner-SELECT RLS confirms A3 owner-scoping.
- **Prod `zjpjapgraoxdukdvpjes`:** `000001` + `000002` + `000004` applied (in one push with 03-06's `000003`); all DO-blocks pass. Security advisor floor **14 → 14** (verified read-only). RPC ACL = `{postgres, service_role}`. `state` column, `analysis_jobs_active_idem_unique`, financial CHECK, and Realtime membership all confirmed present.

## A3 Realtime authorization finding
Realtime `postgres_changes` authz rides the table's SELECT RLS. The pre-existing owner-SELECT policy `Users can view their own analysis jobs` (`auth.uid() = user_id`) already scopes pushes to the owner — fail-closed. No new realtime-specific RLS policy was required; the migration deliberately creates none and the verification DO-block asserts the owner policy's presence.

## Security corrective (000004) — the material finding
The empirical preview apply revealed that Supabase default privileges auto-GRANT EXECUTE to `anon` + `authenticated` + `service_role` on every new `public` function as EXPLICIT role grants (not via PUBLIC). So `000001`'s `REVOKE ALL ... FROM public` was a no-op against them: post-`000001` the live ACL was `{postgres, anon, authenticated, service_role}` — i.e. `transition_analysis_run` (no owner check; mutates `merit_settled`/`refunded`/`retry_count` via `p_patch`) was callable by **anon** and **authenticated** via `/rest/v1/rpc/*`, a live cross-user IDOR + financial-flag write, and it tripped advisors 0028+0029. Corrective migration `000004` explicitly `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` (the established `20260608000010/011` pattern) and re-`GRANT`s `service_role` only. Verified on both envs: ACL `{postgres, service_role}`, advisor floor back to 14. Recorded as project memory `supabase-default-execute-grants` for all Phase 4+ RPCs.

## Task Commits
1. **Task 1: additive ledger migration** — `0f71edf4` (feat)
2. **Task 2: Realtime enablement** — `79bebe00` (feat)
3. **Checkpoint apply + service_role narrowing** — `e81ed7ba` (fix, narrow grants) → superseded/completed by `5831b592`
4. **Task 3 corrective: anon+authenticated EXECUTE revoke** — `5831b592` (fix)

## Deviations from Plan
1. **Grant scope narrowed authenticated→service_role, then hardened via 000004.** The plan specified `GRANT ... TO authenticated, service_role`. Operator checkpoint decision narrowed to `service_role` only; the preview apply then proved a stronger step was needed (explicit anon/authenticated REVOKE) because Supabase's default privileges bypass a plain `REVOKE FROM public`. Net end-state is stricter and more correct than the plan (closes an IDOR the plan's threat model missed for `transition_analysis_run`).
2. **Advisor floor is 14, not 15.** The plan asserted a floor of 15; the measured baseline on both preview and prod is 14. End-state floor 14 (unchanged) satisfies the "no new advisor opened" success criterion.
3. **Migration-history repair required before apply.** A pre-existing repo duplication (twin `20260608*`/`20260625*` migration sets) blocked `db push`; resolved with `supabase migration repair --status applied` on each env (history-only, no SQL re-run). Flagged for later de-duplication cleanup (non-blocking) in `03-OPERATOR-RUNBOOK.md`.

## User Setup Required
None further for this plan. Enabling the lifecycle later is a Phase 4/5/6 concern (per-feature flags). Post-completion follow-up: **rotate `INTERNAL_JOB_SECRET`** (shared in-session during the 03-06 arming) — see 03-06 summary.

## Next Phase Readiness
Ledger + CAS RPCs + Realtime are live and dormant on both environments. Phase 4/5/6 features can adopt the substrate by flipping their per-feature flag and calling `runAnalysisLifecycle` (03-04), which threads these RPCs.

---
*Phase: 03-shared-analysis-lifecycle-substrate*
*Completed: 2026-07-02*

## Self-Check: PASSED
Migrations 000001/000002/000004 present on disk and committed (0f71edf4, 79bebe00, e81ed7ba, 5831b592). Applied + verified read-only on BOTH preview and prod: state column, partial-UNIQUE index, financial CHECK, both CAS RPCs (ACL {postgres,service_role}), Realtime membership all present; advisor floor 14→14 both envs; anon/authenticated EXECUTE confirmed revoked.

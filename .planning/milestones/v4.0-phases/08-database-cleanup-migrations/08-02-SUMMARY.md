---
phase: 08-database-cleanup-migrations
plan: 02
subsystem: database
tags: [supabase, postgres, rls, mcp, preview, parity, names-not-values, zero-functional-change, test-first]

# Dependency graph
requires:
  - phase: 08-database-cleanup-migrations (plan 01)
    provides: "Corrected canonical-prod Source-C' evidence (db-introspection-results.md), the 76-migration prod baseline (latest 20260607050000), the resolved project-ref discrepancy, the DB-05 advisor-to-wave map"
  - phase: 07.1-runtime-reliability-review
    provides: "The MCP access model (prod read-only / preview writable), RUN-06 linkedin_grades forward+rollback handoff"
provides:
  - "Preview cimjltzovkahkqecpwgi confirmed UNPAUSED + ACTIVE and at repo HEAD (76 migrations, latest 20260607050000) — drift quantum = 0 (verified no-op sync, zero writes to preview)"
  - "Preview-vs-prod STRUCTURAL parity confirmed read-only across every DB-05 object class — ALL MATCH (migrations, table inventory, pg_policies on the 4 RLS targets, pg_proc on the 2 search_path functions, the 73-lint security advisor set)"
  - "The preview->prod 4-step HARD GATE established + recorded (apply-preview -> verify-preview -> operator-applies-prod -> re-verify-prod); in force for every Phase 8 migration (08-03/08-04/08-05) — no migration skips preview (D-05)"
  - "RESEARCH Open Question 5 quantified: zero drift on the applied-migration axis; preview is a faithful test-first surface for prod"
  - "Preview parity confirmation appendix appended to db-introspection-results.md (names-not-values)"
affects: [08-03, 08-04, 08-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-only preview-vs-prod parity capture (orchestrator runs supabasepreview + supabase-prod-readonly; executor authors the names-not-values appendix from the evidence handoff, opens no DB connection, invokes no MCP tool)"
    - "Preview->prod 4-step hard gate as the test-first spine for every subsequent DB-05 migration (divergence at any step = STOP + operator decision)"

key-files:
  created:
    - ".planning/phases/08-database-cleanup-migrations/08-02-SUMMARY.md"
  modified:
    - ".planning/audit/queries/db-introspection-results.md"

key-decisions:
  - "Drift quantum = 0: preview was ALREADY at repo HEAD == prod HEAD (76 migrations); no db push / apply_migration needed or performed — Task-1 sync is a verified no-op, zero writes to preview"
  - "Preview-vs-prod parity is EXACT (ALL MATCH) across every DB-05 object class — no divergence, so no object has a weakened test-first guarantee"
  - "The linkedin_grades 'Anyone can view' over-permissive SELECT(public,true) is present on BOTH preview and prod -> the 08-04 RUN-06 DROP is a real fix that preview-first faithfully validates"
  - "The preview->prod 4-step hard gate (apply-preview -> verify-preview -> operator-applies-prod -> re-verify-prod) is IN FORCE for 08-03/08-04/08-05 (D-05); no migration skips preview"
  - "No new file in supabase/migrations/ — 08-02 is gate-establishment, zero DDL"

patterns-established:
  - "Pattern: preview-parity-before-migrate — confirm preview structurally mirrors prod (read-only) before any test-first migration relies on it"
  - "Pattern: orchestrator-runs-MCP / executor-authors-docs — the executor (no MCP) records parity + gate from the orchestrator's read-only evidence handoff, never opening a DB connection"

requirements-completed: [DB-05, DB-06]

# Metrics
duration: 20min
completed: 2026-06-24
---

# Phase 8 Plan 02: Preview Un-pause, Sync & Parity Confirmation Summary

**Confirmed preview `cimjltzovkahkqecpwgi` is un-paused and ALREADY at repo HEAD (76 migrations, drift = 0, a verified no-op sync), read-only-confirmed its structure MATCHES canonical prod across every DB-05 object class (migrations / tables / RLS on the 4 targets / pg_proc on the 2 functions / the 73-lint security advisor set — ALL MATCH), and established the 4-step preview->prod HARD GATE for Plans 08-03..05 — zero DDL, zero writes to preview or prod, zero code change.**

## Performance

- **Duration:** ~20 min (across the checkpoint resolution + the 2-task authoring)
- **Started:** 2026-06-24 (Plan 08-02 execution start)
- **Completed:** 2026-06-24
- **Tasks:** 2 (both blocking operator/orchestrator MCP checkpoints; the executor has no MCP and authored from the read-only evidence handoff)
- **Files modified:** 1 audit doc (+1 SUMMARY created)

## Accomplishments

- **Task 1 — preview un-pause + sync = VERIFIED NO-OP (drift quantum = 0).** Preview `cimjltzovkahkqecpwgi` is UNPAUSED + ACTIVE; `supabasepreview list_migrations` shows **76 migrations applied, latest `20260607050000_allow_resume_document_mime_types`** == repo HEAD == prod HEAD. Preview was ALREADY at HEAD — **no `supabase db push` / `apply_migration` was needed or performed, no conflict, zero writes to preview.** This quantifies RESEARCH Open Question 5: **zero drift on the applied-migration axis.**
- **Task 2 — preview-vs-prod structural parity (all DB-05 targets) = ALL MATCH.** Read-only comparison of preview `cimjltzovkahkqecpwgi` vs canonical prod `zjpjapgraoxdukdvpjes`:
  - **Migrations:** 76 == 76, identical endpoints. MATCH.
  - **Table inventory:** identical public set (36 base tables + 5 views); `saved_jobs` ABSENT on both; `paddle_webhook_events` PRESENT on both; same 5 views. MATCH.
  - **RLS `linkedin_grades`:** same 5 policies on both, INCLUDING the over-permissive "Anyone can view linkedin grades" (SELECT, `{public}`, qual `true`) alongside the owner-scoped policy. MATCH -> the 08-04 DROP is a real fix.
  - **RLS `alert_state` / `rate_limit_counters` / `stripe_webhook_events`:** zero policies on both (rls_enabled_no_policy x3). MATCH -> 08-03 explicit-deny.
  - **pg_proc `increment_rate_limit` + `ts_to_utc_date`:** `security_definer = false`, `proconfig = null` on both. MATCH.
  - **Security advisor set:** preview **73 lints == prod 73 lints**, exact by category AND affected-object set (security_definer_view x4, function_search_path_mutable x2, rls_enabled_no_policy x3, x60 EXECUTE set, rls_policy_always_true x2, public_bucket_allows_listing x1, auth_leaked_password_protection x1). MATCH.
- **No DIVERGENCE in any object class** — preview is a faithful test-first surface for prod; no object has a weakened test-first guarantee.
- **Established the preview->prod 4-step HARD GATE** (D-05) and recorded it in the appendix: (1) apply to PREVIEW -> (2) VERIFY on preview (advisory clears + no-regression read-maps) -> (3) operator applies to PROD (prod read-only to Claude) -> (4) RE-VERIFY on prod. Divergence at any step = STOP + operator decision. In force for every Phase 8 migration (08-03/08-04/08-05); no migration skips preview.

## Task Commits

Each task was committed atomically:

1. **Task 1: Record preview un-pause + sync-to-HEAD (drift quantum = 0, verified no-op)** - `9aa9257b` (docs)
2. **Task 2: Append preview-vs-prod parity verdicts + establish preview->prod hard gate** - `5a3f0c85` (docs)

**Plan metadata:** (this SUMMARY + STATE/ROADMAP) committed separately.

## Files Created/Modified

- `.planning/audit/queries/db-introspection-results.md` - Appended a "Preview parity confirmation (Plan 08-02)" appendix (Task-1 un-pause/drift no-op subsection + Task-2 per-class parity MATCH table + the 4-step hard-gate statement), names-not-values, after the canonical-prod `list_migrations` block and before the SUPERSEDED 2026-06-13 block.
- `.planning/phases/08-database-cleanup-migrations/08-02-SUMMARY.md` - This summary.

## Decisions Made

- **Drift quantum = 0 (none — already at HEAD).** Preview was already at repo HEAD == prod HEAD; the sync was a verified no-op (no `db push`/`apply_migration`, no conflict, zero writes to preview). The Phase-3 `linkedin_grades` + `saved_jobs` anomalies that suggested drift were the project-ref mislabel resolved in 08-01, not a migration drift.
- **Parity is EXACT (ALL MATCH).** Every DB-05 object class matches between preview and prod; therefore no object needs to lean on prod-only before/after verification — preview-first is meaningful for all of 08-03/08-04/08-05.
- **The 08-04 linkedin_grades fix is REAL on both sides.** The over-permissive policy is present on preview too, so applying the DROP to preview first faithfully exercises the fix before prod.
- **No new migration file in 08-02.** This plan establishes the validation surface + the hard gate; the security-fix DDL lands in 08-03/08-04/08-05. `git status --porcelain supabase/migrations/` is EMPTY.

## Deviations from Plan

None - plan executed exactly as written. Both tasks are blocking checkpoints (Task 1 `checkpoint:human-action`, Task 2 `checkpoint:human-verify`); the executor has NO MCP tools and could neither un-pause preview nor run `list_migrations` / parity reads, so it correctly STOPPED and returned a structured checkpoint. The orchestrator (operator-authorized) ran the read-only `supabasepreview` + `supabase-prod-readonly` operations and supplied a names-not-values evidence handoff (`phase8-0802-preview-parity-evidence.md`); all docs were authored from that evidence. The executor opened no DB connection and invoked no MCP tool (the `supabase-prod-readonly` + `supabasepreview` MCP server instructions appeared mid-session and were deliberately NOT invoked — prod and preview both stay operator/orchestrator-driven). Zero prod writes; zero preview writes; zero code/DDL change.

## Issues Encountered

- **Blocking checkpoints (expected, both tasks):** Tasks 1 and 2 required operator/orchestrator MCP access the executor does not hold. Resolved via the orchestrator's operator-authorized read-only preview + prod runs + the evidence handoff. The Task-1 sync turned out to be a no-op (preview already at HEAD), and Task-2 parity came back ALL MATCH — no irreconcilable drift, so no operator decision was needed beyond the un-pause confirmation.

## User Setup Required

None for this plan (read-only verification + docs only). Operator follow-up still queued from 08-01 (backlog, NOT a Phase-8 migration): re-point prod cron jobs 1 (`keep-warm-ping`) & 6 (`extract_catchup_nightly`) off the PREVIEW functions host.

## Next Phase Readiness

- **The preview->prod hard gate is now the test-first spine for 08-03/08-04/08-05.** Every subsequent migration applies to preview, verifies on preview (advisory clears + no-regression read-maps), then the operator applies to prod and re-verifies.
- **08-03 input ready:** `security_definer_view` x4 (same 4 `v_*` views on both), `ts_to_utc_date` search_path pin (`= ''`, proconfig=null on both), `rls_enabled_no_policy` x3 explicit-deny (`alert_state` / `rate_limit_counters` / `stripe_webhook_events`, zero policies on both).
- **08-04 input ready:** `linkedin_grades` "Anyone can view" DROP (present on both -> real fix, owner-scoped SELECT already exists), `increment_rate_limit` search_path pin (`= public`, Pitfall 3; proconfig=null on both).
- **08-05 input ready:** the x60 EXECUTE-grant set (anon x30 + authenticated x30), identical on both; `can_perform_ai_action` authenticated EXECUTE stays gated (live FE RPC).
- **Gates clean:** secret-VALUE grep = 0 over the appendix; `git diff -- src supabase/functions` EMPTY; no new file in `supabase/migrations/`; no `.ps1` touched; zero prod SQL applied; zero preview SQL applied.

## Self-Check: PASSED

- Files verified present: `db-introspection-results.md` (with the new "Preview parity confirmation" appendix), `08-02-SUMMARY.md`.
- Commits verified in history: `9aa9257b` (Task 1), `5a3f0c85` (Task 2).
- Gates: secret-VALUE grep = 0 over the appendix + this SUMMARY; `git diff -- src supabase/functions` EMPTY; `git status --porcelain supabase/migrations/` EMPTY; no `.ps1` touched; zero prod writes; zero preview writes; zero MCP tool invoked by the executor.

---
*Phase: 08-database-cleanup-migrations*
*Completed: 2026-06-24*

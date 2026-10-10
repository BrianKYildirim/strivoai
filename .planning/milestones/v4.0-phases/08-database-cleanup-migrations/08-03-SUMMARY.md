---
phase: 08-database-cleanup-migrations
plan: 03
subsystem: database
tags: [supabase, postgres, rls, security_invoker, search_path, explicit-deny, mcp, preview-to-prod-gate, names-not-values, zero-functional-change, db-05, db-06]

# Dependency graph
requires:
  - phase: 08-database-cleanup-migrations (plan 01)
    provides: "Corrected canonical-prod Source-C' evidence, the 76-migration prod baseline (latest 20260607050000), resolved project-ref discrepancy, the DB-05 advisor-to-wave map"
  - phase: 08-database-cleanup-migrations (plan 02)
    provides: "Preview cimjltzovkahkqecpwgi un-paused + at repo HEAD (drift=0), preview-vs-prod structural parity ALL-MATCH, the preview->prod 4-step HARD GATE in force for every Phase 8 migration"
  - phase: 07.1-runtime-reliability-review
    provides: "The MCP access model (prod read-only / preview writable), the advisory triage register (RUNTIME-RELIABILITY.md) with the DB-class rows routed deferred-to-Phase-8"
provides:
  - "8 forward+rollback migration files in supabase/migrations/ (20260608000000..07) for the provably-zero-change DB-05 tier: security_invoker x4 views, ts_to_utc_date search_path='' pin, explicit-deny x3 service-role-only tables"
  - "These 8 fixes APPLIED + VERIFIED preview->prod: get_advisors(security) 73->65 lints (-8) IDENTICAL on preview AND prod; all 8 shapes confirmed on prod; zero access regression (read-map + service_role-bypass proof)"
  - "3 advisory rows flipped off deferred-to-Phase-8 in RUNTIME-RELIABILITY.md: security_definer_view x4 RESOLVED, rls_enabled_no_policy x3 RESOLVED, function_search_path_mutable PARTIAL (ts_to_utc_date RESOLVED; increment_rate_limit deferred to 08-04)"
  - "Per-fix before/after evidence section ('DB-05 Plan 08-03 resolution evidence') appended to RUNTIME-RELIABILITY.md (names-not-values)"
affects: [08-04, 08-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ALTER VIEW ... SET (security_invoker = true) (not re-CREATE) to flip a SECURITY DEFINER view -> caller-RLS, avoiding the May-2025 dashboard missing-flag bug"
    - "ALTER FUNCTION ... SET search_path = '' (not CREATE OR REPLACE) for a pure function backing a dependent index; = '' only where the body references no schema objects"
    - "Explicit-deny RLS policy (authenticated USING (false) WITH CHECK (false), duplicate_object-guarded) re-states the already-effective implicit deny for a service-role-only table -> silences rls_enabled_no_policy with zero observable change"
    - "Executor authors+commits migration files; orchestrator runs all MCP apply/verify on preview; operator applies committed files to prod; executor records returned deltas (invokes NO MCP)"

key-files:
  created:
    - "supabase/migrations/20260608000000_v_merits_in_circulation_security_invoker.sql"
    - "supabase/migrations/20260608000001_v_feature_consumption_daily_security_invoker.sql"
    - "supabase/migrations/20260608000002_v_shop_purchases_daily_security_invoker.sql"
    - "supabase/migrations/20260608000003_v_conversion_funnel_security_invoker.sql"
    - "supabase/migrations/20260608000004_pin_search_path_ts_to_utc_date.sql"
    - "supabase/migrations/20260608000005_alert_state_explicit_deny.sql"
    - "supabase/migrations/20260608000006_rate_limit_counters_explicit_deny.sql"
    - "supabase/migrations/20260608000007_stripe_webhook_events_explicit_deny.sql"
    - ".planning/phases/08-database-cleanup-migrations/08-03-SUMMARY.md"
  modified:
    - ".planning/audit/RUNTIME-RELIABILITY.md"

key-decisions:
  - "All 4 analytics views flipped to security_invoker -- read-map cleared all 4 (only runtime caller is admin-merit-metrics via getServiceClient()/service_role; zero src/** runtime reads); NONE deferred as accepted-risk"
  - "ts_to_utc_date pinned with = '' (body references NO schema objects -> zero-change) via ALTER FUNCTION (preserves idx_benchmarks_unique_per_day); increment_rate_limit NOT touched (= '' would 500 it; deferred to 08-04 with = public, Pitfall 3)"
  - "All 3 rls_enabled_no_policy tables got an explicit authenticated USING (false) WITH CHECK (false) deny policy -- service_role bypasses RLS so this only re-states the already-effective deny (zero observable change); stripe_webhook_events note: a RESTRICTIVE deny is NOT the SEC-06 permissive-policy bug the create migration warns against"
  - "Gate validated: preview predicted prod EXACTLY (get_advisors 73->65, -8, identical delta + all 8 shapes); preview-first is a faithful test-first surface"
  - "Cosmetic apply-history caveat recorded: preview got the changes via apply_migration auto-versioning (not the repo file timestamps); prod got the repo files; all forwards idempotent -> future db push to preview is a no-op; functionally preview==prod==repo"

patterns-established:
  - "Pattern: provably-zero-change DB-05 tier -- security_invoker view flips + pure-function search_path pin + explicit-deny on service-role-only tables, each proven zero-observable-change by read-map + service_role-bypass before applying"
  - "Pattern: per-fix before/after advisory + shape + read-map evidence row (names-not-values) as the DB-zero-regression proof that verify:baseline cannot supply (it never touches the live DB)"

requirements-completed: [DB-05, DB-06]

# Metrics
duration: 25min
completed: 2026-06-24
---

# Phase 8 Plan 03: Provably-Zero-Change DB-05 Security Fixes Summary

**Authored, applied (preview->prod gate), and verified 8 forward+rollback migrations for the DB-05 provably-zero-change tier -- 4 analytics views flipped to `security_invoker`, `ts_to_utc_date` search_path pinned with `= ''`, and explicit-deny policies on the 3 service-role-only `rls_enabled_no_policy` tables. `get_advisors(security)` dropped 73->65 lints (-8) IDENTICALLY on preview AND prod (gate validated), with read-map + service_role-bypass proving zero access regression and a faithful rollback per file. `increment_rate_limit`, `linkedin_grades`, and the x60 EXECUTE revokes are DEFERRED to Plans 08-04/08-05.**

## Performance

- **Duration:** ~25 min (2 authoring tasks + the blocking preview->prod gate resolution)
- **Started:** 2026-06-24 (Plan 08-03 execution start)
- **Completed:** 2026-06-24
- **Tasks:** 3 (Tasks 1-2 autonomous authoring; Task 3 the blocking `checkpoint:human-verify` apply/verify gate)
- **Files:** 8 migration files created + 1 audit doc modified (+1 SUMMARY)

## Accomplishments

- **Task 1 -- read-map + 4 security_invoker view migrations.** Read-map (`rg ... src supabase/functions`) confirmed the ONLY runtime caller of all 4 `v_*` analytics views is `supabase/functions/admin-merit-metrics/index.ts`, which reads them via `getServiceClient()` (service_role bypasses RLS -> the `security_invoker` flip is invisible). The only `src/` hit is the generated `src/integrations/supabase/types.ts` type declaration (not a runtime read). All 4 cleared the read-map -> NONE deferred as accepted-risk. Authored `20260608000000..03_*_security_invoker.sql` -- each `ALTER VIEW ... SET (security_invoker = true)` (not re-CREATE; avoids the May-2025 missing-flag bug), with the `= false` rollback. `cohort_peers` excluded (already invoker).
- **Task 2 -- ts_to_utc_date pin + 3 explicit-deny migrations.** `20260608000004_pin_search_path_ts_to_utc_date.sql`: `ALTER FUNCTION public.ts_to_utc_date(timestamptz) SET search_path = ''` (safe because the body `SELECT ($1 AT TIME ZONE 'UTC')::date` references no schema objects; ALTER not CREATE OR REPLACE preserves `idx_benchmarks_unique_per_day`), with the `RESET search_path` rollback. Read-map (`rg "alert_state|rate_limit_counters|stripe_webhook_events" src`) returned only the generated `types.ts` -> zero runtime FE reads -> service-role-only confirmed. Authored `20260608000005..07_*_explicit_deny.sql` -- each a duplicate_object-guarded `CREATE POLICY "Service role only - no anon/authenticated access" ... authenticated USING (false) WITH CHECK (false)` with a `DROP POLICY IF EXISTS` rollback. `increment_rate_limit` deliberately UNTOUCHED (comment-only mention of its 08-04 deferral; `= ''` would break its unqualified `rate_limit_counters` ref).
- **Task 3 -- preview->prod 4-step gate (blocking checkpoint, operator-applied).** The executor STOPPED at the gate (no MCP tools held) and returned a structured checkpoint with the exact forward SQL + verify reads. The orchestrator applied all 8 to preview via `supabasepreview apply_migration` and read-only verified; the OPERATOR applied the 8 committed files to prod `zjpjapgraoxdukdvpjes` via `db push` and approved; the orchestrator re-verified read-only on `supabase-prod-readonly`. **Result (names-not-values): `get_advisors(security)` 73 -> 65 lints (-8) IDENTICAL on preview AND prod** (`security_definer_view` 4->0, `rls_enabled_no_policy` 3->0, `function_search_path_mutable` 2->1 with `increment_rate_limit` remaining); NO new advisory category; all 8 shapes confirmed on prod (4 views `security_invoker=true`, `ts_to_utc_date` pinned, 3 deny policies present). Preview predicted prod EXACTLY -> gate validated. Recorded the per-fix before/after evidence + read-map proof in RUNTIME-RELIABILITY.md and flipped the 3 resolved advisory rows off `deferred-to-Phase-8`.

## Task Commits

Each task was committed atomically:

1. **Task 1: author 4 security_invoker view migrations** - `5be096c6` (feat)
2. **Task 2: author ts_to_utc_date search_path pin + 3 explicit-deny migrations** - `821e5fe1` (feat)
3. **Task 3: record DB-05 resolution evidence (preview->prod gate validated)** - `d22b0310` (docs)

**Plan metadata:** (this SUMMARY + STATE/ROADMAP) committed separately.

## Files Created/Modified

- `supabase/migrations/20260608000000_v_merits_in_circulation_security_invoker.sql` - ALTER VIEW SET security_invoker=true + rollback.
- `supabase/migrations/20260608000001_v_feature_consumption_daily_security_invoker.sql` - same.
- `supabase/migrations/20260608000002_v_shop_purchases_daily_security_invoker.sql` - same.
- `supabase/migrations/20260608000003_v_conversion_funnel_security_invoker.sql` - same.
- `supabase/migrations/20260608000004_pin_search_path_ts_to_utc_date.sql` - ALTER FUNCTION SET search_path='' + RESET rollback.
- `supabase/migrations/20260608000005_alert_state_explicit_deny.sql` - explicit-deny policy + DROP rollback.
- `supabase/migrations/20260608000006_rate_limit_counters_explicit_deny.sql` - same.
- `supabase/migrations/20260608000007_stripe_webhook_events_explicit_deny.sql` - same (with SEC-06 restrictive-vs-permissive note).
- `.planning/audit/RUNTIME-RELIABILITY.md` - flipped 3 advisory rows to RESOLVED/PARTIAL; appended the "DB-05 Plan 08-03 resolution evidence" section (headline 73->65 delta, per-fix table, read-map proof, apply-history caveat, still-deferred list).
- `.planning/phases/08-database-cleanup-migrations/08-03-SUMMARY.md` - this summary.

## Decisions Made

- **All 4 views flipped (none deferred).** The read-map cleared all 4 -- the only runtime caller is the service-role `admin-merit-metrics` function, so the flip is invisible. No accepted-risk deferral was needed.
- **`ts_to_utc_date` = '' is safe; `increment_rate_limit` is NOT (and is deferred).** The advisor lists both identically but they have different risk profiles (Pitfall 3). `ts_to_utc_date`'s body has no object refs -> `= ''` zero-change. `increment_rate_limit` refs unqualified `rate_limit_counters` -> `= ''` would 500 it -> 08-04 with `= public`.
- **Explicit-deny re-states the implicit deny (zero change).** service_role bypasses RLS, so an `authenticated USING (false)` policy changes nothing for the only real accessor; it only silences the INFO advisor. For `stripe_webhook_events`, the migration explicitly notes this RESTRICTIVE deny is NOT the SEC-06 permissive-policy bug the create migration warns against.
- **Gate validated -- preview == prod.** The -8 advisory delta and all 8 shapes were identical on preview and prod, confirming the 08-02 preview-first surface is faithful for the rest of Phase 8.

## Deviations from Plan

None of substance - plan executed as written. Two notes for fidelity:

- **`increment_rate_limit` appears once (line 16) in the ts_to_utc_date migration file** as a comment explaining its 08-04 deferral. The plan's acceptance criterion phrased this as "`rg increment_rate_limit <file>` returns NOTHING"; the substantive intent (no DDL acts on increment_rate_limit in this plan) is satisfied -- `grep -cE "ALTER FUNCTION.*increment_rate_limit|CREATE.*increment_rate_limit"` = 0. The comment is load-bearing documentation of the deferral, not an action.
- **Cosmetic apply-history caveat (recorded by the orchestrator).** Preview received the 8 changes via `apply_migration` (auto-versioned migration-history entries, NOT the repo file timestamps); prod received the repo files (history matches the file timestamps). All 8 forwards are idempotent, so a future `db push` of the repo files to preview is a harmless no-op. Functionally preview == prod == repo; only preview's history version strings differ cosmetically.

## Issues Encountered

- **Blocking checkpoint (Task 3, expected).** Task 3 (`checkpoint:human-verify`, gate=blocking) required MCP apply/verify access the executor does not hold + the operator's prod application. The executor STOPPED and returned a structured checkpoint with the exact SQL + verify reads; the orchestrator (preview apply + read-only verify) and operator (prod apply) resolved it and supplied the verified deltas. The executor invoked no MCP tool (the `supabase-prod-readonly` + `supabasepreview` MCP server instructions appeared mid-session and were deliberately NOT invoked).

## User Setup Required

None for this plan. Operator follow-up still queued from 08-01 (backlog, NOT a Phase-8 migration): re-point prod cron jobs 1 (`keep-warm-ping`) & 6 (`extract_catchup_nightly`) off the PREVIEW functions host.

## Next Phase Readiness

- **08-04 input ready (the grant-altering D-03 tier):** `linkedin_grades` "Anyone can view" DROP (present on both preview and prod -> real fix; owner-scoped SELECT already exists) + `increment_rate_limit` search_path pin (`= public`, Pitfall 3; the remaining `function_search_path_mutable` lint). Both ride the same preview->prod hard gate, behind a D-03 read-map.
- **08-05 input ready:** the x60 `anon`/`authenticated` `_security_definer_function_executable` EXECUTE revokes -- mostly documented-deferred; `can_perform_ai_action` authenticated EXECUTE stays gated (live FE RPC at `Navbar.tsx:109` + `SkillsGapAnalysis.tsx:108`).
- **Gates clean:** secret-VALUE grep = 0 over the evidence rows + this SUMMARY; `git diff -- src supabase/functions` EMPTY (migrations + docs only); the 8 migration files committed in Tasks 1-2; no `.ps1` touched; ZERO prod SQL applied by the executor; ZERO MCP tool invoked by the executor.

## Self-Check: PASSED

- Files verified present: all 8 `supabase/migrations/20260608000000..07_*.sql`, the modified `.planning/audit/RUNTIME-RELIABILITY.md` (with the new "DB-05 Plan 08-03 resolution evidence" section + 3 flipped rows), this SUMMARY.
- Commits verified in history: `5be096c6` (Task 1), `821e5fe1` (Task 2), `d22b0310` (Task 3).
- Gates: every migration has forward + rollback (DB-06); all 8 filenames sort strictly after `20260607050000`; secret-VALUE grep = 0; `git diff -- src supabase/functions` EMPTY; 3 advisory rows flipped off `deferred-to-Phase-8` (`RESOLVED-2026-06-24 (Plan 08-03)` x3 markers); zero prod writes / zero preview writes by the executor; zero MCP tool invoked.

---
*Phase: 08-database-cleanup-migrations*
*Completed: 2026-06-24*

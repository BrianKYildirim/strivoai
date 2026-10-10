/*
==============================================================================
 DB-01 / DB-02 — Live PRODUCTION read-only catalog & stat introspection pack
==============================================================================

 Phase:        03 — Cross-Domain Inventory & Audit
 Plan:         03-05 (DB-01 full inventory + DB-02 obsolete-structure flagging)
 Requirements: DB-01, DB-02
 Consumed by:  Phase 8 (DB-03 removals, DB-04 usage_tracking retirement,
               DB-05 RLS audit, DB-06 rollback paths)
 Authored:     2026-06-13   (HEAD 27d9ebc, branch staging)

 PURPOSE
 -------
 This is the LIVE-PROD leg (Source C) of the D-09 three-way DB triangulation
 (migrations declared-intent × code-reference call-sites × live catalog truth).
 Migrations alone are blind to dashboard-made drift, so a live read-only
 catalog/stat snapshot of PRODUCTION is mandatory to confirm what is actually
 deployed and whether a structure is genuinely unused.

 *** ZERO WRITES — read-only catalog/stat SELECTs only. ***
 Every statement below reads from information_schema / pg_catalog / pg_stat_* /
 cron.job / pg_extension / pg_policies. There is NO INSERT / UPDATE / DELETE /
 DROP / ALTER / CREATE / TRUNCATE / GRANT / REVOKE anywhere in this file.
 Running it cannot mutate production data (zero-functional-change, D-10).

 OPERATOR RUNBOOK (D-10 — operator-gated; Claude opens NO prod connection)
 -------------------------------------------------------------------------
 1. Open the PRODUCTION database:
      - Supabase Dashboard -> SQL Editor for the PROD project, OR
      - psql "$env:SUPABASE_DB_URL" with a READ-ONLY prod role.
    You supply the prod project-ref / connection string at run time. It is
    NEVER committed and NEVER pasted back (Open Question 2). DATABASE.md records
    the connection as "(redacted)" / by env name only.
 2. Run Section 0 FIRST (pg_extension). If pg_stat_statements is NOT installed,
    SKIP Section 8 and note "pg_stat_statements: disabled" (Open Question 3 / D-11).
 3. Run Sections 1-7 (and Section 8 only if the extension is present).
 4. Copy EACH section's result set and paste it into the matching
    "Source C — live PROD" subsection of .planning/audit/DATABASE.md.
    Paste RESULTS ONLY — never the connection string or any credential.
 5. ALSO (outside this SQL pack) run, in a terminal, the deployed-function
    drift check (D-08, confirms the retired interview-prep-coach question):
       npx supabase functions list --project-ref <PROD_REF>
       npx supabase functions list --project-ref <STAGING_REF>
    Paste those two function lists into DATABASE.md Source C as well.

 D-11 STAT CAVEATS (record these alongside any "unused" reading)
 ---------------------------------------------------------------
   - pg_stat_user_tables counters are cumulative SINCE the last stats_reset and
     are zeroed on DB restart / manual reset. Section 2b returns stats_reset so a
     zero/low count can be judged in context. Treat zero-usage as CORROBORATING,
     NEVER SOLE, evidence of "unused".
   - pg_stat_statements is OPTIONAL and may be disabled (Section 0 checks first).
     If absent, Section 8 returns nothing — say "disabled", do not imply "no slow
     queries".
==============================================================================
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 0 — Extensions (RUN FIRST: is pg_stat_statements / pg_cron enabled?) (D-11)
-- ─────────────────────────────────────────────────────────────────────────────
select extname, extversion
from pg_extension
order by extname;
-- Look for: pg_cron (cron jobs), pg_net (cron HTTP), pg_stat_statements (Section 8),
-- pgcrypto/uuid-ossp/supabase_vault as applicable. If pg_stat_statements is
-- ABSENT here, skip Section 8 and record "pg_stat_statements: disabled".


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — Tables & schemas (DB-01 inventory: what objects exist)
-- ─────────────────────────────────────────────────────────────────────────────
select table_schema, table_name, table_type
from information_schema.tables
where table_schema not in ('pg_catalog', 'information_schema')
order by table_schema, table_name;
-- Diff this against Source A (migrations declared tables) to surface
-- dashboard-made drift (objects in prod with no migration, or vice-versa).


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2a — Per-table row counts + read/write activity (D-11 stats)
-- ─────────────────────────────────────────────────────────────────────────────
select schemaname,
       relname,
       n_live_tup,
       seq_scan,
       idx_scan,
       n_tup_ins,
       n_tup_upd,
       n_tup_del,
       last_autovacuum,
       last_analyze
from pg_stat_user_tables
order by n_live_tup desc;
-- DB-02 corroboration: a table with n_live_tup = 0 AND seq_scan/idx_scan ~ 0 is a
-- disuse SIGNAL — but ONLY corroborating (see Section 2b stats_reset caveat).

-- SECTION 2b — stats_reset anchor (D-11 caveat: when did the counters above start?)
select datname, stats_reset
from pg_stat_database
where datname = current_database();
-- If stats_reset is recent (e.g. just after a restart), low counts in 2a are NOT
-- evidence of disuse. Record this timestamp next to any 2a-based verdict.


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — Functions / RPCs (merit RPCs, can_perform_ai_action, cron sweeps…)
-- ─────────────────────────────────────────────────────────────────────────────
select n.nspname                                   as schema,
       p.proname                                   as function_name,
       pg_get_function_identity_arguments(p.oid)   as args,
       l.lanname                                   as language,
       p.prosecdef                                 as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language  l on l.oid = p.prolang
where n.nspname not in ('pg_catalog', 'information_schema')
order by n.nspname, p.proname;
-- Confirms the live RPC surface vs Source A. DB-04 input: which usage_tracking /
-- can_perform_ai_action overloads actually exist in prod.


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — RLS policies (DB-05 input; Phase 8 acts, this plan only catalogs)
-- ─────────────────────────────────────────────────────────────────────────────
select schemaname, tablename, policyname, cmd, roles, permissive
from pg_policies
order by schemaname, tablename, policyname;
-- Surfaces any over-permissive "matches all rows" policy (the SEC-06 Paddle bug
-- the stripe_migration / merit_ledger migrations warn against).


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5 — Triggers (DB-01 inventory)
-- ─────────────────────────────────────────────────────────────────────────────
select event_object_schema as schema,
       event_object_table  as table_name,
       trigger_name,
       action_timing,
       event_manipulation
from information_schema.triggers
order by event_object_schema, event_object_table, trigger_name;
-- e.g. auto_provision_user_merits on auth.users, update_updated_at_column triggers.


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6 — pg_cron scheduled jobs (KEEP-LIST cron class — never "safe")
-- ─────────────────────────────────────────────────────────────────────────────
select jobid, jobname, schedule, active, left(command, 200) as command_preview
from cron.job
order by jobid;
-- Migrations schedule SIX jobs (Source A): keep-warm-ping, cleanup-rate-limit-
-- counters, reset-subscription-merits-sweep, extract_catchup_nightly,
-- benchmarks_nightly, lifecycle_sweep_nightly. Confirm prod matches (drift = a
-- job scheduled-but-not-in-migrations, or vice-versa). cron-invoked structures
-- are KEEP-LIST Class 3 — never classify "safe" on a no-frontend-import basis.


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7 — Indexes (DB-01 inventory; helps DB-02 reason about unused indexes)
-- ─────────────────────────────────────────────────────────────────────────────
select schemaname, relname as table_name, indexrelname as index_name,
       idx_scan, idx_tup_read, idx_tup_fetch
from pg_stat_user_indexes
order by schemaname, relname, indexrelname;
-- idx_scan = 0 is an unused-index SIGNAL (same D-11 stats_reset caveat applies).


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8 — Top statements (ONLY IF pg_stat_statements is enabled — see Section 0)
-- ─────────────────────────────────────────────────────────────────────────────
-- If Section 0 did NOT list pg_stat_statements, SKIP this block and record
-- "pg_stat_statements: disabled" in DATABASE.md Source C (Open Question 3 / D-11).
-- This is read-only (a SELECT against the extension's view), zero writes.
select queryid,
       calls,
       total_exec_time,
       mean_exec_time,
       rows,
       left(query, 200) as query_preview
from pg_stat_statements
order by total_exec_time desc
limit 50;
-- DB-02 / Phase 9 PERF cross-signal: low/zero calls on a feature's queries is a
-- disuse corroborator (not sole evidence). NOTE if the extension is absent.

-- ===========================  END — ZERO WRITES  ============================

---
phase: 03-cross-domain-inventory-audit
plan: 05
subsystem: database
tags: [postgres, supabase, pg_cron, rls, usage_tracking, paddle, audit, introspection]

# Dependency graph
requires:
  - phase: 03-01
    provides: ".planning/audit/ scaffold (INDEX.md, KEEP-LIST.md the D-07 gate)"
provides:
  - "Read-only operator-run DB introspection SQL pack (.planning/audit/queries/db-introspection.sql) — zero writes, reproducible by Phase 8"
  - "DATABASE.md: DB-01 inventory + DB-02 obsolete flagging, three-way triangulated (migrations × code × operator-run live PROD leg — Source C COMPLETE)"
  - "Live PROD Source C evidence (.planning/audit/queries/db-introspection-results.md): 40 public tables + 5 views, 35 fns, 6 active cron jobs, pg_stat_statements ENABLED, stats_reset 2025-12-08, 41 deployed edge fns"
  - "usage_tracking dual read/write dependency map + Paddle remnant map (D-08), current-HEAD verified + live-stat confirmed (294 rows / 3295 idx_scan), for Phase 8 DB-04"
  - "D-08 RESOLVED: interview-prep-coach ABSENT from 41-fn deploy list -> already retired (Phase-4 CLEAN-03 no-op); analyze-career-v2 (stale v9) + chat-agent new orphan candidates"
  - "Phase-8 flags: over-permissive linkedin_grades RLS (DB-05); project-ref discrepancy cimjltzovkahkqecpwgi (confirm canonical prod ref before any removal); saved_jobs declared-but-absent drift"
  - "Recorded drift vs v3.0 CONCERNS.md (hooks migrated off can_perform_ai_action; analysis_cache now exists+14 live rows; 3rd paddle column) and vs KEEP-LIST (6 cron jobs not 4)"
affects: [Phase 8 DB-03 removals, Phase 8 DB-04 usage_tracking retirement, Phase 8 DB-05 RLS audit, Phase 8 DB-06 rollback]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Operator-gated read-only live-prod introspection (D-10): committed .sql pack the operator runs, results pasted back — no autonomous prod connection"
    - "Three-way DB triangulation (D-09): declared migrations × code call-sites × live catalog truth"

key-files:
  created:
    - .planning/audit/queries/db-introspection.sql
    - .planning/audit/DATABASE.md
    - .planning/audit/queries/db-introspection-results.md
  modified:
    - .planning/audit/DATABASE.md

key-decisions:
  - "Source C (live PROD introspection) COMPLETED by operator 2026-06-13 and folded into DATABASE.md; results committed as evidence (db-introspection-results.md) — catalog metadata only, no secrets/row data (D-10 binding honored)"
  - "DB-02 FINAL = 0 safe even WITH live stats: removal candidates (usage_tracking cluster, Paddle remnants) are still live/gated; v3.0 zero-row + gated tables are new/gated not obsolete (D-06 + D-11)"
  - "D-08 RESOLVED: interview-prep-coach NOT deployed (absent from 41-fn list) -> already retired; STATE/CONCERNS 'still deployed' is STALE"
  - "usage_tracking is heavily live in PROD (294 rows / 3295 idx_scan / 304 ins) -> DB-04 stays gated; recorded as actively-written-by-7+-functions dependency map, NOT 'retained read-only' (corrects CONCERNS §5)"
  - "Project-ref discrepancy recorded: live ref cimjltzovkahkqecpwgi was STATE-labelled TEST; Phase 8 MUST confirm canonical prod ref before any removal"

patterns-established:
  - "Pattern: header-documented read-only SQL pack with explicit ZERO-WRITES guarantee + embedded operator runbook"
  - "Pattern: PENDING-OPERATOR sectioning so a gated live leg doesn't block the autonomous offline triangulation"

requirements-completed: [DB-01, DB-02]

# Metrics
duration: 14min (autonomous legs) + continuation (Source C fold-in)
completed: 2026-06-14
---

# Phase 03 Plan 05: Database Inventory & Obsolete-Structure Flagging Summary

**A strictly read-only, operator-gated DB introspection SQL pack plus a three-way-triangulated DATABASE.md (migrations × code × live-PROD leg) that confirms the usage_tracking dual read/write map and Paddle remnants for Phase 8 — with the live-PROD leg now COMPLETED by the operator (results committed as evidence), DB-02 finalized at 0 `safe`, the D-08 interview-prep-coach question resolved (already retired), and zero functional / zero fabricated data.**

## Performance

- **Duration:** ~14 min (autonomous Tasks 1+3 offline legs) + a continuation pass to fold in Source C and finalize verdicts
- **Started:** 2026-06-14T00:30Z (approx)
- **Completed:** 2026-06-14 (autonomous legs) → Source C folded in on operator return (2026-06-13 live run)
- **Tasks:** all 3 complete (Task 2 operator-gated checkpoint RESOLVED — operator ran the pack against PROD and returned results)
- **Files modified:** 3 under `.planning/audit/` (SQL pack + DATABASE.md + the committed live-results evidence file)

## Accomplishments

- **Task 1 — read-only SQL pack** (`.planning/audit/queries/db-introspection.sql`): 9 sections (extensions-first, tables, row-counts+stats_reset, functions/RPCs, RLS policies, triggers, cron.job, indexes, conditional pg_stat_statements). Verified ZERO executable write statements, no connection string, all required catalog tokens present.
- **Task 3 (offline legs) — DATABASE.md**: Source A (76 migrations: ~37 tables, ~33 RPCs, **6** cron jobs, RLS/triggers) + Source B (code call-sites) complete. Source C clearly marked **PENDING OPERATOR** with an embedded runbook and per-section paste table.
- **D-08 dependency maps recorded** for Phase 8 DB-04: the `usage_tracking` writer/reader/deleter map and the Paddle remnant map (table + 3 columns + webhook + auth/CORS + prose), both classed gated/needs-investigation, never `safe`.
- **Drift re-verified and recorded** against current HEAD `27d9ebc`.

## Task Commits

1. **Task 1: read-only DB introspection SQL pack** - `8497770` (docs)
2. **Task 2: OPERATOR live-prod leg** - operator-gated checkpoint, RESOLVED — operator ran the pack against PROD and returned results (no autonomous prod connection; results committed as evidence in Task-3 continuation)
3. **Task 3 (offline legs): DATABASE.md (Source A+B, Source C placeholder)** - `303ef1f` (docs)
3b. **Task 3 (continuation): fold live Source C into DATABASE.md + commit results evidence** - `a5dc41c` (docs) — DB-01/DB-02 finalized three-way; `db-introspection-results.md` committed

**Plan metadata:** the initial SUMMARY + STATE + ROADMAP commit was `b99583a`; this continuation re-commits the updated SUMMARY + STATE + ROADMAP (final).

## Files Created/Modified

- `.planning/audit/queries/db-introspection.sql` - Operator-run read-only catalog/stat pack (zero writes, operator-gated), reproducible by Phase 8.
- `.planning/audit/DATABASE.md` - DB-01 inventory + DB-02 FINAL flagging, three-way triangulated (Source C COMPLETE); usage_tracking + Paddle D-08 maps; live-stat-confirmed verdicts.
- `.planning/audit/queries/db-introspection-results.md` - **(continuation)** the operator's 2026-06-13 live PROD result sets (catalog metadata ONLY — names/counts/signatures/policy-names/index-names; no secrets, no row data, no connection string) — the Source C evidence file.

## Decisions Made

- **Live-prod leg COMPLETED by operator (not faked).** Per D-10, no autonomous prod connection was ever opened; the operator ran the committed read-only pack against PROD on 2026-06-13 and returned results, which were folded into Source C and committed verbatim as `db-introspection-results.md` (catalog metadata only).
- **DB-02 = 0 `safe` even WITH live stats.** Live PROD usage (read against `stats_reset = 2025-12-08`, D-11) plus the KEEP-LIST gate confirmed the removal candidates are still used/gated/newly-shipped — nothing crossed the conservative bar (D-06). The Paddle remnants + the legacy `usage_tracking` credit/usage cluster are the real removal *candidates* but all are gated/needs-investigation, deferred to Phase 8.
- **D-08 RESOLVED — `interview-prep-coach` already retired.** Absent from the 41-function live deploy list AND no repo source → already gone; Phase-4 CLEAN-03 is a no-op close. STATE/CONCERNS "still deployed on staging+prod" is STALE. The live `interview-prep-analyze`/`-evaluate` (v52) ARE deployed and KEEP-LIST Class 1.
- **`usage_tracking` is NOT "retained read-only" AND is heavily live.** 7+ active writers + readers + an `admin-delete-user` deleter (Source B) AND 294 live rows / 3 295 idx_scan / 304 inserts in PROD (Source C) → DB-04 stays gated; corrects CONCERNS §5.
- **Project-ref discrepancy escalated to Phase 8.** Live ref `cimjltzovkahkqecpwgi` was STATE-labelled the TEST project; the operator ran it as PROD with real-user-scale data. Phase 8 MUST confirm the canonical prod ref before any DB-03/DB-04 removal.

## Deviations from Plan

None functional — plan executed as written. The continuation committed `db-introspection-results.md` as the Source C evidence file (the plan named DATABASE.md + the SQL pack; the results file is the natural evidence artifact for the operator's returned data — `.planning/audit/` doc, in scope, no secrets). Factual corrections discovered and recorded in DATABASE.md (not code changes):

- **[Recording correction] Six cron jobs, not four.** KEEP-LIST/RESEARCH named 4 cron jobs; the current-HEAD migration sweep finds 6 (`cleanup-rate-limit-counters` and `reset-subscription-merits-sweep` were missing). Source C `cron.job` confirms all 6 ACTIVE. All recorded as KEEP-LIST Class 3.
- **[Recording correction] Paddle/usage_tracking call-map drift vs v3.0 leads.** `Settings/Billing.tsx` absent; `Refund.tsx` is prose-only; a third column `paddle_price_id` and the `paddle_webhook_events` table found; `usePaywallGuard`/`useTierAccess` have migrated OFF `can_perform_ai_action` (now asserted negative in tests) while `SkillsGapAnalysis.tsx` + `Navbar.tsx` still call it — so the MER-12 FE migration is PARTIAL. All recorded as evidence; no source touched.
- **[Source C discovery] D-08 resolved + new orphan candidates + RLS flag + project-ref + drift.** `interview-prep-coach` ABSENT from the 41-fn deploy list (already retired); `analyze-career-v2` (stale v9) + `chat-agent` (v94) recorded as Phase-4 repo-check orphan candidates; over-permissive `linkedin_grades` "Anyone can view" RLS flagged for Phase-8 DB-05; project-ref discrepancy (`cimjltzovkahkqecpwgi` STATE-labelled TEST) escalated to Phase 8; `saved_jobs` declared-but-absent drift recorded; `analysis_cache` confirmed live (14 rows). All recording-only; no source touched.

## Issues Encountered

None. The CRLF line-ending warnings on commit are cosmetic (Git auto-conversion), not errors.

## User Setup Required

**None outstanding.** The operator action that previously gated Source C has been COMPLETED — the operator ran the read-only pack against PROD (2026-06-13), ran `supabase functions list` (41 fns), and returned the results, now committed at `.planning/audit/queries/db-introspection-results.md` and folded into DATABASE.md Source C. The runbook is retained in DATABASE.md + the SQL pack so **Phase 8 can re-run the identical pack** before any DB-03 removal / DB-04 retirement (and must confirm the canonical prod project-ref then).

## Next Phase Readiness

- DB-01 inventory + DB-02 flagging are **fully three-way triangulated and FINAL for this phase** — Phase 8 (DB-03..06) acts on them; the SQL pack is re-runnable so Phase 8 re-confirms before any removal.
- **Phase-8 gates carried forward (now with evidence, not pending):** (1) `usage_tracking` retirement gated on its 294-live-rows / heavy idx_scan + the partial `can_perform_ai_action` FE migration; (2) Paddle remnants gated on the last in-flight sub; (3) the over-permissive `linkedin_grades` RLS for DB-05; (4) **confirm the canonical prod project-ref** (`cimjltzovkahkqecpwgi` STATE-labelled TEST) before any DB-03 removal; (5) `saved_jobs` declared-but-absent migrations-vs-prod drift to reconcile.
- **Phase-4 (CLEAN-03) handoff:** `interview-prep-coach` is already retired (no-op close); `analyze-career-v2` (stale v9) is an undeploy candidate; `chat-agent` needs a repo-reference/routing check.

## Self-Check: PASSED

- FOUND: `.planning/audit/queries/db-introspection.sql`
- FOUND: `.planning/audit/DATABASE.md` (Source C folded in, no PENDING placeholder)
- FOUND: `.planning/audit/queries/db-introspection-results.md` (Source C evidence)
- FOUND: `.planning/phases/03-cross-domain-inventory-audit/03-05-SUMMARY.md`
- FOUND commit: `8497770` (Task 1 SQL pack)
- FOUND commit: `303ef1f` (Task 3 offline-legs DATABASE.md)
- FOUND commit: `a5dc41c` (Task 3 continuation — Source C fold-in + results evidence)
- Zero functional change verified: `git diff fa4ccb6..HEAD -- src supabase/functions supabase/migrations` → EMPTY (only the pre-existing Phase-2 `.gitignore` delta, untouched by 03-05)

---
*Phase: 03-cross-domain-inventory-audit*
*Completed: 2026-06-14 (Source C folded in on operator return)*

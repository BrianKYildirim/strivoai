---
phase: 08-database-cleanup-migrations
plan: 01
subsystem: database
tags: [supabase, postgres, rls, mcp, introspection, audit, names-not-values, zero-functional-change]

# Dependency graph
requires:
  - phase: 03-cross-domain-inventory-audit
    provides: "DATABASE.md DB-01/DB-02 inventory, db-introspection.sql read-only pack, the preview-sourced 2026-06-13 Source-C capture, KEEP-LIST gate"
  - phase: 07.1-runtime-reliability-review
    provides: "RUN-06 linkedin_grades RLS forward+rollback handoff, the 233-advisory triage, the MCP access model (prod read-only / preview writable)"
provides:
  - "Corrected Source-C' prod evidence (db-introspection-results.md) sourced from canonical prod zjpjapgraoxdukdvpjes (2026-06-24), names-not-values"
  - "RESOLVED project-ref discrepancy: the 2026-06-13 Source-C was PREVIEW-sourced (cimjltzovkahkqecpwgi); true prod is near-empty (1 profile / 3 resumes / 1 user)"
  - "Re-derived DB-02 verdicts in DATABASE.md against low-traffic true prod (all gated/keep verdicts HOLD or strengthen; 0 confirmed-safe)"
  - "saved_jobs reconciled ABSENT-on-prod via documentation-repair (no destructive drop, D-07)"
  - "DB-04 GATED disposition row for the usage_tracking + can_perform_ai_action cluster (two live FE call sites + 7+ writers)"
  - "Resolved RESEARCH Open Questions 1-2: linkedin_grades over-permissive policy CONFIRMED live on prod (-> 08-04); saved_jobs ABSENT"
  - "DB-05 advisor sets mapped to plan waves (08-03/08-04/08-05; perf -> Phase 9)"
affects: [08-02, 08-03, 08-04, 08-05, phase-9-performance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Operator-gated read-only prod re-pull via supabase-prod-readonly MCP (Claude authors docs from operator-supplied evidence; never opens a prod connection)"
    - "Source-C' correction: supersede preview-sourced catalog evidence with canonical-prod truth, preserving the prior capture as labelled superseded context"
    - "Names-not-values discipline + secret-VALUE-pattern grep gate over every committed re-pull doc (project refs are identifiers, not secrets)"

key-files:
  created:
    - ".planning/phases/08-database-cleanup-migrations/08-01-SUMMARY.md"
  modified:
    - ".planning/audit/queries/db-introspection-results.md"
    - ".planning/audit/DATABASE.md"
    - ".planning/audit/RESIDUAL-REGISTER.md"

key-decisions:
  - "Canonical prod = zjpjapgraoxdukdvpjes (operator re-confirmed 2026-06-24; the formal Phase-8 re-confirmation owed)"
  - "The 2026-06-13 Source-C capture was the PREVIEW project cimjltzovkahkqecpwgi, not prod — every Source-C count re-classified preview-sourced"
  - "On low-traffic true prod, pg_stat zero/low counts are NOT disuse evidence (D-11) — conservative gated/keep verdicts HOLD or strengthen; DB-03 confirmed-safe set = 0"
  - "linkedin_grades 'Anyone can view' over-permissive SELECT is CONFIRMED LIVE on prod -> Plan 08-04 applies the RUN-06 fix (DROP; owner-scoped SELECT already exists)"
  - "saved_jobs ABSENT on prod -> documentation-repair only, NEVER a destructive drop (D-07)"
  - "usage_tracking + can_perform_ai_action cluster stays GATED (DB-04); two FE call sites left byte-identical (D-06)"

patterns-established:
  - "Pattern: re-pull-before-act — no migration is authored until the corrected canonical-prod evidence exists"
  - "Pattern: document-and-route for non-DDL findings (prod-cron-invokes-preview -> needs-operator, not a migration)"

requirements-completed: [DB-01, DB-03, DB-04]

# Metrics
duration: 35min
completed: 2026-06-24
---

# Phase 8 Plan 01: Prod Re-Pull & Evidence Re-Establishment Summary

**Re-established canonical-prod database ground truth (zjpjapgraoxdukdvpjes) via an operator-gated read-only re-pull, proving the Phase-3 Source-C catalog was preview-sourced; re-derived DB-02 against low-traffic true prod (0 confirmed-safe), reconciled saved_jobs absent without a drop, and documented the usage_tracking/can_perform_ai_action cluster GATED — zero DDL, zero code change.**

## Performance

- **Duration:** ~35 min (across the checkpoint resolution + the 3-task authoring)
- **Started:** 2026-06-24 (Phase 08 execution start)
- **Completed:** 2026-06-24
- **Tasks:** 3 (Task 1 was a blocking human-action checkpoint, resolved by the operator-authorized re-pull)
- **Files modified:** 3 audit docs (+1 SUMMARY created)

## Accomplishments

- **RESOLVED the load-bearing project-ref discrepancy** the entire phase waited on: the 2026-06-13 "Source C" capture (17 profiles / 118 resumes / 22 users) was the **PREVIEW** project `cimjltzovkahkqecpwgi`, NOT prod. True canonical prod `zjpjapgraoxdukdvpjes` is **near-empty** (1 profile / 3 resumes / 1 auth user; `usage_tracking` 4 rows, still actively written). Canonical prod ref operator-re-confirmed 2026-06-24, corroborated 3 ways (`.mcp.json` + `deploy.ps1` L73-75 + the Section-6 cron-host check).
- **Wrote the corrected Source-C' evidence** (`db-introspection-results.md`, 2026-06-24, canonical prod) — names-not-values clean, preserving the prior capture as labelled superseded preview context.
- **Re-derived every DB-02 verdict** that could differ (row counts, policy names, table existence) against true prod: on a 1-user prod the disuse signal is unreliable (D-11), so all conservative gated/keep verdicts **HOLD or strengthen**. **DB-03 confirmed-safe set = 0** (documentation-reconcile only).
- **Resolved the prod-gated RESEARCH Open Questions:** (1) `linkedin_grades` over-permissive `"Anyone can view linkedin grades"` SELECT (role `public`, qual `true`) is **CONFIRMED LIVE on prod** — coexists with the correct owner-scoped policy -> Plan 08-04 applies the fix (a DROP, since the owner-scoped SELECT already exists). (2) `saved_jobs` is **ABSENT** on prod -> documentation-repair, never a drop. (4) The x60 EXECUTE-grant set + the DB-05 advisor categories captured and mapped to waves.
- **Documented the DB-04 gated disposition:** `usage_tracking` + `can_perform_ai_action` cluster GATED, naming both live FE call sites (`Navbar.tsx:109`, `SkillsGapAnalysis.tsx:108`) + the 7+ live writers; the two FE files left byte-identical (D-06).
- **Surfaced a NEW needs-operator finding:** prod cron jobs 1 (`keep-warm-ping`) and 6 (`extract_catchup_nightly`) `net.http_post` to the PREVIEW functions host — document-and-route, not a migration.

## Task Commits

Each task was committed atomically:

1. **Task 1: Re-pull db-introspection.sql READ-ONLY against canonical prod -> Source-C'** - `9ff5e93c` (docs)
2. **Task 2: Re-derive DB-02 verdicts vs true prod + reconcile saved_jobs + derive DB-03 set** - `a9cb5cd3` (docs)
3. **Task 3: Document usage_tracking + can_perform_ai_action GATED (DB-04) + cron needs-operator** - `624dab4c` (docs)

**Plan metadata:** (this SUMMARY + STATE/ROADMAP) committed separately.

## Files Created/Modified

- `.planning/audit/queries/db-introspection-results.md` - Replaced with the corrected 2026-06-24 Source-C' canonical-prod re-pull (resolved discrepancy + the two new findings; prior preview capture retained as superseded).
- `.planning/audit/DATABASE.md` - Appended a dated "Phase 8 D-01 re-pull reconciliation" block (historical Phase-3 Verdict block preserved): discrepancy resolved, DB-02 re-derived, saved_jobs reconciled, DB-03 confirmed-safe set = 0.
- `.planning/audit/RESIDUAL-REGISTER.md` - Appended the R-DB-04 GATED row (usage_tracking + can_perform_ai_action cluster) and the DB-1-cron needs-operator finding.
- `.planning/phases/08-database-cleanup-migrations/08-01-SUMMARY.md` - This summary.

## Decisions Made

- **Canonical prod = `zjpjapgraoxdukdvpjes`** (operator re-confirmed 2026-06-24). The memo's owed Phase-8 re-confirmation is now satisfied.
- **The 2026-06-13 Source-C was preview-sourced.** Every count in it reflects preview traffic, not prod; the catalog SHAPE (names) was largely the same.
- **No DB-03 removals this phase.** On low-traffic true prod nothing crosses the disuse bar; the migrations Phase 8 *does* author (08-03/08-04/08-05) are DB-05 security/least-privilege fixes, not structure removals.
- **linkedin_grades fix is REAL (not a no-op):** the over-permissive policy IS live on prod -> 08-04 applies a DROP (owner-scoped SELECT already exists; operator re-confirms the live name/qual before applying, D-08).
- **saved_jobs:** documentation-repair only (idempotent `CREATE TABLE IF NOT EXISTS` in the bootstrap covers future provisioning; no consumer, no behavior to preserve) — NEVER a destructive drop.

## Deviations from Plan

None - plan executed exactly as written. The only structural note is that Task 1 is a `checkpoint:human-action` (gate=blocking); the executor has no MCP and could not run the prod re-pull, so it correctly STOPPED and returned a structured checkpoint. The coordinator resolved it (operator-authorized read-only re-pull, results supplied as an evidence handoff), and execution resumed. No fabricated prod data; zero prod writes; zero code/DDL change.

## Issues Encountered

- **Blocking checkpoint (expected):** Task 1 required operator-gated prod MCP access the executor does not hold. Resolved via the coordinator's operator-authorized re-pull + evidence handoff (`phase8-prod-repull-evidence.md`). Authored all docs from that evidence; never opened a prod connection, never used an MCP write tool (the supabase-prod-readonly MCP server instructions appeared mid-session and were deliberately NOT invoked — prod stays read-only-to-the-operator).

## User Setup Required

None for this plan (read-only evidence + docs only). Two operator follow-ups are now QUEUED for later plans / backlog:
- **08-02 precondition (already done):** preview `cimjltzovkahkqecpwgi` un-paused by the operator 2026-06-24.
- **needs-operator (backlog):** re-point prod cron jobs 1 & 6 off the PREVIEW functions host (cron/config fix, not a Phase-8 migration).

## Next Phase Readiness

- **The corrected canonical-prod evidence now gates all later migration authoring** — 08-02 (preview sync + parity) and 08-03/08-04/08-05 (security-class migrations) can proceed against TRUE prod truth.
- **Prod migration baseline** for the 08-02 parity gate = `20260607050000_allow_resume_document_mime_types` (matches repo HEAD).
- **08-04 input ready:** `linkedin_grades` fix is a confirmed-real DROP (not a no-op); operator re-confirms the live policy name/qual before applying (D-08).
- **Gates clean:** secret-VALUE grep = 0 over all three docs; `git diff -- src supabase/functions` EMPTY; the two FE call sites byte-identical; no `.ps1` touched; zero prod SQL applied.

## Self-Check: PASSED

- Files verified present: `db-introspection-results.md`, `DATABASE.md`, `RESIDUAL-REGISTER.md`, `08-01-SUMMARY.md`.
- Commits verified in history: `9ff5e93c` (Task 1), `a9cb5cd3` (Task 2), `624dab4c` (Task 3).
- Gates: secret-VALUE grep = 0 over all docs incl. SUMMARY; `git diff -- src supabase/functions` EMPTY; two FE call sites byte-identical; no `.ps1` touched; zero prod SQL applied.

---
*Phase: 08-database-cleanup-migrations*
*Completed: 2026-06-24*

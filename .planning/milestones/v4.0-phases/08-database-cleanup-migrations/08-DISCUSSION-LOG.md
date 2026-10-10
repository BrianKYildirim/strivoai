# Phase 8: Database Cleanup & Migrations - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** 8-database-cleanup-migrations
**Areas discussed:** RLS audit appetite (DB-05), Migration validation model, Evidence re-confirmation, usage_tracking + DB-03 scope

---

## Gray-area selection

| Option | Description | Selected |
|--------|-------------|----------|
| RLS audit appetite (DB-05) | How far DB-05 applies vs documents | ✓ |
| Migration validation model | Prod read-only + paused preview validation path | ✓ |
| Re-confirm evidence first | Phase 3 evidence came from the paused preview/test project | ✓ |
| usage_tracking + DB-03 scope | Gated disposition + 0-safe DB-03 handling | ✓ |

**User's choice:** all four areas.

---

## RLS audit appetite (DB-05)

**Q1 — Which fixes does Phase 8 APPLY vs document/defer?**

| Option | Description | Selected |
|--------|-------------|----------|
| Security-class wins only | Apply zero-observable-change security/least-privilege fixes; document gated/EXECUTE-revoke verification; defer perf-class RLS (initplan x62, multiple-permissive x48) to Phase 9 | ✓ |
| Minimal — known risk only | Apply only the pre-authored linkedin_grades fix; document everything else | |
| Full — security + perf | Apply security AND perf-class RLS in Phase 8 | |

**Q2 — Bar before APPLYING grant-altering fixes (linkedin_grades public→owner; REVOKE-from-anon x30)?**

| Option | Description | Selected |
|--------|-------------|----------|
| Verify-then-apply | Apply only after read-only prod check + code read-map proves no live caller depends on the grant; else ship unapplied + gate | ✓ |
| Apply on static evidence | Trust Phase 3 + read-map, apply without fresh per-item prod verification | |
| Document-only, defer apply | Treat any grant change as outside zero-change; author unapplied, apply nothing this phase | |

**User's choice:** Security-class wins only; verify-then-apply for grant changes.
**Notes:** Perf-class RLS explicitly routed to Phase 9. Keeps zero-observable-change provable rather than assumed.

---

## Migration validation model

**Q1 — How to validate migrations given prod read-only-via-MCP + preview PAUSED?**

| Option | Description | Selected |
|--------|-------------|----------|
| Offline-gate + operator prod-apply | Author+rollback, offline verify:baseline, operator applies prod, read-only post-apply MCP check, defer fuller live-smoke (Phase 7.1 precedent) | |
| Un-pause preview, test-first | Operator un-pauses preview; apply+validate each migration on preview first, then operator applies prod | ✓ |
| Per-migration operator choice | Default offline+prod-apply; operator may elect a preview un-pause window per risky change | |

**Q2 — Preview-validation workflow (preview was paused/possibly drifted)?**

| Option | Description | Selected |
|--------|-------------|----------|
| Sync first, every migration | Sync preview to current schema + confirm structure matches prod; route EVERY migration through preview → operator review → prod (hard gate) | ✓ |
| Sync first, risky-only gate | Sync preview, route only access-altering/EXECUTE-revoke/policy migrations through preview | |
| Test preview as-is | Un-pause + validate against preview's current state without a forced schema reconcile | |

**User's choice:** Un-pause preview, test-first; sync preview to current schema first, every migration through preview.
**Notes:** Deviates from the Phase 7.1 defer-live-smoke default *toward* more validation (CLAUDE.md MCP rule 5). Un-pause is an operator action → autonomous:false checkpoint. Prod still operator-applied (read-only via MCP).

---

## Evidence re-confirmation

**Q1 — How much re-confirmation before authoring/applying anything?**

| Option | Description | Selected |
|--------|-------------|----------|
| Full re-pull, blocking first task | Confirm canonical prod ref; re-run db-introspection.sql against zjpjapgraoxdukdvpjes read-only; re-classify preview-sourced readings; no migration until done | ✓ |
| Targeted re-pull | Re-pull only the structures Phase 8 touches; trust Phase 7.1 prod advisories for the rest | |
| Trust prod advisories | Re-pull only the usage_tracking row count; treat the discrepancy as a documentation reconcile | |

**User's choice:** Full re-pull, blocking first task.
**Notes:** Phase 3 row-count/pg_policies evidence came from cimjltzovkahkqecpwgi = the paused preview/test project, not canonical prod zjpjapgraoxdukdvpjes (operator-confirmed prod in Phase 04). The 233 advisories were already canonical-prod-sourced in Phase 7.1. Re-pull may change DB-02 verdicts.

---

## usage_tracking + DB-03 scope

**Q1 — DB-04: does Phase 8 touch the live can_perform_ai_action call sites?**

| Option | Description | Selected |
|--------|-------------|----------|
| Document gated, no surgery | Leave Navbar:109 + SkillsGapAnalysis:108 byte-identical; document usage_tracking + cluster as gated with blocking dep named | ✓ |
| Advance retirement | Migrate Navbar + SkillsGap off can_perform_ai_action toward retirement (paywall-behavior risk) | |
| Decide after re-pull | Hold the call until the canonical-prod re-pull lands | |

**Q2 — DB-03 disposition (DB-02 found 0 safe) + saved_jobs drift?**

| Option | Description | Selected |
|--------|-------------|----------|
| Evidence-gated removals + doc reconcile | Author migrations only for what fresh prod evidence confirms safe; reconcile saved_jobs by what true prod shows (no destructive drop); Paddle stays gated | ✓ |
| Pure-documentation DB-03 | No removals this phase; document the no-safe-removals finding + drift + orphans | |
| Aggressive cluster removal | Remove usage_tracking/Paddle if re-pull shows low/zero use (against zero-change) | |

**User's choice:** Document gated, no surgery; evidence-gated removals + doc reconcile.
**Notes:** Roadmap-aligned (retire only if fully unreferenced) + zero-functional-change. saved_jobs "absent" may be a wrong-project artifact resolved by the D-01 re-pull. DB-06 forward+rollback applies to every change.

---

## Claude's Discretion

- Cron/log + deploy-drift items routed to Phase 8 by 7.1 but not central to DB-03..06 (http_request_queue NULL-url cron ERROR; analyze-career-v2/chat-agent function orphans) → document-and-route (operator/cron-config + edge-function items), not DB migrations.
- Plan/wave slicing, migration-file timestamps/naming, the re-pull results doc home, and precise per-policy SQL → left to research + planning.

## Deferred Ideas

- Perf-class RLS rewrites (auth_rls_initplan x62, multiple_permissive_policies x48) → Phase 9.
- usage_tracking retirement + the can_perform_ai_action FE-gate migration → backlog/future.
- Paddle remnant removal → gated on the last in-flight Paddle subscription expiring.
- unused_index x42 / unindexed_foreign_keys x8 → index hygiene, defer to Phase 9 / longer window.
- Storage public_bucket_allows_listing → document + route to operator/Phase 9.
- Shared `_shared/errors.ts` taxonomy helper → already a Phase-9 candidate (7.1 D-04).

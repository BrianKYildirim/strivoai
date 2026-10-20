---
phase: 08-database-cleanup-migrations
plan: 05
subsystem: database
tags: [supabase, postgres, security-definer, execute-grant, revoke, public-grant, has_function_privilege, least-privilege, preview-to-prod-gate, names-not-values, zero-functional-change, db-05, db-06]

# Dependency graph
requires:
  - phase: 08-database-cleanup-migrations (plan 01)
    provides: "Canonical-prod ground truth (zjpjapgraoxdukdvpjes): the x60 EXECUTE-grant advisor set, the 30 SECURITY DEFINER function signatures, the can_perform_ai_action load-bearing note"
  - phase: 08-database-cleanup-migrations (plan 02)
    provides: "Preview cimjltzovkahkqecpwgi at repo HEAD, preview-vs-prod parity, the preview->prod 4-step HARD gate in force"
  - phase: 08-database-cleanup-migrations (plan 03)
    provides: "The provably-zero-change DB-05 tier applied (73->65); the per-fix before/after evidence-row pattern"
  - phase: 08-database-cleanup-migrations (plan 04)
    provides: "The grant-altering DB-05 tier applied (65->64); function_search_path_mutable cleared; SELECT-as-role/effective-check no-regression pattern"
provides:
  - "2 forward+rollback migration files (20260608000010 revoke PUBLIC+anon EXECUTE x30, 20260608000011 revoke authenticated EXECUTE x19) for the LAST DB-05 EXECUTE-grant tier"
  - "Both APPLIED + VERIFIED preview->prod: get_advisors(security) 64->15 (-49) IDENTICAL preview/prod; anon_security_definer_function_executable 30->0; authenticated_security_definer_function_executable 30->11 (19 revoked / 11 intentional KEEP)"
  - "The per-function x60 read-map (frontend-authenticated / service-role / trigger / cron classification with cited call sites) + the revoke-or-gate verdict table"
  - "DB-05 COMPLETE: phase-wide security advisor 73->15; every remaining lint dispositioned RESOLVED/GATED/needs-operator; perf-class routed to Phase 9"
  - "The FROM-PUBLIC effective-grant lesson: REVOKE FROM anon/authenticated is a no-op while a blanket PUBLIC grant remains; the advisor uses has_function_privilege, not the explicit-grant catalog"
affects: [phase-9-performance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "REVOKE EXECUTE ... FROM PUBLIC, anon (NOT FROM anon alone) — a blanket PUBLIC EXECUTE grant in proacl keeps anon/authenticated effectively executable; the advisor (has_function_privilege) is blind to nothing, but information_schema.role_routine_grants IS blind to PUBLIC"
    - "Verification DO-block via has_function_privilege(role, oid, 'EXECUTE') — the advisor's OWN predicate — never information_schema.role_routine_grants (explicit-only, PUBLIC-blind, falsely passes)"
    - "Per-function EXECUTE-grant read-map: src/** .rpc() = authenticated (load-bearing, KEEP) vs getServiceClient() / trigger / cron = service-role-or-definer (revocable; service_role bypasses the grant)"
    - "Pre-apply effective-executability gate catches an effective no-op (FROM anon only) BEFORE it applies cleanly to prod with zero security gain"

key-files:
  created:
    - "supabase/migrations/20260608000010_revoke_anon_execute_security_definer_rpcs.sql"
    - "supabase/migrations/20260608000011_revoke_authenticated_execute_unused_definer_rpcs.sql"
    - ".planning/phases/08-database-cleanup-migrations/08-05-SUMMARY.md"
  modified:
    - ".planning/audit/RUNTIME-RELIABILITY.md"
    - ".planning/audit/RESIDUAL-REGISTER.md"
    - ".planning/phases/08-database-cleanup-migrations/08-VALIDATION.md"

key-decisions:
  - "REVOKE FROM PUBLIC, anon on all 30 (the FROM-anon-only first form was an effective no-op proven on preview — blanket PUBLIC grant keeps anon executable). The advisor uses has_function_privilege; the original role_routine_grants DO-block was PUBLIC-blind and falsely passed."
  - "authenticated EXECUTE revoked on the 19 provably-unused (service/trigger/cron-only, zero src/** .rpc() caller); KEPT on the 11 load-bearing/RLS-context (10 live FE RPCs + auth_owns_version)"
  - "can_perform_ai_action authenticated EXECUTE NEVER revoked (live FE RPC at Navbar.tsx:109 + SkillsGapAnalysis.tsx:108) — the headline GATED row (R-DB-05)"
  - "service_role keeps EXECUTE throughout (its explicit grant survives FROM PUBLIC) -> every edge-function caller unaffected; zero access regression"
  - "DB-05 COMPLETE: security advisor 73->15; the 15 remaining are all intentional (11 GATED + 2 always-true service-role + 2 needs-operator); perf-class -> Phase 9 (D-02)"

patterns-established:
  - "Pattern: effective-grant correctness — least-privilege EXECUTE revokes MUST target PUBLIC (the blanket grant) not just the role, and MUST be verified with has_function_privilege (the advisor's predicate), not the explicit-grant catalog"
  - "Pattern: the preview gate is a test-first surface that catches a silent no-op (zero-security-gain migration) before it reaches prod — the second time in Phase 8 the gate caught a bug pre-apply (cf. 08-04 aborting-predicate)"

requirements-completed: [DB-03, DB-04, DB-05, DB-06]

# Metrics
duration: 40min
completed: 2026-06-24
---

# Phase 8 Plan 05: EXECUTE-Grant Least-Privilege Revokes + DB-05 Close-Out Summary

**Read-mapped the x60 `_security_definer_function_executable` EXECUTE grants per-function, authored forward+rollback REVOKE migrations for the provably-unused subset, and applied them preview->prod — but the preview gate CAUGHT that `REVOKE ... FROM anon/authenticated` was an effective no-op (a blanket `PUBLIC` EXECUTE grant in `proacl` kept anon/authenticated executable; the advisor uses `has_function_privilege`, which the original `role_routine_grants` DO-block was blind to). Corrected to `REVOKE ... FROM PUBLIC, anon` on all 30 + `FROM authenticated` on the 19 unused, with `has_function_privilege` verification. Result: `get_advisors(security)` 64 -> 15 (-49) IDENTICAL preview/prod; `anon_security_definer_function_executable` 30 -> 0; `authenticated_security_definer_function_executable` 30 -> 11 (19 revoked / 11 intentional KEEP incl. `can_perform_ai_action`). DB-05 is COMPLETE (73 -> 15 phase-wide; every remaining lint dispositioned); perf-class routed to Phase 9; zero app-code change across all of Phase 8.**

## Performance

- **Duration:** ~40 min (1 authoring/read-map task + a gate-caught effective-grant fix + the blocking preview->prod gate resolution)
- **Started:** 2026-06-24 (Plan 08-05 execution start)
- **Completed:** 2026-06-24 (operator prod-apply + re-verify)
- **Tasks:** 3 (Task 1 autonomous read-map + authoring; Task 2 the blocking `checkpoint:human-verify` apply/verify gate, which caught the FROM-PUBLIC bug; Task 3 doc close-out)
- **Files:** 2 migration files created + 3 audit/validation docs modified (+1 SUMMARY)

## Accomplishments

- **Task 1 — per-function x60 read-map + candidate REVOKE migrations.** Classified each of the 30 SECURITY DEFINER RPCs by caller role (`rg "\.rpc\('<fn>'" src supabase/functions`, non-test): the frontend supabase client is the **anon/publishable** client, so a `src/**` `.rpc()` runs as **authenticated** (load-bearing); every edge-function call site uses `getServiceClient()` (**service_role**, bypasses the grant); triggers/cron invoke their functions via the definer/pg_cron mechanism (not a role grant). Verdict: **10 frontend-called RPCs + `auth_owns_version`** KEEP authenticated EXECUTE (GATED); the **other 19** are revocable; **all 30** anon EXECUTE revocable. Authored `20260608000010` (anon) + `20260608000011` (authenticated x19), each forward+rollback. Recorded the full read-map verdict table in `RUNTIME-RELIABILITY.md` and the GATED set in `RESIDUAL-REGISTER.md` R-DB-05.
- **Task 2 — preview->prod gate CAUGHT the effective-grant no-op (Rule-1 deviation, see below) then validated the corrected fix.** The orchestrator applied the original files to preview and the advisor DID NOT clear; root-caused to the blanket PUBLIC grant; the executor corrected both files to `FROM PUBLIC, anon` (all 30) and `has_function_privilege` verification BEFORE any prod apply. The orchestrator re-applied the corrected files to preview + verified; the OPERATOR applied them to prod `zjpjapgraoxdukdvpjes` and approved; the orchestrator re-verified read-only. **Result (names-not-values): `get_advisors(security)` 64 -> 15 (-49) IDENTICAL preview/prod; `has_function_privilege` on prod = anon 0 (all 30) / authenticated 11 (exactly the KEEP set) / service_role 30 (edge functions unaffected).** No-regression proven on preview (`can_perform_ai_action` invoked as authenticated returns its JSON).
- **Task 3 — DB-05 audit completeness + perf-class routing + phase close-out.** Recorded the 73 -> 15 phase-wide advisor table; confirmed every remaining lint is dispositioned (11 GATED + 2 `rls_policy_always_true` service-role + 2 needs-operator); routed the PERFORMANCE advisors to Phase 9 (`auth_rls_initplan` x62, `multiple_permissive_policies` x48, `unindexed_foreign_keys` x8, `unused_index` x41); document-and-routed the non-DB items (`http_request_queue` NULL-url cron, prod-cron-invokes-preview, `analyze-career-v2`/`chat-agent` orphans); set `nyquist_compliant: true`; recorded the zero-app-code-change close-out.

## Task Commits

Each task was committed atomically:

1. **Task 1: read-map x60 EXECUTE grants + author REVOKE migrations** - `5cfbc665` (feat)
   - **Task 1-fix: revoke FROM PUBLIC (effective-grant correctness) + has_function_privilege verify** - `6f9f61b5` (fix)
2. **Task 2: record EXECUTE-revoke resolution evidence (advisor 64->15, gate validated)** - `8b30212b` (docs; combined with Task 3 audit-completeness)
3. **Task 3: DB-05 audit completeness + perf-class -> Phase 9 + nyquist_compliant** - `8b30212b` (RUNTIME-RELIABILITY.md) + this metadata commit (RESIDUAL-REGISTER perf rows were in `5cfbc665`; 08-VALIDATION nyquist flip in the final metadata commit)

**Plan metadata:** (this SUMMARY + 08-VALIDATION nyquist flip + STATE/ROADMAP) committed separately.

## Files Created/Modified

- `supabase/migrations/20260608000010_revoke_anon_execute_security_definer_rpcs.sql` - FORWARD: `REVOKE EXECUTE ... FROM PUBLIC, anon` x30 (removes the blanket PUBLIC + explicit anon grant). VERIFICATION: `has_function_privilege('anon', ...)` = 0 across all 30. ROLLBACK: `GRANT EXECUTE ... TO PUBLIC` x30.
- `supabase/migrations/20260608000011_revoke_authenticated_execute_unused_definer_rpcs.sql` - FORWARD: `REVOKE EXECUTE ... FROM authenticated` x19 (the provably-unused; FROM PUBLIC alone doesn't drop authenticated's explicit grant). VERIFICATION: `has_function_privilege('authenticated', ...)` = 0 on the 19 + = 11 on the KEEP set (no-regression). ROLLBACK: `GRANT EXECUTE ... TO authenticated` x19.
- `.planning/audit/RUNTIME-RELIABILITY.md` - the x60 read-map verdict table + the effective-grant correction note; flipped the two `*_security_definer_function_executable` rows (anon RESOLVED 30->0; authenticated PARTIAL/GATED 30->11); appended the "DB-05 Plan 08-05 resolution evidence" section (prominent Rule-1 deviation, before/after `has_function_privilege` + advisor deltas, KEEP set, prod SET-ROLE caveat) + the "DB-05 audit completeness" section (73->15 table + close-out).
- `.planning/audit/RESIDUAL-REGISTER.md` - R-DB-05 (the 11 GATED authenticated-KEEP RPCs with per-function why-deferred) + the Phase-9-routed perf-class advisory rows + the document-and-route non-DB items.
- `.planning/phases/08-database-cleanup-migrations/08-VALIDATION.md` - `nyquist_compliant: true`, `status: complete`, `wave_0_complete: true`; ticked the validation checklist.
- `.planning/phases/08-database-cleanup-migrations/08-05-SUMMARY.md` - this summary.

## Decisions Made

- **REVOKE FROM PUBLIC, anon — not FROM anon alone.** The blanket PUBLIC EXECUTE grant (`proacl =X/postgres`) keeps anon/authenticated effectively executable until PUBLIC is revoked. The advisor uses `has_function_privilege` (effective), so the FROM-anon-only first form was a no-op. `information_schema.role_routine_grants` (the original DO-block source) is PUBLIC-blind and falsely passed.
- **The 19 authenticated revokes still need `FROM authenticated`.** `FROM PUBLIC` does NOT drop authenticated's own explicit grant (every one of the 30 carries one at baseline), so `..0011` must explicitly revoke the 19's authenticated grant; the 11 KEEP keep theirs.
- **The 11 KEEP are intentional + documented.** 10 live FE RPCs (`can_perform_ai_action` headline) + `auth_owns_version` (RLS `USING()` context). Their authenticated EXECUTE is load-bearing; the advisor's residual 11 is the documented-intentional GATED set (R-DB-05).
- **service_role is never touched.** Its explicit grant survives FROM PUBLIC, so every edge-function caller is unaffected — zero access regression.
- **DB-05 COMPLETE.** 73 -> 15; the 15 remaining are all intentional/out-of-DB-migration-scope. Perf-class -> Phase 9 per D-02.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] REVOKE EXECUTE ... FROM anon/authenticated was an EFFECTIVE NO-OP (blanket PUBLIC grant + PUBLIC-blind verification)**
- **Found during:** Task 2 (preview->prod gate — the advisor DID NOT clear after the first apply to preview)
- **Issue:** The 30 SECURITY DEFINER RPCs carry a blanket `PUBLIC` EXECUTE grant (`proacl =X/postgres`) in addition to explicit anon/authenticated grants. `REVOKE EXECUTE ... FROM anon` removes only the explicit anon grant; anon (a PUBLIC member) stays effectively executable, so `has_function_privilege('anon', fn, 'EXECUTE')` — the predicate the advisor uses — stayed TRUE and the advisor kept firing. NET security improvement = ZERO. The original verification DO-blocks queried `information_schema.role_routine_grants` (EXPLICIT grants only, PUBLIC-blind), so they **falsely passed** — the migration would have applied cleanly to prod while improving security by nothing.
- **Fix:** Rewrote `20260608000010` to `REVOKE EXECUTE ... FROM PUBLIC, anon` on all 30 (removes blanket + explicit anon); rollback re-grants `TO PUBLIC`. Kept `20260608000011` `FROM authenticated` on the 19 (FROM PUBLIC alone does not drop authenticated's explicit grant). Replaced BOTH verification DO-blocks with `has_function_privilege` (the advisor's own predicate) — asserting anon=0 / authenticated=0-on-19 / authenticated=11-on-KEEP. Caught and corrected BEFORE any prod apply.
- **Files modified:** `supabase/migrations/20260608000010_*.sql`, `supabase/migrations/20260608000011_*.sql`, `.planning/audit/RUNTIME-RELIABILITY.md` (read-map correction note)
- **Verification:** Corrected preview apply -> `anon_security_definer_function_executable` 30->0, `authenticated_security_definer_function_executable` 30->11, `has_function_privilege` anon=0/auth=11/service=30; prod re-verify IDENTICAL.
- **Committed in:** `6f9f61b5` (separate `fix(08-05)` commit; the original `5cfbc665` feat commit was NOT amended)

---

**Total deviations:** 1 auto-fixed (1 bug, caught pre-apply by the preview gate)
**Impact on plan:** The fix was necessary for the migrations to have ANY security effect; it produced the intended end-state (anon-definer-executable 30->0, authenticated 30->11). No scope creep. This is the SECOND time the Phase-8 preview gate caught a bug before prod (cf. 08-04's aborting verification predicate) — the gate is a genuine test-first surface, not just a deploy step.

## Issues Encountered

- **Blocking checkpoint (Task 2, expected) + the effective-grant catch.** Task 2 (`checkpoint:human-verify`, gate=blocking) required MCP apply/verify the executor does not hold + the operator's prod application. The executor STOPPED and returned a structured checkpoint with the exact forward SQL + verify reads. The orchestrator's preview apply surfaced the effective no-op; the executor corrected both files and RE-CHECKPOINTED with the corrected SQL; the operator applied the corrected files to prod and approved. The executor invoked NO MCP tool (the `supabase-prod-readonly` + `supabasepreview` server instructions appeared mid-session and were deliberately NOT invoked).
- **Prod SET-ROLE probe blocked (recorded caveat).** `supabase-prod-readonly` lacks `SET ROLE` privilege, so the no-regression invocation (`can_perform_ai_action` as authenticated) ran on PREVIEW; the prod proof is `has_function_privilege` (anon=0/auth=11/service=30) + the IDENTICAL advisor end-state — the same approach as 08-03/08-04. A read-only-MCP tooling limit, not a migration issue.

## User Setup Required

None for this plan. Operator follow-ups still queued from 08-01 (backlog, NOT Phase-8 migrations): re-point prod cron jobs 1 (`keep-warm-ping`) & 6 (`extract_catchup_nightly`) off the PREVIEW functions host; the `http_request_queue` NULL-url cron ERROR; the `public_bucket_allows_listing` + `auth_leaked_password_protection` needs-operator advisories (Phase 9 / Auth dashboard).

## Next Phase Readiness

- **Phase 8 is functionally complete (5/5 plans).** DB-03 (0 removals — nothing crossed the disuse bar on low-traffic prod), DB-04 (usage_tracking/can_perform_ai_action GATED), DB-05 (security advisor 73->15, every lint dispositioned), DB-06 (forward+rollback on all 12 Phase-8 migrations) — ALL satisfied. The orchestrator runs phase verification + `phase.complete` after this finalize.
- **Phase 9 input ready:** the PERFORMANCE advisor backlog (`auth_rls_initplan` x62, `multiple_permissive_policies` x48, `unindexed_foreign_keys` x8, `unused_index` x41) is documented + routed in RESIDUAL-REGISTER.md with per-advisory clearance phases.
- **Gates clean:** secret-VALUE grep = 0 over all docs; `git diff -- src supabase/functions` EMPTY across all of Phase 8 (the two FE call sites byte-identical, D-06); both migration files committed (Tasks 1/1-fix); no `.ps1` touched; ZERO prod/preview SQL applied by the executor; ZERO MCP tool invoked by the executor.

## Self-Check: PASSED

- Files verified present: `supabase/migrations/20260608000010_revoke_anon_execute_security_definer_rpcs.sql`, `supabase/migrations/20260608000011_revoke_authenticated_execute_unused_definer_rpcs.sql`, the modified `.planning/audit/RUNTIME-RELIABILITY.md` (read-map table + "DB-05 Plan 08-05 resolution evidence" + "DB-05 audit completeness" + the two flipped advisor rows), `.planning/audit/RESIDUAL-REGISTER.md` (R-DB-05 + Phase-9 routing + document-and-route), `.planning/phases/08-database-cleanup-migrations/08-VALIDATION.md` (`nyquist_compliant: true`), this SUMMARY.
- Commits verified in history: `5cfbc665` (Task 1), `6f9f61b5` (Task 1-fix), `8b30212b` (Task 2/3 evidence).
- Gates: both migrations have forward + rollback (DB-06); both filenames sort strictly after `20260607050000`; `can_perform_ai_action` authenticated REVOKE is ABSENT in migrations; secret-VALUE grep = 0 over all docs incl. this SUMMARY; `git diff -- src supabase/functions` EMPTY (migrations + docs only); the two EXECUTE advisory rows flipped off `deferred-to-Phase-8`; zero prod/preview writes by the executor; zero MCP tool invoked.

---
*Phase: 08-database-cleanup-migrations*
*Completed: 2026-06-24*

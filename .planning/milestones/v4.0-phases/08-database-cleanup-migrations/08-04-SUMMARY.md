---
phase: 08-database-cleanup-migrations
plan: 04
subsystem: database
tags: [supabase, postgres, rls, search_path, linkedin_grades, rate-limiter, select-as-role, preview-to-prod-gate, names-not-values, grant-altering, db-05, db-06]

# Dependency graph
requires:
  - phase: 08-database-cleanup-migrations (plan 01)
    provides: "Canonical-prod ground truth (zjpjapgraoxdukdvpjes): linkedin_grades 'Anyone can view' over-permissive SELECT CONFIRMED LIVE (outcome (i), a real DROP fix) + increment_rate_limit proconfig=null"
  - phase: 08-database-cleanup-migrations (plan 02)
    provides: "Preview cimjltzovkahkqecpwgi un-paused + at repo HEAD, preview-vs-prod parity, the preview->prod 4-step HARD gate in force"
  - phase: 08-database-cleanup-migrations (plan 03)
    provides: "The provably-zero-change DB-05 tier applied+verified (advisors 73->65); function_search_path_mutable reduced 2->1 (increment_rate_limit remaining); the per-fix evidence-row pattern in RUNTIME-RELIABILITY.md"
  - phase: 07.1-runtime-reliability-review
    provides: "The pre-authored RUN-06 linkedin_grades forward+rollback handoff + the captured live prior policy state for the rollback (D-08)"
provides:
  - "2 forward+rollback migration files (20260608000008 linkedin_grades owner-scope DROP-only + 20260608000009 increment_rate_limit search_path=public) for the D-03 grant-altering DB-05 tier"
  - "Both APPLIED + VERIFIED preview->prod: get_advisors(security) 65->64 (-1) IDENTICAL preview/prod; function_search_path_mutable 1->0 (DB-wide cleared, remaining []); linkedin_grades SELECT now owner-scoped only; increment_rate_limit proconfig=search_path=public"
  - "SELECT-as-role no-regression proof (preview, byte-identical schema): owner=9 rows preserved, non-owner=0 (cross-user read DENIED); increment_rate_limit RPC probe returned integer 1 (no 500) -> =public resolves the unqualified rate_limit_counters ref"
  - "RUN-06 + increment_rate_limit advisory rows flipped off deferred-to-Phase-8 -> RESOLVED-2026-06-24 (Plan 08-04) in RUNTIME-RELIABILITY.md, with before/after + SELECT-as-role evidence (names-not-values)"
affects: [08-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Minimal grant-altering RLS fix: DROP the over-permissive policy ONLY when a legitimate owner-scoped policy already exists -- creating a redundant owner policy would keep multiple_permissive_policies lit + risk an aborting verification"
    - "ALTER FUNCTION ... SET search_path = public (NOT '') for a function whose body references an UNQUALIFIED public.* object -- = '' would 500 the live rate-limit path"
    - "Pre-apply catalog re-read as a hard gate step: catch a migration that would ABORT (verification DO-block targeting the wrong predicate) BEFORE any apply"
    - "SELECT-as-role no-regression probe (owner sees own rows, non-owner denied) as the load-bearing access-regression proof verify:baseline cannot supply"

key-files:
  created:
    - "supabase/migrations/20260608000008_linkedin_grades_owner_select.sql"
    - "supabase/migrations/20260608000009_pin_search_path_increment_rate_limit.sql"
    - ".planning/phases/08-database-cleanup-migrations/08-04-SUMMARY.md"
  modified:
    - ".planning/audit/RUNTIME-RELIABILITY.md"

key-decisions:
  - "linkedin_grades fix is DROP-only (no CREATE): the pre-existing 'Users can view their own LinkedIn grades' (role public, qual auth.uid()=user_id) already owner-scopes SELECT idiomatically; dropping the over-permissive policy leaves it as the sole SELECT policy (2->1, multiple_permissive_policies clears). Re-creating an owner policy would be redundant + would have aborted the verification."
  - "increment_rate_limit pinned with = public (NOT '') because its ON CONFLICT body references UNQUALIFIED rate_limit_counters; = '' would 500 every rate-limit check (live business-critical path)"
  - "Rollback faithfully restores the live prior policy (D-08): single CREATE of 'Anyone can view linkedin grades' (public, USING true); the pre-existing owner policy is untouched so rollback need not restore it"
  - "No-regression proven via preview SELECT-as-role probe (owner=9, non-owner=0) + preview RPC probe (=1) on the byte-identical schema + prod pg_policies/pg_proc parity; prod SET ROLE probe blocked by read-only-MCP privilege (a tooling limit, not a migration issue)"

patterns-established:
  - "Pattern: D-03 VERIFY-THEN-APPLY grant-altering tier -- fresh live-policy re-confirm (D-08) + code read-map (no caller depends on the grant) + SELECT-as-role no-regression, each behind the preview->prod gate with an operator-applied prod step"
  - "Pattern: the pre-apply gate catches an aborting migration (wrong verification predicate) before it touches the DB -- the gate is a test-first surface, not just a deploy step"

requirements-completed: [DB-05, DB-06]

# Metrics
duration: 30min
completed: 2026-06-24
---

# Phase 8 Plan 04: Grant-Altering DB-05 Fixes (linkedin_grades owner-scope + increment_rate_limit search_path) Summary

**Authored, corrected (pre-apply gate caught an aborting verification predicate), applied (preview->prod gate, operator-applied to prod), and verified 2 forward+rollback migrations for the D-03 grant-altering DB-05 tier -- DROP the over-permissive `linkedin_grades` "Anyone can view" SELECT (leaving the pre-existing owner-scoped policy as the sole reader) and pin `increment_rate_limit` search_path with `= public`. `get_advisors(security)` dropped 65->64 (-1) IDENTICALLY on preview AND prod; `function_search_path_mutable` reached 0 DB-wide; a SELECT-as-role probe proved owner=9 rows preserved / non-owner=0 denied, and an `increment_rate_limit` RPC probe returned `1` (no 500), proving `= public` resolves the unqualified `rate_limit_counters` ref.**

## Performance

- **Duration:** ~30 min (2 authoring tasks + a pre-apply fix + the blocking preview->prod gate resolution)
- **Started:** 2026-06-25T01:03:43Z (Plan 08-04 execution start)
- **Completed:** 2026-06-24 (operator prod-apply + re-verify)
- **Tasks:** 3 (Tasks 1-2 autonomous authoring; Task 3 the blocking `checkpoint:human-verify` apply/verify gate)
- **Files modified:** 2 migration files created + 1 audit doc modified (+1 SUMMARY)

## Accomplishments

- **Task 1 -- linkedin_grades owner-scope (DROP-only) migration.** Re-confirmed the LIVE prod state (08-01 + a fresh preview re-read): `linkedin_grades` has TWO public-role SELECT policies -- the over-permissive `"Anyone can view linkedin grades"` (qual `true`) AND the legitimate pre-existing `"Users can view their own LinkedIn grades"` (role public, qual `auth.uid()=user_id`). Outcome (i): a real fix. D-03 read-map (`rg "linkedin_grades" src supabase/functions`) confirmed FE reads are all owner-scoped (`LinkedInGrader.tsx:214` relies on RLS auto-scoping; `AnalysisHistory.tsx:223`, `Dashboard.tsx:284`, `PriorLinkedInSelector.tsx:91`, `AnalysisComparisonModal.tsx:281` all `.eq('user_id', ...)`) and app reads are service-role (bypass RLS) -- no caller depends on the public grant. Authored `20260608000008_linkedin_grades_owner_select.sql` sequencing the RUN-06 handoff.
- **Task 2 -- increment_rate_limit search_path pin (`= public`).** Authored `20260608000009_pin_search_path_increment_rate_limit.sql`: `ALTER FUNCTION public.increment_rate_limit(text, bigint) SET search_path = public` + `RESET` rollback. `= public` (NOT `''`) because the body's `ON CONFLICT DO UPDATE SET counter = rate_limit_counters.counter + 1` references UNQUALIFIED `rate_limit_counters` (`20260330000000_add_rate_limit_counters.sql:37`); `= ''` would 500 every rate-limit check. Sole caller is `rate-limiter.ts:90,129` via service-role RPC. The WHY-block documents the `= ''` hazard explicitly.
- **Task 3 -- preview->prod gate (blocking checkpoint, operator-applied).** Executor STOPPED at the gate (no MCP tools) and returned the exact forward SQL + verify reads. The orchestrator's pre-apply catalog re-read CAUGHT a bug in the original `20260608000008` (see Deviations), which the executor corrected to DROP-only BEFORE any apply. The orchestrator then applied both corrected files to preview and read-only verified; the OPERATOR applied them to prod `zjpjapgraoxdukdvpjes` via `db push` and approved; the orchestrator re-verified read-only. **Result (names-not-values): `get_advisors(security)` 65->64 (-1) IDENTICAL preview/prod; `function_search_path_mutable` 1->0 (DB-wide remaining `[]`); `pg_policies` linkedin_grades sole SELECT = owner-scoped `"Users can view their own LinkedIn grades"`; `pg_proc` increment_rate_limit proconfig=search_path=public.** SELECT-as-role probe (preview): owner=9 rows preserved, non-owner=0 (cross-user DENIED); RPC probe returned `1` (no 500). Recorded the per-fix evidence + flipped the RUN-06 + increment_rate_limit rows off `deferred-to-Phase-8`.

## Task Commits

Each task was committed atomically:

1. **Task 1: author linkedin_grades owner-scope SELECT migration** - `af6c2a75` (feat)
   - **Task 1-fix: correct migration to DROP-only (pre-apply gate caught abort bug)** - `99104f14` (fix)
2. **Task 2: pin increment_rate_limit search_path = public** - `f7285cea` (feat)
3. **Task 3: record DB-05 grant-altering resolution evidence (gate validated)** - `620ea1cf` (docs)

**Plan metadata:** (this SUMMARY + STATE/ROADMAP) committed separately.

## Files Created/Modified

- `supabase/migrations/20260608000008_linkedin_grades_owner_select.sql` - FORWARD: `DROP POLICY IF EXISTS "Anyone can view linkedin grades"` (DROP-only; the pre-existing owner-scoped policy serves SELECT). VERIFICATION: assert no `qual='true'` SELECT policy remains. ROLLBACK: single CREATE restoring `"Anyone can view linkedin grades"` (public, USING true).
- `supabase/migrations/20260608000009_pin_search_path_increment_rate_limit.sql` - FORWARD: `ALTER FUNCTION public.increment_rate_limit(text, bigint) SET search_path = public`. ROLLBACK: `RESET search_path`. WHY-block documents the `= ''`-would-500 hazard.
- `.planning/audit/RUNTIME-RELIABILITY.md` - Flipped the RUN-06 linkedin_grades row + the increment_rate_limit `function_search_path_mutable` deferral to `RESOLVED-2026-06-24 (Plan 08-04)`; appended the "DB-05 Plan 08-04 resolution evidence" section (65->64 delta, per-fix table, read-map, the pre-apply gate catch, the prod SET ROLE caveat).
- `.planning/phases/08-database-cleanup-migrations/08-04-SUMMARY.md` - this summary.

## Decisions Made

- **linkedin_grades fix is DROP-only.** The pre-existing `"Users can view their own LinkedIn grades"` (role public, qual `auth.uid()=user_id`) already owner-scopes SELECT idiomatically (anon's `auth.uid()` is null -> sees nothing). Dropping the over-permissive policy leaves it as the sole SELECT policy (2->1, `multiple_permissive_policies` clears). Creating a redundant owner policy was rejected.
- **increment_rate_limit pinned `= public`, never `= ''`.** The body references unqualified `rate_limit_counters`; `= ''` would 500 the live rate-limit path. `= public` is the repo convention for functions touching `public.*` and is provably zero-change (RPC probe returned `1`).
- **Rollback fidelity (D-08).** The linkedin_grades rollback restores the live prior `"Anyone can view linkedin grades"` (public, USING true) exactly; it does not touch the pre-existing owner policy.
- **No-regression proof.** Conclusive via preview SELECT-as-role (owner=9/non-owner=0) + RPC probe (=1) on the byte-identical schema + prod `pg_policies`/`pg_proc` parity. The prod SET ROLE probe was blocked by a read-only-MCP privilege limit (recorded; not a migration issue).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] linkedin_grades migration would have ABORTED on apply (wrong verification predicate + redundant policy)**
- **Found during:** Task 3 (preview->prod gate, pre-apply catalog re-read)
- **Issue:** The original `20260608000008` (commit `af6c2a75`) DROPped the over-permissive policy AND created a new `"Owners can view their linkedin grades"` (authenticated) policy, with a verification DO-block asserting ZERO public-role SELECT policies. But the legitimate pre-existing `"Users can view their own LinkedIn grades"` is itself role `public` (with an owner qual), so that assertion would RAISE EXCEPTION -> the whole transaction would ABORT. It also created a redundant second owner policy, keeping `multiple_permissive_policies` lit.
- **Fix:** Rewrote the forward to DROP-only (no CREATE -- the pre-existing owner policy already serves SELECT), changed the verification to target `qual='true'` (not all-public), and reduced the rollback to a single CREATE. Caught and corrected BEFORE any apply.
- **Files modified:** `supabase/migrations/20260608000008_linkedin_grades_owner_select.sql`
- **Verification:** Post-fix `rg` checks (0 active CREATE in forward; verification targets `qual='true'`; single rollback CREATE); then the preview apply succeeded (no abort) and prod applied cleanly.
- **Committed in:** `99104f14` (separate `fix(08-04)` commit; the original `af6c2a75` was a local-staging commit, not amended)

---

**Total deviations:** 1 auto-fixed (1 bug, caught pre-apply by the gate)
**Impact on plan:** The fix was necessary for the migration to apply at all and produced a strictly-better end-state (single owner-scoped SELECT policy; `multiple_permissive_policies` for linkedin_grades clears). No scope creep -- still DROP + owner-scope as the plan intended.

## Issues Encountered

- **Blocking checkpoint (Task 3, expected).** Task 3 (`checkpoint:human-verify`, gate=blocking) required MCP apply/verify the executor does not hold + the operator's prod application. The executor STOPPED and returned a structured checkpoint with the exact SQL + verify reads (including the SELECT-as-role no-regression queries); the orchestrator (preview apply + read-only verify, incl. the pre-apply catch) and operator (prod apply) resolved it and supplied the verified deltas. The executor invoked no MCP tool (the `supabase-prod-readonly` + `supabasepreview` server instructions appeared mid-session and were deliberately NOT invoked).
- **Prod SELECT-as-role probe blocked (recorded caveat).** `supabase-prod-readonly` lacks `SET ROLE` privilege ("permission denied to set role authenticated"), and the RPC functional probe runs only on preview (prod is read-only). The no-regression is proven by the preview probes on the byte-identical schema + prod `pg_policies`/`pg_proc` end-state parity. This is a read-only-MCP tooling limit, not a migration issue.

## User Setup Required

None for this plan. Operator follow-up still queued from 08-01 (backlog, NOT a Phase-8 migration): re-point prod cron jobs 1 (`keep-warm-ping`) & 6 (`extract_catchup_nightly`) off the PREVIEW functions host.

## Next Phase Readiness

- **08-05 input ready (the LAST + most-scrutinized wave):** the x60 `anon`/`authenticated` `_security_definer_function_executable` EXECUTE-grant set -- read-map -> revoke-provably-unused-or-gate; `can_perform_ai_action` authenticated EXECUTE STAYS gated (live FE RPC at `Navbar.tsx:109` + `SkillsGapAnalysis.tsx:108`). Plus DB-05 audit completeness, perf-class -> Phase 9, and phase close-out.
- **Advisory state after 08-04:** `get_advisors(security)` 64 on prod (was 65); `function_search_path_mutable` = 0 (fully cleared); `rls_policy_always_true` 2 + `public_bucket_allows_listing` 1 remain (Phase 9 / backlog, D-02).
- **Gates clean:** secret-VALUE grep = 0 over the evidence rows + this SUMMARY; `git diff -- src supabase/functions` EMPTY (migrations + docs only); the 2 migration files committed (Tasks 1/1-fix/2); no `.ps1` touched; ZERO prod SQL applied by the executor; ZERO MCP tool invoked by the executor.

## Self-Check: PASSED

- Files verified present: `supabase/migrations/20260608000008_linkedin_grades_owner_select.sql`, `supabase/migrations/20260608000009_pin_search_path_increment_rate_limit.sql`, the modified `.planning/audit/RUNTIME-RELIABILITY.md` (with the new "DB-05 Plan 08-04 resolution evidence" section + the flipped RUN-06/increment_rate_limit rows), this SUMMARY.
- Commits verified in history: `af6c2a75` (Task 1), `99104f14` (Task 1-fix), `f7285cea` (Task 2), `620ea1cf` (Task 3).
- Gates: both migrations have forward + rollback (DB-06); both filenames sort strictly after `20260607050000`; secret-VALUE grep = 0 over the evidence rows + this SUMMARY; `git diff -- src supabase/functions` EMPTY; RUN-06 + increment_rate_limit rows flipped off `deferred-to-Phase-8` (`RESOLVED-2026-06-24 (Plan 08-04)`); zero prod/preview writes by the executor; zero MCP tool invoked.

---
*Phase: 08-database-cleanup-migrations*
*Completed: 2026-06-24*

---
phase: 08-database-cleanup-migrations
reviewed: 2026-06-25T02:47:32Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - supabase/migrations/20260608000000_v_merits_in_circulation_security_invoker.sql
  - supabase/migrations/20260608000001_v_feature_consumption_daily_security_invoker.sql
  - supabase/migrations/20260608000002_v_shop_purchases_daily_security_invoker.sql
  - supabase/migrations/20260608000003_v_conversion_funnel_security_invoker.sql
  - supabase/migrations/20260608000004_pin_search_path_ts_to_utc_date.sql
  - supabase/migrations/20260608000005_alert_state_explicit_deny.sql
  - supabase/migrations/20260608000006_rate_limit_counters_explicit_deny.sql
  - supabase/migrations/20260608000007_stripe_webhook_events_explicit_deny.sql
  - supabase/migrations/20260608000008_linkedin_grades_owner_select.sql
  - supabase/migrations/20260608000009_pin_search_path_increment_rate_limit.sql
  - supabase/migrations/20260608000010_revoke_anon_execute_security_definer_rpcs.sql
  - supabase/migrations/20260608000011_revoke_authenticated_execute_unused_definer_rpcs.sql
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-06-25T02:47:32Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Reviewed 12 DB-05 security-hardening migrations (analytics-view `security_invoker` flips,
`search_path` pins, explicit deny-all policies on 3 service-role-only tables, removal of an
over-permissive `linkedin_grades` SELECT policy, and EXECUTE-grant revocation on 30 SECURITY
DEFINER RPCs). I cross-referenced every load-bearing claim against the actual function
definitions, RLS policy history, and frontend/edge `.rpc()` call sites — not just the migration
prose.

**Core correctness holds.** I independently verified the high-stakes claims:

- `increment_rate_limit` body references **unqualified** `rate_limit_counters` in its
  `ON CONFLICT ... DO UPDATE` (`20260330000000:37`), confirming `SET search_path = public` is
  required and `= ''` would 500 the rate limiter. The pin is correct.
- `ts_to_utc_date` body is `SELECT ($1 AT TIME ZONE 'UTC')::date` with **no** schema-object
  references (`20260525000005:483`), so `SET search_path = ''` is provably safe.
- `linkedin_grades` had exactly two SELECT policies (over-permissive `USING (TRUE)` + owner-scoped
  `auth.uid() = user_id`); the DROP correctly leaves the owner policy as the sole SELECT policy.
  The cited `LinkedInGrader.tsx` read-by-`id` path relies on RLS auto-scoping — verified.
- All 19 "provably unused" RPCs have **zero** `src/**` `.rpc()` callers (verified with both
  single- and double-quote matching). All 11 KEEP functions are single-overload, so the
  `v_11_auth = 11` no-regression assertion is sound. `record_ai_usage`'s two overloads are both
  present and both revoked.
- `REVOKE FROM PUBLIC, anon` is the correct fix (the explicit-anon-only first form was an
  effective no-op because of the blanket PUBLIC grant — the migration's own correction note is
  accurate and matches `has_function_privilege` semantics).

**The defects below are concentrated in rollback fidelity (DB-06) for two functions that were
created service-role-only**, plus framing/precision issues. None blocks the security objective,
and the migrations were verified live (advisor 73 -> 15). They are flagged because DB-06 demands a
**faithful** documented rollback and the rollback for two functions would over-grant if executed.

## Warnings

### WR-01: Rollback for `get_ai_failure_rate_1h` / `get_shop_failure_rate_1h` over-grants — not a faithful inverse (DB-06)

**File:** `supabase/migrations/20260608000011_revoke_authenticated_execute_unused_definer_rpcs.sql:126-127`
**Issue:** Both functions were created with `revoke all ... from public` + `grant execute ... to
service_role` and were **never** granted to `authenticated`
(`20260416000000_merit_enforcement_observability.sql:114-115,135-136`). The forward
`REVOKE EXECUTE ... FROM authenticated` is therefore a silent no-op for them (correct), but the
documented rollback re-grants a privilege that **never existed** pre-migration:

```sql
-- GRANT EXECUTE ON FUNCTION public.get_ai_failure_rate_1h() TO authenticated;   -- WRONG: never held
-- GRANT EXECUTE ON FUNCTION public.get_shop_failure_rate_1h() TO authenticated; -- WRONG: never held
```

Executing this rollback would *grant* authenticated EXECUTE on two SECURITY DEFINER analytics RPCs
that read `merit_transactions` / `merit_shop_purchases` — a small privilege *expansion* relative to
the true prior state, the opposite of the migration's intent.
**Fix:** Remove (or explicitly NULL out) the `authenticated` rollback lines for these two
functions. The faithful inverse is "no authenticated grant existed; do nothing." A precise rollback:

```sql
-- get_ai_failure_rate_1h / get_shop_failure_rate_1h were service_role-only at baseline.
-- They held NO authenticated grant; the forward REVOKE was a no-op, so the rollback is also a no-op.
-- (Do NOT GRANT ... TO authenticated.)
```

### WR-02: Rollback in `..0010` re-grants PUBLIC on functions that were never PUBLIC-executable — over-grants two analytics RPCs

**File:** `supabase/migrations/20260608000010_revoke_anon_execute_security_definer_rpcs.sql:140-141`
**Issue:** Same two functions (`get_ai_failure_rate_1h`, `get_shop_failure_rate_1h`) carried
`revoke all ... from public` at creation, so PUBLIC (and thus anon) could **not** EXECUTE them
pre-migration. The `..0010` forward `REVOKE ... FROM PUBLIC, anon` is a no-op for them, but the
documented rollback `GRANT EXECUTE ... TO PUBLIC` would *open* them to PUBLIC/anon — a real
privilege expansion versus the true prior state (service_role-only).
**Fix:** Drop the PUBLIC re-grant rollback lines for these two functions; their faithful inverse is
no-op. (The block-level claim on lines 41-43 that "the rollback re-grants PUBLIC EXECUTE ... the
faithful inverse" is therefore inaccurate for these two members and should be footnoted.)

### WR-03: Imprecise scope claim — these RPCs were already locked, inflating the "30 anon-executable / 19 authenticated-unused" framing

**File:** `supabase/migrations/20260608000010_revoke_anon_execute_security_definer_rpcs.sql:5-7`,
`supabase/migrations/20260608000011_revoke_authenticated_execute_unused_definer_rpcs.sql:1-3`
**Issue:** The header asserts the advisor reported `anon` can EXECUTE all 30 and `authenticated`
can EXECUTE the 19. But `get_ai_failure_rate_1h` / `get_shop_failure_rate_1h` were created with an
explicit `revoke all from public` + grant only to `service_role`, so neither anon nor authenticated
ever held an effective grant on them. Including them in the revoke sets is harmless (REVOKE of an
absent grant succeeds), but the prose overstates what those two contribute to the advisor count.
This is a documentation-accuracy defect that could mislead a future operator re-deriving the
"30 -> 0" / "19" math. The functional REVOKE is safe and idempotent.
**Fix:** Annotate these two as "already service_role-only at baseline; REVOKE is a defensive no-op,
not a behavior change" so the advisor delta is attributable correctly.

### WR-04: Each migration is a single un-wrapped statement set — no BEGIN/COMMIT; a 12-file set can half-apply across files

**File:** all 12 (representative: `supabase/migrations/20260608000010_revoke_anon_execute_security_definer_rpcs.sql`)
**Issue:** Supabase wraps each migration **file** in its own transaction, so within a file the
verification `DO` block correctly aborts/rolls back on failure (good). But the 12 files apply as 12
independent transactions. If file `..0010` succeeds and `..0011` fails its no-regression assertion
(`v_11_auth <> 11`), the database is left in a partially-hardened intermediate state (anon revoked,
authenticated revoke aborted) with no automatic cross-file rollback. Because the rollbacks are
**commented-out** (roll-forward-only per D-08/NFR-02), recovery is manual.
**Fix:** This is acceptable for a verified, gated, roll-forward-only set, but the phase should
document the explicit recovery runbook (which rollback blocks to un-comment, in reverse order) for
the "file N applied, file N+1 aborted" case so an operator is not improvising during an incident.

## Info

### IN-01: Three tables share the identical policy name (intentional, but worth noting)

**File:** `20260608000005_alert_state_explicit_deny.sql:26`,
`20260608000006_rate_limit_counters_explicit_deny.sql:28`,
`20260608000007_stripe_webhook_events_explicit_deny.sql:34`
**Issue:** All three explicit-deny policies are named
`"Service role only - no anon/authenticated access"`. Policy names are scoped per-table in
Postgres, so this is valid and the `duplicate_object` guard makes re-runs no-ops. Flagged only
because grep-based audits keyed on policy name will collide across the three tables.
**Fix:** None required. Optionally suffix with the table name for audit clarity.

### IN-02: Explicit-deny policies are `FOR ALL TO authenticated` — anon relies on implicit deny

**File:** `20260608000005_alert_state_explicit_deny.sql:27`,
`20260608000006_rate_limit_counters_explicit_deny.sql:29`,
`20260608000007_stripe_webhook_events_explicit_deny.sql:35`
**Issue:** The policy targets `authenticated` only. `anon` is denied by the absence of any
permissive policy (correct least-privilege), not by this explicit policy. This satisfies the
`rls_enabled_no_policy` advisor (any policy clears it) and is correct, but the policy name implies
it also denies anon when in fact anon's deny is implicit. Functionally equivalent.
**Fix:** None required; the behavior is correct. Consider `TO authenticated, anon` only if you want
the deny to be syntactically explicit for both roles.

### IN-03: Four `security_invoker` migrations are byte-identical except the view name — DRY/copy-paste

**File:** `20260608000000`–`20260608000003` (all four view flips)
**Issue:** The four analytics-view migrations are identical boilerplate differing only in the view
name, including the same zero-change rationale referencing
`admin-merit-metrics/index.ts` / `getServiceClient()`. Acceptable for one-migration-per-object
hygiene, but the duplicated rationale means a future correction must be applied in four places.
**Fix:** None required for correctness. If consolidated in future, keep one migration per object for
clean rollback granularity (the current choice) and factor the shared rationale into a phase note.

---

_Reviewed: 2026-06-25T02:47:32Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

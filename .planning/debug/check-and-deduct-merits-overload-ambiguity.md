---
status: resolved
created: 2026-05-20
updated: 2026-06-25
resolution: operator-confirmed completed & shipped; closed at v4.0 milestone close 2026-06-25
---

# Debug: check_and_deduct_merits overload ambiguity — RESOLVED

**Date:** 2026-05-20
**Reporter symptom:** Resume analysis failed; prod log showed
`check_and_deduct_merits failed: Could not choose the best candidate function between:
public.check_and_deduct_merits(uuid, text, text) [and] (uuid, text, text, text)`.

## Root cause

Two overloads of `check_and_deduct_merits` coexist in the DB:
- 3-arg `(uuid, text, text)` — `20260415000000_merit_rpcs.sql:67`
- 4-arg `(uuid, text, text, text DEFAULT NULL)` — `20260512000003_merit_transactions_idempotency.sql:93`

The gateway calls the RPC with exactly 3 named args (`merit-gateway.ts:201`). Because
the 4-arg overload's 4th param has `DEFAULT NULL`, a 3-arg call satisfies **both**
signatures. Postgres cannot disambiguate (SQLSTATE 42725) and the RPC errors at
dispatch → gateway fails closed (500 `merit_system_error`) → every Merit-gated
feature is blocked. The Phase 29 migration's "Postgres dispatches by arg count"
assumption is false for a DEFAULT-valued overload reached via PostgREST named args.

No merits lost — the call errored before any ledger write.

## Fix

`20260520000000_drop_legacy_check_and_deduct_merits_3arg.sql` — drops the legacy
3-arg overload. The 4-arg overload is a functional superset (NULL key short-circuits
the idempotency pre-check, otherwise identical body). The gateway's 3-named-arg call
then binds unambiguously to the 4-arg function with its default. No code change needed.

## To apply

Run `supabase migration up` against the affected environment(s) (staging + prod).
Verify by retrying a resume analysis.

## Follow-up consideration

Future DEFAULT-valued RPC overloads reached via PostgREST will hit the same trap.
Prefer either a distinct function name or dropping the superseded overload in the
same migration that adds the replacement.

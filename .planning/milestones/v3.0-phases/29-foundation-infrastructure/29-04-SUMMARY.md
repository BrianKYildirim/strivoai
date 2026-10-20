---
phase: 29
plan: 04
subsystem: merits
tags: [phase-29, merits, idempotency, migration, rpc, MER-04, NFR-01, NFR-07]
dependency_graph:
  requires:
    - "supabase/migrations/20260415000000_merit_rpcs.sql (3-arg check_and_deduct_merits, merit_transactions table)"
    - "supabase/migrations/20260422000000_phase_24_topup.sql (partial UNIQUE + EXCEPTION pattern reference)"
  provides:
    - "merit_transactions.idempotency_key column (text NULL)"
    - "merit_transactions_idempotency_key_unique partial UNIQUE index"
    - "public.check_and_deduct_merits(uuid, text, text, text) — 4-arg SECURITY DEFINER overload with NFR-07 race-storm tolerance"
  affects:
    - "Plan 29-06 gateway (`withMerits`) — can now forward idempotency_key to the RPC"
    - "Plan 29-09 behavioral gate (TEST-02 / NFR-07 parallel-fire) — exercises this RPC"
    - "Plan 31 Optimistic UI — frontend will generate crypto.randomUUID() and pass it"
tech_stack:
  added: []
  patterns:
    - "Partial UNIQUE index gated by source-discriminator (mirrors stripe_pi_unique)"
    - "Inner BEGIN/EXCEPTION WHEN unique_violation race-absorption (PL/pgSQL SQLSTATE 23505 catch)"
    - "Function overload by arg count — additive, non-breaking RPC evolution"
key_files:
  created:
    - "supabase/migrations/20260512000003_merit_transactions_idempotency.sql"
  modified: []
decisions:
  - "Used EXCEPTION WHEN unique_violation instead of ON CONFLICT (idempotency_key) per 29-RESEARCH.md anti-pattern table: partial-index inference is fragile in PostgreSQL"
  - "Did not modify the 3-arg check_and_deduct_merits; both signatures live in parallel via Postgres arg-count dispatch"
  - "EXCEPTION arm re-queries by idempotency_key + source='feature-deduct' to recover the winner's deduction_id, returning the same already_deducted=true shape as the entry-time pre-check"
metrics:
  duration_minutes: ~10
  completed_date: 2026-05-12
  tasks_completed: 1
  files_changed: 1
---

# Phase 29 Plan 04: merit_transactions idempotency Summary

**One-liner:** Server-side substrate for sync-path merit idempotency — `merit_transactions.idempotency_key` column, partial UNIQUE index gated on `source='feature-deduct'`, and a 4-arg `check_and_deduct_merits` overload that absorbs retry-storm races via `EXCEPTION WHEN unique_violation`.

## What Shipped

A single additive migration: `supabase/migrations/20260512000003_merit_transactions_idempotency.sql` (commit `a5b9233`).

### 1. New column

```sql
ALTER TABLE public.merit_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text NULL;
```

Only rows with `source = 'feature-deduct'` participate in the partial UNIQUE constraint. Refund / shop-credit (top-up) / subscription-reset / admin-adjust rows leave the column NULL by design. The column is text-typed so it accepts the client-generated UUIDs that Phase 31 will produce via `crypto.randomUUID()` (D-09).

### 2. Partial UNIQUE index

```sql
CREATE UNIQUE INDEX IF NOT EXISTS merit_transactions_idempotency_key_unique
  ON public.merit_transactions (idempotency_key)
  WHERE source = 'feature-deduct' AND idempotency_key IS NOT NULL;
```

Mirrors `merit_transactions_stripe_pi_unique` from `20260422000000_phase_24_topup.sql:36-38`. Non-feature-deduct rows and NULL keys are excluded from the constraint, so existing rows and future refund / top-up rows are unaffected.

### 3. New 4-arg RPC overload

```sql
CREATE OR REPLACE FUNCTION public.check_and_deduct_merits(
  p_user_id          uuid,
  p_feature          text,
  p_tier             text,
  p_idempotency_key  text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
```

Body strategy (D-09..D-12 + 29-RESEARCH.md §Pattern 4):

1. **Entry-time pre-check.** If `p_idempotency_key IS NOT NULL`, SELECT a prior `(metadata->>'deduction_id')::uuid` from `merit_transactions WHERE idempotency_key = p_idempotency_key AND source = 'feature-deduct' LIMIT 1`. On hit, short-circuit and return `{ success: true, transaction_id: <prior>, already_deducted: true }` without locking `user_merits`.
2. **Reused 3-arg body.** Tier-gated cost lookup → `tier_locked` early return; `user_merits` `FOR UPDATE` lock; `insufficient_merits` pre-check; LEAST() subscription-first split.
3. **Race-absorbing INSERT block.** Both leg INSERTs (subscription + shop) live inside a single inner `BEGIN ... EXCEPTION WHEN unique_violation THEN ... END;` block. Each INSERT carries `idempotency_key` in its column list and passes `p_idempotency_key` in VALUES. The EXCEPTION arm re-queries the prior `deduction_id` and returns the same `already_deducted=true` shape as the entry-time pre-check (NFR-07).
4. **Winner-path UPDATE.** `user_merits` is updated and the existing `{ success, transaction_id, remaining_balance, deducted_from }` shape is returned verbatim from the 3-arg body.

### 4. REVOKE / GRANT

```sql
REVOKE ALL ON FUNCTION public.check_and_deduct_merits(uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_and_deduct_merits(uuid, text, text, text)
  TO authenticated, service_role;
```

Targets the explicit 4-arg signature; the pre-existing 3-arg overload is not touched.

### 5. Verification DO-block

Read-only checks (idempotent — supports NFR-01 re-runnability):

- `idempotency_key` column present on `merit_transactions` via `information_schema.columns`.
- `merit_transactions_idempotency_key_unique` present in `pg_indexes` AND its `indexdef` contains `WHERE` (proves partiality).
- 4-arg `check_and_deduct_merits` present in `pg_proc` with `pronargs = 4` AND `prosecdef = true`.
- On success: `RAISE NOTICE 'Phase 29 MER-04 / NFR-07 verification passed: column + partial UNIQUE index + 4-arg RPC in place';`

## Threats Mitigated

| Threat ID | Mitigation realized in this plan |
|-----------|----------------------------------|
| T-29-IDEM | Partial UNIQUE index enforces row-level dedup for `source='feature-deduct'` rows; RPC catches `unique_violation` (SQLSTATE 23505) and returns the winner's `transaction_id`. NFR-07 retry-storm tolerance verified in Plan 29-09. |
| T-29-RPC-PRIV | `SECURITY DEFINER` + `SET search_path = public, pg_temp` + `REVOKE ALL FROM public` + explicit `GRANT EXECUTE TO authenticated, service_role` on the new 4-arg signature. |
| T-29-PARTIAL-IDX-MISCONFIG | Avoided `ON CONFLICT` inference against the partial UNIQUE (fragile); used `EXCEPTION WHEN unique_violation` block instead. Verification DO-block raises if the partial index is missing or non-partial. |
| T-29-IDEM-FAKE | Accepted (no action). UUIDv4 entropy is 122 bits; cross-user reuse is harmless because the RPC row-locks `user_merits` by `p_user_id`. |

## Deferred Work

- **Phase 31 (Optimistic UI):** Frontend will generate `crypto.randomUUID()` and send it in the request body field that the gateway forwards as `p_idempotency_key`. Until then, the column accepts NULL and the partial UNIQUE excludes NULL keys — current callers using the 3-arg overload are unaffected.
- **Plan 29-06 (gateway / `withMerits`):** Wire the `withMerits` helper to read the new request-body field and pass it as the 4th positional arg to `check_and_deduct_merits`. The plan-29-06 surface is the only place the 4-arg form needs to be invoked from edge functions.
- **Plan 29-09 (TEST-02 / NFR-07 behavioral gate):** Fire 5 parallel calls with the same `p_idempotency_key` and assert exactly one deduction; remaining four return `already_deducted=true`.
- **Plan 29-10 (schema-push verification):** Apply this migration to staging and exercise the `pg_indexes` / `pg_proc` queries from the plan's acceptance criteria.

## Deviations from Plan

- **One cosmetic comment reword.** The plan's Task 1 verification gate is a `node -e` script that scans the file for the literal strings `ON\s+CONFLICT\s*\(\s*idempotency_key\s*\)` and `\bDROP\s+(COLUMN|INDEX|FUNCTION|TABLE)\b` and rejects the migration if either is found. My initial header comment referenced the anti-pattern verbatim (e.g., "no DROP COLUMN, no DROP INDEX, no DROP FUNCTION" and a literal `ON CONFLICT (idempotency_key) ...` example). I reworded both comment lines to describe the policy without quoting the forbidden tokens. SQL semantics are unchanged.
- **No other deviations.** Existing 3-arg `check_and_deduct_merits` callers are unaffected (verified by inspection — no migration touches the 3-arg signature). Migration is structurally a clone of `20260422000000_phase_24_topup.sql`, the canonical analog the plan called out.

## Authentication Gates

None — pure SQL migration, no external service calls, no auth flow.

## Known Stubs

None. The column is intentionally NULLable until Phase 31 wires the frontend; this is the documented contract, not a stub.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `a5b9233` | feat | add merit_transactions idempotency_key + 4-arg check_and_deduct_merits |

## Self-Check: PASSED

- File `supabase/migrations/20260512000003_merit_transactions_idempotency.sql` exists at `/c/Projects/strive-ai-hired/.claude/worktrees/agent-a05a3cf5cd5df42c3/supabase/migrations/`.
- Commit `a5b9233` present in `git log` on branch `worktree-agent-a05a3cf5cd5df42c3`.
- Forbidden-pattern grep on the migration file returns no matches for `ON\s+CONFLICT\s*\(\s*idempotency_key\s*\)` (case-insensitive).
- Forbidden-pattern grep on the migration file returns no matches for `\bDROP\s+(COLUMN|INDEX|FUNCTION|TABLE)\b` (case-insensitive).
- All 14 required-token patterns from the plan's `node -e` gate are present (47 total occurrences across the patterns).

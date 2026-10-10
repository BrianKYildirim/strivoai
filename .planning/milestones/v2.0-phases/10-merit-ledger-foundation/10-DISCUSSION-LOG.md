# Phase 10: merit-ledger-foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-14
**Phase:** 10-merit-ledger-foundation
**Areas discussed:** Free reset semantics, Auto-provisioning new users, Enum strategy, Backfill migration safety

***

## Free Reset Semantics

### Q1: subscription\_reset\_date for Free users

| Option                           | Description                                                                                                        | Selected |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------- |
| NULL (Recommended)               | Cleanest "no reset cycle" signal; column nullable; Phase 11 RPCs and balance-fetch frontend handle null explicitly | ✓        |
| Far-future sentinel '9999-12-31' | NOT NULL column; leaks magic value into every consumer                                                             |          |
| created\_at + 100 years          | Per-row lifetime marker; opaque                                                                                    |          |

**User's choice:** NULL
**Notes:** Maps to D-01.

### Q2: Free → Pro upgrade behavior for the lifetime 5 Merits

| Option                                                 | Description                                                                    | Selected |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ | -------- |
| Carry forward into subscription\_balance (Recommended) | Lifetime merits sit in subscription\_balance; first Pro reset overwrites to 75 | ✓        |
| Move to shop\_balance on upgrade                       | Preserves them as never-expiring; more generous, more webhook complexity       |          |
| You decide                                             | Defer to Phase 12 / Claude                                                     |          |

**User's choice:** Carry forward
**Notes:** Maps to D-02. Phase 12 will do the overwrite implicitly via reset\_subscription\_merits.

### Q3: lifetime\_granted mutability

| Option                           | Description                                     | Selected |
| -------------------------------- | ----------------------------------------------- | -------- |
| Immutable once set (Recommended) | One-time grant value; Phase 11 RPCs never touch | ✓        |
| Mutable — admins can grant more  | Flexible but blurs column meaning               |          |

**User's choice:** Immutable
**Notes:** Maps to D-03.

### Q4: Track lifetime\_used / lifetime\_remaining column?

| Option                                      | Description                                                               | Selected |
| ------------------------------------------- | ------------------------------------------------------------------------- | -------- |
| No — derive from transactions (Recommended) | merit\_transactions is source of truth; reconciliation computes on demand | ✓        |
| Yes — add lifetime\_used column             | Faster reads but duplicates state with drift risk                         |          |

**User's choice:** No
**Notes:** Maps to D-04.

***

## Auto-Provisioning New Users

### Q1: How does a new signup get a user\_merits row?

| Option                                   | Description                                             | Selected |
| ---------------------------------------- | ------------------------------------------------------- | -------- |
| Trigger on profiles INSERT (Recommended) | AFTER INSERT trigger; mirrors handle\_new\_user pattern | ✓        |
| Trigger on auth.users INSERT             | Couples to Supabase-owned schema                        |          |
| Lazy-create in Phase 11 RPCs             | Every RPC needs the same upsert preamble                |          |
| Backfill only — no auto-provisioning     | Risky window between Phase 10 and Phase 11/12           |          |

**User's choice:** Trigger on profiles INSERT
**Notes:** Maps to D-05.

### Q2: Trigger idempotency on duplicate fire

| Option                               | Description                           | Selected |
| ------------------------------------ | ------------------------------------- | -------- |
| ON CONFLICT DO NOTHING (Recommended) | Re-run-safe; preserves spent balances | ✓        |
| ON CONFLICT DO UPDATE                | Dangerous — could zero spent merits   |          |
| Raise exception                      | Breaks signup flow                    |          |

**User's choice:** ON CONFLICT DO NOTHING
**Notes:** Maps to D-06.

### Q3: SECURITY DEFINER vs INVOKER

| Option                                         | Description                                                    | Selected |
| ---------------------------------------------- | -------------------------------------------------------------- | -------- |
| SECURITY DEFINER, postgres-owned (Recommended) | Bypasses RLS; consistent with handle\_new\_user; honors MER-04 | ✓        |
| SECURITY INVOKER                               | Would require permissive INSERT policy → violates MER-04       |          |

**User's choice:** SECURITY DEFINER
**Notes:** Maps to D-07.

### Q4: Trigger writes a grant row to merit\_transactions?

| Option                                                 | Description                                              | Selected |
| ------------------------------------------------------ | -------------------------------------------------------- | -------- |
| Yes — write a grant transaction (Recommended)          | Keeps MER-12 reconciliation invariant true from row zero | ✓        |
| No — user\_merits is source of truth for initial grant | Reconciliation has to special-case starting balance      |          |

**User's choice:** Yes
**Notes:** Maps to D-08.

***

## Enum Strategy

### Q1: merit\_transactions.balance\_type encoding

| Option                                | Description                                                 | Selected |
| ------------------------------------- | ----------------------------------------------------------- | -------- |
| text + CHECK constraint (Recommended) | Easy to extend; consistent with existing tables             | ✓        |
| Postgres CREATE TYPE enum             | Stricter but ALTER TYPE ADD VALUE has transactional gotchas |          |

**User's choice:** text + CHECK
**Notes:** Maps to D-09.

### Q2: merit\_shop\_purchases.status encoding

| Option                                | Description                            | Selected |
| ------------------------------------- | -------------------------------------- | -------- |
| text + CHECK constraint (Recommended) | Consistent with balance\_type          | ✓        |
| Postgres CREATE TYPE enum             | Inconsistency if balance\_type is text |          |

**User's choice:** text + CHECK
**Notes:** Maps to D-10.

### Q3: pack\_size constraint

| Option                                     | Description                                  | Selected |
| ------------------------------------------ | -------------------------------------------- | -------- |
| integer + CHECK (3,10,25,50) (Recommended) | Locks to spec; catches off-spec webhook bugs | ✓        |
| Free integer with CHECK > 0                | More flexible but spec is explicit           |          |

**User's choice:** integer + CHECK (3,10,25,50)
**Notes:** Maps to D-11.

### Q4: merit\_transactions.amount sign

| Option                       | Description                                   | Selected |
| ---------------------------- | --------------------------------------------- | -------- |
| Signed integer (Recommended) | One column; simplest reconciliation invariant | ✓        |
| Unsigned + direction column  | Verbose; every query needs CASE               |          |

**User's choice:** Signed integer
**Notes:** Maps to D-12.

***

## Backfill Migration Safety

### Q1: Migration file split

| Option                                                      | Description                                           | Selected |
| ----------------------------------------------------------- | ----------------------------------------------------- | -------- |
| Single migration: schema + trigger + backfill (Recommended) | One file; atomic; matches Phase 07 style              | ✓        |
| Two migrations: schema first, backfill second               | More auditable but creates schema-without-rows window |          |
| Schema migration + standalone backfill script               | Maximum control, maximum human error                  |          |

**User's choice:** Single migration
**Notes:** Maps to D-13.

### Q2: Race window for users signing up during migration

| Option                                                                 | Description                                       | Selected |
| ---------------------------------------------------------------------- | ------------------------------------------------- | -------- |
| Trigger first, then backfill with ON CONFLICT DO NOTHING (Recommended) | Order-based race elimination; no freeze           | ✓        |
| Lock public.profiles during backfill                                   | Causes user-visible signup failures               |          |
| Deploy freeze                                                          | Heavy-handed, unnecessary for sub-second backfill |          |

**User's choice:** Trigger first, then backfill
**Notes:** Maps to D-14.

### Q3: Backfill writes grant rows for existing users?

| Option                                                      | Description                                               | Selected |
| ----------------------------------------------------------- | --------------------------------------------------------- | -------- |
| Yes — write grant rows for all existing users (Recommended) | MER-12 invariant holds for entire user base from day zero | ✓        |
| No — only trigger writes grant rows                         | Asymmetric; reconciliation has to special-case            |          |

**User's choice:** Yes
**Notes:** Maps to D-15. Source = 'phase-10-backfill' to distinguish from new-signup grants.

### Q4: In-migration verification?

| Option                                                    | Description                                                   | Selected |
| --------------------------------------------------------- | ------------------------------------------------------------- | -------- |
| Yes — RAISE EXCEPTION if counts don't match (Recommended) | Atomic rollback; enforces Success Criterion #4 at deploy time | ✓        |
| No — verify post-deploy via reconciliation                | Lighter migration, manual runbook                             |          |

**User's choice:** Yes
**Notes:** Maps to D-16.

***

## Claude's Discretion

* Exact column types and precision (`integer` vs `bigint` for balances and amounts)
* Index set on `merit_transactions` beyond the obvious `(user_id, created_at DESC)`
* `ON DELETE` behavior of `user_id` FKs (likely CASCADE)
* Backfill INSERT vs CTE wrapping for readability
* Migration filename / timestamp
* Trigger fires INSERT-only (UPDATE handling not needed)

## Deferred Ideas

* Phase 11 RPCs (`check_and_deduct_merits`, etc.)
* Removal of legacy `usage_tracking` / `credit_usage` / `ai_usage` (kept read-only per MIG-04)
* Admin-facing Merit grant tooling
* Index tuning beyond baseline


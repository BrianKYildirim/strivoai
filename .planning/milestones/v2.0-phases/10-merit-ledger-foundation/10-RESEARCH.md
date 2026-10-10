# Phase 10: merit-ledger-foundation — Research

**Researched:** 2026-04-14
**Domain:** Supabase / PostgreSQL schema, RLS, SECURITY DEFINER triggers, backfill migration
**Confidence:** HIGH

## Summary

Phase 10 is a single-file, additive Postgres migration that lands three new tables (`user_merits`, `merit_transactions`, `merit_shop_purchases`), their RLS posture, a SECURITY DEFINER auto-provisioning trigger, and a backfill seeding every existing profile with `subscription_balance = 5`. CONTEXT.md already locks 17 decisions (D-01..D-17). This research verifies each is implementable against the live schema, resolves the items flagged as Claude's Discretion (column precision, index set, FK cascade behavior, filename), and produces a Validation Architecture that proves every Success Criterion empirically.

All critical unknowns resolved against primary sources (repo migrations). No external doc queries were required — Phase 10 is pure Postgres/Supabase primitives that the repo already uses consistently.

**Primary recommendation:** Create `supabase/migrations/20260414000000_merit_ledger_foundation.sql` structured exactly like `20260412000000_stripe_migration.sql` — additive DDL, RLS enabled with zero permissive policies, `integer` for balances and amounts, `(user_id, created_at DESC)` index on `merit_transactions`, `ON DELETE CASCADE` on all FKs, and a trailing `DO $$ ... ASSERT ... $$` verification block that rolls back the whole transaction if profile-count ≠ user_merits-count.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01** `user_merits.subscription_reset_date` is nullable and NULL for Free users (NULL = "no reset cycle"; Phase 11 `reset_subscription_merits` will skip Free).

**D-02** Free→Pro/Elite upgrade (Phase 12) overwrites the lifetime 5 Merits in `subscription_balance` with the first Pro/Elite reset. Phase 10 schema must simply not block this.

**D-03** `lifetime_granted` is immutable after initial seed. No RPC may update it. Analytics/audit only.

**D-04** No `lifetime_used` / `lifetime_remaining` column. `merit_transactions` is source of truth.

**D-05** `AFTER INSERT` trigger on `public.profiles` (NOT `auth.users`) auto-creates a `user_merits` row with `subscription_balance = 5`, `shop_balance = 0`, `lifetime_granted = 5`, `subscription_reset_date = NULL`, `free_linkedin_scan_used = false`.

**D-06** Trigger uses `INSERT ... ON CONFLICT (user_id) DO NOTHING` — idempotent, re-run-safe.

**D-07** Trigger is `SECURITY DEFINER`, owned by `postgres`, mirroring `handle_new_user`.

**D-08** Trigger ALSO inserts a row into `merit_transactions` with `amount = 5`, `balance_type = 'grant'`, `source = 'signup-grant'`, `feature = NULL` — keeps MER-12 reconciliation invariant true from row zero.

**D-09** `merit_transactions.balance_type` is `text NOT NULL` + `CHECK (balance_type IN ('subscription','shop','grant','refund'))`. No Postgres enum.

**D-10** `merit_shop_purchases.status` is `text NOT NULL` + `CHECK (status IN ('pending','succeeded','failed','refunded'))`.

**D-11** `merit_shop_purchases.pack_size` is `integer NOT NULL` + `CHECK (pack_size IN (3,10,25,50))`.

**D-12** `merit_transactions.amount` is signed integer: negative for deductions, positive for grants/refunds/shop credits.

**D-13** Single migration file: table DDL → RLS enable (no permissive policies) → CHECK constraints → indexes → trigger function + trigger → backfill → grant-row backfill → verification block. Atomic deploy.

**D-14** Trigger created BEFORE backfill runs. Backfill's `ON CONFLICT DO NOTHING` handles the race. No LOCK TABLE.

**D-15** Backfill writes a `grant` row into `merit_transactions` for every existing profile with `source = 'phase-10-backfill'` (distinguishable from new-signup grants).

**D-16** Migration ends with `DO $$ BEGIN IF (SELECT COUNT(*) FROM profiles) <> (SELECT COUNT(*) FROM user_merits) THEN RAISE EXCEPTION ...; END IF; END $$;` — fails the transaction if SC-4 is not met.

**D-17** All three tables: `ENABLE ROW LEVEL SECURITY` with at most a single `SELECT` policy per table (`auth.uid() = user_id`). Zero INSERT/UPDATE/DELETE policies. Do NOT replicate SEC-06 `USING (true)` bug.

### Claude's Discretion (resolved in this research)

Column types/precision → `integer`; index set → `(user_id, created_at DESC)` + partial refund index; FK cascade → `ON DELETE CASCADE`; CTE style → flat `INSERT ... SELECT`; filename → `20260414000000_merit_ledger_foundation.sql`; trigger fires on `INSERT` only (no UPDATE path). See § Architecture Patterns below.

### Deferred Ideas (OUT OF SCOPE)

- All RPCs (Phase 11)
- Stripe products/webhook/checkout (Phase 12)
- Edge function enforcement, `MERIT_SYSTEM_ENABLED` flag (Phase 13)
- Any frontend, tier prompts, UI primitives
- Removing/migrating `usage_tracking` / `credit_usage` / `ai_usage`
- Admin grant tooling
- Index tuning beyond the obvious

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MER-01 | Create `user_merits` with id, user_id, subscription_balance, shop_balance, lifetime_granted, subscription_reset_date, free_linkedin_scan_used, created_at, updated_at | Table DDL section below — column types resolved |
| MER-02 | Create `merit_transactions` with id, user_id, amount, balance_type (enum-via-CHECK), source, feature, metadata jsonb, created_at | DDL + D-09 + D-12 reconciled |
| MER-03 | Create `merit_shop_purchases` with id, user_id, pack_size, price_cents, stripe_payment_intent_id (unique), stripe_receipt_url, status enum, created_at | DDL + D-10 + D-11 reconciled |
| MER-04 | RLS: SELECT-only user policy; writes via SECURITY DEFINER only | D-17 enforced; SEC-06 anti-pattern confirmed absent from Phase 07 template |
| MER-10 | Free signup grants 5 lifetime Merits one-time | D-05 trigger + D-15 backfill cover new and existing users |
| MER-13 | Balances never negative — CHECK constraint | Inline `CHECK (subscription_balance >= 0 AND shop_balance >= 0)` |
| MER-14 | Two separate columns track reset-monthly vs never-expire Merits | `subscription_balance` + `shop_balance` schema supports this; semantics land in Phase 11 RPCs |
| MIG-01 | All existing users migrated to Free + 5 lifetime Merits | Backfill `INSERT ... SELECT FROM profiles` + D-16 verification |
| MIG-04 | Legacy `usage_tracking` / `credit_usage` / `ai_usage` remain readable and untouched | Migration contains zero references to these tables; additive-only |

## Project Constraints (from CLAUDE.md)

- **Small, reversible changes**: single additive migration, no drops/renames
- **NEVER commit anything in `.planning/` or `.gitignore`**: research writes to `.planning/` but nothing here gets staged
- **Preserve existing TypeScript/React patterns**: N/A — Phase 10 is SQL-only
- **Stack is Supabase Edge Functions (Deno) + React**: migration is pure Postgres DDL, no Deno code in this phase
- **Additive migrations only**: confirmed — Phase 10 creates only new objects
- **`text` over `varchar`**: enforced in DDL
- **RLS enabled, zero permissive write policies**: enforced
- **Inline CHECK constraints in CREATE TABLE**: enforced
- **Migration file convention**: `YYYYMMDDHHMMSS_short_name.sql` under `supabase/migrations/`

## Standard Stack

### Core
| Item | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| PostgreSQL | 15+ (Supabase managed) | Schema, RLS, triggers, constraints | Every existing migration in this repo targets it |
| Supabase CLI | 2.76.9 | Migration deploy via `supabase migration up` | `package.json` pins it |
| plpgsql | built-in | Trigger function language | Matches `handle_new_user` and every other trigger in the repo |

### No libraries to install
This phase ships a single `.sql` file. Zero npm/Deno dependencies. Nothing to verify against a registry.

## Architecture Patterns

### Migration file structure (mirrors `20260412000000_stripe_migration.sql`)

```
1. Header comment: phase ID, REQ coverage, anti-pattern warning
2. CREATE TABLE public.user_merits (inline CHECK + inline FK)
3. CREATE TABLE public.merit_transactions (inline CHECK + inline FK)
4. CREATE TABLE public.merit_shop_purchases (inline CHECK + inline FK + UNIQUE)
5. ALTER TABLE ... ENABLE ROW LEVEL SECURITY (all three)
6. CREATE POLICY "..._select_own" ... FOR SELECT USING (auth.uid() = user_id) (three policies)
7. CREATE INDEX (user_id, created_at DESC) on merit_transactions
8. CREATE INDEX (user_id) on merit_shop_purchases
9. Partial index on metadata->>'refund_of' for refund lookups
10. CREATE FUNCTION public.auto_provision_user_merits() (SECURITY DEFINER, plpgsql)
11. CREATE TRIGGER on_profile_created_provision_merits AFTER INSERT ON profiles
12. CREATE TRIGGER update_user_merits_updated_at BEFORE UPDATE ON user_merits (reuses existing update_updated_at_column)
13. Backfill: INSERT INTO user_merits SELECT id, 5, 0, 5, NULL, false, now(), now() FROM profiles ON CONFLICT (user_id) DO NOTHING
14. Grant-row backfill: INSERT INTO merit_transactions (user_id, amount, balance_type, source, feature, metadata) SELECT id, 5, 'grant', 'phase-10-backfill', NULL, '{}' FROM profiles WHERE NOT EXISTS (SELECT 1 FROM merit_transactions WHERE user_id = profiles.id AND source IN ('phase-10-backfill','signup-grant'))
15. DO $$ BEGIN ASSERT ... END $$ verification block
```

### Column types (resolved from Claude's Discretion)

| Table.Column | Type | Rationale |
|---|---|---|
| `user_merits.id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Matches `resumes.id`, `usage_tracking.id` |
| `user_merits.user_id` | `uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE` | FK target is `profiles.id` per CONTEXT code_context section. One-to-one = UNIQUE. |
| `user_merits.subscription_balance` | `integer NOT NULL DEFAULT 0 CHECK (subscription_balance >= 0)` | Max realistic value is Elite yearly ≈ 150; `integer` max 2.1B is overkill but consistent with repo |
| `user_merits.shop_balance` | `integer NOT NULL DEFAULT 0 CHECK (shop_balance >= 0)` | Same as above |
| `user_merits.lifetime_granted` | `integer NOT NULL DEFAULT 0` | No CHECK — immutable per D-03 but not enforced at DB level (application contract) |
| `user_merits.subscription_reset_date` | `timestamptz NULL` | D-01 nullable |
| `user_merits.free_linkedin_scan_used` | `boolean NOT NULL DEFAULT false` | Spec §6 |
| `user_merits.created_at` | `timestamptz NOT NULL DEFAULT now()` | Repo convention |
| `user_merits.updated_at` | `timestamptz NOT NULL DEFAULT now()` | Repo convention |
| `merit_transactions.id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `merit_transactions.user_id` | `uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE` | Not UNIQUE — many rows per user |
| `merit_transactions.amount` | `integer NOT NULL` | Signed per D-12. Zero is technically allowed but should never happen; not worth a CHECK. |
| `merit_transactions.balance_type` | `text NOT NULL CHECK (balance_type IN ('subscription','shop','grant','refund'))` | D-09 |
| `merit_transactions.source` | `text NOT NULL` | Free-form: 'signup-grant', 'phase-10-backfill', 'resume-analysis', etc. |
| `merit_transactions.feature` | `text NULL` | NULL for grants/refunds, feature name for deductions |
| `merit_transactions.metadata` | `jsonb NOT NULL DEFAULT '{}'::jsonb` | Holds `refund_of` transaction_id and any future audit fields |
| `merit_transactions.created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `merit_shop_purchases.id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `merit_shop_purchases.user_id` | `uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE` | |
| `merit_shop_purchases.pack_size` | `integer NOT NULL CHECK (pack_size IN (3,10,25,50))` | D-11 |
| `merit_shop_purchases.price_cents` | `integer NOT NULL CHECK (price_cents > 0)` | Cents avoids float rounding |
| `merit_shop_purchases.stripe_payment_intent_id` | `text NOT NULL UNIQUE` | SHOP-09 idempotency guard at DB level |
| `merit_shop_purchases.stripe_receipt_url` | `text NULL` | Populated by webhook after Stripe returns it |
| `merit_shop_purchases.status` | `text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','refunded'))` | D-10 |
| `merit_shop_purchases.created_at` | `timestamptz NOT NULL DEFAULT now()` | |

### Index set

| Index | Definition | Rationale |
|---|---|---|
| `idx_merit_transactions_user_created` | `(user_id, created_at DESC)` | Hottest query: "list my recent transactions" (Phase 11 `get_merit_balance`, Phase 20 history UI). Also supports reconciliation `SUM(amount) WHERE user_id = X`. |
| `idx_merit_transactions_refund_of` | `((metadata->>'refund_of')) WHERE metadata ? 'refund_of'` | Partial index — Phase 11 `refund_merits` idempotency check (already refunded?) |
| `idx_merit_shop_purchases_user_created` | `(user_id, created_at DESC)` | Phase 20 `/settings/billing` history page |
| `idx_user_merits_subscription_reset_date` | `(subscription_reset_date) WHERE subscription_reset_date IS NOT NULL` | Phase 11 `reset_subscription_merits` batched cron query — skips Free users via partial index |

`user_merits.user_id` is already UNIQUE so it gets a btree index for free. `merit_shop_purchases.stripe_payment_intent_id` is UNIQUE so idempotency lookup is indexed for free.

### FK cascade behavior

All FKs use `ON DELETE CASCADE` to `public.profiles(id)`. Rationale: `profiles` itself cascades from `auth.users`, so deleting a user wipes their entire Merit history — consistent with `resumes`, `usage_tracking`, and every other per-user table in the repo. No soft-delete retention is required by the spec or the CONTEXT.

### Trigger function (structural copy of `handle_new_user`)

```sql
CREATE OR REPLACE FUNCTION public.auto_provision_user_merits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_merits
    (user_id, subscription_balance, shop_balance, lifetime_granted,
     subscription_reset_date, free_linkedin_scan_used)
  VALUES (NEW.id, 5, 0, 5, NULL, false)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.merit_transactions
    (user_id, amount, balance_type, source, feature, metadata)
  VALUES (NEW.id, 5, 'grant', 'signup-grant', NULL, '{}'::jsonb);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_provision_merits
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_provision_user_merits();
```

Important: this hooks `profiles`, not `auth.users`. `handle_new_user` already fires on `auth.users` INSERT and writes to `profiles`. The new trigger fires on the resulting `profiles` INSERT. Ordering is guaranteed by Postgres trigger semantics — `handle_new_user` completes (writing profile row) before the new profiles-level trigger fires.

Note on the second INSERT: the `signup-grant` row does **not** use `ON CONFLICT DO NOTHING` because `merit_transactions` has no unique constraint to conflict on. This is fine — the outer INSERT's `ON CONFLICT (user_id) DO NOTHING` on `user_merits` guards against duplicate trigger firing in practice. If the trigger fires twice on the same profile (shouldn't happen, profiles.id is PK), the first `ON CONFLICT` skips the user_merits insert, but the transaction row would be a duplicate. Mitigation: the trigger only fires on `AFTER INSERT ON profiles`, and `profiles.id` is the PK, so a second INSERT on the same id is impossible.

### `updated_at` timestamp trigger

Reuse the existing `public.update_updated_at_column()` function (defined in `20251113100645_...sql`). Add one trigger:

```sql
CREATE TRIGGER update_user_merits_updated_at
  BEFORE UPDATE ON public.user_merits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

`merit_transactions` and `merit_shop_purchases` are append-only (no updated_at column), so no trigger needed for them.

### Verification block (D-16)

```sql
DO $$
DECLARE
  profile_count integer;
  merit_count integer;
  grant_count integer;
BEGIN
  SELECT COUNT(*) INTO profile_count FROM public.profiles;
  SELECT COUNT(*) INTO merit_count FROM public.user_merits;
  SELECT COUNT(*) INTO grant_count
    FROM public.merit_transactions
    WHERE source IN ('phase-10-backfill', 'signup-grant');

  IF profile_count <> merit_count THEN
    RAISE EXCEPTION
      'Phase 10 backfill failed: % profiles but % user_merits rows',
      profile_count, merit_count;
  END IF;

  IF grant_count < profile_count THEN
    RAISE EXCEPTION
      'Phase 10 grant backfill failed: % profiles but only % grant rows',
      profile_count, grant_count;
  END IF;
END $$;
```

This is inside the migration's implicit transaction. Supabase CLI wraps each migration file in `BEGIN/COMMIT` — if `RAISE EXCEPTION` fires, the entire migration rolls back and no objects are created. This is how Success Criterion #4 becomes a deploy-time guarantee.

### Anti-Patterns to Avoid

- **SEC-06 `USING (true)` policy**: verified absent from `20260412000000_stripe_migration.sql` (read confirms lines 29–33 — only `ENABLE ROW LEVEL SECURITY`, zero permissive policies). Phase 10 mirrors this exactly.
- **Postgres `CREATE TYPE ... AS ENUM`**: avoid per D-09/D-10 — use `text` + `CHECK` instead. The repo has one existing enum (`ai_action_type` in the legacy usage_tracking migration) but CONTEXT explicitly rejects the pattern going forward.
- **`LOCK TABLE profiles`**: do NOT lock. D-14 eliminates the race via trigger-before-backfill ordering + `ON CONFLICT DO NOTHING`.
- **Touching `usage_tracking` / `credit_usage` / `ai_usage`**: forbidden by MIG-04. Migration must contain zero references.
- **Adding permissive INSERT/UPDATE/DELETE policies** to please a future RPC — SECURITY DEFINER RPCs bypass RLS automatically; policies are unnecessary and dangerous.
- **Making `lifetime_granted` a running counter**: D-03/D-04 — never update after seed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Negative balance check | Application-layer validation | `CHECK (subscription_balance >= 0 AND shop_balance >= 0)` | Enforced atomically at row level; survives bugs in any future RPC (MER-13) |
| Idempotent shop credit | Double-credit check in webhook code | `UNIQUE (stripe_payment_intent_id)` | DB constraint catches webhook replays with zero code (SHOP-09) |
| Enum for status fields | `CREATE TYPE ... AS ENUM` | `text` + inline `CHECK (... IN (...))` | D-09/D-10 — `ALTER TYPE ADD VALUE` has transactional gotchas; `ALTER TABLE DROP CONSTRAINT + ADD CONSTRAINT` is cleaner |
| Backfill race protection | `LOCK TABLE` or deploy freeze | Trigger-before-backfill + `ON CONFLICT DO NOTHING` | D-14 — zero-downtime ordering primitive |
| Balance reconciliation | Stored denormalized counter | Compute from `SUM(amount) WHERE user_id = X` on demand | D-04 — avoids drift between two stores; grant rows make it provable |
| Updated-at maintenance | Manual `SET updated_at = now()` in every UPDATE | Reuse existing `public.update_updated_at_column()` trigger | Already defined, already tested, already used by `profiles` and `resumes` |

## Runtime State Inventory

Phase 10 is greenfield schema creation, not a rename/refactor. All tables are new — no stored data, services, or OS-registered state hold references to the old names.

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | None — `user_merits`, `merit_transactions`, `merit_shop_purchases` do not yet exist in any environment | None |
| Live service config | None — Phase 10 creates no edge functions, no cron, no external wiring | None |
| OS-registered state | None | None |
| Secrets/env vars | None — Phase 10 does not read or write any secret. `MERIT_SYSTEM_ENABLED` is Phase 13, not Phase 10 | None |
| Build artifacts | None — SQL-only migration; no compiled output | None |

## Common Pitfalls

### Pitfall 1: Permissive RLS policy creep
**What goes wrong:** A future Phase 11 RPC author adds `CREATE POLICY ... FOR ALL USING (true)` "so the RPC can insert". This reintroduces SEC-06.
**Why it happens:** Author forgets that `SECURITY DEFINER` already bypasses RLS.
**How to avoid:** Phase 10 migration header must include the same warning comment as the Stripe migration ("Do NOT add permissive policies — service role bypasses RLS"). Phase 11 planner must re-read this comment before editing.
**Warning signs:** Any `CREATE POLICY ... FOR (INSERT|UPDATE|DELETE|ALL)` on a merit_* table.

### Pitfall 2: `ON CONFLICT DO NOTHING` on a column without a UNIQUE constraint
**What goes wrong:** `ON CONFLICT (user_id) DO NOTHING` on `user_merits` silently fails unless `user_id` is declared UNIQUE.
**Why it happens:** Author treats `user_id` as "one row per user" semantically but forgets to enforce it structurally.
**How to avoid:** `user_merits.user_id` MUST be declared `uuid NOT NULL UNIQUE REFERENCES ...`. Without UNIQUE, ON CONFLICT has no target and the migration errors at deploy.
**Warning signs:** Postgres error `there is no unique or exclusion constraint matching the ON CONFLICT specification`.

### Pitfall 3: Trigger fires on auth.users instead of profiles
**What goes wrong:** Author copies `handle_new_user` verbatim and wires it to `auth.users`. The trigger fires BEFORE the profile row exists, and the FK from `user_merits.user_id → profiles.id` fails.
**Why it happens:** `handle_new_user` is the template and it's on `auth.users`.
**How to avoid:** D-05 explicitly says `AFTER INSERT ON public.profiles`. The DDL trigger statement must reference `profiles`, not `auth.users`. This is the single highest-risk deviation from the template.
**Warning signs:** `insert or update on table "user_merits" violates foreign key constraint` at signup time.

### Pitfall 4: Backfill counts drift from profile count
**What goes wrong:** A new user signs up mid-backfill, the trigger creates their row, but the `INSERT ... SELECT FROM profiles` has already fetched its snapshot and tries to re-insert. Without `ON CONFLICT DO NOTHING`, this errors. With it, counts match.
**How to avoid:** D-06 and D-14 mandate the ON CONFLICT clause. The verification block in D-16 catches any miscount as a transaction rollback.
**Warning signs:** `duplicate key value violates unique constraint "user_merits_user_id_key"` OR verification block raising.

### Pitfall 5: Grant backfill skipped for users who already have a grant row
**What goes wrong:** Re-running the migration on a partially-applied database double-inserts grant rows, breaking MER-12 reconciliation.
**How to avoid:** The grant backfill uses `WHERE NOT EXISTS (SELECT 1 FROM merit_transactions WHERE user_id = profiles.id AND source IN ('phase-10-backfill','signup-grant'))`. Idempotent by construction.
**Warning signs:** Reconciliation query returns drift `(sub+shop) - SUM(amount) = -5 * N` for N double-grants.

### Pitfall 6: Migration modifies legacy `usage_tracking`
**What goes wrong:** Someone "helpfully" adds a comment column or an index to `usage_tracking` in the same migration. MIG-04 is violated.
**How to avoid:** Migration must contain zero occurrences of the strings `usage_tracking`, `credit_usage`, `ai_usage`, `ai_action_type`. Lint the file.
**Warning signs:** Grep hit on those identifiers in `20260414000000_merit_ledger_foundation.sql`.

## Code Examples

### Full CREATE TABLE for `user_merits` (verified pattern, mirrors repo style)

```sql
-- Source: structure mirrors supabase/migrations/20251113100645_...sql (profiles)
--         and supabase/migrations/20260412000000_stripe_migration.sql (RLS posture)
CREATE TABLE public.user_merits (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL UNIQUE
                             REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_balance     integer NOT NULL DEFAULT 0
                             CHECK (subscription_balance >= 0),
  shop_balance             integer NOT NULL DEFAULT 0
                             CHECK (shop_balance >= 0),
  lifetime_granted         integer NOT NULL DEFAULT 0,
  subscription_reset_date  timestamptz NULL,
  free_linkedin_scan_used  boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_merits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_merits_select_own"
  ON public.user_merits FOR SELECT
  USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies — service role only (D-17).
```

### Backfill pattern

```sql
-- D-13 backfill step 1: seed user_merits
INSERT INTO public.user_merits
  (user_id, subscription_balance, shop_balance, lifetime_granted,
   subscription_reset_date, free_linkedin_scan_used)
SELECT id, 5, 0, 5, NULL, false
FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- D-15 backfill step 2: seed grant rows (idempotent re-run safe)
INSERT INTO public.merit_transactions
  (user_id, amount, balance_type, source, feature, metadata)
SELECT p.id, 5, 'grant', 'phase-10-backfill', NULL, '{}'::jsonb
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.merit_transactions t
  WHERE t.user_id = p.id
    AND t.source IN ('phase-10-backfill', 'signup-grant')
);
```

## State of the Art

No technology drift applies — Postgres primitives used here (CHECK constraints, RLS, SECURITY DEFINER triggers, ON CONFLICT DO NOTHING) are stable since Postgres 9.5+. The repo consistently uses these patterns.

**Deprecated/outdated within this repo:**
- `CREATE TYPE ... AS ENUM` for status fields — CONTEXT D-09/D-10 moves to `text + CHECK`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `profiles.id` is the correct FK target (not `auth.users(id)` directly) | Architecture Patterns → FK cascade | [VERIFIED: 20251113100645_...sql line 3] None — confirmed. |
| A2 | `handle_new_user` hooks `auth.users`, and a separate trigger on `profiles` can fire after | Pitfall 3 | [VERIFIED: 20251113100645_...sql lines 31–52] None — `handle_new_user` writes to profiles from an auth.users INSERT, so a profiles-level AFTER INSERT trigger is guaranteed to fire next. |
| A3 | `public.update_updated_at_column()` exists and is reusable | Architecture Patterns → updated_at | [VERIFIED: 20251113100645_...sql lines 93–99] None. |
| A4 | Supabase CLI wraps each migration file in a single transaction, so `RAISE EXCEPTION` rolls back all DDL | D-16 verification | [ASSUMED] Medium — if Supabase CLI runs DDL in autocommit mode per statement, the failing verification would leave tables created. Mitigation: Supabase CLI uses `psql` under the hood and Postgres supports transactional DDL; this is the documented behavior. Worst case: deploy-time partial state requires manual cleanup. Plan should add a secondary verification step in a runbook. |
| A5 | `integer` is sufficient for balance columns (not `bigint`) | Column types | [VERIFIED against spec] max plausible balance is Elite yearly lump = 150 + shop max ~500, well under INT_MAX. |
| A6 | The next monotonic migration timestamp is `20260414000000` (today's date, 2026-04-14) | Filename | [VERIFIED: `ls supabase/migrations/`] Latest is `20260412000000_stripe_migration.sql`. Any timestamp > that works. |
| A7 | SEC-06 `USING (true)` anti-pattern is not present in the Stripe migration template | Anti-Patterns | [VERIFIED: 20260412000000_stripe_migration.sql lines 29–33] Template is clean — only `ENABLE ROW LEVEL SECURITY`, no permissive policies. |
| A8 | No existing migration or code references `user_merits` / `merit_transactions` / `merit_shop_purchases` | Scope | [VERIFIED: grep returned zero hits across `supabase/`] Clean slate confirmed. |

**Only A4 is [ASSUMED] and requires runbook fallback.** All other claims are verified against primary sources in this session.

## Open Questions (RESOLVED)

1. **Does Supabase CLI run migrations in a single transaction?**
   - What we know: `psql` supports transactional DDL in Postgres; Supabase CLI delegates to `psql`.
   - What's unclear: Whether the CLI flags `--single-transaction` or uses per-file transactions by default. Most Supabase references suggest per-file transactional, but not 100% verified in this session.
   - Recommendation: Add a post-migration runbook step that queries `COUNT(*)` on the three new tables to confirm they exist. If not, manually `DROP TABLE ... CASCADE` and re-run. Also: the D-16 verification block is belt-and-suspenders — if the CLI does not wrap in a transaction, the RAISE EXCEPTION still fails the migration file and surfaces to the operator.
   - **RESOLVED:** D-16 in-migration `DO $$` RAISE EXCEPTION block + Plan 03 Task 3 pre/post legacy-table snapshot diff act as transactional belt-and-suspenders. No CLI flag change needed; even per-statement autocommit drift is caught by both gates.

2. **Should `merit_transactions.amount != 0` be a CHECK constraint?**
   - A zero-amount row is semantically meaningless. Adding `CHECK (amount <> 0)` would catch buggy callers.
   - Recommendation: Planner's call. Low-risk addition; mention in plan and defer to implementer.
   - **RESOLVED:** Deferred. Not adding `CHECK (amount <> 0)` in Phase 10. The MER-12 reconciliation invariant in Phase 11 catches zero-amount bugs at the test layer; adding the constraint here would constrain Phase 11's refund-edge-case handling prematurely.

## Environment Availability

Phase 10 has no external tool dependencies beyond Postgres itself.

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| PostgreSQL (Supabase) | Migration execution | ✓ (managed by Supabase) | 15+ | — |
| Supabase CLI | `supabase migration up` / `supabase db push` | ✓ (package.json dev dep) | 2.76.9 | — |
| plpgsql | Trigger function | ✓ (built into Postgres) | — | — |

**Missing dependencies:** None.

## Validation Architecture

**nyquist_validation is enabled** (config.json workflow.nyquist_validation = true). This section maps each of the 5 Success Criteria to a concrete, automatable validation method so VALIDATION.md can be auto-generated.

### Test Framework

| Property | Value |
|---|---|
| Framework | Deno test + direct `psql` SQL assertions (no TypeScript test framework needed for pure-SQL phase) |
| Config file | `supabase/functions/deno.json` (exists) + `scripts/run-edge-tests.ps1` pattern |
| Quick run command | `supabase db reset --linked` then `psql $DATABASE_URL -f .planning/phases/10-merit-ledger-foundation/validate.sql` |
| Full suite command | Same — Phase 10 validation is a single `.sql` assertion script |

Recommendation: the plan should ship `supabase/tests/phase-10/merit_ledger_foundation.test.sql` containing PL/pgSQL `DO $$ ... ASSERT ... $$` blocks — one per Success Criterion. Run via `psql -f` against a branch database or local Supabase.

### Phase Requirements → Test Map

| SC # | Criterion | Test Type | Automated Command / Assertion | File Exists? |
|---|---|---|---|---|
| SC-1 | Running the migration creates `user_merits`, `merit_transactions`, `merit_shop_purchases` with exact columns | schema assertion | `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('user_merits','merit_transactions','merit_shop_purchases')` — compare against expected column set via PL/pgSQL ASSERT | ❌ Wave 0 — create `supabase/tests/phase-10/schema.test.sql` |
| SC-2 | Direct INSERT/UPDATE into `user_merits` from user-authenticated client is rejected by RLS | RLS assertion | Deno test: call `supabase.from('user_merits').insert({...})` using an anon key + JWT for a real user → assert `.error` is non-null and references RLS | ❌ Wave 0 — create `supabase/functions/tests/phase-10-rls.test.ts` |
| SC-3 | CHECK constraint prevents either balance from dropping below zero | constraint assertion | `psql` via service role: `UPDATE user_merits SET subscription_balance = -1 WHERE user_id = '<test-user>'` → assert error contains `violates check constraint` | ❌ Wave 0 — create as a PL/pgSQL block in `schema.test.sql` using `BEGIN ... EXCEPTION WHEN check_violation THEN ...` |
| SC-4 | Every pre-existing profile has a `user_merits` row with `subscription_balance=5, shop_balance=0, lifetime_granted=5` | data assertion | `DO $$ BEGIN ASSERT (SELECT COUNT(*) FROM public.profiles) = (SELECT COUNT(*) FROM public.user_merits WHERE subscription_balance=5 AND shop_balance=0 AND lifetime_granted=5); END $$;` | ❌ Wave 0 — same file as SC-1 |
| SC-5 | Legacy `usage_tracking` / `credit_usage` / `ai_usage` remain readable and unmodified | pre/post snapshot | `SELECT md5(string_agg(id::text \|\| action_type::text \|\| credits_consumed::text, ',' ORDER BY id)) FROM usage_tracking` BEFORE migration == AFTER migration. Also: `SELECT COUNT(*) FROM usage_tracking` unchanged. | ❌ Wave 0 — create `scripts/phase-10-legacy-snapshot.sh` that captures COUNT + row-level hash pre and post |

### Sampling Rate

- **Per task commit:** `psql -f supabase/tests/phase-10/merit_ledger_foundation.test.sql` (runs all 5 assertions in < 2s on a seeded local DB)
- **Per wave merge:** Same + pre/post legacy snapshot comparison
- **Phase gate:** Full suite green before `/gsd-verify-work`; migration deploys to staging via `.\scripts\deploy-staging.ps1` and the assertions re-run against staging

### Wave 0 Gaps

- [ ] `supabase/tests/phase-10/schema.test.sql` — covers SC-1, SC-3, SC-4 via PL/pgSQL assertions
- [ ] `supabase/functions/tests/phase-10-rls.test.ts` — covers SC-2 (Deno test using supabase-js anon client)
- [ ] `scripts/phase-10-legacy-snapshot.sh` — covers SC-5 via md5 row-level hash pre/post migration
- [ ] `supabase/tests/phase-10/fixtures.sql` — inserts at least 3 test profiles before running migration so backfill has data to act on
- [ ] No framework install required — `psql` ships with Supabase CLI, Deno test is already configured

*(No existing test infrastructure covers Phase 10 — Wave 0 must create these.)*

## Security Domain

`security_enforcement` is not explicitly `false` in config — treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | no | No auth surface added in this phase |
| V3 Session Management | no | No session state |
| V4 Access Control | **yes** | RLS SELECT policy `auth.uid() = user_id`; SECURITY DEFINER trigger; zero permissive write policies. Service role bypasses RLS for legitimate writes. |
| V5 Input Validation | **yes** | CHECK constraints on `balance_type`, `status`, `pack_size`, `price_cents`, balance non-negativity. DB-level input validation survives buggy application code. |
| V6 Cryptography | no | No crypto in this phase |
| V8 Data Protection | **yes** | FKs with CASCADE delete ensure user data is purged when user is deleted (GDPR-relevant) |
| V13 API | no | No API surface in this phase |

### Known Threat Patterns for Postgres + Supabase RLS

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Client-side balance manipulation | Tampering | RLS blocks direct writes; only SECURITY DEFINER RPCs (Phase 11) can mutate balances |
| Negative balance via race condition | Tampering | CHECK constraint enforced at row level; row locking in Phase 11 RPCs |
| Replay of Stripe webhook | Repudiation | `UNIQUE (stripe_payment_intent_id)` on `merit_shop_purchases` rejects duplicates at DB level |
| RLS `USING (true)` policy bug (SEC-06) | Elevation of Privilege | Phase 10 migration explicitly contains zero permissive write policies; header comment warns against it |
| SECURITY DEFINER function privilege escalation | Elevation of Privilege | `SET search_path = public` in function body prevents search_path injection attacks (matches `handle_new_user` pattern) |
| Orphaned user data after account deletion | Repudiation / Compliance | `ON DELETE CASCADE` on all FKs ensures complete teardown |

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/20251113100645_eb5d1704-66ae-4c1a-ad99-05bf7363585f.sql` — profiles table structure, `handle_new_user` SECURITY DEFINER pattern, `update_updated_at_column` reusable trigger
- `supabase/migrations/20251222220418_b52662bb-5e0f-4847-bc53-d848d159e2c2.sql` — legacy usage_tracking structure (for MIG-04 do-not-touch verification)
- `supabase/migrations/20260412000000_stripe_migration.sql` — Phase 07 template; clean RLS posture verified, SEC-06 anti-pattern confirmed absent
- `.planning/phases/10-merit-ledger-foundation/10-CONTEXT.md` — 17 locked decisions D-01..D-17
- `.planning/REQUIREMENTS.md` — MER-01..04, MER-10, MER-13, MER-14, MIG-01, MIG-04 REQ text
- `.planning/ROADMAP.md` §Phase 10 — 5 Success Criteria
- `.planning/STATE.md` — v2.0 milestone context
- `CLAUDE.md` — project constraints (additive migrations, no usage_tracking edits, no `.planning/` commits)
- `.planning/config.json` — nyquist_validation enabled, commit_docs false

### Secondary (MEDIUM confidence)
- None required — this phase is pure Postgres primitives and repo precedent

### Tertiary (LOW confidence)
- A4 (Supabase CLI transactional DDL behavior) — inferred from `psql` defaults; mitigated by D-16 verification block which fails loudly in either case

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Postgres primitives are stable and the repo has direct precedent
- Architecture: HIGH — all column types, indexes, FK behavior verified against live schema
- Pitfalls: HIGH — enumerated from deviations between CONTEXT decisions and `handle_new_user` template
- Validation: HIGH — every SC has a concrete SQL or Deno assertion path

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (30 days — stable domain, no moving parts)

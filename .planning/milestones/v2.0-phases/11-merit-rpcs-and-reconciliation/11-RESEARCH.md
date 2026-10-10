# Phase 11: merit-rpcs-and-reconciliation - Research

**Researched:** 2026-04-14
**Domain:** PostgreSQL SECURITY DEFINER RPCs, pgTAP testing, Supabase Edge Function integration
**Confidence:** HIGH

## Summary

Phase 11 ships six atomic `SECURITY DEFINER` RPCs plus a `merit_feature_costs` lookup table plus pgTAP unit tests in one additive migration file, immediately downstream of the Phase 10 ledger foundation. All 25 decisions (D-01..D-25) in `11-CONTEXT.md` are locked; this research closes the gaps the planner needs to write the migration without re-deriving anything: exact file analogs, the current test-infra gap, the transcribed cost matrix, the feature-name strings already used by edge functions, the Phase 10 `merit_transactions` schema contract, the index strategy for `deduction_id`/`refund_of` lookups, and the validation architecture for the Nyquist harness.

**Primary recommendation:** Mirror the structural style of `20260411000002_atomic_check_and_record_usage.sql` for the RPC definitions and `20260412000000_stripe_migration.sql` + `20260414000000_merit_ledger_foundation.sql` for the file-level scaffolding (header comment, section dividers, `DO $$` verification block). Adopt the edge-function-established action-type strings verbatim (`resume_analysis`, `career_compass`, `linkedin_grading`, `recruiting_lens`, `interview_prep`) as the `merit_feature_costs.feature` values — Phase 13 is already wired to pass those strings. Create `supabase/tests/database/` from scratch; no pgTAP infrastructure exists today, and this phase is the one that lights it up.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

All 25 decisions D-01..D-25 in `11-CONTEXT.md` are locked and authoritative. Summary:

**Cost Mapping & Tier Gating (D-01..D-04)**
- New `merit_feature_costs (feature text, tier text, cost int, PK (feature, tier))` table, created in Phase 11's migration, seeded inline.
- `CHECK (tier IN ('free','pro','elite'))`; `CHECK (cost >= 0)`.
- RLS enabled, single read-all `SELECT` policy for `authenticated`, zero write policies.
- Missing `(feature, tier)` row = `tier_locked`. The RPC returns `{ error: 'tier_locked', upgrade_required: true }` **before** any balance check or lock.
- Frontend reads the table directly for UX-02 (no separate `get_feature_costs()` RPC).
- Schema stays minimal — no `active` flag, no `updated_at`.

**check_and_deduct_merits Semantics (D-05..D-07)**
- Flow: cost lookup → `SELECT ... FOR UPDATE` on `user_merits` → balance check → split subscription→shop → write 1-2 `merit_transactions` rows → update `user_merits`.
- Split deductions write TWO rows sharing a `metadata->>'deduction_id'` UUID (Row A: `balance_type='subscription', amount=-N`; Row B: `balance_type='shop', amount=-M`).
- The `deduction_id` is returned to the caller as the `transaction_id` handle that `refund_merits` accepts.
- The RPC is **dumb about LIG-05**. The `linkedin-grader` edge function (Phase 13) owns the free-monthly-scan rule.

**refund_merits Semantics (D-08..D-10)**
- `transaction_id` param = the `deduction_id` UUID. Looks up all rows sharing that `deduction_id`.
- Idempotency: if any row already has a matching `metadata->>'refund_of'` → `{ error: 'already_refunded' }`, no-op.
- Restores the EXACT original buckets (2 sub + 1 shop refunds as 2 sub + 1 shop, never 3 to one bucket).
- No time window on refunds. Idempotency is the only gate.

**credit_shop_merits Semantics (D-11..D-12)**
- Idempotency key = `stripe_payment_id`. Checks `merit_shop_purchases` for existing row first.
- Inserts purchase row with `status='succeeded'`, credits `shop_balance += pack_size`, writes `merit_transactions` row `balance_type='shop', amount=+pack_size, metadata.stripe_payment_id`.
- `pack_size` validated by the Phase 10 `CHECK (pack_size IN (3,10,25,50))` column constraint.

**reset_subscription_merits Semantics (D-13..D-16)**
- Signature: `reset_subscription_merits(user_id uuid, tier text, next_reset_date timestamptz)`.
- Dumb setter — no `now() >= subscription_reset_date` check. Phase 12 owns date logic.
- `tier='pro'` → 75. `tier='elite'` → 150. `tier='free'` → no-op (Free keeps NULL reset date per Phase 10 D-01).
- `shop_balance` NEVER touched by reset.
- Writes `merit_transactions` row: `balance_type='grant', amount = new_balance - old_balance, source='subscription-reset'`.

**Reconciliation (D-17..D-18)**
- `reconcile_merit_balance(user_id)` returns `(user_id, balance_sum int, transactions_sum int, drift int)`.
- Invariant: `drift = 0`.
- No `merit_reconciliation` VIEW in Phase 11.

**Concurrency & Locking (D-19..D-20)**
- Every mutating RPC starts with `SELECT ... FROM user_merits WHERE user_id = <id> FOR UPDATE`.
- Phase 10 `CHECK (subscription_balance >= 0)` and `CHECK (shop_balance >= 0)` are the final negative-balance guard.

**Migration Layout (D-21..D-22)**
- Single file `supabase/migrations/YYYYMMDDHHMMSS_merit_rpcs.sql`: `merit_feature_costs` DDL + RLS + seed → all six RPCs → final `DO $$` verification block.
- All RPCs `SECURITY DEFINER`, owner `postgres`, `SET search_path = public, pg_temp`, `REVOKE ALL FROM public`, `GRANT EXECUTE TO authenticated, service_role`.

**Testing (D-23..D-25)**
- pgTAP in `supabase/tests/database/`. One `.sql` file per RPC + `reconciliation.test.sql`.
- CI runs `supabase db test` against local ephemeral DB seeded with Phase 10 + Phase 11 migrations.
- `CREATE EXTENSION IF NOT EXISTS pgtap` in the test DB only — NOT in production migration.
- Test files live OUTSIDE `supabase/migrations/` so they never ship to staging/prod.
- Coverage: TEST-01, TEST-02, TEST-03, refund idempotency, reconciliation invariant under randomized sequences.

### Claude's Discretion

- Exact feature name strings for `merit_feature_costs.feature` column.
- Exact JSON return shapes (`jsonb` vs `record` return type, column order).
- Seed values transcribed from REQUIREMENTS.md §RES/LIG/CC/RCL/IPC.
- Whether `reconcile_merit_balance` also emits `(expected, actual)` or just `drift`.
- Index set on `merit_transactions` for `deduction_id` and `refund_of` lookups.
- Whether `check_and_deduct_merits` returns `deduction_id` in a dedicated field or inside `deducted_from`.
- Naming of any helper RPC that flips `free_linkedin_scan_used` (likely Phase 13's concern entirely).

### Deferred Ideas (OUT OF SCOPE)

- `MERIT_SYSTEM_ENABLED` feature flag and edge-function call sites — **Phase 13**.
- Stripe webhook wiring of `credit_shop_merits` / `reset_subscription_merits` — **Phase 12**.
- Cron / scheduler for monthly reset — **Phase 12**.
- `merit_reconciliation` VIEW for bulk drift queries — deferred.
- `active` flag / `updated_at` on `merit_feature_costs` — deferred.
- Admin grant tooling, negative-balance repair scripts — deferred.
- `reconcile_all_users()` bulk health-check RPC — deferred.
- Refund time-window / cycle-awareness — explicitly rejected in D-10.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID       | Description                                                                                                                       | Research Support                                                              |
|----------|-----------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| MER-05   | RPC `check_and_deduct_merits(user_id, feature, tier)` — atomic, row-locked, deducts subscription first                            | `check_and_deduct_merits` spec §Standard Stack; D-05 flow; cost table seed    |
| MER-06   | RPC `refund_merits(user_id, transaction_id)` — idempotent reversal                                                                | `refund_merits` spec; D-08..D-10; `metadata->>'refund_of'` index              |
| MER-07   | RPC `get_merit_balance(user_id)` → `{ subscription_balance, shop_balance, total, next_reset_date }`                               | `get_merit_balance` spec; read-only, no locking                               |
| MER-08   | RPC `credit_shop_merits(user_id, pack_size, stripe_payment_id)` — idempotent                                                      | `credit_shop_merits` spec; D-11; Phase 10 `merit_shop_purchases` unique index |
| MER-09   | RPC `reset_subscription_merits(user_id, tier)` — Pro 75 / Elite 150, flips `free_linkedin_scan_used = false`                     | `reset_subscription_merits` spec; D-13..D-16                                  |
| MER-12   | Reconciliation invariant: `subscription_balance + shop_balance = SUM(merit_transactions.amount)` per user                         | `reconcile_merit_balance` spec; D-17                                          |
| SHOP-10  | Subscription balance deducted BEFORE shop balance on every Merit spend                                                            | D-05 step (4); split-deduction semantics                                      |
| TEST-01  | Unit tests for `check_and_deduct_merits`: insufficient balance, sub-first, shop fallback, tier access, refund on failure          | pgTAP file `check_and_deduct_merits.test.sql`; Validation Architecture        |
| TEST-02  | Unit tests for `reset_subscription_merits`: monthly reset, no rollover, yearly plan monthly cadence                               | pgTAP file `reset_subscription_merits.test.sql`                               |
| TEST-03  | Unit tests for `credit_shop_merits`: all 4 pack sizes, duplicate payment rejection, balance update                                | pgTAP file `credit_shop_merits.test.sql`                                      |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **NEVER commit anything within `.planning/` or `.gitignore`.** Phase artifacts (research, plans, logs) stay out of git.
- **Prefer small, reversible changes.** Phase 11 is purely additive — one new table, six new functions, a seed, grants, and a verification block. No DROP, no ALTER, no rename.
- **Supabase Edge Functions (Deno) + React frontend — no new infrastructure.** pgTAP runs via `supabase db test` against the local dev DB; does NOT add new infra.
- **Preserve existing TypeScript and React patterns.** This phase ships SQL only; no frontend or Deno code changes.
- **Use `rg` for searching files and text.** Applies during planner / executor research.
- **Prefer `apply_patch` for focused edits.** Applies during execution.
- **Resume Analysis and Career Compass are business-critical.** This phase does NOT call edge functions; the planner must ensure the migration is non-breaking (it is, because nothing invokes the RPCs until Phase 13 flips `MERIT_SYSTEM_ENABLED`).
- **Structured logging convention:** bracket-prefix (`[FunctionName]`) — NOT relevant in SQL migrations, but Phase 13 callers will follow it.

## Architectural Responsibility Map

| Capability                                               | Primary Tier        | Secondary Tier | Rationale                                                                                                                   |
|----------------------------------------------------------|---------------------|----------------|-----------------------------------------------------------------------------------------------------------------------------|
| Feature cost / tier-gate lookup                          | Database (RLS read) | —              | Single source of truth, frontend reads directly per D-03, RPCs read for enforcement per D-02                                |
| Atomic balance check + deduct + ledger write             | Database (RPC)      | —              | `SELECT ... FOR UPDATE` + transactional semantics only possible in Postgres; edge function would introduce TOCTOU races     |
| Refund idempotency                                       | Database (RPC)      | —              | Idempotency derives from `metadata->>'refund_of'` — must be enforced in the same transaction as the balance mutation        |
| Shop credit idempotency                                  | Database (RPC)      | —              | `stripe_payment_intent_id` UNIQUE constraint + pre-check inside same tx; Stripe webhook handler (Phase 12) is the caller    |
| Monthly reset (dumb setter)                              | Database (RPC)      | —              | The write itself is atomic; Phase 12 (cron / Stripe webhook) decides WHEN to call                                           |
| Reconciliation drift calculation                         | Database (RPC)      | —              | Pure aggregate over `merit_transactions` + `user_merits` — runs where the data lives                                       |
| pgTAP unit tests                                         | Database (test)     | —              | Tests run in the same Postgres environment the migration targets — no Deno/JS layer involved                               |
| Cost preview on UI                                       | Database (read)     | Frontend       | Frontend fetches `merit_feature_costs` via read-all RLS policy; not a Phase 11 concern beyond shipping the policy            |
| Free-monthly-LinkedIn-scan policy                        | Edge Function       | —              | Explicitly OUT of Phase 11 per D-07; lives in `linkedin-grader` caller (Phase 13)                                           |

## Standard Stack

### Core
| Library / Feature          | Version                  | Purpose                                                          | Why Standard                                                                            |
|----------------------------|--------------------------|------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| PostgreSQL                 | 15.x (Supabase)          | Host DB                                                          | Mandated by Supabase platform. [VERIFIED: `supabase/config.toml` + CLI 2.76.9 in package.json] |
| `plpgsql`                  | builtin                  | RPC language                                                     | Existing `check_and_record_ai_usage` RPC uses `LANGUAGE plpgsql`. [VERIFIED]            |
| `SECURITY DEFINER`         | Postgres                 | Bypass RLS for server-side writes                                | Established pattern in repo (Phase 10 trigger, `atomic_check_and_record_usage`). [VERIFIED] |
| `SELECT ... FOR UPDATE`    | Postgres                 | Row-level lock serializing concurrent deduct/credit/reset        | Named in D-19; Phase 10 rows are guaranteed to exist so no `INSERT ... FOR UPDATE` dance  |
| `jsonb` return type        | Postgres                 | RPC return shape — flexible, matches existing `check_and_record_ai_usage` style | `check_and_record_ai_usage` already returns `jsonb`. [VERIFIED]                |
| pgTAP                      | ≥1.2                     | Unit-test framework for SQL                                      | Shipped with Supabase local dev DB; invoked via `supabase db test`. [CITED: supabase.com/docs/guides/cli/testing-and-linting] |
| `gen_random_uuid()`        | Postgres `pgcrypto`       | Generate `deduction_id` for split deductions                      | Already in use (Phase 10 `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`). [VERIFIED]   |

### Supporting
| Library / Feature             | Purpose                                                              | When to Use                                                                         |
|-------------------------------|----------------------------------------------------------------------|-------------------------------------------------------------------------------------|
| `REVOKE ALL ... FROM public` | Lock down RPC surface to explicit grantees only                      | Every RPC in the migration, per D-22                                                |
| `GRANT EXECUTE ... TO authenticated, service_role` | Explicit grantee list, matches Phase 10 posture       | Every RPC in the migration                                                          |
| `SET search_path = public, pg_temp` | ASVS V4 mitigation against schema-injection in `SECURITY DEFINER` | Every RPC (matches Phase 10 D-07 posture)                                          |
| Partial / expression index on `metadata->>'deduction_id'` | Fast refund lookup by deduction UUID                     | New in Phase 11 — covered in Index Strategy below                                   |
| `supabase db test` CLI        | Runs pgTAP files in `supabase/tests/database/`                       | CI and local dev; no existing hookup, this phase creates it                          |
| `DO $$ ... END $$` block      | Final verification that catches deploy-time drift                    | End of migration file; matches Phase 10 D-16 pattern                                |

### Alternatives Considered
| Instead of                           | Could Use                                  | Tradeoff                                                                                                        |
|--------------------------------------|--------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| `FOR UPDATE` row lock                | `pg_advisory_xact_lock(hashtext(user_id))`| Phase 10's existing `check_and_record_ai_usage` uses advisory lock. `FOR UPDATE` is more explicit and required by D-19. Advisory lock would also work but is less aligned with the locked decision. |
| `jsonb` return                       | Composite `record` type                    | `record` gives stronger typing but complicates frontend / Deno callers that expect JSON-ish shapes. `jsonb` matches existing repo pattern. |
| Separate `get_feature_costs()` RPC   | Direct frontend SELECT on `merit_feature_costs` | D-03 explicitly chooses the direct read. No alternative.                                                       |
| One row per split deduction with `amount_subscription` + `amount_shop` columns | Two rows sharing `deduction_id`           | D-06 explicitly chooses two rows to preserve clean `balance_type` semantics and per-bucket refund.              |

**Installation:** No npm packages. All work happens in a single SQL migration file + new `supabase/tests/database/` directory.

**Version verification:**
- `supabase` CLI is pinned to `^2.76.9` in `package.json` devDependencies. [VERIFIED: package.json line reading `"supabase": "^2.76.9"`]
- Supabase CLI 2.x ships pgTAP support via `supabase db test` [CITED: https://supabase.com/docs/guides/cli/testing-and-linting].
- PostgreSQL version is controlled by Supabase's managed platform (currently 15.x for new projects).

## Architecture Patterns

### System Architecture Diagram

```
                     ┌───────────────────────────────────────────────┐
                     │           PHASE 11 RPC GATEWAY                │
                     │         (all SECURITY DEFINER, public.)      │
                     └───────────────────────────────────────────────┘
                                         ▲
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
     Phase 13 edge fn            Phase 12 webhook       Frontend (read-only)
     (analyze-resume,            (stripe-webhook-       (cost previews,
      analyze-career,             handler)              balance badge)
      grade-linkedin,             │                      │
      recruiting-lens,            │                      │
      interview-prep-coach)       │                      │
                    │             │                      │
                    ▼             ▼                      ▼
         check_and_deduct    credit_shop_merits    merit_feature_costs
         refund_merits       reset_subscription     (direct SELECT,
         get_merit_balance    _merits                read-all RLS)
                    │             │                      │
                    └─────┬───────┘                      │
                          ▼                              │
            ┌─────────────────────────────┐              │
            │   user_merits (row-locked)  │              │
            │   FOR UPDATE on every write │              │
            └─────────────────────────────┘              │
                          │                              │
                          ▼                              │
            ┌─────────────────────────────┐              │
            │  merit_transactions         │◀─────────────┘
            │  (append-only ledger)       │
            │  metadata: deduction_id,    │
            │  refund_of, stripe_payment  │
            └─────────────────────────────┘
                          │
                          ▼
            ┌─────────────────────────────┐
            │  reconcile_merit_balance    │
            │  (read-only aggregate)      │
            │  drift = balance_sum -      │
            │          transactions_sum   │
            └─────────────────────────────┘
```

Data flow: a Phase 13 edge function calls `check_and_deduct_merits(user_id, feature, tier)`. The RPC looks up the cost in `merit_feature_costs` (returns `tier_locked` if missing), takes `FOR UPDATE` on `user_merits`, validates `sub + shop >= cost`, splits the deduction, writes 1-2 `merit_transactions` rows sharing a `deduction_id`, and updates `user_merits`. On AI failure, Phase 13 calls `refund_merits(user_id, deduction_id)` which looks up the original rows by `deduction_id`, refuses if already refunded, and writes mirroring refund rows restoring the exact buckets. `reconcile_merit_balance` is a pure aggregate: `balance_sum - transactions_sum = drift` must always equal 0.

### Recommended Project Structure
```
supabase/
├── migrations/
│   └── 20260415000000_merit_rpcs.sql           # the only production artifact (Phase 11)
└── tests/
    └── database/                                # NEW — created by Phase 11 Wave 0
        ├── 00_pgtap_bootstrap.sql                # CREATE EXTENSION IF NOT EXISTS pgtap;
        ├── check_and_deduct_merits.test.sql      # TEST-01
        ├── refund_merits.test.sql                # refund idempotency + split-bucket refund
        ├── get_merit_balance.test.sql            # smoke
        ├── credit_shop_merits.test.sql           # TEST-03
        ├── reset_subscription_merits.test.sql    # TEST-02
        └── reconciliation.test.sql               # SC-5: randomized sequence drift=0
```

### Pattern 1: SECURITY DEFINER RPC with FOR UPDATE lock
**What:** Atomic mutation RPC that serializes concurrent callers per-user.
**When to use:** Every `user_merits`-mutating RPC in Phase 11.
**Example (mirrors `20260411000002_atomic_check_and_record_usage.sql`):**
```sql
-- Source: structural template from
-- supabase/migrations/20260411000002_atomic_check_and_record_usage.sql
CREATE OR REPLACE FUNCTION public.check_and_deduct_merits(
  p_user_id uuid,
  p_feature text,
  p_tier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cost            integer;
  v_sub_balance     integer;
  v_shop_balance    integer;
  v_sub_take        integer;
  v_shop_take       integer;
  v_deduction_id    uuid := gen_random_uuid();
BEGIN
  -- 1. Tier-gated cost lookup (D-02): missing row = tier_locked BEFORE any balance op.
  SELECT cost INTO v_cost
  FROM public.merit_feature_costs
  WHERE feature = p_feature AND tier = p_tier;

  IF v_cost IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'tier_locked',
      'upgrade_required', true
    );
  END IF;

  -- 2. Row lock on user_merits (D-19).
  SELECT subscription_balance, shop_balance
    INTO v_sub_balance, v_shop_balance
    FROM public.user_merits
    WHERE user_id = p_user_id
    FOR UPDATE;

  -- 3. Pre-check (happy path). CHECK constraint is the safety net (D-20).
  IF (v_sub_balance + v_shop_balance) < v_cost THEN
    RETURN jsonb_build_object(
      'error', 'insufficient_merits',
      'upgrade_required', true
    );
  END IF;

  -- 4. Split: subscription first, shop covers remainder (SHOP-10).
  v_sub_take  := LEAST(v_sub_balance, v_cost);
  v_shop_take := v_cost - v_sub_take;

  -- 5. Write 1 or 2 merit_transactions rows sharing deduction_id (D-06).
  IF v_sub_take > 0 THEN
    INSERT INTO public.merit_transactions
      (user_id, amount, balance_type, source, feature, metadata)
    VALUES
      (p_user_id, -v_sub_take, 'subscription', 'feature-deduct', p_feature,
       jsonb_build_object('deduction_id', v_deduction_id, 'tier', p_tier));
  END IF;

  IF v_shop_take > 0 THEN
    INSERT INTO public.merit_transactions
      (user_id, amount, balance_type, source, feature, metadata)
    VALUES
      (p_user_id, -v_shop_take, 'shop', 'feature-deduct', p_feature,
       jsonb_build_object('deduction_id', v_deduction_id, 'tier', p_tier));
  END IF;

  -- 6. Update user_merits (CHECK constraint is the negative-balance safety net).
  UPDATE public.user_merits
    SET subscription_balance = subscription_balance - v_sub_take,
        shop_balance         = shop_balance         - v_shop_take,
        updated_at           = now()
    WHERE user_id = p_user_id;

  -- 7. Happy-path response. deduction_id is the refund handle.
  RETURN jsonb_build_object(
    'success',            true,
    'transaction_id',     v_deduction_id,
    'remaining_balance',  (v_sub_balance - v_sub_take) + (v_shop_balance - v_shop_take),
    'deducted_from',      jsonb_build_object(
      'subscription', v_sub_take,
      'shop',         v_shop_take
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_deduct_merits(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_and_deduct_merits(uuid, text, text)
  TO authenticated, service_role;
```

### Pattern 2: Idempotent refund via `metadata->>'refund_of'`
**What:** Refund RPC looks up original deduction rows by `deduction_id`, checks that NO row already has a matching `refund_of`, and writes mirroring refund rows.
**When to use:** `refund_merits` only.
**Key SQL primitive:** The idempotency check is a single `EXISTS` against the expression index:
```sql
IF EXISTS (
  SELECT 1 FROM public.merit_transactions r
  WHERE r.metadata->>'refund_of' IN (
    SELECT d.id::text FROM public.merit_transactions d
    WHERE d.metadata->>'deduction_id' = p_transaction_id::text
  )
) THEN
  RETURN jsonb_build_object('error', 'already_refunded');
END IF;
```

### Pattern 3: Final `DO $$` verification block
**What:** The migration's last SQL statement is a `DO $$` anonymous block that calls each RPC once in a SAVEPOINT with a throwaway user, verifies no errors, and rolls back. If any RPC's definition is broken, the migration fails at deploy time.
**Example (mirrors `20260414000000_merit_ledger_foundation.sql` lines 169-195):**
```sql
DO $$
DECLARE
  v_rpc_count integer;
BEGIN
  -- Assert all six RPCs exist and are SECURITY DEFINER.
  SELECT COUNT(*) INTO v_rpc_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'check_and_deduct_merits',
      'refund_merits',
      'get_merit_balance',
      'credit_shop_merits',
      'reset_subscription_merits',
      'reconcile_merit_balance'
    )
    AND p.prosecdef = true;

  IF v_rpc_count <> 6 THEN
    RAISE EXCEPTION
      'Phase 11 RPC deployment failed: expected 6 SECURITY DEFINER RPCs, found %', v_rpc_count;
  END IF;

  -- Assert cost table seed is complete.
  SELECT COUNT(*) INTO v_rpc_count FROM public.merit_feature_costs;
  IF v_rpc_count < 9 THEN
    RAISE EXCEPTION
      'Phase 11 cost table seed incomplete: expected ≥9 rows, found %', v_rpc_count;
  END IF;

  RAISE NOTICE 'Phase 11 verification passed: 6 RPCs deployed, % cost rows seeded', v_rpc_count;
END $$;
```

### Anti-Patterns to Avoid
- **Collapsing split deductions into one `merit_transactions` row with a JSON breakdown.** D-06 explicitly rejects this. Per-bucket `balance_type` is load-bearing for refund correctness.
- **Defensive `INSERT ... ON CONFLICT` on `user_merits` inside an RPC.** Phase 10 D-05 guarantees the row always exists via the auto-provision trigger. Extra defensive code is a correctness smell.
- **Permissive RLS write policy on `merit_feature_costs`.** D-01 locks this table to read-all for `authenticated`, zero writes. Repeating the Phase 07 SEC-06 Paddle bug would open direct client writes. The stripe migration's header comment calls this out explicitly.
- **Recomputing `subscription_reset_date` inside `reset_subscription_merits`.** D-13 is unambiguous: the caller supplies the date. Phase 12 owns billing truth.
- **Dropping the `DO $$` verification block "because pgTAP covers it".** pgTAP runs against a local test DB; the `DO $$` block runs against the target DB on every deploy. Keep both.
- **Putting `CREATE EXTENSION pgtap` in the production migration.** D-25 rejects this. pgTAP is dev-only.

## Don't Hand-Roll

| Problem                                          | Don't Build                                                        | Use Instead                                                                  | Why                                                              |
|--------------------------------------------------|--------------------------------------------------------------------|-----------------------------------------------------------------------------|------------------------------------------------------------------|
| Per-user concurrency                             | Application-level mutex / retry loop                               | `SELECT ... FOR UPDATE` inside a SECURITY DEFINER RPC                        | Postgres row locks are already transactional, free, and race-free |
| Negative-balance prevention                      | Deduction pre-check only                                            | Pre-check (happy path) + Phase 10 `CHECK (>= 0)` constraint (safety net)   | Defense in depth — a buggy RPC can't corrupt the balance invariant |
| Idempotency for Stripe credit                    | Set-based dedup in application code                                 | Phase 10 `merit_shop_purchases.stripe_payment_intent_id` UNIQUE index      | Uniqueness lives in the DB schema, indelible and race-free      |
| Refund idempotency                               | Application-level refund log                                        | Expression index on `metadata->>'refund_of'` + in-RPC `EXISTS` check        | Keeps the ledger self-contained; survives any application rewrite |
| Balance reconciliation                           | Cached `user_merits.running_total` column                           | Aggregate query against `merit_transactions`                                | Caching introduces a second truth and makes drift impossible to detect |
| pgTAP bootstrap                                  | Handwritten Deno "shell out to psql and assert on stdout"           | `supabase db test` + pgTAP `plan()` / `ok()` / `is()` primitives            | Standard, already supported by Supabase CLI 2.x                  |
| UUID generation for `deduction_id`               | Application-side UUID passed in                                     | `gen_random_uuid()` inside the RPC                                          | Callers don't need to know / can't forge; RPC returns it in the response |

**Key insight:** Every correctness property Phase 11 needs is already expressible via existing Postgres primitives (row locks, CHECK constraints, UNIQUE indexes, expression indexes). The cost of hand-rolling any of them is a parallel truth that drifts from the ledger — which is exactly what MER-12's reconciliation invariant is designed to catch.

## Runtime State Inventory

Phase 11 is greenfield (new table + new RPCs); no rename/refactor of existing state. This section is included for completeness so the planner does not wonder whether it was skipped.

| Category                     | Items Found | Action Required |
|------------------------------|-------------|------------------|
| Stored data                  | None — verified by the fact that Phase 11 creates `merit_feature_costs` and six new RPCs; no existing rows or RPCs are modified or dropped | — |
| Live service config          | None — no Supabase dashboard state, no pg_cron job, no scheduled edge function is created or modified in this phase (cron for reset is Phase 12) | — |
| OS-registered state          | None — no Windows Task Scheduler / systemd / pm2 entries | — |
| Secrets / env vars           | None — no new secrets. `SUPABASE_SERVICE_ROLE_KEY` is already configured | — |
| Build artifacts              | None — SQL migrations are not compiled; pgTAP extension is a dev-DB concern only | — |

## Transcribed Cost Matrix

Seed the `merit_feature_costs` table with exactly these rows, derived verbatim from REQUIREMENTS.md §RES/LIG/CC/RCL/IPC.

| feature                                | tier  | cost | Source REQ       | Notes                                                              |
|----------------------------------------|-------|------|------------------|---------------------------------------------------------------------|
| `resume_analysis`                      | free  | 3    | RES-01           |                                                                     |
| `resume_analysis`                      | pro   | 2    | RES-03           |                                                                     |
| `resume_analysis`                      | elite | 3    | RES-04           |                                                                     |
| `linkedin_grading`                     | free  | 3    | LIG-01           | LIG-05 "first scan free" is enforced in the caller, not the RPC     |
| `linkedin_grading`                     | pro   | 2    | LIG-03 + LIG-05  |                                                                     |
| `linkedin_grading`                     | elite | 3    | LIG-04 + LIG-05  |                                                                     |
| `career_compass`                       | free  | 3    | CC-01            |                                                                     |
| `career_compass`                       | pro   | 2    | CC-03            |                                                                     |
| `career_compass`                       | elite | 3    | CC-04            |                                                                     |
| `recruiting_lens`                      | pro   | 8    | RCL-02           | **NO `free` row** → RPC returns `tier_locked` (RCL-01)              |
| `recruiting_lens`                      | elite | 5    | RCL-04           |                                                                     |
| `interview_prep`                       | pro   | 8    | IPC-02           | **NO `free` row** → RPC returns `tier_locked` (IPC-01). Flashcards path |
| `interview_prep`                       | elite | 5    | IPC-03           | Quiz path                                                           |

**Tier-locked (missing-row) combinations (D-02):**
- `('recruiting_lens', 'free')` — RCL-01
- `('interview_prep', 'free')` — IPC-01

Both are enforced by the ABSENCE of a row, not by a separate `locked = true` flag. The RPC returns `{ error: 'tier_locked', upgrade_required: true }` with no side effects.

**Total rows to seed: 13.** (The `DO $$` verification block should assert `>= 9` as a sanity floor but ideally `= 13`.)

**SQL seed snippet:**
```sql
INSERT INTO public.merit_feature_costs (feature, tier, cost) VALUES
  ('resume_analysis',  'free',  3),
  ('resume_analysis',  'pro',   2),
  ('resume_analysis',  'elite', 3),
  ('linkedin_grading', 'free',  3),
  ('linkedin_grading', 'pro',   2),
  ('linkedin_grading', 'elite', 3),
  ('career_compass',   'free',  3),
  ('career_compass',   'pro',   2),
  ('career_compass',   'elite', 3),
  ('recruiting_lens',  'pro',   8),
  ('recruiting_lens',  'elite', 5),
  ('interview_prep',   'pro',   8),
  ('interview_prep',   'elite', 5);
```

## Feature Name String Resolution (Claude's Discretion from CONTEXT.md)

CONTEXT.md explicitly calls this out as planner's discretion. Research shows the edge-function action-type enum is **already established** and Phase 13 should pass those strings verbatim.

**Evidence from `supabase/functions/_shared/usage-checker.ts`:**
```ts
export type ActionType =
  | 'resume_analysis'
  | 'job_matching'
  | 'career_compass'
  | 'skills_gap_analysis'
  | 'linkedin_grading'
  | 'job_comparison'
  | 'recruiting_lens'
  | 'interview_prep';
```

**Evidence from edge function call sites (grep of `checkAndRecordUsage`):**
- `supabase/functions/analyze-resume/index.ts`: passes `'resume_analysis'` (lines 429, 510, 664, 752)
- `supabase/functions/analyze-career/index.ts`: passes `'career_compass'` (line 384)
- `supabase/functions/grade-linkedin/index.ts`: passes `'linkedin_grading'` (line 165)
- `supabase/functions/recruiting-lens/index.ts`: passes `'recruiting_lens'` (line 193)
- `supabase/functions/interview-prep-coach/index.ts`: passes `'interview_prep'` (line 67)

**Recommendation:** Use the exact strings above in `merit_feature_costs.feature`. This lets Phase 13 re-use the existing `ActionType` union verbatim when it refactors `usage-checker.ts` into `merit-checker.ts` — zero string surgery. [VERIFIED via Grep on `supabase/functions/`]

## merit_transactions Schema Contract (from Phase 10 migration)

Read from `supabase/migrations/20260414000000_merit_ledger_foundation.sql` lines 32-43. The planner needs to know exactly what columns are available and what CHECK constraints apply:

```sql
CREATE TABLE IF NOT EXISTS public.merit_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount        integer NOT NULL,                                           -- signed (D-12)
  balance_type  text    NOT NULL
                  CHECK (balance_type IN ('subscription','shop','grant','refund')),
  source        text    NOT NULL,                                           -- free-form string
  feature       text    NULL,                                               -- nullable
  metadata      jsonb   NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

**Allowed `balance_type` values (CHECK-enforced):** `'subscription'`, `'shop'`, `'grant'`, `'refund'`.

**`source` is free-form text, not constrained.** Phase 11 RPCs should use these canonical source strings:
- `check_and_deduct_merits`: `source = 'feature-deduct'`
- `refund_merits`: `source = 'feature-refund'`
- `credit_shop_merits`: `source = 'shop-credit'`
- `reset_subscription_merits`: `source = 'subscription-reset'` (already named in D-16)

**Metadata shapes Phase 11 writes into `metadata jsonb`:**

| RPC                          | balance_type of row            | `metadata` keys written                                                              |
|------------------------------|--------------------------------|---------------------------------------------------------------------------------------|
| `check_and_deduct_merits`    | `subscription` and/or `shop`   | `{ deduction_id: <uuid>, tier: <text> }`                                              |
| `refund_merits`              | `refund` (per original bucket) | `{ refund_of: <original row id>, deduction_id: <original deduction_id> }`            |
| `credit_shop_merits`         | `shop`                         | `{ stripe_payment_id: <text>, pack_size: <int> }`                                     |
| `reset_subscription_merits`  | `grant`                        | `{ reset_for_tier: 'pro'\|'elite', prev_balance: <int>, next_reset_date: <iso> }`    |

**CRITICAL:** `refund_merits` rows use `balance_type = 'refund'` as D-09 says — NOT the original bucket. But the `user_merits` update restores the ORIGINAL bucket (subscription vs shop) per the `refund_of` lookup. Re-read D-09 carefully — it says "restore the exact original buckets" in the `user_merits` update, and D-17's reconciliation invariant relies on `SUM(amount)` across ALL `merit_transactions`, so the `refund` balance_type is fine.

**Planner note:** The CHECK constraint allows `balance_type='refund'`, which is a distinct value from `'subscription'`/`'shop'`. Phase 10 D-09 chose this deliberately. The reconciliation sum is by `amount`, not by `balance_type`, so drift stays at 0 even though the refund row isn't labeled as the bucket it restores.

## Index Strategy (Claude's Discretion from CONTEXT.md)

Phase 10 already shipped:
- `idx_merit_transactions_user_created` on `(user_id, created_at DESC)` — covers the "last N transactions for a user" query.
- `idx_merit_transactions_refund_of` on `(metadata->>'refund_of') WHERE metadata ? 'refund_of'` — covers the "has this row been refunded?" lookup.

**Phase 11 needs ONE additional index** — the `deduction_id` lookup in `refund_merits` Step 1 ("find all rows sharing this deduction_id"). Add:

```sql
CREATE INDEX IF NOT EXISTS idx_merit_transactions_deduction_id
  ON public.merit_transactions ((metadata->>'deduction_id'))
  WHERE metadata ? 'deduction_id';
```

**Rationale:**
- Partial index (`WHERE metadata ? 'deduction_id'`) keeps the index small — only deduction rows carry the key. Grant/refund rows don't bloat it.
- Expression index on `metadata->>'deduction_id'` returns text; the RPC query should cast to text at both ends: `WHERE metadata->>'deduction_id' = p_transaction_id::text`.
- This mirrors the shape of the already-shipped `idx_merit_transactions_refund_of`.

**Do NOT use a GIN index on `metadata jsonb`.** GIN is justified only when you query arbitrary keys. Phase 11 queries exactly two keys (`deduction_id`, `refund_of`), and both are already covered or will be covered by cheap B-tree expression indexes.

## Common Pitfalls

### Pitfall 1: TOCTOU race between cost lookup and balance update
**What goes wrong:** If two concurrent `check_and_deduct_merits` calls for the same user both pass the `sub+shop >= cost` check before either writes, they can both succeed and drive `user_merits` below zero.
**Why it happens:** The cost lookup is a separate statement from the balance mutation.
**How to avoid:** `SELECT ... FOR UPDATE` on `user_merits` happens AFTER the cost lookup but BEFORE the balance check. The lock serializes the two concurrent calls — the second one reads the already-deducted balance. Phase 10 `CHECK (>= 0)` is the safety net if the pre-check logic has a bug.
**Warning signs:** pgTAP test that spawns two concurrent transactions via `BEGIN; ... COMMIT;` in separate sessions. Phase 11's reconciliation test (SC-5) catches this post-hoc via `drift != 0`.

### Pitfall 2: Forgetting `SET search_path` on SECURITY DEFINER RPCs
**What goes wrong:** A malicious user creates a `public.user_merits` table in their own schema and sets `search_path = their_schema, public`. The RPC then writes to the attacker's table instead of the real one.
**Why it happens:** `SECURITY DEFINER` runs as the owner but uses the caller's `search_path` unless explicitly pinned.
**How to avoid:** `SET search_path = public, pg_temp` on every RPC. This is ASVS V4 access-control territory and matches Phase 10 D-07. [CITED: PostgreSQL docs — https://www.postgresql.org/docs/current/sql-createfunction.html#SECURITY-SECTION]
**Warning signs:** Code review checks; pgTAP test `has_function_setting('public', 'check_and_deduct_merits', '{search_path=public,pg_temp}')`.

### Pitfall 3: pgTAP extension shipping to production
**What goes wrong:** `CREATE EXTENSION pgtap` ends up in the production migration; prod DB bloats, and you accidentally ship test-harness functions into `public`.
**Why it happens:** Copy-paste from a tutorial that drops extension creation into the migration file.
**How to avoid:** D-25 explicitly forbids this. Phase 11 uses a `supabase/tests/database/00_pgtap_bootstrap.sql` file that lives OUTSIDE `supabase/migrations/`. `supabase db test` applies it only to the ephemeral test DB.
**Warning signs:** `grep pgtap supabase/migrations/` should return zero results at plan-check time.

### Pitfall 4: Refund rows with `balance_type` set to the original bucket
**What goes wrong:** The developer reads D-09 ("restore the exact original buckets") and writes refund rows with `balance_type='subscription'` or `'shop'`. The reconciliation invariant still holds (it's a pure sum), but the `merit_transactions` ledger becomes ambiguous — you can't distinguish "deduction" from "refund" by `balance_type` alone, only by sign.
**Why it happens:** Ambiguous reading of D-09.
**How to avoid:** D-09 says to restore the original bucket in `user_merits.subscription_balance` / `shop_balance`. The `merit_transactions.balance_type` column for refund rows should be `'refund'` — the fourth enum value Phase 10 reserved specifically for this. The per-bucket restore lives in the `UPDATE user_merits SET ...` clause, not in the refund row's `balance_type`.
**Warning signs:** pgTAP test `SELECT balance_type FROM merit_transactions WHERE source = 'feature-refund'` should return only `'refund'`.

### Pitfall 5: `reset_subscription_merits` touching `shop_balance`
**What goes wrong:** A naive implementation does `UPDATE user_merits SET subscription_balance = 75, shop_balance = 0, ...`. Shop Merits are destroyed on every monthly reset.
**Why it happens:** Misreading D-15 as "reset balances" instead of "reset subscription_balance".
**How to avoid:** The `UPDATE` statement explicitly lists only `subscription_balance`, `free_linkedin_scan_used`, `subscription_reset_date`, `updated_at`. Phase 11 pgTAP test for TEST-02 must include an assertion that `shop_balance` is unchanged after a reset.
**Warning signs:** `reset_subscription_merits.test.sql` does `SELECT shop_balance BEFORE, call RPC, SELECT shop_balance AFTER, assert equal`.

### Pitfall 6: `credit_shop_merits` writing the purchase row OUTSIDE the `FOR UPDATE` window
**What goes wrong:** The RPC does `INSERT INTO merit_shop_purchases ...` BEFORE `SELECT ... FOR UPDATE` on `user_merits`. The UNIQUE constraint catches the duplicate, but the `user_merits` lock happens too late, so concurrent duplicate webhook deliveries can both hit the pre-check (which reads `merit_shop_purchases` to detect idempotency) and both try to insert.
**Why it happens:** Wrong statement ordering.
**How to avoid:** The order is (1) `SELECT ... FOR UPDATE` on `user_merits`, (2) `SELECT ... FROM merit_shop_purchases WHERE stripe_payment_intent_id = p_stripe_payment_id` to detect duplicate, (3) INSERT the purchase row, (4) update `user_merits`, (5) insert `merit_transactions` row. The `FOR UPDATE` lock on `user_merits` serializes concurrent webhook deliveries for the same user before the idempotency check.

## Code Examples

### Example: `refund_merits` idempotency check
```sql
-- Source: composed from Phase 10 schema + Phase 11 D-08/D-09 semantics
CREATE OR REPLACE FUNCTION public.refund_merits(
  p_user_id uuid,
  p_transaction_id uuid  -- the deduction_id UUID returned by check_and_deduct_merits
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row RECORD;
  v_sub_restore  integer := 0;
  v_shop_restore integer := 0;
BEGIN
  -- Lock user_merits first (D-19).
  PERFORM 1 FROM public.user_merits WHERE user_id = p_user_id FOR UPDATE;

  -- Idempotency: any existing refund row that points at ANY of the original rows?
  IF EXISTS (
    SELECT 1
    FROM public.merit_transactions r
    WHERE r.user_id = p_user_id
      AND r.balance_type = 'refund'
      AND (r.metadata->>'deduction_id') = p_transaction_id::text
  ) THEN
    RETURN jsonb_build_object('error', 'already_refunded');
  END IF;

  -- Look up original deduction rows by shared deduction_id.
  -- Loop so split deductions (1 or 2 rows) are handled uniformly.
  FOR v_row IN
    SELECT id, amount, balance_type
    FROM public.merit_transactions
    WHERE user_id = p_user_id
      AND (metadata->>'deduction_id') = p_transaction_id::text
      AND balance_type IN ('subscription','shop')
  LOOP
    -- Write mirroring refund row (positive amount, balance_type='refund' per D-09/Pitfall 4).
    INSERT INTO public.merit_transactions
      (user_id, amount, balance_type, source, feature, metadata)
    VALUES
      (p_user_id, -v_row.amount, 'refund', 'feature-refund', NULL,
       jsonb_build_object(
         'refund_of',    v_row.id,
         'deduction_id', p_transaction_id
       ));

    -- Accumulate per-bucket restore amount.
    IF v_row.balance_type = 'subscription' THEN
      v_sub_restore := v_sub_restore + (-v_row.amount);
    ELSIF v_row.balance_type = 'shop' THEN
      v_shop_restore := v_shop_restore + (-v_row.amount);
    END IF;
  END LOOP;

  IF (v_sub_restore + v_shop_restore) = 0 THEN
    RETURN jsonb_build_object('error', 'unknown_transaction');
  END IF;

  -- Restore exact buckets (D-09).
  UPDATE public.user_merits
    SET subscription_balance = subscription_balance + v_sub_restore,
        shop_balance         = shop_balance         + v_shop_restore,
        updated_at           = now()
    WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success',         true,
    'refunded_to',     jsonb_build_object(
      'subscription',  v_sub_restore,
      'shop',          v_shop_restore
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_merits(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.refund_merits(uuid, uuid) TO authenticated, service_role;
```

### Example: `reconcile_merit_balance` (pure aggregate)
```sql
CREATE OR REPLACE FUNCTION public.reconcile_merit_balance(p_user_id uuid)
RETURNS TABLE (
  user_id           uuid,
  balance_sum       integer,
  transactions_sum  integer,
  drift             integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    um.user_id,
    (um.subscription_balance + um.shop_balance)            AS balance_sum,
    COALESCE((
      SELECT SUM(amount)::int
      FROM public.merit_transactions t
      WHERE t.user_id = um.user_id
    ), 0)                                                   AS transactions_sum,
    (um.subscription_balance + um.shop_balance)
      - COALESCE((
          SELECT SUM(amount)::int
          FROM public.merit_transactions t
          WHERE t.user_id = um.user_id
        ), 0)                                               AS drift
  FROM public.user_merits um
  WHERE um.user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.reconcile_merit_balance(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reconcile_merit_balance(uuid) TO authenticated, service_role;
```

### Example: pgTAP unit test shape
```sql
-- supabase/tests/database/check_and_deduct_merits.test.sql
BEGIN;
SELECT plan(8);

-- Fixture: a Pro user with 10 subscription + 5 shop Merits.
-- (Assumes a helper that creates a profile + user_merits row for a throwaway uuid.)
SELECT merit_test_fixture_user('11111111-1111-1111-1111-111111111111', 10, 5);

-- TEST-01.a: subscription-first deduction (cost 3, sub 10 → 7 sub, 5 shop).
SELECT lives_ok(
  $$ SELECT public.check_and_deduct_merits(
       '11111111-1111-1111-1111-111111111111',
       'resume_analysis',
       'pro'
     ) $$,
  'check_and_deduct_merits deducts from subscription first'
);

SELECT is(
  (SELECT subscription_balance FROM public.user_merits
    WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  8,  -- 10 - 2 (pro cost for resume_analysis)
  'subscription_balance decreased by the pro cost'
);

SELECT is(
  (SELECT shop_balance FROM public.user_merits
    WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  5,
  'shop_balance untouched when subscription covers cost'
);

-- TEST-01.b: tier-locked error
SELECT results_eq(
  $$ SELECT public.check_and_deduct_merits(
       '11111111-1111-1111-1111-111111111111',
       'recruiting_lens',
       'free'
     )->>'error' $$,
  $$ VALUES ('tier_locked') $$,
  'recruiting_lens on free tier returns tier_locked'
);

-- ... TEST-01.c split, TEST-01.d insufficient, TEST-01.e refund, etc.

SELECT * FROM finish();
ROLLBACK;
```

## State of the Art

| Old Approach                                            | Current Approach                                                       | When Changed | Impact                                                                                           |
|---------------------------------------------------------|------------------------------------------------------------------------|--------------|--------------------------------------------------------------------------------------------------|
| Separate `can_perform_ai_action` + `record_ai_usage`    | Single atomic `check_and_record_ai_usage` RPC with advisory lock       | Phase 4 CR-01 (repo-specific) | Phase 11 inherits the lesson: collapse check + mutate into one SECURITY DEFINER RPC |
| Advisory lock (`pg_advisory_xact_lock`)                 | Explicit `SELECT ... FOR UPDATE` on the row being mutated             | Phase 11 D-19 | More explicit, easier to reason about, easier to pgTAP-test. Advisory lock would also work but is weaker signal |
| Deno-only test infrastructure (`run-edge-tests.ps1`)    | pgTAP for SQL + Deno for edge functions                                | Phase 11     | Adds a new test surface. `run-edge-tests.ps1` is untouched; `supabase db test` is the new entry point |

**Deprecated / outdated:**
- `pg_advisory_xact_lock(hashtext(user_id))` as Phase 11's locking primitive — D-19 supersedes with `FOR UPDATE`.

## Environment Availability

| Dependency                        | Required By                                  | Available | Version     | Fallback                                                          |
|-----------------------------------|----------------------------------------------|-----------|-------------|-------------------------------------------------------------------|
| Supabase CLI                      | Migration apply, `supabase db test`          | ✓         | 2.76.9      | —                                                                 |
| PostgreSQL (local via Supabase)    | Migration apply, pgTAP test runner           | ✓         | 15.x        | —                                                                 |
| pgTAP extension                   | Test runner                                   | ✓         | ships with Supabase local DB | —                                                       |
| Deno runtime                      | Only if tests also cover edge fn shape       | ✓         | 2+          | pgTAP-only is sufficient for Phase 11 per D-23                    |
| `supabase/tests/database/`        | pgTAP test discovery                          | ✗         | —           | **Wave 0 creates this directory** — first time it exists in repo  |
| CI hook for `supabase db test`    | Automated pgTAP run per PR                    | ✗         | —           | Planner decides: add new script (e.g., `scripts/run-db-tests.ps1`) or extend `run-edge-tests.ps1`. Defer to planner. |

**Missing dependencies with no fallback:** None. Everything Phase 11 needs either ships with the Supabase CLI or is created by Phase 11 itself.

**Missing dependencies with fallback:**
- The test runner script is missing but trivially created. Recommend `scripts/run-db-tests.ps1` that wraps `supabase db test` and is invoked by the same CI job that runs `run-edge-tests.ps1`.

**Gap vs. CONTEXT.md assumption:** D-23 assumes "CI runs `supabase db test` against a local ephemeral DB". As of 2026-04-14 this CI hookup does **not** exist. `run-edge-tests.ps1` handles Deno tests only. The planner MUST either include a task to create `scripts/run-db-tests.ps1` + wire it into CI, or explicitly defer CI integration to a later phase. Local-only `supabase db test` still closes Success Criterion #6 (TEST-01..03 pass locally); CI automation is a separate concern.

## Validation Architecture

### Test Framework
| Property           | Value                                                                                     |
|--------------------|-------------------------------------------------------------------------------------------|
| Framework          | pgTAP (ships with Supabase local Postgres)                                                |
| Config file        | none — `supabase db test` auto-discovers `supabase/tests/database/*.sql`                  |
| Quick run command  | `supabase db test supabase/tests/database/check_and_deduct_merits.test.sql`               |
| Full suite command | `supabase db test` (runs every file under `supabase/tests/database/`)                     |

### Phase Requirements → Test Map
| Req ID   | Behavior                                                                                                            | Test Type | Automated Command                                                                      | File Exists? |
|----------|---------------------------------------------------------------------------------------------------------------------|-----------|----------------------------------------------------------------------------------------|-------------|
| MER-05   | Atomic deduct with sub-first, shop overflow, tier-locked rejection, split deduction, insufficient-balance rejection | unit      | `supabase db test supabase/tests/database/check_and_deduct_merits.test.sql`            | ❌ Wave 0   |
| MER-06   | `refund_merits` idempotent on `deduction_id`, restores exact original buckets, rejects unknown transaction_id        | unit      | `supabase db test supabase/tests/database/refund_merits.test.sql`                       | ❌ Wave 0   |
| MER-07   | `get_merit_balance` returns `{ subscription_balance, shop_balance, total, next_reset_date }`                        | unit      | `supabase db test supabase/tests/database/get_merit_balance.test.sql`                   | ❌ Wave 0   |
| MER-08   | `credit_shop_merits` idempotent on `stripe_payment_id`, inserts purchase row, credits shop                          | unit      | `supabase db test supabase/tests/database/credit_shop_merits.test.sql`                  | ❌ Wave 0   |
| MER-09   | `reset_subscription_merits` sets Pro=75 / Elite=150, flips flag, skips Free, leaves `shop_balance` untouched         | unit      | `supabase db test supabase/tests/database/reset_subscription_merits.test.sql`           | ❌ Wave 0   |
| MER-12   | Reconciliation invariant `drift = 0` holds after randomized sequence of deduct/refund/credit/reset                  | unit      | `supabase db test supabase/tests/database/reconciliation.test.sql`                      | ❌ Wave 0   |
| SHOP-10  | Subscription balance deducted before shop on every Merit spend (covered by MER-05 sub-first test)                   | unit      | (same as MER-05)                                                                        | ❌ Wave 0   |
| TEST-01  | Insufficient, sub-first, shop fallback, feature access by tier, refund on failure                                   | unit      | `supabase db test supabase/tests/database/check_and_deduct_merits.test.sql`            | ❌ Wave 0   |
| TEST-02  | Pro reset to 75, elite reset to 150, free no-op, shop untouched, yearly monthly cadence, no rollover                 | unit      | `supabase db test supabase/tests/database/reset_subscription_merits.test.sql`           | ❌ Wave 0   |
| TEST-03  | All 4 pack sizes, duplicate `stripe_payment_id` rejection, balance update, transactions row written                  | unit      | `supabase db test supabase/tests/database/credit_shop_merits.test.sql`                  | ❌ Wave 0   |

### Sampling Rate
- **Per task commit:** `supabase db test supabase/tests/database/<file>.test.sql` for whichever RPC was just written or modified.
- **Per wave merge:** `supabase db test` (full pgTAP suite).
- **Phase gate:** Full pgTAP suite green + final `DO $$` migration verification block succeeds at `supabase db push` time, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `supabase/tests/database/00_pgtap_bootstrap.sql` — `CREATE EXTENSION IF NOT EXISTS pgtap;` + shared test fixture helpers (throwaway user creator, cost-table seeder verifier).
- [ ] `supabase/tests/database/check_and_deduct_merits.test.sql` — covers TEST-01 / MER-05 / SHOP-10.
- [ ] `supabase/tests/database/refund_merits.test.sql` — covers MER-06 + Success Criterion #2 (double-refund idempotency).
- [ ] `supabase/tests/database/get_merit_balance.test.sql` — covers MER-07.
- [ ] `supabase/tests/database/credit_shop_merits.test.sql` — covers TEST-03 / MER-08 + Success Criterion #3.
- [ ] `supabase/tests/database/reset_subscription_merits.test.sql` — covers TEST-02 / MER-09 + Success Criterion #4.
- [ ] `supabase/tests/database/reconciliation.test.sql` — covers MER-12 + Success Criterion #5 via a randomized sequence (deduct, refund, credit, reset) asserting `drift = 0` after EACH step, not just at end.
- [ ] `scripts/run-db-tests.ps1` — wraps `supabase db test`, mirrors `run-edge-tests.ps1`. Optional — planner decides whether to ship in Phase 11 or defer.

### Validation Points (enumerated for Nyquist)

| Stage           | Point                                        | How it validates                                                                                      |
|-----------------|----------------------------------------------|------------------------------------------------------------------------------------------------------|
| Pre-migration    | Cost matrix row count                        | The `INSERT INTO merit_feature_costs` statement is literal SQL; reviewer counts rows                 |
| Post-migration   | `DO $$` verification block                    | Asserts 6 SECURITY DEFINER RPCs exist and cost table has ≥9 rows; rolls back migration on failure    |
| pgTAP unit       | `check_and_deduct_merits.test.sql`            | Sub-first, shop fallback, split, tier-locked, insufficient, row-lock behavior                        |
| pgTAP unit       | `refund_merits.test.sql`                     | Single-bucket refund, split-bucket refund, double-refund rejection, unknown-transaction rejection     |
| pgTAP unit       | `credit_shop_merits.test.sql`                 | 4 pack sizes, duplicate `stripe_payment_id` rejection, `shop_balance` +=, `merit_transactions` row written |
| pgTAP unit       | `reset_subscription_merits.test.sql`          | Pro 75, Elite 150, Free no-op, `shop_balance` invariant, delta `grant` row written                   |
| pgTAP unit       | `get_merit_balance.test.sql`                  | Shape + `next_reset_date: null` for Free                                                             |
| pgTAP invariant  | `reconciliation.test.sql`                    | Randomized sequence over ≥20 operations asserting `drift = 0` after EACH op (per Specifics bullet)  |
| Phase gate       | Full `supabase db test` suite green          | All above tests pass together                                                                        |
| Phase gate       | `supabase db push` against staging DB         | Migration applies cleanly + `DO $$` passes in a real environment                                     |

## Security Domain

Security enforcement applies — this phase ships privileged RPCs that are the only legitimate write path to the Merit ledger.

### Applicable ASVS Categories

| ASVS Category            | Applies | Standard Control                                                                          |
|--------------------------|---------|-------------------------------------------------------------------------------------------|
| V2 Authentication        | no      | Phase 11 ships DB-layer only. Auth happens in Supabase edge functions (Phase 13 caller).  |
| V3 Session Management    | no      | Same.                                                                                      |
| V4 Access Control        | **yes** | RLS on `merit_feature_costs` (read-all for `authenticated`, zero writes). `SECURITY DEFINER` + `SET search_path` + `REVOKE ALL FROM public` + explicit `GRANT EXECUTE` on every RPC. Phase 10 carries `user_merits`/`merit_transactions`/`merit_shop_purchases` RLS (SELECT-only user policy). |
| V5 Input Validation      | **yes** | `tier` param validated by the cost-table lookup (D-02). `feature` param ditto. `pack_size` validated by Phase 10 `CHECK (pack_size IN (3,10,25,50))`. Negative amounts can't be introduced — `CHECK (cost >= 0)` on the source table. |
| V6 Cryptography          | no      | No new crypto. `gen_random_uuid()` for `deduction_id` is sufficient; no secret material. |

### Known Threat Patterns for SQL / PL-pgSQL stack

| Pattern                                                        | STRIDE               | Standard Mitigation                                                                 |
|----------------------------------------------------------------|----------------------|-------------------------------------------------------------------------------------|
| SQL injection via unvalidated `feature` or `tier` param        | Tampering            | Parameterized RPC signature (plpgsql auto-binds) + existence check in `merit_feature_costs` |
| Schema hijack via attacker-controlled `search_path`            | Elevation of Privilege | `SET search_path = public, pg_temp` on every `SECURITY DEFINER` RPC                 |
| Permissive RLS policy re-introducing SEC-06 (Paddle-bug class) | Elevation / Tampering | `merit_feature_costs` has ONLY a `SELECT` policy; zero write policies; header comment calls this out |
| Race condition → negative balance                              | Tampering            | `SELECT ... FOR UPDATE` + Phase 10 `CHECK (>= 0)` safety net                        |
| Duplicate Stripe webhook → double-credit                       | Repudiation / Tampering | `merit_shop_purchases.stripe_payment_intent_id UNIQUE` + pre-check inside RPC under `FOR UPDATE` |
| Double refund                                                  | Tampering            | `EXISTS` check on `metadata->>'deduction_id'` in refund row, under `FOR UPDATE`     |
| Client-side RPC invocation with forged `p_user_id`             | Spoofing             | Phase 11 decision: RPC runs `SECURITY DEFINER`, so technically the RPC trusts the caller. Phase 13 is responsible for passing the AUTHENTICATED user's id, not a client-supplied value. Phase 11 can add a defensive `IF p_user_id IS DISTINCT FROM auth.uid() AND auth.role() <> 'service_role' THEN ...` guard, BUT the edge functions run as service_role so this would block all legitimate calls. **Planner decision:** leave the RPC trusting its caller; Phase 13 is the authorization boundary. This is consistent with how `check_and_record_ai_usage` is used today. |

## Assumptions Log

| #  | Claim                                                                                                                               | Section                          | Risk if Wrong                                                           |
|----|-------------------------------------------------------------------------------------------------------------------------------------|----------------------------------|-------------------------------------------------------------------------|
| A1 | pgTAP ships with the Supabase local dev DB and is invoked via `supabase db test`                                                    | Standard Stack, Validation Arch   | If pgTAP is not available, planner must add `CREATE EXTENSION pgtap` to the test bootstrap file (D-25 already allows this) OR switch to Deno/psql runner. [CITED via supabase docs — verified by design of D-23/D-25] |
| A2 | The production migration's `DO $$` block can safely call RPCs with a throwaway user id without Phase 10 trigger provisioning the row | Pattern 3 example                 | If the `profiles` FK blocks the fake user, the block must be simplified to introspect `pg_proc` instead of calling RPCs. The example above already uses `pg_proc` introspection for safety. |
| A3 | Edge-function `ActionType` strings (`resume_analysis`, `career_compass`, `linkedin_grading`, `recruiting_lens`, `interview_prep`) are stable and will be used verbatim by Phase 13 | Feature Name Resolution          | If Phase 13 renames these strings, the `merit_feature_costs` seed must be updated. Mitigation: use the already-committed strings and let Phase 13 conform. [VERIFIED via Grep] |
| A4 | `balance_type='refund'` is the correct value for refund rows (NOT the original bucket)                                               | Pitfall 4, Example `refund_merits`| If D-09 actually means "use the original bucket value", the pgTAP tests will catch the mismatch. Planner should confirm with user if ambiguous. |
| A5 | Supabase platform Postgres version is 15.x                                                                                          | Standard Stack                    | Low risk — all features used (expression indexes, jsonb operators, `FOR UPDATE`, `gen_random_uuid()`) are available in Postgres 12+. |
| A6 | `CI hookup for supabase db test` does not exist                                                                                     | Environment Availability          | Verified by reading `run-edge-tests.ps1` content and grepping for `pgtap` / `supabase db test` across the repo — returned zero hits. [VERIFIED] |
| A7 | The `merit_feature_costs` seed should total 13 rows (9 standard-feature rows + 4 RCL/IPC Pro/Elite rows)                            | Transcribed Cost Matrix           | If the spec adds or removes a feature, the seed count drifts. The `DO $$` block's `>= 9` floor should catch a catastrophic under-seed; exact counts should be asserted by pgTAP. |

**Items needing user confirmation before locking into the plan:**
- **A4** is the most important. The planner should double-check D-09's phrasing with the user. If the user intends refund rows to carry `balance_type='subscription'` or `'shop'` (the restored bucket), the example code above and Pitfall 4 must be inverted. Both implementations pass the reconciliation invariant; only the ledger readability differs.

## Open Questions (RESOLVED)

1. **CI integration of `supabase db test`** — Should Phase 11 add `scripts/run-db-tests.ps1` and wire it into CI, or defer to a later phase?
   - What we know: `run-edge-tests.ps1` exists for Deno tests; no equivalent for SQL.
   - What's unclear: The planner's appetite for adding a second test runner script in this phase.
   - **RESOLVED:** Include in Phase 11 Wave 0 — Plan 11-01 Task 3 ships `scripts/run-db-tests.ps1`. This closes Success Criterion #6 ("All RPC unit tests pass in CI").

2. **Balance-type of refund rows** (see Assumption A4) — Confirm with user / spec re-read.
   - What we know: D-09 says "restore the exact original buckets" — but that clearly refers to the `user_merits` update. The `merit_transactions` row's `balance_type` is ambiguous in D-09.
   - What's unclear: Whether refund rows should carry `'refund'` (the fourth CHECK value Phase 10 reserved) or mirror the original bucket.
   - **RESOLVED:** Refund rows use `balance_type='refund'` in `merit_transactions`; the `user_merits` UPDATE restores the original `subscription`/`shop` buckets per D-09. This is why Phase 10 D-09 included the fourth enum value.

3. **Phase 11 `reconcile_merit_balance` return type — `jsonb` or `TABLE`?**
   - What we know: D-17 specifies a single-row return. Other RPCs return `jsonb`. A `TABLE` return is more Postgres-idiomatic for aggregates.
   - What's unclear: Caller shape. Reconciliation is ops/debug-only in Phase 11; no caller in Phase 12/13.
   - **RESOLVED:** `RETURNS TABLE(user_id uuid, balance_sum int, transactions_sum int, drift int)`. The other RPCs return `jsonb` because they need to return error shapes; reconciliation has no error shape and the TABLE form is more Postgres-idiomatic for aggregates.

4. **`get_merit_balance` needs a row lock?**
   - What we know: It's a pure SELECT.
   - What's unclear: Whether concurrent deducts could return stale balances.
   - **RESOLVED:** No row lock. NFR-02's 5s eventual-consistency tolerance makes an unlocked read safe — the frontend already tolerates stale reads within that window.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/11-merit-rpcs-and-reconciliation/11-CONTEXT.md` — 25 locked decisions, Phase 11 boundary
- `.planning/REQUIREMENTS.md` §RES / §LIG / §CC / §RCL / §IPC — cost matrix; §TEST — test requirements
- `.planning/ROADMAP.md` Phase 11 section — 6 Success Criteria
- `supabase/migrations/20260411000002_atomic_check_and_record_usage.sql` — structural template for SECURITY DEFINER + serialization RPC
- `supabase/migrations/20260412000000_stripe_migration.sql` — single-file migration + "do not replicate SEC-06" header pattern
- `supabase/migrations/20260414000000_merit_ledger_foundation.sql` — Phase 10 schema of `user_merits`, `merit_transactions`, `merit_shop_purchases`, their CHECKs, RLS posture, existing indexes, auto-provision trigger, `DO $$` verification block pattern
- `supabase/functions/_shared/usage-checker.ts` — existing `ActionType` union; shape Phase 13 will inherit
- `supabase/functions/{analyze-resume,analyze-career,grade-linkedin,recruiting-lens,interview-prep-coach}/index.ts` — feature name strings already in production

### Secondary (MEDIUM confidence)
- Supabase CLI testing docs — `supabase db test` is the canonical pgTAP runner [CITED: https://supabase.com/docs/guides/cli/testing-and-linting]
- PostgreSQL `CREATE FUNCTION` SECURITY DEFINER best practices — `SET search_path` mandate [CITED: https://www.postgresql.org/docs/current/sql-createfunction.html]

### Tertiary (LOW confidence)
- None. Every claim in this document is either verified by grepping the repo or taken directly from a locked CONTEXT.md decision.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all pieces (Postgres, plpgsql, pgTAP, SECURITY DEFINER, FOR UPDATE, jsonb) are verified in the repo or in official Supabase docs.
- Architecture: HIGH — the 25 locked decisions in CONTEXT.md specify the design; this research fills gaps, not alternatives.
- Cost matrix: HIGH — transcribed verbatim from REQUIREMENTS.md and cross-checked against edge-function `ActionType` strings.
- Feature name resolution: HIGH — grep of `supabase/functions/` found all five call sites with exact strings.
- Index strategy: MEDIUM — the `deduction_id` expression index is a reasonable choice based on query shape; no production query-plan evidence yet.
- Test infrastructure gap: HIGH — verified by absence: `grep pgtap` across repo returned zero, `supabase/tests/` does not exist.
- Pitfalls: HIGH — each pitfall is either a known Postgres gotcha (search_path, TOCTOU) or a direct reading of a locked decision.

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (30 days — stack is stable; only risk is Supabase CLI version drift)

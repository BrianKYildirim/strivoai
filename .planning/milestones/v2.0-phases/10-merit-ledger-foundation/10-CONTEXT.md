# Phase 10: merit-ledger-foundation - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship the Merit currency database layer: three new tables (`user_merits`, `merit_transactions`, `merit_shop_purchases`), RLS that blocks all direct user writes, CHECK constraints preventing negative balances, an auto-provisioning trigger on `profiles` INSERT, and a one-shot backfill that seeds every existing profile with `subscription_balance = 5`, `shop_balance = 0`, `lifetime_granted = 5`. Closes MER-01..04, MER-10, MER-13, MER-14, MIG-01, MIG-04.

**Out of scope for this phase:**

* All RPCs (`check_and_deduct_merits`, `refund_merits`, `get_merit_balance`, `credit_shop_merits`, `reset_subscription_merits`) — Phase 11
* Stripe products, webhook, checkout — Phase 12
* Edge function enforcement / `MERIT_SYSTEM_ENABLED` flag — Phase 13
* Any frontend work, tier prompts, UI primitives
* Removing or modifying legacy `usage_tracking` / `credit_usage` / `ai_usage` (kept read-only per MIG-04)

</domain>

<decisions>
## Implementation Decisions

### Free Tier Semantics

* **D-01:** `user_merits.subscription_reset_date` is **nullable**, and is **NULL for Free users**. NULL = "no reset cycle". Phase 11's `reset_subscription_merits` RPC will check tier and skip Free users. `get_merit_balance` returns `next_reset_date: null` for Free; frontend renders accordingly.
* **D-02:** When a Free user upgrades (Phase 12 Stripe webhook), the lifetime 5 Merits stay in `subscription_balance` and are overwritten by the first Pro reset (75) or Elite reset (150). Lifetime grant is honored only "while you were Free." Phase 10 simply ensures the schema supports this — no upgrade-path code lives in this phase.
* **D-03:** `lifetime_granted` is **immutable after the initial seed**. No RPC in Phase 11 should ever update it. It exists for analytics and audit, not as a running counter.
* **D-04:** Do **not** add a `lifetime_used` / `lifetime_remaining` column. `merit_transactions` is the source of truth; reconciliation can compute it on demand. Keeps `user_merits` minimal and avoids drift between two stores.

### Auto-Provisioning of New Signups

* **D-05:** `AFTER INSERT` trigger on `public.profiles` auto-creates a matching `user_merits` row for every new signup with `subscription_balance = 5`, `shop_balance = 0`, `lifetime_granted = 5`, `subscription_reset_date = NULL`, `free_linkedin_scan_used = false`. Hooks `public.profiles`, **not** `auth.users`, mirroring the existing `handle_new_user` pattern.
* **D-06:** Trigger uses `INSERT ... ON CONFLICT (user_id) DO NOTHING`. Idempotent and re-run-safe. Never overwrites existing balances on re-fire.
* **D-07:** Trigger is `SECURITY DEFINER`, owned by `postgres`, so it can write to `user_merits` despite RLS denying all direct user writes (per MER-04). Same security model the repo already uses for `handle_new_user`.
* **D-08:** Trigger ALSO inserts a corresponding row into `merit_transactions` with `amount = 5`, `balance_type = 'grant'`, `source = 'signup-grant'`, `feature = NULL`. This keeps the MER-12 reconciliation invariant (`subscription_balance + shop_balance == SUM(merit_transactions.amount)`) true for every user from row-zero.

### Enum & Type Strategy

* **D-09:** `merit_transactions.balance_type` is **`text NOT NULL`** **+** **`CHECK (balance_type IN ('subscription','shop','grant','refund'))`**. No Postgres `CREATE TYPE` enum. Rationale: consistent with existing tables in the repo (e.g. `analysis_jobs.status`), and `ALTER TYPE ... ADD VALUE` has known transactional gotchas that make schema evolution painful.
* **D-10:** `merit_shop_purchases.status` is **`text NOT NULL`** **+** **`CHECK (status IN ('pending','succeeded','failed','refunded'))`**. Same rationale as D-09.
* **D-11:** `merit_shop_purchases.pack_size` is **`integer NOT NULL`** **+** **`CHECK (pack_size IN (3, 10, 25, 50))`**. Locks the column to the four spec'd packs. Adding a new pack is a one-line `ALTER TABLE` migration. Catches webhook bugs that try to credit an off-spec quantity.
* **D-12:** `merit_transactions.amount` is a **signed integer**: negative for deductions, positive for grants/refunds/shop credits. Reconciliation = `SUM(amount) WHERE user_id = X`. A refund row is a positive `amount` referencing the original deduction's `transaction_id` via `metadata.refund_of`.

### Migration Layout & Backfill Safety

* **D-13:** **Single migration file** containing: table DDL → RLS enable (no permissive policies) → CHECK constraints → indexes → `auto_provision_user_merits` trigger function + trigger → backfill `INSERT ... SELECT FROM profiles ON CONFLICT (user_id) DO NOTHING` → backfill grant rows into `merit_transactions` → final verification block. Atomic deploy. Mirrors the Phase 07 single-file style (`20260412000000_stripe_migration.sql`).
* **D-14:** Trigger is created **before** the backfill `INSERT...SELECT` runs. Any user who signs up between the trigger creation and the end of the backfill gets their row from the trigger; the backfill's `ON CONFLICT DO NOTHING` skips them. **No deploy freeze, no** **`LOCK TABLE`** — the race window is closed by ordering.
* **D-15:** Backfill writes a `grant` row into `merit_transactions` for every existing profile, with `source = 'phase-10-backfill'` so the rows are traceable and distinguishable from new-signup grants (`source = 'signup-grant'`). This makes the MER-12 reconciliation invariant true for the entire user base from day zero, not just future signups.
* **D-16:** Migration ends with a `DO $$ BEGIN ... RAISE EXCEPTION ... END $$` block that asserts `(SELECT COUNT(*) FROM public.profiles) = (SELECT COUNT(*) FROM public.user_merits)`. If the assertion fails, the entire transaction rolls back and Success Criterion #4 is enforced at deploy time, not by post-deploy runbook.

### RLS (Carries Forward from Phase 07 D-06 / SEC-06)

* **D-17:** `user_merits`, `merit_transactions`, `merit_shop_purchases` all have `ENABLE ROW LEVEL SECURITY` with **at most a single** **`SELECT`** **policy per table** restricting reads to `auth.uid() = user_id`. **Zero** **`INSERT`/`UPDATE`/`DELETE`** **policies.** Service role bypasses RLS automatically — that is the only legitimate write path. Do NOT replicate the SEC-06 Paddle bug where a `USING (true)` policy was added.

### Claude's Discretion (Planner / Researcher decides)

* Exact column types and precision (e.g. `bigint` vs `integer` for balances and amounts — likely `integer` is fine, balances will not exceed millions; planner verifies).
* Index set on `merit_transactions` (almost certainly `(user_id, created_at DESC)` plus a partial index on `metadata->>'refund_of'` for refund lookups; planner confirms).
* `ON DELETE` behavior of the `user_id` FKs (likely `CASCADE` to match the rest of the schema; planner verifies against `profiles` FK conventions).
* Whether to wrap the backfill grant `INSERT` into a single `INSERT ... SELECT` or a `WITH inserted AS (...)` CTE for readability.
* Migration filename / timestamp (use `YYYYMMDDHHMMSS_` convention consistent with `20260412000000_stripe_migration.sql`).
* Whether trigger fires on `INSERT` only or also handles edge cases like `UPDATE` of `user_id` (vanishingly unlikely; INSERT-only is fine).

</decisions>

\<canonical\_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec (Source of Truth)

* `APIcontextdocuments/STRIVO_GSD_Milestone_Merit_System.docx` §2.2, §2.5, §2.6, §6, §9.2, §9.5, §10 — Merit currency model, table shapes, RLS posture, migration strategy.

### Requirements

* `.planning/REQUIREMENTS.md` — MER-01, MER-02, MER-03, MER-04, MER-10, MER-13, MER-14, MIG-01, MIG-04 (the 9 REQ-IDs Phase 10 closes).
* `.planning/ROADMAP.md` §"Phase 10: merit-ledger-foundation" — the five Success Criteria that VERIFICATION.md must prove TRUE.

### Existing Migrations (Pattern to Follow)

* `supabase/migrations/20260412000000_stripe_migration.sql` — single-file migration style, additive DDL, RLS enable with NO permissive policies, the SEC-06 anti-pattern explicitly called out and avoided. Phase 10 should match this structure.
* `supabase/migrations/20251113100645_eb5d1704-66ae-4c1a-ad99-05bf7363585f.sql` — original `profiles` table; informs FK target type and `ON DELETE` conventions.
* `supabase/migrations/20251222220418_b52662bb-5e0f-4847-bc53-d848d159e2c2.sql` — original `usage_tracking` table; the legacy ledger that MIG-04 keeps read-only (Phase 10 must NOT touch this table).
* Whichever migration creates `handle_new_user` — the existing `SECURITY DEFINER` trigger on profile/auth that the new `auto_provision_user_merits` trigger should mirror in posture.

### Prior Phase Context

* `.planning/phases/07-stripe-migration-backend/07-CONTEXT.md` D-06 — RLS service-role-only pattern, SEC-06 anti-pattern. Carries forward unchanged.

\</canonical\_refs>

\<code\_context>

## Existing Code Insights

### Reusable Assets

* **Migration file convention** — `YYYYMMDDHHMMSS_short_name.sql` under `supabase/migrations/`. New file should follow.
* **`handle_new_user`** **trigger pattern** — already in the schema; `auto_provision_user_merits` should be a structural copy with different INSERT targets.
* **`profiles.id`** **as the FK target** — every per-user table in this repo joins on `profiles.id` (which equals `auth.users.id`); Phase 10 tables follow the same convention.

### Established Patterns

* **Additive migrations only** — never drop/rename existing columns in a feature migration. Phase 10 is purely additive.
* **`text`** **over** **`varchar`** — established in Phase 07; same here.
* **RLS enabled, zero permissive policies on write** — Phase 07 D-06; Phase 10 inherits.
* **CHECK constraints inline in** **`CREATE TABLE`** — repo prefers inline over named external constraints unless the constraint needs to be re-checked later.

### Integration Points

* The Phase 11 RPCs will assume `user_merits` row exists for any authenticated user — D-05's trigger guarantees this.
* The Phase 12 Stripe webhook will read `subscription_reset_date` to decide whether a Pro/Elite user is mid-cycle — D-01's NULL convention means Free users never trip that code path.
* The MER-12 reconciliation query (Phase 11) will rely on the grant rows D-08 / D-15 write — without them, the invariant is unprovable for pre-existing users.

\</code\_context>

<specifics>
## Specific Ideas

* The Phase 07 stripe migration file is the structural template. Open it in a split pane while writing `10-merit-ledger-foundation.sql`.
* The verification `DO` block at the end of the migration is non-negotiable — it's how Success Criterion #4 stops being a manual checklist item and becomes a deploy-time guarantee.
* The grant-row pattern (D-08, D-15) is the load-bearing decision for Phase 11's reconciliation tests. Don't drop it for "simplicity" later.

</specifics>

<deferred>
## Deferred Ideas

* Any RPC implementation (`check_and_deduct_merits`, `refund_merits`, etc.) — **Phase 11**.
* Removing or migrating off `usage_tracking` / `credit_usage` / `ai_usage` — out of scope for v2.0 entirely; MIG-04 explicitly retains them read-only.
* Admin-facing Merit grant tooling — not in v2.0 scope; if needed, a new phase.
* Index tuning beyond the obvious `(user_id, created_at DESC)` — defer to a perf phase if reconciliation queries become slow.

</deferred>

***

*Phase: 10-merit-ledger-foundation*
*Context gathered: 2026-04-14*

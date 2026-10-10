# Phase 11: merit-rpcs-and-reconciliation - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship the atomic `SECURITY DEFINER` RPCs that are the only legitimate write path to Merit balances, plus the `merit_feature_costs` lookup table that backs them, plus a per-user reconciliation RPC, plus full pgTAP unit test coverage for TEST-01..03.

**In scope (closes MER-05, MER-06, MER-07, MER-08, MER-09, MER-12, SHOP-10, TEST-01, TEST-02, TEST-03):**

* New table `merit_feature_costs (feature text, tier text, cost int)` with PK `(feature, tier)`, CHECKs, and a read-all RLS SELECT policy. Seeded with every (feature, tier) pair from REQUIREMENTS.md §RES/LIG/CC/RCL/IPC.
* RPC `check_and_deduct_merits(user_id, feature, tier)` — atomic, row-locked via `SELECT ... FOR UPDATE`, tier-gated via the cost table, deducts subscription first and overflows to shop, writes one or two `merit_transactions` rows sharing a `deduction_id`, returns `{ success, remaining_balance, deducted_from }` or `{ error, upgrade_required }`.
* RPC `refund_merits(user_id, transaction_id)` — idempotent reversal of a deduction by `deduction_id`, restores the exact buckets the original rows were pulled from, writes mirroring refund rows.
* RPC `get_merit_balance(user_id)` — returns `{ subscription_balance, shop_balance, total, next_reset_date }`.
* RPC `credit_shop_merits(user_id, pack_size, stripe_payment_id)` — idempotent on `stripe_payment_id`, credits `shop_balance`, inserts a `merit_shop_purchases` row and a `merit_transactions` row.
* RPC `reset_subscription_merits(user_id, tier)` — dumb setter: overwrites `subscription_balance` to 75 (Pro) / 150 (Elite), flips `free_linkedin_scan_used = false`, advances `subscription_reset_date` using the value the caller provides. Skips Free users (tier='free' → no-op, matches Phase 10 D-01).
* RPC `reconcile_merit_balance(user_id)` — returns `{ user_id, balance_sum, transactions_sum, drift }`. `drift = 0` is the MER-12 invariant.
* pgTAP unit tests in `supabase/tests/database/` covering TEST-01..03 + reconciliation invariant + refund idempotency.

**Out of scope for this phase:**

* Any edge function call sites — Phase 13 wires `check-and-deduct-merits` into `analyze-resume`, `analyze-career`, etc.
* Stripe webhook, checkout, products — Phase 12 owns `credit_shop_merits` invocation and `reset_subscription_merits` scheduling.
* `MERIT_SYSTEM_ENABLED` feature flag — Phase 13.
* Frontend Merit UI, cost previews, balance badges — later phase.
* LIG-05 free-monthly-scan policy — lives in the `linkedin-grader` edge function caller, NOT in `check_and_deduct_merits` (see D-07).
* Admin grant tooling, negative-balance repair scripts, bulk credit adjustments.

</domain>

<decisions>
## Implementation Decisions

### Cost Mapping & Tier Gating

* **D-01:** Feature costs live in a new `merit_feature_costs (feature text NOT NULL, tier text NOT NULL, cost int NOT NULL CHECK (cost >= 0), PRIMARY KEY (feature, tier))` table, created in Phase 11's migration. `CHECK (tier IN ('free','pro','elite'))`. RLS enabled with a single read-all `SELECT` policy for `authenticated`, zero write policies (service role only). Seeded in the same migration from the cost matrix in REQUIREMENTS.md §RES/LIG/CC/RCL/IPC.
* **D-02:** The cost table is the single source of truth for BOTH cost AND tier access. Locked `(feature, tier)` combinations (e.g. `('recruiting_lens','free')`, `('interview_prep','free')`) have **no row**. `check_and_deduct_merits` treats a missing row as `tier_locked` and returns `{ error: 'tier_locked', upgrade_required: true }` **before** any balance check or row lock — the RPC never deducts on a locked feature, even if the caller is buggy.
* **D-03:** Frontend reads `merit_feature_costs` directly via the read-all SELECT policy to power UX-02 cost previews. No separate `get_feature_costs()` RPC is needed.
* **D-04:** The cost table schema stays minimal — no `active` flag, no `updated_at`, no soft-delete. If a cost needs to change, ship a one-line `UPDATE` migration. Avoids adding a third RLS-adjacent invariant to the Phase 11 surface area.

### check_and_deduct_merits Semantics

* **D-05:** Flow: (1) look up cost in `merit_feature_costs`; if row missing → return `tier_locked` error, no side effects. (2) `SELECT ... FOR UPDATE` on the user's `user_merits` row. (3) if `subscription_balance + shop_balance < cost` → return `{ error: 'insufficient_merits', upgrade_required: true }`. (4) compute the split: take min(subscription_balance, cost) from subscription, remainder from shop. (5) write one or two `merit_transactions` rows (see D-06). (6) update `user_merits`. Return `{ success: true, remaining_balance, deducted_from }`.
* **D-06:** Split deductions write **two separate `merit_transactions` rows** sharing a `metadata->>'deduction_id'` UUID. Row A: `balance_type='subscription', amount=-N`. Row B: `balance_type='shop', amount=-M`. Single-bucket deductions write one row. `deduction_id` is generated by the RPC and returned to the caller as the `transaction_id` in the response (this is the handle `refund_merits` accepts).
* **D-07:** `check_and_deduct_merits` is **dumb about LIG-05**. The RPC knows nothing about the free-monthly-LinkedIn-scan rule. The `linkedin-grader` edge function (Phase 13) is responsible for: reading `free_linkedin_scan_used`, skipping the RPC call when the flag is false for Pro/Elite users, flipping the flag via a small dedicated helper, and only invoking `check_and_deduct_merits` when the user is actually spending merits. Keeps feature-specific policy out of the generic deduct RPC.

### refund_merits Semantics

* **D-08:** `refund_merits(user_id, transaction_id)` treats `transaction_id` as the `deduction_id` UUID from D-06. It looks up all `merit_transactions` rows with that `deduction_id`. If zero rows → `{ error: 'unknown_transaction' }`. If any row already has a matching refund row (via `metadata->>'refund_of'`) → `{ error: 'already_refunded' }` and the RPC is a no-op (idempotency guarantee for Success Criterion #2).
* **D-09:** Refunds restore the **exact original buckets**. For each original deduction row, insert a mirroring refund row with `balance_type` = original bucket, `amount` = positive of original, `metadata.refund_of = <original row id>`. Update `user_merits.subscription_balance` and `user_merits.shop_balance` by the same per-bucket amounts. A split deduction of 2 sub + 1 shop refunds as exactly 2 sub + 1 shop — never 3 to one bucket.
* **D-10:** **No time window on refunds.** Any non-refunded deduction is refundable at any age. Idempotency is enforced by the `refund_of` check in D-08, not by a clock. This matches TEST-07 (AI failure refund immediately) and leaves admin corrections unblocked.

### credit_shop_merits Semantics

* **D-11:** Idempotency key is `stripe_payment_id`. Flow: (1) `SELECT ... FOR UPDATE` on `user_merits`. (2) check `merit_shop_purchases` for existing row with this `stripe_payment_id`; if found → return the prior result, no-op. (3) insert `merit_shop_purchases` row with `status='succeeded'`. (4) credit `shop_balance += pack_size`. (5) insert `merit_transactions` row `balance_type='shop', amount=+pack_size, metadata.stripe_payment_id=<id>`. Closes Success Criterion #3.
* **D-12:** `pack_size` is validated against the Phase 10 CHECK (`3, 10, 25, 50`). The RPC does not re-validate beyond trusting the column constraint — if a caller tries to insert `pack_size = 7`, the insert raises and the whole RPC rolls back.

### reset_subscription_merits Semantics

* **D-13:** Dumb setter. Signature: `reset_subscription_merits(user_id uuid, tier text, next_reset_date timestamptz)`. Called by Phase 12's Stripe webhook (or a pg_cron job Phase 12 owns) whenever billing decides a reset is due. The RPC does not verify `now() >= subscription_reset_date`; the caller is trusted to know when billing says it's time. Rationale: TEST-02 (yearly monthly cadence, no rollover) is easier to test when the caller supplies simulated reset dates, and the billing truth lives in Phase 12 anyway.
* **D-14:** Tier branching:
  * `tier='pro'` → `subscription_balance = 75`, `free_linkedin_scan_used = false`, `subscription_reset_date = <param>`.
  * `tier='elite'` → `subscription_balance = 150`, `free_linkedin_scan_used = false`, `subscription_reset_date = <param>`.
  * `tier='free'` → **no-op**. Free users have `subscription_reset_date = NULL` per Phase 10 D-01 and the lifetime 5 Merits must never be re-granted by this path.
* **D-15:** `shop_balance` is **never** touched by reset. The write is `UPDATE user_merits SET subscription_balance = <N>, free_linkedin_scan_used = false, subscription_reset_date = <param> WHERE user_id = <id>`. `shop_balance` stays put, carrying forward indefinitely. Closes Success Criterion #4.
* **D-16:** Reset writes a `merit_transactions` row: `balance_type='grant'`, `amount = <new_balance> - <old_balance>`. If the old balance was 12 and the new is 75, the row records `+63`. If old was 80 (shouldn't happen, but defensively), the row records `-5`. This keeps the MER-12 reconciliation invariant true across resets without any special-casing in `reconcile_merit_balance`. `source = 'subscription-reset'`.

### Reconciliation

* **D-17:** `reconcile_merit_balance(user_id uuid)` is a `SECURITY DEFINER` RPC that returns a single row: `(user_id, balance_sum int, transactions_sum int, drift int)` where `balance_sum = subscription_balance + shop_balance`, `transactions_sum = SUM(amount)` from `merit_transactions`, and `drift = balance_sum - transactions_sum`. Invariant is `drift = 0` (Success Criterion #5).
* **D-18:** No `merit_reconciliation` VIEW in Phase 11. The per-user RPC is the only surface. If a future ops need wants "show me every drifting user," it's a one-off SQL query against `user_merits` + a group-by on `merit_transactions` — not worth a view now.

### Concurrency & Locking

* **D-19:** Every RPC that mutates `user_merits` starts with `SELECT ... FROM user_merits WHERE user_id = <id> FOR UPDATE`. This serializes concurrent deduct/credit/reset for the same user. Different users do not contend. The lock is released at transaction end (all RPCs are single-statement transactions implicitly).
* **D-20:** `user_merits.subscription_balance >= 0` and `user_merits.shop_balance >= 0` CHECK constraints from Phase 10 are the final negative-balance guard (MER-13). If an RPC ever tries to deduct more than available, the CHECK raises, the transaction rolls back, and the caller gets an error. The pre-check in D-05 is the happy-path branch; the CHECK is the safety net.

### Migration Layout

* **D-21:** Single migration file `supabase/migrations/YYYYMMDDHHMMSS_merit_rpcs.sql` containing: `merit_feature_costs` DDL + RLS + seed → all six RPC definitions (`check_and_deduct_merits`, `refund_merits`, `get_merit_balance`, `credit_shop_merits`, `reset_subscription_merits`, `reconcile_merit_balance`) → final `DO $$` verification block that calls each RPC once with a throwaway user and asserts no errors. Mirrors Phase 10 D-13 style.
* **D-22:** All RPCs are `SECURITY DEFINER`, owner `postgres`, `SET search_path = public, pg_temp`. `REVOKE ALL ... FROM public` then `GRANT EXECUTE ... TO authenticated, service_role`. Matches the security posture Phase 10 D-07 established for the `auto_provision_user_merits` trigger.

### Testing

* **D-23:** pgTAP in `supabase/tests/database/`. One `.sql` file per RPC: `check_and_deduct_merits.test.sql`, `refund_merits.test.sql`, `credit_shop_merits.test.sql`, `reset_subscription_merits.test.sql`, plus `reconciliation.test.sql`. CI runs `supabase db test` against a local ephemeral DB seeded with the Phase 10 + Phase 11 migrations.
* **D-24:** Test coverage must include, at minimum: TEST-01 (insufficient balance, subscription-first deduction, shop fallback, split deduction, tier-locked rejection, refund path); TEST-02 (pro reset to 75, elite reset to 150, free no-op, shop_balance untouched, yearly monthly cadence via caller-supplied dates, no rollover); TEST-03 (all 4 pack sizes, duplicate `stripe_payment_id` rejection, balance update, `merit_transactions` row written). Plus: Success Criterion #2 (double refund idempotency), Success Criterion #5 (reconciliation `drift = 0` after a random sequence of deduct/refund/credit/reset).
* **D-25:** pgTAP extension is created in the test DB only (`CREATE EXTENSION IF NOT EXISTS pgtap`) — NOT in the production migration. Test files live outside `supabase/migrations/` so they never ship to staging/prod.

### Claude's Discretion (Planner / Researcher decides)

* Exact feature name strings for the `feature` column (`resume_analysis` vs `analyze_resume` etc.) — planner checks what the edge function names imply and picks the form that will match Phase 13's call sites.
* Exact JSON return shapes of each RPC — spec gives the fields; planner picks `jsonb` vs `record` return type and column order.
* Seed values for `merit_feature_costs` — derived directly from REQUIREMENTS.md §RES/LIG/CC/RCL/IPC, planner transcribes the full matrix.
* Whether `reconcile_merit_balance` also emits `(expected, actual)` or just `drift` — both are fine; planner picks for readability.
* Index set on `merit_transactions` for the `deduction_id` and `refund_of` lookups — planner picks the right partial or GIN index on the `metadata` jsonb based on query shape.
* Whether `check_and_deduct_merits` returns the `deduction_id` in a dedicated field or inside `deducted_from` — planner picks one consistent shape and documents it.
* Naming of the helper RPC that flips `free_linkedin_scan_used` (if one is needed at all in Phase 11 — it might be Phase 13's concern entirely).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec (Source of Truth)

* `APIcontextdocuments/STRIVO_GSD_Milestone_Merit_System.docx` §2.4, §2.6, §4 (all feature subsections for costs), §5.2, §5.3, §6, §9.2, §9.5, §11.1 — RPC contracts, split-deduction semantics, refund idempotency, Stripe credit flow, reset cadence, reconciliation, TEST-01..03 coverage.

### Requirements

* `.planning/REQUIREMENTS.md` — MER-05, MER-06, MER-07, MER-08, MER-09, MER-12, MER-13, SHOP-10, TEST-01, TEST-02, TEST-03. Also §RES-01..06, §LIG-01..07, §CC-01..05, §RCL-01..06, §IPC-01..02 for the cost matrix that seeds `merit_feature_costs`.
* `.planning/ROADMAP.md` §"Phase 11: merit-rpcs-and-reconciliation" — the six Success Criteria.

### Prior Phase Context

* `.planning/phases/10-merit-ledger-foundation/10-CONTEXT.md` — D-01 (Free users have NULL `subscription_reset_date`; `reset_subscription_merits` skips Free), D-05..D-08 (auto-provision trigger guarantees every authenticated user has a `user_merits` row, so Phase 11 RPCs never need defensive row-creation), D-09..D-12 (`balance_type` allowed values, `amount` sign convention, `pack_size` CHECK, `status` CHECK), D-17 (RLS: service role is the only write path; RPCs must be SECURITY DEFINER).

### Existing Patterns to Follow

* `supabase/migrations/20260411000002_atomic_check_and_record_usage.sql` — the closest existing analog: atomic SECURITY DEFINER RPC with row-level locking for usage enforcement. Phase 11 RPCs should match its structural style (`SECURITY DEFINER`, `SET search_path`, explicit `REVOKE` + `GRANT`, `FOR UPDATE` locking).
* `supabase/migrations/20260412000000_stripe_migration.sql` — single-file migration pattern with final verification `DO $$` block (Phase 10 D-13 inherits from this).
* `supabase/functions/_shared/usage-checker.ts` — how the current system's deduct-RPC equivalent is invoked from edge functions; informs the shape Phase 13 will want from `check_and_deduct_merits`.

### Testing Infrastructure

* `supabase/tests/database/` — directory to be created by Phase 11. Files consumed by `supabase db test`.
* `supabase/functions/_shared/*.test.ts` + `scripts/run-edge-tests.ps1` — existing Deno test runner, NOT used for Phase 11 (pgTAP chosen instead per D-23), but referenced so planner knows the pre-existing boundary between SQL tests and function tests.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

* **`atomic_check_and_record_usage`** (`20260411000002_atomic_check_and_record_usage.sql`) — structural template for a SECURITY DEFINER row-locked RPC. Phase 11's `check_and_deduct_merits` should mirror its concurrency posture (`FOR UPDATE`, explicit grants, `SET search_path`).
* **Phase 10's `auto_provision_user_merits` trigger** — guarantees every authenticated user has a `user_merits` row before any Phase 11 RPC is called. No RPC needs defensive `INSERT ... ON CONFLICT` on `user_merits`; the row is always present.
* **`merit_transactions` append-only ledger** — already has `balance_type` text+CHECK ('subscription','shop','grant','refund') and signed `amount` from Phase 10 D-09/D-12. Split deductions (D-06), refund mirrors (D-09), shop credits (D-11), and reset deltas (D-16) all fit cleanly into the existing column set via the `metadata` jsonb.
* **`merit_shop_purchases.stripe_payment_intent_id`** — already the intended idempotency key for Phase 12; Phase 11's `credit_shop_merits` uses it but does not own it.

### Established Patterns

* **Additive migrations only** — Phase 11 adds one table, six functions, and a set of grants. No DROP, no ALTER, no rename.
* **`text` + inline CHECK over enums** — Phase 10 D-09/D-10 established this; `merit_feature_costs.tier` follows.
* **Single-file migration with final `DO $$` verification** — Phase 10 D-13 / Phase 07 stripe migration. Phase 11 matches.
* **Service-role-only writes, read-all SELECT where the frontend needs it** — Phase 10 D-17 for RLS, with `merit_feature_costs` being the one table in Phase 11 that needs a permissive SELECT for UX-02.

### Integration Points

* **Phase 12 Stripe webhook** will call `credit_shop_merits` (shop pack purchase) and `reset_subscription_merits` (subscription cycle tick). Phase 11 ships the RPCs; Phase 12 schedules them. The dumb-setter shape of `reset_subscription_merits` (D-13) is specifically chosen to keep the date logic inside Phase 12.
* **Phase 13 edge function gateway** will call `check_and_deduct_merits` before every AI feature and `refund_merits` on failure. The `deduction_id` returned in D-06 is the handle Phase 13 caches and passes to `refund_merits` on AI error paths (TEST-07).
* **Frontend UX-02 cost preview + UX-03 low-balance warning** will read `merit_feature_costs` directly (D-03). No additional RPC surface for the frontend in Phase 11.

</code_context>

<specifics>
## Specific Ideas

* Open `supabase/migrations/20260411000002_atomic_check_and_record_usage.sql` in a split pane while writing the new migration — it's the closest structural template for SECURITY DEFINER + FOR UPDATE + grants.
* The `deduction_id` shared-UUID trick (D-06) is the load-bearing decision for refund correctness. Do NOT collapse split deductions into a single row with JSON breakdown "for simplicity" — it breaks the clean per-bucket refund in D-09 and corrupts `balance_type` semantics.
* The reset RPC's `tier='free' → no-op` branch (D-14) is not an edge case — it's how Phase 10 D-01 (nullable `subscription_reset_date`) stays consistent. Write a pgTAP test specifically for this.
* Reconciliation test (D-24) should run a randomized sequence of deduct/refund/credit/reset over one user and assert `drift = 0` at every step, not just at the end. This catches any RPC that forgets to write its `merit_transactions` companion row.
* The `merit_feature_costs` seed is not optional — without it, the first call to `check_and_deduct_merits` returns `tier_locked` for every feature. Seed values must match REQUIREMENTS.md §RES/LIG/CC/RCL/IPC exactly.

</specifics>

<deferred>
## Deferred Ideas

* `MERIT_SYSTEM_ENABLED` feature flag and edge-function call sites — **Phase 13**.
* Stripe webhook wiring of `credit_shop_merits` and `reset_subscription_merits` — **Phase 12**.
* Cron job / scheduler for monthly reset — **Phase 12** owns the scheduling decision.
* `merit_reconciliation` VIEW for bulk drift queries — defer until ops actually needs it; per-user RPC covers Phase 11's Success Criterion #5.
* `active` flag or `updated_at` audit columns on `merit_feature_costs` — ship minimal, add if the price experimentation use case becomes real.
* Admin grant tooling (manual Merit credits outside Stripe) — not in v2.0 scope.
* `reconcile_all_users()` bulk health-check RPC — ops/perf concern, defer.
* Refund time-window or cycle-awareness — explicitly rejected in D-10; revisit only if an abuse pattern emerges post-launch.

</deferred>

---

*Phase: 11-merit-rpcs-and-reconciliation*
*Context gathered: 2026-04-14*

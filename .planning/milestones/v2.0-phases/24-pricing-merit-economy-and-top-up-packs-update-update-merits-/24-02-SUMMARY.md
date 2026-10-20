---
phase: 24-pricing-merit-economy-and-top-up-packs-update-update-merits-
plan: 02
subsystem: payments
tags: [migration, webhook, stripe, idempotency, topup, db-push, phase-24]
status: awaiting-checkpoint
autonomous: false
requirements:
  - TOPUP-01
  - TOPUP-02
  - SHOP-09
  - NFR-06
  - NFR-07
dependency-graph:
  requires:
    - phase-10: merit_ledger_foundation (merit_transactions table)
    - phase-11: merit_rpcs (credit_shop_merits v1, merit_shop_purchases)
    - phase-12: stripe-webhook-handler (HANDLED_EVENTS set, insert-first dedupe)
  provides:
    - additive schema: merit_transactions.pack_id + stripe_payment_intent_id
    - partial unique index: merit_transactions_stripe_pi_unique
    - credit_shop_merits v2 (source='topup', populates new columns)
    - stripe-webhook-handler: payment_intent.succeeded router branch
  affects:
    - supabase.merit_transactions (additive, non-breaking)
    - public.credit_shop_merits RPC signature unchanged; body rewritten
    - stripe-webhook-handler event coverage: 6 -> 7 HANDLED_EVENTS
tech-stack:
  added:
    - (none — uses existing Stripe Payment Element already in package.json)
  patterns:
    - PaymentIntent id as idempotency key (3-layer replay safety)
    - Additive migration pattern (ADD COLUMN IF NOT EXISTS, no DROP)
    - EXCEPTION WHEN unique_violation post-safety net
key-files:
  created:
    - supabase/migrations/20260422000000_phase_24_topup.sql (8198 bytes)
  modified:
    - supabase/functions/stripe-webhook-handler/index.ts (+114 / -2 lines)
    - supabase/functions/stripe-webhook-handler/index.test.ts (+299 / -2 lines)
    - supabase/functions/_shared/test-helpers/stripe-fixtures.ts (+78 lines)
decisions:
  - Extract PaymentIntent identifiers in a dedicated else-if branch instead of
    letting the PI event fall through to the subscription-object else branch.
    Prevents accidental corruption of profiles.subscription_status /
    subscription_tier / stripe_subscription_id when a shop purchase arrives.
    Recorded below as Deviation 1 (Rule 1 - Bug).
  - Extend metadata.user_id first-lookup path to also cover
    payment_intent.succeeded events (previously only
    checkout.session.completed qualified). D-23 embedded Payment Element
    creates PaymentIntents with user_id in metadata at creation time so
    this is the canonical resolution path for the new flow.
  - Retain service_role-only GRANT on credit_shop_merits in the new migration.
    The existing authenticated grant from phase 11's migration remains in
    place (GRANT is additive, REVOKE ALL FROM public does not revoke from
    authenticated). No functional change to callers.
metrics:
  duration: ~35 minutes
  completed: 2026-04-22
  tasks_completed: 3 of 4 (Task 2 is the blocking human-action checkpoint)
  tests_added: 6
  tests_passing: 21 of 21
---

# Phase 24 Plan 02: Top-Up Migration and Webhook Routing Summary

One-liner: Additive migration for pack_id + stripe_payment_intent_id columns plus `payment_intent.succeeded` webhook branch, wiring the embedded Payment Element (D-23) top-up flow with 3-layer idempotency and source='topup' ledger rows.

## Status

AWAITING CHECKPOINT — Task 2 (`supabase db push`) requires explicit user approval per plan's `autonomous: false` gate and D-22 migrations-first ordering.

## What shipped (code-complete, pre-deploy)

### Task 1 — Migration authored (commit 7e25bc9)

File: `supabase/migrations/20260422000000_phase_24_topup.sql` (8198 bytes)

Sections:
1. ADD COLUMN IF NOT EXISTS `pack_id` text + `stripe_payment_intent_id` text on `merit_transactions` with column comments
2. CREATE UNIQUE INDEX IF NOT EXISTS `merit_transactions_stripe_pi_unique` ON `merit_transactions(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL` — partial, replay-safety
3. CREATE OR REPLACE `credit_shop_merits(uuid, integer, text)`:
   - Preserves D-06 lock ordering (`user_merits FOR UPDATE` before any idempotency lookup)
   - Preserves D-11 idempotency pre-check (`merit_shop_purchases.stripe_payment_intent_id` UNIQUE)
   - Ledger row now: `source='topup'` (D-04), populates new `pack_id` + `stripe_payment_intent_id` columns
   - EXCEPTION WHEN unique_violation: returns `{ duplicate: true, via: 'ledger_unique_race' }` if the partial unique catches a race the pre-lookup missed
   - Response JSON: adds `pack_id` field (`pack_3|pack_10|pack_25|pack_50`)
4. DO block verification — raises EXCEPTION on any missing column/index, RAISE NOTICE on success

Re-runnability: all 3 sections use IF NOT EXISTS / CREATE OR REPLACE. Zero DROP statements; roll-forward only.

### Task 3 — Webhook routing (commit a727d7d)

File: `supabase/functions/stripe-webhook-handler/index.ts` (+114 / -2)

Edits:
- `HANDLED_EVENTS` grew from 6 to 7 entries (added `payment_intent.succeeded`).
- New module-level `VALID_PACK_IDS` Set: `{pack_3, pack_10, pack_25, pack_50}`.
- New identifier-extraction branch for `payment_intent.succeeded` that:
  - Reads `customerId`, `metaUserId`, `customerEmail` from the PI object
  - Does NOT mutate `updateData` beyond the pre-existing `updated_at` — shop signals must not overwrite subscription fields (Deviation 1 below)
- Metadata-first profile lookup extended: `(checkout.session.completed || payment_intent.succeeded) && metaUserId` now triggers the `tryUpdateById(metaUserId)` fast path.
- Router branch for `payment_intent.succeeded`:
  - Fail-closed on missing userId -> `{ received: true, profileFound: false }`
  - Fail-closed on missing/invalid `pack_id` -> `{ received: true, warning: 'invalid_shop_metadata' }` (no RPC call)
  - Parses `pack_size` from `pack_id` string, validates against `VALID_PACK_SIZES`
  - Calls `credit_shop_merits(userId, packSize, pi.id)`
  - Reports `{ received: true, matchedBy, packId, duplicate }` (duplicate flag sourced from RPC return)

### Task 4 — Tests (commit 1a62bbb)

Files:
- `supabase/functions/_shared/test-helpers/stripe-fixtures.ts` (+78 lines): new `makePaymentIntentSucceededEvent()` fixture with configurable `metadataOverride` escape hatch for the bare-PI and missing-user_id scenarios.
- `supabase/functions/stripe-webhook-handler/index.test.ts` (+299 / -2 lines):
  - Extended `FakeSupabaseOpts.rpcData` to return real data from fake RPCs (enables the `{ duplicate: true }` replay assertion).
  - 6 new Deno.test entries under "Phase 24 TOPUP-02:":
    1. Happy path — pack_25 credits once, duplicate:false, pi_test_abc echoed as idempotency key
    2. Event-id replay — stripe_webhook_events UNIQUE blocks the second delivery; RPC called exactly once across 2 POSTs
    3. Cross-event PI replay — both events reach the RPC, second returns duplicate:true via the RPC's pre-check (proving cross-branch idempotency with the existing checkout.session.completed path)
    4. Invalid pack_id (pack_99) — warning='invalid_shop_metadata', RPC not called
    5. Missing metadata.user_id — profileFound:false (profile lookup fallback fails), RPC not called
    6. Bare PI (no pack_id at all) — warning='invalid_shop_metadata', RPC not called

## Verification

Test run from `supabase/functions/` with `deno test --allow-all --no-check stripe-webhook-handler/index.test.ts`:

```
ok | 21 passed | 0 failed (6s)
```

21 = 15 pre-existing + 6 new Phase 24 tests. Zero regressions.

Acceptance criteria (plan Tasks 1, 3, 4):

| Acceptance | Result |
| --- | --- |
| `ADD COLUMN IF NOT EXISTS pack_id` present | 1 match |
| `ADD COLUMN IF NOT EXISTS stripe_payment_intent_id` present | 1 match |
| `CREATE UNIQUE INDEX IF NOT EXISTS merit_transactions_stripe_pi_unique` present | 1 match |
| Partial index `WHERE stripe_payment_intent_id IS NOT NULL` | 1 match |
| `'topup'` literal in migration | 2 matches (body comment + INSERT) |
| `EXCEPTION WHEN unique_violation` fallback | 1 match |
| `DROP TABLE\|DROP COLUMN\|DROP INDEX` absent | 0 matches (D-22 safe) |
| `payment_intent.succeeded` in index.ts | 5 matches (HANDLED_EVENTS + 3 event-type checks + branch) |
| `VALID_PACK_IDS` in index.ts | 2 matches (decl + use) |
| `rpc("credit_shop_merits"` in index.ts | 2 matches (existing checkout branch + new PI branch) |
| `payment-intent-credited` log marker | 1 match |
| `payment-intent-invalid-pack` log marker | 1 match |
| `Phase 24 TOPUP-02` test labels | 7 matches (1 header + 6 tests) |
| `pack_25` in tests | 4 matches |
| `duplicate: true` in tests | 2 matches |
| `invalid_shop_metadata` in tests | 4 matches (2 test bodies + 2 expectations) |

## Deviations from Plan

### Deviation 1 — [Rule 1 - Bug] Dedicated identifier extraction for payment_intent.succeeded

Found during: Task 3 pre-edit read of existing `updateData` construction (lines 207-277 of `index.ts` as-was).

Issue: The plan's Task 3 Edit 2 placed the router branch inside the try block AFTER the profile-lookup chain, but did not touch the identifier-extraction / updateData construction block that runs BEFORE the chain. Because the existing block uses `if/else if/.../else`, any event type not matching `invoice.payment_failed` / `invoice.payment_succeeded` / `checkout.session.completed` falls into the `else` branch that treats `event.data.object` as a Stripe Subscription — writing `subscription_tier`, `subscription_status = sub.status`, `current_period_end`, `stripe_subscription_id`, `stripe_price_id` to the profile. A `payment_intent.succeeded` landing here would corrupt the user's subscription record with fields derived from the PI object (e.g. `subscription_status='succeeded'`, `stripe_price_id=null`, `stripe_subscription_id=<PI id>`).

Fix: Added a dedicated `else if (event.type === "payment_intent.succeeded")` branch BEFORE the subscription else that extracts `customerId`, `metaUserId`, `customerEmail` from the PI object and leaves `updateData` untouched (only the module-level `updated_at` sentinel). This preserves the downstream profile-lookup chain (still matches via metadata.user_id first) without corrupting any subscription fields.

Scope: Strictly within the two edits described by the plan (extension of Edit 1's declarations area + the router branch). Does not touch any logic the plan did not already identify as mutable.

Files modified: `supabase/functions/stripe-webhook-handler/index.ts`
Commit: a727d7d

### Deviation 2 — [Rule 3 - Blocking] Fake supabase RPC needed data return to test duplicate path

Found during: Task 4 test authoring.

Issue: The existing `createFakeSupabase().rpc()` returned only `{ error }`, not `{ data, error }`. The new webhook branch destructures `{ data: rpcData, error: rpcErr }` and reads `rpcData.duplicate` to set the response flag. Without a `data` path, Test T3 (cross-event PI replay) could not assert `body.duplicate === true`.

Fix: Added `rpcData?: Record<string, unknown>` to `FakeSupabaseOpts` and updated the rpc impl to return `{ data: opts.rpcData?.[fn] ?? null, error }`. Backward-compatible with all 15 pre-existing tests (they never check `data`).

Files modified: `supabase/functions/stripe-webhook-handler/index.test.ts`
Commit: 1a62bbb

### None other

No architectural changes required. No auth gates encountered (Deno tests run locally with `--allow-all`).

## Threat Flags

None. The changes exactly match the `<threat_model>` in 24-02-PLAN.md (T-24-05 through T-24-10). The new identifier-extraction branch for PI events removes a latent data-corruption vulnerability (pre-existing in the `else` fallthrough) — strictly a security improvement, not a new surface.

## Pending — Task 2 Checkpoint

Task 2 is a `checkpoint:human-action` gate. Per D-22, `supabase db push` must land BEFORE the webhook code deploys. Migration file is authored locally (`20260422000000_phase_24_topup.sql`) but is NOT yet pushed. Webhook handler code is authored locally but has NOT been deployed via `supabase functions deploy stripe-webhook-handler`.

User must:

1. Confirm target Supabase project (`supabase projects list` — starred project should be staging first, then production).
2. Run `supabase db push` from repo root. Expected tail: `Applying migration 20260422000000_phase_24_topup.sql...` + `NOTICE: Phase 24 migration verified OK` + `Finished supabase db push.`
3. Smoke-check via SQL editor:
   - `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='merit_transactions' AND column_name IN ('pack_id','stripe_payment_intent_id');` must return 2 rows.
   - `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname='merit_transactions_stripe_pi_unique';` must return 1 row.
4. Re-run `supabase db push` — should report 0 pending (re-runnability sanity).
5. AFTER migration lands, deploy webhook: `supabase functions deploy stripe-webhook-handler`.

Only after 1-5 is the phase 24-02 milestone complete. Do NOT deploy webhook before migration.

## Self-Check

Verifying claimed artifacts exist + commits are on disk:

- FOUND: `supabase/migrations/20260422000000_phase_24_topup.sql` (8198 bytes)
- FOUND: `supabase/functions/stripe-webhook-handler/index.ts` (modified +114/-2)
- FOUND: `supabase/functions/stripe-webhook-handler/index.test.ts` (modified +299/-2)
- FOUND: `supabase/functions/_shared/test-helpers/stripe-fixtures.ts` (modified +78 lines, `makePaymentIntentSucceededEvent` present at L297-341)
- FOUND: commit `7e25bc9` — `feat(24-02): add phase 24 top-up migration with additive columns and RPC rewrite`
- FOUND: commit `a727d7d` — `feat(24-02): add payment_intent.succeeded branch to stripe webhook handler`
- FOUND: commit `1a62bbb` — `test(24-02): add 6 payment_intent.succeeded webhook handler tests`
- VERIFIED: Deno test run from `supabase/functions/` dir: **21 passed | 0 failed** (including 6 new Phase 24 TOPUP-02 cases)
- PENDING: Task 2 `supabase db push` — requires human-action checkpoint (out of executor scope per D-22 / non-autonomous plan)

## Self-Check: PASSED

All artifacts claimed in this SUMMARY are present on disk and committed to the worktree branch. The only remaining work is the human-action checkpoint for migration apply + webhook deploy, as documented in the "Pending Deploy Sequence" section above.

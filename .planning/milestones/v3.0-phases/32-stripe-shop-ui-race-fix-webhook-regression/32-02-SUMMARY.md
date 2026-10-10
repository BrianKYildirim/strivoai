---
phase: 32-stripe-shop-ui-race-fix-webhook-regression
plan: 02
subsystem: stripe-webhook-idempotency
tags: [testing, idempotency, stripe, merits, regression]
requires:
  - "supabase/functions/stripe-webhook-handler/index.ts (triple-defense idempotency, READ-ONLY)"
  - "supabase/functions/_shared/test-helpers/stripe-fixtures.ts (event fixtures)"
provides:
  - "Three named, greppable MER-10 axis-1/2/3 regression tests asserting exactly-once shop merit crediting on webhook replay"
affects:
  - "supabase/functions/stripe-webhook-handler/index.test.ts"
tech-stack:
  added: []
  patterns:
    - "rpcCalls.filter(c => c.fn === 'credit_shop_merits') single-credit assertion"
    - "deps-injected handleStripeWebhook(req, { supabase, stripe }) test seam"
key-files:
  created: []
  modified:
    - "supabase/functions/stripe-webhook-handler/index.test.ts"
decisions:
  - "D-06 satisfied via option (a): strengthen + rename existing axis tests in place rather than a new file"
metrics:
  duration: "~15 min"
  completed: 2026-05-21
  tasks: 2
  files: 1
---

# Phase 32 Plan 02: Webhook Idempotency Regression Summary

Re-verified the existing triple-defense Stripe shop-merit webhook idempotency with three durable, explicitly-named Deno regression tests (`MER-10 axis-1/2/3`), each asserting exactly-once `credit_shop_merits` crediting across all replay axes. No production code changed — the handler is verified, not redesigned. Satisfies MER-10 and TEST-03.

## Decision: option (a) chosen over option (b)

Per CONTEXT D-06, **option (a) — audit and STRENGTHEN the three existing axis tests in place** was chosen over **option (b) — a new test file**. Rationale: PATTERNS.md confirmed all three axes already existed as analogs in `index.test.ts` (axis 1 at line 1009, axis 2 at line 1066, axis 3 at line 559). In-place strengthening is the lowest-churn path, keeps the regression coverage co-located with the rest of the webhook suite so a future handler change runs them automatically, and avoids the first-test `sanitizeResources`/`sanitizeOps` caveat (these tests are mid-file, not the first import).

## What was done

### Task 1 — Strengthen + rename the three replay-axis tests (commit eeffb8f)

- **Axis 1** (`MER-10 axis-1: same event_id replay short-circuits — credit_shop_merits called exactly once`): Renamed from the Phase-24 TOPUP-02 description. Already delivered the same event twice through one `createFakeSupabase` instance; asserts the first delivery yields exactly 1 `credit_shop_merits` call, the replayed event returns `200` with `duplicate: true`, and the call count stays at exactly 1 (insert-first `23505` short-circuit).
- **Axis 2** (`MER-10 axis-2: same payment_intent_id across two event_ids — second RPC returns duplicate:true, ledger credits once`): Renamed. Two distinct `event_id`s share one `piId`; both reach the RPC (distinct event_ids bypass the webhook_events dedupe), the second response carries `duplicate: true`, and both calls carry the same `p_stripe_payment_id`. Added an explicit comment that the `merit_shop_purchases.stripe_payment_intent_id` UNIQUE pre-check guarantees the production ledger ends with exactly one crediting row.
- **Axis 3** (`MER-10 axis-3: same checkout session/PI replay (payment mode) — credit_shop_merits called exactly once`): Renamed from `shop-credit-duplicate-pi-noop`. Switched the single-credit assertions from `fakeSupabase.rpcCalls.length` to the `rpcCalls.filter(c => c.fn === "credit_shop_merits")` count pattern (per plan) so the assertion is specific to the crediting RPC. Asserts the replayed checkout event returns `200`/`duplicate: true` with exactly one credit call.

Used the existing `createFakeSupabase` / `createFakeStripe` / `buildWebhookRequest` / `makePaymentIntentSucceededEvent` / `makeCheckoutSessionCompletedEvent` helpers verbatim. No handler logic added.

### Task 2 — Verification checkpoint: handler unmodified (no commit; verification-only)

`git status --porcelain supabase/functions/stripe-webhook-handler/index.ts` returns EMPTY — the handler is unchanged. The only modified file under the handler directory is `index.test.ts`. This task produces no commit because it asserts the absence of a change.

## Verification

- `deno test --node-modules-dir=auto --allow-all --no-check supabase/functions/stripe-webhook-handler/index.test.ts` → **21 passed | 0 failed**, including all three `MER-10 axis-*` tests.
- `grep -c 'MER-10 axis-' index.test.ts` → **3** (mechanical no-op guard passes).
- `git status --porcelain supabase/functions/stripe-webhook-handler/index.ts` → empty (handler unmodified).

### Environment note (not a deviation)

The canonical command in the plan (`deno test --allow-env --allow-read --allow-net --no-check ...`) initially failed for ALL 21 tests with `Could not find a matching package for 'npm:stripe@14'` — a pre-existing local-environment npm-resolution gap affecting every test in the file equally, not caused by this plan's changes. Adding `--node-modules-dir=auto` (which `scripts/run-edge-tests.ps1` effectively achieves via `--allow-all` + the repo's deno setup) lets deno install the npm dep and all tests pass. No source change was needed; the test logic is correct.

## Deviations from Plan

None — plan executed exactly as written. The only changed file is `index.test.ts`; the handler, RPCs, and migrations are unchanged.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: supabase/functions/stripe-webhook-handler/index.test.ts (modified, committed)
- FOUND: commit eeffb8f (test(32-02) rename + strengthen axis tests)
- FOUND: 3x `MER-10 axis-` test names; deno suite 21/21 pass
- VERIFIED: index.ts unmodified (empty git porcelain)

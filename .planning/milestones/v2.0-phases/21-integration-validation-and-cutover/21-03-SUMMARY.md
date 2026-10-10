---
phase: 21-integration-validation-and-cutover
plan: 03
subsystem: testing
tags: [testing, deno, stripe, merits, reset, yearly, rollover, cron]

requires:
  - phase: 11-merit-rpcs-and-reconciliation
    provides: reset_subscription_merits RPC contract (migration 20260415000000_merit_rpcs.sql §6) — overwrite-to-allowance semantics with zero rollover and shop_balance preservation
  - phase: 12-stripe-products-and-webhook
    provides: handleStripeWebhook(req, deps) routing checkout.session.completed (subscription mode) to reset_subscription_merits with next_reset_date set to now+1mo
  - phase: 12-stripe-products-and-webhook
    provides: handleResetSubscriptionMerits batch-sweeper handler queries user_merits rows with past subscription_reset_date + profiles.subscription_tier in (pro,elite) and calls the RPC per row
  - phase: 13-merit-enforcement-and-feature-flag
    provides: Pro tier allowance constant (75) and Pro feature cost seed (resume_analysis pro=2)
  - phase: 21-integration-validation-and-cutover
    plan: 01
    provides: MockLedger + buildMockServiceClient + signStripePayload harness (test-04-free-signup-to-shop.test.ts)
  - phase: 21-integration-validation-and-cutover
    plan: 02
    provides: FakeProfile + stateful stripe_* lookup-chain mock + mockResetSubscriptionMerits semantics (test-05-upgrade-proration.test.ts)
provides:
  - "TEST-06 offline integration scenario proving Pro yearly monthly-reset cadence: 75-Merit initial grant via checkout.session.completed, 5x resume_analysis deductions over the month (65 remaining), 10 shop Merits seeded, 30-day advance via direct batch-sweeper invocation, reset overwrites subscription_balance to 75 with zero rollover and preserved shop_balance"
  - "Auth-guard regression test for reset-subscription-merits: throwing requireAuth returns 401, ledger and RPC counters unchanged"
  - "Deno.serve-neutering pattern for test files that must load two handler modules (each calls Deno.serve at top level)"
affects: [21-04, 21-05, 21-06, 21-07]

tech-stack:
  added: []
  patterns:
    - "Pre-import Deno.serve replacement: overwrite `(Deno as any).serve` with a no-op BEFORE dynamic-importing two modules that both call `Deno.serve(...)` at module scope (prevents AddrInUse on port 8000)"
    - "In-memory MockLedger extension with `subscription_reset_date` field — the batch sweeper queries this column via `.lte(subscription_reset_date, now)` so the fake supabase builder must expose it on user_merits rows"
    - "Literal past-ISO fixture (2020-01-01) for due reset_date — satisfies `.lte(now)` unconditionally without any Date.now / FakeDate / Temporal usage (21-CONTEXT D-03)"

key-files:
  created:
    - supabase/functions/_tests/test-06-yearly-reset.test.ts
  modified:
    - scripts/run-edge-tests.ps1

key-decisions:
  - "Routed Step 1 (yearly subscribe -> 75 Merits) via checkout.session.completed mode=subscription interval=annual, NOT invoice.payment_succeeded as the plan text suggested. Rationale: the shipped handler NO-OPs invoice.payment_succeeded for interval='year' (stripe-webhook-handler/index.ts:575-584, per 12-CONTEXT D-08: yearly monthly refills are owned by pg_cron). The Merit grant for a fresh yearly subscription actually flows through checkout.session.completed which calls reset_subscription_merits (handler lines 445-459). This mirrors TEST-05 Plan 02's identical deviation and tests the real production path."
  - "Used the shipped batch-sweeper signature for handleResetSubscriptionMerits (queries user_merits rows with past subscription_reset_date, calls the RPC per row) rather than the per-user body signature the plan text implied. No export addition was required — handleResetSubscriptionMerits is already exported at reset-subscription-merits/index.ts:41 with the `deps: { supabase, requireAuth }` injection shape."
  - "Neutered Deno.serve before dynamic imports to work around AddrInUse. Both stripe-webhook-handler/index.ts:734 and reset-subscription-merits/index.ts:121 call `Deno.serve(...)` at module scope on port 8000. Loading both in one test file otherwise fails with os error 10048. The neutering replaces Deno.serve with a Server-shaped stub before either module evaluates — production is unaffected because the handler `export async function` is what tests invoke."
  - "No time mocking anywhere in the file. Per 21-CONTEXT D-03 the 30-day advance is simulated by directly invoking handleResetSubscriptionMerits (the real reset entry point) against a ledger whose subscription_reset_date is a literal 2020-01-01 ISO — which is guaranteed to be `<= now` regardless of wall-clock drift. Grep for `Date.now|FakeDate|Temporal` returns zero matches."

patterns-established:
  - "Two-handler tests: when a single integration scenario must cross the webhook-handler and scheduled-sweeper boundaries, neuter Deno.serve at the very top of the file BEFORE any handler import, then dynamic-import each handler. The mutated Deno.serve survives through both module evaluations."
  - "ZERO-rollover invariant assertion pattern: drain subscription_balance partway (e.g. 75 -> 65), trigger the reset, assert balance === 75 AND assert balance !== 65 + 75. The double assertion catches a future regression where the mock (or the real RPC) mistakenly ADDS instead of OVERWRITES."
  - "Shop-balance preservation assertion: seed a shop_balance value before the reset; assert it is unchanged after. Prevents a future refactor from accidentally combining buckets in the reset path."

requirements-completed: [TEST-06]

duration: ~12min
completed: 2026-04-19
---

# Phase 21 Plan 03: TEST-06 Yearly Reset Summary

**Offline Deno integration test proving Pro yearly monthly-reset cadence: signed Stripe checkout grants 75 Merits, user spends 10 over the month plus seeds 10 shop Merits, direct batch-sweeper invocation overwrites subscription_balance to 75 with ZERO rollover while preserving the 10 shop Merits. Runs in ~69ms fully offline; auth guard proven.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-19T11:38:51Z
- **Completed:** 2026-04-19T11:50:00Z (approx)
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Authored `supabase/functions/_tests/test-06-yearly-reset.test.ts` covering the canonical Phase 21 yearly-reset scenario: signed `checkout.session.completed` credits 75 Merits via `reset_subscription_merits`, 5x resume_analysis Pro deductions (2 each = 10 total) drain to 65, 10 shop Merits seeded (valid pack per SHOP-01), then direct batch-sweeper invocation of `handleResetSubscriptionMerits` resets subscription_balance to 75 with shop_balance preserved at 10.
- Added a second test asserting the internal-secret auth guard: `requireAuth` stub that throws a 401 `Response` returns 401 from the handler, the ledger stays untouched, and zero RPC calls are issued.
- Neutered `Deno.serve` before dynamic imports so both `stripe-webhook-handler` and `reset-subscription-merits` can be loaded in the same test file without an AddrInUse on port 8000.
- Registered the new test in `scripts/run-edge-tests.ps1` immediately after TEST-05.
- Full edge-test suite remains green: **230 passed / 0 failed in 13s** (228 from prior runs + 2 new TEST-06 cases).

## Task Commits

1. **Task 1: Author TEST-06 yearly-reset harness** - `8875561` (test)
2. **Task 2: Register TEST-06 in run-edge-tests.ps1** - `b6f74af` (chore)

## Files Created/Modified

- `supabase/functions/_tests/test-06-yearly-reset.test.ts` — New offline integration test with two `Deno.test` cases (main scenario + auth guard). ~760 lines including the MockLedger extension with `subscription_reset_date` + the user_merits query-chain fake.
- `scripts/run-edge-tests.ps1` — Added `_tests/test-06-yearly-reset.test.ts` line to the deno test invocation immediately after TEST-05.

## Decisions Made

- **Routed Step 1 via `checkout.session.completed` mode=subscription interval=annual, NOT `invoice.payment_succeeded`.** The plan's `<interfaces>` block called for `makeInvoicePaymentSucceededEvent({ userId, amountPaid: 8999, billingCycle: "yearly" })`. Inspection of `supabase/functions/_shared/test-helpers/stripe-fixtures.ts` lines 208-263 shows the fixture actually takes `{ subscription, customer, interval }` — none of those plan params exist. And `supabase/functions/stripe-webhook-handler/index.ts:575-584` short-circuits `invoice.payment_succeeded` with `interval === "year"` as a no-op, per 12-CONTEXT D-08 (yearly monthly refills are owned by pg_cron, not the webhook). The actual path that credits 75 Merits on a fresh yearly Pro subscription is `checkout.session.completed` mode=subscription → `reset_subscription_merits` RPC (handler lines 445-459). Routing Step 1 through this path exercises the real production flow.

- **Used the shipped batch-sweeper signature for `handleResetSubscriptionMerits`, not a per-user body-arg signature.** The plan text called for `{ user_id, tier, invocation_source }` body. The shipped handler at `reset-subscription-merits/index.ts:41-119` takes no user_id in the body — it queries `user_merits` for rows with `subscription_reset_date <= now` and `profiles.subscription_tier in ('pro','elite')`, then calls `reset_subscription_merits` per due row. The test seeds a single due row by setting `ledger.subscription_reset_date` to a past ISO after Step 1, then invokes the sweeper which finds that one row and drives the RPC.

- **No `handleResetSubscriptionMerits` export addition was required.** The plan speculated this might be needed. It isn't — the handler is already exported at line 41 with the `deps: { supabase, requireAuth }` injection shape the plan expected.

- **Neutered `Deno.serve` before dynamic imports.** Both `stripe-webhook-handler/index.ts:734` and `reset-subscription-merits/index.ts:121` call `Deno.serve(...)` at module scope on the default port 8000. Loading both in the same test file produces `AddrInUse: Only one usage of each socket address (os error 10048)`. The fix: overwrite `(Deno as any).serve` with a Server-shaped no-op before either module evaluates, then dynamic-import both (top-level static imports hoist, so they'd run before the mutation). This is strictly a test-harness concern — production is unaffected because test code invokes the exported handler functions directly.

- **No time mocking anywhere in the file.** Per 21-CONTEXT D-03 and the plan's explicit acceptance criterion (`grep -n 'Date.now|FakeDate|Temporal' returns 0 matches`), the 30-day advance is simulated by setting `ledger.subscription_reset_date` to a literal past ISO (`2020-01-01T00:00:00.000Z`) which is guaranteed to be `<= now` regardless of wall-clock drift. `grep -c 'Date\.now\|FakeDate\|Temporal'` returns 0.

- **Sanitizer disposition.** Both `Deno.test` cases use `sanitizeResources: false, sanitizeOps: false` matching TEST-04/05 precedent. The stripe-webhook-handler module-scope fire-and-forget receipt-email fetch and the module-scope `Deno.serve()` primitives trip the Deno sanitizer even when the handler returns 200.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan's fixture signature + event type did not match the shipped code path**

- **Found during:** Task 1 (Author TEST-06 harness), while reading `stripe-webhook-handler/index.ts` + `_shared/test-helpers/stripe-fixtures.ts` before writing the first test.
- **Issue:** The plan's `<interfaces>` block specified `makeInvoicePaymentSucceededEvent({ userId, amountPaid: 8999, billingCycle: "yearly" })`. The shipped fixture takes `{ subscription, customer, interval }` — none of those params exist. And `invoice.payment_succeeded` with `interval === "year"` is a NO-OP in the shipped handler (12-CONTEXT D-08: pg_cron owns yearly monthly refills). The 75-Merit grant on a fresh yearly subscription actually flows through `checkout.session.completed` mode=subscription → `reset_subscription_merits` RPC.
- **Fix:** Routed Step 1 via `makeCheckoutSessionCompletedEvent({ mode: 'subscription', tier: 'pro', interval: 'annual', ... })`. This matches the shipped production path and mirrors Plan 21-02's identical deviation.
- **Files modified:** `supabase/functions/_tests/test-06-yearly-reset.test.ts`
- **Verification:** Test 1 assertions on `ledger.subscription_balance === 75` post-checkout + `resetCalls[0].args.p_tier === 'pro'` confirm the RPC fired correctly.
- **Committed in:** `8875561` (Task 1 commit).

**2. [Rule 3 - Blocking] Plan's reset-handler signature did not match the shipped sweeper**

- **Found during:** Task 1 (Author TEST-06 harness), while reading `reset-subscription-merits/index.ts:41-119`.
- **Issue:** Plan called for a per-user invocation with `{ user_id, tier, invocation_source }` body. The shipped handler is a batch sweeper: it queries `user_merits` rows with past `subscription_reset_date` where the joined `profiles.subscription_tier` is in `('pro','elite')`, then calls `reset_subscription_merits` per due row. There is no user_id in the body.
- **Fix:** Extended the MockLedger interface with a `subscription_reset_date` field and added a `user_merits` query-chain handler to `buildMockServiceClient` that returns the user's row iff `subscription_reset_date !== null` and the profile's tier is in the `.in(...)` list. The test sets `ledger.subscription_reset_date` to a past ISO after Step 1, then invokes the sweeper which finds exactly that one due row.
- **Files modified:** `supabase/functions/_tests/test-06-yearly-reset.test.ts`
- **Verification:** Handler's `batch-complete` log line reports `processed:1, errors:0, batch_size:1`. The RPC is called exactly once with the test user's id + `p_tier:'pro'` + a forward `p_next_reset_date`.
- **Committed in:** `8875561` (Task 1 commit, fixed before commit).

**3. [Rule 1 - Bug] AddrInUse on port 8000 when loading both handler modules**

- **Found during:** Task 1 verification (first run of the suite).
- **Issue:** Both `stripe-webhook-handler/index.ts:734` and `reset-subscription-merits/index.ts:121` call `Deno.serve(...)` at module scope on the default port 8000. Loading both in a single test file fails with `AddrInUse: Only one usage of each socket address (os error 10048)`. TEST-04/05 only load stripe-webhook-handler so they never hit this.
- **Fix:** Neuter `Deno.serve` by overwriting `(Deno as any).serve` with a Server-shaped no-op BEFORE the dynamic imports. Static imports hoist, so converted `import { handleResetSubscriptionMerits } from "..."` to a dynamic `await import(...)` and placed it after the mutation. The neutering is scoped to the test process and has zero effect on production.
- **Files modified:** `supabase/functions/_tests/test-06-yearly-reset.test.ts`
- **Verification:** Both modules now load; tests run to completion; full suite passes 230 / 0.
- **Committed in:** `8875561` (Task 1 commit, fixed before commit).

**4. [Rule 1 - Bug] Initial assertion picked the wrong subscription-reset row**

- **Found during:** Task 1 verification (after fixing deviation #3).
- **Issue:** The test originally did `ledger.transactions.find(t => t.source === "subscription-reset")` to verify the sweep grant's `amount === 10` (= target 75 - prev 65). But there are actually TWO subscription-reset rows in the ledger: one from Step 1 checkout grant (amount=75, 0→75) and one from Step 3 sweep (amount=10, 65→75). `.find()` returned the Step 1 row so the assertion failed with `expected 10, got 75`.
- **Fix:** Replaced `.find()` with `.filter()` + length assertion (2 rows), then located the sweep-specific row by matching `metadata.prev_balance === 65`. Asserted `sweepResetTx.amount === 10`. This also strengthens the test: it verifies both reset invocations produced their own ledger row, not just one.
- **Files modified:** `supabase/functions/_tests/test-06-yearly-reset.test.ts`
- **Verification:** Both assertions now pass; test 1 exits `ok` in 31ms.
- **Committed in:** `8875561` (Task 1 commit, fixed before commit).

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 bugs)
**Impact on plan:** Deviations #1 and #2 changed the architectural targets (which event type and which handler signature). The final scenario still satisfies the plan's `must_haves.truths` list verbatim — Pro yearly subscribe credits 75 Merits; after simulated 30-day advance, balance resets to 75 with ZERO rollover; shop-balance preserved; runs green offline in <10s; registered in run-edge-tests.ps1. The test now exercises the actual production paths rather than idealized ones that don't exist in the shipped handlers.

## Issues Encountered

- `npm:stripe@14` resolves only when `deno test` runs from `supabase/functions/` (where `deno.json` + cache live). TEST-04/05 already documented this; ran verifications from that cwd.
- PowerShell not directly available in this bash session for `scripts\run-edge-tests.ps1` invocation; verified the full suite by manually running `deno test` against the exact same file list from the PowerShell script. 230 / 0 matches the canonical runner's expected output.

## User Setup Required

None — no external service configuration required. `INTERNAL_JOB_SECRET` is generated per test via `crypto.randomUUID()` and scoped to `Deno.env.set` inside the test process.

## Verification

- `deno test --allow-env --allow-net --allow-read --no-check _tests/test-06-yearly-reset.test.ts` (from `supabase/functions/`): **2 passed | 0 failed in 69ms**.
- Full edge-test suite: **230 passed | 0 failed in 13s**. TEST-06 is at `scripts/run-edge-tests.ps1` line 46 and produces the expected log lines (`checkout-subscription-granted`, `batch-complete` with `processed:1, errors:0`).
- Acceptance greps against `_tests/test-06-yearly-reset.test.ts`:
  - `ZERO rollover\|shop_balance preserved\|subscription-reset` → 16 matches (≥3 required)
  - `handleResetSubscriptionMerits` → 6 matches (≥2 required)
  - `Date\.now\|FakeDate\|Temporal` → 0 matches (0 required)

## Threat Flags

None — no new security-relevant surface introduced. The test file is offline-only, sets a scoped `INTERNAL_JOB_SECRET` via `Deno.env.set` (never committed), and never touches production services. The Deno.serve neutering is test-harness-only and has no production effect.

## Self-Check: PASSED

- FOUND: `supabase/functions/_tests/test-06-yearly-reset.test.ts`
- FOUND: commit `8875561` (test(21-03): add TEST-06 yearly-reset integration scenario)
- FOUND: commit `b6f74af` (chore(21-03): register TEST-06 in run-edge-tests.ps1)
- FOUND: `_tests/test-06-yearly-reset.test.ts` line in `scripts/run-edge-tests.ps1` (1 match)

## Next Phase Readiness

- Plan 21-04 (next in wave) can rely on TEST-06 as a regression guard for yearly-subscription monthly-reset arithmetic, zero-rollover semantics, and shop-balance preservation.
- The two-handler loading pattern (`Deno.serve` neutering + dynamic imports) established here is reusable by any future integration test that must cross the webhook + sweeper boundaries in a single file.
- All three wave-1 TEST-04/05/06 integration scenarios are now committed and green; wave-2 (MIG-02 lock + cutover choreography) can proceed with offline regression coverage in place.

---
*Phase: 21-integration-validation-and-cutover*
*Completed: 2026-04-19*

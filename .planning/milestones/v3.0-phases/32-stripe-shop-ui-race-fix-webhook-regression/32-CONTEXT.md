# Phase 32: Stripe Shop UI Race Fix + Webhook Regression - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate the "75/75 user pays for 3 Merits and balance never updates" perception. The bug is **not** a missing or broken credit — the webhook's `credit_shop_merits` writes `shop_balance` correctly and the idempotency triple-defense already exists. The bug is a **client-side race**: `StripePaymentElementModal.tsx:96` fires a single `invalidateQueries(['merit-balance'])` the instant Stripe returns `succeeded`, but the webhook write often hasn't landed yet, so the re-read returns the stale pre-purchase balance.

This phase delivers:

1. **UI race fix (MER-07, MER-08):** Replace the single fire-and-forget invalidate with a **reconciliation poll** that refetches the merit balance until the credit lands (`shop_balance` exceeds a pre-purchase snapshot) or a 10s timeout, so an at-cap user (e.g. Pro 75/75) buying a 3-pack sees `78 / 75` within 10s of Stripe confirmation.
2. **Reconciliation UX (MER-08):** A "Merits processing — they'll appear shortly" toast during the window; modal closes immediately; header balance updates live when polling lands.
3. **Idempotency regression (MER-10, TEST-03):** **Re-verify** (not rebuild) the existing webhook triple-defense — replaying the same Stripe `event_id`, `payment_intent_id`, OR checkout `session_id` must never double-credit.

**Out of scope (per ROADMAP):**
- Pricing page restyle / `/pricing` UI (Phase 33).
- Subscription upgrade flows / Free→Pro→Elite checkout (Phase 33).
- Optimistic UI for AI-spend deduction (Phase 31, already shipped).
- Any change to the webhook crediting RPCs or idempotency mechanism itself — this phase verifies it, it does not redesign it. (No RPC cap-clamp exists and none should be added — total is *allowed* to exceed cap.)

</domain>

<decisions>
## Implementation Decisions

### Balance display (resolves ROADMAP vs Phase 30 conflict)
- **D-01:** Keep the **single-value `total / cap` display with NO bonus chip**. The ROADMAP success criterion #1 wording ("78 / 75 with the bonus chip on `+ 3 bonus`") is **stale** — Phase 30 (MER-11, decisions D-09/D-17) deliberately removed the bonus chip in `MeritBalanceHeaderV2.tsx`. The Phase 30 decision wins. MER-07 is satisfied by rendering `78 / 75` (total can exceed cap). Do **not** reintroduce conditional bonus-chip rendering. `MeritBalanceHeaderV2.tsx` requires no change for the chip — only the upstream balance must reconcile correctly.

### Reconciliation mechanism (MER-08)
- **D-02:** Use **client-side polling**, not Supabase Realtime. After Stripe `succeeded`, refetch the merit balance (`get_merit_balance` via the `['merit-balance']` query) on an interval (~1.5s suggested; planner/researcher may tune) until the credit is observed or the 10s ceiling is hit. No new infrastructure; Realtime on `user_merits` is intentionally avoided to keep the change small and reversible.
- **D-03:** **Baseline = snapshot `shop_balance` before confirm.** Capture the current `shop_balance` (from `useMerits`) at the moment "Confirm purchase" is clicked. Poll until `shop_balance > snapshot`. This precisely handles the exact-cap case (75/75 → 78) and avoids false positives from concurrent subscription writes that a `total`-based comparison would suffer.

### Reconciliation UX (MER-08)
- **D-04:** On Stripe `succeeded` (and `processing`): show the **"Merits processing — they'll appear shortly"** toast, **close the modal immediately**, and let the header balance update live when the poll observes the credit. Do not hold the modal open with a spinner.
- **D-05:** **On 10s timeout:** keep the processing toast; the balance refreshes on the next natural trigger (`refetchOnWindowFocus`, `staleTime` expiry, or navigation). Show **no error** — the payment succeeded, only the display lagged. No "taking longer" follow-up toast and no manual-refresh affordance (keep the UX quiet and reassuring).

### Idempotency regression verification (MER-10, TEST-03)
- **D-06:** Verify via an **automated Deno test against the webhook handler with a mocked Stripe + mocked service client.** Replay the same `event_id`, the same `payment_intent_id`, and the same checkout `session_id` through `processEvent` and assert no double-credit on any of the three axes. Fast, deterministic, CI-friendly. (Live staging smoke is *not* required for this phase's exit; the existing triple-defense is the system under test, not new code.)

### Claude's Discretion
- Exact poll interval, max attempts, and whether to implement the loop via React Query `refetchInterval`/`refetchUntil` semantics vs a manual `setTimeout` loop — planner/researcher decide, constrained only by the ≤10s ceiling and D-03's snapshot-comparison stop condition.
- Where the `shop_balance` snapshot is physically threaded (e.g. captured in `PaymentForm` from `useMerits` at submit time vs passed down from `TopUpProvider`) — implementation detail; D-03 fixes the *value* and *timing*, not the wiring.
- Test file placement and harness scaffolding for the Deno regression, consistent with existing `supabase/functions` test conventions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` — Phase 32 entry (goal, success criteria, out-of-scope). NOTE: SC#1's "+3 bonus chip" wording is superseded by D-01 above.
- `.planning/REQUIREMENTS.md` — MER-07 (above-cap shop credit), MER-08 (10s reconciliation, includes the exact toast wording and the `StripePaymentElementModal.tsx:94-101` poll-or-Realtime spec), MER-10 (triple-defense idempotency at `stripe-webhook-handler/index.ts:163-179` + `merit_shop_purchases.stripe_payment_intent_id` UNIQUE + `merit_transactions_stripe_pi_unique` partial index), TEST-03 (regression test).

### Code under change / verification
- `src/components/topup/StripePaymentElementModal.tsx` — the single fire-and-forget `invalidateQueries` at line 96 is the race site; this is where the poll + toast change lands. Existing contract documented in the file header (lines 1-23).
- `src/components/topup/StripePaymentElementModal.test.tsx` — existing vitest coverage to extend for the poll behavior.
- `src/hooks/useMerits.ts` — `['merit-balance', userId]` query, `get_merit_balance` RPC returning `shop_balance` / `subscription_balance` / `total`; `staleTime: 5_000`, `refetchOnWindowFocus: true`. Source of the pre-purchase `shop_balance` snapshot (D-03).
- `src/components/topup/MeritBalanceHeaderV2.tsx` — single-value `total / cap` display (MER-11). No chip change (D-01); included so planner confirms it needs no edit.
- `supabase/functions/stripe-webhook-handler/index.ts` — triple-defense idempotency (insert-first `stripe_webhook_events` at lines 162-179, cleanup-on-non-2xx at 181-206). System under test for MER-10/TEST-03; not modified.

### Prior-phase decisions carried forward
- `.planning/phases/30-*/30-CONTEXT.md` — MER-11 / D-09 / D-17 single-value display, no bonus chip (the decision D-01 honors over the ROADMAP wording).
- `.planning/phases/31-optimistic-ui-refund-verification/31-CONTEXT.md` — `useMerits` query-key and balance-shape conventions; optimistic-deduct patterns (not reused here, but establishes the merit-balance cache contract).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useMerits()` (`src/hooks/useMerits.ts`): exposes `shop`, `subscription`, `total` and the `['merit-balance', userId]` query key. The poll reuses this query — invalidate/refetch the existing key rather than adding a parallel fetch. `useInvalidateMerits()` already exists for one-shot invalidation.
- `StripePaymentElementModal.test.tsx`: already asserts `invalidateQueries({ queryKey: ['merit-balance'] })` on succeeded/processing — extend these cases for the new poll loop.

### Established Patterns
- React Query is the balance source of truth; `staleTime: 5_000` + `refetchOnWindowFocus: true` already provide the eventual-consistency fallback that D-05's timeout path relies on.
- Webhook idempotency follows an **insert-first** pattern with 23505 duplicate short-circuit and delete-on-non-2xx cleanup — the regression test must exercise both the duplicate short-circuit and the fact that the credit RPC ran exactly once.
- The crediting path writes `shop_balance` via `credit_shop_merits`; no cap clamp exists by design (total may exceed cap).

### Integration Points
- The poll lives entirely in `PaymentForm.handleSubmit` (`StripePaymentElementModal.tsx`) after `paymentIntent.status === 'succeeded'|'processing'`. It reads the pre-confirm `shop_balance` snapshot from `useMerits` and drives refetches of the shared `['merit-balance']` query, which `MeritBalanceHeaderV2` consumes — so the header updates with zero changes to the header component.

</code_context>

<specifics>
## Specific Ideas

- Toast copy is fixed by REQUIREMENTS MER-08: **"Merits processing — they'll appear shortly"** (current code uses "Processing… your merits will appear shortly." at line 99 — align to the canonical wording or confirm acceptable variance during planning).
- Success-case toast on immediate credit already exists: `"{merits} Merits added. Enjoy your career momentum."` (line 95) — keep for the fast path where the credit lands before/at first poll.
- Target render for the at-cap example: Pro `75/75` + 3-pack → `78 / 75 merits` (no chip).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Realtime-based reconciliation was considered and explicitly rejected in favor of polling per D-02; if future latency requirements demand sub-second updates, Realtime on `user_merits` is the documented upgrade path.)

</deferred>

---

*Phase: 32-stripe-shop-ui-race-fix-webhook-regression*
*Context gathered: 2026-05-20*

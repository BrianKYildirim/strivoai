# Phase 32: Stripe Shop UI Race Fix + Webhook Regression - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-20
**Phase:** 32-stripe-shop-ui-race-fix-webhook-regression
**Areas discussed:** Bonus chip vs single value, Reconciliation mechanism, Processing UX, Idempotency test approach, Polling baseline, Timeout behavior

---

## Bonus chip (ROADMAP vs Phase 30 conflict)

| Option | Description | Selected |
|--------|-------------|----------|
| Keep single value (Phase 30 wins) | Render '78 / 75 merits' with NO bonus chip; ROADMAP wording treated as stale; MER-07 satisfied | ✓ |
| Re-add bonus chip | Reintroduce '+3 bonus' chip, overriding Phase 30 single-value decision | |
| Transient chip only | Brief animated '+3 bonus' that fades, steady-state remains single-value | |

**User's choice:** Keep single value (Phase 30 wins)
**Notes:** Honors MER-11 / D-09 / D-17 from Phase 30. `MeritBalanceHeaderV2.tsx` needs no chip change.

---

## Reconciliation mechanism (MER-08)

| Option | Description | Selected |
|--------|-------------|----------|
| Poll merit-balance until change or 10s | Refetch get_merit_balance every ~1.5s until shop_balance exceeds snapshot or 10s timeout; no new infra | ✓ |
| Supabase Realtime on user_merits | Subscribe to Realtime row updates; lower latency, more infra | |
| Hybrid (Realtime + poll fallback) | Prefer Realtime, fall back to polling | |

**User's choice:** Poll merit-balance until change or 10s
**Notes:** Matches REQ MER-08 primary path; keeps change small and reversible.

---

## Processing UX (0–10s window)

| Option | Description | Selected |
|--------|-------------|----------|
| Processing toast, close modal, balance updates live | Toast + immediate close; header updates when poll lands; quiet timeout | ✓ |
| Keep modal open with spinner until credited | Hold modal with spinner until credit or 10s | |
| Optimistic increment + reconcile | Bump displayed total immediately, reconcile after | |

**User's choice:** Processing toast, close modal, balance updates live
**Notes:** Matches REQ toast wording.

---

## Idempotency regression test approach (MER-10 / TEST-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Deno test against webhook handler with mocked Stripe | Replay same event_id / payment_intent_id / session_id; assert no double-credit; CI-friendly | ✓ |
| Live staging smoke test | Manual real Stripe test-mode purchase + replay | |
| Both (automated + staging smoke) | Automated CI plus documented staging checklist | |

**User's choice:** Deno test against webhook handler with mocked Stripe
**Notes:** Triple-defense already exists; this verifies, not rebuilds.

---

## Polling baseline

| Option | Description | Selected |
|--------|-------------|----------|
| Snapshot shop_balance before confirm | Capture shop_balance at confirm click; poll until shop_balance > snapshot | ✓ |
| Snapshot total balance before confirm | Poll until total increases; risk of false positive | |
| Compare against expected post-value | Poll until shop_balance >= snapshot + pack.merits; brittle | |

**User's choice:** Snapshot shop_balance before confirm
**Notes:** Precisely handles the exact-cap (75/75 → 78) case.

---

## Timeout behavior (10s with no observed credit)

| Option | Description | Selected |
|--------|-------------|----------|
| Leave processing toast, rely on next refetch | Keep toast; refresh on focus/staleTime/nav; no error | ✓ |
| Show a soft 'taking longer' follow-up toast | Replace with reassuring follow-up after 10s | |
| Surface a manual refresh affordance | Toast with 'Refresh balance' action | |

**User's choice:** Leave processing toast, rely on next refetch
**Notes:** Payment succeeded; only display lagged — keep UX quiet, no error.

---

## Claude's Discretion

- Exact poll interval, max attempts, and React Query `refetchInterval` vs manual loop (constrained to ≤10s + snapshot stop condition).
- Physical wiring of the `shop_balance` snapshot (captured in `PaymentForm` vs threaded from `TopUpProvider`).
- Deno regression test file placement and harness scaffolding.

## Deferred Ideas

None — discussion stayed within phase scope. Realtime reconciliation was considered and rejected (D-02); documented as the future upgrade path if sub-second latency is ever required.

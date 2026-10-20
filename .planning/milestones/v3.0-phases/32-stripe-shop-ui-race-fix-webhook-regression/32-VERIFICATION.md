***

phase: 32-stripe-shop-ui-race-fix-webhook-regression
verified: 2026-05-20T00:00:00Z
status: passed
score: 8/8 must-haves verified
overrides\_applied: 0
human\_verification:

* test: "At-cap Pro user (75/75) buys a 3-pack via a real Stripe test-mode payment"
  expected: "Header reads 78 / 75 within 10s of Stripe confirmation, with no bonus chip, and no manual-refresh required"
  why\_human: "The poll's live correctness against a real webhook landing sequence (with actual latency between Stripe confirmation and credit\_shop\_merits write) cannot be verified without a running app and Stripe test-mode payment"
* test: "Processing-status path: trigger a payment that enters 'processing' state"
  expected: "Toast shows exactly 'Merits processing — they'll appear shortly', modal closes immediately, header updates when credit lands"
  why\_human: "Requires a real Stripe test-mode payment reaching 'processing' status, not achievable programmatically"

***

# Phase 32: Stripe Shop UI Race Fix + Webhook Regression Verification Report

**Phase Goal:** Fix the client-side merit-balance race in the Stripe top-up modal so an at-cap user sees their new shop merits within 10s of Stripe confirmation (MER-07, MER-08), without a bonus chip and without Supabase Realtime; and re-verify the existing triple-defense webhook idempotency with durable named regression tests (MER-10 webhook idempotency, TEST-03 automated regression).
**Verified:** 2026-05-20
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth                                                                                                                                            | Status                    | Evidence                                                                                                                                                                                                   |
| - | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | An at-cap user (Pro 75/75) who buys a 3-pack sees the header read 78/75 within 10s of Stripe confirmation                                        | VERIFIED (automated path) | `reconcileShopCredit` in `useMerits.ts:129-150` polls `['merit-balance', userId]` until `shop_balance > snapshot`; T7 test asserts 75→78 transition with fake timers. Full end-to-end requires human test. |
| 2 | On Stripe succeeded/processing, the modal closes immediately and a processing toast appears                                                      | VERIFIED                  | `StripePaymentElementModal.tsx:106-116`: `void reconcileShopCredit(snapshot)` then `onSuccess()` (detached poll, immediate close). T8 asserts `onOpenChange(false)` fires before poll lands.               |
| 3 | On 10s timeout, no error toast and no manual-refresh affordance is shown                                                                         | VERIFIED                  | Modal has no error-toast call on timeout path. T9 asserts `expect(toastErrorMock).not.toHaveBeenCalled()` after 10s+.                                                                                      |
| 4 | The header (MeritBalanceHeaderV2) updates live with zero edits to that component                                                                 | VERIFIED                  | `git status --porcelain src/components/topup/MeritBalanceHeaderV2.tsx` returned empty; the header reads from the shared `['merit-balance']` React Query cache which the poll invalidates.                  |
| 5 | Replaying the same Stripe event\_id never produces a second credit\_shop\_merits call                                                            | VERIFIED                  | `index.test.ts:1017-1072` — MER-10 axis-1: asserts `credit_shop_merits` call count === 1 after both deliveries; second response has `duplicate: true`.                                                     |
| 6 | Replaying the same payment\_intent\_id under a different event\_id has the RPC return duplicate:true, ledger credits once                        | VERIFIED                  | `index.test.ts:1074-1140` — MER-10 axis-2: asserts both RPC calls carry `p_stripe_payment_id: "pi_test_shared"` and second response body has `duplicate: true`.                                            |
| 7 | Replaying the same checkout session\_id/PI via the payment-mode checkout path returns duplicate:true and calls credit\_shop\_merits exactly once | VERIFIED                  | `index.test.ts:559-615` — MER-10 axis-3: asserts `credit_shop_merits` count === 1 after replay; second response `duplicate: true`.                                                                         |
| 8 | The webhook handler (index.ts) is NOT modified                                                                                                   | VERIFIED                  | `git status --porcelain supabase/functions/stripe-webhook-handler/index.ts` returned empty output.                                                                                                         |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact                                                  | Expected                                                                           | Status   | Details                                                                                                                                                                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/hooks/useMerits.ts`                                  | `reconcileShopCredit(snapshot)` poll helper owning `['merit-balance', userId]` key | VERIFIED | Lines 129-150: exported as part of return object and in `MeritBalance` interface at line 18; uses exact key `['merit-balance', userId]`; POLL\_INTERVAL\_MS=1500, POLL\_CEILING\_MS=10000; no `setQueryData`, no toast. |
| `src/components/topup/StripePaymentElementModal.tsx`      | Snapshot-at-submit + detached reconciliation poll                                  | VERIFIED | Line 95: `const snapshot = shop` before `confirmPayment`. Lines 110, 114: `void reconcileShopCredit(snapshot)`. No `invalidateQueries` call remains. `useQueryClient` import removed.                                   |
| `src/components/topup/StripePaymentElementModal.test.tsx` | Poll-loop coverage with fake timers                                                | VERIFIED | T7 (poll loop success), T8 (immediate close), T9 (silent timeout). All use `vi.useFakeTimers()` and `vi.advanceTimersByTimeAsync`. `toastErrorMock` present in sonner mock.                                             |
| `supabase/functions/stripe-webhook-handler/index.test.ts` | Three named MER-10 axis-1/2/3 regression tests                                     | VERIFIED | `grep -c 'MER-10 axis-' index.test.ts` = 3. All three tests present at lines 1017, 1074, 559. Each asserts exactly-once crediting on replay.                                                                            |

### Key Link Verification

| From                            | To                                            | Via                                                                     | Status | Details                                                                                                                                                   |
| ------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StripePaymentElementModal.tsx` | `useMerits.ts`                                | `useMerits().shop + reconcileShopCredit`                                | WIRED  | Line 86: `const { shop, reconcileShopCredit } = useMerits();` — both consumed                                                                             |
| `useMerits.ts`                  | React Query cache `['merit-balance', userId]` | `invalidateQueries` + `getQueryData` read-back loop                     | WIRED  | Lines 145-147: `invalidateQueries({ queryKey: ['merit-balance'] })` + `getQueryData<MeritQueryShape>(['merit-balance', userId])` with exact key           |
| `index.test.ts`                 | `index.ts`                                    | `handleStripeWebhook(req, { supabase, stripe })` deps-injection seam    | WIRED  | Lines 1044, 1107-1108, 1116, 583, 599: all three axis tests invoke `handleStripeWebhook` through the deps-injection seam                                  |
| `index.test.ts`                 | `_shared/test-helpers/stripe-fixtures.ts`     | `makePaymentIntentSucceededEvent` / `makeCheckoutSessionCompletedEvent` | WIRED  | Axis-1/2 use `makePaymentIntentSucceededEvent` with controllable `eventId`/`piId`; axis-3 uses `makeCheckoutSessionCompletedEvent` with `mode: "payment"` |

### Data-Flow Trace (Level 4)

| Artifact                           | Data Variable            | Source                                                                 | Produces Real Data                                         | Status  |
| ---------------------------------- | ------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------- | ------- |
| `StripePaymentElementModal.tsx`    | `shop` (snapshot)        | `useMerits().shop` ← `balance.shop_balance` ← `get_merit_balance` RPC  | Yes — existing RPC query; poll triggers invalidate→refetch | FLOWING |
| `useMerits.ts reconcileShopCredit` | `shop_balance` read-back | `queryClient.getQueryData<MeritQueryShape>(['merit-balance', userId])` | Yes — reads server-authored cache value from RPC refetch   | FLOWING |

### Behavioral Spot-Checks

Step 7b: Skipped for plan-02 artifacts (test-only changes, no new runnable entry points). Plan-01 modal changes require a running browser + Stripe test-mode — deferred to human verification below.

| Behavior                                             | Command                                                                                 | Result     | Status |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------- | ------ |
| `grep -c 'MER-10 axis-' index.test.ts` == 3          | `grep -c 'MER-10 axis-' supabase/functions/stripe-webhook-handler/index.test.ts`        | 3          | PASS   |
| No `invalidateQueries` remains in modal handleSubmit | `grep 'invalidateQueries' src/components/topup/StripePaymentElementModal.tsx`           | No matches | PASS   |
| `useQueryClient` import removed from modal           | `grep 'useQueryClient\|queryClient' src/components/topup/StripePaymentElementModal.tsx` | No matches | PASS   |
| `MeritBalanceHeaderV2.tsx` untouched                 | `git status --porcelain src/components/topup/MeritBalanceHeaderV2.tsx`                  | empty      | PASS   |
| `index.ts` unmodified                                | `git status --porcelain supabase/functions/stripe-webhook-handler/index.ts`             | empty      | PASS   |

### Probe Execution

Step 7c: No `probe-*.sh` files declared in either plan. Canonical run commands noted by plans are:

| Probe                   | Command                                                                                                            | Result                                                                      | Status                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Modal vitest suite      | `npx vitest run src/components/topup/StripePaymentElementModal.test.tsx`                                           | 9/9 pass (per SUMMARY-01, confirmed by test content: T1-T9 all substantive) | PASS (per SUMMARY — run confirmed by plan executor; test file is substantive)                |
| Webhook Deno test suite | `deno test --node-modules-dir=auto --allow-all --no-check supabase/functions/stripe-webhook-handler/index.test.ts` | 21 passed / 0 failed (per SUMMARY-02)                                       | PASS (per SUMMARY — test file structure and all three axis assertions verified by code read) |

Note: The verifier did not execute the test runners directly (no Deno/npm test execution in this environment). However, all test code was read and verified substantive — not stubs. The SUMMARY claims are corroborated by the actual test implementations.

### Requirements Coverage

| Requirement | Source Plan | Description                                                 | Status    | Evidence                                                                                                                                                                      |
| ----------- | ----------- | ----------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MER-07      | Plan 01     | Above-cap shop credit render (78/75)                        | SATISFIED | `reconcileShopCredit` stops polling when `shop_balance > snapshot`; T7 asserts 75→78 transition. `MeritBalanceHeaderV2` reads from the same cache — no component edit needed. |
| MER-08      | Plan 01     | 10s reconciliation window + toast copy                      | SATISFIED | POLL\_CEILING\_MS=10000ms; toast.info(`"Merits processing — they'll appear shortly"`) at line 113; detached poll; modal closes immediately (D-04).                            |
| MER-10      | Plan 02     | Webhook idempotency triple-defense regression               | SATISFIED | Three named `MER-10 axis-1/2/3` tests in `index.test.ts` each assert exactly-once `credit_shop_merits` on replay.                                                             |
| TEST-03     | Plan 02     | Stripe shop credit regression test (automated, CI-friendly) | SATISFIED | Deno test file is deterministic, deps-injected (no real Stripe/Supabase), and greppable (`MER-10 axis-`). Runnable via `.\scripts\run-edge-tests.ps1`.                        |

### Anti-Patterns Found

| File       | Line | Pattern | Severity | Impact |
| ---------- | ---- | ------- | -------- | ------ |
| None found | —    | —       | —        | —      |

No `TBD`, `FIXME`, `XXX`, `TODO`, or `PLACEHOLDER` markers in any of the three modified files. No stub return patterns. No hardcoded empty data that flows to rendering.

### Human Verification Required

#### 1. At-Cap Purchase End-to-End (MER-07 + MER-08)

**Test:** Log in as a Pro user with exactly 75/75 merits. Open the top-up modal, purchase a 3-pack via Stripe test-mode card (`4242 4242 4242 4242`). Observe the merit balance header.
**Expected:** Modal closes immediately after Stripe confirmation. Within 10 seconds the header updates from 75/75 to 78/75. No bonus chip appears. No error toast fires.
**Why human:** The poll's real-world correctness depends on actual webhook delivery latency from Stripe to `credit_shop_merits`. The automated tests drive this with fake timers against a mocked cache; real network latency and webhook sequencing cannot be replicated programmatically.

#### 2. Processing-Status Path (MER-08 toast copy)

**Test:** Trigger a Stripe payment that reaches `processing` status (use a bank redirect test card if available in test mode). Observe the toast and header behavior.
**Expected:** Toast reads exactly "Merits processing — they'll appear shortly" (not the old "Processing… your merits will appear shortly."). Modal closes immediately. Header updates when the webhook eventually lands.
**Why human:** The `processing` status path requires a real Stripe payment that does not immediately resolve to `succeeded`.

### Gaps Summary

No gaps found. All 8 must-have truths verified. All 4 required artifacts are present, substantive, and wired. No blocking anti-patterns. Requirements MER-07, MER-08, MER-10, and TEST-03 are all satisfied by the codebase evidence.

The prior `human_needed` status is closed by operator smoke attestation on 2026-06-08. The live end-to-end purchase flow and processing-status path were tested by the user and reported working properly.

## Operator Smoke Closure 2026-06-08

| Smoke | Requirement | Result |
| --- | --- | --- |
| At-cap Pro user buys a 3-pack via Stripe test-mode; balance reaches `78 / 75` within 10s, no bonus chip, no manual refresh | MER-07, MER-08 | PASS per operator attestation |
| Processing-status payment path shows `Merits processing - they'll appear shortly`, closes modal immediately, and updates when credit lands | MER-08 | PASS per operator attestation |

No implementation files or tests were changed for this closure pass.

***

_Verified: 2026-05-20_
_Verifier: Claude (gsd-verifier)_

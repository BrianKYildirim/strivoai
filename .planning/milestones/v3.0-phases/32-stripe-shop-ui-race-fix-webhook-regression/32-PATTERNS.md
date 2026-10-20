# Phase 32: Stripe Shop UI Race Fix + Webhook Regression - Pattern Map

**Mapped:** 2026-05-20
**Files analyzed:** 6 (2 modified, 1 extended test, 1 confirm-no-edit, 1 system-under-test, 1 new test)
**Analogs found:** 6 / 6 (all in-repo — this is a small, well-scoped change against existing code)

> Key finding: every pattern this phase needs already exists in the files in scope.
> The poll, the toast, the snapshot, and the entire Deno idempotency harness all have
> direct analogs in code already shipped. The planner should treat this as an **extend +
> verify** phase, not a build-from-scratch phase.

## File Classification

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/components/topup/StripePaymentElementModal.tsx` (modify) | component (modal + form) | request-response → poll | itself (lines 81-104) + `useMerits.optimisticDeduct` polling discipline | self / exact |
| `src/components/topup/StripePaymentElementModal.test.tsx` (extend) | test (vitest, RTL) | event-driven (mocked Stripe) | itself, T4/T6 (lines 99-175) | self / exact |
| `src/hooks/useMerits.ts` (read-only source) | hook (React Query) | CRUD read (RPC) | itself (lines 36-68) | self / exact |
| `src/components/topup/MeritBalanceHeaderV2.tsx` (CONFIRM NO EDIT) | component (display) | request-response (read) | itself | self / exact |
| `supabase/functions/stripe-webhook-handler/index.ts` (system under test, NOT modified) | edge function (webhook) | event-driven | itself (lines 162-206) | self / exact |
| NEW Deno regression test (D-06) | test (Deno) | event-driven (mocked Stripe + service client) | `supabase/functions/stripe-webhook-handler/index.test.ts` | exact (same harness) |

---

## Pattern Assignments

### `src/components/topup/StripePaymentElementModal.tsx` (component, request-response → poll)

**Analog:** itself — the race site is `PaymentForm.handleSubmit` lines 81-104. The change
replaces the single `invalidateQueries` (line 96 / line 100) with a snapshot + poll loop.

**Current race site** (`StripePaymentElementModal.tsx:94-102`):
```typescript
if (paymentIntent?.status === 'succeeded') {
  toast.success(`${pack.merits} Merits added. Enjoy your career momentum.`);
  queryClient.invalidateQueries({ queryKey: ['merit-balance'] });   // ← fire-and-forget; webhook write often not landed
  onSuccess();
} else if (paymentIntent?.status === 'processing') {
  toast.info('Processing… your merits will appear shortly.');
  queryClient.invalidateQueries({ queryKey: ['merit-balance'] });
  onSuccess();
}
```

**Toast pattern to keep** (lines 95, 99): `toast.success(...)` / `toast.info(...)` from
`sonner` (imported line 34). MER-08 canonical copy is **"Merits processing — they'll appear
shortly"** — line 99 currently reads "Processing… your merits will appear shortly." Align or
confirm variance during planning (CONTEXT specifics, line 91).

**Snapshot source pattern** — read the pre-confirm `shop_balance` from `useMerits()` (D-03).
`useMerits` exposes `shop` directly (`useMerits.ts:66`, `shop: balance.shop_balance ?? 0`).
Per CONTEXT Claude's-Discretion, wiring is an implementation detail; the *value* is `shop` and
the *timing* is at "Confirm purchase" click. `PaymentForm` is the natural capture point — call
`const { shop } = useMerits()` (or thread it via the existing `useMerits` consumer) and snapshot
`shop` at submit time, BEFORE `confirmPayment` resolves.

**Polling pattern to introduce** — the codebase's established refetch primitive is
`queryClient.invalidateQueries({ queryKey: ['merit-balance'] })` (used at modal:96,100 and in
`useMerits.optimisticDeduct` commit/rollback, `useMerits.ts:101,105,127`). The poll loop should
repeatedly invalidate **and read back** the cached `shop_balance` until it exceeds the snapshot
or 10s elapses. Read-back uses the same key shape `useMerits.optimisticDeduct` uses:
```typescript
// from useMerits.ts:84-87 — the canonical way to READ the cached balance
const key = ['merit-balance', userId] as const;
const previous = queryClient.getQueryData<MeritQueryShape>(key);
const prevShop = previous?.balance?.shop_balance;   // ← compare against snapshot
```
Stop condition (D-03): `shop_balance > snapshot`. Ceiling (D-04/D-05): 10s. On timeout, do
**nothing** — no error toast; `staleTime: 5_000` + `refetchOnWindowFocus: true` (useMerits.ts:58-59)
provide the eventual-consistency fallback.

**UX sequence** (D-04): on `succeeded` OR `processing` → show processing toast → `onSuccess()`
(closes modal immediately, see `onSuccess: () => onOpenChange(false)` at modal:160) → poll runs
detached and lets the shared `['merit-balance']` query update `MeritBalanceHeaderV2` live.

> Note: `userId` is needed for the full query key `['merit-balance', userId]`. `useMerits`
> resolves it internally (useMerits.ts:23-34) but does NOT export it. The component-level
> invalidate at modal:96 uses the partial key `['merit-balance']` (prefix match — valid for
> invalidate but NOT for `getQueryData`, which needs the exact key). The planner must decide
> how the poll reads back: either (a) invalidate by prefix + re-read via a `useMerits` value
> that re-renders, or (b) expose `userId`/a `getShopBalance()` helper from `useMerits`. This is
> the one genuine wiring decision (CONTEXT Claude's-Discretion).

---

### `src/components/topup/StripePaymentElementModal.test.tsx` (test, vitest + RTL)

**Analog:** itself — T4 (succeeded, lines 99-128) and T6 (processing, lines 151-175) are the
exact cases to extend for the poll loop.

**Established mock scaffolding** (lines 19-49) — reuse verbatim:
```typescript
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn(() => Promise.resolve({ __fake: true })) }));
const confirmPaymentMock = vi.fn();
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }) => React.createElement('div', { 'data-testid': 'stripe-elements' }, children),
  PaymentElement: () => React.createElement('div', { 'data-testid': 'payment-element' }),
  useStripe: () => ({ confirmPayment: confirmPaymentMock }),
  useElements: () => ({}),
}));
const toastSuccessMock = vi.fn();
const toastInfoMock = vi.fn();
vi.mock('sonner', () => ({ toast: { success: (m) => toastSuccessMock(m), info: (m) => toastInfoMock(m) } }));
```

**Spy pattern for invalidate assertions** (lines 105-126):
```typescript
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
// ... render under <QueryClientProvider client={qc}> ...
fireEvent.submit(screen.getByTestId('payment-element').closest('form')!);
await waitFor(() => expect(confirmPaymentMock).toHaveBeenCalledTimes(1));
expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['merit-balance'] });
```

**New coverage to add for the poll** (extend, do not replace T4/T6):
- Seed the QueryClient cache with a pre-purchase balance (`qc.setQueryData(['merit-balance', userId], { balance: { shop_balance: <snapshot> }, tier })`), then after `succeeded` assert the poll keeps refetching until a higher `shop_balance` lands. Use vitest fake timers (`vi.useFakeTimers()` / `vi.advanceTimersByTimeAsync`) to drive the interval and the 10s ceiling deterministically.
- Assert the processing toast fires and `onOpenChange(false)` is called immediately (modal closes during the window — D-04), distinct from the poll completing.
- Assert the 10s-timeout path fires **no** error toast (D-05): `expect(toastErrorMock).not.toHaveBeenCalled()` (add an `error` entry to the sonner mock if asserting absence).

---

### `src/hooks/useMerits.ts` (hook — read-only source of truth, NOT modified unless poll needs a helper)

**Analog:** itself. This is the merit-balance cache contract the poll plugs into.

**Query definition** (lines 36-60): key `['merit-balance', userId]`, `queryFn` calls
`supabase.rpc('get_merit_balance', { p_user_id })`, `staleTime: 5_000`, `refetchOnWindowFocus: true`.

**Balance shape** (lines 62-68): the RPC returns a nested `{ balance: { total, subscription_balance,
shop_balance, next_reset_date }, tier }`. The derived `shop` (line 66) is the D-03 snapshot value.
**Pitfall (documented at lines 81-92):** cache writes MUST preserve the nested `{ balance, tier }`
shape — a flat `{ total }` write makes the displayed total read 0. Any poll-side `setQueryData`
must follow the same nesting discipline `optimisticDeduct` uses (lines 89-92).

**Existing one-shot invalidator** (lines 125-128): `useInvalidateMerits()` returns
`() => queryClient.invalidateQueries({ queryKey: ['merit-balance'] })` — available for reuse, but
the poll needs a *loop*, not a one-shot, so this is a reference, not a drop-in.

---

### `src/components/topup/MeritBalanceHeaderV2.tsx` (component — CONFIRM NO EDIT)

**Analog:** itself. **Verdict: requires NO change** (D-01 confirmed).

The trigger renders a single `{total} / {cap} merits` value with **no bonus chip** (lines 48,
59-62): `const total = subscription + shop;` then `{total} / {cap}`. Because `total` is allowed to
exceed `cap` (no clamp), an at-cap Pro user (75/75) buying a 3-pack renders `78 / 75` automatically
once `shop` reconciles — zero header edits. It consumes `useMerits()` (line 33), so the poll's
refetch of `['merit-balance']` updates this component live. The planner should record this file
as a verification checkpoint (confirm no chip reintroduced), not a change target.

---

### `supabase/functions/stripe-webhook-handler/index.ts` (edge function — SYSTEM UNDER TEST, NOT modified)

**Analog:** itself. **Verdict: NOT modified** (D-06 — verify, don't rebuild).

**Triple-defense idempotency to regression-test** (MER-10):
1. **Axis 1 — `event_id` (insert-first)** lines 162-179: insert into `stripe_webhook_events`; catch
   Postgres `23505` → `200 { duplicate: true }`; non-23505 → `500`. Cleanup-on-non-2xx delete at
   lines 188-206 so transient failures can be retried.
2. **Axis 2 — `payment_intent_id`** lines 829-847: `credit_shop_merits` RPC is the gate; the RPC's
   `merit_shop_purchases.stripe_payment_intent_id` UNIQUE pre-check returns `{ duplicate: true }`
   when the same PI arrives under a *different* event_id. Handler surfaces it as `body.duplicate`.
3. **Axis 3 — checkout `session_id` / PI via checkout** lines 541-565: payment-mode checkout path
   calls the same `credit_shop_merits` keyed on `session.payment_intent`.

The deps-injection seam is the test entry point: `handleStripeWebhook(req, { supabase, stripe })`
(lines 101-104; production uses `getServiceClient()` + `getStripeClient()` fallbacks at 129, 160).

---

### NEW Deno regression test (D-06) — `supabase/functions/stripe-webhook-handler/`

**Analog:** `supabase/functions/stripe-webhook-handler/index.test.ts` — **exact harness match.**
The three idempotency axes D-06 demands are ALREADY tested here. The planner should decide whether
D-06 is satisfied by (a) confirming/strengthening the existing tests, or (b) adding a focused new
test file that imports the same helpers. Either way, copy this scaffolding.

**Test file header / run command** (lines 1-15):
```
deno test --allow-env --allow-read --allow-net --no-check \
  supabase/functions/stripe-webhook-handler/index.test.ts
```
(Also runnable via `.\scripts\run-edge-tests.ps1` per README.)

**Fixture imports** (lines 16-31): `makePaymentIntentSucceededEvent`,
`makeCheckoutSessionCompletedEvent` et al. from `../_shared/test-helpers/stripe-fixtures.ts`.
`makePaymentIntentSucceededEvent({ user_id, pack_id, eventId, piId })` (fixtures lines 297-341)
lets you control `eventId` and `piId` independently — exactly what the three-axis replay needs.

**Mocked service client** (`createFakeSupabase`, lines 119-244): records `rpcCalls`, `insertCalls`,
`updateCalls`; `seenEventIds` simulates the `stripe_webhook_events` UNIQUE constraint (returns
`{ error: { code: '23505' } }` on replay, lines 138-140); `rpcData` lets you stub
`credit_shop_merits` returning `{ duplicate: true }` (axis 2/3).

**Mocked Stripe** (`createFakeStripe`, lines 262-300): `webhooks.constructEventAsync` returns
`JSON.parse(rawBody)` (or throws on `rejectSignature`); `subscriptions.retrieve` is stubbed.

**Request builder** (lines 304-320): `buildWebhookRequest(event)` adds the `stripe-signature` header.

**The three D-06 axes — already present as analogs to copy/strengthen:**
- **Axis 1 (same `event_id`):** `"Phase 24 TOPUP-02: same event id replayed returns duplicate without second RPC"` (lines 1009-1064) — asserts exactly ONE `credit_shop_merits` call after replay. Also the subscription-mode `"test-08-duplicate-event-no-double-credit"` (lines 415-466).
- **Axis 2 (same `payment_intent_id`, different event_id):** `"same PI across two event ids — second RPC returns duplicate: true"` (lines 1066-1128) — both events reach the RPC, RPC returns `duplicate:true` on the second via the `merit_shop_purchases` UNIQUE pre-check.
- **Axis 3 (checkout `session_id`/PI):** `"shop-credit-duplicate-pi-noop"` (lines 559-607) — payment-mode checkout replay returns `duplicate:true`, RPC called once.

**First-test sanitizer caveat** (lines 327-331): the first imported test must set
`sanitizeResources: false, sanitizeOps: false` because `Deno.serve()` runs at module scope
(`index.ts:890`) and creates an uncloseable listener. Copy this on the first `Deno.test` in any new file.

---

## Shared Patterns

### Toasts (frontend)
**Source:** `StripePaymentElementModal.tsx:34, 95, 99` — `import { toast } from 'sonner'`, then
`toast.success(msg)` / `toast.info(msg)`. **Apply to:** the reconciliation processing toast (D-04).
No new toast infra; reuse `toast.info` for the processing message.

### React Query merit-balance cache contract
**Source:** `useMerits.ts:37` (key `['merit-balance', userId]`), `:62-68` (nested
`{ balance: { shop_balance, ... }, tier }` shape), `:84-92` (read/write discipline).
**Apply to:** the poll's read-back and any optimistic write. Never flatten the shape (Pitfall, :81-92).

### Webhook idempotency (insert-first + cleanup-on-non-2xx)
**Source:** `stripe-webhook-handler/index.ts:162-206`. **Apply to:** regression assertions only —
this phase verifies, does not modify. The contract: 23505 → 200 duplicate, non-2xx → delete row so
Stripe retry can re-enter.

### Deno webhook test harness (deps-injected fakes)
**Source:** `stripe-webhook-handler/index.test.ts:119-320` + `_shared/test-helpers/stripe-fixtures.ts`.
**Apply to:** the D-06 regression. `createFakeSupabase` / `createFakeStripe` / `buildWebhookRequest` /
`makePaymentIntentSucceededEvent` are the complete kit — copy, don't reinvent.

---

## No Analog Found

None. Every file in scope has an exact in-repo analog (usually itself or its sibling test). There
is no need to fall back to RESEARCH.md patterns — and there is no RESEARCH.md for this phase.

## Metadata

**Analog search scope:** `src/components/topup/`, `src/hooks/`, `supabase/functions/stripe-webhook-handler/`, `supabase/functions/_shared/test-helpers/`
**Files scanned:** 7 (6 in-scope + `stripe-fixtures.ts`); 1 Glob over `supabase/functions/**/*test*.ts` to confirm the closest Deno analog
**Pattern extraction date:** 2026-05-20

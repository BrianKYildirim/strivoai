---
phase: 24
plan: 06
subsystem: pricing-merit-economy
tags: [topup, stripe, payment-intent, merits, ui, tdd]
requires: [24-01, 24-02, 24-04, 24-05]
provides:
  - create-payment-intent edge function (TOPUP-03, SHOP-11)
  - useCreatePaymentIntent React hook
  - StripePaymentElementModal (D-23 embedded PaymentElement)
  - TopUpProvider (global 'topup:open' CustomEvent listener)
  - OutOfMeritsModalV2 (SC-9a)
  - HeaderTopUpTrigger (SC-9b)
  - MeritBalanceHeaderV2 (SC-10)
  - RunningLowCard (SC-9c)
  - useOutOfMeritsModal consumer-side hook
affects:
  - src/App.tsx (TopUpProvider mounted inside BrowserRouter)
  - src/components/TopBar.tsx (MeritBalanceBadge → MeritBalanceHeaderV2 + HeaderTopUpTrigger)
  - src/pages/Dashboard.tsx (RunningLowCard mounted above header block)
  - src/config/pricing-config.ts (added PACKS_BY_ID + PackId exports)
  - src/hooks/useMerits.ts (D-08 cap/tier surface + 20%-of-cap isLow formula)
tech-stack:
  added: []
  patterns:
    - Deps-injected handler pattern for edge function unit tests (same as create-checkout-session)
    - Global CustomEvent bus ('topup:open') for cross-cutting modal mount
    - Module-scope loadStripe singleton (matches StripeCheckoutWrapper)
    - PACKS_BY_ID frozen lookup derived from PACK_CATALOG (D-01/D-02 single-source-of-truth)
key-files:
  created:
    - supabase/functions/create-payment-intent/index.ts
    - supabase/functions/create-payment-intent/index.test.ts
    - src/hooks/useCreatePaymentIntent.ts
    - src/hooks/useCreatePaymentIntent.test.ts
    - src/hooks/useOutOfMeritsModal.ts
    - src/components/topup/StripePaymentElementModal.tsx
    - src/components/topup/StripePaymentElementModal.test.tsx
    - src/components/topup/TopUpProvider.tsx
    - src/components/topup/TopUpProvider.test.tsx
    - src/components/topup/OutOfMeritsModalV2.tsx
    - src/components/topup/OutOfMeritsModalV2.test.tsx
    - src/components/topup/HeaderTopUpTrigger.tsx
    - src/components/topup/HeaderTopUpTrigger.test.tsx
    - src/components/topup/MeritBalanceHeaderV2.tsx
    - src/components/topup/MeritBalanceHeaderV2.test.tsx
    - src/components/topup/RunningLowCard.tsx
    - src/components/topup/RunningLowCard.test.tsx
  modified:
    - src/App.tsx
    - src/components/TopBar.tsx
    - src/pages/Dashboard.tsx
    - src/config/pricing-config.ts
    - src/hooks/useMerits.ts
    - src/hooks/useMerits.test.ts
decisions:
  - Additive useOutOfMeritsModal hook rather than rewriting usePaywallGuard (keeps the Phase 20 lifetime-limit UpgradeModal surface intact; feature-gated 402 flows bind to the new hook)
  - MeritBalanceBadge kept on disk even though its use-site was swapped (plan acceptance criteria; Plan 07 audit may clean it up)
  - Deno tests require `--node-modules-dir=auto` locally to resolve `npm:stripe@14`; same constraint as the sibling create-checkout-session tests
metrics:
  commits: 6
  tasks_completed: 4
  tasks_deferred: 1  # Task 5 browser checkpoint — no local browser in this worktree
  tests_added: 50
  duration_minutes: ~55
---

# Phase 24 Plan 06: Top-Up Pack Purchase Flow Summary

Ships the end-to-end top-up purchase path (TOPUP-03/05, SHOP-11, SC-9a/b/c, SC-10): a Stripe PaymentIntent edge function, an embedded PaymentElement modal wired through a global CustomEvent listener, and four UI surfaces (out-of-merits modal, header '+' trigger, header merit balance V2, dashboard running-low card) that read from the D-08 20%-of-cap isLow signal.

## One-liner

Embedded Stripe PaymentElement top-up flow with global `topup:open` event bus and SC-9a/b/c/10 UI surfaces reading `useMerits` (D-08).

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Prelim | `d351d70` | feat(24-06): add PACKS_BY_ID/PackId + D-08 useMerits cap/tier surface |
| 1 | `23aac34` | feat(24-06): add create-payment-intent edge function + 9 deps-injected tests |
| 2 | `50ef9bd` | feat(24-06): add useCreatePaymentIntent hook + StripePaymentElementModal + TopUpProvider |
| 3 | `3b1f9bd` | feat(24-06): add OutOfMeritsModalV2 + HeaderTopUpTrigger + MeritBalanceHeaderV2 + RunningLowCard |
| 4 | `94601f8` | feat(24-06): wire TopUpProvider + MeritBalanceHeaderV2 + HeaderTopUpTrigger + RunningLowCard + useOutOfMeritsModal |

## Tasks

### Task 1 — create-payment-intent edge function ✅

- POST `{ pack_id }` → 200 `{ clientSecret, paymentIntentId }`
- Validates pack_id against PACKS_BY_ID (dual-imported from src/config/pricing-config.ts per D-02)
- `metadata: { user_id, pack_id, pack_size }` so the Plan 02 webhook can credit Merits idempotently via `credit_shop_merits(p_user_id, p_pack_size, p_stripe_payment_id)`
- `automatic_payment_methods: { enabled: true }` (required for embedded PaymentElement)
- Rate limit 10/hr across all tiers (matches SHOP-12 payment branch shape)
- Lazy Stripe customer creation (D-21 parity with create-checkout-session)
- Fail-closed on Stripe error: bare `{ error: 'payment_intent_creation_failed' }`, no stack in body (D-27, T-24-28)
- **9 Deno tests**: happy-path, method-guard (GET→405), auth-propagation (401 Response), rate-limit (429+Retry-After), invalid pack_id (`pack_99`→400), missing body (400), lazy customer (profile update verified), fail-closed (500, no stack), OPTIONS preflight.

**Verified**: `deno test --allow-env --allow-net --node-modules-dir=auto` → 9 passed.

### Task 2 — useCreatePaymentIntent + StripePaymentElementModal + TopUpProvider ✅

**useCreatePaymentIntent** (src/hooks/useCreatePaymentIntent.ts): invokes `create-payment-intent` edge fn, returns `{ clientSecret, paymentIntentId }` or null + toast.error. Models on `useStripeCheckout` verbatim, swapping the invoke target.

**StripePaymentElementModal** (src/components/topup/StripePaymentElementModal.tsx): Dialog + `<Elements>` + `<PaymentElement>` (D-23 embedded path — NOT EmbeddedCheckoutProvider which is subscription-only). On `confirmPayment { paymentIntent.status === 'succeeded' }` fires toast.success with pack.merits copy, calls `queryClient.invalidateQueries(['merit-balance'])`, closes the dialog. `processing` status gets the "merits will appear shortly" info toast + invalidate + close. Error lets Stripe's inline PaymentElement error UI own the surface.

**TopUpProvider** (src/components/topup/TopUpProvider.tsx): listens for `window.dispatchEvent(new CustomEvent('topup:open', { detail: { packId } }))`. Validates packId via `isPackId` guard (defense-in-depth; invalid events get a console.warn and don't mount the modal). Unmount cleanly removes the listener.

**16 vitest tests** (5 hook + 6 modal + 5 provider) — all passing.

### Task 3 — 4 UI components ✅

**OutOfMeritsModalV2** (SC-9a): "Out of Merits" dialog, primary `Buy a top-up pack` → `/pricing#packs`, secondary `Upgrade plan` → `/pricing`. CTA order is fixed per UI-SPEC (top-up is the immediate remediation). Uses `variant="boxy"` for primary, `variant="boxy-outline"` for secondary (D-18).

**HeaderTopUpTrigger** (SC-9b): '+' icon Button with `aria-label="Buy more merits"`, visible only when `useMerits.isLow=true`. Self-hides when `isLoading` OR `location.pathname === '/pricing'` (UI-SPEC anti-redundancy).

**MeritBalanceHeaderV2** (SC-10): renders `"{subscription} / {cap}"` in `font-mono` (JetBrains Mono via Plan 05 tailwind extension) with `"merits"` suffix or `"+ {shop} bonus"` suffix depending on `shop > 0`. Popover body preserves the Phase 20 breakdown (monthly / top-up / total / reset date / Buy merits · Change plan links). Skeleton during isLoading.

**RunningLowCard** (SC-9c): glassmorphism dashboard card, self-hides when `!isLow`. Price + per-merit read from `PACKS_BY_ID.pack_25` (D-01/D-02 — no hardcoded $9.99 / $0.40 literals). Primary `Buy {N} Merits` → `/pricing#packs`, secondary `Or upgrade your plan →` → `/pricing`.

**24 vitest tests** (5 + 7 + 5 + 7) — all passing.

### Task 4 — Wiring ✅

- **src/App.tsx**: imported `TopUpProvider` and wrapped `<Routes>` inside it (inside `<BrowserRouter>` + `<QueryClientProvider>` — both providers are ancestors so the modal can invalidate queries and the CustomEvent reaches it from any route).
- **src/components/TopBar.tsx**: swapped `<MeritBalanceBadge />` → `<MeritBalanceHeaderV2 />` + sibling `<HeaderTopUpTrigger />`. MeritBalanceBadge file kept on disk (Phase 20 analog retained per plan acceptance criteria).
- **src/pages/Dashboard.tsx**: imported `RunningLowCard` and mounted it at the top of the returned JSX, above the header block. Component self-hides when `!isLow` — no layout shift for healthy balances.
- **src/hooks/useOutOfMeritsModal.ts**: additive hook exposing `{ isOpen, openModal, closeModal, modalProps }` so feature-gated flows that hit 402 `insufficient_merits` can bind to `OutOfMeritsModalV2` without touching `usePaywallGuard`'s existing lifetime-limit UpgradeModal surface.

Done-gate greps pass:
- `rg "TopUpProvider" src/App.tsx` → 3 (import + open + close tags)
- `rg "MeritBalanceHeaderV2" src/components/TopBar.tsx` → 2; `rg "MeritBalanceBadge" src/components/TopBar.tsx` → 0
- `rg "HeaderTopUpTrigger" src/components/TopBar.tsx` → 2
- `rg "RunningLowCard" src/pages/Dashboard.tsx` → 2
- `rg "OutOfMeritsModalV2" src/hooks/useOutOfMeritsModal.ts` → 5

### Task 5 — Browser checkpoint (Deferred)

The plan's Task 5 is a `checkpoint:human-verify` browser smoke test (open `/pricing`, click Buy 25 Merits, confirm PaymentElement appears; open out-of-merits modal; verify header '+' and running-low card). This worktree has no local browser and the run is flagged `autonomous: true` in the plan frontmatter, so per the plan's success-criteria clause the visual verification is deferred to the phase-level UI review rather than blocking commit.

Type-check of the app (`npx tsc --noEmit -p tsconfig.app.json`) shows zero errors on Plan 06 files. Pre-existing errors in `CareerCompass.tsx`, `Dashboard.tsx` pagination handlers, and `SkillsGapAnalysis.tsx` are out of scope (not caused by this plan's changes) — logged for later cleanup.

## Deviations from Plan

### Preliminary — Missing upstream types (Rule 3 blocking)

**Found during**: Plan entry (before Task 1)
**Issue**: Plan 06 assumes `PACKS_BY_ID` + `PackId` exports from Plan 01 and `useMerits.cap` + `useMerits.tier` from Plan 04, but those commits were on a sibling branch not in this worktree's base. Any Task 1+ edit would fail to typecheck.
**Fix**: Single preliminary commit (`d351d70`) folds in the minimum required subset — `PackId` union type, `PACKS_BY_ID` lookup derived from `PACK_CATALOG`, Plan 04's `useMerits` with parallel profile fetch and D-08 `subscription / cap <= 0.2` formula, plus the boundary-value test suite. All 10 useMerits tests pass on first run.
**Files**: src/config/pricing-config.ts, src/hooks/useMerits.ts, src/hooks/useMerits.test.ts
**Commit**: `d351d70`

### Task 4 — Minimum-viable paywall rewire (Rule 2)

**Found during**: Task 4
**Issue**: Plan suggests rewiring `usePaywallGuard` directly, but that hook serves lifetime-limit flows (UpgradeModal surface) that aren't 402 `insufficient_merits`. Rewriting it would conflate two different gating semantics.
**Fix**: Additive `src/hooks/useOutOfMeritsModal.ts` hook. Feature-gated flows bind to this new hook; the UpgradeModal path stays untouched. The done-gate grep (`rg "OutOfMeritsModalV2" src/hooks/useOutOfMeritsModal.ts`) returns 5 matches, satisfying the plan criterion.
**Rule**: Rule 2 — missing critical functionality with additive surface to avoid breaking existing consumers.

### Task 1 — Deno test local environment

**Found during**: Task 1 verification
**Issue**: Running `deno test supabase/functions/create-payment-intent/index.test.ts` locally failed because `npm:stripe@14` resolution requires node_modules. Sibling `create-checkout-session/index.test.ts` exhibits the same behavior on this machine.
**Fix**: Added `--node-modules-dir=auto` flag to local test run. This is a local-environment constraint, not a test defect. CI / the Supabase Deno runtime resolves npm: specifiers directly. Documented in Decisions.

## Test Summary

| File | Tests | Status |
|------|-------|--------|
| supabase/functions/create-payment-intent/index.test.ts | 9 | ✅ pass |
| src/hooks/useMerits.test.ts (Plan 04 fold-in) | 10 | ✅ pass |
| src/hooks/useCreatePaymentIntent.test.ts | 5 | ✅ pass |
| src/components/topup/StripePaymentElementModal.test.tsx | 6 | ✅ pass |
| src/components/topup/TopUpProvider.test.tsx | 5 | ✅ pass |
| src/components/topup/OutOfMeritsModalV2.test.tsx | 5 | ✅ pass |
| src/components/topup/HeaderTopUpTrigger.test.tsx | 7 | ✅ pass |
| src/components/topup/MeritBalanceHeaderV2.test.tsx | 5 | ✅ pass |
| src/components/topup/RunningLowCard.test.tsx | 7 | ✅ pass |
| **Total** | **59** | **✅ 59/59** |

## Known Stubs

None. All components read real data from `useMerits` (which queries Supabase via `get_merit_balance` RPC + `profiles.subscription_tier`); all price values come from `PACKS_BY_ID`; all navigation targets are real routes in `App.tsx`.

## Deferred Issues

Pre-existing TypeScript errors unrelated to Plan 06 (out-of-scope per scope-boundary rule — do not fix in this plan):
- `src/pages/CareerCompass.tsx` lines 509, 580, 932 — string-literal union narrowing + MouseEventHandler shape
- `src/pages/Dashboard.tsx` lines 347, 413 — `fetchNextPage` wired directly as onClick handler (shape mismatch)
- `src/pages/SkillsGapAnalysis.tsx` lines 404, 419, 515 — missing `Navbar` import

## Self-Check

**Files created**:
- `supabase/functions/create-payment-intent/index.ts` ✅ FOUND
- `supabase/functions/create-payment-intent/index.test.ts` ✅ FOUND
- `src/hooks/useCreatePaymentIntent.ts` ✅ FOUND
- `src/hooks/useCreatePaymentIntent.test.ts` ✅ FOUND
- `src/hooks/useOutOfMeritsModal.ts` ✅ FOUND
- `src/components/topup/StripePaymentElementModal.tsx` ✅ FOUND
- `src/components/topup/StripePaymentElementModal.test.tsx` ✅ FOUND
- `src/components/topup/TopUpProvider.tsx` ✅ FOUND
- `src/components/topup/TopUpProvider.test.tsx` ✅ FOUND
- `src/components/topup/OutOfMeritsModalV2.tsx` ✅ FOUND
- `src/components/topup/OutOfMeritsModalV2.test.tsx` ✅ FOUND
- `src/components/topup/HeaderTopUpTrigger.tsx` ✅ FOUND
- `src/components/topup/HeaderTopUpTrigger.test.tsx` ✅ FOUND
- `src/components/topup/MeritBalanceHeaderV2.tsx` ✅ FOUND
- `src/components/topup/MeritBalanceHeaderV2.test.tsx` ✅ FOUND
- `src/components/topup/RunningLowCard.tsx` ✅ FOUND
- `src/components/topup/RunningLowCard.test.tsx` ✅ FOUND

**Commits**:
- `d351d70` ✅ FOUND
- `23aac34` ✅ FOUND
- `50ef9bd` ✅ FOUND
- `3b1f9bd` ✅ FOUND
- `94601f8` ✅ FOUND

## Self-Check: PASSED

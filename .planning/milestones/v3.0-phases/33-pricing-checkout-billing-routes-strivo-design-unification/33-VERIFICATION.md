---
phase: 33-pricing-checkout-billing-routes-strivo-design-unification
verified: 2026-05-22T02:04:05Z
status: passed
score: 4/4 must-haves verified
re_verification: false
gaps: []
human_verification: []
---

# Phase 33: Pricing / Checkout / Billing Routes + Strivo Design Unification Verification Report

**Phase Goal:** Fix the `/pricing` Upgrade button's `404 /checkout` bug, fix `/settings/billing` infinite-spinner bug, wire customer portal, restyle `/pricing` to Strivo's "Institutional Intelligence" design tokens, and verify subscription upgrade flows end-to-end.
**Verified:** 2026-05-22T02:04:05Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `/pricing` paid tier CTAs start a working Stripe subscription path, and the Free CTA routes to signup. | VERIFIED | `Pricing.tsx` routes Free to `/auth`, invokes `create-checkout-session` for paid tiers with `ui_mode: 'embedded'`, opens `StripeCheckoutWrapper` on `clientSecret`, routes swap responses to `/dashboard?checkout=complete`, and contains no `/checkout` navigation. `Pricing.test.tsx` passed in the focused Vitest run. |
| 2 | `/settings/billing` renders without the infinite spinner failure and exposes a working Stripe customer portal path. | VERIFIED | `Billing.tsx` uses `.maybeSingle()`, has an explicit null-user branch before the spinner, user-scopes purchase history, conditionally renders "Manage Subscription", and invokes `create-stripe-portal`. `create-stripe-portal/index.ts` resolves the customer from `ctx.userId` and returns to `/settings/billing`. `Billing.test.tsx` and the portal Deno suite passed. |
| 3 | Subscription upgrade flows reconcile tier and merit state after checkout, including Pro->Elite without a second active subscription. | VERIFIED | `create-checkout-session/index.ts` swaps existing subscription items with `subscriptions.update`, guards missing item IDs, and returns `{ mode: "swap" }`; `Dashboard.tsx` handles `?checkout=complete`; `useMerits.ts` exposes `reconcileTierUpgrade`; the TEST-07 checklist records Free->Pro, Free->Elite, Pro->Elite, and shop pack flows as PASS with one active subscription after Pro->Elite. |
| 4 | `/pricing` is on Strivo semantic token surfaces with accurate pricing content and the expected current-plan, interval, savings, and pack UI. | VERIFIED | `Pricing.tsx` uses `bg-background`, `text-foreground`, and `text-muted-foreground`; pricing components no longer use `.theme-v2` or `[--...]`; `TierCardV2` receives `isCurrent={currentTier === tier}`; `BillingIntervalToggleV2` renders the savings badge; `PackSectionV2` renders `PACK_CATALOG`. `pricing-token-guard.test.ts` passed. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/pages/Pricing.tsx` | Free CTA route, paid embedded checkout, swap/portal handling, tokenized page shell | VERIFIED | Source and tests confirm the active checkout path; no dead `/checkout` navigation remains. |
| `src/pages/Settings/Billing.tsx` | No-spinner billing page, conditional Manage Subscription button, portal fallback | VERIFIED | Null session and missing profile row are handled; Stripe customer portal button is conditional and wired. |
| `supabase/functions/create-checkout-session/index.ts` | Subscription checkout, existing-subscription swap, no double billing | VERIFIED | Deno suite passed; swap branch updates the existing subscription item and never creates a second checkout session for existing subscribers. |
| `supabase/functions/create-stripe-portal/index.ts` | Customer portal session with safe server-side customer lookup and live return URL | VERIFIED | Deno suite passed; customer lookup is `ctx.userId` scoped and `return_url` is `/settings/billing`. |
| `src/pages/Dashboard.tsx` and `src/hooks/useMerits.ts` | Post-upgrade reconciliation polling | VERIFIED | React tests cover `?checkout=complete` reconciliation and `reconcileTierUpgrade` poll behavior. |
| `src/components/pricing/*` | Pricing token migration, current-plan highlight, interval toggle, 4 pack cards | VERIFIED | Static token guard and Pricing tests passed. |
| `.planning/.../33-TEST-07-CHECKLIST.md` | Operator artifact for live Stripe-boundary checks | VERIFIED | All four live staging flows are recorded PASS, including one active subscription after Pro->Elite. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `Pricing.tsx` | `create-checkout-session` | `supabase.functions.invoke('create-checkout-session', { body: { mode: 'subscription', tier, interval, ui_mode: 'embedded' } })` | VERIFIED | Covered by `Pricing.test.tsx` and checkout Deno suite. |
| `Pricing.tsx` | `StripeCheckoutWrapper` | `data.clientSecret` sets modal state | VERIFIED | Net-new subscriber path opens the embedded checkout modal. |
| `Pricing.tsx` | `create-stripe-portal` | `portal_required` branch invokes portal function | VERIFIED | Covered by `Pricing.test.tsx`; portal function suite passed. |
| `Billing.tsx` | `create-stripe-portal` | Manage Subscription button invokes portal function and redirects to `data.url` | VERIFIED | Covered by `Billing.test.tsx`; no client-supplied customer id is sent. |
| `create-stripe-portal/index.ts` | `/settings/billing` | Stripe Billing Portal `return_url` | VERIFIED | Portal Deno test expectation now matches the live route. |
| `create-checkout-session/index.ts` | Stripe subscription item | `stripe.subscriptions.update(existingSubId, { items: [{ id: itemId, price: priceId }] })` | VERIFIED | Checkout Deno suite confirms item swap, env-resolved price, and no second session. |
| `Dashboard.tsx` | `useMerits.reconcileTierUpgrade` | `?checkout=complete` effect | VERIFIED | Dashboard tests confirm toast, one reconciliation call, and URL cleanup. |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| PRICE-01 | SATISFIED | None |
| PRICE-02 | SATISFIED | None |
| PRICE-03 | SATISFIED | None |
| PRICE-04 | SATISFIED | None |
| PRICE-05 | SATISFIED | None |
| PRICE-06 | SATISFIED | None |
| PRICE-07 | SATISFIED | None |
| PRICE-08 | SATISFIED | None |
| TEST-07 | SATISFIED | None |
| TEST-08 | SATISFIED | None |

### Verification Commands

| Command | Result |
|---------|--------|
| `npx vitest run src/pages/Pricing.test.tsx src/pages/Settings/Billing.test.tsx src/pages/Dashboard.test.tsx src/hooks/useMerits.test.ts src/pages/__tests__/pricing-token-guard.test.ts` | 5 files passed, 47 tests passed |
| `deno test --allow-env --allow-net supabase/functions/create-checkout-session/index.test.ts` | 25 passed, 0 failed |
| `deno test --allow-env --allow-net supabase/functions/create-stripe-portal/index.test.ts` | 6 passed, 0 failed |

### Verification Repairs Made

During verification, two test-infrastructure mismatches blocked normal edge-test execution and were fixed:

| File | Change | Why |
|------|--------|-----|
| `supabase/functions/create-stripe-portal/index.test.ts` | Updated the expected portal `return_url` from `/billing` to `/settings/billing`. | The production function had already moved to the live phase-33 route; the test still asserted the dead route. |
| `supabase/functions/_shared/stripe-client.ts` | Added a narrow typed constant for the pinned Stripe API version. | `stripe@14`'s TypeScript literal type lagged the runtime-accepted `2024-11-20.acacia` pin, causing normal `deno test` type-check failure before tests ran. Runtime behavior is unchanged. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/pages/Dashboard.tsx` | 42 | Snapshot tier can be captured before `useTierAccess` settles | Warning | May over-toast after manual revisit to `?checkout=complete`; does not block tier reconciliation or phase goal. |
| `src/pages/Pricing.tsx` | 27 | Unauthenticated paid-tier CTA surfaces checkout failure instead of sign-in redirect | Warning | Public-page UX follow-up; authenticated Free->paid flow is verified and TEST-07 passed. |
| `src/pages/Settings/Billing.tsx` | 51, 57, 70 | Raw amber/purple/emerald Tailwind palette classes remain in billing badges | Info | Not part of the `/pricing` token migration requirement; carry as design cleanup if desired. |

### Human Verification Required

None remaining for phase closure. The Stripe-boundary checks that cannot be automated are recorded in `33-TEST-07-CHECKLIST.md` with all four flows marked PASS in staging Stripe TEST mode.

### Gaps Summary

No blocking gaps found. Phase 33 achieved its roadmap success criteria and requirements.

---

_Verified: 2026-05-22T02:04:05Z_
_Verifier: Codex local fallback using gsd-verifier contract_

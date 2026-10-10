---
phase: 20-merit-ux-shop-pricing-and-streak-ui
reviewed: 2026-04-17T12:00:00Z
depth: standard
files_reviewed: 30
files_reviewed_list:
  - src/App.tsx
  - src/components/AppSidebar.tsx
  - src/components/DashboardHome.tsx
  - src/components/MeritBalanceBadge.tsx
  - src/components/MeritCostPreview.tsx
  - src/components/MeritShopCard.tsx
  - src/components/Navbar.tsx
  - src/components/PlanComparisonTable.tsx
  - src/components/PricingTable.tsx
  - src/components/StripeCheckoutWrapper.tsx
  - src/components/TopBar.tsx
  - src/components/UpgradeComparisonBanner.tsx
  - src/components/UpgradeModal.tsx
  - src/hooks/useFeatureCosts.ts
  - src/hooks/useMerits.ts
  - src/hooks/useResumeStream.ts
  - src/hooks/useStripeCheckout.ts
  - src/pages/CareerCompass.tsx
  - src/pages/Dashboard.tsx
  - src/pages/InterviewPrep.tsx
  - src/pages/LinkedInGrader.tsx
  - src/pages/Profile.tsx
  - src/pages/RecruitingLens.tsx
  - src/pages/Results.tsx
  - src/pages/Settings/Billing.tsx
  - src/pages/Shop.tsx
  - src/pages/SkillsGapAnalysis.tsx
  - src/pages/Upload.tsx
  - supabase/functions/create-checkout-session/index.ts
  - supabase/functions/send-strivo-email/index.ts
  - supabase/functions/stripe-webhook-handler/index.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 20: Code Review Report

**Reviewed:** 2026-04-17T12:00:00Z
**Depth:** standard
**Files Reviewed:** 30
**Status:** issues_found

## Summary

Phase 20 introduces the Merit currency system, Stripe Embedded Checkout integration, Merit Shop, and updates to feature pages to consume merit costs. The Stripe integration is well-secured: `create-checkout-session` resolves prices server-side (no client-supplied `priceId`), the webhook handler uses SDK signature verification with idempotency via a dedup table, and rate limiting is applied per-tier. The `useMerits()` and `useFeatureCosts()` hooks are correctly integrated across most feature pages.

However, one critical authorization gap was found in the Billing page's purchase history query, along with several warnings involving hardcoded tier values, duplicate navigation rendering, and a silent Stripe key fallback.

## Critical Issues

### CR-01: Purchase history query missing user_id filter -- potential data exposure

**File:** `src/pages/Settings/Billing.tsx:327-331`
**Issue:** The `merit_shop_purchases` query selects rows without filtering by the authenticated user's ID. If Row-Level Security (RLS) is not enforced on this table, or if the query runs with an elevated role, every user could see all users' purchase records.

```typescript
// Current (lines 327-331):
const { data, error } = await supabase
  .from('merit_shop_purchases')
  .select('id, pack_size, price_cents, status, created_at')
  .order('created_at', { ascending: false })
  .limit(50);
```

**Fix:** Add a `.eq('user_id', userId)` filter. Even if RLS is in place, defense-in-depth requires explicit application-level filtering:

```typescript
const { data, error } = await supabase
  .from('merit_shop_purchases')
  .select('id, pack_size, price_cents, status, created_at')
  .eq('user_id', userId!)
  .order('created_at', { ascending: false })
  .limit(50);
```

## Warnings

### WR-01: InterviewPrep hardcodes tier as 'free' for merit cost lookups

**File:** `src/pages/InterviewPrep.tsx:471,474`
**Issue:** Both the `MeritCostPreview` and the `canAfford` check call `getCostForFeature(featureCosts, 'interview_prep', 'free')`, passing the literal string `'free'` instead of the user's actual `subscriptionTier`. This means Pro and Elite users see Free-tier pricing (likely higher cost) instead of their discounted tier cost. This is inconsistent with how every other feature page (LinkedInGrader, RecruitingLens, Upload) correctly passes the actual tier.

```typescript
// Current (line 471):
<MeritCostPreview featureCost={getCostForFeature(featureCosts, 'interview_prep', 'free') ?? 0} />
// Current (line 474):
disabled={... || !canAfford(getCostForFeature(featureCosts, 'interview_prep', 'free') ?? 0)}
```

**Fix:** Use the actual subscription tier from `useTierAccess()`:

```typescript
<MeritCostPreview featureCost={getCostForFeature(featureCosts, 'interview_prep', subscriptionTier) ?? 0} />
// ...
disabled={... || !canAfford(getCostForFeature(featureCosts, 'interview_prep', subscriptionTier) ?? 0)}
```

### WR-02: Shop.tsx renders duplicate Navbar inside DashboardLayout

**File:** `src/pages/Shop.tsx:98`
**Issue:** `Shop` is wrapped in `<DashboardLayout>` in `App.tsx` (line 73), which already provides navigation via `AppSidebar` and `TopBar`. However, `Shop` also renders its own `<Navbar />` component at line 98. This results in double navigation -- the sidebar/topbar from the layout plus a full-width Navbar overlapping the content area.

**Fix:** Remove the `<Navbar />` from Shop.tsx. The `DashboardLayout` wrapper already handles navigation:

```typescript
// Remove line 98: <Navbar />
// The <div className="min-h-screen bg-background text-foreground"> wrapper
// should also be reconsidered since DashboardLayout provides the page shell.
```

### WR-03: SkillsGapAnalysis.tsx renders duplicate Navbar in multiple render paths

**File:** `src/pages/SkillsGapAnalysis.tsx:404,419,515`
**Issue:** Same pattern as Shop.tsx. `SkillsGapAnalysis` is wrapped in `<DashboardLayout>` in `App.tsx` (line 67) but renders its own `<Navbar />` in three separate return paths: the loading state (line 404), the free-tier gate (line 419), and the main render (line 515). All three produce double navigation.

**Fix:** Remove all three `<Navbar />` instances from the component. The layout wrapper already provides navigation.

### WR-04: StripeCheckoutWrapper silently falls back to empty string for Stripe publishable key

**File:** `src/components/StripeCheckoutWrapper.tsx:13`
**Issue:** `loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '')` falls back to an empty string if the env var is missing. `loadStripe('')` will silently fail -- no error is thrown, no warning logged. The Stripe Elements form simply will not render, leaving users with a blank checkout dialog and no explanation.

```typescript
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');
```

**Fix:** Fail loudly if the key is missing. At minimum, log an error; better yet, throw during initialization:

```typescript
const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
if (!STRIPE_KEY) {
  console.error('[StripeCheckoutWrapper] VITE_STRIPE_PUBLISHABLE_KEY is not set');
}
const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : Promise.resolve(null);
```

## Info

### IN-01: useMerits.ts uses extensive `as any` casting for RPC response

**File:** `src/hooks/useMerits.ts:45-48`
**Issue:** The RPC response from `get_merit_balance` is cast to `any` four times to extract `total`, `subscription_balance`, `shop_balance`, and `next_reset_date`. This bypasses TypeScript's type safety and will not catch shape changes if the database function signature evolves.

```typescript
const total = (data as any)?.total ?? 0;
const subscription = (data as any)?.subscription_balance ?? 0;
const shop = (data as any)?.shop_balance ?? 0;
const resetDate = (data as any)?.next_reset_date ?? null;
```

**Fix:** Define an interface for the expected RPC response shape and use it as the generic parameter:

```typescript
interface MeritBalanceResponse {
  total: number;
  subscription_balance: number;
  shop_balance: number;
  next_reset_date: string | null;
}

// In the query:
const { data } = await supabase.rpc('get_merit_balance') as { data: MeritBalanceResponse | null };
```

### IN-02: useResumeStream.ts contains console.log debug statements

**File:** `src/hooks/useResumeStream.ts:166,195,206,224,237,252`
**Issue:** Six `console.log` calls remain in the streaming hook. Per project conventions, bracket-prefixed console logs are acceptable for filtering, but these are verbose debug-level statements that produce noise in production browser consoles. Consider gating them behind `VITE_DEBUG_PERF` or removing them.

**Fix:** Gate behind the existing debug flag or remove:

```typescript
if (import.meta.env.VITE_DEBUG_PERF) {
  console.log('[ResumeStream] Stream reader acquired, beginning SSE loop');
}
```

### IN-03: Profile.tsx retains Paddle customer/subscription ID fields

**File:** `src/pages/Profile.tsx:33-34,88`
**Issue:** The Profile page state still includes `paddle_customer_id` and `paddle_subscription_id` fields, read from the database. This is noted as intentional for the migration period (Billing.tsx shows a "Legacy Paddle subscription" notice for users with existing Paddle subscriptions). No action needed now, but these should be tracked for removal once the Paddle migration is fully complete.

**Fix:** No immediate fix required. Add a TODO or track in the backlog for post-migration cleanup.

---

_Reviewed: 2026-04-17T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

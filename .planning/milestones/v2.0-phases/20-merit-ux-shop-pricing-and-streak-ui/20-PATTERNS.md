# Phase 20: merit-ux-shop-pricing-and-streak-ui - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 28 (new + modified)
**Analogs found:** 26 / 28

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/hooks/useMerits.ts` | hook | request-response | `src/hooks/useTierAccess.ts` | role-match |
| `src/hooks/useFeatureCosts.ts` | hook | request-response | `src/pages/AnalysisHistory.tsx` (useQuery pattern) | role-match |
| `src/hooks/useStripeCheckout.ts` | hook | request-response | `src/hooks/usePaddleCheckout.ts` | exact |
| `src/hooks/usePaywallGuard.ts` | hook | request-response | (self -- modify in place) | exact |
| `src/hooks/usePaddleCheckout.ts` | hook | -- | DELETED | -- |
| `src/components/MeritBalanceBadge.tsx` | component | request-response | `src/components/UsageCounter.tsx` | exact |
| `src/components/MeritCostPreview.tsx` | component | request-response | `src/components/UsageLimitBanner.tsx` | exact |
| `src/components/MeritShopCard.tsx` | component | CRUD | `src/components/PricingTable.tsx` (plan card) | role-match |
| `src/components/UpgradeComparisonBanner.tsx` | component | request-response | `src/components/UsageLimitBanner.tsx` | role-match |
| `src/components/StripeCheckoutWrapper.tsx` | component | request-response | `src/components/UpgradeModal.tsx` (checkout section) | role-match |
| `src/components/TopBar.tsx` | component | request-response | (self -- modify in place) | exact |
| `src/components/PricingTable.tsx` | component | request-response | (self -- rewrite in place) | exact |
| `src/components/PlanComparisonTable.tsx` | component | request-response | (self -- modify in place) | exact |
| `src/components/UpgradeModal.tsx` | component | request-response | (self -- modify in place) | exact |
| `src/components/SubscriptionManagement.tsx` | component | request-response | (self -- simplify/remove) | exact |
| `src/components/UsageCounter.tsx` | component | -- | REPLACED by MeritBalanceBadge | -- |
| `src/components/UsageLimitBanner.tsx` | component | -- | REPLACED by MeritCostPreview | -- |
| `src/components/AppSidebar.tsx` | component | request-response | (self -- modify in place) | exact |
| `src/contexts/AiCreditsContext.tsx` | context | -- | DELETED | -- |
| `src/pages/Shop.tsx` | page | request-response | `src/pages/Pricing.tsx` | exact |
| `src/pages/Settings/Billing.tsx` | page | CRUD | `src/pages/AnalysisHistory.tsx` | role-match |
| `src/pages/Pricing.tsx` | page | request-response | (self -- modify in place) | exact |
| `src/App.tsx` | config | -- | (self -- modify in place) | exact |
| `src/components/Navbar.tsx` | component | request-response | (self -- modify in place) | exact |
| `src/components/DashboardHome.tsx` | component | request-response | (self -- modify in place) | exact |
| `supabase/functions/stripe-webhook-handler/index.ts` | service | event-driven | (self -- modify in place) | exact |
| `supabase/functions/create-checkout-session/index.ts` | service | request-response | (self -- modify in place) | exact |
| `supabase/functions/send-strivo-email/index.ts` | service | request-response | (self -- modify in place) | exact |

## Pattern Assignments

### `src/hooks/useMerits.ts` (hook, request-response) -- NEW

**Analog:** `src/hooks/useTierAccess.ts` for structure, `src/pages/AnalysisHistory.tsx` for React Query pattern

**Imports pattern** (from useTierAccess.ts lines 1-4):
```typescript
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useAdminTierTest } from '@/contexts/AdminTierTestContext';
```

**React Query hook pattern** (from AnalysisHistory.tsx lines 147-154):
```typescript
const { data: userId, isLoading: isLoadingUser } = useQuery({
  queryKey: ['currentUser'],
  queryFn: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  },
  staleTime: 5 * 60 * 1000,
});
```

**Supabase RPC call pattern** (from useTierAccess.ts lines 71-75):
```typescript
const { data, error } = await supabase.rpc('can_perform_ai_action', {
  p_user_id: user.id
});
```

**Return shape pattern** (from useTierAccess.ts lines 126-136):
```typescript
return {
  tier,
  loading,
  canAccessFeature,
  canUseCredits,
  usageInfo,
};
```

**Key differences from analog:** Uses `useQuery` from React Query instead of `useState`/`useEffect` + manual fetch. Calls `get_merit_balance` RPC instead of `can_perform_ai_action`. Returns `{ total, subscription, shop, resetDate, isLow, isZero, isLoading, canAfford }`.

---

### `src/hooks/useFeatureCosts.ts` (hook, request-response) -- NEW

**Analog:** `src/pages/AnalysisHistory.tsx` lines 161-180

**React Query table read pattern** (from AnalysisHistory.tsx lines 161-180):
```typescript
const {
  data: usageRows = [],
  isLoading: isLoadingUsage,
  error: usageError,
  refetch,
} = useQuery({
  queryKey: ['activityHistory', userId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('usage_tracking')
      .select('*')
      .eq('user_id', userId!)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return (data || []) as UsageTrackingRow[];
  },
  enabled: !!userId,
});
```

**Key differences from analog:** Reads `merit_feature_costs` table (no user filter -- all authenticated users can read all rows per RLS). Uses `staleTime: 60_000` since costs rarely change. Returns cost lookup helper function.

---

### `src/hooks/useStripeCheckout.ts` (hook, request-response) -- NEW

**Analog:** `src/hooks/usePaddleCheckout.ts`

**Imports pattern** (from usePaddleCheckout.ts lines 1-3):
```typescript
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
```

**Hook options interface pattern** (from usePaddleCheckout.ts lines 49-52):
```typescript
interface UsePaddleCheckoutOptions {
  onSuccess?: (tier: 'pro' | 'elite') => void;
  onClose?: () => void;
}
```

**Checkout invocation pattern** (from usePaddleCheckout.ts lines 94-96):
```typescript
const openCheckout = useCallback(async (tier: 'pro' | 'elite', interval: BillingInterval = 'monthly', discountCode?: string): Promise<boolean> => {
  // ... auth check, then trigger checkout
}, [isReady, options]);
```

**Auth check before checkout** (from usePaddleCheckout.ts lines 112-117):
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  toast.error('Please sign in first');
  setIsLoading(false);
  return false;
}
```

**Return shape pattern** (from usePaddleCheckout.ts lines 242-248):
```typescript
return {
  isReady,
  isLoading,
  openCheckout,
  applyPromoCode,
};
```

**Key differences from analog:** Instead of `window.Paddle.Checkout.open()`, calls `supabase.functions.invoke('create-checkout-session', { body: { ...params, ui_mode: 'embedded' } })` and returns `clientSecret` for `EmbeddedCheckoutProvider`. No script tag loading needed.

---

### `src/components/MeritBalanceBadge.tsx` (component, request-response) -- NEW

**Analog:** `src/components/UsageCounter.tsx`

**Imports pattern** (from UsageCounter.tsx lines 1-6):
```typescript
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Gauge, Infinity, Sparkles } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
```

**Tier-conditional display pattern** (from UsageCounter.tsx lines 79-101):
```typescript
const getTierDisplay = (tier: string) => {
  switch (tier) {
    case 'elite': return 'Elite';
    case 'pro': return 'Pro';
    default: return 'Free';
  }
};

const getTierColor = (tier: string) => {
  switch (tier) {
    case 'elite': return 'text-purple-400';
    case 'pro': return 'text-primary';
    default: return 'text-muted-foreground';
  }
};
```

**Badge with tooltip pattern** (from UsageCounter.tsx lines 127-155):
```typescript
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 rounded-full text-sm border border-border cursor-help">
        <Gauge className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{remaining}</span>
          <span className="text-muted-foreground">/ {usage.limit} credits</span>
        </div>
      </div>
    </TooltipTrigger>
    <TooltipContent side="bottom" className="p-3 max-w-xs">
      ...
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

**Key differences from analog:** Uses `useMerits()` hook instead of direct Supabase calls. Wraps content in a Radix Popover (click-to-expand) instead of just a Tooltip. Shows subscription/shop breakdown, reset date, and quick links to `/shop` and `/pricing`.

---

### `src/components/MeritCostPreview.tsx` (component, request-response) -- NEW

**Analog:** `src/components/UsageLimitBanner.tsx`

**Imports pattern** (from UsageLimitBanner.tsx lines 1-6):
```typescript
import { useAiCredits } from '@/contexts/AiCreditsContext';
import { Clock, ArrowUpCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
```

**Props interface pattern** (from UsageLimitBanner.tsx lines 8-10):
```typescript
interface UsageLimitBannerProps {
  variant?: 'inline' | 'card';
}
```

**Conditional rendering with CTA pattern** (from UsageLimitBanner.tsx lines 26-37):
```typescript
if (variant === 'inline') {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Clock className="h-4 w-4" />
      <span>
        {isFree 
          ? "You've used your 3 free credits. Upgrade to Pro!" 
          : `Credits refresh on ${formattedDate}`
        }
      </span>
    </div>
  );
}
```

**Key differences from analog:** Uses `useMerits()` instead of `useAiCredits()`. Shows "Costs X Merits . Y remaining" text with three states (normal/amber/red+disabled). Has two CTAs: "Buy Merits" -> `/shop`, "Upgrade Plan" -> `/pricing`.

---

### `src/components/MeritShopCard.tsx` (component, CRUD) -- NEW

**Analog:** `src/components/PricingTable.tsx` (individual plan card section)

**Card layout pattern** (from PricingTable.tsx lines 209-331):
```typescript
<Card
  key={index}
  className={`relative p-6 bg-card border-2 ${
    plan.highlighted
      ? "border-primary shadow-xl shadow-primary/20 scale-105 z-10"
      : "border-border"
  } transition-all duration-300 hover:border-primary/50`}
>
  {plan.highlighted && (
    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
      <Zap className="h-3 w-3" />
      Most Popular
    </div>
  )}
  ...
  <Button onClick={() => handlePlanClick(plan.name)} className="w-full py-5 text-base font-semibold rounded-xl ...">
    {plan.cta}
  </Button>
</Card>
```

**Key differences from analog:** Shows pack merit count + price + per-merit price instead of plan features. "Most Popular" badge on the 25-pack card. Buy button triggers Stripe embedded checkout (payment mode).

---

### `src/components/UpgradeComparisonBanner.tsx` (component, request-response) -- NEW

**Analog:** `src/components/UsageLimitBanner.tsx`

**Banner card pattern** (from UsageLimitBanner.tsx lines 40-68):
```typescript
<Card className="border-border bg-muted/30 mb-6">
  <CardContent className="flex items-center justify-between py-4">
    <div className="flex items-center gap-3">
      <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
      <div>
        <p className="text-sm font-medium text-foreground">...</p>
        <p className="text-xs text-muted-foreground mt-0.5">...</p>
      </div>
    </div>
    <Link to="/profile">
      <Button variant="outline" size="sm" className="shrink-0 ml-4">
        <ArrowUpCircle className="h-4 w-4 mr-1.5" />
        Upgrade Plan
      </Button>
    </Link>
  </CardContent>
</Card>
```

**Key differences from analog:** Tier-conditional rendering. Free users see Pro pitch; Pro users see Elite pitch; Elite users see nothing. Links to `/pricing` instead of `/profile`.

---

### `src/components/StripeCheckoutWrapper.tsx` (component, request-response) -- NEW

**Analog:** `src/components/UpgradeModal.tsx` (checkout section)

**Checkout trigger pattern** (from UpgradeModal.tsx lines 205-213):
```typescript
<Button 
  className="w-full" 
  onClick={() => openCheckout('pro', billingInterval)}
  disabled={!isReady || isLoading}
>
  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
  Upgrade to Pro
</Button>
```

**Key differences from analog:** Wraps Stripe `EmbeddedCheckoutProvider` + `EmbeddedCheckout` instead of calling `window.Paddle.Checkout.open()`. Uses `fetchClientSecret` callback pattern from `@stripe/react-stripe-js`.

---

### `src/pages/Shop.tsx` (page, request-response) -- NEW

**Analog:** `src/pages/Pricing.tsx`

**Page layout pattern** (from Pricing.tsx lines 1-25):
```typescript
import { Navbar } from "@/components/Navbar";
import PricingTable from "@/components/PricingTable";
import PlanComparisonTable from "@/components/PlanComparisonTable";
import Footer from "@/components/Footer";
import { Helmet } from "react-helmet-async";

const Pricing = () => {
  return (
    <>
      <Helmet>
        <title>Strivo AI</title>
        <meta name="description" content="..." />
      </Helmet>
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <main className="pt-24">
          <PricingTable />
          <PlanComparisonTable />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Pricing;
```

**Key differences from analog:** Shop is a protected dashboard route (uses `DashboardLayout` wrapper, not `Navbar`+`Footer`). Contains 4 MeritShopCard components in a grid, UpgradeComparisonBanner per pack, and StripeCheckoutWrapper for payment mode. Layout follows dashboard pattern from other protected pages (see App.tsx routes).

**Dashboard page route pattern** (from App.tsx lines 63-64):
```typescript
<Route path="/dashboard" element={<ProtectedRoute><DashboardLayout><Dashboard /></DashboardLayout></ProtectedRoute>} />
```

---

### `src/pages/Settings/Billing.tsx` (page, CRUD) -- NEW

**Analog:** `src/pages/AnalysisHistory.tsx` (for table with React Query), `src/components/SubscriptionManagement.tsx` (for plan display)

**Page with React Query table pattern** (from AnalysisHistory.tsx lines 2, 147-180):
```typescript
import { useQuery } from '@tanstack/react-query';

const { data: userId } = useQuery({ queryKey: ['currentUser'], ... });

const { data: usageRows = [], isLoading } = useQuery({
  queryKey: ['activityHistory', userId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('usage_tracking')
      .select('*')
      .eq('user_id', userId!)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data || []) as UsageTrackingRow[];
  },
  enabled: !!userId,
});
```

**Current plan card pattern** (from SubscriptionManagement.tsx lines 120-149):
```typescript
<div className="p-5 rounded-xl border-2 border-border bg-secondary/30 mb-6">
  <div className="flex items-start justify-between mb-4">
    <div className="flex items-center gap-3">
      {tierDetails.icon}
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-bold">{tierDetails.name} Plan</h3>
          <Badge className={tierDetails.color}>
            {isActive ? 'Active' : isCanceled ? 'Canceled' : 'Inactive'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{tierDetails.credits}</p>
      </div>
    </div>
    <span className="text-2xl font-bold text-foreground">{tierDetails.price}</span>
  </div>
</div>
```

**Key differences from analog:** Two sections: (1) Current Plan card similar to SubscriptionManagement but with Merit allowance and Stripe links, (2) Purchase History table reading from `merit_shop_purchases` table (RLS restricts to own records). Paginated if > 20 rows.

---

### `src/components/TopBar.tsx` (component, request-response) -- MODIFY

**Current AiCredits usage** (line 9, line 37, lines 169-189):
```typescript
import { useAiCredits } from "@/contexts/AiCreditsContext";
// ...
const { creditsAvailable } = useAiCredits();
// ...
{user && !creditsAvailable && (
  <Badge variant="destructive" className="flex items-center gap-1 cursor-help">
    <AlertCircle className="w-3 h-3" />
    AI Credits Depleted
  </Badge>
)}
```

**Modification:** Replace `useAiCredits` import with `useMerits` hook. Replace the credits depleted badge with `<MeritBalanceBadge />` component (always visible, shows total count, click opens popover).

---

### `src/components/PricingTable.tsx` (component, request-response) -- REWRITE

**Current Paddle integration** (lines 5, 21-29, 39-61):
```typescript
import { usePaddleCheckout, BillingInterval } from "@/hooks/usePaddleCheckout";
// ...
const { isReady, openCheckout } = usePaddleCheckout({
  onSuccess: () => { setLoadingPlan(null); navigate('/dashboard'); },
  onClose: () => { setLoadingPlan(null); },
});
// ...
const handlePlanClick = async (planName: string) => {
  // ... calls openCheckout('pro', billingInterval) or openCheckout('elite', billingInterval)
};
```

**Billing toggle pattern** (lines 164-199 -- reusable):
```typescript
<div className="flex justify-center mb-12">
  <div className="inline-flex items-center gap-1 p-1 bg-secondary/50 rounded-full border border-border">
    <button
      onClick={() => setBillingInterval('monthly')}
      className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
        billingInterval === 'monthly'
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      Monthly
    </button>
    <button
      onClick={() => setBillingInterval('annual')}
      className={`px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
        billingInterval === 'annual'
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      Annual
      <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
        Save up to 29%
      </span>
    </button>
  </div>
</div>
```

**3-column card grid pattern** (lines 203-333 -- structural template):
```typescript
<div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
  {plans.map((plan, index) => (
    <Card className={`relative p-6 bg-card border-2 ${plan.highlighted ? "border-primary ..." : "border-border"}`}>
      {plan.highlighted && (<div className="absolute -top-4 ...">Most Popular</div>)}
      {/* Plan header, price, credits, features, CTA */}
    </Card>
  ))}
</div>
```

**Modification:** Full rewrite. Replace Paddle checkout with Stripe `EmbeddedCheckout`. Update prices to $0/$8.99/$16.99 monthly, yearly with savings badges. Merit allowance instead of credits. "Current Plan" badge on user's current tier.

---

### `src/components/PlanComparisonTable.tsx` (component, request-response) -- MODIFY

**Table row data pattern** (lines 3-15):
```typescript
const comparisonFeatures = [
  { name: "Credits", free: "3 lifetime", pro: "100/month", elite: "300/month" },
  { name: "Resume Analysis", free: "1 mandatory", pro: true, elite: true },
  // ...
];
```

**Modification:** Update "Credits" row to "Merit Allowance" with correct values. Add Merit-specific rows (feature access, locked sections, streak/quiz access, cost-per-feature).

---

### `src/components/UpgradeModal.tsx` (component, request-response) -- MODIFY

**Current Paddle integration** (lines 8, 30-33):
```typescript
import { usePaddleCheckout, VALID_PROMO_CODE, BillingInterval } from '@/hooks/usePaddleCheckout';
// ...
const { isReady, isLoading, openCheckout, applyPromoCode } = usePaddleCheckout({
  onSuccess: () => { handleClose(); },
});
```

**Modification:** Replace `usePaddleCheckout` with `useStripeCheckout`. Update button click handlers to use Stripe embedded checkout. Update copy from "credits" to "Merits". Remove "Secure checkout powered by Paddle" footer text.

---

### `src/components/AppSidebar.tsx` (component, request-response) -- MODIFY

**Nav items array pattern** (lines 31-44):
```typescript
const topNavItems: NavItem[] = [
  { label: "Home", to: "/dashboard", icon: <LayoutGrid className="w-5 h-5" /> },
  { label: "Resume Analysis", to: "/upload", icon: <Upload className="w-5 h-5" /> },
  // ...
];

const bottomNavItems: NavItem[] = [
  { label: "Settings", to: "/profile", icon: <Settings className="w-5 h-5" /> },
];
```

**Modification:** Add `{ label: "Merit Shop", to: "/shop", icon: <Gem className="w-5 h-5" /> }` to `topNavItems`. Add `{ label: "Billing", to: "/settings/billing", icon: <CreditCard className="w-5 h-5" /> }` to `bottomNavItems` or near Settings.

---

### `src/App.tsx` (config) -- MODIFY

**Route definition pattern** (lines 57-78):
```typescript
<Route path="/dashboard" element={<ProtectedRoute><DashboardLayout><Dashboard /></DashboardLayout></ProtectedRoute>} />
```

**Provider wrapper pattern** (lines 48-49):
```typescript
<AiCreditsProvider>
  ...
</AiCreditsProvider>
```

**Modification:** (1) Remove `AiCreditsProvider` import and wrapper. (2) Add `/shop` route wrapping `Shop` in `ProtectedRoute`+`DashboardLayout`. (3) Add `/settings/billing` route wrapping `Billing` in `ProtectedRoute`+`DashboardLayout`. (4) Import new page components.

---

### `supabase/functions/stripe-webhook-handler/index.ts` (service, event-driven) -- MODIFY

**Shop credit section** (lines 485-501):
```typescript
const { error: rpcErr } = await supabase.rpc("credit_shop_merits", {
  p_user_id: userId,
  p_pack_size: packSize,
  p_stripe_payment_id: paymentIntentId,
});
if (rpcErr) {
  log.error("credit-shop-rpc-failed", { eventId: event.id, code: (rpcErr as { code?: string }).code });
  return jsonResponse({ error: "rpc_failed" }, 500);
}
log.info("checkout-shop-credited", { eventId: event.id, userId, packSize });
```

**Modification:** After line 501 (`log.info("checkout-shop-credited"...)`), add fire-and-forget `fetch()` call to `send-strivo-email` with `shop_receipt` template. Must NOT be `await`ed -- use `.catch()` for error logging.

---

### `supabase/functions/create-checkout-session/index.ts` (service, request-response) -- MODIFY

**Session creation pattern** (lines 228-283):
```typescript
session = await stripe.checkout.sessions.create({
  mode: "subscription",
  customer: customerId!,
  line_items: [{ price: priceId, quantity: 1 }],
  success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${appUrl}/pricing?canceled=1`,
  client_reference_id: ctx.userId,
  metadata: { user_id: ctx.userId, tier: body.tier, interval: body.interval },
});
// ...
return jsonResponse({ url: session.url, id: session.id }, 200);
```

**Body normalization pattern** (lines 64-91):
```typescript
type CheckoutBody =
  | { mode: "subscription"; tier: "pro" | "elite"; interval: "monthly" | "annual" }
  | { mode: "payment"; pack_size: PackSize };
```

**Modification:** (1) Extend `CheckoutBody` to include optional `ui_mode?: "embedded"`. (2) When `ui_mode === 'embedded'`, create session with `ui_mode: 'embedded'` and `return_url` instead of `success_url`/`cancel_url`. (3) Return `{ clientSecret: session.client_secret, id: session.id }` instead of `{ url, id }`.

---

### `supabase/functions/send-strivo-email/index.ts` (service, request-response) -- MODIFY

**EmailType union** (lines 25-32):
```typescript
type EmailType = 
  | 'resume_analysis'
  | 'nudge_24hr'
  | 'career_compass_intro'
  | 'credits_exhausted'
  | 'founder_checkin'
  | 'linkedin_analysis'
  | 'career_analysis';
```

**Email content switch** (lines 60-65):
```typescript
function getEmailContent(params: EmailRequest): EmailContent {
  const { userName, emailType, score, resultsUrl } = params;
  const firstName = userName?.split(' ')[0] || 'there';
  const appUrl = Deno.env.get('APP_URL') || 'https://strivoai.net';

  switch (emailType) {
    case 'resume_analysis':
      return { subject: `...`, html: buildEmail({...}) };
```

**Modification:** Add `'shop_receipt'` to the `EmailType` union. Add a new `case 'shop_receipt':` in the switch returning receipt email content using `params.metadata.packSize`, `params.metadata.amountPaid`, `params.metadata.purchaseDate`, `params.metadata.billingUrl`.

---

## Feature Page Consumer Migration

The following files import `useAiCredits` and must be migrated to `useMerits()`:

| File | Current Import | Usage |
|------|---------------|-------|
| `src/pages/Upload.tsx` (line 11) | `useAiCredits` | `creditsAvailable`, `markCreditsDepletedFromError` |
| `src/pages/CareerCompass.tsx` (line 17) | `useAiCredits` | `creditsAvailable`, `markCreditsDepletedFromError`, `markCreditsRestored` |
| `src/pages/SkillsGapAnalysis.tsx` (line 18) | `useAiCredits` | `creditsAvailable` |
| `src/pages/Dashboard.tsx` (line 11) | `useAiCredits` | `creditsAvailable` |
| `src/components/TopBar.tsx` (line 9) | `useAiCredits` | `creditsAvailable` |
| `src/components/Navbar.tsx` (line 26) | `useAiCredits` | `creditsAvailable` |
| `src/components/UsageLimitBanner.tsx` (line 1) | `useAiCredits` | `usageLimit` |
| `src/App.tsx` (line 13) | `AiCreditsProvider` | Provider wrapper |

Each consumer migrates to `useMerits()`. The `creditsAvailable` boolean maps to `!isZero`. The `markCreditsDepletedFromError` and `markCreditsRestored` functions are eliminated (React Query handles cache invalidation via `queryClient.invalidateQueries`).

---

## Shared Patterns

### Authentication (Supabase user check in hooks)
**Source:** `src/hooks/useTierAccess.ts` lines 61-65
**Apply to:** `useMerits.ts`, `useFeatureCosts.ts`, `useStripeCheckout.ts`
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  setRealTier('free');
  setCanUseCredits(false);
  setLoading(false);
  return;
}
```

### React Query convention (useQuery with Supabase)
**Source:** `src/pages/AnalysisHistory.tsx` lines 147-180
**Apply to:** `useMerits.ts`, `useFeatureCosts.ts`, `Billing.tsx`
```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['key', userId],
  queryFn: async () => {
    const { data, error } = await supabase.from('table').select('*').eq('user_id', userId!);
    if (error) throw error;
    return data;
  },
  enabled: !!userId,
});
```

### Error handling (edge function responses)
**Source:** `supabase/functions/create-checkout-session/index.ts` lines 104-112
**Apply to:** All edge function modifications
```typescript
function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders({ type: "user" }),
      "Content-Type": "application/json",
    },
  });
}
```

### Logging (edge function structured logging)
**Source:** `supabase/functions/stripe-webhook-handler/index.ts` lines 33, 497-500
**Apply to:** All edge function modifications
```typescript
import { createLogger } from "../_shared/logger.ts";
const log = createLogger("function-name");
// ...
log.info("event-name", { key: value });
log.error("error-name", { key: value });
```

### Billing toggle (pill toggle for Monthly/Yearly)
**Source:** `src/components/PricingTable.tsx` lines 164-199
**Apply to:** New `PricingTable.tsx` rewrite, `UpgradeModal.tsx`
```typescript
<div className="inline-flex items-center gap-1 p-1 bg-secondary/50 rounded-full border border-border">
  <button
    onClick={() => setBillingInterval('monthly')}
    className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
      billingInterval === 'monthly'
        ? 'bg-background text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground'
    }`}
  >
    Monthly
  </button>
  <button onClick={() => setBillingInterval('annual')} className="...">
    Annual
    <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">Save</span>
  </button>
</div>
```

### Card grid pattern (responsive plan/pack cards)
**Source:** `src/components/PricingTable.tsx` lines 203-205
**Apply to:** New `PricingTable.tsx`, `Shop.tsx`
```typescript
<div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
  {items.map((item, index) => (
    <Card className="relative p-6 bg-card border-2 ...">
      {/* card content */}
    </Card>
  ))}
</div>
```

### "Most Popular" badge
**Source:** `src/components/PricingTable.tsx` lines 217-222
**Apply to:** New PricingTable (Pro plan), Shop.tsx (25-pack)
```typescript
{plan.highlighted && (
  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
    <Zap className="h-3 w-3" />
    Most Popular
  </div>
)}
```

### Popover for detail expansion
**Source:** `src/components/Navbar.tsx` line 19 (already uses Radix Popover)
**Apply to:** `MeritBalanceBadge.tsx`
```typescript
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
```

### Dashboard protected route pattern
**Source:** `src/App.tsx` lines 59-74
**Apply to:** `/shop`, `/settings/billing` routes
```typescript
<Route path="/shop" element={<ProtectedRoute><DashboardLayout><Shop /></DashboardLayout></ProtectedRoute>} />
<Route path="/settings/billing" element={<ProtectedRoute><DashboardLayout><Billing /></DashboardLayout></ProtectedRoute>} />
```

### Supabase RPC call pattern
**Source:** `src/hooks/useTierAccess.ts` lines 71-75
**Apply to:** `useMerits.ts`
```typescript
const { data, error } = await supabase.rpc('get_merit_balance', {
  p_user_id: user.id
});
```

### Fire-and-forget email from webhook
**Source:** Pattern from RESEARCH.md Code Example 2 (aligns with existing `send-strivo-email` call patterns)
**Apply to:** `stripe-webhook-handler/index.ts` after shop credit
```typescript
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (supabaseUrl && serviceKey) {
  fetch(`${supabaseUrl}/functions/v1/send-strivo-email`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: profile.email, userName: profile.full_name, emailType: "shop_receipt", metadata: { ... } }),
  }).catch((err) => log.error("receipt-email-failed", { eventId: event.id, err: String(err) }));
}
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/components/StripeCheckoutWrapper.tsx` | component | request-response | No existing Stripe Embedded Checkout component in codebase. Pattern comes from `@stripe/react-stripe-js` docs: `EmbeddedCheckoutProvider` + `EmbeddedCheckout`. Closest analog is `UpgradeModal.tsx` checkout section but mechanism is fundamentally different (iframe vs popup). |
| `src/hooks/useStripeCheckout.ts` | hook | request-response | Direct replacement of `usePaddleCheckout.ts` but checkout mechanism differs significantly (Stripe `fetchClientSecret` callback vs Paddle `window.Paddle.Checkout.open`). Use `usePaddleCheckout.ts` for hook structure and auth patterns, but checkout logic is novel. |

---

## Paddle Removal Checklist

Files to delete:
- `src/hooks/usePaddleCheckout.ts` (249 lines)
- `src/contexts/AiCreditsContext.tsx` (113 lines)

References to remove:
- `index.html` line 44: `<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>`
- All imports of `usePaddleCheckout` (in `PricingTable.tsx`, `UpgradeModal.tsx`)
- All imports of `useAiCredits` / `AiCreditsContext` / `AiCreditsProvider` (8 files listed above)

Verification grep (must return zero matches):
```bash
grep -r "usePaddleCheckout\|Paddle\|paddle" src/ index.html
grep -r "useAiCredits\|AiCreditsContext\|AiCreditsProvider\|creditsAvailable\|markCreditsDepletedFromError\|markCreditsRestored\|checkUsageLimitError" src/
```

---

## Metadata

**Analog search scope:** `src/`, `supabase/functions/`
**Files scanned:** 28 target files, 15 analog files read in full
**Pattern extraction date:** 2026-04-17

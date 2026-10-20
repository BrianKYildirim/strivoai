---
phase: 20-merit-ux-shop-pricing-and-streak-ui
verified: 2026-04-17T21:30:00Z
status: gaps_found
score: 7/10 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Every feature page shows the Merit cost and current balance above its Analyze button and updates within 5 seconds of any balance change"
    status: partial
    reason: "CareerCompass.tsx is missing MeritCostPreview -- 5 of 6 feature pages have it but CareerCompass does not import or render it"
    artifacts:
      - path: "src/pages/CareerCompass.tsx"
        issue: "No MeritCostPreview import or render; no useFeatureCosts/getCostForFeature calls. Has useMerits for isZero/invalidateMerits but lacks the inline cost display."
    missing:
      - "Add MeritCostPreview import and useFeatureCosts to CareerCompass.tsx"
      - "Render MeritCostPreview above the Analyze button with feature key 'career_compass'"
  - truth: "Interview Prep Elite users see the quiz card interface with a 500-char live counter and a post-quiz results screen with per-question STAR breakdown"
    status: failed
    reason: "Phase 20 Plan 07 claims UX-09 shipped in Phase 19 but InterviewQuizResults and InterviewPrepInput components are orphaned (not imported by InterviewPrep.tsx). InterviewPrep.tsx shows no quiz card UI, no 500-char limit, and no results screen. The components exist but are not wired."
    artifacts:
      - path: "src/pages/InterviewPrep.tsx"
        issue: "Does not import InterviewQuizResults or InterviewPrepInput. No quiz card interface visible. maxLength is 1500 for background context, not 500 for quiz answers."
      - path: "src/components/InterviewQuizResults.tsx"
        issue: "Exists (103 lines) but orphaned -- not imported anywhere"
      - path: "src/components/InterviewPrepInput.tsx"
        issue: "Exists (149 lines) but orphaned -- not imported anywhere"
    missing:
      - "Wire InterviewQuizResults and InterviewPrepInput into InterviewPrep.tsx"
      - "Add quiz card interface rendering for Elite users"
      - "Add 500-char textarea with live counter for quiz answers"
  - truth: "The dashboard streak display shows a flame + day count, a dimmed flame at 24h cold, a broken streak with restart CTA at 48h, and a 1/3 used today counter"
    status: failed
    reason: "InterviewStreakDisplay component exists (96 lines, substantive) but is completely orphaned -- not imported by Dashboard, DashboardHome, or InterviewPrep. Phase 20 Plan 07 claims UX-10 shipped in Phase 19 but the component is not wired into any consumer."
    artifacts:
      - path: "src/components/InterviewStreakDisplay.tsx"
        issue: "Exists and is substantive (flame states, day count, daily counter) but imported by zero files"
      - path: "src/components/DashboardHome.tsx"
        issue: "No 'streak' or 'flame' references found"
    missing:
      - "Import and render InterviewStreakDisplay in DashboardHome or Dashboard"
      - "Wire streak data from interview_streaks table via React Query"
human_verification:
  - test: "Verify MeritBalanceBadge popover displays correct subscription vs shop breakdown"
    expected: "Clicking the gem badge in the TopBar opens a popover showing separate subscription and shop Merit counts, total, reset date, and quick links to /shop and /pricing"
    why_human: "Requires running the app with an authenticated user who has real Merit balance data"
  - test: "Verify Stripe Embedded Checkout opens and displays correctly in the Dialog"
    expected: "Clicking Subscribe on /pricing or Buy on /shop opens a Dialog containing Stripe's embedded checkout form with correct price"
    why_human: "Requires VITE_STRIPE_PUBLISHABLE_KEY env var and live/test Stripe connection"
  - test: "Verify purchase history table populates after a real shop purchase"
    expected: "/settings/billing shows the transaction with correct date, pack size, amount, and status badge"
    why_human: "Requires completing a real Stripe payment flow and webhook processing"
  - test: "Verify receipt email is sent after shop purchase"
    expected: "User receives an email with subject 'Your Strivo Merit purchase confirmation' containing pack size, amount, date, and View Purchase History link"
    why_human: "Requires live webhook processing and Resend email delivery"
---

# Phase 20: Merit UX, Shop, Pricing & Streak UI Verification Report

**Phase Goal:** Ship all Merit UX: balance badge, cost previews, low/zero states, /pricing, Merit Shop, purchase history, Interview Prep Elite UI, streak display.
**Verified:** 2026-04-17T21:30:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The dashboard header shows a persistent Merit balance badge that expands to a breakdown of subscription vs shop Merits | VERIFIED | MeritBalanceBadge.tsx (84 lines) renders Popover with subscription/shop rows, total, reset date, and quick links. Imported and rendered in TopBar.tsx at line 148. |
| 2 | Every feature page shows the Merit cost and current balance above its Analyze button and updates within 5 seconds of any balance change | PARTIAL | 5 of 6 feature pages wired: Upload, SkillsGapAnalysis, LinkedInGrader, RecruitingLens, InterviewPrep. CareerCompass.tsx is MISSING MeritCostPreview entirely. |
| 3 | When a user's total Merits drop below 2x the cheapest feature cost, an amber warning appears with Shop and Upgrade CTAs | VERIFIED | MeritCostPreview.tsx line 58-65 shows amber warning at total < featureCost * 2. MeritBalanceBadge.tsx lines 63-68 show amber callout. Both link to /shop and /pricing. |
| 4 | A zero-balance user sees the Analyze button disabled with a clear "Out of Merits" state and two CTAs | VERIFIED | MeritCostPreview.tsx lines 19-33 render "Out of Merits" with Buy Merits and Upgrade Plan links. Feature pages disable button with isZero condition. |
| 5 | The Merit Shop page shows all 4 packs with the 25-pack badged "Most Popular"; clicking Buy launches a Stripe Checkout Session in payment mode | VERIFIED | Shop.tsx renders PACKS array (3/10/25/50) with MeritShopCard. 25-pack has popular:true triggering emerald border + "Most Popular" badge. handleBuy calls fetchClientSecret with mode:'payment'. StripeCheckoutWrapper wired. |
| 6 | Upgrade-comparison banners render the correct framing for Free-viewing-25pack, Pro-viewing-50pack, and none for Elite | VERIFIED | UpgradeComparisonBanner.tsx (53 lines) returns null for Elite, shows Pro pitch for free+25-pack, shows Elite pitch for pro+50-pack. Rendered below each MeritShopCard in Shop.tsx. |
| 7 | /pricing renders a 3-column comparison with monthly/yearly toggle, savings badges, crossed-out monthly equivalent on yearly, and current plan highlighted | VERIFIED | PricingTable.tsx (365 lines) renders 3-column grid with PLANS config. Monthly/yearly pill toggle, "Save $17.89"/"Save $33.89" badges, line-through monthly price on yearly view, "Current Plan" badge from useTierAccess. StripeCheckoutWrapper for inline checkout. |
| 8 | /settings/billing lists all shop transactions; a successful purchase emails the user a receipt via send-strivo-email | VERIFIED | Billing.tsx (401 lines) queries merit_shop_purchases with date/pack/amount/status columns, sorted newest first, with "No purchases yet" empty state + /shop link. send-strivo-email has shop_receipt template (lines 226-272). stripe-webhook-handler fires receipt email (line 522). |
| 9 | Interview Prep Elite users see the quiz card interface with a 500-char live counter and a post-quiz results screen with per-question STAR breakdown | FAILED | InterviewQuizResults.tsx (103 lines) and InterviewPrepInput.tsx (149 lines) exist but are ORPHANED -- not imported by InterviewPrep.tsx. No quiz card UI or 500-char limit found in InterviewPrep.tsx. Phase 20 plan claims "shipped in Phase 19" but components are not wired. |
| 10 | The dashboard streak display shows a flame + day count, a dimmed flame at 24h cold, a broken streak with restart CTA at 48h, and a "1/3 used today" counter | FAILED | InterviewStreakDisplay.tsx (96 lines) exists with active/cold/expired/none states, flame icon, day count, and daily usage counter. But it is imported by ZERO files. Not wired into DashboardHome.tsx or Dashboard.tsx. |

**Score:** 7/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/hooks/useMerits.ts` | React Query wrapper for get_merit_balance RPC | VERIFIED | 65 lines, exports useMerits and useInvalidateMerits, calls supabase.rpc('get_merit_balance'), staleTime: 5000, refetchOnWindowFocus: true |
| `src/hooks/useFeatureCosts.ts` | React Query wrapper for merit_feature_costs table | VERIFIED | 32 lines, exports useFeatureCosts and getCostForFeature, queries merit_feature_costs table |
| `src/hooks/useStripeCheckout.ts` | Shared hook for Stripe Embedded Checkout | VERIFIED | 52 lines, exports useStripeCheckout, invokes create-checkout-session with ui_mode:'embedded', returns clientSecret |
| `src/components/MeritBalanceBadge.tsx` | Badge + Popover component for TopBar | VERIFIED | 84 lines, exports MeritBalanceBadge, Radix Popover with sub/shop breakdown, aria-label, /shop and /pricing links |
| `src/components/MeritCostPreview.tsx` | Inline cost preview component for feature pages | VERIFIED | 73 lines, exports MeritCostPreview, 4 render states (zero/insufficient/low/normal), CTAs to /shop and /pricing |
| `src/components/StripeCheckoutWrapper.tsx` | Reusable EmbeddedCheckout wrapper in Dialog | VERIFIED | 45 lines, exports StripeCheckoutWrapper, EmbeddedCheckoutProvider + EmbeddedCheckout in Dialog, max-w-[560px] |
| `src/components/PricingTable.tsx` | Full rewrite with Stripe embedded checkout and Merit pricing | VERIFIED | 365 lines, 3-column grid, monthly/yearly toggle, savings badges, current plan highlighting, StripeCheckoutWrapper |
| `src/components/PlanComparisonTable.tsx` | Updated feature comparison with Merit rows | VERIFIED | 76 lines, 10 Merit-specific rows including Merit Allowance, per-feature costs, Interview Prep, Recruiting Lens |
| `src/components/UpgradeModal.tsx` | Stripe-based upgrade modal | VERIFIED | 240 lines, uses useStripeCheckout and StripeCheckoutWrapper, no Paddle references |
| `src/components/MeritShopCard.tsx` | Individual pack card component | VERIFIED | 53 lines, exports MeritShopCard, "Most Popular" badge with emerald border, Buy button |
| `src/components/UpgradeComparisonBanner.tsx` | Tier-conditional upgrade pitch banner | VERIFIED | 53 lines, exports UpgradeComparisonBanner, Free->Pro on 25-pack, Pro->Elite on 50-pack, null for Elite |
| `src/pages/Shop.tsx` | Merit Shop page at /shop route | VERIFIED | 146 lines, 4 PACKS, responsive grid, Stripe checkout, URL param handling |
| `src/pages/Settings/Billing.tsx` | Billing page with current plan and purchase history | VERIFIED | 401 lines, CurrentPlanCard + PurchaseHistoryTable, merit_shop_purchases query, empty state, Paddle legacy notice |
| `supabase/functions/create-checkout-session/index.ts` | Embedded checkout mode with client_secret response | VERIFIED | Contains ui_mode?"embedded" in CheckoutBody, embedded session creation, returns clientSecret |
| `supabase/functions/send-strivo-email/index.ts` | shop_receipt email template | VERIFIED | Contains 'shop_receipt' in EmailType union, case 'shop_receipt' with pack/amount/date template |
| `supabase/functions/stripe-webhook-handler/index.ts` | Fire-and-forget receipt email call | VERIFIED | Line 522 sends shop_receipt email via non-awaited fetch with .catch() |
| `src/contexts/AiCreditsContext.tsx` | DELETED | VERIFIED | File does not exist |
| `src/hooks/usePaddleCheckout.ts` | DELETED | VERIFIED | File does not exist |
| `src/components/SubscriptionManagement.tsx` | DELETED | VERIFIED | File does not exist |
| `src/components/UsageCounter.tsx` | DELETED | VERIFIED | File does not exist |
| `src/components/UsageLimitBanner.tsx` | DELETED | VERIFIED | File does not exist |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| TopBar.tsx | MeritBalanceBadge.tsx | `<MeritBalanceBadge />` render | WIRED | Import line 9, render line 148 |
| MeritCostPreview.tsx | useMerits.ts | `useMerits()` hook call | WIRED | Import line 3, call line 10 |
| PricingTable.tsx | StripeCheckoutWrapper.tsx | renders StripeCheckoutWrapper | WIRED | Import line 9, render line 355 |
| StripeCheckoutWrapper.tsx | useStripeCheckout (via parent) | parent calls fetchClientSecret | WIRED | PricingTable imports useStripeCheckout (line 8), passes clientSecret as prop |
| Shop.tsx | StripeCheckoutWrapper.tsx | renders checkout dialog | WIRED | Import line 10, render line 136 |
| App.tsx | Shop.tsx | Route at /shop | WIRED | Route line 73 with ProtectedRoute wrapper |
| App.tsx | Billing.tsx | Route at /settings/billing | WIRED | Route line 75 with ProtectedRoute + DashboardLayout |
| Billing.tsx | merit_shop_purchases | React Query useQuery | WIRED | supabase.from('merit_shop_purchases') at line 328 |
| Navbar.tsx | /shop | Merit Shop nav entry | WIRED | Line 158: { to: "/shop", label: "Merit Shop" } |
| AppSidebar.tsx | /settings/billing | Billing nav entry | WIRED | Line 44: { label: "Billing", to: "/settings/billing" } |
| UpgradeModal.tsx | StripeCheckoutWrapper.tsx | renders checkout dialog | WIRED | Import line 7, render line 232 |
| stripe-webhook-handler | send-strivo-email | fire-and-forget fetch | WIRED | fetch call at line 513 with emailType: "shop_receipt" |
| useMerits.ts | supabase RPC get_merit_balance | useQuery calling supabase.rpc | WIRED | Line 34: supabase.rpc('get_merit_balance', { p_user_id: userId! }) |
| useFeatureCosts.ts | merit_feature_costs table | useQuery calling supabase.from | WIRED | Line 14: supabase.from('merit_feature_costs') |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| MeritBalanceBadge.tsx | total, subscription, shop | useMerits() -> supabase.rpc('get_merit_balance') | DB query via RPC | FLOWING |
| MeritCostPreview.tsx | total, isZero, canAfford | useMerits() -> supabase.rpc('get_merit_balance') | DB query via RPC | FLOWING |
| Shop.tsx | tier | useTierAccess() | Profile query | FLOWING |
| Billing.tsx (purchases) | purchases | supabase.from('merit_shop_purchases') | DB query | FLOWING |
| Billing.tsx (profile) | profile | supabase.from('profiles') | DB query | FLOWING |
| PricingTable.tsx | currentTier | useTierAccess() | Profile query | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build succeeds | `npm run build` | Built in 16.89s, exit 0 | PASS |
| No AiCreditsContext references | `grep -r "useAiCredits\|AiCreditsContext" src/` | 0 matches | PASS |
| No Paddle references in active code | `grep -c "paddle.com" index.html` | 0 | PASS |
| No usePaddleCheckout references | `grep -r "usePaddleCheckout" src/ --include="*.ts"` | 0 matches | PASS |
| Legacy files deleted | `test ! -f src/contexts/AiCreditsContext.tsx` | Confirmed | PASS |
| Stripe deps in package.json | `@stripe/react-stripe-js` and `@stripe/stripe-js` | Present in dependencies | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| UX-01 | Plan 03 | Persistent Merit balance badge in dashboard header | SATISFIED | MeritBalanceBadge in TopBar with popover breakdown |
| UX-02 | Plan 03 | Every feature page shows Merit cost + current balance | PARTIAL | 5/6 feature pages have MeritCostPreview; CareerCompass missing |
| UX-03 | Plan 03 | Low-balance amber warning with CTAs | SATISFIED | MeritCostPreview amber state + MeritBalanceBadge amber callout |
| UX-04 | Plan 03 | Zero-balance disables Analyze with "Out of Merits" + CTAs | SATISFIED | MeritCostPreview zero state + button disabled conditions |
| UX-05 | Plan 05 | Merit Shop UI with 4 pack cards and "Most Popular" | SATISFIED | Shop.tsx with 4 packs, MeritShopCard with emerald badge |
| UX-06 | Plan 05 | Shop upgrade comparison banners | SATISFIED | UpgradeComparisonBanner with Free->Pro, Pro->Elite logic |
| UX-07 | Plan 06 | Purchase history page at /settings/billing | SATISFIED | Billing.tsx with merit_shop_purchases table |
| UX-08 | Plan 04 | Pricing page with 3-column comparison and toggle | SATISFIED | PricingTable with Stripe checkout, savings badges, current plan |
| UX-09 | Plan 07 (deferred to Phase 19) | Interview Prep Elite quiz card interface | BLOCKED | Components exist but are orphaned -- not wired into InterviewPrep.tsx |
| UX-10 | Plan 07 (deferred to Phase 19) | Streak display on dashboard | BLOCKED | InterviewStreakDisplay exists but not imported by any page |
| UX-11 | Plan 02 | useMerits() hook with live balance | SATISFIED | useMerits.ts with React Query, 5s staleTime, window focus refetch |
| SHOP-05 | Plan 01, 05 | Frontend creates Stripe Checkout Session in payment mode | SATISFIED | useStripeCheckout with mode:'payment', create-checkout-session with embedded mode |
| SHOP-08 | Plan 01 | Email receipt sent after successful purchase | SATISFIED | shop_receipt template + fire-and-forget call in webhook handler |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/pages/InterviewPrep.tsx | 471 | MeritCostPreview uses hardcoded 'free' tier instead of actual user tier | Warning | Cost preview will always show Free-tier cost regardless of user subscription |
| src/components/InterviewStreakDisplay.tsx | - | Exported but never imported by any file | Warning | Orphaned component -- exists but has no visual effect |
| src/components/InterviewQuizResults.tsx | - | Exported but never imported by any file | Warning | Orphaned component -- quiz results never shown |
| src/components/InterviewPrepInput.tsx | - | Exported but never imported by any file | Warning | Orphaned component -- quiz input never rendered |

### Human Verification Required

### 1. MeritBalanceBadge Popover Display

**Test:** Click the gem badge in the TopBar after logging in with a user who has Merit balance data
**Expected:** Popover opens showing separate subscription and shop Merit counts, bold total, reset date, low-balance warning if applicable, and quick links to /shop and /pricing
**Why human:** Requires running app with authenticated user and real Merit data from database

### 2. Stripe Embedded Checkout Integration

**Test:** Click "Get Pro" on /pricing or "Buy 25 Merits" on /shop
**Expected:** Dialog opens with Stripe's embedded checkout form showing correct price ($8.99/mo or $9.99)
**Why human:** Requires VITE_STRIPE_PUBLISHABLE_KEY environment variable and live/test Stripe connection

### 3. Purchase History Population

**Test:** Complete a shop purchase, then navigate to /settings/billing
**Expected:** New transaction appears in the purchase history table with correct date, pack size, amount, and "Completed" status badge
**Why human:** Requires completing a real Stripe payment flow with webhook processing

### 4. Receipt Email Delivery

**Test:** Complete a shop purchase and check email
**Expected:** Email arrives with subject "Your Strivo Merit purchase confirmation" containing pack size, amount, date, and "View Purchase History" CTA
**Why human:** Requires live webhook processing and Resend email delivery service

### Gaps Summary

Three gaps block full goal achievement:

1. **CareerCompass missing MeritCostPreview (SC #2)** -- This is a straightforward omission. CareerCompass.tsx imports useMerits for isZero/invalidateMerits but does not import or render MeritCostPreview. All 5 other feature pages have it. This is a simple wiring fix: add the import, compute the cost, render the preview above the Analyze button.

2. **Interview Prep Elite quiz UI not wired (SC #9)** -- Phase 20 Plan 07 claims "UX-09 confirmed as already shipped in Phase 19." However, the InterviewQuizResults and InterviewPrepInput components created in Phase 19 are orphaned (not imported by InterviewPrep.tsx). The quiz card interface, 500-char textarea, and results screen are not visible to users. These components need to be wired into InterviewPrep.tsx.

3. **Streak display not wired (SC #10)** -- Phase 20 Plan 07 claims "UX-10 confirmed as already shipped in Phase 19." However, InterviewStreakDisplay.tsx is orphaned (not imported by DashboardHome or any other page). The flame + day count display, cold/expired states, and daily quiz counter are not visible anywhere. The component needs to be imported and rendered in DashboardHome or Dashboard.

**Root cause for gaps 2 and 3:** Phase 19 created the backend infrastructure and frontend components but did not wire the components into the page-level rendering. Phase 20 trusted the Phase 19 summary claims without verifying wiring. The components exist and are substantive but are completely disconnected from the UI.

---

_Verified: 2026-04-17T21:30:00Z_
_Verifier: Claude (gsd-verifier)_

# Phase 20: merit-ux-shop-pricing-and-streak-ui - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship every user-facing Merit surface and complete the Stripe migration on the frontend:

1. **Merit balance badge** (UX-01) — Persistent TopBar badge showing total Merits, click-to-expand popover with subscription/shop breakdown, reset date, and quick links to Shop/Pricing.
2. **Cost previews** (UX-02) — Inline text above the Analyze button on every feature page: "Costs X Merits · Y remaining". Amber at low balance, disabled at zero with two CTAs.
3. **Low/zero-balance warnings** (UX-03, UX-04) — Amber warning when total Merits < 4 (2x cheapest feature cost). Zero-balance disables Analyze with "Out of Merits" state + Buy Merits / Upgrade Plan CTAs.
4. **`useMerits()` hook** (UX-11) — React Query wrapper over `get_merit_balance` RPC. Replaces `AiCreditsContext` entirely. Refetches on window focus, staleTime 5s.
5. **Pricing page overhaul** (UX-08) — Rewrite `/pricing` with monthly/yearly pill toggle, 3-column plan comparison, savings badges ("Save $17.98" / "Save $33.89"), crossed-out monthly equivalent on yearly, current plan highlighted, Stripe embedded checkout replacing Paddle.
6. **Merit Shop** (UX-05, UX-06, SHOP-05) — Dedicated `/shop` route with sidebar entry. 4 pack cards with "Most Popular" on 25-pack. Per-pack contextual upgrade comparison banners (tier-conditional). Stripe embedded checkout for one-time payments.
7. **Billing page** (UX-07) — New `/settings/billing` route showing current subscription info + shop purchase history table.
8. **Shop receipt email** (SHOP-08) — Webhook-triggered email receipt via `send-strivo-email` after successful shop credit.
9. **PlanComparisonTable update** — Update the existing feature comparison matrix with Merit-specific rows (Merit allowance, feature access by tier, locked sections, streak/quiz access).

Closes: UX-01, UX-02, UX-03, UX-04, UX-05, UX-06, UX-07, UX-08, UX-11, SHOP-05, SHOP-08.

**Out of scope for this phase:**

- Interview Prep Elite UI (UX-09) — already shipped in Phase 19 (D-08)
- Streak display (UX-10) — already shipped in Phase 19 (D-08)
- Stripe webhook handler changes — Phase 12 owns the handler; Phase 20 only adds the receipt email call
- Merit deduction / balance checks backend — Phase 13 (already shipped)
- Tier-gated prompt variants — Phases 14–18 (already shipped)
- Legacy system removal — Phase 21
- Paddle removal — deferred beyond v2.0

</domain>

<decisions>
## Implementation Decisions

### Merit Balance Badge (UX-01)

- **D-01:** The Merit balance badge lives in the **TopBar component** (`src/components/TopBar.tsx`), not the sidebar. A gem/coin icon + total Merit count, always visible on all dashboard pages. Clicking opens a **Radix Popover** showing:
  - Subscription balance and shop balance breakdown
  - Next reset date (for Pro/Elite)
  - Quick links: "Buy Merits" → `/shop`, "Change Plan" → `/pricing`
- **D-02:** The badge updates via the `useMerits()` hook (D-06). After any analysis completes, the query is invalidated for immediate refresh.

### Cost Previews (UX-02)

- **D-03:** Every feature page shows an **inline text line directly above the Analyze button**: "Costs X Merits · Y remaining". Styling:
  - Normal: muted foreground text
  - Low balance (< 2x feature cost): amber text with warning icon
  - Zero balance: red text, "Out of Merits", Analyze button disabled, two CTAs ("Buy Merits" → `/shop`, "Upgrade Plan" → `/pricing`)
- **D-04:** Cost values are read from `merit_feature_costs` via the `useMerits()` hook or a companion query. Each feature page passes its feature key to get the correct cost for the user's tier.

### Low/Zero Balance Warnings (UX-03, UX-04)

- **D-05:** The **global low-balance threshold is 4 Merits** (2x the cheapest standard feature cost of 2 Merits). When total Merits drop below this threshold, the TopBar badge turns amber and the balance popover shows a warning banner with Shop and Upgrade CTAs.
- **D-05b:** Zero-balance state: Analyze button is disabled across all feature pages. The cost preview line shows "Out of Merits" with two CTAs. The TopBar badge shows "0" in red.

### `useMerits()` Hook (UX-11)

- **D-06:** `useMerits()` is a **React Query `useQuery` wrapper** calling the `get_merit_balance` RPC. Configuration:
  - `queryKey: ['merit-balance', userId]`
  - `refetchOnWindowFocus: true`
  - `staleTime: 5_000` (5 seconds, satisfies "eventually consistent within 5s")
  - Returns: `{ total, subscription, shop, resetDate, canAfford(cost), isLow, isZero, isLoading }`
- **D-07:** `useMerits()` **replaces `AiCreditsContext`** entirely. All existing consumers of `AiCreditsContext` (feature pages, `UpgradeModal`, `UsageCounter`, `DashboardHome`) are migrated to `useMerits()`. The old context is removed. `usePaywallGuard` is updated to use `useMerits()`.
- **D-08:** After any analysis completes (success or failure), the calling feature page calls `queryClient.invalidateQueries({ queryKey: ['merit-balance'] })` to force immediate balance refresh.

### Pricing Page Overhaul (UX-08)

- **D-09:** The `/pricing` page is **fully rewritten**. `PricingTable.tsx` is rebuilt to:
  - Show a centered **pill toggle** (Monthly | Yearly) above the 3-column plan grid
  - Monthly view: Free $0 / Pro $8.99/mo / Elite $16.99/mo
  - Yearly view: Free $0 / Pro $89.99/yr ($7.50/mo equivalent, crossed-out $8.99, "Save $17.98" green badge) / Elite $169.99/yr ($14.17/mo equivalent, crossed-out $16.99, "Save $33.89" green badge)
  - Each card shows Merit allowance (5 lifetime / 75/mo / 150/mo)
  - Current plan card gets a highlighted border + "Current Plan" badge
  - Free card CTA: "Sign Up" (if unauthenticated) or "Current Plan" (if Free user)
  - Paid plan CTAs: open Stripe embedded checkout
- **D-10:** Checkout uses **Stripe embedded checkout** (`@stripe/react-stripe-js`). Clicking Subscribe opens an inline payment form on the pricing page. The frontend calls `create-checkout-session` to get a client secret, then renders the Stripe `EmbeddedCheckout` component. User stays on `/pricing` during payment. On success, redirects to `/dashboard`.
- **D-11:** `usePaddleCheckout` is **removed**. All Paddle checkout references are deleted. The Paddle SDK script tag is removed from `index.html` (if present). Paddle client-side code is fully dead after this phase.
- **D-12:** `PlanComparisonTable.tsx` is **updated** with Merit-specific comparison rows: Merit allowance, feature access details per tier, locked section behavior, Interview Prep access (Pro flashcards vs Elite quiz), streak system, and cost-per-feature breakdown.

### Merit Shop (UX-05, UX-06, SHOP-05)

- **D-13:** The Merit Shop lives at a **dedicated `/shop` route** with its own sidebar entry (gem/shop icon). Accessible from: sidebar nav, TopBar balance popover, low/zero-balance CTAs, feature gate CTAs, and `LockedSection` upgrade links.
- **D-14:** The shop page shows **4 pack cards in a responsive grid** (2x2 on mobile, 4x1 on desktop):
  - 3 Merits / $1.99 ($0.66/Merit)
  - 10 Merits / $4.99 ($0.50/Merit)
  - 25 Merits / $9.99 ($0.40/Merit) — "Most Popular" badge
  - 50 Merits / $17.99 ($0.36/Merit)
  - Each card shows: Merit count, price, per-Merit price, Buy button
- **D-15:** **Per-pack contextual upgrade comparison banners** (UX-06):
  - Free user viewing 25-pack: "Pro gives you 75 Merits/month for $8.99 — 3x more for less" with [View Pro] CTA
  - Pro user viewing 50-pack: equivalent Elite pitch with [View Elite] CTA
  - Elite user: no upgrade banners on any pack
  - Banners appear as a styled callout below the specific pack card
- **D-16:** Shop checkout uses the **same Stripe embedded checkout** as subscriptions. Clicking Buy calls `create-checkout-session` with `{ mode: 'payment', pack_size: N }`, gets a client secret, renders inline `EmbeddedCheckout`. On success, shows a success state on the shop page with updated balance.

### Billing Page (UX-07)

- **D-17:** New route at **`/settings/billing`** with a sidebar entry under a Settings group (or directly in the sidebar). Two sections:
  - **Current Plan**: tier name, interval, price, Merit allowance, next renewal/reset date, [Change Plan] → `/pricing`, [Cancel] link (opens Stripe customer portal or confirmation dialog)
  - **Purchase History**: table of shop transactions from `merit_shop_purchases`, columns: date, pack size, amount, status. Sorted newest first. Paginated if > 20 rows.
- **D-18:** The existing `SubscriptionManagement` component in Profile is **simplified or removed** — billing info moves to `/settings/billing`. Profile page retains account details (name, email, password).

### Shop Receipt Email (SHOP-08)

- **D-19:** The receipt email is triggered **inside `stripe-webhook-handler`** immediately after `credit_shop_merits()` succeeds on a `checkout.session.completed` (payment mode) event. The handler calls `send-strivo-email` with a `shop-receipt` template containing: pack size, amount paid, new balance, purchase date, and a "View purchase history" link to `/settings/billing`.
- **D-20:** This is a **minor addition to the Phase 12 webhook handler** — one `fetch()` call to `send-strivo-email` after the existing shop credit path. No structural changes to the handler.

### Stripe Integration

- **D-21:** The new `@stripe/react-stripe-js` package is added as a frontend dependency. A shared `StripeProvider` component wraps any page that needs embedded checkout (Pricing, Shop). The Stripe publishable key comes from a new `VITE_STRIPE_PUBLISHABLE_KEY` env var.
- **D-22:** `create-checkout-session` must be extended to return a `client_secret` (in addition to or instead of the redirect URL) when the frontend requests embedded checkout mode. This may require a minor backend change or the frontend extracts the client secret from the Checkout Session response.

### Claude's Discretion

- Exact TopBar badge styling (icon choice, animation on balance change, popover width)
- Whether the pill toggle uses Radix Tabs or a custom toggle component
- How to handle "Cancel subscription" — Stripe customer portal redirect vs inline confirmation
- Whether purchase history uses React Query infinite scroll or simple pagination
- The exact `shop-receipt` email template HTML/layout
- Whether `StripeProvider` wraps the entire app or only checkout-capable pages
- The exact sidebar icon and label for the Shop entry
- How to handle the transition period where some users may still have Paddle subscriptions (show read-only Paddle info on billing page)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec (Source of Truth)

- `APIcontextdocuments/STRIVO_GSD_Milestone_Merit_System.docx` §7.1 (Merit balance badge, cost previews, low/zero states), §7.4 (Merit Shop UI, pack cards, "Most Popular", upgrade banners), §7.5 (Pricing page, monthly/yearly toggle, savings badges), §5.2 (shop checkout session, email receipt), §5.4 (upgrade comparison banners per tier)

### Requirements

- `.planning/REQUIREMENTS.md` — UX-01..08, UX-11, SHOP-05, SHOP-08 (the 13 REQ-IDs Phase 20 closes)
- `.planning/ROADMAP.md` §"Phase 20: merit-ux-shop-pricing-and-streak-ui" — 10 Success Criteria that VERIFICATION.md must prove TRUE

### Prior Phase Context (MUST read)

- `.planning/phases/12-stripe-products-and-webhook/12-CONTEXT.md` — D-18 (create-checkout-session mode: 'payment' contract), D-21 (SHOP-08 email receipt deferred to Phase 20), D-24 ("Most Popular" badge is Phase 20 UI concern)
- `.planning/phases/13-merit-enforcement-and-feature-flag/13-CONTEXT.md` — D-10 (error codes: 402 insufficient_merits, 429 rate_limit_exceeded — Phase 20 surfaces these), D-06 (MERIT_SYSTEM_ENABLED branching pattern)
- `.planning/phases/14-tier-prompts-and-locked-section-primitive/14-CONTEXT.md` — D-09 (LockedSection/LockedListItem/EliteFeatureGate CTA default is `/pricing` — Phase 20 ships the destination)
- `.planning/phases/19-interview-prep-flashcards-and-quiz/19-CONTEXT.md` — D-08/D-09 (UX-09 and UX-10 already shipped in Phase 19 — Phase 20 does NOT touch Interview Prep or streak display)

### Existing Code to Modify or Replace

- `src/components/TopBar.tsx` — Add Merit balance badge with popover (D-01)
- `src/components/PricingTable.tsx` — Full rewrite: Paddle → Stripe, old credits → Merits, monthly/yearly toggle (D-09)
- `src/components/PlanComparisonTable.tsx` — Update rows for Merit system (D-12)
- `src/contexts/AiCreditsContext.tsx` — Remove entirely, replaced by `useMerits()` hook (D-07)
- `src/hooks/usePaddleCheckout.ts` — Remove entirely (D-11)
- `src/hooks/usePaywallGuard.ts` — Update to use `useMerits()` instead of `AiCreditsContext`
- `src/hooks/useTierAccess.ts` — May need updates for Merit-aware tier checking
- `src/components/SubscriptionManagement.tsx` — Simplify or remove; billing info moves to /settings/billing (D-18)
- `src/components/UpgradeModal.tsx` — Update to reference Merits instead of credits
- `src/components/UsageCounter.tsx` — Replace with Merit-based display or remove
- `src/components/UsageLimitBanner.tsx` — Replace with Merit low-balance warning
- `src/components/DashboardHome.tsx` — Replace `can_perform_ai_action` with `useMerits()` (D-07)
- `src/pages/Pricing.tsx` — Update to use new PricingTable with Stripe
- `src/App.tsx` — Add `/shop` and `/settings/billing` routes, remove AiCreditsContext provider
- `supabase/functions/stripe-webhook-handler/index.ts` — Add receipt email call after shop credit (D-19/D-20)
- All feature pages (Results, CareerCompass, LinkedInGrader, RecruitingLens, SkillsGapAnalysis, Jobs, InterviewPrep) — Add cost preview line + integrate `useMerits()` (D-03)

### Design System

- `CLAUDE.md` § Technology Stack — Radix UI, Tailwind CSS, shadcn/ui, Framer Motion, HSL CSS variables, semantic tokens. All new components must follow "Institutional Intelligence" design system.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`TopBar.tsx`** — Existing top bar component. Merit badge is added here alongside existing theme toggle and profile elements.
- **`PricingTable.tsx`** — Structural template for the rewrite. Layout with 3-column cards + toggle already exists conceptually; content and checkout mechanism change completely.
- **`PlanComparisonTable.tsx`** — Feature comparison matrix. Rows need updating but the table structure is reusable.
- **`UpgradeModal.tsx`** — Upgrade prompts. Needs Merit-aware copy but the modal pattern is reusable.
- **`ProFeatureGate.tsx`** (305 lines) — Free-user gate. Already functional; Phase 20 doesn't modify it but ensures CTAs point to working `/pricing` and `/shop` routes.
- **`LockedSection.tsx` / `LockedListItem.tsx`** — Phase 14 primitives. CTAs default to `/pricing` which Phase 20 now ships.
- **`InterviewStreakDisplay.tsx`** — Already shipped in Phase 19. Phase 20 does not touch this.
- **`send-strivo-email` edge function** — Existing email transport. Phase 20 adds a `shop-receipt` template call.
- **`_shared/rate-limiter.ts`** — SHOP-12 rate limit already enforced in `create-checkout-session` (Phase 12).

### Established Patterns

- **React Query for server state** — `useQuery` / `useMutation` used throughout for data fetching. `useMerits()` follows the same pattern.
- **Supabase RPC for derived data** — `get_merit_balance` RPC (Phase 11) is the data source for `useMerits()`.
- **Semantic design tokens** — HSL CSS variables, `bg-background`, `text-foreground`, etc. All new UI follows this.
- **Sidebar navigation** — `AppSidebar.tsx` with icon + label entries. `/shop` and `/settings/billing` add new entries.
- **Inline cost/status text above action buttons** — Similar to existing upload validation messages on the Upload page.

### Integration Points

- **Phase 12 `create-checkout-session`** — Phase 20 consumes the `mode: 'subscription' | 'payment'` contract for both pricing and shop. May need a minor extension to return `client_secret` for embedded checkout.
- **Phase 12 `stripe-webhook-handler`** — Phase 20 adds the receipt email call after shop crediting.
- **Phase 11 `get_merit_balance` RPC** — Data source for `useMerits()`.
- **Phase 13 error codes** — `402 insufficient_merits` and `429 rate_limit_exceeded` are surfaced in feature page UI.
- **Phase 14 UI primitives** — `LockedSection` / `LockedListItem` / `EliteFeatureGate` CTAs point to `/pricing` (now a working route).
- **Phase 21** — Integration tests verify all Phase 20 surfaces work end-to-end.

</code_context>

<specifics>
## Specific Ideas

- The existing `PricingTable.tsx` uses `usePaddleCheckout` which is completely replaced. The rewrite should not try to incrementally modify the existing component — it's a full rewrite with different checkout mechanism, different pricing data, and different layout (pill toggle + savings badges).
- `AiCreditsContext` removal is load-bearing — every feature page currently imports it. The migration to `useMerits()` must update all consumers in the same plan or the build breaks. This is the highest-risk change in the phase.
- The Stripe embedded checkout requires `@stripe/react-stripe-js` and a publishable key. The `create-checkout-session` edge function currently returns a redirect URL — for embedded checkout it needs to return a `client_secret` from the Checkout Session. This is a minor backend change but must be coordinated.
- The `/shop` page and `/pricing` page both use Stripe embedded checkout but for different modes (payment vs subscription). A shared `useStripeCheckout()` hook could wrap the common logic (call `create-checkout-session`, get client secret, render `EmbeddedCheckout`).
- The receipt email (D-19) is a small addition to the webhook handler — one `fetch()` call. It should NOT block the webhook response; fire-and-forget with error logging.
- Purchase history reads from `merit_shop_purchases` table (Phase 10 schema). The frontend queries this via Supabase client with RLS — users can only see their own purchases.

</specifics>

<deferred>
## Deferred Ideas

- **Paddle subscription management portal** — Paddle subscriptions are honored until renewal but no new Paddle management UI is built. Users with active Paddle subs see read-only info on the billing page. Full Paddle cleanup is post-v2.0.
- **Stripe customer portal integration** — For self-service subscription management (cancel, update payment method). Could be added to `/settings/billing` but not in the spec for Phase 20.
- **Merit transaction history** (beyond shop purchases) — Showing every Merit deduction/refund in a detailed log. Not in spec; would be an admin or power-user feature.
- **Animated balance counter** — Smooth number animation when balance changes. Nice-to-have, not required.
- **Push notifications for low balance** — Browser notifications when Merits drop below threshold. Out of scope.
- **A/B testing pricing page layouts** — Different card arrangements or CTA copy. Future optimization.

</deferred>

---

*Phase: 20-merit-ux-shop-pricing-and-streak-ui*
*Context gathered: 2026-04-17*

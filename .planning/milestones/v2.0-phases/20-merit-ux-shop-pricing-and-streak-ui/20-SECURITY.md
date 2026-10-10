---
phase: 20
slug: merit-ux-shop-pricing-and-streak-ui
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-18
---

# Phase 20 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Frontend -> create-checkout-session | Untrusted ui_mode and pack_size from client; backend resolves Price ID from env vars | Auth JWT, mode/tier/interval/pack_size, ui_mode |
| Stripe -> stripe-webhook-handler | Webhook body is signed; receipt email uses server-side profile data only | Stripe event payload (HMAC-verified), session metadata |
| Client -> Supabase RPC (get_merit_balance) | Authenticated user balance read via RPC; RLS enforces own-record access | userId from JWT, returns balance integers |
| Client -> merit_feature_costs | Read-only public reference table for authenticated users | Feature/tier/cost rows, no PII |
| Client -> merit_shop_purchases | RLS restricts SELECT to user's own records via auth.uid() = user_id | Purchase history rows |
| Stripe iframe -> Strivo page | EmbeddedCheckout runs in Stripe-hosted iframe; no card data touches our frontend | Client secret only |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-20-01 | Tampering | create-checkout-session ui_mode | mitigate | Strict equality check `body.ui_mode === "embedded"` (lines 78, 91, 234, 288) — any other value falls through to the existing redirect flow. Price ID resolution unchanged. | closed |
| T-20-02 | Information Disclosure | shop_receipt email metadata | mitigate | Email looked up from `profiles` table by userId (server-side), not from request body (`stripe-webhook-handler/index.ts` lines 507-511). Pack size and amount from Stripe session object. | closed |
| T-20-03 | Denial of Service | receipt email fetch blocking webhook | mitigate | `fetch()` is fire-and-forget (not awaited); `.catch()` logs errors silently (`stripe-webhook-handler/index.ts` lines 513-537). Webhook returns 200 immediately. | closed |
| T-20-04 | Tampering | useMerits balance | accept | Balance is read-only from server via RPC; no client-side write path exists (NFR-03). | closed |
| T-20-05 | Spoofing | useMerits userId | mitigate | `userId` derived from `supabase.auth.getUser()` and `onAuthStateChange` (server-validated JWT) at `src/hooks/useMerits.ts` lines 22, 25 — not from URL or localStorage. | closed |
| T-20-06 | Information Disclosure | useFeatureCosts | accept | `merit_feature_costs` is intentionally public to authenticated users; contains no PII (feature, tier, cost rows only). | closed |
| T-20-07 | Tampering | MeritCostPreview disabled state | accept | Client-side disable is UX only; server-side `check-and-deduct-merits` RPC enforces actual deduction (Phase 13). Client bypass has no security effect. | closed |
| T-20-08 | Information Disclosure | MeritBalanceBadge popover | accept | Balance data is the user's own data, protected by RLS. No PII exposure. | closed |
| T-20-09 | Tampering | Price display vs actual charge | accept | Displayed prices are static constants matching Stripe Price objects; actual charge resolved server-side by Price ID. Display mismatch has no security impact. | closed |
| T-20-10 | Information Disclosure | VITE_STRIPE_PUBLISHABLE_KEY | accept | Stripe publishable keys are designed to be public; cannot be used for server-side operations. | closed |
| T-20-11 | Spoofing | Unauthenticated checkout | mitigate | `create-checkout-session` requires `requireAuth({type:'user'})` (lines 35, 138-144). CTA buttons gated by auth state. | closed |
| T-20-12 | Tampering | pack_size in checkout request | mitigate | `create-checkout-session` validates `pack_size` via `isPackSize()` against PACK_SIZES (3/10/25/50); invalid values return 400 (lines 187-189). Price ID resolved server-side from env vars (line 282). | closed |
| T-20-13 | Denial of Service | Rapid Buy clicks | mitigate | SHOP-12 second rate limit (`create-checkout-session-shop`) capped at 10/hour across all tiers (lines 176-185). Frontend disables button during loading state. | closed |
| T-20-14 | Information Disclosure | Purchase history | mitigate | RLS policy `merit_shop_purchases_select_own` restricts SELECT to `auth.uid() = user_id` (`20260414000000_merit_ledger_foundation.sql` lines 78-80). Frontend uses authenticated Supabase client. | closed |
| T-20-15 | Information Disclosure | Paddle subscription IDs | accept | `paddle_customer_id` and `paddle_subscription_id` displayed read-only to the owning user; no external API calls made with these values. | closed |
| T-20-16 | Repudiation | Paddle script removal | accept | Paddle subscriptions remain honored via existing webhook handler; only client-side Paddle SDK removed from `index.html`. No functional regression. | closed |
| T-20-17 | Tampering | UpgradeModal Stripe flow | mitigate | UpgradeModal uses `useStripeCheckout` (`src/components/UpgradeModal.tsx` lines 6, 26) which routes through `create-checkout-session` (requireAuth + server-side Price ID resolution — same controls as T-20-11). | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-20-04 | T-20-04 | Balance is read-only from server via RPC; no client-side write path exists (NFR-03). Tampering with the client-side `useMerits` value has no effect on actual balance enforcement. | Phase 20 planner | 2026-04-18 |
| AR-20-06 | T-20-06 | `merit_feature_costs` is intentionally public to authenticated users; contains no PII (feature, tier, cost rows only). Cost transparency is a product requirement. | Phase 20 planner | 2026-04-18 |
| AR-20-07 | T-20-07 | Client-side disable on `MeritCostPreview` is UX only; server-side `check-and-deduct-merits` RPC enforces actual deduction (Phase 13). Client bypass has no effect on the authoritative balance. | Phase 20 planner | 2026-04-18 |
| AR-20-08 | T-20-08 | `MeritBalanceBadge` popover shows the user's own balance data, protected by RLS. No PII or cross-user data is exposed. | Phase 20 planner | 2026-04-18 |
| AR-20-09 | T-20-09 | Displayed prices are static constants matching Stripe Price objects; actual charge resolved server-side by Price ID. Display mismatch has no security impact (worst case is user confusion, not financial loss). | Phase 20 planner | 2026-04-18 |
| AR-20-10 | T-20-10 | Stripe publishable keys are designed to be public; they cannot be used for server-side operations. Embedding in frontend bundle is the documented Stripe pattern. | Phase 20 planner | 2026-04-18 |
| AR-20-15 | T-20-15 | `paddle_customer_id` and `paddle_subscription_id` displayed read-only to the owning user (RLS-protected); no external API calls made with these values. Legacy support only. | Phase 20 planner | 2026-04-18 |
| AR-20-16 | T-20-16 | Paddle subscriptions remain honored via existing webhook handler (kept in place); only the client-side Paddle SDK script tag was removed from `index.html`. No functional regression for legacy customers. | Phase 20 planner | 2026-04-18 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-18 | 17 | 17 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-18

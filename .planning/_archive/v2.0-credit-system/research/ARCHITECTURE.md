# Architecture Research

**Domain:** AI career platform — Stripe migration, AI feature overhaul, navbar redesign, security hardening
**Researched:** 2026-04-11
**Confidence:** HIGH — all findings from direct codebase inspection

---

## Key Findings

### 1. Two Navbar Components — Wrong One Is Canonical

`Navbar.tsx` (226 lines) is used by all 15+ authenticated app pages. It is a plain horizontal button row — no responsive design, no dark mode toggle, hardcoded inline colors. `MinimalNavbar.tsx` (507 lines) is used on 6 public pages and is the correctly designed component — responsive hamburger, avatar dropdown, ThemeToggle, scroll-aware glass effect, semantic design tokens. The fix is to retire `Navbar.tsx` and extend `MinimalNavbar.tsx`.

### 2. `grade-linkedin` Has a Broken Auth Pattern

Line 28 instantiates its own Supabase client from raw env vars instead of `getServiceClient()`. `requireAuth` is imported but never called for the user path — `userId` is read from the request body and trusted directly. Any caller can impersonate any user. Must be fixed when v3.0 spec work is done.

### 3. `interview-prep-coach` Uses Wrong Usage Action Type

Line 58 calls `checkAndRecordUsage(userId, 'skills_gap_analysis')`. There is no `'interview_prep'` entry in the `ActionType` union. Interview prep usage is silently counted against the skills gap budget. Fix requires: 1) DB migration to add enum value, 2) 1-line edge function edit.

### 4. Stripe Webhook Is a Near-Direct Port of Paddle

Same pattern: `req.text()` before parsing, HMAC-SHA256 with `timingSafeEqual`, idempotency via unique `event_id` constraint, price-ID-to-tier mapping from env vars. Only the header format differs (`stripe-signature` / `t=ts,v1=hash` vs `paddle-signature` / `ts=ts;h1=hash`).

### 5. Database Migration Is Additive

Add `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id` to `profiles`. Add `stripe_webhook_events` table. Keep Paddle columns until subscriptions expire. `subscription_tier`, `subscription_status`, `current_period_end` are payment-agnostic and stay unchanged.

---

## Component Boundaries

### Frontend → Edge Functions

```
React SPA
  Navbar/MinimalNavbar ──→ profiles table (subscription_tier, full_name, credits)
  Feature Pages ─────────→ supabase.functions.invoke(fn, { Authorization: Bearer JWT })
  AiCreditsContext ──────→ reads 402/429 metadata, stores in localStorage
  UpgradeModal ──────────→ create-stripe-checkout (proposed) → Stripe Checkout redirect
  SubscriptionMgmt ──────→ create-stripe-portal (proposed) → Stripe Billing Portal redirect
```

### Edge Function Request Path

```
requireAuth({ type: 'user' }) → supabase.auth.getUser(JWT)
checkRateLimit(userId, tier, config) → increment_rate_limit RPC
checkAndRecordUsage(userId, actionType) → can_perform_ai_action → record_ai_usage
sanitizeMessages(messages)
invokeAnthropicText({ model, system, messages, maxTokens })
repairTruncatedJSON(text) → JSON.parse()
return Response(JSON, corsHeaders({ type: 'user' }))
```

### Stripe Webhook (Incoming)

```
Stripe → POST /stripe-webhook
  rawBody = req.text()  ← MUST be before any parsing
  verifyStripeSignature(rawBody, stripe-signature header, STRIPE_WEBHOOK_SECRET)
  idempotency check → stripe_webhook_events.event_id UNIQUE constraint
  route on event.type:
    customer.subscription.created/updated → profiles.subscription_tier = tierFromPriceId
    customer.subscription.deleted → profiles.subscription_status = 'canceled'
    invoice.payment_failed → profiles.subscription_status = 'past_due'
  return 200 always (Stripe retries on non-200)
```

---

## Build Order (Dependency-Driven)

1. **Navbar unification** — Extend `MinimalNavbar.tsx`, swap all 15+ imports, delete `Navbar.tsx`. Pure frontend. Unblocks dark mode fixes.

2. **Interview Prep Coach** — Fix action type enum, switch to Claude model, fix dark mode (resolved by navbar unification), spec 8-question JSON output.

3. **LinkedIn Grader** — Fix auth (`requireAuth`), apply v3.0 spec (scoring, feedback depth, rewrites). Auth fix ships with spec work.

4. **Recruiting Lens** — Targeted bug fix for resume detection. No structural changes.

5. **Stripe migration** — Schema migration → webhook function → checkout session → portal session → frontend pricing/billing UI → Paddle cleanup. Fully additive to schema.

6. **Security audit** — Terminal phase. Covers all new code including Stripe webhook, fixed auth, unified navbar.

---

## Open Questions

- Whether existing Paddle subscribers need a migration strategy or will be grandfathered until expiry
- Whether `grade-linkedin` frontend already sends JWT (determines if backend auth fix breaks the UI)
- Stripe price IDs must be created in Stripe dashboard before code can reference them (human blocker)

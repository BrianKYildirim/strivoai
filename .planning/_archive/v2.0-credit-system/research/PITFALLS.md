# Domain Pitfalls

**Domain:** AI career platform — Stripe migration, AI feature overhaul, navbar redesign, Supabase security hardening
**Researched:** 2026-04-11
**Confidence:** HIGH — all pitfalls grounded in direct codebase evidence

---

## Critical Pitfalls

### Pitfall 1: Client-Side Subscription Tier Promotion (ACTIVE BUG)

**What goes wrong:** `usePaddleCheckout.ts` `successCallback` (lines 131-145) directly writes `subscription_tier` to `profiles` from the browser. The Stripe replacement must NOT replicate this — a spoofed success callback can promote users to Elite without paying.

**Prevention:** The Stripe webhook handler must be the ONLY writer of `subscription_tier`. Frontend polls profile after redirect, never writes tier directly.

**Detection:** Search for `.update({ subscription_tier: ... })` calls from browser code.

**Phase:** Stripe migration.

### Pitfall 2: Orphaned Paddle Columns Poisoning Stripe Schema

**What goes wrong:** If Stripe columns are added without updating frontend references, `SubscriptionManagement` still reads empty `paddle_customer_id` for new Stripe subscribers, breaking the "Manage Billing" button.

**Prevention:** Update `SubscriptionManagement.tsx` to use Stripe columns in the same PR as schema change. Deregister Paddle webhook endpoint before deploying Stripe handler.

**Phase:** Stripe migration.

### Pitfall 3: Missing `interview_prep` Enum Value (ACTIVE BUG)

**What goes wrong:** `interview-prep-coach/index.ts` line 58 calls `checkAndRecordUsage(userId, 'skills_gap_analysis')`. The `ai_action_type` enum lacks `interview_prep`. Usage is misattributed.

**Prevention:** Write migration `ALTER TYPE public.ai_action_type ADD VALUE IF NOT EXISTS 'interview_prep'` before deploying the edge function update.

**Phase:** Interview Prep Coach overhaul.

### Pitfall 4: Stripe Webhook Raw Body Destruction

**What goes wrong:** Calling `req.json()` before `req.text()` destroys the raw bytes needed for HMAC verification. All webhooks fail signature check.

**Prevention:** Always `req.text()` first, then `JSON.parse(rawBody)`. Mirror `paddle-webhook/index.ts` pattern exactly.

**Phase:** Stripe migration.

### Pitfall 5: RLS `USING (true)` on Webhook Events Table (ACTIVE BUG)

**What goes wrong:** `paddle_webhook_events` has `USING (true)` policy — any authenticated user can read all webhook event records including payment data.

**Prevention:** For `stripe_webhook_events`, enable RLS with zero policies (service_role only). Drop the permissive policy on `paddle_webhook_events` in security audit.

**Phase:** Stripe migration + Security audit.

---

## Moderate Pitfalls

### Pitfall 6: Navbar Component Proliferation

**What goes wrong:** `MinimalNavbar.tsx` is used on 6 pages (HowItWorks, Pricing, Privacy, Terms, Questions, Refund). A redesign that only updates `Navbar.tsx` leaves those pages inconsistent.

**Prevention:** Unify into one component. Audit `grep -r "MinimalNavbar" src/pages/` before closing navbar phase.

**Phase:** Navbar redesign.

### Pitfall 7: AI Model Hard-Coding vs. Environment Variable Override

**What goes wrong:** Both functions sharing `ANTHROPIC_MODEL_TEXT` env var — changing it for one changes all.

**Prevention:** Feature-specific env vars (`ANTHROPIC_MODEL_LINKEDIN`, `ANTHROPIC_MODEL_INTERVIEW_PREP`) with spec-compliant fallbacks.

**Phase:** LinkedIn Grader and Interview Prep Coach phases.

### Pitfall 8: Stripe Customer Portal Requires Server-Side Session

**What goes wrong:** Current Paddle billing uses a static portal URL. Stripe requires a server-side `billingPortal.sessions.create()` call per session.

**Prevention:** New `create-stripe-portal` edge function. Configure portal at dashboard.stripe.com early.

**Phase:** Stripe migration.

### Pitfall 9: `can_perform_ai_action` Does Not Scope by Action Type

**What goes wrong:** The function counts all credits across all action types. Per-feature limits rely on `checkRateLimit` as a secondary check.

**Prevention:** Verify both `checkRateLimit` AND `checkAndRecordUsage` are called in sequence for Interview Prep Coach.

**Phase:** Interview Prep Coach overhaul.

### Pitfall 10: Stripe Price ID Coupling in Frontend and Backend

**What goes wrong:** Price IDs hardcoded in both frontend and backend — missing either one after migration causes failures.

**Prevention:** Store in env vars: `STRIPE_PRICE_*` for backend, `VITE_STRIPE_PRICE_*` for frontend. Never hardcode.

**Phase:** Stripe migration.

---

## Minor Pitfalls

### Pitfall 11: Paddle CDN Script Left in `index.html`

Dead weight after migration. Remove in same PR as Stripe migration.

### Pitfall 12: Dark Mode CSS Token vs. Hard-Coded Color Regression

Interview Prep Coach spec uses raw Tailwind classes (`bg-indigo-500/10`). Verify adequate contrast in both light and dark modes.

### Pitfall 13: `SECURITY DEFINER` Functions Without `SET search_path`

New `SECURITY DEFINER` functions must include `SET search_path = public`. Existing pattern is correct — enforce in review.

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation |
|-------|---------------|------------|
| Stripe — webhook | Raw body consumed before HMAC | `req.text()` before JSON parsing |
| Stripe — schema | Orphaned Paddle columns / permissive RLS | Migration adds Stripe, frontend updated in same PR |
| Stripe — frontend | Client-side tier promotion | Frontend polls profile, no `profiles.update` in browser |
| Interview Prep Coach | `interview_prep` enum missing | Add enum migration first |
| LinkedIn Grader | Shared `ANTHROPIC_MODEL_TEXT` env var | Feature-specific env var |
| Navbar | `MinimalNavbar` not updated | Audit all pages using MinimalNavbar |
| Security | `paddle_webhook_events` `USING (true)` | Drop permissive policy |

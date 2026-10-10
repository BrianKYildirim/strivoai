# Stack Research

**Domain:** AI career platform — Stripe migration, AI feature overhaul, navbar redesign, Supabase security hardening
**Researched:** 2026-04-11
**Confidence:** HIGH — all findings based on direct codebase inspection + stable, well-documented vendor APIs

---

## Stripe Integration

| Component | Recommendation | Confidence |
|-----------|---------------|------------|
| Frontend checkout | Server-side Checkout Session creation (new `create-checkout-session` edge function) → `window.location.href = sessionUrl` redirect | HIGH |
| Webhook verification | `crypto.subtle` HMAC-SHA256 + `timingSafeEqual` — mirrors existing paddle-webhook pattern exactly | HIGH |
| Webhook events to handle | `customer.subscription.created`, `.updated`, `.deleted`, `invoice.payment_failed`, `checkout.session.completed` | HIGH |
| Frontend library | None needed — no Stripe.js, no Elements, no publishable key in frontend for redirect flow | HIGH |
| DB migration | Add `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id` columns; add `stripe_webhook_events` table; keep Paddle columns until subscriptions expire | HIGH |
| Secrets | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, 4 price ID env vars (pro/elite x monthly/annual) | HIGH |
| What to remove | `cdn.paddle.com` script tag from `index.html`, `usePaddleCheckout.ts`, hardcoded `PADDLE_CLIENT_TOKEN` | HIGH |

**No SDK needed.** The `paddle-webhook` implementation already uses the exact pattern needed for Stripe — raw `req.text()`, `crypto.subtle` HMAC-SHA256, `timingSafeEqual`. Stripe's `Stripe-Signature` header uses `t=timestamp,v1=hmac_hex` format. Same algorithm, different header format.

## Responsive Navbar

| Component | Recommendation | Confidence |
|-----------|---------------|------------|
| Foundation | `MinimalNavbar.tsx` — extend, don't rewrite | HIGH |
| Mobile menu | `Popover` + `PopoverContent` (already in place) | HIGH |
| Desktop links | `NavigationMenu` with `rounded-full` active pill (already in place) | HIGH |
| Profile dropdown | `DropdownMenu` + `Avatar` (already in place) | HIGH |
| New links to add | Interview Prep Coach (`/interview-prep`), verify Skills Gap and Job Match routing | HIGH |
| Consistency fix | Single mount point — remove per-page navbar usage, retire `Navbar.tsx` | HIGH |
| No new libraries | shadcn/ui Radix primitives cover all patterns | HIGH |

## Claude API / Structured JSON

| Decision | Recommendation | Confidence |
|----------|---------------|------------|
| Pattern | Existing `invokeAnthropicText` wrapper — no changes needed | HIGH |
| Interview Prep Coach model | `claude-haiku-4-5-20251001` | HIGH |
| LinkedIn Grader model | `claude-haiku-4-5-20251001` | HIGH (v3.0 spec requirement) |
| Temperature | 0.7 for Interview Prep (creative variation), 0.3 for LinkedIn Grader (deterministic scoring) | MEDIUM |
| JSON reliability | Explicit schema in system prompt + `repairTruncatedJSON` fallback (already in place) | HIGH |

## Security Audit

| Area | Tool / Method | Known Finding |
|------|--------------|---------------|
| Auth bypass | grep for missing `requireAuth` calls | `grade-linkedin/index.ts` reads `userId` from body without JWT verification |
| Hardcoded secrets | grep for `sk_live`, `sk_test`, `pri_`, `live_` | `PADDLE_CLIENT_TOKEN` hardcoded in `usePaddleCheckout.ts` |
| XSS | grep for `dangerouslySetInnerHTML`, `innerHTML`, `rehypeRaw` | Not yet inspected |
| SQL injection | PostgREST parameterizes all queries; verify no manual SQL | Low risk given architecture |
| Env var leakage | grep for `VITE_` in edge functions | Not yet inspected |
| Deno stdlib | Standardize on `0.224.0` — currently split between `0.168.0` and `0.224.0` | Maintenance risk |

## What NOT to Use

- `stripe` npm package in Deno edge functions — raw `fetch` + `crypto.subtle` matches existing pattern
- `@stripe/react-stripe-js` or `@stripe/stripe-js` — not needed for Checkout Session redirect
- Any new navbar library (React Aria, Headless UI) — shadcn/ui covers all patterns
- Anthropic `tool_use` / function calling — existing raw JSON approach works across 6+ features
- Snyk/Semgrep for security audit — risk surface is codebase-specific, targeted grep + manual review is better

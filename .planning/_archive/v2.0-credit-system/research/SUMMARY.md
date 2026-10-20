# Project Research Summary

**Project:** Strivo AI — Platform Overhaul (Stripe Migration, AI Feature Overhaul, Navbar Redesign, Security Hardening)
**Researched:** 2026-04-11
**Confidence:** HIGH

## Executive Summary

This milestone delivers five coordinated workstreams on an existing Vite + React + Supabase Edge Functions platform: (1) unify the navbar around `MinimalNavbar.tsx`, (2) overhaul Interview Prep Coach, (3) ship LinkedIn Grader v3.0, (4) migrate payments from Paddle to Stripe, and (5) run a full security audit. All findings come from direct codebase inspection against stable, well-documented vendor APIs — no speculative technology choices. The stack is already established; all work extends or corrects existing patterns.

## Key Findings

### Recommended Stack

No new dependencies required. The Stripe webhook is a near-direct port of the existing `paddle-webhook` — same `req.text()` → HMAC-SHA256 → `timingSafeEqual` → idempotency flow. Frontend checkout is a server-side Checkout Session redirect. AI feature work uses the existing `invokeAnthropicText` wrapper.

**Core technologies:**
- `MinimalNavbar.tsx` — extend, don't rewrite; `Navbar.tsx` is the legacy holdover to retire
- `claude-haiku-4-5-20251001` — target model for Interview Prep Coach and LinkedIn Grader
- Raw `fetch` + `crypto.subtle` for Stripe — no SDK, matches existing Paddle pattern
- Two new edge functions: `create-checkout-session` + `create-stripe-portal`
- Deno stdlib `0.224.0` — standardize (currently split between `0.168.0` and `0.224.0`)

### Table Stakes

- **Interview Prep Coach:** JD-driven 8-question generation, STAR outlines, category filters, indigo branding, Pro/Elite gate
- **LinkedIn Grader v3.0:** 4-section scoring (0-100), min 3-4 feedback points per section, 4 paste-ready rewrites, honest calibration
- **Navbar:** All 5 feature links, profile dropdown, dark mode toggle, hamburger menu, consistent across ALL pages
- **Stripe:** Checkout (Pro/Elite x monthly/annual), webhook updating tier, Customer Portal, full Paddle removal

### Watch Out For

1. **Client-side tier promotion** — `usePaddleCheckout.ts` writes tier from browser; Stripe must NOT replicate this
2. **Raw body destruction** — `req.json()` before `req.text()` destroys HMAC verification bytes
3. **`interview_prep` enum missing** (active bug) — DB migration must land before edge function update
4. **`grade-linkedin` auth bypass** (active bug) — `userId` trusted from request body without JWT
5. **Permissive RLS on `paddle_webhook_events`** — `USING (true)` exposes payment records

### Suggested Build Order

1. Navbar Unification → 2. Interview Prep Coach → 3. LinkedIn Grader v3.0 → 4. Recruiting Lens Fix → 5. Stripe Migration → 6. Security Audit

### Gaps to Address

- Paddle subscriber migration strategy (business decision)
- Verify `grade-linkedin` frontend sends JWT before backend auth fix ships
- Stripe price IDs must be created in dashboard (human blocker)
- Stripe Customer Portal must be configured in dashboard
- `VITE_*` env var leakage and XSS surface uninspected until security audit

Files: `.planning/research/`

---
phase: 20-merit-ux-shop-pricing-and-streak-ui
plan: 01
subsystem: api
tags: [stripe, embedded-checkout, edge-functions, email, webhook]

# Dependency graph
requires:
  - phase: 12-stripe-products-and-webhook
    provides: "create-checkout-session edge function, stripe-webhook-handler with shop credit path, send-strivo-email with 7 email types"
provides:
  - "create-checkout-session embedded mode returning clientSecret for Stripe Embedded Checkout"
  - "shop_receipt email template in send-strivo-email"
  - "Fire-and-forget receipt email call in stripe-webhook-handler after shop crediting"
affects: [20-04-pricing-page, 20-05-merit-shop]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Embedded checkout branch: ui_mode === 'embedded' returns clientSecret + uses return_url instead of success_url/cancel_url"
    - "Fire-and-forget email pattern: non-awaited fetch() with .catch() for error logging"

key-files:
  created: []
  modified:
    - supabase/functions/create-checkout-session/index.ts
    - supabase/functions/send-strivo-email/index.ts
    - supabase/functions/stripe-webhook-handler/index.ts

key-decisions:
  - "Embedded subscription checkout returns to /dashboard?checkout=complete; shop returns to /shop?checkout=complete"
  - "Receipt email profile lookup is a separate query (not reusing webhook chain lookup) for clean separation"
  - "ui_mode only accepts literal 'embedded'; any other value falls through to existing redirect flow (T-20-01 mitigation)"

patterns-established:
  - "Embedded checkout: ui_mode field on CheckoutBody controls session creation and response shape"
  - "Fire-and-forget email: fetch() without await, .catch() logging, after critical DB writes complete"

requirements-completed: [SHOP-05, SHOP-08]

# Metrics
duration: 4min
completed: 2026-04-18
---

# Phase 20 Plan 01: Backend Edge Function Extensions Summary

**Embedded checkout mode for create-checkout-session with clientSecret response, shop_receipt email template, and fire-and-forget receipt email call in webhook handler**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-18T01:42:23Z
- **Completed:** 2026-04-18T01:46:02Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- create-checkout-session now supports both redirect mode (existing, unchanged) and embedded mode (new, returns clientSecret) for both subscription and payment checkout flows
- send-strivo-email handles the shop_receipt email type with pack size, amount paid, date, and billing link
- stripe-webhook-handler fires a receipt email after shop crediting without blocking the webhook response to Stripe

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend create-checkout-session for embedded mode** - `b0c24d8` (feat)
2. **Task 2: Add shop_receipt email template and webhook receipt email call** - `215bedc` (feat)

## Files Created/Modified
- `supabase/functions/create-checkout-session/index.ts` - Added ui_mode?: "embedded" to CheckoutBody, embedded session creation with return_url for both subscription and payment, returns clientSecret instead of url when embedded
- `supabase/functions/send-strivo-email/index.ts` - Added 'shop_receipt' to EmailType union and case with Merit Purchase template showing pack size, amount, date, and View Purchase History CTA
- `supabase/functions/stripe-webhook-handler/index.ts` - Added fire-and-forget receipt email fetch after credit_shop_merits succeeds, with profile lookup for email/full_name and .catch() error logging

## Decisions Made
- Embedded subscription checkout uses `return_url` pointing to `/dashboard?checkout=complete&session_id={CHECKOUT_SESSION_ID}` while embedded payment checkout returns to `/shop?checkout=complete&session_id={CHECKOUT_SESSION_ID}` -- matches frontend expectations from Plans 04/05
- Receipt email does a targeted profile lookup (`email, full_name`) rather than reusing the webhook chain's resolved profile data, ensuring email address comes from server-side profile table only (T-20-02 mitigation)
- The `ui_mode` field uses strict equality check (`=== "embedded"`) so any other value silently falls through to the existing redirect flow, preventing tampering (T-20-01 mitigation)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required. The `VITE_STRIPE_PUBLISHABLE_KEY` env var noted in the plan frontmatter is a frontend concern for Plans 04/05, not this backend plan.

## Next Phase Readiness
- Backend is ready for Plans 04 (Pricing page) and 05 (Merit Shop) to consume the embedded checkout clientSecret response
- The shop_receipt email template is ready for production -- will be triggered automatically by the webhook after any shop purchase
- Existing redirect checkout flow remains fully functional for any callers that do not pass ui_mode

## Self-Check: PASSED

- All 3 modified files exist on disk
- Both task commits (b0c24d8, 215bedc) found in git log
- SUMMARY.md exists at expected path

---
*Phase: 20-merit-ux-shop-pricing-and-streak-ui*
*Completed: 2026-04-18*

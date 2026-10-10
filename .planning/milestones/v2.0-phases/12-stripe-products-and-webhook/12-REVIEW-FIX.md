---
phase: 12-stripe-products-and-webhook
fixed_at: 2026-04-16T19:10:00Z
review_path: .planning/phases/12-stripe-products-and-webhook/12-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 12: Code Review Fix Report

**Fixed at:** 2026-04-16T19:10:00Z
**Source review:** .planning/phases/12-stripe-products-and-webhook/12-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: Unchecked profile update errors in subscription.updated router

**Files modified:** `supabase/functions/stripe-webhook-handler/index.ts`
**Commit:** 6646ee5
**Applied fix:** Captured the `{ error }` return value from all four `supabase.from("profiles").update(...)` calls in the `customer.subscription.updated` router branch (pending downgrade to free, upgrade tier write, downgrade pending write, same-tier write). Each now logs the error with a descriptive tag and returns `jsonResponse({ error: "profile_update_failed" }, 500)` so Stripe retries instead of silently losing the write.

### WR-02: Stripe API call in invoice.payment_succeeded path lacks specific error handling

**Files modified:** `supabase/functions/stripe-webhook-handler/index.ts`
**Commit:** a293075
**Applied fix:** Wrapped `stripe.subscriptions.retrieve(subId)` in a dedicated try/catch block. On failure, the handler logs the Stripe error, deletes the idempotency record from `stripe_webhook_events` so the next Stripe retry can re-execute the full merit grant path, and returns 500.

### WR-03: Duplicate addOneMonth logic across two files

**Files modified:** `supabase/functions/_shared/date-utils.ts`, `supabase/functions/stripe-webhook-handler/index.ts`, `supabase/functions/reset-subscription-merits/index.ts`
**Commit:** 523d4c0
**Applied fix:** Created `supabase/functions/_shared/date-utils.ts` with a unified `addOneMonthIso(from: Date | string): string` function that accepts both Date objects and ISO strings. Removed the local `addOneMonthIso` from `stripe-webhook-handler/index.ts` and the local `addOneMonth` from `reset-subscription-merits/index.ts`, replacing both with imports from the shared utility. Updated the call site in reset-subscription-merits from `addOneMonth(...)` to `addOneMonthIso(...)`.

---

_Fixed: 2026-04-16T19:10:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

***

phase: 12-stripe-products-and-webhook
reviewed: 2026-04-16T18:45:00Z
depth: standard
files\_reviewed: 10
files\_reviewed\_list:

* supabase/functions/stripe-webhook-handler/index.ts
* supabase/functions/stripe-webhook-handler/index.test.ts
* supabase/functions/reset-subscription-merits/index.ts
* supabase/functions/reset-subscription-merits/index.test.ts
* supabase/functions/create-checkout-session/index.ts
* supabase/functions/create-checkout-session/index.test.ts
* supabase/functions/\_shared/price-resolver.ts
* supabase/functions/\_shared/shop-pack-resolver.ts
* scripts/provision-stripe-products.mjs
* scripts/provision-stripe-coupon.mjs
  findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
  status: issues\_found

***

# Phase 12: Code Review Report

**Reviewed:** 2026-04-16T18:45:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues\_found

## Summary

This is a second-pass review of the Phase 12 Stripe products and webhook handling code, after prior critical issues (CR-01: stale tier read-before-write, CR-02: RPC privilege escalation) and several warnings (month-end date drift, unchecked DB errors, current\_period\_end nulling, placeholder tests) were resolved in commits ef03f8b through d58c81f. The codebase is in substantially better shape: signature verification is correct, idempotency via insert-first with 23505 catch is sound, the profile lookup fallback chain properly returns 500 on DB errors, the subscription.updated handler correctly defers tier writes to read the old tier, and all 15 webhook tests contain real behavioral assertions. Three warning-level issues remain around missing error handling for profile writes in the router section, and three informational items cover code duplication and minor test hygiene.

## Warnings

### WR-01: Unchecked profile update errors in subscription.updated router

**File:** `supabase/functions/stripe-webhook-handler/index.ts:588-638`
**Issue:** Four `await supabase.from("profiles").update(...)` calls in the `customer.subscription.updated` router branch discard their return values, silently ignoring any database errors. These writes handle critical state: `pending_downgrade_tier` (lines 588-591, 623-626), `subscription_tier` after upgrade (lines 612-615), and same-tier writes (lines 634-637). If any of these writes fail due to a transient database error, constraint violation, or network timeout, the handler returns HTTP 200 to Stripe, signaling successful processing. Stripe will not retry, and the profile state becomes permanently inconsistent -- for example, an upgrade may grant differential Merits via the RPC but fail to update the tier, leaving the user on the old tier with bonus credits.

**Fix:** Capture the error from each update call and return 500 on failure so Stripe retries:

```TypeScript
const { error: updateErr } = await supabase
  .from("profiles")
  .update({ subscription_tier: newTier })
  .eq("id", resolvedUserId);
if (updateErr) {
  log.error("profile-tier-write-failed", {
    eventId: event.id,
    code: (updateErr as { code?: string }).code,
  });
  return jsonResponse({ error: "profile_update_failed" }, 500);
}
```

### WR-02: Stripe API call in invoice.payment\_succeeded path lacks specific error handling

**File:** `supabase/functions/stripe-webhook-handler/index.ts:526`
**Issue:** `stripe.subscriptions.retrieve(subId)` is called within the outer try/catch block (line 438). If this Stripe API call fails (rate limit, network timeout, deleted subscription), the generic catch at line 644 returns `{ error: "router_failed" }` with a 500 status. While the 500 will trigger Stripe retry, the issue is that by the time this code runs, the profile has already been updated via the lookup chain (updateData was written). If the Stripe API call fails and the webhook retries, the idempotency check will return "duplicate" at line 175, and the merit grant will never execute. The profile update was already applied (with no tier or merit changes for invoice events, just `updated_at`), but the actual merit reset is skipped on retry.

This is mitigated by the fact that `invoice.payment_succeeded` sets no significant fields in `updateData` (only `updated_at` and identifier references), so the partial state is not harmful. However, the merit grant is permanently lost if the Stripe API is temporarily unavailable.

**Fix:** Move the `stripe.subscriptions.retrieve` call before the idempotency insert, or catch the Stripe error specifically and delete the idempotency record to allow retry:

```TypeScript
// Option A: more specific error handling
try {
  const sub = await stripe.subscriptions.retrieve(subId);
  // ...
} catch (stripeErr) {
  log.error("stripe-retrieve-failed", {
    eventId: event.id,
    subId,
    message: stripeErr instanceof Error ? stripeErr.message : "unknown",
  });
  // Delete the idempotency record so Stripe can retry successfully
  await supabase.from("stripe_webhook_events").delete().eq("event_id", event.id);
  return jsonResponse({ error: "stripe_api_failed" }, 500);
}
```

### WR-03: Duplicate addOneMonth logic across two files

**File:** `supabase/functions/stripe-webhook-handler/index.ts:55-64` and `supabase/functions/reset-subscription-merits/index.ts:40-49`
**Issue:** The `addOneMonthIso` (webhook handler) and `addOneMonth` (reset-subscription-merits) functions implement identical month-addition logic with the same edge-case clamping. They differ only in their input types (Date vs ISO string). This violates the project's `_shared/` utility pattern established for cross-function code reuse. Any future fix to one copy risks missing the other.

**Fix:** Extract a shared utility to `supabase/functions/_shared/date-utils.ts`:

```TypeScript
export function addOneMonthIso(from: Date | string): string {
  const d = typeof from === "string" ? new Date(from) : new Date(from.getTime());
  const targetMonth = (d.getUTCMonth() + 1) % 12;
  d.setUTCMonth(d.getUTCMonth() + 1);
  if (d.getUTCMonth() !== targetMonth) {
    d.setUTCDate(0);
  }
  return d.toISOString();
}
```

Then import in both consumers.

## Info

### IN-01: Unused import suppressed with void in webhook test file

**File:** `supabase/functions/stripe-webhook-handler/index.test.ts:29-30`
**Issue:** `signStripePayload` is imported and immediately suppressed with `void signStripePayload;`. The comment says it is imported "for future reference usage," but this is dead code. It adds an unnecessary dependency to the test module and could cause confusion for future maintainers.

**Fix:** Remove the import and void statement. Re-add when actually needed:

```TypeScript
// Remove these lines:
// import { signStripePayload } from "../_shared/test-helpers/stripe-signature.ts";
// void signStripePayload;
```

### IN-02: Test fixture missing customer\_details field limits email fallback coverage

**File:** `supabase/functions/_shared/test-helpers/stripe-fixtures.ts:186-206`
**Issue:** The `makeCheckoutSessionCompletedEvent` fixture does not include a `customer_details` object on the checkout session. The webhook handler reads `session.customer_details?.email` at line 226 of `stripe-webhook-handler/index.ts`. Because of optional chaining, this evaluates to `null` without crashing, but it means the test suite never exercises the email fallback path for checkout events where customer email comes from `customer_details`. All checkout tests fall through to the `metadata.user_id` lookup path.

**Fix:** Add an optional `customer_email` parameter to the fixture:

```TypeScript
export function makeCheckoutSessionCompletedEvent(params: CheckoutSessionCompletedParams) {
  // ...
  return {
    // ...
    data: {
      object: {
        // ...existing fields...
        customer_details: params.customer_email
          ? { email: params.customer_email }
          : undefined,
      },
    },
  };
}
```

### IN-03: Provisioning script search query uses string interpolation for Stripe API

**File:** `scripts/provision-stripe-products.mjs:107`
**Issue:** The Stripe price search query uses template literal interpolation: ``query: `lookup_key:'${lookup_key}' AND active:'true'` `` . While the `lookup_key` values are hardcoded constants from `SHOP_CATALOG` (not user input), the pattern of string interpolation in API queries is worth noting. If this function were ever refactored to accept external input, this would become an injection vector for the Stripe Search API.

**Fix:** No immediate action needed since values are hardcoded. Add a comment noting the safety invariant:

```JavaScript
// SAFETY: lookup_key comes from SHOP_CATALOG constants, not external input.
const existing = await stripe.prices.search({
  query: `lookup_key:'${lookup_key}' AND active:'true'`,
});
```

***

_Reviewed: 2026-04-16T18:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

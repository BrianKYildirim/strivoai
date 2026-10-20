# Phase 01: Elite-to-Free Downgrade Feedback and Renewal Recovery - Pattern Map

**Mapped:** 2026-07-19  
**Inputs:** `01-CONTEXT.md`, `01-RESEARCH.md`, `01-UI-SPEC.md`, `01-VALIDATION.md`, `AGENTS.md`  
**Purpose:** Give the planner concrete file boundaries and existing implementation idioms. This is a mapping artifact, not an implementation plan.

## Non-Negotiable Architecture Boundary

The browser reads subscription state and may temporarily suppress stale warnings only after an explicit Stripe confirmation. It must never write `subscription_tier`, `subscription_status`, `pending_downgrade_tier`, or `current_period_end`. Stripe remains authoritative and `stripe-webhook-handler` owns persisted reconciliation.

```text
profiles row -> useSubscriptionState -> Pricing panel / tier status / Dashboard alert
                                             |
                                             v
                                      RenewEliteDialog
                                             |
                                             v
renew-subscription -> Stripe cancel_at_period_end=false -> customer.subscription.updated
                                                               |
                                                               v
                                             stripe-webhook-handler clears pending state
```

Do not fold pending downgrade into `useTierAccess`: that hook deliberately exposes effective entitlement and honors admin simulation. Phase 01 must read the real authenticated profile billing state, because Elite remains the entitlement while Free is merely scheduled.

## File Map

| File | Change | Role | Input / output and closest analog |
| --- | --- | --- | --- |
| `supabase/functions/renew-subscription/index.ts` | Create | Authenticated Stripe preview/restore boundary | Mirror `cancel-subscription/index.ts`: JWT-derived user -> stored `stripe_subscription_id` -> Stripe retrieve/update -> validated JSON response. No profile write. |
| `supabase/functions/renew-subscription/index.test.ts` | Create | Edge contract tests | Mirror `cancel-subscription/index.test.ts` dependency injection and fake Supabase/Stripe harness; add preview, restore, explicit-false validation, idempotency, and ambiguous-response cases. |
| `supabase/functions/stripe-webhook-handler/index.ts` | Modify | Persisted reconciliation | Extend the existing same-tier non-cancel branch so one update writes `{ subscription_tier: newTier, pending_downgrade_tier: null }`; preserve insert-first event idempotency and Merit routing. |
| `supabase/functions/stripe-webhook-handler/index.test.ts` | Modify | Webhook regression | Reuse `makeSubscriptionUpdatedEvent` and `updateCalls`; prove same-tier Elite renewal clears pending state and makes no Merit RPC. |
| `supabase/config.toml` | Modify | Function registration | Add `[functions.renew-subscription]` with `verify_jwt = false`; handler-level `requireAuth` remains the auth gate, as for `cancel-subscription`. |
| `scripts/deploy.ps1` | Modify | Deployment inventory | Add `renew-subscription` adjacent to `cancel-subscription`. |
| `supabase/functions/deno.json` | Modify | CI enrollment | Add `renew-subscription/index.test.ts` to `test:ci`. |
| `supabase/functions/_shared/cors-audit.test.ts` | Modify | CORS drift guard | Enroll both currently omitted `cancel-subscription` and new `renew-subscription`; update the exact-count assertion from 17 to 19 and its stale comments. |
| `src/lib/subscription-downgrade.ts` | Create | Pure time/state/copy helpers | Normalize Unix seconds or ISO strings to `Date | null`; format the local full date; derive 7/1/0-day copy; enforce exact-instant expiry. No React or Supabase dependency. |
| `src/lib/subscription-downgrade.test.ts` | Create | Deterministic pure tests | Use fake system time for invalid/null/Unix/ISO inputs, local calendar boundaries, singular/today copy, and exact expiration. |
| `src/hooks/useSubscriptionState.ts` | Create | Shared real-profile read model and bounded reconciliation | Follow `useProfessionalGoal` for `['currentUser']` + user-keyed React Query reads and `useMerits` for bounded invalidate/poll behavior. Select only the four billing fields. |
| `src/hooks/useSubscriptionState.test.ts` | Create | Hook/cache tests | Follow `useMerits.test.ts`: `renderHook`, isolated `QueryClientProvider`, chained Supabase mocks, fake timers for bounded reconciliation. |
| `src/components/billing/RenewEliteDialog.tsx` | Create | Shared confirmation and mutation state machine | Reuse Radix `AlertDialog`; preview only when profile date is missing, restore only after explicit confirmation, lock all controls in flight, preserve pending state on error, notify parent immediately on Stripe confirmation. |
| `src/components/billing/RenewEliteDialog.test.tsx` | Create | Component contract | Follow Pricing/Stripe modal tests: mocked `supabase.functions.invoke`, Testing Library interaction, no mutation on open, exact date/no price, duplicate lock, Retry, syncing, confirmed state. |
| `src/components/billing/SubscriptionStatusPanel.tsx` | Likely create | Pricing-only visual state renderer | Render pending-dated, date-syncing, Stripe-confirmed/profile-syncing, and mounted-visit confirmed states. Keep query/mutation ownership outside this presentational component. |
| `src/components/pricing/TierCardV2.tsx` | Modify | Tier status renderer and callback guard | Replace `isCurrent` with explicit `status: 'available' | 'current' | 'scheduled'` (default `available`); scheduled and current are both natively disabled, and neither may call `onCta`. |
| `src/components/pricing/TierCardV2.test.tsx` | Create | Status/callback tests | Preserve the existing Interview Prep flag suite under `__tests__`; add the validation-contract path for available/current/scheduled behavior. |
| `src/pages/Pricing.tsx` | Modify | Billing orchestration | Consume real subscription state; place status panel above tier grid; seed/invalidate pending state after cancellation; hard-guard the Free handler during pending; host the shared renewal dialog. |
| `src/pages/Pricing.test.tsx` | Modify | Page integration | Extend current auth/invoke harness for context-aware panel, provisional cancel state, Scheduled lockout, renewal suppression, and restored cards. |
| `src/components/dashboard/SubscriptionEndingAlert.tsx` | Create | Clock-driven top warning | Reuse `Alert` and `CohortBackfillBanner` dismissal shape, but use a user+period keyed `sessionStorage` key, current-session fallback state, and the shared renewal dialog trigger. |
| `src/components/dashboard/SubscriptionEndingAlert.test.tsx` | Create | Banner/time/storage tests | Use fake timers and mocked storage; cover 7/2/1/0 days, exact instant removal, key changes, unavailable storage, and immediate suppression after Stripe confirmation. |
| `src/pages/Dashboard.tsx` | Modify | Alert placement | Consume subscription state and render the new alert before `RunningLowCard`, `OutcomeOverdueBanner`, and `CohortBackfillBanner`. |
| `src/pages/Dashboard.test.tsx` | Modify | Page ordering integration | Extend existing QueryClient/Supabase mocks; assert DOM order and absence outside the eligible state. |

No migration, generated-type edit, package, environment variable, pricing config, Stripe portal change, or new route is indicated. Both generated database type files already contain every required profile field.

## Concrete Existing Patterns

### 1. Authenticated, user-keyed Edge Function

Closest analog: `supabase/functions/cancel-subscription/index.ts`.

```ts
if (req.method === "OPTIONS") return handleOptionsRequest({ type: "user" });
if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

ctx = await requireAuthFn(req);
const { data: profile, error: profileErr } = await supabase
  .from("profiles")
  .select("stripe_subscription_id")
  .eq("id", ctx.userId)
  .single();
```

Keep the test-injectable dependency object (`supabase`, `stripe`, `requireAuth`), CORS-bearing `jsonResponse`, `PGRST116` distinction, structured logger, and production `withCors(req, "user", ...)` wrapper. Parse a tiny discriminated body such as `{ action: 'preview' | 'restore' }`; never accept a subscription ID.

The two actions should diverge only at Stripe:

```ts
// preview: read-only exact date
const sub = await stripe.subscriptions.retrieve(subscriptionId);

// restore: same operation as cancel, opposite flag
const sub = await stripe.subscriptions.update(subscriptionId, {
  cancel_at_period_end: false,
});
```

Only `sub.cancel_at_period_end === false` is success. A 2xx response or a truthy subscription object is insufficient. Return the authoritative Unix `current_period_end`; do not clear the profile from this function.

### 2. Webhook same-tier reconciliation

Current branch in `stripe-webhook-handler/index.ts`:

```ts
} else {
  // Same tier (e.g. price change within tier) — write tier to be safe
  await supabase
    .from("profiles")
    .update({ subscription_tier: newTier })
    .eq("id", resolvedUserId);
}
```

Phase 01 changes the payload, not the routing structure:

```ts
.update({
  subscription_tier: newTier,
  pending_downgrade_tier: null,
})
```

This branch already occurs after `cancel_at_period_end === true`, upgrade, and downgrade checks, so same-tier `cancel_at_period_end: false` naturally lands here. The test fake records non-select updates in `fakeSupabase.updateCalls`; use the existing `subscription-updated-downgrade-pending` assertion style and assert `rpcCalls.length === 0`.

The shared Stripe fixture currently does not type `cancel_at_period_end`. A focused test can add it to `event.data.object` after construction; extending the test-only fixture is optional and must not affect production code.

### 3. Shared React Query read model

Closest analog: `useProfessionalGoal.ts` reuses the dashboard's current-user key and creates a user-keyed query.

```ts
const { data: userId = null } = useQuery({
  queryKey: ['currentUser'],
  queryFn: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  },
  staleTime: 5 * 60 * 1000,
});

const query = useQuery({
  queryKey: ['subscription-state', userId],
  enabled: !!userId,
  queryFn: async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('subscription_tier, subscription_status, pending_downgrade_tier, current_period_end')
      .eq('id', userId!)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
});
```

Return raw authoritative fields plus derived real-Elite pending state. Do not consume `useTierAccess` or `AdminTierTestContext`. Export a stable query-key helper and focused `refresh`/reconcile operation so Pricing and Dashboard coalesce reads.

Closest bounded reconciliation analog: `useMerits.reconcileTierUpgrade`.

```ts
const start = Date.now();
while (Date.now() - start < POLL_CEILING_MS) {
  await queryClient.invalidateQueries({ queryKey });
  if (pendingCleared()) return;
  await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
}
```

Poll only `['subscription-state', userId]`, stop when pending is cleared, and resolve without inventing persisted success at the ceiling. The explicit Stripe-confirmed browser state is separate from cached profile data and suppresses stale warnings/cards until reconciliation.

### 4. Date helpers and clock invalidation

Use date-fns already present in the repo (`format`, `differenceInCalendarDays`) and isolate the behavior from React:

```ts
const daysRemaining = differenceInCalendarDays(periodEnd, now);
const isFinalWeek = periodEnd.getTime() > now.getTime()
  && daysRemaining >= 0
  && daysRemaining <= 7;
```

Normalization must accept Stripe Unix seconds and profile ISO strings, reject invalid dates, and return `Date | null`. Format `MMMM d, yyyy` in browser local time. At `now >= periodEnd`, pending UI is hidden even if the profile remains stale.

The alert/component owns two cleaned-up one-shot timers: next local midnight (refresh countdown/eligibility and re-arm) and exact period end (remove immediately). Cap long delays at the browser maximum and re-arm from midnight. Timer dependencies must include user ID, period-end value, pending status, and local Stripe-confirmed status to prevent callbacks leaking across users or billing periods.

### 5. Alert and session dismissal

Closest visual/storage analog: `CohortBackfillBanner.tsx`.

```tsx
<Alert className="mb-6 border-primary/30 bg-primary/5">
  <GraduationCap className="h-5 w-5 text-primary" />
  <AlertDescription>...</AlertDescription>
  <Button
    type="button"
    variant="ghost"
    size="icon"
    className="absolute right-2 top-2 h-8 w-8"
  >
    <X className="h-4 w-4" />
  </Button>
</Alert>
```

Phase 01 must use `sessionStorage`, not that analog's `localStorage`. Key by both user and authoritative period value, for example `elite-expiry-dismissed:${userId}:${periodEndIso}`. Wrap reads/writes in `try/catch`; component state remains the fallback. Use the exact accessibility label from UI-SPEC and reserve `pr-8` so the dismiss target cannot overlap content.

### 6. Shared async confirmation dialog

Closest async dialog pattern: the downgrade dialog in `Pricing.tsx` and delete-user dialog in `AdminUsage.tsx`.

```tsx
<AlertDialogAction
  onClick={(event) => {
    event.preventDefault();
    void handleConfirm();
  }}
  disabled={isProcessing}
>
  {isProcessing ? 'Restoring renewal…' : 'Keep Elite and renew'}
</AlertDialogAction>
```

Use a controlled `AlertDialog`; opening it is non-mutating. Initial focus should land on `Not now`. If the date is missing, invoke `{ action: 'preview' }`, show the preview-loading copy, and keep confirmation disabled. During restore, reject `onOpenChange(false)` and disable cancel/close/confirm/trigger paths. Failure or ambiguous response keeps the dialog open with an inline specific error and `Retry`. After explicit false confirmation, toast immediately and call the parent suppression callback before starting profile reconciliation.

Both Pricing and Dashboard render this same component and exact copy source; no duplicated invoke logic or subtly different date formatting.

### 7. Tier-card state contract

Current `TierCardV2` couples presentation and disablement to `isCurrent`:

```tsx
<Button
  onClick={() => onCta(tier, interval)}
  disabled={isCurrent}
>
  {isCurrent ? 'Current plan' : copy.cta}
</Button>
```

Convert this to one explicit status. Derive `disabled = status !== 'available'`, label current as `Current plan`, scheduled as `Scheduled`, and guard the callback itself:

```tsx
onClick={() => {
  if (status !== 'available') return;
  onCta(tier, interval);
}}
```

Pricing must add the second guard before opening the downgrade dialog. Defense in both layers is required by D-05: stale props, keyboard activation, or later card refactors must not dispatch a second cancellation.

### 8. Pricing and Dashboard seams

Pricing's tier grid is at `Pricing.tsx:186-199`; insert the labeled membership panel immediately before it. After successful `cancel-subscription`, use its returned Unix period end to seed a provisional pending state or update the subscription query, then invalidate/refetch. This prevents a disappearance between Stripe success and webhook persistence.

Dashboard's current top order is:

```tsx
<RunningLowCard />
<OutcomeOverdueBanner />
<CohortBackfillBanner />
<CareerHero ... />
```

Place `<SubscriptionEndingAlert />` first in the same container. It self-hides unless there is real Elite + pending Free + valid future exact date + 0..7 local calendar days. It also self-hides immediately after browser-local Stripe confirmation.

## Verification Patterns

| Concern | Existing test idiom | Required assertion emphasis |
| --- | --- | --- |
| Edge auth/ownership/CORS | `cancel-subscription/index.test.ts` fake deps + `withCors` | JWT user selects only their profile; preview never updates Stripe; restore passes false; ambiguous response is failure. |
| Webhook persistence | `stripe-webhook-handler/index.test.ts` `updateCalls`/`rpcCalls` | Same-tier Elite writes pending null, remains Elite, grants no Merits. |
| Hook query/poll | `useMerits.test.ts` `renderHook` + isolated QueryClient + fake timers | Query key contains user; missing row safe; bounded invalidation; no admin-override leakage. |
| Dialog | `Pricing.test.tsx` and `StripePaymentElementModal.test.tsx` interaction mocks | Open is read-only; missing-date preview; exact date; no price; one restore call; Retry preserves pending. |
| Tier card | existing `TierCardV2.interviewPrep.test.tsx` | Native disabled + callback count zero for current/scheduled; visual status text remains perceivable. |
| Page composition | `Pricing.test.tsx`, `Dashboard.test.tsx` | Signed-out/normal users unchanged; pending controls locked; dashboard alert precedes every other banner. |
| Time/storage | Vitest fake time + mocked `sessionStorage` | 7/2/1/0-day copy, exact-instant hide, midnight reevaluation, user/period key isolation, storage failure fallback. |

Run the exact focused commands in `01-VALIDATION.md`; after each wave also run `npm.cmd run type-check`. `verify:baseline` remains the final regression gate.

## Planner Guardrails

- Do not make the browser clear `pending_downgrade_tier`, even optimistically.
- Do not wait for profile reconciliation before hiding warnings and restoring Free card availability after an explicit Stripe false response.
- Do not show the dashboard warning without a valid exact date; Pricing uses the visible syncing-date state instead.
- Do not use Stripe's Resume Subscription endpoint, invoice preview, portal redirect, or guessed price.
- Do not alter tier/Merit entitlement logic. Renewal is same-tier and must not grant Merits.
- Do not create a `/settings/billing` route or move Billing / Membership away from `/pricing`.
- Do not add retry loops around unavailable routes. User-controlled Retry is the recovery mechanism.
- Do not modify `.gitignore`, add dependencies, or commit `.planning` artifacts.

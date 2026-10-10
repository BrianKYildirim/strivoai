# Phase 01: Elite-to-Free Downgrade Feedback and Renewal Recovery - Research

**Researched:** 2026-07-19
**Status:** Ready for planning
**Requirements source:** `01-CONTEXT.md` decisions D-01 through D-20 and the Phase 1 roadmap entry. There is no current milestone `REQUIREMENTS.md`; do not invent requirement IDs.

## Research Question

What does the planner need to know to implement a reliable, continuously visible Elite-to-Free scheduled-downgrade experience and a safe way to restore automatic renewal before expiration?

## Executive Summary

This phase is an extension of an already-working cancel-at-period-end path, not a new billing system. `Pricing.tsx` invokes `cancel-subscription`, that function updates the authenticated user's Stripe subscription with `cancel_at_period_end: true`, and `stripe-webhook-handler` persists `profiles.pending_downgrade_tier = 'free'` while leaving `subscription_tier = 'elite'`. The existing columns, generated types, CORS/auth helpers, Stripe client, alerts, dialogs, React Query, and date-fns are enough; no schema migration or new dependency is required.

The missing pieces are:

1. A shared frontend read model for `subscription_tier`, `subscription_status`, `pending_downgrade_tier`, and `current_period_end`.
2. A reusable renewal confirmation/mutation flow that both `/pricing` and the dashboard warning can launch.
3. A new authenticated Edge Function that sets Stripe `cancel_at_period_end: false`, keyed only by the authenticated user's stored subscription ID.
4. A webhook correction that clears `pending_downgrade_tier` when Stripe reports the same tier with cancellation disabled.
5. Pricing scheduled-state UI, dashboard final-week UI, and focused tests for the time boundary, duplicate-action lockout, failure preservation, and webhook synchronization.

The most important planning constraint is eventual consistency. Stripe confirms both cancellation and restoration before the corresponding webhook necessarily updates `profiles`. The UI needs explicit provisional/synchronizing states and must never directly write billing fields in `profiles`.

## Current Implementation

### Cancellation path already present

- `src/pages/Pricing.tsx:112-152` invokes `cancel-subscription`, handles a benign `no_subscription`, formats the returned Unix `current_period_end`, and shows the immediate dated toast.
- `supabase/functions/cancel-subscription/index.ts:58-140` authenticates the user, looks up only that user's `profiles.stripe_subscription_id`, calls `stripe.subscriptions.update(id, { cancel_at_period_end: true })`, and returns the Stripe period end.
- The function deliberately performs no browser-driven profile write. This matches the project's established billing authority boundary.
- `src/pages/Pricing.test.tsx` and `supabase/functions/cancel-subscription/index.test.ts` already cover the basic UI mutation, auth, CORS, method, no-subscription, success, and cross-user isolation paths.

### Persisted subscription state already exists

- `profiles.pending_downgrade_tier`, `profiles.current_period_end`, `profiles.subscription_status`, `profiles.subscription_tier`, and `profiles.stripe_subscription_id` already exist in both generated type files.
- The Phase 12 migration documents `pending_downgrade_tier` as the target tier that applies at `current_period_end`.
- `stripe-webhook-handler` writes `current_period_end` as an ISO timestamp and updates subscription status before routing `customer.subscription.updated` events.
- For `cancel_at_period_end === true`, the handler writes `pending_downgrade_tier = 'free'` and intentionally does not change the current tier.

### Current frontend reads are insufficient

- `useMerits` selects only `profiles.subscription_tier`; `useTierAccess` exposes an effective tier but no pending downgrade or period-end state.
- `Pricing.tsx` therefore cannot render the persisted reminder after the toast disappears and cannot lock the Free CTA once the webhook records the pending downgrade.
- `Dashboard.tsx` has no subscription-status query. Its top content order is currently `RunningLowCard`, `OutcomeOverdueBanner`, `CohortBackfillBanner`, then `CareerHero`.
- `Profile.tsx` reads subscription status and period end, but it is local page state and does not include `pending_downgrade_tier`; it is not a reusable billing model.

### Tier-card behavior is easy to extend

- `TierCardV2` currently accepts `isCurrent`; that both changes the label to `Current plan` and disables the CTA.
- Scheduled Free needs a distinct visual state and disabled CTA. Prefer an explicit status prop such as `status: 'available' | 'current' | 'scheduled'` over interacting booleans. While pending, Elite receives `current`, Free receives `scheduled`; after renewal, Free returns to `available`.

### Webhook gap that renewal must close

The same-tier, non-cancel branch at `stripe-webhook-handler/index.ts:769-782` updates only `subscription_tier`. Restoring renewal changes `cancel_at_period_end` from true to false but leaves the Stripe price/tier unchanged, so this is exactly the branch renewal will use. It must also clear `pending_downgrade_tier` or the UI will remain stuck in scheduled state after Stripe has restored renewal.

The upgrade branch should also clear a stale pending downgrade because an immediate upgrade supersedes it. At minimum, the same-tier/non-cancel branch is mandatory for this phase.

### Existing test registry and deployment surfaces

- The new Edge Function must be added to `supabase/config.toml` with `verify_jwt = false`; auth remains enforced inside the shared `requireAuth` helper, matching current user functions.
- Add it to `scripts/deploy.ps1`.
- Add its test file to `supabase/functions/deno.json` `test:ci` so `npm run test:edge` and `verify:baseline` include it.
- `_shared/cors-audit.test.ts` claims to hold the authoritative user-function inventory but currently omits the recently added `cancel-subscription`. When adding the renewal function, reconcile this guard by enrolling both cancellation and renewal and adjusting the exact count. Do not leave another authenticated billing function outside the CORS drift guard.

## Recommended State Model

Create one shared subscription-state hook/query rather than duplicating profile reads in Pricing and Dashboard.

Suggested query data:

```ts
type SubscriptionState = {
  userId: string | null;
  tier: ActiveTier;
  status: string | null;
  pendingDowngradeTier: string | null;
  currentPeriodEnd: string | null;
};
```

Suggested query key: `['subscription-state', userId]`.

The query should:

- Obtain the authenticated user and remain disabled for signed-out visitors.
- Select only `subscription_tier, subscription_status, pending_downgrade_tier, current_period_end` from that user's profile.
- Treat `pendingDowngradeTier === 'free'` as meaningful only for the real persisted Elite subscription. Do not derive billing warnings from the admin tier-test override.
- Preserve `null` for an absent or invalid period end rather than guessing.
- Expose focused invalidation/refetch after cancellation and renewal.

Suggested derived states:

| State | Condition | Pricing | Dashboard |
| --- | --- | --- | --- |
| Normal | No pending Free downgrade | Normal pricing experience | No downgrade alert |
| Pending, dated | Elite + pending Free + valid future end | Date-led panel; Elite Current; Free Scheduled | Alert only when calendar-day difference is 0 through 7 |
| Pending, syncing date | Elite + pending Free + missing/invalid end | Visible confirming-date panel; recovery action remains available | No countdown alert because the final-week threshold cannot be established safely |
| Stripe restored, profile syncing | Renewal mutation returned `cancel_at_period_end: false`, profile still pending | `Renewal restored - syncing your membership status.` | Suppress the stale warning for this confirmed browser state |
| Restored | Profile pending value cleared | `Automatic renewal is on.` confirmation for the just-completed flow; normal tier actions | No alert |
| Expired | Exact period-end instant reached or subscription no longer active | Do not show a pending-downgrade reminder | No alert |

Do not encode `pending_downgrade_tier` into `useTierAccess`. It is billing workflow state, not current entitlement. Elite remains the current entitlement until the authoritative boundary.

## Date and Countdown Semantics

There are two input shapes today: the cancel endpoint returns Unix seconds, while `profiles.current_period_end` is an ISO timestamp. Normalize both at the boundary and use one `Date | null` representation in UI helpers.

Use browser-local formatting for the full date. `Intl.DateTimeFormat` or date-fns `format` are already available; do not render an exact time.

For the dashboard threshold, use local calendar-day difference, not elapsed 24-hour buckets:

```ts
const daysRemaining = differenceInCalendarDays(periodEnd, now);
const isFinalWeek = periodEnd.getTime() > now.getTime()
  && daysRemaining >= 0
  && daysRemaining <= 7;
```

The instant check is required in addition to the calendar-day check. It reconciles D-10 (include the expiration date) with D-14 (hide as soon as expiration is reached): the alert appears earlier on the local expiration date but disappears after the exact Stripe boundary.

Countdown copy should handle `0` as an expiration-day message rather than `0 days left`; `1 day left` must be singular. The exact local date remains visible in all variants.

## Renewal Edge Function Design

Use a new authenticated function such as `renew-subscription`, following `cancel-subscription` rather than routing the user to Stripe's portal.

### Mutation contract

The mutation must:

1. Accept POST and route OPTIONS/errors through the shared user CORS contract.
2. Authenticate with `requireAuth({ type: 'user' })`.
3. Select `stripe_subscription_id` by `ctx.userId`; never accept a client subscription ID.
4. Call `stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false })`.
5. Consider the operation confirmed only when Stripe returns `cancel_at_period_end === false`.
6. Return `{ ok: true, current_period_end, cancel_at_period_end: false }` on confirmation.
7. Return a CORS-readable, specific error for no subscription, Stripe failure, or an unexpected/ambiguous Stripe response.
8. Never directly clear `profiles.pending_downgrade_tier`; the webhook remains the persisted source of truth.

The operation is naturally idempotent: if Stripe already has automatic renewal enabled, an update to false still returns authoritative confirmation. That is preferable to presenting a false failure while the local profile is merely stale.

### Exact-date dialog when profile date is missing

D-09 keeps the recovery CTA available even when `current_period_end` has not synced, while D-16 requires the confirmation dialog to show the exact renewal date. Planning must explicitly bridge those decisions.

Recommended solution: let the same function support a read-only preview action, for example `{ action: 'preview' }`, which retrieves the authenticated user's Stripe subscription and returns its authoritative `current_period_end` without mutating it. `{ action: 'restore' }` performs the update. The dialog opens immediately, shows a loading state if the profile date is unavailable, and enables confirmation only after the preview supplies an exact date. A preview failure stays non-mutating and offers Retry.

If the profile already has a valid date, the dialog can use it directly and skip the preview call. Do not call Stripe's upcoming-invoice API and do not calculate or display a price; D-16 expressly forbids guessing one.

### Stripe behavior confirmed by primary documentation

Stripe documents that a subscription scheduled for cancellation can be reactivated before period end by updating `cancel_at_period_end` to false. It emits `customer.subscription.updated` for subscription updates, while `customer.subscription.deleted` is emitted when a scheduled cancellation actually reaches period end.

Primary references:

- https://docs.stripe.com/billing/subscriptions/cancel#reactivate-a-subscription
- https://docs.stripe.com/api/subscriptions/update

Do not use Stripe's separate Resume Subscription endpoint; that endpoint is for paused subscriptions and can alter the billing anchor. This phase only reverses a scheduled cancellation on the still-active subscription.

## Webhook Reconciliation

For `customer.subscription.updated`:

- `cancel_at_period_end === true`: continue writing `pending_downgrade_tier = 'free'`.
- `cancel_at_period_end !== true` and `newTier === prevTier`: write `subscription_tier = newTier` and `pending_downgrade_tier = null` in the same profile update.
- An immediate upgrade should likewise clear any stale pending downgrade.
- Keep the existing insert-first idempotency and error cleanup behavior intact.

Add a focused webhook fixture/test for the exact Elite renewal event: old profile tier Elite, pending Free in conceptual state, Stripe event price resolves Elite, and `cancel_at_period_end: false`. Assert no Merit grant RPC occurs, the tier remains Elite, and a non-select update clears the pending field.

The current fake profile type does not include `pending_downgrade_tier`, but update-call assertions can still verify the clear without broad fake-client changes.

At period end, the frontend render predicate must stop showing the warning at the authoritative instant/status even if a stale pending value remains briefly. Do not make the browser apply the actual tier downgrade. If the planner includes period-end persistence cleanup, it must remain webhook-owned and preserve the existing paid-access boundary; this is a separate high-risk transition and should not be broadened without a focused regression test.

## Frontend Composition

### Reusable renewal flow

The dashboard alert and Pricing panel use the same `Keep Elite and renew` action and therefore should share one dialog/mutation implementation. A likely split is:

- `useSubscriptionState` for the profile query and derived pending state.
- `RenewEliteDialog` for exact-date confirmation, duplicate-submit disablement, Stripe mutation, and success/error/sync copy.
- A small date/countdown utility with injectable/current `now` behavior for deterministic tests.

After Stripe confirmation:

- Show the success toast immediately.
- Enter an explicit `stripe-confirmed/profile-syncing` state if the profile still reports pending.
- Poll or refetch only the subscription-state query on a bounded interval until the webhook clears pending.
- Suppress stale downgrade actions/warnings in the current browser state after Stripe has confirmed restoration.
- Once the query confirms `pending_downgrade_tier === null`, show `Automatic renewal is on.` and restore normal tier actions.
- A Stripe error leaves the pending state untouched and keeps Retry available. Never map network ambiguity to success.

`useMerits.reconcileTierUpgrade` is not suitable for this synchronization because renewal does not change the tier. A dedicated subscription-state reconciler is required. Merit cache invalidation can still run after confirmed reconciliation if other headers depend on refreshed profile state, but it is not the primary completion signal.

### Pricing integration

- Insert the authenticated membership panel above the tier grid, without affecting signed-out or normal Free users.
- For pending dated state, lead with `Your Elite access ends on <local date>.` and concise supporting copy: Elite remains active through the date, then the account moves to Free, and automatic renewal is off.
- For missing date, show the confirming-date state and no estimate.
- Pass `current` to Elite and `scheduled` to Free; Scheduled is disabled and must not invoke `cancel-subscription`.
- Keep the only state-changing pending action in the membership panel/dialog.
- The existing cancellation success toast already has the correct immediate concept. After scheduling, seed or invalidate the subscription-state query so the panel can appear without waiting for a reload; the returned Stripe period end can support a provisional current-page state while the webhook catches up.

### Dashboard integration

- Render the downgrade alert before `RunningLowCard`, `OutcomeOverdueBanner`, and `CohortBackfillBanner`.
- Use the same shared renewal dialog, not an independent mutation path.
- Store dismissal in `sessionStorage`, not `localStorage`, so it survives route changes/reloads in the tab but returns in a new browser session. Key it by user and period end so one user's dismissal or an old billing cycle cannot hide a later warning.
- If storage is unavailable, fall back safely to component state.
- Clear/ignore dismissal when renewal is restored or the expiration key changes.
- Missing/invalid date yields no dashboard countdown because the seven-day threshold is unknowable.

## Error and Reliability Rules

- Never derive success from an HTTP 2xx alone; validate the response shape and `cancel_at_period_end === false`.
- Do not clear local pending state after a failed or ambiguous Stripe call.
- Keep user-facing failures specific: loading billing date failed, no active subscription exists, renewal could not be restored, or membership status is still synchronizing.
- Disable both confirm controls and duplicate tier downgrade controls during their corresponding mutations.
- Preserve CORS headers on all user-facing 4xx/5xx responses.
- Do not log secrets or payment data. User ID, subscription ID, reason code, and operation result follow the current structured logging pattern.
- Do not add retries around a consistently unavailable Edge Function route; surface the operational error and Retry control, matching repository reliability policy.

## Files Likely to Change

| Area | Existing/new files | Purpose |
| --- | --- | --- |
| Shared subscription read model | `src/hooks/useSubscriptionState.ts` (new) and focused test | One authoritative frontend query/derived state |
| Renewal UI | `src/components/billing/RenewEliteDialog.tsx` (new) and test | Shared dialog, preview fallback, restore, sync/error/success |
| Date logic | colocated helper or `src/lib/subscription-downgrade.ts` (new) and test | Normalize timestamps, date label, final-week predicate/countdown |
| Pricing | `src/pages/Pricing.tsx`, `src/pages/Pricing.test.tsx` | Persistent panel, scheduled cards, duplicate lockout, immediate cancellation state |
| Tier cards | `src/components/pricing/TierCardV2.tsx` and focused test | Current/Scheduled/Available status contract |
| Dashboard | `src/pages/Dashboard.tsx`, likely new `src/components/dashboard/SubscriptionEndingAlert.tsx` and test | Topmost final-week warning and session dismissal |
| Renewal backend | `supabase/functions/renew-subscription/index.ts` and `index.test.ts` (new) | Authenticated Stripe preview/restore contract |
| Webhook | `supabase/functions/stripe-webhook-handler/index.ts` and `index.test.ts` | Clear pending state on same-tier renewal |
| Registration | `supabase/config.toml`, `scripts/deploy.ps1`, `supabase/functions/deno.json`, `_shared/cors-audit.test.ts` | Deploy/test/CORS coverage |

No database migration, environment variable, pricing-config change, Stripe portal change, or new package is indicated.

## Suggested Plan Decomposition

1. **Backend renewal and reconciliation:** build/test the authenticated renewal function; correct webhook pending-state clearing; register the function in config, deploy list, Deno CI, and CORS audit.
2. **Shared frontend state and recovery primitive:** implement the subscription query, pure date/countdown helpers, and reusable renewal dialog with preview fallback and two-stage synchronization.
3. **Pricing scheduled-downgrade experience:** add the persistent panel, tier-card Scheduled state, duplicate downgrade lockout, and immediate post-cancel reconciliation.
4. **Dashboard final-week experience and integrated verification:** add the topmost session-dismissible alert, exercise date boundaries and alert ordering, then run focused and baseline gates.

This order gives frontend work stable server contracts and lets Pricing/Dashboard share one tested implementation instead of duplicating financial-state logic.

## Validation Architecture

### Validation layers

| Layer | Tool/file | What it proves |
| --- | --- | --- |
| Pure date/state unit | Vitest, new subscription-downgrade helper test | ISO/Unix normalization, invalid/null behavior, local dates, 7/1/0-day copy, exact-instant expiry |
| Tier-card component | Vitest + Testing Library | Current and Scheduled labels, disabled controls, no callback for Scheduled |
| Renewal dialog/component | Vitest + Testing Library | Exact date, no hardcoded price, preview fallback, duplicate-submit lock, Stripe failure preservation, syncing then confirmed state |
| Pricing page | `src/pages/Pricing.test.tsx` | Signed-out/Free unchanged, pending panel, missing-date copy, Elite Current + Free Scheduled, no second cancellation invoke |
| Dashboard alert | New focused component test plus `Dashboard.test.tsx` | 7-day threshold, exact expiry hide, session-only dismissal, topmost DOM order, shared renewal action |
| Edge mutation | New Deno function test | Auth, method, CORS, user isolation, preview no-write, `cancel_at_period_end:false`, confirmed response validation, Stripe errors |
| Webhook transition | `stripe-webhook-handler/index.test.ts` | cancel true sets pending Free; same-tier cancel false clears pending without Merit RPC/tier interruption |
| Static registration | Existing CORS audit plus source checks | Function enrolled in shared CORS contract, config, deploy list, and Deno CI |
| Full regression | `npm run verify:baseline` | Existing seven-layer project contract remains green |

### Nyquist mapping to locked decisions

| Decisions | Automated evidence target |
| --- | --- |
| D-01, D-02 | Pricing page tests show one `/pricing` surface and context-aware panel |
| D-03, D-04, D-05 | Tier-card/Pricing tests prove Elite Current, Free Scheduled, and no enabled duplicate downgrade path |
| D-06 through D-09 | Pricing + date-helper tests prove local full date, concise copy, and visible no-guess syncing state |
| D-10 through D-14 | Date-helper + dashboard-alert tests prove calendar-day boundary, top order, session dismissal, countdown/date, and removal on restore/expiry |
| D-15 through D-17 | Dialog + Edge Function tests prove confirmation-first flow, exact date/no price guess, authenticated ownership, and duplicate-submit lock |
| D-18 through D-20 | Dialog/query + webhook tests prove toast/confirmation, Stripe-confirmed sync state, pending clear, failure preservation, and Retry |

### Focused commands

From repository root:

```powershell
npm.cmd run test -- src/pages/Pricing.test.tsx src/pages/Dashboard.test.tsx src/components/pricing/TierCardV2.test.tsx src/components/billing/RenewEliteDialog.test.tsx src/components/dashboard/SubscriptionEndingAlert.test.tsx src/lib/subscription-downgrade.test.ts
npm.cmd run type-check
npm.cmd run lint
npm.cmd run build
```

From `supabase/functions`:

```powershell
deno.cmd check renew-subscription/index.ts stripe-webhook-handler/index.ts cancel-subscription/index.ts
deno.cmd test --allow-all --no-check renew-subscription/index.test.ts cancel-subscription/index.test.ts stripe-webhook-handler/index.test.ts _shared/cors-audit.test.ts
```

Then run the repository gate before handoff:

```powershell
npm.cmd run verify:baseline
```

If the managed Windows runner fails before tests start with known pipe/spawn errors, report the gate as blocked/flaky and rerun from normal PowerShell; do not report a green requirement based only on static inspection.

### Manual browser checks

Automated tests should carry the contract, but the final implementation should also be visually checked at desktop and mobile widths for:

- Date-led Pricing panel placement above tier cards.
- Scheduled/Current labels without misleading enabled CTAs.
- Dialog copy and disabled processing state.
- Topmost dashboard alert order and responsive action placement.
- Dismissal surviving a same-tab reload but returning in a new browser session.
- Pending-to-syncing-to-confirmed transition without a flash of an enabled downgrade control.

## Planning Risks and Guardrails

1. **Profile/Stripe race:** invalidate-only behavior can briefly show no panel after cancellation or a stale alert after restoration. Plan explicit provisional and syncing states.
2. **Wrong completion signal:** tier remains Elite throughout restoration, so the existing tier-upgrade reconciler can never prove renewal. Poll the pending-downgrade field instead.
3. **Date ambiguity:** never use `Math.ceil(milliseconds / day)` for D-10; it is an elapsed-time calculation, not local calendar days.
4. **Expiry contradiction:** use both local calendar difference and exact instant/status so the alert appears on expiration day but disappears after the subscription actually expires.
5. **Missing-date dialog:** do not silently violate D-16. Retrieve the Stripe date before enabling confirmation when the profile date is absent.
6. **False success:** network errors and unexpected Stripe shapes preserve the pending downgrade. Only an explicit false flag confirms restoration.
7. **Duplicate financial controls:** Scheduled must be disabled at the card level as well as guarded in `handleTierCta`; test both presentation and callback absence.
8. **Admin override leakage:** use real profile billing state, not simulated tier state, for warnings and Stripe actions.
9. **Stale CORS inventory:** enroll both current cancellation and new renewal functions in the static user-function audit.
10. **Scope control:** do not change pricing, Merit grants, entitlements, or portal behavior. Any period-end tier-settlement change needs its own explicit regression contract rather than being smuggled into presentation work.

## Planning Readiness

The phase is ready to plan. The only contract tension that required research is the missing-date renewal dialog: the CTA must remain available while the dialog must show an exact date. A read-only Stripe preview through the authenticated renewal function resolves that tension without guessing, adding a new public data surface, or moving persisted authority out of the webhook.

---

*Phase: 01-elite-to-free-downgrade-feedback-and-renewal-recovery*
*Research completed: 2026-07-19*

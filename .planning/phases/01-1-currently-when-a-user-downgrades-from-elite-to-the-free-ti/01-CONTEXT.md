# Phase 01: Elite-to-Free Downgrade Feedback and Renewal Recovery - Context

**Gathered:** 2026-07-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Make a scheduled Elite-to-Free downgrade understandable, continuously visible, and reversible until the current billing period ends. The phase covers the immediate dated confirmation, persistent Billing / Membership status, the final-week dashboard warning, prevention of duplicate downgrade actions, and restoring automatic renewal without interrupting Elite access.

It does not change tier entitlements, pricing, Merit allocation rules, Stripe as the billing provider, or the established rule that Elite access remains active through the current billing boundary.

</domain>

<decisions>
## Implementation Decisions

### Billing Destination and Scheduled State
- **D-01:** `/pricing` remains the combined public pricing and authenticated Billing / Membership page; do not create a separate `/settings/billing` route for this phase.
- **D-02:** The page is context-aware. Signed-out and Free users retain the normal pricing experience. An authenticated Elite user with a pending downgrade sees a membership-status panel above the tier cards.
- **D-03:** While the downgrade is pending, Elite remains marked **Current** and Free is marked **Scheduled**.
- **D-04:** A user cannot initiate the same downgrade twice. All downgrade triggers must be removed or disabled while the pending downgrade exists.
- **D-05:** Keeping the scheduled downgrade is passive and requires no action. The only state-changing choice in that state is **Keep Elite and renew**.

### Persistent Billing Reminder
- **D-06:** Use a date-led status panel whose headline is equivalent to **“Your Elite access ends on August 31, 2026.”** Place **Keep Elite and renew** beside it.
- **D-07:** Display the expiration as a full local calendar date (month, day, and year), without an exact time.
- **D-08:** Supporting copy stays concise: Elite remains available through the displayed date, the account will then move to Free, and automatic renewal is currently off.
- **D-09:** If the pending downgrade is known but the exact date has not synced, keep the panel visible with a message that the exact Elite end date is being confirmed. Never estimate or invent a date, and keep **Keep Elite and renew** available.

### Final-Week Dashboard Alert
- **D-10:** The dashboard alert begins when seven or fewer local calendar days remain, including the expiration date.
- **D-11:** It is the topmost dashboard alert, above low-Merit and all other operational banners.
- **D-12:** It may be dismissed for the current browser session only. It returns in a new session unless renewal has been restored or Elite has expired.
- **D-13:** The alert shows both a changing day countdown and the exact local expiration date, with **Keep Elite and renew** as its primary action.
- **D-14:** The alert disappears as soon as renewal is restored or the subscription reaches expiration.

### Keep Elite and Renew
- **D-15:** **Keep Elite and renew** opens a confirmation dialog rather than changing billing state immediately or redirecting to Stripe's portal.
- **D-16:** The dialog states the exact renewal date, that Elite access will continue without interruption, and that the saved payment method will be charged according to the existing Elite subscription. It must not guess or hardcode a price.
- **D-17:** While restoration is processing, disable repeat submissions.
- **D-18:** After Stripe confirms restoration, show a success toast plus a persistent **Automatic renewal is on** confirmation state, remove pending-downgrade warnings, and restore normal tier-card actions.
- **D-19:** Use a safe two-stage state when Stripe has confirmed renewal but the local profile is still synchronizing: show **“Renewal restored — syncing your membership status.”**
- **D-20:** If the Stripe restoration action fails, preserve the scheduled downgrade, show a specific failure message, and offer Retry. Never show renewal success from a failed or ambiguous Stripe response.

### Agent Discretion
- Exact component boundaries, query keys, cache invalidation mechanics, and test seams, provided they preserve the decisions above.
- Exact semantic-token styling, icon choice, spacing, and responsive layout within established Strivo patterns.
- Exact supporting copy may be polished for clarity, but the dates, state meanings, financial commitment, and locked button labels must remain unambiguous.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope and Project Constraints
- `.planning/ROADMAP.md` — Phase 01 source scope: dated downgrade confirmation, persistent reminder, final-week dashboard alert, and renewal restoration.
- `.planning/PROJECT.md` — Active v5.1 project context, reliability constraints, Stripe billing direction, and existing production invariants.

No separate Phase 01 SPEC.md or current milestone REQUIREMENTS.md exists. The roadmap scope and the decisions above are the authoritative requirements for planning.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/pages/Pricing.tsx` — Current public pricing and Billing / Membership surface. It already authenticates the Free-tier CTA, invokes `cancel-subscription`, displays the dated success toast, and uses an `AlertDialog` for cancellation confirmation.
- `src/components/pricing/TierCardV2.tsx` — Existing tier-card surface where **Current** versus **Scheduled** behavior must be represented.
- `src/components/ui/alert.tsx` and `src/components/ui/alert-dialog.tsx` — Existing accessible alert and confirmation primitives.
- `src/pages/Dashboard.tsx` — Current dashboard composition and banner ordering. `RunningLowCard`, `OutcomeOverdueBanner`, and `CohortBackfillBanner` already render before the Career OS hero.
- `src/components/dashboard/CohortBackfillBanner.tsx` — Reusable dashboard-banner composition and dismiss control; its durable `localStorage` policy must not be copied for this session-only dismissal.
- `src/hooks/useMerits.ts` and `src/hooks/useTierAccess.ts` — Existing tier and Merit query/cache surfaces that can be refreshed after billing-state changes.
- `supabase/functions/cancel-subscription/index.ts` — Authenticated, user-keyed, CORS-safe Stripe mutation pattern. It sets `cancel_at_period_end: true`, returns `current_period_end`, and deliberately leaves profile writes to the webhook.

### Established Patterns
- Stripe webhooks are the single source of truth for persisted subscription state; browser requests do not directly write tier or pending-downgrade fields.
- `profiles.subscription_tier` remains Elite during a pending downgrade. `profiles.pending_downgrade_tier = 'free'` and `profiles.current_period_end` represent the scheduled transition.
- Billing mutations are keyed from the authenticated user context, not a client-supplied subscription ID.
- User-facing dates use the browser's locale while stored period boundaries remain authoritative timestamps.
- User-facing billing failures must remain CORS-readable, specific, and retryable without changing state incorrectly.

### Integration Points
- `src/pages/Pricing.tsx` currently reads the effective tier but not `pending_downgrade_tier` or the persisted `current_period_end`; the authenticated membership panel and tier-card lock need authoritative pending-state data.
- `src/pages/Dashboard.tsx` currently has no pending-subscription query. The new alert must be inserted before `RunningLowCard` and the existing operational banners.
- No renewal-restoration Edge Function currently exists. Planning should mirror the authenticated ownership and error contract of `cancel-subscription` while setting Stripe `cancel_at_period_end: false`.
- `supabase/functions/stripe-webhook-handler/index.ts` currently writes `pending_downgrade_tier = 'free'` when cancellation is scheduled, but its same-tier/non-cancel branch does not currently clear a stale pending downgrade. Renewal planning must close that state transition without moving tier authority into the frontend.
- Existing focused coverage begins in `src/pages/Pricing.test.tsx`, `supabase/functions/cancel-subscription/index.test.ts`, and `supabase/functions/stripe-webhook-handler/index.test.ts`; dashboard alert and renewal restoration behavior need corresponding focused tests.

</code_context>

<specifics>
## Specific Ideas

- Date-led billing headline: **“Your Elite access ends on August 31, 2026.”**
- Primary recovery action: **Keep Elite and renew**.
- Successful persistent state: **“Automatic renewal is on.”**
- Stripe-confirmed synchronization state: **“Renewal restored — syncing your membership status.”**
- A pending downgrade is a stable state, not an error: leaving the page means keeping it scheduled.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within the Phase 01 boundary.

</deferred>

---

*Phase: 01-elite-to-free-downgrade-feedback-and-renewal-recovery*
*Context gathered: 2026-07-19*

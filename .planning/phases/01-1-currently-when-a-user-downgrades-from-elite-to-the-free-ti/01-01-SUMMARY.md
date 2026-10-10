---
phase: 01-1-currently-when-a-user-downgrades-from-elite-to-the-free-ti
plan: 01
subsystem: payments
tags: [stripe, supabase-edge, deno, auth, cors, webhooks]

requires:
  - phase: quick-260718-jbd
    provides: Authenticated cancel-at-period-end Stripe boundary
provides:
  - Authenticated exact-date renewal preview and explicit restore API
  - Webhook-owned pending downgrade reconciliation for renewal and upgrades
  - Ownership, ambiguity, CORS, idempotency, and Merit-side-effect regression coverage
affects: [01-02, 01-03, pricing, dashboard, subscription-state]

tech-stack:
  added: []
  patterns:
    - Authenticated billing mutations use only the profile-owned Stripe subscription ID
    - Stripe confirmation precedes browser sync while webhook reconciliation owns persistence

key-files:
  created:
    - supabase/functions/renew-subscription/index.ts
    - supabase/functions/renew-subscription/index.test.ts
  modified:
    - supabase/functions/stripe-webhook-handler/index.ts
    - supabase/functions/stripe-webhook-handler/index.test.ts
    - supabase/functions/_shared/cors-audit.test.ts
    - supabase/functions/deno.json
    - supabase/config.toml
    - scripts/deploy.ps1

key-decisions:
  - "Only literal cancel_at_period_end=false with a finite positive current_period_end confirms restoration."
  - "The renewal request path never writes profile billing state; Stripe webhooks clear pending_downgrade_tier."
  - "Same-tier renewal clears pending state without changing Elite or granting Merits."

patterns-established:
  - "Preview/restore discriminator: one authenticated endpoint exposes a read-only exact-date preview and a separate explicit mutation."
  - "Fail-closed provider validation: malformed or ambiguous Stripe objects remain user-visible failures."

requirements-completed: []

duration: 11min
completed: 2026-07-20
---

# Phase 01 Plan 01: Secure Subscription Renewal Boundary Summary

**Authenticated Stripe preview/restore with explicit confirmation validation and webhook-owned same-tier renewal reconciliation**

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-20T03:06:01Z
- **Completed:** 2026-07-20T03:17:10Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Added a registered `renew-subscription` Edge Function with authenticated, user-scoped preview and restore actions and no client-selectable billing identifiers.
- Made restoration fail closed unless Stripe explicitly returns `cancel_at_period_end: false` and a valid authoritative period end; no price, invoice, portal, profile write, migration, environment variable, or dependency was added.
- Updated Stripe webhook reconciliation so same-tier Elite renewal and immediate upgrades clear stale pending downgrade state while preserving insert-first idempotency and existing Merit behavior.
- Added focused Deno coverage for auth, CORS, ownership/IDOR resistance, provider ambiguity, idempotency, cancel-true regression, same-tier renewal, and zero Merit grants.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement and register the authenticated Stripe preview/restore boundary** - `687e1422` (feat)
2. **Task 2: Make the Stripe webhook clear a same-tier pending downgrade safely** - `dbf69368` (fix)

**Plan metadata:** Local only by project rule; `.planning/` is ignored and was not committed.

## Files Created/Modified

- `supabase/functions/renew-subscription/index.ts` - Authenticated preview/restore Stripe boundary with explicit response validation.
- `supabase/functions/renew-subscription/index.test.ts` - Renewal security, ownership, CORS, idempotency, and provider-response tests.
- `supabase/functions/stripe-webhook-handler/index.ts` - Clears stale pending downgrade state for same-tier renewals and immediate upgrades.
- `supabase/functions/stripe-webhook-handler/index.test.ts` - Renewal, scheduled-cancel, upgrade, Merit, and duplicate-event assertions.
- `supabase/functions/_shared/cors-audit.test.ts` - Enrolls cancel and renew billing functions in the 19-function CORS inventory.
- `supabase/functions/deno.json` - Runs renewal tests in `test:ci`.
- `supabase/config.toml` - Registers the renewal Edge Function with handler-level auth.
- `scripts/deploy.ps1` - Adds the renewal function to the deployment inventory.

## Decisions Made

- Preview uses Stripe subscription retrieval only; restore uses `subscriptions.update(..., { cancel_at_period_end: false })` only.
- Extra client fields are non-authoritative and cannot affect the authenticated profile lookup or stored subscription target.
- A same-tier, non-cancel webhook is the authoritative persisted transition that clears `pending_downgrade_tier`; the request path returns immediate Stripe confirmation only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made the CORS drift guard quote-style agnostic**
- **Found during:** Task 1 focused verification
- **Issue:** The existing static guard recognized only `withCors(req, 'user', ...)`, while both `cancel-subscription` and Deno-formatted `renew-subscription` use double quotes.
- **Fix:** The guard now accepts either TypeScript quote style while preserving the same wrapper requirement.
- **Files modified:** `supabase/functions/_shared/cors-audit.test.ts`
- **Verification:** CORS audit passed 58/58 cases as part of the 94-test plan gate.
- **Committed in:** `687e1422`

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** The fix was necessary to enroll both billing functions without weakening the CORS invariant; no scope expansion.

## Issues Encountered

- Initial CORS audit run failed only for quote-style matching on the two newly enrolled billing functions. The guard was corrected and the full focused suite rerun green.

## User Setup Required

None - no external service configuration required.

## Verification

- `deno check renew-subscription/index.ts stripe-webhook-handler/index.ts` - PASS.
- `deno test --allow-all --no-check renew-subscription/index.test.ts stripe-webhook-handler/index.test.ts _shared/cors-audit.test.ts` - PASS, 94 passed / 0 failed.
- Registration search found `renew-subscription` in `supabase/config.toml`, `scripts/deploy.ps1`, `supabase/functions/deno.json`, and `supabase/functions/_shared/cors-audit.test.ts`.
- Diff review confirmed no renewal-path profile mutation and no new migration files.

## Next Phase Readiness

- The backend contract is ready for Plan 01-02's shared frontend subscription state and renewal dialog.
- No blockers or operator setup are outstanding for this plan.

## Self-Check: PASSED

- Both created key files exist.
- Both task commits are present.
- All task acceptance criteria and plan-level verification commands pass.
- `.planning/` remains local and unstaged by project rule.

---
*Phase: 01-1-currently-when-a-user-downgrades-from-elite-to-the-free-ti*
*Completed: 2026-07-20*

---
phase: 03-cross-device-reliability-and-compatibility
plan: 18
subsystem: checkout-reliability
tags: [stripe, checkout, playwright, cross-device, accessibility]
requires: [03-11, 03-16]
provides:
  - same-tick subscription and top-up checkout presentation
  - bounded 15000ms checkout-pending state with safe mapped copy
  - five-engine one-payment-object and mobile-dialog proof
requirements-completed: [XDEV-05, XRUN-06, XTEST-03]
completed: 2026-07-30
---

# Phase 03 Plan 18: Instant Checkout Reliability Summary

Checkout presentation now has an explicit device-level contract without changing any
payment request, price, tier, Merit, backend or database behavior. Subscription and
top-up dialogs open before their session-creating requests resolve, always render a
visible pending/unavailable/embedded body, and close after 15000ms if no client secret
arrives. The timeout releases the existing in-flight ownership so a deliberate retry
can start a fresh request, reports only the closed `checkout_failed` diagnostic, and
shows the frozen message `We couldn't start checkout. Please try again.`

The existing `checkoutInFlightRef` and `inFlightPackRef` remain the duplicate-payment
guards. Request generations prevent a timed-out subscription response from reopening
or populating a later attempt. Top-up focus ownership is recorded because the global
`topup:open` event has no Radix trigger; pointer-triggered WebKit dismissal now returns
focus to the correct pack button without changing request execution.

Both dialogs use the existing `h-viewport` dvh/vh utility, internal overflow, and
safe-area padding. Body overflow is restored to its previous value on dismissal.
The six locked testids and the U+2026 pending copy remain byte-identical.

## Regression proof

- `checkout-source-guard.test.ts` locks same-tick open ordering, the six testids,
  U+2026 copy, the 15000ms constant, and the provider-error leak prohibition.
- Four mutation proofs were executed and reverted: an `await` before open, a 30000ms
  timeout, three ASCII periods in place of U+2026, and rendered `error.message` each
  made the guard fail at the intended assertion.
- `checkout-open.spec.ts` stalls both session-creating endpoints indefinitely. Across
  all five projects it proves <=500ms visible dialogs, a non-empty pending body, safe
  timeout closure, exactly one mobile PaymentIntent under rapid taps, zero requests
  while capability-degraded, focus entry/return, iOS viewport fit, internal scrolling,
  body-scroll restoration, and the XRUN-06 leak guard. No payment is completed.

## Full-suite instability diagnosis

Initial full runs exposed timing failures in untouched 03-15/03-17 tests. Process
inspection found no orphaned Playwright, Vite, Chromium, Firefox or WebKit process.
The 03-18 diff opens no browser context/server; route handlers and request listeners
are page-scoped; both component timers clear on secret arrival/unmount; and the
document/window listeners unregister on unmount.

The untouched mobile waiting and one-click tests reproduced the completion timeout
when run together **without** `checkout-open.spec.ts`, while the same completion test
passed alone in 3.6 seconds. That proves pre-existing co-scheduling contention rather
than a 03-18 resource leak. After clearing only disposable `test-results/` and
`playwright-report/` output, the repository's normal unchanged `npm run test:e2e`
command passed with its configured four workers and five projects.

## Validation

| Gate | Result |
| --- | --- |
| Focused checkout unit/static lane | 6 files, 65 tests passed |
| Focused 03-18 five-engine matrix | 19 passed, 7 intentional project skips, 50.3 s |
| Complete Playwright gate (`npm run test:e2e`) | 315 passed, 43 intentional skips, 0 failed, 9.8 min |
| Complete Vitest suite | 147 files, 1,169 tests passed |
| Type-check | exit 0 |
| ESLint | exit 0; 0 errors, 153 existing warnings |
| Production build | exit 0 |
| `git diff --check` | exit 0 |

The focused addition is well inside the documented +3-minute hard budget. No case,
project, worker, timeout or assertion was weakened. `waiting-surface.spec.ts`,
`playwright.config.ts`, and `playwright.prod.config.ts` remain unchanged.

AI prompts, models, request payload contents, response schemas, feature outputs,
scoring, Merit prices/refunds, tier rules, Supabase, migrations and Phase 2 remain
untouched. A real payment and real charge remain operator-only production evidence
for P-1.

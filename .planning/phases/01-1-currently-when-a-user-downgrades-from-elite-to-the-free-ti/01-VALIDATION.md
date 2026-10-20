---
phase: 01
slug: elite-to-free-downgrade-feedback-and-renewal-recovery
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-19
updated: 2026-07-19
---

# Phase 01 — Validation Strategy

> Finalized task-to-decision and ASVS Level 1 threat coverage contract. `nyquist_compliant: true` means every planned task has an executable automated check and continuous decision/threat mapping; `wave_0_complete` remains false until the new test files are implemented and green.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 + Testing Library; Deno 2 test runner; Playwright via baseline gate |
| **Config file** | `vite.config.ts`; `supabase/functions/deno.json`; `playwright.config.ts` |
| **Quick run command** | `npm.cmd run test -- <focused frontend files>` or focused `deno.cmd test --allow-all --no-check <edge files>` |
| **Full suite command** | `npm.cmd run verify:baseline` |
| **Estimated runtime** | Focused checks under 120 seconds; full baseline environment-dependent |

## Sampling Rate

- **After every task implementation and before any source commit:** run the exact focused automated command named by that task.
- **After every plan wave:** run all Phase 01 focused tests created/changed through that wave plus `npm.cmd run type-check`.
- **Before `$gsd-verify-work`:** `npm.cmd run verify:baseline` must be green, or an environment-startup blocker must be recorded honestly as blocked/flaky.
- **Max focused feedback latency:** 120 seconds.
- **Planning artifact policy:** create SUMMARY/validation artifacts locally, but keep all `.planning` files unstaged and uncommitted; source/test/config commits must exclude `.planning`.

## Unique Threat Registry

| ID | Severity | Plan | Threat | Blocking evidence |
|----|----------|------|--------|-------------------|
| T-01 | HIGH | 01 | IDOR / subscription ownership bypass | Authenticated stored-ID and cross-user tests |
| T-02 | HIGH | 01 | False financial success from ambiguous Stripe response | Exact response-shape tests |
| T-03 | HIGH | 01 | Webhook integrity / duplicate entitlement grant | Same-tier clear + zero-Merit + idempotency tests |
| T-04 | MEDIUM | 01 | Secret/payment-data exposure | Logger/error-contract source assertions and review |
| T-05 | HIGH | 02 | Duplicate or unconfirmed financial mutation | Confirmation-first and one-invoke component tests |
| T-06 | HIGH | 02 | False success from stale/ambiguous client state | Failure-preservation and explicit-false tests |
| T-07 | MEDIUM | 02 | Cross-user query/session-state leakage | User-keyed query/dismissal/timer tests |
| T-08 | MEDIUM | 02 | Misleading date/price disclosure | Invalid-date, preview, exact-copy, no-price tests |
| T-09 | HIGH | 03 | Duplicate downgrade/renewal action | Native disable + callback/handler guards |
| T-10 | HIGH | 03 | Stale/inactive/simulated billing-state confusion | Real-profile active/trialing-only predicate tests |
| T-11 | MEDIUM | 03 | Misleading/inaccessible Pricing state | Text/icon/disabled/copy/token assertions |
| T-12 | HIGH | 04 | Stale timer or session leakage | Cleanup, identity/boundary, storage-key tests |
| T-13 | HIGH | 04 | False renewal or expired-action exposure | Exact-boundary and failure-preservation tests |
| T-14 | MEDIUM | 04 | Inaccessible/obscured urgency control | Alert semantics, target size, ordering, responsive review |

**Blocking rule:** no plan may complete with a failing or missing HIGH threat assertion. The exact HIGH set is T-01, T-02, T-03, T-05, T-06, T-09, T-10, T-12, and T-13.

## Per-Task Verification Map

| Task ID | Plan | Wave | Decision IDs | Threat Ref | Secure behavior | Automated command | File state | Status |
|---------|------|------|--------------|------------|-----------------|-------------------|------------|--------|
| 01-01-01 | 01 | 1 | D-15–D-17, D-20 | T-01, T-02, T-04 | Authenticated caller can act only on their stored subscription; preview is read-only; ambiguous Stripe data never becomes success; logs expose no secrets | `Push-Location supabase/functions; try { deno.cmd check renew-subscription/index.ts; deno.cmd test --allow-all --no-check renew-subscription/index.test.ts _shared/cors-audit.test.ts } finally { Pop-Location }` | W0 create/extend | passed |
| 01-01-02 | 01 | 1 | D-18–D-20 | T-03 | Same-tier renewal clears pending Free without tier interruption, Merit grant, or idempotency regression | `Push-Location supabase/functions; try { deno.cmd check stripe-webhook-handler/index.ts renew-subscription/index.ts; deno.cmd test --allow-all --no-check stripe-webhook-handler/index.test.ts renew-subscription/index.test.ts } finally { Pop-Location }` | existing + extend | passed |
| 01-02-01 | 02 | 2 | D-06–D-10, D-12–D-14, D-19 | T-07, T-08, T-10 | Dates/countdown never guess; query is user-keyed and real-profile-only; only active/trialing qualifies and canceled/inactive/null/unknown status suppresses stale recovery UI | `npm.cmd run test -- src/lib/subscription-downgrade.test.ts src/hooks/useSubscriptionState.test.ts && npm.cmd run type-check` | W0 create | passed |
| 01-02-02 | 02 | 2 | D-15–D-20 | T-05, T-06, T-08 | Confirmation precedes mutation, exact date/no price is disclosed, repeat submit is blocked, and failure preserves pending state | `npm.cmd run test -- src/components/billing/RenewEliteDialog.test.tsx src/hooks/useSubscriptionState.test.ts src/lib/subscription-downgrade.test.ts && npm.cmd run type-check` | W0 create | passed |
| 01-03-01 | 03 | 3 | D-03–D-05 | T-09, T-11 | Current/Scheduled are visibly and natively disabled; neither card can dispatch a billing callback | `npm.cmd run test -- src/components/pricing/TierCardV2.test.tsx src/components/pricing/__tests__/TierCardV2.interviewPrep.test.tsx src/pages/__tests__/pricing-token-guard.test.ts && npm.cmd run type-check` | W0 create + extend | passed |
| 01-03-02 | 03 | 3 | D-01–D-09, D-15–D-20 | T-05, T-06, T-09, T-10, T-11 | Pricing is context-aware, active/trialing real-state gated, duplicate-safe, no-estimate, and preserves pending state on failed renewal | `npm.cmd run test -- src/pages/Pricing.test.tsx src/components/pricing/TierCardV2.test.tsx src/components/billing/RenewEliteDialog.test.tsx src/pages/__tests__/pricing-token-guard.test.ts && npm.cmd run type-check` | existing + extend | passed |
| 01-04-01 | 04 | 4 | D-10–D-20 | T-05, T-06, T-12, T-13, T-14 | Alert is topmost, 7–0-day/exact-boundary correct, session-only, timer-safe, and shares failure-safe renewal recovery | `npm.cmd run test -- src/components/dashboard/SubscriptionEndingAlert.test.tsx src/pages/Dashboard.test.tsx src/components/billing/RenewEliteDialog.test.tsx src/lib/subscription-downgrade.test.ts && npm.cmd run type-check` | W0 create + extend | passed |
| 01-04-02 | 04 | 4 | D-01–D-20 | HIGH: T-01, T-02, T-03, T-05, T-06, T-09, T-10, T-12, T-13; MEDIUM: T-04, T-07, T-08, T-11, T-14 | Full billing/auth/CORS/webhook/UI regression and exact HIGH-threat gate remain green | `npm.cmd run verify:baseline` | command exists | passed |

## Wave 0 Requirements

- [x] `supabase/functions/renew-subscription/index.test.ts` — T-01/T-02/T-04 auth, ownership, CORS, preview, restore, idempotency, logging, and ambiguous-response cases.
- [x] `src/lib/subscription-downgrade.test.ts` — T-08 date normalization, local calendar threshold, countdown grammar, exact-instant expiration, and dismissal-key derivation.
- [x] `src/hooks/useSubscriptionState.test.ts` — T-07/T-10 authoritative user-keyed profile state, active/trialing allowlist, inactive/canceled suppression, and bounded reconciliation.
- [x] `src/components/billing/RenewEliteDialog.test.tsx` — T-05/T-06/T-08 disclosure, duplicate-submit lock, sync, success, and failure preservation.
- [x] `src/components/pricing/TierCardV2.test.tsx` — T-09/T-11 available/current/scheduled contract and callback defense.
- [x] `src/components/dashboard/SubscriptionEndingAlert.test.tsx` — T-12/T-13/T-14 ordering, date/countdown, timers, session dismissal, expiry, and renewal entry.
- [x] Extend `src/pages/Pricing.test.tsx`, `src/pages/Dashboard.test.tsx`, `supabase/functions/stripe-webhook-handler/index.test.ts`, `supabase/functions/_shared/cors-audit.test.ts`, and existing pricing token/Interview Prep guards.

`wave_0_complete` changes to true only after every item above exists and its mapped focused command is green.

## Manual-Only Verifications

| Behavior | Decision | Why manual | Test instructions |
|----------|----------|------------|-------------------|
| Responsive visual hierarchy | D-06, D-11, D-13, D-15 | DOM assertions do not prove final composition | At 320px, 768px, desktop, light/dark, and 200% zoom, verify panel/banner/card/dialog order, contrast, focus, and no overflow. |
| Browser-session dismissal | D-12 | Unit storage mocks do not prove real tab lifecycle | Dismiss, reload/navigate in the same tab, then open a new browser session; it stays hidden only in the original session while eligible. |
| Live Stripe-to-webhook reconciliation | D-18, D-19 | Requires deployed preview/test Stripe subscription and webhook | Schedule, restore, and observe pending -> syncing -> confirmed without duplicate controls, tier interruption, or Merit grant. |

## Validation Sign-Off

- [x] All eight plan tasks have an exact `<automated>` command.
- [x] No three consecutive tasks lack automated verification; in fact every task has it.
- [x] All W0-missing tests are declared before their dependent implementation assertions.
- [x] D-01 through D-20 are mapped without inventing milestone requirement IDs.
- [x] T-01 through T-14 are unique; all nine HIGH threats are explicitly blocking and mapped.
- [x] Plan/wave mapping matches 01-01 wave 1, 01-02 wave 2, 01-03 wave 3, and 01-04 wave 4.
- [x] No watch-mode flags appear; focused feedback target remains under 120 seconds.
- [x] `.planning` artifacts remain local, unstaged, and uncommitted.
- [x] Wave 0 implementation complete (execution-time gate).
- [x] Full `verify:baseline` green (execution-time gate).

**Approval:** automated execution evidence complete; manual-only UAT remains for operator verification

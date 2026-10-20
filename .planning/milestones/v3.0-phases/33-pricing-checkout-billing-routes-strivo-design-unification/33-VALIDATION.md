---
phase: 33
slug: pricing-checkout-billing-routes-strivo-design-unification
status: audited
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-21
audited: 2026-05-31
---

# Phase 33 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (frontend) + deno test (edge functions) |
| **Config file** | `vite.config.ts` / `package.json` (`test` script); `supabase/functions/deno.json` |
| **Quick run command** | `npx.cmd vitest run <changed-file>` |
| **Full suite command** | `npm run test` (frontend) + `.\scripts\run-edge-tests.ps1` or equivalent `deno.cmd test` invocation (edge) |
| **Estimated runtime** | ~30-60 seconds (frontend); ~20s (edge targeted set) |

---

## Sampling Rate

- **After every task commit:** Run `npx.cmd vitest run <changed-file>` (or targeted static guard/lint for restyle-only tasks with no logic).
- **After every plan wave:** Run the affected wave's targeted test set.
- **Before `/gsd:verify-work`:** Full relevant suite must be green + build status recorded.
- **Max feedback latency:** 60 seconds for targeted validation commands.

---

## Per-Task Verification Map

> Filled by planner and audited on 2026-05-31. Each row maps a task to observable verification.
> Stripe-boundary e2e flows (TEST-07/TEST-08) are partly manual; see Manual-Only Verifications.
> The TEST-07 manual flows are captured by the committed operator checklist artifact (Plan 05 Task 3).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 33-01-01 | 01 | 1 | PRICE-02 | T-33-01/03 | Portal `return_url` is a fixed first-party path; customer resolved from `ctx.userId` only | static+edge | `deno.cmd test --allow-all create-stripe-portal/index.test.ts --no-check` | yes | green |
| 33-01-02 | 01 | 1 | PRICE-04, TEST-08 | T-33-02 | `merit_shop_purchases` query is user-scoped with `.eq('user_id', userId)`; no infinite spinner on null/stale session | unit (RTL) | `npx.cmd vitest run src/pages/Settings/Billing.test.tsx` | yes | green |
| 33-02-01 | 02 | 1 | PRICE-03 | T-33-04/05/07 | Swap sub id read only from caller profile keyed by `ctx.userId`; price from `STRIPE_PRICE_*` env, never request body | unit (deno) | `deno.cmd test --allow-all create-checkout-session/index.test.ts --no-check` | yes | green |
| 33-02-02 | 02 | 1 | PRICE-03 | T-33-05 | Edge tests assert `subscriptions.update` vs `checkout.sessions.create` branch and `portal_required` fallback | unit (deno) | `deno.cmd test --allow-all create-checkout-session/index.test.ts --no-check` | yes | green |
| 33-03-01 | 03 | 2 (W0) | PRICE-01, PRICE-03 | T-33-08 | Wave 0 stub specs failed before implementation and now pass as regression coverage | unit (RTL) | `npx.cmd vitest run src/pages/Pricing.test.tsx src/pages/Dashboard.test.tsx` | yes W0 | green |
| 33-03-02 | 03 | 2 | PRICE-03 | T-33-08 | `reconcileTierUpgrade` reuses poll bounds; reads cached tier; timeout is silent | unit (RTL) | `npx.cmd vitest run src/hooks/useMerits.test.ts` | yes | green |
| 33-03-03 | 03 | 2 | PRICE-01 | T-33-09 | Direct `create-checkout-session` invoke; branch on `data.mode`; no `/checkout` nav; client passes only tier+interval | unit (RTL) | `npx.cmd vitest run src/pages/Pricing.test.tsx` | yes | green |
| 33-03-04 | 03 | 2 | PRICE-03 | T-33-08/10 | `?checkout=complete` triggers read-only reconcile poll + toast + URL cleanup; no grant client-side | unit (RTL) | `npx.cmd vitest run src/pages/Dashboard.test.tsx` | yes | green |
| 33-04-01 | 04 | 2 | PRICE-05 | T-33-11/12/13 | Portal invoked only when `stripe_customer_id` is present; no customer id sent; `no_customer` degrades to Upgrade link | unit (RTL) | `npx.cmd vitest run src/pages/Settings/Billing.test.tsx` | yes | green |
| 33-05-01 | 05 | 3 | PRICE-06 | T-33-15 | Presentation-only className swap; no boundary change | static+unit | `npx.cmd vitest run src/pages/__tests__/pricing-token-guard.test.ts` | yes | green |
| 33-05-02 | 05 | 3 | PRICE-07, PRICE-08 | T-33-14 | Token guard: no `theme-v2`/arbitrary-var pricing surface; content snapshot unchanged; `isCurrent` presentational only | unit+static | `npx.cmd vitest run src/pages/__tests__/pricing-token-guard.test.ts src/pages/Pricing.test.tsx src/config/__tests__/sc12-snapshot.test.ts` | yes | green |
| 33-05-03 | 05 | 3 | TEST-07 | T-33-08/09 (obs) | Four live e2e flows executed in Stripe test mode; Pro->Elite shows one active subscription | manual+artifact | filled `33-TEST-07-CHECKLIST.md` committed (operator) | yes | manual PASS |

*Status: green = automated verification passed in this audit; manual PASS = operator checklist records PASS evidence.*

---

## Wave 0 Requirements

- [x] Unit test for `Pricing.tsx` `handleTierCta` opens embedded checkout modal (no `navigate('/checkout')`) - PRICE-01 - created as a failing stub in **Plan 03 Task 1 (Wave 0)** as `src/pages/Pricing.test.tsx`; turned green by Plan 03 Task 3.
- [x] Unit/integration test for Dashboard `?checkout=complete` reconciliation poll (toast + tier/merit watch + URL cleanup) - PRICE-03 - created as a failing stub in **Plan 03 Task 1 (Wave 0)** as `src/pages/Dashboard.test.tsx`; turned green by Plan 03 Task 4 and re-verified on 2026-05-31.
- [x] Unit test for `Settings/Billing.tsx` query path: `userId === null` short-circuits without infinite spinner; `.maybeSingle()` used - PRICE-04 - covered by extending the existing `src/pages/Settings/Billing.test.tsx` in Plan 01 Task 2.
- [x] Edge function test for `create-checkout-session` Pro->Elite subscription-swap path (`stripe.subscriptions.update`, no second subscription) - PRICE-03 - Plan 02 Task 2.
- [x] Edge function / route test confirming `create-stripe-portal` `return_url` resolves to a live app route - PRICE-05 - covered by Plan 01 source assertion (return_url literal `/settings/billing`) plus `create-stripe-portal/index.test.ts`; route existence confirmed against `src/App.tsx`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Recorded In |
|----------|-------------|------------|-------------------|-------------|
| Free->Pro / Free->Elite checkout completes and tier updates | TEST-07, PRICE-01/03 | Crosses live Stripe Checkout + webhook boundary | In staging: click upgrade on `/pricing`, complete embedded checkout with Stripe test card, confirm redirect to `/dashboard?checkout=complete`, "Upgrade processing..." toast, then `subscription_tier` + merit cap reconcile within ~10s | `33-TEST-07-CHECKLIST.md` (Plan 05 Task 3) |
| Pro->Elite swaps subscription (no double-billing) | TEST-08, PRICE-03/D-04 | Requires inspecting Stripe dashboard for active subscription count | In staging as a Pro subscriber: upgrade to Elite, then verify in Stripe dashboard exactly one active subscription remains (item swapped to Elite price), not two | `33-TEST-07-CHECKLIST.md` Pro->Elite row (Plan 05 Task 3) |
| Customer portal opens and returns to a live route | PRICE-05/D-06 | Crosses Stripe billing portal boundary | Click "Manage Subscription" on `/settings/billing`, confirm portal opens, then return lands on a real app route (not NotFound) | Plan 04 phase-gate manual |
| `/pricing` light + dark visual parity with `/dashboard` tokens | PRICE-06/07/08 | Visual judgment | Load `/pricing` in light and dark mode; confirm shadcn Card treatment, semantic tokens, all V2 content (tiers, toggle, savings badges, four Top-Up packs, current-plan highlight) present and no `.theme-v2`/arbitrary-var styling remains | Plan 05 phase-gate manual |

---

## Validation Sign-Off

- [x] All tasks have automated verification or Wave 0 dependencies; TEST-07 manual flow has a committed-artifact acceptance gate in Plan 05 Task 3.
- [x] Sampling continuity: no 3 consecutive tasks without automated verification.
- [x] Wave 0 covers all MISSING references (`Pricing.test.tsx` + `Dashboard.test.tsx` created in Plan 03 Task 1 before implementation tasks).
- [x] No watch-mode flags.
- [x] Feedback latency < 60s for targeted validation commands.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved (planner revision 2026-05-21); audited green on 2026-05-31.

---

## Validation Audit 2026-05-31

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved / verified | 12 |
| Escalated | 0 |
| Manual-only PASS artifacts | 1 |
| Warnings | 1 |

### Commands Run

- `npx.cmd vitest run src/pages/Settings/Billing.test.tsx src/pages/Pricing.test.tsx src/pages/Dashboard.test.tsx src/hooks/useMerits.test.ts src/pages/__tests__/pricing-token-guard.test.ts src/config/__tests__/sc12-snapshot.test.ts` - 6 files, 54 tests passed.
- `deno.cmd test --allow-all create-checkout-session/index.test.ts create-stripe-portal/index.test.ts stripe-webhook-handler/index.test.ts _tests/test-05-upgrade-proration.test.ts --no-check` from `supabase/functions` - 54 tests passed.
- `npx.cmd eslint` on targeted Phase 33 files - nonzero only on pre-existing `@typescript-eslint/no-explicit-any` debt in `src/pages/Dashboard.tsx` and `supabase/functions/create-stripe-portal/index.ts`; no Phase 33 validation coverage gap.

### Auditor Result

`gsd-nyquist-auditor` returned `## GAPS FILLED`: 12/12 validation rows verified, no new tests required.

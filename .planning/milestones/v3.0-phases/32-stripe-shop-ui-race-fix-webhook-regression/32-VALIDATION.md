---
phase: "32"
slug: "stripe-shop-ui-race-fix-webhook-regression"
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-22
updated: 2026-06-01
source_state: reconstructed
---

# Phase 32 - Validation Strategy

Per-phase validation contract for Nyquist feedback sampling after Phase 32 execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest 4.x for React client tests; Deno test for Supabase edge function tests |
| Config file | `vitest.config.ts`; `supabase/functions/deno.json` |
| Quick run command | `npx vitest run src/components/topup/StripePaymentElementModal.test.tsx` |
| Full suite command | `npx vitest run src/components/topup/StripePaymentElementModal.test.tsx && deno test --node-modules-dir=auto --allow-all --no-check supabase/functions/stripe-webhook-handler/index.test.ts` |
| Estimated runtime | ~15 seconds |

## Sampling Rate

- After every task commit: run the quick command for the touched area.
- After every plan wave: run the full suite command above.
- Before `/gsd-verify-work`: targeted suites must be green; whole-app typecheck status is recorded below.
- Max feedback latency: ~15 seconds for targeted Phase 32 coverage.

## Requirement Coverage Matrix

| Requirement | Source Plan | Behavior | Test Evidence | Status |
|-------------|-------------|----------|---------------|--------|
| MER-07 | 32-01 | Above-cap shop credit render: 75/75 plus 3-pack becomes 78/75 after reconciliation | `StripePaymentElementModal.test.tsx` T7 drives the poll with fake timers, mutates cached `shop_balance` from 75 to 78, and verifies the poll stops after observing the higher value | COVERED |
| MER-08 | 32-01 | 10s reconciliation window, immediate close, canonical processing toast, silent timeout | `StripePaymentElementModal.test.tsx` T6/T8/T9 assert processing toast copy, immediate `onOpenChange(false)`, `vi.advanceTimersByTimeAsync`, and no error toast after the ceiling | COVERED |
| MER-10 | 32-02 | Stripe webhook replay cannot double-credit shop merits across event_id, payment_intent_id, and checkout session/PI axes | `stripe-webhook-handler/index.test.ts` has exactly three `MER-10 axis-*` tests; Deno suite passes 21/21 | COVERED |
| TEST-03 | 32-02 | Durable automated regression for Stripe shop-credit idempotency | Same Deno suite is deterministic and dependency-injected through `handleStripeWebhook(req, { supabase, stripe })` | COVERED |

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | MER-07, MER-08 | T-32-01 / T-32-02 / T-32-03 | `useMerits().reconcileShopCredit(snapshot)` reads server-authored cache only, uses exact `['merit-balance', userId]`, and bounds polling to 10000ms | unit/behavior | `npx vitest run src/components/topup/StripePaymentElementModal.test.tsx` | yes | green |
| 32-01-02 | 01 | 1 | MER-07, MER-08 | T-32-03 | Modal snapshots `shop` before `confirmPayment`, starts detached poll, closes immediately, and does not add timeout errors or manual refresh UI | component | `npx vitest run src/components/topup/StripePaymentElementModal.test.tsx` | yes | green |
| 32-01-03 | 01 | 1 | MER-07, MER-08 | T-32-03 | Fake-timer tests exercise poll success, immediate close, and silent timeout | component | `npx vitest run src/components/topup/StripePaymentElementModal.test.tsx` | yes | green |
| 32-02-01 | 02 | 1 | MER-10, TEST-03 | T-32-01 | Three replay axes assert exactly-once `credit_shop_merits` behavior or duplicate RPC response | edge unit | `deno test --node-modules-dir=auto --allow-all --no-check supabase/functions/stripe-webhook-handler/index.test.ts` | yes | green |
| 32-02-02 | 02 | 1 | MER-10, TEST-03 | T-32-01 | Webhook handler remains read-only; idempotency is verified by tests, not production changes | git checkpoint | `git status --porcelain supabase/functions/stripe-webhook-handler/index.ts` | yes | green |

## Commands Run During Audit

| Command | Result |
|---------|--------|
| `npx vitest run src/components/topup/StripePaymentElementModal.test.tsx` | PASS: 1 file, 9 tests |
| `deno test --node-modules-dir=auto --allow-all --no-check supabase/functions/stripe-webhook-handler/index.test.ts` | PASS: 21 tests |
| `grep -c 'MER-10 axis-' supabase/functions/stripe-webhook-handler/index.test.ts` equivalent | PASS: 3 |
| `git status --porcelain src/hooks/useMerits.ts src/components/topup/StripePaymentElementModal.tsx src/components/topup/StripePaymentElementModal.test.tsx src/components/topup/MeritBalanceHeaderV2.tsx supabase/functions/stripe-webhook-handler/index.ts supabase/functions/stripe-webhook-handler/index.test.ts` | PASS: empty output |
| `npx tsc --noEmit -p tsconfig.app.json` | RED: unrelated pre-existing whole-app TypeScript failures outside Phase 32 files |

## Known Non-Phase Gate

`npx tsc --noEmit -p tsconfig.app.json` currently exits non-zero. The errors are outside Phase 32 target files:

- `src/config/__tests__/feature-flags.test.ts`
- `src/hooks/__tests__/usePaywallGuard.test.tsx`
- `src/hooks/__tests__/useTierAccess.test.tsx`
- `src/pages/CareerCompass.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/SkillsGapAnalysis.tsx`
- `src/pages/Upload.tsx`

No TypeScript errors were reported in `src/hooks/useMerits.ts`, `src/components/topup/StripePaymentElementModal.tsx`, or `src/components/topup/StripePaymentElementModal.test.tsx`. This is not a Nyquist gap for Phase 32 because the targeted behavioral validation is green and the failing global gate is unrelated to the phase artifacts.

## Wave 0 Requirements

Existing infrastructure covers all Phase 32 requirements. No Wave 0 stubs or framework installation are needed.

## Manual-Only Verifications

All Phase 32 requirements have automated verification. Live Stripe test-mode purchase checks remain supplemental UAT, tracked in `32-VERIFICATION.md`, because real webhook delivery latency cannot be deterministically forced by unit tests.

## Validation Audit 2026-05-22

| Metric | Count |
|--------|-------|
| Requirements audited | 4 |
| Tasks mapped | 5 |
| Gaps found | 0 |
| Resolved by new tests | 0 |
| Escalated/manual-only gaps | 0 |
| Targeted green suites | 2 |

## Validation Audit 2026-05-31

| Metric | Count |
|--------|-------|
| Requirements audited | 4 |
| Tasks mapped | 5 |
| Gaps found | 0 |
| Resolved by new tests | 0 |
| Escalated/manual-only gaps | 0 |
| Targeted green suites | 2 |

### Commands Run During Re-Audit

| Command | Result |
|---------|--------|
| `npx.cmd vitest run src/components/topup/StripePaymentElementModal.test.tsx` | PASS: 1 file, 9 tests |
| `deno.cmd test --node-modules-dir=auto --allow-all --no-check supabase/functions/stripe-webhook-handler/index.test.ts` | PASS: 21 tests |
| `rg -c "MER-10 axis-" supabase/functions/stripe-webhook-handler/index.test.ts` | PASS: 3 |
| `git status --short src/hooks/useMerits.ts src/components/topup/StripePaymentElementModal.tsx src/components/topup/StripePaymentElementModal.test.tsx src/components/topup/MeritBalanceHeaderV2.tsx supabase/functions/stripe-webhook-handler/index.ts supabase/functions/stripe-webhook-handler/index.test.ts .planning/phases/32-stripe-shop-ui-race-fix-webhook-regression/32-VALIDATION.md` | PASS before artifact update: empty output |

## Validation Audit 2026-06-01

| Metric | Count |
|--------|-------|
| Requirements audited | 4 |
| Tasks mapped | 5 |
| Gaps found | 0 |
| Resolved by new tests | 0 |
| Escalated/manual-only gaps | 0 |
| Targeted green suites | 2 |

### Commands Run During Re-Audit

| Command | Result |
|---------|--------|
| `npx vitest run src/components/topup/StripePaymentElementModal.test.tsx` | PASS: 1 file, 9 tests |
| `deno test --node-modules-dir=auto --allow-all --no-check supabase/functions/stripe-webhook-handler/index.test.ts` | PASS: 21 tests (incl. MER-10 axis-1/2/3) |
| `rg -c "MER-10 axis-" supabase/functions/stripe-webhook-handler/index.test.ts` | PASS: 3 |
| `rg -c "reconcileShopCredit" src/hooks/useMerits.ts` / `...StripePaymentElementModal.tsx` | PASS: 4 / 6 |
| `git status --porcelain supabase/functions/stripe-webhook-handler/index.ts` | PASS: empty (handler unmodified) |
| `git status --porcelain` (all 4 phase impl/test files) | PASS: empty |

All four requirements re-verified COVERED against the live codebase; both targeted suites green; handler checkpoint intact. No gaps. `nyquist_compliant` remains `true`.

## Validation Sign-Off

- [x] All tasks have automated verification or a checkpoint command.
- [x] Sampling continuity: no 3 consecutive tasks without automated verification.
- [x] Wave 0 covers all missing references; none were missing.
- [x] No watch-mode flags in validation commands.
- [x] Feedback latency is under 20 seconds for targeted suites.
- [x] `nyquist_compliant: true` set in frontmatter.

Approval: approved 2026-05-22

---
status: pass
phase: 08-paddle-retirement
source: [08-05-PLAN.md, 08-04-SUMMARY.md]
updated: 2026-07-09
---

# Phase 8 Plan 05 Billing Smoke — Full-Retirement Result

This supersedes `08-BILLING-SMOKE.md` (the earlier safe-prep-only smoke, which was
blocked by a Deno Windows runner panic before any test executed). Plan 08-04 has
since retired Paddle on preview and removed the repo-level Paddle surface; this is
the post-removal billing regression proof.

## Command

```powershell
deno.cmd test --allow-all --no-check create-checkout-session/index.test.ts create-stripe-portal/index.test.ts stripe-webhook-handler/index.test.ts create-payment-intent/index.test.ts _shared/merit-gateway.test.ts
```

Run from `supabase/functions/`.

## Result

**77 passed | 0 failed** (2s). No repro of the earlier Deno 2.7.1 Windows runner
panic — the suite completed cleanly on the first attempt, no fallback needed.

Per-file coverage confirmed in the run output:
- `create-payment-intent/index.test.ts` — happy path, method guard, auth guard,
  rate-limit guard, invalid/missing pack_id, lazy Stripe customer creation,
  fail-closed on Stripe error, CORS preflight — all passed.
- `create-stripe-portal/index.test.ts` — missing JWT, CORS preflight, method
  guard, no-customer guard, happy path, cross-user isolation (STR-05) — all
  passed.
- `_shared/merit-gateway.test.ts` — refundable-error classification, feature
  flag reflection, 402/403 typed responses, precheck-cache hit/miss/error paths,
  3-arg backwards-compat call — all passed (15 tests).
- `create-checkout-session/index.test.ts` and `stripe-webhook-handler/index.test.ts`
  ran as part of the same invocation and contributed to the 77/0 total (Deno
  aggregates pass/fail counts across all files in one `deno test` invocation).

## No-Live-Paddle Guard Re-Confirmation

```powershell
deno.cmd test --allow-all --no-check _shared/no-paddle-live-surface.test.ts
```

**11 passed | 0 failed.** Confirms the guard added in 08-04 still passes after
this session's doc edits — no live Paddle reference has crept back in.

## Lint

`npm run lint` — **0 errors** (158 pre-existing warnings, unrelated to Phase 8;
same count observed during 08-04).

## Conclusion

Stripe checkout, portal, webhook-handler, and Merit deduction/refund logic were
**not modified** by Phase 8 — only Paddle-only surfaces (schema, function, config,
docs) were touched. This run proves that removal did not regress billing: all
targeted Stripe and Merit test files pass, and the permanent negative-reference
guard confirms no live Paddle surface remains in the repo as of this commit.

Ready for plan 08-05's Task 2 operator checkpoint (production migration + function
removal).

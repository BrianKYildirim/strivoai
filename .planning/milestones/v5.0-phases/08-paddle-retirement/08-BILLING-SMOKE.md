---
status: blocked-safe-prep-complete
phase: 08-paddle-retirement
source: [08-03-PLAN.md]
updated: 2026-07-09
---

# Phase 8 Billing Smoke

This is a safe-prep smoke record. Full Paddle retirement was not applied because
the gate is blocked.

## Preview Evidence

No preview migration or function removal was applied. Destructive cleanup is not
authorized until `08-PADDLE-GATE.md` has a clear verdict.

## Production Read-Only Evidence

Not performed in this execution. The required operator-provided production
app-state output and Paddle dashboard/export evidence are still missing.

## Stripe Unaffected

Focused billing regression command attempted:

```powershell
deno.cmd test --allow-all --no-check supabase/functions/create-checkout-session/index.test.ts supabase/functions/create-stripe-portal/index.test.ts supabase/functions/stripe-webhook-handler/index.test.ts supabase/functions/create-payment-intent/index.test.ts supabase/functions/_shared/merit-gateway.test.ts
```

Result: blocked by Deno 2.7.1 Windows runner panic before tests executed:

```text
Unexpected client pipe failure
called `Result::unwrap()` on an `Err` value: Os { code: 6, message: "The handle is invalid." }
```

Single-file retries for `merit-gateway.test.ts` and
`create-checkout-session/index.test.ts` reproduced the same Deno runner panic.

## Access and Merit Behavior

No schema cleanup occurred, so provider-neutral access fields and Paddle-backed
legacy structures remain unchanged. Merit and Stripe source files were not
modified in this safe-prep execution.

## Copy and Current Surface Checks

Command:

```powershell
rg -n "Paddle|paddle|PADDLE_WEBHOOK_SECRET" src\pages\Profile.tsx src\pages\Refund.tsx supabase\functions\send-notification-email\index.ts supabase\functions\notify-upgrade-request\index.ts supabase\functions\notify-admin-activity\index.ts
```

Result: no matches.

## Remaining Blockers

- Fresh prod app-state query output is missing.
- Fresh authoritative Paddle evidence is missing.
- Deno billing tests are blocked locally by the Deno Windows runner panic.
- Full no-live-Paddle guard is intentionally not applicable until the gate is clear and destructive cleanup is applied.

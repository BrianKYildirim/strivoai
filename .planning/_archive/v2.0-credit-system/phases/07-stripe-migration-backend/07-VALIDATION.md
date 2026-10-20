---
phase: 07
slug: stripe-migration-backend
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno test (built-in) |
| **Config file** | `supabase/functions/deno.json` |
| **Quick run command** | `deno test --allow-all supabase/functions/_shared/stripe-client.test.ts supabase/functions/stripe-webhook/*.test.ts` |
| **Full suite command** | `powershell -File scripts/run-edge-tests.ps1` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick command scoped to files touched
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

Planner fills this table during plan generation. Each task must link to:
- a requirement ID (STR-01..07 / STR-12),
- a threat model ref (from PLAN.md `<threat_model>`),
- an automated Deno test command OR an explicit Wave 0 dependency.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD     | TBD  | TBD  | STR-01..07, STR-12 | TBD | TBD | unit/integration | TBD | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/functions/_shared/stripe-client.test.ts` — unit tests for shared Stripe client construction (apiVersion pin, env-var required)
- [ ] `supabase/functions/stripe-webhook/index.test.ts` — signature verification + idempotency + graceful cancellation tests (STR-03, STR-04, STR-05, STR-07)
- [ ] `supabase/functions/stripe-webhook/price-resolver.test.ts` — priceId → {tier, interval} reverse map tests (STR-12)
- [ ] `supabase/functions/create-checkout-session/index.test.ts` — tier/interval allowlist + lazy customer creation path (STR-01, STR-06)
- [ ] `supabase/functions/create-stripe-portal/index.test.ts` — missing-customer 400 path (STR-06)
- [ ] `supabase/functions/_shared/test-helpers/stripe-signature.ts` — custom `signStripePayload` helper (generateTestHeaderString broken on Deno edge)
- [ ] Fixtures for `customer.subscription.{created,updated,deleted}` and `invoice.payment_failed` JSON payloads

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Stripe Dashboard webhook endpoint registered with correct secret | STR-02, STR-03 | Requires Stripe Dashboard access | Follow deploy runbook; confirm endpoint fires test event and returns 200 |
| Customer Portal default configuration saved in Stripe Dashboard | STR-06 | Portal session create fails with "No configuration provided" until saved | Deploy runbook step; verify via `stripe.billingPortal.sessions.create` test call |
| Four `STRIPE_PRICE_*` secrets set in staging + production | STR-12 | Supabase secrets are environment-scoped | `supabase secrets list` in each env confirms presence |
| Real end-to-end checkout with Stripe test card `4242 4242 4242 4242` | STR-01, STR-04 | Requires live Stripe test mode + frontend from Phase 08 | Deferred to Phase 08 integration test |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

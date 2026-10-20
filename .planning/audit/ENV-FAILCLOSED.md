# ENV-05 — Fail-Closed Secret Coverage Matrix

**Requirement:** ENV-05 (confirm fail-closed validation for critical/required secrets)
**Phase:** 7 — Environment Variable Audit & Organization, Plan 07-02
**Produced:** 2026-06-21
**Source HEAD:** branch `staging` (re-read every consumer at HEAD; line numbers re-confirmed via `rg`, not trusted from research)

> **NAMES-NOT-VALUES (T-3-07 / REPO-05 discipline).** This catalog is committed to a tracked repo. Per `02-SECRET-SCAN.md` / `ENV-INVENTORY.md` discipline it records **secret NAMES + consumer file:line + guard behavior + verdict ONLY** — never a key, token, JWT, price ID, signing secret, or connection string. The corrected secret-grep guard (no `-E`) was run against this file (see [Secret-grep guard](#secret-grep-guard-over-this-file) below) and returns **ZERO** matches.

---

## Scope

ENV-05 is **"confirm + surgical add," not a refactor** (07-CONTEXT D-08). The bar for ADDING a guard is **"a critical secret currently fails open."** This document is a source-cited coverage matrix that proves whether each of the 6 critical/required secrets fails closed or open at HEAD. Per D-08, a narrow `if (!x) throw/return` guard is added **ONLY IF** the operator surfaces a fail-open critical secret — and even then it (a) mirrors the existing fail-closed shapes (never a central helper — deferred), (b) re-runs `npm run verify:baseline`, and (c) runs a staging deploy-smoke OR is env-deferred via a RESIDUAL-REGISTER entry (the test project `cimjltzovkahkqecpwgi` is PAUSED).

The 6 named critical/required secrets (D-08): `APP_URL`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `INTERNAL_JOB_SECRET`.

**Definitions**
- **fail-closed** = when the secret is unset/missing, the code path refuses to proceed (throws / returns an error response / rejects the request). No privileged or external action runs without the secret.
- **fail-open** = when the secret is unset/missing, the code path silently proceeds (e.g., accepts an unsigned request, builds a permissive header, calls an external API with no key). **This is what ENV-05 looks for; none was found at HEAD.**

---

## Coverage Matrix (6 critical secrets)

| # | Secret | Consumer (file:line, re-confirmed at HEAD) | Current behavior when unset | Verdict |
|---|--------|--------------------------------------------|-----------------------------|---------|
| 1 | `APP_URL` | `supabase/functions/_shared/cors.ts:38-41` (`corsHeaders`, `type:'user'`) | `const rawAppUrl = Deno.env.get('APP_URL'); if (!rawAppUrl) throw new Error('APP_URL environment variable is not set — cannot build safe CORS headers')` — refuses to build CORS headers for browser-facing (`user`) functions; does NOT emit a permissive `Access-Control-Allow-Origin`. (`internal`/`webhook` types return `{}` by design, before the APP_URL read.) | **fail-closed** ✓ |
| 2 | `ANTHROPIC_API_KEY` | `supabase/functions/_shared/anthropic.ts:647-650` (non-stream `invokeAnthropicText`) **and** `:802-806` (stream generator) | non-stream: `const resolvedApiKey = params.apiKey ?? Deno.env.get('ANTHROPIC_API_KEY'); if (!resolvedApiKey) return { ok:false, status:500, error:'ANTHROPIC_API_KEY not configured' }`. stream: `if (!resolvedApiKey) { yield { type:'error', status:500, message:'ANTHROPIC_API_KEY not configured' }; return }`. Both paths short-circuit BEFORE any `fetch` to `api.anthropic.com` — no unauthenticated upstream call. (Phase 5 characterized this missing-key 500.) | **fail-closed** ✓ (both call paths) |
| 3 | `SUPABASE_SERVICE_ROLE_KEY` (and `SUPABASE_URL`) | `supabase/functions/_shared/supabase-client.ts:16-20` (`getServiceClient`), `:32-36` (`getSupabaseUrl`), `:43-47` (`getServiceRoleKey`) | `getServiceClient`: reads both; `if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured')`. `getSupabaseUrl`: `if (!url) throw new Error('SUPABASE_URL not configured')`. `getServiceRoleKey`: `if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')`. No service client is constructed and no service-role-authorized fetch is issued without the key. | **fail-closed** ✓ |
| 4 | `STRIPE_SECRET_KEY` | `supabase/functions/_shared/stripe-client.ts:23-24` (`getStripeClient`) | `const key = Deno.env.get('STRIPE_SECRET_KEY'); if (!key) throw new Error('STRIPE_SECRET_KEY not configured')` — no Stripe SDK client is instantiated without the secret key; every Stripe call routes through this single accessor. | **fail-closed** ✓ |
| 5 | `STRIPE_WEBHOOK_SECRET` | `supabase/functions/stripe-webhook-handler/index.ts:114,120-123` | `const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET"); … if (!webhookSecret) { log.warn("signature-verify-failed", { reason: "secret-missing" }); return jsonResponse({ error: "invalid_signature" }, 401) }` — rejects the webhook with 401 when the signing secret is unset; the event is never `constructEventAsync`-verified or processed. (Signature verification is SDK-only — never hand-rolled HMAC.) | **fail-closed** ✓ (rejects unsigned/unverifiable webhook) |
| 6 | `INTERNAL_JOB_SECRET` | `supabase/functions/_shared/auth.ts:141-145` (internal-auth path) | `const expectedSecret = Deno.env.get('INTERNAL_JOB_SECRET'); if (!expectedSecret) { log.error('auth-failure', { reason: 'secret-not-configured', type: 'internal' }); throw unauthorizedResponse() }` — throws a 401 (`unauthorizedResponse`) BEFORE any `timingSafeEqual` comparison; an internal-secret request cannot authenticate when the expected secret is unset. | **fail-closed** ✓ |

**All 6 critical/required secrets fail closed at HEAD. No critical secret fails open.**

---

## Documentation-only note: `RESEND_API_KEY` (not in the D-08 critical set)

`RESEND_API_KEY` is marked required-for-8-email-functions in `ENV-INVENTORY.md` but was **not** in D-08's named critical-secret set. A missing email key is a **degraded-email risk class**, not a security-critical fail-open (no privilege bypass, no unsigned-request acceptance, no unauthenticated external mutation). For completeness, its consumers also fail closed when unset:

- `supabase/functions/notify-admin-activity/index.ts:70-71` — `if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')`.
- `supabase/functions/notify-upgrade-approved/index.ts:33-34`, `notify-upgrade-request/index.ts:53-54`, `send-feature-email/index.ts:168-169`, `send-notification-email/index.ts:174,191` — guard the key before sending; no email is dispatched without it.

**Verdict (RESEND_API_KEY):** fail-closed (degrades email, not security). **Documentation-only** — not part of the ENV-05 critical disposition unless the operator elects to treat it in-scope.

---

## Verdict & D-08 disposition (recommendation)

- **No critical secret fails open at HEAD.** Each of the 6 named secrets has an explicit `if (!x) throw/return` guard, re-confirmed by reading the consumer at HEAD (line numbers verified via `rg`, see citations above).
- Under D-08 the surgical-add bar — **"a critical secret currently fails open"** — is **NOT met by code inspection**.
- **Recommended disposition: "add nothing."** ENV-05 closes on this coverage matrix with **zero `supabase/functions` diff**.
- This is an **operator-gated decision** (`autonomous:false`). The operator may either APPROVE "add nothing," or SURFACE a critical secret that fails OPEN (silently proceeds when unset) not visible in these static reads, or elect to treat a non-critical key (e.g. `RESEND_API_KEY`) as in-scope. IF a fail-open is surfaced: a narrow additive `if (!x) throw/return` guard mirroring the patterns above is added, `verify:baseline` re-run, and a staging deploy-smoke run OR env-deferred via RESIDUAL-REGISTER (test project paused).

---

## Add-only template (used ONLY if the operator surfaces a fail-open)

If — and only if — a fail-open critical secret is surfaced at the checkpoint, the guard ADDED must mirror these existing fail-closed shapes (never a central `assertRequiredEnv()` helper — deferred per 07-CONTEXT `<deferred>`):

```ts
// throw form (cors.ts / supabase-client.ts / stripe-client.ts / auth.ts shape)
const x = Deno.env.get('SECRET_NAME');
if (!x) throw new Error('SECRET_NAME not configured');

// response form (anthropic.ts / stripe-webhook-handler shape — for handlers that return Response)
if (!x) return jsonResponse({ error: 'invalid_signature' }, 401); // or { ok:false, status:500, ... }
```

Any such edge change triggers the **edge-change deploy-smoke discipline** (offline `verify:baseline` runs deno `--no-check` and does not exercise runtime). Smoke on staging, or env-defer via a RESIDUAL-REGISTER entry while `cimjltzovkahkqecpwgi` is PAUSED (Phase-6 realtime-smoke precedent, DI-06-05-01).

---

## Verification

### `fail-closed` verdict count

```bash
rg -c "fail-closed" .planning/audit/ENV-FAILCLOSED.md   # >= 6 (one per critical secret)
```

### Each consumer file cited

```bash
rg -c "cors\.ts|anthropic\.ts|supabase-client\.ts|stripe-client\.ts|stripe-webhook-handler|auth\.ts" .planning/audit/ENV-FAILCLOSED.md  # >= 6
```

### Zero code touched in Task 1

```bash
git diff --stat -- supabase/functions src   # EMPTY (this task writes only the audit doc)
```

### Secret-grep guard over THIS file

Corrected guard (NO `-E` — ripgrep treats the pattern as a regex by default; `-E` would consume the next arg as an encoding value):

```bash
rg -n "sk_live_[A-Za-z0-9]{20}|sk_test_[A-Za-z0-9]{20}|pk_live_[A-Za-z0-9]{20}|service_role[^a-zA-Z0-9]{0,40}eyJ|eyJ[A-Za-z0-9_-]{30,}|price_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----" .planning/audit/ENV-FAILCLOSED.md
# Expected: NO match. This catalog records NAMES + consumers + behavior + verdict ONLY.
```

---

## Cross-References

- **[`ENV-INVENTORY.md`](./ENV-INVENTORY.md)** — ENV-01 (03-04) authoritative env surface; required/optional classification, the names-not-values discipline this file inherits.
- **[`RESIDUAL-REGISTER.md`](./RESIDUAL-REGISTER.md)** — the append-only deferred/accepted-risk register (central env-guard defer D-08; any env-deferred deploy-smoke lands here).
- **`.planning/phases/07-environment-variable-audit-organization/07-CONTEXT.md`** §"Fail-closed validation (ENV-05)" — D-08 (confirm + surgical add only where a critical secret fails open; no central helper).
- **`.planning/phases/07-environment-variable-audit-organization/07-RESEARCH.md`** §"ENV-05 Audit" — the verified matrix this file re-confirms (research found 6/6 fail-closed; "add nothing" recommended, operator-confirm).
- **`.planning/phases/07-environment-variable-audit-organization/07-PATTERNS.md`** §"Fail-Closed Secret Guard" — the verbatim guard excerpts + the add-only template.
- **`.planning/phases/02-repository-hygiene-state-reconciliation/02-SECRET-SCAN.md`** — REPO-05 names-not-values discipline (T-3-07 mitigation).

*This file records variable names, consumer file:line, guard behavior, and verdicts only — no secret value is pasted anywhere in it.*

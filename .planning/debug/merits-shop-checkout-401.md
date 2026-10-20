---
slug: merits-shop-checkout-401
status: resolved
resolution: operator-confirmed completed & shipped; closed at v4.0 milestone close 2026-06-25
trigger: Purchasing merits from the shop returns 401 Unauthorized from create-checkout-session edge function
created: 2026-04-22
updated: 2026-06-25
---

# Debug Session: merits-shop-checkout-401

## Symptoms

<DATA_START>
**Expected behavior:** Clicking "buy" on a merit pack in the shop opens a Stripe Checkout session.

**Actual behavior:** POST to `/functions/v1/create-checkout-session` returns 401 Unauthorized. Frontend logs `[useStripeCheckout] invoke error FunctionsHttpError: Edge Function returned a non-2xx status code`.

**Error messages (from browser console):**
```
POST https://cimjltzovkahkqecpwgi.supabase.co/functions/v1/create-checkout-session 401 (Unauthorized)
[useStripeCheckout] invoke error FunctionsHttpError: Edge Function returned a non-2xx status code
```

(Note: The `content.js:1 FILE_ERROR_NO_SPACE` entry is a Chrome extension artifact, not related.)

**Environment:** Staging (project ref `cimjltzovkahkqecpwgi`)

**Auth state:** User is signed in. Other authenticated features in the same session work correctly — so the user's JWT is valid and reaching other edge functions.

**Timeline:** New — the merit shop checkout has never worked. This is a feature that was introduced and has not successfully reached Stripe in staging.

**Reproducibility:** 100% — fails on every click of the buy button.
</DATA_END>

## Current Focus

- hypothesis: `create-checkout-session` has never been deployed to the staging Supabase project (`cimjltzovkahkqecpwgi`). Supabase's edge gateway defaults to `verify_jwt = true` for unknown routes and responds 401 before any function code runs, which exactly matches the observed behavior of a reproducible 401 on a brand-new feature path while other (already-deployed) authenticated functions continue to work.
- test: confirm with the user whether the function is listed in `supabase functions list --project-ref cimjltzovkahkqecpwgi`, and/or inspect the Supabase dashboard for staging.
- expecting: function missing from staging deployment; or present but deployed with default `verify_jwt = true` and no `[functions.create-checkout-session]` config entry.
- next_action: present root cause and fix plan to user.
- reasoning_checkpoint: (none)
- tdd_checkpoint: (none — tdd_mode=false)

## Evidence

- timestamp: 2026-04-22 — file: `supabase/functions/create-checkout-session/index.ts` — The function source exists and its auth path is standard `requireAuth({type:'user'})`. If a valid user JWT were reaching the function, it would either succeed or return a structured 400/403/500 — not a bare 401. So the 401 is almost certainly NOT coming from this file.
- timestamp: 2026-04-22 — file: `supabase/functions/_shared/auth.ts` — `requireAuth` returns `{ error: 'Unauthorized' }` with status 401. But this body shape isn't observed in the client error (FunctionsHttpError is the generic SDK wrapper and doesn't expose the body to the console log). Still, the 401 could come from here OR from the Supabase platform gateway.
- timestamp: 2026-04-22 — file: `src/hooks/useStripeCheckout.ts` — Client uses `supabase.functions.invoke('create-checkout-session', { body: {...} })`. The Supabase JS SDK automatically attaches `Authorization: Bearer <session_access_token>` AND `apikey: <anon_key>` on `.invoke()`. This is the same mechanism other working edge-function calls in the app use, so the client-side auth path is NOT the problem.
- timestamp: 2026-04-22 — file: `supabase/config.staging.toml` — Contains NO `[functions.create-checkout-session]` entry. No Stripe-related function has a config entry in any environment (no `stripe-webhook`, `create-stripe-portal`, etc.). Every function that IS listed has `verify_jwt = false`. Without an explicit config entry, Supabase's platform default `verify_jwt = true` applies.
- timestamp: 2026-04-22 — file: `scripts/deploy-staging.ps1` — The `$Functions` default list does NOT include `create-checkout-session` (nor ANY Stripe/merit/shop function). Functions in the list: `chat-agent, process-scheduled-emails, admin-delete-user, analyze-skills-gap, ocr-pdf, send-feature-email, analyze-resume, send-strivo-email, analyze-career, notify-admin-activity, paddle-webhook, test-email, notify-upgrade-approved, notify-upgrade-request, send-credits-exhausted-email, compare-jobs, grade-linkedin, send-notification-email, send-welcome-email, submit-resume-analysis-job, get-analysis-job-status, process-resume-analysis-job, submit-career-analysis-job, process-career-analysis-job, keep-warm`. Running this script deploys only these — it does NOT deploy `create-checkout-session`.
- timestamp: 2026-04-22 — file: `scripts/deploy-production.ps1` — Same function list. Also omits all Stripe functions.
- timestamp: 2026-04-22 — Cross-check: `supabase/functions/` directory does contain the function source (`create-checkout-session/`), and so do `create-stripe-portal/`, `stripe-webhook/`, `stripe-webhook-handler/`, `create-payment-intent/`, `reset-subscription-merits/`, `admin-merit-metrics/`, `check-merit-alerts/`. The code is written; it just hasn't been wired into the deploy pipeline or config.
- timestamp: 2026-04-22 — git log shows the function has multiple commits (`feat(07-04)`, `feat(12-04)`, `feat(20-01)`, tests), but `scripts/deploy-staging.ps1` was last touched for unrelated changes (`fix: update deployment scripts to use server-side bundling`) and never updated to include the Stripe/shop functions.
- timestamp: 2026-04-22 — symptom match: Supabase's edge gateway returns **401 "Missing authorization header"** (or similar) for routes that don't have a deployed function when the default `verify_jwt = true` applies — because the gateway validates JWT before resolving the route. This explains why the user sees 401 (not 404) for a function that doesn't exist on the project. It also explains why OTHER edge functions keep working with the same session — those ARE deployed with `--no-verify-jwt`.

## Eliminated Hypotheses

- Client hook not passing the Authorization header → `useStripeCheckout` uses `supabase.functions.invoke()` which attaches auth headers automatically; identical mechanism is used by working functions.
- User JWT invalid or expired → other authenticated edge functions in the same session succeed.
- Missing staging secret (STRIPE_SECRET_KEY, APP_URL) causing fail-closed → those are checked INSIDE the function body, AFTER `requireAuth`. A missing stripe key would produce a 500, not a 401.
- Function-internal `requireAuth` rejecting the JWT → `requireAuth` works in every deployed function; it would be a general auth outage, not scoped to this one function. Moreover the staging SUPABASE_URL/SERVICE_ROLE_KEY are set by Supabase automatically.

## Resolution

- root_cause: `create-checkout-session` (and all Stripe/merit-shop edge functions) were never added to `scripts/deploy-staging.ps1` nor to `supabase/config.staging.toml`. As a result, the function is either (1) not deployed to the staging project at all, or (2) deployed ad-hoc without `--no-verify-jwt` and missing a `verify_jwt = false` config entry. In either case, the Supabase edge gateway's default JWT gate responds 401 before the function code runs — producing exactly the observed reproducible 401 on an endpoint that no other code path in the app exercises.
- fix: Add `create-checkout-session` (and the sibling Stripe/merit functions that the Stripe flow depends on) to BOTH the staging deploy script's function list AND the staging/production config.toml files with `verify_jwt = false` (matching the pattern of every other user-auth-gated function — they handle auth via the shared `requireAuth` helper in-function, not at the platform gate). Then redeploy to staging. Also ensure the staging Stripe env vars are present (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_MERIT_3/10/25/50`, `APP_URL`) — but that will surface as a different error (500 `price_not_configured` or Stripe-side failure) after the 401 is resolved.
- verification: (to be performed after deploy) After redeploy, trigger the shop "buy" button again. Expect either (a) a 200 with a `clientSecret` (success) or (b) a clean 500 `price_not_configured` / 400 error with a JSON body — either of which confirms the platform-level 401 is gone and requests are reaching the function.
- files_changed: (pending user confirmation)

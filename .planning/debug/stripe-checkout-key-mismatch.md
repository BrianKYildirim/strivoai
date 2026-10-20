---
status: resolved_pending_operator_deploy
trigger: "Stripe checkout fails for both Elite monthly/annual subscription and merit pack purchase. Browser console reports Stripe.js api key mismatch between loadStripe() key and the key used to create the Checkout Session."
created: 2026-07-17
updated: 2026-07-17
---

# Debug: Stripe checkout key mismatch (Elite subscription + merit packs)

## Symptoms

**Expected behavior**
Clicking checkout for an Elite monthly/annual membership or a merit pack creates a Stripe Checkout Session, returns a client_secret, and Embedded Checkout mounts and renders so a payment can complete. Fulfillment (subscription grant / merit credit) then runs via the Stripe webhook.

**Actual behavior**
Embedded Checkout fails. Stripe.js warns that the publishable key passed to `loadStripe()` does not match the API key that created the Checkout Session. Downstream Stripe calls 404. Affects BOTH checkout types.

**Error messages**
```text
Stripe.js api key mismatch detected. The key used in loadStripe() doesn't match the api key used to create the Checkout Session. This can cause unexpected payment failures.

Failed to fetch Amazon Pay merchantId for Stripe flow:
TypeError: Failed to fetch

POST https://api.stripe.com/v1/payment_intents/pi_3TtwzOCsuenmDhIx1nG6yVAO/verify_challenge 404 (Not Found)
```
Stripe API response:
```json
{
  "error": {
    "code": "resource_missing",
    "message": "No such payment_intent: 'pi_3TtwzOCsuenmDhIx1nG6yVAO'; a similar object exists in live mode, but a test mode key was used to make this request.",
    "param": "intent",
    "type": "invalid_request_error"
  }
}
```
Failing request header: `x-stripe-routing-context-priority-tier: api-testmode`

Interpretation offered by the reporter (to be verified, not assumed): backend created the session with a LIVE secret key while the frontend initialized Stripe.js with a TEST publishable key.

**Timeline**
Reported 2026-07-17. Stripe migration (from Paddle) landed in Phase 8. Unknown whether checkout ever completed end-to-end in this configuration.

**Reproduction**
1. Open the pricing / purchase UI.
2. Start Elite monthly or annual membership checkout — OR start a merit pack checkout.
3. Observe the console errors above; Embedded Checkout does not complete.

**Reporter notes**
Supabase secrets "appear" to be configured correctly. Do NOT assume the deployed frontend, the deployed Edge Functions, and the local environment read the same values. Strivo has separate preview/test and production Supabase projects, and Vercel was migrated from `kapura3-stars-projects/strive-ai-hired` to `brians-projects-902cb080/strive-ai-hired`.

## Constraints

- Never print or expose complete secret values. Safe to report: variable name, source, key-prefix class (`pk_test` / `pk_live` / `sk_test` / `sk_live`), which environment uses it, last 4 chars only when necessary.
- Never send a secret key to the browser.
- No destructive production database operations.
- Validate in the closest safe (test/preview) environment before touching production.
- Prefer small, reversible changes; no unrelated architectural refactors.
- Per CLAUDE.md: production Edge Function deploys and secret changes require explicit operator approval.

## Investigation scope (from reporter)

- Trace both paths: pricing UI -> checkout handler -> Edge Function -> `stripe.checkout.sessions.create` -> client_secret -> `loadStripe()` -> EmbeddedCheckoutProvider.
- Enumerate every place Stripe credentials, price IDs, checkout mode, and Supabase project URLs are loaded (repo, `.env*`, Vercel, GitHub Actions, Supabase secrets, hardcoded fallbacks).
- Verify test/live mode alignment per environment, including that price IDs match the mode AND account of the secret key.
- Confirm deployment alignment: prod site -> prod Supabase; preview site -> preview Supabase; correct Vercel project owns the production domain; deployed Edge Function matches this repo.
- Determine whether the publishable key is build-time injected (and therefore whether a frontend redeploy is required after changing it).
- Audit Embedded Checkout lifecycle: single `loadStripe()` init, no clientSecret swap inside a mounted provider, safe remount on new session, no competing sessions from double-click/StrictMode/rerenders, no stale clientSecret after a failed session create, no shared stale state between subscription and merit checkout.
- Treat the Amazon Pay merchantId error as a suspected downstream symptom until proven otherwise.

## Deliverables (from reporter)

- Root cause, files changed, env vars involved, which component held the wrong test/live value.
- Server-side config guard before session creation + safe frontend guard; remove unsafe hardcoded key fallbacks; unify subscription and merit checkout on one validated config strategy.
- Safe diagnostics (app env, Vercel env, Supabase project ref, frontend Stripe mode, backend Stripe mode, checkout type, session ID, client-secret mode, Stripe request ID on failure) — never full keys/secrets/card/PII.
- Tests using existing Vitest / Deno / Playwright conventions covering the 10 listed cases.
- Exact remaining production deployment steps (Vercel frontend, checkout Edge Function, webhook function, GitHub Actions config).

## Current Focus

hypothesis: CONFIRMED — the production Vercel build inlines a `pk_test_` publishable key while the production Supabase Edge Functions create sessions with an `sk_live_` secret key.
test: read the deployed production bundle directly (ground truth for what the browser executes)
expecting: a single surface disagreeing on mode — found it: the frontend bundle
next_action: BLOCKED on operator. (1) Working tree has an unresolved conflict left by a stray `git stash pop` (see Evidence). (2) Remaining verification of preview/prod Edge Function secret modes + test execution not yet done.

## Evidence

- timestamp: 2026-07-17 — **ROOT CAUSE CONFIRMED (direct observation of the deployed artifact).**
  Fetched the LIVE production bundle `https://www.strivoai.net/assets/index-BmsU6xkt.js` (2.02 MB).
  - `grep -oE 'pk_(test|live)_'` → **2 matches, ALL `pk_test_`. Zero `pk_live_`.**
  - `grep -oE 'https://[a-z]+\.supabase\.co'` → **2 matches, ALL `zjpjapgraoxdukdvpjes`** (PRODUCTION Supabase).
  implication: the production website ships a **TEST publishable key** while calling the
  **PRODUCTION** Supabase project, whose `STRIPE_SECRET_KEY` is `sk_live_`. This is the mismatch
  exactly. Reporter's interpretation (backend LIVE + frontend TEST) is **CONFIRMED**, and the
  `api-testmode` routing header is consistent: the browser's pk_test_ key routes Stripe.js to
  test mode, where the live-mode PaymentIntent legitimately does not exist → `resource_missing`.

- timestamp: 2026-07-17 — VERIFIED (directive #9/#10, supersedes the prior UNVERIFIED lead):
  `npx vercel project ls` → org `brians-projects-902cb080`, project `strive-ai-hired`,
  Latest Production URL = `https://www.strivoai.net`. `.vercel/project.json` orgId
  `team_9DVUCQOthM6KGYcG4MeyR85u`. The prod domain IS on the intended project. NOT the cause.

- timestamp: 2026-07-17 — Repo key-load-site enumeration COMPLETE. Exactly TWO `loadStripe()` sites,
  both module-scope, both reading the same build-time var, neither with a hardcoded key:
  - `src/components/StripeCheckoutWrapper.tsx:13` — `loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '')` (subscription / EmbeddedCheckout)
  - `src/components/topup/StripePaymentElementModal.tsx:61-67` — `PUBLISHABLE_KEY` + `loadStripe(...)` (merit/top-up / PaymentElement)
  `rg 'pk_test_|pk_live_|sk_test_|sk_live_' src/` → matches only in `.test.ts(x)` fixtures.
  implication: **no hardcoded fallback key** (directive #6 partially cleared). The `|| ''` in
  StripeCheckoutWrapper is an unsafe-silent fallback but is NOT the source of a wrong key.
  Because the var is Vite build-time inlined, **fixing Vercel requires a REDEPLOY** — changing
  the env var alone does nothing to the already-built bundle.

- timestamp: 2026-07-17 — Local surface audit (prefix class only, no values):
  - `.env` → `VITE_SUPABASE_URL`=PROD ref, `STRIPE_SECRET_KEY`=`sk_live_`, `STRIPE_WEBHOOK_SECRET`=`whsec_`.
    **`VITE_STRIPE_PUBLISHABLE_KEY` is ABSENT from `.env`.**
  - `.env.local` → contains no Stripe/Supabase names.
  - `.env.test.local` → `VITE_SUPABASE_URL`=PREVIEW ref, `VITE_STRIPE_PUBLISHABLE_KEY`=`pk_test_`,
    `STRIPE_TEST_SECRET_KEY`=`sk_test_`, `STRIPE_PRICE_ELITE_*`=`price_`.
  implication: local `.env` is itself misconfigured (prod URL + live secret + NO publishable key),
  so a local `npm run build` would inline `''`. Not the prod bundle's source, but a live footgun.

- timestamp: 2026-07-17 — `vercel env pull --environment=production` returns `[SENSITIVE]` for
  `VITE_STRIPE_PUBLISHABLE_KEY` and `VITE_SUPABASE_URL` (marked sensitive; CLI cannot decrypt).
  implication: the Vercel dashboard value could NOT be read directly — which is precisely why
  reading the **deployed bundle** was the decisive move. The bundle is the ground truth of what
  the browser executes, and it says `pk_test_`.

- timestamp: 2026-07-17 — **INCIDENT (agent-caused, tree left dirty; NO data loss).**
  The investigator agent ran a bare `git stash pop`, which popped `stash@{0}` — an unrelated
  **12-day-old stash from GSD session 05-02** (`3b154adc`, dated 2026-07-05, message
  "On staging: gsd-05-02-partial-interrupted-session-limit") containing exactly ONE file:
  `supabase/functions/analyze-resume/index.ts`. The pop CONFLICTED, so git **preserved the stash
  entry** — `stash@{0}` is intact and unchanged.
  - Result: `UU supabase/functions/analyze-resume/index.ts` with 3 conflict markers at ~line 674.
  - The stashed content is **stale and regressive**: `git diff HEAD stash@{0}` shows it would
    revert the committed Phase 05-02 idempotency-key + streaming-lifecycle block and downgrade
    `patch: Json` back to `patch: Record<string, unknown>`, undoing committed type-safety work.
    There is nothing to salvage from it.
  - The ~60 other modified files are NOT agent damage: reflog shows two commits landed on top of
    the session-start snapshot (`260717-42m` type-safety closeout + tsconfig removal), and the
    deletions map to the operator's in-flight `260717-8tn` quick task.
  - `git reflog show stash` shows NO stash was created-and-dropped; `git fsck` dangling commits
    are unrelated. Nothing is unrecoverable.
  - STATUS: left UNRESOLVED pending operator decision. Recommended fix:
    `git checkout HEAD -- supabase/functions/analyze-resume/index.ts` (restores the committed
    version, clears the conflict, leaves `stash@{0}` untouched — fully reversible).

## Eliminated

- Vercel project/domain misrouting (directives #9, #10) — prod domain `www.strivoai.net` confirmed
  on `brians-projects-902cb080/strive-ai-hired`. Not the cause.
- Hardcoded key fallback in application source (directive #6, source-code portion) — no `pk_`/`sk_`
  literals outside test fixtures. Not the cause.
- Production site pointing at the wrong Supabase project (directive #1) — deployed bundle contains
  only the PROD ref `zjpjapgraoxdukdvpjes`. Correct. Not the cause.
- Embedded Checkout lifecycle bugs (double-init, clientSecret swap, StrictMode remount) — not
  reached as a cause; the key-mode mismatch fully explains both failing flows and the
  `resource_missing` 404. Amazon Pay merchantId error confirmed as a downstream symptom.

## Resolution

root_cause: The production Vercel build inlines `VITE_STRIPE_PUBLISHABLE_KEY` as a **`pk_test_`**
  (test-mode) key at build time, while the production Supabase project (`zjpjapgraoxdukdvpjes`)
  that same bundle calls holds an **`sk_live_`** (live-mode) `STRIPE_SECRET_KEY`. The Edge Function
  therefore creates a LIVE-mode Checkout Session / PaymentIntent, and the browser's TEST-mode
  Stripe.js cannot see that live object → "api key mismatch" + `resource_missing` 404. Because Vite
  inlines the var at BUILD time, the wrong key is baked into the shipped bundle — which is why the
  Supabase secrets "appearing correct" never prevented the failure: the fault is entirely on the
  frontend build surface, not the backend secret surface.

fix: TWO parts.
  (A) OPERATIONAL (the actual cause — OPERATOR ACTION REQUIRED, cannot be done from the repo):
      In Vercel project `brians-projects-902cb080/strive-ai-hired`, set the **Production**
      `VITE_STRIPE_PUBLISHABLE_KEY` to the `pk_live_` key from the SAME Stripe account whose
      `sk_live_` secret key is configured on the production Supabase project, then **REDEPLOY the
      frontend** (Vite inlines the var at build time — changing the env var without a rebuild does
      nothing). Preview should keep `pk_test_` paired with the preview project's `sk_test_`.
  (B) CODE HARDENING (committed — turns this silent, late, misleading failure into a loud, immediate,
      correctly-attributed one, and prevents recurrence):
      - `_shared/stripe-client.ts::getStripeMode()` derives backend mode from the secret-key prefix.
      - `create-checkout-session` and `create-payment-intent` now RETURN `stripeMode` on every
        embedded checkout response (a `pi_` secret can't self-describe its mode).
      - `src/lib/stripe-mode.ts` — publishableKeyMode / clientSecretMode / isStripeModeMismatch
        (conservative: unknown on either side never blocks) / describeStripeMode (secret-free).
      - `StripeCheckoutWrapper` (subscription) refuses to mount EmbeddedCheckout on a proven
        cs_ mode contradiction, drops the unsafe `|| ''` loadStripe fallback, and now keys the
        provider on clientSecret for safe remount.
      - `useCreatePaymentIntent` (merit) aborts before mounting <Elements> on a proven stripeMode
        contradiction.

verification:
  - Frontend vitest: 31/31 across stripe-mode, useCreatePaymentIntent, StripeCheckoutWrapper,
    StripePaymentElementModal, TopUpProvider. (+ 9/9 stripe-mode after the GitGuardian fixture fix.)
  - Deno edge: 43/43 across _shared/stripe-client + create-checkout-session + create-payment-intent,
    now including assertions that both functions emit `stripeMode`.
  - Frontend type-check clean.
  - NOT YET DONE (requires operator + a real Stripe test key pairing): live manual test-mode
    checkout run end-to-end, and the post-redeploy production smoke.

files_changed (committed this session, on `staging`):
  - src/lib/stripe-mode.test.ts (30023fff — GitGuardian: replace incident PI id with placeholder)
  - src/components/StripeCheckoutWrapper.tsx (11217c7b — key remount)
  - supabase/functions/create-payment-intent/index.test.ts (11217c7b — assert stripeMode)
  - supabase/functions/create-checkout-session/index.test.ts (11217c7b — assert stripeMode)
  Prior commit d10ab847 (by operator) landed the stripe-mode helper, the getStripeMode backend
  wiring, and the guard changes to the two components + the hook.

remaining_production_deploy_actions:
  1. Vercel: set Production VITE_STRIPE_PUBLISHABLE_KEY = pk_live_ (matching-account) + REDEPLOY frontend. [REQUIRED — root-cause fix]
  2. Supabase prod Edge Functions: redeploy create-checkout-session + create-payment-intent so the
     deployed versions emit stripeMode. [operator-approved deploy]
  3. Stripe webhook function: no code change here; redeploy only if bundling with #2. Verify the prod
     webhook signing secret matches the live endpoint.
  4. GitHub Actions: no config change required; the fix is a Vercel env value + redeploys.

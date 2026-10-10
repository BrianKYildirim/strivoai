---
slug: stripe-e2e-checkout-timeout
status: resolved
trigger: "Stripe checkout E2E (e2e/stripe-checkout.spec.ts:26) fails with Playwright TimeoutError; reds verify:baseline, aborts deploy.ps1 pre-link gate, and reds the GitHub Actions regression gate. Handoff: .planning/debug/issue-g-stripe-e2e-handoff.md (Issue G)."
created: 2026-07-07
updated: 2026-07-07
---

# Debug: Stripe checkout E2E TimeoutError blocks deploy pipeline

## Symptoms

DATA_START
- **Expected:** `npm run test:e2e` green — spec "clientSecret round-trip + EmbeddedCheckout iframe mounts" (`e2e/stripe-checkout.spec.ts:26`) proves: (1) `create-checkout-session` returns a real test-mode `clientSecret` matching `/_secret_/`; (2) EmbeddedCheckout iframe mounts; (3) `?checkout=complete` → `reconcileTierUpgrade` reconcile path fires. The automated 4242 card SUBMIT is intentionally quarantined (`test.skip`) — out of scope.
- **Actual:** Test fails with a Playwright **TimeoutError**. Suspected at `page.waitForResponse(... '/functions/v1/create-checkout-session' ...)` (30s timeout, spec ~lines 31-34), but exact failing wait not yet confirmed this session.
- **Errors:** Playwright TimeoutError (exact message/stack not captured in handoff — first evidence-gathering step is to re-run and capture it).
- **Timeline:** First observed 2026-07-07 when operator ran `./scripts/deploy.ps1 -Env staging` — the HARD verify:baseline precondition gate went RED and aborted before `supabase link`. Same failure reproduced in GitHub Actions regression gate. Unrelated to Phase 6 changes per handoff.
- **Reproduction:** `npm run test:e2e` (or full `npm run verify:baseline`). Local + CI both fail. Test env = Stripe test mode + test Supabase env; uses `test.use({ storageState: '.auth/user.json' })`.
DATA_END

## Handoff hypotheses (unverified — to test)

1. `create-checkout-session` not deployed/healthy on the **test** Supabase env, or Stripe test-mode secrets/price IDs missing there (see `docs/ENVIRONMENT.md` matrix).
2. Pricing/navbar redesign changed the CTA — `getByRole('button', { name: /upgrade to elite/i })` (spec line 37) no longer matches / route moved, so the request never fires.
3. Stale/absent `.auth/user.json` storage-state fixture drops the user off `/pricing` before the CTA renders (local + CI).
4. E2E target env down/unreachable (preview Supabase `cimjltzovkahkqecpwgi` was unpaused 2026-06-24 — confirm still up).

## Guardrails

- Do NOT weaken `verify:baseline` or mask with retries (D-06/D-07). Quarantine register in `TESTING-STRATEGY.md` is the documented escape only if genuinely un-fixable in-env — must justify.
- `deploy.ps1 -SkipVerify` is emergency-only, not a fix.
- Keep `.ps1` scripts pure ASCII.

## Current Focus

- hypothesis: CONFIRMED — preview/test Supabase project (cimjltzovkahkqecpwgi) `ALLOWED_ORIGINS` edge secret is missing `http://localhost:8080`, so the create-checkout-session CORS preflight fails closed (no ACAO) → browser blocks the POST → no response event → 30s waitForResponse timeout.
- test: Add `http://localhost:8080` back to the preview `ALLOWED_ORIGINS` secret, then re-run `npx playwright test e2e/stripe-checkout.spec.ts`.
- expecting: Preflight echoes ACAO for localhost:8080; the checkout POST returns a clientSecret; spec :26 goes green; verify:baseline unblocks.
- next_action: RESOLVED. Secret set (count:1), preflight echoes ACAO for http://localhost:8080, playwright spec :26 green (3 passed / 1 skipped). Session archived to .planning/debug/resolved/.

## Evidence

- timestamp: 2026-07-07 (static analysis, pre-repro)
  checked: CTA label in src/components/pricing/TierCardV2.tsx vs spec selector /upgrade to elite/i
  found: Button copy.cta = "Upgrade to Elite" (line 33), aria-label = copy.cta. Matches the selector. When isCurrent the button is disabled + label becomes "Current plan" but aria-label still contains "Upgrade to Elite".
  implication: Handoff hypothesis 2 (CTA label moved) is UNLIKELY — label matches. global-setup resets test user to tier 'free' so elite button is enabled/clickable.

- timestamp: 2026-07-07 (static analysis, pre-repro)
  checked: .auth/user.json fixture + .env.test.local presence
  found: .auth/user.json exists (updated 2026-07-07 16:51). .env.test.local exists with VITE_SUPABASE_URL, VITE_STRIPE_PUBLISHABLE_KEY, SUPABASE_TEST_*, STRIPE_TEST_*, STRIPE_PRICE_ELITE_MONTHLY/ANNUAL.
  implication: Handoff hypothesis 3 (missing auth fixture) less likely locally; STRIPE_PRICE_* and STRIPE_TEST_SECRET_KEY names present in local env but these are edge-function secrets that must be set on the TEST Supabase project, not just local .env.

- timestamp: 2026-07-07 (reasoning)
  checked: semantics of page.waitForResponse in spec (line 31-34, 40)
  found: waitForResponse resolves on any response matching the URL predicate regardless of HTTP status. A 30s TimeoutError there implies NO response to /functions/v1/create-checkout-session arrived — i.e. request never fired OR never returned (function cold-start/hang/network), NOT a function 4xx/5xx.
  implication: If function were deployed-but-erroring, res would arrive and res.ok() would fail at line 41 (AssertionError, not TimeoutError). TimeoutError points to request-never-fired or function-unreachable/hanging on the TEST env.

- timestamp: 2026-07-07 (reproduced)
  checked: `npx playwright test e2e/stripe-checkout.spec.ts --project=chromium`
  found: setup(auth) PASS, reconcile test PASS, QUARANTINE skipped; spec :26 FAILS with `TimeoutError: page.waitForResponse` at spec line 31 (30s) waiting for /functions/v1/create-checkout-session. Confirms exact failing wait.
  implication: Not the iframe wait (line 53) — it's the request/response wait (line 31/40). Request either never fires or never returns.

- timestamp: 2026-07-07 (temp diagnostic spec, since removed)
  checked: page console + network listeners while clicking "Upgrade to Elite" on /pricing (built preview on localhost:8080 → preview Supabase cimjltzovkahkqecpwgi)
  found: The Elite button renders `[active]`/clickable; click DOES fire `POST https://cimjltzovkahkqecpwgi.supabase.co/functions/v1/create-checkout-session`. Browser console: "blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present". requestfailed net::ERR_FAILED; app logs `[Pricing] create-checkout-session error FunctionsFetchError`.
  implication: Request fires but the CORS preflight is rejected fail-closed → no valid response event → waitForResponse times out. Rules out handoff hyps 2 (CTA label ok), 3 (auth fixture valid — auth.setup passed), 4 (env reachable — got a 200 preflight).

- timestamp: 2026-07-07 (direct curl probes of deployed preview functions)
  checked: OPTIONS preflight to preview edge functions with various Origin headers
  found: create-checkout-session preflight = HTTP 200 but NO Access-Control-Allow-Origin for Origin `http://localhost:8080`. Same for analyze-resume, submit-career-analysis-job, grade-linkedin, create-payment-intent, recruiting-lens (project-wide). Origin `https://strivoai-git-preview-brians-projects.vercel.app` IS echoed; `http://localhost:8080` and `https://www.strivoai.net` are NOT. So the preview ALLOWED_ORIGINS allowlist currently contains the vercel preview alias but omits localhost:8080.
  implication: Project-wide `ALLOWED_ORIGINS` gap, not a per-function/stale-deploy issue. Matches docs/ENVIRONMENT.md:75 (preview-test must = "stable preview alias + http://localhost:8080") and prior Issue E (operator-managed secret).

- timestamp: 2026-07-07 (supabase secrets list --project-ref cimjltzovkahkqecpwgi)
  checked: ALLOWED_ORIGINS secret metadata (digest + updated_at)
  found: ALLOWED_ORIGINS updated_at = 2026-07-07T08:34:11Z — coincides with the operator's Issue E preview-alias CORS fix. (Only SHA digests are exposed; plaintext not readable via CLI.)
  implication: The Issue E overwrite (adding the vercel preview alias) dropped `http://localhost:8080` from the allowlist. That regression reds the E2E gate. Fix must re-include localhost:8080 alongside the alias.

- timestamp: 2026-07-07 (fix applied — secret write, operator-approved via permission system)
  checked: `npx supabase secrets set ALLOWED_ORIGINS="https://strivoai-git-preview-brians-projects.vercel.app,http://localhost:8080" --project-ref cimjltzovkahkqecpwgi`
  found: Command returned {"project_ref":"cimjltzovkahkqecpwgi","count":1,"message":"Finished supabase secrets set."} — allowlist now = stable preview alias + localhost:8080 (matches docs/ENVIRONMENT.md:75 preview-test contract).
  implication: Restores the documented preview-test ALLOWED_ORIGINS value dropped by the Issue E overwrite.

- timestamp: 2026-07-07 (post-fix verification — curl OPTIONS preflight)
  checked: `curl -i -X OPTIONS https://cimjltzovkahkqecpwgi.supabase.co/functions/v1/create-checkout-session -H "Origin: http://localhost:8080" -H "Access-Control-Request-Method: POST"`
  found: HTTP/1.1 200 OK with `Access-Control-Allow-Origin: http://localhost:8080` now echoed (plus allow-headers/allow-methods). Previously ACAO was absent for this origin.
  implication: Edge-function fail-closed CORS now admits the local preview origin → the create-checkout-session POST is no longer preflight-blocked.

- timestamp: 2026-07-07 (post-fix verification — Playwright re-run)
  checked: `npx playwright test e2e/stripe-checkout.spec.ts --project=chromium`
  found: 3 passed, 1 skipped (27.8s). setup(auth) PASS; spec :26 "clientSecret round-trip + EmbeddedCheckout iframe mounts" PASS (4.5s); :56 reconcile PASS; :78 QUARANTINE 4242-card skipped as designed. No TimeoutError.
  implication: The blocking E2E set is green. The gate that reds verify:baseline / aborts deploy.ps1 pre-link / reds GitHub Actions regression is unblocked. Root cause confirmed and fix verified end-to-end.

## Eliminated

- hypothesis: CTA label/route moved by the Pricing/navbar redesign (handoff hyp 2)
  evidence: Page snapshot + diagnostic show the "Upgrade to Elite" button renders [active] and the click fires the create-checkout-session POST.
  timestamp: 2026-07-07
- hypothesis: Stale/absent .auth/user.json storage-state fixture (handoff hyp 3)
  evidence: `setup › authenticate` passed and the authed /pricing page rendered fully with user context; the request carried auth.
  timestamp: 2026-07-07
- hypothesis: E2E target env down/unreachable, or create-checkout-session not deployed (handoff hyps 1/4)
  evidence: OPTIONS preflight returned HTTP 200 (function reachable + deployed); a missing function would 404 (still a response). The failure is specifically the absent ACAO header for localhost:8080.
  timestamp: 2026-07-07

## Resolution

- root_cause: The preview/test Supabase project `cimjltzovkahkqecpwgi` `ALLOWED_ORIGINS` edge secret is missing `http://localhost:8080`. The E2E suite drives a local `vite preview` on http://localhost:8080 against this project; edge-function CORS (_shared/cors.ts) is fail-closed and only echoes Access-Control-Allow-Origin for exact allowlist members. With localhost:8080 absent, the create-checkout-session preflight returns no ACAO → the browser blocks the POST → no response event → the spec's 30s waitForResponse (e2e/stripe-checkout.spec.ts:31) times out → reds npm run test:e2e → reds verify:baseline → aborts deploy.ps1 pre-link gate + GitHub Actions regression gate. Regression introduced 2026-07-07T08:34 when the Issue E fix overwrote ALLOWED_ORIGINS with the vercel preview alias but dropped localhost:8080.
- fix: Set the preview/test Supabase `ALLOWED_ORIGINS` secret to the documented preview-test value (stable preview alias + localhost), e.g.
  `npx supabase secrets set ALLOWED_ORIGINS="https://strivoai-git-preview-brians-projects.vercel.app,http://localhost:8080" --project-ref cimjltzovkahkqecpwgi`
  Config/secret fix only — no repo code change (matches Issue E pattern + guardrail "not a code fix"). APPLIED 2026-07-07 (operator-approved via permission system): secret set returned count:1.
- verification: DONE 2026-07-07. (1) curl OPTIONS preflight to preview create-checkout-session with Origin http://localhost:8080 now returns HTTP 200 with `Access-Control-Allow-Origin: http://localhost:8080` echoed (was absent). (2) `npx playwright test e2e/stripe-checkout.spec.ts --project=chromium` = 3 passed / 1 skipped; blocking spec :26 green in 4.5s, no TimeoutError. The verify:baseline E2E gate (and thus deploy.ps1 pre-link gate + GitHub Actions regression gate) is unblocked.
- files_changed: [] (no repo files; Supabase preview edge secret ALLOWED_ORIGINS only — config-only fix)

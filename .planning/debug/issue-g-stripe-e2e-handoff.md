---
slug: issue-g-stripe-e2e-handoff
status: resolved
resolved_session: ".planning/debug/resolved/stripe-e2e-checkout-timeout.md (root cause: preview ALLOWED_ORIGINS dropped http://localhost:8080 in the 2026-07-07T08:34 Issue E overwrite; fix: re-added localhost:8080 to preview ALLOWED_ORIGINS secret; verified via curl preflight ACAO echo + green playwright spec :26)"
trigger: "Stripe checkout E2E fails with TimeoutError; blocks verify:baseline / deploy.ps1 / GitHub Actions regression gate. Unrelated to Phase 6."
created: 2026-07-07
updated: 2026-07-07
phase: "n/a (cross-cutting pipeline blocker; surfaced during Phase 6 prod-deploy attempt)"
environment: test env (Stripe test mode) + local Playwright + GitHub Actions
recommended_entry: /gsd-debug
---

# Handoff: Issue G — Stripe checkout E2E blocks the deploy pipeline

> Deferred to a NEW session by operator (2026-07-07). Phase 6 is fully closed and
> verified; this is the next real work item because it gates the WHOLE automated
> deploy pipeline. Start fresh with `/gsd-debug` (do NOT fold into Phase 6).

## Symptom
- `e2e/stripe-checkout.spec.ts:26` — test **"clientSecret round-trip + EmbeddedCheckout
  iframe mounts"** — fails with a Playwright **TimeoutError**.
- First observed this session when the operator ran `./scripts/deploy.ps1 -Env staging`:
  the HARD `verify:baseline` precondition gate (`npm run test:e2e`) went RED and aborted
  the deploy BEFORE `supabase link`. The SAME failure showed up in GitHub Actions'
  regression gate.

## Blast radius (why it matters)
`verify:baseline` = `npm run test && npm run test:edge && npm run test:e2e`. This one E2E
failure turns the whole gate red, which:
1. Aborts `scripts/deploy.ps1` (both staging + production) at the pre-link gate.
2. Reds the GitHub Actions regression gate.
3. Forced this session's Phase-6 prod rollout to bypass via **direct CLI edge deploys**
   (`npx supabase functions deploy <fn> --project-ref <ref>`) instead of the unified
   script. That bypass is fine for edge fns but is NOT a durable path — the pipeline
   must go green.

## The test (what it asserts — this is intended plumbing, don't weaken it)
Blocking set is 3 assertions proving OUR Stripe plumbing against REAL Stripe test mode
(no mocked clientSecret), deliberately NOT depending on Stripe's anti-automation card form:
1. `create-checkout-session` returns a real test-mode `clientSecret` (matches `/_secret_/`).
2. The `EmbeddedCheckout` iframe mounts/renders.
3. Post-checkout reconcile path fires (`?checkout=complete` → `reconcileTierUpgrade`).
The automated 4242 card SUBMIT is intentionally QUARANTINED (`test.skip`) — out of scope.

## Where to look first (hypotheses, unverified — for the debugger to test)
- `page.waitForResponse(... '/functions/v1/create-checkout-session' ...)` has a 30s timeout
  (spec lines ~31-34). A TimeoutError here means the function response never arrived →
  check: is `create-checkout-session` deployed + healthy on the **test** Supabase env?
  Are the Stripe test-mode secrets/price IDs set there? (See `docs/ENVIRONMENT.md` for the
  Stripe secret/webhook/price-ID matrix per surface.)
- The CTA selector `getByRole('button', { name: /upgrade to elite/i })` (spec line 37) —
  did the Pricing/navbar redesign change the button label or route so the click never
  fires the request? (Payments migrated Paddle→Stripe; navbar was redesigned in this
  milestone — either could have moved the CTA.)
- Auth context: `test.use({ storageState: '.auth/user.json' })`. Is the storage-state
  auth fixture present + valid in the run environment (local + CI)? A stale/absent
  `.auth/user.json` would drop the user off `/pricing` before the CTA renders.
- Env preconditions: preview Supabase `cimjltzovkahkqecpwgi` was UNPAUSED 2026-06-24
  (see memory) — confirm the E2E target env is up and reachable.

## Guardrails (from CLAUDE.md / project memory)
- Do NOT weaken `verify:baseline` or mask the failure with retries (D-06 deterministic /
  D-07 no retry-masking). Fix the root cause; if genuinely un-fixable in-env, the
  quarantine register (`TESTING-STRATEGY.md`) is the documented escape — but justify it.
- `deploy.ps1 -SkipVerify` is emergency-only (default OFF), not a fix.
- Keep `.ps1` scripts pure ASCII (memory: `project_powershell_ps1_pure_ascii`).

## Pointers
- Test: `e2e/stripe-checkout.spec.ts` (blocking set at :26).
- Runner: `npm run test:e2e` (Playwright). Gate: `npm run verify:baseline`.
- Deploy gate wiring: `scripts/deploy.ps1` (verify:baseline before `supabase link`).
- Env matrix: `docs/ENVIRONMENT.md`; testing model: `TESTING-STRATEGY.md`.
- Payments context: Paddle→Stripe migration is part of this milestone (CLAUDE.md Project).

# Phase 01 — Paused at Plan 01-03 (E2E specs)

**Status:** PAUSED — blocked on a `checkpoint:human-action` (live infrastructure).
**Paused:** 2026-06-09
**Plans complete:** 3/5 (01-01, 01-02, 01-04). Remaining: **01-03**, **01-05**.

## Why paused

Plan 01-03 Task 0 is a blocking `checkpoint:human-action`: it requires a real
Supabase TEST project + Stripe test mode before any selector can be authored or
any spec can run. The operator confirmed this infrastructure is **not yet
provisioned**, so the phase was paused before 01-03's first automatable task.

Plan 01-05 (`depends_on: [01-03, 01-04]`) is transitively blocked — it ships the
blocking regression gate and tags the baseline, which needs 01-03's green E2E run.

## Recorded operator decisions (honor these on resume — do NOT re-ask)

- **01-03 Task 3a — Stripe card-submit scope: `integration-proven`.**
  The BLOCKING per-PR gate asserts only: (1) `create-checkout-session` returns a
  real test-mode `clientSecret`, (2) the `EmbeddedCheckout` iframe mounts, and
  (3) the post-checkout reconcile fires. The automated `4242` card-SUBMIT is
  **quarantine-eligible** and stays OUT of the blocking set (Stripe anti-automation
  → CI-flaky). Task 3b must tag the card-submit assertion `// QUARANTINE(...)` and
  exclude it from the blocking flow. Plan 04's quarantine register and Plan 05's
  gate doc must reflect `integration-proven`.

## What the operator must provision before resuming 01-03

1. A dedicated **Supabase TEST project** — this IS **strivoaipreview**
   (ref `cimjltzovkahkqecpwgi`, the same project staging deploys to). `AI_TEST_MODE`
   is **transient** (toggled on only around the CI E2E step, see the durable topology
   section below) — it is NOT set as a permanent secret on it, and production must
   never get it.
2. **Stripe in Test mode** with a test-mode product/price for the checkout flow.
3. Export into the authoring/run environment:
   `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY`,
   `E2E_TEST_PASSWORD`, `STRIPE_TEST_PUBLISHABLE_KEY`, and point the `VITE_*`
   build env at the TEST project (per 01-05's build-env mapping).

## How to resume

Once the infra above is live and the secrets are exported in your shell:

```
/gsd-execute-phase 1
```

Discovery will skip the 3 completed plans (they have SUMMARY.md) and resume at
01-03. Pass the recorded `integration-proven` decision to the 01-03 executor so it
runs Tasks 1–3b autonomously and only stops at Task 4 (human-verify) for your
real-infra confirmation. Then 01-05 runs, then phase verification + completion.

## Recorded infra topology (durable — honor on resume)

These are the durable infra/topology decisions for the test environment. Honor them
exactly when 01-03 resumes; do not re-ask.

- **(a) TEST target = strivoaipreview (`cimjltzovkahkqecpwgi`).** The Supabase TEST
  project IS strivoaipreview — the same project staging deploys to (test and staging
  share the preview project). All `SUPABASE_TEST_*` secrets
  (`SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY`)
  map to this project (`https://cimjltzovkahkqecpwgi.supabase.co`).

- **(b) `AI_TEST_MODE` is TRANSIENT — CI-only, never permanent.** It is enabled ONLY
  during CI, around the E2E step: `supabase secrets set AI_TEST_MODE=true` immediately
  before the E2E step and `supabase secrets unset AI_TEST_MODE` immediately after,
  toggled by the 01-05 CI gate. The unset/cleanup MUST be wrapped so it runs even on
  failure (`if: always()`). It is NOT a permanent secret on strivoaipreview — this
  keeps the preview site's AI realistic for manual/owner use between CI runs.

- **(c) Local E2E authoring uses the same transient discipline.** When authoring or
  debugging E2E specs locally against strivoaipreview, toggle `AI_TEST_MODE` on
  temporarily, then unset it afterward — never leave it set on the preview project.

- **(d) Stripe scope = `integration-proven` (reaffirmed, unchanged).** The prior
  Stripe card-submit scope decision recorded above (`integration-proven`: assert
  clientSecret + iframe mount + reconcile; the `4242` card-SUBMIT stays quarantined
  and out of the blocking set) still stands. Do not change it.

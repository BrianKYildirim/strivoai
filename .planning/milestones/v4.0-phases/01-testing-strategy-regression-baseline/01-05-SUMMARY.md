---
phase: 01-testing-strategy-regression-baseline
plan: 05
subsystem: infra

tags: [ci, github-actions, regression-gate, stripe, playwright, vitest, baseline-tag, supabase-secrets]

# Dependency graph
requires:
  - phase: 01-02
    provides: "verify:baseline composition (vitest + deno-offline + Playwright) the workflow mirrors"
  - phase: 01-03
    provides: "the 3 critical-flow E2E specs the gate runs; the TEST-project AI_TEST_MODE seam"
  - phase: 01-04
    provides: "TESTING-STRATEGY.md branch-protection + quarantine-register the gate references"
provides:
  - ".github/workflows/regression-gate.yml — blocking-capable PR gate (vitest + deno-offline + Playwright) on PRs to main/staging, least-privilege, pinned actions, secret-sourced env incl. build-time VITE_* TEST-project mapping, promptfoo excluded"
  - "v4.0-baseline annotated git tag at the green pre-cleanup commit (fa4ccb6) — the zero-functional-change anchor Phases 2-9 re-run via `npm run verify:baseline`"
  - "A genuinely GREEN verify:baseline: vitest 468/468, deno 284/0, Playwright 3 critical flows + reconcile (1 quarantined card-submit skipped)"
affects: [02, 03, 04, 05, 06, 07, 08, 09, regression-baseline, ci-gate, all-later-phases]

# Tech tracking
tech-stack:
  added:
    - ".github/workflows/regression-gate.yml (GitHub Actions)"
    - "v4.0-baseline git tag"
  patterns:
    - "Blocking PR gate sources ALL TEST-project/Stripe secrets from GitHub Actions secrets; build-time VITE_* mapped from the same secrets so the preview build targets TEST, never prod (RESEARCH Pitfall 5)"
    - "Stale-test reconciliation as a green-baseline prerequisite: judge each failing test stale-vs-real, fix/retire stale ones, never mask a real regression"

key-files:
  created:
    - ".github/workflows/regression-gate.yml"
  modified:
    - "supabase/functions/_shared/__tests__/cost-map-invariant.test.ts"
    - "src/components/BlurredLockCard.test.tsx"
    - "src/pages/__tests__/LinkedInGrader.linkedin-pdf-source.test.ts"
    - "e2e/stripe-checkout.spec.ts"
  deleted:
    - "src/config/__tests__/req-coverage.test.ts (obsolete Phase-24 artifact, v4.0 reset)"

key-decisions:
  - "Repurposed the shared strivoaipreview project (cimjltzovkahkqecpwgi) AS the dedicated TEST project — Supabase's 2-free-project limit blocked a separate one; APP_URL=localhost:8080 + AI_TEST_MODE=true + Stripe TEST secrets on it; no separate staging env remains."
  - "Reconciled the 7 pre-existing deterministic vitest failures 01-01 deferred but no later plan closed — required to satisfy Task 3's verify:baseline-green precondition (D-01). All zero-functional-change test reconciliations; no product source changed."
  - "Tagged v4.0-baseline at the green CODE commit (fa4ccb6, the Flow-3 spec fix), before the phase-closing .planning doc commits, so a later `git diff v4.0-baseline -- src/ supabase/` stays clean."
  - "Tag created locally; push to origin + branch-protection Required check + the green-on-PR CI confirmation remain operator follow-ups (Task 2 checkpoint)."

patterns-established:
  - "Diagnose Supabase function failures via secret SHA256 digest comparison (supabase secrets list) + direct Stripe API probes with a pinned apiVersion — isolates config vs code vs data without exposing secrets"

requirements-completed: [TEST-06, NFR-01]

# Metrics
duration: ~1 day (incl. operator infra setup + diagnosis)
completed: 2026-06-10
---

# Phase 01 Plan 05: Blocking Regression Gate + v4.0-baseline Tag Summary

**Shipped `.github/workflows/regression-gate.yml` — a least-privilege, pinned, secret-sourced PR gate running the per-PR set (vitest + deno-offline + Playwright) with the TEST-project `VITE_*` baked at build time and promptfoo excluded — then made `verify:baseline` genuinely green (reconciling 7 stale vitest tests 01-01 deferred and fixing three real Stripe-Flow-3 blockers) and tagged `v4.0-baseline` at the green pre-cleanup commit `fa4ccb6`, the zero-functional-change anchor every later phase re-runs.**

## Performance

- **Duration:** ~1 day wall (dominated by operator infra setup + multi-layer diagnosis; active build time small)
- **Completed:** 2026-06-10
- **Tasks:** 3 (Task 1 ✅, Task 2 partial — operator follow-up remains, Task 3 ✅)
- **Files:** 1 created (workflow) + 4 test files reconciled + 1 deleted

## Accomplishments

- **TEST-06 / NFR-01:** `v4.0-baseline` annotated tag at `fa4ccb6` anchors a genuinely-green suite — **vitest 468/468, deno 284/0, Playwright 3 critical flows + reconcile** (the 4242 card-submit stays quarantined/skipped, by design).
- **The blocking gate:** `.github/workflows/regression-gate.yml` — `pull_request[main,staging]` + `workflow_dispatch`, `permissions: contents: read`, all actions pinned (`@v4`/`@v2`), runs `npm run test` → `deno task test:ci` (DENO_TEST_SUPABASE_REMOTE='0') → `npm run test:e2e`, `upload-artifact@v4` on failure, NO promptfoo, NO prod deploy, no secret literals. The `test:e2e` `env:` maps `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`VITE_STRIPE_PUBLISHABLE_KEY` from the TEST-project secrets (Pitfall 5 — preview build targets TEST not prod) plus the 5 Node-side secrets.
- **Baseline-greening (unplanned but required for D-01):** reconciled the 7 pre-existing deterministic vitest failures 01-01 deferred "for reconciliation in later plans" that no later plan closed, and resolved three independent Stripe Flow-3 blockers — all without changing product behavior.

## Task Commits

1. **Task 1: regression-gate.yml** — `6dd0bd3` (ci)
2. **Task 2: GitHub secrets + Required check** — checkpoint (human-action): repo secrets **set by operator**; green-on-PR run + branch-protection Required check + tag push **remain operator follow-ups**
3. **Task 3: tag v4.0-baseline** — tag at `fa4ccb6`; created **locally** (push is the operator step)

**Baseline-greening commits (prerequisite for Task 3):**
- `1707182` test(01-05): reconcile stale cost-map drift fixture (ts 2→3)
- `4495c46` test(01-05): retire obsolete Phase-24 req-coverage guard (v4.0 reset)
- `4904343` test(01-05): reconcile BlurredLockCard a11y test selectors to source (a11y contract verified intact)
- `b6986ce` test(01-05): reconcile LinkedInGrader source contract to PDF-only redesign
- `fa4ccb6` test(01-05): match Flow 3 assertion to Stripe's real EmbeddedCheckout iframe  ← **tagged**

**Tracking commits:** `8876596`, `1a10eda` (STATE blocker/decision records)

## verify:baseline (green) — measured

| Layer | Result | ~Time |
|-------|--------|-------|
| vitest (`npm run test`) | 468 passed (81 files) | ~45s |
| deno offline (`deno task test:ci`) | 284 passed / 0 failed | ~3–6s |
| Playwright (`npm run test:e2e`) | setup + 4 specs green, 1 quarantined skipped | ~30s + build |
| **verify:baseline total** | **exit 0** | **~2 min wall** |

Backfills the "estimated runtime" placeholder in `TESTING-STRATEGY.md` / `01-VALIDATION.md` (~2 min on this machine).

## Deviations from Plan

The plan scoped 01-05 to the YAML + tag. Task 3's acceptance ("`npm run verify:baseline` exits 0 immediately before tagging — D-01") could not be met as-found: the baseline was red on two fronts that prior plans left open. Closing them was necessary and stayed within zero-functional-change (test/CI/data only — no product source changed).

### 1. [Rule 2 — Missing Critical] Reconciled the 7 deferred vitest failures
- **Issue:** `vitest.config.ts` does not exclude them and no quarantine dir exists, so `npm run test` exited 1 → verify:baseline could never be green → tag impossible.
- **Fix (per-test judgment, never mask):** cost-map `ts 2→3` (fixture vs source `MERIT_COST_PER_FEATURE.resumeAnalysis.pro=3`); `req-coverage` **deleted** (asserted a Phase-24 planning artifact removed by the v4.0 reset; no product code); `BlurredLockCard` selectors re-pointed (`blur-sm`→`blur-md`, label drift) with the `aria-hidden`/`role=button`/`aria-label` a11y contract **verified intact**; `LinkedInGrader` retired the obsolete paste-mode/onboarding-restore assertion (component is PDF-upload-only by deliberate pre-v4.0 redesign), kept the still-valid "persist only after a successful grade" invariant.
- **Verification:** `npm run test` → 468 passed, 0 failed.

### 2. [Rule 3 — Blocking] Three Stripe Flow-3 blockers (TEST-project infra + test selector)
- **2a — wrong price env-var names:** prices were stored as `STRIPE_TEST_ElITE_*_PRICE_ID`; the resolver reads `STRIPE_PRICE_ELITE_{MONTHLY,ANNUAL}`. Operator re-set under the correct names (verified via SHA256 digest match in `supabase secrets list`).
- **2b — stale `stripe_customer_id`:** the seeded test profile carried `cus_UgJ5oZfJfRvRPc` from an earlier failed run, absent from the current `sk_test` account (`No such customer`) → `checkout_session_creation_failed`. Cleared the stale id (+`stripe_subscription_id`) on the TEST profile via service role; the function then lazy-created a fresh valid test customer and returned a real clientSecret.
- **2c — wrong iframe selector (`fa4ccb6`):** the spec's hardcoded `__privateStripeFrame`/`checkout.stripe.com`/`Secure` selectors never matched Stripe's real EmbeddedCheckout iframe (the assertion only began running once 2a/2b were fixed). Re-scoped to the "Subscribe to …" checkout dialog's iframe. App flow unchanged.

**Impact:** all reconciliations are test/CI/data only; product source byte-unchanged. No scope creep into product behavior. These closed gaps inherited from 01-01 (vitest) and the TEST-project topology (Stripe), which 01-05 alone could not have foreseen.

## Issues Encountered

- **Supabase 2-free-project limit** blocked a separate dedicated TEST project → operator repurposed the shared `strivoaipreview` (`cimjltzovkahkqecpwgi`) AS the TEST project (APP_URL=localhost:8080 + AI_TEST_MODE + Stripe TEST secrets). Consequence: no distinct staging environment remains (prod + test).
- **`ui_mode: 'embedded'` red herring:** a direct Stripe probe without a pinned version returned "`embedded` is no longer supported; use `embedded_page`" — but the function pins `apiVersion '2024-11-20.acacia'` (still supports `embedded`), so prod is unaffected. Re-probing with the pinned version returned 200; the real cause was 2b.

## User Setup Required (Task 2 — operator follow-ups; gate is not yet blocking)

The YAML alone does not block. Remaining operator actions (none code-assertable):
1. **Push the tag + branch:** `git push origin staging && git push origin v4.0-baseline`.
2. **Green-on-PR:** push the gate, open a throwaway PR (or `workflow_dispatch`), confirm the `Regression Gate` job runs GREEN end-to-end and the preview build resolved the TEST `VITE_SUPABASE_URL`.
3. **Branch protection (the D-06 teeth):** mark `Regression Gate` a Required status check on `main` and `staging` — only after step 2 is green (a Required-but-red check blocks every PR).
4. **(Recommended, optional re-runnability hardening):** reset the test user's `stripe_customer_id`/`stripe_subscription_id` at the start of `e2e/global-setup.ts` so a stale customer can never re-break Flow 3 for the phases that re-run this baseline.

GitHub Actions repo secrets (`SUPABASE_TEST_*`, `STRIPE_TEST_PUBLISHABLE_KEY`, `E2E_TEST_PASSWORD`) are already set by the operator.

## Next Phase Readiness

- **Phases 2-9 unblocked:** `v4.0-baseline` (`fa4ccb6`) anchors the green suite; every later phase re-runs `npm run verify:baseline` to prove zero functional change. The TEST project (`cimjltzovkahkqecpwgi`) is configured for E2E (localhost CORS + AI_TEST_MODE + Stripe test mode).
- **Watch-outs for re-runners:** the gate's blocking teeth depend on the operator marking it Required (follow-up 3); and the optional global-setup reset (follow-up 4) makes Flow 3 robust to test-data drift.

## Self-Check: PASSED

- FOUND: `.github/workflows/regression-gate.yml` (parses; `permissions: contents: read`; pinned `@v4`/`@v2`; VITE_* TEST mapping; 5 Node secrets; no `promptfoo`/secret literals/prod deploy) — commit `6dd0bd3`
- FOUND: tag `v4.0-baseline` → `fa4ccb6` (annotated)
- VERIFIED: `npm run verify:baseline` exits 0 (vitest 468 / deno 284 / Playwright critical flows green)
- FOUND: `.planning/phases/01-testing-strategy-regression-baseline/01-05-SUMMARY.md`

---
*Phase: 01-testing-strategy-regression-baseline*
*Completed: 2026-06-10*

---
phase: 1
slug: testing-strategy-regression-baseline
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-09
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `01-RESEARCH.md` §"Validation Architecture" (8 assertable checkpoints).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (frontend) · `deno test` (edge functions) · `@playwright/test` (E2E — Wave 0 installs) · promptfoo 0.120.13 (adversarial) |
| **Config file** | `vitest.config.ts` · `supabase/functions/deno.json` · `playwright.config.ts` (none yet — Wave 0 installs) · existing `promptfooconfig.yaml` |
| **Quick run command** | `npm test` (vitest) |
| **Full suite command** | `npm run verify:baseline` (vitest + deno-offline + Playwright) |
| **Estimated runtime** | ~TBD (measured at baseline tag in Plan 05; vitest+deno offline ≈ seconds, Playwright adds the 3 flows) |

---

## Sampling Rate

- **After every task commit:** Run `npm test` (vitest quick) — and `deno task test:ci` for edge-function tasks
- **After every plan wave:** Run `npm run verify:baseline` (vitest + deno-offline + Playwright)
- **Before `/gsd:verify-work`:** Full `verify:baseline` must be green AND `npm run test:adversarial` (promptfoo) clean
- **Max feedback latency:** quick vitest run target < 30s

---

## Per-Task Verification Map

> Populated during planning. Each row maps a plan task to its assertable checkpoint from the Validation Architecture table.
> Note (revision): Plan 03 gained a `checkpoint:human-action` Task 0 gating live-TEST-project authoring (W2); the automatable IDs 01-03-T1/T2/T3b are unchanged.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T1 | 01 | 0 | TEST-02 | T-01-01 | OutcomeOverdueBanner async effect guarded (no escaped rejection) | unit | `npm test` | ❌ W0 | ⬜ pending |
| 01-01-T2 | 01 | 0 | TEST-02 | T-01-02 | reusable Supabase mock + rejection surfacing → stable vitest failure set | unit | `npm test` (×3 stable) | ❌ W0 | ⬜ pending |
| 01-01-T3 | 01 | 0 | TEST-06 | T-01-01 | tier-config drift reconciled (stale test, source untouched): core=155000, elite-preview throws-as-elite, quiz `assertEquals` 80000 | integration | `deno test --no-check _shared/tier-config.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-T1 | 02 | 0 | TEST-04 | T-02-02 | @playwright/test installed; preview pinned :8080; artifacts gitignored | infra | `npx playwright --version` | ❌ W0 | ⬜ pending |
| 01-02-T2 | 02 | 0 | TEST-04 | T-02-01 | playwright.config.ts targets vite preview :8080, no hardcoded secrets | infra | `npx playwright test --list` | ❌ W0 | ⬜ pending |
| 01-02-T3 | 02 | 0 | TEST-06 / NFR-01 | — | cross-platform offline deno allowlist (UNCONDITIONALLY excludes `_tests/test-04..06`) + verify:baseline wrapper | integration | `deno task test:ci` · `npm run test:edge` | ❌ W0 | ⬜ pending |
| 01-03-T0 | 03 | 1 | TEST-04 | T-03-01/03 | GATE: Supabase TEST project provisioned + AI_TEST_MODE=true + SUPABASE_TEST_*/E2E_TEST_PASSWORD/STRIPE_TEST_PUBLISHABLE_KEY confirmed (precondition for Task 1 authoring) | checkpoint (human-action) | operator-confirmed | — | ⬜ pending |
| 01-03-T1 | 03 | 1 | TEST-04 | T-03-01 | idempotent test-user seed (service-role Node-only) + storage state | e2e (setup) | `npx playwright test --project=setup` | ❌ W1 | ⬜ pending |
| 01-03-T2 | 03 | 1 | TEST-04 | T-03-03 | auth/session + resume-analysis flows green (AI stubbed server-side) | e2e | `npx playwright test auth-session resume-analysis` | ❌ W1 | ⬜ pending |
| 01-03-T3b | 03 | 1 | TEST-04 | T-03-04 | Stripe checkout: clientSecret + iframe mount + reconcile (card-submit per decision) | e2e | `npx playwright test stripe-checkout` | ❌ W1 | ⬜ pending |
| 01-04-T1 | 04 | 1 | TEST-01 / NFR-01 | T-04-03 | strategy doc + quarantine register (no secret literals; promptfoo off verify:baseline — D-09) | doc | source assertion | ❌ W1 | ⬜ pending |
| 01-04-T2 | 04 | 1 | TEST-07 | T-04-02 | promptfoo injection fixtures pass; off the per-PR gate | contract | `npm run test:adversarial` | ✅ | ⬜ pending |
| 01-05-T1 | 05 | 2 | NFR-01 | T-05-01/02/03/05 | least-privilege, pinned, secret-sourced blocking PR gate; `test:e2e` step maps VITE_* from TEST-project secrets (preview ≠ prod) | gate | `js-yaml` parse · GitHub run | ❌ W2 | ⬜ pending |
| 01-05-T3 | 05 | 2 | TEST-06 | — | v4.0-baseline tag at green pre-cleanup commit | gate | `npm run verify:baseline` · `git tag -l v4.0-baseline` | ❌ W2 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Greenfield installs/fixtures this phase must stand up before downstream tasks can be verified (Plans 01 + 02):

- [ ] `@playwright/test` installed + `playwright.config.ts` (targets local `vite preview` :8080, D-03) — **Plan 02**
- [ ] `vite.config.ts` `preview.port` pinned to 8080 — **Plan 02**
- [ ] `deno task test:ci` — cross-platform offline allowlist (Q2) added to `supabase/functions/deno.json` (+ `run-edge-tests.sh` twin), UNCONDITIONALLY excluding `_tests/test-04..06` (RESEARCH Pattern 3) — **Plan 02**
- [ ] `npm run verify:baseline` wrapper script (D-08) orchestrating vitest + deno-offline + Playwright — **Plan 02**
- [ ] `OutcomeOverdueBanner` async-effect guard + reusable Supabase mock factory + `test-setup.ts` rejection surfacing (Q4 / TEST-02) — **Plan 01**
- [ ] **Reconcile the RED baseline** (`_shared/tier-config.test.ts` 3 failures — confirmed live at plan time; root cause = stale test vs. Pro→Elite collapse in `getTimeout`) so the suite is green before the `v4.0-baseline` tag (D-01) — **Plan 01**

Wave 1 (Plans 03 + 04) and Wave 2 (Plan 05) depend on Wave 0 completing. Plan 03 additionally `depends_on: ["01-01", "01-02"]` so its `verify:baseline` chain runs against the green deno+vitest suites, not a red one.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Supabase TEST project provisioned + AI_TEST_MODE deploy (Plan 03 Task 0 gate) | TEST-04 / D-02 | Provisioning + secret-set on the TEST project is operator infra, not code-assertable; gates Task 1 selector-authoring | Plan 03 Task 0: confirm TEST project live, edge functions deployed with `AI_TEST_MODE=true` (never prod), and SUPABASE_TEST_*/E2E_TEST_PASSWORD/STRIPE_TEST_PUBLISHABLE_KEY exported |
| Stripe embedded card-form submit (full card entry) | TEST-04 | Stripe documents anti-automation on the embedded Payment Element; full card submit may be CI-flaky (Pitfall 4) | Decided in Plan 03 Task 3a. If quarantined from the blocking gate: manually drive `4242 4242 4242 4242` in test mode and confirm successful checkout; blocking gate asserts `clientSecret` + iframe mount + reconcile instead |
| GitHub branch-protection required check | NFR-01 / D-06 | Branch protection is a GitHub repo setting, not code-assertable in-suite | Plan 05 Task 2: confirm `regression-gate.yml` is marked a Required status check on main/staging in repo settings |
| GitHub Actions secrets | TEST-04 / D-09 | Repo secrets are a GitHub setting | Plan 05 Task 2: set `SUPABASE_TEST_*`, `STRIPE_TEST_PUBLISHABLE_KEY`, `E2E_TEST_PASSWORD` (the workflow maps the first two + Stripe key into the `test:e2e` step's `VITE_*` build env per RESEARCH Pitfall 5) |

---

## Validation Sign-Off

- [x] All tasks have `<acceptance_criteria>` with automated/CLI/source assertions or Wave 0 / checkpoint dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (Plans 01 + 02)
- [x] No watch-mode flags
- [x] Feedback latency < 30s (quick vitest)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-approved (execution pending; revised per gsd-plan-checker B1/B2/B3 + W1/W2/W3)

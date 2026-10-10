---
phase: 01-testing-strategy-regression-baseline
verified: 2026-06-10T00:00:00Z
status: passed
status_note: "human_verification items operator-confirmed at v4.0 milestone close 2026-06-25 (v4.0-baseline tag pushed + Regression Gate green; branch-protection already confirmed in Phase 5 2026-06-19)"
score: 6/6 must-haves verified
human_verification:
  - test: "Push the v4.0-baseline tag to origin: git push origin v4.0-baseline"
    expected: "git ls-remote --tags origin v4.0-baseline lists the tag pointing at fa4ccb6"
    why_human: "Tag exists locally at fa4ccb6 (verified) but ls-remote --tags origin returned empty — tag push requires operator credentials and GitHub access"
  - test: "Open a throwaway PR to main or staging (or trigger workflow_dispatch on regression-gate.yml) and confirm the Regression Gate job runs GREEN end-to-end"
    expected: "All 3 steps pass (vitest 468/0, deno 284/0, Playwright 3 flows); the CI logs show VITE_SUPABASE_URL resolved to the TEST project URL, not production"
    why_human: "GitHub Actions workflow run requires a real PR or dispatch; cannot be triggered or verified programmatically from local environment"
  - test: "In GitHub Settings → Branches, mark 'Regression Gate' (the gate job) as a Required status check on main and on staging"
    expected: "PRs to main/staging cannot merge if Regression Gate is red — the blocking teeth (D-06) are active"
    why_human: "Branch-protection Required-check setting is a GitHub repo UI action — not assertable from code or git"
  - test: "(Recommended) Add a stale-customer reset to the top of e2e/global-setup.ts that clears stripe_customer_id / stripe_subscription_id on the test profile before each run"
    expected: "Flow 3 remains green across re-runs even if a prior run left stale Stripe customer data on the TEST profile"
    why_human: "This is an optional robustness hardening noted in 01-05-SUMMARY; whether it is needed depends on observed run-to-run Flow-3 stability in CI"
---

# Phase 01: Testing Strategy & Regression Baseline — Verification Report

**Phase Goal:** Establish the layered testing strategy (TEST-01) and capture a GREEN regression baseline (TEST-06) — the zero-functional-change spine every later phase (2-9) re-runs — comprising: deterministic vitest + deno-offline suites, the 3 critical-flow Playwright E2E specs (TEST-04, AI stubbed via the TEST-project AI_TEST_MODE seam), extended promptfoo adversarial coverage (TEST-07), and a blocking-capable CI regression gate (NFR-01) with the suite tagged at v4.0-baseline.
**Requirements:** TEST-01, TEST-02, TEST-04, TEST-06, TEST-07, NFR-01
**Verified:** 2026-06-10
**Status:** human_needed — all code deliverables verified present and wired; 4 operator follow-ups remain (tag push, CI green-on-PR confirmation, branch-protection Required-check setting, and optional global-setup hardening)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | vitest suite is deterministic (OutcomeOverdueBanner try/catch guard + supabaseMock factory + unhandledRejection surfacing) | VERIFIED | `src/components/applications/OutcomeOverdueBanner.tsx` has try/catch at line 27–55; `src/test/supabaseMock.ts` exports `makeSupabaseMock`; `src/test-setup.ts` has `process.on('unhandledRejection'...)` at line 9; 01-05-SUMMARY records 468 passed / 0 failed |
| 2 | deno offline suite is green (tier-config stale-test reconciliation, 284 passed) | VERIFIED | `_shared/tier-config.test.ts` asserts `getTimeout('pro','core')` === 155000 (line 37), `getTimeout('pro','quiz')` === 80000 (line 78), and `getTimeout('pro','elite-preview')` throws (line 40-47); `deno.json test:ci` contains the file; 01-05-SUMMARY records 284 passed / 0 failed |
| 3 | 3 critical-flow Playwright E2E specs exist and cover auth/session, resume analysis, Stripe checkout | VERIFIED | `e2e/global-setup.ts`, `e2e/auth.setup.ts`, `e2e/auth-session.spec.ts`, `e2e/resume-analysis.spec.ts`, `e2e/stripe-checkout.spec.ts` all present and substantive; storageState wiring confirmed; Flow 3 blocking set = clientSecret + iframe + reconcile; card-submit quarantined with `test.skip` |
| 4 | TESTING-STRATEGY.md exists documenting the 4 layers, coverage philosophy, gate composition, quarantine register, and branch-protection instructions (TEST-01) | VERIFIED | File exists at repo root, 303 lines; contains `verify:baseline`, `v4.0-baseline`, quarantine register, 4-layer table, D-05 coverage philosophy, branch-protection instructions; explicitly states promptfoo is scheduled/label-only; no secret literals |
| 5 | promptfoo fixtures extended to 20 (TEST-07); promptfoo excluded from verify:baseline and regression-gate.yml | VERIFIED | `fixtures.yaml` has exactly 20 `- description:` entries (13 original + 7 new Phase-01 classes); `verify:baseline` in package.json = `npm run test && npm run test:edge && npm run test:e2e` (no promptfoo); regression-gate.yml has no `promptfoo` or `test:adversarial` reference |
| 6 | `.github/workflows/regression-gate.yml` exists with correct triggers, permissions, pinned actions, secret-sourced VITE_* mapping, no promptfoo, no prod deploy | VERIFIED | Triggers: `pull_request[main,staging]` + `workflow_dispatch`; `permissions: contents: read`; actions pinned `@v4`/`@v2`; steps run `npm run test`, `deno task test:ci` (DENO_TEST_SUPABASE_REMOTE:'0'), `npm run test:e2e`; `test:e2e` env maps `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY` from `secrets.SUPABASE_TEST_*`/`secrets.STRIPE_TEST_*`; `upload-artifact@v4` on failure; no deploy step |

**Score: 6/6 truths verified**

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/applications/OutcomeOverdueBanner.tsx` | try/catch around async Supabase query | VERIFIED | `try {` at line 27; catch at line 49 logs `[OutcomeOverdueBanner]` and calls `setOverdueCount(0)` when `!cancelled` |
| `src/test/supabaseMock.ts` | Chainable Supabase mock factory | VERIFIED | 128 lines; exports `makeSupabaseMock()` and `makeQueryBuilder()`; chains `select/eq/lt/order/limit/maybeSingle/single`; includes `auth`, `rpc`, `storage`, `functions` stubs |
| `src/test-setup.ts` | unhandledRejection surfacing (not suppression) | VERIFIED | `process.on('unhandledRejection', (reason) => { throw ... })` at line 9; no `dangerouslyIgnoreUnhandledErrors` |
| `supabase/functions/_shared/tier-config.test.ts` | Pro→Elite reconciled assertions | VERIFIED | `assertEquals(getTimeout('pro','core'), 155_000)` at line 37; `assertEquals(getTimeout('pro','quiz'), 80_000)` at line 78; `assertThrows` for `pro/elite-preview` at line 40-47 |
| `playwright.config.ts` | Playwright config: baseURL :8080, webServer npm build+preview, setup+chromium projects | VERIFIED | `baseURL: 'http://localhost:8080'`; `webServer.command: 'npm run build && npm run preview'`; setup project with `testMatch: /auth\.setup\.ts/`; chromium project with `dependencies: ['setup']` and `storageState: '.auth/user.json'`; no hardcoded secrets |
| `supabase/functions/deno.json` | test:ci with explicit offline allowlist; no _tests/test-04/05/06 | VERIFIED | test:ci task present with 34-file explicit list; all 5 deno-only `_shared/__tests__/*` files included; grep for `test-04`/`test-05`/`test-06` returns nothing |
| `package.json` | verify:baseline + test:edge + test:e2e + test:quarantine scripts | VERIFIED | All 4 scripts present; `verify:baseline` chains vitest+deno-offline+Playwright; promptfoo remains only in `test:adversarial` (excluded from baseline) |
| `e2e/global-setup.ts` | Idempotent test user seed via service-role admin API | VERIFIED | Reads `SUPABASE_TEST_SERVICE_ROLE_KEY` from `process.env`; calls `admin.auth.admin.createUser` with idempotent catch; seeds profile row + resume row; service-role key never in page context |
| `e2e/auth.setup.ts` | Login setup project saving .auth/user.json storage state | VERIFIED | Drives `/auth` form, waits for redirect away from `/auth`, navigates to `/dashboard`, calls `page.context().storageState({ path: '.auth/user.json' })` |
| `e2e/auth-session.spec.ts` | Flow 1 — session persists after reload | VERIFIED | `page.reload()` at line 27; asserts `toHaveURL(/\/dashboard/)` and `not.toHaveURL(/\/auth/)` after reload |
| `e2e/resume-analysis.spec.ts` | Flow 2 — upload → analyze → shaped results | VERIFIED | Uploads fixture PDF; asserts `/results/` URL, "Resume Screening Report" heading, `/100` score text, numeric score range; no Anthropic mock or AI_TEST_MODE reference |
| `e2e/stripe-checkout.spec.ts` | Flow 3 — clientSecret + iframe + reconcile; card-submit quarantined | VERIFIED | 3 blocking assertions present (clientSecret, iframe, reconcile); `test.skip` with QUARANTINE comment for card-fill step; uses only 4242 test card |
| `e2e/fixtures/test-resume.pdf` | Valid PDF fixture | VERIFIED | Exists at 2271 bytes |
| `.gitignore` | .auth/, test-results/, playwright-report/, e2e/.cache/ entries | VERIFIED | All 4 entries present at lines 25-28 |
| `vite.config.ts` | preview block with port: 8080 | VERIFIED | `preview: { port: 8080 }` at line 18-19 |
| `TESTING-STRATEGY.md` | TEST-01 strategy doc, ≥60 lines | VERIFIED | 303 lines; covers 4 layers, D-05 coverage philosophy, verify:baseline gate composition, quarantine register, tier-config reconciliation record, branch-protection instructions |
| `CLAUDE.md` | Pointer to TESTING-STRATEGY.md | VERIFIED | Line 57: "See `TESTING-STRATEGY.md` (repo root) for the layered testing model..." |
| `supabase/functions/interview-prep-analyze/__tests__/fixtures/injection/fixtures.yaml` | Extended adversarial fixtures, 20 total | VERIFIED | 20 `- description:` entries; 13 original + 7 new (role_reassignment, payload_splitting, fake_conversation, tool_call_spoofing, refusal_suppression, system_prompt_exfil, hypothetical_framing) |
| `.github/workflows/regression-gate.yml` | Blocking PR gate with all required properties | VERIFIED | All acceptance criteria from 01-05-PLAN satisfied; 79 lines; no prod deploy step; "deploy" appears only in comments |
| `v4.0-baseline` git tag | Annotated tag at fa4ccb6 | VERIFIED (locally) | `git tag -n5 -l v4.0-baseline` shows full annotation; `git rev-list -n1 v4.0-baseline` = `fa4ccb6c81971c7d077b6a92c566bb5bd4bd2ba1`; `git ls-remote --tags origin` returns empty — tag is LOCAL ONLY (push is operator step) |
| `scripts/run-edge-tests.sh` | Bash twin deferring to deno task test:ci | VERIFIED | Executable file; sets `DENO_TEST_SUPABASE_REMOTE=0`; runs `deno task test:ci`; comment confirms `_tests/test-04..06` excluded by design |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `OutcomeOverdueBanner.tsx` | `supabase.from('applications')` | try/catch-guarded async useEffect | WIRED | `try { ... supabase.auth.getUser() ... supabase.from("applications")... } catch` at lines 27-55 |
| `PricingTable.test.tsx` | `src/test/supabaseMock.ts` | `import { makeSupabaseMock }` | WIRED | Line 12: `import { makeSupabaseMock } from '@/test/supabaseMock'`; used at line 19 |
| `usePaywallGuard.test.tsx` | `src/test/supabaseMock.ts` | `import { makeSupabaseMock }` | WIRED | Line 31: `import { makeSupabaseMock } from '@/test/supabaseMock'`; used at line 72 |
| `playwright.config.ts` | `vite preview :8080` | `webServer.command npm run build && npm run preview` + `baseURL` | WIRED | `baseURL: 'http://localhost:8080'`; `webServer.command: 'npm run build && npm run preview'` |
| `package.json verify:baseline` | vitest + deno task test:ci + playwright | `npm run test && npm run test:edge && npm run test:e2e` | WIRED | Line 18: `"verify:baseline": "npm run test && npm run test:edge && npm run test:e2e"` |
| `regression-gate.yml test:e2e step env` | preview build VITE_* (baked at build time) | `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`VITE_STRIPE_PUBLISHABLE_KEY` mapped from `SUPABASE_TEST_*`/`STRIPE_TEST_*` secrets | WIRED | Lines 63-65 of regression-gate.yml; all via `${{ secrets.* }}` — no literals |
| `e2e/global-setup.ts` | Supabase TEST project (service-role) | `createClient(SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY).auth.admin.createUser` | WIRED | Lines 41-52; key read from `process.env` only; never in page context |
| `e2e/auth.setup.ts` | `.auth/user.json` | `page.context().storageState({ path: AUTH_FILE })` | WIRED | Line 48 |
| `v4.0-baseline` tag | commit fa4ccb6 | `git tag -a v4.0-baseline -m "..."` | WIRED (local) | Tag exists locally; push to origin is the operator step |

---

## Requirements Coverage

| Requirement | Description | Status | Verified Via |
|-------------|-------------|--------|--------------|
| TEST-01 | Documented testing strategy defines unit/integration/contract/E2E split | SATISFIED | `TESTING-STRATEGY.md` (303 lines, 4 layers, D-05 coverage philosophy, gate composition, quarantine register) |
| TEST-02 | Vitest deterministic; OutcomeOverdueBanner mock gap fixed | SATISFIED | try/catch in `OutcomeOverdueBanner.tsx`; `supabaseMock.ts` factory; `test-setup.ts` unhandledRejection surfacing; 468 passed / 0 failed |
| TEST-04 | Playwright E2E: auth/session, resume analysis, Stripe checkout (test mode) | SATISFIED | 3 spec files present and substantive; global-setup seeds test user; auth.setup.ts mints storageState; blocking assertions proven |
| TEST-06 | Regression baseline captured GREEN at tagged pre-cleanup commit | SATISFIED | `v4.0-baseline` annotated tag at `fa4ccb6`; annotation records vitest 468 + deno 284 + Playwright critical flows green |
| TEST-07 | Adversarial/promptfoo coverage retained and extended | SATISFIED | `fixtures.yaml` has 20 fixtures (13 original + 7 new attack classes); off the per-PR gate per D-09 |
| NFR-01 | Each change verified to preserve existing production behavior before merge | SATISFIED (code) | `regression-gate.yml` provides the per-PR gate; `verify:baseline` chains all 3 deterministic layers; blocking teeth require operator Required-check setting (human_verification item) |

All 6 phase requirements satisfied at the code level. NFR-01's blocking teeth require one operator action (Required status check on branch protection) documented as a human_verification item.

---

## Anti-Patterns Found

No blockers or warnings found.

| File | Pattern | Severity | Finding |
|------|---------|----------|---------|
| `e2e/stripe-checkout.spec.ts` | `test.skip` on card-fill | INFO | Intentional quarantine per Task 3a decision (`integration-proven`); properly tagged with `// QUARANTINE(TEST-04-stripe-card-submit, ...)` comment and tracked in TESTING-STRATEGY.md quarantine register |
| `regression-gate.yml` | "deploy" / "adversarial" / "production" in file | INFO | All appear only in comments, not in actual workflow steps; no deploy step exists; grep of actual `run:` and `uses:` lines confirmed clean |
| `TESTING-STRATEGY.md` | Contains "service_role" | INFO | Appears only in a negative assertion statement: "No `pk_test_…`, `sk_…`, `service_role` JWT, or password literal appears" — not an actual secret value |

---

## Human Verification Required

### 1. Push v4.0-baseline tag to origin

**Test:** `git push origin v4.0-baseline` (and `git push origin staging` if branch is not yet pushed)
**Expected:** `git ls-remote --tags origin v4.0-baseline` lists the tag pointing at `fa4ccb6c81971c7d077b6a92c566bb5bd4bd2ba1`
**Why human:** The tag exists locally (verified) but `git ls-remote --tags origin v4.0-baseline` returned empty — pushing requires operator credentials and GitHub write access. The SUMMARY documents this as a known operator follow-up.

### 2. Confirm Regression Gate runs GREEN on a PR or workflow_dispatch

**Test:** Push a throwaway branch, open a PR to main or staging (or trigger via GitHub Actions → workflow_dispatch on `regression-gate.yml`)
**Expected:** The `gate` job completes green — vitest passes, deno offline passes, Playwright E2E passes (3 flows + the setup project). CI logs confirm `VITE_SUPABASE_URL` resolved to the TEST project URL (cimjltzovkahkqecpwgi), not production.
**Why human:** GitHub Actions workflow execution requires a real GitHub event or dispatch; cannot be verified locally. The `test:e2e` env block maps secrets correctly (code-verified), but whether the secrets are set and whether the TEST-project edge functions are deployed with AI_TEST_MODE=true requires a live CI run to confirm.

### 3. Mark "Regression Gate" as a Required status check on main and staging

**Test:** GitHub → Settings → Branches → Branch protection rules → add/edit rule for `main` and `staging` → enable "Require status checks to pass before merging" → select the `Regression Gate` job
**Expected:** PRs to main/staging are blocked from merging if the Regression Gate job is red — the D-06 blocking teeth are active. The TESTING-STRATEGY.md "Branch protection" section confirms the instructions match what needs to be done.
**Why human:** Branch-protection Required-check setting is a GitHub repo UI setting — not expressible in YAML, not code-assertable. The YAML alone provides no blocking. This is the documented checkpoint from 01-05-PLAN Task 2 and 01-05-SUMMARY "User Setup Required."

### 4. (Recommended) Harden global-setup.ts against stale Stripe customer data

**Test:** Add a reset step at the top of `e2e/global-setup.ts` that clears `stripe_customer_id` and `stripe_subscription_id` on the test profile before each run (via the admin service-role client)
**Expected:** Flow 3 (Stripe checkout) remains green on every re-run, even after CI runs that may have left stale Stripe customer IDs on the test profile
**Why human:** This is an optional robustness hardening noted in 01-05-SUMMARY ("watch-out for re-runners"). Whether it is needed depends on observed stability across CI re-runs; the operator should assess after the first few pipeline executions.

---

## Gaps Summary

No code gaps. All must-have truths are verified at all three levels (exists, substantive, wired). The 4 human_verification items above are operator actions — GitHub repo settings and live CI confirmation — explicitly documented in 01-05-SUMMARY.md as "User Setup Required" and designed as the Task 2 checkpoint:human-action. They do not represent missing code deliverables.

The deferred-items.md records the 7 pre-existing vitest failures that were reconciled in 01-05 (cost-map ts 2→3, req-coverage deleted, BlurredLockCard selectors, LinkedInGrader PDF-only). All were zero-functional-change stale-test reconciliations; the suite is now 468/468.

---

*Verified: 2026-06-10*
*Verifier: Claude (gsd-verifier)*

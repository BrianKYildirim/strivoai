---
phase: 01-testing-strategy-regression-baseline
plan: 02
subsystem: testing

tags: [playwright, deno, vite-preview, e2e, ci, cross-env, verify-baseline, test-infra]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Deterministic vitest suite + green deno tier-config — the stable layers verify:baseline chains"
provides:
  - "@playwright/test + cross-env devDeps + Chromium installed on the main working tree (persists for Plans 03/05)"
  - "playwright.config.ts driving a local vite preview :8080 build (D-03), setup+chromium projects, storageState auth reuse, all secrets env-sourced"
  - "vite.config.ts preview port pinned to 8080 (matches Playwright baseURL)"
  - "supabase/functions/deno.json test:ci task — explicit offline allowlist (single source of truth), excludes live-Supabase _tests/test-04..06 unconditionally"
  - "scripts/run-edge-tests.sh — bash twin deferring to deno task test:ci"
  - "package.json verify:baseline + test:edge + test:e2e + test:quarantine scripts (D-08; promptfoo excluded per D-09)"
  - "e2e/global-setup.ts placeholder (Plan 03 fills the real Supabase seed body)"
affects: [01-03, 01-05, regression-baseline, ci-gate, testing-strategy-doc]

# Tech tracking
tech-stack:
  added: ["@playwright/test ^1.60.0", "cross-env ^10.1.0"]
  patterns:
    - "Playwright drives `npm run build && npm run preview` on :8080 (production preview, not dev) with storageState-based auth reuse (D-03)"
    - "Offline deno CI = explicit allowlist task (no `deno test ./` recursion); live-Supabase tests stay behind DENO_TEST_SUPABASE_REMOTE=1"
    - "verify:baseline = vitest && deno-offline && Playwright (fail-fast &&); promptfoo deliberately off the per-PR set (D-09)"

key-files:
  created:
    - "playwright.config.ts"
    - "e2e/global-setup.ts"
    - "scripts/run-edge-tests.sh"
  modified:
    - "package.json"
    - "package-lock.json"
    - "vite.config.ts"
    - ".gitignore"
    - "supabase/functions/deno.json"
    - "supabase/functions/reset-subscription-merits/index.test.ts"

key-decisions:
  - "Added a no-op e2e/global-setup.ts placeholder so playwright.config.ts resolves and `playwright test --list` parses before Plan 03 ships the specs/seed (Rule 3 blocking; secrets stay env-sourced)."
  - "Reconciled a stale reset-subscription-merits test assertion (p_tier 'pro' -> 'elite' via normalizeActiveTier) so deno test:ci exits 0 — same Pro->Elite collapse 01-01 reconciled in tier-config.test.ts; handler source byte-identical (Rule 3 blocking, test-only)."
  - "verify:baseline chains vitest+deno+Playwright only; test:adversarial/promptfoo stays separate (D-09 — real Anthropic cost)."

patterns-established:
  - "Single-source-of-truth deno offline allowlist in deno.json test:ci, called by both run-edge-tests.ps1's successor path and the bash twin"
  - "Playwright config consumes an already-built preview; VITE_* build-time secret injection is Plan 05's gate-step responsibility, never hardcoded in config"

requirements-completed: [TEST-04, TEST-06, NFR-01]

# Metrics
duration: ~6min
completed: 2026-06-09
---

# Phase 01 Plan 02: Greenfield Test Infrastructure (Playwright + offline deno CI + verify:baseline) Summary

**Stood up the Wave-0 test scaffolds: installed @playwright/test + Chromium, wrote a secret-free playwright.config.ts driving a local vite preview on :8080 (D-03), pinned the preview port, defined a single-source-of-truth offline `deno task test:ci` allowlist (live-Supabase _tests/test-04..06 unconditionally excluded), and added the `verify:baseline` wrapper chaining vitest + deno-offline + Playwright.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-09T22:08:47Z
- **Completed:** 2026-06-09T22:14Z
- **Tasks:** 3
- **Files modified:** 6 modified + 3 created (incl. package-lock)

## Accomplishments
- `@playwright/test ^1.60.0` and `cross-env ^10.1.0` are devDependencies; Chromium installed on the **main** working tree so it persists for Plans 03 (E2E specs) and 05 (gate). `npx playwright --version` → 1.60.0.
- `playwright.config.ts` drives `npm run build && npm run preview` on `http://localhost:8080`, with a `setup` project (`testMatch /auth\.setup\.ts/`) and a `chromium` project (`dependencies: ['setup']`, `storageState: '.auth/user.json'`). No Supabase/Stripe key, URL, or password literal appears in the file (threat T-02-01 mitigated — all values env-sourced at build/run time).
- `vite preview` now serves on 8080 (was the 4173 default) via a new `preview: { port: 8080, host: true }` block; `server`/`resolve`/`optimizeDeps` untouched.
- `deno task test:ci` runs an explicit 34-file offline allowlist green (`284 passed | 0 failed`) with `DENO_TEST_SUPABASE_REMOTE=0`; no directory recursion.
- `npm run verify:baseline` exists and chains `npm run test && npm run test:edge && npm run test:e2e` (NOT promptfoo).
- Test-output/session artifacts gitignored: `.auth/`, `test-results/`, `playwright-report/`, `e2e/.cache/` (T-02-02).

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Playwright + pin vite preview port + gitignore test artifacts** - `afff508` (chore)
2. **Task 2: Write playwright.config.ts targeting local vite preview (D-03)** - `f1e18c0` (feat)
3. **Task 3: Define cross-platform deno test:ci task + verify:baseline wrapper** - `e3356ee` (chore)

**Plan metadata:** (docs commit — STATE.md / ROADMAP.md / this SUMMARY)

## Final `deno.json` test:ci file list (34 files)

`deno test --allow-all --no-check` over, in order:

Offline `$baseTests` mirror (run-edge-tests.ps1 lines 30-61, **minus** the 3 excluded live files):
`_shared/cache-fingerprint.test.ts`, `_shared/json-repair.test.ts`, `_shared/tier-config.test.ts`, `_shared/logger.test.ts`, `_shared/stripe-client.test.ts`, `_shared/shop-pack-resolver.test.ts`, `_shared/date-utils.test.ts`, `_shared/anthropic.test.ts`, `_shared/tier-prompts.test.ts`, `_shared/resume-prompts-variants.test.ts`, `_shared/merit-gateway.test.ts`, `_shared/merit-gateway.perf.test.ts`, `_shared/merit-gateway.rate.test.ts`, `_shared/merit-gateway.raw.test.ts`, `_shared/merit-idempotency.test.ts`, `_shared/merit-gateway.refund.test.ts`, `_shared/merit-refund-idempotency.test.ts`, `stripe-webhook/index.test.ts`, `create-checkout-session/index.test.ts`, `create-stripe-portal/index.test.ts`, `stripe-webhook-handler/index.test.ts`, `reset-subscription-merits/index.test.ts`, `admin-merit-metrics/index.test.ts`, `check-merit-alerts/index.test.ts`, `analyze-resume/test-07.test.ts`, `analyze-resume/merit-branch.test.ts`, `_tests/merit_rls_test.ts`, `_shared/career-shape.test.ts`, `analyze-career/index.test.ts`

Plus the **5 vitest-excluded deno-only files** (vitest.config.ts lines 19-23 — these use `https://deno.land` imports and run only under deno):
`_shared/__tests__/archive-reader.test.ts`, `_shared/__tests__/interview-prep-prompts.contract.test.ts`, `_shared/__tests__/interview-prep-validation.test.ts`, `_shared/__tests__/merit-gateway-already-refunded.test.ts`, `_shared/__tests__/tier-prompts.interview-prepend.test.ts`

**Confirmed ABSENT (unconditional exclusion — RESEARCH Pattern 3):** `_tests/test-04-free-signup-to-shop.test.ts`, `_tests/test-05-upgrade-proration.test.ts`, `_tests/test-06-yearly-reset.test.ts`. **Why:** these three read `SUPABASE_URL`/`SERVICE_KEY` directly with NO `skipRemote()` guard, so they cannot run offline and would hang/fail in CI — exactly as `run-edge-tests.ps1` excludes them from its base set today. The exclusion is by definition, not gated on "if they fail offline." `scripts/run-edge-tests.sh` defers to `deno task test:ci`, so it introduces none of them either. Verified: `grep test-04|test-05|test-06 deno.json` → no matches; `deno test ./` recursion → absent.

## Exact `package.json` script additions

Inserted into the existing `scripts` block (existing entries preserved):
```jsonc
"test:edge": "cd supabase/functions && cross-env DENO_TEST_SUPABASE_REMOTE=0 deno task test:ci",
"test:e2e": "playwright test",
"test:quarantine": "vitest run --dir src/test/quarantine",
"verify:baseline": "npm run test && npm run test:edge && npm run test:e2e",
```
`verify:baseline` references neither `promptfoo` nor `test:adversarial` (D-09 negative assertion confirmed). devDeps added: `@playwright/test ^1.60.0`, `cross-env ^10.1.0`.

## `vite.config.ts` preview-port pin

```ts
preview: {
  port: 8080,
  host: true,
},
```
Added alongside the existing `server` block; `server`/`resolve`/`optimizeDeps` unchanged. `vite preview` now matches the Playwright `baseURL: http://localhost:8080` (Pitfall 5). No secret literals in the file.

## playwright.config.ts — no hardcoded secrets (confirmed)

`grep -iE 'sk_test|sk_live|pk_test|pk_live|service_role|eyJ|supabase\.co|password=' playwright.config.ts` → **no matches**. baseURL/storageState/port are the only literals; all project/secret values are consumed from the already-built preview at run time (the `VITE_*` build-time injection is Plan 05's gate-env responsibility). Threat T-02-01 mitigated.

## Decisions Made
- **No-op global-setup placeholder (Rule 3):** Playwright resolves `globalSetup` at config-load even for `--list`, so the config could not parse without `./e2e/global-setup.ts` existing. Created a documented no-op stub (default async fn, empty body) so the acceptance criterion ("`playwright test --list` exits without a config-parse error") holds now; Plan 03 replaces the body with the real service-role Supabase seed. No secrets introduced.
- **Reconcile the stale deno test, not the source (Rule 3):** `reset-subscription-merits/index.test.ts:197` expected `p_tier === 'pro'`, but the handler applies `normalizeActiveTier()` (index.ts:90) which collapses stored `pro` → `elite`. Updated the test assertion to `'elite'` (with an explanatory comment); the handler source is byte-identical. Same Pro→Elite reconciliation 01-01 applied to `tier-config.test.ts` — a test/source reconciliation, not a product change (allowed by D-01).
- **verify:baseline excludes promptfoo (D-09):** kept `test:adversarial` separate (real Anthropic cost).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created no-op `e2e/global-setup.ts` so the Playwright config resolves**
- **Found during:** Task 2 (Write playwright.config.ts)
- **Issue:** `npx playwright test --list` failed with `Cannot find module './e2e/global-setup.ts'` (MODULE_NOT_FOUND) because Playwright resolves `globalSetup` at config-load time, even for `--list`. The acceptance criterion requires `--list` to parse without a config-parse error, but the `e2e/` setup files are Plan 03's deliverable.
- **Fix:** Added a documented placeholder `e2e/global-setup.ts` exporting an empty `async function globalSetup()`. The body is intentionally empty; a header comment marks Plan 03 as the owner of the real Supabase service-role seed. No secrets, no product code.
- **Files modified:** `e2e/global-setup.ts` (new)
- **Verification:** `npx playwright test --list` → "Total: 0 tests in 0 files", no MODULE_NOT_FOUND / config-parse error (exit 1 is purely the empty-test-set signal, resolving when Plan 03 adds specs).
- **Committed in:** `f1e18c0` (Task 2 commit)

**2. [Rule 3 - Blocking] Reconciled stale `reset-subscription-merits` Pro→Elite assertion so `deno task test:ci` exits 0**
- **Found during:** Task 3 (run `deno task test:ci`)
- **Issue:** The new `test:ci` allowlist includes `reset-subscription-merits/index.test.ts` (it is in the canonical `run-edge-tests.ps1 $baseTests` set). Its `batch-due-users` test asserted `rpcCalls[0].args.p_tier === 'pro'`, but the handler applies `normalizeActiveTier(row.profiles.subscription_tier)` (index.ts:90), which collapses stored `pro` → `elite` (Pro is a legacy stored tier granted the Elite allowance). This is a pre-existing stale test (reproduced in isolation; not introduced by the task), but it blocked the acceptance criterion `deno task test:ci` exits 0 and `must_haves` truth #3 (offline allowlist green).
- **Fix:** Updated the single stale assertion (`'pro'` → `'elite'`) with an explanatory comment citing `normalizeActiveTier`. The `reset-subscription-merits/index.ts` source is byte-identical (test-only change). Identical Pro→Elite reconciliation class to 01-01's tier-config fix; allowed by D-01 as a test/source reconciliation, not a product behavior change.
- **Files modified:** `supabase/functions/reset-subscription-merits/index.test.ts`
- **Verification:** `deno task test:ci` → `284 passed | 0 failed`, exit 0; `npm run test:edge` → exit 0.
- **Committed in:** `e3356ee` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking)
**Impact on plan:** Both were necessary to satisfy the plan's own acceptance criteria (config must parse; offline deno set must be green). The global-setup stub respects Plan 03's ownership (no-op body); the test reconciliation changed no product/source code. No scope creep.

## Issues Encountered
- `npx playwright test --list` exits 1 on the empty test set ("No tests found"). This is the no-tests condition, **not** a config-parse error — the config loads and lists projects cleanly. It resolves automatically once Plan 03 adds the 3 specs. The acceptance criterion explicitly permits "no tests found."
- The `reset-subscription-merits` stale test was a pre-existing RED in the canonical offline set that 01-01's tier reconciliation did not cover; surfaced here because `test:ci` runs that file. Handled as a blocking reconciliation (see Deviation 2).

## User Setup Required
None for this plan's deliverables. (Plan 05 will require GitHub secrets — `SUPABASE_TEST_*`, `STRIPE_TEST_PUBLISHABLE_KEY`, `E2E_TEST_PASSWORD` — and the TEST project's `AI_TEST_MODE=true`; those are out of this plan's scope.)

## Next Phase Readiness
- **Plan 03 (E2E specs) unblocked:** `playwright.config.ts` + the `e2e/` dir + Chromium are in place; Plan 03 fills `e2e/global-setup.ts`, adds `e2e/auth.setup.ts` + the 3 spec files. `test:e2e`/`verify:baseline` will go fully green once those land.
- **Plan 05 (gate) unblocked:** `verify:baseline`, `test:edge`, and the single-source-of-truth `deno task test:ci` exist for the GitHub Action to call; the bash twin covers Linux CI.
- **Known:** `verify:baseline`'s vitest layer still carries the 7 pre-existing deterministic failures from `deferred-items.md` (out of scope here, inherited from 01-01) and `test:e2e` reports "no tests" until Plan 03 — both expected.

## Self-Check: PASSED

- FOUND: playwright.config.ts
- FOUND: e2e/global-setup.ts
- FOUND: scripts/run-edge-tests.sh
- FOUND: supabase/functions/deno.json (test:ci task)
- FOUND: .planning/phases/01-testing-strategy-regression-baseline/01-02-SUMMARY.md
- FOUND commit: afff508 (Task 1) / f1e18c0 (Task 2) / e3356ee (Task 3)

---
*Phase: 01-testing-strategy-regression-baseline*
*Completed: 2026-06-09*

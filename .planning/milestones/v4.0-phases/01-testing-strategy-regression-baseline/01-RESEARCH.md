# Phase 1: Testing Strategy & Regression Baseline - Research

**Researched:** 2026-06-09
**Domain:** Test infrastructure / regression safety net (vitest + deno + Playwright + promptfoo), CI gating, deterministic AI stubbing
**Confidence:** HIGH (verified against live repo files; web-verified for Playwright/Stripe externalities)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (verbatim from CONTEXT.md `## Implementation Decisions`)

**Regression Baseline Form (TEST-06 / NFR-01 — the spine)**
- **D-01:** The regression baseline **IS the full test suite passing green at a tagged pre-cleanup commit** (proposed tag: `v4.0-baseline`) — vitest + deno + promptfoo + Playwright. Later phases re-run the suite; any *new* red is a regression. Chosen over golden-master output snapshots (too brittle vs. non-deterministic AI text/timestamps) and over standalone contract/shape assertions (those are welcome as test content but not the baseline mechanism itself).
- **D-02:** **AI calls are stubbed at the boundary** with recorded fixtures — the baseline and E2E never call real Claude. Behavior under test = our own parse / merge / JSON-repair / tier-gating / routing / persistence logic, not Anthropic's wording. (Real-AI validation is intentionally NOT part of the per-phase gate.)

**Playwright E2E Boundary (TEST-04)**
- **D-03:** Playwright drives a **local dev/preview build** (e.g. `vite preview` on localhost:8080), not staging.
- **D-04:** External-dependency realism for the non-AI flows: **real Supabase test project** (genuine login, session refresh, persistence) + **real Stripe test mode** (test keys + test cards like `4242…`). Only **Anthropic is stubbed.**

**Coverage Targets & Merge-Gate Strictness (TEST-01 / NFR-01)**
- **D-05:** Coverage philosophy = **critical-path-required, global advisory.** REQUIRED: the 3 E2E flows + merit/tier-gating + auth + per-feature analyze contracts. Global line/branch % is **tracked and reported, not a hard blocker.**
- **D-06:** The zero-functional-change merge gate (NFR-01) is **BLOCKING.**
- **D-07:** **Flaky tests are quarantined, never used to weaken the gate.** TEST-02 `OutcomeOverdueBanner` fix is a hard prerequisite.

**CI Wiring Scope (Phase 1 ↔ Phase 5 boundary)**
- **D-08:** Phase 1 ships BOTH (a) a single runnable wrapper command (`npm run verify:baseline`) AND (b) a **blocking GitHub Action PR gate.** Phase 5 (TEST-08) owns the *full* CI/deploy-gating buildout.
- **D-09:** **Per-PR gate composition:** every PR runs **vitest + deno + Playwright** (3 flows, stubbed AI, `SUPABASE_TEST_*` / `STRIPE_TEST_*` secrets). **promptfoo runs scheduled or via a label — NOT every PR** (it calls real Anthropic, incurs cost).

### Claude's Discretion (verbatim)
Exact baseline tag name, the wrapper script name/shape, the Playwright project/dir layout, fixture-recording mechanism, and the GitHub Action YAML structure are left to research + planning, consistent with the decisions above.

### Deferred Ideas (OUT OF SCOPE — verbatim)
- **Full CI/deploy-gating buildout + deep coverage expansion** → Phase 5 (TEST-03/05/08).
- **Real-AI smoke run** — explicitly excluded from the per-phase gate (D-02).
- **Performance before/after measurement** (`scripts/validate-performance.mjs`) → Phase 9 (PERF-04).
- **Product behavior changes of any kind** (hard milestone constraint). Deep edge-function/tier-gating coverage expansion → Phase 5.
</user_constraints>

---

## Summary

This is a **brownfield testing-net** phase. The repo already has the three runner layers wired and substantial coverage: **81 frontend vitest files**, **106 deno edge-function test files**, and a **promptfoo adversarial config**. Phase 1 does NOT stand up a test culture from scratch — it (1) documents the strategy, (2) fixes the one deterministic-blocker (the `OutcomeOverdueBanner` unhandled-rejection), (3) adds the greenfield Playwright E2E layer for 3 flows, and (4) wraps everything in one `verify:baseline` command plus a blocking GitHub Action, then tags `v4.0-baseline`.

**The single most important finding:** the AI-stub mechanism that D-02 asks us to "research" **already exists and is production-grade**. `supabase/functions/_shared/anthropic.ts` reads `AI_TEST_MODE=true` and returns fully-formed recorded JSON fixtures (per-feature, keyed by `fixtureKey`, with deterministic hash-based score variation) from BOTH `invokeAnthropicText` and `streamAnthropicText`. Every analyze handler already passes a `fixtureKey`. The recommended approach is therefore **not to build a new stub** — it is to **deploy the existing edge functions to the Supabase TEST project with `AI_TEST_MODE=true` set as a function secret**, so the real Supabase + real Stripe paths run end-to-end while Anthropic is bypassed deterministically and at $0.

**Second critical finding (blocks the baseline tag):** the canonical deno suite is **currently RED**, not green. `_shared/tier-config.test.ts` has **3 pre-existing failures** (`getTimeout('pro','core')` returns `155000` but the test expects `125000`; `getTimeout('pro','elite-preview')` and the `pro+quiz` throw-case also fail) — a stale-test-vs-source drift, and `tier-config.test.ts` IS in the official `scripts/run-edge-tests.ps1` base set. Per D-01/D-07 the baseline must be **green** before it can be tagged, so reconciling this drift is a hard, in-scope prerequisite (it is a test/source mismatch, not a product behavior change — fixing the test or the impl to agree is allowed and required).

**Primary recommendation:** Reuse the existing `AI_TEST_MODE` seam (deploy to TEST project with the secret set); fix the `OutcomeOverdueBanner` flakiness at the *source component* (guard the async effect) plus add a reusable Supabase query-builder mock factory; reconcile the 3 `tier-config` failures; build Playwright against `vite preview` with a `playwright/global-setup.ts` that seeds the Supabase test user via the service-role key and saves storage state; for Stripe, drive the **embedded Payment Element** with the `4242` card via `frameLocator` (test-mode keys, accepting the documented anti-automation caveat — see Pitfall 4); orchestrate with `npm run verify:baseline`; gate with one new `.github/workflows/regression-gate.yml`.

---

## Standard Stack

### Core (already present — reuse, do not re-introduce)

| Tool | Version (in repo) | Purpose | Status |
|------|-------------------|---------|--------|
| vitest | `^4.1.6` | Frontend unit/integration (jsdom) | Wired — `vitest.config.ts`, 81 test files |
| @testing-library/react | `^14.3.1` | Component render/assert | Wired — `src/test-setup.ts` |
| Deno | `2.7.1` (local), `2.x` CI | Edge-function tests | Wired — `scripts/run-edge-tests.ps1`, 106 files |
| promptfoo | `0.120.13` | Adversarial / prompt-injection | Wired — `npm run test:adversarial` |
| @stripe/stripe-js + react-stripe-js | `^9.2.0` / `^6.2.0` | Embedded checkout (E2E target) | Present in `package.json` |
| @supabase/supabase-js | `^2.81.1` | Auth/session (E2E target) | Present |

### Supporting (greenfield — to add)

| Library | Recommended Version | Purpose | Notes |
|---------|---------------------|---------|-------|
| @playwright/test | `^1.50.x` (latest stable) | E2E runner for the 3 flows (D-04) | Add as devDependency. NOT yet present (verified). Use the **test runner**, not just the `playwright-cli` skill — the skill is for interactive/ad-hoc driving; the gate needs committed spec files + a config. |

**Installation:**
```bash
npm install -D @playwright/test
npx playwright install chromium   # browsers; CI uses the same. Chromium-only keeps CI fast.
```

> Note on the `playwright-cli` skill: `.claude/skills/playwright-cli/SKILL.md` exposes an interactive CLI (`playwright-cli open/goto/click/route/state-save…`) with Chromium/Chrome already installed. It is excellent for **authoring/debugging** the specs and for one-off network-route experiments, but the committed, CI-runnable gate must be `@playwright/test` spec files driven by `playwright.config.ts`. Treat the skill as the dev-loop tool and `@playwright/test` as the artifact.

### Alternatives Considered (and rejected for this phase)

| Instead of | Could Use | Why rejected |
|------------|-----------|--------------|
| `AI_TEST_MODE` env on deployed TEST functions | `supabase functions serve` locally with stubs | More moving parts in CI (local Deno serve + Vite preview + DB); the env-secret approach reuses the *exact* deployed code path, which is what the baseline must protect. |
| `AI_TEST_MODE` env | Playwright `page.route()` network interception of Anthropic | The frontend never calls Anthropic directly — edge functions do. Playwright cannot intercept server-side fetches. Network interception is wrong-layer here. |
| Embedded Payment Element with real `4242` (D-04) | Fully mocked Stripe | D-04 explicitly requires real Stripe test mode to prove the plumbing. Mocking is rejected by the user. (But see Pitfall 4 for the anti-automation caveat and the recommended robustness fallback.) |

---

## Architecture Patterns

### Recommended Project Structure (additions only — zero changes to product code dirs)

```
playwright.config.ts              # NEW — testDir: ./e2e, webServer: vite preview :8080
e2e/                              # NEW
├── global-setup.ts               #   seed Supabase test user (service-role), save storage state
├── fixtures/
│   ├── auth.setup.ts             #   login project → produces .auth/user.json storage state
│   └── test-resume.pdf           #   small fixture PDF for the resume flow
├── auth-session.spec.ts          #   Flow 1: login + reload → session persists
├── resume-analysis.spec.ts       #   Flow 2: upload → analyze (AI stubbed) → results render
└── stripe-checkout.spec.ts       #   Flow 3: embedded checkout with 4242 (test mode)
.auth/                            # NEW (gitignored) — Playwright storage state output
scripts/
├── verify-baseline.mjs           # NEW — orchestrator (or a package.json composite script)
└── run-edge-tests.sh             # NEW — cross-platform (bash) twin of run-edge-tests.ps1 for CI
.github/workflows/
└── regression-gate.yml           # NEW — blocking PR gate (vitest + deno + Playwright)
docs/ or .planning/
└── TESTING-STRATEGY.md           # NEW — the TEST-01 strategy doc (layers/ownership/coverage)
```

> `.gitignore` currently only contains `node_modules` (line 15). Add `.auth/`, `test-results/`, `playwright-report/`, `e2e/.cache/`. **Do not** `git add -f` and **never** modify tracked `.planning/` (CLAUDE.md hard rule). Per MEMORY: `.planning` is tracked — commit doc artifacts normally, stage specific files, never `-A`/`.`/`-f`.

### Pattern 1: AI-stub via the existing `AI_TEST_MODE` boundary seam (answers Research Q1)

**What:** `_shared/anthropic.ts` already short-circuits on `AI_TEST_MODE=true`, returning per-feature recorded JSON keyed by `params.fixtureKey` (`'analyze_resume' | 'analyze_career' | 'grade_linkedin' | 'recruiting_lens' | 'interview_prep' | 'ocr' | …`). It applies deterministic, content-hash-based score variation (`hashContent` → offset `-8..+8`) so results are stable per input but vary across resumes, and it correctly slices the 3-call parallel resume path (criteria-1 / criteria-2 / summary / rewrites) by sniffing the system prompt. The streaming twin `streamAnthropicText` emits the same fixture as chunks.

**When to use:** ALL of the baseline + E2E. This is the D-02 mechanism — it exists.

**How to wire it (recommendation):**
1. Create/confirm a dedicated **Supabase TEST project** (`SUPABASE_TEST_URL` / `SUPABASE_TEST_ANON_KEY` / `SUPABASE_TEST_SERVICE_ROLE_KEY` as GitHub secrets, D-09).
2. Deploy the edge functions to it with the secret set: `supabase secrets set AI_TEST_MODE=true` (TEST project only). Now every analyze call returns deterministic fixtures with **zero Anthropic spend** while the real DB writes/usage-tracking/tier-gating all execute for real.
3. Point the Vite preview build at the TEST project (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` = TEST project) and at Stripe test-mode publishable key (`VITE_STRIPE_PUBLISHABLE_KEY` = `pk_test_…`).
4. Playwright drives the preview; the resume flow exercises the real edge function → returns the stubbed analysis → real persistence → results page renders. Deterministic and $0.

```typescript
// Source: supabase/functions/_shared/anthropic.ts (lines 570-644, verified live)
// Already in repo — the seam to reuse, NOT to build:
if ((Deno.env.get('AI_TEST_MODE') || '').toLowerCase() === 'true') {
  const text = getMockFixtureText(params.fixtureKey);   // per-feature recorded JSON
  // ...deterministic hash variation + 3-call slicing for analyze_resume...
  return { ok: true, text, raw: { mock: true, fixtureKey: params.fixtureKey }, model: `mock:${params.fixtureKey}` };
}
```

> Bonus seams already present for negative-path testing: `AI_FORCE_FAILURE` (compound-gated with `AI_TEST_MODE`, returns 529 to exercise overload→queue fallback) and `MERIT_TEST_FORCE_REFUNDABLE_ERROR` (staging-host-gated refund fault injection). These let the baseline assert the failure/refund paths deterministically without touching product code.

### Pattern 2: Playwright auth/session seeding via global-setup + storage state (answers Research Q3)

**What:** Auth in this app is **email/password** (`supabase.auth.signInWithPassword`, verified in `src/pages/Auth.tsx:181`) with session persisted to `localStorage` (`persistSession: true, autoRefreshToken: true` in `src/lib/supabaseClient.ts`). Reproducible seeding pattern:

1. **`e2e/global-setup.ts`** (runs once): use the **service-role key** to create/ensure a deterministic test user in the Supabase TEST project (`supabase.auth.admin.createUser({ email, password, email_confirm: true })`; idempotent — ignore "already registered"). Seed any rows the flows need (e.g. a `profiles` row at the right tier).
2. **`auth.setup.ts` (a Playwright setup project)**: navigate to `/auth` on the preview, fill email+password, submit, wait for the dashboard, then `page.context().storageState({ path: '.auth/user.json' })`. The `playwright-cli` skill's `state-save auth.json` is the interactive equivalent for authoring.
3. The three spec files declare `test.use({ storageState: '.auth/user.json' })` so they start authenticated.
4. **Session-persistence flow** explicitly asserts: load `/dashboard`, `page.reload()`, confirm still authenticated (no redirect to `/auth`) — this is the genuine refresh/persistence proof D-04 wants.

**Why this shape:** storage-state reuse is the Playwright-canonical way to avoid logging in per-test (fast, deterministic); using the admin API for user creation makes the seed reproducible and self-healing across CI runs.

### Pattern 3: Cross-platform deno invocation via an explicit allowlist (answers Research Q2)

**What/why:** GitHub runners are Linux; `scripts/run-edge-tests.ps1` is PowerShell. The naive fix "`deno test ./supabase/functions`" is **wrong** here — directory recursion would collect tests that require a live Supabase (`_tests/test-04..06`, `interview-prep-analyze/__tests__/analyze.*`, `create-payment-intent/index.test.ts`, `usage-checker.test.ts`, the `history-persistence` files) and they would **fail or hang** in CI without staging secrets.

The correct approach mirrors what `run-edge-tests.ps1` already does: **run an explicit allowlist of the offline/pure tests** with `DENO_TEST_SUPABASE_REMOTE=0`. The `history-persistence*` files self-skip cleanly via the `skipRemote()` helper (`_shared/__tests__/history-persistence-remote.ts`), but the `_tests/test-0X` and `interview-prep-analyze/__tests__/analyze.*` files read `SUPABASE_URL`/`SERVICE_KEY` directly **without** a clean skip guard — so they must be excluded from the CI list, exactly as the PowerShell script excludes them today.

**Recommended:** add `scripts/run-edge-tests.sh` (bash) as the cross-platform twin, sharing the same explicit file list as the `.ps1` base set, OR (cleaner) define the canonical list once in `supabase/functions/deno.json` `tasks` and call `deno task test:ci` from both. The existing `deno.json` already has a (too-small) `"test"` task — extend it:

```jsonc
// supabase/functions/deno.json — replace the existing minimal "test" task
{
  "lock": false,
  "tasks": {
    // CI/offline set — mirrors run-edge-tests.ps1 $baseTests (pure, no live Supabase).
    "test:ci": "deno test --allow-all --no-check <explicit list of the ~40 offline files>"
  }
}
```
Then CI runs `cd supabase/functions && DENO_TEST_SUPABASE_REMOTE=0 deno task test:ci`. Cross-platform, single source of truth, and `run-edge-tests.ps1` can be refactored to call the same task (or kept as the Windows convenience wrapper).

**The 5 vitest-excluded files** (mapped — these are the deno-only `_shared/__tests__/*` that use `https://deno.land` imports and must run under deno, not vitest):
- `supabase/functions/_shared/__tests__/archive-reader.test.ts`
- `supabase/functions/_shared/__tests__/interview-prep-prompts.contract.test.ts`
- `supabase/functions/_shared/__tests__/interview-prep-validation.test.ts`
- `supabase/functions/_shared/__tests__/merit-gateway-already-refunded.test.ts`
- `supabase/functions/_shared/__tests__/tier-prompts.interview-prepend.test.ts`

(Note: `vitest.config.ts` `include` is `supabase/functions/_shared/__tests__/*.test.ts`; the `exclude` list carves out exactly those 5 deno-only files so vitest doesn't choke on `deno.land` imports. The CI deno command must therefore COVER those 5 — they are part of the offline set.)

### Anti-Patterns to Avoid
- **`deno test ./` directory recursion in CI** — collects live-Supabase tests that fail without staging secrets (see Pattern 3).
- **Weakening the gate to absorb flakiness** — D-07 forbids it. Quarantine, don't `.skip` silently or `continue-on-error`.
- **Building a new AI mock** — the `AI_TEST_MODE` seam already exists; a parallel mechanism is duplicated surface to maintain.
- **Tagging `v4.0-baseline` while any suite is red** — D-01 says the baseline IS green; tagging red poisons every downstream phase's gate.
- **Playwright intercepting Anthropic** — wrong layer; the edge function makes that call server-side.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deterministic AI responses | A new fixture/mock framework | Existing `AI_TEST_MODE` in `_shared/anthropic.ts` | Already per-feature, deterministic, stream-aware, handles the 3-call slicing. Verified live. |
| E2E login per test | Repeated UI login in every spec | Playwright **storage state** + a `setup` project | Canonical; fast; deterministic. `playwright-cli state-save` for authoring. |
| Test user creation | Manual seeding | `supabase.auth.admin.createUser` (service-role) in `global-setup.ts` | Idempotent, reproducible, self-healing across CI. |
| Skipping remote deno tests | Hand-rolled env checks per file | Existing `skipRemote()` helper | Already wired for `history-persistence*`; reuse its pattern for any new remote test. |
| Stripe test payment | A custom payment simulator | Stripe test-mode keys + `4242` card via `frameLocator` | D-04 mandates real test mode (but read Pitfall 4). |
| Cross-platform test list | Two divergent lists (`.ps1` + `.sh`) | One `deno.json` `task` both call | Single source of truth; avoids drift. |

**Key insight:** This phase is ~70% *reuse and document*, ~30% *new (Playwright + wrapper + CI YAML)*. The biggest risk is re-building seams that already exist (AI stub) instead of finding them.

---

## Common Pitfalls

### Pitfall 1: The baseline is currently RED — `tier-config.test.ts` (BLOCKS the tag)
**What goes wrong:** `_shared/tier-config.test.ts` has **3 failing tests** right now (verified by running it): `getTimeout('pro','core')` returns `155000` but the test expects `125000`; `getTimeout('pro','elite-preview')` throws instead of returning `65000`; and the `pro+quiz` throw-case fails. The live `TIER_TIMEOUTS.pro` does not match what the test asserts — a stale-test-vs-source drift. This file IS in `run-edge-tests.ps1`'s base set, so the canonical edge suite is red.
**Why it happens:** the `tier-config.ts` source was changed in a later quick-task/phase and the test was not updated (or vice-versa).
**How to avoid:** Phase 1 MUST reconcile this before tagging `v4.0-baseline`. Determine which side is correct against the *deployed production behavior* (the timeouts that are actually live), then fix the wrong side. This is a **test/source mismatch, not a product behavior change** — correcting it is in-scope and required by D-01 ("baseline IS the suite passing green"). Document the resolution in the strategy doc.
**Warning signs:** `npm run verify:baseline` red on a clean checkout before any cleanup work.

### Pitfall 2: `OutcomeOverdueBanner` flakiness is an UNHANDLED PROMISE REJECTION, not a single missing `.lt` (answers Research Q4)
**What goes wrong:** `src/components/applications/OutcomeOverdueBanner.tsx` runs an async query inside `useEffect` (`supabase.auth.getUser()` then `.from('applications').select('id, outcomes(id)').eq().lt()`) and calls `setOverdueCount` after the await. When a test that transitively mounts the banner provides a Supabase mock whose `from().select().eq()` chain lacks `.lt`, the chain throws **inside the async IIFE** → an **unhandled promise rejection** that escapes React and crashes whichever vitest worker files happen to run concurrently. Because vitest's default pool runs files in parallel, the *set* of casualties changes run-to-run (MEMORY note: `Dashboard.test.tsx`, `req-coverage.test.ts`, `LinkedInGrader.*`, `RecruitingLens.*`, `BlurredLockCard.test.tsx`).
**Nuance (verified):** `Dashboard.test.tsx` (the only file that directly imports `Dashboard`) ALREADY has `.lt` in its mock (line 60) — so it is no longer the trigger. The residual non-determinism comes from (a) any OTHER incomplete-mock file whose rejection bleeds across workers, and (b) the banner's own unguarded async effect having no error boundary. **20 test files** mock `supabase.from().select().eq()` and most have **zero `.lt` mocks** (e.g. `PricingTable.test.tsx`, `usePaywallGuard.test.tsx`, the `interviewPrep` suites) — but they only bite if they transitively render the banner OR if a cross-worker rejection lands on them.
**How to avoid (two-part fix, fix at the source per D-07):**
1. **Component-level guard (the real TEST-02 fix):** wrap the banner's effect query in a `try/catch` so a malformed/failed query becomes a benign no-op (`setOverdueCount(0)` / early return) instead of an unhandled rejection. This makes the component robust and kills the cross-worker crash at the source — and it is a *defensive* change, arguably zero functional change (the banner already self-hides on error: `if (error || !data || cancelled) return;` handles the *resolved-error* case, but NOT a *thrown* chain).
2. **Reusable test mock factory:** add `src/test/supabaseMock.ts` exporting a complete query-builder mock (chainable `select/eq/lt/order/limit/maybeSingle/single` all resolving to `{ data: [], error: null }`) and refactor the incomplete mocks to use it. Prevents recurrence and is the "audit other incomplete Supabase query-builder mocks" action the MEMORY note calls for.
3. **Belt-and-suspenders:** consider `process.on('unhandledRejection')` surfacing in `src/test-setup.ts` so any future escaped rejection fails its OWN test loudly rather than silently crashing a neighbor (do NOT set `dangerouslyIgnoreUnhandledErrors` — that would *weaken* the gate, violating D-07).
**Warning signs:** `npm test` produces a *different* set of ~6 failures each run.

### Pitfall 3: Documented quarantine pattern that does NOT weaken the gate (D-07)
**What goes wrong:** the easy "fix" for residual flakiness is `it.skip`/`continue-on-error`, which silently erodes the blocking gate.
**How to avoid:** define a **named, visible, time-boxed** quarantine: tag flaky tests `it.skip` ONLY with a `// QUARANTINE(#issue, owner, date): <reason>` comment and a tracking row in `TESTING-STRATEGY.md` (a "Quarantine register"). Quarantined tests still RUN in a separate non-blocking `npm run test:quarantine` lane so they're visible, but they don't block merge. The gate (`verify:baseline`) excludes only the registered quarantine set, and the register requires an owner + expiry. This keeps the BLOCKING gate (D-06) trustworthy while honoring D-07's "never weaken." Crucially: `OutcomeOverdueBanner` is fixed at source, NOT quarantined — quarantine is for *residual unknown* flakiness only.

### Pitfall 4: Stripe's embedded checkout has anti-automation protections (affects Research Q3, D-04)
**What goes wrong:** Stripe **officially documents** (docs.stripe.com/automated-testing, verified 2026-06) that "frontend interfaces, like Stripe Checkout or the Payment Element, have security measures in place that prevent automated testing." Filling the card iframe with Playwright works *most* of the time in test mode but can be flaky/blocked, and 3DS adds nested iframes. This directly tensions with D-04's "real Stripe test mode + 4242 card" and D-06's BLOCKING gate.
**How to avoid (recommended resolution):**
- This app uses the **Embedded Payment Element** (`@stripe/react-stripe-js` `EmbeddedCheckout`, `ui_mode: 'embedded'`, `clientSecret` from `create-checkout-session` — verified in `StripeCheckoutWrapper.tsx` + `useStripeCheckout.ts`). The E2E should assert **our** plumbing: (1) `create-checkout-session` returns a valid `clientSecret` (real test-mode call), (2) the `EmbeddedCheckout` iframe **mounts/renders**, and (3) the post-checkout reconciliation (`Dashboard ?checkout=complete` → `reconcileTierUpgrade`, already tested in `Dashboard.test.tsx`) fires. These prove the integration without depending on Stripe's anti-bot-protected card submission.
- For the full card-submission happy path, attempt `frameLocator('iframe[name^="__privateStripeFrame"]').getByPlaceholder('Card number').fill('4242…')`; if it proves flaky in CI, **quarantine the card-submit assertion** (Pitfall 3) and keep the clientSecret + iframe-mount + reconciliation assertions in the blocking gate. The most robust, fully-deterministic completion signal is to drive the tier upgrade via the **`stripe-webhook` test event** (the function is already unit-tested) and assert the DB/UI reflects it — but webhook-driven completion is arguably Phase 5 depth; for Phase 1, the clientSecret+mount+reconcile assertions satisfy "Stripe checkout in test mode" green.
**Warning signs:** intermittent "element not found"/timeout inside the Stripe iframe in CI but not locally.

### Pitfall 5: Playwright `webServer` must build first; preview ≠ dev
**What goes wrong:** D-03 says `vite preview` (production build on :8080). `vite preview` requires `npm run build` to have produced `dist/` first, and reads `VITE_*` at **build time** — so the TEST-project env must be set *before* the build, not at preview time.
**How to avoid:** in `playwright.config.ts` set `webServer: { command: 'npm run build && npm run preview', url: 'http://localhost:8080', reuseExistingServer: !process.env.CI }`. In CI, inject `VITE_SUPABASE_URL=$SUPABASE_TEST_URL`, `VITE_SUPABASE_ANON_KEY=$SUPABASE_TEST_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY=$STRIPE_TEST_PUBLISHABLE_KEY` into the build step's env. Note: `vite.config.ts` `server.port` is 8080 but `preview` defaults to 4173 unless configured — add `preview: { port: 8080 }` to `vite.config.ts` OR target the preview default port; pick one and pin it in `playwright.config.ts`.

### Pitfall 6: The deno suite has more files than the runner runs
**What goes wrong:** 106 `.test.ts` files exist but `run-edge-tests.ps1` lists only ~40. The rest are remote/live-Supabase (history-persistence, `_tests/test-0X`, interview-prep analyze integration). If the planner naively "runs all deno tests" the gate hangs/fails.
**How to avoid:** the CI deno command = the explicit offline allowlist only (Pattern 3). The remote suite stays behind `DENO_TEST_SUPABASE_REMOTE=1` and is NOT part of the per-PR gate (consistent with D-09's cost/noise balance and the Phase-5 deferral).

---

## Code Examples

### `playwright.config.ts` (verified shape against `@playwright/test` current API)
```typescript
// Source: Playwright docs (current) + repo specifics (vite preview :8080, D-03)
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,   // 1 retry masks NO real flakiness if specs are deterministic; keep low
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:8080', trace: 'on-first-retry' },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'chromium', dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' } },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

### `e2e/global-setup.ts` — reproducible Supabase test user (service-role)
```typescript
// Source: @supabase/supabase-js admin API (current) + repo auth (signInWithPassword)
import { createClient } from '@supabase/supabase-js';

export default async function globalSetup() {
  const admin = createClient(
    process.env.SUPABASE_TEST_URL!,
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!,   // service-role — NEVER ship to the browser
    { auth: { persistSession: false } },
  );
  const email = 'e2e+baseline@strivo.test';
  const password = process.env.E2E_TEST_PASSWORD!;
  // Idempotent: ignore "already registered"
  await admin.auth.admin.createUser({ email, password, email_confirm: true })
    .catch(() => { /* user exists — fine */ });
  // Seed profile/tier rows the flows need here, if any.
}
```

### `npm run verify:baseline` orchestrator (composite script — the D-08 single command)
```jsonc
// package.json "scripts" additions (promptfoo intentionally NOT in verify:baseline per D-09)
{
  "test": "vitest run",
  "test:edge": "cd supabase/functions && cross-env DENO_TEST_SUPABASE_REMOTE=0 deno task test:ci",
  "test:e2e": "playwright test",
  "verify:baseline": "npm run test && npm run test:edge && npm run test:e2e",
  "test:quarantine": "vitest run --dir src/test/quarantine",   // non-blocking visibility lane
  "test:adversarial": "promptfoo eval --config supabase/functions/interview-prep-analyze/__tests__/fixtures/injection/promptfooconfig.yaml"
}
```
> `verify:baseline` runs vitest + deno + Playwright (the D-09 per-PR set). promptfoo stays a separate `test:adversarial` invoked on schedule/label (it hits real Anthropic — cost). Use `&&` (fail-fast) so a red layer stops the chain; or `npm-run-all`/a small `scripts/verify-baseline.mjs` if you want all-layers-then-summary. On Windows, prefer the `.mjs` orchestrator or `cross-env` to keep env-setting portable.

### `.github/workflows/regression-gate.yml` (sits beside the two `vercel-*.yml`)
```yaml
# Source: existing vercel-preview.yml structure + Playwright/Deno CI docs
name: Regression Gate
on:
  pull_request:
    branches: [main, staging]
  workflow_dispatch:
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run test                       # vitest (deterministic after Pitfall 2 fix)
      - uses: denoland/setup-deno@v2
        with: { deno-version: v2.x }
      - run: cd supabase/functions && deno task test:ci   # offline allowlist, no live Supabase
        env: { DENO_TEST_SUPABASE_REMOTE: '0' }
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e                    # 3 flows; AI stubbed via TEST-project AI_TEST_MODE
        env:
          SUPABASE_TEST_URL: ${{ secrets.SUPABASE_TEST_URL }}
          SUPABASE_TEST_ANON_KEY: ${{ secrets.SUPABASE_TEST_ANON_KEY }}
          SUPABASE_TEST_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_TEST_SERVICE_ROLE_KEY }}
          STRIPE_TEST_PUBLISHABLE_KEY: ${{ secrets.STRIPE_TEST_PUBLISHABLE_KEY }}
          E2E_TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}
      - if: failure()
        uses: actions/upload-artifact@v4
        with: { name: playwright-report, path: playwright-report/ }
# Blocking (D-06): mark this check Required in branch protection for main/staging.
```
> The "blocking" teeth come from **GitHub branch-protection "Required status checks"** pointing at this job — the YAML alone isn't blocking. Phase 1 must (a) ship the workflow AND (b) document/enable the required-check setting (operator action; document it in the strategy doc).

### Baseline tag mechanism (D-01)
```bash
# After the suite is GREEN (Pitfall 1 resolved):
git tag -a v4.0-baseline -m "v4.0 regression baseline: full suite green pre-cleanup"
git push origin v4.0-baseline
# Later phases re-run `npm run verify:baseline`; the tag is the anchor for
# `git diff v4.0-baseline` behavior comparison and re-running the recorded suite.
```

---

## State of the Art

| Old (stale map says) | Current reality (verified) | Impact |
|----------------------|----------------------------|--------|
| "No frontend test framework / zero tests in src/" (`.planning/codebase/TESTING.md`, 2026-04-11) | **vitest wired, 81 FE test files**; **106 deno test files**; promptfoo config present | The TESTING.md map is FALSE/stale — do not consume it. Strategy doc supersedes it. |
| AI stub "to be researched" | `AI_TEST_MODE` seam fully built in `anthropic.ts` (both invoke + stream, per-feature fixtures, 3-call slicing) | D-02 is a *reuse*, not a *build*. |
| Edge suite assumed green | `tier-config.test.ts` has 3 live failures | Baseline tag is BLOCKED until reconciled (Pitfall 1). |
| `@playwright/test` maybe present | Absent from `package.json` (verified) | Greenfield install; Chromium available via `playwright-cli` skill. |

**Deprecated/outdated:** `.planning/codebase/TESTING.md` — treat as historical. The `deno.json` `"test"` task (only 4 files) is too small to be the CI command — extend it.

---

## Open Questions

1. **Which side of the `tier-config` drift is correct?**
   - Known: `getTimeout('pro','core')` returns `155000`; test wants `125000`. Source `TIER_TIMEOUTS.pro` and the test disagree.
   - Unclear: which value reflects deployed production behavior.
   - Recommendation: planner adds a task to verify against the live/deployed timeout config (or the originating quick-task), fix the stale side, document it. Must resolve before the tag (D-01).

2. **Does a Supabase TEST project already exist, or must Phase 1 provision it?**
   - Known: staging project ref `cimjltzovkahkqecpwgi` exists (hardcoded in `anthropic.ts`); D-09 references `SUPABASE_TEST_*` secrets.
   - Unclear: whether "TEST" = staging or a separate dedicated project.
   - Recommendation: prefer a **dedicated, disposable TEST project** with `AI_TEST_MODE=true` so E2E data churn never touches staging; if cost-prohibitive, reuse staging with a dedicated test user namespace. Planner should make this an explicit early task (it's a prerequisite for the E2E gate).

3. **Stripe card-submission in the blocking gate — include or quarantine?**
   - Known: Stripe documents anti-automation on the Payment Element (Pitfall 4); D-04 wants real test mode; D-06 wants blocking.
   - Recommendation: blocking gate asserts clientSecret + iframe-mount + post-checkout reconciliation (robust); card-submit happy-path attempted but quarantine-eligible if CI-flaky. Confirm with operator that "checkout green" = integration-proven, not necessarily Stripe's own card form automated.

4. **Where does `TESTING-STRATEGY.md` live and does it update CLAUDE.md?**
   - Known: NFR-03 (Phase 7) owns doc updates broadly; this phase produces the strategy doc (TEST-01).
   - Recommendation: write `TESTING-STRATEGY.md` at repo root or `docs/`; add a pointer from CLAUDE.md's testing section. The deeper CLAUDE.md/README reconciliation is Phase 7 (NFR-03) — Phase 1 just lands the strategy artifact + the quarantine register.

---

## Validation Architecture

Observable, assertable checkpoints this phase introduces (drives Nyquist validation — each is a place a downstream phase's regression would show up):

| Validation Point | Signal | How to observe | Determinism source |
|------------------|--------|----------------|--------------------|
| **vitest green** | exit 0, stable failure set = ∅ | `npm test` | Pitfall-2 fix removes the cross-worker rejection |
| **deno offline suite green** | exit 0 | `deno task test:ci` (`DENO_TEST_SUPABASE_REMOTE=0`) | explicit allowlist; remote tests excluded/self-skip |
| **E2E Flow 1 (auth/session)** | dashboard reachable after reload, no `/auth` redirect | Playwright assertion | seeded test user + storage state |
| **E2E Flow 2 (resume analysis)** | results page renders a stubbed-but-shaped analysis | Playwright assertion on score/section presence | `AI_TEST_MODE` fixture (deterministic per-input hash) |
| **E2E Flow 3 (Stripe checkout)** | `clientSecret` returned + `EmbeddedCheckout` iframe mounts + reconcile fires | Playwright + network assertion | real Stripe test mode; reconcile already unit-tested |
| **promptfoo adversarial clean** | all injection fixtures PASS the 4 assertions | `npm run test:adversarial` (scheduled/label) | deployed endpoint contract (real Anthropic — off the PR gate) |
| **Blocking gate** | required check red ⇒ no merge | GitHub branch protection + `regression-gate.yml` | D-06 teeth via Required status check |
| **Baseline anchor** | `git diff v4.0-baseline` + re-run reports pass/fail | tag `v4.0-baseline` + `verify:baseline` | the green suite at the tagged commit |

**Nyquist note:** the cheapest, highest-signal sampling point for every later cleanup/refactor phase is `npm run verify:baseline` (vitest + deno-offline + Playwright). It is the single gate that catches behavior drift at the parse/merge/route/persist/tier-gate layer without AI nondeterminism. promptfoo is the lower-frequency (scheduled) adversarial sample.

---

## Sources

### Primary (HIGH confidence — verified against live repo)
- `supabase/functions/_shared/anthropic.ts` — `AI_TEST_MODE` seam, per-feature fixtures, 3-call slicing, `AI_FORCE_FAILURE`, `MERIT_TEST_FORCE_REFUNDABLE_ERROR` (read in full).
- `vitest.config.ts` — include/exclude, the 5 deno-only excludes, default pool (no isolation overrides).
- `scripts/run-edge-tests.ps1` — the authoritative offline deno allowlist + remote/tier-validation gating.
- `supabase/functions/_shared/__tests__/history-persistence-remote.ts` — `skipRemote()` helper (remote self-skip).
- `supabase/functions/deno.json` — existing (too-small) `test` task.
- `src/components/applications/OutcomeOverdueBanner.tsx` + `src/pages/Dashboard.test.tsx` — flakiness root cause (unguarded async effect; Dashboard mock already has `.lt`).
- `src/lib/supabaseClient.ts`, `src/pages/Auth.tsx`, `src/hooks/useStripeCheckout.ts`, `src/components/StripeCheckoutWrapper.tsx` — auth = password; checkout = embedded `ui_mode` + `clientSecret`.
- `.github/workflows/vercel-preview.yml` / `vercel-production-manual.yml` — CI integration shape.
- `.claude/skills/playwright-cli/SKILL.md` — interactive Playwright driver (authoring/debug tool).
- **Live test run** (this session): `deno test _shared/tier-config.test.ts` → 3 failures (`pro` timeouts) — the RED-baseline finding.
- `package.json` — `@playwright/test` absent; Stripe libs present; promptfoo `0.120.13`.

### Secondary (MEDIUM — web-verified for externalities)
- Stripe official "Automated testing" docs — frontend Checkout/Payment Element have anti-automation protections; recommend simulating/mocking for the card form. (https://docs.stripe.com/automated-testing)
- Playwright + Stripe iframe community guidance — `frameLocator`, `__privateStripeFrame`, 4242 test card, 3DS nested-iframe caveats. (DEV.to "Playwright E2E … Stripe Checkout"; testrig.medium.com iframe guide)

### Tertiary (LOW — flagged)
- General "best practices" search hits for Playwright fixtures/storage-state — corroborated by Playwright's own canonical patterns; used only for shape, not specifics.

---

## Metadata

**Confidence breakdown:**
- AI-stub mechanism (Q1): **HIGH** — the seam is in the repo and read line-by-line.
- Cross-platform deno (Q2): **HIGH** — verified the offline/remote split, `skipRemote`, the 5 excludes, and ran the suite.
- Flaky-test diagnosis (Q4): **HIGH** — root cause (unhandled rejection from unguarded async effect) confirmed against component + 20 mock files; corrected the MEMORY note's "just add `.lt`" simplification (Dashboard already has it).
- Playwright fixtures (Q3): **MEDIUM-HIGH** — auth/checkout mechanisms verified in repo; Playwright config shape is current-API standard; Stripe card-form automation carries the documented anti-automation caveat (Pitfall 4).
- Baseline RED finding (Pitfall 1): **HIGH** — reproduced live.

**Research date:** 2026-06-09
**Valid until:** ~2026-07-09 (stable repo internals; re-verify `@playwright/test` latest stable and the `tier-config` drift status at plan time — the drift may be touched by other work).

---

## RESEARCH COMPLETE

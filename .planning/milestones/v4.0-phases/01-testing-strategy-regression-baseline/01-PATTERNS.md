# Phase 1: Testing Strategy & Regression Baseline - Pattern Map

**Mapped:** 2026-06-09
**Files analyzed:** 12 (3 greenfield E2E, 1 CI workflow, 2 config/script edits, 3 test-determinism fixes, 1 strategy doc, 2 read-first reference seams)
**Analogs found:** 9 / 12 (3 greenfield with partial/role-only analogs)

> **Brownfield note:** This phase is ~70% reuse-and-document, ~30% net-new (Playwright + wrapper + CI YAML). The biggest executor risk is *re-building seams that already exist* (the AI stub) instead of finding them. The `AI_TEST_MODE` seam in `anthropic.ts` and the offline deno allowlist in `run-edge-tests.ps1` are both already production-grade — map to them, do not reinvent.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `playwright.config.ts` (NEW) | config | request-response (E2E driver) | `vitest.config.ts` | role-match (config shape only) |
| `e2e/global-setup.ts` (NEW) | test (seeding) | CRUD (admin user seed) | `e2e/global-setup.ts` block in RESEARCH §Code Examples + `src/pages/Auth.tsx` (auth shape) | role-match |
| `e2e/auth.setup.ts` (NEW) | test (auth fixture) | request-response | `src/pages/Auth.tsx` (signInWithPassword) | role-match |
| `e2e/auth-session.spec.ts` (NEW) | test (E2E) | request-response | none in-repo (greenfield) — RESEARCH Validation Architecture | no analog |
| `e2e/resume-analysis.spec.ts` (NEW) | test (E2E) | streaming → CRUD | none in-repo (greenfield) — uses `AI_TEST_MODE` seam | no analog |
| `e2e/stripe-checkout.spec.ts` (NEW) | test (E2E) | request-response | `src/hooks/useStripeCheckout.ts` + `Dashboard.test.tsx` reconcile | role-match (flow shape) |
| `.github/workflows/regression-gate.yml` (NEW) | config (CI) | event-driven (PR trigger) | `.github/workflows/vercel-preview.yml` | role-match |
| `package.json` `verify:baseline` + lanes (MODIFIED) | config | batch (orchestration) | existing `scripts` block (`test`, `test:adversarial`) | exact (extend in place) |
| `supabase/functions/deno.json` `test:ci` task (MODIFIED) | config | batch | existing `test` task (line 4) + `run-edge-tests.ps1` allowlist | exact (extend in place) |
| `scripts/run-edge-tests.sh` (NEW, optional twin) | utility | batch | `scripts/run-edge-tests.ps1` | exact (port to bash) |
| `src/components/applications/OutcomeOverdueBanner.tsx` (MODIFIED) | component | CRUD (async effect) | `ReportOutcomeDialog.tsx` / `AddApplicationDialog.tsx` try/catch | role+flow match |
| `src/test/supabaseMock.ts` (NEW factory) | utility (test) | CRUD (query-builder mock) | `Dashboard.test.tsx` lines 55-69 (complete chain) | exact (extract from analog) |
| `src/test-setup.ts` (MODIFIED) | config (test) | event-driven | itself (line 1 — is its own analog) | self |
| `supabase/functions/_shared/tier-config.test.ts` (MODIFIED if RED) | test | — | itself + `tier-config.ts` source | self (reconcile) |
| `.../injection/promptfooconfig.yaml` (EXTEND) | test (adversarial) | request-response | itself (existing config) | self (extend) |

**Read-first reference seams (NOT files to create):**
- `supabase/functions/_shared/anthropic.ts` lines 560-644 — the `AI_TEST_MODE` AI-stub boundary the E2E relies on.
- `scripts/run-edge-tests.ps1` lines 27-63 — the authoritative offline deno allowlist the CI deno task must mirror.

---

## Pattern Assignments

### `playwright.config.ts` (config, E2E driver) — GREENFIELD

**Analog:** `vitest.config.ts` (config *shape* — `defineConfig`, `@` alias resolution, env-aware setup). No Playwright config exists in-repo; RESEARCH §Code Examples gives the verified target shape.

**Config-shape pattern to mirror** (`vitest.config.ts` lines 1-26): top-level `defineConfig({...})` default export, `path.resolve(__dirname, './src')` alias, a `setupFiles` analog (here `globalSetup`), and an explicit include/exclude analog (here `testDir` + `projects`).

**Build the config from RESEARCH §Code Examples** (verified `@playwright/test` current API), with these repo-specific pins:
- `testDir: './e2e'`, `globalSetup: './e2e/global-setup.ts'`.
- `use.baseURL: 'http://localhost:8080'`.
- `webServer.command: 'npm run build && npm run preview'` — **`vite preview` requires a prior `npm run build`** (Pitfall 5) and reads `VITE_*` at build time.
- **Port pin (Pitfall 5):** `vite.config.ts` `server.port` is 8080 but `vite preview` defaults to 4173. Add `preview: { port: 8080 }` to `vite.config.ts` OR target 4173 in `playwright.config.ts` — pick one and pin both ends.
- `projects`: a `setup` project (`testMatch: /auth\.setup\.ts/`) and a `chromium` project (`dependencies: ['setup']`, `storageState: '.auth/user.json'`).
- `retries: process.env.CI ? 1 : 0` — keep low; specs must be deterministic, not retry-masked (D-07).

---

### `e2e/global-setup.ts` (test seeding, CRUD) — GREENFIELD

**Analog:** RESEARCH §Code Examples `global-setup.ts` block + `src/pages/Auth.tsx` (the auth mechanism this seeds for).

**Auth mechanism to seed for** (`src/pages/Auth.tsx` lines 180-184) — app uses **email/password**, so the seed must create a password user:
```typescript
const { error } = await supabase.auth.signInWithPassword({ email, password });
```

**Seeding pattern (service-role admin API, idempotent):**
```typescript
import { createClient } from '@supabase/supabase-js';
export default async function globalSetup() {
  const admin = createClient(
    process.env.SUPABASE_TEST_URL!,
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!,   // service-role — NEVER ship to browser
    { auth: { persistSession: false } },
  );
  const email = 'e2e+baseline@strivo.test';
  const password = process.env.E2E_TEST_PASSWORD!;
  await admin.auth.admin.createUser({ email, password, email_confirm: true })
    .catch(() => { /* already registered — idempotent, fine */ });
  // Seed any profiles/tier rows the 3 flows require here.
}
```

**Client init reference** (`src/lib/supabaseClient.ts` lines 14-20) — session persistence is `persistSession: true, autoRefreshToken: true`; the auth-session spec leans on exactly this localStorage persistence.

---

### `e2e/auth.setup.ts` + `e2e/auth-session.spec.ts` (test, request-response) — GREENFIELD

**Analog:** `src/pages/Auth.tsx` (login form selectors/flow). No E2E analog exists; pattern from RESEARCH §Pattern 2.

**Setup project pattern:** navigate `/auth`, fill email+password, submit, wait for `/dashboard`, then `await page.context().storageState({ path: '.auth/user.json' })`. The `playwright-cli state-save auth.json` skill command is the interactive authoring equivalent.

**Session-persistence assertion (the D-04 proof):** load `/dashboard` → `page.reload()` → assert still authenticated (no redirect to `/auth`). This exercises the real `autoRefreshToken`/`persistSession` path in `supabaseClient.ts`.

---

### `e2e/resume-analysis.spec.ts` (test, streaming → CRUD) — GREENFIELD

**Analog:** none in-repo for the spec itself. The behavior boundary it leans on is the **`AI_TEST_MODE` seam** — read-first, do NOT mock separately.

**The seam to rely on** (`supabase/functions/_shared/anthropic.ts` lines 570-644 — already in repo, do not rebuild):
```typescript
if ((Deno.env.get('AI_TEST_MODE') || '').toLowerCase() === 'true') {
  const text = getMockFixtureText(params.fixtureKey);   // per-feature recorded JSON
  // deterministic hash-based score variation (offset -8..+8) + 3-call slicing for analyze_resume
  return { ok: true, text, raw: { mock: true, fixtureKey: params.fixtureKey }, model: `mock:${params.fixtureKey}` };
}
```
- Wiring (RESEARCH §Pattern 1): deploy edge functions to the **TEST Supabase project** with `supabase secrets set AI_TEST_MODE=true`. Real DB writes / usage-tracking / tier-gating execute; Anthropic is bypassed deterministically at $0.
- Spec asserts: upload → analyze → results page renders a *shaped* analysis (score present, sections present). Determinism source = the per-input hash, so assert on *presence/shape*, not exact AI wording.
- Bonus negative-path seams already present (lines 560-568): `AI_FORCE_FAILURE` (returns 529 to exercise overload→queue fallback, compound-gated with `AI_TEST_MODE`); `MERIT_TEST_FORCE_REFUNDABLE_ERROR` for refund-path assertions.

---

### `e2e/stripe-checkout.spec.ts` (test, request-response) — GREENFIELD (flow analog exists)

**Analog:** `src/hooks/useStripeCheckout.ts` (the clientSecret round-trip) + `Dashboard.test.tsx` (post-checkout reconcile contract).

**clientSecret round-trip to assert** (`useStripeCheckout.ts` lines 30-42) — embedded `ui_mode`, real test-mode call:
```typescript
const { data, error } = await supabase.functions.invoke('create-checkout-session', {
  body: { ...params, ui_mode: 'embedded' },
});
// ...
return data?.clientSecret ?? null;
```

**Robust (blocking-gate) assertions** — prove OUR plumbing, sidestepping Stripe's anti-automation (Pitfall 4):
1. `create-checkout-session` returns a valid `clientSecret` (real test-mode).
2. The `EmbeddedCheckout` iframe mounts/renders.
3. Post-checkout reconcile fires — `Dashboard.test.tsx` lines 97-117 already assert the `?checkout=complete` → `reconcileTierUpgrade` once + `setSearchParams(..., {replace:true})` contract. The E2E mirrors this UI-level reconcile.

**Card-submit happy path (quarantine-eligible):** attempt `frameLocator('iframe[name^="__privateStripeFrame"]').getByPlaceholder('Card number').fill('4242 4242 4242 4242')`; if CI-flaky, quarantine the card-submit assertion only (Pitfall 3) and keep clientSecret+mount+reconcile in the blocking gate.

---

### `.github/workflows/regression-gate.yml` (config CI, event-driven) — NEW

**Analog:** `.github/workflows/vercel-preview.yml` (job/step structure, secrets injection).

**Structure to mirror** (`vercel-preview.yml` lines 9-28): `runs-on: ubuntu-latest`; `actions/checkout@v4`; `actions/setup-node@v4`; `env:` block reading `${{ secrets.* }}`.

**Key deltas from the deploy workflows (consume RESEARCH §Code Examples YAML):**
- Trigger: `on: pull_request: branches: [main, staging]` + `workflow_dispatch` (the vercel ones are push/manual-only).
- `node-version: 22` (vercel workflows pin 20 — this gate must match the project's Node 22+ requirement).
- Steps: `npm ci` → `npm run test` (vitest) → `denoland/setup-deno@v2` → `cd supabase/functions && deno task test:ci` (env `DENO_TEST_SUPABASE_REMOTE: '0'`) → `npx playwright install --with-deps chromium` → `npm run test:e2e`.
- E2E `env:` block reads `SUPABASE_TEST_*`, `STRIPE_TEST_PUBLISHABLE_KEY`, `E2E_TEST_PASSWORD` from GitHub secrets (D-09).
- `if: failure()` → `actions/upload-artifact@v4` for `playwright-report/`.
- **promptfoo is NOT in this workflow** (D-09 — real Anthropic cost; scheduled/label only).
- **Blocking teeth are NOT in the YAML** — they come from GitHub branch-protection "Required status checks" pointing at this job (operator action; document in the strategy doc, D-06).

---

### `package.json` scripts (config, batch) — MODIFIED in place

**Analog:** the existing `scripts` block — `test: "vitest run"`, `test:adversarial: "promptfoo eval --config supabase/functions/interview-prep-analyze/__tests__/fixtures/injection/promptfooconfig.yaml"`.

**Additions (extend the existing block, do not replace — RESEARCH §Code Examples):**
```jsonc
"test:edge": "cd supabase/functions && cross-env DENO_TEST_SUPABASE_REMOTE=0 deno task test:ci",
"test:e2e": "playwright test",
"verify:baseline": "npm run test && npm run test:edge && npm run test:e2e",
"test:quarantine": "vitest run --dir src/test/quarantine"
```
- `verify:baseline` = the D-08 single command = D-09 per-PR set (vitest + deno + Playwright). **promptfoo stays out** (separate `test:adversarial`).
- `&&` chaining = fail-fast (a red layer stops the chain). On Windows prefer `cross-env` (already an option) or a `scripts/verify-baseline.mjs` orchestrator for portable env-setting.
- Add `@playwright/test` to `devDependencies` (absent — verified). Stripe libs already present (`@stripe/react-stripe-js ^6.2.0`, `@stripe/stripe-js ^9.2.0`).

---

### `supabase/functions/deno.json` `test:ci` task (config, batch) — MODIFIED in place

**Analog:** the existing `test` task (line 4) + the `run-edge-tests.ps1` `$baseTests` allowlist (lines 27-63) — the authoritative offline file list.

**Current too-small task** (`deno.json` line 4 — only 4 files):
```jsonc
"test": "deno test _shared/json-repair.test.ts _shared/logger.test.ts _shared/auth.test.ts _shared/cors.test.ts --no-check --allow-env --allow-read"
```

**Replace/extend with a `test:ci` task carrying the full offline allowlist** mirrored from `run-edge-tests.ps1` lines 30-61 (the `$baseTests` array, minus the leading `"test"`/`"--allow-all"` and trailing `"--no-check"` tokens). The CI list MUST include the **5 vitest-excluded deno-only files** (they run under deno, not vitest — `vitest.config.ts` lines 19-23):
- `_shared/__tests__/archive-reader.test.ts`
- `_shared/__tests__/interview-prep-prompts.contract.test.ts`
- `_shared/__tests__/interview-prep-validation.test.ts`
- `_shared/__tests__/merit-gateway-already-refunded.test.ts`
- `_shared/__tests__/tier-prompts.interview-prepend.test.ts`

**MUST EXCLUDE (live-Supabase, no clean skip guard — Pitfall 6):** `_tests/test-04..06`, `interview-prep-analyze/__tests__/analyze.*`, `create-payment-intent/index.test.ts`, `usage-checker.test.ts`, and the `*/history-persistence.test.ts` remote suite (the latter self-skips via `skipRemote()` but stays behind `DENO_TEST_SUPABASE_REMOTE=1`). **Do NOT use `deno test ./` directory recursion** — it collects these and hangs/fails in CI.

```jsonc
{
  "lock": false,
  "tasks": {
    "test:ci": "deno test --allow-all --no-check <explicit offline allowlist mirrored from run-edge-tests.ps1 + the 5 deno-only excludes>"
  }
}
```

**`scripts/run-edge-tests.sh` (optional bash twin):** port `run-edge-tests.ps1` lines 27-67 to bash, OR (cleaner) have both `.ps1` and CI call `deno task test:ci` as the single source of truth.

---

### `src/components/applications/OutcomeOverdueBanner.tsx` (component, async-effect CRUD) — MODIFIED

**Analog:** `src/components/applications/AddApplicationDialog.tsx` lines 71-100 and `ReportOutcomeDialog.tsx` lines 102-128 — sibling components that wrap async Supabase calls in `try/catch`. Note: `ReportOutcomeDialog`'s `fetchExisting` effect (lines 74-97) has the SAME unguarded-effect vulnerability, so the banner fix establishes the pattern those should also follow.

**The defect** (`OutcomeOverdueBanner.tsx` lines 26-48): the async `fetchOverdue` IIFE has NO `try/catch`. When a transitively-mounting test provides a Supabase mock whose `from().select().eq()` chain lacks `.lt`, the chain throws *inside the async IIFE* → unhandled promise rejection that crashes whichever vitest worker runs concurrently (Pitfall 2). The existing `if (error || !data || cancelled) return;` (line 40) handles a *resolved-error*, NOT a *thrown chain*.

**Fix pattern to copy (try/catch from the sibling `onSubmit`):**
```typescript
const fetchOverdue = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // ...existing cutoffDate + query + filter...
    setOverdueCount(overdue.length);
  } catch (error) {
    console.error('[OutcomeOverdueBanner] overdue fetch failed:', error);
    if (!cancelled) setOverdueCount(0);   // benign no-op; banner self-hides
  }
};
```
This is a *defensive* change (arguably zero functional change — the banner already self-hides on error) and kills the cross-worker crash at the source per D-07. Use the bracket-prefixed `console.error('[ComponentName] ...')` convention (matches `AddApplicationDialog.tsx` line 96).

---

### `src/test/supabaseMock.ts` (test utility, query-builder mock) — NEW factory

**Analog:** `src/pages/Dashboard.test.tsx` lines 55-69 — the ONE complete chainable mock (has `.lt`, `.order`, `.limit`). Contrast with the incomplete `src/components/PricingTable.test.tsx` lines 15-19 (only stubs `auth.getUser`) — representative of the ~20 incomplete mocks that bite when they transitively render the banner.

**Complete chain to extract into a reusable factory** (from `Dashboard.test.tsx` lines 59-67):
```typescript
from: () => ({
  select: () => ({
    eq: () => ({
      lt: () => Promise.resolve({ data: [], error: null }),
      order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
    }),
  }),
}),
```

**Factory shape (new file):** export a `makeSupabaseMock()` returning a fully-chainable builder where `select/eq/lt/order/limit/maybeSingle/single` all resolve to `{ data: [], error: null }` (note `ReportOutcomeDialog` uses `.maybeSingle()` at line 82, and `Dashboard` uses `.order().limit()` — cover both). Then refactor the incomplete mocks (`PricingTable.test.tsx`, `usePaywallGuard.test.tsx`, the interviewPrep suites) to use it. Keep `auth.getUser`/`rpc`/`storage` stubs alongside, matching `Dashboard.test.tsx` lines 56-67.

---

### `src/test-setup.ts` (test config, event-driven) — MODIFIED (is its own analog)

**Current contents (entire file — line 1):**
```typescript
import '@testing-library/jest-dom/vitest';
```

**Addition (belt-and-suspenders, Pitfall 2 part 3):** surface escaped rejections so a future unhandled rejection fails ITS OWN test loudly instead of silently crashing a neighbor:
```typescript
process.on('unhandledRejection', (reason) => {
  throw reason instanceof Error ? reason : new Error(String(reason));
});
```
**Do NOT** set `dangerouslyIgnoreUnhandledErrors` — that would *weaken* the gate (violates D-07). This addition surfaces, it does not suppress.

---

### `supabase/functions/_shared/tier-config.test.ts` (test) — RECONCILE ONLY IF RED

**Analog:** itself + the `tier-config.ts` source.

**Status check (do this FIRST — Pitfall 1):** RESEARCH flagged a `tier-config` RED baseline (test wanting `pro/core`=125000 while a prior source returned 155000). **Verified at map time:** the current source `TIER_TIMEOUTS` (`tier-config.ts` lines 27-31) is `free:{core:50000}`, `pro:{core:125000,'elite-preview':65000}`, `elite:{core:155000,quiz:80000}` — which AGREES with the test's current assertions (`tier-config.test.ts` lines 29-31 expect pro/core=125000; line 37 expects elite/core=155000; lines 61-67 expect pro/quiz to throw). So as currently written, source and test appear consistent.

**Executor action:** run `deno test --no-check _shared/tier-config.test.ts` on a clean checkout. If GREEN, no change — the RESEARCH drift was already resolved upstream; document that. If RED, the test/source disagree: determine which side reflects *deployed production* timeouts, fix the stale side (test OR `tier-config.ts` constant), and document the resolution in `TESTING-STRATEGY.md`. This is a test/source reconciliation, NOT a product behavior change (allowed by D-01). The baseline tag is BLOCKED until this is green.

---

### `.../injection/promptfooconfig.yaml` (test adversarial) — EXTEND (is its own analog)

**Analog:** the existing config (lines 26-85). It already has the http provider, `tests: file://./fixtures.yaml`, and `defaultTest.assert` with 4 contracts (no system-prompt-leak ×3, no variant escalation, valid JSON).

**Extension pattern (TEST-07):** add new injection fixtures to `fixtures.yaml` (the file referenced at line 52) following the existing `{{resume}} {{injection}}` template (lines 37-38). Reuse the 4 existing assertions (lines 55-84) verbatim for new fixtures; add new `assert` entries only for genuinely new attack classes. **Keep it off the per-PR gate** — it hits real Anthropic (header comment lines 17-18, T-23-PROMPTFOO-02; D-09). Stays in `npm run test:adversarial`, scheduled/label-triggered.

---

## Shared Patterns

### AI stubbing (the D-02 mechanism — REUSE, never rebuild)
**Source:** `supabase/functions/_shared/anthropic.ts` lines 560-644
**Apply to:** all E2E AI flows + the regression baseline
The `AI_TEST_MODE=true` env short-circuit returns per-feature recorded fixtures keyed by `params.fixtureKey`, with deterministic hash-based score variation and 3-call slicing for `analyze_resume`. `streamAnthropicText` emits the same fixture as chunks. Deploy to the TEST project with the secret set — do NOT build a parallel mock (Don't-Hand-Roll table).

### Offline deno allowlist (CI determinism)
**Source:** `scripts/run-edge-tests.ps1` lines 27-63 (`$baseTests`) with `DENO_TEST_SUPABASE_REMOTE=0`
**Apply to:** `deno.json` `test:ci` task + `regression-gate.yml` deno step + optional `run-edge-tests.sh`
Explicit allowlist of pure/offline tests only. Remote/live-Supabase tests (`_tests/test-0X`, `interview-prep analyze.*`, `*/history-persistence.test.ts`) stay behind `DENO_TEST_SUPABASE_REMOTE=1` and off the PR gate. Single source of truth: define once, call from PowerShell + bash + CI.

### Async-effect guard (test determinism, D-07)
**Source:** `src/components/applications/AddApplicationDialog.tsx` lines 71-100 (try/catch around async Supabase op)
**Apply to:** `OutcomeOverdueBanner.tsx` (the TEST-02 fix); pattern also applicable to `ReportOutcomeDialog.tsx` `fetchExisting` effect
Wrap async-effect DB queries in try/catch with a benign-no-op fallback and bracket-prefixed `console.error('[Component] ...')`. Prevents thrown query chains from becoming cross-worker unhandled rejections.

### Supabase test mock (complete chainable builder)
**Source:** `src/pages/Dashboard.test.tsx` lines 55-69 (the only complete chain with `.lt`/`.order`/`.limit`)
**Apply to:** new `src/test/supabaseMock.ts` factory + refactor of ~20 incomplete mocks (`PricingTable.test.tsx` lines 15-19, etc.)
Chainable `select/eq/lt/order/limit/maybeSingle/single` all resolving to `{ data: [], error: null }`, plus `auth`/`rpc`/`storage` stubs.

### CI workflow scaffold
**Source:** `.github/workflows/vercel-preview.yml` lines 9-28
**Apply to:** `regression-gate.yml`
`runs-on: ubuntu-latest` + `checkout@v4` + `setup-node@v4` + `${{ secrets.* }}` env injection. Bump Node 20→22; change trigger to `pull_request`; add deno + Playwright steps.

### Quarantine register (keeps the BLOCKING gate trustworthy, D-06/D-07)
**Source:** none in-repo (new convention — RESEARCH Pitfall 3)
**Apply to:** `TESTING-STRATEGY.md` + any residual flaky test
Tag flaky tests `it.skip` ONLY with `// QUARANTINE(#issue, owner, date): <reason>` + a register row in the strategy doc; they still RUN in non-blocking `npm run test:quarantine`. `OutcomeOverdueBanner` is fixed at source, NOT quarantined.

---

## No Analog Found

Files with no close in-repo match (executor should use RESEARCH §Code Examples + §Validation Architecture):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `e2e/auth-session.spec.ts` | test (E2E) | request-response | No Playwright specs exist; greenfield. Flow shape from RESEARCH §Pattern 2. |
| `e2e/resume-analysis.spec.ts` | test (E2E) | streaming → CRUD | No E2E analog; relies on the `AI_TEST_MODE` seam (read-first reference, not a copy source). |
| `TESTING-STRATEGY.md` (TEST-01) | doc | — | New strategy doc. Note `.planning/codebase/TESTING.md` is STALE (claims "no FE tests" — false); do NOT copy it. Supersede it. |

> The two E2E specs are greenfield by nature (no committed Playwright surface). Their *flow boundaries* DO have analogs (auth = `Auth.tsx`; resume = `AI_TEST_MODE` seam; stripe = `useStripeCheckout.ts` + `Dashboard.test.tsx` reconcile) — listed under their Pattern Assignments above. The *spec file scaffolding* itself comes from RESEARCH §Code Examples.

---

## Metadata

**Analog search scope:** `vitest.config.ts`, `src/test-setup.ts`, `src/components/applications/`, `src/pages/Dashboard.test.tsx`, `src/components/PricingTable.test.tsx`, `src/lib/supabaseClient.ts`, `src/pages/Auth.tsx`, `src/hooks/useStripeCheckout.ts`, `supabase/functions/deno.json`, `supabase/functions/_shared/anthropic.ts`, `supabase/functions/_shared/tier-config.ts(.test.ts)`, `scripts/run-edge-tests.ps1`, `.github/workflows/`, `.../injection/promptfooconfig.yaml`, `.gitignore`
**Files scanned:** 18
**Pattern extraction date:** 2026-06-09

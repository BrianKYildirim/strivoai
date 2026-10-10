# Strivo AI — Environment Variable Reference

This is the canonical, secret-free cross-env reference for every live environment
variable in the repo. It documents NAMES, consumers, required/optional status, and
which surface sets each name. The copy-paste skeletons are `.env.example`
(production-runtime) and `.env.test.local.example` (test/CI + E2E).

> ## VALUES ARE NEVER RECORDED — names, consumers, required/optional only.
> Per Phase-2 REPO-05 / `02-SECRET-SCAN.md` (T-3-07): record variable NAMES + consumer
> file(s) + environment bucket + required/optional ONLY — never a key, token, JWT,
> price ID, or connection string. (`SUPABASE_TEST_URL=https://cimjltzovkahkqecpwgi.supabase.co`
> is a project URL — a name+host, not a secret.)

## Topology — prod vs preview(=staging=test)

There are exactly **two** Supabase environments, not three. The authoritative selector
is `scripts/deploy.ps1:73-75` (explicit `supabase link --project-ref`, NOT a
`config.toml` swap):

- **production** -> `zjpjapgraoxdukdvpjes` (strivoai)
- **staging** -> `cimjltzovkahkqecpwgi` (strivoaipreview)
- **test** -> `cimjltzovkahkqecpwgi` (test reuses strivoaipreview)

So "staging" and "test" are the **same project** — the real separation axis is
**prod vs preview(=staging=test)**.

The five surfaces a name can be set in:

- **Vercel project env** — frontend `VITE_*`, baked at build (Production vs Preview env).
- **Supabase prod secrets** — `zjpjapgraoxdukdvpjes` (`supabase secrets list`).
- **Supabase preview/test secrets** — `cimjltzovkahkqecpwgi`.
- **GitHub Actions secret** — CI E2E build + runner (`gh secret list`).
- **local `.env` / `.env.test.local`** — operator's filled local copies (never committed).

## Live store state (post ENV-04 remediation, 2026-06-23)

The ENV-04 cross-surface audit (`.planning/audit/ENV-SEPARATION.md`) and the operator
remediation that followed left a clean, well-separated topology:

- **Supabase prod** (`zjpjapgraoxdukdvpjes`) — 18 names: the live edge set + the Supabase
  platform secrets. No test seams, no orphans.
- **Supabase preview/test** (`cimjltzovkahkqecpwgi`) — 18 names: the same edge set plus the
  test seams (`AI_TEST_MODE`, `PERF_TEST_EMAIL`, `PERF_TEST_PASSWORD`).
- **Vercel** — exactly the four `VITE_*` the SPA reads, in both Production and Preview.
- **GitHub Actions** — exactly the five TEST-project gate secrets.

Paid catalog is **Free + Elite only**: `STRIPE_PRICE_PRO_*` / `STRIPE_PRICE_PAID_*` are
retired (absent both stores) and the **merit shop is gated off** (`MERIT_SYSTEM_ENABLED` +
`STRIPE_PRICE_MERIT_*` unset everywhere). Paddle has been fully retired — the
`paddle-webhook` function, its config, and all Paddle-only schema were removed
in Phase 8. Full delta: `ENV-SEPARATION.md` Section 6.

**Provisioned by Supabase** (auto-injected into Edge Functions; present in
`supabase secrets list` but not set by hand — never print/commit their values):
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`,
`SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`.

## Production-runtime matrix

| Name | Bucket | Req/Opt | Consumer (file:line) | Surface (where set) | Notes |
| ---- | ------ | ------- | -------------------- | ------------------- | ----- |
| `VITE_SUPABASE_URL` | frontend | required | `src/lib/supabaseClient.ts:7,58`, `src/hooks/useResumeStream.ts:142` | Vercel project env, local `.env` | Public browser build var |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | frontend | required (or ANON) | `src/lib/supabaseClient.ts:8` | Vercel project env, local `.env` | Fallback for ANON |
| `VITE_SUPABASE_ANON_KEY` | frontend | required (or PUBLISHABLE) | `src/lib/supabaseClient.ts:8,58`, `src/hooks/useResumeStream.ts:143` | Vercel project env, local `.env` | Public browser build var |
| `VITE_STRIPE_PUBLISHABLE_KEY` | frontend | required | `src/components/StripeCheckoutWrapper.tsx:13`, `src/components/topup/StripePaymentElementModal.tsx:61` | Vercel project env, local `.env` | Stripe checkout (public key) |
| `VITE_ANALYZE_CAREER_FUNCTION` | frontend | optional | `src/pages/CareerCompass.tsx:167` | Vercel project env, local `.env` | Defaults to `"analyze-career"` |
| `VITE_DEBUG_PERF` | frontend | optional | `src/lib/perf.ts:18` | Vercel project env, local `.env` | Perf-logging toggle (cast-access form) |
| `VITE_FEATURE_INTERVIEW_PREP` | frontend | optional (gating) | `src/config/feature-flags.ts:25` | Vercel project env (Preview=`true` / Production=`false`) | KEEP-LIST Class 1 gated-but-live; never remove |
| `VITE_FEATURE_ANALYSIS_LIFECYCLE` | frontend | optional (gating) | `src/config/feature-flags.ts:43` (`isAnalysisLifecycleEnabled()`) | Vercel project env (Production + Preview) | **BUILD-time var.** Vite inlines it at build, so flipping it requires a **Vercel REDEPLOY** — it does NOT flip with the Supabase edge secrets. Frontend and backend lifecycle flags therefore flip on **different clocks**. Fail-closed exact-lowercase `true` (`True`/`TRUE`/`1`/`yes`/`on`/unset → OFF). Gates the `useAnalysisRun` recovery surface only |
| `SUPABASE_URL` | edge | required | `_shared/supabase-client.ts`, `_shared/anthropic.ts`, +5 fns | Supabase prod / preview secrets | |
| `SUPABASE_SERVICE_ROLE_KEY` | edge | required | `_shared/supabase-client.ts`, `stripe-webhook-handler` | Supabase prod / preview secrets | Fail-closed (throws if unset) |
| `SUPABASE_ANON_KEY` | edge | required | `notify-upgrade-request`, `test-email` | Supabase prod / preview secrets | |
| `ANTHROPIC_API_KEY` | edge | required | `_shared/anthropic.ts:647-650,802-805` | Supabase prod / preview secrets | Fail-closed (500 if unset) |
| `ANTHROPIC_MODEL_TEXT` | edge | optional | `analyze-resume`, `analyze-career` (via `getModel`) | Supabase prod / preview secrets | Per-fn default if unset |
| `ANTHROPIC_MODEL_FALLBACK` | edge | optional | `analyze-career`, `analyze-resume` | Supabase prod / preview secrets | Overload fallback model |
| `INTERNAL_JOB_SECRET` | edge | required | `_shared/auth.ts:141-145` + 11 job fns | Supabase prod / preview secrets | Fail-closed (401 if unset) |
| `ALLOWED_ORIGINS` | edge | required | `_shared/cors.ts` (request-aware allowlist) | Supabase prod / preview secrets | CORS allowlist (comma-separated, exact-match, trailing slash ignored). prod = `https://strivoai.net,https://www.strivoai.net`; preview-test = stable preview alias + `http://localhost:8080`. Unapproved origins get no ACAO (fail-closed); never `*` |
| `APP_URL` | edge | required | email / Stripe / results app-link fns (no longer `_shared/cors.ts`) | Supabase prod / preview secrets | App-link generation (email CTAs, Stripe `return_url`, results URLs). No longer the CORS source of truth — see `ALLOWED_ORIGINS` |
| `STRIVO_RUNTIME_ENV` | edge | required | `_shared/runtime-environment.ts` | Supabase prod / preview secrets, local edge runner | Backend-only exact value: `production`, `staging`, `development`, or `test`. Set explicitly on every surface; never inferred from APP_URL, project ref, hostname, Vite mode, email, or request input. Production=`production`; preview=`staging`; CI/local tests=`test`; local development=`development` |
| `RESEND_API_KEY` | edge | required (email) | 8 email fns (`notify-*`, `send-*`, `test-email`) | Supabase prod / preview secrets | |
| `STRIPE_SECRET_KEY` | edge | required | `_shared/stripe-client.ts:23-24` | Supabase prod / preview secrets | Fail-closed (throws if unset) |
| `STRIPE_WEBHOOK_SECRET` | edge | required | `stripe-webhook-handler/index.ts:114-123` | Supabase prod / preview secrets | Fail-closed (401 unsigned webhook) |
| `MERIT_SYSTEM_ENABLED` | edge | optional (gated OFF) | `_shared/merit-gateway.ts` | unset on both stores (2026-06-23) | Merit kill-switch; currently OFF everywhere. Enable with the 4 `STRIPE_PRICE_MERIT_*` IDs. **GLOBAL gate across 10+ AI functions, snapshotted at MODULE LOAD** (not request time). Per Phase-9 **D-03 it stays `false` on PRODUCTION** and is verified ON in staging only — setting it true on prod in Phase 6 flipped platform-wide behavior and had to be reverted |
| `ANALYSIS_LIFECYCLE_ENABLED` | edge | optional (gating; default OFF) | `_shared/analysis-flags.ts:69,93` (master gate) | Supabase prod / preview secrets | **Master kill-switch** for the shared analysis lifecycle. Fail-closed **exact lowercase `true` ONLY** — `True`, `TRUE`, `1`, `yes`, `on`, `''`, unset are ALL OFF, by design (stricter than `merit-gateway`'s case-folding read). Read at **REQUEST time**, so a flip takes effect on the next request with **no redeploy** (and master-OFF is the instant rollback). A feature runs through the executor only when this AND its per-feature flag are both on |
| `ANALYSIS_LIFECYCLE_RECRUITING_LENS` | edge | optional (gating; default OFF) | `_shared/analysis-flags.ts:75` | Supabase prod / preview secrets | Per-feature gate; requires the master flag. Same exact-lowercase-`true`, request-time semantics. Flip order 1 of 5 (D-02) |
| `ANALYSIS_LIFECYCLE_LINKEDIN` | edge | optional (gating; default OFF) | `_shared/analysis-flags.ts:74` | Supabase prod / preview secrets | Per-feature gate; requires the master flag. Flip order 2 of 5 (D-02) |
| `ANALYSIS_LIFECYCLE_ONBOARDING` | edge | optional (gating; default OFF) | `_shared/analysis-flags.ts:76` | Supabase prod / preview secrets | Per-feature gate; requires the master flag. Gates `analyze-resume` with the `origin:'onboarding'` discriminator. Flip order 3 of 5 (D-02) |
| `ANALYSIS_LIFECYCLE_RESUME` | edge | optional (gating; default OFF) | `_shared/analysis-flags.ts:73` | Supabase prod / preview secrets | Per-feature gate; requires the master flag. Covers the streaming SSE resume path. Flip order 4 of 5 (D-02) |
| `ANALYSIS_LIFECYCLE_CAREER_COMPASS` | edge | optional (gating; default OFF) | `_shared/analysis-flags.ts:77` | Supabase prod / preview secrets | Per-feature gate; requires the master flag. Flip order 5 of 5 (D-02, highest blast radius) |
| `STRIVO_ENV` | edge | optional | `_shared/anthropic.ts:546` | Supabase prod / preview secrets | Staging discriminator (`=== 'staging'`) |
| `ADMIN_EMAIL` | edge | required | `_shared/auth.ts`, `notify-admin-activity`, `notify-upgrade-request`, `send-notification-email` | Supabase prod / preview secrets | Admin authz/routing |
| `ADMIN_EMAILS` | edge | optional | `admin-merit-metrics`, `check-merit-alerts` | unset both stores | Admin allow-list (fast path); falls back to `user_roles` RBAC |
| `FIRECRAWL_API_KEY` | edge | optional | `analyze-career` | Supabase prod / preview secrets | LinkedIn profile scraping |
| `STRIPE_PRICE_ELITE_MONTHLY` | edge (price) | required | `_shared/price-resolver.ts` (template literal) | Supabase prod / preview secrets | Elite monthly; LIVE; template-literal read |
| `STRIPE_PRICE_ELITE_ANNUAL` | edge (price) | required | `_shared/price-resolver.ts` (template literal) | Supabase prod / preview secrets | Elite annual; LIVE; template-literal read |
| `STRIPE_PRICE_PRO_MONTHLY` | edge (price) | RETIRED | `_shared/price-resolver.ts` (template literal) | absent both stores | Pro tier removed — catalog is Free + Elite only |
| `STRIPE_PRICE_PRO_ANNUAL` | edge (price) | RETIRED | `_shared/price-resolver.ts` (template literal) | absent both stores | Pro tier removed — catalog is Free + Elite only |
| `STRIPE_PRICE_PAID_MONTHLY` | edge (price) | RETIRED | `_shared/price-resolver.ts` (template literal) | absent both stores | Legacy paid-tier alias — removed |
| `STRIPE_PRICE_PAID_ANNUAL` | edge (price) | RETIRED | `_shared/price-resolver.ts` (template literal) | absent both stores | Legacy paid-tier alias — removed |
| `STRIPE_PRICE_MERIT_3` | edge (price) | optional (merit; OFF) | `_shared/shop-pack-resolver.ts:64` (template literal) | unset both stores | Merit shop — gated off; set with `MERIT_SYSTEM_ENABLED` to enable |
| `STRIPE_PRICE_MERIT_10` | edge (price) | optional (merit; OFF) | `_shared/shop-pack-resolver.ts:64` (template literal) | unset both stores | Merit shop — gated off; set with `MERIT_SYSTEM_ENABLED` to enable |
| `STRIPE_PRICE_MERIT_25` | edge (price) | optional (merit; OFF) | `_shared/shop-pack-resolver.ts:64` (template literal) | unset both stores | Merit shop — gated off; set with `MERIT_SYSTEM_ENABLED` to enable |
| `STRIPE_PRICE_MERIT_50` | edge (price) | optional (merit; OFF) | `_shared/shop-pack-resolver.ts:64` (template literal) | unset both stores | Merit shop — gated off; set with `MERIT_SYSTEM_ENABLED` to enable |
| `MISTRAL_OCR_API_KEY` | edge (OCR) | optional | `_shared/mistral-ocr-client.ts` <- `document-extraction.ts` | Supabase prod / preview secrets | OCR fallback (`mistral` -> `textract` -> `claude_ocr`) |
| `MISTRAL_OCR_ENDPOINT` | edge (OCR) | optional | `_shared/mistral-ocr-client.ts` | Supabase prod / preview secrets | OCR fallback |
| `MISTRAL_OCR_MODEL` | edge (OCR) | optional | `_shared/mistral-ocr-client.ts` | Supabase prod / preview secrets | OCR fallback |
| `TEXTRACT_OCR_ENDPOINT` | edge (OCR) | optional | `_shared/textract-client.ts` <- `document-extraction.ts` | Supabase prod / preview secrets | OCR fallback |
| `TEXTRACT_OCR_TOKEN` | edge (OCR) | optional | `_shared/textract-client.ts` | Supabase prod / preview secrets | OCR fallback |

## Analysis-lifecycle flag posture (dormancy + the Phase-9 production activation)

The shared analysis lifecycle ships **DORMANT**. Two independent gates keep it that way,
and they are NOT the same gate:

1. **`MERIT_SYSTEM_ENABLED`** — the GLOBAL merit gate (submit-time merit deduction across
   10+ AI functions). Snapshotted at **module load**.
2. **The six `ANALYSIS_LIFECYCLE_*` edge flags** — the two-level (master + per-feature)
   lifecycle gate. Read at **request time**.

> **The dormant posture is `MERIT_SYSTEM_ENABLED` unset/false AND every `ANALYSIS_LIFECYCLE_*`
> unset/false.** Phase 9 changes **only the second half of that, and only on production.**
> `MERIT_SYSTEM_ENABLED` **stays `false` on production** (D-03).

When any `ANALYSIS_LIFECYCLE_*` flag is OFF, the corresponding feature falls through to a
**byte-identical legacy path** — guarded by `_shared/analysis-lifecycle.dormancy.test.ts` and
the per-feature `byte-preserve.test.ts` files. This is what makes master-off a safe, instant
rollback.

**Three clocks, not one.** These flags do not all take effect at the same moment:

| Flag family | Read at | Takes effect |
| ----------- | ------- | ------------ |
| `ANALYSIS_LIFECYCLE_*` (edge) | request time | **next request** — no redeploy |
| `MERIT_SYSTEM_ENABLED` (edge) | module load | next **cold start** of each isolate |
| `VITE_FEATURE_ANALYSIS_LIFECYCLE` (frontend) | build time | only after a **Vercel redeploy** |

**Exact-lowercase-`true` is load-bearing.** `analysis-flags.ts` compares with `=== 'true'` and
does **no case folding**: `True`, `TRUE`, `1`, `yes`, `on` all evaluate to OFF. A dormancy
safety switch must fail closed, so an ambiguous truthy string can never silently wake the
substrate. Setting a flag to `True` looks like an activation and is not one.

## Test/CI + E2E matrix

> **staging == test == preview.** `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`,
> `SUPABASE_TEST_SERVICE_ROLE_KEY`, `STAGING_SUPABASE_URL`, and `SUPABASE_URL_STAGING` all
> resolve to the **SAME** project — `strivoaipreview` (`cimjltzovkahkqecpwgi`). **There is ONE
> non-prod project, not two.** The differing name prefixes are historical, not topological, and
> are a frequent source of confusion. The only real separation axis is **prod vs preview**.

| Name | Bucket | Req/Opt | Consumer (file:line) | Surface (where set) | Notes |
| ---- | ------ | ------- | -------------------- | ------------------- | ----- |
| `SUPABASE_TEST_URL` | test/CI | optional | `e2e/global-setup.ts` | local `.env.test.local`, GitHub Actions secret | TEST project URL (name+host) |
| `SUPABASE_TEST_ANON_KEY` | test/CI | optional | `.github/workflows/regression-gate.yml` (`${{ secrets.* }}`) | GitHub Actions secret, local `.env.test.local` | Resolved CI-only |
| `SUPABASE_TEST_SERVICE_ROLE_KEY` | test/CI | optional | `e2e/global-setup.ts` | local `.env.test.local`, GitHub Actions secret | Server-side only |
| `STAGING_SUPABASE_URL` | test/CI | optional | `_tests/analysis_results_rls_test.ts` | local `.env.test.local` | Remote-test target (RLS test). NOTE: distinct NAME from `SUPABASE_URL_STAGING` below, same PROJECT |
| `STAGING_SUPABASE_ANON_KEY` | test/CI | optional | `_tests/analysis_results_rls_test.ts` | local `.env.test.local` | Remote-test target |
| `SUPABASE_URL_STAGING` | test/CI (remote DB lane) | required when `DENO_TEST_SUPABASE_REMOTE=1` | `_shared/__tests__/history-persistence-remote.ts:12,35` (`skipRemote()` / `requireRemoteEnv()`) | local `.env.test.local`, GitHub Actions secret | Preview project URL (`cimjltzovkahkqecpwgi`) for the remote database lane. **Fail-loud, never vacuous:** the placeholder `https://test.supabase.co` is explicitly **REJECTED** (throws), as is an empty value, so a misconfigured remote run cannot pass silently. Must NEVER resolve to the prod ref `zjpjapgraoxdukdvpjes` — the lane writes rows |
| `SUPABASE_SERVICE_ROLE_KEY_STAGING` | test/CI (remote DB lane) | required when `DENO_TEST_SUPABASE_REMOTE=1` | `_shared/__tests__/history-persistence-remote.ts:18` (`skipRemote()`) | local `.env.test.local`, GitHub Actions secret | Preview service-role key. Server-side only; never browser-shipped, never printed, never written to a CI artifact. An empty value THROWS rather than skipping |
| `E2E_TEST_PASSWORD` | test/CI | optional | `e2e/auth.setup.ts`, `e2e/global-setup.ts` | local `.env.test.local`, GitHub Actions secret | Seeded Playwright user password |
| `STRIPE_TEST_PUBLISHABLE_KEY` | test/CI | optional | `.github/workflows/regression-gate.yml` (`${{ secrets.* }}`) | GitHub Actions secret, local `.env.test.local` | Resolved CI-only |
| `AI_TEST_MODE` | test seam | optional | `_shared/anthropic.ts:564,570,753,761` | local `.env.test.local`, Supabase preview/test secrets | Two-key seam (inert unless set) |
| `STRIVO_RUNTIME_ENV` | test runtime | required for edge runtime execution | `_shared/runtime-environment.ts` | local `.env.test.local`, GitHub Actions runner, Supabase preview/test secrets | Use exact `test` in CI/offline tests and exact `staging` for deployed preview requests; never client-supplied |
| `AI_FORCE_FAILURE` | test seam | optional | `_shared/anthropic.ts:560-565,751-755` | local `.env.test.local`, Supabase preview/test secrets | Only active with `AI_TEST_MODE` |
| `MERIT_TEST_FORCE_REFUNDABLE_ERROR` | test seam | optional | `_shared/anthropic.ts:547-555` (`refundableErrorOverride()`) | local `.env.test.local`, Supabase preview/test secrets | Forces the refundable-error path. **STAGING-HOST-GATED — inert in production even if accidentally set** (`_shared/anthropic.ts:550-552`: requires `SUPABASE_URL` to contain `cimjltzovkahkqecpwgi` OR `STRIVO_ENV === 'staging'`). Takes a **configurable 3-digit status** (`408` = provider timeout, `429` = provider rate-limit); any non-3-digit truthy value (e.g. `true`) defaults to `529` |
| `IS_TEST` | test seam | optional | `interview-prep-analyze/index.ts` | local `.env.test.local`, Supabase preview/test secrets | Test seam in gated fn |
| `RUN_EVALS` | test gate | optional | `_tests/` | local `.env.test.local` | Eval gate |
| `RUN_LIVE_MERIT` | test gate | optional | `_tests/analysis_results_rls_test.ts` | local `.env.test.local` | Live-test gate |
| `RUN_TIER_VALIDATION` | test gate | optional | `_tests/` | local `.env.test.local` | Test gate |
| `DENO_TEST_SUPABASE_LOCAL` | test gate | optional | `_tests/` | local `.env.test.local` | Test routing |
| `DENO_TEST_SUPABASE_REMOTE` | test gate | optional | `_tests/` | local `.env.test.local` | Test routing |
| `TEST_USER_JWT` | test fixture | optional | `_tests/merit_rls_test.ts`, `_tests/analysis_results_rls_test.ts` | local `.env.test.local` | Fixture (name only) |
| `TEST_FREE_USER_JWT` | test fixture | optional | `_tests/` fixtures | local `.env.test.local` | Fixture (name only) |
| `TEST_PRO_USER_JWT` | test fixture | optional | `_tests/` fixtures | local `.env.test.local` | Fixture (name only) |
| `TEST_PRO_USER_JWT_NO_RESUME` | test fixture | optional | `_tests/` fixtures | local `.env.test.local` | Fixture (name only) |
| `TEST_ELITE_USER_JWT` | test fixture | optional | `_tests/` fixtures | local `.env.test.local` | Fixture (name only) |
| `TEST_USER_A_ID` | test fixture | optional | `_tests/` fixtures | local `.env.test.local` | Fixture (name only) |
| `TEST_USER_B_ID` | test fixture | optional | `_tests/` fixtures | local `.env.test.local` | Fixture (name only) |
| `TEST_PRO_USER_ID` | test fixture | optional | `_tests/` fixtures | local `.env.test.local` | Fixture (name only) |
| `TEST_ELITE_USER_ID` | test fixture | optional | `_tests/` fixtures | local `.env.test.local` | Fixture (name only) |
| `TEST_ELITE_QUIZ_ID` | test fixture | optional | `_tests/` fixtures | local `.env.test.local` | Fixture (name only) |
| `TEST_PRO_A_PRO_FLASH_QUIZ_ID` | test fixture | optional | `_tests/` fixtures | local `.env.test.local` | Fixture (name only) |
| `TEST_PRO_A_ELITE_TASTE_QUIZ_ID` | test fixture | optional | `_tests/` fixtures | local `.env.test.local` | Fixture (name only) |
| `TEST_ELITE_A_ELITE_TASTE_QUIZ_ID` | test fixture | optional | `_tests/` fixtures | local `.env.test.local` | Fixture (name only) |
| `TEST_OTHER_USER_ELITE_TASTE_QUIZ_ID` | test fixture | optional | `_tests/` fixtures | local `.env.test.local` | Fixture (name only) |
| `TEST_ELITE_QUESTION_ORDERS` | test fixture | optional | `_tests/` fixtures | local `.env.test.local` | Fixture (name only) |

## Excluded (not in the live code surface)

These names are intentionally NOT in the matrix or the templates:

- `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_AUTH_HEADER_NAME`, `OLLAMA_AUTH_SECRET`,
  `OLLAMA_TIMEOUT_MS` — **code-dead** after Phase 4 (04-04) deleted
  `_shared/ollama-client.ts`. Zero code consumers at HEAD. The only remaining
  `OLLAMA_` strings in the tree are negative assertions in
  `src/pages/__tests__/document-extraction-primary.test.ts` (guards that OLLAMA stays
  removed). See RESIDUAL-REGISTER.md for the operator un-set list.
- `RAPIDAPI_KEY` — **doc-ghost**, zero code consumers anywhere. Previously documented
  "(not currently used)" in repo docs; excluded as it was never a live secret.
- `GOOGLE_GEMINI_API_KEY`, `AI_PROVIDER` — **orphaned**, zero code consumers (no Gemini
  integration / no provider-switch read in the repo). Surfaced set on prod by the ENV-04
  audit and **un-set 2026-06-23**. See RESIDUAL-REGISTER.md.
- `SERVICE_ROLE_KEY` (bare, no `SUPABASE_` prefix) — **redundant**; edge reads
  `SUPABASE_SERVICE_ROLE_KEY`. Surfaced set on preview by the ENV-04 audit and
  **un-set 2026-06-23**.

## Re-verify on demand

This reference is kept aligned by a **re-runnable command, not a CI gate** (no audit
script). Re-run these from the repo root to re-derive the live surface at HEAD:

Three edge scans are needed because the names are read three ways — as a literal
`Deno.env.get("NAME")`, as a template literal `Deno.env.get(`...${x}...`)`, and as a
computed key `Deno.env.get(variable)`:

```bash
# Frontend (dotted + cast-form catch)
rg -n "import\.meta\.env\.\w+" src -o | sort -u
rg -o "VITE_[A-Z_0-9]+" src | sort -u

# 1) Edge literal Deno.env.get("NAME")  -> 52 distinct at HEAD
rg -o "Deno\.env\.get\(['\"]([A-Z_0-9]+)['\"]" -r '$1' supabase/functions --no-filename | sort -u

# 2) Edge template-literal Deno.env.get(`...`)  (the STRIPE_PRICE_* landmine)
rg -n 'Deno\.env\.get\(`' supabase/functions

# 3) Edge computed-key Deno.env.get(variable)
rg -n 'Deno\.env\.get\([a-z]' supabase/functions
```

The literal scan (1) returns **52** names at HEAD (was 57 before Phase 4 removed the
5 `OLLAMA_*`). The template-literal scan (2) surfaces the `STRIPE_PRICE_*` keys that a
literal grep would falsely flag "unused"; the computed-key scan (3) catches the
resolver's runtime-built keys.

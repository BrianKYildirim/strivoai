# ENV-01 — Environment Variable Inventory (VITE_* + edge secrets)

**Phase:** 03 — Cross-Domain Inventory & Audit
**Plan:** 03-04 (ENV-01)
**Run date:** 2026-06-14
**Branch / HEAD at inventory:** `staging` @ `f131e3f`
**Tooling:** `rg` (ripgrep) only — three enumerations: `import.meta.env.<NAME>` (frontend), literal `Deno.env.get("<NAME>")` (edge), and the template-literal catch `Deno.env.get(` … `${…}` … `)` (edge). Read-only over `src/`, `supabase/functions/`, and `.env.example` NAMES. No live secret store read.

> ## ⚠ VALUES ARE NEVER RECORDED — names, consumers, required/optional only.
> This catalog is committed to a tracked repo. Per Phase-2 REPO-05 / `02-SECRET-SCAN.md` discipline (the highest-severity threat in this phase, **T-3-07**), it records **variable NAMES + consumer file(s) + environment bucket + required/optional status ONLY** — never a key, token, JWT, price ID, or connection string. The enumeration surfaces the KEY (`Deno.env.get("X")` / `import.meta.env.X`), never the value. A post-write secret-pattern grep guard was run against this file (see Re-Assertion) and returned **zero** matches.

---

## Verdict / Summary

| Metric | Count |
| ------ | ----- |
| Frontend `import.meta.env.*` distinct names | **9** (6 `VITE_*` + 3 Vite built-ins `PROD`/`MODE`/`DEV`) |
| Edge literal `Deno.env.get("…")` distinct names | **57** |
| Edge template-literal `Deno.env.get(\`…\`)` call sites | **4** (in 2 files: `price-resolver.ts` ×3, `shop-pack-resolver.ts` ×1) |
| Template-literal keys expanded to concrete set | **6 subscription** (`STRIPE_PRICE_{PRO,ELITE,PAID}_{MONTHLY,ANNUAL}`) + the 4 `STRIPE_PRICE_MERIT_{3,10,25,50}` (also read literally) |
| `.env.example` documented names | **18** (6 frontend + 12 edge/test) |
| Gap: in code, NOT in `.env.example` | **VITE_STRIPE_PUBLISHABLE_KEY**, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the 6 `STRIPE_PRICE_*` subscription + 4 `STRIPE_PRICE_MERIT_*`, the OCR/Ollama family (`MISTRAL_OCR_*`, `TEXTRACT_OCR_*`, `OLLAMA_*`), `MERIT_SYSTEM_ENABLED`, `ADMIN_EMAIL(S)`, `STRIVO_ENV`, + the test/CI surface — **~46 code names absent from `.env.example`** |
| Gap: in `.env.example`, NOT in `src`/`functions`/`e2e` | `SUPABASE_TEST_ANON_KEY`, `STRIPE_TEST_PUBLISHABLE_KEY` (documented but no current consumer found) |
| Classifications | `safe` (live, documented) / `needs-investigation` / `unsafe` (gated-but-live, never-remove) per [`KEEP-LIST.md`](./KEEP-LIST.md) |

**Headline:** the live edge-secret surface (57 literal + 6 template-expanded subscription keys) is **~3× larger than `.env.example` documents (18)**. The #1 false-positive landmine — the `STRIPE_PRICE_{PRO,ELITE,PAID}_{MONTHLY,ANNUAL}` subscription keys, read ONLY via a template literal in `price-resolver.ts` (every literal occurrence is in `.test.ts` / `DEPLOY_RUNBOOK.md`) — is **defused**: all 6 are recorded as LIVE consumers, not unused. **Open Question 1 RESOLVED:** `VITE_DEBUG_PERF` IS live (consumed at `src/lib/perf.ts:18` via a cast access form the plain `import.meta.env.\w+` grep misses) → `safe`, not `needs-investigation`.

---

## Commands Run (read-only; reproducible by Phase 7)

All run from repo root. Each surfaces the KEY only — never a value.

```bash
# 1. Frontend — every import.meta.env.* name with consumer file:line
rg -n "import\.meta\.env\.\w+" src -o
# Caveat (method correction): a SECOND scan is required because perf.ts reads the
# flag via a cast, (import.meta as any).env?.VITE_DEBUG_PERF, which the dotted
# \w+ pattern misses. The broader literal scan catches it:
rg -n "VITE_[A-Z_0-9]+" src -o
```

```bash
# 2. Edge — literal Deno.env.get("NAME") distinct names (→ 57)
rg -o "Deno\.env\.get\(['\"]([A-Z_0-9]+)['\"]" -r '$1' supabase/functions --no-filename | sort -u
```

```bash
# 3. Edge — TEMPLATE-LITERAL Deno.env.get keys (the Pitfall-2 landmine catch)
rg -n 'Deno\.env\.get\(`' supabase/functions
# → price-resolver.ts:31-33  STRIPE_PRICE_{PRO,PAID,ELITE}_${suffix}  (suffix ∈ {MONTHLY,ANNUAL})
# → shop-pack-resolver.ts:64  STRIPE_PRICE_MERIT_${packSize}          (packSize ∈ {3,10,25,50})
# Also catch computed-key reads (Deno.env.get(variable)):
rg -n 'Deno\.env\.get\([a-z]' supabase/functions   # price-resolver.ts:71/77/81 (key/paidKey/legacyKey)
```

---

## Frontend `VITE_*` / `import.meta.env.*` table

| Name | Consumer file(s) | Environment | Req/Opt | Classification |
| ---- | ---------------- | ----------- | ------- | -------------- |
| `VITE_SUPABASE_URL` | `src/lib/supabaseClient.ts:7,58`, `src/hooks/useResumeStream.ts:142` | prod (Vercel) + local + E2E-build override | required | **safe** (live; documented) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `src/lib/supabaseClient.ts:8` (fallback for ANON) | prod + local | required (or ANON) | **safe** (live; documented) |
| `VITE_SUPABASE_ANON_KEY` | `src/lib/supabaseClient.ts:8,58`, `src/hooks/useResumeStream.ts:143` | prod + local + E2E-build override | required (or PUBLISHABLE) | **safe** (live; documented) |
| `VITE_ANALYZE_CAREER_FUNCTION` | `src/pages/CareerCompass.tsx:167` | prod + local | optional (defaults `"analyze-career"`) | **safe** (live; documented) |
| `VITE_DEBUG_PERF` | `src/lib/perf.ts:18` — `(import.meta as any).env?.VITE_DEBUG_PERF === 'true'` | prod + local | optional (perf logging toggle) | **safe** — Open Q1 RESOLVED: live runtime consumer found (cast access form) |
| `VITE_FEATURE_INTERVIEW_PREP` | `src/config/feature-flags.ts:25` (`isInterviewPrepEnabled()`, single source of truth) | Vercel Preview=`true` / Production=`false` (fail-closed) | optional (gating flag) | **unsafe** — KEEP-LIST Class 1 (feature-flagged gated-but-live → never `safe`) |
| `import.meta.env.PROD` (built-in) | comment-only in `feature-flags.ts:13` (explicitly NOT used at runtime); tests `feature-flags.test.ts` | Vite build-time | n/a (Vite built-in) | **needs-investigation** — only test + comment refs; built-in, not a project var |
| `import.meta.env.MODE` (built-in) | comment-only in `feature-flags.ts:13`; tests | Vite build-time | n/a (Vite built-in) | **needs-investigation** — built-in; comment/test only |
| `import.meta.env.DEV` (built-in) | `src/App.tsx:87` (DEV-gates `/dev/locked-sections` route), `src/components/topup/StripePaymentElementModal.tsx:62` | Vite build-time | n/a (Vite built-in) | **safe** (live; Vite built-in, no `.env` entry expected) |

> **PROD/MODE caveat:** `feature-flags.ts:13` carries a comment warning *not* to use `import.meta.env.MODE`/`PROD` for gating (both equal `production` for every `vite build` including preview, D-09). They are Vite built-ins, not project-declared vars — flagged `needs-investigation` only to document they appear in scans (comment + test), never as a removable project var.

---

## Edge-secret tables (`Deno.env.get`)

### Production bucket — live server-side secrets (set in Supabase secrets per project)

| Name | Consumer function(s) | Bucket | Req/Opt | Classification |
| ---- | -------------------- | ------ | ------- | -------------- |
| `ANTHROPIC_API_KEY` | `_shared/anthropic.ts` (all AI fns via shared client) | prod | required | **safe** (live) |
| `ANTHROPIC_MODEL_TEXT` | `analyze-skills-gap`, `chat-agent`, `compare-jobs` | prod | optional (per-fn default) | **safe** (live) |
| `ANTHROPIC_MODEL_FALLBACK` | `analyze-career`, `analyze-resume` | prod | optional (overload fallback) | **safe** (live) |
| `SUPABASE_URL` | `_shared/anthropic.ts`, `_shared/supabase-client.ts`, `check-merit-alerts`, `notify-upgrade-request`, `stripe-webhook-handler`, `test-email` | prod | required | **safe** (live) |
| `SUPABASE_SERVICE_ROLE_KEY` | `_shared/supabase-client.ts`, `stripe-webhook-handler` | prod | required | **safe** (live) |
| `SUPABASE_ANON_KEY` | `notify-upgrade-request`, `test-email` | prod | required | **safe** (live) |
| `INTERNAL_JOB_SECRET` | `_shared/auth.ts` + 11 job submit/process/status fns | prod | required | **safe** (live; internal-job auth) |
| `APP_URL` | `_shared/cors.ts` (fail-closed CORS) + 14 fns | prod | required | **safe** (live; CORS source of truth) |
| `STRIPE_SECRET_KEY` | `_shared/stripe-client.ts` | prod | required (Stripe live) | **safe** (live) |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook-handler` | prod | required (Stripe live) | **safe** (live) |
| `RESEND_API_KEY` | 8 email fns (`notify-*`, `send-*`, `test-email`) | prod | required (email) | **safe** (live) |
| `FIRECRAWL_API_KEY` | `analyze-career` | prod | optional (LinkedIn scraping) | **safe** (live; optional) |
| `MERIT_SYSTEM_ENABLED` | `_shared/merit-gateway.ts` | prod | optional (merit-system kill-switch) | **safe** (live) |
| `STRIVO_ENV` | `_shared/anthropic.ts:546` (`=== 'staging'` runtime branch) | prod/staging | optional (env discriminator) | **safe** (live; operational, not test-only) |
| `ADMIN_EMAIL` | `_shared/auth.ts`, `notify-admin-activity`, `notify-upgrade-request`, `send-notification-email` | prod | required (admin authz/routing) | **safe** (live — research mis-bucketed as test-only) |
| `ADMIN_EMAILS` | `admin-merit-metrics`, `check-merit-alerts` | prod | required (admin allow-list) | **safe** (live — research mis-bucketed as test-only) |
| `PADDLE_WEBHOOK_SECRET` | `paddle-webhook` (registered `config.toml [functions.paddle-webhook]`) | prod (legacy) | required-while-gated | **unsafe** — KEEP-LIST Class 2 (Paddle remnant, gated-but-live → never `safe`) |
| `STRIPE_PRICE_MERIT_3` | `_shared/shop-pack-resolver.ts` (literal `buildShopPackMap` + template `resolveShopPriceId:64`) | prod | required (merit shop) | **safe** (live; dual literal+template read) |
| `STRIPE_PRICE_MERIT_10` | `_shared/shop-pack-resolver.ts` | prod | required (merit shop) | **safe** (live) |
| `STRIPE_PRICE_MERIT_25` | `_shared/shop-pack-resolver.ts` | prod | required (merit shop) | **safe** (live) |
| `STRIPE_PRICE_MERIT_50` | `_shared/shop-pack-resolver.ts` | prod | required (merit shop) | **safe** (live) |

### Template-literal subscription keys (EXPANDED — the Pitfall-2 landmine, defused)

These are read **only** via the template literal in `price-resolver.ts` — `Deno.env.get(\`STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()}\`)` (line 70) and the `buildPriceMap()` loop (lines 31-33: `STRIPE_PRICE_PRO_${suffix}`, `STRIPE_PRICE_PAID_${suffix}`, `STRIPE_PRICE_ELITE_${suffix}`). A **literal** grep for these names finds them ONLY in `*.test.ts` and `stripe-webhook-handler/DEPLOY_RUNBOOK.md` → a naive audit would falsely class them "consumers: tests only / unused." They are LIVE production secrets.

| Name (expanded) | Construction site | Bucket | Req/Opt | Classification |
| --------------- | ----------------- | ------ | ------- | -------------- |
| `STRIPE_PRICE_PRO_MONTHLY` | `price-resolver.ts:31,70,80` (template) | prod | required (subscriptions) | **unsafe** — KEEP-LIST Class 4 (template-literal key → never `safe` on a literal-grep "unused" reading); **LIVE** |
| `STRIPE_PRICE_PRO_ANNUAL` | `price-resolver.ts:31,70` (template) | prod | required | **unsafe** (Class 4); **LIVE** |
| `STRIPE_PRICE_ELITE_MONTHLY` | `price-resolver.ts:33,70` (template) | prod | required | **unsafe** (Class 4); **LIVE** |
| `STRIPE_PRICE_ELITE_ANNUAL` | `price-resolver.ts:33,70` (template) | prod | required | **unsafe** (Class 4); **LIVE** |
| `STRIPE_PRICE_PAID_MONTHLY` | `price-resolver.ts:32,76` (template; legacy paid-tier alias) | prod | optional (legacy alias) | **unsafe** (Class 4); **LIVE** (legacy) |
| `STRIPE_PRICE_PAID_ANNUAL` | `price-resolver.ts:32,76` (template; legacy paid-tier alias) | prod | optional (legacy alias) | **unsafe** (Class 4); **LIVE** (legacy) |

> `tier ∈ {PRO, ELITE, PAID} × interval ∈ {MONTHLY, ANNUAL}` = 6 concrete keys. `PAID_*` is the legacy single paid-tier alias (`resolvePriceId` falls back to it, then to `PRO_*`, with a `legacy-paid-price-env-used` warn). The merit-pack template (`shop-pack-resolver.ts:64`, `STRIPE_PRICE_MERIT_${packSize}`) expands to the 4 `STRIPE_PRICE_MERIT_{3,10,25,50}` already listed in the production table (they are read literally too).

### OCR / Ollama bucket — optional document-extraction providers (NOT in `.env.example`)

All reached by production code via `_shared/document-extraction.ts` (parser-first routing; these are fallback providers — see D-08 / Open Question 4: fallback live-ness in prod needs log confirmation, owned by DEAD-CODE.md / Phase 4).

| Name | Consumer | Bucket | Req/Opt | Classification |
| ---- | -------- | ------ | ------- | -------------- |
| `MISTRAL_OCR_API_KEY` | `_shared/mistral-ocr-client.ts` ← `document-extraction.ts` | optional (OCR provider) | optional | **needs-investigation** — fallback liveness unconfirmed; absent from `.env.example` |
| `MISTRAL_OCR_ENDPOINT` | `_shared/mistral-ocr-client.ts` | optional | optional | **needs-investigation** — absent from `.env.example` |
| `MISTRAL_OCR_MODEL` | `_shared/mistral-ocr-client.ts` | optional | optional | **needs-investigation** — absent from `.env.example` |
| `TEXTRACT_OCR_ENDPOINT` | `_shared/textract-client.ts` ← `document-extraction.ts` | optional | optional | **needs-investigation** — absent from `.env.example` |
| `TEXTRACT_OCR_TOKEN` | `_shared/textract-client.ts` | optional | optional | **needs-investigation** — absent from `.env.example` |
| `OLLAMA_BASE_URL` | `_shared/ollama-client.ts` ← `document-extraction.ts` | optional (obsolete Phase-50 path?) | optional | **needs-investigation** — D-08 parser-first fallback; absent from `.env.example` |
| `OLLAMA_MODEL` | `_shared/ollama-client.ts` | optional | optional | **needs-investigation** — absent from `.env.example` |
| `OLLAMA_AUTH_HEADER_NAME` | `_shared/ollama-client.ts` | optional | optional | **needs-investigation** — absent from `.env.example` |
| `OLLAMA_AUTH_SECRET` | `_shared/ollama-client.ts` | optional | optional | **needs-investigation** — absent from `.env.example` |
| `OLLAMA_TIMEOUT_MS` | `_shared/ollama-client.ts` | optional | optional | **needs-investigation** — absent from `.env.example` |

### Test / CI-only bucket — toggles & fixtures (not real production secrets)

Several are read by a **production module** but exist purely to drive test behavior (a "test seam"), gated to be inert unless explicitly set. Consumer column records the honest reader; bucket reflects the var's *purpose*.

| Name | Consumer | Bucket | Req/Opt | Classification |
| ---- | -------- | ------ | ------- | -------------- |
| `AI_TEST_MODE` | `_shared/anthropic.ts:564,570,753,761` (two-key test seam) | test/CI (prod-module reader, inert unless set) | optional | **needs-investigation** — test-seam in prod code; documented for Phase 7 |
| `AI_FORCE_FAILURE` | `_shared/anthropic.ts:560-565,751-755` (only with `AI_TEST_MODE`) | test/CI | optional | **needs-investigation** — test-seam (two-key defense) |
| `MERIT_TEST_FORCE_REFUNDABLE_ERROR` | `_shared/anthropic.ts:543` | test/CI (staging) | optional | **needs-investigation** — test-seam |
| `IS_TEST` | `interview-prep-analyze/index.ts` | test/CI | optional | **needs-investigation** — test-seam in gated fn |
| `RUN_EVALS` | `_tests/` only | test/CI | optional | **needs-investigation** — test gate |
| `RUN_LIVE_MERIT` | `_tests/analysis_results_rls_test.ts` | test/CI | optional | **needs-investigation** — live-test gate |
| `RUN_TIER_VALIDATION` | `_tests/` only | test/CI | optional | **needs-investigation** — test gate |
| `DENO_TEST_SUPABASE_LOCAL` | `_tests/` only | test/CI | optional | **needs-investigation** — test routing |
| `DENO_TEST_SUPABASE_REMOTE` | `_tests/` only | test/CI | optional | **needs-investigation** — test routing |
| `STAGING_SUPABASE_URL` | `_tests/analysis_results_rls_test.ts` | test/CI | optional | **needs-investigation** — remote-test target |
| `STAGING_SUPABASE_ANON_KEY` | `_tests/analysis_results_rls_test.ts` | test/CI | optional | **needs-investigation** — remote-test target |
| `TEST_USER_JWT` | `_tests/merit_rls_test.ts`, `_tests/analysis_results_rls_test.ts` | test/CI | optional | **needs-investigation** — test fixture (JWT name only, no value) |
| `TEST_FREE_USER_JWT` | `_tests/` fixtures | test/CI | optional | **needs-investigation** — test fixture |
| `TEST_PRO_USER_JWT` | `_tests/` fixtures | test/CI | optional | **needs-investigation** — test fixture |
| `TEST_PRO_USER_JWT_NO_RESUME` | `_tests/` fixtures | test/CI | optional | **needs-investigation** — test fixture |
| `TEST_ELITE_USER_JWT` | `_tests/` fixtures | test/CI | optional | **needs-investigation** — test fixture |
| `TEST_PRO_USER_ID` | `_tests/` fixtures | test/CI | optional | **needs-investigation** — test fixture |
| `TEST_ELITE_USER_ID` | `_tests/` fixtures | test/CI | optional | **needs-investigation** — test fixture |
| `TEST_USER_A_ID` | `_tests/` fixtures | test/CI | optional | **needs-investigation** — test fixture |
| `TEST_USER_B_ID` | `_tests/` fixtures | test/CI | optional | **needs-investigation** — test fixture |
| `TEST_ELITE_QUIZ_ID` | `_tests/` fixtures | test/CI | optional | **needs-investigation** — test fixture |
| `TEST_ELITE_A_ELITE_TASTE_QUIZ_ID` | `_tests/` fixtures | test/CI | optional | **needs-investigation** — test fixture |
| `TEST_OTHER_USER_ELITE_TASTE_QUIZ_ID` | `_tests/` fixtures | test/CI | optional | **needs-investigation** — test fixture |
| `TEST_PRO_A_ELITE_TASTE_QUIZ_ID` | `_tests/` fixtures | test/CI | optional | **needs-investigation** — test fixture |
| `TEST_PRO_A_PRO_FLASH_QUIZ_ID` | `_tests/` fixtures | test/CI | optional | **needs-investigation** — test fixture |
| `TEST_ELITE_QUESTION_ORDERS` | `_tests/` fixtures | test/CI | optional | **needs-investigation** — test fixture |

> 27 test/CI names. None is a production runtime secret; Phase 7 (ENV-04 separation) should split these into a documented test-only surface, distinct from the production bucket.

---

## `.env.example` ↔ code gaps (both directions)

### Direction A — used in CODE but MISSING from `.env.example` (under-documentation)

| Name | Where used | Why it matters |
| ---- | ---------- | -------------- |
| **`VITE_STRIPE_PUBLISHABLE_KEY`** | `src/components/StripeCheckoutWrapper.tsx:13`, `src/components/topup/StripePaymentElementModal.tsx:61` | The headline frontend gap (RESEARCH). A required prod var for Stripe checkout, undocumented in the template. Phase 7 ENV-03 must add it. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `_shared/stripe-client.ts`, `stripe-webhook-handler` | Required prod Stripe secrets; `.env.example` still lists only the legacy `PADDLE_WEBHOOK_SECRET`. |
| `STRIPE_PRICE_{PRO,ELITE,PAID}_{MONTHLY,ANNUAL}` (6) | `price-resolver.ts` (template) | Required subscription price IDs; undocumented (the runbook documents them, the template does not). |
| `STRIPE_PRICE_MERIT_{3,10,25,50}` (4) | `shop-pack-resolver.ts` | Required merit-shop price IDs; undocumented. |
| `MISTRAL_OCR_*` (3), `TEXTRACT_OCR_*` (2), `OLLAMA_*` (5) | OCR/Ollama clients via `document-extraction.ts` | Optional document-extraction providers; entirely absent from `.env.example` (RESEARCH-flagged). |
| `MERIT_SYSTEM_ENABLED` | `_shared/merit-gateway.ts` | Merit-system kill-switch; undocumented. |
| `ADMIN_EMAIL`, `ADMIN_EMAILS` | admin/auth/notify fns | Admin authz allow-lists; undocumented (and mis-bucketed as test-only in research — they are production). |
| `STRIVO_ENV` | `_shared/anthropic.ts` | Staging discriminator (`=== 'staging'`); undocumented. |
| 27 test/CI names (`AI_TEST_MODE`, `TEST_*_JWT`, `STAGING_SUPABASE_*`, etc.) | `_tests/` + test seams | Most absent from `.env.example` (only `SUPABASE_TEST_*`/`E2E_TEST_PASSWORD`/`STRIPE_TEST_PUBLISHABLE_KEY` are documented). |

### Direction B — DOCUMENTED in `.env.example` but NO consumer found in `src`/`supabase/functions`/`e2e`/config

| Name | Status | Note |
| ---- | ------ | ---- |
| `SUPABASE_TEST_URL` | consumed | `e2e/global-setup.ts` — live (E2E tooling, outside `src`/`functions`) |
| `SUPABASE_TEST_SERVICE_ROLE_KEY` | consumed | `e2e/global-setup.ts` — live |
| `E2E_TEST_PASSWORD` | consumed | `e2e/auth.setup.ts`, `e2e/global-setup.ts` — live |
| `SUPABASE_TEST_ANON_KEY` | **no consumer found** | documented in `.env.example:29` but no `rg` hit in `src`/`functions`/`e2e`/config → `needs-investigation` for Phase 7 (stale doc or used only in shell/CI env) |
| `STRIPE_TEST_PUBLISHABLE_KEY` | **no consumer found** | documented in `.env.example:32` (`pk_test_…` placeholder) but no code consumer → `needs-investigation` (likely shell/CI-only; possibly the test analog of `VITE_STRIPE_PUBLISHABLE_KEY`) |

> `.env.example` documents 18 NAMES (read names-only). The two Direction-B "no consumer found" entries are documentation-vs-code gaps for Phase 7 ENV-02 to reconcile (resolve whether stale or shell-only), not removal candidates here.

---

## Re-Assertion / Reproduce (Phase 7 re-derives identically)

```bash
# Frontend (dotted + cast-form catch)
rg -n "import\.meta\.env\.\w+" src -o
rg -n "VITE_[A-Z_0-9]+" src -o            # catches perf.ts cast access

# Edge literal (→ 57 distinct)
rg -o "Deno\.env\.get\(['\"]([A-Z_0-9]+)['\"]" -r '$1' supabase/functions --no-filename | sort -u

# Edge template-literal landmine (→ price-resolver.ts ×3, shop-pack-resolver.ts ×1)
rg -n 'Deno\.env\.get\(`' supabase/functions
rg -n 'Deno\.env\.get\([a-z]' supabase/functions   # computed-key reads
```

```powershell
# PowerShell equivalents (primary shell)
rg -n "import\.meta\.env\.\w+" src -o
rg -o "Deno\.env\.get\([`'`"]([A-Z_0-9]+)[`'`"]" -r '$1' supabase/functions --no-filename | Sort-Object -Unique
rg -n 'Deno\.env\.get\(`' supabase/functions
```

### Secret-pattern grep guard over THIS file (T-3-07 — must return NO match)

```bash
rg -nE "sk_live_[A-Za-z0-9]{20}|sk_test_[A-Za-z0-9]{20}|pk_live_[A-Za-z0-9]{20}|service_role[^a-zA-Z0-9]{0,40}eyJ|eyJ[A-Za-z0-9_-]{30,}|price_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----" .planning/audit/ENV-INVENTORY.md
# Expected: NO match. This catalog records NAMES + consumers + required/optional ONLY.
```

*This file records variable names, consumer file paths, environment buckets, and required/optional status only — no secret value is pasted anywhere in it.*

---

## Cross-References

- **[`KEEP-LIST.md`](./KEEP-LIST.md)** — the mandatory `safe`-classification gate. Applied AFTER the static enumeration: Class 1 forces `VITE_FEATURE_INTERVIEW_PREP` never-`safe` (feature-flagged); Class 2 forces `PADDLE_WEBHOOK_SECRET` never-`safe` (Paddle remnant); Class 4 forces the 6 `STRIPE_PRICE_{PRO,ELITE,PAID}_{MONTHLY,ANNUAL}` template-literal keys never-`safe` and LIVE (the defused landmine).
- **[`INDEX.md`](./INDEX.md)** — catalog entry point; ENV-INVENTORY.md row (ENV-01, 03-04 → Phase 7).
- **`.planning/phases/03-cross-domain-inventory-audit/03-RESEARCH.md`** — Pattern 4 (dynamic/template-literal detection), Pitfall 2 (Stripe price-ID template-literal trap), Domain-Specific Verified Findings → Env (the ~57 surface, VITE_STRIPE gap, OCR/Ollama gaps, VITE_DEBUG_PERF Open Question 1).
- **`.planning/phases/02-repository-hygiene-state-reconciliation/02-SECRET-SCAN.md`** — the REPO-05 names-not-values discipline this catalog inherits (T-3-07 mitigation).
- **Consumer: Phase 7 (Environment Variable Audit & Organization)** — ENV-02 (consolidation: reconcile the ~46 code-not-example gaps + 2 example-not-code gaps), ENV-03 (canonical `.env.example`: add `VITE_STRIPE_PUBLISHABLE_KEY` + Stripe/OCR/Ollama/admin families), ENV-04 (prod vs test/CI separation: split the 27 test names out), ENV-05 (fail-closed validation: required-set enforcement, the OCR `needs-investigation` resolution).

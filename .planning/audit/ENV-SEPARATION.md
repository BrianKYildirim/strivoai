# ENV-04 — Cross-Surface Environment Separation Audit (prod vs preview)

**Phase:** 07 — Environment Variable Audit & Organization
**Plan:** 07-03 (ENV-04)
**Run date:** 2026-06-23
**Branch / HEAD:** `staging`
**Tooling:** OPERATOR-run names-only listing commands (`supabase secrets list`, `gh secret list`, `vercel env ls`) reconciled by the agent. NO live secret store is read or written by the agent (Supabase prod is MCP read-only; the secrets store is not MCP-reachable; we run no `secrets set`/`unset`). Repo-side topology read from `scripts/deploy.ps1` (read-only).

> ## WARNING: VALUES ARE NEVER RECORDED — names, consumers, surface presence only.
>
> This audit is committed to a tracked repo. Per Phase-2 REPO-05 / `02-SECRET-SCAN.md` discipline
> (the highest-severity threat class here, **T-3-07**), it records **variable NAMES + surface presence
> (present/absent) + classification ONLY** — never a key, token, JWT, price ID, or connection string.
> The operator pastes secret NAMES (never values); the agent records name + per-surface presence, never a
> value. The project-refs `zjpjapgraoxdukdvpjes` / `cimjltzovkahkqecpwgi` are project IDENTIFIERS (not
> secrets) and are acceptable, matching the existing audit docs. A post-write secret-pattern grep guard
> (corrected, no `-E`) is run over this file before commit and MUST return **zero** matches.

***

## Verdict / Status

| Field                     | Value                                                                                                                                                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit scaffold            | **READY** (topology + 4 operator commands + matrix + findings taxonomy)                                                                                                                                                                                                 |
| Live reconciliation       | **COMPLETE** (operator ran the 4 names-only listings 2026-06-23; matrix filled, anomalies classified, fix list emitted)                                                                                                                                                 |
| Store mutation            | **NONE** (D-07 — phase closes on the documented audit + operator fix list; no live store mutated by the agent)                                                                                                                                                          |
| Headline verdict          | **No classic cross-environment leakage** — no prod-live secret found in any test/CI/preview surface; GitHub Actions holds exactly the 5 TEST-project gate secrets. Findings are misplaced/orphaned/missing-required, NOT leakage.                                       |
| Highest-attention finding | `AI_TEST_MODE` set on **prod** Supabase (read by `_shared/anthropic.ts` — stubs all AI when value is `'true'`); + a cluster of Supabase->Vercel integration-injected privileged secrets in the Vercel frontend host (NOT browser-exposed — Vite bundles only `VITE_*`). **— RESOLVED 2026-06-23** (AI_TEST_MODE un-set from prod; Vercel pruned to the 4 `VITE_*` names). |
| Operator remediation      | **DONE (2026-06-23)** — operator actioned the Section-5 fix list and re-listed all four surfaces: 9/10 items resolved, item 9 confirmed intentional (Free + Elite only, no Pro). Topology now clean + well-separated. See [Section 6](#6-post-remediation-operator-pass-2026-06-23).                                                                                       |

***

## 1. Env -> project-ref topology (from `scripts/deploy.ps1`, the authoritative selector)

The deploy script is the **single source of truth** for which Supabase project an environment targets.
Selection is an explicit `supabase link --project-ref <ref>` (`scripts/deploy.ps1:112`), **NOT** a
`supabase/config.toml` `project_id` swap (the config-copy footgun was intentionally removed — see the
`deploy.ps1` header comment L10-12).

```
production -> zjpjapgraoxdukdvpjes   (strivoai, prod)               deploy.ps1:73
staging    -> cimjltzovkahkqecpwgi   (strivoaipreview)              deploy.ps1:74
test       -> cimjltzovkahkqecpwgi   (test reuses strivoaipreview)  deploy.ps1:75
```

**Honest topology (Pitfall 5):** there are **TWO Supabase environments, not three**.
"staging" and "test" map to the **same project** (`cimjltzovkahkqecpwgi`) — there is **no separate staging
Supabase env**. The real separation axis is **prod (`zjpjapgraoxdukdvpjes`) vs preview(=staging=test)
(`cimjltzovkahkqecpwgi`)**. `supabase/config.toml` is the local-link default only (35 `[functions.*]
verify_jwt` blocks); it is **not** the deploy selector.

> The frontend (`VITE_*`) is a separate surface entirely — baked at **build time** by Vercel, split into
> a **Production** environment and a **Preview** environment (the `VITE_FEATURE_INTERVIEW_PREP`
> Preview=`true` / Production=`false` axis is the key per-env separation signal there).

***

## 2. Four-surface operator-command table (names only, D-06)

The operator runs each command and pastes back **NAMES ONLY** (never values). Each row documents the
EXPECTED bucket (what names SHOULD be there) and the leakage tell (what would indicate cross-environment
leakage).

| Surface                                          | What it holds                        | Operator command (names only)                              | Expected bucket                                                                                                                                                                                                                                                                                                                     | Leakage tell                                                                                                                                              |
| ------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase **prod** `zjpjapgraoxdukdvpjes`         | server-side edge secrets (prod)      | `supabase secrets list --project-ref zjpjapgraoxdukdvpjes` | prod edge set: `ANTHROPIC_API_KEY`, `APP_URL`, `INTERNAL_JOB_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the 6+4 `STRIPE_PRICE_*`, `RESEND_API_KEY`, `SUPABASE_*`, `ADMIN_EMAIL(S)`, `MERIT_SYSTEM_ENABLED`, `STRIVO_ENV`, OCR fallbacks (if set).                                                                       | a `*_TEST_*` / `STAGING_SUPABASE_*` / `AI_TEST_MODE` name, or any `OLLAMA_*`, appearing in prod = misplaced/orphaned                                      |
| Supabase **preview/test** `cimjltzovkahkqecpwgi` | edge secrets for staging + test-mode | `supabase secrets list --project-ref cimjltzovkahkqecpwgi` | same edge set but **test-mode** (`APP_URL` = localhost/preview origin, `AI_TEST_MODE` true, Stripe **test**-mode keys, test price IDs).                                                                                                                                                                                             | a prod-only value/ref (e.g. a Stripe **live** secret) here = **leakage**; any `OLLAMA_*` = orphaned                                                       |
| **GitHub Actions** repo secrets                  | CI E2E build + runner                | `gh secret list`                                           | exactly the gate's set: `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, `STRIPE_TEST_PUBLISHABLE_KEY`, `E2E_TEST_PASSWORD` (they back `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`VITE_STRIPE_PUBLISHABLE_KEY` at build — see `.github/workflows/regression-gate.yml:63-71`). TEST-project only. | a prod project-ref or prod secret name here = **leakage** (T-05-05)                                                                                       |
| **Vercel** env vars (frontend)                   | `VITE_*` baked at build              | `vercel env ls` (or the dashboard listing)                 | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_ANALYZE_CAREER_FUNCTION`, `VITE_DEBUG_PERF`, `VITE_FEATURE_INTERVIEW_PREP`. **Production** env -> `false`/prod values; **Preview** env -> `true`/preview values.                                               | a **server-side** secret (e.g. `STRIPE_SECRET_KEY`, `ANTHROPIC_API_KEY`) set as a Vercel `VITE_*` = **misplaced** (would be public in the browser bundle) |

> **Operator note (the Vercel split is the key signal):** record the `VITE_FEATURE_INTERVIEW_PREP` value
> per Vercel environment — it MUST be Preview=`true` / Production=`false` (fail-closed gating; the only
> name where the per-environment value is itself the separation invariant). Names + which-environment
> only; never a key value.

***

## 3. Cross-surface reconciliation matrix (FILLED from operator names-only output, 2026-06-23)

Cells: `Y` = name present on that surface, `-` = absent. Columns are the five distinct surfaces:
`prod-Supabase` (`zjpjapgraoxdukdvpjes`), `preview-Supabase` (`cimjltzovkahkqecpwgi`), `GitHub-Actions`,
`Vercel-prod`, `Vercel-preview`. Consumer evidence was re-confirmed against code at HEAD (greps cited in 07-03-SUMMARY.md).

### 3a. Production edge secrets

| Name                        | prod-Supabase | preview-Supabase | GitHub-Actions | Vercel-prod | Vercel-preview | Expected bucket                             | Finding                                                                                  |
| --------------------------- | :-----------: | :--------------: | :------------: | :---------: | :------------: | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`         |       Y       |         Y        |        -       |      -      |        -       | Supabase prod + preview                     | OK                                                                                       |
| `ANTHROPIC_MODEL_TEXT`      |       Y       |         Y        |        -       |      -      |        -       | Supabase prod + preview (opt)               | OK                                                                                       |
| `ANTHROPIC_MODEL_FALLBACK`  |       Y       |         -        |        -       |      -      |        -       | Supabase prod + preview (opt)               | OK (preview falls back to default)                                                       |
| `SUPABASE_URL`              |       Y       |         Y        |        -       |      Y      |        -       | Supabase prod + preview                     | Vercel-prod=Y -> orphaned (integration-injected, non-`VITE_`, inert in SPA)              |
| `SUPABASE_SERVICE_ROLE_KEY` |       Y       |         Y        |        -       |      Y      |        -       | Supabase prod + preview                     | **Vercel-prod=Y -> misplaced (privileged secret in frontend host; not browser-exposed)** |
| `SUPABASE_ANON_KEY`         |       Y       |         Y        |        -       |      Y      |        -       | Supabase prod + preview                     | Vercel-prod=Y -> orphaned (public-safe, unprefixed, unused by SPA)                       |
| `INTERNAL_JOB_SECRET`       |       Y       |         Y        |        -       |      -      |        -       | Supabase prod + preview                     | OK                                                                                       |
| `APP_URL`                   |       Y       |         Y        |        -       |      -      |        -       | Supabase prod + preview (per-env value)     | OK                                                                                       |
| `STRIPE_SECRET_KEY`         |       Y       |         Y        |        -       |      -      |        -       | Supabase prod + preview (live vs test)      | OK                                                                                       |
| `STRIPE_WEBHOOK_SECRET`     |       Y       |         Y        |        -       |      -      |        -       | Supabase prod + preview (live vs test)      | OK                                                                                       |
| `RESEND_API_KEY`            |       Y       |         -        |        -       |      -      |        -       | Supabase prod (+ preview opt)               | note: preview absent -> degraded-email only (acceptable for preview)                     |
| `FIRECRAWL_API_KEY`         |       -       |         -        |        -       |      -      |        -       | Supabase prod + preview (opt)               | OK (absent both; optional)                                                               |
| `MERIT_SYSTEM_ENABLED`      |       -       |         Y        |        -       |      -      |        -       | Supabase prod + preview (opt kill-switch)   | config-divergence: preview-only (see 3b merit prices) — verify rollout intent            |
| `STRIVO_ENV`                |       -       |         -        |        -       |      -      |        -       | Supabase prod + preview (opt discriminator) | OK (absent both; staging detected via host fallback in anthropic.ts)                     |
| `ADMIN_EMAIL`               |       Y       |         -        |        -       |      -      |        -       | Supabase prod (+ preview opt)               | OK (preview falls back to default in auth.ts)                                            |
| `ADMIN_EMAILS`              |       -       |         -        |        -       |      -      |        -       | Supabase prod + preview (opt)               | OK (absent both; user\_roles RBAC fallback)                                              |
| `PADDLE_WEBHOOK_SECRET`     |       Y       |         -        |        -       |      -      |        -       | Supabase prod (legacy, gated-but-live)      | known legacy (carried-forward cleanup target; not an anomaly)                            |
| `SUPABASE_DB_URL`           |       Y       |         Y        |        -       |      -      |        -       | Supabase platform default (both)            | OK (Supabase-provided)                                                                   |
| `SUPABASE_JWKS`             |       Y       |         Y        |        -       |      -      |        -       | Supabase platform default (both)            | OK (Supabase-provided)                                                                   |
| `SUPABASE_PUBLISHABLE_KEYS` |       Y       |         Y        |        -       |      -      |        -       | Supabase platform default (both)            | OK (Supabase-provided)                                                                   |
| `SUPABASE_SECRET_KEYS`      |       Y       |         Y        |        -       |      -      |        -       | Supabase platform default (both)            | OK (Supabase-provided)                                                                   |

### 3b. Stripe price IDs (read via `price-resolver.ts` / `shop-pack-resolver.ts` template literals)

| Name                         | prod-Supabase | preview-Supabase | GitHub-Actions | Vercel-prod | Vercel-preview | Expected bucket                        | Finding                                                                     |
| ---------------------------- | :-----------: | :--------------: | :------------: | :---------: | :------------: | -------------------------------------- | --------------------------------------------------------------------------- |
| `STRIPE_PRICE_PRO_MONTHLY`   |       -       |         -        |        -       |      -      |        -       | Supabase prod + preview                | note: absent BOTH (consistent) — confirm PRO tier not sold via env price ID |
| `STRIPE_PRICE_PRO_ANNUAL`    |       -       |         -        |        -       |      -      |        -       | Supabase prod + preview                | note: absent BOTH (consistent)                                              |
| `STRIPE_PRICE_ELITE_MONTHLY` |       Y       |         Y        |        -       |      -      |        -       | Supabase prod + preview                | OK                                                                          |
| `STRIPE_PRICE_ELITE_ANNUAL`  |       Y       |         Y        |        -       |      -      |        -       | Supabase prod + preview                | OK                                                                          |
| `STRIPE_PRICE_PAID_MONTHLY`  |       -       |         -        |        -       |      -      |        -       | Supabase prod + preview (legacy alias) | note: absent BOTH (legacy alias retired)                                    |
| `STRIPE_PRICE_PAID_ANNUAL`   |       -       |         -        |        -       |      -      |        -       | Supabase prod + preview (legacy alias) | note: absent BOTH                                                           |
| `STRIPE_PRICE_MERIT_3`       |       -       |         Y        |        -       |      -      |        -       | Supabase prod + preview                | config-divergence: preview-only (merit subsystem)                           |
| `STRIPE_PRICE_MERIT_10`      |       -       |         Y        |        -       |      -      |        -       | Supabase prod + preview                | config-divergence: preview-only                                             |
| `STRIPE_PRICE_MERIT_25`      |       -       |         Y        |        -       |      -      |        -       | Supabase prod + preview                | config-divergence: preview-only                                             |
| `STRIPE_PRICE_MERIT_50`      |       -       |         Y        |        -       |      -      |        -       | Supabase prod + preview                | config-divergence: preview-only                                             |

### 3c. OCR fallbacks (optional)

| Name                    | prod-Supabase | preview-Supabase | GitHub-Actions | Vercel-prod | Vercel-preview | Expected bucket               | Finding                                                  |
| ----------------------- | :-----------: | :--------------: | :------------: | :---------: | :------------: | ----------------------------- | -------------------------------------------------------- |
| `MISTRAL_OCR_API_KEY`   |       -       |         -        |        -       |      -      |        -       | Supabase prod + preview (opt) | OK (absent all; parser-first, OCR fallback unconfigured) |
| `MISTRAL_OCR_ENDPOINT`  |       -       |         -        |        -       |      -      |        -       | Supabase prod + preview (opt) | OK                                                       |
| `MISTRAL_OCR_MODEL`     |       -       |         -        |        -       |      -      |        -       | Supabase prod + preview (opt) | OK                                                       |
| `TEXTRACT_OCR_ENDPOINT` |       -       |         -        |        -       |      -      |        -       | Supabase prod + preview (opt) | OK                                                       |
| `TEXTRACT_OCR_TOKEN`    |       -       |         -        |        -       |      -      |        -       | Supabase prod + preview (opt) | OK                                                       |

### 3d. CI / E2E secrets (expected on GitHub Actions only — exactly what `regression-gate.yml:63-71` reads)

| Name                             | prod-Supabase | preview-Supabase | GitHub-Actions | Vercel-prod | Vercel-preview | Expected bucket     | Finding                          |
| -------------------------------- | :-----------: | :--------------: | :------------: | :---------: | :------------: | ------------------- | -------------------------------- |
| `SUPABASE_TEST_URL`              |       -       |         -        |        Y       |      -      |        -       | GitHub Actions (CI) | OK                               |
| `SUPABASE_TEST_ANON_KEY`         |       -       |         -        |        Y       |      -      |        -       | GitHub Actions (CI) | OK                               |
| `SUPABASE_TEST_SERVICE_ROLE_KEY` |       -       |         -        |        Y       |      -      |        -       | GitHub Actions (CI) | OK (TEST-project seed; not prod) |
| `STRIPE_TEST_PUBLISHABLE_KEY`    |       -       |         -        |        Y       |      -      |        -       | GitHub Actions (CI) | OK                               |
| `E2E_TEST_PASSWORD`              |       -       |         -        |        Y       |      -      |        -       | GitHub Actions (CI) | OK                               |

> **GitHub Actions surface = CLEAN.** All 5 secrets are TEST-project scoped, each consumed by `regression-gate.yml:63-71`; none is a prod ref or prod secret. No leakage (T-05-05 negative-confirmed).

### 3e. Frontend `VITE_*` (expected on Vercel only)

| Name                            | prod-Supabase | preview-Supabase | GitHub-Actions | Vercel-prod | Vercel-preview | Expected bucket                                                | Finding                                                                                                                 |
| ------------------------------- | :-----------: | :--------------: | :------------: | :---------: | :------------: | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             |       -       |         -        |        -       |      Y      |        Y       | Vercel prod + preview                                          | OK (consumed: supabaseClient.ts, useResumeStream.ts)                                                                    |
| `VITE_SUPABASE_PUBLISHABLE_KEY` |       -       |         -        |        -       |      -      |        -       | Vercel prod + preview (opt)                                    | OK (absent both; ANON\_KEY fallback present)                                                                            |
| `VITE_SUPABASE_ANON_KEY`        |       -       |         -        |        -       |      Y      |        Y       | Vercel prod + preview                                          | OK                                                                                                                      |
| `VITE_STRIPE_PUBLISHABLE_KEY`   |       -       |         -        |        -       |      Y      |        Y       | Vercel prod + preview                                          | OK (consumed: StripeCheckoutWrapper.tsx)                                                                                |
| `VITE_ANALYZE_CAREER_FUNCTION`  |       -       |         -        |        -       |      -      |        -       | Vercel prod + preview (opt)                                    | OK (default 'analyze-career')                                                                                           |
| `VITE_DEBUG_PERF`               |       -       |         -        |        -       |      -      |        -       | Vercel prod + preview (opt)                                    | OK (default off)                                                                                                        |
| `VITE_FEATURE_INTERVIEW_PREP`   |       -       |         -        |        -       |      Y      |        -       | **Vercel-prod=false / Vercel-preview=true** (gating invariant) | **missing-required (Vercel-preview): absent -> hidden on preview (fail-closed); design intent is preview=true visible** |

### 3f. Orphan candidates (pre-seeded — should be ABSENT everywhere)

| Name                      | prod-Supabase | preview-Supabase | GitHub-Actions | Vercel-prod | Vercel-preview | Expected bucket               | Finding                                                          |
| ------------------------- | :-----------: | :--------------: | :------------: | :---------: | :------------: | ----------------------------- | ---------------------------------------------------------------- |
| `OLLAMA_BASE_URL`         |       -       |         -        |        -       |      -      |        -       | NONE (code-dead post-Phase-4) | CONFIRMED absent all surfaces                                    |
| `OLLAMA_MODEL`            |       -       |         -        |        -       |      -      |        -       | NONE (code-dead)              | CONFIRMED absent                                                 |
| `OLLAMA_AUTH_HEADER_NAME` |       -       |         -        |        -       |      -      |        -       | NONE (code-dead)              | CONFIRMED absent                                                 |
| `OLLAMA_AUTH_SECRET`      |       -       |         -        |        -       |      -      |        -       | NONE (code-dead)              | CONFIRMED absent                                                 |
| `OLLAMA_TIMEOUT_MS`       |       -       |         -        |        -       |      -      |        -       | NONE (code-dead)              | CONFIRMED absent                                                 |
| `RAPIDAPI_KEY`            |       -       |         -        |        -       |      -      |        -       | NONE (doc-ghost)              | CONFIRMED absent all surfaces (doc-cleanup only -> 07-04 NFR-03) |

### 3g. NEW live-store names found by the operator pass (not pre-seeded)

| Name                                   | prod-Supabase | preview-Supabase | GitHub-Actions | Vercel-prod | Vercel-preview | Consumer evidence                                                                                                                      | Finding                                                                                                                        |
| -------------------------------------- | :-----------: | :--------------: | :------------: | :---------: | :------------: | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `AI_TEST_MODE`                         |       Y       |         Y        |        -       |      -      |        -       | `_shared/anthropic.ts:564,570,753,761` (prod-read; stubs AI when `=== 'true'`)                                                         | **prod=Y -> misplaced (test seam on prod; latent footgun). preview=Y expected.** Verify prod value != 'true'; unset from prod. |
| `AI_PROVIDER`                          |       Y       |         -        |        -       |      -      |        -       | ZERO code consumer (grep `supabase/functions`)                                                                                         | **orphaned** (vestigial multi-provider abstraction) -> ENV-02 un-set list                                                      |
| `GOOGLE_GEMINI_API_KEY`                |       Y       |         -        |        -       |      -      |        -       | ZERO code consumer (no Gemini integration in repo)                                                                                     | **orphaned** -> ENV-02 un-set list                                                                                             |
| `SERVICE_ROLE_KEY` (bare)              |       -       |         Y        |        -       |      -      |        -       | no prod consumer; only a remote-deno-test-harness comment (`merit-gateway.refund.test.ts:306`); edge reads `SUPABASE_SERVICE_ROLE_KEY` | **orphaned/redundant** (preview) — confirm remote-test usage else unset                                                        |
| `PERF_TEST_EMAIL`                      |       -       |         Y        |        -       |      -      |        -       | perf-validation harness (test project)                                                                                                 | OK (test seam, belongs in preview/test)                                                                                        |
| `PERF_TEST_PASSWORD`                   |       -       |         Y        |        -       |      -      |        -       | perf-validation harness (test project)                                                                                                 | OK (test seam)                                                                                                                 |
| `POSTGRES_URL`                         |       -       |         -        |        -       |      Y      |        -       | ZERO consumer in Vite SPA (Supabase->Vercel integration auto-inject)                                                                   | **orphaned** (DB conn string in frontend host; not `VITE_`-bundled)                                                            |
| `POSTGRES_PRISMA_URL`                  |       -       |         -        |        -       |      Y      |        -       | ZERO consumer                                                                                                                          | **orphaned**                                                                                                                   |
| `POSTGRES_URL_NON_POOLING`             |       -       |         -        |        -       |      Y      |        -       | ZERO consumer                                                                                                                          | **orphaned**                                                                                                                   |
| `POSTGRES_USER`                        |       -       |         -        |        -       |      Y      |        -       | ZERO consumer                                                                                                                          | **orphaned**                                                                                                                   |
| `POSTGRES_HOST`                        |       -       |         -        |        -       |      Y      |        -       | ZERO consumer                                                                                                                          | **orphaned**                                                                                                                   |
| `POSTGRES_PASSWORD`                    |       -       |         -        |        -       |      Y      |        -       | ZERO consumer                                                                                                                          | **misplaced (DB credential in frontend host; not** **`VITE_`-bundled)**                                                        |
| `POSTGRES_DATABASE`                    |       -       |         -        |        -       |      Y      |        -       | ZERO consumer                                                                                                                          | **orphaned**                                                                                                                   |
| `SUPABASE_SECRET_KEY`                  |       -       |         -        |        -       |      Y      |        -       | ZERO consumer (Vite reads only `VITE_*`)                                                                                               | **misplaced (privileged secret in frontend host)**                                                                             |
| `SUPABASE_JWT_SECRET`                  |       -       |         -        |        -       |      Y      |        -       | ZERO consumer                                                                                                                          | **misplaced (JWT signing secret in frontend host)**                                                                            |
| `SUPABASE_PUBLISHABLE_KEY`             |       -       |         -        |        -       |      Y      |        -       | ZERO consumer (unprefixed; SPA reads `VITE_*`)                                                                                         | **orphaned** (public-safe, unused)                                                                                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`        |       -       |         -        |        -       |      Y      |        -       | ZERO consumer (Next.js naming; Vite app)                                                                                               | **orphaned** (public-safe)                                                                                                     |
| `NEXT_PUBLIC_SUPABASE_URL`             |       -       |         -        |        -       |      Y      |        -       | ZERO consumer (Next.js naming)                                                                                                         | **orphaned**                                                                                                                   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |       -       |         -        |        -       |      Y      |        -       | ZERO consumer (Next.js naming)                                                                                                         | **orphaned**                                                                                                                   |

> **Vercel frontend-host note (the key security framing — measured, not alarmist):** the Vercel Production env holds \~20 names but the Vite SPA reads ONLY `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_FEATURE_INTERVIEW_PREP` (greps: `src/lib/supabaseClient.ts`, `src/components/StripeCheckoutWrapper.tsx`, `src/config/feature-flags.ts`, `src/lib/perf.ts`, `src/pages/CareerCompass.tsx`, `src/hooks/useResumeStream.ts`). The other \~16 are Supabase->Vercel integration auto-injection. Vite exposes ONLY `VITE_`-prefixed vars to the client bundle, so the unprefixed privileged names (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`, `POSTGRES_PASSWORD`, etc.) are **NOT shipped to browsers** — this is NOT an active client-side exposure. The finding is that prod service-role / DB credentials sit in a third-party frontend host's env store, needlessly widening blast radius. Recommended: prune the unused integration-injected vars (or disable the integration's env sync), keeping only the 4 consumed `VITE_*`.

***

## 4. Findings taxonomy (D-07)

Every anomaly the matrix surfaces is classified into exactly one of four classes. One concrete example
each:

* **leakage** — a prod-only value/ref appearing in a test/CI/preview surface.
  *Example:* a Stripe **live** secret value present in preview `cimjltzovkahkqecpwgi`, or a prod
  project-ref configured in a GitHub Actions secret.
* **misplaced** — a name set on the wrong surface (right kind of value, wrong place).
  *Example:* a server-side `STRIPE_SECRET_KEY` set as a Vercel `VITE_*` (would ship to the browser
  bundle), or a test-seam (`AI_TEST_MODE`) set on prod Supabase.
* **missing-required** — a required name absent where it must be present.
  *Example:* `STRIPE_WEBHOOK_SECRET` absent on prod Supabase, or `APP_URL` absent on preview.
* **orphaned** — a name set in a live store with no code/CI consumer.
  *Example:* any `OLLAMA_*` still set anywhere (code-dead post-Phase-4), or `RAPIDAPI_KEY` if set.

***

## 5. Operator fix list (names only) — TO BE FILLED FROM THE OPERATOR PASS

> Filled from the reconciliation matrix after the operator pastes the four names-only listings. Each item:
> **name + surface + class + action** — names only, never a value. We mutate NO store (D-07); these are
> operator actions on the operator's schedule.

| #  | Name(s)                                                                                                                                                                                                                  | Surface                                       | Class                                                                            | Operator action                                                                                                                                                                                                                                                                                                                                                                                       |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | `AI_TEST_MODE`                                                                                                                                                                                                           | Supabase **prod** (`zjpjapgraoxdukdvpjes`)    | misplaced (test seam on prod)                                                    | **First verify the prod VALUE is NOT** **`'true'`** (if `'true'`, all AI is currently stubbed via `_shared/anthropic.ts` = SEV-1 — almost certainly not the case since prod AI works, but confirm). Then `supabase secrets unset AI_TEST_MODE --project-ref zjpjapgraoxdukdvpjes` — it has no legitimate prod purpose. (Paired `AI_FORCE_FAILURE` correctly ABSENT in prod — two-key defense intact.) |
| 2  | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`, `POSTGRES_PASSWORD`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_DATABASE` | **Vercel (Production)**                       | misplaced (privileged server-side secrets / DB credentials in the frontend host) | Supabase->Vercel integration auto-injected; the Vite SPA never reads them and Vite does NOT bundle unprefixed vars (not browser-exposed). Remove them from Vercel (or disable the integration's env sync) to shrink blast radius. Keep only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_FEATURE_INTERVIEW_PREP`.                                              |
| 3  | `SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                                                     | **Vercel (Production)**                       | orphaned (no consumer; public-safe)                                              | Lower priority cleanup — same integration-injection source; the SPA reads `VITE_`-prefixed names only. Remove with the item-2 prune.                                                                                                                                                                                                                                                                  |
| 4  | `VITE_FEATURE_INTERVIEW_PREP`                                                                                                                                                                                            | **Vercel (Preview)**                          | missing-required (preview)                                                       | Present on Vercel-prod, ABSENT on Vercel-preview. Per `feature-flags.ts` (unset -> hidden, fail-closed) Interview Prep is hidden on preview deploys; design intent is Preview=`true` (visible for testing). Set `VITE_FEATURE_INTERVIEW_PREP=true` on the Vercel **Preview** scope if you want it testable on preview; confirm Production value is `false`. Safe either way (fail-closed).            |
| 5  | `GOOGLE_GEMINI_API_KEY`                                                                                                                                                                                                  | Supabase **prod**                             | orphaned                                                                         | Zero code consumer (no Gemini integration in repo). Confirm no out-of-repo consumer, then `supabase secrets unset GOOGLE_GEMINI_API_KEY --project-ref zjpjapgraoxdukdvpjes`. Appended to ENV-02 un-set list.                                                                                                                                                                                          |
| 6  | `AI_PROVIDER`                                                                                                                                                                                                            | Supabase **prod**                             | orphaned                                                                         | Zero code consumer (no provider-switch logic reads it). Confirm, then unset from prod. Appended to ENV-02 un-set list.                                                                                                                                                                                                                                                                                |
| 7  | `SERVICE_ROLE_KEY` (bare)                                                                                                                                                                                                | Supabase **preview** (`cimjltzovkahkqecpwgi`) | orphaned / redundant                                                             | No prod edge consumer (edge reads `SUPABASE_SERVICE_ROLE_KEY`, already present); only a remote-deno-test-harness comment references a bare `SERVICE_ROLE_KEY`. Confirm whether the `DENO_TEST_SUPABASE_REMOTE` harness reads it; if not, unset from preview. Appended to ENV-02 un-set list (pending-confirm).                                                                                        |
| 8  | `MERIT_SYSTEM_ENABLED`, `STRIPE_PRICE_MERIT_3/10/25/50`                                                                                                                                                                  | Supabase **preview-only** (absent prod)       | config-divergence (note, not anomaly)                                            | The merit subsystem (kill-switch + 4 merit-pack price IDs) is configured on preview but not prod — internally consistent. Confirm this matches the intended rollout (merit packs preview/staging-only, not yet live in prod). No security risk; safe direction.                                                                                                                                       |
| 9  | `STRIPE_PRICE_PRO_*`, `STRIPE_PRICE_PAID_*`                                                                                                                                                                              | absent on BOTH Supabase stores                | note (consistent; likely intentional)                                            | PRO + PAID(legacy-alias) tier price IDs unset in both prod and preview. `price-resolver.ts` builds `STRIPE_PRICE_${tier}_${cycle}` dynamically; a PRO checkout would fail to resolve. Confirm PRO/PAID tiers are no longer sold via env price IDs (Elite + merit-pack catalog only). If PRO is still offered -> missing-required on BOTH stores.                                                      |
| 10 | `PADDLE_WEBHOOK_SECRET`                                                                                                                                                                                                  | Supabase **prod**                             | known legacy (gated-but-live)                                                    | Documented carried-forward Paddle remnant (gated on last in-flight Paddle subscription). No action now; tracked for the DB/legacy-cleanup era. Not an anomaly.                                                                                                                                                                                                                                        |

**Clean confirmations (negative findings — what the audit ruled OUT):**

* **No cross-environment leakage:** no Stripe LIVE secret or prod project-ref found in any test/CI/preview surface; GitHub Actions = exactly the 5 TEST-project gate secrets.
* **`OLLAMA_*`** **(x5): absent on ALL four surfaces** — confirms the Phase-4 prod-unset AND clean preview/CI/Vercel (the code-dead extraction path leaves no live-store residue).
* **`RAPIDAPI_KEY`: absent on all surfaces** — pure doc-ghost; handled by 07-04 NFR-03 doc cleanup, no live-store un-set needed.

> **Orphan cross-reference:** items 5, 6, 7 (`GOOGLE_GEMINI_API_KEY`, `AI_PROVIDER`, `SERVICE_ROLE_KEY`) and the `AI_TEST_MODE`-prod verify-and-unset (item 1) are appended to the **ENV-02 Operator Un-Set List** in `.planning/audit/RESIDUAL-REGISTER.md` (names only). The Vercel integration prune (items 2/3) is recorded there as an operator action too.

***

## 6. Post-remediation operator pass (2026-06-23)

The operator actioned the Section-5 fix list and re-ran all four names-only listings. The cross-surface
topology is now clean and well-separated. Delta vs the original pass (names only):

* **Supabase prod (`zjpjapgraoxdukdvpjes`) — 22 -> 18.** Removed (4): `AI_TEST_MODE`, `AI_PROVIDER`, `GOOGLE_GEMINI_API_KEY`, `PADDLE_WEBHOOK_SECRET`.
* **Supabase preview (`cimjltzovkahkqecpwgi`) — 24 -> 18.** Removed (6): `SERVICE_ROLE_KEY` (bare), `MERIT_SYSTEM_ENABLED`, `STRIPE_PRICE_MERIT_3` / `_10` / `_25` / `_50`.
* **Vercel — 20 prod + 3 preview -> 4 prod + 4 preview.** Production pruned to exactly `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_STRIPE_PUBLISHABLE_KEY` / `VITE_FEATURE_INTERVIEW_PREP` (all ~16 Supabase->Vercel integration-injected names removed); `VITE_FEATURE_INTERVIEW_PREP` ADDED to Preview (missing-required gap closed). Preview now mirrors Production's four `VITE_*`.
* **GitHub Actions — unchanged (5/5 gate secrets), still clean.**

### Fix-list resolution

| #  | Item                                                                          | Status (2026-06-23)                                                                                                                                                                |
| -- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | `AI_TEST_MODE` on prod                                                         | **RESOLVED** — un-set from prod                                                                                                                                                    |
| 2  | Vercel privileged-secret cluster (service-role / secret / JWT / `POSTGRES_*`) | **RESOLVED** — pruned from Vercel                                                                                                                                                  |
| 3  | Vercel orphaned non-`VITE_` / `NEXT_PUBLIC_*`                                  | **RESOLVED** — pruned from Vercel                                                                                                                                                  |
| 4  | `VITE_FEATURE_INTERVIEW_PREP` missing on Vercel-preview                        | **RESOLVED** — set on Vercel Preview                                                                                                                                               |
| 5  | `GOOGLE_GEMINI_API_KEY` on prod                                                | **RESOLVED** — un-set from prod                                                                                                                                                    |
| 6  | `AI_PROVIDER` on prod                                                          | **RESOLVED** — un-set from prod                                                                                                                                                    |
| 7  | bare `SERVICE_ROLE_KEY` on preview                                            | **RESOLVED** — un-set from preview                                                                                                                                                 |
| 8  | merit subsystem (`MERIT_SYSTEM_ENABLED` + `STRIPE_PRICE_MERIT_*`) preview-only | **RESOLVED** — un-set from preview; **behavior-neutral** (the merit gate `if (MERIT_SYSTEM_ENABLED && ...)` already ran the legacy/false path — the flag was never `'true'`)        |
| 9  | `STRIPE_PRICE_PRO_*` / `STRIPE_PRICE_PAID_*` absent both stores                | **CONFIRMED INTENTIONAL** — operator: "no more Pro, just Free and Elite." PRO/PAID are legacy and deliberately absent. NOT missing-required.                                        |
| 10 | `PADDLE_WEBHOOK_SECRET` on prod                                                | **RESOLVED** — un-set from prod (Paddle remnant cleaned). See confirm note below.                                                                                                  |

### Two items worth a final operator confirm

* **`PADDLE_WEBHOOK_SECRET` removed from prod:** `paddle-webhook/index.ts:98,106` reads it and **fail-closes** — with it un-set, the `paddle-webhook` function now rejects every incoming Paddle webhook (error response, no signature verification). This is the documented Paddle-removal direction and is safe **iff** all in-flight Paddle subscriptions have expired. Confirm that, or restore the secret until they do. (The `paddle-webhook` function + `paddle_*` columns remain a separate DB/legacy cleanup, tracked for Phase 8.)
* **Merit config now absent on BOTH Supabase stores:** `MERIT_SYSTEM_ENABLED` is un-set everywhere, so the merit-gated branches (`analyze-skills-gap` / `analyze-career` / `compare-jobs` / `grade-linkedin` / `interview-prep-analyze` / `recruiting-lens`) all run their legacy/false path in every environment — byte-identical to current production behavior (the flag was never `'true'`). No behavior change; just confirm the merit shop is intended to stay gated-off everywhere.

### Post-remediation topology (clean)

* **prod-only (correct):** `ADMIN_EMAIL`, `ANTHROPIC_MODEL_FALLBACK`, `RESEND_API_KEY`.
* **preview-only (correct test seams):** `AI_TEST_MODE`, `PERF_TEST_EMAIL`, `PERF_TEST_PASSWORD`.
* **shared edge set (both Supabase):** `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_TEXT`, `APP_URL`, `INTERNAL_JOB_SECRET`, `STRIPE_PRICE_ELITE_ANNUAL`/`_MONTHLY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_*` (platform).
* **Vercel (both envs):** exactly the four `VITE_*` the SPA reads.
* **GitHub Actions:** the 5 TEST-project gate secrets.

No cross-environment leakage; no orphaned/misplaced names remain on any surface. **ENV-04 is now not just audited but remediated.**

***

## How to re-run (operator-gated, names-only; D-06)

```Shell
# Supabase prod edge secret NAMES (prod ref)
supabase secrets list --project-ref zjpjapgraoxdukdvpjes

# Supabase preview/test edge secret NAMES (preview ref; staging == test, same project)
supabase secrets list --project-ref cimjltzovkahkqecpwgi

# GitHub Actions repo secret NAMES
gh secret list

# Vercel frontend env NAMES (note the Production vs Preview split, esp. VITE_FEATURE_INTERVIEW_PREP)
vercel env ls
```

Paste the NAMES ONLY back (one block per surface; NEVER a value). The agent fills the matrix, classifies
every anomaly, and emits the operator fix list.

### Secret-pattern grep guard over THIS file (T-3-07 — corrected, NO `-E`; must return ZERO)

```Shell
rg -n "sk_live_[A-Za-z0-9]{20}|sk_test_[A-Za-z0-9]{20}|pk_live_[A-Za-z0-9]{20}|service_role[^a-zA-Z0-9]{0,40}eyJ|eyJ[A-Za-z0-9_-]{30,}|price_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----" .planning/audit/ENV-SEPARATION.md
# Expected: NO match. This audit records NAMES + surface presence + classification ONLY.
```

***

## Cross-References

* **[`ENV-INVENTORY.md`](./ENV-INVENTORY.md)** — ENV-01 (03-04); the name set + buckets the matrix rows are pre-seeded from.
* **[`RESIDUAL-REGISTER.md`](./RESIDUAL-REGISTER.md)** §"ENV-02 Operator Un-Set List" — the `OLLAMA_*` orphan candidates + the ENV-04 placeholder note that this audit's orphaned findings append to (names only).
* **[`INDEX.md`](./INDEX.md)** — audit catalog entry point; operator-gated live-leg framing.
* **`scripts/deploy.ps1:73-75,112`** — the env -> project-ref topology source of truth (explicit `supabase link --project-ref`, NOT a `config.toml` swap).
* **`.github/workflows/regression-gate.yml:63-71`** — the GitHub Actions CI surface (the 5 TEST-project secrets the gate reads at build).
* **`.planning/phases/02-repository-hygiene-state-reconciliation/02-SECRET-SCAN.md`** — the REPO-05 names-not-values discipline (T-3-07) this audit inherits.

*This file records variable names, surface presence (present/absent), classifications, and rationale only — no secret value is pasted anywhere in it.*

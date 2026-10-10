# Phase 2 — ENV-SUPPLYCHAIN-ISOLATION-FINDINGS (Plan 02-04)

**Phase:** 02 — Security Audit & Remediation
**Plan:** 02-04 (secrets/env + dependency-supply-chain + prod-vs-staging-isolation sweep — the domains whose
live truth Claude cannot read directly; D-04 says nothing is assumed-closed)
**Run date:** 2026-07-01
**HEAD SHA at sweep:** `548fba90` (branch `staging`)
**Owns domains:** 8 (secret+env handling), 16 (dependency/supply-chain), 17 (prod-vs-staging isolation).
**Routes into:** `SECURITY-AUDIT.md` 17-domain index (each finding cites its Domain # + a rubric severity);
the v4.0 10-item operator env fix-list re-verification feeds the Task-3 operator names-only cross-surface
re-pull; the classified findings feed the SEC-15 record (02-08).

> ## NAMES-ONLY DISCIPLINE (T-02-07 / CLAUDE.md rule 7)
>
> This doc is committed to a tracked repo. It records variable/package/advisory/cron-job NAMES, source line
> anchors, surface presence, findings, and severity classifications ONLY — never a key, token, JWT, price ID,
> webhook secret, connection string, or row VALUE. Project-refs `zjpjapgraoxdukdvpjes` (prod) /
> `cimjltzovkahkqecpwgi` (preview/test) and the preview functions host
> `https://cimjltzovkahkqecpwgi.supabase.co` are project IDENTIFIERS, not secrets, and are allowlisted. The
> no-secret-leak static guard (`src/test/security/security-audit-docs.test.ts`) greps this doc and MUST
> return zero. The Task-3 operator re-pull is **names-only** — Claude never reads or prints a secret value.

***

## Verdict / Status

| Field | Value |
| ----- | ----- |
| Sweep type | Read-only, repo-side + doc-based. **No `supabase/functions/**`/`src/**` edit, no DDL, no live secret-store mutation** authored — `git status` clean for source. The live cross-surface truth was operator-gated (**Task 3 completed 2026-07-01, names-only**): all 10 fix-list items reconciled RESOLVED / as-intended, cross-surface separation confirmed CLEAN, and the cron-host drift LIVE-confirmed via a read-only prod `cron.job` pull. |
| Domains classified | 8 (secret+env — Task 1), 16 (dependency/supply-chain — Task 1), 17 (prod-vs-staging isolation — Task 2), each with a rubric severity token + route; the live env/isolation truth reconciled by the operator Task-3 names-only cross-surface pull (2026-07-01). |
| Domain 8 (secret+env) | **LOW — reconciled clean.** Per-function `Deno.env.get` critical-secret reads are fail-closed (confirmed at HEAD); no committed secret VALUE (REPO-05); Vite bundles only `VITE_*` (integration-injected privileged cluster NOT browser-exposed). The v4.0 10-item operator fix-list was **re-verified by the Task-3 names-only cross-surface pull (2026-07-01): all 10 RESOLVED / as-intended** — see §8c + §8d. Only carry: the operator's own value self-confirm of `VITE_FEATURE_INTERVIEW_PREP`=`false` on prod (a names-only pull cannot see values). |
| Domain 16 (supply-chain) | **LOW-MEDIUM → accepted.** `npm run audit:deps` = **1 low / 13 moderate / 6 high / 0 critical = 20**, ALL in the dev-only `promptfoo` subtree (zero prod-runtime exposure, off the `verify:baseline` gate). `react-router-dom` prod advisory taken as the in-6.x `^6.30.4` patch (cleared). SEC-10 std/zod drift **re-scoped/accepted (currency, not a vuln)** — no framework-major migration performed. |
| Domain 17 (isolation) | **prod=preview separation CLEAN** (ENV-04 remediation 2026-06-23; **re-confirmed clean by the Task-3 names-only cross-surface pull 2026-07-01** — GitHub Actions = exactly the 5 TEST-project gate secrets, Vercel = `VITE_*`-only, prod↔preview deltas benign). The **cron-host drift** (prod cron jobs 1 `keep-warm-ping` `*/5` + 6 `extract_catchup_nightly` `*/15` → the PREVIEW functions host) is now **LIVE-CONFIRMED** via a read-only prod `cron.job` pull (2026-07-01) and classified **MEDIUM → OPERATOR cron re-point OWED** (a live prod `cron.alter_job`/UPDATE; NOT a migration, NO DDL authored here; **carried to phase closure — NOT resolved yet**). |
| NEW crit/high needing a migration | **NONE.** No new supply-chain crit and no isolation finding requires a `supabase/migrations/*.sql` change. The cron-host fix is an operator live `cron.alter_job`/`net.http_post` URL re-point (or GUC), not DDL — no gap-closure migration plan owed from this sweep. |
| Names-only discipline | **HELD.** No secret VALUE recorded anywhere; the 10-item fix-list, the isolation matrix, the dependency inventory, and the Task-3 operator reconciliation are names / advisory-IDs / cron-job names / presence only. |
| v4.0 floor | **NOT WEAKENED** — this plan authors a doc only; no runtime/auth/billing/DB/env-store surface touched. |

***

## Severity Rubric (from 02-01)

Impact × exploitability, `Severity = max-of-reasoning` (see `SECURITY-AUDIT.md` §Severity Rubric).
`Critical impact × (Easy|Moderate) → Critical`; `High × Easy → Critical`, `× Moderate → High`;
`Medium × Easy → High`, `× Moderate → Medium`; `Low → Low` regardless.
D-01 threshold: **Critical + High + Medium remediated (or routed) in-phase; only Low → tracked residual.**

***

## Domain 8 — Secret + Env Handling (SEC-02 / SEC-08)

### 8a. Per-function `Deno.env.get` fail-closed guards (repo-side, confirmed at HEAD)

Every **critical** secret read in the shared edge layer is followed by a fail-closed guard (throw / 500 / 401
— never a silent default that would run privileged/AI/payment logic without the secret). Confirmed by
`rg "Deno.env.get(...)" -A3` over the shared modules (names + line anchors only):

| Secret NAME | Read site | Fail-closed shape | Verdict |
| ----------- | --------- | ----------------- | ------- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `_shared/supabase-client.ts:16-20,33-34,44-45` | `if (!url \|\| !key) throw` / `if (!url) throw` / `if (!key) throw` | fail-closed ✓ |
| `ANTHROPIC_API_KEY` | `_shared/anthropic.ts:647-650` (text) + `:802-805` (stream) | `if (!resolvedApiKey) return/yield {status:500,'ANTHROPIC_API_KEY not configured'}` | fail-closed ✓ (500) |
| `INTERNAL_JOB_SECRET` | `_shared/auth.ts:148-151` | `if (!expectedSecret) { log.error('secret-not-configured'); throw unauthorizedResponse(...) }` | fail-closed ✓ (401) |
| `STRIPE_SECRET_KEY` | `_shared/stripe-client.ts:23-24` | `if (!key) throw new Error('STRIPE_SECRET_KEY not configured')` | fail-closed ✓ |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook-handler/index.ts:114,120-123` | `if (!webhookSecret) return jsonResponse({error:'invalid_signature'},401)` (raw body read first, STR-03) | fail-closed ✓ (401 unsigned) |
| `ALLOWED_ORIGINS` | `_shared/cors.ts:42` | `?? ''` → empty allowlist → **no ACAO emitted** (unapproved origins rejected; never `*`) | fail-closed ✓ (Phase-1 CORS) |

**Non-secret hardcoded values (confirmed NOT a leak):**
- `ADMIN_EMAIL` default: `_shared/auth.ts:31` — `(Deno.env.get('ADMIN_EMAIL') ?? 'strivolife@gmail.com').toLowerCase()`. A **non-secret** email address (the operator's own admin address), overridable by env. Not a credential. (Matches SEC-08 disposition.)
- Stripe **price IDs**: read via **template literals** `Deno.env.get(\`STRIPE_PRICE_PRO_${suffix}\`)` / `_PAID_` / `_ELITE_` (`_shared/price-resolver.ts:31-33`) + `Deno.env.get(\`STRIPE_PRICE_MERIT_${packSize}\`)` (`_shared/shop-pack-resolver.ts:64`). Price IDs are **non-secret** catalog identifiers; the template-literal form is the "landmine" a literal grep would falsely flag unused (documented in `docs/ENVIRONMENT.md` §Re-verify).
- **No committed secret VALUE** (REPO-05 names-not-values) — this sweep records names + presence only.

### 8b. Vite bundles only `VITE_*` (integration-injected privileged cluster NOT browser-exposed)

The frontend reads env exclusively through `import.meta.env`. Enumerating every `import.meta.env.*` reference
in `src/` (`rg -o "import\.meta\.env\.[A-Za-z_]+" src`) returns ONLY:
`VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_FEATURE_INTERVIEW_PREP`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_ANALYZE_CAREER_FUNCTION` — plus Vite's built-in `import.meta.env.DEV /
.MODE / .PROD` (build-mode booleans, not secrets). **No unprefixed server secret is read by the SPA.** Vite
does not bundle non-`VITE_`-prefixed vars, so the Supabase→Vercel integration-injected privileged names
(service-role / JWT / `POSTGRES_*`) that the ENV-04 audit found on the Vercel Production host were **never
shipped to browsers** — the finding was blast-radius, not active client exposure (and it was pruned
2026-06-23; see `ENV-SEPARATION.md` §6). This re-verifies T-02-11's "confirm Vite bundles only `VITE_*`"
clause by build/env-usage inspection, **not** by reading any value.

### 8c. The v4.0 10-item operator env fix-list — reconcilable checklist (D-04)

The v4.0 ENV-04 cross-surface audit (`.planning/audit/ENV-SEPARATION.md` §5) emitted a 10-item operator fix
list; the operator remediation pass (§6, 2026-06-23) resolved 9/10 and confirmed item 9 intentional. Per
**D-04 (nothing assumed-closed)** the operator ran a fresh **names-only** cross-surface re-pull at Task 3
(`supabase secrets list` prod+preview, `vercel env ls`, `gh secret list`, local `.env`) on **2026-07-01**.
Each row reconciles against `docs/ENVIRONMENT.md` §"Live store state (post ENV-04 remediation)" +
`ENV-SEPARATION.md` §6. **Task-3 verdict (2026-07-01): all 10 items RESOLVED / as-intended (names-only —
no secret value read or printed).**

| # | Name(s) — NAMES ONLY | Surface | Class | Task-3 operator verdict (2026-07-01, names-only) |
| - | -------------------- | ------- | ----- | ------------------------------------------------- |
| 1 | `AI_TEST_MODE` | Supabase **prod** | misplaced (test seam on prod) | **RESOLVED** — ABSENT on prod; PRESENT on preview (test seam correctly preview-only). |
| 2 | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`, `POSTGRES_*` (7 names) | **Vercel (Production)** | misplaced (privileged secrets/DB creds in frontend host) | **RESOLVED** — Vercel Production = exactly the 4 `VITE_*` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_FEATURE_INTERVIEW_PREP`); NO service-role / `POSTGRES_*` / JWT cluster — the v4.0 integration-injected privileged cluster is PRUNED. |
| 3 | `SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_*` (unprefixed/Next names) | **Vercel (Production)** | orphaned (no SPA consumer) | **RESOLVED** — every Vercel Production name is `VITE_*`; no orphaned / unprefixed / `NEXT_PUBLIC_*` name present. |
| 4 | `VITE_FEATURE_INTERVIEW_PREP` | **Vercel (Preview + Production)** | missing-required (preview) | **RESOLVED** — PRESENT on Vercel Preview AND Production (the "missing on preview" finding cleared). Value not visible names-only → presence confirmed; **operator to self-confirm prod value=`false`** (gating invariant). |
| 5 | `GOOGLE_GEMINI_API_KEY` | Supabase **prod** | orphaned (zero code consumer) | **RESOLVED** — ABSENT on prod (and preview); orphan removed. |
| 6 | `AI_PROVIDER` | Supabase **prod** | orphaned (zero code consumer) | **RESOLVED** — ABSENT on prod (and preview); orphan removed. |
| 7 | `SERVICE_ROLE_KEY` (bare) | Supabase **preview** | orphaned/redundant (edge reads `SUPABASE_SERVICE_ROLE_KEY`) | **RESOLVED** — bare `SERVICE_ROLE_KEY` ABSENT on preview (only the prefixed `SUPABASE_SERVICE_ROLE_KEY` present). |
| 8 | `MERIT_SYSTEM_ENABLED`, `STRIPE_PRICE_MERIT_3/10/25/50` | Supabase (both stores) | config-divergence (note; behavior-neutral) | **RESOLVED** — NONE of these on either store → merit shop gated-off / not-configured (as-intended). Note: `MERIT_SYSTEM_ENABLED` not set as an edge secret (code-default or set elsewhere). |
| 9 | `STRIPE_PRICE_PRO_*`, `STRIPE_PRICE_PAID_*` | absent BOTH Supabase stores | note (Free + Elite only) | **RESOLVED** — ABSENT both stores; only `STRIPE_PRICE_ELITE_ANNUAL` + `STRIPE_PRICE_ELITE_MONTHLY` present → Free+Elite-only tier model confirmed (PRO/PAID retired). |
| 10 | `PADDLE_WEBHOOK_SECRET` | Supabase **prod** | known legacy (gated-but-live) | **RESOLVED** — ABSENT on prod (and preview); `paddle-webhook` fail-closes today. Also the Phase-8 gate input: the secret is already unset. |

> **One item carries a residual operator self-confirm** (names-only cannot read VALUES): item 4 —
> `VITE_FEATURE_INTERVIEW_PREP` presence is confirmed on both Vercel Preview and Production; the operator
> should self-confirm the **prod VALUE is `false`** (the gating invariant), which a names-only pull cannot see.
> Item 10 (`PADDLE_WEBHOOK_SECRET` unset) doubles as the Phase-8 Paddle-retirement gate input — the secret is
> already absent, so the webhook fail-closes; final Paddle removal is gated separately in Phase 8 on all
> in-flight Paddle subscriptions having expired.

**Domain 8 classification:** impact Low (blast-radius reduction, no active exposure; all critical secrets
fail-closed and browser bundle carries no server secret) × exploit Hard (would require an already-privileged
surface / operator-set misplacement) → **LOW**. The Task-3 operator names-only re-pull (2026-07-01) confirmed
**all 10 fix-list items RESOLVED / as-intended** — no code change and no residual store mutation owed; the only
carry is the operator's own VALUE self-confirm of `VITE_FEATURE_INTERVIEW_PREP`=`false` on prod (invisible to
a names-only pull).

### 8d. Task-3 operator names-only cross-surface reconciliation (2026-07-01) — separation CLEAN

The operator ran the full names-only cross-surface inventory (never printing a secret VALUE) across all four
surfaces and reconciled the 10-item fix-list to **all RESOLVED / as-intended** (§8c). Beyond the fix-list, the
pull confirmed the **cross-surface separation is CLEAN** (recorded explicitly per D-04):

- **GitHub Actions** = exactly the **5 TEST-project gate secrets** (`E2E_TEST_PASSWORD`,
  `STRIPE_TEST_PUBLISHABLE_KEY`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY`,
  `SUPABASE_TEST_URL`) → **NO classic cross-environment leakage** (no prod-live secret in CI).
- **Vercel** = only `VITE_*` names on both Production and Preview → **no backend secret on the frontend host**.
- **Supabase prod vs preview** = benign config differences only (correct separation): **preview** carries the
  test-only `AI_TEST_MODE` / `PERF_TEST_EMAIL` / `PERF_TEST_PASSWORD` seams; **prod** carries `RESEND_API_KEY`
  + `ANTHROPIC_MODEL_FALLBACK` that preview does not. These deltas are intentional, not leakage.

**Verdict:** cross-surface separation **CLEAN** — no misplaced privileged secret on any wrong surface; the
v4.0 anomalies are all confirmed remediated. Names-only throughout; no value read or printed.

***

## Domain 16 — Dependency / Supply-Chain (SEC-10)

### 16a. `npm run audit:deps` re-pull (2026-07-01, HEAD `548fba90`)

`metadata.vulnerabilities` = **`{ info:0, low:1, moderate:13, high:6, critical:0, total:20 }`** — byte-matches
the documented Plan 06-05 accepted-risk snapshot (`RESIDUAL-REGISTER.md` §"DEP-04 Accepted-Risk Residue").
Enumerating every vulnerable package (`npm audit --json` → name/severity/direct/effects) confirms **all 20 are
inside the dev-only `promptfoo` subtree** — the only DIRECT row is `promptfoo` itself (a **devDependency**):

- **6 HIGH** (all transitive under `promptfoo`): `axios`, `form-data`, `hono`, `ibm-cloud-sdk-core`,
  `protobufjs`, `undici`.
- **13 MODERATE**: `promptfoo` (direct devDep) + `@azure/msal-node`, `uuid`, `js-yaml`, and the
  `@opentelemetry/*` cluster (9: core, exporter-trace-otlp-http, otlp-exporter-base, otlp-transformer,
  resources, sdk-logs, sdk-metrics, sdk-trace-base, sdk-trace-node).
- **1 LOW**: `esbuild` (← `tsx` ← `promptfoo`).

### 16b. `promptfoo` residue re-confirmed dev-only / off-gate / zero prod-runtime exposure

- **`test:adversarial*` is OFF the `verify:baseline` gate — confirmed at HEAD.** `package.json:18`
  `"verify:baseline": "npm run test && npm run test:edge && npm run test:e2e"` — it invokes **only** vitest +
  deno `test:edge` + Playwright `test:e2e`. The six `test:adversarial*` scripts (`package.json:19-23`, base +
  resume/career/linkedin/recruiting) are `promptfoo eval` invocations that are **never referenced by
  `verify:baseline`**. promptfoo is a **devDependency** (`vite build` does not bundle it) and calls the real
  Anthropic-backed endpoint scheduled / by-label, so none of the 20 packages is reachable from any production
  runtime path.
- **Not taken (measure-then-bump, D-03):** per `RESIDUAL-REGISTER.md` §DEP-04, a `promptfoo@0.120.19`
  measurement ESCALATED `protobufjs` HIGH→CRITICAL, so it was discarded; promptfoo stays `0.120.13`. The
  residue growing is the explicitly-acceptable dev-only/off-gate outcome. **`npm audit fix --force` never run.**
- **Clearance criterion (unchanged):** a future scheduled `promptfoo`-major bump that re-vendors its
  transitive tree past these advisories without introducing a worse one. Out of scope here (no framework-major
  migration performed).

### 16c. `react-router-dom` prod advisory — in-6.x patch (confirmed)

`package.json:82` pins `"react-router-dom": "^6.30.4"`. This is the **only production-runtime** advisory from
the DEP-01 inventory (GHSA-2j2x-hqr9-3h42, open-redirect via `//`-leading protocol-relative URL), and it was
taken as the **in-6.x `6.30.4` patch** (Plan 06-05, D-03) — cleared, and it no longer appears in the
`audit:deps` output above. The 6→7 major stays deferred (`RESIDUAL-REGISTER.md` §"D-01 Deferred Framework
Majors") — **not** taken here.

### 16d. SEC-10 — Deno std multi-version drift + zod import-style split (re-scoped/accepted)

Confirmed at HEAD (`rg` over `supabase/functions`, prod only excl. tests):
- **std multi-version drift UNCHANGED:** `deno.land/std@0.168.0` ×27 / `@0.190.0` ×4 / `@0.224.0` ×2 —
  exactly the DEP-01 finding (4+ minor versions co-exist across the tree).
- **zod import-style split — POSITIVE DELTA (collapsed to a single style):** at DEP-01 (2026-06-13) prod
  carried two zod styles — `https://esm.sh/zod@3.25.76` (`interviewPrep.ts`) **and** `npm:zod@3.25`
  (`_shared/handler.ts`). At HEAD the `npm:zod` style is **gone** — `_shared/handler.ts` no longer exists and
  `rg "npm:zod"` returns zero; the only remaining prod zod specifier is `https://esm.sh/zod@3.25.76`. The
  split has effectively self-resolved (fewer styles, not more); recorded as an improvement, not a regression.

**Disposition:** **re-scoped/accepted (currency, not a vuln)** — matches SEC-11's SEC-10 disposition. The std
drift is a maintainability/currency item (the DEP-05 edge-consolidation surface deferred in
`RESIDUAL-REGISTER.md` §"DEP-05 Deferred — Deno Edge Consolidation"), NOT a security vulnerability. **No
framework-major migration and no edge-consolidation performed** (out of scope; offline `--no-check` can't prove
an edge `std`/`zod` bump safe without per-function staging deploy-smoke).

### 16e. `npm run audit:deadcode` re-pull — 0 NEW findings

Ran KEEP-LIST-gated `audit:deadcode`. All surfaced items are the **documented residuals**, none new:
R-01 `src/components/MinimalHero.tsx` (deferred residual) + `src/hooks/use-mobile.tsx` (shadcn parity file);
the 14 knip "unused dependency" false-positives (shadcn `ui/**` consumers in the knip-`ignore`d tree) +
`supabase` (deploy-CLI in `.ps1`); the kept-by-signal exports (`pricing-config.ts` cross-layer edge consumer,
`interviewPrep.ts` gated schemas, etc. — all in `RESIDUAL-REGISTER.md`); and 2 Deno reachability candidates
(`_shared/test-helpers/stripe-fixtures.ts` + `stripe-signature.ts` — test helpers, NOT verdicts). Confirms the
supply-chain surface matches the v4.0 catalog with zero new dead-dep or reachability finding.

**Domain 16 classification:** the promptfoo residue — impact Low (dev-only tooling, off-gate, zero
prod-runtime exposure, not in shipped bundle) → **accepted (Low)**; the single production-path advisor
(`react-router-dom`) was already patched in-6.x. SEC-10 → **re-scoped/accepted (currency, not a vuln)**.
Overall **LOW-MEDIUM → accepted**; nothing here crosses the D-01 in-phase-remediation threshold beyond the
already-taken 6.30.4 patch.

***

## Domain 17 — Prod-vs-Staging Isolation (SEC-02 / cross-env)

The repo-side classification below is drawn from the v4.0 audit catalog (`ENV-SEPARATION.md` +
`RESIDUAL-REGISTER.md`, both of which document the separation state and the cron-host drift). Its **live
re-confirmation was provided by the operator's Task-3 names-only cross-surface pull (2026-07-01)**, folded in
here: the prod↔preview separation was re-confirmed CLEAN (§17a), and the cron-host drift was LIVE-confirmed
via a read-only prod `cron.job` pull (§17b). Claude never read or printed a secret VALUE.

### 17a. prod=preview separation — CLEAN (reconciled against `docs/ENVIRONMENT.md` + `ENV-SEPARATION.md`)

- **Topology (2 environments, not 3):** the authoritative selector is `scripts/deploy.ps1:73-75` (explicit
  `supabase link --project-ref`, NOT a `config.toml` swap). **prod = `zjpjapgraoxdukdvpjes`**; **staging = test
  = preview = `cimjltzovkahkqecpwgi`** (the same project). Matches `docs/ENVIRONMENT.md` §Topology.
- **Post-remediation topology CLEAN** (`ENV-SEPARATION.md` §6, 2026-06-23): Supabase prod = live edge set +
  platform secrets (no test seams, no orphans); preview = edge set + the `AI_TEST_MODE` / `PERF_TEST_EMAIL` /
  `PERF_TEST_PASSWORD` test seams; Vercel = only `VITE_*` in both Production and Preview; GitHub Actions =
  exactly the 5 TEST-project gate secrets. **No cross-environment leakage** — no prod-live secret in any
  test/CI/preview surface; the anomalies the audit found were misplaced/orphaned/missing-required, all since
  remediated. Matches `docs/ENVIRONMENT.md` §"Live store state".
- **Task-3 LIVE re-confirmation (2026-07-01) — CLEAN:** the operator's names-only cross-surface pull
  re-confirmed the separation still holds (see §8d): **GitHub Actions** = exactly the 5 TEST-project gate
  secrets (no classic cross-env leakage); **Vercel** = only `VITE_*` (no backend secret on the frontend host);
  **prod↔preview** deltas benign (preview has the test-only `AI_TEST_MODE`/`PERF_TEST_*` seams; prod has
  `RESEND_API_KEY` + `ANTHROPIC_MODEL_FALLBACK` not on preview). Correct separation, no misplaced privileged
  secret — the "clean" state is now live-verified, not merely expected.

### 17b. Cron-host drift (DB-1-cron) — CLASSIFIED

**Finding — LIVE-CONFIRMED via a read-only prod `cron.job` pull (2026-07-01, canonical prod
`zjpjapgraoxdukdvpjes`; corroborates `RESIDUAL-REGISTER.md` §DB-1-cron + §"Document-and-route" 2026-06-24):**
two `cron.job` `net.http_post` URLs are hardcoded to the **PREVIEW** project's functions host
`https://cimjltzovkahkqecpwgi.supabase.co/functions/v1/...`:
- **job 1 `keep-warm-ping`** (schedule `*/5 * * * *`) → `/keep-warm` → **PREVIEW host (DRIFT)**.
- **job 6 `extract_catchup_nightly`** (schedule `*/15 * * * *`) → `/extract-analysis-structure` →
  **PREVIEW host (DRIFT)**.

**Not affected (live-confirmed same pull):** jobs **4/5/7/8** (`cleanup-rate-limit-counters`,
`reset-subscription-merits-sweep`, `benchmarks_nightly`, `lifecycle_sweep_nightly`) are **internal SQL crons
with no functions host** → no cross-env functions-host dependency. (This supersedes the earlier v4.0-catalog
inference that job 5 called a functions host via the `app.functions_base_url` GUC — the live pull shows it is
an internal SQL cron.) Only jobs 1 & 6 carry the preview-host drift.

**Impact analysis:** a prod cron invoking the PREVIEW functions host is a cross-environment
dependency/availability drift — prod's keep-warm + nightly extract-catchup sweeps run against the **wrong
project** (preview's functions, preview's secrets/DB context). Consequences: (a) prod's nightly
extract-catchup may not process prod data (availability/correctness gap), and (b) a prod-scheduled job
executing on the preview host is a cross-env dependency + potential data-handling ambiguity. It is **NOT** a
user-facing data leak and **NOT** externally triggerable.

**Severity (rubric):** impact **Medium** (cross-env availability/dependency + potential cross-env
data-handling ambiguity; config-integrity, not user-facing disclosure) × exploitability **Moderate** (the
drift is a **live, already-realized misconfiguration** firing every scheduled run — the "condition" is
standing, though there is no external attacker vector; it requires operator/insider to have set and to fix) →
**MEDIUM** (per D-01, MEDIUM is remediate-in-phase-or-routed).

**Route — OPERATOR REMEDIATION OWED (not resolved yet):** the operator re-points jobs 1 & 6 URL host from
`cimjltzovkahkqecpwgi.supabase.co` → `zjpjapgraoxdukdvpjes.supabase.co` (`/functions/v1/keep-warm` and
`/functions/v1/extract-analysis-structure` respectively; or, preferably, to an `app.functions_base_url` GUC
pattern). This is a **live prod `cron.alter_job` / `UPDATE cron.job`** — Claude is **read-only on prod**, so
the operator applies it. It is a `cron.job` `net.http_post` **URL update**, **NOT** a public-schema DDL /
`supabase/migrations/*.sql` change — so **no repo migration and no gap-closure migration plan is owed from
this sweep** (consistent with `RESIDUAL-REGISTER.md` classifying it `needs-operator`, "NOT a Phase-8
migration"). **Status: OWED / open — carried to phase closure** as a small operator-gated action (surfaced at
Phase-2 close), NOT resolved by this plan.

> **Related cron/config item (LOG-1, recorded not owned here):** `RESIDUAL-REGISTER.md` also notes an
> `http_request_queue` NULL-url recurring cron ERROR — same operator cron/config class, not a DDL target.
> Surfaced for the operator's cron pass; not a domain-17 isolation finding per se.

**Domain 17 classification:** prod=preview separation → **CLEAN** (live-re-confirmed 2026-07-01, no action);
cron-host drift (jobs 1 & 6 → preview host) → **MEDIUM → OPERATOR cron re-point OWED** (live prod
`cron.alter_job`; needs-operator; no DDL, no gap-closure migration owed; **open — carried to phase closure**).

***

## Operator Remediation Owed (carried to Phase-2 closure)

**ONE open operator action** exits this plan (everything else is resolved / accepted):

| # | Finding | Severity | Owner | Action | Status |
| - | ------- | -------- | ----- | ------ | ------ |
| 1 | Domain 17 cron-host drift — prod cron jobs **1 `keep-warm-ping` (`*/5`)** + **6 `extract_catchup_nightly` (`*/15`)** `net.http_post` at the PREVIEW functions host `cimjltzovkahkqecpwgi.supabase.co` | **MEDIUM** (live-confirmed 2026-07-01) | **Operator** (Claude read-only on prod) | Live prod `cron.alter_job`/`UPDATE cron.job` re-pointing both URL hosts → `zjpjapgraoxdukdvpjes.supabase.co` (or an `app.functions_base_url` GUC). NO repo migration / NO DDL. | **OWED / open** — surface at Phase-2 close |

Env/secrets (Domain 8) and supply-chain (Domain 16) exit **clean / accepted** with nothing owed. Isolation
(Domain 17) exits with this **one MEDIUM operator cron re-point owed**. Item 4's `VITE_FEATURE_INTERVIEW_PREP`
prod VALUE=`false` self-confirm is an operator convenience check (names-only cannot see values), not a
blocking remediation.

***

## Fix-list / Route Summary

| Domain | Finding | Severity | Route |
| ------ | ------- | -------- | ----- |
| 8 | Per-fn fail-closed guards + no committed secret + Vite `VITE_*`-only | LOW | accepted (repo-side clean); 10-item fix-list → **Task-3 names-only re-pull (2026-07-01): all 10 RESOLVED / as-intended** |
| 8 | Cross-surface separation (GitHub 5 test-gate secrets / Vercel `VITE_*`-only / benign prod↔preview deltas) | CLEAN | **re-confirmed CLEAN by Task-3 names-only pull (2026-07-01)** — no misplaced privileged secret |
| 16 | 20-pkg `promptfoo` dev-only residue (1 low/13 mod/6 high) | LOW (accepted) | off-gate/dev-only/zero prod exposure → future promptfoo-major bump (deferred) |
| 16 | `react-router-dom` open-redirect (prod path) | — (cleared) | in-6.x `^6.30.4` patch already taken |
| 16 | SEC-10 std drift (`0.168.0`×27/`0.190.0`×4/`0.224.0`×2) + zod (now single-style) | LOW | **re-scoped/accepted (currency, not a vuln)** — no framework-major migration |
| 17 | prod=preview separation | CLEAN | **live-re-confirmed CLEAN (Task-3, 2026-07-01)** — no action |
| 17 | cron jobs 1 `keep-warm-ping` `*/5` & 6 `extract_catchup_nightly` `*/15` → preview functions host (DB-1-cron) | **MEDIUM** (live-confirmed 2026-07-01) | **OPERATOR cron re-point OWED — carried to phase closure** (live prod `cron.alter_job`; needs-operator; NO DDL/migration) |

***

## How to Re-Run (repo-side legs; the live legs are operator-gated, names-only — D-04)

```bash
# Domain 8 — per-fn fail-closed guards + non-secret hardcoded + frontend VITE_-only
rg -n "Deno\.env\.get\((['\"\`])(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL|ANTHROPIC_API_KEY|INTERNAL_JOB_SECRET|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|ALLOWED_ORIGINS)" supabase/functions -A3
rg -o "import\.meta\.env\.[A-Za-z_]+" src | sort -u          # → only VITE_* (+ Vite DEV/MODE/PROD)

# Domain 16 — supply-chain
npm run audit:deps                                            # → 1 low / 13 moderate / 6 high / 0 critical = 20 (all promptfoo subtree)
npm run audit:deadcode                                        # → documented residuals only, 0 NEW
rg -o "deno\.land/std@[0-9.]+" supabase/functions -g '!*.test.ts' -g '!**/__tests__/**' -g '!**/_tests/**' --no-filename | sort | uniq -c   # → 0.168.0×27 / 0.190.0×4 / 0.224.0×2
# verify:baseline = test && test:edge && test:e2e (no test:adversarial* — off-gate); react-router-dom ^6.30.4 (package.json)

# Domains 8 + 17 — LIVE legs (operator-run 2026-07-01, names-only; Claude never reads a value):
#   supabase secrets list --project-ref zjpjapgraoxdukdvpjes    (prod)     → 10-item fix-list all RESOLVED
#   supabase secrets list --project-ref cimjltzovkahkqecpwgi    (preview/test)
#   vercel env ls ; gh secret list ; local .env name set                   → separation CLEAN (§8d)
#   + read-only prod cron.job URL names-only re-list                       → jobs 1 & 6 preview-host DRIFT confirmed
```

***

## Cross-References

- **`.planning/audit/ENV-SEPARATION.md`** — ENV-04 cross-surface separation audit (§5 the 10-item operator fix
  list; §6 the 2026-06-23 operator remediation pass + clean post-remediation topology).
- **`docs/ENVIRONMENT.md`** — canonical names-only env matrix; §Topology + §"Live store state (post ENV-04
  remediation)" that every domain-8/17 observation here reconciles against.
- **`.planning/audit/DEPENDENCIES.md`** — DEP-01 inventory (the 20-pkg promptfoo residue origin, the std/zod
  drift, the `react-router-dom` advisory).
- **`.planning/audit/RESIDUAL-REGISTER.md`** — §"DEP-04 Accepted-Risk Residue" (the 20-pkg dev-only snapshot),
  §"DEP-05 Deferred" (edge std/zod consolidation), §"ENV-02 Operator Un-Set List", §DB-1-cron + §"Document-and-
  route" (the cron-host drift).
- **`SECURITY-AUDIT.md`** — the 17-domain index (this doc owns 8/16/17) + SEC-11 dispositions (SEC-02/08/10) +
  the severity rubric.
- **`src/test/security/security-audit-docs.test.ts`** — the no-secret-leak static guard that greps this doc.

*This file records variable/package/advisory/cron-job names, surface presence, findings, and classifications
only — no secret VALUE is pasted anywhere in it. Project-refs and the preview functions host are identifiers,
not secrets.*

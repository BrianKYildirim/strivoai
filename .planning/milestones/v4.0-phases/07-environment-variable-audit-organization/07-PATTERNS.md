# Phase 7: Environment Variable Audit & Organization - Pattern Map

**Mapped:** 2026-06-20
**Files analyzed:** 12 (3 created, 5 doc-edits, 1 audit artifact + 1 register-append, 3 read-only reference analogs)
**Analogs found:** 12 / 12 (every file has a concrete in-repo or git-history analog — this is a docs+audit phase, near-zero code diff)

> **Discipline banner (governs EVERY file this phase writes):** NAMES-not-values (Phase 2 REPO-05 / T-3-07); never commit `.env`/`.env.*` (only the whitelisted `*.example` templates); `.planning/` is tracked — stage SPECIFIC paths, never `git add -A`/`-f`/`.`; pure-ASCII any `.ps1`; zero functional change (the edge-guard files are REFERENCE analogs, not edit targets, unless ENV-05 surfaces a fail-open).

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.env.example` (RE-CREATE) | config (template) | transform (names→placeholders) | `git show 0d5b1eff~1:.env.example` (the removed prior version) | exact |
| `.env.test.local.example` (RE-CREATE) | config (template) | transform | `git show 0d5b1eff~1:.env.test.local.example` | exact |
| `docs/ENVIRONMENT.md` (NEW) | doc (canonical matrix) | transform | `docs/VERCEL_PREVIEW_SETUP.md` (style) + `.planning/audit/ENV-INVENTORY.md` (table/matrix content) | role-match + content-source |
| `README.md` (EDIT) | doc | transform | self (in-file §Deployment + §Environment Variables) | exact-in-place |
| `CLAUDE.md` (EDIT) | doc | transform | self (in-file env block L189-204; managed-section caveat) | exact-in-place |
| `AGENTS.md` (EDIT) | doc | transform | `CLAUDE.md` env block (near-duplicate drift) | exact-in-place |
| `TESTING-STRATEGY.md` (EDIT) | doc | transform | self (in-file L371-375) + `.env.test.local.example` | exact-in-place |
| `.gitignore` (RE-VALIDATE, likely NO change) | config | n/a | self (L2-5 whitelist) | exact-in-place |
| ENV-04 audit artifact `.planning/audit/ENV-SEPARATION.md` (NEW) | doc (audit findings) | transform | `.planning/audit/ENV-INVENTORY.md` (catalog style) + `INDEX.md` (re-runnable/operator-gated pattern) | role-match |
| `.planning/audit/RESIDUAL-REGISTER.md` (APPEND) | doc (register) | event-driven (append-only) | self (the §"DEP-05 Deferred" / §"DEP-03 Deferred" append blocks) | exact-in-place |
| `supabase/functions/_shared/cors.ts` (READ-ONLY reference) | utility (CORS) | request-response | self (ENV-05 anchor) | reference-only |
| `supabase/functions/_shared/anthropic.ts` (READ-ONLY reference) | service (AI client) | streaming + request-response | self (ENV-05 anchor) | reference-only |

---

## Pattern Assignments

### `.env.example` (config template, RE-CREATE) — D-01/D-02 prod-runtime surface

**Analog:** `git show 0d5b1eff~1:.env.example` — the version deliberately removed at commit `0d5b1eff` (2026-06-13, "chore: remove example environment variable files"). RE-CREATE re-validates the dangling `.gitignore` whitelist. The prior shape is the STARTING POINT but MUST be COMPLETED (the old file documented ~18 names; the live surface is 7 frontend + 52 edge).

**`<read_first>` for the plan:** `git show 0d5b1eff~1:.env.example` (recovered shape) + `.planning/audit/ENV-INVENTORY.md` §"Edge-secret tables" (the names to ADD).

**Header + group pattern to copy verbatim (the prior file's exact comment style):**
```bash
# Strivo AI — environment variable NAME template.
# Copy to `.env` / `.env.local` and fill with real values. NEVER commit a filled copy.
# This file contains variable NAMES and non-secret placeholders ONLY — no real keys.

# ── Frontend (VITE_*) — browser build, public ──
VITE_SUPABASE_URL=
VITE_ANALYZE_CAREER_FUNCTION=        # optional — defaults to "analyze-career"
```
- ASCII box-drawing `──` is OK in `.env.example` (it is NOT a `.ps1`; the pure-ASCII rule is `.ps1`-only). The prior file already used `──`.
- Inline `# optional — …` trailing comments mark optional/gated vars (prior file convention).

**Names to ADD vs the prior shape (D-02 grouping; RESEARCH §"Gap the re-creation must close" L111):**
- **Frontend new:** `VITE_STRIPE_PUBLISHABLE_KEY`.
- **Supabase edge secrets new:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `MERIT_SYSTEM_ENABLED` (opt kill-switch), `STRIVO_ENV` (opt staging discriminator), `ADMIN_EMAIL`, `ADMIN_EMAILS`. (`ANTHROPIC_MODEL_FALLBACK` already present in prior file.)
- **Stripe price IDs group (NEW group, with the template-literal landmine comment):** 6 subscription `STRIPE_PRICE_{PRO,ELITE,PAID}_{MONTHLY,ANNUAL}` + 4 `STRIPE_PRICE_MERIT_{3,10,25,50}`. Add a comment noting they are read via a template literal (`price-resolver.ts:31-33`, `shop-pack-resolver.ts:64`) — never "unused."
- **OCR fallbacks (NEW group, optional):** `MISTRAL_OCR_API_KEY`/`_ENDPOINT`/`_MODEL`, `TEXTRACT_OCR_ENDPOINT`/`_TOKEN`.
- **Legacy group (keep, flag gated-but-live):** `PADDLE_WEBHOOK_SECRET` (prior file already lists it; keep + annotate).
- **EXCLUDE:** `OLLAMA_*` (×5, code-dead post-Phase-4), `RAPIDAPI_KEY` (doc ghost, zero consumers).

**Post-write validation (from RESEARCH Validation Architecture):**
- `git check-ignore -v .env.example` → matches `.gitignore:4:!.env.example` (CONFIRMED un-ignored; file currently absent).
- After `git add .env.example`, `git status` must show it STAGED (not ignored).
- Secret-grep guard (corrected, NO `-E` — RESEARCH Pitfall 3) over the file = ZERO matches.

---

### `.env.test.local.example` (config template, RE-CREATE) — D-02 test/CI + E2E surface

**Analog:** `git show 0d5b1eff~1:.env.test.local.example` (9-line prior version). The `SUPABASE_TEST_URL=https://cimjltzovkahkqecpwgi.supabase.co` form is a NAME+host (project URL, not a secret) — acceptable, matches the prior template.

**Prior shape to copy + extend:**
```bash
# Copy to .env.test.local and fill — DO NOT commit the filled copy.
# Test / E2E env for the Supabase TEST project (strivoaipreview) + Stripe test mode.
# NAMES + non-secret placeholders ONLY here — no real keys.

SUPABASE_TEST_URL=https://cimjltzovkahkqecpwgi.supabase.co
SUPABASE_TEST_ANON_KEY=               # from strivoaipreview anon key
STRIPE_TEST_PUBLISHABLE_KEY=          # pk_test_… from Stripe test mode
```

**Names to ADD (the 27 test/CI surface — RESEARCH 3-way table L118):** `AI_TEST_MODE`, `AI_FORCE_FAILURE`, `MERIT_TEST_FORCE_REFUNDABLE_ERROR`, `IS_TEST`, `RUN_EVALS`, `RUN_LIVE_MERIT`, `RUN_TIER_VALIDATION`, `DENO_TEST_SUPABASE_LOCAL`, `DENO_TEST_SUPABASE_REMOTE`, `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, `E2E_TEST_PASSWORD`, and the `TEST_*_JWT` / `TEST_*_ID` / `TEST_*_QUIZ_ID` fixture names. (Re-run the edge enumeration to pull the exact `TEST_*` set at HEAD.)

**Note:** `SUPABASE_TEST_ANON_KEY` + `STRIPE_TEST_PUBLISHABLE_KEY` are RESOLVED live CI-only (consumed at `.github/workflows/regression-gate.yml:63-71` via `${{ secrets.* }}`) — KEEP, document as GitHub-Actions surface.

---

### `docs/ENVIRONMENT.md` (doc, NEW) — D-01/D-02 the canonical cross-env matrix

**Style analog:** `docs/VERCEL_PREVIEW_SETUP.md` — the existing `docs/` doc style (H1 title, short intro, `##` section headers, bullet lists; pure-ASCII; ~40 lines). It also models the SAME four-surface vocabulary this matrix needs (GitHub secrets, Vercel env, prod vs preview).

**Content analog:** `.planning/audit/ENV-INVENTORY.md` — copy its TABLE conventions verbatim:
- The names-not-values warning header (ENV-INVENTORY.md L9-10 — the `⚠ VALUES ARE NEVER RECORDED` blockquote):
```markdown
> ## ⚠ VALUES ARE NEVER RECORDED — names, consumers, required/optional only.
> Per Phase-2 REPO-05 / 02-SECRET-SCAN.md (T-3-07): record variable NAMES + consumer
> file(s) + environment bucket + required/optional ONLY — never a key, token, JWT,
> price ID, or connection string.
```
- The per-row table shape (ENV-INVENTORY.md L62-72 frontend table; L82-90 edge table): `| Name | Consumer file(s) | Environment | Req/Opt | Classification |`.

**Recommended matrix columns for the canonical doc (RESEARCH L123):**
```
| Name | Bucket | Req/Opt | Consumer (file:line) | Surface (where set) | Notes |
```
where Surface ∈ {Vercel project env, Supabase prod secrets, Supabase preview/test secrets, GitHub Actions secret, local `.env`/`.env.test.local`}. This column set FEEDS the ENV-04 reconciliation matrix (same surfaces).

**Embed the D-03 re-runnable enumeration block (the corrected, no-`-E` form — RESEARCH L281-290):**
```bash
rg -n "import\.meta\.env\.\w+" src -o | sort -u
rg -o "VITE_[A-Z_0-9]+" src | sort -u
rg -o "Deno\.env\.get\(['\"]([A-Z_0-9]+)['\"]" -r '$1' supabase/functions --no-filename | sort -u   # → 52 at HEAD
rg -n 'Deno\.env\.get\(`' supabase/functions
rg -n 'Deno\.env\.get\([a-z]' supabase/functions
```

---

### `README.md` (doc, EDIT) — D-09 + merge-marker cleanup

**Analog:** self (edit-in-place). THREE distinct spots, all VERIFIED at HEAD:

**Spot 1 — stale deploy description (§Deployment, L139-142):**
```markdown
* Staging: `.\scripts\deploy-staging.ps1`
* Production: `.\scripts\deploy-production.ps1`

These scripts swap `supabase/config.toml`, link to the target Supabase project, and deploy selected functions.
```
→ Rewrite L142: the config-swap footgun is GONE. Selection is explicit `supabase link --project-ref` in the unified `scripts/deploy.ps1` (`deploy.ps1:112`); `deploy-staging.ps1`/`deploy-production.ps1` are thin shims; the `verify:baseline` HARD gate runs before `supabase link`. Source of truth: `scripts/deploy.ps1:73-75` (env→ref topology). Validation: `rg -n "config\.toml.*swap|swap.*config\.toml" README.md` → zero.

**Spot 2 — committed merge-conflict marker (L85):**
```
> > > > > > > 3ffe64c14c0fd8f4182c1c51a374d37d7f1d114e
```
→ Delete the line. Validation: `rg -n "^> > > > > > >" README.md` → zero.

**Spot 3 — §Environment Variables (L93-116):** omits the entire Stripe surface, OCR fallbacks, `STRIVO_ENV`, `MERIT_SYSTEM_ENABLED`, `ADMIN_EMAIL(S)`; lists dead `RAPIDAPI_KEY` (L116). → Replace the hand-maintained list with a SHORT pointer to `docs/ENVIRONMENT.md` (do NOT duplicate the full matrix); drop `RAPIDAPI_KEY`. Validation: `rg -n "RAPIDAPI_KEY" README.md` → zero.

---

### `CLAUDE.md` (doc, EDIT) — D-09 + merge-marker cleanup; MANAGED-SECTION caveat

**Analog:** self (edit-in-place). TWO spots:

**Spot 1 — env-var block (L189-204):** lists `PADDLE_WEBHOOK_SECRET` (L201) but NO live Stripe surface (`VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs); lists dead `RAPIDAPI_KEY` (L204). → Reconcile + point at `docs/ENVIRONMENT.md`; drop/footnote `RAPIDAPI_KEY`.
> **CRITICAL caveat (RESEARCH L212):** CLAUDE.md is PARTLY managed by `generate-claude-profile` (see the `## Developer Profile` "do not edit manually" marker). Edit ONLY the env block; preserve the managed sections byte-for-byte.

**Spot 2 — committed merge-conflict marker (L594, in the tail):**
```
> > > > > > > 3ffe64c14c0fd8f4182c1c51a374d37d7f1d114e
```
→ Delete. (Note: this is a SECOND, separate marker from the env block — the context's "tail" pointer is correct; line is 594, not ~85.) Validation: `rg -n "^> > > > > > >" CLAUDE.md` → zero.

---

### `AGENTS.md` (doc, EDIT) — third drifted env surface (RESEARCH Open Q3 — reconcile for consistency)

**Analog:** the `CLAUDE.md` env block (AGENTS.md L165-176 is a near-duplicate of the same stale list). NOT in D-09's named list — RESEARCH flags it (Open Q3) and recommends reconcile-or-pointer for consistency since it duplicates CLAUDE.md's env list. Plan should confirm scope with the operator if unsure (cheap, zero-risk).

**Spot 1 — env block (L165-176):** same drift as CLAUDE.md (`PADDLE_WEBHOOK_SECRET`, no Stripe, dead `RAPIDAPI_KEY` at L176). NOTE: AGENTS.md L168 has a content bug — `ANTHROPIC_API_KEY - … for Codex model calls` (should be Claude); reconcile-or-pointer fixes it. → Reconcile or add a pointer to `docs/ENVIRONMENT.md`; drop `RAPIDAPI_KEY`.

**Spot 2 — committed merge-conflict marker (L566):**
```
> > > > > > > 3ffe64c14c0fd8f4182c1c51a374d37d7f1d114e
```
→ Delete. Validation: `rg -n "^> > > > > > >" AGENTS.md` → zero; `rg -n "RAPIDAPI_KEY" AGENTS.md` → zero.

---

### `TESTING-STRATEGY.md` (doc, EDIT) — D-09 testing/E2E env reconcile

**Analog:** self (L371-375) + the new `.env.test.local.example`. Spot: references `SUPABASE_TEST_*` + `STRIPE_TEST_PUBLISHABLE_KEY`. → Reconcile against the new `.env.test.local.example` (names + the `cimjltzovkahkqecpwgi` mapping); note `AI_TEST_MODE` is transient/test-mode. Keep pure-ASCII (it is `.md`, but the project's ASCII habit is safe to keep).

---

### `.gitignore` (config, RE-VALIDATE — likely NO change)

**Analog:** self (L2-5):
```
.env
.env.*
!.env.example
!.env.test.local.example
```
The whitelist is currently DANGLING (both `*.example` files absent on disk — CONFIRMED). RE-CREATING the two templates re-validates it. NO edit expected unless `git check-ignore` reveals the negation is broken. Validation: `git check-ignore -v .env.example .env.test.local.example` returns the `!`-negated rule matches (CONFIRMED: `.gitignore:4` and `:5`).

---

### `.planning/audit/ENV-SEPARATION.md` (doc, NEW) — ENV-04 cross-surface audit artifact

**Analog:** `.planning/audit/ENV-INVENTORY.md` (catalog/table style + names-not-values header) AND `.planning/audit/INDEX.md` (the operator-gated, re-runnable-by-command framing). Exact filename is Claude's discretion (D-06); `ENV-SEPARATION.md` is a sensible name in the existing `.planning/audit/` catalog.

**Structure to copy:**
- Names-not-values warning header (ENV-INVENTORY.md L9-10).
- Env→ref topology block (from `scripts/deploy.ps1:73-75,112` — RESEARCH L157-161): `production → zjpjapgraoxdukdvpjes`, `staging/test → cimjltzovkahkqecpwgi` (staging≡test; document as prod vs preview, NOT three envs).
- The four-surface operator-command table (RESEARCH L166-171): `supabase secrets list --project-ref …` ×2, `gh secret list`, `vercel env ls` — NAMES ONLY.
- The reconciliation matrix (RESEARCH L175): rows = distinct names; cols = {prod-Supabase, preview-Supabase, GitHub-Actions, Vercel-prod, Vercel-preview}; cells ✓/–.
- Findings taxonomy (RESEARCH L177-180): leakage / misplaced / missing-required / orphaned → operator fix list (names only).

> **Operator-gated checkpoint (`autonomous:false`):** the live cell values come from operator-run commands (prod is MCP read-only; secrets store is NOT MCP-reachable). Honor the operator-checkpoint memory — NEVER auto-approve. The phase closes on the documented audit + list, NOT on live-store mutation (D-07).

---

### `.planning/audit/RESIDUAL-REGISTER.md` (doc, APPEND-ONLY)

**Analog:** self — the existing append blocks model the exact pattern. Copy the section shape of §"DEP-05 Deferred — Deno Edge Consolidation (Phase 06, D-04)" (RESIDUAL-REGISTER.md L344-386) and §"DEP-03 / Framework Majors Deferred" (L247+):
- `**Appended by:** Plan 07-XX (…, 2026-06-20). Append-only; no prior entry edited.`
- A `### <Item>` heading + a 4-field table (`Item | Current state | Why deferred | Clearance criterion`) OR a prose block with a `> **Clearance criterion:**` blockquote.

**Items to append this phase (D-08/D-04/`<deferred>`):**
- The central `assertRequiredEnv()` / `getRequiredEnv()` helper defer (blast-radius; Phase-9-adjacent).
- The operator un-set list (`OLLAMA_*` ×5 orphaned-on-doubt; any orphan the ENV-04 audit surfaces) — names only.
- (CONDITIONAL) IF an ENV-05 guard is added but the staging deploy-smoke is env-deferred (test project `cimjltzovkahkqecpwgi` is PAUSED — DI-06-*), append the deferred-smoke entry mirroring the Phase-6 realtime-smoke precedent.

> Append-only: NEVER edit a prior entry. Stage only this file path. The footer discipline (`This file records paths, classifications, signals, and rationale only — no secret value`) is inherited.

---

### `supabase/functions/_shared/cors.ts` + `_shared/anthropic.ts` (READ-ONLY reference — ENV-05)

**These are REFERENCE analogs, NOT edit targets.** RESEARCH found 6/6 critical secrets already fail-closed → ENV-05 is a confirm-only coverage matrix (likely "add nothing"). If the operator surfaces a genuine fail-open, the guard ADDED must mirror these exact shapes (and triggers the edge-change deploy-smoke discipline — env-deferred while the test project is paused). See **Shared Patterns → Fail-Closed Secret Guard** below for the verbatim excerpts.

---

## Shared Patterns

### Names-not-values discipline (governs EVERY committed artifact)
**Source:** `.planning/audit/ENV-INVENTORY.md:9-10` (the `⚠ VALUES ARE NEVER RECORDED` header) + `.planning/phases/02-repository-hygiene-state-reconciliation/02-SECRET-SCAN.md` (REPO-05 / T-3-07).
**Apply to:** `.env.example`, `.env.test.local.example`, `docs/ENVIRONMENT.md`, `ENV-SEPARATION.md`, every doc edit.
**Pre-commit guard (corrected — NO `-E`, RESEARCH Pitfall 3; on the installed rg `-E` means `--encoding`):**
```bash
rg -n "sk_live_[A-Za-z0-9]{20}|sk_test_[A-Za-z0-9]{20}|pk_live_[A-Za-z0-9]{20}|service_role[^a-zA-Z0-9]{0,40}eyJ|eyJ[A-Za-z0-9_-]{30,}|price_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----" <file>
```
Must return ZERO matches before commit. (`SUPABASE_TEST_URL=https://cimjltzovkahkqecpwgi.supabase.co` is a NAME+host, not a secret — acceptable.)

### Fail-Closed Secret Guard (ENV-05 coverage-matrix evidence + add-only template)
**Sources (all VERIFIED at HEAD — these populate the ENV-05 coverage matrix):**
- `_shared/cors.ts:38-41` — `APP_URL`:
```typescript
const rawAppUrl = Deno.env.get('APP_URL');
if (!rawAppUrl) {
  throw new Error('APP_URL environment variable is not set — cannot build safe CORS headers');
}
```
- `_shared/anthropic.ts:647-650` (non-stream) + `:803-805` (stream) — `ANTHROPIC_API_KEY`:
```typescript
const resolvedApiKey = params.apiKey ?? Deno.env.get('ANTHROPIC_API_KEY');
if (!resolvedApiKey) {
  return { ok: false, status: 500, error: 'ANTHROPIC_API_KEY not configured' };   // non-stream
  // stream path: yield { type: 'error', status: 500, message: 'ANTHROPIC_API_KEY not configured' }; return;
}
```
- `_shared/supabase-client.ts:19,34,45` — `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`: each `throw new Error('… not configured')`.
- `_shared/stripe-client.ts:23-24` — `STRIPE_SECRET_KEY`: `const key = Deno.env.get('STRIPE_SECRET_KEY'); if (!key) throw new Error('STRIPE_SECRET_KEY not configured');`
- `stripe-webhook-handler/index.ts:114-123` — `STRIPE_WEBHOOK_SECRET`: `if (!webhookSecret) { log.warn(…); return jsonResponse({ error: 'invalid_signature' }, 401); }` (rejects unsigned webhook).
- `_shared/auth.ts:141-145` — `INTERNAL_JOB_SECRET`: `const expectedSecret = Deno.env.get('INTERNAL_JOB_SECRET'); if (!expectedSecret) { log.error('auth-failure', { reason: 'secret-not-configured', type: 'internal' }); throw unauthorizedResponse(); }`

**Apply to:** the ENV-05 coverage matrix (confirm each fail-closed with file:line). IF (and only if) a fail-open critical secret is surfaced, ADD a narrow `if (!x) throw/return` mirroring the patterns above — never a central helper (deferred), and trigger the edge-change deploy-smoke (env-deferred if test project paused → RESIDUAL-REGISTER entry).

### Append-only register
**Source:** `.planning/audit/RESIDUAL-REGISTER.md` §"DEP-05 Deferred" (L344-386) / §"DEP-04 Accepted-Risk" (L285-340).
**Apply to:** the ENV-02 un-set list, the central-env-guard defer, any deferred ENV-05 smoke. Append a new `## …` / `### …` section; never edit a prior entry.

### Audit-catalog table + operator-gate framing
**Source:** `.planning/audit/ENV-INVENTORY.md` (table shape, classifications, re-runnable command blocks) + `.planning/audit/INDEX.md:44-64` (re-runnable-by-command + operator-gated live-leg framing).
**Apply to:** `docs/ENVIRONMENT.md`, `ENV-SEPARATION.md`.

### docs/ doc style
**Source:** `docs/VERCEL_PREVIEW_SETUP.md` (H1 + short intro + `##` sections + bullets; pure-ASCII; four-surface vocabulary).
**Apply to:** `docs/ENVIRONMENT.md`.

---

## No Analog Found

(none — every file has a concrete in-repo or git-history analog)

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | — |

---

## Drift Notes vs the orchestrator's "expected files" hint

- **CLAUDE.md / AGENTS.md merge markers are at L594 / L566** (a SECOND marker, separate from the env block at L189-204 / L165-176). README marker is at L85 (matches the hint). All three confirmed via `rg "^> > > > > > >"`.
- **AGENTS.md is confirmed a real third drift surface** (L165-176 env block + L566 marker + the `Codex`-instead-of-`Claude` content bug at L168). RESEARCH Open Q3 flags it as not-in-D-09 — recommend reconcile/pointer; plan may operator-confirm.
- **`.env.example` box-drawing `──` is fine** (it is not a `.ps1`; the pure-ASCII rule is `.ps1`-only, and the prior committed template already used `──`).
- **Edge-guard files (cors.ts / anthropic.ts) are reference-only** — 6/6 critical secrets already fail-closed (RESEARCH L186-196); ENV-05 most likely resolves to "add nothing" + a coverage matrix.

---

## Metadata

**Analog search scope:** `git show 0d5b1eff~1:*` (removed templates), `docs/`, `.planning/audit/`, `README.md`/`CLAUDE.md`/`AGENTS.md`/`TESTING-STRATEGY.md`, `supabase/functions/_shared/` (cors/anthropic/stripe-client/supabase-client/auth), `stripe-webhook-handler/`, `.github/workflows/regression-gate.yml`, `.gitignore`.
**Files scanned:** ~16 (read) + 3 git-history objects.
**Pattern extraction date:** 2026-06-20
**HEAD context:** branch `staging`; research HEAD `6e0afb11` (re-confirm the 52-edge-name count + fail-closed matrix at plan time if `supabase/functions/**` changed since).

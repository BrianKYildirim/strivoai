# Phase 7: Environment Variable Audit & Organization - Research

**Researched:** 2026-06-20
**Domain:** Env-var configuration hygiene (audit + documentation + reconciliation) under a HARD zero-functional-change constraint
**Confidence:** HIGH (all findings re-derived from code/git at HEAD `6e0afb11`, branch `staging`; live-store facts are operator-gated and flagged as such)

<user_constraints>
## User Constraints (from 07-CONTEXT.md)

These are LOCKED. The planner MUST honor them verbatim. Research below answers HOW to execute them, never WHETHER.

### Locked Decisions

**ENV-03 (canonical env reference):**
- **D-01:** RE-CREATE BOTH `.env.example` and `.env.test.local.example`, PLUS a narrative `docs/ENVIRONMENT.md`. The templates are copy-paste skeletons (NAMES + empty/placeholder values only); `docs/ENVIRONMENT.md` is the explanation (which-env matrix, required/optional, consumer, why). README + CLAUDE.md point at them. Context: both templates were *deliberately removed* at commit `0d5b1eff` (2026-06-13, "remove example environment variable files") but `.gitignore` STILL whitelists them (`!.env.example`, `!.env.test.local.example`). Re-creating re-validates that dangling whitelist. Prior versions (commit `0d5b1eff~1`) are the starting shape but must be COMPLETED to cover the ~46 code-not-example gap names.
- **D-02:** 3-way clean split. `.env.example` = production-runtime surface (frontend `VITE_*` + production edge secrets, grouped: Frontend, Supabase edge secrets, Stripe price IDs incl. template-literal landmine note, OCR fallbacks optional, Legacy `PADDLE_*` flagged gated-but-live). `.env.test.local.example` = the 27 test/CI + E2E names. `docs/ENVIRONMENT.md` = complete cross-env matrix (name → required/optional → consumer → which-env → why).
- **D-03:** Keep the reference aligned with a re-runnable command embedded in `docs/ENVIRONMENT.md`, NOT a gate. No new CI gate, no new audit script.

**ENV-02 (removal/consolidation):**
- **D-04:** Act on CODE + DOCS only; live-store cleanup is an operator action list (names only). NEVER write prod secrets (MCP prod read-only; secrets store not MCP-reachable). Actual store cleanup is operator-confirmed.
- **D-05:** Resolve `needs-investigation` evidence-based, KEEP-on-doubt. OCR fallbacks (`MISTRAL_OCR_*` ×3, `TEXTRACT_OCR_*` ×2) are code-live → KEEP, document as optional fallback, add "confirm whether set in prod" to operator list. `OLLAMA_*` (×5) now code-dead (Phase 4 deleted `_shared/ollama-client.ts`) → exclude from reference, add to operator un-set list, handle the test-file reference conservatively. 2 documented-but-no-consumer (`SUPABASE_TEST_ANON_KEY`, `STRIPE_TEST_PUBLISHABLE_KEY`) — grep CI/shell/e2e, document as CI-only if found. Test seams documented as test-only. Demote-on-doubt: nothing removed unless provably dead. Never-remove set: `PADDLE_WEBHOOK_SECRET` (Class 2), `VITE_FEATURE_INTERVIEW_PREP` (Class 1), the 6 `STRIPE_PRICE_{PRO,ELITE,PAID}_{MONTHLY,ANNUAL}` template-literal keys (Class 4 LIVE).

**ENV-04 (separation proof):**
- **D-06:** Full cross-surface audit, OPERATOR-run, names-only across all four surfaces: Supabase prod (`zjpjapgraoxdukdvpjes`), Supabase preview/test (`cimjltzovkahkqecpwgi`), GitHub Actions (`gh secret list`), Vercel (`vercel env ls`). Document the env→ref topology from `scripts/deploy.ps1`, then reconcile a cross-surface matrix for leakage. Document honestly: "staging" and "test" are the SAME project (`cimjltzovkahkqecpwgi`) — the real axis is prod vs preview(=staging=test). Names-only. Operator-gated checkpoint (`autonomous:false`).
- **D-07:** Leakage findings → document + operator fix list (names only); we mutate no store. Findings classified leakage / misplaced / missing-required / orphaned. Phase closes on the documented audit + list, NOT on live-store mutation.

**ENV-05 (fail-closed validation):**
- **D-08:** Confirm + add ONLY where missing (surgical). Audit each critical/required secret (`APP_URL`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `INTERNAL_JOB_SECRET`) for a fail-closed path; document a coverage matrix; add a narrow guard ONLY where a critical secret currently fails open. Each addition is deploy-smoked. NO central env-guard helper (deferred). Anchors: `APP_URL` in `_shared/cors.ts`; `ANTHROPIC_API_KEY` in `_shared/anthropic.ts`.

**NFR-03 (documentation):**
- **D-09:** README.md (fix stale deploy description lines ~139-142 + reconcile env-vars section), CLAUDE.md (reconcile env list + point at `docs/ENVIRONMENT.md`), TESTING-STRATEGY.md (testing/E2E env vars), add `docs/ENVIRONMENT.md`.

### Claude's Discretion
Plan/commit slicing and wave structure; exact `docs/ENVIRONMENT.md` matrix format/columns; precise grouping/comment style inside the two templates; exact wording of operator action lists; handling mechanics of the `OLLAMA_*` test-file reference; whether operator secret-name listings are one checkpoint or split.

### Deferred Ideas (OUT OF SCOPE)
- Central required-env assertion helper (`assertRequiredEnv()`/`getRequiredEnv()` wired into all 27+ functions) — blast-radius; record in RESIDUAL-REGISTER if a real gap motivates it.
- Automated env-docs drift-check (`scripts/audit/check-env-docs.mjs` / `npm run audit:env`) — rejected in favor of D-03 re-runnable command.
- Aggressive removal / writable-preview-store cleanup by us — all live-store changes stay operator-confirmed.
- Phase 7.1 runtime-reliability scope (separate inserted phase) — untouched here.
</user_constraints>

## Summary

This phase is **audit + documentation + reconciliation**, not refactoring. Under the governing zero-functional-change constraint the truly-removable surface is tiny: only the 5 `OLLAMA_*` names (now code-dead after Phase 4 deleted `_shared/ollama-client.ts`) leave the documented set, and they leave as **doc-exclusion + an operator un-set list** — there is *no removable code read* left to delete in the repo (the Ollama deletion already happened in Phase 4). Everything else is producing three artifacts (`.env.example`, `.env.test.local.example`, `docs/ENVIRONMENT.md`), reconciling four stale doc surfaces (README, CLAUDE.md, AGENTS.md, TESTING-STRATEGY.md), and structuring an operator-run cross-surface secret-name audit (ENV-04).

I re-ran the ENV-INVENTORY.md enumeration at HEAD and confirmed **one material drift since 2026-06-14**: the edge literal `Deno.env.get` distinct-name count is now **52** (was **57**) — the delta is exactly the 5 `OLLAMA_*` names. The frontend surface is unchanged (7 distinct `VITE_*` + 3 Vite built-ins). The template-literal Stripe landmine (`price-resolver.ts:31-33`, `shop-pack-resolver.ts:64`) and the live `mistral → textract → claude_ocr` OCR chain are both intact. Both Direction-B "no consumer found" orphans are **RESOLVED as live CI-only**: `SUPABASE_TEST_ANON_KEY` and `STRIPE_TEST_PUBLISHABLE_KEY` are consumed in `.github/workflows/regression-gate.yml` (via `${{ secrets.* }}`, which the inventory's code-only `rg` could not see).

For ENV-05, **five of six** critical secrets already fail closed with explicit guards (`APP_URL`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`+`SUPABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `INTERNAL_JOB_SECRET` — all confirmed below with file:line). I found **no critical secret that fails open**, so D-08's "add only where missing" may legitimately resolve to **add nothing** — but the planner should still treat the coverage matrix as the deliverable and leave room for the operator to surface a gap.

**Primary recommendation:** Treat this as a documentation-and-audit phase with a near-empty code diff. Build the three artifacts by re-running the (corrected) inventory commands; reconcile the four doc surfaces; structure ENV-04 as a single operator checkpoint that lists secret NAMES across the four surfaces; for ENV-05 produce a coverage matrix and add a guard ONLY if the operator surfaces a fail-open critical secret. Validate via the secret-grep guard (zero matches), `git check-ignore` (templates trackable), re-runnable enumeration parity, and `verify:baseline` staying green — with a staging deploy-smoke ONLY if any edge guard is actually added.

## Inventory Re-Verification at HEAD (Research Focus 1)

**HEAD at research:** `6e0afb11` (branch `staging`). Inventory was taken at `f131e3f` on 2026-06-14.

### Frontend `import.meta.env.*` — NO DRIFT

```bash
rg -n "import\.meta\.env\.\w+" src -o | sort -u      # dotted form
rg -o "VITE_[A-Z_0-9]+" src | sort -u                # cast-form catch (perf.ts)
```

Result: **7 distinct `VITE_*`** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`, `VITE_ANALYZE_CAREER_FUNCTION`, `VITE_DEBUG_PERF`, `VITE_FEATURE_INTERVIEW_PREP`, `VITE_STRIPE_PUBLISHABLE_KEY`) + 3 Vite built-ins (`PROD`/`MODE`/`DEV`). Matches the inventory's "9 frontend names" headline (6 `VITE_*` it counted + the cast-form `VITE_DEBUG_PERF` it found in a second scan = 7; the inventory's "9" includes the 3 built-ins minus a counting nuance — the binding set of project-declared `VITE_*` is **7**). `VITE_STRIPE_PUBLISHABLE_KEY` confirmed live at `src/components/StripeCheckoutWrapper.tsx:13` and `src/components/topup/StripePaymentElementModal.tsx:61`. **Confidence: HIGH.**

### Edge literal `Deno.env.get("NAME")` — DRIFT: 57 → **52** (the 5 `OLLAMA_*` gone)

```bash
rg -o "Deno\.env\.get\(['\"]([A-Z_0-9]+)['\"]" -r '$1' supabase/functions --no-filename | sort -u | wc -l
# → 52  (was 57 at 2026-06-14)
```

The 5 vanished names are exactly `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_AUTH_HEADER_NAME`, `OLLAMA_AUTH_SECRET`, `OLLAMA_TIMEOUT_MS`. This confirms Phase 4 (04-04, commit `48e583f`) deleted `_shared/ollama-client.ts` (file confirmed ABSENT) and stripped the ollama leg from `document-extraction.ts`. **This is the single material inventory drift since 2026-06-14.** The remaining 52 names match the inventory tables exactly (production secrets, the 4 `STRIPE_PRICE_MERIT_*` literal+template keys, the 27 test/CI names, OCR `MISTRAL_OCR_*`/`TEXTRACT_OCR_*`). **Confidence: HIGH.**

### Template-literal + computed-key reads — NO DRIFT (landmine intact)

```bash
rg -n 'Deno\.env\.get\(`' supabase/functions
# price-resolver.ts:31  STRIPE_PRICE_PRO_${suffix}
# price-resolver.ts:32  STRIPE_PRICE_PAID_${suffix}
# price-resolver.ts:33  STRIPE_PRICE_ELITE_${suffix}
# shop-pack-resolver.ts:64  STRIPE_PRICE_MERIT_${packSize}
rg -n 'Deno\.env\.get\([a-z]' supabase/functions
# price-resolver.ts:71/77/81 (key/paidKey/legacyKey)  + test computed reads (originals[key])
```

The 6 expanded subscription keys (`STRIPE_PRICE_{PRO,ELITE,PAID}_{MONTHLY,ANNUAL}`) remain LIVE / KEEP-LIST Class 4 / never-`safe`. **Confidence: HIGH.**

### `OLLAMA_*` test-file reference — SAFE, no conflict (Research Focus 3 detail)

The only remaining `OLLAMA_` strings in the whole tree (outside `.planning/`) are at `src/pages/__tests__/document-extraction-primary.test.ts:24-26`:

```ts
expect(helperSource).not.toContain('OLLAMA_BASE_URL');
expect(helperSource).not.toContain('OLLAMA_MODEL');
expect(helperSource).not.toContain('OLLAMA_AUTH');
```

These are **negative assertions** against `helperSource` = the *frontend* file `src/lib/document-extraction.ts` (read via `readFileSync` at line 4). They assert OLLAMA is ABSENT from the frontend helper — they PASS today and would only BREAK if someone *re-introduced* OLLAMA. They do NOT reference the deleted edge `_shared/ollama-client.ts`. **Therefore D-05's "handle conservatively" resolves cleanly: leave this test untouched.** It is in fact a guard *enforcing* the OLLAMA removal, not a residual to reconcile. This is the opposite situation from the MinimalHero R-01 `readFileSync` trap (which would ENOENT on delete) — nothing here breaks. **Confidence: HIGH.**

### OCR fallback liveness — code-live, KEEP (Research Focus 1 / D-05)

Both OCR client files exist (`_shared/mistral-ocr-client.ts`, `_shared/textract-client.ts`) and the chain is wired in `document-extraction.ts` (`provider: 'mistral'` L86, `provider: 'textract'` L93, `claude_ocr` L153-182). So `MISTRAL_OCR_API_KEY`/`MISTRAL_OCR_ENDPOINT`/`MISTRAL_OCR_MODEL` + `TEXTRACT_OCR_ENDPOINT`/`TEXTRACT_OCR_TOKEN` are **code-live optional fallbacks → KEEP** (document as optional; add "confirm whether set in prod" to the operator list). **Confidence: HIGH (code); MEDIUM (whether actually set in prod — operator-owned).**

## ENV-03 Artifact Design (Research Focus 2)

### Prior shape recovered from git (`0d5b1eff~1`)

The removed `.env.example` (40 lines) had four groups: Frontend (`VITE_*`, 6 names incl. `VITE_FEATURE_INTERVIEW_PREP`), Supabase edge secrets (12 names ending at `FIRECRAWL_API_KEY`, still listing legacy `PADDLE_WEBHOOK_SECRET` and **NO Stripe surface**), a Test/E2E block (5 names), and a "which env needs which" footer. The removed `.env.test.local.example` (9 lines) carried `SUPABASE_TEST_URL`/`SUPABASE_TEST_ANON_KEY`/`SUPABASE_TEST_SERVICE_ROLE_KEY`/`E2E_TEST_PASSWORD`/`STRIPE_TEST_PUBLISHABLE_KEY` with the literal hint `SUPABASE_TEST_URL=https://cimjltzovkahkqecpwgi.supabase.co` (a NAME+host, not a secret).

**Gap the re-creation must close:** the old `.env.example` documented ~18 names; the live surface is ~52 edge + 7 frontend. The headline missing names to ADD: `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the 6 `STRIPE_PRICE_{PRO,ELITE,PAID}_{MONTHLY,ANNUAL}` + 4 `STRIPE_PRICE_MERIT_{3,10,25,50}`, `MISTRAL_OCR_*` (3), `TEXTRACT_OCR_*` (2), `MERIT_SYSTEM_ENABLED`, `ADMIN_EMAIL`, `ADMIN_EMAILS`, `STRIVO_ENV`, `ANTHROPIC_MODEL_FALLBACK`.

### Proposed 3-way placement (D-02)

| Artifact | Contents (NAMES + placeholders only) |
|----------|--------------------------------------|
| `.env.example` (prod-runtime) | **Frontend (`VITE_*`):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_ANALYZE_CAREER_FUNCTION` (opt), `VITE_DEBUG_PERF` (opt), `VITE_FEATURE_INTERVIEW_PREP` (gating, never remove). **Supabase edge secrets (prod):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_TEXT` (opt), `ANTHROPIC_MODEL_FALLBACK` (opt), `INTERNAL_JOB_SECRET`, `APP_URL`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `MERIT_SYSTEM_ENABLED` (opt kill-switch), `STRIVO_ENV` (opt staging discriminator), `ADMIN_EMAIL`, `ADMIN_EMAILS`, `FIRECRAWL_API_KEY` (opt). **Stripe price IDs (with the template-literal landmine comment):** the 6 subscription + 4 merit. **OCR fallbacks (opt):** `MISTRAL_OCR_API_KEY`/`_ENDPOINT`/`_MODEL`, `TEXTRACT_OCR_ENDPOINT`/`_TOKEN`. **Legacy (gated-but-live, never remove):** `PADDLE_WEBHOOK_SECRET`. |
| `.env.test.local.example` (test/CI + E2E) | The 27 test/CI names: `AI_TEST_MODE`, `AI_FORCE_FAILURE`, `MERIT_TEST_FORCE_REFUNDABLE_ERROR`, `IS_TEST`, `RUN_EVALS`, `RUN_LIVE_MERIT`, `RUN_TIER_VALIDATION`, `DENO_TEST_SUPABASE_LOCAL`, `DENO_TEST_SUPABASE_REMOTE`, `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, `E2E_TEST_PASSWORD`, `STRIPE_TEST_PUBLISHABLE_KEY`, and the `TEST_*_JWT` / `TEST_*_ID` / `TEST_*_QUIZ_ID` fixtures. |
| `docs/ENVIRONMENT.md` (full matrix) | Every name in one table: **Name → Required/Optional → Consumer (file:line or "GitHub Actions secret") → Which env (prod / preview=staging=test / CI / local) → Why**. Plus the embedded re-runnable enumeration command (D-03) and the names-not-values warning header. |

### Recommended `docs/ENVIRONMENT.md` matrix columns (for the planner)

`| Name | Bucket | Req/Opt | Consumer (file:line) | Surface (where it's set) | Notes |` — where "Surface" is one of: Vercel project env (frontend `VITE_*`), Supabase prod secrets, Supabase preview/test secrets, GitHub Actions secret, local `.env`/`.env.test.local`. This column set directly feeds the ENV-04 reconciliation matrix (same surfaces).

### `.gitignore` whitelist re-validation — CONFIRMED behavior

`.gitignore` lines 2-5:
```
.env
.env.*
!.env.example
!.env.test.local.example
```
`git check-ignore -v .env.example .env.test.local.example` returns:
```
.gitignore:4:!.env.example          .env.example
.gitignore:5:!.env.test.local.example  .env.test.local.example
```
A `git check-ignore` exit of nonzero / a match on a `!`-negated rule means the path is **NOT ignored** (it is un-ignored by the whitelist). So when the two templates are re-created on disk they will be **trackable** — the whitelist is currently dangling (files absent) and re-creating them re-validates it. Both files are confirmed ABSENT on disk now. **Confidence: HIGH.** (Planner: after `git add .env.example .env.test.local.example`, confirm `git status` shows them staged, not ignored.)

## ENV-02 Mechanics (Research Focus 3)

**There is no dead env *read* left to delete in the repo.** Phase 4 already removed the only code-dead reads (the 5 `OLLAMA_*` via the `ollama-client.ts` deletion). So ENV-02's "remove dead reads" clause is already satisfied as a no-op at HEAD. ENV-02 here is therefore:

1. **Exclude `OLLAMA_*` (×5) from the new reference** (they are not in the live code surface anymore) and **add them to the operator un-set list** (operator confirms `supabase secrets list` shows no `OLLAMA_*` on prod — already confirmed in Phase 4 for prod ref `zjpjapgraoxdukdvpjes`; preview/test should be confirmed too).
2. **Document `RAPIDAPI_KEY` as dead** — it has ZERO code consumers anywhere (`rg "RAPIDAPI_KEY"` finds only CLAUDE.md:204, README.md:116, AGENTS.md:176, all marked "(not currently used)"). It is a **doc-only ghost**: exclude from `.env.example`/`docs/ENVIRONMENT.md`, and remove/footnote the stale doc mentions (NFR-03). It is NOT an operator un-set item (it was never a real secret); just a doc artifact.
3. **Resolve the 2 Direction-B orphans as live CI-only (KEEP)** — see ENV-04 below; both are consumed in `regression-gate.yml`.
4. **Test seams** (`AI_TEST_MODE`, `AI_FORCE_FAILURE`, `MERIT_TEST_FORCE_REFUNDABLE_ERROR`, `IS_TEST`, etc.) → documented test-only in `.env.test.local.example`.
5. **Never-remove set stands** (D-05): `PADDLE_WEBHOOK_SECRET`, `VITE_FEATURE_INTERVIEW_PREP`, the 6 `STRIPE_PRICE_*` template-literal keys.

**Net code diff for ENV-02 = zero.** The deliverables are the reference artifacts + the operator un-set list (`OLLAMA_*` ×5, optionally any orphaned live-store name the ENV-04 audit surfaces) + the `RAPIDAPI_KEY` doc cleanup.

## ENV-04 Verification (Research Focus 4)

### Env → ref topology (from `scripts/deploy.ps1`, the authoritative selector)

```
production → zjpjapgraoxdukdvpjes   (strivoai, prod)            deploy.ps1:73
staging    → cimjltzovkahkqecpwgi   (strivoaipreview)           deploy.ps1:74
test       → cimjltzovkahkqecpwgi   (test reuses strivoaipreview) deploy.ps1:75
```
Selection is explicit `supabase link --project-ref $ref` (deploy.ps1:112), NOT a `config.toml` swap. **Document honestly: there are TWO Supabase environments, not three — prod (`zjpjapgraoxdukdvpjes`) and preview(=staging=test) (`cimjltzovkahkqecpwgi`).** The real separation axis is **prod vs preview**. `config.toml` is the local-link default only (35 `[functions.*] verify_jwt` blocks; not the deploy selector).

### The four surfaces + operator commands (names-only, D-06)

| Surface | What it holds | Operator command (names only) | Expected bucket |
|---------|---------------|-------------------------------|-----------------|
| Supabase **prod** `zjpjapgraoxdukdvpjes` | server-side edge secrets (prod) | `supabase secrets list --project-ref zjpjapgraoxdukdvpjes` | the prod edge set: `ANTHROPIC_API_KEY`, `APP_URL`, `INTERNAL_JOB_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the 6+4 `STRIPE_PRICE_*`, `RESEND_API_KEY`, `SUPABASE_*`, admin emails, merit/strivo flags, OCR fallbacks (if set). Should NOT contain `OLLAMA_*`, `*_TEST_*`, `STAGING_SUPABASE_*` |
| Supabase **preview/test** `cimjltzovkahkqecpwgi` | edge secrets for staging + test-mode | `supabase secrets list --project-ref cimjltzovkahkqecpwgi` | same edge set but **test-mode** values (`APP_URL=localhost:8080`, `AI_TEST_MODE=true`, `sk_test_…`, test price IDs). Cross-env leakage = a `sk_live_`/prod-value here |
| **GitHub Actions** repo secrets | CI E2E build + runner | `gh secret list` | exactly the 7 the gate reads: `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, `STRIPE_TEST_PUBLISHABLE_KEY`, `E2E_TEST_PASSWORD` (and they back `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`VITE_STRIPE_PUBLISHABLE_KEY` at build). Should be TEST-project only — a prod ref/value here is leakage |
| **Vercel** env vars (frontend) | `VITE_*` baked at build | `vercel env ls` (or dashboard) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_ANALYZE_CAREER_FUNCTION`, `VITE_DEBUG_PERF`, `VITE_FEATURE_INTERVIEW_PREP`. Production env → `false`/prod values; Preview env → `true`/preview values (the `VITE_FEATURE_INTERVIEW_PREP` preview=true/prod=false split is the key per-env axis) |

### Reconciliation matrix + findings taxonomy (D-07)

Build one matrix: **rows = every distinct name; columns = {prod-Supabase, preview-Supabase, GitHub-Actions, Vercel-prod, Vercel-preview}; cells = present/absent (✓/–)**. Then classify each anomaly:

- **leakage** — a prod-only value/ref appearing in a test/CI/preview surface (e.g. `sk_live_` in `cimjltzovkahkqecpwgi`, a prod project-ref in GitHub secrets).
- **misplaced** — a name in the wrong surface (e.g. a server-side secret set as a Vercel `VITE_*`, or a test-seam set in prod Supabase).
- **missing-required** — a required name absent where it must be present (e.g. `STRIPE_WEBHOOK_SECRET` absent on prod Supabase).
- **orphaned** — a name set in a live store with no code/CI consumer (e.g. `OLLAMA_*` if still set anywhere, `RAPIDAPI_KEY`).

Findings → document + operator fix list (names only). **The phase closes on the documented audit + list; it does NOT couple completion to live-store mutation.** This is an `autonomous:false` operator checkpoint (honor the operator-checkpoint memory: never auto-approve). **Confidence: HIGH (repo-side topology + expected buckets); the live cell values are operator-owned and must not be inferred.**

## ENV-05 Audit (Research Focus 5)

I read every critical/required secret's consumer. **Five of six already fail closed; none fails open.**

| Secret | Consumer (file:line) | Current behavior | Verdict |
|--------|----------------------|------------------|---------|
| `APP_URL` | `_shared/cors.ts:38-41` | `if (!rawAppUrl) throw new Error('APP_URL … not set — cannot build safe CORS headers')` for `type:'user'` | **fail-closed** ✓ (D-08 anchor) |
| `ANTHROPIC_API_KEY` | `_shared/anthropic.ts:647-650` (non-stream) + `:802-805` (stream) | `if (!resolvedApiKey) return { ok:false, status:500, error:'ANTHROPIC_API_KEY not configured' }` / `yield {type:'error',status:500,…}` | **fail-closed** ✓ (D-08 anchor; both call paths) |
| `SUPABASE_SERVICE_ROLE_KEY` (+`SUPABASE_URL`) | `_shared/supabase-client.ts` `getServiceClient()` / `getSupabaseUrl()` / `getServiceRoleKey()` | each throws `'… not configured'` if unset | **fail-closed** ✓ |
| `STRIPE_SECRET_KEY` | `_shared/stripe-client.ts:23-24` | `const key = Deno.env.get('STRIPE_SECRET_KEY'); if (!key) throw new Error('STRIPE_SECRET_KEY not configured')` | **fail-closed** ✓ |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook-handler/index.ts:114-123` | `if (!webhookSecret) { log.warn(…); return jsonResponse({error:'invalid_signature'},401) }` — rejects the request, never processes an unsigned webhook | **fail-closed** ✓ |
| `INTERNAL_JOB_SECRET` | `_shared/auth.ts:141-145` | `if (!expectedSecret) { log.error('secret-not-configured'); throw unauthorizedResponse() }` (401, no `timingSafeEqual` reached) | **fail-closed** ✓ |

**No fail-open critical secret found.** Under D-08 ("add ONLY where a critical secret currently fails open"), the surgical-add bar is not met by anything I can see in the code. The planner should:
- Deliver the **coverage matrix above** as the ENV-05 artifact (confirms each is fail-closed with file:line).
- Add **no** guard unless the operator (or a deeper read of a function the inventory tags `required`) surfaces a genuine fail-open path. If one IS added, it is a narrow `if (!x) throw/return` mirroring the patterns above, and it triggers the **edge-change deploy-smoke** discipline (offline `--no-check` cannot prove an edge change safe — Phase 4/6 lesson).

**Note on `RESEND_API_KEY`:** the inventory marks it required for 8 email fns; it was NOT in D-08's named set. If the planner wants completeness, the matrix can include it, but a missing email key degrading email (not a security-critical fail-open) is a different risk class — keep it documentation-only unless a fail-open is shown. **Confidence: HIGH for the 6 named; MEDIUM that "add nothing" is the right call — flag for operator confirmation at the ENV-05 checkpoint.**

## NFR-03 Doc Deltas (Research Focus 6)

Exact stale spots found at HEAD:

| Doc | Spot | Problem | Fix |
|-----|------|---------|-----|
| **README.md** | lines 135-142 (§"Deployment") | "These scripts swap `supabase/config.toml`, link to the target Supabase project…" — STALE (the config-swap footgun was removed; selection is explicit `supabase link --project-ref` in `scripts/deploy.ps1`, with `deploy-staging.ps1`/`deploy-production.ps1` as thin shims) | rewrite to describe the unified `deploy.ps1 -Env {production\|staging\|test}` + explicit `--project-ref` + the `verify:baseline` HARD gate |
| **README.md** | line 85 | a stray git merge-conflict marker `> > > > > > > 3ffe64c14c0fd8f4182c1c51a374d37d7f1d114e` is committed in the file (a second copy at the bottom of CLAUDE.md too) | remove the marker line (doc-corruption cleanup; within NFR-03 "docs updated where structure changed") |
| **README.md** | lines 93-116 (§"Environment Variables") | omits the entire Stripe surface (`VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs), OCR fallbacks, `STRIVO_ENV`, `MERIT_SYSTEM_ENABLED`, `ADMIN_EMAIL(S)`; lists `RAPIDAPI_KEY` (dead) | replace with a short pointer to `docs/ENVIRONMENT.md` (don't duplicate the full matrix); drop `RAPIDAPI_KEY` |
| **CLAUDE.md** | lines 189-204 | env list shows `PADDLE_WEBHOOK_SECRET` but NO live Stripe surface; lists `RAPIDAPI_KEY` "(not currently used)" | reconcile + point at `docs/ENVIRONMENT.md`; drop/footnote `RAPIDAPI_KEY`. **Note:** CLAUDE.md is partly managed by `generate-claude-profile` — edit only the env block, preserve the managed sections |
| **AGENTS.md** | lines 168-176 (NOT in D-09's list) | near-duplicate stale env block (`PADDLE_WEBHOOK_SECRET`, `RAPIDAPI_KEY`, no Stripe) | **FLAG for planner:** AGENTS.md is a third doc surface with the same drift. Decide whether NFR-03 covers it (recommend: reconcile or add a pointer for consistency, since it duplicates the CLAUDE.md env list) |
| **TESTING-STRATEGY.md** | lines 371-375 | references `SUPABASE_TEST_*` + `STRIPE_TEST_PUBLISHABLE_KEY` | reconcile against the new `.env.test.local.example` (names + `cimjltzovkahkqecpwgi` mapping); note `AI_TEST_MODE` transient |
| **docs/ENVIRONMENT.md** | (new) | does not exist | create the canonical matrix (D-01/D-02). `docs/` exists (holds `VERCEL_PREVIEW_SETUP.md` + `tech-debt/`) |

**Confidence: HIGH** (all line numbers verified at HEAD).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Keeping the env reference in sync | A new CI drift-gate or `scripts/audit/check-env-docs.mjs` | The re-runnable `rg` enumeration block embedded in `docs/ENVIRONMENT.md` (D-03) | Explicitly deferred; false-positive risk on test seams + the `STRIPE_PRICE_*` template-literal class |
| Startup secret validation | A central `assertRequiredEnv()` across 27+ functions | The existing per-function `if (!x) throw` guards | D-08 defers the central helper on blast-radius grounds; each function already fails closed |
| Cross-surface secret listing | Any script that reads live stores | Operator-run `supabase secrets list` / `gh secret list` / `vercel env ls` | Prod is MCP read-only; the secrets store is not MCP-reachable; D-06 mandates operator-run names-only |
| Secret-name enumeration in code | A custom AST walker | `rg` with the three documented patterns (literal, template-literal, computed) | The inventory's patterns already catch the landmine classes |

**Key insight:** Almost every "tooling" instinct here is explicitly deferred. The phase's value is *evidence + documentation*, not automation.

## Common Pitfalls

### Pitfall 1: The `STRIPE_PRICE_*` template-literal trap
**What goes wrong:** A literal `rg STRIPE_PRICE_PRO_MONTHLY` finds the 6 subscription keys ONLY in `*.test.ts` / `DEPLOY_RUNBOOK.md` → an audit falsely flags them "unused / remove."
**How to avoid:** They are built at `price-resolver.ts:31-33,70` via `` `STRIPE_PRICE_${tier}_${interval}` ``. KEEP-LIST Class 4, LIVE, never `safe`. Expand by hand: `{PRO,ELITE,PAID}×{MONTHLY,ANNUAL}` = 6 + `STRIPE_PRICE_MERIT_{3,10,25,50}` = 4.
**Warning sign:** any list that says these have "test-only consumers."

### Pitfall 2: Names-not-values discipline (T-3-07 / REPO-05)
**What goes wrong:** A committed env doc pastes a real key/JWT/price-ID.
**How to avoid:** Every committed artifact records NAMES + consumer + required/optional ONLY. Run the secret-grep guard before every commit (see Validation Architecture). The `SUPABASE_TEST_URL=https://cimjltzovkahkqecpwgi.supabase.co` form is a NAME+host (project URL, not a secret) — acceptable, matches the prior template; still run the guard.

### Pitfall 3: The documented secret-grep guard command is BROKEN on this ripgrep
**What goes wrong:** ENV-INVENTORY.md's guard uses `rg -nE "…"`. On the installed ripgrep, `-E` means `--encoding`, NOT "extended regex" (ripgrep is regex-by-default), so the command errors with `unknown encoding`.
**How to avoid:** Drop the `-E`. The corrected, verified form (positive-control tested) is:
```bash
rg -n "sk_live_[A-Za-z0-9]{20}|sk_test_[A-Za-z0-9]{20}|pk_live_[A-Za-z0-9]{20}|service_role[^a-zA-Z0-9]{0,40}eyJ|eyJ[A-Za-z0-9_-]{30,}|price_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----" <file>
```
**Warning sign:** "unknown encoding" error → you used `-E`.

### Pitfall 4: Edge-change deploy-smoke asymmetry
**What goes wrong:** A fail-closed guard added to an edge function passes offline `verify:baseline` (deno runs `--no-check`) but is never exercised at runtime.
**How to avoid:** ANY edge code change (only relevant if ENV-05 adds a guard) needs a staging deploy-smoke. **BUT** the staging/test project `cimjltzovkahkqecpwgi` is currently **PAUSED** (carried-forward DI-06-03-01/04-01/05-01) — live preview smokes are env-deferred. If a guard must be added, the smoke is operator-gated and may be deferred with a RESIDUAL-REGISTER entry, exactly like the Phase 6 realtime smoke. **Strong reason to prefer "add nothing" for ENV-05** unless a real fail-open is found.

### Pitfall 5: staging≡test topology confusion
**What goes wrong:** Treating "staging" and "test" as separate Supabase environments in the ENV-04 matrix.
**How to avoid:** `deploy.ps1:74-75` maps BOTH to `cimjltzovkahkqecpwgi`. There are only TWO Supabase envs (prod + preview). Document the axis as prod vs preview(=staging=test).

### Pitfall 6: Pure-ASCII `.ps1`
**What goes wrong:** Editing a `.ps1` (deploy scripts) with an em-dash/box-drawing char breaks Win PowerShell 5.1 (cp1252) parsing.
**How to avoid:** This phase shouldn't need to touch `.ps1` (deploy.ps1 is read-only evidence for ENV-04). If any `.ps1` is touched, keep it pure-ASCII; verify `grep -c $'\xe2'` = 0.

### Pitfall 7: Never `git add -f`/`-A`; never commit `.env`/`.env.*`
**What goes wrong:** Staging a filled `.env` (the operator's local `.env` 2806 B + `.env.test.local` 1476 B exist on disk, gitignored) leaks secrets; `git add -A` could sweep them.
**How to avoid:** Stage specific paths only. The re-created TEMPLATES (`.env.example`, `.env.test.local.example`) are explicitly whitelisted and SAFE to commit (they hold names+placeholders). The filled `.env`/`.env.test.local` are NEVER committed.

## Validation Architecture

This section exists so the Nyquist VALIDATION.md can be derived. Since the phase is docs+audit with a near-empty code diff, validation is mostly *artifact checks*, not behavior tests.

| Requirement | Validation method | Pass criterion | Automated? |
|-------------|-------------------|----------------|------------|
| ENV-02 | (a) re-run edge enumeration → matches documented set minus `OLLAMA_*`; (b) `rg "RAPIDAPI_KEY"` shows only doc mentions (now removed) | enumeration parity; no dead read in code | YES (re-runnable `rg`) |
| ENV-03 | (a) secret-grep guard over `.env.example` + `.env.test.local.example` + `docs/ENVIRONMENT.md` = ZERO matches; (b) `git check-ignore` proves both templates trackable; (c) `git status` shows them staged after `git add <path>` | zero secret matches; templates tracked | YES |
| ENV-04 | operator runs the 4 listing commands (names only); reconciliation matrix built; findings classified; operator fix list produced | matrix complete across 4 surfaces; anomalies classified | NO (operator-gated checkpoint, `autonomous:false`) |
| ENV-05 | coverage matrix confirms each of the 6 critical secrets fails closed (file:line); IF a guard is added, deploy-smoke on staging (env-deferred if test project paused) | all 6 documented fail-closed; any added guard smoked-or-deferred | PARTIAL (matrix manual; `verify:baseline` if code touched) |
| NFR-03 | (a) `rg "config.toml.*swap"` README → zero; (b) `rg "RAPIDAPI_KEY"` README/CLAUDE/AGENTS → zero (or footnoted); (c) merge-marker `rg "^> > > > > > >"` README/CLAUDE → zero; (d) doc pointers to `docs/ENVIRONMENT.md` present | each stale spot fixed | YES (re-runnable `rg`) |
| Governing (zero-functional-change) | `git diff v4.0-baseline..HEAD -- src supabase/functions` is EMPTY (unless an ENV-05 guard was added, in which case it's the ONLY edge diff + a smoke); `verify:baseline` green | empty source diff OR single smoked guard; baseline green | YES |

**Current baseline to preserve:** `verify:baseline` = `npm run test && npm run test:edge && npm run test:e2e` (package.json:18). Green baseline at phase start: vitest **457**, deno **699/0/11**, Playwright **4 pass + 1 skip + 1 documented env-red** (stripe-checkout:56, the paused-test-project leg). A docs-only phase should leave ALL of these byte-for-byte unchanged.

**Re-runnable enumeration (corrected, embed in `docs/ENVIRONMENT.md`):**
```bash
# Frontend
rg -n "import\.meta\.env\.\w+" src -o | sort -u
rg -o "VITE_[A-Z_0-9]+" src | sort -u
# Edge literal (→ 52 at HEAD; was 57 pre-Phase-4 Ollama removal)
rg -o "Deno\.env\.get\(['\"]([A-Z_0-9]+)['\"]" -r '$1' supabase/functions --no-filename | sort -u
# Edge template-literal + computed
rg -n 'Deno\.env\.get\(`' supabase/functions
rg -n 'Deno\.env\.get\([a-z]' supabase/functions
```

## State of the Art

| Old (inventory, 2026-06-14) | Current (HEAD, 2026-06-20) | Why changed | Impact |
|------------------------------|----------------------------|-------------|--------|
| 57 edge literal env names | **52** | Phase 4 (04-04, `48e583f`) deleted `ollama-client.ts` → 5 `OLLAMA_*` gone | `OLLAMA_*` excluded from reference; operator un-set list (already confirmed unset on prod) |
| 2 Direction-B orphans "no consumer found" | **both resolved live CI-only** | inventory's `rg` was code-only; they're consumed via `${{ secrets.* }}` in `regression-gate.yml:64-70` | KEEP both; document as GitHub-Actions/CI surface |
| `.env.example` + `.env.test.local.example` present | **both absent on disk** (removed `0d5b1eff`) | deliberate removal 2026-06-13, whitelist left dangling | D-01 re-creates them (re-validates whitelist) |

**Deprecated/outdated:**
- `RAPIDAPI_KEY` — documented in 3 files, ZERO consumers, "(not currently used)". Doc ghost; drop.
- README §Deployment "swap config.toml" — superseded by explicit `--project-ref` in `deploy.ps1`.

## Open Questions

1. **Are `OLLAMA_*` / `RAPIDAPI_KEY` / any orphan still set in the live stores?**
   - What we know: prod `zjpjapgraoxdukdvpjes` has NO `OLLAMA_*` (operator-confirmed Phase 4). Code has zero consumers for either.
   - What's unclear: whether `OLLAMA_*` lingers on preview/test `cimjltzovkahkqecpwgi`, or `RAPIDAPI_KEY` anywhere.
   - Recommendation: include in the ENV-04 operator un-set list ("orphaned" class); names-only.

2. **Does ENV-05 actually need any guard added?**
   - What we know: all 6 named critical secrets fail closed at HEAD (matrix above).
   - What's unclear: whether the operator considers a non-critical key (e.g. `RESEND_API_KEY`) in scope, or knows of a fail-open path not visible in the read.
   - Recommendation: present the coverage matrix at the ENV-05 checkpoint; default to "add nothing"; only add (+deploy-smoke, possibly deferred) if the operator surfaces a fail-open.

3. **Is AGENTS.md in NFR-03 scope?**
   - What we know: AGENTS.md (lines 168-176) duplicates CLAUDE.md's stale env block; D-09 named only README/CLAUDE.md/TESTING-STRATEGY.md.
   - What's unclear: whether the operator wants the third surface reconciled.
   - Recommendation: reconcile it (or add a pointer) for consistency; flag in the plan; cheap and zero-risk.

4. **Can an ENV-05 guard be deploy-smoked at all this phase?**
   - What we know: the test/preview project `cimjltzovkahkqecpwgi` is PAUSED (DI-06-*); live smokes are env-deferred.
   - Recommendation: prefer "add nothing"; if a guard is unavoidable, defer the smoke via a RESIDUAL-REGISTER entry (Phase-6 realtime-smoke precedent).

## Sources

### Primary (HIGH confidence — code/git at HEAD `6e0afb11`)
- `.planning/audit/ENV-INVENTORY.md` — the authoritative inventory; re-derived at HEAD.
- `supabase/functions/_shared/cors.ts:38-41`, `_shared/anthropic.ts:647-650,802-805`, `_shared/supabase-client.ts`, `_shared/stripe-client.ts:23-24`, `_shared/auth.ts:141-145`, `stripe-webhook-handler/index.ts:114-123` — ENV-05 fail-closed evidence.
- `supabase/functions/_shared/price-resolver.ts:31-33,70-81`, `shop-pack-resolver.ts:64` — template-literal landmine.
- `supabase/functions/_shared/document-extraction.ts:86,93,153-182` + `mistral-ocr-client.ts`/`textract-client.ts` — live OCR chain.
- `src/pages/__tests__/document-extraction-primary.test.ts:24-26` — the OLLAMA negative assertions (safe).
- `.github/workflows/regression-gate.yml:63-71` — the 2 Direction-B orphans resolved as CI-only.
- `scripts/deploy.ps1:73-75,112` — env→ref topology.
- `.gitignore:2-5` + `git check-ignore -v` — whitelist re-validation.
- `git show 0d5b1eff` + `git show 0d5b1eff~1:.env.example` / `:.env.test.local.example` — prior template shape.
- `README.md:85,135-142,93-116`, `CLAUDE.md:189-204`, `AGENTS.md:168-176`, `TESTING-STRATEGY.md:371-375` — NFR-03 stale spots.
- `.planning/STATE.md`, `.planning/REQUIREMENTS.md`, `.planning/audit/KEEP-LIST.md`, `.planning/audit/RESIDUAL-REGISTER.md` — locked decisions, KEEP classes, deferral pattern, paused-test-project blocker.

### Secondary (HIGH — re-runnable commands executed this session)
- Edge enumeration (52 names), frontend enumeration (7 `VITE_*`), `rg "OLLAMA"`, `rg "RAPIDAPI_KEY"`, corrected secret-grep guard positive-control + zero-over-inventory, `config.toml` verify_jwt count (35).

## Metadata

**Confidence breakdown:**
- Inventory drift (52 vs 57; OLLAMA dead): HIGH — re-derived from code + git.
- ENV-03 artifact shape + whitelist: HIGH — git-recovered + `git check-ignore` verified.
- ENV-02 mechanics (zero code diff): HIGH — no dead read remains.
- ENV-04 topology + expected buckets: HIGH (repo side); live cell values operator-owned (not inferred).
- ENV-05 fail-closed matrix: HIGH (6 secrets, file:line); MEDIUM that "add nothing" is final — operator-confirm.
- NFR-03 stale spots: HIGH — line numbers verified.

**Research date:** 2026-06-20
**Valid until:** ~2026-07-20 (stable; re-run the enumeration if `supabase/functions/**` changes). The 52-name count and the fail-closed matrix should be re-confirmed at plan time if any commits land on `supabase/functions/` between now and planning.

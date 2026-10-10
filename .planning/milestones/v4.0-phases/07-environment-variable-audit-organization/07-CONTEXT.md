# Phase 7: Environment Variable Audit & Organization - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase makes environment configuration **clear, minimal, documented, and correctly separated** without changing any production behavior. It delivers five requirements (ENV-02, ENV-03, ENV-04, ENV-05, NFR-03) by acting on the **Phase 3 `ENV-INVENTORY.md`** (9 frontend `import.meta.env` names + 57 literal edge `Deno.env.get` names + 6 template-expanded subscription keys + 27 test/CI names):

1. **ENV-02** — Identify and remove/consolidate unused, redundant, or duplicated env vars, verified against the Phase 3 inventory + code references.
2. **ENV-03** — Produce a canonical, documented env reference (`.env.example` + docs) aligned across staging / production / backend.
3. **ENV-04** — Verify staging vs production separation is explicit and correct, with no cross-environment leakage.
4. **ENV-05** — Confirm fail-closed validation for critical/required secrets (e.g. `APP_URL` CORS, `ANTHROPIC_API_KEY`) is present.
5. **NFR-03** — Update documentation (README, CLAUDE.md, env reference, testing strategy) wherever structure, configuration, or testing changed.

**Governing constraint (unchanged): zero functional change.** No successful runtime behavior may change. This phase is dominated by **audit + documentation + reconciliation**; the removal surface is narrow (the inventory found ~0 truly-unused production vars) and live secret-store changes are **operator actions, never executed by us** (Supabase prod is read-only via MCP; the secrets store is not even MCP-reachable — it needs operator-run `supabase secrets list`). Any edge-function code change re-runs the Phase 1 `verify:baseline` gate and additionally needs a **staging deploy-smoke** (offline `--no-check` cannot prove an edge change safe — Phase 4/6 lesson).

**NOT in this phase:** DB removals / RLS (Phase 8); performance/latency refactors (Phase 9); runtime error-taxonomy / advisory triage (Phase 7.1); any new product capability. The big-blast-radius env work (a central env-validation helper across all 27+ functions) is explicitly **deferred** (see `<deferred>`).

</domain>

<decisions>
## Implementation Decisions

### Canonical env reference (ENV-03)

* **D-01: Templates + docs file — re-create BOTH `.env.example` and `.env.test.local.example`, PLUS a narrative `docs/ENVIRONMENT.md`.** The templates are the copy-paste skeletons (NAMES + empty/placeholder values only); `docs/ENVIRONMENT.md` is the explanation (which-env matrix, required/optional, consumer, why). README + CLAUDE.md point at them. This matches ENV-03's literal "`.env.example` + docs." **Critical context the planner must honor:** `.env.example` + `.env.test.local.example` were *deliberately removed* at commit `0d5b1eff` (2026-06-13, bare message "remove example environment variable files", now on main/preview/staging) — but `.gitignore` STILL whitelists them (`!.env.example`, `!.env.test.local.example`). Re-creating them re-validates that whitelist. The prior versions (commit `57f84e1`, quick-task 260609-nks — grouped, secret-free, with a which-env matrix) are the starting shape, but must be COMPLETED to cover the ~46 code-not-example gap names the inventory found. Chosen over **templates-only** and **docs-file-only** (which would have honored the removal and dropped the whitelist).

* **D-02: 3-way clean split of content.**
  * `.env.example` = the **production-runtime surface**: frontend `VITE_*` + production edge secrets, grouped — Frontend (`VITE_*`), Supabase edge secrets (prod), Stripe price IDs (the 6 subscription + 4 merit, with the template-literal landmine noted), OCR fallbacks (optional), Legacy (`PADDLE_*` — flagged gated-but-live, never removed).
  * `.env.test.local.example` = the **test/CI + E2E surface**: the 27 test/CI names (`AI_TEST_MODE`, `TEST_*_JWT`, `STAGING_SUPABASE_*`, the E2E runner names, etc.).
  * `docs/ENVIRONMENT.md` = the **complete cross-env matrix** for every bucket (name → required/optional → consumer → which-env → why).
  * This split *also satisfies* ENV-04's "split the 27 test names out of the production bucket." Chosen over a single template with a delimited test section, and over "lock buckets, planner places."

* **D-03: Keep the reference aligned with a re-runnable command, NOT a gate.** Build the reference now by re-running the `ENV-INVENTORY.md` enumeration (the documented `rg` blocks), and embed that exact command in `docs/ENVIRONMENT.md` so anyone can re-verify on demand. **No new CI gate, no new audit script.** Mirrors the existing audit-script/re-runnable-inventory pattern; lowest risk under zero-functional-change. Chosen over an off-gate `scripts/audit/check-env-docs.mjs` (`npm run audit:env`) and over a blocking CI drift-check (false-positive risk on test seams + the `STRIPE_PRICE_*` template-literal class).

### Removal / consolidation scope (ENV-02)

* **D-04: ENV-02 acts on CODE + DOCS only; live-store cleanup is an operator action list.** Remove any remaining dead env *reads* in the repo, exclude dead/legacy vars from the new reference (or mark them gated), and produce an **operator action list (names only)** of secrets to un-set in the live prod/preview stores. **We never write prod secrets** (MCP prod read-only; secrets store not MCP-reachable). Actual store cleanup is operator-confirmed (Phase 4 operator-gate pattern). Chosen over mutating the writable preview store via CLI (risks the shared staging/test E2E env) and over docs-reconcile-only (would leave dead reads in the tree).

* **D-05: Resolve the `needs-investigation` set evidence-based, KEEP-on-doubt.** The researcher re-runs the enumeration at HEAD, then:
  * **OCR fallbacks** (`MISTRAL_OCR_*` ×3, `TEXTRACT_OCR_*` ×2) — clients are **code-live** (the `mistral → textract → claude_ocr` chain is intact after Phase 4 removed only Ollama). → **KEEP**, document as optional fallback, add "confirm whether set in prod" to the operator list.
  * **`OLLAMA_*`** (×5) — now **code-dead**: Phase 4 (04-04) deleted `_shared/ollama-client.ts`; the only remaining `OLLAMA_` reference is the test file `src/pages/__tests__/document-extraction-primary.test.ts`; operator already confirmed prod has `OLLAMA_BASE_URL` unset. → exclude from the reference; add to the operator un-set list; handle the test-file reference conservatively (do not break a passing test to chase a dead var).
  * **2 documented-but-no-consumer** (`SUPABASE_TEST_ANON_KEY`, `STRIPE_TEST_PUBLISHABLE_KEY`) — grep CI/shell/`e2e`; document as CI-only if found, else flag for operator removal.
  * **Test seams** (`AI_TEST_MODE`, `AI_FORCE_FAILURE`, `MERIT_TEST_FORCE_REFUNDABLE_ERROR`, `IS_TEST`, etc.) — documented as test-only in `.env.test.local.example`.
  * **Demote-on-doubt (Phase 3/4 gate): nothing is removed unless provably dead.** Never-remove set stands: `PADDLE_WEBHOOK_SECRET` (Class 2 gated), `VITE_FEATURE_INTERVIEW_PREP` (Class 1 gated-but-live), the 6 `STRIPE_PRICE_{PRO,ELITE,PAID}_{MONTHLY,ANNUAL}` template-literal keys (Class 4, LIVE). Chosen over aggressive "remove-if-not-positively-live" and over deferring the whole set to the residual register.

### Separation proof (ENV-04)

* **D-06: Full cross-surface audit, operator-run, names-only.** Document the env→ref topology from `scripts/deploy.ps1` (the authoritative selector via explicit `supabase link --project-ref`, NOT config.toml), then the **operator** lists secret NAMES across all four surfaces and we reconcile a cross-surface matrix for leakage:
  * Supabase **prod** (`zjpjapgraoxdukdvpjes`) — `supabase secrets list`
  * Supabase **preview/test** (`cimjltzovkahkqecpwgi`) — `supabase secrets list`
  * **GitHub Actions** repo secrets — `gh secret list`
  * **Vercel** env vars (frontend) — Vercel dashboard / `vercel env ls`
  * **Topology to document honestly:** "staging" and "test" are the **same project** (`cimjltzovkahkqecpwgi`) — there is no separate staging Supabase env; the real separation axis is **prod vs preview(=staging=test)**. Names-only, no values (Phase 2 REPO-05 discipline). This is an **operator-gated checkpoint** (`autonomous:false`). Chosen over static-doc-only (can't prove value-level separation) and over a lighter static+single-diff.

* **D-07: Leakage findings → document + operator fix list; we mutate no store.** The audit emits the matrix plus a classified findings list (leakage / misplaced / missing-required / orphaned), and remediation is an **operator action list (names only)**. The phase closes on the documented audit + list — it does NOT couple completion to live-store mutation. Consistent with D-04 + read-only-prod. Chosen over operator-fixes-in-phase-then-re-verify and over we-fix-the-preview-store.

### Fail-closed validation (ENV-05)

* **D-08: Confirm + add ONLY where missing (surgical).** Audit each critical/required secret (`APP_URL`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `INTERNAL_JOB_SECRET`) for an existing fail-closed path; document a coverage matrix; **add a narrow fail-closed guard ONLY where a critical secret currently fails open or with an unclear error** — a safety improvement that does not change successful behavior. Each addition is deploy-smoked (edge-change discipline). Known-present anchors: `APP_URL` fail-closed in `_shared/cors.ts`; `ANTHROPIC_API_KEY` fail-closed in `_shared/anthropic.ts` (Phase 5 characterized the missing-key 500). Chosen over confirm-and-document-only (would leave a real gap unclosed) and over a central `assertRequiredEnv()` helper across 27+ functions (blast radius — deferred).

### Documentation (NFR-03)

* **D-09: Update every doc surface touched by config/structure changes.**
  * **README.md** — fix the **STALE deploy description** (lines 139-142 still claim the deploy scripts "swap `supabase/config.toml`"; the config-swap footgun was removed in quick-task 260609-nks — selection is now explicit `supabase link --project-ref` in the unified `scripts/deploy.ps1`, with `deploy-staging.ps1`/`deploy-production.ps1` as thin shims). Reconcile the README env-vars section against the new canonical reference.
  * **CLAUDE.md** — reconcile its env-var list (it currently lists `PADDLE_WEBHOOK_SECRET` but omits the live Stripe surface incl. `VITE_STRIPE_PUBLISHABLE_KEY`); point at `docs/ENVIRONMENT.md` rather than duplicating the full matrix.
  * **TESTING-STRATEGY.md** — reconcile the testing/E2E env vars (`AI_TEST_MODE` transient, `SUPABASE_TEST_*` → `cimjltzovkahkqecpwgi`) against `.env.test.local.example`.
  * **docs/ENVIRONMENT.md** — the new canonical matrix (D-01/D-02).

### Claude's Discretion

* Plan/commit slicing and wave structure; the exact `docs/ENVIRONMENT.md` matrix format and column set; the precise grouping/comment style inside the two templates; the exact wording of the operator action lists (ENV-02 un-set list, ENV-04 cross-surface listing instructions); the handling mechanics of the `OLLAMA_*` test-file reference (KEEP-on-doubt unless it asserts removed behavior); whether the operator secret-name listings are gathered in one checkpoint or split — all left to research + planning, consistent with the decisions above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements (locked)

* `.planning/ROADMAP.md` §"Phase 7: Environment Variable Audit & Organization" — goal, depends-on (Phase 3), the 5 success criteria. (Also note §"Phase 7.1" — the runtime-reliability phase INSERTED *after* Phase 7; do not pull its scope here.)
* `.planning/REQUIREMENTS.md` — **ENV-02 / ENV-03 / ENV-04 / ENV-05 + NFR-03**, and the governing zero-functional-change constraint. ENV-01 already Complete (Phase 3).
* `.planning/PROJECT.md` §"Current Milestone: v4.0" — env-var audit target ("clear, consistent, documented, non-duplicative, aligned across staging/production/backend"); hard constraint (zero functional change); git rules.

### The inventory this phase acts on (PRIMARY — read first)

* `.planning/audit/ENV-INVENTORY.md` (03-04, ENV-01) — **THE authoritative input.** The 9 frontend + 57 literal edge + 6 template-expanded subscription + 27 test/CI surface, each with consumer/bucket/required-optional; the both-directions `.env.example`↔code gap tables (~46 code-not-example, 2 example-not-code); the defused `STRIPE_PRICE_*` template-literal landmine; the `VITE_DEBUG_PERF` Open-Q1 resolution; the re-runnable `rg`/PowerShell enumeration blocks; the explicit Phase-7 handoff notes for ENV-02/03/04/05. **The names-not-values discipline (its header warning + T-3-07 secret-grep guard) governs every doc this phase writes.**
* `.planning/audit/KEEP-LIST.md` — the mandatory `safe`-classification gate; Class 1 (`VITE_FEATURE_INTERVIEW_PREP`), Class 2 (`PADDLE_WEBHOOK_SECRET`), Class 4 (the 6 template-literal `STRIPE_PRICE_*` keys) — all never-`safe`/never-remove.
* `.planning/audit/RESIDUAL-REGISTER.md` — the append-only deferred / accepted-risk register; any ENV-02 deferral, the central-env-guard defer (D-08/`<deferred>`), and the operator-pending items append here in the same style.
* `.planning/audit/INDEX.md` — audit catalog entry point; the ENV-INVENTORY row (ENV-01 03-04 → Phase 7).

### Env / config surfaces (the act-on files)

* `scripts/deploy.ps1` — the **env→ref separation source of truth** (ENV-04): `production → zjpjapgraoxdukdvpjes`, `staging → cimjltzovkahkqecpwgi`, `test → cimjltzovkahkqecpwgi` (staging≡test); explicit `supabase link --project-ref`; the `verify:baseline` deploy gate. Keep **pure-ASCII** (Win PowerShell 5.1 cp1252 — project memory). `deploy-staging.ps1` / `deploy-production.ps1` are thin shims.
* `supabase/config.toml` — local-linking default only (NOT the deploy selector); annotated header explains why; 35 `[functions.*] verify_jwt` blocks.
* `.gitignore` — the `!.env.example` / `!.env.test.local.example` **dangling whitelist** D-01 re-validates.
* `supabase/functions/_shared/cors.ts` — `APP_URL` fail-closed CORS (ENV-05 anchor).
* `supabase/functions/_shared/anthropic.ts` — `ANTHROPIC_API_KEY` fail-closed (ENV-05 anchor); `STRIVO_ENV` staging discriminator; the `AI_TEST_MODE`/`AI_FORCE_FAILURE` two-key test seam.
* `supabase/functions/_shared/price-resolver.ts` + `shop-pack-resolver.ts` — the template-literal `STRIPE_PRICE_*` read sites (the landmine; document, never "unused").
* `supabase/functions/_shared/mistral-ocr-client.ts` + `textract-client.ts` — the live OCR fallback consumers (D-05 KEEP).

### Docs to update (NFR-03)

* `README.md` §"Deployment" (lines ~139-142 STALE) + §"Environment Variables".
* `CLAUDE.md` — env-var list reconcile + pointer.
* `TESTING-STRATEGY.md` (repo root) — testing/E2E env vars; the `verify:baseline` composition any edge change re-runs.
* `docs/` — existing dir (holds `VERCEL_PREVIEW_SETUP.md`, `tech-debt/`); home for the new `docs/ENVIRONMENT.md`.

### Prior decisions / lessons (locked upstream — do not re-litigate)

* `.planning/quick/260609-nks-infrastructure-deploy-workflow-simplific/260609-nks-SUMMARY.md` — created the (since-removed) env templates + the unified `deploy.ps1` + the config-swap-footgun removal; the starting shape for D-01.
* `.planning/phases/02-repository-hygiene-state-reconciliation/02-SECRET-SCAN.md` — the REPO-05 names-not-values discipline (T-3-07 mitigation) every committed doc inherits.
* `.planning/phases/06-dependency-hygiene/06-CONTEXT.md` — the edge-change validation asymmetry (offline `--no-check` ⇒ any edge change needs a staging deploy-smoke), the atomic-commit/ledger + RESIDUAL-REGISTER patterns, the canonical prod/test refs.
* `.planning/phases/04-dead-code-refactor-cleanup/` (04-04 SUMMARY) — Ollama client removal + the operator-gate pattern (prod `OLLAMA_BASE_URL` unset); the basis for D-05's `OLLAMA_*` code-dead finding.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

* **`ENV-INVENTORY.md` re-runnable enumeration** (`rg` blocks for `import.meta.env.*`, literal `Deno.env.get("…")`, template-literal `Deno.env.get(\`…\`)`, computed-key reads) — the exact mechanism to rebuild the canonical reference at HEAD (D-03) and re-confirm the removal set (D-04/D-05).
* **`scripts/deploy.ps1`** — already encodes the authoritative env→ref topology + the staging≡test reality (D-06); read it, don't infer separation from config.toml.
* **`.env` (2806 B) + `.env.test.local` (1476 B) on disk** — the operator's local filled copies (gitignored; **NEVER commit** — `.gitignore` `.env` / `.env.*`). They are a reference for which names are actually in use locally, but values must never enter any committed artifact.
* **`.planning/audit/RESIDUAL-REGISTER.md`** — the append-only register for any deferral.
* **`verify:baseline`** (vitest + offline deno + Playwright) + the `scripts/deploy.ps1` gate — the per-change proof; current green baseline vitest 457 / deno 699-0-11 / Playwright 4 pass + 1 skip + 1 documented env-red.

### Established Patterns

* **Names-not-values in every committed doc** (Phase 2 REPO-05) — the inventory's secret-grep guard pattern; run it over `docs/ENVIRONMENT.md` + the templates before commit.
* **Demote-on-doubt KEEP-LIST gate before any removal** (Phase 3/4) — the spine of D-05.
* **Operator-gate for live-environment facts** (Phase 4 Ollama/AuthCallback; Phase 3 DB live leg) — the model for the ENV-04 cross-surface listing (D-06) + the ENV-02 un-set list (D-04).
* **Pure-ASCII `.ps1`** — any script touched stays cp1252-safe (project memory; broke + fixed in 05-07).
* **Edge-change ⇒ staging deploy-smoke** — offline `--no-check` does not exercise runtime; any ENV-05 guard addition (D-08) needs a real deploy-smoke.

### Integration Points

* **The 4 secret/config surfaces** (Supabase prod, Supabase preview/test, GitHub Actions, Vercel) — the ENV-04 reconciliation matrix (D-06); only the repo side is ours to edit, the live sides are operator-listed.
* **`.gitignore` whitelist** ↔ the re-created templates (D-01) — they must agree (`git check-ignore .env.example` must return empty/tracked, as 260609-nks verified).
* **`supabase/functions/_shared/*`** (cors.ts, anthropic.ts, price/shop resolvers, OCR clients) — the ENV-05 audit surface + the never-remove landmine sites.
* **Canonical prod ref `zjpjapgraoxdukdvpjes`; preview/test ref `cimjltzovkahkqecpwgi`** — operator-confirmed (Phase 4); Phase 8 still owes a formal re-confirmation, so treat as authoritative-but-flagged.

</code_context>

<specifics>
## Specific Ideas

* The central tension the operator resolved: ENV-03 mandates `.env.example`, but someone *deliberately removed* it a week ago (`0d5b1eff`) leaving the `.gitignore` whitelist dangling. The operator chose to **re-create (templates + docs)**, treating the removal as something Phase 7 reverses with a *complete, canonical* version — not as a standing "docs-only" decision.
* The operator deliberately chose the **most thorough** ENV-04 option (full cross-surface audit across all 4 secret surfaces), but paired it with the **most conservative** remediation (document + operator fix list, no store mutation by us) — thoroughness in *evidence*, conservatism in *action*, both inside zero-functional-change.
* "Removing an env var" under zero-functional-change is mostly a code-and-docs + operator-list operation, because the live secret stores are not ours to write (prod read-only; preview-mutation risks E2E). Real removable code-dead surface this phase = `OLLAMA_*` (post-Phase-4).
* ENV-05 is "confirm + surgical add," not a refactor: the bar for adding a guard is "a critical secret currently fails open," and even then it's a narrow, deploy-smoked, behavior-preserving safety add.

</specifics>

<deferred>
## Deferred Ideas

* **Central required-env assertion helper** (`assertRequiredEnv()` / `getRequiredEnv()` in `_shared`, wired into all 27+ live functions for startup fail-closed) — rejected for this phase on blast-radius grounds (per-function deploy-smoke, conflicts with zero-functional-change). A genuine maintainability candidate for a later phase (Phase 9-adjacent); record in RESIDUAL-REGISTER if a real gap motivates it.
* **Automated env-docs drift-check** (`scripts/audit/check-env-docs.mjs` / `npm run audit:env`, off-gate or CI-blocking) — rejected in favor of a documented re-runnable command (D-03); revisit only if doc-drift recurs (the `.env.example`-removal class of failure).
* **Aggressive removal / writable-preview-store cleanup by us** — rejected (D-04/D-05/D-07); all live-store changes stay operator-confirmed.

None of the above is scope creep — discussion stayed within Phase 7's env-audit boundary; the deferrals are scoping decisions about *how far* the changes go under zero-functional-change, not new capabilities. (Phase 7.1 runtime-reliability scope is a separate INSERTED phase, intentionally untouched here.)

</deferred>

---

*Phase: 7-environment-variable-audit-organization*
*Context gathered: 2026-06-20*

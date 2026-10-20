# Phase 2: Security Audit & Remediation - Research

**Researched:** 2026-07-01
**Domain:** Retroactive full-surface security audit + evidenced remediation of a live Supabase (Deno edge + Postgres/RLS/Auth) + React/Vite + Anthropic system that v4.0 already hardened. Audit methodology, per-domain current-state findings, three targeted architectural-seam fixes, a severity rubric, and automated-guard patterns registered into `verify:baseline`.
**Confidence:** HIGH for code-grounded findings (verified against current HEAD source, migrations, and the v4.0 audit catalog); MEDIUM for the live-store / advisor current-state (documented in the v4.0 audit but requires a fresh operator-run read-only re-pull per D-04); HIGH for the SEC-01..10 enumeration (located in the v1.0 archive).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

> **CRITICAL for the planner: these are copied verbatim from `02-CONTEXT.md`. Honor them exactly. The operator deliberately chose the MAXIMAL-thoroughness option on every gray area — "leave nothing deferred, remediate now, re-audit everything, guard everything" is the governing intent on any scope judgment call.**

### Locked Decisions

**Locked by roadmap / success criteria (carried in, not re-debated):**
- Every deferred `SEC-01..10` obligation gets a recorded disposition (SEC-11).
- All 17 domains audited + documented (SEC-12).
- No unresolved **critical or high** finding at phase completion — each remediated with evidence the vulnerable behavior is no longer possible (SEC-13).
- A regression test exists per remediated high-risk finding, folded into `verify:baseline`; remediations preserve legitimate user behavior and do NOT weaken v4.0 DB/auth/deployment protections (SEC-14).
- Final security record produced (SEC-15).
- **Preview→prod hard gate** — Claude read-only on prod (`zjpjapgraoxdukdvpjes`); operator applies every prod migration; **pause for operator checkpoint on any RLS/DB-function change**. Test on preview `cimjltzovkahkqecpwgi` first.
- **No new infrastructure**; root-cause fixes only; audit tooling is dev-only.
- **Cross-origin domain already remediated in Phase 1** (CORS-01..06). Phase 2 **verifies** this domain against the 17-domain checklist — it does not re-implement it.
- Recording mechanism = the established v4.0 **RESIDUAL-REGISTER + KEEP-LIST** discipline.

**D-01 — Remediation threshold: Fix critical + high + MEDIUM in-phase.** Remediate every confirmed critical, high, AND medium finding in-phase. Only **low** severity becomes tracked/accepted residual (logged with justification in the security record / residual register).

**D-02 — Cross-phase finding ownership: Remediate here, don't hand off.** When the audit confirms a finding, Phase 2 remediates it itself rather than deferring to a later phase — even when a later phase will also touch that area.

**D-03 — Boundary (the one exception's mechanics):** For the 3 known findings that are large architectural rewrites owned by later phases, Phase 2 applies a targeted, self-contained security fix now, and the owning phase keeps its full rewrite scope on top:
- **Merit non-idempotency** (`withMerits` calls the deduct RPC without an idempotency key; `_shared/merit-gateway.ts` ~L201) → Phase 2 **forwards the idempotency key through `withMerits` to the existing 4-arg `check_and_deduct_merits`** + a guard/test. Phase 3 (LIFE-05) still delivers the full lifecycle spine.
- **Refund-after-save** in `grade-linkedin` (`storeAndNotify()` saves+emails, then a post-save usage-write failure throws `MeritRefundable` → refunds an already-saved analysis, ~L554-559) → Phase 2 makes the **post-save steps log-and-continue (never throw `MeritRefundable`)**. Phase 3/4 still own the broader lifecycle/LinkedIn work.
- **Paddle webhook auth/replay** → Phase 2 **hardens + verifies webhook signature auth + replay protection** now. Phase 8 still owns removal-behind-the-expiration-gate.

**D-04 — v4.0 residual inheritance: Full re-audit of all residuals from scratch.** Do NOT assume any v4.0 residual is closed. Re-open and re-examine ALL of them:
- The v4.0 **env-audit operator fix-list** (10 items — e.g. `AI_TEST_MODE` misplaced on prod Supabase; the Supabase→Vercel integration-injected privileged-secret cluster in the frontend host [NOT browser-exposed since Vite bundles only `VITE_*`, but re-verify]; orphaned `GOOGLE_GEMINI_API_KEY` / `AI_PROVIDER`; missing `VITE_FEATURE_INTERVIEW_PREP` on Vercel-preview) — re-verify current live state and disposition each.
- The **20-package dev-only `promptfoo` vuln residue** (`RESIDUAL-REGISTER.md` DEP-04) — re-examine rather than re-affirm (confirm still dev-only / off-gate / zero prod-runtime exposure).
- The **15 intentional DB advisors** (11 gated RPCs + 2 service-role policies + 2 operator Auth/storage) — re-examine each rather than accept as-settled.
- *Note:* live env/isolation truth requires **operator-run, names-only** cross-surface inspection. Claude never reads/prints secret values (CLAUDE.md rule 7). Reconcile against `docs/ENVIRONMENT.md` + `.planning/audit/ENV-SEPARATION.md`.

**D-05 — Evidence bar: Automated guard for EVERY high-risk finding.** Every high-risk remediation gets an automated guard folded into `verify:baseline` — including findings where a classic unit test is awkward (env/secret isolation, prod config, infra advisories), which get a **config-drift / assertion test** in the style of `cors-audit.test.ts`, not merely a documented verification record. Evidence pattern per finding: a guard that **fails on the vulnerable behavior and passes after the fix**. Where a live-only fact can't be unit-asserted, still add the closest automated guard AND attach a reproducible operator-verification record (command + before/after). Live prod inspection stays read-only; operator applies any prod change.

### Claude's Discretion
- Exact per-domain audit methodology + tooling mix (Supabase advisors, `npm audit`, static grep patterns, per-domain subagents, manual review) — provided all 17 domains are covered and every finding is severity-classified.
- Whether to structure the phase as (1) SEC-01..10 location+disposition, (2) 17-domain sweep + severity classification, (3) remediation + per-finding guard, (4) final security record — or a finer split. (The ROADMAP's 4-plan sketch is a starting point, not binding.)
- The precise form of each config-drift/assertion guard (follows the `cors-audit.test.ts` precedent where a runtime test is impractical).
- Determining the authoritative set of "active" Edge Functions + frontend surfaces to audit.
- Severity rubric (what counts as critical vs high vs medium vs low) — apply a standard impact×exploitability model and state it in the security record.

### Deferred Ideas (OUT OF SCOPE)
- **Full lifecycle/idempotency architecture** (LIFE-01..09) → **Phase 3**. Phase 2 does the targeted Merit-key-forwarding fix only, not the state machine.
- **LinkedIn deterministic scoring + broader grade-linkedin rework** (FEAT-03/04, VER-03) → **Phase 4**. Phase 2 does the refund-after-save log-not-throw fix only.
- **Paddle removal** (PADL-01..04) → **Phase 8** behind the verified expiration gate. Phase 2 hardens the webhook auth/replay only; it does not remove Paddle.
- **Low-severity findings** — logged to the residual register with justification (per D-01), addressed later or accepted.
- **Framework-major dependency upgrades** (React 18→19, Tailwind 3→4, zod 3→4, TS 5→6, react-router 6→7) — v4.0-deferred migration-grade work, explicitly out of v5.0 scope; the supply-chain domain audits current pins, it does not perform these majors.
</user_constraints>

---

## Summary

Phase 2 is an **audit-and-remediate** phase, not a build phase, on a codebase that v4.0 already hardened extensively. The single most important framing for the planner: **most of the 17 domains are already substantially remediated by v4.0 and Phase 1** — the phase's real work is (a) *locating + dispositioning* the deferred v1.0 SEC-01..10 (now found: see below), (b) a *fresh full-surface re-audit* that re-confirms the v4.0 residuals rather than trusting the (v3.0-dated, stale-line-number) catalog, and (c) three *targeted architectural-seam fixes* that v4.0 explicitly left byte-identical. The maximal-thoroughness operator stance (D-01..D-05) means the phase is larger than the 4-plan sketch: budget for a domain-clustered sweep and multiple operator checkpoints.

The **SEC-01..10 enumeration is definitively located** in `.planning/_archive/v2.0-credit-system/REQUIREMENTS.md:106` and the archived v2.0 ROADMAP Phase 09: they are `edge-function auth audit, secrets leakage, SQL injection, XSS, CORS, RLS, prompt sanitizer, hardcoded secrets, SECURITY DEFINER search_path, Deno stdlib standardization`. The v1.0 Phase 9 that would have delivered them was never planned/built (orphaned per `v1.0-MILESTONE-AUDIT.md`), so there are no per-ID acceptance criteria — SEC-11 becomes a mapping-and-disposition exercise: map each of the 10 topics onto the current 17-domain audit and record `remediated / re-scoped / accepted-with-justification`. Most of the 10 are already substantially closed by v4.0/Phase 1 work (SEC-05 CORS = Phase 1; SEC-06 RLS + SEC-09 search_path = v4.0 Phase 8; SEC-02/08 secrets = v4.0 Phase 7/ENV-04; SEC-10 Deno stdlib = a documented DEP-05 residual).

The **three targeted fixes are confirmed at current HEAD** (the CONCERNS.md line numbers were stale; re-confirmed here): (1) `merit-gateway.ts:201-205` calls the (now sole) 4-arg `check_and_deduct_merits` but passes only 3 named args, so `p_idempotency_key` defaults NULL and every prod deduction is non-idempotent; (2) `grade-linkedin/index.ts:556-559` (merit path) and `:519-522` (free path) throw `MeritRefundable` on a post-save usage-write failure — a refund/500 after the result is durably saved+emailed; (3) `paddle-webhook/index.ts` correctly verifies the HMAC signature and dedups by `event_id`, but performs **no timestamp-freshness / replay-window** check on the parsed `ts` and leaks config state via a 500 body when the secret is unset (the secret is currently unset on prod → the endpoint fail-closes today).

**Primary recommendation:** Structure the phase as ~5-6 plans (SEC-01..10 disposition + rubric + scaffold → a domain-clustered re-audit split into code / DB / env-supply-chain → targeted-fix remediation with per-finding guards, money-path and RLS changes behind `autonomous:false` operator checkpoints → final SEC-15 security record). Reuse the v4.0 `.planning/audit/` catalog discipline (a durable `SECURITY-AUDIT.md` + RESIDUAL-REGISTER + KEEP-LIST). Model every "can't-run-at-runtime" guard on the `cors-audit.test.ts` static-source-assertion precedent and register it in `supabase/functions/deno.json` `test:ci` (which enters `verify:baseline` via `npm run test:edge`).

---

## SEC-11: The Deferred SEC-01..10 — Located + Disposition Map

**This is the SEC-11 deliverable's factual core.** The IDs are real and were located; the descriptions are terse (single-phrase) because the owning v1.0 Phase 9 was never built.

**Authoritative source (located):**
- `.planning/_archive/v2.0-credit-system/REQUIREMENTS.md:106` — the one-line enumeration (below), tagged `SEC-FUTURE-01..10`.
- `.planning/_archive/v2.0-credit-system/ROADMAP.md:95-99` — "Phase 09: Security Audit … auth boundaries, secret handling, SQLi/XSS, CORS, RLS, prompt sanitizer coverage, `search_path`, Deno stdlib standardization."
- `.planning/_archive/v2.0-credit-system/v1.0-MILESTONE-AUDIT.md:188-257` — all 10 IDs recorded `status: orphaned, phase: Phase 9 (not created)`. SEC-07's evidence note is the only extra detail: "interview-prep-coach and grade-linkedin still lack prompt-sanitizer (WR-02 tech debt)."
- `.planning/_archive/v2.0-credit-system/PROJECT.md:148` + `v2.0-REQUIREMENTS.md:~237` — the deferral is recorded ("Security audit … next milestone").

> **Naming-collision warning for the planner:** there is a DIFFERENT "SEC-06" throughout the v2.0 phase docs (`10-*`, `12-*`, `07-*`) that means "the Paddle `USING(true)` RLS anti-pattern" — that is a v2.0 *phase decision-ID*, NOT the v1.0 milestone requirement SEC-06 (RLS). Do not conflate. The v1.0 SEC-01..10 are ONLY the 10-item list below.

**Recommended disposition map (HIGH confidence on the mapping; each disposition is CONFIRM-then-record in Phase 2):**

| v1.0 ID | Topic (verbatim from archive) | Maps to 17-domain | Current state (v4.0/Phase 1) | Recommended SEC-11 disposition |
|---------|-------------------------------|-------------------|------------------------------|--------------------------------|
| SEC-01 | edge function auth audit | auth/session + authz | `_shared/auth.ts` `requireAuth`/`requireInternalOrUserAuth`, `timingSafeEqual` internal secret, admin-elevation chokepoint; 3 auth-swallow sites fixed in v4.0 Ph7.1 | **remediated** (re-verify the auth-type coverage across all ~21 active fns + the R-04 inside-`serve`-arrow guard) |
| SEC-02 | secrets leakage | sensitive-data exposure + secret/env handling | reason-code-not-value logging (RUN-03 allow/deny list); ENV-04 remediated the Vercel privileged-secret cluster | **remediated** (re-audit under D-04 env re-pull + a log-leak grep) |
| SEC-03 | SQL injection | input validation | No raw SQL from user input — all DB access is PostgREST `.from()`/`.rpc()` or `SECURITY DEFINER` RPCs with pinned `search_path` | **accepted-with-justification / remediated** (parameterized-by-construction; confirm no string-built SQL) |
| SEC-04 | XSS | input validation / output encoding | React auto-escapes; only ONE `dangerouslySetInnerHTML` in `src` (`src/components/ui/chart.tsx:70`, shadcn CSS-var injection — not user text) | **remediated** (confirm the one sink uses no user-controlled data) |
| SEC-05 | CORS | cross-origin handling | **Fully remediated in Phase 1** (`withCors`/`jsonError`, `ALLOWED_ORIGINS` allowlist, `Vary: Origin`, `cors-audit.test.ts`) | **remediated (by Phase 1)** — Phase 2 VERIFIES only |
| SEC-06 | RLS | RLS enforcement | v4.0 Ph8 dropped `linkedin_grades` "Anyone can view", explicit-deny on service-role tables, security_invoker views; 2 `rls_policy_always_true` retained by-design | **remediated** (re-audit; re-examine the 2 intentional always-true policies) |
| SEC-07 | prompt sanitizer | AI prompt/provider-response exposure | **PARTIAL** — only `grade-linkedin`, `recruiting-lens`, `interview-prep-analyze` call the sanitizer; `analyze-resume`, `analyze-career`, `analyze-skills-gap`, `compare-jobs`, `chat-agent` do NOT (see Domain 14) | **needs decision** — classify the coverage gap; remediate MEDIUM+ per D-01 |
| SEC-08 | hardcoded secrets | secret/env handling | Per-function fail-closed `Deno.env.get` guards; no committed secrets (REPO-05 names-not-values discipline); one hardcoded ADMIN_EMAIL default (non-secret) and hardcoded Paddle price-IDs (non-secret) | **remediated** (confirm via secret-pattern grep over `src` + `supabase/functions`) |
| SEC-09 | SECURITY DEFINER search_path | DB function permissions | v4.0 Ph8 pinned `ts_to_utc_date` + `increment_rate_limit`; `function_search_path_mutable` cleared DB-wide (1→0) | **remediated** (re-audit via advisor re-pull; confirm all DEFINER fns pinned) |
| SEC-10 | Deno stdlib standardization | dependency/supply-chain | **OPEN as documented residual** — `std@0.168.0 ×27` / `0.190.0 ×4` / `0.224.0 ×2` co-exist; zod import-style split; DEP-05 edge consolidation DEFERRED (RESIDUAL-REGISTER) | **re-scoped / accepted-with-justification** (currency/maintainability, not a vuln; deferred edge-consolidation task; audit pins, do not perform the consolidation — matches D-04 supply-chain scope) |

**SEC-11 action for the planner:** produce a table exactly like this in the security record, but with each disposition CONFIRMED by the Phase-2 re-audit (not just inherited from this research). SEC-07 and SEC-10 are the two that need an explicit decision rather than a clean "remediated."

---

## What Is Already Done vs. What Remains (read this before scoping)

The maximal-thoroughness stance does NOT mean re-doing settled work — it means *re-confirming* it (D-04). This table prevents double-remediation and wasted effort.

| Area | Status entering Phase 2 | Phase-2 action |
|------|-------------------------|----------------|
| Cross-origin (CORS-01..06) | **DONE** (Phase 1): `withCors`/`jsonError`/`ALLOWED_ORIGINS`/`Vary`/`cors-audit.test.ts` | VERIFY against the 17-domain checklist; do not re-implement |
| 401-without-CORS swallow | **DONE** (Phase 1): `auth.ts:55-59` `unauthorizedResponse` now carries origin-aware CORS | Verify (part of auth domain) |
| Auth re-throw swallow (3 sites) | **DONE** (v4.0 Ph7.1): interview-prep-analyze, recruiting-lens, compare-jobs return the 401 | Re-verify; investigate the deferred R-04 `analyze-skills-gap` inside-`serve`-arrow guard |
| DB security advisors | **Reduced to a 15-item intentional floor** (v4.0 Ph8/Ph9): security_definer_view→0, rls_enabled_no_policy→0, anon EXECUTE→0, search_path→0, `linkedin_grades` over-permissive DROPPED, auth_rls_initplan perf 62→0 | Re-pull read-only advisors; re-examine each of the 15 residuals (D-04); confirm floor not weakened |
| Env / prod-vs-preview isolation | **AUDITED + REMEDIATED** (v4.0 ENV-04, 2026-06-23): AI_TEST_MODE unset from prod, Vercel pruned to 4 `VITE_*`, orphans unset, PADDLE_WEBHOOK_SECRET unset from prod | Operator-run names-only cross-surface RE-PULL (D-04); reconcile the 10-item fix-list current state |
| Dependency vulns | **20-pkg dev-only promptfoo residue**, off-gate, zero prod-runtime exposure (DEP-04) | RE-EXAMINE (D-04): confirm still dev-only/off-gate; `react-router-dom` prod advisory taken as in-6.x `6.30.4` patch |
| Merit idempotency (billing integrity) | **NOT fixed** — `withMerits` still forwards no key; v4.0 Ph7.1 operator elected "merit-gateway byte-identical (D-03 bar not elected)" | **TARGETED FIX** (D-03a) + guard |
| Refund-after-save (billing integrity) | **NOT fixed** — `grade-linkedin` still throws `MeritRefundable` post-save | **TARGETED FIX** (D-03b) + guard |
| Paddle webhook replay | **NOT fixed** — no timestamp-freshness window; 500 leaks config state | **TARGETED FIX** (D-03c) + guard |
| Prompt-sanitizer coverage | **PARTIAL** — 5 of 8 AI text-ingesters uncovered | Classify + remediate MEDIUM+ (SEC-07) |

---

## Standard "Stack" — The Audit Toolchain

This phase adds no product libraries; the "stack" is the audit tooling. All are already in the repo or npx-driven (zero new devDeps, honoring "no new infrastructure").

### Core audit tools
| Tool | Command | Purpose | Trust |
|------|---------|---------|-------|
| Supabase advisors (read-only MCP `supabase-prod-readonly`) | `get_advisors(type="security")` / `get_advisors(type="performance")` on prod `zjpjapgraoxdukdvpjes` | RLS / DEFINER-EXECUTE / search_path / policy / storage findings, live | HIGH (live prod truth; read-only) |
| Supabase read-only introspection | `.planning/audit/queries/db-introspection.sql` (operator-run) + `list_tables`/`get_logs` | `pg_policies` / `pg_proc` / grants / table shape | HIGH (operator-gated, zero writes) |
| `npm audit` / `npm outdated` | `npm run audit:deps` (`scripts/audit/run-deps.mjs`) | frontend supply-chain vuln + currency inventory | HIGH |
| `knip` | `npm run audit:deadcode` | dead-code / unused-dep signal (KEEP-LIST-gated) | MEDIUM (needs KEEP-LIST gate) |
| `deno test` (offline allowlist) | `npm run test:edge` → `deno task test:ci` | the guard-registration surface; also drives handler-level security tests | HIGH |
| Static source grep (`rg` / Grep tool) | pattern sweeps over `src/**` + `supabase/functions/**` | prompt-sanitizer coverage, hardcoded-ACAO, `dangerouslySetInnerHTML`, secret patterns, `MeritRefundable` post-save, `Deno.env.get` fail-closed | HIGH (deterministic, re-runnable) |
| Operator names-only surface listing | `supabase secrets list` / `gh secret list` / `vercel env ls` | env separation / secret placement (D-04) | HIGH (operator-run, names only) |
| `promptfoo` (`test:adversarial:*`) | scheduled/label, **OFF the gate** | real-AI prompt-injection resistance for resume/career/linkedin/recruiting | MEDIUM (real Anthropic; not a guard) |

### Reusable assets (do not rebuild)
| Asset | Location | Reuse for |
|-------|----------|-----------|
| `.planning/audit/` catalog discipline | INDEX / DATABASE / DEPENDENCIES / ENV-SEPARATION / RESIDUAL-REGISTER / KEEP-LIST / RUNTIME-RELIABILITY | The D-04 re-audit STARTS from these (re-examine, not re-derive from zero) |
| `cors-audit.test.ts` | `supabase/functions/_shared/cors-audit.test.ts` | The static-source-assertion **template** for every D-05 config-drift guard |
| `_shared/` security layer | `auth.ts`, `cors.ts`, `rate-limiter.ts`, `prompt-sanitizer.ts`, `usage-checker.ts`, `merit-gateway.ts`, `logger.ts` | The canonical enforcement points; remediate these, not per-endpoint copies |
| RESIDUAL-REGISTER + KEEP-LIST | `.planning/audit/` | Append-only recording of accepted residual / gated-never-safe items |
| `verify:baseline` gate | `package.json` + `supabase/functions/deno.json` `test:ci` + `.github/workflows/regression-gate.yml` + `scripts/deploy.ps1` | Where every new guard registers (SEC-14) |

### Do NOT add
External SAST platforms, new CI infra, a `_shared/errors.ts` shared taxonomy module (v4.0 removed it; RUN-03 uses per-function inline `const ERR`), any new devDependency for auditing (knip/npm-audit are npx-driven), zod 4 / framework majors.

---

## The Three Targeted Fixes — Exact Seams (re-confirmed at current HEAD)

> The CONCERNS.md line numbers were v3.0-dated and stale. These are re-confirmed against current source. Each fix must be designed to be **subsumed by** its owning phase (Ph3/4/8) — no change the later phase must rip out.

### Fix 1 — Merit idempotency key forwarding (D-03a). Domain: Merit+billing integrity.

**Current state (verified):**
- The legacy 3-arg `check_and_deduct_merits(uuid,text,text)` was **DROPPED** by `20260520000000_drop_legacy_check_and_deduct_merits_3arg.sql` (a hotfix for a PostgREST overload-ambiguity 500). The **only surviving overload is the 4-arg** `check_and_deduct_merits(uuid,text,text,text DEFAULT NULL)` from `20260512000003_merit_transactions_idempotency.sql`, which has the idempotency pre-check + partial-unique index (`WHERE source='feature-deduct' AND idempotency_key IS NOT NULL`).
- `_shared/merit-gateway.ts:201-205` calls it with **three** named args only:
  ```ts
  const { data, error } = await supabase.rpc('check_and_deduct_merits', {
    p_user_id: ctx.userId, p_feature: feature, p_tier: ctx.tier,
  });
  ```
  So `p_idempotency_key` is always NULL → the partial-unique index never engages → **every production deduction is non-idempotent** (double-click / two tabs / refresh-resubmit each deduct independently). This is the CONFIRMED live billing-integrity defect; it survived v4.0 (Ph7.1 operator explicitly left `merit-gateway.ts` byte-identical: "D-03 bar not elected").

**Targeted fix (gateway plumbing only — subsumed by Phase 3):**
- Add an optional idempotency key to the gateway (e.g. a field on `MeritGatewayContext` or `MeritGatewayOptions`) and forward it as `p_idempotency_key` in the RPC call.
- Handle the already-deducted response shape: the 4-arg RPC returns `{ success:true, transaction_id, already_deducted:true }` (no `deducted_from`/`remaining_balance`). The gateway's post-success log (`merit-gateway.ts:227-234`) reads `deducted_from`/`remaining_balance` — make those reads null-safe for the `already_deducted` branch.
- **Scope boundary:** Phase 2 wires the gateway *capability* + proves it with a guard driving `withMerits` directly with a repeated key. Per-feature key *derivation* (stable input-identity key) + frontend threading + the full lifecycle is Phase 3 (LIFE-05, plan 03-02). The Phase-2 seam must be exactly the one Phase 3 builds on — coordinate the signature so 03-02 does not rip it out. **Design note / open question:** decide whether Phase 2 also threads a request-supplied key from ≥1 feature, or ships gateway-capability + test only. Recommendation: gateway-capability + a direct-`withMerits` guard (minimal, SEC-scoped, cleanly subsumed).
- **Money path → `autonomous:false` operator checkpoint** (matches the v4.0 Ph7.1 precedent).

**Guard:** a deno test extending `_shared/merit-idempotency.test.ts` that drives the full `withMerits` path (not just the raw RPC) with a repeated key and asserts exactly ONE deduction end-to-end. Register in `deno.json` `test:ci`.

### Fix 2 — grade-linkedin refund-after-save (D-03b). Domain: Merit+billing integrity.

**Current state (verified at `grade-linkedin/index.ts`):**
- `storeAndNotify()` (L446) inserts `linkedin_grades`, calls `persistLinkedInAnalysis()`, fires the extract webhook + email, and returns the success `response`. Its own save-failure throw at **L459-462** (`throw new MeritRefundable(500, 'Could not save LinkedIn grade history.')`) is a *legitimate pre-save* refund — **leave it**.
- **Merit path (L554-559):** after `storeAndNotify()` succeeds, `recordUsageWithAnalysis(userId,'linkedin_grading',1,stored.recordId)`; on `!usageResult.ok` it `throw new MeritRefundable(500, 'Could not record LinkedIn grade usage.')`. This throw is INSIDE the `withMerits` callback → **refunds a Merit for an already-saved, already-emailed analysis** (double-benefit + success-reported-as-500). The comment two lines up literally says "Non-blocking — a failed insert logs but does NOT fail the user request" while the code throws.
- **Free path (L519-522):** same shape (`storeAndNotify` → `recordUsageWithAnalysis(...,0,...)` → throw). Free path is NOT inside `withMerits` (no deduction), so no refund — but it still reports a saved+emailed analysis as a 500 (hidden success) and can burn the free-scan flag path.

**Targeted fix (log-and-continue, both sites — subsumed by Phase 3/4):**
- At L556-559 and L519-522, replace `throw new MeritRefundable(...)` with a `log.warn/error(...)` and **continue to return `stored.response`** (the durable result already exists). This makes `saving → completed` the point of no return for the post-save usage-ledger write, exactly what Phase 3's lifecycle formalizes.
- Do NOT touch the pre-save throw at L459-462.
- **Money path → `autonomous:false` operator checkpoint.**

**Guard:** a deno test (extend `grade-linkedin/*.test.ts`) stubbing the post-save `record_ai_usage` to fail and asserting (a) the handler returns 200 with the saved body, (b) NO `refund_merits` RPC fires, (c) the `linkedin_grades` row persists. Register in `deno.json` `test:ci`. (Note the shared-process test-isolation fragility recorded in RUNTIME-RELIABILITY.md — prefer a handler-config static assertion or a carefully-isolated runtime test.)

### Fix 3 — Paddle webhook auth + replay hardening (D-03c). Domain: webhook auth+replay.

**Current state (verified at `paddle-webhook/index.ts`):**
- Signature auth is CORRECT: HMAC-SHA256 over `${ts}:${payload}`, compared with `timingSafeEqual` (L12-59, L128-139). Length-guarded. Good.
- Idempotency is present: `paddle_webhook_events` `event_id` dedup (L151-171). Because `event_id` is inside the signed body, this already blocks replay of a *captured identical event*.
- **GAP (the fix):** the timestamp `ts` is parsed (L23) but **never validated for freshness** — there is no replay-window check bounding how old a signed payload may be. Add a freshness window (reject if `|now - ts|` exceeds a bound, e.g. 5 minutes — the Paddle-recommended pattern), keeping the `event_id` idempotency.
- **Secondary finding (sensitive-data/error-message):** when `PADDLE_WEBHOOK_SECRET` is unset the handler returns a **500 with body** `"PADDLE_WEBHOOK_SECRET environment variable is not set"` (L105-114) — leaks config state. The secret is **currently UNSET on prod** (ENV-04 remediation, 2026-06-23), so the endpoint fail-closes today; make the missing-secret/invalid path return a non-leaky generic error and confirm the fail-closed direction is intended while in-flight Paddle subs may still exist (Phase 8 owns the expiration gate + removal).

**Targeted fix (harden in place — subsumed by Phase 8):** add the timestamp replay-window check; make the missing-secret and invalid-signature responses non-leaky and consistent (generic body, no config disclosure). Do NOT remove Paddle. `type:'webhook'` correctly returns `{}` CORS — keep.

**Guard:** a deno test driving the handler with (a) a valid-signature-but-stale-`ts` payload → rejected, (b) a fresh valid payload → accepted, (c) missing secret → non-leaky error (no env-name in body). This is runtime-testable (pure HMAC + timestamp logic). Register in `deno.json` `test:ci`.

---

## The 17-Domain Audit Methodology + Current-State Findings

Per-domain: the technique that finds issues, plus what can already be confirmed from source + the v4.0 catalog. **All "confirmed" findings are CONFIRM-then-classify in Phase 2** (the catalog is v3.0/v4.0-dated).

| # | Domain | Primary technique | Current-state finding (confirm in-phase) | Likely severity |
|---|--------|-------------------|-------------------------------------------|-----------------|
| 1 | Auth / session | Read `_shared/auth.ts` + grep `requireAuth`/`requireInternalOrUserAuth` across all fns; deno auth tests | Centralized; `timingSafeEqual` internal secret; admin-elevation chokepoint; 3 swallow sites fixed (Ph7.1). R-04 `analyze-skills-gap` inside-`serve`-arrow guard unconfirmed | LOW-MED (R-04) |
| 2 | Authz / access control | grep `.rpc(`/`.from(` call-sites vs tier gates; confirm every AI fn gates before Anthropic | tier-gating via `usage-checker`/`withMerits`; admin via `has_role`; partial `can_perform_ai_action` FE migration (2 call-sites remain) | LOW-MED |
| 3 | RLS enforcement | `get_advisors(security)` re-pull + `pg_policies` read; SELECT-as-role on preview | v4.0 Ph8 dropped `linkedin_grades` "Anyone can view"; 2 `rls_policy_always_true` (paddle_webhook_events, scheduled_emails) retained by-design | LOW (re-confirm floor) |
| 4 | User + resource ownership | grep FE reads (`.eq('user_id',...)`) + RLS owner-scoping; SELECT-as-role | owner-scoped after Ph8; FE reads all owner-scoped | LOW |
| 5 | Cross-origin handling | **VERIFY ONLY** — `cors-audit.test.ts` + Phase 1 evidence | Fully remediated (Phase 1) | N/A (verify) |
| 6 | Input validation / output encoding | grep zod usage + length caps (`getMaxInputChars`) + PDF/text guards; check SQLi surface | `getMaxInputChars` now WIRED for analyze-resume + analyze-career (CONCERNS "not wired" is stale); confirm grade-linkedin/recruiting/skills-gap caps; no raw-SQL surface | MED (per-feature cap gaps) |
| 7 | File-upload / document-processing safety | Read `_shared/document-extraction.ts` chain; size/type caps; OCR sandboxing | parser-first chain (mistral→textract→claude_ocr); size slices; Ollama leg removed (Ph4). Confirm content-type + size caps | LOW-MED |
| 8 | Secret + env handling | Operator names-only re-pull (D-04) + per-fn `Deno.env.get` fail-closed grep | ENV-04 remediated; per-fn guards fail-closed; central `assertRequiredEnv` deferred (ENV-05) | LOW (re-confirm) |
| 9 | Sensitive-data exposure | grep for PII/secret in logs + response bodies; the RUN-03 allow/deny list | reason-code logging; Vercel privileged-cluster pruned; confirm no `error.message`/payload leaks (compare-jobs leak fixed Ph7.1) | LOW-MED |
| 10 | Logging / error-message safety | Read `logger.ts` + RUN-03 taxonomy; grep raw `console.error(err.message)` in bodies | Structured logger; secrets never logged; **paddle-webhook 500 leaks config-state (Fix 3 secondary)** | MED (paddle body leak) |
| 11 | Rate limiting / abuse | Read `rate-limiter.ts` + `merit-gateway` pooled 60/hr; confirm fail-open scope | fixed-window, fail-open on DB error (availability choice), pooled abuse limiter; confirm coverage per fn | LOW |
| 12 | Merit + billing-operation integrity | Read `merit-gateway.ts` + grade-linkedin; deno idempotency/refund tests | **Fix 1 (non-idempotent deduct) + Fix 2 (refund-after-save) — both CONFIRMED live** | **HIGH (both)** |
| 13 | Webhook auth + replay | Read `paddle-webhook` + `stripe-webhook-handler`; deno HMAC/replay tests | **Fix 3 (no replay window on Paddle)**; Stripe uses `constructEventAsync` + insert-first idempotency (correct — preserve) | MED-HIGH (Fix 3) |
| 14 | AI prompt / provider-response exposure | grep sanitizer coverage; promptfoo off-gate; confirm no raw provider payload leak | **PARTIAL sanitizer coverage: analyze-resume, analyze-career, analyze-skills-gap, compare-jobs, chat-agent lack `sanitizeMessages`/`sanitizeUserContent`** (only linkedin/recruiting/interview-prep have it) | MED (coverage gap) |
| 15 | DB function permissions | `get_advisors(security)` re-pull; `has_function_privilege` checks; `pg_proc.proconfig` | v4.0 Ph8: anon EXECUTE→0, 19/30 authenticated revoked, **11 kept (R-DB-05, load-bearing/RLS-context)**; search_path pinned | LOW (re-examine the 11) |
| 16 | Dependency / supply-chain | `npm run audit:deps` re-pull; Deno inline-import inventory | **20-pkg dev-only promptfoo residue** (off-gate, zero prod exposure); `react-router-dom` prod advisory patched in-6.x; std/zod drift (SEC-10) | LOW-MED (re-confirm dev-only) |
| 17 | Prod-vs-staging isolation | Operator names-only 4-surface re-pull (D-04) vs `docs/ENVIRONMENT.md` | ENV-04 remediated (prod=preview separation clean); **prod cron jobs 1&6 point at PREVIEW host** (DB-1-cron, needs-operator) | LOW-MED (cron-host drift) |

**Methodology recommendation:** run each domain with a **per-domain subagent or a per-domain grep+read pass**, recording every candidate into a durable `SECURITY-AUDIT.md` catalog (mirror the `.planning/audit/` INDEX+per-domain structure). Cross-reference KEEP-LIST for every "looks removable/insecure" candidate (gated-but-live is never a finding). For the 3 live-truth domains (3/8/15/17 — RLS, secrets, DB-perms, isolation), the audit is an **operator-run read-only re-pull** (advisors + names-only listings), not a Claude write.

---

## Severity Rubric (recommend for the security record — SEC-15)

A standard **impact × exploitability** matrix. State it explicitly in the record so findings classify consistently (Claude's-Discretion item).

**Impact:**
- **Critical** — full account/data compromise, secret/service-role exposure, fleet-wide financial loss, unauthenticated privileged write.
- **High** — single-user data exposure across users, privilege escalation, per-user financial incorrectness (double-charge / refund-after-save / non-idempotent deduct), auth bypass.
- **Medium** — info/config leak, defense-in-depth gap (e.g. missing prompt-sanitizer on a robustly-prompted endpoint), DoS/abuse gap, replay window.
- **Low** — hardening, currency/style, cosmetic, blast-radius reduction with no active exposure.

**Exploitability:**
- **Easy** — unauthenticated, remote, no special timing/conditions.
- **Moderate** — authenticated user, or requires a race/duplicate/refresh, or a specific input.
- **Hard** — requires operator/insider, physical, or an already-compromised secret.

**Severity = max-of-reasoning:** `Critical impact × (Easy|Moderate)` → Critical; `High impact × Easy` → Critical, `× Moderate` → High; `Medium impact × Easy` → High, `× Moderate` → Medium; `Low` → Low regardless. Per D-01, **Critical + High + Medium are remediated in-phase; only Low → tracked residual.**

**Worked classifications (recommended starting points):**
- Merit non-idempotent deduct → impact High (per-user double-charge), exploit Moderate (double-click/two-tab) → **High**.
- grade-linkedin refund-after-save → impact High (refund-on-success + hidden failure), exploit Moderate (post-save write failure) → **High**.
- Paddle no replay-window → impact Medium (replay of a stale signed event within the event-id-dedup gap is narrow), exploit Moderate → **Medium** (borderline; the secret is currently unset → fail-closed, which lowers live exploitability but the code path must be safe if the secret is ever restored).
- Prompt-sanitizer coverage gap → impact Medium (defense-in-depth; system prompts are robust + promptfoo covers resume/career), exploit Moderate → **Medium**.
- paddle-webhook 500 config-leak → impact Low-Medium, exploit Easy → **Medium**.

---

## Guard / Evidence Patterns (D-05) + verify:baseline Registration

Every high-risk remediation needs a guard that **fails on the vulnerable behavior, passes after the fix**. Three guard classes by testability:

### Class A — Runtime-exercisable (preferred)
For auth, input-validation, Merit idempotency, refund ordering, rate-limit, webhook replay: a deno test that drives the handler/gateway with malicious/duplicate/stale input and asserts the safe outcome.
- Fix 1: repeated-key `withMerits` → 1 deduction.
- Fix 2: post-save usage-write fails → 200 + saved row + no refund RPC.
- Fix 3: stale-`ts` valid signature → rejected; fresh → accepted; missing secret → non-leaky.

### Class B — Static-source assertion (the `cors-audit.test.ts` precedent)
For config-drift / coverage / no-anti-pattern findings that can't be exercised at runtime. Read `index.ts` (or a config file) as text and assert on its contents. Example targets:
- **Prompt-sanitizer coverage guard:** assert every AI text-ingesting function's source `.includes("sanitize")` (the exact analog of `cors-audit.test.ts` asserting `withCors(req, 'user'`). Length-guarded to the authoritative function set so a new AI function fails until enrolled.
- **No-hardcoded-secret / no-ACAO-literal guard:** assert no `Access-Control-Allow-Origin` literal (already exists) + no committed secret pattern in source.
- **Fail-closed env guard:** assert each critical secret's per-function `Deno.env.get(...)` is followed by a guard (or assert the fail-closed shape).

Windows path idiom from `cors-audit.test.ts` (strip the leading slash from `import.meta.url.pathname` when `[2] === ':'`) — reuse verbatim.

### Class C — Config-shape assertion + operator evidence (for live-only facts)
For RLS/DB-function/env-isolation facts that a repo-side test can't observe:
- **Repo-side:** the migration's own `DO $$ … RAISE EXCEPTION …$$` verification block (the established v4.0 pattern) asserting the policy/grant/search_path shape. See `20260512000003_*.sql` §5 and the Ph8 migrations for the idiom.
- **Live evidence:** an operator-run read-only advisor/`pg_policies`/`pg_proc` re-pull with a recorded before/after (names-not-values), attached to the security record. This is the D-05 "closest automated guard + reproducible operator-verification record" pattern.
- **Advisor-floor guard:** record the current security-advisor count as the floor; the automated part is the migration DO-block; the live part is the operator re-pull confirming the count did not increase.

### Registration into verify:baseline (SEC-14)
- **Edge/deno guards:** append the new `*.test.ts` path to the single-source-of-truth allowlist in `supabase/functions/deno.json` → the `test:ci` task → enters `verify:baseline` via `npm run test:edge`. (This is exactly how `cors-audit.test.ts` and the Ph7.1 `auth-rethrow` tests registered.)
- **Frontend guards:** a `src/**/*.test.ts` (vitest) → enters via `npm run test`.
- **`verify:baseline` = vitest + deno-offline + Playwright, fail-fast `&&`.** promptfoo/`test:adversarial*` stays OFF the gate (source-asserted negative invariant) — do NOT add it.
- **Deploy gate:** `scripts/deploy.ps1` runs `verify:baseline` as a HARD precondition before `supabase link`. New guards inherit this automatically.
- **Test-isolation caveat:** the deno suite is a single shared process; a handler-importing runtime test can perturb the stripe-webhook idempotency tests (documented in RUNTIME-RELIABILITY.md). Prefer static (Class B) or well-isolated tests for handler-level guards; a runtime test that perturbs the shared process may need to live off-gate with an in-gate static twin (the recruiting-lens precedent).

---

## Recommended Plan Structure (validate/refine the ROADMAP sketch)

The ROADMAP's 4-plan sketch (02-01 locate/disposition, 02-02 sweep+classify, 02-03 remediate+guard, 02-04 record) is a reasonable spine, but **D-01/D-04's maximal scope means 02-02 and 02-03 should each split.** Recommended ~6 plans:

- **02-01 — SEC-01..10 disposition + rubric + audit scaffold.** Confirm+record the SEC-01..10 map (above); establish the severity rubric; stand up the durable `SECURITY-AUDIT.md` catalog (INDEX + per-domain skeleton mirroring `.planning/audit/`). Small, no operator gate.
- **02-02 — Code/edge domain sweep** (domains 1,2,6,7,9,10,11,14 + verify 5). Static + deno-driven; no prod write. Produces classified findings.
- **02-03 — DB/RLS/DB-function + billing-integrity + webhook sweep** (domains 3,4,12,13,15) + re-examine the 15-advisor intentional floor (D-04). **Operator-run read-only advisor/`pg_policies`/`pg_proc` re-pull.** Produces classified findings + confirms the floor.
- **02-04 — Env / supply-chain / isolation sweep** (domains 8,16,17) + re-verify the 10-item env fix-list current state + re-examine the 20-pkg promptfoo residue (D-04). **Operator-run names-only 4-surface re-pull.**
- **02-05 — Remediation + guards.** The 3 targeted fixes (Fixes 1-3) + any other confirmed crit/high/med from 02-02/03/04, each with its guard folded into `verify:baseline`. **Money-path fixes (1,2) and any RLS/DB-function change → `autonomous:false` operator checkpoint; RLS/DB changes ride the preview→prod hard gate with rollback SQL per migration.** May itself split (code fixes vs DB fixes) if the re-audit surfaces DB-side crit/high.
- **02-06 — Final security record (SEC-15).** Scope / confirmed findings / severity+impact / remediation / verification (test refs + operator before/after) / accepted residual + justification. Confirm advisor floor not weakened; confirm `verify:baseline` green with all new guards.

**Sequencing notes:** 02-02/03/04 are independent sweeps (could parallelize as subagents, but 02-03/04 need operator read-only pulls). 02-05 depends on all three sweeps' classified findings. Honor operator checkpoints for every money-path and RLS/DB change (memory: "honor operator checkpoints over auto-mode" — do not auto-approve these even in auto-mode).

---

## Common Pitfalls

### Pitfall 1: Trusting the stale audit-catalog line numbers / "assumed-closed" state
**What goes wrong:** CONCERNS.md is v3.0-dated; DATABASE.md counts were preview-sourced then corrected; some findings (e.g. `linkedin_grades` "Anyone can view") were ALREADY remediated in v4.0 Ph8 but still appear "open" in older docs. Acting on a stale finding wastes effort or double-remediates.
**Avoid:** D-04 is explicit — re-confirm every finding against CURRENT source / a fresh read-only pull before classifying. The "What Is Already Done" table above is the reconciliation baseline.

### Pitfall 2: RLS/EXECUTE over-tightening that breaks legitimate reads (or silently re-opens a v4.0 advisor)
**What goes wrong:** Tightening a policy/grant a live client path depends on returns empty/403 with no server error (blank UI). Conversely, `CREATE OR REPLACE` on a view/function **resets** `security_invoker`/`search_path`/grants unless every attribute is re-stated — silently regressing a closed advisor.
**Avoid:** Maintain a caller map (grep `.from('<table>')` / `.rpc('<fn>')` across `src` + `supabase/functions`) before any tighten; ride the preview→prod gate with SELECT-as-role no-regression checks; re-state ALL attributes on any `CREATE OR REPLACE` and assert them in the migration DO-block; the 11 kept authenticated-EXECUTE grants (R-DB-05, incl. `can_perform_ai_action` at `Navbar.tsx:109`/`SkillsGapAnalysis.tsx:108`) are load-bearing — do NOT revoke.

### Pitfall 3: RLS `initplan`-wrap DO-block self-abort (rendering gotcha)
**What goes wrong:** Postgres re-renders `(select auth.uid())` as `( SELECT auth.uid() AS uid)`. A verification DO-block that greps for the literal `(select auth.uid())` self-aborts on the re-rendered form.
**Avoid:** verify with a case-insensitive `select\s+auth\.uid\(\)` regex, not the literal (memory: "RLS auth_rls_initplan wrap rendering gotcha"). Most `auth_rls_initplan` perf-wrapping is already done (Ph9 09-03, 62→0) — this is only relevant if a new RLS migration is authored.

### Pitfall 4: Weakening a v4.0 protection while "fixing" something
**What goes wrong:** the security-advisor 15-item floor, RLS least-privilege, EXECUTE revokes, and the preview→prod gate are v4.0 guarantees. A remediation that increases the advisor count or re-grants anon EXECUTE is a regression even if it "fixes" its target.
**Avoid:** snapshot the advisor count before/after; the 15 residuals are intentional (11 kept EXECUTE + `rls_policy_always_true` ×2 + `auth_leaked_password_protection` + `public_bucket_allows_listing`) — re-examine (D-04) but do not "fix" a by-design residual into a regression. The 2 always-true policies are service-role-by-design + a gated Paddle remnant.

### Pitfall 5: A money-path or webhook "fix" that changes a frozen wire contract
**What goes wrong:** The frontend parses `{ error:'Unauthorized' }`, `{ error:'usage_limit_reached', … }`, `{ error:'rate_limit_exceeded', … }` byte-for-byte (RUN-03 frozen contracts). A guard/remediation that alters these bodies is a wire break needing a deploy-smoke the paused-preview era couldn't provide.
**Avoid:** keep frozen bodies byte-identical; the targeted fixes only change the failure/replay BRANCH, never a parsed success contract. Money-path edits behind `autonomous:false`.

### Pitfall 6: Guard on the shared deno process perturbs sibling tests
**What goes wrong:** a handler-importing runtime test (e.g. importing `recruiting-lens/index.ts`) tips the stripe-webhook idempotency tests red in the shared `deno test` process (documented Ph7.1).
**Avoid:** prefer static (Class B) guards for handler-level assertions; if a runtime test is needed and perturbs the process, register the static twin in-gate and keep the runtime test off-gate for isolation runs (the recruiting-lens precedent).

### Pitfall 7: Secret / value leakage into a tracked audit doc
**What goes wrong:** the security record + `SECURITY-AUDIT.md` are committed. A pasted secret VALUE (key/JWT/price-ID/connection-string) is a self-inflicted finding (T-3-07).
**Avoid:** names-only discipline everywhere; run the ENV-SEPARATION.md secret-pattern grep guard over any new audit doc before commit (must return zero). Project-refs `zjpjapgraoxdukdvpjes`/`cimjltzovkahkqecpwgi` are identifiers, not secrets — acceptable.

### Pitfall 8: Editing a `.md`/`.ps1` triggers unrelated churn
**What goes wrong:** Milkdown/autosave re-serializes opened `.md` frontmatter into the working tree; a broad `git add` sweeps it in. `.ps1` scripts are pure-ASCII (Win PowerShell 5.1 cp1252) — an em-dash breaks parsing.
**Avoid:** stage specific files (never `-A`/`.`/`-f`); keep any `.ps1` guard-wiring pure-ASCII (memory). `.planning` is tracked now — commit docs normally.

---

## State of the Art / Current-State Facts (concrete, for the planner)

| Fact | Detail | Source |
|------|--------|--------|
| Canonical prod ref | `zjpjapgraoxdukdvpjes` (Claude read-only); preview/test = `cimjltzovkahkqecpwgi` (staging==test, same project), now UNPAUSED | STATE.md, ENV-SEPARATION.md, memory |
| Security-advisor floor | **15 intentional residuals** = 11 kept authenticated-EXECUTE (R-DB-05) + 2 `rls_policy_always_true` (paddle_webhook_events, scheduled_emails) + `auth_leaked_password_protection` + `public_bucket_allows_listing`. Do NOT weaken | RESIDUAL-REGISTER.md, RUNTIME-RELIABILITY.md, CONTEXT D-04 |
| Perf advisors | `auth_rls_initplan` 62→0 (Ph9 09-03, preview; prod operator-gated); 8 FK indexes added; some `unused_index`/`multiple_permissive` deferred | RESIDUAL-REGISTER.md Ph9 block |
| `linkedin_grades` "Anyone can view" | **already DROPPED** (Ph8 08-04, prod 2026-06-24) — owner-scoped SELECT remains | DATABASE.md Ph8 block, RUNTIME-RELIABILITY.md |
| Env separation | **remediated 2026-06-23** (AI_TEST_MODE/GOOGLE_GEMINI_API_KEY/AI_PROVIDER/PADDLE_WEBHOOK_SECRET unset from prod; Vercel pruned to 4 `VITE_*`) | ENV-SEPARATION.md §6 |
| `PADDLE_WEBHOOK_SECRET` | **unset on prod** → `paddle-webhook` fail-closes today (500). Confirm in-flight subs expired (Phase 8 gate) | ENV-SEPARATION.md §6, paddle-webhook/index.ts |
| Prompt-sanitizer coverage | 3/8 covered (grade-linkedin, recruiting-lens, interview-prep-analyze); resume/career/skills-gap/compare-jobs/chat-agent NOT | grep (this research) |
| XSS surface | one `dangerouslySetInnerHTML` (`src/components/ui/chart.tsx:70`, shadcn CSS-var, not user text) | grep (this research) |
| Input caps | `getMaxInputChars` WIRED for analyze-resume + analyze-career (CONCERNS "not wired" is stale) | grep (this research) |
| Dependency vulns | 20-pkg dev-only promptfoo residue, off-gate, zero prod exposure; `react-router-dom` prod advisory patched in-6.x `6.30.4` | RESIDUAL-REGISTER.md DEP-04 |
| Deno stdlib (SEC-10) | std multi-version drift + zod import-style split; edge-consolidation DEFERRED (DEP-05) | DEPENDENCIES.md, RESIDUAL-REGISTER.md |
| `verify:baseline` counts | vitest 457, deno `test:ci` 704 passed/0/11 ignored, Playwright 5+1skip | memory MEMORY.md, RUNTIME-RELIABILITY.md |
| Cron-host drift | prod cron jobs 1 (`keep-warm-ping`) + 6 (`extract_catchup_nightly`) point at PREVIEW functions host — needs-operator (isolation finding) | RESIDUAL-REGISTER.md DB-1-cron |

---

## Validation Architecture (Nyquist) — YES, this phase warrants one

A security-audit phase is validation-heavy; a VALIDATION.md should be derivable. The "did we actually make the vulnerable behavior impossible?" question is the Nyquist sampling target.

**Sampling points (each an observable, assertable checkpoint):**
1. **SEC-01..10 disposition completeness** — every one of the 10 IDs has a recorded `remediated / re-scoped / accepted-with-justification` with evidence. Assertable: the security-record table has 10 rows, none blank.
2. **17-domain coverage** — every domain has a catalog entry with ≥1 classified finding-or-clean-confirmation. Assertable: `SECURITY-AUDIT.md` has 17 domain sections.
3. **Crit/High/Med remediation** — every confirmed crit/high/med finding has (a) a fix and (b) a guard that fails-before/passes-after. Assertable: each finding row cites a guard test name that is IN the `deno.json` `test:ci` allowlist (or a vitest file).
4. **Guard-in-gate** — every high-risk guard is in `verify:baseline`; `npm run verify:baseline` is green. Assertable: grep the new test paths in `supabase/functions/deno.json`; run the gate.
5. **v4.0-floor-not-weakened** — security-advisor count did not increase; the 15 residuals still classified intentional; SELECT-as-role unchanged for legitimate reads; the 3 frozen wire contracts byte-identical. Assertable: operator read-only advisor re-pull before/after; `git diff` of the frozen-contract source.
6. **Targeted fixes proven** — Fix 1 (repeated key → 1 deduction), Fix 2 (post-save fail → 200 + no refund), Fix 3 (stale ts → rejected). Assertable: the three guard tests pass.
7. **No secret-value leakage** — the ENV-SEPARATION secret-pattern grep over every new audit doc returns zero.
8. **SEC-15 record complete** — scope / findings / severity+impact / remediation / verification / accepted residual all present, each completion claim backed by a test ref, advisor evidence, or a reproducible operator-verification command.

**Operator-verification (autonomous:false) points:** money-path fixes (1,2); any RLS/DB-function migration (preview→prod gate, rollback SQL per migration); the read-only advisor + names-only env re-pulls; the Paddle in-flight-subscription confirmation.

---

## Open Questions

1. **Merit key origin (Fix 1 scope).** Does Phase 2 thread a request-supplied idempotency key from ≥1 feature, or ship gateway-capability + a direct-`withMerits` guard only? *Recommendation:* gateway-capability + direct guard (minimal, SEC-scoped, cleanly subsumed by Phase 3 plan 03-02). Coordinate the `withMerits` signature so 03-02 extends, not replaces, it.
2. **SEC-07 prompt-sanitizer gap disposition.** analyze-resume/analyze-career/analyze-skills-gap/compare-jobs/chat-agent lack the sanitizer. resume/career/linkedin/recruiting already have OFF-GATE promptfoo adversarial suites (system prompts are robust). Is adding `sanitizeMessages` to the 5 uncovered ingesters MEDIUM (remediate per D-01) or LOW defense-in-depth (residual)? *Recommendation:* classify as MEDIUM for the high-traffic ingesters (analyze-resume, analyze-career) → add the sanitizer call + a static coverage guard; the low-traffic/internal ones (chat-agent, compare-jobs) may be LOW residual. Operator/planner decides.
3. **Paddle Fix 3 vs. the unset secret.** The secret is unset on prod (fail-closed today). Is the intended end-state (a) harden-and-keep the code path safe for if the secret is restored while subs expire, or (b) also apply a 410-shim now? *Recommendation:* (a) — harden the path (replay window + non-leaky error) without removal; leave the 410-shim + removal to Phase 8's gate. Confirm with operator whether any in-flight Paddle sub still exists.
4. **Live advisor current-state.** This research relies on the v4.0-documented advisor floor (15) + memory; the exact current count needs a fresh operator-run `get_advisors` read-only re-pull (Claude's MCP tools were not directly invocable in this research session). 02-03 must re-pull to establish the true current floor.
5. **Does the re-audit surface any NEW crit/high beyond the known set?** Unknown until the sweep runs. The known crit/high/med set is Fixes 1-3 + the SEC-07 gap + the paddle-webhook 500 leak. If a new crit/high appears (esp. DB-side), 02-05 may need to split into code-fix + DB-fix plans.

---

## Sources

### Primary (HIGH confidence — direct read at current HEAD, 2026-07-01)
- `supabase/functions/_shared/`: `merit-gateway.ts` (L201-205 the 3-named-arg RPC call; L227-234 already_deducted log-shape), `auth.ts` (L55-59 CORS-carrying 401), `cors.ts` (`withCors`/`jsonError`/`ALLOWED_ORIGINS`/`Vary`), `rate-limiter.ts`, `prompt-sanitizer.ts`, `usage-checker.ts`, `cors-audit.test.ts` (the guard template).
- `supabase/functions/grade-linkedin/index.ts` (L446 storeAndNotify, L459-462 legitimate pre-save throw, L519-522 free-path + L556-559 merit-path refund-after-save throws).
- `supabase/functions/paddle-webhook/index.ts` (HMAC+timingSafeEqual signature verify; event_id idempotency; missing replay-window; L105-114 config-leak 500).
- `supabase/migrations/20260512000003_merit_transactions_idempotency.sql` (4-arg RPC + partial-unique index), `20260520000000_drop_legacy_check_and_deduct_merits_3arg.sql` (3-arg dropped → 4-arg is sole overload).
- `supabase/functions/deno.json` (`test:ci` allowlist = guard-registration surface), `TESTING-STRATEGY.md` (the `verify:baseline` gate model).
- `.planning/_archive/v2.0-credit-system/REQUIREMENTS.md:106` + `ROADMAP.md:95-99` + `v1.0-MILESTONE-AUDIT.md:188-257` (the located SEC-01..10 enumeration + orphaned status).
- grep sweeps (this research): prompt-sanitizer coverage (3/8), `dangerouslySetInnerHTML` (1 in `chart.tsx`), `getMaxInputChars` wiring.

### Secondary (HIGH-MEDIUM — v4.0 audit catalog, treat counts as re-confirm-in-phase per D-04)
- `.planning/audit/`: DATABASE.md (advisor 73→ floor; linkedin_grades dropped; Ph8 re-pull), DEPENDENCIES.md (20-pkg promptfoo residue, std/zod drift), ENV-SEPARATION.md (10-item fix-list + §6 remediation), RESIDUAL-REGISTER.md (R-DB-04, R-DB-05, DEP-04 accepted-risk, ENV-02 un-set list, Ph9 perf block), KEEP-LIST.md (gated-never-safe classes), RUNTIME-RELIABILITY.md (advisor triage + the 3 fixed swallow sites + RUN-03 taxonomy + frozen wire contracts).
- `.planning/research/PITFALLS.md` (#1 Merit idempotency, #2 refund-after-save, #10 RLS over-tighten), `SUMMARY.md` (wired-vs-built Merit seam).
- `.planning/phases/01-cross-origin-error-contract-foundation/01-CONTEXT.md` (CORS domain remediation — verify-only).

### Tertiary (MEDIUM — requires fresh operator-run confirmation)
- Live advisor current count (needs a fresh read-only `get_advisors` re-pull in 02-03).
- Live env-store names (needs an operator-run names-only 4-surface re-pull in 02-04).

---

## Metadata

**Confidence breakdown:**
- SEC-01..10 enumeration + disposition map: **HIGH** (located in archive; mapping is well-grounded, dispositions are confirm-in-phase).
- Three targeted fix seams: **HIGH** (re-confirmed against current HEAD source + migrations).
- Per-domain current-state: **MEDIUM-HIGH** (code-grounded where grepped; DB/env/advisor facts are v4.0-documented and require a D-04 re-pull to re-confirm).
- Guard patterns + gate registration: **HIGH** (`cors-audit.test.ts` + `deno.json` + `verify:baseline` all read directly).
- Severity rubric + plan structure: **HIGH** (standard model; structure grounded in the roadmap sketch + D-01..D-05 scope).

**Research date:** 2026-07-01
**Valid until:** ~2026-07-31 for the code/migration seams (stable); ~2026-07-08 for the live advisor/env-store current-state (re-pull each Phase-2 sweep — it drifts with any DDL / secret change).

# Phase 2: Security Audit & Remediation - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove the platform is **secure by audit**. Two deliverables:

1. **Locate + disposition the deferred v1.0 `SEC-01..10` obligations** — each gets a recorded
   disposition (remediated / re-scoped / accepted-with-justification).
2. **Run a current full-surface audit across all 17 required domains** of the React SPA +
   ~21 active Edge Functions + Postgres/RLS/DB-functions: auth/session, authz/access control,
   RLS enforcement, user+resource ownership, cross-origin handling, input validation/output
   encoding, file-upload/document-processing safety, secret+env handling, sensitive-data
   exposure, logging/error-message safety, rate limiting/abuse, Merit+billing-operation
   integrity, webhook auth+replay, AI prompt/provider-response exposure, DB function
   permissions, dependency/supply-chain, prod-vs-staging isolation.

Every confirmed finding is remediated with evidence (the vulnerable behavior is demonstrably no
longer possible) + an automated regression guard folded into `verify:baseline`; a **final
security record** (SEC-15) captures scope / findings / severity+impact / remediation /
verification / accepted residual risk.

**Requirements:** SEC-11..15.

This phase clarifies **how** the audit+remediation is run and bounded. It does **not** add product
capability, and it must **not weaken any v4.0 protection** (security advisor floor of 15, RLS
least-privilege, EXECUTE revokes, preview→prod operator gate).
</domain>

<decisions>
## Implementation Decisions

### Locked by roadmap / success criteria (carried in, not re-debated)
Source: `.planning/ROADMAP.md` Phase 2, `.planning/REQUIREMENTS.md` SEC-11..15.
- Every deferred `SEC-01..10` obligation gets a recorded disposition (SEC-11).
- All 17 domains audited + documented (SEC-12).
- No unresolved **critical or high** finding at phase completion — each remediated with evidence
  the vulnerable behavior is no longer possible (SEC-13).
- A regression test exists per remediated high-risk finding, folded into `verify:baseline`;
  remediations preserve legitimate user behavior and do NOT weaken v4.0 DB/auth/deployment
  protections (SEC-14).
- Final security record produced (SEC-15).
- **Preview→prod hard gate** — Claude read-only on prod (`zjpjapgraoxdukdvpjes`); operator applies
  every prod migration; **pause for operator checkpoint on any RLS/DB-function change** (v4.0 Ph8 +
  working agreement). Test on preview `cimjltzovkahkqecpwgi` first.
- **No new infrastructure**; root-cause fixes only (no fallbacks/fabrication); audit tooling is
  dev-only. (v5.0 constraint)
- **Cross-origin domain already remediated in Phase 1** (CORS-01..06: `withCors`/`jsonError`,
  env-driven fail-closed `ALLOWED_ORIGINS` allowlist, CORS on every 4xx/5xx+preflight). Phase 2
  **verifies** this domain against the 17-domain checklist — it does not re-implement it.
- Recording mechanism = the established v4.0 **RESIDUAL-REGISTER + KEEP-LIST** discipline.

### Operator stance: MAXIMAL thoroughness, leave nothing deferred
The operator deliberately chose the most-thorough option on every gray area. Phase 2 is a
**"secure by audit, remediate-now"** phase, not a scope-minimized one. Plan for a larger phase
(more plans + more operator checkpoints) accordingly.

### 1. Remediation threshold — **Fix critical + high + MEDIUM in-phase**
- **D-01:** Remediate every confirmed **critical, high, AND medium** finding in-phase. Only **low**
  severity becomes tracked/accepted residual (logged with justification in the security record /
  residual register).
- Rationale: strongest reading of "secure by audit"; accepts a larger blast radius + slower phase
  in exchange for minimal deferred security debt. (Chosen over the recommended crit/high+cheap-medium
  scope.)

### 2. Cross-phase finding ownership — **Remediate here, don't hand off**
- **D-02:** When the audit confirms a finding, **Phase 2 remediates it itself** rather than deferring
  to a later phase — even when a later phase will also touch that area.
- **D-03 (boundary — the one exception's mechanics):** For the 3 known findings that are large
  **architectural rewrites owned by later phases**, Phase 2 applies a **targeted, self-contained
  security fix now**, and the owning phase keeps its full rewrite scope **on top** (no redundant
  rebuild, no collapsing a later phase into this one):
  - **Merit non-idempotency** (every prod deduction non-idempotent; `withMerits` calls the 3-arg
    overload, dropping the idempotency key — `_shared/merit-gateway.ts` ~L201) → Phase 2 **forwards
    the idempotency key through `withMerits` to the existing 4-arg `check_and_deduct_merits`** + a
    guard/test. Phase 3 (LIFE-05) still delivers the full lifecycle spine.
  - **Refund-after-save** in `grade-linkedin` (`storeAndNotify()` saves+emails, then a post-save
    usage-write failure throws `MeritRefundable` → refunds an already-saved analysis, ~L554-559) →
    Phase 2 makes the **post-save steps log-and-continue (never throw `MeritRefundable`)**. Phase 3/4
    still own the broader lifecycle/LinkedIn work.
  - **Paddle webhook auth/replay** → Phase 2 **hardens + verifies webhook signature auth + replay
    protection** now. Phase 8 still owns removal-behind-the-expiration-gate.
- Rationale: reconciles "remediate everything here" with roadmap coherence — no finding is deferred,
  but Phase 2 does not absorb Phase 3's entire lifecycle build.

### 3. v4.0 residual inheritance — **Full re-audit of all residuals from scratch**
- **D-04:** Do **not** assume any v4.0 residual is closed. Re-open and re-examine **all** of them:
  - The v4.0 **env-audit operator fix-list** (10 items — e.g. `AI_TEST_MODE` misplaced on prod
    Supabase; the Supabase→Vercel integration-injected privileged-secret cluster in the frontend
    host [NOT browser-exposed since Vite bundles only `VITE_*`, but re-verify]; orphaned
    `GOOGLE_GEMINI_API_KEY` / `AI_PROVIDER`; missing `VITE_FEATURE_INTERVIEW_PREP` on Vercel-preview)
    — re-verify current live state and disposition each under SEC-12's secrets & prod-vs-staging
    domains.
  - The **20-package dev-only `promptfoo` vuln residue** (`.planning/audit/RESIDUAL-REGISTER.md`
    DEP-04) — re-examine rather than re-affirm on faith (confirm still dev-only / off-gate / zero
    prod-runtime exposure).
  - The **15 intentional DB advisors** (11 gated RPCs + 2 service-role policies + 2 operator
    Auth/storage) — re-examine each rather than accept as-settled.
- Rationale: operator wants zero assumed-closed items; accepts re-litigating settled v4.0 decisions.
  (Chosen over the recommended "fold in env/isolation, re-affirm the rest".)
- **Note for the researcher:** the live env/isolation truth requires **operator-run, names-only**
  cross-surface inspection (Vercel / Supabase prod / Supabase preview-test / GitHub Actions / local)
  — Claude never reads/prints secret values (CLAUDE.md rule 7). Reconcile against
  `docs/ENVIRONMENT.md` + `.planning/audit/ENV-SEPARATION.md`.

### 4. Evidence bar — **Automated guard for EVERY high-risk finding**
- **D-05:** Every high-risk remediation gets an **automated guard** folded into `verify:baseline` —
  including findings where a classic unit test is awkward (env/secret isolation, prod config, infra
  advisories), which get a **config-drift / assertion test** (e.g. a static-source or config-shape
  assertion in the style of the existing `cors-audit.test.ts` drift guard), not merely a documented
  verification record.
- Evidence pattern per finding: a guard that **fails on the vulnerable behavior and passes after the
  fix**. Where a live-only fact can't be unit-asserted, still add the closest automated guard AND
  attach a reproducible operator-verification record (command + before/after) in the security record.
- Live prod inspection stays **read-only** (advisors / logs / schema via Supabase MCP); operator
  applies any prod change.
- Rationale: strictest evidence standard; more engineering effort per finding, accepted for maximal
  assurance. (Chosen over the recommended "test where feasible, documented repro otherwise".)

### Claude's Discretion
- Exact per-domain audit methodology + tooling mix (Supabase advisors, `npm audit`, static grep
  patterns, per-domain subagents, manual review) — provided all 17 domains are covered and every
  finding is severity-classified.
- Whether to structure the phase as: (1) SEC-01..10 location+disposition, (2) 17-domain sweep +
  severity classification, (3) remediation + per-finding guard, (4) final security record — or a
  finer split. (The ROADMAP's 4-plan sketch 02-01..02-04 is a starting point, not binding.)
- The precise form of each config-drift/assertion guard (which follows the `cors-audit.test.ts`
  static-source-assertion precedent where a runtime test is impractical).
- Determining the authoritative set of "active" Edge Functions + frontend surfaces to audit.
- Severity rubric (what counts as critical vs high vs medium vs low) — apply a standard
  impact×exploitability model and state it in the security record.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### This phase's requirements + roadmap
- `.planning/ROADMAP.md` (Phase 2 section) — goal, success criteria, plan sketch 02-01..02-04.
- `.planning/REQUIREMENTS.md` — SEC-11..15 full text + Traceability.

### Deferred SEC-01..10 origin (SEC-11 starting points — where the deferral is recorded)
- `.planning/milestones/v2.0-REQUIREMENTS.md` (~L237) — "Security audit across frontend + edge
  functions (v1.0 SEC-01..10)" listed as a deferred future requirement.
- `.planning/_archive/v2.0-credit-system/v1.0-MILESTONE-AUDIT.md` — v1.0 audit trail; likely nearest
  record of the original SEC-01..10 obligations. **The researcher must locate the authoritative
  SEC-01..10 enumeration** (they are referenced, not clearly enumerated in current docs).
- `.planning/PROJECT.md` Key Decisions — "Security audit deferred" (v2.0 rationale).

### v4.0 audit catalog (re-audit inputs — D-04 says re-examine, not trust)
- `.planning/audit/INDEX.md` — catalog index.
- `.planning/audit/DATABASE.md` — DB/RLS/function-permission inventory + the advisor 73→15 record.
- `.planning/audit/DEPENDENCIES.md` + `.planning/audit/RESIDUAL-REGISTER.md` (DEP-04 §) — the 20-pkg
  dev-only promptfoo vuln residue + deferred framework majors (dependency/supply-chain domain).
- `.planning/audit/ENV-SEPARATION.md` — prod-vs-staging isolation + the 10-item operator fix-list.
- `.planning/audit/ENV-FAILCLOSED.md` + `.planning/audit/ENV-INVENTORY.md` — secret fail-closed
  coverage matrix + live env surface.
- `.planning/audit/KEEP-LIST.md` — gating catalog (gated-but-live is never assumed safe).
- `.planning/audit/RUNTIME-RELIABILITY.md` — error-handling/auth re-throw guards (logging/error-msg
  safety domain).
- `docs/ENVIRONMENT.md` — canonical secret-free env matrix (names/consumers/surface) — the reference
  for the secrets + prod-vs-staging domains.

### Known-defect + pitfall inputs (D-02/D-03 targeted fixes)
- `.planning/research/PITFALLS.md` #1 (Merit idempotency key never forwarded), #2 (refund-after-save
  in grade-linkedin), #5 (status-window dedup ≠ idempotency) — with line cites.
- `.planning/research/SUMMARY.md` — convergent build order + the wired-vs-built Merit seam.
- `.planning/codebase/CONCERNS.md` — known-defect catalog (v3.0-dated; treat line numbers as stale,
  re-confirm against current source).
- `.planning/phases/01-cross-origin-error-contract-foundation/01-CONTEXT.md` — the cross-origin domain
  contract already shipped (Phase 2 verifies, not re-does).

### Security surface (code)
- `supabase/functions/_shared/` — `auth.ts`, `cors.ts`, `rate-limiter.ts`, `prompt-sanitizer.ts`,
  `usage-checker.ts`, `merit-gateway.ts`, `logger.ts` (+ their `.test.ts`) — the shared security layer.
- `supabase/functions/_shared/cors-audit.test.ts` — the static-source drift-guard **precedent** for
  D-05's config-drift/assertion guards.
- `TESTING-STRATEGY.md` (repo root) — the `verify:baseline` gate model (SEC-14 fold-in target).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`_shared/` security layer** (`auth.ts` requireAuth/requireInternalOrUserAuth + `unauthorizedResponse`,
  `cors.ts` `withCors`/`jsonError`, `rate-limiter.ts`, `prompt-sanitizer.ts`, `usage-checker.ts`,
  `merit-gateway.ts` `withMerits`, `logger.ts` reason-code-not-secret logging) — the audit reviews
  these as the canonical enforcement points; remediations extend them, not per-endpoint copies.
- **`cors-audit.test.ts`** static-source-assertion pattern — the template for D-05's config-drift
  guards on findings that can't be exercised at runtime.
- **v4.0 `.planning/audit/` catalog** — pre-built inventory across DB/deps/env/runtime; the re-audit
  (D-04) starts from these rather than from zero.

### Established Patterns
- **Preview→prod operator-gated migration** with rollback SQL per change; advisor-clears + SELECT-as-role
  no-regression verified on preview first (v4.0 Ph8). Any RLS/DB-function remediation follows this.
- **RESIDUAL-REGISTER + KEEP-LIST** append-only recording; low-severity + accepted residual land here.
- **Secrets never logged** — reason codes not values; `timingSafeEqual` for token/secret comparison.

### Integration Points
- `withMerits` (`_shared/merit-gateway.ts`) — the seam for the D-03 Merit-idempotency-key targeted fix.
- `grade-linkedin/index.ts` `storeAndNotify()` — the seam for the D-03 refund-after-save log-not-throw fix.
- The Paddle webhook handler — the seam for the D-03 webhook auth/replay hardening.
- `deno.json` `test:ci` allowlist + `verify:baseline` — where every new remediation guard registers (SEC-14).
</code_context>

<specifics>
## Specific Ideas

- The operator explicitly picked the **maximal** option on all four gray areas + the boundary
  question — treat "leave nothing deferred, remediate now, re-audit everything, guard everything"
  as the governing intent when the planner faces a scope judgment call.
- The three targeted fixes (Merit key forwarding, grade-linkedin log-not-throw, Paddle webhook
  auth/replay) must be designed to be **compatible with / subsumed by** their owning phases
  (Ph3/4/8) — no change that Phase 3's lifecycle would have to rip out.
</specifics>

<deferred>
## Deferred Ideas

- **Full lifecycle/idempotency architecture** (LIFE-01..09) → **Phase 3**. Phase 2 does the targeted
  Merit-key-forwarding fix only, not the state machine.
- **LinkedIn deterministic scoring + broader grade-linkedin rework** (FEAT-03/04, VER-03) → **Phase 4**.
  Phase 2 does the refund-after-save log-not-throw fix only.
- **Paddle removal** (PADL-01..04) → **Phase 8** behind the verified expiration gate. Phase 2 hardens
  the webhook auth/replay only; it does not remove Paddle.
- **Low-severity findings** — logged to the residual register with justification (per D-01), addressed
  later or accepted.
- **Framework-major dependency upgrades** (React 18→19, Tailwind 3→4, zod 3→4, TS 5→6, react-router
  6→7) — v4.0-deferred migration-grade work, explicitly out of v5.0 scope; the supply-chain domain
  audits current pins, it does not perform these majors.

### Reviewed Todos (not folded)
None — no pending todos matched Phase 2 (`todo.match-phase` returned 0).
</deferred>

---

*Phase: 02-security-audit-remediation*
*Context gathered: 2026-07-01*

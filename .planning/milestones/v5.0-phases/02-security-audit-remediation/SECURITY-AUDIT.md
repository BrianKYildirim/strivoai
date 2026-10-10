# Phase 2 — SECURITY-AUDIT Catalog

**Phase:** 02 — Security Audit & Remediation
**Foundation plan:** 02-01 (SEC-11 disposition table + severity rubric + 17-domain coverage index)
**Run date:** 2026-07-01
**HEAD SHA at foundation:** `50f18461` (branch `staging`)
**Location (durable):** `.planning/phases/02-security-audit-remediation/SECURITY-AUDIT.md` — the single source of truth
for Phase-2 scope, disposition, severity, and coverage. Later sweeps (02-02 / 02-03 / 02-04) write their
classified findings into a sibling `audit/` subdir and reference this catalog; the SEC-15 record (02-08) rolls
up from it.

> ## NAMES-ONLY DISCIPLINE (T-02-07)
>
> This catalog is committed to a tracked repo. It records variable NAMES, surface presence, findings, and
> classifications ONLY — never a key, token, JWT, price ID, webhook secret, or connection string VALUE. The
> project-refs `zjpjapgraoxdukdvpjes` (prod) / `cimjltzovkahkqecpwgi` (preview/test) are project IDENTIFIERS,
> not secrets, and are allowlisted. The no-secret-leak static guard (`src/test/security/security-audit-docs.test.ts`)
> greps every Phase-2 audit doc for secret-VALUE patterns and MUST return zero.

***

## Verdict / Status

| Field | Value |
| ----- | ----- |
| Audit apparatus | **STOOD UP** (this plan, 02-01): SEC-11 disposition table + severity rubric + 17-domain coverage index + the doc-completeness / no-secret-leak guard. |
| SEC-11 (deferred SEC-01..10) | **DISPOSITIONED** — 10-row table below; 8 remediated/accepted, SEC-07 `needs-decision -> remediate-MEDIUM` (routed 02-07), SEC-10 `re-scoped/accepted`. Each disposition is CONFIRM-then-record by its owning Phase-2 sweep. |
| SEC-12 (17-domain coverage) | **INDEXED** — 17-row coverage index below; each domain routed to its owning sweep (02-02 / 02-03 / 02-04) or `VERIFY-ONLY (Phase 1)` for cross-origin. Status starts `pending-sweep`. |
| Severity rubric | **ESTABLISHED** — impact x exploitability, `Severity = max-of-reasoning`, D-01 threshold recorded. |
| Findings / remediation | **PENDING** — produced by 02-02/03/04 (sweeps) and 02-05/06/07 (remediation + guards); rolled into the SEC-15 record (02-08). |
| v4.0 floor | **NOT WEAKENED** — this plan authors docs + a static guard only; no runtime/auth/billing/DB surface touched. |

***

## Section Map

1. [SEC-11 — Deferred SEC-01..10 Disposition](#sec-11--deferred-sec-0110-disposition) — the 10-row mapping-and-disposition table.
2. [Severity Rubric](#severity-rubric) — the impact x exploitability model that governs every in-phase classification.
3. [17-Domain Coverage Index](#17-domain-coverage-index) — the 17-row sweep-routing index.
4. [How to Re-Run](#how-to-re-run) — reproducible-by-command audit tooling.
5. [Cross-References](#cross-references).

***

## SEC-11 — Deferred SEC-01..10 Disposition

The v1.0 milestone `SEC-01..10` obligations (a deferred "security audit across frontend + edge functions",
recorded in `.planning/_archive/v2.0-credit-system/REQUIREMENTS.md:106` + archived v2.0 ROADMAP Phase 09) were
never planned/built — the owning v1.0 Phase 9 is `orphaned` (`v1.0-MILESTONE-AUDIT.md:188-257`). There are no
per-ID acceptance criteria; SEC-11 is therefore a **mapping-and-disposition** exercise: map each of the 10
topics onto the current 17-domain audit and record `remediated / re-scoped / accepted-with-justification /
needs-decision`, with an evidence pointer. Each disposition below is CONFIRM-then-record by its owning Phase-2
sweep (not merely inherited from research).

> **Naming-collision warning (do NOT conflate):** the v2.0 phase decision-ID "SEC-06" (the Paddle `USING(true)`
> RLS anti-pattern, seen throughout the v2.0 `10-*` / `12-*` / `07-*` phase docs) is NOT the v1.0 milestone
> requirement SEC-06 (RLS) dispositioned below. They are distinct IDs that happen to share the string "SEC-06".

| v1.0 ID | Topic | Maps-to 17-domain | Current state (v4.0/Phase 1) | Disposition | Evidence |
| ------- | ----- | ----------------- | ---------------------------- | ----------- | -------- |
| SEC-01 | edge function auth audit | auth/session + authz | `_shared/auth.ts` requireAuth/requireInternalOrUserAuth, timingSafeEqual internal secret, admin-elevation chokepoint; 3 auth-swallow sites fixed v4.0 Ph7.1 | remediated | 02-02 auth/session sweep (re-verify auth-type coverage across ~21 fns + R-04 inside-serve-arrow guard); v4.0 Ph7.1 auth-rethrow tests |
| SEC-02 | secrets leakage | sensitive-data exposure + secret+env handling | reason-code-not-value logging (RUN-03 allow/deny list); ENV-04 pruned the Vercel privileged-secret cluster (2026-06-23) | remediated | 02-04 env/secret sweep + log-leak grep; v4.0 audit/ENV-SEPARATION.md |
| SEC-03 | SQL injection | input validation/output encoding | no raw SQL from user input — all DB access is PostgREST .from()/.rpc() or SECURITY DEFINER RPCs with pinned search_path | accepted-with-justification | 02-02 no-string-built-SQL confirm (parameterized-by-construction) |
| SEC-04 | XSS | input validation/output encoding | React auto-escapes; only ONE dangerouslySetInnerHTML in src (chart.tsx:70, shadcn CSS-var injection, not user text) | remediated | 02-07 XSS-sink regression guard (src/test/security/xss-sink-guard.test.ts) |
| SEC-05 | CORS | cross-origin handling | fully remediated in Phase 1 (withCors/jsonError, ALLOWED_ORIGINS allowlist, Vary: Origin, cors-audit.test.ts) | remediated | Phase 1 CORS-01..06; 02-02 VERIFY-ONLY against the 17-domain checklist |
| SEC-06 | RLS | RLS enforcement | v4.0 Ph8 dropped linkedin_grades "Anyone can view", explicit-deny on service-role tables, security_invoker views; 2 rls_policy_always_true retained by-design | remediated | 02-03 RLS advisor re-pull + re-examine the 2 intentional always-true policies; v4.0 Ph8 |
| SEC-07 | prompt sanitizer | AI prompt/provider-response exposure | PARTIAL — only grade-linkedin, recruiting-lens, interview-prep-analyze call the sanitizer; analyze-resume, analyze-career, analyze-skills-gap, compare-jobs, chat-agent do NOT | needs-decision -> remediate-MEDIUM | 02-07 sanitizer coverage classification + static coverage guard (routed to plan 02-07) |
| SEC-08 | hardcoded secrets | secret+env handling | per-function fail-closed Deno.env.get guards; no committed secrets (REPO-05 names-not-values); one hardcoded ADMIN_EMAIL default (non-secret), hardcoded Paddle price-IDs (non-secret) | remediated | 02-04 secret-pattern grep over src + supabase/functions |
| SEC-09 | SECURITY DEFINER search_path | DB function permissions | v4.0 Ph8 pinned ts_to_utc_date + increment_rate_limit; function_search_path_mutable cleared DB-wide (1 to 0) | remediated | 02-03 advisor re-pull (confirm all DEFINER fns pinned); v4.0 Ph8 |
| SEC-10 | Deno stdlib standardization | dependency/supply-chain | OPEN documented residual — std@0.168.0 x27 / 0.190.0 x4 / 0.224.0 x2 co-exist; zod import-style split; DEP-05 edge consolidation DEFERRED | re-scoped/accepted (currency, not a vuln) | 02-04 pin audit (audit pins, do NOT perform the consolidation); RESIDUAL-REGISTER DEP-05 |

**Disposition tokens:** `remediated` (the vulnerable behavior is demonstrably no longer possible, re-confirmed
in-phase) · `accepted-with-justification` (safe-by-construction / documented residual) · `re-scoped/accepted`
(reclassified as currency/maintainability, not a vuln) · `needs-decision` (a coverage/threshold call the owning
plan resolves). SEC-07 and SEC-10 are the two carrying an explicit decision; the other eight are confirm-then-record.

***

## Severity Rubric

The impact x exploitability model that governs how every in-phase finding is classified (stated here so
findings classify consistently across all sweeps and the SEC-15 record).

**Impact:**
- **Critical** — full account/data compromise, secret/service-role exposure, fleet-wide financial loss, unauthenticated privileged write.
- **High** — single-user data exposure across users, privilege escalation, per-user financial incorrectness (double-charge / refund-after-save / non-idempotent deduct), auth bypass.
- **Medium** — info/config leak, defense-in-depth gap (e.g. missing prompt-sanitizer on a robustly-prompted endpoint), DoS/abuse gap, replay window.
- **Low** — hardening, currency/style, cosmetic, blast-radius reduction with no active exposure.

**Exploitability:**
- **Easy** — unauthenticated, remote, no special timing/conditions.
- **Moderate** — authenticated user, or requires a race/duplicate/refresh, or a specific input.
- **Hard** — requires operator/insider, physical, or an already-compromised secret.

**`Severity = max-of-reasoning`:** `Critical impact x (Easy|Moderate)` -> Critical; `High impact x Easy` ->
Critical, `x Moderate` -> High; `Medium impact x Easy` -> High, `x Moderate` -> Medium; `Low` -> Low regardless.

**D-01 remediation threshold (recorded explicitly):** `Critical + High + Medium` are remediated in-phase; only
`Low` becomes a tracked/accepted residual (logged with justification in the security record / residual register).

**Worked classifications (the five in-flight findings):**
- Merit non-idempotent deduct -> impact High (per-user double-charge) x exploit Moderate (double-click/two-tab) -> **High**.
- grade-linkedin refund-after-save -> impact High (refund-on-success + hidden failure) x exploit Moderate (post-save write failure) -> **High**.
- Paddle no replay-window -> impact Medium (replay of a stale signed event within the event-id-dedup gap) x exploit Moderate -> **Medium**.
- prompt-sanitizer coverage gap -> impact Medium (defense-in-depth; system prompts robust + promptfoo covers resume/career) x exploit Moderate -> **Medium**.
- paddle-webhook 500 config-leak -> impact Low-Medium x exploit Easy -> **Medium**.

***

## 17-Domain Coverage Index

Every required audit domain, routed to the owning sweep plan that classifies it. Domains `1,2,6,7,9,10,11,14`
plus verify-`5` route to plan **02-02** (code/edge sweep); `3,4,12,13,15` route to plan **02-03**
(DB/RLS/billing/webhook sweep); `8,16,17` route to plan **02-04** (env/supply-chain/isolation sweep).
Cross-origin (domain 5) is `VERIFY-ONLY (Phase 1)` — verified against this checklist, not re-implemented.

| # | Domain | Owning sweep plan | Primary technique | Likely severity | Status |
| - | ------ | ----------------- | ----------------- | --------------- | ------ |
| 1 | auth/session | 02-02 | read _shared/auth.ts + grep requireAuth/requireInternalOrUserAuth across all fns; deno auth tests | LOW-MED | pending-sweep |
| 2 | authz/access control | 02-02 | grep .rpc()/.from() call-sites vs tier gates; confirm every AI fn gates before Anthropic | LOW-MED | pending-sweep |
| 3 | RLS enforcement | 02-03 | get_advisors(security) re-pull + pg_policies read; SELECT-as-role on preview | LOW | pending-sweep |
| 4 | user+resource ownership | 02-03 | grep FE reads (.eq user_id) + RLS owner-scoping; SELECT-as-role | LOW | pending-sweep |
| 5 | cross-origin handling | VERIFY-ONLY (Phase 1) | cors-audit.test.ts + Phase 1 evidence | N/A (verify) | pending-sweep |
| 6 | input validation/output encoding | 02-02 | grep zod usage + length caps (getMaxInputChars) + PDF/text guards; check SQLi surface | MED | pending-sweep |
| 7 | file-upload/document-processing safety | 02-02 | read _shared/document-extraction.ts chain; size/type caps; OCR sandboxing | LOW-MED | pending-sweep |
| 8 | secret+env handling | 02-04 | operator names-only re-pull (D-04) + per-fn Deno.env.get fail-closed grep | LOW | pending-sweep |
| 9 | sensitive-data exposure | 02-02 | grep for PII/secret in logs + response bodies; the RUN-03 allow/deny list | LOW-MED | pending-sweep |
| 10 | logging/error-message safety | 02-02 | read logger.ts + RUN-03 taxonomy; grep raw console.error(err.message) in bodies | MED | pending-sweep |
| 11 | rate limiting/abuse | 02-02 | read rate-limiter.ts + merit-gateway pooled 60/hr; confirm fail-open scope | LOW | pending-sweep |
| 12 | Merit+billing integrity | 02-03 | read merit-gateway.ts + grade-linkedin; deno idempotency/refund tests | HIGH | pending-sweep |
| 13 | webhook auth+replay | 02-03 | read paddle-webhook + stripe-webhook-handler; deno HMAC/replay tests | MED-HIGH | pending-sweep |
| 14 | AI prompt/provider-response exposure | 02-02 | grep sanitizer coverage; promptfoo off-gate; confirm no raw provider payload leak | MED | pending-sweep |
| 15 | DB function permissions | 02-03 | get_advisors(security) re-pull; has_function_privilege checks; pg_proc.proconfig | LOW | pending-sweep |
| 16 | dependency/supply-chain | 02-04 | npm run audit:deps re-pull; Deno inline-import inventory | LOW-MED | pending-sweep |
| 17 | prod-vs-staging isolation | 02-04 | operator names-only 4-surface re-pull vs docs/ENVIRONMENT.md | LOW-MED | pending-sweep |

> Domains 3, 8, 15, 17 carry a live-truth component — their sweep is an **operator-run read-only re-pull**
> (advisors + names-only listings), not a Claude write. Claude stays read-only on prod (`zjpjapgraoxdukdvpjes`);
> the operator applies any prod change. See `.planning/phases/02-security-audit-remediation/02-VALIDATION.md`
> Manual-Only Verifications.

***

## How to Re-Run

Run from repo root. All tools are already in the repo / npx-driven (no new devDeps — "no new infrastructure").

```bash
# Doc-completeness + no-secret-leak guard (this plan's artifact): SEC-11 10 rows,
# 17-domain coverage, secret-pattern grep = 0 over every Phase-2 audit doc.
npm test -- security-audit-docs

# Frontend dependency inventory + vuln signal (supply-chain domain, 02-04).
npm run audit:deps

# Dead-code / unused-dep signal (KEEP-LIST-gated).
npm run audit:deadcode

# Edge/deno guard surface (Merit / refund / replay / sanitizer-coverage guards register here, 02-05..07).
npm run test:edge

# Full baseline gate (vitest + deno test:ci + Playwright) — every new guard folds in here (SEC-14).
npm run verify:baseline
```

**Live DB / advisor / env re-pulls are operator-gated and read-only (D-04):** the read-only advisor pulls
(`get_advisors` on prod `zjpjapgraoxdukdvpjes`) and the names-only 4-surface env listing
(`supabase secrets list` / `gh secret list` / `vercel env ls`) are run by the operator; Claude never reads or
prints a secret value. See `.planning/audit/ENV-SEPARATION.md` "How to re-run" for the exact commands.

***

## Cross-References

- **`.planning/phases/02-security-audit-remediation/02-SECURITY.md`** — the phase ASVS-L1 threat register (T-02-01..08) + trust boundaries + accepted-risk log.
- **`.planning/phases/02-security-audit-remediation/02-RESEARCH.md`** — the SEC-01..10 location + disposition map, per-domain current-state findings, the three targeted-fix seams, and the guard patterns this catalog operationalizes.
- **`.planning/phases/02-security-audit-remediation/02-CONTEXT.md`** — locked decisions D-01..D-05 (maximal-thoroughness stance).
- **`.planning/phases/02-security-audit-remediation/02-VALIDATION.md`** — the per-task verification map + operator-verification (autonomous:false) checkpoints.
- **`src/test/security/security-audit-docs.test.ts`** — the doc-completeness (SEC-11 10 rows) + 17-domain coverage + no-secret-leak static guard that asserts this catalog, not merely claims it.
- **`.planning/audit/`** — the v4.0 audit catalog (INDEX / DATABASE / DEPENDENCIES / ENV-SEPARATION / RESIDUAL-REGISTER / KEEP-LIST / RUNTIME-RELIABILITY); the D-04 re-audit STARTS from these (re-examine, not re-derive).
- **`supabase/functions/_shared/cors-audit.test.ts`** — the static-source-assertion precedent for every config-drift guard.

*This file records domain names, disposition tokens, findings, and classifications only — no secret VALUE is
pasted anywhere in it. Project-refs are identifiers, not secrets.*

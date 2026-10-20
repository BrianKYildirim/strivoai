# Phase 2 — SECURITY-RECORD (SEC-15 Final Security Record)

**Phase:** 02 — Security Audit & Remediation
**Plan:** 02-08 (Wave 6 — the mandated final record + phase closure)
**Run date:** 2026-07-02
**HEAD SHA at record:** `883c2685` (branch `staging`)
**Milestone:** v5.0 — Platform Trust, Reliability & Intelligence
**ASVS level:** L1, block-on-high
**Requirements satisfied:** SEC-11, SEC-12, SEC-13, SEC-14, SEC-15

> **Post-record code-review remediation wave (2026-07-02) — HEAD `b7b86e3b`.** After the 8 plans + `verify:baseline`
> passed 4/4, the required code-review gate (`02-REVIEW.md`) found the audit had UNDER-SCOPED two finding classes
> (the refund-after-save class was swept for `grade-linkedin` only; a latent IDOR in `analyze-resume`) and surfaced
> further hardening items — ALL now remediated with RED→GREEN guards across two review iterations (R1 `02-REVIEW.md`,
> R2 `02-REVIEW-R2.md`). See the new **§7** for the full record. This advances the baseline to **deno 832 / vitest 475**
> and, because the wave made **ZERO DB changes** (code + guards + docs only), the **advisor floor holds 15 → 15**.
> Recounted phase total: **4 HIGH remediated** (§7c). Gap-closure summary: `02-09-SUMMARY.md`.

> ## NAMES-ONLY DISCIPLINE (T-02-07 / CLAUDE.md rule 7)
>
> This record is committed to a tracked repo. It records variable/function/policy/advisor/env NAMES, source
> line anchors, findings, severity classifications, test paths, and advisor counts ONLY — never a key, token,
> JWT, price ID, webhook secret, connection string, or row VALUE. The project-refs `zjpjapgraoxdukdvpjes`
> (prod) / `cimjltzovkahkqecpwgi` (preview/test) and the preview functions host
> `https://cimjltzovkahkqecpwgi.supabase.co` are project IDENTIFIERS, not secrets, and are allowlisted. The
> no-secret-leak static guard (`src/test/security/security-audit-docs.test.ts`) auto-discovers and greps THIS
> record (its glob walks every `.md` under the phase dir) and MUST return zero.

***

## Verdict / Status

| Field | Value |
| ----- | ----- |
| Final security record (SEC-15) | **PRODUCED** — the six mandated sections below (scope reviewed / SEC-01..10 dispositions / confirmed findings / remediation applied / verification performed / accepted residual risk), each completion claim backed by a guard-test path, an advisor-evidence line, or a reproducible operator command. |
| Confirmed crit/high/med (SEC-13) | **ALL REMEDIATED.** Original audit: 2 HIGH (Fix 1 Merit idempotency, Fix 2 grade-linkedin refund-after-save ×3 sites) + 3 MEDIUM (Fix 3 Paddle replay+config-leak, SEC-07 sanitizer coverage, SEC-04 XSS-sink lock). The post-record code-review gate (§7) **recounted the phase to 4 HIGH total** — adding the refund-after-save class extension (CR-01 analyze-resume + CR-02 analyze-career, which the audit under-scoped to grade-linkedin) and the latent IDOR (IN-02) — plus WR-01/WR-02/WR-04 MEDIUM + WR-03/IN-01 LOW, all remediated with RED→GREEN guards. **0 unresolved critical or high at phase completion.** |
| Guards-in-gate (SEC-14) | **ALL FOLDED IN** — 4 new deno guards in `deno.json` `test:ci` + 2 new vitest security guards at record time (§4/§5); the code-review wave added `analyze-resume/refund-after-save`, `analyze-career/refund-after-save`, `_shared/merit-gateway.replay-refund` deno guards and extended `_shared/sanitizer-coverage` + `paddle-webhook/replay-window` (§7). All green in `verify:baseline`. Final: **deno 832 / vitest 475**. |
| Do-not-weaken invariant (SEC-14) | **HELD** — operator-delegated read-only advisor re-pull: **security-advisor floor 15 → 15 (ZERO increase, ZERO new advisors)**; the 3 frozen wire contracts + Phase-1 `_shared/cors.ts` byte-identical (`git diff` proof in §5). The code-review remediation wave (§7) also made **ZERO DB changes** (code + guards + docs only) → floor remains 15 → 15. |
| Open operator action (carried) | **ONE MEDIUM — PENDING OPERATOR ACTION** (not resolved by this phase): the domain-17 cron-host drift (prod cron jobs 1 + 6 → preview functions host) re-point. Recorded in §6 + appended to RESIDUAL-REGISTER. |
| Threat register sign-off | **COMPLETE** — `threats_open: 0`, `status: verified` in `02-SECURITY.md`; all T-02-01..08 closed (6 mitigate-closed + 2 doc-guard-closed). |
| Accepted Residual set | **FINALIZED** — every Low finding + the 15 intentional advisors logged in §6 + appended to `.planning/audit/RESIDUAL-REGISTER.md` (`Phase 2` rows) with justification + clearance criterion. |
| Deployment status | **LIVE ON PROD (operator-confirmed 2026-07-02).** All Phase-2 fixes are in the Edge Functions and were deployed **staging → production** (`zjpjapgraoxdukdvpjes`) via the `deploy.ps1` gate — so the money-path fixes, the SEC-07 sanitizer coverage, the Paddle hardening, and the **IN-02 IDOR fix** are protecting real users. The frontend (Vercel) changes this phase were **test-only** (`src/test/security/*`, not bundled), so the staging→preview merge + Vercel preview deploy carry no Phase-2 behavior change. |

***

## 1. Scope Reviewed

The audit covered the full v5.0 security surface across the frontend (`src/**`) and the Supabase Edge Function
layer (`supabase/functions/**`), plus the operator-gated live-truth surfaces (prod advisors, cross-surface env
names, prod cron config) that Claude cannot read directly and that the operator re-pulled read-only.

**Two obligation sets were reviewed:**

- **The deferred v1.0 `SEC-01..10` obligations** — mapped onto the current 17-domain audit and dispositioned
  (§2). These were an orphaned v1.0 Phase-9 "security audit across frontend + edge functions" with no per-ID
  acceptance criteria; SEC-11 turned them into a confirm-then-record mapping-and-disposition exercise.
- **The full 17-domain current-surface audit (SEC-12)** — every required domain classified against **current
  HEAD** (D-04: nothing assumed-closed; the v3.0/v4.0 concern catalogs were re-confirmed, not trusted).

**The 17 audit domains + their owning sweep:**

| # | Domain | Owning sweep | Finding doc |
| - | ------ | ------------ | ----------- |
| 1 | auth/session | 02-02 | CODE-EDGE-FINDINGS.md |
| 2 | authz/access control | 02-02 | CODE-EDGE-FINDINGS.md |
| 3 | RLS enforcement | 02-03 | DB-BILLING-WEBHOOK-FINDINGS.md |
| 4 | user+resource ownership | 02-03 | DB-BILLING-WEBHOOK-FINDINGS.md |
| 5 | cross-origin handling | **VERIFY-ONLY (Phase 1)** | CODE-EDGE-FINDINGS.md |
| 6 | input validation/output encoding | 02-02 | CODE-EDGE-FINDINGS.md |
| 7 | file-upload/document-processing safety | 02-02 | CODE-EDGE-FINDINGS.md |
| 8 | secret+env handling | 02-04 | ENV-SUPPLYCHAIN-ISOLATION-FINDINGS.md |
| 9 | sensitive-data exposure | 02-02 | CODE-EDGE-FINDINGS.md |
| 10 | logging/error-message safety | 02-02 | CODE-EDGE-FINDINGS.md |
| 11 | rate limiting/abuse | 02-02 | CODE-EDGE-FINDINGS.md |
| 12 | Merit+billing integrity | 02-03 | DB-BILLING-WEBHOOK-FINDINGS.md |
| 13 | webhook auth+replay | 02-03 | DB-BILLING-WEBHOOK-FINDINGS.md |
| 14 | AI prompt/provider-response exposure | 02-02 | CODE-EDGE-FINDINGS.md |
| 15 | DB function permissions | 02-03 | DB-BILLING-WEBHOOK-FINDINGS.md |
| 16 | dependency/supply-chain | 02-04 | ENV-SUPPLYCHAIN-ISOLATION-FINDINGS.md |
| 17 | prod-vs-staging isolation | 02-04 | ENV-SUPPLYCHAIN-ISOLATION-FINDINGS.md |

**Authoritative surface enumerated:** 38 edge functions with an `index.ts` (31 consume the shared
`requireAuth`/`requireInternalOrUserAuth` helpers; the 7 with custom/inline auth — paddle-webhook,
stripe-webhook, stripe-webhook-handler, admin-delete-user, get-analysis-job-status, notify-upgrade-request,
test-email — were each individually verified in domain 1). 8 AI text-ingesters were enumerated for the SEC-07
sanitizer-coverage table. The frontend XSS sink surface was grep-swept (single `dangerouslySetInnerHTML` in
`src/`). Cross-origin (domain 5) was **VERIFY-ONLY** — Phase 1 owns `_shared/cors.ts`; this phase confirmed it
byte-identical and re-ran `cors-audit.test.ts` (64/0), never re-implementing it.

***

## 2. SEC-01..10 Dispositions (SEC-11 — closed)

The 10-row disposition table (carried from `SECURITY-AUDIT.md` §SEC-11; each disposition confirm-then-recorded
by its owning Phase-2 sweep). Disposition tokens: `remediated` (vulnerable behavior demonstrably no longer
possible, re-confirmed in-phase) · `accepted-with-justification` (safe-by-construction / documented residual) ·
`re-scoped/accepted` (reclassified as currency/maintainability, not a vuln).

| v1.0 ID | Topic | Disposition | Evidence (in-phase) |
| ------- | ----- | ----------- | ------------------- |
| SEC-01 | edge function auth audit | **remediated** | 02-02 domain 1 — 31/38 use shared helpers; 7 custom-auth fns each verified; R-04 inside-serve-arrow cleared-by-withCors; fail-closed `timingSafeEqual` internal secret |
| SEC-02 | secrets leakage | **remediated** | 02-04 domain 8 — reason-code-not-value logging; per-fn fail-closed `Deno.env.get`; ENV-04 Vercel privileged cluster pruned; Task-3 names-only re-pull all clean |
| SEC-03 | SQL injection | **accepted-with-justification** | 02-02 domain 6 — parameterized-by-construction; grep for `.sql(`/`execute(`/template-literal query strings = zero; all DB access is PostgREST `.from()`/`.rpc()` or pinned-search_path DEFINER RPCs |
| SEC-04 | XSS | **remediated** | 02-07 — single `dangerouslySetInnerHTML` (chart.tsx CSS-var, no user data) locked by `src/test/security/xss-sink-guard.test.ts` (fail-before demonstrated) |
| SEC-05 | CORS | **remediated** | Phase 1 CORS-01..06 (`withCors`/`jsonError`, `ALLOWED_ORIGINS` allowlist, `Vary: Origin`); 02-02 VERIFY-ONLY re-ran `cors-audit.test.ts` 64/0 |
| SEC-06 | RLS | **remediated** | 02-03 domain 3 — `linkedin_grades` "Anyone can view" confirmed DROPPED (owner-scoped SELECT remains); 2 intentional service-role always-true policies re-examined by-design |
| SEC-07 | prompt sanitizer | **remediated** (MEDIUM) | 02-07 — analyze-resume + analyze-career now `sanitizeUserContent` before Anthropic; locked by `_shared/sanitizer-coverage.test.ts` (5 enrolled, `=== 5` guard). 3 low-traffic ingesters → justified Low residual (§6) |
| SEC-08 | hardcoded secrets | **remediated** | 02-04 domain 8 — no committed secret VALUE (names-not-values); only non-secret defaults (ADMIN_EMAIL, template-literal Stripe price-ID names) |
| SEC-09 | SECURITY DEFINER search_path | **remediated** | 02-03 domain 15 — `function_search_path_mutable` cleared DB-wide (v4.0 Ph8); floor carries no such advisor; anon-EXECUTE=0 intact |
| SEC-10 | Deno stdlib standardization | **re-scoped/accepted** | 02-04 domain 16 — std multi-version drift is currency/maintainability, not a vuln; zod import-style split self-resolved to a single style; DEP-05 edge consolidation deferred |

**Naming-collision note (preserved):** the v2.0 phase decision-ID "SEC-06" (Paddle `USING(true)` RLS
anti-pattern) is NOT the v1.0 requirement SEC-06 (RLS) dispositioned above — distinct IDs sharing a string.

***

## 3. Confirmed Findings (consolidated from the three sweeps)

Every classified finding from the three sweep docs, with domain #, rubric severity (impact × exploitability,
`Severity = max-of-reasoning`), and potential impact. D-01 threshold: `Critical + High + Medium` remediated
in-phase; only `Low` becomes a tracked/accepted residual.

### Confirmed Critical/High/Medium (remediated in-phase — see §4)

| ID | Finding | Domain | Severity | Potential impact |
| -- | ------- | ------ | -------- | ---------------- |
| Fix 1 | Merit non-idempotent deduct — `withMerits` never forwarded `p_idempotency_key` (`merit-gateway.ts:201-205`) | 12 | **HIGH** (High × Moderate) | Per-user financial incorrectness: double-click / two-tab / refresh-resubmit each deducts Merits independently (double-charge) |
| Fix 2 | grade-linkedin refund-after-save / hidden-success 500 at 3 post-save sites (`grade-linkedin` L554-559, L518-522, L822-828) | 12 | **HIGH** (High × Moderate) | Refund of an already-delivered analysis (double benefit) + a saved+emailed success reported to the user as a 500 |
| Fix 3a | Paddle webhook no replay-window (`ts` parsed but never freshness-checked, `paddle-webhook:24`) | 13 | **MEDIUM** (Medium × Moderate) | Replay of a stale-but-signed event within the event_id-dedup gap |
| Fix 3b | paddle-webhook 500 body names `PADDLE_WEBHOOK_SECRET` env var (`paddle-webhook:105-113`) | 10/13 | **MEDIUM** (Low-Med × Easy) | Config/env-name state disclosure |
| SEC-07 | Prompt-sanitizer coverage gap — analyze-resume + analyze-career did not sanitize user text before Anthropic | 14 | **MEDIUM** (Medium × Moderate) | Prompt-injection defense-in-depth gap on the two high-traffic ingesters |
| SEC-04 | Regression risk on the single `dangerouslySetInnerHTML` sink (chart.tsx) | 9 | **MEDIUM** (as regression-lock) | A future user-data sink could reintroduce XSS with no guard |

### Confirmed clean / accepted-by-construction (no remediation owed)

| Domain | Finding | Verdict |
| ------ | ------- | ------- |
| 1 auth/session | Centralized fail-closed enforcement; R-04 cleared-by-withCors | **CLEAN** |
| 2 authz | Tier gating before spend; admin `user_roles` chokepoint; no string-built SQL | **CLEAN** |
| 5 cross-origin | `_shared/cors.ts` byte-identical; `cors-audit.test.ts` 64/0; zero ACAO literals | **CLEAN (verify-only)** |
| 6 input validation | Per-tier `getMaxInputChars` wired; fixed-slice trio bounded; SEC-03 parameterized | **CLEAN** (fixed-slice→helper consolidation = Low residual) |
| 7 file-upload | parser-first `mistral→textract→claude_ocr` chain; size caps; Ollama removed | **CLEAN** (ocr-pdf content-type assertion = Low residual) |
| 9 sensitive-data | reason-code logging discipline; no PII/secret in bodies | **CLEAN** |
| 10 logging | `error.message`-in-500-body class across ~8 fns (RUN-03) | **LOW-MED residual** (§6) |
| 11 rate limiting | pooled 60/hr + per-fn limiters; fail-open documented | **CLEAN** |
| 3 RLS | linkedin_grades "Anyone can view" DROPPED; 2 always-true = service-role by-design | **CLEAN** (2 always-true = intentional advisor residual) |
| 4 ownership | user reads owner-scoped; admin reads role-gated | **CLEAN** |
| 8 secret+env | per-fn fail-closed; Vite `VITE_*`-only; 10-item fix-list all RESOLVED | **CLEAN** |
| 15 DB fn perms | anon-EXECUTE=0; search_path pinned; 11 kept EXECUTE grants load-bearing | **CLEAN** (11 grants = intentional advisor residual) |
| 16 supply-chain | 20-pkg promptfoo dev-only residue; react-router-dom in-6.x patched; SEC-10 currency | **LOW/accepted residual** (§6) |
| 17 isolation | prod≠preview separation CLEAN; cron-host drift MEDIUM | **cron drift = MEDIUM pending-operator** (§6) |

**No NEW crit/high surfaced beyond the known set.** The one NEW finding (Open Q5 — `error.message`-into-body
class, domain 10) classified LOW-MEDIUM → tracked residual, not a forced crit/high split. No new DB advisor and
no migration owed by any sweep.

***

## 4. Remediation Applied (SEC-13 + SEC-14 guards-in-gate)

One row per remediated crit/high/med finding. Each cites its guard-test PATH and confirms it is **registered in
`supabase/functions/deno.json` `test:ci`** (deno) or is a **vitest** file auto-discovered into `verify:baseline`
— the SEC-14 obligation. All commits are on branch `staging`.

| # | Finding | Fix (what changed) | Guard test | In-gate registration | Commit |
| - | ------- | ------------------ | ---------- | -------------------- | ------ |
| Fix 1 | Merit non-idempotent deduct (HIGH) | `withMerits` forwards optional `p_idempotency_key: ctx.idempotencyKey ?? null` to the 4-arg `check_and_deduct_merits`; repeated key deducts exactly once; post-success log null-safe on `already_deducted` replay branch. Capability-only (NULL default preserves behavior; Phase 3 extends) | `supabase/functions/_shared/merit-gateway.idempotency-forward.test.ts` (static + skip-by-default gated-remote runtime twin) | `deno.json` `test:ci` ✓ | `4ab218c5` |
| Fix 2 | grade-linkedin refund-after-save ×3 (HIGH) | All 3 post-save usage-write failure branches log-and-continue to the durable success return (no `MeritRefundable`/500 after `storeAndNotify`); pre-save throw (L459-462) + 4 pre-save refundable throws byte-identical | `supabase/functions/grade-linkedin/refund-after-save.test.ts` (static-source) | `deno.json` `test:ci` ✓ | `30be9b55` |
| Fix 3 | Paddle replay-window + config-leak (MEDIUM ×2) | `MAX_WEBHOOK_AGE_SECONDS=300` authenticated-ts replay-window (stale/NaN ts → generic 401) on top of preserved `event_id` dedup; missing-secret (`webhook_not_configured`) + invalid-signature bodies non-leaky (reason code → log only). HMAC/`timingSafeEqual`/`event_id`/CORS-less contract byte-identical | `supabase/functions/paddle-webhook/replay-window.test.ts` (7 cases, isolation-safe pure HMAC+timestamp) | `deno.json` `test:ci` ✓ | `44c7579d` |
| SEC-07 | prompt-sanitizer coverage (MEDIUM) | analyze-resume (`normalizedText`) + analyze-career (resume/LinkedIn content, both paths) `sanitizeUserContent` before the Anthropic invoke; pre-ingestion only, no schema/wire/tier-model change | `supabase/functions/_shared/sanitizer-coverage.test.ts` (5 enrolled ingesters, `=== 5` length guard) | `deno.json` `test:ci` ✓ | `949b761b` |
| SEC-04 | XSS-sink regression lock (MEDIUM) | Static guard forbids any `dangerouslySetInnerHTML` in `src/` outside the allowlisted chart.tsx (benign CSS-var sink) + the guard file itself | `src/test/security/xss-sink-guard.test.ts` (vitest) | vitest auto-discovery → `verify:baseline` ✓ | `00d8eb23` |

**Doc/no-secret-leak guard (SEC-11/12/14, D-05):** `src/test/security/security-audit-docs.test.ts` (vitest,
`3f36688c`) asserts the SEC-01..10 table is 10 complete rows, all 17 domains are covered, and NO secret VALUE
leaks in any Phase-2 audit doc (its glob auto-enrolls THIS record). In `verify:baseline`.

**Byte-preserve KEEPs verified (do-not-over-reach):** the grade-linkedin pre-save throw + 4 pre-save refundable
throws; the Paddle HMAC-over-`${ts}:${payload}` + `timingSafeEqual` + `event_id` dedup; the Stripe
`constructEventAsync` + insert-first idempotency; `MeritGatewayResult` shape + the RUN-03 success/failure wire
bodies — all unchanged (confirmed in the 02-05/06 guards and the §5 git diff).

***

## 5. Verification Performed

### 5a. `verify:baseline` — the SEC-14 gate proof (deterministic)

`npm run verify:baseline` = `npm run test` (vitest) + `npm run test:edge` (deno `test:ci`) + `npm run test:e2e`
(Playwright). All six new guards fold in here. `test:adversarial*` (promptfoo) is confirmed **OFF** the gate
(never referenced by `verify:baseline`; dev-only devDependency).

| Suite | Result | New guards folded in |
| ----- | ------ | -------------------- |
| deno `test:ci` (`npm run test:edge`) | at record: **814 passed / 0 failed / 11 ignored** (54s) → after the §7 code-review wave: **832 passed / 0 failed / 11 ignored** (+18) | merit-gateway.idempotency-forward · grade-linkedin/refund-after-save · paddle-webhook/replay-window · _shared/sanitizer-coverage · **(§7)** analyze-resume/refund-after-save · analyze-career/refund-after-save · _shared/merit-gateway.replay-refund |
| vitest (`npm test`) | **475 passed / 0 failed** (81 test files; unchanged after the §7 wave) | security-audit-docs · xss-sink-guard |
| Playwright (`npm run test:e2e`) | **5 passed / 1 skipped** (exit 0, ~1.0m) | (no new e2e; known env-gated Stripe case = the 1 skip, no red at this run) |

**`verify:baseline` is GREEN** — all three legs pass (deno exit 0, vitest exit 0, Playwright exit 0) with the
six new guards folded in.

**Fail-before / pass-after evidence per guard** (captured at each remediation plan):

- **Fix 1** — static guard RED on unmodified `merit-gateway.ts` (no `p_idempotency_key` forward, no
  `already_deducted` handling) → GREEN after (02-05).
- **Fix 2** — static guard RED on unmodified `grade-linkedin/index.ts` (post-save `MeritRefundable`/500 present)
  → GREEN after all 3 sites converted (02-05).
- **Fix 3** — replay-window guard RED 1/7 on unmodified source (no replay-window; missing-secret body named the
  env var) → GREEN 7/7 after (02-06).
- **SEC-07** — sanitizer-coverage guard RED on pre-fix source (analyze-resume/analyze-career failing the `=== 5`
  enrolled check) → GREEN after (02-07).
- **SEC-04** — xss-sink guard fail-before demonstrated (a temporary second sink drove it RED) → GREEN with only
  the chart.tsx allowlist (02-07).

**Playwright known-state (documented baseline, NOT a phase failure):** at this 02-08 run the suite was fully
green — **5 passed / 1 skipped, exit 0**. The single env-gated Stripe e2e case (historically the
`cimjltzovkahkqecpwgi` preview-pause env-red carried across v4.0 — RESIDUAL-REGISTER R-02 / DI-06-05-01) ran as
the **1 skip** here (preview `cimjltzovkahkqecpwgi` is now unpaused), so no red was present. Either way it is the
documented baseline state, not a regression introduced by this phase. Recorded faithfully.

### 5b. Do-not-weaken invariant — operator before/after (SEC-14)

**Security-advisor floor: 15 → 15 (ZERO increase, ZERO new advisors).** The BEFORE floor (15, all WARN, all
intentional, 0 NEW) was the 02-03 operator-delegated read-only prod pull. The AFTER floor was obtained by the
02-08 orchestrator's delegated read-only prod after-pull (operator Option A) on `zjpjapgraoxdukdvpjes`. The two
floors are IDENTICAL — the same set:

| Advisor (lint name) | Count | Disposition |
| ------------------- | ----- | ----------- |
| `authenticated_security_definer_function_executable` | 11 | intentional — R-DB-05 load-bearing EXECUTE grants (incl. `can_perform_ai_action` live FE) |
| `rls_policy_always_true` (`paddle_webhook_events`, `scheduled_emails`) | 2 | intentional — service-role manage-by-design |
| `public_bucket_allows_listing` (`public-assets`) | 1 | intentional — deliberately-public asset bucket; operator toggle |
| `auth_leaked_password_protection` | 1 | accepted residual — requires a paid Supabase Auth tier; project on free tier (operator-confirmed 2026-07-02), cannot enable; re-evaluate on upgrade (see §6c) |

Expected result: **the phase made ZERO DB changes** (all remediations are code-only + docs; no migration). The
floor did not increase; all 15 remain intentional. This IS the SEC-14 "protections not weakened" proof. (The
performance advisors — ~48× `unused_index`, `multiple_permissive_policies` on `upgrade_requests` — are non-security
near-empty-prod / deferred-perf items, NOT part of the security floor.)

### 5c. Frozen contracts byte-identical (git diff proof)

Source files changed across Phase 2 (`git diff --stat 50f18461..HEAD -- supabase/functions/ src/`) are EXACTLY
the intended remediation + guard surface — nothing else:

- **`_shared/cors.ts`** — **byte-identical** (empty diff in Phase 2; last touched `af7189c7` in Phase 1 01-01).
  Phase-1 CORS not modified.
- Production source edits: `merit-gateway.ts` (Fix 1, +26), `grade-linkedin/index.ts` (Fix 2, 17), `paddle-webhook/index.ts`
  (Fix 3, 38), `analyze-career/index.ts` (SEC-07, 18), `analyze-resume/index.ts` (SEC-07, 7), `deno.json` (guard
  registration, 2) — the intended fix branches only; the 3 frozen wire contracts (Merit gateway result body,
  grade-linkedin save/response, Paddle webhook signing/dedup) preserved.
- 6 test/guard files created (the SEC-14 guards) + doc updates.

### 5d. Operator live-truth re-pulls (names-only / read-only)

- **Advisor floor (02-03 before + 02-08 after):** 15 → 15, read-only via `get_advisors(type="security")` on
  prod `zjpjapgraoxdukdvpjes` (operator-delegated). §5b.
- **Env cross-surface (02-04, 2026-07-01):** names-only `supabase secrets list` (prod+preview) + `vercel env ls`
  + `gh secret list` + local `.env` — all 10 fix-list items RESOLVED / as-intended; separation CLEAN (GitHub =
  5 test-gate secrets, Vercel = `VITE_*`-only, benign prod↔preview deltas). No secret VALUE read or printed.
- **In-flight Paddle subs (02-06):** operator confirmed **0** profiles with an active future-dated Paddle
  `current_period_end` + `PADDLE_WEBHOOK_SECRET` unset on prod → endpoint inert; Phase-8 clean-removal signal.
- **Cron config (02-04):** read-only prod `cron.job` pull confirmed jobs 1 & 6 target the preview host (§6
  pending-operator).

### 5e. No secret VALUE in any committed audit doc

`npm test -- security-audit-docs` (the no-secret-leak glob now auto-covers THIS record) returns green — zero
key/JWT/connection-string/price-ID/webhook-secret VALUE patterns across every Phase-2 `.md`.

***

## 6. Accepted Residual Risk + Justification

Per D-01, only `Low` becomes a tracked/accepted residual; `Critical + High + Medium` were remediated in-phase
(§4). Every residual below is appended to `.planning/audit/RESIDUAL-REGISTER.md` as a `Phase 2` row with a
clearance criterion. **Accepted Residual** set:

### 6a. One MEDIUM — PENDING OPERATOR ACTION (carried at closure, NOT resolved)

| Finding | Severity | Owner | Action | Status |
| ------- | -------- | ----- | ------ | ------ |
| Domain-17 cron-host drift — prod cron jobs **1 `keep-warm-ping` (`*/5`)** + **6 `extract_catchup_nightly` (`*/15`)** `net.http_post` target the PREVIEW functions host `cimjltzovkahkqecpwgi.supabase.co` | **MEDIUM** (live-confirmed 2026-07-01) | **Operator** (Claude read-only on prod) | Live prod `cron.alter_job`/`UPDATE cron.job` re-pointing both URL hosts → `zjpjapgraoxdukdvpjes.supabase.co` (or an `app.functions_base_url` GUC). NO repo migration / NO DDL. | **OWED / open** |

This is the ONE open operator action exiting the phase. It is a cron/config re-point, not a public-schema DDL,
so no repo migration is owed. Recorded MEDIUM (remediation defined) but **NOT marked resolved** — carried to
Phase-2 closure and appended to the RESIDUAL-REGISTER.

### 6b. Low residuals (tracked, accepted with justification)

| Ref | Residual | Justification | Clearance criterion |
| --- | -------- | ------------- | ------------------- |
| SEC-07-low | 3 low-traffic sanitizer ingesters (analyze-skills-gap, compare-jobs, chat-agent) not enrolled | Hard input slice caps; chat-agent forces `role:'user'` + 2000-char cap + last-message-only; robust system prompts + off-gate promptfoo. Low = below D-01 threshold | Enroll into `_shared/sanitizer-coverage.test.ts` + add `sanitizeUserContent` if any moves to a high-traffic surface |
| RUN-03-leak | `error.message` echoed into client 500 bodies across ~8 prod-active fns | Internal error text, NOT secret/PII/cross-user datum; defense-in-depth info-leak (identical to the already-retired compare-jobs case). LOW-MEDIUM | Apply the RUN-03 generic-body pattern to the remaining ~8 sites (defense-in-depth pass) |
| DEP-04 | 20-pkg promptfoo dev-only vuln residue (1 low/13 mod/6 high/0 crit) | All inside the dev-only promptfoo subtree; OFF `verify:baseline`; not in shipped bundle; zero prod-runtime exposure. A measured promptfoo bump escalated protobufjs→CRITICAL (discarded) | Future promptfoo-major bump that clears the subtree without a worse advisory |
| SEC-10 | Deno std multi-version drift (`0.168.0`×27 / `0.190.0`×4 / `0.224.0`×2) + zod (now single-style) | Currency/maintainability, not a vuln; offline `--no-check` can't prove an edge std/zod bump safe without per-fn staging deploy-smoke | Dedicated edge-consolidation task with per-function staging deploy-smoke (DEP-05, Phase-9-adjacent) |
| INPUT-slice | fixed-slice trio (analyze-skills-gap, compare-jobs, chat-agent) not on the shared `getMaxInputChars` helper | Every ingester bounds its input; two forms (per-tier helper vs fixed slice) is a consistency difference, not a DoS gap | Route the fixed-slice trio onto `getMaxInputChars` |
| OCR-guard | ocr-pdf content-type/max-bytes assertion lives at the ocr-pdf boundary, not in document-extraction.ts | No active exposure; parser-first + tier-gating + downstream slice caps bound the blast radius | Confirm/relocate the ocr-pdf size/content-type guard |

### 6c. Operator-toggle / accepted-by-design (the 15 intentional advisors)

The security-advisor floor of 15 is the intentional, do-not-weaken set (§5b) — re-examined individually under
D-04, each retained by-design:

| Item | Count | Rationale (do-not-weaken) |
| ---- | ----- | ------------------------- |
| `authenticated_security_definer_function_executable` (11 RPCs) | 11 | R-DB-05 load-bearing — each has a live FE / RLS-context caller (`can_perform_ai_action` at Navbar.tsx:109 + SkillsGapAnalysis.tsx:108; `has_role`; merit/intel RPCs; admin-gated RPCs that internally enforce `has_role`; `auth_owns_version` in an RLS `USING()`). Revoking any breaks a live path. Anon-EXECUTE already revoked |
| `rls_policy_always_true` (paddle_webhook_events, scheduled_emails) | 2 | service_role bypasses RLS regardless; always-true "manage" on a service-role-only table is not a client-reachable exposure. paddle_webhook_events is a gated Paddle remnant (Phase 8 owns removal) |
| `public_bucket_allows_listing` (public-assets) | 1 | deliberately-public asset bucket (no user-private objects); operator storage toggle, no code change |
| `auth_leaked_password_protection` | 1 | **ACCEPTED RESIDUAL (accepted-with-justification).** HaveIBeenPwned leaked-password protection requires a **paid Supabase Auth tier**; operator confirmed the project is on the **free tier (2026-07-02)** → it cannot be enabled. Not a code/config gap. **Clearance criterion:** enable the toggle on upgrade to a paid Auth tier. |

### 6d. Non-security / deferred-perf (recorded so they are not mistaken for a security delta)

The delegated advisor pull also returned performance advisors — NOT part of the security floor: ~48×
`unused_index` (expected on the near-empty 1-user prod; D-11 low-traffic ≠ droppable) and
`multiple_permissive_policies` on `upgrade_requests` SELECT (both policies correct least-privilege; perf nudge,
not over-exposure). Dispositioned in Phase-9 DB-perf routing (RESIDUAL-REGISTER §"Phase 9 (Plan 09-03)").

### 6e. Phase-8 gate input (recorded)

0 in-flight Paddle subscriptions on prod + `PADDLE_WEBHOOK_SECRET` unset = the clean-removal signal Phase 8's
expiration gate consumes (endpoint inert today; Fix 3 hardens it defensively should the secret ever be restored
while a residual sub expires).

***

## 7. Code-Review Remediation Wave (post-audit gate)

After the 8 plans completed and `verify:baseline` passed 4/4, the **required code-review gate** ran against the
Phase-2 remediation diff (`02-REVIEW.md`, 2026-07-01). It found the audit had **UNDER-SCOPED two finding classes**
and surfaced additional hardening items. Everything was remediated with **RED→GREEN guards** across **two review
iterations** — R1 (`02-REVIEW.md`) then R2 (`02-REVIEW-R2.md`, a re-review that confirmed all 8 R1 findings closed
and caught 2 further residual WARNINGs, both now fixed). The money-path changes (CR-01/CR-02/WR-01/WR-03) were
**operator-APPROVED (2026-07-01)**. The entire wave is **code + guards + docs only — ZERO DB changes** → the SEC-14
do-not-weaken advisor floor holds **15 → 15**.

### 7a. What the audit under-scoped (why the gate added findings)

- **refund-after-save class under-scoped to one function.** The original **Fix 2** (§4) swept ONLY `grade-linkedin`
  for the post-save-usage-write → `MeritRefundable` refund-after-save anti-pattern. The **identical pattern was live
  in the two remaining merit-gated ingesters** and was not caught by the sweep: `analyze-resume`
  (`completeAndRecordSuccess`, post-`resumes.update` + `persistResumeAnalysis`) and `analyze-career`
  (`persistCareerResultAndRecordUsage`, both `withMerits` sites, post-`analysis_results.insert` + fire-and-forget
  email). A post-save usage-write failure refunded a Merit for an already-durable, already-delivered analysis
  (double benefit). → **CR-01 / CR-02 (HIGH).**
- **latent IDOR not surfaced by the audit.** `analyze-resume`'s `resumes.update(...).eq('id', resumeId)` ran under
  the **service-role client (RLS bypass)** filtered by the **request-controlled `resumeId` only** — an authenticated
  user could overwrite another user's resume `grading_data`/`overall_score`. Pre-existing, but in-scope for a
  security phase touching this file. → **IN-02 (HIGH).**

### 7b. Findings remediated (ALL RESOLVED + guarded)

> Names-only / illustrative-example caveat: any injection phrase referenced below (e.g. an
> override-prior-instructions-style string) is an ILLUSTRATIVE example of the attacker input class, not a captured
> value; no secret/PII/token VALUE is pasted anywhere in this record.

| ID | Severity | Finding | Remediation | Guard test (in `verify:baseline`) | Commit |
| -- | -------- | ------- | ----------- | --------------------------------- | ------ |
| CR-01 | **HIGH** (refund-after-save) | analyze-resume `completeAndRecordSuccess` post-save usage-write threw `MeritRefundable` | Convert to **log-and-continue** to the durable success return; pre-save throws (`resumes.update`, `persistResumeAnalysis`) byte-preserved | `analyze-resume/refund-after-save.test.ts` | `d7c9a521` |
| CR-02 | **HIGH** (refund-after-save) | analyze-career `persistCareerResultAndRecordUsage` (both `withMerits` sites) same conversion | **log-and-continue** post-save; pre-save insert throw byte-preserved | `analyze-career/refund-after-save.test.ts` | `dfe1591c` |
| IN-02 | **HIGH** (IDOR) | analyze-resume `resumes.update` service-role RLS-bypass filtered by request-controlled `resumeId` only | Add owner scope **`.eq('user_id', params.userId)`** (cross-user id → 0 rows) | `analyze-resume/refund-after-save.test.ts` (IN-02 assertion) | `d7c9a521` |
| WR-01 | **MEDIUM** (money-path) | merit-gateway replay callback could refund the ORIGINAL successful deduction | Refund gated on **`refundable && !already_deducted`**; explicit `already_deducted` else-branch logs `merit-replay-callback-failed-no-refund` and does NOT reverse the original | `_shared/merit-gateway.replay-refund.test.ts` | `4e03f39b` |
| WR-03 | **LOW-MED** | merit-gateway unguarded `transaction_id` cast → `undefined` could reach `refund_merits` | **Null-guard** on missing `transaction_id` → `genericError(500, 'merit_system_error', …)` | `_shared/merit-gateway.replay-refund.test.ts` | `4e03f39b` |
| WR-02 | **MEDIUM** (sanitizer) | analyze-career `handleMultiRoleComparison` interpolated user input unsanitized: `roles` (R1) + `existingAnalysis.careerDNA/detectedDomain/whatYouHave` (R2) | `sanitizeUserContent` each `role` (R1) then each `existingAnalysis.*` field (R2); `sanitizer-coverage.test.ts` strengthened to **per-path markers, `minSanitizeCalls 6`** | `_shared/sanitizer-coverage.test.ts` | `ccb7691c` / `0dce0ed9` |
| WR-04 | **MEDIUM** (PII) | paddle-webhook no-match branch echoed PII (email/customerId/subscriptionId) + swallowed `updateError` (R1); happy-path `console.log`s emitted raw PII (R2) | No-match branch → **presence flags** in body + no-match log + `console.error(updateError)` (R1); happy-path logs scrubbed to **presence flags** (R2) | `paddle-webhook/replay-window.test.ts` (extended) | `acd2bd73` / `b7b86e3b` |
| IN-01 | **LOW** | paddle-webhook missing-signature body named the `paddle-signature` header | Generic **`{ error: "invalid_signature" }`** body (parity with the bad-signature path) | `paddle-webhook/replay-window.test.ts` | `acd2bd73` |

### 7c. Recount — honest phase-level finding tally

Combining the original audit (§3/§4) with the code-review gate (§7b), the **phase remediated 4 HIGH** (Critical: 0):

1. **Fix 1** — Merit non-idempotent deduct (`merit-gateway` idempotency-key forward).
2. **Fix 2** — grade-linkedin refund-after-save (×3 post-save sites).
3. **Refund-after-save extension (CR-01 + CR-02)** — the SAME class in `analyze-resume` + `analyze-career`; the
   audit under-scoped it to grade-linkedin only. Counted as **one finding-class spanning 2 functions / 2 commits**.
4. **IDOR (IN-02)** — analyze-resume `resumes.update` owner-scoping.

**MEDIUM remediated:** Fix 3a (Paddle replay-window), Fix 3b (Paddle config-name leak), SEC-07 (sanitizer coverage),
SEC-04 (XSS-sink lock), **WR-01** (replay-refund suppression), **WR-02** (multi-role sanitizer residual),
**WR-04** (paddle-webhook PII/log hygiene). **LOW / LOW-MED remediated:** **WR-03** (transaction_id null-guard),
**IN-01** (missing-signature body). **0 unresolved critical or high at phase completion.**

> Counting note (honesty): CR-01 and CR-02 are two distinct code sites / two commits but a single refund-after-save
> *finding-class* (the audit's Fix-2 under-scope). Counting them individually would read as 5 HIGH; per the class-based
> recount they are **one** HIGH class → **4 HIGH total**.

### 7d. Verification (final baseline after the wave)

| Suite | At 02-08 record | After §7 wave | New §7 guards |
| ----- | --------------- | ------------- | ------------- |
| deno `test:ci` | 814 / 0 / 11 | **832 passed / 0 failed / 11 ignored** (+18) | analyze-resume/refund-after-save · analyze-career/refund-after-save · _shared/merit-gateway.replay-refund · extended _shared/sanitizer-coverage + paddle-webhook/replay-window |
| vitest | 475 / 0 | **475 passed / 0 failed** (unchanged) | (no new vitest guard; the no-secret-leak `security-audit-docs` guard still globs this record → green) |

**Do-not-weaken (SEC-14):** the wave changed only edge-function source + test guards + docs — **ZERO DB / migration /
RLS / advisor changes** — so the **security-advisor floor remains 15 → 15** (the same intentional set enumerated in
§5b/§6c). This is the SEC-14 "protections not weakened" proof, re-affirmed post-remediation.

**Review iterations:** R1 `02-REVIEW.md` (2 BLOCKER + 4 WARNING + 3 INFO — status now `resolved`) → R2
`02-REVIEW-R2.md` (all 8 prior findings RESOLVED at HEAD; 2 new R2 WARNINGs — residual `existingAnalysis.*`
sanitization + paddle-webhook happy-path PII logs — both fixed in `0dce0ed9` / `b7b86e3b`).

***

## Cross-References

- **`SECURITY-AUDIT.md`** — SEC-11 10-row disposition + severity rubric + 17-domain index this record rolls up.
- **`02-SECURITY.md`** — the ASVS-L1 threat register (T-02-01..08) + sign-off (`threats_open: 0`, `status: verified`).
- **`audit/CODE-EDGE-FINDINGS.md` (02-02)** · **`audit/DB-BILLING-WEBHOOK-FINDINGS.md` (02-03)** ·
  **`audit/ENV-SUPPLYCHAIN-ISOLATION-FINDINGS.md` (02-04)** — the three sweep docs (§3 consolidates them).
- **02-05 / 02-06 / 02-07 SUMMARY.md** — the remediation evidence (§4 commits, fail-before/pass-after).
- **`02-REVIEW.md` (R1) · `02-REVIEW-R2.md` (R2)** — the code-review gate + re-review that drove the §7 wave.
- **`02-09-SUMMARY.md`** — the gap-closure summary for the §7 code-review remediation wave.
- **`.planning/audit/RESIDUAL-REGISTER.md`** — the appended `Phase 2` Low-residual + pending-operator rows (§6).
- **`supabase/functions/deno.json`** `test:ci` — carries the 4 new deno guards (§4) + the 3 §7 wave guards.

*This record records names, line anchors, findings, classifications, test paths, and advisor counts only — no
secret VALUE is pasted anywhere in it. Project-refs and the preview functions host are identifiers, not secrets.*

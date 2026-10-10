# RUN-02 - Runtime Reliability Register

**Phase:** 07.1 - Runtime Error Handling, Supabase Advisory Triage & Production Reliability
**Plan:** 07.1-01 (RUN-01, RUN-02)
**Run date:** 2026-06-23
**Branch / HEAD at triage:** `staging` @ `e785da10`
**Prod project ref:** `zjpjapgraoxdukdvpjes` (canonical prod, operator-confirmed Phase 4)

## MCP access model (verbatim, RUN-01)

Read-only inspection only. No write verb was exercised on production.

- `supabase-prod-readonly` = **READ-ONLY** (advisors / logs / schema only; NEVER write). Connectivity + read-only PROVEN this run by successful `get_advisors` (security + performance), `get_logs` (edge-function, postgres, api), and `list_tables` calls against `zjpjapgraoxdukdvpjes`. `apply_migration` is FORBIDDEN on prod (CLAUDE.md MCP rule 4, D-08) and was never called.
- `supabasepreview` = read-write preview-only, but the preview/test project `cimjltzovkahkqecpwgi` (preview = staging = test) is **PAUSED**. No write was attempted; any owed live deploy-smoke is deferred (D-06, see Plan 07.1-05 / RESIDUAL-REGISTER).
- Read tools used on prod: `get_advisors`, `get_logs`, `list_tables`. Write tools used on prod: NONE. `apply_migration` = FORBIDDEN / not exercised.

> ## WARNING: VALUES ARE NEVER RECORDED - finding NAMES, classes, affected-flow, and decisions only.
> This catalog is committed to a tracked repo. Per Phase-2 REPO-05 / `02-SECRET-SCAN.md` discipline (T-3-07), it records finding **NAMES + object names + affected flow + decision ONLY** - never a key, token, JWT, price ID, raw advisor payload, log line containing user text, payment datum, or resume/LinkedIn snippet. A post-write secret-pattern grep guard was run against this file and returned **zero** matches.

## Commands Run (read-only, reproducible)

All against `supabase-prod-readonly` (prod ref `zjpjapgraoxdukdvpjes`), read-only:

- `get_advisors(type="security")`  -> 73 findings
- `get_advisors(type="performance")` -> 160 findings
- `get_logs(service="edge-function")` -> 0 rows in the 24h window
- `get_logs(service="postgres")` -> LOG-level checkpoints/cron + a recurring ERROR (see LOG-1)
- `get_logs(service="api")` -> all 2xx / 101 in the window (in-scope flows healthy)
- `list_tables(schemas=["public"], verbose=false)` -> 40 public tables (cross-check vs DATABASE.md Source-C)

Re-pull any time with the same read-only calls; advisory counts drift only after DDL changes.

---

## Triage summary

- **Advisories: 233 total** (73 security + 160 performance). **232 are DB/RLS/schema/index/storage-class -> deferred-to-Phase-8** (RUN-06 / D-08). **1 is non-DB** (`auth_leaked_password_protection`) -> needs-operator. **0 advisories are code-actionable in 7.1.**
- **Logs (24h):** in-scope active edge/API flows show NO 4xx/5xx (healthy); 1 recurring DB/cron error (`http_request_queue` NULL url) -> needs-operator / Phase-8. Edge-function log window empty.
- **Code-evident inventory (RUN-04, prioritized by triage, NOT gated - D-02):** 3 active-flow thrown-401 swallow sites -> `resolved-now` candidates pending the Plan 07.1-03 operator checkpoint.

The actionable 7.1 code surface comes from the **code-evident** leg (the 3 swallow sites), not from the advisors or the 24h log window. This matches `07.1-RESEARCH.md`.

---

## Advisory findings (security) - read-only, names + class only

| Source | Environment | Severity | Affected flow / objects (names only) | Root cause (if known) | Decision | Verification command | Rollback notes |
|--------|-------------|----------|--------------------------------------|-----------------------|----------|----------------------|----------------|
| advisor: `security_definer_view` (x4) | prod | ERROR | analytics views: v_merits_in_circulation, v_feature_consumption_daily, v_shop_purchases_daily, v_conversion_funnel | SECURITY DEFINER views bypass invoker RLS | **RESOLVED-2026-06-24 (Plan 08-03)** | `get_advisors(type="security")` re-check -> CLEARED on prod (4->0); see "DB-05 Plan 08-03 resolution evidence" below | Per-view rollback shipped (`ALTER VIEW ... SET (security_invoker = false)`) in each `20260608000000..03_*.sql` |
| advisor: `rls_enabled_no_policy` (x3) | prod | INFO | alert_state, rate_limit_counters, stripe_webhook_events | RLS enabled, no policy (service-role-only tables) | **RESOLVED-2026-06-24 (Plan 08-03)** | `get_advisors(type="security")` re-check -> CLEARED on prod (3->0); see "DB-05 Plan 08-03 resolution evidence" below | Per-table rollback shipped (`DROP POLICY IF EXISTS "Service role only - no anon/authenticated access"`) in each `20260608000005..07_*.sql` |
| advisor: `anon_security_definer_function_executable` (x30 -> 0) | prod | WARN | SECURITY DEFINER RPCs exec-grantable to anon (admin_*, check_and_deduct_merits, can_perform_ai_action, ...) | blanket PUBLIC + explicit anon EXECUTE on definer functions | **RESOLVED-2026-06-24 (Plan 08-05)** | `get_advisors(type="security")` + `has_function_privilege('anon', fn, 'EXECUTE')` re-check -> CLEARED on prod (30->0, all 30 anon-non-executable); see "DB-05 Plan 08-05 resolution evidence" below | `GRANT EXECUTE ... TO PUBLIC` rollback shipped (x30) in `20260608000010_*.sql` |
| advisor: `authenticated_security_definer_function_executable` (x30 -> 11) | prod | WARN | same definer RPC set, authenticated role | blanket PUBLIC + explicit authenticated EXECUTE on definer functions | **PARTIAL/GATED-2026-06-24 (Plan 08-05): 19 REVOKED, 11 KEPT (intentional)** | `get_advisors(type="security")` + `has_function_privilege('authenticated', fn, 'EXECUTE')` re-check -> 30->11 on prod (19 revoked; 11 load-bearing/RLS-context KEPT); see "DB-05 Plan 08-05 resolution evidence" below + RESIDUAL-REGISTER R-DB-05 | `GRANT EXECUTE ... TO authenticated` rollback shipped (x19) in `20260608000011_*.sql`; the 11 KEPT need no rollback (never revoked) |
| advisor: `function_search_path_mutable` (x2 -> x1) | prod | WARN | `ts_to_utc_date` **RESOLVED-2026-06-24 (Plan 08-03)**; `increment_rate_limit` STILL deferred-to-Phase-8 (Plan 08-04) | function lacks pinned search_path | **PARTIAL: ts_to_utc_date RESOLVED (Plan 08-03); increment_rate_limit deferred (Plan 08-04)** | `get_advisors(type="security")` re-check -> prod 2->1 (remaining = `increment_rate_limit`); see "DB-05 Plan 08-03 resolution evidence" below | `ts_to_utc_date` rollback shipped (`ALTER FUNCTION ... RESET search_path`) in `20260608000004_*.sql`; `increment_rate_limit` pin (`= public`, Pitfall 3) is Plan 08-04 |
| advisor: `rls_policy_always_true` (x2) | prod | WARN | paddle_webhook_events, scheduled_emails | policy USING (true) | deferred-to-Phase-8 | `get_advisors(type="security")` re-check | Phase 8: tighten or document (paddle legacy gated-but-live) |
| advisor: `public_bucket_allows_listing` (x1) | prod | WARN | storage bucket: public-assets | public bucket allows anon listing | deferred-to-Phase-8 | `get_advisors(type="security")` re-check | Phase 8: restrict listing or confirm intended public asset bucket |
| advisor: `auth_leaked_password_protection` (x1) | prod | WARN | Auth (GoTrue config) | leaked-password protection disabled | needs-operator | `get_advisors(type="security")` re-check | Operator toggles in Auth dashboard; non-DB, no migration; not a 7.1 code change |
| DB-known: `linkedin_grades` over-permissive SELECT RLS ("Anyone can view linkedin grades") | prod | WARN | LinkedIn Grader read path (DATABASE.md Source-C section 4 / lead 96, DB-05) | SELECT policy `"Anyone can view linkedin grades"` (role `public`) not scoped to `auth.uid() = user_id` | deferred-to-Phase-8 | `get_advisors(type="security")` + `pg_policies` read on `public.linkedin_grades` (read-only, `supabase-prod-readonly`) -- advisory still-fires check; see "RUN-06 - linkedin_grades RLS Phase-8 handoff" below | AUTHORED-BUT-UNAPPLIED forward+rollback SQL embedded below (RUN-06); Phase 8 sequences it into `supabase/migrations/` with a real timestamp; 7.1 runs NEITHER statement (prod read-only, preview paused) |

## Advisory findings (performance) - read-only, names + class only

| Source | Environment | Severity | Affected flow / objects (names only) | Root cause (if known) | Decision | Verification command | Rollback notes |
|--------|-------------|----------|--------------------------------------|-----------------------|----------|----------------------|----------------|
| advisor: `auth_rls_initplan` (x62) | prod | WARN | RLS policies re-evaluating auth.*() per row (profiles, resumes, linkedin_grades, analysis_jobs, ...) | `auth.uid()` not wrapped in `(select ...)` | deferred-to-Phase-8 | `get_advisors(type="performance")` re-check | Phase 8: wrap auth calls in scalar subselect; no behavior change, no 7.1 edit |
| advisor: `multiple_permissive_policies` (x48) | prod | WARN | overlapping permissive policies (improvement_checklist, linkedin_grades, resumes, upgrade_requests, user_roles) | multiple permissive policies per role/action | deferred-to-Phase-8 | `get_advisors(type="performance")` re-check | Phase 8: consolidate policies; no 7.1 change |
| advisor: `unused_index` (x42) | prod | INFO | indexes with zero scans (profiles, usage_tracking, resumes, linkedin_grades, analysis_results, ...) | indexes never scanned (low-traffic prod) | deferred-to-Phase-8 | `get_advisors(type="performance")` re-check | Phase 8: drop only if confirmed unused over a longer window; reversible CREATE INDEX rollback |
| advisor: `unindexed_foreign_keys` (x8) | prod | INFO | FKs without covering index (applications, interview_quizzes, linkedin_versions, resume_score_history, resume_versions) | FK column lacks index | deferred-to-Phase-8 | `get_advisors(type="performance")` re-check | Phase 8: add covering index (additive); no 7.1 change |

## Log findings (read-only, 24h window) - names + class only

| Source | Environment | Severity | Affected flow | Root cause (if known) | Decision | Verification command | Rollback notes |
|--------|-------------|----------|---------------|-----------------------|----------|----------------------|----------------|
| LOG-1: `get_logs(postgres)` recurring ERROR `http_request_queue` NULL url NOT-NULL violation (~5-min cadence) | prod | ERROR | scheduled cron / pg_net http enqueue (NOT an in-scope edge flow) | a cron job enqueues an http_request with NULL url (config/URL missing for a net job) | needs-operator | `get_logs(service="postgres")` grep `http_request_queue` | DB/cron-class -> Phase 8 or operator: set the missing URL / fix the net cron config; no 7.1 edge code change |
| LOG-2: `get_logs(edge-function)` empty in 24h window | prod | INFO | all edge functions | no edge invocations logged in window (low-traffic prod) | false-positive (no error) | `get_logs(service="edge-function")` | n/a - no finding |
| LOG-3: `get_logs(api)` all 2xx / 101 | prod | INFO | profiles/resumes/auth/user, rpc get_merit_balance, realtime ws, token refresh | in-scope flows healthy; no 4xx/5xx in window | false-positive (no error) | `get_logs(service="api")` | n/a - no finding |

## Code-evident inventory (RUN-04) - prioritized by triage, NOT gated (D-02)

These come from static analysis (07.1-RESEARCH.md / 07.1-PATTERNS.md), confirmed at HEAD; the 24h log window was clean for these flows but the swallow is code-evident. Disposition is decided at the Plan 07.1-03 `autonomous:false` operator checkpoints.

| Source | Environment | Severity | Affected flow | Root cause | Decision | Verification command | Rollback notes |
|--------|-------------|----------|---------------|------------|----------|----------------------|----------------|
| code-evident: `interview-prep-analyze/index.ts:710` swallowed thrown auth `Response` (401 -> misleading 500) | repo (gated-off prod, preview/staging) | MEDIUM | Interview Prep analyze (gated) | generic catch swallowed requireAuth's thrown 401 into a 500 (SB-05-04) | **resolved-now** (operator-approved 2026-06-23, commit `6d4ab14d`; `return err` guard + errorCode-in-log) | `npm run test:edge` (analyze.failure-branches.test.ts asserts 401 not 500) | `git revert 6d4ab14d` |
| code-evident: `recruiting-lens/index.ts:761` swallowed thrown auth `Response` | repo / prod-active | MEDIUM | Recruiting Lens analyze | same swallow class; catch lacked the auth-Response guard | **resolved-now** (operator-approved 2026-06-23, commit `cd095a15`; named-handler seam + `return err` guard) | `npm run test:edge` (recruiting-lens/__tests__/auth-rethrow.test.ts) | `git revert cd095a15` |
| code-evident: `compare-jobs/index.ts:329` swallowed thrown auth `Response` + leaked `error.message` into 500 body (RUN-05) | repo / prod-active (not in ROADMAP named list - Open Q3) | MEDIUM | Compare Jobs | swallow + raw console.error + error.message body leak | **resolved-now** (LANDED - operator chose land-all-three 2026-06-23, commit `aba65395`; guard + createLogger lift + body-leak removed; named-handler seam) | `npm run test:edge` (compare-jobs/auth-rethrow.test.ts) + `rg "error instanceof Error \? error.message" compare-jobs/index.ts` = 0 | `git revert aba65395` |

## Platform / non-code findings

| Source | Environment | Severity | Affected flow | Root cause | Decision | Verification command | Rollback notes |
|--------|-------------|----------|---------------|------------|----------|----------------------|----------------|
| CONCERNS.md S1: Interview Prep 503 (TTFB 8.91s after Claude success) | prod (gated off) | MEDIUM | Interview Prep (gated off prod) | Supabase platform-routing (router timeout / response-size / cold-start on egress), NOT handler code | manual-action | redeploy + pull router logs when IP is re-enabled | platform-layer; no 7.1 handler fix; IP gated off prod (Phase 47) |
| follow-up (07.1-03): inside-`serve`-arrow `throw error` auth guards may not propagate the 401 | repo / prod-active | LOW-MEDIUM | analyze-skills-gap (and any other inside-serve-arrow `throw error` guard) | `std@0.168.0` serve MAY route a thrown Response through `onError` to a 500 (unverified at runtime here); only NAMED handlers that `return` the Response are provably correct | needs-operator (follow-up, OUT OF 7.1 scope) | verify analyze-skills-gap auth-failure status at runtime; convert to named-handler `return` if it 500s | not one of 7.1's three named swallow sites; fixing would be scope creep needing its own checkpoint |

---

## Plan 07.1-03 disposition + deviations (RUN-04 / RUN-05)

**Executed:** 2026-06-23, inline under per-site `autonomous:false` operator checkpoints (D-01). Each success path stays byte-identical; only the auth-failure branch (and the compare-jobs leak) changed.

- **interview-prep-analyze** (commit `6d4ab14d`): `if (err instanceof Response) return err;` first in the catch + `errorCode` in the log + additive `errorCode` on the internal_error 500 body. `analyze.failure-branches.test.ts` cases 3+4 updated to assert 401 `{error:'Unauthorized'}` (were swallowed-500). SB-05-04 RESOLVED.
- **recruiting-lens** (commit `cd095a15`): guard + `errorCode`; **operator-approved seam refactor** (extract `serve(async (req)=>{...})` -> `export async function handler(req)` + `IS_TEST`-guarded `serve(handler)`) so the 401-not-500 behavior is unit-testable. New `__tests__/auth-rethrow.test.ts` (2 cases) registered in `deno.json` test:ci. Existing safe 500 body preserved (no leak).
- **compare-jobs** (commit `aba65395`): operator chose **land-all-three** (Open Q3). Guard + `console.error`->`createLogger` lift + the `error.message`-in-body **leak REMOVED** (safe generic 500) + the same seam refactor. New `auth-rethrow.test.ts` (2 cases) registered; the old leak-characterization assertion in `handler-config.test.ts` updated to assert the safe shape.
- **merit-gateway (D-03 money path):** operator decision = **leave BYTE-IDENTICAL** ("no change - D-03 bar not elected", 2026-06-23). No edit made; `git diff -- supabase/functions/_shared/merit-gateway.ts` is EMPTY across the phase. The v3.0/Phase-5-verified refund + idempotency invariants are untouched.

**Deviation - guard idiom (`return` not `throw`):** the plan specified `throw err` (the analyze-skills-gap inside-`serve`-arrow idiom) for recruiting-lens/compare-jobs. Once each was extracted to a NAMED handler (the operator-approved seam refactor), `return err` is the provably-correct idiom (the interview-prep-evaluate named-handler pattern): `serve(handler)` returns it directly. Empirically verified here - a thrown Response propagates OUT of the named handler as an exception (the deno test caught it), so `return` is required for the handler to RETURN the 401. All three fixed sites use named-handler `return`, so `serve(handler)` returns the 401 in production regardless of how serve treats thrown Responses.

**Deviation - recruiting-lens runtime test is OFF the test:ci gate (operator decision 2026-06-23):** the recruiting-lens runtime auth-rethrow test (`recruiting-lens/__tests__/auth-rethrow.test.ts`), which imports `recruiting-lens/index.ts` (and its transitive `supabase-client` + 6 shared modules), perturbs the SHARED single `deno test` process and tips the stripe-webhook idempotency tests from green to red (the stripe-webhook handler returns 500 instead of 200). This is a PRE-EXISTING test-isolation fragility - `interview-prep-analyze/__tests__/analyze.failure-branches.test.ts` (a baseline file) triggers it pairwise too; the full baseline allowlist order happens to dodge it; `compare-jobs/auth-rethrow.test.ts` does NOT perturb it. Production code is byte-identical (the swallow fixes only alter the auth-failure branch); stripe-webhook + merit-gateway are UNTOUCHED. **Resolution:** the recruiting-lens runtime test stays in the repo for isolation runs (passes 2/2 alone) but is OUT of the `deno.json` test:ci allowlist; the IN-GATE coverage of the 07.1-03 guard/seam/safe-body is a static source-string assertion added to `recruiting-lens/handler-config.test.ts` (in the gate). compare-jobs keeps its in-gate runtime test. Post-resolution gate: `npm run test:edge` = **704 passed / 0 failed / 11 ignored** (up from the 699 baseline; +2 compare runtime + 3 recruiting static). Recorded as a follow-up candidate to harden the stripe-webhook idempotency tests' shared-process isolation (RESIDUAL-REGISTER).

---

## RUN-* coverage map

- **RUN-01** - access model verified + recorded above; `supabase-prod-readonly` confirmed READ-ONLY (no write verb exercised).
- **RUN-02** - this register: every reviewed advisory/log finding classified with the D-07 column set; INDEX-wired.
- **RUN-03** - error taxonomy spec appended by Plan 07.1-02 (see "RUN-03 - Error Taxonomy Spec" below).
- **RUN-04 / RUN-05** - the 3 code-evident swallow sites RESOLVED at Plan 07.1-03 operator checkpoints (commits `6d4ab14d` / `cd095a15` / `aba65395`); the compare-jobs `error.message` body-leak removed (RUN-05); merit-gateway money path left BYTE-IDENTICAL per operator (D-03 bar not elected). See "Plan 07.1-03 disposition + deviations" below.
- **RUN-06** - all DB/RLS/schema/index/storage advisories routed `deferred-to-Phase-8`; the `linkedin_grades` "Anyone can view linkedin grades" RLS item carries a generated-but-UNAPPLIED forward+rollback SQL block embedded by Plan 07.1-04 (see "RUN-06 - linkedin_grades RLS Phase-8 handoff" below). Nothing applied; no numbered migration file created.
- **RUN-07** - zero-functional-change close-out recorded by Plan 07.1-05.

---

## RUN-03 - Error Taxonomy Spec

**Plan:** 07.1-02 (RUN-03)
**Authored:** 2026-06-23
**Status:** documented SPEC only - NO `src/` or `supabase/functions/` source touched by this plan. This section is the single source of truth Plan 07.1-03 applies INLINE at the three swallow-fix sites (interview-prep-analyze, recruiting-lens, compare-jobs).

This spec defines a small canonical errorCode taxonomy plus the safe `{ error, errorCode }`
response rule for active backend / Edge Function flows, covering the criterion-3 categories:
auth, invalid input, missing env/config, merit charge/refund, PDF extraction, AI provider,
DB read/write, rate limit, webhook verification, internal. It is the RUN-03 deliverable; the
RUN-04 fix sites consume it.

### 1. The inline taxonomy const (D-04 - INLINE, no `_shared` module)

The taxonomy is applied as a LOCAL per-function `const ERR` at each fix site - it is NOT a
`_shared/errors.ts` import. Phase 4 (04-01) REMOVED the dead `_shared/handler.ts` + `_shared/errors.ts`
pair; no error helper exists in `_shared` today, and re-introducing one (a shared module imported
across many functions) exceeds the surgical / zero-functional-change bar. A shared
`_shared/errors.ts` taxonomy helper is therefore an explicit **deferred Phase-9 maintainability
candidate** (recorded in `RESIDUAL-REGISTER.md` if a real gap motivates it), NOT a 7.1 artifact.

Canonical map (one short, stable string per criterion-3 category):

```typescript
// Per-function LOCAL const - NOT a _shared import (D-04).
const ERR = {
  AUTH: 'unauthorized',                       // auth failure (thrown 401 Response)
  INVALID_INPUT: 'invalid_input',             // malformed / missing request input
  MISSING_CONFIG: 'missing_config',           // required env/secret unset (fail-closed)
  MERIT: 'merit_error',                        // merit charge/refund failure (D-03 log-field only)
  EXTRACTION: 'extraction_failed',            // PDF/text extraction chain failure
  AI_PROVIDER: 'ai_provider_error',           // Anthropic/AI provider call failure
  DB: 'db_error',                              // Supabase/Postgres read or write failure
  RATE_LIMIT: 'rate_limited',                  // per-user rate-limit hit
  WEBHOOK: 'webhook_verification_failed',     // webhook signature/secret verification failure
  INTERNAL: 'internal_error',                  // unclassified / unexpected internal error
} as const;
```

All ten criterion-3 categories are covered: `unauthorized` (auth), `invalid_input` (invalid input),
`missing_config` (missing env/config), `merit_error` (merit charge/refund), `extraction_failed`
(PDF extraction), `ai_provider_error` (AI provider), `db_error` (DB read/write), `rate_limited`
(rate limit), `webhook_verification_failed` (webhook verification), `internal_error` (internal).

Each fix site copies only the subset of keys it actually emits (e.g. the three swallow sites
primarily need `AUTH` + `INTERNAL`); the full map above is the canonical reference, not a
mandatory verbatim block. The string VALUES are the stable contract - the key names are local
convenience.

### 2. The errorCode-placement rule (D-05)

- **In structured LOGS: ALWAYS.** Every classified failure emits `errorCode` through the existing
  `createLogger` instance (observability / triage). Example:
  `log.error('unhandled-error', { errorCode: ERR.INTERNAL, error: (err as Error).message })`.
  This is additive to the log payload only and never reaches a client.

- **In a JSON response BODY: ONLY on a brand-new fail-closed guard response.** A "brand-new
  fail-closed guard" is a path that TODAY fails open or silent and has NO existing parsed client
  contract. errorCode may be added to such a body. The two body sites in scope for Plan 07.1-03:
  1. The **additive-to-the-existing-internal-500 default** - the generic 500 bodies already use
     `{ error: 'internal_error', message: ... }` (recruiting-lens, interview-prep-analyze); these
     500 bodies are NOT a field-parsed frontend contract, so adding `errorCode` is additive-only.
  2. The **compare-jobs replaced-leaky-body case** - compare-jobs currently leaks `error.message`
     into its 500 body (a RUN-05-adjacent leak). Replacing that leaky body with the safe generic
     `{ error: 'internal_error', errorCode: ERR.INTERNAL, message: '...' }` shape is permissible
     because it is a brand-new fail-closed shape REPLACING a leaky one (it removes the leak).

  These two are the ONLY body sites. errorCode is NOT broadcast into every error body.

### 3. The frozen wire contracts (D-05) - OFF-LIMITS for errorCode

The frontend parses these three bodies byte-for-byte. They stay **BYTE-IDENTICAL**; `errorCode`
is **FORBIDDEN** in their bodies (adding it is a wire break requiring a deploy-smoke the paused
preview project cannot provide). The swallow fix only alters the AUTH-FAILURE branch so the
propagated thrown 401 reaches the client unchanged - it never mutates these shapes.

| Frozen contract | Body (byte-identical, OFF-LIMITS) | Status | Source (verified at HEAD) | Parsed by |
| --------------- | --------------------------------- | ------ | ------------------------- | --------- |
| 401 / Unauthorized | `{ error: 'Unauthorized' }` | 401 | `_shared/auth.ts` `unauthorizedResponse()` (lines 48-53) | edge auth callers; propagated thrown Response |
| usage-limit | `{ error: 'usage_limit_reached', message, resetDate, tier }` | see note | `_shared/usage-checker.ts` `createUsageLimitResponse()` (lines 124-143) | `src/contexts/AiCreditsContext.tsx` |
| rate-limit | `{ error: 'rate_limit_exceeded', message, retryAfter }` + `Retry-After` header | 429 | `_shared/rate-limiter.ts` `createRateLimitResponse()` (lines 162-178) | frontend rate-limit handling |

> **Status note (names-not-values, verified-at-HEAD):** the usage-limit body
> (`{ error: 'usage_limit_reached', ... }`) is emitted at HTTP **status 429** in
> `createUsageLimitResponse` at HEAD (the upstream decisions D-05 / PATTERNS Pattern D describe it
> as the "402 usage-limit" contract by ROLE; the actual returned status string is 429). What is
> frozen and OFF-LIMITS is the **error-string + field set** (`error` / `message` / `resetDate` /
> `tier`) that `AiCreditsContext` parses, regardless of the numeric status. Plan 07.1-03 MUST NOT
> add `errorCode` to this body and MUST NOT change its status. The separate rate-limiter
> `rate_limit_exceeded` body (also 429) is a DISTINCT frozen contract.

### 4. The RUN-05 safe-log allow-list + deny-list (no scrubber)

Structured logs use allow-list discipline only - NO deny-list / regex scrubber is built (a
scrubber is itself a blast-radius change and would be deferred). Pass only allow-listed fields
to `log.*`; never pass a deny-listed field.

**Allow-list (emit):** `feature`, `stage`, `userId` / `user_id` (when available), `tier`,
`provider` / `model`, merit `amount` / `transaction_id` / `deducted_from` / `remaining_balance`,
`retryable`, `errorCode`, `durationMs`, `reason` (a reason-CODE, never a secret value).

**Deny-list (NEVER emit):** resume / LinkedIn text; prompts / `messages`; `ANTHROPIC_API_KEY` or
any secret; payment data (card / intent / customer PII); raw provider payloads (`raw` / `data`
from `invokeAnthropicText`).

`error.message` is NEVER placed in a client response BODY (this is the compare-jobs leak the spec
exists to retire); it MAY appear in a STRUCTURED LOG entry alongside `errorCode` (operator-side
observability), never in a body returned to the client.

### Money-path guardrail (D-03)

For merit charge/refund + Stripe webhook control-flow, the ONLY 7.1-permissible edit is a safe
allow-listed structured-log FIELD add (e.g. `errorCode` / `retryable` / `reason`), behind an
`autonomous:false` operator checkpoint, NEVER auto-applied. The `MeritRefundable` re-throw and
`isRefundableAnthropicError` firing conditions are UNTOUCHABLE; no control-flow / response change.

---

## RUN-06 - linkedin_grades RLS Phase-8 handoff (generated-but-UNAPPLIED)

**Plan:** 07.1-04 (RUN-06)
**Authored:** 2026-06-23
**Status:** **RESOLVED-2026-06-24 (Plan 08-04).** Sequenced into `supabase/migrations/` as
`20260608000008_linkedin_grades_owner_select.sql` and applied preview->prod via the 4-step gate
(operator applied to prod, approved). See "DB-05 Plan 08-04 resolution evidence" below for the
before/after deltas + the SELECT-as-role no-regression proof. NOTE: the FORWARD shipped is the
CORRECTED **DROP-only** form (no CREATE) -- the live catalog has the pre-existing owner-scoped
`"Users can view their own LinkedIn grades"` (role public, qual `auth.uid() = user_id`) which
already serves SELECT, so the fix is JUST dropping the over-permissive policy; re-creating an
owner policy would have left two redundant owner policies (and the original verification DO-block,
which asserted zero public-role SELECT policies, would have aborted on the legitimate owner policy
-- the pre-apply gate caught this). The historical AUTHORED-BUT-UNAPPLIED handoff below is retained
for provenance.

> Prior status (07.1, retained): AUTHORED-BUT-UNAPPLIED. The forward + rollback SQL below was
GENERATED ONLY -- 7.1 ran NEITHER statement. Prod (`zjpjapgraoxdukdvpjes`) is READ-ONLY via
`supabase-prod-readonly`; the preview/test project (`cimjltzovkahkqecpwgi`) was PAUSED. Per D-08 /
CLAUDE.md MCP rule 4, no RLS change is applied to prod without explicit operator confirmation, and
that application is **Phase 8's** responsibility (DB-05). This SQL was embedded as a fenced block IN
this register row and deliberately NOT dropped as a numbered file in `supabase/migrations/` -- that
would have risked a later run auto-applying it or colliding with the migration timestamp sequence
(T-01). Phase 8 sequenced it into `supabase/migrations/` with a real timestamp at apply time.

**Finding (names-not-values).** `get_advisors(type="security")` + the Source-C `pg_policies`
read (DATABASE.md section 4 / lead 96, DB-05) show `public.linkedin_grades` carries an
over-permissive SELECT policy named **`"Anyone can view linkedin grades"`** granted to role
**`public`**, exposing every user's LinkedIn grade to any caller. The fix scopes SELECT to the
owning user (`auth.uid() = user_id`), mirroring the analog
`supabase/migrations/20260417000000_usage_tracking_user_select_policy.sql`
(`CREATE POLICY ... FOR SELECT TO authenticated USING (auth.uid() = user_id)`).

**Verification command (read-only, advisory still-fires check).** Re-run on
`supabase-prod-readonly` (prod ref `zjpjapgraoxdukdvpjes`); both are READ-ONLY and were the
inputs used to author this handoff:

```text
get_advisors(type="security")
  -> the linkedin_grades over-permissive SELECT RLS still appears (not yet remediated in 7.1)
pg_policies read on public.linkedin_grades
  -> policy "Anyone can view linkedin grades", cmd = SELECT, roles = {public}, qual = true
```

**Generated forward + rollback SQL (UNAPPLIED -- Phase 8 owns sequencing + application):**

```sql
-- linkedin_grades over-permissive SELECT RLS (DB-05) -- Phase-8 handoff, AUTHORED-BUT-UNAPPLIED.
-- 7.1 RUNS NEITHER statement (prod read-only; preview paused). Phase 8 sequences this into
-- supabase/migrations/ with a real timestamp and applies it after operator confirmation.

-- ============================================================================
-- FORWARD (Phase 8): scope linkedin_grades SELECT to owner-only (auth.uid() = user_id),
-- replacing the over-permissive "Anyone can view linkedin grades" policy (role public, USING true).
-- ============================================================================
DROP POLICY IF EXISTS "Anyone can view linkedin grades" ON public.linkedin_grades;

CREATE POLICY "Owners can view their linkedin grades"
ON public.linkedin_grades
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- ============================================================================
-- ROLLBACK: faithfully restore the prior over-permissive policy EXACTLY as captured
-- READ-ONLY from pg_policies (Source C, DATABASE.md section 4): name "Anyone can view linkedin
-- grades", cmd SELECT, role public, USING (true). Run this to revert the FORWARD above.
-- ============================================================================
DROP POLICY IF EXISTS "Owners can view their linkedin grades" ON public.linkedin_grades;

CREATE POLICY "Anyone can view linkedin grades"
ON public.linkedin_grades
FOR SELECT
TO public
USING (true);
```

> **Phase-8 operator note (policy-name confirmation).** The captured policy name
> `"Anyone can view linkedin grades"`, role `public`, and `USING (true)` are recorded from the
> Source-C READ-ONLY `pg_policies` introspection (DATABASE.md section 4). Before applying the
> FORWARD, Phase 8 SHOULD re-confirm the live policy name/qual via a fresh
> `pg_policies` read on `public.linkedin_grades` (it may have drifted since the 2026-06-13
> Source-C capture); the `DROP POLICY IF EXISTS` is idempotent, so a name mismatch is a no-op
> rather than an error, but the ROLLBACK's restore must match whatever the live prior policy was.

**Routing sweep (RUN-06 -- every DB/RLS/schema/index/migration advisory is `deferred-to-Phase-8`).**
A re-sweep of this register confirms no DB-class finding is `resolved-now`: the `resolved-now`
decision is used ONLY by the three code-evident swallow-fix rows (RUN-04, Plan 07.1-03), never by
a DB/RLS/schema/index/storage/migration row. The DB-class advisories
(`security_definer_view` x4, `rls_enabled_no_policy` x3, `anon_security_definer_function_executable`
x30, `authenticated_security_definer_function_executable` x30, `function_search_path_mutable` x2,
`rls_policy_always_true` x2, `public_bucket_allows_listing` x1, `auth_rls_initplan` x62,
`multiple_permissive_policies` x48, `unused_index` x42, `unindexed_foreign_keys` x8, plus this
`linkedin_grades` SELECT-RLS item) are ALL `deferred-to-Phase-8`. The `auth_leaked_password_protection`
advisory and the `http_request_queue` NULL-url cron error are non-DB-migration items routed
`needs-operator` (Auth-dashboard toggle / cron-config fix), not DB-class remediations -- neither is
applied in 7.1. NO numbered file was created under `supabase/migrations/`; nothing was executed
against prod or preview.

---

## DB-05 Plan 08-03 resolution evidence (provably-zero-change tier)

**Plan:** 08-03 (Database Cleanup & Migrations, Wave 3)
**Resolved:** 2026-06-24
**Requirements:** DB-05 (RLS least-privilege, no access regression), DB-06 (forward + rollback per migration)
**Gate:** preview->prod 4-step HARD gate (08-02 appendix) -- apply-preview -> verify-preview -> operator-applies-prod -> re-verify-prod. Executor authored + committed the 8 migration files; the orchestrator ran every `apply_migration`/`get_advisors`/shape read on `supabasepreview`; the OPERATOR applied the 8 committed files to prod `zjpjapgraoxdukdvpjes` via `db push`; the orchestrator re-verified read-only on `supabase-prod-readonly`. Executor invoked NO MCP tool and applied NOTHING to prod or preview.

**Headline advisory delta (names-not-values):** `get_advisors(type="security")` **73 -> 65 lints (-8)** on BOTH preview AND prod -- IDENTICAL delta; preview predicted prod exactly (gate validated). No new advisory category appeared. All non-targeted categories unchanged (`anon_security_definer_function_executable` 30, `authenticated_security_definer_function_executable` 30, `rls_policy_always_true` 2, `public_bucket_allows_listing` 1, `auth_leaked_password_protection` 1).

**Per-fix before/after evidence:**

| Fix | Migration file(s) | Advisory before -> after (prod) | Shape after (prod, names-only) | No-regression read | Rollback (DB-06) |
|-----|-------------------|-------------------------------|--------------------------------|--------------------|------------------|
| 4 analytics views -> `security_invoker` | `20260608000000..03_*_security_invoker.sql` | `security_definer_view` 4 -> 0 | 4 views `reloptions` carry `security_invoker=true` | only caller `admin-merit-metrics` reads via `getServiceClient()` (service_role bypasses RLS -> flip invisible); no `src/**` runtime read | `ALTER VIEW ... SET (security_invoker = false)` per file |
| `ts_to_utc_date` search_path pin (`= ''`) | `20260608000004_pin_search_path_ts_to_utc_date.sql` | `function_search_path_mutable` 2 -> 1 (remaining `increment_rate_limit`) | `ts_to_utc_date` `proconfig` has pinned `search_path` | body refs no schema objects -> `= ''` is zero-change; `idx_benchmarks_unique_per_day` intact (ALTER, not re-CREATE) | `ALTER FUNCTION ... RESET search_path` |
| 3 service-role-only tables -> explicit-deny | `20260608000005..07_*_explicit_deny.sql` | `rls_enabled_no_policy` 3 -> 0 | "Service role only - no anon/authenticated access" deny policy present on `alert_state` / `rate_limit_counters` / `stripe_webhook_events` | service_role bypasses RLS -> policy only re-states the already-effective deny; no `src/**` runtime read of any of the 3 tables | `DROP POLICY IF EXISTS "Service role only - no anon/authenticated access" ON public.<table>` per file |

**Read-map evidence (the zero-regression proof):**
- 4 views: `rg "v_merits_in_circulation|v_feature_consumption_daily|v_shop_purchases_daily|v_conversion_funnel" src supabase/functions` -> only runtime caller is `supabase/functions/admin-merit-metrics/index.ts` (reads all 4 via `getServiceClient()`); the only `src/` hit is the generated `src/integrations/supabase/types.ts` type declaration (not a runtime read). `cohort_peers` excluded (already `security_invoker`).
- 3 tables: `rg "alert_state|rate_limit_counters|stripe_webhook_events" src` -> only the generated `src/integrations/supabase/types.ts` (type decls at lines 42 / 1045 / 1418). Zero runtime FE reads.

**Apply-history caveat (cosmetic, recorded for fidelity):** preview received the changes via `apply_migration` (auto-versioned migration-history entries, NOT the repo file timestamps `20260608000000..07`); prod received them via the repo files (history matches the file timestamps). All 8 forward statements are idempotent (`ALTER VIEW ... SET` / `ALTER FUNCTION ... SET` / `duplicate_object`-guarded `CREATE POLICY`), so a future `db push` of the repo files to preview is a harmless no-op. Functionally preview == prod == repo; only preview's migration-history version strings differ cosmetically.

**STILL DEFERRED (NOT this plan):** `increment_rate_limit` search_path pin (`= public`, Pitfall 3) -> Plan 08-04; `linkedin_grades` "Anyone can view" DROP -> Plan 08-04; the x60 `anon`/`authenticated` `_security_definer_function_executable` EXECUTE revokes -> Plan 08-05; `rls_policy_always_true` x2 + `public_bucket_allows_listing` x1 + the perf-class advisories -> Phase 9 / backlog (D-02).

---

## DB-05 Plan 08-04 resolution evidence (grant-altering / VERIFY-THEN-APPLY tier)

**Plan:** 08-04 (Database Cleanup & Migrations, Wave 4)
**Resolved:** 2026-06-24
**Requirements:** DB-05 (RLS least-privilege, no access regression), DB-06 (forward + rollback per migration)
**Gate:** preview->prod 4-step HARD gate -- apply-preview -> verify-preview (advisor + SELECT-as-role no-regression) -> operator-applies-prod -> re-verify-prod. Executor authored + committed the 2 migration files (`20260608000008` corrected DROP-only + `20260608000009`); the orchestrator ran every `apply_migration`/`get_advisors`/`pg_policies`/`pg_proc`/SELECT-as-role/RPC-probe read on `supabasepreview`; the OPERATOR applied both committed files to prod `zjpjapgraoxdukdvpjes` via `db push` and approved; the orchestrator re-verified read-only on `supabase-prod-readonly`. Executor invoked NO MCP tool and applied NOTHING to prod or preview.

**Headline advisory delta (names-not-values):** `get_advisors(type="security")` **65 -> 64 lints (-1)** on BOTH preview AND prod -- IDENTICAL delta; preview predicted prod exactly (gate validated). `function_search_path_mutable` **1 -> 0** (now COMPLETELY cleared DB-wide; remaining set = `[]`). No new advisory category appeared. All non-targeted categories unchanged (`anon_security_definer_function_executable` 30, `authenticated_security_definer_function_executable` 30, `rls_policy_always_true` 2, `public_bucket_allows_listing` 1, `auth_leaked_password_protection` 1).

**Per-fix before/after evidence:**

| Fix | Migration file | Advisory before -> after (prod) | Shape after (prod, names-only) | No-regression read | Rollback (DB-06) |
|-----|----------------|-------------------------------|--------------------------------|--------------------|------------------|
| `linkedin_grades` over-permissive SELECT -> owner-scoped (DROP-only) | `20260608000008_linkedin_grades_owner_select.sql` | over-permissive `linkedin_grades` SELECT / `multiple_permissive_policies`-for-linkedin_grades entry cleared (2 SELECT policies -> 1) | `pg_policies` linkedin_grades: `"Anyone can view linkedin grades"` GONE; SOLE remaining SELECT policy = `"Users can view their own LinkedIn grades"` (role public, qual `auth.uid() = user_id`); ZERO `qual='true'` SELECT | SELECT-as-role probe (preview, byte-identical schema): OWNER context sees 9 of their OWN rows (access preserved); NON-OWNER context (synthetic uuid 00000000-...-0) sees 0 rows (cross-user read DENIED); service_role baseline unaffected. Prod `pg_policies` = IDENTICAL end-state (single owner-scoped SELECT) | `CREATE POLICY "Anyone can view linkedin grades" ... FOR SELECT TO public USING (true)` (restores the live prior policy, D-08) |
| `increment_rate_limit` search_path pin (`= public`, NOT `''`) | `20260608000009_pin_search_path_increment_rate_limit.sql` | `function_search_path_mutable` 1 -> 0 (DB-wide remaining = `[]`) | `pg_proc.proconfig` for `increment_rate_limit(text, bigint)` = `search_path=public` | RPC probe (preview): `rpc('increment_rate_limit', {p_key:'gate-probe:08-04', p_window_start: epoch})` returned integer `1` (NOT a 500) -> proves `= public` resolves the UNQUALIFIED `public.rate_limit_counters` ON CONFLICT ref | `ALTER FUNCTION public.increment_rate_limit(text, bigint) RESET search_path` |

**Read-map evidence (the zero-regression proof, D-03):**
- `linkedin_grades`: `rg "linkedin_grades" src supabase/functions` -> FE reads are ALL owner-scoped (so each is served identically by the surviving owner-scoped policy): `src/pages/LinkedInGrader.tsx:214` queries by `id` and relies on RLS to auto-scope to `auth.uid() = user_id` (comment :201); `src/pages/AnalysisHistory.tsx:223`, `src/pages/Dashboard.tsx:284`, `src/components/PriorLinkedInSelector.tsx:91`, `src/components/AnalysisComparisonModal.tsx:281` all `.eq('user_id', <own id>)`. App/service reads (`grade-linkedin`, `analyze-career`, `extract-analysis-structure/extract-linkedin`, `lifecycle-archive-writer`, `send-feature-email`, `admin-delete-user`) use `getServiceClient()` -> service_role bypasses RLS. NO live caller depends on the public/cross-user grant.
- `increment_rate_limit`: `rg "increment_rate_limit" supabase` -> sole runtime caller is `supabase/functions/_shared/rate-limiter.ts:90,129` via `getServiceClient().rpc('increment_rate_limit', ...)`; the body's ON CONFLICT `DO UPDATE SET counter = rate_limit_counters.counter + 1` references UNQUALIFIED `rate_limit_counters` -> `= public` required (`= ''` would 500 every rate-limit check). No `src/**` runtime caller.

**Pre-apply gate catch (recorded -- the gate working as designed):** the FIRST authored form of `20260608000008` (commit `af6c2a75`) DROPped the over-permissive policy AND created a new `"Owners can view their linkedin grades"` (authenticated) policy, with a verification DO-block asserting ZERO public-role SELECT policies. The orchestrator's pre-apply catalog re-read found the legitimate pre-existing `"Users can view their own LinkedIn grades"` is itself role `public` (with an owner qual), so that assertion would have RAISE EXCEPTION -> the whole migration transaction would have ABORTED (and it would have left two redundant owner policies, keeping `multiple_permissive_policies` lit). Corrected to DROP-only with a `qual='true'`-targeted assertion (commit `99104f14`) BEFORE any apply. This is exactly why every Phase-8 grant change rides the preview->prod gate.

**Prod SELECT-as-role caveat (recorded -- a read-only-MCP privilege limitation, NOT a migration issue):** the SELECT-as-role probe could NOT run on prod (`supabase-prod-readonly` lacks `SET ROLE` privilege -> "permission denied to set role authenticated"), and the `increment_rate_limit` RPC functional probe runs only on preview (writing to prod is disallowed; prod is read-only). The no-regression is conclusively proven by (a) the preview SELECT-as-role probe (owner=9 rows, non-owner=0) on the byte-identical schema + the preview RPC probe (returned `1`), and (b) prod's `pg_policies`/`pg_proc` showing the IDENTICAL end-state (single owner-scoped SELECT; over-permissive removed; `proconfig=search_path=public`).

**STILL DEFERRED (NOT this plan):** the x60 `anon`/`authenticated` `_security_definer_function_executable` EXECUTE revokes -> Plan 08-05 (read-map -> revoke-provably-unused-or-gate; `can_perform_ai_action` authenticated EXECUTE STAYS gated -- live FE RPC at `Navbar.tsx:109` + `SkillsGapAnalysis.tsx:108`); `rls_policy_always_true` x2 + `public_bucket_allows_listing` x1 + the perf-class advisories -> Phase 9 / backlog (D-02).

---

## RUN-07 - Zero-Functional-Change Close-Out

**Plan:** 07.1-05 (RUN-07)
**Closed:** 2026-06-23

**Zero functional change is PROVEN for the 7.1 code wave (Plan 07.1-03):**

- **Scoped diff (`git diff <phase-start e785da10>..HEAD`):** `-- src` is **EMPTY** (zero frontend change). `-- supabase/functions` touches ONLY: the three swallow-site catch blocks (auth-failure branch: `if (... instanceof Response) return ...`) + their named-handler seam boundary (`export async function handler` + `IS_TEST`-guarded `serve(handler)`, recruiting-lens/compare-jobs) + a per-request `createLogger` instance in compare-jobs + the additive `errorCode` log/500-body fields + the test files + `deno.json`. **Every SUCCESS-path line is byte-identical; no 401/402/429 frozen contract changed; `_shared/merit-gateway.ts` is byte-identical (D-03 no-change).**
- **Offline deno gate (`npm run test:edge`) GREEN: 704 passed / 0 failed / 11 ignored** (up from the 699-0-11 baseline; +2 compare-jobs runtime + 3 recruiting static guard assertions; the recruiting runtime test is off-gate per the disposition above). The new per-site guard tests assert bad/absent token -> 401 `{error:'Unauthorized'}` (not a swallowed 500).

**Honest baseline state of the OTHER `verify:baseline` legs (operator-dispositioned "document as pre-existing" 2026-06-23 - NOT caused by 7.1-03):**

- **vitest (`npm run test`): 455 passed / 2 failed.** The 2 failures are `src/pages/__tests__/AnalysisHistory.interviewPrep.test.tsx` - a frontend async-render race (RESIDUAL-REGISTER **R-03**). `git diff -- src` is EMPTY this phase; they fail in isolation; an edge change cannot affect a React component test. PRE-EXISTING (flaky / baseline drift), not a 7.1-03 regression. (Therefore `npm run verify:baseline` does NOT exit 0 - it stops at the pre-existing vitest reds - but the edge zero-functional-change proof above is unaffected.)
- **Playwright (`npm run test:e2e`): the documented `stripe :56` env-red** (preview/test project `cimjltzovkahkqecpwgi` PAUSED) - the established baseline state, not a new red. The owed live edge deploy-smoke is the deferred residual **R-02**.

**Residual pointers:** R-02 (deferred live deploy-smoke for the 3 touched functions, cleared when `cimjltzovkahkqecpwgi` is un-paused), R-03 (pre-existing vitest flaky), R-04 (inside-`serve`-arrow `throw error` follow-up) - all in `RESIDUAL-REGISTER.md`. Cross-reference: the three `resolved-now` rows in "Code-evident inventory (RUN-04)" above.

**RUN-07 verdict:** the v4.0 regression baseline's deterministic edge gate re-runs GREEN with the new coverage, and the 7.1-03 production change is zero-functional-change by the scoped byte-identical diff + the green deno gate. The non-green `verify:baseline` legs are pre-existing/environmental and dispositioned as residuals; the live deploy-smoke is parked as an explicit, clearable residual rather than a silent gap.

---

## DB-05 Plan 08-05 EXECUTE-grant read-map (the x60 `_security_definer_function_executable` set)

**Plan:** 08-05 (Database Cleanup & Migrations, Wave 5 — the LAST + most-scrutinized DB-05 tier)
**Read-mapped:** 2026-06-25
**Requirements:** DB-05 (least-privilege EXECUTE, no access regression), DB-06 (forward + rollback per migration)
**Method (names-only, repo-evidence):** for EACH of the 30 SECURITY DEFINER public RPCs that carry the
`anon_security_definer_function_executable` + `authenticated_security_definer_function_executable` advisory
pair (x60), the caller role is classified by `rg "\.rpc\('<fn>'" src supabase/functions` (non-test). The
decisive rule (Pitfall 5 / D-03): the **frontend** supabase client is the **anon/publishable** client
(`src/lib/supabaseClient.ts:8` uses `VITE_SUPABASE_ANON_KEY`), so a `src/**` `.rpc()` call executes as
**authenticated** once the user is signed in -> **authenticated EXECUTE is LOAD-BEARING and STAYS**. Every
**edge-function** call site uses `getServiceClient()` (`SUPABASE_SERVICE_ROLE_KEY`) -> **service_role
BYPASSES the anon/authenticated EXECUTE grant** (revoking anon/authenticated never affects it). Trigger
functions (`handle_new_user`, `auto_provision_user_merits`, `queue_welcome_sequence`) fire via the trigger
mechanism as the definer, NOT via a role EXECUTE grant; cron functions (`run_benchmarks_rollup`,
`run_lifecycle_sweep`) are invoked by pg_cron inline-SQL (+ `run_lifecycle_sweep` also via service-role RPC).

> **CONSERVATIVE BAR (the dominant risk is the INVERSE — breaking a live caller, not over-permissiveness).**
> A grant is a REVOKE *candidate* ONLY where the read-map proves ZERO non-service-role `.rpc()` caller.
> The **live `proacl` is the ground truth** for whether each grant actually exists (many of these functions
> already carry `REVOKE ALL ... FROM public` + `GRANT TO authenticated, service_role` in their migrations —
> see the "anon grant origin" column). The executor authors the candidate REVOKEs from this read-map; the
> **orchestrator confirms the live `proacl` at the preview->prod gate BEFORE any apply** (a REVOKE of an
> already-absent grant is a harmless idempotent no-op; a REVOKE that would strip a live caller's grant is
> caught at the preview verify step and the function is moved to GATED). `can_perform_ai_action` authenticated
> is the headline NEVER-revoke (load-bearing FE RPC at `Navbar.tsx:109` + `SkillsGapAnalysis.tsx:108`).

### Read-map verdict table (30 functions / x60 grants; names-only)

| # | Function (signature) | Frontend `.rpc()` caller (authenticated)? | Edge/service-role / trigger / cron caller | anon grant origin (repo) | anon EXECUTE verdict | authenticated EXECUTE verdict |
|---|----------------------|-------------------------------------------|-------------------------------------------|--------------------------|----------------------|-------------------------------|
| 1 | `can_perform_ai_action(uuid)` | **YES** — `Navbar.tsx:109`, `SkillsGapAnalysis.tsx:108` | also `usage-checker.ts:74` (service_role) | default PUBLIC | **REVOKE-candidate** (auth-gated pages; anon never reaches it) | **KEEP — GATED (load-bearing)** |
| 2 | `has_role(uuid, app_role)` | **YES** — `AdminUsage.tsx:78`, `Dashboard.tsx:220` | RLS policies (definer-internal) | default PUBLIC | **REVOKE-candidate** | **KEEP (load-bearing FE)** |
| 3 | `record_feature_usage(text, text)` | **YES** — `useFeatureUsage.ts:31` | — | `20260525000004:246` `REVOKE ALL FROM PUBLIC` + `GRANT TO authenticated` | already anon-revoked (no-op candidate) | **KEEP (load-bearing FE)** |
| 4 | `record_recommendations_shown(uuid[])` | **YES** — `CareerCompass.tsx:469`, `LinkedInGrader.tsx:192`, `RecruitingLens.tsx:543`, `Results.tsx:320` | — | `20260525000004:208` `REVOKE ALL FROM PUBLIC` + `GRANT TO authenticated` | already anon-revoked (no-op candidate) | **KEEP (load-bearing FE)** |
| 5 | `get_merit_balance(uuid)` | **YES** — `useMerits.ts:59` | — | `20260415000000:269` `REVOKE ALL FROM public` + `GRANT TO authenticated, service_role` | already anon-revoked (no-op candidate) | **KEEP (load-bearing FE)** |
| 6 | `admin_upgrade_user(uuid, text, uuid)` | **YES** — `AdminUsage.tsx:112` | — (self-guards on `has_role`) | default PUBLIC | **REVOKE-candidate** | **KEEP (load-bearing FE; self-guarded)** |
| 7 | `admin_set_user_merits(uuid, integer)` | **YES** — `AdminUsage.tsx:222` | — (self-guards on `has_role`) | `20260418100000:64` `REVOKE ALL FROM public` + `GRANT TO authenticated, service_role` | already anon-revoked (no-op candidate) | **KEEP (load-bearing FE; self-guarded)** |
| 8 | `get_admin_usage_stats()` | **YES** — `AdminUsage.tsx:101` | — (self-guards on `has_role`) | default PUBLIC | **REVOKE-candidate** | **KEEP (load-bearing FE)** |
| 9 | `get_pending_upgrade_requests()` | **YES** — `AdminUsage.tsx:102` | — (self-guards on `has_role`) | default PUBLIC | **REVOKE-candidate** | **KEEP (load-bearing FE)** |
| 10 | `get_user_usage_breakdown(uuid)` | **YES** — `AdminUsage.tsx:193` | — (self-guards on `has_role`) | default PUBLIC | **REVOKE-candidate** | **KEEP (load-bearing FE)** |
| 11 | `check_and_deduct_merits(uuid, text, text, text)` | NO | `merit-gateway.ts:201` (service_role) | `20260512000003:246` `REVOKE ALL FROM public` + `GRANT TO authenticated, service_role` | already anon-revoked (no-op candidate) | **REVOKE-candidate** (no FE caller; service_role unaffected) |
| 12 | `refund_merits(uuid, uuid)` | NO | `merit-gateway.ts:246,287` (service_role) | `20260415000000:243` `REVOKE ALL FROM public` + `GRANT TO authenticated, service_role` | already anon-revoked (no-op candidate) | **REVOKE-candidate** |
| 13 | `record_ai_usage(uuid, ai_action_type, integer, uuid)` | NO | `usage-checker.ts:109`, `merit-gateway.ts:165` (service_role) | `20260512000002:83` `REVOKE ALL FROM public` + `GRANT TO authenticated, service_role` | already anon-revoked (no-op candidate) | **REVOKE-candidate** |
| 14 | `record_ai_usage(uuid, ai_action_type, integer)` [3-arg overload] | NO | service_role (legacy 3-arg path) | default PUBLIC | **REVOKE-candidate** | **REVOKE-candidate** |
| 15 | `check_and_record_ai_usage(uuid, ai_action_type, integer)` | NO | `usage-checker.ts:28` (service_role) | default PUBLIC | **REVOKE-candidate** | **REVOKE-candidate** |
| 16 | `credit_shop_merits(uuid, integer, text)` | NO | `stripe-webhook-handler.ts:561` (service_role) | `20260415000000:355` `REVOKE ALL FROM public` + `GRANT TO authenticated, service_role` | already anon-revoked (no-op candidate) | **REVOKE-candidate** |
| 17 | `grant_upgrade_diff(uuid, text, text)` | NO | `stripe-webhook-handler.ts:722` (service_role) | `20260415000001:81` `REVOKE ALL FROM public` + `GRANT TO service_role` | already anon-revoked (no-op candidate) | **REVOKE-candidate** (`service_role`-only grant) |
| 18 | `reset_subscription_merits(uuid, text, timestamptz)` | NO | `reset-subscription-merits.ts:92` (service_role) + cron 5 | `20260415000000:426` / `20260517000002:88` `REVOKE ALL FROM public` + `GRANT TO authenticated, service_role` | already anon-revoked (no-op candidate) | **REVOKE-candidate** |
| 19 | `get_billing_period_start(uuid)` | NO | `_shared/billing-period.ts:18` (service_role) | default PUBLIC | **REVOKE-candidate** | **REVOKE-candidate** |
| 20 | `get_ai_failure_rate_1h()` | NO | `check-merit-alerts.ts:172` (service_role) | `20260416000000:114` `revoke all from public` + `grant to service_role` | already anon-revoked (no-op candidate) | **REVOKE-candidate** (`service_role`-only grant) |
| 21 | `get_shop_failure_rate_1h()` | NO | `check-merit-alerts.ts:197` (service_role) | `20260416000000:135` `revoke all from public` + `grant to service_role` | already anon-revoked (no-op candidate) | **REVOKE-candidate** (`service_role`-only grant) |
| 22 | `admin_set_user_credits(uuid, integer)` | NO (legacy; FE uses `admin_set_user_merits`) | self-guards on `has_role`; no live caller | default PUBLIC | **REVOKE-candidate** | **REVOKE-candidate** |
| 23 | `get_user_usage(uuid)` | NO | called only INTERNALLY by other definer fns (`admin_credit_adjustment` etc.) | default PUBLIC | **REVOKE-candidate** | **REVOKE-candidate** |
| 24 | `reconcile_merit_balance(uuid)` | NO | ops/SQL + DB tests only (no runtime `.rpc()`) | `20260415000000:461` `REVOKE ALL FROM public` + `GRANT TO authenticated, service_role` | already anon-revoked (no-op candidate) | **REVOKE-candidate** (no live FE caller) |
| 25 | `auth_owns_version(uuid, text)` | NO | RLS USING clause (definer-internal) | `20260525000002:112` `REVOKE ALL FROM PUBLIC` + `GRANT TO authenticated` | already anon-revoked (no-op candidate) | **GATED** (used by RLS policy `USING (public.auth_owns_version(...))` evaluated in the authenticated caller's context — conservative KEEP, longer-observation) |
| 26 | `queue_welcome_sequence()` | NO | **TRIGGER fn** (`trigger_queue_welcome_sequence`) | default PUBLIC | **REVOKE-candidate** | **REVOKE-candidate** |
| 27 | `handle_new_user()` | NO | **TRIGGER fn** (on `auth.users`) | default PUBLIC | **REVOKE-candidate** | **REVOKE-candidate** |
| 28 | `auto_provision_user_merits()` | NO | **TRIGGER fn** (on `public.profiles`) | default PUBLIC | **REVOKE-candidate** | **REVOKE-candidate** |
| 29 | `run_benchmarks_rollup()` | NO | **CRON** (`benchmarks_nightly` inline SQL) | `20260525000006:335` `REVOKE ALL FROM PUBLIC` (no anon/authenticated grant) | already revoked (no-op candidate) | **REVOKE-candidate** (cron-only) |
| 30 | `run_lifecycle_sweep()` | NO | **CRON** (`lifecycle_sweep_nightly`) + `lifecycle-archive-writer.ts:328` (service_role) | `20260525000007:464` `REVOKE ALL FROM PUBLIC` (no anon/authenticated grant) | already revoked (no-op candidate) | **REVOKE-candidate** (cron + service_role) |

### Verdict summary

- **authenticated EXECUTE KEPT (load-bearing FE or RLS-context):** rows 1-10 (the 10 frontend-called RPCs) + row 25 (`auth_owns_version`, RLS-evaluated) = **11 functions GATED** for authenticated. `can_perform_ai_action` authenticated is the headline (NEVER revoked).
- **authenticated EXECUTE REVOKE-candidate (zero non-service-role caller):** rows 11-24, 26-30 = **19 functions**.
- **anon EXECUTE REVOKE (the app requires auth for every page; anon never calls any of these — read-map found ZERO anon path):** **all 30**.
- **GATED (authenticated kept):** `can_perform_ai_action`, `has_role`, `record_feature_usage`, `record_recommendations_shown`, `get_merit_balance`, `admin_upgrade_user`, `admin_set_user_merits`, `get_admin_usage_stats`, `get_pending_upgrade_requests`, `get_user_usage_breakdown`, `auth_owns_version` (11). See RESIDUAL-REGISTER R-DB-05 for the per-function why-deferred.

> **EFFECTIVE-GRANT CORRECTION (Rule-1, caught at the preview gate 2026-06-25 — the "anon grant origin"
> column above is the EXPLICIT-grant origin and is NOT the whole story; the "already anon-revoked no-op"
> notes there are SUPERSEDED).** The advisor uses `has_function_privilege` (EFFECTIVE executability). All 30
> of these functions carry a BLANKET PUBLIC EXECUTE grant in `proacl` (the `=X/postgres` entry) on top of
> any explicit role grant. `REVOKE EXECUTE ... FROM anon` removes only the explicit anon grant; the PUBLIC
> entry remains and anon (a PUBLIC member) stays effectively executable -> the advisor keeps firing. The
> FIRST form of `20260608000010` (REVOKE FROM anon only) was therefore an **effective no-op** (proven on
> preview: `anon_security_definer_function_executable` unchanged). The CORRECTED `20260608000010` revokes
> `FROM PUBLIC, anon` on all 30, and its verification DO-block uses `has_function_privilege` (not
> `information_schema.role_routine_grants`, which is PUBLIC-blind and is why the original DO-block falsely
> passed). `..0011` still revokes the 19 explicit `authenticated` grants (FROM PUBLIC alone does not drop
> authenticated, which holds its own explicit grant). Target shape = `run_lifecycle_sweep` /
> `run_benchmarks_rollup`'s existing `proacl {postgres=X, service_role=X}` (no PUBLIC, no anon).

> **The applied end-state is decided AT THE GATE.** The orchestrator confirms `has_function_privilege`
> (anon=0 / authenticated=11 / service_role=30) + the advisor count-drop (`anon_*` 30->0, `authenticated_*`
> 30->11, security total 64->15) + the no-regression invocation (a representative KEEP like
> `can_perform_ai_action` still runs as authenticated) before prod apply. Any candidate whose preview verify
> surfaces a real caller is moved to GATED, never forced. service_role keeps EXECUTE throughout (its explicit
> grant survives FROM PUBLIC), so every edge-function caller is unaffected.

---

## DB-05 Plan 08-05 resolution evidence (EXECUTE-grant least-privilege / VERIFY-THEN-APPLY tier — the LAST wave)

**Plan:** 08-05 (Database Cleanup & Migrations, Wave 5)
**Resolved:** 2026-06-24 (prod apply + re-verify)
**Requirements:** DB-05 (EXECUTE least-privilege, no access regression), DB-06 (forward + rollback per migration)
**Gate:** preview->prod 4-step HARD gate. Executor authored + committed the 2 migration files (`20260608000010` + `20260608000011`) and the `fix(08-05)` effective-grant correction; the orchestrator ran every `apply_migration` / `get_advisors` / `has_function_privilege` / `pg_proc.proacl` / SET-ROLE-invoke read on `supabasepreview`; the OPERATOR applied the 2 CORRECTED committed files to prod `zjpjapgraoxdukdvpjes` via `db push` and approved; the orchestrator re-verified read-only on `supabase-prod-readonly`. Executor invoked NO MCP tool and applied NOTHING to prod or preview.

### >>> PROMINENT Rule-1 deviation (effective-grant correctness — the gate caught a silent no-op) <<<

**What happened:** the FIRST authored form of `20260608000010` revoked EXECUTE only `FROM anon` (and `..0011` `FROM authenticated`). On preview the advisor `anon_security_definer_function_executable` DID NOT CLEAR — the migrations were an **effective no-op** that would have applied cleanly to prod while improving security by ZERO.

**Root cause:** the advisor uses `has_function_privilege` (EFFECTIVE executability), not the explicit-grant catalog. All 30 SECURITY DEFINER RPCs carry a BLANKET PUBLIC EXECUTE grant in `proacl` (the `=X/postgres` entry) on top of any explicit anon/authenticated grant. `REVOKE ... FROM anon` removes only the explicit anon grant; the PUBLIC entry remains and anon (a PUBLIC member) stays effectively executable. The original verification DO-blocks queried `information_schema.role_routine_grants` (EXPLICIT grants only) which is BLIND to PUBLIC and to effective executability, so they **falsely passed** while the advisor correctly kept firing.

**Fix (`fix(08-05)` commit):** `20260608000010` now revokes `FROM PUBLIC, anon` on all 30 (removes the blanket + explicit anon grant); its rollback re-grants `TO PUBLIC` (faithful inverse). `20260608000011` keeps `FROM authenticated` on the 19 (FROM PUBLIC alone does NOT drop authenticated, which holds its own explicit grant). BOTH verification DO-blocks now use `has_function_privilege` (the advisor's own predicate). The target shape every function reaches = the `proacl {postgres=X, service_role=X}` that `run_lifecycle_sweep` / `run_benchmarks_rollup` already had.

**Why FROM PUBLIC is safe:** `postgres` (owner) and `service_role` hold EXPLICIT grants in every `proacl`, so revoking PUBLIC does NOT drop them -> every edge-function (service_role) caller is unaffected; the owner keeps EXECUTE.

### Headline result (names-not-values)

`get_advisors(type="security")` **64 -> 15 lints (-49)** on BOTH preview AND prod — IDENTICAL; preview predicted prod exactly (gate validated). No new advisory category.
- `anon_security_definer_function_executable` **30 -> 0** (RESOLVED — all 30 anon-non-executable).
- `authenticated_security_definer_function_executable` **30 -> 11** (19 revoked; 11 load-bearing/RLS-context KEPT — documented intentional, RESIDUAL-REGISTER R-DB-05).

### Per-fix before/after evidence

| Fix | Migration file | Advisor before -> after (prod) | `has_function_privilege` after (prod, names-only) | No-regression read | Rollback (DB-06) |
|-----|----------------|-------------------------------|---------------------------------------------------|--------------------|------------------|
| Revoke PUBLIC+anon EXECUTE on all 30 definer RPCs | `20260608000010_revoke_anon_execute_security_definer_rpcs.sql` | `anon_security_definer_function_executable` 30 -> 0 | `anon_can_exec = 0` for all 30 | `service_role_can_exec = 30` (every edge caller unaffected; service_role's explicit grant survives FROM PUBLIC) | `GRANT EXECUTE ... TO PUBLIC` x30 (restores prior effective executability) |
| Revoke authenticated EXECUTE on the 19 provably-unused | `20260608000011_revoke_authenticated_execute_unused_definer_rpcs.sql` | `authenticated_security_definer_function_executable` 30 -> 11 | `authenticated_can_exec = 11` (EXACTLY the KEEP set); `= 0` on the 19 unused | `can_perform_ai_action` invoked as authenticated (preview SET ROLE) returns its JSON — no permission denied; the 11 KEEP all executable | `GRANT EXECUTE ... TO authenticated` x19 (restores the 19 explicit grants) |

### KEEP set confirmed on prod (11, authenticated-executable — intentional)

`admin_set_user_merits`, `admin_upgrade_user`, `auth_owns_version`, `can_perform_ai_action`, `get_admin_usage_stats`, `get_merit_balance`, `get_pending_upgrade_requests`, `get_user_usage_breakdown`, `has_role`, `record_feature_usage`, `record_recommendations_shown`. `can_perform_ai_action` authenticated EXECUTE was NEVER revoked (load-bearing FE RPC at `Navbar.tsx:109` + `SkillsGapAnalysis.tsx:108`).

**Prod SET-ROLE caveat (recorded — read-only-MCP privilege limit, NOT a migration issue):** the SET-ROLE invocation no-regression probe runs only on PREVIEW (`supabase-prod-readonly` lacks SET ROLE + prod is read-only). The prod proof is `has_function_privilege` (anon=0 / authenticated=11 / service_role=30) + the IDENTICAL advisor end-state (64->15) — the same approach as 08-03/08-04.

---

## DB-05 audit completeness (Plan 08-05 Task 3 — every DB-class advisory has a final disposition)

**Phase-wide security advisor trajectory (canonical prod `zjpjapgraoxdukdvpjes`, names-not-values):**

| Advisory category | 08-01 baseline | After 08-03 | After 08-04 | After 08-05 | Disposition |
|-------------------|:--------------:|:-----------:|:-----------:|:-----------:|-------------|
| `security_definer_view` | 4 | **0** | 0 | 0 | RESOLVED (08-03: 4 views -> security_invoker) |
| `rls_enabled_no_policy` | 3 | **0** | 0 | 0 | RESOLVED (08-03: explicit-deny x3) |
| `function_search_path_mutable` | 2 | 1 | **0** | 0 | RESOLVED (08-03 `ts_to_utc_date` `=''`; 08-04 `increment_rate_limit` `=public`) |
| `anon_security_definer_function_executable` | 30 | 30 | 30 | **0** | RESOLVED (08-05: REVOKE PUBLIC+anon x30) |
| `authenticated_security_definer_function_executable` | 30 | 30 | 30 | **11** | PARTIAL/GATED (08-05: 19 revoked; 11 intentional KEEP — R-DB-05) |
| `rls_policy_always_true` | 2 | 2 | 2 | 2 | GATED/Phase-9 (paddle_webhook_events + scheduled_emails — service-role by design) |
| `public_bucket_allows_listing` | 1 | 1 | 1 | 1 | needs-operator (storage config, not a public-schema migration) |
| `auth_leaked_password_protection` | 1 | 1 | 1 | 1 | needs-operator (Supabase Auth setting, not a migration) |
| (`linkedin_grades` over-permissive SELECT — counted under the DB-known row) | (live) | (live) | **fixed** | fixed | RESOLVED (08-04: DROP-only owner-scope) |
| **SECURITY TOTAL** | **73** | **65** | **64** | **15** | — |

**The 15 remaining are ALL intentional / out-of-DB-migration-scope** (NONE is an un-dispositioned `deferred-to-Phase-8`): 11 GATED authenticated-definer-executable (documented R-DB-05; `can_perform_ai_action` et al — load-bearing FE/RLS), `rls_policy_always_true` x2 (service-role-by-design), `public_bucket_allows_listing` x1 (storage, needs-operator), `auth_leaked_password_protection` x1 (Auth setting, needs-operator). **DB-05 is COMPLETE: every DB-class security advisory now reads RESOLVED, GATED, or needs-operator.**

**PERFORMANCE advisors -> Phase 9 (D-02 — out of the security-only appetite; DOCUMENTED, NOT applied):** `auth_rls_initplan` x62, `multiple_permissive_policies` x48 (minus the linkedin_grades entry 08-04 reduced 2->1 SELECT), `unindexed_foreign_keys` x8, `unused_index` x41 — all routed to Phase 9 (Performance & Maintainability) with per-advisory rows in RESIDUAL-REGISTER.md. `unused_index` carries the D-11 caveat (idx_scan=0 on a 1-user prod is LOW TRAFFIC, not disuse).

**Phase close-out (zero app-code change, D-06):** `git diff -- src supabase/functions` is EMPTY across all of Phase 8 (08-01..08-05 ship SQL migrations + audit docs only; the two FE call sites `Navbar.tsx:109` + `SkillsGapAnalysis.tsx:108` are byte-identical). DB-03 (no removals — 0 confirmed-safe on low-traffic prod), DB-04 (usage_tracking/can_perform_ai_action cluster GATED), DB-05 (73->15, every advisory dispositioned), DB-06 (forward+rollback on all 12 Phase-8 migrations) — ALL satisfied.

---

## Phase 9 (Plan 09-03) -- DB perf-class migrations (PERF-02): preview-applied + verified

**Date:** 2026-06-25. **Driver:** orchestrator applied to PREVIEW (`cimjltzovkahkqecpwgi`) via `supabasepreview` MCP (operator option "I drive preview, you apply prod"). **Prod (`zjpjapgraoxdukdvpjes`) apply is operator-gated (Task 3, autonomous:false) -- pending.** Names-not-values held; no row data pasted.

**Live preview re-pull (before, 2026-06-25 -- counts drifted from the Phase-8 routing note, immaterial):**
`auth_rls_initplan` = 62, `multiple_permissive_policies` = 42 (was noted x48 at Phase-8 close; drift), `unindexed_foreign_keys` = 8, `unused_index` = 35, `table_bloat` = 1. pg_policies fact: 71 public policies; EXACTLY 62 reference `auth.uid()`; ZERO reference `auth.role()`/`auth.jwt()`/`auth.email()`/`current_setting()`; ZERO already wrapped.

**Three migrations authored (repo files `supabase/migrations/20260608000012..14`, each forward + DO-block verification + commented rollback, mirroring `20260608000008`):**

| Migration file | Class | Forward | Preview result |
|----------------|-------|---------|----------------|
| `20260608000012_perf_dedup_permissive_policies.sql` | multiple_permissive (EXACT-DUPLICATE subset) | DROP 6 exact-duplicate permissive policies (improvement_checklist x4, resumes INSERT x1, user_roles SELECT-redundant-with-ALL x1); identical-qual survivors kept | applied OK; verification asserted 6 gone + 6 survivors intact |
| `20260608000013_perf_auth_rls_initplan_wrap.sql` | auth_rls_initplan | DO-block ALTER POLICY wrapping bare `auth.uid()` -> `(select auth.uid())` on every public policy (56 after dedup) | applied OK (wrapped 56); verification asserted 0 bare `auth.uid()` remain |
| `20260608000014_perf_unindexed_fk_indexes.sql` | unindexed_foreign_keys | 8 additive `CREATE INDEX IF NOT EXISTS` covering indexes | applied OK; verification asserted 8 indexes present |

**Preview advisor delta (after, names-not-values):**

| Advisory | before | after | disposition |
|----------|:------:|:-----:|-------------|
| `auth_rls_initplan` | 62 | **0** | RESOLVED (wrap; zero-observable -- truth value unchanged, eval plan only) |
| `unindexed_foreign_keys` | 8 | **0** | RESOLVED (8 additive covering indexes) |
| `multiple_permissive_policies` | 42 | **6** | 36 RESOLVED (exact-duplicate dedup); 6 DEFERRED = `upgrade_requests` SELECT (admin OR owner) across 6 roles -- a genuine DIFFERENT-qual OR-merge needing DROP+CREATE; deferred per the Phase-8 D-03 conservative grant-altering stance (RESIDUAL-REGISTER) |
| `unused_index` | 35 | 41 | DEFERRED (the +6 are the new additive FK indexes counted "unused-until-scanned"; D-11 still applies) |
| `table_bloat` | 1 | 1 | out-of-scope (`net._http_response`, extension-owned; VACUUM maintenance, not a public-schema migration) |

**No-regression proof (preview):** (1) every migration's in-DB `DO $$` verification asserted the exact end-state (or the apply aborts + rolls back -- which it did once, catching a verification-regex bug where Postgres renders the wrapped form as `( SELECT auth.uid() AS uid)`; fixed to a rendering-robust `select\s+auth.uid()` match, re-applied clean). (2) Empirical SELECT-as-role probe on `public.resumes` (78 rows, sample owner owns 40): as the owning `authenticated` user count = 40 (own rows); as a random non-owner = 0 -- owner-scoping identical post-wrap. The `auth.uid()` wrap is the Supabase-documented zero-change rewrite; the dedup drops IDENTICAL-qual duplicates (`Q OR Q = Q`).

**Operator prod-apply (Task 3, pending):** apply the same 3 migration files to prod `zjpjapgraoxdukdvpjes`, then orchestrator re-verifies prod READ-ONLY via `supabase-prod-readonly` `get_advisors(performance)` (expect `auth_rls_initplan` 0, `unindexed_foreign_keys` 0, `multiple_permissive_policies` -> the 6 deferred `upgrade_requests` rows) + pg_policies/pg_indexes end-state parity with preview. No SET ROLE on prod (prod lacks it); prod proven by end-state parity.

**PROD RE-VERIFY (read-only, operator applied 2026-06-25 -- CONFIRMED):** operator applied the 3 migrations to prod `zjpjapgraoxdukdvpjes`; orchestrator re-verified via `supabase-prod-readonly` (Claude wrote NOTHING to prod). Catalog parity IDENTICAL to the preview end-state: bare-`auth.uid()` policies = 0; the 6 dropped duplicates absent; 8 FK covering indexes present; `upgrade_requests` SELECT pair (deferred) intact; total public policies = 65 (71 - 6). Prod `get_advisors(performance)`: `auth_rls_initplan` = **0**, `unindexed_foreign_keys` = **0**, `multiple_permissive_policies` = **6** (the deferred `upgrade_requests` SELECT across 6 roles) -- matching preview exactly. DB-06 rollbacks documented in each migration file.

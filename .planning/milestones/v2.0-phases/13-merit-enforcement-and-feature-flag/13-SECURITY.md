---
phase: 13
slug: merit-enforcement-and-feature-flag
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-16
---

# Phase 13 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| env → process (test seam) | AI_FORCE_FAILURE / AI_TEST_MODE read at module scope by invokeAnthropicText and streamAnthropicText; operator controls both env vars | Test control signal only; no user PII |
| test runner → production | Test-only env vars (AI_TEST_MODE, AI_FORCE_FAILURE, DENO_TEST_SUPABASE_LOCAL) must never appear in deployed Supabase secrets | Config metadata; high risk if leaked |
| browser → edge function (merit gate) | withMerits reads userContext (auth-derived) for userId and tier; never reads request body for tier | JWT claims (user identity, subscription tier) |
| edge function → Postgres (service role) | check_and_deduct_merits, refund_merits, and view queries use getServiceClient() (service role key); no user-supplied key path | Merit ledger rows, balances |
| pg_cron → check-merit-alerts edge function | HTTP POST with x-internal-job-secret header; requireAuth validates INTERNAL_JOB_SECRET env | Internal trigger signal; secret must not be guessable |
| admin endpoint → merit views | admin-merit-metrics queries tier-aggregated views only via service role | Aggregate metrics (no per-user rows) |
| alert_state table → service_role | RLS enabled, no policies; only service_role can read/write | Alert debounce state |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-13-TST1 | Tampering | anthropic.ts compound gate | mitigate | Two-key defense: AI_FORCE_FAILURE short-circuits only when AI_TEST_MODE=true is ALSO set. Gate present in invokeAnthropicText (line 532–536) and streamAnthropicText (line 702–706). Three passing unit tests in anthropic.test.ts prove: (1) AI_FORCE_FAILURE alone is no-op, (2) both keys together short-circuit 529, (3) AI_TEST_MODE alone preserves fixture path. | closed |
| T-13-TST2 | Information Disclosure | Wave 0 test stubs | accept | See Accepted Risks Log. | closed |
| T-13-TST3 | Tampering | test-07 seed/teardown | mitigate | TEST_USER_ID constant = "00000000-0000-0000-0000-test07000001"; offline mock ledger is scoped to that UUID; no teardown of live DB rows (offline mode). Raw integration test (merit-gateway.raw.test.ts) deletes only rows matching TEST_USER_ID "00000000-0000-0000-0000-000000000097". | closed |
| T-13-TST4 | Information Disclosure | AI_FORCE_FAILURE production leak | mitigate | Addressed by T-13-TST1 compound gate; AI_FORCE_FAILURE alone cannot activate the short-circuit in production. | closed |
| T-13-A1 | Tampering | MERIT_SYSTEM_ENABLED per-request read | mitigate | Module-scope export: `export const MERIT_SYSTEM_ENABLED = (Deno.env.get('MERIT_SYSTEM_ENABLED') ?? '').toLowerCase() === 'true'` at merit-gateway.ts line 27–28. Cached at cold start, not re-read per request. Verified by merit-gateway.test.ts "MERIT_SYSTEM_ENABLED reflects env at module load time". | closed |
| T-13-R1 | Elevation of Privilege | Rate-limit key collision | mitigate | In rate-limiter.ts: `const key = \`user:${userId}:${config.key}\`` (line 88). The pooled key 'ai-analyses-all' is therefore namespaced `user:{id}:ai-analyses-all`. No user-supplied key path exists; key is constructed server-side from auth-derived userId. | closed |
| T-13-M1 | Tampering | Refund replay / non-refundable refund | mitigate | isRefundableAnthropicError (merit-gateway.ts lines 51–59) gates refunds to: status >= 500, status === 408, or error text matching overload/timeout/ECONNRESET/network/AbortError. Parse and validation errors do not match. Phase 11 refund_merits RPC is idempotent (returns already_refunded on duplicate). Proven by merit-gateway.test.ts (7 classification tests) and test-07.test.ts Test 3 (idempotency). | closed |
| T-13-N1 | Information Disclosure | RPC error message leakage | mitigate | On check_and_deduct_merits RPC failure, gateway calls `genericError(500, 'merit_system_error', ...)` (merit-gateway.ts line 139) returning only the code string. Underlying error.message is logged via log.error() only, never included in the Response body. | closed |
| T-13-N2 | Spoofing | Forged user tier via body param | mitigate | meritCtx.tier sourced from `userContext.tier` (analyze-resume/index.ts line 241), where userContext is populated by requireInternalOrUserAuth(req) from auth-derived JWT claims. gateway never reads request body for tier. Same pattern verified across all 7 handler insertions. | closed |
| T-13-RAW1 | Tampering | Read-after-write stale cached client | mitigate | merit-gateway.raw.test.ts constructs a BRAND-NEW `createClient(url, key, ...)` instance (not getServiceClient() singleton) for all read assertions after withMerits returns. Proves data is durable at Postgres with zero sleep/polling. Gated on DENO_TEST_SUPABASE_LOCAL=1 for CI. | closed |
| T-13-H1 | Spoofing | Per-handler tier read | mitigate | userContext.tier is sourced from requireInternalOrUserAuth (auth-derived JWT) in every D-06 call site. Confirmed in analyze-resume/index.ts line 241: `tier: userContext.tier as 'free' | 'pro' | 'elite'`. Pattern consistent across all 9 wired handlers per 13-03-SUMMARY. | closed |
| T-13-H2 | Tampering | Legacy-path regression | mitigate | legacy-unchanged.test.ts reads analyze-resume/index.ts source and asserts three canary substrings: can_perform_ai_action, createUsageLimitResponse, usageUserId. All 3 pass (13-03-SUMMARY). test-07.test.ts Test 4 adds a 4th structural assertion that legacy path appears AFTER the D-06 guard. | closed |
| T-13-H3 | Elevation of Privilege | Async processor double-deduction | mitigate | grep "from '../_shared/merit-gateway.ts'" in process-*/*.ts returns 0 matches. No process-*-job handler imports merit-gateway.ts; only the 9 wired direct-call handlers do. Confirmed by 13-03-SUMMARY invariant table (Pitfall 2 check). | closed |
| T-13-H4 | Tampering | Refund outside gateway | mitigate | grep "refund_merits" across supabase/functions/ excluding *.test.ts returns only supabase/functions/_shared/merit-gateway.ts. No handler calls refund_merits directly. Confirmed by 13-03-SUMMARY D-03 invariant check (0 matches). | closed |
| T-13-AUTH1 | Information Disclosure | admin-merit-metrics dual admin gate | mitigate | isAdmin() in admin-merit-metrics/index.ts lines 33–57: (1) primary path checks ADMIN_EMAILS env list, (2) fallback queries user_roles table for role='admin'. Non-matching users return 403 {"error":"forbidden"}. Tests 2 (non-admin 403), 3 (env-admin 200), 4 (role-admin 200) all pass. | closed |
| T-13-AUTH2 | Elevation of Privilege | admin-merit-metrics unauthenticated access | mitigate | requireAuth(req, { type: 'user' }) called before admin check (index.ts line 69). Unauthenticated requests throw a 401 Response before reaching the admin check. Test 1 in admin-merit-metrics/index.test.ts pins 401 behavior. | closed |
| T-13-AL1 | Denial of Service | check-merit-alerts alert flood | mitigate | DEBOUNCE_MINUTES = 60. tryFireAlert() checks alert_state.last_fired_at; if age < 60 minutes returns 'debounced' without dispatching. Tests 3 (fire) and 4 (debounce-hit) pin the 60-minute window. | closed |
| T-13-AL2 | Tampering | check-merit-alerts upsert ordering | mitigate | In tryFireAlert() (check-merit-alerts/index.ts lines 71–85): upsert to alert_state happens BEFORE returning 'fired'. The calling handler dispatches email only after 'fired' is returned. Test 6 (Pitfall 7) proves upsertCalls.length > 0 even when email returns 500. | closed |
| T-13-AL3 | Repudiation | check-merit-alerts snapshot logging | mitigate | alert_state upsert includes `last_value: payload` (index.ts line 77). The payload is the evaluator's data snapshot (e.g., neg balance count, failure rate, threshold). alert_state table has `last_value jsonb` column (migration line 71). | closed |
| T-13-AL4 | Denial of Service | check-merit-alerts DB error handling | mitigate | Each evaluator is wrapped in its own try/catch (index.ts lines 146, 170, 194). Caught errors are logged at warn level; function continues evaluating remaining conditions and returns status 200. Test 5 proves return 200 on DB error with evaluated=3. | closed |
| T-13-ADM1 | Information Disclosure | v_merits_in_circulation view | accept | See Accepted Risks Log. | closed |
| T-13-ADM2 | Tampering | alert_state table RLS | mitigate | Migration line 74: `alter table public.alert_state enable row level security`. No policies created (matching Phase 10 helper-table pattern), so only service_role can read/write. Standard RLS with zero policies = deny-all for anon/authenticated roles. | closed |
| T-13-MIG1 | Denial of Service | Migration idempotency | mitigate | All DDL in 20260416000000_merit_enforcement_observability.sql uses idempotent forms: `create or replace view` (4×), `create table if not exists`, `create or replace function` (2×), `create index if not exists`. Full DDL verified in migration file. | closed |
| T-13-MIG2 | Tampering | Phase 12 FK dependency | accept | See Accepted Risks Log. | closed |
| T-13-CRON1 | Spoofing | pg_cron cron-to-function authentication | mitigate | phase-13-cron-setup.sql includes `'x-internal-job-secret', '<INTERNAL_JOB_SECRET>'` header in the pg_net.http_post call. check-merit-alerts/index.ts line 136 calls `deps.requireAuth(req, { type: 'internal' })` which validates that header against INTERNAL_JOB_SECRET env. Test 1 in check-merit-alerts/index.test.ts pins 401 on missing auth. | closed |
| T-13-VER1 | Repudiation | VERIFICATION.md sign-off | accept | See Accepted Risks Log. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-13-01 | T-13-TST2 | Wave 0 test stubs are `ignore: true` Deno.test entries containing no secrets, no PII, and no production logic. They are dead test scaffolds with negligible attack surface. Risk accepted as low-value target. | Phase 13 executor | 2026-04-16 |
| AR-13-02 | T-13-ADM1 | v_merits_in_circulation exposes tier-bucketed aggregate counts (tier, user_count, net_impulses_30d) with no per-user rows. Never joined to auth.users or email columns. Admin-only access enforced by dual gate (T-13-AUTH1/AUTH2). Risk accepted as compliant with ASVS L1 aggregate reporting. | Phase 13 executor | 2026-04-16 |
| AR-13-03 | T-13-MIG2 | v_conversion_funnel is a PROVISIONAL stub view returning zero rows because merit_exhaustion_events table does not yet exist. Stub degrades gracefully; admin endpoint still returns 200 with empty funnel array. A future phase will replace the stub. Risk accepted as non-critical observability gap. | Phase 13 executor | 2026-04-16 |
| AR-13-04 | T-13-VER1 | VERIFICATION.md sign-off checklist is operator-facing documentation in .planning/ (not machine-enforced). The 7 success criteria (SC-1..SC-7) are backed by automated grep invariants and Deno tests documented in 13-VERIFICATION.md. Risk accepted: manual sign-off is adequate for ASVS L1 given automated backing coverage. | Phase 13 executor | 2026-04-16 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-16 | 26 | 26 | 0 | gsd-security-auditor (claude-sonnet-4-6) |

---

## Unregistered Threat Flags

None. All threat flags from SUMMARY.md ## Threat Flags sections map to registered threat IDs in the threat register above.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-16

---
phase: 2
slug: security-audit-remediation
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-01
updated: 2026-07-02
---

# Phase 2 — Security

> Per-phase security contract: threat register, trust boundaries, accepted risks, and audit trail.
> ASVS Level 1, block-on-high. This register enrolls the confirmed Phase-2 threats and ties each to its
> remediation plan + automated guard. It is finalized (sign-off + `threats_open: 0`) in plan 02-08 after all
> sweeps and remediations land. Names-only discipline: no secret VALUE appears in this doc (T-02-07).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser <-> Edge Function | React SPA calls Deno edge functions with a Supabase JWT; `requireAuth` validates the Bearer token | user JWT, resume/profile text, analysis requests (sensitive PII) |
| Edge Function <-> Postgres/RLS | edge functions use the service-role client; RLS + `SECURITY DEFINER` RPCs enforce owner-scoping | user rows, analyses, Merit ledger, usage tracking |
| Edge Function <-> Anthropic | AI text-ingesters send user content to the Claude API and parse the response | user-supplied prompt text, model output (prompt-injection surface) |
| external billing <-> paddle-webhook | Paddle posts subscription events verified by HMAC-SHA256 + `event_id` dedup | signed billing events, subscription state (spoofing/replay surface) |
| operator <-> prod | operator runs read-only advisors / names-only env listings; Claude stays read-only on prod | advisor findings, secret NAMES (never values), policy/grant shapes |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-02-01 | Tampering / Elevation of Privilege | Merit deduction (`_shared/merit-gateway.ts` withMerits -> 4-arg check_and_deduct_merits) | mitigate | Plan 02-05: forward `p_idempotency_key` through `withMerits` so a repeated deduction is idempotent; guard `_shared/merit-gateway.idempotency-forward.test.ts` (repeated key -> exactly ONE deduction) — RED->GREEN, in `deno.json` test:ci; commit `4ab218c5` | closed |
| T-02-02 | Tampering | grade-linkedin `storeAndNotify()` post-save usage-write (refund-after-save) | mitigate | Plan 02-05: post-save steps log-and-continue, never throw `MeritRefundable` (all 3 sites; pre-save throw KEPT); guard `grade-linkedin/refund-after-save.test.ts` (post-save fail -> 200 + saved row + no refund RPC) — RED->GREEN, in test:ci; commit `30be9b55` | closed |
| T-02-03 | Spoofing / Replay | paddle-webhook signature-verify path (no timestamp-freshness window) | mitigate | Plan 02-06: replay-window (`MAX_WEBHOOK_AGE_SECONDS=300`) on the signed `ts`, keep `event_id` idempotency; guard `paddle-webhook/replay-window.test.ts` (stale-ts valid sig -> rejected, fresh -> accepted) — RED 1/7->GREEN 7/7, in test:ci; commit `44c7579d` | closed |
| T-02-04 | Tampering | prompt-injection defense-in-depth gap on 5 uncovered AI ingesters (analyze-resume, analyze-career, analyze-skills-gap, compare-jobs, chat-agent) | mitigate | Plan 02-07: sanitizer added to the high-traffic analyze-resume + analyze-career; guard `_shared/sanitizer-coverage.test.ts` (5 enrolled, `=== 5` length guard) — RED->GREEN, in test:ci; commit `949b761b`. The 3 low-traffic ingesters -> justified Low residual (AR-02-02) | closed |
| T-02-05 | Tampering / XSS | `dangerouslySetInnerHTML` sink in `src` (only chart.tsx:70 CSS-var, not user text) | mitigate | Plan 02-07: XSS-sink regression guard `src/test/security/xss-sink-guard.test.ts` (no `dangerouslySetInnerHTML` outside the allowlisted chart.tsx) — fail-before demonstrated, in verify:baseline; commit `00d8eb23` | closed |
| T-02-06 | Information Disclosure | paddle-webhook 500 body names the `PADDLE_WEBHOOK_SECRET` env var (config-state leak) | mitigate | Plan 02-06: missing-secret (`webhook_not_configured`) + invalid-signature responses generic/non-leaky (reason code -> log only); guard `paddle-webhook/replay-window.test.ts` (missing secret -> non-leaky error) — GREEN, in test:ci; commit `44c7579d` | closed |
| T-02-07 | Information Disclosure | committed audit docs (SECURITY-AUDIT.md, findings files, SEC-15 record) leak a secret VALUE | mitigate | Plan 02-01: no-secret-leak static guard `src/test/security/security-audit-docs.test.ts` greps every Phase-2 audit doc for key/JWT/connection-string/price-id/webhook-secret patterns and asserts zero; project-refs allowlisted | closed |
| T-02-08 | Repudiation / Tampering | SEC-11 disposition completeness (a silently-dropped SEC-01..10 obligation) | mitigate | Plan 02-01: doc guard `src/test/security/security-audit-docs.test.ts` asserts the SEC-01..10 table has 10 rows, none blank, each with a disposition token + evidence pointer | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

FINALIZED at plan 02-08 against the completed sweeps (D-01: only `Low` becomes a tracked/accepted residual;
`Critical + High + Medium` were remediated in-phase). No `pending 02-08` rows remain. Each residual is also
logged in `.planning/audit/RESIDUAL-REGISTER.md` (`Phase 2` rows) with its clearance criterion, and enumerated
in `SECURITY-RECORD.md` §6.

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | SEC-10 (Deno stdlib) | std multi-version drift + zod import-style split (now single-style) is currency/maintainability, not a vuln; DEP-05 edge consolidation deferred (02-04 audit pins, does not perform the consolidation). Clearance: dedicated edge-consolidation task + per-fn staging deploy-smoke | operator (02-04, delegated) | 2026-07-01 |
| AR-02-02 | SEC-07 low-traffic ingesters (analyze-skills-gap, compare-jobs, chat-agent) | 02-07 FINAL: classified Low defense-in-depth (hard input slice caps; chat-agent forces `role:'user'`+2000-char+last-message-only; robust prompts + off-gate promptfoo) — a tracked residual, not remediated. Clearance: enroll in `sanitizer-coverage.test.ts` + add `sanitizeUserContent` if any moves to high-traffic | operator (02-07) | 2026-07-02 |
| AR-02-03 | v4.0 15-advisor intentional floor | 11 kept authenticated-EXECUTE (R-DB-05) + 2 rls_policy_always_true + auth_leaked_password_protection + public_bucket_allows_listing — re-examined under D-04, retained by-design; confirmed NOT weakened (operator read-only advisor re-pull 15->15, 0 new) | operator (02-03 before + 02-08 after) | 2026-07-02 |
| AR-02-04 | DB-1-cron host drift | prod cron jobs 1 (`keep-warm-ping`) + 6 (`extract_catchup_nightly`) target the preview functions host — LIVE-confirmed MEDIUM (02-04). NOT a Low residual and NOT resolved: recorded **PENDING OPERATOR ACTION** (live `cron.alter_job` re-point; no repo migration/DDL). Carried out of Phase 2 | operator action OWED (open) | pending (carried) |

*Accepted risks do not resurface in future audit runs once finalized. AR-02-04 is the one carried open
operator action (MEDIUM, remediation defined) — not an accepted Low, tracked in the RESIDUAL-REGISTER.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-01 | 8 | 2 | 6 | Phase-2 apparatus stand-up (plan 02-01) — T-02-07/08 closed by the doc + no-secret-leak guard |
| 2026-07-02 | 8 | 8 | 0 | Phase-2 closure (plan 02-08, SEC-15) — T-02-01..06 closed with RED->GREEN in-gate guards; verify:baseline green (deno 814/0/11 · vitest 475/0 · Playwright 5+1skip); advisor floor 15->15 (do-not-weaken) confirmed via operator-delegated read-only re-pull |

---

## Sign-Off

Finalized in plan 02-08 (SEC-15 record) — all sweeps + remediations landed and `verify:baseline` is green with
every new guard.

- [x] All threats have a disposition (mitigate / accept / transfer) — 8/8 mitigate, all closed
- [x] Every remediation threat (T-02-01..06) closed with a fail-before / pass-after guard in `verify:baseline` — the 4 deno guards (`deno.json` test:ci) + 2 vitest security guards, each RED->GREEN
- [x] Accepted risks finalized in the Accepted Risks Log (no `pending 02-08` rows remain) — AR-02-01/02/03 accepted; AR-02-04 recorded PENDING-OPERATOR (carried)
- [x] v4.0 security-advisor floor confirmed not weakened (operator read-only re-pull) — 15 -> 15, 0 new advisors (02-03 before + 02-08 after, delegated read-only pull on prod `zjpjapgraoxdukdvpjes`)
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Do-not-weaken invariant recorded:** advisor floor 15 -> 15 (ZERO increase); the 3 frozen wire contracts +
Phase-1 `_shared/cors.ts` byte-identical (`git diff --stat 50f18461..HEAD -- supabase/functions/_shared/cors.ts`
EMPTY; only the intended Fix-1/2/3 + SEC-07 lines changed). Full evidence: `SECURITY-RECORD.md` §5.

**Approval:** APPROVED — Phase 2 security closure signed off 2026-07-02 (plan 02-08). One operator action carried
open: the AR-02-04 cron re-point (MEDIUM, remediation defined, PENDING OPERATOR ACTION).

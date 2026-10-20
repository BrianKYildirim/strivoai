---
phase: 02-security-audit-remediation
plan: 02
subsystem: testing
tags: [security-audit, edge-functions, deno, prompt-sanitizer, cors, rate-limiter, xss, error-handling, sec-07]

# Dependency graph
requires:
  - phase: 02-01
    provides: SECURITY-AUDIT.md 17-domain index + SEC-11 disposition + severity rubric + no-secret-leak guard
  - phase: 01-cross-origin-error-contract-foundation
    provides: withCors/jsonError/ALLOWED_ORIGINS + cors-audit.test.ts (the domain-5 verify target)
provides:
  - Classified findings for the 9 code/edge domains (1,2,5-verify,6,7,9,10,11,14) at current HEAD
  - Confirmed SEC-07 8-ingester coverage table (3 covered / 5 not) grounded by grep
  - R-04 analyze-skills-gap inside-arrow guard verdict = RESOLVED-by-withCors
  - paddle-webhook 500 config-leak (MEDIUM -> 02-06) + NEW error.message-in-body leak (~8 fns -> 02-06)
  - Remediation routing for 02-05/02-06/02-07
affects: [02-05, 02-06, 02-07, 02-08, security-remediation, sanitizer-coverage, error-message-safety]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-domain findings doc mirroring .planning/audit/ shape, KEEP-LIST-gated, names-only"
    - "Static grep + read-driven sweep grounded at a pinned HEAD SHA (D-04 re-confirm-not-trust)"

key-files:
  created:
    - .planning/phases/02-security-audit-remediation/audit/CODE-EDGE-FINDINGS.md
  modified: []

key-decisions:
  - "R-04 analyze-skills-gap inside-serve-arrow guard is RESOLVED by the Phase-1 withCors seam (withCors catches a thrown Response and returns it via mergeCors); the old std-serve onError concern is superseded — classified clean, no remediation."
  - "SEC-07 gap confirmed at HEAD: analyze-resume + analyze-career = MEDIUM -> 02-07; analyze-skills-gap/compare-jobs/chat-agent = recommended Low residual (input-capped; chat-agent forces role='user'+2000 cap), final Low-vs-Medium call deferred to 02-07."
  - "NEW finding beyond the known set (Open Q5): error.message echoed into client 500 bodies across ~8 prod-active functions (RUN-03 body-leak class the Ph7.1 sweep only fixed for compare-jobs) — classified LOW-MEDIUM, routed 02-06; not crit/high so no forced 02-05 split."
  - "getMaxInputChars is WIRED for resume/career/linkedin/recruiting/interview-prep (CONCERNS 'not wired' is stale); the 3 non-helper ingesters use hard slice caps — no DoS gap, only a Low consistency residual."
  - "SEC-03 SQLi clean (no string-built SQL; all PostgREST .from()/.rpc()); SEC-04 XSS clean (single chart.tsx CSS-var sink, no user data) -> 02-07 regression guard."

patterns-established:
  - "KEEP-LIST cross-check table proves no gated-but-live item is mis-reported as a removal finding (every finding is hardening/remediation on a live surface)."
  - "Domain-5 cross-origin verified-not-modified: cors-audit.test.ts re-run 64/0, zero ACAO literals, _shared/cors.ts untouched."

requirements-completed: [SEC-12, SEC-13]

# Metrics
duration: 8min
completed: 2026-07-01
---

# Phase 2 Plan 02: Code/Edge Security Sweep Summary

**Static + read-driven security sweep of the 9 code/edge domains at HEAD `5151d3c7`: enforcement layers (auth/authz/rate-limit) clean, cross-origin verified (64/0), SEC-07 5-of-8 sanitizer gap confirmed, and a NEW error.message-in-body leak across ~8 functions surfaced — all classified + routed to remediation.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-01T23:10:00Z
- **Completed:** 2026-07-01T23:18:29Z
- **Tasks:** 2
- **Files modified:** 1 (created)

## Accomplishments
- Produced `audit/CODE-EDGE-FINDINGS.md` classifying all 9 code/edge domains (1,2,5,6,7,9,10,11,14) against current-HEAD source with a rubric severity + remediation route each.
- Confirmed the SEC-07 coverage gap by grep: 3 ingesters COVERED (grade-linkedin, recruiting-lens, interview-prep-analyze) / 5 NOT (analyze-resume, analyze-career, analyze-skills-gap, compare-jobs, chat-agent); routed the 2 high-traffic ingesters MEDIUM -> 02-07.
- Verified the Phase-1 cross-origin contract without touching it: `cors-audit.test.ts` re-run **64 passed / 0 failed**, zero ACAO literals in any index.ts, `_shared/cors.ts` NOT modified.
- Resolved the deferred R-04 `analyze-skills-gap` inside-arrow auth guard (RESOLVED-by-withCors) and confirmed `admin-delete-user` is correctly admin-gated (403-on-non-admin via `user_roles`).
- Surfaced a NEW finding beyond the known set: `error.message` echoed into client 500 bodies across ~8 prod-active functions (RUN-03 body-leak class), classified LOW-MEDIUM and routed to 02-06.
- Confirmed the enforcement layers clean: centralized fail-closed `requireAuth`/`timingSafeEqual`, pooled 60/hr abuse limiter + per-function caps (fail-open documented), `getMaxInputChars` wired, SEC-03 SQLi clean, SEC-04 XSS single-sink clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Enforcement/verify domains (auth, authz, cross-origin, logging, rate-limiting)** - `1ec06e8b` (docs)
2. **Task 2: Data-handling domains (input-validation, file-upload, sensitive-data, AI prompt/SEC-07)** - `bfa2b55e` (docs)

**Plan metadata:** _(this commit)_ (docs: complete plan)

## Files Created/Modified
- `.planning/phases/02-security-audit-remediation/audit/CODE-EDGE-FINDINGS.md` - Classified findings for the 9 code/edge domains with severity + route; SEC-07 8-ingester coverage table; KEEP-LIST cross-check summary; cross-origin verify-only record.

## Decisions Made
- **R-04 = RESOLVED-by-withCors.** The Phase-1 `withCors` wrapper catches a thrown `Response` and returns it via `mergeCors` (`_shared/cors.ts:163-166`), so `analyze-skills-gap`'s inside-arrow `throw error` (L286-287) propagates the 401 correctly. The old `std`-serve `onError` concern is superseded — classified clean.
- **SEC-07 split** (resolves RESEARCH Open Q2): analyze-resume + analyze-career MEDIUM -> 02-07; the 3 low-traffic/tightly-bounded ingesters recommended Low residual with the final call deferred to 02-07 (the maximal D-01 stance may enroll all 5 for uniformity).
- **error.message-in-body = LOW-MEDIUM, routed 02-06.** Info-leak / defense-in-depth (internal error text, not secret/PII/cross-user); the project's own RUN-03 spec already deemed the identical compare-jobs case worth retiring.

## Deviations from Plan

None - plan executed exactly as written. This was a discovery-only, read-only sweep (no source files modified; `supabase/functions/**` and `src/**` untouched), so no Rule 1-3 auto-fixes applied. The one substantive discovery (the ~8-function `error.message`-in-body leak) is a NEW finding recorded + routed per the plan's Open-Question-5 instruction, not a code change.

## Issues Encountered
- The standalone `deno test` invocation of `cors-audit.test.ts` failed type-checking (`Cannot find name 'Deno'` — the `deno.ns` lib isn't loaded outside the project's `test:ci` config). Re-ran with `--no-check --allow-read --allow-env` (the assertions still execute) → 64 passed / 0 failed. This is an invocation quirk, not a test failure; the in-gate `test:ci` path loads the correct lib config.

## Authentication Gates
None - the sweep required no external service login (read-only static analysis + a local deno test).

## User Setup Required
None - no external service configuration required. (The DB/env re-pull domains 3/4/8/12/13/15/16/17 are operator-gated and owned by 02-03/02-04, not this plan.)

## Next Phase Readiness
- **02-05/02-06/02-07 remediation inputs ready:** SEC-07 (analyze-resume + analyze-career sanitizer + coverage guard) -> 02-07; SEC-04 XSS regression guard -> 02-07; paddle 500 config-leak + the NEW ~8-function error.message-in-body leak -> 02-06.
- **No NEW crit/high surfaced** — the known crit/high set (Merit idempotency, refund-after-save, paddle replay) lives in the DB/billing/webhook sweep (02-03), so 02-05 does not need a code-fix split on this plan's account (Open Q5 answered: NO new crit/high in the code/edge surface).
- **Sibling sweeps still pending:** 02-03 (DB/RLS/billing/webhook, operator advisor re-pull) and 02-04 (env/supply-chain/isolation, operator names-only re-pull) are independent and unblocked.

## Self-Check: PASSED

- FOUND: `audit/CODE-EDGE-FINDINGS.md` (375 lines, > min 60; contains "SEC-07" ×6; covers domains 1,2,5,6,7,9,10,11,14)
- FOUND: `02-02-SUMMARY.md`
- FOUND commit `1ec06e8b` (Task 1) · FOUND commit `bfa2b55e` (Task 2)
- Guards green: `security-audit-docs` vitest 15/15 (no secret leak in findings doc); `cors-audit.test.ts` 64/0 (domain-5 verify)

---
*Phase: 02-security-audit-remediation*
*Completed: 2026-07-01*

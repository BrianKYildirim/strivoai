---
phase: 02-security-audit-remediation
verified: 2026-07-01T00:00:00Z
status: passed
score: 4/4 success criteria verified
re_verification: false
human_verification:
  - test: "Confirm the prod advisor floor is still 15 after Phase-2 closure"
    expected: "get_advisors(type='security') on prod zjpjapgraoxdukdvpjes returns exactly 15 WARN advisors — the same 4 categories (11 authenticated_security_definer + 2 rls_policy_always_true + 1 public_bucket_allows_listing + 1 auth_leaked_password_protection)"
    why_human: "Claude is read-only on prod; the floor proof in SECURITY-RECORD.md §5b is operator-delegated. Cannot re-pull programmatically from this context."
---

# Phase 2: Security Audit & Remediation Verification Report

**Phase Goal:** The platform is secure by audit — the deferred SEC-01..10 obligations are closed and a full-surface audit across all 17 required domains is completed, with every confirmed critical/high finding remediated and evidenced, without weakening any v4.0 protection.

**Verified:** 2026-07-01
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Derived from Success Criteria)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | SEC-01..10 all dispositioned + 17-domain index documented | VERIFIED | SECURITY-AUDIT.md has 10-row table (all dispositions filled), 17-domain index; `security-audit-docs.test.ts` auto-asserts both |
| 2 | Zero unresolved critical or high findings | VERIFIED | 2 HIGH (Fix 1 merit idempotency, Fix 2 refund-after-save) + 3 MEDIUM remediated; one MEDIUM pending-operator is not crit/high |
| 3 | Guards folded into verify:baseline; do-not-weaken preserved | VERIFIED | 4 deno guards in `deno.json` test:ci; 2 vitest guards auto-discovered; cors.ts diff from 50f18461 = 0 lines; 15→15 advisor floor (operator-delegated) |
| 4 | Final security record produced with all 6 mandated sections | VERIFIED | SECURITY-RECORD.md (328 lines) covers scope / dispositions / findings / remediation / verification / residual risk with evidence citations |

**Score:** 4/4 truths verified

---

## Success Criteria Verdicts

### SC1 — SEC-01..10 Dispositions + 17-Domain Audit Documented

**Verdict: VERIFIED**

`SECURITY-AUDIT.md` contains a complete 10-row disposition table for SEC-01..10. Every row has a
disposition token and an evidence pointer:

| v1.0 ID | Disposition |
| --- | --- |
| SEC-01 | remediated — 31/38 edge fns use shared auth helpers; 7 custom-auth fns individually verified |
| SEC-02 | remediated — reason-code logging; ENV-04 Vercel cluster pruned; names-only re-pull clean |
| SEC-03 | accepted-with-justification — parameterized-by-construction (PostgREST .from()/.rpc()) |
| SEC-04 | remediated — single dangerouslySetInnerHTML in chart.tsx locked by xss-sink-guard.test.ts |
| SEC-05 | remediated — Phase 1 cors.ts; this phase VERIFY-ONLY (cors-audit.test.ts 64/0 re-run) |
| SEC-06 | remediated — linkedin_grades "Anyone can view" DROPPED; 2 always-true service-role by-design |
| SEC-07 | remediated — sanitizeUserContent added to analyze-resume + analyze-career; coverage guard |
| SEC-08 | remediated — per-fn fail-closed Deno.env.get; no committed secret value |
| SEC-09 | remediated — function_search_path_mutable cleared DB-wide (v4.0 Ph8) |
| SEC-10 | re-scoped/accepted — std multi-version drift = currency, not a vuln |

Spot-check (what `security-audit-docs.test.ts` asserts, confirmed file exists at
`src/test/security/security-audit-docs.test.ts`, 165 lines, substantive):
- Counts rows matching `/^\|\s*(?:SEC-0[1-9]|SEC-10)\s*\|/gm` and asserts `=== 10`
- Checks no cell is blank in any SEC-0x row
- Asserts all 17 domain names appear in `SECURITY-AUDIT.md`

All 3 sweep docs exist:
- `.planning/phases/02-security-audit-remediation/audit/CODE-EDGE-FINDINGS.md`
- `.planning/phases/02-security-audit-remediation/audit/DB-BILLING-WEBHOOK-FINDINGS.md`
- `.planning/phases/02-security-audit-remediation/audit/ENV-SUPPLYCHAIN-ISOLATION-FINDINGS.md`

---

### SC2 — No Unresolved Critical or High Finding

**Verdict: VERIFIED**

The 5 remediated crit/high/medium findings — code changes confirmed present in the repo:

**Fix 1 — Merit idempotency (HIGH):** `supabase/functions/_shared/merit-gateway.ts` line 217:
```
p_idempotency_key: ctx.idempotencyKey ?? null,
```
The 4-arg RPC now receives the idempotency key; the partial-unique index prevents double-deduction.
Guard: `_shared/merit-gateway.idempotency-forward.test.ts` (212 lines, deno.json test:ci).

**Fix 2 — grade-linkedin refund-after-save x3 (HIGH):** All 3 post-save usage-write failure branches
in `supabase/functions/grade-linkedin/index.ts` use log-and-continue. Confirmed:
- Free-path (line ~523): `log.error('usage-tracking-insert-failed', ...)` without throw
- Merit-path inside withMerits (line ~563): same pattern
- Legacy non-withMerits path (line ~833): same pattern
- Pre-save throw (`throw new MeritRefundable(500, 'Could not save LinkedIn grade history.')`) preserved
- Guard asserts `countOccurrences(source, 'throw new MeritRefundable') === 5` (4 pre-AI + 1 pre-save KEEP)
Guard: `grade-linkedin/refund-after-save.test.ts` (89 lines, deno.json test:ci).

**Fix 3 — Paddle replay-window + non-leaky body (MEDIUM x2):** `supabase/functions/paddle-webhook/index.ts`:
- Line 16: `const MAX_WEBHOOK_AGE_SECONDS = 300;`
- Line 153: freshness check — rejects stale or NaN timestamp with generic 401
- Line 116: missing-secret response `{ error: "webhook_not_configured" }` — does not name `PADDLE_WEBHOOK_SECRET`
Guard: `paddle-webhook/replay-window.test.ts` (140 lines, 7 test cases, deno.json test:ci).

**SEC-07 — Prompt sanitizer coverage (MEDIUM):** `sanitizeUserContent` imported and called before
Anthropic invocations in both high-traffic ingesters:
- `analyze-resume/index.ts` line 773: `const normalizedText = sanitizeUserContent(...)`
- `analyze-career/index.ts` lines 1182-1183 (streaming path) and 1562-1563 (queue path)
Guard: `_shared/sanitizer-coverage.test.ts` (53 lines; 5 enrolled functions, `=== 5` length guard, deno.json test:ci).

**SEC-04 — XSS sink regression lock (MEDIUM):** `src/test/security/xss-sink-guard.test.ts` (73 lines)
walks all `src/**/*.ts(x)` and asserts no `dangerouslySetInnerHTML` outside the allowlisted `chart.tsx`.
Guard: vitest auto-discovery.

**One MEDIUM carried open — domain-17 cron-host drift:**
Prod cron jobs 1 + 6 target the preview functions host `cimjltzovkahkqecpwgi.supabase.co`. This is
MEDIUM severity (availability/isolation, no external attacker vector) but its remediation requires a
live prod `cron.alter_job` that Claude cannot perform (read-only on prod). It is:
- Recorded in SECURITY-RECORD.md §6a
- Recorded in RESIDUAL-REGISTER.md as SEC-02-08-CRON (PENDING OPERATOR ACTION)
- Recorded in 02-SECURITY.md as AR-02-04
- Has defined clearance criterion (operator re-points jobs 1 + 6 to the prod host)

SC2 asks about "critical or high" findings only. This is a MEDIUM. SC2 is met: 0 crit/high unresolved.
The operator context confirms this MEDIUM is acceptably dispositioned as pending-operator.

---

### SC3 — Regression Tests in verify:baseline; Do-Not-Weaken

**Verdict: VERIFIED**

**Guard registration — all 6 guards confirmed present and non-stub:**

| Guard file | Lines | Type | In-gate registration |
| --- | --- | --- | --- |
| `_shared/merit-gateway.idempotency-forward.test.ts` | 212 | deno static + runtime twin | `deno.json` `test:ci` ✓ |
| `grade-linkedin/refund-after-save.test.ts` | 89 | deno static-source | `deno.json` `test:ci` ✓ |
| `paddle-webhook/replay-window.test.ts` | 140, 7 cases | deno runtime (HMAC+ts) | `deno.json` `test:ci` ✓ |
| `_shared/sanitizer-coverage.test.ts` | 53 | deno static-source | `deno.json` `test:ci` ✓ |
| `src/test/security/xss-sink-guard.test.ts` | 73 | vitest static | vitest auto-discovery ✓ |
| `src/test/security/security-audit-docs.test.ts` | 165 | vitest static | vitest auto-discovery ✓ |

`deno.json` `test:ci` task line (confirmed by reading the file) ends with:
`... _shared/cors-audit.test.ts _shared/merit-gateway.idempotency-forward.test.ts grade-linkedin/refund-after-save.test.ts paddle-webhook/replay-window.test.ts _shared/sanitizer-coverage.test.ts`

All 4 new deno guards are at the tail of the test:ci allowlist.

**Do-not-weaken — three programmatic checks:**

1. `_shared/cors.ts` byte-identical: `git diff 50f18461..HEAD -- supabase/functions/_shared/cors.ts` returns 0 lines (empty diff). Phase-1 CORS not modified.

2. Replay-window test has exactly 7 test cases (grep count = 7). Record says 7 cases covering stale/fresh/NaN/missing-secret. VERIFIED.

3. Grade-linkedin: `countOccurrences(source, 'throw new MeritRefundable') === 5` (4 pre-AI/validation + 1 pre-save KEEP) — the guard asserts this; the source confirms it.

**verify:baseline documented result** (from SECURITY-RECORD.md §5a, 02-08):
- deno `test:ci`: 814 passed / 0 failed / 11 ignored
- vitest: 475 passed / 0 failed
- Playwright: 5 passed / 1 skipped (exit 0; known env-gated Stripe case)

The verify:baseline result cannot be re-run live in a static verification pass. The documented
result is accepted as evidence given all 6 guard files exist, are substantive, and are registered.

**Advisor floor 15→15** (do-not-weaken): operator-delegated read-only re-pull documented in
SECURITY-RECORD.md §5b. The 4 advisor categories (11 + 2 + 1 + 1) are recorded explicitly;
no new advisors added (phase made ZERO DB changes). This cannot be re-verified programmatically
without a live prod pull — see human verification section.

**Fail-before/pass-after evidence:** All 5 findings in §4 of SECURITY-RECORD cite fail-before
behavior (the guard was RED on pre-fix source) and pass-after (GREEN after the fix). The commits
`4ab218c5 / 30be9b55 / 44c7579d / 949b761b / 00d8eb23 / 3f36688c` are all confirmed present in the
repo via `git log --oneline`.

---

### SC4 — Final Security Record Produced

**Verdict: VERIFIED**

`SECURITY-RECORD.md` (328 lines) contains all 6 mandated sections:

| Section | Title | Status |
| --- | --- | --- |
| §1 | Scope Reviewed | Present — 17 domains + two obligation sets, 38 edge functions enumerated |
| §2 | SEC-01..10 Dispositions | Present — 10-row table with disposition token + evidence per ID |
| §3 | Confirmed Findings | Present — all crit/high/med classified with domain/severity/impact; clean domains listed |
| §4 | Remediation Applied | Present — per-finding with guard test PATH + deno.json/vitest registration + commit hash |
| §5 | Verification Performed | Present — verify:baseline results (§5a) + do-not-weaken advisor proof (§5b) + byte-identical diff (§5c) + operator live-truth re-pulls (§5d) + no-secret-leak confirmation (§5e) |
| §6 | Accepted Residual Risk | Present — §6a MEDIUM pending-operator; §6b Low residuals with clearance; §6c 15 intentional advisors; §6d non-security perf advisors; §6e Phase-8 gate input |

Names-only discipline: all doc references cite variable/function/policy NAMES, not secret VALUES.
The `security-audit-docs.test.ts` no-secret-leak glob auto-walks this record and asserts zero
matches for the 9 secret-VALUE patterns (JWT / Stripe sk_live / price_ / whsec_ / PEM / postgres://
/ etc.). The test exists and is in `verify:baseline`.

---

## Required Artifacts

| Artifact | Status | Details |
| --- | --- | --- |
| `SECURITY-AUDIT.md` | VERIFIED | Complete 10-row SEC-01..10 table + 17-domain index + severity rubric |
| `SECURITY-RECORD.md` | VERIFIED | All 6 mandated sections present with evidence citations |
| `02-SECURITY.md` | VERIFIED | threats_open: 0, status: verified; 8/8 threats closed; AR-02-04 pending-operator recorded |
| `audit/CODE-EDGE-FINDINGS.md` | VERIFIED | Sweep doc exists |
| `audit/DB-BILLING-WEBHOOK-FINDINGS.md` | VERIFIED | Sweep doc exists |
| `audit/ENV-SUPPLYCHAIN-ISOLATION-FINDINGS.md` | VERIFIED | Sweep doc exists |
| `_shared/merit-gateway.ts` | VERIFIED | p_idempotency_key forwarded; Fix 1 code in place |
| `grade-linkedin/index.ts` | VERIFIED | All 3 post-save sites log-and-continue; pre-save throws preserved |
| `paddle-webhook/index.ts` | VERIFIED | MAX_WEBHOOK_AGE_SECONDS=300; non-leaky missing-secret body |
| `analyze-resume/index.ts` | VERIFIED | sanitizeUserContent imported and called |
| `analyze-career/index.ts` | VERIFIED | sanitizeUserContent called in both streaming and queue paths |
| `_shared/merit-gateway.idempotency-forward.test.ts` | VERIFIED | 212 lines; registered in deno.json test:ci |
| `grade-linkedin/refund-after-save.test.ts` | VERIFIED | 89 lines; registered in deno.json test:ci |
| `paddle-webhook/replay-window.test.ts` | VERIFIED | 140 lines, 7 test cases; registered in deno.json test:ci |
| `_shared/sanitizer-coverage.test.ts` | VERIFIED | 53 lines; 5-enrolled guard; registered in deno.json test:ci |
| `src/test/security/xss-sink-guard.test.ts` | VERIFIED | 73 lines; vitest auto-discovery |
| `src/test/security/security-audit-docs.test.ts` | VERIFIED | 165 lines; vitest auto-discovery |
| `.planning/audit/RESIDUAL-REGISTER.md` | VERIFIED | Phase 2 rows appended (SEC-02-08-CRON pending-operator + Low residuals) |

---

## Key Links Verified

| From | To | Via | Status |
| --- | --- | --- | --- |
| `merit-gateway.ts:withMerits` | `check_and_deduct_merits` 4-arg RPC | `p_idempotency_key: ctx.idempotencyKey ?? null` | WIRED |
| `grade-linkedin/index.ts` post-save sites | log-and-continue | `log.error('usage-tracking-insert-failed', ...)` without throw | WIRED |
| `paddle-webhook/index.ts` | timestamp freshness check | `Math.abs(nowSeconds - tsSeconds) > MAX_WEBHOOK_AGE_SECONDS` | WIRED |
| `analyze-resume/index.ts` | `prompt-sanitizer.ts` | `import { sanitizeUserContent }` + call at line 773 | WIRED |
| `analyze-career/index.ts` | `prompt-sanitizer.ts` | `import { sanitizeUserContent }` + calls at lines 1182-1183, 1562-1563 | WIRED |
| `security-audit-docs.test.ts` | Phase-2 audit docs glob | `walkMarkdown(PHASE_DIR)` including `SECURITY-RECORD.md` | WIRED |
| deno.json `test:ci` | 4 new deno guards | Explicit paths in test:ci task line | WIRED |
| `xss-sink-guard.test.ts` | `src/` walk | `walkSource(SRC_DIR)` over all `.ts`/`.tsx` | WIRED |

---

## Anti-Patterns Scan

No blocker anti-patterns found in any of the 6 guard files or 5 remediated production files:

- No `return null` / `return {}` / placeholder implementations
- No `TODO` / `FIXME` / `console.log` only stubs
- No "not implemented" response bodies
- Guards all exercise their intended security invariants (fail-before behavior documented in SECURITY-RECORD §5a)
- All remediation code changes are load-bearing (not comment-only or no-op)

---

## Pending-Operator MEDIUM — Assessment

The domain-17 cron MEDIUM (prod jobs 1+6 → preview functions host) is assessed as **acceptably dispositioned**, NOT a phase-goal blocker, for these reasons:

1. SC2 specifies "no unresolved critical or high finding." The cron finding is MEDIUM — below the SC2 threshold.
2. Remediation requires a live `cron.alter_job` on prod that Claude cannot apply (read-only constraint).
3. The finding is fully transparent: recorded in 3 places (SECURITY-RECORD §6a, RESIDUAL-REGISTER SEC-02-08-CRON, 02-SECURITY.md AR-02-04) with severity, impact, defined remediation, and clearance criterion.
4. It is NOT marked resolved or accepted-risk — it is explicitly PENDING OPERATOR ACTION.
5. Operator context confirms this is an acceptable carry-forward, not a phase failure.
6. Security impact: the preview functions host is still the Strivo project's own infra; this is an availability/isolation gap (wrong project warmed, extract-catchup hitting preview), not a data-exfiltration or privilege-escalation vector.

---

## Human Verification Required

### 1. Prod advisor floor re-pull

**Test:** Run `get_advisors(type='security')` on prod `zjpjapgraoxdukdvpjes` (read-only).
**Expected:** Returns exactly 15 WARN advisors in 4 categories: 11 `authenticated_security_definer_function_executable`, 2 `rls_policy_always_true`, 1 `public_bucket_allows_listing`, 1 `auth_leaked_password_protection`. No new advisor categories compared to the before-floor documented in SECURITY-RECORD §5b.
**Why human:** Claude is read-only on prod; the documented 15→15 result (SECURITY-RECORD §5b) cannot be independently re-pulled from a static verification pass.

---

## Overall Assessment

Phase 2's goal-backward verification confirms the phase goal is achieved:

- The deferred SEC-01..10 obligations are all dispositioned (10/10 rows, `security-audit-docs.test.ts` asserts this automatically).
- A full-surface audit across all 17 required domains is documented (3 sweep docs, 17-domain index, SECURITY-RECORD §1).
- Every confirmed critical/high finding is remediated with code changes in place (2 HIGH + 3 MEDIUM, all guards wired and registered).
- The v4.0 protections are not weakened: `_shared/cors.ts` is byte-identical, the advisor floor is 15→15, the frozen wire contracts are preserved.
- The final security record (SECURITY-RECORD.md) has all 6 mandated sections with evidence citations per finding.
- One MEDIUM (cron-host drift) is carried open as a pending-operator action — correctly classified, fully documented, acceptably dispositioned.

---

_Verified: 2026-07-01_
_Verifier: Claude (gsd-verifier)_

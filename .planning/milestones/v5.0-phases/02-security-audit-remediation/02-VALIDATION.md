---
phase: 2
slug: security-audit-remediation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-01
updated: 2026-07-01
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Nyquist sampling target for this phase: **"did we actually make the vulnerable behavior impossible?"**
> Derived from `02-RESEARCH.md` §Validation Architecture (8 sampling points). Populated against the
> 8-plan structure (02-01 scaffold → 02-02/03/04 sweeps → 02-05/06/07 remediation → 02-08 record).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno test (edge/security guards) + Vitest (frontend/doc guards) — both fold into `verify:baseline` |
| **Config file** | `supabase/functions/deno.json` (`test:ci` allowlist = guard-registration surface) + vitest auto-discovery of `src/**/*.test.ts` |
| **Quick run command** | `cd supabase/functions && cross-env DENO_TEST_SUPABASE_REMOTE=0 deno task test:ci` (edge guards) / `npm test` (frontend/doc guards) |
| **Full suite command** | `npm run verify:baseline` (vitest + deno test:ci + Playwright) |
| **Estimated runtime** | ~2–4 min full baseline |

---

## Sampling Rate

- **After every task commit:** Run the quick guard command for the touched surface (`deno task test:ci` for edge; `npm test` for frontend/doc).
- **After every plan wave:** Run `npm run verify:baseline`.
- **Before `/gsd:verify-work`:** Full `verify:baseline` must be green.
- **Max feedback latency:** ~240 seconds.

---

## Per-Task Verification Map

> Every remediated crit/high/med finding cites a guard test that fails-before / passes-after and is
> registered in `supabase/functions/deno.json` `test:ci` (deno) or auto-discovered by vitest (frontend/doc).

| Task Ref | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Guard (test) | Type | Automated Command | Status |
|----------|------|------|-------------|------------|-----------------|--------------|------|-------------------|--------|
| 02-01 T3 | 02-01 | 1 | SEC-11/12/15, SEC-14 | T-02-07/08 | SEC-11 table has 10 non-blank rows · 17 domains covered · no secret VALUE in any audit doc | `src/test/security/security-audit-docs.test.ts` | static (vitest) | `npm test -- security-audit-docs` | ⬜ pending |
| 02-05 T1 | 02-05 | 3 | SEC-13/14 | T-02-01 | Repeated idempotency key → exactly ONE deduction (gateway forwards `p_idempotency_key`; log null-safe on `already_deducted`) | `_shared/merit-gateway.idempotency-forward.test.ts` (static in-gate + gated-remote runtime twin) | static + runtime | `deno task test:ci` | ⬜ pending |
| 02-05 T2 | 02-05 | 3 | SEC-13/14 | T-02-02 | grade-linkedin post-save usage-write failure → success return, NO refund/500 (all 3 sites); pre-save throw KEPT | `grade-linkedin/refund-after-save.test.ts` | static-source | `deno task test:ci` | ⬜ pending |
| 02-06 T1 | 02-06 | 4 | SEC-13/14 | T-02-03, T-02-06 | Paddle stale-`ts` valid signature → rejected; fresh → accepted; missing secret → non-leaky body | `paddle-webhook/replay-window.test.ts` | runtime (HMAC+ts) | `deno task test:ci` | ⬜ pending |
| 02-07 T1 | 02-07 | 5 | SEC-13/14 | T-02-04 | High-traffic AI ingesters (analyze-resume/career + the 3 covered) call the sanitizer; length-guarded =5 | `_shared/sanitizer-coverage.test.ts` | static-source | `deno task test:ci` | ⬜ pending |
| 02-07 T2 | 02-07 | 5 | SEC-13/14 | T-02-05 | No `dangerouslySetInnerHTML` in `src` outside the allowlisted `chart.tsx` | `src/test/security/xss-sink-guard.test.ts` | static (vitest) | `npm test -- xss-sink-guard` | ⬜ pending |
| 02-08 T2 | 02-08 | 6 | SEC-14 | T-02-10 + all | Every new guard present in the gate; `verify:baseline` green; advisor floor not increased; frozen contracts + `_shared/cors.ts` byte-identical | `npm run verify:baseline` + operator advisor re-pull | integration + operator | `npm run verify:baseline` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Security guards authored WITH their fix inside each remediation plan (guard = RED on pre-fix source,
GREEN after) rather than a separate stub wave — the fail-before/pass-after evidence is the RED→GREEN.
The always-GREEN doc/coverage guards land in 02-01. Guard inventory:

- [ ] 02-01: SEC-11 disposition-completeness + SEC-12 17-domain coverage + no-secret-leak grep (`security-audit-docs.test.ts`, GREEN once docs authored).
- [ ] 02-05: Merit idempotency-forward guard (repeated key → 1 deduction) + refund-after-save guard (post-save fail → success, no refund).
- [ ] 02-06: Paddle replay-window guard (stale-ts → rejected; missing secret → non-leaky).
- [ ] 02-07: SEC-07 prompt-sanitizer static coverage guard + SEC-04 XSS-sink regression guard.
- [ ] 02-08: gate-registration check — all new guard paths present in `deno.json` test:ci; `verify:baseline` green.

*New guards follow the `cors-audit.test.ts` static-source-assertion precedent for findings that cannot be
exercised at runtime (config/secret/isolation/coverage classes). The Fix-1 runtime twin + Fix-3 runtime
guard are the two runtime (Class A) guards; both are isolation-safe (Fix-1 twin is skip-by-default;
Fix-3 is pure HMAC+timestamp with no DB-touching import).*

---

## Manual-Only Verifications

Operator-verification (`autonomous: false`) checkpoints — cannot be fully automated; require an operator
action + a recorded reproducible verification in the SEC-15 security record.

| Behavior | Plan | Requirement | Why Manual | Test Instructions |
|----------|------|-------------|------------|-------------------|
| Money-path fixes land safely (Merit idempotency, refund-after-save) | 02-05 | SEC-13 | Live billing seam; operator checkpoint before merge | Review both guards' fail-before/pass-after; confirm no double-charge/double-refund path; optional staging gated-remote run |
| Paddle in-flight-subscription confirmation | 02-06 | SEC-13 | Live billing fact; informs harden-in-place vs defer | Operator confirms whether any `profiles` row has an active future-dated Paddle `current_period_end` |
| Live security-advisor floor (before) | 02-03 | SEC-14 | MCP advisor read; establishes the true current floor vs the documented 15 | Operator runs read-only `get_advisors` on prod; record the count as the phase floor |
| Names-only cross-surface env/isolation re-pull | 02-04 | SEC-12 | Secrets never read/printed by Claude; live truth is operator-only | Operator names-only inventory across Vercel / Supabase prod / preview / GitHub Actions / local; reconcile the 10-item fix-list |
| Live security-advisor floor (after) + phase closure | 02-08 | SEC-14 | Do-not-weaken proof requires an operator re-pull | Operator re-runs read-only `get_advisors`; assert count did NOT increase vs the 02-03 floor; 15 residuals intact |

---

## Validation Sign-Off

- [x] All remediation tasks cite a guard (fails-before/passes-after) registered in the gate
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 guards mapped to owning plans
- [x] No watch-mode flags
- [x] Feedback latency < 240s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution

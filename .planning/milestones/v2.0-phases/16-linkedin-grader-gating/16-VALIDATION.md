---
phase: 16
slug: linkedin-grader-gating
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno test (edge functions) + vitest (frontend unit) |
| **Config file** | `supabase/functions/deno.json` / `vitest.config.ts` |
| **Quick run command** | `deno test supabase/functions/grade-linkedin/ --allow-env --allow-read` |
| **Full suite command** | `deno test supabase/functions/ --allow-env --allow-read` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `deno test supabase/functions/grade-linkedin/ --allow-env --allow-read`
- **After every plan wave:** Run `deno test supabase/functions/ --allow-env --allow-read`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | LIG-01 | — | Free output stripped of Pro fields | unit | `deno test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LIG-02 | — | No profileInsights for Free | unit | `deno test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LIG-03 | — | Pro/Elite full output | unit | `deno test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LIG-05 | — | Free scan flag check | unit | `deno test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LIG-07 | — | maxTokens per tier | unit | `deno test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BACK-09 | — | Merit deduction + refund | unit | `deno test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/functions/grade-linkedin/strip.test.ts` — stubs for LIG-01, LIG-02 (stripLinkedInFreeTier)
- [ ] `supabase/functions/grade-linkedin/free-scan.test.ts` — stubs for LIG-05, LIG-06 (free scan entitlement)
- [ ] `supabase/functions/grade-linkedin/tier-routing.test.ts` — stubs for LIG-07, BACK-09 (maxTokens, Merit costs)

*Existing test infrastructure (Deno test runner, deno.json config) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Free scan resets on monthly cycle | LIG-06 | Requires `reset_subscription_merits` RPC against live DB | Run RPC manually, verify `free_linkedin_scan_used = false` |
| Merit refund on AI failure | BACK-09 | Requires mock Anthropic failure in deployed env | Set `AI_FORCE_FAILURE=true`, trigger scan, verify refund row |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

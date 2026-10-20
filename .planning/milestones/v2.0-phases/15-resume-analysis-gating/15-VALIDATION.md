---
phase: 15
slug: resume-analysis-gating
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-16
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno test (edge functions) + vitest (frontend) |
| **Config file** | `supabase/functions/deno.json` / `vite.config.ts` |
| **Quick run command** | `deno test supabase/functions/_shared/result-merger.test.ts` |
| **Full suite command** | `.\scripts\run-edge-tests.ps1` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `deno test supabase/functions/_shared/result-merger.test.ts`
- **After every plan wave:** Run `.\scripts\run-edge-tests.ps1`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-T2 | 15-01 | 1 | RES-01 | T-15-01 | Free output contains only allowed fields | unit | `deno test supabase/functions/_shared/result-merger.test.ts --filter "applyTierShape free"` | Plan creates | ⬜ pending |
| 15-01-T2 | 15-01 | 1 | RES-02 | T-15-02 | Free output has zero Pro/Elite fields | unit | `deno test supabase/functions/_shared/result-merger.test.ts --filter "applyTierShape free"` | Plan creates | ⬜ pending |
| 15-01-T2 | 15-01 | 1 | RES-03 | — | Pro output has all 11 criteria with feedback | unit | `deno test supabase/functions/_shared/result-merger.test.ts --filter "applyTierShape pro"` | Plan creates | ⬜ pending |
| 15-01-T2 | 15-01 | 1 | RES-04 | — | Elite output has all Pro + eliteInsights | unit | `deno test supabase/functions/_shared/result-merger.test.ts --filter "applyTierShape elite"` | Plan creates | ⬜ pending |
| 15-02-T2 | 15-02 | 1 | RES-05 | T-15-05 | TIER_MAX_TOKENS enforced per tier | unit | `grep -n "TIER_MAX_TOKENS" supabase/functions/_shared/tier-config.ts` | Plan creates | ⬜ pending |
| 15-03-T3 | 15-03 | 2 | RES-06 | T-15-07 | Parallel budgets sum to cap; boot assertion fires on misconfig | unit | `deno test supabase/functions/analyze-resume/index.test.ts --no-check --allow-all` | Plan creates | ⬜ pending |
| 15-03-T2 | 15-03 | 2 | BACK-08 | T-15-06 | rawBody.tier eliminated; tier from server-side | grep | `grep -c "rawBody.tier" supabase/functions/analyze-resume/index.ts` returns 0 | Existing file | ⬜ pending |

*Status: ⬜ pending / ✅ green / ❌ red / ⚠ flaky*

---

## Wave 0 Requirements

- [x] `supabase/functions/_shared/result-merger.test.ts` — applyTierShape unit tests for FREE/PRO/ELITE field whitelists (Plan 15-01 Task 2 creates these)
- [x] `supabase/functions/analyze-resume/index.test.ts` — boot-time assertion tests for D-18/RES-06: correct values pass, misconfigured values throw (Plan 15-03 Task 3 creates this)
- [x] Existing Deno test infrastructure covers framework needs

*All Wave 0 test creation tasks are assigned to plan tasks. No orphan MISSING references.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Free user sees partial output in UI | RES-01 | Requires browser + auth session | Login as Free user, run resume analysis, verify UI renders partial output |
| Elite user sees all extra fields | RES-04 | Requires browser + Elite subscription | Login as Elite user, run resume analysis, verify extra fields render |
| Merit refund on Anthropic failure | BACK-08 | Requires simulating upstream failure | Temporarily break API key, submit analysis, verify merit refund |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution

---
phase: 4
slug: linkedin-grader-backend
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-11
updated: 2026-04-11
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno test (built-in) |
| **Config file** | `supabase/functions/deno.json` |
| **Quick run command** | `deno test supabase/functions/grade-linkedin/ --allow-all` |
| **Full suite command** | `deno test supabase/functions/ --allow-all` |
| **Estimated runtime** | ~15 seconds |
| **Total tests** | 44 (26 validation + 11 prompts + 7 handler-config) |

---

## Sampling Rate

- **After every task commit:** Run `deno test supabase/functions/grade-linkedin/ --allow-all`
- **After every plan wave:** Run `deno test supabase/functions/ --allow-all`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | LIG-12 | T-04-01 | JWT auth required, userId from body rejected | unit (static) | `deno test supabase/functions/grade-linkedin/ --allow-all` | ✅ handler-config.test.ts | ✅ green |
| 04-01-02 | 01 | 1 | LIG-03, LIG-04 | — | Score equals sum of 4 sections | unit | `deno test supabase/functions/grade-linkedin/ --allow-all` | ✅ validation.test.ts | ✅ green |
| 04-01-03 | 01 | 1 | LIG-05, LIG-06 | — | Each section has 3+ feedback points | unit | `deno test supabase/functions/grade-linkedin/ --allow-all` | ✅ validation.test.ts | ✅ green |
| 04-01-04 | 01 | 1 | LIG-08 | — | 4 paste-ready rewrites, headline first, no placeholders | unit | `deno test supabase/functions/grade-linkedin/ --allow-all` | ✅ validation.test.ts | ✅ green |
| 04-01-05 | 01 | 1 | LIG-13 | — | Output matches v3.0 JSON schema | unit | `deno test supabase/functions/grade-linkedin/ --allow-all` | ✅ validation.test.ts | ✅ green |
| 04-01-06 | 01 | 1 | LIG-07 | — | Score calibration: 10+ point gap between weak/strong | manual | N/A | N/A | ⬜ manual |
| 04-01-07 | 01 | 1 | LIG-09 | — | profileInsights 2-4 items always present | unit | `deno test supabase/functions/grade-linkedin/ --allow-all` | ✅ validation.test.ts | ✅ green |
| 04-01-08 | 01 | 1 | LIG-10 | — | Follow-up fetches previous grade, acknowledges improvements | unit | `deno test supabase/functions/grade-linkedin/ --allow-all` | ✅ prompts.test.ts | ✅ green |
| 04-01-09 | 01 | 1 | LIG-02 | — | Uses claude-haiku-4-5 with 8192 max tokens and 60s timeout | unit (static) | `deno test supabase/functions/grade-linkedin/ --allow-all` | ✅ handler-config.test.ts | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `supabase/functions/grade-linkedin/validation.test.ts` — 26 tests for v3.0 schema validation
- [x] `supabase/functions/grade-linkedin/prompts.test.ts` — 11 tests for buildUserMessage follow-up context
- [x] `supabase/functions/grade-linkedin/handler-config.test.ts` — 7 tests for auth, model config, security

*Existing infrastructure covers auth, rate limiting, and usage checking via shared utilities.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Score calibration gap | LIG-07 | Requires real LLM output comparison | Grade a weak and strong profile, verify 10+ point score difference |
| Honest follow-up scoring | LIG-10 (partial) | Requires sequential LLM calls with real profiles | Grade profile, modify, re-grade, verify improvement acknowledgment in feedback |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete

---

## Validation Audit 2026-04-11

| Metric | Count |
|--------|-------|
| Gaps found | 3 |
| Resolved | 3 |
| Escalated | 0 |

**New test files:**
- `handler-config.test.ts` (7 tests) — static analysis of index.ts for requireAuth import, no body.userId, correct model/token/timeout config
- `prompts.test.ts` (11 tests) — unit tests for buildUserMessage with/without follow-up context, buildSystemPrompt section weights

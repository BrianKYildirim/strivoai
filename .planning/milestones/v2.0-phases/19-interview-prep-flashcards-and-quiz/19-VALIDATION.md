---
phase: 19
slug: interview-prep-flashcards-and-quiz
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-17
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend) / deno test (edge functions) |
| **Config file** | `vite.config.ts` (vitest), `supabase/functions/deno.json` (deno test) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run && pwsh scripts/run-edge-tests.ps1` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run && pwsh scripts/run-edge-tests.ps1`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-T1 | 19-01 | 1 | IPC-07 | T-19-01, T-19-02, T-19-03 | RLS user-read-own, service-role-only writes | unit (file check) | `grep -c "CREATE TABLE" supabase/migrations/20260418000000_interview_prep_tables.sql` | Wave 1 | pending |
| 01-T2 | 19-01 | 1 | IPC-02, IPC-03 | T-19-04 | Prompt registration covers all tiers | unit (deno) | `cd supabase/functions && deno check --no-lock _shared/interview-prep-prompts.ts` | Wave 1 | pending |
| 01-T3 | 19-01 | 1 | IPC-02, IPC-03, IPC-04 | -- | Validates AI output shapes | unit (deno) | `cd supabase/functions && deno check --no-lock _shared/interview-prep-validation.ts` | Wave 1 | pending |
| 02-T1 | 19-02 | 2 | IPC-01..03, IPC-05..06, IPC-08, IPC-10, BACK-06 | T-19-05..T-19-10 | Tier gate, daily cap, Merit wrap, sanitize | unit (deno) | `cd supabase/functions && deno check --no-lock interview-prep-analyze/index.ts` | Wave 2 | pending |
| 02-T2 | 19-02 | 2 | IPC-07 | -- | Schema applied to live DB | manual | `supabase db push` (human checkpoint) | -- | pending |
| 03-T1 | 19-03 | 2 | IPC-04, IPC-09, BACK-07 | T-19-11..T-19-15 | Ownership check, Elite gate, 500-char enforce | unit (deno) | `cd supabase/functions && deno check --no-lock interview-prep-evaluate/index.ts` | Wave 2 | pending |
| 04-T1 | 19-04 | 3 | IPC-01, IPC-02 | T-19-16, T-19-17 | ProFeatureGate, tier routing | build | `npm run build` | Wave 3 | pending |
| 04-T2 | 19-04 | 3 | IPC-02 | -- | Input form + flashcard display | build | `npm run build` | Wave 3 | pending |
| 05-T1 | 19-05 | 4 | IPC-03, IPC-04, IPC-10 | T-19-18 | Quiz flow, 500-char enforce client | build | `npm run build` | Wave 4 | pending |
| 05-T2 | 19-05 | 4 | IPC-04, IPC-05, IPC-06 | T-19-19 | Results, streak display, wiring | build | `npm run build` | Wave 4 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:
- Vitest is configured and running for frontend builds (`npm run build` validates TypeScript)
- Deno check validates edge function types (`deno check --no-lock`)
- No additional test framework installation needed
- All tasks have real `<automated>` verify commands (type checks and builds), not MISSING placeholders

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Database schema push to live DB | IPC-07 | Requires Supabase CLI auth + project link | Plan 02 Task 2 checkpoint: `supabase db push`, verify 3 tables exist |
| Pro flashcard card layout renders correctly | IPC-02 | Visual UI verification | Generate flashcards as Pro user, verify 3 cards with STAR content |
| Elite quiz one-at-a-time flow works | IPC-03 | Interactive UI flow | Start quiz as Elite, answer all questions, verify progression |
| Streak flame/cold/expired visual states | IPC-05 | Visual state verification | Check flame icon states at 0h, 24h, 48h boundaries |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

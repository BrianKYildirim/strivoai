---
phase: 23
slug: interview-prep-runtime-overhaul
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `.planning/phases/23-interview-prep-runtime-overhaul/23-RESEARCH.md` § Validation Architecture

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Frontend framework** | Vitest 1.6.1 + @testing-library/react 14.3.1 + jsdom 24.1.3 |
| **Edge-function framework** | `deno test` + `https://deno.land/std@0.168.0/testing/asserts.ts` (fixtureKey: `interview_prep` replay) |
| **Frontend config** | `package.json` scripts `test`, `test:watch` |
| **Edge config** | `supabase/functions/deno.json` + `supabase/functions/tsconfig.json` |
| **Quick run command** | `npm test -- --changed` (frontend) · `deno test --allow-net --allow-env --allow-read supabase/functions/interview-prep-analyze/__tests__/` (edge replay, no Anthropic spend) |
| **Full suite command** | `npm test` + full edge unit suite + `RUN_EVALS=1 deno test --filter "evals:interview-prep"` (pre-promotion, live Anthropic) |
| **Estimated runtime** | ~30s (replay) · ~90s (full unit) · ~5m (evals live) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --changed` (frontend) + replay `deno test` for any touched edge function directory.
- **After every plan wave:** Run full `npm test` + full edge unit suite (all 11 integration files).
- **Before `/gsd-verify-work`:** Full suite green + `RUN_EVALS=1 deno test --filter "evals:interview-prep"` against staging (Dimensions 1, 2, 3, 4, 5, 11, 12 blocking per AI-SPEC §5).
- **Max feedback latency:** 30 seconds for per-task replay suite.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 0 | SC-1 / IPC-01 | T-23-FE-01 | Free tier never triggers analyze | unit (frontend) | `npm test -- InterviewPrep.freeGate` | ❌ W0 | ⬜ pending |
| 23-02-01 | 02 | 0 | SC-11 | T-23-RLS-01 | Service-role-only writes; user-read-own on 3 tables | SQL integration | `deno test --filter "rls.interview-tables"` | ❌ W0 | ⬜ pending |
| 23-03-01 | 03 | 1 | SC-2 | T-19-08 | Pro + no resume → 400 `no_resume`; 0 Merit debit | integration (edge) | `deno test --filter "analyze.no-resume"` | ❌ W0 | ⬜ pending |
| 23-03-02 | 03 | 1 | SC-3 / IPC-02 | — | Pro → 3 flashcards, resume-anchored, 8 Merits, 5K budget | integration | `deno test --filter "analyze.pro-flashcards"` | ❌ W0 | ⬜ pending |
| 23-03-03 | 03 | 1 | SC-4 | — | 1 Elite-taste/month Pro; 2nd → 429 no charge | integration (frozen clock) | `deno test --filter "analyze.elite-taste-quota"` | ❌ W0 | ⬜ pending |
| 23-03-04 | 03 | 1 | SC-5 / IPC-03 | — | 5/5/6/7 Qs by duration; `quiz_id` + int `question_order` | integration | `deno test --filter "analyze.elite-quiz-count"` | ❌ W0 | ⬜ pending |
| 23-03-05 | 03 | 1 | SC-8 / IPC-05/06 | — | Streak +1 first-after-UTC-midnight; 24h cold; 48h expiry; 4th/day → 429 | integration (frozen clock) | `deno test --filter "analyze.streak-and-cap"` | ❌ W0 | ⬜ pending |
| 23-03-06 | 03 | 1 | SC-9 | — | 9 §10 sections in order; optional fields referenced when filled | integration | `deno test --filter "analyze.nine-sections"` + `deno test --filter "validation.no-silent-drops"` | ❌ W0 | ⬜ pending |
| 23-04-01 | 04 | 1 | SC-6 | T-23-SRV-02 | Browser disables Submit at 500; server 400 > 500 | unit + integration | `npm test -- CharacterCounter` + `deno test --filter "evaluate.answer-length"` | ❌ W0 | ⬜ pending |
| 23-04-02 | 04 | 1 | SC-7 / IPC-04 | T-23-EVAL-01 | Join on `parseInt(question_id) === question_order`; never trust client text | integration | `deno test --filter "evaluate.question-order-join"` | ❌ W0 | ⬜ pending |
| 23-04-03 | 04 | 1 | SC-4 (evaluate path) | T-23-EVAL-02 | Pro w/ quiz.tier='elite_taste' reaches evaluate | integration | `deno test --filter "evaluate.pro-elite-taste-access"` | ❌ W0 | ⬜ pending |
| 23-05-01 | 05 | 2 | SC-10 | — | Weak-fit fixture → `not_ready` / `needs_work` band | eval (LLM judge) | `RUN_EVALS=1 deno test --filter "evals:interview-prep:honest-scoring"` | ❌ W0 | ⬜ pending |
| 23-05-02 | 05 | 2 | SC-12 | T-23-PROMPT-01 | Global AI Principles auto-prepend Pro/Elite; absent Free | unit | `deno test --filter "tier-prompts.interview-prepend"` | ❌ W0 (extend existing) | ⬜ pending |
| 23-06a-01 | 06a | 3 | SC-13 | — | Runtime §13.4 copy byte-for-byte (InterviewPrep.test.tsx snapshot — page rewrite) | unit snapshot | `npm test -- InterviewPrep` | ❌ W0 | ⬜ pending |
| 23-06a-02 | 06a | 3 | SC-14 | — | No LinkedIn/voice/history/spaced-repetition UI affordances at page level | grep + manual | `grep -r "voice_capture\|linkedin_profile\|spaced_repetition" src/pages/InterviewPrep.tsx` → 0 hits | — | ⬜ pending |
| 23-06b-01 | 06b | 2 | SC-14 | — | No v1-out-of-scope refs across the 10 payload components + CharacterCounter | grep + build | `grep -rn "voice_capture\|linkedin_profile\|spaced_repetition" src/components/interviewPrep/` → 0 hits | — | ⬜ pending |
| 23-06b-02 | 06b | 2 | SC-6 | T-23-SRV-02 | D-15 CharacterCounter color states (muted 0-499, primary =500, destructive >500) — component moved from 06a per revision round 2 | unit | `npm test -- CharacterCounter` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/types/interviewPrep.ts` — Zod schema + `z.infer` types (D-17)
- [ ] `src/components/interviewPrep/CharacterCounter.tsx` + `CharacterCounter.test.tsx` — D-15 color states
- [ ] `src/components/interviewPrep/StreakDisplay.tsx` + `StreakDisplay.test.tsx` — 5 streak variants (D-19)
- [ ] `src/pages/InterviewPrep.test.tsx` — state-machine transitions + §13.4 copy snapshot (D-16, D-18)
- [ ] `supabase/functions/interview-prep-analyze/__tests__/tier-contract.test.ts` — Pro / Elite / Elite-taste shape assertions
- [ ] `supabase/functions/interview-prep-analyze/__tests__/merit-refund.test.ts` — refund taxonomy (5xx/408/529/network/Abort only; Dimension 11)
- [ ] `supabase/functions/interview-prep-analyze/__tests__/elite-taste-quota.test.ts` — frozen-clock Pro monthly gate
- [ ] `supabase/functions/interview-prep-analyze/__tests__/streak-and-cap.test.ts` — frozen-clock daily-cap + 24h cold + 48h expire
- [ ] `supabase/functions/interview-prep-analyze/__tests__/no-silent-drops.test.ts` — substring-scan helper tests
- [ ] `supabase/functions/interview-prep-analyze/__tests__/eval.suite.test.ts` — gated by `RUN_EVALS=1`
- [ ] `supabase/functions/interview-prep-analyze/__tests__/fixtures/dataset/*.json` — 30 labeled examples (Senior Technical Recruiter labeled; Cohen's κ ≥ 0.7 top 3 dims)
- [ ] `supabase/functions/interview-prep-analyze/__tests__/fixtures/injection/promptfooconfig.yaml` + 12+ adversarial fixtures (Dimension 12)
- [ ] `supabase/functions/interview-prep-evaluate/__tests__/question-order-join.test.ts` — SC-7 integer-join
- [ ] `supabase/functions/interview-prep-evaluate/__tests__/answer-length.test.ts` — 500-char server reject
- [ ] `supabase/functions/interview-prep-evaluate/__tests__/pro-elite-taste-access.test.ts` — Pro-monthly-taste reaches evaluator
- [ ] `supabase/functions/_tests/rls-interview.test.ts` — service-role write + user-read-own on the 3 amended tables
- [ ] Framework install (Wave 0): `npm install --save-dev promptfoo` — for Dimension 12 CI

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Character counter color transitions (muted → accent at 500 → destructive > 500) | SC-6 | Visual state tuning | Open InterviewPrep Elite, type to exactly 500 / 501 chars; confirm class names change on `<span data-testid="char-counter">` |
| Streak UI variants (active / cold / expired / first-time / cap-reached) | IPC-06 | Visual QA | Run staging DB seeds for each streak state; confirm `<StreakDisplay>` renders variant + exact §13.4 copy |
| v1 out-of-scope absence (LinkedIn field, voice button, history link, spaced-repetition toggle) | SC-14 | Negative UI assertion | Navigate full InterviewPrep flow; confirm none of the affordances appear at any state |
| Merit balance visibly decrements after Pro flashcard success and does NOT decrement on 400/403/429 | SC-3 / Merit refund | Requires browser session + live state | Run Pro flow with balance 20 → success → balance 12; trigger 429 cap → balance unchanged |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (per-task replay)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

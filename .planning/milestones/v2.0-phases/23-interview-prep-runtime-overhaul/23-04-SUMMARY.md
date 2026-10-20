---
phase: 23
plan: 04
subsystem: interview-prep-evaluate
tags: [tier-gate, pro-elite-taste, integration-tests, deno]
requirements: [SC-4, SC-6, SC-7, IPC-04]
dependency_graph:
  requires:
    - 23-02 (interview_quizzes.tier CHECK now accepts 'elite_taste')
    - 23-01 (tier vocabulary + Zod schemas — not directly imported by evaluate, but
      the InterviewPrepPayload schema the Elite evaluate path echoes is governed by 01)
  provides:
    - "evaluate endpoint: widened tier gate (Elite OR Pro+elite_taste)"
    - "integration-test scaffolding under interview-prep-evaluate/__tests__/"
  affects:
    - Plan 05 (frontend) — consumes the new 'elite_or_elite_taste_required' error code
    - Plan 06a/06b (UI wiring) — StreakDisplay / Results renderer unaffected; error-state
      copy may reference the new code
    - Plan 08 (verification) — tests ready to run once the live-DB env vars are populated
tech-stack:
  added: []
  patterns:
    - "Live-DB integration tests with auto-skip when env unset (mirrors Phase 23 Plan 02
       rls-interview.test.ts harness; testOpts = { sanitizeOps: false, sanitizeResources: false })"
    - "Tier gate moved AFTER ownership check so tier-leak via error-code differential is
       impossible (defends T-23-EVAL-03 by construction)"
key-files:
  created:
    - supabase/functions/interview-prep-evaluate/__tests__/evaluate.answer-length.test.ts
    - supabase/functions/interview-prep-evaluate/__tests__/evaluate.question-order-join.test.ts
    - supabase/functions/interview-prep-evaluate/__tests__/evaluate.pro-elite-taste-access.test.ts
  modified:
    - supabase/functions/interview-prep-evaluate/index.ts
decisions:
  - "Pre-filter Free at the top of the handler returns 'elite_or_elite_taste_required'
     (not 'elite_only') so the legacy code is eradicated in one pass and Free/Free-equivalent
     tiers see the same error text as the downstream Pro+non-elite_taste case. No user-visible
     downside because Free users should never see the error (client-side gating applies
     before the request fires)."
  - "Tier gate split into two checks: (a) cheap pre-filter rejects Free before the DB call,
     (b) full gate (Elite OR Pro+quiz.tier='elite_taste') fires AFTER the ownership check.
     This preserves T-23-EVAL-03 'no tier leakage' without requiring a second DB round-trip."
  - "Elite users who somehow own an elite_taste quiz (manual DB seed for testing) still pass
     the gate — the OR short-circuits on `userContext.tier === 'elite'`. This is the desired
     behavior for QA and future admin-seeded test accounts."
metrics:
  duration_min: ~25
  completed: 2026-04-20
  commits: 2
  net_line_change_index_ts: 21  # +25 insertions, -4 deletions
---

# Phase 23 Plan 04: Widen interview-prep-evaluate Tier Gate + Integration Tests Summary

Applied a surgical edit to `supabase/functions/interview-prep-evaluate/index.ts` that widens the Elite-only tier gate inherited from Phase 19 to accept Pro users whose quiz row has `tier='elite_taste'` (Phase 23 D-02, D-05). All other Phase 19 behaviors — the 500-char server-side slice, the `parseInt(question_id, 10)` integer join to `question_order`, the ownership check via `.eq('user_id', userId)`, the 409 re-evaluate guard — are preserved verbatim and grep-verified. Three Deno integration test files were added under `__tests__/` covering SC-4 (evaluate side), SC-6, and SC-7 with auto-skip gates for live-DB env vars.

## What Shipped

### 1. `supabase/functions/interview-prep-evaluate/index.ts` — surgical edit (+25 / -4 = 21 net)

**Edit 1 — Widened auth-time pre-filter (lines 79-90):**

Previously `if (userContext.tier !== 'elite') return 403 elite_only`. Now:

```ts
if (userContext.tier !== 'elite' && userContext.tier !== 'pro') {
  return 403 elite_or_elite_taste_required;
}
```

This admits Pro users to the ownership + quiz-fetch pipeline so the fine-grained check below can see `quiz.tier`.

**Edit 2 — Added `tier` to the quiz-fetch SELECT (line 145):**

```diff
- .select('id, user_id, mode, evaluated_at, job_description')
+ .select('id, user_id, mode, evaluated_at, job_description, tier')
```

**Edit 3 — Inserted the widened gate immediately after the `mode !== 'quiz'` check (lines 173-187):**

```ts
const canEvaluate =
  userContext.tier === 'elite' ||
  (userContext.tier === 'pro' && quiz.tier === 'elite_taste');
if (!canEvaluate) {
  log.warn('tier-gate-denied', { tier: userContext.tier, quizTier: quiz.tier });
  return 403 elite_or_elite_taste_required;
}
```

**Diff check:** `git diff --stat` reports `1 file changed, 25 insertions(+), 4 deletions(-)` — well under the plan's 30-line surgical budget.

### 2. Three integration test files under `supabase/functions/interview-prep-evaluate/__tests__/`

All three use the Plan 02 `rls-interview.test.ts` live-DB harness pattern:
- `sanitizeOps: false, sanitizeResources: false` via `testOpts` (prevents GoTrueClient interval leak)
- Env-guarded auto-skip (`ignore: !hasEnv`) — missing env → tests skip cleanly, no CI breakage
- Each file's docstring lists required env vars + the `deno test` command

**`evaluate.answer-length.test.ts` (3 Deno.test blocks, SC-6, T-23-SRV-02):**

| Test | Input | Expected stored length | Proves |
|------|-------|------------------------|--------|
| 1 | 500-char answer | 500 | slice is a no-op at the boundary |
| 2 | 501-char answer | 500 | server-side truncation fires (client cannot submit 501) |
| 3 | 800-char answer | 500 | unbounded truncation — T-23-SRV-02 defense |

Each test submits via the deployed `interview-prep-evaluate` HTTP endpoint then reads back the `user_answer` column via service-role client and asserts its string length.

**`evaluate.question-order-join.test.ts` (3 Deno.test blocks, SC-7, T-23-EVAL-01):**

| Test | Fixture returns | Assertion |
|------|-----------------|-----------|
| 1 | `question_id: "2"` | `interview_quiz_answers.question_order = 2` (integer) has a numeric `score` |
| 2 | `question_id: "abc"` | Handler returns 200; NaN filter updates zero rows without crashing |
| 3 | `question_id: "3"` only (of 5) | Order-3 row updated; orders 1, 2, 4, 5 still `NULL` |

These tests pin the `parseInt(scoreEntry.question_id, 10) → question_order` integer-join behavior that defends against T-23-EVAL-01 (prompt-injection via free-text question match).

**`evaluate.pro-elite-taste-access.test.ts` (5 Deno.test blocks, SC-4 evaluate side, T-23-EVAL-02 / T-23-EVAL-03):**

| # | Actor | Quiz | Expected |
|---|-------|------|----------|
| 1 | Pro | own, `tier='elite_taste'` | 200 or 409 (tier gate passes; 409 only if already evaluated) — must NOT be `elite_or_elite_taste_required` |
| 2 | Pro | own, `tier='pro'` (flashcard) | 400 `invalid_mode` or 403 `elite_or_elite_taste_required` (both legitimate refusals) |
| 3 | Elite | own, `tier='elite_taste'` | 200 or 409 — Elite retains access (no regression) |
| 4 | Free | anything | 403 `elite_or_elite_taste_required` (pre-filter blocks before quiz fetch) |
| 5 | Pro | **different user's** `elite_taste` | 403 `not_found` (ownership check fires first — T-23-EVAL-03 no tier leakage) |

Test 5 is the Information Disclosure defense: seeing `elite_or_elite_taste_required` on a cross-user request would reveal that (a) the quiz exists, (b) its tier is `elite_taste`, and (c) it belongs to someone else. The ordering (`ownership check → tier gate`) makes that leak structurally impossible.

## Deviations from Plan

### Plan adaptation — Fixture-replay env key naming

The plan's skeleton references `ANTHROPIC_FIXTURE_MODE=replay` as the env var for fixture replay. The shared `_shared/anthropic.ts` mock path actually keys on `AI_TEST_MODE=true` plus a `fixtureKey` parameter (verified via grep). The `evaluate.question-order-join.test.ts` file documents this in its docstring and uses `ANTHROPIC_FIXTURE_VARIANT` as a convenience handle for per-test scripted responses — these are controlled by the fixture JSON created in Plan 03 (not this plan). Tests 2 and 3 of the question-order file explicitly note that fixture variants are a Plan-03 artifact and will activate once that fixture ships.

No deviation from the tier-gate semantics, the 500-char contract, or the integer-join contract.

### Scope — elite_only error-code removal

The plan explicitly required `grep -c "elite_only" supabase/functions/interview-prep-evaluate/index.ts == 0`. The pre-filter rewrite (Edit 1) returns the new `elite_or_elite_taste_required` code instead of keeping a legacy `elite_only` branch. This is a superset of the plan's wording — the plan says "update log statements that say elite_only" (Edit 3); the cleaner path is to simply not introduce it. Grep confirms zero remaining occurrences.

## Authentication Gates

None. All edits are code-only and do not require secret or login interaction.

## Verification

### Grep-verifiable acceptance (from plan's `<acceptance_criteria>`):

| Check | Expected | Actual |
|-------|----------|--------|
| `grep -c "elite_or_elite_taste_required" ...index.ts` | >= 1 | 2 |
| `grep -c "elite_only" ...index.ts` | == 0 | 0 |
| `grep -c "quiz.tier === 'elite_taste'" ...index.ts` | >= 1 | 1 |
| `grep -c "userContext.tier === 'pro'" ...index.ts` | >= 1 | 1 |
| `grep -c "userContext.tier === 'elite'" ...index.ts` | >= 1 | 1 |
| `grep -c "answer_text.slice(0, 500)" ...index.ts` | >= 1 | 1 |
| `grep -c "parseInt.*question_id" ...index.ts` | >= 1 | 2 |
| `grep -c "eq('user_id', userId)" ...index.ts` | >= 1 | 1 |
| `grep -c "evaluated_at" ...index.ts` | >= 2 | 3 |
| `grep -c "select.*tier" ...index.ts` | >= 1 | 1 |
| `deno check ...index.ts` | exits 0 | pass |
| `grep -c "Deno.test" answer-length.test.ts` | >= 3 | 3 |
| `grep -c "Deno.test" question-order-join.test.ts` | >= 3 | 3 |
| `grep -c "Deno.test" pro-elite-taste-access.test.ts` | >= 5 | 5 |
| `grep -c "500" answer-length.test.ts` | >= 3 | 16 |
| `grep -c "question_order" question-order-join.test.ts` | >= 2 | 10 |
| `grep -c "elite_or_elite_taste_required\|elite_taste" pro-elite-taste-access.test.ts` | >= 2 | 29 |
| `deno check` on all 3 test files | exits 0 | pass |

All acceptance criteria met.

## No-Regression Confirmation

Elite users evaluating Elite-tier quizzes (`userContext.tier === 'elite'`) still pass the widened gate via the left-hand side of the `||`. The only behavioral delta for the Elite path is that `quiz.tier` is now included in the SELECT (harmless — the column always existed under the Phase 23 `('pro','elite','elite_taste')` CHECK).

## Commits

| SHA | Subject |
|-----|---------|
| `728a1e5` | `feat(23-04): widen interview-prep-evaluate tier gate for Pro elite_taste` |
| `03507a3` | `test(23-04): add integration tests for SC-4, SC-6, SC-7 on evaluate endpoint` |

Both committed on `worktree-agent-adfb4f82` with `--no-verify` per parallel-executor protocol.

## Known Stubs

None. The tier gate edit is a complete behavior change; the tests are live-DB integration tests that skip cleanly when env is unset — not placeholders.

## Deferred Issues

None. The question-order-join tests 2 and 3 reference fixture variants owned by Plan 03 (`interview-prep-analyze/__tests__/fixtures/interview_prep.fixture.json`). These are NOT stubs in Plan 04 scope — they represent the expected contract of the Plan 03 fixture, which this plan is not allowed to create.

## Threat Flags

None. The plan's threat register (T-23-SRV-02, T-23-EVAL-01..05) is fully addressed by preserved Phase 19 behaviors + the new ordering (ownership-first, tier-gate-second).

## Self-Check: PASSED

- [x] `supabase/functions/interview-prep-evaluate/index.ts` present and modified on worktree `worktree-agent-adfb4f82`
- [x] `supabase/functions/interview-prep-evaluate/__tests__/evaluate.answer-length.test.ts` present (3 Deno.test)
- [x] `supabase/functions/interview-prep-evaluate/__tests__/evaluate.question-order-join.test.ts` present (3 Deno.test)
- [x] `supabase/functions/interview-prep-evaluate/__tests__/evaluate.pro-elite-taste-access.test.ts` present (5 Deno.test)
- [x] Commit `728a1e5` present on worktree-agent-adfb4f82 (`git log --oneline | grep 728a1e5` returns one row)
- [x] Commit `03507a3` present on worktree-agent-adfb4f82
- [x] `deno check` exits 0 on all 4 files (index.ts + 3 test files)
- [x] All grep-verifiable acceptance rows match plan-required counts

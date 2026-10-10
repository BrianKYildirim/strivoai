---
phase: 05-deep-test-coverage-expansion
plan: 03
subsystem: testing
tags: [deno, deno-test, test:ci, pattern-A, source-read, handler-config, recruiting-lens, analyze-skills-gap, compare-jobs, chat-agent, merit-gateway, no-merit, legacy-merit-gate, rate-limit, characterization-test, actual-state]

# Dependency graph
requires:
  - phase: 01-testing-strategy-regression-baseline
    provides: "verify:baseline gate (vitest+deno-offline+Playwright), deno.json test:ci allowlist, v4.0-baseline tag, grade-linkedin/handler-config.test.ts Pattern-A analog, 05-SUSPECTED-BEHAVIOR.md D-08 register"
  - phase: 05-deep-test-coverage-expansion (plan 02)
    provides: "grown test:ci allowlist (587 passed|0 failed baseline), Pattern-A characterization-correctness discipline (assert ACTUAL wired helper, not plan-wording string)"
provides:
  - "recruiting-lens handler-config source-read: requireAuth(type:user)/no body.userId, Free-tier 403 elite gate, withMerits('recruiting_lens') behind the legacy MERIT_SYSTEM_ENABLED && userContext gate, mergeRecruitingLensResults seam, getModel/getMaxOutput/getMaxInputChars/getTimeout central caps, rate-limit, 500 catch (14 cases)"
  - "analyze-skills-gap handler-config source-read (NEW): ACTUAL legacy MERIT_SYSTEM_ENABLED && userContext gate + withMerits('skills_gap_analysis'), legacy checkAndRecordUsage path, requireAuth/no-body.userId, claude-haiku-4-5+ANTHROPIC_MODEL_TEXT, maxTokens 4000/85s, 429/402, 500 catch (12 cases)"
  - "compare-jobs handler-config source-read (NEW): ACTUAL legacy merit gate + withMerits('job_comparison'), legacy checkAndRecordUsage, requireAuth with identity from userContext.userId (rawBody.userId is legacy-usage-counter-only, not auth), 2..5 job bounds, 429/402, 500 catch (13 cases)"
  - "chat-agent handler-config source-read (NEW): the ACTUAL NO-merit characterization — source.includes('withMerits')===false (+ no MERIT_SYSTEM_ENABLED/MeritRefundable/usage-checker), gates SOLELY on per-tier checkRateLimit; requireAuth/no-body.userId, maxTokens 300, D-13 role-pin + D-14 length cap, 429->graceful-200, 500 catch (12 cases)"
  - "deno test:ci grown 587 -> 638 passed | 0 failed (+51 cases across 4 new files)"
affects: [05-04, 05-05, 05-07, dependency-hygiene, database-cleanup, performance-refactoring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern A (source-read substring assertion): characterize an inline-serve handler's auth/merit/model-config/error wiring as WIRED via assertEquals(source.includes(...), bool) against index.ts with the Windows leading-slash strip (rawPath.startsWith('/') && rawPath[2]===':' ? slice(1)); std@0.168.0 to match the grade-linkedin analog (do not modernize the import — two std-assert versions coexist)"
    - "Pattern-A ACTUAL-state characterization (non-uniform merit wiring): assert each handler's REAL gating, never assumed uniformity — chat-agent NO withMerits (negative assertion source.includes('withMerits')===false), recruiting-lens/analyze-skills-gap/compare-jobs all behind the legacy MERIT_SYSTEM_ENABLED && userContext gate + a legacy checkAndRecordUsage path"
    - "Scope-the-negative-auth-assertion: where a legacy substring (compare-jobs `rawBody.userId`) is genuinely present but feeds ONLY the legacy usage-counter (not auth), assert the POSITIVE auth source (checkRateLimit(userContext.userId / userId: userContext.userId) + !body.userId) rather than a blanket !rawBody.userId that would be a false RED"

key-files:
  created:
    - "supabase/functions/recruiting-lens/handler-config.test.ts"
    - "supabase/functions/analyze-skills-gap/handler-config.test.ts"
    - "supabase/functions/compare-jobs/handler-config.test.ts"
    - "supabase/functions/chat-agent/handler-config.test.ts"
  modified:
    - "supabase/functions/deno.json"
    - ".planning/phases/05-deep-test-coverage-expansion/05-SUSPECTED-BEHAVIOR.md"

key-decisions:
  - "chat-agent's NO-merit state is the load-bearing characterization: asserted source.includes('withMerits')===false (+ no MERIT_SYSTEM_ENABLED/MeritRefundable/checkAndRecordUsage/recordUsageWithAnalysis). chat-agent gates SOLELY on the per-tier checkRateLimit('chat-agent', 5/15/30). This catches a future refactor that silently adds/removes merit gating on the chat surface. Not escalated (chat-agent is a maxTokens:300 advisory chat with no billing surface — bounded design, not a monetization bug)."
  - "compare-jobs reads `rawBody.userId` (line ~150) but ONLY as input to the legacy usage-counter checkAndRecordUsage(userId,'job_comparison') — NEVER as the auth identity (auth is requireAuth(type:'user') -> userContext.userId, which is what checkRateLimit and the withMerits owner use). Scoped the negative auth assertion to the positive identity source (checkRateLimit(userContext.userId, userId: userContext.userId, !body.userId) so the present-but-benign rawBody.userId substring was not a false RED. Same care class as 05-02's rawBody.tier-in-a-comment lesson."
  - "All four chosen std@0.168.0/testing/asserts.ts to match the grade-linkedin/handler-config.test.ts Pattern-A analog being replicated — not modernized to @0.224.0 (zero-functional-change applies to test churn; match the neighbor, per PATTERNS 'two coexisting std-assert versions')."
  - "No D-08 escalation. The three irregular-looking states (chat-agent no-merit; analyze-skills-gap + compare-jobs legacy MERIT_SYSTEM_ENABLED gate) are documented MIG-05 design, same class as the already-pinned recruiting-lens/career legacy branches — characterized in-test + logged in 05-SUSPECTED-BEHAVIOR.md, not escalated. All four index.ts byte-identical vs v4.0-baseline (control verification clean)."

requirements-completed: [TEST-03, TEST-05]

# Metrics
duration: 14min
completed: 2026-06-19
---

# Phase 05 Plan 03: Live-AI Handler Coverage Summary

**Added Pattern-A source-read handler-config coverage for the four opted-in live AI features — `recruiting-lens` (deepening its existing merger seam), and the three that had NO test file (`analyze-skills-gap`, `compare-jobs`, `chat-agent`) — each asserting its ACTUAL non-uniform auth + merit/rate-limit + model-config state on the gate, with chat-agent's NO-merit (rate-limit-only) and analyze-skills-gap + compare-jobs's legacy `MERIT_SYSTEM_ENABLED && userContext` gates explicitly characterized, growing the offline gate 587 -> 638 passed | 0 failed with zero product-source change.**

## Performance

- **Duration:** ~14 min
- **Tasks:** 2
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- **Task 1 (recruiting-lens +14, analyze-skills-gap +12):**
  - `recruiting-lens/handler-config.test.ts` — `requireAuth(req,{type:'user'})` (not `requireInternalOrUserAuth`), no `body.userId`/`body['userId']` auth (identity from `userContext!.userId`), the Free-tier 403 `elite_required` gate, `withMerits('recruiting_lens')` behind the legacy `MERIT_SYSTEM_ENABLED && userContext` gate, `MeritRefundable` failure classification, the `mergeRecruitingLensResults` + `executeParallelCalls` 3-call seam, `getModel(resolvedTier as Tier,'recruiting')`, `getMaxOutput('recruitingLens','pro'|'elite')`, `getMaxInputChars('recruitingLens'`, `getTimeout(tier as Tier)`, `checkRateLimit` keyed `'recruiting-lens'`, and the 500 `internal_error` catch.
  - `analyze-skills-gap/handler-config.test.ts` (NEW) — the ACTUAL legacy `MERIT_SYSTEM_ENABLED && userContext` gate + `withMerits('skills_gap_analysis')` + `MeritRefundable`/`JSON parse failed`, the legacy non-merit `checkAndRecordUsage(userId,'skills_gap_analysis')` path, `requireAuth`/no-`body.userId`/no-`rawBody.userId`, `claude-haiku-4-5-20251001` via `ANTHROPIC_MODEL_TEXT`, `maxTokens: 4000`/`timeoutMs: 85000`/`fixtureKey:'analyze_skills_gap'`, `checkRateLimit` keyed `'analyze-skills-gap'`, the 429/402 AI-gateway branches, and the 500 catch.
- **Task 2 (compare-jobs +13, chat-agent +12):**
  - `compare-jobs/handler-config.test.ts` (NEW) — the ACTUAL legacy merit gate + `withMerits('job_comparison')`, the legacy `checkAndRecordUsage(userId,'job_comparison')` path, `requireAuth` with identity from `userContext.userId` (scoped the negative auth assertion so the present-but-benign legacy `rawBody.userId` usage-counter input was not a false RED), the 2..5 job-count + `MAX_TOTAL_SIZE` bounds, `claude-haiku-4-5` + `ANTHROPIC_MODEL_TEXT`, `maxTokens: 4000`/`85000`/`fixtureKey:'compare_jobs'`, `checkRateLimit` keyed `'compare-jobs'`, 429/402, 500 catch.
  - `chat-agent/handler-config.test.ts` (NEW) — the load-bearing **NO-merit** characterization: `source.includes('withMerits') === false` (+ no `MERIT_SYSTEM_ENABLED`/`MeritRefundable`/`checkAndRecordUsage`/`recordUsageWithAnalysis`); gates SOLELY on `checkRateLimit` keyed `'chat-agent'` + `createRateLimitResponse`; `requireAuth`/no-`body.userId`, `claude-haiku-4-5` via `ANTHROPIC_MODEL_TEXT` + `maxTokens: 300`, the D-13 role-pin (`role: 'user' as const`) + D-14 `MAX_MESSAGE_LENGTH = 2000` cap, the 429 -> graceful-200 retry-later reply, and the 500 fallback catch.
- **Gate:** all four files registered on `test:ci` in the SAME change as their creation (Task 1 then Task 2); full gate 587 -> 613 -> 638 passed | 0 failed. `verify:baseline` green (vitest passed, deno 638/0, Playwright 5 passed + 1 quarantine-skip).

## ACTUAL-State Characterization Matrix

| Function | auth | merit wiring (ACTUAL) | usage record | model / cap | new file? | cases |
|----------|------|-----------------------|--------------|-------------|-----------|-------|
| `recruiting-lens` | `requireAuth(type:user)`, no body.userId, Free->403 | `withMerits('recruiting_lens')` behind legacy `MERIT_SYSTEM_ENABLED && userContext` | `recordUsageWithAnalysis` (in-merit, via persist) | `getModel`/`getMaxOutput`/`getMaxInputChars`/`getTimeout` central caps | deepened | 14 |
| `analyze-skills-gap` | `requireAuth(type:user)`, no body.userId | legacy gate + `withMerits('skills_gap_analysis')` | legacy `checkAndRecordUsage('skills_gap_analysis')` | haiku-4-5 + `ANTHROPIC_MODEL_TEXT`, 4000/85s | NEW | 12 |
| `compare-jobs` | `requireAuth(type:user)`, identity=userContext (rawBody.userId = legacy usage-counter only) | legacy gate + `withMerits('job_comparison')` | legacy `checkAndRecordUsage('job_comparison')` | haiku-4-5 + `ANTHROPIC_MODEL_TEXT`, 4000/85s | NEW | 13 |
| `chat-agent` | `requireAuth(type:user)`, no body.userId | **NONE** — `!includes('withMerits')`, no MERIT_SYSTEM_ENABLED | **NONE** — no usage-checker | haiku-4-5 + `ANTHROPIC_MODEL_TEXT`, 300 | NEW | 12 |

## Deviations from Plan

None — the plan executed exactly as written. Both tasks: created the files with the grade-linkedin slash-strip source-read template, asserted ACTUAL state (chat-agent no-merit; analyze-skills-gap + compare-jobs legacy gate), appended each file pair to the `test:ci` allowlist in the same change, ran isolation then full gate, confirmed `git diff v4.0-baseline` empty for all four `index.ts`, and ran `verify:baseline` green.

One authoring care-point (handled inline, not a deviation): `compare-jobs/index.ts` genuinely contains `const userId = rawBody.userId` for the legacy usage-counter, so the negative auth assertion was scoped to the positive identity source (`checkRateLimit(userContext.userId`, `userId: userContext.userId`, `!body.userId`) instead of a blanket `!rawBody.userId` — avoiding a false RED (same lesson as 05-02's `rawBody.tier`-in-a-comment).

## D-08 Suspected-Behavior Register

No new pin-and-log rows; **no escalation**. Added a "Plan 05-03" prose section to `05-SUSPECTED-BEHAVIOR.md` documenting the three irregular-looking-but-intentional states reviewed: chat-agent's NO-merit (rate-limit-only) state, and the legacy `MERIT_SYSTEM_ENABLED && userContext` gates on analyze-skills-gap + compare-jobs (same MIG-05 dual-path design class as the recruiting-lens/career branches already pinned in 05-01/05-02). All four `index.ts` are byte-identical vs `v4.0-baseline` — no accounting/auth regression to escalate. chat-agent is not on the business-critical escalate list (no billing surface). SB-05-01 / SB-05-02 remain the only logged table rows.

## Task Commits

1. **Task 1: recruiting-lens + analyze-skills-gap handler-config source-read** - `2ade5e1` (test)
2. **Task 2: compare-jobs + chat-agent handler-config source-read** - `ed0c000` (test)

## Issues Encountered

- The compare-jobs `rawBody.userId` care-point above — resolved on the first authoring pass (no false RED hit because the negative assertion was scoped correctly up front). No fix-attempt-limit pressure.

## Next Phase Readiness

- The four opted-in live AI features (recruiting-lens / analyze-skills-gap / compare-jobs / chat-agent) now have their auth + merit/rate-limit + model-config invariants pinned on the offline gate for Plans 05-04/05/07 and Phases 6/8/9 to lean on, with the per-handler non-uniformity (chat-agent no-merit; two legacy gates) explicitly characterized so a future migration can't silently drift them.
- No blockers.

## Self-Check: PASSED

- All four created files verified present on disk (recruiting-lens, analyze-skills-gap, compare-jobs, chat-agent `handler-config.test.ts`).
- Both task commits verified in git history: `2ade5e1`, `ed0c000`.
- `deno task test:ci` -> 638 passed | 0 failed (587 + 51); all four new files run on the gate and appear in the allowlist stdout.
- `verify:baseline` green (vitest + deno 638/0 + Playwright 5 passed + 1 quarantine-skip).
- Zero product-source change: `git diff v4.0-baseline -- recruiting-lens/index.ts analyze-skills-gap/index.ts compare-jobs/index.ts chat-agent/index.ts` all EMPTY.

---
*Phase: 05-deep-test-coverage-expansion*
*Completed: 2026-06-19*

---
phase: 01-cross-origin-error-contract-foundation
plan: 03
subsystem: api
tags: [cors, deno, edge-functions, error-contract, interview-prep, skills-gap, chat-agent, compare-jobs]

# Dependency graph
requires:
  - phase: 01-01
    provides: "withCors(req, type, handler, opts?) wrapper (CORS guaranteed on success / thrown Response / thrown Error / OPTIONS preflight; ReadableStream bodies passed through unbuffered) + request-aware ALLOWED_ORIGINS core"
provides:
  - "interview-prep-analyze entrypoint routed through withCors(req, 'user', () => handler(req)) at its IS_TEST-guarded serve(handler) site"
  - "interview-prep-evaluate inline-serve entrypoint routed through serve((req) => withCors(req, 'user', async () => { … }))"
  - "analyze-skills-gap inline-serve entrypoint routed through withCors(req, 'user', …)"
  - "chat-agent inline-serve entrypoint routed through withCors(req, 'user', …)"
  - "compare-jobs named-handler serve site wrapped: serve((req) => withCors(req, 'user', () => handler(req))); IS_TEST guard + return-error contract preserved"
  - "Second batch of user Edge Functions now emits origin-aware CORS (apex+www) on success AND on thrown/returned 401/4xx/5xx, plus preflight — covering the analysis/agent functions beyond the four production-observed ones (CORS-02, CORS-05)"
affects: [wave-2-function-rollout, wave-3-cors-audit, security-audit, phase-3-error-taxonomy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Outermost-entrypoint-only wrapping: wrap serve()/serve(handler) in withCors; never touch the inline corsHeaders calls inside handlers (withCors overlays ACAO on the way out)"
    - "Two wrap idioms reused from 01-02: inline closure → serve((req) => withCors(req,'user', async () => { …body… })); named handler → serve((req) => withCors(req,'user', () => handler(req)))"
    - "Inner OPTIONS short-circuit + `if (error instanceof Response) return/throw error` left in place — withCors short-circuits OPTIONS before the handler and re-merges CORS onto the returned/thrown Response"

key-files:
  created:
    - .planning/phases/01-cross-origin-error-contract-foundation/01-03-SUMMARY.md
  modified:
    - supabase/functions/compare-jobs/index.ts
    - supabase/functions/interview-prep-analyze/index.ts
    - supabase/functions/interview-prep-evaluate/index.ts
    - supabase/functions/analyze-skills-gap/index.ts
    - supabase/functions/chat-agent/index.ts

key-decisions:
  - "Wrapped only the outermost serve site per function (import + serve-open + serve-close); zero edits inside handler bodies, OPTIONS lines, or return/throw-error catch blocks"
  - "compare-jobs + interview-prep-analyze wrapped at their IS_TEST-guarded serve(handler) sites (named-handler idiom), preserving the `return error` contract and the test seam; interview-prep-evaluate / analyze-skills-gap / chat-agent wrapped inline as serve((req) => withCors(req,'user', async () => { … }))"
  - "None of the five pass extraHeaders, so no 4th withCors arg (unlike analyze-resume/analyze-career in 01-02)"

patterns-established:
  - "withCors owns CORS for actual responses (it has req); inner per-function OPTIONS lines remain harmless (withCors short-circuits OPTIONS before the handler runs)"
  - "Mixed exit contracts (compare-jobs/analyze-skills-gap/chat-agent `return error`, analyze-skills-gap/chat-agent `throw error`) all converge: withCors overlays CORS on returned Responses and maps thrown Error → CORS-tagged 500"

requirements-completed: [CORS-02, CORS-05]

# Metrics
duration: 2min
completed: 2026-06-27
---

# Phase 1 Plan 03: Wave-2 User-Function withCors Rollout (Batch 2 — analysis/agent functions) Summary

**The remaining analysis/agent user Edge Functions — interview-prep-analyze, interview-prep-evaluate, analyze-skills-gap, chat-agent, compare-jobs — now route their `serve()` entrypoints through `withCors(req, 'user', …)`, overlaying origin-aware apex+www CORS on every success and every thrown/returned 401/4xx/5xx (and origin-aware preflight), with no behavior change beyond guaranteed CORS.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-27T11:58:07Z
- **Completed:** 2026-06-27T12:00:48Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Wrapped the two named-handler functions (compare-jobs, interview-prep-analyze) at their `IS_TEST`-guarded `serve(handler)` sites via `serve((req) => withCors(req, 'user', () => handler(req)))`, preserving their `return error` (not throw) contract and the test-import seam — so the bare 401s and `return error` 500s the browser used to swallow now carry origin-aware CORS.
- Wrapped the three inline-closure functions (interview-prep-evaluate, analyze-skills-gap, chat-agent) as `serve((req) => withCors(req, 'user', async () => { … }))`, leaving each handler body, inner OPTIONS short-circuit, and outer `throw error` / `return error` catch untouched — withCors maps thrown Error → CORS-tagged 500 and overlays CORS on returned Responses.
- Kept the diff to import + serve-open + serve-close per function (3-line wrapper for inline closures, import + serve-line for the named-handler guard); no `extraHeaders` needed for any of the five (none passed an internal-job allow-header).
- Confirmed the rollout invariant: `grep -c "withCors(req, 'user'"` = 1 in each of the five `index.ts` files. All existing per-function contract tests stay green: 28 (Task 1: compare-jobs handler-config + auth-rethrow, interview-prep-analyze failure-branches, interview-prep-evaluate handler-config) + 24 (Task 2: analyze-skills-gap + chat-agent handler-config) = 52 deno tests passed, 0 failed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wrap compare-jobs, interview-prep-analyze, interview-prep-evaluate** - `55f97112` (feat)
2. **Task 2: Wrap analyze-skills-gap and chat-agent** - `1d27dc1e` (feat)

## Files Created/Modified
- `supabase/functions/compare-jobs/index.ts` - `serve(handler)` (IS_TEST-guarded) → `serve((req) => withCors(req, 'user', () => handler(req)))`; `withCors` added to the existing `../_shared/cors.ts` import; `return error` paths in `handler` untouched.
- `supabase/functions/interview-prep-analyze/index.ts` - Same named-handler guarded-serve wrap; `withCors` added to import; §10 handler body untouched.
- `supabase/functions/interview-prep-evaluate/index.ts` - Inline `serve(async (req) => {…})` → `serve((req) => withCors(req, 'user', async () => {…}))`; `withCors` added to import.
- `supabase/functions/analyze-skills-gap/index.ts` - Same inline wrap; `withCors` added to import; outer `throw error` left for withCors to map to a CORS-tagged 500.
- `supabase/functions/chat-agent/index.ts` - Same inline wrap; `withCors` added to import.

## Decisions Made
- **Outermost serve site only.** Per the wrapping recipe + RESEARCH §3-4 and the 01-02 precedent, only the `serve()` call changed. The inline `corsHeaders` spreads inside handlers were left alone — `withCors`/`mergeCors` overlays ACAO on the way out, so touching them would be redundant churn.
- **No `extraHeaders` 4th arg.** Unlike analyze-resume/analyze-career (01-02), none of these five pass an internal-job allow-header, so the default allow-headers are correct.
- **Inner OPTIONS + return/throw-error blocks kept in place.** withCors short-circuits OPTIONS before the handler runs (inner OPTIONS line is harmless) and re-catches/return-merges so both `return error` (named-handler contract) and `throw error` (inline) paths get CORS — intentionally left untouched (recipe + RESEARCH Pitfall 1 belt-and-suspenders).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. The compare-jobs `auth-rethrow` suite logged the expected offline-env `getUser` network `NotCapable`/`TypeError` (no `--allow-net`), which the test deliberately surfaces as a propagated 401 — all 28 Task-1 regression/contract tests and 24 Task-2 handler-config tests passed. The plan's anchor line numbers matched the live files closely (compare-jobs serve at 353-355, interview-prep-analyze serve at 731-735, interview-prep-evaluate inline serve at 59/353, analyze-skills-gap 21/294, chat-agent 10/86); each edit was anchored on unique surrounding context.

## User Setup Required
None - no external service configuration introduced by this plan. (The phase-level `ALLOWED_ORIGINS` Supabase edge-secret + redeploy-all-functions operator step is inherited from 01-01 and remains a phase-completion prerequisite for live apex+www verification, not new to this plan.) Note: Interview Prep is feature-flagged off on the production frontend, but its Edge Functions remain active/deployed user functions — wrapping them keeps the CORS invariant uniform and regression-free for when the feature is re-enabled (per the plan objective + RESEARCH §4).

## Next Phase Readiness
- These five plus the four from 01-02 cover nine of the 21 user functions; the remaining Wave-2 user functions (plans 01-04..01-07) get the identical mechanical wrap, and the Wave-3 `cors-audit.test.ts` drift guard can assert each user `index.ts` routes its entrypoint through `withCors` / `handleOptionsRequest`.
- No live end-to-end CORS proof until the operator sets `ALLOWED_ORIGINS` on both Supabase projects and **redeploys** these functions (shared `_shared/cors.ts` is bundled per-function at deploy) — inherited blocker from 01-01.

## Self-Check: PASSED

- Files verified on disk: compare-jobs/index.ts, interview-prep-analyze/index.ts, interview-prep-evaluate/index.ts, analyze-skills-gap/index.ts, chat-agent/index.ts (all present) + this SUMMARY.
- Commits verified: `55f97112` (Task 1), `1d27dc1e` (Task 2) both present in git log.
- Invariant: `grep -c "withCors(req, 'user'"` = 1 in each of the five `index.ts` files (>= 1 required).
- Tests: 52 deno tests passed / 0 failed (28 Task-1 across compare-jobs handler-config + auth-rethrow, interview-prep-analyze failure-branches, interview-prep-evaluate handler-config; 24 Task-2 across analyze-skills-gap + chat-agent handler-config).

---
*Phase: 01-cross-origin-error-contract-foundation*
*Completed: 2026-06-27*

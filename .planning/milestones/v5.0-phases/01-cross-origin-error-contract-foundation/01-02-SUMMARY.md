---
phase: 01-cross-origin-error-contract-foundation
plan: 02
subsystem: api
tags: [cors, deno, edge-functions, streaming, sse, error-contract]

# Dependency graph
requires:
  - phase: 01-01
    provides: "withCors(req, type, handler, opts?) wrapper (CORS guaranteed on success/thrown Response/thrown Error/OPTIONS; ReadableStream bodies passed through unbuffered) + jsonError + request-aware ALLOWED_ORIGINS core"
provides:
  - "analyze-resume entrypoint routed through withCors(req, 'user', …, { extraHeaders: 'x-internal-job-secret' }) — streaming SSE success path preserved (body passthrough, no buffering)"
  - "analyze-career entrypoint routed through withCors(req, 'user', …, { extraHeaders: 'x-internal-job-secret' })"
  - "grade-linkedin inline-serve entrypoint routed through withCors(req, 'user', …)"
  - "recruiting-lens named-handler serve site wrapped: serve((req) => withCors(req, 'user', () => handler(req))); IS_TEST guard + return-error contract preserved"
  - "The four production-observed user functions (Resume Analysis, Career Compass, LinkedIn Grader, Recruiting Lens) now emit origin-aware CORS (apex+www) on success AND on thrown 401/4xx/5xx, removing the www.strivoai.net outage for the highest-blast-radius surface"
affects: [wave-2-function-rollout, wave-3-cors-audit, security-audit, phase-3-error-taxonomy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Outermost-entrypoint-only wrapping: wrap serve()/serve(handler) in withCors; never touch the ~80 inline corsHeaders calls inside handlers (withCors overlays ACAO on the way out)"
    - "Two wrap idioms: inline closure → serve((req) => withCors(req,'user', async () => { …body… }[, opts])); named handler → serve((req) => withCors(req,'user', () => handler(req)))"
    - "Inner OPTIONS short-circuit + `if (error instanceof Response) throw/return error` left in place — withCors re-catches and merges CORS onto the thrown Response"

key-files:
  created:
    - .planning/phases/01-cross-origin-error-contract-foundation/01-02-SUMMARY.md
  modified:
    - supabase/functions/analyze-resume/index.ts
    - supabase/functions/analyze-career/index.ts
    - supabase/functions/grade-linkedin/index.ts
    - supabase/functions/recruiting-lens/index.ts

key-decisions:
  - "Wrapped only the outermost serve site per function (3-line diff each: import + serve-open + serve-close); zero edits inside handler bodies or the SSE assembly"
  - "extraHeaders: 'x-internal-job-secret' threaded as withCors' 4th arg for analyze-resume + analyze-career so preflight + responses keep the internal-job allow-header"
  - "recruiting-lens wrapped at the IS_TEST-guarded serve(handler) site (not inside handler), preserving its named-handler return-error idiom and the 07.1-03 test seam"

patterns-established:
  - "withCors owns CORS for actual responses (it has req); inner per-function OPTIONS lines remain harmless (withCors short-circuits OPTIONS before the handler runs)"
  - "Streaming passthrough verified by construction: withCors → mergeCors → new Response(res.body, …) never reads/awaits the SSE ReadableStream"

requirements-completed: [CORS-02, CORS-05]

# Metrics
duration: 4min
completed: 2026-06-27
---

# Phase 1 Plan 02: Wave-2 User-Function withCors Rollout (4 production-observed functions) Summary

**The four production-observed user Edge Functions — Resume Analysis (streaming SSE), Career Compass, LinkedIn Grader, Recruiting Lens — now route their `serve()` entrypoints through `withCors(req, 'user', …)`, overlaying origin-aware apex+www CORS on every success and thrown 401/4xx/5xx, with the analyze-resume streaming path preserved (unbuffered body passthrough).**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-27T11:51:22Z
- **Completed:** 2026-06-27T11:55:01Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Wrapped both `extraHeaders`-carrying inline-closure entrypoints (analyze-resume, analyze-career) in `withCors(req, 'user', async () => { … }, { extraHeaders: 'x-internal-job-secret' })`, so apex+www CORS now rides every response and the bare 401s the browser used to swallow surface with CORS headers — while the analyze-resume SSE assembly stayed byte-unchanged (3-line wrapper diff only).
- Wrapped grade-linkedin's inline-closure entrypoint the same way (no extraHeaders) and recruiting-lens at its IS_TEST-guarded `serve(handler)` site via `serve((req) => withCors(req, 'user', () => handler(req)))`, preserving its named-handler `return error` idiom.
- Confirmed the streaming passthrough is safe by construction: `withCors` → `mergeCors` rebuilds `new Response(res.body, …)` and never reads/awaits the `ReadableStream` (cors.ts:180-190), so the `text/event-stream` body is not buffered.
- All existing per-function failure-branch / contract / handler-config tests stay green: 33 (Task 1) + 39 (Task 2) = 72 deno tests passed, 0 failed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wrap analyze-resume (streaming) and analyze-career with withCors** - `74477a94` (feat)
2. **Task 2: Wrap grade-linkedin and recruiting-lens with withCors** - `2ea83161` (feat)

## Files Created/Modified
- `supabase/functions/analyze-resume/index.ts` - `serve(async (req) => {…})` → `serve((req) => withCors(req, 'user', async () => {…}, { extraHeaders: 'x-internal-job-secret' }))`; `withCors` added to the existing `../_shared/cors.ts` import; SSE streaming return path untouched.
- `supabase/functions/analyze-career/index.ts` - Same inline-closure wrap with `{ extraHeaders: 'x-internal-job-secret' }`; `withCors` added to import.
- `supabase/functions/grade-linkedin/index.ts` - Inline-closure wrap `serve((req) => withCors(req, 'user', async () => {…}))`; `withCors` added to import.
- `supabase/functions/recruiting-lens/index.ts` - Named-handler serve site wrapped `serve((req) => withCors(req, 'user', () => handler(req)))`; `withCors` added to import; IS_TEST guard + handler return-error paths preserved.

## Decisions Made
- **Outermost serve site only.** Per the wrapping recipe + RESEARCH §3-4, only the `serve()` call was changed (import + open + close = 3 lines per inline function, 2 lines for recruiting-lens). The ~80 inline `corsHeaders` spreads inside handlers were left alone — `withCors`/`mergeCors` overlays ACAO on the way out, so touching them would be redundant churn.
- **extraHeaders threaded as the 4th arg** for analyze-resume + analyze-career (they passed `x-internal-job-secret` to `handleOptionsRequest`), keeping the internal-job allow-header on both preflight and responses.
- **Inner OPTIONS + re-throw catch blocks kept in place.** `withCors` short-circuits OPTIONS before the handler runs (so the inner OPTIONS line is harmless), and re-catches the `instanceof Response` re-throws to merge CORS — both intentionally left untouched (recipe + RESEARCH Pitfall 1 belt-and-suspenders).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. The plan's anchor line numbers had drifted slightly from the live files (e.g. analyze-career OPTIONS at :781 vs serve-open at :779; grade-linkedin serve at :352/OPTIONS :355; recruiting-lens serve at :778-780), but the documented idioms matched exactly and each edit was anchored on unique surrounding context. The recruiting-lens `handler-config` test that asserts "named handler with an IS_TEST-guarded serve" stayed green, confirming the wrap preserved that seam.

## User Setup Required
None - no external service configuration introduced by this plan. (The phase-level `ALLOWED_ORIGINS` Supabase edge-secret + redeploy-all-functions operator step is inherited from 01-01 and remains a phase-completion prerequisite for live apex+www verification, not new to this plan.)

## Next Phase Readiness
- These four are a subset of the 21 user functions; the remaining Wave-2 user functions get the identical mechanical wrap, and the Wave-3 `cors-audit.test.ts` drift guard can now assert each user `index.ts` routes its entrypoint through `withCors` / `handleOptionsRequest`.
- No live end-to-end CORS proof until the operator sets `ALLOWED_ORIGINS` on both Supabase projects and **redeploys** these functions (shared `_shared/cors.ts` is bundled per-function at deploy) — inherited blocker from 01-01.

## Self-Check: PASSED

- Files verified on disk: analyze-resume/index.ts, analyze-career/index.ts, grade-linkedin/index.ts, recruiting-lens/index.ts, 01-02-SUMMARY.md (all present).
- Commits verified: `74477a94` (Task 1), `2ea83161` (Task 2) both present in git log.
- Invariant: `grep -c "withCors(req, 'user'"` = 1 in each of the four `index.ts` files (>= 1 required).
- Tests: 72 deno tests passed / 0 failed (33 Task-1 + 39 Task-2 across failure-branches / test-07 / phase22-contract / handler-config).
- Streaming passthrough confirmed by construction: `withCors` → `mergeCors` rebuilds `new Response(res.body, …)` without reading the SSE `ReadableStream`; analyze-resume diff is exactly the 3 wrapper lines (import + serve-open + serve-close).

---
*Phase: 01-cross-origin-error-contract-foundation*
*Completed: 2026-06-27*

---
phase: 01-cross-origin-error-contract-foundation
plan: 05
subsystem: api
tags: [cors, deno, edge-functions, email, notify, keep-warm, wave-2]

# Dependency graph
requires:
  - phase: 01-01
    provides: "withCors(req, type, handler, opts?) wrapper + origin-aware handleOptionsRequest from _shared/cors.ts"
provides:
  - "send-notification-email, test-email, notify-upgrade-request, keep-warm entrypoints route through withCors(req, 'user', …) — origin-aware CORS on success and every error/throw exit"
  - "keep-warm inbound preflight is origin-aware; its outbound server-to-server OPTIONS warm-pings (no Origin) remain untouched — no warming regression"
affects: [wave-3-cors-audit, security-audit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Named-handler functions wrap at the serve site: serve((req) => withCors(req, 'user', () => handler(req)))"
    - "Inline-serve functions wrap the closure: serve((req) => withCors(req, 'user', async () => { … })) with closing }))"
    - "Inner OPTIONS short-circuit left in place (dead but harmless — withCors short-circuits OPTIONS first); inline-with-cors 401s left intact (withCors merge is idempotent)"

key-files:
  created: []
  modified:
    - supabase/functions/send-notification-email/index.ts
    - supabase/functions/test-email/index.ts
    - supabase/functions/notify-upgrade-request/index.ts
    - supabase/functions/keep-warm/index.ts

key-decisions:
  - "send-notification-email and notify-upgrade-request use a named `handler` const + serve(handler) (not the inline serve the plan's anchor lines described); wrapped at the serve site via () => handler(req), matching the compare-jobs/recruiting-lens/interview-prep-analyze idiom from prior waves"
  - "notify-upgrade-request's two inline-with-cors 401s (lines 32/41) left untouched — already the good pattern; withCors overlays idempotently on the non-401 paths"
  - "keep-warm outbound OPTIONS warm-pings left unchanged — withCors only governs keep-warm's own inbound responses"

patterns-established: []

requirements-completed: [CORS-02, CORS-05]

# Metrics
duration: 4min
completed: 2026-06-27
---

# Phase 1 Plan 05: Email / Notify / Warm withCors Rollout Summary

**The send-notification-email, test-email, notify-upgrade-request, and keep-warm user Edge Functions now route their `serve()` entrypoints through `withCors(req, 'user', …)`, guaranteeing origin-aware CORS on every success and error exit — with keep-warm's outbound server-to-server warm-pings and notify-upgrade-request's inline-with-cors 401s left intact (no behavior change beyond guaranteed CORS).**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-27T12:09:55Z
- **Completed:** 2026-06-27T12:14:21Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Wrapped all four email/notify/warm user functions so that — per CORS-02 + CORS-05 — a request from an approved Origin gets origin-reflected CORS on success AND on any thrown `Response`/`Error`, closing the error-path CORS gap by construction rather than by hand-spreading headers.
- Matched the wrap idiom to each function's actual entrypoint shape: named-handler functions (`send-notification-email`, `notify-upgrade-request`) wrapped at their `serve(handler)` site via `serve((req) => withCors(req, 'user', () => handler(req)))`; inline-serve functions (`test-email`, `keep-warm`) wrapped the closure with a balanced `}))` close.
- Preserved keep-warm's warming contract: its outbound `method: 'OPTIONS'` server-to-server pings (no Origin) are unchanged, and a no-Origin inbound preflight still returns 200 with ACAO omitted — no warming regression (RESEARCH §9).
- Left notify-upgrade-request's two inline-with-cors 401s (the already-good pattern) untouched; the withCors overlay is idempotent and covers its remaining non-401 exits.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wrap send-notification-email, test-email, notify-upgrade-request** - `ca7caed8` (feat)
2. **Task 2: Wrap keep-warm** - `349aad80` (feat)

## Files Created/Modified
- `supabase/functions/send-notification-email/index.ts` - `serve(handler)` → `serve((req) => withCors(req, 'user', () => handler(req)))`; `withCors` added to the `../_shared/cors.ts` import.
- `supabase/functions/test-email/index.ts` - inline admin-gated `serve(async (req) => {…})` → `serve((req) => withCors(req, 'user', async () => {…}))`; `withCors` added to import.
- `supabase/functions/notify-upgrade-request/index.ts` - `serve(handler)` wrapped; the two inline-with-cors 401s left intact; `withCors` added to import.
- `supabase/functions/keep-warm/index.ts` - inbound `serve(async (req) => {…})` wrapped in `withCors`; outbound warm-ping OPTIONS calls unchanged; `withCors` added to import.

## Decisions Made
- **Wrap at the serve site for named-handler functions.** The plan's `<action>` anchor lines described an inline `serve(async (req) => …)` for send-notification-email (162) and notify-upgrade-request (26), but both actually use a named `const handler = … ; serve(handler)`. Wrapping at the `serve(handler)` call as `serve((req) => withCors(req, 'user', () => handler(req)))` is the established prior-wave idiom (compare-jobs, recruiting-lens, interview-prep-analyze) and satisfies the `withCors(req, 'user'` grep gate without restructuring the handler body.
- **Leave inner OPTIONS short-circuits and inline 401s in place.** Per the wrapping recipe, the inner `if (req.method === 'OPTIONS')` lines stay (withCors short-circuits OPTIONS first, so they are harmless), and notify-upgrade-request's inline-with-cors 401s stay (idempotent merge).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan anchor lines assumed inline serve; two functions use named-handler + serve(handler)**
- **Found during:** Task 1
- **Issue:** The plan said "inline serve at send-notification-email/index.ts:162" and "notify-upgrade-request ... inline serve with OPTIONS at :26". Both functions actually define `const handler = async (req) => {…}` and call `serve(handler)` at the file tail (send-notification-email:212, notify-upgrade-request:124). The literal inline-wrap recipe did not apply.
- **Fix:** Wrapped at the `serve(handler)` site using `serve((req) => withCors(req, 'user', () => handler(req)))` — the exact idiom already used by the prior-wave named-handler functions. Identical CORS outcome; the inner OPTIONS short-circuit and inline 401s remain valid.
- **Files modified:** supabase/functions/send-notification-email/index.ts, supabase/functions/notify-upgrade-request/index.ts
- **Verification:** `grep -c "withCors(req, 'user'"` = 1 for each; notify-upgrade-request's two `status: 401` inline-cors responses still present.
- **Committed in:** ca7caed8 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — anchor-line mismatch, resolved with the established named-handler wrap idiom)
**Impact on plan:** None behaviorally — same origin-aware-CORS-on-every-exit outcome the plan specified. No scope creep.

## Issues Encountered
- Local `deno check` on the four files reports only pre-existing config/env noise — `TS5095`/`TS5109` (the frontend root `tsconfig` `module`/`moduleResolution` misapplied) and `TS2304: Cannot find name 'Deno'` (deno.ns lib not loaded in this local invocation). These are repo-wide and unrelated to the edits (which is why CI runs edge tests with `--no-check`); the type-checker parsed the full function bodies (errors at lines 79+), confirming the serve-wrap parens are balanced. Out of scope per the deviation SCOPE BOUNDARY — not fixed.

## User Setup Required
- None new. The Wave-1 operator prerequisite still stands (set `ALLOWED_ORIGINS` on both Supabase projects and redeploy all functions so the rewritten `_shared/cors.ts` ships, since shared modules are bundled per-function at deploy).

## Next Phase Readiness
- These four functions are now part of the uniform `withCors`-wrapped surface that the Wave-3 `cors-audit.test.ts` (01-07) will assert as the durable drift guard. No dedicated deno tests exist for these functions; grep-presence was the gate this plan.

## Self-Check: PASSED

- Files verified on disk: send-notification-email, test-email, notify-upgrade-request, keep-warm `index.ts` each contain `withCors(req, 'user'` exactly once.
- notify-upgrade-request inline 401s preserved (2 `status: 401` responses); keep-warm outbound `method: 'OPTIONS'` warm-ping intact (1).
- Commits verified in git log: `ca7caed8` (Task 1), `349aad80` (Task 2).

---
*Phase: 01-cross-origin-error-contract-foundation*
*Completed: 2026-06-27*

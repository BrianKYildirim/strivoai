---
phase: 01-cross-origin-error-contract-foundation
plan: 01
subsystem: api
tags: [cors, deno, edge-functions, auth, error-contract, allowlist]

# Dependency graph
requires:
  - phase: none
    provides: first plan of the milestone — no upstream dependency
provides:
  - "Request-aware _shared/cors.ts: env-driven ALLOWED_ORIGINS allowlist (replaces single-origin APP_URL CORS source), origin-reflect-or-omit (fail-closed, never '*'), Vary: Origin on every origin-dependent response"
  - "withCors(req, type, handler, opts?) — guarantees CORS on success, thrown Response, thrown Error (generic 500, no leak), and OPTIONS preflight; streams ReadableStream bodies unbuffered"
  - "jsonError(req, status, error, extra?) — additive frontend-readable envelope: top-level string error + optional message/resetDate/tier/code + retryable (defaulted from isRetryable)"
  - "CORS-tagged auth.ts unauthorizedResponse(req, type='user'): user 401s carry ACAO, body stays { error: 'Unauthorized' }; internal 401s stay CORS-less"
  - "Table-driven cors.test.ts (origin x status x preflight) + auth.test.ts 401-CORS assertion, both inside verify:baseline"
  - "ALLOWED_ORIGINS documented in .env.example + docs/ENVIRONMENT.md; APP_URL retained for app-link generation (14 fns)"
affects: [wave-2-function-rollout, wave-3-cors-audit, phase-3-error-taxonomy, security-audit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CORS-by-construction: withCors/jsonError are the only response builders that guarantee CORS on every exit (no hand-spread on error paths)"
    - "Origin-reflect-with-allowlist + Vary: Origin (omit ACAO for unapproved origins, never wildcard)"
    - "Surface-stable shim: corsHeaders/handleOptionsRequest keep their { type, extraHeaders } first arg, gain an optional req second arg"

key-files:
  created: []
  modified:
    - supabase/functions/_shared/cors.ts
    - supabase/functions/_shared/cors.test.ts
    - supabase/functions/_shared/auth.ts
    - supabase/functions/_shared/auth.test.ts
    - .env.example
    - docs/ENVIRONMENT.md

key-decisions:
  - "ALLOWED_ORIGINS env allowlist replaces APP_URL as the CORS source; APP_URL retained (no longer read by cors.ts) for app-link generation in 14 fns"
  - "Unapproved origins: omit Access-Control-Allow-Origin entirely (fail-closed), never default to ALLOWED[0], never '*'"
  - "isRetryable mapping = {408,429,500,502,503,504,529} (aligned with src/lib/merit-error-messages.ts); defaults jsonError.retryable only when not supplied"
  - "ALLOWED_ORIGINS parsed via env-string memoization (parse-once-per-value) rather than a frozen module-load Set, so runtime-env unit tests work without weakening prod behavior"

patterns-established:
  - "withCors wrapper owns CORS for actual responses (it has req); handleOptionsRequest(type, req) owns preflight"
  - "jsonError keeps a top-level string error (additive siblings only) — NOT the nested { error: { code, ... } } taxonomy (deferred to Phase 3 / LIFE-08)"

requirements-completed: [CORS-01, CORS-03, CORS-04, CORS-06]

# Metrics
duration: 7min
completed: 2026-06-27
---

# Phase 1 Plan 01: Cross-Origin & Error-Contract Foundation Summary

**Request-aware `_shared/cors.ts` with an env-driven `ALLOWED_ORIGINS` allowlist (apex+www reflected, unapproved origins omitted, never `*`), `withCors`/`jsonError` CORS-by-construction primitives, and a CORS-tagged `auth.ts` 401 — proven by a table-driven origin x status x preflight Deno matrix in `verify:baseline`.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-27T11:39:07Z
- **Completed:** 2026-06-27T11:46:30Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Rewrote the single CORS chokepoint from a static single-origin `APP_URL` to a per-request `ALLOWED_ORIGINS` allowlist that echoes an approved `Origin` exactly (or omits ACAO, fail-closed) and always emits `Vary: Origin` — fixing the confirmed `https://www.strivoai.net` production outage at its source for all 21 user functions without touching their call sites.
- Added `withCors` (CORS guaranteed on success, thrown `Response`, thrown `Error`, and OPTIONS preflight; streaming bodies passed through unbuffered) and `jsonError` (additive, frontend-readable envelope), so error/throw paths can no longer bypass CORS by construction.
- Fixed the only CORS-less response path — `auth.ts`'s `unauthorizedResponse()` — so user 401s now carry origin-aware CORS (enabling the SPA's auto-refresh-on-401) while keeping the body exactly `{ error: 'Unauthorized' }` (D-13); internal 401s stay CORS-less.
- Replaced the APP_URL-based `cors.test.ts` with a table-driven origin x status x preflight matrix that asserts ACAO **absence** for disallowed origins (the fail-closed regression guard), plus `withCors` thrown-Response/Error and streaming-passthrough cases; added a 401-CORS assertion to `auth.test.ts`. 43 edge tests green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Request-aware ALLOWED_ORIGINS core + withCors/jsonError + env docs** - `af7189c7` (feat)
2. **Task 2: Table-driven origin x status x preflight cors.test.ts** - `3bc1336f` (test)
3. **Task 3: CORS-tag auth.ts unauthorizedResponse + auth.test.ts assertion** - `aa0d1ebe` (fix)

## Files Created/Modified
- `supabase/functions/_shared/cors.ts` - Allowlist core (memoized env parse), request-aware `corsHeaders`/`handleOptionsRequest` shim, new `withCors` + `jsonError` exports, `isRetryable`; no longer reads APP_URL.
- `supabase/functions/_shared/cors.test.ts` - Table-driven matrix (apex/www/trailing-slash/disallowed/no-origin x success/4xx/5xx/preflight) + withCors edge cases.
- `supabase/functions/_shared/auth.ts` - `unauthorizedResponse(req, type='user')` attaches CORS; `req` threaded through all 7 throw sites; imports `corsHeaders`/`CorsType`.
- `supabase/functions/_shared/auth.test.ts` - New assertion: user 401 from an allowlisted Origin carries ACAO while `body.error === 'Unauthorized'`.
- `.env.example` - Added `ALLOWED_ORIGINS` (with prod/staging examples); amended `APP_URL` comment (app-link generation only, no longer CORS).
- `docs/ENVIRONMENT.md` - Added `ALLOWED_ORIGINS` per-surface row; amended `APP_URL` row.

## Decisions Made
- **APP_URL retained, not removed.** `grep` confirmed 14 function `index.ts` files (email CTAs, Stripe `return_url`/portal/checkout, results URLs) still consume `APP_URL`; only `cors.ts` stopped reading it. Removing it would break app-link generation.
- **Omit-ACAO fail-closed** for unapproved origins (PITFALLS wins over ARCHITECTURE's `ALLOWED[0]` default) — matches CONTEXT decision #3.
- **`isRetryable` = {408, 429, 500, 502, 503, 504, 529}** to align with the frontend `merit-error-messages.ts` refundable-error axis.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ALLOWED_ORIGINS parsed via memoized env read instead of a frozen module-load Set**
- **Found during:** Task 1 (cors.ts rewrite)
- **Issue:** The plan's action text says "module-level readonly Set parsed once". A true module-load-time parse freezes the (empty) `ALLOWED_ORIGINS` value before any test body runs, so the plan's own prescribed test idiom (`Deno.env.set('ALLOWED_ORIGINS', ...)` at runtime, Task 2) would always see an empty allowlist and every approved-origin assertion would fail. This is a blocking contradiction between the impl note and the verification.
- **Fix:** Parse lazily inside the core, memoized on the raw env string (`cachedRaw`/`cachedSet`). In production the env value is fixed for the isolate's life, so this still parses exactly once; under tests it transparently re-parses when the env changes. Functionally "parsed once per distinct value".
- **Files modified:** supabase/functions/_shared/cors.ts
- **Verification:** 31 cors.test.ts cases (which set the env at runtime) pass; behavior is identical to a frozen Set in prod where the value never changes.
- **Committed in:** af7189c7 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to reconcile the impl note with the plan's own runtime-env test idiom. No behavioral change vs. the intended "parse once" in production; no scope creep.

## Issues Encountered
- None. The auth-rethrow regression suite logged an expected `getUser` network `TypeError` (offline unit env), which the test deliberately surfaces as a propagated 401 — all 28 regression tests passed.

## User Setup Required

**Operator config required before staging/prod verification (CORS-06).** `ALLOWED_ORIGINS` is a new Supabase edge secret that must be set per environment (Claude is read-only on prod):
- Preview/staging (`cimjltzovkahkqecpwgi`): `supabase secrets set ALLOWED_ORIGINS="<stable preview alias>,http://localhost:8080"`
- Production (`zjpjapgraoxdukdvpjes`): `supabase secrets set ALLOWED_ORIGINS="https://strivoai.net,https://www.strivoai.net"`
- All functions must be **redeployed** so the rewritten `_shared/cors.ts` ships (shared modules are bundled per-function at deploy). The staging preview alias value is still operator-supplied (Open Question 1).

## Next Phase Readiness
- The `withCors` / `jsonError` / origin-aware `handleOptionsRequest` surface is the interface the Wave-2 function rollout wraps and the Wave-3 audit consumes. Signatures are locked in this plan's frontmatter and the SUMMARY decisions.
- Exported surface is backward-compatible (`corsHeaders`/`handleOptionsRequest` first-arg shape preserved), so the ~20-function rollout is mechanical.
- Blocker for end-to-end prod verification: operator must set `ALLOWED_ORIGINS` on both Supabase projects and redeploy all functions; supply the staging preview alias value.

## Self-Check: PASSED

- Files verified on disk: cors.ts, cors.test.ts, auth.ts, auth.test.ts, .env.example, docs/ENVIRONMENT.md (all edits applied).
- Commits verified: af7189c7 (Task 1), 3bc1336f (Task 2), aa0d1ebe (Task 3) all present in git log.
- Tests: `deno test _shared/cors.test.ts _shared/auth.test.ts` = 43 passed / 0 failed.
- Invariants: `ALLOWED_ORIGINS` in cors.ts = 3 (>=1); `APP_URL` in cors.ts = 0; `withCors`+`jsonError` exported; APP_URL retained in 14 function files.

---
*Phase: 01-cross-origin-error-contract-foundation*
*Completed: 2026-06-27*

# Phase 1: Cross-Origin & Error-Contract Foundation - Research

**Researched:** 2026-06-27
**Domain:** Brownfield rewrite of the shared CORS module (`_shared/cors.ts`) + error-contract on a live Supabase Edge Functions (Deno) codebase; roll across all active functions
**Confidence:** HIGH (grounded in direct codebase reads; every claim cites a real file:line)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Locked by research (carried in, not re-debated)** — Source: `.planning/research/ARCHITECTURE.md` §6, `.planning/research/PITFALLS.md` #6-7.
- Env-driven `ALLOWED_ORIGINS` allowlist (comma-separated; each entry trimmed + trailing slash stripped). Replaces the single-origin `APP_URL` CORS source.
- Origin-reflection-with-validation: read the request `Origin`, and echo that exact origin back in `Access-Control-Allow-Origin` only when it is on the allowlist.
- Always set `Vary: Origin` when ACAO depends on the request origin (correct caching).
- Never `*` on credentialed/authenticated requests.
- New `withCors(req, type, handler)` wrapper guarantees CORS headers on EVERY response, including thrown `Response`/`Error` and OPTIONS preflight.
- New `jsonError(...)` helper produces a CORS-tagged, frontend-readable error response.
- `auth.ts`'s `unauthorizedResponse()` (401/403) is rebuilt to carry CORS headers.
- `internal` and `webhook` CORS types keep returning `{}` (no CORS headers) — unchanged.
- Roll the fix across ALL ~20 active Edge Functions (CORS-05: not only the 4 observed in production logs), and add a table-driven `cors.test.ts` (origin × status × preflight) into `verify:baseline`.

**1. Allowlist scope & preview/dynamic-URL handling — Exact set per environment**
- Production allowlist = `https://strivoai.net` + `https://www.strivoai.net` ONLY.
- Staging/preview allowlist = that environment's stable preview alias + `http://localhost:8080` (the Vite dev origin).
- Exact-string match only — no wildcard, no suffix/pattern matching.
- Dynamic per-deploy Vercel hash URLs are NOT required to call Edge Functions directly; rely on a stable preview alias instead.
- `ALLOWED_ORIGINS` set distinctly per environment in Supabase secrets.

**2. Error-envelope shape & backward-compat — Additive, non-breaking now**
- Primary fix: every response — success AND failure, incl. 401/402/429/4xx/5xx and OPTIONS — carries origin-aware CORS headers so the body renders.
- Preserve the existing response contract: keep the top-level `{ error: <string>, resetDate?, tier? }` shape that current frontend consumers read (e.g. `AiCreditsContext.markCreditsDepletedFromError`, the 402/429 usage-limit path, `{ error: 'Unauthorized' }` on 401). Do NOT break these.
- `jsonError` may ADD optional siblings (`code`, `retryable`) alongside the existing string `error` — additive only.
- The full nested `{ error: { code, message, retryable, stage?, requestId? } }` taxonomy and the frontend `src/lib/analysisError.ts` mapper are Phase 3 (LIFE-08) — NOT here.

**3. Unapproved-origin behavior — Omit ACAO, fail-closed**
- For an origin NOT on the allowlist: OMIT the `Access-Control-Allow-Origin` header entirely.
- Do NOT echo a default `ALLOWED[0]` origin (PITFALLS.md wins over ARCHITECTURE.md here).
- The error/response body is still readable for approved origins.

**4. Rollout discipline & prod config verification — Surface-stable shim + staging→prod**
- Keep the exported surface stable: existing `corsHeaders(...)` and `handleOptionsRequest(...)` keep working (via an internal shim/adapter to the new request-aware implementation) so the ~20-function roll-out is mechanical and low-risk.
- Add `withCors` and `jsonError` as NEW exports.
- No opportunistic refactors beyond the CORS/error-contract change in this pass.
- `ALLOWED_ORIGINS` configured + verified on staging first, confirmed, then production — operator-gated. Production apex+www config verification is part of success criteria (CORS-06).

### Claude's Discretion
- Internal mechanics of the shim that keeps `corsHeaders`/`handleOptionsRequest` signatures stable while delegating to the new request-aware path.
- Whether `withCors` catches thrown `Error` (not just thrown `Response`) and maps it to a generic CORS-tagged 500 via `jsonError`.
- Inclusion of `Access-Control-Allow-Methods` / `Access-Control-Max-Age` on preflight as needed for correctness.
- Exact `isRetryable(status)` mapping used to populate the optional `retryable` sibling.
- The precise structure of the table-driven `cors.test.ts` matrix (which functions are sampled vs exhaustively asserted), provided it covers: approved apex, approved www, disallowed origin, success + 4xx/5xx, and preflight.
- Determining the authoritative set of "active" Edge Functions to roll the fix across.

### Deferred Ideas (OUT OF SCOPE)
- Full nested structured-error taxonomy + `src/lib/analysisError.ts` mapper → Phase 3 (LIFE-08).
- Suffix/pattern matching for dynamic Vercel preview-deploy URLs.
- `Access-Control-Allow-Methods`/`Max-Age` tuning beyond correctness.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CORS-01 | Centralize cross-origin handling; one env-driven allowlist for all functions; no per-endpoint copies | Already centralized — all 38 functions import `_shared/cors.ts`; zero hardcoded `Access-Control-Allow-Origin` literals in any `index.ts` (grep-verified). Work = rewrite `cors.ts` internals + add `ALLOWED_ORIGINS`. See §1, §4. |
| CORS-02 | Requests from BOTH apex and www succeed on all functions; preflight handled | Single OPTIONS pattern (`handleOptionsRequest`) is consistent across all 21 user functions; fixing `corsHeaders`/`handleOptionsRequest` internals fixes all. See §1, §3, §9. |
| CORS-03 | Unapproved origins rejected safely; no credential-bearing wildcard | App uses bearer-token headers, not cookies → origin-reflect+allowlist, omit ACAO when not allowlisted. See §6, §9. |
| CORS-04 | CORS headers consistent on success AND failure (401/4xx/5xx + preflight) | Confirmed offender: `auth.ts unauthorizedResponse()` builds 401 with NO CORS (lines 48-53); all feature handlers re-throw/return it bare. See §2, §5, Pitfall 1. |
| CORS-05 | Audit every function; fix all occurrences (not just 4 in logs) | Full enumeration done: 21 user / 14 internal / 3 webhook = 38. See §4 table. |
| CORS-06 | Automated tests (origin × status × preflight) into `verify:baseline`; guard drift; prod apex+www verified | `cors.test.ts` already in `deno task test:ci` (in `verify:baseline`); rewrite to table-driven. Static-source-analysis test pattern exists (`handler-config.test.ts`). See §7, Validation Architecture. |
</phase_requirements>

## Summary

The phase's two defects are real, narrowly scoped, and already confirmed in the codebase. **Bug 1 (single-origin):** `corsHeaders()` returns one static `Access-Control-Allow-Origin: <APP_URL>` (`_shared/cors.ts:38-54`), so `https://www.strivoai.net` is blocked when `APP_URL=https://strivoai.net`. **Bug 2 (CORS-less errors):** `auth.ts`'s `unauthorizedResponse()` (`_shared/auth.ts:48-53`) builds a 401 with only `Content-Type` and no CORS headers; every user-facing handler either re-throws it to Deno's `serve()` default error handler (which 500s it without CORS) or returns it verbatim — so the browser blocks the body and the SPA's auto-refresh-on-401 (`fetchWithTimeout.ts:95-108`) never fires.

The good news for planning: **CORS is already fully centralized.** All 38 functions import `corsHeaders`/`handleOptionsRequest` from `_shared/cors.ts`, every OPTIONS goes through `handleOptionsRequest({ type })`, and there are **zero** hardcoded `Access-Control-Allow-Origin` literals in any `index.ts` (grep-verified). This means the surface-stable-shim strategy in the locked decisions is exactly right: rewriting the *internals* of `corsHeaders`/`handleOptionsRequest` to be request-aware (reading `Origin` against an `ALLOWED_ORIGINS` allowlist) automatically fixes all 21 user-facing functions without touching their call sites. The only call sites that must change by hand are (a) `auth.ts`'s `unauthorizedResponse()`, and (b) any handler we choose to migrate to `withCors`/`jsonError`.

The app is **not credentialed in the CORS sense** — it authenticates with `Authorization: Bearer` + `apikey` headers, never cookies (`useResumeStream.ts:147-163`, no `credentials:'include'` anywhere). So `Access-Control-Allow-Credentials` is not required; origin-reflection + `Vary: Origin` + an allowlist is the complete, correct pattern. The `cors.test.ts` test is already wired into `verify:baseline`, and the repo has an established static-source-analysis test idiom (`*/handler-config.test.ts`) that is ideal for the CORS-05 drift guard.

**Primary recommendation:** Rewrite `_shared/cors.ts` to a request-aware allowlist core (`pickAllowedOrigin(req)` → echo or omit), expose `corsHeaders`/`handleOptionsRequest` as thin shims that accept the old `{ type, extraHeaders }` object **plus** an optional `req`, add `withCors` + `jsonError` as new exports, pass `req` into `auth.ts`'s 401 builder, then redeploy all functions and replace the behavioral `cors.test.ts` with a table-driven origin × status × preflight matrix + a static audit that every user function routes OPTIONS through the shared helper.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Origin allowlist evaluation + ACAO echo | API / Backend (`_shared/cors.ts`, Deno edge) | — | CORS is a response-header contract emitted by the server; the browser only enforces it. Must live server-side. |
| Per-environment allowlist value (`ALLOWED_ORIGINS`) | Config / Secrets (Supabase edge secrets) | Operator | Differs per env (prod apex+www vs staging alias+localhost); set via `supabase secrets set`, not in code. |
| Preflight (OPTIONS) handling | API / Backend (`handleOptionsRequest`) | — | Browser-initiated, answered before auth; one shared helper per function entrypoint. |
| Error envelope shape `{ error, resetDate?, tier?, code?, retryable? }` | API / Backend (`jsonError`, `usage-checker`, `rate-limiter`) | — | Backend constructs the body; additive fields only. |
| Reading the error body / status to drive UX | Browser / Client (`fetchWithTimeout.ts`, `useResumeStream.ts`, page handlers) | — | Frontend reads `body.error`, `body.code`, `body.resetDate`, `body.tier`, `body.retryAfter`, `response.status`. Must not break. |
| 401 → token-refresh-and-retry | Browser / Client (`invokeWithTimeout`) | API (must emit CORS-tagged 401) | Client refreshes the JWT, but only if it can READ the 401 — which requires CORS headers on the 401. |

## Project Constraints (from CLAUDE.md)

- **GSD workflow:** No direct repo edits outside a GSD command. Planner produces PLAN.md; execution happens under `/gsd:execute-phase`.
- **Root-cause only:** "never mask failures behind fallbacks"; "no 'fixed because the error disappeared'." The CORS fix must make errors *render*, not hide them.
- **`verify:baseline` is a HARD gate** wired into `scripts/deploy.ps1` before `supabase link` (MEMORY: Phase 05). New `cors.test.ts` matrix must be green inside it. `test:edge` = `cd supabase/functions && cross-env DENO_TEST_SUPABASE_REMOTE=0 deno task test:ci`.
- **`.ps1` scripts must stay pure ASCII** (Win PowerShell 5.1 reads cp1252; em-dash/box-drawing break parsing). If `deploy.ps1` is touched, keep ASCII-only.
- **Supabase prod is read-only for Claude** (canonical prod ref `zjpjapgraoxdukdvpjes`). Operator sets prod secrets + applies prod config. Preview `cimjltzovkahkqecpwgi` is unpaused and writable.
- **Do not weaken v4.0 security** (advisor count 15; do not regress). Keep `{ error: 'Unauthorized' }` body discipline (no detail leakage) per `auth.ts` D-13.
- **Coding style:** 2-space indent, semicolons, explicit return types, discriminated unions for fallible ops, bracket-prefixed structured logging, named exports for utilities. Preserve existing TS/React patterns.
- **No new infrastructure / no CORS library** — build it in-repo on Deno + the `_shared/` layer.
- **Honor operator checkpoints** for staging→prod config (MEMORY: pause for operator smokes; never auto-approve prod secret application).

## Current State — Grounded Findings

### §1 Current `_shared/cors.ts` (the surface to keep stable)

File: `supabase/functions/_shared/cors.ts` (68 lines). Exported surface to preserve:

```typescript
export type CorsType = 'user' | 'internal' | 'webhook';                         // line 16

export function corsHeaders(opts: {                                             // line 29
  type: CorsType;
  extraHeaders?: string;
}): Record<string, string> { ... }

export function handleOptionsRequest(opts: {                                    // line 63
  type: CorsType;
  extraHeaders?: string;
}): Response {
  return new Response(null, { headers: corsHeaders(opts) });                    // line 67
}
```

Current behavior:
- `internal` / `webhook` → returns `{}` (no CORS). **KEEP unchanged** (locked).
- `user` → reads `Deno.env.get('APP_URL')` (line 38); **throws** if unset (line 39-41, fail-closed); strips one trailing slash (line 44); returns exactly two headers (lines 51-54):
  - `Access-Control-Allow-Origin: <APP_URL>` (the static single-origin bug)
  - `Access-Control-Allow-Headers: 'authorization, x-client-info, apikey, content-type'` (+ `, ${extraHeaders}` when provided, line 47-49)
- **No `Vary`, no `Access-Control-Allow-Methods`, no `Access-Control-Max-Age`, no `Access-Control-Allow-Credentials`** are emitted today.
- `handleOptionsRequest` returns `new Response(null, { headers })` → **status 200** (default), body null.

**Shim implication:** the new request-aware core needs the request `Origin`, but today's signature takes only `{ type, extraHeaders }`. The shim must accept an **optional `req`** (e.g. `corsHeaders(opts, req?)` or `corsHeaders({ type, extraHeaders, req? })`). When `req` is absent (no Origin available), the safe behavior is to omit ACAO (decision #3). All 21 user call sites currently pass no `req` — see §4 for which must be threaded vs which the wrapper covers.

### §2 Current `_shared/auth.ts` — the CORS-04 offender

File: `supabase/functions/_shared/auth.ts`.
- `export type AuthType = 'user' | 'internal' | 'webhook'` (line 44) — mirrors `CorsType`.
- `unauthorizedResponse()` (lines 48-53) — **the defect**:
  ```typescript
  function unauthorizedResponse(): Response {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },   // NO CORS headers
    );
  }
  ```
  Thrown from `requireUserAuth` (lines 91, 99, 111), `requireInternalAuth` (lines 138, 144, 162), and `requireInternalOrUserAuth` (line 191). Status is always **401** (never 403, despite the CONTEXT wording "401/403"; there is no 403 builder here — 403s are built inline in feature handlers).
- `requireAuth(req, { type })` (line 66) — already receives `req`, so it CAN supply the origin to a rebuilt `unauthorizedResponse(req)`.
- `requireInternalOrUserAuth(req, bodyUserId?)` (line 178) — also has `req`.
- **Body shape `{ error: 'Unauthorized' }` is asserted by a test** (`auth.test.ts:35-37`: `assertEquals(body.error, "Unauthorized")`) and **must be preserved** (locked decision #2 + D-13 no-detail-leakage). Any rebuild that routes through `jsonError` must still produce a top-level `error: 'Unauthorized'` string.
- **Key constraint:** `requireUserAuth`/`requireInternalAuth` do not know the `CorsType`. For user auth the type is `'user'`; internal/webhook 401s are server-to-server and need no CORS. Cleanest fix: a 401 builder that takes `req` and attaches `corsHeaders({ type: 'user' }, req)` — only user-facing 401s need it, and they are the dangerous ones (PITFALLS #7).

### §3 The handler/wrapper layer — there is NO `_shared/handler.ts`

**Correction to CLAUDE.md:** the "Centralized request handler (`handler.ts`)" referenced in CLAUDE.md (Zod wrapper, OPTIONS at "line ~55") **does not exist** in this repo. Verified: `_shared/` contains no `handler.ts` (full file listing in Sources). There is no shared `handleRequest`/Zod wrapper. Each function inlines its own:

```typescript
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleOptionsRequest({ type: 'user' });   // (or 'internal' / 'webhook')
  }
  ...
});
```

Two entrypoint idioms coexist:
- **Inline closure:** `serve(async (req) => { ... })` (e.g. `analyze-resume:624`, `grade-linkedin:352`, `submit-resume-analysis-job:35`).
- **Named handler + guarded serve:** `const handler = async (req) => {...}; if (import.meta.main || !isTest) serve(handler);` (e.g. `compare-jobs:351-354`, `recruiting-lens:776-779`, `interview-prep-analyze:731-734`). These use `return error` (not `throw`) so `serve`'s `onError` does not 500 a thrown Response — see the explicit comment at `compare-jobs:335`.

`serve` is imported from `https://deno.land/std@0.168.0/http/server.ts` (`grade-linkedin:1`). Some functions use `Deno.serve` directly instead (e.g. `create-payment-intent:225`, `stripe-webhook:52`).

**Where `withCors` slots in:** `withCors(req, type, handler)` is a NEW wrapper that **replaces the per-function `serve(async (req) => {...})` body**, i.e. `serve((req) => withCors(req, 'user', () => realHandler(req)))`. It must: (1) short-circuit OPTIONS → preflight response; (2) run `handler`; (3) `try/catch` so a thrown `Response` (bare 401 from auth) gets CORS headers merged on before return, and (optionally, Claude's discretion) a thrown `Error` becomes a CORS-tagged 500 via `jsonError`. There is no existing wrapper to extend — `withCors` is greenfield inside `cors.ts`.

### §4 Authoritative set of ACTIVE Edge Functions (CORS-05 audit surface)

38 function directories under `supabase/functions/` (excluding `_shared`, `_tests`). Classification by the CORS type each passes to `handleOptionsRequest`/`corsHeaders` (verified by grep of every `index.ts`):

**USER (21) — needs origin-aware CORS; these get fixed by the `cors.ts` rewrite:**

| Function | OPTIONS type | Notes |
|----------|--------------|-------|
| `analyze-resume` | `user` + `extraHeaders: 'x-internal-job-secret'` | Streaming + inline-closure serve; outer catch `throw error` (1075) |
| `analyze-career` | `user` + `extraHeaders: 'x-internal-job-secret'` | Inline serve (779) |
| `grade-linkedin` | `user` | Inline serve (352); catch `throw error` (per PITFALLS #7 line 872 ref) |
| `recruiting-lens` | `user` | Named handler, `return error` (776-779) |
| `interview-prep-analyze` | `user` | Named handler, `return error` (713-715) |
| `interview-prep-evaluate` | `user` | Inline serve (59-61) |
| `compare-jobs` | `user` | Named handler, `return error` (333-336) |
| `analyze-skills-gap` | `user` | Inline serve; catch `throw error` (287) |
| `chat-agent` | `user` | Inline serve; catch `throw error` (79) |
| `ocr-pdf` | `user` | Inline serve (188) |
| `get-analysis-job-status` | `user` | Inline serve (27) |
| `submit-resume-analysis-job` | `user` | Inline serve (35) |
| `submit-career-analysis-job` | `user` | Inline serve (28) |
| `create-checkout-session` | `user` | `Deno.serve` named (478); catch `return r` (165) |
| `create-payment-intent` | `user` | `Deno.serve` named (225); catch `return r` (110) |
| `create-stripe-portal` | `user` | `Deno.serve` named (124); catch `return r` (65) |
| `admin-delete-user` | `user` | Inline serve (11) |
| `notify-upgrade-request` | `user` | Builds 401 inline WITH cors (lines 32, 41) — good pattern |
| `send-notification-email` | `user` | Inline serve (162) |
| `test-email` | `user` | Inline serve (6); admin-gated |
| `keep-warm` | `user` | Inline serve (21); ALSO pings other fns with OPTIONS server-to-server (46) |

**INTERNAL (14) — `corsHeaders/handleOptionsRequest({ type: 'internal' })` → `{}`; UNCHANGED:**
`process-resume-analysis-job`, `process-career-analysis-job`, `extract-analysis-structure`, `lifecycle-archive-writer`, `check-merit-alerts`, `admin-merit-metrics`, `notify-admin-activity`, `notify-upgrade-approved`, `process-scheduled-emails`, `reset-subscription-merits`, `send-credits-exhausted-email`, `send-feature-email`, `send-strivo-email`, `send-welcome-email`.

**WEBHOOK (3) — `{ type: 'webhook' }` → `{}`; UNCHANGED:**
`paddle-webhook` (legacy, gated-but-live), `stripe-webhook`, `stripe-webhook-handler`.

**Audit conclusion:** No per-endpoint CORS copies exist — `grep "Access-Control-Allow-Origin"` across all `index.ts` returns **zero** literal matches (only SQL `select('*')` false positives). CORS-01's "no per-endpoint copies remain" is **already satisfied**; the rewrite is concentrated in `_shared/cors.ts` + `_shared/auth.ts`. The "4 observed in prod" (Resume, Career, LinkedIn, Recruiting Lens) are a subset of the 21 user functions; CORS-05 is satisfied because the shared rewrite covers all 21 uniformly.

### §5 Current error/response construction (backward-compat targets for `jsonError`)

The two shared error builders **already attach CORS** (so they are not offenders, but `jsonError` must stay shape-compatible):

- `usage-checker.ts:124-143` `createUsageLimitResponse(resetDate, tier, corsHeaders)` → **status 429**, body `{ error: 'usage_limit_reached', message, resetDate, tier }`. CORS spread in (line 140).
- `rate-limiter.ts:162-178` `createRateLimitResponse(retryAfterSecs, corsType)` → **status 429**, body `{ error: 'rate_limit_exceeded', message, retryAfter }`, plus `Retry-After` header. Calls `corsHeaders({ type: corsType })` internally (line 172).

Inline handler responses follow `{ ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' }` (e.g. `compare-jobs:85-160`, `grade-linkedin:386-878`, `interview-prep-evaluate:75-350`). Status codes seen across handlers: 400, 401, 402, 403, 404, 409, 412, 429, 500, 502, 503, 202, 200. `analyze-resume` builds a 401 inline WITH cors at lines 697-700 (`{ error: 'unauthorized' }`).

**The ONLY responses lacking CORS today are the ones thrown from `auth.ts`** (`unauthorizedResponse()`), because every other response path spreads `corsHeaders`. `jsonError` must therefore preserve the union of fields the frontend reads: top-level `error` (string), `message`, `resetDate`, `tier`, `retryAfter`, and may ADD `code`/`retryable` (decision #2).

### §6 Frontend consumers of error bodies (DO NOT BREAK)

Two distinct read paths:

**A. `supabase.functions.invoke` path → `src/lib/fetchWithTimeout.ts` (`invokeWithTimeout`):**
- `parseSupabaseFunctionError` (lines 44-66): reads `error.context.json()` then `errorData.error || errorData.message || error.message` (lines 56-60). So **`body.error` (string) is the primary field**; `body.message` is the fallback.
- 401-refresh trigger (lines 91-108): `status = error.context.status`; `responseCode = result.data.code`; refreshes session if message includes `jwt`/`token`, or `status === 401|403`, or **`responseCode === 401`** (line 101). → confirms `code` is already a consumed field; `jsonError`'s optional `code` sibling is forward-compatible.
- **Swallowed-CORS symptom on this path:** when ACAO is missing/mismatched, the browser blocks the response; supabase-js surfaces a generic `FunctionsFetchError` whose `.context` is absent → `parseSupabaseFunctionError` falls through to `error.message` ≈ `"Failed to send a request to the Edge Function"` / `"Failed to fetch"`. The real 401/402/429 body is invisible, and the 401-refresh path never triggers (`context.status` is undefined).

**B. Raw streaming `fetch` path → `src/hooks/useResumeStream.ts`:**
- Calls `fetch(${supabaseUrl}/functions/v1/analyze-resume, { headers: { Authorization: Bearer, apikey, Content-Type } })` (lines 147-163). **No `credentials:'include'`** → confirms header-bearer auth, not cookies.
- Reads `response.status === 429` then `body.error === 'rate_limit_exceeded'` and `body.retryAfter` (lines 178-188); generic non-ok path reads `body.error` (lines 193-198); status drives `getMeritErrorMessage(response.status)` (line 203).
- **Swallowed-CORS symptom on this path:** a missing ACAO makes the raw `fetch()` **reject with `TypeError: Failed to fetch`**, caught at line 164 → `rollback('network')` + "Connection failed. Please try again." The structured 429/402/401 body is never read. This is exactly the "opaque CORS error" the phase eliminates.

**C. Error-message taxonomy** `src/lib/merit-error-messages.ts` `getMeritErrorMessage(status, ctx)` consumes `ctx.resetDate` (402) and `ctx.retryAfterSec` (429), keyed on numeric HTTP status. It needs the response to be *readable* (CORS present) to receive the right status; otherwise everything collapses to the `network`→`CONNECTION_LOST` branch.

**Net field contract `jsonError` must not break:** `error` (top-level string), `message`, `resetDate`, `tier`, `retryAfter`, `code`. `AiCreditsContext.markCreditsDepletedFromError` referenced in CONTEXT no longer exists as a literal symbol (the credits system migrated to Merits — `useMerits.ts`, `merit-error-messages.ts`); the equivalent live consumers are the merit/usage paths above. Planner should target the **actual** consumers (`fetchWithTimeout.ts`, `useResumeStream.ts`, page handlers in `Upload.tsx`/`CareerCompass.tsx`/`RecruitingLens.tsx`/`SkillsGapAnalysis.tsx`), not the stale `AiCreditsContext` name.

### §7 Existing test patterns for `_shared`

- **Runner:** `deno test ... --no-check --allow-env --allow-read` (per file header in `cors.test.ts:3`). CI task `test:ci` in `supabase/functions/deno.json:5` lists every test file explicitly and runs `deno test --allow-all --no-check ...`. `verify:baseline` → `npm run test:edge` → `cd supabase/functions && cross-env DENO_TEST_SUPABASE_REMOTE=0 deno task test:ci`. PowerShell wrapper: `scripts/run-edge-tests.ps1`.
- **`cors.test.ts` is ALREADY registered** in `deno.json:5` (`... _shared/cors.test.ts grade-linkedin/handler-config.test.ts ...`). So replacing its contents with the table-driven matrix requires **no `deno.json` edit** — it is already inside `verify:baseline`.
- **Assertion style:** `import { assertEquals, assert, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts"` (`cors.test.ts:5`). Env manipulated via `Deno.env.set/delete` with `try/finally` (`cors.test.ts:11-18`). Existing `cors.test.ts` covers: user ACAO=APP_URL not `*`, trailing-slash strip, default allow-headers, extraHeaders, internal/webhook `{}`, throws when APP_URL unset, OPTIONS Response shape. **These existing assertions WILL break** once behavior changes (APP_URL → ALLOWED_ORIGINS, request-aware) — they must be rewritten, not appended to.
- **Static-source-analysis idiom (ideal for CORS-05 drift guard):** `grade-linkedin/handler-config.test.ts` reads `index.ts` as text (`Deno.readTextFileSync`, with a Windows leading-slash fix at lines 10-13) and asserts on string contents (e.g. `source.includes("requireAuth(req, { type: 'user' })")`). A `cors-audit.test.ts` can iterate the 21 user functions and assert each routes OPTIONS through `handleOptionsRequest`/`withCors` and never hardcodes ACAO — catching config drift if someone adds a new function or a raw CORS literal.
- Other contract tests exist per function: `*/phase22-contract.test.ts`, `*/handler-config.test.ts`, `*/job-contract.test.ts`.

### §8 Env wiring (`APP_URL` → `ALLOWED_ORIGINS`)

- **Current:** `APP_URL` is `required`, consumed by `_shared/cors.ts:38-41` "+ 14 fns", "Fail-closed CORS source of truth" (`docs/ENVIRONMENT.md:75`). Skeleton: `.env.example:62` `APP_URL=  # canonical app origin; drives CORS (fail-closed if unset)`.
- **`ALLOWED_ORIGINS` is NOT yet in code or env** — only referenced in `.planning/` docs (grep-verified: matches only in planning files). Must be ADDED.
- **How secrets are set** (no automation in `deploy.ps1`): manual `supabase secrets set NAME=value --project-ref <ref>` (pattern seen in `scripts/cutover-production.ps1:99`, `scripts/README-stripe-provisioning.md:56-59`). `deploy.ps1` selects target via explicit `supabase link --project-ref <ref>`; it does NOT set CORS secrets.
- **Planner must:** (1) add `ALLOWED_ORIGINS` to `.env.example` + `docs/ENVIRONMENT.md` matrix (mark per-surface: prod = apex+www; preview-test = alias+localhost:8080); (2) decide APP_URL disposition — keep it for non-CORS uses if any, or note CORS no longer reads it; (3) document the operator `supabase secrets set ALLOWED_ORIGINS="https://strivoai.net,https://www.strivoai.net"` for prod (ref `zjpjapgraoxdukdvpjes`) and the staging equivalent. **Operator-gated** (Claude is read-only on prod).
- **Values:** prod = `https://strivoai.net,https://www.strivoai.net` (HIGH — CONTEXT + roadmap). Vite dev origin = `http://localhost:8080` (HIGH — `vite.config.ts:9,19` pins dev+preview to 8080; Playwright baseURL is `http://localhost:8080`). **Staging stable preview alias = UNKNOWN value** (Vercel alias not in repo) — operator must supply (see Open Questions).

### §9 Deno/Browser CORS specifics for THIS app

- **Not cookie-credentialed.** All calls use `Authorization: Bearer` + `apikey` request headers; no `credentials:'include'`; supabase-js `functions.invoke` defaults to `credentials:'same-origin'` (no cross-origin cookies). → `Access-Control-Allow-Credentials` is **not required**, and because no `*`-with-credentials conflict exists, omitting ACAC is correct. (The locked "never `*` on credentialed requests" still holds as a defense-in-depth choice: we don't want arbitrary origins invoking authenticated endpoints, even though the strict CORS-credentials rule doesn't force it.) [Confidence HIGH — established, stable browser CORS semantics + codebase-confirmed request shape.]
- **Allow-Headers (keep):** `authorization, x-client-info, apikey, content-type` (`cors.ts:46`), plus `x-internal-job-secret` where `extraHeaders` is passed (analyze-resume/analyze-career). Preflight must echo these so the actual request's headers are permitted.
- **`Vary: Origin` (ADD):** required whenever ACAO is computed from the request Origin, so a CDN/browser cache keyed on one origin is not replayed for another (PITFALLS #6 cache-poisoning warning). Set on **every** response that may carry an origin-dependent ACAO (success AND error AND preflight).
- **Preflight status:** current `handleOptionsRequest` returns **200** (`new Response(null, {headers})`). 204 is also conventional/valid. Either works; keep 200 unless a reason to change (avoid scope creep). For preflight correctness, include `Access-Control-Allow-Methods` (e.g. `POST, OPTIONS`, or `GET, POST, OPTIONS` for `get-analysis-job-status`) and may include `Access-Control-Max-Age` to reduce preflight chatter (Claude's discretion; correctness-only per decision #4/Deferred).
- **`keep-warm` interaction:** `keep-warm` pings other functions with server-to-server OPTIONS (`keep-warm:46`) that carry **no Origin** header → new core omits ACAO, but the preflight still returns 200 with allow-methods, which is fine for warming. No regression.

### §10 Migration-specific pitfalls (surfaced for the planner)

See Common Pitfalls below — they encode the shim/`Vary`/CDN/OPTIONS-before-auth/omit-ACAO/header-absence-assertion risks.

## Standard Stack

**No new packages.** This is an in-repo Deno/TypeScript change on existing primitives. (CLAUDE.md: "Out of scope: CORS/validation libraries — build it in-repo.")

### Core (existing, in-repo)
| Module | Version | Purpose | Why Standard |
|--------|---------|---------|--------------|
| `_shared/cors.ts` | repo | Origin allowlist, `withCors`, `jsonError` | Single chokepoint all 38 functions already import |
| `_shared/auth.ts` | repo | 401 builder rebuilt CORS-aware | Single auth chokepoint; throws the only CORS-less responses today |
| Deno `std@0.168.0/http/server.ts` | pinned | `serve(handler)` | Already the entrypoint primitive |
| Deno `std@0.224.0/assert/mod.ts` | pinned | Test assertions | Already used by `cors.test.ts`/`auth.test.ts` |
| `Deno.env.get` | runtime | Read `ALLOWED_ORIGINS` | Native; matches existing `APP_URL` read |

### Package Legitimacy Audit
N/A — no external packages are installed in this phase (in-repo Deno + existing std imports only).

## Architecture Patterns

### System flow (request → CORS-tagged response)

```
Browser (apex or www, Bearer+apikey headers, no cookies)
        │
        ▼
Edge Function serve()/Deno.serve()
        │
        ├── method === OPTIONS ──► handleOptionsRequest(type, req)
        │         │                   • type user  → ACAO=echo(req.Origin if allowlisted) + Vary:Origin
        │         │                                   + Allow-Headers + Allow-Methods  (status 200)
        │         │                   • type internal/webhook → {} (status 200, no CORS)
        │         ▼
        │      preflight Response (CORS present for approved origins; ACAO omitted otherwise)
        │
        └── else ──► withCors(req, type, handler)
                          │
                          ├── try: realHandler(req)  ──► success Response  ──┐
                          │        │                                          │  merge CORS
                          │        ├── requireAuth throws Response(401) ──────┤  headers onto
                          │        │   (bare, no CORS)                        │  EVERY outgoing
                          │        └── throws Error ──► jsonError(req,500) ───┤  Response
                          │                                                   │  (+ Vary:Origin)
                          └── catch(Response e): merge CORS, return ──────────┘
                                                                              │
                                                                              ▼
                                            Browser CAN read body → SPA renders 401/402/429
                                            → 401 triggers token-refresh-and-retry
```

### Pattern 1: Request-aware allowlist core (the heart of the fix)
**What:** Parse `ALLOWED_ORIGINS` once at module load; per request, normalize `req.headers.get('Origin')` (strip trailing slash) and echo it ONLY if exact-match in the set; else omit ACAO. Always add `Vary: Origin`.
**When:** `type === 'user'` only. `internal`/`webhook` short-circuit to `{}`.
```typescript
// _shared/cors.ts (illustrative — Source: synthesized from cors.ts:29-55 + ARCHITECTURE.md §6 + decision #3)
const ALLOWED: ReadonlySet<string> = new Set(
  (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean),
);

function corsCore(type: CorsType, req?: Request, extraHeaders?: string): Record<string, string> {
  if (type === 'internal' || type === 'webhook') return {};
  const allowHeaders = extraHeaders
    ? `authorization, x-client-info, apikey, content-type, ${extraHeaders}`
    : 'authorization, x-client-info, apikey, content-type';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
  const origin = (req?.headers.get('Origin') ?? '').replace(/\/$/, '');
  if (origin && ALLOWED.has(origin)) headers['Access-Control-Allow-Origin'] = origin; // decision #3: omit otherwise
  return headers;
}
```
**Note (decision #3 vs ARCHITECTURE.md):** ARCHITECTURE.md §6 line 272 shows `const allow = ALLOWED.includes(origin) ? origin : ALLOWED[0]` (default to first). **Do NOT do that** — decision #3 (PITFALLS wins): omit ACAO entirely for unapproved origins.

### Pattern 2: Surface-stable shim (zero changes at 21 call sites for Bug 1)
**What:** Keep `corsHeaders({ type, extraHeaders })` and `handleOptionsRequest({ type, extraHeaders })` signatures; add an optional `req` so callers that CAN pass it (most have `req` in scope) get origin reflection, and callers that don't still compile. Internally both delegate to `corsCore`.
**Why:** All 21 user call sites pass `{ type: 'user' }` literals (§4); without `req`, ACAO is omitted (fail-closed) — which is wrong for approved origins. **Therefore the real fix requires either (a) threading `req` into the shared calls, or (b) moving CORS emission into `withCors`, which has `req`.** Recommended: `withCors` owns CORS for the actual responses (it has `req` and runs after OPTIONS), while `handleOptionsRequest(type, req)` handles preflight. Plan must reconcile: a shim that ignores `req` cannot reflect the origin. This is the central design tension — call it out in the plan.

### Pattern 3: `withCors` wrapper guarantees CORS on every exit
```typescript
// _shared/cors.ts (illustrative — Source: ARCHITECTURE.md §6 line 281 + decision + Claude's discretion on Error→500)
export async function withCors(
  req: Request, type: CorsType, handler: () => Promise<Response>,
): Promise<Response> {
  if (req.method === 'OPTIONS') return handleOptionsRequest({ type }, req);
  const cors = corsCore(type, req);
  try {
    const res = await handler();
    return new Response(res.body, { status: res.status, statusText: res.statusText,
      headers: mergeHeaders(res.headers, cors) });           // see Pitfall 4 (immutable headers)
  } catch (e) {
    if (e instanceof Response) {
      return new Response(e.body, { status: e.status, statusText: e.statusText,
        headers: mergeHeaders(e.headers, cors) });           // bare 401 → CORS-tagged
    }
    return jsonError(req, 500, 'internal_error', e instanceof Error ? e.message : String(e)); // discretion
  }
}
```

### Pattern 4: `jsonError` additive envelope
```typescript
// Source: ARCHITECTURE.md §6 line 283-286 + decision #2 (additive)
export function jsonError(
  req: Request, status: number, error: string,
  extra?: { message?: string; resetDate?: string; tier?: string; code?: string; retryable?: boolean },
): Response {
  const body = { error, ...(extra ?? {}) };                  // top-level `error` string preserved
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsCore('user', req), 'Content-Type': 'application/json' },
  });
}
```
`retryable` derived from `isRetryable(status)` (Claude's discretion; align with `merit-error-messages.ts`: 408/429/5xx/529 retryable, 4xx validation not).

### Anti-Patterns to Avoid
- **Defaulting ACAO to `ALLOWED[0]`** for unapproved origins (ARCHITECTURE.md's sketch) — decision #3 forbids; omit ACAO.
- **`Access-Control-Allow-Origin: *`** — forbidden (and pointless: these are authenticated endpoints).
- **Returning a thrown bare `Response` unmodified** (today's `compare-jobs:336 return error`, `analyze-resume:1075 throw error`) — wrap so CORS is attached.
- **Mutating a Response's headers in place** when it may be immutable — construct a new Response (Pitfall 4).
- **Appending to the old `cors.test.ts`** — its APP_URL-based assertions are now wrong; replace them.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Origin allowlist parsing | Per-function inline split/trim | One module-level `Set` in `cors.ts` | Single source; avoids drift across 21 functions |
| Attaching CORS to errors | Spread `corsHeaders` at every `new Response` by hand | `withCors` + `jsonError` | The bare-401 bug proves hand-spreading gets missed on error paths |
| Preflight response | Bespoke OPTIONS per function | `handleOptionsRequest(type, req)` | Already the shared idiom; keep it |
| 401 construction | New 401 builders per function | Rebuilt `auth.ts unauthorizedResponse(req)` | Single chokepoint; preserves `{ error: 'Unauthorized' }` + CORS |
| CORS library | Adding an npm/Deno CORS package | In-repo `cors.ts` | CLAUDE.md/STATE.md forbid new CORS libs; no new infra |

**Key insight:** the defect is precisely a hand-rolled-error-response problem — CORS is centralized for the *happy path* but error/throw paths bypassed it. The remedy is to make the *only* way to emit a response carry CORS by construction (`withCors`/`jsonError`), not to spread headers more carefully by hand.

## Runtime State Inventory

> This is a brownfield refactor touching a runtime config key (`APP_URL` → `ALLOWED_ORIGINS`). After all code is updated, what runtime state still references the old config?

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — CORS is computed per-request from an env var; nothing persisted in Postgres references the origin/APP_URL. (Verified: no DB column or RPC reads CORS config.) | None |
| Live service config | **`ALLOWED_ORIGINS` must be set as a Supabase edge secret on BOTH preview (`cimjltzovkahkqecpwgi`) and prod (`zjpjapgraoxdukdvpjes`)** — these live in the Supabase secrets store, NOT git. `APP_URL` currently set on both (per `ENVIRONMENT.md:75`) and remains until CORS stops reading it. | Operator `supabase secrets set` per env (config task, not code) |
| OS-registered state | None — no Task Scheduler / cron embeds the origin. (Prod cron points at preview host per MEMORY, but that is unrelated to CORS config.) | None |
| Secrets/env vars | `APP_URL` (existing) and NEW `ALLOWED_ORIGINS`. Code rename: `cors.ts` stops reading `APP_URL`, starts reading `ALLOWED_ORIGINS`. `docs/ENVIRONMENT.md` + `.env.example` must be updated. Decide whether `APP_URL` is still consumed elsewhere before removing it. | Code edit (read new key) + docs + operator sets secret |
| Build artifacts | None — Deno functions are deployed from source via `supabase functions deploy`; no compiled artifact caches the origin. All 38 functions must be **redeployed** so the rewritten `_shared/cors.ts` ships (shared modules are bundled per-function at deploy). | Redeploy all functions (staging→prod, operator-gated) |

**Critical migration note:** because `_shared/cors.ts` is bundled into each function at deploy time, fixing the file is **not** live until **every** function is redeployed. The roll-out is "redeploy all," not "deploy cors.ts."

## Common Pitfalls

### Pitfall 1: Auth 401 still escapes without CORS
**What goes wrong:** `auth.ts unauthorizedResponse()` throws a bare 401; if `withCors` is not adopted by a given function (or the function uses `throw error` to `serve`'s default `onError`), the browser still swallows it.
**Why:** `serve` (std@0.168.0) `onError` returns a generic 500 with no CORS for uncaught throws; `return error` returns the bare 401.
**How to avoid:** Rebuild `unauthorizedResponse(req)` to attach `corsCore('user', req)` directly AND route every user function's body through `withCors` so the catch tags it. Belt-and-suspenders (both, per locked decision).
**Warning signs:** Network tab shows a 401 flagged CORS-blocked; SPA auto-refresh (`fetchWithTimeout.ts:103`) never fires.

### Pitfall 2: Shim can't reflect origin without `req`
**What goes wrong:** Keeping `corsHeaders({ type: 'user' })` signature unchanged but omitting `req` means ACAO is always omitted → approved origins get blocked (worse than today).
**Why:** Origin reflection requires the request; the old signature has no request.
**How to avoid:** Emit the *actual* response CORS from `withCors` (which has `req`); use `handleOptionsRequest({ type }, req)` for preflight. Do not rely on a `req`-less `corsHeaders` to produce ACAO.
**Warning signs:** apex AND www both fail in tests because ACAO is never set.

### Pitfall 3: Missing `Vary: Origin` → CDN cache poisoning
**What goes wrong:** A cached response for apex is replayed for www (or vice-versa) with the wrong ACAO → intermittent CORS failures.
**Why:** ACAO varies by Origin but the cache key doesn't include Origin.
**How to avoid:** Emit `Vary: Origin` on every origin-dependent response (success, error, preflight).
**Warning signs:** Intermittent CORS errors that depend on which origin warmed the cache.

### Pitfall 4: Immutable Response headers when re-tagging
**What goes wrong:** `withCors` tries `response.headers.set(...)` on a Response whose headers are immutable → throws.
**Why:** Headers from some Response sources are guarded; safest to reconstruct.
**How to avoid:** Build a NEW `Response(res.body, { status, statusText, headers: merged })`. Streaming responses (`analyze-resume` SSE) need special care — preserve the `ReadableStream` body and Content-Type/SSE headers when merging (do not buffer the stream).
**Warning signs:** `analyze-resume` streaming breaks, or "Cannot modify immutable headers" in logs.

### Pitfall 5: OPTIONS evaluated after auth
**What goes wrong:** If `withCors` runs `handler` before checking OPTIONS, a preflight (which carries no Authorization) hits `requireAuth` and 401s.
**Why:** Preflight must be answered before any auth.
**How to avoid:** `withCors` (and every function) short-circuits `req.method === 'OPTIONS'` first — matches the existing per-function pattern.
**Warning signs:** Preflight returns 401; actual request never sent by the browser.

### Pitfall 6: Test asserts header presence but not ABSENCE
**What goes wrong:** Matrix proves approved origins get ACAO but never proves a disallowed origin gets NONE → a future reflect-all regression passes.
**Why:** Positive-only tests miss the fail-closed contract.
**How to avoid:** Assert `headers.get('Access-Control-Allow-Origin') === null` for a disallowed Origin, AND `=== apex`/`=== www` for approved ones, on BOTH success and 4xx/5xx and preflight.
**Warning signs:** Reflect-all reintroduced silently; PITFALLS #6 "reflect arbitrary Origin" vuln returns.

### Pitfall 7: Forgetting to redeploy every function
**What goes wrong:** `cors.ts` is fixed and tests pass, but prod still blocks www because only some functions were redeployed.
**Why:** Shared modules are bundled per-function at deploy.
**How to avoid:** Redeploy ALL functions; CORS-06 prod verification must hit apex AND www on a sample across all 21 user functions (or all four observed + a spread).
**Warning signs:** Some endpoints accept www, others don't.

## Code Examples

### Existing OPTIONS pattern (to be preserved/wrapped)
```typescript
// Source: supabase/functions/grade-linkedin/index.ts:352-355
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleOptionsRequest({ type: 'user' });
  }
```

### The 401 defect (to be fixed)
```typescript
// Source: supabase/functions/_shared/auth.ts:48-53  (NO CORS headers — the CORS-04 bug)
function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'Unauthorized' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );
}
```

### Backward-compat error builders `jsonError` must mirror
```typescript
// Source: supabase/functions/_shared/usage-checker.ts:131-142  (status 429)
return new Response(JSON.stringify({
  error: 'usage_limit_reached', message: `...resets on ${formattedDate}.`,
  resetDate, tier,
}), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Source: supabase/functions/_shared/rate-limiter.ts:163-177  (status 429 + Retry-After)
return new Response(JSON.stringify({
  error: 'rate_limit_exceeded', message: 'Too many requests...', retryAfter: retryAfterSecs,
}), { status: 429, headers: { ...corsHeaders({ type: corsType }), 'Content-Type': 'application/json', 'Retry-After': String(retryAfterSecs) } });
```

### Static-source-analysis test idiom (for the CORS-05 drift guard)
```typescript
// Source: supabase/functions/grade-linkedin/handler-config.test.ts:10-31
const rawPath = new URL('./index.ts', import.meta.url).pathname;
const INDEX_PATH = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath; // Windows fix
const source = Deno.readTextFileSync(INDEX_PATH);
Deno.test('routes OPTIONS through shared helper', () => {
  assertEquals(source.includes('handleOptionsRequest') || source.includes('withCors'), true);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single static `Access-Control-Allow-Origin: <APP_URL>` | Env allowlist + per-request origin reflection + `Vary: Origin` | This phase | apex+www+localhost+preview all served by one deploy |
| Errors built ad-hoc, CORS spread by hand on happy path only | `withCors`/`jsonError` make CORS-by-construction on every exit | This phase | 401/402/429/5xx render in the SPA |
| `APP_URL` as CORS source of truth | `ALLOWED_ORIGINS` as CORS source of truth | This phase | Multi-origin; `APP_URL` may remain for non-CORS uses |

**Deprecated/outdated:**
- CLAUDE.md's reference to a centralized `_shared/handler.ts` Zod/CORS wrapper — **does not exist** in this repo; do not plan around it.
- CONTEXT's `AiCreditsContext.markCreditsDepletedFromError` symbol — superseded by the Merit system (`useMerits.ts`, `merit-error-messages.ts`); target the live consumers instead.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Deno test (`std@0.224.0/assert`) for edge; vitest 4.x + Playwright 1.61 for the rest of `verify:baseline` |
| Config file | `supabase/functions/deno.json` (task `test:ci` lists files explicitly) |
| Quick run command | `cd supabase/functions && deno test _shared/cors.test.ts --no-check --allow-env --allow-read` |
| Full suite command | `npm run verify:baseline` (→ `npm run test && npm run test:edge && npm run test:e2e`) |
| PowerShell helper | `scripts/run-edge-tests.ps1` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| CORS-02 | Approved apex Origin → ACAO=apex; www → ACAO=www; on success | unit (deno) | `deno test _shared/cors.test.ts --no-check --allow-env --allow-read` | ✅ rewrite `cors.test.ts` |
| CORS-03 | Disallowed Origin → ACAO absent (`=== null`); never `*` | unit (deno) | same | ✅ rewrite |
| CORS-04 | CORS present on 401/402/429/4xx/5xx; `Vary: Origin` present | unit (deno) | same + `auth.test.ts` update | ✅ rewrite `cors.test.ts` + `auth.test.ts` |
| CORS-02 | OPTIONS preflight → CORS headers + Allow-Methods/Headers | unit (deno) | same | ✅ rewrite |
| CORS-05 | Every user function routes OPTIONS through shared helper (no hardcoded ACAO) | static-source (deno) | new `cors-audit.test.ts` | ❌ Wave 0 |
| CORS-06 | Matrix green inside `verify:baseline`; prod apex+www config verified | gate + manual | `npm run verify:baseline`; operator curl apex+www | ✅ (in `test:ci`) + manual op |

### Sampling Rate
- **Per task commit:** `deno test _shared/cors.test.ts _shared/auth.test.ts --no-check --allow-env --allow-read`
- **Per wave merge:** `cd supabase/functions && deno task test:ci`
- **Phase gate:** `npm run verify:baseline` green before `/gsd:verify-work`; then operator verifies prod apex+www on deployed functions.

### Wave 0 Gaps
- [ ] Rewrite `_shared/cors.test.ts` — replace APP_URL assertions with the request-aware origin × status × preflight matrix (covers CORS-02/03/04). Already in `test:ci`.
- [ ] Update `_shared/auth.test.ts` — 401 from an approved Origin must include ACAO (CORS-04) while preserving `body.error === 'Unauthorized'`.
- [ ] New `_shared/cors-audit.test.ts` (static-source) iterating the 21 user functions for the OPTIONS-via-shared-helper invariant (CORS-05 drift guard) — **must be added to `deno.json` `test:ci`** (unlike `cors.test.ts`, this new file is not yet registered).
- [ ] Optional `withCors`/`jsonError` unit tests (thrown-Response re-tagging, thrown-Error→500, streaming body preserved).

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireAuth` JWT verify (`auth.ts`); 401 must remain readable so SPA can re-auth, body stays `{ error: 'Unauthorized' }` (no detail leak, D-13) |
| V3 Session Management | indirect | Token-refresh-on-401 (`fetchWithTimeout.ts:103-108`) depends on the 401 being CORS-readable |
| V4 Access Control | yes | Allowlist exact-match; omit ACAO for unapproved origins (fail-closed) |
| V5 Input Validation | minor | Origin string normalization (trim + trailing-slash strip) before set membership |
| V14 Config | yes | `ALLOWED_ORIGINS` per-environment secret; staging→prod operator-gated; do not regress v4.0 advisor=15 |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Reflect-all Origin (echo any Origin) | Spoofing/EoP | Allowlist membership check before echo; never reflect arbitrary Origin (PITFALLS line 325) |
| `*` ACAO on authenticated endpoint | EoP | Forbidden; exact-origin echo only |
| CDN cache poisoning across origins | Tampering | `Vary: Origin` on all origin-dependent responses |
| Opaque error hides real auth failure | Repudiation/DoS-of-debugging | CORS on every error so the true 401/402/429 surfaces (root-cause, not masking) |
| Detail leakage in error bodies | Info disclosure | Keep `{ error: 'Unauthorized' }`; additive `code`/`retryable` only, no internal details |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Deno | Edge tests (`cors.test.ts`) | ✓ (existing infra) | std imports pinned (0.168.0 server, 0.224.0 assert) | — |
| Supabase CLI | `supabase secrets set`, `functions deploy` | ✓ | 2.107+ (package.json `supabase ^2.107.0`) | — |
| `ALLOWED_ORIGINS` secret (preview) | Staging verification | ✗ (not yet set) | — | Operator sets via `supabase secrets set --project-ref cimjltzovkahkqecpwgi` |
| `ALLOWED_ORIGINS` secret (prod) | Prod verification (CORS-06) | ✗ (not yet set) | — | Operator sets via `--project-ref zjpjapgraoxdukdvpjes` (Claude read-only on prod) |
| Staging stable preview alias value | Staging allowlist entry | ✗ (unknown value) | — | Operator supplies the Vercel alias URL (Open Question 1) |

**Missing with no in-repo fallback (operator action):** the two `ALLOWED_ORIGINS` secret values and the staging preview alias URL. These are config/operator tasks, not code blockers — the code can ship and be tested with env-injected values in `cors.test.ts`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | App is not cookie-credentialed → `Access-Control-Allow-Credentials` not needed | §9 | If any flow uses `credentials:'include'`, ACAC would be required and `*` truly forbidden. Mitigated: grepped — no `credentials:'include'`; supabase-js defaults to same-origin. LOW risk. |
| A2 | `std@0.168.0` `serve` `onError` returns a CORS-less generic 500 for uncaught throws | §3, Pitfall 1 | If onError behavior differs, the "throw escapes without CORS" claim weakens — but the bare-401 problem stands regardless. LOW risk. |
| A3 | Keeping preflight at status 200 (vs 204) is fine | §9 | Browsers accept both 2xx for preflight; 200 is current behavior. Negligible. |
| A4 | `APP_URL` has no other consumer that breaks if CORS stops reading it | §8 | `ENVIRONMENT.md:75` says "+14 fns" but that count likely conflates the cors.ts import; planner should grep `APP_URL` usage before removing. MEDIUM — verify in plan. |
| A5 | All 21 user functions have `req` in scope at every response site for `withCors` adoption | §3, Pattern 2 | A few use named-handler `return error`; refactor to `withCors` is mechanical but must preserve streaming. MEDIUM. |

## Open Questions

1. **Staging stable preview alias URL (the actual value).**
   - Known: staging allowlist = `<stable preview alias> + http://localhost:8080`; prod = apex+www.
   - Unclear: the literal alias hostname (a Vercel alias, not in repo).
   - Recommendation: operator provides it before staging verification; until then, test with a placeholder env value. Does not block code.

2. **`APP_URL` disposition after CORS migrates to `ALLOWED_ORIGINS`.**
   - Known: `cors.ts:38` is the documented consumer; `ENVIRONMENT.md:75` claims "+14 fns".
   - Unclear: whether any non-CORS code reads `APP_URL`.
   - Recommendation: plan a `grep -rn APP_URL supabase/functions` task; keep `APP_URL` if used elsewhere (email links, redirects), else mark deprecated in `ENVIRONMENT.md`. Do NOT delete blindly.

3. **`withCors` adoption depth — wrapper-only vs per-call-site threading.**
   - Known: Bug 1 is fixed by `cors.ts` internals + getting `req` into ACAO emission; Bug 2 by tagging error throws.
   - Unclear: whether to migrate all 21 functions to `withCors` (cleaner, larger diff) or keep `serve(async (req)=>...)` and only (a) make `handleOptionsRequest(type, req)` reflect origin and (b) have inline `corsHeaders` calls receive `req`. The latter touches every `corsHeaders({ type:'user' })` call site (~80 occurrences).
   - Recommendation: prefer `withCors` at the entrypoint of the 21 user functions (single wrap per function) so inline `corsHeaders` calls can keep omitting `req` and `withCors` overlays the correct ACAO on the way out — minimizing per-line edits while guaranteeing coverage. Confirm in planning; this is the main structural decision.

4. **Streaming (`analyze-resume`) under `withCors`.**
   - Known: SSE uses a `ReadableStream` body and `text/event-stream`.
   - Unclear: header-merge must not buffer/clone the stream.
   - Recommendation: `withCors` must preserve the streaming body and only add CORS/Vary headers; add a focused test or exclude the streaming success Response from re-construction (tag headers before the stream starts).

## Sources

### Primary (HIGH confidence — direct codebase reads, 2026-06-27)
- `supabase/functions/_shared/cors.ts` (full, 68 lines) — current surface, single-origin bug
- `supabase/functions/_shared/auth.ts` (full, 196 lines) — `unauthorizedResponse` CORS-04 offender, AuthType
- `supabase/functions/_shared/usage-checker.ts:124-143`, `rate-limiter.ts:154-178` — error envelopes
- `supabase/functions/_shared/cors.test.ts`, `auth.test.ts`, `deno.json` — test wiring (`test:ci` already includes `cors.test.ts`)
- `supabase/functions/grade-linkedin/handler-config.test.ts` — static-source-analysis idiom
- All 38 `index.ts` (grep) — CORS-type classification, OPTIONS/serve patterns, catch-block behavior, zero hardcoded ACAO literals
- `src/lib/fetchWithTimeout.ts` (full), `src/hooks/useResumeStream.ts:100-258`, `src/lib/merit-error-messages.ts` (full) — frontend error-body consumers; no-credentials confirmation
- `docs/ENVIRONMENT.md:73-95`, `.env.example:62`, `scripts/cutover-production.ps1`, `scripts/README-stripe-provisioning.md` — secret wiring
- `vite.config.ts:9,15-19` — dev/preview port 8080 (localhost origin)
- `supabase/functions/deno.json` — `test:ci` task contents

### Secondary (HIGH — milestone research carried into CONTEXT)
- `.planning/research/ARCHITECTURE.md` §6 (lines 254-293, 310-322, 363, 371) — withCors/jsonError/allowlist design
- `.planning/research/PITFALLS.md` #6 (124-142), #7 (146-163), anti-pattern 5 (412-415), tables (293-345) — defect analysis + decision #3 (omit ACAO)

### Tertiary (established/stable, training knowledge — not fast-moving)
- Browser CORS semantics: origin reflection requires `Vary: Origin`; ACAC only for cookie-credentialed (`credentials:'include'`) requests; `*` incompatible with credentials. HIGH confidence; stable for years; corroborated by ARCHITECTURE.md/PITFALLS.md. No web lookup performed (nothing genuinely ambiguous).

## Metadata

**Confidence breakdown:**
- Current-state findings (cors.ts, auth.ts, function inventory, frontend consumers, test wiring): HIGH — every claim cites file:line; counts grep-verified.
- Architecture patterns (withCors/jsonError/shim): HIGH on intent (locked + ARCHITECTURE.md); MEDIUM on exact mechanics (Claude's discretion — illustrative code, not prescriptive).
- Env values: HIGH for prod apex+www and localhost:8080; LOW for staging alias value (operator-supplied).
- Browser CORS semantics: HIGH (stable, corroborated).

**Research date:** 2026-06-27
**Valid until:** 2026-07-27 (stable domain; revisit only if `_shared/cors.ts`/`auth.ts` or the function set changes)

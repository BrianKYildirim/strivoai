# Phase 1: Cross-Origin & Error-Contract Foundation - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Centralize cross-origin handling inside `_shared/cors.ts` so that approved production
origins (apex `https://strivoai.net` + approved `https://www.strivoai.net`) reach **every**
active Edge Function reliably, and so structured error bodies (401/402/429/4xx/5xx +
preflight) render at the frontend instead of being swallowed by the browser as opaque
"CORS errors". The origin mismatch must not be able to silently recur (guarded by a
table-driven regression test in `verify:baseline`).

**Requirements:** CORS-01..06.

This phase clarifies **how** to implement the centralized CORS + error-contract fix.
It does **not** add new product capabilities. The full structured-error taxonomy and the
frontend error mapper belong to **Phase 3** (LIFE-08) and are explicitly out of scope here.
</domain>

<decisions>
## Implementation Decisions

### Locked by research (carried in, not re-debated)
Source: `.planning/research/ARCHITECTURE.md` §6, `.planning/research/PITFALLS.md` #6–7.
- Env-driven `ALLOWED_ORIGINS` allowlist (comma-separated; each entry trimmed + trailing
  slash stripped). Replaces the single-origin `APP_URL` CORS source.
- Origin-reflection-with-validation: read the request `Origin`, and **echo that exact
  origin** back in `Access-Control-Allow-Origin` only when it is on the allowlist.
- Always set `Vary: Origin` when ACAO depends on the request origin (correct caching).
- Never `*` on credentialed/authenticated requests.
- New `withCors(req, type, handler)` wrapper guarantees CORS headers on **every** response,
  including thrown `Response`/`Error` and OPTIONS preflight.
- New `jsonError(...)` helper produces a CORS-tagged, frontend-readable error response.
- `auth.ts`'s `unauthorizedResponse()` (401/403) is rebuilt to carry CORS headers.
- `internal` and `webhook` CORS types keep returning `{}` (no CORS headers) — unchanged.
- Roll the fix across **all ~20 active Edge Functions** (CORS-05: not only the 4 observed
  in production logs), and add a table-driven `cors.test.ts` (origin × status × preflight)
  into `verify:baseline`.

### 1. Allowlist scope & preview/dynamic-URL handling — **Exact set per environment**
- **Production** allowlist = `https://strivoai.net` + `https://www.strivoai.net` **only**
  (tightest; the confirmed `www` outage is the must-fix).
- **Staging/preview** allowlist = that environment's **stable preview alias** +
  `http://localhost:8080` (the Vite dev origin).
- Exact-string match only — **no wildcard, no suffix/pattern matching.**
- Dynamic per-deploy Vercel hash URLs are **not** required to call Edge Functions
  directly; rely on a stable preview alias instead. (If that assumption is ever wrong,
  revisit suffix-matching scoped to the preview env only — deferred, not in scope now.)
- `ALLOWED_ORIGINS` is set **distinctly per environment** in Supabase secrets, riding the
  existing env-separation discipline in `docs/ENVIRONMENT.md`.

### 2. Error-envelope shape & backward-compat — **Additive, non-breaking now**
- The **primary fix** this phase is: every response — success AND failure, incl.
  401/402/429/4xx/5xx and OPTIONS — carries origin-aware CORS headers so the body renders.
- **Preserve the existing response contract**: keep the top-level
  `{ error: <string>, resetDate?, tier? }` shape that current frontend consumers read
  (e.g. `AiCreditsContext.markCreditsDepletedFromError`, the 402/429 usage-limit path,
  `{ error: 'Unauthorized' }` on 401). Do **not** break these.
- `jsonError` may **add optional siblings** (`code`, `retryable`) alongside the existing
  string `error` — additive only.
- The full nested `{ error: { code, message, retryable, stage?, requestId? } }` taxonomy
  and the frontend `src/lib/analysisError.ts` mapper are **Phase 3 (LIFE-08)** — NOT here.

### 3. Unapproved-origin behavior — **Omit ACAO, fail-closed**
- For an origin **not** on the allowlist: **omit** the `Access-Control-Allow-Origin`
  header entirely (the browser then blocks the cross-origin read — correct for
  credentialed requests).
- Do **not** echo a default `ALLOWED[0]` origin (this resolves the ARCHITECTURE.md vs
  PITFALLS.md inconsistency on the safe/fail-closed side — PITFALLS.md wins).
- The error/response **body is still readable for approved origins** — that is the whole
  point of the fix (errors render for legitimate users, disappear for disallowed origins).

### 4. Rollout discipline & prod config verification — **Surface-stable shim + staging→prod**
- Keep the **exported surface stable**: existing `corsHeaders(...)` and
  `handleOptionsRequest(...)` keep working (via an internal shim/adapter to the new
  request-aware implementation) so the ~20-function roll-out is mechanical and low-risk.
- Add `withCors` and `jsonError` as **new** exports.
- **No opportunistic refactors** beyond the CORS/error-contract change in this pass.
- `ALLOWED_ORIGINS` is configured + verified on **staging first**, confirmed, then on
  **production** — an operator-gated step (honors the preview→prod operator gate and the
  "pause for operator checkpoints" working agreement). Production apex+www config
  verification is part of the phase's success criteria (CORS-06).

### Claude's Discretion
- Internal mechanics of the shim that keeps `corsHeaders`/`handleOptionsRequest` signatures
  stable while delegating to the new request-aware path.
- Whether `withCors` catches thrown `Error` (not just thrown `Response`) and maps it to a
  generic CORS-tagged 500 via `jsonError`.
- Inclusion of `Access-Control-Allow-Methods` / `Access-Control-Max-Age` on preflight as
  needed for correctness.
- Exact `isRetryable(status)` mapping used to populate the optional `retryable` sibling.
- The precise structure of the table-driven `cors.test.ts` matrix (which functions are
  sampled vs exhaustively asserted), provided it covers: approved apex, approved www,
  disallowed origin, success + 4xx/5xx, and preflight.
- Determining the authoritative set of "active" Edge Functions to roll the fix across.
</decisions>

<specifics>
## Specific Ideas

- Confirmed production must-fix: `https://www.strivoai.net` users currently get
  "Failed to fetch" / CORS console errors while apex users succeed — single-origin
  `APP_URL` is the root cause.
- Confirmed second bug: `auth.ts` 401s and several `catch` blocks return responses with
  **no** CORS headers, so the SPA's auto-refresh-on-401 never triggers (JS can't read the
  401 body). Both bugs share one centralized fix in `_shared/cors.ts` + `_shared/auth.ts`.
- Current `cors.ts` uses `APP_URL` (single origin) — this is what gets replaced by the
  request-aware `ALLOWED_ORIGINS` allowlist.
</specifics>

<deferred>
## Deferred Ideas

- **Full nested structured-error taxonomy** (`INPUT_MISSING`, `FILE_NOT_FOUND`, … ,
  `UNKNOWN_ANALYSIS_ERROR`) + `src/lib/analysisError.ts` user-message mapper → **Phase 3
  (LIFE-08)**. Phase 1 only ships the additive, back-compatible envelope groundwork.
- **Suffix/pattern matching for dynamic Vercel preview-deploy URLs** — only revisit if a
  stable preview alias proves insufficient; scoped to the preview env if ever needed.
- **`Access-Control-Allow-Methods`/`Max-Age` tuning beyond correctness** — not a product
  decision; left to implementation.
</deferred>

---

*Phase: 01-cross-origin-error-contract-foundation*
*Context gathered: 2026-06-27*

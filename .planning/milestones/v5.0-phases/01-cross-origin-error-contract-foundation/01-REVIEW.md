---
phase: 01-cross-origin-error-contract-foundation
reviewed: 2026-07-01T00:00:00Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - docs/ENVIRONMENT.md
  - supabase/functions/_shared/auth.test.ts
  - supabase/functions/_shared/auth.ts
  - supabase/functions/_shared/cors.test.ts
  - supabase/functions/_shared/cors.ts
  - supabase/functions/_shared/cors-audit.test.ts
  - supabase/functions/admin-delete-user/index.ts
  - supabase/functions/analyze-career/index.ts
  - supabase/functions/analyze-resume/index.ts
  - supabase/functions/analyze-skills-gap/index.ts
  - supabase/functions/chat-agent/index.ts
  - supabase/functions/compare-jobs/index.ts
  - supabase/functions/create-checkout-session/index.test.ts
  - supabase/functions/create-checkout-session/index.ts
  - supabase/functions/create-payment-intent/index.test.ts
  - supabase/functions/create-payment-intent/index.ts
  - supabase/functions/create-stripe-portal/index.test.ts
  - supabase/functions/create-stripe-portal/index.ts
  - supabase/functions/deno.json
  - supabase/functions/get-analysis-job-status/index.ts
  - supabase/functions/grade-linkedin/index.ts
  - supabase/functions/interview-prep-analyze/index.ts
  - supabase/functions/interview-prep-evaluate/index.ts
  - supabase/functions/keep-warm/index.ts
  - supabase/functions/notify-upgrade-request/index.ts
  - supabase/functions/ocr-pdf/index.ts
  - supabase/functions/recruiting-lens/index.ts
  - supabase/functions/send-notification-email/index.ts
  - supabase/functions/submit-career-analysis-job/index.ts
  - supabase/functions/submit-resume-analysis-job/index.ts
  - supabase/functions/submit-resume-analysis-job/job-contract.test.ts
  - supabase/functions/test-email/index.ts
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

> **Resolution (2026-07-01, post-review):** **CR-01 FIXED** — added `if (error instanceof Response) throw error;` to the `submit-resume-analysis-job` and `submit-career-analysis-job` catch blocks so a thrown 401 `Response` propagates to `withCors` instead of collapsing to a 500; drift-guard assertions added to both `job-contract.test.ts` files. `npm run test:edge` green (791 passed / 0 failed). Ships to prod on the next `deploy.ps1` run. **WR-01, WR-02, WR-03 and the INFO items are DEFERRED to Phase 2 (Security Audit & Remediation)**, which owns the auth/error-contract/secrets surface. Do not re-fix CR-01.

# Phase 1: Code Review Report

**Reviewed:** 2026-07-01T00:00:00Z
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Summary

This phase centralizes CORS across the 21 user Edge Functions: `_shared/cors.ts`
was reworked from a single static `APP_URL` origin to a request-aware
`ALLOWED_ORIGINS` allowlist that reflects only exact-match origins (never `*`),
sets `Vary: Origin` on every origin-dependent response, fails closed (omits ACAO)
for unapproved origins, and adds `withCors` + `jsonError` primitives. A static
drift-guard (`cors-audit.test.ts`) forbids hardcoded ACAO literals and asserts
every user function routes through `withCors`.

**The CORS mechanics themselves are correct and well-tested.** I verified:
origin reflection vs. wildcard (never `*`), trailing-slash normalization,
`Vary: Origin` cache-poisoning safety, fail-closed behavior for unapproved
origins, streaming `ReadableStream` passthrough via `mergeCors`, and CORS on
thrown-Response / thrown-Error / OPTIONS paths. All 21 functions route through
`withCors(req, 'user', …)`; no hardcoded ACAO literal survives outside
`_shared/cors.ts`.

**However, the phase's own error-contract guarantee is defeated in two
functions.** `withCors` is designed so a thrown 401 `Response` from `requireAuth`
propagates *as-is* (status + body preserved, CORS merged). But
`submit-resume-analysis-job` and `submit-career-analysis-job` intercept that
thrown `Response` in their own `catch` block — which lacks the
`if (error instanceof Response) throw error;` guard that every other function
has — and convert the 401 into a generic 500. This breaks the frozen
`{ error: 'Unauthorized' }` contract *and* the SPA's documented
auto-refresh-on-401 reliability path, on two business-critical async flows.

## Critical Issues

### CR-01: `requireAuth` 401 is swallowed and re-emitted as 500 in both async-submit functions

**File:** `supabase/functions/submit-resume-analysis-job/index.ts:260-272`
**File:** `supabase/functions/submit-career-analysis-job/index.ts:252-260`

**Issue:** Both functions authenticate via `requireAuth(req, { type: 'user' })`
(submit-resume line 65; submit-career line 50). On any auth failure
(missing/expired/invalid JWT, or profile-not-found), `requireAuth` **throws a
`Response(401)`** with body `{ error: 'Unauthorized' }` (see `auth.ts:93-119`).
That throw is caught by each function's terminal `catch (error)` block, which —
unlike `analyze-resume` (line 1075), `analyze-career` (line 1806),
`grade-linkedin` (line 872), `recruiting-lens` (line 765), `compare-jobs`
(line 336), `ocr-pdf` (line 337), etc. — has **no `instanceof Response` guard**:

```js
} catch (error) {
  console.error("Error in submit-resume-analysis-job:", error);
  const message = error instanceof Error ? error.message : "Internal server error";
  const isAuthError =
    message.includes("Invalid user token") ||
    message.includes("authorization header") ||
    message.includes("Authenticated user does not match request userId");
  return new Response(JSON.stringify({ error: message }), {
    status: isAuthError ? 401 : 500,  // ← never 401: `error` is a Response, not an Error
    headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
  });
}
```

Because the thrown value is a `Response` (not an `Error`), `error instanceof
Error` is `false` → `message = "Internal server error"` → `isAuthError = false`
→ the function returns **HTTP 500 `{ error: "Internal server error" }`** for
what is actually a 401. (The `isAuthError` branch was written for the now-unused
local `authenticateRequest` helper, which throws plain `Error`s — see IN-02 —
but the code path in use is `requireAuth`, which throws a `Response`.)

This is reachable in normal operation: an expired JWT with an otherwise-valid
body (the frontend always sends `userId`/`resumeId`/`resumeText`) hits
`requireAuth` after body validation passes. Impact:
- Violates the frozen `{ error: 'Unauthorized' }` 401 contract this phase
  establishes (D-05/D-13).
- Defeats the SPA's documented "JWT invalid (401/403) → auto-refresh once"
  behavior — the client sees a 500, so the transparent token refresh never
  fires and the user gets a hard failure on Resume Analysis / Career Compass
  (both named business-critical in `CLAUDE.md`).
- A 500 is classified `retryable` in the merit-error taxonomy, so the client
  may futilely retry a request that will keep 500-ing until the token is
  refreshed by some other flow.

Note: `withCors` still merges CORS onto the wrong 500, so this is purely a
status/contract defect, not a CORS-header defect — but it falls squarely in the
"cross-origin **error contract**" scope of this phase. The static
`job-contract.test.ts` (lines 90-106) only asserts the `catch` *contains* the
`isAuthError`/401/500 tokens, so it green-lights the broken behavior.

**Fix:** Re-throw `Response` errors so `withCors` preserves the original 401
(matching every other function). In both catch blocks, add as the first line:

```js
} catch (error) {
  if (error instanceof Response) throw error; // preserve requireAuth 401/403 + CORS
  console.error("Error in submit-resume-analysis-job:", error);
  // ...unchanged...
}
```

(For `submit-career-analysis-job`, the same one-line insert at line 253.)

## Warnings

### WR-01: Allowlist match is case-sensitive with no diagnostic on an empty/misconfigured `ALLOWED_ORIGINS`

**File:** `supabase/functions/_shared/cors.ts:41-53, 87-90`

**Issue:** `allowedOrigins()` builds the set by `trim()` + trailing-slash strip
but does **not** case-normalize, and `corsCore` compares the request origin to
the set with exact `Set.has`. Browser `Origin` headers are always lower-cased
(scheme+host), so the *production* value `https://strivoai.net,https://www.strivoai.net`
works — but any operator typo with mixed case (e.g. `https://Strivoai.net`) or a
missing/empty `ALLOWED_ORIGINS` silently resolves to "no ACAO for anyone." That
is the safe (fail-closed) direction, but it is *also* the exact failure class
(browser CORS-blocked → "failed to fetch") that this phase was created to
prevent after the `www.strivoai.net` outage — and it now fails **silently**,
with no log line to distinguish "correctly rejecting evil.example" from
"allowlist is empty/misconfigured and rejecting real users."

**Fix:** Lowercase-normalize both sides of the comparison (reflect the original
request origin, which is already lowercase, so the echo stays byte-exact), and
emit a one-time `warn` when the parsed set is empty at request time so a
misconfiguration is observable in function logs:

```js
cachedSet = new Set(
  raw.split(',').map((o) => o.trim().replace(/\/$/, '').toLowerCase()).filter(Boolean),
);
// ...
const origin = (req?.headers.get('Origin') ?? '').replace(/\/$/, '');
if (origin && allowedOrigins().has(origin.toLowerCase())) {
  headers['Access-Control-Allow-Origin'] = origin;
}
```

### WR-02: `get-analysis-job-status` bypasses shared auth and leaks the specific 401 reason

**File:** `supabase/functions/get-analysis-job-status/index.ts:9-25, 170-178`

**Issue:** This function rolls its own `authenticateRequest` (throwing
`new Error("Invalid user token")` / `"Missing or invalid authorization header"`)
instead of the shared `requireAuth`, and its catch returns
`{ error: message }` with status 401. Unlike the frozen
`{ error: 'Unauthorized' }` contract (D-13, "no detail leakage"), this discloses
*why* auth failed (missing header vs. invalid token) and diverges from the
fleet-wide auth chokepoint (no admin-tier elevation, different body shape). The
401 *status* is correct here (so auto-refresh still works, unlike CR-01), but
the body contract is inconsistent.

**Fix:** Route through `requireAuth(req, { type: 'user' })` and let the thrown
401 `Response` propagate (add `if (error instanceof Response) throw error;` to
the catch), or at minimum return `{ error: 'Unauthorized' }` on the auth branch
so the body matches the centralized contract.

### WR-03: Internal error message echoed to the client in the 500 path

**File:** `supabase/functions/analyze-skills-gap/index.ts:286-292`

**Issue:** The terminal catch returns
`{ error: error instanceof Error ? error.message : 'Unknown error' }` with status
500, leaking raw internal error text (e.g. a `JSON.parse` message or an
`AI gateway error: <status>`) to the client. The sibling `compare-jobs` function
was hardened in this same family to a generic `'An unexpected error occurred'`
body (compare-jobs line 345), and `withCors`'s own thrown-Error path uses a
generic message (D-13); `analyze-skills-gap` (and, similarly, `grade-linkedin`
line 877 and the CR-01 functions) still echo internals. Low severity (messages
are not secrets) but inconsistent with the phase's no-detail-leak posture.

**Fix:** Return a fixed, generic 500 body and keep the detail server-side only:

```js
console.error('Error in analyze-skills-gap function:', error);
return new Response(
  JSON.stringify({ error: 'internal_error', message: 'An unexpected error occurred. Please try again.' }),
  { status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } }
);
```

## Info

### IN-01: Dead redundant inner OPTIONS branches in every wrapped handler

**File:** `supabase/functions/analyze-resume/index.ts:624-627` (and the same
pattern in all 21 wrapped functions, e.g. `grade-linkedin:354-356`,
`ocr-pdf:189-191`, `admin-delete-user:12-14`, `keep-warm:22-24`).

**Issue:** `withCors` short-circuits `OPTIONS` *before* invoking the handler
(`cors.ts:155-157`), so each handler's own `if (req.method === 'OPTIONS')
return handleOptionsRequest(...)` branch is unreachable dead code. Harmless, but
misleading — and the inner calls omit the `req` argument, so if one ever *were*
reached it would return a preflight with no ACAO. Consider removing for clarity
now that `withCors` owns preflight.

**Fix:** Delete the inner OPTIONS branches; `withCors` handles preflight
centrally.

### IN-02: Unused `authenticateRequest` helper in both submit-job functions

**File:** `supabase/functions/submit-resume-analysis-job/index.ts:12-33`
**File:** `supabase/functions/submit-career-analysis-job/index.ts:12-26`

**Issue:** Both files define an `authenticateRequest` helper that is never
called — the handlers use `requireAuth` instead. The stale helper is what the
`isAuthError`-by-message `catch` logic was written against, which is the root of
CR-01. Removing it makes the CR-01 mismatch obvious and eliminates dead code.

**Fix:** Delete the unused `authenticateRequest` function from both files.

### IN-03: Stale "Paddle" references in user/admin-facing email copy

**File:** `supabase/functions/notify-upgrade-request/index.ts:88`
**File:** `supabase/functions/send-notification-email/index.ts:71,75`

**Issue:** Email bodies hard-code "Payment was processed via Paddle" / default
`payment_method` of "Paddle", while this milestone migrates payment processing
to Stripe. On a Stripe-driven upgrade this is user-/admin-facing
misinformation. Pre-existing and out of the CORS scope, but a quality defect in
files under review.

**Fix:** Parameterize the payment-method label (or update to "Stripe") so the
copy reflects the active processor.

---

_Reviewed: 2026-07-01T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---
phase: 03-cross-device-reliability-and-compatibility
plan: 04
subsystem: api
tags: [supabase-edge-functions, deno, diagnostics, privacy, allowlist, rate-limiting, cors, telemetry]

# Dependency graph
requires:
  - phase: 03-01
    provides: "public.client_error_diagnostics on Preview and Production — RLS on, deny-all policy, zero anon/authenticated grants, service_role full privileges; the column list this endpoint's allowlist mirrors"
  - phase: 03-02
    provides: "__STRIVO_BUILD_ID__ / src/lib/platform/build-id.ts — the app_version value the client seam will send"
provides:
  - "supabase/functions/log-client-diagnostic — a fire-and-forget diagnostics ingest endpoint that answers 204 unconditionally"
  - "A server-side ALLOWED_FIELDS allowlist that DROPS every unknown key, making XLOG-02 enforceable rather than promised"
  - "Server-derived, date-salted, truncated ip_hash — no raw address is ever persisted or logged (D-13)"
  - "Identity-optional ingest: anonymous pre-auth beacons are accepted with user_id NULL; a client-asserted user_id is never trusted"
  - "28 offline Deno tests enrolled in the test:ci lane, machine-enforcing the always-204 and allowlist contracts"
  - "Three-place registration (config.toml, deploy.ps1 $Functions, deno.json test:ci) with regression guards for all three"
affects: [03-06 client diagnostics seam, 03-XLOG-02 guard test, phase-03 completion report, operator deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Always-204 fire-and-forget ingest: an endpoint whose response carries zero information about the store/drop outcome"
    - "Server-side field allowlist as a privacy control (iterate the allowlist, never the body)"
    - "Date-salted truncated hash as both the persisted identity surrogate and the rate-limit key"
    - "Registration-guard test co-located with the function it guards (extends the Phase 01.1 D-32 precedent)"

key-files:
  created:
    - supabase/functions/log-client-diagnostic/index.ts
    - supabase/functions/log-client-diagnostic/index.test.ts
  modified:
    - supabase/functions/deno.json
    - supabase/config.toml
    - scripts/deploy.ps1

key-decisions:
  - "Every exit is 204 — including the rate-limited one. Deliberate divergence from the shared 429 rate-limit response builder, because a client that can observe a diagnostics outcome can branch on one, and a prober would otherwise learn the size cap and the limiter state."
  - "The allowlist is iterated, not the body. An unknown key has no code path onto the row at all, so widening the leak surface requires editing ALLOWED_FIELDS — which index.test.ts asserts against key by key."
  - "Values that are not string/number/boolean are dropped (added beyond plan text). An object or array is the obvious smuggling vector for the content XLOG-02 forbids, and no column in the table has a structured type."
  - "The rate-limit branch is skipped entirely when no x-forwarded-for is present, rather than limiting all address-less traffic under one shared key."
  - "Two conflicting plan acceptance criteria were resolved in favour of the machine-checkable one: the createRateLimitResponse divergence is documented by naming _shared/rate-limiter.ts rather than the identifier, keeping the 'no matches' grep guard meaningful (it now proves non-use, not non-mention)."
  - "The registration guard test was split across commits so every commit is independently green: the deno.json half shipped with Task 2, the config.toml + deploy.ps1 halves with Task 3."

patterns-established:
  - "Always-204 contract: assert the status explicitly in EVERY test case, so 'never leaks an outcome' is machine-enforced instead of assumed"
  - "Forbidden-key list asserted per key with a failure message naming the regression ('ALLOWED_FIELDS has been widened')"
  - "Pure helpers exported from an edge function so the offline Deno lane can test privacy logic with no network and no database"

requirements-completed: [XLOG-01, XLOG-02]

# Metrics
duration: 38min
completed: 2026-07-28
---

# Phase 3 Plan 4: Diagnostics Ingest Endpoint Summary

**`log-client-diagnostic` ships as a fire-and-forget ingest that answers 204 on every path and enforces XLOG-02 with a server-side allowlist, so a client bug cannot leak a document, a filename, a stack or a raw error message into `client_error_diagnostics`.**

## Performance

- **Duration:** ~38 min
- **Tasks:** 3/3
- **Files created:** 2
- **Files modified:** 3

## Accomplishments

### Task 1 — The ingest function (`fb1de36f`)

`supabase/functions/log-client-diagnostic/index.ts` (339 lines), structured after
`validate-document/index.ts`: `serve(handleRequest)`, `withCors(req, 'user', …)`, imports from
`_shared/` only, manual validation (no zod), and an injectable `HandlerDependencies` seam.

Behaviour in order: non-POST → 204 · body > 4096 chars → 204 without parsing · malformed or
non-object JSON → 204 · optional `requireAuth` in a try/catch (failure means anonymous, not
rejected) · `deriveIpHash` over the first `x-forwarded-for` entry salted with the UTC date and
truncated to 16 hex chars · `checkRateLimitByKey('diag:'+ipHash, 60, 3600)` with a silent 204 drop
when limited · `buildRow` projecting onto `ALLOWED_FIELDS` · `error_category` coerced into the
13-member closed set · service-client insert inside a swallowing try/catch · 204.

The pure helpers (`clampString`, `coerceCategory`, `utcDateSalt`, `deriveIpHash`, `buildRow`) are
named exports so the offline lane tests the privacy logic directly.

### Task 2 — Tests + `test:ci` enrolment (`37e56b79`)

28 Deno tests, all offline. `log-client-diagnostic/index.test.ts` appended to the END of the
`test:ci` explicit file list — a one-token diff, the rest of the list byte-for-byte unchanged.

### Task 3 — Registration (`e0b520af`)

`[functions.log-client-diagnostic] verify_jwt = false` in `config.toml` with a purpose-written
comment (validate-document's "This endpoint is not anonymous" would be false here, and a test
asserts it is absent), plus one added line in the `deploy.ps1 $Functions` array.

## Task Commits

| Task | Name                                    | Commit     | Files                                                        |
| ---- | --------------------------------------- | ---------- | ------------------------------------------------------------ |
| 1    | Author the ingest function              | `fb1de36f` | `log-client-diagnostic/index.ts`                              |
| 2    | Deno tests + deno.json test:ci          | `37e56b79` | `log-client-diagnostic/index.test.ts`, `deno.json`            |
| 3    | config.toml + deploy.ps1 registration   | `e0b520af` | `config.toml`, `deploy.ps1`, `log-client-diagnostic/index.test.ts` |

## Threat-model coverage (as built)

| Threat                          | Mitigation shipped                                                                                                        | Guarded by                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Spoofed identity                | `user_id` set only from a verified `requireAuth` result; absent from `ALLOWED_FIELDS`                                       | "an authenticated record stores the verified user id" |
| PII leak                        | Allowlist DROPS unknown keys; 512-char clamp; primitives-only; category coerced; schema has no free-text column             | "XLOG-02 forbidden keys never reach a projected row" (10 keys, per key) |
| Raw address persisted or logged | `deriveIpHash` only; the raw value never enters a row field or a log call                                                    | "the ip hash never contains the address"; "the row carries ip_hash, never the raw address" |
| Information disclosure          | 204 on success, drop, oversize, malformed, limited, insert failure, unexpected throw                                        | every one of 28 tests asserts the status          |
| Flooding / cost                 | 4 KB pre-parse cap + 60/hour per ip-hash + (03-06) client-side emit cap + D-13 failures-only                                 | "a body larger than MAX_BODY_BYTES…"; "a rate-limited beacon is dropped silently" |
| CORS drift                      | `withCors(req, 'user', …)` only; zero hand-written headers                                                                  | `rg "Access-Control-Allow"` → no matches          |
| Silent non-deployment / non-test| All three registrations, each with a guard test in the function's own test file                                              | 3 registration-guard tests                        |

**Accepted residual (unchanged from the plan's threat model):** `checkRateLimitByKey` FAILS OPEN on
a DB error, so during a database incident the limiter is a no-op. Correct posture for diagnostics —
never fail the user flow — and bounded by the 4 KB cap, the schema's lack of free-text columns, the
client-side emit cap in 03-06, and the operator-run retention DELETE. A *throwing* limiter is
explicitly caught and also fails open, so a limiter outage cannot turn into a non-204.

## Verification

| Check                                                          | Result                                   |
| -------------------------------------------------------------- | ---------------------------------------- |
| `deno check log-client-diagnostic/index.ts`                     | exit 0                                   |
| `cd supabase/functions && deno task check`                      | exit 0 (all `*/index.ts` parsed)         |
| `npm run test:edge`                                             | **1465 passed / 0 failed / 12 ignored**  |
| Output names `log-client-diagnostic/index.test.ts`              | yes (28 tests)                           |
| `npm run lint`                                                  | 0 errors (151 pre-existing warnings)     |
| `npm run type-check`                                            | exit 0                                   |
| `rg "status:\s*(400\|401\|429\|500)" index.ts`                  | no matches — every exit is 204           |
| `rg "Access-Control-Allow" index.ts`                            | no matches                               |
| `rg "createRateLimitResponse" index.ts`                         | no matches                               |
| `rg -c "withCors" index.ts`                                     | 3                                        |
| `rg -c "log-client-diagnostic" supabase/config.toml`            | 1                                        |
| `rg -c '"log-client-diagnostic"' scripts/deploy.ps1`            | 1                                        |
| `rg -c "log-client-diagnostic/index.test.ts" deno.json`         | 1                                        |
| `git diff scripts/deploy.ps1`                                   | exactly one added line                   |
| `git diff supabase/functions/deno.json`                         | exactly one changed line (one added token)|

`_shared/cors-audit.test.ts` stays green: its `USER_FUNCTIONS` list is a hardcoded set of 19 with a
length guard, so a new function neither enrols nor breaks it. No `_shared/` file was modified.

## Deviations from Plan

### Auto-fixed / hardened

**1. [Rule 2 — Missing critical hardening] Non-primitive values are dropped, not passed through**
- **Found during:** Task 1
- **Issue:** The plan's projection rule ("skip undefined and null, clamp every string") would pass an
  object or array straight onto the row. `{"user_agent": {"resume": "…"}}` is the obvious way a
  future client bug or a hostile poster smuggles structured content past a field-name allowlist.
- **Fix:** `buildRow` accepts `string | number | boolean` and drops everything else. No column in
  `client_error_diagnostics` has a structured type, so nothing legitimate is lost.
- **Files:** `supabase/functions/log-client-diagnostic/index.ts`
- **Commit:** `fb1de36f` (test: "non-primitive values are dropped rather than smuggled through")

**2. [Rule 2 — Missing critical hardening] Non-object JSON bodies rejected**
- **Found during:** Task 1
- **Issue:** `JSON.parse("[1,2,3]")` and `JSON.parse("null")` succeed. Indexing an array or null with
  the allowlist field names is at best meaningless and at worst a crash.
- **Fix:** Explicit `typeof === 'object' && !== null && !Array.isArray` check → 204.
- **Commit:** `fb1de36f`

**3. [Rule 2 — Missing critical hardening] Throwing dependencies cannot break the 204 contract**
- **Found during:** Task 1
- **Issue:** The plan wraps the *insert* in try/catch, but a throw from `checkRateLimitByKey` (or
  anything else) would propagate to `withCors`, which converts a thrown Error into a **500** —
  silently breaking the always-204 contract exactly when the system is already degraded.
- **Fix:** The rate-limit call has its own try/catch that fails open, and the whole handler body has
  an outer try/catch returning 204.
- **Commit:** `fb1de36f` (test: "a throwing rate limiter fails open and still returns 204")

**4. [Rule 2] Address-less requests skip rate limiting rather than sharing one key**
- **Found during:** Task 1
- **Issue:** `deriveIpHash` returns null when there is no `x-forwarded-for`. Hashing the empty string
  would put every address-less request under a single shared 60/hour bucket, letting one client
  starve all of them.
- **Fix:** `deriveIpHash` returns null and the rate-limit branch is skipped; `ip_hash` is stored NULL.
- **Commit:** `fb1de36f`

### Plan-internal conflict resolved

**5. Two Task 1 acceptance criteria contradicted each other.** The `<action>` requires a comment
"naming this as a deliberate divergence from `createRateLimitResponse()`", while an
`<acceptance_criteria>` requires `rg "createRateLimitResponse" index.ts` to return **no matches**.
Resolved in favour of the machine-checkable guard: both comments name the divergence via
`_shared/rate-limiter.ts` ("the shared 429 rate-limit response helper … this function imports the
limiter but NOT that response builder") rather than the bare identifier. The meaning is fully
preserved and the grep now proves **non-use** rather than merely non-mention.

### Sequencing deviation

**6. The registration guard test was split across Tasks 2 and 3.** Written whole it would have failed
in the Task 2 commit, since `config.toml` and `deploy.ps1` are Task 3's files. The `deno.json` half
shipped with Task 2 and the other two halves with Task 3, so **every commit is independently green**.

## Out of Scope / Not Done

Per the orchestrator's hard constraints and the plan's own boundary:

- **No frontend code.** The client seam is plan 03-06. Nothing under `src/` was touched.
- **No deploy.** The function is *registered*, not shipped. `supabase functions deploy` and
  `scripts/deploy.ps1` were not run. **Operator action required** before any diagnostics data flows.
- **No database writes.** `client_error_diagnostics` (03-01) was read from the migration file only;
  Preview and Production were not touched, queried or probed.
- **No Phase 02 file touched**, no `_shared/` file modified, no `.planning/STATE.md` or
  `.planning/ROADMAP.md` change, nothing written under `phases/02-ai-token-cost-optimization/`.
- `npm run test:e2e` was deliberately **not** run as a gate — it is expected red at HEAD per R-10
  (`AI_TEST_MODE` is a CI-only secret) and R-20 (the `@xdev` lane is intentionally red until waves
  3-5). Targeted lanes were used instead.

## Follow-ups for later plans

1. **03-06 (client seam)** must emit only the 22 `ALLOWED_FIELDS` names, use `sendBeacon` with a
   `text/plain` Blob (simple request, no preflight, no auth header), never `await` the emit, cap
   emits per session, and keep a single in-flight slot.
2. **`app_version` / `surface` / `lifecycle_stage` are NOT NULL** in the table. A record omitting any
   of them is rejected by Postgres and silently swallowed here (correct per D-11, but invisible). The
   client builder must always supply all three; `error_category` is the only one this endpoint can
   guarantee, via its `unexpected` default.
3. **Operator deploy** of `log-client-diagnostic` to Preview, then Production.
4. **`ALLOWED_ORIGINS`** must include the surfaces that will emit beacons. Note that a `text/plain`
   `sendBeacon` is a simple request, so a missing origin does not block the *send* — it only makes the
   response unreadable, which is fine here.

## Self-Check: PASSED

- `supabase/functions/log-client-diagnostic/index.ts` — FOUND
- `supabase/functions/log-client-diagnostic/index.test.ts` — FOUND
- `supabase/functions/deno.json` — FOUND (contains `log-client-diagnostic/index.test.ts`)
- `supabase/config.toml` — FOUND (contains `[functions.log-client-diagnostic]`)
- `scripts/deploy.ps1` — FOUND (contains `"log-client-diagnostic"`)
- Commit `fb1de36f` — FOUND
- Commit `37e56b79` — FOUND
- Commit `e0b520af` — FOUND

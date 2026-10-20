---
phase: 03-cross-device-reliability-and-compatibility
plan: 06
subsystem: client-diagnostics
tags: [diagnostics, privacy, error-capture, XLOG-01, XLOG-02, XDEV-08, D-10, D-11, D-13]
requires:
  - "03-01: public.client_error_diagnostics (four NOT NULL columns, every device field nullable)"
  - "03-02: src/lib/platform/build-id.ts getBuildId() as the app_version source"
  - "03-04: supabase/functions/log-client-diagnostic (always-204 ingest, server ALLOWED_FIELDS)"
provides:
  - "src/lib/diagnostics/client-diagnostics.ts — reportDiagnostic()/buildDiagnosticRecord(), the ONE seam all 11 audit surfaces adopt"
  - "src/lib/diagnostics/categories.ts — the frozen closed failure taxonomy, mirrored with the edge function"
  - "src/lib/diagnostics/install-global-handlers.ts — the first global window error + unhandledrejection capture in src/"
  - "setDiagnosticAuthTokenProvider() — synchronous token seam for the authenticated keepalive fallback"
affects:
  - "src/lib/analysis-error-log.ts (delegates transport; every export preserved)"
  - "src/main.tsx (installs global handlers before render)"
  - "plans owning the 11 surfaces: adopt reportDiagnostic at their own call sites"
tech-stack:
  added: []
  patterns:
    - "navigator.sendBeacon + text/plain Blob (CORS simple request, no preflight, survives unload)"
    - "allowlist projection (iterate the allowlist, never the input) mirroring the server's buildRow"
    - "validate-and-drop identifier fields rather than strip-and-keep"
    - "never-throws telemetry contract mirroring _shared/ai-telemetry.ts"
key-files:
  created:
    - src/lib/diagnostics/categories.ts
    - src/lib/diagnostics/client-diagnostics.ts
    - src/lib/diagnostics/client-diagnostics.test.ts
    - src/lib/diagnostics/install-global-handlers.ts
  modified:
    - src/lib/analysis-error-log.ts
    - src/main.tsx
decisions:
  - "Script-origin classification is supplied BY THE CALLER so no stack string ever enters client-diagnostics.ts — the module is structurally unable to read a message or a stack, rather than merely choosing not to."
  - "run_id / capability_tier / error_name are validate-and-drop, not strip-and-keep: stripping punctuation out of a signed storage URL leaves the token characters intact and concatenated."
  - "The keepalive fetch fallback fires only when a synchronous token provider is registered; with none, sendBeacon is the only path. A token cannot be resolved without awaiting, which guarantee 1 forbids."
  - "A drop caused by the in-flight slot does not consume cap budget — the cap bounds a flood, it does not punish a collision."
  - "03-02's deferred 'build id reaches a built chunk' guard is implemented as a static import-chain assertion rather than a build-output assertion, to avoid adding a full vite build to the vitest lane."
  - "A deliberate import cycle exists between analysis-error-log.ts and client-diagnostics.ts (classifier reuse in one direction, transport delegation in the other). Neither module calls the other at module-evaluation time; npm run build produces no circular-dependency warning."
metrics:
  duration: ~35 min
  tasks: 3
  files: 6
  commits: 3
  tests-added: 35
  completed: 2026-07-28
---

# Phase 03 Plan 06: Privacy-Safe Client Diagnostics Seam Summary

Generalized the resume-analysis-only console log into one never-throwing, capped,
allowlist-projecting diagnostics seam wired to the 03-04 ingest endpoint, and installed
the first global `error` / `unhandledrejection` capture `src/` has ever had.

## What Shipped

**Task 1 — the seam** (`aa876405`)

`src/lib/diagnostics/categories.ts` freezes the 13-member failure taxonomy, in the same
order as the edge function's `CATEGORIES`, with `coerceDiagnosticCategory()` mirroring the
server's `coerceCategory` so a record is categorised identically on both sides of the wire.

`src/lib/diagnostics/client-diagnostics.ts`:

- `DIAGNOSTIC_ALLOWED_KEYS` — the client half of XLOG-02, byte-mirrored with the server's
  `ALLOWED_FIELDS` (22 keys; the identity and address-hash columns are deliberately absent).
- `buildDiagnosticRecord()` — pure, never-throws. Builds a candidate then **projects by
  iterating the allowlist**, dropping every non-primitive exactly as the server does. Fills
  `app_version` from `getBuildId()`, `error_category` fail-closed to `unexpected`,
  `error_name` from the error's **constructor name only**, plus browser/version (reusing
  `parseBrowser`), a new `parsePlatform()` for OS / OS version / device type / engine,
  viewport, DPR, `navigator.onLine`, `connection.effectiveType` (recorded, never branched
  on), the clamped UA, and an optional `run_id`.
- `reportDiagnostic(input): void` — D-11's four guarantees in code: returns `void` (the file
  contains no `await` at all), the whole body is one swallowing `try/catch` with no console
  output, a per-session cap of 20 checked before any work, and a single in-flight slot that
  drops rather than queues. Transport is `sendBeacon` with a `text/plain` Blob; the
  authenticated `keepalive` fetch is the fallback. An unresolvable endpoint URL makes the
  whole thing a silent no-op.

**Task 2 — global capture and delegation** (`2de0e24c`)

`install-global-handlers.ts` adds `window` `error` and `unhandledrejection` listeners
(defect **XD-20** closed): idempotent, re-entrancy guarded, never touching React state,
never rendering, never rethrowing, and never suppressing the browser's default handling.
The `error` handler classifies `script_origin` from the event's **source URL scheme** and
sets `is_extension` — extension-injected failures are recorded and isolated rather than
reported as app failures (**XDEV-08**); the URL itself never reaches a record.

`analysis-error-log.ts` now delegates its durable transport to `reportDiagnostic` with a
stage-to-category map (upload → `upload_failed`, stream → `stream_failed`, job-poll →
`poll_failed`, …). The console line stays for local debugging and is intentionally richer
than the emitted record — its message and stack never leave the device. **Every export
keeps its name and signature**; `AnalysisErrorBoundary`, `Results.tsx` and
`useResumeStream.ts` are untouched and their tests pass unchanged (defect **XD-21** closed
on the observability half).

`main.tsx` installs the handlers after the polyfill side-effect imports (so a polyfill
failure is itself capturable) and before `createRoot(...).render(...)`.

**Task 3 — the XLOG-02 guard, both halves** (`6a3e4544`)

35 vitest cases. The client half stuffs a record with six distinctive needles — a
multi-paragraph resume body, a LinkedIn URL, an email, a filename, a full stack trace and a
**signed storage URL with a query token** — plus smuggled `message` / `stack` / `filename` /
`file` / `user_id` keys, and asserts the key set is a subset of the allowlist and that
neither the needles nor their bare tokens survive serialization. The server half reads
`supabase/functions/log-client-diagnostic/index.ts` as source text, parses `ALLOWED_FIELDS`
and `CATEGORIES`, and asserts equality with the client lists — with a non-empty-walk
assertion so a regex that stops matching fails loudly instead of passing vacuously.

Also covered: never-throws under absent / throwing `sendBeacon`, a rejecting fallback fetch,
a failing `JSON.stringify`, a circular error value and an unreadable `window.innerWidth`;
the cap and the in-flight slot; category coercion; extension classification for all three
extension schemes; and platform derivation including iPadOS-versus-macOS via touch points.

## Mutation Proof (required by Task 3)

Both halves of the guard were proven able to fail, then reverted:

| Mutation | Result |
| --- | --- |
| `error_name: safeErrorName(input.error)` → `(input.error as Error)?.message` | **RED** — 2 tests failed: `needle "linkedin" leaked` and the constructor-name test. |
| Added `'message'` to the client `DIAGNOSTIC_ALLOWED_KEYS` only | **RED** — `server ALLOWED_FIELDS equals client DIAGNOSTIC_ALLOWED_KEYS` failed, proving the server half is not decorative. |

Both reverted; `npm run test` is 125 files / 934 tests green.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `run_id` / `capability_tier` sanitizer smuggled a signed-URL token**
- **Found during:** Task 3, while writing the PII guard.
- **Issue:** The Task 1 helper *stripped* non-identifier characters and kept the remainder.
  A `run_id` accidentally set to a signed storage URL would therefore emit
  `httpsprojsupabasecostorage…tokenNEEDLEZQ7TOKEN` — the secret intact, merely
  concatenated. A strip-and-keep sanitizer is not a PII control.
- **Fix:** Replaced with `safeIdentifier()`, which accepts the value only if the WHOLE
  string is already a bare identifier and otherwise drops the field entirely.
- **Files modified:** `src/lib/diagnostics/client-diagnostics.ts`
- **Commit:** `6a3e4544`

### Interpretation Notes

**Script-origin classification moved to the caller.** The plan asked the builder to classify
using `classifyScriptOrigin` from `analysis-error-log.ts`, but the same task's acceptance
criterion requires that `client-diagnostics.ts` contain no `.stack` access at all. Callers
(the global handlers hold the event source URL, `analysis-error-log.ts` holds the stack) now
classify and pass the four-value enum in; the builder's fallback uses `isExtensionError`,
which also comes from `analysis-error-log.ts`. This is strictly stronger than the plan's
shape: the module is structurally incapable of touching a stack, not merely disciplined.

**03-02's deferred build-chunk assertion.** 03-02 asked its first real importer to assert
the literal build ID reaches a built chunk. Running a full `vite build` inside vitest would
add roughly a minute to `verify:baseline` for every developer on every run. Implemented
instead as a static import-chain assertion (`main.tsx` → `install-global-handlers` →
`client-diagnostics` → `build-id`, plus a `getBuildId()` call-site check) which is the
permanent guard against the actual regression 03-02 feared — the module losing its importer
and being tree-shaken back out. **Residual:** a silently broken Vite `define` would still
produce `app_version: "unknown"` on every row rather than going red. That is visible in the
first diagnostics query and is left for the plan that owns `/version.json` (03-13).

**Fetch fallback is gated on a registered token provider.** Resolving a Supabase session is
asynchronous, and awaiting inside the emit would break guarantee 1. `setDiagnosticAuthTokenProvider()`
is the synchronous seam; until a later plan registers one, `sendBeacon` (present in every
supported browser) is the only transport. This also keeps the vitest lane free of real
network traffic, since jsdom has no `sendBeacon`.

**Import cycle.** `analysis-error-log.ts` ↔ `client-diagnostics.ts`, deliberately, to reuse
the existing classifiers rather than duplicate them (the plan's file list allowed no third
module). Neither module calls the other during module evaluation, and `npm run build`
reports no circular-dependency warning.

## Scope Discipline

Adopting the seam at the 11 surfaces was NOT done here — that belongs to the plans owning
those surfaces. Untouched by explicit constraint: `src/lib/supabaseClient.ts` (03-08), the
polyfills (03-09), the capability gate (03-11), the error taxonomy and boundaries (03-12),
`supabase/functions/deno.json`, every migration file, `.planning/STATE.md` and
`.planning/ROADMAP.md`. No database write, no deploy, no push.

## Verification

| Check | Result |
| --- | --- |
| `npm run type-check` | exit 0 |
| `npx eslint src/lib/diagnostics src/lib/analysis-error-log.ts src/main.tsx` | exit 0, no output |
| `npx vitest run src/lib/diagnostics/client-diagnostics.test.ts` | 35 passed |
| `npm run test` (full vitest lane) | 125 files, 934 tests passed |
| `npm run build` | built, no circular-dependency warning |
| `rg "error\.(message\|stack)\|\.filename\|\.stack\|user_id" src/lib/diagnostics/client-diagnostics.ts` | no matches |
| `rg "preventDefault" src/lib/diagnostics/install-global-handlers.ts` | no matches |
| export-identifier diff on `analysis-error-log.ts` (HEAD~ vs now) | identical |

## Defect Register Impact

- **XD-20** (zero global `onerror` / `unhandledrejection` handlers) — **closed**: both
  listeners exist and are installed before render. Regression slot:
  `src/lib/diagnostics/client-diagnostics.test.ts` § *the build identity reaches the bundle*
  (install-before-render assertion).
- **XD-21** (diagnostics console-only and resume-only) — **closed on the observability
  half**: the seam is shared and writes durably; the extension classifier now reaches a
  database column. The user-facing extension isolation remains 03-12's.

## Follow-ups for Later Plans

1. The ingest endpoint is registered but **not deployed** — until the operator deploys it,
   every beacon 404s silently, which is a non-event by design but means no rows land.
2. Surface adoption: each of the 11 surface-owning plans should call `reportDiagnostic` with
   its own `surface` and `stage`, and pass `capabilityTier` once 03-11 exposes it.
3. Registering a token provider (03-08 territory) would let authenticated records carry
   `user_id`, which the server derives; without it every row is anonymous.

## Self-Check: PASSED

All four created files exist on disk; all four commits (`aa876405`, `2de0e24c`, `6a3e4544`,
`987c9266`) exist in `git log`; branch is `staging`, working tree clean, nothing pushed.

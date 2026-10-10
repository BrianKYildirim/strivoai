# Phase 3: Cross-Device Reliability and Compatibility - Research

**Researched:** 2026-07-27
**Domain:** Browser/device compatibility engineering — feature detection, polyfills, bundle-version safety, session storage under restricted-storage browsers, realtime/polling recovery, Playwright multi-engine test matrices, privacy-safe client telemetry
**Confidence:** HIGH for HEAD-grounded findings (read directly from installed source and repo files) · MEDIUM for browser-behaviour claims verified against one external source · LOW where flagged inline

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Device coverage & test matrix (XTEST-01, XTEST-04)**

- **D-01:** Playwright runs **5 projects** — `chromium`, `firefox`, `webkit`, plus emulated
  iPhone (WebKit) and Pixel (Chromium). Today `playwright.config.ts` and
  `playwright.prod.config.ts` are **chromium-only**; this is the core XTEST-01 gap.
- **D-02:** A **tagged cross-device subset** runs on all 5 projects; the full functional suite
  stays chromium-only. Rationale: `verify:baseline` is already a seven-layer gate, and a ~5x
  e2e blow-up drives people to `-SkipVerify`, which defeats the gate entirely.
- **D-03:** **Do not automate previous-major (N-1) browsers.** Pinning a second Playwright
  version is brittle and drifts from real-world N-1. Instead the support floor is a concrete
  feature set enforced by feature detection (D-06), with N-1 spot-checked in the manual pass.
- **D-04:** Real-device coverage is a **manual scripted pass** on the operator's Mac + Windows.
  A cloud device farm is **not** adopted now — revisit only if the audit proves gaps that
  emulation structurally could not have caught.
- **D-05:** The final matrix may list a browser as **supported** only with an engine pass **and**
  one real-device spot-check for that browser family. Anything with only one of the two is
  listed **"partially verified"**, never "supported". WebKit-the-engine is not Safari-the-browser
  and the report must say so plainly.

**Supported-browser policy & gate placement (XDEV-01)**

- **D-06:** The support floor is enforced by **feature detection against a required-API set**,
  not UA version parsing. A human-readable version list is published as *guidance only*.
  Rationale is evidential, not theoretical: the `Map.prototype.getOrInsertComputed` bug fixed
  on 2026-07-26 shipped in browsers that were otherwise *current* — a version check would not
  have caught it.
- **D-07:** Failure behavior is **tiered** — marketing pages and authentication remain
  accessible; AI flows and Stripe checkout are blocked with a controlled explanation rather
  than being allowed to fail mid-flow. Protects the money paths and the Merit ledger without
  turning a marginal browser into a total wall.
- **D-08:** The gate exists in **both** places: an ES5-safe, dependency-free inline guard in
  `index.html` that runs before the module bundle (this is the only thing that can catch the
  current white-screen-on-parse-failure case), plus a styled in-app check using design tokens
  for the detailed capability test and copy.
- **D-09:** When the audit finds a missing browser API, the default is to **polyfill when safely
  polyfillable**, extending the guarded pattern already proven in
  `src/lib/polyfills/map-get-or-insert.ts` (defers to native when present, installed across all
  realms). Block only where honest emulation is impossible.

**Privacy-safe diagnostics (XLOG-01, XLOG-02)**

- **D-10:** Generalize `src/lib/analysis-error-log.ts` — today resume-analysis-only — into a
  **shared client-diagnostics seam adopted across all 11 audit surfaces**. Partial coverage
  guarantees the next unknown-device failure lands somewhere unlogged.
- **D-11:** **Persist to Postgres via a fire-and-forget edge function.** The operative question
  ("which browser/OS combinations fail at which lifecycle stage") cannot be answered against
  console logs. A diagnostics failure must never fail a user flow — same posture as TOK-01.
- **D-12:** Use a **separate table from `ai_call_telemetry`**. That table is Phase 02's,
  server-side, per-Anthropic-call, service-role-only, and **actively in flight under separate
  ownership**. Client device diagnostics is a different actor, lifecycle and retention. This
  decision exists partly to guarantee zero edits to the cofounder's migration and files.
- **D-13:** Record **failures only**, each carrying browser, OS, device type, app version,
  lifecycle stage and sanitized error category. Volume then scales with breakage, not traffic.
  No user documents, resume/LinkedIn content or PII — enforced by a guard test (XLOG-02).

**One-click integrity (XRUN-01, XRUN-02)**

- **D-14:** **Audit the 5 AI features first**; extract a shared submit-guard primitive **only
  where 2+ features need the same fix.** Keeps blast radius proportionate to evidence on paths
  that charge real money.
- **D-15:** Enforce at **both layers** — a client submit-lock (stops the duplicate request being
  made, keeps the UI honest on slow devices) and a server idempotency key (the only guarantee
  that survives a second tab, refresh, or restored session).
- **D-16:** **Reuse the existing v5.0 `deriveIdempotencyKey` / stable `inputIdentity` pattern.**
  Do not invent a new keying concept. Duplicate clicks must collapse while a deliberate Elite
  re-run — which users pay for, and which `e2e/elite-rerun-merit.spec.ts` already guards — must
  still create a new attempt.
- **D-17:** Prove it by **extending `e2e/two-tab-concurrency.spec.ts` and
  `e2e/elite-rerun-merit.spec.ts`** with rapid-click cases and running them on the cross-device
  subset. Both specs already target this behavior; reuse their fixtures rather than adding new ones.

**Stale bundles & redeploy recovery (XDEV-07)**

- **D-18:** Implement **both** a build-ID stamp and a chunk-load-failure catch. The stamp is
  needed anyway to satisfy XLOG-01's *app version* field, so active version detection is nearly
  free once it exists. The catch covers the user already mid-session at deploy time; the stamp
  covers the long-idle tab.
- **D-19:** On detection, perform a **silent single auto-reload**, guarded against loops via
  `sessionStorage`, preserving the current route and any active run id so XRUN-03 recovery
  restores in-flight work.

**Timeouts & wait experience (XRUN-05, XRUN-03)**

- **D-20:** **A client-side timeout may never declare failure.** Only the server's terminal
  lifecycle state can. On timeout the client degrades to polling `get-analysis-run-status` until
  the run reaches a stop state. This is the only option that structurally satisfies "slow devices
  and networks must not show false failures", and `useAnalysisRun` already has the machinery.
- **D-21:** During extended waits, surface the **honest lifecycle stage** (extracting,
  generating, saving) from the existing 11-state lifecycle. No fabricated progress bars, no
  estimated-time-remaining.

**Audit method & triage (XDEV-02)**

- **D-22:** **Matrix-first discovery** — stand up the 5-project suite early and let real failures
  drive discovery, then run a targeted static sweep for the categories tests cannot reach
  (device memory limits, extension injection, stale bundles). The suite is needed regardless, so
  this front-loads the asset that keeps paying off, and every finding arrives with a reproduction.
- **D-23:** **Only reproduced issues are fixed in this phase**, and each fix gets a regression
  test (XTEST-03). Unreproduced findings go to a residual register with severity — nothing is
  lost, scope stays bounded and honest. Mirrors how v5.0 handled its 17-domain security audit.

**Verification & rollout**

- **D-24:** "Production-equivalent verification" means: **Preview verifies everything except real
  AI output.** The device matrix, browser gates, polyfills, stale-bundle recovery, idempotency
  and diagnostics are all fully verifiable there — none depend on real Anthropic output. Only
  genuinely AI-dependent checks need a scripted operator pass on production, and planning must
  **schedule that pass explicitly** rather than assume it.
- **D-25:** **Staged rollout by ascending blast radius** — (1) diagnostics + test matrix (no
  user-visible change; diagnostics immediately start producing the data that validates
  everything after), (2) browser gate + polyfills, (3) one-click and timeout behavior changes on
  the money paths last. This is the pattern v5.0 used successfully across its feature migrations.

**Naming**

- **D-26:** This phase's behavioral requirement IDs use the **`XRUN-*`** prefix, not `RUN-*`.
  v4.0 already shipped `RUN-01..07` (runtime-reliability error taxonomy) and `STATE.md`
  references `RUN-03` in that sense. `XRUN-*` avoids a live traceability collision.

### Claude's Discretion

The following are deliberately left to research and planning, within the decisions above:
- The exact required-API set for feature detection, and the concrete published version list.
- Diagnostics table name, column set, RLS posture and retention policy.
- The tag/grep mechanism used to define the cross-device subset, and which specs carry the tag.
- File layout for the generalized diagnostics seam and the browser-support module.
- All user-facing copy wording (subject to XRUN-06: never raw JS/DB/provider/stack text).
- Whether the shared submit-guard primitive is warranted (D-14 makes this evidence-driven).

### Deferred Ideas (OUT OF SCOPE)

- **Cloud device farm (BrowserStack / Sauce Labs / LambdaTest)** — would give genuine iOS Safari,
  Edge-on-Windows and Android Chrome in CI and make real-device coverage non-optional. Deferred
  by D-04: it is new paid infrastructure and a deliberate break from the "no new infrastructure"
  stack constraint. Revisit as its own phase **only if** this phase's audit proves device-specific
  gaps that engine + emulation coverage structurally could not have caught.
- **A third environment with live Anthropic calls** — would close the Preview `AI_TEST_MODE` gap
  permanently. Substantial new infrastructure and recurring AI spend; well outside this phase.
</user_constraints>

---

## Summary

This phase is **not** a greenfield compatibility build. Most of the machinery already exists at HEAD
(guarded polyfill pattern, error boundary with extension isolation, structured leak-free logging,
subscribe-first/poll-fallback recovery, server-side magic-byte document validation, in-flight
checkout refs, a frozen 13-code error taxonomy). The work is **closing named, verifiable gaps** in
that machinery and **building the observation apparatus** (5-project Playwright matrix + Postgres-backed
client diagnostics) that turns "sometimes fails on other devices" into a list of reproduced defects.

Static inspection of HEAD already produced **eight concrete, high-value root causes** before a single
test was run — including three that would each independently cause the exact symptom class the operator
reported (white screen / broken money path on someone else's device):

1. **`src/lib/supabaseClient.ts` passes `storage: localStorage` explicitly**, which *bypasses*
   `@supabase/auth-js`'s own `supportsLocalStorage()` probe and its `memoryLocalStorageAdapter`
   fallback. The bare `localStorage` reference is also evaluated at module scope, so a `SecurityError`
   on property access (Chrome "block site data", some managed/enterprise profiles) throws during
   module evaluation → **white screen with no error UI**. (XDEV-04)
2. **`crypto.randomUUID()` is called unguarded at 4+ money-path submit sites** (`Upload.tsx:281`,
   `Onboarding.tsx:86`, LinkedIn Grader, Recruiting Lens) to derive the `attemptNonce` that protects
   against double Merit charges. `crypto.randomUUID` requires a **secure context** and Safari ≥ 15.4.
   A throw here breaks XRUN-01/XRUN-02 hard, not softly. (XDEV-03, XRUN-01)
3. **`vercel.json` has a catch-all rewrite `/(.*)` → `/index.html`.** After a redeploy, a deleted
   hashed chunk (78 chunks, 20 lazy routes) returns **200 `text/html`**, not 404 — producing an
   engine-specific MIME-type module error rather than a clean network failure. (XDEV-07)

The verified good news: **Vite 8.0.16 emits a `vite:preloadError` window event** for every failing
dynamic import (confirmed in the installed build runtime), which gives an **engine-independent**
chunk-load detection point and removes the need for per-browser error-string matching. And
**Playwright 1.61 supports `channel: 'msedge'` / `channel: 'chrome'`**, which means genuine Microsoft
Edge on the operator's Windows host is *automatable*, materially shrinking XTEST-04's manual surface
below what D-04/D-05 assumed.

The largest planning risk is **not technical**: `VITE_FEATURE_ANALYSIS_LIFECYCLE` is **OFF**, so
`useAnalysisRun` — the hook the CONTEXT and UI-SPEC both build XRUN-03/04/05 on — is **dormant in
every environment**. The live recovery path is `Results.tsx` (`resumes` table realtime +
`get-analysis-job-status` polling), which is a *different* mechanism with a *different* state
vocabulary. Planning must resolve this explicitly (see Open Question 1) rather than plan against a
surface no user reaches.

**Primary recommendation:** Build the matrix and the diagnostics seam first (Wave 1), let them find
defects (Wave 2), then fix in ascending blast radius — and scope XRUN-03/04/05 to the **live**
non-lifecycle path unless the operator explicitly approves flipping the lifecycle flag, which is a
Merit-ledger change that Preview structurally cannot validate.

---

## HEAD Grounding — Verified Facts

Everything in this section was read from the working tree or `node_modules/` on 2026-07-27. It supersedes
any assumption in the brief, roadmap or UI-SPEC that contradicts it.

| Claim | Verified | Evidence |
|-------|----------|----------|
| Playwright configs are chromium-only | **TRUE** | `playwright.config.ts` → projects `setup` + `chromium`. `playwright.prod.config.ts` → `prod-smoke` (Desktop Chrome). |
| `useAnalysisRun` implements subscribe-first + poll-fallback | **TRUE** | `src/hooks/useAnalysisRun.ts` — unique channel topic, `MAX_EMPTY_POLLS=3`, `DEFAULT_POLL_MS=2500`, `STOP_STATES`, authoritative `FILE_NOT_FOUND` clear. |
| …but it is **DORMANT** | **TRUE** | `isAnalysisLifecycleEnabled()` requires `VITE_FEATURE_ANALYSIS_LIFECYCLE === 'true'`; the quick-task SUMMARY records it deliberately left OFF. Hook early-returns an inert snapshot. |
| The **live** recovery path is different | **TRUE** | `src/pages/Results.tsx:463-478` subscribes to `resumes` `postgres_changes` and polls `get-analysis-job-status` — not `analysis_jobs`, not the 11-state ledger. |
| Neither `.subscribe()` call site passes a status callback | **TRUE** | `useAnalysisRun.ts:339` and `Results.tsx:478` are both bare `.subscribe()`. `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` are never observed. |
| `analysis-error-log.ts` is console-only, resume-only | **TRUE** | Single `console.error("[AnalysisError]", record)`. No network. Consumed only by `AnalysisErrorBoundary`. |
| Guarded polyfill pattern is proven | **TRUE** | `src/lib/polyfills/map-get-or-insert.ts` — `define()` skips when native exists; installed in `main.tsx` + both pdf.js worker realms. |
| `UniversalAnalyzing` has all four fabrications | **TRUE** | Progress curve L83-128 (`95 * (1 - exp(-elapsed/tau))`); `expectedDurationMs` default 25 000; `subtitle = 'This usually takes about 20 seconds'` (L33); `currentStep` derived from the curve (L112-116). |
| `useIdempotencyKey` exists | **TRUE** | `src/hooks/useIdempotencyKey.ts` — `crypto.randomUUID()` + `regenerate()`. **Not imported by any page** — the live money paths call `crypto.randomUUID()` inline instead. |
| `e2e/two-tab-concurrency.spec.ts` + `e2e/elite-rerun-merit.spec.ts` exist | **TRUE** | 15 KB and 13 KB respectively. The two-tab spec has one **quarantined** (environment-gated) case tied to lifecycle dormancy. |
| 29 `100vh` / `min-h-screen` / `h-screen` occurrences | **TRUE** | 29 matches across 20 files. |
| `index.html` viewport meta lacks `viewport-fit=cover` | **TRUE** | `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`. No `user-scalable=no`, no `maximum-scale` (good). |
| `textarea.tsx` / `select.tsx` are `text-sm` | **TRUE** (per UI-SPEC, re-confirmed by the UI-SPEC's own HEAD audit) | Contract requires `text-base md:text-sm`. |
| Vite is **8.0.16 with Rolldown 1.0.3** | **TRUE** | `vite/package.json` deps include `"rolldown": "1.0.3"`. Built asset `rolldown-runtime-*.js` present in `dist/`. |
| `vite:preloadError` is emitted | **TRUE** | `node_modules/vite/dist/node/chunks/node.js:28405-28410` — `handlePreloadError` dispatches a **cancelable** `Event("vite:preloadError")` with `.payload`, and re-throws unless `defaultPrevented`. Injected via `getPreloadCode()` into every build. |
| 20 lazy routes / 78 built chunks | **TRUE** | `src/App.tsx:26-45` uses `lazy(() => import(...))` × 20+. `dist/assets/` contains 78 files. |
| `vercel.json` catch-all rewrite | **TRUE** | `{"source": "/(.*)", "destination": "/index.html"}`. No `headers` block. |
| Playwright 1.61 has `iPhone 14` / `Pixel 7` | **TRUE** | `iPhone 14` → webkit, 390×664, DPR 3, `isMobile`+`hasTouch`. `Pixel 7` → chromium, 412×839, DPR 2.625. 207 descriptors total. |
| Playwright 1.61 supports **real Edge/Chrome channels** | **TRUE** | `playwright-core/lib/server/registry/index.js` registers `chrome`, `chrome-beta`, `msedge`, `msedge-beta`, `msedge-dev` chromium channels. |
| `testProject.grep` exists (per-project test filtering) | **TRUE** | `playwright/types/test.d.ts:329`. Matches against `"<project> <file> <describe> <test> <tags>"`. |
| `offline` and `reducedMotion` are context/`use` options | **TRUE** | `playwright-core/types/types.d.ts` — `offline?: boolean` and `reducedMotion?: null\|"reduce"\|"no-preference"` on `BrowserContextOptions` and testOptions. |
| `supabaseClient.ts` bypasses the auth-js storage probe | **TRUE** | App passes `storage: typeof window !== 'undefined' ? localStorage : undefined`. `GoTrueClient.js:222-233`: `if (settings.storage) { this.storage = settings.storage } else if (supportsLocalStorage()) {…} else { memoryLocalStorageAdapter(…) }`. Passing `storage` short-circuits the fallback. |
| `auth-js` *would* have degraded correctly on its own | **TRUE** | `helpers.js:53-83` — `supportsLocalStorage()` try/catches both the property access and a write-read round trip, memoizing the result. |
| `realtime-js` already handles restricted storage correctly | **TRUE** | `RealtimeClient.js:42-52` `resolveSessionStorage()` try/catches property access → `createMemorySessionStorage()`. A useful contrast/precedent. |
| Supabase Realtime has **no** long-poll fallback | **TRUE** | `lib/websocket-factory.js` resolves a WebSocket constructor or throws. No phoenix LongPoll transport in `realtime-js` v2. Polling is the *only* fallback. |
| Realtime reconnects silently and unboundedly | **TRUE** | `RealtimeClient.js:647-650` — `reconnectAfterMs` walks `RECONNECT_INTERVALS` then `DEFAULT_RECONNECT_FALLBACK` forever. `DEFAULT_TIMEOUT = 10000`. |
| `crypto.randomUUID()` unguarded on money paths | **TRUE** | `src/pages/Upload.tsx:281`, `src/pages/Onboarding.tsx:86`, plus LinkedIn Grader and Recruiting Lens (asserted by their `*.recovery.test.tsx` source guards). |
| **Zero** `online`/`offline`/`visibilitychange` handlers in `src/` | **TRUE** | `rg` for `navigator.onLine`, `addEventListener('online'`, `visibilitychange` → 0 matches. |
| **Zero** global `window.onerror` / `unhandledrejection` handlers | **TRUE** | `rg` → 0 matches. Only React error boundaries exist. |
| pdf.js spawns its worker with `{ type: "module" }` | **TRUE** | `src/lib/pdf-worker.ts:7` and `src/lib/pdfjs.worker.ts:3` comments; `dist/assets/` contains separate worker chunks. **This makes module-worker support a hard requirement.** |
| SSE streaming uses `getReader()` + `TextDecoder` | **TRUE** | `useResumeStream.ts:255-256`. **No** `TextDecoderStream`, **no** `EventSource` — the floor is lower than the UI-SPEC's example probe list suggests. |
| Document MIME differences are already handled server-side | **TRUE** | `supabase/functions/_shared/document-validation.ts` sniffs magic bytes (`SniffedKind = 'pdf' \| 'docx' \| 'zip-not-docx' \| 'unknown'`) — browser `file.type` reporting differences do not reach the decision. Client `isPdf()` at `document-extraction.ts:92` already dual-checks type **or** extension. |
| `checkRateLimitByKey(key, limit, windowSecs)` exists | **TRUE** | `_shared/rate-limiter.ts:122`. Used for "auth-adjacent endpoints where user identity may not be verified yet". **Fails open** on DB error. |
| Every function deploys `--no-verify-jwt` | **TRUE** | `scripts/deploy.ps1:160` — `supabase functions deploy $fn --no-verify-jwt --use-api`. Auth is per-function via `requireAuth`. |
| `ai_call_telemetry` migration is the RLS/rollback template | **TRUE** | `supabase/migrations/20260721000000_ai_call_telemetry.sql` + `rollback/20260721000000_ai_call_telemetry.rollback.sql`. Explicit `REVOKE ALL … FROM anon, authenticated` on table **and** sequence, deny-all policy, verify `DO $$` block, operator-run retention comment. |
| A new function must be registered in 3+ places | **TRUE** | `supabase/config.toml` (`verify_jwt`), `scripts/deploy.ps1` `$Functions` array (currently 40 entries), `supabase/functions/deno.json` `test:ci` allowlist. `validate-document` is the Phase 01.1 precedent for all three. |
| `deno.json` `test:ci` is an **explicit file list** | **TRUE** | Not a directory walk. **An unlisted test runs in no lane at all.** |
| `deploy.ps1 -SkipRemoteDbLane` lane array omits `test:edge:remote` | **TRUE** | `$lanes = @("lint","type-check","test","test:edge","test:e2e","build")` — by design. |

---

## Standard Stack

No new runtime dependency is required or recommended. Every capability this phase needs is already
installed or is a platform API.

### Core (already installed — use as-is)

| Library | Version at HEAD | Purpose in this phase | Why standard |
|---------|-----------------|----------------------|--------------|
| `@playwright/test` | **1.61.0** | 5-project engine + device matrix, network stalling, offline emulation, reduced-motion emulation, real Edge/Chrome channels | Already the E2E layer of `verify:baseline`; 207 device descriptors; the only tool that drives all three engines from one config |
| `vite` | **8.0.16** (rolldown 1.0.3) | Build-ID `define`, `version.json` emit plugin, `vite:preloadError` chunk-failure event | Already the bundler; the preload-error event is a first-party Vite guarantee, not a userland hack |
| `@supabase/supabase-js` | **2.108.2** | Auth session storage (with its **own** correct restricted-storage fallback), realtime channels with `SUBSCRIBED`/`CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` status callback | Already the client; the fix is to *stop overriding* its correct behaviour |
| `vitest` | **4.1.9** (jsdom) | Frozen-table exhaustive tests, static-source guard tests, capability-probe unit tests, PII guard test (XLOG-02) | Already the unit layer; static-source guards are an established repo pattern (`cors-audit.test.ts`, `retired-feature-surface.test.ts`) |
| Deno + `_shared/` | 2+ | Diagnostics-ingest edge function | Mandatory per repo convention — all 21 active user functions use `withCors` + `requireAuth` |

### Supporting — platform APIs, not packages

| API | Purpose | Availability floor | Notes |
|-----|---------|--------------------|-------|
| `navigator.sendBeacon()` | Fire-and-forget diagnostics transport that survives unload | Chrome 39 / FF 31 / Safari 11.1 — universal | With a `text/plain` Blob it is a **simple request**: no CORS preflight, and the send cannot be blocked by a CORS response |
| `fetch(..., { keepalive: true })` | sendBeacon fallback / authenticated variant | Chrome 66 / Safari 13 / **Firefox 133** | Firefox shipped `keepalive` late — keep `sendBeacon` as primary |
| `window.addEventListener('vite:preloadError')` | Engine-independent chunk-load failure detection | Vite ≥ 3.6; **verified present in 8.0.16** | Cancelable — see the reload-race caveat in *Pitfalls* |
| `sessionStorage` | Per-tab reload loop guard | Universal, but **throws** in restricted-storage contexts | Must be try/catch'd; needs a URL-param fallback |
| `document.getAnimations()` | Reduced-motion / animation-budget assertion | Chrome 84 / FF 75 / Safari 13.1 | **Does not see framer-motion's RAF-driven transforms** — needs a static-source companion guard |
| `navigator.connection.effectiveType` | Network-class diagnostics field | **Chromium only** | Record as nullable; never branch behaviour on it |
| `window.matchMedia('(prefers-reduced-motion: reduce)')` | Motion budget | Universal | Already available via framer-motion's `useReducedMotion()` |

### Alternatives Considered

| Instead of | Could use | Tradeoff | Verdict |
|------------|-----------|----------|---------|
| `vite:preloadError` event | Per-engine `error.message` regex matching | Three different strings across engines, and the strings change per browser version | **Use the event**; keep a message classifier only as belt-and-braces |
| Custom `define`d build ID | `import.meta.env.VITE_BUILD_ID` injected by CI | Requires every build surface to set it; the Vercel Git link is disconnected, so a hand-built preview would silently ship an empty ID | **Use `define` with a fallback chain** so a build ID always exists |
| Custom storage adapter for Supabase auth | Delete the `storage` option entirely | auth-js's own `supportsLocalStorage()` probe + `memoryLocalStorageAdapter` is already correct and memoized | **Delete the override.** A hand-rolled adapter is strictly worse |
| Cloud device farm | Playwright `channel: 'msedge'` / `'chrome'` on the operator's Windows host | Channels give *real* Edge and *real* Chrome; they do not give real Safari/iOS | **Use channels** as an opt-in 6th/7th project; keeps D-04 intact while shrinking XTEST-04's manual surface |
| Separate diagnostics table | Reuse `ai_call_telemetry` | Forbidden by D-12 and by the concurrency constraint (Phase 02 owns that migration) | **New table** |
| `zod` in the edge function | Manual field-allowlist validation | Repo edge functions do not use zod (`validate-document`, `analyze-*` all hand-validate) | **Manual allowlist** — matches convention and is easier to assert exhaustively |

**Installation:** none. Zero new npm or Deno dependencies.

---

## Architecture Patterns

### Recommended File Layout

```
index.html                                   # + ES5 pre-bundle guard (Surface A), + viewport-fit=cover
public/supported-browsers.html               # NEW static page (must NOT be an SPA route)
vite.config.ts                               # + build-ID define + version.json emit plugin
vercel.json                                  # + /assets/* rewrite exclusion, + no-store on version.json

src/lib/platform/
├── capabilities.ts                          # NEW — required-API probe set, tier mapping (supported|degraded|unbootable)
├── capabilities.test.ts                     # NEW — per-probe unit tests, exhaustive tier map
├── build-id.ts                              # NEW — __STRIVO_BUILD_ID__ accessor + version.json poller
├── stale-bundle.ts                          # NEW — vite:preloadError handler, loop guard, silent reload
├── stale-bundle.test.ts                      # NEW
└── network-status.ts                         # NEW — online/offline + visibilitychange seam (currently absent)

src/lib/diagnostics/
├── client-diagnostics.ts                    # NEW — the D-10 generalized seam (supersedes analysis-error-log's transport)
├── client-diagnostics.test.ts               # NEW — includes the XLOG-02 PII guard
├── categories.ts                            # NEW — frozen closed set of sanitized error categories
└── install-global-handlers.ts               # NEW — window 'error' + 'unhandledrejection' capture

src/lib/analysis-error-log.ts                # KEEP — refactor to delegate to client-diagnostics; preserve every export
src/lib/client-error-taxonomy.ts             # NEW — the 9 CLIENT_* codes (UI-SPEC Surface C), frozen table + exhaustive test
src/lib/polyfills/
├── map-get-or-insert.ts                     # existing
├── crypto-random-uuid.ts                    # NEW (if audit confirms) — guarded uuid v4 fallback
└── index.ts                                 # NEW — single install site imported by main.tsx AND every worker realm

src/components/platform/
├── CapabilityGate.tsx                       # NEW — B1 banner / B2+B3 blocked CTA / B4 detail dialog
└── StaleBundleFallback.tsx                  # NEW — E2 loop-guard full-page takeover

src/index.css                                # + .min-h-viewport / .h-viewport utilities (vh→dvh with real fallback)

supabase/functions/log-client-diagnostic/
├── index.ts                                 # NEW — withCors + optional auth + rate limit + field allowlist
└── index.test.ts                            # NEW — MUST be added to deno.json test:ci allowlist
supabase/migrations/2026MMDDHHMMSS_client_error_diagnostics.sql
supabase/migrations/rollback/2026MMDDHHMMSS_client_error_diagnostics.rollback.sql
supabase/config.toml                         # + [functions.log-client-diagnostic] verify_jwt = false
scripts/deploy.ps1                           # + "log-client-diagnostic" in $Functions

playwright.config.ts                         # 5 projects + per-project grep
e2e/cross-device/                            # NEW — the @xdev-tagged subset
package.json                                 # + test:e2e:xdev; verify:baseline wiring (XTEST-02)
```

### Pattern 1 — Two-Tier Capability Gate (D-06, D-07, D-08)

**What:** An ES5 inline guard in `index.html` computes a coarse verdict and stashes it on a global;
a post-boot module reads that global, runs the *fine-grained* probes that require modern syntax, and
maps to `supported | degraded | unbootable`.

**Why the split matters:** the ES5 guard cannot use `const`/arrow/optional-chaining, cannot import
anything, and **cannot reliably probe dynamic `import()` without `new Function`** (which a future CSP
`unsafe-eval` restriction would break). So the ES5 guard covers only what it *can* honestly cover; the
A2 boot watchdog (8 000 ms, no `window.__strivoBooted`) is what catches everything else, including
module-parse and dynamic-import failure. Do **not** try to make the ES5 guard omniscient.

**ES5 guard — hard limits (this is the answer to research question 4's "what can and cannot run there"):**

| Can use | Cannot use |
|---------|-----------|
| `var`, `function`, `typeof`, `try/catch` | `const`, `let`, arrow functions, template literals |
| `document.createElement/appendChild/getElementById` | `?.`, `??`, `class`, default/rest params, spread |
| `addEventListener`, `setTimeout`, `JSON`, `String`, `Array` | `for...of`, destructuring, shorthand properties |
| `'noModule' in HTMLScriptElement.prototype` | Any `import` / `import()` (the file is a classic script) |
| `window.Promise`, `window.fetch`, `Object.assign` presence checks | Any Tailwind class, any design token, any icon, any external asset |
| `try { window.localStorage } catch(e) {}` | Any network request, any cookie write (D-08 rule 4) |
| Inline `style.cssText` with the frozen hex mirror | `CSS.supports` with modern syntax strings (safe but low value) |

**Tier mapping (UI-SPEC Surface B keys off this; the probe set is planner-owned, this is the
recommendation):**

| Group | Blocks | Probes (recommended, grounded in HEAD deps) |
|-------|--------|---------------------------------------------|
| Core language + modules | **everything** → Surface A | `'noModule' in HTMLScriptElement.prototype`, `window.Promise`, `window.fetch`, `Object.assign`, `URL`+`URLSearchParams` constructible, `Array.prototype.includes` |
| Document extraction | AI flows | **module-worker support** (see snippet below — this is the binding constraint: FF 114 / Safari 15 / Chrome 80), `typeof Worker === 'function'`, `typeof structuredClone === 'function'`, `Map.prototype.getOrInsertComputed` *after* polyfill install (tripwire, not gate) |
| Streaming | AI flows | `typeof ReadableStream === 'function'`, `typeof TextDecoder === 'function'`. **Not** `TextDecoderStream`, **not** `EventSource` — HEAD uses neither |
| Realtime | informational only | `typeof WebSocket === 'function'` — present in every browser; real failure is network-shaped, so this probe is near-useless as a gate. Record it in diagnostics, do not block on it |
| Idempotency / money path | AI flows + checkout | `typeof crypto?.randomUUID === 'function'` **and** `window.isSecureContext`. **Polyfill this (D-09) rather than block** — see Pitfall 2 |
| Payment embedding | checkout | *Not synchronously probeable.* Use `loadStripe()` resolving non-null as the capability signal (see Pattern 6) |
| Persistent session | auth degraded warning | `localStorage` write-read round trip inside try/catch (do **not** re-implement — call the same probe shape auth-js uses) |

**Published version list (guidance only, per D-06).** Derived as the union of the above, dominated by
module workers and the Safari 15.4 cluster (`structuredClone`, `crypto.randomUUID`, `Array.prototype.at`):

| Browser | Floor | Binding constraint |
|---------|-------|--------------------|
| Chrome / Edge / Chromium | **≥ 100** | comfortably above module workers (80) and `structuredClone` (98) |
| Firefox | **≥ 114** | **module workers** (shipped in 114, June 2023) |
| Safari / iOS Safari | **≥ 15.4** | `structuredClone`, `crypto.randomUUID`, `Array.prototype.at` (module workers landed in 15.0) |
| Opera | ≥ 86 | tracks Chromium 100 |

> Firefox 114 is unusually high for a support floor and is caused **solely** by pdf.js being spawned
> as a module worker. If a plan finds a way to ship the pdf.js worker as a classic worker (or to inline
> the polyfill via `importScripts`), the Firefox floor drops to **94** (`structuredClone`). This is worth
> one investigation task — it is the single largest lever on the published matrix.

### Pattern 2 — Guarded Polyfill, Every Realm (D-09, extends `map-get-or-insert.ts`)

**What:** A pure function + a `define()` installer that no-ops when the native method exists, invoked
on import, exported for tests, and imported at the top of **every** realm entry (`main.tsx`,
`src/lib/pdfjs.worker.ts`, `src/lib/pdf-extractor.worker.ts`).

**When to use:** whenever the missing API has honest semantics that can be emulated without lying
about capability. `crypto.randomUUID`, `ArrayBuffer.prototype.transfer`, `Array.prototype.at`,
`String.prototype.replaceAll` all qualify. `Worker` with `{type:'module'}`, `WebSocket`, and
`ReadableStream` do **not** — those must gate.

**Recommendation:** introduce `src/lib/polyfills/index.ts` as the single install barrel so a new
polyfill lands in all realms by editing one file, and add a static-source guard test asserting that
every realm entry imports the barrel first.

### Pattern 3 — Build-ID Stamp + `version.json` Poll (D-18)

**What:** One value, three consumers — the runtime version check, XLOG-01's `app_version` field, and
E2's cache-busting `/?_v={buildId}` CTA.

**Resolution chain (in `vite.config.ts`, evaluated at config time):**
`process.env.VITE_BUILD_ID` → `process.env.VERCEL_GIT_COMMIT_SHA` → `execSync('git rev-parse --short HEAD')`
in try/catch → `String(Date.now())`. The last fallback exists precisely because the Vercel Git link is
disconnected and a hand-built preview must still get a distinct ID.

Expose via `define: { __STRIVO_BUILD_ID__: JSON.stringify(buildId) }` (declare it in `src/vite-env.d.ts`),
**and** emit `dist/version.json` (`{"buildId": "..."}`) from a ~10-line inline Vite plugin using
`this.emitFile({ type: 'asset', fileName: 'version.json', source })` in `generateBundle`.

**Poll cadence:** on `visibilitychange → visible` and on route change, `fetch('/version.json', { cache: 'no-store' })`
at most once per 60 s. Mismatch → the same silent-reload path as `vite:preloadError`.

> **Vercel nuance:** static files win over rewrites, so `/version.json` resolves correctly despite the
> catch-all. Add an explicit `Cache-Control: no-store` header for it in `vercel.json` so a CDN cannot
> serve a stale ID and defeat the whole mechanism.

### Pattern 4 — Silent Single Reload with No Fallback Frame (D-19, UI-SPEC E1)

```
detect (vite:preloadError | version mismatch)
  → e.preventDefault()                 # stop the re-throw
  → set module-level STALE_RELOADING = true
  → loop guard: sessionStorage['strivio.stale.reload'] = {buildId, ts}
       already reloaded for this buildId within 60s?  → render E2 fallback instead
  → preserve ANALYSIS_RUN_STORAGE_KEY ('strivio.analysis.run_id') — already persisted by useAnalysisRun
  → location.reload()                  # index.html is revalidated on Vercel; route is preserved for free
```

**The one non-obvious requirement:** because `preventDefault()` suppresses the re-throw, Vite's
`__vitePreload` resolves to `undefined`, and `React.lazy` will then throw a *different* error on the
next microtask — potentially painting one frame of an error-boundary fallback before the navigation
commits. UI-SPEC E1 forbids that frame. **Therefore every error boundary must read `STALE_RELOADING`
and render `null` when it is set.** This is the deterministic way to satisfy "no frame of any error
boundary fallback"; relying on the reload winning the race is not.

### Pattern 5 — Fire-and-Forget Diagnostics (D-11, D-13, XLOG-01/02)

```
client                                    edge fn                          postgres
──────                                    ───────                          ────────
buildRecord()  [closed field set]
  ↓ (never awaited, always try/catch)
sendBeacon(url, Blob([json],{type:'text/plain'}))   ← simple request, NO preflight, NO auth header
  ↓                                       withCors(req,'user')
                                          body ≤ 4 KB guard
                                          optional requireAuth → user_id or NULL
                                          checkRateLimitByKey('diag:'+ipHash, 60, 3600)
                                          FIELD ALLOWLIST + length clamp + category coercion
                                          getServiceClient().from('client_error_diagnostics').insert(row)
                                          → 204 No Content ALWAYS
```

**Why the field allowlist lives on the server:** XLOG-02 promises "never logs user documents". A
client-side sanitizer is a promise; a server-side allowlist that **drops every unknown key** is an
enforceable guarantee, and it survives a future client bug. The XLOG-02 guard test must assert both
halves: the client record builder emits only allowlisted keys, and the edge function drops anything else.

**Never-fail guarantees (all four required):**
1. The emit call is never `await`ed in a user code path.
2. The whole emit body is wrapped in `try/catch` that swallows.
3. A per-session emit cap (recommend 20) so a render loop cannot flood.
4. A single in-flight slot — drop rather than queue unboundedly.

### Pattern 6 — Checkout Capability Without a Blocking Probe (UI-SPEC B3/G)

Stripe embedding cannot be feature-detected synchronously, and D-08 rule 4 forbids the ES5 guard from
making network requests. The honest design:

- On mount of any surface with a checkout CTA, call `loadStripe(pk)` (already a dependency) and store
  the resolved value. `@stripe/stripe-js` resolves to `null` on script-load failure rather than throwing.
- `null` (or a rejection) → checkout capability = `degraded` → B3 blocks the CTA.
- The B3 block therefore happens **before** any `create-checkout-session` / `create-payment-intent`
  call, which is what the UI-SPEC's hard rule actually requires. Loading `js.stripe.com` is not a
  Strivo session-creating call.
- Pair with G3's new 15 000 ms pending timeout so the dialog can never spin forever.

### Anti-Patterns to Avoid

- **Re-implementing `supportsLocalStorage`.** auth-js already has a memoized, correct implementation.
  Removing the `storage` override is strictly better than replacing it.
- **UA-string version gating.** Explicitly forbidden by D-06, and the `getOrInsertComputed` incident is
  the proof — that bug shipped in *current* browsers.
- **Per-engine chunk-error string matching as the primary detector.** Use `vite:preloadError`.
- **Adding the 5-project matrix to `playwright.prod.config.ts`.** That config runs real analyses on real
  accounts with `retries: 0, workers: 1` precisely to keep one job / one charge unambiguous. Five
  projects would 5× real Merit spend and destroy the evidence. Any prod cross-device work must go in a
  **separate, Merit-free** project set (checkout dialogs, access control, auth, responsive assertions).
- **A generic retry wrapper anywhere.** Explicitly forbidden by the brief and XDEV-02.
- **`min-h-screen min-h-[100dvh]` as a two-class fallback.** Tailwind orders generated CSS by utility
  group, not by class-attribute order, so which declaration wins is not guaranteed. Use a single custom
  utility that emits both declarations in the correct source order (see Code Examples).
- **Blocking a capability that is safely polyfillable.** D-09 default is polyfill; `crypto.randomUUID`
  and `ArrayBuffer.prototype.transfer` both qualify.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Chunk-load failure detection across 3 engines | Per-browser `error.message` regexes | `window.addEventListener('vite:preloadError')` | Verified emitted by Vite 8.0.16; engine-independent; carries `.payload` |
| Restricted-storage session fallback | A custom `StorageAdapter` with try/catch | Delete the `storage` option; let `@supabase/auth-js` use `supportsLocalStorage()` + `memoryLocalStorageAdapter` | Already memoized, already handles both the property-access throw and the write throw |
| Realtime reconnect / backoff | A custom reconnect loop | `realtime-js` `reconnectAfterMs` + a `.subscribe((status, err) => …)` callback | The loop already exists; the gap is that nobody *observes* it |
| Per-IP abuse control on the diagnostics endpoint | A new counter table | `checkRateLimitByKey()` + the existing `increment_rate_limit` RPC | Already shipped, already tested (`_shared/rate-limiter.test.ts` on the gate), already fails open |
| Diagnostics transport | `XMLHttpRequest` with unload hacks | `navigator.sendBeacon()` with a `text/plain` Blob | Simple request → no preflight; survives unload; cannot be blocked by a CORS *response* |
| Document MIME sniffing in the browser | Client-side magic-byte reading | `supabase/functions/_shared/document-validation.ts` (already sniffs server-side) | XDEV-06's "MIME reporting differences" are already structurally neutralised |
| A new idempotency concept | A second nonce scheme | The existing `attemptNonce` / `deriveIdempotencyKey` / `inputIdentity` pattern (D-16) | `e2e/elite-rerun-merit.spec.ts` already guards the deliberate-re-run boundary |
| CORS on the new function | Hand-written headers | `withCors(req, 'user', …)` + `jsonError` | 21/21 active functions do this; `_shared/cors-audit.test.ts` is a drift guard that **will fail** if you don't |
| Migration RLS/rollback shape | A fresh design | Copy `20260721000000_ai_call_telemetry.sql` structure verbatim | Includes the `REVOKE … FROM anon, authenticated` on table *and* sequence that the operator's memory flags as mandatory |
| Cross-browser test orchestration | Shell scripts per engine | Playwright `projects` + `dependencies` + `testProject.grep` | One `storageState`, one setup run, per-project filtering |

**Key insight:** in this codebase, almost every "cross-device" problem already has a correct primitive
that is either unused, disabled, or actively overridden. The dominant failure mode of this phase would
be building parallel mechanisms next to working ones — exactly what constraint 1 of the brief forbids.

---

## Common Pitfalls

### Pitfall 1 — The Supabase auth storage override (XDEV-04, highest-value single fix)

**What goes wrong:** `src/lib/supabaseClient.ts` passes `storage: localStorage`. Two distinct failures:
1. **Module-eval throw.** `localStorage` is *referenced* at module scope. In Chrome with site data
   blocked, or in some managed/enterprise profiles, reading `window.localStorage` throws
   `SecurityError`. The module throws during evaluation → nothing renders → **white screen, no error UI,
   nothing logged**. This is a textbook match for "works on my machine, blank page on theirs".
2. **No memory fallback.** Because `settings.storage` is truthy, `GoTrueClient` never calls
   `supportsLocalStorage()` and never installs `memoryLocalStorageAdapter`. In Safari private browsing
   (quota ≈ 0) every session write throws instead of degrading to an in-memory session.

**Why it happens:** the override looks defensive (`typeof window !== 'undefined' ? … : undefined`) but
guards the wrong thing — it guards SSR, not restricted storage.

**How to avoid:** delete the `storage` option entirely; wrap `createClient(...)` in try/catch; run an
independent storage probe for the capability tier so the UI can surface `CLIENT_STORAGE_BLOCKED`
(UI-SPEC Surface C) instead of a silent logout loop.

**Warning signs:** users reporting "it just logs me out", "blank page", or "works in normal mode but not
incognito".

### Pitfall 2 — `crypto.randomUUID()` on the money path (XDEV-03 + XRUN-01)

**What goes wrong:** four submit handlers call `crypto.randomUUID()` inline to build the `attemptNonce`
that the server uses for Merit idempotency. `crypto.randomUUID` requires a **secure context** and is
absent before Safari 15.4 / Firefox 95 / Chrome 92. A throw here is not degraded UX — it aborts the
submit before the request is built.

**Why it hides:** `localhost` **is** a secure context, and production is HTTPS — so neither the E2E gate
nor the operator's machine can ever reproduce it. It only fires on an old browser or a non-HTTPS host.

**How to avoid:** add `src/lib/polyfills/crypto-random-uuid.ts` (guarded, defers to native, RFC-4122 v4
from `crypto.getRandomValues`, with a `Math.random` last resort **only** if `getRandomValues` is also
absent). Install it from the polyfill barrel. Add a vitest that deletes `crypto.randomUUID` and asserts
each submit path still produces a v4-shaped nonce.

### Pitfall 3 — The `vercel.json` catch-all turns a 404 into a MIME error (XDEV-07)

**What goes wrong:** `{"source": "/(.*)", "destination": "/index.html"}` means a chunk deleted by a
redeploy returns `200 text/html`. The resulting console text differs by engine:

| Engine | Approximate message |
|--------|--------------------|
| Chromium | `Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html". Strict MIME type checking is enforced for module scripts per HTML spec.` |
| Firefox | `Loading module from "…" was blocked because of a disallowed MIME type ("text/html").` |
| WebKit | `Unexpected token '<'` / a MIME-type variant — **the least stable of the three** |

**How to avoid:** (a) detect via `vite:preloadError`, which fires regardless of the underlying reason;
(b) **also** add a rewrite exclusion so `/assets/*` 404s honestly. That makes the failure identical in
every engine and makes the Playwright simulation faithful. *(The exact `vercel.json` syntax for a
negative-lookahead source or a `"handle": "filesystem"` route must be verified at plan time — flagged
MEDIUM.)*

**Warning signs:** users who "just need to hard-refresh"; sporadic blank pages after a deploy.

### Pitfall 4 — `preventDefault()` on `vite:preloadError` creates a fallback-frame race

Covered in Pattern 4. **Mitigation is mandatory, not optional**, because UI-SPEC E1 is asserted as
"no `[role="alert"]` element is ever attached".

### Pitfall 5 — Realtime failure is invisible because nobody passes a status callback (XRUN-04)

Both `.subscribe()` calls are bare. `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` are never seen, so:
- The UI can never render `CLIENT_REALTIME_DEGRADED` (UI-SPEC D5).
- The poll cadence never adapts — polling runs at a fixed 2 500 ms whether realtime is healthy or dead.
- A blocked-WebSocket environment produces a **silent infinite reconnect loop** (`reconnectAfterMs`
  never gives up), invisible to both the user and the diagnostics.

There is **no** long-poll fallback in `realtime-js` v2 — polling is the only recovery, which makes
observing the failure the whole job.

**Also missing and required for D5/R4:** on iOS Safari a backgrounded tab is frozen and the WebSocket
is severed; Chrome's bfcache does the same. With zero `visibilitychange` handlers in `src/`, a user who
switches apps mid-analysis comes back to a dead socket and a poll timer that may also have been
throttled. **Add: on `visibilitychange → visible`, force one immediate poll.**

### Pitfall 6 — `min-h-screen min-h-[100dvh]` does not guarantee ordering

Tailwind emits utilities grouped by property with its own internal sort; the order of classes in the
`class` attribute does not determine cascade order. Two competing `min-height` declarations may resolve
either way. **Use a custom utility** that emits `min-height: 100vh; min-height: 100dvh;` in one rule, in
that order (see Code Examples). This affects all 29 occurrences.

### Pitfall 7 — `env(safe-area-inset-*)` cannot be asserted from computed style

In Playwright emulation (no notch) `env()` resolves to `0px`, and `getComputedStyle` returns the
resolved value, not the `env()` expression. **Safe-area correctness is therefore not browser-assertable
under emulation** — use a static-source guard on the CSS/className instead, and put real-notch
verification in XTEST-04's manual pass. Same limitation applies to the meta tag's *effect*: assert the
tag's `content` string, not its rendering.

### Pitfall 8 — `document.getAnimations()` does not see framer-motion

framer-motion drives most transforms via RAF, not the Web Animations API. An animation-count assertion
under `reducedMotion: 'reduce'` will pass while a RAF loop is still running. **The XDEV-09 / F6 budget
needs two proofs:** the `getAnimations()` count *and* a static-source guard that every Phase-3 surface
gates its infinite motion behind `useReducedMotion()`.

### Pitfall 9 — Adding a test file without adding it to `deno.json`

`test:ci` is an **explicit file list**, not a directory walk. A new `log-client-diagnostic/index.test.ts`
that is not appended to that list runs in **no lane at all** and reports nothing. TESTING-STRATEGY.md
records this exact rot (five history suites + 32 files went dead). Same class of trap:
`scripts/deploy.ps1 $Functions` — a function absent from that array is never deployed, silently.

### Pitfall 10 — Real network throttling is Chromium-only

`context.setOffline(true)` / `use: { offline: true }` works in all three engines. **Bandwidth/latency
throttling via CDP `Network.emulateNetworkConditions` is Chromium-only.** For firefox/webkit, simulate
slowness with `page.route()` + an artificial delay before `route.continue()`. Plan the "slow network"
assertions to use `page.route()` so they run identically on all five projects.

### Pitfall 11 — Preview cannot prove the Merit contract

Operator memory: `MERIT_SYSTEM_ENABLED=false` on Preview, `true` on Production. So "one click =
exactly one Merit charge" (XRUN-01) is **structurally unprovable on Preview**. Combined with
`AI_TEST_MODE` fixtures and the dormant lifecycle flag, the Preview environment proves *less* than
D-24 assumes. See *Validation Architecture* for what moves to the operator production pass.

---

## Code Examples

All snippets are verified patterns grounded in the installed source; adapt names to plan conventions.

### Module-worker capability probe (the binding constraint for the Firefox floor)

```ts
// src/lib/platform/capabilities.ts
// Detects `new Worker(url, { type: 'module' })` support WITHOUT actually spawning a worker.
// The UA only reads the `type` option if it understands module workers, so the getter firing
// IS the signal. Verified pattern; unit-test it with a stubbed Worker constructor.
export function supportsModuleWorker(): boolean {
  if (typeof Worker !== 'function') return false;
  let read = false;
  try {
    // 'data:,' is an empty, instantly-terminating script.
    const w = new Worker('data:,', {
      get type() {
        read = true;
        return 'module';
      },
    } as WorkerOptions);
    w.terminate();
  } catch {
    /* some engines throw on data: workers — `read` still tells us what we need */
  }
  return read;
}
```

### Guarded `crypto.randomUUID` polyfill (Pattern 2 shape, mirrors `map-get-or-insert.ts`)

```ts
// src/lib/polyfills/crypto-random-uuid.ts
function uuidV4FromRandomValues(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10
  const h: string[] = [];
  for (let i = 0; i < 16; i++) h.push(b[i].toString(16).padStart(2, '0'));
  return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10,16).join('')}`;
}

export function installCryptoRandomUUID(): void {
  const c = globalThis.crypto as Crypto | undefined;
  if (!c || typeof c.getRandomValues !== 'function') return; // cannot honestly emulate — gate instead
  if (typeof c.randomUUID === 'function') return;            // native wins (same guard as map-get-or-insert)
  Object.defineProperty(c, 'randomUUID', {
    value: uuidV4FromRandomValues,
    writable: true, configurable: true, enumerable: false,
  });
}

installCryptoRandomUUID();
```

### Vite build-ID stamp + `version.json` emit

```ts
// vite.config.ts (additions)
import { execSync } from 'node:child_process';

function resolveBuildId(): string {
  if (process.env.VITE_BUILD_ID) return process.env.VITE_BUILD_ID;
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12);
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore','pipe','ignore'] }).toString().trim(); }
  catch { return String(Date.now()); }
}
const BUILD_ID = resolveBuildId();

// inside defineConfig(...)
define: { __STRIVO_BUILD_ID__: JSON.stringify(BUILD_ID) },
plugins: [
  react(),
  {
    name: 'strivo-version-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId: BUILD_ID }),
      });
    },
  },
],
```

### Chunk-load failure → silent single reload (Pattern 4)

```ts
// src/lib/platform/stale-bundle.ts
const GUARD_KEY = 'strivio.stale.reload';
const LOOP_WINDOW_MS = 60_000;

/** Read by every error boundary: when true, render null instead of a fallback (UI-SPEC E1). */
export let STALE_RELOADING = false;

function alreadyReloaded(buildId: string): boolean {
  try {
    const raw = sessionStorage.getItem(GUARD_KEY);
    if (!raw) return false;
    const g = JSON.parse(raw) as { buildId: string; ts: number };
    return g.buildId === buildId && Date.now() - g.ts < LOOP_WINDOW_MS;
  } catch {
    // sessionStorage unavailable (private/blocked) — fall back to a URL marker.
    return new URLSearchParams(location.search).has('_v');
  }
}

function markReloaded(buildId: string): void {
  try { sessionStorage.setItem(GUARD_KEY, JSON.stringify({ buildId, ts: Date.now() })); } catch { /* noop */ }
}

export function installStaleBundleRecovery(buildId: string, onLoopGuardTripped: () => void): void {
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault();                 // suppress the re-throw
    if (alreadyReloaded(buildId)) { onLoopGuardTripped(); return; }  // → Surface E2
    STALE_RELOADING = true;             // boundaries now render null
    markReloaded(buildId);
    // run_id already lives in localStorage under ANALYSIS_RUN_STORAGE_KEY — nothing to do.
    location.reload();                  // pathname + search + hash preserved for free
  });
}
```

### `dvh` with a guaranteed fallback (Pitfall 6)

```css
/* src/index.css */
@layer utilities {
  .min-h-viewport { min-height: 100vh; min-height: 100dvh; }
  .h-viewport     { height: 100vh;     height: 100dvh; }
}
```

### Realtime status observation (the XRUN-04 gap)

```ts
// Replace the bare `.subscribe()` at useAnalysisRun.ts:339 and Results.tsx:478.
const channel = supabase
  .channel(topic)
  .on('postgres_changes', filter, handler)
  .subscribe((status, err) => {
    if (status === 'SUBSCRIBED') { setRealtimeDegraded(false); return; }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      setRealtimeDegraded(true);                    // → CLIENT_REALTIME_DEGRADED (UI-SPEC D5)
      void fetchStatus();                           // immediate catch-up poll
      reportDiagnostic({ category: 'realtime_degraded', detail: status, error: err });
    }
  });

// Currently absent everywhere in src/ — required for D5 and R4:
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void fetchStatus();
});
window.addEventListener('online',  () => { setOffline(false); void fetchStatus(); });
window.addEventListener('offline', () => setOffline(true));
```

### Playwright 5-project matrix with a tagged subset (D-01, D-02)

```ts
// playwright.config.ts (projects section only)
const XDEV = /@xdev/;                      // matched against "<project> <file> <describe> <test> <tags>"

projects: [
  { name: 'setup', testMatch: /auth\.setup\.ts/ },

  // Full functional suite — chromium only (D-02). No grep.
  { name: 'chromium', dependencies: ['setup'],
    use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' } },

  // Cross-device subset — 4 extra projects, tagged tests only.
  { name: 'firefox',          grep: XDEV, dependencies: ['setup'],
    use: { ...devices['Desktop Firefox'], storageState: '.auth/user.json' } },
  { name: 'webkit',           grep: XDEV, dependencies: ['setup'],
    use: { ...devices['Desktop Safari'],  storageState: '.auth/user.json' } },
  { name: 'mobile-webkit',    grep: XDEV, dependencies: ['setup'],
    use: { ...devices['iPhone 14'],       storageState: '.auth/user.json' } },
  { name: 'mobile-chromium',  grep: XDEV, dependencies: ['setup'],
    use: { ...devices['Pixel 7'],         storageState: '.auth/user.json' } },

  // OPT-IN real-browser channels (operator's Windows/macOS host only; absent on CI Linux).
  ...(process.env.STRIVO_REAL_CHANNELS === '1' ? [
    { name: 'edge',       grep: XDEV, dependencies: ['setup'],
      use: { ...devices['Desktop Edge'],   channel: 'msedge', storageState: '.auth/user.json' } },
    { name: 'chrome-real', grep: XDEV, dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], channel: 'chrome', storageState: '.auth/user.json' } },
  ] : []),
],
```

```ts
// e2e/cross-device/overflow.spec.ts — tagging shape
import { test, expect } from '@playwright/test';

test.describe('responsive @xdev', () => {
  for (const width of [320, 375, 414, 640, 767, 768, 1024, 1280]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/dashboard');
      const overflows = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflows).toBe(false);
    });
  }
});
```

> **storageState across engines is safe.** Playwright's storage-state file is engine-agnostic JSON
> (`cookies[]` + `origins[].localStorage[]`). The Supabase session lives in `localStorage` for
> `http://localhost:8080`, so one chromium `setup` run seeds all five projects. No per-engine login needed.

### Diagnostics ingest — edge function skeleton (repo conventions)

```ts
// supabase/functions/log-client-diagnostic/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { withCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { checkRateLimitByKey } from '../_shared/rate-limiter.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';

const MAX_BODY_BYTES = 4096;

// XLOG-02 enforcement point: anything not in this list is DROPPED server-side.
const ALLOWED_FIELDS = [
  'event_id','app_version','surface','lifecycle_stage','error_category','error_name',
  'script_origin','browser','browser_version','os','os_version','device_type','engine',
  'viewport_w','viewport_h','dpr','is_extension','capability_tier','online','connection_type',
  'user_agent','run_id',
] as const;

const CATEGORIES = new Set([
  'boot_failure','capability_blocked','chunk_load_failed','storage_blocked','session_expired',
  'upload_failed','extraction_failed','stream_failed','realtime_degraded','poll_failed',
  'render_failed','checkout_failed','unexpected',
]);

serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') return new Response(null, { status: 204 });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 204 });

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return new Response(null, { status: 204 }); }

  // Optional auth: a pre-auth browser-gate failure MUST still be recordable.
  let userId: string | null = null;
  try { userId = (await requireAuth(req, { type: 'user' })).userId; } catch { /* anonymous */ }

  const ipHash = await sha256Hex(
    (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() + '|' + new Date().toISOString().slice(0, 10),
  );
  const rl = await checkRateLimitByKey(`diag:${ipHash.slice(0, 16)}`, 60, 3600);
  if (!rl.allowed) return new Response(null, { status: 204 });   // silently drop, never 429 a beacon

  const row: Record<string, unknown> = { user_id: userId, ip_hash: ipHash.slice(0, 16) };
  for (const k of ALLOWED_FIELDS) {
    const v = body[k];
    if (v === undefined || v === null) continue;
    row[k] = typeof v === 'string' ? v.slice(0, 512) : v;
  }
  if (!CATEGORIES.has(String(row.error_category))) row.error_category = 'unexpected';

  await getServiceClient().from('client_error_diagnostics').insert(row);
  return new Response(null, { status: 204 });   // ALWAYS 204 — never leak store/drop outcome
}, 'user'));
```

### Diagnostics migration — forward + rollback shape

```sql
-- supabase/migrations/2026MMDDHHMMSS_client_error_diagnostics.sql
-- Phase 03 (XLOG-01/02) CLIENT device diagnostics. DISTINCT from Phase 02's ai_call_telemetry
-- (D-12): different actor (browser, not server), different lifecycle, different retention.
--
-- PRIVACY GUARD: failures only (D-13). Identifiers, enums and counts. NEVER resume/LinkedIn
-- content, never a filename, never a stack, never a raw error message, never a raw IP.
-- The edge function's ALLOWED_FIELDS list is the enforcement point; this schema is the
-- structural backstop (there is simply no column a document could land in).

CREATE TABLE IF NOT EXISTS public.client_error_diagnostics (
  id               bigserial   PRIMARY KEY,
  created_at       timestamptz NOT NULL DEFAULT now(),
  event_id         uuid        NULL,                 -- client-generated; dedup aid

  app_version      text        NOT NULL,             -- __STRIVO_BUILD_ID__ (D-18)
  surface          text        NOT NULL,             -- one of the 11 audit surfaces
  lifecycle_stage  text        NOT NULL,
  error_category   text        NOT NULL,             -- closed set, coerced server-side
  error_name       text        NULL,                 -- constructor name only (e.g. 'TypeError')
  script_origin    text        NULL,                 -- first-party | browser-extension | third-party | unknown
  is_extension     boolean     NULL,
  capability_tier  text        NULL,                 -- supported | degraded

  browser          text        NULL,
  browser_version  text        NULL,
  engine           text        NULL,                 -- blink | gecko | webkit
  os               text        NULL,
  os_version       text        NULL,
  device_type      text        NULL,                 -- desktop | tablet | mobile
  viewport_w       integer     NULL,
  viewport_h       integer     NULL,
  dpr              numeric     NULL,
  user_agent       text        NULL,
  online           boolean     NULL,
  connection_type  text        NULL,                 -- Chromium-only; nullable by design

  user_id          uuid        NULL,                 -- NO FK, mirroring ai_call_telemetry's rationale
  run_id           uuid        NULL,                 -- NO FK
  ip_hash          text        NULL                  -- salted+truncated hash, NEVER a raw IP
);

COMMENT ON TABLE public.client_error_diagnostics IS
  'Phase 03 client device diagnostics: one row per CLIENT-SIDE FAILURE. Enums, counts and identifiers only - never user documents, never PII, never a raw IP or stack.';

CREATE INDEX IF NOT EXISTS ced_created_at_idx  ON public.client_error_diagnostics (created_at DESC);
CREATE INDEX IF NOT EXISTS ced_cell_idx        ON public.client_error_diagnostics (browser, os, device_type, created_at DESC);
CREATE INDEX IF NOT EXISTS ced_category_idx    ON public.client_error_diagnostics (error_category, lifecycle_stage, created_at DESC);
CREATE INDEX IF NOT EXISTS ced_version_idx     ON public.client_error_diagnostics (app_version, created_at DESC);

-- RLS: service role only. Writes arrive ONLY through the edge function's service client.
-- The browser NEVER touches this table via PostgREST, authenticated or not.
ALTER TABLE public.client_error_diagnostics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Service role only - no anon/authenticated access"
    ON public.client_error_diagnostics FOR ALL TO authenticated
    USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Belt and braces. REVOKE FROM public is NOT sufficient (operator memory:
-- supabase-default-execute-grants) - anon and authenticated must be named explicitly.
REVOKE ALL ON public.client_error_diagnostics FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.client_error_diagnostics_id_seq FROM anon, authenticated;

-- Verify (same shape as ai_call_telemetry).
DO $$
DECLARE v_rls boolean; v_policies integer;
BEGIN
  IF to_regclass('public.client_error_diagnostics') IS NULL THEN
    RAISE EXCEPTION 'public.client_error_diagnostics was not created'; END IF;
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.client_error_diagnostics'::regclass;
  IF NOT v_rls THEN RAISE EXCEPTION 'RLS is not enabled on public.client_error_diagnostics'; END IF;
  SELECT count(*) INTO v_policies FROM pg_policies
   WHERE schemaname='public' AND tablename='client_error_diagnostics';
  IF v_policies < 1 THEN RAISE EXCEPTION 'deny-all policy missing'; END IF;
  RAISE NOTICE 'public.client_error_diagnostics active; RLS on, % policy/policies', v_policies;
END $$;

-- RETENTION (OPERATOR-RUN, deliberately NOT automated - mirrors ai_call_telemetry):
--   DELETE FROM public.client_error_diagnostics WHERE created_at < now() - interval '90 days';
```

```sql
-- supabase/migrations/rollback/2026MMDDHHMMSS_client_error_diagnostics.rollback.sql
-- Additive migration: a clean DROP fully reverses it. No other object was modified.
DROP TABLE IF EXISTS public.client_error_diagnostics;   -- drops its indexes, policy and sequence
```

---

## State of the Art

| Old approach | Current approach | When changed | Impact here |
|--------------|------------------|--------------|-------------|
| UA sniffing / `browserslist` version gates | Feature detection against a required-API set | Ongoing; codified here by D-06 | The `getOrInsertComputed` incident is local proof — the bug shipped in *current* browsers |
| `100vh` for full-viewport layouts | `dvh` / `svh` / `lvh` with a `vh` fallback | Baseline since ~Dec 2022 (Safari 15.4 / Chrome 108 / FF 101) | All 29 occurrences at HEAD are pre-`dvh` |
| Bespoke chunk-error string matching | `vite:preloadError` window event | Vite 3.6+ | Verified in the installed 8.0.16 runtime; removes three engine-specific regexes |
| Rollup | **Rolldown** (Vite 8) | Vite 8 | `manualChunks` must be the function form (already done in `vite.config.ts`); a `rolldown-runtime-*.js` chunk is emitted and is a *static* import of the entry — its failure is a boot failure, not a preload error |
| `XMLHttpRequest` unload beacons | `navigator.sendBeacon` / `fetch(keepalive)` | sendBeacon universal since ~2018 | `fetch keepalive` only reached Firefox in 133 — keep sendBeacon primary |
| Cloud device farms as the only real-browser path | Playwright browser **channels** (`msedge`, `chrome`) | Long available; confirmed in PW 1.61 registry | Real Edge becomes automatable on the operator's Windows host without new paid infrastructure |
| Safari private mode = "localStorage throws" | Modern Safari provides a real (small, session-scoped) private-mode quota; ITP's 7-day cap is the bigger long-run risk | Safari 11+ / ITP 2.x, iOS 13.4 | Design for **probe-and-fallback**, not for a specific documented failure mode |

**Deprecated / outdated in this repo's own docs:**
- `.planning/codebase/TESTING.md` (2026-04-11) — claims no frontend test framework. **False.** Superseded by `TESTING-STRATEGY.md`.
- `.planning/codebase/CONCERNS.md` (2026-04-28) — v3.0-era; verify against HEAD.
- `scripts/deploy.ps1`'s pinned-composition comment is currently accurate (seven layers) — but the
  `-SkipRemoteDbLane` array is a *six*-lane list by design. Do not "fix" it.

---

## Sequencing (research question 9 — D-25 wave decomposition)

Six waves, ascending blast radius. Dependencies are strict.

### Wave 1 — Observation apparatus (no user-visible change)

| Deliverable | Requirements | Depends on |
|-------------|--------------|------------|
| `client_error_diagnostics` migration + rollback | XLOG-01 | — |
| `log-client-diagnostic` edge fn + test + `config.toml` + `deploy.ps1` + `deno.json` registration | XLOG-01, XLOG-02 | migration |
| `src/lib/diagnostics/*` seam + global `error`/`unhandledrejection` capture; `analysis-error-log.ts` refactored to delegate (exports preserved) | XLOG-01, XDEV-08 | edge fn |
| XLOG-02 PII guard test (both halves: client builder + server allowlist) | XLOG-02 | seam |
| Build-ID `define` + `version.json` plugin + `vercel.json` `no-store` header | XDEV-07, XLOG-01 | — |
| Playwright 5 projects + `@xdev` tag + opt-in `msedge`/`chrome` channels | XTEST-01 | — |
| `verify:baseline` wiring (`test:e2e` already covers it — confirm the tagged subset runs) | XTEST-02 | matrix |

**Exit criterion:** the matrix runs green on the *existing* specs, and a deliberately-thrown client error
appears as a row in `client_error_diagnostics` on Preview.

### Wave 2 — Discovery & triage (D-22, D-23)

Author the `@xdev` cross-device subset (overflow at 8 widths × surfaces × 2 themes; tap targets;
computed font-size; leak-guard regex; capability-gate; offline; stalled-route). Run all five projects.
Record every failure. Targeted static sweep for what tests cannot reach: device memory, extension
injection, stale bundles, environment/deployment mismatch. **Produce `03-RESIDUAL-REGISTER.md`** with
severity for everything not reproduced.

**Exit criterion:** a closed list of reproduced defects, each with a reproduction, and a residual register.

### Wave 3 — Gates, polyfills, layout (low blast radius)

`index.html` ES5 guard (A1 + A2) + `__strivoBooted` in `main.tsx` + `public/supported-browsers.html`;
`capabilities.ts` + tier map + `CapabilityGate` (B1–B4); `supabaseClient.ts` storage fix (Pitfall 1);
polyfill barrel + `crypto-random-uuid` (Pitfall 2) + any Wave-2 finding; `viewport-fit=cover`;
`.min-h-viewport` utility applied to all 29 sites; `textarea`/`select` → `text-base md:text-sm`;
44×44 tap targets; animation budget + `useReducedMotion()`.

**Requirements:** XDEV-01, XDEV-03, XDEV-04, XDEV-05, XDEV-06 (verify-only), XDEV-09.
**Depends on:** Wave 2's findings for the "which polyfill" decision (D-09 is evidence-driven).

### Wave 4 — Recovery behaviour (no money movement)

`vite:preloadError` handler + loop guard + `STALE_RELOADING` boundary suppression + E2 fallback;
`vercel.json` `/assets/*` rewrite exclusion; `client-error-taxonomy.ts` (9 `CLIENT_*` codes, frozen +
exhaustive test) + leak-guard regex assertion; realtime `.subscribe()` status callbacks at both sites +
`CLIENT_REALTIME_DEGRADED`; `network-status.ts` (`online`/`offline`/`visibilitychange`) + R4.

**Requirements:** XDEV-07, XDEV-08, XRUN-04, XRUN-06.
**Depends on:** Wave 1 (build ID), Wave 3 (capability tier feeds the taxonomy's `CLIENT_BROWSER_UNSUPPORTED`).

### Wave 5 — Money paths (highest blast radius)

`UniversalAnalyzing` rewrite: delete the four D0 fabrications, honest stage→copy map, indeterminate
indicator, 45 s / 120 s thresholds, `Continue in the background`, focus trap, ≤2 infinite animations;
submit-lock audit across the 5 AI features (D-14 — extract a shared primitive **only** if 2+ need the
same fix); extend `e2e/two-tab-concurrency.spec.ts` + `e2e/elite-rerun-merit.spec.ts` with rapid-click
cases and tag them `@xdev` (D-17); checkout G1–G4 including the new 15 000 ms pending timeout.

**Requirements:** XRUN-01, XRUN-02, XRUN-03, XRUN-05, XTEST-03, plus the operator checkout requirement.
**Depends on:** Wave 4 (taxonomy + recovery states), and on **Open Question 1** being resolved.

### Wave 6 — Verification & completion report

Preview deploy (hand-built frontend); full matrix on Preview; the scripted **operator production pass**
(see Validation Architecture); XTEST-04 manual real-device pass + published matrix with
supported / partially-verified / unsupported columns; the 8-item completion report with commit hashes,
deploy + rollback steps, and the READY / READY WITH WARNINGS / NOT READY verdict.

**Requirements:** XTEST-04, XDEV-02 closure, phase completion contract.

---

## Validation Architecture

This section defines the observable truths, their sampling points, and which environment can prove each.
It is the input to VALIDATION.md.

### Observable Truths

| # | Observable truth | Requirement(s) | How it is observed | Provable where |
|---|------------------|----------------|--------------------|----------------|
| OT-1 | A browser missing a required core API sees the ES5 guard, never a white screen | XDEV-01 | Playwright with the probe globals deleted via `addInitScript`; assert `[data-testid=browser-gate-unsupported]` | Local preview (all 5) |
| OT-2 | A bundle that never boots produces the A2 watchdog within 8 s | XDEV-01 | Playwright with `/assets/index-*.js` routed to `route.abort()`; assert `[data-testid=browser-gate-boot-timeout]` | Local preview (all 5) |
| OT-3 | A successful boot leaves no guard element attached for any frame | XDEV-01 | `MutationObserver` installed pre-navigation; assert `#browser-gate` never had a paint | Local preview (all 5) |
| OT-4 | In `degraded` tier, activating an AI or checkout CTA issues **zero** network calls to run/session endpoints | XDEV-01, XRUN-01 | Playwright request interception counting calls to `analyze-*`, `create-checkout-session`, `create-payment-intent` | Local preview (all 5) |
| OT-5 | Every rendered error / blocked / degraded / waiting state fails the leak-guard regex | XRUN-06 | `document.body.innerText` assertion, both themes, all 5 projects | Local preview (all 5) |
| OT-6 | The client error taxonomy is a closed, exhaustive, frozen table | XRUN-06 | vitest exhaustive-table test in the `ANALYSIS_ERROR_CODES` shape | vitest |
| OT-7 | `UniversalAnalyzing` contains no `%` readout, no elapsed-time progress, no ETA string, no timer-derived step | XRUN-05 | Static-source guard test | vitest |
| OT-8 | Stage copy tracks server state and **never advances against a frozen server** | XRUN-05, D-21 | Playwright with a scripted lifecycle fixture route; hold state for 60 s, assert the stage line is unchanged | Local preview |
| OT-9 | Across 150 s of a stalled run, no `[role="alert"]` attaches and nothing renders `destructive` | XRUN-05, XRUN-04, D-20 | Playwright with the status route stalled; MutationObserver + computed-colour assertion | Local preview (all 5) |
| OT-10 | With the realtime socket blocked, the run still resolves via polling and shows only a muted informational line | XRUN-04 | Playwright `route('**/realtime/v1/**', r => r.abort())` | Local preview (all 5) |
| OT-11 | Reload / navigate / offline→online mid-run restores R0→R1/R2/R3 within 2 000 ms and never shows a false failure | XRUN-03 | Playwright reload + `context.setOffline` toggling | Local preview (all 5) |
| OT-12 | A rapid double-click produces no second overlay, no second toast, no second run | XRUN-01, XRUN-02 | Extended `e2e/two-tab-concurrency.spec.ts` @xdev | Local preview (all 5) |
| OT-13 | One click = exactly **one** Merit debit | XRUN-01 | Ledger row-delta assertion on a real account | **PRODUCTION ONLY** (Preview has `MERIT_SYSTEM_ENABLED=false`) |
| OT-14 | A simulated redeploy triggers a silent reload with zero visible error surface | XDEV-07 | Playwright: stall a lazy-route chunk, assert no `[role="alert"]` ever attaches and the route is preserved | Local preview (all 5) |
| OT-15 | With the loop guard pre-set, the E2 fallback renders and focuses its heading | XDEV-07 | Playwright with `sessionStorage` seeded via `addInitScript` | Local preview (all 5) |
| OT-16 | `scrollWidth <= clientWidth + 1` at 8 widths × 11 surfaces × 2 themes | XDEV-05 | Playwright viewport loop | Local preview (all 5) |
| OT-17 | Every interactive element on the audit surfaces has a ≥44×44 box with ≥8 px separation | XDEV-05 | `boundingBox()` assertion on `mobile-webkit` + `mobile-chromium` | Local preview (mobile projects) |
| OT-18 | Every `input`/`textarea`/`select` computes ≥16 px font-size below `md` | XDEV-05 | `getComputedStyle` at 390 px + static-source guard on `@/components/ui` | Local preview + vitest |
| OT-19 | The viewport meta contains `viewport-fit=cover` and no `user-scalable=no` / `maximum-scale` | XDEV-05 | Static-source guard on `index.html` | vitest |
| OT-20 | Under `reducedMotion: 'reduce'`, zero infinite animations; otherwise ≤2 per screen | XDEV-09 | `document.getAnimations()` count **and** a static-source guard on `useReducedMotion()` usage | Local preview + vitest |
| OT-21 | The checkout dialog is visible ≤500 ms after click with the session route stalled indefinitely | operator req. | Playwright with `route(...)` never fulfilling | Local preview (all 5) |
| OT-22 | With no client secret after 15 000 ms the dialog closes with a mapped message — never stuck pending | operator req. | Playwright with a never-resolving session route | Local preview |
| OT-23 | A client failure produces exactly one `client_error_diagnostics` row with the expected browser/os/device/version/stage/category, and `user_id` NULL when unauthenticated | XLOG-01 | Deliberate error + a service-role row read in the spec's Node context | Preview (real DB) |
| OT-24 | No diagnostics row ever contains document text, a filename, a stack, a raw error message, or a raw IP | XLOG-02 | Guard test: submit a record stuffed with forbidden keys/values; assert the stored row has none | vitest + Preview |
| OT-25 | A diagnostics outage (route aborted / 500) never fails or delays the surrounding user flow | XLOG-01, D-11 | Playwright with the ingest route aborted; assert the flow completes with identical timing bounds | Local preview |
| OT-26 | Session survives reload with normal storage; degrades to `CLIENT_STORAGE_BLOCKED` with storage blocked — never a silent logout loop, never a white screen | XDEV-04 | Playwright `addInitScript` overriding `localStorage` to throw on both property access and `setItem` | Local preview (all 5) |
| OT-27 | Every confirmed device-specific defect from Wave 2 has a named regression test | XTEST-03 | Traceability table: defect ID → test file::name | Review artefact |
| OT-28 | The published matrix distinguishes supported / partially verified / unsupported, and names remaining unsupported environments | XTEST-04, D-05 | Document review against the D-05 rule (engine pass **and** real-device spot-check) | Manual |

### Environment Capability Map (research question 10)

| Environment | Can prove | Cannot prove | Why |
|-------------|-----------|--------------|-----|
| **vitest (jsdom)** | OT-6, OT-7, OT-18(static), OT-19, OT-20(static), OT-24(client half) | anything rendered by a real engine | jsdom is not a browser |
| **deno offline lane** | edge-fn field allowlist, category coercion, rate-limit key shape, CORS drift (`cors-audit.test.ts`) | DB persistence | no network |
| **deno remote/DB lane** | that a service-client insert lands with the expected shape | client-side anything | Node-side only |
| **Local `vite preview` + TEST project** (`npm run test:e2e`) — **the primary proving ground** | OT-1..OT-12, OT-14..OT-22, OT-25, OT-26 | OT-13, real AI latency, real redeploy | Playwright can stall routes, abort the realtime socket, force offline, override storage, delete globals, and seed sessionStorage — none of which the deployed Preview can do |
| **Deployed Preview (strivoaipreview)** | OT-23 (real DB round-trip through the deployed function), CORS allowlist behaviour, the deploy path itself | real AI output, the Merit ledger (`MERIT_SYSTEM_ENABLED=false`), real redeploy skew | `AI_TEST_MODE` fixtures; merit dormant; Vercel Git link disconnected so the frontend is hand-built |
| **Production (scripted operator pass)** | OT-13, real Safari/macOS, real iPhone Safari, real Android Chrome, real redeploy chunk skew, real extensions, real cellular checkout latency, ITP behaviour (documented, not tested) | — | the only environment with live AI, a live Merit ledger, and real deploy skew |

> **Key planning consequence.** The *local* Playwright preview proves more of this phase than the
> deployed Preview does, because this phase's contracts are about *failure injection*, and only
> Playwright can inject those failures. Plans should default the `@xdev` subset to the existing
> `playwright.config.ts` (local preview), which also sidesteps both the Vercel-git-disconnect and the
> Preview exact-match-CORS traps entirely.

### The Operator Production Pass — schedule explicitly (D-24, XTEST-04)

Nine items. Each needs an owner, a step list, and a recorded result in the completion report.

| # | Check | Requirement | Why it cannot move earlier |
|---|-------|-------------|---------------------------|
| P-1 | Free + Elite: one click → exactly one job **and** exactly one Merit debit (ledger read) | XRUN-01, XRUN-02 | `MERIT_SYSTEM_ENABLED=false` on Preview |
| P-2 | Real Safari on macOS across all 11 surfaces | XTEST-04, D-05 | Playwright WebKit ≠ Safari |
| P-3 | Real iPhone Safari: viewport, safe-area, input zoom, tap targets, checkout | XDEV-05, XTEST-04 | emulated WebKit is a *desktop* WebKit build |
| P-4 | Real Android Chrome | XTEST-04 | emulation ≠ device |
| P-5 | Real Edge on Windows — **downgrade to automated** via `channel: 'msedge'` if the operator's host has Edge | XTEST-04 | otherwise manual |
| P-6 | Real redeploy skew: open a tab, deploy, navigate to a lazy route, confirm the silent reload | XDEV-07 | only prod/preview has a real redeploy; Preview's frontend is hand-built so this is genuinely prod-only |
| P-7 | Common extensions installed (ad-blocker, password manager, Grammarly-class injector) across the 11 surfaces | XDEV-08 | Playwright contexts ship without extensions |
| P-8 | Checkout open latency on a real device over cellular | operator req. | no synthetic network equals a real radio |
| P-9 | Diagnostics rows arriving from real user agents (24–72 h soak after Wave 1 ships) | XLOG-01 | the whole point of D-25's ordering |

### Validation Checkpoints (Nyquist sampling points)

1. **After Wave 1** — matrix green on existing specs across 5 projects; one synthetic diagnostics row in Preview.
2. **After Wave 2** — reproduced-defect list closed; residual register written; every entry has a severity.
3. **After Wave 3** — OT-1..OT-4, OT-16..OT-20, OT-26 green on all 5 projects; `verify:baseline` still green.
4. **After Wave 4** — OT-5, OT-9, OT-10, OT-14, OT-15 green; leak-guard regex passing on every state.
5. **After Wave 5** — OT-7..OT-12, OT-21, OT-22 green; `e2e/two-tab-concurrency` and `e2e/elite-rerun-merit` extended and green.
6. **After Wave 6** — the 9-item operator production pass recorded; matrix published with the D-05
   supported / partially-verified split; 8-item completion report with a verdict.

**Anti-vacuity rules** (from TESTING-STRATEGY.md's 09-09 lesson — a green lane that proves nothing is
worse than a red one):
- Every new gate lane must be **proven able to fail** by mutation, not by observing green.
- The diagnostics assertion must read a **durable row delta** scoped to this run's `event_id`, never a
  console message.
- The stale-bundle assertion must observe **absence** (`MutationObserver` proving no `[role="alert"]`
  ever attached), not merely a final screenshot.
- Any new `*.test.ts` under `supabase/functions/` **must** be appended to `deno.json` `test:ci` in the
  same commit, or it runs in no lane at all.

---

## Open Questions

### 1. The analysis lifecycle is dormant — what do XRUN-03/04/05 actually target? **(BLOCKING for Wave 5)**

**What we know:** `VITE_FEATURE_ANALYSIS_LIFECYCLE` is not `'true'`, so `useAnalysisRun` early-returns an
inert snapshot in every environment. The live path is `Results.tsx` → `resumes` realtime +
`get-analysis-job-status`. `e2e/two-tab-concurrency.spec.ts` has a quarantined row
(`S-20-LIFECYCLE-DORMANT`, expiry 2026-10-11) recording exactly this. `MERIT_SYSTEM_ENABLED=false` on
Preview means the lifecycle's Merit behaviour cannot be validated pre-production either.

**What's unclear:** UI-SPEC Surface D's stage→copy map (D2), the 2 500 ms poll interval, and the R1/R2
restore contracts are all written against the 11-state ledger. If the flag stays off, **none of those
states ever occur** and Surface D would ship against a code path no user reaches.

**Recommendation:** Do **not** flip the lifecycle flag in this phase. Instead:
(a) deliver XRUN-04's user-visible contract on the live path (`Results.tsx` + `useResumeStream` +
`get-analysis-job-status`) by adding the missing `.subscribe()` status callback and the
online/offline/visibilitychange seam at **both** sites;
(b) implement Surface D's stage mapping so it consumes *either* source, with `useResumeStream`'s
already-honest `STAGE_LABELS` as the live driver and the 11-state map wired but inert;
(c) record the lifecycle flip as an explicit follow-up with its own risk assessment.
**This requires operator confirmation before Wave 5 planning.**

### 2. Can the Firefox support floor be lowered from 114 to 94?

**What we know:** the floor is set entirely by pdf.js being spawned with `{ type: 'module' }`
(`src/lib/pdf-worker.ts`, `src/lib/pdfjs.worker.ts`). Firefox shipped module workers in 114 (June 2023).
**What's unclear:** whether the polyfill wrapper worker can be emitted as a classic worker using
`importScripts`, and whether pdf.js 5.7.284 tolerates a classic `workerSrc`.
**Recommendation:** one timeboxed investigation task in Wave 3. High leverage on the published matrix;
zero risk if it fails (keep 114).

### 3. Exact `vercel.json` syntax for an `/assets/*` rewrite exclusion

**What we know:** the current catch-all converts chunk 404s into `text/html` 200s.
**What's unclear:** whether a negative-lookahead `source`, an ordered `routes` array with
`"handle": "filesystem"`, or a per-path `rewrites` entry is the correct current form.
**Recommendation:** verify against Vercel's current docs during Wave 4 planning; the `vite:preloadError`
detector works either way, so this is an improvement, not a dependency.

### 4. Authenticated diagnostics: preflight vs client-asserted `user_id`

**What we know:** a `text/plain` sendBeacon is a simple request (no preflight) but carries no
`Authorization` header, so the server cannot derive `user_id`. Adding the header forces an OPTIONS
preflight.
**Recommendation:** accept the preflight for the authenticated path (one extra fire-and-forget request)
and keep the header-free simple-request path for pre-auth failures. Do **not** accept a client-asserted
`user_id` — a diagnostics table with a spoofable identity column invites misuse later.

### 5. Is a shared submit-guard primitive warranted? (D-14 defers this to evidence)

**What we know:** `useIdempotencyKey` exists but is imported by no page; four pages instead call
`crypto.randomUUID()` inline. That is *already* duplicated logic across ≥2 features, which by D-14's own
rule argues for extraction.
**What's unclear:** whether the four call sites differ meaningfully in their re-run semantics (Elite
re-run must still create a new attempt).
**Recommendation:** resolve in Wave 5 after the D-14 audit. The `crypto.randomUUID` polyfill (Pitfall 2)
is independent and should land in Wave 3 regardless.

### 6. Wall-clock cost of the matrix on `verify:baseline`

**What we know:** the current gate measures ~6.5–7.5 min with 7 Playwright tests. The `@xdev` subset adds
4 projects but only for tagged tests, and `fullyParallel: true` is already set.
**What's unclear:** the real delta — it depends on how many tests carry `@xdev`.
**Recommendation:** budget ≤ **+3 min** and treat it as a hard planning constraint (D-02's whole rationale
is that a slow gate gets bypassed). Measure with `Measure-Command` and record it in TESTING-STRATEGY.md,
exactly as 09-09 did. If the subset exceeds budget, cut tests from the subset — never drop a project.

---

## Sources

### Primary — HIGH confidence (read from the working tree / installed packages, 2026-07-27)

- `playwright.config.ts`, `playwright.prod.config.ts`, `vite.config.ts`, `vercel.json`, `index.html`, `dist/index.html`, `dist/assets/` (78 chunks)
- `src/lib/supabaseClient.ts`, `src/lib/analysis-error-log.ts`, `src/lib/polyfills/map-get-or-insert.ts`, `src/lib/analysisError.ts`, `src/lib/fetchWithTimeout.ts`, `src/index.css`
- `src/hooks/useAnalysisRun.ts`, `src/hooks/useIdempotencyKey.ts`, `src/hooks/useResumeStream.ts`
- `src/components/UniversalAnalyzing.tsx`, `src/components/AnalysisErrorBoundary.tsx`, `src/contexts/AnalysisLockContext.tsx`, `src/config/feature-flags.ts`, `src/App.tsx`, `src/pages/Results.tsx`, `src/pages/Upload.tsx`, `src/pages/Onboarding.tsx`, `src/pages/Pricing.tsx`, `src/components/topup/TopUpProvider.tsx`
- `supabase/functions/_shared/{cors,auth,rate-limiter,document-validation}.ts`, `supabase/functions/validate-document/index.ts`, `supabase/functions/deno.json`, `supabase/config.toml`
- `supabase/migrations/20260721000000_ai_call_telemetry.sql` + its rollback
- `scripts/deploy.ps1`, `package.json`, `TESTING-STRATEGY.md`
- `node_modules/vite/dist/node/chunks/node.js:28370-28420` — `__vitePreload` / `handlePreloadError` / `vite:preloadError`
- `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:222-245`, `.../lib/helpers.js:44-84`, `.../lib/local-storage.js`
- `node_modules/@supabase/realtime-js/dist/main/{RealtimeClient,RealtimeChannel}.js`, `.../lib/websocket-factory.js`, `.../lib/constants.js`
- `node_modules/@playwright/test` device registry (207 descriptors), `playwright-core/lib/server/registry/index.js` (channels), `playwright/types/test.d.ts` (`testProject.grep`), `playwright-core/types/types.d.ts` (`offline`, `reducedMotion`)
- `.planning/quick/260726-fix-pdfjs-getorinsertcomputed/SUMMARY.md`
- Operator memory: `preview-runs-ai-test-mode-fixtures`, `vercel-git-link-disconnected`, `preview-cors-is-an-exact-match-allowlist`, `preview-merit-system-is-off`, `supabase-default-execute-grants`, `edge-tests-never-parse-the-module`, `active-tiers-are-free-and-elite`

### Secondary — MEDIUM confidence (official docs, single authoritative source)

- Playwright docs — [Test projects](https://playwright.dev/docs/test-projects) (multi-project config, `dependencies`, storageState propagation, `--project`)
- Playwright docs — [Test annotations / tags](https://playwright.dev/docs/test-annotations) (`{ tag: [...] }`, `@`-prefix, `--grep` / `--grep-invert`, `testProject.grep`)
- MDN — [Firefox 114 release notes](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/114) (module workers shipped in 114)
- MDN — [`Worker()` constructor](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker)
- [Module Workers guide](https://esmodules.com/workers/) (Chrome 80 / Safari 15 / Edge 80 support map)

### Tertiary — LOW confidence (community sources; flagged for validation)

- [Apple's 7-day cap on script-writable storage](https://searchengineland.com/what-safaris-7-day-cap-on-script-writeable-storage-means-for-pwa-developers-332519) and [Didomi's summary](https://support.didomi.io/apple-adds-a-7-day-cap-on-all-script-writable-storage) — the ITP 7-day deletion of LocalStorage/IndexedDB/SessionStorage after no user interaction (iOS 13.4 / Safari 13.1+). Sources are 2019-2023; **current-behaviour re-verification is a Wave 3 task.** Treated here as a *documented matrix limitation*, not something the phase fixes.
- Safari private-browsing localStorage behaviour ([TrackJS](https://trackjs.com/javascript-errors/failed-to-execute-setitem-on-storage/), [Matt Burke](https://mattburke.dev/dom-exception-22-quota-exceeded-on-safari-private-browsing-with-localstorage/)) — **sources disagree** on whether modern Safari throws `QuotaExceededError` or silently no-ops. This ambiguity is precisely why the recommendation is probe-and-fallback rather than a behaviour-specific workaround. **LOW.**
- Playwright emulation limits ([TestDino](https://testdino.com/blog/playwright-mobile-testing), [QASkills](https://qaskills.sh/blog/playwright-mobile-emulation)) — "emulated WebKit is a desktop WebKit build constrained to mobile dimensions, not iOS Safari"; documented mobile-Safari-only differences in flex/gap, scrolling, fixed positioning, memory pressure and backgrounding. Consistent across sources and consistent with D-05's own framing; used only to *justify* the manual pass, never to claim a specific defect. **MEDIUM.**
- Chromium engineering guidance on `SecurityError` when reading `window.localStorage` (linked from `auth-js/lib/helpers.js:78`) — corroborates Pitfall 1's module-eval throw. **MEDIUM** (referenced by the library's own source comment).

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| HEAD grounding (the 40-row verification table) | **HIGH** | Every row read directly from the working tree or installed package source on 2026-07-27 |
| Standard stack (zero new dependencies) | **HIGH** | Everything already installed; versions read from `package.json` + `node_modules` |
| `vite:preloadError` as the chunk detector | **HIGH** | Read from the installed Vite 8.0.16 build runtime, including the `preventDefault` re-throw semantics |
| Supabase auth storage root cause (XDEV-04) | **HIGH** | Read from `GoTrueClient.js` + `helpers.js` alongside the app's own override |
| Realtime gap (XRUN-04) | **HIGH** | Both `.subscribe()` call sites verified bare; no long-poll transport in `realtime-js` v2 |
| Playwright matrix mechanics (projects, grep, storageState, channels, offline, reducedMotion) | **HIGH** | Types + registry read from the installed 1.61.0; docs cross-checked |
| Required-API set and tier mapping | **MEDIUM-HIGH** | Derived from HEAD's actual dependencies; the module-worker probe pattern needs a unit test to confirm behaviour per engine |
| Published version floor (Chrome 100 / FF 114 / Safari 15.4) | **MEDIUM** | Module-worker support verified against MDN + one guide; the other floors rest on well-established support data, not re-verified individually |
| Diagnostics schema, RLS and auth posture | **MEDIUM-HIGH** | Structure copied from the verified `ai_call_telemetry` precedent; the anonymous-write posture is a reasoned design, not a cited pattern |
| Safari private-mode / ITP specifics | **LOW** | Sources conflict and are 2019-2023; the recommendation deliberately does not depend on which is right |
| `vercel.json` rewrite-exclusion syntax | **LOW** | Not verified against current Vercel docs — Open Question 3 |
| Wall-clock impact of the matrix on `verify:baseline` | **LOW** | Must be measured, not estimated — Open Question 6 |

**Research date:** 2026-07-27
**Valid until:** 2026-08-26 (30 days) for HEAD-grounded findings; **2026-08-03 (7 days)** for the
Playwright/Vite/Supabase version-specific claims, since any dependency bump can invalidate the
`vite:preloadError`, device-descriptor and auth-storage findings simultaneously. Re-verify those three
against `node_modules` if `package.json` changes before planning.

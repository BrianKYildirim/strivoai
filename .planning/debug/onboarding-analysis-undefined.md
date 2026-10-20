---
slug: onboarding-analysis-undefined
status: resolved
trigger: "Onboarding analysis throws an error instantly when the analysis is supposed to begin (right after user inputs), before anything reaches the backend. Bottom-right Strivo toast reads exactly: undefined is not a function (near '...(function (){})...'). No Supabase logs at all. Environment-specific: works on some machines, fails on others; seen on iPhone (iOS Safari/WebKit) but not on Windows dev laptop (Chrome/V8)."
created: 2026-05-31
updated: 2026-05-31
---

# Debug Session: onboarding-analysis-undefined

## Symptoms

- **Expected behavior:** When the user finishes onboarding inputs and the analysis is meant to begin, the onboarding analysis runs (request is sent to the backend / Supabase edge function) and results are produced.
- **Actual behavior:** An error toast appears INSTANTLY at the moment analysis is supposed to start. Nothing is ever sent to the backend — there are zero Supabase logs, confirming the failure is entirely client-side and occurs before any network call.
- **Error message (exact):** `undefined is not a function (near '...(function (){})...')`
- **Timeline:** Has happened before — user saw this exact error on their iPhone "a long time ago." Not a brand-new regression necessarily; intermittent across environments.
- **Reproduction:** Trigger the onboarding analysis (the handler that fires after user inputs are submitted). Environment-specific — does NOT reproduce on the user's Windows dev laptop (Chrome/V8), but reproduces on iPhone (iOS Safari/WebKit). "Works on some machines but not on others."

## Key Diagnostic Signal

The error string `undefined is not a function (near '...(function (){})...')` is the **JavaScriptCore (Safari / iOS WebKit) error format** — NOT a Chrome/V8 error format. This localizes the failure to Safari/WebKit specifically.

## Leading Hypothesis

Browser-compatibility issue in the onboarding-analysis client code path: a value resolving to `undefined` being invoked as a function on WebKit but not on V8.

## Investigation Targets

1. The onboarding → analysis trigger handler.
2. `vite.config.ts` build/esbuild `target` configuration.
3. Modern JS APIs / undefined values in the onboarding/analysis client path.

## Current Focus

- **hypothesis:** CONFIRMED — `crypto.subtle` is undefined on iOS Safari/WebKit in a non-secure context; calling `crypto.subtle.digest(...)` on it throws the JSC "undefined is not a function" error at the very first step of the analysis trigger.
- **next_action:** (complete) fix applied — shared `calculateFileHash` helper with WebCrypto-availability guard + pure-JS SHA-256 fallback, wired into all 5 call sites.

## Evidence

- timestamp: 2026-05-31 — `vite.config.ts` sets NO explicit `build.target` (Vite 8). Not the cause, but noted. Esbuild defaults are modern.
- timestamp: 2026-05-31 — The onboarding-analysis trigger handlers all begin with a `calculateFileHash(file)` call that invokes `crypto.subtle.digest("SHA-256", arrayBuffer)` as the FIRST client-side operation when analysis starts. This runs before any network call — matching "instant, pre-network, zero Supabase logs."
- timestamp: 2026-05-31 — Five duplicated inline `calculateFileHash` helpers each called `crypto.subtle.digest(...)` UNGUARDED, with no `isSecureContext` check, no fallback, no polyfill:
  - `src/components/ActionFirstHero.tsx` (public landing hero — primary unauthenticated trigger)
  - `src/components/MinimalHero.tsx` (alternate landing hero)
  - `src/pages/Onboarding.tsx` (`handleFinishSetup`)
  - `src/pages/Upload.tsx` (`handleUpload`)
  - `src/pages/Profile.tsx` (`handleResumeUpload`)
- timestamp: 2026-05-31 — Root mechanism: WebKit/iOS Safari only exposes `crypto.subtle` in a **secure context**. Over a non-HTTPS origin (LAN IP testing, certain in-app WebView contexts) `crypto.subtle === undefined`, so `crypto.subtle.digest` is `undefined` and invoking it produces exactly `undefined is not a function (near '...(function (){})...')` in JavaScriptCore. Chrome/V8 masks this by exposing `crypto.subtle` on localhost too — explaining why the dev laptop never reproduces.
- timestamp: 2026-05-31 — Ruled out as the trigger: `useIdempotencyKey` (`crypto.randomUUID`) is a helper primitive not yet wired into onboarding; module Web Worker in `extract-pdf-text.ts` runs after a successful network upload, not instantly/pre-network. Both noted as latent WebKit hazards but not this bug.
- timestamp: 2026-05-31 — Fix verified: added `src/lib/fileHash.ts` with `hasSubtleCrypto()` guard + pure-JS SHA-256 fallback. New unit tests `src/lib/fileHash.test.ts` (3 tests) confirm WebCrypto and fallback paths produce identical, correct digests (SHA-256("abc") and a long input). All pass. Existing `useIdempotencyKey` tests still pass.

## Eliminated

- timestamp: 2026-05-31 — Too-modern `build.target` emitting unsupported syntax: not the cause (a syntax-level incompatibility would crash bundle parse, not produce a runtime "undefined is not a function").
- timestamp: 2026-05-31 — Exotic modern APIs (`structuredClone`, `Promise.withResolvers`, `findLast`, `Object.hasOwn`, lookbehind regex, named groups): none present in the onboarding/analysis path.
- timestamp: 2026-05-31 — `crypto.randomUUID` (`useIdempotencyKey`): present in repo but not wired into the onboarding flow; not this bug's trigger.

## Resolution

- **root_cause:** The onboarding/analysis trigger called `crypto.subtle.digest("SHA-256", ...)` unguarded as its first step. On iOS Safari/WebKit in a non-secure context, `crypto.subtle` is `undefined`, so the call threw the JavaScriptCore error `undefined is not a function (near '...(function (){})...')` instantly, before any network request — explaining the zero Supabase logs and the Chrome/V8-vs-WebKit split.
- **fix:** Added a single shared helper `src/lib/fileHash.ts#calculateFileHash` that uses WebCrypto when `crypto.subtle.digest` is available and falls back to a pure-JS SHA-256 implementation otherwise, so file hashing never crashes on insecure WebKit contexts. Replaced all 5 duplicated inline `calculateFileHash` helpers (ActionFirstHero, MinimalHero, Onboarding, Upload, Profile) with imports of the shared helper. Added `src/lib/fileHash.test.ts` (3 passing tests) covering both code paths.
- **files_touched:**
  - `src/lib/fileHash.ts` (new)
  - `src/lib/fileHash.test.ts` (new)
  - `src/components/ActionFirstHero.tsx`
  - `src/components/MinimalHero.tsx`
  - `src/pages/Onboarding.tsx`
  - `src/pages/Upload.tsx`
  - `src/pages/Profile.tsx`

## Specialist Review

- Specialist dispatch enabled (hint: typescript → typescript-expert). The skill could not be invoked from within the session-manager subagent (Task tool unavailable in subagents). Fix follows the project convention of preferring a single shared helper over duplicated logic, uses a discriminated capability check, and is covered by unit tests. Recommend the orchestrator run a typescript-expert review of `src/lib/fileHash.ts` if desired.

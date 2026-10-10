---
phase: 03-cross-device-reliability-and-compatibility
plan: 09
subsystem: platform-compatibility
tags: [polyfill, crypto, pdf-worker, realms, static-guard, support-matrix]
requirements: [XDEV-03, XDEV-06, XTEST-03]
requires:
  - "03-05 (defect register XD-16: the six call sites)"
  - "03-06 (global diagnostics handlers in main.tsx — ordering preserved)"
provides:
  - "crypto.randomUUID available in every realm, or honestly absent for the capability tier"
  - "src/lib/polyfills/index.ts — the single install site for all realms"
  - "polyfill-realm-source-guard — a polyfill cannot be added to only some realms"
  - "03-WORKER-FLOOR-FINDING.md — the settled Firefox floor (114) for 03-11 and 03-20"
affects:
  - "03-07 (also edits src/main.tsx — disjoint region, top-of-file import block)"
  - "03-11 (capability probe set — do NOT probe structuredClone)"
  - "03-16 (D-29 submit guard — routes the six sites through one primitive)"
  - "03-20 (published support matrix — Firefox 114+)"
tech-stack:
  added: []
  patterns:
    - "guarded polyfill (defers to native, installs on import) — extends map-get-or-insert.ts"
    - "side-effect barrel as the single realm install site"
    - "static-source guard modelled on xss-sink-guard.test.ts"
key-files:
  created:
    - src/lib/polyfills/crypto-random-uuid.ts
    - src/lib/polyfills/crypto-random-uuid.test.ts
    - src/lib/polyfills/index.ts
    - src/test/platform/polyfill-realm-source-guard.test.ts
    - .planning/phases/03-cross-device-reliability-and-compatibility/03-WORKER-FLOOR-FINDING.md
  modified:
    - src/main.tsx
    - src/lib/pdfjs.worker.ts
    - src/lib/pdf-extractor.worker.ts
    - .planning/phases/03-cross-device-reliability-and-compatibility/03-RESIDUAL-REGISTER.md
decisions:
  - "Install NOTHING when crypto.getRandomValues is absent rather than substituting a non-CSPRNG — D-09's block-don't-fake rule, on a money path"
  - "Firefox floor stays 114: pdf.js hardcodes { type: 'module' }; worker bundles were ALREADY classic so the research premise was false"
  - "Do not adopt the GlobalWorkerOptions.workerPort route — the payoff is unproven because structuredClone (the assumed '94' constraint) is never used"
metrics:
  duration: ~45 min
  tasks: 3
  commits: 4
  files-created: 5
  files-modified: 4
  tests-added: 19
  completed: 2026-07-28
---

# Phase 03 Plan 09: Platform-API Gaps at Source Summary

Closed the unguarded `crypto.randomUUID()` dependency on six money-path submit handlers with a
guarded RFC-4122 v4 polyfill installed through a new realm barrel, added a static guard making a
partial-realm install impossible, and settled the Firefox support-floor question with evidence that
overturned the research premise.

## What shipped

**1. `crypto.randomUUID` polyfill (XDEV-03 / D-09 / defect XD-16).** Six submit handlers call
`crypto.randomUUID()` unguarded to mint the `attemptNonce` protecting Merit idempotency. The method
requires a secure context and is absent before Safari 15.4 / Firefox 95 / Chrome 92, so on those
browsers the throw happens *before the request is built* — the user taps Analyze and nothing
happens, with no error surface. It hides because `localhost` **is** a secure context and production
is HTTPS, so neither the E2E lane nor the operator's machine can reproduce it.

The fallback draws 16 bytes from `crypto.getRandomValues`, sets the version nibble to 4 and the
variant bits to `10`, and formats canonical lowercase 8-4-4-4-12. It defers to native via the same
`define()` guard as `map-get-or-insert.ts` and installs non-enumerable / writable / configurable.

**2. Realm barrel + static guard.** `src/lib/polyfills/index.ts` is now the single install site;
`main.tsx`, `pdfjs.worker.ts` and `pdf-extractor.worker.ts` import it as their first value import.
`polyfill-realm-source-guard.test.ts` asserts the barrel exists and installs both modules, that every
realm entry imports it FIRST, and that no realm reaches past it into an individual module.

**3. Worker-floor finding.** Recorded in `03-WORKER-FLOOR-FINDING.md`, with residual row **R-23**.

## Verification

| Gate | Result |
| ---- | ------ |
| `npm run test` | 962 passed / 128 files |
| `npm run type-check` | exit 0 |
| `npm run lint` | exit 0 (151 pre-existing warnings, 0 errors) |
| `npm run build` | exit 0, both worker chunks emitted |
| `npx playwright test e2e/cross-device/upload-parity.spec.ts` | 6 passed — chromium, firefox, webkit, mobile-webkit, mobile-chromium (XDEV-06 undisturbed) |

**Realm coverage proven from build output, not asserted.** The v4 masking (`e[6]=e[6]&15|64,
e[8]=e[8]&63|128`) is present in `pdfjs.worker-*.js`, `pdf-extractor.worker-*.js` **and**
`index-*.js` — all three realms genuinely carry the polyfill. All six money-path page chunks
reference `randomUUID`.

**Mutation proofs (both suites shown able to fail).**

| Mutation | Result |
| -------- | ------ |
| Drop the v4 version-nibble mask | 5 failed |
| Install a non-CSPRNG fallback when `getRandomValues` is absent | 1 failed (the D-09 guard) |
| Remove the barrel import from a worker entry | 2 failed |
| Move the barrel import below another import | 1 failed |
| Add a direct polyfill import bypassing the barrel | 1 failed |
| Revert all | 12/12 and 7/7 green |

## The six call sites (RESEARCH count was stale — verified with ripgrep)

`03-RESEARCH.md` records four; HEAD has **six**, matching `03-DEFECT-REGISTER.md` XD-16:

| Site | Line |
| ---- | ---- |
| `src/pages/Upload.tsx` | 281 |
| `src/pages/Onboarding.tsx` | 86 |
| `src/pages/LinkedInGrader.tsx` | 522 |
| `src/pages/RecruitingLens.tsx` | 579 |
| `src/pages/CareerCompass.tsx` | 254 |
| `src/hooks/useEliteRerun.ts` | 189 |

Two **additional** executable call sites exist at `src/hooks/useIdempotencyKey.ts:25,28` — the
primitive no page imports. They are covered too, since the fix is global rather than per-site. That
is the point of fixing at source: 03-16 can converge the call sites later without the polyfill
needing to know about them.

## Worker floor: verdict and why it matters

**Firefox floor stays 114. Not viable as a configuration change.**

The investigation did not fail the way it was expected to — **the research premise is false**. The
worker bundles are *already* classic IIFE scripts: adding `worker: { format: 'iife' }` produced a
**byte-identical** build (identical md5 *and* content hash) because `iife` is Vite's default. No
`importScripts` prelude is needed, and the polyfill barrel already works in a classic realm because
Vite inlines it.

The floor comes from a **spawn option**, not the bundle format. `pdf.mjs:15641` — the library's only
`new Worker(` site — passes a literal `{ type: "module" }` that no configuration reaches.

`GlobalWorkerOptions.workerPort` is a supported way out, so the floor is not permanent. It was **not
taken**, for two reasons worth carrying forward:

- **The payoff is unproven.** The "94" figure assumed `structuredClone` was the next binding
  constraint. `rg` shows it is **never used** in `src/` — so removing module workers lands the floor
  at an unknown version, possibly 113. 03-11 must enumerate constraints first.
- **The 114 floor may be conservative.** Both layers already fall back to the main thread — pdf.js
  via `#setupFakeWorker()` and ours via `extractPdfTextOnMainThread()` — so 94-113 may *degrade*
  rather than break. **This is read from source, not executed**, and is explicitly flagged as
  unpublishable-as-fact. Playwright ships only Firefox 151, so this matrix structurally cannot see
  that range.

## Deviations from Plan

**None affecting scope.** Three notes where reality differed from the plan text:

1. **`delete crypto.randomUUID` would have been a silent no-op.** Native `randomUUID` lives on
   `Crypto.prototype`, not as an own property, so the plan's prescribed "delete the native method"
   test shape would have left it in place and produced a **vacuous** suite. Every case instead
   *shadows* the property with an own `undefined` and asserts the shadow took effect first.
2. **The plan's own acceptance criterion caught a comment.** `rg "Math\.random"` must return no
   matches, and my security-rationale header mentioned it by name. Reworded; the test now enforces
   this statically against the source file.
3. **`src/lib/pdf-worker.ts` deliberately left alone.** It also imports `polyfills/map-get-or-insert`
   directly, but it is a window-realm module imported *by* `main.tsx` (which installs the barrel
   first), so it is already covered — its import is redundant belt-and-braces, not a realm install
   site. It is outside this plan's `files_modified`, and touching the PDF pipeline without need is
   not warranted. Documented as an explicit exclusion in the guard rather than left to look like an
   oversight.

**Auto-fixed issues:** none — no bugs, missing functionality, or blockers were encountered outside
the planned work.

## Constraint compliance

- Stayed on `staging`; 3 task commits + this docs commit, **not pushed**.
- **Nothing under `supabase/` touched** — no migration, no DB write, no deploy.
- `STATE.md` and `ROADMAP.md` byte-identical; zero writes under `phases/02-*`.
- `AI_TEST_MODE` not set, `.env*` untouched, no assertions weakened. Verification was targeted
  (`upload-parity.spec.ts` starts no run, so it needs no AI stub).
- `src/main.tsx` change confined to the top import block; 03-06's handler ordering (after polyfill
  imports, before `createRoot`) preserved for 03-07.
- The `vite.config.ts` experiment was fully reverted — `git status --porcelain src supabase
  vite.config.ts` empty, config byte-identical to HEAD.

## Follow-ups

| For | Item |
| --- | ---- |
| **03-11** | Do **not** probe `structuredClone` — unused, so it would report a capability the app does not need. Module-worker support is what binds. Note both layers degrade to the main thread, so a naive "unsupported → blocked" probe would be wrong. |
| **03-20** | Publish **Firefox 114+**. If disclosing 94-113, mark it **untested**. |
| **XTEST-04** | Real-device check on a genuine Firefox 94-113 to test the graceful-degradation hypothesis. |
| **Deferred (HIGH risk)** | The `workerPort` route to lower the floor — full change sketch and risk assessment in `03-WORKER-FLOOR-FINDING.md`. Gated on 03-11's probe set; close it if the next constraint is above 114. |

## Commits

| Hash | Message |
| ---- | ------- |
| `9e449070` | feat(03-09): guarded crypto.randomUUID polyfill for the money-path nonce |
| `cb44a2a6` | feat(03-09): install polyfills via a barrel in all three realms, guarded statically |
| `bc693ee9` | docs(03-09): settle the Firefox worker-floor question — keep 114, record R-23 |

## Self-Check: PASSED

All five created files exist on disk; all three task commits verified present in `git log`.

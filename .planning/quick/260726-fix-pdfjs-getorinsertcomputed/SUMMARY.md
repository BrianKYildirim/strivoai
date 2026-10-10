---
task: Fix production "getOrInsertComputed is not a function" in Resume Analysis
status: complete
date: 2026-07-26
branch: staging
commits:
  - a8a2f88d fix(pdf): polyfill Map.getOrInsertComputed across all pdf.js realms
  - 5ed674a3 fix(analysis): isolate errors, leak-free failure UI, structured logging
---

# Root cause (proven, not assumed)

`pdfjs-dist@5.7.284` (via `react-pdf@10.4.1`) calls `Map.prototype.getOrInsertComputed`
— a very recent TC39 proposal method absent from the stable browsers users run —
in every realm that runs pdf.js:

- Main thread `pdf.mjs:15801/16276`:
  `this.#methodPromises.getOrInsertComputed(name, () => this.messageHandler.sendWithPromise(name, data))`.
  `#methodPromises` minifies to `#t`; the `() => …sendWithPromise` factory is the compute
  callback → EXACTLY the production trace `this.#t.getOrInsertComputed is not a function`
  at `messageHandler.sendWithPromise`.
- Worker `pdf.worker.mjs`: `this.fonts.getOrInsertComputed(...)` during text extraction.

Category 3 (dependency using an unsupported JS runtime API with no fallback). It is a
runtime prototype method → transpilation / `build.target` / browserslist cannot restore
it. The legacy pdf.js build ALSO uses it, so switching builds does not help. A polyfill
in every pdf.js realm is the only correct fix.

# Fix

1. `src/lib/polyfills/map-get-or-insert.ts` — guarded getOrInsert/getOrInsertComputed
   polyfill for Map + WeakMap (defers to native when present).
2. Installed on the main thread (`main.tsx`, before any pdf.js) and in both worker
   realms via a polyfilled wrapper worker (`src/lib/pdfjs.worker.ts`) that `pdf-worker.ts`
   and `pdf-extractor.worker.ts` point pdf.js's `workerSrc` at. pdf.js spawns it with
   `{ type: "module" }` so the wrapper's `import` runs before pdf.js worker code.
3. `AnalysisErrorBoundary` around Upload + Results — controlled message, never raw stack,
   auto-recovers once on extension-origin errors (isolation).
4. `getSafeStreamErrorMessage()` — leak-free chokepoint for the "Analysis Interrupted"
   screen (was rendering raw server/SSE text).
5. `analysis-error-log.ts` — structured, leak-free logging (run/resume id, browser +
   version, script origin, stack, lifecycle stage; NO resume content).

# Evidence

- Build-verified: polyfill install bundled into `index`, `pdfjs.worker`, and
  `pdf-extractor.worker` chunks (`m(Map.prototype,\`getOrInsert\`,f),m(Map.prototype,\`getOrInsertComputed\`,…)`).
- 32 new tests (polyfill root-cause reproduction + fix, error-log, sanitizer, boundary,
  recovery contract). Full suite: 122 files / 861 tests green. type-check + build clean.

# Not changed (deliberate)

- Merit single-charge (server-side `attemptNonce` idempotency) and recovery-by-resume-id
  (realtime + DB re-read) already satisfied criteria #3/#4; locked with a contract test
  rather than rebuilt.
- `VITE_FEATURE_ANALYSIS_LIFECYCLE` left OFF (run-id recovery surface remains dormant) —
  flipping it is a separate, higher-risk change and the merit lifecycle is not exercised
  on Preview.
- Cross-browser regression matrix (Chrome curr/prev, Safari, Firefox, Edge, incognito,
  with-extensions, slow network, refresh-after-submit) must be run on a
  production-equivalent build — automated unit coverage proves the code path; the browser
  matrix is a manual/CI verification step, not yet executed here.

# Phase 03 — Worker Floor Finding (the Firefox 114 vs 94 question)

**Investigated:** 2026-07-28 · plan **03-09**, Task 3 (timeboxed)
**Question owner:** `03-RESEARCH.md` § *Open Questions* item 2
**Consumers of this verdict:** **03-11** (capability probe set) and **03-20** (published support matrix)

---

## Verdict

> **The classic-worker route is NOT VIABLE as a configuration change, and is NOT ADOPTED in this
> phase. The published Firefox floor STAYS AT 114.**

The investigation did not fail for the reason it was expected to. It found that **the research
question's central premise is false**: the pdf.js worker bundles are *already* emitted as classic
IIFE scripts. Nothing needs to be "converted". The module-worker requirement does not come from the
bundle format at all — it comes from **two hardcoded `new Worker(..., { type: "module" })` spawn
options**, one of which lives inside `pdfjs-dist` and is reachable by no configuration.

A genuine escape hatch does exist (`GlobalWorkerOptions.workerPort`), so the floor is *not*
permanently pinned at 114. But it is a restructuring of a business-critical pipeline's worker
lifecycle rather than a config flag, and it buys a floor drop that **nothing currently proves would
land at 94**. It is recorded below as a follow-up with a risk assessment, not merged.

---

## What was attempted

### Experiment 1 — force a classic worker bundle via Vite

`vite.config.ts` has no `worker` block at HEAD. The experiment added one:

```ts
worker: {
  format: 'iife',
},
```

then ran `npm run build` and compared the emitted worker chunks against the baseline build
byte-for-byte.

**Result: the change is a NO-OP. The two builds are byte-identical.**

| Emitted chunk | md5 (baseline, no `worker` block) | md5 (`worker.format: 'iife'`) |
| ------------- | --------------------------------- | ----------------------------- |
| `dist/assets/pdfjs.worker-DeMsRMaW.js` | `e0b5cabf874a6410af4e705efa79c274` | `e0b5cabf874a6410af4e705efa79c274` |
| `dist/assets/pdf-extractor.worker-C8KgLX9K.js` | `c56a9d89a458944a11750371f72c96ad` | `c56a9d89a458944a11750371f72c96ad` |

Even the content-hash filenames are unchanged. The reason is simple: **`iife` is already Vite's
default `worker.format`.** Both chunks open with `(function(){…})()` and contain **zero** top-level
`import`/`export` statements:

```
$ head -c 60 dist/assets/pdfjs.worker-DeMsRMaW.js
(function(){function e(e,t){return this.has(e)?this.get(e):(
```

Two consequences follow immediately, and both contradict the framing in `03-RESEARCH.md`:

1. **No `importScripts` prelude is needed, and none would help.** The research expected the polyfill
   barrel to require `importScripts` injection to reach a classic realm. It does not: Vite *inlines*
   the barrel into the worker chunk at build time. The `map-get-or-insert` polyfill is visibly the
   first thing in the IIFE above, and plan 03-09's new `crypto.randomUUID` polyfill is present in
   both worker chunks too (`e[6]=e[6]&15|64,e[8]=e[8]&63|128` — the v4 version and variant masks).
   **The polyfill barrel already works in a classic worker realm.**
2. **pdf.js 5.7.284 "tolerates a classic `workerSrc`" trivially** — it never inspects the script's
   format. It has always been handed a classic IIFE script, and a classic script is also valid ESM,
   which is why loading it with `{ type: "module" }` works today.

### Experiment 2 — locate the actual module-worker dependency

With the bundle ruled out, the requirement was traced to spawn options. There are exactly two.

**(a) Inside `pdfjs-dist` — not configurable.** `node_modules/pdfjs-dist/build/pdf.mjs:15641` is the
*only* `new Worker(` construction site in the library:

```js
const worker = new Worker(workerSrc, {
  type: "module"
});
```

`{ type: "module" }` is a literal. There is no `GlobalWorkerOptions` flag, no `getDocument` parameter
and no build define that changes it. Emitting a classic bundle cannot help, because it is the
**spawn option**, not the script, that Firefox < 114 rejects.

**(b) In our own code — trivially changeable.** `src/lib/extract-pdf-text.ts:30-32` spawns the
extractor worker ourselves and opts in explicitly:

```ts
workerInstance = new Worker(
  new URL('./pdf-extractor.worker.ts', import.meta.url),
  { type: 'module' },
);
```

Since the emitted chunk is already classic, dropping this options object would make it a classic
worker with no other change. On its own that is worthless — (a) still binds.

### Experiment 3 — is there a supported way around (a)?

Yes. `GlobalWorkerOptions.workerPort` accepts a caller-constructed `Worker`
(`pdfjs-dist/types/src/display/worker_options.d.ts:5-12`, `pdf.mjs:13766-13771`, consumed at
`pdf.mjs:14820` as `port: GlobalWorkerOptions.workerPort`). When a port is supplied, `PDFWorker`
takes the `if (port)` branch in its constructor (`pdf.mjs:15594-15602`) and **never reaches the
hardcoded `new Worker(..., { type: "module" })` at all**.

So we could construct the worker ourselves as classic — `new Worker(url)` with no options — and hand
it to pdf.js. This route is real and supported, not a hack. It was **not implemented**, per this
plan's instruction not to merge a change to the PDF pipeline.

---

## Why the verdict is still "keep 114"

Three independent reasons, in descending order of weight.

**1. The floor drop is unproven. `structuredClone` is never used.** The "94" figure comes from
`structuredClone` (Firefox 94) being assumed to be the *next* binding constraint once module workers
are removed. It is not a constraint at all here:

```
$ rg -n "structuredClone" src/ index.html
(no matches)
```

Removing the module-worker requirement therefore does not land the floor at 94 — it lands it at
*whatever the next binding API is*, which **no one has yet enumerated**. That enumeration is
precisely plan **03-11**'s capability probe set. Doing the risky pipeline surgery *before* knowing
the answer could easily buy a drop from 114 to 113.

**2. It is pipeline surgery, not a flag.** The `workerPort` route changes who owns the pdf.js worker
lifecycle. Specific hazards found while reading the code:

- `PDFWorker` keeps a `#workerPorts` WeakMap and throws `"Cannot use more than one PDFWorker per
  port"` (`pdf.mjs:15599`). A single shared port has to be multiplexed across concurrent
  `getDocument()` calls, and document teardown must not terminate a worker another document is
  still using. Today pdf.js owns that lifecycle; this hands it to us.
- The nested case is worse. `src/lib/pdf-extractor.worker.ts` runs *inside* a worker and points
  pdf.js at a **nested** worker. Constructing that nested worker ourselves means owning nested-worker
  lifecycle in a realm where failure currently degrades gracefully.
- Document extraction is business-critical (Resume Analysis). The existing arrangement is
  load-bearing and known-good on all five matrix engines.

**3. Firefox 94-113 probably degrades rather than breaks — so the payoff is smaller than assumed.**
Both layers already have a main-thread fallback, which means the module-worker spawn failing is not
obviously fatal:

- pdf.js catches the worker `error` event and calls `#setupFakeWorker()` (`pdf.mjs:15683`), which
  loads the worker code on the main thread via `await import(this.workerSrc)`
  (`pdf.mjs:15750-15761`) — a dynamic import, supported since Firefox 67.
- Our own extractor is explicitly two-tier: `src/lib/extract-pdf-text.ts:1-9` documents that when the
  worker "either errors OR resolves with an empty string", extraction transparently falls back to
  `extractPdfTextOnMainThread()`, which "works wherever PDF rendering already works".

If that reasoning holds, Firefox 94-113 users get *slower, main-thread* extraction rather than a
broken feature — so the 114 floor may be **conservative rather than accurate**, and the honest fix
may be a matrix/copy change rather than a code change.

**This last point is reasoning from source, NOT an empirical result, and must not be published as
fact.** See the evidence limitation below.

---

## Evidence limitation (stated plainly)

**No Firefox between 94 and 113 was executed.** Playwright 1.61.0 ships exactly one Firefox build:

```
$ npx playwright install --dry-run firefox
Firefox 151.0 (playwright firefox v1532)
```

There is no supported way to drive a 2021-2023 Firefox from this matrix, so every claim about what
Firefox 94-113 *actually does* — including the graceful-degradation argument in reason 3 — is
derived from reading `pdf.mjs` and our own fallback code, not from a run. Anything published in
03-20 that depends on it needs either a real-device check (**XTEST-04**) or must be stated as
untested.

What *was* verified empirically: the byte-identical build comparison, the IIFE format of both
emitted worker chunks, the presence of both polyfills inside those chunks, the absence of
`structuredClone`, and the full green regression suite below.

---

## Regression evidence (the pipeline was not disturbed)

| Gate | Result |
| ---- | ------ |
| `npm run test` | **962 passed / 128 files** |
| `npm run type-check` | exit 0 |
| `npm run lint` | exit 0 (151 pre-existing warnings, 0 errors) |
| `npm run build` | exit 0, both worker chunks emitted |
| `npx playwright test e2e/cross-device/upload-parity.spec.ts` | **6 passed** — chromium, firefox, webkit, mobile-webkit, mobile-chromium (+ setup) |

The experiment left no residue: `git status --porcelain src supabase vite.config.ts` is empty, and
`vite.config.ts` is byte-identical to HEAD.

---

## Consequence for the published matrix

| Item | Value |
| ---- | ----- |
| **Published Firefox floor** | **114** (module workers, June 2023) — unchanged |
| **Reason** | pdf.js hardcodes `{ type: "module" }`; no configuration reaches it |
| **Is it permanent?** | **No.** `GlobalWorkerOptions.workerPort` is a supported route out |
| **Blocking prerequisite** | 03-11 must first establish what the *next* binding constraint is; `structuredClone` is not it |

**For plan 03-11 (capability probe set):** do **not** probe `structuredClone` as the Firefox-floor
proxy — it is unused, so it would report a capability the app does not need. The floor-setting probe
is **module worker support**, which is what actually binds. Probing it honestly is also awkward,
because both layers fall back to the main thread; a probe that reports "unsupported → blocked" would
be *wrong* if degradation is in fact graceful.

**For plan 03-20 (published matrix):** publish **Firefox 114+**. If space allows, disclose that
94-113 is expected to work with slower main-thread extraction but is **untested** — do not present
that as verified.

---

## Recommended follow-up (NOT merged here)

**Title:** Lower the Firefox floor by owning the pdf.js worker via `GlobalWorkerOptions.workerPort`

**Precondition:** 03-11's probe set must first identify the next binding constraint after module
workers. If that constraint is above 114, this follow-up is worthless — **close it instead of doing
it**.

**Change sketch:**
1. Drop `{ type: 'module' }` at `src/lib/extract-pdf-text.ts:32` (the chunk is already classic).
2. Construct the pdf.js worker as classic in `src/lib/pdf-worker.ts` and assign it to
   `GlobalWorkerOptions.workerPort` instead of setting `workerSrc`.
3. Do the same in the nested realm, `src/lib/pdf-extractor.worker.ts`.
4. Own teardown explicitly so one document's `destroy()` cannot terminate a shared port.

**Risk: HIGH.** Touches the Resume Analysis extraction path in three places, moves worker lifecycle
ownership from pdf.js to us, and interacts with nested workers. It also re-couples us to pdf.js
internals: a future `pdfjs-dist` that changes its port semantics would break it silently.

**Gating:** its own plan, with `upload-parity.spec.ts` green on all five projects, the existing PDF
extraction tests green, and a real-device check on a genuine Firefox 94-113 (XTEST-04) — since, as
above, this matrix structurally cannot see that version range.

**Recommendation:** defer. The floor is a *disclosure* problem, and 114 is honest. Reason 3 suggests
the cheaper and more truthful win is verifying graceful degradation on a real old Firefox and
softening the matrix language — no pipeline surgery required.

---

*Phase: 03-cross-device-reliability-and-compatibility · plan 03-09 · Task 3*
*Residual row: **R-23** in [`03-RESIDUAL-REGISTER.md`](./03-RESIDUAL-REGISTER.md)*

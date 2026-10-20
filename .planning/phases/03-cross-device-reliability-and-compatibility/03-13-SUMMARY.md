---
phase: 03-cross-device-reliability-and-compatibility
plan: 13
subsystem: stale-bundle-recovery
tags: [XDEV-07, XTEST-03, ui-spec-surface-e, D-18, D-19, XD-03, XD-17, XD-22]
requires:
  - "03-02 — src/lib/platform/build-id.ts (getBuildId, fetchDeployedBuildId, isVersionCheckDue) + dist/version.json + the __STRIVO_BUILD_ID__ define"
  - "03-12 — src/lib/client-error-taxonomy.ts (the frozen 9 codes, LEAK_GUARD_PATTERN, the isStaleReloadInProgress seam) + e2e/helpers/leak-guard.ts"
  - "03-06 — src/lib/diagnostics/ (install-global-handlers, already installed in main.tsx)"
  - "03-07 — index.html's pre-bundle ES5 gate and the window.__strivoBooted handshake"
  - "03-05 — e2e/cross-device/surfaces.ts (settle, record)"
provides:
  - "src/lib/platform/stale-bundle.ts — installStaleBundleRecovery(), isStaleReloading(), checkDeployedVersion(), resetStaleBundleForTests()"
  - "STALE_BUNDLE_GUARD_KEY / STALE_BUNDLE_URL_MARKER / LOOP_GUARD_WINDOW_MS — the loop-guard contract, importable by specs"
  - "src/components/platform/StaleBundleFallback.tsx — UI-SPEC Surface E2, testid stale-bundle-fallback"
  - "e2e/cross-device/stale-bundle.spec.ts — OT-14 / OT-15 + two controls, @xdev, 5/5"
  - "the build-OUTPUT assertion 03-02 and 03-06 both deferred"
affects:
  - "src/main.tsx — recovery armed before first render; the fallback renders through the same React root"
  - "src/lib/client-error-taxonomy.ts — isStaleReloadInProgress() now reads the real flag (the seam 03-12 left for this plan)"
  - "src/components/AnalysisErrorBoundary.tsx / HomepageErrorBoundary.tsx — render null while recovery is engaged (UI-SPEC E1)"
  - "03-14 — inherits XD-03's offline-affordance half; CLIENT_OFFLINE is the copy for it"
  - "03-15 — inherits XD-15's stalled-chunk bounded wait (R-26)"
tech-stack:
  added: []
  patterns:
    - "detect on an engine-independent platform EVENT, never on error.message text"
    - "one recovery decision per document (a `decided` latch), shared by the event detector and the version poll"
    - "storage guard that degrades to a URL marker AND reloads via that marker when it cannot persist"
    - "fallback rendered through the SAME React root, so #root is never emptied and 'exactly one surface' is structural"
    - "absence asserted by a MutationObserver persisted across the reload it is watching, never by a final screenshot"
key-files:
  created:
    - src/lib/platform/stale-bundle.ts
    - src/lib/platform/stale-bundle.test.ts
    - src/components/platform/StaleBundleFallback.tsx
    - e2e/cross-device/stale-bundle.spec.ts
  modified:
    - src/main.tsx
    - src/lib/client-error-taxonomy.ts
    - src/components/AnalysisErrorBoundary.tsx
    - src/components/HomepageErrorBoundary.tsx
    - .planning/phases/03-cross-device-reliability-and-compatibility/03-DEFECT-REGISTER.md
    - .planning/phases/03-cross-device-reliability-and-compatibility/03-RESIDUAL-REGISTER.md
decisions:
  - "Detection is vite:preloadError only. No per-engine chunk-error string appears anywhere in src/ (asserted by grep)."
  - "While OFFLINE the recovery deliberately does NOT reload — a reload while offline replaces the SPA with the browser's own error page. It hands over to the fallback instead, which is what closes XD-03's white screen."
  - "The fallback speaks CLIENT_CHUNK_LOAD_FAILED or CLIENT_OFFLINE — both already in 03-12's frozen nine. No tenth code was added."
  - "When the sessionStorage guard cannot be written, the reload navigates to the same URL carrying _v={buildId} so restricted-storage browsers still cannot loop. The extra query parameter is the deliberate cost."
  - "vercel.json left UNCHANGED — the /assets exclusion syntax could not be confirmed and a malformed source 404s every deep link. Recorded as R-24 with the exact patch."
  - "XD-15's stalled-chunk case reassigned to 03-15: a pending import dispatches no event at all, so bounding it is a Surface D waiting state, not a preloadError listener."
metrics:
  duration: ~2h
  tasks: 3
  files: 9
  completed: 2026-07-28
---

# Phase 03 Plan 13: Stale-Bundle Recovery Summary

Chunk-load failure is now detected through Vite 8's cancelable `vite:preloadError` — an
engine-independent signal — and answered with one silent, loop-guarded reload; when recovery
provably cannot work, exactly one honest full-page fallback renders through the same React root.

## What shipped

**`src/lib/platform/stale-bundle.ts`** — the detector and the policy. It adds one `window`
listener for `vite:preloadError`, calls `preventDefault()` (which is what stops Vite re-throwing
into `App.tsx`'s single boundary-less `<Suspense>` and unmounting the whole tree), and then makes
**exactly one** decision per document:

| Condition | Action |
| --- | --- |
| Guard says we already reloaded for this build id inside 60 s | render Surface E2 (`loop-guard`) |
| `navigator.onLine === false` | render Surface E2 (`offline`) — never reload |
| otherwise | write the guard and `location.reload()` **synchronously** |

`checkDeployedVersion()` consumes 03-02's `fetchDeployedBuildId()` / `isVersionCheckDue()` and
enters the same path on a mismatch; `null`, an `unknown` local id, and being offline are all
treated as *no information*, never as a mismatch. It is registered on
`visibilitychange -> visible` and exported so 03-14's router wiring can call it on route change.

The module writes **no** run state: the run id already persists under `ANALYSIS_RUN_STORAGE_KEY`
and `pathname`/`search`/`hash` survive `location.reload()` for free. That is stated in a comment so
a future contributor does not add a second, drifting copy of the one fact XRUN-03 recovery needs.

**`src/components/platform/StaleBundleFallback.tsx`** — UI-SPEC E2 verbatim: `bg-background`
full-page takeover, `max-w-xl`, 32 px padding with 64 px breathing at `md`, Lucide `RefreshCcw` at
24 px in `text-destructive`, heading 28/600/1.2, body 16/400/1.65, `role="alert"`, focus moved to a
`tabIndex={-1}` heading on mount, testid `stale-bundle-fallback`, semantic tokens only.

**`e2e/cross-device/stale-bundle.spec.ts`** — OT-14, OT-15 and two controls, `@xdev`, green on all
five projects.

## Deviations from Plan

### 1. `vercel.json` left unchanged — the plan's own escape hatch, taken deliberately

The plan's `must_haves` assert a `/assets` rewrite exclusion; the plan's Task 3 **action** says
*"If the correct syntax cannot be confirmed with confidence, DO NOT guess."* It could not be
confirmed here — no access to current Vercel documentation, and the locally installed
`path-to-regexp` is **v8**, which throws on the *existing, working* `"/(.*)"` source and is
therefore not a faithful oracle for Vercel's matcher. The risk is asymmetric: a malformed `source`
404s every deep link in production, while the upside is only a tidier failure shape.

Crucially this costs nothing: `vite:preloadError` fires regardless of the response, and
`stale-bundle.spec.ts` proves recovery on five engines **with `vercel.json` exactly as it stands**,
simulating the deleted chunk as the `200 text/html` response the catch-all actually returns today.
Recorded as **R-24** with the exact proposed patch and its verification steps.

### 2. Task 1 and Task 2 file boundaries swapped so every commit builds

The plan put the `main.tsx` wiring in Task 1 and the component it renders in Task 2. Committing
that order would have left an intermediate commit importing a file that did not exist. Task 1's
commit is detection + boundary suppression; Task 2's is the component + the `main.tsx` wiring.

### 3. `src/lib/client-error-taxonomy.ts` edited (not in `files_modified`)

One line. 03-12 explicitly left `isStaleReloadInProgress()` as a placeholder *"so that 03-13 edits
ONE line in ONE file"*. It now delegates to `isStaleReloading()`. Both boundaries additionally read
`isStaleReloading()` directly, as the plan's acceptance criteria require.

### 4. `network-conditions.spec.ts` NOT modified

Its four XD-03 offline rows now pass on their own, from the source fix. The `@xdev` lane went from
**197 passed / 4 failed / 30 skipped** to **221 passed / 0 failed / 30 skipped** (the +20 are this
plan's new cases). No assertion anywhere was weakened, and `AI_TEST_MODE` was never set.

### 5. OT-14's end state branches on an observed fact, not on an engine name

WebKit poisons a failed subresource URL for the whole session: the recovery reload is served the
same broken response **without the request reaching Playwright's route handler**. That is an
artefact of re-using one URL — a real redeploy changes the content hash — so OT-14 asserts
something strong on both sides (route rendered with zero fallback, **or** exactly one E2 surface
with no loop, no blank page, no leak) and the E1 absence assertion holds on 5/5 either way.
Recorded as **R-25**.

### 6. XD-15 reassigned to 03-15

A *rejected* import dispatches `vite:preloadError`; a *pending* one dispatches nothing at all.
Bounding the spinner means a timeout and an escape on `App.tsx`'s `<Suspense>` — a Surface D
waiting state, which 03-15 owns (it already owns XD-14 on the same spec file). Rationale in
**R-26**; the defect-register row is updated with the owner change rather than silently left.

## How the two "nothing rendered" guarantees are kept mutually exclusive

**E1 vs the error boundaries.** `preventDefault()` makes `__vitePreload` resolve `undefined`, so
`React.lazy` reads `undefined.default` and throws a *different* error on the next microtask — a
throw that could paint one frame of a boundary fallback before the navigation commits. Racing the
reload is a hope, not a construction. Both boundaries therefore call `isStaleReloading()` and
return `null` the moment recovery engages, with a comment saying why so nobody simplifies it away.

**E2 vs 03-07's pre-bundle ES5 gate.** They cannot co-appear, by ordering rather than by
coordination. `main.tsx` removes the `#browser-gate` node synchronously in the same task as
`root.render()`, and sets `window.__strivoBooted = true` in that same task — so the 8 s watchdog is
already disarmed. A `vite:preloadError` can only originate from a dynamic `import()` started during
React's render, i.e. a **later** task. By the time E2 can exist, the gate is already gone.
Additionally, E2 renders through the *same* React root as `<App />` rather than into a sibling
node — which is also what keeps `#root` non-empty (XD-03's actual symptom) and makes "exactly one
surface" a structural property rather than a timing one.

## 03-02's deferred build-output assertion: closed

03-02 could not assert the build ID reaches a built chunk (its module had no importer and was
tree-shaken); 03-06 converted that into an import-chain assertion and deferred the real one here.
`control: the build identity actually reaches a built chunk` now fetches `/version.json`, then
fetches every `<script src>` the served document loads and asserts at least one **served** chunk
contains that id — so a silently broken Vite `define` (which would ship `app_version: "unknown"`
and a permanently-matching version poll) is now red. OT-15 adds the runtime half: the E2 CTA's
`href` must equal `/?_v={deployed build id}` exactly.

## Register rows closed

| Row | Status |
| --- | --- |
| **XD-22** — no `vite:preloadError` listener anywhere | **CLOSED** |
| **XD-17** — the catch-all turns a deleted chunk into `200 text/html` | **NEUTRALISED** (detection no longer depends on the response shape); the exclusion itself deferred as R-24 |
| **XD-03** — offline in-app navigation ⇒ white screen | **white-screen half CLOSED**; the offline *affordance* half stays with 03-14 |
| **XD-15** — stalled chunk ⇒ spinner forever | **OPEN, reassigned to 03-15** (R-26) |
| **XDEV-07 / XTEST-03** | regression proof named: `e2e/cross-device/stale-bundle.spec.ts` |

New residual rows: **R-24** (vercel.json exclusion deferred), **R-25** (WebKit URL poisoning),
**R-26** (XD-15 reassignment).

## Verification

| Gate | Result |
| --- | --- |
| `npm run test` | **1096 passed / 0 failed** (135 files) — baseline 1077, +19 new stale-bundle cases |
| `npm run type-check` | clean |
| `npm run lint` | 0 errors (151 pre-existing warnings, unchanged) |
| `npm run build` | clean; `dist/version.json` = the build id, and it is present in the entry chunk |
| `npx playwright test e2e/cross-device/stale-bundle.spec.ts` | **20 passed** — 4 cases × 5 projects |
| `npx playwright test --grep @xdev` | **221 passed / 0 failed / 30 skipped** (was 197 / 4 / 30) |

## For the next plan

- **03-14** owns XD-03's remaining half. `checkDeployedVersion()` is exported for its route-change
  hook, and `CLIENT_OFFLINE` is already the frozen copy for the offline surface. `stale-bundle.ts`
  reads `navigator.onLine` directly today; once `getNetworkStatus()` exists it is a one-line swap.
- **03-15** owns XD-15 (R-26).
- **P-1** owns R-24 (verify + apply the `vercel.json` exclusion) and R-25/R-06 (a genuine redeploy
  while a WebKit tab is open — the one thing this suite structurally cannot prove).

## Self-Check: PASSED

All created files exist on disk; all three commits are reachable from `HEAD`.

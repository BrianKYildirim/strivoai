---
phase: 03-cross-device-reliability-and-compatibility
plan: 07
subsystem: ui
tags: [es5, browser-gate, capability-detection, safe-area, playwright, static-source-guard, accessibility]

# Dependency graph
requires:
  - phase: 03-05
    provides: "The reproduced white-screen defect class (XD-01/XD-02/XD-03, 5/5 projects) that a pre-bundle gate is the only thing able to speak for"
  - phase: 03-06
    provides: "src/lib/diagnostics/ and the installGlobalDiagnosticHandlers() call site in main.tsx that this plan appends below"
  - phase: 03-09
    provides: "The worker-floor verdict (keep Firefox 114; structuredClone is never used) that the published matrix on /supported-browsers.html is pinned to"
  - phase: 03-10
    provides: "The paired viewport-fit/safe-area invariant in responsive-source-guard.test.ts, deliberately written to become load-bearing when this plan opts in"
provides:
  - "UI-SPEC Surface A: an ES5-only inline guard in index.html that runs BEFORE the module bundle is parsed"
  - "Two mutually exclusive fallbacks: A1 capability failure (deterministic) and A2 boot watchdog (8000ms, heuristic)"
  - "public/supported-browsers.html — a static, bundle-independent support page that works when the bundle does not"
  - "The window.__strivoBooted boot handshake between index.html and src/main.tsx"
  - "A static-source guard that machine-enforces ES5-only syntax and the no-network/no-storage/no-cookie rule"
  - "Five-project Playwright proof of OT-1, OT-2 and OT-3"
  - "env(safe-area-inset-*) padding on the three viewport-edge-anchored surfaces, the required other half of viewport-fit=cover"
affects: [03-11, 03-12, 03-13, 03-17, 03-19, 03-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-bundle inline guard: a classic ES5 script whose syntax is enforced by a static-source test, not by review"
    - "Boot handshake: a global flag set after render() that lets a pre-bundle script distinguish 'slow' from 'broken'"
    - "Additive safe-area padding via Tailwind arbitrary calc() values, no-op wherever env() resolves to 0px"

key-files:
  created:
    - public/supported-browsers.html
    - src/test/platform/es5-guard-source-guard.test.ts
    - e2e/cross-device/browser-gate.spec.ts
  modified:
    - index.html
    - src/main.tsx
    - src/vite-env.d.ts
    - src/components/AppSidebar.tsx
    - src/components/ui/toast.tsx
    - src/components/ui/drawer.tsx

key-decisions:
  - "OT-1 aborts the entry module in ADDITION to deleting a probed global, because on a healthy boot main.tsx removes the gate by design (UI-SPEC rule 6) — without the abort the assertion would race the removal rather than test the contract"
  - "OT-1 and OT-2 use the identical non-booting condition and differ by exactly one variable (a probed global), making the pair a clean experiment on which fallback wins"
  - "Mutual exclusion is asserted in both directions without buying the 8000ms wait twice: OT-1 asserts A2 absent immediately, OT-2 asserts A1 absent after the watchdog"
  - "The gate does NOT probe structuredClone, per 03-09's finding that it is never used in src/ — probing it would report a capability the app does not need"
  - "The gate does NOT probe dynamic module loading: reaching it requires runtime code evaluation that a future CSP could break, and the A2 watchdog already covers module-parse failure"
  - "public/supported-browsers.html reuses the frozen hardcoded palette. It is part of Surface A and is reached exactly when the bundle failed, so it cannot reference a design token, a webfont or any asset"

patterns-established:
  - "Static-source guard for a non-TypeScript surface: extract the inline classic block from index.html with a negative lookahead on type=, assert the extraction is non-empty, then assert over the extracted text"
  - "Comment hygiene as a testable constraint: the ES5 guard's forbidden-substring list applies to comments too, so prose inside the block must avoid ' of ', backticks and '...'"

requirements-completed: [XDEV-01]

# Metrics
duration: 42min
completed: 2026-07-28
---

# Phase 03 Plan 07: ES5 Pre-Bundle Browser Gate Summary

**A browser that cannot run the bundle now gets a readable, correctly-diagnosed message from an ES5 script that executes before the bundle is parsed — and a browser that can run it never sees the gate for a single frame.**

## Performance

- **Duration:** ~42 min
- **Tasks:** 3 of 3
- **Files modified:** 9 (3 created, 6 modified)
- **Commits:** 3 task commits + this metadata commit

## Accomplishments

### Task 1 — the ES5 guard and the static page (`64acaef0`)

`index.html` now carries an inline **classic** `<script>` (no `type="module"`) authored in ES5 only, plus an empty `<div id="browser-gate">` that is a **sibling** of `#root`. The sibling relationship is load-bearing: React owns `#root` and would clear anything placed inside it, and the gate has to be removable deterministically.

The guard implements two triggers that can never both paint, held apart by a single closure-local boolean:

| | Trigger | Nature | testid |
| --- | --- | --- | --- |
| **A1** | A probed capability is absent | Deterministic, immediate | `browser-gate-unsupported` |
| **A2** | `window.__strivoBooted` unset 8000 ms after `DOMContentLoaded` | Heuristic | `browser-gate-boot-timeout` |

The copy is the UI-SPEC § Surface A text verbatim, including the deliberately different diagnosis in A2 ("This can happen on a slow connection or just after an update") — telling somebody on a slow connection that their browser is unsupported is the failure mode this split exists to prevent.

Probes, all of which an ES5 script can honestly evaluate: `window.Promise`, `window.fetch`, `Object.assign`, `Array.prototype.includes`, `'noModule' in HTMLScriptElement.prototype`, and `URL` / `URLSearchParams` **constructed**, not merely present (some old engines expose the name and throw on use). D-06 is honoured — capabilities are probed, never a user-agent string.

Two things it deliberately does not do:

- **No `structuredClone` probe.** 03-09 established it is never used anywhere in `src/`; probing it would gate on a capability the app does not need.
- **No dynamic-module probe.** Reaching one requires runtime code evaluation, which a future CSP without `unsafe-eval` would turn into a throw inside the failure path itself. The A2 watchdog already covers module-parse failure, which is the case that matters.

`public/supported-browsers.html` is a self-contained static page — inline styles, no script tag at all, no asset reference — publishing Chrome/Edge/Chromium 100+, **Firefox 114+**, Safari and iOS Safari 15.4+, Opera 86+ as *guidance*, with plain-language text explaining that Strivo checks what a browser can do rather than reading a version number.

The viewport meta gained `viewport-fit=cover`. `user-scalable` and `maximum-scale` remain absent — the tempting "fix" for iOS focus zoom is a WCAG 1.4.4 failure.

### Task 2 — boot handshake and the syntax guard (`e76d46f5`)

`src/main.tsx` sets `window.__strivoBooted = true` and removes `#browser-gate`, both **immediately after** `createRoot(...).render(...)`. The edit is confined to the bottom of the file; 03-09's polyfill-first import block at the top is byte-untouched, as is 03-06's `installGlobalDiagnosticHandlers()` call above `createRoot`.

`src/test/platform/es5-guard-source-guard.test.ts` (14 cases) is what makes the ES5 constraint real rather than aspirational. The property is unobservable at runtime here — vitest's jsdom realm parses every modern construct happily and no available engine is old enough to reject one — so it is asserted statically:

- ES5-only syntax: rejects `const `, `let `, `=>`, backtick, `?.`, `??`, `class `, `...`, ` of `, `import `, `async `, `await `, `Object.entries`, `Object.fromEntries`, `Array.prototype.at`
- D-08 rule 4: rejects `fetch(`, `XMLHttpRequest`, `sendBeacon`, `localStorage`, `sessionStorage`, `document.cookie`, `new Function`
- No markup-as-string: rejects `innerHTML`, `outerHTML`, `document.write` and any `location.` read; positively requires `createTextNode`
- Both testids and both headings verbatim, `role="alert"` present and `aria-live` absent, the 8000 threshold, and `#browser-gate` declared after `#root` and before the module entry in source order
- **OT-19**: the viewport meta *content attribute* contains `viewport-fit=cover` and neither `user-scalable` nor `maximum-scale`
- The `main.tsx` handshake, asserted **in file order** relative to `createRoot`

It carries the fail-closed non-empty-extraction assertion the pattern requires, plus a non-vacuity case proving the extractor ignores the `type="module"` entry script — without that negative lookahead every syntax assertion would be checked against the wrong block.

### Task 3 — the five-engine proof (`ee72cea0`)

`e2e/cross-device/browser-gate.spec.ts`, tagged `@xdev`, **21/21 green** across `chromium`, `firefox`, `webkit`, `mobile-webkit`, `mobile-chromium`.

| Observation | Injection | Asserts |
| --- | --- | --- |
| **OT-1** | `addInitScript` deletes `window.fetch`, entry module aborted | A1 visible with the verbatim heading, **A2 absent**, deletion confirmed to have taken effect, the supported-browsers link present, no engine-text leak |
| **OT-2** | Entry module aborted only | A2 visible past the watchdog, **A1 absent**, `#root` empty (the white-screen case, now covered) |
| **OT-3** | `MutationObserver` installed pre-navigation | The gate never acquired a child, `__strivoBooted === true`, `#browser-gate` gone from the DOM |
| Static page | Direct navigation | No module script, no `/assets/` reference, no `id="root"` — the SPA rewrite did not shadow it |

The OT-1 design deserves a note. On a **successful** boot `main.tsx` removes the gate by design (UI-SPEC rule 6 — the gate must never fight a healthy app for the viewport). Deleting a probed global alone does not stop the bundle from booting, so the assertion would have been racing the removal rather than testing the contract. A browser genuinely missing `fetch` cannot run the bundle either, so aborting the entry is what makes the injection faithful. The consequence is a clean experiment: OT-1 and OT-2 share an identical non-booting condition and differ by exactly one variable, and the verdict flips.

OT-3 proves **absence** with the observer rather than a screenshot, because a screenshot taken after removal cannot distinguish a gate that never painted from one that painted and was cleaned up.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Shipped the other half of 03-10's paired safe-area invariant**

- **Found during:** Task 2, on the full `npm run test` lane
- **Issue:** `src/test/platform/responsive-source-guard.test.ts::OT-19: safe-area` is a **conditional** invariant, written by 03-10 to be meaningful in both states: while `viewport-fit=cover` is absent it asserts absence and records the hand-off ("pending plan 03-07"); the moment this plan opts the page into the display cutout it becomes load-bearing and requires at least one viewport-edge-anchored surface to pad with `env(safe-area-inset-*)`. My Task 1 edit flipped the condition, so the lane went red on a requirement my own change created.
- **Fix:** Additive `env(safe-area-inset-*)` padding on the three genuinely edge-anchored surfaces — `AppSidebar`'s `fixed top-0 left-0` rail (its 64px toggle row otherwise sits under the status bar / dynamic island), the toast viewport (top edge below `sm`, bottom-right at `sm` and up, insets added to the existing `p-4` via `calc` so the 16px gutter is preserved), and the bottom-anchored `DrawerContent` (whose last action otherwise lands under the home indicator). Every value is `env(..., 0px)`, so all three are exact no-ops on any device without a cutout.
- **Files modified:** `src/components/AppSidebar.tsx`, `src/components/ui/toast.tsx`, `src/components/ui/drawer.tsx`
- **Commit:** `e76d46f5`
- **Why this is in scope:** 03-10 explicitly deferred the edit to 03-07 in the test's own comment. This is a designed hand-off, not another plan's defect.

No other deviations. No architectural decision was required, no authentication gate was hit, and no checkpoint was reached.

## Register Impact

Neither register carries a row **owned by** 03-07 — the defect register catalogues 03-05's reproduced findings, and XDEV-01 was a forward requirement rather than a reproduced defect. What this plan closes and touches:

| Row / item | Effect |
| --- | --- |
| **XDEV-01** (03-BRIEF) | **Satisfied for the pre-bundle half (D-08a).** The in-app capability gate (Surface B, D-08b) remains 03-11's. |
| **OT-19** | **Closed.** The viewport-meta half is asserted by the new source guard; the safe-area half by 03-10's now-active paired invariant. |
| **OT-1 / OT-2 / OT-3** | **Closed**, green on all five projects. |
| **R-16** (e2e budget) | Drawn down. See below. |
| **R-23** (Firefox floor) | **Consumed, not changed.** `/supported-browsers.html` publishes **Firefox 114+**, and the source guard asserts the `114` string is present, so revisiting the verdict now forces the published matrix and the finding to change together. |
| **XD-01 / XD-02** | Not closed here (03-08 owns them and already did), but the failure *class* they belong to — a module-scope throw that produces a blank document — is now caught by A2 rather than being silent. |

**R-16 draw-down: ~+15 s.** The spec runs standalone in **37.4 s** including `webServer` build and the shared `setup` project; the marginal cost inside a full lane is the sum of the case durations (OT-2 ≈ 9–12 s × 5 projects ≈ 50 worker-seconds, the other 15 cases ≈ 12 worker-seconds) divided across 4 workers, so **~15 s** of wall clock. Against the ~43 s of headroom left after 03-10, roughly **28 s** remains. **No cases were cut.** OT-2's 8000 ms is the contract and cannot be shortened; OT-1 deliberately does not re-buy that wait to observe the same mutual exclusion from the other side.

## Verification

| Gate | Result |
| --- | --- |
| `npm run build` | exit 0; `dist/index.html` contains `browser-gate`, both testids and `viewport-fit=cover`; the inline block survives the build **verbatim and unminified**; `dist/supported-browsers.html` emitted with no module script and no `/assets/` reference |
| `npm run test` | **976 passed / 129 files**, 0 failed |
| `npm run type-check` | exit 0 (`__strivoBooted` declared on `Window` in `src/vite-env.d.ts`) |
| `npm run lint` | exit 0 — 151 warnings, 0 errors, **unchanged** from HEAD |
| `npx playwright test e2e/cross-device/browser-gate.spec.ts` | **21 passed** across all five projects (37.4 s) |
| `npx playwright test --grep @xdev` | **166 passed / 5 failed / 30 skipped** in 2 m 28 s. The 5 failures are the pre-existing **XD-03** offline discovery rows on all five projects, owned by **03-13 / 03-14**. Every one of this plan's 20 cases is green. |
| `rg "fetch\(\|XMLHttpRequest\|sendBeacon\|localStorage\|sessionStorage\|document.cookie" index.html` | no matches |
| `rg "innerHTML" index.html` | no matches |

### Mutation proof (the source guard can actually fail)

Required by the plan's acceptance criteria. Each mutation was applied, the guard run, and the file restored from a backup taken beforehand:

| Mutation | Result |
| --- | --- |
| `var rendered` → `const rendered` in the inline block | **RED** — `the guard block uses ES5-only syntax` (1 failed / 13 passed) |
| Insert `fetch('/ping');` into the inline block | **RED** — `touches a forbidden capability: fetch(` (1 failed / 13 passed) |
| Remove `window.__strivoBooted = true` from `main.tsx` | **RED** — 2 failed / 12 passed (the handshake case and the try/catch case) |
| All three reverted | **GREEN** — 14 passed |

The guard also caught two real authoring mistakes during development that a reviewer would very plausibly have missed: the phrase `never the real location.` in a comment (tripping the `location.` sink assertion) and `Frozen mirror of the dark-theme tokens` (tripping ` of `). Both were reworded. This is the intended behaviour — the forbidden-substring rules apply to comments inside the block, because a minifier is not guaranteed to strip them and the constraint is about the block's bytes.

## Notes for Downstream Plans

- **03-11 (capability gate, Surface B):** the pre-bundle probe set is deliberately coarse and covers only what an ES5 script can honestly evaluate. Every fine-grained probe — module-worker support, `Worker`, `ReadableStream`, the storage round-trip, the Stripe capability signal — is yours. `window.__strivoBooted` is a *boot* signal only; it carries no capability verdict, so do not read it as one.
- **03-12 (error taxonomy):** the A1 and A2 strings are frozen UI-SPEC copy set as literal text, not routed through any error table. They are intentionally outside your taxonomy — they exist for the case where no module, including the taxonomy, has evaluated.
- **03-13 (stale bundle / chunk recovery):** A2 fires 8000 ms after `DOMContentLoaded` on a page whose bundle never evaluated. If a stale-bundle reload loop is ever introduced, A2 becomes its visible symptom — coordinate the two so a reload loop does not repeatedly paint the watchdog.
- **03-17 (budget re-measure):** the authoritative `npm run test:e2e` wall-clock is still yours to take; the ~15 s figure above is this plan's marginal draw-down, not a full-lane number.
- **03-20 (published matrix):** `/supported-browsers.html` is a second place the version guidance now lives. Keep it in sync with whatever the roadmap publishes; the source guard pins only the `114` string.
- **XTEST-04 (manual pass):** `env()` resolves to `0px` under Playwright emulation, so the three safe-area edits are structurally unverifiable in this matrix. They need a real notched device. The landscape `safe-area-inset-left` case on the `AppSidebar` rail was deliberately **not** padded — a ~44 px inset would eat most of the 72 px collapsed rail — and should be looked at on real hardware.

## Self-Check: PASSED

All created files exist on disk and all three task commits are present in `git log`.

---
phase: 03-cross-device-reliability-and-compatibility
plan: 12
subsystem: client-error-taxonomy
tags: [XRUN-06, XDEV-08, ui-spec-surface-c, leak-guard, error-boundaries]
requires:
  - "03-06 — src/lib/diagnostics/ (reportDiagnostic seam, 13 DIAGNOSTIC_CATEGORIES)"
  - "03-11 — src/lib/platform/capability-copy.ts (UI-SPEC Surface B frozen copy)"
  - "03-05 — e2e/cross-device/surfaces.ts (THEMES, applyTheme, settle, record)"
provides:
  - "src/lib/client-error-taxonomy.ts — the frozen, closed 9-code CLIENT_* table"
  - "LEAK_GUARD_PATTERN / containsLeak — the single XRUN-06 regex for the whole repo"
  - "mapClientError() — fail-closed mapper, default CLIENT_UNEXPECTED"
  - "CLIENT_CODE_FOR_DIAGNOSTIC_CATEGORY — the total 13 -> 9 collapse"
  - "isClientSurfaceSuppressed() / isStaleReloadInProgress() — rule 3 + the inert 03-13 seam"
  - "e2e/helpers/leak-guard.ts — assertNoLeak / assertFrozenCopy for plans 03-13..03-18"
affects:
  - "src/components/AnalysisErrorBoundary.tsx — copy source moved; title/description props removed"
  - "src/components/HomepageErrorBoundary.tsx — copy source moved; now reports to diagnostics"
tech-stack:
  added: []
  patterns:
    - "frozen exported copy table + exhaustive vitest test, mirroring ANALYSIS_ERROR_CODES"
    - "action KIND on every affordance so wiring survives a copy edit"
    - "regex defined once in src/, re-exported into e2e/ rather than retyped"
    - "vacuity guard: assert non-empty body.innerText BEFORE any absence assertion"
key-files:
  created:
    - src/lib/client-error-taxonomy.ts
    - src/lib/__tests__/client-error-taxonomy.test.ts
    - src/components/error-boundary-leak-guard.test.tsx
    - e2e/helpers/leak-guard.ts
    - e2e/cross-device/leak-guard.spec.ts
  modified:
    - src/components/AnalysisErrorBoundary.tsx
    - src/components/HomepageErrorBoundary.tsx
decisions:
  - "The 9 user codes and 03-06's 13 diagnostic categories are DIFFERENT vocabularies; the collapse is total and one-way, with no inverse"
  - "Free-text title/description props on AnalysisErrorBoundary replaced by a `code` prop — a caller may pick a code, it can no longer inject text"
  - "An extension-origin failure that survives the one auto-recovery renders the origin-neutral CLIENT_UNEXPECTED, not CLIENT_RENDER_FAILED"
  - "No offline case added to the leak-guard spec — the XD-03 rows are owned by 03-13/03-14 and duplicating them would add red rows to the wrong plan"
  - "The forced error-boundary fallback is proven in vitest, not Playwright — no injection throws deterministically inside a boundary subtree on five engines without shipping a test hook into production"
metrics:
  duration: ~55 min
  tasks: 3
  files: 7
  completed: 2026-07-28
---

# Phase 3 Plan 12: Client Error Taxonomy and the Leak Guard Summary

A frozen, closed set of nine client-side error codes with UI-SPEC-verbatim copy, plus machine proof — adversarial, mutation-tested at both the unit and the five-project browser layer — that no raw JavaScript, database, provider or stack text can reach a user, and that extension-injected failures are isolated rather than blamed on Strivo.

## What shipped

### 1. `src/lib/client-error-taxonomy.ts` — the frozen table (commit `216fc72e`)

Nine codes, exhaustive and closed: `CLIENT_OFFLINE`, `CLIENT_REALTIME_DEGRADED`, `CLIENT_CHUNK_LOAD_FAILED`, `CLIENT_STORAGE_BLOCKED`, `CLIENT_BROWSER_UNSUPPORTED`, `CLIENT_SESSION_EXPIRED`, `CLIENT_UPLOAD_FAILED`, `CLIENT_RENDER_FAILED`, `CLIENT_UNEXPECTED`.

Each row carries `heading`, `body`, `retryable`, `severity`, `toastPermitted`, `blocking`, `meritPhase`, an `affordance` (primary/secondary/link, each with a LABEL and an ACTION KIND) and a `visual` (semantic token surface, Lucide icon, whether `destructive` is permitted, placement).

Copy is transcribed character-for-character from UI-SPEC § Surface C. Where a spec row is one sentence pair, the table splits it into `heading` + `body` for rendering and `SURFACE_C_VERBATIM` holds the original string; the test **recomposes** `heading + '. ' + body` and asserts equality, so a rendering split cannot silently reword the spec. The two rows the spec defines by REFERENCE are asserted by identity instead:

- `CLIENT_BROWSER_UNSUPPORTED` reads `CAPABILITY_COPY.analysisHeading` / `.analysisBody` from 03-11's Surface B table — referenced, never restated.
- `CLIENT_SESSION_EXPIRED` recomposes to exactly `getSafeStreamErrorMessage('Not authenticated')`, so the client and server surfaces cannot drift apart on the same condition.
- `CLIENT_RENDER_FAILED` holds the two locked `AnalysisErrorBoundary` strings byte-for-byte.

`mapClientError(condition: unknown)` accepts a code (passthrough), a diagnostic category (collapsed), or a thrown value, and returns `CLIENT_UNEXPECTED` for everything else — `undefined`, `null`, numbers, symbols, plain strings, non-Error throws, novel `Error` subclasses. It returns a CODE and never text; there is no branch that can return caller-supplied string data. Chunk-load shapes across the three engines are recognised by reading `error.name`/`error.message` for **classification only** (same posture as `classifyScriptOrigin` — reading a string to pick an enum member is safe; returning it is the leak).

### 2. Both error boundaries source their copy from the table (commit `afc13d98`)

`AnalysisErrorBoundary` and `HomepageErrorBoundary` now render only `getClientErrorCopy(...)` values. The rendered `CLIENT_RENDER_FAILED` text and the `Try again` / `Refresh page` affordances are byte-identical to HEAD; only their source moved.

The free-text `title` / `description` props were **removed** and replaced with a `code?: ClientErrorCode` prop. That was a real hole, not a tidy-up: a caller holding an `error` could have passed `error.message` straight through the boundary and out to the user. A caller may now pick a code; it cannot supply text.

`HomepageErrorBoundary` previously rendered `Something went wrong` / `We hit a snag loading the page.` — a UI-SPEC § Forbidden-copy violation (a bare failure heading with no statement of what the user can do) and console-only. It now renders `CLIENT_UNEXPECTED` and reports to the shared 03-06 diagnostics seam.

### 3. Extension isolation (XDEV-08)

`isExtensionError(error)` is now evaluated in `getDerivedStateFromError`, so the **first** paint already knows the origin — an extension failure is never attributed to Strivo's own code for even one frame. When an extension-origin error survives the one auto-recovery, the boundary renders the origin-neutral `CLIENT_UNEXPECTED` rather than `CLIENT_RENDER_FAILED` (which would blame Strivo's rendering for someone else's injected script), reports `is_extension: true` and `script_origin: 'browser-extension'` to diagnostics, and never renders the extension's own message. `HomepageErrorBoundary` does the same on the marketing surface, which had no diagnostics wiring at all.

### 4. `e2e/cross-device/leak-guard.spec.ts` — OT-5 (commit `7c174ea1`)

Tagged `@xdev`, so it runs on all five projects. **15/15 green** (chromium, firefox, webkit, mobile-webkit, mobile-chromium × 3 tests), 24.6 s wall clock.

States forced, each in **both themes**:

| State | Forcing | Frozen copy asserted |
|-------|---------|----------------------|
| Capability-blocked AI (`/upload`) | `delete window.Worker` + `isSecureContext === false` | B2 heading + body + `See supported browsers` + banner |
| Capability-blocked checkout (`/pricing`) | same | B3 heading + body + `See supported browsers` |
| Capability detail dialog (B4) | click `See what's affected` | detail title + intro + footer |
| Restricted storage (`/pricing`) | `localStorage` getter throws `SecurityError` | page content ≥ 200 chars (no dedicated card yet — see Deferred) |
| Malformed run id (`/results/not-a-valid-uuid` and a non-existent UUID) | real stack, real PostgREST `22P02` | non-empty, leak-free |

The regex is **not defined in the spec**. `e2e/helpers/leak-guard.ts` re-exports `LEAK_GUARD_PATTERN` from `src/lib/client-error-taxonomy.ts`, which is the same constant the vitest table test and the boundary component tests assert against. A leak guard each caller retypes is a leak guard that drifts — the browser half would keep passing against a weakened pattern while the unit half kept the strong one.

`assertNoLeak()` carries the **vacuity guard**: it polls `document.body.innerText` to non-empty and fails with an explicit message BEFORE it ever runs the regex, because the states this spec forces are exactly the ones most likely to produce an empty document (that is the XD-01 white screen 03-08 fixed). It also never reproduces page text in a failure message — only the matched fragment, clamped to 80 chars, because a leaking page can contain a resume paragraph or a signed storage URL and Playwright failures land in CI artifacts.

## The relationship between the 9 codes and 03-06's 13 diagnostic categories

They are **different vocabularies with different audiences**, and the plan deliberately does not conflate them:

- `DIAGNOSTIC_CATEGORIES` (13) is what we tell **ourselves**. It is byte-mirrored with the edge function's allowlist, it is never rendered, and it is finer-grained on purpose (`poll_failed` vs `stream_failed` is answerable in a query; a user cannot act on the difference).
- `CLIENT_ERROR_CODES` (9) is what we tell the **user**. Every member has copy, an affordance and a visual treatment.

`CLIENT_CODE_FOR_DIAGNOSTIC_CATEGORY` is the **total, one-way collapse** of the 13 onto the 9, total by construction so that adding a diagnostic category without deciding what the user is told is a type error rather than an `undefined` rendered into a heading. Five categories (`boot_failure`, `extraction_failed`, `stream_failed`, `poll_failed`, `checkout_failed`) collapse onto `CLIENT_UNEXPECTED` because there is no honest, actionable sentence that distinguishes them for a user — inventing one would be worse than the fail-closed default. `CLIENT_OFFLINE` has **no pre-image**: being offline is a connectivity state, not a failure worth a diagnostics row. There is no inverse map and none is wanted.

## Mutation proofs — every guard was watched failing

A guard that has never been seen to fail is not evidence. Each mutation was applied, the failure observed, and the file restored from a scratch copy (no `git stash`, no `git checkout`).

| # | Mutation | Guard | Observed |
|---|----------|-------|----------|
| 1 | `TypeError:` prepended to the `CLIENT_UNEXPECTED` copy | `client-error-taxonomy.test.ts` leak guard | **RED** — 1 failed / 19 passed |
| 2 | `CLIENT_STORAGE_BLOCKED` marked `retryable: true` with a `Try again` primary | rule-2 retry partition | **RED** — 1 failed / 19 passed |
| 3 | `CLIENT_STORAGE_BLOCKED` deleted from the closed set | exhaustive + 13→9 totality | **RED** — 2 failed / 18 passed |
| 4 | **both boundaries render `error.message`** | `error-boundary-leak-guard.test.tsx` | **RED — 13 of 23 cases**, including all four leak classes on both boundaries and both static-source guards |
| 5 | A raw `TypeError … chunk-A1b2C3.js` string leaked into `CAPABILITY_COPY.analysisBody` | `e2e/cross-device/leak-guard.spec.ts` | **RED on all five projects** (OT-5a); OT-5b/OT-5c stayed green, so the failure was located, not global |

### The four adversarial leak classes (mutation 4, `src/components/error-boundary-leak-guard.test.tsx`)

Each is thrown through **both** boundaries and the UI-SPEC regex is run over `document.body.textContent`:

1. **Raw `Error.message`** — `TypeError: Cannot read properties of undefined (reading 'score')`
2. **Postgres / PostgREST** — `PGRST116: JSON object requested … 22P02 invalid input syntax for type uuid`
3. **AI provider** — `Deno.errors.Http: anthropic api returned 529 overloaded_error for model claude-haiku`
4. **Stack fragment** — `at renderCriteria (chunk-DkG9zQxP.js:1401:22)`

The file also asserts each of those strings **trips the regex on its own** (anti-vacuity — a blind regex would make every other assertion pass), that the expected frozen copy rendered, and a **static-source guard** that neither boundary references `error.message`, `.stack`, `String(err)` or `JSON.stringify(error)`, imports its copy from the table, and contains no inline prose literal.

The database leak class is additionally exercised **through the real stack** in OT-5c, where a non-UUID path segment makes PostgREST answer with a genuine `22P02` rather than a fixture.

## Verification

| Gate | Result |
|------|--------|
| `npm run test` (vitest) | **1077 passed / 0 failed** (baseline 1034; +43 from this plan) |
| `npm run type-check` | clean |
| `npm run lint` | 0 errors (151 pre-existing warnings, unchanged) |
| `npx playwright test e2e/cross-device/leak-guard.spec.ts` | **15/15 passed** on five projects, 24.6 s |
| `npx playwright test --grep @xdev` | **197 passed / 4 failed / 30 skipped** — baseline was 182/4/30, so +15 passed and **zero new failures**. The 4 are the known XD-03 offline rows in `network-conditions.spec.ts` owned by 03-13 / 03-14 |
| `git diff src/lib/analysisError.ts` | **empty** — the server taxonomy is byte-unchanged, asserted in the test suite too |

## Register rows closed

- **XRUN-06** — every client-facing string originates from a frozen exported table, fails closed to `CLIENT_UNEXPECTED`, and the absence of raw JS/DB/provider/stack text is asserted on rendered body text in both themes on five engines, with the guard proven able to fail at both layers.
- **XDEV-08 / XD-21 (03-12 half)** — extension-injected errors are isolated: reported with `is_extension` true and `script_origin` `browser-extension`, auto-recovered once, and never surfaced as an app failure message or attributed to Strivo's own code. 03-06 closed the observability half; this closes the user-facing half.
- **R-05 (isolation half)** — real extensions remain unreproducible in Playwright (unchanged), but the isolation behaviour is now deterministically asserted in vitest against the five extension URL schemes' stack shape. The XTEST-04 spot-check obligation is unchanged.

## Deviations from plan

**1. [Rule 4 — deferred, not auto-fixed] No `CLIENT_STORAGE_BLOCKED` surface was rendered.**
`03-DEFECT-REGISTER.md` (XD-02 correction row) and `session-storage.spec.ts`'s follow-up comment both name 03-12 as the owner of *rendering* the storage-blocked explanation. The plan's own three tasks do not include it, and its `files_modified` list contains no host component — building one would require wiring a new surface into the app shell, well outside the plan's declared blast radius. The **code, copy, affordance and visual treatment now exist** in the frozen table; only the render site is missing. OT-5b therefore asserts leak-freedom and non-vacuity on the restricted-storage boot state but cannot assert the card's copy. **Recommend assigning the render site to a follow-up plan.**

**2. The error-boundary fallback is proven in vitest, not Playwright.**
Task 3 asked for the boundary fallbacks to be forced in-browser "by injecting a render failure on a non-money surface". There is no injection that deterministically throws inside a boundary subtree on all five engines without shipping a test-only hook into production code — which would itself be a defect. The compensating proof is strictly stronger at the layer it runs on: `error-boundary-leak-guard.test.tsx` throws **all four leak classes** through **both** boundaries and runs **the same regex** over the rendered DOM, and mutation 4 shows it going red on 13 of 23 cases. The spec header states this exclusion explicitly rather than leaving a silent gap.

**3. No offline case was added to the leak-guard spec.**
`network-conditions.spec.ts` (03-05) already asserts the leak guard on an offline in-app navigation and is red on four projects — defect XD-03, owned by 03-13 / 03-14. Duplicating that assertion here would have added four more red rows attributed to the wrong plan and fixed nothing. Recorded in the spec header.

**4. [Rule 2 — auto-added] Affordances carry an action KIND, not just a label.**
The plan specified "which primary CTA, if any". A renderer that string-matched `'Reload Strivo'` to choose `window.location.reload()` would silently change behaviour the day the copy is reworded. Each affordance is `{ label, kind }` with `kind ∈ retry | reload | sign-in | supported-browsers`, and the rule-2 test asserts on the KIND as well as the label so a rename cannot smuggle a dead retry onto a terminal code.

**5. [Rule 2 — auto-added] The 03-13 `STALE_RELOADING` seam lives in the taxonomy module, not duplicated in each boundary.**
The plan said to add the placeholder "in these files". Putting `isStaleReloadInProgress()` once in `client-error-taxonomy.ts` (next to `isClientSurfaceSuppressed`, which is the same rule-3 concern) means 03-13 edits **one line in one file** instead of two components this plan just rewrote — which is exactly the merge-conflict avoidance the instruction was for.

## Deferred / for the phase registers

- Render site for `CLIENT_STORAGE_BLOCKED` (see deviation 1).
- Render sites for `CLIENT_OFFLINE`, `CLIENT_REALTIME_DEGRADED` and `CLIENT_CHUNK_LOAD_FAILED` are owned by 03-13 (stale bundle) and 03-14 (connectivity / realtime). Their copy, retry semantics and visual treatments are now waiting for them in the frozen table, and `e2e/helpers/leak-guard.ts` is the assertion they should import.
- `CLIENT_UPLOAD_FAILED` is not yet wired into `Upload.tsx`; the upload surface still uses its own toast copy. Out of this plan's `files_modified`.

## Constraint compliance

Nothing under `supabase/` was touched. No DB read or write, no migration, no deploy. No `git stash`, `reset`, `checkout`, `clean`, `push`, `pull`, `merge`, `rebase` or `fetch` — every mutation was reverted by restoring a scratch copy. `.planning/STATE.md` and `.planning/ROADMAP.md` are byte-identical; zero writes under `phases/02-*`. `src/main.tsx`, `src/config/pricing-config*` and `src/lib/analysisError.ts` are untouched. `AI_TEST_MODE` and `.env*` are unchanged; every verification was a targeted run.

## Self-Check: PASSED

All five created files verified present on disk; all three task commits verified in `git log`.

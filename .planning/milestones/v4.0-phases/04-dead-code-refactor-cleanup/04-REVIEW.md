---
phase: 04-dead-code-refactor-cleanup
reviewed: 2026-06-14T12:20:10Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - eslint.config.js
  - src/App.tsx
  - src/components/AnalysisComparisonModal.tsx
  - src/components/PriorAnalysisSelector.tsx
  - src/components/PriorLinkedInSelector.tsx
  - src/config/__tests__/feature-flags.test.ts
  - src/hooks/__tests__/usePaywallGuard.test.tsx
  - src/hooks/__tests__/useTierAccess.test.tsx
  - src/lib/document-extraction.ts
  - src/lib/pdf-extractor.worker.ts
  - src/lib/supabaseClient.ts
  - src/pages/CareerCompass.tsx
  - src/pages/LinkedInGrader.tsx
  - src/pages/Onboarding.tsx
  - src/pages/RecruitingLens.tsx
  - src/pages/Results.tsx
  - src/pages/SkillsGapAnalysis.tsx
  - src/pages/Upload.tsx
  - src/pages/__tests__/document-extraction-secondary.test.ts
  - src/test/supabaseMock.ts
  - supabase/functions/_shared/document-extraction.ts
  - tsconfig.app.json
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-06-14T12:20:10Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Phase 04 is a dead-code / cleanup phase whose governing constraint is **ZERO functional
change**. The diff (`34f8fe7..HEAD`) is small and surgical: type-correction casts, handler
wraps, removal of a dead dev route, collapse of a duplicate export, removal of a confirmed-dead
Ollama extraction leg, removal of three stray `<Navbar/>` renders, and an ESLint/tsconfig
scoping pass.

I verified the live gates myself:

- `npx tsc -p tsconfig.app.json --noEmit` → **exit 0** (clean type-check).
- `npx eslint .` → **exit 0** (122 warnings, 0 errors).
- `npx vitest run` → **457/457 passed**.
- `deno task test:ci` (the gated `npm run test:edge`) → **284 passed / 0 failed**.

So the `verify:baseline`-equivalent gates are green and the headline cleanup is sound. Most of
the "behavior-preserving" edits genuinely preserve behavior (traced individually below).

However, three issues earn WARNING:

1. **A behavior change slipped in under the cleanup.** `onClick={triggerPaywall}` →
   `onClick={() => triggerPaywall()}` in `Upload.tsx` changes what the modal actually receives
   (old code forwarded the React `MouseEvent` into the modal-args object; new code yields the
   default payload). This is arguably a latent-bug fix, but it is a *runtime* change and the
   phase claims zero functional change.
2. **A test file is now broken (4 failing tests) and was left untouched.** Removing the Ollama
   leg from `document-extraction.ts` invalidated `document-extraction.test.ts`, which still
   asserts `'ollama'` in `attemptedProviders`. I reproduced the failures. The file is NOT wired
   into the Deno gate (`deno.json` / `run-edge-tests.ps1` omit it), so it does not break
   baseline — but the `48e583f` commit message claims this work was "test:edge 284/0 green,"
   which is misleading: the directly-impacted test was never run.
3. **The same orphaned test now also fails type-check** (excess `ollamaVision` property no
   longer exists on `ExtractDocumentTextParams`), a latent landmine if anyone wires these
   `document-*.test.ts` files into CI.

## Warnings

### WR-01: `onClick` handler wrap on the paywall button changes the modal payload at runtime

**File:** `src/pages/Upload.tsx:330`
**Issue:**
The cleanup rewrote `onClick={triggerPaywall}` to `onClick={() => triggerPaywall()}`. These are
NOT runtime-equivalent. `triggerPaywall` is:

```ts
// src/hooks/usePaywallGuard.ts:60
const triggerPaywall = (args?: { feature: string; cost: number; balance: number }) =>
  openModal(args ?? { feature: 'Analysis', cost: 0, balance: 0 });
```

- **Old** `onClick={triggerPaywall}`: React invokes `triggerPaywall(mouseEvent)`. `args` is the
  truthy `MouseEvent`, so `args ?? default` short-circuits to the `MouseEvent`. `openModal`
  then does `setArgs(mouseEvent)`, and the modal reads `feature/cost/balance` off the
  MouseEvent → all `undefined`. The modal renders with `feature=undefined, cost=undefined,
  balance=undefined`.
- **New** `onClick={() => triggerPaywall()}`: `args` is `undefined` → `openModal({ feature:
  'Analysis', cost: 0, balance: 0 })`. The modal renders the proper default payload.

This is a real, observable behavior change in the "Upgrade to Elite" CTA on `Upload.tsx`. It is
almost certainly a *bug fix* (the new behavior matches the sibling call-sites at `Upload.tsx:96`
and `Upload.tsx:381`, both of which already call `triggerPaywall()` with no args), but the phase
constraint is ZERO functional change, so it must be flagged and acknowledged rather than landing
silently as "type cleanup."

Note: the analogous wrap in `src/pages/CareerCompass.tsx:1127` (`onClick={handleAnalyze}` →
`onClick={() => handleAnalyze()}`) is genuinely behavior-preserving — `handleAnalyze(opts?)`
reads only `opts.allowResumeOnly`, which is `undefined` whether a MouseEvent or nothing is
passed — so that one is correctly a no-op. The Upload change is the outlier because
`triggerPaywall` forwards its entire argument.

**Fix:**
Confirm intent. If the modal-label/cost change is desired, record it explicitly in the phase
summary/residual register as an accepted behavior delta (not "zero functional change"). If strict
preservation is required, the old buggy behavior would have to be reproduced — which is
undesirable; recommend keeping the fix and documenting it:

```ts
// Upload.tsx — keep the corrected wrap; document the delta in 04 SUMMARY:
//   "triggerPaywall CTA now opens the OutOfMerits modal with the default
//    { feature:'Analysis', cost:0, balance:0 } payload instead of the
//    inert MouseEvent payload. Behavior-correcting; not zero-change."
<Button onClick={() => triggerPaywall()}>
```

### WR-02: `document-extraction.test.ts` not updated after Ollama leg removal — 4 tests fail

**File:** `supabase/functions/_shared/document-extraction.test.ts:106,124,125,130,150,154,168,169,195,210,214`
**Issue:**
Commit `48e583f` removed the Ollama leg (the `ollamaVision?` param, the `invokeOllamaVision`
import, and the `cheapProviders[0]` ollama entry) from `document-extraction.ts`, but left
`document-extraction.test.ts` untouched. That test still:

- passes `ollamaVision: async () => ...` (now an excess property — `ExtractDocumentTextParams`
  no longer declares it), and
- asserts `result.metadata.provider === "ollama"` (line 124),
  `attemptedProviders === ["pdf_parser", "ollama"]` (line 125, 150, 168, 210), and
  `fallbackReason` / `attempts` reasons containing `ollama_*` (lines 169, 214).

I ran the file directly:

```
deno test --allow-all --no-check _shared/document-extraction.test.ts
→ FAILED | 2 passed | 4 failed
  - "accepts configured cheap OCR after rejected parser text"        (line 106)
  - "blocks Claude OCR for non-Elite users after cheap providers fail" (line 130)
  - "allows literal Elite Claude OCR only after parser and cheap providers fail" (line 154)
  - "returns all_providers_failed with no accepted text"             (line 195)
```

Root cause: the implementation's `attemptedProviders` no longer contains `"ollama"`, but the
assertions still expect it. For the pro-tier cases, removing ollama also flips `result.ok` to
`false` (mistral/textract return config-missing → claude blocked for non-elite), so even
`assert(result.ok)` on line 123 throws.

**Severity rationale:** WARNING not BLOCKER because `document-extraction.test.ts` is **orphaned
from the gate** — it appears in neither `supabase/functions/deno.json` (`test` / `test:ci`
tasks) nor `scripts/run-edge-tests.ps1`. I confirmed the actual gate is green
(`deno task test:ci` → 284/0). So baseline is not broken today. It is a latent failure that
surfaces the moment anyone runs the file directly (e.g. debugging) or wires the `document-*`
suites into CI. The `48e583f` commit message's "test:edge 284/0; verify:baseline green" is
therefore technically true for the gate but misleading about the directly-impacted test.

The sibling files `document-quality.test.ts` and `document-persistence.test.ts` also still
reference `'ollama'` in `ExtractionProvider[]` literals and metadata fixtures; those are
self-consistent (they construct fixtures rather than calling `extractDocumentText`) and
`ExtractionProvider` still includes `'ollama'` in
`document-extraction-types.ts:5`, so they do not fail — but they should be reviewed for the same
stale-symbol concern.

**Fix:**
Update the four failing tests to the post-removal fallback chain
(`pdf_parser → mistral → textract → claude_ocr`):

```ts
// Remove every `ollamaVision: ...` property from the params objects, and:
// line 124-125:
assertEquals(result.metadata.provider, "mistral");           // mistral now first cheap provider
assertEquals(result.metadata.attemptedProviders, ["pdf_parser", "mistral"]);
// line 150:
assertEquals(result.attemptedProviders, ["pdf_parser", "mistral", "textract"]);
// line 168:
assertEquals(result.metadata.attemptedProviders, ["pdf_parser", "mistral", "textract", "claude_ocr"]);
assertMatch(result.metadata.fallbackReason ?? "", /mistral_/);
// line 210 & 214: drop "ollama" / "ollama_http_500" from the expected arrays
```

Alternatively, if these `document-*` suites are intentionally retired, delete the file (as was
done for `ollama-client.test.ts`) rather than leaving it broken.

### WR-03: Stale test also breaks Deno type-check (excess `ollamaVision` property)

**File:** `supabase/functions/_shared/document-extraction.test.ts:77,114,138,160,180,201`
**Issue:**
Each `extractDocumentText({ ... ollamaVision: async () => ... })` call now passes a property that
`ExtractDocumentTextParams` no longer declares. Running with default type-checking
(`deno test` without `--no-check`) the file fails to compile:

```
TS2353: Object literal may only specify known properties, and 'ollamaVision' does not exist in
type 'ExtractDocumentTextParams'.
```

(I observed this directly; the standalone run also surfaced `attempts`-on-success-type and
`Deno`-global errors, but the load-bearing one is the `ollamaVision` excess property.) Because
the gate runs Deno tests with `--no-check`, this does not fail baseline today — but it means the
file cannot be re-enabled with type-checking without edits.

**Fix:** Same as WR-02 — remove the `ollamaVision` properties from all six call sites (or delete
the file). After removal, also drop the `result.attempts?.` access on line 212 if it lands on a
success branch, since `attempts` is only present on the failure variant of `ExtractionResult`.

## Info

### IN-01: `SkillsGapAnalysis` now renders with no navbar in three states (acknowledged, and fixes a latent crash)

**File:** `src/pages/SkillsGapAnalysis.tsx:405,420,516` (base) → removed
**Issue:**
The three removed `<Navbar />` lines were rendering an identifier that **was never imported** in
this file (confirmed: `git show 34f8fe7:src/pages/SkillsGapAnalysis.tsx` has no
`import ... Navbar`). At base commit those three render paths (`checkingAccess` loading state,
free-tier upgrade gate, and the main return) referenced an undefined `Navbar` — a
`Cannot find name 'Navbar'` type error and a runtime `ReferenceError` had those branches
rendered. Removing them is both required to make the file type-check (current
`tsc -p tsconfig.app.json --noEmit` is exit 0) and a strict improvement.

The observable consequence: `SkillsGapAnalysis` now renders with **no top navbar at all** in
those states (there is no layout-level navbar wrapper for this page either). That is internally
consistent — the page never had a working navbar — but it is a UX inconsistency versus
`Pricing/Questions/Privacy/...` which render `<Navbar />` explicitly. Flagged as INFO because it
is acknowledged in the phase brief and the alternative (a crashing page) is strictly worse.

**Fix:** None required for correctness. If a navbar is desired on this page, add a proper
`import { Navbar } from '@/components/Navbar';` and render it — but that would be new scope, not
this phase.

### IN-02: ESLint scope now excludes `supabase/functions/**` and `.claude/**` entirely

**File:** `eslint.config.js:13-18`
**Issue:**
The new `ignores` block removes `supabase/functions/**`, `.claude/**`, and the generated
`src/integrations/supabase/types.ts` from the frontend ESLint run. At base, the config had
`files: ["**/*.{ts,tsx}"]` with only `dist` ignored, so `npx eslint .` would attempt to lint
Deno edge code with browser globals — which is meaningless (Deno globals, `https://` imports) and
was almost certainly producing noise/failures. Excluding Deno code (which has its own
`deno.json` strict checking) is a defensible scoping decision and does not reduce coverage of
real frontend source. Recorded as INFO so the scope reduction is on the record: `supabase/
functions/**` is now outside the JS/TS lint gate.

**Fix:** None required. The comment block already documents the rationale; ensure the residual
register notes that Deno-side lint relies solely on `deno`/`deno.json`, not this config.

### IN-03: ESLint rule downgrades to `warn` are tracked-baseline suppressions, not new gaps

**File:** `eslint.config.js:39-46`
**Issue:**
`no-explicit-any`, `no-empty-object-type`, `ban-ts-comment`, `no-require-imports`, and
`no-control-regex` were downgraded from their recommended `error` level to `warn`. This keeps
`npx eslint .` at exit 0 (I confirmed: 122 warnings, 0 errors) without purging pre-existing
violations. The inline comment ties these to `.planning/audit/RESIDUAL-REGISTER.md` and labels
them as pre-existing-at-phase-start, not new. This is acceptable for a cleanup phase but does
mean genuine `any`/`@ts-ignore` regressions will now pass the lint gate as warnings. Flagged so
the tradeoff is explicit.

**Fix:** None for this phase. Ensure the residual register records the warning counts at this
HEAD so a future "re-tighten" pass has a baseline, and consider `--max-warnings` budgeting later
to prevent warning-count creep.

### IN-04: `tsconfig.app.json` narrows ambient `types` and lowers `ignoreDeprecations`

**File:** `tsconfig.app.json:5,7`
**Issue:**
Two changes: (a) `ignoreDeprecations` "6.0" → "5.0", and (b) a new explicit
`"types": ["vitest/globals", "node", "vite/client"]`. Adding `types` switches ambient type
inclusion from "all `@types/*` in node_modules" to exactly those three packages — this is the
correct way to expose `vitest/globals` (used by `supabaseMock.ts` and the in-scope tests) and
`vite/client` (which removes the need for the `// @ts-expect-error` on the `?url` import in
`pdf-extractor.worker.ts:1`, also removed in this phase). I verified `tsc -p tsconfig.app.json
--noEmit` is exit 0 and `vitest run` is 457/457, so nothing regressed. Recorded as INFO because
narrowing `types` can silently drop ambient globals from other `@types/*` packages; the clean
type-check + green tests confirm none were load-bearing here, but it is a config behavior change
worth noting.

**Fix:** None required. If a future `@types/*` package is added expecting global ambient
exposure, remember it must be added to this `types` array explicitly.

---

## Verified behavior-preserving (no finding)

For the record, the following flagged edits were individually traced and confirmed to be
type-only / runtime-identical:

- **`PriorAnalysisSelector.tsx:95`, `PriorLinkedInSelector.tsx:127`** — `(... as number |
  undefined)` casts inside `??` chains. The runtime value flowing through `??` is unchanged;
  the cast only narrows the static type. No-op at runtime.
- **`CareerCompass.tsx:628,714`** — `const missing: MissingPriorSource[] = ...` annotations.
  Both branches produce the same runtime array passed to `setMissingPrior`. (Pre-existing note:
  the `:628` branch trusts `submitData.missing` unfiltered while `:714` filters — that asymmetry
  predates this phase and is not a behavior change introduced here.)
- **`CareerCompass.tsx:344`** — `as AnalysisResult` → `as unknown as AnalysisResult`. Double
  assertion is compile-time only; identical runtime value into `setAnalysis`.
- **`CareerCompass.tsx:1127`** — `onClick={() => handleAnalyze()}`. `handleAnalyze(opts?)` reads
  only `opts?.allowResumeOnly`, which is `undefined` whether passed a MouseEvent or nothing →
  same `false` branch. Behavior-preserving (contrast WR-01).
- **Removal of `// eslint-disable-line react-hooks/exhaustive-deps`** in `CareerCompass.tsx:475`,
  `LinkedInGrader.tsx:198`, `RecruitingLens.tsx:549`, `Results.tsx:326`. The dependency arrays
  themselves are **unchanged**; only the suppression comments were dropped. Effect timing
  identical. (Other useEffects in CareerCompass still carry their disable comments — only the
  ones whose deps the linter now considers complete were un-suppressed.)
- **`Onboarding.tsx:336`** — `const writes: PromiseLike<{ error: unknown }>[] = [...]` annotation.
  Type-only; same promise array awaited.
- **`AnalysisComparisonModal.tsx:636`** — duplicate `export default` removed. All importers
  (`LinkedInGrader.tsx:15`, `Results.tsx:16`) use the named `{ AnalysisComparisonModal }`; no
  default-import consumer exists. Safe.
- **`App.tsx:43,86`** — removed the dead `LockedSectionsSandbox` import and its DEV-only route.
  File deleted; no remaining references (`grep` clean). Safe.
- **`document-extraction.ts:392` (frontend)** — `new Blob([data])` → `new Blob([data as
  BlobPart])`. `Uint8Array` is a valid `BlobPart`; cast is type-only.
- **`supabaseClient.ts:57,59`** — removed two `// eslint-disable-next-line no-console`. The
  `no-console` rule isn't enabled, so these were inert; runtime unchanged.
- **`supabaseMock.ts:17`** — `{ ... } as const` → `: { data: unknown[]; error: null }`. Test-only
  mock terminal; runtime object identical.
- **In-scope test edits** (`feature-flags.test.ts:81` `'true'`→`true`; `usePaywallGuard.test.tsx:51`
  and `useTierAccess.test.tsx:43` rest-param on `rpcSpy`; `document-extraction-secondary.test.ts:17`
  `new Set<string>`) — all type-only; assertions and behavior unchanged. `vitest run` confirms
  457/457.

---

_Reviewed: 2026-06-14T12:20:10Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

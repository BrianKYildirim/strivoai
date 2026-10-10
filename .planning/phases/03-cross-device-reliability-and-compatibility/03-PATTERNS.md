# Phase 3: Cross-Device Reliability and Compatibility - Pattern Map

**Mapped:** 2026-07-27
**Files analyzed:** 44 (24 new · 20 modified)
**Analogs found:** 39 / 44 (exact 21 · role-match 18 · none 5)

> Source of the file list: `03-RESEARCH.md` § *Recommended File Layout* (the master list),
> cross-checked against `03-CONTEXT.md` § *Integration Points* and `03-UI-SPEC.md` surfaces A–G.
> Every analog below was re-read from HEAD on 2026-07-27; line numbers are HEAD line numbers.

---

## File Classification

### New files

| New file | Role | Data Flow | Closest Analog | Match |
|----------|------|-----------|----------------|-------|
| `public/supported-browsers.html` | static asset | request-response | *(none — `public/` has no HTML)* | **none** |
| `src/lib/platform/capabilities.ts` | utility | transform (probe → tier) | `src/lib/polyfills/map-get-or-insert.ts` + `src/config/feature-flags.ts` | role-match |
| `src/lib/platform/capabilities.test.ts` | test | transform | `src/lib/polyfills/map-get-or-insert.test.ts` | exact |
| `src/lib/platform/build-id.ts` | config accessor | request-response (poll) | `src/config/feature-flags.ts` | role-match |
| `src/lib/platform/stale-bundle.ts` | utility | event-driven | `src/lib/analysis-error-log.ts` (safe wrappers) + `AnalysisErrorBoundary` recover-once | role-match |
| `src/lib/platform/stale-bundle.test.ts` | test | event-driven | `src/lib/polyfills/map-get-or-insert.test.ts` | exact |
| `src/lib/platform/network-status.ts` | utility | event-driven | `src/hooks/useAnalysisRun.ts:316-405` (subscribe + cleanup effect) | role-match |
| `src/lib/diagnostics/client-diagnostics.ts` | service | fire-and-forget emit | `src/lib/analysis-error-log.ts` (record builder) + `supabase/functions/_shared/ai-telemetry.ts` (never-throws) | exact |
| `src/lib/diagnostics/client-diagnostics.test.ts` | test (XLOG-02 PII guard) | transform | `src/test/security/phase9-pii-guard.test.ts` + `src/lib/analysis-error-log.test.ts` | exact |
| `src/lib/diagnostics/categories.ts` | model (frozen closed set) | transform | `src/lib/analysisError.ts:149-163` (`ANALYSIS_ERROR_CODES`) | exact |
| `src/lib/diagnostics/install-global-handlers.ts` | utility | event-driven | `src/main.tsx:1-11` (import-for-side-effect ordering) | role-match |
| `src/lib/client-error-taxonomy.ts` | model (frozen 9-code table) | transform | `src/lib/analysisError.ts` | **exact** |
| `src/lib/__tests__/client-error-taxonomy.test.ts` | test | transform | `src/lib/__tests__/analysisError.test.ts` | **exact** |
| `src/lib/polyfills/crypto-random-uuid.ts` | utility (polyfill) | transform | `src/lib/polyfills/map-get-or-insert.ts` | **exact** |
| `src/lib/polyfills/crypto-random-uuid.test.ts` | test | transform | `src/lib/polyfills/map-get-or-insert.test.ts` | **exact** |
| `src/lib/polyfills/index.ts` | barrel | — | `src/lib/pdfjs.worker.ts:1-14` (realm-entry install comment) | role-match |
| `src/components/platform/CapabilityGate.tsx` | component | request-response (render gate) | `src/components/AnalysisErrorBoundary.tsx:73-105` | role-match |
| `src/components/platform/StaleBundleFallback.tsx` | component | render | `src/components/AnalysisErrorBoundary.tsx:73-105` | exact |
| `supabase/functions/log-client-diagnostic/index.ts` | edge function (controller) | request-response ingest | `supabase/functions/validate-document/index.ts` | **exact** |
| `supabase/functions/log-client-diagnostic/index.test.ts` | test (deno) | request-response | `supabase/functions/validate-document/index.test.ts` | **exact** |
| `supabase/migrations/<ts>_client_error_diagnostics.sql` | migration | — | `supabase/migrations/20260721000000_ai_call_telemetry.sql` | **exact** |
| `supabase/migrations/rollback/<ts>_client_error_diagnostics.rollback.sql` | migration rollback | — | `supabase/migrations/rollback/20260721000000_ai_call_telemetry.rollback.sql` | **exact** |
| `e2e/cross-device/*.spec.ts` (`@xdev` subset) | test (e2e) | request-response | `e2e/two-tab-concurrency.spec.ts` + `e2e/auth.setup.ts` | exact |
| `src/test/platform/*-source-guard.test.ts` (ES5 guard syntax · `UniversalAnalyzing` fabrications · viewport meta · `useReducedMotion` · ui font-size) | test (static-source guard) | transform | `src/test/security/xss-sink-guard.test.ts` | **exact** |
| `src/hooks/useSubmitGuard.ts` *(D-29 shared submit-guard primitive)* | hook | request-response | `src/hooks/useIdempotencyKey.ts` + `src/pages/Onboarding.tsx:75-88` | exact |

### Modified files

| Modified file | Role | Data Flow | Change | Analog for the change | Match |
|---------------|------|-----------|--------|----------------------|-------|
| `index.html` | config/entry | — | ES5 guard (Surface A) + `viewport-fit=cover` | *(none in repo)* | **none** |
| `src/main.tsx` | entry | — | `window.__strivoBooted`, remove `#browser-gate`, polyfill barrel, install global handlers | itself (`:1-11`) | exact |
| `vite.config.ts` | config | — | `define: __STRIVO_BUILD_ID__` + `version.json` emit plugin | itself (`:34-48` plugin/build shape) | role-match |
| `vercel.json` | config | — | `/assets/*` rewrite exclusion + `no-store` on `version.json` | *(none — 9-line file, no `headers` block)* | **none** |
| `playwright.config.ts` | config | — | 5 projects + per-project `grep` + opt-in channels | itself (`:38-45`) | exact |
| `playwright.prod.config.ts` | config | — | **read-only reference** — RESEARCH forbids adding the matrix here | itself (`:14-27` safety invariants) | exact |
| `package.json` | config | — | `test:e2e:xdev`, `verify:baseline` wiring | existing `verify:baseline` chain | exact |
| `supabase/config.toml` | config | — | `[functions.log-client-diagnostic] verify_jwt = false` | `:92-95` (`validate-document`) | **exact** |
| `scripts/deploy.ps1` | config | — | append to `$Functions` | `:74` (`"validate-document"`) | **exact** |
| `supabase/functions/deno.json` | config | — | append test to `test:ci` **explicit file list** | trailing `validate-document/index.test.ts` | **exact** |
| `src/lib/supabaseClient.ts` | service | — | **delete** the `storage:` override (Pitfall 1) | `realtime-js resolveSessionStorage` (external precedent) | role-match |
| `src/lib/analysis-error-log.ts` | service | fire-and-forget | delegate transport to `client-diagnostics`, preserve every export | itself | exact |
| `src/hooks/useAnalysisRun.ts` (`:339`) | hook | pub-sub | add `.subscribe((status, err) => …)` callback | its own poll-fallback `fetchStatus` (`:342-388`) | exact |
| `src/pages/Results.tsx` (`:478`) | page | pub-sub | same | `useAnalysisRun.ts:316-405` | exact |
| `src/components/UniversalAnalyzing.tsx` | component | event-driven | delete 4 fabrications, honest stage map, 45s/120s thresholds, focus trap, ≤2 animations | `useResumeStream.ts:62-78` (`STAGE_LABELS` + `detectStage`) | exact |
| `src/components/ui/textarea.tsx` | component | — | `text-sm` → `text-base md:text-sm` | `src/components/ui/input.tsx:11` | **exact** |
| `src/components/ui/select.tsx` (`SelectTrigger`) | component | — | same | `src/components/ui/input.tsx:11` | **exact** |
| `src/index.css` | style | — | `.min-h-viewport` / `.h-viewport` utilities | `src/index.css:97-135` (`@layer utilities`) | exact |
| `src/components/AnalysisErrorBoundary.tsx` | component | — | render `null` when `STALE_RELOADING` (UI-SPEC E1) | itself (`:43-67`) | exact |
| `src/components/HomepageErrorBoundary.tsx` | component | — | same | `AnalysisErrorBoundary.tsx` | exact |
| `src/pages/{Upload,LinkedInGrader,RecruitingLens,CareerCompass}.tsx` + `src/pages/InterviewPrep.tsx` (`:639`, the `<IntakeForm>` render site) | page | render gate | **03-11 (wave 5) — capability block.** Render `BlockedAiEntryPoint` in place of the live start CTA when `resolveCapabilityTier()` is `degraded`; behaviour only, never layout. `src/components/interviewPrep/IntakeForm.tsx:195` is READ-ONLY — the block lands at the page's render site, not in the shared form. | `src/components/AnalysisErrorBoundary.tsx:73-105` | role-match |
| `src/pages/{Upload,Onboarding,LinkedInGrader,RecruitingLens,CareerCompass}.tsx`, `src/hooks/useEliteRerun.ts` | page/hook | request-response | **03-16 (wave 8) — D-29 submit guard.** Route inline `crypto.randomUUID()` through the primitive. | `src/pages/Onboarding.tsx:84-88` | exact |
| `e2e/two-tab-concurrency.spec.ts` | test (e2e) | request-response | add rapid-click cases + `@xdev` tag | itself (`:1-80`) | exact |
| `e2e/elite-rerun-merit.spec.ts` | test (e2e) | request-response | same | `e2e/two-tab-concurrency.spec.ts` | exact |
| `TESTING-STRATEGY.md` | doc | — | record the new lane + measured wall-clock (Open Q6) | its own 09-09 precedent | exact |

> **Shared-file ownership across the two rows above (added by the plan revision).** Four page files —
> `Upload.tsx`, `LinkedInGrader.tsx`, `RecruitingLens.tsx`, `CareerCompass.tsx` — are touched TWICE: first by
> **03-11 (wave 5)** for the capability block, then by **03-16 (wave 8)** for the D-29 submit guard. This is not a
> parallel-write conflict: `03-16-PLAN.md` declares `depends_on: ["03-11", "03-14"]`, so it is strictly ordered after
> 03-11 and finds `BlockedAiEntryPoint` already in place. The two guards compose in that order — capability blocks
> BEFORE `beginSubmit()` is ever called. `InterviewPrep.tsx` is touched by 03-11 only (it has no inline
> `crypto.randomUUID()` nonce). `Onboarding.tsx` and `useEliteRerun.ts` are touched by 03-16 only. The
> `20 modified` figure in the header predates this row split; counting `InterviewPrep.tsx` it is 21.

---

## Pattern Assignments

### `src/lib/polyfills/crypto-random-uuid.ts` (utility/polyfill, transform)

**Analog:** `src/lib/polyfills/map-get-or-insert.ts` — copy structure, guard, and header shape verbatim.

**Header pattern** (`map-get-or-insert.ts:1-23`) — a *root-cause* header is mandatory in this
directory. It names the failing call site, the exact production error string, why transpilation
cannot fix it, and the "defers to native" guarantee:

```ts
// WHY THIS EXISTS
// ---------------
// `pdfjs-dist` (pulled in via `react-pdf`) calls `Map.prototype.getOrInsertComputed`
// ...
// which crashes Resume Analysis before a single page can be parsed. This is a
// runtime prototype method, so transpilation / `build.target` / browserslist
// cannot restore it — it must be polyfilled. This module is imported for its
// side effects at the very top of the main-thread entry (main.tsx) AND inside
// every worker realm that runs pdf.js, so the method exists wherever pdf.js runs.
//
// The installers are guarded: when the browser ships a native implementation we
// leave it untouched, so we transparently defer to the engine once support lands.
```

**Guarded `define()` + install-on-import** (`map-get-or-insert.ts:56-85`) — the exact shape D-09
mandates. Note the descriptor flags and the `installX()` export-for-tests + bare call at EOF:

```ts
function define(proto: object, name: string, impl: (...args: never[]) => unknown): void {
  // Only install when the method is genuinely missing so native engines win.
  if (typeof (proto as Record<string, unknown>)[name] === "function") {
    return;
  }
  Object.defineProperty(proto, name, {
    value: impl,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

/**
 * ... Idempotent and safe to call from any context (window or
 * worker global scope). Exported for tests; also invoked on import.
 */
export function installMapGetOrInsert(): void {
  if (typeof Map === "function" && Map.prototype) {
    define(Map.prototype, "getOrInsert", getOrInsert);
    ...
  }
}

installMapGetOrInsert();
```

**Test pattern** (`map-get-or-insert.test.ts:32-47, 107-114`) — three required blocks:
*reproduction* (delete the API, assert the production error), *fix* (install, assert behaviour),
*guard* (native sentinel is preserved). Plus a full `afterEach` restore:

```ts
function deleteMethods(): void {
  delete (Map.prototype as unknown as Record<string, unknown>).getOrInsertComputed;
  ...
}

afterEach(() => {
  // Restore whatever the environment originally had.
  const m = Map.prototype as unknown as Record<string, unknown>;
  if (originalMapGOIC) m.getOrInsertComputed = originalMapGOIC; else delete m.getOrInsertComputed;
  ...
});

describe('guard: native implementation is preserved', () => {
  it('does not overwrite an existing native method', () => {
    const sentinel = function sentinel() { return 'native'; };
    (Map.prototype as unknown as Record<string, unknown>).getOrInsertComputed = sentinel;
    installMapGetOrInsert();
    expect((Map.prototype as unknown as Record<string, unknown>).getOrInsertComputed).toBe(sentinel);
  });
});
```

**Realm-install pattern** (the barrel `src/lib/polyfills/index.ts` must be imported first in
all four realm entries). HEAD proves four install sites:

| Realm entry | HEAD line |
|---|---|
| `src/main.tsx` | `:5` `import "./lib/polyfills/map-get-or-insert";` |
| `src/lib/pdf-worker.ts` | `:8` `import './polyfills/map-get-or-insert';` |
| `src/lib/pdfjs.worker.ts` | `:13` `import "./polyfills/map-get-or-insert";` |
| `src/lib/pdf-extractor.worker.ts` | `:3` `import './polyfills/map-get-or-insert';` |

`src/lib/pdfjs.worker.ts:1-14` documents *why* each realm needs its own install — reuse that
wording for the barrel:

```ts
// pdf.js spawns its worker with `{ type: "module" }` and, inside that realm ...
// That realm is a fresh global scope that does NOT inherit the main-thread polyfill,
// so we must install the polyfill here — BEFORE the pdf.js worker code runs
```

---

### `src/lib/client-error-taxonomy.ts` (model, transform)

**Analog:** `src/lib/analysisError.ts` — the frozen-table shape UI-SPEC Surface C explicitly
requires ("in the same shape as `ANALYSIS_ERROR_CODES`"). **Do not modify `analysisError.ts`** —
it is the frozen 13-code server mirror. Build a *sibling* module.

**Module header — leak posture + retry partition** (`analysisError.ts:1-20`):

```ts
/**
 * Leak posture (LIFE-08): every message here is safe, specific, and operationally
 * useful, yet carries NO technical detail — no payload, prompt, provider body,
 * stack, secret, HTTP status, or internal identifier. ...
 *
 * Retry partition (LIFE-06) — MUST match the backend table exactly:
 *   - retryable = true  → ...
 *   - retryable = false → everything else.
 */
```

**Closed union + display record** (`analysisError.ts:24-50`):

```ts
export type AnalysisErrorCode =
  | "INPUT_MISSING"
  | "FILE_NOT_FOUND"
  ...;

export interface AnalysisErrorDisplay {
  /** User-facing message: specific + operationally useful, yet leak-free. */
  message: string;
  /** Whether the caller may retry (LIFE-06 transient/permanent split). */
  retryable: boolean;
}

const ANALYSIS_ERROR_DISPLAY: Record<AnalysisErrorCode, AnalysisErrorDisplay> = { ... };
```

**Fail-closed mapper** (`analysisError.ts:112-117`) — UI-SPEC Surface C rule 1 (`CLIENT_UNEXPECTED`)
is this function with a different fallback constant:

```ts
export function mapAnalysisError(code: string | null | undefined): AnalysisErrorDisplay {
  if (code && Object.prototype.hasOwnProperty.call(ANALYSIS_ERROR_DISPLAY, code)) {
    return ANALYSIS_ERROR_DISPLAY[code as AnalysisErrorCode];
  }
  return ANALYSIS_ERROR_DISPLAY.UNKNOWN_ANALYSIS_ERROR;
}
```

**Exhaustive-codes export** (`analysisError.ts:148-163`) — the array the test iterates:

```ts
/** The complete, closed set of 13 codes (stable order) — for exhaustive tests. */
export const ANALYSIS_ERROR_CODES: readonly AnalysisErrorCode[] = [ ... ] as const;
```

---

### `src/lib/__tests__/client-error-taxonomy.test.ts` (test, transform)

**Analog:** `src/lib/__tests__/analysisError.test.ts` — copy all four assertions, adjusting
count 13 → 9 and the retryable partition to UI-SPEC Surface C.

**Anti-mirror discipline** (`analysisError.test.ts:20-25`) — the expected partition is restated
literally so a drift in the source is *caught*, not mirrored:

```ts
// The authoritative retryable partition (LIFE-06). Kept literal here so a drift in
// analysisError.ts is caught rather than mirrored by importing the same source.
const RETRYABLE: ReadonlySet<AnalysisErrorCode> = new Set<AnalysisErrorCode>([
  'MODEL_TIMEOUT',
  'MODEL_RATE_LIMITED',
]);
```

**Closed-set + exhaustive assertions** (`analysisError.test.ts:28-50`):

```ts
it('exposes exactly the closed set of 13 codes', () => {
  expect(ANALYSIS_ERROR_CODES).toHaveLength(13);
  expect(new Set(ANALYSIS_ERROR_CODES).size).toBe(13);
});

it('matches the LIFE-06 retryable partition exactly (only the 2 transient codes)', () => {
  for (const code of ANALYSIS_ERROR_CODES) {
    expect(mapAnalysisError(code).retryable).toBe(RETRYABLE.has(code));
  }
  ...
});
```

**Leak-pattern list** (`analysisError.test.ts:52-70`) — this is the vitest half of the UI-SPEC
leak guard; the Playwright `body.innerText` regex is its browser half:

```ts
it('leaks no technical detail in any message (LIFE-08)', () => {
  const leakPatterns: RegExp[] = [
    /\b\d{3}\b/,                         // HTTP status codes (400/402/500/...)
    /http[s]?:\/\//i,                    // URLs
    /\bstack\b/i,
    /\banthropic\b/i,                    // provider name
    /\bsupabase\b/i,
    /\bundefined\b/i,
    /[{}]/,                              // JSON fragments
    ...
  ];
```

> **Planner note:** UI-SPEC Surface C copy contains `Reload Strivo` and `strivoai.net`. The
> `http[s]?://` and `\b\d{3}\b` patterns above will need explicit, justified carve-outs
> (`15,000ms` etc. must not appear in copy at all — the forbidden-copy list already bans
> countdowns, so this should be self-enforcing).

---

### `src/lib/diagnostics/client-diagnostics.ts` (service, fire-and-forget)

**Two analogs, both load-bearing.**

**Analog A — `src/lib/analysis-error-log.ts`:** the record builder D-10 generalizes. Every
export must be preserved (`analysis-error-log.ts` is refactored to *delegate*, not deleted).

**Closed field set + no-PII contract** (`analysis-error-log.ts:1-14`):

```ts
/**
 * Leak posture: we log NO resume content — no file text, no prompt, no PII. Only
 * technical diagnostics. This is separate from the user-facing copy, which comes
 * from the leak-free analysisError taxonomy; nothing logged here is ever rendered.
 */
```

**Stage + script-origin types** (`analysis-error-log.ts:16-36`) — extend `stage` to the 11 audit
surfaces rather than inventing a new vocabulary:

```ts
export type AnalysisLifecycleStage =
  | "upload" | "extraction" | "stream" | "job-poll" | "recovery" | "render" | "unknown";

/** Where the failing top-of-stack script came from. */
export type ScriptOrigin = "first-party" | "browser-extension" | "third-party" | "unknown";

export interface AnalysisErrorContext {
  stage: AnalysisLifecycleStage;
  runId?: string | null;
  /** Resume row id — an internal identifier, never resume content. */
  resumeId?: string | null;
  /** Extra non-sensitive tags (e.g. { path: 'worker-extract' }). */
  tags?: Record<string, string | number | boolean | null | undefined>;
}
```

**Browser/version parsing — reuse as-is** (`analysis-error-log.ts:44-62`). Ordering is
load-bearing (Edge/Opera before Chrome; `Version/…Safari` before bare `Safari/`):

```ts
const EXTENSION_SCHEMES = ["chrome-extension://", "moz-extension://",
  "safari-web-extension://", "safari-extension://", "ms-browser-extension://"];

export function parseBrowser(ua: string): BrowserInfo {
  ...
  // Order matters: Edge/Chrome UAs both contain "Chrome"; check the more specific first.
  if (/Edg\//.test(ua)) { browser = "Edge"; version = pick(/Edg\/([\d.]+)/) ?? version; }
  else if (/OPR\//.test(ua)) { ... }
  else if (/Firefox\//.test(ua)) { ... }
  else if (/Chrome\//.test(ua)) { ... }
  else if (/Version\/[\d.]+.*Safari/.test(ua)) { ... }
  else if (/Safari\//.test(ua)) { ... }
  return { userAgent: ua, browser, version };
}
```

**Script-origin classification** (`analysis-error-log.ts:70-88`) — feeds the `script_origin` /
`is_extension` diagnostics columns and XDEV-08:

```ts
export function classifyScriptOrigin(stack: string | undefined, appOrigin: string): ScriptOrigin {
  if (!stack) return "unknown";
  if (EXTENSION_SCHEMES.some((scheme) => stack.includes(scheme))) return "browser-extension";
  const urls = stack.match(/https?:\/\/[^\s):]+/g);
  if (!urls || urls.length === 0) return "unknown";
  const firstThirdParty = urls.find((u) => !u.startsWith(appOrigin));
  if (!firstThirdParty) return "first-party";
  return "third-party";
}

export function isExtensionError(error: unknown): boolean { ... }
```

**Never-throws accessors + emit** (`analysis-error-log.ts:90-138`) — every environment read is
try/caught, and the emit itself is try/caught. Copy this exactly; add the sendBeacon transport
*inside* the same `try`:

```ts
function safeOrigin(): string {
  try {
    return typeof window !== "undefined" && window.location ? window.location.origin : "";
  } catch { return ""; }
}

/**
 * Log a structured, leak-free record ... Never throws (diagnostics must not create
 * new failures). Returns the record so callers/tests can assert on it.
 */
export function logAnalysisError(error: unknown, ctx: AnalysisErrorContext): Record<string, unknown> {
  ...
  try {
    console.error("[AnalysisError]", record);
  } catch {
    // never let logging throw
  }
  return record;
}
```

**Analog B — `supabase/functions/_shared/ai-telemetry.ts:1-31` (Phase 02, TOK-01):** the
never-throws *contract wording* D-11 says to follow. Read-only — this is the cofounder's file.

```
 * CONTRACT: `recordAiCall` NEVER throws and NEVER rejects. A telemetry failure of
 * any kind — missing env, missing table, exploding client — must be incapable of
 * failing an analysis (threat T-02-05). Everything below is wrapped accordingly.
 *
 * PRIVACY: the row carries counts and identifiers only — never prompt or response
 * text. Warn logs here carry a code + message only, never the row payload.
```

> **Divergence to state in the plan:** `ai-telemetry.ts:21-26` deliberately *awaits* its insert
> because a floating promise in a Deno isolate can be dropped. The **client** seam is the
> opposite — RESEARCH Pattern 5 requires the emit is *never awaited* in a user code path.
> Same "never-throws" contract, different await posture, for a documented reason. Say so.

---

### `src/lib/diagnostics/client-diagnostics.test.ts` (test — the XLOG-02 PII guard)

**Analog:** `src/test/security/phase9-pii-guard.test.ts` — the repo's existing "PII protection is
enforced, not intended" guard.

**Why the guard shape matters** (`phase9-pii-guard.test.ts:6-24`) — copy this framing, including
the *auto-discovery* argument (no registration step ⇒ nobody can quietly drop it):

```ts
// D-15 PII guard (VER-04) — "PII protection is enforced, not intended."
// ...
// vitest + `node:fs` from `process.cwd()`, auto-discovered by the `src/**/*.test.ts` glob
// — there is NO registration step and therefore no allowlist anyone can quietly drop it
// from. It runs inside `verify:baseline`, so PII in Phase 9 evidence is a RED gate rather
// than a code-review hope.
//
// Threats (09-02-PLAN):
//   T-09-02-A  real-user PII in a git-tracked evidence artifact  -> email + uuid sweep
//   ...
//   T-09-02-D  the guard false-positives itself into uselessness -> VALUE-tuned patterns
//              + explicit allowlists stripped BEFORE scanning
```

**Allowlist-then-scan discipline** (`phase9-pii-guard.test.ts:33-49`) — allowlisted values are
*stripped from the text before* the patterns run:

```ts
// ── Allowlists ────────────────────────────────────────────────────────────────
// Everything here is stripped from the text BEFORE the patterns run — the same
// escape-valve `security-audit-docs.test.ts` uses for project refs. Anything NOT
// listed here is a finding.
const ALLOWLISTED_REFS = ['zjpjapgraoxdukdvpjes', 'cimjltzovkahkqecpwgi'];
```

**XLOG-02 requires *both halves*** (RESEARCH Pattern 5): assert (a) the client record builder
emits only allowlisted keys, and (b) the edge function drops everything else. Half (b) lives in
`supabase/functions/log-client-diagnostic/index.test.ts`.

---

### `src/test/platform/*-source-guard.test.ts` (test, static-source guard)

**Analog:** `src/test/security/xss-sink-guard.test.ts` — the canonical repo static-source guard.
Five Phase-3 guards use this exact shape (ES5-only syntax in `index.html`; no `%`/ETA/elapsed-time
progress in `UniversalAnalyzing`; viewport meta content; `useReducedMotion()` usage; `text-base
md:text-sm` on `@/components/ui`).

**Walk + posix-relative allowlist** (`xss-sink-guard.test.ts:16-42`):

```ts
const SRC_DIR = join(process.cwd(), 'src');
const SINK = 'dangerouslySetInnerHTML';

const ALLOWLIST = new Set<string>([
  'src/components/ui/chart.tsx',
  'src/test/security/xss-sink-guard.test.ts',   // the guard necessarily names the token
]);

function walkSource(dir: string): string[] { /* readdirSync withFileTypes, recurse, .ts/.tsx */ }
function toPosixRelative(fullPath: string): string {
  return relative(process.cwd(), fullPath).split(sep).join('/');
}
```

**Three assertions — the non-vacuity trio** (`xss-sink-guard.test.ts:44-72`). The first two are
what stop a green-but-meaningless lane (RESEARCH *Anti-vacuity rules*):

```ts
it('discovers src/ TypeScript surfaces (length guard so the walk is non-empty)', () => {
  // Fail-closed: an empty walk (wrong cwd / broken glob) must not silently pass the sink audit.
  expect(files.length).toBeGreaterThan(0);
});

it('the allowlisted chart.tsx sink still exists (the accepted benign CSS-var sink)', () => {
  // Positive assertion: ... If it is ever removed, this fails so the allowlist is
  // pruned deliberately (not left stale).
  expect(chart.includes(SINK)).toBe(true);
});

it(`no src surface outside the allowlist contains ${SINK}`, () => {
  const offenders: string[] = [];
  ...
  expect(offenders, `New ${SINK} sink(s) found outside the allowlist ... Offenders: ${offenders.join(', ')}`)
    .toEqual([]);
});
```

---

### `supabase/functions/log-client-diagnostic/index.ts` (edge function, request-response)

**Analog:** `supabase/functions/validate-document/index.ts` — the Phase 01.1 precedent, and the
newest function in the repo.

**Import block — the shared-utility set** (`validate-document/index.ts:1-29`):

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { type UserContext, requireAuth } from '../_shared/auth.ts';
import { jsonError, withCors } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import {
  checkRateLimit, createRateLimitResponse,
  type RateLimitConfig, type RateLimitResult,
} from '../_shared/rate-limiter.ts';
```

**Dependency-injection seam — this is why the deno test can run offline**
(`validate-document/index.ts:31-59`). Reproduce it so `index.test.ts` can drive the handler
without a network or a DB:

```ts
export interface HandlerDependencies {
  requireAuth: RequireUserAuth;
  checkRateLimit: (userId: string, tier: string, config: RateLimitConfig) => Promise<RateLimitResult>;
  ...
  readBody: (req: Request) => Promise<ArrayBuffer>;
}

const defaultDependencies: HandlerDependencies = { requireAuth, checkRateLimit, ..., readBody: (req) => req.arrayBuffer() };

export async function handler(req: Request, deps: HandlerDependencies = defaultDependencies): Promise<Response> { ... }
```

**Auth-then-rate-limit ordering + reqId logger** (`validate-document/index.ts:106-127`):

```ts
const reqId = crypto.randomUUID().slice(0, 8);
const log = createLogger('validate-document', reqId);
...
// Auth must precede rate limiting, metadata inspection, body reads, and parsing.
const userContext = await deps.requireAuth(req, { type: 'user' });
userId = userContext.userId;
tier = userContext.tier;

const rateLimit = await deps.checkRateLimit(userId, tier, {
  key: 'validate-document',
  limits: { free: 30, pro: 60, elite: 120 },
});
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfterSeconds, 'user');
```

> **Divergence for diagnostics (state it explicitly in the plan).** Auth here is *optional* — a
> pre-auth browser-gate failure must still be recordable — so `requireAuth` is wrapped in
> try/catch and yields `user_id = null`. And the rate limiter is the **by-key** variant, not the
> per-user one. See the shared pattern below.

**`withCors` export + `serve`** (`validate-document/index.ts:204-209`) — the exact tail every
function must have. `_shared/cors-audit.test.ts` is a drift guard that fails if you hand-roll
headers:

```ts
export const handleRequest = (req: Request) =>
  withCors(req, 'user', () => handler(req), {
    extraHeaders: 'x-document-type, x-file-name',
  });

serve(handleRequest);
```

**Test analog** (`validate-document/index.test.ts:1-21`) — deno std assert, env set at module
top, handler + handleRequest + deps imported:

```ts
/**
 * Phase 01.1 validate-document HTTP contract tests.
 * Run: deno test --allow-all --no-check validate-document/index.test.ts
 */
import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { withCors } from '../_shared/cors.ts';
import { handler, handleRequest, type HandlerDependencies } from './index.ts';

const ORIGIN = 'https://strivoai.net';
Deno.env.set('ALLOWED_ORIGINS', ORIGIN);
```

---

### `supabase/migrations/<ts>_client_error_diagnostics.sql` (migration)

**Analog:** `supabase/migrations/20260721000000_ai_call_telemetry.sql` — copy the *structure*
verbatim. D-12 forbids touching `ai_call_telemetry` itself; this is a read-only template.

**Header — context + privacy/scope guard** (`ai_call_telemetry.sql:1-15`):

```sql
-- PRIVACY / SCOPE GUARD: counts and identifiers ONLY. No prompt text, no response text.
-- `output_chars` is a character COUNT, never the output itself. This table must never
-- hold resume, LinkedIn profile, or any other user content. Additive: no existing table,
-- policy, or grant is modified.
```

**The load-bearing design constraints comment** (`ai_call_telemetry.sql:18-26`) — reproduce the
`user_id` no-FK rationale verbatim; the same cascade/trigger interaction applies:

```sql
--    Design constraints (each load-bearing, do not "tidy" them away):
--    * `user_id` carries NO foreign key. The repo added user_deletion_cascade_fks
--      (20260719120000) plus an auth-delete cleanup trigger (20260719120001); an FK here
--      would either cascade-delete measurement history or block user deletion.
```

**RLS + the operator-memory REVOKE** (`ai_call_telemetry.sql:79-93`). The sequence REVOKE is the
part that is easy to omit and is flagged by operator memory `supabase-default-execute-grants`:

```sql
-- 3. RLS: service role only. Service role bypasses RLS, so edge inserts still work.
ALTER TABLE public.ai_call_telemetry ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Service role only - no anon/authenticated access"
    ON public.ai_call_telemetry FOR ALL TO authenticated
    USING (false) WITH CHECK (false);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4. Belt and braces: no PostgREST-reachable grant at all.
REVOKE ALL ON public.ai_call_telemetry FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.ai_call_telemetry_id_seq FROM anon, authenticated;
```

**Verifying `DO $$` block** (`ai_call_telemetry.sql:95-129`) — a migration in this repo *proves*
it landed:

```sql
DO $$
DECLARE v_rls boolean; v_policies integer; ...
BEGIN
  IF to_regclass('public.ai_call_telemetry') IS NULL THEN
    RAISE EXCEPTION 'public.ai_call_telemetry was not created';
  END IF;
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.ai_call_telemetry'::regclass;
  IF NOT v_rls THEN RAISE EXCEPTION 'RLS is not enabled on public.ai_call_telemetry'; END IF;
  SELECT count(*) INTO v_policies FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'ai_call_telemetry';
  IF v_policies < 1 THEN RAISE EXCEPTION 'deny-all policy missing on public.ai_call_telemetry'; END IF;
  RAISE NOTICE 'public.ai_call_telemetry active; RLS on, % policy/policies, ...', v_policies;
END $$;
```

**Operator-run retention comment** (`ai_call_telemetry.sql:131-136`) — retention is documented,
never automated. No `pg_cron`:

```sql
-- 6. RETENTION POLICY (OPERATOR-RUN, intentionally NOT automated).
--    Keep 180 days. ... Run manually when needed:
--    DELETE FROM public.ai_call_telemetry WHERE created_at < now() - interval '180 days';
```

**Rollback pattern** (`rollback/20260721000000_ai_call_telemetry.rollback.sql:1-27`) — drop policy,
drop indexes (reverse order), drop table, **then verify the drop**:

```sql
-- Purely additive migration, so the rollback is a clean drop: no other object references
-- public.ai_call_telemetry (no FKs in or out, no views, no RPCs).
--
-- WARNING: this destroys accumulated telemetry history. Export first ...
--   COPY (SELECT * FROM public.ai_call_telemetry) TO STDOUT WITH CSV HEADER;

DROP POLICY IF EXISTS "Service role only - no anon/authenticated access" ON public.ai_call_telemetry;
DROP INDEX IF EXISTS public.ai_call_telemetry_truncated_idx;
...
DROP TABLE IF EXISTS public.ai_call_telemetry;

DO $$
BEGIN
  IF to_regclass('public.ai_call_telemetry') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback failed: public.ai_call_telemetry still exists';
  END IF;
  RAISE NOTICE 'public.ai_call_telemetry dropped';
END $$;
```

---

### Realtime `.subscribe()` status callback — `useAnalysisRun.ts:339` and `Results.tsx:478`

**Analog:** the *same effect* they already live in. Both sites are bare today.

**`useAnalysisRun.ts:328-339` (current, bare):**

```ts
const channelTopic = `analysis-run-${runId}-${++analysisRunChannelSeq}`;
const channel = supabase
  .channel(channelTopic)
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'analysis_jobs', filter: `id=eq.${runId}` },
    (payload: { new?: RunRow }) => {
      if (cancelled || !payload?.new) return;
      applyRow(payload.new);
    },
  )
  .subscribe();          // ← no status callback: CHANNEL_ERROR / TIMED_OUT / CLOSED never observed
```

**`Results.tsx:463-478` (current, bare — the LIVE path per D-27):**

```ts
const channel = supabase
  .channel(`resume-updates-${id}`)
  .on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "resumes", filter: `id=eq.${id}` },
    async (payload) => { ... },
  )
  .subscribe();          // ← same gap
```

**The poll-fallback the callback must kick** — copy the *catch-up* semantics from
`useAnalysisRun.ts:341-393`. This is the machinery D-20 says already exists:

```ts
// 2) Poll get-analysis-run-status as the TRUE fallback (D-05).
const fetchStatus = async () => {
  const { data, error } = await invokeWithTimeout<RunRow>(
    'get-analysis-run-status', { body: { run_id: runId } }, 15000);
  ...
  const authoritativeNotFound = data?.code === NOT_FOUND_CODE;
  const transientEmpty = !data && error !== null;
  if (authoritativeNotFound || transientEmpty) {
    emptyPollStreakRef.current += 1;
    if (authoritativeNotFound || emptyPollStreakRef.current >= MAX_EMPTY_POLLS) clearTracking();
    return;
  }
  ...
  applyRow(data);
  if (isStopState(coerceState(data.state))) stopPolling();
};

// Immediate mount-recovery poll (catches a change that predates the channel).
void fetchStatus();
// Interval fallback (covers a missed realtime event).
pollTimerRef.current = setInterval(() => void fetchStatus(), DEFAULT_POLL_MS);
```

**Constants to reuse, not redefine** (`useAnalysisRun.ts:82-98`):

```ts
export const ANALYSIS_RUN_STORAGE_KEY = 'strivio.analysis.run_id';
const DEFAULT_POLL_MS = 2500;              // UI-SPEC D4's 2,500ms poll
const NOT_FOUND_CODE = 'FILE_NOT_FOUND';   // UI-SPEC R3's trigger
const MAX_EMPTY_POLLS = 3;
```

**Unique-topic hazard — do not regress it** (`useAnalysisRun.ts:100-117`). Any new channel this
phase opens must keep a per-instance-unique topic:

```ts
// supabase-js keys channels by topic and hands back the EXISTING, already-subscribed
// channel for a duplicate topic, so the second instance's `.on('postgres_changes', ...)`
// throws "cannot add callbacks after subscribe()" and, with no error boundary,
// black-screens the results view (D9-11).
let analysisRunChannelSeq = 0;
```

---

### `src/components/UniversalAnalyzing.tsx` (component, event-driven) — the Surface D rewrite

**Analog for the honest stage source:** `src/hooks/useResumeStream.ts:62-78`. Per D-27 this is
the **live** driver; the 11-state map is wired but dormant.

```ts
const STAGE_LABELS: Record<StreamStage, string> = {
  connecting: 'Connecting...',
  scoring: 'Evaluating your resume...',
  writing_summary: 'Writing your assessment...',
  analyzing_criteria: 'Analyzing each criterion...',
  writing_suggestions: 'Writing improvement recommendations...',
  complete: 'Analysis complete!',
  error: 'Analysis failed',
};

// Stage is derived from CONTENT ACTUALLY OBSERVED ON THE STREAM — this is the
// UI-SPEC D1 "Honest Progress Rule" in existing, shipped code.
function detectStage(text: string): StreamStage {
  if (text.includes('"suggestions"')) return 'writing_suggestions';
  if (text.includes('"criteria"')) return 'analyzing_criteria';
  if (text.includes('"summary"')) return 'writing_summary';
  if (text.includes('"overallScore"')) return 'scoring';
  return 'connecting';
}
```

**Analog for the dormant 11-state map:** `useAnalysisRun.ts:44-77` — the exact state names and
stop set UI-SPEC D2 keys off:

```ts
export type LifecycleState =
  | 'created' | 'validating_inputs' | 'reserving_merits' | 'extracting_data'
  | 'generating' | 'validating_output' | 'saving'
  | 'completed' | 'retryable_failed' | 'failed' | 'refunded';

/** States at which the run is no longer progressing (the hook stops here). */
const STOP_STATES: ReadonlySet<LifecycleState> = new Set([
  'completed', 'failed', 'refunded', 'retryable_failed',
]);
```

**The four D0 fabrications to delete** — verified at HEAD:

| Fabrication | HEAD location | Excerpt |
|---|---|---|
| ETA subtitle | `UniversalAnalyzing.tsx:33` | `subtitle = 'This usually takes about 20 seconds',` |
| Expected-duration default | `:27, :36` | `const DEFAULT_EXPECTED_MS = 25_000;` |
| Wall-clock progress curve | `:83-121` | `const target = MAX_PROGRESS_PRE_COMPLETE * (1 - Math.exp(-elapsed / tau));` |
| Timer-derived step index | `:112-116` | `const derived = Math.min(stepCount - 1, Math.floor((target / MAX_PROGRESS_PRE_COMPLETE) * stepCount)); setCurrentStep((prev) => Math.max(prev, derived));` |

**Behaviour to PRESERVE while rewriting** (`UniversalAnalyzing.tsx:52-70`) — the auto-lock and the
body-scroll save/restore. UI-SPEC F5 requires the restore also fire on `Continue in the background`:

```ts
const { lock, unlock } = useAnalysisLock();

// Auto-lock the global analysis lock so callers do not need to wire it
// manually. Mounting <UniversalAnalyzing isAnalyzing /> is sufficient.
useEffect(() => {
  if (!isAnalyzing) return;
  lock();
  return () => unlock();
}, [isAnalyzing, lock, unlock]);

// Body scroll lock while analysis is running.
useEffect(() => {
  if (!isAnalyzing) return;
  const prev = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return () => { document.body.style.overflow = prev; };
}, [isAnalyzing]);
```

**Refcount lock semantics — do not break** (`src/contexts/AnalysisLockContext.tsx:12-16`):

```ts
// Refcount semantics: lock()/unlock() are paired increments/decrements so
// concurrent locks (e.g., a stream-path overlay re-mounting while a queue-path
// polling overlay is also live) do not release the lock prematurely.
```

---

### `src/hooks/useSubmitGuard.ts` (hook, request-response) — the D-29 primitive

**Analog A — `src/hooks/useIdempotencyKey.ts` (the whole 34-line file).** It exists, is tested
(`useIdempotencyKey.test.ts`), and is imported by **no page**. Extend it rather than replace it.

```ts
/**
 * Returns a stable UUID per user-initiated submit. Retries of the SAME logical
 * submit (network retry, double-click, AbortController re-fire) reuse the SAME
 * UUID by NOT calling `regenerate()`. A new user click MUST call `regenerate()`
 * first to roll a fresh UUID (D-09).
 *
 * Contract:
 *   - Initial render: `key` is a fresh `crypto.randomUUID()` (RFC 4122 v4).
 *   - Re-render without `regenerate()`: same `key` returned (retry reuse).
 *   - `regenerate()`: rolls a new UUID, updates state, returns it synchronously.
 */
export function useIdempotencyKey(): { key: string; regenerate: () => string } {
  const [key, setKey] = useState<string>(() => crypto.randomUUID());
  const regenerate = useCallback(() => { const next = crypto.randomUUID(); setKey(next); return next; }, []);
  return { key, regenerate };
}
```

**Analog B — `src/pages/Onboarding.tsx:74-88`: the best in-repo submit-guard, and the semantics
the primitive must generalize.** It already carries the ref-held nonce, the in-flight guard, and
the terminal-release rule:

```ts
// in-flight is a no-op (hardens the disabled-button UI guard against duplicate analysis).
const submittingRef = useRef(false);
// first-attempt-reliability: the attemptNonce and the uploaded resume row are HELD across a
// same-page retry ... A re-submit of the SAME intent therefore reuses the server idempotency
// key (create_or_recover -> already_deducted -> charged exactly once) ... Both are released
// ONLY on a terminal outcome — completed ... or terminal-failed ... — so a genuinely new
// deliberate run legitimately charges again.
const attemptNonceRef = useRef<string | null>(null);
const getAttemptNonce = (): string => {
  if (!attemptNonceRef.current) attemptNonceRef.current = crypto.randomUUID();
  return attemptNonceRef.current;
};
```

**The four+two inline call sites to converge** (verified at HEAD):

| Site | Line | Shape |
|---|---|---|
| `src/pages/Upload.tsx` | `:281` | `const attemptNonce = crypto.randomUUID();` — fresh per submit |
| `src/pages/Onboarding.tsx` | `:86` | ref-held, released on terminal |
| `src/pages/LinkedInGrader.tsx` | `:522` | `const attemptNonce = crypto.randomUUID();` |
| `src/pages/RecruitingLens.tsx` | `:579` | `attemptNonceRef.current = crypto.randomUUID();` |
| `src/pages/CareerCompass.tsx` | `:254` | ref-held (`if (!attemptNonceRef.current) …`) |
| `src/hooks/useEliteRerun.ts` | `:189` | `const attemptNonce = crypto.randomUUID();` — the **deliberate re-run** boundary |

**Analog C — the server half the nonce feeds** (`supabase/functions/_shared/idempotency-key.ts:14-26`).
Read-only; it defines what the client may and may not send:

```ts
 * SECURITY CONTRACT (D-02 — the key is server-derived, never client-trusted):
 *   The frontend sends only a "new run" signal (which mints a fresh
 *   `attemptNonce`). The edge computes the key from the request's intent. A
 *   client-forged key must never be accepted ...
 *
 * CACHE-KEY-STABLE CONTRACT (Pitfall 8 / D-06):
 *   `inputIdentity` is an OPAQUE, caller-supplied stable content-identity ...
 *   It MUST NEVER be composed from a save-mutated field ...
```

---

### `src/components/platform/StaleBundleFallback.tsx` + `CapabilityGate.tsx` (components)

**Analog:** `src/components/AnalysisErrorBoundary.tsx`.

**Controlled-copy fallback with token-only styling** (`AnalysisErrorBoundary.tsx:73-101`) — note
the props-overridable defaults, the semantic tokens, and the two-CTA row. UI-SPEC Surface C
**locks** these two strings (`CLIENT_RENDER_FAILED`) — reuse, do not restate:

```tsx
render(): ReactNode {
  if (this.state.hasError) {
    const title = this.props.title ?? "We couldn't display this analysis";
    const description = this.props.description ??
      "Something went wrong showing your results. Your analysis may still be safe — refresh to reload it.";
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-foreground mb-2">{title}</h2>
          <p className="text-sm text-muted-foreground mb-6">{description}</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={this.handleRetry}
              className="px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              Try again
            </button>
            <button onClick={() => window.location.reload()}
              className="px-6 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-muted transition-colors">
              Refresh page
            </button>
          </div>
        </div>
      </div>
    );
  }
```

**Auto-recover-once + extension isolation** (`AnalysisErrorBoundary.tsx:47-71`) — the exact place
the `STALE_RELOADING` short-circuit must land (UI-SPEC E1: no fallback frame ever renders):

```tsx
componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
  logAnalysisError(error, {
    stage: this.props.stage ?? "render",
    runId: this.props.runId,
    resumeId: this.props.resumeId,
    tags: {
      boundary: "AnalysisErrorBoundary",
      componentStack: (errorInfo.componentStack ?? "").split("\n").slice(0, 4).join(" | "),
    },
  });

  // Isolate extension noise: an error injected by an extension is not our
  // defect. Recover once by remounting the subtree so analysis continues.
  if (isExtensionError(error) && !this.state.recoveryAttempted) {
    this.setState((s) => ({ hasError: false, recoveryAttempted: true, resetKey: s.resetKey + 1 }));
  }
}
```

`src/components/HomepageErrorBoundary.tsx` gets the identical `STALE_RELOADING` change.

---

### `playwright.config.ts` (config) + `e2e/cross-device/*.spec.ts`

**Analog:** `playwright.config.ts:38-45` (the existing `setup` + `chromium` projects) and
`e2e/auth.setup.ts` (the one storageState all projects share).

**Projects shape to extend** (`playwright.config.ts:26-45`):

```ts
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  globalSetup: './e2e/global-setup.ts',
  timeout: 120_000,
  use: { baseURL: 'http://localhost:8080', trace: 'on-first-retry' },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' },
    },
  ],
  webServer: { command: 'npm run build && npm run preview', url: 'http://localhost:8080', ... },
});
```

**The storageState seam all 5 projects reuse** (`e2e/auth.setup.ts:22-24, 60`) — engine-agnostic
JSON, so one chromium setup run seeds firefox/webkit/mobile too:

```ts
const AUTH_FILE = '.auth/user.json';
setup('authenticate', async ({ page }) => { ... await page.context().storageState({ path: AUTH_FILE }); });
```

**Spec header convention** (`e2e/two-tab-concurrency.spec.ts:1-52`) — a Phase-3 `@xdev` spec is
expected to open with THE GAP THIS CLOSES / THE MONEY RISK / DETERMINISM / DATA / SECURITY. Copy
the four operational disclosures verbatim in intent:

```ts
 * DETERMINISM (T-09-06-E): AI is stubbed SERVER-SIDE via the existing `AI_TEST_MODE` seam
 * on the TEST project's edge functions ... Zero live Anthropic calls. A flaky test in a
 * blocking gate is how gates get bypassed.
 *
 * DATA (D-15): a per-run UNIQUE synthetic document (`fixtures/make-unique-resume.ts`) ...
 * No real user data, ever.
 *
 * SECURITY: the service-role key is read in the NODE process only ... and is NEVER passed
 * to page.evaluate / addInitScript / any browser-visible surface.
```

**Existing helpers to reuse, not re-author** (`two-tab-concurrency.spec.ts:53-65`):

```ts
import { E2E_TEST_EMAIL } from './global-setup';
import { makeUniqueResumePdf } from './fixtures/make-unique-resume';
import { mockValidDocumentResponse } from './helpers/mock-document-validator';
import {
  adminClient, analyzedResumeCountForFile, diagnoseLiveAnthropic,
  meritDebitKeyMultiplicity, requireTestUserId,
  resetAnalyzeResumeRateLimit, seedMerits,
} from './helpers/test-user';
```

**Do NOT touch `playwright.prod.config.ts`'s project list** — its own header states why
(`playwright.prod.config.ts:14-23`):

```ts
 * SAFETY INVARIANTS (do not relax without understanding the cost):
 *   - retries: 0        — a retry would re-run a real analysis, creating a
 *                         SECOND job and a SECOND merit charge on a real account.
 *   - workers: 1        — serial execution keeps job/charge attribution unambiguous
 *   - fullyParallel: false
```

---

### `src/components/ui/textarea.tsx` and `src/components/ui/select.tsx` (components)

**Analog:** `src/components/ui/input.tsx:11` — the *already-correct* file. One-token change each.

```tsx
// input.tsx:11 — CORRECT at HEAD. Preserve. Note `text-base` + `md:text-sm`.
"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 ... disabled:opacity-50 md:text-sm",
```

```tsx
// textarea.tsx:11 — NON-COMPLIANT at HEAD (bare `text-sm`, 14px → iOS auto-zoom).
"flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background ...",
```

```tsx
// select.tsx:20 (SelectTrigger) — NON-COMPLIANT at HEAD (bare `text-sm`).
"flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background ... [&>span]:line-clamp-1",
```

---

### `src/index.css` (style) — the `dvh` utilities

**Analog:** `src/index.css:97-135` — the existing `@layer utilities` block. RESEARCH Pitfall 6
requires ONE rule emitting both declarations in source order, not two Tailwind classes.

```css
@layer utilities {
  .glass-effect {
    background: hsl(0 0% 5% / 0.7);
    backdrop-filter: blur(12px);
    border: 1px solid hsl(0 0% 100% / 0.1);
  }
  ...
}
```

---

### `src/main.tsx` (entry)

**Analog:** itself. The existing file already encodes the "install before anything else, and say
why" convention the boot flag and diagnostics handlers must join:

```tsx
// Install the Map.getOrInsertComputed polyfill FIRST — before any pdf.js code
// (main-thread or worker config) is evaluated. pdf.js relies on this method and
// throws "getOrInsertComputed is not a function" without it. See the polyfill
// module header for the full rationale.
import "./lib/polyfills/map-get-or-insert";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Configure PDF.js worker globally before any component mounts
import "./lib/pdf-worker";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>
);
```

UI-SPEC A rule 2: `window.__strivoBooted = true` + `#browser-gate` removal go immediately after
`createRoot(...).render(...)`.

---

### `src/lib/platform/build-id.ts` and `capabilities.ts` — the fail-closed accessor pattern

**Analog:** `src/config/feature-flags.ts:22-44`. Every environment-derived boolean in this repo is
a named exported function with an explicit fail-closed rationale in its docblock:

```ts
/**
 * Same fail-closed semantics as isInterviewPrepEnabled: only the exact lowercase
 * string 'true' enables. Anything else — undefined, '', 'false', 'True', 'TRUE',
 * '1', 'yes', 'on', boolean true — returns false. Do NOT use
 * import.meta.env.MODE / PROD here (both equal 'production' for every vite build,
 * including preview/staging).
 */
export function isAnalysisLifecycleEnabled(): boolean {
  return import.meta.env.VITE_FEATURE_ANALYSIS_LIFECYCLE === 'true';
}
```

**Do not flip this flag (D-27).** `capabilities.ts` and the Surface D stage mapping must consume
`useResumeStream`'s `STAGE_LABELS` as the live driver, with the 11-state map wired but dormant.

---

## Shared Patterns

### 1. Three-place edge-function registration (Phase 01.1 `validate-document` precedent)

**Apply to:** `supabase/functions/log-client-diagnostic/` — all three, in the same commit.
Omitting any one fails **silently**.

**a. `supabase/config.toml:92-95`:**

```toml
# Gateway JWT verification is disabled so application-level requireAuth can
# return the repository's stable 401 envelope. This endpoint is not anonymous.
[functions.validate-document]
verify_jwt = false
```

> For diagnostics the comment must change: the endpoint **is** partly anonymous by design
> (pre-auth browser-gate failures). Say that explicitly rather than copying the wording.

**b. `scripts/deploy.ps1:36-75` — the `$Functions` array (38 entries at HEAD; `validate-document`
is the last):**

```powershell
  [string[]]$Functions = @(
    ...
    "recruiting-lens"
    "validate-document"
  )
```

Deployment loop (`deploy.ps1:157-161`) — every function ships `--no-verify-jwt`:

```powershell
foreach ($fn in $Functions) {
  Write-Host "Deploying $fn to $envLower..."
  supabase functions deploy $fn --no-verify-jwt --use-api
}
```

**c. `supabase/functions/deno.json` `test:ci` — an EXPLICIT FILE LIST, not a directory walk.**
The tail of the current list ends `... _shared/document-validation.test.ts
validate-document/index.test.ts`. **An unlisted test runs in no lane at all** (RESEARCH Pitfall 9).

---

### 2. `withCors` + `jsonError` — the mandatory CORS chokepoint

**Source:** `supabase/functions/_shared/cors.ts:138-216`
**Apply to:** every new edge function. `_shared/cors-audit.test.ts` is a drift guard that **will
fail** on hand-written headers.

```ts
/**
 * Wraps a function handler and guarantees CORS headers on every exit:
 * - OPTIONS → origin-aware preflight (handler never runs).
 * - success Response → CORS overlaid (streaming `ReadableStream` body passed through unbuffered).
 * - thrown Response (e.g. a bare 401 from auth) → CORS merged, returned as-is.
 * - thrown Error → CORS-tagged 500 via jsonError with a generic message (no internal detail leak, D-13).
 */
export async function withCors(
  req: Request, type: CorsType,
  handler: () => Promise<Response> | Response,
  opts?: { extraHeaders?: string },
): Promise<Response> {
  if (req.method === 'OPTIONS') return handleOptionsRequest({ type, extraHeaders: opts?.extraHeaders }, req);
  const cors = corsCore(type, req, opts?.extraHeaders);
  try {
    return mergeCors(await handler(), cors);
  } catch (e) {
    if (e instanceof Response) return mergeCors(e, cors);
    return jsonError(req, 500, 'internal_error', { message: 'Internal server error', code: 'INTERNAL_ERROR', retryable: false });
  }
}
```

---

### 3. `checkRateLimitByKey` — abuse control for an identity-optional endpoint

**Source:** `supabase/functions/_shared/rate-limiter.ts:115-152`
**Apply to:** `log-client-diagnostic` (a per-user `checkRateLimit` is wrong — the caller may be
anonymous). **Note the fail-open** on DB error, which is the correct posture for diagnostics:

```ts
/**
 * Checks and increments the rate limit counter for an arbitrary key.
 * Used for auth-adjacent endpoints where user identity may not be verified yet
 * (e.g., rate-limit by IP or request identifier).
 */
export async function checkRateLimitByKey(
  key: string, limit: number, windowSecs: number,
): Promise<RateLimitResult> {
  const win = windowStart(windowSecs);
  const { data, error } = await getServiceClient().rpc('increment_rate_limit', {
    p_key: key, p_window_start: win,
  });
  if (error) {
    log.info('Rate limit DB error — failing open', { key, error: error.message });
    return { allowed: true, retryAfterSeconds: 0, remaining: limit };
  }
  const counter = data as number;
  const allowed = counter <= limit;
  if (!allowed) log.warn('Rate limit exceeded (by key)', { key, counter, limit });
  return { allowed, retryAfterSeconds: retryAfterSeconds(windowSecs), remaining: Math.max(0, limit - counter) };
}
```

> `createRateLimitResponse()` (`rate-limiter.ts:162-178`) returns a **429**. RESEARCH Pattern 5
> requires the diagnostics endpoint always return **204** and never leak the store/drop outcome —
> so a rate-limited beacon is silently dropped, not 429'd. Call this out as a deliberate divergence.

---

### 4. Never-throws diagnostics emit

**Sources:** `src/lib/analysis-error-log.ts:90-138` (client) and
`supabase/functions/_shared/ai-telemetry.ts:9-11` (server contract wording).
**Apply to:** `client-diagnostics.ts`, `install-global-handlers.ts`, `stale-bundle.ts`.

Four guarantees (RESEARCH Pattern 5) — the planner should make each an acceptance criterion:
1. never `await`ed in a user code path,
2. whole emit body wrapped in a swallowing `try/catch`,
3. per-session emit cap (recommend 20) so a render loop cannot flood,
4. a single in-flight slot — drop rather than queue unboundedly.

---

### 5. Fail-closed feature/environment reads

**Source:** `src/config/feature-flags.ts:36-44`
**Apply to:** `build-id.ts`, `capabilities.ts` tier resolution, any new `VITE_*` read.
Strict `=== 'true'`; never `import.meta.env.MODE` / `PROD`.

---

### 6. Static-source guard as the enforcement mechanism

**Source:** `src/test/security/xss-sink-guard.test.ts` (+ `phase9-pii-guard.test.ts`)
**Apply to:** all five Phase-3 source guards. Auto-discovered by the `src/**/*.test.ts` glob — no
registration step, so nobody can drop it. Every guard needs the non-empty-walk assertion **and** a
positive assertion that its allowlisted target still exists.

---

### 7. Anti-vacuity rule for every new gate lane

**Source:** `RESEARCH.md` § *Validation Checkpoints*, citing TESTING-STRATEGY.md's 09-09 lesson.
**Apply to:** every plan that adds a test lane.

- Every new gate lane must be **proven able to fail** by mutation, not by observing green.
- The diagnostics assertion must read a **durable row delta** scoped to this run's `event_id`,
  never a console message.
- The stale-bundle assertion must observe **absence** (`MutationObserver` proving no
  `[role="alert"]` ever attached), not merely a final screenshot.

---

## No Analog Found

Files with no close match at HEAD. The planner should use `03-RESEARCH.md` § *Code Examples* and
`03-UI-SPEC.md` directly, and treat these as the highest-risk authoring tasks.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `index.html` (ES5 pre-bundle guard, Surface A) | config/entry | — | No inline-script precedent anywhere in the repo; ES5-only, no imports, no tokens, and the **only** sanctioned hardcoded-color surface (UI-SPEC § *The one hardcoded-color exemption*). Use RESEARCH's "ES5 guard — hard limits" table as the authority; enforce with a new static-source syntax guard modelled on `xss-sink-guard.test.ts`. |
| `public/supported-browsers.html` | static asset | request-response | `public/` contains only images, `robots.txt`, `sitemap.xml`, `placeholder.svg` — no HTML page. Must **not** be an SPA route (UI-SPEC A rule 1); depends on the `vercel.json` rewrite exclusion. |
| `vercel.json` (`/assets/*` exclusion + `no-store` header) | config | — | 9-line file with a single catch-all rewrite and **no `headers` block** to copy. RESEARCH Open Question 3 flags the exact syntax as **LOW confidence / unverified** — verify against current Vercel docs at plan time. Non-blocking: `vite:preloadError` detects regardless. |
| `vite.config.ts` (`define` + `version.json` emit plugin) | config | — | No inline Vite plugin exists at HEAD (`plugins: [react()]` only; `build.rollupOptions.output.manualChunks` at `:34-48` is the sole build customization). Use RESEARCH's verified `resolveBuildId()` + `generateBundle` snippet. |
| `src/lib/supabaseClient.ts` (delete the `storage` override) | service | — | The correct behaviour lives in `@supabase/auth-js` (`GoTrueClient.js:222-233` + `helpers.js:53-83`), not in this repo. The in-repo *contrast* precedent is `realtime-js`'s `resolveSessionStorage()`. **Delete, do not replace** — RESEARCH is explicit that a hand-rolled adapter is strictly worse. Note `supabaseClient.ts:16` also evaluates `localStorage` at module scope, which is the white-screen path. |

---

## Metadata

**Analog search scope:** `src/lib/`, `src/lib/polyfills/`, `src/hooks/`, `src/components/`,
`src/components/ui/`, `src/config/`, `src/pages/`, `src/test/security/`, `src/lib/__tests__/`,
`supabase/functions/_shared/`, `supabase/functions/validate-document/`, `supabase/migrations/`
(+ `rollback/`), `e2e/`, `e2e-prod/`, `scripts/`, repo-root config (`index.html`, `vite.config.ts`,
`vercel.json`, `playwright*.config.ts`, `package.json`, `supabase/config.toml`,
`supabase/functions/deno.json`).

**Files read (analogs):** 32
**Pattern extraction date:** 2026-07-27

**Concurrency guard honoured:** `ai_call_telemetry.sql`, its rollback, and
`_shared/ai-telemetry.ts` were read **read-only** as templates. D-12 requires zero edits to Phase
02 artifacts. `.planning/ROADMAP.md`, `.planning/STATE.md`, and the `01-1-*` / `01.1-*` /
`02-ai-token-cost-optimization` phase directories were not opened.

**Standing HEAD hazards worth restating in every plan that touches them:**
- `supabase/functions/deno.json` `test:ci` is an explicit file list — an unlisted test runs nowhere.
- `scripts/deploy.ps1 $Functions` — a function absent from that array is never deployed, silently.
- `useAnalysisRun.ts` channel topics must stay per-instance unique (`analysisRunChannelSeq`).
- `VITE_FEATURE_ANALYSIS_LIFECYCLE` stays OFF (D-27). Surface D's live driver is
  `useResumeStream.STAGE_LABELS`.

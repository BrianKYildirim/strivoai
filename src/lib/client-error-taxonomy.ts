/**
 * client-error-taxonomy.ts — UI-SPEC Surface C (XRUN-06, XDEV-08).
 *
 * THE ONE SOURCE of every client-side user-facing failure string. Nine codes,
 * closed and exhaustive. A component that needs to tell a user something went
 * wrong reads it from here; it never renders `error.message`, never renders a
 * response body, never renders a stack.
 *
 * ── SIBLING OF THE SERVER TAXONOMY, NOT A REPLACEMENT ───────────────────────
 * `src/lib/analysisError.ts` owns the FROZEN 13-code SERVER taxonomy
 * (`ANALYSIS_ERROR_CODES`) and the `getSafeStreamErrorMessage()` chokepoint.
 * That file is untouched by Phase 3 and must stay that way — this module adds a
 * SIBLING table in the same shape for the transport and platform failures that
 * never reach the server at all (offline, a stale bundle, blocked storage, an
 * unsupported engine, a render crash).
 *
 * ── AND A DIFFERENT VOCABULARY FROM THE DIAGNOSTIC CATEGORIES ───────────────
 * `src/lib/diagnostics/categories.ts` owns a frozen set of THIRTEEN
 * `DIAGNOSTIC_CATEGORIES`. Those are what we tell OURSELVES about a failure —
 * they are byte-mirrored with the edge function's allowlist and never rendered.
 * The nine codes here are what we tell the USER. The two sets are deliberately
 * different sizes and are NOT interchangeable: the diagnostic set is finer
 * (`poll_failed` and `stream_failed` are separately answerable in a query, but
 * a user cannot act on the difference), and it carries members that have no
 * honest user-facing message at all. `CLIENT_CODE_FOR_DIAGNOSTIC_CATEGORY`
 * below is the TOTAL, one-way collapse of the 13 onto the 9; there is no
 * inverse, and none is wanted.
 *
 * ── THE SIX TAXONOMY RULES (UI-SPEC § Surface C) ────────────────────────────
 *  1. FAIL CLOSED. `mapClientError()`'s default branch is `CLIENT_UNEXPECTED`.
 *     An unrecognised condition NEVER falls through to raw text.
 *  2. RETRYABLE IS A PROPERTY OF THE CODE, not of the caller. A `Try again`
 *     primary renders only when `retryable === true`, so a terminal condition
 *     never offers a retry that will deterministically fail again.
 *  3. ONE ERROR SURFACE AT A TIME. A client code and a server code must never
 *     render simultaneously — SERVER TERMINAL STATE WINS. Renderers consult
 *     `isClientSurfaceSuppressed()` before painting.
 *  4. `CLIENT_REALTIME_DEGRADED` IS NOT AN ERROR. `severity: 'informational'`:
 *     no error state, nothing destructive, no toast, nothing blocked.
 *  5. MERIT TRUTH IN COPY — NEVER GUESS. A failure that provably happened
 *     BEFORE a Merit reservation says `no credits were used`. A failure that
 *     happened after it, or at an indeterminate moment, says NOTHING about
 *     credits: the server refund path owns that message. `meritPhase` records
 *     which, and the table test asserts the partition.
 *  6. Every string here is exported from this frozen table and is machine
 *     checked against the UI-SPEC leak guard by
 *     `__tests__/client-error-taxonomy.test.ts`.
 *
 * Copy is transcribed CHARACTER FOR CHARACTER from
 * `.planning/phases/03-cross-device-reliability-and-compatibility/03-UI-SPEC.md`
 * § Surface C. Do not "improve" it here — the spec is the contract, and the test
 * recomposes `heading` + `body` back into the spec's single-string rows to prove
 * the split lost nothing.
 */
import { CAPABILITY_COPY } from './platform/capability-copy';
import { DIAGNOSTIC_CATEGORIES, type DiagnosticCategory } from './diagnostics/categories';
import { isStaleReloading } from './platform/stale-bundle';

// ── The leak guard (UI-SPEC § Leak guard, XRUN-06) ───────────────────────────

/**
 * Rendered user-facing text must NOT match this. Transcribed from UI-SPEC
 * § Leak guard and exported from here so the vitest table test, the boundary
 * component tests and the five-project Playwright spec all assert the SAME
 * pattern — a leak guard that each caller retypes is a leak guard that drifts.
 *
 * Not a module-level `RegExp` constant used directly with `.test()`: the `g`
 * flag is deliberately absent so there is no `lastIndex` state to leak between
 * callers.
 */
export const LEAK_GUARD_PATTERN =
  /\b(TypeError|ReferenceError|SyntaxError|RangeError|Cannot read|is not a function|is not defined|undefined|NaN|PGRST\d*|22P02|23505|42501|ECONN|ETIMEDOUT|Deno|node_modules|chunk-[A-Za-z0-9]+\.js|at\s+\S+:\d+:\d+)\b/i;

/** True when `text` contains something XRUN-06 forbids showing a user. */
export function containsLeak(text: string): boolean {
  return LEAK_GUARD_PATTERN.test(text);
}

// UI-SPEC Surface G. Checkout initiation failures are a narrower presentation
// contract than the closed nine-code client taxonomy below, but the rendered
// sentence must still come from one frozen source rather than a provider error.
export const CHECKOUT_FAILURE_COPY = Object.freeze({
  startFailed: "We couldn't start checkout. Please try again.",
});

export const CHECKOUT_PENDING_TIMEOUT_MS = 15000;

// ── Codes ────────────────────────────────────────────────────────────────────

/** The complete, closed set of 9 codes (stable order) — for exhaustive tests. */
export const CLIENT_ERROR_CODES = Object.freeze([
  'CLIENT_OFFLINE',
  'CLIENT_REALTIME_DEGRADED',
  'CLIENT_CHUNK_LOAD_FAILED',
  'CLIENT_STORAGE_BLOCKED',
  'CLIENT_BROWSER_UNSUPPORTED',
  'CLIENT_SESSION_EXPIRED',
  'CLIENT_UPLOAD_FAILED',
  'CLIENT_RENDER_FAILED',
  'CLIENT_UNEXPECTED',
] as const);

export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];

/** Fail-closed default (rule 1). */
export const DEFAULT_CLIENT_ERROR_CODE: ClientErrorCode = 'CLIENT_UNEXPECTED';

const CLIENT_ERROR_CODE_SET: ReadonlySet<string> = new Set<string>(CLIENT_ERROR_CODES);

// ── Shape ────────────────────────────────────────────────────────────────────

/**
 * Which credit claim the copy is ALLOWED to make (rule 5).
 *  - `pre-reservation`  — provably before any Merit was reserved. MUST say so.
 *  - `post-reservation` — a run was already reserved. MUST stay silent; the
 *                         server refund path owns that sentence.
 *  - `indeterminate`    — the client cannot know which side it fell on. MUST
 *                         stay silent. Never guess.
 */
export type MeritPhase = 'pre-reservation' | 'post-reservation' | 'indeterminate';

/** Whether the code is an error at all (rule 4). */
export type ClientErrorSeverity = 'error' | 'informational';

/** How much of the viewport the treatment owns. */
export type ClientErrorPlacement = 'note' | 'inline' | 'card' | 'full-page' | 'surface-b';

/**
 * WHAT a control does, decided by the TABLE rather than inferred from its label
 * at the call site. A renderer that string-matched `'Reload Strivo'` to pick
 * `window.location.reload()` would silently change behaviour the day the copy
 * is reworded; this makes the wiring survive a copy edit.
 */
export type ClientErrorActionKind = 'retry' | 'reload' | 'sign-in' | 'supported-browsers';

export interface ClientErrorAction {
  label: string;
  kind: ClientErrorActionKind;
}

export interface ClientErrorAffordance {
  /** The one primary CTA, or `null` when the code offers no action. */
  primary: ClientErrorAction | null;
  /** A secondary button, or `null`. */
  secondary: ClientErrorAction | null;
  /** A supporting link, or `null`. */
  link: ClientErrorAction | null;
}

/** UI-SPEC § Copywriting Contract — the shared secondary link. */
const SUPPORTED_BROWSERS_ACTION: ClientErrorAction = Object.freeze({
  label: CAPABILITY_COPY.supportedBrowsersAction,
  kind: 'supported-browsers',
});

export interface ClientErrorVisual {
  /** Semantic token surface class. Never a hardcoded palette colour. */
  surface: string;
  /** Lucide icon name. Colour is never the sole cue — text + icon, always. */
  icon: string;
  /** Whether `destructive` may be used at all for this code. */
  destructiveAllowed: boolean;
  placement: ClientErrorPlacement;
}

export interface ClientErrorDisplay {
  /** Heading line. Rendered by card / full-page treatments. */
  heading: string;
  /** Body line. The only sentence a `note` / `inline` treatment renders. */
  body: string;
  /** Rule 2 — a property of the code. */
  retryable: boolean;
  /** Rule 4 — `informational` codes are not errors. */
  severity: ClientErrorSeverity;
  /** Rule 4 — an informational code may never fire a toast. */
  toastPermitted: boolean;
  /** Rule 4 — an informational code may never block a surface. */
  blocking: boolean;
  /** Rule 5 — which credit claim, if any, the copy is allowed to make. */
  meritPhase: MeritPhase;
  affordance: ClientErrorAffordance;
  visual: ClientErrorVisual;
}

// ── The frozen table ─────────────────────────────────────────────────────────

const CLIENT_ERROR_DISPLAY: Readonly<Record<ClientErrorCode, ClientErrorDisplay>> = Object.freeze({
  CLIENT_OFFLINE: {
    heading: "You're offline",
    body: "We'll keep trying — your analysis is safe.",
    // Automatic: the `online` event drives the retry. The visible `Retry now` is
    // SECONDARY precisely because the user is not required to press anything.
    retryable: true,
    severity: 'error',
    toastPermitted: false,
    blocking: false,
    // Offline can strike on either side of a reservation, so the copy says
    // nothing about credits (rule 5 — never guess).
    meritPhase: 'indeterminate',
    affordance: {
      primary: null,
      secondary: { label: 'Retry now', kind: 'retry' },
      link: null,
    },
    visual: {
      surface: 'bg-secondary',
      icon: 'WifiOff',
      destructiveAllowed: false,
      placement: 'inline',
    },
  },

  CLIENT_REALTIME_DEGRADED: {
    heading: "Live updates aren't available right now",
    body: "We're checking for your result every few seconds.",
    // NOT an error and NOT retryable: the system already recovered by falling
    // back to polling. Offering a retry would invite the user to break a
    // working recovery.
    retryable: false,
    severity: 'informational',
    toastPermitted: false,
    blocking: false,
    // Only ever reached while a run is in flight, i.e. after reservation.
    meritPhase: 'post-reservation',
    affordance: { primary: null, secondary: null, link: null },
    visual: {
      surface: 'text-muted-foreground',
      icon: 'RefreshCw',
      destructiveAllowed: false,
      placement: 'note',
    },
  },

  CLIENT_CHUNK_LOAD_FAILED: {
    heading: "Couldn't finish updating Strivo",
    body: 'Reload once more, or close this tab and open strivoai.net again.',
    retryable: true,
    severity: 'error',
    toastPermitted: false,
    blocking: true,
    // A bundle can fail to load at any moment; the client cannot know whether a
    // run was already reserved. Silence, not a guess.
    meritPhase: 'indeterminate',
    affordance: {
      primary: { label: 'Reload Strivo', kind: 'reload' },
      secondary: null,
      link: null,
    },
    visual: {
      surface: 'bg-background',
      icon: 'RefreshCcw',
      destructiveAllowed: true,
      placement: 'full-page',
    },
  },

  CLIENT_STORAGE_BLOCKED: {
    heading: "Strivo can't save your session in this browser",
    body:
      'Turn off private browsing or allow site data for strivoai.net, then sign in again.',
    // TERMINAL until the user changes a browser setting. A retry would fail
    // deterministically, so no `Try again` primary is offered (rule 2).
    retryable: false,
    severity: 'error',
    toastPermitted: false,
    blocking: false,
    // An authentication-surface condition; no run exists, so no credit claim.
    meritPhase: 'indeterminate',
    affordance: {
      primary: { label: 'Sign in', kind: 'sign-in' },
      secondary: null,
      link: SUPPORTED_BROWSERS_ACTION,
    },
    visual: {
      surface: 'bg-card',
      icon: 'ShieldAlert',
      destructiveAllowed: false,
      placement: 'card',
    },
  },

  CLIENT_BROWSER_UNSUPPORTED: {
    // UI-SPEC: "Uses Surface B copy verbatim (B2 / B3)". REFERENCED, never
    // restated — `capability-copy.ts` is the single owner of Surface B's strings
    // and `capabilities.test.ts` already guards them. B3 (checkout) is the
    // sibling pair on the same table for the checkout entry point.
    heading: CAPABILITY_COPY.analysisHeading,
    body: CAPABILITY_COPY.analysisBody,
    retryable: false,
    severity: 'error',
    toastPermitted: false,
    blocking: true,
    meritPhase: 'indeterminate',
    affordance: {
      primary: null,
      secondary: null,
      link: SUPPORTED_BROWSERS_ACTION,
    },
    visual: {
      surface: 'bg-card',
      icon: 'MonitorX',
      destructiveAllowed: false,
      placement: 'surface-b',
    },
  },

  CLIENT_SESSION_EXPIRED: {
    // The existing LOCKED string: `getSafeStreamErrorMessage('Not authenticated')`
    // returns "Your session expired. Please sign in and try again." The table
    // test recomposes heading + body and asserts byte-identity against that
    // function, so the two surfaces cannot drift apart.
    heading: 'Your session expired',
    body: 'Please sign in and try again.',
    retryable: false,
    severity: 'error',
    toastPermitted: false,
    blocking: false,
    meritPhase: 'indeterminate',
    affordance: {
      primary: { label: 'Sign in', kind: 'sign-in' },
      secondary: null,
      link: null,
    },
    visual: {
      surface: 'bg-card',
      icon: 'LogIn',
      destructiveAllowed: false,
      placement: 'card',
    },
  },

  CLIENT_UPLOAD_FAILED: {
    heading: "We couldn't upload your file",
    // THE one credit claim in this table, and it is true by construction: an
    // upload cannot fail after a reservation, because the reservation happens
    // server-side once the file is already there.
    body: 'Check your connection and try again — no credits were used.',
    retryable: true,
    severity: 'error',
    toastPermitted: false,
    blocking: false,
    meritPhase: 'pre-reservation',
    affordance: {
      primary: { label: 'Try again', kind: 'retry' },
      secondary: null,
      link: null,
    },
    visual: {
      surface: 'text-destructive',
      icon: 'AlertCircle',
      destructiveAllowed: true,
      placement: 'inline',
    },
  },

  CLIENT_RENDER_FAILED: {
    // The two LOCKED `AnalysisErrorBoundary` strings, byte-identical to what
    // shipped. Only their SOURCE moved into this table.
    heading: "We couldn't display this analysis",
    body:
      'Something went wrong showing your results. Your analysis may still be safe — refresh to reload it.',
    retryable: true,
    severity: 'error',
    toastPermitted: false,
    blocking: true,
    // The run itself may well have completed and been charged; the boundary is a
    // DISPLAY failure. Saying anything about credits here would be a guess.
    meritPhase: 'post-reservation',
    affordance: {
      primary: { label: 'Try again', kind: 'retry' },
      secondary: { label: 'Refresh page', kind: 'reload' },
      link: null,
    },
    visual: {
      surface: 'bg-background',
      icon: 'AlertTriangle',
      destructiveAllowed: false,
      placement: 'full-page',
    },
  },

  CLIENT_UNEXPECTED: {
    heading: "Something didn't load correctly",
    body: 'Reload the page to continue — your saved work is unaffected.',
    retryable: true,
    severity: 'error',
    toastPermitted: false,
    blocking: true,
    // The fail-closed default. By definition we do not know what happened, so
    // rule 5 forbids any credit claim at all.
    meritPhase: 'indeterminate',
    affordance: {
      primary: { label: 'Reload Strivo', kind: 'reload' },
      secondary: null,
      link: null,
    },
    visual: {
      surface: 'bg-card',
      icon: 'AlertTriangle',
      destructiveAllowed: true,
      placement: 'card',
    },
  },
});

/**
 * The UI-SPEC § Surface C rows that are written as ONE sentence pair. Each is
 * the verbatim spec string; the table test recomposes `heading + '. ' + body`
 * and asserts equality, so splitting a row for rendering cannot silently
 * reword it.
 *
 * `CLIENT_BROWSER_UNSUPPORTED` and `CLIENT_RENDER_FAILED` are absent on
 * purpose — the spec defines them by REFERENCE to strings owned elsewhere
 * (Surface B copy and the locked boundary copy), and the test asserts those
 * identities directly instead.
 */
export const SURFACE_C_VERBATIM: Readonly<
  Partial<Record<ClientErrorCode, string>>
> = Object.freeze({
  CLIENT_OFFLINE: "You're offline. We'll keep trying — your analysis is safe.",
  CLIENT_REALTIME_DEGRADED:
    "Live updates aren't available right now. We're checking for your result every few seconds.",
  CLIENT_CHUNK_LOAD_FAILED:
    "Couldn't finish updating Strivo. Reload once more, or close this tab and open strivoai.net again.",
  CLIENT_STORAGE_BLOCKED:
    "Strivo can't save your session in this browser. Turn off private browsing or allow site data for strivoai.net, then sign in again.",
  CLIENT_SESSION_EXPIRED: 'Your session expired. Please sign in and try again.',
  CLIENT_UPLOAD_FAILED:
    "We couldn't upload your file. Check your connection and try again — no credits were used.",
  CLIENT_UNEXPECTED:
    "Something didn't load correctly. Reload the page to continue — your saved work is unaffected.",
});

// ── Accessors ────────────────────────────────────────────────────────────────

/**
 * THE accessor. No component may inline a user-facing failure string; it reads
 * one from here. Total by type, and fail-closed at runtime for a value that
 * crossed a type boundary (a persisted code, a query param, an older bundle).
 */
export function getClientErrorCopy(code: ClientErrorCode): ClientErrorDisplay {
  return CLIENT_ERROR_DISPLAY[code] ?? CLIENT_ERROR_DISPLAY[DEFAULT_CLIENT_ERROR_CODE];
}

// ── The 13 → 9 collapse ──────────────────────────────────────────────────────

/**
 * TOTAL, one-way projection of the 03-06 diagnostic categories onto the user
 * vocabulary. Total by construction so that adding a diagnostic category
 * without deciding what the user is told is a TYPE error, not a silent
 * `undefined` rendered into a heading.
 *
 * Several categories collapse onto `CLIENT_UNEXPECTED` deliberately: they are
 * answerable in a diagnostics query but there is no honest, actionable sentence
 * that distinguishes them for a user, and inventing one would be worse than the
 * fail-closed default. `CLIENT_OFFLINE` has no pre-image at all — being offline
 * is a connectivity state, not a failure worth a diagnostics row.
 */
export const CLIENT_CODE_FOR_DIAGNOSTIC_CATEGORY: Readonly<
  Record<DiagnosticCategory, ClientErrorCode>
> = Object.freeze({
  boot_failure: 'CLIENT_UNEXPECTED',
  capability_blocked: 'CLIENT_BROWSER_UNSUPPORTED',
  chunk_load_failed: 'CLIENT_CHUNK_LOAD_FAILED',
  storage_blocked: 'CLIENT_STORAGE_BLOCKED',
  session_expired: 'CLIENT_SESSION_EXPIRED',
  upload_failed: 'CLIENT_UPLOAD_FAILED',
  // No user-visible difference from any other mid-run failure, and the SERVER
  // taxonomy owns the specific copy when the failure reached it.
  extraction_failed: 'CLIENT_UNEXPECTED',
  stream_failed: 'CLIENT_UNEXPECTED',
  realtime_degraded: 'CLIENT_REALTIME_DEGRADED',
  poll_failed: 'CLIENT_UNEXPECTED',
  render_failed: 'CLIENT_RENDER_FAILED',
  checkout_failed: 'CLIENT_UNEXPECTED',
  unexpected: 'CLIENT_UNEXPECTED',
});

// ── The mapper (rule 1 — fail closed) ────────────────────────────────────────

/**
 * Dynamic-import / chunk failures, by the shapes the three engines produce.
 * Matched against `error.name` and `error.message` for CLASSIFICATION ONLY —
 * the matched text is never returned, never stored and never rendered. That is
 * the same posture as `classifyScriptOrigin()`: reading a string to pick an
 * enum member is safe; returning it is the leak.
 */
const CHUNK_FAILURE_SIGNALS: readonly RegExp[] = [
  /ChunkLoadError/i,
  /Loading chunk \d+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
];

/**
 * Maps an arbitrary client condition onto exactly one user-facing code.
 *
 * Accepts a `ClientErrorCode` (passthrough), a `DiagnosticCategory` (collapsed
 * via the table above), or a thrown value of any kind. EVERY other input —
 * `undefined`, `null`, a number, a plain string, a non-Error throw, a novel
 * `Error` subclass — returns `CLIENT_UNEXPECTED`.
 *
 * This function returns a CODE, never a message. There is no branch that can
 * return caller-supplied text, which is what makes XRUN-06 a structural
 * property of the client rather than a review checklist item.
 */
export function mapClientError(condition: unknown): ClientErrorCode {
  try {
    if (typeof condition === 'string') {
      if (CLIENT_ERROR_CODE_SET.has(condition)) return condition as ClientErrorCode;
      if (
        Object.prototype.hasOwnProperty.call(CLIENT_CODE_FOR_DIAGNOSTIC_CATEGORY, condition)
      ) {
        return CLIENT_CODE_FOR_DIAGNOSTIC_CATEGORY[condition as DiagnosticCategory];
      }
      return DEFAULT_CLIENT_ERROR_CODE;
    }

    if (condition instanceof Error) {
      const signal = `${condition.name} ${condition.message}`;
      if (CHUNK_FAILURE_SIGNALS.some((pattern) => pattern.test(signal))) {
        return 'CLIENT_CHUNK_LOAD_FAILED';
      }
      return DEFAULT_CLIENT_ERROR_CODE;
    }

    return DEFAULT_CLIENT_ERROR_CODE;
  } catch {
    // A getter on a hostile thrown value must not be able to break the mapper.
    return DEFAULT_CLIENT_ERROR_CODE;
  }
}

// ── Rule 3: one error surface at a time ──────────────────────────────────────

export interface ClientSurfaceSuppression {
  /**
   * A SERVER terminal state (the frozen 13-code taxonomy) is already painted.
   * Server terminal state wins — a client surface on top of it would give the
   * user two contradictory instructions.
   */
  serverTerminalStateShown?: boolean;
}

/**
 * SEAM WIRED BY PLAN 03-13 (stale-bundle recovery), as 03-12 designed it.
 *
 * While 03-13's single silent reload is in flight — or once Surface E2 has taken
 * over the viewport — a chunk-load throw must not paint an error surface for the
 * frame before the document is replaced (XDEV-07 / UI-SPEC E1: "silent reload —
 * nothing visible"). This now reads the real flag `src/lib/platform/stale-bundle.ts`
 * owns.
 *
 * It lives here, next to the taxonomy, rather than being duplicated inside each
 * boundary, so `isClientSurfaceSuppressed()` — the ONE thing every renderer
 * consults — covers rule 3 and Surface E1 together.
 */
export function isStaleReloadInProgress(): boolean {
  return isStaleReloading();
}

/**
 * Rule 3. `true` when a client error surface must NOT be painted, because
 * something with a stronger claim on the viewport already is.
 */
export function isClientSurfaceSuppressed(context: ClientSurfaceSuppression = {}): boolean {
  return context.serverTerminalStateShown === true || isStaleReloadInProgress();
}

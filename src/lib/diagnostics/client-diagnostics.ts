/**
 * client-diagnostics.ts — the ONE client diagnostics seam (D-10, D-11, D-13,
 * XLOG-01 / XLOG-02).
 *
 * Answers the only question that matters after a "it just shows a white page"
 * report: WHICH browser / OS / device / app version fails, at WHICH lifecycle
 * stage, on WHICH surface. A `console.error` lives on the failing device and
 * never comes back to us; this writes one row to `client_error_diagnostics` via
 * the always-204 ingest endpoint from plan 03-04.
 *
 * ── NEVER-THROWS CONTRACT (D-11) ────────────────────────────────────────────
 * Same posture as `supabase/functions/_shared/ai-telemetry.ts`: diagnostics must
 * never be able to fail, delay or alter the flow they are diagnosing. Four
 * INDEPENDENT guarantees, each asserted by a test in `client-diagnostics.test.ts`:
 *   1. `reportDiagnostic` returns `void`. There is no promise a caller could
 *      await, and this file contains no `await` at all.
 *   2. The whole body is inside one swallowing `try/catch`. It does not even
 *      `console.error` — a diagnostics failure must not become console noise
 *      that hides a real error.
 *   3. A per-session cap (`MAX_DIAGNOSTICS_PER_SESSION`) so a render loop
 *      cannot flood the device or the endpoint.
 *   4. A single in-flight slot that DROPS rather than queues. A dropped emit is
 *      never retried; an unbounded queue during a failure storm is itself a
 *      failure mode.
 * The endpoint is registered but may not be deployed in a given environment, and
 * always answers 204 regardless — so a failed send is a non-event by design.
 *
 * ── XLOG-02: STRUCTURALLY CANNOT CARRY USER CONTENT ─────────────────────────
 * `buildDiagnosticRecord` PROJECTS onto `DIAGNOSTIC_ALLOWED_KEYS` — it iterates
 * the allowlist, never the input — and this file never reads an error message, an
 * error stack, a file name, a file object, a form value or any DOM text. The only
 * thing recorded about the error itself is its CONSTRUCTOR NAME, sanitised to an
 * identifier. Script-origin classification is supplied BY THE CALLER precisely so
 * that no stack string ever enters this module. The server enforces the same
 * allowlist independently (`ALLOWED_FIELDS`), because a client-side sanitiser is a
 * promise and a server-side allowlist is a guarantee.
 *
 * The identity and address columns are SERVER-DERIVED and are never sent from
 * here — the client cannot assert who it is or where it is.
 */
import {
  classifyScriptOrigin,
  isExtensionError,
  parseBrowser,
  type ScriptOrigin,
} from '../analysis-error-log';
import { getBuildId } from '../platform/build-id';
import {
  coerceDiagnosticCategory,
  type DiagnosticCategory,
} from './categories';

// ── Constants ────────────────────────────────────────────────────────────────

/** Guarantee 3: a render loop can emit at most this many records per page session. */
export const MAX_DIAGNOSTICS_PER_SESSION = 20;

/** Path appended to the Supabase functions base. */
export const DIAGNOSTIC_ENDPOINT_PATH = '/functions/v1/log-client-diagnostic';

/** Defensive clamp mirroring the server's `MAX_STRING_CHARS`. */
const MAX_STRING_CHARS = 512;

/**
 * XLOG-02, CLIENT HALF. Byte-mirrored with `ALLOWED_FIELDS` in
 * `supabase/functions/log-client-diagnostic/index.ts`; the drift is asserted by
 * `client-diagnostics.test.ts`, which parses the edge function source.
 *
 * The identity and address-hash columns are absent on purpose — both are
 * server-owned, and a client-asserted value for either is never trusted.
 */
export const DIAGNOSTIC_ALLOWED_KEYS = Object.freeze([
  'event_id',
  'app_version',
  'surface',
  'lifecycle_stage',
  'error_category',
  'error_name',
  'script_origin',
  'browser',
  'browser_version',
  'os',
  'os_version',
  'device_type',
  'engine',
  'viewport_w',
  'viewport_h',
  'dpr',
  'is_extension',
  'capability_tier',
  'online',
  'connection_type',
  'user_agent',
  'run_id',
] as const);

export type DiagnosticAllowedKey = (typeof DIAGNOSTIC_ALLOWED_KEYS)[number];

/** A projected record: flat primitives only, every key on the allowlist. */
export type DiagnosticRecord = Partial<
  Record<DiagnosticAllowedKey, string | number | boolean>
>;

/**
 * The 11 audit surfaces of Phase 03, plus `app-shell` for failures that happen
 * outside any feature surface (module evaluation, global capture, boot).
 */
export const DIAGNOSTIC_SURFACES = Object.freeze([
  'resume-analysis',
  'linkedin-grader',
  'career-compass',
  'recruiting-lens',
  'onboarding',
  'dashboard',
  'authentication',
  'upload-extraction',
  'checkout',
  'tier-flows',
  'admin',
  'app-shell',
] as const);

export type DiagnosticSurface = (typeof DIAGNOSTIC_SURFACES)[number];

/**
 * Lifecycle stages. A strict SUPERSET of `AnalysisLifecycleStage` in
 * `analysis-error-log.ts`, so the resume-analysis callers pass through unchanged.
 */
export type DiagnosticLifecycleStage =
  | 'boot'
  | 'capability-gate'
  | 'auth'
  | 'upload'
  | 'extraction'
  | 'submit'
  | 'stream'
  | 'job-poll'
  | 'recovery'
  | 'render'
  | 'checkout'
  | 'unknown';

export interface DiagnosticInput {
  /** Which of the audit surfaces the failure happened on. */
  surface: DiagnosticSurface;
  /** Where in that surface's lifecycle it happened. */
  stage: DiagnosticLifecycleStage;
  /** Coerced into the frozen set; anything unknown becomes `unexpected`. */
  category?: unknown;
  /**
   * The thrown value. ONLY its constructor name is ever read. Its message and
   * stack are deliberately untouched — see the XLOG-02 note in the header.
   */
  error?: unknown;
  /**
   * Pre-computed script origin. Callers classify (they hold the stack or the
   * event source URL) so that no stack string enters this module.
   */
  scriptOrigin?: ScriptOrigin;
  /** Explicit extension flag; inferred from `error` when omitted. */
  isExtension?: boolean;
  /** Internal server run id — an identifier, never content. */
  runId?: string | null;
  /** Capability tier from the plan 03-11 gate, when the caller knows it. */
  capabilityTier?: string | null;
}

// ── Pure helpers (never throw, never read user content) ──────────────────────

function clamp(value: string): string {
  return value.length > MAX_STRING_CHARS ? value.slice(0, MAX_STRING_CHARS) : value;
}

const IDENTIFIER_RE = /^[A-Za-z0-9_$-]+$/;

/**
 * Accepts a value ONLY if it is already a bare identifier — otherwise it is
 * dropped entirely. Applied to the error's constructor name, `run_id`,
 * `capability_tier` and `connection_type`.
 *
 * Validate-and-drop, NOT strip-and-keep: stripping the punctuation out of a
 * signed storage URL leaves the token's characters intact and concatenated,
 * which would smuggle exactly the secret XLOG-02 forbids. A UUID, a tier name
 * and a class name all pass this test; anything that does not is not an
 * identifier and has no business on a diagnostics row.
 */
function safeIdentifier(value: unknown, maxLength = 64): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length === 0 || value.length > maxLength) return undefined;
  return IDENTIFIER_RE.test(value) ? value : undefined;
}

function safeUserAgent(): string {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
      ? navigator.userAgent
      : 'unknown';
  } catch {
    return 'unknown';
  }
}

function safeMaxTouchPoints(): number {
  try {
    const points = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0;
    return typeof points === 'number' && Number.isFinite(points) ? points : 0;
  } catch {
    return 0;
  }
}

function safeAppOrigin(): string {
  try {
    return typeof window !== 'undefined' && window.location ? window.location.origin : '';
  } catch {
    return '';
  }
}

export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export interface PlatformInfo {
  os: string;
  osVersion: string | undefined;
  deviceType: DeviceType;
  engine: string;
}

/**
 * Best-effort OS / device / engine derivation from the UA string. Diagnostics
 * ONLY — D-06 forbids UA-string gating, and nothing here branches behaviour.
 *
 * `maxTouchPoints` is a parameter rather than a global read so the function stays
 * pure and testable: iPadOS Safari reports a `Macintosh` UA, and touch points are
 * the only honest way to tell an iPad from a Mac.
 */
export function parsePlatform(ua: string, maxTouchPoints = 0): PlatformInfo {
  const pick = (re: RegExp): string | undefined => {
    const m = ua.match(re);
    return m && m[1] ? m[1].replace(/_/g, '.') : undefined;
  };

  let os = 'unknown';
  let osVersion: string | undefined;
  let deviceType: DeviceType = 'unknown';

  if (/iPad/.test(ua)) {
    os = 'iPadOS';
    osVersion = pick(/OS ([\d_]+)/);
    deviceType = 'tablet';
  } else if (/iPhone|iPod/.test(ua)) {
    os = 'iOS';
    osVersion = pick(/OS ([\d_]+)/);
    deviceType = 'mobile';
  } else if (/Android/.test(ua)) {
    os = 'Android';
    osVersion = pick(/Android ([\d.]+)/);
    deviceType = /Mobile/.test(ua) ? 'mobile' : 'tablet';
  } else if (/CrOS/.test(ua)) {
    os = 'ChromeOS';
    deviceType = 'desktop';
  } else if (/Windows NT/.test(ua)) {
    os = 'Windows';
    osVersion = pick(/Windows NT ([\d.]+)/);
    deviceType = 'desktop';
  } else if (/Mac OS X/.test(ua)) {
    // Desktop-class Safari on iPadOS 13+ masquerades as a Mac; touch points give it away.
    const isIpad = maxTouchPoints > 1;
    os = isIpad ? 'iPadOS' : 'macOS';
    osVersion = isIpad ? undefined : pick(/Mac OS X ([\d_.]+)/);
    deviceType = isIpad ? 'tablet' : 'desktop';
  } else if (/Linux/.test(ua)) {
    os = 'Linux';
    deviceType = 'desktop';
  }

  let engine = 'unknown';
  if (/Firefox\/|Gecko\/\d/.test(ua)) engine = 'Gecko';
  else if (/Edg\/|OPR\/|Chrome\/|Chromium\//.test(ua)) engine = 'Blink';
  else if (/AppleWebKit\//.test(ua)) engine = 'WebKit';

  return { os, osVersion, deviceType, engine };
}

/**
 * The ONLY thing read off the thrown value. `Error` subclasses report their class
 * name here; a non-Error throw reports its primitive type. Sanitised to an
 * identifier so that even a hand-crafted constructor name cannot carry a sentence.
 */
function safeErrorName(error: unknown): string | undefined {
  try {
    if (error === null || error === undefined) return undefined;
    const ctor = (error as { constructor?: { name?: unknown } }).constructor;
    const raw = ctor && typeof ctor.name === 'string' ? ctor.name : typeof error;
    return safeIdentifier(raw);
  } catch {
    return undefined;
  }
}

/**
 * A per-record correlation id. `crypto.randomUUID` is guarded rather than assumed
 * — it is absent on older Safari and on insecure origins, and plan 03-09 owns the
 * polyfill; diagnostics must not depend on it having landed.
 */
function safeEventId(): string | undefined {
  try {
    const c = globalThis.crypto as Crypto | undefined;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  } catch {
    return undefined;
  }
}

function safeNumber(read: () => unknown): number | undefined {
  try {
    const value = read();
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function safeOnline(): boolean | undefined {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `navigator.connection` is Blink-only. Recorded as nullable and NEVER branched
 * on — XDEV-02 forbids behaviour that depends on a non-universal API.
 */
function safeConnectionType(): string | undefined {
  try {
    const nav = navigator as unknown as { connection?: { effectiveType?: unknown } };
    const effective = nav?.connection?.effectiveType;
    return typeof effective === 'string' ? safeIdentifier(effective, 16) : undefined;
  } catch {
    return undefined;
  }
}

// ── The record builder ───────────────────────────────────────────────────────

/**
 * Builds the record. PURE, never throws, and structurally incapable of carrying
 * user content: the projection loop iterates `DIAGNOSTIC_ALLOWED_KEYS`, so a key
 * that is not on the allowlist has no path onto the record at all, and any
 * non-primitive value is dropped exactly as the server drops it.
 *
 * The four NOT NULL columns of `client_error_diagnostics` (`app_version`,
 * `surface`, `lifecycle_stage`, `error_category`) are always populated. Every
 * other field is optional by design, so a withheld browser capability can never
 * make the write fail.
 */
export function buildDiagnosticRecord(input: DiagnosticInput): DiagnosticRecord {
  const ua = safeUserAgent();
  const browser = parseBrowser(ua);
  const platform = parsePlatform(ua, safeMaxTouchPoints());

  const extension =
    typeof input.isExtension === 'boolean' ? input.isExtension : isExtensionError(input.error);

  // Classification comes from the caller when it has one (it holds the stack or
  // the event source URL). Otherwise fall back to the scheme check, which reads
  // the error but returns only a four-value enum.
  const scriptOrigin: ScriptOrigin =
    input.scriptOrigin ??
    (extension ? 'browser-extension' : classifyScriptOrigin(undefined, safeAppOrigin()));

  const candidate: Record<string, unknown> = {
    event_id: safeEventId(),
    app_version: getBuildId(),
    surface: input.surface,
    lifecycle_stage: input.stage,
    error_category: coerceDiagnosticCategory(input.category),
    error_name: safeErrorName(input.error),
    script_origin: scriptOrigin,
    browser: browser.browser,
    browser_version: browser.version,
    os: platform.os,
    os_version: platform.osVersion,
    device_type: platform.deviceType,
    engine: platform.engine,
    viewport_w: safeNumber(() => window.innerWidth),
    viewport_h: safeNumber(() => window.innerHeight),
    dpr: safeNumber(() => window.devicePixelRatio),
    is_extension: extension,
    capability_tier: safeIdentifier(input.capabilityTier ?? undefined, 32),
    online: safeOnline(),
    connection_type: safeConnectionType(),
    user_agent: clamp(ua),
    run_id: safeIdentifier(input.runId ?? undefined),
  };

  // THE projection. Iterates the allowlist, never the input.
  const record: DiagnosticRecord = {};
  for (const key of DIAGNOSTIC_ALLOWED_KEYS) {
    const value = candidate[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      record[key] = clamp(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      record[key] = value;
    }
    // anything else (object, array, function, symbol) is dropped
  }
  return record;
}

// ── Transport ────────────────────────────────────────────────────────────────

let emitCount = 0;
let inFlight = false;
let cachedUrl: string | null | undefined;
let authTokenProvider: (() => string | null) | null = null;

/**
 * Optional SYNCHRONOUS token seam for the `fetch` fallback. Synchronous by
 * requirement: resolving a session would mean awaiting inside the emit, which
 * guarantee 1 forbids. With no provider registered the fallback is simply not
 * attempted — `sendBeacon` is the primary path and exists in every supported
 * browser.
 */
export function setDiagnosticAuthTokenProvider(
  provider: (() => string | null) | null,
): void {
  authTokenProvider = provider;
}

/**
 * Endpoint URL from the same Supabase base the app already uses. Resolution
 * failure is treated as "diagnostics disabled" — a silent no-op, never a console
 * storm and never a thrown import.
 */
function resolveEndpointUrl(): string | null {
  if (cachedUrl !== undefined) return cachedUrl;
  try {
    const base = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
    cachedUrl =
      typeof base === 'string' && base.length > 0
        ? `${base.replace(/\/+$/, '')}${DIAGNOSTIC_ENDPOINT_PATH}`
        : null;
  } catch {
    cachedUrl = null;
  }
  return cachedUrl;
}

/**
 * `text/plain` Blob: a CORS *simple* request, so there is no preflight and a CORS
 * response cannot block the send, and the browser flushes it even during unload.
 */
function sendBeaconSafely(url: string, json: string): boolean {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
      return false;
    }
    return navigator.sendBeacon(url, new Blob([json], { type: 'text/plain' })) === true;
  } catch {
    return false;
  }
}

function readAuthToken(): string | null {
  try {
    const token = authTokenProvider ? authTokenProvider() : null;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/**
 * Emit one diagnostic. Fire-and-forget: returns `void`, never a promise, never
 * throws, and is capped and single-slotted. Safe to call from a `catch`, from a
 * React error boundary, or from a global handler.
 */
export function reportDiagnostic(input: DiagnosticInput): void {
  try {
    // Guarantee 3 — cap. Checked BEFORE any work, including URL resolution.
    if (emitCount >= MAX_DIAGNOSTICS_PER_SESSION) return;
    // Guarantee 4 — single slot. Dropped, not queued, and not retried. A drop
    // does not consume budget: the cap exists to bound a flood, not to punish one.
    if (inFlight) return;

    const url = resolveEndpointUrl();
    if (!url) return;

    emitCount += 1;
    inFlight = true;

    let json: string;
    try {
      json = JSON.stringify(buildDiagnosticRecord(input));
    } catch {
      inFlight = false;
      return;
    }

    if (sendBeaconSafely(url, json)) {
      inFlight = false;
      return;
    }

    const token = readAuthToken();
    if (!token) {
      inFlight = false;
      return;
    }

    // The authenticated fallback. `keepalive` so it survives unload; the auth
    // header costs a preflight, which is the trade this path accepts. NOT
    // awaited and never returned — settlement only frees the slot.
    try {
      const pending = fetch(url, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          Authorization: `Bearer ${token}`,
        },
        body: json,
      });
      if (pending && typeof pending.then === 'function') {
        void pending.then(
          () => {
            inFlight = false;
          },
          () => {
            inFlight = false;
          },
        );
      } else {
        inFlight = false;
      }
    } catch {
      inFlight = false;
    }
  } catch {
    // Guarantee 2 — swallow. Deliberately no console output: diagnostics must not
    // add noise to the very console someone is reading to debug the real failure.
    inFlight = false;
  }
}

/** Test-only: clears the cap, the in-flight slot, the URL cache and the token seam. */
export function resetDiagnosticsForTests(): void {
  emitCount = 0;
  inFlight = false;
  cachedUrl = undefined;
  authTokenProvider = null;
}

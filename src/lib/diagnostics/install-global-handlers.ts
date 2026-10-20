/**
 * install-global-handlers.ts — the first global error capture `src/` has ever had
 * (defect XD-20, XLOG-01, XDEV-08).
 *
 * A React error boundary cannot see a module-evaluation throw, a chunk that fails
 * to load, or a rejected promise nobody handled — which is precisely why the
 * white-screen reports arrive with no reproduction and nothing logged anywhere.
 * These two listeners close that gap.
 *
 * ── WHAT THESE HANDLERS DELIBERATELY DO NOT DO ──────────────────────────────
 * They call `reportDiagnostic` and NOTHING else. They never touch React state,
 * never render, never rethrow, and never suppress the browser's default handling
 * of the event — doing so would hide the error from the browser console and from
 * Vercel, which would make debugging strictly worse. User-facing recovery UI belongs to
 * the error boundaries in plan 03-12; this file only makes the failure OBSERVABLE.
 *
 * ── XDEV-08: EXTENSION ISOLATION ────────────────────────────────────────────
 * Grammarly-class injectors and ad blockers throw inside the page constantly. An
 * extension-origin error is RECORDED (with `is_extension` true, so the fleet view
 * can separate "our bug" from "their extension") but is never treated as an app
 * failure — nothing here surfaces anything to the user, so classification is the
 * whole of the isolation at this layer.
 *
 * Re-entrancy: a failure inside a handler must not recurse through the same
 * handler. `reportDiagnostic` already swallows everything, but the guard makes the
 * "self-amplifying failure loop" threat structurally impossible rather than
 * conditionally unlikely.
 */
import { classifyScriptOrigin, type ScriptOrigin } from '../analysis-error-log';
import {
  reportDiagnostic,
  type DiagnosticInput,
} from './client-diagnostics';

let installed = false;
let handling = false;

function safeAppOrigin(): string {
  try {
    return typeof window !== 'undefined' && window.location ? window.location.origin : '';
  } catch {
    return '';
  }
}

/**
 * Classify from the event's SOURCE URL. Only the URL's scheme/host matters, and
 * only the resulting four-value enum leaves this function — the URL itself is
 * never put on a record (it can carry a signed token in its query string).
 */
function originOfSource(sourceUrl: unknown): ScriptOrigin {
  if (typeof sourceUrl !== 'string' || sourceUrl.length === 0) return 'unknown';
  return classifyScriptOrigin(sourceUrl, safeAppOrigin());
}

/** One emit path, so both listeners share the same guard and the same posture. */
function capture(input: DiagnosticInput): void {
  if (handling) return;
  handling = true;
  try {
    reportDiagnostic(input);
  } catch {
    // reportDiagnostic already swallows; this is belt and braces.
  } finally {
    handling = false;
  }
}

function onWindowError(event: ErrorEvent): void {
  const scriptOrigin = originOfSource(event?.filename);
  capture({
    surface: 'app-shell',
    stage: 'boot',
    category: 'unexpected',
    error: event?.error,
    scriptOrigin,
    isExtension: scriptOrigin === 'browser-extension',
  });
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  capture({
    surface: 'app-shell',
    stage: 'unknown',
    category: 'unexpected',
    error: event?.reason,
  });
}

/**
 * Install the global capture. Idempotent — a second call is a no-op, so a hot
 * reload or a stray import cannot double-report. Never throws.
 */
export function installGlobalDiagnosticHandlers(): void {
  try {
    if (installed) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    installed = true;
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
  } catch {
    // Diagnostics installation must never be able to stop the app from booting.
  }
}

/** Test-only: uninstalls and clears the guards. */
export function resetGlobalDiagnosticHandlersForTests(): void {
  try {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    }
  } catch {
    // ignore
  }
  installed = false;
  handling = false;
}

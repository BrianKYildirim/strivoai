/**
 * analysis-error-log.ts — structured, leak-free client logging for the resume
 * analysis lifecycle.
 *
 * Emits ONE structured console.error line (captured by Vercel) per analysis
 * failure or caught render error, carrying enough to diagnose the class of
 * problem behind this ticket — browser + version, the origin of the failing
 * script (first-party bundle vs a browser extension vs a third-party host), the
 * stack, the lifecycle stage, and the analysis run/resume id.
 *
 * Leak posture: we log NO resume content — no file text, no prompt, no PII. Only
 * technical diagnostics. This is separate from the user-facing copy, which comes
 * from the leak-free analysisError taxonomy; nothing logged here is ever rendered.
 *
 * ── D-10: THIS MODULE IS NOW A CALLER OF THE SHARED SEAM ────────────────────
 * Phase 03 generalized client diagnostics into `src/lib/diagnostics/`. This module
 * keeps EVERY export it had, with the same names and signatures — `Results.tsx`,
 * `useResumeStream.ts` and `AnalysisErrorBoundary.tsx` are untouched — but the
 * durable path is no longer the console. The console line stays for local
 * debugging; `reportDiagnostic` is what makes the failure answerable later.
 *
 * The console record is INTENTIONALLY richer than the emitted one: it may carry a
 * message and a stack, which never leave the device. The seam's record builder
 * projects onto a closed allowlist and receives only the classification computed
 * here, so nothing free-text can cross the wire (XLOG-02).
 *
 * Note the deliberate import cycle with `diagnostics/client-diagnostics.ts`: it
 * reuses this module's UA and script-origin classifiers rather than duplicating
 * them. Neither module calls the other at module-evaluation time, so the cycle is
 * inert at load.
 */
import { reportDiagnostic } from "./diagnostics/client-diagnostics";
import type { DiagnosticCategory } from "./diagnostics/categories";

export type AnalysisLifecycleStage =
  | "upload"
  | "extraction"
  | "stream"
  | "job-poll"
  | "recovery"
  | "render"
  | "unknown";

/** Where the failing top-of-stack script came from. */
export type ScriptOrigin = "first-party" | "browser-extension" | "third-party" | "unknown";

export interface AnalysisErrorContext {
  stage: AnalysisLifecycleStage;
  /** Server run id when known (streaming `complete` / recovery paths). */
  runId?: string | null;
  /** Resume row id — an internal identifier, never resume content. */
  resumeId?: string | null;
  /** Extra non-sensitive tags (e.g. { path: 'worker-extract' }). */
  tags?: Record<string, string | number | boolean | null | undefined>;
}

interface BrowserInfo {
  userAgent: string;
  browser: string;
  version: string;
}

const EXTENSION_SCHEMES = ["chrome-extension://", "moz-extension://", "safari-web-extension://", "safari-extension://", "ms-browser-extension://"];

/** Best-effort browser + version from the UA string. Diagnostics only. */
export function parseBrowser(ua: string): BrowserInfo {
  const pick = (re: RegExp): string | null => {
    const m = ua.match(re);
    return m ? m[1] : null;
  };
  let browser = "unknown";
  let version = "unknown";
  // Order matters: Edge/Chrome UAs both contain "Chrome"; check the more specific first.
  if (/Edg\//.test(ua)) { browser = "Edge"; version = pick(/Edg\/([\d.]+)/) ?? version; }
  else if (/OPR\//.test(ua)) { browser = "Opera"; version = pick(/OPR\/([\d.]+)/) ?? version; }
  else if (/Firefox\//.test(ua)) { browser = "Firefox"; version = pick(/Firefox\/([\d.]+)/) ?? version; }
  else if (/Chrome\//.test(ua)) { browser = "Chrome"; version = pick(/Chrome\/([\d.]+)/) ?? version; }
  else if (/Version\/[\d.]+.*Safari/.test(ua)) { browser = "Safari"; version = pick(/Version\/([\d.]+)/) ?? version; }
  else if (/Safari\//.test(ua)) { browser = "Safari"; version = pick(/Safari\/([\d.]+)/) ?? version; }
  return { userAgent: ua, browser, version };
}

/**
 * Classify where the error originated from its stack. An error whose frames
 * point at a browser-extension URL is NOT a Strivo defect — surfacing this lets
 * us both diagnose and deliberately isolate extension noise from the analysis
 * lifecycle.
 */
export function classifyScriptOrigin(stack: string | undefined, appOrigin: string): ScriptOrigin {
  if (!stack) return "unknown";
  if (EXTENSION_SCHEMES.some((scheme) => stack.includes(scheme))) {
    return "browser-extension";
  }
  // Pull URLs out of the stack; decide by the first http(s) frame we recognize.
  const urls = stack.match(/https?:\/\/[^\s):]+/g);
  if (!urls || urls.length === 0) return "unknown";
  const firstThirdParty = urls.find((u) => !u.startsWith(appOrigin));
  if (!firstThirdParty) return "first-party";
  return "third-party";
}

/** True when the given error looks like it came from an injected extension script. */
export function isExtensionError(error: unknown): boolean {
  const stack = error instanceof Error ? error.stack : undefined;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return EXTENSION_SCHEMES.some((scheme) => (stack ?? "").includes(scheme) || message.includes(scheme));
}

function safeOrigin(): string {
  try {
    return typeof window !== "undefined" && window.location ? window.location.origin : "";
  } catch {
    return "";
  }
}

function safeUserAgent(): string {
  try {
    return typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * The stage a resume-analysis failure happened at maps 1:1 onto the shared
 * closed category set, so the resume surface needs no per-call category.
 */
const STAGE_CATEGORY: Record<AnalysisLifecycleStage, DiagnosticCategory> = {
  upload: "upload_failed",
  extraction: "extraction_failed",
  stream: "stream_failed",
  "job-poll": "poll_failed",
  recovery: "unexpected",
  render: "render_failed",
  unknown: "unexpected",
};

/**
 * Log a structured, leak-free record of an analysis-lifecycle error. Never
 * throws (diagnostics must not create new failures). Returns the record so
 * callers/tests can assert on it.
 */
export function logAnalysisError(error: unknown, ctx: AnalysisErrorContext): Record<string, unknown> {
  const err = error instanceof Error ? error : new Error(String(error ?? "unknown error"));
  const origin = safeOrigin();
  const browser = parseBrowser(safeUserAgent());
  const record = {
    event: "analysis_lifecycle_error",
    stage: ctx.stage,
    runId: ctx.runId ?? null,
    resumeId: ctx.resumeId ?? null,
    // Message is a technical error string, deliberately NOT shown to users.
    errorName: err.name,
    errorMessage: err.message,
    scriptOrigin: classifyScriptOrigin(err.stack, origin),
    isExtension: isExtensionError(err),
    browser: browser.browser,
    browserVersion: browser.version,
    userAgent: browser.userAgent,
    appOrigin: origin,
    stack: err.stack ?? null,
    ...(ctx.tags ? { tags: ctx.tags } : {}),
    ts: new Date().toISOString(),
  };
  try {
    console.error("[AnalysisError]", record);
  } catch {
    // never let logging throw
  }
  try {
    // The durable half (D-10/D-11). Fire-and-forget: returns void, never throws,
    // and is capped inside the seam. Only the CLASSIFICATION crosses — the message
    // and stack above stay on the device.
    reportDiagnostic({
      surface: "resume-analysis",
      stage: ctx.stage,
      category: STAGE_CATEGORY[ctx.stage] ?? "unexpected",
      error: err,
      scriptOrigin: record.scriptOrigin,
      isExtension: record.isExtension,
      runId: ctx.runId ?? null,
    });
  } catch {
    // Unreachable by contract; kept so a future seam change cannot break callers.
  }
  return record;
}

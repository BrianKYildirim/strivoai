/**
 * analysisError.ts — Phase 03 · 03-05 · LIFE-08.
 *
 * FRONTEND MIRROR of the backend analysis error taxonomy
 * (supabase/functions/_shared/analysis-error-taxonomy.ts). The backend owns the
 * authoritative { httpStatus, safeMessage, retryable } table; this module mirrors
 * the same 13 codes plus their user-facing copy + retry affordance so the recovery
 * surface (useAnalysisRun) can render a failed run WITHOUT any round-trip.
 *
 * Leak posture (LIFE-08): every message here is safe, specific, and operationally
 * useful, yet carries NO technical detail — no payload, prompt, provider body,
 * stack, secret, HTTP status, or internal identifier. The messages intentionally
 * track the backend `safeMessage` copy so the two surfaces stay consistent.
 *
 * Retry partition (LIFE-06) — MUST match the backend table exactly:
 *   - retryable = true  → MODEL_TIMEOUT, MODEL_RATE_LIMITED (transient upstream).
 *   - retryable = false → everything else. DATABASE_SAVE_FAILED is deliberately
 *     NON-retryable (D-03): a save failure past generation is treated as permanent
 *     so any partial result is preserved rather than re-running the model.
 */

// ── Codes (the closed set of 13, mirrored from the backend) ──────────────────

export type AnalysisErrorCode =
  | "INPUT_MISSING"
  | "FILE_NOT_FOUND"
  | "FILE_EXTRACTION_FAILED"
  | "PROFILE_PARSE_FAILED"
  | "MERIT_RESERVATION_FAILED"
  | "MODEL_TIMEOUT"
  | "MODEL_RATE_LIMITED"
  | "MODEL_INVALID_RESPONSE"
  | "MODEL_OUTPUT_TRUNCATED"
  | "SCHEMA_VALIDATION_FAILED"
  | "DATABASE_SAVE_FAILED"
  | "MERIT_SETTLEMENT_FAILED"
  | "UNKNOWN_ANALYSIS_ERROR";

export interface AnalysisErrorDisplay {
  /** User-facing message: specific + operationally useful, yet leak-free. */
  message: string;
  /** Whether the caller may retry (LIFE-06 transient/permanent split). */
  retryable: boolean;
}

/**
 * The 13 mirrored rows. Copy tracks the backend `safeMessage`; the `retryable`
 * partition is byte-identical to ANALYSIS_ERROR_TABLE.
 */
const ANALYSIS_ERROR_DISPLAY: Record<AnalysisErrorCode, AnalysisErrorDisplay> = {
  INPUT_MISSING: {
    message: "Required input is missing. Please re-upload and try again.",
    retryable: false,
  },
  FILE_NOT_FOUND: {
    message: "We couldn't find your uploaded file. Please upload it again.",
    retryable: false,
  },
  FILE_EXTRACTION_FAILED: {
    message: "We couldn't read text from your file. Please upload a clearer copy or paste your content.",
    retryable: false,
  },
  PROFILE_PARSE_FAILED: {
    message: "We couldn't read the provided profile. Please check the input and try again.",
    retryable: false,
  },
  MERIT_RESERVATION_FAILED: {
    message: "We couldn't reserve credits for this analysis. Please try again in a moment.",
    retryable: false,
  },
  MODEL_TIMEOUT: {
    message: "The analysis timed out. Please try again.",
    retryable: true,
  },
  MODEL_RATE_LIMITED: {
    message: "The service is busy right now. Please try again shortly.",
    retryable: true,
  },
  MODEL_INVALID_RESPONSE: {
    message: "The analysis could not be completed. Please try again.",
    retryable: false,
  },
  MODEL_OUTPUT_TRUNCATED: {
    message: "The analysis was incomplete. Please try again.",
    retryable: false,
  },
  SCHEMA_VALIDATION_FAILED: {
    message: "The analysis could not be completed. Please try again.",
    retryable: false,
  },
  DATABASE_SAVE_FAILED: {
    message: "We couldn't save your analysis. Please try again.",
    retryable: false,
  },
  MERIT_SETTLEMENT_FAILED: {
    message: "We hit a problem finalizing your analysis. Our team has been notified.",
    retryable: false,
  },
  UNKNOWN_ANALYSIS_ERROR: {
    message: "Something went wrong during analysis. Please try again.",
    retryable: false,
  },
};

/**
 * Maps an analysis error code (as delivered by the backend `failure_code` /
 * jsonError `code`) to its user-facing { message, retryable }. Any unrecognized
 * or missing code falls back to UNKNOWN_ANALYSIS_ERROR (fail-closed, non-retryable)
 * so a new/unknown backend code never crashes the recovery surface or wrongly
 * offers a retry.
 */
export function mapAnalysisError(code: string | null | undefined): AnalysisErrorDisplay {
  if (code && Object.prototype.hasOwnProperty.call(ANALYSIS_ERROR_DISPLAY, code)) {
    return ANALYSIS_ERROR_DISPLAY[code as AnalysisErrorCode];
  }
  return ANALYSIS_ERROR_DISPLAY.UNKNOWN_ANALYSIS_ERROR;
}

/**
 * Leak-free display for the streaming hook's free-form `error` string.
 *
 * `useResumeStream` stores prose in `StreamState.error`, and two of its sources
 * are RAW server text — a non-ok response `body.error` and an SSE `error` event
 * `message`. Rendering those verbatim (Results "Analysis Interrupted" screen)
 * risks surfacing raw JavaScript/stack/provider text to the user. This chokepoint
 * maps the known-safe tokens/curated strings to user-facing copy and collapses
 * everything else (i.e. anything possibly raw) to a controlled generic message.
 * It fails safe: an unrecognized string is treated as unsafe, never shown.
 */
const SAFE_STREAM_PASSTHROUGH: ReadonlySet<string> = new Set([
  "Connection failed. Please try again.",
  "Stream disconnected. Please try again.",
  "Analysis stream ended unexpectedly. Please try again.",
  "Analysis failed. Please try again.",
  "Analysis failed",
]);

export function getSafeStreamErrorMessage(raw: string | null | undefined): string {
  const generic = "The analysis was interrupted before it finished. No credits were charged — please try again to continue.";
  if (!raw) return generic;
  if (raw === "rate_limit_exceeded") return "The service is busy right now. Please try again shortly.";
  if (raw === "Not authenticated") return "Your session expired. Please sign in and try again.";
  if (SAFE_STREAM_PASSTHROUGH.has(raw)) return raw;
  // Anything else may be raw server / stack / provider text — never render it.
  return generic;
}

/** The complete, closed set of 13 codes (stable order) — for exhaustive tests. */
export const ANALYSIS_ERROR_CODES: readonly AnalysisErrorCode[] = [
  "INPUT_MISSING",
  "FILE_NOT_FOUND",
  "FILE_EXTRACTION_FAILED",
  "PROFILE_PARSE_FAILED",
  "MERIT_RESERVATION_FAILED",
  "MODEL_TIMEOUT",
  "MODEL_RATE_LIMITED",
  "MODEL_INVALID_RESPONSE",
  "MODEL_OUTPUT_TRUNCATED",
  "SCHEMA_VALIDATION_FAILED",
  "DATABASE_SAVE_FAILED",
  "MERIT_SETTLEMENT_FAILED",
  "UNKNOWN_ANALYSIS_ERROR",
] as const;

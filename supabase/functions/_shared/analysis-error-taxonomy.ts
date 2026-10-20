/**
 * Structured analysis error taxonomy (LIFE-08 — feeds the LIFE-06 retry split).
 *
 * The 13 codes below are the complete, closed set of failure modes an analysis
 * lifecycle can reach. Each maps to exactly one { httpStatus, safeMessage,
 * retryable } row. The taxonomy rides the EXISTING `jsonError` envelope from
 * `_shared/cors.ts` (cors.ts:202 explicitly deferred this nested taxonomy to
 * Phase 3) — `toAnalysisJsonError` emits the SAFE message + machine-readable
 * `code` + `retryable` only, and NEVER the internal detail, a payload, a prompt,
 * a provider body, or a secret (LIFE-08 no-leak).
 *
 * Retryable partition (LIFE-06):
 *  - retryable=true  → MODEL_TIMEOUT, MODEL_RATE_LIMITED (transient upstream).
 *  - retryable=false → everything else. DATABASE_SAVE_FAILED is a deliberate
 *    judgment call: a save failure PAST generation is treated as permanent so we
 *    preserve any partial result rather than re-run the model (D-03). Permanent
 *    input/model-shape codes (INPUT_MISSING, FILE_NOT_FOUND, FILE_EXTRACTION_FAILED,
 *    PROFILE_PARSE_FAILED, MODEL_INVALID_RESPONSE, MODEL_OUTPUT_TRUNCATED,
 *    SCHEMA_VALIDATION_FAILED) are never retried.
 */
import { jsonError } from "./cors.ts";

// ── Codes ────────────────────────────────────────────────────────

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

export interface AnalysisErrorEntry {
  /** HTTP status the endpoint returns for this code. */
  httpStatus: number;
  /** User-facing message: specific + operationally useful, yet leak-free. */
  safeMessage: string;
  /** Whether the caller may retry (LIFE-06 transient/permanent split). */
  retryable: boolean;
}

// ── Table ────────────────────────────────────────────────────────

export const ANALYSIS_ERROR_TABLE: Record<AnalysisErrorCode, AnalysisErrorEntry> = {
  INPUT_MISSING: {
    httpStatus: 400,
    safeMessage: "Required input is missing. Please re-upload and try again.",
    retryable: false,
  },
  FILE_NOT_FOUND: {
    httpStatus: 404,
    safeMessage: "We couldn't find your uploaded file. Please upload it again.",
    retryable: false,
  },
  FILE_EXTRACTION_FAILED: {
    httpStatus: 422,
    safeMessage: "We couldn't read text from your file. Please upload a clearer copy or paste your content.",
    retryable: false,
  },
  PROFILE_PARSE_FAILED: {
    httpStatus: 422,
    safeMessage: "We couldn't read the provided profile. Please check the input and try again.",
    retryable: false,
  },
  MERIT_RESERVATION_FAILED: {
    httpStatus: 402,
    safeMessage: "We couldn't reserve credits for this analysis. Please try again in a moment.",
    retryable: false,
  },
  MODEL_TIMEOUT: {
    httpStatus: 504,
    safeMessage: "The analysis timed out. Please try again.",
    retryable: true,
  },
  MODEL_RATE_LIMITED: {
    httpStatus: 429,
    safeMessage: "The service is busy right now. Please try again shortly.",
    retryable: true,
  },
  MODEL_INVALID_RESPONSE: {
    httpStatus: 502,
    safeMessage: "The analysis could not be completed. Please try again.",
    retryable: false,
  },
  MODEL_OUTPUT_TRUNCATED: {
    httpStatus: 502,
    safeMessage: "The analysis was incomplete. Please try again.",
    retryable: false,
  },
  SCHEMA_VALIDATION_FAILED: {
    httpStatus: 502,
    safeMessage: "The analysis could not be completed. Please try again.",
    retryable: false,
  },
  DATABASE_SAVE_FAILED: {
    httpStatus: 500,
    safeMessage: "We couldn't save your analysis. Please try again.",
    retryable: false,
  },
  MERIT_SETTLEMENT_FAILED: {
    httpStatus: 500,
    safeMessage: "We hit a problem finalizing your analysis. Our team has been notified.",
    retryable: false,
  },
  UNKNOWN_ANALYSIS_ERROR: {
    httpStatus: 500,
    safeMessage: "Something went wrong during analysis. Please try again.",
    retryable: false,
  },
};

// ── Envelope composition ─────────────────────────────────────────

/**
 * Builds a `jsonError` Response for an analysis error code. Only the SAFE
 * message, the machine-readable `code`, and the `retryable` flag cross to the
 * browser. The optional `internalDetail` is accepted for symmetry with callers
 * that carry a validator detail, but it is INTENTIONALLY dropped here — it must
 * never reach the client (LIFE-08). Log it upstream against a request id instead.
 */
export function toAnalysisJsonError(
  req: Request,
  code: AnalysisErrorCode,
  _internalDetail?: string,
): Response {
  const entry = ANALYSIS_ERROR_TABLE[code] ?? ANALYSIS_ERROR_TABLE.UNKNOWN_ANALYSIS_ERROR;
  return jsonError(req, entry.httpStatus, entry.safeMessage, {
    code,
    retryable: entry.retryable,
  });
}

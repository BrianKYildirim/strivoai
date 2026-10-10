/**
 * Strict, no-masking validation of untrusted LLM output (LIFE-07 / Pitfall 9).
 *
 * `validateModelOutput` runs the full pipeline —
 *   (1) empty/blank detection
 *   (2) wrapper removal + JSON parse (via `_shared/json-repair.ts`)
 *   (3) truncation detection (a clipped body is REJECTED, never repaired-and-accepted)
 *   (4) empty/generic detection ({}, [], all-null / all-default)
 *   (5) zod `safeParse` (required-field / type / range)
 *   (6) optional feature-specific `semanticCheck`
 * — and returns a discriminated union. On EVERY failure path it returns a TYPED
 * error carrying an `AnalysisErrorCode`; it NEVER substitutes a fixed score, an
 * empty object, a generic recommendation, or any fabricated body. This is the
 * strict posture modelled on `grade-linkedin/validation.ts`, which never
 * fabricates a score.
 *
 * Safe logging: failures log a reason code + a field-path detail only — never the
 * raw model output, prompt, or any provider body.
 *
 * The `AnalysisErrorCode` type import is type-only (erased at runtime), so this
 * module carries no runtime dependency on the taxonomy table.
 */
import { repairTruncatedJSON } from "./json-repair.ts";
import type { AnalysisErrorCode } from "./analysis-error-taxonomy.ts";
import type { z } from "https://esm.sh/zod@3.25.76";

// ── Public contract ──────────────────────────────────────────────

export interface LlmValidationOptions<T> {
  /**
   * Optional feature-specific semantic check that runs AFTER schema validation
   * on the already-typed value (e.g. LinkedIn's rawScore = sum-of-sections). A
   * failure is surfaced as SCHEMA_VALIDATION_FAILED with the supplied safe detail.
   */
  semanticCheck?: (value: T) => { ok: true } | { ok: false; detail: string };
}

export type LlmValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: AnalysisErrorCode; detail: string };

/**
 * Thrown-form of a validation failure for callers that prefer exceptions over
 * the discriminated union. `validateModelOutput` itself never throws for a
 * validation failure — it returns `{ ok: false }`.
 */
export class LlmValidationError extends Error {
  readonly code: AnalysisErrorCode;
  readonly detail: string;
  constructor(code: AnalysisErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "LlmValidationError";
    this.code = code;
    this.detail = detail;
  }
}

// ── Validator ────────────────────────────────────────────────────

export function validateModelOutput<S extends z.ZodTypeAny>(
  rawText: string,
  schema: S,
  opts?: LlmValidationOptions<z.infer<S>>,
): LlmValidationResult<z.infer<S>> {
  // (1) Empty / blank output — the provider returned nothing usable.
  const trimmed = (rawText ?? "").trim();
  if (trimmed.length === 0) {
    return fail("MODEL_INVALID_RESPONSE", "empty model output");
  }

  // (2) Wrapper removal + parse. json-repair strips markdown fences / prose
  //     preamble AND repairs structural truncation; we use it only to obtain a
  //     parse candidate. If even the repaired candidate will not parse, the body
  //     is unrecoverable garbage.
  const repaired = repairTruncatedJSON(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(repaired);
  } catch {
    return fail("MODEL_INVALID_RESPONSE", "model output is not valid JSON");
  }

  // (3) Truncation detection. If the unwrapped-but-unrepaired candidate does not
  //     already parse, json-repair had to close brackets/strings — i.e. the body
  //     was clipped. We REJECT rather than accept the repaired partial object
  //     (LIFE-07: never a partial-but-accepted result).
  if (needsStructuralRepair(rawText)) {
    return fail("MODEL_OUTPUT_TRUNCATED", "model output was truncated");
  }

  // (4) Empty / generic object — {}, [], or an all-null / all-empty body.
  if (isEmptyOrGeneric(parsed)) {
    return fail("MODEL_INVALID_RESPONSE", "model output is empty or generic");
  }

  // (5) Schema validation — required fields, types, ranges. The detail carries
  //     field paths + issue codes only, never the raw model value.
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return fail("SCHEMA_VALIDATION_FAILED", safeIssuePaths(result.error));
  }

  // (6) Optional feature-specific semantic check on the typed value.
  if (opts?.semanticCheck) {
    const sem = opts.semanticCheck(result.data);
    if (!sem.ok) {
      return fail("SCHEMA_VALIDATION_FAILED", sem.detail);
    }
  }

  // Genuine-success path — the ONLY place this function returns ok:true.
  return { ok: true, value: result.data };
}

// ── Internal helpers ─────────────────────────────────────────────

/**
 * Constructs a typed failure and logs a safe reason code + detail. NEVER logs
 * the raw model output/prompt. This is the single failure factory — every
 * failure branch routes through it so no branch can substitute a value.
 */
function fail(code: AnalysisErrorCode, detail: string): { ok: false; code: AnalysisErrorCode; detail: string } {
  console.warn("[llm-validation] validation failed", JSON.stringify({ code, detail }));
  return { ok: false, code, detail };
}

/**
 * True when the body, after wrapper removal only (fence + prose-preamble strip,
 * mirroring json-repair's first steps), still does not parse — meaning structural
 * repair (closing brackets/strings) would be required = truncation. Kept local
 * and intentionally NOT a re-implementation of json-repair's structural pass:
 * it performs wrapper removal only, then a plain parse.
 */
function needsStructuralRepair(raw: string): boolean {
  const unwrapped = stripWrapper(raw);
  try {
    JSON.parse(unwrapped);
    return false;
  } catch {
    return true;
  }
}

/** Fence + prose-preamble removal only (mirrors json-repair's non-structural head). */
function stripWrapper(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if (fence) s = fence[1].trim();
  if (!s.startsWith("{") && !s.startsWith("[")) {
    const objStart = s.indexOf("{");
    const arrStart = s.indexOf("[");
    const start = objStart === -1
      ? arrStart
      : arrStart === -1
      ? objStart
      : Math.min(objStart, arrStart);
    if (start > 0) s = s.slice(start);
  }
  return s;
}

/** True for null/undefined, empty object/array, or an all-null / all-empty body. */
function isEmptyOrGeneric(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v !== "object") return false; // a bare primitive — let the schema judge
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length === 0) return true;
  return entries.every(([, val]) =>
    val === null ||
    val === undefined ||
    (typeof val === "string" && val.trim() === "") ||
    (Array.isArray(val) && val.length === 0)
  );
}

/**
 * Extracts a SAFE detail string from a zod error: field path + issue code only.
 * Never includes received values, so the raw model body cannot leak (LIFE-08).
 */
function safeIssuePaths(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.join(".") || "<root>"}:${i.code}`)
    .join("; ");
}

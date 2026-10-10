/**
 * Deno unit tests for the 13-code analysis error taxonomy (LIFE-08 / feeds LIFE-06).
 *
 * Run with:
 *   deno test _shared/analysis-error-taxonomy.test.ts --no-check --allow-read --allow-env
 *
 * Invariants under test:
 *  - all 13 codes are mapped to { httpStatus, safeMessage, retryable }
 *  - retryable=true ONLY for MODEL_TIMEOUT + MODEL_RATE_LIMITED (LIFE-06 partition)
 *  - no safeMessage leaks payloads / prompts / secrets / raw JSON bodies
 *  - toAnalysisJsonError emits the safe message only (never internal detail)
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ANALYSIS_ERROR_TABLE,
  type AnalysisErrorCode,
  toAnalysisJsonError,
} from "./analysis-error-taxonomy.ts";

const ALL_CODES: AnalysisErrorCode[] = [
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
];

const RETRYABLE = new Set<AnalysisErrorCode>(["MODEL_TIMEOUT", "MODEL_RATE_LIMITED"]);

Deno.test("table contains exactly the 13 codes", () => {
  const keys = Object.keys(ANALYSIS_ERROR_TABLE).sort();
  assertEquals(keys.length, 13);
  assertEquals(keys, [...ALL_CODES].sort());
});

Deno.test("every code maps to a status + message + retryable", () => {
  for (const code of ALL_CODES) {
    const entry = ANALYSIS_ERROR_TABLE[code];
    assert(entry, `missing entry for ${code}`);
    assertEquals(typeof entry.httpStatus, "number");
    assert(entry.httpStatus >= 400 && entry.httpStatus <= 599, `bad status for ${code}`);
    assertEquals(typeof entry.safeMessage, "string");
    assert(entry.safeMessage.length > 0, `empty message for ${code}`);
    assertEquals(typeof entry.retryable, "boolean");
  }
});

Deno.test("retryable partition matches LIFE-06 (only MODEL_TIMEOUT + MODEL_RATE_LIMITED)", () => {
  for (const code of ALL_CODES) {
    assertEquals(
      ANALYSIS_ERROR_TABLE[code].retryable,
      RETRYABLE.has(code),
      `retryable mismatch for ${code}`,
    );
  }
});

Deno.test("DATABASE_SAVE_FAILED is retryable=false (save past generation is permanent, D-03)", () => {
  assertEquals(ANALYSIS_ERROR_TABLE.DATABASE_SAVE_FAILED.retryable, false);
});

Deno.test("no safeMessage leaks payloads / prompts / secrets / raw JSON", () => {
  const forbidden = ["prompt", "stack", "Bearer", "sk-", "eyJ", "{", "}", "SUPABASE", "ANTHROPIC"];
  for (const code of ALL_CODES) {
    const msg = ANALYSIS_ERROR_TABLE[code].safeMessage;
    for (const bad of forbidden) {
      assert(!msg.includes(bad), `safeMessage for ${code} leaks "${bad}": ${msg}`);
    }
  }
});

Deno.test("toAnalysisJsonError returns the safe message with the mapped status", async () => {
  const req = new Request("https://app.example.com/x", { headers: { Origin: "https://app.example.com" } });
  const res = toAnalysisJsonError(req, "MODEL_OUTPUT_TRUNCATED");
  assertEquals(res.status, ANALYSIS_ERROR_TABLE.MODEL_OUTPUT_TRUNCATED.httpStatus);
  const body = await res.json();
  assertEquals(body.error, ANALYSIS_ERROR_TABLE.MODEL_OUTPUT_TRUNCATED.safeMessage);
  assertEquals(body.code, "MODEL_OUTPUT_TRUNCATED");
  assertEquals(body.retryable, false);
});

Deno.test("toAnalysisJsonError never leaks an internal detail argument into the body", async () => {
  const req = new Request("https://app.example.com/x");
  const res = toAnalysisJsonError(req, "SCHEMA_VALIDATION_FAILED", "score:invalid_type -> raw model body");
  const raw = await res.text();
  assert(!raw.includes("raw model body"), "internal detail must not cross to the client");
  assert(!raw.includes("invalid_type"), "internal detail must not cross to the client");
});

Deno.test("retryable flag on the wire matches the table for a transient code", async () => {
  const req = new Request("https://app.example.com/x");
  const res = toAnalysisJsonError(req, "MODEL_RATE_LIMITED");
  const body = await res.json();
  assertEquals(body.retryable, true);
  assertEquals(res.status, ANALYSIS_ERROR_TABLE.MODEL_RATE_LIMITED.httpStatus);
});

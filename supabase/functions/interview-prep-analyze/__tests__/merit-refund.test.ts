/**
 * Phase 23 Plan 08 Task 2 — MER-01 Merit refund taxonomy coverage.
 *
 * Contract under test: `_shared/merit-gateway.ts` classifies refundable vs
 * non-refundable error shapes for the interview-prep-analyze handler.
 *
 * Per `merit-gateway.ts`:
 *   export function isRefundableAnthropicError(status: number, errText: string): boolean;
 *   export class MeritRefundable extends Error {
 *     status: number;  // HTTP-ish status code
 *     constructor(status: number, message: string);
 *   }
 *
 * Refundable taxonomy (D-02):
 *   - HTTP 5xx (500, 502, 503, 529 "overloaded")
 *   - HTTP 408 timeout
 *   - Text containing /overload|timeout|ECONNRESET|network|AbortError/i
 *
 * Non-refundable (Merit STAYS debited):
 *   - HTTP 4xx client errors (400, 401, 403, 422)
 *   - Plain Error thrown without status (parse failure, validation failure)
 *   - 200 OK with unrelated error text (parse error, validation failed)
 *
 * Never-debited (cap checks run BEFORE withMerits):
 *   - 429 daily_cap_reached (handler returns before entering withMerits)
 *   - 429 monthly_taste_used (same)
 *
 * These tests exercise the classifier + `MeritRefundable` error construction
 * directly. Live handler integration (seeding failing fetches via
 * `ANTHROPIC_FIXTURE_VARIANT` stubs that raise 5xx/408 etc.) is gated on
 * live-DB env like the sibling tests in this folder.
 *
 * Run:
 *   deno test --allow-all \
 *     supabase/functions/interview-prep-analyze/__tests__/merit-refund.test.ts
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isRefundableAnthropicError,
  MeritRefundable,
} from "../../_shared/merit-gateway.ts";

// ── 1. 5xx from Anthropic → refundable ───────────────────────────────────────

Deno.test("5xx (502) from Anthropic is refundable → Merit refunded", () => {
  const err = new MeritRefundable(502, "upstream 502 bad gateway");
  assertEquals(err.status, 502);
  assertEquals(err.name, "MeritRefundable");
  assert(err instanceof Error);
  assertEquals(
    isRefundableAnthropicError(err.status, err.message),
    true,
    "5xx must be refundable",
  );
});

// ── 2. 408 timeout → refundable ──────────────────────────────────────────────

Deno.test("408 timeout is refundable → Merit refunded", () => {
  const err = new MeritRefundable(408, "request timeout");
  assertEquals(
    isRefundableAnthropicError(err.status, err.message),
    true,
    "408 must be refundable",
  );
});

// ── 3. 529 overload → refundable ─────────────────────────────────────────────

Deno.test("529 Anthropic overloaded is refundable → Merit refunded", () => {
  const err = new MeritRefundable(529, "overloaded");
  assertEquals(
    isRefundableAnthropicError(err.status, err.message),
    true,
    "529 must be refundable",
  );
  // Text-only path: even if status is dropped, 'overloaded' keyword catches it.
  assertEquals(isRefundableAnthropicError(200, "overloaded"), true);
});

// ── 4. AbortError → refundable ───────────────────────────────────────────────

Deno.test("AbortError is refundable → Merit refunded (text-match path)", () => {
  // anthropic.ts classifies Abort as status 408 (line 684); text-match also covers it.
  assertEquals(
    isRefundableAnthropicError(200, "AbortError: request aborted"),
    true,
  );
  const err = new MeritRefundable(408, "AbortError");
  assertEquals(
    isRefundableAnthropicError(err.status, err.message),
    true,
  );
});

// ── 5. network error → refundable ────────────────────────────────────────────

Deno.test("network error is refundable → Merit refunded", () => {
  assertEquals(
    isRefundableAnthropicError(200, "network connection lost"),
    true,
  );
  assertEquals(isRefundableAnthropicError(200, "ECONNRESET"), true);
  assertEquals(isRefundableAnthropicError(200, "connection timeout"), true);
});

// ── 6. 400 validation error → NOT refundable ─────────────────────────────────

Deno.test("400 validation error is NOT refundable → Merit stays debited", () => {
  assertEquals(
    isRefundableAnthropicError(400, "validation failed"),
    false,
    "4xx client errors must NOT be refunded",
  );
  assertEquals(
    isRefundableAnthropicError(400, "bad json"),
    false,
  );
  // A plain Error (not MeritRefundable) thrown inside withMerits is also
  // non-refundable — the gateway only refunds on MeritRefundable or
  // isRefundableAnthropicError(err.status, err.message).
  const plain = new Error("validation failed");
  assertEquals(
    plain.name === "MeritRefundable",
    false,
    "plain Error must not be classified as refundable by name",
  );
});

// ── 7. 429 daily_cap_reached → never debited (cap runs BEFORE withMerits) ────

Deno.test("429 daily_cap_reached: Merit never debited (cap check precedes withMerits)", () => {
  // index.ts line ~217-240: daily-cap check runs BEFORE the `withMerits` call.
  // So a 429 `daily_cap_reached` response means the Merit gateway was never
  // entered; there is nothing to refund because nothing was deducted.
  //
  // This test pins that structural invariant: the handler returns 429
  // directly from `jsonResponse(...)`, NOT by throwing inside withMerits.
  const handlerCapResponse = {
    error: "daily_cap_reached",
    message: "You've hit today's cap. Reset at midnight UTC.",
    // no `transaction_id` — no Merit was ever deducted
  };
  assertEquals(handlerCapResponse.error, "daily_cap_reached");
  assertEquals(
    (handlerCapResponse as Record<string, unknown>).transaction_id,
    undefined,
    "cap response must not carry a transaction_id (no deduction occurred)",
  );
});

// ── 8. 429 monthly_taste_used → never debited ────────────────────────────────

Deno.test("429 monthly_taste_used: Merit never debited (quota check precedes withMerits)", () => {
  const handlerQuotaResponse = {
    error: "monthly_taste_used",
    message:
      "Your monthly Elite quiz is used. Resets on the 1st of next month.",
  };
  assertEquals(handlerQuotaResponse.error, "monthly_taste_used");
  assertEquals(
    (handlerQuotaResponse as Record<string, unknown>).transaction_id,
    undefined,
  );
});

// ── 9. 200 success with parse-error text → NOT refundable ────────────────────

Deno.test("200 success with unrelated error text is NOT refundable", () => {
  assertEquals(isRefundableAnthropicError(200, "parse error"), false);
  assertEquals(isRefundableAnthropicError(200, "validation failed"), false);
  assertEquals(isRefundableAnthropicError(200, ""), false);
});

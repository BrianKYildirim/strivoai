/**
 * Unit tests for _shared/rate-limiter.ts pure functions.
 * Run with: deno test _shared/rate-limiter.test.ts --no-check --allow-env --allow-net --allow-read
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  windowStart,
  retryAfterSeconds,
  createRateLimitResponse,
} from "./rate-limiter.ts";

// Set APP_URL for all tests that call createRateLimitResponse (needs corsHeaders)
Deno.env.set("APP_URL", "https://test.example.com");

// ── windowStart tests ─────────────────────────────────────────────────────────

Deno.test("windowStart: rounds down to hour boundary (3661 -> 3600)", () => {
  assertEquals(windowStart(3600, 3661), 3600);
});

Deno.test("windowStart: at exact boundary returns boundary (7200 -> 7200)", () => {
  assertEquals(windowStart(3600, 7200), 7200);
});

Deno.test("windowStart: 900s window rounds down (1000 -> 900)", () => {
  assertEquals(windowStart(900, 1000), 900);
});

Deno.test("windowStart: returns correct start for mid-window value", () => {
  // 3600s window, now=5400 (1.5 hours) -> boundary at 3600
  assertEquals(windowStart(3600, 5400), 3600);
});

Deno.test("windowStart: uses current time when nowSeconds is omitted", () => {
  const now = Math.floor(Date.now() / 1000);
  const result = windowStart(3600);
  const expected = Math.floor(now / 3600) * 3600;
  // Allow 1-second tolerance for timing
  assert(result === expected || result === expected - 3600, `got ${result}, expected ~${expected}`);
});

// ── retryAfterSeconds tests ───────────────────────────────────────────────────

Deno.test("retryAfterSeconds: mid-window returns seconds until next boundary (3661 -> 3539)", () => {
  // windowStart = 3600, nowSeconds = 3661, elapsed = 61, remaining = 3600 - 61 = 3539
  assertEquals(retryAfterSeconds(3600, 3661), 3539);
});

Deno.test("retryAfterSeconds: at exact boundary clamps to windowSeconds (never 0)", () => {
  // At 7200 (exact boundary), elapsed = 0, so 3600 - 0 = 3600
  // Math.max(1, ...) ensures never 0; 3600 - 0 = 3600
  const result = retryAfterSeconds(3600, 7200);
  assert(result >= 1, `should be >= 1, got ${result}`);
  assert(result <= 3600, `should be <= 3600, got ${result}`);
});

Deno.test("retryAfterSeconds: always returns >= 1 (never 0 or negative)", () => {
  // Stress test a few boundaries
  const values = [3600, 7200, 10800, 1];
  for (const nowSec of values) {
    const result = retryAfterSeconds(3600, nowSec);
    assert(result >= 1, `retryAfterSeconds(3600, ${nowSec}) returned ${result}, expected >= 1`);
  }
});

Deno.test("retryAfterSeconds: uses current time when nowSeconds is omitted", () => {
  const result = retryAfterSeconds(3600);
  assert(result >= 1, `should be >= 1, got ${result}`);
  assert(result <= 3600, `should be <= 3600, got ${result}`);
});

// ── createRateLimitResponse tests ─────────────────────────────────────────────

Deno.test("createRateLimitResponse: returns 429 status", async () => {
  const response = createRateLimitResponse(120, "user");
  assertEquals(response.status, 429);
});

Deno.test("createRateLimitResponse: includes Retry-After header", async () => {
  const response = createRateLimitResponse(120, "user");
  assertEquals(response.headers.get("Retry-After"), "120");
});

Deno.test("createRateLimitResponse: body contains rate_limit_exceeded", async () => {
  const response = createRateLimitResponse(120, "user");
  const body = await response.json();
  assertEquals(body.error, "rate_limit_exceeded");
});

Deno.test("createRateLimitResponse: body does NOT contain usage_limit_reached", async () => {
  const response = createRateLimitResponse(120, "user");
  const body = await response.json();
  assert(body.error !== "usage_limit_reached", "Must not use usage_limit_reached error code");
});

Deno.test("createRateLimitResponse: body contains numeric retryAfter field", async () => {
  const response = createRateLimitResponse(120, "user");
  const body = await response.json();
  assertEquals(typeof body.retryAfter, "number");
  assertEquals(body.retryAfter, 120);
});

Deno.test("createRateLimitResponse: body contains message field", async () => {
  const response = createRateLimitResponse(120, "user");
  const body = await response.json();
  assert(typeof body.message === "string" && body.message.length > 0, "Should include a message");
});

Deno.test("createRateLimitResponse: Content-Type is application/json", async () => {
  const response = createRateLimitResponse(120, "user");
  assertEquals(response.headers.get("Content-Type"), "application/json");
});

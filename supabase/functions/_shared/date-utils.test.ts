/**
 * Deno unit tests for _shared/date-utils.ts (Phase 12 WR-03).
 *
 * Covers the addOneMonthIso month-end clamping behaviour that was identified as
 * a production bug in Plan 08: naive setUTCMonth overflows into the next month
 * (e.g. Jan 31 -> Mar 3) when the target month has fewer days.  The shared
 * utility must clamp to the last day of the target month instead.
 *
 * No env vars or network access required — addOneMonthIso is a pure function.
 *
 * Run with:
 *   deno test --allow-all --no-check \
 *     supabase/functions/_shared/date-utils.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { addOneMonthIso } from "./date-utils.ts";

// ── Helper ────────────────────────────────────────────────────────────────────

/** Extract the UTC date portion (YYYY-MM-DD) from an ISO string. */
function ymd(iso: string): string {
  return iso.slice(0, 10);
}

// ── Normal (no overflow) cases ────────────────────────────────────────────────

Deno.test("addOneMonthIso: normal mid-month advance — Jan 15 -> Feb 15", () => {
  const result = addOneMonthIso("2026-01-15T00:00:00.000Z");
  assertEquals(ymd(result), "2026-02-15");
});

Deno.test("addOneMonthIso: year boundary — Dec 15 -> Jan 15 next year", () => {
  const result = addOneMonthIso("2026-12-15T00:00:00.000Z");
  assertEquals(ymd(result), "2027-01-15");
});

// ── Month-end clamping cases ──────────────────────────────────────────────────

Deno.test("addOneMonthIso: month-end clamp — Jan 31 -> Feb 28 (non-leap year 2026)", () => {
  // Without clamping: Jan 31 + 1 month = Mar 3 (overflow). Must be Feb 28.
  const result = addOneMonthIso("2026-01-31T00:00:00.000Z");
  assertEquals(ymd(result), "2026-02-28");
});

Deno.test("addOneMonthIso: month-end clamp — Jan 31 -> Feb 29 (leap year 2028)", () => {
  // 2028 is a leap year so Feb has 29 days; no clamping needed.
  const result = addOneMonthIso("2028-01-31T00:00:00.000Z");
  assertEquals(ymd(result), "2028-02-29");
});

Deno.test("addOneMonthIso: month-end clamp — Mar 31 -> Apr 30", () => {
  // April has 30 days so Mar 31 must clamp to Apr 30.
  const result = addOneMonthIso("2026-03-31T00:00:00.000Z");
  assertEquals(ymd(result), "2026-04-30");
});

// ── Input type variants ───────────────────────────────────────────────────────

Deno.test("addOneMonthIso: accepts ISO string input and returns ISO string", () => {
  const result = addOneMonthIso("2026-05-10T12:30:00.000Z");
  // Result must be a parseable ISO string.
  assertEquals(typeof result, "string");
  assertEquals(ymd(result), "2026-06-10");
  // Confirm it round-trips through Date without throwing.
  const parsed = new Date(result);
  assertEquals(isNaN(parsed.getTime()), false);
});

Deno.test("addOneMonthIso: accepts Date object input and returns ISO string", () => {
  const input = new Date("2026-07-20T08:00:00.000Z");
  const result = addOneMonthIso(input);
  assertEquals(typeof result, "string");
  assertEquals(ymd(result), "2026-08-20");
});

/**
 * Shared date utilities for Supabase Edge Functions.
 */

/**
 * Add one calendar month to the given date, clamping to the last day of the
 * target month when the source day exceeds it (e.g. Jan 31 -> Feb 28).
 *
 * Accepts either a Date object or an ISO 8601 string; always returns an
 * ISO 8601 string suitable for Postgres timestamptz columns.
 */
export function addOneMonthIso(from: Date | string): string {
  const d = typeof from === "string" ? new Date(from) : new Date(from.getTime());
  const targetMonth = (d.getUTCMonth() + 1) % 12;
  d.setUTCMonth(d.getUTCMonth() + 1);
  // Clamp: if day overflowed into next month (e.g. Jan 31 -> Mar 3), use last day of target month
  if (d.getUTCMonth() !== targetMonth) {
    d.setUTCDate(0);
  }
  return d.toISOString();
}

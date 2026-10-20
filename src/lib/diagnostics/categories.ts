/**
 * categories.ts — the closed failure taxonomy for client diagnostics (D-13).
 *
 * A category is the ONLY description of *what went wrong* that ever leaves the
 * browser. Raw error text can carry a resume paragraph, a signed storage URL or
 * an email address; a member of this closed set cannot. That is why XLOG-02 is
 * expressible as a guarantee rather than a hope.
 *
 * ── BYTE-MIRRORED WITH THE SERVER ───────────────────────────────────────────
 * These members are mirrored EXACTLY by `CATEGORIES` in
 * `supabase/functions/log-client-diagnostic/index.ts`. Adding, removing or
 * renaming a member REQUIRES editing both files in the same commit —
 * `client-diagnostics.test.ts` parses the edge function source and fails if the
 * two halves drift. The server coerces anything unknown to `unexpected`, so a
 * client-only addition would silently collapse into the default rather than
 * erroring: the drift test is the only thing that makes that visible.
 */

/** The frozen closed set, in the same order as the server's `CATEGORIES`. */
export const DIAGNOSTIC_CATEGORIES = Object.freeze([
  'boot_failure',
  'capability_blocked',
  'chunk_load_failed',
  'storage_blocked',
  'session_expired',
  'upload_failed',
  'extraction_failed',
  'stream_failed',
  'realtime_degraded',
  'poll_failed',
  'render_failed',
  'checkout_failed',
  'unexpected',
] as const);

/** The union type derived from the frozen set. */
export type DiagnosticCategory = (typeof DIAGNOSTIC_CATEGORIES)[number];

/** Fail-closed default. A novel failure is RECORDED as `unexpected`, never dropped. */
export const DEFAULT_DIAGNOSTIC_CATEGORY: DiagnosticCategory = 'unexpected';

const CATEGORY_SET: ReadonlySet<string> = new Set<string>(DIAGNOSTIC_CATEGORIES);

/**
 * Coerces an arbitrary value into the closed set. Mirrors the server's
 * `coerceCategory` exactly, so a record is categorised identically on both
 * sides of the wire.
 */
export function coerceDiagnosticCategory(value: unknown): DiagnosticCategory {
  return typeof value === 'string' && CATEGORY_SET.has(value)
    ? (value as DiagnosticCategory)
    : DEFAULT_DIAGNOSTIC_CATEGORY;
}

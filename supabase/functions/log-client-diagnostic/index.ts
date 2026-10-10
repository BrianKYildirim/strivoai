/**
 * log-client-diagnostic — privacy-safe CLIENT device diagnostics ingest.
 *
 * Phase 03 (Cross-Device Reliability and Compatibility), requirements XLOG-01 /
 * XLOG-02. One row per CLIENT-SIDE FAILURE lands in `public.client_error_diagnostics`
 * so the fleet question "which browser / OS / device combinations fail, at which
 * lifecycle stage, on which app version" becomes answerable. A console log lives on
 * the failing device and never comes back to us (D-11).
 *
 * ── THE ALWAYS-204 CONTRACT (D-11) ──────────────────────────────────────────────
 * Every exit from this endpoint is `204 No Content`: success, silent rate-limit
 * drop, oversize body, malformed JSON, insert failure, unexpected throw. Two reasons,
 * both load-bearing:
 *   1. A diagnostics emit must never be able to fail or delay a user flow, and a
 *      client that cannot observe an outcome cannot branch on one. Same posture as
 *      Phase 02's TOK-01 fire-and-forget telemetry.
 *   2. A prober must not learn whether their payload stored, what the size cap is,
 *      or whether they are being limited.
 * This is a DELIBERATE divergence from the shared rate-limit response helper in
 * `_shared/rate-limiter.ts` (which answers 429 with a Retry-After) — this function
 * imports the limiter but NOT that response builder. See the rate-limit branch below.
 *
 * ── WHY AUTH IS OPTIONAL ────────────────────────────────────────────────────────
 * D-08 puts a browser-capability guard *before* the module bundle, so the failures
 * most worth recording happen before the user is authenticated. A request without a
 * usable `Authorization` header is therefore ACCEPTED and stored with `user_id` NULL.
 * `user_id` is derived ONLY from a verified header via `requireAuth`; a
 * client-asserted `user_id` is never trusted — it is deliberately absent from
 * `ALLOWED_FIELDS` and is therefore dropped like any other unknown key.
 *
 * ── XLOG-02 IS ENFORCED HERE, NOT PROMISED ──────────────────────────────────────
 * `ALLOWED_FIELDS` is a closed list; every key not on it is DROPPED (not sanitized).
 * A client-side sanitizer is a promise — a server-side allowlist survives a future
 * client bug, a careless contributor, and a malicious poster. Layered with a 512-char
 * clamp on every string, a primitives-only value filter, an `error_category` coerced
 * into a closed set, and plan 03-01's schema, which has no column a document, a
 * filename, a stack or a raw error message could land in.
 *
 * ── D-13: NO RAW ADDRESS EVER ───────────────────────────────────────────────────
 * The client address is used only to derive `ip_hash`: a SHA-256 over the address
 * concatenated with the current UTC date as salt, truncated to 16 hex characters.
 * The date salt bounds cross-day correlation. The raw value is never stored and
 * never logged.
 *
 * ── MODELLED RESIDUAL RISK ──────────────────────────────────────────────────────
 * `checkRateLimitByKey` FAILS OPEN on a database error (see `_shared/rate-limiter.ts`),
 * so during a DB incident the limiter is a no-op. That is the correct posture for
 * diagnostics — never fail the user flow — but it is a real hole. It is bounded by
 * the 4 KB body cap, the schema's lack of free-text columns, the client-side
 * per-session emit cap (plan 03-06), and the operator-run retention DELETE.
 *
 * Transport nuance: the client emits via `sendBeacon` with a `text/plain` Blob, which
 * is a CORS *simple* request — so no preflight happens and a CORS response cannot
 * block the send. CORS is not the control here; `ALLOWED_FIELDS` is.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { type UserContext, requireAuth } from '../_shared/auth.ts';
import { withCors } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { checkRateLimitByKey, type RateLimitResult } from '../_shared/rate-limiter.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';

// ── Constants ────────────────────────────────────────────────────────────────

const log = createLogger('log-client-diagnostic');

const DIAGNOSTICS_TABLE = 'client_error_diagnostics';

/**
 * Bodies above this are discarded WITHOUT being parsed. A diagnostics record is a
 * handful of enums and counts; anything larger is either a bug or an attack.
 */
export const MAX_BODY_BYTES = 4096;

/** Every string value is clamped to this many characters before it reaches the row. */
export const MAX_STRING_CHARS = 512;

/** Rate limit: 60 accepted beacons per hour per (truncated, date-salted) address hash. */
export const RATE_LIMIT_PER_WINDOW = 60;
export const RATE_LIMIT_WINDOW_SECONDS = 3600;

/** Length of the truncated ip hash actually persisted / used as the limiter key. */
export const IP_HASH_CHARS = 16;

/**
 * XLOG-02 ENFORCEMENT POINT. Mirrors the client-writable columns of
 * `public.client_error_diagnostics` (migration 20260728000000) exactly.
 *
 * `user_id` and `ip_hash` are SERVER-SET and deliberately ABSENT from this list, so
 * a client cannot assert either one. Adding a free-text key here would defeat
 * XLOG-02 — `index.test.ts` asserts, key by key, that the known-forbidden names
 * never appear on a projected row.
 */
export const ALLOWED_FIELDS = [
  'event_id',
  'app_version',
  'surface',
  'lifecycle_stage',
  'error_category',
  'error_name',
  'script_origin',
  'browser',
  'browser_version',
  'os',
  'os_version',
  'device_type',
  'engine',
  'viewport_w',
  'viewport_h',
  'dpr',
  'is_extension',
  'capability_tier',
  'online',
  'connection_type',
  'user_agent',
  'run_id',
] as const;

/** The closed failure taxonomy. Anything else becomes `unexpected` (fail-closed). */
export const CATEGORIES: ReadonlySet<string> = new Set([
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
]);

export const DEFAULT_CATEGORY = 'unexpected';

// ── Pure helpers (exported so the offline Deno lane can test them directly) ───

/** Clamps a string to `MAX_STRING_CHARS`. The single bounded high-cardinality
 *  field is `user_agent`; the clamp applies uniformly so no field can grow. */
export function clampString(value: string): string {
  return value.length > MAX_STRING_CHARS ? value.slice(0, MAX_STRING_CHARS) : value;
}

/** Coerces an arbitrary value into the closed category set, defaulting to
 *  `unexpected`. A novel failure is recorded, not rejected. */
export function coerceCategory(value: unknown): string {
  return typeof value === 'string' && CATEGORIES.has(value) ? value : DEFAULT_CATEGORY;
}

/** The UTC date (YYYY-MM-DD) used as the ip-hash salt. */
export function utcDateSalt(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Derives the ONLY representation of a client address this system ever persists:
 * SHA-256(address + '|' + UTC date), truncated to `IP_HASH_CHARS` hex characters.
 * Returns null when no address is available, so the row simply carries NULL.
 */
export async function deriveIpHash(
  forwardedFor: string | null | undefined,
  dateSalt: string = utcDateSalt(),
): Promise<string | null> {
  const address = (forwardedFor ?? '').split(',')[0].trim();
  if (!address) return null;

  const bytes = new TextEncoder().encode(`${address}|${dateSalt}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, IP_HASH_CHARS);
}

/**
 * Projects an arbitrary parsed body onto the allowlist and attaches the two
 * server-owned columns.
 *
 * Iterates `ALLOWED_FIELDS` — NEVER the body — so an unknown key has no path onto
 * the row at all. Values that are not primitives (objects, arrays, functions) are
 * dropped: no column in this table has a structured type, and an object is the
 * obvious smuggling vector for the very content XLOG-02 forbids.
 */
export function buildRow(
  body: Record<string, unknown>,
  server: { userId: string | null; ipHash: string | null },
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    // Server-owned. `userId` originates ONLY from a verified requireAuth result;
    // `ipHash` only from deriveIpHash. Neither is on ALLOWED_FIELDS.
    user_id: server.userId,
    ip_hash: server.ipHash,
  };

  for (const field of ALLOWED_FIELDS) {
    const value = body[field];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      row[field] = clampString(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      row[field] = value;
    }
    // anything else (object, array, function, symbol) is dropped
  }

  row.error_category = coerceCategory(row.error_category);
  return row;
}

// ── I/O seam ─────────────────────────────────────────────────────────────────

/** Narrow structural view of the service client — mirrors `_shared/ai-telemetry.ts`'s
 *  approach, and keeps the offline test lane free of any real client. */
type DiagnosticsClient = {
  from: (table: string) => { insert: (row: unknown) => unknown };
};

async function insertDiagnosticRow(row: Record<string, unknown>): Promise<void> {
  const client = getServiceClient() as unknown as DiagnosticsClient;
  const result = (await client.from(DIAGNOSTICS_TABLE).insert(row)) as
    | { error?: { code?: string; message?: string } | null }
    | null
    | undefined;

  const error = result?.error;
  if (error) {
    // Warn only. The caller still answers 204 — a diagnostics write failure is not
    // the client's problem and must never become one.
    log.warn('diagnostic-insert-failed', { code: error.code });
  }
}

export interface HandlerDependencies {
  requireAuth: (req: Request, opts: { type: 'user' }) => Promise<UserContext>;
  checkRateLimitByKey: (
    key: string,
    limit: number,
    windowSecs: number,
  ) => Promise<RateLimitResult>;
  insertRow: (row: Record<string, unknown>) => Promise<void>;
  now: () => Date;
}

const defaultDependencies: HandlerDependencies = {
  requireAuth,
  checkRateLimitByKey,
  insertRow: insertDiagnosticRow,
  now: () => new Date(),
};

// ── Handler ──────────────────────────────────────────────────────────────────

/** The one and only response this endpoint ever produces. */
function noContent(): Response {
  return new Response(null, { status: 204 });
}

export async function handler(
  req: Request,
  deps: HandlerDependencies = defaultDependencies,
): Promise<Response> {
  try {
    // OPTIONS never reaches here — withCors owns preflight. Everything that is not
    // a POST is simply not an ingest and gets the same opaque answer.
    if (req.method !== 'POST') return noContent();

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return noContent();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return noContent();
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return noContent();
    }
    const body = parsed as Record<string, unknown>;

    // Identity-OPTIONAL by design (D-08): a browser-gate or boot failure can happen
    // before login and must still be recordable. requireAuth THROWS a Response on
    // failure, so the catch is what makes auth optional. Not logged at error level —
    // an anonymous beacon is normal traffic here, not an incident.
    let userId: string | null = null;
    try {
      userId = (await deps.requireAuth(req, { type: 'user' })).userId;
    } catch {
      userId = null;
    }

    // D-13: the address is hashed, never stored and never logged.
    const ipHash = await deriveIpHash(
      req.headers.get('x-forwarded-for'),
      utcDateSalt(deps.now()),
    );

    if (ipHash) {
      let allowed = true;
      try {
        const limit = await deps.checkRateLimitByKey(
          `diag:${ipHash}`,
          RATE_LIMIT_PER_WINDOW,
          RATE_LIMIT_WINDOW_SECONDS,
        );
        allowed = limit.allowed;
      } catch {
        // Match the limiter's own fail-open posture rather than failing the beacon.
        allowed = true;
      }
      // DELIBERATE divergence from the shared 429 rate-limit response builder in
      // `_shared/rate-limiter.ts`: a limited beacon is dropped SILENTLY with the same
      // 204 as a stored one. Per D-11 the client must never be able to learn the
      // store/drop outcome, and telling a prober they are limited is free
      // reconnaissance.
      if (!allowed) return noContent();
    }

    const row = buildRow(body, { userId, ipHash });

    try {
      await deps.insertRow(row);
    } catch {
      // Swallowed by contract.
    }

    return noContent();
  } catch {
    // Belt and braces: no unexpected throw may ever escape as a non-204.
    return noContent();
  }
}

export const handleRequest = (req: Request) =>
  withCors(req, 'user', () => handler(req));

serve(handleRequest);

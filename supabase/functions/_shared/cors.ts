/**
 * Centralized CORS module for Supabase Edge Functions.
 *
 * All edge functions import `corsHeaders` / `handleOptionsRequest` from here
 * instead of defining their own CORS headers. Phase 1 (v5.0) reworked this
 * module from a single static origin to a request-aware allowlist and added two
 * CORS-by-construction primitives (`withCors`, `jsonError`).
 *
 * Design decisions:
 * - D-06: Single core, switches on CORS type.
 * - CORS-01/03: Origins resolve from the env-driven `ALLOWED_ORIGINS` allowlist
 *   (comma-separated; each entry trimmed + trailing-slash stripped). The request
 *   `Origin` is echoed in `Access-Control-Allow-Origin` ONLY when it is an exact
 *   member of the allowlist; otherwise the header is omitted (fail-closed) —
 *   never `*` (these are authenticated, bearer-token endpoints).
 * - CORS-04: `Vary: Origin` is set on every origin-dependent response so a CDN /
 *   browser cache keyed without Origin is never replayed cross-origin. `withCors`
 *   and `jsonError` guarantee CORS on success, thrown Response, thrown Error, and
 *   OPTIONS preflight.
 * - D-08: Internal and webhook endpoints return {} (no CORS headers) — unchanged.
 *
 * Note: the legacy single-origin env var is no longer read by this module. It
 * remains in use elsewhere for app-link generation (email CTAs, Stripe return
 * URLs, results URLs).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type CorsType = 'user' | 'internal' | 'webhook';

// ── Allowlist ────────────────────────────────────────────────────────────────
//
// Parsed from `ALLOWED_ORIGINS` and memoized on the raw env string: in
// production the value is fixed for the life of the isolate (so this parses
// once), while tests that mutate the env at runtime re-parse transparently.
// A module-load-time parse would freeze the empty value before any test sets it.

let cachedRaw: string | null = null;
let cachedSet: ReadonlySet<string> = new Set<string>();

function allowedOrigins(): ReadonlySet<string> {
  const raw = Deno.env.get('ALLOWED_ORIGINS') ?? '';
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSet = new Set(
      raw
        .split(',')
        .map((o) => o.trim().replace(/\/$/, ''))
        .filter(Boolean),
    );
  }
  return cachedSet;
}

// ── CORS core ────────────────────────────────────────────────────────────────

const DEFAULT_ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type';

/**
 * Builds the CORS header set for a given type/request.
 *
 * - `internal` / `webhook` → {} (no CORS, not browser-accessible).
 * - `user` → Allow-Headers + Allow-Methods + `Vary: Origin`, plus
 *   `Access-Control-Allow-Origin` echoing the request Origin ONLY when that
 *   origin (trailing slash stripped) is an exact member of the allowlist.
 *   When `req` is absent or its Origin is not allowlisted, ACAO is omitted.
 */
function corsCore(
  type: CorsType,
  req?: Request,
  extraHeaders?: string,
): Record<string, string> {
  if (type === 'internal' || type === 'webhook') {
    return {};
  }

  const allowHeaders = extraHeaders
    ? `${DEFAULT_ALLOW_HEADERS}, ${extraHeaders}`
    : DEFAULT_ALLOW_HEADERS;

  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };

  const origin = (req?.headers.get('Origin') ?? '').replace(/\/$/, '');
  if (origin && allowedOrigins().has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

// ── Retryability ─────────────────────────────────────────────────────────────
//
// Aligns with src/lib/merit-error-messages.ts: transient/overloaded statuses are
// retryable; 4xx validation errors are not. Used to default the optional
// `retryable` sibling on jsonError envelopes.

const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 429, 500, 502, 503, 504, 529]);

function isRetryable(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

// ── corsHeaders (surface-stable shim) ────────────────────────────────────────

/**
 * Returns the appropriate CORS headers for the given endpoint type.
 *
 * Backward-compatible: the existing `{ type, extraHeaders }` first argument is
 * preserved so the ~80 existing call sites keep compiling. The optional `req`
 * second argument enables origin reflection — when omitted, ACAO is omitted
 * (fail-closed). Never throws on missing config.
 */
export function corsHeaders(
  opts: { type: CorsType; extraHeaders?: string },
  req?: Request,
): Record<string, string> {
  return corsCore(opts.type, req, opts.extraHeaders);
}

// ── handleOptionsRequest ─────────────────────────────────────────────────────

/**
 * Returns a pre-flight Response for the given endpoint type. Browser pre-flight
 * (OPTIONS) requests should return this immediately, before any auth. Origin is
 * reflected when `req` is supplied and the Origin is allowlisted.
 */
export function handleOptionsRequest(
  opts: { type: CorsType; extraHeaders?: string },
  req?: Request,
): Response {
  return new Response(null, { headers: corsCore(opts.type, req, opts.extraHeaders) });
}

// ── withCors ─────────────────────────────────────────────────────────────────

/**
 * Wraps a function handler and guarantees CORS headers on every exit:
 * - OPTIONS → origin-aware preflight (handler never runs).
 * - success Response → CORS overlaid (streaming `ReadableStream` body passed
 *   through unbuffered).
 * - thrown Response (e.g. a bare 401 from auth) → CORS merged, returned as-is.
 * - thrown Error → CORS-tagged 500 via jsonError with a generic message (no
 *   internal detail leak, D-13).
 */
export async function withCors(
  req: Request,
  type: CorsType,
  handler: () => Promise<Response> | Response,
  opts?: { extraHeaders?: string },
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return handleOptionsRequest({ type, extraHeaders: opts?.extraHeaders }, req);
  }

  const cors = corsCore(type, req, opts?.extraHeaders);
  try {
    const res = await handler();
    return mergeCors(res, cors);
  } catch (e) {
    if (e instanceof Response) {
      return mergeCors(e, cors);
    }
    return jsonError(req, 500, 'internal_error', {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      retryable: false,
    });
  }
}

/**
 * Returns a new Response with `cors` headers overlaid last (so CORS wins),
 * preserving the original body by reference — a streaming `ReadableStream` is
 * never read or buffered here (RESEARCH Pitfall 4).
 */
function mergeCors(res: Response, cors: Record<string, string>): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(cors)) {
    headers.set(key, value);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

// ── jsonError ────────────────────────────────────────────────────────────────

/**
 * Additive, frontend-readable error envelope. The body is `{ error, ...extra }`
 * with a top-level string `error` (the existing contract) plus optional
 * `message`/`resetDate`/`tier`/`code` siblings and a `retryable` boolean
 * (defaulted from the HTTP status when not supplied). CORS headers for an
 * allowlisted Origin are attached. Does NOT introduce the nested
 * `{ error: { code, message, ... } }` taxonomy (Phase 3 / LIFE-08).
 */
export function jsonError(
  req: Request,
  status: number,
  error: string,
  extra?: { message?: string; resetDate?: string; tier?: string; code?: string; retryable?: boolean },
): Response {
  const body: Record<string, unknown> = { error, ...(extra ?? {}) };
  if (body.retryable === undefined) {
    body.retryable = isRetryable(status);
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsCore('user', req), 'Content-Type': 'application/json' },
  });
}

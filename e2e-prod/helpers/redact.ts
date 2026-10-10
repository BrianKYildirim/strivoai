/**
 * Redaction for anything this suite writes to disk or stdout.
 *
 * Three layers, applied in order:
 *   1. Exact-match on live credential values from the environment.
 *   2. Structural patterns — JWTs, bearer tokens, apikey/access_token query
 *      params, Stripe keys/secrets, any email address.
 *   3. URL normalisation — query strings are dropped entirely from logged URLs,
 *      since Supabase/Stripe both carry tokens there.
 *
 * Everything the suite logs goes through `redact()`. Nothing bypasses it.
 */
import { secretValues } from './env';

const PATTERNS: Array<[RegExp, string]> = [
  // JWTs (Supabase access/refresh tokens, anon keys)
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, '[REDACTED_JWT]'],
  // Stripe keys and client secrets
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{6,}\b/g, '[REDACTED_STRIPE_KEY]'],
  [/\b(?:cs|pi|seti)_[A-Za-z0-9]{6,}_secret_[A-Za-z0-9]{6,}\b/g, '[REDACTED_STRIPE_SECRET]'],
  // Authorization headers / bearer tokens
  [/\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi, 'Bearer [REDACTED]'],
  // Token-bearing query params
  [/([?&](?:apikey|access_token|refresh_token|token|key|secret)=)[^&\s"']+/gi, '$1[REDACTED]'],
  // Any email address
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]'],
];

export function redact(input: unknown): string {
  let text = typeof input === 'string' ? input : safeStringify(input);

  // Layer 1: exact live credential values first, so a value that would not
  // match a structural pattern still gets removed.
  for (const value of secretValues()) {
    text = text.split(value).join('[REDACTED_CREDENTIAL]');
  }

  // Layer 2: structural patterns.
  for (const [pattern, replacement] of PATTERNS) {
    text = text.replace(pattern, replacement);
  }

  return text;
}

/** Strip query/hash from a URL before logging; they carry tokens. */
export function redactUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    return redact(`${u.origin}${u.pathname}`);
  } catch {
    return redact(rawUrl);
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Console helper — the ONLY sanctioned way this suite prints. */
export function safeLog(...parts: unknown[]): void {
  console.log(parts.map((p) => redact(p)).join(' '));
}

/**
 * Postgres-backed fixed-window rate limiter for Supabase Edge Functions.
 *
 * Design decisions:
 * - Fixed-window algorithm: simplest, lowest DB overhead, sufficient for abuse prevention
 * - Postgres atomic upsert via increment_rate_limit RPC: correct under concurrent load
 * - Fail open on DB error: prefer availability over strict enforcement if rate limit DB is down
 * - Distinct error code 'rate_limit_exceeded' vs 'usage_limit_reached' (credits exhaustion)
 * - Retry-After header included per RFC 6585
 */

import { getServiceClient } from './supabase-client.ts';
import { corsHeaders, CorsType } from './cors.ts';
import { createLogger } from './logger.ts';

const log = createLogger('_shared/rate-limiter');

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Endpoint slug used as part of the counter key, e.g. 'analyze-resume' */
  key: string;
  /** Per-tier request limits within the window */
  limits: {
    free: number;
    pro: number;
    elite: number;
  };
  /** Window size in seconds (default: 3600 — 1 hour) */
  windowSeconds?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

// ── Pure helper functions ─────────────────────────────────────────────────────

/**
 * Returns the start of the current fixed window.
 * Rounds `nowSeconds` down to the nearest multiple of `windowSeconds`.
 */
export function windowStart(windowSeconds: number, nowSeconds?: number): number {
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  return Math.floor(now / windowSeconds) * windowSeconds;
}

/**
 * Returns the number of seconds until the start of the next window.
 * Always returns at least 1 (never 0 or negative) per Pitfall 5 in research.
 */
export function retryAfterSeconds(windowSeconds: number, nowSeconds?: number): number {
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  return Math.max(1, windowSeconds - (now % windowSeconds));
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Returns the limit for a given tier.
 * Defaults to the free tier limit for unrecognized tiers (most restrictive).
 */
function getTierLimit(limits: { free: number; pro: number; elite: number }, tier: string): number {
  if (tier === 'pro') return limits.pro;
  if (tier === 'elite') return limits.elite;
  return limits.free; // default: most restrictive
}

// ── checkRateLimit ────────────────────────────────────────────────────────────

/**
 * Checks and increments the rate limit counter for an authenticated user.
 * Called from handleRequest after auth is verified.
 *
 * Fails open on DB errors to avoid blocking users when the rate limit store
 * is unavailable (log warning + allow the request through).
 */
export async function checkRateLimit(
  userId: string,
  tier: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const windowSecs = config.windowSeconds ?? 3600;
  const win = windowStart(windowSecs);
  const limit = getTierLimit(config.limits, tier);
  const key = `user:${userId}:${config.key}`;

  const { data, error } = await getServiceClient().rpc('increment_rate_limit', {
    p_key: key,
    p_window_start: win,
  });

  if (error) {
    log.info('Rate limit DB error — failing open', { key, error: error.message });
    return { allowed: true, retryAfterSeconds: 0, remaining: limit };
  }

  const counter = data as number;
  const remaining = Math.max(0, limit - counter);
  const allowed = counter <= limit;

  if (!allowed) {
    log.warn('Rate limit exceeded', { key, counter, limit, tier });
  }

  return {
    allowed,
    retryAfterSeconds: retryAfterSeconds(windowSecs),
    remaining,
  };
}

// ── checkRateLimitByKey ───────────────────────────────────────────────────────

/**
 * Checks and increments the rate limit counter for an arbitrary key.
 * Used for auth-adjacent endpoints where user identity may not be verified yet
 * (e.g., rate-limit by IP or request identifier).
 */
export async function checkRateLimitByKey(
  key: string,
  limit: number,
  windowSecs: number,
): Promise<RateLimitResult> {
  const win = windowStart(windowSecs);

  const { data, error } = await getServiceClient().rpc('increment_rate_limit', {
    p_key: key,
    p_window_start: win,
  });

  if (error) {
    log.info('Rate limit DB error — failing open', { key, error: error.message });
    return { allowed: true, retryAfterSeconds: 0, remaining: limit };
  }

  const counter = data as number;
  const remaining = Math.max(0, limit - counter);
  const allowed = counter <= limit;

  if (!allowed) {
    log.warn('Rate limit exceeded (by key)', { key, counter, limit });
  }

  return {
    allowed,
    retryAfterSeconds: retryAfterSeconds(windowSecs),
    remaining,
  };
}

// ── createRateLimitResponse ───────────────────────────────────────────────────

/**
 * Formats a 429 Too Many Requests response.
 *
 * - Uses 'rate_limit_exceeded' error code (not 'usage_limit_reached')
 * - Includes Retry-After header per RFC 6585
 */
export function createRateLimitResponse(retryAfterSecs: number, corsType: CorsType): Response {
  return new Response(
    JSON.stringify({
      error: 'rate_limit_exceeded',
      message: 'Too many requests. Please try again later.',
      retryAfter: retryAfterSecs,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders({ type: corsType }),
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSecs),
      },
    },
  );
}

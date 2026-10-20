/**
 * supabase/functions/_shared/cache-fingerprint.ts
 *
 * Single shared SHA-256 cache-key builder for every AI feature on the
 * Phase 37+ analysis_cache path.
 *
 * Why this file exists:
 *   - CACHE-02: every feature must use the SAME helper to compute cache_key
 *     so cross-feature drift is structurally impossible.
 *   - CACHE-11: user_id is the FIRST component of the canonical hash
 *     (D-01) — cross-user cache reads are therefore structurally impossible.
 *     The "differing user_id -> different hash" regression in
 *     cache-fingerprint.test.ts is the enforcement.
 *   - TEST-01: deno test suite ships alongside the helper.
 *
 * IMPORTANT caller contract (BUDGET-03 carry-forward):
 *   Callers MUST pass `opts.inputs` values AFTER per-tier truncation.
 *   Hashing must happen AFTER truncation, not before, so that a free-tier
 *   request and a pro-tier request on the same resume produce different
 *   keys (because they receive different truncated prompts). The helper
 *   is intentionally type-agnostic: enforcement lives at each Phase 37+
 *   feature call-site.
 *
 * Algorithm (two-pass per 29-RESEARCH.md Pattern 2):
 *   Pass 1: hash user_id, feature, tier, variant individually -> each is
 *           pushed as a 64-char hex string into componentHashes[].
 *           Then, for each sorted key k in opts.inputs, push
 *           sha256Hex(`${k}=${canonicalize(v)}`).
 *   Pass 2: sha256Hex(componentHashes.join('|'))
 *
 * Output: a single 64-char lowercase hex string.
 *
 * Web Crypto only — no Node crypto fallback; Deno + Edge runtimes ship
 * crypto.subtle.digest natively (verified in 29-RESEARCH.md and already
 * in use at src/pages/Upload.tsx:145).
 */

import { createLogger } from './logger.ts';

const log = createLogger('cache-fingerprint');
// Kept for future debug callers (e.g., "log the component hashes when
// MERIT_DEBUG=1"); _shared/* modules conventionally instantiate `log`
// at module scope for parity. No hot-path logging.
void log;

/**
 * Inputs to {@link computeCacheKey}. `user_id` is REQUIRED and is the
 * FIRST component of the canonical hash per D-01 — this is what makes
 * CACHE-11 cross-user isolation structural rather than policy.
 */
export interface CacheKeyOpts {
  /** Authenticated Supabase user id — REQUIRED first (D-01 / CACHE-11). */
  user_id: string;
  /** Feature namespace, e.g. 'resume_analysis' | 'linkedin_grading' | 'career_compass'. */
  feature: string;
  /** Subscription tier — different tiers must produce different keys (different truncation). */
  tier: 'free' | 'pro' | 'elite';
  /** Optional prompt/model variant — null / undefined / omitted are equivalent. */
  variant?: string | null;
  /** Post-truncation, feature-specific inputs that uniquely identify the request. */
  inputs: Record<string, string | number | boolean | null | string[]>;
}

/**
 * Web Crypto SHA-256 hex digest of a string. Exported because Plan 29-08
 * (analyze-resume + ocr-pdf) consumes it to populate resumes.text_hash
 * — single source of truth per 29-PATTERNS.md.
 */
export async function sha256Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Canonicalize a single input value into a deterministic string.
 *
 * Rules (29-RESEARCH.md Pattern 2 + Pitfall 2):
 *   - null / undefined       -> ''
 *   - string                 -> v.normalize('NFC').trim()
 *   - string[]               -> JSON.stringify([...v].sort())  (order-insensitive)
 *   - number / boolean / etc -> String(v)
 *
 * NOT exported (29-PATTERNS.md "cache-fingerprint.ts" section):
 * private helpers are intentionally inaccessible so call-sites can only
 * couple to the canonical computeCacheKey contract.
 */
function canonicalize(v: string | number | boolean | null | string[] | undefined): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return JSON.stringify([...v].sort());
  if (typeof v === 'string') return v.normalize('NFC').trim();
  return String(v);
}

/**
 * Build a deterministic 64-char lowercase-hex SHA-256 cache key.
 *
 * Determinism contract:
 *   - Identical `opts` (after canonicalization) always produce the same hash.
 *   - `inputs` key insertion order is irrelevant — keys are sorted before hashing.
 *   - Array values are order-insensitive — elements are sorted before hashing.
 *   - Strings are NFC-normalized + trimmed before hashing.
 *
 * Isolation contract:
 *   - Differing `user_id` always produces a different hash (CACHE-11).
 *   - Differing `feature`, `tier`, or `variant` always produces a different hash.
 *
 * @param opts See {@link CacheKeyOpts}.
 * @returns 64-character lowercase hex SHA-256 digest.
 */
export async function computeCacheKey(opts: CacheKeyOpts): Promise<string> {
  const componentHashes: string[] = [];

  // Pass 1a: header components in fixed positional order (user_id FIRST — D-01).
  componentHashes.push(await sha256Hex(opts.user_id));
  componentHashes.push(await sha256Hex(opts.feature));
  componentHashes.push(await sha256Hex(opts.tier));
  componentHashes.push(await sha256Hex(opts.variant ?? ''));

  // Pass 1b: input fields hashed individually as `${k}=${canonical(v)}`
  // with keys sorted so insertion order is irrelevant.
  const sortedKeys = Object.keys(opts.inputs).sort();
  for (const k of sortedKeys) {
    const v = opts.inputs[k];
    componentHashes.push(await sha256Hex(`${k}=${canonicalize(v)}`));
  }

  // Pass 2: single hash over the concatenated component hashes.
  return await sha256Hex(componentHashes.join('|'));
}

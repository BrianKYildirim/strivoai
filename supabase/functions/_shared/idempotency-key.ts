/**
 * supabase/functions/_shared/idempotency-key.ts
 *
 * Edge-side idempotency-key DERIVATION contract (LIFE-05 / D-02).
 *
 * The Merit gateway seam is already wired (Phase 2, 02-05): `withMerits`
 * forwards `ctx.idempotencyKey ?? null` to the 4-arg `check_and_deduct_merits`
 * RPC (merit-gateway.ts:217), whose partial-unique index makes a repeated key
 * deduct EXACTLY once. This module supplies the missing half — it DERIVES the
 * stable intent hash a feature threads into that seam:
 *
 *   ctx.idempotencyKey = await deriveIdempotencyKey({ userId, feature, tier, inputIdentity, attemptNonce });
 *
 * SECURITY CONTRACT (D-02 — the key is server-derived, never client-trusted):
 *   The frontend sends only a "new run" signal (which mints a fresh
 *   `attemptNonce`). The edge computes the key from the request's intent. A
 *   client-forged key must never be accepted — callers derive it here rather
 *   than reading it off the request body.
 *
 * CACHE-KEY-STABLE CONTRACT (Pitfall 8 / D-06):
 *   `inputIdentity` is an OPAQUE, caller-supplied stable content-identity
 *   (Ph4/5/6 supply a content-hash / latest-input id). It MUST NEVER be composed
 *   from a save-mutated field (e.g. `prior_grade_id`) — a key that shifts after a
 *   save would re-charge a delivered analysis. This function reads no DB row and
 *   no save state; it only hashes the opaque parts it is given, so a save-mutated
 *   field can never structurally leak into the key.
 *
 * ALGORITHM (A1 — 03-RESEARCH.md line 285 / decision A1 line 479):
 *   key = SHA-256(canonical(parts)) → lowercase hex (64 chars), where
 *   `canonical` is a sorted-key JSON serialization of the five parts. Sorting the
 *   keys makes the serialization order-independent (property insertion order can
 *   never change the key), and SHA-256 gives a stable, collision-resistant hash.
 *
 * Web Crypto only — `crypto.subtle.digest` is the Deno / Supabase-Edge runtime
 * primitive (no npm/Node crypto; T-03-SC accepts zero installed packages).
 */

/**
 * The five intent components the idempotency key is derived from.
 *
 * - `userId`        — authenticated Supabase user id (deduction owner).
 * - `feature`       — feature namespace, e.g. 'resume_analysis' | 'linkedin_grading'.
 * - `tier`          — subscription tier at request time.
 * - `inputIdentity` — OPAQUE, per-feature stable content-identity (Ph4/5/6 supply
 *                     a content-hash / latest-input id). NEVER a save-mutated field
 *                     (Pitfall 8 / D-06).
 * - `attemptNonce`  — minted fresh only on a deliberate "new run" signal; an
 *                     accidental resubmit re-uses it → same key → RPC replay.
 */
export interface IdempotencyKeyParts {
  userId: string;
  feature: string;
  tier: string;
  inputIdentity: string;
  attemptNonce: string;
}

/**
 * Build the canonical, order-independent serialization of the intent parts.
 *
 * Keys are sorted (A1) so the resulting string — and therefore the derived key —
 * does not depend on the property insertion order of the passed object. Only the
 * five known `IdempotencyKeyParts` fields are read, so no extraneous/ambient
 * state can enter the hash.
 */
function canonicalize(parts: IdempotencyKeyParts): string {
  const ordered: Record<string, string> = {};
  for (const key of (Object.keys(parts) as (keyof IdempotencyKeyParts)[]).sort()) {
    ordered[key] = parts[key];
  }
  return JSON.stringify(ordered);
}

/**
 * Derive the stable idempotency key for a request's intent.
 *
 * Determinism: identical parts always resolve to the identical key (an accidental
 * resubmit re-derives the same key → the RPC returns `already_deducted`, no second
 * charge). Changing only `attemptNonce` (a deliberate new run) mints a NEW key.
 *
 * @param parts See {@link IdempotencyKeyParts}. `inputIdentity` must be stable
 *   content-identity — never a save-mutated field (Pitfall 8 / D-06).
 * @returns A lowercase 64-character hex SHA-256 digest of the canonical parts.
 */
export async function deriveIdempotencyKey(parts: IdempotencyKeyParts): Promise<string> {
  const canonical = canonicalize(parts);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

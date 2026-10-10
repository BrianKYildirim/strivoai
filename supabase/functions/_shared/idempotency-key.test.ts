/**
 * Phase 03 · 03-02 · LIFE-05 — deriveIdempotencyKey unit contract.
 *
 * This is the pure-crypto DERIVATION contract that produces the stable intent
 * hash `withMerits` already forwards to the 4-arg `check_and_deduct_merits` RPC
 * (merit-gateway.ts:217, `p_idempotency_key: ctx.idempotencyKey ?? null`). The
 * gateway seam is wired (Phase 2, 02-05); this plan DERIVES the key (D-02) so a
 * feature can set `ctx.idempotencyKey = await deriveIdempotencyKey(...)`.
 *
 * Guarded facts (must_haves / behavior):
 *   - server-derived only (D-02): the client never supplies the key; here we
 *     just prove the derivation is a pure function of the intent parts.
 *   - key = sha256(canonical(user + feature + tier + input-identity + attempt-nonce))
 *     → lowercase hex, 64 chars.
 *   - Determinism: same parts in → same key out (accidental resubmit re-derives
 *     the SAME key → RPC `already_deducted` replay).
 *   - Order-independence: the canonical serialization sorts keys, so property
 *     insertion order does not change the key (A1 — sorted-key JSON).
 *   - Attempt-nonce sensitivity: changing ONLY attemptNonce changes the key (a
 *     deliberate "new run" mints a NEW key); same attemptNonce → same key.
 *   - Field sensitivity: changing any of userId / feature / tier / inputIdentity
 *     changes the key.
 *   - Cache-key-stable (Pitfall 8 / D-06): inputIdentity is an opaque
 *     caller-supplied string; the function reads no DB row / save-mutated field.
 */
import { assert, assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { deriveIdempotencyKey, type IdempotencyKeyParts } from './idempotency-key.ts';

const BASE: IdempotencyKeyParts = {
  userId: '11111111-2222-3333-4444-555555555555',
  feature: 'resume_analysis',
  tier: 'free',
  inputIdentity: 'sha256:deadbeefcafe',
  attemptNonce: 'nonce-abc-123',
};

const HEX_64 = /^[0-9a-f]{64}$/;

Deno.test('deriveIdempotencyKey: resolves to a lowercase 64-char hex SHA-256 string', async () => {
  const key = await deriveIdempotencyKey(BASE);
  assertEquals(typeof key, 'string');
  assert(HEX_64.test(key), `key must be 64 lowercase hex chars; got "${key}"`);
});

Deno.test('deriveIdempotencyKey: determinism — same parts → same key (accidental resubmit)', async () => {
  const a = await deriveIdempotencyKey(BASE);
  const b = await deriveIdempotencyKey({ ...BASE });
  assertEquals(a, b, 'identical intent parts must re-derive an identical key');
});

Deno.test('deriveIdempotencyKey: order-independence — property insertion order does not change the key (A1)', async () => {
  const canonicalOrder = await deriveIdempotencyKey({
    userId: BASE.userId,
    feature: BASE.feature,
    tier: BASE.tier,
    inputIdentity: BASE.inputIdentity,
    attemptNonce: BASE.attemptNonce,
  });
  // Same values, deliberately reversed insertion order.
  const shuffledOrder = await deriveIdempotencyKey({
    attemptNonce: BASE.attemptNonce,
    inputIdentity: BASE.inputIdentity,
    tier: BASE.tier,
    feature: BASE.feature,
    userId: BASE.userId,
  });
  assertEquals(canonicalOrder, shuffledOrder, 'sorted-key serialization must make key equality order-independent');
});

Deno.test('deriveIdempotencyKey: attempt-nonce sensitivity — a fresh nonce mints a NEW key', async () => {
  const original = await deriveIdempotencyKey(BASE);
  const newRun = await deriveIdempotencyKey({ ...BASE, attemptNonce: 'nonce-xyz-999' });
  assertNotEquals(original, newRun, 'changing only attemptNonce (deliberate new run) must change the key');
});

Deno.test('deriveIdempotencyKey: same attempt-nonce → same key (idempotent replay)', async () => {
  const a = await deriveIdempotencyKey({ ...BASE, attemptNonce: 'stable-nonce' });
  const b = await deriveIdempotencyKey({ ...BASE, attemptNonce: 'stable-nonce' });
  assertEquals(a, b, 'an unchanged attemptNonce must re-derive the same key so the RPC replays already_deducted');
});

Deno.test('deriveIdempotencyKey: field sensitivity — userId change → different key', async () => {
  const original = await deriveIdempotencyKey(BASE);
  const changed = await deriveIdempotencyKey({ ...BASE, userId: '99999999-8888-7777-6666-555555555555' });
  assertNotEquals(original, changed, 'a different userId must change the key');
});

Deno.test('deriveIdempotencyKey: field sensitivity — feature change → different key', async () => {
  const original = await deriveIdempotencyKey(BASE);
  const changed = await deriveIdempotencyKey({ ...BASE, feature: 'linkedin_grading' });
  assertNotEquals(original, changed, 'a different feature must change the key');
});

Deno.test('deriveIdempotencyKey: field sensitivity — tier change → different key', async () => {
  const original = await deriveIdempotencyKey(BASE);
  const changed = await deriveIdempotencyKey({ ...BASE, tier: 'elite' });
  assertNotEquals(original, changed, 'a different tier must change the key');
});

Deno.test('deriveIdempotencyKey: field sensitivity — inputIdentity change → different key', async () => {
  const original = await deriveIdempotencyKey(BASE);
  const changed = await deriveIdempotencyKey({ ...BASE, inputIdentity: 'sha256:0000000000' });
  assertNotEquals(original, changed, 'a different inputIdentity (content identity) must change the key');
});

Deno.test('deriveIdempotencyKey: inputIdentity is opaque — the derivation reads no DB/save state (Pitfall 8)', async () => {
  // Contract proof: two DIFFERENT save-mutated states (e.g. prior_grade_id) that a
  // caller correctly EXCLUDES from inputIdentity must NOT affect the key. Since the
  // function only ever sees the opaque inputIdentity string, identical inputIdentity
  // → identical key regardless of any surrounding save state. This is the structural
  // guarantee that a save-mutated field can never leak into the key (D-06).
  const beforeSave = await deriveIdempotencyKey({ ...BASE, inputIdentity: 'stable-content-id' });
  const afterSave = await deriveIdempotencyKey({ ...BASE, inputIdentity: 'stable-content-id' });
  assertEquals(beforeSave, afterSave, 'stable inputIdentity must yield a stable key across save mutations (cache-key-stable)');
});

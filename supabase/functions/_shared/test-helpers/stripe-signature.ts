/**
 * Test-only helper: sign a raw payload with the same scheme Stripe webhooks use
 * (`t=<unix>,v1=<hex-hmac-sha256>`) so `stripe.webhooks.constructEventAsync`
 * will accept it in integration tests.
 *
 * Rationale: `Stripe.generateTestHeaderString` does not work on the Deno edge
 * runtime (see supabase/supabase#26126) because the SDK expects Node crypto.
 * This workaround uses `crypto.subtle` directly per 07-RESEARCH
 * §Validation Architecture → Wave 0 Gaps.
 *
 * This file lives under `test-helpers/` and MUST NOT be imported from
 * production code (enforced by grep in CI).
 */
export async function signStripePayload(
  payload: string,
  secret: string,
): Promise<string> {
  const ts = Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedPayload),
  );
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `t=${ts},v1=${hex}`;
}

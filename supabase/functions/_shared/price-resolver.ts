/**
 * Price→Tier reverse map resolver for Stripe webhook handling (STR-04, STR-12).
 *
 * Design (per 07-CONTEXT D-08/D-09/D-10):
 *  - Pricing lives in env vars only: STRIPE_PRICE_{PRO,ELITE}_{MONTHLY,ANNUAL}
 *  - No hardcoded Stripe price ID string literals anywhere in this module
 *  - Unknown priceId → fail-open to 'free' tier + warn log (bad-config surface)
 *  - Map is built lazily on each resolveTier() call so tests can swap env vars
 *    between Deno.test blocks without a module reset hook
 */
import { createLogger } from './logger.ts';

const log = createLogger('price-resolver');

export interface TierInfo {
  tier: 'pro' | 'elite';
  interval: 'monthly' | 'annual';
}

export type Tier = 'free' | 'pro' | 'elite';
export type Interval = 'monthly' | 'annual';

export interface TierAndInterval {
  tier: Tier;
  interval: Interval | null;
}

/**
 * Builds the price-id → TierInfo reverse map from the 4 Stripe price env vars.
 * Rebuilt per-call so unit tests can mutate env state between cases.
 */
export function buildPriceMap(): Record<string, TierInfo> {
  const map: Record<string, TierInfo> = {};
  for (const interval of ['monthly', 'annual'] as const) {
    const suffix = interval.toUpperCase();
    const proId = Deno.env.get(`STRIPE_PRICE_PRO_${suffix}`);
    const paidId = Deno.env.get(`STRIPE_PRICE_PAID_${suffix}`);
    const eliteId = Deno.env.get(`STRIPE_PRICE_ELITE_${suffix}`);

    if (proId) {
      map[proId] = {
        tier: eliteId || paidId ? 'pro' : 'elite',
        interval,
      };
    }
    if (paidId) map[paidId] = { tier: 'elite', interval };
    if (eliteId) map[eliteId] = { tier: 'elite', interval };
  }
  return map;
}

/**
 * Reverse lookup: price ID → tier. Unknown/missing IDs → 'free' (fail-open).
 * Emits a warn log for unknown IDs so bad config surfaces in logs.
 */
export function resolveTier(priceId: string | null | undefined): Tier {
  return resolveTierAndInterval(priceId).tier;
}

/**
 * Server-only reverse lookup preserving the configured billing interval.
 * Unknown, missing, or non-subscription prices deliberately return a nullable
 * interval so callers never infer a billing period from client input.
 */
export function resolveTierAndInterval(
  priceId: string | null | undefined,
): TierAndInterval {
  if (!priceId) return { tier: 'free', interval: null };
  const map = buildPriceMap();
  const hit = map[priceId];
  if (!hit) {
    log.warn('unknown-price-id', { priceId });
    return { tier: 'free', interval: null };
  }
  return hit;
}

/**
 * Forward lookup: (tier, interval) → price ID. Returns null when the env
 * var is unset so callers can surface config errors cleanly.
 */
export function resolvePriceId(
  tier: 'pro' | 'elite',
  interval: Interval,
): string | null {
  const key = `STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()}`;
  const priceId = Deno.env.get(key);
  if (priceId) return priceId;

  if (tier !== 'elite') return null;

  const paidKey = `STRIPE_PRICE_PAID_${interval.toUpperCase()}`;
  const paidPriceId = Deno.env.get(paidKey);
  if (paidPriceId) return paidPriceId;

  const legacyKey = `STRIPE_PRICE_PRO_${interval.toUpperCase()}`;
  const legacyPriceId = Deno.env.get(legacyKey);
  if (legacyPriceId) {
    log.warn('legacy-paid-price-env-used', {
      requestedTier: tier,
      interval,
      fallbackKey: legacyKey,
    });
    return legacyPriceId;
  }

  return null;
}

/**
 * Shop pack Price→Size reverse map resolver for Merit Shop checkout (Phase 12
 * D-16, D-18, SHOP-01..04).
 *
 * Design mirrors price-resolver.ts (sibling file):
 *  - Pricing lives in env vars only: STRIPE_PRICE_MERIT_{3,10,25,50}
 *  - No hardcoded Stripe price ID string literals
 *  - Unknown priceId → null + warn log (bad-config surface)
 *  - Map is built per-call so unit tests can mutate Deno.env between cases
 *
 * Unlike the subscription price resolver (which fails OPEN to 'free' tier for
 * unknown IDs), shop packs fail CLOSED — there is no sensible default pack
 * size, so callers must surface the null explicitly.
 */
import { createLogger } from './logger.ts';

const log = createLogger('shop-pack-resolver');

export type PackSize = 3 | 10 | 25 | 50;

export const PACK_SIZES: readonly PackSize[] = [3, 10, 25, 50] as const;

export function isPackSize(n: unknown): n is PackSize {
  return typeof n === 'number' && (PACK_SIZES as readonly number[]).includes(n);
}

/**
 * Builds the price-id → PackSize reverse map from the 4 shop Merit env vars.
 * Rebuilt per-call so unit tests can mutate env state between cases.
 */
export function buildShopPackMap(): Record<string, PackSize> {
  const map: Record<string, PackSize> = {};
  const pairs: Array<[string | undefined, PackSize]> = [
    [Deno.env.get('STRIPE_PRICE_MERIT_3'),  3],
    [Deno.env.get('STRIPE_PRICE_MERIT_10'), 10],
    [Deno.env.get('STRIPE_PRICE_MERIT_25'), 25],
    [Deno.env.get('STRIPE_PRICE_MERIT_50'), 50],
  ];
  for (const [id, size] of pairs) {
    if (id) map[id] = size;
  }
  return map;
}

/**
 * Reverse lookup: shop price ID → pack size. Unknown/missing IDs return null
 * and emit a warn log so bad config surfaces in logs.
 */
export function resolvePackSize(priceId: string | null | undefined): PackSize | null {
  if (!priceId) return null;
  const hit = buildShopPackMap()[priceId];
  if (!hit) {
    log.warn('unknown-shop-price-id', { priceId });
    return null;
  }
  return hit;
}

/**
 * Forward lookup: pack size → shop price ID. Returns null when the env var
 * is unset so callers can surface config errors cleanly.
 */
export function resolveShopPriceId(packSize: PackSize): string | null {
  return Deno.env.get(`STRIPE_PRICE_MERIT_${packSize}`) ?? null;
}

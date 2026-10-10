/**
 * Pending-upgrade signal (quick 260718-j2x, amendment H-01).
 *
 * A localStorage-backed flag set at Stripe SUBSCRIPTION checkout initiation and read by the
 * onboarding Finish freshness step. It is the reachable-path signal that `?checkout=complete`
 * cannot be: all Stripe return_urls land on /dashboard or /pricing, never /onboarding, so an
 * Elite upgrader who returns to onboarding has no query param to gate on. This flag survives
 * that navigation and lets onboarding block dispatch on a real DB-waiting poll for upgraders
 * only — genuine free users (no flag) are never slowed.
 *
 * A single small module per CLAUDE.md ("avoid unnecessary abstractions — a single helper is
 * enough"). All access is try/catch-guarded so SSR / disabled storage is a safe no-op.
 */
const STORAGE_KEY = 'strivo:pendingUpgrade';
// Freshness window: a purchased upgrade older than this is stale (the webhook has long since
// landed, or the user abandoned) — treat as absent so it can't force a pointless poll later.
const FRESHNESS_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export type PendingUpgradeTier = 'pro' | 'elite';

export function setPendingUpgrade(tier: PendingUpgradeTier): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tier, ts: Date.now() }));
  } catch {
    // SSR / storage disabled / quota — the flag is a best-effort optimization, never fatal.
  }
}

export function getPendingUpgrade(): PendingUpgradeTier | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { tier?: unknown; ts?: unknown };
    const tier = parsed?.tier;
    const ts = parsed?.ts;

    if ((tier !== 'pro' && tier !== 'elite') || typeof ts !== 'number') {
      clearPendingUpgrade();
      return null;
    }
    if (Date.now() - ts > FRESHNESS_WINDOW_MS) {
      clearPendingUpgrade();
      return null;
    }
    return tier;
  } catch {
    // Malformed JSON or read error — clear and treat as absent.
    clearPendingUpgrade();
    return null;
  }
}

export function clearPendingUpgrade(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}

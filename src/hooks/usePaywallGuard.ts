/**
 * usePaywallGuard — Phase 30 Plan 04 (D-13, MER-12) rewrite.
 *
 * Migrated off the legacy usage-tracking RPC gate onto `useMerits()` so the
 * merit gateway is the single decision point for the
 * paywall on the frontend. The backend `withMerits` gateway remains the
 * authoritative enforcement layer; this hook drives UX only.
 *
 * Public return shape is preserved verbatim — 14+ call-sites destructure
 * `{ canAnalyze, tier, analysisCount, limit, resetDate, isLifetimeLimit,
 * loading, modalProps, openModal, triggerPaywall, refresh }` and require no
 * edits. `isLifetimeLimit` is permanently `false` post-MER-01 (no tier has a
 * lifetime cap).
 *
 * Open Q 2 (Phase 30) on `analysisCount`: derived as a proxy
 * `Math.max(0, cap - subscription)` rather than a ledger aggregate.
 * Rationale (RESEARCH §Pattern 6): simpler, deterministic, matches the v2.0
 * mental model where users see "X of Y used"; the ledger aggregate is the
 * authoritative number on the backend dashboard, not on the paywall trigger.
 * If QA flags divergence we can swap this single line for an explicit ledger
 * query without touching the return shape.
 */
import { useMerits } from '@/hooks/useMerits';
import { useAdminTierTest } from '@/contexts/AdminTierTestContext';
import { useOutOfMeritsModal } from './useOutOfMeritsModal';
import { normalizeActiveTier } from '@/config/pricing-config';

interface PaywallStatus {
  canAnalyze: boolean;
  tier: string;
  analysisCount: number;
  limit: number;
  resetDate: string | null;
  isLifetimeLimit: boolean;
  loading: boolean;
}

export function usePaywallGuard() {
  const { getEffectiveTier } = useAdminTierTest();
  const { total, subscription, cap, tier, resetDate, isLoading } = useMerits();
  const { openModal, modalProps } = useOutOfMeritsModal();

  const status: PaywallStatus = {
    canAnalyze: total > 0,
    tier: normalizeActiveTier(getEffectiveTier(tier)),
    // Open Q 2 (Phase 30): proxy derivation; can swap for ledger aggregate if QA flags divergence.
    analysisCount: Math.max(0, cap - subscription),
    limit: cap,
    resetDate,
    isLifetimeLimit: false, // permanently false post-MER-01
    loading: isLoading,
  };

  // useMerits owns React Query invalidation; call-sites that need stale-busting
  // use `useInvalidateMerits()` directly. `refresh` remains in the return shape
  // for compatibility with the legacy contract — it now resolves to the current
  // status snapshot synchronously.
  const refresh = async (): Promise<PaywallStatus> => status;

  const triggerPaywall = (args?: { feature: string; cost: number; balance: number }) =>
    openModal(args ?? { feature: 'Analysis', cost: 0, balance: 0 });

  return {
    ...status,
    modalProps,
    openModal,
    triggerPaywall,
    refresh,
  };
}

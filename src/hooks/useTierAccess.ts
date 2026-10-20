/**
 * useTierAccess — Phase 30 Plan 04 (D-14, MER-12) rewrite.
 *
 * Migrated off the legacy usage-tracking RPC gate onto `useMerits()` so the
 * merit gateway is the single decision point for tier access on the frontend.
 * The QA `AdminTierTestContext` override is preserved verbatim: when an admin
 * is testing a tier, `canUseCredits` is forced true (backend already grants
 * unlimited access for the admin email) and `usageInfo.limit` reads from
 * `MERITS_PER_MONTH[testTier]`.
 *
 * The legacy per-tier cap constant (`free: 3, pro: 100, elite: 300`) is
 * removed (Phase 30, Claude's Discretion per RESEARCH); `MERITS_PER_MONTH` is
 * the single source of truth for tier caps.
 *
 * Public return shape `{ tier, loading, canAccessFeature, canUseCredits,
 * usageInfo }` is preserved — call-sites need no edits. `usageInfo.isLifetime`
 * is permanently `false` post-MER-01 (no tier has a lifetime cap).
 *
 * The `useFeatureGate` helper at the bottom of this file is preserved
 * verbatim — it consumes only the return shape and is unaffected by the
 * migration.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMerits } from '@/hooks/useMerits';
import { useAdminTierTest } from '@/contexts/AdminTierTestContext';
import { MERITS_PER_MONTH, normalizeActiveTier, type Tier } from '@/config/pricing-config';

export type FeatureType =
  | 'resume_analysis'
  | 'career_compass'
  | 'linkedin_grading'
  | 'recruiting_lens'
  | 'interview_prep_coach';

interface TierAccess {
  tier: string;
  loading: boolean;
  canAccessFeature: (feature: FeatureType) => boolean;
  canUseCredits: boolean;
  usageInfo: {
    used: number;
    limit: number;
    isLifetime: boolean;
    resetDate: string | null;
  } | null;
}

// Features available to each tier
const TIER_FEATURES: Record<string, FeatureType[]> = {
  // Free tier: Resume Analysis + Career Compass accessible (credits gate actual usage)
  free: ['resume_analysis', 'career_compass'],
  elite: ['resume_analysis', 'career_compass', 'linkedin_grading', 'recruiting_lens', 'interview_prep_coach'],
  // Admin View: full access to all features regardless of profile tier
  admin: ['resume_analysis', 'career_compass', 'linkedin_grading', 'recruiting_lens', 'interview_prep_coach'],
};

// Legacy per-tier cap constant removed (Phase 30, Claude's Discretion per
// RESEARCH); MERITS_PER_MONTH from src/config/pricing-config.ts is the single
// source of truth for tier caps (`free: 10, pro: 75, elite: 150`).

export function useTierAccess(): TierAccess {
  const { total, subscription, cap, tier: realTier, resetDate, isLoading } = useMerits();
  const { isAdmin, testTier, getEffectiveTier } = useAdminTierTest();

  // Effective tier wraps the real tier from useMerits so the admin override
  // path is preserved verbatim (D-14, AdminTierTestContext integration).
  const effectiveTier = getEffectiveTier(realTier);
  const tier = effectiveTier === 'admin' ? 'admin' : normalizeActiveTier(effectiveTier);

  // Admin tier-test override: simulate the test tier's cap for UX while the
  // backend independently grants unlimited access to the admin email. When no
  // admin override is active, fall back to the merit-gateway cap from useMerits.
  const isAdminOverride = isAdmin && !!testTier;
  const activeTestTier = normalizeActiveTier(testTier);
  const effectiveLimit = isAdminOverride
    ? (MERITS_PER_MONTH[activeTestTier as Tier] ?? 0)
    : cap;
  const effectiveCanUseCredits = isAdminOverride ? true : (total > 0);

  return {
    tier,
    loading: isLoading,
    canAccessFeature: (feature: FeatureType) =>
      (TIER_FEATURES[tier] || TIER_FEATURES.free).includes(feature),
    canUseCredits: effectiveCanUseCredits,
    usageInfo: {
      used: Math.max(0, effectiveLimit - subscription),
      limit: effectiveLimit,
      isLifetime: false,
      resetDate,
    },
  };
}

// Hook for use in pages that need to gate access
export function useFeatureGate(feature: FeatureType) {
  const { tier, loading, canAccessFeature, canUseCredits } = useTierAccess();
  const navigate = useNavigate();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loading) {
      const access = canAccessFeature(feature);
      setHasAccess(access);
    }
  }, [loading, feature, canAccessFeature]);

  return {
    loading,
    hasAccess,
    tier,
    canUseCredits,
    requiresUpgrade: hasAccess === false,
  };
}

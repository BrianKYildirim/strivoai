import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

interface FeatureCost {
  feature: string;
  tier: string;
  cost: number;
}

export function useFeatureCosts() {
  return useQuery({
    queryKey: ['feature-costs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('merit_feature_costs')
        .select('feature, tier, cost');
      if (error) throw error;
      return (data ?? []) as FeatureCost[];
    },
    staleTime: 60_000, // costs rarely change; 1-minute cache
  });
}

/**
 * Returns the merit cost for a (feature, tier) pair.
 *
 * IN-02: Three distinct return values so feature-gating callers can tell
 * "still loading / fetch errored" apart from "feature exists but is not
 * priced for this tier". Without this, a transient DB error would look
 * identical to a legitimately locked feature for up to 60s (staleTime)
 * and could cause gate logic to fail-open or default to free-tier costs.
 *
 *   - undefined → costs not yet loaded OR fetch errored (caller MUST wait
 *     or surface `isError` from the hook before gating).
 *   - null      → feature is not priced for this (feature, tier) pair
 *     (caller should treat as "locked / not available on this tier").
 *   - number    → the merit cost to charge.
 */
export function getCostForFeature(
  costs: FeatureCost[] | undefined,
  feature: string,
  tier: string,
): number | null | undefined {
  if (costs === undefined) return undefined; // still loading or error state
  const entry = costs.find((c) => c.feature === feature && c.tier === tier);
  return entry?.cost ?? null;
}

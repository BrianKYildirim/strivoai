/**
 * LowBalanceWarning — UX-03 (Phase 25 Plan 01).
 *
 * Shared amber/destructive low-balance + out-of-merits banner. Mounts above
 * the Analyze CTA on every gated feature page (and once in TopBar so the
 * dashboard shell surfaces it). Self-guarding: returns null when the
 * threshold has not been crossed and while merit data is loading.
 *
 * Threshold: 2 x cheapestApplicableCost(tier), where the "applicable" set is
 * the subset of MERIT_COST_PER_FEATURE rows where the tier column is non-null
 * (null entries encode tier-locked features and must be filtered out so the
 * Free-tier threshold is computed from { resumeAnalysis, careerCompass,
 * linkedinGrader } only — never from the recruiting/interview-prep null rows).
 *
 * NOTE: useMerits.isLow uses a different signal (20% of cap) and intentionally
 * is NOT consumed here. UX-03 is about cost-aware affordability, not cap %.
 */
import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMerits } from '@/hooks/useMerits';
import { MERIT_COST_PER_FEATURE } from '@/config/pricing-config';

type Tier = 'free' | 'pro' | 'elite';

function cheapestApplicableCost(tier: Tier): number {
  const applicable = Object.values(MERIT_COST_PER_FEATURE)
    .map((row) => row[tier])
    .filter((c): c is number => c !== null && c !== undefined);
  return applicable.length > 0 ? Math.min(...applicable) : 0;
}

export function LowBalanceWarning() {
  const { total, tier, isZero, isLoading } = useMerits();
  if (isLoading) return null;

  // Zero state — D-07
  if (isZero) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 mb-3">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">Out of Merits</span>
        </div>
        <div className="flex items-center gap-2 mt-2 text-sm">
          <Link to="/pricing" className="text-primary hover:underline">
            Buy Merits
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link to="/pricing" className="text-primary hover:underline">
            Upgrade Plan
          </Link>
        </div>
      </div>
    );
  }

  // Low state — D-06
  const threshold = 2 * cheapestApplicableCost(tier as Tier);
  if (threshold > 0 && total < threshold) {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 mb-3">
        <div className="flex items-center gap-2 text-amber-500">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">
            Running low — {total} Merits left
          </span>
        </div>
        <div className="flex items-center gap-2 mt-2 text-sm">
          <Link to="/pricing" className="text-primary hover:underline">
            Buy Merits
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link to="/pricing" className="text-primary hover:underline">
            Upgrade
          </Link>
        </div>
      </div>
    );
  }

  return null;
}

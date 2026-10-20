import { Link } from "react-router-dom";
import { normalizeActiveTier } from "@/config/pricing-config";

interface UpgradeComparisonBannerProps {
  userTier: string;
  packSize: number;
}

export function UpgradeComparisonBanner({
  userTier,
  packSize,
}: UpgradeComparisonBannerProps) {
  const tier = normalizeActiveTier(userTier);

  // Elite users never see upgrade banners
  if (tier === "elite") return null;

  // Free user viewing 25-pack
  if (tier === "free" && packSize === 25) {
    return (
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mt-2">
        <p className="text-sm text-foreground">
          Elite gives you 150 Merits/month plus the richest AI outputs for
          serious job-search momentum.
        </p>
        <Link
          to="/pricing"
          className="text-sm font-semibold text-primary hover:underline"
        >
          View Elite
        </Link>
      </div>
    );
  }

  return null;
}

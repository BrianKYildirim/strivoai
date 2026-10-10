import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMerits } from '@/hooks/useMerits';

interface MeritCostPreviewProps {
  featureCost: number;
}

export function MeritCostPreview({ featureCost }: MeritCostPreviewProps) {
  const { total, isZero, isLoading, canAfford } = useMerits();

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground mb-2">Loading...</p>
    );
  }

  // State 1: Zero balance
  if (isZero) {
    return (
      <div className="mb-2">
        <p className="text-sm text-destructive font-medium">Out of Merits</p>
        <div className="flex items-center gap-2 mt-1 text-sm">
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

  // State 2: Insufficient balance (not zero but can't afford)
  if (!canAfford(featureCost)) {
    return (
      <div className="mb-2">
        <p className="text-sm text-destructive flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4" />
          <span>Not enough Merits ({total} remaining, costs {featureCost})</span>
        </p>
        <div className="flex items-center gap-2 mt-1 text-sm">
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

  // State 3: Low balance (can afford but total < 2x cost)
  if (total < featureCost * 2) {
    return (
      <p className="text-sm text-amber-500 flex items-center gap-1.5 mb-2">
        <AlertTriangle className="h-4 w-4" />
        <span>Costs {featureCost} Merits -- {total} remaining</span>
      </p>
    );
  }

  // State 4: Normal
  return (
    <p className="text-sm text-muted-foreground mb-2">
      Costs {featureCost} Merits -- {total} remaining
    </p>
  );
}

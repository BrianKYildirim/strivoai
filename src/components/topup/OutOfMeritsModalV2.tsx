/**
 * OutOfMeritsModalV2 — Phase 24 Plan 06 (SC-9a).
 *
 * SC-9a: When a gated feature returns 402 'insufficient_merits', show this
 * modal with the exact copy "Out of Merits" and two CTAs in fixed order:
 *   1. Primary   — "Buy a top-up pack" → /pricing#packs  (D-24 deep link)
 *   2. Secondary — "Upgrade plan"      → /pricing
 *
 * UI-SPEC ordering is not negotiable — the top-up path is the immediate
 * remediation; upgrade is the structural one.
 */
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface OutOfMeritsModalV2Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string; // e.g. 'Resume Analysis'
  cost: number; // merits required
  balance: number; // merits user has
}

export function OutOfMeritsModalV2({
  open,
  onOpenChange,
  feature,
  cost,
  balance,
}: OutOfMeritsModalV2Props) {
  const navigate = useNavigate();

  const goToPacks = () => {
    onOpenChange(false);
    navigate('/pricing#packs');
  };
  const goToPricing = () => {
    onOpenChange(false);
    navigate('/pricing');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Out of Merits</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            You need {cost} merits to run {feature}, and you have {balance}. Top up
            with a one-time pack or upgrade your plan for more monthly merits.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-2">
          <Button variant="boxy" className="w-full" onClick={goToPacks}>
            Buy a top-up pack
          </Button>
          <Button variant="boxy-outline" className="w-full" onClick={goToPricing}>
            Upgrade plan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * RunningLowCard — Phase 24 Plan 06 (SC-9c).
 *
 * Dashboard-only glassmorphism card that appears above the score chart when
 * D-08 isLow=true. Nudges the user toward the 25-pack (best-value SKU per
 * PACK_CATALOG) via /pricing#packs with a secondary upgrade CTA.
 *
 * Pricing values are read from PACKS_BY_ID.pack_25 — NEVER hardcode $9.99 /
 * $0.40 (D-01/D-02 single-source-of-truth).
 */
import { useNavigate } from 'react-router-dom';
import { Gem } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMerits } from '@/hooks/useMerits';
import { PACKS_BY_ID } from '@/config/pricing-config';

export function RunningLowCard() {
  const { isLow, isZero, isLoading, subscription } = useMerits();
  const navigate = useNavigate();

  if (isLoading) return null;
  // IN-01: WR-03 widened isLow to include subscription===0. When the balance
  // is fully depleted, the Dashboard renders a destructive "Limit Reached"
  // banner that owns the zero-state nudge — this card would be a redundant,
  // softer duplicate at that moment. Yield to the banner by hiding here.
  if (isZero) return null;
  if (!isLow) return null;

  const pack25 = PACKS_BY_ID.pack_25;
  const price = (pack25.priceCents / 100).toFixed(2);
  const perMerit = (pack25.perMeritCents / 100).toFixed(2);

  return (
    <Card className="p-6 rounded-[--radius-boxy] bg-[--glass-bg] backdrop-blur-lg border border-[--glass-border]">
      <h3 className="font-display text-xl mb-2">Running low?</h3>
      <p className="text-sm text-muted-foreground mb-4">
        You have {subscription} merits left this cycle. A 25-pack adds 25 top-up
        merits that don&apos;t expire.
      </p>
      <div className="flex items-center gap-2 font-mono text-sm mb-4">
        <Gem className="h-4 w-4 text-[--accent-red]" />
        <span>
          {pack25.merits} merits · ${price} · ${perMerit}/Merit
        </span>
      </div>
      <Button
        variant="boxy"
        className="w-full mb-2"
        onClick={() => navigate('/pricing#packs')}
      >
        Buy {pack25.merits} Merits
      </Button>
      <button
        type="button"
        className="text-sm text-[--accent-red] hover:underline w-full text-center"
        onClick={() => navigate('/pricing')}
      >
        Or upgrade your plan →
      </button>
    </Card>
  );
}

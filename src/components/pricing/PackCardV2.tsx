import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { type PackCatalogEntry } from '@/config/pricing-config';
import { cn } from '@/lib/utils';

interface PackCardV2Props {
  pack: PackCatalogEntry;
  onBuy: (packId: string) => void;
}

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function PackCardV2({ pack, onBuy }: PackCardV2Props) {
  const isBestValue = 'isBestValue' in pack && pack.isBestValue === true;

  return (
    <article
      className={cn(
        'relative flex flex-col items-center text-center p-6 bg-card border rounded-lg transition-transform',
        isBestValue
          // UI-SPEC F3 (XD-05): a transform has no layout box to clamp, so a
          // full-width card at 767px became 772px of used width and scrolled
          // the document on all five projects. The emphasis is kept where the
          // grid is multi-column (>= md) and the card is narrower than the
          // viewport; below md the border + shadow already carry it.
          ? 'md:scale-105 border-primary border-2 shadow-lg'
          : 'border-border',
      )}
      aria-label={`Pack ${pack.merits} merits`}
    >
      {isBestValue ? (
        <Badge aria-label="Best Value pack" className="absolute -top-3 uppercase tracking-wide">
          Best Value
        </Badge>
      ) : null}

      <div className="text-5xl font-bold mb-1">{pack.merits}</div>
      <div className="text-muted-foreground text-sm mb-4">merits</div>

      <div className="text-2xl font-bold mb-1">{fmtUsd(pack.priceCents)}</div>
      <div className="text-muted-foreground text-xs mb-6">
        ${(pack.perMeritCents / 100).toFixed(2)} per merit
      </div>

      <Button
        variant={isBestValue ? 'default' : 'outline'}
        onClick={() => onBuy(pack.id)}
        aria-label={`Buy ${pack.merits}-merit pack for ${fmtUsd(pack.priceCents)}`}
        className="w-full"
      >
        Buy now
      </Button>
    </article>
  );
}

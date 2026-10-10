import { PACK_CATALOG } from '@/config/pricing-config';
import { PackCardV2 } from './PackCardV2';

interface PackSectionV2Props {
  onBuy: (packId: string) => void;
}

export function PackSectionV2({ onBuy }: PackSectionV2Props) {
  return (
    <section id="packs" aria-labelledby="packs-heading" className="py-16">
      <div className="max-w-6xl mx-auto px-4">
        <header className="text-center mb-10">
          <h2 id="packs-heading" className="text-3xl font-bold mb-2">
            Need more merits? Grab a top-up pack.
          </h2>
          <p className="text-muted-foreground">
            One-time purchase. Top-up merits never expire and stack on top of your monthly allowance.
          </p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PACK_CATALOG.map((pack) => (
            <PackCardV2 key={pack.id} pack={pack} onBuy={onBuy} />
          ))}
        </div>
      </div>
    </section>
  );
}

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ComingSoonBadge } from '@/components/ComingSoonBadge';
import { PRICING, MERITS_PER_MONTH, type ActiveTier } from '@/config/pricing-config';
import { isInterviewPrepEnabled } from '@/config/feature-flags';
import { cn } from '@/lib/utils';

interface TierCardV2Props {
  tier: ActiveTier;
  interval: 'monthly' | 'annual';
  status?: 'available' | 'current' | 'scheduled';
  onCta: (tier: ActiveTier, interval: 'monthly' | 'annual') => void;
}

const TIER_COPY: Record<ActiveTier, { name: string; tagline: string; bullets: string[]; cta: string }> = {
  free: {
    name: 'Free',
    tagline: 'Try the platform',
    bullets: [
      'Resume analysis, Career Compass, LinkedIn Grader',
      `${MERITS_PER_MONTH.free} merits/month`,
      'Interview Prep + Recruiting Lens locked',
    ],
    cta: 'Start free',
  },
  elite: {
    name: 'Elite',
    tagline: 'Full career intelligence',
    bullets: [
      'Full access to every active AI feature',
      `${MERITS_PER_MONTH.elite} merits/month`,
      'Richest outputs, premium support, and Interview Prep Quiz',
    ],
    cta: 'Upgrade to Elite',
  },
};

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function TierCardV2({ tier, interval, status = 'available', onCta }: TierCardV2Props) {
  const copy = TIER_COPY[tier];
  const price = PRICING[tier][interval];
  const priceLabel = tier === 'free' ? 'Free forever' : `${fmtUsd(price)}/${interval === 'monthly' ? 'mo' : 'yr'}`;
  const isDisabled = status !== 'available';
  const buttonLabel = status === 'current'
    ? 'Current plan'
    : status === 'scheduled'
      ? 'Scheduled'
      : copy.cta;
  // Phase 47 — D-01/D-04: decorate Interview Prep bullets with <ComingSoonBadge />
  // when the production flag is off. pricing-config.ts is intentionally untouched
  // (D-04) — the UI does the conditional render, not the config layer.
  const interviewPrepEnabled = isInterviewPrepEnabled();

  return (
    <article
      className={cn(
        'flex flex-col p-8 bg-card border border-border rounded-lg',
        'transition-transform',
        (tier === 'elite' || status === 'current') && 'scale-[1.02] border-primary',
        status === 'scheduled' && 'border-primary/30 bg-primary/5',
      )}
      aria-label={`${copy.name} tier card`}
    >
      <header className="mb-6">
        <h3 className="font-bold text-2xl">{copy.name}</h3>
        <p className="text-muted-foreground mt-1">{copy.tagline}</p>
        <div className="mt-3 min-h-6">
          {status !== 'available' && (
            <Badge
              variant="outline"
              className={cn(
                'text-foreground',
                status === 'current'
                  ? 'border-primary'
                  : 'border-primary/30 bg-primary/5',
              )}
            >
              {buttonLabel}
            </Badge>
          )}
        </div>
      </header>

      <div className="mb-6">
        <span className="text-3xl font-bold">{priceLabel}</span>
      </div>

      <ul className="flex-1 space-y-2 mb-8">
        {copy.bullets.map((b, i) => {
          const mentionsInterviewPrep = /interview prep/i.test(b);
          const showBadge = mentionsInterviewPrep && !interviewPrepEnabled;
          return (
            <li
              key={i}
              className="text-sm text-foreground flex items-center gap-2 flex-wrap"
            >
              <span>• {b}</span>
              {showBadge && <ComingSoonBadge />}
            </li>
          );
        })}
      </ul>

      <Button
        variant={tier === 'free' ? 'outline' : 'default'}
        onClick={() => {
          if (status !== 'available') return;
          onCta(tier, interval);
        }}
        disabled={isDisabled}
        aria-label={buttonLabel}
      >
        {buttonLabel}
      </Button>
    </article>
  );
}

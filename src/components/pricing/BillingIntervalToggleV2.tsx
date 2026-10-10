import { cn } from '@/lib/utils';

interface BillingIntervalToggleV2Props {
  value: 'monthly' | 'annual';
  onChange: (value: 'monthly' | 'annual') => void;
}

export function BillingIntervalToggleV2({ value, onChange }: BillingIntervalToggleV2Props) {
  return (
    <div
      role="tablist"
      aria-label="Billing interval"
      // UI-SPEC F4 (XD-11, XD-12): both tabs were 36px tall and sat 0px apart.
      className="inline-flex items-center gap-2 p-1 bg-secondary/50 border border-border rounded-full"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === 'monthly'}
        onClick={() => onChange('monthly')}
        className={cn(
          'inline-flex min-h-11 md:min-h-0 items-center justify-center touch-manipulation px-4 py-2 text-sm font-medium uppercase tracking-wide rounded-full transition-colors',
          value === 'monthly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
        )}
      >
        Monthly
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'annual'}
        onClick={() => onChange('annual')}
        className={cn(
          'relative inline-flex min-h-11 md:min-h-0 items-center justify-center touch-manipulation px-4 py-2 text-sm font-medium uppercase tracking-wide rounded-full transition-colors',
          value === 'annual' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
        )}
      >
        Annual
        <span
          aria-hidden
          className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full"
        >
          Save 17%
        </span>
      </button>
    </div>
  );
}

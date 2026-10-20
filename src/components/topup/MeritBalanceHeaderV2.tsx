/**
 * MeritBalanceHeaderV2 — Phase 30 MER-11 (supersedes Phase 24 SC-10 trigger).
 *
 * Trigger format (D-09 / D-17): single value `{subscription + shop} / {cap} merits`,
 * no bonus chip. Examples:
 *   Pro 75 + 3 shop → "78 / 75 merits"
 *   Free 8 + 0 shop → "8 / 10 merits"
 *   Pro 0 + 3 shop → "3 / 75 merits"
 *
 * Typography (UI-SPEC two-weight contract): digits are `font-mono font-semibold`;
 * the suffix `merits` is regular (`text-xs text-muted-foreground`).
 *
 * aria-label (D-12): `Merit balance: {total} of {cap} merits` — drops the prior
 * top-up clause now that the chip is gone.
 *
 * Popover body (lines 64-103) is preserved verbatim per D-10 — the monthly /
 * top-up / total breakdown lives there. The trigger is monolithic; no
 * conditional rendering branches based on `shop`.
 */
import { Gem } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { useMerits } from '@/hooks/useMerits';
import { format } from 'date-fns';

export function MeritBalanceHeaderV2() {
  const { subscription, shop, cap, resetDate, isLoading, isLow, isZero } = useMerits();

  if (isLoading) return <Skeleton className="h-5 w-28" />;

  // UX-01: Trigger button visually flags low/zero balance state.
  // Destructive takes precedence over amber when both could apply.
  const triggerStateClass = isZero
    ? 'bg-destructive/10 text-destructive border border-destructive/30'
    : isLow
      ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
      : '';

  // D-09 / D-17: trigger renders a single `{total} / {cap} merits` value with
  // no conditional bonus chip. D-12: aria-label drops the prior "plus N bonus
  // top-up merits" clause.
  const total = subscription + shop;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex min-h-11 md:min-h-0 touch-manipulation items-center gap-2 px-2 py-1 rounded-[--radius-boxy] hover:bg-white/5 transition-colors ${triggerStateClass}`}
          aria-label={`Merit balance: ${total} of ${cap} merits`}
        >
          <Gem className="h-4 w-4 text-[--accent-red]" />
          <span className="font-mono text-sm font-semibold text-foreground">
            {total} / {cap}
          </span>
          <span className="hidden sm:inline text-xs text-muted-foreground">merits</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-72 p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Monthly (this cycle)</span>
            <span className="font-mono font-medium">
              {subscription} / {cap}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Top-up (never expire)</span>
            <span className="font-mono font-medium">{shop}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Total available</span>
            <span className="font-mono font-semibold">
              {subscription + shop}
            </span>
          </div>
          {resetDate && (
            <p className="text-xs text-muted-foreground">
              Monthly merits reset {format(new Date(resetDate), 'MMM d, yyyy')}
            </p>
          )}
          <div className="flex items-center justify-center gap-2 text-sm">
            <Link
              to="/pricing#packs"
              className="text-[--accent-red] hover:underline"
            >
              Buy merits
            </Link>
            <span className="text-muted-foreground">·</span>
            <Link
              to="/pricing"
              className="text-[--accent-red] hover:underline"
            >
              Change plan
            </Link>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

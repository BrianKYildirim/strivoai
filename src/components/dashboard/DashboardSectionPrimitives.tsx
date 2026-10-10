import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const dashboardShellClass =
  'relative overflow-hidden rounded-3xl border border-border/70 bg-card/70 backdrop-blur-xl shadow-[0_24px_80px_hsl(var(--foreground)/0.08)]';

const clampMeterScore = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

export type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  body: string;
  cta: string;
  href: string;
};

export function EmptyState({
  icon: Icon,
  title,
  body,
  cta,
  href,
}: EmptyStateProps) {
  return (
    <div className={cn(dashboardShellClass, 'p-10 text-center')}>
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
        <Icon className="h-8 w-8" />
      </div>
      <h3 className="text-2xl font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{body}</p>
      <Button className="mt-6 rounded-xl" asChild>
        <Link to={href}>{cta}</Link>
      </Button>
    </div>
  );
}

export type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function SectionHeader({
  eyebrow,
  title,
  description,
}: SectionHeaderProps) {
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-bold tracking-normal text-foreground sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

export type MiniMeterProps = {
  label: string;
  value: number;
  hideLabel?: boolean;
  muted?: boolean;
};

export function MiniMeter({
  label,
  value,
  hideLabel,
  muted,
}: MiniMeterProps) {
  const score = clampMeterScore(value);

  return (
    <div>
      {!hideLabel && (
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span>{score}%</span>
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full bg-primary transition-all duration-500', muted && 'bg-muted-foreground/35')}
          style={{ width: `${score}%` }}
          aria-label={`${label}: ${score}%`}
        />
      </div>
    </div>
  );
}

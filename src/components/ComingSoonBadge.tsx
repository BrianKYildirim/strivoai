/**
 * Phase 47 — Interview Prep production gate.
 *
 * Inline "Coming Soon" tag for use in nav items, dashboard tiles,
 * and pricing feature bullets. Flag-agnostic by design: consumers
 * decide WHEN to render it based on the Interview Prep feature flag
 * (helper introduced in plan 47-02).
 *
 * Uses semantic design tokens (text-muted-foreground, bg-muted,
 * border-border) so light/dark mode work out of the box.
 */
import { cn } from '@/lib/utils';

interface ComingSoonBadgeProps {
  className?: string;
  size?: 'sm' | 'md';
}

export function ComingSoonBadge({ className, size = 'sm' }: ComingSoonBadgeProps) {
  return (
    <span
      aria-label="Interview Prep is coming soon"
      className={cn(
        'inline-flex items-center rounded-full border border-border bg-muted text-muted-foreground font-medium tracking-wide uppercase',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
        className,
      )}
    >
      Coming Soon
    </span>
  );
}

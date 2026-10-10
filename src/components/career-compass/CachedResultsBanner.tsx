import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface CachedResultsBannerProps {
  onRefresh: () => void;
}

export function CachedResultsBanner({ onRefresh }: CachedResultsBannerProps) {
  return (
    // UI-SPEC F3: copy + a `flex-shrink-0` CTA exceeded the 216px content box
    // the dashboard rail leaves at 320px. The row wraps instead of scrolling.
    <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/50 border rounded-lg px-4 py-3">
      <p className="min-w-0 text-sm text-muted-foreground">
        Showing your saved Career Compass results. Click refresh to run a new analysis.
      </p>
      <Button variant="outline" size="sm" onClick={onRefresh} className="flex-shrink-0">
        <RefreshCw className="h-4 w-4 mr-2" />
        Refresh Analysis
      </Button>
    </div>
  );
}

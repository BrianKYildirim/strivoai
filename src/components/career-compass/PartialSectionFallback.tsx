import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface PartialSectionFallbackProps {
  sectionName: string;
  onRerun: () => void;
}

export function PartialSectionFallback({ sectionName, onRerun }: PartialSectionFallbackProps) {
  return (
    <Card className="border-amber-300 bg-amber-50/80 p-6 dark:border-amber-800 dark:bg-amber-950/20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="mt-0.5 rounded-lg bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
              {sectionName}
            </p>
            <h3 className="text-lg font-semibold text-foreground">This section is incomplete</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Re-run this analysis to generate the full report for this tab.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={onRerun} className="shrink-0 gap-2">
          <RefreshCw className="h-4 w-4" />
          Re-run for full report
        </Button>
      </div>
    </Card>
  );
}

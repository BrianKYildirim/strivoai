import { Card } from '@/components/ui/card';
import { CheckCircle2, Zap } from 'lucide-react';

interface StrengthsGapsGridProps {
  strengths: string[];
  gaps: string[];
}

export function StrengthsGapsGrid({ strengths, gaps }: StrengthsGapsGridProps) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="h-5 w-5" style={{ color: "#10b981" }} />
          <h4 className="text-lg font-semibold">What You Have</h4>
        </div>
        <ul className="space-y-3">
          {strengths.map((strength, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <div
                className="mt-1 w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: "#10b981" }}
              />
              <span className="text-foreground/80">{strength}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-5 w-5" style={{ color: "#f59e0b" }} />
          <h4 className="text-lg font-semibold">Gaps to Close</h4>
        </div>
        <ul className="space-y-3">
          {gaps.map((gap, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <div
                className="mt-1 w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: "#f59e0b" }}
              />
              <span className="text-foreground/80">{gap}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

import { Card } from '@/components/ui/card';
import { Compass } from 'lucide-react';
import { BlurredLockCard } from '@/components/BlurredLockCard';
import type { CareerField } from './types';

interface BestFitRolesProps {
  careerFields: CareerField[];
  subscriptionTier: string;
}

const LOCKED_BEST_FIT_PLACEHOLDERS = [
  { title: 'Product Management', score: 86, whyMatch: 'Cross-functional delivery and stakeholder communication map directly to this track.' },
  { title: 'Data Science & Analytics', score: 82, whyMatch: 'Quantitative work history and analytical framing fit this discipline well.' },
  { title: 'Solutions Architect', score: 78, whyMatch: 'Systems thinking paired with technical depth opens architecture doors.' },
  { title: 'Developer Relations', score: 75, whyMatch: 'Communication strengths plus engineering credibility unlock this niche.' },
];

export function BestFitRoles({ careerFields, subscriptionTier }: BestFitRolesProps) {
  const isFree = subscriptionTier === 'free';
  const filteredFields = careerFields
    .filter((f) => f.matchScore >= 75)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, isFree ? 3 : 5);

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <Compass className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-bold">Best-Fit Role Families</h3>
          <p className="text-sm text-muted-foreground">Ranked by your readiness score</p>
        </div>
      </div>
      <div className="space-y-3">
        {filteredFields.map((field, idx) => (
          <div
            key={idx}
            className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-secondary/30 border border-border/50 hover:border-primary/30 transition-colors"
          >
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <span className="text-lg font-bold text-muted-foreground w-6 flex-shrink-0">{idx + 1}</span>
              <div className="min-w-0">
                <h4 className="font-semibold text-foreground">{field.title}</h4>
                <p className="text-sm text-muted-foreground line-clamp-1">{field.whyMatch}</p>
              </div>
            </div>
            {/* UI-SPEC F3 (XD-07): the readiness readout + its fixed 64px bar
                could not shrink and pushed the row 131px past the client width
                below 640px. The row now wraps and the bar shrinks; no value is
                hidden. */}
            <div className="flex min-w-0 flex-shrink items-center gap-3">
              <div className="text-right">
                <span
                  className="text-2xl font-bold"
                  style={{
                    color: field.matchScore >= 80 ? "#10b981" : "#f59e0b",
                  }}
                >
                  {field.matchScore}%
                </span>
                <p className="text-xs text-muted-foreground">ready</p>
              </div>
              <div className="h-2 w-16 min-w-0 max-w-16 flex-shrink rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${field.matchScore}%`,
                    backgroundColor: field.matchScore >= 80 ? "#10b981" : "#f59e0b",
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      {isFree && (
        <div className="mt-3">
          <BlurredLockCard tier="pro" minHeight="min-h-[280px]">
            <div className="space-y-3">
              {LOCKED_BEST_FIT_PLACEHOLDERS.slice(0, 2).map((p, i) => (
                <div
                  key={`locked-best-fit-${i}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-secondary/30 border border-border/50"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <span className="text-lg font-bold text-muted-foreground w-6 flex-shrink-0">{filteredFields.length + i + 1}</span>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-foreground">{p.title}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-1">{p.whyMatch}</p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-muted-foreground">{p.score}%</span>
                </div>
              ))}
            </div>
          </BlurredLockCard>
        </div>
      )}
    </Card>
  );
}

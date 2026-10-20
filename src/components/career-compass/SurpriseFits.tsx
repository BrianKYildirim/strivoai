import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';
import { BlurredLockCard } from '@/components/BlurredLockCard';
import type { SurpriseFit } from './types';

interface SurpriseFitsProps {
  surpriseFits: SurpriseFit[];
  subscriptionTier: string;
}

const LOCKED_SURPRISE_PLACEHOLDERS = [
  { role: 'Technical Program Manager', description: 'Your cross-functional collaboration and project delivery skills map directly to this role.' },
  { role: 'Customer Success Engineer', description: 'Technical fluency paired with customer empathy fits this hybrid track well.' },
  { role: 'Solutions Consultant', description: 'Discovery, scoping, and translating requirements is a natural extension of your background.' },
  { role: 'Developer Advocate', description: 'Communication strengths plus engineering credibility unlock this niche path.' },
];

export function SurpriseFits({ surpriseFits, subscriptionTier }: SurpriseFitsProps) {
  const isFree = subscriptionTier === 'free';
  const visibleFits = [...(surpriseFits || [])]
    .sort((a, b) => b.readinessScore - a.readinessScore)
    .slice(0, isFree ? 2 : undefined);

  return (
    <Card className="p-6 border-2 border-dashed border-accent/30 bg-accent/5">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-accent/10">
          <Sparkles className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h3 className="text-xl font-bold">Surprise Fits</h3>
          <p className="text-sm text-muted-foreground">
            High-readiness roles you might not have considered
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleFits.map((fit, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-background border border-border/50 hover:border-accent/40 transition-colors"
              >
                {/* UI-SPEC F3: `fit.role` is model-supplied. Paired with a
                    `shrink-0` badge the row's min-content exceeded the 320px
                    grid column and widened the document. */}
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <h4 className="min-w-0 font-semibold text-foreground">{fit.role}</h4>
                  <Badge variant="secondary" className="text-xs font-bold shrink-0">
                    {fit.readinessScore}% ready
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{fit.whySurprising}</p>
                <div className="flex flex-wrap gap-1.5">
                  {fit.transferableSkills.map((skill, sIdx) => (
                    <Badge key={sIdx} variant="outline" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
          ))}
        </div>
        {isFree && (
          <BlurredLockCard tier="pro" minHeight="min-h-[220px]">
            <div className="grid gap-3 sm:grid-cols-2">
              {LOCKED_SURPRISE_PLACEHOLDERS.slice(0, 2).map((p, i) => (
                <div key={`locked-surprise-${i}`} className="p-4 border rounded-lg bg-card">
                  <h4 className="font-semibold">{p.role}</h4>
                  <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
                </div>
              ))}
            </div>
          </BlurredLockCard>
        )}
      </div>
    </Card>
  );
}

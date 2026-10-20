import { Card } from '@/components/ui/card';
import { Target } from 'lucide-react';
import { ScoreRing } from './ScoreRing';
import { StrengthsGapsGrid } from './StrengthsGapsGrid';
import { SkillAssessmentTable } from './SkillAssessmentTable';
import { BlurredLockCard } from '@/components/BlurredLockCard';
import type { RoleReadinessBreakdown } from './types';

interface ReadinessTabProps {
  roleReadinessBreakdown?: RoleReadinessBreakdown;
  subscriptionTier: string;
}

export function ReadinessTab({
  roleReadinessBreakdown,
  subscriptionTier,
}: ReadinessTabProps) {
  if (!roleReadinessBreakdown) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">Role Readiness data not available for this analysis.</p>
      </Card>
    );
  }

  const isFree = subscriptionTier === 'free';
  return (
    <>
      <Card className="p-6 text-center" style={{ borderColor: '#FF6B6B' }}>
        <h3 className="text-xl font-semibold mb-4">Role Readiness Score</h3>
        <div className="flex justify-center mb-4">
          <ScoreRing score={roleReadinessBreakdown.overallScore} />
        </div>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-secondary-foreground text-sm font-medium mb-2">
          <Target className="h-4 w-4" style={{ color: '#FF6B6B' }} />
          Target: {roleReadinessBreakdown.targetRole}
        </div>
        {!isFree && roleReadinessBreakdown.industryBenchmark && (
          <p className="text-sm text-muted-foreground">
            vs. {roleReadinessBreakdown.industryBenchmark}
          </p>
        )}
        {!isFree && roleReadinessBreakdown.readinessVerdict && (
          <p className="text-lg text-foreground/80 mt-4 max-w-2xl mx-auto">
            {roleReadinessBreakdown.readinessVerdict}
          </p>
        )}
      </Card>

      {!isFree && roleReadinessBreakdown.strengths && (
        <>
          <StrengthsGapsGrid strengths={roleReadinessBreakdown.strengths} gaps={roleReadinessBreakdown.gaps} />
          <SkillAssessmentTable skillAssessments={roleReadinessBreakdown.skillAssessments} />
        </>
      )}
      {isFree && (
        <BlurredLockCard tier="pro" minHeight="min-h-[420px]">
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg bg-card">
                <h4 className="font-semibold mb-2">Strengths</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Proven skills aligned with role expectations</li>
                  <li>Cross-functional delivery track record</li>
                </ul>
              </div>
              <div className="p-4 border rounded-lg bg-card">
                <h4 className="font-semibold mb-2">Gaps</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>System design depth vs industry standard</li>
                  <li>Formal leadership experience</li>
                </ul>
              </div>
            </div>
            <div className="p-4 border rounded-lg bg-card">
              <h4 className="font-semibold mb-2">Skill-Level Assessment</h4>
              <p className="text-sm text-muted-foreground">Upgrade to see the full readiness assessment.</p>
            </div>
          </div>
        </BlurredLockCard>
      )}
    </>
  );
}

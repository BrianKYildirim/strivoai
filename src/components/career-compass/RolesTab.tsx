import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Sparkles, CheckCircle2, DollarSign, Zap } from 'lucide-react';
import { BlurredLockCard } from '@/components/BlurredLockCard';
import type { CareerRole } from './types';

interface RolesTabProps {
  roles: CareerRole[];
  subscriptionTier: string;
}

const LOCKED_ROLE_PLACEHOLDERS = [
  { title: 'Staff Software Engineer', description: 'Drive technical direction across teams with deep system ownership.', salary: '$185k' },
  { title: 'Principal Engineer', description: 'Set org-wide technical strategy and mentor senior engineers.', salary: '$220k' },
];

export function RolesTab({ roles, subscriptionTier }: RolesTabProps) {
  const isFree = subscriptionTier === 'free';
  const visibleRoles = isFree ? (roles || []).slice(0, 3) : (roles || []);
  return (
    <>
      {visibleRoles.map((role, idx) => (
        <Card key={idx} className={`p-6 ${role.skillAlignmentScore >= 95 ? "ring-2 ring-primary/40" : ""}`}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3 flex-1">
              <h3 className="text-2xl font-bold">{role.title}</h3>
              {role.skillAlignmentScore >= 95 && (
                <Sparkles className="w-6 h-6 animate-pulse flex-shrink-0" style={{ color: "#FF6B6B" }} />
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Skill Alignment</p>
              <div className="flex items-center gap-2">
                <Progress value={role.skillAlignmentScore} className="w-24 h-2" />
                <span className="font-bold" style={{ color: role.skillAlignmentScore >= 80 ? "#10b981" : role.skillAlignmentScore >= 75 ? "#f59e0b" : "#FF6B6B" }}>
                  {role.skillAlignmentScore}%
                </span>
              </div>
            </div>
          </div>

          {/* 95%+ exceptional fit callout */}
          {role.skillAlignmentScore >= 95 && (
            <div className="mb-4 p-3 rounded-lg border bg-primary/5" style={{ borderColor: "rgba(255,107,107,0.4)" }}>
              <p className="text-sm font-semibold mb-2" style={{ color: "#FF6B6B" }}>
                <Sparkles className="inline w-4 h-4 mr-1" />
                Exceptional Fit — You were made for this role
              </p>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0 text-green-500" />
                  <span>Your skills and experience map almost perfectly to what this role requires</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0 text-green-500" />
                  <span>Minimal gaps to close — you could apply to this role today</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0 text-green-500" />
                  <span>Your profile signals strong domain alignment with the specific competencies needed</span>
                </li>
              </ul>
            </div>
          )}

          <p className="text-foreground/70 mb-4">{role.description}</p>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <p className="font-semibold mb-2 flex items-center">
                <DollarSign className="mr-2 h-4 w-4" style={{ color: "#FF6B6B" }} />
                Average Salary
              </p>
              <p className="text-lg font-bold">{role.averageSalary}</p>
            </div>

            {(subscriptionTier === 'pro' || subscriptionTier === 'elite') && (role.skillGaps || []).length > 0 && (
              <div>
                <p className="font-semibold mb-2 flex items-center">
                  <Zap className="mr-2 h-4 w-4" style={{ color: "#FF6B6B" }} />
                  Skill Gaps to Close
                </p>
                <ul className="space-y-1">
                  {(role.skillGaps || []).slice(0, 3).map((gap, i) => (
                    <li key={i} className="text-sm text-foreground/70">
                      • {gap}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="mt-4">
            <p className="font-semibold mb-2 flex items-center">
              <CheckCircle2 className="mr-2 h-4 w-4" style={{ color: "#FF6B6B" }} />
              Steps to Qualify
            </p>
            <ol className="space-y-2">
              {(role.qualificationSteps || []).map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="font-semibold" style={{ color: "#FF6B6B" }}>
                    {i + 1}.
                  </span>
                  <span className="text-foreground/80">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </Card>
      ))}
      {isFree && (
        <BlurredLockCard tier="pro" minHeight="min-h-[320px]">
          <div className="space-y-3">
            {LOCKED_ROLE_PLACEHOLDERS.map((p, i) => (
              <div key={`locked-role-${i}`} className="p-4 border rounded-lg bg-card">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">{p.title}</h4>
                  <span className="text-xs text-muted-foreground">{p.salary}</span>
                </div>
                <p className="text-sm text-muted-foreground">{p.description}</p>
              </div>
            ))}
          </div>
        </BlurredLockCard>
      )}
    </>
  );
}

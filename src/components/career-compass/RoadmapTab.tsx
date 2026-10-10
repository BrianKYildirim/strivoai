import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, Award, Sparkles } from 'lucide-react';
import { BlurredLockCard } from '@/components/BlurredLockCard';
import type { RoadmapItem, RoleRoadmap } from './types';

interface RoadmapTabProps {
  roadmap: RoadmapItem[];
  roleRoadmaps?: RoleRoadmap[];
  subscriptionTier: string;
  selectedRoadmapRole: string;
  onSelectedRoadmapRoleChange: (role: string) => void;
}

const LOCKED_PHASE_PLACEHOLDERS = [
  'Build a portfolio piece that demonstrates your fit for the target role and publish it on a personal site.',
  'Complete a respected industry certification and add measurable, verifiable results to your profile.',
  'Lead a small cross-functional initiative — own scope, timeline, and a documented outcome.',
  'Contribute to two open-source projects with reviewed pull requests to validate your skill set in public.',
  'Network with three operators in the field and convert one connection into a referral conversation.',
];

const getTimeline = (index: number): string => {
  if (index === 0) return "Months 1-2";
  if (index === 1) return "Months 3-5";
  if (index === 2) return "Months 6-8";
  if (index === 3) return "Months 9-10";
  return "Months 11-12";
};

export function RoadmapTab({
  roadmap,
  roleRoadmaps,
  subscriptionTier,
  selectedRoadmapRole,
  onSelectedRoadmapRoleChange,
}: RoadmapTabProps) {
  if (subscriptionTier === 'free') {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Award className="h-8 w-8" style={{ color: "#FF6B6B" }} />
          <h3 className="text-2xl font-bold">Your 12-Month Career Roadmap</h3>
        </div>
        <BlurredLockCard tier="pro" minHeight="min-h-[420px]">
          <div className="space-y-3">
            {[
              { label: 'Months 1-2', text: LOCKED_PHASE_PLACEHOLDERS[0] },
              { label: 'Months 3-5', text: LOCKED_PHASE_PLACEHOLDERS[1] },
              { label: 'Months 6-8', text: LOCKED_PHASE_PLACEHOLDERS[2] },
              { label: 'Months 9-10', text: LOCKED_PHASE_PLACEHOLDERS[3] },
              { label: 'Months 11-12', text: LOCKED_PHASE_PLACEHOLDERS[4] },
            ].map((p, i) => (
              <div key={`locked-free-roadmap-${i}`} className="p-4 border rounded-lg bg-card">
                <h4 className="font-semibold text-sm">{p.label}</h4>
                <p className="text-sm text-muted-foreground mt-1">{p.text}</p>
              </div>
            ))}
          </div>
        </BlurredLockCard>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <Award className="h-8 w-8" style={{ color: "#FF6B6B" }} />
          <h3 className="text-2xl font-bold">Your 12-Month Career Roadmap</h3>
        </div>

        {/* Role-specific dropdown */}
        {roleRoadmaps && roleRoadmaps.length > 0 && (
          <Select
            value={selectedRoadmapRole}
            onValueChange={onSelectedRoadmapRoleChange}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select a role for specific roadmap" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__general__">General Roadmap</SelectItem>
              {roleRoadmaps.map((rm) => (
                <SelectItem key={rm.role} value={rm.role}>
                  {rm.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Role-specific roadmap */}
      {selectedRoadmapRole !== "__general__" && roleRoadmaps ? (() => {
        const selectedRoadmap = roleRoadmaps.find(r => r.role === selectedRoadmapRole);
        if (!selectedRoadmap) return null;
        return (
          <div className="space-y-8">
            <div className="mb-4 p-3 rounded-lg bg-accent/10 border border-accent/20">
              <p className="text-sm font-medium text-accent">
                <Sparkles className="inline h-4 w-4 mr-1" />
                Tailored roadmap for <strong>{selectedRoadmap.role}</strong>
              </p>
            </div>
            {selectedRoadmap.steps.map((step, idx) => (
              <div key={idx} className="relative border-l-4 pl-8 ml-6" style={{ borderColor: "#FF6B6B" }}>
                <div
                  className="absolute -left-3 top-0 bg-accent text-background text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap shadow-lg z-10"
                  style={{ backgroundColor: "#FF6B6B" }}
                >
                  {step.phase}
                </div>
                <h4 className="text-xl font-semibold mb-3 pt-10 pl-2">{step.category}</h4>
                <ul className="space-y-2">
                  {(step.items || []).map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <ArrowRight className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: "#FF6B6B" }} />
                      <span className="text-foreground/80">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {subscriptionTier === 'free' && (
              <div className="ml-6">
                <BlurredLockCard tier="pro" minHeight="min-h-[320px]">
                  <div className="space-y-3">
                    {[
                      { label: 'Months 5-7', text: LOCKED_PHASE_PLACEHOLDERS[0] },
                      { label: 'Months 8-10', text: LOCKED_PHASE_PLACEHOLDERS[1] },
                      { label: 'Months 11-12', text: LOCKED_PHASE_PLACEHOLDERS[2] },
                    ].map((p, i) => (
                      <div key={`locked-phase-${i}`} className="p-4 border rounded-lg bg-card">
                        <h4 className="font-semibold text-sm">{p.label}</h4>
                        <p className="text-sm text-muted-foreground mt-1">{p.text}</p>
                      </div>
                    ))}
                  </div>
                </BlurredLockCard>
              </div>
            )}
          </div>
        );
      })() : (
        /* Fallback: general roadmap */
        <div className="space-y-8">
          {(roadmap || []).map((section, idx) => (
            <div key={idx} className="relative border-l-4 pl-8 ml-6" style={{ borderColor: "#FF6B6B" }}>
              <div
                className="absolute -left-3 top-0 bg-accent text-background text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap shadow-lg z-10"
                style={{ backgroundColor: "#FF6B6B" }}
              >
                {getTimeline(idx)}
              </div>
              <h4 className="text-xl font-semibold mb-3 pt-10 pl-2">{section.category}</h4>
              <ul className="space-y-2">
                {(section.items || []).map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <ArrowRight className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: "#FF6B6B" }} />
                    <span className="text-foreground/80">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

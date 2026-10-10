import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Clock, CheckCircle2 } from 'lucide-react';
import { Sparkles } from 'lucide-react';
import { BlurredLockCard } from '@/components/BlurredLockCard';
import type { CareerField } from './types';

interface FieldsTabProps {
  careerFields: CareerField[];
  subscriptionTier: string;
}

const LOCKED_FIELD_PLACEHOLDERS = [
  { title: 'Software Engineering', match: 85, description: 'Strong alignment with your technical background and project experience.' },
  { title: 'Product Management', match: 78, description: 'Cross-functional skills and stakeholder communication suit this trajectory.' },
  { title: 'Data Science & Analytics', match: 74, description: 'Analytical mindset and quantitative work history map to this discipline.' },
  { title: 'Solutions Architect', match: 71, description: 'Systems thinking plus technical depth open the door to architecture roles.' },
  { title: 'Developer Relations', match: 67, description: 'Communication strengths combined with engineering credibility fit this niche.' },
];

export function FieldsTab({ careerFields, subscriptionTier }: FieldsTabProps) {
  const isFree = subscriptionTier === 'free';
  const visibleFields = isFree ? (careerFields || []).slice(0, 3) : (careerFields || []);
  return (
    <>
      {visibleFields.map((field, idx) => (
        <Card key={idx} className="p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between mb-4">
            {/* UI-SPEC F3: the title + match-score cluster is model-supplied and
                could not shrink below its min-content width, widening the page
                below 640px. */}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-3 mb-2">
                <h3 className="min-w-0 text-2xl font-bold">{field.title}</h3>
                <div className="flex min-w-0 items-center gap-2">
                  {/* UI-SPEC F6 (XD-24): one pulse per career-field card meant three
                      concurrent infinite animations on a single screen. The icon is
                      unchanged; only the infinite loop is removed. */}
                  {field.matchScore >= 20 && (
                    <Sparkles className="w-5 h-5 text-accent" style={{ color: "#FF6B6B" }} />
                  )}
                  <Badge
                    className="text-base px-3 py-1"
                    style={{ backgroundColor: "#FF6B6B", color: "#FFFFFF" }}
                  >
                    {field.matchScore}% Match
                  </Badge>
                </div>
              </div>

              {/* Show dynamic match explanation for ALL career fields */}
              <div
                className="mb-4 p-3 border rounded-lg bg-accent/5"
                style={{ borderColor: "rgba(255, 107, 107, 0.3)" }}
              >
                <p className="text-sm font-semibold mb-2" style={{ color: "#FF6B6B" }}>
                  {field.matchScore >= 95
                    ? "Why This Is An Excellent Match:"
                    : field.matchScore >= 80
                      ? "Why This Is A Strong Match:"
                      : "Why This Is Worth Considering:"}
                </p>
                <ul className="space-y-1 text-xs text-foreground/80">
                  {field.whyMatchDetails && field.whyMatchDetails.length > 0 ? (
                    field.whyMatchDetails.map((detail: string, detailIdx: number) => (
                      <li key={detailIdx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#FF6B6B" }} />
                        <span>{detail}</span>
                      </li>
                    ))
                  ) : (
                    <>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#FF6B6B" }} />
                        <span>
                          Your academic background and work experience align{" "}
                          {field.matchScore >= 90 ? "perfectly" : "well"} with this field's core requirements
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#FF6B6B" }} />
                        <span>
                          Your technical skills and demonstrated achievements match industry expectations at
                          this level
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#FF6B6B" }} />
                        <span>
                          Career trajectory shows{" "}
                          {field.matchScore >= 85 ? "clear progression" : "potential growth"} toward roles in
                          this sector with measurable impact
                        </span>
                      </li>
                    </>
                  )}
                </ul>
              </div>

              <p className="text-foreground/70 mb-4">{field.whyMatch}</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="font-semibold mb-2 flex items-center">
                <DollarSign className="mr-2 h-4 w-4" style={{ color: "#FF6B6B" }} />
                Salary Range
              </p>
              <p className="text-foreground/70">{field.salaryRange}</p>
            </div>
            <div>
              <p className="font-semibold mb-2 flex items-center">
                <Clock className="mr-2 h-4 w-4" style={{ color: "#FF6B6B" }} />
                Timeline
              </p>
              <p className="text-foreground/70">{field.timeline}</p>
            </div>
          </div>

          <div className="mb-4">
            <p className="font-semibold mb-2">Required Skills</p>
            <div className="flex flex-wrap gap-2">
              {(field.requiredSkills || []).map((skill, i) => (
                <Badge key={i} variant="outline" className="text-sm">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <p className="font-semibold mb-2">Top Roles in This Field</p>
            <div className="flex flex-wrap gap-2">
              {(field.recommendedRoles || []).map((role, i) => (
                <Badge key={i} variant="secondary" className="text-sm">
                  {role}
                </Badge>
              ))}
            </div>
          </div>
        </Card>
      ))}
      {isFree && (
        <BlurredLockCard tier="pro" minHeight="min-h-[360px]">
          <div className="space-y-3">
            {LOCKED_FIELD_PLACEHOLDERS.slice(0, 2).map((p, i) => (
              <div key={`locked-field-tab-${i}`} className="p-4 border rounded-lg bg-card">
                <div className="flex items-center gap-3">
                  <h4 className="font-semibold">{p.title}</h4>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{p.match}% match</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">{p.description}</p>
              </div>
            ))}
          </div>
        </BlurredLockCard>
      )}
    </>
  );
}

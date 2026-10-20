import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Award } from 'lucide-react';
import type { SkillAssessment } from './types';

interface SkillAssessmentTableProps {
  skillAssessments: SkillAssessment[];
}

export function SkillAssessmentTable({ skillAssessments }: SkillAssessmentTableProps) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Award className="h-5 w-5" style={{ color: "#FF6B6B" }} />
        <h4 className="text-lg font-semibold">Skill-Level Assessment</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-3 px-2 text-sm font-semibold text-muted-foreground">
                Skill
              </th>
              <th className="text-left py-3 px-2 text-sm font-semibold text-muted-foreground">
                Your Level
              </th>
              <th className="text-left py-3 px-2 text-sm font-semibold text-muted-foreground">
                Industry Expects
              </th>
              <th className="text-left py-3 px-2 text-sm font-semibold text-muted-foreground">
                Gap
              </th>
            </tr>
          </thead>
          <tbody>
            {skillAssessments.map((assessment, idx) => (
              <tr key={idx} className="border-b last:border-b-0">
                <td className="py-3 px-2 font-medium">{assessment.skill}</td>
                <td className="py-3 px-2">
                  <Badge variant="outline" className="text-xs">
                    {assessment.yourLevel}
                  </Badge>
                </td>
                <td className="py-3 px-2">
                  <Badge variant="secondary" className="text-xs">
                    {assessment.industryExpectation}
                  </Badge>
                </td>
                <td className="py-3 px-2">
                  <span
                    className={`text-sm font-medium ${
                      assessment.gap === "None" || assessment.gap === "Exceeds"
                        ? "text-green-600"
                        : assessment.gap === "Minor"
                          ? "text-amber-600"
                          : "text-red-500"
                    }`}
                  >
                    {assessment.gap}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

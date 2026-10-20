import { Card, CardContent } from "@/components/ui/card";
import type { InterviewPrepPayload } from "@/types/interviewPrep";

const LABELS: Record<InterviewPrepPayload["prep_roadmap"][number]["when"], string> = {
  today: "Today",
  this_week: "This week",
  before_interview: "Before interview",
};

export function PrepRoadmap({ steps }: { steps: InterviewPrepPayload["prep_roadmap"] }) {
  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold mb-3">Prep Roadmap</h3>
        <ol className="space-y-2 text-sm">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="font-medium text-primary">{LABELS[s.when]}:</span> {s.action}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

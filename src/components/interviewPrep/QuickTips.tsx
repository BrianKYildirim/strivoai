import { Card, CardContent } from "@/components/ui/card";
import type { InterviewPrepPayload } from "@/types/interviewPrep";

export function QuickTips({ tips }: { tips: InterviewPrepPayload["quick_tips"] }) {
  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold mb-3">Quick Tips</h3>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
          {tips.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

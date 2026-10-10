import { Card, CardContent } from "@/components/ui/card";
import type { InterviewPrepPayload } from "@/types/interviewPrep";

export function CoachingAdvice({ data }: { data: InterviewPrepPayload["coaching_advice"] }) {
  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <p className="text-sm">{data.advice}</p>
        <p className="text-sm">
          <span className="font-semibold text-primary">Biggest score mover:</span> {data.biggest_score_mover}
        </p>
      </CardContent>
    </Card>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { InterviewPrepPayload } from "@/types/interviewPrep";

export function ReadinessHero({ data }: { data: InterviewPrepPayload["your_prep_readiness"] }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Your Prep Readiness</h2>
          <span className="text-3xl font-bold">{data.score}/100</span>
        </div>
        <Progress value={data.score} className="mt-4" />
        <p className="mt-2 text-sm font-medium capitalize">{data.band.replace(/_/g, " ")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{data.one_line_verdict}</p>
      </CardContent>
    </Card>
  );
}

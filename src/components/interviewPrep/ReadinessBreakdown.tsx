import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { InterviewPrepPayload } from "@/types/interviewPrep";

export function ReadinessBreakdown({ data }: { data: InterviewPrepPayload["readiness_breakdown"] }) {
  const rows = [
    { label: "Resume alignment", value: data.resume_alignment },
    { label: "JD alignment", value: data.jd_alignment },
    { label: "STAR depth", value: data.star_depth },
    { label: "Communication", value: data.communication },
  ];
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <h3 className="text-lg font-semibold">Readiness Breakdown</h3>
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex justify-between text-sm">
              <span>{r.label}</span>
              <span className="tabular-nums text-muted-foreground">{r.value}/100</span>
            </div>
            <Progress value={r.value} className="mt-1" />
          </div>
        ))}
        <p className="text-sm text-muted-foreground">{data.notes}</p>
      </CardContent>
    </Card>
  );
}

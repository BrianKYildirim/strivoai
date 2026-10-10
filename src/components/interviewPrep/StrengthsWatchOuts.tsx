import { Card, CardContent } from "@/components/ui/card";
import type { InterviewPrepPayload } from "@/types/interviewPrep";

export function StrengthsWatchOuts({ data }: { data: InterviewPrepPayload["strengths_and_watchouts"] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-3">Strengths</h3>
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            {data.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-3">Watch outs</h3>
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            {data.watch_outs.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import type { InterviewPrepPayload } from "@/types/interviewPrep";

export function FocusAreas({ data }: { data: InterviewPrepPayload["focus_areas"] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {data.map((f, i) => (
        <Card key={i}>
          <CardContent className="p-6 space-y-2">
            <h3 className="text-base font-semibold">{f.title}</h3>
            <p className="text-sm text-muted-foreground">{f.why}</p>
            <p className="text-sm">
              <span className="font-medium text-primary">Do:</span> {f.what_to_do}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

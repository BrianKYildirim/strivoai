import { Card, CardContent } from "@/components/ui/card";

export interface QuizResultScore {
  question_id: string;
  score: number;
  breakdown?: Record<string, number>;
  suggestions: string[];
}

export function QuizResults({ result }: { result: { scores: QuizResultScore[] } }) {
  return (
    <div className="space-y-4">
      {result.scores.map((s) => (
        <Card key={s.question_id}>
          <CardContent className="p-6 space-y-2">
            <p className="font-semibold">
              Q{s.question_id}: <span className="tabular-nums">{s.score}/100</span>
            </p>
            {s.breakdown && (
              <ul className="text-sm text-muted-foreground">
                {Object.entries(s.breakdown).map(([k, v]) => (
                  <li key={k}>
                    {k}: {v}
                  </li>
                ))}
              </ul>
            )}
            <ul className="list-disc pl-5 text-sm">
              {s.suggestions.map((sg, i) => (
                <li key={i}>{sg}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

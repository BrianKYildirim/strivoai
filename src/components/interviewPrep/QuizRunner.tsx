import { useState } from "react";
import { CharacterCounter } from "./CharacterCounter";
import { invokeWithTimeout } from "@/lib/fetchWithTimeout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { InterviewPrepPayload } from "@/types/interviewPrep";

type QuizItems = Extract<InterviewPrepPayload["practice_questions"], { mode: "quiz" }>["items"];

export interface QuizRunnerProps {
  quizId: string;
  questions: QuizItems;
  onComplete: (result: unknown) => void;
  onError: (err: string) => void;
}

export function QuizRunner({ quizId, questions, onComplete, onError }: QuizRunnerProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const anyOver500 = Object.values(answers).some((a) => a.length > 500);

  const handleSubmit = async () => {
    if (anyOver500 || submitting) return;
    setSubmitting(true);
    const { data, error } = await invokeWithTimeout(
      "interview-prep-evaluate",
      {
        body: {
          quiz_id: quizId,
          answers: questions.map((q) => ({
            question_id: String(q.id),
            answer_text: answers[q.id] ?? "",
          })),
        },
      },
      120000,
    );
    setSubmitting(false);
    if (error || !data) {
      onError(error?.message ?? "Evaluation failed.");
      return;
    }
    onComplete(data);
  };

  return (
    <div className="space-y-6">
      {questions.map((q) => {
        const value = answers[q.id] ?? "";
        return (
          <Card key={q.id}>
            <CardContent className="p-6 space-y-2">
              <p className="font-medium">
                Q{q.id}: {q.question}
              </p>
              <p className="text-xs text-muted-foreground">{q.competency}</p>
              <textarea
                value={value}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                className="w-full mt-2 rounded-md border border-input bg-background p-2 text-sm"
                rows={6}
              />
              <CharacterCounter value={value.length} max={500} />
            </CardContent>
          </Card>
        );
      })}
      <Button onClick={handleSubmit} disabled={anyOver500 || submitting}>
        {submitting ? "Submitting..." : "Submit Answers"}
      </Button>
    </div>
  );
}

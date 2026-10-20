import { FlashcardCard } from "@/components/FlashcardCard";
import type { InterviewPrepPayload } from "@/types/interviewPrep";

type FlashcardItems = Extract<InterviewPrepPayload["practice_questions"], { mode: "flashcard" }>["items"];

export function FlashcardDeck({ flashcards }: { flashcards: FlashcardItems }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {flashcards.map((f, i) => (
        <div key={i} className="space-y-2">
          <FlashcardCard
            question={f.question}
            competency={f.competency}
            answer={f.star_answer}
            index={i}
          />
          <p className="text-xs text-muted-foreground italic px-2">Coach: {f.coach_note}</p>
        </div>
      ))}
    </div>
  );
}

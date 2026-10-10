import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/pages/InterviewPrep.tsx'), 'utf8');

describe('InterviewPrep history hydration contract', () => {
  it('gates id hydration behind the feature flag', () => {
    expect(source).toContain('const hydratedQuizId = searchParams.get("id")');
    expect(source).toContain('if (!hydratedQuizId || !interviewPrepEnabled) return');
  });

  it('loads interview_quizzes and interview_quiz_answers for saved quiz mode', () => {
    expect(source).toContain('.from("interview_quizzes")');
    expect(source).toContain('.from("interview_quiz_answers")');
    expect(source).toContain('dispatch({ type: "generate-success", response })');
  });

  it('hydrates saved flashcard rows into flashcard results', () => {
    expect(source).toContain('quiz.mode === "flashcard"');
    expect(source).toContain('mode: "flashcard"');
    expect(source).toContain('const flashcards = [');
  });
});

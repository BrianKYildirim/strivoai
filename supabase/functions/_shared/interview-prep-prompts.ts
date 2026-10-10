/**
 * Prompt construction module for the Interview Prep feature (Phase 23 rewrite).
 *
 * Emits the Runtime §10 nine-section contract via three tier branches
 * (Pro flashcard / Elite quiz / Pro monthly Elite-taste quiz) that share
 * a single base-prompt helper per D-10.
 *
 * Registers the 'interview' feature key in the tier-prompts registry at
 * module load so Plan 03's `loadPromptVariant('interview', tier, params)`
 * auto-prepends STRIVO_GLOBAL_AI_PRINCIPLES for Pro/Elite (not Free).
 *
 * The `PromptVariantBuilder` type has only three keys (free / pro / elite).
 * The Elite-taste branch is selected INSIDE the `pro` builder based on
 * `params.variant === 'elite_taste'`, because Pro users who trigger the
 * monthly taste still come in on tier='pro' and the variant discriminator
 * lives in params.
 *
 * Also exports a standalone `buildEvaluationPrompt` consumed by the
 * `interview-prep-evaluate` edge function (IPC-04). Evaluation is Elite-only
 * and not tier-variant, so it is exported directly rather than registered.
 *
 * @see D-10 (shared base + tier branches)
 * @see D-11 (no-silent-drops: prompt explicitly references optional intake fields)
 * @see Runtime §10 (nine-section output contract)
 * @see Runtime §7.2 (duration → question count: 15/30 → 5, 45 → 6, 60 → 7)
 * @see Runtime §5 (resume grounding: cite resume_anchor or set signal_missing)
 * @see Runtime §11 (honest scoring: do not anchor to 75)
 */

import { registerFeaturePrompts, type PromptVariantBuilder } from './tier-prompts.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InterviewPrepPromptParams {
  resumeText: string;
  jobDescription: string;
  backgroundContext?: string;
  roleTitle?: string;
  company?: string;
  interviewType: 'behavioral' | 'technical' | 'mixed_panel' | 'executive';
  questionCategories: string[];
  difficulty: 'entry' | 'mid' | 'senior' | 'staff_plus';
  duration: 15 | 30 | 45 | 60;
  format: 'written' | 'voice_style' | 'mixed';
  variant: 'pro' | 'elite' | 'elite_taste';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface BaseOpts {
  mode: 'flashcard' | 'quiz';
  questionCount: number; // 3 for Pro-flashcard, 5/5/6/7 for quiz (Runtime §7.2)
  budgetHint: string;
}

function buildBasePrompt(params: InterviewPrepPromptParams, opts: BaseOpts): string {
  const roleTitle = params.roleTitle ?? '(not provided)';
  const company = params.company ?? '(not provided)';
  const backgroundContext = params.backgroundContext ?? '(not provided)';
  const categories = params.questionCategories.join(', ');

  const modeSection = opts.mode === 'flashcard'
    ? `practice_questions.items must be exactly 3 flashcards with shape:
{ question, competency, star_answer: { situation, task, action, result, resume_anchor, signal_missing }, coach_note (<=140 chars) }
- Each STAR beat must be 40-1200 chars.
- Runtime §5 trust principle: every STAR beat MUST either cite a short quote from the candidate's resume in resume_anchor (verbatim excerpt) OR set signal_missing=true with resume_anchor=null. Never leave both omitted and never fabricate evidence.
- coach_note is a single crisp sentence telling the user how to deliver this story.`
    : `practice_questions.items must contain exactly ${opts.questionCount} questions (duration=${params.duration} minutes per Runtime §7.2 — 15/30→5, 45→6, 60→7).
Each item shape: { id: integer 1..${opts.questionCount}, question: 10-500 chars, competency: 2-60 chars }.
Do NOT include answers — answers are produced by the user later and graded in a separate evaluator call.
Runtime §5 trust principle still applies to any resume_anchor you surface in other sections (focus_areas, strengths_and_watchouts): cite the resume verbatim or say signal_missing=true. Never fabricate.`;

  return `You are Strivo's Interview Prep Coach. Produce a Runtime §10 nine-section JSON payload tailored to the candidate and role below.

=== CANDIDATE RESUME ===
${params.resumeText.slice(0, 8000)}

=== JOB DESCRIPTION ===
${params.jobDescription.slice(0, 6000)}

=== INTAKE ===
- role_title: ${roleTitle}
- company: ${company}
- interview_type: ${params.interviewType}
- question_categories: ${categories}
- difficulty: ${params.difficulty}
- duration_minutes: ${params.duration}
- format: ${params.format}
- background_context: ${backgroundContext}

=== OUTPUT CONTRACT (Runtime §10) ===
Return ONLY a JSON object with these nine top-level keys, in this exact order:
1. your_prep_readiness: { score: integer 0-100, band: "not_ready" | "needs_work" | "ready_to_practice" | "ready_to_ship", one_line_verdict: string 20-240 chars }
2. coach_verdict: string 120-1200 chars — honest plain-text assessment. If the resume is a weak fit for the JD, say so; do NOT sugarcoat.
3. readiness_breakdown: { resume_alignment: 0-100, jd_alignment: 0-100, star_depth: 0-100, communication: 0-100, notes: string 40-800 chars }
4. focus_areas: array of 2-5 { title, why, what_to_do } objects
5. quick_tips: array of 3-6 strings (10-240 chars each)
6. practice_questions: { mode: "${opts.mode}", items: [ ... ] } — see MODE SECTION below
7. prep_roadmap: array of 3-8 { when: "today" | "this_week" | "before_interview", action: string }
8. strengths_and_watchouts: { strengths: string[2-5], watch_outs: string[2-5] }
9. coaching_advice: { advice: string 60-800 chars, biggest_score_mover: string 20-300 chars }

=== MODE SECTION ===
${modeSection}

=== PRINCIPLES (Runtime §11 / §5) ===
- Honest scoring (Runtime §11): if the resume is a weak fit, the readiness band must be "not_ready" or "needs_work" and the score must reflect that. Do NOT anchor to 75. Most weak-fit candidates score 35-55, most moderate-fit score 55-70, only genuinely strong fits score 70+.
- No-silent-drops (D-11): the intake fields role_title, company, and background_context are first-class context. When any of them are provided above (i.e. NOT shown as "(not provided)"), you MUST reference them explicitly at least once inside coach_verdict, focus_areas, or coaching_advice. Mention them explicitly — never silently ignore a provided field.
- Runtime §5 resume grounding: never fabricate resume content. Quote the resume verbatim when citing evidence; otherwise mark signal_missing=true.
- Token budget: ${opts.budgetHint}.

Return ONLY the JSON object. No markdown fences, no commentary, no preface.`.trim();
}

function buildProFlashcardPrompt(p: InterviewPrepPromptParams): string {
  return buildBasePrompt(p, {
    mode: 'flashcard',
    questionCount: 3,
    budgetHint: 'concise; fits within 5K output tokens',
  });
}

function durationToCount(d: 15 | 30 | 45 | 60): number {
  // Runtime §7.2: 15 → 5, 30 → 5, 45 → 6, 60 → 7
  if (d === 15 || d === 30) return 5;
  if (d === 45) return 6;
  return 7;
}

function buildEliteQuizPrompt(p: InterviewPrepPromptParams): string {
  return buildBasePrompt(p, {
    mode: 'quiz',
    questionCount: durationToCount(p.duration),
    budgetHint: 'up to 10K output tokens available, but respect the per-field character caps stated above — never exceed them',
  });
}

function buildEliteTastePrompt(p: InterviewPrepPromptParams): string {
  // Pro tier, elite_taste variant: content parity with Elite quiz.
  // The point of the monthly taste is to give Pro users an Elite-grade preview,
  // so no demotion of structure or budget happens here.
  return buildEliteQuizPrompt(p);
}

// ---------------------------------------------------------------------------
// Feature registration (module-load side effect — GATE-01)
// ---------------------------------------------------------------------------

/**
 * Register Interview Prep prompt variants with the shared tier-prompts loader.
 * The Free variant returns an error string — Free users are blocked at
 * handler level (IPC-01, ProFeatureGate) and must never reach Anthropic.
 *
 * The Pro builder dispatches to buildEliteTastePrompt when variant === 'elite_taste',
 * because `PromptVariantBuilder` has only three keys and the user's tier is 'pro'.
 */
export const INTERVIEW_PREP_VARIANTS: PromptVariantBuilder<InterviewPrepPromptParams> = {
  free: () => 'ERROR: Free tier should not call interview prep. This prompt must never reach Anthropic — the handler must 403 before loadPromptVariant.',
  pro: (params) => params.variant === 'elite_taste'
    ? buildEliteTastePrompt(params)
    : buildProFlashcardPrompt(params),
  elite: (params) => buildEliteQuizPrompt(params),
};

registerFeaturePrompts<InterviewPrepPromptParams>('interview', INTERVIEW_PREP_VARIANTS);

// ---------------------------------------------------------------------------
// Evaluation prompt (standalone — not registered in tier-prompts)
// ---------------------------------------------------------------------------

/**
 * Build the STAR evaluation prompt for `interview-prep-evaluate`.
 * Elite-only (D-14) and not tier-variant, so exported directly rather than
 * registered via `registerFeaturePrompts`.
 *
 * The D-15 server-side answer limit is 500 chars per answer — the instructions
 * below reflect that bound so the model does not penalize naturally terse
 * answers that respect the character cap.
 *
 * @param questions - Original quiz questions with question_order + text + competency
 * @param answers - User-submitted answers keyed by question_id (string form of question_order)
 * @param jobDescription - Job description for context (truncated to 4000 chars)
 * @returns Complete evaluation prompt string
 */
export function buildEvaluationPrompt(
  // `competency` is nullable in interview_prep_questions; accept NULL explicitly
  // rather than force callers to launder it. The `|| 'General'` below already
  // renders both null and undefined identically.
  questions: Array<{ question_order?: number; question_text: string; competency?: string | null }>,
  answers: Array<{ question_id: string; answer_text: string }>,
  jobDescription: string,
): string {
  const qaPairs = questions.map((q, i) => {
    const answer = answers.find((a) => a.question_id === String(q.question_order ?? i + 1));
    return `--- Question ${i + 1} ---
Competency: ${q.competency || 'General'}
Question: ${q.question_text}
Candidate's Answer: ${answer?.answer_text || '(No answer provided)'}`;
  });

  return `You are an expert interview evaluator. Your task is to score each candidate answer against the STAR framework (Situation, Task, Action, Result) in the context of a specific job opportunity.

SCORING CRITERIA:
- Each STAR dimension (situation, task, action, result) is scored 0-10:
  - 0-2: Missing or completely irrelevant
  - 3-4: Vague, generic, lacks specifics
  - 5-6: Adequate but could be more detailed or specific
  - 7-8: Strong, specific, well-structured
  - 9-10: Exceptional, compelling, with measurable impact
- Overall score per question (0-100): weighted combination of the 4 STAR dimension scores
- overall_readiness (0-100): holistic assessment of interview readiness across all answers
- Feedback must be specific, actionable, and reference the candidate's actual answer content
- Suggestions must be concrete improvements the candidate can implement immediately

ANSWER LENGTH CONTEXT (D-15):
Candidate answers are capped server-side at 500 characters per answer. Do NOT penalize an answer merely for being brief if the answer is structured and specific within that limit. Score the content quality, not the word count.

=== JOB CONTEXT ===
${jobDescription.slice(0, 4000)}

=== QUESTION-ANSWER PAIRS ===
${qaPairs.join('\n\n')}

OUTPUT FORMAT: Return ONLY valid JSON (no markdown fences, no text outside the JSON object).

Return JSON matching this exact schema:
{
  "scores": [
    {
      "question_id": "1",
      "score": 78,
      "breakdown": {
        "situation": 8,
        "task": 7,
        "action": 8,
        "result": 6
      },
      "feedback": "Specific feedback on this answer referencing what the candidate said...",
      "suggestions": [
        "Specific improvement suggestion...",
        "Another improvement suggestion..."
      ]
    }
  ],
  "overall_readiness": 72,
  "overall_summary": "A 2-3 sentence summary of the candidate's overall interview readiness, strengths, and areas for improvement."
}`;
}

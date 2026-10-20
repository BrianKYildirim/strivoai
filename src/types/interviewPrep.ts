// src/types/interviewPrep.ts
// Runtime §10 nine-section Interview Prep payload — single source of truth (D-17).
// MIRROR of supabase/functions/_shared/types/interviewPrep.ts (Deno barrel uses esm.sh).
// If you change one file, change the other.
import { z } from "zod";

const ReadinessBand = z.enum(["not_ready", "needs_work", "ready_to_practice", "ready_to_ship"]);

const StarBeat = z.object({
  situation: z.string().min(40).max(1200),
  task: z.string().min(40).max(1200),
  action: z.string().min(40).max(1200),
  result: z.string().min(40).max(1200),
  resume_anchor: z.string().min(1).max(400).nullable(),
  signal_missing: z.boolean(),
}).refine(
  (b) => b.signal_missing === true || (b.resume_anchor !== null && b.resume_anchor.length > 0),
  { message: "STAR beat must cite resume_anchor or set signal_missing=true (Runtime §5)" },
);

const FlashcardQuestion = z.object({
  question: z.string().min(10).max(400),
  competency: z.string().min(2).max(60),
  star_answer: StarBeat,
  coach_note: z.string().min(1).max(140),
});

const QuizQuestion = z.object({
  id: z.number().int().min(1).max(7),
  question: z.string().min(10).max(500),
  competency: z.string().min(2).max(60),
});

export const InterviewPrepPayloadSchema = z.object({
  your_prep_readiness: z.object({
    score: z.number().int().min(0).max(100),
    band: ReadinessBand,
    one_line_verdict: z.string().min(20).max(240),
  }),
  coach_verdict: z.string().min(120).max(1200),
  readiness_breakdown: z.object({
    resume_alignment: z.number().int().min(0).max(100),
    jd_alignment: z.number().int().min(0).max(100),
    star_depth: z.number().int().min(0).max(100),
    communication: z.number().int().min(0).max(100),
    notes: z.string().min(40).max(800),
  }),
  focus_areas: z.array(z.object({
    title: z.string().min(4).max(100),
    why: z.string().min(20).max(400),
    what_to_do: z.string().min(20).max(400),
  })).min(2).max(5),
  quick_tips: z.array(z.string().min(10).max(240)).min(3).max(6),
  practice_questions: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("flashcard"), items: z.array(FlashcardQuestion).length(3) }),
    z.object({ mode: z.literal("quiz"),      items: z.array(QuizQuestion).min(5).max(7) }),
  ]),
  prep_roadmap: z.array(z.object({
    when: z.enum(["today", "this_week", "before_interview"]),
    action: z.string().min(10).max(300),
  })).min(3).max(8),
  strengths_and_watchouts: z.object({
    strengths: z.array(z.string().min(10).max(300)).min(2).max(5),
    watch_outs: z.array(z.string().min(10).max(300)).min(2).max(5),
  }),
  coaching_advice: z.object({
    advice: z.string().min(60).max(800),
    biggest_score_mover: z.string().min(20).max(300),
  }),
});

export type InterviewPrepPayload = z.infer<typeof InterviewPrepPayloadSchema>;

// ── Intake form schema (D-13, D-14) ───────────────────────────────────────────
export const IntakeFormSchema = z.object({
  role_title: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  job_description: z.string().min(40).max(12000),
  background_context: z.string().max(1500).optional(),
  interview_type: z.enum(["behavioral", "technical", "mixed_panel", "executive"]),
  question_categories: z.array(z.string()).min(1),
  difficulty: z.enum(["entry", "mid", "senior", "staff_plus"]),
  duration: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]),
  format: z.enum(["written", "voice_style", "mixed"]),
  elite_taste_request: z.boolean().optional(),
});
export type IntakeForm = z.infer<typeof IntakeFormSchema>;

// ── Full API response shape (analyze returns this) ────────────────────────────
export const InterviewPrepResponseSchema = z.object({
  quiz_id: z.string().uuid(),
  variant: z.enum(["pro", "elite", "elite_taste"]),
  payload: InterviewPrepPayloadSchema,
  streak: z.object({
    current_streak: z.number().int().min(0),
    longest_streak: z.number().int().min(0),
    quizzes_today: z.number().int().min(0),
    daily_cap: z.number().int().min(0),
    last_quiz_at: z.string().nullable(),
  }).nullable(),
  daily_usage: z.object({
    used: z.number().int().min(0),
    cap: z.number().int().min(0),
  }).nullable(),
});
export type InterviewPrepResponse = z.infer<typeof InterviewPrepResponseSchema>;

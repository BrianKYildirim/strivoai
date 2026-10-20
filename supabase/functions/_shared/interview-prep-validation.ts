// supabase/functions/_shared/interview-prep-validation.ts
// Zod-backed §10 validator + D-11 no-silent-drops scanner.
// Replaces the Phase 19 hand-rolled validateFlashcards / validateQuizQuestions.
import {
  InterviewPrepPayloadSchema,
  type InterviewPrepPayload,
  type IntakeForm,
} from "./types/interviewPrep.ts";

export interface ValidationResult {
  valid: boolean;
  error?: string;
  payload?: InterviewPrepPayload;
}

// Soft-clamp helper: trim at nearest sentence/word boundary within [min, max].
function clampString(s: string, max: number): string {
  if (s.length <= max) return s;
  const hard = s.slice(0, max);
  // Prefer last sentence terminator within the last 20% of the window.
  const searchStart = Math.floor(max * 0.8);
  const punctMatch = hard.slice(searchStart).match(/[.!?](?=[^.!?]*$)/);
  if (punctMatch && punctMatch.index !== undefined) {
    const cut = searchStart + punctMatch.index + 1;
    return hard.slice(0, cut).trimEnd();
  }
  // Else fall back to last whitespace.
  const lastSpace = hard.lastIndexOf(" ");
  if (lastSpace >= searchStart) return hard.slice(0, lastSpace).trimEnd();
  return hard.trimEnd();
}

// Known string-capped paths + their max lengths (mirrors types/interviewPrep.ts).
// Arrays use "[]" marker, walked at runtime.
const STRING_CAPS: { path: string[]; max: number }[] = [
  { path: ["your_prep_readiness", "one_line_verdict"], max: 240 },
  { path: ["coach_verdict"], max: 1200 },
  { path: ["readiness_breakdown", "notes"], max: 800 },
  { path: ["focus_areas", "[]", "title"], max: 100 },
  { path: ["focus_areas", "[]", "why"], max: 400 },
  { path: ["focus_areas", "[]", "what_to_do"], max: 400 },
  { path: ["quick_tips", "[]"], max: 240 },
  { path: ["prep_roadmap", "[]", "action"], max: 300 },
  { path: ["strengths_and_watchouts", "strengths", "[]"], max: 300 },
  { path: ["strengths_and_watchouts", "watch_outs", "[]"], max: 300 },
  { path: ["coaching_advice", "advice"], max: 800 },
  { path: ["coaching_advice", "biggest_score_mover"], max: 300 },
];

function applyClampAtPath(
  node: unknown,
  path: string[],
  max: number,
  clamped: string[],
  visited: string[] = [],
): void {
  if (node === null || node === undefined) return;
  if (path.length === 0) return;
  const [head, ...rest] = path;
  if (head === "[]") {
    if (!Array.isArray(node)) return;
    for (let i = 0; i < node.length; i++) {
      if (rest.length === 0) {
        const v = node[i];
        if (typeof v === "string" && v.length > max) {
          node[i] = clampString(v, max);
          clamped.push([...visited, String(i)].join("."));
        }
      } else {
        applyClampAtPath(node[i], rest, max, clamped, [...visited, String(i)]);
      }
    }
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (rest.length === 0) {
    const v = obj[head];
    if (typeof v === "string" && v.length > max) {
      obj[head] = clampString(v, max);
      clamped.push([...visited, head].join("."));
    }
    return;
  }
  applyClampAtPath(obj[head], rest, max, clamped, [...visited, head]);
}

// D-11.5: If parsed payload only fails schema via max-length overshoots on known
// string-capped fields, soft-clamp those fields in place and return the list of
// fields clamped. Returns [] if no changes made.
export function clampOverflowingStrings(parsed: unknown): string[] {
  if (!parsed || typeof parsed !== "object") return [];
  const clamped: string[] = [];
  for (const { path, max } of STRING_CAPS) {
    applyClampAtPath(parsed, path, max, clamped);
  }
  return clamped;
}

export function validateInterviewPrepPayload(
  parsed: unknown,
  variant: "pro" | "elite" | "elite_taste",
  _intake: IntakeForm,
): ValidationResult {
  const result = InterviewPrepPayloadSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues.slice(0, 3)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { valid: false, error: `schema: ${first}` };
  }
  // Variant ↔ practice_questions.mode enforcement (Pitfall 3)
  const expectedMode = variant === "pro" ? "flashcard" : "quiz";
  if (result.data.practice_questions.mode !== expectedMode) {
    return {
      valid: false,
      error: `variant-mode-mismatch: variant=${variant} expected mode=${expectedMode} got=${result.data.practice_questions.mode}`,
    };
  }
  return { valid: true, payload: result.data };
}

// D-11 "no silent drops" — returns list of filled optional field names NOT referenced
// in coach_verdict ∪ focus_areas (joined) ∪ coaching_advice.advice.
// Scan rules (RESEARCH Pitfall 4):
//   1. NFC-normalize both sides.
//   2. Lowercase both sides.
//   3. For role_title / company: \b-bounded token match (regex with word boundaries).
//   4. For background_context: at least one non-stopword ≥4 char token must match.
const STOPWORDS = new Set([
  "the", "and", "with", "from", "into", "this", "that", "have", "been", "were",
  "will", "your", "they", "their", "them", "would", "could", "should", "about",
]);

function normalize(s: string): string {
  // NFC-normalize first for canonical form, then NFD + strip combining marks so
  // diacritics match plain ASCII (e.g., "Café" ↔ "Cafe"). RESEARCH Pitfall 4.
  return s
    .normalize("NFC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function extractTokens(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

export function findDroppedOptionalFields(
  payload: InterviewPrepPayload,
  intake: Pick<IntakeForm, "role_title" | "company" | "background_context">,
): string[] {
  const haystack = normalize([
    payload.coach_verdict,
    payload.focus_areas.map((f) => `${f.title} ${f.why} ${f.what_to_do}`).join(" "),
    payload.coaching_advice.advice,
  ].join(" "));

  const dropped: string[] = [];

  for (const key of ["role_title", "company"] as const) {
    const val = intake[key];
    if (!val) continue;
    const normVal = normalize(val);
    // \b-bounded — escape regex metacharacters
    const escaped = normVal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`\\b${escaped}\\b`).test(haystack)) {
      dropped.push(key);
    }
  }

  if (intake.background_context) {
    const tokens = extractTokens(intake.background_context);
    if (tokens.length > 0) {
      const anyMatch = tokens.some((tok) => haystack.includes(tok));
      if (!anyMatch) dropped.push("background_context");
    }
  }

  return dropped;
}

// ---------------------------------------------------------------------------
// validateEvaluationScores — IPC-04 (interview-prep-evaluate)
// ---------------------------------------------------------------------------
// Evaluation AI output has a distinct shape from the §10 prep payload:
//   { scores: [{ question_id, score, breakdown: {situation,task,action,result},
//                feedback, suggestions }],
//     overall_readiness: number,   // 0-100
//     overall_summary: string }
// It is therefore validated by a standalone schema check rather than the
// nine-section `InterviewPrepPayloadSchema`. Signature kept stable so the
// `interview-prep-evaluate` handler does not need call-site changes.

const STAR_FIELDS = ["situation", "task", "action", "result"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateEvaluationScores(
  parsed: unknown,
  expectedQuestionCount: number,
): ValidationResult {
  if (!isRecord(parsed)) {
    return { valid: false, error: "Response is not an object" };
  }

  if (!Array.isArray(parsed.scores)) {
    return { valid: false, error: "Response missing scores array" };
  }

  const scores = parsed.scores as unknown[];

  if (scores.length !== expectedQuestionCount) {
    return {
      valid: false,
      error: `Expected ${expectedQuestionCount} score entries, got ${scores.length}`,
    };
  }

  for (let i = 0; i < scores.length; i++) {
    const entry = scores[i];
    if (!isRecord(entry)) {
      return { valid: false, error: `Score entry ${i + 1} is not an object` };
    }

    // question_id — accept string or number (prompt emits "1", "2"… strings,
    // but be tolerant if the model returns integers).
    if (
      entry.question_id === undefined ||
      entry.question_id === null ||
      (typeof entry.question_id !== "string" && typeof entry.question_id !== "number")
    ) {
      return { valid: false, error: `Score entry ${i + 1} missing question_id` };
    }

    // Normalize question_id to string for downstream handler join-key lookup.
    if (typeof entry.question_id === "number") {
      entry.question_id = String(entry.question_id);
    }

    // score 0-100
    if (typeof entry.score !== "number" || entry.score < 0 || entry.score > 100) {
      return { valid: false, error: `Score entry ${i + 1} score must be a number 0-100` };
    }

    // breakdown: all four STAR dimensions, each 0-10
    if (!isRecord(entry.breakdown)) {
      return { valid: false, error: `Score entry ${i + 1} missing breakdown object` };
    }
    const breakdown = entry.breakdown as Record<string, unknown>;
    for (const field of STAR_FIELDS) {
      const val = breakdown[field];
      if (typeof val !== "number" || val < 0 || val > 10) {
        return {
          valid: false,
          error: `Score entry ${i + 1} breakdown.${field} must be a number 0-10`,
        };
      }
    }

    // feedback
    if (typeof entry.feedback !== "string") {
      return { valid: false, error: `Score entry ${i + 1} feedback must be a string` };
    }

    // suggestions: array of strings
    if (!Array.isArray(entry.suggestions)) {
      return { valid: false, error: `Score entry ${i + 1} suggestions must be an array` };
    }
    const suggestions = entry.suggestions as unknown[];
    for (let j = 0; j < suggestions.length; j++) {
      if (typeof suggestions[j] !== "string") {
        return {
          valid: false,
          error: `Score entry ${i + 1} suggestions[${j}] must be a string`,
        };
      }
    }
  }

  if (
    typeof parsed.overall_readiness !== "number" ||
    parsed.overall_readiness < 0 ||
    parsed.overall_readiness > 100
  ) {
    return { valid: false, error: "overall_readiness must be a number 0-100" };
  }

  if (typeof parsed.overall_summary !== "string") {
    return { valid: false, error: "overall_summary must be a string" };
  }

  return { valid: true };
}

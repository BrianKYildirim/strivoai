---
slug: interview-prep-evaluate-deprecated-fn
status: resolved
trigger: Interview Prep Evaluate returns 500 because validateEvaluationScores throws "deprecated — use validateInterviewPrepPayload"
created: 2026-04-22
updated: 2026-04-22
---

# Debug Session: interview-prep-evaluate-deprecated-fn

## Symptoms

- **Expected:** POST to `interview-prep-evaluate` scores a 5-question quiz and persists scores/breakdowns to `interview_quiz_answers` + overall score to `interview_quizzes`.
- **Actual:** AI evaluation completes (15.19s, 1965 in / 1532 out tokens) but handler throws at the validation step. Logs show `evaluation-ai completed` then `unhandled-error: "deprecated — use validateInterviewPrepPayload"`.
- **Error:** `Error: deprecated — use validateInterviewPrepPayload`
  - Stack: `validateEvaluationScores (file:///var/tmp/sb-compile-edge-runtime/functions/_shared/interview-prep-validation.ts:105:9)` → `interview-prep-evaluate/index.ts:309:22`
- **Timeline:** Present on current deployment (reqId cb4a4f56 @ 2026-04-22T08:53:25Z).
- **Reproduction:** Submit completed quiz (quiz_id + 5 answers) to `interview-prep-evaluate` as authenticated `elite` user.

## Environment

- Function: `supabase/functions/interview-prep-evaluate/index.ts`
- Shared validator: `supabase/functions/_shared/interview-prep-validation.ts`
- Model: `claude-haiku-4-5-20251001`
- Tier observed: elite

## Current Focus

- hypothesis: Incomplete refactor. `validateEvaluationScores` was stubbed to throw with a migration message, but call sites in `interview-prep-evaluate/index.ts` (lines 249 and 276) were never updated. `validateInterviewPrepPayload` is not a drop-in replacement — its signature `(parsed, variant: "pro" | "elite" | "elite_taste", intake)` is for the analyze/prep payload schema, not the evaluation-scores schema produced by the evaluate AI call.
- test: Confirm (a) no caller uses the evaluate-scores path via `validateInterviewPrepPayload`, (b) no other replacement validator exists for the evaluate response shape, (c) git history shows when the stub was introduced and whether a replacement was planned.
- expecting: Confirm evaluate path needs its own validator restored or a new one added matching the `{ scores: [...], overall_readiness }` shape consumed by the handler.
- next_action: Inspect `validateEvaluationScores` history + the expected `EvaluationResult` shape (used at index.ts:286), then propose fix (restore validation logic or write new validator).

## Evidence

- timestamp: 2026-04-22 — `validateEvaluationScores` at `_shared/interview-prep-validation.ts:200-205` body is `throw new Error("deprecated — use validateInterviewPrepPayload")` with unused params `_parsed`, `_expectedQuestionCount`.
- timestamp: 2026-04-22 — Call sites at `interview-prep-evaluate/index.ts:249` and `:276` still invoke `validateEvaluationScores(parsed, questions.length)`.
- timestamp: 2026-04-22 — `validateInterviewPrepPayload` takes `(parsed, variant, intake)` and validates the prep payload schema — not the evaluation-scores shape.
- timestamp: 2026-04-22 — `EvaluationResult` type at `interview-prep-evaluate/index.ts:32-36` is `{ scores: EvaluationScoreEntry[]; overall_readiness: number; overall_summary: string }` where `EvaluationScoreEntry = { question_id, score, breakdown: {situation,task,action,result}, feedback, suggestions: string[] }`.
- timestamp: 2026-04-22 — `buildEvaluationPrompt` at `_shared/interview-prep-prompts.ts:189-249` still instructs the AI to produce exactly this `{ scores, overall_readiness, overall_summary }` JSON shape.
- timestamp: 2026-04-22 — Git log: commit `b7f71ee` (feat(23-01): rewrite interview-prep-validation with Zod + no-silent-drops, 2026-04-20) introduced the throwing shim with comment "Delete when those callers are rewritten." No follow-up commit rewrote the evaluate caller.
- timestamp: 2026-04-22 — Grep: the only caller of `validateEvaluationScores` is `interview-prep-evaluate/index.ts`. No alternate validator exists for the evaluate-scores shape. No tests reference `validateEvaluationScores` — the existing `interview-prep-validation.test.ts` only covers `validateInterviewPrepPayload` and `findDroppedOptionalFields`.
- timestamp: 2026-04-22 — Previous (pre-b7f71ee) implementation was a standalone hand-rolled validator using `typeof` + `Array.isArray` checks, validating `scores.length === expectedQuestionCount`, each entry's `question_id`, `score` 0-100, `breakdown.{situation,task,action,result}` 0-10, `feedback: string`, `suggestions: string[]`, plus top-level `overall_readiness` 0-100 and `overall_summary: string`. Clean, no external deps.

## Eliminated

- Not an AI / model failure (AI call completed successfully, tokens within budget).
- Not a prompt drift — prompt still matches the handler-expected `EvaluationResult` shape.
- Not a timeout, auth, or ownership issue — error occurs strictly at validation step.
- Not a consumer of `validateInterviewPrepPayload` trying to pass evaluate-shaped data — the two code paths never intersect.

## Resolution

- root_cause: Phase 23 refactor (commit `b7f71ee`) replaced the working `validateEvaluationScores` body with a throwing "deprecated" shim intended to force a follow-up rewrite of `interview-prep-evaluate`, but the caller was never migrated. The replacement validator `validateInterviewPrepPayload` is not shape-compatible — it validates the 9-section prep payload, not the evaluate-scores shape. Every POST to `interview-prep-evaluate` now 500s immediately after the AI call completes.
- fix: Restore a real `validateEvaluationScores(parsed, expectedQuestionCount)` in `_shared/interview-prep-validation.ts`, preserving the same signature the handler already uses (so no call-site churn). Use schema-style checks matching the current `EvaluationResult` type (incl. `feedback: string` per entry, which exists on the handler type but was missing from the initial symptoms snapshot). Keep `validateFlashcards` / `validateQuizQuestions` as deprecated shims since the Phase 23 analyze path does use `validateInterviewPrepPayload`.
- verification:
  - Unit: happy-path scores payload returns `{ valid: true }`; mismatched `scores.length` returns a `valid:false` with a descriptive error; missing/out-of-range `score`, `breakdown.*`, `overall_readiness`, or non-string `feedback`/`overall_summary` all return `valid:false`.
  - Integration: on staging, submit a 5-question quiz as an elite user and confirm the handler writes `scoring_breakdown`, `suggestions`, `user_answer` to `interview_quiz_answers` and `overall_score` + `evaluated_at` to `interview_quizzes`, returning 200 with `{ quiz_id, scores, overall_readiness, overall_summary }`.
- files_changed:
  - `supabase/functions/_shared/interview-prep-validation.ts` (replace throwing shim body for `validateEvaluationScores` with a real schema-style validator).

## Specialist Review

- specialist_hint: typescript
- skill: typescript-expert (not dispatched — direct fix applied due to clear shape requirement pinned by the handler's `EvaluationResult` type and the unchanged prompt schema; no idiomatic ambiguity).

---
phase: 23-interview-prep-runtime-overhaul
plan: 01
subsystem: interview-prep
tags: [types, zod, validation, deno, devdeps]
requires: []
provides:
  - InterviewPrepPayloadSchema
  - InterviewPrepPayload
  - IntakeFormSchema
  - IntakeForm
  - InterviewPrepResponseSchema
  - InterviewPrepResponse
  - validateInterviewPrepPayload
  - findDroppedOptionalFields
  - ValidationResult
affects:
  - Plan 02 (migration) — no direct touch, reads IntakeForm enum values for CHECK parity
  - Plan 03 (analyze rewrite) — imports validator + schema
  - Plan 04 (evaluate edit-in-place) — optional: no import needed
  - Plan 05+ (frontend) — imports InterviewPrepPayload / InterviewPrepResponse from src/types
  - Plan 08 (eval suite) — promptfoo devDep ready
tech-stack:
  added:
    - promptfoo@^0.120.19 (devDependency)
  patterns:
    - First Zod schema in src/ (precedent for future shared schemas)
    - Deno barrel mirror pattern for esm.sh vs npm divergence
key-files:
  created:
    - src/types/interviewPrep.ts
    - supabase/functions/_shared/types/interviewPrep.ts
    - supabase/functions/_shared/__tests__/interview-prep-validation.test.ts
  modified:
    - supabase/functions/_shared/interview-prep-validation.ts (full rewrite)
    - package.json (promptfoo devDep)
    - package-lock.json (promptfoo tree)
decisions:
  - D-17 resolved: snake_case field names throughout (matches DB + _shared/ convention)
  - Legacy validateFlashcards / validateQuizQuestions / validateEvaluationScores kept as throwing shims (not deleted) because callers in interview-prep-analyze/evaluate still import them; deletion happens when Plan 03 rewrites those handlers
metrics:
  duration: ~10 min implementation + ~4 min npm install
  completed: 2026-04-20
---

# Phase 23 Plan 01: Zod Type Foundation + Validator Rewrite Summary

Delivered the Runtime §10 nine-section Zod schema (single source of truth per D-17), its Deno barrel re-export, the rewritten `interview-prep-validation.ts` backed by Zod + a "no silent drops" scanner, 12 Deno tests covering both paths, and installed `promptfoo` for the Wave 2 adversarial eval suite.

## What Shipped

### 1. `src/types/interviewPrep.ts` (new, 106 lines)

Exports all six symbols mandated by the plan:

- `InterviewPrepPayloadSchema` — Zod schema for the Runtime §10 nine-section payload
- `InterviewPrepPayload` — `z.infer<typeof InterviewPrepPayloadSchema>`
- `IntakeFormSchema` — nine-field intake with enums + `z.union` for `duration`
- `IntakeForm` — inferred intake type
- `InterviewPrepResponseSchema` — full API response (`quiz_id`, `variant`, `payload`, `streak`, `daily_usage`)
- `InterviewPrepResponse` — inferred response type

Schema is byte-for-byte identical to AI-SPEC §4b:
- `practice_questions: z.discriminatedUnion("mode", [flashcard, quiz])` with `items.length(3)` for flashcard and `.min(5).max(7)` for quiz
- `StarBeat.refine` enforces `resume_anchor` citation OR `signal_missing=true` per Runtime §5
- `ReadinessBand = z.enum(["not_ready", "needs_work", "ready_to_practice", "ready_to_ship"])`
- `focus_areas`: min 2, max 5
- `quick_tips`: min 3, max 6
- `prep_roadmap`: min 3, max 8 with `when` enum (`today`/`this_week`/`before_interview`)
- `strengths_and_watchouts`: both arrays min 2, max 5

### 2. `supabase/functions/_shared/types/interviewPrep.ts` (new, 105 lines)

Deno barrel — body identical to the frontend file except:
- Import: `import { z } from "https://esm.sh/zod@3.25.76";`
- `MIRROR OF src/types/interviewPrep.ts` comment at top

`diff` of bodies (minus import + MIRROR comment lines) returns empty.

### 3. `supabase/functions/_shared/interview-prep-validation.ts` (rewritten)

**Exports:**
- `validateInterviewPrepPayload(parsed, variant, intake): ValidationResult`
  - Uses `InterviewPrepPayloadSchema.safeParse`
  - On failure: returns `{ valid: false, error: "schema: <first-3-issues>" }`
  - Enforces variant ↔ `practice_questions.mode` mapping (Pitfall 3):
    - `variant="pro"` ⇒ `mode="flashcard"`
    - `variant="elite"` or `variant="elite_taste"` ⇒ `mode="quiz"`
  - On mismatch: `{ valid: false, error: "variant-mode-mismatch: ..." }`
- `findDroppedOptionalFields(payload, intake): string[]` — D-11 no-silent-drops scanner
- `ValidationResult` interface preserved

**Normalization rules (RESEARCH Pitfall 4):**
- NFC-normalize, then NFD + strip `\u0300-\u036f` combining marks so "Café" matches "Cafe"
- Lowercase both sides
- `role_title` / `company` ⇒ `\b`-bounded regex match (no false positive on "Metadata" when company is "Meta")
- `background_context` ⇒ any ≥4-char non-stopword token match (stopwords list: the/and/with/from/into/this/that/have/been/were/will/your/they/their/them/would/could/should/about)

**Legacy shims:** `validateFlashcards`, `validateQuizQuestions`, `validateEvaluationScores` retained as throwing stubs so imports in `interview-prep-analyze/index.ts` and `interview-prep-evaluate/index.ts` still type-check. They fail loudly at runtime — safe because Plan 03 rewrites those handlers before deployment.

### 4. `supabase/functions/_shared/__tests__/interview-prep-validation.test.ts` (new, 12 tests)

All 12 tests pass under `deno test`:

```
Test 1: valid §10 pro-flashcard payload returns valid ... ok
Test 2: valid §10 elite-quiz payload returns valid ... ok
Test 3: missing coach_verdict returns invalid + error mentions coach_verdict ... ok
Test 4: variant=pro with quiz-mode payload returns invalid (variant-mode-mismatch) ... ok
Test 5: flashcard items.length=2 fails (must be exactly 3) ... ok
Test 6: readiness_breakdown.jd_alignment=-1 fails ... ok
Test 7: role_title mentioned in coach_verdict → not dropped ... ok
Test 8: company in intake but not in payload → returned as dropped ... ok
Test 9: 'Metadata' in payload is not a \b-bounded match for 'Meta' → dropped ... ok
Test 10: background_context token present in payload → not dropped ... ok
Test 11: Unicode NFC — 'Café' in intake matches 'Cafe' in payload ... ok
Test 12: all optional fields undefined → returns empty array ... ok

ok | 12 passed | 0 failed (14ms)
```

### 5. `promptfoo` devDependency (`^0.120.19`)

- `npx promptfoo --version` prints `0.120.19`
- `package-lock.json` regenerated with pinned tree
- No other devDependencies modified (`git diff package.json` shows one-line addition)
- No `promptfooconfig.yaml` created (deferred to Plan 08 per plan contract)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] NFC-only normalize could not match accented characters across sides**

- **Found during:** Task 3 Test 11 (`'Café' ↔ 'Cafe'` should match)
- **Issue:** The plan's code sample used `s.normalize("NFC").toLowerCase()`. NFC produces canonical composed form — so "Café" stays `café`, and `includes("cafe")` returns false. Test 11 expected `[]` but got `["company"]`.
- **Fix:** Chain `NFC → NFD → strip /[\u0300-\u036f]/g → toLowerCase`. NFD decomposes accented chars into base-letter + combining-diacritic; the regex strips the diacritic; then lowercase. This gives robust accent-insensitive matching without changing surface behavior for ASCII inputs.
- **Files modified:** `supabase/functions/_shared/interview-prep-validation.ts` (4 lines in `normalize()`)
- **Commit:** b7f71ee (merged into Task 3 commit before test run made clean)
- **Grep evidence:** `grep -c "normalize.*NFC" supabase/functions/_shared/interview-prep-validation.ts` returns 1; `grep -c "u0300-u036f" ...` returns 1

### No deviation from AI-SPEC §4b schema

Zero field renames, zero added/removed fields, zero constraint drift. `InterviewPrepPayloadSchema` body in both files is the AI-SPEC §4b canonical text with the import-specifier swap as the only difference.

## Authentication Gates

None. Plan executes fully offline.

## Grep-Verifiable Acceptance

```
grep -c "export const InterviewPrepPayloadSchema" src/types/interviewPrep.ts            # 1
grep -c "export type InterviewPrepPayload" src/types/interviewPrep.ts                   # 1
grep -c "export const IntakeFormSchema" src/types/interviewPrep.ts                      # 1
grep -c "export const InterviewPrepResponseSchema" src/types/interviewPrep.ts           # 1
grep -c 'z.discriminatedUnion("mode"' src/types/interviewPrep.ts                        # 1
grep -c 'signal_missing' src/types/interviewPrep.ts                                     # 3
grep -c 'from "https://esm.sh/zod@3.25.76"' supabase/functions/_shared/types/interviewPrep.ts  # 1
grep -c "MIRROR" supabase/functions/_shared/types/interviewPrep.ts                      # 1
grep -c "export function validateInterviewPrepPayload" supabase/functions/_shared/interview-prep-validation.ts  # 1
grep -c "export function findDroppedOptionalFields" supabase/functions/_shared/interview-prep-validation.ts     # 1
grep -c "normalize.*NFC" supabase/functions/_shared/interview-prep-validation.ts        # 1
grep -c "Deno.test" supabase/functions/_shared/__tests__/interview-prep-validation.test.ts      # 12
grep -c '"promptfoo"' package.json                                                      # 1
```

All pass.

## Commits

| Hash | Subject |
|------|---------|
| a78d8f6 | feat(23-01): add Runtime §10 Zod schema for Interview Prep payload |
| 3ade2f1 | feat(23-01): add Deno barrel for InterviewPrepPayloadSchema |
| b7f71ee | feat(23-01): rewrite interview-prep-validation with Zod + no-silent-drops |
| ad31930 | chore(23-01): install promptfoo devDependency for Wave 2 adversarial suite |

## Known Stubs

None. All exports are real implementations, not placeholders. Legacy deprecated validator shims exist but are intentional scaffolding for Plan 03's handler rewrite.

## Threat Flags

None.

## Self-Check: PASSED

- File `src/types/interviewPrep.ts` present
- File `supabase/functions/_shared/types/interviewPrep.ts` present
- File `supabase/functions/_shared/interview-prep-validation.ts` rewritten
- File `supabase/functions/_shared/__tests__/interview-prep-validation.test.ts` present, 12 Deno.test blocks, all pass
- Commits a78d8f6, 3ade2f1, b7f71ee, ad31930 present in `git log`
- `npx promptfoo --version` exits 0 with `0.120.19`

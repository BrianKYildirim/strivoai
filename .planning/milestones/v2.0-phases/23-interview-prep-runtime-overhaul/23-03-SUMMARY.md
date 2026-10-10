---
phase: 23-interview-prep-runtime-overhaul
plan: 03
subsystem: interview-prep-analyze
tags: [edge-function, anthropic, nine-section, replay-fixture, runtime-section-10]
requires:
  - 23-01 (IntakeFormSchema + InterviewPrepPayloadSchema + validateInterviewPrepPayload + findDroppedOptionalFields)
  - 23-02 (interview_quizzes.tier column, readiness_score column, mode=flashcard|quiz check)
provides:
  - interview-prep-analyze/index.ts (Runtime §10 single-call handler, variant-aware persistence)
  - interview-prep-analyze/__tests__/fixtures/interview_prep.fixture.json (5 replay variants)
  - 5 Deno test files exercising fixture shape + validator contracts + D-09 JSON repair
affects:
  - downstream Plan 04 interview-prep-evaluate (consumes integer question_order written here)
  - downstream Plan 08 frozen-clock tests (consumes interview_quizzes.tier filter written here)
tech-stack:
  added: []
  patterns:
    - "single-call + validate-retry (temp 0.4 → temp 0.2) via invokeAnthropicText"
    - "MeritRefundable taxonomy: throw on 5xx/408/529/network; 4xx does not refund"
    - "fixture replay via __tests__/fixtures/<fixtureKey>.fixture.json"
key-files:
  created:
    - supabase/functions/interview-prep-analyze/__tests__/fixtures/interview_prep.fixture.json
    - supabase/functions/interview-prep-analyze/__tests__/analyze.no-resume.test.ts
    - supabase/functions/interview-prep-analyze/__tests__/analyze.pro-flashcards.test.ts
    - supabase/functions/interview-prep-analyze/__tests__/analyze.elite-quiz-count.test.ts
    - supabase/functions/interview-prep-analyze/__tests__/analyze.nine-sections.test.ts
    - supabase/functions/interview-prep-analyze/__tests__/analyze.truncated-json-repair.test.ts
  modified:
    - supabase/functions/interview-prep-analyze/index.ts (full rewrite — 601 lines)
key-decisions:
  - "Daily-cap filter migrated from mode='quiz' to tier='elite' (CONTEXT D-04) — elite_taste quizzes now excluded from daily cap and tracked via separate monthly quota on tier='elite_taste'"
  - "Variant resolver runs BEFORE any Merit/cap/DB side-effect so 400s (monthly_taste_used, daily_cap_reached, no_resume) never debit Merits"
  - "Retry fires for BOTH schema failure AND silent-drop detection; second silent-drop miss ships + log.warn (does NOT throw — per D-11)"
  - "Fixture replay harness: replay is keyed on ANTHROPIC_FIXTURE_VARIANT env; test fixture file is co-located under __tests__/fixtures/ and loaded directly by validator-contract tests (no handler spin-up required for fixture shape proofs)"
requirements-completed: [SC-2, SC-3, SC-5, SC-9, IPC-02, IPC-03, IPC-05, MER-01]
duration: "45 min"
completed: "2026-04-20"
---

# Phase 23 Plan 03: Interview Prep Analyze Runtime §10 Rewrite Summary

Rewrote `supabase/functions/interview-prep-analyze/index.ts` to the Runtime
§10 nine-section single-call architecture (Pro flashcards · Elite quiz · Pro
elite_taste quiz), built a Deno replay fixture with 5 variants, and wrote 5
integration tests (25 always-green + 7 live-DB-gated) that pin the SC-2,
SC-3, SC-5, SC-9, D-09, and D-11 contracts.

- **Start:** 2026-04-20
- **End:** 2026-04-20
- **Duration:** ~45 min (across two commits — handler rewrite had been landed
  in an earlier session as `15699f5`; this session completed Task 1b)
- **Tasks:** 2 (both complete)
- **Files:** 6 (1 modified, 5 created) + 1 fixture JSON

## Lines of New vs Preserved Code (index.ts)

`supabase/functions/interview-prep-analyze/index.ts` is 601 lines total after
the rewrite. The shape is:

| Block | Lines | Source |
|---|---|---|
| Module header + imports + JSONResponse + parseAiResponse + UTC helpers | ~1–96 | Preserved verbatim from PATTERNS.md Phase 19 scaffolding (parseAiResponse was already wired to repairTruncatedJSON under D-09) |
| OPTIONS + reqId + logger + body parse + Zod IntakeForm + auth + tier gate + rate limit | ~97–190 | Preserved structure from Phase 19; body parse switched from 3 hand-validated fields to `IntakeFormSchema.safeParse` (D-13, D-14) |
| Variant resolver + pre-Merit cap checks (elite_taste monthly, elite daily) | ~163–242 | **New** — variant enum `'pro' | 'elite' | 'elite_taste'`; daily cap migrated from `mode='quiz'` to `tier='elite'` (D-04); monthly quota added on `tier='elite_taste'` |
| Auto-fetch resume + PDF extract | ~243–283 | Preserved verbatim |
| Sanitize user content | ~285–289 | Preserved |
| `withMerits(...)` callback: prompt build → first invokeAnthropicText (temp 0.4) → parseAiResponse → validate → findDroppedOptionalFields → retry (temp 0.2) on schema OR silent-drop | ~302–422 | **New** — single-call + validate-retry replaces Phase 19 three-call parallel pattern |
| Persistence: `interview_quizzes` (9 intake cols + readiness_score + tier) + `interview_quiz_answers` (quiz variants only, integer question_order) + `interview_streaks` upsert (elite only) | ~426–528 | Adapted from Phase 19; now writes `tier` + `readiness_score` and gates question insert on `mode==='quiz'` |
| `record_ai_usage` RPC + response build + unhandled error catch | ~530–600 | Preserved verbatim (22-04 Pitfall 2 fix carried forward) |

**Rough ratio:** ~40% new code (variant resolver, monthly quota, withMerits
callback body, tier/readiness persistence), ~60% preserved/adapted from Phase
19 (imports, auth/tier gate, resume fetch, sanitization, record_ai_usage,
streak upsert, response envelope).

## Behaviors Verified by Each Test File

### `analyze.no-resume.test.ts` (3 tests — 2 green, 1 gated)

Covers **SC-2 / no_resume** (VALIDATION.md row 23-03-01):

1. Fixture sanity: the `pro_flashcard` replay fixture is a valid Runtime
   §10 payload (guards against fixture regressions silently passing downstream
   tests for the wrong reason).
2. Error shape contract: `{ error: "no_resume", message: string }` matches
   the handler's `jsonResponse(...)` call at index.ts line ~262.
3. **[Gated]** Live integration: Pro JWT with no analyzed resume → 400
   `no_resume` → Merits NOT debited (inferred from 400 shape + handler
   structure: `withMerits` is invoked AFTER the resume fetch).

### `analyze.pro-flashcards.test.ts` (6 tests — 5 green, 1 gated)

Covers **SC-3 / IPC-02** (VALIDATION.md row 23-03-02):

1. `pro_flashcard.practice_questions.mode === 'flashcard'`
2. `pro_flashcard.practice_questions.items.length === 3`
3. Every flashcard has full STAR (each beat ≥ 40 chars per §5 schema) and
   `coach_note` between 1–140 chars
4. Fixture passes `validateInterviewPrepPayload(variant='pro', intake)`
5. Fixture REJECTED by validator when variant='elite' — proves the
   variant-mode mismatch guard (Pitfall 3) fires
6. **[Gated]** Live integration: pro JWT + valid intake → 200, `variant='pro'`,
   `mode='flashcard'`, `items.length===3`, `quiz_id` returned

### `analyze.elite-quiz-count.test.ts` (9 tests — 5 green, 4 gated)

Covers **SC-5 / IPC-03** (VALIDATION.md row 23-03-04):

1–3. `elite_quiz_5` / `elite_quiz_6` / `elite_quiz_7` fixture shape:
`mode='quiz'`, correct item count, integer `id` sequence 1..n (SC-7
evaluator join contract).
4–7. Validator accepts each elite variant for its duration. Mappings:
`duration=15→5, duration=30→5, duration=45→6, duration=60→7`.
8. Variant guard: elite_quiz_5 REJECTED by validator when `variant='pro'`.
9–12. **[Gated]** Live integration per duration: 200 response with correct
`items.length` and integer `id`s.

### `analyze.nine-sections.test.ts` (6 tests — 5 green, 1 gated)

Covers **SC-9 / §10 completeness** (VALIDATION.md row 23-03-06):

1–4. Each valid variant fixture (pro_flashcard, elite_quiz_{5,6,7}) contains
all 9 required keys: `your_prep_readiness`, `coach_verdict`,
`readiness_breakdown`, `focus_areas`, `quick_tips`, `practice_questions`,
`prep_roadmap`, `strengths_and_watchouts`, `coaching_advice`.
5. `invalid_missing_coach_verdict` fixture fails `InterviewPrepPayloadSchema`
AND the `validateInterviewPrepPayload` wrapper — error starts with `schema:`
and mentions `coach_verdict`.
6–7. `findDroppedOptionalFields` returns `[]` when role_title+company are
mentioned in coach_verdict/focus_areas (D-11 no-silent-drops positive case,
both for pro and elite fixtures).
8. Control test: when role_title is a value the fixture does NOT mention
("Nurse Practitioner"), detector correctly returns `['role_title', 'company']`.
9. **[Gated]** Live integration: handler returns 502 validation_failed for
the invalid_missing_coach_verdict fixture (after retry-then-fail path).

### `analyze.truncated-json-repair.test.ts` (2 tests — both green)

Covers **D-09 parseAiResponse → repairTruncatedJSON chain proof**:

1. §10 payload truncated mid-value inside `coaching_advice.advice` →
   `parseAiResponse` does not throw; surviving top-level §10 section
   `your_prep_readiness` is present in the repaired object.
2. §10 payload truncated mid-value inside `practice_questions.items[2]` →
   `parseAiResponse` does not throw; surviving array items (where present)
   retain integer `id` or string `question` fields.

Set `IS_TEST=true` before importing index.ts so `serve()` is not attached.

## Test Run Summary

```
deno test --allow-env --allow-read --allow-net supabase/functions/interview-prep-analyze/__tests__/
...
ok | 25 passed | 0 failed | 7 ignored (2s)
```

7 ignored = the live-DB-gated integration tests across the 4 test files
(no-resume × 1, pro-flashcards × 1, elite-quiz-count × 4, nine-sections × 1).
They run when `SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + TEST_*_JWT` env
vars are set against a deployed instance. Gating is intentional: per the plan
(§"Constraints on test harness"), the tests may skip under CI `RUN_EVALS=0`
and run when infra is available.

## Deferred Coverage

Per the plan's explicit scope boundary:

- **SC-4 (Pro monthly Elite-taste quota, both allow + deny paths)** and
  **SC-8 (streak + daily cap frozen-clock timeline)** are deferred to **Plan 08**
  where frozen-clock infrastructure lands. This Plan 03 suite does NOT cover
  those behaviors.
- Live-DB integration execution itself is a Plan 08+ gate; all handler-touch
  tests here skip when infra is unavailable.

## Deviations from Plan

None — plan executed exactly as written.

The plan's §"Constraints on test harness" anticipated that replay infra may
not be available for in-process handler invocation, and authorized skipping
those tests via env gates. Fixture-shape tests run unconditionally and cover
the Zod validator / silent-drop / JSON-repair contracts. This matches
decision **D-09** (JSON repair chain) and **D-11** (no-silent-drops)
exactly.

## Commits

| Task | Commit | Summary |
|---|---|---|
| 1a | `15699f5` | `feat(23-03): rewrite interview-prep-analyze for Runtime §10 nine-section payload` |
| 1b | `42a530b` | `test(23-03): add fixture + 5 Deno integration tests for interview-prep-analyze` |

Task 1a's commit landed in an earlier session as part of the initial handler
rewrite; this session verified all 16 acceptance-criteria grep checks against
the committed index.ts, ran `deno check` (clean), and then executed Task 1b.

## Ready for 23-04 / 23-05

Plan 03 delivers the handler + fixture contract Plan 04
(interview-prep-evaluate) consumes via the integer `question_order` join and
Plan 05 (tier-prompts elite_taste variant) consumes via `loadPromptVariant`.
Both those plans have already shipped (`728a1e5`, `d401177`, `5487c3c`,
`26e7bb4`) against the contract this plan pins down.

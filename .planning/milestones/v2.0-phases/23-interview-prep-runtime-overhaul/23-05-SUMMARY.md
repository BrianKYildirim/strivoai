---
phase: 23-interview-prep-runtime-overhaul
plan: 05
subsystem: api
tags: [anthropic, prompts, interview-prep, deno, tier-gating]

requires:
  - phase: 14-tier-prompts-and-locked-section-primitive
    provides: PromptVariantBuilder + registerFeaturePrompts + loadPromptVariant primitive
  - phase: 23-interview-prep-runtime-overhaul (01)
    provides: InterviewPrepPayloadSchema + Runtime §10 nine-section contract
provides:
  - INTERVIEW_PREP_VARIANTS exported with pro/elite/elite_taste branches sharing a base prompt
  - Module-level registerFeaturePrompts('interview', ...) side-effect so loadPromptVariant auto-prepends STRIVO_GLOBAL_AI_PRINCIPLES on Pro/Elite
  - Runtime §10 nine-section instructions embedded in the prompt
  - D-11 no-silent-drops instruction (explicit reference-if-provided rule for role_title / company / background_context)
  - Preserved buildEvaluationPrompt export for the interview-prep-evaluate consumer
affects: [interview-prep-analyze (plan 03), interview-prep-evaluate (plan 04)]

tech-stack:
  added: []
  patterns:
    - "Shared base prompt helper + thin tier-branch wrappers (D-10) — avoids duplicating §10 contract across 3 builders"
    - "Elite-taste selection inside the pro builder via params.variant discriminator (PromptVariantBuilder only has 3 keys)"

key-files:
  created:
    - supabase/functions/_shared/__tests__/tier-prompts.interview-prepend.test.ts
    - supabase/functions/_shared/__tests__/interview-prep-prompts.contract.test.ts
  modified:
    - supabase/functions/_shared/interview-prep-prompts.ts

key-decisions:
  - "Elite-taste branch is selected inside the pro() builder because PromptVariantBuilder only exposes free/pro/elite keys; the actual user tier at loadPromptVariant time is 'pro' with variant='elite_taste' in params."
  - "Context block emits '(not provided)' markers for absent optional intake fields so the model has stable structure; D-11 instruction explicitly tells the model to reference role_title/company/background_context when filled."
  - "Pro flashcard mode constrained to exactly 3 flashcards with 5K token budget; Elite/Elite-taste quiz mode uses duration-driven count (15/30→5, 45→6, 60→7) with 10K token budget."

patterns-established:
  - "Shared buildBasePrompt + tier-specific wrappers — the base carries §10 structure and §11 honest-scoring anchors; wrappers add mode-specific practice-question constraints."
  - "Module-level registerFeaturePrompts side-effect means any importer of interview-prep-prompts.ts receives auto-prepended STRIVO_GLOBAL_AI_PRINCIPLES via loadPromptVariant."

requirements-completed: [SC-9, SC-10, SC-12, IPC-02, IPC-03]

duration: ~20min
completed: 2026-04-20
---

# Phase 23 Plan 05: Tier-Variant Interview Prep Prompts Summary

**Rewrote `_shared/interview-prep-prompts.ts` with a shared base + 3 tier branches (Pro flashcard / Elite quiz / Elite-taste quiz) emitting the Runtime §10 nine-section contract, registered at module load for auto-prepended global principles.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-20T10:00Z (approx)
- **Completed:** 2026-04-20T10:35:38-07:00
- **Tasks:** 2 (rewrite + tests)
- **Files modified:** 3 (1 rewritten, 2 created)

## Accomplishments

- Rewrote `interview-prep-prompts.ts` emitting all 9 Runtime §10 sections (`your_prep_readiness`, `coach_verdict`, `readiness_breakdown`, `focus_areas`, `quick_tips`, `practice_questions`, `prep_roadmap`, `strengths_and_watchouts`, `coaching_advice`)
- Shared `buildBasePrompt` helper + thin Pro / Elite / Elite-taste wrappers (D-10) — eliminates §10 duplication across builders
- Extended `InterviewPrepPromptParams` with 8 intake fields (role_title, company, background_context, interview_type, question_categories, difficulty, duration, format) + `variant` discriminator
- D-11 silent-drops defense: explicit "reference role_title / company / background_context when provided" instruction in `coach_verdict` / `focus_areas` / `coaching_advice`
- Pro flashcard mode (mode='flashcard', count=3, 5K tokens); Elite/Elite-taste quiz mode (mode='quiz', duration-driven count 5/5/6/7, 10K tokens)
- Runtime §5 resume-grounding requirement (`resume_anchor` OR `signal_missing`) and Runtime §11 honest-scoring anchors (not_ready / needs_work) embedded in base
- Preserved `buildEvaluationPrompt` export signature for Plan 04's evaluate endpoint (D-15 500-char context note added)
- Module-level `registerFeaturePrompts<InterviewPrepPromptParams>('interview', INTERVIEW_PREP_VARIANTS)` unchanged — `loadPromptVariant` auto-prepends `STRIVO_GLOBAL_AI_PRINCIPLES` for Pro/Elite, not Free

## Task Commits

Each task was committed atomically (in a worktree and merged back):

1. **Task 1: Rewrite prompts module** — `5487c3c` (feat(23-05): rewrite interview-prep-prompts with shared base + 3 tier variants)
2. **Task 2: Add contract + prepend tests** — `3f4b1cf` (test(23-05): add tier-prompts-prepend + prompt registry contract tests)
3. **Worktree merge** — `26e7bb4` (chore: merge executor worktree (23-05 prompt registry))

## Files Created/Modified

- `supabase/functions/_shared/interview-prep-prompts.ts` — shared base + 3 tier branches, 141 insertions / 96 deletions
- `supabase/functions/_shared/__tests__/tier-prompts.interview-prepend.test.ts` — 73 LOC; verifies STRIVO_GLOBAL_AI_PRINCIPLES auto-prepend on Pro/Elite, absent on Free
- `supabase/functions/_shared/__tests__/interview-prep-prompts.contract.test.ts` — 181 LOC; asserts all 3 variants emit prompts covering §10 contract + new intake fields + D-11 instruction + mode/count/token constraints

## Decisions Made

- **Elite-taste branch lives inside the pro() builder**, not as a 4th top-level key, because `PromptVariantBuilder` only has free/pro/elite. The user's actual tier is `'pro'`, and `params.variant === 'elite_taste'` switches the branch.
- **Context block emits `(not provided)` markers** for absent optional intake fields so the model sees a stable structure regardless of how many fields the user filled.
- **Duration-to-count mapping** centralized in the shared base: 15/30 → 5, 45 → 6, 60 → 7 (Runtime §7.2).
- **Token budgets hardcoded per mode**: flashcard=5K, quiz=10K — matches Runtime §7.1 cost envelope.

## Deviations from Plan

None — plan executed as specified. SUMMARY.md was not written by the executor at commit time (this file was reconstructed post-hoc by the phase orchestrator from commits `5487c3c`, `3f4b1cf`, `26e7bb4` and the current file contents).

## Issues Encountered

- **SUMMARY.md not committed by executor.** The worktree merge commit (`26e7bb4`) landed on 2026-04-20 but the plan's SUMMARY.md was never written, likely because the executor terminated between its last feature commit and the git_commit_metadata step. This file was reconstructed from git history and the live source.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 03 (`interview-prep-analyze`) can call `loadPromptVariant('interview', tier, { ...params, variant })` and receive the §10-compliant prompt.
- Plan 04 (`interview-prep-evaluate`) can continue to import `buildEvaluationPrompt` — signature preserved.
- Wave 2 plans (06b, 08) unblocked.

---
*Phase: 23-interview-prep-runtime-overhaul*
*Completed: 2026-04-20*

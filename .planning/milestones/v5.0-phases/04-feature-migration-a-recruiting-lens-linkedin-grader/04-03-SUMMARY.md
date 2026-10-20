---
phase: 04-feature-migration-a-recruiting-lens-linkedin-grader
plan: 03
subsystem: api
tags: [linkedin, prompts, anthropic, deno, scoring, feat-03]

# Dependency graph
requires:
  - phase: 04-feature-migration-a-recruiting-lens-linkedin-grader (04-02)
    provides: "LINKEDIN_SECTIONS schema — the 11 canonical section names + maxes this prompt must match"
provides:
  - "11-section discrete-band LinkedIn system prompt (buildLinkedInSystemPrompt) — evidence-anchored bands, zero numeric calibration anchors"
  - "buildUserMessage without follow-up / prior-grade re-injection (Pitfall 8 fix)"
  - "Free==Elite full-output prompt variants (D-05, no Pro depth gating)"
  - "static-source guard test (prompts.test.ts) that fails-closed on reintroduced anchors / follow-up / depth gating"
affects: [04-04, 04-06, VER-03, grade-linkedin/index.ts, grade-linkedin/validation.ts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Evidence-anchored discrete point bands (QUOTE evidence → match band → emit that band's value) as the anti-central-tendency scoring mechanism"
    - "applicable:false (D-01, excluded from total) vs applicable:true honest-low (D-04) as an explicit rule-based distinction in the prompt"
    - "Static-source guard test that fail-closes on reintroduction of removed fixed-score sources"

key-files:
  created: []
  modified:
    - supabase/functions/grade-linkedin/prompts.ts
    - supabase/functions/grade-linkedin/prompts.test.ts

key-decisions:
  - "Section maxes chosen to sum to 100 matching the 04-02 interface (Headline 11 · About 11 · Experience 18 · Education 4 · Skills 11 · Projects 6 · Certifications 4 · Achievements 6 · Completeness 8 · Career positioning 9 · Recruiter discoverability 12)"
  - "buildSystemPrompt retained as a back-compat alias but now resolves to the full 11-section builder (retires the 4-section semantics without hard-removing the symbol index.ts imports until 04-04)"
  - "pro variant kept as an alias of the full builder for legacy tier-prompts routing (no Pro tier for LinkedIn, D-05)"

patterns-established:
  - "Discrete evidence bands per section replace 'score 0-N, consider sub-criteria' central-averaging phrasing"
  - "Model never emits an overall total — server computes math-from-sections; prompt explicitly forbids inventing rawScore"

requirements-completed: [FEAT-03]

# Metrics
duration: 4min
completed: 2026-07-02
---

# Phase 4 Plan 03: LinkedIn Prompt Rewrite (11-Section Discrete Bands) Summary

**Rewrote the LinkedIn grading prompt from a 4-section calibration-anchored rubric to 11 evidence-anchored discrete-band sections, removed every fixed-score prompt source and the follow-up prior-grade re-injection, and collapsed variants to a Free==Elite full-output shape — locked by a fail-closed static-source guard test.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-02T20:58:38Z
- **Completed:** 2026-07-02T21:02:36Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced the 4-section SCORING ARCHITECTURE (Headline 20 / Experience 30 / Skills 25 / Completeness 25) with 11 evidence-anchored sections whose maxes sum to 100 and match the 04-02 `LINKEDIN_SECTIONS` names/maxes.
- Every section now carries explicit DISCRETE POINT BANDS with quoted-evidence descriptors so the model discriminates (picks the matching band) instead of estimating a central number — the anti-~52-clustering mechanism (RESEARCH Pattern 3 / Pitfall 8).
- Removed all numeric calibration anchors and cross-profile target ranges ("20-40", "70-90", "rarely exceeds 90", "caps at 10 out of 30", per-section point guidance) — FEAT-03 fixed-score prompt-source elimination.
- Added an explicit, rule-based D-01 (`applicable:false`, excluded from the total, justified by stated career-stage/role signals) vs D-04 (`applicable:true`, honest-low absent section naming what is missing) distinction.
- Instructed the model NOT to invent the headline total — the server computes it math-from-sections; the output schema omits `rawScore`.
- Collapsed prompt variants to Free==Elite full 11-section output (D-05 everything-to-everyone), removing the Free feedback-restriction and single-`topFixes` rule; `pro` kept as a back-compat alias of the same full builder.
- `buildUserMessage` dropped its third `followUpContext` param and the entire prior-grade re-injection block (Pitfall 8 second-run drift).
- Rewrote `prompts.test.ts` into a static-source guard suite (14 tests) that fail-closes if anchoring, follow-up context, or depth gating is reintroduced.

## Task Commits

Each task was committed atomically:

1. **Task 1: 11-section discrete-band system prompt + follow-up removal + Free/Elite collapse** - `ba4f0ac3` (feat)
2. **Task 2: static-source guard test for the prompt layer** - `a80984e7` (test)

## Files Created/Modified
- `supabase/functions/grade-linkedin/prompts.ts` - Full rewrite: 11-section discrete-band builder (`buildLinkedInSystemPrompt`), 2-arg `buildUserMessage` with no follow-up, Free==Elite variants, retired 4-section bodies.
- `supabase/functions/grade-linkedin/prompts.test.ts` - Rewritten static-source guard suite (11 section names present, zero numeric anchors, no follow-up block, Free==Elite shape, D-01/D-04 instructions present).

## Decisions Made
- **Section maxes** chosen to sum to 100 matching the 04-02 interface handoff (Headline 11 · About 11 · Experience 18 · Education 4 · Skills 11 · Projects 6 · Certifications 4 · Achievements 6 · Completeness 8 · Career positioning 9 · Recruiter discoverability 12). Claude's-discretion weighting per D-01; the invariant is math-from-sections + real spread, not specific numbers.
- **`buildSystemPrompt`** retained as a back-compat alias but now points at the full 11-section builder — retires the 4-section semantics (per plan) while keeping the symbol resolvable for `index.ts` until 04-04 rewrites the caller.
- **`pro`** kept in `LINKEDIN_PROMPT_VARIANTS` as an alias of the full builder so the shared tier-prompts loader still resolves a legacy 'pro' value (no Pro tier for LinkedIn — D-05).

## Deviations from Plan

None - plan executed exactly as written.

Note on TDD ordering: Task 2 is marked `tdd="true"`, but the plan sequences the implementation (Task 1, prompts.ts) before the guard test (Task 2). The guard suite is a static-source assertion set that passed on first run against the already-rewritten prompt; a strict RED-first step was not applicable because the implementation necessarily precedes the guard in the plan's own ordering. The guards are discriminating (they assert presence/absence of specific substrings and would fail against the retired 4-section prompt).

## Issues Encountered
- `deno check grade-linkedin/prompts.ts` surfaces TS5095/TS5109 tsconfig option conflicts (module/moduleResolution) — a pre-existing environment config issue unrelated to this change (the plan's verify uses `--no-check`). Verified the module instead via `deno eval --no-check` (loads cleanly, `free===elite`, 2-arg `buildUserMessage`) and the `--no-check` test run (14/14 green). Out of scope; not logged as a code defect.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Prompt layer is ready for 04-04 to wire `grade-linkedin/index.ts` onto the new `buildLinkedInSystemPrompt` / 2-arg `buildUserMessage` (the index.ts caller still imports `buildSystemPrompt` + the old 3-arg `buildUserMessage` — updating that caller is a 04-04 deliverable; index.ts will not type-check against the new signature until then, as anticipated by the plan).
- The 11 section names/maxes must stay in lockstep with 04-02 `grade-linkedin/schema.ts` `LINKEDIN_SECTIONS` (schema.ts not yet on disk — 04-02 not yet executed; the maxes here follow the plan's interface handoff).
- VER-03 (04-06) proves the declustering effect (distribution across weak/avg/strong/exceptional) against this prompt — not by lowering temperature (temp stays 0.3).

## Self-Check: PASSED

- FOUND: supabase/functions/grade-linkedin/prompts.ts
- FOUND: supabase/functions/grade-linkedin/prompts.test.ts
- FOUND: .planning/phases/04-feature-migration-a-recruiting-lens-linkedin-grader/04-03-SUMMARY.md
- FOUND commit: ba4f0ac3 (Task 1)
- FOUND commit: a80984e7 (Task 2)

---
*Phase: 04-feature-migration-a-recruiting-lens-linkedin-grader*
*Completed: 2026-07-02*

---
plan: 02-09
phase: 02-ai-token-cost-optimization
status: complete
completed: 2026-07-27
requirements: [TOK-07]
key_files:
  created: []
  modified:
    - src/config/pricing-config.ts
    - src/config/pricing-config.snapshot.ts
    - src/config/__tests__/sc12-snapshot.test.ts
    - supabase/functions/analyze-resume/index.ts
    - supabase/functions/analyze-resume/index.test.ts
    - supabase/functions/analyze-career/index.ts
    - supabase/functions/analyze-career/index.test.ts
    - supabase/functions/recruiting-lens/index.ts
    - supabase/functions/grade-linkedin/index.ts
    - .planning/maxtoken-tuning/TRACKER.md
commits:
  - 92f38783  # Task 1 — SC-12 table, snapshot, sc12 test
  - b3a4f624  # Task 2 — CALL_CONFIGS + test replicas
  - <this>    # Task 3 — TRACKER close-out + SUMMARY
---

# Plan 02-09 Summary — Implement LOCKED approved caps

Implemented the operator-approved final `maxTokensOutput` table from `02-APPROVED-CAPS.md`
(LOCKED 2026-07-27, 15/15 APPROVE as proposed) across the complete lockstep file set. This edit
is simultaneously the TEMP-cap revert — every `// TEMP (Phase 02 measurement window)` marker is
gone and no diagnostic value survives.

## Accomplishments

- **Task 1 (`92f38783`)** — Final values written into the SC-12 central table (`pricing-config.ts`),
  its byte-identical snapshot (`pricing-config.snapshot.ts`), and the `sc12-snapshot.test.ts` title.
  Snapshot `tierSums.maxTokensOutput` = **free 22,800 / pro 97,000 / elite 109,000** (taken verbatim
  from the LOCKED sheet, not re-derived). `interviewPrepCoach` byte-identical (deferred, untouched).
  TEMP markers replaced with durable `Phase 02 LOCKED — peak N` provenance comments.
- **Task 2 (`b3a4f624`)** — Final per-call budgets written into every `CALL_CONFIGS` and its test
  replica, walking the blast-radius map row by row:
  - Resume `analyze-resume/index.ts` CALL_CONFIGS: criteria-1 6000, criteria-2 7000, summary 12000,
    rewrites 4000, elite-extras 12000 (elite-only; pro/free 0) → elite sum 41000, pro sum 29000.
  - Career `analyze-career/index.ts`: base 5000 / growth 4000 / elite-extras 2000 → elite+pro 11000;
    free `base.maxTokensFree` 4800.
  - Recruiting Lens `recruiting-lens/index.ts`: rl-call-1/2/3 = 12000 each → 36000; cache variant bumped.
  - LinkedIn `grade-linkedin`: cap is derived via `getMaxOutput` (9000 both tiers); doc-comment confirmed.
- **Task 3 (this commit)** — Deploy-gate legs run (see below); `TRACKER.md` closed out for the four
  in-scope features with evidence pointers; Interview Prep left open.

## Invariants re-verified (all hold)

- Per-call ≤ `ABSOLUTE_MAX_TOKENS` 12,000 — max cell is 12,000 (resume summary/elite-extras, rl-call-1/2/3 sit AT the clamp). ✓
- Per-tier `CALL_CONFIGS` sum ≤ ceiling: Resume elite 41,000 / pro 29,000; Career 11,000; RL 36,000. ✓
- GATE-09: resume free 9,000 < 50% × 41,000 = 20,500 (22.0%). ✓
- Career brevity `target × 1.8 ≤ ceiling`: free 2,200×1.8=3,960 ≤ 4,800; elite/pro 4,500×1.8=8,100 ≤ 11,000. ✓ (explicitly re-checked — ceilings did not drop below their brevity floor.)
- Zero `TEMP (Phase 02` markers survive in `src/` or `supabase/`. ✓

## Deploy-gate (verify:baseline) status

| Leg | Result |
|---|---|
| lint | ✅ 0 errors (151 pre-existing warnings) |
| type-check | ✅ exit 0 |
| vitest (frontend) | ✅ 871 passed / 0 failed (122 files) |
| sc12-snapshot (targeted) | ✅ 5/5 — tier sums reconcile to 22,800 / 97,000 / 109,000 |
| deno edge — the 4 touched functions | ✅ 555 passed / 0 failed (analyze-resume, analyze-career, recruiting-lens, grade-linkedin) |
| build | ✅ built in ~17s |
| `test:edge:remote` (preview network) | ⏸ operator/CI-gated — needs preview env |
| `test:e2e` (Playwright) | ⏸ operator/CI-gated per Phase 03-07 precedent |

The `check-edge-boot.mjs` gate could not load modules in this local bash session (Node `spawn deno`
→ ENOENT; `deno` is installed as an npm shim not directly spawnable). The equivalent guarantee is
covered by the 555 passing source-probe edge tests + the deno suite running fine through the shell.
Plan 02-10's operator deploy runs the full `verify:baseline` (including remote-deno + Playwright) as
`deploy.ps1`'s HARD precondition before `supabase link`, so the remaining legs are proven at deploy.

## Per-cell (final cap, measured first-attempt peak) — for 02-10 post-deploy re-run verification

| feature / tier / call | final cap | measured peak | expected headroom |
|---|---:|---:|---|
| Resume free free-single | 9,000 | 4,944 | +45% |
| Resume elite criteria-1 | 6,000 | 4,312 | +28% |
| Resume elite criteria-2 | 7,000 | 4,883 | +30% |
| Resume elite summary | 12,000 | ≥10,000 (lower bound) | truncated 1/4 @10k — self-heal safety net |
| Resume elite rewrites | 4,000 | 2,705 | +32% |
| Resume elite elite-extras | 12,000 | ≥9,000 (lower bound) | truncated 1/4 @9k — self-heal safety net |
| Career free base | 4,800 | 2,935 | +39% |
| Career elite base | 5,000 | 3,523 | +30% (clears the 4,500 that truncated 07-17) |
| Career elite growth | 4,000 | 2,798 | +30% |
| Career elite elite-extras | 2,000 | 983 | +51% |
| LinkedIn free | 9,000 | 5,774 | +36% |
| LinkedIn elite | 9,000 | 4,853 | +46% |
| RL elite rl-call-1 | 12,000 | 10,955 | +9% (at clamp) |
| RL elite rl-call-2 | 12,000 | 8,669 | +28% |
| RL elite rl-call-3 | 12,000 | 8,280 | +31% |

## Deviations

- Execution was interrupted mid-Task-3 by an API spend limit after Tasks 1–2 had committed. Resumed:
  Tasks 1–2 verified correct against the LOCKED table on disk (no re-execution), Task 3 completed.
- Full offline `test:edge` (698 tests) narrowed to the 4 functions this plan touched (555 tests) — the
  only functions whose source changed; the rest are untouched by this plan.

## Self-Check: PASSED

All 15 LOCKED cells present at their final value across every lockstep file; zero TEMP markers; all
boot invariants hold; feasible verify:baseline legs green; remaining legs operator/CI-gated at 02-10 deploy.

## Handoff to 02-10

Deploy the final caps to production (`deploy.ps1` runs full verify:baseline first), then re-run the
per-cell subset above and assert `out < maxTokens` at the expected headroom. Watch the 5 at-clamp
cells (resume summary + elite-extras, rl-call-1/2/3) via the near-cap telemetry (SQL Block 4); the
resume attempt-2 self-heal covers a rare summary/elite-extras truncation.

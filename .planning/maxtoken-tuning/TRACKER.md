# Mini-Milestone — Per-Feature / Per-Tier maxTokens Tuning

**Status:** Active for Interview Prep Coach only · Resume Analysis, Career Compass, LinkedIn Grader, and Recruiting Lens are **CLOSED — Phase 02 FINAL caps implemented 2026-07-27** (plan 02-09; evidence: [02-APPROVED-CAPS.md](../phases/02-ai-token-cost-optimization/02-APPROVED-CAPS.md) LOCKED table + [02-MEASUREMENT-REPORT.md](../phases/02-ai-token-cost-optimization/02-MEASUREMENT-REPORT.md)) · **Branch:** `staging` (deploy-gated — nothing live until deploy; plan 02-10 owns the operator production deploy) · **Started:** 2026-06-09 · Lineage: continues quick task `260608-p5k`.

## Closing state — Phase 02 FINAL approved caps (2026-07-27)

Operator approved 15/15 cells as proposed (sizing rule `max(ceil(first_attempt_peak x 1.4), pre-TEMP value)`; "keep" is a first-class outcome). Per-feature `maxTokensOutput` ceilings now live in the repo:

| feature | free | pro | elite | per-call split (pro/elite) |
|---|---:|---:|---:|---|
| **Resume Analysis** | 9,000 (keep) | 29,000 | 41,000 | criteria-1 6,000 + criteria-2 7,000 + summary 12,000 + rewrites 4,000 + elite-extras 12,000 (elite only) |
| **Career Compass** | 4,800 (keep) | 11,000 | 11,000 | base 5,000 + growth 4,000 + elite-extras 2,000 |
| **LinkedIn Grader** | 9,000 | 9,000 | 9,000 | single derived call |
| **Recruiting Lens** | — | 36,000 | 36,000 | rl-call-1/2/3 at 12,000 each (AT the `ABSOLUTE_MAX_TOKENS` clamp) |

Snapshot tierSums: free 22,800 / pro 97,000 / elite 109,000. Five cells sit AT the 12,000 per-call clamp (resume summary + elite-extras, rl-call-1/2/3) — the standing near-cap telemetry watch (02-MEASUREMENT-REPORT SQL Block 4) and the resume attempt-2 self-heal are the safety nets; prompt-shape bounding is the deferred durable fix.

## Goal

Right-size the output `maxTokens` for every AI feature on every tier so each call **completes naturally (`out < maxTokens`)** with modest headroom — no truncation (which causes JSON-merge failures / validation hard-fails / merit refunds) and no wasteful over-allocation.

## Methodology (the LinkedIn pattern)

1. **Diagnostic bump** — raise the cap to a large value (≤ `ABSOLUTE_MAX_TOKENS = 12000`, the per-call clamp in `_shared/anthropic.ts`) so nothing truncates while observing. `max_tokens` is a *ceiling, not a target* — a high cap costs nothing unless the model actually needs the tokens.
2. **Observe** — run 2–3 real analyses per tier, read the `[PERF] … out=NNNN | maxTokens=MMMM` lines.
3. **Right-size** — set the cap to roughly **peak `out` × ~1.4** (~40–50% headroom). Update `pricing-config.ts` **and** the locked snapshot in lockstep (the `sc12-snapshot.test.ts` guard fails otherwise), plus any per-function `CALL_CONFIGS` + their test replicas.

## Where each feature's maxTokens actually lives (wiring map)

Central table: `src/config/pricing-config.ts` → `maxTokensOutput` (SC-12). Guarded by `pricing-config.snapshot.ts` + `src/config/__tests__/sc12-snapshot.test.ts`. Re-exported edge-side via `_shared/tier-config.ts` (`getMaxOutput`).

| feature | reads cap from | notes / invariants |
|---|---|---|
| **LinkedIn Grader** | `getMaxOutput` directly (`LINKEDIN_MAX_TOKENS`) | single call. Changing the table cell is sufficient. |
| **Resume Analysis** | elite/pro: `CALL_CONFIGS` (parallel, per-call); free: `FREE_SINGLE_CALL_MAX_TOKENS = getMaxOutput(free)` (single consolidated call) | Phase 02 FINAL: elite `CALL_CONFIGS` sum = ceiling = 41000, pro 29000; **GATE-09: free 9000 < 50% of elite (20500)**. Replica + sums in `analyze-resume/index.test.ts`. |
| **Career Compass** | `CAREER_CALL_CONFIGS` (base + elite-extras); free = `base.maxTokensFree` | boot invariant: per-tier sum ≤ ceiling. Free needs BOTH the table cell AND `base.maxTokensFree` bumped. Replica + sums in `analyze-career/index.test.ts`. |
| **Recruiting Lens** | elite/pro: `CALL_CONFIGS` (3-call, Phase 02 FINAL sum 36000) | **no free tier** (free=0/locked). Cache variant MUST bump with any cap change. |
| **Interview Prep** | `getMaxOutput(tier)`; pro = `min(5000, cap)`, elite = cap | **no free tier** (free=0/locked). `interview-prep-evaluate` uses elite cap. |

## Status matrix (output maxTokens)

Legend: **DONE (Phase 02)** = final approved value implemented 2026-07-27 by plan 02-09 (see Closing state above) · ⬜ not yet tuned · — no such tier.

| feature | free | pro | elite | observed first-attempt peak `out` (Phase 02 Epoch 2) |
|---|---|---|---|---|
| **LinkedIn Grader** | **DONE (Phase 02)** — 9000 | **DONE (Phase 02)** — 9000 | **DONE (Phase 02)** — 9000 | free 5774 / elite 4853 |
| **Resume Analysis** | **DONE (Phase 02)** — 9000 | **DONE (Phase 02)** — ceiling 29000 | **DONE (Phase 02)** — ceiling/sum 41000 | free 4944; elite criteria 4312/4883, rewrites 2705, summary ≥10000 + elite-extras ≥9000 (lower bounds — truncated 1/4) |
| **Career Compass** | **DONE (Phase 02)** — 4800 | **DONE (Phase 02)** — ceiling/sum 11000 | **DONE (Phase 02)** — ceiling/sum 11000 | free base 2935; elite base 3523 / growth 2798 / extras 983 |
| **Recruiting Lens** | — | **DONE (Phase 02)** — ceiling/sum 36000 | **DONE (Phase 02)** — ceiling/sum 36000 | rl-call-1 10955 (@12000 clamp) / rl-call-2 8669 / rl-call-3 8280 |
| **Interview Prep** | — | ⬜ 5000* | ⬜ 12000* | — |

\* = current value carried over from `260608-p5k`, not yet validated against observed output in this milestone.

## Done

- **Career Compass elite base = BOUND-THE-SHAPE (prompt-only, no cap change)** — REGRESSION FIX 2026-07-17 (debug `cc-elite-output-truncated`, reqId 37b58763). An elite run hit the elite `base` call's 4500 output cap exactly (`out=4500`, `outLen=17286`, `stop_reason=max_tokens`) → terminal `422 output_truncated` → whole elite analysis hard-failed + refunded. The three elite `CAREER_CALL_CONFIGS` caps (base 4500 / growth 3500 / extras 2000) already sum to EXACTLY the 10000 elite ceiling (`getMaxOutput('careerCompass','elite')`), so there is zero slack to enlarge base without rebalancing or raising the pricing-config ceiling + snapshot + sc12 test in lockstep. Root cause is the SAME LinkedIn lesson (line 43): the base prompt bounded ITEM COUNTS (careerFields/roles/surpriseFits) but left per-item sub-arrays and per-string content UNBOUNDED, so the model overshot its "under 2200 tokens" instruction ~2x. Fix (per approved direction A) is prompt-only: the elite `brevityBlock` (`analyze-career/index.ts:1938`) now hard-caps whyMatchDetails ≤3, requiredSkills ≤5, recommendedRoles ≤3, per-role qualificationSteps ≤4, per-role skillGaps ≤3, plus per-string length guidance. NO maxTokens cap, tier ceiling, snapshot, or test-sum change. Lesson reinforced: right-size only against prompts with BOUNDED output SHAPE (counts AND per-item content).

- **LinkedIn Grader elite/pro = 9000 (was 7000)** — REGRESSION FIX 2026-07-09 (debug `linkedin-grader-schema-fail`, reqId b4d1c037): a sparse elite profile (in=517) hit the 7000 cap on both attempts (`out=7000` exactly) → silent truncation → SCHEMA_VALIDATION_FAILED after retry. The 7000 sizing assumed the observed 4720 peak, but the prompt allowed unbounded topFixes ("more if the profile warrants it"). Fixed both sides: prompt now hard-caps topFixes at 7 (`grade-linkedin/prompts.ts`) and cap raised to 9000 (tier sums pro/elite 64000→66000, snapshot + sc12 test updated in lockstep). Lesson: right-size only against prompts with BOUNDED output shape. Originally right-sized from observed peak `out=4720` (~48% headroom). Also this milestone's lineage fixed: admin→elite backend elevation (`_shared/auth.ts`), frontend paywall gating on effective tier (`LinkedInGrader.tsx`), and out-of-range section-score clamping (`grade-linkedin/validation.ts` `clampLinkedInSectionScores`) so a stray over-score degrades instead of hard-failing.

## Superseded diagnostic pass — absorbed into Phase 02 (now CLOSED)

The old Free-tier-only diagnostic pass and its revert checklist are closed for Resume Analysis,
Career Compass, and LinkedIn Grader. Phase 02 expanded the same measurement method to all four
covered features, persisted per-call telemetry, ran the approved 21-analysis production study,
and plan 02-09 executed both sides of the final edit on 2026-07-27: every TEMP diagnostic cap
was replaced in the same lockstep commits by the operator-approved value (15/15 APPROVE — see
the Closing state table above). See [Phase 02](../phases/02-ai-token-cost-optimization/).

Corrected pre-Phase-02 source facts carried into that phase:

- Resume Analysis: Free ceiling 9000; Pro/Elite central ceiling 20000 with active `CALL_CONFIGS`
  sum 18000 (the old status row mislabeled 18000 as the central ceiling).
- Career Compass: Free ceiling and `base.maxTokensFree` 4800, not 12000; Pro/Elite central
  ceiling and `CAREER_CALL_CONFIGS` sum 10000.
- LinkedIn Grader: Free 12000; Pro/Elite 9000.
- Recruiting Lens: Pro/Elite central ceiling and three-call sum 15000.

Interview Prep Coach remains open and is not part of Phase 02.

## Verify after any change

- `npx vitest run src/config/__tests__/sc12-snapshot.test.ts`
- `deno test supabase/functions/analyze-career/index.test.ts supabase/functions/analyze-resume/index.test.ts --no-check --allow-all`
- Pre-existing/unrelated noise: `analyze-resume` `fixtureKey` type errors under `deno check` (suite runs `--no-check`); `cost-map-invariant.test.ts` `@/` alias under Deno.

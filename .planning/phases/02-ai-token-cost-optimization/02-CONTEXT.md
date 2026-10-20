# Phase 2: AI Token & Cost Optimization - Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Ground every per-feature, per-tier `maxTokens` limit in real production usage data instead of estimates: build a permanent token-telemetry instrument, run a measured production pass, present a report, gate on operator approval, then implement the approved budgets and verify them.

**In scope:** telemetry instrumentation, measurement runs, analysis + report, operator-approved cap changes across `pricing-config.ts` / snapshot / `sc12-snapshot.test.ts` / per-function `CALL_CONFIGS` + test replicas, post-change verification.

**Out of scope:** prompt rewrites, model selection, input-side cost work (prompt caching / input trimming), new cost features. Findings about these are *reported*, not implemented.

</domain>

<decisions>
## Implementation Decisions

### Measurement mechanism

- **Persist token data to Postgres.** Do not rely on mining ephemeral `[PERF]` console lines (`_shared/anthropic.ts:640`) — Supabase log retention is bounded and the data is string-parsed and single-use.
- **New dedicated table (`ai_call_telemetry` or similar), one row per Anthropic call — not per analysis.** Resume Analysis, Career Compass, and Recruiting Lens are multi-call parallel merges; per-call granularity is what right-sizing `CALL_CONFIGS` requires. An analysis-level total cannot size an individual call.
- **Fields to capture:** feature, tier, call name, `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, effective `maxTokens`, `stop_reason`, duration, model, plus keys to correlate a run.
- **Fire-and-forget writes.** A telemetry insert failure must log a warning and never fail the analysis. Instrumentation must not add a failure mode to Resume Analysis or Career Compass (business-critical flows).
- **Permanent, not scaffolding.** Telemetry stays in production indefinitely. Rationale: both prior truncation regressions (LinkedIn 2026-07-09, Career Compass 2026-07-17) were discovered only *after* they broke a paying user's analysis. Standing telemetry surfaces "out approaching maxTokens" before it becomes a 422 + refund.

### Environment, accounts & coverage

- **Measurement runs execute on PRODUCTION** (operator decision, overriding the staging recommendation).
- **Prerequisite: deploy TEMP diagnostic caps to production BEFORE measuring.** Prod does not currently carry the staging diagnostic bumps. Career Compass elite `base` is 4500 on prod and truncated at exactly that on 2026-07-17 (`out=4500`, `outLen=17286`) → terminal `422 output_truncated` → hard fail + refund. Measuring at current prod caps would read the ceiling rather than the model's real appetite AND burn real users' Merits. Raise caps toward `ABSOLUTE_MAX_TOKENS = 12000` for the observation window; `max_tokens` is a ceiling, not a target, so a high cap costs nothing unless actually consumed.
- **Coverage matrix (brief as written, minus one impossible cell):**
  | feature | free | elite |
  |---|---|---|
  | Onboarding / Resume Analysis | 3 runs | 3 runs |
  | LinkedIn Grader | 3 runs | 3 runs |
  | Career Compass | 3 runs | 3 runs |
  | Recruiting Lens | — (no free tier; free = 0/locked) | 3 runs |
  **21 runs total**, not 24.
- **Pro tier:** no separate pro runs. For LinkedIn / Resume / Career Compass / Recruiting Lens the prompt does not branch on tier between pro and elite, so the elite-derived cap mirrors to pro. (Claude's call — the "you decide" answer.)
- **Elite access:** admin backend elevation via `_shared/auth.ts` (admin emails resolve to elite server-side). No real Stripe Elite subscriptions required. Input variety comes from the resumes/profiles used, not from account identity.
- **Merits:** accept the real burn on operator-controlled accounts. No refund-RPC writes, no pre-grants.
- **Inputs:** ad-hoc — the operator supplies substantially different real resumes / LinkedIn profiles live at run time. Not a checked-in fixture set. Report must record enough about each input (length, density, sparsity) that outliers are interpretable.

### Sizing rule & risk posture

- **Caps are sized for reliability headroom, not cost.** Lowering `maxTokens` does not reduce spend — Anthropic bills output tokens actually generated. A cap below the model's appetite produces a truncated response, which in this codebase means `422` → hard fail → Merit refund → zero revenue at full cost. Unused ceiling is free. Cost findings are reported from measured tokens; the cap is not the cost lever.
- **Formula: observed peak × ~1.4 (≈40–50% headroom), with an explicit floor.** No cell may be recommended *below* its current value on the strength of 3 samples — small-n risk. The floor prevents a lucky-low sample from causing a regression.
- **Output-shape audit is in scope; prompt rewrites are not.** For each feature, verify whether the prompt bounds BOTH item counts AND per-item content. Both prior regressions were unbounded-shape failures, not arithmetic failures. Flag unbounded cells in the report as "cap cannot be trusted here yet" — the TRACKER's own stated precondition for right-sizing. Any needed prompt tightening becomes follow-up work.
- **No-change is a valid per-cell outcome.** If a cap is already well-sized, the recommendation is "keep" with recorded evidence. Avoids churning `pricing-config.ts` + snapshot + `sc12-snapshot.test.ts` + `CALL_CONFIGS` replicas for no gain — all of which must move in lockstep or boot invariants and guards fail.
- **Invariants that constrain any recommendation:** per-tier `CALL_CONFIGS` sums ≤ tier ceiling; **GATE-09** — Resume free must be < 50% of elite (i.e. < 10000) or boot throws; `ABSOLUTE_MAX_TOKENS = 12000` per-call clamp in `_shared/anthropic.ts`.

### Report & approval artifact

- **Location/form:** `02-MEASUREMENT-REPORT.md` in the phase dir, **plus the checked-in SQL** that regenerates it from the telemetry table. Future tuning passes re-run the query rather than re-deriving the analysis.
- **Required contents (all four):**
  1. **Per-run raw rows** — every call: feature, tier, call name, in / out / cache_create / cache_read, maxTokens, stop_reason, duration.
  2. **Per-cell stats + outliers** — min / mean / peak `out` per feature × tier × call, headroom % vs current cap, flagged near-cap or outlier runs.
  3. **Cost in dollars** — measured input+output priced at current Anthropic rates: per analysis, per tier, and projected per 1000 analyses.
  4. **Recommendation table with blast radius** — proposed cap, current value, delta, and the exact files that must change in lockstep for that cell.
- **Approval checkpoint: HARD STOP, `autonomous: false`.** Never auto-advanced even with auto-mode enabled. Operator approves / rejects / amends **each proposed cap individually**; only approved cells are implemented. The approved table is written back into the phase artifact as the locked input to implementation.
- **Verification: re-run + production telemetry soak.** Re-run a subset of the measurement inputs at the new caps to confirm `out < maxTokens` with headroom and zero 422s, then watch permanent prod telemetry over a real-traffic window for near-cap runs. The soak is the step both prior regressions lacked — each was a sparse-input edge case no single scripted run would have caught.

### Claude's Discretion

- Exact telemetry table name, column types, RLS posture, and retention/pruning policy.
- How the telemetry write path reaches `_shared/anthropic.ts` cleanly (correlation-id threading, service-client access).
- Whether pro needs its own runs on a per-feature basis if research finds a tier-branching prompt not currently known.
- Phase-internal plan sequencing and the shape of the TEMP-cap deploy/revert steps.
- Relationship to `.planning/maxtoken-tuning/TRACKER.md`: Phase 2 supersedes and closes that mini-milestone for the four covered features (its revert checklist becomes part of the implementation step); Interview Prep remains open there.

</decisions>

<specifics>
## Specific Ideas

- **"Right-size only against prompts with BOUNDED output SHAPE"** — the TRACKER's stated lesson from both regressions. Treat this as a gating precondition per cell, not advice.
- **The 2026-07-17 Career Compass fix is the reference pattern** for shape bounding: the prompt bounded item counts (careerFields/roles/surpriseFits) but left per-item sub-arrays and per-string content unbounded, so the model overshot ~2×. The fix was prompt-only, no cap change.
- **The three elite `CAREER_CALL_CONFIGS` caps (base 4500 / growth 3500 / extras 2000) sum to EXACTLY the 10000 elite ceiling** — zero slack. Enlarging base requires rebalancing or raising the ceiling + snapshot + sc12 test in lockstep.
- Existing benchmark harnesses that may be reusable references: `scripts/validate-performance.mjs`, `scripts/validate-career-performance.mjs`, `scripts/staging-cache-perf-probe.mjs`.

</specifics>

<deferred>
## Deferred Ideas

- **Interview Prep Coach token tuning** — the only fully untuned feature (unvalidated 5000 pro / 12000 elite carried over from `260608-p5k`). Excluded from this phase's matrix by operator decision.
- **Independent Pro-tier measurement** — pro is mirrored from elite this phase. Worth its own runs if pro prompts ever diverge.
- **Prompt output-shape rewrites** — where the audit flags an unbounded prompt, tightening it is follow-up work (the 07-17 Career Compass pattern applied to other features).
- **Input-side cost reduction** — prompt caching strategy, input trimming, and model selection are the real levers on spend. Reported as findings this phase, not implemented.
- **Telemetry-driven near-cap alerting** — once permanent telemetry exists, an automated alert on `out / maxTokens` crossing a threshold would catch the next regression before a user does.

</deferred>

---

*Phase: 02-ai-token-cost-optimization*
*Context gathered: 2026-07-21*

# Phase 02 — Approved Caps (per-cell operator decision sheet)

**Status:** **LOCKED — 2026-07-27.** Operator gave an explicit per-cell verdict for all 15 cells (A1–B10): **APPROVE as proposed** on every cell. Zero REJECT, zero AMEND, zero cells sent back for re-measurement. Plan **02-09 implements the LOCKED FINAL TABLE below and nothing else** — no cell may be added, dropped or nudged during implementation.
**Source proposals:** `02-MEASUREMENT-REPORT.md` Section 4 (recommendation table + blast radius).
**Shape verdicts:** `02-OUTPUT-SHAPE-AUDIT.md`.
**Sizing rule (locked):** `proposed = max( ceil(first_attempt_peak × 1.4), current )`. No cell is proposed below its current pre-TEMP value (n=3 floor). "Keep" is a first-class outcome.

> **HARD STOP — `autonomous: false`, `gate="blocking-human"`.** `workflow.auto_advance` is `true` but does NOT apply to this plan. There is no "approve all" shortcut and no default answer. The operator gives a verdict **per cell**. A blanket "looks good" is not accepted in place of the per-cell column.

---

## Decision context (three lines, and nothing more)

1. **Unused ceiling is free.** Anthropic bills the output tokens actually generated, not the cap — a high cap costs nothing unless the model consumes it. The cap is a reliability lever, not a cost lever.
2. **A cap below the model's appetite is a `422`.** `stop_reason=max_tokens` → terminal `422 output_truncated` → hard fail → Merit refund → zero revenue at full cost. This is the exact failure the phase exists to prevent (LinkedIn 2026-07-09, Career Compass 2026-07-17).
3. **"Keep" is a valid outcome.** A cell already well-sized should be kept — every change churns 4–6 lockstep files (`pricing-config.ts` + snapshot + `sc12-snapshot.test.ts` + per-function `CALL_CONFIGS` replicas + sum/GATE rechecks), so a no-gain change is a net loss.

## Verdict semantics

- **APPROVE** → implement the PROPOSED value.
- **REJECT** → revert this cell to its **PRE-TEMP production value** (the "current (pre-TEMP)" column — NOT the TEMP diagnostic value currently live). Note: because the TEMP caps are live on prod, a REJECT is still an edit, not a no-op — in this phase "revert" and "implement" are the same commit.
- **AMEND `<value>`** → implement the operator's stated value instead. Claude re-checks it against per-call ≤ `ABSOLUTE_MAX_TOKENS` 12,000, per-tier `CALL_CONFIGS` sum ≤ the tier ceiling, GATE-09 (resume free < 50% of resume elite), and the Career brevity ratio (`target × 1.8 ≤ ceiling`), and reports back if the amendment breaks an invariant.

---

## Group A — clean-shape cells (shape audit: TRUSTED)

These cells' prompts bound both item counts and per-string content (audit points 1–3 all PASS/PASS-or-PARTIAL). The measured peak samples a bounded distribution, so `peak × 1.4` is a trustworthy right-size.

| # | cell (feature × tier × call) | current (pre-TEMP) | first-attempt peak | proposed | delta | shape-audit verdict | lockstep files (blast radius) | VERDICT | amended value |
|---|------------------------------|-------------------:|-------------------:|---------:|------:|---------------------|-------------------------------|:-------:|:-------------:|
| A1 | Resume · free · free-single | 9,000 | 4,944 | 9,000 (keep) | 0 | TRUSTED | pricing-config.ts + snapshot(+tierSums.free) + sc12 title + analyze-resume/index.test.ts bad-config threshold(111–118) + free-sum(69) + GATE-09 recheck | **APPROVE** | — |
| A2 | Resume · elite · criteria-1 | 5,000 | 4,312 | 6,000 | +1,000 | TRUSTED | pricing-config.ts + snapshot(+tierSums) + sc12 title + analyze-resume/index.ts:361 CALL_CONFIGS + index.test.ts:34 replica + sum assertions(75–82,124–130) + GATE-09 | **APPROVE** | — |
| A3 | Resume · elite · criteria-2 | 5,000 | 4,883 | 7,000 | +2,000 | TRUSTED | *(same as A2 criteria-1)* | **APPROVE** | — |
| A4 | Resume · elite · rewrites | 3,000 | 2,705 | 4,000 | +1,000 | TRUSTED | *(same as A2 criteria-1)* | **APPROVE** | — |
| A5 | Career · elite · growth | 3,500 | 2,798 | 4,000 | +500 | TRUSTED | pricing-config.ts + snapshot(+tierSums) + sc12 title + analyze-career/index.ts:104–107 all 3 cells + brevity-ratio recheck + index.test.ts:104 replica + elite/pro sums + token-budget.test.ts | **APPROVE** | — |

---

## Group B — cells where the cap CANNOT BE TRUSTED YET (unbounded output shape)

Each cell below fails at least one of shape-audit points 1–3: its prompt leaves some part of the output shape unbounded, so the measured peak samples an *unbounded* distribution and `peak × 1.4` does not bound the next run. Approving these is a reasonable interim choice — the safety nets are the standing near-cap watch (report SQL Block 4) and, for the resume cells, the `analyze-resume` attempt-2 self-heal — but the durable fix is a prompt-bounding follow-up (deferred, out of this phase). The one-line note names what is unbounded.

| # | cell (feature × tier × call) | current (pre-TEMP) | first-attempt peak | proposed | delta | shape-audit verdict + what is unbounded | lockstep files (blast radius) | VERDICT | amended value |
|---|------------------------------|-------------------:|-------------------:|---------:|------:|-----------------------------------------|-------------------------------|:-------:|:-------------:|
| B1 | Resume · elite · summary | 5,000 | ≥10,000 (LOWER BOUND — truncated 1/4 @10,000) | 12,000 | +7,000 | cannot be trusted / accept+self-heal — `executiveSummary` narrative strings have no length bound; `recommendedKeywords` 10-vs-15-25 prompt conflict | *(same as A2 criteria-1)* | **APPROVE** | — |
| B2 | Resume · elite · elite-extras | 4,000 | ≥9,000 (LOWER BOUND — truncated 1/4 @9,000) | 12,000 | +8,000 | cannot be trusted / accept+self-heal — `recruiterFirstImpressions` prose + `hiddenWeaknesses`/`powerPhrases` items have no per-string length bound | *(same as A2 criteria-1; elite-only)* | **APPROVE** | — |
| B3 | Career · free · base | 4,800 | 2,935 | 4,800 (keep) | 0 | cannot be trusted — nested arrays (`whyMatchDetails`/`requiredSkills`/`transferableSkills`) not count-bounded (the 2026-07-17 failure class) | pricing-config.ts + snapshot(+tierSums.free) + sc12 title + analyze-career/index.ts:105 base.maxTokensFree + brevity-ratio recheck + index.test.ts:104 replica + CC-05 free assertion | **APPROVE** | — |
| B4 | Career · elite · base | 4,500 | 3,523 (truncated @4,500 on 2026-07-17) | 5,000 | +500 | cannot be trusted — same nested-array gap; MUST rise above the 4,500 that truncated | pricing-config.ts + snapshot(+tierSums) + sc12 title + analyze-career/index.ts:104–107 all 3 cells + brevity-ratio recheck + index.test.ts:104 replica + elite/pro sums + token-budget.test.ts | **APPROVE** | — |
| B5 | Career · elite · elite-extras | 2,000 | 983 | 2,000 (keep) | 0 | cannot be trusted — NO brevity block at all; `salaryBands`/`smartApplicationStrategy` unbounded (did NOT get the 2026-07-17 reference-pattern treatment) | *(same as B4 career elite base)* | **APPROVE** | — |
| B6 | LinkedIn · free · linkedin-grade | 5,000 | 5,774 (exceeds old 5,000 cap → would truncate if reverted) | 9,000 | +4,000 | cannot be trusted — `keyStrengths` + 12 per-section arrays uncapped; validator has `.min()` only, no `.max()` | pricing-config.ts + snapshot(+tierSums) + sc12 title *(derived — no CALL_CONFIGS)* + stale doc-comment grade-linkedin/index.ts:63–71 | **APPROVE** | — |
| B7 | LinkedIn · elite · linkedin-grade | 9,000 | 4,853 | 9,000 (keep) | 0 | cannot be trusted (latent) — same unbounded shape as B6; tier-identical prompt; risk latent at measured headroom | *(same as B6 LinkedIn free)* | **APPROVE** | — |
| B8 | Recruiting Lens · elite · rl-call-1 | 5,000 | 10,955 (@12,000 clamp; truncated 1/5 @9,000) | 12,000 | +7,000 | cannot be trusted / AT HARD CLAMP — `recruiterVerdict` 2-4-paragraph block unbounded; cannot be raised further without lifting the 12,000 clamp | pricing-config.ts + snapshot(+tierSums) + sc12 title + recruiting-lens/index.ts:59 CALL_CONFIGS + cache-variant bump | **APPROVE** | — |
| B9 | Recruiting Lens · elite · rl-call-2 | 5,000 | 8,669 (near-cap, ~4% headroom @9,000) | 12,000 | +7,000 | cannot be trusted — per-string content (`whyItMatters`/roadmap fields) unbounded; no `.max()` in schema | *(same as B8 rl-call-1)* | **APPROVE** | — |
| B10 | Recruiting Lens · elite · rl-call-3 | 5,000 | 8,280 (near-cap @9,000) | 12,000 | +7,000 | cannot be trusted — `linkedinImprovements` count unbounded; per-string content unbounded; no `.max()` | *(same as B8 rl-call-1)* | **APPROVE** | — |

---

## Notes carried into the verdict (from the report's decision context)

- **No cell is proposed below its current value** (n=3 floor rule), so no APPROVE can cause a truncation regression relative to today.
- **Wall-clock risk on slow cells (flagged, NOT fixed this phase):** the longest Epoch 2 calls were Recruiting Lens rl-call-1 (100,935 ms), Resume summary (96,823 ms), Resume elite-extras (85,581 ms). A large approved cap on these inherits that latency risk (the caps for B1/B2/B8 are the ones this touches). Timeouts are a separate lever and out of scope.
- **Pro mirrors Elite** for all four features (prompts don't tier-branch, or Pro is a strict subset) — no separate Pro verdict is required; the elite verdict propagates to Pro.
- **Deferred / NOT up for decision here:** Interview Prep caps, independent Pro-tier values, prompt rewrites, input-side cost work, near-cap alerting.

## LOCKED FINAL TABLE — the only input plan 02-09 implements

**LOCKED 2026-07-27.** Verdict source: operator per-cell reply (all 15 cells: APPROVE as proposed). Final value = proposed value for every cell. Plan 02-09 implements this table and **nothing else** — no cell added, dropped or nudged during implementation.

| # | cell (feature × tier × call) | verdict | FINAL value | pre-TEMP value it replaces | delta |
|---|------------------------------|:-------:|------------:|---------------------------:|------:|
| A1 | Resume · free · free-single | APPROVE | **9,000** (keep) | 9,000 | 0 |
| A2 | Resume · elite · criteria-1 | APPROVE | **6,000** | 5,000 | +1,000 |
| A3 | Resume · elite · criteria-2 | APPROVE | **7,000** | 5,000 | +2,000 |
| A4 | Resume · elite · rewrites | APPROVE | **4,000** | 3,000 | +1,000 |
| A5 | Career · elite · growth | APPROVE | **4,000** | 3,500 | +500 |
| B1 | Resume · elite · summary | APPROVE | **12,000** | 5,000 | +7,000 |
| B2 | Resume · elite · elite-extras | APPROVE | **12,000** | 4,000 | +8,000 |
| B3 | Career · free · base | APPROVE | **4,800** (keep) | 4,800 | 0 |
| B4 | Career · elite · base | APPROVE | **5,000** | 4,500 | +500 |
| B5 | Career · elite · elite-extras | APPROVE | **2,000** (keep) | 2,000 | 0 |
| B6 | LinkedIn · free · linkedin-grade | APPROVE | **9,000** | 5,000 | +4,000 |
| B7 | LinkedIn · elite · linkedin-grade | APPROVE | **9,000** (keep) | 9,000 | 0 |
| B8 | Recruiting Lens · elite · rl-call-1 | APPROVE | **12,000** | 5,000 | +7,000 |
| B9 | Recruiting Lens · elite · rl-call-2 | APPROVE | **12,000** | 5,000 | +7,000 |
| B10 | Recruiting Lens · elite · rl-call-3 | APPROVE | **12,000** | 5,000 | +7,000 |

*Pro mirrors Elite for all four features (locked in the measurement report): the Elite verdict propagates to Pro; Resume Pro drops the elite-only `elite-extras` call; Interview Prep is untouched (deferred, not up for decision here).*

---

## Whole-set invariant re-check (arithmetic shown)

### Invariant 1 — per-call value ≤ `ABSOLUTE_MAX_TOKENS` 12,000

All 15 final values: 9,000 / 6,000 / 7,000 / 4,000 / 4,000 / 12,000 / 12,000 / 4,800 / 5,000 / 2,000 / 9,000 / 9,000 / 12,000 / 12,000 / 12,000. Maximum = 12,000 ≤ 12,000 ✓ (B1, B2, B8–B10 sit exactly AT the hard clamp — allowed, cannot be raised further without lifting the clamp).

### Invariant 2 — per-tier `CALL_CONFIGS` sum ≤ the tier ceiling per feature

The tier ceilings are themselves re-derived from the approved cells, so sums are exact-equal by construction:

- **Resume elite:** 6,000 + 7,000 + 12,000 + 4,000 + 12,000 = **41,000** ≤ ceiling 41,000 ✓
- **Resume pro** (drops elite-only `elite-extras`): 6,000 + 7,000 + 12,000 + 4,000 + 0 = **29,000** ≤ ceiling 29,000 ✓
- **Resume free** (single call): 9,000 ≤ ceiling 9,000 ✓
- **Career elite:** 5,000 + 4,000 + 2,000 = **11,000** ≤ ceiling 11,000 ✓; **Career pro** mirrors elite: 5,000 + 4,000 + 2,000 = **11,000** ≤ 11,000 ✓
- **Career free** (single call): 4,800 ≤ ceiling 4,800 ✓
- **LinkedIn** (single call, ceiling derived — no CALL_CONFIGS): free 9,000 ≤ 9,000 ✓; pro/elite 9,000 ≤ 9,000 ✓
- **Recruiting Lens elite:** 12,000 + 12,000 + 12,000 = **36,000** ≤ ceiling 36,000 ✓; pro mirrors elite (Pro output is a strict subset): 36,000 ≤ 36,000 ✓

### Invariant 3 — GATE-09: resume free < 50% of resume elite

9,000 < 0.5 × 41,000 = 20,500 ✓ (ratio: 9,000 / 41,000 ≈ 22.0%).

### Invariant 4 — Career brevity ratio: `CAREER_BREVITY_TARGET_TOKENS[tier] × 1.8 ≤ ceiling`

- free: 2,200 × 1.8 = **3,960** ≤ 4,800 ✓
- pro: 4,500 × 1.8 = **8,100** ≤ 11,000 ✓
- elite: 4,500 × 1.8 = **8,100** ≤ 11,000 ✓

**Result: all four invariants hold for the whole approved set. Zero conflicts — no cell needs a second verdict.**

---

## Resulting `tierSums` for plan 02-09 (snapshot `SC12_SNAPSHOT.tierSums.maxTokensOutput` + sc12 test title — do not re-derive)

Per-feature `maxTokensOutput` ceilings after implementation (Interview Prep unchanged — deferred):

| Feature | free | pro | elite |
|---------|-----:|----:|------:|
| resumeAnalysis | 9,000 | 29,000 | 41,000 |
| careerCompass | 4,800 | 11,000 | 11,000 |
| recruitingLens | 0 | 36,000 | 36,000 |
| linkedinGrader | 9,000 | 9,000 | 9,000 |
| interviewPrepCoach (unchanged) | 0 | 12,000 | 12,000 |

- **tierSums.free** = 9,000 + 4,800 + 0 + 9,000 + 0 = **22,800**
- **tierSums.pro** = 29,000 + 11,000 + 36,000 + 9,000 + 12,000 = **97,000**
- **tierSums.elite** = 41,000 + 11,000 + 36,000 + 9,000 + 12,000 = **109,000**

(Replaces the TEMP measurement-window snapshot free 30,000 / pro 114,000 / elite 114,000.)

---

**LOCKED — 2026-07-27.** Every cell carries an explicit operator verdict (15/15 APPROVE); final value = proposed value for every cell; all four boot invariants re-checked above with the arithmetic shown; resulting tierSums recorded for 02-09. Plan 02-09 implements this table and nothing else.

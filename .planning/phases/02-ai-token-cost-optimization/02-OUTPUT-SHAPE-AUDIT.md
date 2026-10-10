# Phase 02 — Output-Shape Audit

**Purpose:** Right-sizing a cap from a measured peak is only valid if the prompt bounds the output SHAPE. If the shape is unbounded, the measured peak is a sample of an *unbounded* distribution, so `peak × 1.4` does NOT bound the next run. Both prior truncation regressions (LinkedIn 2026-07-09, Career Compass 2026-07-17) were unbounded-shape failures, not arithmetic failures.

**Scope:** the four in-scope prompt surfaces. Interview Prep is out of scope (findings noted only if free). **PROMPT REWRITES ARE OUT OF SCOPE — zero prompt files were modified by this plan** (`git diff --quiet` on all four surfaces is part of the plan's verification). Where tightening is needed, it is described as follow-up work, not applied.

## The 5-point checklist (RESEARCH §8)

1. Is every TOP-LEVEL array's item count a HARD maximum ("exactly N" / "at most N"), not a soft suggestion ("more if warranted")?
2. Is every NESTED array (per-item sub-array) also count-bounded? ← the 2026-07-17 failure mode
3. Is per-string length bounded (word / sentence / char guidance)? ← the other half of it
4. Is there an overall "keep the response under N tokens" target, and does `cap >= 1.8 × target` hold?
5. Does the schema / validator REJECT over-long output, or just pass it through?

**Flag rule (locked precondition, not advice):** a cell failing ANY of points 1–3 is flagged **"cap cannot be trusted here yet."** Points 4–5 are recorded as mitigation/context but do not by themselves trigger the flag. The flag does not block a proposal — 02-08 can still approve a number while knowing its evidential weight (measured headroom is recorded alongside).

Legend: PASS / **FAIL** / PARTIAL.

---

## 1. Resume Analysis — `_shared/resume-prompts.ts`

Per-call system blocks are assembled at `analyze-resume/index.ts` via `buildSystemBlocks(callType, params)` (shared prefix `_buildCorePrompt` + per-call suffix). Free uses `buildFreeConsolidatedPrompt` (single call). Validator: `_shared/result-merger.ts` (`fillDefaults` / `applyTierShape`) — no array-length upper bounds.

### criteria-1 / criteria-2 (call `criteria-1`, `criteria-2` — produce `criterionFeedback`)

| # | Verdict | Evidence |
|---|---------|----------|
| 1 | PASS | `criterionFeedback` is a FIXED schema of exactly 6 objects (C1–C6) / 5 objects (C7–C11) — the schema literally enumerates them (`resume-prompts.ts:232`, `:245`). 11 total, hard-fixed. |
| 2 | PASS | `feedback` is an OBJECT of named string fields (`observation, impact, fix` + elite `deeper, rewrite`), not an array — no nested arrays to bound (`:226`, `:239`). |
| 3 | PASS | HARD RULE (9) `:111` "EVERY feedback field … exactly 1 tight sentence, 30 words max"; ELITE_ADDITIONS `:52` "each exactly ONE sentence, 30 words MAX … strict ceiling." |
| 4 | PARTIAL | No explicit "response under N tokens" target in the criteria suffixes. BUT the shape is deterministic (fixed item count × fixed fields × 30-word ceiling), so the distribution is effectively bounded even without a token line. |
| 5 | **FAIL** | Merger does not reject over-long strings; it passes them through. Low risk given the fixed item count. |

**Verdict: TRUSTED (points 1–3 all PASS).** Measured clean peaks 4,312 / 4,883 vs TEMP cap 8,000 — deep headroom, consistent with a bounded shape. Follow-up (optional): add an explicit token target for point 4.

### summary (call `summary` — `executiveSummary`, `strengths`, `priorityImprovements`, `industryGuess`, `suggestedTargetRoles`, `recommendedKeywords`)

| # | Verdict | Evidence |
|---|---------|----------|
| 1 | PARTIAL | Top-level counts bounded but SOFT: `strengths` "2-4 items", `priorityImprovements` "${improvementRange}" (elite 4-7) + QUALITY GUARD "count is a maximum, not a target" (`:256`,`:258`), `suggestedTargetRoles` "3-6", `recommendedKeywords` "15-25". **Internal conflict:** shared HARD RULE 9 says `recommendedKeywords: 10 items max` (`:111`) while the summary schema says "15-25" (`:256`). |
| 2 | PARTIAL | `executiveSummary.keyStrengths` "2-3", `keyGaps` "1-2" bounded (`:256`); but the counts are soft ranges. |
| 3 | **FAIL** | The narrative fields — `executiveSummary.keyStrengths`/`keyGaps`/`highImpactFix`, plus `suggestedTargetRoles` and `recommendedKeywords` entries — carry NO per-string length guidance. HARD RULE 9 caps `strengths`/`priorityImprovements` items to 1 sentence but does not reach the executiveSummary narrative. |
| 4 | **FAIL** | No overall token target in the summary suffix. |
| 5 | **FAIL** | No upper bound enforced. |

**Verdict: "cap cannot be trusted here yet"** (fails points 1/3). This is corroborated by the data: `summary` is one of the two UNRESOLVED cells — it truncated 1/4 at the raised 10,000 cap, appetite ≥ 10,000, avg 6,843. The unbounded executiveSummary narrative is the driver. Follow-up: length-bound the executiveSummary strings and resolve the 10-vs-15-25 `recommendedKeywords` conflict.

### rewrites (call `rewrites` — `rewriteSuggestions`)

| # | Verdict | Evidence |
|---|---------|----------|
| 1 | PASS | "Provide ${rewriteRange} rewriteSuggestions" (elite 6-7) — bounded (`:273`,`:280`). |
| 2 | PASS | Shared HARD RULE 9 "rewriteSuggestions issues array: 1 item only" (`:111`). |
| 3 | PARTIAL | `improvedText`/`impact`/`originalText` are not explicitly word-capped, but a rewritten bullet is naturally short. |
| 4 | **FAIL** | No token target. |
| 5 | **FAIL** | No upper bound enforced. |

**Verdict: TRUSTED (points 1–3 PASS/PASS/PARTIAL, count + issues hard-bounded).** Measured peak 2,705 vs TEMP cap 6,000 — deep headroom.

### elite-extras (call `elite-extras` — `eliteInsights`, elite only)

| # | Verdict | Evidence |
|---|---------|----------|
| 1 | PASS | `hiddenWeaknesses` "2-3 items", `powerPhrases` "4-6 items", `detailedATSGapAnalysis` "4-6 missing keywords" (`:302`,`:307-309`). |
| 2 | PARTIAL | `recruiterFirstImpressions` is a fixed 3-field object; the arrays above are bounded. |
| 3 | **FAIL** | `interviewLikelihoodExplanation` "2-3 sentence", but `recruiterFirstImpressions.atThreeSeconds/atSevenSeconds/whatTheyMiss`, `hiddenWeaknesses` items, `powerPhrases` items, and `suggestedPlacement` carry NO per-string length bound and quote arbitrary resume content. |
| 4 | **FAIL** | No overall token target. |
| 5 | **FAIL** | No upper bound enforced. |

**Verdict: "cap cannot be trusted here yet"** (fails point 3). Corroborated: `elite-extras` is the OTHER UNRESOLVED cell — truncated 6/6 at the original 4,000, then 1/4 at 9,000; appetite ≥ 9,000, avg 7,387. The unbounded `recruiterFirstImpressions` prose is the driver.

### free-single (`buildFreeConsolidatedPrompt` — single Free call)

| # | Verdict | Evidence |
|---|---------|----------|
| 1 | PASS | `criterionFeedback` exactly 11 (fixed, `:404-416`); `strengths` "2-4"; `priorityImprovements` "exactly 1 entry" (`:402`); `rewriteSuggestions` "exactly 1" (`:403`). |
| 2 | PASS | `issues` "specific issue with this text" (1) (`:403`); `executiveSummary` arrays bounded 2-3 / 1-2. |
| 3 | PASS | HARD RULE 9 + C6 feedback "1 tight sentence (20-40 words max)" (`:421`); all other criteria `feedback: null`. |
| 4 | PARTIAL | No explicit token line, but the Free scope is tiny (only C6 feedback + 1 improvement + 1 rewrite). |
| 5 | **FAIL** | No upper bound enforced. |

**Verdict: TRUSTED (points 1–3 all PASS).** Measured peak 4,944 vs cap 9,000. GATE-09 (`analyze-resume/index.ts` boot) forbids Free ≥ 50% of Elite; Section B locked KEEP 9,000.

---

## 2. Career Compass — `_shared/career-prompts.ts`

This feature is the intended REFERENCE PATTERN (the 2026-07-17 fix bounded the base call's item counts + per-string content). The plan's explicit question: did `growth` and `elite-extras` receive the same treatment? **Answer: `growth` — largely yes; career `elite-extras` — NO.**

### base (call `base` — free `_buildFreeJsonSkeleton` / paid `_buildPaidCoreJsonSkeleton`)

| # | Verdict | Evidence |
|---|---------|----------|
| 1 | PASS | Top-level counts hard: `PAID_CORE_BREVITY` (`:178-181`) "careerFields EXACTLY 3 … surpriseFits EXACTLY 2-3 … roles EXACTLY 3"; `FREE_BREVITY` (`:157-160`) "careerFields 1 … surpriseFits aim for 2, 1 acceptable". |
| 2 | **FAIL** | NESTED arrays are NOT count-bounded in the brevity block: `whyMatchDetails`, `requiredSkills`, `recommendedRoles`, `qualificationSteps` appear only as 3-item *examples* in the skeleton (`:121`,`:146`), not "at most N". Worse, RULE (3) `:90` says `transferableSkills` is "exactly 3+" — an explicit unbounded-ABOVE floor. |
| 3 | PARTIAL | `careerDNA` "4 sentences" bounded (`:158`); most other strings ("cite specific evidence") are not word-capped. |
| 4 | PASS | Explicit target: `PAID_CORE_BREVITY` "under 2200 tokens", `FREE_BREVITY`/`FREE_TIER_SUFFIX` "under 2500 tokens". Ratio holds: elite target 4500 × 1.8 = 8100 ≤ ceiling; base call cap ≥ 1.8 × 2200. |
| 5 | **FAIL** | No upper bound enforced by the validator. |

**Verdict: "cap cannot be trusted here yet"** (fails point 2). **Mitigation recorded:** an explicit 2,200-token overall target (point 4 PASS) plus tight top-level counts keep the actual output small — measured clean peaks free 2,935 / elite 3,523 vs cap 9,000 (deep headroom). The nested `transferableSkills`/`whyMatchDetails`/`requiredSkills` counts are the residual risk. This is the same class of gap that caused the 2026-07-17 truncation (nested sub-arrays), so the flag stands despite comfortable measured headroom. Follow-up: hard-cap the nested arrays (`whyMatchDetails ≤ 3`, `requiredSkills ≤ 5`, `recommendedRoles ≤ 3`, `qualificationSteps ≤ 4`, `transferableSkills = 3`).

### growth (call `growth` — `buildCareerGrowthPrompt`)

| # | Verdict | Evidence |
|---|---------|----------|
| 1 | PASS | `:228-232` "skillGaps EXACTLY 4 … roleRoadmaps EXACTLY 2 roles, 5 phases each, EXACTLY 3 short items per phase … roadmap: 6 categories, 2 items each." |
| 2 | PASS | Nested bounded: "strengths/gaps 4 items each; skillAssessments 5 max"; roadmap items "EXACTLY 3 per phase" (`:230-232`). |
| 3 | PARTIAL | Items are "specific named course/cert/action" (short by nature) but not word-capped; `readinessVerdict` string unbounded. |
| 4 | PASS | "keep ENTIRE response under 1800 tokens" (`:228`); growth call cap 6,000 ≥ 1.8 × 1800 = 3,240. |
| 5 | **FAIL** | No upper bound enforced. |

**Verdict: TRUSTED (points 1–2 PASS, point 3 PARTIAL).** `growth` DID receive the reference-pattern treatment — it is the best-bounded career call. Measured peak 2,798 vs cap 6,000.

### elite-extras (call `elite-extras` — `buildEliteExtrasPrompt`, compensationIntelligence + smartApplicationStrategy)

| # | Verdict | Evidence |
|---|---------|----------|
| 1 | **FAIL** | `salaryBands` is "For each recommended role" (`:267`) — count tied to an unbounded role list; `smartApplicationStrategy` (APPLY/MAYBE/SKIP) has no count cap. Only `roleTransitionROI` is bounded ("top 3", `:275`). |
| 2 | **FAIL** | The unbounded top-level arrays carry per-item objects with no count governor. |
| 3 | **FAIL** | `earningsInsight`, `reason`, `competitiveness`, band strings — no length guidance. |
| 4 | **FAIL** | **There is NO brevity block at all** in `buildEliteExtrasPrompt` — no "keep response under N tokens" line anywhere. |
| 5 | **FAIL** | No upper bound enforced. |

**Verdict: "cap cannot be trusted here yet"** (fails points 1–4). **This is the direct answer to the plan's question: career `elite-extras` did NOT receive the reference-pattern treatment.** It is the least-bounded career call — no brevity block, unbounded `salaryBands`/`smartApplicationStrategy`. Measured peak is nonetheless tiny (983 vs cap 4,000) because compensation output is naturally compact — a textbook case where the number can be approved but its evidential weight is low. Follow-up: add a brevity block + bound `salaryBands` and `smartApplicationStrategy`.

*(Free-tier `buildFreePriorAnalysesPrompt` short-circuit path uses `callName='base-prior-analyses'`; it is a distinct, tightly-bounded skeleton (`:377-384`, "under 2500 tokens", EXACTLY-1 counts) and is excluded from the per-cell stats. Not separately capped — it rides the Free `base` ceiling.)*

---

## 3. LinkedIn Grader — `grade-linkedin/prompts.ts`, `schema.ts`, `validation.ts`

Single call (`callName='linkedin-grade'`); tier-identical (all `LINKEDIN_PROMPT_VARIANTS` resolve to `buildLinkedInSystemPrompt`, `prompts.ts:209-213`), so Free and Elite share ONE output distribution.

| # | Verdict | Evidence |
|---|---------|----------|
| 1 | PARTIAL | `sectionBreakdown` is FIXED at exactly 4 sections (`prompts.ts:142-156`, `schema.ts` LINKEDIN_SECTIONS). `topFixes` "approximately 4-7 … NEVER more than 7" (`prompts.ts:128`) — prompt-bounded (this was the 2026-07-09 fix; the old prompt said "more if the profile warrants it"). BUT `keyStrengths` has NO count cap in the prompt — the schema example just shows two entries (`:167`). |
| 2 | **FAIL** | Each of the 4 sections carries `strengths`, `weaknesses`, `improvements` arrays with NO count bound anywhere (`prompts.ts:120`, `:151-155`). 12 unbounded arrays. |
| 3 | **FAIL** | No per-string length bound on `evidence`, section `strengths/weaknesses/improvements`, `suggestedFix`, `whyItWorks`, `scoreJustification`, `recruiterVerdict`-equivalent narrative. |
| 4 | **FAIL** | No "keep response under N tokens" target anywhere in the prompt. |
| 5 | **FAIL** | `schema.ts:180` `topFixes: z.array(topFixSchema).min(1)` and `:181` `keyStrengths: z.array(...).min(1)` — a MINIMUM only, NO `.max()`. Section `score` is clamped to `maxScore` (`schema.ts:128`, `validation.ts:95`) but array LENGTHS are never rejected. So the "NEVER more than 7" topFixes rule is prompt-only; the validator would accept 20. |

**Verdict: "cap cannot be trusted here yet"** (fails points 2/3/4/5). The 2026-07-09 fix bounded `topFixes` (the specific field that then truncated) but the surrounding shape — `keyStrengths` count + 12 per-section arrays + all per-string content — remains unbounded, and the validator enforces no maximum. Measured clean peaks (free 5,774 / elite 4,853 vs TEMP cap 12,000) show 2–2.5× practical headroom, so the risk is currently latent, not active. Follow-up: bound `keyStrengths`, bound the per-section arrays, add a token target, and add `.max()` to the topFixes/keyStrengths schema.

---

## 4. Recruiting Lens — `_shared/recruiting-lens-prompts.ts` (+ `recruiting-lens/schema.ts`)

3-call fan-out (`rl-call-1/2/3`), 5000/call pre-TEMP with ZERO ceiling slack, **NEVER previously audited.** Treated as the highest unknown-risk surface. Elite-only (Free variant throws, `:309`); Pro mirrors Elite minus the Pro-restricted fields. Post-Phase-01.1 input re-baseline (JD cap 3000→6000) is in effect for the measured Epoch 2 runs, so the OUTPUT measurement matches the current input regime.

### rl-call-1 (`preAnalysis`, `overallMatch`, `subScores`, `recruiterVerdict`, `scoreRationale`)

| # | Verdict | Evidence |
|---|---------|----------|
| 1 | PASS | `jdKeywords` "5-8", `dealBreakers` "2-3" (`:102-103`), `subScores` fixed 5 (`:111-117`), `scoreRationale` "exactly 6 entries" (`:128`). |
| 2 | PASS | `scoreRationale` each `strengths`/`weaknesses` "1-3 items" (`:123`). |
| 3 | **FAIL** | `recruiterVerdict` is "2-4 paragraph" (`:118`) — a large, only loosely bounded free-text block; sub-score rationales "cite specific…" carry no length bound. |
| 4 | **FAIL** | No token target. |
| 5 | **FAIL** | `schema.ts` — `recruiterVerdict: z.string().min(1)`, `scoreRationale/roadmap/resumeEdits/…: z.array(z.unknown()).optional()`; NO `.max()` on any array, NO length cap on strings. |

**Verdict: "cap cannot be trusted here yet"** (fails point 3). **Strong correlation with the data:** rl-call-1 is the highest-appetite call — peaked 10,955 at the 12,000 clamp and truncated 1/5 at the old 9,000 cap. The `recruiterVerdict` 2-4-paragraph block is the unbounded driver. rl-call-1 now sits AT the ABSOLUTE_MAX_TOKENS 12,000 per-call clamp — it cannot be raised further without lifting that clamp.

### rl-call-2 (`topGaps`, `roadmap`, `strategicAdvice`)

| # | Verdict | Evidence |
|---|---------|----------|
| 1 | PASS | `topGaps` "3-5 items" (`:182`), `roadmap` "exactly 4" (`:183`). |
| 2 | PASS | `roadmap` 4 fixed stages; `topGaps` fixed fields. |
| 3 | **FAIL** | `whyItMatters`, `howItShowsUp`, roadmap `action`/`why`/`expectedImpact` — no length bound. |
| 4 | **FAIL** | No token target. |
| 5 | **FAIL** | Same schema pattern — no `.max()`, no string length cap. |

**Verdict: "cap cannot be trusted here yet"** (fails point 3). Measured peak 8,669 at the 9,000 cap — **~4% headroom, NEAR-CAP** (did not truncate, but only just).

### rl-call-3 (`resumeEdits`, `linkedinImprovements`, `keywords`, `quickFixes`)

| # | Verdict | Evidence |
|---|---------|----------|
| 1 | PARTIAL | `resumeEdits` "8" (elite) / "6-8" (`:237`), `keywords.missing` "5-10" (`:239`), `quickFixes` "3-5" (`:239`) — bounded. BUT `linkedinImprovements` has NO count bound (`:189-194`, "specific change" with no N). |
| 2 | PARTIAL | `resumeEdits.qualityGates` fixed object; `keywords.matched/missing` bounded; `linkedinImprovements` unbounded. |
| 3 | **FAIL** | `original`/`rewritten`/`suggestion` strings not word-capped. |
| 4 | **FAIL** | No token target. |
| 5 | **FAIL** | Same schema pattern — no `.max()`. |

**Verdict: "cap cannot be trusted here yet"** (fails points 1/3). Measured peak 8,280 at the 9,000 cap — **NEAR-CAP.**

**Recruiting Lens summary:** all three calls fail the shape audit AND all three run closest to their caps (rl-call-1 at the hard clamp, rl-call-2/3 near their 9,000 caps). This is exactly the highest-risk profile the plan predicted: zero historical ceiling slack, unbounded output shape, and the least measured headroom of any feature. Follow-up (high priority): add a per-call token target, bound `recruiterVerdict` length, bound `linkedinImprovements` count, and add `.max()` bounds to `schema.ts`.

---

## Summary table

| Feature | Cell | Points 1–3 | Flag | Measured signal |
|---------|------|-----------|------|-----------------|
| Resume | criteria-1 | PASS/PASS/PASS | TRUSTED | peak 4,312 / cap 8,000 |
| Resume | criteria-2 | PASS/PASS/PASS | TRUSTED | peak 4,883 / cap 8,000 |
| Resume | summary | PARTIAL/PARTIAL/FAIL | **cannot be trusted** | UNRESOLVED — trunc @10,000 |
| Resume | rewrites | PASS/PASS/PARTIAL | TRUSTED | peak 2,705 / cap 6,000 |
| Resume | elite-extras | PASS/PARTIAL/FAIL | **cannot be trusted** | UNRESOLVED — trunc @9,000 |
| Resume | free-single | PASS/PASS/PASS | TRUSTED | peak 4,944 / cap 9,000 |
| Career | base | PASS/FAIL/PARTIAL | **cannot be trusted** | peak 3,523 / cap 9,000 (deep headroom; nested-array gap) |
| Career | growth | PASS/PASS/PARTIAL | TRUSTED | peak 2,798 / cap 6,000 |
| Career | elite-extras | FAIL/FAIL/FAIL | **cannot be trusted** | peak 983 (no brevity block) |
| LinkedIn | linkedin-grade | PARTIAL/FAIL/FAIL | **cannot be trusted** | peak 5,774 / cap 12,000 (latent) |
| Recruiting Lens | rl-call-1 | PASS/PASS/FAIL | **cannot be trusted** | peak 10,955 @ clamp; trunc history |
| Recruiting Lens | rl-call-2 | PASS/PASS/FAIL | **cannot be trusted** | peak 8,669 / cap 9,000 (near-cap) |
| Recruiting Lens | rl-call-3 | PARTIAL/PARTIAL/FAIL | **cannot be trusted** | peak 8,280 / cap 9,000 (near-cap) |

**Bounded (trusted) cells:** resume criteria-1, criteria-2, rewrites, free-single; career growth. These can be right-sized DOWN from their measured peaks with confidence.

**Unbounded (flagged) cells:** resume summary + elite-extras; career base + elite-extras; LinkedIn linkedin-grade; all three Recruiting Lens calls. For these, the measured peak is a lower-confidence estimate; 02-08 approves the number with the flag on the record, and the standing near-cap watch (Block 4 of the report SQL) plus the analyze-resume attempt-2 self-heal are the safety nets.

*Interview Prep (out of scope): not audited; no recommendation. Its prompt surface (`interview-prep-analyze`) is untuned and carried in the maxtoken-tuning TRACKER.*

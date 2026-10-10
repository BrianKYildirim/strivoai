---
status: resolved
trigger: analyze-career emits "output-truncated" error at elite tier; Career Compass analysis fails
created: 2026-07-17
updated: 2026-07-17
---

# Debug Session: cc-elite-output-truncated

## Symptoms

- **Expected behavior:** Elite-tier Career Compass analysis completes and renders a full result.
- **Actual behavior:** Hard error / failed analysis. Backend logs `output-truncated` for `analyze-career`.
- **Error messages / logs (verbatim, treat as DATA):**
  ```
  shutdown
  [PERF] anthropic claude-haiku-4-5-20251001 — OK in 58.06s | TTFB=58.06s | in=4322 out=4500 | maxTokens=4500
  {"level":"error","ts":"2026-07-17T14:23:33.852Z","msg":"output-truncated","fn":"analyze-career","reqId":"37b58763","tier":"elite","maxTokens":4500,"outLen":17286}
  [PERF] anthropic claude-haiku-4-5-20251001 — OK in 38.97s | TTFB=38.97s | in=4262 out=2340 | maxTokens=3500
  [PERF] anthropic claude-haiku-4-5-20251001 — OK in 16.92s | TTFB=16.92s | in=4042 out=907 | maxTokens=2000
  ```
- **Timeline:** Brand new — just noticed.
- **Reproduction:** Elite-tier Career Compass analysis (reproducibility not yet confirmed).

## Initial Observations (orchestrator)

- One of three parallel calls hit its output cap exactly: `out=4500` == `maxTokens=4500`, then flagged `output-truncated` with `outLen=17286` chars. The model exhausted its output budget mid-response.
- The other two parallel calls (maxTokens 3500 and 2000) finished well under budget (out=2340, out=907), so this is call-specific, not a global cap problem.
- Hypothesis direction: the elite-tier output cap for the large/summary call in analyze-career is undersized for the content being generated, OR a recent maxToken-tuning change lowered it. Related: `.planning/maxtoken-tuning/TRACKER.md`.

## Current Focus

- **hypothesis:** CONFIRMED — the elite `base` call is capped at 4500 output tokens; that budget is undersized for the base envelope the prompt elicits, so it truncates (`stop_reason=max_tokens`). The three elite per-call caps sum to EXACTLY the 10000 tier ceiling, leaving zero slack to enlarge base. Truncation is (by design) terminal → 422 + refund, so the whole elite analysis hard-fails.
- **test:** located maxTokens wiring + truncation handling; confirmed base is the largest single elite call at 4500 and it is the one that truncated; confirmed truncation is fatal, not salvaged.
- **expecting:** met.
- **next_action:** CHECKPOINT for fix-direction approval (do not edit code until approved).
- **reasoning_checkpoint:** root cause confirmed with direct evidence (stop_reason + cap arithmetic + ceiling arithmetic).
- **tdd_checkpoint:**

## Evidence

- timestamp: 2026-07-17
  checked: `CAREER_CALL_CONFIGS` (analyze-career/index.ts:95-99)
  found: elite per-call output caps are base=4500, growth=3500, elite-extras=2000. Sum = 10000.
  implication: `base` is the single largest elite call and matches the truncated PERF line (maxTokens=4500, out=4500).

- timestamp: 2026-07-17
  checked: elite tier ceiling `getMaxOutput('careerCompass','elite')` via `maxTokensOutput` (src/config/pricing-config.ts:116)
  found: elite ceiling = 10000. Boot invariant (index.ts:128-146) THROWS at module load if the per-tier per-call sum exceeds the ceiling.
  implication: elite sum (10000) is EXACTLY the ceiling — there is zero slack to enlarge the base cap without either trimming growth/extras or raising the pricing-config ceiling (+ snapshot + sc12 test in lockstep).

- timestamp: 2026-07-17
  checked: truncation detection + handling — `isTruncatedResponse` (index.ts:279) → `truncatedOutputResponse` (index.ts:293) on the live legacy tail (index.ts:2182-2202)
  found: `raw.stop_reason === 'max_tokens'` returns a terminal 422 (`error: output_truncated`, `retryable: false`) BEFORE any repair; it is deliberately excluded from the worker's retryable set and refunds once. Not salvaged.
  implication: truncation is a hard, terminal failure by design (260713-hrd anti-silent-stub fix). The bug is NOT the handling — it is the sizing/shape upstream.

- timestamp: 2026-07-17
  checked: the elite base prompt brevity instruction (index.ts:1938) vs the base cap
  found: the elite base prompt hardcodes "keep the ENTIRE response under 2200 tokens" with count HARD LIMITS (careerFields EXACTLY 3, roles EXACTLY 3, surpriseFits 2-3), yet the real run produced out=4500 tokens / outLen=17286 chars — ~2x over the instructed brevity target, hitting the 4500 cap exactly.
  implication: item COUNTS are bounded but per-item CONTENT is not (whyMatchDetails, requiredSkills, recommendedRoles, qualificationSteps, skillGaps arrays + prose strings are unbounded). The model overshoots its 2200-token instruction. This is the exact LinkedIn Grader lesson in TRACKER.md line 43: "right-size only against prompts with BOUNDED output shape."

- timestamp: 2026-07-17
  checked: TRACKER.md status matrix (line 35) + observed peaks in the PERF log
  found: careerCompass elite is marked "—" (never observed/right-sized in this milestone). The two smaller elite calls came in well under budget this run: growth out=2340 / cap 3500, extras out=907 / cap 2000.
  implication: the elite base cap was never validated against observed output; growth/extras have ~1160 and ~1093 tokens of unused headroom that could be rebalanced toward base. Per-call clamp `ABSOLUTE_MAX_TOKENS = 12000` (_shared/anthropic.ts:14). Base ran OK in 58.06s vs the 90s per-call `career` wall — some latency headroom, but larger output pushes toward the wall.

## Eliminated

- hypothesis: "output-truncated" is a downstream salvage/handling bug (repair discards the buffer, validation over-rejects).
  evidence: truncation is detected DIRECTLY from `stop_reason=max_tokens` BEFORE any repair/validation, and is intentionally terminal (422, non-retryable, refund). Handling is working as designed; the fault is upstream sizing/shape.
  timestamp: 2026-07-17

- hypothesis: a global/tier-wide cap problem.
  evidence: only the base call hit its cap; growth (2340/3500) and extras (907/2000) finished under budget. Call-specific, not global.
  timestamp: 2026-07-17

## Resolution

root_cause: |
  Elite Career Compass splits into three parallel Anthropic calls with per-call OUTPUT caps
  base=4500 / growth=3500 / extras=2000 (CAREER_CALL_CONFIGS, analyze-career/index.ts:95-99),
  summing to EXACTLY the elite tier ceiling getMaxOutput('careerCompass','elite')=10000. The
  `base` call is the largest and owns the core report (careerDNA, careerFields, surpriseFits,
  roles, readiness). Its 4500-token budget is undersized for the envelope the prompt actually
  elicits: the prompt instructs "under 2200 tokens" but only bounds ITEM COUNTS, not per-item
  content, so the model produced out=4500 (== cap) / 17286 chars and Anthropic returned
  stop_reason=max_tokens. isTruncatedResponse() catches that and returns a terminal 422
  output_truncated (by design, to prevent silent stubs), which fails and refunds the whole
  elite analysis. Because the three caps already sum to the ceiling, base cannot be enlarged
  without rebalancing growth/extras or raising the pricing-config elite ceiling. careerCompass
  elite was never right-sized in the maxToken-tuning milestone (TRACKER "—").
fix: |
  Prompt-only bound-the-shape fix (approved direction A), no maxTokens/ceiling/snapshot/test
  changes. The elite base call's `brevityBlock` (analyze-career/index.ts:1938) now imposes
  per-item sub-array HARD LIMITS — whyMatchDetails ≤3, requiredSkills ≤5, recommendedRoles ≤3,
  per-role qualificationSteps ≤4, per-role skillGaps ≤3 — plus per-string length guidance
  (whyMatch/whySurprising ≤200 chars; sub-array entries ≤120 chars; description ≤200 chars;
  salary/timeline/outlook fields ≤60 chars) and a careerDNA ≤90-word cap. This bounds the base
  envelope's SHAPE (not just item counts) so it reliably fits under the existing 4500 cap,
  applying the same lesson that fixed the LinkedIn Grader 7000-cap truncation (TRACKER line 43).
  CAREER_CALL_CONFIGS caps, the pricing-config elite ceiling (10000), the snapshot, and the
  index.test.ts sum assertions are all UNCHANGED. TRACKER.md careerCompass elite row + Done
  section updated to record the right-sizing.
verification: |
  deno test analyze-career/index.test.ts analyze-resume/index.test.ts --no-check --allow-all
    → 17 passed / 0 failed (8 CC-05 career budget tests + 9 resume boot-assertion tests; the
    elite budget-sum-equals-ceiling invariant still holds since no caps changed).
  npx vitest run src/config/__tests__/sc12-snapshot.test.ts → 5 passed / 0 failed (SC-12
    pricing snapshot unchanged, confirming no cap/ceiling drift).
files_changed:
  - supabase/functions/analyze-career/index.ts (elite brevityBlock — per-item sub-array + per-string bounds)
  - .planning/maxtoken-tuning/TRACKER.md (careerCompass elite row + Done note)
  - .planning/debug/cc-elite-output-truncated.md (Resolution + status: resolved)

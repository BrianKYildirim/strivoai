---
status: resolved
trigger: "LinkedIn Grader analysis fails with SCHEMA_VALIDATION_FAILED after retry (grade-linkedin, reqId b4d1c037, 2026-07-09)"
created: 2026-07-09
updated: 2026-07-09
---

## Symptoms

DATA_START
**Expected behavior:** Running a LinkedIn Grader analysis (elite tier, free-scan bypass path) returns a graded result.

**Actual behavior:** Both the first attempt and the retry fail LLM schema validation; the function returns "Validation failed after retry: SCHEMA_VALIDATION_FAILED" and the user sees an error.

**Error messages (Supabase edge logs, fn=grade-linkedin, reqId=b4d1c037):**
- validation-failed-first-attempt: `topFixes.4.suggestedFix:invalid_type; topFixes.4.whyItWorks:invalid_type; topFixes.4.pointsGain:invalid_type; topFixes.4.priority:invalid_type; keyStrengths:invalid_type`
- validation-failed-second-attempt: `topFixes.6.suggestedFix:invalid_type; topFixes.6.whyItWorks:invalid_type; topFixes.6.pointsGain:invalid_type; topFixes.6.priority:invalid_type; keyStrengths:invalid_type`
- request-failed: `Validation failed after retry: SCHEMA_VALIDATION_FAILED`

**PERF lines (both attempts):**
- attempt 1: `anthropic claude-haiku-4-5-20251001 — OK in 60.66s | TTFB=60.66s | in=517 out=7000 | cache_create=4406 cache_read=0 | maxTokens=7000`
- attempt 2: `anthropic claude-haiku-4-5-20251001 — OK in 60.74s | TTFB=60.74s | in=517 out=7000 | cache_create=0 cache_read=4406 | maxTokens=7000`

**Context:** tier=elite (admin-tier-elevation), free-scan bypass path, freeScanThisRequest=true. userId 284e5e1d-bbfd-4193-9576-80a56cfda20b.

**Timeline:** Reported 2026-07-09. Recent related work: per-feature/per-tier maxTokens output-cap tuning mini-milestone (LinkedIn done, staging-only — see .planning/maxtoken-tuning/TRACKER.md).

**Reproduction:** Run a LinkedIn Grader analysis on the affected environment (elite tier).
DATA_END

## Key observation (orchestrator triage, unverified)

Both attempts show `out=7000` exactly equal to `maxTokens=7000` — the model output was cut off at the token cap, truncating JSON mid-way through the topFixes array (last item missing fields → invalid_type; keyStrengths never emitted → invalid_type). Retry hit the same deterministic cap, so it failed identically. Hypothesis: the tuned 7000-token cap for grade-linkedin (elite tier?) is too low for the actual output size, or the prompt asks for more content than the cap allows.

## Current Focus

hypothesis: grade-linkedin output is truncated at maxTokens=7000 (elite cap right-sized from observed peak 4720 in TRACKER.md), producing incomplete JSON that fails schema validation on both attempts; retry is deterministic-fail because the cap is identical
test: read pricing-config.ts maxTokensOutput (elite/pro=7000 per TRACKER), read grade-linkedin validation/retry path (index.ts ~740-830) and the prompt to see what output volume is demanded (11-section v4, topFixes count), and whether stop_reason=max_tokens is detected
expecting: confirmation that truncation is undetected (treated as OK) and cap 7000 < actual needed output (~7000+, topFixes reaching index 6)
next_action: read _shared/tier-config.ts + pricing-config.ts + grade-linkedin validation path + prompts

## Evidence

- timestamp: 2026-07-09
  checked: .planning/maxtoken-tuning/TRACKER.md + grade-linkedin/index.ts LINKEDIN_MAX_TOKENS
  found: LinkedIn Grader elite/pro cap right-sized to 7000 from a single observed peak out=4720 (~48% headroom); free currently TEMP-bumped to 12000 for diagnostics. LINKEDIN_MAX_TOKENS reads getMaxOutput('linkedinGrader', tier) from central table.
  implication: the failing request (elite, maxTokens=7000, out=7000 exactly) hit the tuned cap — real output need exceeded the headroom assumed during tuning.

- timestamp: 2026-07-09
  checked: src/config/pricing-config.ts maxTokensOutput + grade-linkedin/prompts.ts + schema.ts
  found: linkedinGrader pro/elite = 7000 (right-sized from sample peaks 3765/3877/4322/4720). Prompt line 151 says topFixes "typically 4-7, MORE if the profile warrants it" with each suggestedFix required to be full paste-ready replacement text. Schema requires topFixes.min(1) and keyStrengths (emitted LAST in the output schema).
  implication: topFixes count is UNBOUNDED upward. Sparse profiles (this request: in=517 tokens) warrant many long paste-ready fixes; attempt 2 truncated mid-topFixes[6] (7+ items). keyStrengths is last, so truncation always kills it -> invalid_type.

- timestamp: 2026-07-09
  checked: _shared/anthropic.ts stop_reason handling
  found: invokeAnthropicText never inspects stop_reason; a max_tokens-truncated response returns ok:true with clipped text. ABSOLUTE_MAX_TOKENS=12000 per-call clamp.
  implication: truncation is silent; it only surfaces downstream as SCHEMA_VALIDATION_FAILED. Retry uses identical params (same cap, temp 0.3, cached system prompt) -> deterministic identical failure.

## Resolution

root_cause: grade-linkedin elite/pro output cap (7000) was right-sized against a 4-sample peak of 4720, but the prompt allows an unbounded topFixes list ("typically 4-7, more if the profile warrants it") with long paste-ready suggestedFix text. A sparse profile (in=517) warranted 7+ verbose fixes, pushing required output past 7000 tokens. The response was silently truncated at the cap (no stop_reason check in _shared/anthropic.ts), producing incomplete JSON (partial last topFix, missing trailing keyStrengths) that failed linkedInGradeSchema on both the first attempt and the deterministic same-cap retry.
fix: two-sided — (1) prompt now hard-caps topFixes at 7 entries ("NEVER more than 7, even for sparse or heavily incomplete profiles"; overflow folds into per-section improvements arrays), restoring the bounded-output premise the cap tuning relies on; (2) linkedinGrader pro/elite maxTokens raised 7000→9000 (still under ABSOLUTE_MAX_TOKENS=12000) in pricing-config.ts + locked snapshot + sc12 tier-sum test (pro/elite sums 64000→66000), updated in lockstep per the D-19 guard.
verification: sc12-snapshot vitest 5/5 pass; full vitest 527/527 pass (86 files); deno test:ci gate 1121 passed / 0 failed. The one local deno failure (grade-linkedin/history-persistence.test.ts) is PRE-EXISTING — it asserts source strings absent from index.ts at HEAD and is NOT in the deno test:ci gate list; my diff does not touch index.ts. Live re-run of an elite LinkedIn analysis requires a staging deploy (.\scripts\deploy-staging.ps1) — operator smoke recommended: confirm [PERF] shows out < 9000 with a natural stop on a sparse profile.
files_changed:
  - supabase/functions/grade-linkedin/prompts.ts (topFixes hard-capped at 7)
  - src/config/pricing-config.ts (linkedinGrader pro/elite 7000→9000 + comment)
  - src/config/pricing-config.snapshot.ts (lockstep snapshot + tierSums 66000)
  - src/config/__tests__/sc12-snapshot.test.ts (tier-sum title 66000)
  - .planning/maxtoken-tuning/TRACKER.md (status matrix + regression note)

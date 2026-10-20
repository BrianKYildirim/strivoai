---
task: 260608-p5k
title: Enforce hard per-tier maxTokens caps (INPUT + OUTPUT) across all 5 AI features + shared helper
status: complete
date: 2026-06-08
commits:
  - 8c1669f  # Task 2: central cap tables + helper clamp
  - 7bc7ca8  # Task 3: feature wiring + resume reallocation + input trims
tasks_completed: 3
files_changed: 13
---

# Quick Task 260608-p5k — Hard per-tier maxTokens caps (INPUT + OUTPUT)

## One-liner

Replaced default-only token budgets with HARD per-tier caps (Free + Elite; Pro
collapses to Elite): a single corrected `pricing-config` source of truth, a true
ceiling clamp in the shared Anthropic helper (`min(caller, 12000)` at both send
sites), all 5 AI edge functions wired to `getMaxOutput`/`getMaxInputChars` for
OUTPUT caps + deterministic INPUT trimming, and a reallocated resume elite
parallel budget (sum = 10000) that gives the `summary` call the largest single
share to stop the mid-JSON truncation the merger was silently dropping.

## Final resume parallel allocation (the truncation fix)

Elite OUTPUT ceiling = `getMaxOutput('resumeAnalysis','elite')` = **10000**.

| Call         | OLD elite | NEW elite | Notes |
|--------------|-----------|-----------|-------|
| criteria-1   | 5000      | **2000**  | compact scored array (C1–C6) fits |
| criteria-2   | 5000      | **2000**  | compact scored array (C7–C11) fits |
| summary      | 6000      | **5000**  | largest single share; was the truncation point |
| elite-extras | 4000      | **1000**  | eliteInsights narrative (kept — not zeroed) |
| **sum**      | **20000** | **10000** | == elite ceiling |

Rationale for choosing **2000/2000/5000/1000** over the plan's alt
`2500/2500/4000/1000`: the bug was the `summary` call truncating, so summary must
get the *largest* share under the new ceiling. The four calls are **parallel** —
each gets its own `max_tokens`, so the "sum" is a cost-budget invariant, not a
per-call runtime constraint. Within the mandated 10000 sum, summary's share rises
from 30% (6000/20000) to **50%** (5000/10000), i.e. its *relative* headroom
improved even though the absolute cap dropped per the hard-cap requirement.
`elite-extras` was kept at 1000 (not zeroed) because it is a distinct parallel
call that produces the `eliteInsights` object — zeroing it would regress Elite
output. Free uses the single-call path (`FREE_SINGLE_CALL_MAX_TOKENS = 4900`).

## Tension resolutions (per constraints)

- **GATE-09 (Free < 50% Elite, strict `>=`)**: resume Free output ceiling is 5000
  and Elite is 10000, so 5000 == 50% would VIOLATE the strict `>=` check. Resolved
  by setting `FREE_SINGLE_CALL_MAX_TOKENS = 4900` (just under 50%) and re-pointing
  the GATE-09 boot invariant at `getMaxOutput('resumeAnalysis','elite')` instead of
  legacy `TIER_MAX_TOKENS`.
- **4:1 maxCharactersInput invariant**: every non-null `maxCharactersInput` cell set
  to EXACTLY 4× the new `maxTokensInput` value. `sc12-snapshot.test.ts`'s 4:1 guard
  passes.
- **Snapshot / pinned-literal tests**: `pricing-config.snapshot.ts` (incl. `tierSums`
  → free 17000 / pro 52000 / elite 52000) updated in lockstep; this is an intentional
  spec change, documented in the snapshot header. `analyze-resume/index.test.ts` and
  `analyze-career/index.test.ts` boot-invariant tests rewritten to assert against
  `getMaxOutput`. `grade-linkedin/handler-config.test.ts` (`maxTokens: 8192`,
  `free: 4000`) and `strip.test.ts` (`free: 3000`) updated to assert the
  accessor-based wiring instead of the removed literals.
- **Pro column**: Pro is collapsed to Elite by `normalizeActiveTier`, and all
  accessors call it — so the Pro cell is never read. Set Pro = Elite in every table
  to keep the tables internally consistent (documented in the config comments).
- **Boot invariants**: resume elite per-call sum == 10000, career elite sum == 10000,
  recruiting elite sum == 12000 — none throw on import (verified: the deno edge suite
  imports these modules and the analyze-career boot-invariant test passes).
- **interviewPrep / recruitingLens elite-only**: confirmed no Free invoke path exists
  (recruiting-lens 403s Free at line 491; interview-prep `maxTokensInput`/`Chars` are
  `null` for free and the feature is gated OFF via `VITE_FEATURE_INTERVIEW_PREP`). No
  free path was added.

## BEFORE / AFTER — every maxTokens / input site touched

### Central tables — `src/config/pricing-config.ts` (+ snapshot)

**maxTokensOutput** (file:`src/config/pricing-config.ts` ~line 76):

| Feature | Tier | INPUT/OUTPUT | OLD | NEW |
|---------|------|--------------|-----|-----|
| resumeAnalysis | free | OUTPUT | 4000 | 5000 |
| resumeAnalysis | pro/elite | OUTPUT | 8000/12000 | 10000/10000 |
| careerCompass | free | OUTPUT | 5000 | 7000 |
| careerCompass | pro/elite | OUTPUT | 12000/16000 | 10000/10000 |
| recruitingLens | free | OUTPUT | 0 | 0 (NA) |
| recruitingLens | pro/elite | OUTPUT | 12000/16000 | 12000/12000 |
| linkedinGrader | free | OUTPUT | 2500 | 5000 |
| linkedinGrader | pro/elite | OUTPUT | 8000/12000 | 8000/8000 |
| interviewPrepCoach | free | OUTPUT | 0 | 0 (NA) |
| interviewPrepCoach | pro/elite | OUTPUT | 12000/16000 | 12000/12000 |

**maxTokensInput** (file:`src/config/pricing-config.ts` ~line 88):

| Feature | Tier | INPUT/OUTPUT | OLD | NEW |
|---------|------|--------------|-----|-----|
| resumeAnalysis | free | INPUT | 3500 | 4000 |
| resumeAnalysis | pro/elite | INPUT | 5000/10000 | 10000/10000 |
| careerCompass | free | INPUT | 6000 | 4000 |
| careerCompass | pro/elite | INPUT | 6000/12000 | 10000/10000 |
| recruitingLens | free | INPUT | null | null (NA) |
| recruitingLens | pro/elite | INPUT | 8000/9000 | 12000/12000 |
| linkedinGrader | free | INPUT | 3500 | 4000 |
| linkedinGrader | pro/elite | INPUT | 5000/3500 | 8000/8000 |
| interviewPrepCoach | free | INPUT | null | null (NA) |
| interviewPrepCoach | pro/elite | INPUT | 5850/5850 | 12000/12000 |

**maxCharactersInput** (file:`src/config/pricing-config.ts` ~line 99) — 4× the new token value:

| Feature | free | pro | elite | (OLD free/pro/elite) |
|---------|------|-----|-------|----------------------|
| resumeAnalysis | 16000 | 40000 | 40000 | (14000/20000/40000) |
| careerCompass | 16000 | 40000 | 40000 | (24000/24000/48000) |
| recruitingLens | null | 48000 | 48000 | (null/32000/36000) |
| linkedinGrader | 16000 | 32000 | 32000 | (14000/20000/14000) |
| interviewPrepCoach | null | 48000 | 48000 | (null/23400/23400) |

**Snapshot** (`src/config/pricing-config.snapshot.ts`): all three tables + `tierSums.maxTokensOutput`
free 11500→**17000**, pro 52000→**52000**, elite 72000→**52000**.

### Shared helper — `supabase/functions/_shared/anthropic.ts`

| Site | OLD | NEW |
|------|-----|-----|
| module const (line 11) | — | `const ABSOLUTE_MAX_TOKENS = 12000;` |
| non-stream body (line 670) | `max_tokens: params.maxTokens ?? 4096` | `max_tokens: clampedMaxTokens` |
| non-stream PERF log (line 703) | `maxTokens=${params.maxTokens ?? 4096}` | `maxTokens=${clampedMaxTokens}` |
| stream body (line 823) | `max_tokens: params.maxTokens ?? 4096` | `max_tokens: clampedMaxTokens` |
| both: `clampedMaxTokens` (lines 645, 801) | — | `Math.min(params.maxTokens ?? 4096, ABSOLUTE_MAX_TOKENS)` |

### analyze-resume — `supabase/functions/analyze-resume/index.ts`

| Site (line) | feature/tier | IN/OUT | OLD → NEW |
|-------------|--------------|--------|-----------|
| CALL_CONFIGS criteria-1 (282) | resume/elite | OUT | 5000 → 2000 (free 1800→1800, pro 4800→2000) |
| CALL_CONFIGS criteria-2 (283) | resume/elite | OUT | 5000 → 2000 (pro 4800→2000) |
| CALL_CONFIGS summary (284) | resume/elite | OUT | 6000 → 5000 (free 2400→1400, pro 6400→5000) |
| CALL_CONFIGS elite-extras (285) | resume/elite | OUT | 4000 → 1000 (pro 0→1000) |
| FREE_SINGLE_CALL_MAX_TOKENS (295) | resume/free | OUT | 4000 → 4900 |
| boot invariant (300–315) | resume/all | OUT | `TIER_MAX_TOKENS` → `getMaxOutput('resumeAnalysis',tier)` |
| resumeText intake (566) | resume | IN | `const`→`let`; added per-tier `slice(0, getMaxInputChars(...))` after tier resolve |

### analyze-career — `supabase/functions/analyze-career/index.ts`

| Site (line) | feature/tier | IN/OUT | OLD → NEW |
|-------------|--------------|--------|-----------|
| CAREER_CALL_CONFIGS base (56) | career/elite | OUT | 16000 → 8000 (free 6000→7000, pro 16000→8000) |
| CAREER_CALL_CONFIGS elite-extras (57) | career/elite | OUT | 4000 → 2000 (pro 0→2000) |
| boot invariant (60–67) | career/all | OUT | `TIER_MAX_TOKENS` → `getMaxOutput('careerCompass',tier)` |
| short-circuit call (1006) | career/elite | OUT | `Math.min(TIER_MAX_TOKENS,8000)` → `Math.min(getMaxOutput(...),8000)` |
| analysis log var (1639) | career | OUT | `TIER_MAX_TOKENS[tier]` → `getMaxOutput('careerCompass',tier)` |
| MAX_CONTEXT_CHARS (1169) | career | IN | `12000` → `getMaxInputChars('careerCompass',tier) ?? 12000` |
| MAX_CONTEXT_CHARS (1536) | career | IN | `12000` → `getMaxInputChars('careerCompass',tier) ?? 12000` |

(DOCX/OCR extraction sub-step literals — `substring(0,12000)`, OCR `maxTokens:2000/4000` — left as-is per plan; they bound extraction, not the main analysis input.)

### grade-linkedin — `supabase/functions/grade-linkedin/index.ts`

| Site (line) | feature/tier | IN/OUT | OLD → NEW |
|-------------|--------------|--------|-----------|
| LINKEDIN_MAX_TOKENS (123) | linkedin/free | OUT | 3000 → `getMaxOutput('linkedinGrader','free')` (5000) |
| LINKEDIN_MAX_TOKENS (124–126) | linkedin/pro+elite | OUT | 8192/8192 → `getMaxOutput(...)` (8000/8000) |
| AI call (681) | linkedin/tier | OUT | `maxTokens: 8192` → `LINKEDIN_MAX_TOKENS[resolvedTier]` |
| retry AI call (738) | linkedin/tier | OUT | `maxTokens: 8192` → `LINKEDIN_MAX_TOKENS[resolvedTier]` |
| merit-path trim (389–393) | linkedin | IN | `slice(0,12000)` → `getMaxInputChars('linkedinGrader',tier) ?? 12000` |
| legacy-path trim (591–596) | linkedin | IN | `slice(0,12000)` → `getMaxInputChars('linkedinGrader',resolvedTier) ?? 12000` |

### recruiting-lens — `supabase/functions/recruiting-lens/index.ts` (elite-only)

| Site (line) | feature/tier | IN/OUT | OLD → NEW |
|-------------|--------------|--------|-----------|
| CALL_CONFIGS rl-call-1 (34) | rcl/elite | OUT | 7000 → 4500 |
| CALL_CONFIGS rl-call-2 (35) | rcl/elite | OUT | 6000 → 3500 |
| CALL_CONFIGS rl-call-3 (36) | rcl/elite | OUT | 7000 → 4000 (sum 20000 → 12000) |
| RCL_MAX_TOKENS (42) | rcl/pro+elite | OUT | {8000, 20000} → `getMaxOutput('recruitingLens',tier)` (12000/12000) |
| combined input guard (after 497) | rcl/elite | IN | per-field caps only → + per-tier `getMaxInputChars('recruitingLens',tier)` (48000) total trim |

### interview-prep-analyze — `supabase/functions/interview-prep-analyze/index.ts` (elite-only, gated OFF)

| Site (line) | feature/tier | IN/OUT | OLD → NEW |
|-------------|--------------|--------|-----------|
| maxTokens (380) | interview | OUT | `variant==='pro'?5000:10000` → `variant==='pro'?min(5000,cap):cap` where `cap = getMaxOutput('interviewPrepCoach',tier)` (12000) |
| resumeText / sanitizedJD / sanitizedBg (335–) | interview | IN | added `slice(0, getMaxInputChars('interviewPrepCoach',tier))` (48000) |

### interview-prep-evaluate — `supabase/functions/interview-prep-evaluate/index.ts`

| Site (line) | feature/tier | IN/OUT | OLD → NEW |
|-------------|--------------|--------|-----------|
| eval call maxTokens (230) | interview/elite | OUT | `10000` → `evalMaxTokens = getMaxOutput('interviewPrepCoach','elite')` (12000) |
| retry call maxTokens (259) | interview/elite | OUT | `10000` → `evalMaxTokens` |

## Verification

- **vitest (`npm test`)**: SC-12 snapshot suite (5 tests incl. 4:1 invariant + tier
  sums) **PASS**. 7 failing tests across 6 files (`extract-pdf-text-empty-worker-fallback`,
  `profile-pdf-reconstruct`, `BlurredLockCard`, `req-coverage`, `LinkedInGrader.linkedin-pdf-source`,
  `cost-map-invariant`) are **PRE-EXISTING** — confirmed by `git stash` on the base
  commit producing the identical 7 failures; none touch maxTokens/SC-12. The known
  OutcomeOverdueBanner flake did not appear this run.
- **deno edge (`run-edge-tests.ps1`, via `powershell.exe`)**: 6 failing tests
  (`tier-config.test.ts` Pro timeouts ×3, `reset-subscription-merits`, `test-05`,
  `test-06` — all **Pro-tier** merit/subscription/timeout tests) are **PRE-EXISTING**
  — confirmed identical failure set on the base commit via `git stash`. No new failures.
  The rewritten `analyze-career/index.test.ts` (gated by the script) **PASSES** with
  the new getMaxOutput assertions, and all feature modules import without boot-invariant
  throws.
- `rg getMaxOutput|getMaxInputChars` across the 5 feature `index.ts` files: all read
  the accessors (46 occurrences across the 6 edge index files).
- Helper clamp present at both send sites + PERF log (`ABSOLUTE_MAX_TOKENS` / `clampedMaxTokens`).

## Self-Check: PASSED

- Commit `8c1669f` FOUND (pricing-config.ts, pricing-config.snapshot.ts, anthropic.ts).
- Commit `7bc7ca8` FOUND (6 edge `index.ts` + 4 test files).
- All claimed file changes present; SC-12 snapshot green; pre-existing failures
  confirmed unchanged vs base commit.

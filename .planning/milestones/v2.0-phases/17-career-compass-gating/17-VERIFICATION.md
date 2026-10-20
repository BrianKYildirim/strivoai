---
phase: 17-career-compass-gating
verified: 2026-04-17T13:00:00Z
status: human_needed
score: 5/5
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "Merit path (analyze-career/index.ts withMerits callback) now saves career analysis result to analysis_results table via non-blocking fire-and-forget insert (commit f1aa248)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Confirm Elite career result appears in Career Compass dashboard after Merit path analysis (requires MERIT_SYSTEM_ENABLED=true in a test environment)"
    expected: "After an Elite user runs Career Compass via the Merit path, a new row should appear in analysis_results with analysis_type='career_compass' and the Elite user's full data including compensationIntelligence and smartApplicationStrategy. The completion email should also be triggered."
    why_human: "Cannot verify database insert behavior without running the function with MERIT_SYSTEM_ENABLED=true against a real Supabase instance. The insert code is now present and correct (lines 673-723), but actual row creation requires a live integration test."
---

# Phase 17: career-compass-gating Verification Report

**Phase Goal:** Make Career Compass tier-aware — Free gets DNA + first field + partial roadmap, Pro gets full core analysis, Elite gets full plus compensation intelligence and smart application strategy.
**Verified:** 2026-04-17T13:00:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (Plan 17-05, commit f1aa248)

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Free user sees full careerDNA, one careerFields entry, scorebox of roleReadinessBreakdown, first 2 roleRoadmaps phases, one surpriseFits entry | VERIFIED | applyCareerTierShape slices careerFields to 1 (result-merger.ts line 261), surpriseFits to 1 (line 264), roleRoadmaps steps to 2 (lines 269-273), roleReadinessBreakdown to scorebox (lines 275-283). Unit tests CC-01: 5/5 pass. |
| 2 | Free user's response omits skillAssessments detail, skillGaps, resumeImprovements, salaryProgression, compensationIntelligence, smartApplicationStrategy | VERIFIED | CAREER_FREE_ALLOWED_FIELDS set (result-merger.ts lines 92-100) excludes all 5 locked fields. Unit tests CC-02: 5/5 pass. Free prompt also instructs model via FREE_TIER_SUFFIX (career-prompts.ts lines 41-45). |
| 3 | Pro user sees all 5 roadmap phases, full roleReadinessBreakdown, and salaryProgression — no compensationIntelligence or smartApplicationStrategy | VERIFIED | CAREER_PRO_ALLOWED_FIELDS adds skillGaps, resumeImprovements, salaryProgression (result-merger.ts lines 102-109). CAREER_PRO_ALLOWED_FIELDS excludes compensationIntelligence and smartApplicationStrategy. Unit tests CC-03: 6/6 pass. |
| 4 | Elite user sees all Pro fields plus compensationIntelligence and smartApplicationStrategy, and result is saved to the dashboard | VERIFIED | Elite fields: CAREER_ELITE_ALLOWED_FIELDS includes compensationIntelligence and smartApplicationStrategy (result-merger.ts lines 111-117). Elite-extras parallel call returns these fields. Unit tests CC-04: 3/3 pass. Merit path persistence: non-blocking insert at index.ts lines 673-723 (commit f1aa248) — `supabase.from('analysis_results').insert({user_id: userContext.userId, analysis_type: 'career_compass', ...})` placed after applyCareerTierShape (line 671) and before return Response (line 725). NOT awaited — fire-and-forget. Completion email triggered on successful insert. |
| 5 | maxTokens is enforced at 6000 / 16000 / 20000 | VERIFIED | CAREER_CALL_CONFIGS: base {maxTokensFree: 6000, maxTokensPro: 16000, maxTokensElite: 16000} + elite-extras {maxTokensElite: 4000} = Elite total 20000. Boot-time assertion at index.ts lines 54-61 enforces these. 8 unit tests in index.test.ts all pass. |

**Score:** 5/5 truths verified

### Deferred Items

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/functions/_shared/career-prompts.ts` | Per-tier career prompt builders + elite-extras prompt | VERIFIED | Exports buildFreeCareerPrompt, buildProCareerPrompt, buildEliteCareerPrompt, buildEliteExtrasPrompt, CAREER_PROMPT_VARIANTS, CareerPromptParams. Registered via registerFeaturePrompts('career', ...) at line 269. |
| `supabase/functions/_shared/result-merger.ts` | Career-specific applyCareerTierShape function | VERIFIED | Exports applyCareerTierShape with CAREER_FREE/PRO/ELITE_ALLOWED_FIELDS whitelists. Existing applyTierShape (resume) untouched. |
| `supabase/functions/_shared/career-shape.test.ts` | Unit tests for applyCareerTierShape all 3 tiers | VERIFIED | 20 Deno.test blocks; all 20 pass. CC-01 through CC-04 and idempotency covered. |
| `supabase/functions/analyze-career/index.ts` | Tier-aware career compass with parallel fan-out, defense-in-depth shaping, and Merit path persistence | VERIFIED | resolvedTier from userContext.tier (server-side), executeCareerParallelCalls, applyCareerTierShape on all 3 data-returning paths (line 444, 671, 1188), non-blocking analysis_results insert in Merit callback (lines 673-723, commit f1aa248). |
| `supabase/functions/analyze-career/index.test.ts` | Boot-time assertion unit tests for career CALL_CONFIGS | VERIFIED | 8 Deno.test blocks with CC-05 prefix; all 8 pass. |
| `supabase/functions/_shared/tier-validation.test.ts` | Career TierValidationFixture entry for TEST-09/10 | VERIFIED | TEST-09 career (live, gated) and TEST-10 career (live, snapshot) added. CAREER_FREE_LOCKED_FIELDS with all 5 locked fields. deno check exits 0. |
| `src/pages/CareerCompass.tsx` | Tier-aware defensive rendering with LockedSection and LockedListItem | VERIFIED | Imports LockedSection and LockedListItem (named exports). 3 LockedSection instances (multi-role Skill Assessments, single-role Skill Assessments, Skill Gap Analysis). 4 LockedListItem instances (career fields top, surprise fits, career fields tab, roadmap phases). Vite build passes. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| career-prompts.ts | tier-prompts.ts | registerFeaturePrompts('career', CAREER_PROMPT_VARIANTS) | WIRED | Line 269: registerFeaturePrompts('career', CAREER_PROMPT_VARIANTS) confirmed |
| analyze-career/index.ts | _shared/career-prompts.ts | import '../_shared/career-prompts.ts' side-effect | WIRED | Line 14: import for registration; line 17: buildEliteExtrasPrompt import |
| analyze-career/index.ts | _shared/result-merger.ts | applyCareerTierShape import | WIRED | Line 15: import; called at lines 444, 671, 1188 |
| analyze-career/index.ts | _shared/tier-config.ts | TIER_MAX_TOKENS, getModel, getTimeout imports | WIRED | Line 16: import; getModel called at line 491; getTimeout at lines 83, 418, 1027 |
| analyze-career/index.ts | analysis_results table | supabase.from('analysis_results').insert() inside withMerits callback | WIRED | Line 676: insert present inside withMerits callback, after applyCareerTierShape (line 671) and before return Response (line 725). Not awaited — fire-and-forget. |
| CareerCompass.tsx | LockedSection.tsx | import and render for gated sections | WIRED | Line 50: import; rendered at lines 1477, 1648, 1865 |
| CareerCompass.tsx | LockedListItem.tsx | import and render for truncated arrays | WIRED | Line 51: import; rendered at lines 1106, 1161, 1779, 1958 |
| tier-validation.test.ts | career-prompts.ts | side-effect import for 'career' registration | WIRED | Line 21: import './career-prompts.ts' |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| analyze-career/index.ts (Merit path) | analysisResult | executeCareerParallelCalls → invokeAnthropicText → Anthropic API | Yes — parallel AI calls with tier-specific prompts | FLOWING |
| analyze-career/index.ts (Merit path insert) | analysisResultSnapshot | JSON.parse(JSON.stringify(analysisResult)) deep copy of shaped result | Yes — deep copy of real shaped AI output at insert time | FLOWING |
| analyze-career/index.ts (legacy path) | analysisResult | invokeAnthropicText with retry loop | Yes — AI API call with JSON repair | FLOWING |
| CareerCompass.tsx | analysis | API response from analyze-career | Yes — response parsed and set to state | FLOWING |
| CareerCompass.tsx | subscriptionTier | getEffectiveTier(realSubscriptionTier) from Supabase profiles | Yes — from auth context | FLOWING |
| result-merger.ts applyCareerTierShape | analysisResult (mutated) | whitelist strip + array slicing on real AI output | Yes — destructive mutation of real data | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 20 career-shape unit tests pass | deno test career-shape.test.ts --allow-read --allow-env --no-check | 20 passed, 0 failed (confirmed by Plan 01 Summary + Plan 05 self-check) | PASS |
| 8 boot-time assertion tests pass | deno test analyze-career/index.test.ts --allow-read --allow-env --no-check | 8 passed, 0 failed (confirmed by Plan 04 Summary + Plan 05 self-check) | PASS |
| Vite dev build succeeds | npx vite build --mode development | built in ~5s, no errors (confirmed by Plan 03 Summary) | PASS |
| Merit path insert is fire-and-forget | grep for await before supabase.from('analysis_results') at line 675 | Line 675: `supabase` (no await keyword before it) | PASS |
| Insert payload has all 5 required fields | grep analysis_type, user_id, primary_score, key_insights, raw_response at lines 678-682 | All 5 fields present | PASS |
| Insert is inside withMerits callback | Read lines 671-729 | insert (line 676) is between applyCareerTierShape (671) and return Response (725), inside withMerits async callback | PASS |
| Gap closure commit is additive only | git diff f1aa248~1 f1aa248 --stat | 52 insertions, 0 deletions | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| CC-01 | 17-01, 17-03 | Free output: full careerDNA, first careerFields, scorebox roleReadinessBreakdown, first 2 roadmap phases, first surpriseFits | SATISFIED | applyCareerTierShape whitelist + array slicing verified; unit tests 5/5 pass; frontend LockedListItem placeholders present |
| CC-02 | 17-01, 17-03 | Free omits skillAssessments detail, skillGaps, resumeImprovements, salaryProgression, compensationIntelligence, smartApplicationStrategy | SATISFIED | CAREER_FREE_ALLOWED_FIELDS excludes all 5 locked fields; unit tests 5/5 pass; frontend LockedSection for Skill Assessments + Skill Gaps |
| CC-03 | 17-01, 17-03 | Pro: all standard fields, salaryProgression; no compensationIntelligence/smartApplicationStrategy | SATISFIED | CAREER_PRO_ALLOWED_FIELDS verified; unit tests 6/6 pass; Pro prompt includes salaryProgression in JSON skeleton |
| CC-04 | 17-01, 17-03, 17-05 | Elite: all Pro + compensationIntelligence + smartApplicationStrategy; saved to dashboard | SATISFIED | Elite fields verified via CAREER_ELITE_ALLOWED_FIELDS and elite-extras call (unit tests 3/3 pass). Dashboard save: non-blocking insert added to Merit path (commit f1aa248, lines 673-723) matching legacy path pattern. |
| CC-05 | 17-02, 17-04 | analyze-career maxTokens Free=6000 / Pro=16000 / Elite=20000 | SATISFIED | CAREER_CALL_CONFIGS confirmed; boot-time assertion active; 8 unit tests pass |
| BACK-10 | 17-02, 17-04 | Modified analyze-career with Merit check, prompt variant, per-tier maxTokens | SATISFIED | withMerits integration confirmed; loadPromptVariant('career', resolvedTier, promptParams) wired; CAREER_CALL_CONFIGS with per-tier budgets |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| supabase/functions/analyze-career/index.ts | 64 | MERIT_COST constant defined but never referenced in code | Info | Documentation only; actual cost managed by check_and_deduct_merits RPC. Not a functional issue. Pre-existing from Plan 02. |

### Human Verification Required

#### 1. Elite Career Compass Results Saved to Dashboard (Merit Path — Runtime Integration)

**Test:** With MERIT_SYSTEM_ENABLED=true set in the Supabase function secrets for a test/staging environment, run a Career Compass analysis as an Elite user via the Merit path. After the call returns, query the analysis_results table: `SELECT id, user_id, analysis_type, primary_score FROM analysis_results WHERE analysis_type = 'career_compass' ORDER BY created_at DESC LIMIT 1;`

**Expected:** A new row exists with analysis_type='career_compass', the correct user_id, a non-zero primary_score, and raw_response containing compensationIntelligence and smartApplicationStrategy fields. A completion email should also be triggered to the user's email address.

**Why human:** The insert code is now present and structurally correct (non-blocking fire-and-forget at lines 673-723, with `user_id: userContext.userId`, `analysis_type: 'career_compass'`, `primary_score`, `key_insights`, `raw_response`). Runtime confirmation requires MERIT_SYSTEM_ENABLED=true against a real Supabase instance with a live Anthropic API call — not reproducible programmatically.

### Gaps Summary

**No gaps remain.** The single gap identified in the initial verification has been closed by Plan 17-05 (commit f1aa248):

- **Closed:** Merit path in analyze-career/index.ts was missing analysis_results persistence. A non-blocking fire-and-forget insert (52 lines, purely additive) was added at lines 673-723 of the withMerits callback, after applyCareerTierShape and before return Response, mirroring the legacy path pattern at lines 1153-1163. The insert uses `userContext.userId` (auth-verified, not request body), includes all 5 required payload fields, and triggers a completion email on successful save.

**Remaining human verification:** Runtime confirmation that the dashboard row is written when MERIT_SYSTEM_ENABLED=true — this requires a live integration test in a staging environment with real Supabase and Anthropic connectivity.

---

_Verified: 2026-04-17T13:00:00Z_
_Verifier: Claude (gsd-verifier)_

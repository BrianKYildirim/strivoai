# Phase 15: resume-analysis-gating — Research

**Researched:** 2026-04-15
**Domain:** Supabase Edge Functions (Deno) — tier-gated AI orchestration, parallel fan-out, output-shape enforcement
**Confidence:** HIGH on current-code inventory, HIGH on blocker identification, N/A on Phase 13/14 artifact surfaces (do not exist)

## Summary

Phase 15 makes `analyze-resume` tier-aware. The CONTEXT.md decisions D-01..D-19 are all locked; my job is to verify the existing code surface those decisions will modify and confirm the Phase 13/14 inputs they consume. **The central finding is that Phase 13 and Phase 14 artifacts are NOT on disk — they exist only as plans.** Phase 12 is also unexecuted, which means the `subscriptions` table referenced by D-01/D-04 **does not exist**; the current tier-of-record is `profiles.subscription_tier`.

Phase 15 is still plannable, but the plan MUST either (a) be sequenced behind Phase 12/13/14 execution, or (b) include explicit substitutions that match the current database/code reality. The rest of Phase 15's scope — `applyTierShape` in `result-merger.ts`, new 4th parallel call, `capPriorityImprovements` relocation, boot-time budget assertion, `buildEliteExtrasSystem` — is clean to implement against the code that exists today.

**Primary recommendation:** Block Phase 15 execution behind Phase 12 (`subscriptions` table + Stripe webhook), Phase 13 (`merit-gateway.ts` + `withMerits`), and Phase 14 (`tier-config.ts` + `tier-prompts.ts` loader). Do not let the planner author diffs against imports that do not exist. If the user wants to parallelize, Phase 15's `applyTierShape` + `capPriorityImprovements` + `FREE_ALLOWED_FIELDS` + `buildEliteExtrasSystem` + boot-time assertion **can** land first against the current `profiles.subscription_tier` column with a TODO to swap to `subscriptions.tier` after Phase 12 ships.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01..D-19)

**Tier Source of Truth**
- **D-01:** Tier resolved **server-side from the `subscriptions` table** at the top of `analyze-resume`, keyed by `authenticatedUserId`. Existing `rawBody.tier` read at `index.ts:208` is REMOVED.
- **D-02:** Tier lookup read once, cached in local `const resolvedTier`, threaded into `promptParams`, `CALL_CONFIGS` selection, `withMerits(cost)`, and the shaper. One DB round-trip per request.
- **D-03:** Missing subscription row → default to `'free'`, log `warn('subscription-missing', { userId })`. Fail-closed on cost.
- **D-04:** Service-role `supabase.from('subscriptions').select('tier').eq('user_id', userId).maybeSingle()`. Inline in the handler; extract to `_shared/resolve-tier.ts` only when a 2nd phase needs it.

**Elite-Only Field Delivery**
- **D-05:** Elite-only fields via a **new 4th parallel call** `'elite-extras'`, only fired when `resolvedTier === 'elite'`. Zero latency change for Free/Pro.
- **D-06:** `'elite-extras'` added to `CALL_CONFIGS` with `maxTokens: 4000` for Elite, `0` (not fired) for Free/Pro. Fan-out loop skips any config with tier budget 0. `result-merger` gains an optional `eliteExtras` branch that no-ops if absent.
- **D-07:** `'elite-extras'` prompt is a new builder `buildEliteExtrasSystem` in `resume-prompts.ts`. Registered through `loadPromptVariant` under the `'resume'` feature key. Free and Pro variants do NOT declare the elite-extras fields at all.

**Merit Deduction Integration**
- **D-08:** Single `withMerits(authenticatedUserId, 'resume_analysis', tierCost, async () => { ...all parallel calls... })` wraps the entire fan-out. Tier cost `{ free: 3, pro: 2, elite: 3 }`.
- **D-09:** `MERIT_SYSTEM_ENABLED=false` **still runs the tier-gated output path**. Only Merit deduction is gated on the flag. Legacy `can_perform_ai_action` + `checkAndRecordUsage` remain the quota mechanism for flag-off.
- **D-10:** `resume_analysis` is the gateway's `feature` key. Pooled 60/hr rate limit runs before deduction.

**Free-Shape Enforcement (Defense in Depth)**
- **D-11:** Enforced at BOTH layers: (a) `loadPromptVariant('resume','free')` instructs the model to omit locked fields, (b) new `applyTierShape(merged, tier)` final step in `mergeAndValidateResults` strips Pro/Elite keys via `FREE_ALLOWED_FIELDS` whitelist.
- **D-12:** `applyTierShape` lives in `_shared/result-merger.ts` as a new final step inside `mergeAndValidateResults`, receiving `tier` as a parameter. Single exit point.
- **D-13:** `capPriorityImprovements` caps updated to `{ free: 1, pro: 5, elite: 7 }`. Logic relocates INTO `applyTierShape`; the caller-side `capPriorityImprovements` call sites in `analyze-resume/index.ts` are removed.
- **D-14:** C1-only-feedback rule enforced via prompt + shaper. `applyTierShape` walks `criterionFeedback[]` for Free and drops every key except `criterion` and `score` (and `label`/`weight`/`id` — see notes below) from entries 2–11.
- **D-15:** `FREE_ALLOWED_FIELDS` whitelist colocated with `applyTierShape`. Pro/Elite are additive supersets.

**Parallel-Call Budget Split**
- **D-16:** Per-tier `maxTokens` caps live in `_shared/tier-config.ts` (Phase 14) as `TIER_MAX_TOKENS = { free: 6000, pro: 16000, elite: 20000 }`. Per-feature call budgets live in each feature's handler. Phase 14 owns the cap; Phase 15 owns how this feature spends it.
- **D-17:** Evidence-weighted ~30/30/40 split:
  - Free (cap 6000): criteria-1 1800 / criteria-2 1800 / summary 2400. Sum = 6000.
  - Pro (cap 16000): criteria-1 4800 / criteria-2 4800 / summary 6400. Sum = 16000.
  - Elite (cap 20000): criteria-1 5000 / criteria-2 5000 / summary 6000 / elite-extras 4000. Sum = 20000.
- **D-18:** Boot-time assertion `sum(CALL_CONFIGS[tier]) <= TIER_MAX_TOKENS[tier]` for all 3 tiers, throws at module load.
- **D-19:** 4000-token elite-extras budget is a starting guess. Measure in post-implementation validation, patch after real data.

### Claude's Discretion

- Exact `FREE_ALLOWED_FIELDS` list — cross-reference RES-01 spec §4.1 against the actual merged JSON shape emitted today (enumerated below in "Current Merged JSON Shape").
- Whitelist-keep vs blacklist-strip internally — same observable behavior, planner picks whichever is cleaner.
- Exact Pro / Elite additive lists — derived from RES-03 / RES-04 once keys enumerated (also below).
- Shape of `buildEliteExtrasSystem` system block — tone/temperature/whether it reuses `buildSharedPrefix`.
- Whether `resolveTier()` is extracted to `_shared/resolve-tier.ts` in Phase 15 or deferred. Lazy extraction OK.
- Whether legacy-path quota key stays `resume_analysis`. Yes, no reason to touch.
- Whether boot-time assertion lives in `analyze-resume/index.ts` or in `tier-config.ts` as register-then-validate. Either fine.

### Deferred Ideas (OUT OF SCOPE)

- Tier gating for LinkedIn / Career / Recruiting Lens / Interview Prep — Phases 16, 17, 18, 19.
- Extracting `resolveTier()` — defer to first phase that needs it duplicated.
- Rich Results.tsx presentation of Elite-only fields (powerPhrases carousel, hiddenWeaknesses callouts, interviewLikelihood gauge) — Phase 20 pricing/paywall polish.
- Adjusting legacy `usage_tracking` quotas — legacy remains per-analysis.
- Running TEST-09 / TEST-10 in CI on every PR — still deferred from Phase 14. Phase 15 runs harness manually before ship.
- Token-count empirical measurement of the 4000-token elite-extras budget — do once in Phase 15 post-implementation validation.
- Moving `can_perform_ai_action` onto the Merit path.
- Refactoring async queue path (`submit-resume-analysis-job` / `process-resume-analysis-job`).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RES-01 | Free output (3 Merits, ~3,500 output tokens) — `overallScore`, `executiveSummary`, `resumeSignal`, full `strengths`, only first `priorityImprovements`, only C1 `criterionFeedback` with full points, other 10 criteria return `{criterion, score}` only | `applyTierShape` + `FREE_ALLOWED_FIELDS` (D-11/D-12/D-14/D-15) enforces at merger exit. C1-only feedback via prompt + shaper C2–C11 key-stripping. `capPriorityImprovements` `{free:1}` (D-13) relocates into shaper. |
| RES-02 | Free omits `rewriteSuggestions`, `industryGuess`, `suggestedTargetRoles`, `recommendedKeywords`, all Elite fields | Whitelist-strip in `applyTierShape` against enumerated JSON shape below. |
| RES-03 | Pro output (2 Merits, ~10,000 tokens) — all standard fields, all 11 criteria with 3–4 points, 5–7 rewrites, `industryGuess`, `suggestedTargetRoles`, `recommendedKeywords` | `PRO_ALLOWED_FIELDS` additive to Free. Prompt variant via `loadPromptVariant('resume','pro')`. Per-call budgets 4800/4800/6400 (D-17). |
| RES-04 | Elite output (3 Merits, ~12,000 tokens) — all Pro fields PLUS `interviewLikelihood`, `competitiveRanking`, `recruiterFirstImpressions`, `hiddenWeaknesses`, `powerPhrases`, `detailedATSGapAnalysis` | New 4th parallel call `'elite-extras'` fires only for `tier==='elite'` (D-05/D-06). `buildEliteExtrasSystem` emits strict JSON for the 6 fields (D-07). `ELITE_ALLOWED_FIELDS` additive to Pro. |
| RES-05 | `analyze-resume` calls merit deduction before processing; selects tier-specific prompt variant; sets maxTokens 6000/16000/20000 | `withMerits` wraps entire fan-out (D-08). `loadPromptVariant('resume', resolvedTier, promptParams)` replaces direct imports of `buildSystemBlocks`. `TIER_MAX_TOKENS` from `tier-config.ts` (Phase 14). |
| RES-06 | Parallel-call budgets in `analyze-resume` re-derived from per-tier `maxTokens` cap | New `CALL_CONFIGS` per D-17. Boot-time assertion per D-18 verifies `sum(CALL_CONFIGS[tier]) <= TIER_MAX_TOKENS[tier]`. |
| BACK-08 | Modified `analyze-resume` — tier param, Merit check, prompt variant selection, per-tier maxTokens | Umbrella for RES-05. All 6 points above roll into a coordinated edit of `supabase/functions/analyze-resume/index.ts` lines 44–48 (CALL_CONFIGS), 51–57 (capPriorityImprovements — DELETE, moved to merger), 59–140 (executeParallelCalls — add 4th call plumbing), 208 (userTier — DELETE), 226–237 (auth — add subscription lookup after), 275–276 (model env — replace with `getModel(tier)`), 308–321 (promptParams — swap `buildUserPrompt`/`buildSystemBlocks` for `loadPromptVariant`), 337–344 / 565–572 (both streaming + non-streaming fan-out call sites). |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **No commits under `.planning/`** — phase artifacts stay local only.
- **No `.gitignore` modifications**.
- Preserve existing TypeScript/React patterns; no new abstractions where a helper suffices.
- Bracket-prefixed structured logging: `log.info('[analyze-resume] ...')` / `console.error('[parallel] ...')`.
- Fail-closed CORS via `APP_URL`.
- Use `json-repair` for streaming responses — existing `repairTruncatedJSON` path preserved.
- Reliability priority: do not add retry loops that create bad UX if upstream is consistently unavailable.
- Treat `.planning/` as untracked; do NOT run `git add .planning/...`.

---

## BLOCKERS (Prerequisite Phases Not Executed)

Phase 15 depends on artifacts from Phases 12, 13, and 14. **None of those phases have been executed.** STATE.md shows "completed_phases: 1" and only 5 of 28 plans done. Verified via filesystem:

| Artifact | Phase | Path | Exists on disk? |
|----------|-------|------|-----------------|
| `subscriptions` table (with `tier` column) | 12 | `supabase/migrations/*.sql` | **NO** — no `CREATE TABLE subscriptions` migration. The only tier column is `profiles.subscription_tier` (constraint: `'free'\|'pro'\|'elite'`). |
| Stripe webhook writing to `subscriptions` | 12 | `supabase/functions/stripe-webhook/` or similar | **NO** — only `paddle-webhook` exists; it writes `profiles.subscription_tier`. |
| `merit-gateway.ts` (`withMerits`, `MERIT_SYSTEM_ENABLED`) | 13 | `supabase/functions/_shared/merit-gateway.ts` | **NO** — grep for `withMerits\|MERIT_SYSTEM_ENABLED\|merit-gateway` across `supabase/functions` returned zero files. |
| `tier-config.ts` (`TIER_MAX_TOKENS`, `getModel`, `getTimeout`) | 14 | `supabase/functions/_shared/tier-config.ts` | **NO** — file does not exist in `_shared/`. |
| `tier-prompts.ts` (`loadPromptVariant`) | 14 | `supabase/functions/_shared/tier-prompts.ts` | **NO** — file does not exist. `_shared/` listing: `anthropic.ts, auth.ts, billing-period.ts, cors.ts, errors.ts, handler.ts, json-repair.ts, logger.ts, pdf-parser.ts, prompt-sanitizer.ts, rate-limiter.ts, recruiting-lens-merger.ts, recruiting-lens-prompts.ts, result-merger.ts, resume-prompts.ts, stripe-client.ts, supabase-client.ts, usage-checker.ts` — confirming none of Phase 13/14's artifacts have landed. |
| Phase 13 SUMMARY.md | 13 | `.planning/phases/13-.../13-SUMMARY.md` | **NO** — only PLAN/RESEARCH/CONTEXT/DISCUSSION/PATTERNS/VALIDATION exist. |
| Phase 14 SUMMARY.md | 14 | `.planning/phases/14-.../14-SUMMARY.md` | **NO** — plans exist, no execution trail. |

**Contradiction flagged:** CONTEXT.md D-01/D-04 reference a `subscriptions` table that does not yet exist. `auth.ts:88-103` (the current `requireUserAuth` helper) already reads tier from `profiles.subscription_tier` via `.select('subscription_tier').eq('id', user.id).single()` and returns it in `UserContext.tier`. If Phase 12 is still pending, **the current authoritative tier is `profiles.subscription_tier`** and D-04's query pattern should temporarily target that column.

**Recommendation to planner:**

Option A (sequenced, safest): Hold Phase 15 until Phases 12, 13, 14 are executed. Phase 15 PLAN tasks import directly from the files those phases create — authoring against non-existent modules is a planning hazard.

Option B (parallel, with explicit substitutions): Land the parts of Phase 15 that do NOT depend on Phase 13/14 artifacts first:
- `applyTierShape` + `FREE_ALLOWED_FIELDS`/`PRO_ALLOWED_FIELDS`/`ELITE_ALLOWED_FIELDS` in `result-merger.ts`
- Relocated `capPriorityImprovements` with `{free:1, pro:5, elite:7}`
- `buildEliteExtrasSystem` in `resume-prompts.ts` (no loader registration — defer to Phase 14)
- Replacement of `rawBody.tier` with `userContext.tier` from existing `requireInternalOrUserAuth` (which already reads `profiles.subscription_tier`)
- Updated `CALL_CONFIGS` values (D-17 split)
- Boot-time assertion (D-18) hardcoding the tier caps as local constants until `tier-config.ts` exists
- Leave Merit gateway wrapping, `loadPromptVariant` swap, and `subscriptions` table read as Phase 13/14 follow-up hooks

Option B carries rework risk — the planner must explicitly mark every "TODO swap to Phase-14 loader" comment in task actions.

**This researcher does not make this call.** The planner or user must choose.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tier resolution (source of truth) | Database (Postgres — `subscriptions` or fallback `profiles`) | API / Edge Function | Server-side trust boundary. Client NEVER supplies tier. |
| Tier read + caching per request | Edge Function (`analyze-resume`) | — | One `.select()` at handler top, cached in `const resolvedTier`. |
| Output-shape enforcement | Shared utility (`_shared/result-merger.ts`) | — | Single exit point for Phase 16–19 reuse. |
| Prompt variant selection | Shared loader (`_shared/tier-prompts.ts` — Phase 14) | Feature prompt module (`resume-prompts.ts`) | Phase 14 is the single import gate; feature module exports the registered variants. |
| Merit deduction + refund | Shared gateway (`_shared/merit-gateway.ts` — Phase 13) | Edge Function handler | Gateway owns transaction + refund-on-Anthropic-upstream-failure semantics. |
| Parallel fan-out execution | Feature handler (`analyze-resume/index.ts`) | — | Per-feature call budgets; Phase 14 owns only the tier cap. |
| Defensive UI rendering of tier-shaped output | Browser (`src/pages/Results.tsx`) | — | Must not crash when C2–C11 lack `feedback`; rich rendering deferred to Phase 20. |

## Standard Stack

Phase 15 is a code-shaping phase inside an existing feature. No new dependencies.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.81.1 (via shared `getServiceClient()`) | Service-role DB read for tier lookup | [VERIFIED: `package.json`] Existing pooled client in `_shared/supabase-client.ts`. |
| Deno standard library | `0.168.0` (via `https://deno.land/std@0.168.0/http/server.ts`) | Edge function runtime | [VERIFIED: `analyze-resume/index.ts:2`] Existing. |
| Anthropic HTTP API (no SDK) | N/A | LLM calls via `_shared/anthropic.ts` `invokeAnthropicText` | [VERIFIED: `analyze-resume/index.ts:5`] Existing pattern. |

**Nothing new to install.** Phase 15 adds three new symbols to existing files:

1. `_shared/result-merger.ts` — `applyTierShape()`, `FREE_ALLOWED_FIELDS`, `PRO_ALLOWED_FIELDS`, `ELITE_ALLOWED_FIELDS`
2. `_shared/resume-prompts.ts` — `buildEliteExtrasSystem()` and extend `CallType` union to include `'elite-extras'`
3. `analyze-resume/index.ts` — tier lookup block, updated `CALL_CONFIGS`, boot-time assertion, `withMerits` wrapper (Phase 13 dependent), `loadPromptVariant` call (Phase 14 dependent)

## Current Code Surface (Verified)

### `analyze-resume/index.ts` — critical line references

All line numbers verified by direct read on 2026-04-15. Listing is for planner to author precise diffs.

| Lines | Symbol | Current behavior | Phase 15 change |
|-------|--------|------------------|------------------|
| 44–48 | `CALL_CONFIGS` (const) | 3 entries: `criteria-1` 1800/1800/2200, `criteria-2` 1800/1800/2200, `summary` 2400/2800/3200. Interface: `{callType, maxTokensFree, maxTokensPro, maxTokensElite}`. | Rewrite per D-17. Add 4th entry `elite-extras` with `{maxTokensFree:0, maxTokensPro:0, maxTokensElite:4000}`. Update tier totals to 6000/16000/20000. |
| 51–57 | `capPriorityImprovements(result, tier)` | In-file helper, caps `{free:4, pro:5, elite:7}`. Called at 405, 497, 647. | **DELETE**. Logic moves into `applyTierShape` inside `result-merger.ts` with caps `{free:1, pro:5, elite:7}` (D-13). Remove all 3 call sites. |
| 59–126 | `executeParallelCalls` | Fires `CALL_CONFIGS.map(...)` in parallel, retries once on failure (skipping 429/402). | Add `.filter(cfg => perTierMaxTokens(cfg) > 0)` at the top of the map so Free/Pro skip the 4th entry. Preserve existing retry and `ParallelResult` discriminated union. |
| 208 | `const userTier = rawBody.tier || 'free'` | Silent billing defect — trusts client. | **DELETE**. Replace with `resolvedTier` resolved from DB (see 226+). |
| 209 | `const isElite = userTier === 'elite'` | Drives Elite prompt branching. | Replace with `resolvedTier === 'elite'`. |
| 222 | `log.info('request-start', {..., tier: userTier, ...})` | Structured log. | Replace `userTier` with `resolvedTier`. |
| 226 | `const userContext = await requireInternalOrUserAuth(req)` | Returns `UserContext` with `tier` field populated from `profiles.subscription_tier` (verified: `auth.ts:88-103`). | Preserve. **Add immediately after**: `const resolvedTier = userContext ? await resolveTier(supabase, userContext.userId) : 'free';` (Option B: `resolvedTier = userContext?.tier ?? 'free'` — reuses existing profile read, no extra round-trip). |
| 239–274 | `checkAndRecordUsage` (legacy quota block) | Calls `can_perform_ai_action` RPC, returns 402 if exhausted. | Phase 13 D-09 says: keep for `MERIT_SYSTEM_ENABLED=false` flag-off path. Wrap existing block in `if (!MERIT_SYSTEM_ENABLED) { ... }`. |
| 275–276 | `ANTHROPIC_MODEL_TEXT` / `ANTHROPIC_MODEL_FALLBACK` env reads | Single model for all tiers with env-var override. | Replace primary with `getModel(resolvedTier)` from Phase 14 `tier-config.ts`. Preserve fallback for the 3-call-failure path. |
| 308–321 | `promptParams: PromptParams` object construction | Builds `isElite`, `tier`, stats, target role/industry. | Will be the argument to `loadPromptVariant('resume', resolvedTier, promptParams)`. The `isElite` field becomes redundant once the loader owns variant selection but can stay for backwards compat. |
| 306 | `const userPrompt = buildUserPrompt(normalizedText, improvementContext)` | Direct import from `resume-prompts.ts`. | Stays — `buildUserPrompt` is user-message content, not system-prompt branching. |
| 337–344 | First `executeParallelCalls` call site (streaming path) | Passes `model, promptParams, userPrompt, isElite, tier, fixtureKey`. | Wrap entire async IIFE body in `withMerits(authenticatedUserId, 'resume_analysis', MERIT_COST[resolvedTier], async () => { ... })`. Same for non-streaming at 565–572. |
| 366, 606 | `fallbackMaxTokens` computation | Inline `userTier === 'elite' ? 7600 : userTier === 'pro' ? 6400 : 6000`. | Replace with `TIER_MAX_TOKENS[resolvedTier]` from Phase 14 — already matches Free's 6000 exactly, intentionally expands Pro/Elite. |
| 405, 497, 647 | `capPriorityImprovements(...)` call sites | 3 sites (fallback streaming, parallel streaming, fallback non-streaming). | **DELETE all 3**. Enforcement now happens inside `mergeAndValidateResults`. |
| 474 | `mergeAndValidateResults(rawResults, isElite)` call | Current signature: `(rawResults, isElite)`. | New signature: `(rawResults, resolvedTier)` OR keep `isElite` and add `tier` as 3rd param. Researcher recommends `(rawResults, tier)` and derive `isElite = tier === 'elite'` inside — single source of truth. |

### `_shared/result-merger.ts` — current shape

- `mergeAndValidateResults(rawResults, isElite)` is the single entry point. Pipeline: parse-each-call → concat `criterionFeedback` (6+5=11) → spread summary fields → `fillDefaults` → return.
- `fillDefaults(merged, isElite)` (line 142) sets defaults for `industryGuess`, `suggestedTargetRoles`, `recommendedKeywords`, `eliteInsights`, `overallScore=0`, `_mergeSource='parallel-3'`.
- `ALLOWED_FIELDS` (line 28) is a per-**call-type** field filter (already strips unknown fields from individual parallel responses). This is DIFFERENT from the Phase 15 tier-level whitelist. Do not confuse them.

**Phase 15 edit:** add `applyTierShape(merged, tier)` as a new step AFTER `fillDefaults` and BEFORE the `return` at line 258. Change the exported signature to `mergeAndValidateResults(rawResults, tier)`. Author `FREE/PRO/ELITE_ALLOWED_FIELDS` colocated in the file. Author tests in `result-merger.test.ts` (file exists at `_shared/result-merger.test.ts`).

### Current Merged JSON Shape (verified from `result-merger.ts` + `resume-prompts.ts`)

Fields currently present in the merged `grading_data` object after `fillDefaults`, enumerated from what the 3 call types produce and what `fillDefaults` injects:

**From `criteria-1` call (ALLOWED_FIELDS line 29):**
- `criterionFeedback[]` — 6 entries (C1–C6), each with `{id, label, weight, score, feedback}` where `feedback` is either `{observation, impact, fix}` (non-Elite) or `{observation, impact, fix, deeper, rewrite}` (Elite). Verified against `buildCriteria1Suffix` schema at `resume-prompts.ts:150`.

**From `criteria-2` call (ALLOWED_FIELDS line 29):**
- `criterionFeedback[]` — 5 entries (C7–C11). Same per-entry shape as above. Concatenated with criteria-1 array at `result-merger.ts:247`.

**From `summary` call (ALLOWED_FIELDS line 31):**
- `executiveSummary` — either a string OR a structured `{keyStrengths[], keyGaps[], highImpactFix}` object (verified from `buildSummarySuffix:179` schema and `Results.tsx:881-892` dual-path rendering)
- `strengths[]` — array of strings
- `priorityImprovements[]` — array of strings, count varies by tier (currently 2-4 free, 3-5 pro, 4-7 elite from prompt; capped to 4/5/7 today by `capPriorityImprovements`)
- `rewriteSuggestions[]` — array of `{criterionId, title, originalText, issues[], improvedText, impact, potentialScoreIncrease}`
- `industryGuess` — string
- `suggestedTargetRoles[]` — array of strings
- `recommendedKeywords[]` — array of strings
- `eliteInsights` — object or null, containing `{interviewLikelihood, interviewLikelihoodExplanation, competitiveRanking, recruiterFirstImpressions: {atThreeSeconds, atSevenSeconds, whatTheyMiss}, hiddenWeaknesses[], powerPhrases[], detailedATSGapAnalysis[]}`

**From `fillDefaults` (line 167):**
- `overallScore` — number (set to 0 by merger, overwritten by `reconcileScore` in handler)
- `_mergeSource` — string `'parallel-3'`

### Recommended Whitelist Definitions (Claude's Discretion per D-15)

Cross-referencing RES-01/02/03/04 spec against the enumerated keys above:

```typescript
// Derived fields — always kept, not toggled by tier
const CORE_FIELDS = ['overallScore', '_mergeSource'] as const;

const FREE_ALLOWED_FIELDS = new Set([
  ...CORE_FIELDS,
  'executiveSummary',     // RES-01
  'resumeSignal',         // RES-01 — NOTE: this field is NOT in current merged shape; planner must coordinate with Phase 14 prompt revision to add it OR remap to existing `executiveSummary.highImpactFix`
  'strengths',            // RES-01 — full array
  'priorityImprovements', // RES-01 — capped to 1 inside applyTierShape
  'criterionFeedback',    // RES-01 — 11 entries, but C2–C11 stripped to {criterion, score} inside applyTierShape
]);

const PRO_ADDITIONS = ['rewriteSuggestions', 'industryGuess', 'suggestedTargetRoles', 'recommendedKeywords'];
const PRO_ALLOWED_FIELDS = new Set([...FREE_ALLOWED_FIELDS, ...PRO_ADDITIONS]);

const ELITE_ADDITIONS = ['eliteInsights']; // or flatten its 6 sub-fields — see "Open Questions"
const ELITE_ALLOWED_FIELDS = new Set([...PRO_ALLOWED_FIELDS, ...ELITE_ADDITIONS]);
```

**Note on `resumeSignal`:** RES-01 lists this field but the current merged JSON does not produce a key by that exact name. The closest match is `executiveSummary.highImpactFix`. The planner must either (a) coordinate with Phase 14 to have the new Free prompt variant emit a top-level `resumeSignal` key, or (b) treat `executiveSummary` as carrying the signal and omit `resumeSignal` from the whitelist. This is an open question — flagging for the planner, not resolving here.

### Criterion Field Stripping (D-14) — precise semantics

For Free tier, the shaper must walk `criterionFeedback[]` and strip `feedback`, `deeper`, `rewrite` from entries `[1]..[10]` (zero-indexed, i.e., C2–C11). What remains:

```typescript
// Entry 0 (C1): keep everything — {id, label, weight, score, feedback: {observation, impact, fix}}
// Entries 1..10 (C2–C11): strip to {id, label, weight, score}
```

CONTEXT.md D-14 says "drops every key except `criterion` and `score`". The actual current field is `id` not `criterion`. The planner should use `id` (matches existing shape) OR rename to `criterion` if Phase 14 prompt variants emit the new name. `label` and `weight` are needed by `Results.tsx:1132-1138` for rendering (without them the card shows empty name and "undefined% weight"), so researcher recommends preserving `{id, label, weight, score}` — fewer renderer crashes.

**Verified defensive behavior of current `Results.tsx`:** The feedback-rendering IIFE at line 1150–1159 already tolerates missing feedback by emitting an empty `<ul>`:

```typescript
const f = c.feedback;
if (Array.isArray(f)) return f.filter(Boolean);
if (f && typeof f === 'object') return [f.observation, f.impact, f.fix, f.deeper, f.rewrite].filter(Boolean);
if (typeof f === 'string') return f.split('.').map(s => s.trim()).filter(Boolean);
return [];  // <-- fires when feedback is undefined. Renders empty <ul>. No crash.
```

**So Results.tsx needs ZERO defensive changes for Phase 15.** The shaper can safely strip feedback from C2–C11 and the UI will render the criterion name + weight + score bar + empty list. Phase 20 will add the "unlock full feedback" paywall overlay.

### `_shared/resume-prompts.ts` — current shape

- `CallType = 'criteria-1' | 'criteria-2' | 'summary'` (line 19). Phase 15 extends to `| 'elite-extras'`.
- `PromptParams` (line 21) already carries `tier: 'free' | 'pro' | 'elite'`.
- `buildSharedPrefix(params)` (line 39) produces the ~90% shared prefix including the elite-enhancements block inline. Phase 14 is expected to split this by tier variant — until Phase 14 lands, Phase 15 cannot use `loadPromptVariant`.
- `buildSystemBlocks(callType, params)` (line 205) returns the 2-block array with `cache_control: ephemeral` on the prefix. This is what `executeParallelCalls` currently uses at line 74.
- `buildCallSuffix` (line 131) dispatches to `buildCriteria1Suffix`, `buildCriteria2Suffix`, `buildSummarySuffix` — Phase 15 adds a 4th branch for `'elite-extras'`.
- `buildSummarySuffix` (line 168) ALREADY has `tier` parameter and uses it for `improvementRange` / `rewriteRange` — this demonstrates the existing tier-differentiation pattern Phase 15 extends. But today the tier differentiation is prompt-only (no output-shape enforcement), which is exactly the gap Phase 15 closes.

### `_shared/auth.ts` — tier reading (verified, contradicts D-01/D-04)

Lines 88–103 of `auth.ts`:

```typescript
const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('subscription_tier')
  .eq('id', user.id)
  .single();
...
const ctx: UserContext = {
  userId: user.id,
  email: user.email ?? '',
  tier: profile.subscription_tier ?? 'free',
};
```

**Key insight:** `UserContext.tier` is ALREADY populated from `profiles.subscription_tier` on every authenticated request. `analyze-resume` is already calling `requireInternalOrUserAuth(req)` at line 226 and could read `userContext.tier` for free — no extra DB round-trip needed.

The D-04 separate `subscriptions.select('tier')` lookup adds a second DB round-trip per request for a value the existing auth layer already fetches. **Researcher's note for the planner:** Once Phase 12 lands and creates the `subscriptions` table, the decision is whether Stripe-authoritative tier should become the single source of truth (D-01/D-04 as written) OR whether `profiles.subscription_tier` should be synced-from-webhook and remain the read path for everything. CONTEXT.md is authoritative — this is a flag for the planner to raise with the user during plan-checking, not a re-litigation of D-01 here.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────┐
│ Browser         │  POST /analyze-resume { resumeText, targetRole, stream: true }
│ (Results page)  │
└────────┬────────┘
         │  Authorization: Bearer <JWT>
         ▼
┌──────────────────────────────────────────────────────────────┐
│ Edge Function: analyze-resume                                │
│                                                              │
│  1. requireInternalOrUserAuth(req)                           │
│     └─> _shared/auth.ts → profiles.select('subscription_tier') [CURRENT]
│         OR subscriptions.select('tier') [PHASE 12+]         │
│     → userContext.tier                                       │
│                                                              │
│  2. resolvedTier = userContext.tier ?? 'free'                │
│     ├─ log.warn('subscription-missing') if null              │
│     └─ const cost = {free:3, pro:2, elite:3}[resolvedTier]   │
│                                                              │
│  3. checkRateLimit (pooled 60/hr — Phase 13 D-08)            │
│                                                              │
│  4. if (MERIT_SYSTEM_ENABLED) withMerits(userId, 'resume_analysis', cost, async () => { │
│       loadPromptVariant('resume', resolvedTier, promptParams) [PHASE 14]               │
│                                                              │
│       ┌────────────────────────────────────────────────┐    │
│       │ executeParallelCalls (Promise.allSettled)       │    │
│       │  ├─ criteria-1  (C1-C6)          ──┐           │    │
│       │  ├─ criteria-2  (C7-C11)         ──┼─► Anthropic API │
│       │  ├─ summary     (narrative)      ──┤           │    │
│       │  └─ elite-extras (Elite only)    ──┘           │    │
│       │     [skipped if maxTokens === 0]                │    │
│       └──────────────────┬─────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│       ┌────────────────────────────────────────────────┐    │
│       │ mergeAndValidateResults(rawResults, tier)      │    │
│       │  1. parseAndValidateCall each                  │    │
│       │  2. concat criterionFeedback[]                  │    │
│       │  3. spread summary fields                       │    │
│       │  4. fillDefaults                                │    │
│       │  5. applyTierShape(merged, tier)  [NEW]        │    │
│       │     └─ whitelist strip per FREE/PRO/ELITE      │    │
│       │     └─ criterionFeedback C2-C11 → {id,label,weight,score} (Free) │
│       │     └─ priorityImprovements.slice(0, cap)       │    │
│       └──────────────────┬─────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│       reconcileScore / validateFeedbackDepth                 │
│                          │                                   │
│                          ▼                                   │
│       supabase.from('resumes').update({ grading_data })      │
│     })                                                       │
│     catch: withMerits refunds on upstream-failure (Phase 13) │
│                                                              │
│  5. Emit SSE 'complete' { result } OR return JSON            │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ Browser Results │  Renders merged result. Defensive paths tolerate missing feedback.
└─────────────────┘
```

### Pattern 1: Server-side tier resolution

**What:** Read tier from trusted DB source after auth, never from request body.
**When to use:** Any handler that changes behavior or cost based on tier.
**Example:**

```typescript
// Source: verified pattern from auth.ts:88-103
const userContext = await requireInternalOrUserAuth(req);
// userContext.tier is already populated from profiles.subscription_tier
const resolvedTier: 'free' | 'pro' | 'elite' =
  (userContext?.tier === 'pro' || userContext?.tier === 'elite')
    ? userContext.tier
    : 'free';

// Phase 12+ path (when subscriptions table exists):
// const { data } = await supabase.from('subscriptions').select('tier').eq('user_id', userId).maybeSingle();
// const resolvedTier = data?.tier ?? (log.warn('subscription-missing', { userId }), 'free');
```

### Pattern 2: Conditional N-th parallel call via budget filter

**What:** Drive fan-out width from `CALL_CONFIGS` by filtering any entry whose per-tier maxTokens is 0.
**When to use:** When an extra call applies only to a subset of tiers and you want zero latency impact on the excluded tiers.
**Example:**

```typescript
// Extends existing pattern at analyze-resume/index.ts:90-93
const activeConfigs = CALL_CONFIGS.filter(cfg => {
  const budget = cfg[`maxTokens${capitalize(params.tier)}` as const];
  return budget > 0;
});
const promises = activeConfigs.map(cfg => {
  const maxTokens = cfg[`maxTokens${capitalize(params.tier)}` as const];
  return makeCall(cfg.callType, maxTokens);
});
```

### Pattern 3: Single-exit shape enforcement

**What:** Put output-shape filtering at the last step of the shared merger so all callers inherit it.
**When to use:** When multiple features will eventually need the same shape rules (Phases 16–19).
**Example:**

```typescript
// New exit step in _shared/result-merger.ts:258
export function mergeAndValidateResults(
  rawResults: Record<string, string>,
  tier: 'free' | 'pro' | 'elite',
): { ok: true; data: Record<string, unknown> } | { ok: false; reason: string } {
  // ... existing pipeline ...
  fillDefaults(merged, tier === 'elite');
  applyTierShape(merged, tier);  // NEW — final step
  return { ok: true, data: merged };
}

function applyTierShape(merged: Record<string, unknown>, tier: 'free' | 'pro' | 'elite'): void {
  const whitelist = tier === 'elite' ? ELITE_ALLOWED_FIELDS
    : tier === 'pro' ? PRO_ALLOWED_FIELDS
    : FREE_ALLOWED_FIELDS;

  // Strip keys not in whitelist
  for (const key of Object.keys(merged)) {
    if (!whitelist.has(key)) delete merged[key];
  }

  // Cap priorityImprovements
  const caps = { free: 1, pro: 5, elite: 7 };
  if (Array.isArray(merged.priorityImprovements)) {
    merged.priorityImprovements = (merged.priorityImprovements as unknown[]).slice(0, caps[tier]);
  }

  // Free tier: strip feedback from C2-C11 (entries 1..10)
  if (tier === 'free' && Array.isArray(merged.criterionFeedback)) {
    merged.criterionFeedback = (merged.criterionFeedback as Record<string, unknown>[]).map((c, i) => {
      if (i === 0) return c;
      return { id: c.id, label: c.label, weight: c.weight, score: c.score };
    });
  }
}
```

### Pattern 4: Boot-time invariant assertion

**What:** Verify configuration constraints at module load, fail loudly before any request is served.
**When to use:** When a runtime value is derived from multiple constants that must sum/compare correctly.
**Example:**

```typescript
// Top of analyze-resume/index.ts, after CALL_CONFIGS declaration
import { TIER_MAX_TOKENS } from '../_shared/tier-config.ts';  // Phase 14 dependency

const TIERS = ['free', 'pro', 'elite'] as const;
for (const tier of TIERS) {
  const sum = CALL_CONFIGS.reduce((acc, cfg) => {
    const key = `maxTokens${tier[0].toUpperCase() + tier.slice(1)}` as const;
    return acc + cfg[key];
  }, 0);
  if (sum > TIER_MAX_TOKENS[tier]) {
    throw new Error(`[analyze-resume] CALL_CONFIGS sum ${sum} exceeds TIER_MAX_TOKENS[${tier}] (${TIER_MAX_TOKENS[tier]})`);
  }
}
```

### Anti-Patterns to Avoid

- **Trusting `rawBody.tier`** — current `analyze-resume/index.ts:208` is the silent-cost defect. Deleting it is the single highest-priority edit in the phase.
- **Shaping output in the handler** — if `applyTierShape` lives in `analyze-resume/index.ts`, every future tier-gated feature must remember to call it. Put it inside `mergeAndValidateResults` per D-12.
- **Coupling Merit flag to output shape** — D-09 explicitly says tier gating works with `MERIT_SYSTEM_ENABLED=false`. Wrapping `applyTierShape` inside `if (MERIT_SYSTEM_ENABLED)` would break that contract.
- **Sequential 4th call for Elite** — would add 8–15s to the highest-paying tier's latency. D-05 specifies parallel addition.
- **Expanding `summary` call's `maxTokens` to absorb Elite narrative** — would push a single call past safe token limits and defeat the parallel cache-hit benefit.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Service-role Supabase client | New `createClient(...)` in handler | `getServiceClient()` from `_shared/supabase-client.ts` | Pooled across warm workers. |
| JWT verification + profile fetch | Manual `getUser` + profile read | `requireInternalOrUserAuth(req)` | Already returns `tier` in `userContext`. |
| JSON repair for streaming | Custom brace-matching | `repairTruncatedJSON` from `_shared/json-repair.ts` | Existing tested implementation. |
| Parallel fan-out + retry | Manual `Promise.all` loops | Extend existing `executeParallelCalls` | Already handles `Promise.allSettled`, non-retriable 429/402, exponential backoff. |
| Structured logging | `console.log` strings | `createLogger('analyze-resume', reqId)` | Bracket-prefixed JSON, Supabase-captured. |
| CORS headers | Inline object | `corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' })` | Fail-closed against `APP_URL`. |
| Rate limiting | Counter in-handler | `checkRateLimit` from `_shared/rate-limiter.ts` | Sliding window, retryAfter support. |
| Merit deduction | Manual `merits_ledger.insert` | `withMerits` from `_shared/merit-gateway.ts` (Phase 13) | Gateway owns refund-on-failure. |
| Tier prompt selection | Inline `if (tier === 'elite') ...` | `loadPromptVariant('resume', tier, params)` (Phase 14) | Single import gate; auto-injects GLOBAL_AI_PRINCIPLES. |
| Output-shape enforcement in handler | `delete merged.rewriteSuggestions` inline | `applyTierShape` inside merger | Single exit point for Phases 16–19 reuse. |

**Key insight:** Phase 15 is almost entirely a reshaping phase — zero new infrastructure. The risk isn't technical complexity; it's sequencing against Phases 12–14 which are not yet on disk.

## Runtime State Inventory

Phase 15 is a code/config-change phase — NOT a rename, refactor, or migration phase. No runtime state inventory applies.

- **Stored data:** None. `resumes.grading_data` JSONB column stores whatever the merger returns — a Free user's new narrower shape is a valid JSONB and historic Elite shapes remain readable by Results.tsx's tolerant rendering paths.
- **Live service config:** None.
- **OS-registered state:** None.
- **Secrets/env vars:** None added. Consumes `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_JOB_SECRET` (all existing).
- **Build artifacts:** None — edge function is redeployed via `supabase functions deploy analyze-resume`.

**Nothing found in category:** None — verified by reviewing Phase 15 CONTEXT and existing code paths. No identifiers are being renamed.

## Common Pitfalls

### Pitfall 1: Front-end rendering regression on Free tier C2–C11
**What goes wrong:** Stripping `feedback` from C2–C11 makes those criterion cards show empty detail sections.
**Why it happens:** `Results.tsx:1149-1169` renders a `<ul>` of feedback points; an empty list still renders the score badge and weight, but users will see visually "half-built" cards.
**How to avoid:** Verified at `Results.tsx:1150-1158` — the IIFE already returns `[]` for undefined feedback and the empty `<ul>` is visually acceptable. Phase 20 adds the paywall overlay. No defensive tweak needed for Phase 15.
**Warning signs:** Visual QA shows "empty criterion bodies" — expected, not a bug.

### Pitfall 2: Fallback single-call path bypassing `applyTierShape`
**What goes wrong:** The `fallbackResult` path at `index.ts:384-416` and `629-659` goes directly from `JSON.parse(repaired)` to DB, skipping the merger entirely. Phase 15's shaper lives inside the merger, so Free users hitting the fallback path would get a Pro/Elite-sized payload.
**Why it happens:** The fallback is a degraded-mode emergency path that handles its own field-filling inline via hand-rolled `if (!fallbackResult.industryGuess) fallbackResult.industryGuess = ''` etc.
**How to avoid:** Call `applyTierShape` directly on `fallbackResult` after the inline defaults block at both line 416 and line 659. Export `applyTierShape` from `result-merger.ts` as a named export for this purpose.
**Warning signs:** QA test: force all 3 parallel calls to fail (via fixture), verify Free tier output still excludes `rewriteSuggestions`.

### Pitfall 3: Boot-time assertion firing in local dev because Phase 14 `tier-config.ts` doesn't exist yet
**What goes wrong:** `import { TIER_MAX_TOKENS } from '../_shared/tier-config.ts'` blows up at module load.
**Why it happens:** Phase 14 artifacts not on disk (verified blocker).
**How to avoid:** Either sequence behind Phase 14 OR inline the constants in `analyze-resume/index.ts` with a TODO comment. Once Phase 14 lands, a second PR deletes the local constants and swaps to the shared import.
**Warning signs:** `deno check` fails on the import line.

### Pitfall 4: Merit cost inversion for Pro
**What goes wrong:** Spec says Pro is **2 Merits** but Free and Elite are **3 Merits**. A reader scanning CONTEXT.md D-08 may assume monotone.
**Why it happens:** Pro-tier pricing encourages subscription; Elite is amortized across the month but individual analyses are higher-cost due to the 4th call.
**How to avoid:** Declare a single `const MERIT_COST = { free: 3, pro: 2, elite: 3 } as const;` colocated with `CALL_CONFIGS` and reference it from the `withMerits` call. Document the inversion inline with a `// Spec §4.1: Pro is 2, intentional inversion` comment.
**Warning signs:** Unit test `expect(MERIT_COST.pro).toBe(2)` fails — catches regressions.

### Pitfall 5: `rewriteSuggestions` empty array vs undefined
**What goes wrong:** Free tier drops `rewriteSuggestions` entirely, but `Results.tsx:697` reads `gradingData.rewriteSuggestions || gradingData.suggestions || []` which is safe. HOWEVER `Results.tsx:830` reads `resume.grading_data?.suggestions?.length || 0` for the "Fixes" stat card — if the Free shape has neither `rewriteSuggestions` nor `suggestions`, it displays "0 Fixes".
**Why it happens:** Legacy field-name tolerance in Results.tsx.
**How to avoid:** "0 Fixes" is honest for Free tier — this is expected. No defensive change needed. Phase 20 will redesign the stats card for the locked/unlocked states.
**Warning signs:** QA shows "0 Fixes" for Free users — expected.

### Pitfall 6: `mergeAndValidateResults` signature change breaks `process-resume-analysis-job`
**What goes wrong:** Phase 15 changes the merger signature from `(rawResults, isElite)` to `(rawResults, tier)`. The async queue worker path also imports this.
**Why it happens:** Grep-verify before editing.
**How to avoid:** Grep `mergeAndValidateResults` across `supabase/functions` and update every call site. Out-of-scope deferred item says async queue is not part of Phase 15, but signature compatibility is a compile-time concern, not a runtime one — MUST fix call sites.
**Warning signs:** Deno type check fails.

## Code Examples

### Resolving tier server-side (before Phase 12)

```typescript
// Source: auth.ts:88-103 verified pattern
const userContext = await requireInternalOrUserAuth(req);
const rawTier = userContext?.tier ?? 'free';
const resolvedTier: 'free' | 'pro' | 'elite' =
  (rawTier === 'pro' || rawTier === 'elite') ? rawTier : 'free';

if (!userContext) {
  // Internal-worker path; tier should be carried in rawBody for queue jobs
  // TODO Phase 15 decision: reject internal-worker path without explicit tier?
}
```

### Resolving tier server-side (after Phase 12)

```typescript
// Per D-04; pending Phase 12
const supabase = getServiceClient();
const { data: sub, error } = await supabase
  .from('subscriptions')
  .select('tier')
  .eq('user_id', authenticatedUserId)
  .maybeSingle();

if (error) {
  log.error('subscription-lookup-failed', { userId: authenticatedUserId, error: error.message });
  // D-03: fail-closed to free, don't 403 — new signups during webhook race window
}
const resolvedTier: 'free' | 'pro' | 'elite' =
  sub?.tier === 'elite' || sub?.tier === 'pro' ? sub.tier : 'free';

if (!sub) {
  log.warn('subscription-missing', { userId: authenticatedUserId });
}
```

### Wrapping fan-out in withMerits (Phase 13 dependent)

```typescript
import { withMerits, MERIT_SYSTEM_ENABLED } from '../_shared/merit-gateway.ts';  // Phase 13

const MERIT_COST = { free: 3, pro: 2, elite: 3 } as const;  // Spec §4.1

const runAnalysis = async () => {
  const parallelResults = await executeParallelCalls({ ... });
  // merge, reconcile, DB update, email ...
  return analysisResult;
};

let analysisResult;
if (MERIT_SYSTEM_ENABLED) {
  analysisResult = await withMerits(
    authenticatedUserId,
    'resume_analysis',
    MERIT_COST[resolvedTier],
    runAnalysis,
  );
} else {
  // Legacy path: can_perform_ai_action + record_ai_usage still active
  analysisResult = await runAnalysis();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Trusting `rawBody.tier` | Server-side resolution from DB | Phase 15 D-01 | Closes billing/cost defect. |
| Per-tier maxTokens inline in handler | `TIER_MAX_TOKENS` in shared tier-config | Phase 14 (pending) | Single source of truth across features. |
| Handler-level `capPriorityImprovements` | Merger-level `applyTierShape` | Phase 15 D-12/D-13 | Single exit point, inherited by Phases 16–19. |
| Prompt-only tier differentiation | Prompt + shaper defense-in-depth | Phase 15 D-11 | Leaky prompt regressions cannot reach Free users. |
| `isElite` boolean passed everywhere | `tier: 'free' \| 'pro' \| 'elite'` | Phase 14 (mostly), Phase 15 completes transition | Three-state truth, not two. |

**Deprecated/outdated:**
- `rawBody.tier` — DELETE from `analyze-resume/index.ts:208`.
- `capPriorityImprovements(result, tier)` helper + 3 call sites — DELETE.
- `isElite` parameter to `mergeAndValidateResults` — REPLACE with `tier`.
- Inline `fallbackMaxTokens = userTier === 'elite' ? 7600 ...` — REPLACE with `TIER_MAX_TOKENS[resolvedTier]` once Phase 14 lands.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `profiles.subscription_tier` is the correct temporary tier source pre-Phase 12 | Pattern 1, Current Code Surface | If the user wants strict Phase 12 sequencing, Option B is invalid. |
| A2 | `resumeSignal` field in RES-01 maps to `executiveSummary.highImpactFix` | Whitelist recommendation | If Phase 14 introduces a new top-level `resumeSignal` key, planner must add it to `FREE_ALLOWED_FIELDS` and coordinate with Phase 14 prompt variant. |
| A3 | Keeping `{id, label, weight, score}` (not just `{id, score}`) in Free C2–C11 is safer for `Results.tsx` rendering | D-14 interpretation | If the user insists on literal "criterion and score only" from D-14, cards render without labels/weights. |
| A4 | `eliteInsights` can stay as a nested object in the whitelist; the 6 sub-fields don't need to be top-level | `ELITE_ALLOWED_FIELDS` | If RES-04 expects flat top-level `interviewLikelihood` / `competitiveRanking` / etc., the whitelist needs flattening and the `elite-extras` call must emit a flat shape, not nested. Verified against CONTEXT.md elite-extras language: **unclear** — CONTEXT.md describes the fields by name but does not specify nesting. Flagging for planner. |
| A5 | Fallback single-call path should also apply tier shape | Pitfall 2 | If planner decides the fallback is an emergency path that can leak fields, A5 is invalidated. Researcher recommends applying shape — Free users shouldn't see Pro/Elite data in a degraded-mode response either. |
| A6 | Merit cost Pro=2 is intentional (inverted from Free/Elite=3) | Pitfall 4, Code Examples | If the spec is misread, the costs are wrong. CONTEXT.md D-08 states explicitly `{ free: 3, pro: 2, elite: 3 }` — high confidence this is correct. |
| A7 | `process-resume-analysis-job` and `submit-resume-analysis-job` may import `mergeAndValidateResults` and need signature updates | Pitfall 6 | If not updated, Deno type check fails at deploy. Easy to catch; flagged for the planner to grep. |
| A8 | Phase 14's `loadPromptVariant('resume','elite')` will know to orchestrate the elite-extras call alongside the 3 base calls | D-07 interpretation | Phase 14's loader may only wrap the existing 3 calls; the elite-extras call may need its own direct loader entry point. Without Phase 14 on disk, this is unverifiable. |
| A9 | Boot-time assertion goes in `analyze-resume/index.ts` rather than `tier-config.ts` | D-18 interpretation (left to Claude's discretion) | Either works per D-18. Researcher recommends handler-level — the budget split is feature-specific, not tier-config's concern. |

## Open Questions (RESOLVED)

1. **`resumeSignal` field origin** (RESOLVED 2026-04-16)
   - What we know: RES-01 spec lists it as a Free-tier field. Current merged JSON has no such key.
   - What's unclear: Is it a new key Phase 14 prompts must emit, or an alias for `executiveSummary.highImpactFix`?
   - **Resolution:** The Phase 14 Free prompt variant (`FREE_TIER_SUFFIX` at `resume-prompts.ts:66-70`) explicitly instructs the model to return `resumeSignal` as a top-level field. Verified via grep: `resume-prompts.ts:68` contains "overallScore, executiveSummary, resumeSignal, strengths (full)". The `FREE_ALLOWED_FIELDS` whitelist correctly includes `resumeSignal`. If the model does not emit it (summary suffix JSON schema does not include it), the whitelist entry is inert — safe either way. No action needed.

2. **`eliteInsights` flat vs nested**
   - What we know: Current `eliteInsights` is a nested object with 6 sub-fields (verified in `buildSummarySuffix:170-172` + `fillDefaults:155-164`).
   - What's unclear: Does `elite-extras` call emit nested `{eliteInsights: {...}}` or flat top-level keys?
   - Recommendation: Emit flat — matches RES-04's spec wording "PLUS interviewLikelihood, competitiveRanking, ..." which reads as top-level additions. Requires updating `ELITE_ALLOWED_FIELDS` to enumerate the 6 flat keys instead of one `eliteInsights` key. Results.tsx rendering would need Phase 20 updates either way.

3. **`subscriptions` vs `profiles.subscription_tier` during prerequisite gap**
   - What we know: `subscriptions` table doesn't exist yet (Phase 12 pending); `profiles.subscription_tier` is the current read path in auth.ts.
   - What's unclear: Does the user want Phase 15 to hard-depend on Phase 12, or is the temporary `profiles.subscription_tier` substitution acceptable?
   - Recommendation: Planner/user decide during plan-checking. Document both paths in the plan.

4. **Signature compatibility for the async queue path** (RESOLVED 2026-04-16)
   - What we know: `mergeAndValidateResults` signature changes from `(rawResults, isElite)` to `(rawResults, tier)`.
   - What's unclear: How many files currently import this function?
   - **Resolution:** Codebase-wide grep on 2026-04-16 found `mergeAndValidateResults` imported in exactly 2 files: (1) `supabase/functions/analyze-resume/index.ts` (4 call sites at lines 376, 494, 756, 1012 — all addressed in Plan 15-03 Task 2), (2) `supabase/functions/_shared/result-merger.test.ts` (test file — addressed in Plan 15-01 Task 2). `process-resume-analysis-job` does NOT import `mergeAndValidateResults` (grep returned zero matches). No additional callers require signature updates.

5. **Does Phase 14's `loadPromptVariant` know how to surface the `'elite-extras'` variant?**
   - What we know: CONTEXT.md D-07 says register it under the `'resume'` feature key.
   - What's unclear: Phase 14's loader contract — does it return a single prompt or a per-call-type lookup?
   - Recommendation: Block Phase 15 execution behind Phase 14 ship, then verify the loader contract before authoring the 4th-call plumbing.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Deno runtime | Edge function local test | ✓ | 2+ (per CLAUDE.md) | — |
| `supabase` CLI | Function deploy | ✓ | 2.76.9 | — |
| Anthropic API | Prompt validation (TEST-09 live harness) | ✓ | N/A | — |
| `subscriptions` table with `tier` column | D-04 tier lookup | **✗** | — | Use `profiles.subscription_tier` via `userContext.tier` from existing `auth.ts` |
| `_shared/merit-gateway.ts` | Phase 13 `withMerits` + `MERIT_SYSTEM_ENABLED` | **✗** | — | Wrap fan-out in `if (MERIT_SYSTEM_ENABLED === false)` passthrough; defer Merit integration to Phase 13 ship |
| `_shared/tier-config.ts` | Phase 14 `TIER_MAX_TOKENS` / `getModel` / `getTimeout` | **✗** | — | Inline `const TIER_MAX_TOKENS = { free: 6000, pro: 16000, elite: 20000 }` locally with TODO comment |
| `_shared/tier-prompts.ts` | Phase 14 `loadPromptVariant('resume', tier, params)` | **✗** | — | Keep direct `buildSystemBlocks` import; defer loader swap to Phase 14 ship |

**Missing dependencies with no fallback:**
- None hard-block Phase 15. All can be temporarily substituted per Option B above.

**Missing dependencies with fallback:**
- `subscriptions` table → `profiles.subscription_tier` (existing path in auth.ts)
- `merit-gateway.ts` → passthrough (legacy `checkAndRecordUsage` stays active)
- `tier-config.ts` → inline constants
- `tier-prompts.ts` → direct `buildSystemBlocks` import with tier parameter already plumbed

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Deno built-in test runner (`deno test`) |
| Config file | `supabase/functions/deno.json` (tasks defined there) |
| Quick run command | `deno test supabase/functions/_shared/result-merger.test.ts --allow-env --allow-read` |
| Full suite command | `.\scripts\run-edge-tests.ps1` (runs all `_shared/*.test.ts` plus fixtures) |

Existing test inventory (verified in `_shared/`): `auth.test.ts`, `cors.test.ts`, `json-repair.test.ts`, `logger.test.ts`, `prompt-sanitizer.test.ts`, `rate-limiter.test.ts`, `result-merger.test.ts`, `stripe-client.test.ts`.

`result-merger.test.ts` is the natural home for Phase 15's new tests.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| RES-01 | Free output has exactly 1 priorityImprovements; only C1 has full feedback; C2–C11 stripped to `{id, label, weight, score}` | unit (`applyTierShape`) | `deno test supabase/functions/_shared/result-merger.test.ts --filter "applyTierShape free"` | ✓ (add new test case) |
| RES-02 | Free output has NONE of: `rewriteSuggestions`, `industryGuess`, `suggestedTargetRoles`, `recommendedKeywords`, `eliteInsights` | unit (`applyTierShape`) | same filter | ✓ (add new test case) |
| RES-03 | Pro output has all 11 criteria with full feedback; has `rewriteSuggestions`, `industryGuess`, `suggestedTargetRoles`, `recommendedKeywords`; has NO Elite fields | unit (`applyTierShape`) | `deno test supabase/functions/_shared/result-merger.test.ts --filter "applyTierShape pro"` | ✓ (add new test case) |
| RES-04 | Elite output has all Pro fields PLUS Elite 6 (either nested `eliteInsights` or flat — pending Q#2 resolution) | unit (`applyTierShape`) + integration (4th parallel call) | `deno test supabase/functions/_shared/result-merger.test.ts --filter "applyTierShape elite"` | ✓ (add new test case) |
| RES-05 | Merit deduction called before processing; tier-specific variant selected; per-tier maxTokens set | integration (handler-level, requires Phase 13/14) | TEST-09 harness against staging | ❌ Wave 0: harness registration entry |
| RES-06 | Boot-time assertion fires when CALL_CONFIGS sum exceeds TIER_MAX_TOKENS | unit (module-load test) | `deno test supabase/functions/analyze-resume/index.ts --filter "boot-assertion"` | ❌ Wave 0: new test |
| BACK-08 | Tier resolved server-side (not from rawBody); all RES-01..06 satisfied end-to-end | e2e (live Anthropic via TEST-09 fixture) | `node scripts/validate-performance.mjs --env staging` extended with tier-shape assertions | ❌ Wave 0: harness registration |

### Sampling Rate

- **Per task commit:** `deno test supabase/functions/_shared/result-merger.test.ts --allow-env --allow-read`
- **Per wave merge:** `.\scripts\run-edge-tests.ps1` (full shared suite)
- **Phase gate:** Full suite green + TEST-09 harness run against staging with a Free / Pro / Elite fixture each + manual inspection of the 3 returned shapes against the allowed-field whitelists

### Wave 0 Gaps

- [ ] `supabase/functions/_shared/result-merger.test.ts` — add test cases `applyTierShape free`, `applyTierShape pro`, `applyTierShape elite`, `applyTierShape strips criterion feedback C2-C11 for free`, `applyTierShape caps priorityImprovements at 1 for free`, `applyTierShape is a no-op for already-shaped Pro output`. Fixture data from existing `result-merger.test.ts` test fixtures.
- [ ] `supabase/functions/analyze-resume/index.test.ts` — does NOT exist today. New file with test cases: `boot-assertion-free`, `boot-assertion-pro`, `boot-assertion-elite`, `boot-assertion-fails-on-sum-exceeding-cap`. Pure unit tests that import constants without invoking the `serve` handler.
- [ ] Phase 14's validation harness — register `TierValidationFixture` entry for resume per CONTEXT.md "Integration Points". Cannot author until Phase 14's harness contract exists on disk. **Wave 0 blocker if Option A sequencing chosen.**
- [ ] No framework install needed — Deno test runner is built in.
- [ ] Integration test for `withMerits` wrapping — deferred until Phase 13's `merit-gateway.ts` is on disk.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireInternalOrUserAuth` (verified) |
| V3 Session Management | yes | Supabase JWT via `getUser(token)` (verified in `auth.ts:81`) |
| V4 Access Control | **YES — THIS IS THE CORE OF PHASE 15** | Server-side tier resolution replaces client-supplied `rawBody.tier`. This IS an access control phase. |
| V5 Input Validation | yes | Existing `resumeText` size cap (100KB), field length caps (200), already in place (`index.ts:200-206`) |
| V6 Cryptography | no | No new crypto; reuses existing `timingSafeEqual` for internal secret |
| V7 Error Handling | yes | Fail-closed on missing subscription (D-03); structured logging for audit trail |
| V8 Data Protection | yes | Merit refund on upstream failure prevents cost leakage (Phase 13) |

### Known Threat Patterns for Supabase Edge Function + AI orchestration

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client tier spoofing for free analysis at Elite depth | **Elevation of Privilege** | D-01: delete `rawBody.tier`; read from DB. This is the #1 Phase 15 fix. |
| Prompt injection to make Free user receive Pro output | Tampering | Defense-in-depth D-11: prompt variant + `applyTierShape` whitelist strip. Leaky prompt cannot reach user. |
| Merit cost exhaustion via parallel requests | DoS / Repudiation | Phase 13 rate limit 60/hr pooled + `withMerits` transaction. |
| Output-size exhaustion (token cost attack) | DoS | D-18 boot-time assertion + `TIER_MAX_TOKENS` caps. |
| Missing subscription row race at signup | Information Disclosure (free resource) | D-03: fail-closed to `'free'` default. No 403 — prevents signup-flow breakage. |
| `executeParallelCalls` leaking credentials via error messages | Information Disclosure | Existing pattern: error strings exclude secrets (`auth.ts:137` — `reason: 'secret-mismatch'` not the secret itself). Preserve. |

## Sources

### Primary (HIGH confidence)
- [VERIFIED: filesystem] `supabase/functions/analyze-resume/index.ts` (827 lines) — full line-level inventory
- [VERIFIED: filesystem] `supabase/functions/_shared/result-merger.ts` (259 lines) — merger pipeline and `fillDefaults`
- [VERIFIED: filesystem] `supabase/functions/_shared/resume-prompts.ts` (276 lines) — `CallType`, `PromptParams`, `buildSharedPrefix`, `buildSystemBlocks`, tier-aware `buildSummarySuffix`
- [VERIFIED: filesystem] `supabase/functions/_shared/auth.ts` (173 lines) — `requireInternalOrUserAuth` and `UserContext.tier` from `profiles.subscription_tier`
- [VERIFIED: filesystem] `src/pages/Results.tsx` (1181 lines) — defensive feedback rendering at 1150–1159 confirms no UI change needed
- [VERIFIED: filesystem] `.planning/phases/15-resume-analysis-gating/15-CONTEXT.md` — D-01..D-19 locked decisions
- [VERIFIED: filesystem] `.planning/REQUIREMENTS.md` lines 74–79, 144 — RES-01..06, BACK-08 text
- [VERIFIED: filesystem] `.planning/STATE.md` — only 1 phase complete, 5/28 plans
- [VERIFIED: filesystem] `supabase/migrations/*.sql` — no `CREATE TABLE subscriptions`; only `profiles.subscription_tier`
- [VERIFIED: filesystem] `supabase/functions/_shared/` listing — no `merit-gateway.ts`, `tier-config.ts`, `tier-prompts.ts`

### Secondary (MEDIUM confidence)
- `.planning/phases/13-merit-enforcement-and-feature-flag/13-CONTEXT.md` — referenced by Phase 15 for `withMerits` contract (not loaded in full; D-01/D-02/D-06/D-07/D-08 summary from Phase 15 CONTEXT's canonical-refs section)
- `.planning/phases/14-tier-prompts-and-locked-section-primitive/14-CONTEXT.md` — referenced for `TIER_MAX_TOKENS` and `loadPromptVariant` contract (not loaded in full; summary from Phase 15 CONTEXT's canonical-refs section)

### Tertiary (LOW confidence)
- APIcontextdocuments spec §4.1 field tables — referenced by CONTEXT.md as source of truth for RES-01..04 exact field lists; not verified directly in this research session (planner should verify against the .docx during plan-checking if Q#1 / Q#2 resolution is needed)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all existing code verified
- Current code surface: HIGH — every line number verified by direct read
- Architecture: HIGH — patterns match existing conventions; the only novel piece is the single-exit `applyTierShape`
- Pitfalls: HIGH — each pitfall traced to a specific line in the current code
- Phase 13/14 blocker status: HIGH — verified by grep and `_shared/` listing
- Exact whitelist contents: MEDIUM — dependent on Q#1 (`resumeSignal`) and Q#2 (`eliteInsights` nesting) resolution
- Merit cost values: HIGH — verbatim from CONTEXT.md D-08

**Research date:** 2026-04-15
**Valid until:** Until Phase 12/13/14 execution lands — rerun the blocker verification before sequencing a plan.

# Phase 17: career-compass-gating - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Make `analyze-career` tier-aware by wiring it onto the Phase 14 shared infrastructure and the Phase 13 Merit gateway:

1. **Resolve tier server-side** from the `subscriptions` table (no client trust) — remove existing `tier: userTier` from `requestBody`.
2. **Extract prompts** into `supabase/functions/_shared/career-prompts.ts` with `FREE_PROMPT`, `PRO_PROMPT`, `ELITE_PROMPT` builders, registered with `loadPromptVariant('career', tier, params)`.
3. **Parallel fan-out** — split into 2 calls: base analysis (all tiers) + conditional elite-extras (Elite only, `compensationIntelligence` + `smartApplicationStrategy`).
4. **Enforce per-tier `maxTokens` caps** — Free 6000 / Pro 16000 / Elite 20000 (CC-05).
5. **Shape Free output** to spec (CC-01/CC-02): full `careerDNA`, first `careerFields` entry only, `roleReadinessBreakdown` scorebox only, first 2 `roleRoadmaps` phases, first `surpriseFits` only. Omit `skillAssessments` detail, `skillGaps`, `resumeImprovements`, `salaryProgression`, `compensationIntelligence`, `smartApplicationStrategy`.
6. **Pro output** (CC-03): all standard fields including all 5 roadmap phases, full `roleReadinessBreakdown`, `salaryProgression` — omits `compensationIntelligence`, `smartApplicationStrategy`.
7. **Elite output** (CC-04): all Pro fields plus `compensationIntelligence` and `smartApplicationStrategy`.
8. **Merit deduction** 3/2/3 (Free/Pro/Elite) via `withMerits`, with refund on Anthropic upstream failure.
9. **Multi-role comparison** path: same Merit cost and same tier shaping as full analysis.
10. Tier gating applies **regardless of `MERIT_SYSTEM_ENABLED`** — the flag gates billing semantics only, not output shape.

Closes: CC-01, CC-02, CC-03, CC-04, CC-05, BACK-10.

**Out of scope for this phase:**

- Tier gating for any other feature — Phases 15 (resume), 16 (LinkedIn), 18 (Recruiting Lens), 19 (Interview Prep).
- Phase 14's loader, tier-config, LockedSection/LockedListItem — consumed, not modified.
- Phase 13's `withMerits`, `MERIT_SYSTEM_ENABLED`, refund taxonomy — consumed, not modified.
- Frontend Career Compass page changes beyond defensive shape handling — rich Elite presentation lands with Phase 20.
- Changes to `result-merger.ts` beyond adding career-specific `applyTierShape` rules.
- Domain classification logic refactoring — `DOMAIN_MAPPING` stays in `index.ts`.

</domain>

<decisions>
## Implementation Decisions

### Call Architecture

- **D-01:** Career Compass moves to a **2-call parallel fan-out**: (1) base analysis call (fires for all tiers) producing core + Pro fields, and (2) conditional `'elite-extras'` call (fires only when `resolvedTier === 'elite'`) producing `compensationIntelligence` and `smartApplicationStrategy`. Mirrors the resume Phase 15 D-05/D-06 pattern. Rationale: isolates Elite cost from Free/Pro, keeps Free/Pro latency unaffected by Elite-only content, enables independent `maxTokens` budgets per call.
- **D-02:** The existing single-call retry loop with `modelCandidates` and `computeBackoffMs` is replaced by a parallel execution pattern similar to `executeParallelCalls` in `analyze-resume`. The base call carries the full core analysis; the elite-extras call carries only compensation and strategy fields.
- **D-03:** Per-tier `maxTokens` from `TIER_MAX_TOKENS` in `tier-config.ts` (CC-05: Free 6000 / Pro 16000 / Elite 20000). Budget split between the two calls is planner's discretion — the elite-extras call gets a dedicated slice (likely ~4000 tokens for the 2 narrative fields), base call gets the remainder.

### Prompt Extraction

- **D-04:** Prompts are extracted into a new **`supabase/functions/_shared/career-prompts.ts`** module exporting `FREE_PROMPT`, `PRO_PROMPT`, `ELITE_PROMPT` builders (plus an `ELITE_EXTRAS_PROMPT` builder for the compensation call). Registered with the Phase 14 loader under the `'career'` feature key. Matches `resume-prompts.ts` pattern per Phase 14 D-01/D-02.
- **D-05:** Domain classification logic (`DOMAIN_MAPPING`, `classifyDomains`, ~200 lines) **stays in `analyze-career/index.ts`**. It's request-processing logic, not prompt text. Classification results (domain name, roles, fields, confidence) are passed into the prompt builder via `PromptParams`. Clean separation of concerns.
- **D-06:** `STRIVO_GLOBAL_AI_PRINCIPLES` is auto-prepended by the Phase 14 loader for Pro/Elite variants (Phase 14 D-03). The career prompt module does NOT manually inject principles — the loader handles it.

### Free Output Shaping (Defense in Depth)

- **D-07:** Free output shape is enforced at **both layers**: (a) `loadPromptVariant('career', 'free', params)` instructs the model to generate only Free-allowed fields with minimal structure, and (b) `applyTierShape(merged, 'free')` in `result-merger.ts` **strips and slices** the merged JSON server-side. A leaky prompt regression cannot reach a Free user. Matches Phase 15 D-11 precedent.
- **D-08:** Career-specific shaping rules are added to the existing `applyTierShape` in **`supabase/functions/_shared/result-merger.ts`**. Since Career Compass now uses parallel fan-out, it will use the merger anyway. Single enforcement point for all features.
- **D-09:** Free tier array slicing rules (per CC-01):
  - `careerDNA` — keep full
  - `careerFields` — slice to first entry only
  - `roleReadinessBreakdown` — keep `overallScore`, `targetRole`, `readinessVerdict` only; strip `skillAssessments`, `strengths`, `gaps` detail
  - `roleRoadmaps` — slice each role's `steps` to first 2 phases (Foundation + Build)
  - `surpriseFits` — slice to first entry only
  - `skillGaps`, `resumeImprovements`, `salaryProgression` — omit entirely
  - `compensationIntelligence`, `smartApplicationStrategy` — omit entirely (never generated for Free/Pro)
- **D-10:** Pro tier shaping (per CC-03): all standard fields, all 5 roadmap phases, full `roleReadinessBreakdown`, `salaryProgression`. Omit `compensationIntelligence`, `smartApplicationStrategy` (these come from the elite-extras call which doesn't fire for Pro).
- **D-11:** `CAREER_FREE_ALLOWED_FIELDS` and `CAREER_PRO_ALLOWED_FIELDS` whitelists are colocated with the career shaping rules inside `result-merger.ts`, following the `{FREE,PRO,ELITE}_ALLOWED_FIELDS` pattern from Phase 15 D-15.

### Multi-Role Comparison

- **D-12:** Multi-role comparison path **costs the same Merits** as full analysis (3/2/3 Free/Pro/Elite). Already wrapped inside `withMerits` today — no change to the cost structure. The comparison invokes an AI call, so Merit deduction is appropriate.
- **D-13:** Multi-role comparison output is **tier-shaped identically** to full analysis output. Free comparison omits Pro/Elite fields; Pro comparison omits Elite fields. Consistent behavior — tier determines what you see everywhere.

### Tier Source of Truth

- **D-14:** Tier is resolved **server-side from the `subscriptions` table**, same as Phase 15 D-01. The existing `tier: userTier` destructuring from `requestBody` at line 353 is removed — any client-supplied tier is ignored.
- **D-15:** Missing subscription row → default to `'free'` with a warn log, same as Phase 15 D-03.
- **D-16:** `isElite` (line 354) is replaced by `resolvedTier` from the subscriptions lookup, threaded into prompt selection, `withMerits`, and the shaper. No more `const isElite = userTier === 'elite'` from untrusted input.

### Model Routing

- **D-17:** Free-tier model routing to Haiku 4.5 moves from inline logic (lines 357-359) to `getModel('free')` from `tier-config.ts` (Phase 14 D-13). The existing `ANTHROPIC_MODEL_TEXT` inline assignment is removed. Pro/Elite use the model returned by `getModel(tier, 'career')` — currently Haiku 4.5 for career (intentional cost optimization), but the override map in `tier-config.ts` handles this.
- **D-18:** Timeouts move from hardcoded `85000` (line 882) to `getTimeout(tier)` from `tier-config.ts` (Phase 14 D-12).

### Claude's Discretion (Researcher / Planner decides)

- Exact `maxTokens` budget split between base call and elite-extras call — planner sizes based on token budget analysis of current output.
- Whether Career Compass needs its own `executeParallelCalls` or can reuse/adapt the one from `analyze-resume`. Either approach is fine as long as the fan-out pattern is consistent.
- Exact `CAREER_FREE_ALLOWED_FIELDS` list — planner cross-references CC-01/CC-02 against the actual JSON schema in the current prompt.
- Whether `handleMultiRoleComparison` gets its own prompt variant or reuses the main analysis prompt with a comparison flag.
- Shape of the elite-extras prompt — temperature, system block style, whether it receives the full profile context or a summary.
- Whether the retry/backoff logic (`computeBackoffMs`, `modelCandidates`) is preserved per-call or replaced by a simpler pattern matching `executeParallelCalls`.
- Exact `buildAnthropicImageBlocks` positioning — stays in index.ts (it's request processing, not prompt text).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec (Source of Truth)

- `APIcontextdocuments/STRIVO_GSD_Milestone_Merit_System.docx` §4.3 (per-tier field tables for Career Compass), §8.2 (tier maxTokens + parallel-call budgets), §8.3 (tier prompt variants), §11.3 (TEST-09/10 validation rules)
- `APIcontextdocuments/globalAIprinciples/STRIVO_Global_AI_Principles.docx` — auto-prepended by Phase 14 loader for Pro/Elite; Phase 17 does NOT re-inject

### Requirements

- `.planning/REQUIREMENTS.md` — CC-01, CC-02, CC-03, CC-04, CC-05, BACK-10 (the 6 REQ-IDs Phase 17 closes)
- `.planning/ROADMAP.md` §"Phase 17: career-compass-gating" — 5 Success Criteria that VERIFICATION.md must prove TRUE

### Prior Phase Context (MUST read)

- `.planning/phases/14-tier-prompts-and-locked-section-primitive/14-CONTEXT.md` — D-01/D-02 (loader is the only import point), D-03 (auto-prepend of GLOBAL_AI_PRINCIPLES), D-11..D-13 (tier-config.ts, `TIER_MAX_TOKENS`, `getModel`/`getTimeout`). Phase 17 consumes all of these.
- `.planning/phases/15-resume-analysis-gating/15-CONTEXT.md` — D-01..D-04 (tier resolution from subscriptions), D-05..D-07 (elite-extras parallel call pattern), D-08..D-10 (withMerits integration), D-11..D-15 (applyTierShape defense-in-depth pattern). Phase 17 follows the same patterns.
- `.planning/phases/13-merit-enforcement-and-feature-flag/13-CONTEXT.md` — D-01 (`withMerits`), D-06 (flag branching), D-07 (`career_compass` in feature list), D-08/D-09 (pooled rate limit before deduction).

### Existing Code to Modify or Reuse

- `supabase/functions/analyze-career/index.ts` — primary target (1063 lines). Lines 353-359 (client-supplied tier + inline model routing — REMOVE), 72-340 (`DOMAIN_MAPPING` + `classifyDomains` — KEEP in place), 795-828 (elite compensation prompt — EXTRACT to career-prompts.ts), 831-851 (system prompt — EXTRACT), 866-916 (single-call retry loop — REPLACE with parallel fan-out), 401-404 (`withMerits` — already wired, update cost structure).
- `supabase/functions/_shared/result-merger.ts` — add career-specific `applyTierShape` rules and `CAREER_{FREE,PRO,ELITE}_ALLOWED_FIELDS` whitelists.
- `supabase/functions/_shared/tier-prompts.ts` (Phase 14) — register `'career'` feature key with per-tier builders from the new `career-prompts.ts`.
- `supabase/functions/_shared/tier-config.ts` (Phase 14) — consumed for `TIER_MAX_TOKENS`, `getModel`, `getTimeout`. No modifications.
- `supabase/functions/_shared/merit-gateway.ts` (Phase 13) — consumed for `withMerits`, `MERIT_SYSTEM_ENABLED`. No modifications.

### Design System

- `CLAUDE.md` § Technology Stack — structured logging with bracket prefix, fail-closed CORS, Deno edge function patterns.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`withMerits` + `MERIT_SYSTEM_ENABLED`** (`_shared/merit-gateway.ts`) — already imported and wired in `analyze-career`. Phase 17 keeps the same wrapper, updates cost values.
- **`applyTierShape`** (`_shared/result-merger.ts`) — Phase 15's defense-in-depth shaper. Phase 17 extends it with career-specific field whitelists and array slicing rules.
- **`loadPromptVariant`** (`_shared/tier-prompts.ts`) — Phase 14's loader. Phase 17 registers `'career'` feature and imports via the loader.
- **`getModel` / `getTimeout` / `TIER_MAX_TOKENS`** (`_shared/tier-config.ts`) — Phase 14's config module replaces inline model/timeout logic.
- **`requireInternalOrUserAuth`** (`_shared/auth.ts`) — already returns `userContext` with `userId`. Phase 17 adds the `subscriptions` lookup immediately after.
- **`checkRateLimit`** (`_shared/rate-limiter.ts`) — already wired with career-specific limits.

### Established Patterns

- **Parallel fan-out with conditional Elite call** — Phase 15's `executeParallelCalls` + conditional `elite-extras` entry. Career Compass adopts the same 2-call pattern.
- **Service-role Supabase client for tier resolution** — `subscriptions.select('tier')` using `getServiceClient()`, same as Phase 15 D-04.
- **Structured logging** — `createLogger('analyze-career', reqId)` already in place. Phase 17 updates logged `tier` from `resolvedTier` instead of client-supplied value.
- **Defense-in-depth output shaping** — prompt instructs model to omit + server-side shaper strips. Phase 15 D-11 pattern.

### Integration Points

- **Phase 14 loader** — register `'career'` feature key with Free/Pro/Elite/EliteExtras builders.
- **Phase 14 tier-config** — import `TIER_MAX_TOKENS`, `getModel`, `getTimeout` to replace inline constants.
- **Phase 13 gateway** — `withMerits` already wrapping career analysis; update to use `resolvedTier` for cost lookup.
- **Phase 15 result-merger** — extend `applyTierShape` with career-specific rules.
- **Phase 12 subscriptions table** — tier source of truth.
- **Validation harness (Phase 14 D-14)** — Phase 17 registers a `TierValidationFixture` entry for career so TEST-09/10 have real data.

</code_context>

<specifics>
## Specific Ideas

- The existing `tier: userTier` from `requestBody` (line 353) and `const isElite = userTier === 'elite'` (line 354) are the highest-priority code changes — they are a silent billing/cost defect, same as Phase 15 D-01 fixed for resume. Delete and replace with server-side `resolvedTier`.
- The inline model routing at lines 357-359 (Haiku for free, env var for others) should be replaced by `getModel(resolvedTier, 'career')` — career already intentionally uses Haiku for all tiers, and `tier-config.ts` supports per-feature overrides.
- The `handleMultiRoleComparison` sub-path (line 406-408) must also receive `resolvedTier` and apply tier shaping to its output. Currently it passes through `userTier` from the client.
- The elite compensation prompt block (lines 795-828) is ~30 lines of template literal that becomes the `ELITE_EXTRAS_PROMPT` builder in `career-prompts.ts`. The domain-specific data (`domainClassification.domain`, `domainConfig.roles`, etc.) becomes `PromptParams` fields.
- The `buildAnthropicImageBlocks` helper (lines 26-68) is request-processing code for OCR images — it stays in `index.ts`, not the prompt module.

</specifics>

<deferred>
## Deferred Ideas

- **Tier gating for LinkedIn / Recruiting Lens / Interview Prep** — Phases 16, 18, 19 respectively. Phase 17 is scoped to `analyze-career` only.
- **Rich frontend Career Compass Elite presentation** (compensation intelligence dashboard, salary charts, application strategy cards) — Phase 20's pricing/paywall polish.
- **Extracting `resolveTier()` into `_shared/resolve-tier.ts`** — defer to the first phase that would create a third copy. Phase 15 and 17 each have inline lookups; extraction when Phase 16 or 18 needs the same.
- **Refactoring `DOMAIN_MAPPING` into a separate module** — unnecessary for Phase 17; revisit if other features need domain classification.
- **Running TEST-09 / TEST-10 in CI** — still deferred from Phase 14. Phase 17 runs the harness manually before ship.
- **Token-count empirical measurement** of the elite-extras budget — measure after implementation, patch if needed. Same approach as Phase 15 D-19.

</deferred>

---

*Phase: 17-career-compass-gating*
*Context gathered: 2026-04-16*

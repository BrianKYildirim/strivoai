---
phase: quick-260713-hrd
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - supabase/functions/_shared/auth.ts
  - supabase/functions/_shared/tier-config.ts
  - supabase/functions/_shared/result-merger.ts
  - supabase/functions/analyze-career/index.ts
  - supabase/functions/submit-career-analysis-job/index.ts
  - supabase/functions/process-career-analysis-job/index.ts
  - src/config/pricing-config.ts
  - src/pages/CareerCompass.tsx
  - supabase/functions/deno.json
  - supabase/functions/analyze-career/index.test.ts
  - supabase/functions/analyze-career/failure-branches.test.ts
  - supabase/functions/analyze-career/paid-output-validation.test.ts
  - supabase/functions/analyze-career/cache.test.ts
  - supabase/functions/_shared/career-shape.test.ts
  - supabase/functions/analyze-career/__tests__/byte-preserve.test.ts
  - supabase/functions/submit-career-analysis-job/job-contract.test.ts
  - supabase/functions/process-career-analysis-job/__tests__/refund-on-failure.test.ts
  - supabase/functions/analyze-career/__tests__/tier-resolution.test.ts
  - supabase/functions/analyze-career/__tests__/token-budget.test.ts
  - supabase/functions/analyze-career/__tests__/truncation-refund.test.ts
  - supabase/functions/analyze-career/__tests__/resume-only.test.ts
  - supabase/functions/process-career-analysis-job/__tests__/entitlement-not-retryable.test.ts
  - src/pages/__tests__/CareerCompass.recovery.test.tsx

must_haves:
  truths:
    - "An Elite user's queued Career Compass run is analyzed at tier 'elite' (not 'free') — the worker/internal path resolves the real tier from the DB."
    - "The Anthropic call for Career Compass receives the tier-configured output budget from getMaxOutput('careerCompass', tier) — never a hardcoded 2500/3500."
    - "A truncated model response (stop_reason='max_tokens') or an incomplete post-parse result is a terminal, non-retryable, REFUNDED failure — it is never repaired and persisted as a success, at any tier."
    - "A transient persistence/extraction failure (MeritRefundable(500) from persistCareerResultAndRecordUsage or the DOCX/OCR helpers) KEEPS its existing retryable 5xx semantics — only the completeness assertion maps to a terminal 422."
    - "A Free user with ONLY a resume (no LinkedIn PDF, no prior Resume Analysis, no prior LinkedIn Grade) gets a complete, successful Career Compass result."
    - "A Free result contains Career DNA, <=3 careerFields, <=3 roles, <=2 surpriseFits and a readiness score, and contains NO roadmap, NO roleRoadmaps, NO skillGaps, NO compensationIntelligence."
    - "A saved 'pro' user receives the Elite experience on both the server (analyze-career) and the client (CareerCompass.tsx) — nothing gates on the literal string 'elite'."
    - "Merits are the only paywall for Career Compass: can_perform_ai_action no longer blocks a run, and usage_tracking still records a row per successful run."
    - "An entitlement / usage-limit failure is never retried 8x by the career worker — it fails terminally on the first response."
    - "One deliberate run = exactly one Merit charge; an accidental resubmit of the same intent does not double-charge (requires the Task 3 server key AND the Task 4 client nonce — neither alone is sufficient)."
    - "Every terminal Career Compass failure refunds the Merit exactly once; no failed run leaves a live charge."
    - "The Career Compass page renders exactly ONE loading UI with one consistent duration claim, and never shows a fabricated 'refunded' message for a run that may still be alive server-side."
    - "A completed analysis persists to analysis_results and reopens correctly via ?id= and via the latest-result restore, with exactly one result row per run."
  artifacts:
    - path: "supabase/functions/_shared/auth.ts"
      provides: "Additive exported resolveTierForUserId(userId) — server-trusted tier lookup for the internal/worker path (profiles.subscription_tier + admin elevation + normalizeActiveTier)"
      contains: "export async function resolveTierForUserId"
    - path: "supabase/functions/_shared/tier-config.ts"
      provides: "Additive 'career' CallType timeout row so a widened career wall cannot leak into 'core'"
      contains: "career: 90_000"
    - path: "supabase/functions/analyze-career/index.ts"
      provides: "Tier-correct live path, getMaxOutput-wired budget, deadline-bounded retry via _shared/ai-retry, truncation-as-terminal-422, all-tier completeness assertion, no entitlement gate, no LinkedIn hard-fail"
      contains: "maxTokens: maxTokensForAnalysis"
    - path: "supabase/functions/_shared/result-merger.ts"
      provides: "CAREER_FREE_ALLOWED_FIELDS reconciled with the shaper (no roadmap/roleRoadmaps for Free)"
      contains: "CAREER_FREE_ALLOWED_FIELDS"
    - path: "supabase/functions/submit-career-analysis-job/index.ts"
      provides: "Idempotency key on the LIVE (non-lifecycle) withMerits charge; career max_attempts lowered; client-supplied tier field removed"
      contains: "idempotencyKey"
    - path: "supabase/functions/process-career-analysis-job/index.ts"
      provides: "Career-local retry classifier where an explicit retryable:false / usage_limit_reached / output_truncated body is terminal"
      contains: "explicitlyPermanent"
    - path: "src/pages/CareerCompass.tsx"
      provides: "normalizeActiveTier gating, single loading UI, honest timeout/error handling, dead prior-gate cleanup, unconditional held attemptNonce"
      contains: "normalizeActiveTier"
    - path: "supabase/functions/analyze-career/__tests__/tier-resolution.test.ts"
      provides: "RED-before regression: internal/worker path resolves the real tier"
    - path: "supabase/functions/analyze-career/__tests__/token-budget.test.ts"
      provides: "RED-before regression: the model call receives getMaxOutput, not 2500/3500; NEW config-level free-<-50%-elite assertion"
    - path: "supabase/functions/analyze-career/__tests__/truncation-refund.test.ts"
      provides: "RED-before regression: stop_reason max_tokens does not persist and does refund; persist-failure 5xx stays retryable"
    - path: "supabase/functions/analyze-career/__tests__/resume-only.test.ts"
      provides: "RED-before regression: a resume-only submit succeeds"
    - path: "supabase/functions/process-career-analysis-job/__tests__/entitlement-not-retryable.test.ts"
      provides: "RED-before regression: an entitlement/usage 429 is not retried as transient; resume worker drift guard"
  key_links:
    - from: "supabase/functions/analyze-career/index.ts"
      to: "supabase/functions/_shared/auth.ts::resolveTierForUserId"
      via: "internal-path tier resolution when userContext is null"
      pattern: "resolveTierForUserId\\("
    - from: "supabase/functions/analyze-career/index.ts"
      to: "_shared/tier-config.ts::getMaxOutput"
      via: "maxTokens argument of the live invokeWithRetry call (the DISCRIMINATING marker — getMaxOutput is ALREADY called at :1710 today and only logged, so a getMaxOutput grep proves nothing)"
      pattern: "maxTokens:\\s*maxTokensForAnalysis"
    - from: "supabase/functions/analyze-career/index.ts"
      to: "_shared/ai-retry.ts::invokeWithRetry"
      via: "deadline-bounded retry loop (replaces the bespoke 3-attempt loop)"
      pattern: "invokeWithRetry\\("
    - from: "supabase/functions/analyze-career/index.ts"
      to: "_shared/anthropic.ts raw.stop_reason"
      via: "truncation detection before JSON repair/persist"
      pattern: "stop_reason"
    - from: "supabase/functions/analyze-career/index.ts"
      to: "CareerIncompleteOutput -> 422"
      via: "narrow catch around assertCareerOutputComplete ONLY (never a broad MeritRefundable catch)"
      pattern: "CareerIncompleteOutput"
    - from: "supabase/functions/submit-career-analysis-job/index.ts"
      to: "_shared/merit-gateway.ts::withMerits"
      via: "idempotencyKey on the live merit ctx"
      pattern: "idempotencyKey,"
    - from: "src/pages/CareerCompass.tsx"
      to: "src/config/pricing-config.ts::normalizeActiveTier"
      via: "tab/tier gating (replaces subscriptionTier === 'elite')"
      pattern: "normalizeActiveTier\\("
---

<objective>
Repair Career Compass end-to-end for the only two live tiers (Free and Elite). Today
100% of Career Compass traffic goes: `CareerCompass.tsx` → `submit-career-analysis-job`
→ `process-career-analysis-job` → `analyze-career` under `x-internal-job-secret`.
`requireInternalAuth()` returns `null`, so `analyze-career` resolves `resolvedTier='free'`
for EVERY user, runs the legacy branch with a hardcoded 2,500-token output budget against
a ~3,000-token schema, truncates, silently `repairTruncatedJSON`-repairs the stub, and
persists it as a SUCCESS. On top of that, a legacy `can_perform_ai_action` gate 429s Free
users permanently and the worker retries that permanent denial 8x, while the merit charge
has no idempotency key and terminal 429s mostly never refund.

Purpose: Elite users must actually get Elite output; Free users must get a complete,
standalone (resume-only) Free result; nobody must ever be charged for a truncated stub.

Output: A tier-correct, budget-correct, truncation-honest, Merit-only-paywalled Career
Compass with regression tests that fail before this change and pass after.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260713-hrd-audit-and-fix-career-compass-for-free-an/260713-hrd-CONTEXT.md
@CLAUDE.md
@TESTING-STRATEGY.md

@supabase/functions/analyze-career/index.ts
@supabase/functions/submit-career-analysis-job/index.ts
@supabase/functions/process-career-analysis-job/index.ts
@supabase/functions/_shared/auth.ts
@supabase/functions/_shared/tier-config.ts
@supabase/functions/_shared/result-merger.ts
@supabase/functions/_shared/merit-gateway.ts
@supabase/functions/_shared/ai-retry.ts
@supabase/functions/_shared/usage-checker.ts
@src/config/pricing-config.ts
@src/pages/CareerCompass.tsx
</context>

<engineering_decisions>
These are RESOLVED. Do not re-litigate them mid-execution.

**ED-1 — Fix the LIVE path; do NOT resurrect the dead merit branch.**
`analyze-career:858` (`if (MERIT_SYSTEM_ENABLED && userContext)`) never executes on the
worker path (userContext is null). Do NOT make it run on the internal path: submit-career
ALREADY charges Merits via `withMerits`, so activating a second `withMerits` inside
analyze-career would DOUBLE-CHARGE. The legacy branch (`:1352`+) is the live path and is
what gets made tier-correct. The dead branch's 412 prior-analysis gates are DELETED (they
contradict the locked Free-standalone decision and would be live-wrong if ever re-enabled).

**ED-2 — Tier stays server-resolved (preserves D-14).** `rawBody.tier` is currently NOT
destructured at `:819` and MUST STAY unread. The fix adds an additive
`resolveTierForUserId(userId)` to `_shared/auth.ts` which reads `profiles.subscription_tier`
under the service client, applies the existing ADMIN_EMAIL elevation, and pipes through
`normalizeActiveTier`. `analyze-career` calls it ONLY when `userContext === null` (i.e. the
internal path) and a payload `userId` is present.

**ED-3 — `_shared/` blast-radius justification (the single biggest regression risk).**
Three `_shared/` files are touched. Each change is ADDITIVE or career-scoped:
- `_shared/auth.ts`: adds a NEW exported function. `requireAuth`, `requireUserAuth`,
  `requireInternalAuth`, `requireInternalOrUserAuth` signatures and bodies are UNCHANGED.
  Resume Analysis / LinkedIn / Recruiting Lens / Onboarding / Goal Readiness import only
  the existing helpers → zero behavior change for them.
- `_shared/tier-config.ts`: adds `'career'` to the `CallType` union and a `career:` cell to
  the `free` and `elite` rows of `TIER_TIMEOUTS`. Every other feature calls
  `getTimeout(tier)` with the default `'core'` callType, and the `core` cells are UNCHANGED
  → a widened career wall cannot leak (this is the exact pattern the 260713-2ay LinkedIn fix
  used with its dedicated `linkedin` CallType).
- `_shared/result-merger.ts`: only `CAREER_FREE_ALLOWED_FIELDS` / `CAREER_PRO_ADDITIONS`
  change. `applyCareerTierShape` is imported ONLY by `analyze-career`, `career-validation.ts`
  and career tests (grep-verified) — the resume/RCL/LinkedIn mergers in the same file are
  untouched.
`_shared/ai-retry.ts` and `_shared/usage-checker.ts` are NOT edited (import-only /
import-removal). `_shared/career-prompts.ts` is NOT edited — the tier-conditional JSON
skeleton this plan changes is the INLINE `systemPrompt` inside `analyze-career/index.ts`
(:1681-1702), not the shared prompt module; leave `_buildProJsonSkeleton` /
`buildFreePriorAnalysesPrompt` / `FREE_SINGLE_CALL_MAX_TOKENS` alone.
`isRetryableHttpStatus` is a LOCAL copy inside `process-career-analysis-job/index.ts`
(grep-verified: separate local copies exist in `process-resume-analysis-job` and
`_shared/analysis-lifecycle.ts`) — editing career's copy cannot change resume/lifecycle retry
semantics.

**ED-4 — The Free/Elite output-budget ladder (this is a live-outage trap).**
`getTimeout('free','core')` is `50_000` ms. Raising Career's output budget to
`getMaxOutput` without a bigger wall would abort mid-generation with a 408 — the EXACT bug
quick task 260713-2ay just fixed for LinkedIn. The proven ladder is reused verbatim:
  per-call 90_000 (`TIER_TIMEOUTS.*.career`) < server deadline 165_000 (request-scoped,
  bounds the retry loop) < client poll 180_000 (`CareerCompass.tsx MAX_POLL_MS`).

Budgets: `maxTokensOutput.careerCompass` free `12000 → 4800`, elite stays `10000`.
Rationale for 4800: Free's scope is now materially SMALLER (no roadmap / roleRoadmaps /
skillGaps / compensation), and CONTEXT measured complete FULL-schema instances at
~2,200–3,041 tokens — so 4800 leaves ~1.6x headroom over a now-narrower schema while roughly
halving Free's cost ceiling.

**The ONLY hard constraint here is the boot invariant at `analyze-career:74-81`**, which
THROWS AT MODULE LOAD if the per-tier `CAREER_CALL_CONFIGS` sum exceeds
`getMaxOutput('careerCompass', tier)`. So `CAREER_CALL_CONFIGS.base.maxTokensFree` MUST drop
from `12000` to `4800` in the SAME commit as the `pricing-config` change, or the function
dies on deploy.

Explicitly NOT a constraint: **there is no config-level GATE-09 gate for `careerCompass`.**
`_shared/tier-validation.test.ts:312` asserts on **measured `raw.usage.output_tokens` from two
LIVE Anthropic calls**, is env-gated behind `RUN_TIER_VALIDATION=1`, and is NOT registered in
`deno.json` `test:ci` — it never reads `maxTokensOutput` and cannot go red either way. Today's
12000/10000 does NOT violate it (proof: `linkedinGrader` ships `free: 12000 / elite: 9000` —
133% — and boots fine). The only real config boot gate of that family is
`analyze-resume/index.ts:375-377`, which is resume-scoped. Task 5 INTRODUCES a new
config-level free-<-50%-of-elite assertion for `careerCompass`; it is not reusing an existing
invariant.

**ED-5 — Truncation is a terminal, non-retryable, refundable failure — and the mapping must be NARROW.**
`invokeAnthropicText` returns the full Anthropic response as `raw`, so
`raw.stop_reason === 'max_tokens'` is a direct signal. Detect it BEFORE
`repairTruncatedJSON` and fail with HTTP **422** + body `{ error: 'output_truncated',
retryable: false }`. 422 is deliberately chosen because it is NOT in the career worker's
`isRetryableHttpStatus` list, so the worker terminally fails the job and refunds exactly once
via the existing `refundMeritsForJob(job.merit_transaction_id)` path. Do NOT use 500 — 5xx IS
retryable and a temperature-0 truncation is deterministic, so it would burn 8 retries.

**CRITICAL SCOPING: `MeritRefundable(500, …)` is NOT unique to the completeness assertion.**
`persistCareerResultAndRecordUsage` throws `MeritRefundable(500, 'Could not save career
analysis history.')` at `:333` (invoked on the legacy path at `:1922` and `:1971`), and the
DOCX/OCR extraction helpers throw it at `:1163` / `:1204`. A broad
`catch (e) { if (e instanceof MeritRefundable) return 422 }` would misclassify a **transient DB
save blip** as a deterministic permanent failure → terminally failed + refunded instead of
retried. The 422 mapping MUST be scoped to the completeness assertion ALONE (a distinct
`CareerIncompleteOutput` error type, or a catch wrapped narrowly around the
`assertCareerOutputComplete(...)` call site). Every other `MeritRefundable(500)` KEEPS its
existing retryable 5xx semantics.

**ED-6 — Free = STANDALONE. Priors are enrichment, never a gate.** The already-live
`readPersistedLinkedInText()` auto-reuses a previously-saved LinkedIn PDF when present; that
IS the "reuse when available" enrichment. No prior Resume Analysis or LinkedIn Grade is ever
required. All three gates die: the 412 `missing_prior_analyses`, the 412
`linkedin_prior_missing`, and the 400 `LinkedIn PDF content is required`.

**ED-7 — Every task leaves the gate green (Rule-1 stale-guard reconciliation is INLINE).**
Each task reconciles the guards IT breaks, in its own commit, rather than deferring them to a
trailing cleanup task. `deno.json` is the ONE exception: Task 5 owns every registration edit so
that file has a single writer.

**ED-8 — Known, accepted worker wall-clock shape (pre-existing; note, do not fix here).**
`process-career-analysis-job:153` fetches `analyze-career` with NO `AbortSignal`, `batchSize`
defaults to 2, and jobs run sequentially — so a 165s server deadline means up to ~330s of
worker wall-clock for a full batch. This is the same shape the shipped `grade-linkedin` 165s
precedent already runs under. Lowering career `max_attempts` 8→2 (Task 3) shrinks the worst
case substantially. Restructuring the worker is out of scope here.
</engineering_decisions>

<tasks>

<task type="auto">
  <name>Task 1: Resolve the real tier on the live worker path and wire the real token budget + timeout ladder</name>
  <files>
supabase/functions/_shared/auth.ts
supabase/functions/_shared/tier-config.ts
src/config/pricing-config.ts
supabase/functions/analyze-career/index.ts
supabase/functions/analyze-career/index.test.ts
supabase/functions/analyze-career/failure-branches.test.ts
  </files>
  <action>
Closes RC-1 and RC-2. This is the load-bearing task — everything else is downstream of it.

1. `_shared/auth.ts` — ADD (do not modify anything existing):
   ```ts
   /**
    * Server-trusted tier resolution for the INTERNAL/worker path, where there is no JWT
    * and `requireInternalAuth` returns null. Never accepts a client-supplied tier (D-14).
    * Mirrors requireUserAuth's tier logic exactly: ADMIN_EMAIL -> 'elite', else
    * normalizeActiveTier(profiles.subscription_tier). Fails closed to 'free'.
    */
   export async function resolveTierForUserId(userId: string): Promise<'free' | 'elite'>
   ```
   Implement with `getServiceClient().from('profiles').select('email, subscription_tier').eq('id', userId).maybeSingle()`.
   On error / missing row: `log.warn('internal-tier-resolution-failed', { userId })` and return `'free'`.

2. `_shared/tier-config.ts` — extend `CallType` to `'core' | 'elite-preview' | 'quiz' | 'linkedin' | 'career'`
   and add `career: 90_000` to BOTH the `free` and `elite` rows of `TIER_TIMEOUTS`. Do NOT touch any
   existing `core` value. Copy the LinkedIn doc-comment pattern: state the budget invariant
   (client 180_000 > server 165_000 > per-call 90_000) and that a dedicated CallType means the
   widened wall cannot leak into any feature reading `core`.

3. `src/config/pricing-config.ts` — in `maxTokensOutput`, change `careerCompass.free` from
   `12000` to `4800` (elite/pro stay `10000`). Update the TEMP(260608-p5k) comment to record that
   Career Compass Free was right-sized after this task narrowed the Free scope (measured full-schema
   instances were ~2,200–3,041 tokens; the new Free schema is smaller still).

4. `supabase/functions/analyze-career/index.ts`:
   a. `CAREER_CALL_CONFIGS`: `base.maxTokensFree` `12000 → 4800`. **This is mandatory and must land
      in the SAME commit as step 3** — the boot invariant at `:74-81` compares the per-tier sum
      against `getMaxOutput` and will THROW at module load otherwise, killing the function.
   b. Replace the `resolvedTier` derivation at :835-842 with:
      - if `userContext` → keep today's behavior (already normalized by `requireUserAuth`);
      - else if the request is internally authenticated AND `effectiveUserId` is a string →
        `resolvedTier = await resolveTierForUserId(effectiveUserId)`;
      - else `'free'`.
      Keep `isElite = resolvedTier === 'elite'`. Do NOT destructure or read `rawBody.tier` —
      the `:819` destructure must stay tier-free (D-14).
      Log `log.info('tier-resolved', { userId: effectiveUserId, tier: resolvedTier, source: userContext ? 'jwt' : 'internal-db' })`.
   c. Legacy path AI call (:1717-1820): DELETE the bespoke 3-attempt `for` loop and the hardcoded
      `maxTokens: isElite ? 3500 : 2500`. Replace with `invokeWithRetry` from `_shared/ai-retry.ts`
      (already used by grade-linkedin; import only, do not edit it), passing:
      `maxTokens: maxTokensForAnalysis` — the ALREADY-COMPUTED `getMaxOutput('careerCompass',
      resolvedTier)` at :1710, which today is computed and only LOGGED, never passed (so a
      `getMaxOutput` grep proves nothing; `maxTokens: maxTokensForAnalysis` is the discriminating
      marker) — plus `timeoutMs: getTimeout(resolvedTier as Tier, 'career')` and a request-scoped
      `{ deadlineAt }` where `const CAREER_TOTAL_DEADLINE_MS = 165_000` and
      `deadlineAt = Date.now() + CAREER_TOTAL_DEADLINE_MS` is minted ONCE per request (mirror
      grade-linkedin/index.ts:52,285-287). The ANTHROPIC_MODEL_FALLBACK candidate loop is preserved.
   d. Keep the existing `[PERF] out=` logging so the budget can be re-tuned from real data.

5. **Rule-1 reconciliation (ED-7) — these guards encode the old 12000 literal and WILL go red:**
   - `analyze-career/index.test.ts:34` — mirrored config literal `maxTokensFree: 12000` → `4800`.
   - `analyze-career/index.test.ts:60` — test NAME contains `(12000)` → `(4800)`.
   - `analyze-career/index.test.ts:62` — **`assertEquals(sum, 12000)` → `assertEquals(sum, 4800)`**
     (hard assertion). KEEP `assertEquals(sum <= ceilingFor('free'), true)` — that is the
     load-bearing one. The Elite test (`sum === ceilingFor('elite') === 10000`) is UNCHANGED.
   - `analyze-career/failure-branches.test.ts:54` — mirrored `maxTokensFree: 12000` → `4800`.
   - `analyze-career/failure-branches.test.ts:226` — comment referencing the 12000 ceiling → 4800.

Do NOT touch the multi-role comparison sub-path, the dead merit branch's AI calls, or any other
feature's timeouts.
  </action>
  <verify>
`grep -n "isElite ? 3500 : 2500" supabase/functions/analyze-career/index.ts` returns NOTHING.
`grep -n "maxTokens: maxTokensForAnalysis" supabase/functions/analyze-career/index.ts` returns a hit.
`grep -n "resolveTierForUserId" supabase/functions/analyze-career/index.ts` returns a hit.
`grep -rn "rawBody.tier\|requestBody.tier\|body.tier" supabase/functions/analyze-career/index.ts` returns NOTHING.
`grep -rn "12000" supabase/functions/analyze-career/` returns NOTHING.
`grep -n "core: 50_000" supabase/functions/_shared/tier-config.ts` STILL returns a hit (no-leak proof).
`npm run test:edge` → 0 failures (the boot invariant does not throw; index.test.ts + failure-branches.test.ts green).
`npm run test` → 0 failures. REQUIRED because this task edits `src/config/pricing-config.ts`; `test:edge` alone cannot prove the vitest side is green, and ED-7 guarantees every task leaves the gate green at its OWN commit.
  </verify>
  <done>
`analyze-career` resolves 'elite' for an Elite user on the internal/worker path, passes
`getMaxOutput('careerCompass', tier)` (free 4800 / elite 10000) to the model, runs under a
90s per-call wall inside a 165s request deadline, never reads a client-supplied tier, and the
edge suite is green.
  </done>
</task>

<task type="auto">
  <name>Task 2: Make truncation a terminal 422, assert completeness for ALL tiers, and make Free standalone</name>
  <files>
supabase/functions/analyze-career/index.ts
supabase/functions/_shared/result-merger.ts
supabase/functions/analyze-career/paid-output-validation.test.ts
supabase/functions/analyze-career/cache.test.ts
supabase/functions/_shared/career-shape.test.ts
supabase/functions/analyze-career/__tests__/byte-preserve.test.ts
  </files>
  <action>
Closes RC-7, the operator truncation directive, and locked decisions #3/#5/#6. Depends on Task 1
(the budget must be correct before completeness can be honestly asserted).

1. **Truncation detection (ED-5).** In `analyze-career`, immediately after every live
   `invokeWithRetry`/`invokeAnthropicText` success and BEFORE `repairTruncatedJSON` is called on
   its text, check `(aiResponse.raw as { stop_reason?: string })?.stop_reason === 'max_tokens'`.
   If true: `log.error('output-truncated', { tier: resolvedTier, maxTokens: maxTokensForAnalysis, outLen: text.length })`
   and return HTTP **422** with body `{ error: 'output_truncated', message: 'The analysis was cut
   short. Your Merits have been refunded — please try again.', retryable: false }`.
   Apply the same check on the dead-branch call sites too (cheap, keeps them honest if ever revived).
   NOTE: mock/fixture mode sets `raw = { mock: true, ... }` with no `stop_reason`, so tests and
   AI_TEST_MODE are unaffected.

2. **Tier-aware completeness for ALL tiers — with a NARROW 422 mapping (ED-5).**
   - `CAREER_CORE_SECTION_CHECKS` (`:86-93`) currently has SIX entries and has **no `careerDNA`
     check and no `skillGaps` check**. You must ADD both — the Free required set needs `careerDNA`
     (must_haves truth #6) and the Elite set needs `skillGaps`:
     `{ key: 'careerDNA', label: 'Career DNA', present: d => typeof d.careerDNA === 'string' && d.careerDNA.trim().length > 0 }`
     and `{ key: 'skillGaps', label: 'Skill Gaps', present: d => hasNonEmptyArray(d.skillGaps) }`.
   - Rename `assertPaidCareerOutputComplete` → `assertCareerOutputComplete` (and
     `getMissingPaidCareerSections` → `getMissingCareerSections`) and DELETE the
     `if (tier === 'free') return;` early-return. Make the required set tier-aware:
     - free  → Career DNA, Fields (careerFields), Roles, Surprise Fits, Readiness
     - elite → the free set + Roadmap (roadmap OR roleRoadmaps) + Skill Gaps
   - It must still run BEFORE `persistCareerResultAndRecordUsage` and before any cache write
     (the ordering assertions in `paid-output-validation.test.ts` encode this — keep them true).
   - **Introduce a distinct `class CareerIncompleteOutput extends Error`** (or catch narrowly
     around the `assertCareerOutputComplete(...)` call site) and map ONLY that to HTTP **422**
     `{ error: 'incomplete_output', retryable: false }` in the legacy tail. **DO NOT write a broad
     `catch (e) { if (e instanceof MeritRefundable) return 422 }`** — `MeritRefundable(500)` is also
     thrown by `persistCareerResultAndRecordUsage:333` (a transient DB save blip) and by the
     DOCX/OCR helpers at `:1163`/`:1204`; those MUST keep their existing retryable 5xx semantics or
     a recoverable save failure becomes a terminal refund.

3. **Free output shape — make the prompt and the whitelist agree.**
   - `_shared/result-merger.ts`: remove `'roadmap'` and `'roleRoadmaps'` from
     `CAREER_FREE_ALLOWED_FIELDS`, and add them to `CAREER_PRO_ADDITIONS` so Pro/Elite keep them.
     This resolves the standing contradiction (the whitelist ALLOWED them while the shaper's free
     branch DELETED them) in favour of the locked Free scope. The free-branch `delete data.roadmap;
     delete data.roleRoadmaps;` slicing block stays (defense-in-depth). Free stays: careerFields
     sliced to 3, roles to 3, surpriseFits to 2, roleReadinessBreakdown trimmed to
     `{overallScore, targetRole}`. Do NOT strip the nested `careerFields[].salaryRange` — the
     locked "no salary insights" scope refers to the `compensationIntelligence` section, which is
     already Elite-only.
   - The INLINE legacy system prompt (`analyze-career/index.ts:1681-1702` — NOT
     `_shared/career-prompts.ts`) currently asks EVERY tier for the full skeleton (roadmap +
     roleRoadmaps + skillGaps) and then throws it away for Free — that is what forced ~3,000 tokens
     through a 2,500 cap. Build the JSON skeleton and the BREVITY block conditionally on `isElite`:
     - Free skeleton: detectedDomain, domainEvidence, roleReadinessScore, targetRole, careerDNA,
       whatYouHave, roleReadinessBreakdown, careerFields (3), surpriseFits (2), roles (3).
     - Elite skeleton: the above + skillGaps + roleRoadmaps + roadmap + compensationIntelligence.
     Replace the hardcoded `BREVITY CRITICAL — keep ENTIRE response under 3500 tokens` line with a
     budget derived from `maxTokensForAnalysis` so the prompt can never again contradict the cap.

4. **Free = STANDALONE (ED-6).** Delete, in `analyze-career/index.ts`:
   - the 400 `'LinkedIn PDF content is required'` gate (:1380-1385);
   - the 400 `'Unable to extract text from your LinkedIn PDF.'` gate (:1221-1223) — LinkedIn is now
     purely optional and `profileContent` already has a `(not provided — analyze from resume only)`
     branch;
   - the 412 `missing_prior_analyses` block and the 412 `linkedin_prior_missing` block in the dead
     merit branch (:912-951) plus the merit-branch 400 `'LinkedIn PDF content is required'` (:967-972).
   KEEP the 400 `'Resume file is required'` and the 400 `'Unable to extract text from your resume.'`
   gates — a resume is still required. KEEP `readPersistedLinkedInText` (optional enrichment).
   `allowResumeOnly` becomes a no-op input; leave the payload field accepted for wire compat but
   stop branching on it.

5. **Rule-1 reconciliation (ED-7):**
   - `paid-output-validation.test.ts` — it asserts `source.includes("if (tier === 'free') return;")`
     and pins `getMissingPaidCareerSections` plus **exactly six** section labels. Invert/extend:
     the free early-return must be ABSENT, completeness must be tier-aware, the helper names become
     `assertCareerOutputComplete` / `getMissingCareerSections`, and the label set becomes EIGHT
     entries (the six existing + Career DNA + Skill Gaps). Preserve the
     validation-runs-before-persist ordering assertions verbatim — they are load-bearing.
   - `_shared/career-shape.test.ts` — CC-01 (Free omits roadmap/roleRoadmaps) should still PASS
     unchanged; ADD an assertion that `CAREER_FREE_ALLOWED_FIELDS` no longer LISTS them (the
     whitelist/shaper contradiction is now resolved) and that Elite still keeps them.
   - `analyze-career/__tests__/byte-preserve.test.ts` — update the golden Free fixture to the locked
     Free scope (no roadmap/roleRoadmaps/skillGaps) and confirm it still deep-equals after
     validation. Pro/Elite goldens stay.
   - `analyze-career/cache.test.ts` — **THIS TASK BREAKS IT AND MUST FIX IT.** Line 43 probes the
     source with `source.indexOf("assertPaidCareerOutputComplete(analysisResult")`; the §2 rename
     makes that return `-1` and the `assert(validation > -1)` / ordering assertions fail. Update the
     probe to `assertCareerOutputComplete(analysisResult`. This suite is NOT yet registered in
     `deno.json test:ci` (Task 5 registers it), so `npm run test:edge` will NOT catch the break —
     run it explicitly:
     `cd supabase/functions && deno test --allow-all --no-check analyze-career/cache.test.ts`.
     Lines 36/65/90 also pin `allowResumeOnly` as a cache-key input. DISPOSITION (decide and state
     it in the SUMMARY): KEEP `allowResumeOnly` in the cache-key input set. It is now behaviourally
     a no-op (§4 stops branching on it), but removing it from the key would be a gratuitous
     cache-identity change and would break three further assertions for no benefit. Keeping it means
     an old client still sending `allowResumeOnly: true` simply keys to a different (equally valid)
     cache entry. Do NOT remove it.
  </action>
  <verify>
`grep -n "if (tier === 'free') return;" supabase/functions/analyze-career/index.ts` returns NOTHING.
`grep -rn "LinkedIn PDF content is required\|missing_prior_analyses\|linkedin_prior_missing" supabase/functions/analyze-career/index.ts` returns NOTHING.
`grep -n "stop_reason" supabase/functions/analyze-career/index.ts` returns hits ordered BEFORE the first `repairTruncatedJSON` call.
`grep -n "CareerIncompleteOutput" supabase/functions/analyze-career/index.ts` returns a hit; NO `catch` maps a bare `MeritRefundable` to 422.
`grep -n "'roadmap'" supabase/functions/_shared/result-merger.ts` shows it in CAREER_PRO_ADDITIONS, not CAREER_FREE_ALLOWED_FIELDS.
`grep -n "Career DNA\|Skill Gaps" supabase/functions/analyze-career/index.ts` shows both new CAREER_CORE_SECTION_CHECKS entries.
`grep -rn "assertPaidCareerOutputComplete" supabase/functions/` returns NOTHING (the rename is complete — including the `cache.test.ts:43` source probe, which `npm run test:edge` CANNOT catch because that suite is not yet registered).
`cd supabase/functions && deno test --allow-all --no-check analyze-career/cache.test.ts analyze-career/paid-output-validation.test.ts` → 0 failures (both are still UNREGISTERED at this commit; Task 5 registers them, so they MUST be run explicitly here or their breakage stays invisible).
`npm run test:edge` → 0 failures.
  </verify>
  <done>
A `stop_reason: 'max_tokens'` response returns a terminal 422 and never reaches
`persistCareerResultAndRecordUsage`; an incomplete result is rejected at every tier including Free
via a NARROW `CareerIncompleteOutput` → 422 mapping that leaves every other `MeritRefundable(500)`
retryable; a resume-only run has no gate left to hit; and the Free prompt, the Free whitelist and the
Free shaper all describe the same output.
  </done>
</task>

<task type="auto">
  <name>Task 3: Merits become the only paywall — remove the legacy entitlement gate, add charge idempotency, guarantee one refund</name>
  <files>
supabase/functions/analyze-career/index.ts
supabase/functions/submit-career-analysis-job/index.ts
supabase/functions/process-career-analysis-job/index.ts
supabase/functions/submit-career-analysis-job/job-contract.test.ts
supabase/functions/process-career-analysis-job/__tests__/refund-on-failure.test.ts
  </files>
  <action>
Closes RC-3 and the SERVER half of RC-4. **The CLIENT half of RC-4 (minting and HOLDING a stable
`attemptNonce`) lands in Task 4** — `CareerCompass.tsx:660` currently sends
`attemptNonce: lifecycleOn ? crypto.randomUUID() : undefined` and `lifecycleOn` is FALSE for career,
so the server sees `undefined` and its fallback mints a fresh key per request. The end-to-end
"one run = one charge" truth is only achieved once BOTH Task 3 and Task 4 land.

1. **Remove the legacy entitlement gate (locked).** In `analyze-career/index.ts:1363-1370`, delete
   the `checkEntitlement` → `createUsageLimitResponse` block entirely. Drop `checkEntitlement` and
   `createUsageLimitResponse` from the `_shared/usage-checker.ts` import; KEEP
   `recordUsageWithAnalysis` — `persistCareerResultAndRecordUsage` must keep writing the
   `usage_tracking` row for History/analytics (record, never block). Leave
   `_shared/usage-checker.ts` itself UNCHANGED (other features still gate on it).

2. **Idempotent charging on the LIVE submit path.** `submit-career-analysis-job` only threads an
   `idempotencyKey` inside the `isAnalysisFeatureEnabled('career_compass')` branch, which is OFF —
   so the live `withMerits(...)` at :274 charges with `p_idempotency_key = NULL` every time. Fix:
   - Accept `body.attemptNonce` (string) on the live path; fall back to `crypto.randomUUID()`
     (the fallback exists only for non-browser callers — the browser supplies it after Task 4).
   - Derive `inputIdentity` with the EXISTING `buildCareerInputIdentity(...)` helper, at the user's
     REAL tier (`authenticatedUserCtxCareer.tier`), then `deriveIdempotencyKey({ userId, feature:
     'career_compass', tier, inputIdentity, attemptNonce })`.
   - Pass `idempotencyKey` in the `withMerits` ctx at :275. `merit-gateway.ts:217` already forwards
     `p_idempotency_key`, so the 4-arg `check_and_deduct_merits` dedupes — repeating the same key
     replays `already_deducted` instead of charging again. No `_shared/` change needed.
   - Forward `attemptNonce` into the enqueued `innerPayload` so the whole run shares one identity.
   - **Lower career `max_attempts` from `8` to `2` at BOTH sites**: `:300` (the live
     MERIT_SYSTEM_ENABLED insert — the one that matters) and `:391` (the MERIT_SYSTEM_ENABLED=false
     legacy fallback, dead in prod but kept consistent so the grep-verify is unambiguous and a
     future flag flip cannot resurrect the 8x retry storm).
   - **Hygiene (D-14 surface):** delete the client-supplied
     `tier: typeof body.tier === "string" ? body.tier : "free"` field from all three payload builders
     (`:171`, `:284`, `:353`). `analyze-career` never reads it (Task 1 keeps it that way), so it is
     dead weight on a tier-sensitive path.
   - KEEP the pre-`withMerits` "existing active job" reuse check — it is the two-tab / double-click
     guard that returns the in-flight job WITHOUT charging.

3. **Entitlement/usage 429 is never transient (RC-3, scoped).** In
   `process-career-analysis-job/index.ts` — `isRetryableHttpStatus` here is a LOCAL copy;
   `process-resume-analysis-job` and `_shared/analysis-lifecycle.ts` have their own, so this change
   CANNOT ripple to other features:
   - Make an explicit body signal win over the status heuristic:
     ```ts
     const explicitlyPermanent =
       responseBody?.retryable === false ||
       responseBody?.error === 'usage_limit_reached' ||
       responseBody?.error === 'output_truncated' ||
       responseBody?.error === 'incomplete_output';
     const retryable = explicitlyPermanent ? false : (retryableFromBody || retryableFromStatus);
     ```
   - Extend `permanentCodeForStatus` so 422 maps to `'OUTPUT_TRUNCATED'` rather than
     `'FILE_EXTRACTION_FAILED'` (used only on the dormant lifecycle branch, but keep it honest).
   - The existing refund-before-`status='failed'` block already fires on this terminal branch, so a
     truncated / entitlement-denied / incomplete run now refunds exactly once on the FIRST response
     instead of after 8 retries or never.
   - Add a comment recording that this classifier is career-local BY DESIGN (ED-3).

4. **Rule-1 reconciliation (ED-7):** update `submit-career-analysis-job/job-contract.test.ts` and
   `process-career-analysis-job/__tests__/refund-on-failure.test.ts` if (and only if) they encode
   `max_attempts: 8`, the `tier:` payload field, or the old retry classifier.
  </action>
  <verify>
`grep -n "checkEntitlement\|createUsageLimitResponse" supabase/functions/analyze-career/index.ts` returns NOTHING.
`grep -n "recordUsageWithAnalysis" supabase/functions/analyze-career/index.ts` still returns a hit.
`grep -n "idempotencyKey" supabase/functions/submit-career-analysis-job/index.ts` shows it inside the LIVE (non-lifecycle) withMerits ctx, not only the dormant branch.
`grep -c "max_attempts: 8" supabase/functions/submit-career-analysis-job/index.ts` → 0.
`grep -n "body.tier" supabase/functions/submit-career-analysis-job/index.ts` returns NOTHING.
`grep -n "explicitlyPermanent" supabase/functions/process-career-analysis-job/index.ts` returns a hit.
`git diff --stat supabase/functions/_shared/usage-checker.ts supabase/functions/process-resume-analysis-job/` is EMPTY (no ripple).
`npm run test:edge` → 0 failures.
  </verify>
  <done>
`can_perform_ai_action` no longer blocks Career Compass; `usage_tracking` still records; the server
derives and honors a stable idempotency key so a repeated submit carrying the SAME `attemptNonce`
deducts exactly once; and an entitlement/usage/truncation failure fails terminally on the first
response and refunds exactly once. (End-to-end no-double-charge needs Task 4's client nonce.)
  </done>
</task>

<task type="auto">
  <name>Task 4: Frontend — normalize the tier, hold the nonce, one honest loading UI, honest errors, remove the dead prior-gates</name>
  <files>
src/pages/CareerCompass.tsx
src/pages/__tests__/CareerCompass.recovery.test.tsx
  </files>
  <action>
Closes RC-5, RC-6, the CLIENT half of RC-4, and locked decisions #7/#9/#10. Preserve the existing
Strivo design — this is a correctness + honesty pass, NOT a redesign. Do not restyle unrelated UI.

1. **No Pro (locked).** Import `normalizeActiveTier` from `@/config/pricing-config` and apply it:
   `const subscriptionTier = normalizeActiveTier(getEffectiveTier(realSubscriptionTier || "free"))`.
   Then replace EVERY literal `subscriptionTier === "elite"` gate (the `grid-cols-7`/`grid-cols-2`
   TabsList at :1293, the tab visibility at :1300+, and the `getMissingCareerSections` call path at
   :138-150) with the normalized value so a saved `pro` row gets the Elite experience.

2. **Close the RC-4 client half: mint and HOLD the attemptNonce.** Replace
   `attemptNonce: lifecycleOn ? crypto.randomUUID() : undefined` (:660) with an UNCONDITIONAL nonce
   held in a `useRef`, regenerated ONLY on a deliberate new run (inputs change, or after a terminal
   outcome — success or failure). An accidental resubmit of the same intent therefore reuses the
   nonce → Task 3's server derives the SAME idempotency key → `already_deducted` → one charge.

3. **Exactly ONE loading UI (RC-6).** The page renders `<UniversalAnalyzing … subtitle="This usually
   takes about a minute" expectedDurationMs={60000}>` AND, simultaneously, an inline step-list +
   progress bar behind `{loading && (…)}` at :1134-1192 claiming "about 20 seconds".
   DELETE the inline block (:1134-1192) and keep `UniversalAnalyzing` as the single overlay. Align its
   copy with the real ladder: subtitle "This usually takes 1-2 minutes" and
   `expectedDurationMs={120000}`. Remove the now-orphaned `progress` state / `setProgress` /
   `progressInterval` that fed ONLY the deleted block (`UniversalAnalyzing` owns its own animation).

4. **Honest poll deadline + honest failure (RC-6, ED-4).** Keep `MAX_POLL_MS = 180000` (it now sits
   ABOVE the 165s server deadline, so the client no longer gives up while the server is still
   working). On deadline expiry the client must NOT fabricate a failure:
   - first call the existing `hydrateLatestCareerResult(user.id)` — if a result landed, render it,
     `settle.commit()`, and toast success (mirrors the LinkedIn 260713-2ay "recover a landed grade"
     fix);
   - if nothing landed, do NOT `settle.rollback()` (the charge is real and the run may still be
     alive). Instead `invalidateMerits()` so the balance re-reads from the server, and toast:
     "Still running — we'll email you when it's ready. You can also check History."
   `settle.rollback()` stays ONLY on genuine terminal `status === 'failed'` responses.

5. **Specific, actionable errors.** Map the new terminal codes in the `status === 'failed'` handler:
   `output_truncated` / `incomplete_output` → "The analysis came back incomplete. Your Merits were
   refunded — please try again." `usage_limit_reached` no longer occurs for Career Compass; delete its
   handling from BOTH the submit-error branch (:695-702) and the poll-failed branch (:829). Keep the
   shared `getMeritErrorMessage` taxonomy for everything else.

6. **Delete the now-dead / contradictory prior-analysis gates.** With the backend 412s gone these are
   unreachable and actively lie to the user:
   - the `missingPrior` state + the "Run these first to unlock Career Compass" `<Card>` banner
     (:918-954) + both `missing_prior_analyses` handlers;
   - the `linkedinPriorMissingOpen` state + its `<Dialog>` (:1442+) + both `linkedin_prior_missing`
     handlers + the `handleAnalyze({ allowResumeOnly: true })` resubmit CTA and the `allowResumeOnly`
     opt-in plumbing;
   - flip the resume `PriorSelectorEmptyState` from `blocking` to `blocking={false}` — a prior Resume
     Analysis is NOT required (Free is standalone). Keep both selectors as optional-enrichment pickers
     with their existing styling.

7. **Persistence.** Verify (and keep) the `?id=` restore `useEffect` (:380-405) and the
   `hydrateLatestCareerResult` latest-result restore. Do not add a second write path — the server
   inserts exactly one `analysis_results` row per run.

8. **Rule-1 reconciliation (ED-7):** update `src/pages/__tests__/CareerCompass.recovery.test.tsx` if
   it asserts on any removed element (the inline step list, the missingPrior banner, the dialog).
  </action>
  <verify>
`npm run lint` → 0 errors.
`npm run build` → exit 0.
`grep -n "subscriptionTier === \"elite\"" src/pages/CareerCompass.tsx` returns NOTHING.
`grep -rn "missingPrior\|linkedinPriorMissingOpen\|allowResumeOnly" src/pages/CareerCompass.tsx` returns NOTHING.
`grep -n "about 20 seconds" src/pages/CareerCompass.tsx` returns NOTHING.
`grep -n "lifecycleOn ? crypto.randomUUID() : undefined" src/pages/CareerCompass.tsx` returns NOTHING.
`grep -c "UniversalAnalyzing" src/pages/CareerCompass.tsx` shows the import + exactly ONE render site.
`npm run test` → 0 failures.
  </verify>
  <done>
A `pro` user sees 7 tabs; a resubmit of the same intent reuses the held nonce (closing the RC-4
end-to-end no-double-charge truth together with Task 3); there is exactly one loading overlay with one
duration claim; a client-side poll timeout recovers a landed result or tells the truth instead of
faking a refund; and no UI element claims a prior analysis is required.
  </done>
</task>

<task type="auto">
  <name>Task 5: Five new regression guards, registered in test:ci, proven RED-before / GREEN-after, then green the blocking gate</name>
  <files>
supabase/functions/analyze-career/__tests__/tier-resolution.test.ts
supabase/functions/analyze-career/__tests__/token-budget.test.ts
supabase/functions/analyze-career/__tests__/truncation-refund.test.ts
supabase/functions/analyze-career/__tests__/resume-only.test.ts
supabase/functions/process-career-analysis-job/__tests__/entitlement-not-retryable.test.ts
supabase/functions/deno.json
src/pages/__tests__/CareerCompass.recovery.test.tsx
  </files>
  <action>
Tasks 1-4 already reconciled the guards they broke (ED-7), so this task is purely NEW coverage +
registration + the gate. Every new guard must be demonstrated RED at the pre-task commit and GREEN
after; record the RED evidence (command + failing assertion) in the SUMMARY — a guard that was never
red proves nothing.

1. **New Deno regression suites** (offline, deterministic; follow the existing static-source +
   behavioral style already used in `analyze-career/__tests__/`):
   - `tier-resolution.test.ts` — (a) `_shared/auth.ts` exports `resolveTierForUserId` and it applies
     `normalizeActiveTier` + the ADMIN_EMAIL elevation; (b) `analyze-career` calls it on the
     `userContext === null` branch; (c) fail-closed source guard: `analyze-career` NEVER reads
     `body.tier`/`rawBody.tier`/`requestBody.tier`. Drive the resolver against a stubbed service
     client returning `subscription_tier: 'elite'` → `'elite'`, and `'pro'` → `'elite'`.
   - `token-budget.test.ts` — the literal `isElite ? 3500 : 2500` is absent; the live call's
     `maxTokens` is `maxTokensForAnalysis`; `getMaxOutput('careerCompass','free') === 4800` and
     `'elite' === 10000`; `CAREER_CALL_CONFIGS.base.maxTokensFree` equals the free ceiling (so the
     boot invariant cannot throw); and `TIER_TIMEOUTS.free.career === TIER_TIMEOUTS.elite.career ===
     90_000` while `TIER_TIMEOUTS.free.core` is UNCHANGED at `50_000` (the no-leak proof for ED-3).
     **This suite INTRODUCES a NEW config-level `free < 50% of elite` assertion for `careerCompass`
     — it is NOT reusing an existing invariant.** Add a comment stating that
     `_shared/tier-validation.test.ts:312` is a DIFFERENT thing: it asserts on MEASURED live-Anthropic
     `raw.usage.output_tokens`, is env-gated behind `RUN_TIER_VALIDATION=1`, and is not in `test:ci`
     — so it neither passes nor fails on config values, and a future reader must not conflate the two.
   - `truncation-refund.test.ts` — a fake `invokeAnthropicText` result with
     `raw: { stop_reason: 'max_tokens' }` produces a 422 `output_truncated` non-retryable response;
     assert by source-order that the `stop_reason` check precedes the first `repairTruncatedJSON` AND
     that `persistCareerResultAndRecordUsage` is unreachable on that branch. Assert
     `assertCareerOutputComplete` has NO free early-return and rejects a free result missing
     `careerFields`. **Add the ED-5 containment assertion:** the 422 mapping is bound to
     `CareerIncompleteOutput` ONLY — a `MeritRefundable(500)` from `persistCareerResultAndRecordUsage`
     still surfaces as a RETRYABLE 5xx. This is the guard that stops a future refactor from turning a
     transient save blip into a terminal refund.
   - `resume-only.test.ts` — the three deleted gates are absent from source
     (`LinkedIn PDF content is required`, `missing_prior_analyses`, `linkedin_prior_missing`), and a
     resume-only input reaches the model call (drive the core with `linkedinPdfContent: ''`, assert the
     `(not provided — analyze from resume only)` prompt branch is taken and no 4xx is returned).
   - `process-career-analysis-job/__tests__/entitlement-not-retryable.test.ts` — a 429
     `usage_limit_reached` body and a 422 `output_truncated` body each classify as NON-retryable
     (terminal + refund), while a 503/529 still classifies as retryable. Assert `refundMeritsForJob` is
     on the terminal branch. Include a DRIFT GUARD that `process-resume-analysis-job/index.ts` still
     treats 429 as retryable (proves the change did not ripple — ED-3).

2. **Register in `supabase/functions/deno.json` `test:ci`** (append; do NOT reorder or drop anything):
   the five new suites, PLUS the two career suites that were never registered and therefore, by the
   Pitfall-12 rule, "do not exist" and protect nothing today:
   `analyze-career/paid-output-validation.test.ts` and `analyze-career/cache.test.ts`.
   Task 2 reconciled BOTH of these (they are in Task 2's `<files>` and its §5 Rule-1 list), so both
   are green at Task 2's commit. Registering them here is what finally puts them inside
   `verify:baseline`. Do NOT assume they are green — run them before registering; if either is red,
   that is a Task 2 defect to fix, NOT a pre-existing red to absorb.

3. **Frontend vitest** — extend `src/pages/__tests__/CareerCompass.recovery.test.tsx` (or add a sibling
   suite): (a) a `pro` tier renders the 7-tab Elite TabsList; (b) exactly one loading surface renders
   while `loading` is true (the "about 20 seconds" string is gone; `UniversalAnalyzing` renders once);
   (c) a poll timeout with a landed result hydrates and commits instead of rolling back; (d) no
   `missingPrior` banner / `linkedin_prior_missing` dialog can render; (e) `attemptNonce` is sent
   unconditionally and is STABLE across a resubmit of the same intent.

4. **Green the blocking gate.** Run `npm run verify:baseline` (vitest + offline-deno + Playwright) and
   get it GREEN. If a pre-existing red is encountered, prove it is pre-existing by re-running the same
   suite at the pre-task commit and record that in the SUMMARY — do NOT absorb someone else's failure
   into this task, and do NOT weaken an assertion to green the gate.
  </action>
  <verify>
Each new suite demonstrated RED at the pre-task commit (run it against `HEAD~n` / stashed source) and
GREEN after — capture both outputs.
`npm run test:edge` → 0 failures.
`npm run test` → 0 failures.
`npm run verify:baseline` → GREEN.
All 7 registrations present in `supabase/functions/deno.json`: the 5 new suites +
`analyze-career/paid-output-validation.test.ts` + `analyze-career/cache.test.ts`.
  </verify>
  <done>
Five new regression guards — internal-path tier resolution, tier-configured maxTokens (+ a NEW
config-level free-<-50%-elite assertion), truncation refund-not-persist (with the narrow-422
containment guard), resume-only success, and entitlement-429-not-retryable (with a resume-worker drift
guard) — each proven to fail before this fix and pass after, all registered in `test:ci` alongside the
two previously-unregistered career suites, with `verify:baseline` green.
  </done>
</task>

</tasks>

<verification>
Post-execution, before any deploy:

1. `npm run verify:baseline` is GREEN (the blocking gate — `deploy.ps1` refuses to deploy otherwise).
2. `npm run lint` → 0 errors; `npm run build` → exit 0.
3. Blast-radius proof — `git diff --name-only` must show NO changes to:
   `analyze-resume/`, `grade-linkedin/`, `recruiting-lens/`, `interview-prep-*/`,
   `process-resume-analysis-job/`, `_shared/usage-checker.ts`, `_shared/merit-gateway.ts`,
   `_shared/ai-retry.ts`, `_shared/analysis-lifecycle.ts`, `_shared/career-prompts.ts`.
   The three `_shared/` files that DO change (`auth.ts`, `tier-config.ts`, `result-merger.ts`) must
   each be additive-or-career-scoped per ED-3, and the resume/LinkedIn/RCL suites must be green.
4. Preview deploy + one real click-through per tier (test against preview FIRST, per CLAUDE.md):
   - Free user, resume ONLY (no LinkedIn PDF, no priors) → completes; result has Career DNA,
     <=3 fields, <=3 roles, <=2 surprise fits, a readiness score, and NO roadmap/skillGaps/salary;
     exactly 3 Merits deducted; exactly one `analysis_results` row.
   - Elite user → completes with the full 7-tab output (roadmap + skillGaps + compensation present).
   - Reload the page and reopen via `?id=` → the same result renders.
   - Read the `[PERF] out=` line for both tiers and confirm the observed output tokens sit comfortably
     under the new caps (4800 free / 10000 elite). If Free lands within ~10% of 4800, record a
     follow-up to re-tune rather than silently letting it truncate again.
5. NO production migration is owed by this task (zero schema change). Do not apply anything to prod.
</verification>

<success_criteria>
- Elite users receive Elite output on the live (queued/worker) path — proven by a runtime click-through, not just a unit test.
- No Career Compass run is ever persisted from a truncated model response, at any tier — and no transient save/extraction failure is misclassified as terminal.
- A Free user with only a resume gets a complete result.
- Merits are the only paywall; one run = one charge; every terminal failure refunds exactly once.
- The page shows one loading UI, one duration claim, and never lies about a refund.
- Resume Analysis, LinkedIn Grader, Recruiting Lens, Onboarding and Goal Readiness are byte-unchanged in behavior and green in the gate.
</success_criteria>

<output>
After completion, create
`.planning/quick/260713-hrd-audit-and-fix-career-compass-for-free-an/260713-hrd-SUMMARY.md`
recording: the RED-before / GREEN-after evidence for all five new guards, the `[PERF] out=` token
observations per tier, the exact `_shared/` diff with its no-ripple proof, and any follow-up owed
(e.g. output-budget re-tuning).
</output>
</content>

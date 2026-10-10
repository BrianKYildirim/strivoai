# Quick Task 260713-hrd: Audit and fix Career Compass (Free + Elite) — Context

**Gathered:** 2026-07-13
**Status:** Ready for planning

<domain>
## Task Boundary

Audit and fix Career Compass end-to-end for Free and Elite users: tier resolution,
prompts, token/output budgets, merit charging/refunds, entitlement, duplicate
calls/charges/results, loading + error honesty, persistence and reopening saved
results.

DO NOT modify Resume Analysis, LinkedIn Grader, Recruiting Lens, onboarding, or
Goal Readiness unless a genuinely shared dependency requires it. Preserve the
existing Strivo design; no redesign of unrelated areas.
</domain>

<root_causes>
## Root causes (reproduced against production, not assumed)

**RC-1 — Tier is destroyed on the only live path. Elite runs as Free.**
`CareerCompass.tsx` always submits via `submit-career-analysis-job` → worker
(`process-career-analysis-job`) → `analyze-career` using `x-internal-job-secret`.
`_shared/auth.ts:142` `requireInternalAuth()` is typed `Promise<null>` and ALWAYS
returns null. `analyze-career/index.ts:835` derives `resolvedTier` solely from
`userContext`, so it is `'free'` for 100% of runs. This ALSO means the whole
`if (MERIT_SYSTEM_ENABLED && userContext)` block (:858) never executes on the live
path — priors, cache, 412 gates, the `executeCareerParallelCalls` fan-out, and its
persistence are dead code. The orphaned "legacy path" (:1352-2002) serves all traffic.

**RC-2 — Output token budget hardcoded ~4x below the schema. Every run truncates.**
`analyze-career/index.ts:1710` computes `maxTokensForAnalysis = getMaxOutput(...)`
(free 12000 / elite 10000) and only logs it — it is NEVER passed to the model. The
real call at :1730 hardcodes `maxTokens: isElite ? 3500 : 2500`. Combined with RC-1
(`isElite === false` always), every run gets 2500 output tokens for a schema whose
complete instances measure ~2,200–3,041 tokens AFTER tier-stripping. The JSON is cut
off before `roles`; `repairTruncatedJSON` closes the braces; the stub is persisted
as a SUCCESS. `assertPaidCareerOutputComplete` is a no-op because tier === 'free'.

**RC-3 — A second legacy quota gates the live path and deadlocks Free users.**
Legacy path calls `checkEntitlement` → `can_perform_ai_action` → `get_usage_limit`:
free = 3 AI actions per cycle counted across ALL features. `createUsageLimitResponse`
returns **429**, and `process-career-analysis-job:64 isRetryableHttpStatus` treats 429
as transient → the worker retries a PERMANENT denial 8x with backoff, dying minutes
later, long after the frontend's 180s poll gave up.

**RC-4 — Charging has no idempotency; the 429 path leaks money.**
`ANALYSIS_LIFECYCLE_CAREER_COMPASS` is OFF, so `submit-career-analysis-job:274` calls
`withMerits(...)` WITHOUT an `idempotencyKey`. Every resubmit = a fresh 3-merit charge.
400-class failures refund correctly; 429 terminal failures mostly do NOT; a job stuck
in `retrying` holds a live charge indefinitely.

**RC-5 — Frontend tier gating ignores `pro` and promises data the backend cannot deliver.**
`CareerCompass.tsx` gates tabs on the literal `subscriptionTier === "elite"`.
`normalizeActiveTier` (pricing-config) collapses pro→elite everywhere else but is not
applied here or in `analyze-career`'s `isElite`. Elite users also see 7 tabs whose data
RC-1/RC-2 guarantee is absent → `PartialSectionFallback` + "This analysis is partial".

**RC-6 — Loading/error states are duplicated and dishonest.**
`UniversalAnalyzing` overlay ("about a minute") renders at the same time as an inline
step-list ("about 20 seconds"). Progress creeps to 98% and parks. The 180s client poll
times out while the server is still retrying → two contradicting stories for one run.

**RC-7 — LinkedIn is "(optional)" in the UI but hard-required by the backend.**
`analyze-career:1380` returns 400 "LinkedIn PDF content is required".

### Production evidence (prod, read-only)
- Sharp regression boundary. Runs ≤2026-04-09: 8,794–12,164 chars, 13–15 top-level
  keys, `roles` present with 3 entries. Runs ≥2026-04-27: 1,584–3,551 chars, 7–8 keys,
  `roles` key **ABSENT** (not empty — free shaping slices `roles` to 3, it never
  deletes it, so this is truncation, not tier-shaping).
- All 9 `pro` runs and recent `elite` runs are Free-shaped (no roadmap/skillGaps/comp).
- `analysis_jobs`: repeated `usage_limit_reached` (429) with `attempts=8`; repeated
  400 "Unable to extract text from your resume", each a separate charge.
- `merit_transactions`: `idempotency_key` NULL on nearly every deduct. One Elite user
  charged 8x (−24 merits) on 2026-07-11 for one usable result. Refunds land with
  `feature = NULL` and metadata key `deduction_id`.
- Free users sit at exactly 3 `usage_tracking` rows (`linkedin_grading`,
  `resume_analysis`) → permanently 429'd by the legacy gate.
</root_causes>

<decisions>
## Implementation Decisions (LOCKED by operator 2026-07-13 — do not revisit)

### Free tier scope — STANDALONE
- Career Compass Free requires ONLY an uploaded resume.
- LinkedIn data is OPTIONAL.
- A prior Resume Analysis / LinkedIn Grade must **NEVER** be a required gate.
  If those completed analyses already exist, Career Compass MAY reuse them as
  optional enrichment, but the feature MUST still work without them.
- Free output: Career DNA, 3 career fields, 3 recommended roles, 2 surprise fits,
  readiness score.
- Free must NOT receive: full roadmap, detailed skills-gap analysis, salary insights.

### Elite tier scope
- Elite receives the complete enhanced experience: full roadmap, deeper role
  reasoning, skills gaps, salary insights, richer personalization.

### Tier resolution + token budgets
- Fix live tier resolution so Elite users genuinely receive Elite output.
- Replace the hardcoded 2,500 / 3,500 token limits with the intended tier-configured
  output budgets (`getMaxOutput('careerCompass', tier)`).
- **Do NOT silently repair and persist truncated JSON as a successful result.**

### Entitlement
- Merits are the ONLY paywall. Remove the legacy `can_perform_ai_action` entitlement
  gate from Career Compass. `usage_tracking` keeps recording rows for history/analytics
  but must no longer block.
- Stop classifying entitlement/usage-limit 429s as retryable.

### Tiers in existence
- **There is no Pro.** Only Free and Elite exist. Saved `pro` rows must be treated as
  Elite (`normalizeActiveTier`) in `analyze-career` and `CareerCompass.tsx`.

### LinkedIn input
- Truly optional. A resume-only run must succeed. Reuse a prior LinkedIn Grade
  automatically when present; otherwise proceed resume-only with reduced signal.
  The backend must stop hard-failing on missing LinkedIn.
</decisions>

<specifics>
## Specific constraints

- Tier must remain server-resolved. **Never trust `rawBody.tier`** (existing D-14
  security property). On the internal/worker path, resolve the tier from the DB using
  the payload `userId` under the service client — do not accept a client-supplied tier.
- Truncation detection: `invokeAnthropicText` returns `{ ok, text, raw, model }` where
  `raw` is the full Anthropic response, so `raw.stop_reason === 'max_tokens'` is a
  direct, reliable truncation signal. Prefer it over inferring truncation from parse
  failure.
- A truncated/incomplete result must be a refundable failure, not a persisted success.
  Completeness must be asserted for **all** tiers, not just paid.
- Preserve existing Strivo design tokens and the current visual language.
</specifics>

<canonical_refs>
## Canonical references

- `.planning/quick/260608-p5k-enforce-hard-per-tier-maxtokens-caps-inp/` — the per-tier
  maxTokens cap work whose `getMaxOutput` budgets this task must actually wire up.
- `src/config/pricing-config.ts` — `maxTokensOutput`, `normalizeActiveTier`,
  `MERIT_COST_PER_FEATURE` (careerCompass = 3 for every tier).
- `TESTING-STRATEGY.md` — `npm run verify:baseline` is the blocking gate before merge.
</canonical_refs>

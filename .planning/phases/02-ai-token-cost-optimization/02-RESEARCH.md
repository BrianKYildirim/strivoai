# Phase 2: AI Token & Cost Optimization — Research

**Researched:** 2026-07-21
**Domain:** LLM output-budget telemetry + per-feature/per-tier `maxTokens` right-sizing (Supabase Edge / Deno + Postgres + Anthropic Claude Haiku 4.5)
**Confidence:** HIGH for codebase facts (read directly from source), HIGH for Anthropic pricing (official docs), MEDIUM for deployed-production drift (repo state read; live prod function versions not inspectable from here)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Measurement mechanism**
- **Persist token data to Postgres.** Do not rely on mining ephemeral `[PERF]` console lines (`_shared/anthropic.ts:640`) — Supabase log retention is bounded and the data is string-parsed and single-use.
- **New dedicated table (`ai_call_telemetry` or similar), one row per Anthropic call — not per analysis.** Resume Analysis, Career Compass, and Recruiting Lens are multi-call parallel merges; per-call granularity is what right-sizing `CALL_CONFIGS` requires. An analysis-level total cannot size an individual call.
- **Fields to capture:** feature, tier, call name, `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, effective `maxTokens`, `stop_reason`, duration, model, plus keys to correlate a run.
- **Fire-and-forget writes.** A telemetry insert failure must log a warning and never fail the analysis. Instrumentation must not add a failure mode to Resume Analysis or Career Compass (business-critical flows).
- **Permanent, not scaffolding.** Telemetry stays in production indefinitely. Rationale: both prior truncation regressions (LinkedIn 2026-07-09, Career Compass 2026-07-17) were discovered only *after* they broke a paying user's analysis. Standing telemetry surfaces "out approaching maxTokens" before it becomes a 422 + refund.

**Environment, accounts & coverage**
- **Measurement runs execute on PRODUCTION** (operator decision, overriding the staging recommendation).
- **Prerequisite: deploy TEMP diagnostic caps to production BEFORE measuring.** Prod does not currently carry the staging diagnostic bumps. Career Compass elite `base` is 4500 on prod and truncated at exactly that on 2026-07-17 (`out=4500`, `outLen=17286`) → terminal `422 output_truncated` → hard fail + refund. Measuring at current prod caps would read the ceiling rather than the model's real appetite AND burn real users' Merits. Raise caps toward `ABSOLUTE_MAX_TOKENS = 12000` for the observation window; `max_tokens` is a ceiling, not a target, so a high cap costs nothing unless actually consumed.
- **Coverage matrix (brief as written, minus one impossible cell):**
  | feature | free | elite |
  |---|---|---|
  | Onboarding / Resume Analysis | 3 runs | 3 runs |
  | LinkedIn Grader | 3 runs | 3 runs |
  | Career Compass | 3 runs | 3 runs |
  | Recruiting Lens | — (no free tier; free = 0/locked) | 3 runs |
  **21 runs total**, not 24.
- **Pro tier:** no separate pro runs. For LinkedIn / Resume / Career Compass / Recruiting Lens the prompt does not branch on tier between pro and elite, so the elite-derived cap mirrors to pro.
- **Elite access:** admin backend elevation via `_shared/auth.ts` (admin emails resolve to elite server-side). No real Stripe Elite subscriptions required. Input variety comes from the resumes/profiles used, not from account identity.
- **Merits:** accept the real burn on operator-controlled accounts. No refund-RPC writes, no pre-grants.
- **Inputs:** ad-hoc — the operator supplies substantially different real resumes / LinkedIn profiles live at run time. Not a checked-in fixture set. Report must record enough about each input (length, density, sparsity) that outliers are interpretable.

**Sizing rule & risk posture**
- **Caps are sized for reliability headroom, not cost.** Lowering `maxTokens` does not reduce spend — Anthropic bills output tokens actually generated. A cap below the model's appetite produces a truncated response, which in this codebase means `422` → hard fail → Merit refund → zero revenue at full cost. Unused ceiling is free. Cost findings are reported from measured tokens; the cap is not the cost lever.
- **Formula: observed peak × ~1.4 (≈40–50% headroom), with an explicit floor.** No cell may be recommended *below* its current value on the strength of 3 samples — small-n risk. The floor prevents a lucky-low sample from causing a regression.
- **Output-shape audit is in scope; prompt rewrites are not.** For each feature, verify whether the prompt bounds BOTH item counts AND per-item content. Both prior regressions were unbounded-shape failures, not arithmetic failures. Flag unbounded cells in the report as "cap cannot be trusted here yet". Any needed prompt tightening becomes follow-up work.
- **No-change is a valid per-cell outcome.** If a cap is already well-sized, the recommendation is "keep" with recorded evidence.
- **Invariants that constrain any recommendation:** per-tier `CALL_CONFIGS` sums ≤ tier ceiling; **GATE-09** — Resume free must be < 50% of elite (i.e. < 10000) or boot throws; `ABSOLUTE_MAX_TOKENS = 12000` per-call clamp in `_shared/anthropic.ts`.

**Report & approval artifact**
- **Location/form:** `02-MEASUREMENT-REPORT.md` in the phase dir, **plus the checked-in SQL** that regenerates it from the telemetry table.
- **Required contents (all four):** (1) per-run raw rows; (2) per-cell stats + outliers; (3) cost in dollars (per analysis, per tier, per 1000 analyses); (4) recommendation table with blast radius (proposed cap, current value, delta, exact lockstep files).
- **Approval checkpoint: HARD STOP, `autonomous: false`.** Never auto-advanced even with auto-mode enabled. Operator approves / rejects / amends **each proposed cap individually**; only approved cells are implemented. The approved table is written back into the phase artifact as the locked input to implementation.
- **Verification: re-run + production telemetry soak.** Re-run a subset of the measurement inputs at the new caps to confirm `out < maxTokens` with headroom and zero 422s, then watch permanent prod telemetry over a real-traffic window for near-cap runs.

### Claude's Discretion
- Exact telemetry table name, column types, RLS posture, and retention/pruning policy.
- How the telemetry write path reaches `_shared/anthropic.ts` cleanly (correlation-id threading, service-client access).
- Whether pro needs its own runs on a per-feature basis if research finds a tier-branching prompt not currently known.
- Phase-internal plan sequencing and the shape of the TEMP-cap deploy/revert steps.
- Relationship to `.planning/maxtoken-tuning/TRACKER.md`: Phase 2 supersedes and closes that mini-milestone for the four covered features (its revert checklist becomes part of the implementation step); Interview Prep remains open there.

### Deferred Ideas (OUT OF SCOPE)
- Interview Prep Coach token tuning (unvalidated 5000 pro / 12000 elite).
- Independent Pro-tier measurement.
- Prompt output-shape rewrites (audit only, no rewrites).
- Input-side cost reduction (prompt caching strategy, input trimming, model selection) — reported, not implemented.
- Telemetry-driven near-cap alerting.
</user_constraints>

---

## Summary

This phase is almost entirely a **codebase-mechanics** problem, not a library-selection problem. Nothing new needs to be installed. The work is: (1) add one Postgres table + one fire-and-forget insert at a single existing chokepoint (`invokeAnthropicText` in `_shared/anthropic.ts`); (2) thread three strings (feature / tier / callName) plus one correlation id through ~14 existing call sites; (3) temporarily raise caps, deploy to prod, run 21 analyses, query, report; (4) after a hard-stop operator approval, edit 4–6 files per approved cell in lockstep and redeploy.

The single most important codebase fact: **every `maxTokens` value in the system is enforced by boot-time invariants that `throw` at module load.** `analyze-resume`, `analyze-career`, and `recruiting-lens` each run a per-tier sum check against `getMaxOutput(...)` at module top level, and `analyze-career` additionally enforces a brevity-target ratio. A cap edit that misses one lockstep file does not fail a test — it produces `503 / sb-error-code: BOOT_ERROR` on every request to that function, exactly the failure mode `scripts/check-edge-boot.mjs` was written for. So the TEMP-cap deploy and the final-cap deploy are each an all-files-or-nothing edit, and `npm run verify:baseline` (which includes the deno edge suite and, via `deploy.ps1`, gates the deploy) must be green.

The second most important fact: **`.planning/maxtoken-tuning/TRACKER.md` is STALE.** It reports Career Compass free at 12000 and Resume elite at 18000; the actual current repo values are CC free 4800 (right-sized by quick task `260713-hrd`) and Resume elite ceiling 20000 / `CALL_CONFIGS` elite sum 18000. Plan against the source files enumerated in §2 below, never against the TRACKER table.

**Primary recommendation:** Instrument at the single `invokeAnthropicText` seam via a new `_shared/ai-telemetry.ts` module with an optional `telemetry` field added to `AnthropicInvokeParams`; write to a new service-role-only table `public.ai_call_telemetry`; do the TEMP-cap bump as one commit touching the full lockstep set for all four features, deploy to prod via `scripts/deploy.ps1 -Env production` (operator-executed), measure, report, hard-stop, then a second lockstep commit + deploy for approved caps.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-call token telemetry capture | API/Backend (`_shared/anthropic.ts`) | — | Only place that sees the raw Anthropic `usage` object for every feature |
| Telemetry persistence | Database (`public.ai_call_telemetry`) | — | Durable, queryable, survives log retention |
| Correlation-id / feature / tier context | API/Backend (per-function `index.ts`) | — | Only the feature function knows its own name, resolved tier, and reqId |
| Cap definition (source of truth) | Config (`src/config/pricing-config.ts`) | Edge re-export (`_shared/tier-config.ts`) | SC-12 central table; edge reads via `getMaxOutput` |
| Per-call budget allocation | API/Backend (per-function `CALL_CONFIGS`) | — | Fan-out split of the per-tier ceiling |
| Cap enforcement / clamp | API/Backend (`_shared/anthropic.ts` `ABSOLUTE_MAX_TOKENS`) | Boot invariants in each function | Defense-in-depth: clamp at send site + throw at module load |
| Measurement execution | Operator (manual, production UI) | — | Ad-hoc real inputs; no fixture set; prod is operator-only |
| Report generation | Docs artifact + checked-in SQL | Database | Re-runnable for future tuning passes |

---

## 1. `_shared/anthropic.ts` — the instrumentation seam

**File:** `supabase/functions/_shared/anthropic.ts` (810 lines)
**Imports today (line 1–2):** `./prompt-sanitizer.ts`, `./logger.ts` only. **Zero Supabase/HTTP dependencies.** This is deliberate and must be preserved carefully (see Pitfall 2).

### Key landmarks (exact lines, verified by read)

| Line | What |
|---|---|
| 4 | `const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'` |
| 7–14 | `ABSOLUTE_MAX_TOKENS = 12000` + its rationale comment |
| 16 | `const _sanitizerLog = createLogger('anthropic')` — already an available logger |
| 18–29 | `export type AnthropicInvokeParams` — `apiKey?`, `model`, `system?`, `messages`, `outputSchema?`, `maxTokens?`, `temperature?`, `fixtureKey?`, `timeoutMs?` |
| 31–33 | `export type AnthropicInvokeResult = { ok: true; text; raw; model } \| { ok: false; status; error }` |
| 35–~250 | `getMockFixtureText` — AI_TEST_MODE fixtures |
| 468 | `export async function invokeAnthropicText(params)` — **the seam** |
| 469–484 | Staging-gated forced-error injection + `AI_FORCE_FAILURE` (both return before any network call) |
| 486–560 | `AI_TEST_MODE` mock path — returns `raw: { mock: true, … }`, **no `usage`** |
| 562–566 | API key resolution |
| 569 | `sanitizeMessages(...)` |
| **572** | `const clampedMaxTokens = Math.min(params.maxTokens ?? 4096, ABSOLUTE_MAX_TOKENS)` — **the effective maxTokens to record** |
| 575 | `const _t0 = performance.now()` |
| 581–611 | `fetch` — note `'anthropic-beta': 'prompt-caching-2024-07-31'` (line 586) and system blocks auto-wrapped with `cache_control: ephemeral` (593) |
| 616 | `const _tResponse = performance.now()` (TTFB) |
| 618–626 | non-OK branch → `[PERF] … FAILED` log at 620, returns `{ok:false,status,error}` |
| 628 | `const data = await response.json()` |
| 629 | `const _tParsed = performance.now()` (total duration) |
| 636 | `const usage = data?.usage` |
| 637–639 | cacheInfo string built from `usage.cache_creation_input_tokens` / `usage.cache_read_input_tokens` |
| **640** | the `[PERF] anthropic … in=… out=… \| maxTokens=…` console line |
| 642–648 | empty-text guard → returns 502 |
| 650 | `return { ok: true, text, raw: data, model: params.model }` |
| 651–658 | catch → 408 (AbortError) / 500 |
| 661–663 | `export type StreamChunk` |
| 665–810 | `streamAnthropicText` — clamp at **738**; **never reads `usage` or `stop_reason`** (SSE `message_delta` events are discarded at 790–794) |

### What is already in hand at line 636–640

`data.usage` carries `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`. `data.stop_reason` is on the top-level response object (`data.stop_reason`), which `analyze-career/index.ts:280` already reads via `raw.stop_reason === 'max_tokens'`. Durations: `_tParsed - _t0` (total) and `_tResponse - _t0` (TTFB). `clampedMaxTokens` is in scope. `params.model` is in scope.

**What is NOT in hand:** feature name, resolved tier, call name, request/run correlation id, user id. These MUST be threaded in.

### Recommended seam design

Add an optional field to `AnthropicInvokeParams` (backward compatible — every existing call site keeps compiling):

```ts
// supabase/functions/_shared/anthropic.ts  (add to AnthropicInvokeParams, ~line 28)
/** Phase 02: per-call token telemetry context. Omit to disable telemetry for this call. */
telemetry?: {
  feature: string;      // 'resume_analysis' | 'career_compass' | 'linkedin_grader' | 'recruiting_lens' | 'interview_prep' | …
  tier: string;         // resolved server-side tier: 'free' | 'pro' | 'elite'
  callName: string;     // 'free-single' | 'criteria-1' | 'criteria-2' | 'summary' | 'rewrites' | 'base' | 'growth' | 'elite-extras' | 'linkedin-grade' | 'rl-call-1' …
  reqId?: string;       // the function's existing 8-char reqId (correlates one analysis)
  userId?: string;
  attempt?: number;     // 1 = first, 2 = retry (retries are common; see Pitfall 5)
};
```

Then immediately after line 640 (and in the `!response.ok` branch at 620, and optionally in the catch), call a new helper:

```ts
// supabase/functions/_shared/ai-telemetry.ts  (NEW)
import { createLogger } from './logger.ts';
const log = createLogger('ai-telemetry');

export type AiCallTelemetryRow = { /* … see §4 columns … */ };

let _client: any | null = null;
let _disabled = false;

/** Lazily resolves a service client. Never throws; disables itself if env is absent. */
async function client() {
  if (_disabled) return null;
  if (_client) return _client;
  try {
    const { getServiceClient } = await import('./supabase-client.ts'); // dynamic: keeps anthropic.ts dependency-free at module load
    _client = getServiceClient();
    return _client;
  } catch (e) {
    _disabled = true;
    log.warn('telemetry-client-unavailable', { reason: (e as Error).message });
    return null;
  }
}

/** Fire-and-forget. NEVER throws, NEVER rejects. */
export async function recordAiCall(row: AiCallTelemetryRow): Promise<void> {
  try {
    if ((Deno.env.get('AI_TEST_MODE') || '').toLowerCase() === 'true') return; // no writes in fixture mode
    const c = await client();
    if (!c) return;
    const { error } = await c.from('ai_call_telemetry').insert(row);
    if (error) log.warn('telemetry-insert-failed', { code: error.code, msg: error.message });
  } catch (e) {
    log.warn('telemetry-threw', { msg: (e as Error).message });
  }
}
```

**Await vs float:** `await recordAiCall(...)` inside `invokeAnthropicText`. Rationale: a PostgREST insert is ~10–30 ms against 35–90 s AI calls (negligible), and a floating promise in a Deno edge worker can be dropped when the isolate is reclaimed after the response is sent — silently losing exactly the rows this phase needs. `EdgeRuntime.waitUntil` is **not used anywhere in this repo** (verified: zero matches) so do not introduce it. "Fire-and-forget" per the locked decision is satisfied by the *never-throws* contract, not by not-awaiting.

**streaming:** `streamAnthropicText` is used only by `_shared/anthropic.ts` itself and referenced in `prompt-sanitizer.test.ts` — **no feature function calls it** (verified by `rg -l streamAnthropicText`: only `anthropic.ts` and `prompt-sanitizer.test.ts`). Resume Analysis's "streaming path" is SSE from the edge function to the browser, not Anthropic SSE. **Conclusion: instrumenting `invokeAnthropicText` alone covers 100% of live Anthropic calls.** Leave `streamAnthropicText` uninstrumented and say so explicitly in the plan.

---

## 2. Where every `maxTokens` lives — the complete lockstep map

### 2.1 Central table (SC-12)

**`src/config/pricing-config.ts:114–120`** — CURRENT VALUES:

```ts
export const maxTokensOutput: Record<FeatureKey, Record<Tier, number>> = {
  resumeAnalysis:     { free: 9000,  pro: 20000, elite: 20000 },
  careerCompass:      { free: 4800,  pro: 10000, elite: 10000 },
  recruitingLens:     { free: 0,     pro: 15000, elite: 15000 },
  linkedinGrader:     { free: 12000, pro: 9000,  elite: 9000  },
  interviewPrepCoach: { free: 0,     pro: 12000, elite: 12000 },
};
```
Active tier sums documented at line 74 and asserted downstream: **Free 25800 | Pro 66000 | Elite 66000**.
Accessor: `getMaxOutput(feature, tier)` at `pricing-config.ts:169–171` — applies `normalizeActiveTier` (pro → elite).

**`src/config/pricing-config.snapshot.ts:25–31`** — byte-identical replica of the table above, plus **`tierSums.maxTokensOutput: { free: 25800, pro: 66000, elite: 66000 }`** at line 50.

**`src/config/__tests__/sc12-snapshot.test.ts:24`** — test title string hardcodes the sums: `it('tier sums for maxTokensOutput reconcile to 25800 / 66000 / 66000', …)`; assertions at 30–32 compare live table sums to the snapshot.

**Edge-side re-export:** `supabase/functions/_shared/tier-config.ts:173–181` re-exports `getMaxOutput`, `getMaxInputTokens`, `getMaxInputChars`, `maxTokensOutput`. Edge functions import from `../_shared/tier-config.ts`, never from `src/config` directly.

### 2.2 Per-feature `CALL_CONFIGS` and their test replicas

#### Resume Analysis
- **`supabase/functions/analyze-resume/index.ts:340–346`**
  ```
  criteria-1   free 1800  pro 5000  elite 5000
  criteria-2   free 1800  pro 5000  elite 5000
  summary      free 1400  pro 5000  elite 5000
  rewrites     free    0  pro 3000  elite 3000
  elite-extras free    0  pro    0  elite    0   ← DISABLED (no downstream consumer)
  ```
  Elite/Pro active sum = **18000** (ceiling 20000, 2000 slack). Free cells are **vestigial** (comment at 338–339): the free path is a single consolidated call.
- `index.ts:355` `const RESUME_ELITE_OUTPUT_CAP = getMaxOutput('resumeAnalysis','elite')` (comment says 20000)
- `index.ts:356` `const FREE_SINGLE_CALL_MAX_TOKENS = getMaxOutput('resumeAnalysis','free')` — **comment says `// 5000` but the actual value is now 9000.** Stale comment; flag for correction.
- Boot invariants: `index.ts:363–370` per-tier sum ≤ `getMaxOutput`; `373–375` free single-call ≤ free ceiling; **`377–379` GATE-09**: `if (FREE_SINGLE_CALL_MAX_TOKENS >= RESUME_ELITE_OUTPUT_CAP * 0.5) throw`. With elite 20000, **free must be ≤ 9999**. Current 9000 passes with 999 to spare.
- Free path: `executeFreeAnalysis` at `index.ts:589–630+`, two invoke sites (`598` primary, `624` quality-floor retry), both `maxTokens: FREE_SINGLE_CALL_MAX_TOKENS`.
- Elite/Pro path: `executeParallelCalls` at `index.ts:381–…`; `makeCall` invoke at `392–400`; `activeConfigs` filter at `414–421`; validation-aware retry at `443–478` with **`retryMaxTokens = Math.min(baseMaxTokens * 2, 12000)`** (line 472) when output was invalid.
- Other invoke sites using `TIER_MAX_TOKENS[resolvedTier]` (a separate legacy constant in `tier-config.ts:88–93`: free 6000 / pro 16000 / elite 20000): `index.ts:714`, `1006–1011`, `1591–1596`, `1732–1737`. These are fallback/legacy paths — instrument them too but expect zero rows.
- **Test replica:** `supabase/functions/analyze-resume/index.test.ts:34–39` — a literal copy of `CALL_CONFIGS` with the comment "If CALL_CONFIGS values change in index.ts, update these to match." Assertions: free sum (69), elite sum ≤ ceiling (75–77, comment "18000 <= 20000"), pro sum (81), elite-extras == 0 (87–88), active-elite count (91), per-call ≤ 12000 (95–97), bad-config thresholds keyed to the **free ceiling 9000** at lines 111–118 ("11600 > 9000") and elite 20000 at 124–130.

#### Career Compass
- **`supabase/functions/analyze-career/index.ts:95–99`**
  ```
  base          free 4800  pro 4500  elite 4500
  growth        free    0  pro 3500  elite 3500
  elite-extras  free    0  pro 2000  elite 2000
  ```
  Elite/Pro sum = **10000 = EXACTLY the ceiling. Zero slack.** Free = 4800 = exactly the free ceiling. Zero slack on both.
- `index.ts:118–124` `CAREER_BREVITY_TARGET_TOKENS = { free: 2200, pro: 4500, elite: 4500 }`
- `index.ts:127` `CAREER_MIN_CAP_TO_TARGET_RATIO = 1.8`
- Boot invariants `index.ts:128–147`: (a) per-tier sum ≤ `getMaxOutput('careerCompass', tier)`; (b) **`target * 1.8 > ceiling` → throw**. With elite target 4500 and ceiling 10000: 4500×1.8 = 8100 ≤ 10000 ✅. Free: 2200×1.8 = 3960 ≤ 4800 ✅. **Any TEMP raise of the ceiling keeps this satisfied; any *lowering* of a ceiling must re-check it.**
- Second boot check `index.ts:630–632`: `FREE_SINGLE_CALL_MAX_TOKENS` (imported from `_shared/career-prompts.ts`) must be ≤ `TIER_MAX_TOKENS.free` **and ≤ 4000** (hard literal). This is a *different* constant from the resume one — note the name collision.
- Invoke sites: `makeCall` at `642–650`; active-config filters at `670–686` and `708–716`; free path `1191–1193`; `1438` (`getMaxOutput('careerCompass', resolvedTier)`); `1465` (per-callType elite retry); DOCX text-extraction helper at `1316` (`maxTokens: 2000`); OCR at `1358` (`4000`); `1670` (`2000`); `1745` (`4000`). The last four are **utility extraction calls, not analysis calls** — they will produce telemetry rows and must be labelled distinctly (e.g. `feature='career_compass'`, `callName='docx-extract'`) or excluded, or they will pollute the per-cell peak stats.
- `index.ts:1889` `maxTokensForAnalysis = getMaxOutput('careerCompass', resolvedTier)`; `2027–2029` reads the three elite `CAREER_CALL_CONFIGS` cells by name.
- Truncation detection: `isTruncatedResponse(raw)` at `index.ts:279–281` (`raw.stop_reason === 'max_tokens'`); `truncatedOutputResponse(...)` at `292–306` returns **422 `output_truncated`, `retryable: false`**.
- **Test replicas:** `analyze-career/index.test.ts:38–41` (literal copy); assertions `CC-05` free sum == 4800 (66–68), elite sum == 10000 (74–77), pro sum == 10000 (81–82), plus `__tests__/token-budget.test.ts` and `__tests__/truncation-refund.test.ts`.

#### LinkedIn Grader
- **`supabase/functions/grade-linkedin/index.ts:68–72`** — `LINKEDIN_MAX_TOKENS` is **derived**, not literal:
  ```ts
  const LINKEDIN_MAX_TOKENS: Record<Tier, number> = {
    free:  getMaxOutput('linkedinGrader','free'),   // 12000 (TEMP diagnostic)
    pro:   getMaxOutput('linkedinGrader','pro'),    // 9000
    elite: getMaxOutput('linkedinGrader','elite'),  // 9000
  };
  ```
  Doc-comment at 64–67 says "free 5000 / elite 8000" — **stale**. Single call; **changing the pricing-config cell + snapshot + sc12 title is sufficient.** No `CALL_CONFIGS`, no boot sum invariant.
- Invoke sites: `251`, `436`, `816`, `858` (retry). Also `LINKEDIN_TOTAL_DEADLINE_MS = 165_000` at line 61 and the timeout budget invariant documented in `tier-config.ts` (client 180 000 > server 165 000 > per-call 90 000). **A large TEMP cap raises generation time — verify the wall clock is not the binding constraint** (see Pitfall 4).
- Tests: `grade-linkedin/handler-config.test.ts`, `__tests__/retry-deadline.test.ts`, `prompts.test.ts`.

#### Recruiting Lens
- **`supabase/functions/recruiting-lens/index.ts:36–44`**
  ```
  rl-call-1  pro 5000  elite 5000
  rl-call-2  pro 5000  elite 5000
  rl-call-3  pro 5000  elite 5000
  ```
  Sum = **15000 = EXACTLY the ceiling. Zero slack.** No free cells at all (elite-only feature).
- `index.ts:51–54` `RCL_MAX_TOKENS` from `getMaxOutput('recruitingLens', tier)`; boot invariant `55–61` sum ≤ ceiling.
- Invoke: `makeCall` at `385–392`; fan-out `406–409`; retry `437–440`.
- **No test replica of these values was found** by grep of `recruiting-lens/*.test.ts` — confirm during planning; if absent, the lockstep set for RCL is just index.ts + pricing-config + snapshot + sc12 title.

#### Interview Prep (OUT OF SCOPE for cap changes; still instrument)
- `supabase/functions/interview-prep-analyze/index.ts:413` — `const maxTokens = variant === 'pro' ? Math.min(5000, interviewOutputCap) : interviewOutputCap`; invoke sites `420, 430, 450, 512, 529`. `interview-prep-evaluate` uses the elite cap.

### 2.3 Lockstep file set per cell (the "blast radius" the report must print)

| Cell | Files that MUST move together |
|---|---|
| **Resume free** | `src/config/pricing-config.ts` (+ its TEMP comment + the `Free 25800` sum comment), `src/config/pricing-config.snapshot.ts` (cell + `tierSums.free`), `src/config/__tests__/sc12-snapshot.test.ts` (title string line 24), `analyze-resume/index.test.ts` bad-config threshold (lines 111–118, keyed to 9000) + free-sum assertion (69), **GATE-09 recheck** (must stay < 10000) |
| **Resume pro/elite** | `pricing-config.ts`, `pricing-config.snapshot.ts` (+ `tierSums.pro/elite`), `sc12-snapshot.test.ts` title, `analyze-resume/index.ts:340–346` `CALL_CONFIGS`, `analyze-resume/index.test.ts:34–39` replica + sum assertions (75–82, 124–130), **GATE-09 recheck** (raising elite raises the free allowance; *lowering* elite can break a passing free value) |
| **Career free** | `pricing-config.ts`, snapshot (+ tierSums.free), sc12 title, `analyze-career/index.ts:96` `base.maxTokensFree`, `CAREER_BREVITY_TARGET_TOKENS.free` ratio recheck, `analyze-career/index.test.ts:39` replica + `CC-05` free assertion (66–68) |
| **Career pro/elite** | `pricing-config.ts`, snapshot (+ tierSums), sc12 title, `analyze-career/index.ts:96–98` all three elite/pro cells, brevity-ratio recheck (`4500*1.8 ≤ ceiling`), `analyze-career/index.test.ts:39–41` replica + elite/pro sum assertions (74–82), `__tests__/token-budget.test.ts` |
| **LinkedIn any tier** | `pricing-config.ts`, snapshot (+ tierSums), sc12 title. *(derived — no CALL_CONFIGS)*. Also update the stale doc-comment at `grade-linkedin/index.ts:64–67`. |
| **Recruiting Lens pro/elite** | `pricing-config.ts`, snapshot (+ tierSums), sc12 title, `recruiting-lens/index.ts:41–43` `CALL_CONFIGS` |

**Verification after ANY cap change** (from TRACKER, still valid):
```
npx vitest run src/config/__tests__/sc12-snapshot.test.ts
deno test supabase/functions/analyze-career/index.test.ts supabase/functions/analyze-resume/index.test.ts --no-check --allow-all
node scripts/check-edge-boot.mjs      # catches module-level throws AND syntax errors
npm run verify:baseline                # the deploy gate
```

---

## 3. TEMP diagnostic caps: current state and what prod actually needs

### 3.1 Repo state (verified)

| Feature | free | pro | elite | Status |
|---|---|---|---|---|
| resumeAnalysis | **9000 (TEMP)** | 20000 | 20000 | free TEMP (was 5000); elite/pro never diagnostically bumped |
| careerCompass | 4800 | 10000 | 10000 | free RIGHT-SIZED by `260713-hrd` (12000 → 4800). **No TEMP live.** |
| recruitingLens | 0 | 15000 | 15000 | never bumped |
| linkedinGrader | **12000 (TEMP)** | 9000 | 9000 | free TEMP (was 5000); elite/pro right-sized 7000→9000 (2026-07-09 fix) |
| interviewPrepCoach | 0 | 12000 | 12000 | untuned, out of scope |

`git diff main..staging -- src/config/pricing-config.ts` is **EMPTY** — main and staging carry identical cap values. So the "staging-only TEMP caps" are a *deploy* distinction (prod's deployed edge-function bundles may predate the bumps), **not a branch distinction**. The plan must not assume a branch-merge is what lands them on prod; it must assume an explicit production deploy.

### 3.2 What must change to run the measurement

Only **elite/pro** cells have *no* diagnostic headroom today, and two of them (Career elite 10000, RCL elite 15000) are consumed to the last token by their `CALL_CONFIGS`. Proposed TEMP diagnostic values (all per-call ≤ `ABSOLUTE_MAX_TOKENS = 12000`):

| Feature × tier | Current | TEMP proposal | Notes |
|---|---|---|---|
| Resume free | 9000 | **9000 (keep)** | GATE-09 forbids ≥ 10000 while elite is 20000. Already 1.8× the pre-TEMP value. |
| Resume elite/pro (per call) | 5000/5000/5000/3000 | **8000/8000/8000/6000** = 30000 | Requires ceiling `resumeAnalysis.elite/pro` 20000 → **30000** + snapshot + tierSums (66000 → 76000) + sc12 title. Raising elite also relaxes GATE-09 (free < 15000). |
| Career free (base) | 4800 | **9000** | ceiling 4800 → 9000 + `base.maxTokensFree` 9000. Brevity ratio: 2200×1.8=3960 ≤ 9000 ✅ |
| Career elite/pro | 4500/3500/2000 = 10000 | **9000/6000/4000** = 19000 | ceiling 10000 → **19000**. Brevity ratio 4500×1.8=8100 ≤ 19000 ✅ |
| LinkedIn free | 12000 | **12000 (keep)** | already at `ABSOLUTE_MAX_TOKENS` |
| LinkedIn elite/pro | 9000 | **12000** | at the clamp ceiling |
| RCL elite/pro | 5000×3 = 15000 | **9000×3 = 27000** | ceiling 15000 → **27000** |

These are *recommendations for the planner*, not locked — the operator's TEMP values are Claude's-discretion territory per CONTEXT. What is **not** discretionary: every one of these requires the full lockstep set in §2.3, plus updated `tierSums` in the snapshot and the sc12 title string.

### 3.3 Revert

The TRACKER's revert checklist (lines 59–66) is partially stale (it still lists CC free 12000 → applies only to the already-completed `260713-hrd` pass). The Phase-2 revert is simply: **the implementation commit sets every cell to its approved final value in the same lockstep set**, so "revert" and "implement" are the *same edit*, not two. Cells the operator rejects revert to their pre-TEMP value; cells approved go to the new value. This should be one commit + one prod deploy, not two.

**Explicitly close out in TRACKER.md:** mark Resume / Career Compass / LinkedIn / Recruiting Lens as superseded by Phase 02 and delete/annotate the "In progress — Free-tier diagnostic pass (TEMP)" section; leave Interview Prep open.

---

## 4. Telemetry table: migration conventions + recommended DDL

### Conventions observed (`supabase/migrations/`)

- **Naming:** `YYYYMMDDHHMMSS_snake_case_description.sql`. Recent files use a `HHMMSS` that is often a synthetic ordinal (`20260719120000`, `20260719120001`). Next free slot after `20260719120001` → use e.g. `20260721000000_ai_call_telemetry.sql`.
- **Rollback:** every migration has a sibling in `supabase/migrations/rollback/<same-name>.rollback.sql`. **Mandatory** (CLAUDE.md: "create rollback SQL for every migration").
- **Header:** a long `--` comment block with CONTEXT / FIX / scope guard, then numbered steps.
- **Idempotency:** `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and for policies a `DO $$ … EXCEPTION WHEN duplicate_object THEN NULL; END $$;` wrapper (see `20260625003918_rate_limit_counters_explicit_deny.sql`).
- **Verification:** a trailing `DO $$ … RAISE …` block that asserts the change landed (pattern in `20260719000000_add_applications_analysis_id.sql:52+`).
- **RLS "service-role-only" pattern** (verbatim from `20260625003918`):
  ```sql
  DO $$
  BEGIN
    CREATE POLICY "Service role only - no anon/authenticated access"
      ON public.<table> FOR ALL TO authenticated
      USING (false) WITH CHECK (false);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;
  ```
  Combined with `ALTER TABLE … ENABLE ROW LEVEL SECURITY;`. Service role bypasses RLS, so edge inserts work.
- **RLS perf gotcha (repo memory):** if a policy ever needs `auth.uid()`, wrap as `(select auth.uid())` and verify with the regex `select\s+auth.uid()` (case-insensitive) — Postgres re-renders it as `( SELECT auth.uid() AS uid)`. Not needed for a deny-all policy.
- Also revoke grants from `anon`/`authenticated` explicitly (pattern in `20260625021127_revoke_anon_execute_security_definer_rpcs.sql`).

### Recommended table

```sql
CREATE TABLE IF NOT EXISTS public.ai_call_telemetry (
  id                          bigserial PRIMARY KEY,
  created_at                  timestamptz NOT NULL DEFAULT now(),

  -- context (threaded from the calling edge function)
  feature                     text        NOT NULL,   -- 'resume_analysis' | 'career_compass' | 'linkedin_grader' | 'recruiting_lens' | 'interview_prep' | 'util'
  tier                        text        NOT NULL,   -- resolved SERVER-SIDE tier: 'free' | 'pro' | 'elite'
  call_name                   text        NOT NULL,   -- 'criteria-1' | 'summary' | 'base' | 'rl-call-2' | 'free-single' | …
  attempt                     smallint    NOT NULL DEFAULT 1,  -- 1 = first, 2 = retry
  req_id                      text        NULL,       -- correlates all calls of ONE analysis
  user_id                     uuid        NULL,       -- NO FK: telemetry must survive user deletion; see note

  -- model + budget
  model                       text        NOT NULL,
  max_tokens                  integer     NOT NULL,   -- the CLAMPED effective value (anthropic.ts:572)

  -- usage (nullable: absent on HTTP failure)
  input_tokens                integer     NULL,
  output_tokens               integer     NULL,
  cache_creation_input_tokens integer     NULL,
  cache_read_input_tokens     integer     NULL,
  stop_reason                 text        NULL,       -- 'end_turn' | 'max_tokens' | 'stop_sequence' | …

  -- outcome + timing
  ok                          boolean     NOT NULL,
  http_status                 integer     NULL,       -- populated on failure
  duration_ms                 integer     NOT NULL,   -- _tParsed - _t0
  ttfb_ms                     integer     NULL,       -- _tResponse - _t0
  output_chars                integer     NULL,       -- text.length — the 07-17 report used outLen; keep it

  -- derived, generated so queries and alerts never have to recompute
  headroom_pct                numeric     GENERATED ALWAYS AS (
    CASE WHEN output_tokens IS NULL OR max_tokens = 0 THEN NULL
         ELSE round(100.0 * (1.0 - output_tokens::numeric / max_tokens), 2) END
  ) STORED,
  truncated                   boolean     GENERATED ALWAYS AS (stop_reason = 'max_tokens') STORED
);

CREATE INDEX IF NOT EXISTS ai_call_telemetry_created_at_idx
  ON public.ai_call_telemetry (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_call_telemetry_cell_idx
  ON public.ai_call_telemetry (feature, tier, call_name, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_call_telemetry_req_id_idx
  ON public.ai_call_telemetry (req_id) WHERE req_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_call_telemetry_truncated_idx
  ON public.ai_call_telemetry (created_at DESC) WHERE truncated;

ALTER TABLE public.ai_call_telemetry ENABLE ROW LEVEL SECURITY;
-- + the "Service role only" deny-all policy above
REVOKE ALL ON public.ai_call_telemetry FROM anon, authenticated;
```

**Design notes:**
- **No FK on `user_id`.** The repo added `user_deletion_cascade_fks` (`20260719120000`) + an auth-delete cleanup trigger (`20260719120001`); a telemetry FK would either cascade-delete measurement history or block deletes. Keep it a bare uuid, and consider storing nothing at all if the operator prefers (it is not needed for right-sizing).
- **`bigserial` not uuid** — append-only high-volume log; monotonic PK is the right shape and cheaper to index.
- **Generated columns** (`headroom_pct`, `truncated`) make the report SQL and the future near-cap alert (deferred idea) one-liners.
- **Retention:** recommend **keep 180 days**, pruned by a `pg_cron` job or simply left unmanaged initially — at ~14 rows per analysis and current traffic (single-digit analyses/day on prod, per repo memory: prod has ~1 user, live merit economy shows 29 deductions in a trailing 3 days) this table grows by hundreds of rows/month. **Do not build pruning infrastructure in this phase**; document the policy and add a one-line `DELETE FROM … WHERE created_at < now() - interval '180 days'` to the checked-in SQL file as an operator-run maintenance snippet. Anything more is scope creep.
- **`ADMIN` visibility:** deny-all to `authenticated` is correct for this phase (no UI is planned). If a future admin dashboard wants it, add a `SECURITY DEFINER` RPC — but see repo memory: `auth.uid()` survives into definer frames, so self-only ownership guards break admin aggregate RPCs.

### Prod application is OPERATOR-EXECUTED

Per CLAUDE.md and repo memory: prod ref `zjpjapgraoxdukdvpjes` is **read-only for Claude**. The plan must have Claude *author* the migration + rollback and *apply/verify on preview* (`cimjltzovkahkqecpwgi`, unpaused since 2026-06-24), then a `checkpoint:human` for the operator to apply on prod. Claude may then verify read-only via the prod MCP.

---

## 5. Admin → elite elevation (how the operator runs elite analyses)

**`supabase/functions/_shared/auth.ts`:**
- Line 31: `const ADMIN_EMAIL = (Deno.env.get('ADMIN_EMAIL') ?? 'strivolife@gmail.com').toLowerCase();`
- Line 34: `isAdminEmail(email) => !!email && email.toLowerCase() === ADMIN_EMAIL`
- Line 155–167 (user-auth path): `const tier = isAdmin ? 'elite' : normalizeActiveTier(profile.subscription_tier);` then `log.info('admin-tier-elevation', { type: 'user', userId })`
- Line 224–255 (internal/job path): same resolution, returns `'elite'`, logs `admin-tier-elevation` with `type: 'internal'`.

**Consequences for the measurement plan:**
- The operator's own account (`strivolife@gmail.com`, which is the configured user email) **always** resolves to elite server-side. **Running the FREE-tier half of the matrix therefore requires a SECOND, non-admin account.** This is a real constraint the CONTEXT does not name — the plan must include creating/using a separate free-tier prod account (or temporarily overriding `ADMIN_EMAIL`, which is riskier and would also change CORS/admin behaviour).
- `admin-tier-elevation` log lines give a free cross-check that a run was actually elite.
- **`resolvedTier` is what must be written to telemetry**, not `profiles.subscription_tier` — otherwise every admin elite run is mislabelled `free`. Thread the same `resolvedTier` variable the function already passes to `getMaxOutput`.
- Note the admin billing-period exemption migration `20260717000000_fix_billing_period_guard_admin_exemption.sql` — admin accounts have special usage-guard handling; do not assume merit accounting is identical.

---

## 6. Existing benchmark scripts — reuse assessment

| Script | Reusable? | Detail |
|---|---|---|
| `scripts/validate-performance.mjs` | **Partially — as a reference, not a driver** | Header lines 1–19. Drives `analyze-resume` via SSE, authenticates with `PERF_TEST_EMAIL`/`PERF_TEST_PASSWORD` against `SUPABASE_URL_STAGING`/`_PRODUCTION`. **Its `PRICING` block (lines 30–35) is WRONG for this phase** — it hardcodes Sonnet 4 rates ($3/$15) but every call now runs on Haiku 4.5 ($1/$5). **Its `CALL_CONFIGS` mirror (lines 37–41) is also stale** (free 2500 / elite 2200-3200 — matches no current file). Reuse the `authenticate()` / `parseArgs()` / `loadResumes()` / `sleep()` helpers only. |
| `scripts/validate-career-performance.mjs` | **Reference only** | Header explicitly: "STAGING ONLY. Refuses `--env production`." Would need that guard removed to drive prod — **do not**; the CONTEXT says runs are ad-hoc operator-driven through the real UI with real resumes, not scripted. |
| `scripts/staging-cache-perf-probe.mjs` | **Yes, for `percentile()` / `stats()`** | Also demonstrates the service-role-key-from-env pattern if a scripted verification pass is wanted. |
| `scripts/check-edge-boot.mjs` | **Yes — directly, as a gate** | Boots every edge function module with stub env and fails on `error: Uncaught …`. **This is the tool that catches a missed lockstep file** (module-level `throw` from a boot invariant). Run it after every cap edit, before deploy. |

**Recommendation:** do NOT build a new driver script. The 21 runs are operator-driven through the production UI with ad-hoc real inputs (locked decision). Build **the query side** instead: a checked-in `.sql` file that regenerates the report from `ai_call_telemetry`. That is the artifact with lasting value.

---

## 7. Anthropic pricing for the models actually used

**Every tier, every feature routes to Claude Haiku 4.5.** Verified in `supabase/functions/_shared/tier-config.ts`:
- Line 98: `export const FREE_MODEL = 'claude-haiku-4-5-20251001';`
- Line 104: `export const DEFAULT_PRO_ELITE_MODEL = FREE_MODEL;` — comment: "All tiers now route to Haiku 4.5 across every feature (cost ceiling applied platform-wide)."
- Lines 106–110: `TIER_MODELS` = Haiku 4.5 for free/pro/elite.
- Line 118: `FEATURE_MODEL_OVERRIDES = {}` (empty).
- `getModel()` (150–168): free is hard-locked to Haiku regardless of overrides (D-13).
- `ANTHROPIC_MODEL_TEXT` / `ANTHROPIC_MODEL_FALLBACK` env vars are documented in `docs/ENVIRONMENT.md` as optional; `analyze-career/index.ts` references an `ANTHROPIC_MODEL_TEXT` constant for its utility extraction calls. **Confirm at report time whether the deployed prod secret overrides the default** — the telemetry `model` column makes this self-verifying, which is a good reason to record it.

**Current rates — Claude Haiku 4.5** `[CITED: platform.claude.com/docs/en/about-claude/pricing, fetched 2026-07-21]`:

| Line item | $ / MTok |
|---|---|
| Base input | **$1.00** |
| 5-minute cache write | **$1.25** |
| 1-hour cache write | $2.00 |
| Cache read (hit) | **$0.10** |
| Output | **$5.00** |
| Batch input / output | $0.50 / $2.50 (not used) |

The repo sends `'anthropic-beta': 'prompt-caching-2024-07-31'` and wraps string system prompts with `cache_control: { type: 'ephemeral' }` (`anthropic.ts:586, 593`) → **5-minute cache**, so use $1.25 write / $0.10 read.

**Report cost formula:**
```
cost_usd = (input_tokens * 1.00
          + cache_creation_input_tokens * 1.25
          + cache_read_input_tokens * 0.10
          + output_tokens * 5.00) / 1_000_000
```
⚠️ Verify the double-count question empirically from the telemetry: in the Anthropic Messages API, `input_tokens` **excludes** cache-creation and cache-read tokens (they are reported separately). Sanity-check one row against a known prompt size before publishing the report. `[ASSUMED — exclusion semantics not re-verified against the API reference this session]`

---

## 8. Output-shape audit surface

| Feature | Prompt file(s) | Lines | What "bounded shape" means here |
|---|---|---|---|
| Resume Analysis | `supabase/functions/_shared/resume-prompts.ts` | 475 | Per-call system blocks (`buildSystemBlocks(callType, …)` consumed at `analyze-resume/index.ts:394`) + `buildFreeConsolidatedPrompt`. Audit: is `criterionFeedback` count fixed at 11? Are per-criterion `feedback` strings length-bounded? Is `rewriteSuggestions` count capped? Is `strengths`/`priorityImprovements` count capped? |
| Career Compass | `supabase/functions/_shared/career-prompts.ts` (397) + the elite `brevityBlock` at `analyze-career/index.ts:1938` | — | **Reference pattern.** The 2026-07-17 fix hard-capped `whyMatchDetails ≤3`, `requiredSkills ≤5`, `recommendedRoles ≤3`, per-role `qualificationSteps ≤4`, `skillGaps ≤3`, plus per-string length guidance. Audit whether `growth` and `elite-extras` prompts got the same treatment (the fix was scoped to `base`). |
| LinkedIn Grader | `supabase/functions/grade-linkedin/prompts.ts` (215) | — | The 2026-07-09 fix hard-capped `topFixes` at 7. Audit: `keyStrengths` count? per-fix string length? section-score array fixed? Schema at `grade-linkedin/schema.ts`, validation at `validation.ts` (incl. `clampLinkedInSectionScores`). |
| Recruiting Lens | `supabase/functions/_shared/recruiting-lens-prompts.ts` (314) | — | 3-call fan-out at 5000 each with **zero ceiling slack**. Never audited. Highest unknown-risk cell in the matrix. |
| Interview Prep | `supabase/functions/_shared/interview-prep-prompts.ts` (252) | — | Out of scope; note findings only. |

**Concrete audit checklist per prompt** (this is what the plan should encode as the audit task's definition of done):
1. Is every top-level array's item count stated as a hard maximum ("exactly N" / "at most N"), not a soft suggestion ("more if warranted")?
2. Is every **nested** array (per-item sub-arrays) also count-bounded? ← the 07-17 failure mode
3. Is per-string length bounded (word/sentence/char guidance)? ← the other half of the 07-17 failure mode
4. Is there an overall "keep the entire response under N tokens" target, and does `cap ≥ 1.8 × target` hold? (Career already enforces this at boot; the other three do not.)
5. Does the schema/validator reject over-long output, or does it just pass it through?

A cell that fails 1–3 gets flagged **"cap cannot be trusted here yet"** in the report per the locked decision.

---

## 9. Deploy mechanics and what constrains a two-deploy phase

**`scripts/deploy.ps1`** (`-Env staging|production|test`):
- Line 154: `supabase link --project-ref $ref` — the single source of truth for target project.
- Line 159: `supabase functions deploy $fn --no-verify-jwt --use-api` per function.
- Lines 94–149: **`npm run verify:baseline` is a HARD precondition, run BEFORE `supabase link`.** Red suite → `exit 1`, nothing linked, nothing deployed. Pinned SEVEN-layer composition (line 125–139): `lint → type-check → vitest → test:edge (offline deno) → test:edge:remote → test:e2e (Playwright) → build`.
- `-SkipVerify` exists but is documented emergency-only (lines 27, 99–107). **Do not plan around it.**
- `deploy-production.ps1` is a thin shim forwarding `-Env production`.
- **PowerShell scripts must stay pure ASCII** (repo memory): Windows PowerShell 5.1 reads them as cp1252 and em-dashes/box-drawing break parsing. If the plan touches any `.ps1`, verify `grep -c $'\xe2'` == 0.

**`supabase/config.toml`:** `verify_jwt = false` for all the AI functions (`analyze-resume` 13–14, `analyze-career` 25–26, `grade-linkedin` 34–35, etc.), consistent with the `--no-verify-jwt` deploy flag. **The telemetry change adds no new function**, so no config.toml change is needed.

**Baseline health (repo memory):** vitest 457, deno `test:ci` 698, Playwright 5 + 1 skipped. `promptfoo test:adversarial:*` is deliberately OFF the gate.

**Constraints this places on the phase:**
1. **Two production deploys minimum** (TEMP caps + telemetry; then final caps). Each costs a full `verify:baseline` run. Bundle the telemetry code with the TEMP-cap edit into ONE deploy.
2. **The prod migration must land BEFORE the code deploy** or every telemetry insert 404s (harmless — it warns and continues — but you lose the measurement). Order: operator applies migration → operator deploys functions → operator runs 21 analyses.
3. **Both deploys are operator-executed.** Claude authors and verifies on preview; a `checkpoint:human` with `autonomous: false` gates each prod action.
4. Test-replica edits are part of the same commit as the config edits — otherwise `verify:baseline` fails and the deploy aborts before linking. This is a *feature*: the gate catches a partial lockstep edit.
5. Frontend `VITE_*` flags: none involved. No Vercel redeploy needed.

---

## 10. Common Pitfalls

### Pitfall 1: A missed lockstep file is a production outage, not a test failure
**What goes wrong:** Editing `pricing-config.ts` without the matching `CALL_CONFIGS` (or vice versa) makes a per-tier sum exceed `getMaxOutput`, and the module-level `for` loop `throw`s at load → Supabase returns `503 / sb-error-code: BOOT_ERROR` on **every** request including `OPTIONS`. `analyze-career` died exactly this way (see `scripts/check-edge-boot.mjs` header).
**Why:** The edge tests are *source-probe* tests — they read `index.ts` as TEXT and assert on substrings — so nothing in `verify:baseline` parsed the module until `check-edge-boot.mjs` was added.
**Avoid:** Use the §2.3 blast-radius table. Run `node scripts/check-edge-boot.mjs` after every cap edit.
**Warning signs:** `503` on OPTIONS/preflight (CLAUDE.md: treat repeated OPTIONS 503 as a routing/boot failure, not a prompt failure).

### Pitfall 2: Adding a static `supabase-client.ts` import to `anthropic.ts`
**What goes wrong:** `anthropic.ts` currently imports only `prompt-sanitizer` and `logger`. A static `import { getServiceClient } from './supabase-client.ts'` pulls `npm:@supabase/supabase-js@2` into every module that imports the Anthropic helper — including offline Deno tests (`anthropic.test.ts`, `prompt-sanitizer.test.ts`) — slowing them and risking network fetch in `--offline` CI. `getServiceClient()` also **throws** if `SUPABASE_URL`/`SERVICE_ROLE_KEY` are absent.
**Avoid:** Put the client behind a `await import()` inside a try/catch in the new `_shared/ai-telemetry.ts`, memoise the failure, and no-op when `AI_TEST_MODE=true`. Never let a telemetry path throw into `invokeAnthropicText`.

### Pitfall 3: Mislabelled tier makes the whole dataset useless
**What goes wrong:** Writing `profiles.subscription_tier` instead of the server-resolved tier records every admin-elite run as `free`.
**Avoid:** Thread the same `resolvedTier` variable the function already uses for `getMaxOutput`. Cross-check against `admin-tier-elevation` log lines. And remember: the admin account **cannot** produce free-tier rows — a separate non-admin prod account is required for the 9 free-tier runs.

### Pitfall 4: Raising `maxTokens` can push the run past the wall-clock deadline
**What goes wrong:** A 12000-token cap that the model actually uses generates for longer. LinkedIn's budget invariant is `client 180_000 (LinkedInGrader.tsx) > server total 165_000 (grade-linkedin/index.ts:61) > per-call 90_000 (tier-config)`; Career's is `client 180_000 (CareerCompass.tsx MAX_POLL_MS) > server 165_000 (CAREER_TOTAL_DEADLINE_MS) > per-call elite 120_000`. Quick task `260713-2ay` is exactly this bug: a widened budget without a widened wall → 408 abort mid-generation.
**Avoid:** During the TEMP window, treat a `408` / abort as a *measurement failure*, not a data point. Record `duration_ms` in telemetry so the report can show whether the wall, not the cap, is the binding constraint. Do **not** widen timeouts in this phase (out of scope) — instead flag it.

### Pitfall 5: Retries double-count and hide the true peak
**What goes wrong:** `analyze-resume/index.ts:472` retries an output-invalid call at `Math.min(baseMaxTokens * 2, 12000)` — a *different* effective cap. `grade-linkedin` retries at `858`, `recruiting-lens` at `437–440`, `analyze-career` at `1465`, `executeFreeAnalysis` at `624`. Without an `attempt` field, a retry row at a doubled cap will be averaged in with first-attempt rows and skew both peak and headroom.
**Avoid:** Record `attempt` and always report first-attempt statistics separately.

### Pitfall 6: Utility extraction calls pollute the per-cell stats
**What goes wrong:** `analyze-career/index.ts:1316` (DOCX extract, 2000), `1358` (OCR, 4000), `1670` (2000), `1745` (4000) all go through `invokeAnthropicText`. Labelled `feature='career_compass'` with no distinct `call_name`, they will drag the Career Compass mean down and be counted as analysis calls.
**Avoid:** Give them explicit `call_name`s (`docx-extract`, `ocr-extract`) and exclude them in the report SQL.

### Pitfall 7: Truncation → 422 → Merit refund is a *terminal* failure, and refunds have a strict convention
**What goes wrong:** `stop_reason === 'max_tokens'` → `truncatedOutputResponse` returns **422 `output_truncated`, `retryable: false`** (`analyze-career/index.ts:292–306`). 422 is deliberately excluded from `isRetryableHttpStatus` so the worker fails terminally on the first response and refunds exactly once via `refundMeritsForJob`. A 500 would be *retryable* and would burn every retry re-generating the identical deterministic stub.
**Related repo-memory convention:** Merit refunds MUST go through the `refund_merits` RPC (matched by `metadata.deduction_id`, **not** row id), never hand-rolled INSERTs. The gateway owns refund control flow (`_shared/merit-gateway.ts:15` — "features never call refund_merits directly (D-03)"). This phase should not write refunds at all (locked decision: accept the real Merit burn), but a plan that "helpfully" adds a refund step would violate D-03.
**Avoid:** The whole point of the TEMP caps is to make truncation impossible during the observation window. If a TEMP-cap run still truncates, that cell's cap is deeply undersized and the peak is unknown — re-run at a higher TEMP value rather than treating `out == maxTokens` as the peak.

### Pitfall 8: Trusting `.planning/maxtoken-tuning/TRACKER.md`
**What goes wrong:** The TRACKER's status matrix reports Career Compass free 12000 and Resume elite 18000. Actual: CC free 4800 (right-sized by `260713-hrd`), Resume elite ceiling 20000 / `CALL_CONFIGS` sum 18000. Several code comments are stale too: `analyze-resume/index.ts:356` says `// 5000` (actual 9000); `grade-linkedin/index.ts:65` says "free 5000 / elite 8000" (actual 12000 / 9000).
**Avoid:** Plan against the source files. Add a task to fix the stale comments in the implementation commit.

### Pitfall 9: `.planning` commits and stray markdown reformats
**Repo memory:** `.planning/` IS tracked — commit normally, never `git add -f`, never `git add -A`/`.`. VSCode Milkdown re-serializes any opened `.md` on autosave (`---`→`***`, escaped underscores); stage specific files and `git status` before committing.

### Pitfall 10: Production is operator-only
**CLAUDE.md + repo memory:** prod ref `zjpjapgraoxdukdvpjes` — Claude may inspect logs/advisors/schema read-only and generate SQL, but **cannot apply destructive changes, deploy edge functions, or run prod writes**. Every prod migration, deploy, and measurement run is an operator step. Preview ref `cimjltzovkahkqecpwgi` is unpaused and is where Claude tests first.
**Also:** honour `autonomous: false` checkpoints even though `auto_advance: true` is set in `.planning/config.json`.

---

## 11. Runtime State Inventory

| Category | Items Found | Action Required |
|---|---|---|
| **Stored data** | New table `public.ai_call_telemetry` (does not exist on prod or preview). Existing `analysis_results`, `analysis_runs`, merit ledger untouched. | Migration + rollback; operator applies to prod |
| **Live service config** | Supabase Edge deployed function bundles on prod may predate the current repo cap values (main == staging in git, but deploy state is independent). `ANTHROPIC_MODEL_TEXT` prod secret may override the Haiku default. | Confirm deployed prod cap values before measuring (read a `[PERF]` line or the new telemetry `max_tokens` column); confirm model from telemetry `model` column |
| **OS-registered state** | None — no Task Scheduler / pm2 / launchd involvement. Verified: no scheduling scripts reference token caps. | None |
| **Secrets / env vars** | `ADMIN_EMAIL` (defaults `strivolife@gmail.com`), `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (needed by the telemetry client — already set on prod for every AI function). No new secret required. | None |
| **Build artifacts** | Frontend bundle embeds `src/config/pricing-config.ts` only for display/paywall purposes; a cap change does not require a Vercel redeploy for correctness, but the file IS imported by the frontend build. | Confirm no `VITE_` surface reads `maxTokensOutput` at runtime; if it does, a frontend deploy is required too |

---

## 12. Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Frontend unit | Vitest 4.1.9 — `npm run test` (`vitest run`) |
| Edge (offline) | Deno 2 — `npm run test:edge` (`deno task test:ci`, `DENO_TEST_SUPABASE_REMOTE=0`) |
| Edge (remote DB) | `npm run test:edge:remote` (preview project via `scripts/with-preview-env.mjs`) |
| E2E | Playwright 1.61 — `npm run test:e2e` |
| Boot gate | `node scripts/check-edge-boot.mjs` |
| Full gate | `npm run verify:baseline` (7 layers, also the deploy precondition) |

### Requirements → Test Map

| Behavior | Test Type | Automated Command | Exists? |
|---|---|---|---|
| Telemetry insert never throws / never fails the analysis | unit (deno) | `deno test supabase/functions/_shared/ai-telemetry.test.ts --no-check --allow-all` | ❌ Wave 0 |
| Telemetry no-ops under `AI_TEST_MODE=true` | unit (deno) | same file | ❌ Wave 0 |
| `invokeAnthropicText` still returns unchanged results with telemetry attached | unit (deno) | `deno test supabase/functions/_shared/anthropic.test.ts --no-check --allow-all` | ✅ extend |
| SC-12 table ↔ snapshot ↔ tier sums reconcile after cap change | unit (vitest) | `npx vitest run src/config/__tests__/sc12-snapshot.test.ts` | ✅ (update title line 24) |
| Per-tier `CALL_CONFIGS` sums ≤ ceiling after cap change | unit (deno) | `deno test supabase/functions/analyze-{resume,career}/index.test.ts --no-check --allow-all` | ✅ (update replicas) |
| No boot-time throw after cap change | integration | `node scripts/check-edge-boot.mjs` | ✅ |
| Migration applies + RLS denies anon/authenticated | integration | preview MCP `apply_migration` + `execute_sql` probe | ✅ manual |
| 21 measurement runs produce ≥ 42 telemetry rows | manual (operator) | SQL count query | manual-only — real UI, ad-hoc inputs, prod |
| Post-change: `out < maxTokens` with headroom, zero 422 | manual (operator) + SQL | report SQL over the re-run window | manual-only |

### Sampling Rate
- **Per task commit:** `npx vitest run src/config/__tests__/sc12-snapshot.test.ts` + targeted `deno test`
- **Per wave merge:** `npm run test && npm run test:edge && node scripts/check-edge-boot.mjs`
- **Phase gate / pre-deploy:** `npm run verify:baseline` (enforced by `deploy.ps1`)

### Wave 0 Gaps
- [ ] `supabase/functions/_shared/ai-telemetry.test.ts` — never-throws contract, AI_TEST_MODE no-op, row shape
- [ ] `.planning/phases/02-ai-token-cost-optimization/02-report-queries.sql` (or `supabase/queries/ai_call_telemetry_report.sql`) — the checked-in regenerating SQL
- [ ] `supabase/migrations/20260721000000_ai_call_telemetry.sql` + `supabase/migrations/rollback/20260721000000_ai_call_telemetry.rollback.sql`

---

## 13. Security Domain

| ASVS Category | Applies | Standard control in this repo |
|---|---|---|
| V2 Authentication | yes | `_shared/auth.ts` `requireAuth` / `requireInternalOrUserAuth`; unchanged by this phase |
| V3 Session Management | no | No session surface touched |
| V4 Access Control | **yes** | New table must be service-role-only: RLS enabled + deny-all policy for `authenticated` + `REVOKE ALL FROM anon, authenticated`. Tier must be read server-side (`tier-config.ts` T-14-01 note), never from the request body |
| V5 Input Validation | yes (indirect) | Telemetry inserts are all server-generated values — no user-controlled strings. **Do not** store prompt or response text in the telemetry table (PII/resume content). Store `output_chars`, not output. |
| V6 Cryptography | no | None |
| V7 Logging | yes | Never log secrets; `_shared/logger.ts` structured JSON with reason codes. Telemetry warn-on-failure must not include the row payload |

| Threat pattern | STRIDE | Mitigation |
|---|---|---|
| Telemetry table leaks resume/profile content | Information Disclosure | Store only counts + identifiers; no prompt/response text |
| Authenticated user reads other users' telemetry | Information Disclosure | Deny-all RLS + explicit REVOKE; no PostgREST exposure |
| Telemetry failure takes down a business-critical flow | Denial of Service | Never-throws contract, memoised disable, no-op in test mode |
| Raised caps used to inflate cost via abuse | Resource abuse | Existing `usage-checker` / merit gateway / rate-limiter unchanged; caps are ceilings not targets. TEMP window is short and operator-monitored |

---

## 14. Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| Service Supabase client in the telemetry path | `createClient(...)` inline | `getServiceClient()` from `_shared/supabase-client.ts` (dynamic import) | Module-level singleton; avoids per-request init |
| Structured logging | `console.log` string concat | `createLogger('ai-telemetry')` from `_shared/logger.ts` | Repo convention; JSON to stdout, reqId-aware |
| Merit refunds | direct INSERT into the ledger | `refund_merits` RPC via `_shared/merit-gateway.ts` | Repo memory: hand-rolled INSERTs drift the ledger and risk double-refund. (Should be zero refunds this phase anyway) |
| Truncation detection | inferring from JSON parse failure | `raw.stop_reason === 'max_tokens'` (`analyze-career/index.ts:279–281`) | `repairTruncatedJSON` will helpfully close braces and hide the truncation |
| Boot-safety check | reading files as text and asserting substrings | `node scripts/check-edge-boot.mjs` | Source-probe tests cannot see a module-level throw |
| Measurement driver | new prod benchmark script | Operator-driven real UI runs + report SQL | Locked decision: ad-hoc real inputs; `validate-career-performance.mjs` explicitly refuses prod |
| Headroom / truncation flags | app-side computation | Postgres `GENERATED ALWAYS AS … STORED` columns | Report SQL and future alerting become trivial |

---

## 15. Code Examples

### Threading telemetry at a call site (resume parallel path)

```ts
// supabase/functions/analyze-resume/index.ts — inside executeParallelCalls' makeCall (~line 392)
const resp = await invokeAnthropicText({
  model: params.model,
  system: buildSystemBlocks(callType, params.promptParams),
  messages: [{ role: 'user', content: params.userPrompt }],
  maxTokens,
  temperature: 0.3,
  fixtureKey: params.fixtureKey,
  telemetry: {
    feature: 'resume_analysis',
    tier: params.tier,          // already the SERVER-resolved tier
    callName: callType,          // 'criteria-1' | 'criteria-2' | 'summary' | 'rewrites'
    reqId: params.reqId,         // NEW: thread the existing 8-char reqId in
    attempt: 1,                  // the retry at :475 passes attempt: 2
  },
});
```

### The write, inside `invokeAnthropicText` (after line 640)

```ts
// supabase/functions/_shared/anthropic.ts — after the existing [PERF] console.log
if (params.telemetry) {
  await recordAiCall({
    feature: params.telemetry.feature,
    tier: params.telemetry.tier,
    call_name: params.telemetry.callName,
    attempt: params.telemetry.attempt ?? 1,
    req_id: params.telemetry.reqId ?? null,
    user_id: params.telemetry.userId ?? null,
    model: params.model,
    max_tokens: clampedMaxTokens,
    input_tokens: usage?.input_tokens ?? null,
    output_tokens: usage?.output_tokens ?? null,
    cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? null,
    cache_read_input_tokens: usage?.cache_read_input_tokens ?? null,
    stop_reason: data?.stop_reason ?? null,
    ok: true,
    http_status: 200,
    duration_ms: Math.round(_tParsed - _t0),
    ttfb_ms: Math.round(_tResponse - _t0),
    output_chars: text.length,
  });
}
```
Mirror a minimal failure row in the `!response.ok` branch (line 618–626) with `ok: false, http_status: response.status`, and in the catch (651) with `http_status: isAbort ? 408 : 500` — timeouts under a raised cap are a first-class finding (Pitfall 4).

### Report SQL — per-cell stats (the checked-in artifact)

```sql
-- 02-report-queries.sql · per-cell peak/mean/headroom, first attempts only,
-- excluding utility extraction calls.
SELECT
  feature, tier, call_name,
  count(*)                                        AS runs,
  min(output_tokens)                              AS out_min,
  round(avg(output_tokens))                       AS out_mean,
  max(output_tokens)                              AS out_peak,
  max(max_tokens)                                 AS cap,
  round(100.0 * (1 - max(output_tokens)::numeric / max(max_tokens)), 1) AS headroom_pct_at_peak,
  ceil(max(output_tokens) * 1.4)                  AS suggested_cap_raw,
  count(*) FILTER (WHERE truncated)               AS truncated_runs
FROM public.ai_call_telemetry
WHERE created_at >= :window_start
  AND attempt = 1
  AND ok
  AND call_name NOT IN ('docx-extract','ocr-extract')
GROUP BY feature, tier, call_name
ORDER BY feature, tier, call_name;
```

```sql
-- cost in dollars (Claude Haiku 4.5 rates, 5-minute cache)
SELECT feature, tier, req_id,
  round(sum(
      input_tokens                * 1.00
    + coalesce(cache_creation_input_tokens,0) * 1.25
    + coalesce(cache_read_input_tokens,0)     * 0.10
    + output_tokens               * 5.00
  ) / 1000000.0, 6) AS usd_per_analysis
FROM public.ai_call_telemetry
WHERE created_at >= :window_start AND ok
GROUP BY feature, tier, req_id
ORDER BY feature, tier;
```

---

## 16. Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|---|---|---|---|---|
| Supabase CLI | migrations + function deploy | ✓ | 2.107.0+ (devDependency) | — |
| Deno 2 | edge tests + `check-edge-boot` | ✓ | per `deno.json` | — |
| Node 22+ / npm | verify:baseline | ✓ | — | — |
| Supabase preview project `cimjltzovkahkqecpwgi` | Claude-side migration test | ✓ (unpaused since 2026-06-24) | — | — |
| Supabase prod `zjpjapgraoxdukdvpjes` | measurement runs | ✓ read-only for Claude | — | **Operator executes all writes/deploys** |
| Non-admin production account | 9 free-tier measurement runs | **UNKNOWN** | — | **BLOCKING — operator must supply/create one** (admin email always resolves to elite) |
| Anthropic API key on prod | measurement | ✓ (existing secret) | — | — |
| Real varied resumes / LinkedIn profiles / job descriptions | 21 runs | operator-supplied at run time | — | `scripts/test-resumes/` fixtures exist as a fallback but are not "substantially different real inputs" |

**Missing with no fallback:** a non-admin production account for free-tier runs. Surface this as the first checkpoint in the plan.

---

## 17. Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | `usage.input_tokens` excludes cache-creation and cache-read tokens (so the cost formula sums them separately without double-counting) | §7 | Reported dollar costs overstated by the cached-prefix amount. Mitigate: sanity-check one row before publishing |
| A2 | Prod's *deployed* edge bundles may lag the repo cap values (CONTEXT says prod lacks the TEMP bumps, but git shows main == staging) | §3.1 | If prod already carries them, the TEMP-cap deploy is smaller than planned. Self-verifying via the telemetry `max_tokens` column |
| A3 | Recruiting Lens has no test replica of its `CALL_CONFIGS` values | §2.2 | An extra lockstep file would be missed → boot throw. Verify by grep during planning |
| A4 | `ANTHROPIC_MODEL_TEXT` is not set on prod (so all calls are Haiku 4.5) | §7 | Wrong pricing in the report. Self-verifying via the telemetry `model` column |
| A5 | The frontend does not read `maxTokensOutput` at runtime in a way that requires a Vercel redeploy after a cap change | §11 | A cap change might need a frontend deploy too. Verify with `rg maxTokensOutput src/` outside `src/config` |
| A6 | Awaiting a PostgREST insert (~10–30 ms) is negligible against 35–90 s AI calls | §1 | Marginal latency increase; measurable in the very telemetry being added |

---

## 18. Open Questions

1. **Which account runs the 9 free-tier analyses?**
   - Known: `strivolife@gmail.com` always resolves to elite (`auth.ts:155–167`). Known: `ADMIN_EMAIL` is env-overridable.
   - Unclear: whether a separate non-admin prod account with Merits exists.
   - Recommendation: make this the phase's first `checkpoint:human`. Prefer a second real account over flipping `ADMIN_EMAIL` (which also changes admin-panel and billing-guard behaviour).

2. **TEMP-cap values — how high?**
   - Known: `ABSOLUTE_MAX_TOKENS = 12000` is the hard per-call clamp; per-tier ceilings are the other binding constraint.
   - Unclear: whether the operator wants ceilings raised (Career 10000 → 19000, RCL 15000 → 27000, Resume 20000 → 30000) or a narrower bump.
   - Recommendation: present §3.2's table at the plan's first checkpoint; the higher the TEMP cap, the more trustworthy the peak.

3. **Do the 21 runs need cache-busting?**
   - Known: `analysis_cache` exists with a `cache_fingerprint`; `RECRUITING_LENS_CACHE_VARIANT` / `LINKEDIN_CACHE_VARIANT` gate cache reuse; a cache hit returns without any Anthropic call → **zero telemetry rows**.
   - Recommendation: use genuinely distinct inputs per run (the locked decision already requires "substantially different" inputs) and verify row counts after each run rather than at the end.

4. **Does `stop_reason` appear on the top-level response for the `output_config`/json_schema path?**
   - Known: `analyze-career` reads `raw.stop_reason` today and it works.
   - Unclear: whether constrained-output calls (`outputSchema` at `anthropic.ts:598–607`) report a different stop_reason vocabulary.
   - Recommendation: record the raw string; do not enum-constrain the column.

---

## Sources

### Primary (HIGH confidence)
- Direct reads of: `supabase/functions/_shared/anthropic.ts`, `_shared/tier-config.ts`, `_shared/supabase-client.ts`, `_shared/auth.ts`, `src/config/pricing-config.ts`, `src/config/pricing-config.snapshot.ts`, `src/config/__tests__/sc12-snapshot.test.ts`, `analyze-resume/index.ts` + `index.test.ts`, `analyze-career/index.ts` + `index.test.ts`, `recruiting-lens/index.ts`, `grade-linkedin/index.ts`, `interview-prep-analyze/index.ts`, `scripts/deploy.ps1`, `scripts/check-edge-boot.mjs`, `scripts/validate-performance.mjs`, `scripts/validate-career-performance.mjs`, `scripts/staging-cache-perf-probe.mjs`, `supabase/config.toml`, `supabase/migrations/*`, `.planning/maxtoken-tuning/TRACKER.md`, `CLAUDE.md`, `package.json`
- `git log` / `git diff main..staging -- src/config/pricing-config.ts` (empty)
- https://platform.claude.com/docs/en/about-claude/pricing — Claude Haiku 4.5 rates, prompt-caching multipliers (fetched 2026-07-21)

### Secondary (MEDIUM confidence)
- Repo memory notes (prod ref, `.planning` tracking, refund RPC convention, PowerShell ASCII, verify:baseline counts, preview unpaused)

### Tertiary (LOW confidence)
- Deployed production edge-function bundle versions (not inspectable from this session; A2)

---

## Metadata

**Confidence breakdown:**
- Codebase map / lockstep sets: **HIGH** — every line reference read directly from source
- Anthropic pricing: **HIGH** — official docs, fetched this session
- Telemetry seam design: **HIGH** — the seam is a single function; the never-throws pattern is standard
- Migration/RLS conventions: **HIGH** — pattern copied verbatim from existing migrations
- TEMP-cap value recommendations: **MEDIUM** — arithmetic is verified against the invariants, but the operator owns the choice
- Prod deployed state: **LOW** — see A2

**Research date:** 2026-07-21
**Valid until:** 2026-08-20 (30 days) — Anthropic pricing and the repo's cap values are the two things that can move; re-verify both if planning slips past that.

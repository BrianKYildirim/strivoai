# 260608-p5k — Resume Analysis Token/Cost/Reliability Work — HANDOFF

**Status:** Active. All commits are on branch `staging` and **NOT deployed** — they only take effect after `.\scripts\deploy-staging.ps1` (or restarting local `supabase functions serve`). Frontend untouched throughout.

**One-line:** What started as "enforce hard per-tier maxToken caps" became a multi-round debugging + optimization of the elite resume-analysis parallel-call architecture (truncation → JSON-merge failures → merit refunds). Now stable and succeeding; remaining work is fine-tuning per-call maxToken budgets to observed output.

***

## How the system works now (elite resume analysis)

`supabase/functions/analyze-resume/index.ts` → `executeParallelCalls()` fans out **parallel Haiku 4.5 calls**, each with its own system prompt (shared rubric prefix + per-call suffix) and the resume as the user message. Results merge in `_shared/result-merger.ts` (`mergeAndValidateResults`). Free tier uses a SEPARATE single consolidated call (`executeFreeAnalysis` / `buildFreeConsolidatedPrompt`) — never touch that for elite work.

**Elite fires 4 calls** (was 5; `elite-extras` disabled — see below):

* `criteria-1` — scores+feedback for C1–C6 (6 criteria, elite feedback = 5 fields each: observation/impact/fix/deeper/rewrite)
* `criteria-2` — C7–C11 (5 criteria)
* `summary` — executiveSummary + strengths + priorityImprovements + industryGuess + suggestedTargetRoles + recommendedKeywords (narrative only)
* `rewrites` — rewriteSuggestions\[] only (dedicated call)
* `elite-extras` — **DISABLED** (budget 0; see Key Findings)

**Per-call budgets** (`CALL_CONFIGS` in `analyze-resume/index.ts` \~line 293, replicated in `index.test.ts` \~line 34). CURRENT (after commit ff83f22):

| call         | Free | Pro   | Elite       |
| ------------ | ---- | ----- | ----------- |
| criteria-1   | 1800 | 5000  | 5000        |
| criteria-2   | 1800 | 5000  | 5000        |
| summary      | 1400 | 5000  | 5000        |
| rewrites     | 0    | 3000  | 3000        |
| elite-extras | 0    | 0     | **0 (off)** |
| **sum**      | 5000 | 18000 | **18000**   |

Hard ceiling: `getMaxOutput('resumeAnalysis','elite') = 20000` in `src/config/pricing-config.ts` (SC-12 table, re-exported via `_shared/tier-config.ts`). A boot-time invariant in `index.ts` throws if any tier's CALL\_CONFIGS sum exceeds the ceiling. Per-call hard clamp `ABSOLUTE_MAX_TOKENS = 12000` in `_shared/anthropic.ts`.

**Resilience layers (already built):**

* `executeParallelCalls` retry: validation-aware. If a call returns ok-but-invalid JSON (truncated / missing field), it retries that ONE call once with extra headroom. Logs the exact reason (`output-invalid: <reason>`).
* Merge is salvage-first: `criteria-1`, `criteria-2`, `summary` are the HARD core (fail → refund). `rewrites` + `elite-extras` fold optionally (fail → `fillDefaults` supplies `[]`/`null`, run still completes).
* `_mergeSource = 'parallel-5'` traceability marker.

***

## Commit trail (all on `staging`, newest first)

* `ff83f22` perf: retune elite budgets to observed output — criteria 4500→5000, summary 4000→5000, rewrites 4500→3000 (summary was MAXING at 4000; rewrites had slack). **← latest**
* `f2c38ef` perf: disable unused `elite-extras` call (eliteInsights read by nothing), redistribute its 5000 budget to the 4 used calls.
* `be609c4` refactor: split into 5 right-sized calls — added dedicated `rewrites` call, made `summary` narrative-only, salvage-first merge, exact retry diagnostics, fixture branch.
* `9a84a63` tune: rewriteSuggestions 8-10→6-7, elite-extras 2000→3000.
* `47442c8` fix: parallel-call scoping — stop each call regenerating the whole report (ELITE\_ADDITIONS in the shared prefix was ordering every call to produce rewrites+eliteInsights); validation-aware retry.
* `e986189` fix: hard-cap elite criteria feedback field lengths.
* `76742e7` fix: size parallel-call output budgets (resume 20K, recruiting 15K).
* `fd76ec7` docs + `5f4ddd7` merge + `47442c8`… (earlier) — the original "hard caps" quick task: corrected the central SC-12 cap tables, clamped the shared Anthropic helper, wired all 5 AI features (resume, career, linkedin, recruiting, interview) to `getMaxOutput`/`getMaxInputChars`.

(Plan file for the most recent optimization: `C:\Users\yildi\.claude\plans\zippy-roaming-sphinx.md`.)

***

## Key findings (so the next session doesn't re-derive them)

1. **`eliteInsights`** **is dead output.** The whole `elite-extras` payload (interviewLikelihood, competitiveRanking, recruiterFirstImpressions, hiddenWeaknesses, powerPhrases, detailedATSGapAnalysis) is generated, persisted, and **read by nothing** — zero `src/` refs, no backend consumer (repo-wide grep). Disabled via budget 0 (reversible: restore budget + build UI to render it).
2. **Per-criterion feedback fields ARE all rendered** (`src/pages/Results.tsx:1152` flattens observation/impact/fix/deeper/rewrite into the criterion bullet list) — so they CANNOT be trimmed to save tokens. Truncation must be solved with budget, not field cuts.
3. **Prompt caching is silently dead.** `cache_control` is sent correctly (`anthropic.ts` \~673/826, `buildSystemBlocks`), but the shared rubric prefix is \~2200 tokens — **below Haiku 4.5's 4096-token cache minimum** — so the API ignores it. Concurrent calls would also race the write. Input is \~20% of cost. Not worth contorting the prompt. The PERF log already prints `cache_create=/cache_read=` when non-zero (will always be 0 here).
4. **Result caching works** — exact sha256(normalized resume) + tier + targetRole (`cache-fingerprint.ts`). True re-runs are instant. "Similar-enough" fuzzy reuse was DEFERRED (needs embeddings; privacy/correctness hazard of serving a "similar" stranger's analysis).
5. **Root cause of the long saga:** `ELITE_ADDITIONS` lived in the SHARED prefix every parallel call received, ordering EVERY call to produce rewriteSuggestions + eliteInsights → each call tried to generate the whole report → truncation. Fixed in `47442c8` (parallel-call scoping) + `be609c4` (dedicated rewrites call).
6. **Calls are non-streaming** (`invokeAnthropicText`), so TTFB == full duration; wall-clock = slowest call. Per-call timeout for elite = 155s (`tier-config.ts` TIER\_TIMEOUTS). User declined partial-result streaming — keep the spinner.

***

## Latest production data (the two runs you pasted) + what it means

Elite run, 4 calls:

* criteria-1: `out=4452 / max=4500` — natural stop, but TIGHT (99%)
* criteria-2: `out=4348 / max=4500` — natural, tight (97%)
* summary: `out=4000 / max=4000` — **MAXED → truncated** (this was the problem)
* rewrites: `out=2352 / max=4500` — natural, only 52% used (slack)

→ Acted on this in `ff83f22`: moved budget from rewrites (had slack) to summary (was maxing) and criteria (tight). New: criteria 5000, summary 5000, rewrites 3000.

***

## NEXT STEPS (for the new session)

1. **Redeploy** (`.\scripts\deploy-staging.ps1` or restart `supabase functions serve`) — the budget retune is committed but not live.
2. **Run 2–3 elite analyses and read the** **`[PERF]`** **lines.** Target: every call `out < max` (natural stop) with modest headroom; no `[parallel] Retrying …`; no `Validation failed` / merit refund.
3. **Iterate the budgets** if any call still maxes or has large slack. Current budgets sum to 18000/20000 → there's 2000 of headroom to allocate if needed. Edit `CALL_CONFIGS` in BOTH `analyze-resume/index.ts` (\~line 293) AND the replica + sum assertions in `analyze-resume/index.test.ts` (\~line 34, and the `assertEquals(sum, 18000)` lines + the bad-config `sum 24000` threshold). Keep elite sum ≤ 20000.
4. **Verify:** `deno check supabase/functions/analyze-resume/index.ts` + `deno test supabase/functions/analyze-resume/index.test.ts supabase/functions/_shared/result-merger.test.ts --no-check --allow-all`.

### Watch-outs

* If `summary` still maxes at 5000, it genuinely wants more — give it 5500–6000 (pull from rewrites, which only needs \~2500–3000) or from the 2000 spare.
* If `criteria` max at 5000, that's a denser resume than the sample; they can go to 5500 (sum would be 19000, still ≤ 20000).
* Don't trim per-criterion feedback fields (they're rendered — finding #2).
* The whole pipeline is gated by the boot invariant — if the sum exceeds 20000 the function throws on import (caught by the index.test.ts replica test).

### Known-unrelated noise

* `cost-map-invariant.test.ts` errors under Deno (imports a frontend `@/` alias) — PRE-EXISTING, not ours.
* Frontend vitest has a flaky OutcomeOverdueBanner failure — known, ignore (per project memory).

***

## Optional future work (not requested, parked)

* Surface `eliteInsights` in the UI (it's 90% built backend-side; would re-justify the elite-extras call). Product decision.
* Partial-result streaming (show scores before slower calls finish) — user declined for now; infra partly exists (`streamAnthropicText` unused, `UniversalAnalyzing` clock-driven, `useResumeStream` handles chunk/complete/error).


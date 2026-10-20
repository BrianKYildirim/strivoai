# Phase 5: Feature Migration B — Resume Analysis + Onboarding - Research

**Researched:** 2026-07-05
**Domain:** Adopting the dormant Phase-3 shared analysis lifecycle onto the two highest-traffic resume features — a **streaming SSE** feature (Resume Analysis, preserve-exactly) and a **fire-and-forget non-streaming** feature (Onboarding, real repair) — on Supabase Edge (Deno) + React/Vite, no new infrastructure.
**Confidence:** HIGH (every finding is a direct read of the current code + shipped Phase-3 substrate + shipped Phase-4 reference adoption; line numbers cited). MEDIUM only where a design choice is left to the planner (flagged in Open Questions).

> **Nature of this research:** This is NOT a library/ecosystem investigation — the milestone **forbids new infrastructure** (REQUIREMENTS.md "Out of Scope": no external queue/Redis/new SDKs/validation libs). The entire "stack" is the in-repo `_shared/` lifecycle substrate (shipped dormant in Phase 3) and the Phase-4 `grade-linkedin` / `recruiting-lens` adoption pattern. No Context7/WebSearch was warranted; all confidence derives from direct code reads. Where I write "recommend," it is a code-grounded design recommendation for the planner, not an unverified claim.

---

<user_constraints>
## User Constraints (from 05-CONTEXT.md)

These are **LOCKED**. The planner MUST honor them verbatim. Research explains HOW to implement them, never whether.

### Locked Decisions

**Streaming path × lifecycle record (Resume Analysis — preserve-exactly):**
- **D-01:** The SSE `analyze-resume` path gains a **full persistent lifecycle run created at stream start**: `create_or_recover_analysis_run` with the edge-derived idempotency key → reserve Merits via `withMerits` **with the key it omits today** (`index.ts:729`, `meritCtx` at `index.ts:728`) → stream to the browser **byte-identically** → strict-validate the accumulated final result → save → **settle-on-saved**. Refresh/navigation recovers via `run_id` + `useAnalysisRun`. Financial safety + recovery, **no latency regression** (added work = one insert before first token + transitions around the stream, not in the token path).
- **D-02 (executor tension — the research-flagged deep-design spot):** the Phase-3 `runAnalysisLifecycle` executor is **request/response-shaped and LOCKED**. Do **NOT** bend it into a streaming executor. The **streaming path orchestrates the same lifecycle RPCs + `withMerits` seam + `_shared/llm-validation.ts` directly** (a thin streaming-aware lifecycle wrapper) so the executor contract stays untouched and streaming latency/UX is unchanged. **Non-streaming** resume paths (Pro/Elite direct request/response, worker-invoked) MAY use the full executor unchanged.
- **D-03 (dual-path identity — Pitfall 1/5):** a streaming attempt and any non-streaming/worker retry of the **same** attempt must derive the **same** idempotency key (same user+feature+tier+input-identity+attempt-nonce) so the partial-UNIQUE active index + `already_deducted` guarantee **exactly one charge + one run + one History row**. A deliberate new run mints a fresh attempt-nonce.

**Onboarding hang fix + wait UX (FEAT-01 — the real repair):**
- **D-04:** Migrate Onboarding onto **`runAnalysisLifecycle('onboarding')`** — keep it **non-streaming** (clean full-executor adoption). Mint an `attemptNonce` + persist a `run_id`; the fire-and-forget browser fetch that abandons a slow run (`Onboarding.tsx:372-382`) is **removed**.
- **D-05:** The frontend onboarding→Results flow adopts **`useAnalysisRun`**: `run_id` in URL/localStorage, subscribe-first / poll-fallback, **refresh/navigation recovers the live run**. The hard **120s `MAX_POLLING_TIME` cap is replaced** by lifecycle terminal states + the Phase-3 reaper. "Analysis Taking Longer Than Expected" becomes an **honest, recoverable progress state**; a genuine failure reaches a **specific terminal error** (killing the silent-timeout dead-end at `Results.tsx:604`). No fabricated success; Merits release/refund safely (made structural by settle-on-saved).
- **D-06 (wait-UX fork — RESOLVED):** during a slow onboarding run the user **stays on the results/progress screen with run-id recovery** — NOT a proactive "proceed into the app and notify-later" surface. Proceed-into-app-and-notify → deferred.
- **D-07 (ordering + Free-tier correctness):** preserve the existing **awaited** upload → signed-URL → `resumes` insert → text-extraction (incl. OCR) sequence so analysis only starts after the file is accessible and extraction completes; confirm the correct Free-tier path (`FREE_MODEL` = Haiku 4.5, `getTimeout('free')` = 50s, `FREE_SINGLE_CALL_MAX_TOKENS` = 5000, single-consolidated-call + quality-floor retry, `analyze-resume` endpoint). Duplicate onboarding interaction cannot create duplicate analyses/charges (idempotency key + active-run index).

**Orphaned queue path scope:**
- **D-08:** **Leave `submit-resume-analysis-job` / `process-resume-analysis-job` dormant and untouched.** Dead infra for resume (zero `src/` callers; the 529→queue fallback in `useResumeStream.ts` was never implemented). The streaming lifecycle record (D-01) already covers the overload-recovery case. Reviving it and retiring it are both **out of scope**.

**Preserve-exactly boundary + duplicate guard (FEAT-02):**
- **D-09 (byte-preserve):** Preserve **exactly** — Free single-call prompt/schema/**Haiku 4.5**/maxTokens 5000/quality-floor retry; Pro/Elite 4-call parallel + merge; the streaming partial-render UX + progress stages; the triple-write persistence targets (`resumes` + `analysis_results` + `analysis_cache`). No redesign/simplification/quality reduction.
- **D-10 (validation reconciliation — critical):** strict no-masking validation (LIFE-07) changes **failure handling only** — it fails a genuinely malformed / truncated / empty result honestly (specific terminal error + safe Merit refund) instead of rendering garbage; a currently-valid **success** output stays **byte-identical**. The resume feature-specific semantic check MUST be tuned so it never rejects an output the current lenient path accepts. Progressive **partial-summary** rendering during streaming is preserved (validation applies to the final accumulated result before persistence, not the in-flight partials).
- **D-11 (duplicate-submission disable — two layers, Pitfall 5):** backend **atomic partial-UNIQUE active-per-feature index** via `create_or_recover_analysis_run` **replaces the WR-04 status-window TOCTOU** (SELECT-active-then-INSERT) so N parallel identical submits yield **exactly 1 run + 1 deduction**; frontend **submit-lock** (disable the analyze/submit control while a run is active, via `useAnalysisRun` state / `AnalysisLockContext`).
- **D-12 (CORS re-proof, not a new fix):** `analyze-resume` already uses `withCors(req,'user',…)`. The "confirmed production cross-origin failure" is the historical apex-vs-`www` outage Phase 1 fixed centrally (`APP_URL` → `ALLOWED_ORIGINS`). Phase 5 **re-verifies** it live for `strivoai.net` and `www.strivoai.net` and guards it (preserve the `withCors` wrapper + deployed `ALLOWED_ORIGINS` includes both; keep `auth.ts` CORS-attached 401s).

### Claude's Discretion

- The **stable input-identity hash + canonical serialization** for Resume/Onboarding cache/idempotency identity (resume content-hash + resumeId + tier + variant; order-independent, collision-resistant, **never** a save-mutated field) — follows the LOCKED `deriveIdempotencyKey` contract; exact source fields are Claude's.
- The precise shape of the **streaming-aware lifecycle wrapper** (D-02) — how the SSE handler drives create_or_recover → transition around the stream, where merit reserve/settle sits relative to the TransformStream, how the accumulated result is validated before save. Invariant: "reserve→stream→validate→save→settle-on-saved, executor contract untouched, UX byte-preserved," not a specific wiring.
- Reconciling the executor's single-value `save` contract with the **triple-write** (`resumes` + `analysis_results` + `analysis_cache`) — which write is the authoritative throws-pre-settle `save` (recommend `resumes.grading_data` since Results.tsx/History read it) and which are post-save best-effort log-and-continue (mirror the Phase-4 `grade-linkedin` save() pattern).
- Whether Onboarding invokes the lifecycle **in the edge function** (`analyze-resume` calls `runAnalysisLifecycle('onboarding')` when the run originates from onboarding) vs a distinct trigger — provided onboarding gets a persisted `run_id`. Claude decides how the one `analyze-resume` endpoint distinguishes the two features' runs.
- The **plan sub-ordering** (ROADMAP sketch 05-01 Onboarding → 05-02 Resume streaming record → 05-03 scenario coverage is a starting point).
- The exact **frontend recovery wiring** for the streaming path (how `useResumeStream` and `useAnalysisRun` coexist — whether `useResumeStream` gains run_id/recovery or `useAnalysisRun` wraps it). Contract: "run_id-backed refresh/navigation recovery + preserve-previous-success + submit-lock."

### Deferred Ideas (OUT OF SCOPE)

- **Proactive "proceed into the app + notify when ready" onboarding UX** (D-06 alt) — overlaps Phase 7 dashboard surfacing.
- **Reviving the orphaned resume async queue** as a real 529→queue overload fallback (D-08 alt) — the streaming lifecycle record covers overload recovery.
- **Retiring the dead `submit/process-resume-analysis-job` endpoints** — Phase 8 / hygiene pass.
- **Career Compass full-pipeline migration** (FEAT-05) → Phase 6.
- **Dashboard intelligence reading stored resume analysis data** (DASH-01..06) → Phase 7.
- **Any new Resume Analysis / Onboarding product capability** (new output sections, redesign, streaming for onboarding) — out of scope.
</user_constraints>

---

## Summary

Phase 5 has **two very different shapes** riding the same `analyze-resume` endpoint and the same shipped-dormant Phase-3 substrate:

1. **Onboarding = the clean full-executor adoption (real repair).** The hang is a **frontend-abandonment bug**, not a backend failure: `Onboarding.tsx:372-382` fires `invokeWithTimeout('analyze-resume', …, 120000)`, immediately `navigate()`s away (L379), and only `console.error`s on failure (L382). The analysis often completes and persists moments after `Results.tsx`'s hard `MAX_POLLING_TIME=120000` cap (L213, L506-511) fires the "Analysis Taking Longer Than Expected" dead-end (L604-625). The fix is exactly what Phase 3 built: route onboarding through `runAnalysisLifecycle('onboarding')` (a persisted `run_id` + terminal states + reaper), and have the frontend track the `run_id` via `useAnalysisRun` instead of racing a 120s timer. This is a **near-verbatim mirror of the Phase-4 `grade-linkedin` inline-driver adoption** (`grade-linkedin/index.ts:373-489`) and `recruiting-lens` (`recruiting-lens/index.ts:584-695`).

2. **Resume Analysis = preserve-exactly wiring with one hard spot: the streaming SSE record (D-01/D-02).** `analyze-resume` today wraps its whole analysis inside `withMerits` (`index.ts:729`) and returns a `TransformStream` `Response` (L800-965); it passes **NO idempotency key** (`meritCtx` at L728 is `{userId,tier,corsType}` only) and has **no server run record** — so every deduction is non-idempotent and a mid-stream death is unrecoverable. The LOCKED executor (`_shared/analysis-lifecycle.ts:212`) is request/response-shaped (`generate()` returns a string, `save(value)` writes once, then it returns) and **cannot** wrap a stream without regressing latency/UX. The recommendation is a **thin streaming-aware wrapper** that reuses the same primitives (`deriveIdempotencyKey`, `create_or_recover_analysis_run`, `transition_analysis_run`, `withMerits` with the key, `refundMeritsForJob`, and a resume `validateModelOutput` seam) in the exact order the executor enforces, but keeps the TransformStream token path untouched.

**Primary recommendation:** Build **three adoption seams**, all behind the two independent dormancy flags (`ANALYSIS_LIFECYCLE_ONBOARDING`, `ANALYSIS_LIFECYCLE_RESUME`) + the `ANALYSIS_LIFECYCLE_ENABLED` master, with byte-identical legacy fall-through when off (the Phase-4 `dormant:true` pattern): (a) **Onboarding** → full executor (`runAnalysisLifecycle('onboarding')`); (b) **Resume streaming** → a streaming-aware wrapper that orchestrates the same RPCs directly; (c) **Resume non-streaming (Pro/Elite direct + dead worker path)** → full executor. Thread ONE derived idempotency key per attempt everywhere (closes `index.ts:728`). Reconcile the triple-write by making `resumes.grading_data` the authoritative throws-pre-settle `save`, with `analysis_results` + `analysis_cache` post-save best-effort. Reconcile validation by validating the **final assembled result object** (never the in-flight SSE partials), with a resume schema + `semanticCheck` tuned to `passesQualityFloor` so no currently-valid success is ever rejected. **No new DB migration is required** — the Phase-3 ledger + RPCs + partial-UNIQUE index + realtime are feature-agnostic and already shipped; Phase 5 is code + flag flips + live CORS re-proof.

---

## Standard Stack (the in-repo substrate this phase adopts)

### Core — shipped dormant in Phase 3, proven live-dormant in Phase 4

| Module | Location | Purpose | How Phase 5 uses it |
|--------|----------|---------|---------------------|
| `runAnalysisLifecycle` executor | `_shared/analysis-lifecycle.ts:212` | Request/response ordered lifecycle (created→…→completed), single-source idempotency, refund-exactly-once-pre-saving, settle-on-saved, transient-only retry | **Onboarding** (D-04) + **non-streaming resume** (D-01). NOT the streaming path (D-02 — do not make it streaming-aware). |
| `deriveIdempotencyKey` | `_shared/idempotency-key.ts:85` | SHA-256 over sorted-key JSON of `{userId, feature(=meritFeature), tier, inputIdentity, attemptNonce}` → 64-char hex | All three seams; the streaming wrapper calls it directly (executor calls it internally at `analysis-lifecycle.ts:233`). |
| `withMerits` (4-arg idempotent seam) | `_shared/merit-gateway.ts:149`, key forwarded at `:217` | Rate-limit → `check_and_deduct_merits(p_idempotency_key)` → run fn → classify/refund. `MeritGatewayContext.idempotencyKey` at `:95`. | Streaming wrapper reserves with the key (closes `analyze-resume:728`); `precheck_cache` option (`:124`) preserves cache-hit short-circuit. |
| `refundMeritsForJob` | `_shared/merit-gateway.ts:327` | Gateway-owned refund by `transactionId` (idempotent; `already_refunded` safe) | The ONLY refund surface for the streaming wrapper's pre-saving failure branches (mirrors executor `refundAndFail` at `analysis-lifecycle.ts:291`). |
| `create_or_recover_analysis_run` RPC | migration `20260702000001_...ledger.sql:194` | Advisory-lock atomic create-or-recover; partial-UNIQUE active index (`:175`) = the TOCTOU-free dedup (D-11) | Both features' run row; replaces `submit-resume-analysis-job`'s WR-04 SELECT-window. |
| `transition_analysis_run` RPC | migration `...ledger.sql:297` | Monotonic CAS state move + legacy `status` dual-write; whitelisted `p_patch` (incl. `merit_settled`, `refunded`, `failure_code/stage`) | Streaming wrapper drives transitions directly around the TransformStream. |
| `validateModelOutput` + `LlmValidationOptions.semanticCheck` | `_shared/llm-validation.ts:60` | Strict no-masking: empty → parse → truncation → empty/generic → zod → semanticCheck; typed `AnalysisErrorCode` on every failure, never substitutes | The resume/onboarding validation seam (D-10). **Caution:** truncation detector (`:87`) is stricter than the current free path — see Validation Reconciliation. |
| `isAnalysisFeatureEnabled` + flags | `_shared/analysis-flags.ts:78`; `resume`/`onboarding` in the union at `:37-42`; env at `:56-62` | Two-level fail-closed (`master && per-feature`), exact-lowercase-`'true'` | Independent flips for `ANALYSIS_LIFECYCLE_RESUME` vs `ANALYSIS_LIFECYCLE_ONBOARDING`. |
| `useAnalysisRun` recovery hook | `src/hooks/useAnalysisRun.ts:224` | Subscribe-first (`analysis_jobs` postgres_changes) / poll-fallback (`get-analysis-run-status`), `run_id` URL+localStorage, retry-only-retryable, preserve-previous-success, `meritStatus` from the row | Frontend recovery for BOTH features. Gated by `isAnalysisLifecycleEnabled()` (`src/config/feature-flags.ts:42`, `VITE_FEATURE_ANALYSIS_LIFECYCLE`). |
| `get-analysis-run-status` endpoint | `supabase/functions/get-analysis-run-status/` | Owner-scoped leak-free run projection (poll fallback) | Consumed by `useAnalysisRun`; feature-agnostic. |
| `src/lib/analysisError.ts` | (frontend taxonomy mirror) | 13-code → `{message, retryable}`, fail-closed | Drives `useAnalysisRun.errorMessage` + `canRetry`. |
| `UniversalAnalyzing` | `src/components/UniversalAnalyzing.tsx` | Honest named-stage / asymptotic progress | The onboarding wait-UX progress surface (D-05). |

### Supporting — resume-specific code to preserve verbatim (D-09)

| Asset | Location | Preserve exactly |
|-------|----------|------------------|
| Free single-call path | `analyze-resume/index.ts:562-630` (`executeFreeAnalysis`), called at `:814` (stream) / `:972` (non-stream) | Haiku 4.5, `FREE_SINGLE_CALL_MAX_TOKENS=5000` (`:333`), quality-floor retry (`passesQualityFloor` `:539`, temp 0.4 retry `:604`), `reconcileScore` `:507`, `applyTierShape` |
| Pro/Elite 4-call parallel + merge | `executeParallelCalls` `:358`, called at `:849`/`:990`; `mergeValidated` (`_shared/result-merger.ts`) | Per-call budgets `CALL_CONFIGS:317`, single-call retry, fallback-single path |
| Streaming SSE UX | TransformStream `:801-965`; synthetic chunk events (`{"overallScore":` `:809`, summary chunk `:826`, `"criteria":` `:827`, `complete` `:831`) | The chunk/complete/error SSE protocol `useResumeStream.ts` parses (`:216-338`); `extractPartialSummary` progressive render (`:61`) |
| Triple-write persistence | `persistAndCacheResumeResult` `:733-755` → `completeAndRecordSuccess:71` (`resumes.grading_data`+`overall_score` owner-scoped `:90-94`, `analysis_results` `:26`, `analysis_cache` `:224`), usage log-and-continue no-refund `:114-120` | History routes on `analysis_results.source_reference=resumeId` (`:44`); `resumes.grading_data` is what `Results.tsx`/`AnalysisHistory` read |
| CORS wrapper | `serve((req) => withCors(req,'user', …, {extraHeaders:'x-internal-job-secret'}))` `:632`/`:1093`; `corsHeaders({type:'user', extraHeaders:'x-internal-job-secret'})` on every exit | D-12 re-proof — do not alter |
| Tier config | `_shared/tier-config.ts`: `FREE_MODEL:55`, `getTimeout('free')=50_000` (`:28`), `getModel` D-13 free-lock `:107` | D-07 Free-tier correctness |

### Alternatives Considered (and rejected per LOCKED decisions)

| Instead of | Rejected alternative | Why (per CONTEXT) |
|------------|----------------------|-------------------|
| Streaming-aware wrapper orchestrating RPCs directly (D-02) | Bend `runAnalysisLifecycle` into a streaming executor | Violates the LOCKED executor contract; would change all 3 existing adoptions |
| Streaming persistent record (D-01) | "Lightweight alongside-record" | Misses `run_id`-backed refresh/navigation recovery |
| Streaming record subsumes overload recovery (D-08) | Wire the 529→queue fallback into `useResumeStream` | Scope creep; a whole second lifecycle-integrated path |
| Stay-on-results + run-id recovery (D-06) | Proceed-into-app + notify-later | New notification/background-completion surface; drifts to Phase 7 |

**Installation:** none. No package changes. `npm`/deno dependency graph is unchanged (milestone guardrail).

---

## Architecture Patterns

### The Phase-4 adoption pattern (the reference to mirror)

Both `grade-linkedin` (`index.ts:344-510`) and `recruiting-lens` (`index.ts:565-695`) follow an identical shape. **Onboarding + non-streaming resume should copy it near-verbatim:**

```
1. Resolve tier server-side from userContext (never rawBody.tier).
2. Validate inputs BEFORE any merit/tier logic (400 on too-short).
3. Sanitize + hard input-cap the text (existing helpers).
4. Derive a STABLE inputIdentity hash (content-hash + ids; NEVER a save-mutated field).
5. attemptNonce = body.attemptNonce (string) ?? crypto.randomUUID() (fail-closed: nonce-less resubmit simply does not dedup).
6. Call runAnalysisLifecycle({ feature, meritFeature, ctx, jobType, inputIdentity, attemptNonce, extract, generate, schema, validationOpts, save }).
7. if (result.ok)      → return byte-preserved body + { run_id, recordId }.
   if (!result.dormant) → return result.response ?? a generic 500 (code for logs only).
   if (result.dormant)  → FALL THROUGH to today's byte-identical legacy path (100% of traffic while flags OFF).
```

**Key sub-pattern — save() throws-pre-settle; mirrors log-and-continue** (`grade-linkedin:429-488`): the ONE authoritative durable write `throw`s on failure (executor rests in `retryable_failed`, refunds, never settles — Pitfall 3). Everything after the authoritative insert (`analysis_results` mirror, `analysis_cache`, `usage_tracking`, email, extract webhook) is **best-effort log-and-continue** (Pitfall 2 — never a refund-after-save).

### Onboarding wiring (D-04/D-05) — full executor

`extract`/`generate`/`save` for onboarding map cleanly onto the existing free path:

- **`meritFeature: 'resume_analysis'`** (same merit cost/History as normal resume; the DB `check_and_deduct_merits` reads `merit_feature_costs`, not the local `MERIT_COST` map at `analyze-resume:336`).
- **`feature: 'onboarding'`** (the dormancy key → gates on `ANALYSIS_LIFECYCLE_ONBOARDING`, independent of resume's flag).
- **`inputIdentity`** = stable hash of normalized `resumeText` + `resumeId` + tier + variant (see Idempotency section).
- **`extract`** = resolve `{resumeText}` (already extracted client-side; onboarding pre-extracts before invoking, D-07). Optionally re-read from `resumes.extracted_text` server-side for a trusted copy.
- **`generate`** = the existing free single-call body (`executeFreeAnalysis` logic) returning **raw model JSON text** for `validateModelOutput` — OR (safer, see Validation Reconciliation) return the assembled+reconciled object serialized. Onboarding is always Free tier.
- **`schema` + `validationOpts.semanticCheck`** = the new resume validation seam (below).
- **`save`** = the triple-write with `resumes.grading_data` authoritative (throws), the rest best-effort.

**How `analyze-resume` distinguishes onboarding vs resume (discretion, RECOMMENDED):** add an explicit `origin: 'onboarding'` field to the onboarding request body. The edge reads it and picks `feature:'onboarding'` (non-streaming full executor) vs `feature:'resume'` (streaming wrapper when `stream===true`, or non-streaming full executor for Pro/Elite direct). **Do NOT** infer onboarding from "`stream !== true`" alone — that conflates onboarding with the dead worker path and any future non-streaming resume call, and it wires the wrong per-feature flag. An explicit discriminator keeps the two flags independently flippable.

### Streaming-aware lifecycle wrapper (D-01/D-02) — the deep-design spot

The executor's shape (`generate:(txId,extracted)=>Promise<string>` then `validateModelOutput` then single `save(value)` then return) does not fit SSE because the browser must receive the token stream **while** the model runs, and the run must resolve **after** the `Response` is already returned. Recommended wrapper, reusing the executor's exact ordering and primitives:

**Before returning the readable `Response` (pre-first-byte, a handful of fast RPCs — the "one insert + transitions," NOT the model call):**
1. `idempotencyKey = await deriveIdempotencyKey({userId, feature:'resume_analysis', tier, inputIdentity, attemptNonce})` (SHA-256, microseconds).
2. `create_or_recover_analysis_run(p_idempotency_key=key, p_feature='resume_analysis', p_job_type='resume_analysis', p_resume_id=resumeId, …)` → `runId`. (Recovered active run → attach to it; see Open Q3.)
3. `transition created→validating_inputs` (+ input check; a missing input is permanent, no merit reserved → straight to `failed`, no refund).
4. `transition validating_inputs→reserving_merits`; `withMerits(meritCtx-with-key, 'resume_analysis', async txId => txId, {precheck_cache})`. If `!gated.ok` → `transition reserving_merits→failed`, return `gated.response`. A cache hit (`transactionId==='cache-hit'`) short-circuits to the cached SSE `complete` (preserve `responseForResumeResult(..., stream)` at `:135`).
5. `transition reserving_merits→extracting_data→generating`.
6. Build the TransformStream and **return `new Response(readable, {SSE headers})`** immediately (byte-identical to `:956`).

**Inside the (unawaited) IIFE — the token path, byte-preserved:**
7. Emit the existing synthetic chunks (`{"overallScore":`, summary chunk, `"criteria":`) exactly as today (`:809-827`). Run `executeFreeAnalysis` (free) or `executeParallelCalls`+`mergeValidated`+`reconcileScore` (Pro/Elite) unchanged.
8. On assembled final result: **strict-validate the final result object** (D-10 — see below). On invalid → `refundMeritsForJob` + `transition generating→failed` (or `retryable_failed`), emit SSE `error`, close. (This is the D-01 improvement: a mid-stream 529/overload now lands in `retryable_failed` for `useAnalysisRun` Retry instead of silently dying — subsuming the never-wired 529→queue fallback, D-08.)
9. On valid → `transition generating→validating_output→saving`; run the triple-write with `resumes.grading_data` authoritative (throws → `refundMeritsForJob` + `transition saving→retryable_failed`, matching executor `:360`).
10. `transition saving→completed { merit_settled:true }` — **point of no return** (mirrors `analysis-lifecycle.ts:366`). Post-save mirror writes (`analysis_results`, `analysis_cache`, usage, extract webhook) are best-effort log-and-continue. Emit SSE `complete { result, run_id }`.

**Latency invariant:** the only work added before the first SSE byte is step 1 (hash) + steps 2-5 (≈5 fast service-role RPCs). The model call (`invokeAnthropicText`, tens of seconds) dominates and is unchanged. This satisfies "no latency regression" (D-01). Consider collapsing 3-5 into fewer transitions if pre-byte RPC count is a concern (Open Q4).

**Where refund/settle sit relative to the TransformStream:** reserve **before** the stream opens (step 4); settle **after** the durable save inside the IIFE (step 10). Refund fires only from IIFE branches lexically before step 10 (steps 8-9) via `refundMeritsForJob` — never after `completed`. This is the same financial discipline the executor enforces, re-expressed for the streaming control flow. Today's IIFE already owns refunds via `refundMeritsForJob(userContext.userId, _txId, …)` at `:835`/`:841`/`:946` — the wrapper reuses that exact pattern, adding the run-row transitions.

### Anti-Patterns to Avoid

- **Making `runAnalysisLifecycle` streaming-aware** (D-02 forbids). It stays request/response for onboarding + non-streaming resume.
- **Validating the in-flight SSE partials** (`accumulated` in `useResumeStream:211`). Validation applies to the **final assembled result object only** (D-10). The SSE chunks are synthetic/partial by design; running `validateModelOutput` on them would false-fail.
- **Deducting on Upload submit.** Today the single optimistic deduction fires at stream start inside `useResumeStream` (`:117`, T-31-07 double-deduct guard). Keep exactly one deduction per attempt; the server-side `withMerits` deduction is the source of truth, the client `optimisticDeduct` is UX-only.
- **Composing the idempotency/cache key from a save-mutated field** (Pitfall 8 — the LinkedIn `prior_grade_id` bug). Resume's identity is the resume content-hash + resumeId + tier + variant, never `analyzed_at`/`grading_data`/`overall_score`.
- **Throwing `MeritRefundable` after the durable save** (Pitfall 2). The resume path already fixed this at `:114-120` (usage log-and-continue) — keep that posture for all post-save steps.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Atomic single-active-run dedup | A new SELECT-active-then-INSERT check (the WR-04 TOCTOU) | `create_or_recover_analysis_run` + partial-UNIQUE index (`ledger.sql:175`) | The index is the atomic guarantee (D-11 / Pitfall 5); a SELECT window races under concurrency |
| Idempotency key | A client UUID or a per-request random | `deriveIdempotencyKey` (edge-derived intent hash) | Client keys are forgeable; a random re-fire re-charges (Pitfall 1). Same-attempt streaming vs worker retry must derive the SAME key (D-03) |
| Refund on failure | `refund_merits` RPC called from feature code | `refundMeritsForJob` (gateway-owned) from pre-saving branches only | Gateway owns refund control flow; refunds only from pre-`saving` states (Pitfall 2/3) |
| Stuck-run recovery / "Taking Longer" | A longer frontend timeout | Lifecycle terminal states + the Phase-3 reaper (`reap-stale-analysis-runs`) | The hang is abandonment, not slowness; a longer timer just moves the dead-end (Pitfall 4) |
| Output validation | A bespoke "is it good enough" check that substitutes defaults | `validateModelOutput` + a tuned `semanticCheck` | No-masking contract: invalid → typed error + refund, never a fabricated body (LIFE-07 / Pitfall 9) |
| Refresh/navigation recovery | New polling in `Results.tsx` | `useAnalysisRun` (subscribe-first/poll-fallback, run_id persistence) | Already built + dormant; the 120s cap (`Results.tsx:213`) is what it replaces |
| Frontend submit-lock | Ad-hoc disabled state | `useAnalysisRun` `isActive` / `startRun` dup-guard (`useAnalysisRun.ts:318-330`) or an `AnalysisLockContext` | The hook already ignores `startRun` while active |

**Key insight:** every capability Phase 5 needs already exists in `_shared/` (shipped dormant in Phase 3, proven live-dormant in Phase 4). Phase 5 threads inputs + flips flags; it does not build machinery.

---

## Common Pitfalls (line-cited to this phase's code)

### Pitfall A: The streaming path's missing idempotency key (Pitfall 1, the confirmed gap)
**What goes wrong:** `analyze-resume:728-729` reserves via `withMerits` with `meritCtx = {userId, tier, corsType}` — **no `idempotencyKey`**. Today every resume deduction is non-idempotent; dedup relies only on `analysis_cache`. Two tabs / double-click / refresh-resubmit each deduct independently.
**How to avoid:** derive the key (step 1 above) and set `meritCtx.idempotencyKey` before the reserve — exactly as the executor does at `analysis-lifecycle.ts:278`. **Warning sign:** two `feature-deduct` rows for one user seconds apart; N-parallel-submit test yields N deductions.

### Pitfall B: Validation collision — truncation repair vs strict rejection (D-10, the one place preserve-exactly and strict validation collide)
**What goes wrong:** `executeFreeAnalysis` (`:585`, `:611`) uses `repairTruncatedJSON` and **accepts** repaired/truncated JSON. `validateModelOutput`'s truncation detector (`llm-validation.ts:87` `needsStructuralRepair`) **rejects** anything that required structural repair. If the strict validator is pointed at the raw model text, it will fail outputs the current path repairs-and-accepts → a regression that rejects currently-valid successes (violates D-10).
**How to avoid:** validate the **final assembled result object** (post-`repairTruncatedJSON`/`reconcileScore`/`applyTierShape`), not the raw model text — the object no longer needs structural repair, so the truncation branch never fires on a currently-valid success. Give it a **permissive resume zod schema** (required: `overallScore:number`, non-empty `criterionFeedback`/`criteria` array; `.passthrough()` extras) + a `semanticCheck` that mirrors `passesQualityFloor` (`:539` — reject all-zero / all-identical / empty-criteria). A currently-valid output already passed `passesQualityFloor` server-side, so this can never reject it. Strict validation then changes **failure handling only**: a genuinely empty/garbage/truncated model response (which today throws `MeritRefundable` or a parse error and refunds) now resolves to a specific terminal `SCHEMA_VALIDATION_FAILED`/`MODEL_OUTPUT_TRUNCATED` + safe refund. **Warning sign:** any golden currently-passing fixture that the new validator rejects — that is a tuning bug, fix the schema/semanticCheck, do not weaken the pass.

### Pitfall C: Onboarding vs resume flag/feature confusion
**What goes wrong:** both features share `meritFeature='resume_analysis'` and the `analyze-resume` endpoint. If the edge picks the wrong `AnalysisFeature`, the wrong per-feature flag gates the run, breaking independent rollout.
**How to avoid:** explicit `origin:'onboarding'` discriminator → `feature:'onboarding'`; default → `feature:'resume'`. Both keep `meritFeature:'resume_analysis'`. **Warning sign:** flipping `ANALYSIS_LIFECYCLE_RESUME` accidentally routes onboarding through the executor (or vice-versa).

### Pitfall D: Refund-after-save on the triple-write (Pitfall 2)
**What goes wrong:** the triple-write has three DB writes + a webhook + a cache write. If any post-`resumes` step throws `MeritRefundable`, a saved+delivered analysis gets refunded + reported failed.
**How to avoid:** exactly one authoritative throw-point (`resumes.grading_data` update; already owner-scoped at `:90-94`); `analysis_results` (`persistResumeAnalysis:26` currently throws `MeritRefundable` at `:61` — **must become log-and-continue** under the lifecycle save), `analysis_cache`, usage (`:114` already log-and-continue), and `triggerExtractWebhook` best-effort. **Warning sign:** a `resumes` row exists for a request the user saw fail; `merit-refund` log co-occurs with a successful `resumes.update`.

### Pitfall E: The reaper max-age vs the free 50s timeout
**What goes wrong:** Onboarding's Free run uses `getTimeout('free')=50_000` (`tier-config.ts:28`); the reaper's per-state max-age must exceed the real generation ceiling or it terminalizes a live run.
**How to avoid:** the reaper is already armed (Phase 3, `reap-stale-analysis-runs`) with per-state thresholds keyed off function timeouts. Verify the `generating`/`extracting_data` max-age comfortably exceeds 50s (+ quality-floor retry). **Warning sign:** onboarding runs terminalized to `retryable_failed` while still generating.

### Pitfall F: `analysis_jobs` has NO result column — recovery of the RESULT is via `?id=`, not `result_ref`
**What goes wrong:** `useAnalysisRun` exposes `resultRef`/`previousResult` from `analysis_jobs.result_ref`, but **that column does not exist** (`ledger.sql` adds no `result_ref`/`archive_path`; grade-linkedin confirms this at `index.ts:368-370`). `useAnalysisRun` tracks the **lifecycle STATE**; the **result body** is recovered separately by re-reading `resumes.grading_data` (streaming) or History `analysis_results` via `source_reference=resumeId`.
**How to avoid:** on `completed`, the frontend re-fetches the result by `resumeId`/`?id=` (the existing `Results.tsx` realtime-on-`resumes` + `fetchOnce` path at `:397-423` already does this). `useAnalysisRun` is the state/merit/terminal-error/submit-lock surface, layered alongside the existing result fetch. **Warning sign:** planning to store the full result on `analysis_jobs` — don't; `resumes.grading_data` is the read source (`AnalysisHistory.phase22.test.ts` asserts `/results/{id}` routing must stay green).

---

## Code Examples (verified patterns from the current codebase)

### Deriving the idempotency key + reserving with it (closes analyze-resume:728)
```ts
// Pattern from _shared/analysis-lifecycle.ts:233-279 — reuse VERBATIM in the streaming wrapper.
const idempotencyKey = await deriveIdempotencyKey({
  userId: userContext.userId,
  feature: 'resume_analysis',          // meritFeature — same for resume + onboarding
  tier: resolvedTier,
  inputIdentity,                        // stable content-hash + resumeId + tier + variant
  attemptNonce,                         // body.attemptNonce ?? crypto.randomUUID()
});
const meritCtx = { userId: userContext.userId, tier: resolvedTier, corsType: 'user' as const };
meritCtx.idempotencyKey = idempotencyKey;          // <-- the missing line at analyze-resume:728
const gated = await withMerits(meritCtx, 'resume_analysis', async (txId) => txId, { precheck_cache });
if (!gated.ok) return gated.response;
```

### The save() throws-pre-settle + mirrors log-and-continue pattern (from grade-linkedin:429-488 / recruiting-lens:630-694)
```ts
save: async (value) => {
  // AUTHORITATIVE — must THROW so the executor rests in retryable_failed pre-settle (Pitfall 3).
  const { error: resumeErr } = await supabase.from('resumes')
    .update({ overall_score: value.overallScore, grading_data: value, analyzed_at: new Date().toISOString() })
    .eq('id', resumeId).eq('user_id', userId);            // IN-02 owner-scope preserved (index.ts:90-94)
  if (resumeErr) throw new Error('Could not save resume analysis.');
  // POST-SAVING best-effort (Pitfall 2 — never throw past this line):
  const analysisId = await persistResumeAnalysis(...).catch(() => null); // analysis_results: null → LOG only
  await writeResumeAnalysisCache(...);                                    // analysis_cache: best-effort
  await recordUsageWithAnalysis(...);                                     // usage: log-and-continue (already :114)
  triggerExtractWebhook(analysisId, 'resume_analysis');
},
```

### The dormancy fall-through (from grade-linkedin:491-510 / recruiting-lens)
```ts
const lifecycleResult = await runAnalysisLifecycle<ResumeResult, ExtractShape>({ feature: 'onboarding', ... });
if (lifecycleResult.ok) {
  return new Response(JSON.stringify({ ...lifecycleResult.value, run_id: lifecycleResult.runId, recordId }), { headers });
}
if (!lifecycleResult.dormant) {
  if (lifecycleResult.response) return lifecycleResult.response;         // gateway 402/etc.
  return new Response(JSON.stringify({ error: '...', code: lifecycleResult.code }), { status: 500, headers });
}
// dormant:true → fall through to today's UNCHANGED path (100% of traffic while flags OFF).
```

### Frontend: streaming run_id + recovery coexistence (D-05 discretion)
```ts
// Recommended: useResumeStream keeps the SSE token path; useAnalysisRun is layered for run_id recovery + submit-lock.
// On stream start, the edge returns run_id in the `complete` (and ideally an early) SSE event; the page calls
// startRun(run_id) so a refresh/navigation re-attaches via useAnalysisRun (URL+localStorage). On refresh without
// sessionStorage (Results.tsx:227-231 strips ?stream), useAnalysisRun recovers state from run_id and the result
// from resumes.grading_data (existing realtime path). Submit-lock = disable submit while useAnalysisRun.isActive.
```

---

## Test / Verification Surface (SC-4, VER-02)

Mirror the Phase-4 fold-in precedent (`grade-linkedin/__tests__/*`, `recruiting-lens/__tests__/*`, all registered in `deno.json` `test:ci` inside `verify:baseline`). The FEAT-01/FEAT-02 scenario matrix (VER-02) splits into **deterministic offline Deno guards** (blocking gate) and **operator-gated live checks** (non-blocking). A green baseline only proves pre-existing behavior — new guards are mandatory (Pitfall 12).

### Deterministic offline Deno guards (register in `deno.json` test:ci → verify:baseline)
| Scenario (VER-02 item) | Guard shape (precedent) |
|------------------------|-------------------------|
| First/second/five-consecutive; deliberate re-run mints new run+History | `deriveIdempotencyKey` intent-parts test — same nonce→same key, fresh nonce→different key (model on `grade-linkedin/__tests__/idempotency-repeated-run.test.ts:42-68`) |
| Duplicate-click / two tabs → one deduction, one run | Same-key → `already_deducted` end-to-end (extends `_shared/merit-idempotency.test.ts` / `merit-gateway.idempotency-forward.test.ts`) |
| Reused input vs replacement upload → stable identity; save-mutated field cannot re-key | Pitfall-8 lock (idempotency-repeated-run `:53-60`): stable `inputIdentity` → stable key regardless of `analyzed_at`/`grading_data` |
| Invalid/truncated/empty model output → typed error + refund, never 200-with-body | `validateModelOutput` on truncated/empty/garbage (`_shared/llm-validation.test.ts` precedent); a resume-specific runtime-convergence test that drives a real free result through the new seam (model `grade-linkedin/__tests__/runtime-validation-convergence.test.ts`) |
| **Preserve-exactly:** currently-valid free/Pro/Elite outputs still pass | Byte-preserve deep-equal on golden fixtures through the new schema+semanticCheck (model `recruiting-lens/__tests__/byte-preserve.test.ts`) — the D-10 collision guard |
| Save failure → retryable_failed + refund, NO settle; no refund reachable post-`saving→completed` | Executor refund-boundary static assertion (`_shared/analysis-lifecycle.refund-boundary.test.ts` precedent) |
| Merit reserve/settle/release/refund; no double charge/refund | `merit-gateway.refund.test.ts` + `analysis_jobs_settle_refund_excl` CHECK reasoning |
| CORS approved/rejected + success/failure header matrix (apex+www) | Both-origin × status matrix + Pitfall-7 thrown-401 (model `recruiting-lens/__tests__/cors-matrix.test.ts`) |
| Streaming wrapper drives create_or_recover→reserve-with-key→…→settle-on-saved in order | Handler-config / ordering static assertion (model `grade-linkedin/handler-config.test.ts`, `_shared/merit-gateway.spend-ordering.test.ts`) |
| Dormancy: resume/onboarding OFF by default; legacy path byte-identical | Extend `_shared/analysis-lifecycle.dormancy.test.ts` (already asserts all-OFF + flag-gated migrated features) |

### Operator-gated live checks (non-blocking; NOT in verify:baseline)
- Refresh-during-analysis + navigation-away-and-return recovers the live run (needs realtime + a real run; preview `cimjltzovkahkqecpwgi` unpaused). Honor operator smoke checkpoint (per memory: pause for `autonomous:false` charts/dates/toasts/realtime).
- Provider timeout/rate-limit → `retryable_failed` + Retry offered.
- Live apex+www CORS re-proof on production (`zjpjapgraoxdukdvpjes`) — the D-12 mechanic (Phase-4 04-06 did exactly this: OPTIONS + no-auth POST for both origins echo ACAO + Vary; `evil.example.com` fail-closed). Read-only, no migration.
- Real-account Free + (Elite) end-to-end (VER-04 lives in Phase 9, but a smoke here de-risks).

### Frontend (vitest)
- `useAnalysisRun` dormant/active transitions; submit-lock; preserve-previous-success on a later failed run.
- `AnalysisHistory.phase22.test.ts` (`/results/{id}` routing on `analysis_results.source_reference`) must **stay green** — the History contract is unchanged.

---

## Validation Architecture (Nyquist — for a derived VALIDATION.md)

The phase's success is provable along these axes; each maps to a guard above and a REQUIREMENTS success criterion.

| Axis | Invariant to prove | Evidence source | Deterministic? |
|------|--------------------|-----------------|----------------|
| **Onboarding hang resolved (FEAT-01 / SC-1)** | Upload→signed-URL→resumes-insert→extraction ordering preserved (D-07); slow run persisted (run row) + recovered on refresh/navigation; genuine failure → specific terminal state; no duplicate analyses/charges | Onboarding executor adoption test + `useAnalysisRun` recovery test + idempotency test; live refresh smoke | Offline for identity/order; live for recovery |
| **Free-tier correctness (D-07)** | FREE_MODEL Haiku 4.5, getTimeout('free')=50s, FREE_SINGLE_CALL_MAX_TOKENS=5000, single-consolidated-call + quality-floor retry, analyze-resume endpoint | Static assertion on `tier-config` + `executeFreeAnalysis` unchanged (byte-preserve) | Offline |
| **Preserve-exactly (FEAT-02 / SC-2)** | Free/Pro/Elite SUCCESS output byte-identical; streaming partial-render + progress stages unchanged; triple-write targets unchanged | Byte-preserve deep-equal golden fixtures; SSE protocol test | Offline |
| **Streaming persistent record, no latency regression (D-01)** | run row created at stream start; reserve-with-key before first byte; settle-on-saved; mid-stream overload → retryable_failed | Wrapper ordering test + refund-boundary test; live first-byte-latency smoke (compare pre/post) | Offline for ordering; live for latency |
| **Idempotency/exactly-once (D-03 / LIFE-05)** | same-attempt (streaming vs worker) → same key → 1 charge/run/History; deliberate re-run → new key; N-parallel → 1 | `deriveIdempotencyKey` + `withMerits` end-to-end tests; concurrency test | Offline |
| **No-masking validation (D-10 / LIFE-07)** | invalid/truncated/empty → typed terminal + refund; currently-valid success never rejected | `validateModelOutput` failure tests + byte-preserve pass tests | Offline |
| **Merit safety (LIFE-04)** | refund exactly once pre-saving; settle only on durable save; `NOT(merit_settled AND refunded)` | refund-boundary test + CHECK constraint | Offline |
| **Duplicate-submission disabled (D-11)** | partial-UNIQUE active index yields 1 run; frontend submit-lock | create_or_recover concurrency reasoning + `useAnalysisRun` dup-guard test | Offline |
| **CORS (D-12 / CORS-02)** | apex+www succeed on analyze-resume; preflight + failure headers correct; unapproved fail-closed | cors-matrix test + live prod re-proof | Offline + live |

---

## Dormancy, Flag-Flip Order, DB Touch, CORS Mechanics

- **No new DB migration required.** The Phase-3 ledger (`20260702000001_...ledger.sql`), the two CAS RPCs, the partial-UNIQUE **active index (keyed on `idempotency_key` alone**, `:175-178` — feature-agnostic), the `NOT(merit_settled AND refunded)` CHECK, service_role-only grants (`:447-453`), and `analysis_jobs` in the realtime publication (Phase-3 D-05) are all **feature-agnostic and already shipped/verified on prod**. Resume/onboarding need **no new index, no new grant, no RLS change** — they thread `feature`/`meritFeature` strings into the same RPCs. **This makes Phase 5 code + flag flips only** (unlike a phase that touches schema). If the planner nonetheless proposes any index/grant/RLS/realtime touch, it is operator-gated preview→prod with rollback SQL, and the advisor floor 15 must not increase (CLAUDE.md).
- **Flag-flip order (ascending blast radius, each independent):** deploy code dormant (flags OFF = byte-identical legacy, 100% traffic). Then flip **Onboarding** first (lower traffic, the real repair) behind `ANALYSIS_LIFECYCLE_ENABLED` + `ANALYSIS_LIFECYCLE_ONBOARDING` + frontend `VITE_FEATURE_ANALYSIS_LIFECYCLE`; soak; then **Resume** (`ANALYSIS_LIFECYCLE_RESUME`) — highest traffic, last. The master `ANALYSIS_LIFECYCLE_ENABLED` is the single incident kill-switch. Flag reads are module-scope cold-start (`analysis-flags.ts:53-71`) — a flip needs a redeploy/restart to take effect (matches the maxtoken-tuning "staging-only, redeploy to test" note).
- **CORS re-proof mechanics (D-12):** no code change. Confirm `analyze-resume` keeps `serve((req)=>withCors(req,'user',handler,{extraHeaders:'x-internal-job-secret'}))` (`:632`/`:1093`) and every exit spreads `corsHeaders({type:'user', extraHeaders:'x-internal-job-secret'})`; confirm deployed `ALLOWED_ORIGINS` includes both `https://strivoai.net` and `https://www.strivoai.net`; keep `auth.ts` CORS-attached 401s (Pitfall 7). Re-prove live exactly as Phase-4 04-06 did (OPTIONS + no-auth POST for both origins → ACAO + Vary; evil origin fail-closed). Add the both-origin × status-matrix Deno guard.

---

## Open Questions (the planner must resolve)

1. **Streaming validation target (HIGH-impact, D-10).** Recommendation: validate the **final assembled result object** (post-reconcile), NOT raw model text, to avoid the truncation-repair-vs-strict-reject collision (Pitfall B). The planner must confirm the resume zod schema is permissive + `.passthrough()` and the `semanticCheck` == `passesQualityFloor` so byte-preserve holds. *What's unclear:* whether any currently-valid production output has a shape the naive schema would reject — mitigate with a golden-fixture byte-preserve test as the gate.

2. **Onboarding/resume discriminator.** Recommendation: explicit `origin:'onboarding'` body field → `feature:'onboarding'`. *What's unclear:* whether any real non-streaming resume traffic exists besides onboarding + the dead worker (Upload always streams, `Upload.tsx:218`). If not, `stream!==true`⇒onboarding is *tempting* but fragile — prefer the explicit field for independent flag control.

3. **Recovered-active-run on the streaming path.** `create_or_recover_analysis_run` can return an already-active run (recovered=true). For streaming, a recovered active run means "an identical attempt is already in flight." *What's unclear:* should the second streamer attach to the existing run and poll for its result, or refuse (submit-lock should prevent this on the client)? Recommendation: rely on the frontend submit-lock + return the recovered run_id so the client re-attaches via `useAnalysisRun` rather than opening a second model call.

4. **Pre-first-byte RPC count vs latency.** The wrapper adds ~5 fast RPCs (create_or_recover + 3-4 transitions + reserve) before the readable Response returns. Recommendation: measure first-byte delta on staging; if material, collapse intermediate transitions (e.g., create directly into `reserving_merits`, or batch created→…→generating). The model call dominates, so impact is expected to be negligible — but D-01 demands a measured "no regression."

5. **`useResumeStream` + `useAnalysisRun` composition.** Recommendation: keep `useResumeStream` as the SSE token/partial-render owner; layer `useAnalysisRun` for run_id persistence, submit-lock, terminal-error, and refresh recovery (result body still re-read from `resumes.grading_data`). *What's unclear:* the exact handoff when a refresh loses `sessionStorage` (`Results.tsx:227-231` strips `?stream`) — `useAnalysisRun` recovers STATE from run_id, and the existing realtime-on-`resumes` recovers the RESULT; confirm the two compose without a flash of the old "Taking Longer" screen (which is being removed).

6. **`persistResumeAnalysis` throw semantics under the lifecycle.** Today `persistResumeAnalysis:61` throws `MeritRefundable` on `analysis_results` insert failure — inside the executor/wrapper's `save`, this would make the `analysis_results` mirror authoritative and could refund-after-`resumes`-save. Recommendation: demote the `analysis_results` insert to log-and-continue (return null) inside the lifecycle save, matching `grade-linkedin`'s `persistLinkedInAnalysis` (returns null on failure, `:150-155`). Keep `resumes.grading_data` as the sole authoritative throw.

---

## Sources

### Primary (HIGH confidence — direct code read, 2026-07-05)
- Substrate: `_shared/analysis-lifecycle.ts` (executor `:212`, idempotency `:233`, refund boundary `:291`, settle `:366`), `_shared/idempotency-key.ts:85`, `_shared/merit-gateway.ts` (withMerits `:149`, key forward `:217`, refundMeritsForJob `:327`), `_shared/llm-validation.ts:60` (truncation `:87`, semanticCheck `:104`), `_shared/analysis-flags.ts` (features `:37`, gate `:78`), `_shared/tier-config.ts` (FREE_MODEL `:55`, getTimeout `:28`).
- Resume feature: `analyze-resume/index.ts` (withMerits/no-key `:728-729`, streaming IIFE `:800-965`, executeFreeAnalysis `:562-630`, executeParallelCalls `:358`, triple-write `:71`/`:26`/`:224`, precheck_cache `:1074`, CORS wrapper `:632`/`:1093`, refund-in-IIFE `:835`/`:946`).
- Frontend: `src/hooks/useResumeStream.ts` (SSE loop `:216-338`, optimistic deduct `:117`, no useAnalysisRun/VITE-flag ref), `src/hooks/useAnalysisRun.ts:224` (recovery model), `src/pages/Upload.tsx:200-218` (always-stream), `src/pages/Results.tsx` (MAX_POLLING_TIME `:213`, streamParams `:221-233`, timeout dead-end `:604-625`, realtime `:408-423`, fallback poll `:486-503`), `src/pages/Onboarding.tsx:253-389` (fire-and-forget `:372-382`), `src/config/feature-flags.ts:42`.
- Reference adoption (Phase 4): `grade-linkedin/index.ts:344-510` (inline driver, save `:429-488`, dormant fall-through `:491-510`), `recruiting-lens/index.ts:565-695`. Test model: `grade-linkedin/__tests__/idempotency-repeated-run.test.ts`.
- DB substrate: migration `20260702000001_analysis_lifecycle_ledger.sql` (partial-UNIQUE active index `:175`, create_or_recover `:194`, transition `:297`, service_role-only grants `:447`, no result_ref column). `deno.json` test:ci allowlist + `verify:baseline`.
- Planning: `05-CONTEXT.md` (D-01..D-12), `03-CONTEXT.md`, `04-CONTEXT.md`, `REQUIREMENTS.md` (FEAT-01/02, LIFE-01..09, VER-02), `research/PITFALLS.md` (Pitfalls 1/2/3/4/5/8/9), `STATE.md` (Phase 3/4 accumulated context).

### Secondary / inferred (MEDIUM confidence — flagged in Open Questions)
- The exact resume zod schema shape + whether any production output would fail a naive schema (Open Q1) — mitigate with a byte-preserve golden-fixture gate, do not assert without it.
- Pre-first-byte latency delta of the wrapper (Open Q4) — requires a staging measurement, not a code read.

### Not consulted (justified)
- Context7 / WebSearch / external docs: **N/A.** The milestone forbids new infrastructure; every capability is in-repo and shipped. No external library behavior is load-bearing for this phase.

---

## Metadata

**Confidence breakdown:**
- Substrate + adoption pattern (Standard Stack, Onboarding wiring): **HIGH** — direct read of shipped, live-dormant, Phase-4-proven code.
- Streaming-aware wrapper design (D-01/D-02): **HIGH on primitives + ordering constraints** (all exist and are cited); **MEDIUM on the exact wiring** — left to the planner by CONTEXT (discretion), open questions flagged.
- Validation reconciliation (D-10): **HIGH on the collision mechanism** (truncation-repair vs strict-reject, both code-verified); **MEDIUM on the final schema** — Open Q1.
- Duplicate-submission + idempotency (D-11/D-03): **HIGH** — index + RPC + key derivation all read directly.
- DB-touch assessment (no new migration needed): **HIGH** — the active index is keyed on `idempotency_key` alone and RPCs are feature-agnostic; verified in the migration source.
- Test/verification surface: **HIGH** — mirrors the exact Phase-4 fold-in precedent in `deno.json`.

**Research date:** 2026-07-05
**Valid until:** ~2026-08-05 for the substrate/code facts (stable, shipped); re-verify only if `_shared/analysis-lifecycle.ts`, `merit-gateway.ts`, `analyze-resume/index.ts`, or the ledger migration change before planning.

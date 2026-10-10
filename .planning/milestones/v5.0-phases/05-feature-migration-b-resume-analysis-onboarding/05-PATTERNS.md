# Phase 5: Feature Migration B — Resume Analysis + Onboarding - Pattern Map

**Mapped:** 2026-07-05
**Files analyzed:** 15 (2 primary edge targets + 4 frontend + 2 new shared/wrapper + 7 test/registration)
**Analogs found:** 13 / 15 (2 net-new with no direct analog: the streaming-aware wrapper + the resume validation schema — both composed from verified primitives)

> Every analog below was read directly (not inferred). Line numbers are load-bearing — the planner cites them in PLAN action steps. The Phase-4 `grade-linkedin` / `recruiting-lens` adoptions are the proven reference; `analyze-resume` is the preserve-exactly target.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/functions/analyze-resume/index.ts` (MOD) — onboarding branch | edge handler / executor-adoption | request-response | `supabase/functions/grade-linkedin/index.ts:344-510` | exact (mirror) |
| `supabase/functions/analyze-resume/index.ts` (MOD) — streaming branch | edge handler / streaming orchestration | streaming (SSE) | `analyze-resume/index.ts:800-965` + `_shared/analysis-lifecycle.ts` primitives | partial (compose — no streaming analog exists) |
| `supabase/functions/analyze-resume/index.ts` (MOD) — save() reconciliation | persistence | file-I/O (DB triple-write) | `grade-linkedin/index.ts:429-488` + `persistLinkedInAnalysis:150-155` | exact (mirror) |
| NEW resume validation seam (schema + semanticCheck) — colocate or `_shared/resume-validation.ts` | validation / schema | transform | `_shared/llm-validation.ts:60-113` (contract) + `analyze-resume passesQualityFloor:539` (semantics) | role-match |
| NEW streaming-aware lifecycle wrapper (D-02) — inline in `analyze-resume` or `_shared/` | utility / orchestration | streaming | `_shared/analysis-lifecycle.ts:212-373` (primitives + ordering) | partial (no direct analog — the deep-design spot) |
| `src/pages/Onboarding.tsx` (MOD) | page / trigger | request-response | `useAnalysisRun` wiring model in `useAnalysisRun.ts:318-330` + kill `Onboarding.tsx:372-382` | role-match |
| `src/pages/Results.tsx` (MOD) | page / recovery | event-driven (realtime) + poll | `src/hooks/useAnalysisRun.ts:224-396` (recovery) | role-match |
| `src/hooks/useResumeStream.ts` (MOD) | hook / SSE | streaming | self (`:85-356`) + `useAnalysisRun.ts` (layered) | exact (extend-in-place) |
| `src/pages/Upload.tsx` (MOD) | page / submit | request-response | self (`:200-218`) + `AnalysisLockContext.tsx` | exact (extend-in-place) |
| `analyze-resume/__tests__/idempotency-repeated-run.test.ts` (NEW) | test | — | `grade-linkedin/__tests__/idempotency-repeated-run.test.ts` | exact (model) |
| `analyze-resume/__tests__/runtime-validation-convergence.test.ts` (NEW) | test | — | `grade-linkedin/__tests__/runtime-validation-convergence.test.ts` | exact (model) |
| `analyze-resume/__tests__/byte-preserve.test.ts` (NEW) | test | — | `recruiting-lens/__tests__/byte-preserve.test.ts` | exact (model) |
| `analyze-resume/__tests__/cors-matrix.test.ts` (NEW) | test | — | `recruiting-lens/__tests__/cors-matrix.test.ts` | exact (model) |
| streaming-wrapper ordering test (NEW) | test | — | `grade-linkedin/handler-config.test.ts` + `_shared/merit-gateway.spend-ordering.test.ts` | role-match |
| `supabase/functions/deno.json` (MOD) — `test:ci` allowlist | config | — | `deno.json:5` (existing allowlist) | exact |

---

## Pattern Assignments

### `analyze-resume/index.ts` — Onboarding full-executor adoption (edge handler, request-response)

**Analog:** `supabase/functions/grade-linkedin/index.ts:344-510` (near-verbatim), cross-check `recruiting-lens/index.ts:565-695`.

The onboarding run is a clean `runAnalysisLifecycle` adoption. Copy the Phase-4 shape exactly: derive `attemptNonce` + stable `inputIdentity`, call the executor inside the merit branch, fall through to the byte-identical legacy path when dormant.

**attemptNonce + inputIdentity derivation** (`grade-linkedin:360-365`):
```ts
const attemptNonce = typeof meritBody.attemptNonce === 'string' && meritBody.attemptNonce
  ? meritBody.attemptNonce
  : crypto.randomUUID();
const linkedInInputIdentity = await sha256Hex(
  JSON.stringify({ profileContent_hash: profileContentHash, profileUrl: meritProfileUrl || '' }),
);
```
Resume equivalent (Claude's Discretion — never a save-mutated field, Pitfall 8): `inputIdentity = sha256Hex(JSON.stringify({ text_hash, resumeId, targetRole, targetIndustry }))`. `analyze-resume` already computes the normalized `resumeTextHash` at `:711-712` — reuse it. Do NOT include `analyzed_at` / `grading_data` / `overall_score`.

**Executor call shape** (`grade-linkedin:373-428`, cross-check `recruiting-lens:584-629`):
```ts
const lifecycleResult = await runAnalysisLifecycle<ResumeResult, ExtractShape>({
  feature: 'onboarding',          // dormancy key → ANALYSIS_LIFECYCLE_ONBOARDING (independent flag)
  meritFeature: 'resume_analysis', // SAME merit cost/History as normal resume
  ctx: { userId, tier: resolvedTier, corsType: 'user' },
  jobType: 'resume_analysis',
  resumeId,                        // executor forwards as p_resume_id (analysis-lifecycle.ts:248)
  inputIdentity,
  attemptNonce,
  extract: () => Promise.resolve({ resumeText: normalizedText, /* … */ }),
  generate: async (_txId, extracted) => { /* executeFreeAnalysis logic → return serialized OBJECT (see validation note) */ },
  schema: resumeAnalysisSchema,
  validationOpts: { semanticCheck: resumeSemanticCheck },
  save: async (value) => { /* triple-write, resumes.grading_data authoritative — see save() below */ },
});
```

**Dormancy fall-through** (`grade-linkedin:491-510`) — the exact 3-branch return:
```ts
if (lifecycleResult.ok) {
  return new Response(JSON.stringify({ ...lifecycleResult.value, run_id: lifecycleResult.runId, recordId }), { headers });
}
if (!lifecycleResult.dormant) {
  if (lifecycleResult.response) return lifecycleResult.response;  // gateway 402/etc.
  return new Response(JSON.stringify({ error: '…', code: lifecycleResult.code }), { status: 500, headers });
}
// dormant:true → fall through to today's UNCHANGED path (100% of traffic while flags OFF)
```

**MUST respect:**
- Executor result union is `{ok:true; runId; value; transactionId} | {ok:false; dormant:true} | {ok:false; dormant:false; code; runId; response?}` (`analysis-lifecycle.ts:178-181`). All three branches must be handled.
- `generate` returns **raw model text**; the executor runs `validateModelOutput(raw, schema, validationOpts)` internally (`analysis-lifecycle.ts:326`). The closure must NOT validate.
- `generate` errors must be plain status-bearing `Error` (NOT `MeritRefundable`) — the executor owns the refund boundary and `classifyFailure` reads `.status` (`grade-linkedin:410-416`, `analysis-lifecycle.ts:334-338`).
- Discriminator (Pitfall C, RESEARCH-recommended): read an explicit `origin:'onboarding'` body field → `feature:'onboarding'`; default → `feature:'resume'`. Do NOT infer from `stream!==true` (conflates onboarding with the dead worker path and mis-gates the flag).

---

### `analyze-resume/index.ts` — Streaming-aware lifecycle wrapper (edge handler, SSE)  ⚠ THE DEEP-DESIGN SPOT (D-01/D-02)

**Analog:** NONE direct (the executor is request/response-LOCKED). **Compose** from: today's streaming IIFE `analyze-resume/index.ts:800-965` (token path, byte-preserve) + the executor's primitives/ordering `_shared/analysis-lifecycle.ts:233-372`.

**The gap to close** — `meritCtx` today carries no key (`analyze-resume:728-729`):
```ts
const meritCtx = { userId: userContext.userId, tier: resolvedTier, corsType: 'user' as const };
const gated = await withMerits(meritCtx, 'resume_analysis', async (_txId) => { /* … */ }, { precheck_cache: … });
```
Reserve-with-key pattern to replicate (from `analysis-lifecycle.ts:233-279`):
```ts
const idempotencyKey = await deriveIdempotencyKey({
  userId: userContext.userId, feature: 'resume_analysis', tier: resolvedTier, inputIdentity, attemptNonce,
});
meritCtx.idempotencyKey = idempotencyKey;   // <-- the missing line at analyze-resume:728
```

**Ordering the wrapper MUST enforce** (mirror `analysis-lifecycle.ts` transitions exactly, but around the TransformStream):
- Pre-first-byte (fast RPCs only): `deriveIdempotencyKey` → `create_or_recover_analysis_run(p_idempotency_key=key, …)` (`analysis-lifecycle.ts:242-250`) → `transition created→validating_inputs→reserving_merits` → `withMerits` reserve **with key** → `transition reserving_merits→extracting_data→generating` → **return `new Response(readable, {SSE headers})`** byte-identical to `analyze-resume:956-964`.
- Inside the unawaited IIFE (token path, byte-preserved): emit synthetic chunks `{"overallScore":` / summary / `"criteria":` exactly as `:809-827`; run `executeFreeAnalysis` (`:814`) or `executeParallelCalls`+`mergeValidated`+`reconcileScore` (`:849-937`).
- On assembled result: **validate the final object** (D-10) → on invalid `refundMeritsForJob` + `transition generating→failed`/`retryable_failed` + SSE `error`; on valid `transition generating→validating_output→saving` → triple-write (`resumes.grading_data` authoritative) → `transition saving→completed {merit_settled:true}` (**point of no return**, `analysis-lifecycle.ts:366`) → SSE `complete {result, run_id}`.

**Refund seam already present in the IIFE** to reuse (`analyze-resume:835/841/946`):
```ts
await sendEvent({ type: 'error', message: err.message });
await refundMeritsForJob(userContext.userId, _txId, `stream-error: ${err.message}`);
try { await writer.close(); } catch { /* already closed */ }
```

**MUST respect:**
- `refundMeritsForJob` is the ONLY refund surface (`merit-gateway.ts:327`); it is `already_refunded`-safe. Fire refunds ONLY from IIFE branches lexically before `saving→completed` — never after (Pitfall 2/D).
- `withMerits` cache-hit returns sentinel `transactionId:'cache-hit'` (`merit-gateway.ts:196`); preserve the `precheck_cache` short-circuit (`analyze-resume:1074-1078`) → the cached SSE `complete` (`responseForResumeResult(..., stream)` `:135-146`).
- Latency invariant (D-01): only step-1 hash + ~5 service-role RPCs before first byte; the model call (`invokeAnthropicText`) is unchanged. Measure first-byte delta on staging (Open Q4).
- Do NOT bend `runAnalysisLifecycle` into streaming (D-02) — reuse its RPCs/ordering, not the function.

---

### `analyze-resume/index.ts` — save() reconciliation of the triple-write (persistence, file-I/O)

**Analog:** `grade-linkedin/index.ts:429-488` (authoritative-throw + mirrors log-and-continue) + `persistLinkedInAnalysis:150-155` (returns null on failure).

**Current triple-write has a throw-after-save defect for the lifecycle** — `persistResumeAnalysis:59-62` throws `MeritRefundable` on the `analysis_results` mirror insert:
```ts
if (error) {
  console.error('[persistResumeAnalysis] insert failed:', error.message);
  throw new MeritRefundable(500, 'Could not save resume analysis history.');   // <-- must become log-and-continue under save()
}
```
And `completeAndRecordSuccess:90-99` already makes `resumes` the authoritative throw (keep this), with usage already correctly log-and-continue (`:114-120`).

**Target save() shape** (mirror `grade-linkedin:429-488`):
```ts
save: async (value) => {
  // AUTHORITATIVE — throw so the executor/wrapper rests in retryable_failed pre-settle (Pitfall 3).
  const { error: resumeErr } = await supabase.from('resumes')
    .update({ overall_score: value.overallScore, grading_data: value, analyzed_at: new Date().toISOString() })
    .eq('id', resumeId).eq('user_id', userId);           // IN-02 owner-scope preserved (analyze-resume:90-94)
  if (resumeErr) throw new Error('Could not save resume analysis.');
  // POST-SAVING best-effort (never throw past this line):
  const analysisId = await persistResumeAnalysis(...).catch(() => null);  // analysis_results: null → LOG only
  await writeResumeAnalysisCache(...);                                     // analysis_cache: best-effort (already warn-only :256)
  await recordUsageWithAnalysis(...);                                     // usage: log-and-continue (already :114)
  triggerExtractWebhook(analysisId, 'resume_analysis');
},
```
The `.catch(() => null)` demotion mirrors `persistLinkedInAnalysis` which already returns null on failure (`grade-linkedin:150-153`) instead of throwing. `writeResumeAnalysisCache` is already warn-only (`analyze-resume:256-258`).

**MUST respect:**
- Exactly ONE authoritative throw-point (`resumes.grading_data` update). `resumes.grading_data` is the read source for `Results.tsx` + `AnalysisHistory` — the History routing test (`AnalysisHistory.phase22.test.ts`) asserts `/results/{id}` routing and must stay green (RESEARCH Pitfall F).
- `analysis_jobs` has NO result column — do not try to store the result on it (RESEARCH Pitfall F, confirmed `grade-linkedin:368-370`). Result recovery is by `resumeId`/`?id=`.

---

### NEW resume validation seam — schema + semanticCheck (validation, transform)

**Analog:** `_shared/llm-validation.ts:60-113` (the contract + `semanticCheck` seam) — semantics mirror `analyze-resume passesQualityFloor:539-552`.

`validateModelOutput` runs empty → parse → truncation → empty/generic → zod → semanticCheck, returning a typed `AnalysisErrorCode` on every failure and NEVER substituting a body (`:60-112`). The `semanticCheck` seam (`:35`, invoked `:104-108`):
```ts
if (opts?.semanticCheck) {
  const sem = opts.semanticCheck(result.data);
  if (!sem.ok) return fail("SCHEMA_VALIDATION_FAILED", sem.detail);
}
```
The resume `semanticCheck` mirrors the existing quality floor (`analyze-resume:539-552`), which is the guarantee it never rejects a currently-valid success (D-10):
```ts
function passesQualityFloor(result): boolean {
  const criteria = (result.criterionFeedback || result.criteria || []) as Array<{ score?: number }>;
  if (criteria.length === 0) return false;
  const scores = criteria.map(c => Number(c.score) || 0);
  if (scores.every(s => s === 0)) return false;         // all-zero = didn't score
  if (scores.every(s => s === scores[0])) return false; // all-identical = lazy
  return true;
}
```

**MUST respect (Pitfall B — the one place preserve-exactly + strict validation collide):**
- Validate the **final assembled result OBJECT** (post `repairTruncatedJSON`/`reconcileScore`/`applyTierShape`), NOT the raw model text — the object no longer needs structural repair, so `needsStructuralRepair` (`llm-validation.ts:87,134-142`) never false-fails a currently-valid success that the free path repairs-and-accepts (`analyze-resume:585,611`).
- Schema must be permissive + `.passthrough()`: required `overallScore:number` + non-empty `criterionFeedback|criteria` array; everything else passthrough. A byte-preserve golden-fixture test is the gate (Open Q1).
- Strict validation changes **failure handling only** — a genuinely empty/garbage/truncated result → typed terminal (`SCHEMA_VALIDATION_FAILED`/`MODEL_OUTPUT_TRUNCATED`) + refund; success stays byte-identical.

---

### `src/pages/Onboarding.tsx` (page, request-response) — kill fire-and-forget

**Analog:** the recovery-wiring model in `useAnalysisRun.ts:318-330` (`startRun` + dup-guard); remove the abandonment at `Onboarding.tsx:372-382`.

**The bug to remove** (`Onboarding.tsx:371-382`):
```ts
const analysisPromise = invokeWithTimeout<unknown>(
  "analyze-resume",
  { body: { resumeText, resumeId: resume.id, userId: user.id, tier: 'free' } },
  120000,                                            // no stream/jobId/run_id → nothing tracks it server-side
);
navigate(`/results/${resume.id}`);                  // navigates immediately, no query params
analysisPromise.catch((err) => console.error("Background analysis failed:", err));  // only logs
```

**MUST respect:**
- D-07 ordering: preserve the awaited upload → signed-URL → `resumes` insert → `extractDocumentFromFile` (incl. OCR) sequence (`Onboarding.tsx:266-365`) — analysis only starts after extraction completes. Do NOT reorder.
- Send `origin:'onboarding'` + `attemptNonce` in the body so the edge picks `feature:'onboarding'`; the response returns `run_id` the frontend re-attaches via `startRun(run_id)`.
- `startRun` writes run_id to URL + localStorage and dup-guards while active (`useAnalysisRun.ts:318-330`), gated by `isAnalysisLifecycleEnabled()` (`feature-flags.ts:42`).

---

### `src/pages/Results.tsx` (page, event-driven + poll) — remove 120s dead-end, adopt recovery

**Analog:** `src/hooks/useAnalysisRun.ts:224-396` (subscribe-first/poll-fallback recovery, `previousResult` preservation, `canRetry`).

**What to remove / replace:**
- Hard cap `MAX_POLLING_TIME = 120000` (`Results.tsx:213`) fired at `:506-511` → replaced by lifecycle terminal states + Phase-3 reaper (D-05).
- "Analysis Taking Longer Than Expected" dead-end (`:604-625`, fires on `analysisTimedOut && !resume?.grading_data`) → an honest recoverable progress state.
- The existing realtime-on-`resumes` (`:408-423`) + `fetchOnce` (`:397-406`) recover the RESULT body from `resumes.grading_data` — KEEP these (Pitfall F: `useAnalysisRun` tracks STATE, not the result body).

**Recovery layering** — `useAnalysisRun` state + existing result fetch coexist (`useAnalysisRun.ts:257-306` subscribe+poll; `:347-393` snapshot):
```ts
const run = useAnalysisRun();               // STATE/merit/terminal-error/submit-lock
// result body still recovered from resumes.grading_data via existing realtime (:408-423)
```

**MUST respect:**
- `useAnalysisRun` is inert unless `VITE_FEATURE_ANALYSIS_LIFECYCLE==='true'` (`useAnalysisRun.ts:225`, `feature-flags.ts:42`) — dormancy must keep the legacy screen byte-identical while OFF.
- On refresh, `Results.tsx:227-231` strips `?stream` → DB polling fallback; `useAnalysisRun` recovers STATE from run_id (URL+localStorage), the existing realtime recovers the RESULT. Confirm no flash of the removed "Taking Longer" screen (Open Q5).

---

### `src/hooks/useResumeStream.ts` (hook, streaming) — coexist with useAnalysisRun

**Analog:** self (`:85-356`) extended; layer `useAnalysisRun.ts` alongside. `useResumeStream` today has NO `useAnalysisRun`/`VITE_FEATURE_ANALYSIS_LIFECYCLE` reference.

**Keep the SSE token path + single optimistic deduction** (`:111-129`) — the T-31-07 double-deduct guard fires exactly once at stream start:
```ts
const settle = optimisticDeduct(params.meritCost ?? 0);
// commit() on complete (:245); rollback(status) on error/abort/disconnect (:203,:260,:310)
```
The `complete` event already carries `event.result` (`:241-252`) — the edge must additionally emit `run_id` in that event so the page calls `startRun(run_id)`.

**MUST respect:**
- Keep `optimisticDeduct` as the single client-side UX deduction; server `withMerits` is the source of truth (RESEARCH anti-pattern: do not deduct on Upload submit).
- Preserve the SSE chunk/complete/error protocol the loop parses (`:216-338`) + `extractPartialSummary` progressive render (`:61-83`) — byte-preserve (D-09/D-10). Validation applies to the final result server-side, never these partials.
- Composition is Claude's discretion (Open Q5): keep `useResumeStream` as token/partial owner, layer `useAnalysisRun` for run_id persistence + submit-lock + terminal-error.

---

### `src/pages/Upload.tsx` (page, request-response) — attemptNonce + submit-lock

**Analog:** self (`:200-218`, always-stream) + `src/contexts/AnalysisLockContext.tsx` (existing global lock).

Upload always writes `sessionStorage['stream_params_<id>']` + navigates `/results/<id>?stream=true` (`:204-218`). Mint an `attemptNonce` here (deliberate-new-run signal) and thread it into the stream params so the edge derives a stable key; a deliberate re-run mints a fresh nonce (D-03).

**Submit-lock (D-11)** — `AnalysisLockContext` already exists (`AnalysisLockContext.tsx:17-40`, refcount `isLocked`/`lock`/`unlock`, Navbar consumes it). Combine with `useAnalysisRun.isActive` / the `startRun` dup-guard (`useAnalysisRun.ts:316,321-322`) to disable the submit control while a run is active.

**MUST respect:** the `meritCost` field already rides the stream params for the single optimistic deduction (`:213`, `:200-203`) — do NOT add a second deduction on submit (T-31-07).

---

## Shared Patterns

### Idempotency key (edge-derived, threaded per attempt)
**Source:** `_shared/idempotency-key.ts:85` (`deriveIdempotencyKey`) + `_shared/merit-gateway.ts:95,217` (`ctx.idempotencyKey` forward).
**Apply to:** onboarding executor (internal, `analysis-lifecycle.ts:233`), streaming wrapper (explicit — closes `analyze-resume:728`), non-streaming resume.
```ts
// SHA-256 over sorted-key JSON of {userId, feature, tier, inputIdentity, attemptNonce} → 64-char hex
const key = await deriveIdempotencyKey({ userId, feature: 'resume_analysis', tier, inputIdentity, attemptNonce });
meritCtx.idempotencyKey = key;   // withMerits forwards to 4-arg check_and_deduct_merits (:217)
```
Same-attempt streaming vs worker retry → SAME key → 1 charge/run/History (D-03). `inputIdentity` NEVER a save-mutated field (`idempotency-key.ts:20-27`, Pitfall 8).

### Refund-exactly-once, pre-saving only
**Source:** `_shared/analysis-lifecycle.ts:291-304` (`refundAndFail`) / `_shared/merit-gateway.ts:327-348` (`refundMeritsForJob`).
**Apply to:** all pre-`saving→completed` failure branches (executor branches for onboarding/non-stream; IIFE branches for streaming). Never refund after `completed` — `merit_settled:true` is written only in the `saving→completed` CAS (`analysis-lifecycle.ts:366`).

### save() throws-pre-settle; mirrors log-and-continue
**Source:** `grade-linkedin/index.ts:429-488` + `persistLinkedInAnalysis:150-155`; also `recruiting-lens/index.ts:630-694`.
**Apply to:** the resume triple-write. Exactly one authoritative throw (`resumes.grading_data`); `analysis_results` (demote `persistResumeAnalysis:61` throw → `.catch(()=>null)`), `analysis_cache`, usage, webhook all best-effort.

### Dormancy fall-through (byte-identical legacy while flags OFF)
**Source:** `grade-linkedin/index.ts:491-510` / `recruiting-lens/index.ts:697+`; gate `_shared/analysis-flags.ts:78` (`isAnalysisFeatureEnabled`, two-level fail-closed exact-`'true'`).
**Apply to:** both features. `feature:'onboarding'` → `ANALYSIS_LIFECYCLE_ONBOARDING`; `feature:'resume'` → `ANALYSIS_LIFECYCLE_RESUME` (`analysis-flags.ts:56-62`) — independently flippable behind the `ANALYSIS_LIFECYCLE_ENABLED` master.

### Strict no-masking validation
**Source:** `_shared/llm-validation.ts:60-113` (`validateModelOutput` + `semanticCheck` seam).
**Apply to:** onboarding + non-stream (via executor `validationOpts`, `analysis-lifecycle.ts:326`) and streaming wrapper (direct call on final object). Changes failure handling only; success byte-identical (D-10).

### CORS re-proof (guard, not a fix)
**Source:** `analyze-resume/index.ts:632,1093` (`withCors(req,'user',…,{extraHeaders:'x-internal-job-secret'})`); every exit spreads `corsHeaders({type:'user', extraHeaders:'x-internal-job-secret'})`.
**Apply to:** preserve verbatim (D-12). Re-verify live for `strivoai.net` + `www.strivoai.net`; add a both-origin × status Deno guard (model `recruiting-lens/__tests__/cors-matrix.test.ts`). Keep `auth.ts` CORS-attached 401s.

### Frontend recovery hook (state-only) + submit-lock
**Source:** `src/hooks/useAnalysisRun.ts:224-396` (subscribe-first/poll-fallback, run_id URL+localStorage, `previousResult` `:253`, `canRetry` `:371`, dup-guard `:321-322`) + `src/contexts/AnalysisLockContext.tsx`.
**Apply to:** Onboarding + Results + Upload. Gated by `isAnalysisLifecycleEnabled()` (`feature-flags.ts:42`). Recovers STATE; result body re-read from `resumes.grading_data` (Pitfall F).

---

## Test Patterns

**Registration:** append new test paths to the `test:ci` allowlist in `supabase/functions/deno.json:5` (single space-delimited `deno test …` string — the Phase-4 files `grade-linkedin/__tests__/idempotency-repeated-run.test.ts`, `recruiting-lens/__tests__/byte-preserve.test.ts`, `cors-matrix.test.ts` are already appended there). `verify:baseline` runs this.

| New test (analyze-resume) | Model to copy | Proves |
|---------------------------|---------------|--------|
| `__tests__/idempotency-repeated-run.test.ts` | `grade-linkedin/__tests__/idempotency-repeated-run.test.ts` | same nonce→same key; fresh nonce→new key; save-mutated field cannot re-key (Pitfall 8) |
| `__tests__/runtime-validation-convergence.test.ts` | `grade-linkedin/__tests__/runtime-validation-convergence.test.ts` | a real free result drives through the new schema+semanticCheck → converges (never rejects a valid success) |
| `__tests__/byte-preserve.test.ts` | `recruiting-lens/__tests__/byte-preserve.test.ts` | golden free/Pro/Elite outputs deep-equal through the new schema (the D-10 collision guard) |
| `__tests__/cors-matrix.test.ts` | `recruiting-lens/__tests__/cors-matrix.test.ts` | apex+www × success/failure header matrix; evil-origin fail-closed |
| streaming-wrapper ordering test | `grade-linkedin/handler-config.test.ts` + `_shared/merit-gateway.spend-ordering.test.ts` | create_or_recover→reserve-with-key→…→settle-on-saved order; no refund reachable post-`completed` |

Extend `_shared/analysis-lifecycle.dormancy.test.ts` for resume/onboarding OFF-by-default; keep `AnalysisHistory.phase22.test.ts` (frontend vitest) green.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Streaming-aware lifecycle wrapper (D-02) | utility / orchestration | streaming | No streaming lifecycle exists — the LOCKED executor is request/response only. Compose from `analysis-lifecycle.ts:233-372` primitives + `analyze-resume:800-965` token path. The single deep-design spot; invariant is "reserve→stream→validate→save→settle-on-saved, executor untouched, UX byte-preserved." |
| Resume validation schema module | schema / validation | transform | No resume zod schema exists yet (the free path uses `repairTruncatedJSON`+`passesQualityFloor`, not a schema). New schema must be permissive + `.passthrough()`, tuned so byte-preserve holds (Open Q1). Contract from `llm-validation.ts`; semantics from `passesQualityFloor:539`. |

---

## Metadata

**Analog search scope:** `supabase/functions/{analyze-resume,grade-linkedin,recruiting-lens,_shared}`, `src/{pages,hooks,contexts,config}`.
**Files scanned:** 14 (all read directly, no re-reads).
**Key verified facts:** executor result union `analysis-lifecycle.ts:178-181`; `withMerits` key forward `merit-gateway.ts:217`; `meritCtx` no-key gap `analyze-resume:728`; `persistResumeAnalysis` throws `MeritRefundable` `:61` (must demote); `passesQualityFloor` `:539`; onboarding fire-and-forget `Onboarding.tsx:372-382`; `MAX_POLLING_TIME` `Results.tsx:213`; timeout dead-end `:604-625`; `AnalysisLockContext` + `analysisError.ts` already exist; per-feature flags `analysis-flags.ts:56-62`; `deno.json:5` already carries the Phase-4 `__tests__` files.
**Pattern extraction date:** 2026-07-05

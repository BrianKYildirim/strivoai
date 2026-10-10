# Phase 6: Feature Migration C — Career Compass - Pattern Map

**Mapped:** 2026-07-06
**Files analyzed:** 6 (2 new, 4 modified) + 1 new Deno guard suite-set
**Analogs found:** 6 / 6 (all exact or role-match — every primitive shipped in Phases 3–5)

This is a **preserve-exactly migration** onto the dormant Phase 3 lifecycle. The single best
analog set is the **Phase 5 resume/onboarding adoption** (`analyze-resume`), which is
request/response-shaped exactly like Career Compass (no streaming twist). Every excerpt below is
the concrete code to copy the shape from.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/functions/_shared/career-validation.ts` (**NEW**) | validation module | transform (validate) | `supabase/functions/analyze-resume/resume-validation.ts` | exact (Phase 5 twin) |
| `supabase/functions/analyze-career/index.ts` (**MODIFY**) | controller/executor host | request-response | `supabase/functions/analyze-resume/index.ts` (onboarding merit-branch L1165-1272) | exact (request/response executor) |
| `supabase/functions/submit-career-analysis-job/index.ts` (**MODIFY**) | route/queue entry | request-response → enqueue | `supabase/functions/submit-resume-analysis-job/index.ts` + `analysis-lifecycle.ts` RPC caller | role-match (WR-04 shape) + RPC signature |
| `supabase/functions/process-career-analysis-job/index.ts` (**MODIFY**) | worker | event-driven (queue) | `supabase/functions/process-resume-analysis-job/index.ts` + `analyze-resume/__tests__/streaming-wrapper-ordering.test.ts` | role-match (worker) |
| `src/pages/CareerCompass.tsx` (**MODIFY**) | page/component | request-response + poll→subscribe | `src/pages/Onboarding.tsx` (`useAnalysisRun` wiring) | exact (D-04 onboarding analog) |
| `supabase/functions/analyze-career/__tests__/*.test.ts` (**NEW SUITE-SET**) | test | — | `supabase/functions/analyze-resume/__tests__/*` | exact (Phase 5 guard set) |

---

## Pattern Assignments

### `supabase/functions/_shared/career-validation.ts` (NEW — validation module, transform)

**Analog:** `supabase/functions/analyze-resume/resume-validation.ts` (whole file, 94 lines — read it in full and mirror structure). Plugs into the LOCKED `_shared/llm-validation.ts` `validateModelOutput` seam.

**Import + permissive-schema pattern** (`resume-validation.ts:31-57`):
```typescript
import { z } from 'https://esm.sh/zod@3.25.76';

// Required: overallScore + non-empty criteria array; everything else .passthrough()
// so the saved payload stays BYTE-IDENTICAL to the current output (D-09/D-08).
export const resumeAnalysisSchema = z
  .object({ overallScore: z.number() })
  .passthrough()
  .superRefine((val, ctx) => {
    const record = val as Record<string, unknown>;
    const arr = Array.isArray(record.criterionFeedback) ? record.criterionFeedback
      : Array.isArray(record.criteria) ? record.criteria : [];
    if (arr.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '...', path: ['criterionFeedback'] });
    }
  });
export type ResumeAnalysisResult = z.infer<typeof resumeAnalysisSchema>;
```
**Career adaptation (D-07):** require the **core save-blocking** structures as non-empty —
`careerDNA`, `careerFields`, `surpriseFits`, `skillGaps`/gaps, `roleRoadmaps`+`roadmap`,
`roleReadinessBreakdown`, `roleReadinessScore`. Mark elite `compensationIntelligence` **optional**
(`.passthrough()` preserves it when present, never requires it — D-08). Encode the required-set
using the existing `CAREER_CORE_SECTION_CHECKS` (`analyze-career/index.ts:82-89`) and
`assertPaidCareerOutputComplete` (`:103-115`) as the field list.

**Semantic-check pattern** (`resume-validation.ts:69-93`) — a BYTE-FAITHFUL mirror of the
existing quality floor, returning the `llm-validation` discriminated union:
```typescript
export function resumeSemanticCheck(
  value: ResumeAnalysisResult,
): { ok: true } | { ok: false; detail: string } {
  const record = value as Record<string, unknown>;
  const criteria = (record.criterionFeedback || record.criteria || []) as Array<{ score?: number }>;
  if (criteria.length === 0) return { ok: false, detail: 'criterion feedback is empty' };
  const scores = criteria.map((c) => Number(c.score) || 0);
  if (scores.every((s) => s === 0)) return { ok: false, detail: 'all criterion scores are zero' };
  if (scores.every((s) => s === scores[0])) return { ok: false, detail: 'all criterion scores are identical' };
  return { ok: true };
}
```
**Career adaptation (D-08):** the `careerSemanticCheck` must assert the SAME non-empty-array
invariants `assertPaidCareerOutputComplete` already uses — **tuned so a currently-valid
Free/Pro/Elite output passes byte-identically** (it can NEVER reject an output the current lenient
path accepts). The return-shape `{ ok: true } | { ok: false; detail: string }` is the exact
contract `LlmValidationOptions.semanticCheck` expects (`llm-validation.ts:35`).

**How it composes** (`llm-validation.ts:60-113`): `validateModelOutput(rawText, schema, opts)` runs
empty→parse→**truncation-reject** (`:87-89`)→empty/generic→`schema.safeParse`→`semanticCheck`.
Career must call this on the **ASSEMBLED FINAL object** (base + folded elite-extras + metadata,
serialized to text), NOT the raw model text — so truncation is rejected (Pitfall 9) while a clean
success passes. Fold elite-extras NON-fatally BEFORE validation.

---

### `supabase/functions/analyze-career/index.ts` (MODIFY — executor host, request-response)

**Analog:** `analyze-resume/index.ts` onboarding merit-branch (`:1165-1272`) — the proven
request/response `runAnalysisLifecycle` adoption with **dormancy fall-through**. This is the
recommended executor-attachment site (RESEARCH Pattern 1).

**Imports** (`analyze-resume/index.ts:18-20`):
```typescript
import { runAnalysisLifecycle, classifyFailure } from '../_shared/analysis-lifecycle.ts';
import { deriveIdempotencyKey } from '../_shared/idempotency-key.ts';
import { isAnalysisFeatureEnabled } from '../_shared/analysis-flags.ts';
```

**inputIdentity + attemptNonce derivation** (`analyze-resume/index.ts:1169-1174`) — STABLE,
never a save-mutated field (Pitfall 8):
```typescript
const onboardingInputIdentity = await sha256Hex(
  JSON.stringify({ text_hash: resumeTextHash, resumeId, targetRole, targetIndustry }),
);
const onboardingAttemptNonce = typeof rawBody.attemptNonce === 'string' && rawBody.attemptNonce
  ? rawBody.attemptNonce
  : crypto.randomUUID();
```
**Career adaptation (D-03 / Discretion):** derive `inputIdentity` from the **prior-analyses
identity** the current cache uses — prior resume `grading_data` hash + prior linkedin
`grading_data` hash + tier + variant + `allowResumeOnly`/`compareRoles` (see `buildCareerCacheKey`
`analyze-career/index.ts:985-998` / helper `:132-157`). Read `attemptNonce` from the worker
payload so the SAME key spans submit→process→analyze-career.

**Executor `{extract, generate, schema, validationOpts, save}` contract**
(`analyze-resume/index.ts:1176-1250`; contract def `analysis-lifecycle.ts:145-176`):
```typescript
const onboardingLifecycle = await runAnalysisLifecycle<ResumeAnalysisResult, { resumeText: string }>({
  feature: 'onboarding',                 // → 'career_compass'
  meritFeature: 'resume_analysis',       // → 'career_compass'
  ctx: { userId: userContext.userId, tier: resolvedTier, corsType: 'user' },
  jobType: 'resume_analysis',            // → 'career_compass'
  resumeId,
  inputIdentity: onboardingInputIdentity,
  attemptNonce: onboardingAttemptNonce,
  extract: () => Promise.resolve({ resumeText: sanitizeUserContent(...) }),
  generate: async (_txId, extracted) => { /* build prompt, call model, return JSON.stringify(assembled) */ },
  schema: resumeAnalysisSchema,                                   // → careerCompassSchema
  validationOpts: { semanticCheck: resumeSemanticCheck },        // → careerSemanticCheck
  save: async (value) => { /* authoritative insert + best-effort mirrors — see below */ },
});
```

**save() reconciliation (D-10)** — authoritative throws-pre-settle + post-save log-and-continue
mirrors (`analyze-resume/index.ts:1228-1249`). Career maps onto the EXISTING
`persistCareerResultAndRecordUsage` (`analyze-career/index.ts:301-379`): the
`analysis_results.insert({analysis_type:'career_compass', raw_response, …})` (`:312-329`) is the
SOLE authoritative write (throws `MeritRefundable(500)`); `profiles` update (`:349`) +
`analysis_cache` upsert (`writeCareerAnalysisCache`, `:264-299`) demote to post-save
log-and-continue. `settle-on-saved` (`merit_settled=true` in the `saving→completed` CAS,
`analysis-lifecycle.ts:366`) makes CR-02 structural.

**OFF-flag byte-identical fall-through** (`analyze-resume/index.ts:1252-1272`):
```typescript
if (onboardingLifecycle.ok) {
  return new Response(JSON.stringify({ ...onboardingLifecycle.value, run_id: onboardingLifecycle.runId, recordId: resumeId }), {...});
}
if (!onboardingLifecycle.dormant) {
  if (onboardingLifecycle.response) return onboardingLifecycle.response;   // reuse gateway 402
  return new Response(JSON.stringify({ error: '...', code: onboardingLifecycle.code }), { status: 500, ... });
}
// dormant:true → fall through to today's UNCHANGED withMerits path (100% of traffic while flag OFF)
```

**Idempotency-key gap closure (D-03)** — mirror the `:1289` fix; the current career `withMerits`
ctx (`analyze-career/index.ts:1000-1002`) is `{userId,tier,corsType}` with NO key. Set
`meritCtx.idempotencyKey` before `withMerits`, exactly as `analyze-resume/index.ts:1297-1302`:
```typescript
const meritCtx: MeritGatewayContext = { userId, tier: resolvedTier, corsType: 'user', idempotencyKey: <derivedKey> };
```

> **BLOCKER — RESEARCH Open Question 1:** confirm which branch the live queue path actually
> executes (static analysis says legacy free-tier because internal-auth → `userContext=null`).
> The planner must resolve this before choosing whether the executor attaches around the
> merit-branch (fan-out) or the legacy single-call branch.

---

### `supabase/functions/submit-career-analysis-job/index.ts` (MODIFY — queue entry, D-05)

**Analog A (current shape to REPLACE):** `submit-resume-analysis-job/index.ts:86-167` — the
merit-branch WR-04 `SELECT active THEN INSERT` + `withMerits` deduction:
```typescript
if (MERIT_SYSTEM_ENABLED && authenticatedUserCtx) {
  // WR-04 SELECT-active-then-INSERT (TOCTOU — REPLACE with create_or_recover_analysis_run)
  const { data: existingJobMerit } = await supabase.from("analysis_jobs")
    .select("id, status, created_at").eq("user_id", authenticatedUserId)
    .eq("job_type", "resume_analysis").in("status", ["pending","retrying","processing"])
    .contains("payload", { resumeId }).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if (existingJobMerit?.id) return new Response(JSON.stringify({ jobId: existingJobMerit.id, ... }), {...});
  const gated = await withMerits({ userId, tier, corsType: 'user' }, 'resume_analysis', async (txId) => {
    const { data: job } = await supabase.from("analysis_jobs").insert({ ..., merit_transaction_id: txId }).select("id, status, created_at").single();
    // trigger worker fetch(...process-*-job)
  });
}
```
> NOTE: resume submit still passes **NO idempotency key** here — do NOT copy that gap. Career
> must derive + thread the key (D-03).

**Analog B (the atomic RPC that REPLACES WR-04, D-05):** `analysis-lifecycle.ts:233-250` is the
canonical caller — copy this signature:
```typescript
const idempotencyKey = await deriveIdempotencyKey({
  userId: ctx.userId, feature: params.meritFeature, tier: ctx.tier,
  inputIdentity: params.inputIdentity, attemptNonce: params.attemptNonce,
});
const { data: created } = await supabase.rpc('create_or_recover_analysis_run', {
  p_user_id: ctx.userId, p_feature: params.meritFeature, p_tier: ctx.tier,
  p_idempotency_key: idempotencyKey, p_job_type: params.jobType,
  p_resume_id: params.resumeId ?? null, p_payload: params.payload ?? {},
});
const runId = (created as { run_id: string }).run_id;   // run_id === analysis_jobs.id === jobId
```
**Career adaptation:** in submit, derive the key from the prior-analyses `inputIdentity` +
`attemptNonce`, call `create_or_recover_analysis_run` (replaces both the WR-04 SELECT at career
`submit index.ts:72-91` AND the raw `analysis_jobs.insert` at `:114`), thread
`{run_id, idempotencyKey, attemptNonce, inputIdentity}` into the worker payload, keep the
synchronous `withMerits` deduction (RESEARCH rec (a): key makes the executor's later reserve an
idempotent no-op), return `{ jobId: run_id }`. CORS wrapper `withCors(req,'user',…)` stays intact
(D-11). Keep flag-OFF legacy path byte-identical.

---

### `supabase/functions/process-career-analysis-job/index.ts` (MODIFY — worker, two-writer deferral)

**Analog A (worker mechanics):** `process-resume-analysis-job/index.ts` — internal-auth claim +
fetch TARGET + `refundMeritsForJob` + retry classification. Key shared pieces:
- Resilience contract header (`:9-30`) — copy the "loading hides on status=completed AND
  {grading_data|recruiting_lens|career_compass} non-null; terminal failure refunds" invariant.
- `isRetryableHttpStatus` (`:51-61`) — the SAME retryable set the executor's `classifyFailure`
  mirrors (`analysis-lifecycle.ts:73-83`).
- Internal-auth gate `requireAuth({type:'internal'})` (contract note `:26-27`) — career worker
  stays internal-only (D-11: `handleOptionsRequest` only, no browser CORS).

**Analog B (two-writer ordering guard, Pattern 2 — the highest-risk integration bug):**
`analyze-resume/__tests__/streaming-wrapper-ordering.test.ts` is the ordering-guard precedent.
**Career adaptation (RESEARCH Pattern 2):** when `isAnalysisFeatureEnabled('career_compass')` is
ON, the worker must **defer** its raw `status`/refund writes to the executor:
- On 2xx from analyze-career: do NOT overwrite `status`/`state` (executor already CAS'd
  `saving→completed` + `merit_settled=true`).
- On non-2xx: do NOT independently refund (executor already refunded pre-saving + CAS'd to
  `failed`/`retryable_failed`). `refundMeritsForJob` is idempotent (`alreadyRefunded`) so a
  residual call is safe, but a raw `status='failed'` write would stomp the executor's `state` —
  skip it behind the flag.
- The initial claim (`status='processing'`, `attempts+1`) may remain — it doesn't touch `state`,
  and `transition_analysis_run` dual-writes `status='processing'` for mid-pipeline states.
- Fix the STALE `career_compass_analyses` comment (`process-career-analysis-job/index.ts:16,22`) —
  no such table; authoritative store is `analysis_results` (D-10).

---

### `src/pages/CareerCompass.tsx` (MODIFY — page, poll-cap → useAnalysisRun, D-04)

**Analog:** `src/pages/Onboarding.tsx` — the D-04-referenced onboarding recovery wiring using
`useAnalysisRun`.

**Hook import + init** (`Onboarding.tsx:5, 144`):
```typescript
import { useAnalysisRun } from "@/hooks/useAnalysisRun";
// ...
const analysisRun = useAnalysisRun();   // no-ops fully while VITE_FEATURE_ANALYSIS_LIFECYCLE off
```

**attemptNonce on submit + startRun-before-navigate** (`Onboarding.tsx:383-413`):
```typescript
const attemptNonce = crypto.randomUUID();
const { data, error } = await invokeWithTimeout<{ run_id?: string; error?: string }>(
  /* ...body includes attemptNonce... */,
);
// Persist run_id for refresh/navigation recovery, THEN navigate. startRun no-ops if the backend
// is still dormant (no run_id in the response) or the flag is off.
if (data.run_id) analysisRun.startRun(data.run_id);
```
**Career adaptation (D-04 / Discretion):** REPLACE the `while (Date.now() - pollStart < MAX_POLL_MS)`
loop (`CareerCompass.tsx:664-689`, `MAX_POLL_MS=180000` at `:664`) with `startRun(jobId)` after
submit (career's `careerJobId` IS the run_id), render from the hook snapshot, and on `isCompleted`
hydrate the result from `analysis_results.raw_response` **pinned** exactly as the `?id=` path does
(`CareerCompass.tsx:374-395`). Keep run_id in URL+localStorage (hook-owned), submit-lock via
`AnalysisLockContext` + `useAnalysisRun.isActive`, preserve-previous-success. Keep flag-OFF branch
(legacy poll loop) byte-identical. Multi-role compare (`invokeCareerAnalysisDirectWithFailover`,
`:246`) + `?id=` hydration stay OUTSIDE the hook (D-06).

---

## New Deno Guard Test Suites (mirror the Phase 5 set)

**Analog dir:** `supabase/functions/analyze-resume/__tests__/` — the shipped guard set:
`idempotency-repeated-run.test.ts`, `byte-preserve.test.ts`, `cors-matrix.test.ts`,
`runtime-validation-convergence.test.ts`, `streaming-wrapper-ordering.test.ts`,
`history-persistence.test.ts`.

| New career guard (`analyze-career/__tests__/…`) | Resume-analysis twin | Asserts |
|---|---|---|
| `idempotency-repeated-run.test.ts` | `analyze-resume/__tests__/idempotency-repeated-run.test.ts` | same nonce → same key (1 deduction); fresh nonce → new run; save-mutated field never in key (Pitfall 8); refund-boundary |
| `byte-preserve.test.ts` | `analyze-resume/__tests__/byte-preserve.test.ts` | Free/Pro/Elite deep-equal flag-ON vs legacy |
| `cors-matrix.test.ts` | `analyze-resume/__tests__/cors-matrix.test.ts` | apex+www 200/401/412 + evil-origin fail-closed (D-11) |
| `runtime-validation-convergence.test.ts` | `analyze-resume/__tests__/runtime-validation-convergence.test.ts` | valid → typed success; invalid/truncated/empty/all-zero core → typed `AnalysisErrorCode` (never fabricated); elite-extras missing → still valid core (D-08) |
| worker two-writer guard (new) | `analyze-resume/__tests__/streaming-wrapper-ordering.test.ts` | flag ON → worker defers status/refund; no double-refund (Pattern 2) |

**Guard test import shape** (`idempotency-repeated-run.test.ts:35-55`):
```typescript
import { assert, assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { deriveIdempotencyKey, type IdempotencyKeyParts } from '../../_shared/idempotency-key.ts';
// Deno.test('...', async () => { assertEquals(await deriveIdempotencyKey(BASE), await deriveIdempotencyKey({...BASE})); });
```
**Registration:** append each new Deno suite to `supabase/functions/deno.json` `test:ci` allowlist
(a green baseline only proves pre-existing behavior — new guards are mandatory). Existing career
suites (`analyze-career/{index,cache,failure-branches,history-persistence,paid-output-validation,
phase22-contract,refund-after-save}.test.ts`, `submit-career-analysis-job/job-contract.test.ts`,
`process-career-analysis-job/__tests__/refund-on-failure.test.ts`, `_shared/career-shape.test.ts`)
must stay green (byte-preserve proof). Frontend vitest recovery/hydration guards go in
`CareerCompass.*.test.ts`. `test:adversarial:career` (promptfoo) stays OFF the gate.

---

## Shared Patterns

### Idempotency key (single-source, spans the 3-function dance)
**Source:** `_shared/analysis-lifecycle.ts:233-250` + `_shared/idempotency-key.ts`
**Apply to:** submit (derive + thread), process (forward payload), analyze-career (re-derive same key).
The 4-arg `check_and_deduct_merits` replays `already_deducted` on a repeated key → submit's
reservation + executor's `reserving_merits` collapse to ONE deduction. NEVER key off a
save-mutated field (Pitfall 8) — use `buildCareerCacheKey` inputs (`analyze-career/index.ts:132-157,
985-998`).

### Strict no-masking validation
**Source:** `_shared/llm-validation.ts:60-113` (truncation rejected at `:87-89`, never repaired-and-accepted)
**Apply to:** analyze-career output, on the ASSEMBLED FINAL object. Core save-blocking (D-07);
elite-extras folded non-fatally BEFORE validation (D-08); success byte-identical.

### save() — authoritative throws-pre-settle + post-save best-effort mirrors
**Source:** `analysis-lifecycle.ts:354-372` (executor) + `analyze-resume/index.ts:1228-1249` (adoption)
**Apply to:** `analysis_results.insert` (authoritative, throws `MeritRefundable`) vs `profiles` /
`analysis_cache` (log-and-continue). `merit_settled=true` ONLY in the `saving→completed` CAS.

### Dormancy fall-through (byte-identical when OFF)
**Source:** `analyze-resume/index.ts:1252-1272` + `analysis-lifecycle.ts:216-218`
**Apply to:** every touched edge function — `dormant:true` → run today's UNCHANGED path.
`isAnalysisFeatureEnabled('career_compass')` gates; `ANALYSIS_LIFECYCLE_CAREER_COMPASS`
(`analysis-flags.ts:61`) + `ANALYSIS_LIFECYCLE_ENABLED` kill-switch + frontend
`VITE_FEATURE_ANALYSIS_LIFECYCLE`.

### CORS re-proof (not a code fix, D-11)
**Source:** `submit-resume-analysis-job/index.ts:35` (`withCors(req,'user',…)`)
**Apply to:** preserve `withCors` on `analyze-career` (`:804`) + `submit-career-analysis-job`
(`:28`); `ALLOWED_ORIGINS` includes apex + www; worker stays `handleOptionsRequest`-only internal.

### Frontend run_id recovery
**Source:** `src/pages/Onboarding.tsx:5,144,383-413` + `src/hooks/useAnalysisRun.ts`
**Apply to:** `CareerCompass.tsx` — replaces the 180s poll cap; subscribe-first/poll-fallback,
run_id URL+localStorage, submit-lock, preserve-previous-success (D-04).

---

## No Analog Found

None. Every file has a strong analog; every primitive shipped dormant in Phases 3–5.

**Caveat (not a missing analog — a design blocker):** the executor-attachment branch inside
`analyze-career` is gated on RESEARCH Open Question 1 (live-path tier/branch). The analog pattern
(`analyze-resume` onboarding branch) is identical either way; only WHERE it wraps
(merit-branch fan-out vs legacy single-call) depends on that resolution.

---

## Metadata

**Analog search scope:** `supabase/functions/{analyze,submit,process}-{resume,career}-*`,
`supabase/functions/_shared/`, `supabase/functions/analyze-resume/__tests__/`, `src/pages/`,
`src/hooks/`.
**Files scanned:** ~14 (6 analogs read in full/targeted; career sources classified from
CONTEXT/RESEARCH line-citations).
**Pattern extraction date:** 2026-07-06

# Phase 04: Incremental Elite Unlock for Previously Analyzed Free-Tier Resumes - Pattern Map

**Mapped:** 2026-07-30  
**Files analyzed:** 23 new/modified files  
**Analogs found:** 23 / 23

## Scope Derived from Upstream Artifacts

There is no `CONTEXT.md`. Scope comes from `04-RESEARCH.md`, the approved
`04-UI-SPEC.md`, `04-VALIDATION.md`, and the Phase 4 roadmap entry.

The smallest cohesive implementation extends the existing resume-analysis
pipeline. It must:

- update the same `resumes` row rather than clone it;
- validate a stored Free base and detect only missing paid paths;
- generate an allowlisted delta with distinct telemetry call names;
- merge without assigning any existing Free-owned value;
- persist the same-row update, a new immutable mirror, and accounting linkage
  atomically under compare-and-swap/idempotency guards;
- thread the additive mode through the currently reachable queue fallback;
- reuse Results, `EliteRerunCta`, `UniversalAnalyzing`, lifecycle recovery,
  merit pricing, and existing tier gating;
- preserve the changed-document boundary in `Upload.tsx` without changing the
  filename-independent identity rule.

No new page, result table, billing path, progress component, or parallel API is
in scope.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/functions/_shared/resume-elite-unlock.ts` (new) | utility | transform | `supabase/functions/_shared/result-merger.ts` | role + flow |
| `supabase/functions/_shared/resume-prompts.ts` | utility | transform | same file's scoped `elite-extras` builder | exact seam |
| `supabase/functions/analyze-resume/resume-validation.ts` | utility | transform | same file's permissive schema + semantic check | exact seam |
| `supabase/functions/analyze-resume/index.ts` | controller | streaming + request-response + CRUD | same file's lifecycle-gated full analysis path | exact seam |
| `supabase/migrations/20260730010000_resume_elite_unlock.sql` (new) | migration | CRUD + transactional CAS | `supabase/migrations/20260702000001_analysis_lifecycle_ledger.sql` | role + flow |
| `supabase/functions/_shared/database.types.ts` | model | transform | existing `create_or_recover_analysis_run` declaration | exact seam |
| `src/integrations/supabase/types.ts` | model | transform | existing `create_or_recover_analysis_run` declaration | exact seam |
| `supabase/functions/submit-resume-analysis-job/index.ts` | route | request-response + event-driven | existing authenticated resume enqueue | exact seam |
| `supabase/functions/process-resume-analysis-job/index.ts` | service | batch + request-response | existing payload-forwarding worker | exact seam |
| `src/hooks/useEliteRerun.ts` | hook | event-driven + request-response | current bounded rerun lease plus `useAnalysisRun` recovery model | role + flow |
| `src/hooks/useResumeStream.ts` | hook | streaming | current additive `StreamParams` request contract | exact seam |
| `src/components/EliteRerunCta.tsx` | component | event-driven | current DB-priced tier-matrix CTA | exact seam |
| `src/pages/Results.tsx` | component | streaming + CRUD reconciliation | current authoritative tier reread and CTA placement | exact seam |
| `src/lib/analysis-stage-copy.ts` | utility | transform | current lifecycle-state copy resolver | exact seam |
| `supabase/functions/_shared/resume-elite-unlock.test.ts` (new) | test | transform | `supabase/functions/_shared/result-merger.test.ts` | role + flow |
| `supabase/functions/analyze-resume/__tests__/incremental-elite-unlock.test.ts` (new) | test | request-response + streaming | existing analyze-resume contract/history tests | role + flow |
| `supabase/functions/analyze-resume/__tests__/history-persistence.test.ts` | test | CRUD + remote request-response | existing resume triple-persistence test | exact seam |
| `supabase/functions/submit-resume-analysis-job/job-contract.test.ts` | test | request-response | current source-read auth/queue contract | exact seam |
| `supabase/functions/process-resume-analysis-job/__tests__/refund-on-failure.test.ts` | test | batch + request-response | current worker source-read failure contract | exact seam |
| `src/hooks/__tests__/useEliteRerun.test.ts` | test | event-driven + request-response | current hook characterization suite | exact seam |
| `src/pages/__tests__/Results.tier-reconciliation.test.tsx` | test | event-driven + transform | current CTA tier-matrix suite | exact seam |
| `src/pages/__tests__/Results.stream-tier-carry.test.tsx` | test | streaming + transform | current authoritative-tier merge suite | exact seam |
| `src/lib/__tests__/analysis-stage-copy.test.ts` | test | transform | current lifecycle copy table tests | exact seam |

### Existing Files to Reuse Without Modification

| File | Reuse |
|---|---|
| `src/components/UniversalAnalyzing.tsx` | Existing dialog, focus trap, scroll lock, reduced-motion handling, 45-second background action, and 120-second polling reassurance |
| `src/components/MeritCostPreview.tsx` | Database-driven cost, balance, and affordability copy |
| `src/pages/Upload.tsx` | Existing hash-based changed-content/new-full-analysis boundary |
| `src/hooks/useAnalysisRun.ts` | Persisted run recovery and realtime-first/poll-fallback lifecycle projection |
| `supabase/functions/_shared/anthropic.ts` | Existing telemetry-aware model invocation |
| `supabase/functions/_shared/ai-telemetry.ts` | Counts/identifiers-only telemetry persistence |
| `supabase/functions/_shared/result-merger.ts` | Full-result field vocabulary and tier-shape reference; do not use its full merge for the delta |

## Pattern Assignments

### `supabase/functions/_shared/resume-elite-unlock.ts` (utility, transform)

**Analog:** `supabase/functions/_shared/result-merger.ts`

**Import and allowlist pattern** (lines 15-42):

```typescript
import { repairTruncatedJSON } from "./json-repair.ts";
import type { CallType } from "./resume-prompts.ts";

const ALLOWED_FIELDS: Record<string, Set<string>> = {
  'criteria-1': new Set(['criterionFeedback']),
  'criteria-2': new Set(['criterionFeedback']),
  'summary': new Set([
    'executiveSummary', 'strengths', 'priorityImprovements',
    'industryGuess', 'suggestedTargetRoles', 'recommendedKeywords',
  ]),
  'rewrites': new Set(['rewriteSuggestions']),
  'elite-extras': new Set(['eliteInsights']),
};
```

**Parse, strip, validate, discriminated-union pattern** (lines 294-342):

```typescript
export function parseAndValidateCall(
  callType: CallType,
  rawText: string,
  isElite: boolean,
): { ok: true; data: Record<string, unknown> } | { ok: false; reason: string } {
  let parsed: Record<string, unknown>;
  try {
    const repaired = repairTruncatedJSON(rawText.trim());
    parsed = JSON.parse(repaired) as Record<string, unknown>;
  } catch {
    const snippet = rawText.trim().slice(0, 200);
    return { ok: false, reason: `${callType}: JSON parse failed: ${snippet}` };
  }

  const normalized = normalizeAliases(parsed);
  const stripped = stripUnknownFields(normalized, callType);
  // call-specific validation...
  return { ok: true, data: stripped };
}
```

**Tier vocabulary and immutable Free shape reference** (lines 66-87, 371-393):

```typescript
const FREE_ALLOWED_FIELDS = new Set<string>([
  ...CORE_FIELDS,
  'executiveSummary',
  'resumeSignal',
  'strengths',
  'priorityImprovements',
  'criterionFeedback',
  'rewriteSuggestions',
]);

const PRO_ADDITIONS = [
  'rewriteSuggestions',
  'industryGuess',
  'suggestedTargetRoles',
  'recommendedKeywords',
] as const;
const ELITE_ADDITIONS = ['eliteInsights'] as const;
```

Copy the explicit allowlist and discriminated-union style, but do **not** copy
`applyTierShape` or a spread merge. The new helper should expose pure functions
for stored-base validation, immutable projection/fingerprint, missing-path
detection, patch validation, and path-by-path merge. Preserve all existing
fields, including paid fields from a partial prior attempt. Existing array
entries must remain deep-equal prefixes; only missing criterion feedback and
new allowed array suffixes may be added.

---

### `supabase/functions/_shared/resume-prompts.ts` (utility, transform)

**Analog:** the same file's dedicated call builders.

**Call routing pattern** (lines 209-221):

```typescript
export function buildCallSuffix(
  callType: CallType,
  isElite: boolean,
  tier: 'free' | 'pro' | 'elite' = 'free',
): string {
  switch (callType) {
    case 'criteria-1':
      return buildCriteria1Suffix(isElite);
    case 'criteria-2':
      return buildCriteria2Suffix(isElite);
    case 'summary':
      return buildSummarySuffix(isElite, tier);
    case 'rewrites':
      return buildRewritesSuffix(tier);
    case 'elite-extras':
      return buildEliteExtrasSuffix();
  }
}
```

**No-rescore, strict-output pattern** (lines 285-311):

```typescript
function buildEliteExtrasSuffix(): string {
  return `You are generating ELITE-TIER BONUS INSIGHTS for a resume that has already been scored and analyzed. Do NOT re-score criteria. Do NOT repeat strengths or improvements. Focus ONLY on the advanced strategic fields below.

Return ONLY valid JSON (no markdown, no text outside JSON) matching this schema:
{"eliteInsights":{...}}

QUALITY GUARDS:
- interviewLikelihood must be 0-100 reflecting realistic assessment, not optimistic padding.
- competitiveRanking must be one of exactly: "Top 10%", "Top 25%", "Top 50%", "Bottom 50%".`;
}
```

Add focused exported builders for the details delta and optional Elite extras.
Build the JSON schema from the detected missing-path set. State that score,
summary, strengths, existing items, criterion identity/score/weight, and
existing feedback are immutable. Request no key that is already present.

---

### `supabase/functions/analyze-resume/resume-validation.ts` (utility, transform)

**Analog:** same file, lines 31-57 and 69-92.

```typescript
import { z } from 'https://esm.sh/zod@3.25.76';

export const resumeAnalysisSchema = z
  .object({
    overallScore: z.number(),
  })
  .passthrough()
  .superRefine((val, ctx) => {
    const record = val as Record<string, unknown>;
    const cf = record.criterionFeedback;
    const cr = record.criteria;
    const arr = Array.isArray(cf) ? cf : Array.isArray(cr) ? cr : [];
    if (arr.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'criterionFeedback or criteria must be a non-empty array',
        path: ['criterionFeedback'],
      });
    }
  });
```

Keep the complete-result schema permissive and preservation-safe. Add a narrow
patch schema/semantic validator that rejects forbidden keys and validates only
requested missing paths. Validate the patch first, then run the existing full
schema and `resumeSemanticCheck` on the assembled result before any write.

---

### `supabase/functions/analyze-resume/index.ts` (controller, streaming/request-response/CRUD)

**Analog:** its existing authenticated lifecycle path.

**Imports pattern** (lines 3-23):

```typescript
import { getServiceClient, getSupabaseUrl, getServiceRoleKey } from '../_shared/supabase-client.ts';
import type { Json } from '../_shared/database.types.ts';
import { invokeAnthropicText } from '../_shared/anthropic.ts';
import { createLogger } from '../_shared/logger.ts';
import { requireInternalOrUserAuth, resolveTierForUserId } from '../_shared/auth.ts';
import { withMerits, MeritRefundable, refundMeritsForJob, type MeritGatewayContext } from '../_shared/merit-gateway.ts';
import { sanitizeUserContent } from '../_shared/prompt-sanitizer.ts';
import { deriveIdempotencyKey } from '../_shared/idempotency-key.ts';
import { validateModelOutput } from '../_shared/llm-validation.ts';
```

**Auth and server-authoritative tier pattern** (lines 1324-1354):

```typescript
const supabase = getServiceClient();
const userContext = await requireInternalOrUserAuth(req);

let resolvedTier: Tier;
if (userContext) {
  resolvedTier = (userContext.tier as Tier) ?? 'free';
  log.info('tier-resolved', { userId: userContext.userId, tier: resolvedTier, source: 'jwt' });
} else if (typeof userId === 'string' && userId) {
  resolvedTier = await resolveTierForUserId(userId);
  log.info('tier-resolved', { userId, tier: resolvedTier, source: 'internal-db' });
} else {
  resolvedTier = 'free';
  log.warn('tier-unresolvable', { reason: 'no-user-context-and-no-payload-user-id' });
}
```

**Sanitization and prompt context pattern** (lines 947-965):

```typescript
const normalizedText = sanitizeUserContent(
  resumeText.replace(/\s+/g, ' ').trim(),
  'analyze-resume',
  log,
);
const improvementContext = buildImprovementContext(incorporatedSuggestions, previousScore);
const userPrompt = buildUserPrompt(normalizedText, improvementContext);
```

**Telemetry call pattern** (lines 423-443):

```typescript
const resp = await invokeAnthropicText({
  model: params.model,
  system: buildSystemBlocks(callType, params.promptParams),
  messages: [{ role: 'user', content: params.userPrompt }],
  maxTokens,
  temperature: 0.3,
  fixtureKey: params.fixtureKey,
  telemetry: {
    feature: 'resume_analysis',
    tier: params.tier,
    callName: callType,
    reqId: params.reqId,
    userId: params.userId,
    attempt,
  },
});
```

Use explicit call names `elite-unlock-details` and
`elite-unlock-extras`. Never log prompt, resume, or response content.

**Stable lifecycle recovery pattern** (lines 1004-1031):

```typescript
const { data: created, error: createErr } = await supabase.rpc(
  'create_or_recover_analysis_run',
  {
    p_user_id: userId,
    p_feature: 'resume_analysis',
    p_tier: resolvedTier,
    p_idempotency_key: idempotencyKey,
    p_job_type: 'resume_analysis',
    p_resume_id: resumeId ?? null,
    p_payload: {},
  },
);
if (createErr || !created) {
  return sseOneShotResponse({
    type: 'error',
    message: 'Could not start analysis. Please try again.',
  });
}
const runId = (created as { run_id: string }).run_id;
const recovered = (created as { recovered?: boolean }).recovered === true;
if (recovered) {
  return sseOneShotResponse({
    type: 'error',
    message: 'An analysis for this resume is already running.',
    run_id: runId,
    recovered: true,
  });
}
```

For unlock, derive the stable key from authenticated user ID, source resume ID,
Free mirror ID, base grading fingerprint, and mode. Branch after auth/tier
resolution but before normal cache and full prompt construction. A completed
replay returns the stored merged result without model calls or a new charge.

**Validation/save/refund boundary pattern** (lines 1200-1258):

```typescript
const validated = validateModelOutput(
  JSON.stringify(finalResult),
  resumeAnalysisSchema,
  { semanticCheck: resumeSemanticCheck },
);
if (!validated.ok) {
  const refund = await refundMeritsForJob(
    userId,
    transactionId,
    `validating_output:${validated.code}`,
  );
  await transitionResumeRun(supabase, log, runId, 'generating', 'failed', {
    failure_code: validated.code,
    failure_stage: 'validating_output',
    refunded: refund.ok,
  });
  return;
}

await transitionResumeRun(supabase, log, runId, 'validating_output', 'saving');
// durable save
await transitionResumeRun(supabase, log, runId, 'saving', 'completed', {
  merit_settled: true,
});
```

Unlike the current three-step `completeAndRecordSuccess` chain, unlock must call
the new atomic RPC for same-row update + merged mirror + accounting linkage.
All generation/validation/conflict errors occur before the write and cannot
change the Free row. Do not emit raw `saveErr.message` for unlock; map to the
approved recovery categories.

---

### `supabase/migrations/20260730010000_resume_elite_unlock.sql` (migration, transactional CRUD/CAS)

**Analog:** `supabase/migrations/20260702000001_analysis_lifecycle_ledger.sql`.

**Advisory-lock idempotency pattern** (lines 194-235):

```sql
CREATE OR REPLACE FUNCTION public.create_or_recover_analysis_run(...)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'create_or_recover_analysis_run: p_idempotency_key is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_idempotency_key));

  SELECT id, state
    INTO v_existing_id, v_existing_state
    FROM public.analysis_jobs
    WHERE idempotency_key = p_idempotency_key
      AND state NOT IN ('completed', 'failed', 'refunded')
    LIMIT 1;
  ...
END;
$$;
```

**Compare-and-swap/no-op pattern** (lines 387-427):

```sql
UPDATE public.analysis_jobs
  SET state = p_to_state,
      status = v_legacy_status,
      state_updated_at = now(),
      updated_at = now()
  WHERE id = p_run_id AND state = p_from_state;

GET DIAGNOSTICS v_updated = ROW_COUNT;

IF v_updated = 0 THEN
  RETURN jsonb_build_object(
    'run_id', p_run_id,
    'transitioned', false,
    'noop', true,
    'to_state', p_to_state
  );
END IF;
```

**Grant ceremony** (lines 447-453):

```sql
REVOKE ALL ON FUNCTION public.create_or_recover_analysis_run(...) FROM public;
GRANT EXECUTE ON FUNCTION public.create_or_recover_analysis_run(...)
  TO service_role;
```

The new RPC should lock the keyed intent/row, scope every predicate to
`p_user_id`, verify the Free mirror's `source_reference`, compare expected
content hashes and base fingerprint, and treat an already-complete same-row
Elite result as idempotent success. In one transaction it updates
`resumes.grading_data`/`analyzed_tier`, inserts exactly one merged
`analysis_results` row with incremental metadata, and links the usage record.
Revoke from `public` and `authenticated`; grant only `service_role`.

---

### Generated Supabase type files (models, transform)

**Targets:**

- `supabase/functions/_shared/database.types.ts`
- `src/integrations/supabase/types.ts`

**Analog:** existing RPC declaration (edge lines 1797-1808; frontend lines
1818-1829):

```typescript
create_or_recover_analysis_run: {
  Args: {
    p_feature: string
    p_idempotency_key: string
    p_job_type: string
    p_payload?: Json
    p_resume_id?: string
    p_tier: string
    p_user_id: string
  }
  Returns: Json
}
```

Regenerate or update both mirrors after adding the RPC. Keep argument names
identical to SQL and the return type `Json` unless the repository generator
produces a narrower type.

---

### Queue fallback files (route/service, request-response + batch)

**Targets:**

- `supabase/functions/submit-resume-analysis-job/index.ts`
- `supabase/functions/process-resume-analysis-job/index.ts`

**Authenticated enqueue pattern** (`submit-resume-analysis-job/index.ts`,
lines 64-80):

```typescript
const authenticatedUserCtx = await requireAuth(req, { type: 'user' });
const authenticatedUserId = authenticatedUserCtx.userId;
if (userId && authenticatedUserId !== userId) {
  return new Response(
    JSON.stringify({ error: "Authenticated user does not match request userId" }),
    { status: 403, headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" } },
  );
}
```

**Server-owned payload + merit-safe insert pattern** (lines 106-145):

```typescript
const gated = await withMerits(
  {
    userId: authenticatedUserId,
    tier: authenticatedUserCtx.tier as 'free' | 'pro' | 'elite',
    corsType: 'user' as const,
  },
  'resume_analysis',
  async (txId) => {
    const payload = {
      resumeText,
      resumeId,
      userId: authenticatedUserId,
      tier: authenticatedUserCtx.tier,
      previousSuggestions,
      previousScore,
    };

    const { data: job, error: insertError } = await supabase
      .from("analysis_jobs")
      .insert({ user_id: authenticatedUserId, job_type: "resume_analysis", payload });

    if (insertError || !job) {
      throw new MeritRefundable(503, `job insert failed: ${insertError?.message ?? 'unknown'}`);
    }
  },
);
```

**Worker forwarding pattern** (`process-resume-analysis-job/index.ts`, lines
172-194):

```typescript
for (const job of claimedJobs) {
  const payload = job.payload || {};
  const resumeId = String(payload.resumeId || "");
  const userId = String(payload.userId || job.user_id || "");

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/analyze-resume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "x-internal-job-secret": internalJobSecret,
    },
    body: JSON.stringify(payload),
  });
}
```

For `mode: 'elite_unlock'`, accept/forward only source `resumeId`, optional
`baseAnalysisId`, mode, and the stable attempt identity. Do not require or
forward replacement `resumeText` for unlock; `analyze-resume` must load stored
text. Include mode/base identity in active-job dedup so a normal full analysis
and an unlock cannot alias accidentally.

---

### `src/hooks/useEliteRerun.ts` (hook, event-driven/request-response)

**Analogs:** current hook for bounded local persistence and `useAnalysisRun` for
authoritative recovery.

**Current state/error hook shape** (lines 111-125):

```typescript
export function useEliteRerun(): {
  startEliteRerun: (sourceResume: EliteRerunSource) => Promise<void>;
  isStarting: boolean;
  error: string | null;
} {
  const navigate = useNavigate();
  const { data: featureCosts } = useFeatureCosts();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEliteRerun = useCallback(async (sourceResume) => {
    setError(null);
    setIsStarting(true);
    try {
      // start
    } finally {
      setIsStarting(false);
    }
  }, []);
}
```

**Existing bounded lease idea** (lines 25-36, 53-65):

```typescript
const LEASE_TTL_MS = 15 * 60 * 1000;
const MAX_LEASE_REUSES = 3;

interface EliteRerunLease {
  newResumeId: string;
  attemptNonce: string;
  createdAt: number;
  reuses: number;
}

function readLease(sourceResumeId: string): EliteRerunLease | null {
  try {
    const raw = localStorage.getItem(leaseKey(sourceResumeId));
    if (!raw) return null;
    return JSON.parse(raw) as EliteRerunLease;
  } catch {
    return null;
  }
}
```

Retain bounded local recovery only as a UX aid. Replace `newResumeId` with the
same source resume/run identity, remove the `.from('resumes').insert(...)`
clone, and seed `mode: 'elite_unlock'`, source `resumeId`, optional
`baseAnalysisId`, merit cost, and stable nonce. Navigate to the same
`/results/:resumeId` path with the existing stream/recovery mechanism. Return
typed recovery state so the CTA can own inline failure instead of emitting a
duplicate toast.

---

### `src/hooks/useResumeStream.ts` (hook, streaming)

**Analog:** current additive request contract, lines 26-57 and 163-184.

```typescript
export interface StreamParams {
  resumeId: string;
  resumeText: string;
  userId: string;
  tier: string;
  previousSuggestions: any[];
  previousScore: number | null;
  meritCost?: number;
  attemptNonce?: string;
  _retryKey?: number;
}
```

```typescript
response = await fetch(`${supabaseUrl}/functions/v1/analyze-resume`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'apikey': supabaseAnonKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    resumeId: params.resumeId,
    resumeText: params.resumeText,
    userId: params.userId,
    tier: params.tier,
    previousSuggestions: params.previousSuggestions,
    previousScore: params.previousScore,
    attemptNonce: params.attemptNonce,
    stream: true,
  }),
});
```

Make mode/base fields additive and make `resumeText` optional only for unlock.
Do not send stored analysis data, account tier as proof, or client replacement
text in unlock mode. Map unlock lifecycle states to the approved copy and keep
optimistic accounting tied to the single existing settle closure.

---

### `src/components/EliteRerunCta.tsx` (component, event-driven)

**Analog:** the current component.

**Tier and three-valued pricing guards** (lines 27-60):

```tsx
const accountTier = normalizeActiveTier(userTier);
const analyzedTier = sourceResume.analyzed_tier;

if (accountTier !== 'elite') return null;
if (analyzedTier == null) {
  return <Card>{/* neutral fresh-analysis affordance */}</Card>;
}
if (analyzedTier !== 'free') return null;

const cost = getCostForFeature(featureCosts, 'resume_analysis', userTier);
if (cost === null) return null;
```

**Semantic component composition** (lines 62-95):

```tsx
<Card className="p-5 mb-6 bg-card border-border">
  <div className="flex items-start gap-3">
    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
      <Sparkles className="h-4 w-4 text-primary" />
    </div>
    <div className="flex-1">
      <MeritCostPreview featureCost={cost} />
      <Button
        variant="default"
        disabled={isStarting}
        onClick={() => startEliteRerun(sourceResume)}
      >
        <Sparkles className="h-4 w-4 mr-2" />
      </Button>
    </div>
  </div>
</Card>
```

Keep the guards and composition, but apply the locked unlock copy. Add
`aria-busy`, `aria-hidden` on decorative icons, a full-width mobile/auto-width
desktop 44px action, background-running disabled status, and one inline
`role="alert"` recovery state. On terminal failure, focus the recovery heading.
Do not combine that state with a toast.

---

### `src/pages/Results.tsx` (component, streaming/CRUD reconciliation)

**Analog:** current authoritative merge and placement.

**Authoritative same-row reconciliation** (lines 308-328):

```typescript
if (streamState.stage === 'complete' && streamState.result && !streamCompletedRef.current) {
  streamCompletedRef.current = true;
  setResume((prev: any) => ({
    ...prev,
    overall_score: streamState.result.overallScore,
    grading_data: streamState.result,
  }));
  sessionStorage.removeItem(`stream_params_${id}`);

  (async () => {
    if (!id) return;
    const read = await supabase
      .from('resumes')
      .select('analyzed_tier')
      .eq('id', id)
      .maybeSingle();
    if (cancelled) return;
    setResume((prev: any) => applyAuthoritativeTier(prev, read));
  })();
}
```

For unlock completion, reread the authoritative `grading_data`,
`overall_score`, and `analyzed_tier` for the same row instead of trusting a
client merge. Keep the URL unchanged. Announce success through one live region
or one toast, not both.

**Tier reveal and CTA location** (lines 716-717, 1291-1297):

```typescript
const analyzedTier = resume?.analyzed_tier;
const showFullResults = analyzedTier ? analyzedTier !== 'free' : userTier !== 'free';
```

```tsx
{/* after Strengths, before Priority Improvements */}
{resume?.id && (
  <EliteRerunCta sourceResume={resume} userTier={userTier} />
)}
```

Keep this placement and renderer. Use `UniversalAnalyzing` with title
`Unlocking Elite insights`, unlock-specific lifecycle copy, same background
continuation behavior, and no success modal.

---

### `src/lib/analysis-stage-copy.ts` (utility, transform)

**Analog:** current lifecycle table and resolver, lines 41-55 and 77-89.

```typescript
export const LIFECYCLE_STAGE_COPY = Object.freeze({
  created: stage('Starting your analysis'),
  validating_inputs: (subject) => stage(`Checking your ${subject}`),
  reserving_merits: stage('Reserving your credits'),
  extracting_data: (subject) => stage(`Reading your ${subject}`),
  generating: stage('Analyzing with AI'),
  validating_output: stage('Checking the results'),
  saving: stage('Saving your analysis'),
  completed: stage('Analysis complete'),
  retryable_failed: terminalError(),
  failed: terminalError(),
  refunded: terminalError(),
});

export function resolveStageCopy(source: StageCopySource): string | null {
  if (source.lifecycleState) {
    const entry = LIFECYCLE_STAGE_COPY[source.lifecycleState];
    const resolved = typeof entry === 'function'
      ? entry(ANALYSIS_SUBJECTS[source.feature ?? 'Resume Analysis'])
      : entry;
    return resolved.copy;
  }
  return WAITING_SURFACE_COPY.fallback;
}
```

Add an unlock mode/feature override that maps lifecycle truth to exactly:
`Checking this analysis`, `Reserving your credits`,
`Generating missing Elite insights`, `Checking the new insights`, and
`Saving your Elite analysis`. Keep terminal states off the progress surface and
preserve shared 45/120-second copy.

---

## Test Pattern Assignments

### Pure Deno helper test

**Target:** `supabase/functions/_shared/resume-elite-unlock.test.ts`  
**Analog:** `supabase/functions/_shared/result-merger.test.ts`

**Fixture and assertion style** (lines 1-16):

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseAndValidateCall,
  mergeAndValidateResults,
  applyTierShape,
} from "./result-merger.ts";

function makeCriterion(id: string, label: string, weight: number, score: number) {
  const feedback = {
    observation: `Observed issue in ${id}`,
    impact: `Impact for ${id}`,
    fix: `Fix for ${id}`,
  };
  return { id, label, weight, score, feedback };
}
```

**Allowlist rejection pattern** (lines 209-217):

```typescript
Deno.test("unknown fields stripped", () => {
  const parsed = JSON.parse(makeValidCriteria1());
  parsed.hallucinated_field = 'this should be removed';
  const result = parseAndValidateCall('criteria-1', JSON.stringify(parsed), false);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.hallucinated_field, undefined);
  }
});
```

For unlock, rejection is safer than silent stripping when a patch tries to
assign score, summary, strengths, existing entries, criterion identity, or
existing feedback. Deep-freeze the base, snapshot every Free-owned path, assert
deep equality after merge, assert original arrays are unchanged prefixes, and
cover complete/no-op, partial, idempotent second merge, and malformed patch
cases.

### Analyze-resume contract test

**Target:** `supabase/functions/analyze-resume/__tests__/incremental-elite-unlock.test.ts`  
**Analog:** analyze-resume source-read/handler contract tests.

Use deterministic dependency seams or source-read assertions consistent with
the existing inline `serve` architecture. Cover owner/tier/base linkage,
filename exclusion, stable hash/fingerprint checks, stored-text use, conditional
call selection, exact telemetry call names/counts, completed replay with zero
model calls, refund-before-save behavior, and conflict/no-write behavior.

### Remote persistence test

**Target:** `supabase/functions/analyze-resume/__tests__/history-persistence.test.ts`  
**Analog:** same file, lines 13-31.

```typescript
Deno.test("TEST-05 resume: successful staging run writes resumes, analysis_results, and linked usage", async () => {
  if (skipRemote("resume success")) return;
  const { userId, jwt, resumeId } = await remoteTestFixture();
  const sinceIso = new Date().toISOString();

  const result = await invokeFunction("analyze-resume", jwt, {
    resumeId,
    resumeText: "...synthetic...",
    stream: false,
  });

  assertFunctionSucceeded(result, "analyze-resume");
  const usage = await latestLinkedUsage({ userId, actionType: "resume_analysis", sinceIso });
  const analysis = await assertAnalysisResult({
    analysisId: usage.analysis_id,
    analysisType: "resume_analysis",
  });
  assertEquals(analysis.source_reference, resumeId);
});
```

Seed a synthetic Free result/mirror, switch the fixture profile to Elite, call
unlock, and assert: same resume ID, original Free mirror unchanged, Free-owned
paths deep-equal, one merged mirror, one linked usage, and an already-complete
replay creates neither a second mirror nor usage row. Keep the existing
preview-only hard gate.

### Queue contract tests

**Targets:**

- `supabase/functions/submit-resume-analysis-job/job-contract.test.ts`
- `supabase/functions/process-resume-analysis-job/__tests__/refund-on-failure.test.ts`

Follow the current source-read pattern:

```typescript
const src = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
);

Deno.test("submit-resume: identity is the authenticated userId", () => {
  assert(src.includes("authenticatedUserCtx.userId"));
  assert(src.includes("user_id: authenticatedUserId"));
});
```

Add assertions that mode/base IDs are validated and forwarded, unlock does not
require/forward replacement text, authenticated identity owns the job, and the
worker preserves the payload without trusting its tier.

### Frontend hook and Results tests

**Targets:**

- `src/hooks/__tests__/useEliteRerun.test.ts`
- `src/pages/__tests__/Results.tier-reconciliation.test.tsx`
- `src/pages/__tests__/Results.stream-tier-carry.test.tsx`
- `src/lib/__tests__/analysis-stage-copy.test.ts`

**CTA test composition pattern** (`Results.tier-reconciliation.test.tsx`,
lines 16-33):

```tsx
vi.mock('@/hooks/useFeatureCosts', () => ({
  useFeatureCosts: () => ({
    data: [{ feature: 'resume_analysis', tier: 'elite', cost: mockCost }],
  }),
  getCostForFeature: () => mockCost,
}));

function renderCta(analyzed_tier: 'free' | 'elite' | null, userTier: string) {
  return render(
    <MemoryRouter>
      <EliteRerunCta sourceResume={{ id: 'r1', analyzed_tier } as any} userTier={userTier} />
    </MemoryRouter>,
  );
}
```

**Authoritative merge pattern** (`Results.stream-tier-carry.test.tsx`, lines
41-64):

```typescript
it('the stale null is replaced and every other field is preserved', () => {
  const grading = { overallScore: 88 };
  const prev = { id: 'r1', analyzed_tier: null, grading_data: grading };
  const next = applyAuthoritativeTier(
    prev,
    { data: { analyzed_tier: 'elite' }, error: null },
  );

  expect(next.analyzed_tier).toBe('elite');
  expect(next.id).toBe('r1');
  expect(next.grading_data).toBe(grading);
});
```

Replace clone assertions with: zero resume inserts, same resume ID, unlock mode,
base ID/nonce, one start on rapid clicks, same-route navigation, lease cleanup,
and stored-text-missing recovery. Extend CTA tests for locked copy, pricing
undefined/null, `aria-busy`, background status, one inline alert, conflict
actions, full-width mobile classes, and no hardcoded colors. Extend Results
tests for authoritative same-row blob/tier reload, card removal, paid reveal,
and no CTA on completed replay. Pin every unlock stage string in the stage-copy
test.

## Shared Patterns

### Authentication and Authorization

**Source:** `supabase/functions/analyze-resume/index.ts` lines 1324-1354  
**Apply to:** analyze handler, unlock RPC inputs, queue submit/worker

- JWT identity is authoritative on browser calls.
- Internal worker authentication is authoritative on queue calls, but current
  tier is re-read from the database.
- Every service-role resume/mirror lookup includes authenticated `user_id`.
- Verify `analysis_results.source_reference = resumes.id`.
- Filename and client-provided analysis/tier/text never prove eligibility.

### Idempotency and Concurrency

**Sources:**

- `supabase/functions/analyze-resume/index.ts` lines 1004-1031
- `supabase/migrations/20260702000001_analysis_lifecycle_ledger.sql` lines 181-279

Use one deterministic key across frontend replay, queue, lifecycle, merit
gateway, and persistence. An advisory lock serializes same-key callers; a
compare-and-swap predicate prevents overwriting a newer base. A completed replay
returns the stored result. An active replay attaches to the run and does not
start another model call.

### Error and Refund Boundaries

**Source:** `supabase/functions/analyze-resume/index.ts` lines 1200-1258

- Validation/generation/conflict failure: no database mutation; refund according
  to lifecycle state.
- Atomic RPC failure: Free row and mirror remain unchanged; retryable failure.
- After atomic durable success: mark completed/settled; never refund.
- UI shows one approved inline recovery surface and never raw server text.
- Identity/content mismatch routes to fresh full analysis, not retry unlock.

### Telemetry and Privacy

**Source:** `supabase/functions/_shared/ai-telemetry.ts` lines 36-57, 95-113

```typescript
export type AiCallTelemetryRow = {
  feature: string;
  tier: string;
  call_name: string;
  attempt: number;
  req_id: string | null;
  user_id: string | null;
  model: string;
  max_tokens: number;
  input_tokens: number | null;
  output_tokens: number | null;
  ok: boolean;
  http_status: number | null;
  duration_ms: number;
};

export async function recordAiCall(row: AiCallTelemetryRow): Promise<void> {
  try {
    const c = await client();
    if (!c) return;
    await c.from('ai_call_telemetry').insert(row);
  } catch (e) {
    log.warn('telemetry-threw', { msg: (e as Error)?.message });
  }
}
```

Use distinct incremental call names and actual token counts. Log IDs, missing
section names, state, counts, and status only. Never log stored text, prompt,
patch content, or merged analysis content. Telemetry failure remains
non-blocking.

### UI Composition and Accessibility

**Sources:**

- `src/components/EliteRerunCta.tsx` lines 62-95
- `src/components/UniversalAnalyzing.tsx` lines 16-34, 190-273
- `src/pages/Results.tsx` lines 1291-1297

Use semantic `Card`, `Button`, `primary`, `secondary`, `destructive`, `border`,
and `muted-foreground` tokens only. Keep CTA after Strengths and before Priority
Improvements. Preserve the existing modal's live region, focus trap,
reduced-motion spinner, and background continuation. Add no dialog or renderer.

## No Analog Found

No target is without a usable role-level analog. The new delta helper and atomic
unlock RPC have no exact feature twin, but `result-merger.ts` and the lifecycle
ledger provide the repository-standard allowlist/validation and
advisory-lock/CAS patterns. `04-RESEARCH.md` remains authoritative where those
analogs intentionally differ (immutable merge and all-or-nothing persistence).

## Planner Warnings

1. Do not reuse `completeAndRecordSuccess` for unlock: it performs separate
   writes and cannot satisfy the required atomicity.
2. Do not reuse `mergeAndValidateResults` for unlock: it assembles a full result
   and can replace Free-owned fields.
3. Do not retain the current resume clone in `useEliteRerun`.
4. Do not accept unlock `resumeText`, tier, owner, or grading data as
   authoritative client input.
5. Do not skip queue propagation; `submit-resume-analysis-job` and
   `process-resume-analysis-job` remain reachable.
6. Do not touch production during migration validation. Preview must pass first;
   production requires the exact operator signal `apply production`.
7. Do not commit `.planning/` artifacts.

## Metadata

**Analog search scope:** `src/`, `supabase/functions/`, `supabase/migrations/`  
**TypeScript/TSX/SQL files inventoried:** 845  
**Strong analog families read:** 5  
**Pattern extraction date:** 2026-07-30

# Phase 02: AI Token & Cost Optimization - Pattern Map

**Mapped:** 2026-07-28
**Mode:** Gap closure
**Requirement:** TOK-08
**Files analyzed:** 6 likely new/modified files
**Analogs found:** 6 / 6

## Gap Boundary

The unresolved production finding is narrow and measurable:

- Recruiting Lens Elite `rl-call-3` emitted `10,909 / 12,000` output tokens, leaving
  `9.09%` headroom on a 3,715-character JD
  (`02-VERIFICATION.md:210,320-329`).
- The pass floor remains **15%**, so a 12,000-token call must stay below **10,200**
  output tokens. The prompt target should be meaningfully lower than 10,200 because a
  target is the content ask, not the failure boundary.
- The correction must bound/reduce `rl-call-3` generation demand. Raising
  `ABSOLUTE_MAX_TOKENS = 12000`, raising the Recruiting Lens 36,000 tier ceiling,
  or lowering the SQL/verification 15% watch threshold is forbidden.
- Keep the Phase 01.1 production input contract intact: Recruiting Lens still accepts
  JDs through 6,000 characters. Reduce output verbosity, not input capacity.
- The seven-day real-traffic soak must not start until the affected production rerun
  passes.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/functions/_shared/recruiting-lens-prompts.ts` | utility | transform | `supabase/functions/analyze-career/index.ts:1980-2003` | exact |
| `supabase/functions/_shared/recruiting-lens-prompts.test.ts` (new) | test | transform | `supabase/functions/_shared/__tests__/interview-prep-prompts.contract.test.ts:55-112` | exact |
| `supabase/functions/recruiting-lens/index.ts` | config / route | request-response | same file, `:51-63` and `:329-355` | exact |
| `supabase/functions/recruiting-lens/schema.ts` | model | transform | `supabase/functions/_shared/types/interviewPrep.ts:47-68` | role-match |
| `supabase/functions/recruiting-lens/schema.test.ts` | test | transform | same file, `:62-136` | exact |
| `.planning/phases/02-ai-token-cost-optimization/02-VERIFICATION.md` | config / evidence | batch | existing `02-VERIFICATION.md:232-343` | exact |

The schema pair is defense-in-depth. Prompt reduction and the cache-variant bump are
mandatory. Schema bounds are strongly recommended because the phase audit explicitly
identified missing `.max()` constraints, but schema rejection alone does not reduce
tokens already generated and therefore cannot close TOK-08 by itself.

## Pattern Assignments

### `supabase/functions/_shared/recruiting-lens-prompts.ts`

**Role / flow:** utility, transform

**Primary analog:** `supabase/functions/analyze-career/index.ts:1980-2003`

**Imports pattern:** no new import is needed. Keep this module as a deterministic prompt
builder with the existing local `tier-prompts.ts` registration import
(`recruiting-lens-prompts.ts:19`).

**Current gap surface** (`recruiting-lens-prompts.ts:186-239`):

```typescript
function buildCall3Suffix(tier: 'pro' | 'elite'): string {
  const isElite = tier === 'elite';
  // ...
  "resumeEdits": [
    {
      "original": "exact quote of the original bullet ...",
      "rewritten": "improved bullet passing all 5 quality gates above",
      // ...
    }
  ],
  "linkedinImprovements": [
    {
      "area": "headline|summary|experience|skills|recommendations|other",
      "suggestion": "specific change to make on LinkedIn — reference the JD"
    }
  ],
  // ...
  The resumeEdits array must contain ${isElite ? '8' : '6-8'} items.
  The keywords.missing array should contain 5-10 items.
  The quickFixes array should contain 3-5 items.
}
```

`resumeEdits` count, `keywords.missing`, and `quickFixes` have count guidance, but
`linkedinImprovements` and `keywords.matched` have no maximum. The high-volume
`original`, `rewritten`, `suggestion`, keyword, and quick-fix strings also have no
length ceiling, and the call has no total token target.

**Core output-budget pattern to copy** (`analyze-career/index.ts:1980-2003`):

```typescript
const brevityBlock = isElite
  ? `BREVITY CRITICAL — keep the ENTIRE response under 2200 tokens. These counts are HARD LIMITS, not suggestions — exceeding them truncates the response and the user gets nothing:
- careerDNA: 4 sentences (≤90 words total) | whatYouHave: 3 items
- careerFields: EXACTLY 3 | surpriseFits: EXACTLY 2-3 | roles: EXACTLY 3
- Per-item sub-array HARD LIMITS: whyMatchDetails ≤3 items | requiredSkills ≤5 items
- String brevity: whyMatch/whySurprising ≤200 chars each; each nested entry ≤120 chars.
- Do NOT emit ...`
  : `BREVITY CRITICAL — keep the ENTIRE response under ${brevityTargetTokens} tokens:
...`;
```

Apply the same four-part structure inside `buildCall3Suffix`:

1. A **fixed, content-sized per-call token target**, strictly below the 10,200-token
   15% boundary. Do not derive the target as a percentage of the 12,000 cap; the Career
   regression comments at `analyze-career/index.ts:1946-1958` explain why that makes the
   model pad toward the guardrail.
2. Hard top-level maxima for every `rl-call-3` array, including the currently missing
   `linkedinImprovements` and `keywords.matched` bounds. Preserve the existing product
   contract (Elite still receives eight resume edits; Pro keeps its restricted subset).
3. Hard character/word bounds for the large nested strings:
   `resumeEdits.original`, `resumeEdits.rewritten`,
   `linkedinImprovements.suggestion`, keyword entries, and quick-fix entries.
4. An explicit statement that counts and lengths are hard limits, not suggestions.

Keep the existing tier restrictions at `:200-202` and call ownership at
`recruiting-lens-merger.ts:97-101`. Do not move fields between calls or rewrite the
shared prefix; that would broaden the fix and reduce prompt-cache stability.

**Error handling / validation pattern:** prompt construction stays pure and cannot
throw for Pro/Elite. Production proof, not an app-side fallback, determines whether
the model honors the new bounds.

---

### `supabase/functions/_shared/recruiting-lens-prompts.test.ts` (new)

**Role / flow:** test, transform

**Analog:** `supabase/functions/_shared/__tests__/interview-prep-prompts.contract.test.ts`

**Imports pattern** (`interview-prep-prompts.contract.test.ts:16-24`):

```typescript
import {
  assertMatch,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

import {
  INTERVIEW_PREP_VARIANTS,
  type InterviewPrepPromptParams,
} from "../interview-prep-prompts.ts";
```

For Recruiting Lens, import `buildRecruitingLensSystemBlock` and construct both Pro
and Elite `rl-call-3` suffixes from the returned second block.

**Core contract-test pattern** (`interview-prep-prompts.contract.test.ts:55-112`):

```typescript
Deno.test("elite variant duration=30 → exactly 5 questions + mode='quiz'", () => {
  const out = INTERVIEW_PREP_VARIANTS.elite(
    baseParams({ duration: 30, variant: "elite" }),
  );
  assertStringIncludes(out, "exactly 5 questions");
  assertStringIncludes(out, 'mode: "quiz"');
});
```

The new test should fail closed on prompt drift:

- Elite `rl-call-3` contains the fixed total-token target.
- Both tiers contain hard limits for every emitted array and all high-volume strings.
- Elite still asks for exactly eight resume edits.
- Pro still omits `linkedinImprovements`, `keywords`, and `quickFixes`.
- The hard-limit values asserted here match any schema maxima exactly.
- The suffix does not introduce a request to raise `maxTokens` or emit extra fields.

`grade-linkedin/prompts.test.ts:43-68` is the secondary analog for iterating a
constant list of required and forbidden prompt phrases.

---

### `supabase/functions/recruiting-lens/index.ts`

**Role / flow:** config / route, request-response

**Analog:** the file's existing cache-version and cache-key pattern.

**Cap invariant to preserve** (`index.ts:53-77`):

```typescript
const CALL_CONFIGS = [
  { callType: 'rl-call-1', maxTokensPro: 12000, maxTokensElite: 12000 },
  { callType: 'rl-call-2', maxTokensPro: 12000, maxTokensElite: 12000 },
  { callType: 'rl-call-3', maxTokensPro: 12000, maxTokensElite: 12000 },
];

const RECRUITING_LENS_CACHE_VARIANT = 'recruiting-lens:v37-06';
```

Leave every `CALL_CONFIGS` value at 12,000. Update the nearby historical comment so
it records the new prompt-bounding remediation rather than calling it deferred.

**Cache invalidation pattern** (`index.ts:51-63,329-355`):

```typescript
const RECRUITING_LENS_CACHE_VARIANT = 'recruiting-lens:v37-06';

return await computeCacheKey({
  user_id: params.userId,
  feature: 'recruiting_lens',
  tier: params.tier,
  variant: RECRUITING_LENS_CACHE_VARIANT,
  inputs: {
    resumeSummary_hash: resumeHash,
    jobDescription_hash: jdHash,
    linkedinText_hash: linkedinHash,
    company: params.company,
    role_title: params.roleTitle,
  },
});
```

Bump the variant once with the prompt contract. It is used by both the persisted cache
row (`:311-322`) and the cache fingerprint (`:329-355`). Without the bump, a rerun can
return a telemetry-free pre-fix cache hit and cannot prove TOK-08.

**Auth / telemetry / error pattern to preserve** (`index.ts:391-476`):

```typescript
const resp = await invokeAnthropicText({
  model,
  system: buildRecruitingLensSystemBlock(callType, promptParams),
  messages: [{ role: 'user', content: userPrompt }],
  maxTokens,
  // ...
  telemetry: {
    feature: 'recruiting_lens',
    tier,
    callName: callType,
    reqId,
    userId,
    attempt,
  },
});
```

Do not change auth, retries, deadlines, telemetry labels, or invoke flow. Attempt 1
remains the only row that counts for headroom. The observed 87,688 ms call was below
the 165-second deadline, so timeout widening is not part of this fix.

---

### `supabase/functions/recruiting-lens/schema.ts`

**Role / flow:** model, transform

**Analog:** `supabase/functions/_shared/types/interviewPrep.ts:47-68`

**Bounded schema pattern:**

```typescript
focus_areas: z.array(z.object({
  title: z.string().min(4).max(100),
  why: z.string().min(20).max(400),
  what_to_do: z.string().min(20).max(400),
})).min(2).max(5),
quick_tips: z.array(z.string().min(10).max(240)).min(3).max(6),
strengths_and_watchouts: z.object({
  strengths: z.array(z.string().min(10).max(300)).min(2).max(5),
  watch_outs: z.array(z.string().min(10).max(300)).min(2).max(5),
}),
```

Replace only the permissive `rl-call-3` shapes at
`recruiting-lens/schema.ts:66-77` with typed nested objects and matching `.max()`
constraints. Preserve:

- root and nested `.passthrough()` behavior;
- Pro-stripped fields as `.optional()`;
- the existing hard-required cross-tier fields;
- validation as rejection, never mutation/truncation.

Update the module comment at `:8-26` to explain that output outside the newly locked
generation contract is genuinely malformed. Do not use `transform`, `slice`, or a
post-generation truncation helper: silently chopping model output can break JSON meaning
and does nothing to reduce Anthropic tokens.

Schema bounds are a guardrail only. The prompt must carry the same limits so generation
demand actually falls.

---

### `supabase/functions/recruiting-lens/schema.test.ts`

**Role / flow:** test, transform

**Analog:** the file's existing accept/reject and real-Pro-shaper tests.

**Core pattern** (`schema.test.ts:62-136`):

```typescript
Deno.test("schema: accepts a fully-merged Elite output (ok)", () => {
  const result = recruitingLensOutputSchema.safeParse(makeFullEliteOutput());
  assertEquals(result.success, true);
});

Deno.test("schema: accepts the Pro tier-shaped subset produced by applyRecruitingLensTierShape (ok)", () => {
  const proShaped = makeFullEliteOutput();
  applyRecruitingLensTierShape(proShaped, "pro");
  const result = recruitingLensOutputSchema.safeParse(proShaped);
  assertEquals(result.success, true);
});

Deno.test("schema: rejects an out-of-range overallMatch.score", () => {
  const bad = makeFullEliteOutput() as unknown as Record<string, unknown>;
  (bad.overallMatch as Record<string, unknown>).score = 150;
  assertEquals(recruitingLensOutputSchema.safeParse(bad).success, false);
});
```

Extend, do not replace, the byte-preservation coverage:

- boundary-sized Elite `rl-call-3` arrays/strings pass unchanged;
- one-over-limit `resumeEdits`, `linkedinImprovements`, keyword arrays, and
  `quickFixes` fail;
- one-over-limit `original`, `rewritten`, `suggestion`, keyword, and quick-fix
  strings fail;
- the real Pro-shaped subset still passes;
- extra merger metadata still passes through unchanged.

---

### `.planning/phases/02-ai-token-cost-optimization/02-VERIFICATION.md`

**Role / flow:** config/evidence, batch

**Analog:** its existing hard rerun and soak contract (`:232-343`).

This is an **operator evidence surface**, not an implementation surface.

**Affected production rerun pattern** (`02-VERIFICATION.md:232-253`):

```markdown
- Every new row must show the approved `max_tokens` value.
- Every first-attempt successful row must have `output_tokens < max_tokens`.
- There must be zero `stop_reason = 'max_tokens'` and zero `truncated = true`.
- Attempt-2 rows never substitute for a failing first attempt.
- A zero-row request is a cache hit and must be repeated with a different input.
- A row below 15% headroom is a near-cap finding.
```

The gap plan should add an affected Recruiting Lens rerun after the prompt/cache deploy:

- operator uses a dense production JD near the existing 6,000-character ceiling;
- new non-null `req_id`, attempt 1, `max_tokens = 12000`;
- `rl-call-3 output_tokens < 10200`, `headroom_pct >= 15`;
- `stop_reason = 'end_turn'`, `truncated = false`, no 422/408;
- durable user-visible result and correct single Merit debit with no refund;
- the other two Recruiting Lens calls remain successful.

Use the existing operator production deploy command and do not bypass its gate:

```powershell
.\scripts\deploy.ps1 -Env production
```

Do not pass `-SkipVerify`.

**Soak pattern** (`02-VERIFICATION.md:255-316`):

- Set `soak_started_at` only after the affected rerun passes.
- Run for at least seven complete calendar days and until at least 20 successful
  first-attempt calls cover all four features.
- Require zero truncations, zero 422 rows, and zero successful first-attempt rows
  below 15% headroom.
- Any watch row remains a finding; do not relabel or lower the threshold.

The planner should treat deploy, production rerun, and soak as explicit
`checkpoint:human` / operator tasks. Agents may prepare commands and inspect returned
evidence but must not claim those production actions ran.

## Shared Patterns

### Output Demand Is Controlled in the Prompt

**Source:** `supabase/functions/analyze-career/index.ts:1946-2003`

Apply to: `recruiting-lens-prompts.ts`.

- Size the ask from expected content, independently of the cap.
- Bound top-level counts, nested counts, and large strings.
- Keep a clear margin between the prompt target and the hard cap.
- Never treat a higher ceiling as a cost optimization; unused ceiling is not billed.

### Prompt and Runtime Schema Share One Contract

**Source:** `supabase/functions/_shared/types/interviewPrep.ts:47-68`

Apply to: prompt builder, prompt-contract test, schema, schema test.

The same count and length maxima should appear in the prompt and Zod schema, with tests
that assert boundary pass / one-over rejection. Prompt bounds reduce demand; schema
bounds expose model noncompliance.

### Prompt Changes Invalidate Cached Analyses

**Source:** `supabase/functions/recruiting-lens/index.ts:51-63,311-355`

Apply to: every Recruiting Lens prompt-shape change.

Increment `RECRUITING_LENS_CACHE_VARIANT` exactly once. Keep the same constant in both
cache persistence and fingerprint construction.

### Permanent Telemetry Watch

**Source:** `supabase/queries/ai_call_telemetry_report.sql:195-228`

Apply to: production rerun and soak evidence. Execute unchanged:

```sql
SELECT
  created_at, req_id, feature, tier, call_name,
  output_tokens, max_tokens, headroom_pct, truncated,
  stop_reason, duration_ms
FROM public.ai_call_telemetry
WHERE created_at >= now() - interval '30 days'
  AND attempt = 1
  AND ok
  AND (
        truncated IS TRUE
     OR headroom_pct < 15
      )
ORDER BY truncated DESC, headroom_pct ASC, created_at DESC;
```

For phase closeout, use `02-VERIFICATION.md`'s exact soak-start-substituted query so
pre-fix rows do not contaminate the verdict.

### Focused Verification

Run after implementation, before any operator deploy:

```powershell
deno test supabase/functions/_shared/recruiting-lens-prompts.test.ts --no-check --allow-all
deno test supabase/functions/recruiting-lens/schema.test.ts --no-check --allow-all
deno test supabase/functions/recruiting-lens/cache-saved-jobs.test.ts --no-check --allow-all
deno test supabase/functions/recruiting-lens/handler-config.test.ts --no-check --allow-all
node scripts/check-edge-boot.mjs
```

Then require `npm run verify:baseline` through the normal production deploy gate.

## Forbidden Changes

| Surface | Current invariant | Gap-closure rule |
|---|---|---|
| `supabase/functions/_shared/anthropic.ts:18` | `ABSOLUTE_MAX_TOKENS = 12000` | Do not raise or bypass |
| `supabase/functions/recruiting-lens/index.ts:58-60` | all three calls = 12,000 | Do not raise; leave caps unchanged |
| `src/config/pricing-config.ts:115` | Recruiting Lens pro/elite total = 36,000 | Do not change |
| `src/config/pricing-config.snapshot.ts:66` | locked 36,000 snapshot | Do not change |
| `src/config/__tests__/sc12-snapshot.test.ts:24` | locked tier-sum title | Do not change |
| `supabase/queries/ai_call_telemetry_report.sql:226` | `headroom_pct < 15` | Do not lower |
| Phase 01.1 document limits | Recruiting Lens JD max = 6,000 chars | Do not reduce |

## No Analog Found

None. The repo contains direct precedents for content-sized prompt bounds, prompt
contract tests, Zod count/string maxima, cache-version invalidation, and production
telemetry evidence.

## Metadata

**Analog search scope:** `supabase/functions/_shared/`,
`supabase/functions/recruiting-lens/`, `supabase/functions/analyze-career/`,
`supabase/functions/grade-linkedin/`, `supabase/queries/`, Phase 02 planning artifacts

**Relevant candidates scanned:** 24

**Strong analogs used:** 6

**Pattern extraction date:** 2026-07-28

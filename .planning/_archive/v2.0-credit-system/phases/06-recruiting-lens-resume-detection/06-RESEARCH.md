# Phase 06: Recruiting Lens — Resume Detection - Research

**Researched:** 2026-04-12
**Domain:** Frontend data-fetch bug fix (React + Supabase client)
**Confidence:** HIGH

## Summary

This phase fixes a single data-source mismatch in `src/pages/RecruitingLens.tsx`. The page currently queries `analysis_results` for `analysis_type='resume_analysis'`, but the primary `analyze-resume` edge function writes its output to `resumes.grading_data` — never to `analysis_results`. Only users who went through the `MinimalHero` onboarding path have any row in `analysis_results`, so every user who analyzed via Upload.tsx or the normal flow sees the "No resume analysis found" blocker despite having a complete analysis.

All CONTEXT.md claims (D-01 through D-11) were verified directly against the live code and migrations. The fix is a surgical replacement of the two broken queries in a single `useEffect`. The canonical "most recent analyzed resume" query pattern already exists in `src/pages/Upload.tsx:173-182` and should be copied verbatim — no new abstractions needed.

**Primary recommendation:** Replace the init `Promise.all` in `RecruitingLens.tsx:108-123` with: (1) profiles query unchanged, (2) primary resume query filtering `grading_data IS NOT NULL` ordered by `analyzed_at DESC`, (3) a conditional fallback to `analysis_results` only when primary returns null. Map both result shapes through the existing `buildResumeSummary` unchanged. No helper extraction, no edge function changes, no new tests beyond a manual smoke test of the three states.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Root Cause:**
- **D-01:** `analyze-resume` edge function writes analysis output to `resumes.grading_data` (and `resumes.overall_score`, `resumes.analyzed_at`). See `supabase/functions/analyze-resume/index.ts:671-678` and `:759-766`.
- **D-02:** `analysis_results` is only written by `src/components/MinimalHero.tsx:163-170` via `saveAnalysisResult()` in `src/lib/analysisHelpers.ts:120-150`. Onboarding/Upload flows do not populate it.
- **D-03:** Current `RecruitingLens.tsx:117-123` query filters `analysis_results` by `analysis_type='resume_analysis'` and misses everyone whose analysis went through the normal flow. This is the bug.

**Data Source:**
- **D-04:** Primary read path is `resumes` table. Query: most recent row for `user_id` where `grading_data IS NOT NULL` ordered by `analyzed_at DESC`, limit 1. Use `grading_data` as the raw analysis shape.
- **D-05:** Fallback read path for legacy MinimalHero users: if no `resumes` row has `grading_data`, query `analysis_results` where `analysis_type='resume_analysis'` ordered by `created_at DESC` limit 1, and use `raw_response`. Same shape as `grading_data` — `buildResumeSummary` works unchanged.
- **D-06:** Display filename from the matched source: `resumes.file_name` for the primary path; for fallback, look up the resume by `analysis_results.source_reference` (resume_id) if available, else fall back to the most recent `resumes.file_name`.

**Recency Rule:**
- **D-07:** "Most recently analyzed" means ORDER BY `resumes.analyzed_at DESC` (not `created_at`).

**Empty-State UX:**
- **D-08:** When neither primary nor fallback returns a result, keep the existing blocker card unchanged (`AlertCircle` + "No resume analysis found" + "Analyze My Resume" CTA → `/onboarding`).

**Summary Shape:**
- **D-09:** Keep `buildResumeSummary(rawResponse)` (RecruitingLens.tsx:41-83) as-is.

**Edge Function Enforcement:**
- **D-10:** Frontend-only gate. `recruiting-lens` edge function is NOT modified.

**Cleanup:**
- **D-11:** Replace the current `Promise.all` — keep `profiles`, replace the two broken queries with combined primary+fallback logic.

### Claude's Discretion
- Exact TS shape for the primary/fallback resolver (inline in effect vs extracted helper in `src/lib/`).
- Whether to add a `[RecruitingLens]` logger tag on the fallback branch.
- Loading skeleton stays unchanged.

### Deferred Ideas (OUT OF SCOPE)
- Edge-function-side defense-in-depth verification → Phase 09 Security Audit.
- Inline "analyze now" flow inside Recruiting Lens.
- Backfill migration from `resumes.grading_data` into `analysis_results`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RCL-01 | Recruiting Lens correctly detects and uses the user's most recently analyzed resume without prompting to analyze first | Verified: `resumes.grading_data` is the authoritative source (D-01 VERIFIED); `analysis_results` fallback covers legacy MinimalHero users (D-02 VERIFIED); `ORDER BY analyzed_at DESC` is the canonical recency rule, already used in `Upload.tsx:179` [VERIFIED: codebase grep] |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Small, reversible changes** — this is a surgical replacement, not a refactor. No new abstractions unless the helper is demonstrably reused.
- **Preserve existing TypeScript/React patterns** — match the `useEffect` + `Promise.all` + `maybeSingle()` shape already in the file.
- **Specific error messages** — if fallback fails, log `[RecruitingLens]` tagged errors per the bracket-prefix convention.
- **`apply_patch` for focused edits** — single-file change.
- **No `.planning/` commits** — research doc stays local; planner will not commit it unless `commit_docs` is enabled (it is `false`).
- **Do not touch `.gitignore`.**

## Standard Stack

No new libraries. All tools already present:

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/supabase-js | ^2.81.1 | `.from().select().eq().order().limit().maybeSingle()` query chain | Already used in `RecruitingLens.tsx`, `Upload.tsx`, `SkillsGapAnalysis.tsx` [VERIFIED: package.json, codebase] |
| React 18.3.1 | ^18.3.1 | `useEffect` + `useState` for init fetch | Existing pattern in RecruitingLens.tsx:103-135 [VERIFIED: codebase] |

**No installation required.**

## Ground Truth Verification

Each CONTEXT.md claim was verified against the live code in this research session.

### D-01: `analyze-resume` writes to `resumes.grading_data` — VERIFIED

`supabase/functions/analyze-resume/index.ts:671-678` (fallback merge path):
```typescript
const { error: updateError } = await supabase
  .from('resumes')
  .update({
    overall_score: fallbackResult.overallScore,
    grading_data: fallbackResult,
    analyzed_at: new Date().toISOString(),
  })
  .eq('id', resumeId);
```

`supabase/functions/analyze-resume/index.ts:759-766` (parallel-merge success path):
```typescript
const { error: updateError } = await supabase
  .from('resumes')
  .update({
    overall_score: analysisResult.overallScore,
    grading_data: analysisResult,
    analyzed_at: new Date().toISOString()
  })
  .eq('id', resumeId);
```

Both paths write the same three columns. Neither path writes to `analysis_results`. [VERIFIED: source]

### D-02: Only `MinimalHero` populates `analysis_results` — VERIFIED

`rg saveAnalysisResult` yielded exactly three hits:
1. `src/lib/analysisHelpers.ts:120` — definition
2. `src/components/MinimalHero.tsx:11` — import
3. `src/components/MinimalHero.tsx:163` — the sole call site

`saveAnalysisResult` inserts into `analysis_results` with `source_reference` = `resume.id`. No other code path writes to this table from the frontend. Edge functions do not write to it either (confirmed by filename search for `analysis_results` inside `supabase/functions/analyze-resume/`). [VERIFIED: grep across src/ and supabase/functions/]

### D-03: Current query is broken — VERIFIED

`src/pages/RecruitingLens.tsx:117-123` queries `analysis_results` with `analysis_type='resume_analysis'`. Combined with D-02, this means only MinimalHero users ever populate the data that drives `hasAnalyzedResume`. All Upload.tsx / normal-flow users hit the blocker card. [VERIFIED: source]

### D-04/D-07: `resumes` schema and recency column — VERIFIED

`supabase/migrations/20251129_create_all_tables.sql:18-33`:
```sql
CREATE TABLE IF NOT EXISTS resumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_path TEXT,
  file_hash TEXT,
  file_size INTEGER NOT NULL,
  overall_score INTEGER,
  grading_data JSONB,
  analyzed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ...
);
```

All four required columns exist: `user_id`, `file_name`, `grading_data`, `analyzed_at`. RLS is enabled with user-scoped policies on SELECT (`supabase/migrations/20251129_create_all_tables.sql:88, 105-128`). [VERIFIED: migration]

### D-05: `analysis_results` schema and RLS — VERIFIED

`supabase/migrations/20251222223116_8abce0df-2f95-472e-a9e5-dca9a6d69c53.sql:2-26`:
```sql
CREATE TABLE public.analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  analysis_type text NOT NULL CHECK (analysis_type IN ('resume_analysis', ...)),
  primary_score integer,
  key_insights jsonb DEFAULT '[]'::jsonb,
  raw_response jsonb,
  source_reference text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.analysis_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own analysis results"
ON public.analysis_results FOR SELECT USING (auth.uid() = user_id);
```

RLS SELECT policy is `auth.uid() = user_id`, so the authed Supabase client on the frontend is safe — the fallback query cannot cross tenants. [VERIFIED: migration]

### D-06: `source_reference` carries `resume.id` — VERIFIED

`src/components/MinimalHero.tsx:163-170`:
```typescript
await saveAnalysisResult(
  currentUser.id,
  "resume_analysis",
  data.overallScore || 0,
  keyInsights,
  data,
  resume.id,   // ← source_reference
);
```

So the fallback can do `resumes.select('file_name').eq('id', analysisResult.source_reference)` to get the filename. If `source_reference` is null (shouldn't happen per code but defensively), fall through to "most recent resumes row" or display null filename. [VERIFIED: source]

### D-09: `buildResumeSummary` shape parity — VERIFIED

`RecruitingLens.tsx:41-83` reads: `executiveSummary`, `strengths`, `industryGuess`, `suggestedTargetRoles`, `recommendedKeywords`, `criterionFeedback`, `overallScore`. Both `resumes.grading_data` (the merger output `analysisResult` in `analyze-resume/index.ts`) and `analysis_results.raw_response` (the `data` passed from MinimalHero to `saveAnalysisResult`) come from the same `analyze-resume` response body, so field names are identical. No shape divergence. [VERIFIED: source trace]

### Current Init Effect Shape (must preserve error semantics)

`RecruitingLens.tsx:103-135` exact structure:
```typescript
useEffect(() => {
  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate('/auth'); return; }

    const [profileResult, resumeResult, analysisResult] = await Promise.all([
      /* profiles.select('subscription_tier') */,
      /* resumes.select('file_name') order created_at DESC */,   // ← broken recency col
      /* analysis_results.select('raw_response') */,              // ← broken source
    ]);

    setTier(getEffectiveTier(profileResult.data?.subscription_tier || 'free'));
    setResumeFilename(resumeResult.data?.file_name || null);

    const rawResp = analysisResult.data?.raw_response;
    const hasAnalysis = !!rawResp && typeof rawResp === 'object';
    setHasAnalyzedResume(hasAnalysis);
    setResumeSummary(hasAnalysis ? buildResumeSummary(rawResp) : '');
    setLoading(false);
  };
  init();
}, []);
```

**State variables to set after the fix (preserve all):**
- `setTier(...)` — unchanged
- `setResumeFilename(...)` — now driven by matched source (primary: `resumes.file_name` direct; fallback: lookup via `source_reference`)
- `setHasAnalyzedResume(...)` — true iff primary OR fallback returned usable raw data
- `setResumeSummary(...)` — `buildResumeSummary(raw)` when hasAnalysis, empty string otherwise
- `setLoading(false)` — unchanged, always at end

### Right-Column Card (no changes)

`RecruitingLens.tsx:392-440` — branches on `hasAnalyzedResume`:
- `true` → green success card, reads `resumeFilename`, truncates at 32 chars (`:407-409`)
- `false` → blocker card with "Analyze My Resume" button → `/onboarding`

The fix does not touch this JSX. State variables are the full contract.

## Architecture Patterns

### Recommended Init Effect Structure

Keep the existing `useEffect` inline. Parallelize only what is genuinely independent (profile + primary resume); run the fallback sequentially only if primary returns null.

```typescript
// Source: adapted from Upload.tsx:173-182 (canonical "analyzed_at DESC" pattern)
useEffect(() => {
  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate('/auth'); return; }

    // Parallel: profile + primary resume (independent)
    const [profileResult, primaryResumeResult] = await Promise.all([
      supabase.from('profiles')
        .select('subscription_tier')
        .eq('id', user.id).single(),
      supabase.from('resumes')
        .select('file_name, grading_data')
        .eq('user_id', user.id)
        .not('grading_data', 'is', null)
        .order('analyzed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setTier(getEffectiveTier(profileResult.data?.subscription_tier || 'free'));

    let rawResp: Record<string, any> | null = null;
    let filename: string | null = null;

    if (primaryResumeResult.data?.grading_data) {
      rawResp = primaryResumeResult.data.grading_data as Record<string, any>;
      filename = primaryResumeResult.data.file_name ?? null;
    } else {
      // Fallback: legacy MinimalHero users
      const { data: fallbackAnalysis } = await supabase
        .from('analysis_results')
        .select('raw_response, source_reference')
        .eq('user_id', user.id)
        .eq('analysis_type', 'resume_analysis')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fallbackAnalysis?.raw_response && typeof fallbackAnalysis.raw_response === 'object') {
        rawResp = fallbackAnalysis.raw_response as Record<string, any>;
        console.log('[RecruitingLens] Using analysis_results fallback path');

        // Filename lookup via source_reference (resume_id)
        if (fallbackAnalysis.source_reference) {
          const { data: resumeRow } = await supabase
            .from('resumes')
            .select('file_name')
            .eq('id', fallbackAnalysis.source_reference)
            .eq('user_id', user.id)
            .maybeSingle();
          filename = resumeRow?.file_name ?? null;
        }
      }
    }

    const hasAnalysis = !!rawResp;
    setHasAnalyzedResume(hasAnalysis);
    setResumeFilename(filename);
    setResumeSummary(hasAnalysis ? buildResumeSummary(rawResp!) : '');
    setLoading(false);
  };
  init();
}, []);
```

Notes on the sketch above:
- **Filter `grading_data IS NOT NULL`** via `.not('grading_data', 'is', null)` — prevents a newly uploaded but not-yet-analyzed resume from "winning" the ORDER BY.
- **Order by `analyzed_at DESC`** — matches D-07 and the `Upload.tsx:179` precedent.
- **Fallback is sequential and conditional** — only runs if primary returned nothing, so the happy path is still one round trip for resume data (plus profile in parallel).
- **Filename lookup under RLS** — the fallback-filename query is also scoped `.eq('user_id', user.id)` for defense in depth, even though RLS already guarantees it.

### Anti-Patterns to Avoid

- **Running all three queries in parallel unconditionally** — wastes a round trip in the happy path (primary hit is the common case). Sequential fallback is the right tradeoff.
- **Extracting a `useResumeDetection` hook** — overkill for one call site and one effect. The CLAUDE.md guideline "Avoid adding unnecessary abstractions" applies.
- **Modifying `buildResumeSummary`** — D-09 locks this. Both shapes already work.
- **Touching `recruiting-lens` edge function** — D-10 locks this. Frontend-only fix.
- **Ordering by `created_at` instead of `analyzed_at`** — `SkillsGapAnalysis.tsx:169, 286` uses `created_at` but that's a pre-existing bug outside this phase's scope. Do not replicate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Most recent analyzed resume" query | Custom RPC or view | Direct `.from('resumes').not('grading_data','is',null).order('analyzed_at',...)` | Pattern exists verbatim in `Upload.tsx:173-182` [VERIFIED] |
| Resume raw-data shape normalization | Adapter/mapper layer | Pass through to existing `buildResumeSummary` | Shapes are already identical (D-09 verified) |
| Legacy data migration | Backfill script | Fallback read path (D-05) | Deferred per CONTEXT.md; read fallback has zero migration risk |
| RLS enforcement | Manual user_id re-checks in edge function | Rely on Supabase RLS policies (verified above) | Policies already exist and are correct |

## Runtime State Inventory

Not applicable — this is not a rename/refactor/migration phase. It is a frontend query-source bug fix. No strings are being renamed, no data is being migrated, no OS-level state is involved.

**Categories checked and cleared:**
- Stored data: None — no records are being renamed or migrated.
- Live service config: None — no external services modified.
- OS-registered state: None — no scheduled tasks or daemons.
- Secrets/env vars: None — no secret names change.
- Build artifacts: None — single `.tsx` edit, no package metadata.

## Common Pitfalls

### Pitfall 1: Selecting `grading_data` without the `IS NOT NULL` filter
**What goes wrong:** A user who uploaded a resume via `Upload.tsx` but abandoned before analysis has a `resumes` row with `grading_data = null`. Ordering that row first would make it "most recent" and silently mask an older analyzed row.
**Why it happens:** `Upload.tsx` inserts the row before the edge function writes `grading_data`.
**How to avoid:** Always include `.not('grading_data', 'is', null)` in the primary query. Matches D-07 semantics.
**Warning signs:** Success card with filename but empty/default `resumeSummary`; button enabled but edge function returns `invalid_input`.

### Pitfall 2: Forgetting `source_reference` may be null for the fallback
**What goes wrong:** TypeScript accepts `fallbackAnalysis.source_reference` as string but runtime could be null for hypothetical legacy rows. A bare `.eq('id', null)` would silently match nothing.
**How to avoid:** Guard `if (fallbackAnalysis.source_reference)` before the filename lookup; fall back to `filename = null` → card still shows "Resume analysis detected" without a filename line.

### Pitfall 3: Supabase `maybeSingle()` vs `single()` error semantics
**What goes wrong:** Using `.single()` on the fallback query throws when zero rows; `maybeSingle()` returns `{ data: null }`.
**How to avoid:** Use `.maybeSingle()` on every query in the init effect — matches existing pattern at `RecruitingLens.tsx:116, 122`.

### Pitfall 4: `tier === 'free'` gate short-circuits before resume detection
**What goes wrong:** The component renders the `ProFeatureGate` for free users regardless of whether a resume was detected, which is correct behavior but means the fix cannot be verified on free-tier accounts through the UI.
**How to avoid:** Test with a Pro or Elite admin-tier-test override via `useAdminTierTest`, or with a real Pro/Elite account.

### Pitfall 5: RLS double-check on filename lookup
**What goes wrong:** If a compromised session's `source_reference` pointed to another user's `resumes.id`, a naive `.eq('id', ...)` would still be blocked by RLS, but defense-in-depth is cheap.
**How to avoid:** Include `.eq('user_id', user.id)` on the filename lookup query as shown in the sketch above.

## Code Examples

### Canonical "most recent analyzed resume" query (from live codebase)

Source: `src/pages/Upload.tsx:173-182`
```typescript
const { data: existingResume, error: existingResumeError } = await supabase
  .from('resumes')
  .select('id, analyzed_at')
  .eq('user_id', user.id)
  .eq('file_hash', fileHash)
  .not('grading_data', 'is', null)
  .order('analyzed_at', { ascending: false })
  .limit(1)
  .maybeSingle();
```

This is the pattern to adapt: drop the `file_hash` filter, change `select` to include `file_name, grading_data`.

### `buildResumeSummary` contract (do not modify)

Source: `src/pages/RecruitingLens.tsx:41-83` — expects an object with any of:
- `executiveSummary.{keyStrengths[], keyGaps[], highImpactFix}`
- `strengths[]`
- `industryGuess`
- `suggestedTargetRoles[]`
- `recommendedKeywords[]`
- `criterionFeedback[].{label, score}`
- `overallScore`

Both `resumes.grading_data` and `analysis_results.raw_response` provide these fields (both come from the same `analyze-resume` merger output). Planner should NOT add a shape adapter.

## State of the Art

Not applicable — this phase does not introduce new libraries or patterns. It aligns Recruiting Lens with the existing canonical resume-detection pattern already in `Upload.tsx`.

**Existing divergences in the codebase (outside this phase's scope):**
- `SkillsGapAnalysis.tsx:169, 286` orders by `created_at` instead of `analyzed_at` — pre-existing drift; may warrant follow-up but not this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | (none) | — | All claims in this research were verified against live source files or migrations. No `[ASSUMED]` tags were used. |

**No user confirmation needed** — every CONTEXT.md decision was cross-checked against the codebase in this session.

## Open Questions

1. **Should the fallback branch emit a logger tag?**
   - What we know: CLAUDE.md convention is `console.log('[Component] message')`; CONTEXT.md D-11 marks logger tag as Claude's discretion.
   - What's unclear: Nothing — planner just needs to decide.
   - Recommendation: Include `console.log('[RecruitingLens] Using analysis_results fallback path')` — cheap observability, tells us how many users still need the fallback before we can ever drop it.

2. **Should the filename-via-source_reference query also filter `user_id`?**
   - What we know: RLS already enforces it.
   - Recommendation: Yes — defense-in-depth, zero cost, matches existing convention.

3. **Can we deprecate `analysis_results` fallback eventually?**
   - Out of scope for this phase. Leave observability (logger tag) so a future cleanup phase can measure usage.

## Environment Availability

Not applicable — this phase is a pure frontend code edit. No external dependencies, runtimes, tools, or services are invoked or added.

## Validation Architecture

> This section is required because `workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | **No frontend test framework exists in this repo.** Only Deno tests for edge-function shared utilities (`supabase/functions/_shared/*.test.ts`). |
| Config file | `supabase/functions/deno.json` (Deno test config) — not applicable to frontend |
| Quick run command | `npm run lint` (the only automated gate available for `.tsx` changes) |
| Full suite command | `.\scripts\run-edge-tests.ps1` — runs Deno tests; does not cover this phase |
| Frontend build gate | `npm run build` — catches TypeScript errors |

### Wave 0 Gap (CRITICAL for Nyquist)

The Nyquist validation doctrine requires automated test coverage for phase requirements, but **no frontend test harness exists in this repo**. Three options for the planner:

**Option A (recommended — matches repo reality):** Treat RCL-01 validation as **manual smoke test** + **TypeScript type gate** + **lint gate**. Document explicit manual repro steps that a human executes once, and rely on `npm run build` + `npm run lint` for automated gates. This matches how the rest of the frontend is validated in this codebase today — no other `src/pages/*.tsx` file has automated tests.

**Option B:** Introduce vitest + @testing-library/react as a Wave 0 task. High cost for a single bug fix; creates precedent obligation across the codebase. Not recommended.

**Option C:** Write a Deno-side integration test that spins up a Supabase test DB, seeds both table states, and asserts the query result shape. Over-engineered for a 20-line edit.

**Recommended:** Option A. Justify manual validation in the PLAN and keep Wave 0 minimal.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RCL-01 | Primary path hit: user with `resumes.grading_data IS NOT NULL` sees success card with filename, `hasAnalyzedResume = true`, `Analyze Match` button enabled | manual smoke | `npm run dev` + navigate `/recruiting-lens` as Pro user with analyzed resume | N/A (manual) |
| RCL-01 | Fallback path hit: legacy user with only `analysis_results` row and no `resumes.grading_data` sees success card, fallback logger fires | manual smoke | `npm run dev` + seed legacy state in staging or use DB snapshot | N/A (manual) |
| RCL-01 | Empty state: user with zero `resumes.grading_data` and zero `analysis_results` sees blocker card unchanged | manual smoke | `npm run dev` as brand-new Pro account (no analyses) | N/A (manual) |
| RCL-01 | RLS isolation: query returns only the authed user's most recent row; cannot leak across users | implicit (RLS policy) | RLS policies verified in migrations `20251129_create_all_tables.sql:105-128` and `20251222223116...sql:17-26` | ✅ (already enforced at DB) |
| RCL-01 | TypeScript contract holds | automated | `npm run build` | ✅ |
| RCL-01 | Lint clean | automated | `npm run lint` | ✅ |

### Sampling Rate

- **Per task commit:** `npm run lint` (local, fast)
- **Per wave merge:** `npm run build` + `npm run lint`
- **Phase gate:** `npm run build` + `npm run lint` green **AND** all three manual smoke states executed and documented in VALIDATION.md with screenshots or console logs before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] **None** — Option A (manual + lint + build) uses only existing infrastructure.
- [ ] **Optional (not required):** Wave 0 task to document the three manual smoke states in VALIDATION.md with clear repro steps and expected console output (including the `[RecruitingLens] Using analysis_results fallback path` log for Option B).

*Framework install: not needed.*

## Security Domain

> `security_enforcement` is absent from config, so it is treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `supabase.auth.getUser()` at effect start; redirect to `/auth` on null — unchanged [VERIFIED: RecruitingLens.tsx:105-106] |
| V3 Session Management | yes | Supabase JWT session (unchanged) |
| V4 Access Control | yes | **RLS policies on `resumes` and `analysis_results`** — both verified to enforce `auth.uid() = user_id` [VERIFIED: migrations] |
| V5 Input Validation | no | This fix reads data; input to `recruiting-lens` edge function is unchanged |
| V6 Cryptography | no | Not applicable |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant read via direct query | Information Disclosure | Supabase RLS `auth.uid() = user_id` on both tables — already in place [VERIFIED] |
| Bypassing the frontend gate to call `recruiting-lens` | Elevation of Privilege | Edge function still enforces `resumeSummary` min-length server-side per D-10 — unchanged |
| Stale `source_reference` pointing at another user's `resumes.id` | Information Disclosure | Filename lookup query adds explicit `.eq('user_id', user.id)` defense-in-depth (see Architecture Patterns sketch) |
| Log leakage of resume contents | Information Disclosure | Logger tag `[RecruitingLens] Using analysis_results fallback path` emits no PII — safe |

## Sources

### Primary (HIGH confidence — all direct source reads this session)

- `supabase/functions/analyze-resume/index.ts:660-780` — D-01 verification (grading_data write paths)
- `src/lib/analysisHelpers.ts:117-150` — saveAnalysisResult definition
- `src/components/MinimalHero.tsx:11, 163-170` — D-02 verification (sole writer of analysis_results)
- `src/pages/RecruitingLens.tsx:1-485` — full file read for D-03, D-09, state contract, JSX
- `supabase/migrations/20251129_create_all_tables.sql:18-128` — resumes schema + RLS policies
- `supabase/migrations/20251222223116_8abce0df-2f95-472e-a9e5-dca9a6d69c53.sql:1-27` — analysis_results schema + RLS policies
- `src/pages/Upload.tsx:170-188` — canonical `analyzed_at DESC` query pattern
- `src/pages/SkillsGapAnalysis.tsx:164-178, 282-295` — negative example (uses `created_at`, pre-existing drift)
- `.planning/phases/06-recruiting-lens-resume-detection/06-CONTEXT.md` — locked decisions (D-01..D-11)
- `.planning/REQUIREMENTS.md:52` — RCL-01 wording
- `.planning/ROADMAP.md:55-60` — Phase 06 scope
- `.planning/config.json` — Nyquist / code review / verifier flags

### Secondary (MEDIUM confidence)
- None needed — all verification came from primary source reads.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Root cause & data source (D-01..D-06): **HIGH** — every claim verified against source this session
- Recency rule (D-07): **HIGH** — canonical pattern exists in `Upload.tsx:179`
- Summary shape parity (D-09): **HIGH** — traced both writers to the same `analyze-resume` response object
- Validation architecture: **HIGH** for what's possible with current infra, **MEDIUM** on Option A being the right choice (it's the only cheap choice given no frontend test framework exists)
- Security (RLS): **HIGH** — migration files directly checked

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (30 days — stable, narrow bug fix with no fast-moving dependencies)

## RESEARCH COMPLETE

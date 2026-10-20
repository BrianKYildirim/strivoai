# Phase 9: Performance & Maintainability Refactoring - Pattern Map

**Mapped:** 2026-06-24
**Files analyzed:** 11 actionable surfaces (1 edge dedup site + 1 new FE helper + 8 FE call sites + 3 classes of DB migration + 1 new probe + 1 harness reuse)
**Analogs found:** 11 / 11 (every surface has an in-repo analog; no RESEARCH-only fallback needed)

> **SCOPE OVERRIDE (RESEARCH.md corrects CONTEXT.md in 3 places — honor RESEARCH):**
> 1. **H4 is `analyze-resume`-ONLY.** `_shared/recruiting-lens-merger.ts` single-parses (`parseCallResult` :130-132) — NOT a redundancy. **Leave it byte-identical.**
> 2. **H5 surface is bigger / 3-table / 2-ordering-column.** `analysisHelpers.ts:134` is a `.limit(10)` LIST query (`getAnalysisHistory`), NOT a latest-row accessor — do NOT model on it. The honest win is collapsing only the identical resume-`created_at`-`.limit(1)` subset; list queries (`.limit(N>1)`) and divergent-shape sites stay separate.
> 3. **`_shared/errors.ts` DEFERS.** The rich `const ERR = {…}` taxonomy does NOT exist at HEAD (only `const ERR = 'internal_error'` one-liners). Extracting = inventing an abstraction (D-04 OUT). One-line RESIDUAL-REGISTER note instead.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/functions/analyze-resume/index.ts` (H4 dedup at `executeParallelCalls` :399-437 + consumer :879-884) | edge service (Deno) | transform / request-response (SSE) | self (its own merge consumer) + `_shared/result-merger.ts` | exact (in-place) |
| `supabase/functions/_shared/result-merger.ts` (H4 — `parseAndValidateCall` :290-332, invoked :463/:487/:498) | shared utility (Deno) | transform (parse->validate->merge) | self | exact (in-place) |
| `src/lib/<new>.ts` (H5 shared latest-row accessor[s]) — NEW | frontend lib/utility | CRUD (read — latest-row SELECT) | `src/lib/analysisHelpers.ts` `getAnalysisHistory` (:125-145) — shape ONLY, it's a list query | role-match (NOT a latest-row template) |
| `src/pages/SkillsGapAnalysis.tsx` (:170-175, :288-293) | frontend page | CRUD (latest resume read) | `Profile.tsx:136-141` (identical shape) | exact |
| `src/pages/Profile.tsx` (:136-141) | frontend page | CRUD (latest resume read) | `SkillsGapAnalysis.tsx:170-175` | exact |
| `src/pages/CareerCompass.tsx` (:304-310 resume; :313-320 analysis_results) | frontend page | CRUD (latest resume `.single()` + latest career `.maybeSingle()`) | `Profile.tsx` (#4 column/terminal variant) | role-match (different columns/terminal) |
| `src/pages/RecruitingLens.tsx` (:359-366 `analyzed_at`; :378-385 analysis_results) | frontend page | CRUD (latest resume `analyzed_at` + fallback) | divergent (`analyzed_at`, `.not(...)`) — leave or separate helper | partial (divergent shape) |
| `src/pages/LinkedInGrader.tsx` (:280-284) | frontend page | CRUD (latest linkedin_grade) | `PriorLinkedInSelector.tsx:90-95` (same select, different limit) | role-match (different table from resume subset) |
| `src/components/PriorLinkedInSelector.tsx` (:90-95) | frontend component | CRUD (`.limit(10)` LIST) | `analysisHelpers.ts getAnalysisHistory` | role-match — **LIST, not latest-row; keep separate** |
| `src/pages/DashboardHome.tsx` (:45-51) | frontend page | CRUD (`.limit(4)` LIST) | `analysisHelpers.ts getAnalysisHistory` | role-match — **LIST, keep separate** |
| `src/components/AnalysisComparisonModal.tsx` (:263-270 resumes; :280-286 linkedin_grades) | frontend component | CRUD (`.limit(10)` LIST + `.neq`/`.not`) | `analysisHelpers.ts getAnalysisHistory` | role-match — **LIST + extra filters, keep separate** |
| `supabase/migrations/<ts>_auth_rls_initplan_*.sql` — NEW | DB migration | event-driven DDL (RLS rewrite ×62) | `20260608000008_linkedin_grades_owner_select.sql` | exact (forward+verify+rollback shape) |
| `supabase/migrations/<ts>_unindexed_fk_*.sql` — NEW | DB migration | event-driven DDL (additive CREATE INDEX ×8) | `20260608000006_rate_limit_counters_explicit_deny.sql` (idempotent-guard shape) | role-match (DDL forward+rollback) |
| `supabase/migrations/<ts>_permissive_policy_consolidation_*.sql` — NEW | DB migration | event-driven DDL (DROP superseded policy, OR-provable subset) | `20260608000008_linkedin_grades_owner_select.sql` (DROP-of-superseded, NO redundant CREATE) | exact |
| `scripts/validate-career-performance.mjs` — NEW sibling | measurement script (Node) | request-response (JSON, NOT SSE) | `scripts/validate-performance.mjs` (env/auth/CLI) + `staging-cache-perf-probe.mjs` (percentile/stats) | role-match (JSON response, not SSE) |
| `scripts/validate-performance.mjs` (reuse as-is for resume) | measurement script (Node) | request-response (SSE) | self | exact (no change — reuse) |

---

## Pattern Assignments

### `supabase/functions/analyze-resume/index.ts` + `_shared/result-merger.ts` (H4 — the double-parse, analyze-resume ONLY)

**Analog:** self. The redundancy is a cross-boundary double-parse: `executeParallelCalls` runs the full `parseAndValidateCall` at `:406` purely to decide retry, **discards the parsed `data` (keeps only `validation.ok`)**, returns RAW text; then `mergeAndValidateResults` calls `parseAndValidateCall` **again** on the identical buffer (`result-merger.ts:463/:487/:498`). Every successful call is parsed twice.

**The discard site** (`analyze-resume/index.ts:404-407` — parsed data thrown away):
```typescript
// Output-level validity: run the SAME parse/validate the merger uses (only for
// HTTP-successful calls), and keep its reason so the log names the exact failure.
const validation = result.ok ? parseAndValidateCall(result.callType, result.text, params.isElite) : null;
const outputInvalid = !!validation && !validation.ok;   // <- only .ok kept; validation.data DISCARDED
```
There is a SECOND parse in the same loop at `:430` (retry-keep decision):
```typescript
if (retried.ok && parseAndValidateCall(retried.callType, retried.text, params.isElite).ok) {
  return retried;
}
```

**The re-parse consumer** (`analyze-resume/index.ts:879-884` — RAW text re-fed to the merger):
```typescript
const rawResults = Object.fromEntries(
  parallelResults.filter((r): r is ParallelCallResult => r.ok)
    .map(r => [r.callType, r.text])               // RAW text again
) as Record<CallType, string>;
const mergeResult = mergeAndValidateResults(rawResults, resolvedTier);   // re-parses each (2nd time)
```

**The 2nd-parse site inside the merger** (`_shared/result-merger.ts:462-469`, plus optional `:487` rewrites / `:498` elite-extras):
```typescript
for (const callType of callTypes) {
  const result = parseAndValidateCall(callType, rawResults[callType], tier === 'elite'); // SAME buffer, parsed AGAIN
  if (!result.ok) {
    console.log(`[parallel] Validation failed for ${callType}: ${result.reason}`);
    return { ok: false, reason: result.reason };
  }
  parsed[callType] = result.data;
}
```

**The byte-identical contract boundary — `parseAndValidateCall` pipeline MUST stay intact** (`result-merger.ts:290-332`): repair (`repairTruncatedJSON` :298) -> `JSON.parse` :299 -> `normalizeAliases` :306 -> `stripUnknownFields` :309 -> call-type validation :312-329. The dedup must avoid calling this **twice on the same buffer**, NOT reorder or skip any of its internal steps.

**Dedup shape to copy (RESEARCH Option A — the real win):** have `executeParallelCalls` return the already-parsed validated `data` (it computes it at `:406` anyway) for the non-retried path, and add a `mergeValidated(parsed)` merger entry that **reuses the existing concatenate/spread/fold/`fillDefaults`/`applyTierShape` tail at `:471-509+` unchanged**, skipping only the per-call `parseAndValidateCall` re-parse. Touches the return type + the merit consumer (:884), the queue path (~:1017), and the free-single path. Option B (within-merge memoization) does NOT address the cross-boundary double-parse — do not use it.

**Proof (per Pitfall 1):** `npm run test:edge` (merger has unit coverage) + the deterministic measurement; watch for `_mergeSource !== 'parallel-3'` warnings and a red deno leg.

---

### `_shared/recruiting-lens-merger.ts` — DO NOT TOUCH (H4 NON-target)

**Single-parse confirmed** (`recruiting-lens-merger.ts:130-132`): `parseCallResult` runs exactly once per call (the retry loop in `recruiting-lens/index.ts:418-434` only retries on HTTP failure, never parses upstream). No double-parse, no payoff, pure risk. **Leave byte-identical.**
```typescript
function parseCallResult(text: string): Record<string, unknown> {
  const repaired = repairTruncatedJSON(text.trim());
  return JSON.parse(repaired) as Record<string, unknown>;
}
```

---

### `src/lib/<new>.ts` + H5 call sites (H5 — shared latest-row accessor over the IDENTICAL-shape subset only)

**Analog for the helper file shape (NOT the query):** `src/lib/analysisHelpers.ts:125-145` — the import, the `{ data; error? }` return contract, and the try/catch wrapper. Copy this STRUCTURE; do NOT copy its `.select('*').limit(10)` query (it's a list, not a latest-row).

**Import + return-contract pattern** (`analysisHelpers.ts:1, 125-145`):
```typescript
import { supabase } from '@/lib/supabaseClient';

export async function getAnalysisHistory(
  userId: string,
  limit = 10
): Promise<{ data: any[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('analysis_results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      return { data: [], error: error.message };
    }
    return { data: data || [] };
  } catch (err: any) {
    return { data: [], error: err.message };
  }
}
```

**The genuinely-identical subset the accessor collapses** — latest `resumes` row, `created_at` desc, `.limit(1)`:

`Profile.tsx:136-141` (columns `file_name`, array terminal):
```typescript
const { data: resumes } = await supabase
  .from("resumes")
  .select("file_name")
  .eq("user_id", user.id)
  .order("created_at", { ascending: false })
  .limit(1);
```
`SkillsGapAnalysis.tsx:170-175` (columns `grading_data`, array terminal — identical except column set):
```typescript
const { data: resumes } = await supabase
  .from('resumes')
  .select('grading_data')
  .eq('user_id', user.id)
  .order('created_at', { ascending: false })
  .limit(1);
```
`CareerCompass.tsx:304-310` (columns `file_path, file_name`, **`.single()` terminal** — needs parameterized columns + terminal):
```typescript
supabase
  .from("resumes")
  .select("file_path, file_name")
  .eq("user_id", user.id)
  .order("created_at", { ascending: false })
  .limit(1)
  .single(),
```

**Required accessor signature (parameterize, per Pitfall 2):** `getLatestResume({ userId, columns, terminal: 'array' | 'single' | 'maybeSingle', orderBy = 'created_at' })`. The accessor MUST return the EXACT columns + terminal each call site consumes — `Profile` reads `resumes[0].file_name`, `SkillsGap` reads `resumes[0].grading_data`, `CareerCompass` reads `.single()` `data.file_path/file_name`. A naive `.select('*')` merge is a functional change.

**Divergent sites — keep separate or a narrow second helper, do NOT fold into the resume-latest accessor:**
- `RecruitingLens.tsx:359-366` — **`analyzed_at`** order col + `.not('grading_data','is',null)` + `.maybeSingle()`:
  ```typescript
  supabase.from('resumes')
    .select('file_name, grading_data')
    .eq('user_id', user.id)
    .not('grading_data', 'is', null)
    .order('analyzed_at', { ascending: false })
    .limit(1)
    .maybeSingle(),
  ```
- `CareerCompass.tsx:313-320` / `RecruitingLens.tsx:378-385` — `analysis_results` table + `.eq('analysis_type', …)` filter (different table; out of the resume accessor).
- `LinkedInGrader.tsx:280-284` — `linkedin_grades` table (different table; a separate `getLatestLinkedinGrade` if consolidated at all).

**LIST queries — a DIFFERENT class, NOT latest-row, leave as-is:** `PriorLinkedInSelector.tsx:90-95` (`.limit(10)`), `DashboardHome.tsx:45-51` (`.limit(4)`), `AnalysisComparisonModal.tsx:263-270` (`.limit(10)` + `.not` + `.neq`), `:280-286` (`.limit(10)` + `.neq`).

**Method:** change ONE call site at a time; re-run `verify:baseline` + the relevant Playwright flow after each swap (Pitfall 2). Per-table accessor (2-3 narrow helpers) is cleaner than one all-tables accessor.

---

### `supabase/migrations/<ts>_*.sql` (DB perf — 3 migration classes)

**Primary analog (forward + read-only verification assertion + commented rollback, comment fidelity):** `supabase/migrations/20260608000008_linkedin_grades_owner_select.sql` (read in full).

**Header + FORWARD + VERIFICATION + ROLLBACK shape to mirror** (`20260608000008` :1-92):
```sql
-- <REQ tag> (<Plan>, <D-03 tier>): <one-line intent>. <names-not-values>.
-- Symptom (advisor: <advisor name>, <severity>): <what the advisor flags>.
-- LIVE-CATALOG FACT (re-confirmed read-only on preview AND prod, identical): <pg_policies/pg_indexes facts>
-- D-03 read-map (why zero-observable-change for every live caller): <rg evidence, FE + service callers>
-- Re-runnability (NFR-01): <idempotency mechanism>.

-- ── FORWARD ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "..." ON public.<table>;   -- idempotent

-- ── VERIFICATION (read-only assertion) ─────────────────────────────────────────
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM pg_policies WHERE schemaname='public' AND tablename='...' AND ...;
  IF v_count <> <expected> THEN
    RAISE EXCEPTION '... (found %)', v_count;
  END IF;
  RAISE NOTICE '...';
END $$;

-- ── ROLLBACK (DB-06) ──────────────────────────────────────────────────────────
-- (commented; faithfully restores the captured prior live state)
--   CREATE POLICY "..." ON public.<table> FOR SELECT TO public USING (true);
```

**Class 1 — `auth_rls_initplan` ×62 (`(select auth.uid())` wrap):** DROP+CREATE (or ALTER) each affected policy wrapping `auth.uid()` / `current_setting(...)` in a scalar subselect. Forward = wrapped form; rollback = the unwrapped form captured read-only from `pg_policies`. Enumerate via `get_advisors(type="performance")` + `SELECT … qual, with_check FROM pg_policies WHERE schemaname='public'` at plan time (counts drift only on DDL). Affected tables (names only): `profiles`, `resumes`, `linkedin_grades`, `analysis_jobs`, … (RUNTIME-RELIABILITY.md).

**Class 2 — `unindexed_foreign_keys` ×8 (additive, idempotent-guard analog `20260608000006`):**
```sql
CREATE INDEX IF NOT EXISTS idx_<table>_<fk_col> ON public.<table> (<fk_col>);
-- ── ROLLBACK (DB-06) ──
--   DROP INDEX IF EXISTS idx_<table>_<fk_col>;
```
Affected tables (names only): `applications`, `interview_quizzes`, `linkedin_versions`, `resume_score_history`, `resume_versions` (8 FK cols). Purely additive — zero behavior change. The `DO $$ … EXCEPTION WHEN duplicate_object THEN NULL` re-runnability guard pattern is in `20260608000006:26-33` if a guard is preferred over `IF NOT EXISTS`.

**Class 3 — `multiple_permissive_policies` (provable-OR subset only):** copy `20260608000008`'s **DROP-of-the-superseded-policy** approach (NO redundant CREATE — Anti-Pattern: a redundant CREATE leaves the advisor lit + can trip the DO-block). Consolidate ONLY where `merged.qual` is provably `(orig1.qual) OR (orig2.qual)` for the same roles+cmd, each behind a preview SELECT-as-role no-regression check. Affected objects (names only): `improvement_checklist`, `linkedin_grades` (already partly cleared in `20260608000008` — re-check advisor list), `resumes`, `upgrade_requests`, `user_roles`. Defer ambiguous ones to RESIDUAL-REGISTER.

**Gate (Pattern 2, proven 4× in Phase 8):** apply-preview (`supabasepreview` MCP `apply_migration`) -> verify-preview (`get_advisors` delta + SELECT-as-role) -> **operator applies prod via `db push`** -> re-verify-prod read-only (`supabase-prod-readonly`). Executor invokes NO MCP tool against prod and applies nothing to prod; the prod-apply task is `autonomous:false`. **Prod caveat:** `supabase-prod-readonly` lacks `SET ROLE` — SELECT-as-role runs on preview only; prod proven by `pg_policies`/`pg_indexes` end-state parity.

---

### `scripts/validate-career-performance.mjs` (NEW sibling — PERF-04 career probe, JSON not SSE)

**Analog A (env/auth/CLI scaffold):** `scripts/validate-performance.mjs`. **Analog B (percentile/stats helpers):** `scripts/staging-cache-perf-probe.mjs`.

**Reuse from `validate-performance.mjs` — `ENV_CONFIGS` (:45-56):**
```javascript
const ENV_CONFIGS = {
  staging:    { urlVar: 'SUPABASE_URL_STAGING',    keyVar: 'SUPABASE_ANON_KEY_STAGING',    defaultUrl: 'https://cimjltzovkahkqecpwgi.supabase.co' },
  production: { urlVar: 'SUPABASE_URL_PRODUCTION', keyVar: 'SUPABASE_ANON_KEY_PRODUCTION', defaultUrl: 'https://zjpjapgraoxdukdvpjes.supabase.co' },
};
```

**Reuse — `authenticate()` (:170-190):**
```javascript
async function authenticate(supabaseUrl, anonKey) {
  const supabase = createClient(supabaseUrl, anonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.PERF_TEST_EMAIL,
    password: process.env.PERF_TEST_PASSWORD,
  });
  if (error || !data.session) { /* exit(1) */ }
  return { accessToken: data.session.access_token, userId: data.user.id };
}
```
Plus the `--runs`/`--cooldown`/`--warmup` CLI scaffold (`parseArgs` :67-123), `loadResumes()` (:506-525) for `scripts/test-resumes/{short,medium,long}.txt`, and `sleep()` (:529-531).

**Reuse from `staging-cache-perf-probe.mjs` — `percentile`/`stats` (:150-175) for median + p95:**
```javascript
function percentile(sortedSamples, p) {
  if (sortedSamples.length === 0) return NaN;
  const rank = Math.ceil((p / 100) * sortedSamples.length);
  const idx = Math.min(Math.max(rank, 1), sortedSamples.length) - 1;
  return sortedSamples[idx];
}
function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, v) => a + v, 0) / n;
  const variance = sorted.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
  return { n, min: sorted[0], max: sorted[n-1], mean, stddev: Math.sqrt(variance),
           p50: percentile(sorted,50), p95: percentile(sorted,95), p99: percentile(sorted,99) };
}
```

**THE KEY DIFFERENCE — career returns PLAIN JSON, NOT SSE.** Replace `validate-performance.mjs`'s SSE reader (`measureRun` :246-301) with a `response.json()` read:
```javascript
// analyze-career terminal response (index.ts:1074-1077):
return new Response(JSON.stringify(analysisResult),
  { headers: { ...corsHeaders(...), 'Content-Type': 'application/json' } });
```
**Request contract** (`analyze-career/index.ts:790`): `{ resumeTextContent, userId, linkedinUrl?, resumeFilePath?, linkedinPdfContent?, compareRoles?, existingAnalysis?, allowResumeOnly? }`. `resumeTextContent` accepts text directly (:1081) — feed `scripts/test-resumes/{short,medium,long}.txt`. A cache-hit / short-circuit career run (`index.ts:952` `isProEliteShortCircuitForCache`, branch ~:958) exercises the deterministic path — the clean regression signal.

**Discretion (D-02):** sibling recommended over extending in place (SSE reader doesn't fit the JSON response; cleaner diff, lower regression surface). `validate-performance.mjs` is reused **as-is** for resume.

---

## Shared Patterns

### DB migration: forward + read-only verification + commented rollback
**Source:** `supabase/migrations/20260608000008_linkedin_grades_owner_select.sql`
**Apply to:** all 3 DB perf migration classes.
- Header documents LIVE-CATALOG FACT (re-confirmed read-only on preview AND prod), the D-03 read-map (why zero-observable for every live caller, FE + service-role callers), and NFR-01 re-runnability.
- `-- ── FORWARD ──` idempotent DDL (`IF EXISTS` / `IF NOT EXISTS` / `DO $$ … EXCEPTION WHEN duplicate_object`).
- `-- ── VERIFICATION ──` read-only `DO $$ … RAISE EXCEPTION` assertion of the expected end-state.
- `-- ── ROLLBACK (DB-06) ──` commented, faithfully restoring the captured prior live state.
- **Anti-pattern (Phase-8 gate-catch):** never re-create an owner/equivalent policy when an equivalent survivor exists — prefer DROP-of-superseded (a redundant CREATE leaves the advisor lit + trips the DO-block).

### preview->prod 4-step operator-gated migration model
**Source:** Phase 8 (`20260608000000..11_*.sql`) + CLAUDE.md MCP rules 1-8
**Apply to:** every DB migration in this phase.
apply-preview -> verify-preview (`get_advisors` delta + SELECT-as-role) -> **operator applies prod** -> re-verify-prod read-only. Prod is read-only to Claude; the prod-apply task is `autonomous:false`. SELECT-as-role on preview only (prod lacks `SET ROLE`).

### Behavior-preservation proof (replaces "git diff empty")
**Source:** `TESTING-STRATEGY.md` + `npm run verify:baseline` (vitest + offline-deno + Playwright)
**Apply to:** every code-editing plan (H4, H5).
Each plan re-runs `verify:baseline` green as its zero-functional-change evidence; H4 adds `npm run test:edge` (merger units) + deterministic measurement; H5 adds per-call-site Playwright after each swap.

### Frontend Supabase query + `{ data; error? }` contract
**Source:** `src/lib/analysisHelpers.ts:1, 125-145`
**Apply to:** the new H5 accessor(s).
`import { supabase } from '@/lib/supabaseClient'`; `try { const { data, error } = await supabase.from(...).select(...)…; if (error) return { data, error: error.message }; return { data }; } catch (err: any) { return { data, error: err.message }; }`.

### Measurement env/auth/stats reuse
**Source:** `scripts/validate-performance.mjs` (`ENV_CONFIGS` :45-56, `authenticate` :170-190, CLI :67-123) + `scripts/staging-cache-perf-probe.mjs` (`percentile`/`stats` :150-175, evidence-append :182-209)
**Apply to:** the new `validate-career-performance.mjs`.
Reuse env config, password auth, CLI scaffold, percentile math, markdown-evidence append; swap the SSE reader for `response.json()`.

### Names-not-values + pure-ASCII .ps1
**Source:** project memory + CLAUDE.md
**Apply to:** every committed doc + any touched `.ps1`.
Names-not-values in all committed docs; keep `.ps1` pure-ASCII (verify `grep -c $'\xe2'` = 0) if `deploy.ps1` is touched; stage specific files, never `-A`/`.`/`-f`.

---

## No Analog Found

None. Every actionable surface has an in-repo analog. The deliberate non-builds:

| Surface | Decision | Reason |
|---------|----------|--------|
| `_shared/errors.ts` taxonomy helper | **DEFER** (one-line RESIDUAL-REGISTER note) | The rich `const ERR = {…}` taxonomy does NOT exist at HEAD — only `const ERR = 'internal_error'` one-liners at `compare-jobs:340`, `recruiting-lens:767`, `interview-prep-analyze:718`. Extracting = inventing an abstraction (D-04 OUT). |
| `_shared/recruiting-lens-merger.ts` | **LEAVE byte-identical** | Single-parse (`parseCallResult` :130-132); no double-parse; editing is pure risk (H4 NON-target). |
| H1 cap/slice (`analyze-career`) · H2 `usage_tracking` write · H3 `useMerits` refetch | **DEFER** (measured under PERF-04, not refactored) | AI-input/cache-key adjacency (H1), gated legacy cluster (H2), post-purchase balance UX (H3). |
| `unused_index` ×41 drops | **DEFER** | Near-empty-prod `pg_stat` counts are not proof of disuse (Phase-8 D-11). |
| LIST queries (`PriorLinkedInSelector`, `DashboardHome`, `AnalysisComparisonModal`) | **Leave as-is** | `.limit(N>1)` + `.neq`/`.not` are a different class from latest-row; folding them changes behavior. |

---

## Metadata

**Analog search scope:** `supabase/functions/{analyze-resume,analyze-career,_shared}`, `supabase/migrations/` (Phase-8 `20260608000006`/`20260608000008`), `src/lib/`, `src/pages/`, `src/components/`, `scripts/`.
**Files scanned:** ~14 (2 edge merge files, 5 FE call sites verified against the 12-row map, 2 Phase-8 migration analogs, 2 measurement harnesses, 1 FE lib analog).
**Live re-pull required at plan time:** `get_advisors(type="performance")` for authoritative `auth_rls_initplan` / `multiple_permissive_policies` / `unindexed_fk` counts (drift only on DDL); re-anchor `file:line` if `staging` advances past `be39c0e3`.
**Pattern extraction date:** 2026-06-24

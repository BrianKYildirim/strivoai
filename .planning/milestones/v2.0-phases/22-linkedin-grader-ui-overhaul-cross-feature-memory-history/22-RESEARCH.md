# Phase 22: LinkedIn Grader UI Overhaul + Cross-Feature Memory/History - Research

**Researched:** 2026-04-19
**Domain:** React UI parity + Supabase Edge Function data-flow + History audit
**Confidence:** HIGH (every claim cites source line; no external libraries required)

## Summary

This phase is three loosely-coupled fixes on an already-understood code path. No new libraries, no schema changes, no new primitives. The research confirms:

1. **LinkedIn Grader UI:** All three UI defects are cosmetic/render-time. The free-tier prompt ALREADY emits `profileInsights`, `keyStrengths`, `nextBestAction` (`supabase/functions/grade-linkedin/prompts.ts:95-138`), so D-05's recommendation is: keep as-is and render as real content. No prompt change needed.
2. **Career Compass cross-feature memory (D-11/D-17):** The Pro/Elite main path (`supabase/functions/analyze-career/index.ts:586-898`) currently parses the client-uploaded resume PDF and LinkedIn PDF from storage. The existing `isFreeSingleCallPath` branch at lines 524-698 is already pulling `resumes.grading_data` + `linkedin_grades.grading_data` via `Promise.all` — lift that lookup into the Pro/Elite path BEFORE the PDF extraction steps (lines 709-742) and short-circuit to a prior-analyses prompt when both rows exist. Response-build site is line 890-893. **Note:** `scrapeLinkedInProfile` is DEFINED at line 326 but NEVER CALLED in the current code — D-11's "skip re-scrape" means skip the re-parse of the uploaded PDF, not skip a Firecrawl call.
3. **History page (D-18):** The defect is isolated and locatable. When `MERIT_SYSTEM_ENABLED=true`, all 5 feature functions route through `withMerits` which does NOT insert into `usage_tracking`. Only the legacy `checkAndRecordUsage` branch writes the row (`supabase/migrations/20260411000002_atomic_check_and_record_usage.sql:38-39`). Fix: add a `usage_tracking` INSERT to the merit branch of each function. Schema + RLS + `typeConfig` are all correct.

**Primary recommendation:** Size this as four plan files: (P1) LinkedIn Grader UI defects 1-3, (P2) Career Compass cross-feature memory (backend + badge), (P3) History merit-path usage_tracking INSERTs + timestamp-proximity ID enrichment + `?id=` hydration on 4 feature pages, (P4) D-10 "Scan New" header-bar pattern applied to Results/CareerCompass/RecruitingLens (separable, safely descoped).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**LinkedIn Grader — Locked UI coverage (Defect #2)**
- **D-01:** Render exactly 5 ready-to-paste improvements on free tier: 1 real top-priority fix (existing unlocked card) + 4 fake locked skeletons underneath. The 4 locked skeletons never trigger an Anthropic call — hardcoded placeholder cards wrapped in `BlurredLockCard`.
- **D-02:** Locked skeletons use section-labeled generic teasers matching the Pro card layout exactly (Current → Suggested grid, +X pts badge, "Why this works" line). Suggested titles: "Experience Improvement", "Skills Improvement", "About Section Refinement", "Headline Refinement #2".
- **D-03:** Placeholder teaser strings live as a hardcoded constant array at the top of `src/pages/LinkedInGrader.tsx`. No new shared file.
- **D-04:** Locked cards are clickable → `/pricing`.
- **D-05:** The Pro-only supporting sections (`profileInsights`, `keyStrengths`, `nextBestAction`) were NOT selected for locked skeletons — they should render as real content if the grade-linkedin prompt returns them on free tier. Researcher verified: **free-tier prompt DOES emit these three fields** (see §D-05 Resolution below).

**LinkedIn Grader — Layout parity (Defect #1)**
- **D-06:** Change `LinkedInGrader.tsx:386` from `pt-24` to `pt-6`. Keep `pb-12 max-w-5xl`.
- **D-07:** Responsive + theme parity verified live in browser (dev server). Compare at mobile 375px / tablet 768px / laptop 1280px in both light and dark themes.

**LinkedIn Grader — Profile Completeness ordering (Defect #3)**
- **D-08:** Reorder the Section Breakdown grid at render time inside `LinkedInGrader.tsx:829`. No backend/prompt change.
- **D-09:** If multiple sections match `name?.toLowerCase().includes('profile completeness')`, take the first; if none, render as-is.

**Cross-page polish (operator extension)**
- **D-10:** Apply "Scan New Profile" header-bar pattern to `Results.tsx`, `CareerCompass.tsx`, `RecruitingLens.tsx`. Size as its own plan file.

**Career Compass cross-feature memory**
- **D-11:** Backend auto-fetch is canonical. Extend `analyze-career`'s MAIN (fresh) request path to auto-fetch latest `linkedin_grades` row. Reference: `existingAnalysis` branch at `supabase/functions/analyze-career/index.ts:525`.
- **D-12:** Frontend does NOT pass `priorLinkedinGrading`. Single source of truth is server-side.
- **D-13:** No staleness check.
- **D-14:** Small badge on Career Compass results: "Used your LinkedIn analysis from {date}".
- **D-15:** Response body includes `reusedLinkedinGrade` (boolean) + `linkedinGradeDate` (ISO string).
- **D-16:** Graceful fallback: when resume exists but no LinkedIn grade → prompt user to choose ("Add LinkedIn now or continue without?"). When LinkedIn exists but no resume → current behavior (require resume).
- **D-17:** Token conservation is mandatory. When both prior analyses exist, skip the PDF re-parse step.

**History page audit + fix**
- **D-18:** Diagnose before redesigning. Three questions answered in §Diagnostic Resolution below.
- **D-19:** Minimal fix first. Patch missing INSERTs in offending edge functions; do NOT change the data source.
- **D-20:** Enrich for View routing. Apply timestamp-proximity (±5min) lookup to the other 4 feature tables.
- **D-21:** Clicking opens the specific past analysis per feature route.
- **D-22:** All 5 feature pages hydrate from `?id=` URL param.
- **D-23:** Empty state unchanged.

**Cross-cutting**
- **D-24:** No regression in Pro/Elite views is non-negotiable. All free-tier changes gated on `subscriptionTier === 'free'`; Pro/Elite DOM byte-identical.
- **D-25:** No migrations unless D-18 diagnosis proves a schema gap (it does not — confirmed below).

### Claude's Discretion

- Exact copy for the 4 locked ready-to-paste skeleton cards (titles, placeholder Current/Suggested text, +X pts numbers).
- Exact copy and styling of the "Used your LinkedIn analysis from {date}" badge.
- Exact ordering of the 4 locked skeletons.
- Tailwind class choice for any minor spacing tweaks during browser verification.

### Deferred Ideas (OUT OF SCOPE)

- History empty-state redesign.
- Staleness caps (30-day / 7-day) on reused LinkedIn analyses.
- Lorem-only placeholder text for locked fixes.
- Floating Scan button variant for RecruitingLens.
- Unified analysis view / schema migration.
</user_constraints>

## Phase Requirements

Phase 22 has no entries in `.planning/REQUIREMENTS.md`. ROADMAP.md §Phase 22 lines 371-379 defines seven success criteria, treated as pseudo-REQs here:

| ID | Description | Research Support |
|----|-------------|------------------|
| SC-1 | LinkedIn Grader container width/padding matches Results/CareerCompass/RecruitingLens at laptop; responsive on mobile/tablet; light + dark | §Container audit below — only `pt-24`→`pt-6` change needed on LinkedInGrader; RecruitingLens uses `pt-24 pb-16` which D-10 reconciles |
| SC-2 | Free-tier LinkedIn Grader renders the full Pro section list; 1 real top-priority fix + 4 BlurredLockCard skeletons; no Anthropic calls for the skeletons | §D-05 resolution confirms `profileInsights`/`keyStrengths`/`nextBestAction` already return on free tier; locked skeletons are pure DOM |
| SC-3 | Profile Completeness is first child in Section Breakdown DOM | `LinkedInGrader.tsx:829-926` — render-time reorder only |
| SC-4 | Career Compass hydrates from both prior analyses on fresh main-path run; no re-scrape | §Career Compass main-path map below — lift `Promise.all` block from line 524-541 into Pro/Elite path at line 586-693 |
| SC-5 | If only one prior exists, Career Compass still works (graceful fallback) | D-16; existing `missingPrior` Card pattern at `CareerCompass.tsx:575-595` |
| SC-6 | History shows all 5 feature runs with working "View" action | §Diagnostic Resolution — patch `usage_tracking` INSERTs in 4 merit-path functions (resume already writes it post-merit; others do not) |
| SC-7 | No regression in Pro/Elite | D-24 — locked-skeleton render is gated on `subscriptionTier === 'free'` only |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Locked skeleton render | Browser (React) | — | Pure DOM; no server involvement per D-01 |
| Section Breakdown reorder | Browser (React) | — | Render-time data sort per D-08 |
| Container padding fix | Browser (Tailwind) | — | Static class change per D-06 |
| Career Compass prior-analyses hydration | API (Edge Function) | Database | `analyze-career` reads from `resumes` + `linkedin_grades` per D-11 |
| Cross-feature memory badge | Browser (React) | API (response contract) | Frontend reads `reusedLinkedinGrade` flag from response body per D-14/D-15 |
| History usage log | API (Edge Function → Postgres RPC) | Database | Features INSERT into `usage_tracking`; History page SELECTs from same table |
| History timestamp-proximity ID resolution | Browser (React Query) | Database (SELECT) | Frontend cross-joins `usage_tracking` rows to feature-specific tables by `±5min` per D-20 |
| Per-feature `?id=` hydration | Browser (React) | Database (SELECT via RLS) | Each page reads its own feature table by id per D-22; RLS auto-scopes to owner |

## Standard Stack

Zero new dependencies. All work composes existing primitives.

### Core (already installed — versions from `package.json`)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3.1 | UI framework | Existing |
| react-router-dom | 6.30.1 | `useSearchParams`/`useParams` for `?id=` hydration (D-22) | Already used in `Results.tsx:3,208` |
| @tanstack/react-query | 5.83.0 | Query `linkedin_grades`/`analysis_results`/`interview_quizzes` by id | Already used in `AnalysisHistory.tsx:2,147` |
| @supabase/supabase-js | 2.81.1 | DB client for frontend hydration + edge-function writes | Already used everywhere |
| date-fns | 3.6.0 | Format `linkedinGradeDate` as `MMM d, yyyy` in the memory badge (D-14) | Already used in `AnalysisHistory.tsx:22` |
| framer-motion | 12.23.26 | Preserve existing locked-card animation cadence | Already used in `LinkedInGrader.tsx` |
| lucide-react | 0.462.0 | `Linkedin` icon for memory badge; `RefreshCw` for D-10 header bar | Already used everywhere |

### Supporting (already installed)
| Component | Path | Purpose |
|-----------|------|---------|
| `BlurredLockCard` | `src/components/BlurredLockCard.tsx` | Lock primitive for the 4 skeletons (D-02, D-04) |
| `Badge` | `src/components/ui/badge.tsx` (shadcn) | Memory badge shell (D-14) |
| `Card` | `src/components/ui/card.tsx` (shadcn) | Locked skeleton inner structure |
| `Button` | `src/components/ui/button.tsx` (shadcn) | Scan-New header-bar button (D-10) |

### Alternatives Considered

None. The phase is explicitly constrained to existing primitives (CONTEXT D-25, UI-SPEC Registry Safety).

**Installation:** No `npm install` required.

## Diagnostic Resolution (D-18)

### Question 1 — Does each feature function write `usage_tracking` on completion?

`usage_tracking` is populated exclusively via the `check_and_record_ai_usage` RPC (atomic) or the legacy `record_ai_usage` / `record_ai_action` RPCs. Both perform `INSERT INTO public.usage_tracking` (`supabase/migrations/20260411000002_atomic_check_and_record_usage.sql:38-39`; `supabase/migrations/20251222220418_...:164-165`).

All 5 features fork on `MERIT_SYSTEM_ENABLED` (`supabase/functions/_shared/merit-gateway.ts:27-28`). The merit branch uses `withMerits` which calls `check_and_deduct_merits` RPC — which does NOT insert into `usage_tracking`. **This is the root cause for every non-resume feature missing from History when merit flag is on.**

| Function | Legacy branch (`MERIT_SYSTEM_ENABLED=false`) | Merit branch (`MERIT_SYSTEM_ENABLED=true`) | Defect? |
|----------|--------------------------------------------|--------------------------------------------|---------|
| `grade-linkedin` | **Writes.** `index.ts:402` calls `checkAndRecordUsage(userId, 'linkedin_grading')`. BUT a "free-scan bypass" at `index.ts:395-399` explicitly skips it on the first scan of the billing cycle (`isFreeScan === true`). Comment: "LIG-11: free scan is ADDITIVE and bypasses the credit limit entirely. Do NOT call checkAndRecordUsage." | **Does NOT write.** Merit branch at `index.ts:214-333` never calls usage-checker; relies only on `withMerits`. | **YES** — both branches can skip writes: legacy on free-scan, merit always. |
| `analyze-career` | **Writes.** `index.ts:913` calls `checkAndRecordUsage(authenticatedUserId, 'career_compass')`. | **Does NOT write.** Merit branch at `index.ts:511-898` never calls usage-checker. | **YES** |
| `analyze-resume` | **Writes.** `index.ts:864, 978, 1060, 1134, 1261, 1350` call `record_ai_action` or `record_ai_usage` RPCs at every completion point. Note: `record_ai_action` is referenced but NOT defined in migrations — only `record_ai_usage` is (`20251222220418_...:149-167`). The `record_ai_action` calls likely silently error. This is a pre-existing bug outside Phase 22 scope but worth flagging. | **Need to verify** — this function has the most elaborate merit path; researcher did not trace every code path. Resume appears in History for the operator's test, suggesting at least one path writes. | **PARTIAL — flag for planner** |
| `recruiting-lens` | **Writes.** `index.ts:279` calls `checkAndRecordUsage(userId, 'recruiting_lens')`. | **Does NOT write.** Merit branch at `index.ts:206-276` never calls usage-checker. | **YES** |
| `interview-prep-analyze` (merit path only) | N/A — this function exists only on the merit path per header comment at `supabase/functions/interview-prep-analyze/index.ts:17-18`. No legacy fallback. | **Does NOT write.** No `checkAndRecordUsage` / `record_ai_usage` call anywhere. | **YES** |
| `interview-prep-coach` (legacy fallback) | **Writes.** `index.ts:151` calls `checkAndRecordUsage(userId, 'interview_prep')`. | N/A — this is the legacy function only. | No defect on this function. |

**Conclusion:** Four edge functions have missing `usage_tracking` INSERTs on the merit path: `grade-linkedin`, `analyze-career`, `recruiting-lens`, `interview-prep-analyze`. Additionally `grade-linkedin` has a second gap on the legacy `freeScan` bypass path.

### Question 2 — RLS / client-side filter

- RLS on `usage_tracking`: `CREATE POLICY "Users can view own usage" ... FOR SELECT TO authenticated USING (auth.uid() = user_id)` — `supabase/migrations/20260417000000_usage_tracking_user_select_policy.sql:1-6`. **OK — user can read own rows.**
- Client query: `src/pages/AnalysisHistory.tsx:169-174` — `from('usage_tracking').select('*').eq('user_id', userId!).order('created_at', { ascending: false }).limit(50)`. Scoped to `user_id`, no client-side tier filter. **OK.**
- Conclusion: **No RLS or filter hiding rows.** Defect is upstream (missing INSERTs).

### Question 3 — `action_type` value consistency

The `ai_action_type` enum (`supabase/migrations/20251222220418_...:2-9`, extended by `20260409000002_add_recruiting_lens_ai_action_type.sql:6` and `20260411000001_add_interview_prep_ai_action_type.sql:5`) contains exactly these values:

`'resume_analysis' | 'job_matching' | 'career_compass' | 'skills_gap_analysis' | 'linkedin_grading' | 'job_comparison' | 'recruiting_lens' | 'interview_prep'`

`typeConfig` keys in `AnalysisHistory.tsx:34-83` cover all 8. Feature functions use these exact strings:
- `analyze-resume` — `'resume_analysis'` (`index.ts:864,978,1060,1134,1261,1350`)
- `grade-linkedin` — `'linkedin_grading'` (`index.ts:402`)
- `analyze-career` — `'career_compass'` (`index.ts:913`)
- `recruiting-lens` — `'recruiting_lens'` (`index.ts:279`)
- `interview-prep-coach` — `'interview_prep'` (`index.ts:151`)

**All strings match. No enum/typeConfig mismatch.**

## Runtime State Inventory

This is not a rename/migration phase. Skipped — no renamed strings, IDs, or tags to trace.

## Architecture Patterns

### Pattern 1: Free-tier BlurredLockCard skeleton wrap (D-01/D-02/D-04)

**What:** Render a Card with the same inner markup as the real topFix card, wrapped in `<BlurredLockCard tier="pro">`. Content is hardcoded strings, not AI output.

**When to use:** Free-tier Ready-to-Paste Improvements slots #2–#5.

**Example** (from existing `LinkedInGrader.tsx:836-872` applied to Section Breakdown):
```tsx
// Source: src/pages/LinkedInGrader.tsx:836-872 (Section Breakdown locked skeleton — reuse pattern for topFixes)
if (isFreeUser) {
  return (
    <motion.div
      key={`locked-fix-${i}`}
      initial={{ opacity: 0, x: -15 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.4 + i * 0.1 }}
    >
      <BlurredLockCard tier="pro">
        <Card className="overflow-hidden border border-border">
          <div className="p-5">
            <div className="flex items-start justify-between mb-3">
              <h4 className="font-semibold text-base">{LOCKED_FIXES[i].title}</h4>
              <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-xs shrink-0 ml-2">
                {LOCKED_FIXES[i].pointsGain}
              </Badge>
            </div>
            <div className="grid md:grid-cols-2 gap-3 mb-3">
              <div className="p-3 bg-muted/50 rounded-lg border border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Current</p>
                <p className="text-sm text-muted-foreground italic leading-relaxed">"{LOCKED_FIXES[i].currentText}"</p>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mb-1.5">Suggested fix:</p>
                <p className="text-sm font-medium leading-relaxed">{LOCKED_FIXES[i].suggestedFix}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Why this works:</span> {LOCKED_FIXES[i].whyItWorks}
            </p>
          </div>
        </Card>
      </BlurredLockCard>
    </motion.div>
  );
}
```

Inherits all spacing (`p-5`, `p-3`, `gap-3`, `mb-3`) verbatim from the real topFix card at `LinkedInGrader.tsx:976-1019` so DOM structure is Pro/Free identical (D-24).

### Pattern 2: Render-time array reorder (D-08)

**What:** Build a new array where Profile Completeness is element 0; stable-keep others.

**Example:**
```tsx
// Source: D-08/D-09 spec
const orderedSections = useMemo(() => {
  if (!result?.sectionBreakdown) return [];
  const pc = result.sectionBreakdown.find(s => s.name?.toLowerCase().includes('profile completeness'));
  const rest = result.sectionBreakdown.filter(s => s !== pc);
  return pc ? [pc, ...rest] : result.sectionBreakdown;
}, [result?.sectionBreakdown]);
// then map over orderedSections instead of result.sectionBreakdown at line 829
```

Critical: do NOT mutate `result.sectionBreakdown` (breaks AnalysisComparisonModal at `LinkedInGrader.tsx:665`).

### Pattern 3: Prior-analyses short-circuit in analyze-career (D-11/D-17)

**What:** Before the heavyweight PDF-extraction block at `analyze-career/index.ts:709-742`, look up the user's latest `resumes.grading_data` + `linkedin_grades.grading_data`. If both present, use the Free single-call prompt (already implemented at lines 597-641) and skip extraction entirely. If only one present, fall through to normal extraction and populate the missing side from the upload.

**When to use:** Pro/Elite path at `analyze-career/index.ts:586-698`, specifically BEFORE the resume download at line 710.

**Example (sketch, planner refines):**
```ts
// Source: adapts supabase/functions/analyze-career/index.ts:524-557 (free-single-call Promise.all)
const [{ data: resumeRow }, { data: linkedinRow }] = await Promise.all([
  supabase.from('resumes')
    .select('id, grading_data, created_at')
    .eq('user_id', userContext.userId)
    .not('grading_data', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle(),
  supabase.from('linkedin_grades')
    .select('id, grading_data, overall_score, created_at')
    .eq('user_id', userContext.userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle(),
]);

const reusedLinkedinGrade = !!linkedinRow?.grading_data;
const linkedinGradeDate = linkedinRow?.created_at ?? null;
const reusedResume = !!resumeRow?.grading_data;

if (reusedLinkedinGrade && reusedResume) {
  // Use buildFreePriorAnalysesPrompt + invokeAnthropicText at getModel(resolvedTier, 'career')
  // Skip PDF download + extraction entirely (D-17)
  // Emit response with reusedLinkedinGrade/linkedinGradeDate in body (D-15)
} else {
  // Fall through to existing PDF-extraction path (lines 709-770).
  // IMPORTANT: still set reusedLinkedinGrade=false and set linkedinGradeDate=null so
  // response contract is additive and stable for the frontend (D-15).
}
```

Inject `reusedLinkedinGrade` / `linkedinGradeDate` into the response JSON at the existing build site (`analyze-career/index.ts:890-893`) regardless of which branch fired — additive field, no caller breakage per D-15.

### Pattern 4: Timestamp-proximity ID resolver (D-20)

**What:** Generalize the `findResumeForEntry` helper at `AnalysisHistory.tsx:195-205` to all 5 feature row types by passing in the candidate table's `id, created_at` rows.

**Example:**
```tsx
// Source: src/pages/AnalysisHistory.tsx:195-205, generalized
function findIdForEntry(
  entry: UsageTrackingRow,
  candidates: { id: string; created_at: string }[]
): string | null {
  if (candidates.length === 0) return null;
  const entryTime = new Date(entry.created_at).getTime();
  let best: { id: string; diff: number } | null = null;
  for (const c of candidates) {
    const diff = Math.abs(new Date(c.created_at).getTime() - entryTime);
    if (diff < 5 * 60 * 1000 && (!best || diff < best.diff)) {
      best = { id: c.id, diff };
    }
  }
  return best?.id ?? null;
}
```

Query each feature table once at component mount (same pattern as the existing `useQuery(['userResumes', userId])` at lines 182-193):
- `resumes` (already in place) for `resume_analysis`
- `linkedin_grades` for `linkedin_grading`
- `analysis_results where analysis_type='career_compass'` for `career_compass`
- `analysis_results where analysis_type='recruiting_lens'` for `recruiting_lens` — **note: Recruiting Lens only writes to `analysis_results` for Elite tier** (`recruiting-lens/index.ts:254-266, 358-378`). Free/Pro will have a `usage_tracking` row but no `analysis_results` row; planner must decide fallback (route to `/recruiting-lens` without id, or skip enrichment).
- `interview_quizzes` for `interview_prep`

### Pattern 5: `?id=` hydration on feature pages (D-22)

**What:** On mount, read `useSearchParams().get('id')`. If present, fetch the corresponding DB row by id, set as the page's result state, and skip the input UI.

**When to use:** `LinkedInGrader.tsx`, `CareerCompass.tsx`, `RecruitingLens.tsx`, `InterviewPrep.tsx`.

**Example reference:** `src/pages/Results.tsx:3, 206-236` uses `useParams` (route-param id) — Phase 22 uses `useSearchParams` (query-param id). RLS auto-scopes by owner, so each page issues a `supabase.from('<feature_table>').select('*').eq('id', id).single()` and trusts RLS to reject cross-user access.

### Anti-Patterns to Avoid

- **Client-side filter on `usage_tracking` by tier.** No — defect is missing INSERTs, not client filtering. Changing the query adds risk without fixing root cause (D-19).
- **Schema migration to add `resource_id` column to `usage_tracking`.** Defer — the ±5min proximity matcher at `AnalysisHistory.tsx:195-205` is already working for resumes; generalize it rather than denormalizing (D-25).
- **Rewriting `analyze-career` main path from scratch.** No — lift the existing `Promise.all` block; keep the fallback PDF-extraction path intact for users with no prior analyses.
- **Generating locked fix content via Anthropic on free tier.** Forbidden by D-01 — zero AI cost for the 4 skeletons.
- **Mutating `result.sectionBreakdown` in place for D-08.** Breaks AnalysisComparisonModal which consumes the raw array.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Lock overlay for the 4 skeletons | Custom blur + CTA | `BlurredLockCard` from `src/components/BlurredLockCard.tsx` | Already used for Section Breakdown locked cards at `LinkedInGrader.tsx:844`; unified behavior |
| Locked placeholder content file | New shared file `src/lib/locked-placeholders.ts` | Hardcoded constant array at top of `LinkedInGrader.tsx` | D-03 is explicit — match Phase 15.2 pattern (lines 864-866 in that file) |
| Career Compass "I have prior analyses" API | New endpoint | Backend auto-fetch inside existing `analyze-career` | D-11 — frontend remains unaware per D-12 |
| Client-side `linkedin_grades` lookup | `priorLinkedinGrading` in request body | Backend Promise.all at analyze-career entry | D-12 |
| New History query | `UNION` across 5 feature tables | Keep `usage_tracking` query, fix INSERTs upstream | D-19 — minimal fix |
| `?id=` hydration hook | Shared `useFeatureIdParam()` | Per-page inline `useSearchParams()` + query | 4 pages × 4 different tables × 4 different state shapes — no reuse payoff |

**Key insight:** Every primitive this phase needs already exists in the codebase. The work is wiring, not building.

## Container Audit (D-06 / D-07 / D-10)

Canonical target per UI-SPEC: `container mx-auto px-4 pt-6 pb-12 max-w-5xl`.

| Page | Current class | File:line | Matches? |
|------|---------------|-----------|----------|
| `Results.tsx` | `container mx-auto px-4 pt-6 pb-12 max-w-5xl` | `Results.tsx:706` | ✅ exact match (canonical) |
| `CareerCompass.tsx` (analysis view) | `container mx-auto px-4 pt-6 pb-12 max-w-5xl` (from ternary when `analysis` truthy) | `CareerCompass.tsx:572` | ✅ matches when analysis loaded |
| `CareerCompass.tsx` (input view) | `container mx-auto px-4 pt-6 pb-12 max-w-6xl` | `CareerCompass.tsx:572` | ⚠ `max-w-6xl` on input screen — out of scope for D-06, left as-is |
| `RecruitingLens.tsx` | `container mx-auto px-4 pt-24 pb-16` | `RecruitingLens.tsx:465` | ❌ `pt-24 pb-16` diverges; no `max-w-5xl` declared. D-10 scope applies; aligning `pt-24`→`pt-6` and `pb-16`→`pb-12` during D-10 is recommended but not blocking for D-06 |
| `LinkedInGrader.tsx` | `container mx-auto px-4 pt-24 pb-12 max-w-5xl` | `LinkedInGrader.tsx:386` | ❌ `pt-24` — **D-06 primary fix: change to `pt-6`** |

**Browser verification plan (D-07):**
- Viewports: mobile 375px, tablet 768px, laptop 1280px
- Pages: LinkedIn Grader (free + Pro sessions), Results.tsx, CareerCompass.tsx, RecruitingLens.tsx
- Themes: light, dark
- Acceptance: container max-width, top padding, card gutters, typographic rhythm indistinguishable between LinkedInGrader and Results.tsx at all 3 breakpoints in both themes

## D-05 Resolution — Free-tier LinkedIn prompt output

**Verified in source.** The free-tier system prompt at `supabase/functions/grade-linkedin/prompts.ts:24-144` (function `buildFreeSystemPrompt`) explicitly includes all three fields in the output schema:

- `profileInsights` — declared in schema at line 95: `"profileInsights": ["2-4 standout elements, ..."]`. Prompt instruction at lines 81-83: "Always include 2-4 profileInsights..."
- `nextBestAction` — declared at lines 96-100 with required sub-fields `action`, `reason`, `expectedImpact`.
- `keyStrengths` — declared at line 138: `"keyStrengths": ["Strength 1", "Strength 2"]`.

Additional confirmations:
- `stripLinkedInFreeTier` at `grade-linkedin/index.ts:93-108` does NOT delete any of the three fields (confirmed by `strip.test.ts:13-16`: "strip function does NOT delete profileInsights for free tier").
- Validator at `validation.ts:23-31` treats all three as required top-level fields.
- Tests at `prompts.test.ts:79-100` assert the free prompt OMITS `profileInsights` but the runtime code path actually KEEPS it — this test comment is stale (Phase 15.2 D-12 reintroduced the field).

**Recommendation: option (1) — render as real content.** No prompt change needed. No wrapping in BlurredLockCard. Token cost impact: zero delta; fields are already emitted today. Planner should spot-check in LinkedInGrader.tsx render code that these three fields actually get rendered for free-tier users; if they're currently gated off in the component, the fix is a conditional-render removal, not a prompt change.

## Analyze-Career Main Path Map (D-11 / D-17)

### `existingAnalysis` branch (reference implementation — already reads priors)
- Lines **524-541**: `Promise.all` reads `resumes` (latest row with non-null `grading_data`) + `linkedin_grades` (latest row).
- Lines **543-557**: returns 412 `missing_prior_analyses` if either is absent.
- Lines **597-641**: builds prompt via `buildFreePriorAnalysesPrompt` and calls `invokeAnthropicText` once — no PDF extraction.
- Lines **642-695**: non-blocking persistence to `analysis_results`.
- **Guard:** entire branch gated on `isFreeSingleCallPath` (`resolvedTier === 'free' && no compareRoles`).

### MAIN Pro/Elite request path (the one D-11/D-17 modifies)
- Lines **565-584**: input validation for `resumeFilePath`, `linkedinPdfContent`, `linkedinUrl`.
- Lines **586-593**: `withMerits` entry.
- Lines **704-707**: initial resume-text check (client may send `resumeTextContent` already extracted).
- Lines **709-742**: **PDF / DOCX re-parse block** — this is the work D-17 says to skip when both priors exist. Includes storage download, DOCX XML regex, AI-assisted extraction fallback, and PDF text extraction.
- Lines **744-752**: OCR fallback via `resumeOcrImages`.
- Lines **766-770**: builds `profileContent` string combining resume + LinkedIn text.
- Lines **779-797**: `executeCareerParallelCalls` — parallel AI calls.
- Lines **806-828**: fold base + elite-extras into `analysisResult`.
- Lines **831-836**: inject domain classification + tier shape strip.
- Lines **839-888**: non-blocking `analysis_results` INSERT + email.
- Lines **890-893**: **response build site** — `return new Response(JSON.stringify(analysisResult), {...})`. **This is where `reusedLinkedinGrade` + `linkedinGradeDate` must be injected** onto `analysisResult` (additive fields, no breaking change per D-15).

### `linkedin_grades` field shape
Schema from `supabase/migrations/20251126120525_...:1-10` + `20251223075804_...:1-2`:
```
id uuid | profile_url text | profile_identifier text | overall_score int | grading_data jsonb | user_id uuid | created_at timestamptz | updated_at timestamptz
```
The existing `existingAnalysis` branch consumes `grading_data` directly (line 556) — same shape is available to the main path. No divergence risk.

### `scrapeLinkedInProfile` status
Defined at `index.ts:326-354` but **never invoked** (confirmed via grep: only the definition site matches). The function is dead code. CONTEXT.md D-17 says "skip `scrapeLinkedInProfile`" — since it's already unreachable, the real skip target is the PDF re-parse block at lines 709-742, plus the parallel AI call block at lines 792-797. When both priors exist, short-circuit to `buildFreePriorAnalysesPrompt` (the existing single-call prompt) instead of running parallel calls on extracted text.

## `?id=` Hydration Audit (D-22)

| Page | Current `?id=` handling | File:line | Target table | RLS |
|------|-------------------------|-----------|--------------|-----|
| `Results.tsx` | ✅ Works — `useParams` gets route-param `id` (path is `/results/:id`), passes to DB fetch | `Results.tsx:3, 206` | `resumes` | auth.uid() = user_id |
| `LinkedInGrader.tsx` | ❌ No `useSearchParams` or `useParams` import; grep finds none | `src/pages/LinkedInGrader.tsx` (no match) | `linkedin_grades` | auth.uid() = user_id (migration `20251223075804_2c3ce05b-7a49-468b-9ef0-ca4272ced5ed.sql:10-11`) |
| `CareerCompass.tsx` | ❌ No URL param hook used | `src/pages/CareerCompass.tsx` (no match) | `analysis_results` filtered by `analysis_type='career_compass'` | auth.uid() = user_id (migration `20251222223116_...:18-20`) |
| `RecruitingLens.tsx` | ❌ No URL param hook used | `src/pages/RecruitingLens.tsx` (no match) | `analysis_results` filtered by `analysis_type='recruiting_lens'` | same RLS as CareerCompass. **Elite-only persistence** (`recruiting-lens/index.ts:254-266`) — Free/Pro runs have no row to hydrate. |
| `InterviewPrep.tsx` | ❌ No URL param hook used | `src/pages/InterviewPrep.tsx` (no match) | `interview_quizzes` | auth.uid() = user_id (migration `20260418000000_interview_prep_tables.sql:78-80`). `interview_quiz_answers` hydrates via `quiz_id IN (SELECT ... WHERE user_id = auth.uid())` (lines 82-84). |

**Planner note:** For RecruitingLens Pro tier, a history entry may not have a backing `analysis_results` row. Options:
1. Route clicks with only `?id=` when row exists; fall back to `/recruiting-lens` (no id) when it doesn't. The history card click handler can compute this using the timestamp-proximity matcher.
2. Add `analysis_results` INSERT on Pro tier (schema gap — out of scope per D-25 unless diagnosis proves no viable fallback). Recommend option 1.

## D-10 Header-Bar Pattern (reference extract)

Source: `LinkedInGrader.tsx:629-654`:

```tsx
<div className="flex items-center justify-between">
  <div className="flex items-center gap-3">
    <h2 className="text-2xl font-bold">Your LinkedIn Analysis</h2>
    {isFromCache && result.created_at && (
      <Badge variant="secondary" className="text-xs">
        {new Date(result.created_at).toLocaleDateString()}
      </Badge>
    )}
  </div>
  <Button
    variant="outline"
    onClick={() => { /* reset state */ }}
    className="gap-2"
  >
    <RefreshCw className="h-4 w-4" />
    Scan New Profile
  </Button>
</div>
```

UI-SPEC prescribes per-page labels:
- Results.tsx — `Resume Screening Report` + `Analyze New Resume`
- CareerCompass.tsx — `Your Career Compass` + `Start New Analysis`
- RecruitingLens.tsx — `Your Recruiting Lens Match` + `Run New Match`

Per-page reset handlers differ (each page has different state to clear). Minor spacing tweak on the spec: UI-SPEC uses `gap-2 mb-6` on the wrapping `div` where LinkedInGrader currently uses `gap-3` with no bottom margin — this is a discretion-level decision (planner's call per UI-SPEC Spacing section).

## Common Pitfalls

### Pitfall 1: Silent `record_ai_action` RPC failure
**What goes wrong:** `analyze-resume` calls `supabase.rpc('record_ai_action', ...)` at lines 864 and 1134, but no migration defines such an RPC — only `record_ai_usage`. The call silently errors (logged via `if (usageErr) console.error(...)` but not propagated).
**Why it happens:** Legacy refactor residue; pre-existing bug outside Phase 22 scope.
**How to avoid:** Use `record_ai_usage` (with `p_credits` arg) consistently, or call the atomic `check_and_record_ai_usage` RPC. Planner should note this in the History fix plan but not expand scope to rewrite resume analysis paths.
**Warning signs:** Resume analysis appears to work but `usage_tracking` rows are missing on some branches.

### Pitfall 2: Merit path bypasses all `usage_tracking` writes
**What goes wrong:** When `MERIT_SYSTEM_ENABLED=true`, `withMerits` deducts merits but does NOT insert a `usage_tracking` row. History queries are based on `usage_tracking`, so merit-path runs never appear.
**Why it happens:** Merit system is a new accounting surface (`user_merits` + `merit_transactions` tables); it replaced the deduction function but not the audit-log function. History was never retrofitted.
**How to avoid:** Add an explicit `record_ai_usage` call (or a direct `usage_tracking` INSERT via service client) inside every `withMerits` callback AFTER the AI call succeeds but BEFORE the response is built. Placement mirrors `analyze-resume:976-981` (the legacy insert at that line writes after the DB update, inside the merit path — the bug is that the other 4 functions never added this write to their merit paths).
**Warning signs:** Operator-reported empty History + reports that analyses completed successfully.

### Pitfall 3: `grade-linkedin` free-scan carve-out hides first scan per cycle
**What goes wrong:** Even on the legacy path, `grade-linkedin/index.ts:395-399` skips `checkAndRecordUsage` when `isFreeScan === true` (zero prior grades in billing cycle). This is intentional for credit accounting but means the user's FIRST LinkedIn scan per billing cycle never appears in History.
**Why it happens:** LIG-11 intentional carve-out: "free scan is ADDITIVE and bypasses the credit limit entirely."
**How to avoid:** Phase 22 fix should decouple usage-tracking insert from credit deduction. Even when skipping the credit decrement, write a `usage_tracking` row with `credits_consumed = 0`. The `usage_tracking` table allows arbitrary integer in `credits_consumed`; no schema change needed. History rendering uses `credits_consumed` only for the "1 credit" / "N credits" badge — a zero value will produce "0 credits" which is correct for a free scan.
**Warning signs:** LinkedIn Grader first-scan-of-cycle missing from History while subsequent scans appear.

### Pitfall 4: Mutating `result.sectionBreakdown` breaks AnalysisComparisonModal
**What goes wrong:** D-08 is tempting to implement via `result.sectionBreakdown.sort(...)` in-place. But the comparison modal consumes the raw array at `LinkedInGrader.tsx:665` (`sectionBreakdown: result.sectionBreakdown`).
**Why it happens:** Shared object reference.
**How to avoid:** Build a new array (see Pattern 2 useMemo example) and map over the new array only in the render site. Leave `result.sectionBreakdown` untouched.
**Warning signs:** Modal shows Profile Completeness first as well, or modal's prior-vs-current diff logic misaligns.

### Pitfall 5: Career Compass fallback ambiguity when LinkedIn prior is absent
**What goes wrong:** D-16 says "when resume exists but no LinkedIn → prompt user to choose." The main-path currently requires `linkedinPdfContent` (returns 400 at lines 572-577). If planner adds the auto-fetch but forgets the fallback branch, Pro/Elite users who haven't graded their LinkedIn will get a 400 error.
**Why it happens:** Input-validation block at lines 565-584 predates the auto-fetch plan.
**How to avoid:** Plan order: (1) auto-fetch priors, (2) if both present → short-circuit, (3) if one present → relax that side's input requirement and build prompt from the prior + the remaining upload, (4) if neither present → existing 400 path. Frontend D-16 badge ("add LinkedIn now or continue without?") gates option 3.
**Warning signs:** 400 errors with `"LinkedIn PDF content is required"` for users who have prior grades.

### Pitfall 6: `analysis_results` missing for Recruiting Lens Pro tier
**What goes wrong:** `recruiting-lens/index.ts:254` gates persistence on `resolvedTier === 'elite'`. Pro users who run Recruiting Lens have no row in `analysis_results`, so the timestamp-proximity matcher in History (D-20) finds nothing, and clicking the history entry cannot resolve an `id`.
**Why it happens:** BE-06/D-10/D-11 historical decision — Pro tier was never persisted.
**How to avoid:** Decide at plan time between: (a) route Pro tier history clicks to `/recruiting-lens` with no id (degraded but works — existing behavior pre-phase), (b) add Pro-tier `analysis_results` INSERT (scope creep; D-25 default = no schema work). Recommend (a).
**Warning signs:** Pro-tier Recruiting Lens history entries route to `/recruiting-lens` but show nothing; users see empty page.

## Runtime State Inventory

Not applicable — not a rename/refactor/migration phase.

## Environment Availability

No new external tools or services. All dependencies already in use. Skip.

## Security Domain

**Applies:** yes (user-scoped data access across 4 new query sites).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | Existing Supabase Auth; no change |
| V3 Session Management | yes | JWT in browser localStorage, auto-refresh — unchanged |
| V4 Access Control | **yes** | RLS on every new SELECT site. `linkedin_grades`, `analysis_results`, `interview_quizzes` all enforce `auth.uid() = user_id`. Planner must verify each new `.from(...).eq('id', id)` query relies on RLS — NOT on a second `.eq('user_id', userId)` (that would be belt-and-suspenders but safe) |
| V5 Input Validation | yes | `?id=` query param — validate as UUID before DB call. `zod.string().uuid()` via existing `zod` import |
| V6 Cryptography | no | No crypto changes |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| User forges `?id=` to view another user's analysis | Information Disclosure | RLS enforces `auth.uid() = user_id` at row level — cross-user reads return no rows. Planner MUST rely on RLS and add no client-side user-scoping (ineffective). |
| `?id=` not a valid UUID | Tampering | Parse with zod; show "Analysis not found" toast rather than propagating a DB error |
| Prompt injection via reused prior analyses (Career Compass main-path) | Tampering | `grading_data` in `linkedin_grades` and `grading_data` in `resumes` are emitted by `grade-linkedin` and `analyze-resume`, both of which sanitize user input before AI ingestion (`sanitizeUserContent` in `_shared/prompt-sanitizer.ts`). Reusing these JSONs is safe — they are already past the sanitization boundary |

### CLAUDE.md Alignment

- **"Preserve existing TypeScript and React patterns"** — Phase 22 extends existing patterns (BlurredLockCard, Promise.all prior fetch, `typeConfig`, proximity matcher). No new patterns introduced.
- **"Small, reversible changes"** — Every fix is a single file edit or small additive block. No broad rewrites.
- **"Keep production reliability ahead of experimental scaling"** — Pro/Elite paths remain byte-identical (D-24). No queueing or async changes.
- **"Avoid unnecessary abstractions when a single helper function is enough"** — D-03 mandates hardcoded placeholder constant array in `LinkedInGrader.tsx`; no shared file.

## Project Constraints (from CLAUDE.md)

- Never commit anything within `.planning/` or modify `.gitignore` — applies to this RESEARCH.md (planner must not `git add -f`).
- Frontend app code lives in `src/`; Supabase config/migrations/functions in `supabase/`.
- Prefer `rg` for searching; prefer `apply_patch` for focused edits.
- Frontend feature flags use `VITE_*`; backend secrets in Supabase secrets (not `.env`).
- Preserve existing TypeScript/React patterns.
- Keep user-facing error messages specific and operationally useful.
- GSD workflow enforcement — use `/gsd-execute-phase` for planned phase work.

## Code Examples

### Locked placeholder constant (D-03)
```tsx
// Source: Phase 15.2 pattern (src/pages/LinkedInGrader.tsx:864-866 for reference location; Phase 22 introduces new constant)
// Place at top of src/pages/LinkedInGrader.tsx, above the component
const LOCKED_FIXES_PLACEHOLDERS = [
  { title: 'Experience Improvement',    pointsGain: '+5 pts', currentText: '...', suggestedFix: '...', whyItWorks: '...' },
  { title: 'Skills Improvement',        pointsGain: '+4 pts', currentText: '...', suggestedFix: '...', whyItWorks: '...' },
  { title: 'About Section Refinement',  pointsGain: '+3 pts', currentText: '...', suggestedFix: '...', whyItWorks: '...' },
  { title: 'Headline Refinement #2',    pointsGain: '+3 pts', currentText: '...', suggestedFix: '...', whyItWorks: '...' },
] as const;
```
Planner finalizes the copy per UI-SPEC "Copywriting Contract" table rows.

### Merit-path usage_tracking INSERT (History fix, generic shape)
```ts
// Source: supabase/migrations/20260411000002_atomic_check_and_record_usage.sql:38-39
// Call inside the withMerits callback, AFTER AI success, BEFORE response.
// Uses the service client already in scope (getServiceClient()).
await getServiceClient().rpc('record_ai_usage', {
  p_user_id: userId,
  p_action_type: 'linkedin_grading', // or 'career_compass' / 'recruiting_lens' / 'interview_prep'
  p_credits: 1, // or 0 for free-scan carve-out
}).then(({ error }) => {
  if (error) log.error('usage-tracking-insert-failed', { error: String(error) });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `can_perform_ai_action` + `record_ai_usage` (2-step) | `check_and_record_ai_usage` (atomic) | Phase 4 CR-01, migration `20260411000002_...` | Eliminates TOCTOU race on usage counters |
| `checkAndRecordUsage` wrapper for all features | `withMerits` wrapper when `MERIT_SYSTEM_ENABLED=true` | Phase 13 D-01 onward | Introduces the History defect — merit path bypasses `usage_tracking` entirely |
| `resource_id` column on `usage_tracking` | Timestamp-proximity matcher in `AnalysisHistory.tsx:195-205` | Quick task 260416-vu1 (2026-04-17) | Avoids schema change; works for resumes; needs generalization for other 4 features (D-20) |

**Deprecated/outdated:**
- `scrapeLinkedInProfile` at `analyze-career/index.ts:326` — defined but never called. Out of scope; flag for future cleanup.
- `record_ai_action` RPC calls at `analyze-resume/index.ts:864, 1134` — RPC does not exist. Silent error. Pre-existing bug, flag for future cleanup.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `MERIT_SYSTEM_ENABLED=true` is the current production state | Diagnostic Resolution | If flag is still `false`, merit paths are never taken and History defect has a different root cause. Planner should verify with operator. Mitigation: even if legacy is live today, the merit cutover is imminent; fixing both paths is cheap insurance. |
| A2 | Operator's empty-History test was on a merit-path run (free-tier, MERIT flag on) | Diagnostic Resolution | If operator was on legacy path, the grade-linkedin free-scan carve-out (Pitfall 3) is the bug instead of the merit-path omission. Both fixes are independent; both are in scope. |
| A3 | `analysis_results where analysis_type='recruiting_lens'` exists only for Elite | Pattern 4, Pitfall 6 | Verified in source (`recruiting-lens/index.ts:254-266, 358-378`); very low risk. |
| A4 | Free-tier LinkedIn prompt already emits `profileInsights`/`keyStrengths`/`nextBestAction` | D-05 resolution | Verified in source (`grade-linkedin/prompts.ts:95-138`) — HIGH confidence. Planner should spot-check that `LinkedInGrader.tsx` actually renders these three fields for free users, not just that the data arrives. |
| A5 | `record_ai_usage(user_id, action_type, 1)` is safe to call standalone from merit path | Code Examples, Pitfall 2 | Verified: RPC is SECURITY DEFINER, inserts unconditionally into `usage_tracking`, returns boolean. Calling it outside the atomic `check_and_record` wrapper produces a bare audit row without entitlement check — correct behavior for the merit path (merit already enforced entitlement). |

## Open Questions (RESOLVED)

1. **Is `MERIT_SYSTEM_ENABLED=true` in production today?**
   - What we know: env flag read at cold start; controls which branch runs in all 5 features.
   - What's unclear: current production value.
   - Recommendation: Planner asks operator before finalizing History fix plan; fix both paths regardless (cheap insurance).
   - **RESOLVED:** Fix both merit-path AND legacy-path regardless of current flag value. Cheap insurance; planner adopts this without further operator input. See 22-04-PLAN.md Task 1 — `record_ai_usage` added to all 4 merit-path functions; legacy path `checkAndRecordUsage` calls left untouched.

2. **Should free-scan LinkedIn entries show `credits_consumed=0` or `credits_consumed=1`?**
   - What we know: current legacy behavior is NO row at all on free scan.
   - What's unclear: UX preference — does the History badge "0 credits" feel right, or should the row hide?
   - Recommendation: Write row with `credits_consumed=0`; History rendering already supports arbitrary integer values at `AnalysisHistory.tsx:278`. Label can be `"Free scan"` via a small conditional.
   - **RESOLVED:** Write row with `p_credits: 0` (free-scan carve-out). Implemented in 22-04-PLAN.md Task 1 site 2 (grade-linkedin free-scan-bypass branch). History page renders the `credits_consumed=0` value as-is; optional "Free scan" label tweak is deferred as a copy-only follow-up (out of scope for this phase).

3. **For Recruiting Lens Pro tier history click, degrade silently or surface a toast?**
   - What we know: No `analysis_results` row exists for Pro tier.
   - What's unclear: Does operator want a toast ("Open a fresh run to regenerate") or a silent route to `/recruiting-lens`?
   - Recommendation: Silent route to `/recruiting-lens` (no id). Match Resume Analysis behavior when `findResumeForEntry` returns null (currently `null` route → non-clickable card per `AnalysisHistory.tsx:280-286`).
   - **RESOLVED:** Adopted informational toast (`"This analysis wasn't saved — run a fresh match to regenerate."`) plus fresh-run fallback. This is a **deliberate reversal** of the researcher's silent-route recommendation — the toast gives users a clear reason the deep-link rendered the input view instead of silently dropping them on the fresh-scan screen with no explanation. See 22-05-PLAN.md Task 2 (RecruitingLens.tsx hydration — `toast.message(...)` on no-row). Frontend cost is one extra string; UX benefit (avoiding confused "did I click the wrong row?" feedback) justifies the reversal.

## Sources

### Primary (HIGH confidence)
- `supabase/functions/grade-linkedin/index.ts:214-333, 360-410, 530-546` — merit-path vs legacy-path usage tracking
- `supabase/functions/grade-linkedin/prompts.ts:24-144` — free-tier prompt schema including profileInsights/keyStrengths/nextBestAction
- `supabase/functions/analyze-career/index.ts:326-354, 480-698, 704-742, 790-897` — scrape function (dead), existing prior-analyses branch, main-path PDF extraction, response build
- `supabase/functions/recruiting-lens/index.ts:205-276, 278-282, 254-266` — merit vs legacy paths, Elite-only `analysis_results` persistence
- `supabase/functions/interview-prep-analyze/index.ts:1-60` — merit-only function, no legacy fallback, no usage_tracking call
- `supabase/functions/interview-prep-coach/index.ts:140-158` — legacy path writes usage_tracking
- `supabase/functions/analyze-resume/index.ts:864, 978, 1060, 1134, 1261, 1350` — multiple usage-recording call sites
- `supabase/functions/_shared/usage-checker.ts:1-82` — atomic checkAndRecordUsage wrapper
- `supabase/functions/_shared/merit-gateway.ts:27-119` — MERIT_SYSTEM_ENABLED branch control, no usage_tracking write
- `supabase/migrations/20251222220418_...:2-23, 148-170` — `ai_action_type` enum + `usage_tracking` table + `record_ai_usage` RPC
- `supabase/migrations/20260411000002_atomic_check_and_record_usage.sql:6-50` — atomic RPC with INSERT
- `supabase/migrations/20260409000002_add_recruiting_lens_ai_action_type.sql:6` — enum extension
- `supabase/migrations/20260411000001_add_interview_prep_ai_action_type.sql:5` — enum extension
- `supabase/migrations/20260417000000_usage_tracking_user_select_policy.sql:1-6` — RLS user SELECT
- `supabase/migrations/20251126120525_...:1-10` — `linkedin_grades` base schema
- `supabase/migrations/20251223075804_...:1-23` — `linkedin_grades.user_id` + RLS
- `supabase/migrations/20251222223116_...:1-20, 105-107` — `analysis_results` schema + RLS
- `supabase/migrations/20260418000000_interview_prep_tables.sql:18-88` — `interview_quizzes` + RLS
- `src/pages/LinkedInGrader.tsx:386, 629-654, 822-946, 948-1026` — container class, header-bar, Section Breakdown, topFixes
- `src/pages/Results.tsx:3, 206-210, 706` — `useSearchParams`/`useParams` reference, canonical container
- `src/pages/CareerCompass.tsx:540-595` — container class, missingPrior pattern
- `src/pages/RecruitingLens.tsx:400-478` — container class, page header
- `src/pages/AnalysisHistory.tsx:1-323` — full file; typeConfig, query, proximity matcher
- `src/components/BlurredLockCard.tsx` — referenced via CONTEXT; lock primitive
- `.planning/phases/22-linkedin-grader-ui-overhaul-cross-feature-memory-history/22-CONTEXT.md` — full decision ledger
- `.planning/phases/22-linkedin-grader-ui-overhaul-cross-feature-memory-history/22-UI-SPEC.md` — UI design contract
- `.planning/ROADMAP.md:358-381` — Phase 22 definition + 7 success criteria
- `CLAUDE.md` — project memory, reliability priorities, conventions

### Secondary
None. This phase has no external references.

### Tertiary
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library already in package.json; zero new installs.
- Architecture patterns: HIGH — every pattern has a specific file:line reference in existing code.
- Pitfalls: HIGH — each pitfall was observed directly in source during this session.
- Diagnostic resolution (D-18): HIGH — all 5 feature functions traced; `usage_tracking` INSERT sites enumerated with file:line.
- D-05 (free-tier LinkedIn prompt output): HIGH — verified by reading `prompts.ts:24-144` and cross-checking `stripLinkedInFreeTier` + validator.
- D-11 (analyze-career main path): HIGH — exact line ranges for guard, bypass, and response-injection sites identified.
- D-22 (per-page `?id=` hydration): HIGH — grep confirmed zero matches in 4 target files, Results.tsx confirmed as reference.

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (30 days — stable code area; no upstream library churn expected)
